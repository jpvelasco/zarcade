# Comet Courier — overhaul (2026-10-06)

Supersedes `2026-10-05-comet-courier-design.md`. The sky-golf core, the exact
DOM-free simulation, the breadth-first solver, the Daily Delivery, postmarks and
skins all stay. What changed is everything that made the shipped game "clunky and
boring and hard to play".

## What was wrong

1. **No puzzle depth.** Every one of the 30 levels solved in one or two launches
   (par 2 for 1-1, par 1 for 1-2…1-6, par 2 for all 24 after that). "Fewest
   launches" had nothing to grip.
2. **World 1 was an empty box.** Generation deliberately emitted zero blocks for
   world 0, so a new player's first six panels were a bare rectangle with a comet
   and a star.
3. **Aiming was guesswork.** The guide was a dashed arrow `26 + power*70` long;
   at full power the comet crossed most of the panel. The simulation was exact
   and cheap the whole time.
4. **Layouts were scatter, not routes.** Obstacles landed at random free spots
   and any solvable result shipped, so nothing read as designed.
5. **The cursor hid the moment play started**, in a game you aim by dragging.

## The four changes

### 1. The aim guide is the real predicted path

`sim.js` gained `previewPath(level, x, y, angle, power, opts)`: it runs the
actual simulation forward from the comet's resting spot and returns sampled
points, the bounce marks, and how it ended — `star` (this aim delivers),
`settle` (the comet stops here) or `cut` (the projection ran out first). The
renderer draws it as dots that shrink and fade, rings each bounce, and caches
the result against the aim, so it is recomputed only when the aim moves.

It is cut short on purpose, per world (`PREVIEW.bounces` and `PREVIEW.len`):
world 1 follows three bounces and 1000 units of travel, world 5 one bounce and
560. That is enough to plan a bank shot and far short of being handed the answer.
A full-power shot travels about 1400 units, so the leash always bites.

To make bounces drawable, `step()` now reports them: `shot.hits` counts
reflections and `shot.hit` carries the impact point, normal and speed for the
step just taken. The browser turns that into a thock and a spark — feedback the
game had none of.

The cursor now simply hides after ~2 s of pointer stillness, never while a drag
is in progress, and `#game.playing { cursor: none }` is gone.

### 2. Thirty authored routes

`levels.js` is now a declarative table, not a generator. Each entry is a design
note plus geometry in field units (`walls`, `rocks`, `winds`, `pads`, `gates`,
`wells`, `letters`), the spawn, the star, and `line` — the solver's launch
sequence stored as (angle index, power index) pairs. `par` is simply
`line.length`, so par and solution can never disagree.

The tests are the contract: every shipped line is replayed through the real
simulation and must deliver a full satchel in exactly par launches, and a second
search to depth `par - 2` must come back empty, proving par is also the floor.
`solve()` now reports whether it ran out of budget rather than out of panel, so a
null result is only trusted when the search actually finished.

Pars: world 1 is 2,2,2,3,3,3 (the teaching ramp); worlds 2–5 are all 3 or 4.
Spread across the 30 routes: three 2s, seventeen 3s, ten 4s.

The design vocabulary that produces real par, learned by measuring:

- **Chambers beat clutter.** Scattered rocks barely raise par, because a
  full-power shot bounces across the whole panel and sweeps everything. Walls
  that divide the panel into bays joined by narrow gaps are what makes a route a
  route.
- **A letter in the spawn's own chamber is a freebie.** Par comes from letters
  that each need their own trip.
- **A pocket whose mouth faces away from the approach** costs one extra launch:
  place the comet, then ease it in.

Worlds: 1 Letter Belt (aim, power, a bank, a pocket), 2 Asteroid Post (round
rocks, sorting shelves, three bays), 3 Wind Alley (bands, a chimney updraught),
4 Spring Steps (pads, staircases, a zig-zag of floors), 5 Gravity Gate (wells,
portals, and both together).

The Daily is now one of the 24 non-tutorial routes, **mirrored**, chosen by the
local date: 96 combinations. Mirroring is exact — the simulation is symmetric and
the solver's angle grid maps onto itself (`a → 8-a` horizontally, `a → 16-a`
vertically) — so the route keeps its par and its verified line with no solve at
load. The tests replay all four mirrorings of all thirty routes to prove it.

### 3. Letters, and what three stars means

Each route carries 2–3 mail letters on side trips. They are collected in flight
(within 24 units) and carried from launch to launch as a bitmask on the shot.

The solver's state became **(resting spot, satchel)**, and a delivery only counts
when the satchel is full. So par is now "the fewest launches that collect
everything and then deliver" — a far more meaningful number than before.

Stars: one for delivering, one for delivering inside par, one for bringing every
letter. A lucky long shot straight to the star is a two-star round, which is
exactly what the old scoring could not express.

Sinking the star early is allowed, not punished — but it is always visible
beforehand: the mailbox is drawn dim with "N letters to collect" until the
satchel is full, and when an aim would deliver early the projection's end marker
turns orange and says "mail left behind". The results card names the missing star
in plain words, and retry is one tap.

The save gained `letters` (best count per route, sanitized and clamped to what
the route carries). Missions are letter-aware ("Collect 6 letters", "Bring every
letter on 2 routes", "Deliver inside par twice"), and there are five new
world-fully-posted stamps plus a letter-driven skin unlock.

### 4. Gravity wells

A new late mechanic, in world 5. A well pulls toward its centre with a **linear
falloff to nothing at the rim**: no singularity, the entire speed change a
crossing can add is bounded by `sqrt(g·r)` (about 390 units/s at the shipped
1500/104), and friction still ends every shot. It joins the same force
accumulation as wind, so the solver and the aim projection understand it for
free.

On screen it is a baked glow sprite (no gradients in the frame loop) with a
dashed rim showing exactly where the pull starts and three spiral arms winding
inward. The aim projection is what makes it learnable: you can see the curve
before you commit.

## Recurring-bug audit

Checked against the arcade's known classes; see the commit messages for the
fixes. The result is banked the instant the comet reaches the star rather than
when the card appears; a second tab's save is adopted via a `storage` listener;
pause and mute answer `pointerdown` so a second finger works; the gamepad drives
menus and its button edges no longer leak across a mode change; `?autopilot`
never writes the save, and now actually exists (it was documented but
unimplemented).

## Files

`src/` `config` (constants, preview budgets), `math`, `sim` (physics, letters,
wells, `previewPath`), `solver` (BFS over position+satchel), `levels` (the
authored table + mirror), `daily`, `progress` (save, stars, letters, stamps,
skins, missions), `perf`, `main` / `render` / `audio`. `tests/` cover the
simulation, the solver, every shipped route, the Daily and progress.
