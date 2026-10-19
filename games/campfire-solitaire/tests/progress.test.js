import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, defaultSave, loadSave, writeSave, sanitize, recordLevel, recordDaily, recordQuick, noteStreak,
  totalStars, dailyStreak, bestDailyStreak, BACKS, DECOR, hasBack, hasDecor, activeBack, unlockedIds, gearName,
} from '../src/progress.js';
import { LEVEL_COUNT } from '../src/deals.js';

function memory(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('a fresh save, and a round trip through storage', () => {
  const store = memory();
  assert.deepEqual(loadSave(store), defaultSave());
  const save = defaultSave();
  recordLevel(save, 0, { score: 4200, stars: 2, maxStreak: 6 });
  assert.ok(writeSave(store, save));
  assert.ok(SAVE_KEY in store.data);
  assert.deepEqual(loadSave(store), save);
});

test('blocked or corrupt storage loads defaults and never throws', () => {
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadSave(throwing), defaultSave());
  assert.equal(writeSave(throwing, defaultSave()), false);
  assert.deepEqual(loadSave(memory({ [SAVE_KEY]: '{not json' })), defaultSave());
  assert.deepEqual(loadSave(memory({ [SAVE_KEY]: '[1,2]' })), defaultSave());
  assert.deepEqual(loadSave(null), defaultSave());
});

test('damaged fields are dropped one by one, keeping the good ones', () => {
  const save = sanitize({
    unlocked: 9999,
    stars: { 0: 3, 1: 7, 2: 'x', 99: 2, '-1': 1, 3: 2 },
    best: { 0: 5000, 1: -4, 2: NaN, 3: 1e99 },
    daily: { '2026-10-08': 3000, '2026-13-40': 10, nope: 5, '2026-10-07': -1 },
    quickBest: 'lots',
    quickWins: 2.5,
    bestStreak: 400,
    wins: 12,
    back: 'hacker',
    muted: 'yes',
    music: false,
  });
  assert.equal(save.unlocked, LEVEL_COUNT - 1);
  assert.deepEqual(save.stars, { 0: 3, 3: 2 });
  assert.deepEqual(save.best, { 0: 5000, 3: 1e7 });
  assert.deepEqual(save.daily, { '2026-10-08': 3000 });
  assert.equal(save.quickBest, 0);
  assert.equal(save.quickWins, 0);
  assert.equal(save.bestStreak, 52);
  assert.equal(save.wins, 12);
  assert.equal(save.back, 'plaid');
  assert.equal(save.muted, false);
  assert.equal(save.music, false);
  // A starred level opens the next one even if `unlocked` was lost.
  assert.equal(sanitize({ stars: { 4: 1 } }).unlocked, 5);
});

test('level results: stars and bests only go up, and the next level opens', () => {
  const save = defaultSave();
  const a = recordLevel(save, 0, { score: 3000, stars: 2, maxStreak: 5 });
  assert.ok(a.firstClear && a.newStars && a.unlockedNew);
  assert.equal(a.newBest, false, 'no "new best" on a first clear');
  assert.equal(save.unlocked, 1);
  const b = recordLevel(save, 0, { score: 2000, stars: 1, maxStreak: 3 });
  assert.ok(!b.newStars && !b.newBest && !b.firstClear);
  assert.equal(save.stars[0], 2);
  assert.equal(save.best[0], 3000);
  const c = recordLevel(save, 0, { score: 5000, stars: 3, maxStreak: 9 });
  assert.ok(c.newStars && c.newBest && c.streakBest);
  assert.equal(totalStars(save), 3);
  assert.equal(save.bestStreak, 9);
  assert.equal(save.wins, 3);
});

test('the last level does not open past the end of the trail', () => {
  const save = defaultSave();
  save.unlocked = LEVEL_COUNT - 1;
  recordLevel(save, LEVEL_COUNT - 1, { score: 1, stars: 1, maxStreak: 1 });
  assert.equal(save.unlocked, LEVEL_COUNT - 1);
});

