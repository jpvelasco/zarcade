// The title-screen diorama and the sandbox board. DOM-free.

import { parseLevel, makeBoard } from './board.js';

// Two trains chasing round an oval forever (each joins by a trailing switch).
export const TITLE_MAP = {
  map: [
    't . f . h . f . p',
    'f . . . . . . . t',
    'r> . t f . h k . .',
    '. . f . w w . . b<',
    'k . . . . . . . f',
    'p t . h . f . t t',
  ],
  stock: { W: 2 },
};

export function titleScene() {
  const board = parseLevel(TITLE_MAP);
  const L = new Map();
  const put = (x, y, t, v) => L.set(y * board.w + x, { t, v });
  // Oval: corners (1,1) (7,1) (7,4) (1,4).
  put(1, 1, 'C', 1); put(7, 1, 'C', 2); put(7, 4, 'C', 3); put(1, 4, 'C', 0);
  for (let x = 2; x <= 6; x++) { put(x, 1, 'S', 1); put(x, 4, 'S', 1); }
  // Left side: switch at (1,2) with the stem north; the depot joins from the west.
  put(1, 2, 'W', 4); put(1, 3, 'S', 0);
  // Right side: switch at (7,3) with the stem south; the depot joins from the east.
  put(7, 2, 'S', 0); put(7, 3, 'W', 6);
  return { board, layout: L };
}

export const SANDBOX_W = 9;
export const SANDBOX_H = 7;

export function emptySandbox() {
  const cells = [];
  for (let y = 0; y < SANDBOX_H; y++) {
    for (let x = 0; x < SANDBOX_W; x++) {
      const corner = (x === 0 || x === SANDBOX_W - 1) && (y === 0 || y === SANDBOX_H - 1);
      cells.push(corner ? { k: 'block', deco: 'tree' } : { k: 'grass' });
    }
  }
  return { cells, layout: [] };
}

// Build a playable board from saved sandbox cells: every depot sends one train.
export function sandboxBoard(saved) {
  const data = saved && Array.isArray(saved.cells) && saved.cells.length === SANDBOX_W * SANDBOX_H ? saved : emptySandbox();
  const cells = data.cells.map((c, i) => ({ ...c, x: i % SANDBOX_W, y: Math.floor(i / SANDBOX_W) }));
  const board = makeBoard({ w: SANDBOX_W, h: SANDBOX_H, cells, trains: [], stock: { X: 99, W: 99 }, id: 'sandbox', name: 'Sandbox' });
  refreshTrains(board);
  const layout = new Map((data.layout || []).filter(([i]) => cells[i] && cells[i].k === 'grass'));
  return { board, layout };
}

export function refreshTrains(board) {
  board.trains = [];
  board.cells.forEach((c, i) => {
    if (c.k === 'depot') {
      c.colors = [c.color];
      board.trains.push({ id: board.trains.length, color: c.color, depot: i, dir: c.dir, depart: 0 });
    }
  });
  return board;
}

export function packSandbox(board, layout) {
  return {
    cells: board.cells.map(({ x, y, colors, ...rest }) => { void x; void y; void colors; return rest; }),
    layout: [...layout],
  };
}
