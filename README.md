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

## Conventions

- **No build step, no dependencies.** Games are plain HTML/CSS/JS, so every
  `index.html` works when opened straight from disk.
- **Self-contained games.** A game only references files inside its own folder,
  so games can be added, moved, or removed without affecting each other.
- **Namespaced storage.** All games share one origin when served together, so
  prefix `localStorage` keys with the game slug (for example `glowloop.v1`).
- **Testable rules.** Keep pure game logic in a DOM-free file that tests can
  `require`.

## Commands

```sh
npm test         # run every game's tests
npm run serve    # serve the repo at http://localhost:8000
```
