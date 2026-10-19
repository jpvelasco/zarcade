import test from 'node:test';
import assert from 'node:assert/strict';
import { animalRate, joyMult, totalRate, eggPrice, offlineEarnings, niceRound, fmt, fmtDuration } from '../src/economy.js';
import { newState, normalize, Zoo } from '../src/zoo.js';
import { simulate } from '../src/bot.js';
import { OFFLINE_CAP_S, OFFLINE_FRESH_S, OFFLINE_PURSE_S, OFFLINE_RATE, EGG_MAX_MULT, BIOMES } from '../src/data.js';

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

test('offline earnings: a share of the base rate, slowing down, capped, never odd', () => {
  const s = newState(1);
  s.animals.bunny = { stars: 1 };
  s.habitats[0].animals.push('bunny');
  s.habitats[0].joy = 100; // Joy does not count while away
  s.lastSeen = 1_000_000;
  const rate = totalRate(s, { joy: false });
  const at = (ms) => offlineEarnings(s, 1_000_000 + ms);
  assert.equal(at(30_000).coins, 0);
  assert.equal(at(-999_000).coins, 0);
  // the first minutes pay OFFLINE_RATE of the base income, below active play
  assert.equal(at(600_000).coins, Math.floor(rate * 600 * OFFLINE_RATE));
  assert.ok(OFFLINE_RATE <= 0.5 && at(600_000).coins < rate * 600 * 0.5);
  assert.equal(at(600_000).capped, false);
  // later time pays less per minute
  const first = at(OFFLINE_FRESH_S * 1000).coins;
  assert.ok(at(2 * OFFLINE_FRESH_S * 1000).coins - first < first * 0.2);
  // never more than the purse, and nothing extra past the time cap
  const long = at(48 * 3_600_000);
  assert.ok(long.coins <= rate * OFFLINE_PURSE_S);
  assert.equal(long.seconds, OFFLINE_CAP_S);
  assert.equal(long.capped, true);
  assert.equal(long.coins, at(OFFLINE_CAP_S * 1000).coins);
  // the purse no longer grows to the next biome's price
  assert.ok(long.coins < BIOMES[1].unlock);
});

test('offline earnings: odd timestamps and saves never give negative or NaN coins', () => {
  const s = newState(1);
  s.animals.bunny = { stars: 1 };
  s.habitats[0].animals.push('bunny');
  const now = 5_000_000_000;
  for (const lastSeen of [0, -5, NaN, Infinity, -Infinity, 'x', null, undefined, now + 3_600_000, now * 10, 1e300]) {
    s.lastSeen = lastSeen;
    const r = offlineEarnings(s, now);
    assert.ok(Number.isFinite(r.coins) && r.coins >= 0, `lastSeen ${lastSeen}: ${r.coins}`);
    assert.ok(Number.isFinite(r.seconds) && r.seconds >= 0);
    if (!(+lastSeen > 0) || lastSeen >= now) assert.equal(r.coins, 0);
  }
  s.lastSeen = 1_000_000;
  for (const bad of [NaN, Infinity, -Infinity, undefined]) {
    const r = offlineEarnings(s, bad);
    assert.ok(Number.isFinite(r.coins) && r.coins >= 0);
  }
  // a damaged lastSeen in a save is cleaned up when it loads
  for (const raw of ['soon', NaN, -1, {}, Infinity]) assert.equal(normalize({ lastSeen: raw }).lastSeen, 0);
  assert.equal(normalize({ lastSeen: 1234 }).lastSeen, 1234);
});

test('offline earnings at early stages stay a bonus: small next to active play, one biome at most', () => {
  for (const seed of [1, 2]) {
    const zoo = new Zoo(newState(seed));
    let t = 0;
    for (const minutes of [5, 15, 30, 60]) {
      simulate(zoo, minutes * 60 - t);
      t = minutes * 60;
      const s = zoo.state;
      s.lastSeen = 1_000_000;
      const probe = new Zoo(JSON.parse(JSON.stringify(s)));
      probe.tick(60);
      const perMinute = probe.state.coins - s.coins; // active play, with Joy, no spending
      for (const hours of [1 / 6, 1, 8, 24]) {
        const { coins } = offlineEarnings(s, 1_000_000 + hours * 3_600_000);
        assert.ok(coins >= 0 && Number.isFinite(coins));
        const label = `seed ${seed} at ${minutes} min, ${hours} h away: ${coins}`;
        assert.ok(coins <= perMinute * 10, `${label} is over 10 minutes of play`);
        if (hours <= 1 / 6) assert.ok(coins <= perMinute * 600 / 60 * 0.5, `${label} is over half of active income`);
      }
    }
  }
});

test('a night away after a few minutes of play opens at most one more biome', () => {
  for (const seed of [1, 2, 3]) {
    for (const minutes of [2, 5, 10, 20]) {
      const zoo = new Zoo(newState(seed));
      simulate(zoo, minutes * 60);
      const s = zoo.state;
      s.lastSeen = 1_000_000;
      const { coins } = offlineEarnings(s, 1_000_000 + 8 * 3_600_000);
      let b = s.unlocked;
      let left = coins + s.coins;
      while (b < BIOMES.length && left >= BIOMES[b].unlock) left -= BIOMES[b].unlock, b++;
      assert.ok(b - s.unlocked <= 1, `seed ${seed} after ${minutes} min: ${coins} coins opens ${b - s.unlocked} biomes`);
      assert.ok(coins > 0);
    }
  }
});

test('number formatting stays short and friendly', () => {
  assert.equal(fmt(950), '950');
  assert.equal(fmt(9999), '9,999');
  assert.equal(fmt(12345), '12.3K');
  assert.equal(fmt(2_500_000), '2.5M');
  assert.equal(fmt(1_000_000_000), '1B');
  // whole numbers keep their zeros
  assert.equal(fmt(100_000), '100K');
  assert.equal(fmt(120_000), '120K');
  assert.equal(fmt(200_000), '200K');
  assert.equal(fmt(200_000_000), '200M');
  assert.equal(fmt(20_000), '20K');
  assert.equal(fmt(999_999), '1M');
  assert.equal(niceRound(1234), 1200);
  assert.equal(niceRound(7.4), 7);
  assert.equal(fmtDuration(3 * 3600 + 12 * 60), '3 h 12 min');
});
