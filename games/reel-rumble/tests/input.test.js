import test from 'node:test';
import assert from 'node:assert/strict';
import { mouseSteerFor, MOUSE_STEER } from '../src/input.js';

test('moving the mouse sideways during a fight steers, with a dead zone', () => {
  assert.equal(mouseSteerFor(0), 0);
  assert.equal(mouseSteerFor(MOUSE_STEER.dead), 0, 'a resting hand does not steer');
  assert.equal(mouseSteerFor(-MOUSE_STEER.full), -1);
  assert.equal(mouseSteerFor(400), 1, 'capped at full');
  const half = mouseSteerFor((MOUSE_STEER.dead + MOUSE_STEER.full) / 2);
  assert.ok(half > 0.4 && half < 0.6, `half way is about half (${half})`);
});
