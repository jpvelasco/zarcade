# Bumper Blobs

Couch party sumo for 1–4 players. Squishy jelly blobs bump each other off
floating dessert arenas. Empty seats fill with bots (Easy, Normal or Hard),
so you can also play alone, on a keyboard, a gamepad or a phone.

## Play

Bumper Blobs loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/bumper-blobs/
```

- **Party · 1–4 players**: pick the match settings, then everyone presses
  their dash button to join. Pick a colour, face and hat, press dash again
  when ready. The match starts when everyone is ready (or press Start).
- **Quick match vs bots**: you against three bots with your saved settings.
  Every keyboard scheme, every gamepad and touch all control your blob.

## Controls

| Player | Move | Dash (hold, let go) | Ground-pound |
| --- | --- | --- | --- |
| Keys 1 | W A S D | Space | E (or Q) |
| Keys 2 | Arrows | Enter | Right Shift (or /) |
| Keys 3 | I J K L | U | O |
| Keys 4 | Numpad 8 4 5 6 | Numpad 0 | Numpad . |
| Gamepad 1–4 | Stick or d-pad | A (or X) | B (or RB) |
| Touch (one player) | Drag on the left side | DASH button | POUND button |

- **Dash-bump**: hold to charge (your blob squashes and shivers), let go to
  launch. A full charge flies about twice as fast as a tap.
- **Ground-pound**: let go of a charge without a direction, or press pound.
  Hop, slam, and shove everyone nearby.
- **Dig in**: just got bonked? Push against the slide to slide less.
- On the join screen: left/right changes colour, up/down changes hat, pound
  (gamepad X) changes face, gamepad B leaves.
- `Esc`, `P` or gamepad **Start** pauses. `M` mutes.

## Modes

- **Last Blob Standing**: rounds on rotating arenas, first to 2, 3 or 5 round
  wins. After 60 seconds a sudden-death ring closes in.
- **King of the Hill**: sit alone in the glowing zone to score a point a
  second. The zone hops every 12 seconds. First to 20, 30 or 45.
- **Coin Grab**: grab coins; falling off drops three back onto the arena.
  First to 15, 25 or 40.

Timed modes last up to two minutes; ties get 30 seconds of overtime.
Settings: arena (mix, random or a favourite), number of bots, bot skill,
power-ups on/off and bombs on/off.

## Arenas

Pudding Plate (classic), Shrinkin' Sundae (shrinks), Frosty Rink (ice),
Conveyor Cafe (belts), Spin Cycle (turntable), Bumper Garden (mushroom
bumpers), Lava Lagoon (rising lava), Teeter Tower (seesaw), Crumble Cookie
(tiles crack and fall) and Donut Drift (a hole in the middle).

Power-ups: **Giant** (big and heavy), **Sticky** (blobs you hit are slowed),
**Magnet** (pulls others in) and **Bubble shield** (blocks one hit). Bombs
land where a red circle blinks.

## Progress

Stars come from matches (1 for playing, 1 per round won, 3 for a win) and ten
trophies (5 each). Stars unlock eleven hats. Settings, looks, stats, stars
and trophies are saved under the `bumper-blobs.v1` local-storage key.

## Files

| File | Responsibility |
| --- | --- |
| `src/config.js` | Tuning: speeds, dash and pound, power-ups, round timings |
| `src/rng.js` | Seeded PRNG |
| `src/arenas.js` | Arena data and floor rules: where the ground is, belts, turntable, seesaw, lava, tiles |
| `src/physics.js` | Blob-vs-blob collisions with momentum exchange, bumpers, radial pushes |
| `src/world.js` | One round: blobs, dash, pound, ring-outs, power-ups, bombs, sudden death |
| `src/modes.js` | Scoring and finishing rules for each mode |
| `src/ai.js` | Bots: edge probing, target picking, lining up dashes, fleeing edges |
| `src/match.js` | Rounds, arena rotation, match winner, headless bot matches |
| `src/save.js` | Colours, faces, hats, trophies, stars and the save |
| `src/render.js` | Canvas drawing: tilted arenas, soft-body blobs, faces, hats, particles, podium |
| `src/audio.js` | Synthesized sound, crowd and music |
| `src/input.js` | Keyboard schemes, gamepads and touch controls |
| `src/main.js` | Screens, join flow, game loop, HUD and telemetry |
| `src/perf.js` | Frame-time telemetry (shared with Comet Crush) |

Everything except `render.js`, `audio.js`, `input.js` and `main.js` is
DOM-free, so the Node tests can play whole matches.

## Debug parameters

- `?quick` start a quick match at once
- `?demo` watch a four-bot match
- `?autopilot` bots drive the human seats too
- `?arena=lava` and `?mode=koth|coins|lbs` override the saved settings
- `?bots=2`, `?skill=hard` set bots
- `?seed=7` pin the match seed
- `?speed=4` fast-forward the simulation
- `?setup`, `?join` open those screens directly

## Tests

```sh
node --test 'games/bumper-blobs/tests/*.test.js'
```

The suite covers collision response and momentum, bumpers and pushes, arena
data validity (spawns, zones and safe spots on solid ground for every arena),
each arena twist, ring-out detection and credit, dash charge, pound, shield,
giant, hitstop, sudden death, determinism, scoring in all three modes, bot
targeting and edge awareness, difficulty ordering, full bot-vs-bot matches
that end with a winner, and saves.
