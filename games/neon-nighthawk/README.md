# Neon Nighthawk

Light up Vanta.

It's Lantern Festival night, and HALO, the city's overprotective computer, has
switched off every light for curfew. Ride Kit's hover-bike for Nighthawk
Couriers and make deliveries across five districts. Every spark you grab
lights the buildings beside it, and every drop-off sends a wave of light
through the neighborhood.

The story runs over five chapters of three jobs. Jobs mix it up: deliveries,
lantern drops in any order, spark-cell hunts, chasing a runaway robot (or a
cat), stealth runs where three scanner locks lose the cargo, express windows,
and a finale in HALO's Core. Each job has three stars: finish it, grab 70% of
the sparks, and keep the bike above 70%. Credits buy garage upgrades.

## Play

This game uses ES modules, so serve the repository:

```sh
npm run serve
# open http://localhost:8000/games/neon-nighthawk/
```

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Ride | Arrows / WASD | Drag the thumbstick | Left stick or d-pad |
| Phase dash | Space | DASH | A or RT |
| Signal pulse | E | PULSE | B |
| Echo decoy | Q | ECHO | X |
| Drift | Shift | DRIFT | LB / RB |
| Pause / mute all | Esc or P / M | Pause button | Start |

Hold the direction you want to go on screen. The bike stays on its street
between intersections, so holding a turn early takes the next corner for you,
and a diagonal means "turn at the next crossing". Let go to coast to a stop.
Traffic keeps to the curb lanes; the centre line is safe, and passing close to
cars at speed builds charge.

Each district has its own synthesized soundtrack. The pause menu has
separate Effects and Music switches (saved with your progress), and M mutes
or unmutes both.

## Shift codes and development

The story uses one fixed city. A Shift Code (under the title screen's Shift
code toggle) deterministically rebuilds the city layout, stops, sparks,
sentries, traffic and weather while keeping the same story. Append
`?seed=CODE` to load one directly, `?chapter=N` (and `&job=N`) to jump to a chapter or job, and
`?autopilot` to watch the courier AI ride hands-free. Rendering adapts to
the machine: it steps the pixel ratio and optional effects down when frames
run slow (logged as `render.quality`). `?quality=high|medium|low|lowest`
pins a level for testing.

```sh
npm test
```

| Path | What it contains |
| --- | --- |
| `src/city.js` | Street grid, building data, traffic, route generation |
| `src/story.js` | The story: chapters, jobs, dialogue, HALO's lines |
| `src/contracts.js` | Deterministic districts, stops, sparks, sentries, time windows |
| `src/world.js` | DOM-free simulation: grid-assisted steering, jobs, runners, drones, light, stars |
| `src/ai.js` | A cautious controller used by autopilot and tests |
| `src/progress.js` | Local save data, story stars and unlocks, garage upgrades, paint |
| `src/render.js` | Canvas renderer: cached block sprites, batched glows, particles, minimap |
| `src/sprites.js` | Sprite baking: blocks (dark and lit), bike, cars, drones, lanterns, glows |
| `src/scenery.js` | Deterministic rooftops, lamps, lantern strings and puddles |
| `src/quality.js` | Render quality levels and the frame-time scaler |
| `src/cache.js`, `src/particles.js` | LRU sprite cache and a capped particle pool |
| `src/music.js`, `src/audio.js` | District song patterns; WebAudio music and effects |
| `src/main.js` | Screens, browser input, persistence, game loop |

Local storage uses the `neon-nighthawk.v1` key.
