import test from 'node:test';
import assert from 'node:assert/strict';
import { cellShape, chunkShapes } from '../src/terrain.js';
import { buildMap, density, CELL } from '../src/map.js';
import { isClear } from '../src/gating.js';

test('marching squares: empty, full, and a half cell', () => {
  assert.equal(cellShape(0, 0, 0, 0, 0, 0, 32).poly, null);
  assert.ok(cellShape(1, 1, 1, 1, 0, 0, 32).full);
  const half = cellShape(0, 0, 1, 1, 0, 0, 32);
  assert.equal(half.segments.length, 1);
  const [[p, q]] = half.segments;
  assert.equal(p[1], 16);
  assert.equal(q[1], 16);
  // Segment runs left to right, so the water (above) is on its left.
  assert.ok(q[0] > p[0]);
});

test('a chunk of the real map yields rock shapes and edges', () => {
  const map = buildMap();
  const corner = (x, y) => map.corners[y * (map.cols + 1) + x];
  const s = chunkShapes(corner, 0, 0, 16, 16, CELL);
  assert.ok(s.full.length > 0 && s.polys.length > 0 && s.segments.length > 0);
});

test('roomy water cell centres are never solid after edge noise', () => {
  const map = buildMap();
  for (let y = 4; y < map.rows - 1; y++) {
    for (let x = 1; x < map.cols - 1; x++) {
      if (!isClear(map, x, y)) continue;
      assert.ok(density(map, x * CELL + 16, y * CELL + 16) < 0.5, `${x},${y}`);
    }
  }
});
