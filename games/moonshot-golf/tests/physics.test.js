const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/physics.js');
const Play = require('../src/play.js');

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
// A plain walled box with the cup tucked in a far corner, out of the way.
const boxHole = (extra = {}) => ({
  id: 'box', par: 3, surface: 'clay', tee: [150, 300], cup: [900, 100],
  floor: [{ pts: rect(50, 50, 900, 500) }], walls: [{ pts: rect(50, 50, 900, 500), closed: true }], ...extra,
});

function roll(H, sim, max = 3000) {
  let r = null;
  for (let i = 0; i < max && !r; i++) {
    r = P.stepBall(H, sim, P.STEP);
    if (!r && sim.vx === 0 && sim.vy === 0) break;
  }
  return r;
}

test('a ball on flat ground slows down monotonically and stops near the predicted distance', () => {
  const H = P.prepare(boxHole());
  const sim = P.createSim(150, 300);
  sim.vx = 400;
  let last = 400;
  for (let i = 0; i < 2000; i++) {
    P.stepBall(H, sim, P.STEP);
    const v = P.speedOf(sim);
    assert.ok(v <= last + 1e-9, 'speed never increases on flat ground');
    last = v;
    if (v === 0) break;
  }
  assert.equal(last, 0);
  const expected = P.rollDistance(400, P.SURFACES.clay);
  assert.ok(Math.abs(sim.x - 150 - expected) < 12, `rolled ${sim.x - 150}, expected ~${expected}`);
  assert.equal(sim.y, 300);
});

test('static walls never add energy and restitution damps the normal speed', () => {
  const H = P.prepare(boxHole());
  const sim = P.createSim(800, 300);
  sim.vx = 900;
  let maxAfter = 0, sawBounce = false;
  for (let i = 0; i < 60; i++) {
    const before = P.speedOf(sim);
    P.stepBall(H, sim, P.STEP);
    assert.ok(P.speedOf(sim) <= before + 1e-9);
    if (sim.vx < 0) { sawBounce = true; maxAfter = Math.max(maxAfter, -sim.vx); }
  }
  assert.ok(sawBounce, 'ball bounced off the right wall');
  assert.ok(maxAfter < 900 * 0.75, `rebound ${maxAfter} is damped`);
  assert.ok(sim.x < 950 - P.BALL_R - P.WALL_T + 0.5, 'ball stays inside the wall');
});

test('random hard shots never escape a fully walled box', () => {
  const H = P.prepare(boxHole());
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 40; k++) {
    const sim = P.createSim(100 + rnd() * 800, 100 + rnd() * 400);
    const a = rnd() * Math.PI * 2;
    sim.vx = Math.cos(a) * P.MAX_SPEED;
    sim.vy = Math.sin(a) * P.MAX_SPEED;
    const r = roll(H, sim);
    assert.notEqual(r, 'void', 'never falls out of a walled box');
    assert.ok(sim.x > 50 && sim.x < 950 && sim.y > 50 && sim.y < 550);
  }
});

test('a slow, centered ball drops in; a fast one lips out', () => {
  const H = P.prepare(boxHole({ cup: [500, 300] }));
  const slow = P.createSim(430, 300);
  slow.vx = 200;
  assert.equal(roll(H, slow), 'sunk');

  const fast = P.createSim(300, 300);
  fast.vx = 950;
  const events = [];
  fast.events = events;
  for (let i = 0; i < 40; i++) assert.notEqual(P.stepBall(H, fast, P.STEP), 'sunk');
  assert.ok(events.some((e) => e.type === 'lip'), 'fast ball lipped out');
  assert.ok(P.captureSpeed(0) > P.captureSpeed(P.CUP_R - 3), 'rim shots need a slower ball');
});

test('rolling off an open edge falls into space', () => {
  const H = P.prepare({ id: 'edge', par: 2, surface: 'clay', tee: [100, 300], cup: [300, 100], floor: [{ pts: rect(50, 250, 400, 100) }] });
  const sim = P.createSim(100, 300);
  sim.vx = 700;
  assert.equal(roll(H, sim), 'void');
  assert.equal(sim.fell.cause, 'space');
});

