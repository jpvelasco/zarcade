import test from 'node:test';
import assert from 'node:assert/strict';
import { World, STEP } from '../src/world.js';
import { Autoplayer } from '../src/ai.js';

// One-ball games with the autoplayer: how long the ball lives and which
// table features it reaches. Simulated once, shared by the tests below.
function autoplay(seed, limit = 180) {
  const w = new World({ seed, balls: 1 });
  const ai = new Autoplayer(seed * 13);
  w.startGame();
  let t = 0;
  const seen = new Set();
  while (w.state === 'play' && t < limit) {
    w.step(STEP, ai.controls(w, STEP));
    t += STEP;
    for (const e of w.events) seen.add(e.type === 'callout' ? `callout:${e.kind}` : e.type);
    w.events.length = 0;
  }
  return { w, seen, life: t };
}
const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => autoplay(seed));

test('the autoplayer keeps a ball alive for a good while (attract mode)', () => {
  const lives = runs.map((r) => r.life);
  const mean = lives.reduce((a, b) => a + b, 0) / lives.length;
  assert.ok(mean > 30, `ball times ${lives.map((x) => x.toFixed(0)).join(', ')} s`);
  assert.ok(runs.some((r) => r.w.state !== 'play'), 'and balls do still drain');
});

test('autoplay reaches the main features of the table', () => {
  const seen = new Set();
  for (const r of runs) for (const s of r.seen) seen.add(s);
  for (const need of ['bumper', 'sling', 'target', 'orbit', 'ramp', 'holeIn', 'spin', 'flipHit',
    'callout:frenzy', 'callout:planet', 'callout:lockLit']) {
    assert.ok(seen.has(need), `never saw ${need}`);
  }
});

test('attract mode serves and plays forever without a game running', () => {
  const w = new World({ seed: 4, attract: true });
  const ai = new Autoplayer(4);
  for (let i = 0; i < Math.round(120 / STEP); i++) {
    w.step(STEP, ai.controls(w, STEP));
    w.events.length = 0;
  }
  assert.equal(w.state, 'attract');
  assert.ok(w.balls.length >= 1);
  assert.equal(w.rules.score, 0);
});

test('most drains are not outlane drains (the outlane mouths stay narrow)', () => {
  let drains = 0, outlane = 0;
  for (const seed of [3, 9]) {
    const w = new World({ seed, attract: true });
    const ai = new Autoplayer(seed);
    let t = 0, lastOutlane = -9;
    for (let i = 0; i < Math.round(600 / STEP); i++) {
      w.step(STEP, ai.controls(w, STEP));
      t += STEP;
      for (const e of w.events) {
        if (e.type === 'rollover' && (e.id === 'leftOutlane' || e.id === 'rightOutlane')) lastOutlane = t;
        if (e.type === 'kickback') lastOutlane = -9;
        if (e.type === 'drain') { drains++; if (t - lastOutlane < 3) outlane++; }
      }
      w.events.length = 0;
    }
  }
  assert.ok(drains >= 6, `${drains} drains`);
  assert.ok(outlane / drains < 0.6, `${outlane} of ${drains} drains went down an outlane`);
});
