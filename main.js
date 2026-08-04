/* Xiangqi - Chinese Chess for Kindle
   Game logic + UI binding, built on Wukong engine */

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
    var aiDepth = 3;
    var flip = 0;
    var selectedSquare = null;
    var clickLock = false;
    var lastMoveFrom = null;
    var lastMoveTo = null;
    var gameResult = '*';
    var aiThinking = false;

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
            log('Engine OK');
        } catch (e) {
            log('initEngine err: ' + (e && e.message ? e.message : e));
        }
    }

    function drawBoard() {
        if (!engine) return;
        var boardEl = document.getElementById('xiangqiboard');
        if (!boardEl) return;

        var html = '<table cellspacing="0"><tbody>';

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
                log('drawBoard moves err: ' + (e && e.message ? e.message : e));
            }
        }

        for (var displayRow = 0; displayRow < ROWS; displayRow++) {
            html += '<tr>';
            for (var file = 0; file < COLS; file++) {
                var actualRow = flip ? (ROWS - 1 - displayRow) : displayRow;
                var actualFile = flip ? (COLS - 1 - file) : file;
                var sq = squareFromCoord(actualRow, actualFile);
                var piece = engine.getPiece(sq);
                var classes = [];
                var cellContent = '';

                if (actualRow === 4 || actualRow === 5) {
                    classes.push('river-cell');
                    if (actualRow === 4 && (actualFile === 1 || actualFile === 2)) {
                        cellContent = '楚 河';
                    } else if (actualRow === 4 && (actualFile === 6 || actualFile === 7)) {
                        cellContent = '漢 界';
                    }
                }

                if (sq === lastMoveFrom) classes.push('last-move-from');
                if (sq === lastMoveTo) classes.push('last-move-to');
                if (sq === selectedSquare) classes.push('selected-cell');

                if (piece > 0) {
                    var pieceClass = isRed(piece) ? 'piece-red' : 'piece-black';
                    cellContent = '<span class="piece ' + pieceClass + '">' + pieceChar(piece) + '</span>';
                }

                if (selectedSquare !== null && sq !== selectedSquare && legalTargets[sq]) {
                    if (piece > 0) classes.push('legal-capture');
                    else classes.push('legal-move');
                }

                var classStr = classes.length ? ' class="' + classes.join(' ') + '"' : '';
                html += '<td' + classStr + ' id="sq_' + sq + '" onclick="tapSquare(' + sq + ')">' + cellContent + '</td>';
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
            log('tryMove err: ' + (e && e.message ? e.message : e));
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
            log('aiMove err: ' + (e && e.message ? e.message : e));
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

            hideScreen('menu-screen');
            hideScreen('game-over-screen');
            showScreen('board-screen');

            drawBoard();
            updateStatus();
            updatePgn();

            if (gameMode === 'ai-black') {
                setTimeout(aiMove, 200);
            }
        } catch (e) {
            log('newGame err: ' + (e && e.message ? e.message : e));
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

    function backToMenu() {
        hideScreen('board-screen');
        hideScreen('game-over-screen');
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
        try {
            initEngine();

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
            if (btnNew) btnNew.onclick = newGame;

            var btnUndo = document.getElementById('btn-undo');
            if (btnUndo) btnUndo.onclick = undoMove;

            var btnFlip = document.getElementById('btn-flip');
            if (btnFlip) btnFlip.onclick = flipBoard;

            var btnMenu = document.getElementById('btn-menu');
            if (btnMenu) btnMenu.onclick = backToMenu;

            var playAgain = document.getElementById('play-again-btn');
            if (playAgain) playAgain.onclick = newGame;

            var backMenu = document.getElementById('back-menu-btn');
            if (backMenu) backMenu.onclick = backToMenu;

            setDifficulty(3);

            if (engine) {
                drawBoard();
            }

            var statusEl = document.getElementById('status');
            if (statusEl) statusEl.textContent = 'Select mode to start';
        } catch (e) {
            log('init err: ' + (e && e.message ? e.message : e));
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
