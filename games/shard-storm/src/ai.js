// Autopilot: a swinging "cursor" for the attract demo and ?autopilot.
// It shadows a mid-air crystal, latches onto its arc, and swings through it.
// The cursor is speed-capped so the pass-through reads as a fast swipe
// instead of a teleport. It also fires Storm Break when the surge gets ugly,
// so the attract loop shows off the real game.
import { FIELD, SURGE } from './config.js';
import { clamp } from './math.js';

const SPEED = 2600; // field px/s the cursor can move
// What the pilot thinks each kind is worth going out of its way for.
const VALUE = { gold: 3.2, cluster: 1.7, frost: 1.5, shard: 1 };

export class Autopilot {
  constructor() {
    this.x = FIELD.w / 2;
    this.y = FIELD.h * 0.55;
    this.lock = null;
  }

  pickTarget(world) {
    // Only mid-air crystals (not the fresh spawn row) are worth swinging at.
    const alive = world.shards.filter((s) => s.kind !== 'mine' && s.y < FIELD.h - 60);
    if (!alive.length) return null;
    // Favour what is worth most and closest to falling out of the field.
    const worth = (s) => (VALUE[s.kind] ?? 1) * (0.5 + s.y / FIELD.h) - (s.shielded ? 0.3 : 0);
    alive.sort((a, b) => worth(b) - worth(a) || a.x - b.x);
    const n = Math.min(alive.length, Math.max(2, Math.ceil(alive.length / 3)));
    return alive[(Math.floor(world.time * 9) * 7 + 3) % n];
  }

  // Returns { points, breakNow } for one frame: the cursor path the sweep
  // should follow, and whether to spend a charged Storm Break.
  controls(world, dt = 1 / 120) {
    if (world.status !== 'play') return { points: null, breakNow: false };
    // Spend the break when the surge bites or the field is busy. The attract
    // loop is a shop window, so it never sits on a charged meter for long.
    const breakNow = world.breakReady && (world.surge >= SURGE.warn * 0.6 || world.shards.length >= 5);
    if (!this.lock || !world.shards.includes(this.lock)) this.lock = this.pickTarget(world);
    const W = world.w ?? FIELD.w;
    let tx = W / 2, ty = FIELD.h * 0.55;
    const sh = this.lock;
    if (sh) {
      // Lead the crystal a touch so the pass-through arrives as it does.
      tx = sh.x + sh.vx * 0.05;
      ty = sh.y + sh.vy * 0.05;
      for (const m of world.shards) {
        if (m.kind !== 'mine') continue;
        const dx = tx - m.x, dy = ty - m.y;
        const d = Math.hypot(dx, dy);
        if (d < 90 && d > 0.001) { tx += (dx / d) * (90 - d); ty += (dy / d) * (90 - d); }
      }
    }
    tx = clamp(tx, 16, W - 16);
    ty = clamp(ty, 40, FIELD.h - 10);

    // Cap the cursor's step and emit sub-step points so the sweep is a real
    // swept line (a teleport would tunnel past the crystal).
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const pts = [];
    if (d > 0.001) {
      const n = Math.max(1, Math.ceil(d / (SPEED * dt / 2)));
      const steps = Math.min(n, 10);
      for (let i = 1; i <= steps; i++) pts.push({ x: this.x + (dx * i) / steps, y: this.y + (dy * i) / steps });
      this.x += (dx * steps) / n;
      this.y += (dy * steps) / n;
    }
    this.x = clamp(this.x, 0, W);
    this.y = clamp(this.y, 0, FIELD.h);
    return { points: pts.length ? pts : null, breakNow };
  }
}
