// Autoplayer for attract mode, `?autopilot`, and balance tests. It reads the
// world and returns controls like a player would: plunge with a random pull,
// flip when a ball is about to cross a flipper's sweep, and let cradled
// balls roll down to the sweet spot before flipping.
import { PLUNGE } from './world.js';
import { mulberry32 } from './rng.js';

const LOOKAHEAD = 0.028; // s: roughly the flipper's swing time

export class Autoplayer {
  constructor(seed = 7) {
    this.rng = mulberry32(seed);
    this.hold = [0, 0];
    this.wait = [-1, -1];
    this.rest = [0, 0];
    this.plungeT = 0;
    this.plungeFor = 0;
  }

  controls(world, dt) {
    const out = { left: false, right: false, plunge: false, nudge: 0 };
    // Plunger.
    const sb = world.shooterBall();
    const ready = sb && !sb.auto && (world.state === 'play' || world.state === 'attract');
    if (ready && (this.plungeFor || Math.abs(sb.vy) < 5)) {
      if (!this.plungeFor) { this.plungeFor = (0.45 + this.rng() * 0.55) * PLUNGE.pullTime; this.plungeT = -0.4 - this.rng() * 0.5; }
      this.plungeT += dt;
      out.plunge = this.plungeT > 0 && this.plungeT < this.plungeFor;
      if (this.plungeT >= this.plungeFor) this.plungeFor = 0;
    } else {
      this.plungeFor = 0;
    }
    // Flippers.
    for (let i = 0; i < 2; i++) {
      const f = world.flippers[i];
      if (this.hold[i] > 0) {
        this.hold[i] -= dt;
        // Keep holding while a ball sits in the cradle, then let it roll.
        if (this.hold[i] <= 0 && this.cradled(world, f)) {
          if (this.rest[i] <= 0) this.rest[i] = 0.4 + this.rng() * 0.9;
          this.rest[i] -= dt;
          this.hold[i] = this.rest[i] > 0 ? 0.02 : 0;
        }
        if (i === 0) out.left = true; else out.right = true;
        continue;
      }
      this.rest[i] = 0;
      if (this.threat(world, f)) {
        if (this.wait[i] < 0) this.wait[i] = this.rng() * 0.02;
        this.wait[i] -= dt;
        if (this.wait[i] <= 0) {
          this.wait[i] = -1;
          this.hold[i] = 0.16 + this.rng() * 0.14;
          if (i === 0) out.left = true; else out.right = true;
        }
      } else {
        this.wait[i] = -1;
      }
    }
    return out;
  }

  // Ball position in the flipper's frame, mirrored so both flippers look
  // like the left one: angle from the pivot (rest is +, raised is -).
  local(f, x, y) {
    const dx = x - f.x, dy = y - f.y;
    const ang = f.side === 'left' ? Math.atan2(dy, dx) : Math.atan2(dy, -dx);
    return { d: Math.hypot(dx, dy), ang };
  }

  threat(world, f) {
    const restA = f.side === 'left' ? f.rest : Math.PI - f.rest;
    for (const b of world.balls) {
      if (b.held || b.layer !== 0 || b.y < 820) continue;
      const px = b.x + b.vx * LOOKAHEAD, py = b.y + b.vy * LOOKAHEAD;
      const now = this.local(f, b.x, b.y);
      const soon = this.local(f, px, py);
      for (const p of [now, soon]) {
        if (p.d < 34 || p.d > f.len + 20) continue;
        if (p.ang < -0.85 || p.ang > restA + 0.05) continue;
        // A ball rolling slowly down the flipper: wait for the sweet spot.
        if (Math.hypot(b.vx, b.vy) < 400 && p.d < f.len * 0.55) continue;
        if (b.vy < -350) continue;
        return true;
      }
    }
    return false;
  }

  cradled(world, f) {
    for (const b of world.balls) {
      if (b.held || b.layer !== 0) continue;
      const p = this.local(f, b.x, b.y);
      if (p.d < f.len * 0.6 && p.d > 10 && Math.hypot(b.vx, b.vy) < 60 && p.ang < 0) return true;
    }
    return false;
  }
}
