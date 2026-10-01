// Frame-time bookkeeping for performance telemetry. DOM-free so tests can
// feed it synthetic frames.

export const LONG_FRAME_MS = 100;
export const STALL_MS = 1500;

export class FrameStats {
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
export function degraded(summary) {
  return summary.frames > 30 && (summary.p95 > 40 || summary.longFrames > 0);
}
