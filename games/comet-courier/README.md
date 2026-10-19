# Comet Courier

A sky-golf billiards puzzle for the Starlight Arcade. Sweep up every **mail
letter** scattered along the route, then sink your comet into the glowing
**mailbox star** — in as few launches as you can.

## How to play

- **Aim:** drag back from the comet like a slingshot and release, or steer with
  ← → / A D and hold Space to charge. Gamepad: left stick aims, right trigger
  charges, A launches.
- **The dotted line is where your shot actually goes.** It is the real
  simulation run forward from the comet, so you can plan a bank shot instead of
  guessing. It stops after a couple of bounces on purpose, and later worlds show
  less of it. Green rings mark the letters that shot would sweep up.
- **Collect the mail first.** The mailbox star stays dim and says how many
  letters are still loose. Sinking it early still counts as a delivery — it just
  costs you a star, and the aim guide warns you ("mail left behind") before you
  commit.
- **R** restarts the delivery, **Esc** pauses (the pause menu has *Back to
  arcade*).
- The comet keeps sliding until it settles, then you launch again from wherever
  it stopped. No timers, no fail state — retry is always one tap.

## Stars

| Star | How |
| --- | --- |
| ★ | Deliver at all |
| ★ | Deliver inside par |
| ★ | Bring every letter |

**Par** is the fewest launches that collect the whole satchel *and* sink the
star — the breadth-first solver's answer, verified by the tests. So a lucky long
shot straight to the star is a two-star round, never a perfect one.

## Post office

Five worlds × 6 routes (30 levels), each one hand-authored as a deliberate
route: aim and power, then banks, round rocks, wind bands, spring pads and
finally gravity wells and portals. Pars run 2 to 4 (world 1 is the teaching
ramp). Every route's geometry, par and solution line live in `src/levels.js`,
and the tests prove each one is solvable in par and cannot be finished in fewer.

Sticky hooks:

- Per-route stars, letter counts and a route map with each level's design note.
- **Postmark gallery**: a perfect-round stamp per route, world-cleared and
  world-fully-posted stamps, and six comet skins.
- **Daily Delivery**: one authored route, mirrored, picked by the local date —
  same day, same panel — with a streak counter.
- **Missions**: three rotating daily goals on the Routes screen.

## Controls

| Input | Aim | Charge | Launch | Restart | Pause |
| --- | --- | --- | --- | --- | --- |
| Mouse | drag back | drag length | release | R | Esc |
| Touch | drag back | drag length | release | — | ❚❚ / Esc |
| Keyboard | ← → / A D | hold Space | release Space | R | Esc |
| Gamepad | left stick | right trigger | A | B | Start |

In menus the keyboard arrows and the gamepad d-pad move between buttons, A
presses one and B goes back.

## Run it

From the repo root:

```sh
npm run serve
# then open http://localhost:8000/games/comet-courier/
```

- `?level=N` opens route N directly (1–30).
- `?autopilot` plays the routes by itself from the verified lines in the level
  data, walking on to the next one each time. It never writes the save.

## Architecture

- `src/sim.js` — the exact DOM-free simulation (fixed 1/120 s steps). Node tests
  and the browser drive the same code. It also provides `previewPath`, the aim
  projection, so the guide the player sees and the shot they get are the same
  calculation.
- `src/solver.js` — breadth-first search over (resting spot, letters collected),
  16 angles × 4 powers per launch. A delivery only counts with a full satchel, so
  the result is the route's par plus a verified line.
- `src/levels.js` — the thirty authored routes in a compact declarative form,
  plus the exact mirror transform the Daily uses.
- `src/daily.js` — the date-seeded daily route and streak logic.
- `src/progress.js` — save (localStorage `comet-courier.v1`), stars, letters,
  stamps, skins, missions. Every field is sanitized so a damaged save cannot stop
  the game from loading, and a second tab's save is adopted rather than
  overwritten.
- `src/render.js` / `src/audio.js` — Canvas drawing and Web Audio synthesis; the
  renderer reads simulation state and never mutates it.
- `tests/` — `node:test` coverage of the pure modules, including "every shipped
  route delivers in par" and "no route can be finished in fewer launches".

## Tests

```sh
node --test 'games/comet-courier/tests/*.test.js'
```
