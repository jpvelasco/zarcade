import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, MAX_LEVEL, MissionRun, missionSet, missionView, defaultMissions, sanitizeMissions, multiplierOf, target } from '../src/missions.js';
import { newStats, World } from '../src/world.js';

test('every level has three distinct missions with sensible targets', () => {
  for (let level = 1; level <= MAX_LEVEL + 1; level++) {
    const set = missionSet(level);
    assert.equal(set.length, 3);
    assert.equal(new Set(set.map((m) => m.kind)).size, 3);
    assert.equal(new Set(set.map((m) => KINDS[m.kind].stat)).size, 3, 'no two missions track the same stat');
    assert.ok(set.filter((m) => KINDS[m.kind].scope === 'total').length <= 2);
    for (const m of set) {
      assert.ok(Number.isInteger(m.target) && m.target >= 1);
      assert.ok(level >= (KINDS[m.kind].minLevel || 1));
    }
    assert.deepEqual(missionSet(level), set, 'deterministic');
  }
});

test('targets grow with level but stay within a run\'s reach', () => {
  assert.ok(target('distRun', 10) > target('distRun', 1));
  assert.ok(target('distRun', 30) <= 6000);
  assert.ok(target('coinsRun', 1) <= 60);
  assert.equal(target('dailyTotal', 20), 1);
});

test('run missions complete mid-run; finishing the set raises the multiplier', () => {
  const state = defaultMissions();
  const run = new MissionRun(state);
  const stats = newStats();
  run.start(stats);
  assert.equal(multiplierOf(state), 1);
  for (const m of run.set) {
    const k = KINDS[m.kind];
    stats[k.stat] = m.target; // pretend we did them all
  }
  const { completed, levelUp } = run.check(stats);
  assert.equal(completed.length, 3);
  assert.ok(completed[0].text.length > 5);
  assert.equal(levelUp.level, 2);
  assert.equal(levelUp.multiplier, 2);
  assert.ok(levelUp.reward > 0);
  assert.equal(state.level, 2);
  assert.deepEqual(state.done, [false, false, false]);
  // The new set counts from now, not from the start of the run.
  const again = run.check(stats);
  assert.equal(again.completed.length, 0);
});

test('lifetime missions add up across runs; run missions keep the best', () => {
  const state = defaultMissions();
  state.level = 4;
  const set = missionSet(4);
  const i = set.findIndex((m) => KINDS[m.kind].scope === 'total');
  assert.ok(i >= 0, 'level 4 has a lifetime mission');
  const stat = KINDS[set[i].kind].stat;
  const half = Math.max(1, Math.floor(set[i].target / 2));
  for (let r = 0; r < 2; r++) {
    const run = new MissionRun(state);
    const stats = newStats();
    run.start(stats);
    stats[stat] = half;
    if (stat === 'runs') stats.runs = 1;
    run.check(stats);
    run.commit(stats);
  }
  if (half * 2 >= set[i].target) assert.equal(state.done[i] || state.level > 4, true);
  else assert.equal(state.progress[i], half * 2);
});

test('mission views show progress capped at the target', () => {
  const state = defaultMissions();
  state.progress = [1e6, 0, 0];
  const v = missionView(state);
  assert.equal(v.length, 3);
  assert.equal(v[0].value, v[0].target);
});

test('corrupt mission saves fall back to defaults', () => {
  assert.deepEqual(sanitizeMissions(null), defaultMissions());
  const m = sanitizeMissions({ level: 'x', progress: [NaN, -5, 3], done: [1, true, 'yes'] });
  assert.equal(m.level, 1);
  assert.deepEqual(m.progress, [0, 0, 3]);
  assert.deepEqual(m.done, [false, true, false]);
  assert.equal(sanitizeMissions({ level: 999 }).level, MAX_LEVEL + 1);
});

test('playing a Daily Dash completes the "Play a Daily Dash" mission', () => {
  const level = [...Array(MAX_LEVEL).keys()].map((i) => i + 1).find((l) => missionSet(l).some((m) => m.kind === 'dailyTotal'));
  assert.ok(level, 'some level asks for a Daily Dash');
  const state = { ...defaultMissions(), level };
  const i = missionSet(level).findIndex((m) => m.kind === 'dailyTotal');
  const world = new World({ seed: 3, daily: true });
  const run = new MissionRun(state); // same order as main.js startRun / endRun
  run.start(world.stats);
  world.finish();
  run.check(world.stats);
  assert.equal(state.done[i], true);
  // A regular run does not count.
  const other = { ...defaultMissions(), level };
  const plain = new World({ seed: 3 });
  const run2 = new MissionRun(other);
  run2.start(plain.stats);
  plain.finish();
  run2.check(plain.stats);
  assert.equal(other.done[i], false);
});
