import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyLevel, dateSeed, dateKeyOf, DAILY_POOL } from '../src/levels.js';
import { validateCrossword } from '../src/crossword.js';
import { Round } from '../src/game.js';
import { solve } from '../src/solver.js';

function days(count, start = '2026-10-01') {
  const out = [];
  const d = new Date(`${start}T12:00:00`);
  for (let i = 0; i < count; i++) {
    out.push(dateKeyOf(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

test('the daily puzzle is the same for everyone on the same date', () => {
  assert.deepEqual(dailyLevel('2026-10-01'), dailyLevel('2026-10-01'));
  assert.equal(dateSeed('2026-10-01'), dateSeed('2026-10-01'));
  assert.notEqual(dateSeed('2026-10-01'), dateSeed('2026-10-02'));
  assert.equal(dailyLevel('2026-10-01').daily, '2026-10-01');
});

test('date keys use the local calendar day', () => {
  assert.equal(dateKeyOf(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.deepEqual(days(3, '2026-12-31'), ['2026-12-31', '2027-01-01', '2027-01-02']);
});

test('a month of daily puzzles varies and every one is valid and solvable', () => {
  assert.ok(DAILY_POOL.length >= 60);
  const bases = new Set();
  for (const key of days(31)) {
    const level = dailyLevel(key);
    bases.add(level.base);
    assert.ok(level.letters.length >= 5 && level.letters.length <= 6);
    assert.ok(level.targets.length >= 4);
    assert.deepEqual(validateCrossword({ rows: level.rows, cols: level.cols, placements: level.targets }), []);
    assert.ok(solve(new Round(level)).complete, key);
  }
  assert.ok(bases.size >= 20, `only ${bases.size} different wheels in a month`);
});
