import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, recordClear, recordScore, SAVE_KEY, constellationsReached, isUnlocked, totalStars } from '../src/progress.js';
import { World } from '../src/world.js';

const memory = (init = {}) => {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};

test('save uses the namespaced key and round-trips', () => {
  assert.equal(SAVE_KEY, 'comet-crush.v1');
  const s = memory();
  const save = loadSave(s);
  recordClear(save, 0, 3, 5000);
  save.muted = true;
  assert.equal(writeSave(s, save), true);
  const again = loadSave(s);
  assert.deepEqual(again, { unlocked: 1, stars: { 0: 3 }, best: 5000, muted: true, music: true });
});

test('corrupt or hostile saves fall back to safe defaults', () => {
  for (const raw of ['{', '42', 'null', JSON.stringify({ unlocked: 999, best: -5, stars: { 0: 7, 99: 3, x: 1, 2: 2 } })]) {
    const save = loadSave(memory({ [SAVE_KEY]: raw }));
    assert.ok(save.unlocked >= 0 && save.unlocked <= 35);
    assert.ok(save.best >= 0);
    for (const v of Object.values(save.stars)) assert.ok([1, 2, 3].includes(v));
  }
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(loadSave(throwing).unlocked, 0);
  assert.equal(writeSave(throwing, loadSave(throwing)), false);
  assert.equal(writeSave(null, loadSave(null)), false);
});

test('clearing levels unlocks the next and keeps the best stars', () => {
  const save = loadSave(memory());
  assert.equal(isUnlocked(save, 1), false);
  recordClear(save, 0, 2, 100);
  assert.equal(isUnlocked(save, 1), true);
  recordClear(save, 0, 1, 50);
  assert.equal(save.stars[0], 2);
  recordClear(save, 5, 3, 200);
  assert.equal(constellationsReached(save), 2);
  assert.equal(totalStars(save), 5);
  recordClear(save, 35, 3, 1);
  assert.equal(save.unlocked, 35);
  assert.equal(recordScore(save, 150), false);
  assert.equal(recordScore(save, 250), true);
});

test('star rating rewards careful play', () => {
  const w = new World(0);
  assert.equal(w.rating(), 3);
  w.livesLost = 1;
  assert.equal(w.rating(), 2);
  w.livesLost = 2;
  assert.equal(w.rating(), 1);
});
