import test from 'node:test';
import assert from 'node:assert/strict';
import { Bot, probeEdge, BOT_TUNING } from '../src/ai.js';
import { createArenaState, ARENAS } from '../src/arenas.js';
import { simulateMatch } from '../src/match.js';
import { STEP } from '../src/config.js';
import { playWorld, place, run } from './helpers.js';

test('edge probes find the nearest edge and its direction', () => {
  const st = createArenaState(ARENAS[0]);
  const near = probeEdge(st, 280, 0);
  assert.ok(near.dist <= 70 && near.dx > 0.8, JSON.stringify(near));
  assert.ok(probeEdge(st, 0, 0).dist > 280);
  assert.equal(probeEdge(st, 900, 0).dist, 0);
});

test('bots go after the foe nearest the edge, not just the closest one', () => {
  const w = playWorld({ players: [{}, {}, {}] });
  const [me, center, edge] = w.blobs;
  place(me, 0, 60); place(center, 0, -90); place(edge, -270, 40);
  let picks = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const bot = new Bot(0, 'hard', seed);
    bot.think(w, me);
    if (bot.plan === 'attack' && bot.target === 2) picks++;
  }
  assert.ok(picks >= 7, `picked the edge foe ${picks}/10`);
});

test('bots near the edge back off toward safe ground', () => {
  const w = playWorld();
  const [me, foe] = w.blobs;
  place(me, 300, 0); place(foe, -200, 0);
  const bot = new Bot(0, 'hard', 3);
  bot.think(w, me);
  assert.equal(bot.plan, 'flee');
  const c = bot.controls(w, STEP);
  assert.ok(c.mx < -0.3, `steers inward ${c.mx}`);
});

test('bots line up and dash so the hit pushes the foe toward the edge', () => {
  const w = playWorld();
  const [me, foe] = w.blobs;
  place(me, 40, 0); place(foe, 180, 0);
  const bot = new Bot(0, 'hard', 1);
  let dashed = false;
  run(w, 2.5, () => {
    const c = bot.controls(w, STEP);
    if (w.events.some((e) => e.type === 'dash')) dashed = true;
    return [c];
  });
  assert.ok(dashed, 'dashed');
  assert.ok(foe.falling || foe.out || foe.x > 220, `foe at ${foe.x}`);
});

test('bots head for the zone in King of the Hill and coins in Coin Grab', () => {
  const k = playWorld({ mode: 'koth' });
  place(k.blobs[0], -200, 150); place(k.blobs[1], 250, -150);
  const kb = new Bot(0, 'normal', 2);
  run(k, 3, () => [kb.controls(k, STEP)]);
  assert.ok(Math.hypot(k.blobs[0].x - k.zone.x, k.blobs[0].y - k.zone.y) < k.zone.r, 'in the zone');

  const c = playWorld({ mode: 'coins', target: 99 });
  place(c.blobs[0], 0, 0); place(c.blobs[1], 0, -300);
  const cb = new Bot(0, 'normal', 2);
  run(c, 8, () => [cb.controls(c, STEP)]);
  assert.ok(c.blobs[0].score >= 2, `coins ${c.blobs[0].score}`);
});

test('harder bots win more often', () => {
  let hard = 0, easy = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const { match } = simulateMatch({ mode: 'lbs', target: { lbs: 2 }, arena: 'cycle' }, [{ bot: 'easy' }, { bot: 'hard' }], seed);
    if (match.winner === 1) hard++; else easy++;
  }
  assert.ok(hard > easy, `hard ${hard} vs easy ${easy}`);
});

test('every difficulty has the full set of tuning knobs', () => {
  const keys = Object.keys(BOT_TUNING.normal).sort();
  for (const lvl of ['easy', 'normal', 'hard']) assert.deepEqual(Object.keys(BOT_TUNING[lvl]).sort(), keys);
  assert.ok(BOT_TUNING.hard.think < BOT_TUNING.normal.think && BOT_TUNING.normal.think < BOT_TUNING.easy.think);
});
