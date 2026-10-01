# Knight Shift: design

Chess for all ages, with twists. The goal is a fully correct chess game that
a young player can enjoy against a gentle bot, and a stronger player can
still find hard against Grandmaster Owl, plus modes that make chess feel new.

## Engine

`src/chess.js` is a DOM-free rules engine on a 0x88 mailbox. Moves are
packed integers (from, to, promotion, flag). Generation is pseudo-legal,
and each move is checked by making it and testing the king. Make/unmake
keep an undo stack and two 32-bit Zobrist keys, updated incrementally
(tests compare them with a full recompute after every move).

- **Castling** is stored as "king takes own rook", with the rook squares as
  the castling rights. That one code path covers normal chess and Chess960:
  every square between the king, rook and their destinations must be empty
  (apart from those two pieces), and the king's path, start and end must not
  be attacked. FEN accepts KQkq, X-FEN and Shredder-FEN letters.
- **Draws**: stalemate, threefold repetition (hash history since the last
  irreversible move), fifty moves, and insufficient material (K vs K, a
  single minor piece, or bishops all on one color). Checkmate on the
  hundredth half-move still wins.
- **Notation**: SAN with file/rank disambiguation, captures, promotion,
  check and mate suffixes, and parsing (`moveFromSan`). Saves and the worker
  use long algebraic (`e2e4`, castling as king-to-rook).
- **Verification**: perft for the start position (depth 4), Kiwipete
  (depth 4), CPW positions 3–6, and two Chess960 positions (depth 4).

## Powers

Power Squares state lives in the position (power squares, per-side
inventory, the shielded square) so search, hashing, repetition and undo
cover it. Six squares, three mirrored pairs on ranks 3–4 and 5–6, are
placed from a seed. Shield and Swap use the turn; Leap is a knight-jump
move for any piece except king or knight. A shield lasts exactly one ply
and blocks normal and en passant captures of that piece. Rules are
deterministic and tested.

## AI

Negamax alpha-beta with iterative deepening, aspiration windows, a 2^18
entry transposition table, quiescence search on captures and queen
promotions, null-move pruning, late-move reductions, mate-distance pruning,
MVV-LVA, killer and history ordering, and a check extension. Evaluation:
material plus piece-square tables, a tapered king table, bishop pair,
mop-up for won endgames, and small values for held powers.

The three easy bots score every root move at a fixed depth and pick with
seeded noise (Pip also plays a non-best move 30% of the time). Fox and Owl
use the timed search. Everything runs in a module Web Worker
(`ai-worker.js`, through `think.js`). The page logs `ai.think` with think
time, depth and nodes, and enforces a minimum "thinking" time so replies
don't feel instant. If the worker fails, a weak main-thread fallback keeps
the game playable and logs the failure.

## Teaching

Legal-move dots, a hint arrow from a 0.7 s search, check glow, captured
trays with the material lead, undo, and a move list. At the easy levels the
worker also analyses the player's last move (best move before it, best
reply after it). `explain.js` turns a loss of 1.8+ pawns into a short note:
allowing mate, hanging a piece (naming the attacker and square), missing a
mate or a free piece, or a generic "gives away about N points".

## Puzzle Trail

35 hand-picked positions: 14 mates in one (back rank, smothered, Arabian,
Anastasia, Fool's and Scholar's mates, epaulette...), 8 tactics (forks,
skewer, discovered check, pin, free pieces), 10 mates in two (Philidor,
Morphy's Opera game, Légal...) and 3 mates in three. An exhaustive solver
(`solver.js`) proves in the tests that each mate works, that no shorter
mate exists, and that each of your moves before the last is the only one
that keeps the forced mate. Any checkmate counts on the final move. The
engine confirms each tactic's key move by a 1.5-pawn margin and that the
line wins at least 3 points.

## Presentation

A canvas board with three themes (wood, candy, space). Piece sprites are
drawn once per size from SVG path data (`pieces.js`) with gradients,
shading and, for space, a baked glow. The board texture, power-square
glows, shield bubble, check glow and fog texture are baked offscreen. The
fog mask is rebuilt (blurred at half resolution) only when the position
changes. Frames are a few dozen `drawImage` calls, and the board redraws
only while something moves or pulses. Pieces slide with an ease-out,
knights and leaps hop, captures pop with capped particles, and checkmate
throws full-screen confetti. Reduced motion shortens slides and cuts
particles. Sound is synthesized: wooden tocks, a capture clack, a check
bell, sparkles for powers and promotion, fanfares.

## Screens

Title (over a live bot-vs-bot attract game), New game (mode, opponent,
color), Puzzle Trail map, play, pause (theme, sound, move dots, coach,
flip board, back to arcade), result (win/loss/draw with the bot's line, or
stars for puzzles), and the pass-and-play curtain for Fog of War.

## Saves and telemetry

`knight-shift.v1` holds settings, the in-progress game (setup and move
list), puzzle stars and per-bot records; loading validates every field.
Telemetry events: `game.ready`, `game.resume`, `level.start`,
`level.complete` / `level.fail` (mode, opponent, result, reason, moves,
time; stars, slips and hints for puzzles), `ai.think`, `hint.used`,
`undo.used`, `power.used`, `coach.tip`, `puzzle.mistake`, plus the shared
frame monitor (`frame.long`, `perf.degraded`, `frame.stall`).
