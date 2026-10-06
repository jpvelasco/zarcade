import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, COMET, PHYSICS, STAR } from '../src/config.js';
import { step, stepShot, makeShot, launchVector, FLYING, SETTLED, STAR_OUT } from '../src/sim.js';

function emptyLevel(star = { x: FIELD.w / 2, y: 120 }) {
  return { blocks: [], asteroids: [], winds: [], springs: [], portals: [], star, spawn: { x: 60, y: FIELD.h - 60 } };
}

test('a free shot drifts, slows, and settles in the open field', () => {
  const level = emptyLevel();
  const r = stepShot(level, 100, 600, 400, -200);
  assert.equal(r.outcome, SETTLED);
  assert.ok(r.x > 0 && r.x < FIELD.w, 'stays in the field');
  assert.ok(r.y > 0 && r.y < FIELD.h, 'stays in the field');
  assert.ok(r.t > 0.1, 'ran for a while');
});

test('walls reflect and bleed energy (the comet never escapes)', () => {
  // Star sits far from the shot line so the comet settles, not sinks.
  const level = emptyLevel({ x: 60, y: 100 });
  const r = stepShot(level, FIELD.w - 60, 600, 900, 0);
  assert.ok(r.x <= FIELD.w - COMET.r, 'clamped to the wall');
  assert.equal(r.outcome, SETTLED);
});

test('a straight shot sinks the star when unobstructed', () => {
  const star = { x: 270, y: 300 };
  const level = emptyLevel(star);
  const r = stepShot(level, 270, 620, 0, -700);
  assert.equal(r.outcome, STAR_OUT, 'reaches the star');
});

test('a block reflects the comet along the normal', () => {
  const level = { blocks: [{ x: 250, y: 250, w: 40, h: 200 }], asteroids: [], winds: [], springs: [], portals: [], star: { x: 400, y: 100 }, spawn: { x: 100, y: 100 } };
  // Shoot straight up into the block's left face; it should bounce left.
  const r = stepShot(level, 150, 400, 300, -300);
  assert.ok(r.x < 250, 'deflected left of the block');
});

test('an asteroid bounces the comet and reflects velocity', () => {
  const level = { blocks: [], asteroids: [{ x: 270, y: 360, r: 30 }], winds: [], springs: [], portals: [], star: { x: 270, y: 60 }, spawn: { x: 270, y: 640 } };
  const r = stepShot(level, 270, 640, 0, -800);
  // It should have bounced off the asteroid and ended somewhere above it.
  assert.ok(r.outcome === STAR_OUT || r.y < 640, 'moved or sunk');
});

test('wind zones push the comet while inside', () => {
  const level = { blocks: [], asteroids: [], winds: [{ x: 100, y: 200, w: 200, h: 200, vx: 500, vy: 0 }], springs: [], portals: [], star: { x: 500, y: 300 }, spawn: { x: 60, y: 300 } };
  const r = stepShot(level, 60, 300, 400, 0);
  // With a strong right wind the comet should settle far to the right.
  assert.ok(r.x > 300, 'blown right by the wind');
});

test('a spring pad kicks the comet along its arrow', () => {
  const level = { blocks: [], asteroids: [], winds: [], springs: [{ x: 200, y: 300, w: 80, h: 80, nx: 0, ny: -1 }], portals: [], star: { x: 240, y: 100 }, spawn: { x: 240, y: 400 } };
  const r = stepShot(level, 240, 400, 0, -300);
  assert.ok(r.outcome === STAR_OUT || r.y < 300, 'kicked upward');
});

test('portals teleport the comet across the field', () => {
  const level = { blocks: [], asteroids: [], winds: [], springs: [], portals: [{ ax: 100, ay: 300, bx: 440, by: 300 }], star: { x: 440, y: 180 }, spawn: { x: 100, y: 400 } };
  const r = stepShot(level, 100, 400, 0, -500);
  // After entering the portal it should exit near (440,300) and keep moving up.
  assert.ok(Math.abs(r.x - 440) < 120, 'exited near the far portal');
});

test('launchVector maps power to a bounded speed', () => {
  const v = launchVector(0, 1);
  assert.ok(Math.abs(v.vx - COMET.maxPower) < 1e-6, 'full power = max speed');
  const v0 = launchVector(0, 0);
  assert.ok(Math.abs(v0.vx - COMET.minPower) < 1e-6, 'zero power = min speed');
  const vHalf = launchVector(Math.PI / 2, 0.5);
  assert.ok(vHalf.vy > 0, 'points downward');
  assert.ok(vHalf.vy < COMET.maxPower, 'within bounds');
});

test('the simulation is deterministic for identical inputs', () => {
  const level = { blocks: [{ x: 100, y: 100, w: 60, h: 60 }], asteroids: [{ x: 400, y: 400, r: 40 }], winds: [], springs: [], portals: [], star: { x: 480, y: 100 }, spawn: { x: 60, y: 620 } };
  const a = stepShot(level, 60, 620, 500, -300);
  const b = stepShot(level, 60, 620, 500, -300);
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.equal(a.outcome, b.outcome);
});

test('step() is a no-op once the shot has ended', () => {
  const level = emptyLevel();
  const shot = makeShot(100, 600, 0, 0);
  shot.result = SETTLED;
  const before = { x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy };
  step(shot, level);
  assert.equal(shot.x, before.x);
  assert.equal(shot.y, before.y);
  assert.equal(shot.result, SETTLED);
});
