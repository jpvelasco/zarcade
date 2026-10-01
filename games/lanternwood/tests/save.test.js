import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, loadAll, writeAll, normalize, slotSummary, SAVE_KEY, SLOTS, berryCap } from '../src/save.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('slots round-trip through storage', () => {
  const store = memory();
  const all = loadAll(store);
  assert.equal(all.slots.length, SLOTS);
  const s = newGame();
  s.berries = 42; s.items.boomerang = true; s.flags = ['chest:x']; s.quests.cat.stage = 1;
  s.respawn = { area: 'burrow', x: 29, y: 32 };
  all.slots[1] = s; all.last = 1;
  assert.ok(writeAll(store, all));
  const back = loadAll(store);
  assert.equal(back.last, 1);
  assert.equal(back.slots[1].berries, 42);
  assert.equal(back.slots[1].items.boomerang, true);
  assert.deepEqual(back.slots[1].respawn, { area: 'burrow', x: 29, y: 32 });
  assert.equal(back.slots[1].quests.cat.stage, 1);
  assert.equal(back.slots[0], null);
});

test('broken, blocked or missing storage gives empty slots and never throws', () => {
  assert.equal(loadAll(null).slots.every((s) => s === null), true);
  const bad = memory(); bad.setItem(SAVE_KEY, '{oops');
  assert.equal(loadAll(bad).slots[0], null);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadAll(blocked).slots[0], null);
  assert.equal(writeAll(blocked, loadAll(null)), false);
});

test('normalize repairs damaged saves', () => {
  const s = normalize({ maxHearts: 99, hearts: -4, equipped: 'grapple', items: { grapple: false }, quests: { cat: { stage: 'x' } } });
  assert.equal(s.maxHearts, 12);
  assert.equal(s.hearts, 1);
  assert.equal(s.equipped, 'lantern');
  assert.equal(s.quests.cat.stage, -1);
  assert.equal(normalize(null), null);
});

test('slot summary and berry pouch cap', () => {
  const s = newGame();
  s.playTime = 3725; s.shards = ['burrow'];
  assert.deepEqual(slotSummary(s), { hearts: 3, shards: 1, berries: 0, time: '1 h 2 min', ended: false });
  assert.equal(berryCap(s), 99);
  s.pouch = true;
  assert.equal(berryCap(s), 300);
});
