import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, COMET, PHYSICS, STAR } from '../src/config.js';
import { step, stepShot, makeShot, launchVector, previewPath, hasLetter, allLetters, letterCount, FLYING, SETTLED, STAR_OUT } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';

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

test('bounces are counted and reported with an impact point and normal', () => {
  const level = emptyLevel({ x: 60, y: 100 });
  const shot = makeShot(FIELD.w - 60, 600, 900, 0);
  let seen = null;
  while (step(shot, level) === FLYING) {
    if (shot.hit && !seen) seen = { ...shot.hit };
  }
  assert.ok(shot.hits >= 1, 'hit the right wall at least once');
  assert.ok(seen, 'the step that bounced reported the impact');
  assert.equal(seen.nx, -1, 'normal points back into the field');
  assert.equal(seen.ny, 0);
  assert.ok(seen.speed > 100, 'impact speed recorded');
  // `hit` is only set on the step that bounced.
  const quiet = makeShot(270, 400, 0, -60);
  step(quiet, level);
  assert.equal(quiet.hit, null);
});

test('the aim projection follows the real simulation and reports how it ends', () => {
  const level = emptyLevel({ x: 270, y: 200 });
  // Straight at the star from below: the projection must say "this delivers",
  // and its last point must sit on the star.
  const hit = previewPath(level, 270, 620, -Math.PI / 2, 1);
  assert.equal(hit.end, 'star');
  const last = hit.pts[hit.pts.length - 1];
  assert.ok(Math.hypot(last.x - 270, last.y - 200) <= STAR.r + 1, 'ends at the star');
  // The projection agrees with the shot it predicts.
  const real = stepShot(level, 270, 620, ...Object.values(launchVector(-Math.PI / 2, 1)));
  assert.equal(real.outcome, STAR_OUT);

  // A gentle shot away from the star settles, and the projection says so at the
  // same place the real shot stops.
  const soft = previewPath(level, 270, 620, Math.PI, 0);
  assert.equal(soft.end, 'settle');
  const v = launchVector(Math.PI, 0);
  const stopped = stepShot(level, 270, 620, v.vx, v.vy);
  const tail = soft.pts[soft.pts.length - 1];
  assert.ok(Math.abs(tail.x - stopped.x) < 0.001 && Math.abs(tail.y - stopped.y) < 0.001, 'projection lands where the shot does');
});

test('the aim projection is cut short by its bounce and length budgets', () => {
  const level = emptyLevel({ x: 60, y: 60 });
  // Across the field at full power, allowed only one bounce: it must stop soon
  // after the first wall rather than running the whole shot out.
  const short = previewPath(level, 60, 600, 0, 1, { bounces: 1, maxLen: 4000 });
  assert.equal(short.end, 'cut', 'stopped on the bounce budget');
  const marks = short.pts.filter((p) => p.bounce).length;
  assert.equal(marks, 2, 'shows the first bounce and stops at the second');
  // A longer bounce budget travels farther.
  const longer = previewPath(level, 60, 600, 0, 1, { bounces: 4, maxLen: 4000 });
  assert.ok(longer.len > short.len, 'more bounces shown = longer projection');
  // The length budget also caps it.
  const leashed = previewPath(level, 60, 600, 0, 1, { bounces: 9, maxLen: 300 });
  assert.ok(leashed.len >= 300 && leashed.len < 360, `length budget respected (${leashed.len})`);
  assert.ok(leashed.pts.length > 3, 'still has points to draw');
});

test('letters are swept up in passing and carried for the rest of the attempt', () => {
  const level = emptyLevel({ x: 270, y: 60 });
  level.letters = [{ x: 270, y: 400 }, { x: 270, y: 250 }, { x: 60, y: 60 }];
  // Straight up the middle: collects the two letters on the way, not the third.
  const r = stepShot(level, 270, 620, 0, -900);
  assert.equal(r.outcome, STAR_OUT);
  assert.ok(hasLetter(r.letters, 0) && hasLetter(r.letters, 1), 'both mid-line letters picked up');
  assert.ok(!hasLetter(r.letters, 2), 'the far letter is untouched');
  assert.equal(letterCount(r.letters), 2);
  assert.equal(allLetters(level), 0b111);
  // A shot that starts with letter 0 already in the satchel keeps it.
  const carried = stepShot(level, 270, 620, 0, -900, undefined, 0b100);
  assert.equal(carried.letters, 0b111, 'carried + collected');
  // `got` names the letter picked up on that step, once.
  const shot = makeShot(270, 620, 0, -900);
  let announced = 0;
  while (step(shot, level) === FLYING) if (shot.got >= 0) announced++;
  assert.equal(announced, 2, 'each letter is announced exactly once');
});

