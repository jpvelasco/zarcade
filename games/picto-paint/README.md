# Picto Paint

A cozy picture-logic (nonogram / picross) game. The numbers beside each row
and above each column say how many squares in a row are filled, in order.
Fill the right squares and a hidden pixel picture appears. When it is done,
the picture colours itself in and comes to life (the cat blinks, the rocket
launches, the fish swims) and goes into your gallery.

89 hand-drawn pictures in eight albums:

| Album | Size | Clues |
| --- | --- | --- |
| First Doodles | 5×5 | black and white |
| Animal Friends | 8×8 – 10×10 | black and white |
| Snack Shack | 10×10 | black and white |
| Things That Go | 12×12 | black and white |
| Starry Skies | 15×15 | black and white |
| Colour Critters | 8×8 – 10×10 | colour |
| Colour Café | 12×12 | colour |
| Colour Cosmos | 15×15 | colour |

Albums open after a few finished pictures in total, and everything inside an
open album can be played in any order. In colour albums each clue has a
paint: blocks of the same colour need a gap, different colours may touch.

Every picture has exactly one answer that can be reached by line logic
alone, with no guessing. The tests prove it with a line solver.

## Play

Picto Paint loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/picto-paint/
```

## Goals and rewards

- **Stars**: ★ for finishing, ★ for no hints, ★ for beating the par time
  shown in the top bar. Mistakes never cost stars.
- **Personal bests** for every picture, with a *New best!* on the results card.
- **Daily Critter**: a new 10×10 creature every local day, generated from
  the date and proven unique. Solving it grows a gentle streak and adds the
  critter to its own shelf in the gallery.
- **Studio**: six paper palettes and six pencil styles (pencil, crayon, ink
  stamp, watercolour, pixel block, neon marker) unlock with stars.
- **Gallery**: every finished picture, animated when you open it.

## Modes

- **Helper** (default, great for kids): a fill that should be empty turns
  into a ✕ with a soft boop, a wrong colour or a wrong ✕ is wiped.
- **Expert**: no checking at all. The picture finishes when the fills match.

Switch in the Studio or the pause menu.

## Controls

| Input | What it does |
| --- | --- |
| Click / tap | Fill a square (or clear it if it already has that paint) |
| Drag | Paint along the row or column you started in |
| Right-click / long-press | Use the other tool (✕ when filling) |
| ✕ button / T | Toggle between fill and ✕ |
| Paint buttons / 1–6 / C | Pick a paint in colour puzzles |
| Pinch / Ctrl + wheel / + − | Zoom 10×10 and bigger boards (two fingers or wheel pan) |
| Arrow keys / WASD | Move the cursor |
| Space / Enter (hold + arrows) | Fill and drag-fill from the cursor |
| X (hold + arrows) | Cross and drag-cross |
| Z / Ctrl+Z, Y / Ctrl+Shift+Z | Undo, redo |
| H | Hint: one line-logic step, applied and explained |
| Esc / P | Pause |
| M | Sound on/off |

Finished lines get crossed off automatically and their clues dim. Clue blocks
that are already closed off from either end dim one at a time.

## Debug parameters

| Parameter | Effect |
| --- | --- |
| `?puzzle=<id>` | Start a picture directly (ids in `src/puzzles.js`) |
| `?album=N` | Open album N (0-based) |
| `?daily` | Start today's Daily Critter |
| `?gallery`, `?studio` | Open those screens |
| `?unlock` | Open every album and cosmetic (not saved) |
| `?autoplay` | Solve with hints, one step at a time, and move on (nothing is saved) |

`window.PP` exposes the board, save and helpers (`PP.hint()`,
`PP.solveNow()`, `PP.crash()` to test the crash screen).

## Files

| File | Responsibility |
| --- | --- |
| `src/solver.js` | Colour-aware line solver, clues from pictures |
| `src/puzzle.js` | Paint box, picture → puzzle, par times |
| `src/puzzles.js` | The eight albums and their pictures |
| `src/board.js` | One puzzle in progress: strokes, undo, auto-cross, Helper checks |
| `src/hints.js` | Hint steps and kid-friendly explanations |
| `src/daily.js` | Seeded Daily Critter generator, streaks |
| `src/progress.js` | Stars, unlocks, cosmetics, what to play next |
| `src/save.js` | Progress under `picto-paint.v1` |
| `src/perf.js` | Frame-time telemetry |
| `src/anim.js` | Living-picture animations |
| `src/render.js` | Canvas renderer, baked pencil tiles, particles |
| `src/audio.js` | WebAudio pencil sounds, chimes and a music-box loop |
| `src/main.js` | Screens, input, loop, telemetry |

## Tests

```sh
node --test 'games/picto-paint/tests/*.test.js'
```

They check that every picture is unique and line-solvable, that hints alone
solve every puzzle without a wrong square, that a year of Daily Critters are
all solvable, and the board, progress and save rules.
