# Garden Guardians: design

A cozy tower defense for all ages. The snack-hungry bug parade marches down
winding garden paths toward Grandma's picnic. The player plants defenders on
the grass to shoo the bugs away. When a bug is beaten it is *shooed*: it
puffs into a little cloud and floats off. There is no gore.

## Board and view

- Every map is a 16×10 tile grid drawn as a raised garden bed in a slightly
  angled storybook style. Sprites stand up off the ground, cast shadows and
  are y-sorted.
- Maps are ASCII layouts: `.` grass (plantable), `#` path, `A`/`B` spawns,
  `G` picnic, `t r w f` blocked props (trees and pumpkins, gnomes and rocks,
  pond water, flower beds). A breadth-first search traces each spawn's route
  to `G`, and tests check that every path tile is on a route.
- Ground bugs follow the path. Flyers follow a corner-cutting route through
  points one third and two thirds of the way along it.
- In portrait viewports the renderer transposes the board so tiles stay
  tappable, and the build menu moves to the bottom.

## Structure

| Module | Responsibility |
| --- | --- |
| `src/data.js` | Defender tiers, bug stats, economy constants |
| `src/maps.js` | Layouts, areas, path tracing, routes |
| `src/waves.js` | Seeded wave scripts from each map's roster, previews |
| `src/combat.js` | Targeting, armor, slow and slime, auras, costs, refunds, stars |
| `src/game.js` | Fixed-step simulation: spawning, movement, firing, projectiles, economy, win and loss |
| `src/autoplay.js` | Scripted player for balance tests, the attract mode and `?autoplay` |
| `src/progress.js` | `garden-guardians.v1` save, unlocks |
| `src/render.js`, `src/sprites.js` | Canvas terrain, sprites, effects, thumbnails |
| `src/audio.js` | Synthesized sound effects and music loop |
| `src/main.js` | Screens, HUD, build and info panels, mouse, touch and keyboard input |

## Rules

- **Economy:** starting coins depend on the map. Bugs pay a fixed reward.
  Clearing the field pays `5 + 2 × wave`. Calling the next wave during the
  break pays 1 coin per second left on the break timer. Selling refunds 70%,
  or 100% before the plant has seen a wave.
- **Damage:** armor subtracts a flat amount from each hit, but at least 20%
  always gets through. Magic (Mushroom Mage) ignores armor. Honey slows by
  40–60% (bosses resist half). Bugs on snail slime move 35% faster. Lavender
  auras never stack; the strongest one applies.
- **Targeting:** *first* picks the bug with the least route left,
  *strongest* the one with the most HP, and *closest* the nearest one.
- **Waves:** each map has 12–20 waves. The budget grows each wave, new bug
  types get a spotlight wave, every fifth wave is a swarm, and the last wave
  is a boss. HP scales with the map and the wave. After a wave finishes
  spawning, the next one comes after 22 seconds, or within 10 seconds once the
  field is clear.
- **Lives and stars:** 10 picnic baskets. ★★★ for 9 or more left, ★★ for 5 or
  more, ★ for any win.
- **Progression:** clearing a map unlocks the next one. The furthest map
  reached unlocks defenders: Honey Pot and Sun Daisy at map 2, Thistle at 3,
  Mage at 4 and Lavender at 5.

## Balance

Each map's HP factor is set a margin below the point where the autoplayer
starts losing. The autoplayer builds from a fixed shopping list at the tiles
with the most path coverage, upgrades every third purchase and adds a Thistle
when flyers show up. Tests assert that it wins every map and that a player
who never plants loses every map.

## Feel

- A sprout pops out of the dirt when planted and bursts into stars on
  upgrade. Each tier changes the look: a gold pot band, then a glazed blue
  pot with a star, and extra barrels, petals, hats or crowns.
- Seed bombs and honey fly in arcs with ground shadows. Peas and thorns home
  in on their target. Mage zaps are jagged sparkling chains.
- Shooed bugs puff and float away with a floating `+coins`. Leaks make
  Grandma gasp and shake the basket counter.
- Web Audio plops, zaps, buzzes and jingles, plus a gentle F-major loop. Sound
  and music can be muted separately.
- `prefers-reduced-motion` turns off screen shake and idle sway, cuts
  particles and makes CSS animations instant.
- During play, the pointer hides after 2 seconds without movement.
