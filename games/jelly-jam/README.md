# Jelly Jam

A squishy match-3 puzzle. Swap wobbly jelly critters to free the reef's baby
sea turtles, then watch the leftover moves turn into an undersea dance party.

44 levels wind across four reefs: **Sunlit Shallows**, **Kelp Carnival**,
**Coral Castle** and **Glow Abyss**.

## Play

Jelly Jam loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/jelly-jam/
```

## Controls

| Input | What it does |
| --- | --- |
| Mouse / touch | Drag or swipe a jelly onto a neighbour, or click one then the other |
| Arrow keys / WASD | Move the cursor |
| Space / Enter | Pick a jelly up, then an arrow key swaps it |
| `H` or 💡 | Show a hint |
| `M` | Mute |
| `Esc` or `P` | Pause |
| Gamepad | D-pad or stick moves, **A** picks up, **Start** pauses |

## Rules

- Line up **three or more** of the same jelly. Invalid swaps wobble back.
- Matches cascade: every extra link in a chain scores more, with a rising chime.
- **Match 4** in a line → **striped jelly**, clearing that row or column.
- **L or T shape** → **bubble bomb**, clearing three by three.
- **Match 5** in a line → **rainbow pearl**, clearing every jelly of one colour.
- Swap two specials together for something much bigger: stripe + stripe cuts a
  full cross, bomb + stripe a fat cross, bomb + bomb a five by five, pearl +
  special turns a whole colour into specials, and pearl + pearl clears the
  board.
- Goals vary by level: reach a score, collect a colour, clear the sand and
  seaweed under the jellies, break coral, free ice-locked jellies, or drop
  turtle eggs out of the bottom of the board.
- Finish the goal and any leftover moves become specials in a **reef party**.
- Run out of moves and you get **+5 free moves**, once per level.
- Sit still for five seconds and a hint glows. If no move exists at all, the
  reef shuffles itself.

Stars come from the score: three thresholds per level, tuned so that finishing
the goal earns one star and playing well earns three. Progress, stars and best
scores live in `localStorage` under `jelly-jam.v1`.

## Layout

| File | Responsibility |
| --- | --- |
| `src/rng.js` | Seeded PRNG, so a level is identical every time from its seed |
| `src/board.js` | Cells, match detection, gravity, refills, shuffling |
| `src/specials.js` | What each special clears, and every special-on-special combo |
| `src/levels.js` | Level data (layouts drawn as text), goals, board builder |
| `src/game.js` | One level in progress: moves, score, goals, resolution steps |
| `src/ai.js` | Autoplayer for the balance tests and the `?demo` attract mode |
| `src/save.js` | Progress in `localStorage` |
| `src/render.js` | Canvas drawing: tiles, jelly faces, blasts, bubbles |
| `src/audio.js` | Synthesized sound effects and the bubbly music loop |
| `src/map.js` | The winding reef map |
| `src/main.js` | Screens, controls and the game loop |

`src/board.js`, `src/specials.js`, `src/levels.js`, `src/game.js`, `src/ai.js`,
`src/save.js` and `src/rng.js` are DOM-free, so the Node tests can play whole
levels.

## Debug parameters

- `?level=12` jump straight into a level
- `?seed=7` pin the board deal (with `?level=`)
- `?map` open on the reef map
- `?demo` let the autoplayer take over — handy for screenshots

## Tests

```sh
node --test 'games/jelly-jam/tests/*.test.js'
```

The suite covers match shapes, special creation and combos, gravity and
refills, move detection and shuffling, every goal type, level-data validity,
and an autoplayer that has to clear the first five levels without using the
free continue.
