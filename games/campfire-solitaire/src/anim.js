// Interruptible tweens for card motion. A Motion eases from wherever it is
// right now toward a target, so a new target mid-flight never jumps. Pure (the
// caller passes the clock), so tests can step it.

export const easeOutCubic = (k) => 1 - (1 - k) ** 3;
export const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
export const easeOutBack = (k) => {
  const c = 1.4;
  return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2;
};

export class Motion {
  constructor(value = 0) {
    this.from = value;
    this.to = value;
    this.t0 = 0;
    this.dur = 0;
    this.ease = easeOutCubic;
  }

  // Progress 0..1 at `now` (1 when settled).
  progress(now) {
    if (this.dur <= 0 || now >= this.t0 + this.dur) return 1;
    if (now <= this.t0) return 0;
    return (now - this.t0) / this.dur;
  }

  value(now) {
    const k = this.progress(now);
    if (k >= 1) return this.to;
    return this.from + (this.to - this.from) * this.ease(k);
  }

  // Head for `to`, starting from the current value: interruptible.
  set(to, now, dur, delay = 0, ease = easeOutCubic) {
    if (to === this.to && this.dur > 0 && now < this.t0 + this.dur) return false;
    this.from = this.value(now);
    this.to = to;
    this.t0 = now + delay;
    this.dur = Math.max(0, dur);
    this.ease = ease;
    if (this.dur === 0 && delay === 0) this.from = to;
    return true;
  }

  snap(v) {
    this.from = v;
    this.to = v;
    this.dur = 0;
  }

  moving(now) {
    return this.dur > 0 && now < this.t0 + this.dur;
  }
}

// A smoothed value that chases a target at a rate (per second), for things
// like the sky brightening with the streak.
export function approach(current, target, rate, dt) {
  const k = 1 - Math.exp(-rate * dt);
  return current + (target - current) * k;
}
