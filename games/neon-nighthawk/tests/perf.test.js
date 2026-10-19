import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameStats, LONG_FRAME_MS, degraded } from '../src/perf.js';

test('frame stats summarise a smooth window and reset', () => {
  const stats = new FrameStats();
  for (let i = 0; i < 120; i++) stats.add(16.7);
  const summary = stats.take();
  assert.equal(summary.fps, 60);
  assert.equal(summary.p95, 17);
  assert.equal(summary.longFrames, 0);
  assert.equal(degraded(summary), false);
  assert.equal(stats.take().frames, 0);
});

test('a hitch or a slow window counts as degraded', () => {
  const hitch = new FrameStats();
  for (let i = 0; i < 100; i++) hitch.add(16.7);
  hitch.add(LONG_FRAME_MS + 400);
  const summary = hitch.take();
  assert.equal(summary.longFrames, 1);
  assert.equal(summary.worst, LONG_FRAME_MS + 400);
  assert.equal(degraded(summary), true);

  const slow = new FrameStats();
  for (let i = 0; i < 100; i++) slow.add(50);
  assert.equal(degraded(slow.take()), true);
});
