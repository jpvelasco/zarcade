# Comet Courier — design

A "sky golf" billiards puzzle for the Starlight Arcade (slug `comet-courier`,
genre Puzzle). Slide a little comet across a cosmic panel and, in as few
launches as possible, sink it into the glowing **mailbox star**.

## Core rules

- The field is a portrait panel (540×720 logical units, scaled to fit). Top-down
  view; there is no gravity, just momentum and friction.
- You aim with a slingshot drag (mouse / touch / keyboard / gamepad). A longer
  drag means a stronger launch. The comet flies until it slows and **settles**,
  then you launch again from wherever it stopped. Fewer launches = better.
- Colliders: field walls (reflect, some energy lost), **blocks** (rectangles,
  reflect), **asteroids** (circles, bouncy), **wind zones** (constant push while
  inside), **spring pads** (a kick in the pad's arrow direction on entry), and
  **portals** (enter one, exit its pair carrying your velocity).
- The comet is captured when its centre reaches the star's radius. Stars:
  **3★** at par, **2★** within par + 2, **1★** for any delivery. No timers, no
  fail state — Retry is always one tap. Par is the solver's fewest-shot line.

## Physics (DOM-free, exact)

`src/sim.js` is the single source of truth; Node tests and the browser share it.
Fixed step `1/120 s`. Per step: apply wind force → integrate → resolve blocks,
asteroids and the outer wall (circle–AABB / circle–circle, restitution < 1) →
spring entry impulse → portal teleport (offset out along the velocity so it does
not bounce straight back) → friction (speed keeps a fixed fraction each second)
→ capture test → settle when speed < threshold or a shot runs long. Restitution
and friction both remove energy, so every shot settles.

## Solver

`src/solver.js` runs a breadth-first search over *settled positions* (quantized)
with a discrete action set (16 angles × 4 powers). Because each action costs
exactly one launch, BFS yields the fewest-launch solution. The result is the
level's **par** and its **line** (the launch sequence). The line doubles as the
attract-mode ghost on the title and level-select screens.

## Content

Five worlds × 6 levels (30). Layouts are generated deterministically from the
level index (seeded `mulberry32`) and complexity scales with the world: walls →
asteroids → wind → springs → portals. A layout is accepted only when the solver
solves it within 5 launches, so every shipped level is provably solvable and the
solver line is a verified balance check. New mechanics appear gradually.

## Sticky hooks

- Level map with per-level stars and a per-world total; a "New best!" moment on
  the results screen.
- **Postmark gallery**: 10 collectible stamps and 6 comet skins, unlocked by
  stars / levels / par / daily streak. Locked items show as silhouettes with
  their rule.
- **Daily Delivery**: a date-seeded level (same day, same panel), a gentle
  streak counter and best streak.
- **Missions**: three rotating daily goals (deliveries, stars, par) with a stamp
  reward.
- Fast restarts; personal bests on the title and results screens.

## Controls

Mouse/touch: drag to aim, release to launch. Keyboard: aim with the arrows or
`A`/`D`, hold `Space` to charge, release to launch; `R` restarts. Gamepad: left
stick aims, RT/trigger charges, A launches, B restarts, Start pauses. Escape /
Start pauses. Pause has *Back to arcade*. Pointer hides after ~2 s idle in play.
`?autopilot` replays the solver line for browser checks and never writes the
save.

## Files

`src/` `config` (constants), `math` (rng/helpers), `sim` (physics), `solver`
(BFS), `levels` (generation + build), `daily` (date-seeded level + streak),
`progress` (save, stars, stamps, skins, missions), `perf` (frame monitor),
`main` / `render` / `audio` (browser). `tests/` cover sim, levels (every level
solved within par), solver, daily, and progress.
