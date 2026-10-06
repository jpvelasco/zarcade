# Comet Courier

A sky-golf billiards puzzle for the Starlight Arcade. Slide a little comet
across the cosmic post office and sink it into the glowing **mailbox star** in
as few launches as possible. Fewer launches earns more stars — and more
postmarks.

## How to play

- **Aim:** drag with the mouse or finger (slingshot: pull back, release to
  launch), or steer with ← → / A D and hold Space to charge. Gamepad: left
  stick aims, right trigger charges, A launches.
- **R** restarts the delivery, **Esc** pauses (the pause menu has *Back to
  arcade*).
- The comet keeps sliding until it settles, then you launch again from wherever
  it stopped. No timers, no fail state — just a lighter hand.

## Post office

Five worlds × 6 routes (30 levels), from open lanes up to wind alleys, spring
steps and portal passes. Every layout is generated deterministically and
verified by the built-in fewest-launch solver, so every route is provably
solvable and the solver's par is your 3-star target.

Sticky hooks:

- Per-route stars (3★ at par, 2★ within par + 2, 1★ for any delivery) and a
  level map.
- **Postmark gallery**: world-clear and par stamps, plus six comet skins.
- **Daily Delivery**: a date-seeded route with a streak counter.
- **Missions**: three rotating daily goals on the Routes screen.

## Controls

| Input | Aim | Charge | Launch | Restart | Pause |
| --- | --- | --- | --- | --- | --- |
| Mouse | drag | drag length | release | R | Esc |
| Touch | drag | drag length | release | — | ❚❚ / Esc |
| Keyboard | ← → / A D | hold Space | release Space | R | Esc / P |
| Gamepad | left stick | right trigger | A | B | Start |

## Run it

From the repo root:

```sh
npm run serve
# then open http://localhost:8000/games/comet-courier/
```

`?autopilot` on the URL replays the solver's verified line for browser route
checks (it never writes the save).

## Architecture

- `src/sim.js` — the exact DOM-free simulation (fixed 1/120 s steps). Node
  tests and the browser drive the same code.
- `src/solver.js` — breadth-first search over settled positions (16 angles × 4
  powers per shot). The result is the level's par and a verified line, which
  also drives the attract-mode ghost.
- `src/levels.js` — seeded generation (mulberry32) with rejection sampling
  until the solver solves inside the par window.
- `src/daily.js` — the date-seeded daily route and streak logic.
- `src/progress.js` — save (localStorage `comet-courier.v1`), stars, stamps,
  skins, missions. Every field is sanitized so a damaged save cannot stop the
  game from loading.
- `src/render.js` / `src/audio.js` — Canvas drawing and Web Audio synthesis;
  the renderer reads simulation state and never mutates it.
- `tests/` — `node:test` coverage of the pure modules.

## Tests

```sh
node --test 'games/comet-courier/tests/*.test.js'
```
