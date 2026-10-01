import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, defaultSave, loadSave, writeSave, recordLevel, recordDaily, dayBefore, totalStars, totalCritters } from '../src/save.js';
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
