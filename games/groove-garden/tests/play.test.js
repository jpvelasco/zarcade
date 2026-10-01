import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/play.js';
import { WINDOWS, REGRAB } from '../src/timing.js';
import { accuracy, gradeFor, finalScore, emptyCounts, MAX_SCORE, betterGrade } from '../src/score.js';

// A hand-made chart: taps at 1 s and 2 s (lanes 0, 1), a hold 3-4 s in
// lane 2, and a slide 5-6 s from lane 0 to lane 2.
function chart() {
  const notes = [
    { t: 1, lane: 0, end: null, slideTo: null, kind: 'tap' },
    { t: 2, lane: 1, end: null, slideTo: null, kind: 'tap' },
    { t: 3, lane: 2, end: 4, slideTo: null, kind: 'hold' },
    { t: 5, lane: 0, end: 6, slideTo: 2, kind: 'slide' },
  ].map((n, id) => ({ ...n, id }));
  return { notes, lanes: 4, length: 7, judgements: 6 };
}

test('accuracy, grades and score', () => {
  const c = emptyCounts();
  assert.equal(accuracy(c), 1);
  c.perfect = 9; c.miss = 1;
  assert.equal(accuracy(c), 0.9);
  assert.equal(gradeFor(0.95), 'S');
  assert.equal(gradeFor(0.949), 'A');
  assert.equal(gradeFor(0.85), 'A');
  assert.equal(gradeFor(0.7), 'B');
  assert.equal(gradeFor(0.2), 'C');
  assert.equal(finalScore({ perfect: 10, great: 0, good: 0, miss: 0 }, 10, 10), MAX_SCORE);
  assert.equal(finalScore({ perfect: 0, great: 0, good: 0, miss: 10 }, 0, 10), 0);
  assert.ok(finalScore({ perfect: 9, great: 0, good: 0, miss: 1 }, 9, 10) > finalScore({ perfect: 9, great: 0, good: 0, miss: 1 }, 5, 10));
  assert.equal(betterGrade('A', 'S'), 'S');
  assert.equal(betterGrade('B', 'C'), 'B');
});

test('a tap is judged by how close it lands', () => {
  const s = new Session(chart());
  assert.equal(s.press(0, 1.03), 'perfect');
  assert.equal(s.press(1, 2 - (WINDOWS.great - 0.005)), 'great');
  assert.equal(s.counts.perfect, 1);
  assert.equal(s.counts.great, 1);
  assert.equal(s.combo, 2);
});

test('presses with no note nearby cost nothing', () => {
  const s = new Session(chart());
  assert.equal(s.press(3, 1), null);
  assert.equal(s.press(0, 0.5), null);
  assert.equal(s.judged, 0);
  assert.equal(s.combo, 0);
  assert.equal(s.press(0, 1), 'perfect');
});

test('a note left alone becomes a miss once its window has passed, and resets the combo', () => {
  const s = new Session(chart());
  s.press(0, 1);
  s.release(0, 1.05);
  s.update(2 + WINDOWS.good - 0.001);
  assert.equal(s.counts.miss, 0);
  s.update(2 + WINDOWS.good + 0.001);
  assert.equal(s.counts.miss, 1);
  assert.equal(s.combo, 0);
  assert.equal(s.maxCombo, 1);
  assert.ok(s.events.some((e) => e.type === 'hit' && e.judgement === 'miss' && e.lane === 1));
});

test('a hold held to the end scores its head and its tail', () => {
  const s = new Session(chart());
  s.press(2, 3.01);
  s.update(3.5);
  assert.ok(s.holding(s.notes[2]));
  s.update(4.0);
  assert.equal(s.notes[2].tail, 'perfect');
  assert.equal(s.counts.perfect, 2);
});

test('letting go of a hold just before its end still counts', () => {
  const s = new Session(chart());
  s.press(2, 3);
  s.release(2, 3.9);
  assert.equal(s.notes[2].tail, 'perfect');
});

test('letting go early breaks the hold, but a quick re-grab saves it', () => {
  const broken = new Session(chart());
  broken.press(2, 3);
  broken.release(2, 3.3);
  broken.update(3.3 + REGRAB + 0.01);
  assert.equal(broken.notes[2].tail, 'miss');
  assert.equal(broken.combo, 0);

  const saved = new Session(chart());
  saved.press(2, 3);
  saved.release(2, 3.3);
  saved.update(3.35);
  saved.press(2, 3.3 + REGRAB - 0.02);
  saved.update(4);
  assert.equal(saved.notes[2].tail, 'perfect');
});

test('a slide needs the finger on the target lane at the end', () => {
  const s = new Session(chart());
  s.press(0, 5);
  s.press(1, 5.4);
  s.release(0, 5.41);
  s.press(2, 5.8);
  s.release(1, 5.81);
  s.update(6);
  assert.equal(s.notes[3].tail, 'perfect');

  const lazy = new Session(chart());
  lazy.press(0, 5);
  lazy.update(6);
  assert.equal(lazy.notes[3].tail, 'good', 'never moving still scores, just less');
});

test('a missed hold head also misses its tail', () => {
  const s = new Session(chart());
  s.update(3 + WINDOWS.good + 0.01);
  assert.equal(s.notes[2].head, 'miss');
  assert.equal(s.notes[2].tail, 'miss');
  assert.equal(s.counts.miss, 4); // two taps + hold head + tail
});

test('no-fail keeps going; without it the garden can wilt', () => {
  const many = { notes: Array.from({ length: 40 }, (_, i) => ({ id: i, t: 1 + i * 0.5, lane: i % 4, end: null, slideTo: null, kind: 'tap' })), lanes: 4, length: 25, judgements: 40 };
  const kind = new Session(many, { noFail: true });
  kind.update(30);
  assert.equal(kind.failed, false);
  assert.equal(kind.finished, true);
  assert.equal(kind.results().grade, 'C');

  const strict = new Session(many, { noFail: false });
  strict.update(30);
  assert.equal(strict.failed, true);
  assert.ok(strict.events.some((e) => e.type === 'fail'));
  assert.equal(strict.results().failed, true);
});

test('results report a full combo and all perfects', () => {
  const s = new Session(chart());
  s.press(0, 1); s.release(0, 1.05);
  s.press(1, 2); s.release(1, 2.05);
  s.press(2, 3); s.update(4); s.release(2, 4.02);
  s.press(0, 5); s.press(2, 5.9); s.release(0, 5.91); s.update(6);
  const r = s.results();
  assert.equal(r.fullCombo, true);
  assert.equal(r.allPerfect, true);
  assert.equal(r.grade, 'S');
  assert.equal(r.score, MAX_SCORE);
  assert.equal(r.maxCombo, 6);
});
