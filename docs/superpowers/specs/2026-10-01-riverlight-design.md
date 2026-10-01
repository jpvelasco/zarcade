# Riverlight design

A calm rotate-the-tiles puzzle. Turn stepping stones so a glowing stream runs
from the spring to every flower. When the garden connects, water flows
through, flowers bloom, koi swim the channels and fireflies come out. No
timers and no fail state; move-count stars are optional.

## Rules

- The board is a square or hex grid of stones. Each stone carries a channel
  shape (end, straight, bend, splitter, cross). Tap turns it clockwise;
  right-click, long-press or Q turns it back.
- Water leaves the spring through its open sides. It enters a neighbour only
  when the neighbour has a matching open side; otherwise it **spills**.
- A garden is complete when every stone is wet, nothing spills, and every
  flower has the right colour of water.
- Twists, one per season: splitters (Spring Meadow), lily-pad bridges where
  two streams cross without mixing (Summer Pond), one-way sluice gates and
  mossy locked stones (Autumn Grove), frozen twins that turn together and
  edges that wrap around the lake (Winter Lake), two springs, blue and gold,
  that mix into green through gates (Night Garden), and hex stones (Lotus
  Isles).

## Levels

72 levels in six seasons of 12. Each season ends with a showpiece drawn as a
shape (heart, lily ring, maple leaf, snowflake, crescent, lotus). Levels come
from a seeded generator:

1. Grow a random tree of channels from the spring (snake factor and maximum
   branching shape it), crossing pre-placed bridge cells straight through.
   Leaves become flowers. Night Garden grows a green tree first, turns two
   leaves into gates and grows the blue and gold trees from them.
2. Add gates, locks and twin pairs as the spec asks.
3. Count solutions with a constraint solver (arc consistency over rotations,
   loop pruning, flow check at the leaves). Retry for a unique solution; in
   seasons with locks, lock a tile that differs from an alternative solution.
4. Scramble every rotatable group and reroll until the garden is not already
   complete. Par is the fewest taps back to the intended solution.

Zen mode draws endless gardens from the same generator with a random seed and
no stars.

## Architecture

DOM-free: `rng.js`, `topology.js` (square, wrap and hex neighbours, unit
geometry), `flow.js` (water simulation and completion), `solver.js`,
`generator.js`, `levels.js` (seasons and specs), `game.js` (moves, undo,
reset, hints, stars, serialisation), `save.js`, `perf.js`.

Browser: `render.js` (Canvas; baked backdrop and tile sprites, water strokes,
flowers, koi along the channels, fireflies, season particles), `audio.js`
(WebAudio pads whose voices fill in as flowers bloom, pentatonic chimes, soft
clicks), `main.js` (screens, input, loop, telemetry).

## Verification

Node tests cover topology, flow, the solver, generator determinism, every
level solvable and not pre-solved, game undo/reset/hints/stars, save and the
autoplayer. Browser checks use headless Chrome over CDP on port 9333 with the
server on 8133.
