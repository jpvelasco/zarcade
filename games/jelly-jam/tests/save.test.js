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
