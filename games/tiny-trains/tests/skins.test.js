import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, isUnlocked, ruleText, unlockedSkins, skinByKey } from '../src/skins.js';

test('skins have unique keys and the first is free', () => {
  assert.equal(new Set(SKINS.map((s) => s.key)).size, SKINS.length);
  assert.ok(SKINS.length >= 8);
  assert.deepEqual(unlockedSkins({}), ['puffer']);
  assert.equal(skinByKey('nope').key, 'puffer');
});

test('unlock rules read nicely and can all be met', () => {
  const all = { stars: 144, worldsDone: [0, 1, 2, 3, 4, 5], dailies: 9, bestStreak: 9, sandboxRuns: 1 };
  for (const s of SKINS) {
    assert.ok(isUnlocked(s, all), s.key);
    assert.ok(ruleText(s.rule, ['A', 'B', 'C', 'D', 'E', 'F']).length > 3);
  }
  assert.equal(ruleText({ stars: 12 }), 'Earn 12 ★');
  assert.ok(!isUnlocked(skinByKey('rocket'), { stars: 44 }));
});
