/* Xiangqi - Chinese Chess for Kindle
   Table-based board rendering, pieces on intersections, ES5 only */

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

    function log(msg) {
        var el = document.getElementById('error-log');
        if (el) el.innerHTML += msg + '<br>';
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

    /* Draw the board as a table.
       Each cell = one intersection point.
       Grid lines via CSS borders.
       Palace diagonals drawn as positioned div lines. */
    function drawBoard() {
        if (!engine) return;
        var boardEl = document.getElementById('xiangqiboard');
        if (!boardEl) return;

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

        /* All-absolute-positioning board. No CSS layout, no tables.
           Everything is a div with inline style coordinates.

           Coordinate system: intersection (col,row) is at pixel:
             x = ORIGIN + col * CELL
             y = ORIGIN + row * CELL
           where ORIGIN = CELL/2 (half cell margin inside container). */

        var CELL = 114;           /* distance between intersections */
        var HALF = 57;            /* CELL / 2 */
        var PIECE = 95;           /* piece diameter */
        var POFF = 47.5;          /* PIECE / 2 */
        var NLINES = 9;           /* vertical lines (cols 0-8) */
        var HLINES = 10;          /* horizontal lines (rows 0-9) */
        var BW = 8 * CELL;        /* board width = 912 */
        var BH = 9 * CELL;        /* board height = 1026 */
        var CW = BW + CELL;       /* container width = 1026 */
        var CH = BH + CELL;       /* container height = 1140 */
        var DIAG = 2 * CELL * 1.4142; /* diagonal length ≈ 322 */

        /* Intersection pixel coordinates */
        function ix(col) { return HALF + col * CELL; }
        function iy(row) { return HALF + row * CELL; }

        var h = '';

        /* Set container dimensions */
        boardEl.style.position = 'relative';
        boardEl.style.width = CW + 'px';
        boardEl.style.height = CH + 'px';
        boardEl.style.margin = '0 auto';
        boardEl.style.padding = '0';

        /* 1. Board background (tan) */
        h += '<div style="position:absolute;left:' + HALF + 'px;top:' + HALF + 'px;width:' + BW + 'px;height:' + BH + 'px;background:#f5edd6;"></div>';

        /* 2. Horizontal lines (10 lines, full width, 2px thick) */
        for (var row = 0; row < HLINES; row++) {
            h += '<div style="position:absolute;left:' + HALF + 'px;top:' + (iy(row) - 1) + 'px;width:' + BW + 'px;height:2px;background:#000;"></div>';
        }

        /* 3. Vertical lines (9 lines)
              Outer (col 0, col 8): full height
              Inner (col 1-7): break at river (row 4 to row 5) */
        for (var col = 0; col < NLINES; col++) {
            var lx = ix(col) - 1;
            if (col === 0 || col === NLINES - 1) {
                h += '<div style="position:absolute;left:' + lx + 'px;top:' + HALF + 'px;width:2px;height:' + BH + 'px;background:#000;"></div>';
            } else {
                var topH = 4 * CELL;
                var botY = iy(5);
                var botH = 4 * CELL;
                h += '<div style="position:absolute;left:' + lx + 'px;top:' + HALF + 'px;width:2px;height:' + topH + 'px;background:#000;"></div>';
                h += '<div style="position:absolute;left:' + lx + 'px;top:' + botY + 'px;width:2px;height:' + botH + 'px;background:#000;"></div>';
            }
        }

        /* 4. Palace diagonals (X in top and bottom 3x3 palace)
              Top: cols 3-5, rows 0-2. Bottom: cols 3-5, rows 7-9.
              Each diagonal: 2 cells = 228px, length = 228*sqrt(2) ≈ 322px
              Rotated 45deg from intersection point. */
        function diag(x, y, deg) {
            return '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + DIAG + 'px;height:2px;background:#000;-webkit-transform-origin:0 0;transform-origin:0 0;-webkit-transform:rotate(' + deg + 'deg);transform:rotate(' + deg + 'deg);"></div>';
        }
        /* Top palace: (3,0)->(5,2) = 45deg, (5,0)->(3,2) = -45deg */
        h += diag(ix(3), iy(0), 45);
        h += diag(ix(5), iy(0), -45);
        /* Bottom palace: (3,7)->(5,9) = 45deg, (5,7)->(3,9) = -45deg */
        h += diag(ix(3), iy(7), 45);
        h += diag(ix(5), iy(7), -45);

        /* 5. River text (between row 4 and row 5, centered in each half) */
        var riverY = iy(4) + HALF; /* midpoint of river */
        h += '<div style="position:absolute;left:' + (ix(2) - 50) + 'px;top:' + (riverY - 14) + 'px;width:100px;text-align:center;font-size:27px;color:#888;pointer-events:none;">楚 河</div>';
        h += '<div style="position:absolute;left:' + (ix(6) - 50) + 'px;top:' + (riverY - 14) + 'px;width:100px;text-align:center;font-size:27px;color:#888;pointer-events:none;">漢 界</div>';

        /* 6. Pieces, dots, rings, markers, and click areas */
        for (var displayRow = 0; displayRow < ROWS; displayRow++) {
            for (var file = 0; file < COLS; file++) {
                var actualRow = flip ? (ROWS - 1 - displayRow) : displayRow;
                var actualFile = flip ? (COLS - 1 - file) : file;
                var sq = squareFromCoord(actualRow, actualFile);
                var piece = engine.getPiece(sq);

                var cx = ix(file);
                var cy = iy(displayRow);

                /* Click area (invisible, centered on intersection) */
                h += '<div style="position:absolute;left:' + (cx - HALF) + 'px;top:' + (cy - HALF) + 'px;width:' + CELL + 'px;height:' + CELL + 'px;cursor:pointer;" onclick="tapSquare(' + sq + ')"></div>';

                if (piece > 0) {
                    var isRedPiece = isRed(piece);
                    /* Red pieces shifted down 5px from intersection center */
                    var pTop = cy - POFF + (isRedPiece ? 5 : 0);
                    var pLeft = cx - POFF;
                    var bg = isRedPiece ? '#fff' : '#000';
                    var clr = isRedPiece ? '#c00' : '#fff';
                    var bdr = isRedPiece ? '#c00' : '#000';
                    var selBg = (sq === selectedSquare) ? 'background:#ccc;' : 'background:' + bg + ';';
                    h += '<div style="position:absolute;left:' + pLeft + 'px;top:' + pTop + 'px;width:' + PIECE + 'px;height:' + PIECE + 'px;line-height:85px;text-align:center;font-size:53px;font-weight:bold;border-radius:50%;border:3px solid ' + bdr + ';box-sizing:border-box;' + selBg + 'color:' + clr + ';z-index:2;">' + pieceChar(piece) + '</div>';

                    if (selectedSquare !== null && sq !== selectedSquare && legalTargets[sq]) {
                        /* Capture ring */
                        h += '<div style="position:absolute;left:' + (cx - 51) + 'px;top:' + (cy - 51) + 'px;width:102px;height:102px;border-radius:50%;border:4px solid #c00;z-index:1;"></div>';
                    }
                } else if (selectedSquare !== null && sq !== selectedSquare && legalTargets[sq]) {
                    /* Legal move dot */
                    h += '<div style="position:absolute;left:' + (cx - 13.5) + 'px;top:' + (cy - 13.5) + 'px;width:27px;height:27px;border-radius:50%;background:#555;opacity:0.5;z-index:1;"></div>';
                } else if (sq === lastMoveFrom || sq === lastMoveTo) {
                    /* Last move marker */
                    h += '<div style="position:absolute;left:' + (cx - 13.5) + 'px;top:' + (cy - 13.5) + 'px;width:27px;height:27px;border-radius:50%;background:#999;opacity:0.3;z-index:1;"></div>';
                }
            }
        }

        boardEl.innerHTML = h;
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
