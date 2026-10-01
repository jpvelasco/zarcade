import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCATIONS } from '../src/locations.js';
import { Track, generateCircuit, generateSprint, RUNOFF, GATES } from '../src/track.js';

const KINDS = ['circuit', 'sprint'];

test('track generation is deterministic', () => {
  for (const loc of LOCATIONS) {
    const a = generateCircuit(loc.circuit), b = generateCircuit(loc.circuit);
    assert.deepEqual(a.pts, b.pts, `${loc.id} circuit`);
    const c = generateSprint(loc.sprint), d = generateSprint(loc.sprint);
    assert.deepEqual(c.pts, d.pts, `${loc.id} sprint`);
  }
  const t1 = new Track(LOCATIONS[0], 'circuit'), t2 = new Track(LOCATIONS[0], 'circuit');
  assert.deepEqual(t1.samples, t2.samples);
  assert.deepEqual(t1.coins, t2.coins);
  assert.deepEqual(t1.shortcuts, t2.shortcuts);
});

test('different seeds give different circuits', () => {
  const a = generateCircuit(LOCATIONS[0].circuit);
  const b = generateCircuit({ ...LOCATIONS[0].circuit, seed: 999 });
  assert.notDeepEqual(a.pts.slice(0, 20), b.pts.slice(0, 20));
});

test('every circuit closes on itself, in position and height', () => {
  for (const loc of LOCATIONS) {
    const t = new Track(loc, 'circuit');
    const first = t.samples[0], last = t.samples[t.samples.length - 1];
    const gap = Math.hypot(first.x - last.x, first.z - last.z);
    assert.ok(Math.abs(gap - t.step) < 0.2, `${loc.id}: last sample is one step from the first (${gap})`);
    assert.ok(Math.abs(first.y - last.y) < 0.2, `${loc.id}: heights meet`);
    assert.ok(Math.abs(t.samples.length * t.step - t.length) < 1e-6, `${loc.id}: length matches samples`);
    // pointAt wraps cleanly.
    const p0 = t.pointAt(0), pL = t.pointAt(t.length);
    assert.ok(Math.hypot(p0.x - pL.x, p0.z - pL.z) < 1e-6);
    assert.ok(t.length > 800 && t.length < 1600, `${loc.id}: lap length ${t.length}`);
  }
});

test('roads never come close to crossing themselves', () => {
  for (const loc of LOCATIONS) {
    for (const kind of KINDS) {
      const t = new Track(loc, kind);
      const n = t.samples.length;
      const gap = Math.ceil(80 / t.step);
      const min = t.width + RUNOFF * 2 + 4;
      for (let i = 0; i < n; i += 3) {
        for (let j = i + gap; j < n; j += 3) {
          if (t.closed && n - (j - i) < gap) continue;
          const d = Math.hypot(t.samples[i].x - t.samples[j].x, t.samples[i].z - t.samples[j].z);
          assert.ok(d > min, `${t.id}: samples ${i} and ${j} are ${d.toFixed(1)} m apart`);
        }
      }
    }
  }
});

test('walls line both sides of every road, with gaps only at shortcuts', () => {
  for (const loc of LOCATIONS) {
    for (const kind of KINDS) {
      const t = new Track(loc, kind);
      for (const side of [-1, 1]) {
        const segs = t.walls.filter((w) => w.side === side);
        assert.ok(segs.length > t.samples.length * 0.4, `${t.id} side ${side} has walls`);
        // Normals face the road.
        for (const w of segs) {
          const p = t.nearestGlobal((w.ax + w.bx) / 2, (w.az + w.bz) / 2);
          const c = t.pointAt(p.along);
          const mx = (w.ax + w.bx) / 2, mz = (w.az + w.bz) / 2;
          assert.ok((c.x - mx) * w.nx + (c.z - mz) * w.nz > 0, `${t.id}: wall normal faces the road`);
        }
      }
      if (!t.closed) assert.equal(t.walls.filter((w) => w.cap).length, 2, `${t.id}: sprint has end caps`);
    }
  }
});

