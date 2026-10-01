# Picto Paint — design spec

*2026-10-01 · slug `picto-paint` · genre: Nonogram*

## Pitch

A cozy picture-logic game. Every puzzle is a grid with number clues on its
rows and columns. Fill the right squares and a hidden pixel picture appears.
When you finish, the picture colours itself in and comes to life: the cat
blinks, the rocket launches, the fish swims. Then it goes into your album.

## Design decisions made without the user

- **Eight albums, 89 hand-drawn pictures.** Sizes run 5×5 → 8×8 → 10×10 →
  12×12 → 15×15 across five black-and-white albums (doodles, animals, food,
  vehicles, space), then three colour albums where clues are coloured
  (critters, café, cosmos). Each album unlocks after a few solves in total
  (thresholds 0, 4, 9, 15, 21, 27, 34, 41), so nobody gets stuck. Every
  puzzle inside an unlocked album is open.
- **One art grid per picture.** Each puzzle is a grid of palette letters
  (`.` is empty). Black-and-white puzzles use the silhouette (any letter is a
  filled square) and reveal the full-colour art when solved. Colour puzzles
  use the colours as clues. `e` marks a filled eye and `:` an empty eye hole;
  both blink after the reveal.
- **Line-logic only, proven in tests.** `src/solver.js` is a colour-aware
  line solver (each cell is a bitmask of "could be empty / colour k"; a DP
  over block placements keeps only values used by some valid placement).
  Running it to a fixpoint must fully determine every puzzle, which proves the
  solution is unique and reachable without guessing. The art was drawn by
  hand, then nudged a pixel or two where the solver got stuck.
- **Two modes.** *Helper* (default, kid mode): a wrong fill pops gently to an
  ✕ with a soft boop, and a wrong ✕ fades back to blank. *Expert*: no checking
  at all; the puzzle completes when the fills match.
- **Hints are one line-logic step.** The hint finds the easiest line that can
  make progress (zero clue → finished line → exact fit → overlap → out of
  reach → general sliding), applies just those squares, highlights the line
  and explains it in kid words. If the board has a mistake (Expert mode), the
  hint points at it first.
- **Stars.** ★ for solving, ★ for no hints, ★ for beating the par time (by
  size: 5×5 1:30, 8×8 4:00, 10×10 6:00, 12×12 9:00, 15×15 14:00; colour +25%).
  Mistakes never cost stars.
- **Input.** Drag paints along the row or column you started in (axis locks
  after the second cell) and only changes squares in the same state as the
  first one, like classic picross. Fill/✕ toggle; right-click or long-press
  (380 ms) uses the other tool. Pinch or Ctrl+wheel zooms 10×10 and larger
  boards; two-finger drag pans. Keyboard: arrows move, hold Space/Enter to
  paint, hold X to cross, Z/Y undo/redo, T toggles the tool, 1–5 picks a
  colour, H hints, Esc/P pauses, M mutes.
- **Auto-crossing.** When a line's fills match its clue, the rest of the line
  gets ✕ automatically and the clue dims. Clue blocks that are already
  closed off from either end dim one by one.
- **Daily Critter.** Each local date seeds a 10×10 mirror-symmetric pixel
  critter (body, eyes, a spot colour) that is regenerated until the line
  solver proves it unique. It gets a seeded name ("Wobbly Glimmerbug"). Solving
  it extends a gentle streak and adds it to a Daily Critters shelf in the
  gallery. Missing a day just restarts the streak; there is no penalty text.
- **Cosmetics.** Six paper palettes and six pencil styles (graphite, crayon,
  ink stamp, watercolour, pixel block, neon marker) unlock by total stars.
  Fill tiles are baked per style and colour into offscreen canvases.
- **Gallery.** Every finished picture shows as a living thumbnail; tap to see
  it animated large. Unsolved ones are blank cards with a "?" and size, so the
  gallery never spoils a puzzle.
- **Saves** under `picto-paint.v1`: per-puzzle stars, best time, in-progress
  boards (so leaving and returning resumes), settings, cosmetics, daily
  streak and critters.
- **Canvas rendering.** The board, clues and grid are baked to an offscreen
  layer when the layout or clue state changes; per frame we blit the layer,
  draw cell tiles from sprite caches, the cursor, hint glow and a capped
  particle pool. No shadowBlur in per-frame drawing.
- **Audio** is WebAudio only: a pencil scratch on fills with a pitch that
  rises along a drag, a woody tick for ✕, a chime per finished line, a soft
  boop for a Helper correction, a fanfare on reveal, and an optional music-box
  loop.

## Files

`src/solver.js` line solver, `src/puzzles.js` art and albums,
`src/puzzle.js` art → clues, `src/board.js` one puzzle in progress,
`src/hints.js` hint steps and explanations, `src/daily.js` daily critter,
`src/progress.js` stars, unlocks, cosmetics, `src/save.js`, `src/perf.js`,
`src/render.js`, `src/anim.js` living-picture animations, `src/audio.js`,
`src/input.js`, `src/main.js`.
