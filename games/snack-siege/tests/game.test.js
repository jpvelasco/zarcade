import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, starsFor, pullToVelocity, trajectory } from '../src/game.js';
import { LEVELS, Builder, starThresholds } from '../src/levels.js';
import { aimAt } from '../src/ai.js';
import { BEAN_BONUS, MAX_PULL, MAX_SPEED, SLING, TICK } from '../src/config.js';

function tinyLevel(build, beans = ['cherry', 'cherry', 'cherry']) {
  const b = new Builder();
  build(b);
  return {
    id: 't', name: 'Test', world: 0, index: 0, beans, width: 34, height: 8, tip: null,
    ground: [[-30, 64]], pits: [], terrain: b.terrain, pieces: b.pieces, bears: b.bears,
    stars: starThresholds(b.pieces, b.bears, beans.length),
  };
}

function runTurn(g, { powerAt = -1, max = 1200 } = {}) {
  for (let t = 0; t < max && g.state === 'flying'; t++) {
    if (t === powerAt) g.usePower();
    g.update();
  }
}

test('a level starts aiming with its beans queued and its fort asleep', () => {
  const g = new Game(LEVELS[0]);
  assert.equal(g.state, 'aim');
  assert.deepEqual(g.queue, LEVELS[0].beans);
  assert.equal(g.bearsLeft, LEVELS[0].bears.length);
  assert.equal(g.phys.awakeCount(), 0);
});

test('pulling back launches the opposite way, capped at full pull', () => {
  const v = pullToVelocity(-MAX_PULL, -MAX_PULL * 0.2, MAX_PULL);
  assert.ok(v.vx > 0 && v.vy > 0);
  assert.ok(Math.abs(Math.hypot(v.vx, v.vy) - MAX_SPEED) < 1e-9);
  const half = pullToVelocity(-MAX_PULL / 2, 0, MAX_PULL);
  assert.ok(Math.abs(half.vx - MAX_SPEED / 2) < 1e-9);
});

test('the trajectory preview matches the real flight', () => {
  const lv = tinyLevel((b) => b.bear(40, 0, 's'));
  const g = new Game(lv);
  const v = { vx: 14, vy: 9 };
  const pts = trajectory(v.vx, v.vy, { steps: 20, dt: 0.05 });
  g.launch(v.vx, v.vy);
  const bean = g.phys.byId(g.active[0]);
  for (let i = 0; i < 30; i++) g.update(); // 0.5 s
  const [px, py] = pts[9];
  assert.ok(Math.hypot(bean.x - px, bean.y - py) < 0.08, `bean ${bean.x},${bean.y} vs preview ${px},${py}`);
});

test('aimAt hits its target point', () => {
  const v = aimAt(24, 2, 22, false);
  const pts = trajectory(v.vx, v.vy, { steps: 400, dt: 0.005 });
  const near = Math.min(...pts.map(([x, y]) => Math.hypot(x - 24, y - 2)));
  assert.ok(near < 0.1);
  assert.equal(aimAt(200, 2, 5), null, 'out of range');
});

test('a direct hit pops a bear, scores, and wins with a spare-bean bonus', () => {
  const lv = tinyLevel((b) => b.bear(20, 0, 's'));
  const g = new Game(lv);
  const v = aimAt(20, 0.5, 20, false);
  g.launch(v.vx, v.vy);
  runTurn(g);
  assert.equal(g.bearsLeft, 0);
  assert.equal(g.state, 'won');
  assert.equal(g.bonus, 2 * BEAN_BONUS);
  assert.ok(g.events.some((e) => e.type === 'pop'));
  assert.ok(g.stars >= 1);
});

test('missing every shot loses', () => {
  const lv = tinyLevel((b) => b.bear(30, 0, 's'), ['cherry']);
  const g = new Game(lv);
  g.launch(-5, 3);
  runTurn(g);
  assert.equal(g.state, 'lost');
  assert.equal(g.stars, 0);
});

test('turns advance to the next bean', () => {
  const lv = tinyLevel((b) => b.bear(30, 0, 's'), ['cherry', 'blue']);
  const g = new Game(lv);
  g.launch(4, 4);
  runTurn(g);
  assert.equal(g.state, 'aim');
  assert.equal(g.bean, 'blue');
  assert.equal(g.launch(1, 1), true);
});

test('stars come from score targets', () => {
  assert.equal(starsFor(100, [500, 900]), 1);
  assert.equal(starsFor(500, [500, 900]), 2);
  assert.equal(starsFor(1000, [500, 900]), 3);
  for (const lv of LEVELS) assert.ok(lv.stars[0] > 0);
});

test('blueberry splits into three in flight', () => {
  const lv = tinyLevel((b) => b.bear(30, 0, 's'), ['blue', 'cherry', 'cherry']);
  const g = new Game(lv);
  g.launch(15, 10);
  for (let i = 0; i < 20; i++) g.update();
  assert.equal(g.usePower(), true);
  assert.equal(g.active.length, 3);
  assert.equal(g.usePower(), false, 'one power per bean');
});

