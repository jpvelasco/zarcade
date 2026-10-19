import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TUNING, GRAVITY, SNAP_MIN_DIVE, STALL_AOA, TRIM, clonePlane, createPlane,
  glideStats, liftCoefficient, speedOf, stepPlane, tuningFor,
} from '../src/flight.js';
import { FOLDS, PAPERS } from '../src/catalog.js';

const DT = 1 / 60;

function fly(steps, options = {}, plane = createPlane()) {
  for (let i = 0; i < steps; i += 1) stepPlane(plane, DT, options);
  return plane;
}

test('a released plane settles into a floaty glide', () => {
  const stats = glideStats();
  assert.ok(stats.speed > 9 && stats.speed < 13, `trim speed ${stats.speed}`);
  assert.ok(stats.sink > 0.5 && stats.sink < 1.4, `sink ${stats.sink}`);
  assert.ok(stats.ratio > 10 && stats.ratio < 15, `glide ratio ${stats.ratio}`);
});

test('the same inputs always fly the same flight', () => {
  const a = createPlane();
  const b = createPlane();
  for (let i = 0; i < 600; i += 1) {
    const dive = i % 97 < 40;
    stepPlane(a, DT, { dive });
    stepPlane(b, DT, { dive });
  }
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.equal(a.snapCount, b.snapCount);
});

test('a clone flies on exactly like the original, and does not disturb it', () => {
  const plane = fly(120);
  const copy = clonePlane(plane);
  const control = clonePlane(plane);
  for (let i = 0; i < 120; i += 1) {
    stepPlane(copy, DT, { dive: true });
    stepPlane(control, DT, { dive: true });
  }
  assert.equal(copy.x, control.x);
  assert.equal(copy.y, control.y);
});

test('holding the button trades height for speed, releasing trades it back', () => {
  const plane = fly(180);
  const startY = plane.y;
  const startSpeed = speedOf(plane);
  fly(90, { dive: true }, plane);
  const fast = speedOf(plane);
  assert.ok(fast > startSpeed + 3, `dive speed ${fast} vs ${startSpeed}`);
  assert.ok(plane.y > startY, 'a dive loses height');
  const bottom = plane.y;
  let top = plane.y;
  for (let i = 0; i < 180; i += 1) {
    stepPlane(plane, DT, {});
    top = Math.min(top, plane.y);
  }
  assert.ok(bottom - top > 4, `zoom climb was only ${bottom - top} m`);
});

test('soaring is the best glide: diving always costs distance per metre', () => {
  const soarer = createPlane();
  const diver = createPlane();
  for (let i = 0; i < 2400; i += 1) {
    stepPlane(soarer, DT, {});
    stepPlane(diver, DT, { dive: i % 80 < 40 });
  }
  assert.ok(soarer.x / soarer.y > diver.x / diver.y, 'a lazy glide should out-glide a porpoise');
  assert.ok(diver.x > soarer.x, 'but diving should cover more ground');
});

test('rising air lifts the plane without any input', () => {
  const plane = fly(300, { wind: { x: 0, y: -6 } });
  assert.ok(plane.y < -15, `expected a climb, got ${plane.y}`);
});

test('a headwind slows the ground speed, a tailwind speeds it up', () => {
  const head = fly(600, { wind: { x: -5, y: 0 } });
  const still = fly(600, {});
  const tail = fly(600, { wind: { x: 5, y: 0 } });
  assert.ok(head.x < still.x - 30);
  assert.ok(tail.x > still.x + 30);
});

test('rain soaks the paper, sun and dry air shed it', () => {
  const plane = fly(300, { rain: 1 });
  assert.ok(plane.soak > 0.7, `soak ${plane.soak}`);
  const sinkWet = plane.vy;
  fly(600, { drying: 2.4 }, plane);
  assert.ok(plane.soak < 0.05, `expected dry wings, got ${plane.soak}`);
  const dry = fly(300, {});
  assert.ok(sinkWet > dry.vy * 1.5, 'wet wings should sink faster');
});

test('the wing stalls past the stall angle instead of lifting harder', () => {
  const peak = liftCoefficient(STALL_AOA);
  assert.ok(liftCoefficient(STALL_AOA + 0.3) < peak * 0.6);
  assert.equal(liftCoefficient(-STALL_AOA), -peak);
  assert.equal(liftCoefficient(0), 0);
});

test('a snap needs a committed dive, and only lands once per dive', () => {
  const plane = fly(180);
  fly(Math.round(SNAP_MIN_DIVE * 60) + 30, { dive: true }, plane);
  const before = plane.snapCount;
  stepPlane(plane, DT, {});
  assert.equal(plane.snapCount, before + 1, 'releasing a real dive snaps');
  for (let i = 0; i < 60; i += 1) stepPlane(plane, DT, {});
  assert.equal(plane.snapCount, before + 1, 'and only once');

  const tapper = fly(180);
  for (let i = 0; i < 600; i += 1) stepPlane(tapper, DT, { dive: i % 10 < 5 });
  assert.equal(tapper.snapCount, 0, 'tapping is not a snap');
});

test('every fold and paper stays inside a fair spread', () => {
  const base = glideStats(DEFAULT_TUNING);
  for (const fold of FOLDS) {
    for (const paper of PAPERS) {
      const stats = glideStats(tuningFor(fold, paper));
      assert.ok(stats.ratio > base.ratio * 0.85 && stats.ratio < base.ratio * 1.15,
        `${fold.id}/${paper.id} glide ratio ${stats.ratio} vs ${base.ratio}`);
      assert.ok(stats.speed > 9 && stats.speed < 13, `${fold.id}/${paper.id} speed ${stats.speed}`);
    }
  }
});

test('waxed paper and the Sunray fold really do shed rain', () => {
  const plain = fly(240, { rain: 1, tuning: tuningFor(FOLDS[0], PAPERS[0]) });
  const waxed = fly(240, { rain: 1, tuning: tuningFor(FOLDS[5], PAPERS[8]) });
  assert.ok(waxed.soak < plain.soak * 0.75, `${waxed.soak} should be well under ${plain.soak}`);
});

test('speed is capped, so nothing can run away', () => {
  const plane = fly(1800, { dive: true });
  assert.ok(speedOf(plane) <= 34.001, `speed ${speedOf(plane)}`);
  assert.ok(Number.isFinite(plane.x) && Number.isFinite(plane.y));
});

test('the trim speed constant matches the model', () => {
  assert.ok(Math.abs(TRIM.speed - 11.15) < 0.1);
  assert.equal(GRAVITY, 14);
});
