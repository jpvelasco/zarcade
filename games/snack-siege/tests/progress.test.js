import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSave, loadSave, writeSave, recordClear, recordFail, canSkip, skipLevel, isUnlocked, nextLevel,
  totalStars, worldCleared, SKINS, skinUnlocked, freshSkins, markSkinsSeen, chooseSkin, dailyState, recordDaily, SAVE_KEY,
} from '../src/progress.js';
import { dateKey, previousDateKey } from '../src/rng.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('saves round-trip under the namespaced key', () => {
  const s = memory();
  const save = defaultSave();
  recordClear(save, 0, 3, 12345);
  assert.equal(writeSave(s, save), true);
  assert.ok(s.m.has(SAVE_KEY));
  const back = loadSave(s);
  assert.equal(back.stars[0], 3);
  assert.equal(back.best[0], 12345);
});

test('blocked or corrupt storage falls back to a fresh save', () => {
  assert.deepEqual(loadSave(null), defaultSave());
  const bad = { getItem() { return '{nope'; }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadSave(bad), defaultSave());
  assert.equal(writeSave(bad, defaultSave()), false);
  const thrower = { getItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(thrower), defaultSave());
});

test('levels unlock one star at a time and bests only go up', () => {
  const save = defaultSave();
  assert.equal(isUnlocked(save, 0), true);
  assert.equal(isUnlocked(save, 1), false);
  const r1 = recordClear(save, 0, 1, 9000);
  assert.equal(r1.firstClear, true);
  assert.equal(r1.newBest, true);
  assert.equal(isUnlocked(save, 1), true);
  const r2 = recordClear(save, 0, 3, 5000);
  assert.equal(r2.newBest, false);
  assert.equal(save.stars[0], 3);
  assert.equal(save.best[0], 9000);
  assert.equal(totalStars(save), 3);
  assert.equal(nextLevel(save), 1);
});

test('three fails offer a skip that opens the next level', () => {
  const save = defaultSave();
  for (let i = 0; i < 2; i++) recordFail(save, 0);
  assert.equal(canSkip(save, 0), false);
  recordFail(save, 0);
  assert.equal(canSkip(save, 0), true);
  skipLevel(save, 0);
  assert.equal(isUnlocked(save, 1), true);
  assert.equal(nextLevel(save), 0, 'the skipped level is still waiting');
});

test('skins unlock from stars, worlds and daily forts', () => {
  const save = defaultSave();
  const byId = Object.fromEntries(SKINS.map((s) => [s.id, s]));
  assert.equal(skinUnlocked(save, byId.pretzel), true);
  assert.equal(skinUnlocked(save, byId.cane), false);
  for (let i = 0; i < 12; i++) recordClear(save, i, 1, 100);
  assert.equal(worldCleared(save, 0), true);
  assert.equal(skinUnlocked(save, byId.cane), true);
  assert.equal(skinUnlocked(save, byId.waffle), true);
  assert.deepEqual(freshSkins(save).map((s) => s.id).sort(), ['cane', 'waffle']);
  markSkinsSeen(save);
  assert.equal(freshSkins(save).length, 0);
  assert.equal(chooseSkin(save, 'star'), false);
  assert.equal(chooseSkin(save, 'waffle'), true);
  assert.equal(save.skin, 'waffle');
  save.dailyClears = 3;
  assert.equal(skinUnlocked(save, byId.gummy), true);
});

test('daily best and streak', () => {
  const save = defaultSave();
  const today = '2026-10-02';
  const yesterday = previousDateKey(today);
  assert.equal(yesterday, '2026-10-01');
  recordDaily(save, yesterday, true, 20000, 2);
  let r = recordDaily(save, today, false, 5000, 0);
  assert.equal(r.newBest, false);
  r = recordDaily(save, today, true, 30000, 3);
  assert.equal(r.newBest, true);
  assert.equal(r.streak, 2);
  r = recordDaily(save, today, true, 31000, 3);
  assert.equal(r.streakUp, false);
  assert.equal(save.streak.count, 2);
  assert.equal(save.dailyClears, 2);
  assert.equal(dailyState(save, today).best, 31000);
  assert.equal(dailyState(save, '2026-10-03').streak, 2, 'streak alive the next day');
  assert.equal(dailyState(save, '2026-10-05').streak, 0, 'gently resets after a gap');
  assert.equal(dailyState(save, '2026-10-05').best, 0);
  recordDaily(save, '2026-10-05', true, 100, 1);
  assert.equal(save.streak.count, 1);
});

test('date keys are local calendar days', () => {
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(previousDateKey('2026-03-01'), '2026-02-28');
});
