# Deep Dive

A gentle underwater exploration game. Pilot **Bubbles**, a little yellow
submarine, through one connected ocean: Sunny Shallows, the Kelp Forest, a
Shipwreck, Coral City, the Twilight Zone, the Glowing Trenches and a Volcanic
Vent. Ping sonar to reveal the dark, scan 59 sea creatures for your Sea book,
and find the five parts that open new areas. There is no combat and no death:
bumps cost a little air, and running out of air floats Bubbles back to the
last dock with nothing lost.

Run `npm run serve` from the repo root and open
`http://localhost:8000/games/deep-dive/` (ES modules need a server).

## How to play

- Swim close to a creature and hold still: a ring fills and it goes in your
  Sea book with a true fact. Shy ones (anglerfish, eels, pufferfish) flee if
  you zoom at them; hiding ones (octopus, seadragon) only show after a sonar
  ping. Curious ones (dolphins, seals, otters) come to you.
- Parts open the world, in order: **Grabber** (rusty hatches into the
  Shipwreck), **Coral Drill** (coral walls into Coral City), **Headlights** (the
  dark Twilight Zone), **Pressure Hull** (the deep Trenches) and **Turbo Fin**
  (the strong current in front of the Volcanic Vent). The Heart of the Sea
  waits at the top of the vent.
- Air drains slowly. The surface and every dock refill it; docks also save.
- Collect 32 treasures and 12 hidden golden shells. Every four shells add an
  extra air tank. Some shells need later parts, so come back with new gear.
- Daily dive: three creatures to scan today (only from areas you can reach),
  with a streak. Scanning a known creature still counts.
- Unlock 12 paint jobs in the Paint shop; personal bests (deepest dive, most
  new creatures in one dive, fastest daily) show on the title screen.

## Controls

| | Keyboard | Mouse | Touch | Gamepad |
| --- | --- | --- | --- | --- |
| Swim | WASD / arrows | hold left button to swim toward the pointer | hold or drag | left stick / d-pad |
| Sonar | Space | right-click | Sonar button | A |
| Map | M | map button / minimap | map button | Y |
| Sea book | B | book button | book button | X |
| Pause | Esc / P | ❚❚ | ❚❚ | Start |
| Mute | N | 🔊 | 🔊 | |

## Files

- `src/map.js` the hand-authored ocean (shapes, gates, currents, docks, items) and terrain density.
- `src/areas.js` areas and upgrades; `src/gating.js` the gating graph, flood fills and path finding.
- `src/creatures.js` species data, facts and deterministic spawns.
- `src/world.js` the DOM-free simulation; `src/autopilot.js` a route-following pilot.
- `src/progress.js` saves (`deep-dive.v1`), daily dive, streaks, paints, bests.
- `src/terrain.js` marching squares; `src/render.js`, `src/sprites.js` Canvas drawing.
- `src/audio.js` WebAudio music and effects; `src/input.js`; `src/main.js` screens and loop; `src/perf.js` frame telemetry.

## Debug parameters

- `?autopilot` an explorer pilot drives Bubbles (also used on the title screen).
- `?play` skip the title screen. `?fresh` ignore and don't write the save.
- `?ups=N` grant the first N parts. `?at=x,y` start at map cell x,y.

## Tests

`node --test 'games/deep-dive/tests/*.test.js'`: data validity, gating and
soft-lock proofs, simulation, an autopilot run that finds every part in order
with real physics, saves and the daily dive.
