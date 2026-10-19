import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, findPath, W, H, idx, BUILDINGS, FIELD_A, FIELD_B, GREENHOUSE, PLAYER_START, SPOTS, spotFor, homeOf, LANTERNS, G } from '../src/map.js';
import { VILLAGER_IDS, VILLAGERS, FESTIVALS } from '../src/data.js';
import { scheduleSpot } from '../src/villagers.js';

const passableOn = (m) => (x, y) => x >= 0 && y >= 0 && x < W && y < H && !m.solid[idx(x, y)];

test('the map is seeded and stable', () => {
  const a = buildMap(4), b = buildMap(4);
  assert.deepEqual(a.ground, b.ground);
  assert.notDeepEqual(buildMap(4).ground, buildMap(5).ground);
});

for (const seed of [1, 2, 3, 99]) {
  test(`every interactable and spot can be reached on seed ${seed}`, () => {
    const m = buildMap(seed);
    const pass = passableOn(m);
    assert.ok(pass(...PLAYER_START));
    for (const [k, it] of m.interact) {
      const x = k % W, y = Math.floor(k / W);
      if (it.kind === 'greenhouse') continue;
      const path = findPath(pass, PLAYER_START, (tx, ty) => pass(tx, ty) && Math.abs(tx - x) + Math.abs(ty - y) === 1);
      assert.ok(path, `${it.kind} at ${x},${y} unreachable`);
    }
    for (const [name, list] of Object.entries(SPOTS)) {
      for (const [x, y] of list) {
        assert.ok(pass(x, y), `${name} spot ${x},${y} is blocked`);
        assert.ok(findPath(pass, PLAYER_START, (tx, ty) => tx === x && ty === y), `${name} spot unreachable`);
      }
    }
    for (const id of VILLAGER_IDS) {
      const [x, y] = spotFor(`home:${id}`);
      assert.ok(pass(x, y), `${id}'s doorstep is blocked`);
      assert.ok(findPath(pass, PLAYER_START, (tx, ty) => tx === x && ty === y), `${id}'s door unreachable`);
    }
  });
}

test('fields and greenhouse plots are open ground', () => {
  const m = buildMap(1);
  for (let y = FIELD_B.y0; y <= FIELD_B.y1; y++) for (let x = FIELD_B.x0; x <= FIELD_B.x1; x++) assert.equal(m.solid[idx(x, y)], 0, `field ${x},${y}`);
  const p = GREENHOUSE.plots;
  for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) assert.equal(m.ground[idx(x, y)], G.FLOOR);
  assert.ok(FIELD_A.x1 <= FIELD_B.x1 && FIELD_A.y1 <= FIELD_B.y1);
});

test('buildings never overlap and every villager has a home', () => {
  const seen = new Set();
  for (const b of BUILDINGS) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
    assert.ok(!seen.has(idx(x, y)), `${b.id} overlaps at ${x},${y}`);
    seen.add(idx(x, y));
  }
  for (const id of VILLAGER_IDS) assert.ok(homeOf(id), `${id} has a home`);
  assert.equal(LANTERNS.length, FESTIVALS.lanterns.total);
});

test('villager schedules only name known places', () => {
  for (const id of VILLAGER_IDS) {
    for (const list of [VILLAGERS[id].schedule, VILLAGERS[id].rainSchedule]) {
      for (const [, spot] of list) assert.ok(spot.startsWith('home:') ? homeOf(spot.slice(5)) : SPOTS[spot], `${id}: ${spot}`);
    }
    for (let m = 6 * 60; m < 26 * 60; m += 30) assert.ok(scheduleSpot(id, m, 'sunny', null));
  }
});
