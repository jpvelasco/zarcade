import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDaily } from '../src/daily.js';
import { parseLevel } from '../src/board.js';
import { solve } from '../src/solver.js';
import { simulate } from '../src/sim.js';

const days = ['2026-10-01', '2026-10-02', '2026-12-25', '2027-01-01', '2027-02-14', '2027-07-04'];

test('the same date always gives the same puzzle', () => {
  const a = generateDaily('2026-10-01');
  const b = generateDaily('2026-10-01');
  assert.deepEqual(a, b);
  assert.notDeepEqual(generateDaily('2026-10-02').map, a.map);
});

test('daily puzzles are solvable within their par and not dull', () => {
  for (const day of days) {
    const lv = generateDaily(day);
    assert.ok(lv.attempt >= 0, `${day} fell back`);
    const b = parseLevel(lv);
    assert.deepEqual(b.errors, []);
    const s = solve(b, { startBound: lv.par, maxCost: lv.par, nodeLimit: 200000 });
    assert.ok(s.solved, day);
    assert.equal(simulate(b, s.layout).outcome, 'win', day);
    assert.ok(lv.par > b.trains.length * (b.w - 2) + 1, `${day} too easy`);
    assert.ok(b.w <= 8 && b.h <= 8);
  }
});
