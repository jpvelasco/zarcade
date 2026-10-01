import test from 'node:test';
import assert from 'node:assert/strict';
import { collideBlobs, collideBumper, radialPush, momentum } from '../src/physics.js';

const blob = (x, y, vx = 0, vy = 0, mass = 1, radius = 30) => ({ x, y, vx, vy, mass, radius });

test('blobs that do not touch are left alone', () => {
  const a = blob(0, 0, 100), b = blob(61, 0);
  assert.equal(collideBlobs(a, b), null);
  assert.equal(a.vx, 100);
});

test('a head-on bump conserves momentum, with or without the boost', () => {
  for (const boost of [0, 150, 400]) {
    const a = blob(0, 0, 500, 20), b = blob(55, 5, -100, 0);
    const before = momentum([a, b]);
    const hit = collideBlobs(a, b, { boost });
    assert.ok(hit);
    const after = momentum([a, b]);
    assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9, `boost ${boost}`);
  }
});

test('the hit blob flies off and the hitter slows down', () => {
  const a = blob(0, 0, 600), b = blob(58, 0);
  collideBlobs(a, b, { restitution: 0.7, boost: 0 });
  assert.ok(b.vx > 450, `victim ${b.vx}`);
  assert.ok(a.vx < 150, `hitter ${a.vx}`);
  // Elastic-ish: no energy is created without a boost.
  const ke = (o) => 0.5 * o.mass * (o.vx ** 2 + o.vy ** 2);
  assert.ok(ke(a) + ke(b) <= 0.5 * 600 ** 2 + 1e-6);
});

test('a heavier blob is pushed less and pushes more', () => {
  const light = blob(58, 0), heavy = blob(0, 0, 400, 0, 2.4);
  collideBlobs(heavy, light, { boost: 0 });
  const light2 = blob(58, 0), normal = blob(0, 0, 400, 0, 1);
  collideBlobs(normal, light2, { boost: 0 });
  assert.ok(light.vx > light2.vx);
  // Overlap is resolved, mostly by moving the lighter blob.
  assert.ok(Math.hypot(light.x - heavy.x, light.y - heavy.y) >= 60 - 1e-9);
});

test('resting contact separates without bouncing', () => {
  const a = blob(0, 0), b = blob(50, 0);
  const hit = collideBlobs(a, b, { boost: 200 });
  assert.ok(hit);
  assert.equal(hit.impulse, 0);
  assert.equal(a.vx, 0);
  assert.ok(b.x - a.x >= 60 - 1e-9);
});

test('an immovable blob (shield) bounces the hitter back', () => {
  const a = blob(0, 0, 500), b = blob(58, 0);
  collideBlobs(a, b, { immovableB: true, boost: 100 });
  assert.equal(b.vx, 0);
  assert.ok(a.vx < -200);
});

test('bumpers kick blobs away and push them out of the bumper', () => {
  const b = blob(-60, 0, 200);
  const hit = collideBumper(b, { x: 0, y: 0, r: 40 }, 500);
  assert.ok(hit);
  assert.ok(b.vx < -400);
  assert.ok(Math.hypot(b.x, b.y) >= 70 - 1e-9);
  assert.equal(collideBumper(blob(-200, 0), { x: 0, y: 0, r: 40 }), null);
});

test('radial pushes fall off with distance and miss far blobs', () => {
  const near = blob(20, 0), far = blob(140, 0), miss = blob(400, 0);
  radialPush(near, 0, 0, 150, 900);
  radialPush(far, 0, 0, 150, 900);
  assert.ok(near.vx > far.vx && far.vx > 0);
  assert.equal(radialPush(miss, 0, 0, 150, 900), 0);
});
