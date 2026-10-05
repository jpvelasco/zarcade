# Riverlight

A calm tile-turning puzzle. Turn the stepping stones so a glowing stream runs
from the spring to every flower. When the garden connects, water flows
through, the flowers bloom, koi swim the channels and fireflies come out.
There are no timers and you can't lose. Stars for using few moves are optional.

72 gardens across six seasons, each with its own gentle twist:

| Season | Gardens | Twist |
| --- | --- | --- |
| Spring Meadow | 1–12 | Splitters: one stream, many flowers |
| Summer Pond | 13–24 | Lily-pad bridges: two streams cross without mixing |
| Autumn Grove | 25–36 | One-way sluice gates and mossy stones that won't turn |
| Winter Lake | 37–48 | Frozen twins that turn together, and edges that wrap around |
| Night Garden | 49–60 | Blue and gold springs. Gold and blue mix to green through gates |
| Lotus Isles | 61–72 | Six-sided stones |

Each season ends with a showpiece shaped like a heart, a lily ring, a maple
leaf, a snowflake, a paper lantern or a lotus. **Zen garden** grows endless
new gardens with no stars.

## Play

Riverlight loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/riverlight/
```

## Rules

- Water leaves the spring through its open sides. It flows into a neighbour
  only when that neighbour has an open side facing back. Anywhere else, it
  **spills** (little splashes show where).
- A garden is complete when every stone is wet, nothing spills, and every
  flower or lantern gets its colour.
- Gates (chevrons) only let water in the way their arrows point. Mossy stones
  are already facing the right way. Stones with matching snowflake badges turn
  together.
- In the Night Garden, a green lantern needs both blue and gold. A lantern
  given the wrong colour shows a ring in the colour it wants.
- Stars: ★★★ within about 1.3× the fewest possible turns, ★★ within 2×, and
  ★ always. Undo gives the move back, and hints are free.

## Controls

| Input | What it does |
| --- | --- |
| Click / tap | Turn a stone clockwise |
| Right-click / long-press | Turn it back |
| Arrow keys / WASD | Move the cursor |
| Space / Enter / E | Turn the stone under the cursor clockwise |
| Space / Enter (results) | Next garden |
| Q | Turn it back |
| Z (or U, Backspace) | Undo |
| R | Reset the garden (undo brings it back) |
| H | Hint: highlights the next stone along the stream and which way to turn |
| M | Mute everything (🔊 button); the menus switch effects and music separately |
| Esc / P | Pause |
| Gamepad | D-pad or stick moves, **A** / RB turns, **B** / X turns back, **Y** hint, **LB** undo, **Start** pauses |

After finishing a garden, **Admire** hides the buttons for a cozy view of the
finished garden, with **Save picture** to download it as a PNG.

## Debug parameters

| Parameter | Effect |
| --- | --- |
| `?level=N` | Start garden N directly |
| `?zen` | Start a zen garden |
| `?map` | Open the garden map |
| `?unlock` | Open every garden on the map (not saved) |
| `?autoplay` | Solve gardens with hints, one tap at a time, and move on |

`window.RL` exposes the game, view, save and a few helpers in the console.

## Files

| File | Responsibility |
| --- | --- |
| `src/rng.js` | Seeded PRNG |
| `src/topology.js` | Square, wrapping and hex grids, neighbours, geometry |
| `src/flow.js` | Water simulation and the completion rule |
| `src/solver.js` | Constraint solver: counts solutions, proves gardens solvable |
| `src/generator.js` | Seeded garden generator and scrambler |
| `src/levels.js` | Seasons, the 72 level specs, showpiece shapes, zen gardens |
| `src/game.js` | One garden in progress: turns, undo, reset, hints, stars, autoplay |
| `src/save.js` | Progress under `riverlight.v1` |
| `src/perf.js` | Frame-time telemetry |
| `src/render.js` | Canvas renderer (baked sprites, water, koi, fireflies) |
| `src/audio.js` | WebAudio pads and chimes that fill out as flowers bloom |
| `src/main.js` | Screens, input, loop, telemetry |

## How gardens are made

The generator grows a random tree of channels from the spring and turns its
leaves into flowers. Bridges are placed first and crossed straight through.
Night Garden grows a green tree, turns two of its leaves into gates, and grows
the blue and gold trees from them. The solver (arc consistency over
rotations, loop pruning and a water check at the leaves) counts solutions.
The generator retries until a garden has exactly one solution. In seasons
with mossy stones, it can also lock a stone to remove a second solution.
Every garden is scrambled so it never starts complete.

Tests check that every garden is solvable and unique, that generation is
deterministic, and that the hint autoplayer finishes every garden in par.

```sh
node --test 'games/riverlight/tests/*.test.js'
```
