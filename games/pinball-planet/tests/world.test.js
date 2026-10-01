import test from 'node:test';
import assert from 'node:assert/strict';
import { World, STEP, plungeSpeed, PLUNGE } from '../src/world.js';
import { HOLE, RAMP, SERVE } from '../src/table.js';
import { Autoplayer } from '../src/ai.js';

function play(seed = 1) {
  const w = new World({ seed });
  w.startGame();
  w.events.length = 0;
  return w;
}
function run(w, seconds, ctl = {}) {
  const seen = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    w.step(STEP, typeof ctl === 'function' ? ctl(i * STEP) : ctl);
    seen.push(...w.events);
    w.events.length = 0;
  }
  return seen;
}
const types = (ev) => ev.map((e) => e.type);
const ball = (w) => w.balls[0];

test('serving puts a ball on the plunger; holding and releasing launches it', () => {
  const w = play();
  assert.equal(w.balls.length, 1);
  assert.ok(w.shooterBall());
  const ev = run(w, 0.9, (t) => ({ plunge: t < 0.6 }));
  assert.ok(types(ev).includes('plunge'));
  assert.ok(ball(w).y < SERVE.y - 100, 'on its way up the lane');
  assert.ok(w.rules.ballSave > 0, 'ball save started');
});

test('plunge strength is monotonic, with a gentle skill-shot stretch in the middle', () => {
  let last = 0;
  for (let p = 0; p <= 1; p += 0.05) {
    const s = plungeSpeed(p);
    assert.ok(s >= last);
    last = s;
  }
  const [, a, b] = PLUNGE.curve;
  const slopeMid = (b[1] - a[1]) / (b[0] - a[0]);
  const slopeTop = (PLUNGE.curve[3][1] - b[1]) / (1 - b[0]);
  assert.ok(slopeMid * 10 < slopeTop);
});

test('a medium plunge drops into a U-F-O lane; a full plunge goes round the orbit', () => {
  const lanes = new Set();
  for (let p = 0.33; p <= 0.55; p += 0.02) {
    const w = play();
    w.balls[0].vy = -plungeSpeed(p);
    const ev = run(w, 2.5);
    const first = ev.find((e) => e.type === 'rollover');
    if (first && first.id.startsWith('lane')) lanes.add(first.id);
  }
  assert.ok(lanes.size >= 2, `lanes reached: ${[...lanes]}`);
  const w = play();
  w.balls[0].vy = -plungeSpeed(1);
  const ev = run(w, 1.5);
  assert.ok(ev.some((e) => e.type === 'rollover' && e.id === 'leftOrbit'));
});

test('the Comet Ramp: a good shot rides the upper layer and returns to the right inlane', () => {
  const w = play();
  const b = ball(w);
  b.x = RAMP.upX; b.y = RAMP.entryY + 40; b.vx = 0; b.vy = -2300;
  let maxLayer = 0;
  const ev = run(w, 2, () => { maxLayer = Math.max(maxLayer, b.layer); return {}; });
  assert.equal(maxLayer, 1);
  assert.ok(types(ev).includes('rampEnter'));
  assert.ok(types(ev).includes('ramp'), 'ramp made');
  assert.ok(w.rules.lockLit, 'the ramp lights the lock');
  assert.ok(ev.some((e) => e.type === 'rollover' && e.id === 'rightInlane'), 'fed to the right inlane');
  assert.equal(b.layer, 0);
});

test('a weak ramp shot rolls back down to the playfield', () => {
  const w = play();
  const b = ball(w);
  b.x = RAMP.upX; b.y = RAMP.entryY + 30; b.vx = 0; b.vy = -700;
  const ev = run(w, 2);
  assert.ok(types(ev).includes('rampEnter'));
  assert.ok(types(ev).includes('rampFail'));
  assert.ok(!types(ev).includes('ramp'));
  assert.equal(b.layer, 0);
});

test('orbit shots loop round the top and count', () => {
  for (const [x, id] of [[45, 'leftOrbit'], [559, 'rightOrbit']]) {
    const w = play();
    const b = ball(w);
    b.x = x; b.y = 560; b.vx = 0; b.vy = -2800;
    const ev = run(w, 1.5);
    assert.ok(ev.some((e) => e.type === 'orbit' && e.id === id), id);
    assert.ok(w.rules.score >= 50000);
  }
});