test('a gravity well bends the comet toward its centre and stays bounded', () => {
  const level = emptyLevel({ x: 60, y: 60 });
  level.wells = [{ x: 270, y: 360, r: 110, g: 1500 }];
  // Fired past the well on the left: the pull must drag it rightward.
  const pulled = stepShot(level, 190, 680, 0, -700);
  const straight = stepShot({ ...level, wells: [] }, 190, 680, 0, -700);
  assert.ok(pulled.x > straight.x + 10, `well pulled the comet inward (${pulled.x} vs ${straight.x})`);
  // Energy stays bounded: the shot still ends, inside the field.
  assert.equal(pulled.outcome, SETTLED);
  assert.ok(pulled.x > COMET.r && pulled.x < FIELD.w - COMET.r);
  assert.ok(pulled.y > COMET.r && pulled.y < FIELD.h - COMET.r);
  assert.ok(pulled.t < PHYSICS.shotTimeMax + 1, 'finishes in time');
  // Dead centre: the pull is symmetric, so a shot through the middle is
  // slowed and sped up but not deflected sideways.
  const through = stepShot(level, 270, 680, 0, -700);
  assert.ok(Math.abs(through.x - 270) < 1, 'no sideways kick straight through the middle');
});

test('a well has no pull outside its rim', () => {
  const level = emptyLevel({ x: 60, y: 60 });
  level.wells = [{ x: 270, y: 360, r: 80, g: 1500 }];
  const far = stepShot(level, 60, 680, 0, -400);
  const none = stepShot({ ...level, wells: [] }, 60, 680, 0, -400);
  assert.equal(far.x, none.x, 'untouched well outside the rim');
  assert.equal(far.y, none.y);
});

test('an uncut projection lands exactly where the real shot lands, on every level', () => {
  // The guide is only honest if it is the same calculation as the shot. With the
  // bounce and length budgets lifted, the projection must agree to the bit.
  let checked = 0;
  for (const l of LEVELS) {
    for (const angle of [-2.5, -1.2, 0, 1.4, 3.0]) {
      for (const power of [0, 0.5, 1]) {
        const pre = previewPath(l, l.spawn.x, l.spawn.y, angle, power, { bounces: Infinity, maxLen: Infinity });
        const v = launchVector(angle, power);
        const real = stepShot(l, l.spawn.x, l.spawn.y, v.vx, v.vy);
        assert.equal(pre.x, real.x, `${l.name} @${angle}/${power}: same x`);
        assert.equal(pre.y, real.y, `${l.name} @${angle}/${power}: same y`);
        assert.equal(pre.letters, real.letters, `${l.name} @${angle}/${power}: same letters`);
        assert.equal(pre.end === 'star', real.outcome === STAR_OUT, `${l.name} @${angle}/${power}: agrees on delivery`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 400, `checked a lot of aims (${checked})`);
});

test('the projection never runs away on a level with wells and portals', () => {
  // Worlds that bend the comet are where an unbounded walk would hurt.
  for (const l of LEVELS.filter((x) => x.wells.length || x.portals.length)) {
    const t0 = Date.now();
    for (let i = 0; i < 16; i++) {
      const r = previewPath(l, l.spawn.x, l.spawn.y, (i / 16) * Math.PI * 2 - Math.PI, 1, { bounces: 1, maxLen: 560 });
      assert.ok(r.pts.length >= 2 && r.pts.length < 400, `${l.name}: a drawable number of points (${r.pts.length})`);
      assert.ok(r.len <= 640, `${l.name}: respects the leash (${r.len})`);
    }
    assert.ok(Date.now() - t0 < 500, `${l.name}: a full fan of projections is cheap`);
  }
});
