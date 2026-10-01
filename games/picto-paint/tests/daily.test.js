import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyCritter, dateKey, dayDiff, recordDaily, liveStreak, mulberry32 } from '../src/daily.js';
import { solve } from '../src/solver.js';

test('the same date always gives the same critter', () => {
  const a = dailyCritter('2026-10-01');
  const b = dailyCritter('2026-10-01');
  assert.deepEqual(a.def.art, b.def.art);
  assert.equal(a.def.name, b.def.name);
  assert.notDeepEqual(dailyCritter('2026-10-02').def.art, a.def.art);
});

test('a year of daily critters are all mirror-symmetric and line-solvable', () => {
  for (let d = 0; d < 366; d++) {
    const key = dateKey(new Date(2026, 0, 1 + d));
    const { def, puzzle, attempt } = dailyCritter(key);
    assert.ok(attempt >= 0, `${key} fell back`);
    assert.ok(puzzle.w <= 10 && puzzle.h <= 10 && puzzle.w >= 6);
    for (const row of def.art) assert.equal(row, [...row].reverse().join(''));
    assert.equal(solve(puzzle).solved, true, key);
    assert.equal(puzzle.eyes.length, 2);
  }
});

test('date keys and day gaps', () => {
  assert.equal(dateKey(new Date(2026, 9, 1)), '2026-10-01');
  assert.equal(dayDiff('2026-12-31', '2027-01-01'), 1);
  assert.equal(dayDiff('2026-03-07', '2026-03-09'), 2);
});

test('streaks grow day by day and gently restart after a gap', () => {
  let d = { last: null, streak: 0, best: 0, done: {} };
  d = recordDaily(d, '2026-10-01', 100).daily;
  d = recordDaily(d, '2026-10-02', 90).daily;
  const again = recordDaily(d, '2026-10-02', 80);
  assert.equal(again.extended, false);
  assert.equal(again.daily.done['2026-10-02'], 80);
  assert.equal(d.streak, 2);
  assert.equal(liveStreak(d, '2026-10-03'), 2);
  assert.equal(liveStreak(d, '2026-10-05'), 0);
  d = recordDaily(d, '2026-10-05', 70).daily;
  assert.equal(d.streak, 1);
  assert.equal(d.best, 2);
});

test('the seeded generator is deterministic', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});
