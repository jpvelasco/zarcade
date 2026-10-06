import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, defaultSave, loadSave, writeSave, recordRun, recordDaily, dailyStatus, streakActive } from '../src/progress.js';
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
    stats: { totalSliced: -3 },
  }));
  const save = loadSave(store);
  assert.equal(save.best, 12);
  assert.equal(save.muted, true);
  assert.equal(save.music, false);
  assert.equal(save.daily.streak, 9999);
  assert.equal(save.daily.lastKey, 0);
  assert.equal(save.stats.totalSliced, 0);

  store.setItem(SAVE_KEY, JSON.stringify({ best: -10, daily: 'x', stats: null }));
  const s2 = loadSave(store);
  assert.equal(s2.best, 0);
  assert.equal(s2.daily.streak, 0);
});

test('writeSave reports success and failure', () => {
  const store = mem();
  assert.equal(writeSave(store, { best: 5 }), true);
  const broken = { setItem() { throw new Error('quota'); } };
  assert.equal(writeSave(broken, { best: 5 }), false);
});

test('recordRun bumps the high score only when beaten and counts slices', () => {
  const save = defaultSave();
  assert.equal(recordRun(save, 100, 10), true);
  assert.equal(save.best, 100);
  assert.equal(save.stats.totalSliced, 10);
  assert.equal(recordRun(save, 50, 5), false);
  assert.equal(save.best, 100);
  assert.equal(save.stats.totalSliced, 15);
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
