const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/physics.js');
const Holes = require('../src/holes.js');
const Auto = require('../src/autoputt.js');

const { WORLDS, HOLES } = Holes;

test('18 holes: six per world, unique ids, sensible pars', () => {
  assert.equal(HOLES.length, 18);
  assert.equal(WORLDS.length, 3);
  for (const w of WORLDS) assert.equal(Holes.holesIn(w.id).length, 6, w.id);
  assert.equal(new Set(HOLES.map((h) => h.id)).size, 18);
  assert.equal(new Set(HOLES.map((h) => h.name)).size, 18);
  for (const h of HOLES) {
    assert.ok(h.par >= 2 && h.par <= 5, `${h.id} par`);
    assert.ok(h.tip && h.tip.length < 100, `${h.id} tip`);
    assert.ok(P.SURFACES[h.surface], `${h.id} surface`);
  }
});

test('tee and cup sit on open floor, clear of walls, rocks and hazards', () => {
  for (const h of HOLES) {
    const H = P.prepare(h);
    for (const [name, pt] of [['tee', H.tee], ['cup', H.cup]]) {
      assert.ok(!P.isVoid(H, pt.x, pt.y, 0), `${h.id} ${name} on floor`);
      for (const g of H.segs) {
        const dx = g.bx - g.ax, dy = g.by - g.ay;
        const u = Math.max(0, Math.min(1, ((pt.x - g.ax) * dx + (pt.y - g.ay) * dy) / (dx * dx + dy * dy)));
        assert.ok(Math.hypot(pt.x - g.ax - dx * u, pt.y - g.ay - dy * u) > P.BALL_R + P.WALL_T + 4, `${h.id} ${name} clear of walls`);
      }
      for (const o of [...H.posts, ...H.bumpers]) assert.ok(Math.hypot(pt.x - o.x, pt.y - o.y) > o.r + P.BALL_R + 4, `${h.id} ${name} clear of obstacles`);
      for (const w of H.wells) if (w.core) assert.ok(Math.hypot(pt.x - w.x, pt.y - w.y) > w.r, `${h.id} ${name} outside black holes`);
    }
    assert.ok(Math.hypot(H.tee.x - H.cup.x, H.tee.y - H.cup.y) > 250, `${h.id} tee is not next to the cup`);
    for (const p of H.portals) {
      assert.ok(!P.isVoid(H, p.a[0], p.a[1], 0) && !P.isVoid(H, p.b[0], p.b[1], 0), `${h.id} portals on floor`);
    }
  }
});

test('every hole fits its 1000 x 600 frame', () => {
  for (const h of HOLES) {
    for (const f of h.floor) {
      const pts = f.pts || [[f.circle[0] - f.circle[2], f.circle[1] - f.circle[2]], [f.circle[0] + f.circle[2], f.circle[1] + f.circle[2]]];
      const mv = f.move || { dx: 0, dy: 0 };
      for (const [x, y] of pts) {
        assert.ok(x >= 0 && x <= Holes.WIDTH && y >= 0 && y <= Holes.HEIGHT, `${h.id} floor inside frame`);
        assert.ok(x + mv.dx <= Holes.WIDTH && y + mv.dy <= Holes.HEIGHT, `${h.id} moving floor stays inside`);
      }
    }
  }
});

test('the cup is reachable on every hole', () => {
  for (const h of HOLES) {
    const H = P.prepare(h);
    assert.ok(Auto.costAt(H, H.tee.x, H.tee.y) < 5000, `${h.id}: walking path from tee to cup`);
  }
});

test('the autoputter sinks every hole within par + 3 without picking up', () => {
  for (const h of HOLES) {
    const play = Auto.autoplayHole(h);
    assert.equal(play.status, 'holed', h.id);
    assert.equal(play.pickedUp, false, `${h.id} not picked up`);
    assert.ok(play.strokes <= h.par + 3, `${h.id}: ${play.strokes} strokes on par ${h.par}`);
  }
});
