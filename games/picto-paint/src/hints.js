// Hints: find one line-logic step from what the player has marked, and say
// why it works in friendly words. DOM-free.
import { solveLine, solve, EMPTY, colourBit, fullMask, maskValue } from './solver.js';
import { UNKNOWN, CROSS } from './board.js';

const ORDER = { zero: 0, done: 1, exact: 2, overlap: 3, reach: 4, slide: 5, deep: 6 };

export function lineName(axis, index) {
  return `${axis === 'row' ? 'Row' : 'Column'} ${index + 1}`;
}

export function clueText(clue) {
  return clue.length ? clue.map((b) => b.n).join(' ') : '0';
}

// What the player knows, as solver masks.
export function knowledge(board) {
  const full = fullMask(board.p.colours);
  return Array.from(board.cells, (v) => (v === UNKNOWN ? full : v === CROSS ? EMPTY : colourBit(v)));
}

function minLength(clue) {
  let n = 0;
  for (let i = 0; i < clue.length; i++) {
    n += clue[i].n;
    if (i > 0 && clue[i - 1].c === clue[i].c) n++;
  }
  return n;
}

function classify(clue, before, changes, L) {
  if (!clue.length) return 'zero';
  const known = before.filter((m) => m && !(m & (m - 1)));
  const allEmpty = changes.every((c) => c.value < 0);
  const filled = before.filter((m) => m !== EMPTY && m && !(m & (m - 1))).length;
  const total = clue.reduce((a, b) => a + b.n, 0);
  if (allEmpty && filled === total) return 'done';
  if (minLength(clue) === L) return 'exact';
  if (known.length === 0 && !allEmpty) return 'overlap';
  if (allEmpty) return 'reach';
  return 'slide';
}

export function explain(kind, axis, index, clue, L, colour) {
  const name = lineName(axis, index);
  const c = clueText(clue);
  const lower = name.toLowerCase();
  switch (kind) {
    case 'zero':
      return `${name} has a 0 clue, so none of its squares are filled. Cross them all off!`;
    case 'done':
      return `${name} already has every square its clue (${c}) asks for. The rest must be empty.`;
    case 'exact':
      return colour
        ? `${name}'s blocks (${c}) fill all ${L} squares exactly. Different colours can touch, same colours need a gap. Only one way fits!`
        : `${name}'s blocks (${c}) plus one gap between each fill all ${L} squares exactly. Only one way fits!`;
    case 'overlap':
      return clue.length === 1
        ? `In ${lower}, the ${c} is so long that wherever it slides, these middle squares are always covered.`
        : `Slide the blocks of ${lower} (${c}) all the way left, then all the way right. Squares a block covers both times must be filled.`;
    case 'reach':
      return `No block in ${lower} (${c}) can reach these squares any more, so they're empty.`;
    case 'slide':
      return `Try every way ${lower}'s clue (${c}) can fit around what's already marked. These squares come out the same every time!`;
    default:
      return `Thinking about which colours can't go where in ${lower} (${c}) tells us these squares.`;
  }
}

// Mistakes come first: the hint points at a wrong square.
// Returns null when the puzzle is solved.
export function nextHint(board) {
  if (board.solved) return null;
  const wrong = board.mistakes();
  if (wrong.length) {
    const i = wrong[0];
    const v = board.cells[i];
    return {
      kind: 'mistake',
      cells: [{ i, value: UNKNOWN }],
      line: { axis: 'row', index: (i / board.w) | 0 },
      text: v === CROSS
        ? 'This square has a cross, but it belongs in the picture. Let’s clear it.'
        : 'This square doesn’t belong in the picture. Let’s clear it.',
    };
  }
  const masks = knowledge(board);
  const { w, h } = board;
  let best = null;
  const consider = (axis, index) => {
    const ids = board.line(axis, index);
    const before = ids.map((i) => masks[i]);
    const clue = board.clue(axis, index);
    const after = solveLine(clue, before);
    if (!after) return;
    const changes = [];
    for (let k = 0; k < ids.length; k++) {
      if (after[k] === before[k]) continue;
      const value = maskValue(after[k]);
      if (value === null) continue;
      if (board.cells[ids[k]] !== UNKNOWN) continue;
      changes.push({ i: ids[k], value: value < 0 ? CROSS : value });
    }
    if (!changes.length) return;
    const kind = classify(clue, before, changes.map((c) => ({ value: c.value === CROSS ? -1 : c.value })), ids.length);
    const score = ORDER[kind] * 1000 - changes.length;
    if (!best || score < best.score) best = { score, kind, axis, index, clue, changes, L: ids.length };
  };
  for (let y = 0; y < h; y++) consider('row', y);
  for (let x = 0; x < w; x++) consider('col', x);
  if (best) {
    return {
      kind: best.kind,
      cells: best.changes,
      line: { axis: best.axis, index: best.index },
      text: explain(best.kind, best.axis, best.index, best.clue, best.L, board.p.colour),
    };
  }
  // Colour puzzles can need "not this colour" facts the board can't show.
  // Run the solver with those hidden facts until a square is certain.
  const p = board.p;
  const res = solve({ w, h, colours: p.colours, rows: p.rows, cols: p.cols }, masks);
  for (let y = 0; y < h; y++) {
    const changes = [];
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const value = maskValue(res.masks[i]);
      if (board.cells[i] === UNKNOWN && value !== null) changes.push({ i, value: value < 0 ? CROSS : value });
    }
    if (changes.length) {
      return { kind: 'deep', cells: changes, line: { axis: 'row', index: y }, text: explain('deep', 'row', y, p.rows[y], w, p.colour) };
    }
  }
  return null;
}

// Apply a hint to the board as one undo step.
export function applyHint(board, hint) {
  const changes = hint.cells.map((c) => [c.i, board.cells[c.i], c.value]).filter((c) => c[1] !== c[2]);
  board.hints++;
  return board.commit(changes, { auto: true, hint: true });
}
