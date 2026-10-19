import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, program, runProgram } from '../src/rules.js';
import { bfsMin, bruteForce } from '../src/solver.js';
import { LEVEL } from '../src/levels.js';

const lv = (map, ops, limits = { main: 12, p1: 0 }, start = [0, 0, 'E']) => parseLevel({ id: 's', map, start, ops, limits });

test('BFS finds the shortest plain sequence and its path solves the level', () => {
  const level = lv(['0 0 0', '. . 0', '. . 0L'], 'FLR*');
  const best = bfsMin(level);
  assert.equal(best.length, 6);
  assert.equal(runProgram(level, program(best.path.join(' '))).win, true);
  assert.equal(bfsMin(lv(['0 . 0L'], 'F*')), null, 'unreachable lamp');
});

test('BFS uses jumps and grabs only when allowed', () => {
  assert.equal(bfsMin(lv(['0 1L'], 'FJ*')).length, 2);
  assert.equal(bfsMin(lv(['0 1L'], 'F*')), null);
  assert.equal(bfsMin(lv(['0B 0L'], 'FG*')).length, 3);
});

test('brute force finds loops and recursion that beat a sequence', () => {
  const road = lv(['0 0 0 0 0 0 0L'], 'F*@');
  const r = bruteForce(road, { maxSize: 4, maxCount: 9 });
  assert.equal(r.size, 3);
  assert.equal(runProgram(road, { main: r.main, p1: r.p1 }).win, true);
  const rec = lv(['0 0L 0L 0L 0L 0L 0L 0L'], 'F*1^', { main: 2, p1: 4 });
  const r2 = bruteForce(rec, { maxSize: 5 });
  assert.equal(r2.size, 4);
  assert.equal(r2.p1.at(-1).op, '1');
});

test('brute force respects the no-recursion rule and the budget', () => {
  const rec = lv(['0 0L 0L 0L 0L 0L 0L 0L'], 'F*1', { main: 3, p1: 4 });
  const r = bruteForce(rec, { maxSize: 5 });
  assert.equal(r.size, null);
  const big = bruteForce(parseLevel(LEVEL['3-10']), { maxSize: 9, budget: 2000 });
  assert.equal(big.exhausted, true);
  assert.ok(big.tried <= 2001);
});
