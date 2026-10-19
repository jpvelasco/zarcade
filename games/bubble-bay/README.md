# Bubble Bay

A seaside bubble shooter for all ages. Coral the crab fires colored bubbles
from a shell launcher: match three or more to pop them, and anything left
hanging drops into the sea. Rescue the baby otters trapped in bubbles, pop
enough bubbles, or drop the anchor to clear each level.

65 levels across five places: **Tide Pools**, **The Pier**, **Lighthouse
Point**, **Coral Reef** and **Sunken Ship**, plus a **Daily Tide** puzzle.

## Play

Bubble Bay loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/bubble-bay/
```

## Controls

| Input | What it does |
| --- | --- |
| Mouse / touch | Drag to aim, release to fire (release below Coral to cancel). Mouse hover aims too |
| Tap Coral or the clam | Swap the loaded and next bubble |
| ← / → (A / D) | Aim (hold Shift for fine aim) |
| Space / ↑ / Enter | Fire |
| ↓ / X | Swap |
| 1 / 2 / 3 | Load the rainbow, bomb or lightning booster (again to put it back) |
| R | Retry the level |
| Esc / P | Pause |
| M | Mute |
| Gamepad | Stick or d-pad aims (right stick points), **A** fires, **B** swaps, **X / Y / RB** boosters, **Start** pauses |

## Rules

- The dotted guide shows exactly where the bubble will land, wall bounces
  included.
- Every few shots the plank at the top moves down a row; the shells on it
  count the shots left. Bubbles that reach the water at the bottom end the
  level.
- Out of bubbles or into the water? Once per level a friendly wave washes the
  lowest rows away and gives you five more bubbles.
- **Rainbow** bubbles match any color. **Stones** never pop: drop them.
  **Ice** cracks after two pops beside it. **Bomb** bubbles blast around them
  and **lightning** bubbles clear their row when a pop touches them.
- **Otters** are rescued by a pop beside them, a blast, or by dropping them.
- Boosters are earned by playing (the first clear of every third level, each
  new three-star result, and every daily tide). They are never sold.
- Stars come from bubbles left over when the goal is met.

## Sticky bits

- The seaside map with stars on every level.
- **Otter Cove**: 30 named otters to collect, with silhouettes for the missing.
- **Daily Tide**: a new puzzle each day (same for everyone on that date) with
  a gentle streak.
- Personal bests per level and per day; one-tap retry.

## Files

| File | Role |
| --- | --- |
| `src/grid.js` | DOM-free hex grid: shot tracing, matching, specials, dropping |
| `src/game.js` | A level in play: queue, ceiling creep, goals, stars, continue |
| `src/levels.js` | 65 generated levels and the daily tide (deterministic) |
| `src/ai.js` | Greedy autoplayer, attract mode and supply calibration |
| `src/save.js` | Save data, boosters, otters and the daily streak (`bubble-bay.v1`) |
| `src/otters.js` | Otter names and looks |
| `src/render.js`, `src/sprites.js` | Canvas view and baked art |
| `src/audio.js` | Synthesized sound and music |
| `src/map.js` | The seaside map (SVG) |
| `src/main.js` | Screens, input, loop, telemetry |
| `tests/calibrate.mjs` | Regenerates the supply table after changing level generation |

## Debug parameters

- `?level=12` start a level, `?daily` the daily tide, `?map`, `?cove`.
- `?seed=5` fix the bubble queue seed.
- `?autoplay` let the autoplayer play (it moves on to the next level).
- `BB` in the console exposes the game, view and save; `BB.crash()` tests the
  crash screen.

## Tests

```sh
node --test 'games/bubble-bay/tests/*.test.js'
```
