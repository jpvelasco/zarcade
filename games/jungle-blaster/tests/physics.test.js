import test from 'node:test';
import assert from 'node:assert/strict';
import { PHYS, createPlayer, createVine, stepPlayer, stepVine, vineEnd, aimFrom, hurtbox } from '../src/physics.js';

const DT = 1 / 60;

/** A tiny test world: ASCII rows, flat floor unless given. */
function env(rows, extra = {}) {
  const grid = rows.map((r) => r.split(''));
  return {
    tileAt: (c, r) => (c < 0 || c >= grid[0].length ? '#' : r < 0 || r >= grid.length ? ' ' : grid[r][c]),
    rects: [],
    hazards: [],
    vines: [],
    minX: 0,
    maxX: grid[0].length * 16,
    bottom: grid.length * 16 + 24,
    ...extra,
  };
}

const FLAT = [
  '                    ',
  '                    ',
  '                    ',
  '                    ',
  '                    ',
  '                    ',
  '                    ',
  '####################',
];

function settle(p, e, frames = 20) {
  for (let i = 0; i < frames; i += 1) stepPlayer(p, {}, e, DT);
}

function run(p, e, input, frames) {
  let peak = p.y;
  let out = null;
  for (let i = 0; i < frames; i += 1) {
    out = stepPlayer(p, typeof input === 'function' ? input(i) : input, e, DT);
    peak = Math.min(peak, p.y);
  }
  return { peak, out };
}

test('runner reaches top speed quickly and stops where you expect', () => {
  const e = env(FLAT);
  const p = createPlayer(40, 112);
  settle(p, e);
  assert.equal(p.onGround, true);
  run(p, e, { right: true }, 10);
  assert.ok(p.vx >= PHYS.runMax * 0.95, `speed after 1/6 s: ${p.vx}`);
  run(p, e, {}, 6);
  assert.equal(p.vx, 0, 'stops within a tenth of a second');
});

test('variable jump height: a tap is a hop, a hold is a full jump', () => {
  const e = env(FLAT);
  const tap = createPlayer(40, 112);
  settle(tap, e);
  const ground = tap.y;
  const short = run(tap, e, (i) => ({ jump: i < 3, jumpPressed: i === 0 }), 50).peak;
  const hold = createPlayer(40, 112);
  settle(hold, e);
  const tall = run(hold, e, (i) => ({ jump: true, jumpPressed: i === 0 }), 50).peak;
  const hop = ground - short;
  const full = ground - tall;
  assert.ok(full > 50 && full < 62, `full jump ${full}px (3+ tiles)`);
  assert.ok(hop < full * 0.5, `tap ${hop}px is well under half of hold ${full}px`);
});

test('coyote time: a jump just after running off a ledge still works', () => {
  const e = env([
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '#####               ',
  ]);
  const p = createPlayer(60, 112);
  settle(p, e);
  // Run right until we have left the ledge.
  let frames = 0;
  while (p.onGround && frames < 120) { stepPlayer(p, { right: true }, e, DT); frames += 1; }
  assert.equal(p.onGround, false);
  // Four frames (~67 ms) later, press jump: still allowed.
  run(p, e, { right: true }, 4);
  const res = stepPlayer(p, { right: true, jump: true, jumpPressed: true }, e, DT);
  assert.equal(res.jumped, true, 'coyote jump fires');
  assert.ok(p.vy < -PHYS.jumpVel * 0.9);
});

test('coyote time runs out: no jump long after leaving the ledge', () => {
  const e = env(['                    ', '                    ', '                    ', '                    ', '                    ', '                    ', '                    ', '#####               ']);
  const p = createPlayer(60, 112);
  settle(p, e);
  while (p.onGround) stepPlayer(p, { right: true }, e, DT);
  run(p, e, { right: true }, 12);
  const res = stepPlayer(p, { right: true, jump: true, jumpPressed: true }, e, DT);
  assert.equal(res.jumped, false);
});

test('jump buffering: pressing just before landing jumps on touchdown', () => {
  const e = env(FLAT);
  const p = createPlayer(40, 40);
  // Fall from high up; press jump while still in the air.
  let landedAt = -1;
  for (let i = 0; i < 120; i += 1) {
    const nearGround = p.y + p.h > 112 - 10 && p.vy > 0 && landedAt < 0;
    const out = stepPlayer(p, { jump: true, jumpPressed: nearGround && landedAt === -1 }, e, DT);
    if (nearGround && landedAt === -1) landedAt = -2;
    if (out.jumped) { landedAt = i; break; }
  }
  assert.ok(landedAt >= 0, 'the buffered press turned into a jump on landing');
});

test('one-way ledges catch you from above and let you drop through', () => {
  const e = env([
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '    ------          ',
    '                    ',
    '                    ',
    '####################',
  ]);
  const p = createPlayer(88, 40);
  settle(p, e, 60);
  assert.equal(p.onGround, true);
  assert.equal(p.y + p.h, 64, 'standing on the ledge');
  stepPlayer(p, { down: true, jump: true, jumpPressed: true }, e, DT);
  settle(p, e, 60);
  assert.equal(p.y + p.h, 112, 'dropped through to the floor');
  // And you can jump up through it from below.
  run(p, e, (i) => ({ jump: true, jumpPressed: i === 0 }), 30);
  settle(p, e, 40);
  assert.equal(p.y + p.h, 64, 'jumped up through and landed on top');
});

