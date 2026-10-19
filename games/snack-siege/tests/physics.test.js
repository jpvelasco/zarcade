import test from 'node:test';
import assert from 'node:assert/strict';
import { Physics, wake, boxVertices } from '../src/physics.js';

function ground(p) {
  return p.add({ shape: 'box', x: 0, y: -1, w: 200, h: 2, isStatic: true, friction: 0.8 });
}

function run(p, seconds) {
  const n = Math.round(seconds / p.dt);
  for (let i = 0; i < n; i++) p.step();
}

test('a box comes to rest on the ground and falls asleep', () => {
  const p = new Physics();
  ground(p);
  const b = p.add({ shape: 'box', x: 0, y: 3, w: 1, h: 1 });
  run(p, 3);
  assert.ok(Math.abs(b.y - 0.5) < 0.02, `rests on the ground (y=${b.y})`);
  assert.ok(Math.abs(b.a) < 0.01);
  assert.equal(b.sleeping, true);
});

test('a tall stack of boxes stays standing', () => {
  const p = new Physics();
  ground(p);
  const boxes = [];
  for (let i = 0; i < 10; i++) boxes.push(p.add({ shape: 'box', x: 0, y: 0.5 + i, w: 1, h: 1 }));
  run(p, 6);
  for (const [i, b] of boxes.entries()) {
    assert.ok(Math.abs(b.x) < 0.05, `box ${i} drifted to x=${b.x}`);
    assert.ok(Math.abs(b.y - (0.5 + i)) < 0.08, `box ${i} sank to y=${b.y}`);
    assert.ok(b.sleeping, `box ${i} asleep`);
  }
});

test('a pyramid of boxes settles without collapsing', () => {
  const p = new Physics();
  ground(p);
  const boxes = [];
  const rows = 7;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < rows - r; c++) {
      boxes.push(p.add({ shape: 'box', x: c * 1.0 - (rows - r) / 2 + 0.5, y: 0.5 + r, w: 0.98, h: 1 }));
    }
  }
  const start = boxes.map((b) => [b.x, b.y]);
  run(p, 6);
  boxes.forEach((b, i) => {
    assert.ok(Math.hypot(b.x - start[i][0], b.y - start[i][1]) < 0.1, `box ${i} moved`);
  });
  assert.equal(p.awakeCount(), 0);
});

test('planks on columns (a fort floor) stay put', () => {
  const p = new Physics();
  ground(p);
  const parts = [];
  let y = 0;
  for (let floor = 0; floor < 4; floor++) {
    parts.push(p.add({ shape: 'box', x: -1, y: y + 1, w: 0.4, h: 2 }));
    parts.push(p.add({ shape: 'box', x: 1, y: y + 1, w: 0.4, h: 2 }));
    parts.push(p.add({ shape: 'box', x: 0, y: y + 2.2, w: 2.8, h: 0.4 }));
    y += 2.4;
  }
  const bear = p.add({ shape: 'circle', x: 0, y: y + 0.5, r: 0.5 });
  const start = parts.map((b) => [b.x, b.y, b.a]);
  run(p, 5);
  parts.forEach((b, i) => {
    assert.ok(Math.hypot(b.x - start[i][0], b.y - start[i][1]) < 0.1, `part ${i} moved`);
    assert.ok(Math.abs(b.a - start[i][2]) < 0.03, `part ${i} tilted`);
  });
  assert.ok(Math.abs(bear.x) < 0.1);
  assert.equal(p.awakeCount(), 0);
});

test('a sleeping stack wakes when hit and topples', () => {
  const p = new Physics();
  ground(p);
  const boxes = [];
  for (let i = 0; i < 5; i++) boxes.push(p.add({ shape: 'box', x: 5, y: 0.5 + i, w: 1, h: 1, sleeping: true }));
  const ball = p.add({ shape: 'circle', x: 0, y: 3.5, r: 0.45, density: 4, vx: 22, vy: 0 });
  run(p, 3);
  assert.ok(boxes.some((b) => Math.abs(b.x - 5) > 0.5), 'something got knocked');
  assert.ok(ball.x > 3);
});

