import test from 'node:test';
import assert from 'node:assert/strict';
import { Flipper, makeBall, stepPhysics, contact, closestOnSegment, STEP, BALL_R } from '../src/physics.js';
import {
  OUTLINE, DRAIN, TABLE, SENSORS, INSERTS, SHOTS, SLINGS, BUMPERS, FLIPPERS, buildColliders, SERVE, PLUNGER, INLANE_POSTS,
} from '../src/table.js';
import { mulberry32 } from '../src/rng.js';

function ends(piece) {
  if (piece.shape === 'poly') return [piece.points[0], piece.points[piece.points.length - 1]];
  return [
    [piece.x + Math.cos(piece.a0) * piece.R, piece.y + Math.sin(piece.a0) * piece.R],
    [piece.x + Math.cos(piece.a1) * piece.R, piece.y + Math.sin(piece.a1) * piece.R],
  ];
}

test('the outline is one closed chain, open only at the drain', () => {
  for (let i = 0; i < OUTLINE.length - 1; i++) {
    const [, end] = ends(OUTLINE[i]);
    const [start] = ends(OUTLINE[i + 1]);
    assert.ok(Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.5, `gap after piece ${i}`);
  }
  const [first] = ends(OUTLINE[0]);
  const [, last] = ends(OUTLINE[OUTLINE.length - 1]);
  // The chain starts and ends on the bottom edge: that gap is the drain.
  assert.equal(first[1], DRAIN.y);
  assert.equal(first[0], DRAIN.x0);
  assert.equal(last[0], DRAIN.x1);
  // ...and the plunger-lane wall runs down from its end to the drain line.
  const lane = buildColliders().find((c) => c.shape === 'seg' && c.ax === DRAIN.x1 && c.ay === DRAIN.y);
  assert.ok(lane && Math.abs(lane.bx - last[0]) < 0.5 && Math.abs(lane.by - last[1]) < 0.5);
});

test('every outline piece is built as a collider', () => {
  const cols = buildColliders();
  for (const piece of OUTLINE) {
    if (piece.shape === 'arc') {
      assert.ok(cols.some((c) => c.shape === 'arc' && c.x === piece.x && c.R === piece.R && c.a0 === piece.a0 && c.a1 === piece.a1));
      continue;
    }
    for (let i = 0; i < piece.points.length - 1; i++) {
      const [a, b] = [piece.points[i], piece.points[i + 1]];
      // Some collider segment covers this piece (both ends lie on it).
      const on = (c, p) => {
        const o = {};
        closestOnSegment(p[0], p[1], c.ax, c.ay, c.bx, c.by, o);
        return Math.hypot(o.x - p[0], o.y - p[1]) < 0.5;
      };
      assert.ok(cols.some((c) => c.shape === 'seg' && c.kind === 'wall' && on(c, a) && on(c, b)), `segment ${a} -> ${b}`);
    }
  }
});

test('switches, inserts and shot arrows are on the table', () => {
  const inside = (x, y) => x > 0 && x < TABLE.w && y > 0 && y < TABLE.h;
  for (const s of SENSORS) assert.ok(inside(s.ax, s.ay) && inside(s.bx, s.by), s.id);
  for (const s of SHOTS) assert.ok(inside(s.arrow.x, s.arrow.y), s.id);
  for (const list of Object.values(INSERTS)) for (const p of [].concat(list)) assert.ok(inside(p.x, p.y));
});

// Solid areas a ball centre must never be inside.
function insideSolid(b) {
  for (const s of SLINGS) {
    const [a, c, d] = [s.a, s.b, s.c];
    const sign = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    const P = [b.x, b.y];
    const d1 = sign(P, a, c), d2 = sign(P, c, d), d3 = sign(P, d, a);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return 'slingshot';
  }
  for (const bp of BUMPERS) if (Math.hypot(b.x - bp.x, b.y - bp.y) < 24 + BALL_R - 3) return 'bumper';
  return null;
}

