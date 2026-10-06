import test from 'node:test';
import assert from 'node:assert/strict';
import { World, linePoints } from '../src/world.js';
import { FIELD, SHARD, MINE, SHIELD, LIVES, STEP, COMBO } from '../src/config.js';
import { segmentHitsCircle, nearestOnSegment } from '../src/math.js';

// A world with no live objects, ready for hand-placed shards.
function emptyWorld(seed = 1) {
  const w = new World({ seed });
  w.status = 'play'; // skip the ready countdown
  w.spawnTimer = 1e9; // no surprise spawns mid-test
  return w;
}

function placeShard(w, x, y, { mine = false, shielded = false, vx = 0, vy = 0 } = {}) {
  const sh = {
    x, y, vx, vy,
    r: mine ? MINE.r : SHARD.r,
    mine, shielded,
    rot: 0, spin: 1,
    color: mine ? -1 : 0,
  };
  w.shards.push(sh);
  return sh;
}

test('segmentHitsCircle catches fast swipes that would tunnel point checks', () => {
  // A swipe that jumps 200 px in one frame still hits a 26 px shard.
  assert.equal(segmentHitsCircle(0, 300, 200, 300, 100, 300, SHARD.r), true);
  // A swipe just above the shard misses.
  assert.equal(segmentHitsCircle(0, 300, 200, 300, 100, 300 - SHARD.r - 5, SHARD.r), false);
});

test('nearestOnSegment clamps to the segment ends', () => {
  assert.deepEqual(nearestOnSegment(0, 0, 10, 0, -5, 5), { x: 0, y: 0, t: 0 });
  assert.deepEqual(nearestOnSegment(0, 0, 10, 0, 15, 5), { x: 10, y: 0, t: 1 });
});

test('a slice through a crystal scores, builds the combo and emits a shard event', () => {
  const w = emptyWorld();
  const sh = placeShard(w, 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.shards.length, 0);
  assert.equal(w.combo, 1);
  assert.equal(w.maxCombo, 1);
  assert.equal(w.stats.sliced, 1);
  assert.ok(w.score > 0);
  const ev = w.events.find((e) => e.type === 'shard');
  assert.ok(ev && ev.combo === 1 && ev.x === sh.x && ev.y === sh.y);
});

test('combo bonus grows with the chain and the max combo is tracked', () => {
  const w = emptyWorld();
  placeShard(w, 200, 300);
  placeShard(w, 400, 300);
  const before = w.score;
  w.sweep(linePoints(100, 300, 500, 300));
  assert.equal(w.combo, 2);
  assert.equal(w.maxCombo, 2);
  // shard 1: 10 + 1*2, shard 2: 10 + 2*2
  assert.equal(w.score - before, 12 + 14);
});

test('mines cost a life, clear the combo and emit a mine event', () => {
  const w = emptyWorld();
  placeShard(w, 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.combo, 1);
  const mine = placeShard(w, 300, 300, { mine: true });
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.lives, LIVES - 1);
  assert.equal(w.combo, 0);
  assert.equal(w.comboTimer, 0);
  assert.ok(w.events.some((e) => e.type === 'mine' && e.lives === LIVES - 1));
  assert.ok(!w.shards.includes(mine));
});

test('three mines end the run with a gameover event carrying the score', () => {
  const w = emptyWorld();
  w.score = 50;
  for (let i = 0; i < 3; i++) {
    w.shards.length = 0;
    placeShard(w, 300, 300, { mine: true });
    w.sweep(linePoints(300, 200, 300, 400));
  }
  assert.equal(w.lives, 0);
  assert.equal(w.status, 'over');
  const ev = w.events.find((e) => e.type === 'gameover');
  assert.ok(ev && ev.score === 50);
});

test('a shielded crystal takes one slice for the shell and a second for the shard', () => {
  const w = emptyWorld();
  placeShard(w, 300, 300, { shielded: true });
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.shards.length, 1);
  assert.equal(w.shards[0].shielded, false);
  assert.ok(w.events.some((e) => e.type === 'shell'));
  assert.equal(w.stats.sliced, 0);
  // Let the first swipe's blade ribbon expire, then swipe again (a new gesture).
  for (let i = 0; i < 24; i++) w.step(STEP, null);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.shards.length, 0);
  assert.equal(w.stats.sliced, 1);
});

test('one long swipe cannot crack a shell and cut the gem in the same pass', () => {
  const w = emptyWorld();
  placeShard(w, 300, 300, { shielded: true });
  // A single fast swipe straight through the crystal: the shell soaks it up.
  w.sweep(linePoints(300, 100, 300, 500, 16));
  assert.equal(w.shards.length, 1);
  assert.equal(w.shards[0].shielded, false);
  assert.equal(w.stats.sliced, 0, 'the gem survives the swipe that cracked its shell');
});

