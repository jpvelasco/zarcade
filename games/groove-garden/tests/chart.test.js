import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, STYLES, DIFFICULTIES } from '../src/songs.js';
import { buildChart, parseChart, peakDensity, pathLanes, SAME_LANE_GAP } from '../src/chart.js';
import { songEvents } from '../src/music.js';
import { songLength } from '../src/timeline.js';

// Most note heads allowed in any 2-second span.
const PEAK_2S = { easy: 5, normal: 8, hard: 14 };
const all = () => SONGS.flatMap((song) => DIFFICULTIES.flatMap((d) => [4, 3].map((lanes) => ({ song, d, lanes, chart: buildChart(song, d, { lanes }) }))));

test('ten or more songs covering every style, each with three charts', () => {
  assert.ok(SONGS.length >= 10);
  const ids = new Set(SONGS.map((s) => s.id));
  assert.equal(ids.size, SONGS.length, 'song ids are unique');
  for (const style of Object.keys(STYLES)) assert.ok(SONGS.some((s) => s.style === style), `a ${style} song`);
  for (const song of SONGS) {
    const len = songLength(song);
    assert.ok(len > 40 && len < 90, `${song.id} is ${len.toFixed(1)} s`);
    for (const d of DIFFICULTIES) assert.ok(parseChart(song, d).length > 20, `${song.id} ${d} has notes`);
  }
});

test('notes are sorted, in range and well formed', () => {
  for (const { song, d, lanes, chart } of all()) {
    const tag = `${song.id} ${d} ${lanes}`;
    let prev = -Infinity;
    for (const n of chart.notes) {
      assert.ok(n.t >= prev, `${tag}: sorted`);
      prev = n.t;
      assert.ok(n.t >= 0 && n.t < chart.length, `${tag}: note at ${n.t} inside the song`);
      assert.ok(Number.isInteger(n.lane) && n.lane >= 0 && n.lane < lanes, `${tag}: lane ${n.lane}`);
      if (n.kind !== 'tap') {
        assert.ok(n.end - n.t >= 0.25, `${tag}: hold at ${n.t.toFixed(2)} long enough to see`);
        assert.ok(n.end <= chart.length, `${tag}: hold ends inside the song`);
      }
      if (n.kind === 'slide') assert.ok(n.slideTo >= 0 && n.slideTo < lanes && n.slideTo !== n.lane, `${tag}: slide target`);
    }
    assert.equal(chart.judgements, chart.notes.length + chart.notes.filter((n) => n.kind !== 'tap').length);
  }
});

test('the four-lane charts are exactly as written: nothing collides', () => {
  for (const song of SONGS) {
    for (const d of DIFFICULTIES) {
      const chart = buildChart(song, d);
      assert.equal(chart.dropped, 0, `${song.id} ${d}`);
      assert.equal(chart.notes.length, parseChart(song, d).length);
    }
  }
});

test('playable density: peaks, chords, lane gaps and kid-sized Easy charts', () => {
  for (const { song, d, lanes, chart } of all()) {
    const tag = `${song.id} ${d} ${lanes}`;
    assert.ok(peakDensity(chart.notes, 2) <= PEAK_2S[d], `${tag}: peak ${peakDensity(chart.notes, 2)} in 2 s`);
    const byTime = new Map();
    for (const n of chart.notes) byTime.set(n.t, (byTime.get(n.t) || 0) + 1);
    assert.ok(Math.max(...byTime.values()) <= 2, `${tag}: at most two notes at once`);
    if (d === 'easy') {
      assert.ok(chart.notes.every((n) => n.kind !== 'slide'), `${tag}: no slides on Easy`);
      assert.equal(Math.max(...byTime.values()), 1, `${tag}: no chords on Easy`);
    }
    // No note starts in a lane that is still busy with an earlier note.
    for (let i = 0; i < chart.notes.length; i++) {
      const a = chart.notes[i];
      for (let j = i + 1; j < chart.notes.length && chart.notes[j].t <= (a.end ?? a.t) + 1; j++) {
        const b = chart.notes[j];
        if (pathLanes(a).some((l) => pathLanes(b).includes(l))) {
          assert.ok(b.t - (a.end ?? a.t) >= SAME_LANE_GAP - 1e-9, `${tag}: lane gap at ${b.t.toFixed(2)}`);
        }
      }
    }
  }
});

test('harder charts have more to play', () => {
  for (const song of SONGS) {
    const [e, n, h] = DIFFICULTIES.map((d) => buildChart(song, d).notes.length);
    assert.ok(e < n && n < h, `${song.id}: ${e} < ${n} < ${h}`);
  }
});

test('every note lands on a sound in the music, nearly all on a strong one', () => {
  for (const song of SONGS) {
    const events = songEvents(song);
    const onsets = new Set(events.map((e) => e.t.toFixed(5)));
    const strong = new Set(events.filter((e) => !['hat', 'open', 'stick'].includes(e.inst)).map((e) => e.t.toFixed(5)));
    for (const d of DIFFICULTIES) {
      const notes = buildChart(song, d).notes;
      for (const n of notes) assert.ok(onsets.has(n.t.toFixed(5)), `${song.id} ${d}: note at ${n.t.toFixed(3)} is on the beat`);
      const onStrong = notes.filter((n) => strong.has(n.t.toFixed(5))).length / notes.length;
      assert.ok(onStrong >= 0.95, `${song.id} ${d}: ${(onStrong * 100).toFixed(0)}% on drums, bass, chords or melody`);
    }
  }
});

test('three lanes fold the middle lanes together and keep the chart valid', () => {
  const song = SONGS[0];
  const four = buildChart(song, 'normal');
  const three = buildChart(song, 'normal', { lanes: 3 });
  assert.ok(three.notes.every((n) => n.lane <= 2));
  assert.ok(three.notes.length >= four.notes.length - 3, 'folding drops only collisions');
  const lanes4 = four.notes.map((n) => n.lane);
  assert.ok(lanes4.includes(1) && lanes4.includes(2));
});

test('practice tempo stretches every note time evenly', () => {
  for (const song of SONGS) {
    const full = buildChart(song, 'normal');
    const slow = buildChart(song, 'normal', { tempoScale: 0.75 });
    full.notes.forEach((n, i) => assert.ok(Math.abs(slow.notes[i].t - n.t / 0.75) < 1e-9));
    assert.ok(Math.abs(slow.length - full.length / 0.75) < 1e-9);
  }
});

test('broken chart text is rejected with a clear message', () => {
  const base = SONGS[0];
  const broken = (chart) => ({ ...base, sections: { ...base.sections, intro: { ...base.sections.intro, chart: { easy: chart } } } });
  assert.throws(() => parseChart(broken('1..'), 'easy'), /tokens/);
  assert.throws(() => parseChart(broken('-...'), 'easy'), /nothing to hold/);
  assert.throws(() => parseChart(broken('5...'), 'easy'), /bad lane/);
  assert.throws(() => parseChart(broken('.~2..'), 'easy'), /slide with nothing/);
});
