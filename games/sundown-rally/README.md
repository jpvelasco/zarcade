# Sundown Rally

Race the sunset. Outrun the undead.

A 3D jeep racer built with Three.js. Tear down winding desert tracks at dusk,
plow through cartoon zombies, dodge rocks and wrecks, grab boosters and roof
weapons, and reach the finish to unlock the next track. Each track is later in
the evening than the last, ending under the stars.

## Play

ES modules don't load from `file://`, so serve the repo first:

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/sundown-rally/
```

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Gas / brake & reverse | ↑ / ↓ or W / S | automatic / ⏹ | RT / LT |
| Steer | ← → or A D | ◀ ▶ | left stick |
| Nitro | Shift | 🔥 | A |
| Fire rockets | Space | 🚀 | B / X |
| Pause | Esc or P | ❚❚ | Start |
| Mute | M | pause menu | |

## What's on the road

- **Zombies:** *shamblers* (plow through), *runners* (they chase you),
  *bloaters* (glowing and green; they explode, so shoot them from afar), and
  *brutes* (hard hats; ramming them hurts, so use weapons or jump them).
- **Pickups:** coins, 🔥 nitro, 🔧 repair, 🛡️ shield (8s of smashing through
  everything), 🔫 roof gun (aims and fires by itself), 🚀 rockets (homing,
  and they destroy obstacles too).
- **Hazards:** rocks, cacti, wrecks, explosive barrels (shoot them to clear a
  crowd), rolling boulders, and ramps for big air (air time refills nitro).
- **Health** regenerates slowly after 4s without damage. At 0 you're wrecked,
  but you keep the coins you picked up.

## Tracks

| # | Track | New on this track |
| --- | --- | --- |
| 1 | Dusk Dunes | Shamblers, runners, cacti, ramps |
| 2 | Canyon Run | Narrow road between canyon walls, brutes, rolling boulders, rockets |
| 3 | Ghost Town | Old-west storefronts, bloaters, barrels, wrecks |
| 4 | Night Oasis | Night driving with headlights, palms, every zombie type |

Finishing earns 1 star, beating 1.2× par earns 2, beating par earns 3. Spend
coins in the **garage** on Engine, Armor, Nitro and Tires, and repaint the jeep.

## Development

```sh
npm test             # from the repo root; includes a headless AI race on every track
```

Add `?autopilot` to the URL to let the AI drive, or `?track=N` (0–3) to jump
straight into a race. `window.SR` exposes the live world for poking around.

| Path | What it is |
| --- | --- |
| `src/track.js`, `src/tracks.js` | Seeded track generation and the track definitions |
| `src/level.js`, `src/entities.js` | Seeded placement of everything on a track, and their stats |
| `src/vehicle.js`, `src/ai.js` | Arcade jeep physics and the AI driver |
| `src/world.js` | One race: collisions, zombies, weapons, pickups, events |
| `src/progress.js` | Save data, stars, coins, upgrades |
| `src/render/*` | Three.js scene, models, particles, camera (reads the world, never changes it) |
| `src/audio.js`, `src/input.js`, `src/hud.js`, `src/main.js` | Synth sound, controls, HUD, screens and game loop |
| `vendor/three/` | Three.js r186 (MIT) |

The simulation has no Three.js or DOM dependencies, so tests run whole races
in Node. Races are built around a list of racers, so rival AI jeeps can be
added later as extra racers driven by `src/ai.js`. See
[`docs/superpowers/specs/2026-09-29-sundown-rally-design.md`](../../docs/superpowers/specs/2026-09-29-sundown-rally-design.md).