test('no gaps: random balls up to 6000 units/s never leave except down the drain', () => {
  const rng = mulberry32(2024);
  const cols = buildColliders();
  let drained = 0;
  for (let n = 0; n < 160; n++) {
    const flippers = FLIPPERS.map((f) => new Flipper(f));
    // Random free spot in the main playfield.
    let ball;
    for (;;) {
      ball = makeBall(40 + rng() * 520, 120 + rng() * 760);
      const hit = {};
      if (!cols.some((c) => c.layer === 0 && contact(ball, c, hit) > 0) && !insideSolid(ball)) break;
    }
    const a = rng() * Math.PI * 2, s = 500 + rng() * 5500;
    ball.vx = Math.cos(a) * s; ball.vy = Math.sin(a) * s;
    for (let i = 0; i < Math.round(3 / STEP); i++) {
      if (i % 40 === 0) for (const f of flippers) f.pressed = rng() < 0.5;
      stepPhysics([ball], cols, flippers, STEP);
      if (ball.layer === 0) {
        const where = insideSolid(ball);
        assert.equal(where, null, `ball ${n} inside a ${where} at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}`);
      }
      if (ball.y > DRAIN.y) {
        assert.ok(ball.x > DRAIN.x0 && ball.x < DRAIN.x1, `ball ${n} left through the bottom at x=${ball.x.toFixed(0)}`);
        drained++;
        break;
      }
      assert.ok(ball.x > 20 && ball.x < 620 && ball.y > 30, `ball ${n} escaped at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}`);
    }
  }
  assert.ok(drained > 0);
});

test('the plunger lane serves the ball and a full pull clears the one-way gate', () => {
  const cols = buildColliders();
  const ball = makeBall(SERVE.x, SERVE.y);
  for (let i = 0; i < 240; i++) stepPhysics([ball], cols, [], STEP);
  assert.ok(Math.abs(ball.y - SERVE.y) < 1, 'rests on the plunger');
  ball.vy = -3800;
  let left = false;
  for (let i = 0; i < 240 * 2; i++) {
    stepPhysics([ball], cols, [], STEP);
    if (ball.x < PLUNGER.laneX0 - 20) left = true;
  }
  assert.ok(left, 'the ball left the shooter lane into the playfield');
  // A weak plunge falls straight back onto the plunger.
  const weak = makeBall(SERVE.x, SERVE.y, 0, -900);
  for (let i = 0; i < 240 * 2; i++) stepPhysics([weak], cols, [], STEP);
  assert.ok(weak.x > PLUNGER.laneX0 && weak.y > 1000);
});

test('outlane mouths: the left one is narrowed, both still let a ball riding the bump through', () => {
  // The wall bump's corner and the underside line running down to the wall.
  const sides = [
    { corner: [54, 690], low: [20, 730], post: INLANE_POSTS[0] },
    { corner: [550, 690], low: [584, 730], post: INLANE_POSTS[1] },
  ];
  const gaps = sides.map(({ corner, low, post }) => {
    const dx = corner[0] - low[0], dy = corner[1] - low[1], l = Math.hypot(dx, dy);
    const toLine = Math.abs((post.x - low[0]) * dy - (post.y - low[1]) * dx) / l;
    return {
      mouth: Math.hypot(post.x - corner[0], post.y - corner[1]) - 3 - 5, // wall and post radii
      along: toLine - 3 - 5, // clearance for a ball hugging the bump's underside
    };
  });
  for (const g of gaps) assert.ok(g.along > 2 * BALL_R, `a ball riding the bump fits (${g.along.toFixed(1)})`);
  assert.ok(gaps[0].mouth < gaps[1].mouth - 3, `left mouth ${gaps[0].mouth.toFixed(1)} vs right ${gaps[1].mouth.toFixed(1)}`);
  assert.ok(gaps[0].mouth > 2 * BALL_R, 'but a ball can still go down it');
});
