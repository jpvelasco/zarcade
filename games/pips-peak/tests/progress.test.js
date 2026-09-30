import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/levels.js';
import {
  SAVE_KEY, emptySave, entryFor, formatTime, isUnlocked, loadSave, nextLevelIndex,
  recordRun, totals, unlockedCount, writeSave,
} from '../src/progress.js';

/** Stand-in for localStorage. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

const run = (levelId, over = {}) => ({
  levelId, time: 30, seeds: 5, seedTotal: 10, acorns: 1, acornTotal: 3, stars: 1, ...over,
});

test('a missing or broken save reads as a fresh one', () => {
  assert.deepEqual(loadSave(fakeStorage()), emptySave());
  assert.deepEqual(loadSave(fakeStorage({ [SAVE_KEY]: 'not json' })), emptySave());
  assert.deepEqual(loadSave(fakeStorage({ [SAVE_KEY]: '{"v":99}' })), emptySave());
  assert.deepEqual(loadSave(null), emptySave());
});

test('a save round-trips through storage', () => {
  const storage = fakeStorage();
  const save = emptySave();
  save.muted = true;
  recordRun(save, run(LEVELS[0].id, { stars: 2, time: 12.5 }));
  writeSave(storage, save);
  const read = loadSave(storage);
  assert.equal(read.muted, true);
  assert.equal(entryFor(read, LEVELS[0].id).stars, 2);
  assert.equal(entryFor(read, LEVELS[0].id).best, 12.5);
});

test('finishing a level keeps the best time, stars, seeds and acorns', () => {
  const save = emptySave();
  const first = recordRun(save, run(LEVELS[0].id, { time: 40, stars: 1, seeds: 4, acorns: 0 }));
  assert.equal(first.record, true, 'the first clear is always a record');
  const second = recordRun(save, run(LEVELS[0].id, { time: 55, stars: 3, seeds: 10, acorns: 3 }));
  assert.equal(second.record, false, 'slower is not a record');
  const entry = entryFor(save, LEVELS[0].id);
  assert.equal(entry.best, 40, 'best time kept');
  assert.equal(entry.stars, 3);
  assert.equal(entry.seeds, 10);
  assert.equal(entry.acorns, 3);
  const third = recordRun(save, run(LEVELS[0].id, { time: 22, stars: 1, seeds: 0, acorns: 0 }));
  assert.equal(third.record, true);
  assert.equal(entryFor(save, LEVELS[0].id).best, 22);
  assert.equal(entryFor(save, LEVELS[0].id).stars, 3, 'stars never go down');
});

test('levels unlock one at a time', () => {
  const save = emptySave();
  assert.equal(isUnlocked(save, 0), true);
  assert.equal(isUnlocked(save, 1), false);
  assert.equal(unlockedCount(save), 1);
  assert.equal(nextLevelIndex(save), 0);
  recordRun(save, run(LEVELS[0].id));
  assert.equal(isUnlocked(save, 1), true);
  assert.equal(isUnlocked(save, 2), false);
  assert.equal(unlockedCount(save), 2);
  assert.equal(nextLevelIndex(save), 1);
});

test('a level you already finished never shows as locked', () => {
  const save = emptySave();
  recordRun(save, run(LEVELS[4].id));
  assert.equal(isUnlocked(save, 4), true, 'finished levels stay open');
  assert.equal(isUnlocked(save, 5), true, 'and still unlock the next one');
  assert.equal(isUnlocked(save, 3), false);
});

test('totals add up across the mountain', () => {
  const save = emptySave();
  const blank = totals(save);
  assert.equal(blank.stars, 0);
  assert.equal(blank.done, 0);
  assert.equal(blank.levels, LEVELS.length);
  assert.equal(blank.maxStars, LEVELS.length * 3);
  for (const level of LEVELS) recordRun(save, run(level.id, { stars: 3, acorns: 3, seeds: 7 }));
  const full = totals(save);
  assert.equal(full.stars, full.maxStars);
  assert.equal(full.done, LEVELS.length);
  assert.equal(full.acorns, LEVELS.length * 3);
  assert.equal(nextLevelIndex(save), LEVELS.length - 1);
});

test('times read as minutes and hundredths', () => {
  assert.equal(formatTime(0), '0:00.00');
  assert.equal(formatTime(9.5), '0:09.50');
  assert.equal(formatTime(64.25), '1:04.25');
  assert.equal(formatTime(-3), '0:00.00');
});
