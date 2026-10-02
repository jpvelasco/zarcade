import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { DEFENDERS, DEFENDER_ORDER, SELL_REFUND } from '../src/data.js';
import { buildCost, upgradeCost, investedIn, sellValue } from '../src/combat.js';
import { mapInfo } from '../src/maps.js';
import { loadSave, writeSave, recordResult, unlockedDefenders, isMapUnlocked, SAVE_KEY, defaultSave } from '../src/progress.js';

const grass = (g, n = 0) => mapInfo(g.mapIndex).buildable[n];

test('there are at least six defenders with distinct roles and two upgrade tiers', () => {
  assert.ok(DEFENDER_ORDER.length >= 6);
  const roles = new Set(DEFENDER_ORDER.map((t) => DEFENDERS[t].role));
  assert.equal(roles.size, DEFENDER_ORDER.length);
  for (const t of DEFENDER_ORDER) assert.equal(DEFENDERS[t].tiers.length, 3, t);
  assert.ok(DEFENDER_ORDER.some((t) => DEFENDERS[t].air && !DEFENDERS[t].ground), 'anti-air');
  assert.equal(new Set(DEFENDER_ORDER.map((t) => DEFENDERS[t].key)).size, DEFENDER_ORDER.length);
});

test('building spends coins and only works on free grass', () => {
  const g = new Game(0);
  const start = g.coins;
  const t = grass(g);
  const d = g.build('pea', t.x, t.y);
  assert.ok(d);
  assert.equal(g.coins, start - buildCost('pea'));
  assert.equal(g.build('pea', t.x, t.y), null, 'tile taken');
  const path = mapInfo(0).cellPaths[0][3];
  assert.equal(g.build('pea', path.x, path.y), null, 'no planting on the path');
  assert.equal(g.build('pea', 2, 0), null, 'no planting on trees');
  assert.equal(g.build('lavender', grass(g, 5).x, grass(g, 5).y), null, 'locked defender');
  g.coins = 10;
  assert.equal(g.build('sunflower', grass(g, 9).x, grass(g, 9).y), null, 'too poor');
});

test('upgrades step through two tiers then stop', () => {
  const g = new Game(0);
  g.coins = 10000;
  const d = g.build('pea', grass(g).x, grass(g).y);
  assert.ok(g.upgrade(d));
  assert.ok(g.upgrade(d));
  assert.equal(d.tier, 2);
  assert.equal(g.upgrade(d), false);
  assert.equal(upgradeCost('pea', 2), null);
  assert.equal(d.invested, investedIn('pea', 2));
  assert.equal(g.coins, 10000 - investedIn('pea', 2));
});

test('selling refunds everything during the build break, 70% after a wave starts', () => {
  const g = new Game(0);
  g.coins = 1000;
  const a = g.build('pea', grass(g).x, grass(g).y);
  g.upgrade(a);
  const spent = investedIn('pea', 1);
  assert.equal(g.sell(a), spent);
  assert.equal(g.coins, 1000);
  const b = g.build('sunflower', grass(g, 3).x, grass(g, 3).y);
  g.startWave();
  const expect = Math.floor(buildCost('sunflower') * SELL_REFUND);
  assert.equal(sellValue(b.invested), expect);
  assert.equal(g.sell(b), expect);
  assert.equal(g.defenders.length, 0);
  assert.ok(g.canBuildAt(grass(g, 3).x, grass(g, 3).y), 'tile free again');
});

test('sun daisies earn only while bugs are marching', () => {
  const g = new Game(1);
  const d = g.build('daisy', grass(g).x, grass(g).y);
  const coins = g.coins;
  g.startWave();
  const period = DEFENDERS.daisy.tiers[0].period;
  for (let i = 0; i < 60 * (period + 0.1); i++) g.step();
  assert.ok(g.events.some((e) => e.type === 'coin'));
  assert.ok(g.coins >= coins + DEFENDERS.daisy.tiers[0].income);
  assert.equal(d.type, 'daisy');
});

test('calling a wave early pays a bonus from the break timer', () => {
  const g = new Game(0);
  g.startWave();
  assert.equal(g.canCallWave(), false, 'wave 1 still spawning');
  for (let i = 0; i < 60 * 60 && g.pending.length; i++) g.step();
  g.step();
  assert.ok(g.breakTimer > 0);
  const bonus = g.earlyBonus();
  assert.ok(bonus > 0);
  const coins = g.coins;
  assert.ok(g.startWave());
  assert.equal(g.coins, coins + bonus);
  assert.equal(g.wave, 2);
});

test('the next wave starts by itself when the break runs out', () => {
  const g = new Game(0);
  g.startWave();
  for (let i = 0; i < 60 * 80 && g.wave < 2; i++) g.step();
  assert.equal(g.wave, 2);
});

test('save data round-trips under the namespaced key and unlocks progress', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const save = loadSave(storage);
  assert.deepEqual(save.stars, {});
  assert.equal(isMapUnlocked(save, 1), false);
  assert.deepEqual(unlockedDefenders(save), ['pea', 'sunflower']);
  const res = recordResult(save, 0, 2);
  assert.equal(res.newMap, 1);
  assert.deepEqual(res.newDefenders, ['honey', 'daisy']);
  assert.equal(recordResult(save, 0, 1).best, 2, 'keeps best stars');
  assert.equal(writeSave(storage, save), true);
  assert.ok(store.has(SAVE_KEY));
  assert.equal(writeSave(null, save), false);
  assert.equal(writeSave({ setItem() { throw new Error('quota'); } }, save), false);
  assert.equal(SAVE_KEY, 'garden-guardians.v1');
  const again = loadSave(storage);
  assert.equal(again.stars['sunny-lawn'], 2);
  assert.equal(isMapUnlocked(again, 1), true);
  assert.deepEqual(loadSave({ getItem: () => '{bad json' }).stars, {});
});

test('a damaged save is sanitized on load (issue #145)', () => {
  const from = (v) => loadSave({ getItem: () => JSON.stringify(v) });
  const save = from({ stars: { 'sunny-lawn': 5, 'birdbath-bend': 'x', 'gnome-crossing': 2, nope: 3 }, muted: 'yes', music: false, fast: true });
  assert.deepEqual(save.stars, { 'sunny-lawn': 3, 'gnome-crossing': 2 });
  assert.equal(save.muted, false);
  assert.equal(save.music, false);
  assert.equal(save.fast, true);
  assert.deepEqual(from('hello'), defaultSave());
  assert.deepEqual(from([1, 2]), defaultSave());
  assert.deepEqual(from(null), defaultSave());
  assert.deepEqual(from({ stars: 'lots' }).stars, {});
});

