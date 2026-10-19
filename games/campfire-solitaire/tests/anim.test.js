import test from 'node:test';
import assert from 'node:assert/strict';
import { Motion, approach, easeOutCubic, easeInOutCubic, easeOutBack } from '../src/anim.js';

test('eases start at 0 and end at 1', () => {
  for (const e of [easeOutCubic, easeInOutCubic, easeOutBack]) {
    assert.equal(e(0), 0);
    assert.ok(Math.abs(e(1) - 1) < 1e-9);
  }
  assert.ok(easeOutBack(0.8) > 1, 'back overshoots');
});

test('a motion eases to its target and settles', () => {
  const m = new Motion(0);
  m.set(100, 1000, 200);
  assert.equal(m.value(1000), 0);
  const mid = m.value(1100);
  assert.ok(mid > 50 && mid < 100, `eased mid value ${mid}`);
  assert.equal(m.value(1200), 100);
  assert.ok(m.moving(1150));
  assert.ok(!m.moving(1201));
});

test('retargeting mid-flight starts from the current value (no jump)', () => {
  const m = new Motion(0);
  m.set(100, 0, 200);
  const at = m.value(100);
  m.set(-50, 100, 200);
  assert.equal(m.value(100), at, 'continuous at the moment of retarget');
  assert.equal(m.value(300), -50);
});

test('a delay holds the start value, and zero duration snaps', () => {
  const m = new Motion(5);
  m.set(10, 0, 100, 50);
  assert.equal(m.value(25), 5);
  assert.equal(m.value(150), 10);
  m.set(20, 200, 0);
  assert.equal(m.value(200), 20);
  m.snap(3);
  assert.equal(m.value(0), 3);
});

test('setting the same target while moving does not restart it', () => {
  const m = new Motion(0);
  m.set(100, 0, 200);
  assert.equal(m.set(100, 50, 200), false);
  assert.equal(m.value(200), 100);
});

test('approach chases a target smoothly and frame-rate independently', () => {
  let a = 0;
  for (let i = 0; i < 60; i++) a = approach(a, 1, 3, 1 / 60);
  let b = 0;
  for (let i = 0; i < 30; i++) b = approach(b, 1, 3, 1 / 30);
  assert.ok(Math.abs(a - b) < 1e-9);
  assert.ok(a > 0.9 && a < 1);
});
