// One attempt at a Puzzle Trail puzzle: checks your moves against the
// solution, plays the replies, and counts slips and hints for stars.
// DOM-free.
import { Game } from './game.js';
import { puzzleStars } from './puzzles.js';
import { mFrom } from './chess.js';

export class PuzzleRun {
  constructor(puzzle) {
    this.puzzle = puzzle;
    this.game = new Game({ mode: 'puzzle', fen: puzzle.fen });
    this.color = this.game.turn;
    this.step = 0;
    this.mistakes = 0;
    this.hints = 0;
    this.hintLevel = 0;
    this.solved = false;
  }

  get final() { return this.step === this.puzzle.line.length - 1; }

  expected() {
    return this.game.pos.moveFromSan(this.puzzle.line[this.step], this.game.legal);
  }

  // Try one of your moves. Wrong moves are not played.
  try(m) {
    if (this.solved || this.game.turn !== this.color) return { ok: false };
    let ok = m === this.expected();
    if (!ok && this.final && this.puzzle.goal === 'mate') {
      const pos = this.game.pos;
      pos.make(m);
      ok = pos.inCheck() && pos.legalMoves().length === 0;
      pos.unmake();
    }
    if (!ok) { this.mistakes++; return { ok: false }; }
    const rec = this.game.play(m);
    this.step++;
    this.hintLevel = 0;
    if (this.step >= this.puzzle.line.length) { this.solved = true; return { ok: true, solved: true, rec }; }
    return { ok: true, solved: false, rec, needsReply: true };
  }

  // Play the opponent's scripted reply.
  playReply() {
    if (this.solved || this.game.turn === this.color) return null;
    const m = this.expected();
    const rec = this.game.play(m);
    this.step++;
    return rec;
  }

  // First hint: which piece moves. Second: the whole move.
  hint() {
    if (this.solved) return null;
    this.hintLevel = Math.min(2, this.hintLevel + 1);
    this.hints++;
    const m = this.expected();
    return { level: this.hintLevel, move: m, from: mFrom(m) };
  }

  stars() {
    return puzzleStars(this.mistakes, this.hints);
  }
}
