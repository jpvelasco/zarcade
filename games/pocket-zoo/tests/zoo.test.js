import test from 'node:test';
import assert from 'node:assert/strict';
import { Zoo, newState, normalize } from '../src/zoo.js';
import { loadSave, writeSave, STORAGE_KEY } from '../src/save.js';
import { JOY, MAX_LEVEL, DECOS, BIOMES } from '../src/data.js';
import { taskDone } from '../src/tasks.js';

const rich = (seed = 1) => { const z = new Zoo(newState(seed)); z.state.coins = 1e12; return z; };

test('a new zoo has a free habitat, a gift egg and three tasks', () => {
  const zoo = new Zoo(newState(1));
  assert.equal(zoo.habitat(0).level, 1);
  assert.equal(zoo.state.giftEggs, 1);
  assert.equal(zoo.state.tasks.list.length, 3);
  assert.equal(new Set(zoo.state.tasks.list.map((t) => t.type)).size, 3);
});

test('the first egg hatches into the starter habitat and earns coins', () => {
  const zoo = new Zoo(newState(1));
  const res = zoo.useGiftEgg(0);
  assert.ok(res.ok && res.isNew);
  assert.equal(res.home, 0);
  assert.equal(zoo.habitat(0).animals.length, 1);
  const before = zoo.coins;
  zoo.tick(10);
  assert.ok(zoo.coins > before);
});

test('buying needs coins and never goes negative', () => {
  const zoo = new Zoo(newState(1));
  zoo.state.coins = 5;
  assert.equal(zoo.buyEgg(0).ok, false);
  assert.equal(zoo.build(1).ok, false);
  assert.equal(zoo.coins, 5);
});

test('animals wait for a home, then move in when space opens', () => {
  const zoo = rich();
  let waited = null;
  for (let n = 0; n < 30 && !waited; n++) { const r = zoo.buyEgg(0); if (r.waiting) waited = r.id; }
  assert.ok(waited, 'filled the starter habitat');
  assert.ok(zoo.state.waiting.includes(waited));
  zoo.build(1);
  assert.ok(!zoo.state.waiting.includes(waited));
  assert.ok(zoo.habitat(1).animals.includes(waited));
});

test('duplicates add stars up to five', () => {
  const zoo = rich();
  for (let n = 0; n < 200; n++) zoo.buyEgg(0);
  const stars = Object.values(zoo.state.animals).map((a) => a.stars);
  assert.ok(stars.some((s) => s > 1));
  assert.ok(stars.every((s) => s >= 1 && s <= 5));
});

test('upgrades raise capacity and stop at the top level', () => {
  const zoo = rich();
  for (let l = 1; l < MAX_LEVEL; l++) assert.equal(zoo.upgrade(0).ok, true);
  assert.equal(zoo.habitat(0).level, MAX_LEVEL);
  assert.equal(zoo.upgrade(0).ok, false);
  assert.equal(zoo.capacity(0), 4);
});

test('petting and snacks raise Joy, which fades back gently', () => {
  const zoo = rich();
  zoo.useGiftEgg(0);
  zoo.pet(0);
  assert.equal(zoo.habitat(0).joy, JOY.pet);
  zoo.feed(0);
  assert.equal(zoo.habitat(0).joy, JOY.pet + JOY.snack);
  zoo.tick(1000);
  assert.equal(zoo.habitat(0).joy, 0);
  assert.equal(zoo.feed(1).ok, false, 'no snacks for an empty habitat');
});

test('biome unlocks come with a habitat and in order', () => {
  const zoo = rich();
  assert.equal(zoo.isUnlocked(1), false);
  assert.equal(zoo.buyEgg(1).ok, false);
  const r = zoo.unlockNext();
  assert.equal(r.biome, 1);
  assert.equal(zoo.habitat(3).level, 1);
  assert.ok(zoo.buyEgg(1).ok);
  for (let b = 2; b < BIOMES.length; b++) zoo.unlockNext();
  assert.equal(zoo.unlockNext().ok, false);
});

test('decorations: buy once, place, move, swap and store', () => {
  const zoo = rich();
  assert.ok(zoo.buyDeco('flowers').ok);
  assert.equal(zoo.buyDeco('flowers').ok, false);
  assert.ok(zoo.placeDeco('flowers', 0).ok);
  assert.ok(zoo.decoBonus() > 0);
  assert.equal(zoo.placeDeco('flowers', 5).ok, false, 'locked biome spot');
  zoo.placeDeco('flowers', 1);
  assert.equal(zoo.decoAt(0), null);
  zoo.buyDeco('bench');
  assert.equal(zoo.placeDeco('bench', 1).replaced, 'flowers');
  assert.ok(zoo.storeDeco('bench').ok);
  assert.equal(zoo.decoBonus(), 0);
  assert.equal(DECOS.length, 12);
});

