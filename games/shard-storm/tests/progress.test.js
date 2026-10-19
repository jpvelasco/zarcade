import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, defaultSave, loadSave, writeSave, mergeSave, recordRun, recordDaily, dailyStatus, streakActive } from '../src/progress.js';
import { dateKey } from '../src/daily.js';

function mem() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

test('SAVE_KEY is namespaced by slug and version', () => {
  assert.equal(SAVE_KEY, 'shard-storm.v1');
});

test('loadSave returns defaults for a null store and a fresh key', () => {
  const save = loadSave(mem());
  assert.deepEqual(save, defaultSave());
});

test('loadSave sanitises corrupted and hostile fields', () => {
  const store = mem();
  store.setItem(SAVE_KEY, 'not json{');
  assert.deepEqual(loadSave(store), defaultSave());

  store.setItem(SAVE_KEY, JSON.stringify({
    best: 12.9, muted: true, music: false,
    daily: { streak: 999999, lastKey: -5 },
    stats: { totalSliced: -3, bestCombo: 'lots', breaks: null },
  }));
  const save = loadSave(store);
  assert.equal(save.best, 12);
  assert.equal(save.muted, true);
  assert.equal(save.music, false);
  assert.equal(save.daily.streak, 9999);
  assert.equal(save.daily.lastKey, 0);
  assert.equal(save.stats.totalSliced, 0);
  assert.equal(save.stats.bestCombo, 0, 'a damaged field keeps its default');
  assert.equal(save.stats.breaks, 0);

  store.setItem(SAVE_KEY, JSON.stringify({ best: -10, daily: 'x', stats: null }));
  const s2 = loadSave(store);
  assert.equal(s2.best, 0);
  assert.equal(s2.daily.streak, 0);

  // One poisoned field must not take the rest of the save with it.
  store.setItem(SAVE_KEY, JSON.stringify({ best: 500, stats: { totalSliced: NaN, bestCombo: 9 } }));
  const s3 = loadSave(store);
  assert.equal(s3.best, 500);
  assert.equal(s3.stats.totalSliced, 0);
  assert.equal(s3.stats.bestCombo, 9);
});

test('loadSave survives storage that throws or is missing', () => {
  const hostile = { getItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(hostile), defaultSave());
  assert.deepEqual(loadSave(null), defaultSave());
});

test('mergeSave keeps the better of two tabs instead of letting one win', () => {
  const mine = defaultSave();
  mine.best = 900;
  mine.muted = true;
  mine.stats = { totalSliced: 40, bestCombo: 12, runs: 3, breaks: 2 };
  mine.daily = { streak: 2, lastKey: 20261005 };

  const theirs = {
    best: 1500, muted: false, music: false,
    stats: { totalSliced: 10, bestCombo: 30, runs: 9, breaks: 1 },
    daily: { streak: 7, lastKey: 20261006 },
  };
  const out = mergeSave(mine, theirs);
  assert.equal(out.best, 1500, 'the better score survives');
  assert.equal(out.stats.totalSliced, 40);
  assert.equal(out.stats.bestCombo, 30);
  assert.equal(out.stats.runs, 9);
  assert.equal(out.muted, true, 'sound stays a per-tab preference');
  assert.equal(out.music, true);
  assert.deepEqual(out.daily, { streak: 7, lastKey: 20261006 }, 'the newer day wins outright');
});

test('mergeSave keeps the longer streak on the same day and ignores junk', () => {
  const mine = defaultSave();
  mine.best = 50;
  mine.daily = { streak: 5, lastKey: 20261006 };
  const same = mergeSave(mine, { best: 10, daily: { streak: 3, lastKey: 20261006 } });
  assert.deepEqual(same.daily, { streak: 5, lastKey: 20261006 });

  const older = mergeSave(mine, { daily: { streak: 99, lastKey: 20260101 } });
  assert.deepEqual(older.daily, { streak: 5, lastKey: 20261006 }, 'a stale tab cannot rewrite today');

  for (const junk of [null, undefined, 'nope', 42, { best: 'x', daily: 'y', stats: 'z' }]) {
    const out = mergeSave(mine, junk);
    assert.equal(out.best, 50);
    assert.deepEqual(out.daily, { streak: 5, lastKey: 20261006 });
  }
});

test('writeSave reports success and failure', () => {
  const store = mem();
  assert.equal(writeSave(store, { best: 5 }), true);
  const broken = { setItem() { throw new Error('quota'); } };
  assert.equal(writeSave(broken, { best: 5 }), false);
});

test('recordRun bumps the high score only when beaten and counts slices', () => {
  const save = defaultSave();
  assert.equal(recordRun(save, 100, 10, 7, 1), true);
  assert.equal(save.best, 100);
  assert.equal(save.stats.totalSliced, 10);
  assert.equal(save.stats.bestCombo, 7);
  assert.equal(save.stats.breaks, 1);
  assert.equal(save.stats.runs, 1);
  assert.equal(recordRun(save, 50, 5, 3, 2), false);
  assert.equal(save.best, 100);
  assert.equal(save.stats.totalSliced, 15);
  assert.equal(save.stats.bestCombo, 7, 'a worse combo does not lower the record');
  assert.equal(save.stats.breaks, 3);
  assert.equal(save.stats.runs, 2);
});

test('recordDaily banks the streak once per day and is idempotent', () => {
  const save = defaultSave();
  const key = 20261006;
  assert.equal(recordDaily(save, true, key, 3), 3);
  assert.equal(save.daily.lastKey, key);
  // Clearing again the same day keeps the streak, does not double it.
  assert.equal(recordDaily(save, true, key, 3), 3);
  assert.equal(save.daily.lastKey, key);
});

test('dailyStatus and streakActive read today\u2019s state', () => {
  const save = defaultSave();
  assert.equal(dailyStatus(save), 'none');
  const key = dateKey();
  save.daily = { streak: 4, lastKey: key - 1 };
  assert.equal(dailyStatus(save), 'missed');
  assert.equal(streakActive(save), true, 'a streak from yesterday is still alive');
  save.daily.lastKey = key;
  assert.equal(dailyStatus(save), 'cleared');
  save.daily.lastKey = key - 5;
  assert.equal(streakActive(save), false, 'an old streak is over');
});
