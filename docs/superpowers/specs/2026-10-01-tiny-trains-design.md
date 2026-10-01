# Tiny Trains — design

A toy-train track-laying puzzle for the Starlight Arcade (slug `tiny-trains`,
genre Puzzle). Lay wooden toy track on a little tabletop diorama so every
coloured train reaches the station of its colour, then press **Go** and watch
them chuff, toot and drop their passengers off.

## Core rules

- The board is a grid (up to 8×8). Cells are grass (buildable), scenery
  (trees, ponds, houses, mountains: blocked), fixed track, depots, stations,
  paint sheds or tunnel portals.
- The player places pieces on grass: **straight** (2 turns), **curve**
  (4 turns), **crossing** and **switch** (8 variants: 4 turns × left/right
  hand). Straights and curves are unlimited; crossings and switches come in a
  per-level stock. Fixed track can't be changed.
- Press Go: the simulation runs in whole ticks. During one tick each moving
  train crosses one cell. Trains leave their depot at their departure tick
  (a depot can hold a queue of trains).
- A train stops and delivers when it enters a station of its own colour;
  other-coloured trains pass straight through a station.
- **Switches** are toy "flip-flop" points: a train coming in on the stem goes
  the way the points are set and flips them for the next train. Trains coming
  in from either branch roll out of the stem without flipping. Points start
  on the straight branch.
- **Crossings** let two lines cross; two trains in the same cell in the same
  tick crash (as do two trains swapping cells head-on).
- **Tunnels** are fixed portal pairs in mountains: in one mouth, out of the
  other, heading out of its mouth.
- **Paint sheds** are fixed straights that repaint a passing train.
- A run fails on a crash, when a train runs off the end of its track, or when
  the trains repeat a state (going round and round). Fail shows the spot and
  goes straight back to editing with the layout kept (one tap).
- Win when every train is delivered. Stars: ★★★ at par (the solver's fewest
  pieces), ★★ within par + max(2, ⌈par/4⌉), ★ for any win.

## Solver

`src/solver.js` is an IDA* search over the simulation with lazy placement: a
piece is only chosen when a train first enters an empty grass cell. Each
touched cell carries the set of piece variants consistent with every train
that has passed through it so far (with their switch states); a later visit
splits that set by exit direction. Cost is the number of touched cells; the
heuristic is the largest per-train 0-1 BFS distance (untouched grass costs 1)
to a matching station or any paint shed. Crossing/switch stock is checked
with Hall's condition. Tests run the solver on every level, extract a
concrete layout and replay it in the real simulation.

## Content

Six worlds × 8 hand-made levels (48), each world introducing a mechanic:

1. Toybox Meadow — straights and curves, obstacles, two trains.
2. Crossing Creek — crossings and timing (departure ticks).
3. Switchback Farm — flip-flop switches from shared depots.
4. Peppermint Peaks — tunnels.
5. Paintbox Town — paint sheds.
6. Starlight Station — everything together (night theme).

Levels unlock three ahead of the furthest one solved, so nobody is stuck.

## Sticky hooks

- Level map with stars per level and per world; best pieces per level shown on
  the results screen with a "New best!" moment.
- **Train Shed**: 8 collectible locomotive skins (shape and trim; body colour
  always stays the route colour). Locked skins show as silhouettes with the
  unlock rule (stars, worlds, daily streak, sandbox).
- **Daily Delivery**: a puzzle generated from the local date (same day, same
  puzzle) and verified by the solver; gentle streak counter and best streak.
- **Sandbox**: a 10×7 free board with every piece plus depots, stations,
  paint sheds and trees; loops run forever. Saved locally.
- Fast restarts: fail → editing in one tap; Retry keeps your layout.

## Controls

Mouse/touch: pick a piece in the tray, tap grass to place, tap a placed piece
to turn it, drag across grass to draw track (pieces chosen automatically,
crossings when you draw across a line and have one), right-click / long-press
or the eraser removes. Keyboard: arrows/WASD move the cursor, 1–5 pick a
tool, Space/E place-or-turn, Q turn back, X/Delete remove, G/Enter Go/Stop,
Z undo, H hint, F speed, M sound, Esc/P pause. No gamepad (a calm puzzle).

## Tech

Canvas 2D, ES modules, no dependencies. DOM-free modules: `pieces.js`,
`levels.js`, `sim.js`, `solver.js`, `daily.js`, `skins.js`, `save.js`,
`rng.js`, `perf.js`. Board art (grass, scenery, track) is baked to an
offscreen canvas when the layout changes; train sprites are baked per
skin/colour; steam puffs use a baked sprite and a capped pool. The run is
simulated up front into a timeline which the renderer plays back (sandbox and
title loops wrap at the detected cycle). WebAudio for toots, chuffs, clacks,
bells and a soft music loop. Save key `tiny-trains.v1`.

## Design calls

- Tunnels and paint sheds are fixed level features rather than tray pieces:
  that keeps the solver tractable and the tray simple for kids.
- Unlimited straights/curves avoid "ran out of pieces" frustration; stars
  reward economy instead.
- Colour is never the only cue: trains and stations carry a shape symbol.
