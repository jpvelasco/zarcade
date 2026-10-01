import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, defaultSave, loadSave, writeSave, recordResult, recordPuzzle, puzzleUnlocked, nextPuzzle, puzzleStarsTotal, botsBeaten } from '../src/progress.js';
import { PUZZLES } from '../src/puzzles.js';

function memory(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('the save key is namespaced', () => assert.equal(SAVE_KEY, 'knight-shift.v1'));

test('missing, corrupt or blocked storage gives a fresh save', () => {
  assert.deepEqual(loadSave(memory()), defaultSave());
  assert.deepEqual(loadSave(memory({ [SAVE_KEY]: '{oops' })), defaultSave());
  assert.deepEqual(loadSave(null), defaultSave());
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadSave(blocked), defaultSave());
  assert.equal(writeSave(blocked, defaultSave()), false);
});

test('saves round-trip and junk values are dropped', () => {
  const store = memory();
  const save = defaultSave();
  save.settings.theme = 'space';
  save.puzzles[PUZZLES[0].id] = 3;
  save.current = { setup: { mode: 'classic' }, moves: ['e2e4'], opponent: 2, human: 0 };
  recordResult(save, 'owl', 'w');
  assert.equal(writeSave(store, save), true);
  assert.deepEqual(loadSave(store), save);
  store.setItem(SAVE_KEY, JSON.stringify({ settings: { theme: 'lava', sound: 'yes' }, puzzles: { nope: 3, [PUZZLES[1].id]: 7 }, stats: { owl: { w: -4 } }, current: { moves: 'x' } }));
  const clean = loadSave(store);
  assert.equal(clean.settings.theme, 'wood');
  assert.equal(clean.settings.sound, true);
  assert.deepEqual(clean.puzzles, {});
  assert.equal(clean.stats.owl.w, 0);
  assert.equal(clean.current, null);
});

test('results and puzzle progress', () => {
  const save = defaultSave();
  assert.equal(recordResult(save, 'pip', 'w'), true, 'first win');
  assert.equal(recordResult(save, 'pip', 'w'), false);
  recordResult(save, 'pip', 'l');
  assert.deepEqual(save.stats.pip, { w: 2, l: 1, d: 0 });
  assert.equal(botsBeaten(save), 1);
  assert.equal(puzzleUnlocked(save, 0), true);
  assert.equal(puzzleUnlocked(save, 1), false);
  assert.deepEqual(recordPuzzle(save, PUZZLES[0].id, 2), { first: true, better: true });
  assert.deepEqual(recordPuzzle(save, PUZZLES[0].id, 1), { first: false, better: false });
  assert.equal(save.puzzles[PUZZLES[0].id], 2);
  assert.equal(puzzleUnlocked(save, 1), true);
  assert.equal(nextPuzzle(save), 1);
  assert.equal(puzzleStarsTotal(save), 2);
  // A puzzle solved out of order stays open.
  recordPuzzle(save, PUZZLES[5].id, 3);
  assert.equal(puzzleUnlocked(save, 5), true);
  assert.equal(puzzleUnlocked(save, 4), false);
});
