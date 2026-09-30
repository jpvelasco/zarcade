import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME, planet, children, visiblePlanets, isReachable, parentOf, depthOf } from '../src/galaxy.js';
import { BIOMES } from '../src/biomes.js';
import { Lane } from '../src/lane.js';

test('planets regenerate identically from their id', () => {
  assert.deepEqual(planet('H.1.2.0'), planet('H.1.2.0'));
  assert.notEqual(planet('H.1.2.0').name, planet('H.1.2.1').name);
});

test('home has three children with a gentle first ring of biomes', () => {
  assert.deepEqual(children(HOME), ['H.0', 'H.1', 'H.2']);
  assert.deepEqual(children(HOME).map((id) => planet(id).biome), ['jungle', 'ice', 'lava']);
});

test('every planet branches into 2-3 more, forever', () => {
  let frontier = [HOME];
  for (let depth = 0; depth < 6; depth++) {
    const next = frontier.flatMap(children);
    for (const id of frontier) {
      const n = children(id).length;
      assert.ok(n >= 2 && n <= 3);
    }
    for (const id of next) {
      assert.equal(depthOf(id), depth + 1);
      assert.ok(BIOMES[planet(id).biome], `biome for ${id}`);
    }
    frontier = next.slice(0, 20);
  }
});

test('ghost worlds wait until depth 3', () => {
  for (let i = 0; i < 3; i++) for (const id of children(`H.${i}`)) assert.notEqual(planet(id).biome, 'ghost');
});

test('the map shows cleared planets and their children only', () => {
  assert.deepEqual(visiblePlanets({}).sort(), ['H', 'H.0', 'H.1', 'H.2']);
  const cleared = { 'H.1': 2 };
  const vis = visiblePlanets(cleared);
  for (const c of children('H.1')) assert.ok(vis.includes(c));
  assert.ok(!vis.some((id) => id.startsWith('H.0.')));
  assert.ok(isReachable('H.1.0', cleared));
  assert.ok(!isReachable('H.0.0', cleared));
  assert.equal(parentOf('H.1.0'), 'H.1');
});

test('lane frames are orthonormal with R pointing right on screen', () => {
  const lane = new Lane(1234);
  for (const s of [0, 500, 3000, 9000]) {
    const { T, R, U } = lane.frame(s);
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    for (const v of [T, R, U]) assert.ok(Math.abs(dot(v, v) - 1) < 1e-6);
    assert.ok(Math.abs(dot(T, R)) < 1e-6 && Math.abs(dot(T, U)) < 1e-6 && Math.abs(dot(R, U)) < 1e-6);
    assert.ok(U.y > 0.9, 'up stays up');
    assert.ok(T.z > 0.8, 'the lane heads toward +z');
  }
  const p = lane.toWorld(100, 5, 0), c = lane.center(100), f = lane.frame(100);
  assert.ok(Math.abs(p.x - (c.x + f.R.x * 5)) < 1e-9);
});
