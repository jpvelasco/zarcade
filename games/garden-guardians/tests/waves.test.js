import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../src/maps.js';
import { BUGS } from '../src/data.js';
import { buildWaves, waveSpawns, describeWave, waveCounts } from '../src/waves.js';
import { Game, STEP } from '../src/game.js';

test('every map has 12–20 waves ending in a boss', () => {
  MAPS.forEach((m, i) => {
    const waves = buildWaves(i);
    assert.equal(waves.length, m.waves);
    const last = waves.at(-1);
    assert.ok(last.boss);
    assert.ok(last.groups.some((g) => BUGS[g.type].boss), m.id);
    for (const w of waves.slice(0, -1)) assert.ok(!w.groups.some((g) => BUGS[g.type].boss));
  });
});

test('waves are deterministic and only use the roster so far', () => {
  assert.deepEqual(buildWaves(3), buildWaves(3));
  MAPS.forEach((m, i) => {
    for (const w of buildWaves(i)) {
      for (const g of w.groups) {
        if (BUGS[g.type].boss) continue;
        assert.ok(m.roster[g.type] <= w.number, `${m.id} wave ${w.number} uses ${g.type} early`);
      }
    }
  });
});

test('waves grow tougher over a map', () => {
  const waves = buildWaves(2);
  const hp = (w) => Object.entries(waveCounts(w)).reduce((s, [t, n]) => s + BUGS[t].hp * n, 0) * w.hpMul;
  assert.ok(hp(waves[waves.length - 2]) > hp(waves[0]) * 4);
});

test('wave preview reads like "12 ants · 3 beetles"', () => {
  const w = { groups: [{ type: 'ant', count: 12 }, { type: 'beetle', count: 3 }, { type: 'ant', count: 2 }] };
  assert.equal(describeWave(w), '14 ants · 3 beetles');
  assert.match(describeWave(buildWaves(0).at(-1)), /^BOSS Giant Raccoon/);
  assert.equal(describeWave({ groups: [{ type: 'snail', count: 1 }] }), '1 snail');
});

test('spawns are ordered in time and alternate between spawn points', () => {
  const wave = buildWaves(3)[4];
  const spawns = waveSpawns(wave, 2);
  const total = wave.groups.reduce((s, g) => s + g.count, 0);
  assert.equal(spawns.length, total);
  for (let i = 1; i < spawns.length; i++) assert.ok(spawns[i].t >= spawns[i - 1].t);
  assert.deepEqual(new Set(spawns.map((s) => s.spawn)), new Set([0, 1]));
});

test('a started wave spawns all its bugs into the garden', () => {
  const g = new Game(0);
  g.startWave();
  const n = waveSpawns(g.waves[0]).length;
  let seen;
  for (let i = 0; i < 60 * 30 && g.pending.length; i++) g.step(STEP);
  assert.equal(g.wave, 1);
  seen = g.stats.shooed + g.stats.leaked + g.bugs.length;
  assert.equal(seen, n);
  assert.ok(g.events.some((e) => e.type === 'newBug' && e.bug === 'ant'));
});

test('the simulation is deterministic', () => {
  const run = () => {
    const g = new Game(1, { recordEvents: false });
    g.build('pea', 2, 3); g.build('sunflower', 7, 2);
    g.startWave();
    for (let i = 0; i < 60 * 90; i++) g.step();
    return [g.coins, g.baskets, g.wave, g.stats.shooed, g.bugs.map((b) => b.dist.toFixed(6)).join()];
  };
  assert.deepEqual(run(), run());
});
