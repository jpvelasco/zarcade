# Gamer

A collection of small browser games. The plan is to add an arcade page at the
repo root where players pick a game, play it, and come back to pick another.

## Layout

```
games/
  <slug>/           one self-contained game per folder
    index.html      entry point, opens directly or from the arcade
    README.md       how to play
    tests/          node:test unit tests (*.test.js)
```

Current games:

| Game | Folder | Pitch |
| --- | --- | --- |
| Glowloop | [`games/glowloop`](games/glowloop) | Lasso fireflies, match colors, light up the night |
| Neon Nighthawk | [`games/neon-nighthawk`](games/neon-nighthawk) | Top-down hover-bike courier: drift through Vanta, evade patrols, and deliver after curfew |
| Sundown Rally | [`games/sundown-rally`](games/sundown-rally) | 3D jeep racer: outrun cartoon zombies across the desert at dusk |
| Starhopper | [`games/starhopper`](games/starhopper) | Cockpit space shooter: hop across an endless galaxy, with a Space Burger drive-thru |

## Conventions

- **No build step, no npm dependencies.** Games are plain HTML/CSS/JS. Simple
  games work opened straight from disk; games that use ES modules (like the 3D
  ones) need `npm run serve`.
- **Self-contained games.** A game only references files inside its own folder
  (libraries are vendored there, e.g. `games/sundown-rally/vendor/three`), so
  games can be added, moved, or removed without affecting each other.
- **Namespaced storage.** All games share one origin when served together, so
  prefix `localStorage` keys with the game slug (for example `glowloop.v1`).
- **Testable rules.** Keep pure game logic in DOM-free files that Node tests
  can import.
- **Hide the pointer while playing.** Games hide the mouse pointer after a
  moment without movement during play, and show it again on any movement.

## Commands

```sh
npm test         # run every game's tests
npm run serve    # serve the repo at http://localhost:8000 (no caching, so edits show on reload)
```
