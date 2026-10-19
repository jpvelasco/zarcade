import test from 'node:test';
import assert from 'node:assert/strict';
import { circleRect, reflect, keepVertical, paddleBounce, predictX } from '../src/physics.js';
import { World } from '../src/world.js';
import { FIELD, GRID, PADDLE, BALL } from '../src/config.js';

// A bare world: the level's bricks are removed so each test places its own.
// One "keeper" brick sits in the top corner so the level never counts as clear.
function emptyWorld() {
  const w = new World(0, { seed: 1, dropRate: 0 });
  w.bricks.length = 0;
  w.keeper = w.addBrick({ kind: 'normal', x: GRID.x, y: GRID.y, color: '#fff' });
  return w;
}

function freeBall(w, x, y, dx, dy) {
  const b = w.balls[0];
  Object.assign(b, { x, y, dx, dy, stuck: false, serve: false });
  const len = Math.hypot(dx, dy);
  b.dx /= len; b.dy /= len;
  return b;
}

test('circleRect reports push-out normals for sides, corners and a buried centre', () => {
  assert.equal(circleRect(0, 0, 5, 10, 10, 20, 10), null);
  const below = circleRect(20, 23, 5, 10, 10, 20, 10);
  assert.deepEqual([below.nx, below.ny], [0, 1]);
  assert.ok(Math.abs(below.depth - 2) < 1e-9);
  const corner = circleRect(8, 8, 5, 10, 10, 20, 10);
  assert.ok(corner.nx < 0 && corner.ny < 0);
  const inside = circleRect(12, 15, 5, 10, 10, 20, 10);
  assert.deepEqual([inside.nx, inside.ny], [-1, 0]);
});

test('reflect only bounces a ball moving into the surface', () => {
  const b = { dx: 0.6, dy: 0.8 };
  assert.equal(reflect(b, 0, -1), true);
  assert.ok(Math.abs(b.dy + 0.8) < 1e-9 && Math.abs(b.dx - 0.6) < 1e-9);
  assert.equal(reflect(b, 0, -1), false);
});

test('keepVertical stops almost-flat rallies', () => {
  const b = { dx: 0.999, dy: -0.04 };
  keepVertical(b);
  assert.ok(b.dy <= -BALL.minVertical + 1e-9);
  assert.ok(Math.abs(Math.hypot(b.dx, b.dy) - 1) < 1e-9);
});

test('paddle bounce angle follows where the comet hits the ship', () => {
  const left = paddleBounce(-1), mid = paddleBounce(0), right = paddleBounce(0.5);
  assert.ok(left.dx < -0.8 && left.dy < 0);
  assert.ok(Math.abs(mid.dx) < 1e-9 && mid.dy === -1);
  assert.ok(right.dx > 0 && right.dx < Math.abs(left.dx));
  assert.ok(paddleBounce(-5).dx >= -Math.sin(PADDLE.maxAngle) - 1e-9, 'clamped');
});

test('comet bounces off the paddle upward, angled by hit position', () => {
  const w = emptyWorld();
  w.paddle.x = 300;
  const b = freeBall(w, 300 - 40, PADDLE.y - 40, 0, 1);
  for (let i = 0; i < 20; i++) w.step(1 / 120);
  assert.ok(b.dy < 0, 'moving up');
  assert.ok(b.dx < -0.4, 'left edge sends it left');
  assert.equal(w.paddleHits, 1);
});

test('predictX unfolds bounces off the side walls', () => {
  assert.equal(predictX(100, 0, 0, 1, 100, 0, 600), 100);
  assert.ok(Math.abs(predictX(500, 0, Math.SQRT1_2, Math.SQRT1_2, 200, 0, 600) - 500) < 1e-6); // 500→600→500
});

test('a comet never tunnels through a brick, even at absurd speed', () => {
  for (const speed of [400, 2000, 8000, 30000]) {
    const w = emptyWorld();
    const brick = w.addBrick({ kind: 'metal', x: 280, y: 300, w: GRID.bw, h: GRID.bh, hp: Infinity, color: '#fff' });
    const b = freeBall(w, 302, 500, 0, -1);
    w.baseSpeed = speed;
    // One step long enough to reach the brick (170 px to contact) and come back 130 px.
    w.step(300 / speed);
    assert.ok(b.y > brick.y + brick.h, `speed ${speed}: ball stayed below the brick (y=${b.y})`);
    assert.ok(b.dy > 0, `speed ${speed}: bounced back down`);
    assert.ok(Math.abs(b.y - 460) < 3, `speed ${speed}: travelled the full distance (y=${b.y})`);
  }
});

