import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Body, boxShape, circleShape, polygonShape, collide } from '../src/physics.js';

function ground(w, width = 10) {
  return w.add(new Body(boxShape(width, 1), { kind: 'static', y: -0.5 }));
}

test('polygon shapes are centred with positive area and inertia', () => {
  const s = polygonShape([[0, 0], [2, 0], [0, 2]]); // clockwise-agnostic triangle
  assert.ok(s.area > 1.99 && s.area < 2.01);
  const cx = s.verts.reduce((a, v) => a + v.x, 0) / 3, cy = s.verts.reduce((a, v) => a + v.y, 0) / 3;
  assert.ok(Math.abs(cx) < 1e-9 && Math.abs(cy) < 1e-9);
  assert.ok(s.inertia > 0);
  const box = boxShape(2, 1);
  assert.ok(Math.abs(box.inertia - (2 * 1 * (4 + 1)) / 12) < 1e-9);
  // reversed winding gives the same shape
  const r = polygonShape([[0, 2], [2, 0], [0, 0]]);
  assert.ok(Math.abs(r.area - s.area) < 1e-9);
});

test('collide finds two contact points between resting boxes, normal from A to B', () => {
  const a = new Body(boxShape(2, 1), { y: 0 });
  const b = new Body(boxShape(1, 1), { y: 0.99 });
  const m = { nx: 0, ny: 0, count: 0, points: [{}, {}] };
  assert.ok(collide(a, b, m));
  assert.equal(m.count, 2);
  assert.ok(Math.abs(m.ny - 1) < 1e-9);
  for (let i = 0; i < 2; i++) assert.ok(Math.abs(m.points[i].sep + 0.01) < 1e-9);
  const c = new Body(circleShape(0.5), { x: 0, y: 1.0 });
  assert.ok(collide(a, c, m));
  assert.equal(m.count, 1);
  assert.ok(m.ny > 0.99);
  const far = new Body(boxShape(1, 1), { y: 5 });
  assert.equal(collide(a, far, m), false);
});

test('a stack of twelve boxes stands still and falls asleep', () => {
  const w = new World();
  ground(w);
  const boxes = [];
  for (let i = 0; i < 12; i++) boxes.push(w.add(new Body(boxShape(1.6, 1, 0.15), { x: (i % 2) * 0.1, y: 0.5 + i + 0.01 })));
  for (let s = 0; s < 300; s++) w.step(1 / 60);
  const top = boxes[11];
  assert.ok(Math.abs(top.x - 0.1) < 0.02, `top drifted to ${top.x}`);
  assert.ok(top.y > 11.3 && top.y < 11.55, `top sank to ${top.y}`);
  assert.ok(Math.abs(top.angle) < 0.01);
  assert.equal(boxes.filter((b) => b.awake).length, 0, 'everything sleeps');
});

test('a pyramid of boxes holds', () => {
  const w = new World();
  ground(w, 20);
  const rows = 6;
  const bodies = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < rows - r; i++) {
      bodies.push(w.add(new Body(boxShape(1, 1), { x: (i - (rows - r - 1) / 2) * 1.05, y: 0.5 + r * 1.0 })));
    }
  }
  const start = bodies.map((b) => [b.x, b.y]);
  for (let s = 0; s < 400; s++) w.step(1 / 60);
  const moved = Math.max(...bodies.map((b, i) => Math.hypot(b.x - start[i][0], b.y - start[i][1])));
  assert.ok(moved < 0.12, `pyramid shifted ${moved}`);
});

test('an overhanging block topples, a balanced one does not', () => {
  const w = new World();
  ground(w);
  w.add(new Body(boxShape(1, 1), { y: 0.5 }));
  const safe = w.add(new Body(boxShape(2, 0.4), { x: 0.3, y: 1.21 }));
  const w2 = new World();
  ground(w2);
  w2.add(new Body(boxShape(1, 1), { y: 0.5 }));
  const tip = w2.add(new Body(boxShape(2, 0.4), { x: 1.2, y: 1.21 }));
  for (let s = 0; s < 240; s++) { w.step(1 / 60); w2.step(1 / 60); }
  assert.ok(safe.y > 1.1 && Math.abs(safe.angle) < 0.05);
  assert.ok(tip.y < 0.9 && Math.abs(tip.angle) > 0.3, `overhang should fall, y=${tip.y}`);
});

