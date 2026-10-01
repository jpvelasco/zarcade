import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES } from '../src/creatures.js';
import { AREAS, UPGRADES } from '../src/areas.js';
import { buildMap, TREASURES, SHELLS, PARTS, DOCKS, HEART, GATES, CURRENTS, WATER, kindAt } from '../src/map.js';
import { isClear } from '../src/gating.js';
import { SHAPES } from '../src/sprites.js';

const map = buildMap();

test('there are 50+ species with unique ids and names', () => {
  assert.ok(SPECIES.length >= 50, `only ${SPECIES.length}`);
  assert.equal(new Set(SPECIES.map((s) => s.id)).size, SPECIES.length);
  assert.equal(new Set(SPECIES.map((s) => s.name)).size, SPECIES.length);
});

test('every area has at least six species', () => {
  AREAS.forEach((a, i) => assert.ok(SPECIES.filter((s) => s.area === i).length >= 6, a.name));
});

test('every species has a short kid-sized fact, colors, a drawable shape and a behaviour', () => {
  const behs = new Set(['school', 'wander', 'still', 'drift', 'hide', 'shy', 'curious']);
  for (const s of SPECIES) {
    assert.ok(s.fact.length > 30 && s.fact.length <= 120, `${s.id} fact length ${s.fact.length}`);
    assert.match(s.fact, /[.!"]$/, `${s.id} fact ends with punctuation`);
    assert.match(s.c1, /^#[0-9a-f]{6}$/i);
    assert.match(s.c2, /^#[0-9a-f]{6}$/i);
    assert.ok(SHAPES.includes(s.shape), `${s.id} shape ${s.shape}`);
    assert.ok(behs.has(s.beh), `${s.id} behaviour ${s.beh}`);
    assert.ok(s.count >= 1 && s.size > 10);
  }
});

test('each behaviour the pitch promises is used', () => {
  for (const b of ['school', 'hide', 'shy', 'curious']) assert.ok(SPECIES.some((s) => s.beh === b), b);
  assert.equal(SPECIES.find((s) => s.id === 'octopus').beh, 'hide');
  assert.equal(SPECIES.find((s) => s.id === 'anglerfish').beh, 'shy');
  assert.equal(SPECIES.find((s) => s.id === 'dolphin').beh, 'curious');
});

test('item ids are unique and every item sits in a roomy water cell', () => {
  const all = [...TREASURES, ...SHELLS, ...PARTS, HEART];
  assert.equal(new Set(all.map((o) => o.id)).size, all.length);
  for (const o of all) assert.ok(isClear(map, o.x, o.y), `${o.id} at ${o.x},${o.y} is not roomy water`);
  assert.equal(TREASURES.length, 32);
  assert.equal(SHELLS.length, 12);
  assert.deepEqual(PARTS.map((p) => p.id), UPGRADES.map((u) => u.id));
});

test('docks are in water and gates and currents cover water cells only', () => {
  for (const d of DOCKS) assert.equal(kindAt(map, d.x, d.y), WATER, d.id);
  for (const g of [...GATES, ...CURRENTS]) {
    for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) assert.equal(kindAt(map, x, y), WATER, `${g.id} ${x},${y}`);
  }
});
