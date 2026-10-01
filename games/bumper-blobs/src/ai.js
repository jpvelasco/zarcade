// Bot brains. A bot reads the world and returns the same controls a player
// would: { mx, my, dash, pound }. It re-plans a few times a second (faster
// on Hard) and steers every step. Seeded, so bot matches replay exactly.
import { onFloor } from './arenas.js';
import { Rng, hashSeed } from './rng.js';
import { BLOB } from './config.js';

export const BOT_TUNING = {
  easy: { think: 0.5, aimErr: 0.55, margin: 55, charge: [0.1, 0.45], range: 190, aggression: 0.55, pound: 0.06, speed: 0.7, grab: 0.4, reckless: 0.25 },
  normal: { think: 0.32, aimErr: 0.28, margin: 85, charge: [0.35, 0.8], range: 240, aggression: 0.8, pound: 0.12, speed: 0.9, grab: 0.7, reckless: 0.08 },
  hard: { think: 0.1, aimErr: 0.07, margin: 105, charge: [0.6, 1], range: 280, aggression: 1, pound: 0.2, speed: 1, grab: 0.9, reckless: 0 },
};

const RAYS = 12;
const RAY_STEP = 22;
const RAY_MAX = 420;

// Distance to the nearest edge and the direction toward it.
export function probeEdge(arena, x, y) {
  let best = RAY_MAX, dx = 0, dy = 0;
  if (!onFloor(arena, x, y)) return { dist: 0, dx: 0, dy: 0 };
  for (let k = 0; k < RAYS; k++) {
    const a = (k / RAYS) * Math.PI * 2;
    const cx = Math.cos(a), cy = Math.sin(a);
    for (let s = RAY_STEP; s < best; s += RAY_STEP) {
      if (!onFloor(arena, x + cx * s, y + cy * s)) {
        if (s < best) { best = s; dx = cx; dy = cy; }
        break;
      }
    }
  }
  return { dist: best, dx, dy };
}

// The safest nearby spot to retreat to: the ground point a short hop
// away with the most room around it.
function retreatPoint(arena, x, y) {
  let best = null, bestD = -1;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (const r of [70, 140]) {
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const e = probeEdge(arena, px, py).dist;
      if (e > bestD) { bestD = e; best = { x: px, y: py }; }
    }
  }
  return best || { x: 0, y: 0 };
}

export class Bot {
  constructor(index, level = 'normal', seed = 1) {
    this.i = index;
    this.level = BOT_TUNING[level] ? level : 'normal';
    this.tune = BOT_TUNING[this.level];
    this.rng = new Rng(hashSeed(seed, index + 1, 0xa1));
    this.timer = this.rng.next() * this.tune.think;
    this.goal = null; // { x, y }
    this.target = -1;
    this.plan = 'wander';
    this.chargeGoal = 0.5;
    this.aim = 0;
    this.out = { mx: 0, my: 0, dash: false, pound: false };
  }

