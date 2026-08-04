/* Xiangqi - Chinese Chess for Kindle
   Board: pieces on intersections, built on Wukong engine */

(function() {
    'use strict';

    var PIECE_CHARS = [
        '', '兵', '仕', '相', '马', '炮', '车', '帅',
        '卒', '士', '象', '马', '炮', '车', '将'
    ];

    var RED = 0;
    var BLACK = 1;
    var COLS = 9;   /* 9 files (intersections) */
    var ROWS = 10;  /* 10 ranks (intersections) */

    /* Cell size in px - distance between adjacent intersections */
    var CELL = 38;
    /* Padding around board for edge pieces */
    var PAD = 22;

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

    /* Generate the board background as an SVG data URL.
       Xiangqi board: 9x10 intersections, lines connect them.
       River in the middle (between row 4 and row 5).
       Palace diagonals in 3x3 areas at top (cols 3-5, rows 0-2) and bottom (cols 3-5, rows 7-9).
       Cannon and pawn position markers (small cross marks). */
    function boardBackgroundSvg() {
        var w = (COLS - 1) * CELL + PAD * 2;
        var h = (ROWS - 1) * CELL + PAD * 2;
        var x0 = PAD;
        var y0 = PAD;
        var lines = '';

        /* Outer border (thick) */
        lines += '<rect x="' + (x0 - 1) + '" y="' + (y0 - 1) +
                '" width="' + ((COLS - 1) * CELL + 2) + '" height="' + ((ROWS - 1) * CELL + 2) +
                '" fill="#f5edd6" stroke="#000" stroke-width="2"/>';

        /* Horizontal lines (10 lines) */
        for (var r = 0; r < ROWS; r++) {
            var y = y0 + r * CELL;
            lines += '<line x1="' + x0 + '" y1="' + y + '" x2="' + (x0 + (COLS - 1) * CELL) + '" y2="' + y + '" stroke="#000" stroke-width="1"/>';
        }

        /* Vertical lines (9 lines, but middle section broken by river) */
        for (var c = 0; c < COLS; c++) {
            var x = x0 + c * CELL;
            if (c === 0 || c === COLS - 1) {
                /* Edge columns go full height */
                lines += '<line x1="' + x + '" y1="' + y0 + '" x2="' + x + '" y2="' + (y0 + (ROWS - 1) * CELL) + '" stroke="#000" stroke-width="1"/>';
            } else {
                /* Inner columns broken by river: top half (rows 0-4) and bottom half (rows 5-9) */
                lines += '<line x1="' + x + '" y1="' + y0 + '" x2="' + x + '" y2="' + (y0 + 4 * CELL) + '" stroke="#000" stroke-width="1"/>';
                lines += '<line x1="' + x + '" y1="' + (y0 + 5 * CELL) + '" x2="' + x + '" y2="' + (y0 + 9 * CELL) + '" stroke="#000" stroke-width="1"/>';
            }
        }

        /* Palace diagonals - top palace (rows 0-2, cols 3-5) */
        lines += '<line x1="' + (x0 + 3 * CELL) + '" y1="' + y0 + '" x2="' + (x0 + 5 * CELL) + '" y2="' + (y0 + 2 * CELL) + '" stroke="#000" stroke-width="1"/>';
        lines += '<line x1="' + (x0 + 5 * CELL) + '" y1="' + y0 + '" x2="' + (x0 + 3 * CELL) + '" y2="' + (y0 + 2 * CELL) + '" stroke="#000" stroke-width="1"/>';

        /* Palace diagonals - bottom palace (rows 7-9, cols 3-5) */
        lines += '<line x1="' + (x0 + 3 * CELL) + '" y1="' + (y0 + 7 * CELL) + '" x2="' + (x0 + 5 * CELL) + '" y2="' + (y0 + 9 * CELL) + '" stroke="#000" stroke-width="1"/>';
        lines += '<line x1="' + (x0 + 5 * CELL) + '" y1="' + (y0 + 7 * CELL) + '" x2="' + (x0 + 3 * CELL) + '" y2="' + (y0 + 9 * CELL) + '" stroke="#000" stroke-width="1"/>';

        /* River text: 楚河 漢界 */
        var riverY = y0 + 4 * CELL + CELL / 2 + 5;
        lines += '<text x="' + (x0 + 1.5 * CELL) + '" y="' + riverY + '" font-size="14" fill="#888" text-anchor="middle">楚 河</text>';
        lines += '<text x="' + (x0 + 6.5 * CELL) + '" y="' + riverY + '" font-size="14" fill="#888" text-anchor="middle">漢 界</text>';

        /* Cannon and pawn position markers (small corner marks) */
        /* Cannon positions: (2,1), (2,7), (7,1), (7,7) - row, col in display coords */
        /* Pawn positions: (3,0), (3,2), (3,4), (3,6), (3,8), (6,0), (6,2), (6,4), (6,6), (6,8) */
        var markers = [
            [2, 1], [2, 7], [7, 1], [7, 7],  /* cannons */
            [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],  /* black pawns */
            [6, 0], [6, 2], [6, 4], [6, 6], [6, 8]   /* red pawns */
        ];
        for (var m = 0; m < markers.length; m++) {
            var mr = markers[m][0];
            var mc = markers[m][1];
            var mx = x0 + mc * CELL;
            var my = y0 + mr * CELL;
            lines += drawMarker(mx, my, mc);
        }

        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' + lines + '</svg>';
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    /* Draw position marker (small L-shaped corners around intersection) */
    function drawMarker(x, y, col) {
        var s = 4;   /* marker size */
        var g = 3;   /* gap from center */
        var parts = '';

        /* Left markers (if not on left edge) */
        if (col > 0) {
            /* Upper-left */
            parts += '<line x1="' + (x - g) + '" y1="' + (y - g - s) + '" x2="' + (x - g) + '" y2="' + (y - g) + '" stroke="#000" stroke-width="1"/>';
            parts += '<line x1="' + (x - g - s) + '" y1="' + (y - g) + '" x2="' + (x - g) + '" y2="' + (y - g) + '" stroke="#000" stroke-width="1"/>';
            /* Lower-left */
            parts += '<line x1="' + (x - g) + '" y1="' + (y + g) + '" x2="' + (x - g) + '" y2="' + (y + g + s) + '" stroke="#000" stroke-width="1"/>';
            parts += '<line x1="' + (x - g - s) + '" y1="' + (y + g) + '" x2="' + (x - g) + '" y2="' + (y + g) + '" stroke="#000" stroke-width="1"/>';
        }
        /* Right markers (if not on right edge) */
        if (col < COLS - 1) {
            /* Upper-right */
            parts += '<line x1="' + (x + g) + '" y1="' + (y - g - s) + '" x2="' + (x + g) + '" y2="' + (y - g) + '" stroke="#000" stroke-width="1"/>';
            parts += '<line x1="' + (x + g) + '" y1="' + (y - g) + '" x2="' + (x + g + s) + '" y2="' + (y - g) + '" stroke="#000" stroke-width="1"/>';
            /* Lower-right */
            parts += '<line x1="' + (x + g) + '" y1="' + (y + g) + '" x2="' + (x + g) + '" y2="' + (y + g + s) + '" stroke="#000" stroke-width="1"/>';
            parts += '<line x1="' + (x + g) + '" y1="' + (y + g) + '" x2="' + (x + g + s) + '" y2="' + (y + g) + '" stroke="#000" stroke-width="1"/>';
        }
        return parts;
    }

    /* Draw the board: background SVG + absolutely positioned pieces/intersections */
    function drawBoard() {
        if (!engine) return;
        var boardEl = document.getElementById('xiangqiboard');
        if (!boardEl) return;

        var boardW = (COLS - 1) * CELL + PAD * 2;
        var boardH = (ROWS - 1) * CELL + PAD * 2;
        boardEl.style.width = boardW + 'px';
        boardEl.style.height = boardH + 'px';
        boardEl.style.position = 'relative';

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

        /* Build background SVG */
        var bgUrl = boardBackgroundSvg();
        var html = '<div style="position:absolute;top:0;left:0;width:' + boardW + 'px;height:' + boardH +
                   'px;background:url(' + bgUrl + ') no-repeat;z-index:0;"></div>';

        /* Place intersection points with pieces */
        for (var displayRow = 0; displayRow < ROWS; displayRow++) {
            for (var file = 0; file < COLS; file++) {
                var actualRow = flip ? (ROWS - 1 - displayRow) : displayRow;
                var actualFile = flip ? (COLS - 1 - file) : file;
                var sq = squareFromCoord(actualRow, actualFile);
                var piece = engine.getPiece(sq);

                var px = PAD + file * CELL;
                var py = PAD + displayRow * CELL;

                var isLegal = (selectedSquare !== null && sq !== selectedSquare && legalTargets[sq]);
                var isSelected = (sq === selectedSquare);
                var isLastFrom = (sq === lastMoveFrom);
                var isLastTo = (sq === lastMoveTo);

                var content = '';
                var pointClass = 'xq-point';

                if (piece > 0) {
                    var pieceClass = isRed(piece) ? 'xq-piece-red' : 'xq-piece-black';
                    var pieceExtra = '';
                    if (isSelected) pieceExtra += ' xq-selected';
                    if (isLastFrom || isLastTo) pieceExtra += ' xq-last-to';
                    content = '<span class="xq-piece ' + pieceClass + pieceExtra + '">' + pieceChar(piece) + '</span>';
                    if (isLegal) {
                        /* Ring around capturable piece */
                        content = '<span class="xq-legal-capture"></span>' + content;
                    }
                } else if (isLegal) {
                    /* Empty intersection with legal move dot */
                    content = '<span class="xq-legal-dot"></span>';
                } else if (isLastFrom || isLastTo) {
                    content = '<span class="xq-legal-dot" style="background:#999;opacity:0.3;"></span>';
                }

                html += '<div class="' + pointClass + '" style="left:' + px + 'px;top:' + py +
                        'px;" onclick="tapSquare(' + sq + ')">' + content + '</div>';
            }
        }

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

            setDifficulty(3);

            if (engine) {
                drawBoard();
            }
        } catch (e) {
            log('init: ' + (e && e.message ? e.message : e));
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
