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
  assert.equal(G.nightConfig(3).thornbugs, 1);
  assert.equal(G.nightConfig(6).thornbugs, 3);
  assert.equal(G.nightConfig(99).thornbugs, 5);
  assert.ok(G.nightConfig(3).target > G.nightConfig(2).target);
  assert.equal(G.starsFor(249, 250), 0);
  assert.equal(G.starsFor(250, 250), 1);
  assert.equal(G.starsFor(375, 250), 2);
  assert.equal(G.starsFor(500, 250), 3);
});

test('weighted kinds count as more fireflies and keep their color', () => {
  const shy = { color: 'mint', kind: 'shy' };
  const r = G.scoreLoop([shy], 0); // one shy firefly counts as two
  assert.equal(r.harmony, true);
  assert.equal(r.points, 40);

  const queen = G.scoreLoop([{ color: 'rose', kind: 'queen' }, { color: 'rose', kind: 'normal' }], 0);
  assert.equal(queen.points, 360); // n = 6

  const mixed = G.scoreLoop([{ color: 'rose', kind: 'queen' }, { color: 'sky', kind: 'shy' }], 0);
  assert.equal(mixed.harmony, false); // queen and shy are not wildcards
  assert.equal(mixed.points, 70);
});

test('twins score 1.5 each', () => {
  const twin = { color: 'amber', kind: 'twin' };
  assert.equal(G.scoreLoop([twin, twin], 0).points, 90); // n = 3
});

test('every night from 4 to 9 introduces something new', () => {
  const fresh = [4, 5, 6, 7, 8, 9].map((n) => G.nightConfig(n).fresh);
  assert.deepEqual(fresh, ['shy', 'wind', 'twins', 'blackout', 'queen', 'swarm']);
  assert.equal(G.nightConfig(3).fresh, null);
  assert.equal(G.nightConfig(4).shy, true);
  assert.equal(G.nightConfig(5).twins, false);
  assert.equal(G.nightConfig(8).queen, true);
});

test('twists: none early, scheduled mid-game, rotating after night 10', () => {
  assert.equal(G.twistFor(3), null);
  assert.equal(G.twistFor(4), null); // shy night has no twist
  assert.equal(G.twistFor(5), 'wind');
  assert.equal(G.twistFor(7), 'blackout');
  assert.deepEqual([10, 11, 12, 13].map(G.twistFor), ['wind', 'blackout', 'swarm', 'wind']);
  assert.ok(G.nightConfig(9).fireflies > G.nightConfig(8).fireflies); // swarm
  assert.equal(G.nightConfig(1).target, 250);
});

test('pendingLoop predicts the loop about to close', () => {
  const trail = [p(0, 0), p(50, 0), p(100, 0), p(100, 50), p(100, 100), p(50, 100), p(0, 100), p(0, 50), p(5, 10)];
  const poly = G.pendingLoop(trail, 30, 6);
  assert.ok(poly);
  assert.deepEqual(poly[0], p(0, 0)); // nearest earlier point to the tip
  assert.equal(G.pointInPolygon(p(50, 50), poly), true);
  assert.equal(G.pendingLoop(trail.slice(0, 5), 30, 6), null); // too short
  assert.equal(G.pendingLoop([p(0, 0), p(50, 0), p(100, 0), p(150, 0), p(200, 0), p(250, 0), p(300, 0), p(350, 0)], 30, 6), null);
});

test('releaseLoop closes a loop lifted just short of its start', () => {
  // A square drawn almost all the way round, ending 30px from where it began.
  const nearly = [p(0, 0), p(50, 0), p(100, 0), p(100, 50), p(100, 100), p(50, 100), p(0, 100), p(0, 60), p(0, 30)];
  const poly = G.releaseLoop(nearly, 48, 6, 250);
  assert.ok(poly);
  assert.equal(G.pointInPolygon(p(50, 50), poly), true);
});

test('releaseLoop ignores open strokes, tiny loops and wide gaps', () => {
  const line = [p(0, 0), p(50, 0), p(100, 0), p(150, 0), p(200, 0), p(250, 0), p(300, 0), p(350, 0)];
  assert.equal(G.releaseLoop(line, 48, 6, 250), null);
  const tiny = [p(0, 0), p(6, 0), p(12, 0), p(12, 6), p(12, 12), p(6, 12), p(0, 12), p(0, 6)];
  assert.equal(G.releaseLoop(tiny, 48, 6, 250), null); // under the minimum area
  // A shallow U whose ends are close but which is mostly gap.
  const u = [p(0, 0), p(5, 20), p(10, 30), p(20, 34), p(30, 35), p(40, 34), p(50, 30), p(55, 20), p(45, 2)];
  assert.ok(G.pendingLoop(u, 48, 6), 'the ends are within reach');
  assert.equal(G.releaseLoop(u, 48, 6, 250), null);
});

test('the HUD streak multiplier matches the score and caps at 3', () => {
  assert.equal(G.streakMultiplier(0), 1);
  assert.equal(G.streakMultiplier(1), 1);
  assert.equal(G.streakMultiplier(2), 1.25);
  assert.equal(G.streakMultiplier(5), 2);
  assert.equal(G.streakMultiplier(40), 3);
  const two = [{ color: 'a', kind: 'normal' }, { color: 'a', kind: 'normal' }];
  for (let streak = 0; streak < 12; streak++) {
    const r = G.scoreLoop(two, streak);
    assert.equal(r.multiplier, G.streakMultiplier(r.streak));
  }
});

test('cleanSave keeps sane values and drops damaged ones', () => {
  assert.deepEqual(G.cleanSave({ bestNight: 4, bestTotal: 1230, muted: true }), { bestNight: 4, bestTotal: 1230, muted: true });
  for (const raw of [null, 5, 'x', [1, 2], {}]) {
    assert.deepEqual(G.cleanSave(raw), { bestNight: 0, bestTotal: 0, muted: false });
  }
  for (const bestNight of ['3', -4, 2.5, Infinity, NaN, null, 1e9]) {
    assert.equal(G.cleanSave({ bestNight }).bestNight, 0, String(bestNight));
  }
  assert.equal(G.cleanSave({ bestTotal: 'x' }).bestTotal, 0);
  assert.equal(G.cleanSave({ muted: 'yes' }).muted, false);
});
