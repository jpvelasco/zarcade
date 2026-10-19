import test from 'node:test';
import assert from 'node:assert/strict';
import { World, newShard, linePoints } from '../src/world.js';
import { FIELD, SHARD, SHIELD, LIVES, STEP, COMBO, SURGE, BREAK, SCORE, CLUSTER, WAVE, BLADE } from '../src/config.js';
import { segmentHitsCircle, nearestOnSegment } from '../src/math.js';

// A world with no live objects, ready for hand-placed shards.
function emptyWorld(seed = 1) {
  const w = new World({ seed });
  w.status = 'play'; // skip the ready countdown
  w.spawnTimer = 1e9; // no surprise spawns mid-test
  return w;
}

function place(w, kind, x, y, opts = {}) {
  const sh = newShard(kind, x, y, opts);
  w.shards.push(sh);
  return sh;
}

// Let the blade ribbon expire so the next sweep counts as a new gesture.
function newGesture(w) {
  for (let i = 0; i < 24; i++) w.step(STEP, null);
}

// Drop a crystal of `kind` out of the bottom of the field.
function dropOne(w, kind = 'shard') {
  const sh = place(w, kind, 300, FIELD.h + 40, { vy: 100 });
  let guard = 0;
  while (w.shards.includes(sh) && guard++ < 500) w.step(STEP, null);
  assert.ok(!w.shards.includes(sh), 'the crystal left the field');
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

// ------------------------------------------------------------ slicing

test('a slice through a crystal scores, builds the combo and emits a shard event', () => {
  const w = emptyWorld();
  const sh = place(w, 'shard', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.shards.length, 0);
  assert.equal(w.combo, 1);
  assert.equal(w.maxCombo, 1);
  assert.equal(w.stats.sliced, 1);
  assert.equal(w.score, SCORE.shard + SCORE.comboBonus);
  const ev = w.events.find((e) => e.type === 'shard');
  assert.ok(ev && ev.combo === 1 && ev.x === sh.x && ev.y === sh.y);
});

test('combo bonus grows with the chain and the max combo is tracked', () => {
  const w = emptyWorld();
  place(w, 'shard', 200, 300);
  place(w, 'shard', 400, 300);
  w.sweep(linePoints(100, 300, 500, 300));
  assert.equal(w.combo, 2);
  assert.equal(w.maxCombo, 2);
  // shard 1: 10 + 1*2, shard 2: 10 + 2*2
  assert.equal(w.score, 12 + 14);
});

test('mines cost a life, clear the combo and emit a mine event', () => {
  const w = emptyWorld();
  place(w, 'shard', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.combo, 1);
  newGesture(w);
  const mine = place(w, 'mine', 300, 300);
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
    place(w, 'mine', 300, 300);
    w.sweep(linePoints(300, 200, 300, 400));
    newGesture(w);
  }
  assert.equal(w.lives, 0);
  assert.equal(w.status, 'over');
  assert.equal(w.overReason, 'mine');
  const ev = w.events.find((e) => e.type === 'gameover');
  assert.ok(ev && ev.score === 50);
});

test('one swipe through two mines cannot take lives below zero', () => {
  // Regression: cutSegment bailed out per segment but sweep kept feeding it
  // later segments, so a double mine hit on the last life reached -1 and the
  // HUD crashed on '●'.repeat(-1).
  const w = emptyWorld();
  w.lives = 1;
  place(w, 'mine', 200, 300);
  place(w, 'mine', 400, 300);
  w.sweep(linePoints(100, 300, 500, 300));
  assert.equal(w.lives, 0, 'lives stop at zero');
  assert.equal(w.status, 'over');
  assert.equal(w.events.filter((e) => e.type === 'mine').length, 1, 'the dead swipe stops cutting');
  assert.equal(w.shards.length, 1, 'the second mine survives the fatal swipe');
});

test('nothing can be sliced or scored after the run is over', () => {
  const w = emptyWorld();
  w.lives = 1;
  place(w, 'mine', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.status, 'over');
  const score = w.score;
  newGesture(w);
  place(w, 'shard', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.score, score, 'a post-mortem swipe scores nothing');
  assert.equal(w.shards.length, 1);
});

