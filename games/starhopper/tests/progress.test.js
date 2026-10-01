import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, loadSave, writeSave, statsFor, buyUpgrade, starsFor, recordArrival, menuPrice, MENU, SAVE_KEY } from '../src/progress.js';
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
