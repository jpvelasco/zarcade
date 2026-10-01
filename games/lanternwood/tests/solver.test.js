import test from 'node:test';
import assert from 'node:assert/strict';
import { allAreas, liveGrid, F } from '../src/areas.js';
import { grappleLanding, solvePlates, flood, entityBlockers, newState, explore } from '../src/solver.js';
import { ROOM_W, ROOM_H } from '../src/tiles.js';

const areas = allAreas();

test('the chasm vine post lands you on the far side', () => {
  const ow = areas.overworld;
  const grid = liveGrid(ow, new Set());
  // Chasm Bend is screen (1,1); standing at local (9,5) facing north.
  const x = 20 + 9, y = 12 + 5;
  const land = grappleLanding(ow, grid, x, y, 0, -1, 1, 1);
  assert.equal(land, (12 + 2) * ow.w + x);
  assert.equal(grappleLanding(ow, grid, x + 1, y, 0, -1, 1, 1), null, 'no post in that column');
});

test('without vine seeds the chasm cannot be crossed', () => {
  const ow = areas.overworld;
  const grid = liveGrid(ow, new Set());
  const reach = flood(ow, grid, entityBlockers(ow, new Set()), [ow.start.y * ow.w + ow.start.x], { sword: true });
  assert.ok(!reach.has((12 + 2) * ow.w + 29));
  const reach2 = flood(ow, grid, entityBlockers(ow, new Set()), [ow.start.y * ow.w + ow.start.x], { grapple: true });
  assert.ok(reach2.has((12 + 2) * ow.w + 29));
});

test('the Pebble Push puzzle has a short solution', () => {
  const area = areas.burrow;
  const grid = liveGrid(area, new Set());
  const reach = new Set([(1 * ROOM_H + 10) * area.w + 0 * ROOM_W + 12]);
  const plan = solvePlates(area, grid, new Set(), 0, 1, reach);
  assert.ok(plan && plan.length >= 4 && plan.length <= 8, `plan of ${plan && plan.length}`);
});

test('a block jammed in a corner is reported unsolvable', () => {
  const area = areas.burrow;
  const grid = liveGrid(area, new Set());
  const reach = new Set([(1 * ROOM_H + 10) * area.w + 12]);
  const corner = (1 * ROOM_H + 10) * area.w + 1; // bottom-left interior corner
  assert.equal(solvePlates(area, grid, new Set(), 0, 1, reach, 50000, [corner]), null);
});

test('explore collects chests and offers the locked door once the key is found', () => {
  const area = areas.burrow;
  const s = newState();
  const { options } = explore(area, s, [area.start.y * area.w + area.start.x]);
  assert.equal(s.keys.burrow, 1);
  assert.deepEqual(options.map((l) => l.id), ['burrow:1,1:e']);
  assert.ok(s.flags.has(F.solved('burrow', '0,2')));
});
