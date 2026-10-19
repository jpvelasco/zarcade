import test from 'node:test';
import assert from 'node:assert/strict';
import { shopStock, sellPrice, marketPrice, makeRequests, fairScore, fairRibbon, canCraft, requestPool } from '../src/economy.js';
import { ITEMS, RECIPES, CROPS, VILLAGER_IDS, GOODS, UPGRADES } from '../src/data.js';
import { freshWorld, runBot } from './helpers.js';

const base = { season: 'spring', upgrades: { field: false, greenhouse: false }, canLevel: 0, animals: [{ type: 'chicken' }] };

test('the store sells this season\'s seeds and every upgrade in order', () => {
  const stock = shopStock(base);
  const seeds = stock.filter((s) => s.kind === 'seed').map((s) => s.id);
  assert.ok(seeds.includes('turnip_seed'));
  assert.ok(!seeds.includes('melon_seed'));
  const ups = stock.filter((s) => s.kind === 'upgrade').map((s) => s.id);
  assert.ok(ups.includes('can1') && !ups.includes('can2'));
  assert.ok(shopStock({ ...base, canLevel: 1 }).some((s) => s.id === 'can2'));
  const gh = shopStock({ ...base, upgrades: { field: false, greenhouse: true } });
  assert.ok(gh.some((s) => s.id === 'melon_seed' && s.offSeason), 'greenhouse owners can buy any seed');
  assert.ok(stock.every((s) => s.cost > 0));
});

test('market pays a bonus and every recipe adds value', () => {
  assert.ok(marketPrice('turnip') > sellPrice('turnip'));
  for (const [id, r] of Object.entries(RECIPES)) {
    const inputs = Object.entries(r.needs).reduce((s, [i, n]) => s + sellPrice(i) * n, 0);
    assert.ok(GOODS[id].sell > inputs, `${id} should be worth more than its ingredients`);
    for (const i of Object.keys(r.needs)) assert.ok(ITEMS[i], `${id} uses unknown ${i}`);
  }
  assert.ok(canCraft({ milk: 1 }, 'cheese'));
  assert.equal(canCraft({ wheat: 2 }, 'bread'), false);
});

test('community requests are seeded, valid and obtainable this season', () => {
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    const a = makeRequests(5, 0, season, base.animals);
    assert.deepEqual(a, makeRequests(5, 0, season, base.animals));
    assert.equal(a.length, 3);
    assert.equal(new Set(a.map((r) => r.villager)).size, 3);
    const pool = requestPool(season, base.animals).map((p) => p.item);
    for (const r of a) {
      assert.ok(VILLAGER_IDS.includes(r.villager));
      assert.ok(pool.includes(r.item));
      if (CROPS[r.item]) assert.ok(CROPS[r.item].seasons.includes(season));
      assert.ok(r.reward > sellPrice(r.item) * r.n, 'requests pay better than shipping');
    }
  }
});

test('fair judging rewards variety', () => {
  const same = fairScore(['turnip', 'turnip', 'turnip']);
  const mixed = fairScore(['turnip', 'egg', 'bluegill']);
  assert.ok(mixed > same);
  assert.equal(fairRibbon(fairScore(['pie', 'cheese', 'pumpkin'])).ribbon, 'gold');
  assert.equal(fairRibbon(0).ribbon, 'bronze');
});

test('a sensible farmer can afford an upgrade within the first season', () => {
  const w = freshWorld(11);
  const nights = runBot(w, 7);
  assert.equal(nights.length, 7);
  assert.equal(w.season, 'summer');
  assert.ok(w.money > 500, `ended spring with ${w.money}g`);
  assert.ok(w.canLevel >= 1, 'bought the copper can');
  assert.ok(w.earned >= UPGRADES.can1.cost * 3);
});
