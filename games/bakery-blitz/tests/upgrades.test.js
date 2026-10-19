import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADES, UPGRADE_IDS, BRANCHES, TOTAL_COST, BASE_EFFECTS,
  canBuy, effects, getUpgrade, isAvailable, scaledTime, upgradesIn,
} from '../src/upgrades.js';
import { STATIONS } from '../src/recipes.js';

test('every upgrade is described, priced, and on a real branch', () => {
  assert.equal(new Set(UPGRADE_IDS).size, UPGRADES.length, 'two upgrades share an id');
  for (const up of UPGRADES) {
    assert.ok(up.name.length > 3, `${up.id} has no name`);
    assert.ok(up.desc.length > 10, `${up.id} has no description`);
    assert.ok(up.shop.length > 10, `${up.id} does not say what it looks like`);
    assert.ok(up.cost >= 100 && up.cost <= 3000, `${up.id} costs ${up.cost}`);
    assert.ok(BRANCHES.some((b) => b.id === up.branch), `${up.id} is on branch ${up.branch}`);
    if (up.requires) assert.ok(getUpgrade(up.requires), `${up.id} needs missing ${up.requires}`);
  }
  for (const branch of BRANCHES) {
    assert.ok(upgradesIn(branch.id).length >= 3, `branch ${branch.id} is thin`);
    assert.ok(branch.blurb.length > 10);
  }
});

test('prerequisites come before the things that need them, and never loop', () => {
  UPGRADES.forEach((up, i) => {
    if (!up.requires) return;
    const at = UPGRADES.findIndex((u) => u.id === up.requires);
    assert.ok(at < i, `${up.id} is listed before its prerequisite`);
  });
});

test('an upgrade only shows up once its prerequisite is owned', () => {
  assert.equal(isAvailable('mitts1', []), true);
  assert.equal(isAvailable('mitts2', []), false);
  assert.equal(isAvailable('mitts2', ['mitts1']), true);
  assert.equal(isAvailable('mitts1', ['mitts1']), false, 'already owned');
  assert.equal(canBuy('mitts1', [], getUpgrade('mitts1').cost - 1), false);
  assert.equal(canBuy('mitts1', [], getUpgrade('mitts1').cost), true);
});

test('the whole shop costs much less than a campaign earns', () => {
  assert.ok(TOTAL_COST > 8000 && TOTAL_COST < 20000, `the shop costs ${TOTAL_COST}`);
});

test('owning nothing gives the plain kitchen', () => {
  const eff = effects([]);
  assert.equal(eff.bakeScale, 1);
  assert.equal(eff.counterSlots, BASE_EFFECTS.counterSlots);
  assert.equal(eff.ovenCount, 1);
  assert.equal(eff.mixerCount, 1);
  assert.equal(eff.helper, false);
  for (const flag of Object.values(eff.decor)) assert.equal(flag, false);
});

test('each upgrade changes exactly what it says it does', () => {
  assert.ok(effects(['mitts1']).bakeScale < 1);
  assert.ok(effects(['mitts2', 'mitts1']).bakeScale < effects(['mitts1']).bakeScale);
  assert.equal(effects(['thermo']).holdBonus, 2.5);
  assert.equal(effects(['oven2']).ovenCount, 2);
  assert.equal(effects(['bowl2']).mixerCount, 2);
  assert.equal(effects(['counter2']).counterSlots, 3);
  assert.equal(effects(['counter3', 'counter2']).counterSlots, 4);
  assert.ok(effects(['mix1']).mixScale < 1);
  assert.ok(effects(['mix2', 'mix1']).mixScale < effects(['mix1']).mixScale);
  assert.ok(effects(['sprinkles']).finishScale < 1);
  assert.ok(effects(['chairs']).patienceScale > 1);
  assert.ok(effects(['jukebox']).tipBonus > 0);
  assert.equal(effects(['mouse']).helper, true);
  assert.equal(effects(['flowers']).decor.flowers, true);
  assert.equal(effects(['bunting']).decor.bunting, true);
});

test('owning everything is strictly better than owning nothing, and still sane', () => {
  const all = effects(UPGRADE_IDS);
  assert.ok(all.bakeScale >= 0.5 && all.mixScale >= 0.5 && all.finishScale >= 0.5, 'nothing should be instant');
  assert.ok(all.counterSlots === 4 && all.ovenCount === 2 && all.mixerCount === 2);
  assert.ok(all.patienceScale > 1 && all.tipBonus > 0 && all.helper);
  for (const flag of Object.values(all.decor)) assert.equal(flag, true);
});

test('upgrades scale the right stations and leave the rest alone', () => {
  const eff = effects(['mitts1', 'mix1', 'sprinkles']);
  assert.ok(scaledTime(10, 'oven', eff) < 10);
  assert.ok(scaledTime(10, 'mixer', eff) < 10);
  assert.ok(scaledTime(10, 'icing', eff) < 10);
  assert.ok(scaledTime(10, 'jam', eff) < 10);
  assert.ok(scaledTime(10, 'decor', eff) < 10);
  assert.equal(scaledTime(10, 'cocoa', eff), 10);
  assert.equal(scaledTime(10, 'juice', eff), 10);
  for (const id of Object.keys(STATIONS)) assert.ok(scaledTime(10, id, BASE_EFFECTS) === 10);
});
