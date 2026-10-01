import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, LESSONS, makeDaily } from '../src/stages.js';
import { Battle, paceFor } from '../src/battle.js';
import { Autoplay } from '../src/autoplay.js';

function play(stage, { wpm, errorRate = 0.04, speedScale = 1, seed = 3 }) {
  const b = new Battle(stage, { seed, speedScale });
  const bot = new Autoplay({ wpm, errorRate, seed: seed + 1 });
  for (let t = 0; t < 900 && b.status === 'play'; t += 1 / 30) {
    bot.update(b, 1 / 30);
    b.step(1 / 30);
    b.events.length = 0;
  }
  return b;
}

test('a typist at the target speed clears every stage, lesson and daily', () => {
  const all = [...STAGES, ...LESSONS, ...[0, 1, 2, 3, 4].map((t) => makeDaily('2026-10-01', t))];
  for (const st of all) {
    const b = play(st, { wpm: st.targetWpm });
    assert.equal(b.status, 'cleared', st.id);
    assert.ok(b.rating() >= 2, `${st.id} rated ${b.rating()}`);
  }
});

test('a typist at two thirds of the target still gets through', () => {
  for (const st of STAGES) assert.equal(play(st, { wpm: st.targetWpm * 0.66 }).status, 'cleared', st.id);
});

test('a slow typist gets through after the pace eases from retries', () => {
  for (const st of STAGES) {
    let fails = 0;
    let b;
    do {
      b = play(st, { wpm: st.targetWpm * 0.5, speedScale: paceFor(st, { fails }), seed: 3 + fails });
      if (b.status === 'failed') fails++;
    } while (b.status !== 'cleared' && fails < 4);
    assert.equal(b.status, 'cleared', `${st.id} after ${fails} fails`);
  }
});

test('gentle stages can never be lost, however slow', () => {
  for (const st of [...STAGES.filter((s) => s.gentle), ...LESSONS]) {
    const b = play(st, { wpm: 1.5, errorRate: 0.3 });
    assert.notEqual(b.status, 'failed', st.id);
    assert.equal(b.hearts, 3);
  }
});
