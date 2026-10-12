const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const COLOR_NAMES = { 1: 'Schwarz', 2: 'Weiß' };

const DIRECTIONS = [
    [0, -1], [1, 0], [0, 1], [-1, 0]
];

const STAR_POINTS = {
    9: [2, 4, 6],
    13: [3, 6, 9],
    19: [3, 9, 15]
};

const CORNER_STAR_OFFSETS = {
    9: [[2, 2], [2, 6], [6, 2], [6, 6]],
    13: [[3, 3], [3, 9], [9, 3], [9, 9]],
    19: [[3, 3], [3, 15], [15, 3], [15, 15]]
};

class GoGame {
    constructor() {
        this.boardSize = 19;
        this.difficulty = 'medium';
        this.board = [];
        this.currentPlayer = BLACK;
        this.koPoint = null;
        this.captured = { black: 0, white: 0 };
        this.moveHistory = [];
        this.lastMove = null;
        this.gameOver = false;
        this.passCount = 0;
        this.hovered = null;

        this.canvas = document.getElementById('goBoard');
        this.ctx = this.canvas.getContext('2d');

        this.bindEvents();
        this.initBoard();
        this.render();
    }

    bindEvents() {
        document.getElementById('boardSize').addEventListener('change', (e) => {
            this.boardSize = parseInt(e.target.value);
            this.startNewGame();
        });

        document.getElementById('difficulty').addEventListener('change', (e) => {
            this.difficulty = e.target.value;
            this.startNewGame();
        });

        document.getElementById('resetBtn').addEventListener('click', () => this.startNewGame());
        document.getElementById('passBtn').addEventListener('click', () => this.pass());
        document.getElementById('resignBtn').addEventListener('click', () => this.resign());

        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => {
            this.hovered = null;
            this.render();
        });
    }

    initBoard() {
        this.board = [];
        for (let y = 0; y < this.boardSize; y++) {
            const row = [];
            for (let x = 0; x < this.boardSize; x++) {
                row.push(EMPTY);
            }
            this.board.push(row);
        }
        this.currentPlayer = BLACK;
        this.koPoint = null;
        this.captured = { black: 0, white: 0 };
        this.moveHistory = [];
        this.lastMove = null;
        this.gameOver = false;
        this.passCount = 0;
        this.hovered = null;
    }

    startNewGame() {
        this.initBoard();
        this.hovered = null;
        this.updateStatus();
        this.updateExplanation('Neues Spiel begonnen. Schwarz beginnt.', 'default');
        this.updateCapturedDisplay();
        this.render();
    }

    getOpponent(color) {
        return color === BLACK ? WHITE : BLACK;
    }

    inBounds(x, y) {
        return x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize;
    }

    getGroup(board, x, y) {
        const color = board[y][x];
        if (color === EMPTY) return { stones: [], liberties: 0 };

        const stones = [];
        const visited = new Set();
        const queue = [[x, y]];

        while (queue.length > 0) {
            const [cx, cy] = queue.shift();
            const key = `${cx},${cy}`;
            if (visited.has(key)) continue;
            visited.add(key);
            stones.push([cx, cy]);

            for (const [dx, dy] of DIRECTIONS) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (!this.inBounds(nx, ny)) continue;
                const nkey = `${nx},${ny}`;
                if (visited.has(nkey)) continue;
                if (board[ny][nx] === color) {
                    queue.push([nx, ny]);
                }
            }
        }

        const liberties = new Set();
        for (const [sx, sy] of stones) {
            for (const [dx, dy] of DIRECTIONS) {
                const nx = sx + dx;
                const ny = sy + dy;
                if (this.inBounds(nx, ny) && board[ny][nx] === EMPTY) {
                    liberties.add(`${nx},${ny}`);
                }
            }
        }

        return { stones, liberties: liberties.size };
    }

    isValidMove(board, x, y, color) {
        if (!this.inBounds(x, y)) return false;
        if (board[y][x] !== EMPTY) return false;

        if (this.koPoint && this.koPoint.x === x && this.koPoint.y === y) {
            return false;
        }

        const testBoard = board.map(row => [...row]);
        testBoard[y][x] = color;

        const opponent = this.getOpponent(color);
        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny) && testBoard[ny][nx] === opponent) {
                const group = this.getGroup(testBoard, nx, ny);
                if (group.liberties === 0) {
                    for (const [gx, gy] of group.stones) {
                        testBoard[gy][gx] = EMPTY;
                    }
                    return true;
                }
            }
        }

        const myGroup = this.getGroup(testBoard, x, y);
        return myGroup.liberties > 0;
    }

    placeStone(board, x, y, color) {
        if (!this.isValidMove(board, x, y, color)) return false;

        this.koPoint = null;

        board[y][x] = color;
        let capturedCount = 0;

        const opponent = this.getOpponent(color);
        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny) && board[ny][nx] === opponent) {
                const group = this.getGroup(board, nx, ny);
                if (group.liberties === 0) {
                    for (const [gx, gy] of group.stones) {
                        board[gy][gx] = EMPTY;
                        capturedCount++;
                    }
                }
            }
        }

        if (capturedCount === 1) {
            const myGroup = this.getGroup(board, x, y);
            if (myGroup.stones.length === 1 && myGroup.liberties === 1) {
                this.koPoint = { x, y };
            }
        }

        if (color === BLACK) {
            this.captured.white += capturedCount;
        } else {
            this.captured.black += capturedCount;
        }

        this.lastMove = { x, y, color, captured: capturedCount };
        this.moveHistory.push({
            x, y, color, captured: capturedCount,
            boardSnapshot: board.map(row => [...row])
        });

        return true;
    }

    getAllLegalMoves(board, color) {
        const moves = [];
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                if (this.isValidMove(board, x, y, color)) {
                    moves.push({ x, y });
                }
            }
        }
        return moves;
    }

    getCandidateMoves(board, color) {
        const bs = this.boardSize;
        const candidates = new Set();

        for (let y = 0; y < bs; y++) {
            for (let x = 0; x < bs; x++) {
                if (board[y][x] !== EMPTY) {
                    for (const [dx, dy] of DIRECTIONS) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (this.inBounds(nx, ny) && board[ny][nx] === EMPTY) {
                            candidates.add(`${nx},${ny}`);
                        }
                    }
                }
            }
        }

        if (candidates.size === 0) {
            const corners = CORNER_STAR_OFFSETS[bs] || [[3, 3], [3, bs - 4], [bs - 4, 3], [bs - 4, bs - 4]];
            for (const [cx, cy] of corners) {
                if (board[cy][cx] === EMPTY) {
                    candidates.add(`${cx},${cy}`);
                }
            }
            const center = Math.floor(bs / 2);
            candidates.add(`${center},${center}`);
        } else {
            const corners = CORNER_STAR_OFFSETS[bs] || [];
            for (const [cx, cy] of corners) {
                if (board[cy][cx] === EMPTY) {
                    candidates.add(`${cx},${cy}`);
                }
            }
        }

        const moves = [];
        for (const key of candidates) {
            const [x, y] = key.split(',').map(Number);
            if (this.isValidMove(board, x, y, color)) {
                moves.push({ x, y });
            }
        }
        return moves;
    }

    handleCanvasClick(e) {
        if (this.gameOver) return;
        if (this.currentPlayer !== BLACK) return;

        const rect = this.canvas.getBoundingClientRect();
        const scale = this.canvas.width / rect.width;
        const clickX = (e.clientX - rect.left) * scale;
        const clickY = (e.clientY - rect.top) * scale;

        const cellSize = this.canvas.width / this.boardSize;
        const x = Math.round(clickX / cellSize);
        const y = Math.round(clickY / cellSize);

        if (!this.inBounds(x, y)) return;

        if (this.isValidMove(this.board, x, y, BLACK)) {
            this.makePlayerMove(x, y);
        }
    }

    handleMouseMove(e) {
        if (this.gameOver || this.currentPlayer !== BLACK) {
            if (this.hovered) {
                this.hovered = null;
                this.render();
            }
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const scale = this.canvas.width / rect.width;
        const mouseX = (e.clientX - rect.left) * scale;
        const mouseY = (e.clientY - rect.top) * scale;

        const cellSize = this.canvas.width / this.boardSize;
        const x = Math.round(mouseX / cellSize);
        const y = Math.round(mouseY / cellSize);

        if (this.inBounds(x, y) && this.isValidMove(this.board, x, y, BLACK)) {
            this.hovered = { x, y };
        } else {
            this.hovered = null;
        }
        this.render();
    }

    makePlayerMove(x, y) {
        if (!this.placeStone(this.board, x, y, BLACK)) return;

        this.currentPlayer = WHITE;
        this.updateStatus();
        this.updateExplanation('KI denkt nach...', 'default');
        this.updateCapturedDisplay();
        this.render();

        const delay = this.difficulty === 'hard' ? 1000 : this.difficulty === 'medium' ? 600 : 250;

        setTimeout(() => {
            if (!this.gameOver) {
                this.makeAIMove();
            }
        }, delay);
    }

    makeAIMove() {
        if (this.gameOver) return;

        const color = WHITE;
        const explanation = this.generateAIMove(color);

        this.currentPlayer = BLACK;
        this.updateStatus();
        this.updateExplanation(explanation.text, explanation.category);
        this.updateCapturedDisplay();
        this.render();
    }

    generateAIMove(color) {
        const opponent = this.getOpponent(color);

        const legalMoves = this.getCandidateMoves(this.board, color);

        if (legalMoves.length === 0) {
            this.passCount++;
            if (this.passCount >= 2) {
                this.endGame();
                return {
                    text: 'Beide haben gepasst. Spiel ist vorbei.',
                    category: 'pass'
                };
            }
            this.currentPlayer = BLACK;
            return {
                text: 'KI hat keinen zügigen Zug und passt.',
                category: 'pass'
            };
        }

        const moveScores = legalMoves.map(move => ({
            move,
            score: this.difficulty === 'hard'
                ? this.evaluateMoveDeep(move.x, move.y, color, opponent)
                : this.evaluateMove(move.x, move.y, color)
        }));

        moveScores.sort((a, b) => b.score - a.score);

        let selectedMove = moveScores[0].move;

        if (this.difficulty === 'easy' && moveScores.length > 3) {
            const candidates = moveScores.slice(0, Math.min(4, moveScores.length));
            selectedMove = candidates[Math.floor(Math.random() * candidates.length)].move;
        } else if (this.difficulty === 'medium' && Math.random() < 0.15 && moveScores.length > 1) {
            const candidates = moveScores.slice(0, Math.min(3, moveScores.length));
            selectedMove = candidates[Math.floor(Math.random() * candidates.length)].move;
        }

        const captureResult = this.simulateCapture(selectedMove.x, selectedMove.y, color);
        this.placeStone(this.board, selectedMove.x, selectedMove.y, color);

        let explanationText = '';
        let explanationCategory = 'default';

        if (captureResult.count > 0) {
            explanationText = `KI fängt ${captureResult.count} gegnerische Stein${captureResult.count > 1 ? 'e' : ''}!`;
            explanationCategory = 'capture';
        } else if (captureResult.saved) {
            explanationText = 'KI rettet seine eigene Gruppe vor Einfangung.';
            explanationCategory = 'defense';
        } else {
            const posType = this.getPositionType(selectedMove.x, selectedMove.y);
            if (posType === 'corner') {
                explanationText = 'KI spielt in eine Ecke – strategisch wertvoll.';
                explanationCategory = 'strategic';
            } else if (posType === 'edge') {
                explanationText = 'KI spielt an die Kante – eine sichere Position.';
                explanationCategory = 'strategic';
            } else {
                explanationText = 'KI setzt einen Stein in die Mitte.';
                explanationCategory = 'positional';
            }

            if (captureResult.atariThreat) {
                explanationText += ' KI setzt eine Atari-Falle!';
                explanationCategory = 'threat';
            }
        }

        return {
            text: explanationText,
            category: explanationCategory
        };
    }

    evaluateMove(x, y, color) {
        const opponent = this.getOpponent(color);
        let score = 0;

        const testBoard = this.board.map(row => [...row]);
        testBoard[y][x] = color;

        let capturedCount = 0;
        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny) && testBoard[ny][nx] === opponent) {
                const group = this.getGroup(testBoard, nx, ny);
                if (group.liberties === 0) {
                    capturedCount += group.stones.length;
                }
            }
        }

        if (capturedCount > 0) {
            score += 1000 + capturedCount * 100;
        } else {
            const myGroup = this.getGroup(testBoard, x, y);
            if (myGroup.liberties === 0) {
                return -10000;
            }
            score += myGroup.liberties * 3;

            let savedLives = 0;
            for (const [dx, dy] of DIRECTIONS) {
                const nx = x + dx;
                const ny = y + dy;
                if (this.inBounds(nx, ny) && this.board[ny][nx] === color) {
                    const friendGroup = this.getGroup(this.board, nx, ny);
                    if (friendGroup.liberties === 1 && friendGroup.stones.length > 1) {
                        savedLives += friendGroup.stones.length;
                    }
                }
            }
            score += savedLives * 50;

            for (const [dx, dy] of DIRECTIONS) {
                const nx = x + dx;
                const ny = y + dy;
                if (this.inBounds(nx, ny) && this.board[ny][nx] === opponent) {
                    const oppGroup = this.getGroup(this.board, nx, ny);
                    if (oppGroup.liberties === 1) {
                        score += oppGroup.stones.length * 30;
                    }
                }
            }
        }

        const posType = this.getPositionType(x, y);
        if (posType === 'corner') {
            score += 15;
        } else if (posType === 'edge') {
            score += 8;
        }

        score += (Math.random() - 0.5) * 4;

        return score;
    }

    evaluateMoveDeep(x, y, color, opponent) {
        const testBoard = this.board.map(row => [...row]);
        testBoard[y][x] = color;

        let ownCaptured = 0;
        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny) && testBoard[ny][nx] === opponent) {
                const group = this.getGroup(testBoard, nx, ny);
                if (group.liberties === 0) {
                    ownCaptured += group.stones.length;
                    for (const [gx, gy] of group.stones) {
                        testBoard[gy][gx] = EMPTY;
                    }
                }
            }
        }

        const myGroup = this.getGroup(testBoard, x, y);
        if (myGroup.liberties === 0 && ownCaptured === 0) {
            return -10000;
        }

        let ownScore = ownCaptured * 100 + myGroup.liberties * 3;

        const posType = this.getPositionType(x, y);
        if (posType === 'corner') ownScore += 15;
        else if (posType === 'edge') ownScore += 8;

        const oppMoves = this.getCandidateMoves(testBoard, opponent);
        if (oppMoves.length === 0) return ownScore;

        let minOppScore = Infinity;

        const evalLimit = Math.min(oppMoves.length, 20);
        const shuffled = [...oppMoves].sort(() => Math.random() - 0.5).slice(0, evalLimit);

        for (const move of shuffled) {
            const oppBoard = testBoard.map(row => [...row]);
            oppBoard[move.y][move.x] = opponent;

            let oppCaptured = 0;
            for (const [dx, dy] of DIRECTIONS) {
                const nx = move.x + dx;
                const ny = move.y + dy;
                if (this.inBounds(nx, ny) && oppBoard[ny][nx] === color) {
                    const group = this.getGroup(oppBoard, nx, ny);
                    if (group.liberties === 0) {
                        oppCaptured += group.stones.length;
                        for (const [gx, gy] of group.stones) {
                            oppBoard[gy][gx] = EMPTY;
                        }
                    }
                }
            }

            const oppGroup = this.getGroup(oppBoard, move.x, move.y);
            const oppLib = oppGroup.liberties;
            const oppScore = oppCaptured * 100 + oppLib * 3;
            const netScore = ownScore - oppScore;

            if (netScore < minOppScore) {
                minOppScore = netScore;
            }
        }

        if (minOppScore === Infinity) return ownScore;

        return minOppScore + (Math.random() - 0.5) * 3;
    }

    simulateCapture(x, y, color) {
        const opponent = this.getOpponent(color);
        const testBoard = this.board.map(row => [...row]);
        testBoard[y][x] = color;

        let count = 0;
        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny) && testBoard[ny][nx] === opponent) {
                const group = this.getGroup(testBoard, nx, ny);
                if (group.liberties === 0) {
                    count += group.stones.length;
                }
            }
        }

        let saved = false;
        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny) && this.board[ny][nx] === color) {
                const friendGroup = this.getGroup(this.board, nx, ny);
                if (friendGroup.liberties === 1 && friendGroup.stones.length > 1) {
                    saved = true;
                }
            }
        }

        let atariThreat = false;
        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny) && testBoard[ny][nx] === opponent) {
                const group = this.getGroup(testBoard, nx, ny);
                if (group.liberties <= 1) {
                    atariThreat = true;
                }
            }
        }

        return { count, saved, atariThreat };
    }

    getPositionType(x, y) {
        const margin = 4;
        const nearLeft = x < margin;
        const nearRight = x >= this.boardSize - margin;
        const nearTop = y < margin;
        const nearBottom = y >= this.boardSize - margin;

        if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
            return 'corner';
        }
        if (nearLeft || nearRight || nearTop || nearBottom) {
            return 'edge';
        }
        return 'center';
    }

    pass() {
        if (this.gameOver) return;

        this.passCount++;
        this.lastMove = null;

        if (this.passCount >= 2) {
            this.endGame();
        } else {
            this.currentPlayer = this.getOpponent(this.currentPlayer);
            this.updateStatus();
            this.updateExplanation('Ein Spieler hat gepasst. Du bist an der Reihe.', 'pass');
            this.render();

            if (this.currentPlayer === WHITE && !this.gameOver) {
                setTimeout(() => this.makeAIMove(), 600);
            }
        }
    }

    resign() {
        if (this.gameOver) return;

        this.gameOver = true;
        this.updateStatus('Du hast aufgegeben. Weiß gewinnt!');
        this.updateExplanation('Du hast aufgegeben. Die KI hat gewonnen.', 'defeat');
        this.render();
    }

    calculateScore() {
        const territoryBoard = this.board.map(row => [...row]);
        const owner = Array(this.boardSize).fill(0)
            .map(() => Array(this.boardSize).fill(0));

        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                if (territoryBoard[y][x] !== EMPTY) continue;

                const visited = new Set();
                const stack = [{ x, y }];
                const region = [];
                let touchesBlack = false;
                let touchesWhite = false;

                while (stack.length > 0) {
                    const { x: cx, y: cy } = stack.pop();
                    const key = `${cx},${cy}`;
                    if (visited.has(key)) continue;
                    visited.add(key);
                    region.push({ x: cx, y: cy });

                    for (const [dx, dy] of DIRECTIONS) {
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (!this.inBounds(nx, ny)) continue;
                        if (visited.has(`${nx},${ny}`)) continue;

                        if (territoryBoard[ny][nx] === EMPTY) {
                            stack.push({ x: nx, y: ny });
                        } else if (territoryBoard[ny][nx] === BLACK) {
                            touchesBlack = true;
                        } else {
                            touchesWhite = true;
                        }
                    }
                }

                if (touchesBlack && !touchesWhite) {
                    for (const { x: rx, y: ry } of region) {
                        owner[ry][rx] = BLACK;
                        territoryBoard[ry][rx] = -1;
                    }
                } else if (touchesWhite && !touchesBlack) {
                    for (const { x: rx, y: ry } of region) {
                        owner[ry][rx] = WHITE;
                        territoryBoard[ry][rx] = -1;
                    }
                } else {
                    for (const { x: rx, y: ry } of region) {
                        territoryBoard[ry][rx] = -1;
                    }
                }
            }
        }

        let blackScore = 0;
        let whiteScore = 0;

        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                if (this.board[y][x] === BLACK) {
                    blackScore += 1;
                } else if (this.board[y][x] === WHITE) {
                    whiteScore += 1;
                } else if (owner[y][x] === BLACK) {
                    blackScore += 1;
                } else if (owner[y][x] === WHITE) {
                    whiteScore += 1;
                }
            }
        }

        whiteScore += 7.5;

        const margin = Math.abs(blackScore - whiteScore);
        const winner = blackScore > whiteScore ? 'Schwarz' : 'Weiß';

        return {
            blackScore,
            whiteScore,
            margin: margin.toFixed(1),
            winner
        };
    }

    endGame() {
        this.gameOver = true;
        const result = this.calculateScore();
        const statusEl = document.getElementById('status');
        statusEl.textContent = `Spiel vorbei! ${result.winner} gewinnt (${result.blackScore} : ${result.whiteScore})`;
        statusEl.classList.remove('current-player');
        this.updateExplanation(
            `Spiel beendet. ${result.winner} gewinnt mit ${result.margin} Punkten. Schwarz: ${result.blackScore}, Weiß: ${result.whiteScore}.`,
            'game-over'
        );
        this.updateCapturedDisplay();
        this.hovered = null;
        this.render();
    }

    updateStatus() {
        const statusEl = document.getElementById('status');
        statusEl.textContent = `${COLOR_NAMES[this.currentPlayer]} ist an der Reihe.`;
        statusEl.className = `status-box current-player ${this.currentPlayer === BLACK ? 'black' : 'white'}`;
    }

    updateCapturedDisplay() {
        document.getElementById('capturedWhite').textContent = this.captured.white;
        document.getElementById('capturedBlack').textContent = this.captured.black;
    }

    updateExplanation(text, category) {
        const el = document.getElementById('explanation');
        const textEl = el.querySelector('.explanation-text');
        textEl.textContent = text;

        const colors = {
            'capture': '#e74c3c',
            'defense': '#f39c12',
            'strategic': '#27ae60',
            'threat': '#8e44ad',
            'positional': '#3498db',
            'pass': '#7f8c8d',
            'defeat': '#c0392b',
            'game-over': '#2c3e50',
            'default': '#5a7d5a'
        };

        const hintColors = {
            'capture': '#fadbd8',
            'defense': '#fdebd0',
            'strategic': '#d5f5e3',
            'threat': '#ebdef0',
            'positional': '#d6eaf8',
            'pass': '#f2f3f4',
            'defeat': '#fadbd8',
            'game-over': '#d5dbdb',
            'default': '#e8f0e8'
        };

        const color = colors[category] || colors.default;
        const hint = hintColors[category] || hintColors.default;

        el.style.borderColor = color;
        textEl.style.color = color;
        el.style.background = hint;
    }

    renderStone(ctx, x, y, color, size) {
        const grad = ctx.createRadialGradient(
            x - size * 0.3, y - size * 0.3, size * 0.1,
            x, y, size
        );

        if (color === BLACK) {
            grad.addColorStop(0, '#b0b0b0');
            grad.addColorStop(0.5, '#4a4a4a');
            grad.addColorStop(1, '#0a0a0a');
        } else {
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.5, '#e0e0e0');
            grad.addColorStop(1, '#a0a0a0');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = color === BLACK ? '#000' : '#fff';
        ctx.lineWidth = Math.max(1, size * 0.12);
        ctx.stroke();
    }

    render() {
        const ctx = this.ctx;
        const size = this.canvas.width;
        const bs = this.boardSize;
        const cellSize = size / bs;

        ctx.clearRect(0, 0, size, size);

        ctx.fillStyle = '#d9c9a3';
        ctx.fillRect(0, 0, size, size);

        ctx.strokeStyle = '#3a2a15';
        ctx.lineWidth = 1;

        for (let i = 0; i < bs; i++) {
            const pos = i * cellSize + cellSize / 2;

            ctx.beginPath();
            ctx.moveTo(pos, cellSize / 2);
            ctx.lineTo(pos, size - cellSize / 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(cellSize / 2, pos);
            ctx.lineTo(size - cellSize / 2, pos);
            ctx.stroke();
        }

        const starPos = STAR_POINTS[bs] || [3, Math.floor(bs / 2), bs - 4];
        ctx.fillStyle = '#3a2a15';
        for (const sx of starPos) {
            for (const sy of starPos) {
                const px = sx * cellSize + cellSize / 2;
                const py = sy * cellSize + cellSize / 2;
                const starSize = Math.max(2, cellSize * 0.08);
                ctx.beginPath();
                ctx.arc(px, py, starSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        if (this.hovered && this.currentPlayer === BLACK && !this.gameOver) {
            const { x, y } = this.hovered;
            if (this.isValidMove(this.board, x, y, BLACK)) {
                const px = x * cellSize + cellSize / 2;
                const py = y * cellSize + cellSize / 2;
                const hoverSize = cellSize * 0.32;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
                ctx.beginPath();
                ctx.arc(px, py, hoverSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (let y = 0; y < bs; y++) {
            for (let x = 0; x < bs; x++) {
                if (this.board[y][x] !== EMPTY) {
                    const px = x * cellSize + cellSize / 2;
                    const py = y * cellSize + cellSize / 2;
                    const stoneSize = cellSize * 0.38;
                    this.renderStone(ctx, px, py, this.board[y][x], stoneSize);

                    if (this.lastMove && this.lastMove.x === x && this.lastMove.y === y) {
                        ctx.strokeStyle = '#e74c3c';
                        ctx.lineWidth = Math.max(1, cellSize * 0.08);
                        const markerSize = cellSize * 0.12;
                        ctx.beginPath();
                        ctx.arc(px, py, stoneSize + markerSize, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            }
        }

        if (this.isBoardEmpty() && this.currentPlayer === BLACK && !this.gameOver) {
            const center = Math.floor(bs / 2);
            const px = center * cellSize + cellSize / 2;
            const py = center * cellSize + cellSize / 2;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
            ctx.font = `${cellSize * 0.3}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('●', px, py + cellSize * 0.1);
        }
    }

    isBoardEmpty() {
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                if (this.board[y][x] !== EMPTY) return false;
            }
        }
        return true;
    }
}

let game;

document.addEventListener('DOMContentLoaded', () => {
    game = new GoGame();
});
