import test from 'node:test';
import assert from 'node:assert/strict';
import { WINDOWS, judgeDelta, audioTimeAt, heardSongTime, judgedTime, displayTime, estimateOffset, clampOffset, OFFSET_LIMIT_MS } from '../src/timing.js';

test('judgement windows are symmetric and forgiving', () => {
  assert.equal(judgeDelta(0), 'perfect');
  assert.equal(judgeDelta(WINDOWS.perfect), 'perfect');
  assert.equal(judgeDelta(-WINDOWS.perfect), 'perfect');
  assert.equal(judgeDelta(WINDOWS.perfect + 0.001), 'great');
  assert.equal(judgeDelta(-WINDOWS.great), 'great');
  assert.equal(judgeDelta(WINDOWS.great + 0.001), 'good');
  assert.equal(judgeDelta(-WINDOWS.good), 'good');
  assert.equal(judgeDelta(WINDOWS.good + 0.001), null);
  assert.ok(WINDOWS.perfect >= 0.05 && WINDOWS.good >= 0.13, 'kid-friendly widths');
});

test('the audio clock is interpolated from an output timestamp', () => {
  const stamp = { contextTime: 10, performanceTime: 5000 };
  assert.equal(audioTimeAt(5000, stamp), 10);
  assert.equal(audioTimeAt(5250, stamp), 10.25);
  assert.equal(audioTimeAt(4900, stamp), 9.9);
});

test('latency offsets shift judging and drawing in opposite, predictable ways', () => {
  const heard = heardSongTime(20.5, 18, 0.03);
  assert.ok(Math.abs(heard - 2.47) < 1e-12);
  // A player who taps 40 ms late on a beat at 2.43 is judged right on it.
  assert.ok(Math.abs(judgedTime(2.47, 40) - 2.43) < 1e-12);
  assert.equal(judgedTime(2.47, 0), 2.47);
  assert.ok(Math.abs(displayTime(2.47, 25) - 2.495) < 1e-12);
  assert.ok(Math.abs(displayTime(2.47, -25) - 2.445) < 1e-12);
});

test('offsets are clamped whole milliseconds', () => {
  assert.equal(clampOffset(12.6), 13);
  assert.equal(clampOffset(9999), OFFSET_LIMIT_MS);
  assert.equal(clampOffset(-9999), -OFFSET_LIMIT_MS);
  assert.equal(clampOffset('nope'), 0);
});

test('calibration finds a steady lateness despite wobble and a stray tap', () => {
  const beats = Array.from({ length: 12 }, (_, i) => 1 + i * 0.6);
  const wobble = [0.01, -0.012, 0.005, 0.0, -0.006, 0.011, -0.003, 0.008, -0.01, 0.002];
  const taps = beats.slice(2).map((b, i) => b + 0.07 + wobble[i]);
  taps.push(beats[5] + 0.25); // a stray tap between beats is ignored
  const est = estimateOffset(taps, beats);
  assert.ok(Math.abs(est.offsetMs - 70) <= 4, `got ${est.offsetMs}`);
  assert.equal(est.taps, 10);
  assert.ok(est.spreadMs <= 12);
  const early = estimateOffset(beats.map((b) => b - 0.03), beats);
  assert.equal(early.offsetMs, -30);
});

test('calibration waits for enough taps', () => {
  const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3];
  assert.equal(estimateOffset([0.02, 0.52, 1.02], beats), null);
  assert.equal(estimateOffset([], [1]), null);
});
