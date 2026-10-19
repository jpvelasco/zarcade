import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLine, solve, cluesOf, lineClue, EMPTY, colourBit, fullMask, maskValue } from '../src/solver.js';

const F = colourBit(0);
const U = fullMask(1);
const mono = (ns) => ns.map((n) => ({ n, c: 0 }));
const show = (line) => line.map((m) => (m === F ? '#' : m === EMPTY ? 'x' : '?')).join('');

test('overlap fills the middle of a long block', () => {
  assert.equal(show(solveLine(mono([4]), new Array(5).fill(U))), '?###?');
});

test('a zero clue empties the line, an exact fit fills it', () => {
  assert.equal(show(solveLine([], new Array(4).fill(U))), 'xxxx');
  assert.equal(show(solveLine(mono([2, 2]), new Array(5).fill(U))), '##x##');
});

test('known cells push blocks around', () => {
  const line = [U, U, F, U, U, U];
  // A single 2 touching cell 2 can only be cells 1-2 or 2-3.
  assert.equal(show(solveLine(mono([2]), line)), 'x?#?xx');
});

test('impossible lines return null', () => {
  assert.equal(solveLine(mono([3]), [U, EMPTY, U, EMPTY, U]), null);
  assert.equal(solveLine([], [F, U]), null);
});

test('different colours may touch, same colours need a gap', () => {
  const two = fullMask(2);
  const red = colourBit(0);
  const blue = colourBit(1);
  // red 2 + blue 1 in three cells: exactly one way.
  const res = solveLine([{ n: 2, c: 0 }, { n: 1, c: 1 }], new Array(3).fill(two));
  assert.deepEqual(res, [red, red, blue]);
  // red 2 + red 1 cannot fit in three cells.
  assert.equal(solveLine([{ n: 2, c: 0 }, { n: 1, c: 0 }], new Array(3).fill(two)), null);
});

test('clues are run lengths with colours', () => {
  assert.deepEqual(lineClue([-1, 0, 0, -1, 1, 0]), [{ n: 2, c: 0 }, { n: 1, c: 1 }, { n: 1, c: 0 }]);
  const { rows, cols } = cluesOf([[0, -1], [0, 0]]);
  assert.deepEqual(rows.map((r) => r.map((b) => b.n)), [[1], [2]]);
  assert.deepEqual(cols.map((r) => r.map((b) => b.n)), [[2], [1]]);
});

test('line logic proves a unique picture and gives up on a guess', () => {
  const plus = [[-1, 0, -1], [0, 0, 0], [-1, 0, -1]];
  const r = solve({ w: 3, h: 3, colours: 1, ...cluesOf(plus) });
  assert.equal(r.solved, true);
  assert.deepEqual(r.masks.map(maskValue), plus.flat());
  // Two diagonals share the same clues: no unique answer.
  const diag = [[0, -1], [-1, 0]];
  assert.equal(solve({ w: 2, h: 2, colours: 1, ...cluesOf(diag) }).solved, false);
});
