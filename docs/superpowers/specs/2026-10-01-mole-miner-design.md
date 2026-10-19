# Mole Miner design

Slug `mole-miner`, genre Dig & upgrade. A cozy Motherload: Momo the mole pilots
a little drill pod from a sunny meadow down to the Ancient Core.

## Core loop

1. Drive off the base pad, drill down and sideways, scoop gems into the cargo
   hold. Fly back up with the propeller.
2. Fuel and cargo are limited. Land on the base pad to auto-sell gems, refuel,
   patch the hull and hand relics to the museum.
3. Spend coins in the Workshop upgrade tree, then dig deeper.

The pod can drill left, right and down while standing on something, and never
up. Flying burns fuel faster than driving. Shafts you dig stay dug (saved), so
later trips fall quickly back to the depth you reached.

## World

A DOM-free generator (`src/worldgen.js`) builds a 36 x 300 tile mine from a
seed. One tile is 2 m, so the core sits at about 592 m.

| Layer | Rows | Hardness | Feature |
| --- | --- | --- | --- |
| Meadow Soil | 0-29 | 1 | small pockets, fuel cans |
| Clay Banks | 30-69 | 2 | gas pockets start, boulders |
| Stony Deep | 70-117 | 3 | more boulders, caves |
| Crystal Caves | 118-165 | 4 | big caves lined with glowing crystals |
| Glowcap Grotto | 166-213 | 5 | glowing mushrooms, bouncy caps |
| Lava Lands | 214-255 | 5 | a two-row lava crust and lava pools |
| Ancient Ruins | 256-298 | 6 | brick rooms with chests, the core chamber |

The top two rows of every layer are solid layer rock, so each layer is gated by
the matching drill tier. The lava crust is gated by the Frost Fan, which cools
lava on contact so it can be drilled. Edges and the last row are bedrock; the
base pad cannot be dug.

## Hazards (friendly)

- Gas pockets look like dirt (a faint bubble tell with Lamp 2+). Drilling one
  goes *pfft*: the pod is bumped upward and loses a little hull.
- Boulders wobble for about a second when the tile under them is dug, then
  fall. A boulder that lands on the pod bonks it (hull damage) and shatters.
- Lava blocks like a wall and stings the hull on contact until you own the
  Frost Fan, which makes it safe and diggable.
- No fall damage. When fuel or hull runs out, Wiggles the worm tows you home
  for a small fee (never more than the coins you hold). Cargo is kept and
  nothing is ever wiped. You can also call Wiggles from the pause menu.

## Upgrade tree

Drill is the trunk. Every other branch tier `n` needs drill tier `n - 1`.

- Drill: Twig, Copper, Iron, Crystal, Glow, Star (power 1-6).
- Fuel Tank, Cargo Hold, Hull, Lamp (light radius), Propeller (fly speed and
  efficiency): six tiers each.
- Frost Fan: one gadget, needs the Glow drill.

Costs are tuned with the autoplayer so each layer takes a few trips and nobody
is stuck behind a grind. Refuel and repair at base are free (design call: no
paid fuel keeps small players out of soft-locks).

## Sticky hooks

- Upgrade tree with visible next steps and what each tier unlocks.
- Museum: 24 pieces in six sets (fossils in the upper layers, relics deeper),
  shown as silhouettes until found. Each piece pays coins; each finished set
  unlocks a pod paint.
- Depth milestones (14) with coin rewards; layer milestones unlock paints.
- Daily Dig: a small 22 x 74 mine seeded from the local date, with a loaner pod
  and one goal (haul value, find the Golden Acorn, or reach a depth and come
  home). One trip per try, unlimited retries, a gentle streak, and coins for
  the main mine. Streaks of 3 and 7 unlock paints.
- 16 pod paints shown in play.
- Personal-best depth and core status on the title. After reaching the core
  the Workshop offers a fresh mine (new seed) that keeps upgrades and museum.

## Code shape

- `src/data.js` constants; `src/rng.js` seeded RNG; `src/worldgen.js` world
  generation; `src/sim.js` the pod/tile simulation (`Mine`); `src/game.js`
  the `Session` (economy, docking, museum, milestones, towing, daily goals);
  `src/progress.js` saves and streaks; `src/bot.js` the autoplayer (Dijkstra
  over the tile graph, a tile-move controller and a shopping policy).
- `src/render.js` Canvas renderer: baked 8 x 8 tile chunks rebuilt when tiles
  change, a half-resolution light map, cached sprites, capped particles.
- `src/audio.js` WebAudio synth sfx and a soft per-layer music loop.
- `src/input.js` keyboard, mouse (hold to steer toward the pointer), touch
  d-pad and Fly button on coarse pointers, gamepad.
- `src/main.js` screens, loop, telemetry, saves. Save key `mole-miner.v1`.

## Controls

Arrows/WASD move and drill; Up/W/Space fly. E/Enter opens the Workshop on the
base pad. Esc/P pause, M mute. Gamepad stick/d-pad, A fly, X workshop, Start
pause. Touch: d-pad bottom left, Fly bottom right, Workshop button at base.

## Tests

World validity and determinism, layer gating (each layer reachable with the
expected upgrades and not before), economy pacing, sim rules (drilling,
hazards, towing, docking), saves round-trip, daily seeds and streaks, and an
autoplayer that reaches the core from a fresh save.

## Design calls

- Free refuel and repairs; the only fee is Wiggles' tow.
- Gems dug with a full hold are lost (toast warns); relics and fossils use a
  separate pocket and are never lost.
- Saves store a compact diff of the tile grid against the regenerated seed.

## Tuning notes (as shipped)

- The autoplayer reaches the core in about 22-25 simulated minutes over 12-15
  trips (it knows the whole map and never wastes a move); people take a few
  times longer. Upgrade costs were cut after an early pass let the bot strip
  the mine bare before it could afford the Frost Fan: the essentials for each
  layer now cost under half of the ore above it (a test checks this).
- Every gem sprite carries a sparkle and meadow pebbles are low-contrast, so
  copper reads as treasure rather than gravel.
- The title camera sits on the meadow and base; the demo pod digs below.
