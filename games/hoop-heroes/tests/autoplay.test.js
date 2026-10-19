import test from 'node:test';
import assert from 'node:assert/strict';
import { Round } from '../src/round.js';
import { Shooter } from '../src/ai.js';
import { RIVALS, rivalRules } from '../src/rivals.js';
import { STEP } from '../src/physics.js';

// The autopilot (all-star) plays head-to-head rounds against the first rivals
// exactly as the game does: two Rounds with the same rules stepped together.
function headToHead(rival, seed) {
  const rules = rivalRules(rival);
  const me = new Round(rules), them = new Round(rules);
  const pilot = new Shooter('allstar', seed), ai = new Shooter(rival.diff, seed * 31 + 7);
  for (let i = 0; i < 120 / STEP && (me.status !== 'done' || them.status !== 'done'); i++) {
    pilot.update(me, STEP); ai.update(them, STEP);
    me.step(STEP); them.step(STEP);
  }
  return { me: me.score, them: them.score, done: me.status === 'done' && them.status === 'done' };
}

test('the autopilot usually beats the park rivals', () => {
  for (const rival of RIVALS.slice(0, 3)) {
    let wins = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const r = headToHead(rival, seed);
      assert.ok(r.done);
      if (r.me > r.them) wins++;
    }
    assert.ok(wins >= 3, `${rival.id}: ${wins}/5`);
  }
});

test('King Leo outscores Bandit at Money Racks (the ladder gets harder)', () => {
  let leo = 0, hops = 0;
  for (let seed = 1; seed <= 4; seed++) {
    leo += headToHead(RIVALS.at(-1), seed).them;
    hops += headToHead(RIVALS[2], seed).them;
  }
  assert.ok(leo > hops);
});