test('the daily streak is gentle: alive until a whole day is missed', () => {
  const save = defaultSave();
  const day = (d) => new Date(2026, 9, d, 15);
  recordDaily(save, '2026-10-06', { score: 1000, maxStreak: 3 }, day(6));
  recordDaily(save, '2026-10-07', { score: 1000, maxStreak: 3 }, day(7));
  const r = recordDaily(save, '2026-10-08', { score: 1500, maxStreak: 3 }, day(8));
  assert.equal(r.streak, 3);
  assert.ok(r.first);
  assert.deepEqual(dailyStreak(save, day(8)), { streak: 3, doneToday: true });
  assert.deepEqual(dailyStreak(save, day(9)), { streak: 3, doneToday: false }, 'today not played yet');
  assert.deepEqual(dailyStreak(save, day(10)), { streak: 0, doneToday: false }, 'a whole day missed');
  const again = recordDaily(save, '2026-10-08', { score: 2500, maxStreak: 3 }, day(8));
  assert.ok(!again.first && again.newBest);
  assert.equal(save.daily['2026-10-08'], 2500);
  recordDaily(save, '2026-10-10', { score: 100, maxStreak: 1 }, day(10));
  assert.equal(dailyStreak(save, day(10)).streak, 1);
  assert.equal(bestDailyStreak(save), 3);
});

test('the streak counts across a month end', () => {
  const save = defaultSave();
  save.daily = { '2026-10-30': 1, '2026-10-31': 1, '2026-11-01': 1 };
  assert.equal(dailyStreak(save, new Date(2026, 10, 1, 8)).streak, 3);
  assert.equal(bestDailyStreak(save), 3);
});

test('quick deal bests and the longest streak', () => {
  const save = defaultSave();
  assert.equal(recordQuick(save, { score: 900, maxStreak: 4 }).newBest, false);
  assert.equal(recordQuick(save, { score: 1900, maxStreak: 2 }).newBest, true);
  assert.equal(save.quickBest, 1900);
  assert.equal(save.quickWins, 2);
  assert.equal(noteStreak(save, 3), false);
  assert.equal(noteStreak(save, 11), true);
  assert.equal(save.bestStreak, 11);
});

test('camp gear unlocks from progress, generously, and is reported once', () => {
  const save = defaultSave();
  assert.deepEqual([...unlockedIds(save)], ['back:plaid']);
  let unlocks = [];
  for (let i = 0; i < 8; i++) unlocks.push(...recordLevel(save, i, { score: 1000, stars: 1, maxStreak: 2 }).unlocks);
  assert.ok(unlocks.includes('decor:lanterns'));
  assert.ok(unlocks.includes('decor:tent'));
  assert.ok(unlocks.includes('decor:guitar'), 'finishing Pine Hollow');
  assert.ok(unlocks.includes('back:starry'), '8 stars');
  assert.equal(new Set(unlocks).size, unlocks.length, 'no unlock is announced twice');
  const daily = recordDaily(save, '2026-10-09', { score: 10, maxStreak: 8 }, new Date(2026, 9, 9));
  assert.ok(daily.unlocks.includes('decor:marshmallows'));
  assert.ok(daily.unlocks.includes('decor:fireflies'), 'a streak of 8');
  assert.ok(hasDecor(save, 'tent') && !hasDecor(save, 'telescope'));
  assert.equal(gearName('back:starry'), 'Starry Night card back');
  assert.equal(gearName('decor:owl'), 'Owl');
});

test('the chosen back must be earned, or the blanket is used', () => {
  const save = defaultSave();
  save.back = 'aurora';
  assert.equal(activeBack(save), 'plaid');
  for (let i = 0; i < LEVEL_COUNT; i++) save.stars[i] = 2;
  assert.ok(hasBack(save, 'aurora'));
  assert.equal(activeBack(save), 'aurora');
  assert.ok(BACKS.filter((b) => b.id !== 'embers').every((b) => b.test(save)), 'a full trail earns every back but the daily one');
  assert.ok(DECOR.filter((d) => d.id !== 'fireflies' && d.id !== 'marshmallows').every((d) => d.test(save)));
});
