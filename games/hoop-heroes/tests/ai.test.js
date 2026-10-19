import test from 'node:test';
import assert from 'node:assert/strict';
import { idealShot, simulate, outcome, ELEV } from '../src/shots.js';
import { DIFFICULTY, aiShot, Shooter } from '../src/ai.js';
import { rng } from '../src/rng.js';
import { Round } from '../src/round.js';
import { timedRules } from '../src/modes.js';

function makeRate(diffId, { moving = false, g = 9.8, ease = 1, n = 300, seed = 7 } = {}) {
  const r = rng(seed);
  let made = 0;
  for (let i = 0; i < n; i++) {
    const d = r.range(4.2, 5.8), a = r.range(-1.1, 1.1);
    const setup = { p0: { x: d * Math.sin(a), y: 2.1, z: -d * Math.cos(a) }, g, hoop: { x: 0, y: 3.05, z: 0, motion: moving ? { ax: 0.9, wx: 1.1 } : null }, time: r.range(0, 20), kind: 'normal', elev: ELEV.normal };
    const ideal = idealShot(setup, { lead: true });
    if (outcome(simulate(setup, aiShot(ideal, DIFFICULTY[diffId], r, ease)).ball).made) made++;
  }
  return made / n;
}

const BANDS = { rookie: [0.33, 0.55], pro: [0.48, 0.68], allstar: [0.6, 0.8], champion: [0.72, 0.92] };

for (const [id, [lo, hi]] of Object.entries(BANDS)) {
  test(`${id} rivals make ${Math.round(lo * 100)}–${Math.round(hi * 100)}% of their shots`, () => {
    for (const opts of [{}, { moving: true }, { g: 4 }]) {
      const rate = makeRate(id, opts);
      assert.ok(rate >= lo && rate <= hi, `${id} ${JSON.stringify(opts)}: ${(rate * 100).toFixed(0)}%`);
    }
  });
}

test('harder rivals are more accurate, and easing a rival makes it sloppier', () => {
  const rates = ['rookie', 'pro', 'allstar', 'champion'].map((d) => makeRate(d, { n: 200 }));
  for (let i = 1; i < rates.length; i++) assert.ok(rates[i] > rates[i - 1], rates.join(' '));
  assert.ok(makeRate('champion', { ease: 1.36, n: 200 }) < rates[3]);
});

test('a rival plays a whole timed round deterministically', () => {
  const play = () => {
    const round = new Round(timedRules('park', 45), { countdown: false });
    const shooter = new Shooter('pro', 99);
    round.run(60, (r) => shooter.update(r, 1 / 240));
    return [round.score, round.stats.shots, round.stats.makes];
  };
  const a = play(), b = play();
  assert.deepEqual(a, b);
  assert.ok(a[1] >= 22 && a[1] <= 40, `shots ${a[1]}`);
});
