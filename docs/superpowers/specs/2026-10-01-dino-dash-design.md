# Dino Dash: design

A three-lane endless runner for all ages. A baby dinosaur sprints down a
prehistoric valley path, away from Old Rumbles, a goofy volcano that burps
out Lavvy, a big friendly lava blob who wants a hug. Swipe or press arrows to
change lanes, jump and roll; dodge logs, geysers, boulders, bramble hedges and
pterodactyls; scoop amber coins and power-ups. Speed ramps up gently.

## Look

Pseudo-3D on Canvas 2D (no Three.js, so nothing to vendor). A pitched
perspective camera sits behind and above the dino. The path is drawn as ~44
depth strips, far to near, with alternating stripes that sell speed and a
gentle, seeded side-to-side bend (pure x offset ∝ z², so collisions stay in
straight "track space"). Everything else is a baked sprite scaled by depth:
the dino (6 run frames, jump, roll ball, glide; per species), hats, coins
(8 spin frames), obstacles, roadside props, shadows and particles. Sky,
mountains and fog are baked per biome palette.

Four biomes cycle every 900 m with a 60 m colour blend: Fern Valley (day),
Sunset Mesa, Misty Marsh and Starry Grove (night, glowing mushrooms). Old
Rumbles' smoke puffs drift overhead from behind; a "BLORP!" rumble plays now
and then.

Camera framing adapts: landscape uses a lower, wider view; portrait raises
the camera and pitches it down so all three lanes fit 390 px wide with a big
dino. DPR is capped at 2 and a quality scaler steps it down when frames
are slow.

## Rules (DOM-free `src/world.js`)

- Track space: lane x ∈ {-1, 0, 1} (2.2 m apart), z = metres along the path.
  The dino stays at the camera's z = 0; obstacles live at absolute distance.
- Speed `v(d) = 10 + 14·(1 − e^(−d/2200))` m/s: 10 → ~15.5 at 1 km, ~20 at
  3 km, capped at 24. Fixed 1/120 s simulation step.
- Lane change takes 0.14 s (eased). Jump: apex 1.7 m, 0.6 s airtime. Roll:
  0.62 s, body 0.7 m tall. Jump during a roll cancels it; roll in the air
  slams down then rolls. One buffered action (0.18 s) so early presses count.
- Obstacles:
  - **Log** (low, 0.8 m): jump it (or change lane).
  - **Pterodactyl** (flies 1.0–2.1 m): roll under it.
  - **Geyser** (bubbles, then erupts as you near): full block, change lane.
  - **Boulder**: full block.
  - **Bramble hedge**: lengthwise full block 10–26 m long; bumping its side
    while changing lanes bounces you back.
- Hits are gentle. A hit knocks the obstacle aside, the dino stumbles
  (slows for a moment, 1 s of blink immunity) and Lavvy pops up behind. A
  second hit while Lavvy is still close (7 s) and Lavvy catches you with a
  warm hug: the run ends. An egg shield absorbs a hit with no stumble.
- Power-ups (one every ~260–420 m, always in a reachable lane):
  - **Egg shield**: absorbs one hit (lasts until used or 30 s).
  - **Magnet**: pulls amber from all lanes (8 s, upgradable to 16 s).
  - **Glide leaf**: float above everything collecting a sky trail of amber
    (6 s, upgradable to 11 s). Landing clears the path just ahead.
- Score = Σ distance × multiplier. Amber is the shop currency.

## Generation (`src/track.js`)

Seeded (mulberry32). Content is emitted as rows ahead of the dino from a
weighted pattern library unlocked by difficulty tier (distance). Fairness
invariants, all tested over many seeds:

- Every row has at least one passable lane (empty, log or pterodactyl) and
  at most two full blocks; hedges count as full blocks in every row they
  span, and a hedge never covers all three lanes.
- Row spacing ≥ 0.82 s at the current speed (≥ 1.1 s for the first 300 m),
  so the dino can always reach any lane and land between actions.
- Coins never overlap obstacles (except arcs over logs at jump height).
- The first 60 m are empty.

Same seed → same rows, coins and power-ups. Daily Dash uses the local date
as the seed.

## Sticky hooks (saved under `dino-dash.v1`)

1. **Missions with a multiplier level.** Three missions at a time from a
   pool of 14 (per-run and lifetime kinds: amber, distance, logs jumped,
   pterodactyls rolled under, power-ups, lane changes, glide distance,
   magnet amber, no-bump distance, geysers passed, Daily Dash, ...). Targets
   scale with the level. Finish all three to raise the multiplier (×1 → ×30)
   and earn bonus amber. The multiplier applies straight away.
2. **Unlockable dinos and hats** bought with amber, with silhouettes for
   what's still locked: 7 dinos (T-rex Pip, Trix, Steggy, Bronto, Zippy,
   Bonk, Sunny) and 11 hats that show in play. Boost upgrades for magnet,
   glide and shield add a third shop tab.
3. **Daily Dash**: one seeded run per local date with a daily theme (Log
   Jam, Ptero Parade, Geyser Gulch, Amber Rain, Hedge Maze...) and a goal
   distance. Reaching it pays bonus amber once a day; a gentle streak
   counter shows consecutive days (no guilt when it resets).
4. **Personal bests**: best distance and best score on the title and
   results screens, a "New best!" moment, and a BEST flag post by the path
   at your best distance.
5. **Fast restarts**: one tap/Enter/A on results starts a new run in under
   a second.

Prices are generous: typical runs earn 80–300 amber; the first dino costs
250 and hats start at 120.

## Screens

Title (live autopilot attract run behind, logo, best distance, amber,
missions, Play, Daily Dash, Shop, sound/music), Shop (Dinos / Hats / Boosts),
pause (Resume, Restart, missions, sound/music, Back to arcade), results
(distance, score, amber, new best, mission ticks, Run again / Shop / Title).
`← Arcade` top-left on title. HUD avoids the top-centre 60 px.

## Controls

| Action | Keyboard | Touch / mouse | Gamepad |
| --- | --- | --- | --- |
| Change lane | ← → / A D | swipe left / right | d-pad / stick |
| Jump | ↑ / W / Space | swipe up | A or up |
| Roll | ↓ / S | swipe down | B or down |
| Pause | Esc / P | ❚❚ | Start |

Swipes fire as soon as the finger travels 22 px, not on release. Menus work
with arrows/d-pad + Enter/A. Pointer hides after 2 s idle in play.

## Accessibility and performance

`prefers-reduced-motion`: no shake, no speed lines, no camera bob, fewer
particles, softer flashes. Big friendly text, high-contrast HUD. No
shadowBlur/filter per frame; gradients baked; particles capped at 140.

## Telemetry

`game.ready`, `level.start` (mode: run/daily, dino, hat, multiplier),
`level.complete` (on catch: distance, score, coins, time), `level.fail`
isn't separate (a run always ends by catch; we log `level.complete` with
reason, plus `run.hit`), `mission.complete`, `multiplier.up`, `shop.buy`,
`daily.goal`. frameMonitor wired like Comet Crush.

## Design calls

- Canvas pseudo-3D instead of Three.js: lighter, faster under CPU ×4,
  nothing to vendor, and the sprite art fits the storybook arcade look.
- The volcano is behind the camera, so it appears as smoke, rumbles and
  Lavvy (the chaser) rather than in view; the title art shows it.
- Two hits within 7 s end a run (Subway Surfers style) instead of one, so
  young players get long runs.
- Debug params: `?autopilot`, `?seed=N`, `?daily`, `?dist=N` (start
  further along), `?crash` is not needed (use `Telemetry.guard` test via
  `window.DD.forceCrash()`).
