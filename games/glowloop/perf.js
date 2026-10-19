// Frame-time bookkeeping for performance telemetry. DOM-free so Node tests can
// feed it synthetic frames. Loaded as a classic script (window.GlowPerf) and
// with require() in tests.
(function (root) {
  'use strict';

  const LONG_FRAME_MS = 100;
  const STALL_MS = 1500;
  const SUMMARY_MS = 10000;
  const LONG_FRAME_LOG_GAP_MS = 5000;
  // Frames this soon after load or a scene change are expected to be slow
  // (shader compiles, sprite baking). They are logged, tagged by phase, but
  // kept out of the steady-state summary.
  const WARMUP_MS = 3000;

  class FrameStats {
    constructor(window = 240) {
      this.window = window;
      this.samples = [];
      this.longFrames = 0;
      this.worst = 0;
    }

    add(ms) {
      this.samples.push(ms);
      if (this.samples.length > this.window) this.samples.shift();
      if (ms >= LONG_FRAME_MS) this.longFrames++;
      this.worst = Math.max(this.worst, ms);
    }

    // Summary of the recent window, then start counting afresh.
    take() {
      const sorted = this.samples.slice().sort((a, b) => a - b);
      const count = sorted.length;
      const mean = count ? sorted.reduce((sum, ms) => sum + ms, 0) / count : 0;
      const summary = {
        frames: count,
        fps: mean ? Math.round(1000 / mean) : 0,
        p50: count ? Math.round(sorted[Math.floor(count * 0.5)]) : 0,
        p95: count ? Math.round(sorted[Math.min(count - 1, Math.floor(count * 0.95))]) : 0,
        worst: Math.round(this.worst),
        longFrames: this.longFrames,
      };
      this.samples.length = 0;
      this.longFrames = 0;
      this.worst = 0;
      return summary;
    }
  }

  // True when a summary shows the game struggling enough to be worth a report.
  function degraded(summary) {
    return summary.frames > 30 && (summary.p95 > 40 || summary.longFrames > 0);
  }

  // Frame telemetry for one game loop. The page supplies the clock, its
  // visibility and the crash flag, so this stays DOM-free:
  //   frame(now)  from every animation frame: frame.long (throttled) and a
  //               perf.degraded summary every 10 s when play is struggling;
  //   check(now)  from a setInterval watchdog outside the loop: frame.stall
  //               (once) when frames stop while visible, frame.resumed after;
  //   reset(now)  on visibilitychange: hidden tabs pause frames, not a stall.
  function frameMonitor({ log, snapshot = () => ({}), visible = () => true, crashed = () => false }) {
    const stats = new FrameStats();
    let lastFrameAt = null;
    let statsAt = 0;
    let lastLongLog = -Infinity;
    let stalled = false;
    let warmFrom = null;
    let warmPhase = 'startup';

    return {
      frame(now) {
        if (lastFrameAt === null) {
          // The first frame only starts the clock: loading time is not a frame.
          lastFrameAt = now;
          statsAt = now;
          warmFrom = now;
          return;
        }
        const elapsed = now - lastFrameAt;
        if (stalled) {
          stalled = false;
          log.warn('frame.resumed', { 'stall.ms': Math.round(elapsed), ...snapshot() });
        }
        lastFrameAt = now;
        if (!visible()) return;
        const phase = now - warmFrom < WARMUP_MS ? warmPhase : 'play';
        if (phase === 'play') stats.add(elapsed);
        if (elapsed >= LONG_FRAME_MS && now - lastLongLog > LONG_FRAME_LOG_GAP_MS) {
          lastLongLog = now;
          log.warn('frame.long', { 'frame.ms': Math.round(elapsed), phase, ...snapshot() });
        }
        if (now - statsAt >= SUMMARY_MS) {
          statsAt = now;
          const summary = stats.take();
          if (degraded(summary)) log.warn('perf.degraded', { ...summary, ...snapshot() });
        }
      },
      check(now) {
        if (lastFrameAt === null || stalled || !visible() || crashed()) return false;
        const gap = now - lastFrameAt;
        if (gap <= STALL_MS) return false;
        stalled = true;
        log.error('frame.stall', { 'stall.ms': Math.round(gap), ...snapshot() });
        return true;
      },
      // A new scene is loading (a track, a level): its first frames may be slow.
      mark(now, phase = 'loading') {
        warmFrom = now;
        warmPhase = phase;
      },
      reset(now) {
        if (lastFrameAt !== null) lastFrameAt = now;
        statsAt = now;
        stats.take();
      },
    };
  }

  const FramePerf = { LONG_FRAME_MS, STALL_MS, SUMMARY_MS, FrameStats, degraded, frameMonitor };
  if (typeof module !== 'undefined' && module.exports) module.exports = FramePerf;
  else root.GlowPerf = FramePerf;
})(typeof window !== 'undefined' ? window : globalThis);