test('a shielded crystal takes one slice for the shell and a second for the shard', () => {
  const w = emptyWorld();
  place(w, 'shard', 300, 300, { shielded: true });
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.shards.length, 1);
  assert.equal(w.shards[0].shielded, false);
  assert.ok(w.events.some((e) => e.type === 'shell'));
  assert.equal(w.stats.sliced, 0);
  newGesture(w);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.shards.length, 0);
  assert.equal(w.stats.sliced, 1);
});

test('one long swipe cannot crack a shell and cut the gem in the same pass', () => {
  const w = emptyWorld();
  place(w, 'shard', 300, 300, { shielded: true });
  w.sweep(linePoints(300, 100, 300, 500, 16));
  assert.equal(w.shards.length, 1);
  assert.equal(w.shards[0].shielded, false);
  assert.equal(w.stats.sliced, 0, 'the gem survives the swipe that cracked its shell');
});

test('shielded crystals are hittable through the shell ring, not just the gem', () => {
  const w = emptyWorld();
  place(w, 'shard', 300, 300, { shielded: true });
  // A swipe 30 px above the centre is inside the shell (42) but outside the gem (26).
  w.sweep(linePoints(100, 270, 500, 270));
  assert.equal(w.shards.length, 1);
  assert.equal(w.shards[0].shielded, false);
  assert.ok(SHIELD.r > SHARD.r);
});

test('a gesture that never stops moving becomes a new stroke after maxSwipe', () => {
  const w = emptyWorld();
  const sh = place(w, 'shard', 300, 300, { shielded: true });
  w.sweep(linePoints(300, 200, 300, 400)); // cracks the shell
  assert.equal(sh.shielded, false);
  // Keep the ribbon alive with a trickle of points for longer than maxSwipe.
  let guard = 0;
  while (w.shards.includes(sh) && guard++ < 200) {
    w.step(STEP, { points: [{ x: 300 + (guard % 2), y: 300 }] });
  }
  assert.ok(!w.shards.includes(sh), 'the same unbroken motion eventually cuts again');
  assert.ok(w.swipeT < BLADE.maxSwipe);
});

test('slow-mo triggers on a multi-swipe and dilates time', () => {
  const w = emptyWorld();
  for (let i = 0; i < 3; i++) place(w, 'shard', 200 + i * 80, 300);
  w.step(STEP, { points: linePoints(100, 300, 500, 300) });
  assert.ok(w.slowTimer > 0);
  assert.equal(w.stats.sliced, 3);
  assert.ok(w.events.some((e) => e.type === 'slowStart'), 'a swipe start emits slowStart');
  const t = w.time;
  w.step(STEP, null);
  assert.ok(Math.abs(w.time - t - STEP * COMBO.slowScale) < 1e-9);
});

test('the combo decays after the window, and a missed crystal resets it', () => {
  const w = emptyWorld();
  place(w, 'shard', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.combo, 1);
  for (let i = 0; i < 170; i++) w.step(STEP, null); // past the 1.4 s window
  assert.equal(w.combo, 0);
});

// ------------------------------------------------------------ storm surge

test('a crystal that falls back feeds the surge and breaks the combo', () => {
  const w = emptyWorld();
  place(w, 'shard', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400)); // combo 1
  const surgeAfterSlice = w.surge;
  dropOne(w, 'shard');
  assert.equal(w.combo, 0);
  assert.ok(w.events.some((e) => e.type === 'drop'));
  const miss = w.events.find((e) => e.type === 'miss');
  assert.ok(miss && miss.kind === 'shard' && miss.cost === SURGE.perMiss);
  assert.equal(w.stats.missed, 1);
  assert.ok(w.surge > surgeAfterSlice);
});

test('each kind costs its own amount of surge when it gets away', () => {
  const costs = {};
  for (const kind of ['shard', 'cluster', 'gold']) {
    const w = emptyWorld();
    dropOne(w, kind);
    costs[kind] = +w.surge.toFixed(5);
  }
  assert.equal(costs.shard, SURGE.perMiss);
  assert.equal(costs.cluster, SURGE.clusterMiss);
  assert.equal(costs.gold, SURGE.goldMiss);
  assert.ok(costs.cluster > costs.shard && costs.shard > costs.gold);
});