test('grape turns heavy and dives', () => {
  const lv = tinyLevel((b) => b.bear(30, 0, 's'), ['grape', 'cherry', 'cherry']);
  const g = new Game(lv);
  g.launch(15, 10);
  for (let i = 0; i < 20; i++) g.update();
  const bean = g.phys.byId(g.active[0]);
  const m0 = bean.m;
  g.usePower();
  assert.ok(bean.m > m0 * 4);
  assert.ok(bean.vy < -20);
});

test('mint boosts and lime hops', () => {
  const lv = tinyLevel((b) => b.bear(30, 0, 's'), ['mint', 'lime', 'cherry']);
  const g = new Game(lv);
  g.launch(12, 8);
  for (let i = 0; i < 10; i++) g.update();
  g.usePower();
  const m = g.phys.byId(g.active[0]);
  assert.ok(Math.hypot(m.vx, m.vy) > 30);
  runTurn(g);
  g.launch(12, 8);
  for (let i = 0; i < 30; i++) g.update();
  const l = g.phys.byId(g.active[0]);
  g.usePower();
  assert.ok(l.vy > 10);
});

test('honey sticks to a block, then bursts and breaks things', () => {
  const lv = tinyLevel((b) => {
    b.frame(20, 0, 2.8, 2, 'glass', 'cookie');
    b.bear(20, 0, 's');
  }, ['honey', 'cherry', 'cherry']);
  const g = new Game(lv);
  const v = aimAt(18.8, 1.2, 20, false);
  g.launch(v.vx, v.vy);
  let stuck = false;
  let burst = false;
  for (let t = 0; t < 600 && g.state === 'flying'; t++) {
    g.update();
    if (g.honey) stuck = true;
    if (g.events.some((e) => e.type === 'burst')) burst = true;
  }
  assert.ok(stuck, 'stuck');
  assert.ok(burst, 'burst');
  assert.ok(g.broken > 0);
});

test('fizz crates explode and chain', () => {
  const lv = tinyLevel((b) => {
    b.crate(20, 0); b.crate(21.6, 0); b.crate(23.2, 0);
    b.bear(25, 0, 's');
  });
  const g = new Game(lv);
  const v = aimAt(20, 0.5, 20, false);
  g.launch(v.vx, v.vy);
  runTurn(g);
  const booms = g.events.filter((e) => e.type === 'explode').length;
  assert.ok(booms >= 3, `${booms} explosions`);
  assert.equal(g.bearsLeft, 0);
});

test('bears that fall into a pit pop', () => {
  const b = new Builder();
  b.pit(20, 26);
  b.ledge(14, 20, 2);
  b.bear(19.4, 2, 's');
  const lv = {
    id: 't', name: 'Pit', world: 1, index: 0, beans: ['cherry', 'cherry', 'cherry'], width: 34, height: 8,
    ground: [[-30, 20], [26, 64]], pits: b.pits, terrain: b.terrain, pieces: [], bears: b.bears, stars: [6000, 9000],
  };
  const g = new Game(lv);
  const bear = g.bodies.find((x) => x.data && x.data.kind === 'bear');
  bear.sleeping = false;
  bear.vx = 3;
  for (let i = 0; i < 240; i++) g.update();
  assert.equal(g.bearsLeft, 0);
  assert.ok(g.events.some((e) => e.type === 'fell'));
});

test('quick breaks build a combo', () => {
  const lv = tinyLevel((b) => {
    b.tower(20, 0, 3, { mat: 'glass', fill: (i, y) => b.bear(20, y, 's') });
  });
  const g = new Game(lv);
  const v = aimAt(19, 3, 22, false);
  g.launch(v.vx, v.vy);
  runTurn(g);
  assert.ok(g.maxCombo >= 3, `combo ${g.maxCombo}`);
});

test('the same shots give the same result (determinism)', () => {
  const play = () => {
    const g = new Game(LEVELS[10]);
    g.launch(18, 9);
    for (let t = 0; t < 600; t++) { if (t === 40) g.usePower(); g.update(); }
    return [g.score, g.bearsLeft, g.broken, ...g.bodies.map((b) => b.x.toFixed(9))].join('|');
  };
  assert.equal(play(), play());
});

test('a clone plays out exactly like the original', () => {
  const g = new Game(LEVELS[11]);
  g.launch(19, 8);
  for (let t = 0; t < 30; t++) g.update();
  const c = g.clone();
  for (let t = 0; t < 400; t++) { g.update(); c.update(); }
  assert.equal(g.score, c.score);
  assert.deepEqual(g.bodies.map((b) => [b.x, b.y]), c.bodies.map((b) => [b.x, b.y]));
  assert.notEqual(g.phys.bodies[0], c.phys.bodies[0]);
});

test('beans stop flying after the turn ends', () => {
  const g = new Game(LEVELS[0]);
  g.launch(20, 6);
  let ticks = 0;
  while (g.state === 'flying' && ticks < 2000) { g.update(); ticks++; }
  assert.ok(ticks * TICK < 12, 'turn ends in time');
  assert.ok(SLING.x < 5);
});
