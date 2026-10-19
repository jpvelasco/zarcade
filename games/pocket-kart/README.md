# Pocket Kart

A top-down kart racer for all ages. Six cartoon critters race on tight,
colourful toy-world tracks: drift through bends for mini-turbos, grab rainbow
item boxes, bump each other about, and win cup trophies.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/pocket-kart/
```

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Steer | ← → / A D | left stick / d-pad | drag anywhere (a pad appears under your thumb) |
| Go | ↑ / W, or Auto-go | Auto-go, or X | always on |
| Brake / reverse | ↓ / S | B / LT | drag down |
| Drift | Space / Shift (hold) | RT / RB (hold) | hold **DRIFT**, or Easy drift |
| Use item | X / E / Enter | A | tap **ITEM** |
| Pause | Esc / P | Start | ❚❚ button |
| Mute | M | | 🔊 button |

In menus, arrow keys or the d-pad move between buttons; Enter, Space or A
picks one; Esc or B goes back.

Touch works one-handed (the steering pad follows whichever thumb touches the
track, and Easy drift starts a drift when you hold a hard turn, firing the
turbo when you straighten up) or two-handed (steer on the left, DRIFT and
ITEM on the right).

## Driving

- **Drift**: hold drift while turning at speed. The kart hops and slides.
  Steering into the drift tightens it, steering away widens it. Sparks turn
  **blue**, then **orange**, then **pink** the longer you hold; let go for a
  mini-turbo that's longer for each colour.
- **Rocket start**: press drift just before GO.
- **Boost pads** give a quick turbo. **Shortcuts** are slow without a boost
  but great with a mushroom.
- Walls bounce you along instead of stopping you. Far behind? A **tail wind**
  speeds you up and gives free little boosts.

## Items

| Item | What it does |
| --- | --- |
| Bubble Shield | Blocks one hit for 10 seconds |
| Bouncy Star | Drop it behind you; whoever drives into it bounces and slows |
| Turbo Mushroom | A quick boost |
| Triple Turbo | Three boosts |
| Homing Jelly | Follows the track to the racer one place ahead and wobbles them |
| Comet Ride | Zoom ahead on autopilot; nothing can touch you |

The further back you are, the better your chances of the strong ones.

## Modes and progress

- **Grand Prix**: three cups of four races (Toybox, Candy and Starlight) in
  Cosy, Zippy or Turbo speed. Points 10/8/6/4/2/1. Top three overall win
  gold, silver or bronze. Finishing a cup in any place opens the next.
- **Time Trial**: three laps alone with a Triple Turbo, racing the ghost of
  your best lap (or the gold ghost until you have one). Earn bronze, silver
  and gold medals.
- **Daily Dash**: a new procedural track every day, the same for everyone,
  with a gentle streak.
- **Garage**: pick a racer (each AI rival has its own personality) and a kart.
  Every kart's stats add up to the same total. Unlock more with trophies,
  medals and Daily Dashes.

Everything saves under the `pocket-kart.v1` local-storage key.

## Files

| File | What it holds |
| --- | --- |
| `src/track.js` | Track building: spline, walls, checkpoints, shortcuts, racing line, projection, validity |
| `src/tracks.js` | The twelve tracks and three cups, as data |
| `src/daily.js` | Daily track generator, date keys, streak |
| `src/kart.js` | Kart physics, drift and turbos, walls and bumps |
| `src/karts.js` | Racers, personalities, karts and stats |
| `src/items.js` | Items and position-weighted rolls |
| `src/ai.js` | AI drivers and speed classes |
| `src/race.js` | Races: laps, places, items, tail wind, rubber band, results |
| `src/ghost.js`, `src/reference.js` | Lap ghosts, expert reference laps and medal targets |
| `src/progress.js` | Save loading and sanitising, trophies, unlocks |
| `src/view.js` | Camera zoom and kart position for any screen |
| `src/render.js`, `src/sprites.js` | Canvas renderer and baked sprites |
| `src/audio.js`, `src/input.js`, `src/main.js` | Sound, controls, screens and loop |
| `src/perf.js` | Frame-time telemetry |

The simulation modules are DOM-free; `tests/` runs them under Node:

```sh
node --test 'games/pocket-kart/tests/*.test.js'
```

## Debug parameters

| Parameter | Effect |
| --- | --- |
| `?autoplay` | An AI drives your kart. Never writes the save. |
| `?gp=0` (`1`, `2`) | Start that cup straight away (`&class=zippy` to pick the speed) |
| `?track=<id>` | Start a time trial on a track, such as `?track=candy-canyon` |
| `?daily` | Start today's Daily Dash |
| `?laps=1` | Shorter races for checking the finish. Never writes the save. |
| `?camera=fixed` | Map-view camera that doesn't turn |
