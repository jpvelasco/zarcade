import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { PLAYER, STEP, HIT, speedAt } from '../src/config.js';
import { Autopilot } from '../src/ai.js';

// A world with an empty track so tests can place exactly what they need.
function emptyWorld(opts = {}) {
  const w = new World({ seed: 5, ...opts });
  w.track.items.length = 0;
  w.track.coins.length = 0;
  w.track.powers.length = 0;
  w.track.fill = () => {};
  return w;
}
const run = (w, seconds, controls = () => ({})) => {
  for (let t = 0; t < seconds; t += STEP) w.step(STEP, controls(w));
};
const place = (w, kind, lane, ahead, len) => {
  const it = { id: 999 + w.track.items.length, kind, lane, z: w.d + ahead, len: len ?? { log: 0.7, ptero: 1, geyser: 1.4, boulder: 1.6 }[kind], gone: false };
  w.track.items.push(it);
  return it;
};
const types = (w) => w.events.map((e) => e.type);

test('speed starts gentle, ramps up and stays capped', () => {
  assert.equal(speedAt(0), 10);
  assert.ok(speedAt(1000) > 14 && speedAt(1000) < 17);
  assert.ok(speedAt(3000) < 22);
  assert.ok(speedAt(100000) <= 24);
  for (let d = 0; d < 10000; d += 100) assert.ok(speedAt(d + 100) >= speedAt(d));
});

test('lane changes ease across and stop at the edges', () => {
  const w = emptyWorld();
  w.step(STEP, { left: true });
  run(w, PLAYER.laneTime + 0.02);
  assert.equal(w.p.x, -1);
  w.events.length = 0;
  w.step(STEP, { left: true });
  assert.equal(w.p.lane, -1);
  assert.ok(types(w).includes('edge'));
});

test('a jump reaches about 1.7 m and lands in about 0.6 s', () => {
  const w = emptyWorld();
  w.step(STEP, { jump: true });
  let top = 0;
  let t = STEP;
  while (w.p.air) {
    w.step(STEP);
    top = Math.max(top, w.p.y);
    t += STEP;
  }
  assert.ok(Math.abs(top - PLAYER.jumpApex) < 0.05, `apex ${top}`);
  assert.ok(Math.abs(t - PLAYER.jumpTime) < 0.03, `airtime ${t}`);
});

test('jumping clears a log, standing bumps it', () => {
  const w = emptyWorld();
  place(w, 'log', 0, 2.5);
  w.step(STEP, { jump: true });
  run(w, 1);
  assert.equal(w.stats.hits, 0);
  assert.equal(w.stats.logs, 1);

  const w2 = emptyWorld();
  place(w2, 'log', 0, 3);
  run(w2, 1);
  assert.equal(w2.stats.hits, 1);
  assert.ok(w2.lavvy > 0, 'Lavvy comes running after a bump');
});

test('rolling ducks under a pterodactyl', () => {
  const w = emptyWorld();
  place(w, 'ptero', 0, 2.5);
  w.step(STEP, { roll: true });
  run(w, 1);
  assert.equal(w.stats.hits, 0);
  assert.equal(w.stats.pteros, 1);
});

test('a press just before landing is remembered', () => {
  const w = emptyWorld();
  w.step(STEP, { jump: true });
  run(w, PLAYER.jumpTime - 0.1);
  assert.ok(w.p.air);
  w.step(STEP, { jump: true });
  run(w, 0.12);
  assert.ok(w.p.air && w.p.vy > 0, 'the buffered jump fired on landing');
});

test('rolling in the air slams down fast', () => {
  const w = emptyWorld();
  w.step(STEP, { jump: true });
  run(w, 0.2);
  w.step(STEP, { roll: true });
  run(w, 0.15);
  assert.equal(w.p.air, false);
  assert.ok(w.rolling);
});

test('two bumps close together and Lavvy catches you; far apart is fine', () => {
  const w = emptyWorld();
  place(w, 'boulder', 0, 2);
  place(w, 'boulder', 0, 2 + 10 * 3);
  run(w, 5);
  assert.equal(w.status, 'caught');
  assert.ok(types(w).includes('caught'));

  const w2 = emptyWorld();
  place(w2, 'boulder', 0, 2);
  run(w2, HIT.lavvyWindow + 0.5);
  assert.equal(w2.lavvy, 0);
  place(w2, 'boulder', 0, 3);
  run(w2, 1);
  assert.equal(w2.status, 'running');
  assert.equal(w2.stats.hits, 2);
});

test('the egg shield absorbs a bump with no stumble', () => {
  const w = emptyWorld();
  w.grab('shield');
  place(w, 'geyser', 0, 3);
  run(w, 1);
  assert.equal(w.stats.hits, 0);
  assert.equal(w.stats.shieldSaves, 1);
  assert.equal(w.lavvy, 0);
  assert.equal(w.power.shield, 0);
});

test('changing lanes into a hedge bounces you back', () => {
  const w = emptyWorld();
  place(w, 'hedge', 1, -5, 30);
  w.step(STEP, { right: true });
  run(w, 0.5);
  assert.equal(w.p.lane, 0);
  assert.equal(w.stats.hits, 1);
});

test('amber is collected in your lane at your height', () => {
  const w = emptyWorld();
  w.track.coins.push({ id: 1, lane: 0, z: w.d + 3, y: 0.6, taken: false });
  w.track.coins.push({ id: 2, lane: 1, z: w.d + 3, y: 0.6, taken: false });
  w.track.coins.push({ id: 3, lane: 0, z: w.d + 5, y: 4.7, taken: false });
  run(w, 1);
  assert.equal(w.stats.coins, 1);
});

test('the magnet pulls amber from other lanes', () => {
  const w = emptyWorld();
  w.grab('magnet');
  for (let i = 0; i < 5; i++) w.track.coins.push({ id: i, lane: i % 2 ? 1 : -1, z: w.d + 5 + i * 2, y: 0.6, taken: false });
  run(w, 2);
  assert.equal(w.stats.coins, 5);
  assert.equal(w.stats.magnetCoins, 5);
});

test('glide floats over everything, lays a sky trail, then lands on a clear path', () => {
  const w = emptyWorld();
  w.grab('glide');
  assert.ok(w.track.coins.length > 10, 'sky amber laid out');
  for (let z = 10; z < 120; z += 8) place(w, 'boulder', [-1, 0, 1][z % 3], z);
  const pilot = new Autopilot();
  run(w, w.duration('glide') + 1.5, (world) => pilot.controls(world, STEP));
  assert.equal(w.stats.hits, 0);
  assert.ok(w.stats.coins > 10);
  assert.equal(w.p.y, 0);
  assert.ok(w.stats.glide > 50);
});

test('boost levels lengthen power-ups', () => {
  const a = emptyWorld();
  const b = emptyWorld({ boosts: { magnet: 5, glide: 5, shield: 5 } });
  for (const k of ['magnet', 'glide', 'shield']) assert.ok(b.duration(k) > a.duration(k));
});

test('score grows with distance times the multiplier, and passing your best is announced', () => {
  const w = emptyWorld({ multiplier: 3, best: 20 });
  run(w, 3);
  assert.ok(Math.abs(w.score - w.stats.distance * 3) < 0.01);
  assert.ok(types(w).includes('best'));
});
