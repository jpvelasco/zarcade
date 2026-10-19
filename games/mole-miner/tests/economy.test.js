// Economy pacing: upgrades cost a fair share of what each layer holds, and
// the session pays, refuels and tows kindly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/worldgen.js';
import { Session, upgradeInfo, buyUpgrade, towFee, podStats, cargoValue } from '../src/game.js';
import { newSave } from '../src/progress.js';
import { ORES, LAYERS, UPGRADES, UPGRADE_ORDER, MILESTONES, PAINTS, T } from '../src/data.js';

function layerValues(seed) {
  const w = generateWorld(seed);
  const v = LAYERS.map(() => 0);
  w.tiles.forEach((c, i) => { if (c >= T.ORE0 && c < T.ORE0 + ORES.length) v[w.layerOf[Math.floor(i / w.w)]] += ORES[c - T.ORE0].value; });
  return v;
}

test('reaching each layer costs well under half of the ore above it', () => {
  for (const seed of ['meadow-1', 'meadow-2', 'quartz', 'loam']) {
    const v = layerValues(seed);
    let above = 0, spent = 0;
    for (let li = 1; li < LAYERS.length; li++) {
      above += v[li - 1];
      // Essentials for layer li: the drill that digs it, plus the fan for lava.
      spent += LAYERS[li].hard > LAYERS[li - 1].hard ? UPGRADES.drill.cost[LAYERS[li].hard - 1] : 0;
      if (LAYERS[li].id === 'lava') spent += UPGRADES.fan.cost[1];
      assert.ok(spent <= above * 0.5, `${seed}: ${LAYERS[li].id} needs ${spent} of ${above}`);
    }
  }
});

test('upgrade tiers get pricier and better', () => {
  for (const k of UPGRADE_ORDER) {
    const U = UPGRADES[k];
    assert.equal(U.cost.length, U.tiers.length);
    assert.equal(U.names.length, U.tiers.length);
    for (let i = 1; i < U.tiers.length; i++) {
      assert.ok(U.tiers[i] > U.tiers[i - 1], `${k} tier ${i}`);
      assert.ok(U.cost[i] > U.cost[i - 1], `${k} cost ${i}`);
    }
  }
});

test('the first upgrade costs about two hauls of meadow gems', () => {
  const meadowGem = (ORES[0].value + ORES[1].value) / 2;
  const haul = UPGRADES.cargo.tiers[0] * meadowGem;
  assert.ok(UPGRADES.drill.cost[1] <= haul * 2.5, `drill 1 costs ${UPGRADES.drill.cost[1]} vs haul ${haul}`);
  const cheapest = Math.min(...UPGRADE_ORDER.map((k) => UPGRADES[k].cost[1]));
  assert.ok(cheapest <= haul, 'something is affordable after one trip');
});

test('the upgrade tree: branches wait for the drill, the fan for the Glow drill', () => {
  const save = newSave();
  save.coins = 1e6;
  assert.equal(upgradeInfo(save, 'cargo').locked, 0, 'tier 1 is open from the start');
  assert.ok(buyUpgrade(save, 'cargo'));
  assert.equal(upgradeInfo(save, 'cargo').locked, 1, 'tier 2 needs the Copper Drill');
  assert.equal(buyUpgrade(save, 'cargo'), false);
  assert.ok(buyUpgrade(save, 'drill'));
  assert.ok(buyUpgrade(save, 'cargo'));
  assert.equal(upgradeInfo(save, 'fan').locked, 4);
  save.upgrades.drill = 4;
  assert.ok(buyUpgrade(save, 'fan'));
  assert.ok(upgradeInfo(save, 'fan').maxed);
  const poor = newSave();
  assert.equal(buyUpgrade(poor, 'drill'), false, 'no coins, no sale');
  assert.equal(poor.coins, 0);
});

test('docking sells the cargo, refuels, repairs and hands over relics', () => {
  const save = newSave();
  const s = new Session(save);
  const p = s.pod;
  p.cargo = [0, 1, 1];
  p.relics = [0, 1, 2, 3];
  p.fuel = 3;
  p.hull = 5;
  p.maxDepth = 20;
  s.dock();
  const docked = s.events.find((e) => e.type === 'docked');
  assert.equal(docked.value, cargoValue([0, 1, 1]));
  assert.ok(save.coins > docked.value, 'relics pay too');
  assert.equal(p.cargo.length, 0);
  assert.equal(p.fuel, s.stats.tank);
  assert.equal(p.hull, s.stats.hull);
  assert.equal(Object.keys(save.museum).length, 4);
  assert.ok(save.paints.includes('berry'), 'a finished set unlocks its paint');
  assert.equal(save.stats.trips, 1);
});

test('Wiggles tows you home for a small fee that never exceeds your coins', () => {
  const save = newSave();
  save.coins = 5;
  const s = new Session(save);
  const p = s.pod;
  p.y = 60; p.depth = 60; p.fuel = 0; p.stranded = 'fuel';
  p.cargo = [2, 2];
  const fee = s.tow();
  assert.equal(fee, 5, 'capped at the coins you hold');
  assert.equal(save.coins, cargoValue([2, 2]), 'cargo is kept and sold');
  assert.ok(p.y < 0 && !p.stranded);
  assert.equal(p.fuel, s.stats.tank);
  assert.ok(towFee(100) < 100, 'fee is small');
  assert.ok(towFee(250) < UPGRADES.cargo.tiers[4] * ORES[8].value * 0.1, 'deep tows cost under a tenth of a haul');
});

test('depth milestones pay once and unlock layer paints', () => {
  const save = newSave();
  const s = new Session(save);
  s.pod.maxDepth = 75; // 150 m
  s.checkDepth();
  const got = s.events.filter((e) => e.type === 'milestone').map((e) => e.m);
  assert.deepEqual(got, [20, 60, 100, 140]);
  assert.ok(save.paints.includes('clover') && save.paints.includes('pebble'));
  const coins = save.coins;
  s.checkDepth();
  assert.equal(save.coins, coins);
  assert.equal(save.bestDepth, 150);
  const paintIds = new Set(PAINTS.map((p) => p.id));
  for (const m of MILESTONES) if (m.paint) assert.ok(paintIds.has(m.paint));
});

test('pod stats follow the upgrades', () => {
  const lo = podStats(newSave().upgrades);
  const hi = podStats({ drill: 5, tank: 5, cargo: 5, hull: 5, lamp: 5, prop: 5, fan: 1 });
  for (const k of ['power', 'tank', 'cargo', 'hull', 'lamp', 'fly']) assert.ok(hi[k] > lo[k], k);
  assert.ok(hi.flyBurn < lo.flyBurn);
  assert.equal(hi.fan, true);
});
