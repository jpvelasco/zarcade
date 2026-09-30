// Shared board builder for the tests.
import { Board, jelly, coral, egg } from '../src/board.js';
import { Rng } from '../src/rng.js';
import { Game } from '../src/game.js';

// A board with no legal move: the colors run in diagonal stripes.
export const DEAD = ['123123', '231231', '312312', '123123', '231231', '312312'];

// Rows of digits are jelly colors; '.' is a hole, ' ' an empty tile,
// 'x' a coral blocker and 'o' a turtle egg.
export function make(rows, { colors = 6 } = {}) {
  const w = rows[0].length, h = rows.length;
  const mask = new Array(w * h).fill(true);
  rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '.') mask[r * w + c] = false; }));
  const b = new Board({ w, h, mask, colors, rng: new Rng(7) });
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    const i = r * w + c;
    if (ch === '.' || ch === ' ') return;
    if (ch === 'x') b.cells[i] = coral(1);
    else if (ch === 'o') b.cells[i] = egg();
    else b.cells[i] = jelly(Number(ch));
  }));
  return b;
}

// A Game running on a hand-made board, so tests can script exact swaps.
// Goal targets are read back from the board that was crafted.
export function gameOf(rows, goals = [], { moves = 10, colors = 6, ground = null, stars = [1e9, 1e9, 1e9], mutate = null } = {}) {
  const board = make(rows, { colors });
  if (ground) {
    ground.forEach((row, r) => [...row].forEach((ch, c) => {
      board.ground[r * board.w + c] = Number(ch) || 0;
    }));
  }
  if (mutate) mutate(board);
  const level = { id: 1, name: 'Test', area: 0, moves, colors, layout: rows, stars, goals: [] };
  const game = new Game(level);
  game.board = board;
  game.moves = moves;
  const left = game.remaining;
  // With no goal of its own a test board just plays on forever.
  const list = goals.length ? goals : [{ type: 'score', amount: Infinity }];
  level.goals = list.map((goal) => ({
    ...goal,
    need: goal.need ?? (goal.type === 'score' ? goal.amount : goal.type === 'collect' ? goal.count : left[goal.type]),
  }));
  return game;
}
