# Paper Plane Post

A one-button gliding game with heart. You are a paper plane carrying the post
across a pastel valley: a town of chimneys, sea cliffs, a pine wood, a still
lake and a snowy pass. **Hold** to dive and gain speed, **let go** to soar.
Ride the warm columns rising off chimneys and campfires, slip letters through
the lit windows, thread the rings, and set down soft on the mailbox green.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/paper-plane-post/
```

| Action | Keyboard | Mouse / touch | Gamepad |
| --- | --- | --- | --- |
| Dive (hold) | Space, ↑, W, Z, ↓ | hold anywhere | A, RT, LT or up |
| Soar | let go | let go | let go |
| Pause | Esc / P / ❚❚ | ❚❚ | Start |
| Restart | R | | |
| Sound | M / ♪ | ♪ | |
| Confirm a menu | Enter | tap | B |

One button is genuinely enough. There is nothing else to learn.

## How flying works

- **Soaring is your best glide.** Released, the plane holds a gentle nose-up
  trim and travels about twelve metres forward for every metre it drops.
- **Diving buys speed, not height.** Holding the button drops the nose 45°. You
  cover ground fast, punch through a headwind, and build the energy for a
  swooping climb when you let go — but you spend altitude doing it.
- **Warm columns are your lift.** Chimneys, campfires, sun-baked rock and
  cliff faces push air upward. A column is strongest near its base, so diving
  down into the smoke and then soaring out of it climbs best.
- **Bands of breeze** push you along (or back, in Headwind Hollow).
- **Rain soaks your wings.** Inside a cloud the wet-wing meter fills; wet paper
  is heavy, draggy and sinks. Sunbeams dry it out again.
- **Branches, wires, masts, spires and gull flocks** catch the paper. Water
  ends the round with a plop.
- **The dive snap.** Let go at the bottom of a real dive, moving fast, and the
  fold snaps with a sparkle and a little extra lift. Never required, always
  satisfying — and some folds snap better than others.

## Routes

Forty-five handcrafted rounds, nine in each region: **Oakhollow Town**,
**Kestrel Cliffs**, **Fernwood**, **Mirrorlake** and **Snowcap Pass**. Each
round has three stars:

1. **Delivered** — touch down anywhere on the mailbox green.
2. **Every letter** — fly within a few metres of each lit window.
3. **Every ring** — the rings trace the line a soaring plane naturally flies,
   so chasing them teaches the route.

Two extra badges: **✦ Feather** for a gentle landing, and **◎ Bullseye** for
setting down right beside the box. Both show on the route map.

A region opens once you have enough stars; the gates sit well behind where a
normal player already is, and the first round of an open region is always
available.

## Endless Breeze and Daily Breeze

**Endless Breeze** is a seeded valley that keeps going. The ground stays level,
so all your height comes from the columns — the further you go, the thinner
they get, the more rain drifts through and the more clutter reaches up.
Distance is the score.

**Daily Breeze** uses the local date as the seed: the same valley, the same
named wind and the same goal distance for everybody on that day. Reaching the
goal grows a gentle day streak.

## Coming back for more

- **Route map** with stars, best times, letters, rings and badges.
- **Stamp album**: thirty stamps for letters, rounds, rings, snaps, feather
  landings, warm columns, distance and daily goals. Missing ones show as
  silhouettes with how far you have to go.
- **Hangar**: six folds (Classic Dart, Wide Glider, Needle Arrow, Paper Crane,
  Night Hawk and waxed Sunray) and twelve papers. Each changes the flight a
  little — glide, speed, how fast rain soaks in, how well it snaps — and all of
  them are shown in play and on the title screen. Nothing is more than a few
  percent better than anything else, so pick what you like.
- **Personal bests** on the title: rounds, stars, letters, your furthest
  Endless flight and your day streak.
- **Fast restarts**: one tap from a plop back into the air.

Progress saves in `localStorage` under `paper-plane-post.v1`.

## Files

- `src/flight.js`: the glider — lift, drag, angle of attack, soak, dive snap.
  DOM-free and deterministic.
- `src/wind.js`: the air — warm columns, ridge lift, bands, gusts, rain, sun.
- `src/terrain.js`: the ground line, smoothed, with a surface per span.
- `src/routes.js`: the five regions and 45 rounds. Rings, letters and hazards
  are placed against the **glide line** — the path a plane flies without ever
  touching the button — so an offset of 0 is on the line, +12 asks you to find
  lift and −18 asks for a dive. See the comment at the top of the file.
- `src/endless.js`, `src/daily.js`: the procedural valley and the date-seeded
  Daily Breeze.
- `src/world.js`: one run — collisions, collecting, landing, scoring, events.
- `src/ai.js`: the autopilot. A bang-bang controller that simulates the next
  couple of seconds with the button held and released and keeps the better
  future, plus glide-slope guidance for the landing. It flies the title screen,
  `?autopilot`, and the balance tests.
- `src/catalog.js`, `src/progress.js`: folds, papers, stamps and the save.
- `src/sprites.js`, `src/render.js`: baked canvas art and the drawing.
- `src/input.js`, `src/audio.js`, `src/main.js`: one-button input, synthesized
  sound, screens and the loop.
- `src/perf.js`: frame telemetry (the shared pattern from Comet Crush).
- `tests/`: `node --test 'games/paper-plane-post/tests/*.test.js'`.

## Debug parameters

- `?route=7` — open a round straight away (1–45).
- `?endless`, `?daily` — start a breeze run.
- `?seed=123` — a fixed Endless seed.
- `?autopilot` — the autopilot flies for you.
- `?peek` — draw the glide line, the wind boxes and the hazard radii.
- `PPP.forceCrash()` in the console tests the crash screen.
