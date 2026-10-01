import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, defaultSave, SAVE_KEY } from '../src/save.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

test('saves round-trip under the namespaced key', () => {
  const st = memory();
  const s = defaultSave();
  s.puzzles.heart = { solved: true, stars: 3, best: 42 };
  s.settings.mode = 'expert';
  s.critters.push('2026-10-01');
  assert.equal(writeSave(st, s), true);
  assert.ok(st.m.has('picto-paint.v1'));
  assert.equal(SAVE_KEY, 'picto-paint.v1');
  const back = loadSave(st);
  assert.deepEqual(back.puzzles.heart, { solved: true, stars: 3, best: 42 });
  assert.equal(back.settings.mode, 'expert');
  assert.deepEqual(back.critters, ['2026-10-01']);
});

test('broken, blocked or missing storage gives a fresh save', () => {
  assert.deepEqual(loadSave(null), defaultSave());
  const st = memory();
  st.setItem(SAVE_KEY, '{nope');
  assert.deepEqual(loadSave(st), defaultSave());
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(blocked), defaultSave());
  assert.equal(writeSave(blocked, defaultSave()), false);
  st.setItem(SAVE_KEY, JSON.stringify({ puzzles: { a: { stars: 9 } }, settings: { mode: 'weird' } }));
  const s = loadSave(st);
  assert.equal(s.puzzles.a.stars, 3);
  assert.equal(s.settings.mode, 'helper');
});

test('only a dozen unfinished boards are kept', () => {
  const st = memory();
  const s = defaultSave();
  for (let i = 0; i < 20; i++) s.progress[`p${i}`] = { cells: '..', time: i, hints: 0 };
  writeSave(st, s);
  assert.equal(Object.keys(loadSave(st).progress).length, 12);
});
