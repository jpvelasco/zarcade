import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { POWERUPS, POWER_KINDS, dropTable } from '../src/powerups.js';
import { GRID, PADDLE, BALL, FIELD } from '../src/config.js';

const IDLE = { targetX: null, axis: 0, launch: false, fire: false };

function world() {
  const w = new World(0, { seed: 3, dropRate: 0 });
  w.bricks.length = 0;
  w.addBrick({ kind: 'normal', x: GRID.x, y: GRID.y, color: '#fff' }); // keeps the level open
  return w;
}

function launch(w) {
  w.step(1 / 120, { ...IDLE, launch: true });
  return w.balls[0];
}

test('every power-up has a label, name, colour and weight', () => {
  for (const k of POWER_KINDS) {
    const p = POWERUPS[k];
    assert.ok(p.label && p.name && /^#[0-9a-f]{6}$/i.test(p.color) && p.weight > 0, k);
  }
  assert.ok(POWER_KINDS.length >= 12);
  assert.ok(!dropTable(6).some(([k]) => k === 'life'), 'no extra lives once you have plenty');
});

test('multi-ball triples the comets (and respects the cap)', () => {
  const w = world();
  launch(w);
  w.applyPower('multi');
  assert.equal(w.balls.length, 3);
  const dirs = new Set(w.balls.map((b) => b.dx.toFixed(3)));
  assert.equal(dirs.size, 3, 'they fan out');
  for (let i = 0; i < 5; i++) w.applyPower('multi');
  assert.equal(w.balls.length, BALL.maxBalls);
});

test('multi-ball launches a comet waiting on the ship', () => {
  const w = world();
  w.applyPower('multi');
  assert.ok(w.balls.every((b) => !b.stuck));
});

test('wide ship grows the paddle, then shrinks back when it expires', () => {
  const w = world();
  w.applyPower('wide');
  for (let i = 0; i < 120; i++) w.step(1 / 120);
  assert.ok(w.paddle.w > PADDLE.w + 40);
  for (let i = 0; i < 120 * 17; i++) w.step(1 / 120);
  assert.equal(w.effects.wide, 0);
  assert.ok(Math.abs(w.paddle.w - PADDLE.w) < 2);
});

test('laser cannons fire and break bricks above the ship', () => {
  const w = world();
  const target = w.addBrick({ kind: 'normal', x: 300 - PADDLE.w / 2 + 10 - GRID.bw / 2, y: 400, color: '#f00' });
  w.paddle.x = 300;
  w.applyPower('laser');
  let fired = false;
  for (let i = 0; i < 120; i++) {
    w.step(1 / 120, { targetX: 300, axis: 0, launch: false, fire: true });
    if (w.events.some((e) => e.type === 'laser')) fired = true;
  }
  assert.ok(fired);
  assert.equal(target.alive, false);
});

test('catch holds the comet on the ship until launched (or a few seconds pass)', () => {
  const w = world();
  w.applyPower('sticky');
  const b = launch(w);
  Object.assign(b, { x: w.paddle.x + 20, y: PADDLE.y - 60, dx: 0, dy: 1 });
  for (let i = 0; i < 60; i++) w.step(1 / 120);
  assert.equal(b.stuck, true);
  w.step(1 / 120, { ...IDLE, targetX: 100 });
  assert.ok(Math.abs(b.x - (w.paddle.x + b.offset)) < 1e-9, 'rides along');
  w.step(1 / 120, { ...IDLE, launch: true });
  assert.equal(b.stuck, false);
  assert.ok(b.dy < 0 && b.dx > 0, 'launched up and to the right (caught right of centre)');
  // Auto-release
  Object.assign(b, { x: w.paddle.x, y: PADDLE.y - 60, dx: 0, dy: 1 });
  for (let i = 0; i < 60; i++) w.step(1 / 120);
  assert.equal(b.stuck, true);
  for (let i = 0; i < 120 * 3.2; i++) w.step(1 / 120);
  assert.equal(b.stuck, false);
});

test('slow-mo slows the comets down', () => {
  const w = world();
  const fast = w.speed();
  w.applyPower('slow');
  assert.ok(w.speed() < fast * 0.7);
});

test('fireball plows straight through breakable bricks but still bounces off metal', () => {
  const w = world();
  const col = [0, 1, 2, 3].map((i) => w.addBrick({ kind: 'tough', hp: 3, x: 280, y: 400 - i * GRID.bh, color: '#fff' }));
  w.addBrick({ kind: 'metal', x: 280, y: 400 - 5 * GRID.bh, hp: Infinity, color: '#fff' });
  w.applyPower('fire');
  const b = launch(w);
  Object.assign(b, { x: 302, y: 480, dx: 0, dy: -1 });
  let minY = Infinity;
  for (let i = 0; i < 90; i++) { w.step(1 / 120); minY = Math.min(minY, b.y); }
  assert.ok(col.every((br) => !br.alive), 'all tough bricks smashed in one pass');
  assert.ok(b.dy > 0, 'metal bounced it back');
  assert.ok(minY > 400 - 4 * GRID.bh, 'never passed the metal');
});

test('shield barrier saves falling comets twice', () => {
  const w = world();
  w.applyPower('shield');
  assert.equal(w.shield, 2);
  const b = launch(w);
  w.paddle.x = 560;
  for (let save = 0; save < 2; save++) {
    Object.assign(b, { x: 60, y: FIELD.h - 60, dx: 0, dy: 1 });
    for (let i = 0; i < 40; i++) w.step(1 / 120, { ...IDLE, targetX: 560 });
    assert.ok(b.dy < 0, `save ${save + 1}`);
  }
  assert.equal(w.shield, 0);
  assert.equal(w.lives, 3);
});

test('extra life adds a comet to the reserve', () => {
  const w = world();
  w.applyPower('life');
  assert.equal(w.lives, 4);
});

test('silly ones: disco doubles points, big comet grows, duck squeaks for points', () => {
  const w = world();
  const b = launch(w);
  const brick = w.addBrick({ kind: 'normal', x: 0, y: 300, color: '#fff' });
  w.applyPower('disco');
  assert.equal(w.multiplier(), 2);
  const before = w.score;
  w.hitBrick(brick, 1);
  assert.equal(w.score - before, 100);
  w.applyPower('big');
  assert.equal(b.r, BALL.bigR);
  for (let i = 0; i < 120 * 13; i++) w.step(1 / 120, { ...IDLE, targetX: b.x });
  assert.ok(w.balls.every((x) => x.r === BALL.r), 'shrinks back');
  w.applyPower('duck');
  Object.assign(w.balls[0], { x: 20, y: 500, dx: -0.7, dy: -0.7, stuck: false });
  const s0 = w.score;
  for (let i = 0; i < 10; i++) w.step(1 / 120);
  assert.ok(w.score > s0);
});

test('magnet pulls falling capsules toward the ship', () => {
  const w = world();
  w.paddle.x = 500;
  w.applyPower('magnet');
  w.spawnCapsule('wide', 100, 320);
  const x0 = w.capsules[0].x;
  for (let i = 0; i < 30; i++) w.step(1 / 120, { ...IDLE, targetX: 500 });
  assert.ok(w.capsules[0].x > x0 + 40);
});

test('capsules are collected by the ship and apply their effect', () => {
  const w = world();
  w.spawnCapsule('laser', w.paddle.x, PADDLE.y - 60);
  for (let i = 0; i < 120; i++) w.step(1 / 120);
  assert.equal(w.capsules.length, 0);
  assert.ok(w.effects.laser > 0);
});

test('losing a life clears timed power-ups', () => {
  const w = world();
  w.applyPower('wide'); w.applyPower('fire');
  const b = launch(w);
  Object.assign(b, { x: 20, y: FIELD.h - 20, dx: 0, dy: 1 });
  w.paddle.x = 500;
  for (let i = 0; i < 30; i++) w.step(1 / 120, { ...IDLE, targetX: 500 });
  assert.equal(w.lives, 2);
  assert.equal(w.effects.wide + w.effects.fire, 0);
});

test('drops are deterministic for a given seed', () => {
  const kinds = (seed) => {
    const w = new World(0, { seed, dropRate: 1 });
    for (const b of w.bricks.slice(0, 12)) { w.hitBrick(b, 9); w.capsules.length = 0; }
    return w.events.filter((e) => e.type === 'drop').map((e) => e.kind).join();
  };
  assert.equal(kinds(42), kinds(42));
  assert.notEqual(kinds(42), kinds(43));
});
