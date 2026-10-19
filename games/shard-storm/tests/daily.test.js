import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, dailySeed, dailyTarget, dailyLabel, nextStreak } from '../src/daily.js';
import { DAILY } from '../src/config.js';

test('dateKey packs a local date into a stable integer', () => {
  const d = new Date(2026, 9, 6); // 2026-10-06 local
  assert.equal(dateKey(d), 20261006);
});

test('dailySeed is deterministic per day and different across days', () => {
  const a = new Date(2026, 9, 6);
  const b = new Date(2026, 9, 6);
  const c = new Date(2026, 9, 7);
  assert.equal(dailySeed(a), dailySeed(b));
  assert.notEqual(dailySeed(a), dailySeed(c));
  assert.ok(Number.isFinite(dailySeed(a)));
  assert.ok(dailySeed(a) >= 0 && dailySeed(a) < 4294967296);
});

test('dailyTarget is deterministic and inside the documented band', () => {
  const d = new Date(2026, 9, 6);
  const t = dailyTarget(d);
  assert.equal(t, dailyTarget(new Date(2026, 9, 6)));
  assert.ok(t >= DAILY.target && t <= DAILY.target + 599);
  assert.ok(Number.isInteger(t));
});

test('dailyLabel formats a date as MM-DD', () => {
  assert.equal(dailyLabel(new Date(2026, 9, 6)), '10-06');
  assert.equal(dailyLabel(new Date(2026, 0, 7)), '01-07');
});

test('nextStreak continues after yesterday, resets after a gap', () => {
  assert.equal(nextStreak(4, 20261005, 20261006), 5);
  assert.equal(nextStreak(4, 20261004, 20261006), 1, 'a missed day restarts the streak');
  assert.equal(nextStreak(0, 0, 20261006), 1);
});
