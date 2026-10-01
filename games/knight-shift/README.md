# Knight Shift

Chess with twists, for all ages. Play five friendly bots, from Pip the Pawn
(who makes silly moves on purpose) to Grandmaster Owl, or a friend on the
same device. Pick a twist, or climb the Puzzle Trail.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/knight-shift/
```

| Action | Mouse / touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Pick a piece, then a square | tap or click, or drag and drop | arrows move the cursor, Enter / Space picks | d-pad, A |
| Cancel a selection | tap the piece again | Esc | B |
| Hint | Hint button | H | X |
| Undo (vs bots: back to your move) | Undo button | U / Backspace | Y |
| Use a power (Power Squares) | power buttons under the board | 1 Shield, 2 Swap, 3 Leap | |
| Pause | Menu button | Esc / P | Start |
| Sound on / off | pause menu | M | |

In menus, arrow keys or the d-pad move between buttons, and Enter or A picks.

## Modes

- **Classic**: normal chess. All the rules are there: castling, en passant,
  promotion (you choose the piece), check, checkmate, stalemate, threefold
  repetition, the fifty-move rule and insufficient material.
- **Fog of War**: you see only your own squares and the squares your pieces
  can reach (pawns see one or two squares ahead and both diagonals). The
  rules are normal chess, and the bots see the whole board. With a friend,
  a "Pass to Black" curtain hides the board between turns.
- **Power Squares**: six glowing squares (three mirrored pairs). Move a
  piece onto one to collect its one-time power:
  - **Shield** (uses your turn): one of your pieces can't be captured on the
    opponent's next move. Kings can't be shielded, and it can't get you out
    of check.
  - **Swap** (uses your turn): two of your pieces (not the king, not two of
    the same kind) trade places. Pawns can't land on the first or last rank.
  - **Leap**: as your move, one piece (not the king or a knight) jumps like a
    knight. A pawn that leaps to the last rank promotes.
  The bots collect and use powers too. Placement comes from a seed stored
  with the game, so saved games replay exactly.
- **Chess960**: one of the 960 Fischer random back ranks. Castling works as
  in Chess960: the king ends on c or g and the rook on d or f. Tap the
  king's landing square, or the rook when the king already stands there.
- **Puzzle Trail**: 35 hand-picked puzzles in four chapters: Checkmate
  Meadow (mate in 1), Tactic Town (forks, pins, skewers), Two-Step Woods
  (mate in 2) and Owl's Summit (mate in 3). Three stars for a clean solve,
  two for one slip or hint, one otherwise. The next puzzle opens when you
  solve one. Hints show the piece first, then the move.
- **Pass and play**: pick "Friend" as the opponent in any mode except the
  Puzzle Trail.

## Bots

| Bot | How it plays |
| --- | --- |
| Pip the Pawn | Looks one move ahead with lots of noise, and plays a random non-best move 30% of the time |
| Bella Bunny | Two moves ahead, some noise, rare blunders |
| Captain Rook | Three moves ahead, a little noise |
| Professor Fox | Full search, 0.7 s per move |
| Grandmaster Owl | Full search, 1.6 s per move |

Against Pip, Bella and the Captain, **Coach Owl** explains blunders ("Now
their bishop can take your queen on g4") and offers to take the move back.
It can be turned off in the pause menu.

The AI is an alpha-beta search with iterative deepening, a transposition
table, quiescence search, null-move pruning, late-move reductions,
MVV-LVA / killer / history move ordering and a piece-square evaluation. It
runs in a Web Worker, so the board stays smooth while bots think.

## Teaching touches

Tap a piece to see its moves (dots for moves, rings for captures; "Show
moves" can be turned off), hints draw an arrow for the engine's best move,
the king glows red in check, captured pieces sit in a tray beside each
player with the material lead, and the move list shows every move in
standard notation.

## Saves

Saved under the `knight-shift.v1` local-storage key: the game in progress
(setup and move list, replayed on Continue), puzzle stars, wins, losses and
draws against each bot, and settings (board theme: wood, candy or space;
sound; move dots; coach).

## Development

```sh
npm test                                         # from the repo root
node --test 'games/knight-shift/tests/*.test.js'
```

URL flags: `?puzzle=N` (1–35) opens a puzzle; `?mode=classic|fog|powers|960`
with `&bot=0..4|friend` and `&color=w|b` starts a game. `window.KS` exposes
the live match.

| Path | What it is |
| --- | --- |
| `src/chess.js` | Rules engine: 0x88 board, move generation, Chess960 castling, powers, FEN, SAN, draws, perft |
| `src/chess960.js`, `src/powers.js` | Chess960 back ranks by number, power-square placement |
| `src/ai.js` | Evaluation, search, bot levels |
| `src/think.js`, `src/ai-worker.js`, `src/brain.js` | Worker requests (bot moves, hints, coach analysis) and the main-thread client |
| `src/game.js` | Game session: history, SAN, captures, fog visibility, saves |
| `src/puzzles.js`, `src/puzzle-run.js`, `src/solver.js` | Puzzle data, puzzle attempts, exhaustive mate solver |
| `src/explain.js`, `src/bots.js` | Coach notes, bot personalities and avatars |
| `src/progress.js` | Save data |
| `src/pieces.js`, `src/render.js` | Vector piece art and themes, baked canvas renderer, confetti |
| `src/audio.js`, `src/main.js`, `src/perf.js` | Synthesized sound, screens and input, frame telemetry |

The tests check perft counts (start position and Kiwipete to depth 4, and
other standard and Chess960 positions), every rule above, the powers, the
search (mates, time budget, determinism, K+Q vs K), every puzzle (the
solver proves each mate and that the key move is the only one, and the
engine confirms each tactic), coach notes, sessions, fog and saves. See
[`docs/superpowers/specs/2026-10-01-knight-shift-design.md`](../../docs/superpowers/specs/2026-10-01-knight-shift-design.md).
