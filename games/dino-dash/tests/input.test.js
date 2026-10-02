import test from 'node:test';
import assert from 'node:assert/strict';
import { swipeStep } from '../src/input.js';

// Feed a swipe as evenly spaced pointer moves, like a phone does.
function swipe(x0, y0, x1, y1, steps) {
  const s = { x: x0, y: y0, fired: [] };
  const out = [];
  for (let i = 1; i <= steps; i++) {
    const a = swipeStep(s, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    if (a) out.push(a);
  }
  return out;
}

test('a long swipe is one action, not two lane changes', () => {
  assert.deepEqual(swipe(100, 500, 250, 505, 8), ['right']);
  assert.deepEqual(swipe(300, 500, 40, 520, 20), ['left']);
  assert.deepEqual(swipe(200, 700, 205, 450, 6), ['jump']);
});

test('short swipes and taps do nothing; a swipe fires before the finger lifts', () => {
  assert.deepEqual(swipe(200, 500, 215, 510, 3), []);
  assert.deepEqual(swipe(200, 500, 226, 500, 1), ['right']);
});

test('turning mid-swipe can add a different action', () => {
  const s = { x: 200, y: 600, fired: [] };
  assert.equal(swipeStep(s, 200, 560), 'jump');
  assert.equal(swipeStep(s, 150, 555), 'left');
  assert.equal(swipeStep(s, 100, 550), null);
});
