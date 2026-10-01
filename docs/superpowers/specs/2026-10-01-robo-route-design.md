# Robo Route — design spec

*Slug* `robo-route` · *Genre* Coding puzzle · *Shelf* Puzzle & Word ·
*Accent* `#3fd0c9` · *Needs server* yes (ES modules)

## Pitch

Program Bolt, a small cheerful robot, by snapping command tiles into a program
strip, then press Run and watch him carry it out one tile at a time with the
current tile lit up. The game teaches real programming ideas without words:
sequences, loops, procedures, conditionals, and finally all of them together.

## Rules (DOM-free, `src/rules.js`)

- A board is a grid (up to 8 × 8) of cells. A cell is either empty (void) or a
  block of height 0–4, optionally coloured **red** (dot pattern) or **blue**
  (diamond pattern), optionally holding a **lamp** or a **battery**.
- Bolt starts on a cell facing N, E, S or W.
- Commands (one tile each):
  - **Forward**: step to the cell ahead; it must be the same height.
  - **Turn left / Turn right**: quarter turn in place.
  - **Jump**: hop onto the cell ahead when it is one higher or any amount
    lower. A jump to a same-height cell hops in place (harmless).
  - **Light**: light the lamp under Bolt (already lit stays lit; no lamp is a
    harmless fizzle).
  - **Grab**: pick up the battery under Bolt (nothing there is a shrug).
  - **Repeat ×n** (n = 2–9): a block holding tiles, run n times.
  - **P1**: call the procedure strip. P1 may call itself.
  - Any tile may be painted red or blue. A painted tile only runs when Bolt
    stands on a floor of that colour; otherwise it is skipped (shown greyed).
- A level is solved the moment every lamp is lit and every battery collected;
  the program stops right there (so a recursive P1 can loop "forever").
- Mistakes are friendly and end the run: **bonk** (walking into a wall, off an
  edge, or jumping too high), **tired** (500 steps or a 64-deep call stack) or
  **shrug** (the program ran out with work left). Bolt sparks or shrugs, the
  bad tile gets a little bug marker, and the board resets in about a second.
- **Tile count** is the number of tiles in all strips; a Repeat block is one
  tile plus its contents. Each level has strip limits (main, P1) and a **par**.
  Stars: 3 at or under par, 2 within par + 2, otherwise 1.

## Interpreter

`createRun(level, program)` returns a stepper. Each `step()` executes one
action tile (control tiles are entered silently) and returns an event:
`{ uid, path, kind, ok, state }` where kind is move / turn / jump / hop /
light / grab / fizzle / shrug-grab / skip / bonk / win / end / tired. The
browser animates events; tests run `runProgram` to completion. Programs are
trees `{ op, c?, n?, body? }` with stable `uid`s for highlighting, and a tiny
text form (`'3(F *) R'`, `'F r:L 1'`) for level data and tests.

**Edit while paused**: after an edit the new program is replayed silently to
the same step. If the trace up to that point is unchanged Bolt stays put and
Step continues seamlessly; otherwise Bolt rewinds to the start.

## Content (`src/levels.js`), 48 levels in five worlds

1. **Tinker Yard** (10) — sequences: Forward, turns, Light, then Jump and Grab.
2. **Loop Lagoon** (10) — Repeat blocks, nested repeats at the end.
3. **Gear Works** (10) — the P1 procedure, then recursion.
4. **Rainbow Relay** (9) — colour conditionals with recursion.
5. **Star Circuit** (9) — everything combined.

Each level stores a reference solution. Tests check that every reference
solves its level within its limits and is at or under par. For World 1 a
breadth-first search over world states finds the exact minimum, which must
equal par. For the early Loop Lagoon levels a brute-force program enumerator
proves nothing shorter than par exists. Worlds unlock gently: a level opens
when either of the two before it is solved (one skip allowed), a world opens
once 6 levels of the previous one are solved. A Hint button reveals the
reference solution one tile at a time; hinted wins still earn stars.

## Sticky hooks (saved under `robo-route.v1`)

- **World map** with stars per level and per world.
- **Garage**: 8 paint jobs and 8 antenna toppers unlocked by total stars,
  finished worlds, the daily circuit and the editor; shown on Bolt in play.
- **Daily circuit** from the local date seed: generated program-first (a
  random looped/procedure program walks a virtual board, lamps go where it
  lights), then a bounded brute-force search tightens the par. Gentle streak.
- **Bug Zapper jar**: 18 achievement bugs (silhouettes until caught), such as
  Bonk Beetle (first bonk), Loop Ladybug (win with a Repeat), Recursion
  Roly-poly (win with a P1 that calls itself).
- **Level editor**: paint a board, choose tiles and limits, solve it yourself
  to set the par, then share a compact code (`RR1.…`) others can paste in.
  Custom levels are kept in a list.
- Personal bests (stars and tile counts) on the map and result card.

## Screens and controls

Title (attract mode: Bolt runs a reference program on a demo board), world
map, play, result, pause, garage, bug jar, editor, help. The program panel is
DOM (accessible buttons); the board is a Canvas isometric renderer with baked
block sprites, a baked lamp glow and capped particles.

- **Mouse/touch**: drag a palette tile into a strip at any position, or tap it
  to add at the caret. Tap a strip tile to remove it (caret moves there), drag
  a strip tile to move it or drag it off to delete. Tap a Repeat badge to
  change its count. With a colour brush selected, taps paint tiles instead.
- **Keyboard**: 1–8 (or F L R J E G) add tiles; ← → move the caret, ↑ ↓ switch
  strips; Backspace / Delete remove; C cycles the colour, + / − the repeat
  count; Space or Enter runs/pauses; S or . steps; X resets; H hint; Esc/P
  pauses. Everything is also reachable by Tab.

## Design calls

- Bonks end the run (rather than being ignored) so a bug is always visible.
- Lamps don't toggle off: kinder to kids, and it keeps loops forgiving.
- Colour uses both hue and a shape pattern so it reads without colour vision.
- One skip, hints and generous unlocks so nobody gets stuck behind a grind.
