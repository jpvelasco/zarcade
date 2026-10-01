# Globe Grand Prix: design

A Three.js world-tour arcade racer. Pick a car, spin the globe, and race six
named rivals through nine locations, each with its own scenery, palette,
weather and time of day. Tone: bright, friendly, all ages. Kid-friendly
"Easy" is the default difficulty.

## Goals

- Real racing against 6 AI rivals with names, personalities, racing lines,
  overtakes and bumping. Rubber-banding is gentle and capped so it stays fair.
- Four race types: 3-lap circuit, point-to-point sprint, time trial against a
  best-lap ghost, and elimination (last place drops out every 25 s).
- Eight cars with distinct handling, liveries, unlocks and upgrades.
- Arcade handling: drift to charge a three-tier mini-turbo, a held boost meter,
  slipstream, jumps, shortcuts, and grip that changes on asphalt, wet, snow,
  sand and dirt. Walls and props always slide, never stick.
- Championship (four cups of 3–4 races with points), quick race, time attack.
- Keyboard, gamepad and touch (on-screen steer or tilt, auto-accelerate).
- 60 fps at 1366×860 with all rivals, smooth under CPU ×4.
- No build step, no assets: Three.js r186 vendored in the game folder, all
  art built from geometry, all sound synthesized.

## Architecture

The simulation is DOM-free and Three.js-free so Node tests can run whole races.
Rendering reads world state and never changes it.

| Module | Responsibility |
| --- | --- |
| `src/math.js` | Seeded RNG, clamp/lerp/smoothstep, angles |
| `src/locations.js` | Nine locations: palette, weather, time of day, scenery theme, surfaces, track shapes, music |
| `src/track.js` | Seeded closed-circuit and sprint generation, sampling, projection, walls, shortcuts, surfaces, racing line |
| `src/cars.js` | Car definitions, stat bars, upgrades, liveries |
| `src/vehicle.js` | Arcade physics, drift-boost math, boost meter, surface grip |
| `src/ai.js` | Rival drivers: personalities, racing line, speed profile, overtakes, rubber-banding |
| `src/race.js` | One race: racers, laps/checkpoints, wrong-way, positions, collisions (walls, props, cars), pickups, slipstream, elimination, ghost, events |
| `src/championship.js` | Cups, points, standings, trophies, quick race/time attack setups |
| `src/progress.js` | Save/load (`globe-gp.v1`), coins, stars, unlocks, upgrades, best times, ghost encoding |
| `src/render/*` | Globe menu, location scenery, cars, particles and weather, camera |
| `src/audio.js`, `src/input.js`, `src/hud.js`, `src/main.js` | Synth audio and music, controls, HUD and minimap, screens and loop |

### Track model

- **Circuits** are star-shaped closed loops: seeded radii around a centre,
  smoothed with a closed Catmull-Rom spline and resampled every 2 m. A loop is
  rejected and regenerated if any two non-neighbouring samples come closer
  than the road clearance or a corner is tighter than the minimum radius.
  Heights use periodic sine sums, so the loop closes in height too.
- **Sprints** are open seeded random walks with the same clearance check.
- **Walls** are one-sided polylines on both edges with an inside normal. A car
  that crosses one is pushed back, loses only the velocity into the wall, and
  its nose turns along the face, so it slides instead of sticking.
- **Shortcuts** are chords across the infield of a bend with a gap cut in the
  inner wall at each end. On a shortcut, progress maps linearly from the entry
  distance to the exit distance, so laps and positions stay continuous.
- **Surfaces** are per-sample (asphalt, wet, snow, sand, dirt) and multiply
  grip and top speed. Each car has an off-road skill that reduces penalties.

### Laps, positions and fairness

- Each circuit has 8 checkpoint gates. A gate counts only when crossed forward
  with continuous motion (no jumps of more than 30 m in a step). Driving
  backwards over a gate un-counts it. Crossing the line forward with every gate
  counted adds a lap; crossing it backwards removes one.
- Wrong-way: facing more than ~110° against the track at speed for 1 s.
- Positions: finished racers by finish time, then by race distance
  (`lap × length + along`); eliminated racers by elimination order.
- Rubber-banding scales an AI's target speed between −8% and +4% depending on
  the gap to the player, and turns off in time trials and the final half lap.

### Drift boost

Hold drift while steering above 12 m/s to slide. Charge grows with time and
steering into the drift. Release at tier 1 (blue, 0.9 s charge), tier 2
(orange, 1.9 s) or tier 3 (purple, 3.2 s) for 0.5 / 0.9 / 1.4 s of mini-turbo.
Drifting, air time and slipstreaming also fill a boost meter that X/Enter
burns.

## Content

Locations: Paris riverside, Rio carnival beachfront, Kyoto autumn temples,
Tokyo neon night, Sahara dunes, Australian outback, New York rooftop bridges,
Swiss Alps snowy hairpins, Iceland aurora tundra.

Cups: Sunrise (3 races), Thunder (4), Aurora (4), Globe (4). Points
10/8/6/5/4/3/2 by place. Trophy gold/silver/bronze = 3/2/1 stars. Stars and
coins unlock cars; coins buy engine, grip and boost upgrades.

Rivals: Yuki (precise), Bruno (aggressive), Ingrid (drift lover),
Amara (steady), Pierre (flashy, inconsistent), Tilly (off-road ace).

## Testing

Node tests cover track determinism, closure, clearance and wall continuity;
drift-boost tiers; surface grip; lap and checkpoint logic including wrong way,
backwards crossing and shortcut gating; positions; elimination; AI finishing
every track with a fair spread of times; wall and prop sliding; car bumps;
championship scoring; save/load and ghost encoding; and the frame monitor.
