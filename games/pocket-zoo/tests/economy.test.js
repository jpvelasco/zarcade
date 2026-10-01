import test from 'node:test';
import assert from 'node:assert/strict';
import { animalRate, joyMult, totalRate, eggPrice, offlineEarnings, niceRound, fmt, fmtDuration } from '../src/economy.js';
import { newState } from '../src/zoo.js';
import { OFFLINE_CAP_S, EGG_MAX_MULT, BIOMES } from '../src/data.js';

test('animal rates follow rarity, tier and stars', () => {
  assert.equal(animalRate('bunny'), 1);
  assert.equal(animalRate('unicorn'), 8);
  assert.equal(animalRate('zebra'), BIOMES[1].tier);
  assert.ok(Math.abs(animalRate('bunny', 3) - 1.4) < 1e-9);
});

test('joy only ever adds a bonus', () => {
  assert.equal(joyMult(0), 1);
  assert.equal(joyMult(100), 1.5);
  assert.equal(joyMult(-50), 1);
  assert.equal(joyMult(500), 1.5);
});

test('total rate sums placed animals with level and decorations', () => {
  const s = newState(1);
  assert.equal(totalRate(s), 0);
  s.animals.bunny = { stars: 1 };
  s.habitats[0].animals.push('bunny');
  assert.equal(totalRate(s), 1);
  s.habitats[0].level = 2;
  assert.ok(Math.abs(totalRate(s) - 1.3) < 1e-9);
  s.decos.owned.push('flowers');
  s.decos.placed[0] = 'flowers';
  assert.ok(Math.abs(totalRate(s) - 1.3 * 1.02) < 1e-9);
});

test('egg prices grow, then stop growing', () => {
  const s = newState(1);
  const p0 = eggPrice(s, 0);
  s.eggsBought[0] = 5;
  assert.ok(eggPrice(s, 0) > p0);
  s.eggsBought[0] = 500;
  assert.equal(eggPrice(s, 0), BIOMES[0].egg * EGG_MAX_MULT);
});

test('offline earnings: base rate, capped, nothing for short or backwards gaps', () => {
  const s = newState(1);
  s.animals.bunny = { stars: 1 };
  s.habitats[0].animals.push('bunny');
  s.habitats[0].joy = 100; // Joy does not count while away
  s.lastSeen = 1_000_000;
  assert.equal(offlineEarnings(s, 1_000_000 + 30_000).coins, 0);
  assert.equal(offlineEarnings(s, 1_000_000 - 999_000).coins, 0);
  assert.equal(offlineEarnings(s, 1_000_000 + 3_600_000).coins, 3600);
  const long = offlineEarnings(s, 1_000_000 + 48 * 3_600_000);
  assert.equal(long.coins, OFFLINE_CAP_S);
  assert.equal(long.capped, true);
});

test('number formatting stays short and friendly', () => {
  assert.equal(fmt(950), '950');
  assert.equal(fmt(9999), '9,999');
  assert.equal(fmt(12345), '12.3K');
  assert.equal(fmt(2_500_000), '2.5M');
  assert.equal(fmt(1_000_000_000), '1B');
  assert.equal(niceRound(1234), 1200);
  assert.equal(niceRound(7.4), 7);
  assert.equal(fmtDuration(3 * 3600 + 12 * 60), '3 h 12 min');
});
