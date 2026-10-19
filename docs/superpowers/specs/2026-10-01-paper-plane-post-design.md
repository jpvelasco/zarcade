# Paper Plane Post — design spec

*2026-10-01. Slug `paper-plane-post`. Genre: Flyer. One button.*

A pastel valley, a paper plane, a satchel of letters. Hold one button to dive
and gain speed, let go to soar. Ride warm updrafts out of chimneys and
campfires, hop between tailwind bands, keep your wings out of the rain, and
put every letter through the right window before you glide down onto the
mailbox.

The feel to aim for: floaty, forgiving, quietly skilful. A beginner gets to
the mailbox by tapping. An expert never touches the ground, chains dive-snaps
into thermals and lands feather-soft on the pad.

## Modes

**Routes** — 45 handcrafted delivery runs in five regions, nine each:

| Region | Mood | New idea |
| --- | --- | --- |
| Oakhollow Town | rooftops, chimneys, washing lines | chimney updrafts, windows |
| Kestrel Cliffs | sea stacks, ledges, gulls | strong ridge lift, headwind gusts |
| Fernwood | tall pines, campfires, lanterns | sticky branches, narrow gaps |
| Mirrorlake | jetty, boathouses, reeds | water (soft but ends the run), lake breeze |
| Snowcap Pass | peaks, cable cars, snow | thin lift, long glides, big rings |

Each route: reach the mailbox, drop letters at the lit windows, thread the
rings, land softly on the pad. Three stars:

1. **Delivered** — touch down anywhere on the mailbox pad.
2. **Full round** — every letter *and* every ring.
3. **Feather landing** — land on the pad under the soft-landing speed with a
   shallow nose.

Rings are optional for finishing but they draw the ideal line, so a new player
learns the route by chasing them. Stars unlock the next region (generously:
region *n+1* opens at a low star count, never a wall).

**Endless Breeze** — a seeded procedural valley that never stops. Distance is
the score; letters along the way feed the stamp album. **Daily Breeze** is the
same generator with the local date as the seed, a named wind of the day and a
goal distance, plus a gentle day streak.

## Physics (`src/flight.js`, DOM-free and deterministic)

A small, honest glider. Everything in SI-ish units; 1 world unit = 1 m, the
plane is a cartoon 1.3 m dart.

State: `x, y, vx, vy, pitch, soak, diveTime`. `y` grows downward (canvas
convention), so a positive angle is nose-down.

Each fixed 1/60 s step:

1. **Relative airspeed.** `air = velocity - wind(x, y, t)`. Everything
   aerodynamic uses `air`, so flying into a rising column produces lift by
   itself — no special case for updrafts.
2. **Pitch.** One button picks a target attitude and the plane rotates toward
   it at a limited rate:
   - held: `target = DIVE_PITCH` (nose 45° down, world-referenced). Heading
     catches up to the nose, so angle of attack self-limits near zero and
     gravity does the work: speed climbs toward ~22 m/s.
   - released: `target = clamp(flightPath - TRIM_AOA, -0.46, 0.95)`. The nose
     sits a fixed 0.22 rad above the flight path, so lift tracks speed. Slow
     and it sinks and speeds up; fast and it arcs upward — the zoom climb that
     makes a dive worth taking. The clamp stops loops.
3. **Lift and drag.** `q = KLIFT * |air|²`; `Cl = CL_SLOPE * aoa` with a stall
   roll-off past `STALL_AOA` (0.30 rad); `Cd = CD0 + K * Cl²`. Lift is
   perpendicular to `air`, drag opposes it. Trim glide is ≈ 12 m/s at a glide
   ratio near 9:1, so a route reads as a long soft curve.
4. **Gravity** `g = 14` (arcade-crisp, not lunar).
5. **Soak.** Rain adds `soak` (0..1); sun and dry air shed it. Soak adds drag,
   adds weight and shaves lift. At 1.0 the wings give up and the plane
   flutters down — a fail, never a surprise, because the HUD shows a wet-wing
   meter filling.

