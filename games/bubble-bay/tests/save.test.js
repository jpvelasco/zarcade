import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, defaultSave, recordWin, recordDaily, currentStreak, previousKey, addOtters, useBooster, addBooster, BOOSTER_CAP, SAVE_KEY } from '../src/save.js';

function memory() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

test('saves round-trip under the namespaced key', () => {
  const store = memory();
  const save = defaultSave();
  save.stars[3] = 2;
  save.otters.push(4);
  assert.ok(writeSave(store, save));
  assert.ok(store.data.has(SAVE_KEY));
  assert.equal(SAVE_KEY, 'bubble-bay.v1');
  const back = loadSave(store);
  assert.equal(back.stars[3], 2);
  assert.deepEqual(back.otters, [4]);
});

test('broken or blocked storage falls back to a fresh save', () => {
  assert.deepEqual(loadSave(null), defaultSave());
  assert.deepEqual(loadSave({ getItem() { throw new Error('blocked'); } }), defaultSave());
  const store = memory();
  store.setItem(SAVE_KEY, '{not json');
  assert.deepEqual(loadSave(store), defaultSave());
  store.setItem(SAVE_KEY, JSON.stringify({ otters: [1, 1, 99, 'x'], boosters: { bomb: 50 }, unlocked: -4 }));
  const fixed = loadSave(store);
  assert.deepEqual(fixed.otters, [1]);
  assert.equal(fixed.boosters.bomb, BOOSTER_CAP);
  assert.equal(fixed.unlocked, 1);
  assert.equal(writeSave({ setItem() { throw new Error('full'); } }, fixed), false);
});

test('wins only ever raise stars and bests, unlock the next level, and earn boosters', () => {
  const save = defaultSave();
  const first = recordWin(save, 3, { score: 500, stars: 2 });
  assert.ok(first.firstClear && first.newBest);
  assert.equal(save.unlocked, 4);
  assert.deepEqual(first.rewards.length, 1, 'level 3 first clear earns a booster');
  const worse = recordWin(save, 3, { score: 100, stars: 1 });
  assert.equal(save.stars[3], 2);
  assert.equal(save.best[3], 500);
  assert.ok(!worse.newBest);
  assert.equal(save.unlocked, 4);
  const three = recordWin(save, 3, { score: 900, stars: 3 });
  assert.equal(three.rewards.length, 1, 'a new three-star result earns one');
  assert.equal(recordWin(save, 3, { score: 950, stars: 3 }).rewards.length, 0, 'but only once');
});

test('boosters are spent one at a time and capped', () => {
  const save = defaultSave();
  assert.ok(useBooster(save, 'bomb'));
  assert.ok(!useBooster(save, 'bomb'));
  addBooster(save, 'zap', 100);
  assert.equal(save.boosters.zap, BOOSTER_CAP);
});

test('otters join the collection once', () => {
  const save = defaultSave();
  assert.deepEqual(addOtters(save, [2, 5, 2]), [2, 5]);
  assert.deepEqual(addOtters(save, [5, 7]), [7]);
  assert.deepEqual(save.otters, [2, 5, 7]);
});

test('the daily streak grows day by day and gently resets after a gap', () => {
  assert.equal(previousKey('2026-10-01'), '2026-09-30');
  assert.equal(previousKey('2026-01-01'), '2025-12-31');
  const save = defaultSave();
  assert.equal(recordDaily(save, '2026-10-01', { score: 100, won: true }).streak, 1);
  assert.equal(recordDaily(save, '2026-10-01', { score: 300, won: true }).firstToday, false);
  assert.equal(save.daily.best, 300);
  assert.equal(recordDaily(save, '2026-10-02', { score: 50, won: true }).streak, 2);
  assert.equal(currentStreak(save, '2026-10-03'), 2, 'still alive the next day');
  assert.equal(currentStreak(save, '2026-10-05'), 0, 'quietly gone after a gap');
  assert.equal(recordDaily(save, '2026-10-05', { score: 50, won: true }).streak, 1);
  assert.equal(save.daily.bestStreak, 2);
  assert.equal(recordDaily(save, '2026-10-06', { score: 50, won: false }).firstToday, false);
});
