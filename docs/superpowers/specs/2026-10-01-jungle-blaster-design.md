# Jungle Blaster 2600: design

A retro run-and-gun platformer for the GenX crowd and their kids. It
combines Pitfall-style jungle traversal (vines, crocs, logs, quicksand,
ladders down to treasure tunnels) with Contra-style shooting (8-way aim,
weapon capsules, smart bombs, big multi-phase bosses). It looks like a 2600
cartridge and plays like a modern game.

## Look

- The world is drawn at **320×180 logical pixels**, then scaled up by an
  integer factor with nearest-neighbor sampling. The palette is Atari-like,
  and skies use horizontal color bands with dithered steps.
- Terrain, sky and two parallax strips are baked once per stage into
  offscreen canvases. Sprites are procedural rectangles drawn per frame,
  about a few hundred `fillRect` calls in total, with no gradients, filters
  or shadows. Glows are pre-baked radial sprites.
- **CRT** (on by default): a cheap bloom (the low-res frame shrunk twice and
  added back) plus a CSS scanline and vignette overlay sized to the logical
  pixel.
- **2600 mode**: colors snap to a 128-color NTSC-style palette, horizontal
  resolution halves to 160 for fat playfield pixels, and sprites flicker
  softly when there are many (alpha dips at about 7 Hz, never a full
  blink). With reduced motion, the game removes flicker and shake, softens
  screen flashes and uses fewer particles. Hit flashes are a pale tint on
  alternating frames, never a white strobe.

## Feel

| Knob | Value |
| --- | --- |
| Run | 96 px/s, reached in ~0.1 s; stop in ~0.07 s |
| Jump | 320 px/s; rise gravity 900, fall gravity 1250; ~57 px high, ~64 px across |
| Variable height | Releasing early multiplies the rise by 0.42 |
| Coyote time / buffer | 100 ms / 130 ms |
| Vines | Real pendulums (g = 900, length 72). Idle vines are driven to a steady 0.72 rad swing. Leaning with the swing pumps it. Letting go keeps the tangential speed plus a 170 px/s hop. |
| Quicksand / tar | Sink 11 px/s, run at 45%, jump at 82%. Sinking 14 px is a hazard. |
| Hurtbox | 6×15 inside a 10×20 body; prone drops it to 9 px tall |
| Logs | Trip you up (0.45 s stun), never hurt |
| Hazards | Water, lava, spikes and pits cost a heart and return you to the last safe footing (tracked away from edges) |

Every enemy and boss attack has a wind-up of at least 0.35 s. Telegraph
markers show where rocks, mortar shells, fire pillars, beams and landings
will hit.

## Structure

The stages are built from one-screen ASCII rooms (20×15 tiles), like the
screens of a 2600 jungle game. Stages substitute fluids where needed:
water becomes tar in the caves and lava on the volcano. Rafts are placed
automatically to cross the gap they sit in. The surface is at row 10, with
a two-row crust above a tunnel (rows 12–13) that ladders reach.

The modules are pure and DOM-free: `tiles`, `levels`, `physics`, `weapons`,
`enemies`, `bosses`, `world`, `ai`, `reach`, `progress`, `palette` and
`music`. Only `render`, `audio`, `input` and `main` touch the browser.

## Modes and progression

- **Adventure**: 3 hearts, 5 lives, checkpoints refill hearts, unlimited
  continues that keep the score, and stage select for unlocked stages.
- **Arcade**: 1 hit, 3 lives, 3 continues that reset the score, and it
  always starts at stage 1.
- **Scoring**: enemies, treasure (2,000, 4,000 or 6,000), boss kills
  (10,000 × stage number), and stage-clear bonuses for time, treasure and
  finishing without a hit. An extra life every 30,000.
- **Saves**: one save under `jungle-blaster.v1` holds stages unlocked, best
  score and treasure per stage, settings, and an 8-entry high-score table
  with 3-letter initials.
- **Co-op**: two players share lives and score. The camera never scrolls a
  lagging partner off screen, and boss HP is ×1.5.

## Bosses

| Stage | Boss | Phase scripts (they repeat; phases change at 2/3 and 1/3 HP) |
| --- | --- | --- |
| Jungle | KONG-TRON 2600 | chest beat, barrel toss (shootable), ground-pound shockwaves; then leaps across the arena; then an eye laser you duck or jump |
| River | Iron Croc | low torpedoes, snapping lunge, targeted mortar shells |
| Caves | Drill Mole | falling rocks, burrow and erupt under you, drill charge |
| Temple | Golden Idol | fireball fans, eye shots, summoned bats, drifting, slow bullet rings |
| Volcano | Magma Wyrm | lobbed fire, arcing leaps across the arena, fire rain, fire pillars |
| Alien Base | Mothership | aimed volleys, drones, a tractor beam that tracks you, bullet rings |

## Autopilot

Every five frames, the autopilot runs about a dozen short input plans
through the real `stepPlayer` physics: run, jump now with various hold
lengths, wait then jump, and let go of the vine now or later. It runs them
against platforms and crocs at their future positions, and against threats
projected forward (enemy shots, enemies, boss body and markers). It then
picks the plan with the most safe progress, or the best dodging position in
a boss arena. It shoots constantly, aiming in 8 directions at the nearest
target. It clears stage 1 in both modes in about a minute, and it plays the
title-screen demo.

## Audio

The soundtrack is written as tracker data: one 4-bar loop per stage, plus a
title track and a boss track. Playback uses two pulse channels (25% and
12.5% duty, built as `PeriodicWave`s), a triangle bass and LFSR-style noise
drums, scheduled ahead of time. There are about 40 synthesized sound
effects.

## Telemetry

The game logs `game.ready`, `game.start`, `level.start`, `level.complete`,
`level.fail`, `game.continue`, `game.end`, `game.quit`, `game.complete`,
`boss.start`, `boss.defeat`, `player.death`, `player.bomb`,
`highscore.entry`, `settings.change` and the shared frame monitor's
`frame.long`, `perf.degraded` and `frame.stall`. The frame loop runs inside
`Telemetry.guard`.
