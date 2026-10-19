import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/worldgen.js';
import { T, LAYERS, MAIN_WORLD, DAILY_WORLD, PIECES, ORES } from '../src/data.js';

const SEEDS = ['meadow-1', 'meadow-2', 'pebble', 'zz-top'];

test('the same seed builds the same mine; another seed builds another', () => {
  const a = generateWorld('meadow-1'), b = generateWorld('meadow-1'), c = generateWorld('meadow-2');
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.deco, b.deco);
  assert.notDeepEqual(a.tiles, c.tiles);
});

test('every mine has a bedrock frame, the base pad and only known tiles', () => {
  for (const seed of SEEDS) {
    const w = generateWorld(seed);
    for (let y = 0; y < w.h; y++) {
      assert.equal(w.tiles[y * w.w], T.BEDROCK);
      assert.equal(w.tiles[y * w.w + w.w - 1], T.BEDROCK);
    }
    for (let x = 0; x < w.w; x++) assert.equal(w.tiles[(w.h - 1) * w.w + x], T.BEDROCK);
    for (let x = MAIN_WORLD.baseX0; x <= MAIN_WORLD.baseX1; x++) assert.equal(w.tiles[x], T.PAD);
    for (const c of w.tiles) {
      const ok = c <= T.ACORN || (c >= T.ORE0 && c < T.ORE0 + ORES.length) || (c >= T.RELIC0 && c < T.RELIC0 + PIECES.length);
      assert.ok(ok, `unknown tile ${c}`);
    }
  }
});

test('the top rows of every layer are solid, so each layer is gated', () => {
  for (const seed of SEEDS) {
    const w = generateWorld(seed);
    LAYERS.forEach((L, li) => {
      if (li === 0) return;
      for (let y = L.top; y < L.top + 2; y++) {
        for (let x = 1; x < w.w - 1; x++) assert.notEqual(w.tiles[y * w.w + x], T.EMPTY, `${seed} ${L.id} row ${y} col ${x}`);
      }
    });
    const lava = LAYERS.find((l) => l.id === 'lava');
    for (let x = 1; x < w.w - 1; x++) assert.equal(w.tiles[lava.top * w.w + x], T.LAVA, 'lava crust is complete');
  }
});

test('all 24 museum pieces are buried once, in their own layers', () => {
  for (const seed of SEEDS) {
    const w = generateWorld(seed);
    const found = new Map();
    w.tiles.forEach((c, i) => { if (c >= T.RELIC0 && c < T.RELIC0 + 24) found.set(c - T.RELIC0, Math.floor(i / w.w)); });
    assert.equal(found.size, 24, seed);
    for (const p of PIECES) {
      const row = found.get(p.index);
      const li = w.layerOf[row];
      const setLayers = { shells: [0], rex: [1, 2], gems: [3], grotto: [4], fire: [5], ruins: [6] }[p.set];
      assert.ok(setLayers.includes(li), `${p.id} in layer ${li}`);
    }
  }
});

test('the core sits in a chamber at the bottom of the ruins', () => {
  for (const seed of SEEDS) {
    const w = generateWorld(seed);
    assert.ok(w.core);
    assert.equal(w.tiles[w.core.y * w.w + w.core.x], T.CORE);
    assert.equal(w.layerOf[w.core.y], LAYERS.length - 1);
    assert.ok(w.core.y >= w.h - 4);
    assert.equal(w.tiles[(w.core.y - 1) * w.w + w.core.x], T.EMPTY, 'open chamber above the core');
  }
});

test('ores get richer with depth', () => {
  const w = generateWorld('meadow-1');
  const avg = LAYERS.map(() => ({ n: 0, v: 0 }));
  w.tiles.forEach((c, i) => {
    if (c < T.ORE0 || c >= T.ORE0 + ORES.length) return;
    const a = avg[w.layerOf[Math.floor(i / w.w)]];
    a.n++; a.v += ORES[c - T.ORE0].value;
  });
  for (let i = 1; i < avg.length; i++) assert.ok(avg[i].v / avg[i].n > avg[i - 1].v / avg[i - 1].n, `layer ${i}`);
  for (const a of avg) assert.ok(a.n > 60, 'every layer has plenty of ore');
});

test('the daily mine is small, has a Golden Acorn and no museum pieces', () => {
  const w = generateWorld('daily-2026-10-01', DAILY_WORLD);
  assert.equal(w.w, DAILY_WORLD.w);
  assert.equal(w.h, DAILY_WORLD.h);
  assert.ok(w.acorn);
  assert.equal(w.tiles[w.acorn.y * w.w + w.acorn.x], T.ACORN);
  assert.ok(!w.tiles.some((c) => c >= T.RELIC0));
  assert.ok(!w.tiles.includes(T.LAVA));
});

test('generation is quick', () => {
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) generateWorld(`speed-${i}`);
  assert.ok((performance.now() - t0) / 5 < 50);
});
