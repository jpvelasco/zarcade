import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, STYLES } from '../src/songs.js';
import { songEvents, Scheduler, INSTRUMENTS } from '../src/music.js';
import { beatToTime, swingBeat, layout } from '../src/timeline.js';
import { parseChord, degreeToMidi, pitchClass, midiToHz } from '../src/theory.js';

test('theory helpers read notes, chords and scale degrees', () => {
  assert.equal(pitchClass('C'), 0);
  assert.equal(pitchClass('F#'), 6);
  assert.equal(pitchClass('Bb'), 10);
  assert.deepEqual(parseChord('Am7'), { root: 9, intervals: [0, 3, 7, 10] });
  assert.deepEqual(parseChord('Fmaj7').intervals, [0, 4, 7, 11]);
  assert.throws(() => parseChord('H7'));
  assert.equal(degreeToMidi('1', 60), 60);
  assert.equal(degreeToMidi('5', 60), 67);
  assert.equal(degreeToMidi("1'", 60), 72);
  assert.equal(degreeToMidi('6,', 60), 57);
  assert.equal(degreeToMidi('3', 60, 'minor'), 63);
  assert.equal(degreeToMidi('#7', 69, 'minor'), 80);
  assert.equal(midiToHz(69), 440);
});

test('songEvents is deterministic and sorted', () => {
  for (const song of SONGS) {
    const a = songEvents(song);
    const b = songEvents(song);
    assert.deepEqual(a, b, song.id);
    for (let i = 1; i < a.length; i++) assert.ok(a[i].t >= a[i - 1].t, `${song.id} sorted`);
  }
});

test('every song has drums, bass, chords and a melody, and a one-bar count-in', () => {
  for (const song of SONGS) {
    const events = songEvents(song);
    const kinds = new Set(events.map((e) => e.inst));
    for (const k of ['kick', 'bass', 'chord', 'lead', 'stick']) assert.ok(kinds.has(k), `${song.id} has ${k}`);
    for (const e of events) assert.ok(INSTRUMENTS.includes(e.inst));
    const sticks = events.filter((e) => e.inst === 'stick');
    assert.equal(sticks.length, STYLES[song.style].beats);
    assert.ok(sticks.every((e) => e.t < 0));
    assert.ok(events.filter((e) => e.inst !== 'stick').every((e) => e.t >= 0));
    for (const e of events.filter((ev) => ev.inst === 'lead')) assert.ok(e.midi >= 52 && e.midi <= 96, `${song.id} lead in range`);
    for (const e of events.filter((ev) => ev.inst === 'bass')) assert.ok(e.midi >= 36 && e.midi <= 64, `${song.id} bass in range`);
    const last = events[events.length - 1];
    assert.ok(last.t < beatToTime(song, layout(song).beats));
  }
});

test('the scheduler hands out the same event times however it is pumped', () => {
  const song = SONGS[1];
  const events = songEvents(song);
  const start = 12.345;
  const pump = (stepFor) => {
    const s = new Scheduler(events, start);
    const out = [];
    let now = start - 3;
    let i = 0;
    while (!s.done) {
      now += stepFor(i++);
      out.push(...s.due(now + 0.12));
    }
    return out;
  };
  const steady = pump(() => 0.025);
  const jittery = pump((i) => [0.004, 0.09, 0.016, 0.2, 0.033][i % 5]);
  assert.equal(steady.length, events.length);
  assert.deepEqual(steady.map((e) => e.time), jittery.map((e) => e.time));
  steady.forEach((e, i) => assert.equal(e.time, start + events[i].t));
});

test('scheduling never hands out an event early or twice', () => {
  const events = songEvents(SONGS[0]);
  const s = new Scheduler(events, 100);
  const first = s.due(100.5);
  assert.ok(first.every((e) => e.time <= 100.5));
  assert.equal(s.due(100.5).length, 0);
  const rest = s.due(1e9);
  assert.equal(first.length + rest.length, events.length);
});

test('swing moves off-beats later but never the downbeats', () => {
  assert.equal(swingBeat(3, 0.1), 3);
  assert.ok(Math.abs(swingBeat(2.5, 0.1) - 2.6) < 1e-12);
  assert.equal(swingBeat(2.5, 0), 2.5);
  const lofi = SONGS.find((s) => s.style === 'lofi');
  assert.equal(beatToTime(lofi, 4), 4 * 60 / lofi.bpm);
  assert.ok(beatToTime(lofi, 4.5) > 4.5 * 60 / lofi.bpm);
});

test('practice tempo slows every event by the same factor', () => {
  const song = SONGS[2];
  const full = songEvents(song);
  const slow = songEvents(song, { tempoScale: 0.5 });
  full.forEach((e, i) => assert.ok(Math.abs(slow[i].t - e.t * 2) < 1e-9));
});
