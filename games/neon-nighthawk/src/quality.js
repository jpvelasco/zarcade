// Render quality levels and the scaler that picks one from frame times.
// DOM-free so tests can feed it synthetic frames.
//
// `dpr` caps the canvas pixel ratio, `glow` scales additive glow sprites,
// `rain` scales the number of drops, `particles` caps live particles, and
// the flags switch optional scenery passes.

export const QUALITY_LEVELS = [
  { name: 'high', dpr: 2, glow: 1, rain: 1, particles: 240, puddles: true, lanterns: true, signals: true, buildMs: 3 },
  { name: 'medium', dpr: 1.5, glow: 0.85, rain: 0.7, particles: 150, puddles: true, lanterns: true, signals: true, buildMs: 2.5 },
  { name: 'low', dpr: 1, glow: 0.7, rain: 0.45, particles: 90, puddles: false, lanterns: true, signals: false, buildMs: 2 },
  { name: 'lowest', dpr: 0.75, glow: 0.5, rain: 0.25, particles: 50, puddles: false, lanterns: false, signals: false, buildMs: 1.5 },
];

export function qualityIndex(name) {
  const index = QUALITY_LEVELS.findIndex((level) => level.name === name);
  return index < 0 ? -1 : index;
}

// Steps quality down when frames stay slow, and back up after a long smooth
// stretch. An upgrade that has to be undone straight away makes the next
// attempt wait twice as long, so a machine on the edge does not flicker
// between levels.
export class QualityScaler {
  constructor({
    level = 0,
    window = 30,
    slowMs = 21, // a mean frame above this is below ~48 fps
    smoothMs = 17.6, // a mean frame below this is a steady 60 fps (or better)
    downAfterMs = 1200, // slow for this long steps down
    upAfterMs = 7000, // smooth for this long tries one step up
    ignoreAboveMs = 250, // hidden tabs and one-off hitches are not a trend
  } = {}) {
    this.level = level;
    this.window = window;
    this.slowMs = slowMs;
    this.smoothMs = smoothMs;
    this.downAfterMs = downAfterMs;
    this.upAfterMs = upAfterMs;
    this.ignoreAboveMs = ignoreAboveMs;
    this.samples = [];
    this.sum = 0;
    this.slowFor = 0;
    this.smoothFor = 0;
    this.upWait = upAfterMs;
    this.sinceUp = Infinity;
  }

  get mean() {
    return this.samples.length ? this.sum / this.samples.length : 0;
  }

  reset() {
    this.samples.length = 0;
    this.sum = 0;
    this.slowFor = 0;
    this.smoothFor = 0;
  }

  // Feed one frame time. Returns the new level index when it changes,
  // otherwise -1.
  sample(ms) {
    if (!(ms > 0) || ms > this.ignoreAboveMs) return -1;
    this.samples.push(ms);
    this.sum += ms;
    if (this.samples.length > this.window) this.sum -= this.samples.shift();
    this.sinceUp += ms;
    if (this.samples.length < this.window) return -1;
    const mean = this.mean;
    if (mean > this.slowMs) {
      this.slowFor += ms;
      this.smoothFor = 0;
    } else {
      this.slowFor = 0;
      this.smoothFor = mean < this.smoothMs ? this.smoothFor + ms : 0;
    }
    if (this.slowFor >= this.downAfterMs && this.level < QUALITY_LEVELS.length - 1) {
      // Dropping straight after an upgrade means that upgrade did not fit.
      if (this.sinceUp < this.upWait) this.upWait = Math.min(this.upWait * 2, 120000);
      this.level++;
      this.reset();
      return this.level;
    }
    if (this.smoothFor >= this.upWait && this.level > 0) {
      this.level--;
      this.sinceUp = 0;
      this.reset();
      return this.level;
    }
    return -1;
  }
}
