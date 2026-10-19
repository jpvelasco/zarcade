// Tiny board builder for tests: rows of characters, like the ASCII dumps.
//   R Y G B W P  color bubbles 0..5     r y g b w p  ice of that color
//   @ rainbow  # stone  * bomb  z zap  O otter  A anchor  . empty
import { Board, index, cols } from '../src/grid.js';

const COLORS = 'RYGBWP';
const ICE = 'rygbwp';

export function boardFrom(lines, drop = 0) {
  const board = new Board(undefined, drop);
  lines.forEach((line, r) => {
    const chars = line.replace(/\s+/g, '');
    for (let c = 0; c < Math.min(chars.length, cols(r)); c++) {
      const ch = chars[c];
      let cell = null;
      if (COLORS.includes(ch)) cell = { k: 'b', c: COLORS.indexOf(ch) };
      else if (ICE.includes(ch)) cell = { k: 'ice', c: ICE.indexOf(ch), hp: 2 };
      else if (ch === '@') cell = { k: 'rainbow' };
      else if (ch === '#') cell = { k: 'stone' };
      else if (ch === '*') cell = { k: 'bomb' };
      else if (ch === 'z') cell = { k: 'zap' };
      else if (ch === 'O') cell = { k: 'otter', o: r * 10 + c };
      else if (ch === 'A') cell = { k: 'anchor' };
      board.cells[index(r, c)] = cell;
    }
  });
  return board;
}

// A shot trace that lands straight on a cell (skipping the flight).
export const landOn = (i) => ({ land: i, touched: [], path: [] });

export function levelFrom(lines, extra = {}) {
  const board = boardFrom(lines);
  return {
    id: 99, area: 0, within: 0, name: 'Test', seed: 7, colors: 3, rows: lines.length,
    goal: { type: 'pop', need: 999 }, supply: 30, creep: 8, stars: [0, 3, 6],
    cells: board.cells, otters: [], anchor: -1, ...extra,
  };
}
