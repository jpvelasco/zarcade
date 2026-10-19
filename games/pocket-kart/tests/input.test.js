import test from 'node:test';
import assert from 'node:assert/strict';
import { EasyDrift, TOUCH_RANGE, stickSteer, touchSteer } from '../src/input.js';

test('touch steering: a dead zone, a gentle curve, full lock at the edge', () => {
  assert.equal(touchSteer(0), 0);
  assert.equal(touchSteer(4), 0);
  assert.ok(touchSteer(20) > 0 && touchSteer(20) < 0.5);
  assert.equal(touchSteer(TOUCH_RANGE), 1);
  assert.equal(touchSteer(-TOUCH_RANGE * 2), -1);
  // Symmetric and never decreasing.
  let prev = 0;
  for (let dx = 0; dx <= TOUCH_RANGE; dx += 2) {
    assert.equal(touchSteer(-dx) + touchSteer(dx), 0);
    assert.ok(touchSteer(dx) >= prev);
    prev = touchSteer(dx);
  }
});

test('stick steering ignores drift near the middle', () => {
  assert.equal(stickSteer(0.1), 0);
  assert.equal(stickSteer(1), 1);
  assert.ok(stickSteer(-0.6) < 0);
});

test('easy drift: hold a hard turn at speed to start, straighten to release', () => {
  const e = new EasyDrift();
  assert.equal(e.update(1, true, 0.1), false);
  assert.equal(e.update(1, true, 0.1), false);
  assert.equal(e.update(1, true, 0.1), true);
  assert.equal(e.update(0.6, true, 0.1), true, 'easing a little keeps drifting');
  assert.equal(e.update(0.2, true, 0.1), false, 'straightening fires it');
  // Never while slow, and a wobble of the thumb resets the timer.
  const slow = new EasyDrift();
  for (let i = 0; i < 10; i++) assert.equal(slow.update(1, false, 0.1), false);
  const wobble = new EasyDrift();
  wobble.update(1, true, 0.2);
  wobble.update(0.3, true, 0.05);
  assert.equal(wobble.update(1, true, 0.2), false);
});