test('tasks track progress, pay out and refill', () => {
  const zoo = rich();
  zoo.useGiftEgg(0);
  zoo.state.tasks.list = [{ n: 0, type: 'pet', goal: 3, progress: 0, reward: { coins: 50 } }];
  for (let k = 0; k < 3; k++) zoo.pet(0);
  assert.ok(taskDone(zoo.state.tasks.list[0]));
  assert.ok(zoo.events.some((e) => e.type === 'taskDone'));
  const coins = zoo.coins;
  assert.ok(zoo.claimTask(0).ok);
  assert.equal(zoo.coins, coins + 50);
  assert.equal(zoo.claimTask(0).ok, false, 'new task starts at zero');
});

test('biome egg tasks only count eggs from that biome', () => {
  const zoo = rich();
  zoo.unlockNext();
  zoo.state.tasks.list = [{ n: 0, type: 'biomeEgg', biome: 1, goal: 1, progress: 0, reward: { egg: 1 } }];
  zoo.buyEgg(0);
  assert.equal(zoo.state.tasks.list[0].progress, 0);
  zoo.buyEgg(1);
  assert.equal(zoo.state.tasks.list[0].progress, 1);
});

test('task sequence is deterministic for the same zoo', () => {
  const a = newState(5);
  const b = newState(5);
  assert.deepEqual(a.tasks.list, b.tasks.list);
});

test('the daily star egg: once a day, streaks, never common', () => {
  const zoo = rich();
  const r1 = zoo.claimDaily('2026-10-01');
  assert.ok(r1.ok);
  assert.notEqual(r1.animal.rarity, 'common');
  assert.equal(r1.streak, 1);
  assert.equal(zoo.claimDaily('2026-10-01').ok, false);
  assert.equal(zoo.claimDaily('2026-10-02').streak, 2);
  assert.equal(zoo.claimDaily('2026-10-09').streak, 1);
  assert.equal(zoo.state.daily.best, 2);
});

test('rank-ups give gift eggs', () => {
  const zoo = rich();
  const eggs = zoo.state.giftEggs;
  for (let n = 0; n < 6; n++) zoo.buyEgg(0);
  zoo.build(1);
  zoo.upgrade(0);
  assert.ok(zoo.state.rank >= 1);
  assert.ok(zoo.state.giftEggs >= eggs + zoo.state.rank);
});

test('save round trip and offline earnings', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const zoo = rich();
  zoo.useGiftEgg(0);
  zoo.state.coins = 100;
  assert.ok(writeSave(storage, zoo.state, 1_000_000));
  assert.ok(store.has(STORAGE_KEY));
  const { state, fresh } = loadSave(storage);
  assert.equal(fresh, false);
  assert.deepEqual(state.habitats[0].animals, zoo.state.habitats[0].animals);
  const back = new Zoo(state);
  const res = back.applyOffline(1_000_000 + 3_600_000);
  assert.ok(res.coins > 0);
  assert.equal(Math.round(back.coins), 100 + res.coins);
});

test('broken or blocked storage starts a fresh zoo', () => {
  const bad = { getItem: () => '{not json', setItem: () => { throw new Error('full'); } };
  assert.equal(loadSave(bad).fresh, true);
  assert.equal(writeSave(bad, newState(1)), false);
  assert.equal(loadSave(null).fresh, true);
  const blocked = { getItem: () => { throw new Error('blocked'); } };
  assert.equal(loadSave(blocked).fresh, true);
});

test('normalize repairs odd saves', () => {
  const s = normalize({ coins: -5, unlocked: 99, habitats: [{ level: 9, joy: 500, animals: ['bunny', 'nope'] }], animals: { bunny: { stars: 12 }, ghost: { stars: 1 } } });
  assert.equal(s.coins, 0);
  assert.equal(s.unlocked, BIOMES.length);
  assert.equal(s.habitats[0].level, MAX_LEVEL);
  assert.equal(s.habitats[0].joy, JOY.max);
  assert.deepEqual(s.habitats[0].animals, ['bunny']);
  assert.equal(s.animals.bunny.stars, 5);
  assert.equal(s.animals.ghost, undefined);
});
