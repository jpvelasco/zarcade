import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Autopilot } from '../src/ai.js';
import { STEP } from '../src/config.js';
import { THEMES, dailyInfo } from '../src/daily.js';

function autoplay(opts, distance) {
  const w = new World(opts);
  const pilot = new Autopilot();
  let t = 0;
  while (w.d < distance && w.status === 'running' && t < 1200) {
    w.step(STEP, pilot.controls(w, STEP));
    w.events.length = 0;
    t += STEP;
  }
  return w;
}

test('the autopilot runs 4 km on every theme without a bump', () => {
  for (const theme of THEMES) {
    for (let seed = 1; seed <= 3; seed++) {
      const w = autoplay({ seed, theme: theme.id }, 4000);
      assert.equal(w.stats.hits, 0, `${theme.id}/${seed}: bumped ${w.stats.hits} times by ${Math.round(w.d)} m`);
      assert.ok(w.d >= 4000);
    }
  }
});

test('the autopilot finishes the next few Daily Dash goals', () => {
  for (const key of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']) {
    const info = dailyInfo(key);
    const w = autoplay({ seed: info.seed, theme: info.theme, daily: true }, info.goal);
    assert.equal(w.status, 'running', key);
    assert.ok(w.d >= info.goal);
  }
});

test('a good first run earns enough amber for the first unlock', () => {
  const w = autoplay({ seed: 11 }, 1200);
  assert.ok(w.stats.coins >= 150, `${w.stats.coins} amber`);
  assert.ok(w.stats.logs > 3 && w.stats.pteros > 1, 'it really jumped and rolled');
});
