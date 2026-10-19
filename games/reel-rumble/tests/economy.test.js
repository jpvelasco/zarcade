import test from 'node:test';
import assert from 'node:assert/strict';
import { RODS, REELS, LINES, BAITS, BOATS, SLOTS, buy, buyBlock, equip, owns, fishValue, gearStats, lineHolds, speciesCaught } from '../src/gear.js';
import { FISH, FISH_BY_ID, WATERS } from '../src/data.js';
import { defaultSave } from '../src/progress.js';

test('upgrades cost more and do more', () => {
  for (const [list, key, better] of [[RODS, 'cast', 1], [RODS, 'flex', -1], [REELS, 'reelSpeed', 1], [REELS, 'reelPower', 1], [LINES, 'strength', 1]]) {
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].price > list[i - 1].price, `${list[i].id} price`);
      assert.ok((list[i][key] - list[i - 1][key]) * better > 0, `${list[i].id} ${key}`);
    }
  }
  for (const w of WATERS) if (w.boat) assert.ok(BOATS.some((b) => b.id === w.boat && b.water === w.id), w.id);
  for (const slot of Object.keys(SLOTS)) assert.equal(new Set(SLOTS[slot].map((i) => i.id)).size, SLOTS[slot].length);
});

test('every bait catches something and the first one is free', () => {
  assert.equal(BAITS[0].price, 0);
  for (const b of BAITS) assert.ok(FISH.some((f) => f.baits.includes(b.id)), b.id);
});

test('buying spends coins, owns and equips; you cannot overspend', () => {
  const s = defaultSave();
  assert.equal(buyBlock(s, 'rod', 'bamboo'), 'Not enough coins');
  assert.equal(buy(s, 'rod', 'bamboo'), false);
  s.coins = 100;
  assert.equal(buy(s, 'rod', 'bamboo'), true);
  assert.equal(s.coins, 10);
  assert.ok(owns(s, 'rod', 'bamboo'));
  assert.equal(s.equip.rod, 'bamboo');
  assert.equal(buyBlock(s, 'rod', 'bamboo'), 'Owned');
  assert.equal(equip(s, 'rod', 'twig'), true);
  assert.equal(equip(s, 'rod', 'carbon'), false, 'cannot use what you do not own');
  s.coins = 5000;
  assert.match(buyBlock(s, 'bait', 'starlight'), /Catch 10 species/);
  for (const f of FISH.slice(0, 10)) s.book[f.id] = { n: 1, cm: 10, kg: 1 };
  assert.equal(speciesCaught(s), 10);
  assert.equal(buy(s, 'bait', 'starlight'), true);
  assert.equal(buy(s, 'boat', 'canoe'), true);
  assert.equal(s.equip.boat, undefined, 'boats are not equipped');
});

test('bigger fish are worth more; legends are worth a lot', () => {
  for (const f of FISH) assert.ok(fishValue(f, 1) >= fishValue(f, 0), f.id);
  assert.ok(fishValue(FISH_BY_ID.bass, 1) > fishValue(FISH_BY_ID.bass, 0));
  assert.ok(fishValue(FISH_BY_ID.whiskers, 0) > 10 * fishValue(FISH_BY_ID.bluegill, 1));
});

test('gear decides which fights are fair', () => {
  const starter = gearStats({ rod: 'twig', reel: 'clicker', line: 'cotton', bait: 'worm' });
  const best = gearStats({ rod: 'starlight', reel: 'tidal', line: 'silk', bait: 'worm' });
  assert.ok(lineHolds(starter, FISH_BY_ID.bluegill));
  assert.ok(!lineHolds(starter, FISH_BY_ID.whiskers));
  for (const f of FISH) assert.ok(lineHolds(best, f), f.id);
});
