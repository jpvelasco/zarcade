// The autoplayer is the balance check: from a fresh save it reaches the
// Ancient Core with fair pacing, and it clears the daily dig.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, dailyConfig } from '../src/game.js';
import { newSave } from '../src/progress.js';
import { runBot } from '../src/bot.js';
import { LAYERS } from '../src/data.js';

for (const seed of ['meadow-1', 'meadow-2']) {
  test(`the autoplayer digs from the meadow to the core (${seed})`, () => {
    const save = newSave(seed);
    const s = new Session(save);
    const tl = runBot(s, { maxTime: 60 * 60, until: (ss) => ss.save.core });
    assert.ok(save.core, `core reached (best ${save.bestDepth} m, ${JSON.stringify(save.upgrades)})`);
    // Pacing: a real journey, not a sprint and not a grind.
    const minutes = tl.coreAt / 60;
    assert.ok(minutes > 12 && minutes < 45, `core after ${minutes.toFixed(1)} min`);
    assert.ok(tl.trips >= 8, `${tl.trips} trips`);
    // Every layer is visited, in order, each taking a few minutes at most.
    for (let li = 1; li < LAYERS.length; li++) {
      assert.ok(tl.layers[li] > tl.layers[li - 1], `${LAYERS[li].id} after ${LAYERS[li - 1].id}`);
      assert.ok(tl.layers[li] - tl.layers[li - 1] < 12 * 60, `${LAYERS[li].id} took too long`);
    }
    assert.ok(Object.keys(save.museum).length >= 8, 'found museum pieces along the way');
  });
}

test('the autoplayer clears daily digs with the loaner pod', () => {
  let wins = 0;
  for (let d = 1; d <= 8; d++) {
    const daily = dailyConfig(`2026-11-${String(d).padStart(2, '0')}`);
    const s = new Session(newSave(), { kind: 'daily', daily });
    runBot(s, { maxTime: 300 });
    assert.ok(s.result, 'the dig ends');
    if (s.result.success) wins++;
  }
  assert.ok(wins >= 7, `${wins}/8 daily digs cleared`);
});
