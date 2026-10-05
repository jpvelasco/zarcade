# Starlight Arcade development guide

## Project overview

Starlight Arcade is a collection of small, independent browser games. The root
package provides shared developer commands; it has no runtime dependencies or
build step. The catalogue changes often, so use `arcade/games.js` rather than
hardcoding a list or count of games in code or documentation.

Each game lives in `games/<slug>/` and must remain self-contained:

- `index.html` and `style.css` define its page and presentation.
- Browser behavior belongs in that game's JavaScript files.
- Pure game rules belong in DOM-free modules so Node can test them.
- Tests belong in `games/<slug>/tests/*.test.js`.
- A game may only reference files inside its own directory. Vendored libraries,
  such as `vendor/three/`, stay with the game that uses them.

## Development commands

Run commands from the repository root:

```sh
npm test
npm run serve
npm run sync-telemetry
```

`npm test` runs the arcade, server, and every game's Node test files.
`npm run serve` starts the no-cache development server at
`http://localhost:8000`; use it for games that load ES modules, including
`neon-nighthawk`, `starhopper`, and `sundown-rally`. It also accepts local
OTLP logs at `/v1/logs`, writing ignored output under `logs/`.
`npm run sync-telemetry` copies the canonical shared browser files into every
game after their arcade copies change.

Glowloop can also open directly from disk. The Three.js games must be served
over HTTP because browser ES module loading does not work from `file://`.

## Arcade

The root `index.html` is the arcade: a game picker built from the manifest
in `arcade/games.js`, styled by `arcade/arcade.css`, and tested by
`arcade/tests/`. The arcade may link to and show files from any game folder;
games never depend on arcade files, except for their intentionally copied
shared browser files.

The manifest and the direct child folders of `games/` must have an exact
one-to-one match. Keep each entry's slug, supported controls, accent, and
`needsServer` value accurate. A game that uses ES modules must have
`needsServer: true`, since it cannot reliably run from `file://`.

## Game conventions

- Do not add a build step or npm dependency unless the task explicitly requires
  one. Do not introduce a CDN or external asset unless the task explicitly
  requires it.
- Keep simulations independent from DOM and Three.js. Rendering reads game
  state and must not mutate it.
- Keep procedural world content deterministic by passing or deriving a seed.
- Namespace `localStorage` keys with the game slug and version, such as
  `glowloop.v1`. Read storage defensively and sanitize saved fields so a
  damaged or unavailable save cannot stop the game from loading.
- Keep controls usable with keyboard, touch, and gamepad where the game already
  supports those inputs.
- During active play, hide the pointer after a brief period without mouse
  movement and show it again when the pointer moves.
- Respect `prefers-reduced-motion` when adding motion-heavy effects.
- Every game links back to the arcade. Its title screen shows a `← Arcade`
  link, and its pause menu has a `Back to arcade` button. Both go to
  `../../index.html`. Escape (and gamepad Start, where the game supports
  gamepads) pauses active play.
- Every game loads its copy of `telemetry.js` before any other script, with
  `data-service` set to its slug. Report game events with
  `window.Telemetry?.log.event(...)` and wrap the frame loop with
  `Telemetry.guard(...)` so crashes show the crash screen. Never edit a game's
  shared copies directly: change `arcade/telemetry.js` or
  `arcade/fullscreen.js`, then run `npm run sync-telemetry`. Every game loads
  `fullscreen.js` after telemetry and before its own scripts. Logs must not
  contain personal data.
- Every game ships a `cover.svg` (16:10, 800×500 viewBox) that the arcade
  shows as its card art, and has an entry in `arcade/games.js`. New games also
  need an entry page, styles, favicon, README, shared files, and focused
  `node:test` coverage.
- Keep third-party files and their licenses intact.

## Architecture notes

- `glowloop` uses classic browser scripts. Keep its pure rules in `logic.js`,
  which both the browser and CommonJS Node tests load.
- `sundown-rally` and `starhopper` use ES modules with a DOM-free simulation in
  `src/world.js`. Three.js renderers only read world state.
- `neon-nighthawk` is a Canvas ES-module game. Keep city generation,
  contracts, upgrades, AI, and the delivery simulation in its DOM-free
  `src/*.js` modules. `src/main.js`, `src/render.js`, and `src/audio.js` own
  browser-specific behavior.
- Neon Nighthawk Shift Codes must recreate city layout, contract sequence,
  traffic, and weather. Preserve deterministic behavior when changing
  generation code.
- Neon Nighthawk saves belong under the `neon-nighthawk.v1` local-storage key.
  Its `?autopilot` mode is useful for browser route checks.

Most newer games use native ES modules and a local `package.json` with
`"type": "module"`. For a game not named above, read its `README.md`, entry
point, and tests before selecting an implementation pattern.

## Verification

For a behavior change, add or update focused Node tests for affected pure
logic, then run the relevant game test command and `npm test`:

```sh
node --test 'games/<slug>/tests/*.test.js'
npm test
```

For UI, rendering, input, audio, browser storage, or module-loading changes,
also exercise the affected game through `npm run serve`. Check the title
screen, active play, pause/back-to-arcade route, and the changed interaction
on the relevant desktop and touch layouts. Do not claim a browser change is
complete from a source diff alone.

Do not modify unrelated games or generated/vendor files unless the task
requires it. Before handoff, inspect `git diff` and `git status` so only
intended paths are included.
