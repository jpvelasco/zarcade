# Sundown Rally: design

A Three.js jeep racer. Drive a winding desert track at sunset, plow through
cartoon zombies, dodge obstacles, grab boosters and weapons, and reach the
finish to unlock the next track. Each track is later in the evening than the
last. Tone: cartoony and all-ages (zombies go *poof* and fly off, no gore).

## Goals

- Free steering on a winding track with a start and a finish (option 1).
- Rival AI jeeps can be added later without restructuring (option 3).
- Plays with keyboard or touch, runs at 60 fps on a laptop.
- Works offline: Three.js is vendored, no build step. Needs a local server
  (`npm run serve`) because browsers block ES modules on `file://`.

## Architecture

Simulation is pure JavaScript with no Three.js or DOM, so Node tests can run
whole races headlessly. Rendering reads simulation state and never changes it.

| Module | Responsibility |
| --- | --- |
| `src/math.js` | Seeded RNG, clamp/lerp/smoothstep, angle helpers |
| `src/track.js` | Seeded centerline generation, samples, nearest-point lookup, road height, ground height |
| `src/tracks.js` | Data for each track: shape, palette, hazards, zombie mix, pickups |
| `src/level.js` | Seeded placement of obstacles, ramps, pickups, zombies, decor |
| `src/vehicle.js` | Arcade jeep physics driven by an input `{ throttle, brake, steer, nitro, fire }` |
| `src/ai.js` | AI driver producing the same input shape (autopilot for tests and par times; rivals later) |
| `src/world.js` | One race: racers, zombies, pickups, weapons, collisions, events |
| `src/progress.js` | Save data, unlocks, stars, coins, garage upgrades |
| `src/render/*` | Scene, sky, terrain, road, models, particles, camera |
| `src/audio.js`, `src/input.js`, `src/hud.js`, `src/main.js` | Sound synthesis, controls, HUD, screen flow |

**Designed for rivals:** a race holds `racers[]`, each `{ vehicle, driver,
progress, finishTime }`. The player is one racer driven by input. Adding
rivals means adding racers driven by `ai.js`, showing race position in the
HUD (already reserved), and adding car-to-car bumps.

`world.events` is a queue of things that happened each step (hits, pickups,
explosions, landings). The renderer and audio consume it, so the simulation
has no idea it's being drawn.

## Gameplay

- **Driving:** accelerate, brake/reverse, steer, nitro. Off-road is slower
  with less grip. Crests and ramps launch the jeep; being airborne gives
  nitro and lets you jump over obstacles and zombies.
- **Health:** 100 HP. Hitting rocks, wrecks, brutes and explosions hurts.
  At 0 HP you're wrecked and retry.
- **Zombies:** shamblers (slow, plow through), runners (chase you), bloaters
  (explode when rammed; shoot them from a distance), brutes (helmeted, hurt
  to ram; need weapons or a jump).
- **Pickups:** coins, nitro, repair, shield (smash anything for 8s), roof gun
  (fires automatically at targets ahead), rockets (fire manually, homing,
  destroy obstacles).
- **Obstacles:** rocks, cacti (breakable), wrecks, explosive barrels, rolling
  boulders, ramps.
- **Tracks:** Dusk Dunes → Canyon Run → Ghost Town → Night Oasis, each with
  its own palette, hazards, zombie mix and a tip on arrival.
- **Results:** 1 star for finishing, 2 for beating 1.2× par, 3 for beating
  par. Coins earned are spent in the garage on engine, armor, nitro and tires.

## Testing

- Unit tests for track generation (length, no self-intersection), nearest
  lookup, vehicle physics, collision rules, level placement (the road is
  never fully blocked), and progress/upgrades.
- A headless race test: the AI driver finishes every track without being
  wrecked. This also calibrates par times.
- Browser play-testing with an autopilot and manual driving, checking visuals
  and frame rate.
