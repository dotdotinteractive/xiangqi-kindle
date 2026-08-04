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

        var html = '<table cellspacing="0" cellpadding="0"><tbody>';

        for (var displayRow = 0; displayRow < ROWS; displayRow++) {
            html += '<tr>';
            for (var file = 0; file < COLS; file++) {
                var actualRow = flip ? (ROWS - 1 - displayRow) : displayRow;
                var actualFile = flip ? (COLS - 1 - file) : file;
                var sq = squareFromCoord(actualRow, actualFile);
                var piece = engine.getPiece(sq);

                /* Cell classes for border drawing */
                var classes = 'col' + file + ' row' + displayRow;

                /* Cell content */
                var content = '';

                /* River text in middle rows */
                if (displayRow === 4 && file === 1) {
                    content += '<span class="river-text">楚 河</span>';
                } else if (displayRow === 4 && file === 6) {
                    content += '<span class="river-text">漢 界</span>';
                }

                }

                /* Piece */
                if (piece > 0) {
                    var pieceClass = isRed(piece) ? 'xq-piece-red' : 'xq-piece-black';
                    var pieceExtra = '';
                    if (sq === selectedSquare) pieceExtra += ' xq-selected';
                    if (sq === lastMoveFrom || sq === lastMoveTo) pieceExtra += ' xq-last';
                    content += '<span class="xq-piece ' + pieceClass + pieceExtra + '">' + pieceChar(piece) + '</span>';
                    /* If this is a legal capture target, add ring */
                    if (selectedSquare !== null && sq !== selectedSquare && legalTargets[sq]) {
                        content += '<span class="xq-ring"></span>';
                    }
                } else if (selectedSquare !== null && sq !== selectedSquare && legalTargets[sq]) {
                    /* Legal move dot on empty intersection */
                    content += '<span class="xq-dot"></span>';
                } else if (sq === lastMoveFrom || sq === lastMoveTo) {
                    content += '<span class="xq-dot" style="background:#999;opacity:0.3;"></span>';
                }

                html += '<td class="' + classes + '" onclick="tapSquare(' + sq + ')">' + content + '</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        boardEl.innerHTML = html;
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
