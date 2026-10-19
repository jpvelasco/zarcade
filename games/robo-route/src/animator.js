// Turns interpreter events into Bolt's poses over time: rolls, hops, turns,
// arm waves, bonks and shrugs. Holds the visible lamp and battery state so a
// lamp lights at the moment Bolt's arm goes up, not before.
import { startState, DX, DY } from './rules.js';

const DUR = {
  move: 0.42, turn: 0.3, jump: 0.52, hop: 0.4, light: 0.46, grab: 0.42,
  fizzle: 0.34, nograb: 0.34, skip: 0.2, bonk: 0.78, end: 0.12, tired: 0.12, win: 0.12,
};
const FIRE = { light: 0.45, grab: 0.45, fizzle: 0.4, bonk: 0.3, nograb: 0.3 };

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export class Animator {
  constructor(level, hooks = {}) {
    this.level = level;
    this.hooks = hooks;
    this.reset();
  }

  reset() {
    const s = startState(this.level);
    this.pose = { x: s.x, y: s.y, h: s.h, d: s.d, floorH: s.h, lift: 0, squash: 0, arm: 0, tilt: 0, spin: 0, mood: '' };
    this.lit = this.level.lamps.map(() => false);
    this.got = this.level.batteries.map(() => false);
    this.ev = null;
    this.t = 0;
    this.mood = '';
    this.post = null;
    this.idle = 0;
  }

  get busy() { return !!this.ev; }

  begin(ev, speed = 1) {
    this.ev = ev;
    this.t = 0;
    this.dur = (DUR[ev.kind] ?? 0.3) / speed;
    this.fired = false;
    this.mood = '';
    const h = this.hooks;
    switch (ev.kind) {
      case 'move': h.sound?.('move'); break;
      case 'turn': h.sound?.('turn', { dir: ev.dir }); break;
      case 'jump': h.sound?.('jump'); break;
      case 'hop': h.sound?.('hop'); break;
      case 'skip': h.sound?.('skip'); break;
      default: break;
    }
  }

  // Jump to the end of the current animation (used when an edit arrives).
  complete() {
    if (!this.ev) return;
    this.t = this.dur;
    this.update(0);
  }

  // Post-run poses: 'win' (twirl), 'bonk' (dizzy), 'shrug', 'sleepy'.
  setPost(kind) {
    this.post = { kind, t: 0 };
    this.mood = kind === 'win' ? 'happy' : kind === 'sleepy' ? 'sleepy' : kind === 'shrug' ? 'shrug' : kind === 'bonk' ? 'bonk' : '';
  }

  // Returns true when the current event animation just finished.
  update(dt) {
    const P = this.pose;
    if (!this.ev) {
      this.idle += dt;
      P.lift = 0;
      P.arm = 0;
      P.tilt = 0;
      P.spin = 0;
      P.squash = Math.sin(this.idle * 2.4) * 0.025;
      P.mood = this.mood;
      if (this.post) {
        const q = this.post;
        q.t += dt;
        if (q.kind === 'win') {
          P.spin = q.t < 0.8 ? ease(q.t / 0.8) : 0;
          P.lift = Math.abs(Math.sin(q.t * 7)) * 0.2 * Math.max(0, 1 - q.t / 2);
          P.arm = 0.5 + Math.sin(q.t * 12) * 0.5;
        } else if (q.kind === 'shrug') {
          P.arm = 0;
          P.tilt = Math.sin(q.t * 3) * 0.06;
        } else if (q.kind === 'bonk') {
          P.tilt = Math.sin(q.t * 10) * 0.12 * Math.max(0, 1 - q.t);
        } else if (q.kind === 'sleepy') {
          P.tilt = Math.sin(q.t * 1.5) * 0.08;
          P.squash = 0.08 + Math.sin(q.t * 2) * 0.04;
        }
      }
      return false;
    }
    this.t += dt;
    const ev = this.ev;
    const p = Math.min(1, this.t / this.dur);
    const f = ev.from;
    const to = ev.to;
    P.lift = 0;
    P.squash = 0;
    P.arm = 0;
    P.tilt = 0;
    P.spin = 0;
    P.d = f.d;
    P.x = f.x;
    P.y = f.y;
    P.h = f.h;
    P.floorH = f.h;
    P.mood = '';
    if (!this.fired && FIRE[ev.kind] !== undefined && p >= FIRE[ev.kind]) {
      this.fired = true;
      this.fire(ev);
    }
    switch (ev.kind) {
      case 'move': {
        const e = ease(p);
        P.x = lerp(f.x, to.x, e);
        P.y = lerp(f.y, to.y, e);
        P.squash = Math.sin(p * Math.PI * 2) * 0.1;
        P.tilt = Math.sin(p * Math.PI) * 0.08;
        break;
      }
      case 'turn':
        P.d = p < 0.5 ? f.d : to.d;
        P.squash = Math.sin(p * Math.PI) * 0.22;
        break;
      case 'jump': {
        const e = p;
        P.x = lerp(f.x, to.x, e);
        P.y = lerp(f.y, to.y, e);
        P.h = lerp(f.h, to.h, ease(p));
        P.floorH = p < 0.5 ? f.h : to.h;
        P.lift = Math.sin(Math.PI * p) * (0.55 + Math.max(0, to.h - f.h) * 0.2);
        P.squash = p < 0.12 ? 0.35 : p > 0.88 ? 0.3 : -0.18;
        if (p >= 0.9 && !this.landed) { this.landed = true; this.hooks.burst?.(to.x, to.y, to.h, 'dust', 6); this.hooks.sound?.('land'); }
        break;
      }
      case 'hop':
        P.lift = Math.sin(Math.PI * p) * 0.4;
        P.squash = p < 0.12 ? 0.3 : p > 0.88 ? 0.25 : -0.15;
        break;
      case 'light':
      case 'grab':
        P.arm = Math.sin(Math.PI * p);
        P.squash = Math.sin(Math.PI * p) * -0.08;
        P.mood = p > 0.45 ? 'happy' : '';
        break;
      case 'fizzle':
        P.arm = Math.sin(Math.PI * p) * 0.7;
        P.mood = 'wow';
        break;
      case 'nograb':
        P.tilt = Math.sin(p * Math.PI * 2) * 0.12;
        P.mood = 'shrug';
        break;
      case 'skip':
        P.squash = Math.sin(Math.PI * p) * 0.12;
        break;
      case 'bonk': {
        const lunge = p < 0.3 ? ease(p / 0.3) * 0.3 : (1 - ease((p - 0.3) / 0.7)) * 0.3;
        P.x = f.x + DX[f.d] * lunge;
        P.y = f.y + DY[f.d] * lunge;
        P.tilt = p > 0.3 ? Math.sin(p * 30) * 0.12 * (1 - p) : 0;
        P.squash = p > 0.28 && p < 0.45 ? 0.35 : 0;
        P.mood = p > 0.3 ? 'bonk' : 'wow';
        break;
      }
      default:
        break;
    }
    if (p >= 1) {
      P.x = to.x; P.y = to.y; P.h = to.h; P.d = to.d; P.floorH = to.h;
      P.lift = 0; P.squash = 0; P.tilt = 0; P.arm = 0;
      this.ev = null;
      this.landed = false;
      return true;
    }
    return false;
  }

  fire(ev) {
    const h = this.hooks;
    const to = ev.to;
    if (ev.kind === 'light') {
      if (ev.index >= 0 && !this.lit[ev.index]) {
        this.lit[ev.index] = true;
        h.burst?.(to.x, to.y, to.h, 'glow', 16);
        h.flash?.(0.5);
        h.sound?.('light', { n: this.lit.filter(Boolean).length });
        h.lamp?.();
      } else h.sound?.('light', { n: 0 });
    } else if (ev.kind === 'grab') {
      this.got[ev.index] = true;
      h.burst?.(to.x, to.y, to.h, 'zap', 14);
      h.sound?.('grab');
    } else if (ev.kind === 'fizzle') {
      h.burst?.(to.x, to.y, to.h, 'dust', 5);
      h.sound?.('fizzle');
    } else if (ev.kind === 'nograb') {
      h.sound?.('fizzle');
    } else if (ev.kind === 'bonk') {
      const x = ev.from.x + DX[ev.from.d] * 0.45;
      const y = ev.from.y + DY[ev.from.d] * 0.45;
      h.burst?.(x, y, ev.from.h + 0.6, 'spark', 16);
      h.shake?.(0.35);
      h.sound?.('bonk');
    }
  }
}
