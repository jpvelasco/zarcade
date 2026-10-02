import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, defaultSave, loadSave, writeSave, recordWin, totalStars, isUnlocked } from '../src/save.js';

function memory() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

test('saves round-trip under the namespaced key', () => {
  const store = memory();
  const save = defaultSave();
  recordWin(save, 1, { stars: 2, moves: 9 });
  assert.equal(writeSave(store, save), true);
  assert.ok(store.data.has(SAVE_KEY));
  assert.equal(SAVE_KEY, 'riverlight.v1');
  const back = loadSave(store);
  assert.equal(back.stars[1], 2);
  assert.equal(back.unlocked, 2);
  assert.equal(totalStars(back), 2);
  assert.ok(isUnlocked(back, 2));
  assert.ok(!isUnlocked(back, 3));
});

test('stars and best moves only improve', () => {
  const save = defaultSave();
  recordWin(save, 3, { stars: 3, moves: 10 });
  const res = recordWin(save, 3, { stars: 1, moves: 20 });
  assert.equal(save.stars[3], 3);
  assert.equal(save.best[3], 10);
  assert.equal(res.improved, false);
  assert.equal(res.firstClear, false);
});

test('finishing a garden clears its saved progress', () => {
  const save = defaultSave();
  save.current = { id: 4, rots: [1], moves: 2 };
  recordWin(save, 4, { stars: 3, moves: 5 });
  assert.equal(save.current, null);
});

test('broken or blocked storage falls back to a fresh save', () => {
  assert.deepEqual(loadSave(null), defaultSave());
  assert.deepEqual(loadSave({ getItem: () => '{nope' }), defaultSave());
  assert.deepEqual(loadSave({ getItem: () => { throw new Error('blocked'); } }), defaultSave());
  assert.equal(writeSave({ setItem: () => { throw new Error('full'); } }, defaultSave()), false);
  const odd = loadSave({ getItem: () => JSON.stringify({ unlocked: 999, stars: 5, current: { rots: 'x' } }) });
  assert.equal(odd.unlocked, 72);
  assert.deepEqual(odd.stars, {});
  assert.equal(odd.current, null);
});

test('damaged fields are dropped on load instead of crashing Continue (#169)', () => {
  const load = (data) => loadSave({ getItem: () => JSON.stringify(data) });
  assert.equal(load({ unlocked: 3, current: { id: 'x', rots: [1, 2] } }).current, null);
  assert.equal(load({ current: { id: 99, rots: [1] } }).current, null);
  assert.equal(load({ current: { id: 1, rots: [1.5, null, 0] } }).current, null);
  assert.deepEqual(load({ current: { id: 2, rots: [1, 0], moves: 'q' } }).current, { id: 2, rots: [1, 0], moves: 0 });
  const odd = load({ stars: { 1: 'abc', 2: 99, 3: 2, x: 3 }, best: { 1: 'x', 3: 7, 4: -1 }, seen: [null, 'split', 5] });
  assert.deepEqual(odd.stars, { 3: 2 });
  assert.deepEqual(odd.best, { 3: 7 });
  assert.deepEqual(odd.seen, ['split']);
  assert.equal(totalStars(odd), 2);
  assert.deepEqual(load({ stars: [3, 3] }).stars, {});
});
