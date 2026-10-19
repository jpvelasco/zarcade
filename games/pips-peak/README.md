# Pip's Peak

Help Pip the little sprout hop up a mountain of floating islands to the
sunrise at the top. A 2D platformer with tight, forgiving controls: twelve
hand-built levels across four zones, seeds to gather, three hidden golden
acorns per level, and flowers that bloom into checkpoints.

It is meant to be kind. Thorns and long falls cost a petal and put you back at
the last flower — nothing sends you to the start, and a bloomed flower hands
your petals back.

## How to play

- **Run** with the arrow keys or `A`/`D`.
- **Jump** with `Space`, `Z`, `W` or `Up`. Hold the button to jump higher.
- **Bounce** on beetles and bees to pop them, and on mushrooms to fly.
- **Drop through** a wooden plank by holding `Down` and jumping.
- **Gather seeds**, find the **3 golden acorns** hidden in every level, and
  touch the **flowers** so you respawn nearby.
- Reach the **sunrise** to finish. Stars: one for the summit, one for every
  seed, one for all three acorns.

Two abilities arrive as you climb: a **second jump in midair** in the
Waterfall Caves, and a **wall kick** (slide a wall, then jump off it) on the
Windy Cliffs.

| Key | Does |
| --- | --- |
| `Esc` / `P` | Pause (also the gamepad Start button) |
| `M` | Mute |
| `R` | Restart the level |

Gamepads work too: left stick or d-pad to move, `A`/`B` to jump. On the
menus the d-pad picks a button, `A` presses it and `Start` or `B` resumes. On a touch
device, on-screen left/right/duck/jump buttons appear: slide your thumb
between ◀ and ▶ to turn around without lifting it, and tap ▼ on a wooden
plank to drop through. Portrait phones get a nudge to turn sideways.

## Zones

| Zone | Levels | New each level |
| --- | --- | --- |
| Meadow | 1–3 | running and jumping, beetles and planks, mushrooms and moving leaves |
| Waterfall Caves | 4–6 | the second jump and water, crumbling blocks, bees |
| Windy Cliffs | 7–9 | wall kicks, updrafts and gusts, sun latches and stone gates |
| Snowy Summit | 10–12 | ice, a blizzard of everything at once, the final climb |

Progress, best times, stars and the mute setting live in `localStorage` under
`pips-peak.v1`.

## Run

Needs a server, because the game is split into ES modules:

```sh
npm run serve        # from the repo root, then open http://localhost:8000
```

Then pick Pip's Peak from the arcade, or open
`http://localhost:8000/games/pips-peak/`.

Handy query parameters while working on it:

- `?level=7` — open a level straight away, locked or not.
- `?peek=1` — zoom out to fit the whole level in view. Good for checking
  level shapes.

## Test

```sh
node --test 'games/pips-peak/tests/*.test.js'
```

The tests cover the movement feel (coyote time, jump buffering, variable jump
height, ice, wall slides, one-way planks, mushrooms), the collision and scoring
rules, the save file, every level's data, and a scripted pilot that clears
level 1 without losing a petal.

Levels are validated two ways: structurally (one start, one sunrise, three
acorns, rectangular grids, gates that have latches) and by a coarse
reachability flood in `src/reach.js`, which walks a graph of standable tiles
with a generous jump envelope and fails if any seed, acorn, flower, latch or
the sunrise is walled off. `reachOverlay(level)` prints a level as text with
`+` on everything Pip can reach, which is how the levels were checked while
they were being drawn.

## Layout

| File | What it holds |
| --- | --- |
| `src/tiles.js` | the tile vocabulary and predicates |
| `src/levels.js` | zones and all twelve levels as ASCII grids (pure data) |
| `src/physics.js` | Pip's movement: acceleration, jumps, wall slides, collision |
| `src/world.js` | the simulation: collectibles, enemies, hazards, gates, results |
| `src/progress.js` | the save file and star/time bookkeeping |
| `src/reach.js` | the level reachability checker |
| `src/ai.js` | a small "run right and jump" pilot used by the tests |
| `src/render.js` | all the canvas drawing, camera and particles |
| `src/audio.js` | synthesized chiptune and sound effects (no audio files) |
| `src/input.js` | keyboard, gamepad and touch folded into one input state |
| `src/main.js` | screens, HUD, level map and the game loop |
| `index.html`, `style.css` | the page, menus and HUD |
