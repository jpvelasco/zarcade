import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, loadSave, writeSave, SAVE_KEY } from '../src/save.js';

test('writeSave reports whether progress was stored', () => {
  const map = new Map();
  const storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
  const save = defaultSave();
  save.stars[1] = 2;
  assert.equal(writeSave(storage, save), true);
  assert.ok(map.has(SAVE_KEY));
  assert.equal(loadSave(storage).stars[1], 2);
  assert.equal(writeSave(null, save), false);
  assert.equal(writeSave({ setItem() { throw new Error('quota'); } }, save), false);
});

test('damaged save fields are dropped instead of giving impossible stars', () => {
  const raw = JSON.stringify({
    stars: { 1: 99, 2: 'x', 3: -4, 4: 3, 999: 2, foo: 1 },
    best: { 1: 'abc', 4: 12000, 5: -1 },
    unlocked: '7', muted: 'false', plays: 'lots',
  });
  const storage = { getItem: () => raw, setItem() {} };
  const save = loadSave(storage);
  assert.deepEqual(save.stars, { 4: 3 });
  assert.deepEqual(save.best, { 4: 12000 });
  assert.equal(save.unlocked, 7);
  assert.equal(save.muted, false, 'only a real true mutes');
  assert.equal(save.plays, 0);
  for (const bad of ['[]', '{"stars":[3,3],"best":"x"}', 'null', '7']) {
    const s = loadSave({ getItem: () => bad, setItem() {} });
    assert.deepEqual([s.stars, s.best], [{}, {}]);
  }
});
