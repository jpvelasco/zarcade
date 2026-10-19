import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, freshSave, recordLevel, recordEndless, recordDaily, levelUnlocked, islandUnlocked, totalStars, nextLevel, liveStreak, dayBefore, SAVE_KEY } from '../src/save.js';
import { LEVELS, islandLevels } from '../src/levels.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('saves round-trip under the namespaced key', () => {
  const st = memory();
  const s = freshSave();
  recordLevel(s, 0, 2);
  s.endlessBest = 12.5;
  assert.ok(writeSave(st, s));
  assert.ok(st.m.has(SAVE_KEY));
  const back = loadSave(st);
  assert.equal(back.stars[0], 2);
  assert.equal(back.endlessBest, 12.5);
});

test('blocked or corrupt storage falls back to a fresh save', () => {
  assert.deepEqual(loadSave(null), freshSave());
  const st = memory(); st.setItem(SAVE_KEY, '{oops');
  assert.deepEqual(loadSave(st), freshSave());
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(throwing), freshSave());
  assert.equal(writeSave(throwing, freshSave()), false);
});

test('levels unlock one after another and stars keep the best', () => {
  const s = freshSave();
  assert.ok(levelUnlocked(s, 0));
  assert.ok(!levelUnlocked(s, 1));
  recordLevel(s, 0, 3);
  recordLevel(s, 0, 1);
  assert.equal(s.stars[0], 3);
  assert.ok(levelUnlocked(s, 1));
  assert.equal(totalStars(s), 3);
  assert.equal(nextLevel(s), 1);
});

test('clearing an island unlocks the next one and two new animals', () => {
  const s = freshSave();
  let got = [];
  for (const l of islandLevels(0)) got.push(...recordLevel(s, l.index, 1).animals);
  assert.deepEqual(got.sort(), ['frog', 'penguin']);
  assert.ok(islandUnlocked(s, 1));
  assert.ok(!islandUnlocked(s, 2));
  assert.ok(s.newAnimals.includes('penguin'));
});

test('themes unlock with stars and Endless height', () => {
  const s = freshSave();
  for (let i = 0; i < 5; i++) recordLevel(s, i, 3);
  assert.ok(s.themes.includes('candy'));
  assert.ok(!s.themes.includes('jungle'));
  const r = recordEndless(s, 26);
  assert.ok(r.newBest);
  assert.ok(r.themes.includes('space'));
  assert.equal(recordEndless(s, 10).newBest, false);
  assert.equal(s.endlessBest, 26);
});

test('the daily streak counts consecutive days', () => {
  const s = freshSave();
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2026-01-01'), '2025-12-31');
  recordDaily(s, '2026-09-29', 2);
  recordDaily(s, '2026-09-30', 1);
  assert.equal(s.streak.count, 2);
  recordDaily(s, '2026-09-30', 3); // same day again: no double count
  assert.equal(s.streak.count, 2);
  assert.equal(s.daily['2026-09-30'], 3);
  assert.equal(liveStreak(s, '2026-10-01'), 2);
  assert.equal(liveStreak(s, '2026-10-03'), 0);
  recordDaily(s, '2026-10-05', 1);
  assert.equal(s.streak.count, 1);
  assert.equal(s.streak.best, 2);
});

test('stars from older saves are clamped', () => {
  const st = memory();
  st.setItem(SAVE_KEY, JSON.stringify({ stars: [9, -2, 2], animals: ['penguin', 7], theme: 'nope' }));
  const s = loadSave(st);
  assert.deepEqual(s.stars, [3, 0, 2]);
  assert.ok(s.animals.includes('hippo') && s.animals.includes('penguin'));
  assert.equal(s.theme, 'sunny');
  assert.ok(LEVELS.length > 0);
});

test('unknown animal ids in a damaged save are dropped', () => {
  const st = memory();
  st.setItem(SAVE_KEY, JSON.stringify({ animals: ['dragon', 'toString', 'penguin'], newAnimals: ['dragon', 'penguin'] }));
  const s = loadSave(st);
  assert.deepEqual(s.animals, [...freshSave().animals, 'penguin']);
  assert.deepEqual(s.newAnimals, ['penguin']);
});