test('removing a support wakes what it held up', () => {
  const p = new Physics();
  ground(p);
  const base = p.add({ shape: 'box', x: 0, y: 1.5, w: 1, h: 1 });
  const left = p.add({ shape: 'box', x: -1, y: 0.5, w: 0.4, h: 1 });
  const right = p.add({ shape: 'box', x: 1, y: 0.5, w: 0.4, h: 1 });
  const lid = p.add({ shape: 'box', x: 0, y: 1.2, w: 2.6, h: 0.4 });
  p.remove(base);
  run(p, 2);
  assert.equal(lid.sleeping, true);
  p.remove(left);
  assert.equal(lid.sleeping, false);
  run(p, 3);
  assert.ok(lid.a !== 0, 'lid tipped over');
  assert.ok(right.y > 0);
});

test('restitution bounces and friction stops sliding', () => {
  const p = new Physics();
  ground(p);
  const bouncy = p.add({ shape: 'circle', x: 0, y: 5, r: 0.5, restitution: 0.8 });
  const dull = p.add({ shape: 'circle', x: 4, y: 5, r: 0.5, restitution: 0 });
  let maxBounce = 0;
  let maxDull = 0;
  let hitGround = false;
  for (let i = 0; i < 240; i++) {
    p.step();
    if (bouncy.y < 0.6) hitGround = true;
    if (hitGround) maxBounce = Math.max(maxBounce, bouncy.y);
    if (dull.y < 0.6) maxDull = Math.max(maxDull, dull.y);
  }
  assert.ok(maxBounce > 2.5, `bounced to ${maxBounce}`);
  assert.ok(maxDull < 0.8);

  const slider = p.add({ shape: 'box', x: 10, y: 0.5, w: 1, h: 1, vx: 8, friction: 0.7 });
  run(p, 3);
  assert.ok(Math.abs(slider.vx) < 0.05);
  assert.ok(slider.x > 10 && slider.x < 18, `slid to ${slider.x}`);
});

test('a fast ball does not tunnel through a thin plank', () => {
  const p = new Physics();
  ground(p);
  p.add({ shape: 'box', x: 10, y: 3, w: 0.4, h: 6, isStatic: true });
  const ball = p.add({ shape: 'circle', x: 0, y: 3, r: 0.3, density: 4, vx: 34 });
  run(p, 1.5);
  assert.ok(ball.x < 10, `ball at ${ball.x}`);
});

test('the engine is deterministic and clones reproduce the same future', () => {
  function scene() {
    const p = new Physics();
    ground(p);
    for (let i = 0; i < 6; i++) p.add({ shape: 'box', x: 6 + (i % 2) * 0.3, y: 0.5 + i, w: 1, h: 1, sleeping: true });
    p.add({ shape: 'circle', x: 0, y: 2, r: 0.45, density: 4, vx: 20, vy: 6 });
    return p;
  }
  const a = scene();
  const b = scene();
  run(a, 1);
  run(b, 1);
  const c = a.clone();
  run(a, 2);
  run(b, 2);
  run(c, 2);
  const snap = (p) => p.bodies.map((x) => [x.x, x.y, x.a, x.vx, x.vy, x.w].join(','));
  assert.deepEqual(snap(a), snap(b));
  assert.deepEqual(snap(a), snap(c));
});

test('explosions push and wake nearby bodies', () => {
  const p = new Physics();
  ground(p);
  const near = p.add({ shape: 'box', x: 1, y: 0.5, w: 1, h: 1, sleeping: true });
  const far = p.add({ shape: 'box', x: 20, y: 0.5, w: 1, h: 1, sleeping: true });
  const reached = p.explode(0, 0.5, 3, 10);
  assert.equal(reached.length, 1);
  assert.equal(near.sleeping, false);
  assert.ok(near.vx > 0);
  assert.equal(far.sleeping, true);
  wake(far);
  assert.equal(far.sleeping, false);
});

test('a rotated box resting on a corner falls flat', () => {
  const p = new Physics();
  ground(p);
  const b = p.add({ shape: 'box', x: 0, y: 1.2, w: 2, h: 0.5, a: 0.5 });
  run(p, 4);
  const lowest = Math.min(...boxVertices(b).map((v) => v[1]));
  assert.ok(Math.abs(lowest) < 0.03, `lowest corner ${lowest}`);
  const turns = Math.abs(Math.sin(b.a));
  assert.ok(turns < 0.02 || Math.abs(turns - 1) < 0.02, `flat (a=${b.a})`);
});