  controls(world, dt) {
    const o = this.out;
    o.mx = 0; o.my = 0; o.dash = false; o.pound = false;
    const me = world.blobs[this.i];
    if (!me || me.out || me.falling || world.phase !== 'play') return o;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.tune.think * (0.75 + this.rng.next() * 0.5);
      this.think(world, me);
    }
    this.steer(world, me, o);
    return o;
  }

  think(world, me) {
    const t = this.tune;
    const arena = world.arena;
    const edge = probeEdge(arena, me.x, me.y);
    this.edge = edge;
    // Danger first: too close to the edge, go somewhere roomy.
    if (edge.dist < t.margin && this.rng.next() > t.reckless) {
      this.plan = 'flee';
      this.goal = retreatPoint(arena, me.x, me.y);
      this.target = -1;
      return;
    }
    const foes = world.blobs.filter((b) => b !== me && !b.out && !b.falling);
    // Ground-pound when crowded.
    const near = foes.filter((b) => Math.hypot(b.x - me.x, b.y - me.y) < BLOB.poundRadius * 0.7).length;
    if (near && me.poundCd <= 0 && this.rng.next() < t.pound * near) {
      this.plan = 'pound';
      return;
    }
    // Grab a nearby power-up.
    const pick = this.nearest(me, world.powerups, 260);
    if (pick && this.rng.next() < t.grab && probeEdge(arena, pick.x, pick.y).dist > 50) {
      this.plan = 'goto'; this.goal = { x: pick.x, y: pick.y }; this.target = -1; return;
    }
    if (world.mode === 'koth' && world.zone) {
      const z = world.zone;
      const inZone = Math.hypot(me.x - z.x, me.y - z.y) < z.r * 0.75;
      const rival = foes.filter((b) => Math.hypot(b.x - z.x, b.y - z.y) < z.r + 40);
      if (rival.length && this.rng.next() < t.aggression) { this.attack(world, me, this.closest(me, rival)); return; }
      this.plan = 'goto';
      this.goal = inZone ? { x: z.x + (this.rng.next() - 0.5) * 30, y: z.y + (this.rng.next() - 0.5) * 30 } : { x: z.x, y: z.y };
      this.target = -1;
      return;
    }
    if (world.mode === 'coins') {
      const coin = this.bestCoin(world, me);
      const foe = this.closest(me, foes);
      const foeNear = foe && Math.hypot(foe.x - me.x, foe.y - me.y) < 170;
      if (coin && !(foeNear && this.rng.next() < t.aggression * 0.6)) {
        this.plan = 'goto'; this.goal = { x: coin.x, y: coin.y }; this.target = -1; return;
      }
      if (foe) { this.attack(world, me, foe); return; }
    }
    if (!foes.length) { this.plan = 'goto'; this.goal = { x: 0, y: 0 }; return; }
    // Last Blob Standing: go after whoever is easiest to knock off.
    let best = null, bestScore = -Infinity;
    for (const f of foes) {
      const fe = probeEdge(arena, f.x, f.y).dist;
      const d = Math.hypot(f.x - me.x, f.y - me.y);
      let s = -d * 0.6 + (RAY_MAX - fe) * 1.1 + (f.shield > 0 ? -200 : 0) + (f.giant > 0 ? -120 : 0) + this.rng.next() * (this.level === 'easy' ? 300 : 80);
      if (f.i === this.target) s += 60; // stick with a plan
      if (s > bestScore) { bestScore = s; best = f; }
    }
    if (this.rng.next() < t.aggression) this.attack(world, me, best);
    else { this.plan = 'goto'; this.goal = retreatPoint(arena, me.x, me.y); }
  }

  attack(world, me, foe) {
    this.plan = 'attack';
    this.target = foe.i;
    const [lo, hi] = this.tune.charge;
    this.chargeGoal = lo + this.rng.next() * (hi - lo);
    this.aim = (this.rng.next() * 2 - 1) * this.tune.aimErr;
  }

  nearest(me, list, maxD) {
    let best = null, bd = maxD;
    for (const p of list) {
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  closest(me, list) { return this.nearest(me, list, Infinity); }

  bestCoin(world, me) {
    let best = null, bs = -Infinity;
    for (const c of world.coins) {
      const d = Math.hypot(c.x - me.x, c.y - me.y);
      let rival = Infinity;
      for (const b of world.blobs) if (b !== me && !b.out) rival = Math.min(rival, Math.hypot(c.x - b.x, c.y - b.y));
      const s = c.value * 120 - d + (rival < d ? -80 : 0);
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }

  steer(world, me, o) {
    const t = this.tune;
    let gx = me.x, gy = me.y;
    // Hard bots check the edge every step, not just when re-planning.
    if (this.level === 'hard' || (this.plan !== 'flee' && this.plan !== 'attack')) {
      // cheap check: the point a little ahead along our velocity
      const ahead = 0.22;
      if (!onFloor(world.arena, me.x + me.vx * ahead, me.y + me.vy * ahead) && !me.charging) {
        const sp = Math.hypot(me.vx, me.vy) || 1;
        o.mx = -me.vx / sp; o.my = -me.vy / sp;
        return;
      }
    }
    if (this.plan === 'pound') {
      o.pound = true;
      this.plan = 'wander';
      return;
    }
    if (this.plan === 'attack') {
      const foe = world.blobs[this.target];
      if (!foe || foe.out || foe.falling) { this.plan = 'wander'; return; }
      const fe = probeEdgeCached(this, world, foe);
      // Line up behind the foe, opposite their nearest edge.
      const px = fe.dx || (foe.x - me.x), py = fe.dy || (foe.y - me.y);
      const pl = Math.hypot(px, py) || 1;
      const ux = px / pl, uy = py / pl;
      const dx = foe.x - me.x, dy = foe.y - me.y;
      const d = Math.hypot(dx, dy) || 1;
      const lined = (dx * ux + dy * uy) / d; // 1 = foe is straight between us and their edge
      const ready = me.dashCd <= 0;
      if (me.charging) {
        // Aim at the foe while charging, release when charged or close.
        const a = Math.atan2(dy, dx) + this.aim;
        o.mx = Math.cos(a); o.my = Math.sin(a);
        const release = me.charge >= this.chargeGoal || d < me.radius + foe.radius + 40;
        o.dash = !release;
        // Don't fling yourself off: abort if the dash end is off the floor.
        // (Keep holding and dash back toward safe ground instead.)
        if (release && !this.dashLandsSafe(world, me, o.mx, o.my, d)) {
          o.dash = true;
          this.plan = 'flee';
          this.goal = retreatPoint(world.arena, me.x, me.y);
        }
        return;
      }
      if (ready && d < t.range && (lined > 0.6 || (d < 100 && this.rng.next() < 0.1))) {
        o.dash = true;
        o.mx = dx / d; o.my = dy / d;
        return;
      }
      // Walk to the lining-up spot.
      gx = foe.x - ux * (me.radius + foe.radius + 70);
      gy = foe.y - uy * (me.radius + foe.radius + 70);
      if (!onFloor(world.arena, gx, gy)) { gx = foe.x - (dx / d) * 90; gy = foe.y - (dy / d) * 90; }
    } else if (this.goal) {
      gx = this.goal.x; gy = this.goal.y;
    }
    const dx = gx - me.x, dy = gy - me.y, d = Math.hypot(dx, dy);
    if (d > 12) {
      const s = t.speed * Math.min(1, d / 60);
      o.mx = (dx / d) * s; o.my = (dy / d) * s;
    }
    // Moving floors: lean against belts and the turntable a bit.
    if (world.arena.kind === 'seesaw') o.mx -= Math.sin(world.arena.tilt) * 1.4;
  }

  // Where would a dash in this direction stop if it missed?
  dashLandsSafe(world, me, ux, uy, foeD) {
    const speed = BLOB.dashMin + (BLOB.dashMax - BLOB.dashMin) * me.charge;
    const travel = Math.min(speed * 0.33, foeD + 30);
    return onFloor(world.arena, me.x + ux * travel, me.y + uy * travel) || this.rng.next() < this.tune.reckless;
  }
}

// Per-think cache of a foe's edge probe so steering stays cheap.
function probeEdgeCached(bot, world, foe) {
  const key = world.steps >> 3;
  if (bot.cacheKey !== key || bot.cacheFoe !== foe.i) {
    bot.cacheKey = key;
    bot.cacheFoe = foe.i;
    bot.cacheEdge = probeEdge(world.arena, foe.x, foe.y);
  }
  return bot.cacheEdge;
}
