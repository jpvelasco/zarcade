# Starhopper: design

Fly a jet fighter from planet to planet across an endless galaxy. Each
journey runs down a winding space lane: blast Obsidian Armada fighters,
dodge asteroids and mines, stop at a Space Burger drive-thru, warp through
hyperspace, and defeat a battleship guarding the destination planet.
All-ages, cartoony sci-fi. The ships and factions are our own designs.

## Flight model

Flight-lane rails (like Star Fox). The jet moves forward along a spline at
cruise speed (boost and brake change it). The player steers within a box
around the lane (±28 m sideways, ±18 m vertically) and barrel rolls to
deflect shots.

**Lane coordinates.** The whole simulation works in `(s, u, w)`: distance
along the lane, sideways, and up. The lane curves gently, so collisions in
these coordinates match what the player sees. Only the renderer maps
`(s, u, w)` to world space through the lane frame. That keeps the simulation
simple and fully testable in Node.

## Structure

| Module | Responsibility |
| --- | --- |
| `src/galaxy.js` | Endless seeded planet graph: ids, names, biomes, depth, branching |
| `src/biomes.js` | Per-biome palette and weights for stretches, enemies, hazards |
| `src/lane.js` | Lane centerline and frames (pure math, used by the renderer) |
| `src/journey.js` | Seeded journey layout: stretches, spawn triggers, pickups, burger stop, boss |
| `src/entities.js` | Enemy, hazard and pickup stats |
| `src/world.js` | Simulation: jet, lasers, missiles, enemies, collisions, pickups, shop, hyperspace, boss |
| `src/ai.js` | Autopilot pilot producing player input (tests, par values, attract mode) |
| `src/progress.js` | Save data, upgrades, shop menu, stars, rewards |
| `src/render/*` | Three.js: nebula sky, stars, destination planet, models, cockpit, effects |
| `src/audio.js`, `src/input.js`, `src/hud.js`, `src/main.js` | Sound, controls, HUD and radar, screens and loop |

## Journey

About 2–3 minutes. The layout comes from the planet's seed and depth, and the
biome weights the mix of stretches:

1. **Stretches:** asteroids, squadrons, drones, mines, a cruiser with turrets,
   ghost ships, and a hyperspace gate.
2. **Space Burger** at about 50%: fly through the drive-thru ring to open the
   menu (repair, cannon power, missiles, shield). Prices are paid in stardust.
3. **Boss:** a battleship keeps pace ahead of you. Break its weak points,
   then its core. The destination planet fills the view.

**Hyperspace:** a booster triggers a warp at 5× speed, invulnerable, through
a tunnel full of stardust. It always ends before the burger stop or boss.

**Difficulty** grows with depth: enemy health, fire rate and counts.

## Progress

- **Galaxy:** Home Port starts cleared. Clearing a planet reveals 2–3 child
  planets, forever.
- **Stars:** 1 for arriving, 2 for also destroying at least half the
  enemies, 3 for also arriving with at least 60% hull.
- **Hangar:** stardust buys lasting upgrades for cannon, hull, shields,
  engine and missiles, plus paint.

## Testing

- Galaxy determinism and branching, journey layout invariants, lane math,
  combat rules, progress and shop.
- The autopilot clears planets of every biome at several depths without
  being destroyed.
- Browser play-testing: visuals, cockpit and chase views, frame rate, touch
  layout.