test('shielded crystals are hittable through the shell ring, not just the gem', () => {
  const w = emptyWorld();
  placeShard(w, 300, 300, { shielded: true });
  // A swipe 30 px above the centre is inside the shell (42) but outside the gem (26).
  w.sweep(linePoints(100, 270, 500, 270));
  assert.equal(w.shards.length, 1);
  assert.equal(w.shards[0].shielded, false);
});

test('slow-mo triggers on a multi-swipe and dilates time', () => {
  const w = emptyWorld();
  for (let i = 0; i < 3; i++) placeShard(w, 200 + i * 80, 300);
  w.step(STEP, { points: linePoints(100, 300, 500, 300) });
  assert.ok(w.slowTimer > 0);
  assert.equal(w.stats.sliced, 3);
  assert.ok(w.events.some((e) => e.type === 'slowStart'), 'a swipe start emits slowStart');
  // With slow-mo active, the next step advances game time by the scaled dt.
  const t = w.time;
  w.step(STEP, null);
  assert.ok(Math.abs(w.time - t - STEP * COMBO.slowScale) < 1e-9);
});

test('the combo decays after the window, and a missed crystal resets it', () => {
  const w = emptyWorld();
  placeShard(w, 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.combo, 1);
  // Let the combo window (1.4 s) pass.
  for (let i = 0; i < 170; i++) w.step(STEP, null);
  assert.equal(w.combo, 0);
});

test('crystals that fall off the bottom are dropped and break the combo', () => {
  const w = emptyWorld();
  placeShard(w, 300, 300);
  w.sweep(linePoints(300, 200, 300, 400)); // combo 1
  const falling = placeShard(w, 300, FIELD.h + 40, { vy: 100 });
  let guard = 0;
  while (w.shards.includes(falling) && guard++ < 500) w.step(STEP, null);
  assert.ok(!w.shards.includes(falling));
  assert.equal(w.combo, 0);
  assert.ok(w.events.some((e) => e.type === 'drop'));
});

test('spawns are deterministic for a seed and stay inside the field', () => {
  const a = new World({ seed: 7 });
  const b = new World({ seed: 7 });
  a.spawnTimer = 0; a.spawnVolley();
  b.spawnTimer = 0; b.spawnVolley();
  assert.equal(a.shards.length, b.shards.length);
  assert.ok(a.shards.length > 0);
  a.shards.forEach((s, i) => {
    assert.equal(s.x, b.shards[i].x);
    assert.equal(s.mine, b.shards[i].mine);
  });
  for (const s of a.shards) {
    assert.ok(s.x >= 0 && s.x <= FIELD.w);
  }
});

test('difficulty rises with the storm level: tighter spawns, more mines', () => {
  const w = new World({ seed: 3 });
  const int0 = w.spawnInterval();
  w.level = 6;
  const int1 = w.spawnInterval();
  assert.ok(int1 < int0);
  assert.ok(w.mineChance() > 0.15);
  assert.ok(w.spawnInterval() >= 0.5, 'interval never drops below the floor');
});

test('every spawned volley eventually falls back down', () => {
  const w = new World({ seed: 11 });
  w.spawnTimer = 0;
  w.spawnVolley();
  w.spawnTimer = 0;
  w.spawnVolley();
  w.spawnTimer = 1e9; // let the in-flight volleys clear without new ones
  let guard = 0;
  while (w.shards.length && guard++ < 4000) w.step(STEP, null);
  assert.equal(w.shards.length, 0, 'nothing gets stuck on screen');
});

test('the ready state counts down before play, and slicing works during it', () => {
  const w = new World({ seed: 5 });
  assert.equal(w.status, 'ready');
  placeShard(w, 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.stats.sliced, 1, 'the demo slice works during ready');
  let steps = 0;
  while (w.status !== 'play' && steps++ < 1000) w.step(STEP, null);
  assert.equal(w.status, 'play');
  assert.ok(w.events.some((e) => e.type === 'go'));
});

test('the world is a no-op after game over', () => {
  const w = emptyWorld();
  w.status = 'over';
  const t = w.time;
  w.step(STEP, null);
  assert.equal(w.time, t);
});

test('a full headless run with the autopilot survives the first wave', async () => {
  // Regression: the autopilot + sweep path runs without throwing and scores.
  const { Autopilot } = await import('../src/ai.js');
  const w = new World({ seed: 42 });
  const pilot = new Autopilot();
  let guard = 0;
  while (w.status !== 'over' && guard++ < 60 * 120 * 30) {
    w.step(STEP, pilot.controls(w, STEP));
    w.events.length = 0;
  }
  assert.ok(w.stats.sliced > 0, `autopilot sliced ${w.stats.sliced} shards`);
});
