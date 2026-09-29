# Glowloop

Lasso the fireflies. Match the colors. Light up the night.

A calm-but-quick arcade game for all ages. Draw loops with your finger or mouse
to catch fireflies and fill your jar before the night ends.

## How to play

- **Draw a loop.** Whenever your trail crosses itself, everything inside is caught.
- **One color per loop = Harmony.** Harmony scores `10 × n²` (3 fireflies = 90) instead
  of `10 × n`. Back-to-back Harmonies build a streak multiplier (up to ×3).
- **Thornbugs** (spiky, from night 2) cost 5 seconds if caught in a loop.
- **Golden** fireflies add 5 seconds. **Rainbow** ones match any color.
- Your trail fades after ~1.6s, so draw loops quickly.
- Fill the jar to pass the night; 1.5× and 2× the target earn extra stars.

Every color also has a shape (● ◆ ▲ ■) so the game is playable without color
vision. Keys: `P`/`Esc` pause, `M` mute. Motion effects respect
`prefers-reduced-motion`.

## Run

No build step and no dependencies. Open `index.html` in a browser, or serve it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Test

```sh
node --test 'tests/*.test.js'
```

## Layout

- `logic.js`: pure rules and geometry (loop detection, scoring, difficulty), shared by the browser and tests
- `game.js`: rendering, input, audio (Web Audio synthesis, no asset files), game flow
- `style.css`, `index.html`: menus and overlays