test('a breakable brick is destroyed on contact and the comet reflects', () => {
  const w = emptyWorld();
  const brick = w.addBrick({ kind: 'normal', x: 280, y: 300, color: '#f0f' });
  const b = freeBall(w, 302, 360, 0, -1);
  for (let i = 0; i < 30; i++) w.step(1 / 120);
  assert.equal(brick.alive, false);
  assert.ok(b.dy > 0);
  assert.equal(w.bricksBroken, 1);
});

test('tough bricks take several hits; metal never breaks', () => {
  const w = emptyWorld();
  const t = w.addBrick({ kind: 'tough', x: 0, y: 0, hp: 3, color: '#fff' });
  const m = w.addBrick({ kind: 'metal', x: 100, y: 0, hp: Infinity, color: '#fff' });
  w.hitBrick(t, 1); w.hitBrick(t, 1);
  assert.equal(t.alive, true);
  w.hitBrick(t, 1);
  assert.equal(t.alive, false);
  for (let i = 0; i < 10; i++) w.hitBrick(m, 1);
  assert.equal(m.alive, true);
});

test('explosive bricks chain into their neighbours', () => {
  const w = emptyWorld();
  const row = [0, 1, 2, 3].map((i) => w.addBrick({ kind: 'explosive', x: GRID.x + i * GRID.bw, y: 200, color: '#f00' }));
  const far = w.addBrick({ kind: 'normal', x: GRID.x + 8 * GRID.bw, y: 200, color: '#0f0' });
  w.hitBrick(row[0], 1);
  for (let i = 0; i < 120; i++) w.step(1 / 120);
  assert.ok(row.every((b) => !b.alive), 'whole chain went off');
  assert.equal(far.alive, true);
  assert.ok(w.combo >= 4 || w.maxCombo >= 4);
});

test('moving bricks slide and stay inside the field', () => {
  const w = new World(6); // Space Whale has moving bricks
  const movers = w.bricks.filter((b) => b.kind === 'moving');
  assert.ok(movers.length > 0);
  const xs = new Set();
  for (let i = 0; i < 600; i++) {
    w.updateMovers();
    w.time += 1 / 60;
    for (const m of movers) {
      assert.ok(m.x >= 0 && m.x + m.w <= FIELD.w);
      xs.add(Math.round(m.x));
    }
  }
  assert.ok(xs.size > 20);
});

test('portals send a comet to their partner', () => {
  const w = new World(14); // Skeleton Key
  assert.equal(w.portals.length, 2);
  const [a, bp] = w.portals;
  w.bricks = w.bricks.filter((br) => br.y < 150);
  const b = freeBall(w, a.x + 30, a.y, -1, -0.35);
  let ported = false;
  for (let i = 0; i < 60 && !ported; i++) {
    w.step(1 / 120);
    ported = w.events.some((e) => e.type === 'portal');
  }
  assert.ok(ported);
  assert.ok(Math.abs(b.x - bp.x) < 30 && Math.abs(b.y - bp.y) < 30);
});

test('losing the last comet costs a life; running out ends the game', () => {
  const w = emptyWorld();
  w.lives = 2;
  freeBall(w, 20, FIELD.h - 30, 0, 1);
  w.paddle.x = 500;
  for (let i = 0; i < 60; i++) w.step(1 / 120);
  assert.equal(w.lives, 1);
  assert.equal(w.balls.length, 1);
  assert.equal(w.balls[0].stuck, true, 'a new comet waits on the ship');
  w.step(1 / 120, { targetX: null, axis: 0, launch: true, fire: false });
  w.balls[0].x = 20; w.balls[0].y = FIELD.h - 30; w.balls[0].dx = 0; w.balls[0].dy = 1;
  w.paddle.x = 500;
  for (let i = 0; i < 60; i++) w.step(1 / 120, { targetX: 500, axis: 0, launch: false, fire: false });
  assert.equal(w.status, 'gameover');
});

test('keyboard steering accelerates smoothly and mouse follows directly', () => {
  const w = emptyWorld();
  const x0 = w.paddle.x;
  w.step(1 / 120, { targetX: null, axis: 1, launch: false, fire: false });
  const v1 = w.paddle.vx;
  for (let i = 0; i < 20; i++) w.step(1 / 120, { targetX: null, axis: 1, launch: false, fire: false });
  assert.ok(v1 > 0 && w.paddle.vx > v1 && w.paddle.vx <= PADDLE.maxSpeed);
  assert.ok(w.paddle.x > x0);
  for (let i = 0; i < 30; i++) w.step(1 / 120, { targetX: 120, axis: 0, launch: false, fire: false });
  assert.ok(Math.abs(w.paddle.x - 120) < 1);
});
