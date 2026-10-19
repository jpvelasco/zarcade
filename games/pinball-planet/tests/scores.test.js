import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, defaultSave, loadSave, writeSave, qualifies, addScore, cleanName, best, TABLE_SIZE } from '../src/scores.js';

function memory(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('the save key is namespaced with the slug and version', () => {
  assert.equal(SAVE_KEY, 'pinball-planet.v1');
});

test('a fresh save has a beatable default table, sorted high to low', () => {
  const s = defaultSave();
  assert.equal(s.scores.length, TABLE_SIZE);
  for (let i = 1; i < s.scores.length; i++) assert.ok(s.scores[i - 1].score > s.scores[i].score);
  for (const e of s.scores) assert.ok(e.name.length <= 3);
});

test('high scores with initials round-trip through storage', () => {
  const store = memory();
  const s = defaultSave();
  assert.ok(qualifies(s, 2000000));
  const rank = addScore(s, 'jp!', 2000000);
  assert.equal(rank, 3);
  assert.equal(s.scores.length, TABLE_SIZE);
  assert.equal(s.initials, 'JP');
  assert.ok(writeSave(store, s));
  const back = loadSave(store);
  assert.deepEqual(back.scores, s.scores);
  assert.equal(back.initials, 'JP');
});

test('low scores do not qualify and are not added', () => {
  const s = defaultSave();
  assert.equal(qualifies(s, 10), false);
  assert.equal(addScore(s, 'ABC', 10), -1);
  assert.equal(qualifies(s, 0), false);
  assert.equal(best(s), s.scores[0].score);
});

test('corrupt, hostile or blocked storage falls back to defaults', () => {
  assert.deepEqual(loadSave(memory({ [SAVE_KEY]: '{nope' })).scores, defaultSave().scores);
  const hostile = loadSave(memory({ [SAVE_KEY]: JSON.stringify({ scores: [{ name: '<script>', score: 5 }, { score: 'x' }, null], muted: 'yes' }) }));
  assert.deepEqual(hostile.scores, [{ name: 'SCR', score: 5 }]);
  assert.equal(hostile.muted, false);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(blocked).scores, defaultSave().scores);
  assert.equal(writeSave(blocked, defaultSave()), false);
  assert.equal(cleanName(''), 'AAA');
});
