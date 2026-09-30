// Autopilot: produces controls for the World. Used by tests, the ?autopilot
// debug mode and the title-screen attract demo.
import { FIELD, PADDLE } from './config.js';
import { clamp } from './math.js';
import { predictX } from './physics.js';

const GOOD = new Set(['multi', 'wide', 'laser', 'sticky', 'slow', 'fire', 'shield', 'life', 'disco', 'big', 'magnet', 'duck']);

export class Autopilot {
  constructor({ skill = 1 } = {}) {
    this.skill = skill; // 1 = sharp; lower values react later and aim worse
    this.hold = 0;
    this.lastHits = -1;
    this.target = null;
  }

  pickTarget(world) {
    if (world.boss && !world.boss.dead) return { x: world.boss.x, y: world.boss.y };
    const alive = world.bricks.filter((b) => b.alive && b.kind !== 'metal');
    if (!alive.length) return { x: FIELD.w / 2, y: 200 };
    // Favour low bricks (closest to us), but rotate through them.
    alive.sort((a, b) => b.y - a.y || a.x - b.x);
    // If nothing has broken for a while, the low bricks are probably hidden
    // behind metal: widen the search.
    const pool = world.sinceHit > 3 ? alive : alive.slice(0, Math.max(4, Math.ceil(alive.length / 3)));
    const b = pool[(world.paddleHits * 7 + 3) % pool.length];
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  controls(world, dt = 1 / 60) {
    const p = world.paddle;
    const out = { targetX: p.x, axis: 0, launch: false, fire: true };
    if (world.paddleHits !== this.lastHits || !this.target) {
      this.lastHits = world.paddleHits;
      this.target = this.pickTarget(world);
    }
    if (world.balls.some((b) => b.stuck)) {
      this.hold += dt;
      if (this.hold > 0.6) { out.launch = true; this.hold = 0; }
    }

    const top = PADDLE.y - PADDLE.h / 2;
    let best = null, bestT = Infinity;
    for (const b of world.balls) {
      if (b.stuck || b.dy <= 0) continue;
      const t = (top - b.r - b.y) / b.dy;
      if (t > -4 && t < bestT) { bestT = t; best = b; }
    }
    if (best) {
      const land = predictX(best.x, best.y, best.dx, best.dy, top - best.r, best.r, FIELD.w - best.r);
      const tg = this.target;
      const ang = Math.atan2(tg.x - land, top - tg.y);
      const off = clamp(ang / PADDLE.maxAngle, -0.8, 0.8) * this.skill;
      out.targetX = land - off * (p.w / 2);
      return out;
    }
    // Nothing coming down: grab a capsule if one is falling, else shadow a comet.
    const cap = world.capsules.filter((c) => GOOD.has(c.kind)).sort((a, b) => b.y - a.y)[0];
    if (cap) out.targetX = cap.x;
    else {
      const low = world.balls.filter((b) => !b.stuck).sort((a, b) => b.y - a.y)[0];
      out.targetX = low ? low.x : FIELD.w / 2;
    }
    return out;
  }
}

// Run a whole level headlessly. Returns the finished world.
export function playLevel(World, levelIndex, { maxTime = 600, step = 1 / 120, seed, lives = 3, skill = 1 } = {}) {
  const world = new World(levelIndex, { seed, lives });
  const pilot = new Autopilot({ skill });
  while (world.time < maxTime && world.status !== 'cleared' && world.status !== 'gameover') {
    world.step(step, pilot.controls(world, step));
    world.events.length = 0;
  }
  return world;
}
