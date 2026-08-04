# Xiangqi - Chinese Chess for Kindle

A Chinese Chess (象棋/Xiangqi) game for Kindle e-readers, built on the
[Wukong](https://github.com/maksimKorzh/wukong-xiangqi) JavaScript engine
by Code Monkey King.

## Features

- **vs AI mode** — play as Red or Black against the Wukong engine
- **Two Player mode** — local hot-seat play
- **3 AI difficulty levels** — Easy (depth 1), Medium (depth 3), Hard (depth 5)
- **Traditional board style** — pieces on intersections, 楚河漢界, palace diagonals
- **e-ink optimized** — black & white, minimal refresh, touch-friendly
- **Popup menu** — New Game, Undo, Flip Board, Show/Hide Moves, Main Menu
- **Move history** — toggleable PGN display in UCI notation
- **Piece styles** — Red: white background red text; Black: black background white text

## Tech Stack

- **Engine**: [Wukong Xiangqi](https://github.com/maksimKorzh/wukong-xiangqi) —
  pure JavaScript, negamax + alpha-beta pruning + Zobrist hashing + repetition detection
- **UI**: Vanilla HTML/CSS/JavaScript (no frameworks, no dependencies)
- **Board rendering**: SVG data URL background + absolutely positioned pieces on intersections
- **Runtime**: Kindle Mesquite (WebKit-based app container, ~Safari 5 / ES5)

## File Structure

```
xiangqi/
├── config.xml              # Mesquite widget configuration (must include <feature> + <kindle:messaging>)
├── index.html              # Game UI + Chrome bar integration
├── main.css                # Board styling (e-ink optimized, pieces on intersections)
├── main.js                 # Game logic + UI binding (ES5 only)
├── shortcut_xiangqi.sh     # Kindle launcher shortcut (with embedded base64 icon)
├── assets/
│   └── wukong.js           # Wukong Xiangqi engine (Babel-transpiled to ES5)
├── kual_extension/         # KUAL extension for easy launching
│   ├── config.xml
│   ├── menu.json
│   └── bin/
│       └── launch.sh       # Copy of shortcut script
├── AGENTS.md               # Development notes for AI agents
└── README.md
```

## Installation

### Via KUAL (recommended)

1. Copy the `xiangqi/` folder to `/mnt/us/documents/xiangqi/` on your Kindle
2. Copy the `kual_extension/` folder to `/mnt/us/extensions/xiangqi/`
3. Eject the Kindle, open **KUAL**, select **Xiangqi** → **Install & Launch**
4. The script copies game files to `/var/local/mesquite/xiangqi/`, registers the app, and launches it

### Via shortcut script

1. Copy the `xiangqi/` folder to `/mnt/us/documents/xiangqi/` on your Kindle
2. Copy `shortcut_xiangqi.sh` to `/mnt/us/documents/shortcut_xiangqi.sh`
3. Eject the Kindle and tap the "Xiangqi" entry in your library

**Note**: After updating game files, you must re-run the shortcut/KUAL extension
to copy the new files to `/var/local/mesquite/xiangqi/`. Launching directly from
the Kindle app list uses cached files.

## How to Play

1. Select game mode from the menu (vs AI Red, vs AI Black, or Two Player)
2. Tap a piece to select it — legal moves are highlighted with dots
3. Tap a destination intersection to move; tap a capturable piece to capture
4. In AI mode, the engine responds automatically
5. Tap `[Menu]` in the top-right for game controls

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
- Requires jailbroken Kindle with KUAL installed

## Credits

- **Engine**: [Wukong Xiangqi](https://github.com/maksimKorzh/wukong-xiangqi)
  by maksimKorzh (Code Monkey King), MIT License
- **Game UI**: Built for Kindle Mesquite, inspired by KShips and KWordle
- **KUAL extension pattern**: Based on the Kindle homebrew community

## License

- Game UI code: MIT
- Wukong engine: See `assets/wukong.js` for original license
