/* Xiangqi - Chinese Chess for Kindle
   Canvas-based board rendering, pieces on intersections, ES5 only */

(function() {
    'use strict';

    var PIECE_CHARS = [
        '', '兵', '仕', '相', '马', '炮', '车', '帅',
        '卒', '士', '象', '马', '炮', '车', '将'
    ];

    var RED = 0;
    var BLACK = 1;
    var COLS = 9;
    var ROWS = 10;

    var engine = null;
    var gameMode = 'ai-red';
    var aiDepth = 1;
    var flip = 0;
    var selectedSquare = null;
    var clickLock = false;
    var lastMoveFrom = null;
    var lastMoveTo = null;
    var gameResult = '*';
    var aiThinking = false;
    var pgnVisible = false;
    var menuVisible = false;

    function squareFromCoord(displayRow, file) {
        return (2 + displayRow) * 11 + (file + 1);
    }

    function pieceChar(piece) {
        return PIECE_CHARS[piece] || '';
    }

    function isRed(piece) {
        return piece >= 1 && piece <= 7;
    }

    function showScreen(id) {
        var el = document.getElementById(id);
        if (el) el.className = el.className.replace('hidden', '').replace(/\s+/g, ' ');
    }

    function hideScreen(id) {
        var el = document.getElementById(id);
        if (el && el.className.indexOf('hidden') === -1) {
            el.className = (el.className + ' hidden').replace(/\s+/g, ' ');
        }
    }

    var debugLog = '';

    function log(msg) {
        debugLog += msg + '\n';
    }

    function showDebugPopup() {
        var existing = document.getElementById('debug-popup');
        if (existing) existing.parentNode.removeChild(existing);
        var popup = document.createElement('div');
        popup.id = 'debug-popup';
        popup.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;background:#fff;border:2px solid #000;padding:12px;font-size:14px;z-index:99999;max-height:80%;overflow:auto;white-space:pre-wrap;';
        popup.innerHTML = '<b>Debug Info</b>\n\n' + (debugLog || '(empty)') + '\n\n<button id="debug-close" style="margin-top:10px;padding:8px 20px;font-size:16px;">Close</button>';
        document.body.appendChild(popup);
        var closeBtn = document.getElementById('debug-close');
        if (closeBtn) closeBtn.onclick = function() {
            popup.parentNode.removeChild(popup);
        };
    }

    function initEngine() {
        try {
            if (typeof Engine === 'undefined') {
                log('ERROR: Engine not loaded');
                return;
            }
            engine = new Engine();
            engine.setBoard(engine.START_FEN);
        } catch (e) {
            log('initEngine: ' + (e && e.message ? e.message : e));
        }
    }

    /* Canvas-based board rendering.
       Single <canvas> element - fast on Kindle's old WebKit.
       All drawing (grid, pieces, dots, rings) done on canvas.
       Click handling via single canvas onclick.

       Board size is calculated from the actual screen width so the
       canvas always fits without CSS scaling (unreliable on old WebKit). */

    var CELL, PAD, PIECE_R, CW, CH;

    function calcBoardSize() {
        /* Determine available screen space. On Kindle Paperwhite:
           screen = 758x1024.
           Board needs 8*CELL + 2*PAD wide, 9*CELL + 2*PAD tall.
           PAD must be >= PIECE_R so edge pieces aren't clipped.
           PIECE_R = CELL * 0.42, PAD = PIECE_R + 3 (small margin).
           So width  = 8.84*CELL + 6, height = 9.84*CELL + 6.
           Use 95% of screen for system UI safety margin. */
        var sw = screen.width || 758;
        var sh = screen.height || 1024;
        var availW = Math.floor(sw * 0.95);
        var availH = Math.floor((sh - 30) * 0.95); /* status bar ~30px */
        var cellByW = (availW - 6) / 8.84;
        var cellByH = (availH - 6) / 9.84;
        CELL = Math.floor(Math.min(cellByW, cellByH));
        PIECE_R = Math.floor(CELL * 0.42);
        PAD = PIECE_R + 3; /* ensure pieces at edges aren't clipped */
        CW = 8 * CELL + 2 * PAD;
        CH = 9 * CELL + 2 * PAD;
    }

    function ix(col) { return PAD + col * CELL; }
    function iy(row) { return PAD + row * CELL; }

    function drawBoard() {
        if (!engine) return;
        var boardEl = document.getElementById('xiangqiboard');
        if (!boardEl) return;

        /* Calculate board size to fit current screen */
        calcBoardSize();

        /* Pre-compute legal move targets */
        var legalTargets = {};
        if (selectedSquare !== null) {
            try {
                var legalMoves = engine.generateLegalMoves();
                for (var i = 0; i < legalMoves.length; i++) {
                    var mv = legalMoves[i].move;
                    if (engine.getSourceSquare(mv) === selectedSquare) {
                        legalTargets[engine.getTargetSquare(mv)] = true;
                    }
                }
            } catch (e) {
                log('drawBoard: ' + (e && e.message ? e.message : e));
            }
        }

        /* Create canvas once, reuse on redraws */
        var canvas = document.getElementById('xq-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'xq-canvas';
            canvas.width = CW;
            canvas.height = CH;
            canvas.style.display = 'block';
            canvas.style.margin = '0 auto';
            canvas.style.cursor = 'pointer';
            canvas.onclick = handleCanvasClick;
            boardEl.innerHTML = '';
            boardEl.appendChild(canvas);
        }

        var ctx = canvas.getContext('2d');
        if (!ctx) {
            log('Canvas 2d context not available');
            return;
        }

        /* Clear */
        ctx.clearRect(0, 0, CW, CH);

        /* 1. Board background */
        ctx.fillStyle = '#f5edd6';
        ctx.fillRect(PAD, PAD, 8 * CELL, 9 * CELL);

        /* 2. Grid lines */
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'square';

        /* Horizontal lines (10 lines, full width) */
        for (var row = 0; row < 10; row++) {
            ctx.beginPath();
            ctx.moveTo(ix(0), iy(row));
            ctx.lineTo(ix(8), iy(row));
            ctx.stroke();
        }

        /* Vertical lines (9 lines; inner 7 break at river) */
        for (var col = 0; col < 9; col++) {
            if (col === 0 || col === 8) {
                ctx.beginPath();
                ctx.moveTo(ix(col), iy(0));
                ctx.lineTo(ix(col), iy(9));
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(ix(col), iy(0));
                ctx.lineTo(ix(col), iy(4));
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(ix(col), iy(5));
                ctx.lineTo(ix(col), iy(9));
                ctx.stroke();
            }
        }

        /* 3. Palace diagonals */
        ctx.beginPath();
        ctx.moveTo(ix(3), iy(0)); ctx.lineTo(ix(5), iy(2));
        ctx.moveTo(ix(5), iy(0)); ctx.lineTo(ix(3), iy(2));
        ctx.moveTo(ix(3), iy(7)); ctx.lineTo(ix(5), iy(9));
        ctx.moveTo(ix(5), iy(7)); ctx.lineTo(ix(3), iy(9));
        ctx.stroke();

        /* 4. River text */
        ctx.fillStyle = '#888';
        ctx.font = Math.floor(CELL * 0.22) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var riverY = (iy(4) + iy(5)) / 2;
        ctx.fillText('\u695A \u6CB3', ix(2), riverY);
        ctx.fillText('\u6F22 \u754C', ix(6), riverY);

        /* 5. Pieces, dots, rings, markers */
        for (var displayRow = 0; displayRow < ROWS; displayRow++) {
            for (var file = 0; file < COLS; file++) {
                var actualRow = flip ? (ROWS - 1 - displayRow) : displayRow;
                var actualFile = flip ? (COLS - 1 - file) : file;
                var sq = squareFromCoord(actualRow, actualFile);
                var piece = engine.getPiece(sq);
                var cx = ix(file);
                var cy = iy(displayRow);

                if (piece > 0) {
                    var isRedPiece = isRed(piece);

                    /* Piece circle */
                    ctx.beginPath();
                    ctx.arc(cx, cy, PIECE_R, 0, 2 * Math.PI);
                    ctx.fillStyle = (sq === selectedSquare) ? '#ccc' : (isRedPiece ? '#fff' : '#000');
                    ctx.fill();
                    ctx.strokeStyle = isRedPiece ? '#c00' : '#000';
                    ctx.lineWidth = 2.5;
                    ctx.stroke();

                    /* Inner ring (decorative) */
                    ctx.beginPath();
                    ctx.arc(cx, cy, PIECE_R - 5, 0, 2 * Math.PI);
                    ctx.strokeStyle = isRedPiece ? '#c00' : '#000';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    /* Piece text - black pieces rotated 180° in two-player mode */
                    ctx.fillStyle = isRedPiece ? '#c00' : '#fff';
                    ctx.font = 'bold ' + Math.floor(CELL * 0.48) + 'px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    if (!isRedPiece && gameMode === 'two-player') {
                        ctx.save();
                        ctx.translate(cx, cy);
                        ctx.rotate(Math.PI);
                        ctx.fillText(pieceChar(piece), 0, 0);
                        ctx.restore();
                    } else {
                        ctx.fillText(pieceChar(piece), cx, cy);
                    }

                    /* Capture ring on enemy piece */
                    if (selectedSquare !== null && sq !== selectedSquare && legalTargets[sq]) {
                        ctx.beginPath();
                        ctx.arc(cx, cy, PIECE_R + 4, 0, 2 * Math.PI);
                        ctx.strokeStyle = '#c00';
                        ctx.lineWidth = 3;
                        ctx.stroke();
                    }

                    /* Highlight last moved piece with thick green ring */
                    if (sq === lastMoveTo) {
                        ctx.beginPath();
                        ctx.arc(cx, cy, PIECE_R + 8, 0, 2 * Math.PI);
                        ctx.strokeStyle = '#0a0';
                        ctx.lineWidth = 6;
                        ctx.stroke();
                    }
                } else if (selectedSquare !== null && sq !== selectedSquare && legalTargets[sq]) {
                    /* Legal move dot */
                    ctx.beginPath();
                    ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
                    ctx.fillStyle = '#555';
                    ctx.fill();
                } else if (sq === lastMoveFrom) {
                    /* Last move origin marker */
                    ctx.beginPath();
                    ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
                    ctx.fillStyle = '#999';
                    ctx.fill();
                }
            }
        }
    }

    /* Single click handler for the entire canvas.
       Calculates which intersection was clicked and calls tapSquare. */
    function handleCanvasClick(e) {
        if (!engine || aiThinking || gameResult !== '*') return;

        /* Get click coordinates relative to canvas.
           Use offsetLeft/offsetTop for old WebKit compatibility. */
        var canvas = document.getElementById('xq-canvas');
        if (!canvas) return;

        var x, y;
        if (e.offsetX !== undefined) {
            x = e.offsetX;
            y = e.offsetY;
        } else if (e.layerX !== undefined) {
            x = e.layerX - canvas.offsetLeft;
            y = e.layerY - canvas.offsetTop;
        } else {
            /* Fallback: calculate from page coordinates */
            var obj = canvas;
            var offX = 0, offY = 0;
            while (obj) {
                offX += obj.offsetLeft;
                offY += obj.offsetTop;
                obj = obj.offsetParent;
            }
            x = e.pageX - offX;
            y = e.pageY - offY;
        }

        /* Find nearest intersection */
        var col = Math.round((x - PAD) / CELL);
        var row = Math.round((y - PAD) / CELL);

        /* Clamp to board bounds */
        if (col < 0) col = 0;
        if (col > 8) col = 8;
        if (row < 0) row = 0;
        if (row > 9) row = 9;

        /* Convert display coordinates to actual square (account for flip) */
        var actualRow = flip ? (ROWS - 1 - row) : row;
        var actualFile = flip ? (COLS - 1 - col) : col;
        var sq = squareFromCoord(actualRow, actualFile);

        tapSquare(sq);
    }

    window.tapSquare = function(sq) {
        if (!engine || aiThinking || gameResult !== '*') return;

        var piece = engine.getPiece(sq);
        var side = engine.getSide();

        if (gameMode === 'ai-red' && side === BLACK) return;
        if (gameMode === 'ai-black' && side === RED) return;

        if (!clickLock && piece > 0) {
            var pieceSide = isRed(piece) ? RED : BLACK;
            if (pieceSide === side) {
                selectedSquare = sq;
                clickLock = true;
                drawBoard();
            }
        } else if (clickLock) {
            var valid = tryMove(selectedSquare, sq);
            selectedSquare = null;
            clickLock = false;
            if (valid) {
                drawBoard();
                updateStatus();
                updatePgn();
                checkGameOver();
                if (gameResult === '*' && gameMode !== 'two-player') {
                    setTimeout(aiMove, 100);
                }
            } else {
                drawBoard();
            }
        }
    };

    function tryMove(fromSq, toSq) {
        try {
            var legalMoves = engine.generateLegalMoves();
            for (var i = 0; i < legalMoves.length; i++) {
                var mv = legalMoves[i].move;
                if (engine.getSourceSquare(mv) === fromSq && engine.getTargetSquare(mv) === toSq) {
                    engine.makeMove(mv);
                    lastMoveFrom = fromSq;
                    lastMoveTo = toSq;
                    return true;
                }
            }
        } catch (e) {
            log('tryMove: ' + (e && e.message ? e.message : e));
        }
        return false;
    }

    function aiMove() {
        if (!engine || gameResult !== '*') return;
        aiThinking = true;
        var st = document.getElementById('status');
        if (st) st.textContent = 'AI thinking...';

        try {
            var bestMove = 0;
            var tc = engine.getTimeControl();
            tc.timeSet = 1;
            tc.time = 3000;
            tc.stopTime = new Date().getTime() + 2000;
            engine.setTimeControl(tc);

            bestMove = engine.search(aiDepth);

            if (bestMove !== 0) {
                /* Add randomness: with 30% chance, pick a random legal move
                   instead of the best one, so AI doesn't always respond the same */
                if (Math.random() < 0.3) {
                    var allMoves = engine.generateLegalMoves();
                    if (allMoves.length > 1) {
                        bestMove = allMoves[Math.floor(Math.random() * allMoves.length)].move;
                    }
                }
                lastMoveFrom = engine.getSourceSquare(bestMove);
                lastMoveTo = engine.getTargetSquare(bestMove);
                engine.makeMove(bestMove);
            } else {
                var moves = engine.generateLegalMoves();
                if (moves.length > 0) {
                    bestMove = moves[0].move;
                    lastMoveFrom = engine.getSourceSquare(bestMove);
                    lastMoveTo = engine.getTargetSquare(bestMove);
                    engine.makeMove(bestMove);
                }
            }

            aiThinking = false;
            drawBoard();
            updateStatus();
            updatePgn();
            checkGameOver();
        } catch (e) {
            aiThinking = false;
            log('aiMove: ' + (e && e.message ? e.message : e));
        }
    }

    function updateStatus() {
        if (!engine) return;
        var side = engine.getSide();
        var statusEl = document.getElementById('status');
        if (statusEl) {
            if (gameResult !== '*') {
                statusEl.textContent = gameResult;
            } else {
                statusEl.textContent = (side === RED ? 'Red' : 'Black') + ' to move';
            }
        }
    }

    function updatePgn() {
        if (!engine) return;
        try {
            var moveStack = engine.moveStack();
            var pgn = '';
            for (var i = 0; i < moveStack.length; i++) {
                var move = moveStack[i].move;
                var moveStr = engine.moveToString(move);
                var moveNum = (i % 2 === 0) ? (Math.floor(i / 2) + 1) + '. ' : '';
                pgn += moveNum + moveStr + ' ';
            }
            var pgnEl = document.getElementById('pgn');
            if (pgnEl) {
                pgnEl.value = pgn;
                pgnEl.scrollTop = pgnEl.scrollHeight;
            }
        } catch (e) {}
    }

    function checkGameOver() {
        if (!engine) return;
        try {
            var moves = engine.generateLegalMoves();
            if (moves.length === 0) {
                var side = engine.getSide();
                gameResult = (side === RED) ? 'Black wins!' : 'Red wins!';
                hideScreen('board-screen');
                showScreen('game-over-screen');
                var titleEl = document.getElementById('result-title');
                if (titleEl) titleEl.textContent = gameResult;
                updateStatus();
            }
        } catch (e) {}
    }

    window.newGame = function() {
        if (!engine) return;
        try {
            engine.setBoard(engine.START_FEN);
            selectedSquare = null;
            clickLock = false;
            lastMoveFrom = null;
            lastMoveTo = null;
            gameResult = '*';
            aiThinking = false;
            pgnVisible = false;
            menuVisible = false;

            hideScreen('menu-screen');
            hideScreen('game-over-screen');
            hideScreen('game-menu');
            hideScreen('move-history-wrap');
            showScreen('board-screen');

            var pgnBtn = document.getElementById('btn-pgn');
            if (pgnBtn) pgnBtn.textContent = 'Show Moves';

            drawBoard();
            updateStatus();
            updatePgn();

            if (gameMode === 'ai-black') {
                setTimeout(aiMove, 200);
            }
        } catch (e) {
            log('newGame: ' + (e && e.message ? e.message : e));
        }
    };

    window.undoMove = function() {
        if (!engine || aiThinking) return;
        try {
            var undoCount = (gameMode !== 'two-player') ? 2 : 1;
            for (var i = 0; i < undoCount; i++) {
                engine.takeBack();
            }
            selectedSquare = null;
            clickLock = false;
            lastMoveFrom = null;
            lastMoveTo = null;
            gameResult = '*';
            hideScreen('game-over-screen');
            showScreen('board-screen');
            drawBoard();
            updateStatus();
            updatePgn();
        } catch (e) {}
    };

    window.flipBoard = function() {
        flip ^= 1;
        drawBoard();
    };

    window.toggleMenu = function() {
        menuVisible = !menuVisible;
        if (menuVisible) {
            showScreen('game-menu');
        } else {
            hideScreen('game-menu');
        }
    };

    function togglePgn() {
        pgnVisible = !pgnVisible;
        if (pgnVisible) {
            showScreen('move-history-wrap');
            var pgnBtn = document.getElementById('btn-pgn');
            if (pgnBtn) pgnBtn.textContent = 'Hide Moves';
        } else {
            hideScreen('move-history-wrap');
            var pgnBtn2 = document.getElementById('btn-pgn');
            if (pgnBtn2) pgnBtn2.textContent = 'Show Moves';
        }
    }

    function backToMenu() {
        hideScreen('board-screen');
        hideScreen('game-over-screen');
        hideScreen('game-menu');
        showScreen('menu-screen');
    }

    function setDifficulty(depth) {
        aiDepth = depth;
        var btns = ['diff-easy-btn', 'diff-medium-btn', 'diff-hard-btn'];
        for (var i = 0; i < btns.length; i++) {
            var btn = document.getElementById(btns[i]);
            if (btn) {
                var d = parseInt(btn.getAttribute('data-depth'), 10);
                if (d === depth) {
                    btn.className = 'diff-btn selected';
                } else {
                    btn.className = 'diff-btn';
                }
            }
        }
    }

    function init() {
        log('init called');
        /* Bind buttons FIRST - before engine init, so UI works even if engine crashes */
        try {
            var vsAiBtn = document.getElementById('vs-ai-btn');
            if (vsAiBtn) vsAiBtn.onclick = function() { gameMode = 'ai-red'; newGame(); };

            var vsAiBlackBtn = document.getElementById('vs-ai-black-btn');
            if (vsAiBlackBtn) vsAiBlackBtn.onclick = function() { gameMode = 'ai-black'; newGame(); };

            var twoPlayerBtn = document.getElementById('two-player-btn');
            if (twoPlayerBtn) twoPlayerBtn.onclick = function() { gameMode = 'two-player'; newGame(); };

            var diffEasy = document.getElementById('diff-easy-btn');
            if (diffEasy) diffEasy.onclick = function() { setDifficulty(1); };

            var diffMedium = document.getElementById('diff-medium-btn');
            if (diffMedium) diffMedium.onclick = function() { setDifficulty(3); };

            var diffHard = document.getElementById('diff-hard-btn');
            if (diffHard) diffHard.onclick = function() { setDifficulty(5); };

            var btnNew = document.getElementById('btn-new');
            if (btnNew) btnNew.onclick = function() { toggleMenu(); newGame(); };

            var btnUndo = document.getElementById('btn-undo');
            if (btnUndo) btnUndo.onclick = function() { toggleMenu(); undoMove(); };

            var btnFlip = document.getElementById('btn-flip');
            if (btnFlip) btnFlip.onclick = function() { toggleMenu(); flipBoard(); };

            var btnPgn = document.getElementById('btn-pgn');
            if (btnPgn) btnPgn.onclick = function() { togglePgn(); };

            var btnDebug = document.getElementById('btn-debug');
            if (btnDebug) btnDebug.onclick = function() { toggleMenu(); showDebugPopup(); };

            var btnMenu = document.getElementById('btn-menu');
            if (btnMenu) btnMenu.onclick = function() { toggleMenu(); backToMenu(); };

            var playAgain = document.getElementById('play-again-btn');
            if (playAgain) playAgain.onclick = newGame;

            var backMenu = document.getElementById('back-menu-btn');
            if (backMenu) backMenu.onclick = backToMenu;

            setDifficulty(1);
            log('buttons bound, difficulty set');
        } catch (e) {
            log('init buttons: ' + (e && e.message ? e.message : e));
        }

        /* Init engine separately - if this fails, buttons still work */
        try {
            initEngine();
            if (engine) {
                drawBoard();
                log('engine ok, board drawn');
            } else {
                log('engine is null');
            }
        } catch (e) {
            log('init engine: ' + (e && e.message ? e.message : e));
        }
    }

    var initCalled = false;
    function safeInit() {
        if (initCalled) return;
        initCalled = true;
        init();
    }

    document.addEventListener('DOMContentLoaded', safeInit);
    safeInit();
})();
