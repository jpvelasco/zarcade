import test from 'node:test';
import assert from 'node:assert/strict';
import { Flipper, makeBall, stepPhysics, STEP, FLIPPER } from '../src/physics.js';
import { buildColliders, FLIPPERS, TABLE } from '../src/table.js';

// The real table, with the asteroid targets down so shots have a clear run
// to the upper playfield.
function table() {
  const colliders = buildColliders();
  for (const c of colliders) if (c.kind === 'target') c.enabled = false;
  return { colliders, flippers: FLIPPERS.map((f) => new Flipper(f)) };
}

function sim(t, ball, seconds, each) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) {
    stepPhysics([ball], t.colliders, t.flippers, STEP);
    if (each) each(ball, i * STEP);
  }
}

// Drop a ball onto a held-up flipper and let it settle into the cradle.
function cradle(side) {
  const t = table();
  const f = t.flippers[side === 'left' ? 0 : 1];
  f.pressed = true;
  f.angle = f.up;
  const ball = makeBall(side === 'left' ? 250 : TABLE.cx * 2 - 250, 800);
  sim(t, ball, 3);
  return { t, f, ball };
}

test('a flipper swings up in about 30 ms and falls back when released', () => {
  const f = new Flipper(FLIPPERS[0]);
  f.pressed = true;
  let ms = 0;
  while (f.angle !== f.up && ms < 200) { f.update(0.001); ms++; }
  assert.ok(ms >= 20 && ms <= 45, `swing took ${ms} ms`);
  f.pressed = false;
  for (let i = 0; i < 200; i++) f.update(0.001);
  assert.equal(f.angle, f.rest);
  assert.equal(f.omega, 0);
});

test('the right flipper mirrors the left one', () => {
  const [l, r] = FLIPPERS.map((f) => new Flipper(f));
  assert.ok(Math.abs(l.rest + r.rest - Math.PI) < 1e-9);
  assert.ok(Math.abs(l.up + r.up - Math.PI) < 1e-9);
  const lt = l.tip(), rt = r.tip();
  assert.ok(Math.abs(lt.x + rt.x - TABLE.cx * 2) < 1e-9 && Math.abs(lt.y - rt.y) < 1e-9);
});

test('surface speed grows along the flipper, so tip shots are faster', () => {
  const shot = (t) => {
    const tb = table();
    const f = tb.flippers[0];
    const d = f.len * t;
    // Rest the ball on the lowered flipper at distance d from the pivot.
    const nx = Math.sin(f.rest), ny = -Math.cos(f.rest);
    const r = f.r0 + (f.r1 - f.r0) * t;
    const ball = makeBall(f.x + Math.cos(f.rest) * d + nx * (r + 13.5), f.y + Math.sin(f.rest) * d + ny * (r + 13.5));
    f.pressed = true;
    let top = 0;
    sim(tb, ball, 0.08, (b) => { top = Math.max(top, Math.hypot(b.vx, b.vy)); });
    return top;
  };
  const base = shot(0.3), sweet = shot(0.65), tip = shot(0.95);
  assert.ok(base < sweet && sweet < tip, `${base} < ${sweet} < ${tip}`);
  assert.ok(sweet > FLIPPER.upSpeed * FLIPPER.len * 0.5, `sweet-spot shot ${sweet}`);
});

for (const side of ['left', 'right']) {
  test(`a ball dropped on the raised ${side} flipper comes to rest in the cradle`, () => {
    const { t, f, ball } = cradle(side);
    assert.ok(Math.hypot(ball.vx, ball.vy) < 5, `still moving: ${ball.vx}, ${ball.vy}`);
    const hit = {};
    // Still touching the flipper (allow a hair of separation), near its base.
    ball.r += 0.5;
    assert.ok(f.contact(ball, hit) > 0, 'resting on the flipper');
    ball.r -= 0.5;
    assert.ok(hit.t < 0.35, `cradled near the pivot (t=${hit.t})`);
    // It stays there.
    const x = ball.x, y = ball.y;
    sim(t, ball, 2);
    assert.ok(Math.hypot(ball.x - x, ball.y - y) < 1);
  });

  test(`a cradled ball, released and flipped as it rolls down, reaches the upper playfield (${side})`, () => {
    // Different timings aim at different shots; most clear the asteroid
    // bank, and a well-timed one reaches the top of the table.
    const tops = [];
    for (let delay = 0.3; delay < 0.57; delay += 0.02) {
      const { t, f, ball } = cradle(side);
      f.pressed = false;
      sim(t, ball, delay);
      f.pressed = true;
      let top = Infinity;
      sim(t, ball, 1.2, (b) => { top = Math.min(top, b.y); });
      tops.push(Math.round(top));
    }
    const upper = tops.filter((y) => y < 500).length;
    assert.ok(upper >= tops.length * 0.6, `highest points: ${tops.join(' ')}`);
    assert.ok(Math.min(...tops) < 200, `best shot reached y=${Math.min(...tops)}`);
  });
}

test('flipping before the ball rolls far gives a weaker shot', () => {
  const { t, f, ball } = cradle('left');
  f.pressed = false;
  sim(t, ball, 0.3);
  f.pressed = true;
  let top = Infinity, fast = 0;
  sim(t, ball, 1.2, (b) => { top = Math.min(top, b.y); fast = Math.max(fast, Math.hypot(b.vx, b.vy)); });
  const late = cradle('left');
  late.f.pressed = false;
  sim(late.t, late.ball, 0.5);
  late.f.pressed = true;
  let lateFast = 0;
  sim(late.t, late.ball, 1.2, (b) => { lateFast = Math.max(lateFast, Math.hypot(b.vx, b.vy)); });
  assert.ok(fast < lateFast, `early ${fast.toFixed(0)} vs late ${lateFast.toFixed(0)}`);
});

test('a ball rolling down the inlane onto a held flipper is caught (a live catch)', () => {
  const t = table();
  const f = t.flippers[0];
  f.pressed = true;
  f.angle = f.up;
  const ball = makeBall(86, 760); // top of the left inlane
  sim(t, ball, 4);
  assert.ok(Math.hypot(ball.vx, ball.vy) < 5, 'came to rest');
  assert.ok(ball.y < 960 && ball.x > 150 && ball.x < 260, `in the cradle at ${ball.x.toFixed(0)}, ${ball.y.toFixed(0)}`);
});

test('a dead (lowered) flipper lets a ball roll off its tip towards the drain', () => {
  const t = table();
  const ball = makeBall(86, 760);
  let drained = false;
  sim(t, ball, 4, (b) => { if (b.y > TABLE.h) drained = true; });
  assert.ok(drained);
});

test('a quick tap passes a cradled ball across to the other flipper', () => {
  let caught = 0;
  const delays = [0.32, 0.34, 0.42, 0.44, 0.46];
  for (const delay of delays) {
    const { t, ball } = cradle('left');
    const [left, right] = t.flippers;
    left.pressed = false;
    sim(t, ball, delay);
    left.pressed = true;
    sim(t, ball, 0.015);
    left.pressed = false;
    right.pressed = true; // catch it on the right
    sim(t, ball, 4);
    if (ball.x > TABLE.cx && ball.y < 960 && Math.hypot(ball.vx, ball.vy) < 5) caught++;
  }
  assert.ok(caught >= 3, `caught ${caught} of ${delays.length}`);
});
