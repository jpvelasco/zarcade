# Mole Miner

A cozy dig-and-upgrade game. Help Momo the mole drive a little drill pod from
a sunny meadow down through soil, clay, stone, crystal caves, the Glowcap
Grotto, the Lava Lands and the Ancient Ruins to the Ancient Core.

## How to play

- Drill left, right and down (never up). Fly up with the propeller.
- Gems go in your cargo hold. Land on the wooden base pad to sell them,
  refuel and repair for free.
- Spend coins in the **Workshop**: Drill (digs harder layers), Fuel Tank,
  Cargo Hold, Hull, Lamp, Propeller and the Frost Fan (cools lava).
- Find 24 fossils and relics for the **Museum**. Each finished set unlocks a
  pod paint. Depth milestones pay coins and unlock paints too.
- Watch for friendly hazards: gas pockets (pfft!), boulders that wobble before
  they drop, and hot lava.
- Out of fuel or bumped too often? Wiggles the worm tows you home for a small
  fee. You keep your cargo, and nothing is ever lost.
- **Daily Dig**: a small mine seeded by today's date with one goal and a
  loaner pod. Clear it on consecutive days to build a streak.

## Controls

| Action | Keyboard | Gamepad | Touch | Mouse |
| --- | --- | --- | --- | --- |
| Drive / drill | ← → ↓ or A D S | stick / d-pad | d-pad | hold toward a spot |
| Fly | ↑, W or Space | A or up | Fly button | hold above the pod |
| Workshop (on the pad) | E or Enter | X / Y | Workshop button | click it |
| Pause | Esc or P | Start | ❚❚ | ❚❚ |
| Mute | M | | 🔊 | 🔊 |

## Files

- `src/data.js` tiles, layers, ores, upgrades, museum, paints, milestones
- `src/worldgen.js` deterministic mine generator
- `src/sim.js` pod physics, drilling, hazards (DOM-free)
- `src/game.js` session: selling, upgrades, museum, milestones, towing, daily goals
- `src/progress.js` saves (`mole-miner.v1`), grid diffs, daily streaks
- `src/bot.js` autoplayer (balance tests, title demo, `?autopilot`)
- `src/render.js`, `src/sprites.js` Canvas renderer and baked art
- `src/audio.js` WebAudio sound and music; `src/input.js` controls
- `src/main.js` screens, loop, telemetry; `src/perf.js` frame telemetry
- `tests/` Node tests: `node --test 'games/mole-miner/tests/*.test.js'`

## Debug parameters

- `?autopilot` the bot plays the main mine (and shops)
- `?play` skip the title; `?daily` open the Daily Dig card
- `?coins=5000`, `?drill=3` (also `tank`, `cargo`, `hull`, `lamp`, `prop`, `fan`)
- `?reset` wipe the save first; `?reduced` force reduced motion
