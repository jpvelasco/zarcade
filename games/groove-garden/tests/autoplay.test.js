import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, DIFFICULTIES } from '../src/songs.js';
import { buildChart } from '../src/chart.js';
import { Session } from '../src/play.js';
import { simulate, planActions } from '../src/autoplay.js';

const perfectShare = (s) => s.counts.perfect / s.total;

test('the autoplayer plays every chart perfectly when exactly on time', () => {
  for (const song of SONGS) {
    for (const d of DIFFICULTIES) {
      for (const lanes of [4, 3]) {
        const chart = buildChart(song, d, { lanes });
        const s = simulate(Session, chart);
        assert.equal(s.judged, s.total, `${song.id} ${d} ${lanes}: everything judged`);
        assert.equal(s.counts.perfect, s.total, `${song.id} ${d} ${lanes}: all perfect`);
        assert.equal(s.results().grade, 'S');
      }
    }
  }
});

test('with frame-locked input and human wobble it still gets 95%+ Perfects', () => {
  for (const song of SONGS) {
    for (const d of DIFFICULTIES) {
      const chart = buildChart(song, d);
      const sixty = simulate(Session, chart, { fps: 60, quantize: true, jitterMs: 20, seed: 7 });
      assert.ok(perfectShare(sixty) >= 0.95, `${song.id} ${d} @60: ${(perfectShare(sixty) * 100).toFixed(1)}%`);
      assert.equal(sixty.counts.miss, 0, `${song.id} ${d}: no misses`);
      const thirty = simulate(Session, chart, { fps: 30, quantize: true, seed: 3 });
      assert.ok(perfectShare(thirty) >= 0.95, `${song.id} ${d} @30: ${(perfectShare(thirty) * 100).toFixed(1)}%`);
    }
  }
});

test('practice tempo charts autoplay cleanly too', () => {
  for (const song of SONGS) {
    const s = simulate(Session, buildChart(song, 'normal', { tempoScale: 0.75 }), { quantize: true });
    assert.ok(perfectShare(s) >= 0.95, song.id);
  }
});

test('planned actions are sorted and balanced', () => {
  const chart = buildChart(SONGS[1], 'hard');
  const actions = planActions(chart);
  for (let i = 1; i < actions.length; i++) assert.ok(actions[i].t >= actions[i - 1].t);
  const downs = actions.filter((a) => a.down).length;
  assert.equal(downs, actions.length - downs, 'every press is released');
});

test('simulation is repeatable for a seed', () => {
  const chart = buildChart(SONGS[4], 'hard');
  const a = simulate(Session, chart, { quantize: true, jitterMs: 30, seed: 11 });
  const b = simulate(Session, chart, { quantize: true, jitterMs: 30, seed: 11 });
  assert.deepEqual(a.counts, b.counts);
});
