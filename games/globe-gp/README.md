# Globe Grand Prix

Race six rivals around the world.

A 3D world-tour arcade racer built with Three.js. Spin the globe, pick a cup,
and race named rivals through nine locations, each with its own scenery,
weather and time of day: Paris after a summer shower, Rio's carnival coast,
Kyoto's autumn temples, Tokyo's rainy neon nights, the Sahara at sunset, the
Australian outback, New York's sky bridges, snowy Alpine hairpins and
Iceland under the northern lights.

## Play

ES modules don't load from `file://`, so serve the repo first:

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/globe-gp/
```

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Gas / brake & reverse | ↑ / ↓ or W / S | automatic (option) / ⏹ | RT (or A) / LT |
| Steer | ← → or A D | ◀ ▶, or tilt | left stick |
| Drift | Space or Shift | 〰 | B, LB or RB |
| Boost | X or Enter | 🔥 | X or Y |
| Back on the road | R | (automatic when stuck) | Back |
| Pause | Esc or P | ❚❚ | Start |
| Mute | M | pause menu | |

Menus work with the mouse, touch, Tab/arrow keys and Enter, or the d-pad
with A to choose and B to go back.

## How to race

- **Drift boost:** hold drift while steering through a corner. Sparks change
  from blue to orange to purple the longer you hold it. Let go for a
  mini-turbo; purple is the longest.
- **Boost meter:** drifting, flying off jumps and slipstreaming fill it. Hold
  X or Enter to burn it.
- **Slipstream:** tuck in right behind a rival on a straight.
- **Surfaces:** wet roads, snow, sand and dirt are slippery or slow. The rally
  car and the pickup shrug them off best.
- **Shortcuts:** look for the yellow-and-black posts at gaps in the wall.
  They cut across the infield on loose ground.
- **Boost pads, jumps and coins** are on every track.
- Walls and tyre stacks always let you slide along them. If you get stuck,
  you're put back on the road after a few seconds (or press R).
- Hold the gas just as the countdown ends for a **perfect start**.

## Modes

- **World Tour:** four cups of 3–4 races (circuits, sprints and elimination
  races). Points 10/8/6/5/4/3/2 by place; finish the cup in the top three for
  a gold, silver or bronze trophy worth 3, 2 or 1 stars. Stars unlock the next
  cups and new cars.
- **Quick Race:** any location as a 3-lap circuit, a point-to-point sprint or
  an elimination race (last place drops out every 25 seconds).
- **Time Attack:** three laps alone against a ghost of your best lap. Gold,
  silver and bronze medal times come from the autopilot; each gold medal is a
  star.

**Rivals:** Yuki (precise), Bruno (pushy, bumps you), Ingrid (drift lover,
loves shortcuts), Amara (steady), Pierre (flashy but makes mistakes) and Tilly
(off-road ace). They race in your car's class. On Easy (the default) they're
gentle and you get a little help steering away from walls.

**Garage:** eight cars (kart, hatchback, retro bug, pickup, rally car, muscle
car, sports car, future EV) with different speed, acceleration, grip, drift and
weight. New cars need stars and coins. Each car has six paint colours and three
upgrades (engine, tyres, turbo).

Progress is saved in `localStorage` under `globe-gp.v1`; ghosts under
`globe-gp.v1.ghost.<track>`.

## Development

```sh
node --test 'games/globe-gp/tests/*.test.js'
```

The tests run whole races headlessly on every track (everyone must finish,
with a fair spread), and cover track generation, drift-boost math, laps and
checkpoints (wrong way, backing over the line, shortcut gating), elimination,
wall and prop sliding, car bumps, championship scoring, saves and ghosts.

URL parameters for checking things quickly:

| Parameter | Effect |
| --- | --- |
| `?race=tokyo:circuit` | Jump straight into a race (`circuit`, `sprint`, `elimination`, `timetrial`) |
| `&car=rally` | Use a car for that race |
| `?autopilot` | The AI drives your car |
| `?laps=1` | Shorter circuit races |
| `?quality=0` | Start at the lowest quality level (0–2) |
| `?reduced` | Act as if reduced motion were requested |

`window.GP` exposes the live race, view and save for poking around.

| Path | What it is |
| --- | --- |
| `src/locations.js` | The nine locations: palettes, weather, surfaces, track shapes, music |
| `src/track.js` | Seeded circuits and sprints, walls, shortcuts, gates, pads, coins, ramps |
| `src/cars.js`, `src/vehicle.js` | Car stats and upgrades; arcade physics with drift boost and surfaces |
| `src/collide.js` | Walls, props and car bumps that slide instead of sticking |
| `src/ai.js` | Rival personalities, racing line, speed profile, overtakes, rubber-banding |
| `src/race.js` | One race: laps, checkpoints, positions, slipstream, elimination, ghosts |
| `src/championship.js`, `src/progress.js` | Cups and points; save data, unlocks and ghost encoding |
| `src/render/*` | Globe menu, scenery builder, cars, effects and weather, race view |
| `src/audio.js`, `src/input.js`, `src/hud.js`, `src/main.js` | Synth engines and music, controls, HUD and minimap, screens and loop |
| `vendor/three/` | Three.js r186 (MIT) |

The simulation has no Three.js or DOM dependencies. Rendering only reads the
race state. Scenery is merged into a few vertex-coloured meshes per 150 m cell
(small details hide beyond 260 m), weather is animated on the GPU, and the
renderer lowers its pixel ratio and shadow size if frames run long. See
[`docs/superpowers/specs/2026-10-01-globe-gp-design.md`](../../docs/superpowers/specs/2026-10-01-globe-gp-design.md).
