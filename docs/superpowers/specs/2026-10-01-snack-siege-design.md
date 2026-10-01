# Snack Siege design

A slingshot physics game for the Starlight Arcade. Fling jelly-bean heroes
at wobbly candy forts and pop the grumpy gummy bears hiding inside.

Slug `snack-siege`, Canvas 2D, ES modules (needs `npm run serve`), no
dependencies.

## Core loop

1. A level opens on a candy fort with one or more gummy bears in it. A row
   of jelly beans waits beside a pretzel slingshot.
2. The player pulls back (mouse drag, touch drag or the arrow keys) and a
   dotted arc shows where the bean will fly. Letting go launches it.
3. While the bean is flying, one tap, click or Space uses its power.
4. Blocks crack, crumble and topple. Bears pop when something hits them hard
   enough or when they fall out of the world.
5. The turn ends when the scene calms down. Pop every bear to win. Each
   unused bean adds a 10,000 point bonus.

Stars: ★ for clearing the level, ★★ and ★★★ for passing two score targets.
The targets come from the fort's contents and assume about one spare bean
for ★★★, so stars reward both smashing things and saving beans. A meter on
the HUD shows how close the player is to each one.

## Beans

| Bean | Look | Power (tap while flying) |
| --- | --- | --- |
| Cherry Pip | red | none, a solid all-rounder |
| Blueberry Trio | blue | splits into three smaller beans |
| Lime Bouncer | green, very bouncy | jumps up in mid-air |
| Grape Boulder | purple | turns heavy and slams straight down |
| Honey Drop | gold | sticks to what it hits, then bursts (tap to burst early) |
| Mint Rocket | mint | rockets forward in a straight line |

A new bean gets a one-time tip card the first time it appears.

## Fort materials

Cookie (the wood-like workhorse), sugar glass (shatters easily), chocolate
(tough), rock candy (very tough and heavy), fizz crates (explode when hit
hard, chaining into each other), marshmallow (bouncy and soft), gumballs
(heavy round boulders) and slick frosting ice (low friction). Static ground
pieces form plateaus, ledges and pits.

## Worlds and levels

Three worlds of 12 hand-built levels each (36 total):

- **Cookie Canyon** teaches aiming, cookie and glass, then each early bean.
- **Soda Springs** adds fizz crates, marshmallow, gumballs and deeper pits.
- **Frosting Peaks** adds ice and tall towers on high ledges, and ends with
  the Bear King's castle.

Levels are written with a small builder (towers, columns, planks, pyramids,
bridges, bears) so each one is a few readable lines. Every level is checked
by tests: data is valid, every piece starts inside the world without
overlapping, the fort stands still when simulated awake for three seconds,
and the autoplayer clears it.

## Physics

`src/physics.js` is an original DOM-free 2D rigid-body engine:

- Shapes: circles and oriented boxes (planks are thin boxes). Static bodies
  form the ground.
- Narrow phase: circle/circle, box/circle, and box/box SAT with reference
  face clipping (two-point manifolds with feature ids).
- Sequential impulse solver with warm starting, Coulomb friction,
  restitution with a velocity threshold, and split-impulse position
  correction so pushing apart overlapping bodies adds no energy.
- Sort-and-sweep broad phase.
- Island sleeping: a group of touching bodies that has been still for half
  a second sleeps together. Contact with an awake body, an explosion or
  removing a neighbour wakes it.
- Fixed step of 1/120 s (two substeps per 60 Hz frame) so fast beans do not
  tunnel through planks.
- Deterministic: no randomness, stable iteration order, plain-data bodies
  that clone cheaply. The autoplayer searches shots by cloning the game.

Forts start asleep. Level tests prove each one is stable when awake, so
starting asleep only skips settling work.

Damage comes from the normal approach speed at a contact times the pair's
effective mass, minus a small threshold. Resting contacts deal none, while
falling blocks and bean hits do.

## Sticky hooks

- **Level map** with stars on a winding path per world.
- **Personal bests** per level and for the daily fort, with a "New best!"
  moment on the results screen.
- **Slingshot skins** (pretzel, candy cane, licorice, lollipop, waffle,
  chocolate, gummy worm, cotton candy, starlight). Each unlocks from stars,
  finishing a world, or daily forts. The chosen skin changes the slingshot,
  its band and the bean's flight trail.
- **Daily challenge fort** built from the local date (same day, same fort
  and beans), with a gentle streak counter.
- **Fast restart**: R or the ↻ button, and Try again on the fail screen,
  reload instantly.

Kind-hearted rules: levels unlock with a single star, and after three
failed tries the fail screen offers "Skip ahead" so nobody gets stuck.

## Juice

Crumb particles in each material's colours, glass shards, puffs and stars
when bears pop, a camera nudge on big hits (none with reduced motion), and
floating score and combo pops. Breaks within 0.8 s of each other build a
combo that adds bonus points and raises the pitch of each crunch. The beans
squash and stretch, and the bears wobble and glare. Under reduced motion
there's no shake and particle counts drop to a third.

## Rendering and performance

Block, bear, bean and slingshot sprites are baked into offscreen canvases,
keyed by size, damage stage and scale. The parallax backdrop is baked once
per resize. Particles are pooled and capped. Nothing in per-frame drawing
uses shadowBlur or filter.

The camera frames the slingshot and fort. Narrow (portrait) screens keep a
minimum scale and pan to follow the bean, then the fort.

## Controls

| Action | Mouse | Touch | Keyboard |
| --- | --- | --- | --- |
| Aim and pull | drag (from anywhere) | drag | ↑ ↓ angle, ← → power |
| Launch | release | release | Space / Enter |
| Use power | click | tap | Space |
| Restart | ↻ button | ↻ button | R |
| Pause | ❚❚ button | ❚❚ button | Esc / P |
| Mute | 🔊 | 🔊 | M |

There's no gamepad support because this isn't an action game.

## Saves

All saves live under the `snack-siege.v1` key: stars and bests per level,
the chosen skin, unlocked skins, sound settings, beans already introduced,
the last daily date with its best score, the streak, and the fail count per
level.

## Design calls made without a reviewer

- The genre is "Physics", as asked. The arcade's shelves don't list it yet,
  so the coordinator needs to map it to a shelf.
- The game has no lives or timers. Failing a level only costs a quick
  restart.
- The daily fort is generated from builder pieces with a seeded RNG. It's
  checked by tests for stability and for being clearable on sample dates.