test('a miss costs more as the storm climbs, up to a ceiling', () => {
  assert.equal(emptyWorld().missScale(), 1, 'the opening is forgiving');
  const w = emptyWorld();
  w.level = 10;
  assert.ok(w.missScale() > 1.3 && w.missScale() < 1.5);
  w.level = 100;
  assert.equal(w.missScale(), SURGE.levelScaleMax, 'it stops getting worse');

  // And the cost the sim actually charges follows it. The level is derived
  // from game time inside step(), so advance the clock rather than the field.
  const high = emptyWorld();
  high.time = WAVE.time * 10 + 0.5;
  dropOne(high, 'shard');
  assert.equal(high.level, 10, 'the storm really is at level 10');
  assert.equal(+high.surge.toFixed(5), +(SURGE.perMiss * high.missScale()).toFixed(5));
  assert.ok(high.surge > SURGE.perMiss, 'a late miss hurts more than an early one');
});

test('a mine that falls away is good news: relief, never surge', () => {
  const w = emptyWorld();
  w.surge = 0.5;
  dropOne(w, 'mine');
  assert.equal(+w.surge.toFixed(5), +(0.5 - SURGE.mineRelief).toFixed(5));
  assert.equal(w.stats.missed, 0, 'a dodged mine is not a miss');
  assert.ok(w.events.some((e) => e.type === 'mineMiss'));
  assert.ok(!w.events.some((e) => e.type === 'miss'));
});

test('a full surge costs a life, resets partway and emits overload', () => {
  const w = emptyWorld();
  w.surge = 1 - SURGE.perMiss / 2; // one more miss tips it over
  dropOne(w, 'shard');
  assert.equal(w.lives, LIVES - 1);
  assert.equal(w.surge, SURGE.resetTo);
  assert.equal(w.stats.overloads, 1);
  const ev = w.events.find((e) => e.type === 'overload');
  assert.ok(ev && ev.lives === LIVES - 1);
});

test('the surge alone can end the run', () => {
  const w = emptyWorld();
  for (let i = 0; i < LIVES; i++) {
    w.surge = 0.999;
    dropOne(w, 'shard');
  }
  assert.equal(w.lives, 0);
  assert.equal(w.status, 'over');
  assert.equal(w.overReason, 'surge');
  assert.ok(w.events.some((e) => e.type === 'gameover' && e.reason === 'surge'));
});

test('surge never leaves the 0..1 band', () => {
  const w = emptyWorld();
  w.drainSurge(5);
  assert.equal(w.surge, 0);
  w.surge = 0.9;
  w.addSurge(0.05);
  assert.ok(w.surge >= 0 && w.surge <= 1);
  w.surge = 0.99;
  w.addSurge(10); // a huge hit still only costs one life
  assert.equal(w.surge, SURGE.resetTo);
  assert.equal(w.lives, LIVES - 1);
});

