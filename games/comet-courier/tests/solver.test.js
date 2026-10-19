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

test('par is the fewest launches that collect every letter and then deliver', () => {
  // The star is straight above the spawn (a one-shot delivery), but a letter
  // sits off to the side, so the real par is two: fetch, then deliver.
  const level = levelWithStar({ x: 270, y: 160 }, { x: 270, y: 620 });
  level.letters = [{ x: 60, y: 420 }];
  const res = solve(level, level.spawn);
  assert.ok(res, 'solved');
  assert.ok(res.par >= 2, `the letter adds a launch (got ${res.par})`);
  const trace = replay(level, level.spawn, res.line);
  assert.ok(trace, 'the line replays');
  assert.equal(trace.at(-1).star, true, 'ends in the star');
  assert.equal(trace.at(-1).letters, 1, 'with the letter aboard');
  // Without the letter the same panel is a one-shot.
  const open = solve({ ...level, letters: [] }, level.spawn);
  assert.equal(open.par, 1);
});

test('a line that sinks the star with mail still loose is not a solution', () => {
  const level = levelWithStar({ x: 270, y: 300 }, { x: 270, y: 620 });
  level.letters = [{ x: 60, y: 60 }];
  // The straight-up line delivers, but leaves the letter behind.
  const bad = [{ angle: -Math.PI / 2, power: 1 }];
  assert.equal(replay(level, level.spawn, bad), null, 'rejected: satchel not full');
  // The solver's own line is accepted.
  const res = solve(level, level.spawn);
  assert.ok(res && replay(level, level.spawn, res.line), 'solver line delivers everything');
});

test('a level whose only route to a letter runs through the star is unsolvable', () => {
  // The letter sits behind the star in a dead-end slot: any shot that reaches
  // it must pass through the star first, which ends the attempt.
  const t = 16;
  // The slot is narrow enough that every way in passes within the star's
  // capture radius.
  const blocks = [
    { x: 220, y: 100, w: t, h: 220 },
    { x: 288, y: 100, w: t, h: 220 },
    { x: 220, y: 100, w: 84, h: t },
  ];
  const level = { blocks, asteroids: [], winds: [], springs: [], portals: [], wells: [], letters: [{ x: 262, y: 160 }], star: { x: 262, y: 300 }, spawn: { x: 262, y: 620 } };
  assert.equal(solve(level, level.spawn), null, 'the solver refuses it');
});
