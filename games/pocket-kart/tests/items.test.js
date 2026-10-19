import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, ITEM_IDS, expectedPower, itemWeights, packPosition, rollItem } from '../src/items.js';
import { Race } from '../src/race.js';
import { mulberry32 } from '../src/math.js';
import { entrants, run, track } from './helpers.js';
import { linePoint } from '../src/track.js';

const t = track('toybox-speedway');

test('the further back you are, the better your items', () => {
  let prev = -Infinity;
  for (let x = 0; x <= 1.0001; x += 0.1) {
    const p = expectedPower(x);
    assert.ok(p >= prev - 1e-9, `power at ${x}`);
    prev = p;
  }
  assert.ok(expectedPower(1) > expectedPower(0) * 1.8);
});

test('the leader never rolls a comet or a triple turbo; last place often does', () => {
  const w0 = itemWeights(0);
  assert.equal(w0[ITEM_IDS.indexOf('comet')], 0);
  assert.equal(w0[ITEM_IDS.indexOf('triple')], 0);
  const rng = mulberry32(5);
  const counts = {};
  for (let i = 0; i < 2000; i++) {
    const id = rollItem(1, rng());
    counts[id] = (counts[id] || 0) + 1;
  }
  assert.ok(counts.triple > 400 && counts.comet > 150, JSON.stringify(counts));
});

test('pack position counts place and distance behind the leader', () => {
  assert.equal(packPosition(1, 6, 0, 7000), 0);
  assert.equal(packPosition(6, 6, 0, 7000), 1);
  assert.ok(packPosition(3, 6, 3000, 7000) > packPosition(3, 6, 0, 7000));
});

test('every item has a name, icon and use count', () => {
  for (const id of ITEM_IDS) {
    assert.equal(ITEMS[id].id, id);
    assert.ok(ITEMS[id].name && ITEMS[id].icon && ITEMS[id].uses >= 1);
  }
});

function startedRace() {
  const race = new Race({ track: t, entrants: entrants({ player: true }), mode: 'gp', seed: 3 });
  run(race, { until: (r) => r.state === 'racing' });
  return race;
}

test('an item box rolls an item after a short roulette', () => {
  const race = startedRace();
  const k = race.player;
  const box = race.boxes[0];
  k.x = box.x; k.y = box.y;
  race.itemBoxes(0);
  assert.ok(k.rollT > 0 && !k.item);
  assert.ok(box.respawn > 0, 'box breaks and respawns');
  run(race, { until: () => k.item !== null, maxTime: race.time + 2 });
  assert.ok(ITEM_IDS.includes(k.item));
});

// Lines the player up with one rival 350 units ahead and the rest far away.
function chaseSetup(race) {
  const k = race.player;
  const [target, ...rest] = race.karts.filter((o) => o !== k);
  const place = (kart, s, lat = 0) => {
    const p = linePoint(t, s);
    kart.x = p.x; kart.y = p.y; kart.h = kart.m = Math.atan2(p.ty, p.tx);
    kart.hint = null; kart.s = s; kart.lastS = s; kart.dist = s; kart.v = 200;
  };
  place(k, 800);
  place(target, 1150);
  rest.forEach((o, i) => place(o, 3000 + i * 300));
  for (const o of race.karts) stepKartLocate(o);
  race.places();
  return target;
}
const stepKartLocate = (k) => { k.hint = null; };

test('a homing jelly chases the racer ahead and wobbles it; a shield blocks it', () => {
  const race = startedRace();
  const k = race.player;
  chaseSetup(race);
  const ahead = race.racerAhead(k);
  assert.ok(ahead, 'someone is ahead');
  k.item = 'jelly'; k.itemUses = 1;
  race.useItem(k);
  assert.equal(race.jellies.length, 1);
  assert.equal(race.jellies[0].target, ahead.kart.index);
  const events = run(race, { until: () => race.jellies.length === 0, maxTime: race.time + 8 });
  const hit = events.find((e) => e.type === 'jelly-hit');
  assert.ok(hit, 'the jelly lands');
  assert.equal(hit.kart, ahead.kart.index);

  const race2 = startedRace();
  const p2 = race2.player;
  const target = chaseSetup(race2);
  assert.equal(race2.racerAhead(p2).kart, target);
  target.shieldT = 20;
  p2.item = 'jelly'; p2.itemUses = 1;
  race2.useItem(p2);
  const ev2 = run(race2, { until: () => race2.jellies.length === 0, maxTime: race2.time + 8 });
  assert.ok(ev2.some((e) => e.type === 'shield-pop' && e.kart === target.index), 'shield pops instead');
});

test('a bouncy star dropped behind bounces whoever drives into it', () => {
  const race = startedRace();
  const k = race.player;
  k.item = 'star'; k.itemUses = 1;
  race.useItem(k);
  assert.equal(race.traps.length, 1);
  const trap = race.traps[0];
  const other = race.karts.find((o) => o !== k);
  other.x = trap.x; other.y = trap.y;
  race.updateTraps(0.01);
  assert.equal(race.traps.length, 0);
  assert.ok(other.wobbleT > 0, 'bounced');
});

test('mushrooms boost, triple turbo has three uses, comet rides itself', () => {
  const race = startedRace();
  const k = race.player;
  k.item = 'triple'; k.itemUses = 3;
  race.useItem(k);
  assert.ok(k.boostT > 1 && k.itemUses === 2);
  k.itemCd = 0; race.useItem(k);
  k.itemCd = 0; race.useItem(k);
  assert.equal(k.item, null);
  k.item = 'comet'; k.itemUses = 1; k.itemCd = 0;
  race.useItem(k);
  assert.ok(k.cometT > 2);
  const s0 = k.dist;
  run(race, { maxTime: race.time + 2 });
  assert.ok(k.dist - s0 > 600, `comet covers ground (${k.dist - s0})`);
});
