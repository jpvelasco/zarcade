import test from 'node:test';
import assert from 'node:assert/strict';
import { zoneRect, plotRect, decoSpot, viewNode, roadPath, GATE_NODE, hitTest, WORLD, GRAPH, ZONE_CELLS } from '../src/map.js';
import { BIOMES, PLOTS_PER_BIOME, DECO_SPOTS_PER_BIOME } from '../src/data.js';

const H = BIOMES.length * PLOTS_PER_BIOME;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('zones fill distinct grid cells inside the world', () => {
  assert.equal(new Set(ZONE_CELLS.map((c) => c.join())).size, BIOMES.length);
  for (let b = 0; b < BIOMES.length; b++) {
    const z = zoneRect(b);
    assert.ok(z.x >= WORLD.x0 && z.x + z.w <= WORLD.x1 && z.y >= WORLD.y0 && z.y + z.h <= WORLD.y1);
  }
});

test('plots sit inside their zone, off the roads, without overlapping', () => {
  for (let i = 0; i < H; i++) {
    const p = plotRect(i);
    const z = zoneRect(p.biome);
    assert.ok(p.x >= z.x + 30 && p.x + p.w <= z.x + z.w - 30 && p.y >= z.y + 30 && p.y + p.h <= z.y + z.h - 30, `plot ${i}`);
    for (let j = 0; j < i; j++) assert.ok(!overlap(p, plotRect(j)), `plots ${i} ${j}`);
  }
});

test('decoration spots stay clear of habitats', () => {
  for (let s = 0; s < BIOMES.length * DECO_SPOTS_PER_BIOME; s++) {
    const d = decoSpot(s);
    const box = { x: d.x - 34, y: d.y - 50, w: 68, h: 64 };
    for (let i = 0; i < H; i++) assert.ok(!overlap(box, plotRect(i)), `spot ${s} vs plot ${i}`);
  }
});

test('every habitat view spot is reachable from the gate and back', () => {
  for (let i = 0; i < H; i++) {
    const n = viewNode(i);
    assert.ok(GRAPH.has(n), `view node ${i}`);
    const there = roadPath(GATE_NODE, n);
    const back = roadPath(n, GATE_NODE);
    assert.ok(there && back, `path ${i}`);
    assert.equal(there[0], GATE_NODE);
    assert.equal(there.at(-1), n);
  }
});

test('hit testing finds habitats, locked lots and spots', () => {
  const p = plotRect(0);
  assert.deepEqual(hitTest(p.x + 10, p.y + 10, 1), { kind: 'habitat', habitat: 0 });
  const z = zoneRect(1);
  assert.deepEqual(hitTest(z.x + 320, z.y + 260, 1), { kind: 'lot', biome: 1 });
  const d = decoSpot(1);
  assert.deepEqual(hitTest(d.x, d.y, 1, { spots: true }), { kind: 'spot', spot: 1 });
  assert.equal(hitTest(WORLD.x0 + 1, WORLD.y0 + 1, 6), null);
});
