# Comet Crush

A neon breakout adventure. Bounce a comet off your paddle-ship to smash
crystal bricks and save the constellations.

Six constellations of five brick levels each (a rocket, a space whale, a
crystal crown, a cat, a big heart, a dragon, and more), and each ends with a boss:
the Bubble Saucer, the Big Space Octopus, the Crystal Crab, the Star Serpent,
the Gumball Mech, and the Kraken Queen. That makes 36 levels.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/comet-crush/
```

| Action | Mouse | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- | --- |
| Move the ship | move the mouse | drag anywhere | ← → / A D | left stick / d-pad |
| Launch / fire lasers | click | tap | Space | A |
| Pause | ❚❚ button | ❚❚ button | Esc / P | Start |
| Mute | 🔊 button | 🔊 button | M | |

In menus, arrow keys or the d-pad move between buttons, and Enter, Space, or
A picks one.

Where the comet hits the ship sets its angle: near the edges sends it off
steeply, and the middle sends it straight up.

## Bricks

- **Crystal**: one hit.
- **Tough**: two or three hits. It cracks as it weakens.
- **Metal**: can't be broken. Bounce around it.
- **Explosive**: blows up its eight neighbours, and chains into other
  explosives.
- **Moving**: slides from side to side.
- **Star**: drops a falling star worth 1,000 points.
- **Portals**: a comet that flies into one comes out of the other.

## Power-ups

Capsules sometimes fall from smashed bricks. Catch them with the ship.

| Capsule | Effect |
| --- | --- |
| ×3 | Multi-comet: every comet splits into three |
| WIDE | Wider ship |
| LASER | Twin laser cannons. They fire on their own, and faster while you hold fire |
| CATCH | Comets stick to the ship until you launch them |
| SLOW | Slow-mo comets |
| FIRE | Fireball: plows straight through any breakable brick |
| SHIELD | A barrier that saves two falling comets |
| 1UP | Extra ship |
| DISCO | Disco party: rainbow bricks and double points |
| DUCK | Your comet becomes a squeaky rubber duck (squeaks score points) |
| BIG | Big comet |
| MAGNET | Pulls falling capsules toward the ship |

Breaking bricks in quick succession builds a **combo**. Every five in a row
raises the score multiplier (up to ×5), and the smash sound climbs higher.

## Progress

You have three ships. Running out is never the end: **Continue** restarts
the same level with fresh ships. Each level earns ★ for clearing it, ★★ for
losing at most one ship, and ★★★ for losing none. Beating a boss unlocks the
next constellation. The Constellations screen lets you replay any level
you've reached. Progress, stars, the high score, and sound settings are saved
under the `comet-crush.v1` local-storage key.

## Development

```sh
npm test             # from the repo root
node --test games/comet-crush/tests/
```

URL flags: `?level=N` (1–36) jumps straight to a level, and `?autopilot`
lets the AI play. `window.CC` exposes the live world.

| Path | What it is |
| --- | --- |
| `src/config.js`, `src/math.js` | Playfield constants and seeded helpers |
| `src/levels.js` | Constellations, level layouts, and legend |
| `src/physics.js` | Circle-vs-box collisions, reflections, and paddle angles |
| `src/world.js` | The DOM-free simulation: sub-stepped comets, bricks, power-ups, combos, lives |
| `src/powerups.js`, `src/boss.js` | Power-up table, boss paths, parts, and attacks |
| `src/ai.js` | Autopilot for tests, the title-screen demo, and `?autopilot` |
| `src/progress.js` | Save data |
| `src/render.js`, `src/audio.js`, `src/input.js`, `src/main.js` | Canvas renderer, synthesized sound, controls, and screens |

The tests check collisions (including no tunnelling at any speed), each
power-up, that level data fits the grid, boss behaviour, and saves. They also
have the autopilot clear every one of the 36 levels. See
[`docs/superpowers/specs/2026-09-30-comet-crush-design.md`](../../docs/superpowers/specs/2026-09-30-comet-crush-design.md).
