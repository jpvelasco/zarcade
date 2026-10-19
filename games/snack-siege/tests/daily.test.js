import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyLevel } from '../src/levels.js';
import { Game } from '../src/game.js';
import { playLevel, bestShot, simulateShot } from '../src/ai.js';
import { MAX_SPEED } from '../src/config.js';
import { dateKey } from '../src/rng.js';

// A daily fort the autoplayer clears can be beaten: the simulation is
// deterministic, so the shots it finds win the same way for a player.

// Play with an unsteady hand. Each turn the autoplayer picks its shot, which
// then flies `deg` degrees off, with `pct` per cent more power and the power
// tapped `ticks` late.
function playOff(level, deg, pct, ticks) {
  let g = new Game(level);
  while (g.state === 'aim') {
    const best = bestShot(g);
    if (!best) break;
    const { vx, vy, powerTick } = best.shot;
    const a = Math.atan2(vy, vx) + (deg * Math.PI) / 180;
    const speed = Math.min(MAX_SPEED, Math.hypot(vx, vy) * (1 + pct / 100));
    g = simulateShot(g, { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, powerTick: powerTick < 0 ? -1 : Math.max(1, powerTick + ticks) });
  }
  return g;
}

test('the 2026-12-04 daily fort can be cleared, even with unsteady aim', () => {
  // The first daily generator put a bear here beyond any full-power shot,
  // with no Mint Rocket to reach it.
  const lv = dailyLevel('2026-12-04');
  const g = playLevel(new Game(lv));
  assert.equal(g.state, 'won', `${g.bearsLeft} bears left`);
  for (const [deg, pct, ticks] of [[1, 3, 3], [-1, -3, -3], [1, -3, -3], [-1, 3, 3]]) {
    const off = playOff(lv, deg, pct, ticks);
    assert.equal(off.state, 'won', `${deg}° off, ${pct}% power, tapped ${ticks} ticks late: ${off.bearsLeft} bears left`);
  }
});

test('the autoplayer clears the 2027-05-14 daily fort', () => {
  // Lime Bouncers and Mint Rockets only. The autoplayer used to fire every hop
  // and boost, which carried the bean off its aim, so it lost a fort that one
  // plain fling clears.
  const g = playLevel(new Game(dailyLevel('2027-05-14')));
  assert.equal(g.state, 'won', `${g.bearsLeft} bears left`);
});

test('the autoplayer clears every daily fort sampled from fifteen months', () => {
  // Every fifth day from 2026-10-01 to 2027-12-31. All 457 days of that range
  // clear too, but checking each one takes too long for every test run.
  const failed = [];
  let checked = 0;
  for (const day = new Date(2026, 9, 1, 12); day <= new Date(2027, 11, 31, 12); day.setDate(day.getDate() + 5)) {
    const key = dateKey(day);
    const g = playLevel(new Game(dailyLevel(key)), { quick: true });
    if (g.state !== 'won') failed.push(`${key}: ${g.bearsLeft} bears left`);
    checked++;
  }
  assert.equal(checked, 92);
  assert.deepEqual(failed, []);
});
