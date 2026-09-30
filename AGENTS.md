# Gamer development guide

## Project overview

Gamer is a collection of small, independent browser games. The root package
provides shared developer commands; it has no runtime dependencies or build
step.

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
```

`npm test` runs every game's Node test files. `npm run serve` starts the
no-cache development server at `http://localhost:8000`; use it for games that
load ES modules, including `neon-nighthawk`, `starhopper`, and
`sundown-rally`.

Glowloop can also open directly from disk. The Three.js games must be served
over HTTP because browser ES module loading does not work from `file://`.

## Arcade

The root `index.html` is the arcade: a game picker built from the manifest
in `arcade/games.js`, styled by `arcade/arcade.css`, and tested by
`arcade/tests/`. The arcade may link to and show files from any game folder;
games never depend on arcade files.

## Game conventions

- Do not add a build step or npm dependency unless the task explicitly requires
  one.
- Keep simulations independent from DOM and Three.js. Rendering reads game
  state and must not mutate it.
- Keep procedural world content deterministic by passing or deriving a seed.
- Namespace `localStorage` keys with the game slug and version, such as
  `glowloop.v1`.
- Keep controls usable with keyboard, touch, and gamepad where the game already
  supports those inputs.
- During active play, hide the pointer after a brief period without mouse
  movement and show it again when the pointer moves.
- Respect `prefers-reduced-motion` when adding motion-heavy effects.
- Every game links back to the arcade. Its title screen shows a `← Arcade`
  link, and its pause menu has a `Back to arcade` button. Both go to
  `../../index.html`. Escape (and gamepad Start, where the game supports
  gamepads) pauses active play.
- Every game ships a `cover.svg` (16:10, 800×500 viewBox) that the arcade
  shows as its card art, and has an entry in `arcade/games.js`.
- Keep third-party files and their licenses intact.

## Current game boundaries

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

## Verification

For a behavior change, add or update focused Node tests for affected pure
logic, then run `npm test`. For UI, rendering, input, audio, or browser storage
changes, also exercise the affected game through `npm run serve`.

Do not modify unrelated games or generated/vendor files unless the task
requires it.
