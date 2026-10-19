import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, loadSave, cleanSave, writeSave, upgradeCost, statsFor, buyUpgrade, starsFor, recordArrival, menuPrice, MENU, FREE_ITEM, SAVE_KEY } from '../src/progress.js';
import { planet, children } from '../src/galaxy.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

test('save round-trips and tolerates junk', () => {
  const s = memoryStorage();
  const save = defaultSave();
  save.stardust = 77;
  assert.equal(writeSave(s, save), true);
  assert.equal(writeSave({ setItem() { throw new Error('quota'); } }, save), false);
  assert.equal(loadSave(s).stardust, 77);
  s.setItem(SAVE_KEY, 'nope');
  assert.deepEqual(loadSave(s), defaultSave());
});

test('blocked storage and damaged saves still load a usable save', () => {
  assert.deepEqual(loadSave(null), defaultSave());
  assert.equal(writeSave(null, defaultSave()), false);
  for (const raw of [[1], 'text', 3, { cleared: null, upgrades: null }, { cleared: { foo: 2, 'H.9': 1, 'H.0.5': 2, 'H.1.0': 3 } }, { upgrades: { cannon: 9, hull: -1 } }]) {
    const save = cleanSave(raw);
    for (const id of Object.keys(save.cleared)) assert.ok(children(id.slice(0, id.lastIndexOf('.'))).includes(id), id);
    for (const key of Object.keys(save.upgrades)) assert.ok(save.upgrades[key] >= 0 && upgradeCost(save, key) !== undefined);
  }
  // Orphans (parent never visited) and made-up ids are dropped.
  assert.deepEqual(cleanSave({ cleared: { foo: 2, 'H.9': 1, 'H.1.0': 3 } }).cleared, {});
  assert.equal(cleanSave({ upgrades: { cannon: 9 } }).upgrades.cannon, 3);
  const kept = cleanSave({ cleared: { 'H.0': 3, 'H.0.1': 2 }, stardust: 55, paint: '#4fb4ff', view: 'chase', muted: true, selected: 'H.0.1' });
  assert.deepEqual(kept.cleared, { 'H.0': 3, 'H.0.1': 2 });
  assert.deepEqual([kept.stardust, kept.paint, kept.view, kept.muted, kept.selected], [55, '#4fb4ff', 'chase', true, 'H.0.1']);
});

test('upgrades cost stardust and improve the jet', () => {
  const save = defaultSave();
  save.stardust = 1000;
  assert.equal(buyUpgrade(save, 'cannon'), true);
  assert.equal(save.stardust, 920);
  const base = statsFor({}), up = statsFor({ cannon: 3, hull: 3, shield: 3, engine: 3, missiles: 3 });
  assert.ok(up.hull > base.hull && up.shield > base.shield && up.cannonStart > base.cannonStart);
  assert.ok(up.missiles > base.missiles && up.boost > base.boost);
  assert.equal(buyUpgrade(defaultSave(), 'hull'), false);
});

test('stars: arrive, clear half the enemies, keep your hull', () => {
  assert.equal(starsFor({ kills: 10, spawned: 40, hull: 100, maxHull: 100 }), 1);
  assert.equal(starsFor({ kills: 20, spawned: 40, hull: 30, maxHull: 100 }), 2);
  assert.equal(starsFor({ kills: 20, spawned: 40, hull: 60, maxHull: 100 }), 3);
});

test('arriving pays out, records stars, and reveals new planets once', () => {
  const save = defaultSave();
  const p = planet('H.0');
  const first = recordArrival(save, p, { kills: 30, spawned: 40, hull: 90, maxHull: 100, dust: 50 });
  assert.equal(first.stars, 3);
  assert.deepEqual(first.revealed, children('H.0'));
  assert.equal(save.stardust, 50 + 45 + 10);
  const again = recordArrival(save, p, { kills: 1, spawned: 40, hull: 10, maxHull: 100, dust: 0 });
  assert.deepEqual(again.revealed, []);
  assert.equal(save.cleared['H.0'], 3, 'a worse run never lowers stars');
});

test('the burger menu gets pricier deeper in the galaxy', () => {
  const burger = MENU[0];
  assert.equal(menuPrice(burger, 1), burger.price);
  assert.ok(menuPrice(burger, 6) > burger.price);
});

test('each Space Burger visit has one free item and everything else keeps its price', () => {
  const free = MENU.find((item) => item.id === FREE_ITEM);
  assert.ok(free, 'the free item is on the menu');
  assert.equal(menuPrice(free, 4, { freebie: true }), 0);
  assert.ok(menuPrice(free, 4) > 0, 'only free while the freebie is unclaimed');
  for (const item of MENU.filter((entry) => entry.id !== FREE_ITEM)) {
    assert.equal(menuPrice(item, 4, { freebie: true }), menuPrice(item, 4));
  }
});
