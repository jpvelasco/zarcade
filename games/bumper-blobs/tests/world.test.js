import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Bot } from '../src/ai.js';
import { STEP, BLOB, ROUND } from '../src/config.js';
import { run, playWorld, place, types } from './helpers.js';

test('the round opens with a 3-2-1 countdown and blobs stay put until go', () => {
  const w = new World({ arena: 'conveyor', mode: 'lbs', players: [{}, {}], seed: 3 });
  assert.equal(w.phase, 'countdown');
  const start = w.blobs.map((b) => [b.x, b.y]);
  for (let s = 0; s < (ROUND.countdown + 0.1) / STEP; s++) {
    w.step(STEP, [{ mx: 1, my: 0 }, { mx: -1, my: 0, dash: true }]);
    if (w.phase === 'countdown') assert.deepEqual(w.blobs.map((b) => [b.x, b.y]), start);
  }
  const seen = w.events.filter((e) => e.type === 'countdown' || e.type === 'go').map((e) => e.n ?? 'go');
  assert.deepEqual(seen, [3, 2, 1, 'go']);
  assert.equal(w.phase, 'play');
});

test('a blob pushed past the edge falls, then is out (ring-out)', () => {
  const w = playWorld({ players: [{}, {}, {}] });
  const [a] = w.blobs;
  place(a, 320, 0);
  a.vx = 400;
  run(w, 0.2);
  assert.ok(a.falling, 'falling');
  assert.ok(types(w).includes('fall'));
  run(w, BLOB.fallTime);
  assert.ok(a.out && a.eliminated);
  assert.deepEqual(w.outOrder, [0]);
});

test('ring-outs credit whoever bumped you last', () => {
  const w = playWorld();
  const [a, b] = w.blobs;
  place(a, 200, 0); place(b, 262, 0);
  a.vx = 700; a.dashT = 0.2; a.dashPower = 1;
  run(w, 1.5);
  assert.ok(b.falling || b.out);
  const fall = w.events.find((e) => e.type === 'fall');
  assert.equal(fall.by, 0);
  assert.equal(fall.cause, 'dash');
  assert.equal(a.stats.ringouts, 1);
  assert.ok(types(w).includes('bonk'));
});

test('hold to charge, let go to dash: a full charge is faster', () => {
  const speeds = [];
  for (const hold of [0.05, BLOB.chargeTime + 0.1]) {
    const w = playWorld();
    const [a, b] = w.blobs;
    place(a, 0, 0); place(b, 0, 250);
    run(w, hold, [{ mx: 1, my: 0, dash: true }]);
    assert.ok(a.charging);
    w.step(STEP, [{ mx: 1, my: 0, dash: false }]);
    assert.ok(a.dashT > 0);
    speeds.push(a.vx);
  }
  assert.ok(speeds[1] > speeds[0] + 300, speeds.join(' '));
});

test('letting go of a charge with no direction ground-pounds and shoves neighbours', () => {
  const w = playWorld();
  const [a, b] = w.blobs;
  place(a, 0, 0); place(b, 90, 0);
  run(w, 0.2, [{ dash: true }]);
  w.step(STEP, [{ dash: false }]);
  assert.equal(a.pound, 1);
  run(w, 1);
  const pound = w.events.find((e) => e.type === 'pound');
  assert.ok(pound && pound.hits === 1);
  assert.ok(b.x > 150, `shoved to ${b.x}`);
  assert.equal(a.stats.pounds, 1);
});

test('letting go of the stick just before the button still dashes that way', () => {
  const w = playWorld();
  const [a, b] = w.blobs;
  place(a, 0, 0); place(b, 0, 250);
  run(w, 0.4, [{ mx: 0, my: -1, dash: true }]);
  run(w, 0.05, [{ dash: true }]);
  w.step(STEP, [{ dash: false }]);
  assert.ok(a.dashT > 0 && a.vy < -300, `vy ${a.vy}`);
  assert.equal(a.pound, 0);
});

test('a bubble shield takes one hit and pops', () => {
  const w = playWorld();
  const [a, b] = w.blobs;
  place(a, -100, 0); place(b, -38, 0);
  b.shield = 5;
  a.vx = 800; a.dashT = 0.2; a.dashPower = 1;
  w.step(STEP, []);
  assert.equal(b.shield, 0);
  assert.ok(Math.abs(b.vx) < 1, 'shielded blob did not move');
  assert.ok(a.vx < 0, 'hitter bounced back');
  assert.ok(types(w).includes('shieldPop'));
});

test('giant blobs grow heavier and bigger, then shrink back', () => {
  const w = playWorld();
  const [a] = w.blobs;
  w.grant(a, 'giant');
  run(w, 1);
  assert.ok(a.radius > BLOB.radius * 1.3 && a.mass > 2);
  run(w, 9);
  assert.ok(Math.abs(a.radius - BLOB.radius) < 1);
});

test('power-ups spawn on the floor and are picked up by touching them', () => {
  const w = playWorld({ powerups: true });
  run(w, 12);
  assert.ok(w.events.some((e) => e.type === 'powerSpawn'));
  const p = w.powerups[0] || (() => { w.powerups.push({ kind: 'magnet', x: 0, y: 0, t: 0, life: 12 }); return w.powerups[0]; })();
  place(w.blobs[0], p.x, p.y);
  w.events.length = 0;
  w.step(STEP, []);
  assert.ok(types(w).includes('powerup'));
});

test('hard hits freeze the action briefly (hitstop)', () => {
  const w = playWorld();
  const [a, b] = w.blobs;
  place(a, -100, 0); place(b, -40, 0);
  a.vx = 900; a.dashT = 0.2; a.dashPower = 1;
  w.step(STEP, []);
  assert.ok(w.hitstop > 0);
  const x = b.x;
  w.step(STEP, []);
  assert.equal(b.x, x, 'frozen during hitstop');
});

test('sudden death always ends a stalemate', () => {
  const w = playWorld({ players: [{}, {}] });
  place(w.blobs[0], -150, 0); place(w.blobs[1], 150, 0);
  run(w, ROUND.lbsTime + ROUND.suddenTime + 3);
  assert.equal(w.phase, 'done');
  assert.ok(w.events.some((e) => e.type === 'sudden'));
});

test('the same seed and inputs replay the same round', () => {
  const play = () => {
    const players = [{ bot: 'hard' }, { bot: 'normal' }, { bot: 'easy' }, { bot: 'normal' }];
    const w = new World({ arena: 'bumpers', mode: 'lbs', players, seed: 99 });
    const bots = players.map((p, i) => new Bot(i, p.bot, 7 + i));
    const c = [];
    for (let s = 0; s < 20 / STEP && w.phase !== 'done'; s++) {
      for (let i = 0; i < 4; i++) c[i] = bots[i].controls(w, STEP);
      w.step(STEP, c);
      w.events.length = 0;
    }
    return JSON.stringify(w.blobs.map((b) => [b.x, b.y, b.out, b.stats])) + w.t;
  };
  assert.equal(play(), play());
});
