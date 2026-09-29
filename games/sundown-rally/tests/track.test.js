import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, STEP, generateCenterline } from '../src/track.js';
import { TRACKS } from '../src/tracks.js';

for (const def of TRACKS) {
  test(`${def.id}: track has the requested length and never nears itself`, () => {
    const t = new Track(def);
    assert.ok(Math.abs(t.length - def.length) <= STEP, `length ${t.length}`);
    const clearance = def.width * 2 + 50;
    const gap = Math.ceil((clearance * 3) / STEP);
    for (let i = 0; i < t.samples.length; i += 4) {
      for (let j = i + gap; j < t.samples.length; j += 4) {
        const d = Math.hypot(t.samples[i].x - t.samples[j].x, t.samples[i].z - t.samples[j].z);
        assert.ok(d >= clearance, `samples ${i} and ${j} are ${d.toFixed(1)} m apart`);
      }
    }
  });
}

test('generation is deterministic for a seed', () => {
  const a = generateCenterline(TRACKS[0]);
  const b = generateCenterline(TRACKS[0]);
  assert.deepEqual(a, b);
});

test('pointAt and project agree on distance and sideways offset', () => {
  const t = new Track(TRACKS[1]);
  for (const [dist, lateral] of [[100, 0], [640, 3.5], [1500, -5], [2400, 2]]) {
    const p = t.pointAt(dist, lateral);
    const near = t.nearestLocal(p.x, p.z, Math.floor(dist / STEP));
    assert.ok(Math.abs(near.along - dist) < 1.5, `along ${near.along} vs ${dist}`);
    assert.ok(Math.abs(near.lateral - lateral) < 0.3, `lateral ${near.lateral} vs ${lateral}`);
    assert.deepEqual(t.nearest(p.x, p.z).index, near.index);
  }
});

test('ground height equals the road surface on the road', () => {
  const t = new Track(TRACKS[0]);
  for (const dist of [50, 700, 1800]) {
    const p = t.pointAt(dist, 2);
    assert.ok(Math.abs(t.groundHeight(p.x, p.z) - t.roadHeightAt(dist)) < 0.05);
  }
});

test('ground height is continuous moving away from the road', () => {
  const t = new Track(TRACKS[0]);
  let prev = null;
  for (let lat = 0; lat < 300; lat += 1) {
    const p = t.pointAt(900, lat);
    const h = t.groundHeight(p.x, p.z);
    if (prev !== null) assert.ok(Math.abs(h - prev) < 1.2, `jump of ${(h - prev).toFixed(2)} m at ${lat} m`);
    prev = h;
  }
});

test('canyon walls rise beside the road', () => {
  const t = new Track(TRACKS.find((d) => d.walls));
  const road = t.roadHeightAt(1000);
  const p = t.pointAt(1000, t.half + t.def.walls.from + 20);
  assert.ok(t.groundHeight(p.x, p.z) - road > t.def.walls.height * 0.7);
});
