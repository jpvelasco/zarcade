import test from 'node:test';
import assert from 'node:assert/strict';
import { hopLifts } from '../src/geom.js';

const east = (x, y) => ({ x, y, a: 0 });
const south = (x, y) => ({ x, y, a: Math.PI / 2 });

test('an engine crossing just behind a carriage hops over it', () => {
  // Train 0 heads east across the crossing; train 1 comes down from the north.
  const poses = [
    { head: east(0.85, 0), car: east(0.15, 0) },
    { head: south(0.15, -0.1), car: south(0.15, -0.8) },
  ];
  const [a, b] = hopLifts(poses, 0.55);
  assert.equal(a, 0);
  assert.ok(b > 0.5, `lift ${b}`);
});

test('lift grows smoothly from zero as the sprites close in', () => {
  const at = (gap) => hopLifts([
    { head: east(1, 0), car: east(0.3, 0) },
    { head: south(0.3, -gap), car: south(0.3, -gap - 0.7) },
  ], 0.55)[1];
  assert.equal(at(0.6), 0);
  assert.ok(at(0.5) > 0 && at(0.5) < at(0.3) && at(0.3) < at(0.1));
  assert.ok(at(0) <= 1);
});

test('a train following another along the same track does not hop', () => {
  const poses = [
    { head: east(1, 0), car: east(0.3, 0) },
    { head: east(0, 0), car: east(-0.7, 0) },
  ];
  assert.deepEqual(hopLifts(poses, 0.55), [0, 0]);
});

test('engines meeting, or a bonked pair, never hop', () => {
  const meeting = [
    { head: east(0, 0), car: east(-0.7, 0) },
    { head: south(0.1, 0), car: south(0.1, -0.7) },
  ];
  assert.deepEqual(hopLifts(meeting, 0.55), [0, 0]);
  const poses = [
    { head: east(0.85, 0), car: east(0.15, 0) },
    { head: south(0.15, -0.1), car: south(0.15, -0.8) },
  ];
  assert.deepEqual(hopLifts(poses, 0.55, [[1, 0]]), [0, 0]);
});

test('missing trains and carriages are ignored', () => {
  assert.deepEqual(hopLifts([null, { head: east(0, 0), car: null }], 0.55), [0, 0]);
});
