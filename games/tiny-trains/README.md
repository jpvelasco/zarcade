# Tiny Trains

A toy-train track-laying puzzle. Lay wooden track on a little tabletop
diorama so every coloured train reaches the station of its colour, then
press **Go** and watch them chuff, toot and drop their passengers off.

48 hand-made levels across six worlds, each adding a new idea:

| World | Levels | New idea |
| --- | --- | --- |
| Toybox Meadow | 1–8 | Straights and curves, going round things, more than one train |
| Crossing Creek | 9–16 | Crossings, and waiting your turn so trains don't bump |
| Switchback Farm | 17–24 | Flip-flop switches that send a queue of trains two ways |
| Peppermint Peaks | 25–32 | Tunnels: in one mouth, out of its twin |
| Paintbox Town | 33–40 | Paint sheds that change a train's colour (and where it wants to go) |
| Starlight Station | 41–48 | Everything at once, at night |

Every level is solved by the solver in the tests. Stars are for using few
pieces: ★★★ at par (the fewest the solver needs), ★★ a little over, ★ for
any win. Beat par and the game notices.

Also:

- **Daily Delivery**: a fresh puzzle generated from today's date (everyone
  gets the same one), checked solvable by the solver, with a gentle streak.
- **Train Shed**: 12 collectible engines (Little Puffer, Zoom Bullet,
  Woodie, Ladybug Line, Quack Express, Rocket Rail and more). Locked ones
  show as silhouettes with how to earn them. The engine's body colour always
  matches its route.
- **Sandbox**: a free 9×7 board with every piece, plus depots, stations,
  paint sheds and scenery. Loops run forever. It's saved.

## Play

Tiny Trains loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/tiny-trains/
```

## Rules

- A train leaves its depot, crosses one square per tick, and follows the
  track. It stops when it rolls into a station of its own colour; other
  colours roll straight through a station.
- Every station has passengers waiting, so each one needs a train.
- **Crossings** let two lines cross. Two trains in one square at the same
  time (or swapping squares head-on) go *bonk*.
- **Switches** are toy flip-flop points. A train coming up the stem goes the
  way the points are set (straight first) and flips them for the next train.
  Trains joining from a branch roll through without flipping them.
- **Tunnels** link two mouths with the same number.
- **Paint sheds** repaint a train as it passes.
- Running off the end of the track, bumping, or going round in circles stops
  the run; the trouble spot is marked and one tap takes you back to fix it.

## Controls

| Input | What it does |
| --- | --- |
| Drag across the grass | Draw track (pieces are picked for you; drawing across a line makes a crossing, and off a line makes a switch, when you have them) |
| Tap grass | Place the selected piece, turned to join up |
| Tap a piece | Turn it |
| Right-click / long-press | Remove a piece |
| Arrow keys / WASD | Move the cursor |
| Space / E | Place or turn at the cursor; Q turns back |
| X / Delete | Remove at the cursor |
| 1–6, Tab | Pick a piece from the tray |
| G / Enter | Go (and Stop) |
| Z | Undo · C clears the track |
| H | Hint: shows a piece from a working answer |
| F | Fast trains |
| M | Sound on/off |
| Esc / P | Pause |

## Files

```
index.html, style.css   page, screens and tray
telemetry.js, fullscreen.js   shared arcade modules (copies, never edited)
src/pieces.js   track pieces and routing
src/board.js    level map format and parser
src/sim.js      the deterministic tick simulation (timeline for playback)
src/solver.js   IDA* solver with lazy piece placement
src/levels.js   the 48 levels and world intros
src/daily.js    the daily puzzle generator
src/editor.js   placing, turning, drag-to-draw, undo
src/save.js     progress, stars, streaks (localStorage "tiny-trains.v1")
src/skins.js    engines and unlock rules
src/demo.js     the title diorama and sandbox board
src/geom.js     where a train sits inside a square
src/art.js      drawing: track, scenery, buildings, trains
src/render.js   the canvas view (baked board, trains, particles)
src/audio.js    synthesised toots, chuffs, clicks and music
src/worker.js   hints and the daily puzzle, solved off the main thread
src/main.js     screens, input and the frame loop
src/perf.js     frame-time telemetry (copied from Comet Crush)
tests/          node:test files
```

## Debug URL parameters

- `?level=N` jump to a level · `?daily` · `?sandbox` · `?map` · `?shed`
- `?autoplay` solves each level with the hint solver and moves on
- `?unlock` opens every level
- In the console, `TT` exposes the game state; `TT.crashTest()` throws inside
  the frame loop to check the crash screen.

## Tests

```sh
node --test 'games/tiny-trains/tests/*.test.js'
```
