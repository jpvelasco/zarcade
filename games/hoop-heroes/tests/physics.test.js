import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBall, stepBall, launchVelocity, STEP, RIM_R, RIM_Y, BALL_R, BOARD, hoopState } from '../src/physics.js';

const hoop = { x: 0, y: RIM_Y, z: 0, motion: null };
const env = (extra = {}) => ({ g: 9.8, hoop, time: 0, blockers: null, tramp: null, rim: true, ...extra });

function fly(ball, e, seconds, events = []) {
  for (let i = 0; i < seconds / STEP && !ball.dead; i++) { stepBall(ball, e, STEP, events); e.time += STEP; }
  return events;
}

test('a dropped ball falls with gravity and bounces lower each time', () => {
  const ball = makeBall({ x: 3, y: 2, z: -3 }, { x: 0, y: 0, z: 0 });
  const e = env();
  let peak = 0, peaks = [], rising = false, lastY = ball.p.y;
  for (let i = 0; i < 6 / STEP; i++) {
    ball.dead = false; // keep bouncing past the usual clean-up
    stepBall(ball, e, STEP);
    if (ball.p.y > lastY) rising = true;
    else if (rising) { peaks.push(lastY); rising = false; }
    lastY = ball.p.y;
    peak = Math.max(peak, ball.p.y);
  }
  assert.ok(peak <= 2.0001);
  assert.ok(peaks.length >= 2);
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] < peaks[i - 1]);
  assert.ok(ball.p.y >= BALL_R - 1e-9);
});

test('a ball dropped straight through the ring is a make, not a rim hit', () => {
  const ball = makeBall({ x: 0, y: RIM_Y + 1, z: 0 }, { x: 0, y: 0, z: 0 });
  const events = fly(ball, env(), 1.5);
  assert.equal(ball.made, true);
  assert.equal(ball.touchedRim, false);
  assert.ok(events.some((e) => e.type === 'make'));
});

test('a ball dropped onto the rim bounces off it', () => {
  const ball = makeBall({ x: RIM_R, y: RIM_Y + 1, z: 0 }, { x: 0, y: 0, z: 0 });
  const events = fly(ball, env(), 2);
  assert.equal(ball.touchedRim, true);
  assert.ok(events.some((e) => e.type === 'rim'));
  // It doesn't sink into the metal.
  assert.ok(ball.rimHits >= 1);
});

test('a ball thrown at the board rebounds back toward the shooter', () => {
  const ball = makeBall({ x: 0, y: 3.5, z: -2 }, { x: 0, y: 1.2, z: 6 });
  const events = fly(ball, env(), 0.8);
  assert.equal(ball.touchedBoard, true);
  assert.ok(events.some((e) => e.type === 'board'));
  assert.ok(ball.v.z < 0, 'moving back out after the board');
  assert.ok(ball.p.z < BOARD.offset);
});

test('rim collisions follow a moving hoop', () => {
  const moving = { x: 0, y: RIM_Y, z: 0, motion: { ax: 1, wx: 1 } };
  const s = hoopState(moving, Math.PI / 2);
  assert.ok(Math.abs(s.x - 1) < 1e-9);
  assert.ok(Math.abs(s.vx) < 1e-9);
  const s0 = hoopState(moving, 0);
  assert.ok(Math.abs(s0.vx - 1) < 1e-9);
});

test('a trampoline throws a falling ball back up', () => {
  const ball = makeBall({ x: 0, y: 2, z: -3 }, { x: 0, y: -1, z: 0 });
  const e = env({ tramp: { x: 0, z: -3, r: 0.6 } });
  const events = fly(ball, e, 1.2);
  assert.equal(ball.tramp, true);
  assert.ok(events.some((ev) => ev.type === 'tramp'));
});

test('a blocker stops a flat shot', () => {
  const ball = makeBall({ x: 0, y: 2, z: -4 }, launchVelocity(0, 0.25, 7));
  const e = env({ blockers: [{ x: 0, y: 1.5, z: -2, hx: 0.7, hy: 1.5, hz: 0.2 }] });
  fly(ball, e, 1.5);
  assert.equal(ball.blocked, true);
  assert.equal(ball.made, false);
});

test('stepping is deterministic', () => {
  const run = () => {
    const ball = makeBall({ x: 0.4, y: 2.1, z: -4.5 }, launchVelocity(-0.05, 0.95, 7.6));
    fly(ball, env(), 3);
    return [ball.p.x, ball.p.y, ball.p.z, ball.v.x, ball.v.y, ball.v.z, ball.rimHits];
  };
  assert.deepEqual(run(), run());
});