test('shortcuts cut a bend through the infield and save distance', () => {
  let found = 0;
  for (const loc of LOCATIONS) {
    const t = new Track(loc, 'circuit');
    if (!loc.circuit.shortcuts) assert.equal(t.shortcuts.length, 0);
    for (const sc of t.shortcuts) {
      found++;
      assert.equal(sc.side, t.interiorSide, `${t.id}: shortcut on the infield side`);
      assert.ok(sc.b - sc.a > sc.len * 1.25, `${t.id}: shortcut saves distance`);
      // The midpoint is well away from the road.
      const mid = t.nearestGlobal((sc.ax + sc.bx) / 2, (sc.az + sc.bz) / 2);
      assert.ok(Math.abs(mid.lateral) > t.wallOffset + 4);
      // Inner wall has gaps at both crossings.
      const inner = t.walls.filter((w) => w.side === sc.side);
      for (const cross of [sc.crossA, sc.crossB]) {
        assert.ok(!inner.some((w) => Math.abs(t.delta(w.dist + t.step, cross)) < 6), `${t.id}: gap at ${cross}`);
      }
      // No gate inside the shortcut span.
      assert.ok(!t.gates.some((g) => g > sc.a - 10 && g < sc.b + 10), `${t.id}: gates clear of the shortcut`);
    }
  }
  assert.ok(found >= 5, `at least five circuits have shortcuts (${found})`);
});

test('gates are ordered, inside the lap, and there are enough of them', () => {
  for (const loc of LOCATIONS) {
    for (const kind of KINDS) {
      const t = new Track(loc, kind);
      assert.ok(t.gates.length >= GATES - 2, `${t.id}: ${t.gates.length} gates`);
      for (let i = 1; i < t.gates.length; i++) assert.ok(t.gates[i] > t.gates[i - 1]);
      const lo = t.closed ? 0 : t.startDist, hi = t.closed ? t.length : t.finishDist;
      assert.ok(t.gates[0] > lo && t.gates[t.gates.length - 1] < hi);
    }
  }
});

test('surfaces, ramps, pads and coins are placed on the road', () => {
  for (const loc of LOCATIONS) {
    for (const kind of KINDS) {
      const t = new Track(loc, kind);
      const kinds = new Set(t.samples.map((s) => s.surface));
      assert.ok(kinds.has(loc.surface));
      if (loc.patchShare) assert.ok(kinds.has(loc.patch), `${t.id}: has ${loc.patch} patches`);
      assert.ok(t.ramps.length >= 1, `${t.id}: has a jump`);
      assert.ok(t.pads.length >= 2, `${t.id}: has boost pads`);
      for (const p of t.pads) assert.ok(Math.abs(p.lateral) + p.width / 2 <= t.half);
      assert.ok(t.coins.length >= 30);
      for (const c of t.coins.filter((c) => c.shortcut === undefined)) {
        const near = t.nearestGlobal(c.x, c.z);
        assert.ok(Math.abs(near.lateral) < t.half, `${t.id}: coin on the road`);
      }
    }
  }
});

test('nearestLocal projects points back onto the road', () => {
  const t = new Track(LOCATIONS[3], 'circuit');
  for (let d = 0; d < t.length; d += 37) {
    const p = t.pointAt(d, 3);
    const near = t.nearestLocal(p.x, p.z, t.indexAt(d), 6);
    assert.ok(Math.abs(t.delta(near.along, d)) < 0.6, `along at ${d}`);
    assert.ok(Math.abs(near.lateral - 3) < 0.4, `lateral at ${d}: ${near.lateral}`);
  }
});

test('the racing line hugs the inside of corners', () => {
  const t = new Track(LOCATIONS[2], 'circuit');
  let checked = 0;
  for (const s of t.samples) {
    if (Math.abs(s.wide) < 0.025) continue;
    checked++;
    // Right-hand bends (curvature < 0) have the inside on the right (+).
    assert.equal(Math.sign(s.line), -Math.sign(s.wide));
  }
  assert.ok(checked > 10);
});
