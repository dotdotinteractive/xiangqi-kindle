# AGENTS.md - Development Notes for Xiangqi on Kindle

This file records critical lessons learned during development. Read this before
making changes to avoid repeating hard-won debugging sessions.

## Kindle Mesquite Platform Constraints

Mesquite is a WebKit-based app container on jailbroken Kindles. Its JavaScript
engine is approximately **Safari 5 / WebKit 533.16** — very old, ES5 only.

### What does NOT work (will crash the app)

- **ES6 `let` / `const`** — parse error, immediate crash on page load
- **Arrow functions `=>`** — not supported
- **Template literals (backticks)** — not supported
- **`String.prototype.includes()`** — use `indexOf() !== -1` instead
- **`classList` API** — not reliably supported; use `className` string manipulation
- **`addEventListener` for click** — use `.onclick = function() {}` instead
- **`querySelectorAll`** — avoid; use `getElementById` with explicit IDs
- **`Symbol`** — not available; Babel's `_typeof` helper will crash if it references Symbol
- **`console` object** — may not exist; add a polyfill at the top of every JS file:
  ```javascript
  if (typeof console === 'undefined') {
      var console = { log: function() {}, error: function() {}, warn: function() {}, info: function() {} };
  }
  ```

### What DOES work

- `var` declarations (use only these)
- `document.getElementById()`
- `.onclick = function() {}`
- `document.addEventListener('DOMContentLoaded', init)` (for init only)
- `innerHTML` for rendering
- `JSON.parse` / `JSON.stringify`
- `Math.random()`, `Date.now()`, `new Date().getTime()`
- `setTimeout()`
- CSS: `border-radius`, `opacity`, `position: absolute/relative`
- SVG data URLs as CSS backgrounds
- `encodeURIComponent()` for building SVG data URLs

### Reference app: KShips

KShips (at `/mnt/us/documents/KShips/`) is a known-working Mesquite app.
When in doubt, check what patterns KShips uses:
- Uses `'use strict'` — this is fine
- Uses `getElementById` + `.onclick` — never `querySelectorAll` or `classList`
- Uses `addEventListener` only for `DOMContentLoaded`
- Uses `JSON.parse/stringify`, `Math.random`, `setTimeout`

## config.xml — Critical Requirements

The `config.xml` MUST include these sections or the app will crash when
buttons are clicked (event handling fails silently):

```xml
<feature name="http://kindle.amazon.com/apis" required="true">
    <param name="appmgr" value="yes" />
    <param name="messaging" value="yes" />
    <param name="gestures" value="yes" />
    <param name="chrome" value="yes" />
    <!-- ... other params ... -->
</feature>

<kindle:messaging>
    <kindle:app name="com.lab126.pillow" value="yes" />
    <kindle:app name="com.lab126.chromebar" value="yes" />
    <kindle:app name="com.lab126.readnow" value="yes" />
</kindle:messaging>
```

**Do NOT include `ApplicationCachePath`** in `<kindle:resources>` — it causes
caching issues where updated files don't take effect.

## Deployment & Caching

### File flow

1. Source files live at `/mnt/us/documents/xiangqi/`
2. The shortcut script copies them to `/var/local/mesquite/xiangqi/`
3. Mesquite launches the app from `/var/local/mesquite/xiangqi/`

### Important: must re-run shortcut after updates

If you update files in `/mnt/us/documents/xiangqi/`, the app will NOT pick up
changes automatically. You must re-run the shortcut script (via KUAL or the
documents list) to copy files to `/var/local/mesquite/xiangqi/`.

Launching directly from the Kindle app list uses the **cached** copy at
`/var/local/mesquite/xiangqi/`.

### KUAL extension

The KUAL extension at `/mnt/us/extensions/xiangqi/` provides a menu item to
run the shortcut. Its `menu.json` must use relative paths with `sh` prefix:

