import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADES,
  buyUpgrade,
  defaultSave,
  paintFor,
  statsFor,
  upgradeCost,
} from '../src/progress.js';

test('new saves include every upgrade and a valid paint', () => {
  const save = defaultSave();
  assert.deepEqual(Object.keys(save.upgrades), Object.keys(UPGRADES));
  assert.equal(paintFor(save).id, 'cyan');
});

test('upgrades spend credits and improve simulation stats', () => {
  const save = defaultSave();
  save.credits = 10_000;
  const before = statsFor(save.upgrades);
  assert.equal(buyUpgrade(save, 'fins'), true);
  assert.equal(save.upgrades.fins, 1);
  assert.ok(save.credits < 10_000);
  assert.ok(statsFor(save.upgrades).driftGain > before.driftGain);
});

test('upgrades cannot be bought without credits or beyond their maximum', () => {
  const save = defaultSave();
  assert.equal(buyUpgrade(save, 'echo'), false);
  save.credits = 100_000;
  while (upgradeCost(save, 'echo') !== null) assert.equal(buyUpgrade(save, 'echo'), true);
  assert.equal(upgradeCost(save, 'echo'), null);
  assert.equal(buyUpgrade(save, 'echo'), false);
});
