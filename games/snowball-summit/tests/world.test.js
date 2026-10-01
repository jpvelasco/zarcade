import test from 'node:test';
import assert from 'node:assert/strict';
import { World, STEP, physicsFor, CHASE_GAP } from '../src/world.js';
import { interaction, formatSize } from '../src/items.js';

const level = (segments, o = {}) => ({ u: 20, start: 20, dx: 4, grow: 0.001, seed: 3, segments, goals: { size: 30, items: 1, time: 60 }, ...o });
const run = (w, secs, controls = {}) => { for (let i = 0; i < secs / STEP && w.status === 'play'; i++) { w.step(STEP, typeof controls === 'function' ? controls(w) : controls); } return w; };

test('things are grabbed, bumped or scenery by size', () => {
  assert.equal(interaction(10, 20), 'pick');
  assert.equal(interaction(20, 20), 'bump');
  assert.equal(interaction(40, 20), 'scenery');
  assert.equal(formatSize(42.7), '42 cm');
  assert.equal(formatSize(250), '2.50 m');
});

test('the ball rolls downhill by itself and grows on fresh snow', () => {
  const w = new World(level([{ t: 'slope', len: 6000, grade: 0.25, items: [] }]));
  run(w, 4);
  assert.ok(w.ball.vx > physicsFor(20).vnat * 0.8, 'reaches its natural speed');
  assert.ok(w.ball.D > 20.3, 'grew from snow');
});

test('speeding up beats rolling, braking slows the ball down', () => {
  const lv = level([{ t: 'slope', len: 9000, grade: 0.25, items: [] }]);
  const idle = run(new World(lv), 4), fast = run(new World(lv), 4, { push: 1 }), slow = run(new World(lv), 4, { brake: 1 });
  assert.ok(fast.ball.x > idle.ball.x * 1.15);
  assert.ok(slow.ball.x < idle.ball.x * 0.6);
});

test('jumping leaves the ground and lands again', () => {
  const w = new World(level([{ t: 'slope', len: 6000, grade: 0.1, items: [] }]));
  run(w, 1);
  w.step(STEP, { jump: true });
  run(w, 0.15);
  assert.equal(w.ball.grounded, false);
  assert.ok(w.terrain.groundY(w.ball.x) - (w.ball.y + w.ball.r) > 5);
  run(w, 1.5);
  assert.equal(w.ball.grounded, true);
  assert.equal(w.jumps, 1);
});

test('small things stick and grow the ball, big things bump and chip snow', () => {
  const w = new World(level([{ t: 'slope', len: 3000, grade: 0.2, items: [['pinecone', 4]] }, { t: 'slope', len: 3000, grade: 0.2, items: [['snowman', 1]] }], { grow: 0 }));
  run(w, 30);
  assert.equal(w.collected, 4);
  assert.equal(w.byType.pinecone, 4);
  assert.equal(w.stuck.length, 4);
  const big = new World(level([{ t: 'slope', len: 3000, grade: 0.2, items: [['bunny', 1]] }], { grow: 0 }));
  const D0 = big.ball.D;
  run(big, 20);
  assert.equal(big.bumps, 1, 'a bunny is too big for a 20 cm ball');
  assert.ok(big.ball.D < D0, 'bumping chips snow off');
  assert.ok(big.ball.D >= D0 * 0.85, 'but never below the floor');
  assert.equal(big.terrain.items[0].state === 'tumble' || big.terrain.items[0].state === 'gone', true, 'the thing tumbles out of the way');
});

test('a size gate blocks a small ball at most three times, then lets it through', () => {
  const w = new World(level([{ t: 'slope', len: 1500, grade: 0.25, items: [] }, { t: 'gate', len: 300, min: 60, grade: 0.05 }, { t: 'slope', len: 1500, grade: 0.25 }, { t: 'finish', len: 1000 }], { grow: 0 }));
  run(w, 40);
  assert.equal(w.status, 'finished');
  assert.ok(w.gateBlocks >= 1 && w.gateBlocks <= 3);
  assert.equal(w.terrain.gates[0].smashed, true);
  assert.ok(w.ball.D >= 60);
});

test('a big enough ball smashes the gate without stopping', () => {
  const w = new World(level([{ t: 'slope', len: 1500, grade: 0.25, items: [] }, { t: 'gate', len: 300, min: 15, grade: 0.05 }, { t: 'slope', len: 2000, grade: 0.25 }]));
  run(w, 20);
  assert.equal(w.gateBlocks, 0);
  assert.equal(w.gatesSmashed, 1);
});

test('a wooden bridge holds a light ball and breaks under a heavy one, which climbs out', () => {
  const segs = [{ t: 'slope', len: 1200, grade: 0.25, items: [] }, { t: 'bridge', len: 800, max: 30, depth: 160, grade: 0.04, items: [] }, { t: 'slope', len: 1500, grade: 0.25 }, { t: 'finish', len: 1000 }];
  const light = run(new World(level(segs, { grow: 0 })), 40);
  assert.equal(light.status, 'finished');
  assert.equal(light.bridgesCrossed, 1);
  assert.equal(light.terrain.bridges[0].broken, false);
  const heavy = run(new World(level(segs, { grow: 0, start: 40 })), 60);
  assert.equal(heavy.terrain.bridges[0].broken, true);
  assert.equal(heavy.status, 'finished', 'the gully is never a dead end');
});

test('the Snow Cloud catches a ball that stops, and stays close behind a fast one', () => {
  const lv = level([{ t: 'slope', len: 40000, grade: 0.25, items: [] }], { avalanche: { factor: 1.1, delay: 0.5 } });
  const stopped = run(new World(lv), 30, { brake: 1 });
  assert.equal(stopped.status, 'caught');
  const fast = run(new World(lv), 20, { push: 1 });
  assert.equal(fast.status, 'play');
  assert.ok(fast.avalanche.gap <= CHASE_GAP + 0.01 && fast.avalanche.gap > 3, `gap ${fast.avalanche.gap}`);
});

test('the same controls always give the same run', () => {
  const lv = level([{ t: 'slope', len: 4000, grade: 0.25, items: [['pinecone', 6], ['penguin', 1]] }, { t: 'rise', len: 600, h: 40 }, { t: 'finish', len: 800 }]);
  const script = (w) => ({ push: Math.sin(w.time * 2) > 0 ? 1 : 0, jump: Math.floor(w.time * 120) % 240 === 0 });
  const a = run(new World(lv), 20, script), b = run(new World(lv), 20, script);
  assert.deepEqual([a.ball.x, a.ball.y, a.ball.D, a.collected, a.time], [b.ball.x, b.ball.y, b.ball.D, b.collected, b.time]);
});

test('stars are awarded for size, things and time once finished', () => {
  const w = run(new World(level([{ t: 'slope', len: 2000, grade: 0.25, items: [['pinecone', 3]] }, { t: 'finish', len: 800 }], { goals: { size: 21, items: 3, time: 1 } })), 30);
  assert.equal(w.status, 'finished');
  assert.deepEqual(w.starChecks(), [true, true, false]);
  assert.equal(w.stars(), 2);
});