test('friction: a grippy box rests on a slope, an icy one slides', () => {
  const w = new World();
  w.add(new Body(polygonShape([[-5, 0], [5, 0], [5, 2]]), { kind: 'static' }));
  const grip = w.add(new Body(boxShape(1, 1), { x: 0, y: 1.62, angle: Math.atan2(2, 10), friction: 0.7 }));
  const ice = w.add(new Body(boxShape(1, 1), { x: -2, y: 1.22, angle: Math.atan2(2, 10), friction: 0.05 }));
  const g0 = grip.x, i0 = ice.x;
  for (let s = 0; s < 180; s++) w.step(1 / 60);
  assert.ok(Math.abs(grip.x - g0) < 0.15, `grip slid ${grip.x - g0}`);
  assert.ok(i0 - ice.x > 1, `ice slid only ${i0 - ice.x}`);
});

test('a ball rolls to rest on flat ground', () => {
  const w = new World();
  ground(w, 40);
  const ball = w.add(new Body(circleShape(0.7), { y: 0.7 }));
  ball.vx = 2;
  for (let s = 0; s < 600; s++) w.step(1 / 60);
  assert.ok(ball.x > 0.5 && ball.x < 10, `ball at ${ball.x}`);
  assert.ok(Math.abs(ball.vx) < 0.05);
});

test('a moving raft carries a box by friction', () => {
  const w = new World();
  const raft = w.add(new Body(boxShape(6, 1), { kind: 'kinematic', y: -0.5 }));
  raft.drive = (t) => ({ x: Math.sin(t * 1.2) * 1, y: -0.5, angle: 0 });
  const box = w.add(new Body(boxShape(1.5, 1), { y: 0.5 }));
  let rel0 = null;
  for (let s = 0; s < 600; s++) {
    w.step(1 / 60);
    if (s === 120) rel0 = box.x - raft.x;
  }
  assert.ok(Math.abs(raft.x - Math.sin(w.time * 1.2)) < 1e-6, 'raft follows its script');
  assert.ok(Math.abs(box.x - raft.x - rel0) < 0.05, 'box rides along');
  assert.ok(box.y > 0.4);
});

test('impacts are reported once when a block lands', () => {
  const w = new World();
  ground(w);
  w.add(new Body(boxShape(1, 1), { y: 3 }));
  let impacts = 0;
  for (let s = 0; s < 120; s++) { w.step(1 / 60); impacts += w.events.filter((e) => e.type === 'impact').length; w.events.length = 0; }
  assert.equal(impacts, 1);
});

test('the same scenario replays bit for bit', () => {
  const run = () => {
    const w = new World();
    ground(w);
    const shapes = [boxShape(2, 1.3, 0.22), circleShape(0.72), polygonShape([[-1.2, -0.3], [1.2, -0.3], [0.8, 0.3], [-0.8, 0.3]]), boxShape(3.4, 0.62, 0.1)];
    for (let i = 0; i < 12; i++) {
      w.add(new Body(shapes[i % 4], { x: Math.sin(i * 1.7) * 0.8, y: 1 + i * 1.6, angle: i * 0.37 }));
      for (let s = 0; s < 30; s++) w.step(1 / 60);
    }
    for (let s = 0; s < 120; s++) w.step(1 / 60);
    return w.bodies.map((b) => [b.x, b.y, b.angle, b.vx, b.vy, b.w]);
  };
  assert.deepEqual(run(), run());
});

test('a removed body wakes what it was touching', () => {
  const w = new World();
  ground(w);
  const a = w.add(new Body(boxShape(1, 1), { y: 0.5 }));
  const b = w.add(new Body(boxShape(1, 1), { y: 1.5 }));
  for (let s = 0; s < 120; s++) w.step(1 / 60);
  assert.equal(b.awake, false);
  w.remove(a);
  assert.equal(b.awake, true);
  for (let s = 0; s < 60; s++) w.step(1 / 60);
  assert.ok(b.y < 0.6, 'b falls onto the ground');
});

test('a cloned world evolves exactly like the original', () => {
  const w = new World();
  ground(w);
  for (let i = 0; i < 5; i++) w.add(new Body(boxShape(1.2, 0.8), { x: i * 0.2, y: 0.5 + i * 0.9 }));
  for (let s = 0; s < 20; s++) w.step(1 / 60);
  const c = w.clone();
  for (let s = 0; s < 90; s++) { w.step(1 / 60); c.step(1 / 60); }
  assert.deepEqual(c.bodies.map((b) => [b.x, b.y, b.angle]), w.bodies.map((b) => [b.x, b.y, b.angle]));
});
