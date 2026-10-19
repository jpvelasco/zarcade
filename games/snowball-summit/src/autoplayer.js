// A simple driver for the snowball: speeds up, jumps over things it cannot
// grab and over steep rises. Used by the tests (every slope must be
// finishable), for calibrating star targets, and as the title attract mode.
import { PICK_RATIO, BUMP_RATIO } from './items.js';
import { physicsFor, World, STEP } from './world.js';

export class Autoplayer {
  constructor({ skill = 1 } = {}) {
    this.skill = skill; // 0..1: lower skill reacts later and pushes less
    this.cool = 0;
  }

  controls(world, dt = STEP) {
    const b = world.ball;
    const T = world.terrain;
    this.cool -= dt;
    const { G, jumpH } = physicsFor(b.D);
    const jv = Math.sqrt(2 * G * jumpH);
    const airT = (2 * jv) / G;
    const speed = Math.max(60, b.vx);
    let jump = false;
    if (b.grounded && this.cool <= 0) {
      // Obstacles ahead: jump so the top of the arc lands over them.
      const lead = speed * airT * 0.42 * (0.8 + 0.2 * this.skill);
      const items = T.items;
      for (let i = world.itemLo; i < items.length; i++) {
        const it = items[i];
        if (it.state !== 'idle') continue;
        const gap = it.x - it.size * it.w * 0.5 - (b.x + b.r);
        if (gap > lead * 2.4 + b.D) break;
        if (gap < -b.r) continue;
        if (it.size > b.D * PICK_RATIO && it.size <= b.D * BUMP_RATIO && gap < lead && !it.air) { jump = true; break; }
        // Balloon things: jump at the moment the arc collects the most.
        if (it.air && it.size <= b.D * PICK_RATIO && gap < lead * 2) {
          const now = arcCount(world, 0, jv, G);
          let later = 0;
          for (let wait = 0.03; wait <= 0.36 && later <= now; wait += 0.03) later = Math.max(later, arcCount(world, wait, jv, G));
          if (now > 0 && now >= later) { jump = true; break; }
        }
      }
      // Steep rises: jump when the ground ahead climbs hard.
      if (!jump) {
        const ahead = T.groundY(b.x + b.D * 1.5) - T.groundY(b.x);
        if (ahead < -b.D * 0.9 && speed < physicsFor(b.D).vnat * 0.9) jump = true;
      }
    }
    if (jump) this.cool = 0.25;
    const push = this.skill >= 0.5 ? 1 : 0.6;
    return { push, brake: 0, jump };
  }
}

// How many balloon things would a jump started `wait` seconds from now
// sweep through? Follows the sim's arc: ground speed kept, plus the forward
// air push while speeding up.
const AIR_PUSH = 0.18;
export function arcCount(world, wait, jv, G) {
  const b = world.ball;
  const vx = Math.max(60, b.vx);
  const x0 = b.x + vx * wait, y0 = b.y + world.terrain.slopeAt(b.x) * vx * wait;
  const tAir = (2 * jv) / G;
  const items = world.terrain.items;
  const xEnd = x0 + vx * tAir + 0.5 * AIR_PUSH * G * tAir * tAir + b.D;
  const near = [];
  for (let i = world.itemLo; i < items.length; i++) {
    const it = items[i];
    if (it.x > xEnd) break;
    if (it.air && it.state === 'idle' && it.size <= b.D * PICK_RATIO && it.x > x0) near.push(it);
  }
  if (!near.length) return 0;
  const hit = new Set();
  for (let k = 1; k <= 30; k++) {
    const t = (k / 30) * tAir;
    const x = x0 + vx * t + 0.5 * AIR_PUSH * G * t * t, y = y0 - (jv * t - 0.5 * G * t * t);
    for (const it of near) {
      if (hit.has(it)) continue;
      const hw = it.size * it.w * 0.4;
      const cx = Math.max(it.x - hw, Math.min(x, it.x + hw)), cy = Math.max(it.y - it.size * 0.85, Math.min(y, it.y));
      if (Math.hypot(cx - x, cy - y) < b.r * 0.92) hit.add(it);
    }
  }
  return hit.size;
}

// Run a whole level with the autoplayer. Returns the finished world.
export function autoplay(level, { skill = 1, maxTime = 240, avalanche = true, controls } = {}) {
  const w = new World(level, { avalanche });
  const ai = new Autoplayer({ skill });
  let steps = 0;
  const limit = maxTime / STEP;
  while (w.status === 'play' && steps++ < limit) {
    const c = controls ? controls(w) : ai.controls(w);
    w.step(STEP, c);
    w.events.length = 0;
  }
  return w;
}

// Star targets from an autoplayer run: a good player should beat them.
export function calibrate(level) {
  return goalsFrom(autoplay(level));
}

// The same run spread over many frames: call step(ms) until it returns goals.
export function calibration(level, maxTime = 240) {
  const w = new World(level);
  const ai = new Autoplayer();
  let goals = null;
  return {
    step(budgetMs = 3) {
      const t0 = performance.now();
      while (!goals && performance.now() - t0 < budgetMs) {
        for (let i = 0; i < 60 && w.status === 'play' && w.time < maxTime; i++) { w.step(STEP, ai.controls(w)); w.events.length = 0; }
        if (w.status !== 'play' || w.time >= maxTime) goals = goalsFrom(w);
      }
      return goals;
    },
    finish() { while (!goals) this.step(50); return goals; },
  };
}

function goalsFrom(w) {
  return {
    size: Math.floor(w.ball.D * 0.92),
    items: Math.floor(w.collected * 0.85),
    time: Math.ceil((w.finishTime ?? w.time) * 1.12),
  };
}