test('ladders: climb down through a hole and back up', () => {
  const e = env([
    '                    ',
    '                    ',
    '                    ',
    '#####H##############',
    '#####H##############',
    '     H              ',
    '     H              ',
    '####################',
  ]);
  const p = createPlayer(88, 48);
  settle(p, e);
  assert.equal(p.onGround, true, 'stands on the ladder top like floor');
  run(p, e, { down: true }, 90);
  assert.equal(p.y + p.h, 112, 'reached the tunnel floor');
  assert.equal(p.mode, 'run');
  run(p, e, { up: true }, 90);
  assert.equal(p.y + p.h, 48, 'climbed back out on top');
  assert.equal(p.onGround, true);
});

test('vines swing on their own and can be pumped higher', () => {
  const idle = createVine(100, 0, 72, 0.3);
  let maxIdle = 0;
  for (let i = 0; i < 600; i += 1) { stepVine(idle, DT); maxIdle = Math.max(maxIdle, Math.abs(idle.theta)); }
  assert.ok(Math.abs(maxIdle - PHYS.vineAmplitude) < 0.12, `idle swing settles near its amplitude: ${maxIdle}`);

  const held = createVine(100, 0, 72, 0);
  held.holder = 0;
  held.theta = 0.2;
  held.omega = 0;
  let maxHeld = 0;
  for (let i = 0; i < 360; i += 1) {
    stepVine(held, DT, held.omega > 0 ? 1 : -1);
    maxHeld = Math.max(maxHeld, Math.abs(held.theta));
  }
  assert.ok(maxHeld > 0.9, `pumping builds the swing: ${maxHeld}`);
});

test('grab a vine mid-jump, then let go with the swing\'s momentum', () => {
  const e = env([
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '######        ######',
  ]);
  const vine = createVine(160, 32, 72, 0);
  vine.theta = -0.5;
  vine.omega = 0;
  e.vines = [vine];
  const end = vineEnd(vine);
  const p = createPlayer(end.x, end.y + 20);
  p.vy = -10;
  stepPlayer(p, {}, e, DT);
  assert.equal(p.mode, 'vine', 'caught the vine');
  assert.equal(vine.holder, p.id);
  // Swing forward, then let go while moving right.
  let released = false;
  for (let i = 0; i < 200 && !released; i += 1) {
    const forward = vine.omega > 0 && vine.theta > 0.25;
    const out = stepPlayer(p, { right: vine.omega > 0, left: vine.omega < 0, jump: forward, jumpPressed: forward }, e, DT);
    released = out.released;
  }
  assert.ok(released, 'let go');
  assert.equal(vine.holder, -1);
  assert.ok(p.vx > 60, `flies off with the swing: vx ${p.vx}`);
  assert.ok(p.vy < 0, 'and a little hop up');
});

test('quicksand: you sink slowly, can hop out, and sinking all the way is a hazard', () => {
  const e = env([
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '######QQQQ##########',
    '####################',
  ]);
  const p = createPlayer(120, 100);
  settle(p, e, 30);
  assert.equal(p.onSand, true);
  const sunk = p.sink;
  run(p, e, {}, 30);
  assert.ok(p.sink > sunk, 'keeps sinking');
  const res = stepPlayer(p, { jump: true, jumpPressed: true }, e, DT);
  assert.equal(res.jumped, true, 'can still hop out');
  assert.equal(p.sink, 0);
  settle(p, e, 40);
  let hazard = null;
  for (let i = 0; i < 200 && !hazard; i += 1) { stepPlayer(p, {}, e, DT); hazard = p.hazard; }
  assert.equal(hazard, 'sand');
});

test('water and pits are hazards; standing beside them is safe', () => {
  const e = env([
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '######~~~~##########',
    '####################',
  ]);
  const p = createPlayer(40, 112);
  settle(p, e);
  assert.equal(p.hazard, null);
  let hazard = null;
  for (let i = 0; i < 120 && !hazard; i += 1) { stepPlayer(p, { right: true }, e, DT); hazard = p.hazard; }
  assert.equal(hazard, 'water');
  assert.ok(p.safe.x < 96, 'the last safe spot is back on the bank');
});

test('8-way aim: up, diagonals, prone on the ground and straight down in the air', () => {
  const p = createPlayer(40, 112);
  p.onGround = true;
  p.facing = 1;
  assert.deepEqual(aimFrom(p, { up: true }), { x: 0, y: -1 });
  assert.deepEqual(aimFrom(p, { up: true, right: true }), { x: 1, y: -1 });
  assert.deepEqual(aimFrom(p, { down: true }), { x: 1, y: 0 }, 'prone shoots forward');
  assert.deepEqual(aimFrom(p, { down: true, left: true }), { x: -1, y: 1 });
  p.onGround = false;
  assert.deepEqual(aimFrom(p, { down: true }), { x: 0, y: 1 });
  assert.deepEqual(aimFrom(p, {}), { x: 1, y: 0 });
});

test('ducking shrinks the hurtbox under head-height shots', () => {
  const e = env(FLAT);
  const p = createPlayer(40, 112);
  settle(p, e);
  const tall = hurtbox(p);
  stepPlayer(p, { down: true }, e, DT);
  assert.equal(p.duck, true);
  const low = hurtbox(p);
  assert.ok(low.y >= tall.y + 6, 'top of the hurtbox drops');
  assert.ok(tall.w < p.w, 'the hurtbox is smaller than the body (generous)');
});
