# Neon Nighthawk

Courier after curfew.

Ride a hover-bike through Vanta after dark, collect a package, and deliver it
before the buyer closes their window. Drift and skim traffic to build charge;
spend it on a phase dash, a scanner-jamming pulse, or an Echo that replays your
recent trail and sends patrols after the wrong bike.

Five contracts take a shift from Lowrise to The Core. The city remembers how
much attention you attract: heat brings more patrols, while credits pay for
better fins, quieter cores, longer Echoes, flux shields, and stronger dash
clamps.

## Play

This game uses ES modules, so serve the repository:

```sh
npm run serve
# open http://localhost:8000/games/neon-nighthawk/
```

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Steer | A / D or ← / → | Drag the steering disc | Left stick |
| Brake / drift | S or ↓ | BRAKE | Triggers |
| Phase dash | Shift or Space | DASH | A |
| Signal pulse | E | PULSE | B |
| Echo decoy | Q | ECHO | X |
| Pause / mute | Esc / M | Pause button | Start |

Stay close to traffic for a charge-building near miss. The center of a street
is safe from cars in curb lanes; move toward the road edge only when a shortcut
or patrol demands it.

## Shift codes and development

The Shift Code on the title screen recreates a deterministic city, contract
sequence, traffic pattern, and weather. Append `?seed=CODE` to the URL to load
one directly. Append `?autopilot` to watch the cautious courier mode; it is
also useful for checking a route hands-free.

```sh
npm test
```

| Path | What it contains |
| --- | --- |
| `src/city.js` | Street grid, building data, traffic, route generation |
| `src/contracts.js` | Deterministic districts, clients, cargo conditions |
| `src/world.js` | DOM-free delivery simulation, patrols, abilities, scoring |
| `src/ai.js` | A cautious controller used by autopilot and tests |
| `src/progress.js` | Local save data, garage upgrades, paint |
| `src/render.js` | Canvas city, rain, routes, vehicles, HUD minimap |
| `src/main.js` | Screens, browser input, persistence, game loop |

Local storage uses the `neon-nighthawk.v1` key.
