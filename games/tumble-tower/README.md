# Tumble Tower

A wobbly stacking game for the Starlight Arcade. A crane lowers one cheerful
animal at a time: chunky hippos, long giraffes, round pandas, flat turtles and
eight more friends to collect. Move it, turn it, let go, and build up to the
goal line. Then keep the tower standing for 3 seconds!

## Modes

- **Climb**: 32 levels over five islands (Meadow Isle, Breezy Bluffs with
  wind, Frosty Floe with slippery ice animals, Bobbing Bay on a rocking raft,
  and Summit Isle with everything). Stars: one for the clear, one for building
  1 m over the line, one for using no more animals than par.
- **Endless Tower**: as high as you can. Three splashes end the run; a breeze
  picks up above 20 m.
- **Pass & Play**: 2–4 players take turns. Whoever drops the animal that
  falls into the sea loses.
- **Daily Tower**: one tower per day from the local date, with a streak.

Clearing islands brings new animals (new block shapes) into the mix, and stars
or tall Endless towers unlock the Candy, Jungle and Space themes.

## Controls

| Action | Mouse / touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Move | drag anywhere | ← → / A D | stick, d-pad |
| Turn | tap / click, right-click, wheel, Turn button | ↑ W X (back: Z Q) | B Y RB (back: X LB) |
| Drop | let go after a drag, Drop button | Space ↓ S Enter | A |
| Pause | ❚❚ button | Esc / P | Start |
| Mute | 🔊 button | M | |

## Files

- `src/physics.js` — the game's own 2D rigid-body engine (convex polygons and
  circles, SAT + clipping manifolds, soft-contact sequential impulses with
  substeps and warm starting, friction, rolling resistance, island sleeping).
- `src/game.js` — rules: crane, turns, splashes, goal hold, modes.
- `src/animals.js`, `src/levels.js`, `src/daily.js`, `src/themes.js` — data.
- `src/ai.js` — look-ahead autoplayer (title-screen demo, `?autopilot`, tests).
- `src/save.js` — progress under `tumble-tower.v1`.
- `src/sprites.js`, `src/render.js`, `src/audio.js`, `src/input.js`,
  `src/main.js` — browser side.

## Debug parameters

- `?level=N` start Climb level N (1–32)
- `?mode=endless|daily|pass` jump straight into a mode
- `?autopilot` let the planner play
- `?theme=sunny|candy|jungle|space` preview a theme

## Tests

```sh
node --test 'games/tumble-tower/tests/*.test.js'
```
