// Layer gating: every layer is reachable with the expected upgrades, and not
// before. A flood fill over tiles the pod could dig or move through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/worldgen.js';
import { Mine } from '../src/sim.js';
import { podStats } from '../src/game.js';
import { LAYERS, T } from '../src/data.js';

function reachable(world, upgrades) {
  const mine = new Mine({ ...world, tiles: world.tiles.slice() }, podStats(upgrades));
  const { w, h } = mine;
  const seen = new Uint8Array(w * h);
  const q = [];
  for (let x = 1; x < w - 1; x++) {
    if (mine.digInfo(x, 0).ok) { seen[x] = 1; q.push(x); }
  }
  let deepest = 0, core = false;
  while (q.length) {
    const i = q.pop();
    const x = i % w, y = Math.floor(i / w);
    deepest = Math.max(deepest, y);
    if (mine.tile(x, y) === T.CORE) core = true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
      const j = ny * w + nx;
      if (seen[j]) continue;
      if (mine.tile(nx, ny) === T.EMPTY || mine.digInfo(nx, ny).ok) { seen[j] = 1; q.push(j); }
    }
  }
  const layers = new Set();
  for (let i = 0; i < seen.length; i++) if (seen[i]) layers.add(world.layerOf[Math.floor(i / w)]);
  return { deepest, core, layers: Math.max(...layers) };
}

const base = { drill: 0, tank: 0, cargo: 0, hull: 0, lamp: 0, prop: 0, fan: 0 };
// The upgrades each layer expects: drill tier, and the Frost Fan for lava.
const EXPECT = [
  { layer: 0, up: { drill: 0 } },
  { layer: 1, up: { drill: 1 } },
  { layer: 2, up: { drill: 2 } },
  { layer: 3, up: { drill: 3 } },
  { layer: 4, up: { drill: 4 } },
  { layer: 5, up: { drill: 4, fan: 1 } },
  { layer: 6, up: { drill: 5, fan: 1 } },
];

for (const seed of ['meadow-1', 'meadow-2', 'tunnel']) {
  test(`every layer opens with its upgrade and stays shut without it (${seed})`, () => {
    const world = generateWorld(seed);
    for (const e of EXPECT) {
      const r = reachable(world, { ...base, ...e.up });
      assert.equal(r.layers, e.layer, `${LAYERS[e.layer].id} with ${JSON.stringify(e.up)}`);
    }
    assert.equal(reachable(world, { ...base, drill: 5, fan: 1 }).core, true, 'the core is reachable');
    assert.equal(reachable(world, { ...base, drill: 5, fan: 0 }).core, false, 'lava blocks the way without the fan');
  });
}
