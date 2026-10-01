import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closestOnSegment, closestOnArc, contact, resolve, makeBall, stepPhysics, substepsFor, crosses,
  STEP, BALL_R, MAX_SUBSTEP_MOVE, Flipper,
} from '../src/physics.js';

const wall = (o) => ({ kind: 'wall', layer: 0, enabled: true, e: 0.5, mu: 0, r: 0, ...o });
const seg = (ax, ay, bx, by, o = {}) => wall({ shape: 'seg', ax, ay, bx, by, ...o });
const arc = (x, y, R, a0, a1, o = {}) => wall({ shape: 'arc', x, y, R, a0, a1, ...o });
const circ = (x, y, r, o = {}) => wall({ shape: 'circle', x, y, r, ...o });

function run(ball, colliders, seconds, { flippers = [], gravity = true, onStep } = {}) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    if (!gravity) ball.vy -= 1250 * STEP; // cancel gravity for straight-line shots
    stepPhysics([ball], colliders, flippers, STEP);
    if (onStep) onStep(ball, i);
  }
  return ball;
}

test('closest point on a segment clamps to its ends', () => {
  const o = {};
  closestOnSegment(5, 5, 0, 0, 10, 0, o);
  assert.deepEqual([o.x, o.y, o.t], [5, 0, 0.5]);
  closestOnSegment(-4, 3, 0, 0, 10, 0, o);
  assert.deepEqual([o.x, o.y, o.t], [0, 0, 0]);
  closestOnSegment(14, -3, 0, 0, 10, 0, o);
  assert.deepEqual([o.x, o.y, o.t], [10, 0, 1]);
});

test('closest point on an arc stays on the arc, or snaps to the nearer end', () => {
  const o = {};
  // Top half of a circle (angles PI..2PI with +y down).
  closestOnArc(0, -50, 0, 0, 10, Math.PI, 2 * Math.PI, o);
  assert.ok(Math.abs(o.x) < 1e-9 && Math.abs(o.y + 10) < 1e-9);
  closestOnArc(3, 50, 0, 0, 10, Math.PI, 2 * Math.PI, o); // below: nearest end is (10, 0)
  assert.ok(Math.abs(o.x - 10) < 1e-9 && Math.abs(o.y) < 1e-9);
  closestOnArc(-3, 50, 0, 0, 10, Math.PI, 2 * Math.PI, o);
  assert.ok(Math.abs(o.x + 10) < 1e-9 && Math.abs(o.y) < 1e-9);
});

test('contact reports depth and an outward normal for every shape', () => {
  const out = {};
  const b = makeBall(0, -10);
  assert.ok(contact(b, seg(-50, 0, 50, 0), out) > 0);
  assert.ok(Math.abs(out.depth - (BALL_R - 10)) < 1e-9);
  assert.ok(Math.abs(out.ny + 1) < 1e-9);
  assert.equal(contact(makeBall(0, -20), seg(-50, 0, 50, 0), out), 0);
  assert.ok(contact(makeBall(25, 0), circ(0, 0, 15), out) > 0);
  assert.ok(Math.abs(out.nx - 1) < 1e-9);
  assert.ok(contact(makeBall(0, -95), arc(0, 0, 100, Math.PI, 2 * Math.PI), out) > 0);
  assert.ok(out.ny > 0.99, 'inside the arc, pushed back towards the centre');
});

test('a bounce keeps e of the approach speed; slow impacts come to rest', () => {
  const b = makeBall(0, 0, 0, 1000);
  resolve(b, 0, -1, 0, 0, 0, 0.5, 0);
  assert.ok(Math.abs(b.vy + 500) < 1e-9);
  const slow = makeBall(0, 0, 0, 30);
  resolve(slow, 0, -1, 0, 0, 0, 0.5, 0);
  assert.equal(slow.vy, 0);
});

test('a resting ball settles on a floor without jitter', () => {
  const b = run(makeBall(0, -40), [seg(-200, 0, 200, 0)], 2);
  assert.ok(Math.abs(b.y + BALL_R) < 0.5, `rests on the floor: y=${b.y}`);
  assert.ok(Math.abs(b.vy) < 6, `still: vy=${b.vy}`);
});

test('sub-steps keep every move under half a ball radius', () => {
  const fast = [makeBall(0, 0, 6000, 0)];
  const n = substepsFor(fast, [], STEP);
  assert.ok((6000 * STEP) / n <= MAX_SUBSTEP_MOVE + 1e-9);
  const f = new Flipper({ x: 0, y: 0, side: 'left' });
  f.pressed = true;
  assert.ok(substepsFor(fast, [f], STEP) > n, 'a swinging flipper adds sub-steps');
});

test('no tunnelling at 6000 units/s through thin walls, arcs, circles and posts', () => {
  const speed = 6000;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    // Thin wall (zero thickness) facing the ball.
    const w = seg(200 * dx - 300 * dy, 200 * dy + 300 * dx, 200 * dx + 300 * dy, 200 * dy - 300 * dx);
    const b = run(makeBall(0, 0, dx * speed, dy * speed), [w], 0.25, { gravity: false });
    assert.ok(b.x * dx + b.y * dy < 200, `wall at angle ${i}: ball got through`);
    // A small post in the way.
    const p = run(makeBall(0, 0, dx * speed, dy * speed), [circ(150 * dx, 150 * dy, 3)], 0.06, { gravity: false });
    assert.ok(p.x * dx + p.y * dy < 150, `post at angle ${i}`);
  }
  // Inside a closed arc (a full circle of radius 300): the ball never leaves.
  const ring = arc(0, 0, 300, 0, Math.PI * 2 - 1e-6);
  const b = run(makeBall(0, 0, 4243, 4243), [ring], 2, {
    onStep: (ball) => assert.ok(Math.hypot(ball.x, ball.y) < 300, 'escaped the ring'),
  });
  assert.ok(Math.hypot(b.vx, b.vy) > 0);
});

test('one-way walls block from one side only', () => {
  const gate = seg(-100, 0, 100, 0, { oneWay: { nx: 0, ny: -1 } }); // solid from above
  const fromBelow = run(makeBall(0, 60, 0, -1500), [gate], 0.1, { gravity: false });
  assert.ok(fromBelow.y < -20, 'passes from below');
  const fromAbove = run(makeBall(0, -60, 0, 1500), [gate], 0.1, { gravity: false });
  assert.ok(fromAbove.y < 0, 'blocked from above');
});

test('crosses() detects a move across a sensor line', () => {
  assert.equal(crosses(0, -5, 0, 5, -10, 0, 10, 0), true);
  assert.equal(crosses(0, -5, 0, -1, -10, 0, 10, 0), false);
  assert.equal(crosses(20, -5, 20, 5, -10, 0, 10, 0), false);
});

test('ball-to-ball hits trade momentum', () => {
  const a = makeBall(0, 0, 1000, 0), b = makeBall(40, 0, 0, 0);
  for (let i = 0; i < 20; i++) {
    a.vy = b.vy = 0;
    stepPhysics([a, b], [], [], STEP);
  }
  assert.ok(b.vx > 800 && a.vx < 200, `a ${a.vx} b ${b.vx}`);
});
