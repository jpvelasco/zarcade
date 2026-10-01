import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameStats, LONG_FRAME_MS, STALL_MS, degraded, frameMonitor } from '../src/perf.js';

function recorder() {
  const records = [];
  const push = (severity) => (body, attributes) => records.push({ severity, body, attributes });
  return { records, log: { warn: push('WARN'), error: push('ERROR') }, names: () => records.map((r) => r.body) };
}

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

test('monitor logs throttled long frames and a degraded summary, with the snapshot', () => {
  const { records, log, names } = recorder();
  const monitor = frameMonitor({ log, snapshot: () => ({ level: 3 }) });
  let t = 1000;
  monitor.frame(t); // first frame only starts the clock
  for (let i = 0; i < 250; i++) monitor.frame((t += 16)); // past the startup warm-up
  monitor.frame((t += 250));
  monitor.frame((t += 250)); // within 5 s: not logged again
  assert.deepEqual(names(), ['frame.long']);
  assert.equal(records[0].attributes['frame.ms'], 250);
  assert.equal(records[0].attributes.level, 3);
  while (t < 12000) monitor.frame((t += 16));
  assert.deepEqual(names(), ['frame.long', 'perf.degraded']);
  assert.equal(records[1].attributes.longFrames, 2);
});

test('a smooth game logs nothing', () => {
  const { log, names } = recorder();
  const monitor = frameMonitor({ log });
  for (let t = 0; t < 30000; t += 16) {
    monitor.frame(t);
    if (t % 1000 < 16) monitor.check(t);
  }
  assert.deepEqual(names(), []);
});

test('watchdog reports one stall while visible, then a resume', () => {
  const { records, log, names } = recorder();
  const monitor = frameMonitor({ log });
  assert.equal(monitor.check(5000), false, 'no stall before the first frame');
  monitor.frame(0);
  monitor.frame(16);
  assert.equal(monitor.check(16 + STALL_MS), false);
  assert.equal(monitor.check(16 + STALL_MS + 500), true);
  assert.equal(monitor.check(16 + STALL_MS + 1500), false, 'reported once');
  monitor.frame(4016);
  assert.deepEqual(names(), ['frame.stall', 'frame.resumed', 'frame.long']);
  assert.equal(records[0].severity, 'ERROR');
  assert.equal(records[1].attributes['stall.ms'], 4000);
});

test('watchdog stays quiet while hidden, after a crash, and after a visibility reset', () => {
  let visible = false;
  let crashed = false;
  const { log, names } = recorder();
  const monitor = frameMonitor({ log, visible: () => visible, crashed: () => crashed });
  monitor.frame(0);
  monitor.frame(16);
  assert.equal(monitor.check(10000), false, 'hidden');
  visible = true;
  monitor.reset(10000);
  assert.equal(monitor.check(11000), false, 'timer restarted on visibilitychange');
  monitor.reset(11000);
  monitor.frame(11016);
  crashed = true;
  assert.equal(monitor.check(20000), false, 'crashed');
  assert.deepEqual(names(), []);
});

test('slow frames while starting up or loading a scene are tagged, not counted as degraded', () => {
  const { records, log, names } = recorder();
  const monitor = frameMonitor({ log });
  let t = 0;
  monitor.frame(t);
  monitor.frame((t += 1900)); // first render: shader compile, sprite baking
  assert.equal(records[0].attributes.phase, 'startup');
  while (t < 9000) monitor.frame((t += 16));
  monitor.mark(t);
  monitor.frame((t += 400)); // a new level builds
  assert.equal(records.at(-1).attributes.phase, 'loading');
  while (t < 25000) monitor.frame((t += 16));
  assert.deepEqual(names(), ['frame.long', 'frame.long'], 'no perf.degraded for warm-up hitches');
  // After warm-up, the same hitch counts.
  monitor.frame((t += 400));
  assert.equal(records.at(-1).attributes.phase, 'play');
});
