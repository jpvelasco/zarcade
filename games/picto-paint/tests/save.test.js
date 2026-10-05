import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, defaultSave, storeProgress, SAVE_KEY } from '../src/save.js';

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

test('pruning keeps the board played most recently, even if it was started first', () => {
  const st = memory();
  const s = defaultSave();
  const entry = (t) => ({ cells: '..', time: t, hints: 0 });
  for (let k = 0; k < 12; k++) storeProgress(s, `p${k}`, entry(k));
  storeProgress(s, 'p0', entry(99)); // back to the oldest board, still playing it
  storeProgress(s, 'p12', entry(1)); // and a 13th picture
  writeSave(st, s);
  const saved = JSON.parse(st.m.get(SAVE_KEY)).progress;
  assert.equal(Object.keys(saved).length, 12);
  assert.equal(saved.p0.time, 99);
  assert.equal(saved.p1, undefined, 'the board played longest ago goes');
});

test('the master mute is saved apart from the effects and music switches', () => {
  const st = memory();
  assert.equal(defaultSave().settings.muted, false);
  const s = defaultSave();
  s.settings.muted = true;
  writeSave(st, s);
  const back = loadSave(st);
  assert.equal(back.settings.muted, true);
  assert.equal(back.settings.sound, true);
  assert.equal(back.settings.music, true);
  st.setItem(SAVE_KEY, JSON.stringify({ settings: { muted: 'yes' } }));
  assert.equal(loadSave(st).settings.muted, false);
});
