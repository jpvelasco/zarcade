# Comet Crush: design

A neon breakout for all ages. The player steers a paddle-ship along the
bottom of a portrait playfield and bounces a comet into crystal bricks laid
out as pictures. Every constellation ends with a cartoon boss. Clearing a
level lights one star of that constellation, and beating the boss lights the
whole figure and unlocks the next constellation.

## Playfield

A fixed logical field, 600 × 880 units, works for phones in portrait and is
letterboxed on desktop. A 64-unit HUD strip sits on top. Bricks sit on a
13 × 16 grid of 44 × 22 cells, and the odd column count keeps pictures
symmetric. The renderer scales the field to fit the window, at the device
pixel ratio, over a full-screen sky. The sky shows the current
constellation's figure, and cleared levels light up in it.

## Feel

- **Comet physics.** A comet carries a unit direction. The world sets its
  speed: a base speed for each level, a gentle ramp over time and per brick
  (up to +260), and ×0.62 with slow-mo. Each step splits the movement into
  sub-steps of at most half the comet's radius. At each sub-step the comet
  is tested against walls, bricks (deepest overlap first), the boss, the
  ship, portals, and boss shots. That makes tunnelling impossible at any
  speed, and a test runs at 30,000 units/s to prove it.
- **Ship angle.** Where the comet lands on the ship sets the outgoing angle:
  up to 62° from vertical at the edges, with a little "english" from the
  ship's own motion. Comets never travel flatter than about 17° from
  horizontal.
- **Controls.** Mouse and touch drive the ship straight to a target (capped
  at 3200 units/s). Touch uses relative drags, so a finger never hides the
  ship, and a tap launches. Keyboard and gamepad use fast acceleration with
  stronger braking.
- **Anti-stall.** If nothing breakable is hit for 9 s, the comet "gets
  restless" and its angle is nudged.

## Content

| # | Constellation | Levels | Boss |
| --- | --- | --- | --- |
| 1 | Rocket Reach | Rocket, Ringed Planet, Shooting Star, Crescent Moon, Astronaut | Bubble Saucer: drifts side to side and blows slow bubbles |
| 2 | Cosmic Reef | Space Whale, Jellyfish, Rainbow Fish, Sea Turtle, Seahorse | Big Space Octopus: six tentacles of bricks that grow back |
| 3 | Crystal Caves | Star Gem, Crystal Crown, Skeleton Key, Glow Mushroom, Castle | Crystal Crab: metal claws guard its belly, then open |
| 4 | Critter Cluster | Kitty, Bunny, Night Owl, Hoppy Frog, Butterfly | Star Serpent: its head weaves a figure-eight, trailed by tough segments |
| 5 | Candy Cloud | Big Heart, Cupcake, Ice Cream, Sprinkle Donut, Lollipop | Gumball Mech: fires meteors and rebuilds its wall |
| 6 | Galactic Core | Space Invader, Robot Pal, Friendly Ghost, Dragon, Spiral Galaxy | Kraken Queen: regrowing tentacles, bubbles, and meteors |

Brick types arrive gradually. Level 1 has plain bricks only. Tough,
explosive, and star bricks appear in constellation 1, moving bricks in 2,
and metal and portals in 3. Layouts are strings, one character per cell.

**Bosses** follow deterministic paths. They own *parts*, which are bricks
attached to the boss that follow it, can regrow on a timer (never on top of a
comet), and don't count toward clearing the level. They also fire slow
*shots*. A bubble or meteor that hits the ship makes it sleepy for 3.5 s:
68% of its width and slower. It never costs a life. Comets and lasers pop
shots for points. A comet hit deals 3 damage (5 with fireball), and a laser
deals 1. At half health a boss gets angry: it moves 25% faster, shoots 30%
more often, and regrows its parts sooner.

**Power-ups** drop from 13% of broken bricks, with at most three capsules
falling at once. The drop is chosen by weight from a seeded RNG. There are
eight classic power-ups (multi-comet, wide, laser, catch, slow-mo, fireball,
shield, and 1UP) and four silly ones (disco for ×2 points, rubber duck,
big comet, and capsule magnet). Timed effects end when you lose a ship.

**Scoring.** Each broken brick adds one to the combo. The combo lasts 2.2 s
after the last break, and every five in a row adds +1 to the multiplier (up
to ×5). Clearing a level pays 1000, plus 1500 for losing no ships. Star
bricks drop tokens worth 1000.

## Progress

The save lives under `comet-crush.v1` and holds the furthest unlocked level,
the best stars for each level, the high score, and the mute and music
settings. Saves are sanitized on load. Ratings: ★ for a clear, ★★ for losing
at most one ship, and ★★★ for losing none. A game over offers **Continue**
at the same level with three fresh ships and the score kept.

## Structure

| Module | Responsibility |
| --- | --- |
| `src/config.js`, `src/math.js` | Constants, the seeded RNG, and small helpers |
| `src/levels.js` | Constellations, layouts, the legend, and parsing |
| `src/physics.js` | Circle-vs-box collisions, reflection, paddle bounce, and landing prediction |
| `src/world.js` | The simulation: stepping, collisions, bricks, power-ups, combo, lives, and clear state |
| `src/powerups.js`, `src/boss.js` | The power-up table, boss definitions, parts, and attacks |
| `src/ai.js` | The autopilot: predicts where the comet lands and aims at bricks |
| `src/progress.js` | Save data |
| `src/render.js` | Canvas: sky, sprite-cached bricks, bosses, particles, and HUD |
| `src/audio.js` | Synthesized sound effects (combo pitch climbs a pentatonic scale) and a step-sequencer music loop |
| `src/input.js`, `src/main.js` | Mouse, touch, keyboard, and gamepad input; screens and the fixed-step loop |

The simulation runs at a fixed 120 Hz. The renderer only reads world state
and the world's event list, and keeps its own particles and comet trails.
Screen shake, flashes, parallax, and most particles are dropped under
`prefers-reduced-motion`.

## Testing

- Collision helpers, the paddle angle, no tunnelling at 400–30,000 units/s,
  tough, metal and explosive bricks, moving bricks, portals, lives, and
  controls.
- Each power-up's effect and expiry, and deterministic drops.
- Level data: every layout is 13 wide and fits the grid, uses only known
  characters, has enough breakable bricks, has paired portals, and has
  moving bricks that never slide into static ones or out of the field.
- Bosses: paths stay in the field, shots are fired and popped, the sleepy
  ship recovers, tentacles regrow, claws open, segments trail, the wall
  rebuilds, bosses get angry at half health, and a defeat clears the level.
- The autopilot clears level 1, the first boss, and all 36 levels.
- Browser play-testing at 1280 × 800 and 390 × 844 with touch.
