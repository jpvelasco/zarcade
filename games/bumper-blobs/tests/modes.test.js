import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { STEP, ROUND, KOTH, COINS } from '../src/config.js';
import { rankByScore } from '../src/modes.js';
import { run, playWorld, place } from './helpers.js';
import { Match } from '../src/match.js';

test('Last Blob Standing: the last blob on the floor wins and the ranking follows fall order', () => {
  const w = playWorld({ players: [{}, {}, {}] });
  const [a, b, c] = w.blobs;
  place(b, 330, 0); b.vx = 300;
  run(w, 0.4);
  place(c, -330, 0); c.vx = -300;
  run(w, 2);
  assert.equal(w.phase, 'done');
  assert.equal(w.result.winner, 0);
  assert.deepEqual(w.result.ranking, [0, 2, 1]);
  assert.ok(!a.out);
});

test('Last Blob Standing: falling together is a draw', () => {
  const w = playWorld();
  place(w.blobs[0], 330, 0); w.blobs[0].vx = 300;
  place(w.blobs[1], -330, 0); w.blobs[1].vx = -300;
  run(w, 2);
  assert.equal(w.phase, 'done');
  assert.equal(w.result.winner, -1);
});

test('King of the Hill: only a blob alone in the zone scores', () => {
  const w = playWorld({ mode: 'koth', target: 50 });
  const z = w.zone;
  const [a, b] = w.blobs;
  place(a, z.x, z.y); place(b, z.x + 250, z.y + 200);
  run(w, 2);
  assert.ok(Math.abs(a.score - 2) < 0.05, `score ${a.score}`);
  assert.equal(b.score, 0);
  // Contested: nobody scores.
  place(b, z.x + 50, z.y);
  const before = a.score;
  run(w, 0.5, () => { place(a, z.x - 25, z.y); place(b, z.x + 40, z.y); return []; });
  assert.equal(a.score, before);
  assert.ok(w.zone.contested);
});

test('King of the Hill: the zone moves on a timer to solid ground', () => {
  const w = playWorld({ mode: 'koth', arena: 'lava' });
  const first = { x: w.zone.x, y: w.zone.y };
  run(w, KOTH.moveEvery + 0.1);
  assert.notDeepEqual({ x: w.zone.x, y: w.zone.y }, first);
  assert.ok(w.isSafe(w.zone.x, w.zone.y, 20));
});

test('King of the Hill: reaching the target wins, and ring-outs respawn', () => {
  const w = playWorld({ mode: 'koth', target: 4 });
  const [a, b] = w.blobs;
  place(b, 330, 0); b.vx = 300;
  run(w, 3.5, () => { place(a, w.zone.x, w.zone.y); return []; });
  assert.ok(!b.out, 'respawned');
  assert.equal(w.phase, 'play');
  run(w, 1.5, () => { place(a, w.zone.x, w.zone.y); return []; });
  assert.equal(w.phase, 'done');
  assert.equal(w.result.winner, 0);
});

test('Coin Grab: coins appear, touching one scores it, falling off spills some', () => {
  const w = playWorld({ mode: 'coins', target: 99 });
  run(w, 3);
  assert.ok(w.coins.length > 0);
  const [a] = w.blobs;
  const coin = w.coins[0];
  place(a, coin.x, coin.y);
  w.step(STEP, []);
  assert.equal(a.score, coin.value);
  a.score = 10;
  const count = w.coins.length;
  place(a, 335, 0); a.vx = 300;
  run(w, 1.4);
  assert.equal(a.score, 10 - COINS.lose);
  assert.ok(w.coins.length >= Math.min(COINS.max, count + COINS.lose) - 1);
});

test('Coin Grab: a fall during the winning celebration keeps the winning score', () => {
  const m = new Match({ mode: 'coins', target: { coins: 15 } }, [{}, {}], 3);
  const w = m.nextRound();
  while (w.phase === 'countdown') w.step(STEP, []);
  const [a, b] = w.blobs;
  a.score = 14; b.score = 10;
  w.coins.length = 0;
  // The winning coin is right at the edge, and the blob slides off with it.
  place(a, 280, 0); a.vx = 500;
  w.coins.push({ x: 290, y: 0, value: 1, t: 1, spin: 0 });
  for (let i = 0; i < 5 && w.phase !== 'done'; i++) w.step(STEP, []);
  assert.equal(w.phase, 'done');
  assert.equal(w.result.winner, 0);
  run(w, ROUND.outro);
  assert.ok(a.out || a.falling, 'fell off during the celebration');
  m.endRound(w);
  assert.equal(m.winner, 0);
  assert.deepEqual(m.scores, [15, 10]);
  assert.equal(a.score, 15, 'no coins spilled after the win');
});

test('timed modes go to overtime on a tie and still always finish', () => {
  const w = new World({ arena: 'pudding', mode: 'coins', players: [{}, {}], seed: 4, target: 99, powerups: false, hazards: false });
  w.coinsOff = true;
  // No one ever scores: a 0-0 tie runs into overtime and then a tiebreak.
  run(w, ROUND.countdown + ROUND.timeLimit + ROUND.overtime + 1, () => { w.coins.length = 0; w.nextCoin = 99; return []; });
  assert.equal(w.phase, 'done');
  assert.ok(w.overtime);
  assert.equal(w.result.reason, 'time');
  assert.equal(w.result.winner, 0);
});

test('score ranking breaks ties by fewer falls, then more ring-outs', () => {
  const mk = (i, score, falls, ringouts) => ({ i, score, stats: { falls, ringouts } });
  assert.deepEqual(rankByScore([mk(0, 5, 2, 0), mk(1, 5, 1, 0), mk(2, 7, 9, 0), mk(3, 5, 1, 3)]), [2, 3, 1, 0]);
});
