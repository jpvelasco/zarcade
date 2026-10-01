import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STEP } from '../src/game.js';
import { LEVELS } from '../src/levels.js';
import { dailyLevel } from '../src/daily.js';
import { planner, planNow, candidates, Autopilot } from '../src/ai.js';
import { autoplay } from './solver-helper.js';

test('the planner yields one candidate at a time and returns a plan', () => {
  const g = new Game({ mode: 'climb', level: LEVELS[0] });
  const n = candidates(g).length;
  assert.ok(n > 10);
  const it = planner(g);
  let steps = 0, r = it.next();
  while (!r.done) { steps++; r = it.next(); }
  assert.ok(steps >= n);
  assert.ok(Number.isFinite(r.value.dx) && Number.isFinite(r.value.angle));
});

test('planning does not touch the real game', () => {
  const g = new Game({ mode: 'climb', level: LEVELS[2] });
  g.drop();
  for (let i = 0; i < 120; i++) g.step(STEP, {});
  const before = JSON.stringify(g.blocks.map((b) => [b.x, b.y, b.angle]));
  const t = g.time, used = g.used;
  planNow(g);
  assert.equal(JSON.stringify(g.blocks.map((b) => [b.x, b.y, b.angle])), before);
  assert.equal(g.time, t);
  assert.equal(g.used, used);
});

test('the browser autopilot steers the crane smoothly and drops', () => {
  const g = new Game({ mode: 'climb', level: LEVELS[0] });
  const ap = new Autopilot({ budget: 8, pause: 0.2 });
  let drops = 0;
  for (let i = 0; i < 60 * 40 && g.phase !== 'won'; i++) {
    const c = ap.controls(g, STEP);
    if (c.drop) drops++;
    g.step(STEP, c);
    g.events.length = 0;
  }
  assert.ok(drops >= 2);
  assert.equal(g.phase, 'won');
});

for (const key of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']) {
  test(`autoplayer clears the Daily Tower for ${key}`, () => {
    const g = autoplay(dailyLevel(key), 'daily');
    assert.equal(g.phase, 'won', JSON.stringify(g.result));
  });
}
