const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../logic.js');

const p = (x, y) => ({ x, y });

test('segmentIntersection finds crossings and ignores misses', () => {
  assert.deepEqual(G.segmentIntersection(p(0, 0), p(10, 10), p(0, 10), p(10, 0)), p(5, 5));
  assert.equal(G.segmentIntersection(p(0, 0), p(1, 1), p(5, 0), p(6, 1)), null);
  assert.equal(G.segmentIntersection(p(0, 0), p(10, 0), p(0, 1), p(10, 1)), null); // parallel
});

test('pointInPolygon and polygonArea on a square', () => {
  const sq = [p(0, 0), p(10, 0), p(10, 10), p(0, 10)];
  assert.equal(G.pointInPolygon(p(5, 5), sq), true);
  assert.equal(G.pointInPolygon(p(15, 5), sq), false);
  assert.equal(G.polygonArea(sq), 100);
});

test('findLoop detects a closed loop and returns its polygon', () => {
  const trail = [p(0, 0), p(10, 0), p(10, 10), p(5, 10)];
  const loop = G.findLoop(trail, p(5, -5)); // crosses the first segment at (5, 0)
  assert.ok(loop);
  assert.deepEqual(loop.point, p(5, 0));
  assert.deepEqual(loop.polygon, [p(5, 0), p(10, 0), p(10, 10), p(5, 10)]);
  assert.equal(G.pointInPolygon(p(7, 5), loop.polygon), true);
});

test('findLoop ignores the adjacent segment and open paths', () => {
  assert.equal(G.findLoop([p(0, 0), p(10, 0)], p(20, 0)), null);
  assert.equal(G.findLoop([p(0, 0), p(10, 0), p(20, 5)], p(30, 5)), null);
});

test('trimToLength drops the oldest points', () => {
  const trail = [p(0, 0), p(10, 0), p(20, 0), p(30, 0)];
  G.trimToLength(trail, 15);
  assert.deepEqual(trail, [p(20, 0), p(30, 0)]);
});

test('scoreLoop rewards single-color loops quadratically', () => {
  const amber = { color: 'amber', kind: 'normal' };
  const mint = { color: 'mint', kind: 'normal' };
  const r = G.scoreLoop([amber, amber, amber], 0);
  assert.equal(r.harmony, true);
  assert.equal(r.points, 90);
  assert.equal(r.streak, 1);

  const mixed = G.scoreLoop([amber, mint, amber], 3);
  assert.equal(mixed.harmony, false);
  assert.equal(mixed.points, 30);
  assert.equal(mixed.streak, 0);
});

test('scoreLoop treats gold and rainbow as wildcards and gold adds time', () => {
  const r = G.scoreLoop([
    { color: 'rose', kind: 'normal' },
    { color: 'mint', kind: 'rainbow' },
    { color: 'sky', kind: 'gold' },
  ], 0);
  assert.equal(r.harmony, true);
  assert.equal(r.bonusTime, 5);
});

test('scoreLoop streak multiplier grows and caps at 3', () => {
  const two = [{ color: 'a', kind: 'normal' }, { color: 'a', kind: 'normal' }];
  assert.equal(G.scoreLoop(two, 1).multiplier, 1.25);
  assert.equal(G.scoreLoop(two, 1).points, 50);
  assert.equal(G.scoreLoop(two, 50).multiplier, 3);
});

test('a single firefly is never a harmony', () => {
  const r = G.scoreLoop([{ color: 'a', kind: 'normal' }], 4);
  assert.equal(r.harmony, false);
  assert.equal(r.points, 10);
  assert.equal(r.streak, 0);
});

test('nightConfig ramps difficulty and starsFor thresholds', () => {
  assert.equal(G.nightConfig(1).thornbugs, 0);
  assert.equal(G.nightConfig(2).thornbugs, 1);
  assert.equal(G.nightConfig(99).thornbugs, 6);
  assert.ok(G.nightConfig(3).target > G.nightConfig(2).target);
  assert.equal(G.starsFor(249, 250), 0);
  assert.equal(G.starsFor(250, 250), 1);
  assert.equal(G.starsFor(375, 250), 2);
  assert.equal(G.starsFor(500, 250), 3);
});
