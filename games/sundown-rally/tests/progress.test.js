import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, loadSave, writeSave, statsFor, buyUpgrade, upgradeCost, starsFor, recordFinish, SAVE_KEY } from '../src/progress.js';
import { BASE_STATS } from '../src/vehicle.js';
import { TRACKS } from '../src/tracks.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

test('save round-trips and tolerates junk', () => {
  const s = memoryStorage();
  const save = defaultSave();
  save.coins = 42;
  writeSave(s, save);
  assert.equal(loadSave(s).coins, 42);
  s.setItem(SAVE_KEY, '{not json');
  assert.deepEqual(loadSave(s), defaultSave());
});

test('upgrades cost coins and max out', () => {
  const save = defaultSave();
  save.coins = 1000;
  for (let i = 0; i < 3; i++) assert.equal(buyUpgrade(save, 'engine'), true);
  assert.equal(upgradeCost(save, 'engine'), null);
  assert.equal(buyUpgrade(save, 'engine'), false);
  assert.equal(save.coins, 1000 - 60 - 140 - 260);
  const poor = defaultSave();
  assert.equal(buyUpgrade(poor, 'armor'), false);
});

test('upgrades improve the jeep', () => {
  const s = statsFor({ engine: 3, armor: 3, nitro: 3, tires: 3 });
  assert.ok(s.maxSpeed > BASE_STATS.maxSpeed);
  assert.ok(s.armor < BASE_STATS.armor);
  assert.ok(s.nitroBurn < BASE_STATS.nitroBurn);
  assert.ok(s.offroadMax > BASE_STATS.offroadMax);
});

test('stars by time against par', () => {
  assert.equal(starsFor(70, 78), 3);
  assert.equal(starsFor(90, 78), 2);
  assert.equal(starsFor(200, 78), 1);
});

test('finishing unlocks the next track, keeps best stars and times', () => {
  const save = defaultSave();
  const par = TRACKS[0].par;
  const first = recordFinish(save, 0, { time: par * 1.5, coins: 10, kills: 10 });
  assert.equal(first.unlockedNext, true);
  assert.equal(save.unlocked, 2);
  assert.equal(first.stars, 1);
  assert.equal(save.coins, 10 + 5 + 15);
  const second = recordFinish(save, 0, { time: par - 1, coins: 0, kills: 0 });
  assert.equal(second.newBest, true);
  assert.equal(save.stars[TRACKS[0].id], 3);
  recordFinish(save, 0, { time: par * 2, coins: 0, kills: 0 });
  assert.equal(save.stars[TRACKS[0].id], 3, 'a worse run never lowers stars');
  assert.equal(save.best[TRACKS[0].id], par - 1);
});
