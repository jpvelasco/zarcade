import test from 'node:test';
import assert from 'node:assert/strict';
import { flickNudge, settleTouch, NUDGE_SWIPE, Input } from '../src/input.js';

const touch = (side, kind = 'flip') => ({ x0: 100, y0: 600, side, kind, t0: 1000 });

test('a quick upward flick nudges towards its side, once per touch', () => {
  const left = touch('left');
  assert.equal(flickNudge(left, 104, 600 - NUDGE_SWIPE.px - 2, 1100), -1);
  assert.equal(flickNudge(left, 104, 500, 1150), 0, 'only once');
  assert.equal(flickNudge(touch('right'), 96, 540, 1100), 1);
});

test('holding, slow drags, sideways slides and plunger swipes do not nudge', () => {
  assert.equal(flickNudge(touch('left'), 100, 590, 1100), 0, 'too short');
  assert.equal(flickNudge(touch('left'), 100, 520, 1000 + NUDGE_SWIPE.ms + 50), 0, 'too slow');
  assert.equal(flickNudge(touch('left'), 180, 550, 1100), 0, 'mostly sideways');
  assert.equal(flickNudge(touch('right', 'plunge'), 100, 520, 1100), 0, 'plunging');
});

test('a touch held past the plunge becomes a flipper touch', () => {
  const t = { kind: 'pending' };
  assert.equal(settleTouch(t, true), 'pending', 'still a possible plunger swipe');
  assert.equal(settleTouch(t, false), 'flip', 'the ball has gone: the held thumb flips');
  const p = { kind: 'plunge' };
  assert.equal(settleTouch(p, false), 'plunge', 'a plunger swipe stays one');
});

test('one gamepad nudge press nudges once, and stale presses do not leak', () => {
  // Minimal browser stand-ins: the Input class only needs these.
  const g = globalThis;
  const had = { add: g.addEventListener, pads: Object.getOwnPropertyDescriptor(g, 'navigator') };
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const pad = { buttons, axes: [0, 0, 0, 0] };
  g.addEventListener = () => {};
  Object.defineProperty(g, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  try {
    const input = new Input({ addEventListener() {} });
    input.enabled = true;
    const press = (i, on) => { buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
    let nudges = 0;
    const frame = () => { input.pollPad(); if (input.read().nudge) nudges++; };
    press(2, true); frame(); frame();
    press(2, false);
    for (let i = 0; i < 30; i++) frame();
    assert.equal(nudges, 1, 'X nudges once per press');
    press(0, true); frame(); press(0, false); frame();
    assert.equal(input.consumePad('a'), false, 'an A press from an earlier frame is gone');
  } finally {
    g.addEventListener = had.add;
    if (had.pads) Object.defineProperty(g, 'navigator', had.pads); else delete g.navigator;
  }
});
