/* Xiangqi - Chinese Chess for Kindle
   Game logic + UI binding, built on Wukong engine */

(function() {
    'use strict';

    // Piece encoding (matches Wukong engine)
    // 0=EMPTY, 1-7=RED, 8-14=BLACK
    var PIECE_CHARS = [
        '',     // 0 EMPTY
        '兵',   // 1 RED_PAWN
        '仕',   // 2 RED_ADVISOR
        '相',   // 3 RED_BISHOP
        '马',   // 4 RED_KNIGHT
        '炮',   // 5 RED_CANNON
        '车',   // 6 RED_ROOK
        '帅',   // 7 RED_KING
        '卒',   // 8 BLACK_PAWN
        '士',   // 9 BLACK_ADVISOR
        '象',   // 10 BLACK_BISHOP
        '马',   // 11 BLACK_KNIGHT
        '炮',   // 12 BLACK_CANNON
        '车',   // 13 BLACK_ROOK
        '将'    // 14 BLACK_KING
    ];

    var RED = 0;
    var BLACK = 1;
    var COLS = 9;
    var ROWS = 10;

    // Game state
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

    // Square mapping: square = (2 + displayRow) * 11 + (file + 1)
    function squareFromCoord(displayRow, file) {
        return (2 + displayRow) * 11 + (file + 1);
    }

    function pieceChar(piece) {
        return PIECE_CHARS[piece] || '';
    }

    function isRed(piece) {
        return piece >= 1 && piece <= 7;
    }

    // Helper: show/hide screens by toggling 'hidden' class via className
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

    // Error display
    function showError(msg) {
        var el = document.getElementById('error-log');
        if (el) {
            el.innerHTML += msg + '<br>';
        }
        var st = document.getElementById('status');
        if (st) st.textContent = 'ERR: ' + msg;
    }

    // Initialize engine
    function initEngine() {
        try {
            if (typeof Engine === 'undefined') {
                showError('Engine not loaded');
                return;
            }
            engine = new Engine();
            engine.setBoard(engine.START_FEN);
        } catch (e) {
            showError('initEngine: ' + (e && e.message ? e.message : e));
        }
    }

    // Render the board
    function drawBoard() {
        if (!engine) return;
        var boardEl = document.getElementById('xiangqiboard');
        if (!boardEl) return;

        var html = '<table cellspacing="0"><tbody>';

        // Pre-compute legal move targets ONCE
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
                showError('drawBoard moves: ' + (e && e.message ? e.message : e));
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

    // Handle square tap
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

    // Try to make a move
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
            showError('tryMove: ' + (e && e.message ? e.message : e));
        }
        return false;
    }

    // AI move
    function aiMove() {
        if (!engine || gameResult !== '*') return;
        aiThinking = true;
        document.getElementById('status').textContent = 'AI thinking...';

        try {
            // Use time-based search to avoid blocking too long
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
                // Fallback: pick first legal move
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
            showError('aiMove: ' + (e && e.message ? e.message : e));
        }
    }

    // Update status display
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

    // Update PGN display
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
        } catch (e) {
            // ignore
        }
    }

    // Check for game over
    function checkGameOver() {
        if (!engine) return;
        try {
            var moves = engine.generateLegalMoves();
            if (moves.length === 0) {
                var side = engine.getSide();
                gameResult = (side === RED) ? 'Black wins!' : 'Red wins!';
                showGameOver();
            }
        } catch (e) {
            // ignore
        }
    }

    // Show game over screen
    function showGameOver() {
        hideScreen('board-screen');
        showScreen('game-over-screen');
        var titleEl = document.getElementById('result-title');
        if (titleEl) titleEl.textContent = gameResult;
        updateStatus();
    }

    // New game
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
            showError('newGame: ' + (e && e.message ? e.message : e));
        }
    };

    // Undo move
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
        } catch (e) {
            // ignore
        }
    };

    // Flip board
    window.flipBoard = function() {
        flip ^= 1;
        drawBoard();
    };

    // Back to menu
    function backToMenu() {
        hideScreen('board-screen');
        hideScreen('game-over-screen');
        showScreen('menu-screen');
    }

    // Set AI difficulty
    function setDifficulty(depth) {
        aiDepth = depth;
        // Update button styles using getElementById only
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

    // Initialize
    function init() {
        try {
            initEngine();

            // Menu buttons
            var vsAiBtn = document.getElementById('vs-ai-btn');
            if (vsAiBtn) vsAiBtn.onclick = function() { gameMode = 'ai-red'; newGame(); };

            var vsAiBlackBtn = document.getElementById('vs-ai-black-btn');
            if (vsAiBlackBtn) vsAiBlackBtn.onclick = function() { gameMode = 'ai-black'; newGame(); };

            var twoPlayerBtn = document.getElementById('two-player-btn');
            if (twoPlayerBtn) twoPlayerBtn.onclick = function() { gameMode = 'two-player'; newGame(); };

            // Difficulty buttons - use getElementById, no querySelectorAll
            var diffEasy = document.getElementById('diff-easy-btn');
            if (diffEasy) diffEasy.onclick = function() { setDifficulty(1); };

            var diffMedium = document.getElementById('diff-medium-btn');
            if (diffMedium) diffMedium.onclick = function() { setDifficulty(3); };

            var diffHard = document.getElementById('diff-hard-btn');
            if (diffHard) diffHard.onclick = function() { setDifficulty(5); };

            // Game control buttons
            var btnNew = document.getElementById('btn-new');
            if (btnNew) btnNew.onclick = newGame;

            var btnUndo = document.getElementById('btn-undo');
            if (btnUndo) btnUndo.onclick = undoMove;

            var btnFlip = document.getElementById('btn-flip');
            if (btnFlip) btnFlip.onclick = flipBoard;

            var btnMenu = document.getElementById('btn-menu');
            if (btnMenu) btnMenu.onclick = backToMenu;

            // Game over buttons
            var playAgain = document.getElementById('play-again-btn');
            if (playAgain) playAgain.onclick = newGame;

            var backMenu = document.getElementById('back-menu-btn');
            if (backMenu) backMenu.onclick = backToMenu;

            // Set default difficulty
            setDifficulty(3);

            // Draw initial board
            if (engine) {
                drawBoard();
            }

            var statusEl = document.getElementById('status');
            if (statusEl) statusEl.textContent = 'Select mode to start';
        } catch (e) {
            showError('init: ' + (e && e.message ? e.message : e));
        }
    }

    // Start when DOM is ready - use DOMContentLoaded like KShips
    document.addEventListener('DOMContentLoaded', init);
})();
