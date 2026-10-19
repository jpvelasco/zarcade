import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, UNKNOWN, CROSS } from '../src/board.js';
import { buildPuzzle } from '../src/puzzle.js';

// 5×3: row 0 "##.##", row 1 "#####", row 2 "..#.."
const P = buildPuzzle({ id: 't', name: 'T', art: ['kk.kk', 'kkkkk', '..k..'] });
const C = buildPuzzle({ id: 'c', name: 'C', colour: true, art: ['rrb', 'b.r', 'rbb'] });

test('a drag paints along its first axis only', () => {
  const b = new Board(P, { mode: 'expert' });
  b.beginStroke(b.idx(0, 1), 'fill');
  b.extendStroke(b.idx(2, 1));
  b.extendStroke(b.idx(4, 2)); // drifts down: stays on row 1
  const r = b.endStroke();
  assert.equal(b.rowDone[1], 1);
  assert.ok(r.lines.some((l) => l.axis === 'row' && l.index === 1));
  for (let x = 0; x < 5; x++) assert.equal(b.cells[b.idx(x, 1)], 0);
  assert.equal(b.cells[b.idx(4, 2)], UNKNOWN);
});

test('dragging back shrinks the stroke and only same-state squares change', () => {
  const b = new Board(P, { mode: 'expert' });
  b.cells[b.idx(2, 0)] = CROSS;
  b.beginStroke(b.idx(0, 0), 'fill');
  b.extendStroke(b.idx(4, 0));
  assert.equal(b.cells[b.idx(2, 0)], CROSS, 'crosses are skipped by a fill stroke');
  b.extendStroke(b.idx(1, 0));
  assert.equal(b.cells[b.idx(3, 0)], UNKNOWN);
  b.endStroke();
  // starting on a filled square erases
  b.beginStroke(b.idx(0, 0), 'fill');
  b.endStroke();
  assert.equal(b.cells[b.idx(0, 0)], UNKNOWN);
});

test('finished lines get auto-crossed and undo brings it all back', () => {
  const b = new Board(P, { mode: 'expert' });
  b.beginStroke(b.idx(2, 2), 'fill');
  const r = b.endStroke();
  assert.equal(b.colDone[2], 0);
  assert.equal(b.rowDone[2], 1);
  assert.equal(b.cells[b.idx(0, 2)], CROSS);
  assert.ok(r.changed.length === 5);
  b.undo();
  assert.ok(b.cells.every((v) => v === UNKNOWN));
  b.redo();
  assert.equal(b.cells[b.idx(4, 2)], CROSS);
});

test('Helper mode turns a wrong fill into a cross and wipes a wrong cross', () => {
  const b = new Board(P, { mode: 'helper' });
  b.beginStroke(b.idx(2, 0), 'fill');
  assert.ok(b.stroke.wrong.has(b.idx(2, 0)), 'flagged right away');
  const r = b.endStroke();
  assert.deepEqual(r.corrected, [b.idx(2, 0)]);
  assert.equal(b.cells[b.idx(2, 0)], CROSS);
  b.beginStroke(b.idx(0, 0), 'cross');
  b.endStroke();
  assert.equal(b.cells[b.idx(0, 0)], UNKNOWN);
  assert.equal(b.corrections, 2);
  // crossing a correct fill keeps the fill
  b.beginStroke(b.idx(1, 0), 'fill');
  b.endStroke();
  b.beginStroke(b.idx(1, 0), 'cross');
  b.endStroke();
  assert.equal(b.cells[b.idx(1, 0)], 0);
});

test('Helper mode wipes a wrong colour instead of crossing it', () => {
  const b = new Board(C, { mode: 'helper' });
  b.beginStroke(0, 'fill', 1); // square 0 is colour 0
  const r = b.endStroke();
  assert.deepEqual(r.corrected, [0]);
  assert.equal(b.cells[0], UNKNOWN);
  assert.deepEqual(b.mistakes(), []);
});

test('Expert mode never checks', () => {
  const b = new Board(P, { mode: 'expert' });
  b.beginStroke(b.idx(2, 0), 'fill');
  const r = b.endStroke();
  assert.deepEqual(r.corrected, []);
  assert.equal(b.cells[b.idx(2, 0)], 0);
  assert.deepEqual(b.mistakes(), [b.idx(2, 0)]);
});

test('the puzzle is solved when the fills match, crosses optional', () => {
  const b = new Board(P, { mode: 'expert' });
  for (let i = 0; i < P.solution.length; i++) if (P.solution[i] >= 0) b.cells[i] = 0;
  assert.equal(b.isSolved(), true);
  b.cells[b.idx(2, 0)] = 0;
  assert.equal(b.isSolved(), false);
});

test('colour fills must match the clue colour', () => {
  const b = new Board(C, { mode: 'expert' });
  assert.equal(C.colours, 2);
  b.beginStroke(0, 'fill', 1);
  b.endStroke();
  assert.equal(b.isWrong(0), true);
  // Tapping with another colour repaints the square.
  b.beginStroke(0, 'fill', 0);
  b.endStroke();
  assert.equal(b.cells[0], 0);
  assert.equal(b.isWrong(0), false);
});

test('clue blocks closed off from an end are marked done', () => {
  const b = new Board(P, { mode: 'expert' });
  b.cells[b.idx(0, 0)] = 0;
  b.cells[b.idx(1, 0)] = 0;
  b.cells[b.idx(2, 0)] = CROSS;
  assert.deepEqual(b.doneBlocks('row', 0), [true, false]);
  b.cells[b.idx(2, 0)] = UNKNOWN;
  assert.deepEqual(b.doneBlocks('row', 0), [false, false]);
});

test('boards save and load as short strings', () => {
  const b = new Board(C, { mode: 'expert' });
  b.cells[0] = 1;
  b.cells[4] = CROSS;
  const s = b.serialize();
  assert.equal(s, 'b...x....');
  const again = new Board(C, { cells: Board.parseCells(s, 9) });
  assert.deepEqual(Array.from(again.cells), Array.from(b.cells));
  assert.equal(Board.parseCells('abc', 9), null);
  assert.equal(Board.parseCells('ZZZ......', 9), null, 'characters below a are not paints');
  assert.equal(Board.parseCells('a.x.-....', 9), null);
});