test('slicing bleeds the surge back down', () => {
  const w = emptyWorld();
  w.surge = 0.5;
  place(w, 'shard', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(+w.surge.toFixed(5), +(0.5 - SURGE.perSlice).toFixed(5));
});

test('a player who never swipes is killed by the storm', () => {
  // The headline regression: before the surge, 120 s of total passivity ended
  // with `lives 3, score 0, status play`.
  const w = new World({ seed: 12345 });
  let guard = 0;
  while (w.status !== 'over' && guard++ < 120 * 300) {
    w.step(STEP, null);
    w.events.length = 0;
  }
  assert.equal(w.status, 'over', 'the storm wins against a passive player');
  assert.equal(w.lives, 0);
  assert.equal(w.stats.overloads, LIVES, 'every life went to the surge');
  assert.ok(w.time < 60, `passive runs end quickly, ended at ${w.time.toFixed(1)}s`);
  assert.ok(w.time > 10, `but not instantly, ended at ${w.time.toFixed(1)}s`);
});

// ------------------------------------------------------------ storm break

test('slicing arms Storm Break, and only a full meter fires', () => {
  const w = emptyWorld();
  assert.equal(w.breakReady, false);
  assert.equal(w.stormBreak(), false, 'an empty meter does nothing');
  const need = Math.ceil(1 / BREAK.perSlice);
  for (let i = 0; i < need; i++) {
    place(w, 'shard', 300, 300);
    w.sweep(linePoints(300, 200, 300, 400));
    newGesture(w);
  }
  assert.equal(w.breakMeter, 1);
  assert.equal(w.breakReady, true);
  assert.ok(w.events.some((e) => e.type === 'breakReady'));
});

test('cluster pieces charge Storm Break at half rate', () => {
  const w = emptyWorld();
  place(w, 'shard', 300, 300, { piece: true });
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(+w.breakMeter.toFixed(6), +(BREAK.perSlice / 2).toFixed(6));
});

test('Storm Break shatters the field, defuses mines and dumps surge', () => {
  const w = emptyWorld();
  w.breakMeter = 1;
  w.surge = 0.8;
  place(w, 'shard', 100, 300);
  place(w, 'shard', 200, 300);
  place(w, 'frost', 300, 300);
  place(w, 'mine', 400, 300);
  const before = w.score;
  assert.equal(w.stormBreak(), true);
  assert.equal(w.shards.length, 0, 'the field is cleared');
  assert.equal(w.lives, LIVES, 'the defused mines cost nothing');
  assert.equal(w.combo, 3, 'each shattered crystal adds to the combo');
  assert.equal(w.stats.sliced, 3);
  assert.equal(w.score - before, (SCORE.breakEach + 2) + (SCORE.breakEach + 4) + (SCORE.breakEach + 6));
  assert.equal(+w.surge.toFixed(5), +(0.8 - BREAK.surgeRelief).toFixed(5));
  assert.equal(w.breakMeter, 0, 'a break never refills its own meter');
  assert.ok(w.slowTimer > 0, 'the shatter buys a breath');
  const ev = w.events.find((e) => e.type === 'break');
  assert.ok(ev && ev.defused === 1 && ev.pts.length === 3);
});

test('Storm Break on an empty field still spends the meter and the relief', () => {
  const w = emptyWorld();
  w.breakMeter = 1;
  w.surge = 0.9;
  assert.equal(w.stormBreak(), true);
  assert.equal(w.breakMeter, 0);
  assert.ok(w.surge < 0.9);
});

test('Storm Break is refused outside play', () => {
  const w = emptyWorld();
  w.breakMeter = 1;
  w.status = 'ready';
  assert.equal(w.stormBreak(), false);
  w.status = 'over';
  assert.equal(w.stormBreak(), false);
  assert.equal(w.breakMeter, 1, 'a refused break keeps its charge');
});

// ------------------------------------------------------------ crystal kinds

test('a golden shard pays a lot and gives a life back when below max', () => {
  const w = emptyWorld();
  w.lives = 1;
  place(w, 'gold', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.score, SCORE.gold + SCORE.comboBonus);
  assert.equal(w.lives, 2);
  assert.equal(w.stats.gold, 1);
  const ev = w.events.find((e) => e.type === 'gold');
  assert.ok(ev && ev.life === true);
  assert.ok(w.events.some((e) => e.type === 'life' && e.lives === 2));
});

test('a golden shard at full lives pays out but adds no fourth life', () => {
  const w = emptyWorld();
  place(w, 'gold', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.lives, LIVES);
  assert.equal(w.events.find((e) => e.type === 'gold').life, false);
  assert.ok(!w.events.some((e) => e.type === 'life'));
});

test('a frost shard slows the storm and drains a chunk of surge', () => {
  const w = emptyWorld();
  w.surge = 0.9;
  place(w, 'frost', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.score, SCORE.frost + SCORE.comboBonus);
  assert.ok(w.slowTimer > 0, 'frost buys time');
  assert.equal(+w.surge.toFixed(5), +(0.9 - SURGE.perSlice - SURGE.frostDrain).toFixed(5));
  assert.ok(w.events.some((e) => e.type === 'frost'));
});

test('a cluster bursts into pieces the same swipe cannot also cut', () => {
  const w = emptyWorld();
  place(w, 'cluster', 300, 300);
  w.sweep(linePoints(300, 100, 300, 500, 20));
  assert.equal(w.shards.length, CLUSTER.pieces, 'four pieces in the air');
  assert.ok(w.shards.every((s) => s.piece && s.kind === 'shard'));
  assert.ok(w.shards.every((s) => s.r === CLUSTER.pieceR));
  assert.equal(w.stats.sliced, 1, 'the long swipe only cut the cluster itself');
  assert.equal(w.score, SCORE.cluster + SCORE.comboBonus);
  const ev = w.events.find((e) => e.type === 'cluster');
  assert.ok(ev && ev.pieces === CLUSTER.pieces);
});

test('cluster pieces score as pieces and keep the chain going', () => {
  const w = emptyWorld();
  place(w, 'cluster', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  newGesture(w);
  const piece = w.shards[0];
  const before = w.score;
  const comboBefore = w.combo;
  w.sweep(linePoints(piece.x - 60, piece.y, piece.x + 60, piece.y));
  assert.ok(w.combo > comboBefore, 'the burst feeds the combo');
  assert.equal(w.score - before, SCORE.piece + w.combo * SCORE.comboBonus);
});

// ------------------------------------------------------------ the curve

test('the first two storm levels throw no mines at all', () => {
  const w = new World({ seed: 3 });
  for (const level of [0, 1]) {
    w.level = level;
    assert.equal(w.mineChance(), 0, `level ${level} is mine-free`);
  }
  w.level = 2;
  assert.ok(w.mineChance() > 0 && w.mineChance() < 0.05, 'level 2 is a trickle');
  w.level = 10;
  assert.ok(w.mineChance() > 0.2);
  w.level = 40;
  assert.equal(w.mineChance(), WAVE.mineChanceMax, 'the ramp has a ceiling');
});

test('mines stay away for the opening of a real run', () => {
  // WAVE.time * mineFreeLevels seconds of grace: time to learn the swipe.
  const w = new World({ seed: 9 });
  w.status = 'play';
  w.readyT = 0;
  let guard = 0;
  while (w.time < 20 && guard++ < 20 * 300) {
    w.step(STEP, null);
    w.events.length = 0;
    assert.ok(!w.shards.some((s) => s.kind === 'mine'), `a mine appeared at ${w.time.toFixed(1)}s`);
  }
  assert.ok(w.time >= 20);
});

test('the storm level changes what appears, not just how often', () => {
  const w = new World({ seed: 5 });
  w.level = 0;
  assert.equal(w.kindChance('cluster'), 0);
  assert.equal(w.kindChance('frost'), 0);
  assert.equal(w.kindChance('gold'), 0);
  assert.equal(w.shieldChance(), 0);
  w.level = 2;
  assert.ok(w.kindChance('cluster') > 0);
  assert.ok(w.kindChance('frost') > 0, 'frost arrives with the mines');
  assert.equal(w.kindChance('gold'), 0);
  assert.equal(w.shieldChance(), 0);
  w.level = 6;
  assert.ok(w.kindChance('gold') > 0);
  assert.ok(w.shieldChance() > 0);
  w.level = 50;
  for (const k of ['cluster', 'frost', 'gold']) assert.ok(w.kindChance(k) <= 0.2, `${k} stays rare`);
});

test('difficulty rises with the storm level: tighter spawns, more mines', () => {
  const w = new World({ seed: 3 });
  const int0 = w.spawnInterval();
  w.level = 6;
  assert.ok(w.spawnInterval() < int0);
  w.level = 60;
  assert.equal(w.spawnInterval(), WAVE.minInterval, 'the interval has a floor');
});

test('spawns are deterministic for a seed and stay inside the field', () => {
  const a = new World({ seed: 7 });
  const b = new World({ seed: 7 });
  a.level = 8; b.level = 8; // a level that can throw every kind
  a.spawnVolley();
  b.spawnVolley();
  assert.equal(a.shards.length, b.shards.length);
  assert.ok(a.shards.length > 0);
  a.shards.forEach((s, i) => {
    assert.equal(s.x, b.shards[i].x);
    assert.equal(s.kind, b.shards[i].kind);
    assert.equal(s.shielded, b.shards[i].shielded);
  });
  for (const s of a.shards) assert.ok(s.x >= 0 && s.x <= FIELD.w);
});

test('only shards and clusters ever wear a shell', () => {
  const w = new World({ seed: 21 });
  w.level = 20; // the shield chance is at its ceiling here
  for (let i = 0; i < 400; i++) w.spawnOne();
  const shielded = w.shards.filter((s) => s.shielded);
  assert.ok(shielded.length > 0, 'shells do appear');
  assert.ok(shielded.every((s) => s.kind === 'shard' || s.kind === 'cluster'));
});

test('every spawned volley eventually falls back down', () => {
  const w = new World({ seed: 11 });
  w.status = 'play';
  w.spawnTimer = 0;
  w.spawnVolley();
  w.spawnVolley();
  w.spawnTimer = 1e9; // let the in-flight volleys clear without new ones
  let guard = 0;
  while (w.shards.length && guard++ < 4000) w.step(STEP, null);
  assert.equal(w.shards.length, 0, 'nothing gets stuck on screen');
});

// ------------------------------------------------------------ lifecycle

test('the ready state counts down before play, and slicing works during it', () => {
  const w = new World({ seed: 5 });
  assert.equal(w.status, 'ready');
  place(w, 'shard', 300, 300);
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

test('the daily target fires dailyClear once, whatever scored it', () => {
  const w = new World({ seed: 2, daily: true, target: 100 });
  w.status = 'play';
  w.spawnTimer = 1e9;
  place(w, 'gold', 300, 300); // one gold is worth more than the target
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.dailyCleared, true);
  assert.equal(w.events.filter((e) => e.type === 'dailyClear').length, 1);
  newGesture(w);
  w.events.length = 0; // the game drains events every frame
  place(w, 'shard', 300, 300);
  w.sweep(linePoints(300, 200, 300, 400));
  assert.equal(w.events.filter((e) => e.type === 'dailyClear').length, 0, 'it only celebrates once');
});

test('a full headless run with the autopilot plays the new mechanics', async () => {
  const { Autopilot } = await import('../src/ai.js');
  const w = new World({ seed: 42 });
  const pilot = new Autopilot();
  let guard = 0;
  while (w.status !== 'over' && guard++ < 60 * 120 * 30) {
    const c = pilot.controls(w, STEP);
    if (c.breakNow) w.stormBreak();
    w.step(STEP, c.points ? c : null);
    w.events.length = 0;
    assert.ok(w.lives >= 0 && w.lives <= LIVES, `lives stayed sane (${w.lives})`);
    assert.ok(w.surge >= 0 && w.surge <= 1, `surge stayed in band (${w.surge})`);
  }
  assert.equal(w.status, 'over', 'the run ends');
  assert.ok(w.stats.sliced > 50, `autopilot sliced ${w.stats.sliced} shards`);
  assert.ok(w.stats.breaks > 0, 'and spent at least one Storm Break');
  assert.ok(w.score > 1000, `and scored ${w.score}`);
});

test('the autopilot avoids mines well enough to reach the daily band', async () => {
  const { Autopilot } = await import('../src/ai.js');
  const { DAILY } = await import('../src/config.js');
  const hardest = DAILY.target + DAILY.spread;
  for (const seed of [1, 7, 42, 99, 555]) {
    const w = new World({ seed });
    const pilot = new Autopilot();
    let guard = 0;
    while (w.status !== 'over' && guard++ < 60 * 120 * 10) {
      const c = pilot.controls(w, STEP);
      if (c.breakNow) w.stormBreak();
      w.step(STEP, c.points ? c : null);
      w.events.length = 0;
    }
    assert.ok(w.score >= hardest, `seed ${seed} reached ${w.score}, needs ${hardest}`);
  }
});

// ------------------------------------------------------------ screen shape

test('the field width follows the window shape, inside sane bounds', async () => {
  const { fieldWidthFor } = await import('../src/world.js');
  // Height is fixed, so the width is the window's aspect times FIELD.h.
  assert.equal(fieldWidthFor(1280, 800), Math.round(FIELD.h * 1280 / 800));
  assert.equal(fieldWidthFor(390, 844), Math.round(FIELD.h * 390 / 844));
  // Very tall and very wide windows clamp instead of going degenerate.
  assert.equal(fieldWidthFor(200, 1000), FIELD.minW);
  assert.equal(fieldWidthFor(3440, 900), FIELD.maxW);
  // A window with no size yet (hidden tab, zero-height iframe) falls back.
  assert.equal(fieldWidthFor(0, 0), FIELD.w);
});

test('a world defaults to the classic width and takes any width it is given', () => {
  assert.equal(new World({ seed: 1 }).w, FIELD.w);
  assert.equal(new World({ seed: 1, width: 1440 }).w, 1440);
  assert.equal(new World({ seed: 1, width: 99999 }).w, FIELD.maxW);
  assert.equal(new World({ seed: 1, width: Number.NaN }).w, FIELD.w);
});

test('spawns spread across a wide field and stay inside a narrow one', () => {
  for (const width of [FIELD.minW, 600, 1440, FIELD.maxW]) {
    const w = new World({ seed: 3, width });
    w.level = 8;
    const xs = [];
    for (let i = 0; i < 200; i++) w.spawnOne();
    for (const s of w.shards) {
      xs.push(s.x);
      assert.ok(s.x >= 0 && s.x <= width, `x ${s.x} inside width ${width}`);
    }
    // The launches use the whole width, not a central 600-wide column.
    assert.ok(Math.min(...xs) < width * 0.15 && Math.max(...xs) > width * 0.85, `spread across ${width}`);
  }
});

test('the same seed throws the same storm at any width, scaled to fit', () => {
  const a = new World({ seed: 11, width: 600 });
  const b = new World({ seed: 11, width: 1500 });
  for (const w of [a, b]) { w.level = 6; for (let i = 0; i < 30; i++) w.spawnVolley(); }
  assert.equal(a.shards.length, b.shards.length);
  a.shards.forEach((s, i) => assert.equal(s.kind, b.shards[i].kind));
});

test('resizing mid-run keeps every crystal on screen and its arc in proportion', () => {
  const w = emptyWorld();
  const sh = place(w, 'shard', 450, 400, { vx: 120, vy: -300 });
  w.blade.pts.push({ x: 10, y: 10 });
  w.swiping = true;
  w.setWidth(900);
  assert.equal(w.w, 900);
  assert.equal(sh.x, 675);
  assert.equal(sh.vx, 180);
  assert.equal(sh.y, 400, 'height is fixed, so y is untouched');
  assert.equal(sh.vy, -300);
  // The old ribbon is in the old coordinates: it must not cut anything.
  assert.equal(w.blade.pts.length, 0);
  assert.equal(w.swiping, false);
  w.setWidth(Number.NaN);
  assert.equal(w.w, 900, 'a bad width is ignored');
});

for (const width of [420, 1500]) {
  test(`the autopilot still plays a full run on a ${width}-wide field`, async () => {
    const { Autopilot } = await import('../src/ai.js');
    const w = new World({ seed: 42, width });
    const pilot = new Autopilot();
    let guard = 0;
    while (w.status !== 'over' && guard++ < 60 * 120 * 10) {
      const c = pilot.controls(w, STEP);
      if (c.breakNow) w.stormBreak();
      w.step(STEP, c.points ? c : null);
      w.events.length = 0;
      for (const s of w.shards) assert.ok(Number.isFinite(s.x), 'crystal positions stay finite');
    }
    assert.ok(w.stats.sliced > 50, `autopilot sliced ${w.stats.sliced} on ${width}`);
    assert.ok(w.score > 1000, `and scored ${w.score}`);
  });
}

test('a wide field throws more crystals, and each one matters less', () => {
  const narrow = new World({ seed: 5, width: 600 });
  const wide = new World({ seed: 5, width: 1600 });
  const phone = new World({ seed: 5, width: 420 });
  assert.equal(narrow.density, 1);
  assert.equal(phone.density, 1, 'phones keep the tuned rate');
  assert.ok(wide.density > 1.5 && wide.density <= 1.6, `wide density ${wide.density}`);
  narrow.level = wide.level = 4;
  assert.ok(Math.abs(wide.spawnInterval() * wide.density - narrow.spawnInterval()) < 1e-9);
  // The same miss costs proportionally less surge on the wide field...
  for (const w of [narrow, wide]) { w.status = 'play'; w.spawnTimer = 1e9; }
  const drop = (w) => { w.shards.push(newShard('shard', 300, FIELD.h + 40, { vy: 100 })); for (let i = 0; i < 200; i++) w.step(STEP, null); };
  drop(narrow); drop(wide);
  assert.ok(Math.abs(wide.surge * wide.density - narrow.surge) < 1e-9, `${wide.surge} vs ${narrow.surge}`);
  // ...and each slice charges proportionally less Storm Break.
  for (const w of [narrow, wide]) {
    place(w, 'shard', 300, 400);
    w.step(STEP, { points: linePoints(200, 400, 400, 400) });
  }
  assert.ok(Math.abs(wide.breakMeter * wide.density - narrow.breakMeter) < 1e-9);
});

test('an idle player loses to the surge in about the same time on any screen', () => {
  const times = [420, 600, 1440, 2000].map((width) => {
    const w = new World({ seed: 9, width });
    w.status = 'play';
    w.readyT = 0;
    let g = 0;
    while (w.status !== 'over' && g++ < 120 * 300) w.step(STEP, null);
    return w.time;
  });
  const lo = Math.min(...times), hi = Math.max(...times);
  assert.ok(hi / lo < 1.35, `idle survival ${times.map((t) => t.toFixed(1)).join(' / ')} s`);
});

test('crystals grow on short screens so they stay readable and hittable', async () => {
  const { objectScaleFor } = await import('../src/world.js');
  assert.equal(objectScaleFor(1280, 800), 1, 'desktop keeps the designed size');
  assert.equal(objectScaleFor(390, 844), 1, 'an upright phone keeps it too');
  const side = objectScaleFor(844, 390); // a phone on its side: 390 px for 900 units
  assert.ok(side > 1.4 && side <= 1.6, `sideways phone scale ${side}`);
  assert.equal(objectScaleFor(400, 120), 1.6, 'tiny windows cap the growth');
  assert.equal(objectScaleFor(0, 0), 1);
});

test('the object scale sizes every crystal and its hitbox', () => {
  const w = new World({ seed: 2, size: 1.5 });
  w.level = 8;
  for (let i = 0; i < 40; i++) w.spawnOne();
  for (const s of w.shards) assert.equal(s.size, 1.5);
  const base = new World({ seed: 2 });
  base.level = 8;
  for (let i = 0; i < 40; i++) base.spawnOne();
  w.shards.forEach((s, i) => assert.ok(Math.abs(s.r - base.shards[i].r * 1.5) < 1e-9));
  // A swipe that passes just outside a normal gem still cuts a grown one.
  const a = emptyWorld();
  const b = new World({ seed: 1, size: 1.5 });
  b.status = 'play';
  b.spawnTimer = 1e9;
  place(a, 'shard', 300, 400);
  b.shards.push(newShard('shard', 300, 400, { size: 1.5 }));
  const miss = linePoints(200, 400 - SHARD.r - 8, 400, 400 - SHARD.r - 8);
  a.step(STEP, { points: miss });
  b.step(STEP, { points: miss });
  assert.equal(a.stats.sliced, 0);
  assert.equal(b.stats.sliced, 1);
});

test('a grown shell is hit through its grown ring', () => {
  const w = new World({ seed: 1, size: 1.5 });
  w.status = 'play';
  w.spawnTimer = 1e9;
  const sh = newShard('shard', 300, 400, { shielded: true, size: 1.5 });
  w.shards.push(sh);
  const y = 400 - SHIELD.r * 1.5 + 6; // inside the grown ring, outside the normal one
  w.step(STEP, { points: linePoints(200, y, 400, y) });
  assert.equal(sh.shielded, false, 'the shell cracked');
});

test('turning the phone mid-run resizes what is already in the air', () => {
  const w = emptyWorld();
  const sh = place(w, 'mine', 300, 400);
  const r0 = sh.r;
  w.setWidth(1800, 1.5);
  assert.equal(w.size, 1.5);
  assert.equal(sh.size, 1.5);
  assert.ok(Math.abs(sh.r - r0 * 1.5) < 1e-9);
  w.setWidth(600, 1);
  assert.ok(Math.abs(sh.r - r0) < 1e-9, 'and back again');
  const piecesBefore = w.shards.length;
  const cl = newShard('cluster', 300, 300, { size: 1 });
  w.shards.push(cl);
  w.setWidth(600, 1.4);
  w.step(STEP, { points: linePoints(200, 300, 400, 300) });
  const pieces = w.shards.filter((s) => s.piece);
  assert.equal(pieces.length, CLUSTER.pieces);
  for (const p of pieces) assert.equal(p.size, 1.4, 'pieces inherit the current size');
  assert.ok(w.shards.length >= piecesBefore);
});
