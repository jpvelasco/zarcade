import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain, SNOW } from '../src/terrain.js';

function flat(extra = []) {
  const t = new Terrain({ dx: 5, seed: 1, startGrade: 0 });
  t.addSegment({ t: 'slope', len: 1000, grade: 0, items: [] });
  for (const s of extra) t.addSegment(s);
  return t;
}

test('a flat slope holds a ball exactly one radius above the ground', () => {
  const t = flat();
  const c = t.support(500, 20, -100);
  assert.ok(Math.abs(c.y - (t.groundY(500) - 20)) < 0.01);
  assert.ok(Math.abs(c.nx) < 1e-6 && Math.abs(c.ny + 1) < 1e-6);
});

test('the contact normal on a straight slope matches the surface, without jitter', () => {
  const t = new Terrain({ dx: 4, seed: 1, startGrade: 0.3 });
  t.addSegment({ t: 'slope', len: 4000, grade: 0.3, items: [] });
  const want = 0.3 / Math.hypot(0.3, 1);
  for (let x = 1000; x < 1100; x += 1.3) {
    const c = t.support(x, 10, -1e9);
    assert.ok(Math.abs(c.nx - want) < 1e-3, `nx at ${x}: ${c.nx}`);
  }
});

test('grades ease in and rises, dips and kickers shape the ground', () => {
  const t = flat([{ t: 'rise', len: 400, h: 80, grade: 0 }, { t: 'dip', len: 400, depth: 60, grade: 0 }, { t: 'kicker', len: 200, h: 50, grade: 0 }, { t: 'slope', len: 200, grade: 0 }]);
  const base = t.groundY(0);
  assert.ok(t.groundY(1200) < base - 79, 'rise peak');
  assert.ok(t.groundY(1600) > base + 59, 'dip bottom');
  assert.ok(t.groundY(1990) < base - 40, 'kicker lip');
  assert.ok(Math.abs(t.groundY(2010) - base) < 1, 'drop after the lip');
  assert.equal(t.kickers.length, 1);
});

test('rolling consumes fresh snow once, weighted by snow type', () => {
  const t = new Terrain({ dx: 5, seed: 1, startGrade: 0 });
  t.addSegment({ t: 'slope', len: 100, grade: 0, snow: 'powder', items: [] });
  t.addSegment({ t: 'slope', len: 100, grade: 0, snow: 'ice', items: [] });
  const powder = t.consume(10, 60);
  assert.ok(powder > 50 * 1.5);
  assert.equal(t.consume(10, 60), 0, 'packed snow does not grow again');
  assert.equal(t.consume(120, 180), 0, 'ice never grows the ball');
  assert.equal(t.snowAt(150), SNOW.ice);
});

test('bridge decks hold only allowed balls and only from above', () => {
  const t = flat([{ t: 'bridge', len: 400, max: 30, depth: 120, grade: 0, items: [] }, { t: 'slope', len: 300, grade: 0 }]);
  const br = t.bridges[0];
  const x = (br.x0 + br.x1) / 2;
  const on = t.support(x, 10, br.y0 - 50, () => true);
  assert.equal(on.bridge, br);
  assert.ok(Math.abs(on.y - (br.y0 - 10)) < 0.5);
  const through = t.support(x, 10, br.y0 - 50, () => false);
  assert.equal(through.bridge, null);
  assert.ok(through.y > br.y0 + 100, 'falls into the gully');
  const below = t.support(x, 10, t.groundY(x) - 10, () => true);
  assert.equal(below.bridge, null, 'a ball already in the gully is not lifted onto the deck');
});

test('gates, items and the finish are placed deterministically from the seed', () => {
  const build = (seed) => {
    const t = new Terrain({ dx: 5, seed, startGrade: 0.2 });
    t.addSegment({ t: 'slope', len: 2000, grade: 0.2, items: [['pinecone', 5], ['mitten', 3]] });
    t.addSegment({ t: 'gate', len: 200, min: 40, grade: 0.05 });
    t.addSegment({ t: 'finish', len: 500 });
    return t;
  };
  const a = build(7), b = build(7), c = build(8);
  assert.deepEqual(a.items.map((i) => [i.type, i.x]), b.items.map((i) => [i.type, i.x]));
  assert.notDeepEqual(a.items.map((i) => i.x), c.items.map((i) => i.x));
  assert.equal(a.items.length, 8);
  for (let i = 1; i < a.items.length; i++) assert.ok(a.items[i].x >= a.items[i - 1].x, 'items stay sorted by x');
  assert.equal(a.gates.length, 1);
  assert.equal(a.gates[0].min, 40);
  assert.ok(Number.isFinite(a.finishX) && a.finishX > a.gates[0].x);
});
