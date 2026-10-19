import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySeed, dateKey, dayDiff, derive, makeRng, next, shuffle, weighted } from '../src/rng.js';

test('rng streams are deterministic and serialisable', () => {
  const a = makeRng(99);
  const b = makeRng(99);
  for (let i = 0; i < 50; i++) assert.equal(next(a), next(b));
  const copy = JSON.parse(JSON.stringify(a));
  assert.equal(next(copy), next(a));
});

test('values stay in [0, 1) and shuffle keeps every item', () => {
  const r = makeRng(5);
  for (let i = 0; i < 1000; i++) {
    const v = next(r);
    assert.ok(v >= 0 && v < 1);
  }
  const list = shuffle(makeRng(1), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(list.slice().sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('weighted never picks a zero-weight entry', () => {
  const r = makeRng(3);
  for (let i = 0; i < 300; i++) assert.notEqual(weighted(r, [['a', 1], ['b', 0], ['c', 2]]), 'b');
});

test('derived streams are independent of the parent and of each other', () => {
  assert.equal(derive(10, 'map:0').s, derive(10, 'map:0').s);
  assert.notEqual(derive(10, 'map:0').s, derive(10, 'map:1').s);
});

test('daily seeds come from the local date', () => {
  assert.equal(dateKey(new Date(2026, 9, 1)), '2026-10-01');
  assert.equal(dailySeed('2026-10-01'), dailySeed('2026-10-01'));
  assert.notEqual(dailySeed('2026-10-01'), dailySeed('2026-10-02'));
  assert.equal(dayDiff('2026-09-30', '2026-10-01'), 1);
  assert.equal(dayDiff('2026-12-31', '2027-01-01'), 1);
  assert.equal(dayDiff('2026-10-01', '2026-10-05'), 4);
});
