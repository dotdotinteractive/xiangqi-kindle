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

    // Board dimensions
    var COLS = 9;
    var ROWS = 10;

    // Square mapping: square = (2 + displayRow) * 11 + (file + 1)
    // displayRow 0 = rank 9 (top, black), displayRow 9 = rank 0 (bottom, red)
    function squareFromCoord(displayRow, file) {
        return (2 + displayRow) * 11 + (file + 1);
    }

    function coordFromSquare(sq) {
        var mailboxRow = Math.floor(sq / 11);
        var file = (sq % 11) - 1;
        var displayRow = mailboxRow - 2;
        return { row: displayRow, file: file };
    }

    // Game state
    var engine = null;
    var gameMode = 'ai-red';  // 'ai-red', 'ai-black', 'two-player'
    var aiDepth = 3;
    var flip = 0;
    var selectedSquare = null;
    var clickLock = false;
    var lastMoveFrom = null;
    var lastMoveTo = null;
    var gameResult = '*';
    var aiThinking = false;

    // Initialize engine
    function initEngine() {
        if (typeof Engine !== 'undefined') {
            engine = new Engine();
            engine.setBoard(engine.START_FEN);
        } else {
            // Fallback: engine not loaded
            document.getElementById('status').textContent = 'Engine not loaded!';
        }
    }

    // Get piece character for display
    function pieceChar(piece) {
        return PIECE_CHARS[piece] || '';
    }

    // Check if piece is red
    function isRed(piece) {
        return piece >= 1 && piece <= 7;
    }

    // Check if piece is black
    function isBlack(piece) {
        return piece >= 8 && piece <= 14;
    }

    // Get side to move
    function sideToMove() {
        return engine.getSide();
    }

    // Render the board
    function drawBoard() {
        if (!engine) return;

        var boardEl = document.getElementById('xiangqiboard');
        var html = '<table cellspacing="0"><tbody>';

        // Pre-compute legal move targets ONCE (not per cell)
        var legalTargets = {};
        if (selectedSquare !== null) {
            var legalMoves = engine.generateLegalMoves();
            for (var i = 0; i < legalMoves.length; i++) {
                var mv = legalMoves[i].move;
                if (engine.getSourceSquare(mv) === selectedSquare) {
                    var tgt = engine.getTargetSquare(mv);
                    legalTargets[tgt] = true;
                }
            }
        }

        for (var displayRow = 0; displayRow < ROWS; displayRow++) {
            html += '<tr>';

            for (var file = 0; file < COLS; file++) {
                // Apply flip
                var actualRow = flip ? (ROWS - 1 - displayRow) : displayRow;
                var actualFile = flip ? (COLS - 1 - file) : file;

                var sq = squareFromCoord(actualRow, actualFile);
                var piece = engine.getPiece(sq);

                var classes = [];
                var cellContent = '';

                // River row (between rank 4 and rank 5, display rows 4 and 5)
                if (actualRow === 4 || actualRow === 5) {
                    classes.push('river-cell');
                    // Add river text on the middle columns
                    if (actualRow === 4 && (actualFile === 1 || actualFile === 2)) {
                        cellContent = '楚 河';
                    } else if (actualRow === 4 && (actualFile === 6 || actualFile === 7)) {
                        cellContent = '漢 界';
                    }
                }

                // Last move highlight
                if (sq === lastMoveFrom) classes.push('last-move-from');
                if (sq === lastMoveTo) classes.push('last-move-to');

                // Selected cell
                if (sq === selectedSquare) classes.push('selected-cell');

                // Piece
                if (piece > 0) {
                    var pieceClass = isRed(piece) ? 'piece-red' : 'piece-black';
                    cellContent = '<span class="piece ' + pieceClass + '">' + pieceChar(piece) + '</span>';
                }

                // Legal move highlight (using pre-computed map)
                if (selectedSquare !== null && sq !== selectedSquare && legalTargets[sq]) {
                    if (piece > 0) {
                        classes.push('legal-capture');
                    } else {
                        classes.push('legal-move');
                    }
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
        if (!engine || aiThinking) return;
        if (gameResult !== '*') return;

        var piece = engine.getPiece(sq);
        var side = sideToMove();

        // In AI mode, block human from moving AI's pieces
        if (gameMode === 'ai-red' && side === BLACK) return;
        if (gameMode === 'ai-black' && side === RED) return;

        if (!clickLock && piece > 0) {
            // Check if it's the correct side's piece
            var pieceSide = isRed(piece) ? RED : BLACK;
            if (pieceSide === side) {
                selectedSquare = sq;
                clickLock = true;
                drawBoard();
            }
        } else if (clickLock) {
            // Try to move
            var target = sq;
            var valid = tryMove(selectedSquare, target);
            selectedSquare = null;
            clickLock = false;

            if (valid) {
                drawBoard();
                updateStatus();
                updatePgn();

                // Check game over
                if (checkGameOver()) return;

                // AI move
                if ((gameMode === 'ai-red' && sideToMove() === BLACK) ||
                    (gameMode === 'ai-black' && sideToMove() === RED)) {
                    setTimeout(aiMove, 200);
                }
            } else {
                drawBoard();
            }
        }
    };

    // Try to make a move
    function tryMove(fromSq, toSq) {
        var moveStr = engine.squareToString(fromSq) + engine.squareToString(toSq);
        var move = engine.moveFromString(moveStr);
        if (move === 0) return false;

        lastMoveFrom = fromSq;
        lastMoveTo = toSq;
        engine.makeMove(move);
        return true;
    }

    // AI move
    function aiMove() {
        if (!engine || gameResult !== '*') return;

        aiThinking = true;
        updateStatus();

        // Use setTimeout to allow UI to update before heavy computation
        setTimeout(function() {
            var bestMove = 0;
            try {
                // Set a time limit so Kindle's slow CPU doesn't hang
                // Easy=1s, Medium=3s, Hard=8s max
                var timeLimit = (aiDepth === 1) ? 1000 : (aiDepth === 3) ? 3000 : 8000;
                engine.resetTimeControl();
                var tc = engine.getTimeControl();
                tc.timeSet = 1;
                tc.time = timeLimit;
                tc.stopTime = Date.now() + timeLimit;
                engine.setTimeControl(tc);

                bestMove = engine.search(aiDepth);
            } catch (e) {
                // Ignore errors, try to recover
            }

            if (bestMove === 0 || bestMove === undefined) {
                // Fallback: pick a random legal move
                var moves = engine.generateLegalMoves();
                if (moves.length > 0) {
                    bestMove = moves[Math.floor(Math.random() * moves.length)].move;
                }
            }

            if (bestMove === 0 || bestMove === undefined) {
                aiThinking = false;
                checkGameOver();
                return;
            }

            lastMoveFrom = engine.getSourceSquare(bestMove);
            lastMoveTo = engine.getTargetSquare(bestMove);
            engine.makeMove(bestMove);

            aiThinking = false;
            drawBoard();
            updateStatus();
            updatePgn();
            checkGameOver();
        }, 50);
    }

    // Update status text
    function updateStatus() {
        var statusEl = document.getElementById('status');
        if (!engine) return;

        if (gameResult !== '*') {
            statusEl.textContent = gameResult;
            return;
        }

        var side = sideToMove();
        var sideName = (side === RED) ? 'Red' : 'Black';

        if (aiThinking) {
            statusEl.textContent = sideName + ' (AI) thinking...';
        } else if (gameMode === 'two-player') {
            statusEl.textContent = sideName + ' to move';
        } else {
            var isAITurn = (gameMode === 'ai-red' && side === BLACK) ||
                           (gameMode === 'ai-black' && side === RED);
            statusEl.textContent = sideName + (isAITurn ? ' (AI)' : ' (You)') + ' to move';
        }
    }

    // Check if game is over
    function checkGameOver() {
        if (!engine) return false;

        var legalMoves = engine.generateLegalMoves();
        if (legalMoves.length === 0) {
            var side = sideToMove();
            // Side to move has no legal moves - checkmate or stalemate
            // In xiangqi, stalemate = loss for the stalemated side
            gameResult = (side === RED) ? 'Black wins!' : 'Red wins!';
            showGameOver();
            return true;
        }

        // Check for flying generals (kings facing each other)
        // This is handled by the engine's move generation

        updateStatus();
        return false;
    }

    // Show game over screen
    function showGameOver() {
        document.getElementById('board-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('result-title').textContent = gameResult;
        updateStatus();
    }

    // Update PGN display
    function updatePgn() {
        if (!engine) return;
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
    }

    // New game
    window.newGame = function() {
        if (!engine) return;
        engine.setBoard(engine.START_FEN);
        selectedSquare = null;
        clickLock = false;
        lastMoveFrom = null;
        lastMoveTo = null;
        gameResult = '*';
        aiThinking = false;

        document.getElementById('menu-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('board-screen').classList.remove('hidden');

        drawBoard();
        updateStatus();
        updatePgn();

        // If AI plays red, AI moves first
        if (gameMode === 'ai-black') {
            setTimeout(aiMove, 200);
        }
    };

    // Undo move
    window.undoMove = function() {
        if (!engine || aiThinking) return;

        // In AI mode, undo two moves (player + AI)
        var undoCount = (gameMode !== 'two-player') ? 2 : 1;

        for (var i = 0; i < undoCount; i++) {
            try {
                engine.takeBack();
            } catch (e) {
                break;
            }
        }

        selectedSquare = null;
        clickLock = false;
        lastMoveFrom = null;
        lastMoveTo = null;
        gameResult = '*';

        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('board-screen').classList.remove('hidden');

        drawBoard();
        updateStatus();
        updatePgn();
    };

    // Flip board
    window.flipBoard = function() {
        flip ^= 1;
        drawBoard();
    };

    // Back to menu
    function backToMenu() {
        document.getElementById('board-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('menu-screen').classList.remove('hidden');
    }

    // Set AI difficulty
    function setDifficulty(depth) {
        aiDepth = depth;
        var btns = document.querySelectorAll('.diff-btn');
        for (var i = 0; i < btns.length; i++) {
            var d = parseInt(btns[i].getAttribute('data-depth'), 10);
            if (d === depth) {
                btns[i].classList.add('selected');
            } else {
                btns[i].classList.remove('selected');
            }
        }
    }

    // Initialize
    function init() {
        initEngine();

        // Menu buttons
        document.getElementById('vs-ai-btn').addEventListener('click', function() {
            gameMode = 'ai-red';
            newGame();
        });

        document.getElementById('vs-ai-black-btn').addEventListener('click', function() {
            gameMode = 'ai-black';
            newGame();
        });

        document.getElementById('two-player-btn').addEventListener('click', function() {
            gameMode = 'two-player';
            newGame();
        });

        // Difficulty buttons
        var diffBtns = document.querySelectorAll('.diff-btn');
        for (var i = 0; i < diffBtns.length; i++) {
            diffBtns[i].addEventListener('click', function() {
                setDifficulty(parseInt(this.getAttribute('data-depth'), 10));
            });
        }

        // Game control buttons
        document.getElementById('btn-new').addEventListener('click', newGame);
        document.getElementById('btn-undo').addEventListener('click', undoMove);
        document.getElementById('btn-flip').addEventListener('click', flipBoard);
        document.getElementById('btn-menu').addEventListener('click', backToMenu);

        // Game over buttons
        document.getElementById('play-again-btn').addEventListener('click', newGame);
        document.getElementById('back-menu-btn').addEventListener('click', backToMenu);

        // Set default difficulty
        setDifficulty(3);

        // Draw initial board (in menu, but prepare it)
        if (engine) {
            drawBoard();
        }

        document.getElementById('status').textContent = 'Select mode to start';
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
