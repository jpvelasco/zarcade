import test from 'node:test';
import assert from 'node:assert/strict';
import { Zoo, newState } from '../src/zoo.js';
import { simulate } from '../src/bot.js';
import { BIOMES, ANIMALS } from '../src/data.js';

function run(seed, seconds, opts = {}) {
  const zoo = new Zoo(newState(seed));
  const unlockedAt = [0];
  simulate(zoo, seconds, { ...opts, onSecond: (t, z) => { if (z.state.unlocked > unlockedAt.length) unlockedAt.push(t); } });
  return { zoo, unlockedAt };
}

test('an active keeper opens the Savanna within ten minutes and every biome within two hours', () => {
  for (const seed of [1, 2, 3]) {
    const { zoo, unlockedAt } = run(seed, 2 * 3600);
    assert.ok(unlockedAt[1] < 10 * 60, `seed ${seed} savanna at ${unlockedAt[1]}`);
    assert.equal(zoo.state.unlocked, BIOMES.length, `seed ${seed} unlocked ${zoo.state.unlocked}`);
  }
});

test('progress is not instant: the Night House takes a good while', () => {
  const { unlockedAt } = run(1, 2 * 3600);
  assert.ok(unlockedAt[5] > 30 * 60, `night house at ${unlockedAt[5]}`);
});

test('an idle keeper who never pets still finishes the whole collection', () => {
  const { zoo } = run(2, 7 * 3600, { pets: false });
  assert.equal(zoo.ownedCount(), ANIMALS.length);
});

test('the same seed plays out the same way', () => {
  const a = run(7, 900).zoo.state;
  const b = run(7, 900).zoo.state;
  assert.deepEqual(a.order, b.order);
  assert.equal(Math.round(a.coins), Math.round(b.coins));
});
