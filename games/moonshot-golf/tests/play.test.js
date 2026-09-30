const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/physics.js');
const Play = require('../src/play.js');

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const strip = { id: 'strip', par: 2, surface: 'clay', tee: [100, 300], cup: [400, 300], floor: [{ pts: rect(50, 250, 500, 100) }] };

function settle(p) {
  for (let i = 0; i < 5000 && p.status !== 'ready' && p.status !== 'holed'; i++) Play.stepPlay(p);
}

test('a good putt sinks and the hole ends after the drop animation', () => {
  const p = Play.createPlay(strip);
  assert.ok(Play.putt(p, 0, 0.38));
  assert.equal(p.strokes, 1);
  assert.equal(Play.putt(p, 0, 0.5), false, 'cannot putt while rolling');
  settle(p);
  assert.equal(p.status, 'holed');
  assert.equal(p.pickedUp, false);
  assert.ok(p.events.some((e) => e.type === 'sunk'));
});

test('falling off costs a stroke and returns the ball to where it was hit', () => {
  const p = Play.createPlay(strip);
  Play.putt(p, Math.PI / 2, 0.5); // straight off the side
  settle(p);
  assert.equal(p.status, 'ready');
  assert.equal(p.strokes, 2);
  assert.equal(p.penalties, 1);
  assert.deepEqual([p.sim.x, p.sim.y], [100, 300]);
});

test('a ball that stops becomes the new spot for the next stroke', () => {
  const p = Play.createPlay(strip);
  Play.putt(p, 0, 0.12);
  settle(p);
  assert.equal(p.status, 'ready');
  assert.ok(p.sim.x > 120 && p.sim.x < 390);
  const x = p.sim.x;
  Play.putt(p, Math.PI / 2, 0.5);
  settle(p);
  assert.equal(p.sim.x, x, 'reset to the last spot, not the tee');
});

test('the hole is picked up at the stroke cap', () => {
  const p = Play.createPlay(strip);
  assert.equal(p.maxStrokes, strip.par + 5);
  while (p.status !== 'holed') {
    Play.putt(p, Math.PI, 0.05); // dribble backwards, never reaching the cup
    settle(p);
  }
  assert.equal(p.pickedUp, true);
  assert.equal(p.strokes, p.maxStrokes);
});

test('balls resting on a drifting platform ride along and reset onto it', () => {
  const def = {
    id: 'raft', par: 3, surface: 'stardust', tee: [120, 300], cup: [900, 300],
    floor: [{ pts: rect(60, 250, 200, 100) }, { pts: rect(100, 250, 100, 100), move: { dx: 0, dy: 200, period: 4 } }, { pts: rect(700, 200, 250, 200) }],
  };
  const p = Play.createPlay(def);
  p.sim.x = 150;
  for (let i = 0; i < 120; i++) Play.stepPlay(p);
  assert.ok(p.sim.y > 300, 'carried downward');
  assert.equal(p.status, 'ready');
  const spot = { x: p.sim.x, y: p.sim.y };
  Play.putt(p, Math.PI / 2, 1); // off the platform into space
  settle(p);
  assert.equal(p.strokes, 2);
  assert.ok(P.platformAt(p.H, p.sim.x, p.sim.y, p.sim.t) >= 0, 'back on the platform');
  assert.ok(Math.abs(p.sim.x - spot.x) < 1e-6);
});
