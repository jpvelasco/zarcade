# Tumble Tower — design

A wobbly stacking game for the Starlight Arcade (slug `tumble-tower`, genre
Physics). A crane lowers one cheerful animal block at a time: chunky hippos,
long giraffes, round pandas, flat turtles and eight more friends to collect.
Move it, turn it and let go to build a tower up to the goal line, then keep
it standing for 3 seconds. The animals blink, grin when the tower holds and
look worried when it sways.

## Physics (`src/physics.js`)

Our own DOM-free, deterministic 2D rigid-body engine. Units are "metres"
(y up, island top at y = 0), gravity 14 m/s².

- Shapes: convex polygons (CCW, centroid-local, mass and inertia from a
  triangle fan) and circles.
- Narrow phase: SAT on face normals, reference/incident face clipping for up
  to two polygon contact points, closest-feature tests for circles. Contact
  points carry feature ids (reference edge, incident vertex or clip side) so
  impulses warm-start from the previous step.
- Speculative contacts: points within 0.12 m are kept, so a falling block is
  caught on the step it would arrive instead of sinking in.
- Solver: sequential impulses with soft contact constraints in 4 substeps per
  60 Hz step (integrate velocity, warm start, biased solve, integrate
  position, unbiased relax), then a restitution pass. The current separation
  of each contact is tracked from the bodies' motion inside the step, so the
  manifold is built once per step. Static contacts are twice as stiff.
- Friction is Coulomb, combined as √(fa·fb); ice blocks use 0.1.
- Kinematic bodies (the bobbing raft) are driven toward a scripted pose each
  step; their velocity carries resting blocks by friction.
- Sleeping by island (union-find over touching contacts between dynamic
  bodies): an island sleeps when every body has been still for 0.5 s; a
  touch by an awake body or a moving raft wakes it. Wind levels disable
  sleep because the force keeps changing.
- Determinism: fixed step, ordered body/pair iteration, no randomness inside
  the engine. Tests replay a scenario twice and compare every float.

## Rules (`src/game.js`)

- The held animal hangs from the crane above everything already built. Move
  it left/right (clamped to the view), turn it in 45° steps, drop it.
- After a drop the next animal arrives when the tower is calm (or 2.5 s later
  at most; Pass & Play waits for calm, up to 6 s).
- Tower height = highest top of a block that is touching something and nearly
  still. A block that falls past the island edge into the sea splashes and is
  gone.
- Climb/Daily: reach the goal line and hold for 3 s. Stars: ★ for the clear,
  ★ for clearing with at least 1 m to spare above the line, ★ for using no
  more animals than par. Running out of animals without a hold is a gentle
  fail with one-tap retry.
- Endless: build as high as you can; three splashes end the run. Above 20 m a
  breeze picks up. Best height is the score.
- Pass & Play (2–4 players): take turns; whoever's drop sends an animal into
  the sea loses and everyone else wins. One-tap rematch.

## Content (`src/levels.js`)

32 Climb levels over five islands, each introducing one idea:

1. Meadow Isle (6) — basics, the four starter animals.
2. Breezy Bluffs (7) — wind that gusts and grows with height.
3. Frosty Floe (6) — slippery ice-coated animals.
4. Bobbing Bay (6) — the island is a raft rocking side to side.
5. Summit Isle (7) — everything together with tight animal counts.

Each level has a goal height, animal limit, par, island width, an animal pool
and a seed, so the animal sequence is fixed and the solver test is
meaningful.

## Sticky hooks (all saved in `tumble-tower.v1`)

- Island map with stars per level and island; the next level pulses.
- Animal collection: 12 animals (4 starters, 2 more per island cleared); new
  shapes join the Endless / Daily / Pass & Play mix. Locked ones show as
  silhouettes with how to get them.
- Themes that show up in play: Sunny (default), Candy (15 ★), Jungle (40 ★),
  Space (reach 25 m in Endless or clear Summit Isle).
- Daily Tower: a level generated from the local date (same day, same tower)
  with a gentle streak counter.
- Personal bests: Endless height on the title and results with a
  "New best!" moment; best daily result per day.
- Fast restarts: Try again is one tap and plays immediately.

## Controls

- Mouse / touch: drag anywhere to slide the animal (relative, so a finger
  never hides it), release to drop; a quick tap turns it. On-screen Turn and
  Drop buttons on touch screens; right-click also turns.
- Keyboard: ←/→ or A/D move, ↑/W/X turn, Z turns back, Space/↓/Enter drop,
  Esc/P pause, M mute.
- Gamepad: stick/d-pad move, A drop, B/X/Y/bumpers turn, Start pause.

## Solver / autoplayer (`src/ai.js`)

A generator-based planner: for each candidate (angle × x offset) it clones
the world, drops the animal and simulates ~1.6 s, scoring height gained,
splashes, how far existing blocks were shoved and leftover motion. The
browser evaluates one candidate per frame (attract mode and `?autopilot`),
so no frame stalls. Tests use it to clear levels.

## Design calls made without a reviewer

- 45° turns (not free rotation): readable and keyboard-friendly.
- Climb has no hearts: the animal limit is the only resource, so a collapse
  can be rebuilt if animals remain.
- Faces are baked per expression (idle, blink, grin, worried) so drawing
  stays one `drawImage` per animal.
- Height is shown in metres; 1 m ≈ a hippo's height.