**Dive snap** — the skill move. Release within 0.2 s of the nose passing
through the steep part of a dive that lasted at least 0.3 s and the fold
"snaps": a small perpendicular impulse plus a sparkle and a chime. Snaps are
counted per run and shown on the results card. They are never required.

**Folds and patterns** scale the model a little:
`liftScale, dragScale, diveScale, soakResist, snapScale`. The spread is small
(±12 %) so no fold is a trap and none is mandatory.

## Wind (`src/wind.js`)

A field built from a handful of sources plus a constant regional breeze:

- `updraft` — a warm column (chimney, campfire, sun-baked rock). Bell falloff
  across, fades with height.
- `ridge` — lift hugging a slope, strongest near the rock.
- `tail` / `head` — horizontal bands.
- `rain` — a cloud: downdraft inside, and soaks the paper.
- `gust` — a sine-pulsing band, so the same spot is not the same twice.

`windAt` is a pure sum with a bounding-box early-out; sources are data, so the
tests, the autopilot's lookahead and the renderer's ribbons all read the same
field.

## Sticky hooks

1. **Route map with stars** — five region strips, 45 cards, per-route stars,
   best time, letters, rings and a *Perfect* ribbon.
2. **Stamp album** — 30 stamps, each earned at a letter count or a milestone,
   missing ones drawn as silhouettes.
3. **Folds and patterns** — six folds, twelve papers, unlocked by stars,
   letters and stamps; both visible in play and on the title plane.
4. **Daily Breeze** — the local date names the wind and sets a goal distance;
   a streak counter grows when you hit it.
5. **Personal bests** — title and results cards show best distance, best
   times, total letters, and cheer a new record.
6. **Fast restart** — fail to flying again with one tap, under a second.

No currency, no energy, no nagging.

## Controls

One button is enough everywhere: **Space / ↑ / W / Z**, **mouse hold**,
**touch hold anywhere**, **gamepad A / RT**. Hold = dive, release = soar.
Escape / P and gamepad Start pause. M mutes. R restarts. Enter confirms on
menus. Nothing else is needed, ever.

Accessibility: `prefers-reduced-motion` cuts shake, flashes and particle
counts; the pointer hides after 2 s of play; the phone layout (390×844) fits
without scrolling and the whole screen is the button; text is large and
high-contrast; the top-centre strip stays clear for the full-screen pill.

## Structure

```
games/paper-plane-post/
  index.html style.css cover.svg favicon.svg README.md package.json
  telemetry.js fullscreen.js          copies, never edited
  src/ flight.js wind.js terrain.js rng.js routes.js endless.js world.js
       ai.js catalog.js progress.js daily.js perf.js
       sprites.js render.js audio.js input.js main.js
  tests/ flight wind routes world endless progress ai perf
```

Pure modules (everything above `sprites.js`) never touch the DOM.

## Verification

- `node --test 'games/paper-plane-post/tests/*.test.js'`: physics determinism
  and balance, wind bounds, route data validity, world rules, endless
  determinism and fairness, saves and unlocks, and an autopilot that finishes
  the first routes of every region and flies 2 km of Endless.
- Browser (port 8107, Chrome 9307): title, several routes, endless, daily,
  pause, win and fail, saves after reload, 390×844 touch, reduced motion,
  frame times at 1× and CPU ×4, telemetry records and a forced crash.

## Decisions made without asking

- **Rings are bonus, not gates.** Kids should reach the mailbox on route 1
  without being told what a ring is.
- **Water is soft.** Landing in the lake ends the run with a plop, not a
  crash; the retry button is already under the thumb.
- **No reverse.** The plane always flies left-to-right. A one-button game that
  can stall backwards is a one-button game nobody finishes.
- **Soak is visible.** A wet-wing meter, darker paper and heavier handling, so
  losing to rain always feels earned.
- **Generous unlocks.** Region gates are a handful of stars behind where a
  normal player already is.