test('the Black Hole pulls a slow ball in, holds it, and kicks it back out', () => {
  const w = play();
  const b = ball(w);
  b.x = HOLE.x + 20; b.y = HOLE.y + 30; b.vx = -60; b.vy = -150;
  const ev = run(w, 3);
  assert.ok(types(ev).includes('holeIn'));
  assert.ok(types(ev).includes('holeOut'));
  assert.ok(w.rules.score >= 100000);
});

test('locking two balls in the Black Hole starts a three-ball multiball', () => {
  const w = play();
  const toHole = (b) => { b.x = HOLE.x; b.y = HOLE.y + 6; b.vx = 0; b.vy = 0; b.layer = 0; };
  w.rules.lockLit = true;
  w.rules.onLaunch();
  toHole(ball(w));
  let ev = run(w, 0.1);
  assert.ok(types(ev).includes('lock'));
  assert.equal(w.balls.length, 1, 'a new ball is served');
  run(w, 2); // auto-launch
  w.rules.lockLit = true;
  const b = w.balls.find((x) => !x.held);
  toHole(b);
  ev = run(w, 4);
  assert.ok(types(ev).includes('multiball'));
  assert.equal(w.balls.length, 3);
  assert.ok(w.rules.multiball);
});

test('drains: ball save, then end of ball with a bonus, then the next ball', () => {
  const w = play();
  w.rules.onLaunch();
  const drop = () => { const b = ball(w); b.x = 302; b.y = 1090; b.vx = 0; b.vy = 800; b.layer = 0; };
  drop();
  let ev = run(w, 0.2);
  assert.ok(types(ev).includes('ballSave'));
  assert.equal(w.balls.length, 1);
  drop();
  ev = run(w, 0.2);
  assert.ok(types(ev).includes('endBall'));
  assert.equal(w.state, 'bonus');
  ev = run(w, 4);
  assert.equal(w.state, 'play');
  assert.equal(w.rules.ball, 2);
  assert.ok(w.shooterBall());
});

test('three drained balls end the game', () => {
  const w = play();
  for (let i = 0; i < 3; i++) {
    const b = ball(w);
    b.x = 302; b.y = 1090; b.vy = 800;
    run(w, 4);
  }
  assert.equal(w.state, 'over');
});

test('the left outlane kickback fires the ball back up once', () => {
  const w = play();
  const b = ball(w);
  b.x = 40; b.y = 940; b.vx = 0; b.vy = 600;
  const ev = run(w, 0.3);
  assert.ok(types(ev).includes('kickback'));
  assert.ok(b.vy < 0 && b.y < 940);
  assert.equal(w.rules.kickbackLit, false);
});

test('nudging pushes balls; too much tilts and kills the flippers', () => {
  const w = play();
  const b = ball(w);
  b.x = 300; b.y = 700; b.vx = 0; b.vy = 0;
  run(w, STEP, { nudge: 1 });
  assert.ok(b.vx > 100);
  let tilted = false;
  for (let i = 0; i < 20 && !tilted; i++) {
    const ev = run(w, 0.32, (t) => ({ nudge: t === 0 ? -1 : 0 }));
    tilted = ev.some((e) => e.type === 'tilt');
  }
  assert.ok(tilted);
  run(w, 0.1, { left: true, right: true });
  assert.ok(w.flippers.every((f) => f.angle === f.rest), 'flippers are dead');
});

test('a ball that stops somewhere odd gets a ball-search kick', () => {
  const w = play();
  const b = ball(w);
  // Wedge it on top of the asteroid bank and pin it there.
  b.x = 302; b.y = 578; b.vx = 0; b.vy = 0;
  let searched = false;
  for (let i = 0; i < Math.round(7 / STEP) && !searched; i++) {
    b.vx = 0; b.vy = 0; b.x = 302; b.y = 578;
    w.step(STEP, {});
    searched = w.events.some((e) => e.type === 'search');
    w.events.length = 0;
  }
  assert.ok(searched);
});

test('the same seed and inputs replay the same game', () => {
  const once = () => {
    const w = new World({ seed: 9 });
    const ai = new Autoplayer(5);
    w.startGame();
    for (let i = 0; i < Math.round(40 / STEP); i++) { w.step(STEP, ai.controls(w, STEP)); w.events.length = 0; }
    return [w.rules.score, w.balls.map((b) => b.x.toFixed(6))];
  };
  assert.deepEqual(once(), once());
});
