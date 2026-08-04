# Xiangqi - Chinese Chess for Kindle

A Chinese Chess (象棋/Xiangqi) game for Kindle e-readers, built on the
[Wukong](https://github.com/maksimKorzh/wukong-xiangqi) JavaScript engine
by Code Monkey King.

## Features

- **vs AI mode** — play as Red or Black against the Wukong engine
- **Two Player mode** — local hot-seat play
- **3 AI difficulty levels** — Easy (depth 1), Medium (depth 3), Hard (depth 5)
- **Traditional board style** — 楚河漢界, palace diagonals, red/black pieces
- **e-ink optimized** — black & white, minimal refresh, touch-friendly
- **Undo, Flip Board, New Game** controls
- **Move history** display in UCI notation

## Tech Stack

- **Engine**: [Wukong Xiangqi](https://github.com/maksimKorzh/wukong-xiangqi) —
  pure JavaScript, negamax + alpha-beta pruning + Zobrist hashing + repetition detection
- **UI**: Vanilla HTML/CSS/JavaScript (no frameworks)
- **Runtime**: Kindle Mesquite (WebKit-based app container)

## File Structure

```
xiangqi/
├── config.xml              # Mesquite widget configuration
├── index.html              # Game UI + Chrome bar integration
├── main.css                # Traditional board styling (e-ink optimized)
├── main.js                 # Game logic + UI binding
├── shortcut_xiangqi.sh     # Kindle launcher shortcut (with embedded icon)
├── assets/
│   └── wukong.js           # Wukong Xiangqi engine (1734 lines)
└── README.md
```

## Installation

1. Copy the `xiangqi/` folder to `/mnt/us/documents/xiangqi/` on your Kindle
2. Copy `shortcut_xiangqi.sh` to `/mnt/us/documents/shortcut_xiangqi.sh`
3. Eject the Kindle and tap the "Xiangqi" entry in your library

The shortcut script will:
- Copy game files to `/var/local/mesquite/xiangqi/`
- Register the app in `/var/local/appreg.db`
- Launch via `lipc-set-prop com.lab126.appmgrd`

## How to Play

1. Tap a piece to select it — legal moves are highlighted
2. Tap a destination square to move
3. In AI mode, the engine responds automatically

### Piece Characters

| Red | Black | Piece |
|-----|-------|-------|
| 帅  | 将    | King (General) |
| 仕  | 士    | Advisor (Guard) |
| 相  | 象    | Bishop (Elephant) |
| 马  | 马    | Knight (Horse) |
| 炮  | 炮    | Cannon |
| 车  | 车    | Rook (Chariot) |
| 兵  | 卒    | Pawn (Soldier) |

## Compatibility

- Kindle Paperwhite 4 (10th Gen) — tested
- Other Kindle models with Mesquite + touch support should work

## Credits

- **Engine**: [Wukong Xiangqi](https://github.com/maksimKorzh/wukong-xiangqi)
  by maksimKorzh (Code Monkey King), MIT License
- **Game UI**: Built for Kindle Mesquite, inspired by KShips and KWordle
- **Shortcut mechanism**: Based on the Kindle homebrew community pattern

## License

- Game UI code: MIT
- Wukong engine: See `assets/wukong.js` for original license
