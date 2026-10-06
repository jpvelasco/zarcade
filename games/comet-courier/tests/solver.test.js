import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, replay } from '../src/solver.js';
import { stepShot, STAR_OUT } from '../src/sim.js';

function levelWithStar(star, spawn) {
  return { blocks: [], asteroids: [], winds: [], springs: [], portals: [], star, spawn };
}

test('a one-shot open level solves with par 1', () => {
  const level = levelWithStar({ x: 270, y: 200 }, { x: 270, y: 600 });
  const res = solve(level, level.spawn);
  assert.ok(res, 'solved');
  assert.equal(res.par, 1);
  assert.equal(res.line.length, 1);
  // Replaying the line must sink the star.
  const trace = replay(level, level.spawn, res.line);
  assert.ok(trace, 'replayed');
  assert.equal(trace[trace.length - 1].star, true);
});

test('a walled star needs at least two shots', () => {
  // Star inside a box with a small gap on the west; spawn on the east.
  const star = { x: 270, y: 300 };
  const t = 16;
  const s = 40;
  const blocks = [
    { x: 270 - s, y: 300 - s - t, w: 2 * s, h: t }, // N
    { x: 270 - s, y: 300 + s, w: 2 * s, h: t }, // S
    { x: 270 + s, y: 300 - s, w: t, h: 2 * s }, // E
  ];
  // West side split with a gap near the top.
  blocks.push({ x: 270 - s - t, y: 300 - s, w: t, h: 20 });
  blocks.push({ x: 270 - s - t, y: 300 + 10, w: t, h: 50 });
  const level = { blocks, asteroids: [], winds: [], springs: [], portals: [], star, spawn: { x: 470, y: 600 } };
  const res = solve(level, level.spawn);
  assert.ok(res, 'solved');
  assert.ok(res.par >= 2, `needs a placement + a sink (got ${res.par})`);
});

test('replay follows the solver line exactly and stops at the star', () => {
  const level = levelWithStar({ x: 200, y: 160 }, { x: 200, y: 600 });
  const res = solve(level, level.spawn);
  const trace = replay(level, level.spawn, res.line);
  assert.ok(trace);
  assert.equal(trace[trace.length - 1].star, true);
  for (let i = 0; i < trace.length - 1; i++) {
    assert.equal(trace[i].star, false, 'only the final shot sinks the star');
  }
});

test('an unsolvable layout (star fully boxed) returns null', () => {
  // A fully enclosed star: no gap at all.
  const star = { x: 270, y: 300 };
  const t = 16;
  const s = 40;
  const blocks = [
    { x: 270 - s, y: 300 - s - t, w: 2 * s, h: t },
    { x: 270 - s, y: 300 + s, w: 2 * s, h: t },
    { x: 270 + s, y: 300 - s, w: t, h: 2 * s },
    { x: 270 - s - t, y: 300 - s, w: t, h: 2 * s },
  ];
  const level = { blocks, asteroids: [], winds: [], springs: [], portals: [], star, spawn: { x: 80, y: 600 } };
  const res = solve(level, level.spawn);
  assert.equal(res, null, 'fully enclosed star is unsolvable');
});

test('the solver is bounded and does not run forever', () => {
  // A tricky open field; the solver must return (a par or null) quickly.
  const level = { blocks: [{ x: 150, y: 150, w: 240, h: 20 }], asteroids: [{ x: 270, y: 400, r: 40 }], winds: [], springs: [], portals: [], star: { x: 100, y: 100 }, spawn: { x: 460, y: 600 } };
  const t0 = Date.now();
  const res = solve(level, level.spawn);
  const ms = Date.now() - t0;
  assert.ok(res === null || (res.par >= 1 && res.par <= 5), 'bounded result');
  assert.ok(ms < 8000, `solved in ${ms}ms`);
});

test('a portal lets the solver route across the field', () => {
  const star = { x: 460, y: 120 };
  const level = { blocks: [], asteroids: [], winds: [], springs: [], portals: [{ ax: 100, ay: 600, bx: 460, by: 260 }], star, spawn: { x: 100, y: 560 } };
  const res = solve(level, level.spawn);
  assert.ok(res, 'solved via portal');
  const trace = replay(level, level.spawn, res.line);
  assert.ok(trace, 'replayed');
  assert.equal(trace[trace.length - 1].star, true);
});