```json
{
    "items": [
        {"name": "Install & Launch", "priority": 1, "action": "sh bin/launch.sh"}
    ]
}
```

## Wukong Engine (assets/wukong.js)

### Transpilation

The original Wukong engine uses ES6 (`let`, `const`, computed property names).
It must be transpiled to ES5 with Babel before deployment:

```bash
npx babel src/wukong.js --out-file wukong_es5.js \
  --presets=@babel/preset-env \
  --targets '{"ie":"11","safari":"5"}'
```

Use these Babel assumptions to avoid Symbol-based helpers:
```json
{
  "assumptions": {
    "iterableIsArray": true,
    "mutableTemplateObject": true,
    "objectRestNoSymbols": true,
    "setComputedProperties": true,
    "setSpreadProperties": true
  }
}
```

### Post-transpilation fixes

After Babel transpilation, manually fix:
1. **`String.includes()`** → `indexOf() !== -1` (Babel doesn't polyfill methods)
2. **Hash table size** → reduce `var hashEntries` from 838,860 to ~1,000-20,000
   (Kindle has limited memory; 838K objects = ~16MB = OOM crash)
3. **Add `var` to `hashKey`** — original code has implicit global
4. **Add `guiScore`, `guiDepth`, `guiTime`, `guiPv`** declarations — referenced but not declared
5. **Add console polyfill** at top of file

### Engine API

Key methods used by the UI:
- `new Engine()` — create engine instance (calls `initHashTable()` automatically)
- `engine.setBoard(engine.START_FEN)` — reset to initial position
- `engine.getPiece(square)` — get piece at mailbox square (0=empty, 1-7=red, 8-14=black)
- `engine.getSide()` — 0=red to move, 1=black to move
- `engine.generateLegalMoves()` — returns array of `{move: int}`
- `engine.getSourceSquare(move)` / `engine.getTargetSquare(move)` — extract from/to
- `engine.makeMove(move)` / `engine.takeBack()` — apply/undo
- `engine.search(depth)` — AI search, returns best move (0 if none)
- `engine.getTimeControl()` / `engine.setTimeControl(tc)` — time limits
- `engine.moveToString(move)` — UCI notation (e.g. "b0c2")
- `engine.moveStack()` — move history for PGN

### Board representation (mailbox 0x88 variant)

Squares use an 11-wide mailbox: `square = (2 + displayRow) * 11 + (file + 1)`
- displayRow 0 = top (black side), displayRow 9 = bottom (red side)
- file 0 = left, file 8 = right

## Board Rendering

Xiangqi pieces sit ON line intersections, not inside squares (unlike Chess).
The board has 9×10 intersection points.

Current approach:
- Board background drawn as SVG data URL (grid lines, river, palace diagonals, markers)
- Pieces rendered as absolutely positioned `<div>` elements at intersection coordinates
- `CELL` constant (38px) controls spacing between intersections
- `PAD` constant (22px) controls margin for edge pieces

## Debugging on Kindle

There is no console access on the Kindle. To debug:
1. Add a visible error log div in HTML: `<div id="error-log"></div>`
2. Wrap code in try/catch and append errors to the div:
   ```javascript
   function log(msg) {
       var el = document.getElementById('error-log');
       if (el) el.innerHTML += msg + '<br>';
   }
   ```
3. Use binary search: strip features until the app works, then add them back one by one
4. Test the engine separately in Node.js: `node -e "var E=require('./assets/wukong.js').Engine;..."`

## Common Crash Causes (in order of likelihood)

1. **Missing `<feature>` in config.xml** — buttons crash on click
2. **ES6 syntax** — parse error on page load
3. **`console` undefined** — ReferenceError during engine init
4. **`classList` usage** — not supported, crashes on first DOM manipulation
5. **Large hash table** — OOM during `new Engine()`
6. **`String.includes()`** — TypeError
7. **Stale cache** — app runs old files from `/var/local/mesquite/`
