# Dino Dash

A three-lane endless runner. A baby dinosaur sprints down a prehistoric
valley, away from Old Rumbles, a goofy volcano that burps out Lavvy, a big
friendly lava blob who really wants a hug. Dodge logs, geysers, boulders,
bramble hedges and pterodactyls, scoop up amber, and see how far you get.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/dino-dash/
```

| Action | Keyboard | Touch / mouse | Gamepad |
| --- | --- | --- | --- |
| Change lane | ← → / A D | swipe left / right | d-pad / left stick |
| Jump | ↑ / W / Space | swipe up | A (or up) |
| Roll | ↓ / S | swipe down | B (or down) |
| Pause | Esc / P / ❚❚ | ❚❚ | Start |
| Mute | M / 🔊 | 🔊 | |

Swipes trigger as soon as your finger moves, so you don't have to lift it.
Rolling in mid-air slams you down; jumping cancels a roll. Presses a moment
early are remembered. Menus work with arrows or the d-pad plus Enter / A.

## Rules

- **Logs**: jump them. **Pterodactyls**: roll under them. **Geysers,
  boulders and hedges**: change lanes. Bumping a hedge's side bounces you back.
- A bump knocks the obstacle away and Lavvy comes running. Bump again while
  Lavvy is close (about 7 seconds) and you get a warm lava hug: run over.
- Speed ramps up gently from 10 m/s to 24 m/s.
- Score is distance times your multiplier.

### Power-ups

| Power-up | Effect |
| --- | --- |
| 🥚 Egg shield | Saves you from one bump |
| 🧲 Magnet | Pulls amber from every lane |
| 🍃 Glide leaf | Float above everything over a sky trail of amber |

## Coming back for more

- **Missions**: three at a time. Finish all three to raise your score
  multiplier (up to ×30) and earn bonus amber.
- **Dinos and hats**: spend amber on seven dinos (Pip, Trix, Steggy, Bronto,
  Zippy, Bonk and golden Sunny) and eleven hats, all shown in play. Locked
  ones show as silhouettes. Boosts make power-ups last longer.
- **Daily Dash**: one valley per day (from the local date) with a theme and a
  goal distance. Reach it for bonus amber and grow a gentle day streak.
- **Bests**: your best distance shows on the title, a BEST flag marks it on
  the path, and the results screen cheers a new record.
- Four biomes cycle every 900 m: Fern Valley, Sunset Mesa, Misty Marsh and
  Starry Grove.

Progress saves in `localStorage` under `dino-dash.v1`.

## Files

- `src/config.js`: tuning (speeds, jump, obstacles, tiers).
- `src/rng.js`: seeded randomness and hashing.
- `src/track.js`: seeded track generator with fairness rules.
- `src/world.js`: the run simulation (DOM-free).
- `src/ai.js`: autopilot for the title attract run, `?autopilot` and tests.
- `src/missions.js`, `src/progress.js`, `src/daily.js`, `src/catalog.js`:
  missions, saves and shop, the Daily Dash, and what the shop sells.
- `src/camera.js`, `src/biomes.js`: projection and palettes (pure).
- `src/sprites.js`, `src/render.js`: baked canvas art and the pseudo-3D
  renderer.
- `src/input.js`, `src/audio.js`, `src/main.js`: browser input, synthesized
  sound and music, screens and the loop.
- `src/perf.js`: frame telemetry (shared pattern with Comet Crush).
- `tests/`: `node --test 'games/dino-dash/tests/*.test.js'`.

## Debug parameters

- `?autopilot`: the autopilot plays a run.
- `?play`: skip the title and start a run.
- `?daily`: with `?play` or `?autopilot`, start today's Daily Dash.
- `?seed=N`: fixed track seed.
- `?dist=N`: start N metres along (try 2750 for Starry Grove).
- `DD.forceCrash()` in the console tests the crash screen.