test('sand stops the ball far sooner than clay', () => {
  const dist = (surface) => {
    const H = P.prepare(boxHole({ id: surface, zones: surface === 'sand' ? [{ pts: rect(50, 50, 900, 500), surface: 'sand' }] : [] }));
    const sim = P.createSim(150, 300);
    sim.vx = 600;
    roll(H, sim);
    return sim.x - 150;
  };
  assert.ok(dist('sand') < dist('clay') / 3);
});

test('portals teleport the ball with its speed and exit direction', () => {
  const H = P.prepare(boxHole({ portals: [{ a: [300, 300], b: [700, 450], r: 20, exitAngle: -Math.PI / 2 }] }));
  const sim = P.createSim(200, 300);
  sim.vx = 500;
  sim.events = [];
  for (let i = 0; i < 40 && sim.portalLock < 0; i++) P.stepBall(H, sim, P.STEP);
  assert.ok(sim.events.some((e) => e.type === 'portal'));
  assert.ok(Math.hypot(sim.x - 700, sim.y - 450) < 20);
  assert.ok(sim.vy < -300 && Math.abs(sim.vx) < 1, 'leaves heading up');
});

test('boost pads speed a ball up but ignore one rolling back against them', () => {
  const pad = { x: 400, y: 300, r: 30, angle: 0, speed: 800 };
  const H = P.prepare(boxHole({ boosts: [pad] }));
  const fwd = P.createSim(340, 300);
  fwd.vx = 150;
  let peak = 0;
  for (let i = 0; i < 60; i++) { P.stepBall(H, fwd, P.STEP); peak = Math.max(peak, fwd.vx); }
  assert.ok(peak > 600, `boosted to ${peak}`);

  const back = P.createSim(460, 300);
  back.vx = -300;
  for (let i = 0; i < 40; i++) P.stepBall(H, back, P.STEP);
  assert.ok(back.vx < 0, 'still rolling backward');
});

test('bumpers kick harder than they are hit; black holes swallow what they catch', () => {
  const Hb = P.prepare(boxHole({ bumpers: [{ x: 400, y: 300, r: 20 }] }));
  const s = P.createSim(340, 300);
  s.vx = 150;
  for (let i = 0; i < 60; i++) P.stepBall(Hb, s, P.STEP);
  assert.ok(s.vx < -200, `kicked back at ${s.vx}`);

  const Hw = P.prepare(boxHole({ wells: [{ x: 500, y: 300, r: 150, k: 650, core: 20 }] }));
  const w = P.createSim(420, 300);
  assert.equal(roll(Hw, w), 'void');
  assert.equal(w.fell.cause, 'blackhole');
});

test('bowls pull a resting ball in and moving scenery is a pure function of time', () => {
  const H = P.prepare(boxHole({ cup: [500, 300], slopes: [{ circle: [500, 300, 120], k: 400 }] }));
  const sim = P.createSim(600, 300);
  assert.equal(roll(H, sim), 'sunk', 'rolled down into the cup');

  const m = { dx: 0, dy: 200, period: 4, phase: 0 };
  assert.deepEqual(P.motion(m, 1.3), P.motion(m, 1.3));
  assert.equal(P.motion(m, 0).y, 0);
  assert.ok(Math.abs(P.motion(m, 2).y - 200) < 1e-9);
});

test('the same putt replays identically', () => {
  const holes = require('../src/holes.js').HOLES;
  for (const def of holes.filter((h) => P.prepare(h).dynamic)) {
    const run = () => {
      const p = Play.createPlay(def);
      for (let i = 0; i < 37; i++) Play.stepPlay(p);
      Play.putt(p, 0.3, 0.7);
      for (let i = 0; i < 3000 && p.status !== 'ready' && p.status !== 'holed'; i++) Play.stepPlay(p);
      return [p.sim.x, p.sim.y, p.strokes, p.status];
    };
    assert.deepEqual(run(), run(), def.id);
  }
});

test('the aim preview starts at the ball and reflects off the first wall', () => {
  const H = P.prepare(boxHole());
  const pts = P.previewPath(H, 800, 300, 0, 0.6, 0);
  assert.deepEqual(pts[0], [800, 300]);
  const bounce = pts.find((p) => p[2] === 'bounce');
  assert.ok(bounce && bounce[0] > 920, 'bounces at the right wall');
  assert.ok(pts[pts.length - 1][0] < bounce[0], 'then heads back');
});
