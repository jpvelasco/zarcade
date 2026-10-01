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
        if (gap > lead + b.D) break;
        if (gap < -b.r) continue;
        if (it.size > b.D * PICK_RATIO && it.size <= b.D * BUMP_RATIO && gap < lead) { jump = true; break; }
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
  const w = autoplay(level);
  return {
    size: Math.floor(w.ball.D * 0.85),
    items: Math.floor(w.collected * 0.75),
    time: Math.ceil((w.finishTime ?? w.time) * 1.25),
  };
}
