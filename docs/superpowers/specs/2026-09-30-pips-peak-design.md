# Pip's Peak: design

A 2D side-view platformer. Pip, a small sprout, climbs a mountain of floating
islands to reach the sunrise at the summit. Twelve hand-authored levels in four
zones, drawn procedurally in Canvas, all-ages and deliberately kind.

## Feel first

The whole game is built around one thing: the jump should never feel stolen.

| Knob | Value | Why |
| --- | --- | --- |
| Top run speed | 128 px/s (8 tiles/s) | quick without being twitchy |
| Ground acceleration | 1000 px/s², ×1.9 when pivoting | reaches speed in ~0.13 s, turns on a coin |
| Ground friction | 1250 px/s² | stops where you expect |
| Jump velocity | 340 px/s, rise gravity 1100, fall gravity 1500 | 3.3 tiles high, 4.5 tiles across; falls faster than it rises, so it never floats |
| Variable height | releasing jump multiplies upward speed by 0.38 | a tap is a small hop, a hold is a full jump |
| Coyote time | 100 ms | jump just after the ledge still works |
| Jump buffering | 120 ms | jump just before landing still fires |
| Second jump | 292 px/s, refilled on ground, wall kick or spring | unlocked in the caves |
| Wall slide / kick | fall capped at 96 px/s; kick 158 px/s out, 326 px/s up, 110 ms of steering lock | unlocked on the cliffs |
| Mushroom | 524 px/s (~7.8 tiles) | springs and enemy bounces are not cut short by releasing the button |
| Ice | accel 330, friction 90, top speed 146 | slides, never uncontrollable |

Collision is swept per axis against the tile grid plus the rectangles that
moving platforms contribute, so a single code path handles both.

The camera follows a look-ahead point (`x + vx × 0.22`) inside a dead zone
(±14 px across, ±22 px down) and eases exponentially — faster horizontally,
slower vertically while airborne — then clamps to the level bounds. The view is
352 × 198 world pixels (22 × 12.4 tiles); the canvas is letterboxed 16:9 on
desktop and 4:3 on portrait phones so touch controls get their own space.

## Structure

| Module | Responsibility |
| --- | --- |
| `src/tiles.js` | tile characters and predicates (`isBlocking`, `isHazard`, …) |
| `src/levels.js` | four zones and twelve levels as ASCII grids, plus movers and wind |
| `src/physics.js` | Pip's movement and collision, over a `tileAt` interface |
| `src/world.js` | simulation: collectibles, enemies, crumbling blocks, gates, petals, results |
| `src/reach.js` | coarse reachability flood used by the level tests |
| `src/progress.js` | save file, unlocks, stars, best times |
| `src/ai.js` | "run right and jump" pilot for the tests |
| `src/render.js` | canvas art: parallax skies, tiles, Pip, particles, camera |
| `src/audio.js` | WebAudio chiptune loop and effects |
| `src/input.js`, `src/main.js` | controls, screens, HUD, level map, loop |

Everything above `render/audio/input/main` is DOM-free, which is what lets the
Node tests drive the real game.

## Levels

Levels are ASCII grids so they can be read, diffed and checked as data:

```
'#' rock   '-' plank (one-way)   'I' ice   'C' crumbling   'M' mushroom
'^' thorns '~' water             'D' gate  '!' sun latch
'S' start  'G' sunrise           'f' checkpoint flower
'o' seed   '@' golden acorn      'b' beetle   'e' bee
```

Moving platforms and wind live beside the grid in tile units. Movers ping-pong
between `(x, y)` and `(x + dx, y + dy)` on a cosine, so they are smooth and
deterministic; leaves are one-way, stones are solid. Wind adds a constant
acceleration inside its rectangle, which matters in the air and loses to ground
friction on foot.

Each level introduces one idea, and the zone grants the abilities its levels
need:

1. **Meadow** — First Steps (run, jump, seeds, flowers), Hop Along (beetles,
   one-way planks), Bouncy Blooms (mushrooms, drifting leaves, a secret cave).
2. **Waterfall Caves** *(second jump)* — Drip Drop (water, wide gaps),
   Crumble Deep (chalky blocks over water), Bee Careful (patrolling bees in
   pillared corridors).
3. **Windy Cliffs** *(wall kick)* — Wall to Wall (three chimneys with pockets
   hidden in their walls), Gusty Gap (updrafts and side gusts), Latch and Gate
   (two sun latches open both stone gates).
4. **Snowy Summit** — Cold Shoulder (ice), Blizzard Bridge (ice + gusts +
   crumbling snow), Sunrise (everything, straight up to the light).

## Being kind

- Three petals. Thorns, water, an enemy's side or falling out of the level cost
  one and put Pip back at the last bloomed flower, with a second of mercy
  invulnerability. Enemies, crumbled blocks and movers reset with him.
- Losing the last petal is a "wilt": petals come back and Pip carries on. There
  is no game over and no lives.
- Blooming a flower refills the petals. Collected seeds stay collected.
- Crumbling blocks give a 0.32 s grace after you land and grow back after
  3.4 s, but never inside Pip.
- Stars reward exploration, not perfection: one for the summit, one for all the
  seeds, one for all three acorns.

## Look and sound

Art is drawn from code: a sunrise that climbs as Pip climbs, three parallax
hill layers, floating islands, cave walls with stalactites and waterfall light
shafts, per-zone tile colours with grassy, mossy, weathered or snowy caps. Pip
squashes on landing, stretches on the way up, tilts his sprout into the wind,
blinks, and trails dust, sparkles and petals. Screen shake and particle counts
drop under `prefers-reduced-motion`.

Audio is a four-bar chiptune loop (bass, lead, hat) transposed and re-tempoed
per zone, plus synthesized effects whose pitch climbs as you chain seeds. It is
only created inside a real user gesture, and `M` mutes everything.

## Testing

- **Physics**: top speed, pivot bonus, coyote time expiring and not, buffered
  jumps, tap versus hold height, the second jump gated on its ability, wall
  slide capping the fall and kicking away, one-way planks catching and being
  dropped through, ice, mushrooms.
- **World**: seeds counted once, flowers moving the respawn and refilling
  petals, thorns and falls costing a petal, wilting, stomping versus bumping an
  enemy, crumbling blocks, latches opening gates, the sunrise scoring stars,
  moving platforms carrying Pip, wind pushing him in the air.
- **Levels**: rectangular grids, only known tiles, exactly one start and
  sunrise, three acorns, twelve or more seeds, a start on solid footing,
  abilities that only ever accumulate, movers and wind inside bounds, gates
  that have reachable latches, and a reachability flood proving every seed,
  acorn, flower, latch and the sunrise can be touched.
- **Progress**: broken saves read as fresh, best-of merging, unlocks, totals,
  time formatting.
- **A scripted run**: the pilot clears level 1 unharmed, twice identically, and
  replaying its recorded input tape lands in the same place.
- **In the browser**: title, level map, pause, results, all four zones, a
  390 × 844 touch layout, and the same pilot driving the real loop to a finish
  with a clean console.
