import test from 'node:test';
import assert from 'node:assert/strict';
import { rollEgg, rarityWeights, dayKey, dailyBiome, nextStreak, dayNumber } from '../src/eggs.js';
import { Zoo, newState } from '../src/zoo.js';
import { Rng } from '../src/rng.js';
import { animalsOf, BIOMES, PITY_RARE, PITY_LEGEND } from '../src/data.js';

test('egg rolls are deterministic for a seed', () => {
  const run = () => {
    const s = newState(9);
    const rng = new Rng(42);
    return Array.from({ length: 30 }, () => rollEgg(s, 0, rng).id).join(',');
  };
  assert.equal(run(), run());
});

test('pity guarantees a rare within seven eggs and the legendary within twenty', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = newState(seed);
    const rng = new Rng(seed * 31);
    let sinceRare = 0;
    let legendAt = -1;
    for (let n = 0; n < PITY_LEGEND; n++) {
      const a = rollEgg(s, 2, rng);
      s.animals[a.id] = s.animals[a.id] || { stars: 1 };
      sinceRare = a.rarity === 'rare' || a.rarity === 'legendary' ? 0 : sinceRare + 1;
      assert.ok(sinceRare < PITY_RARE, `seed ${seed}`);
      if (a.rarity === 'legendary' && legendAt < 0) legendAt = n;
    }
    assert.ok(legendAt >= 0, `seed ${seed} found the legendary`);
  }
});

test('daily eggs are never common', () => {
  const s = newState(1);
  assert.equal(rarityWeights(s, 0, { daily: true })[0], 0);
});

test('every biome collection completes with enough eggs', () => {
  for (let b = 0; b < BIOMES.length; b++) {
    const zoo = new Zoo(newState(b + 3));
    zoo.state.unlocked = BIOMES.length;
    zoo.state.giftEggs = 60;
    let n = 0;
    while (!zoo.biomeComplete(b) && n < 60) { zoo.useGiftEgg(b); n++; }
    assert.ok(zoo.biomeComplete(b), `${BIOMES[b].id} complete after ${n}`);
    assert.ok(n <= 45, `${BIOMES[b].id} took ${n} eggs`);
    assert.equal(zoo.ownedCount(b), animalsOf(BIOMES[b].id).length);
  }
});

test('day keys, featured biome and gentle streaks', () => {
  assert.equal(dayKey(new Date(2026, 9, 1)), '2026-10-01');
  assert.equal(dayNumber('2026-10-02') - dayNumber('2026-10-01'), 1);
  assert.equal(dailyBiome('2026-10-01', 1), 0);
  assert.equal(dailyBiome('2026-10-01', 4), dailyBiome('2026-10-01', 4));
  assert.ok(dailyBiome('2026-10-01', 6) < 6);
  assert.equal(nextStreak({ last: '', streak: 0 }, '2026-10-01'), 1);
  assert.equal(nextStreak({ last: '2026-09-30', streak: 4 }, '2026-10-01'), 5);
  assert.equal(nextStreak({ last: '2026-09-25', streak: 4 }, '2026-10-01'), 1);
  assert.equal(nextStreak({ last: '2026-12-31', streak: 2 }, '2027-01-01'), 3);
});
