# Starhopper

Hop from planet to planet across an endless galaxy.

Fly a jet fighter down a winding space lane from the cockpit (or a chase
camera). Blast Obsidian Armada squadrons, dodge asteroids and mines, grab
cannon power-ups, pull into the **Space Burger** drive-thru for a snack, warp
through **hyperspace**, and beat the battleship guarding each planet. Every
planet you reach reveals 2–3 new ones, forever, and every journey is
different.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/starhopper/
```

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Fly | WASD / arrows | drag on the left half | left stick |
| Fire | Space | automatic | A |
| Missile | F | 🚀 | B |
| Boost / brake | Shift / X | 🔥 | RT / LT |
| Barrel roll (deflects shots) | Q / E | 🌀 | LB / RB |
| Cockpit ↔ chase view | C | 🎥 | Y |
| Pause / mute | Esc / M | ❚❚ | Start |

The reticle locks onto enemies near the center and your shots curve toward
the lock, so lining up is enough.

## On a journey

- **Enemies:** Armada fighters (fly in formation and shoot), kamikaze drones,
  ghost ships (only hittable while they glow), cruisers (knock out their
  turrets), and a **battleship** at the end: break its glowing weak points,
  then hit the core.
- **Hazards:** asteroids (split when shot), mines, derelict wrecks.
- **Pickups:** ⚡ cannon power (twin → rapid → spread → wide spread), 🛡️
  shields, 🔧 repair, 🚀 missiles, 🌀 hyperspace booster, ✨ stardust.
- **Space Burger:** fly through the drive-thru ring about halfway there for
  Nebula Burgers (repair), Rocket Fries (missiles), Plasma Shakes (cannon
  power), Comet Cola (shields) or the Galactic Combo.
- **Stars:** 1 for arriving, 2 for also destroying half the enemies, 3 for
  also arriving with 60% hull.
- **Hangar:** spend stardust on cannons, hull, deflector shields, engines and
  missiles, and repaint your jet.

Biomes: Verdant Nebula, Frost Rings, Ember Moon, Gas Giant, Crystal Expanse
and, farther out, the Ghost Graveyard. Planets get tougher the farther they
are from Home Port.

## Development

```sh
npm test             # from the repo root
```

URL flags: `?planet=H.0` jumps straight into a journey; `?autopilot` lets the
AI fly. `window.SH` exposes the live world.

| Path | What it is |
| --- | --- |
| `src/galaxy.js`, `src/biomes.js` | Endless seeded planet tree, names, and biome data |
| `src/journey.js`, `src/lane.js` | Seeded journey layout and the lane path |
| `src/world.js`, `src/entities.js` | The simulation (in lane coordinates) and its stats |
| `src/ai.js` | Autopilot: tests, attract mode, and a "clumsy kid" test pilot |
| `src/progress.js` | Save, hangar upgrades, Space Burger menu, stars, rewards |
| `src/render/*` | Three.js: nebula, stars, planet, cockpit, models, effects |
| `src/audio.js`, `src/input.js`, `src/hud.js`, `src/main.js` | Synth sound, controls, HUD/radar, screens and loop |
| `vendor/three/` | Three.js r186 (MIT) |

The tests fly real journeys headlessly: the autopilot must arrive with hull to
spare, and a clumsy pilot who never dodges (with the upgrades a player could
afford by then) must still reach every test planet. See
[`docs/superpowers/specs/2026-09-29-starhopper-design.md`](../../docs/superpowers/specs/2026-09-29-starhopper-design.md).
