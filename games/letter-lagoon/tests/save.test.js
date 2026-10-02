import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, defaultSave, loadSave, writeSave, recordLevel, recordDaily, dayBefore, totalStars, totalCritters, adoptSave, liveStreak } from '../src/save.js';
import { getLevel, dailyLevel, LEVEL_COUNT } from '../src/levels.js';

function memory() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

test('saves round-trip under the namespaced key', () => {
  const store = memory();
  const save = defaultSave();
  save.coins = 99;
  assert.ok(writeSave(store, save));
  assert.ok(store.data.has('letter-lagoon.v1'));
  assert.equal(SAVE_KEY, 'letter-lagoon.v1');
  assert.equal(loadSave(store).coins, 99);
});

test('broken or blocked storage falls back to a fresh save', () => {
  const broken = memory();
  broken.setItem(SAVE_KEY, '{nope');
  assert.deepEqual(loadSave(broken), defaultSave());
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(throwing), defaultSave());
  assert.equal(writeSave(throwing, defaultSave()), false);
  assert.deepEqual(loadSave(null), defaultSave());
  const odd = memory();
  odd.setItem(SAVE_KEY, JSON.stringify({ unlocked: 9999, coins: -5, critters: { dragon: 3, turtle: 2 }, daily: 'x' }));
  const fixed = loadSave(odd);
  assert.equal(fixed.unlocked, LEVEL_COUNT);
  assert.equal(fixed.coins, 0);
  assert.deepEqual(fixed.critters, { turtle: 2 });
  assert.equal(fixed.daily.streak, 0);
});

test('clearing a level unlocks the next, keeps best stars, rescues critters once', () => {
  const save = defaultSave();
  const level = getLevel(1);
  const first = recordLevel(save, level, { score: 100, stars: 2, rescued: 3, relax: false });
  assert.ok(first.first && first.improved);
  assert.equal(save.unlocked, 2);
  assert.equal(totalStars(save), 2);
  assert.equal(totalCritters(save), 3);
  recordLevel(save, level, { score: 50, stars: 1, rescued: 3, relax: false });
  assert.equal(save.stars[1], 2, 'stars never go down');
  assert.equal(save.best[1], 100);
  assert.equal(totalCritters(save), 3, 'replays do not add critters');
  recordLevel(save, getLevel(2), { score: 80, stars: 0, rescued: 3, relax: true });
  assert.equal(save.stars[2], undefined, 'relax mode records no stars');
  assert.equal(save.unlocked, 3, 'relax still unlocks');
});

test('daily streaks count consecutive days', () => {
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2027-01-01'), '2026-12-31');
  const save = defaultSave();
  assert.equal(recordDaily(save, dailyLevel('2026-10-01'), { rescued: 5 }).streak, 1);
  assert.equal(recordDaily(save, dailyLevel('2026-10-01'), { rescued: 5 }).already, true);
  assert.equal(recordDaily(save, dailyLevel('2026-10-02'), { rescued: 5 }).streak, 2);
  assert.equal(recordDaily(save, dailyLevel('2026-10-05'), { rescued: 5 }).streak, 1);
  assert.equal(totalCritters(save), 15);
});

test('damaged fields are repaired one by one', () => {
  const store = memory();
  store.setItem(SAVE_KEY, JSON.stringify({
    unlocked: 5, coins: 'rich', plays: 'many', words: 'lots', bonus: null,
    stars: { 1: 3, 2: 'x', 3: 99, 999: 3, foo: 2 },
    best: { 1: 140, foo: 2, 2: 'x' },
    critters: { clownfish: 'x', turtle: 2.7, whale: -4, dolphin: 1e12 },
  }));
  const save = loadSave(store);
  assert.equal(save.unlocked, 5);
  assert.equal(save.coins, 0);
  assert.equal(save.plays, 0);
  assert.equal(save.words, 0);
  assert.equal(save.bonus, 0);
  assert.deepEqual(save.stars, { 1: 3, 3: 3 });
  assert.deepEqual(save.best, { 1: 140 });
  assert.deepEqual(save.critters, { turtle: 2, dolphin: 1e6 });
  assert.equal(totalCritters(save), 1e6 + 2);
  assert.equal(totalStars(save), 6);
  save.plays++;
  save.words += 3;
  assert.equal(save.plays, 1);
  assert.equal(save.words, 3);
});

test('another tab\'s save replaces this tab\'s copy in place', () => {
  const mine = defaultSave();
  const fresh = defaultSave();
  recordLevel(fresh, getLevel(1), { score: 100, stars: 3, rescued: 3, relax: false });
  assert.equal(adoptSave(mine, fresh), mine);
  assert.equal(mine.unlocked, 2);
  assert.equal(mine.stars[1], 3);
});

test('a streak only shows while it is still alive', () => {
  const save = defaultSave();
  recordDaily(save, dailyLevel('2026-10-01'), { rescued: 1 });
  recordDaily(save, dailyLevel('2026-10-02'), { rescued: 1 });
  assert.equal(save.daily.streak, 2);
  assert.equal(liveStreak(save, '2026-10-02'), 2, 'done today');
  assert.equal(liveStreak(save, '2026-10-03'), 2, 'still alive tomorrow');
  assert.equal(liveStreak(save, '2026-10-05'), 0, 'broken after a missed day');
});
