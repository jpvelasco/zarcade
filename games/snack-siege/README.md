# Snack Siege

A slingshot physics game. Fling jelly-bean heroes, each with its own power,
at wobbly candy forts and pop every grumpy gummy bear hiding inside.

36 levels across three worlds (Cookie Canyon, Soda Springs, Frosting
Peaks), plus a new daily fort every day.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/snack-siege/
```

| Action | Mouse | Touch | Keyboard |
| --- | --- | --- | --- |
| Aim and pull back | drag (start anywhere) | drag anywhere | ↑ ↓ angle, ← → power |
| Fling | let go | let go | Space / Enter |
| Use the bean's power | click while it flies | tap while it flies | Space |
| Restart the level | ↻ button | ↻ button | R |
| Pause | ❚❚ button | ❚❚ button | Esc / P |
| Mute | 🔊 button | 🔊 button | M |

A dotted arc shows where the bean will fly. In menus, the arrow keys move
between buttons and Enter picks one.

## Beans

| Bean | Power |
| --- | --- |
| Cherry Pip | None. A solid all-rounder |
| Blueberry Trio | Splits into three |
| Lime Bouncer | Super bouncy, and jumps in mid-air |
| Grape Boulder | Turns heavy and slams straight down |
| Honey Drop | Sticks to what it hits, then bursts (tap to burst early) |
| Mint Rocket | Rockets forward in a straight line |

## Forts

Cookie is the everyday building block. Sugar glass shatters easily,
chocolate is tough, and rock candy is the toughest of all. Fizz crates
explode and set each other off. Marshmallow is soft and bouncy, gumballs
roll, and frosting ice is slippery. Bears pop when they're hit hard
enough, when the fort falls on them, or when they tumble into a pit.

## Stars and rewards

You earn ★ for clearing a level, and ★★ and ★★★ for passing its two
score targets. The meter in the corner shows how close you are. Each
spare bean adds 10,000 points, so saving beans helps you get to ★★★.
Smashing things quickly builds a combo bonus.

- **Level map**: one path per world. A single star opens the next level.
  After three tries you can skip a level and come back to it later.
- **Slingshots**: ten skins, unlocked by earning stars, clearing worlds
  and beating daily forts. Your skin changes the slingshot, its band and
  the bean's flight trail.
- **Daily fort**: built from today's date, so it's the same fort all day.
  It keeps your best score for the day and a gentle streak counter.
- **Personal bests** for every level, with a "New best!" when you beat
  one.

Everything is saved under the `snack-siege.v1` local-storage key.

## Development

```sh
npm test                                       # from the repo root
node --test 'games/snack-siege/tests/*.test.js'
```

URL flags: `?level=N` (1–36) jumps straight to a level, `?daily` opens
today's fort, `?date=YYYY-MM-DD` picks a daily date, `?autopilot` lets
the solver play, and `?reduced` forces reduced motion. `window.SS`
exposes the live game.

| Path | What it is |
| --- | --- |
| `src/physics.js` | The 2D rigid-body engine: circles and boxes, block-solved two-point contacts, warm starting, friction, restitution, split-impulse correction, island sleeping |
| `src/game.js` | The DOM-free simulation: slingshot, bean powers, damage, explosions, combos, turns and stars |
| `src/levels.js` | The fort builder, all 36 levels, and the seeded daily fort |
| `src/config.js`, `src/rng.js` | Tuning, materials, beans, and seeded randomness |
| `src/ai.js` | The autoplayer. It simulates shots on clones and picks the best one |
| `src/progress.js` | Saves, skins, bests, skips, and the daily streak |
| `src/sprites.js`, `src/render.js` | Baked sprites and the canvas renderer (camera, parallax, particles) |
| `src/audio.js`, `src/input.js`, `src/main.js` | Synthesized sound, controls, and the screens and loop |
| `src/perf.js` | Frame-time telemetry (shared with Comet Crush) |

The tests check the physics (stacks, pyramids and fort floors stay up
and fall asleep; no tunnelling; restitution and friction; the engine is
deterministic and clones replay exactly). They also check that every
level is valid and stands still when woken, every bean power, saves and
skins, and that the autoplayer clears all 36 levels and nearly every
daily fort. See
[`docs/superpowers/specs/2026-10-01-snack-siege-design.md`](../../docs/superpowers/specs/2026-10-01-snack-siege-design.md).
