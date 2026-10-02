import { Track } from './track.js';
import { buildLevel } from './level.js';
import { makeVehicle, stepVehicle, launch, BASE_STATS } from './vehicle.js';
import { OBSTACLES, PICKUPS, ZOMBIES } from './entities.js';
import { aiInput } from './ai.js';
import { clamp } from './math.js';

export const COUNTDOWN = 3;
const CELL = 16;
const ZOMBIE_WAKE = 150;   // zombies wake up this far ahead of the leader
const ZOMBIE_SLEEP = 70;   // and disappear this far behind the last racer
const COMBO_WINDOW = 2;
const REGEN_DELAY = 4;     // seconds without damage before health regenerates
const REGEN_RATE = 2;      // hp per second
const GUN = { range: 55, cone: 0.55, interval: 0.11 };
const ROCKET = { speed: 70, turn: 5, life: 2.5, blast: 7.5 };

// One race on one track. Pure simulation: no rendering, no DOM, no audio.
// Everything that happens is pushed onto `events` for the view and audio.
// How fast (rad/s) a jeep pressed against an obstacle turns along its face.
const GLANCE_TURN = 9;

export class World {
  constructor(def, { stats = BASE_STATS, autopilot = false } = {}) {
    this.def = def;
    this.track = new Track(def);
    const level = buildLevel(this.track, def);
    this.obstacles = level.obstacles;
    this.decor = level.decor;
    this.ramps = level.ramps;
    this.pickups = level.pickups;
    this.zombies = level.zombies;
    this.movers = this.obstacles.filter((o) => o.roll);
    this.projectiles = [];
    this.corpses = [];
    this.events = [];
    this.time = -COUNTDOWN;
    this.status = 'countdown'; // countdown | racing | finished | wrecked
    this.buildGrid();

    this.racers = [];
    this.player = this.addRacer({ stats, isPlayer: true, autopilot, lateral: 0 });
  }

  // Racers share one code path so AI rivals can be added later by pushing
  // more racers with isPlayer: false.
  addRacer({ stats, isPlayer, autopilot, lateral }) {
    const p = this.track.pointAt(this.track.startDist, lateral);
    const racer = {
      id: this.racers.length,
      isPlayer, autopilot,
      vehicle: makeVehicle(p.x, p.z, p.y, p.heading, stats),
      hint: Math.floor(this.track.startDist / 2), along: this.track.startDist, lateral,
      finished: false, finishTime: null, wrecked: false,
      weapon: null, ammo: 0, fireCooldown: 0, shield: 0, hitCooldown: 0,
      coins: 0, kills: 0, score: 0, combo: 0, comboTimer: 0, bestAir: 0,
      wrongWay: 0, aiLane: lateral,
    };
    this.racers.push(racer);
    return racer;
  }

  buildGrid() {
    this.grid = new Map();
    for (const o of this.obstacles) {
      if (o.roll) continue;
      const key = cellKey(Math.floor(o.x / CELL), Math.floor(o.z / CELL));
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(o);
    }
  }

  obstaclesNear(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const out = [...this.movers];
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const cell = this.grid.get(cellKey(cx + ox, cz + oz));
        if (cell) for (const o of cell) if (o.alive) out.push(o);
      }
    }
    return out;
  }

  emit(type, data) {
    this.events.push({ type, ...data });
  }

  // Advances the race by dt seconds. `playerInput` drives the player's jeep
  // unless it's on autopilot.
  step(dt, playerInput = {}) {
    const wasCountdown = this.time < 0;
    this.time += dt;
    if (this.time < 0) return;
    if (wasCountdown) { this.status = 'racing'; this.emit('go', {}); }
    if (this.status !== 'racing') {
      this.coastFinished(dt);
      this.updateCorpses(dt);
      return;
    }

    for (const racer of this.racers) {
      if (racer.finished || racer.wrecked) continue;
      const input = racer.isPlayer && !racer.autopilot ? playerInput : aiInput(this, racer);
      this.stepRacer(racer, input, dt);
    }
    this.updateMovers();
    this.updateZombies(dt);
    this.updateProjectiles(dt);
    this.updateCorpses(dt);

    const p = this.player;
    if (p.finished) this.status = 'finished';
    else if (p.wrecked) this.status = 'wrecked';
  }

  // After the finish line, jeeps roll to a stop instead of freezing.
  coastFinished(dt) {
    const t = this.track;
    for (const racer of this.racers) {
      if (!racer.finished) continue;
      const v = racer.vehicle;
      const near = t.nearestLocal(v.x, v.z, racer.hint);
      stepVehicle(v, { brake: 0.35, steer: 0 }, dt, {
        offroad: near.distance > t.half,
        height: (x, z) => t.groundHeight(x, z, t.nearestLocal(x, z, near.index)),
      });
      racer.hint = near.index;
    }
  }

  stepRacer(racer, input, dt) {
    const t = this.track, v = racer.vehicle;
    const near = t.nearestLocal(v.x, v.z, racer.hint);
    const ground = {
      offroad: near.distance > t.half,
      height: (x, z) => t.groundHeight(x, z, t.nearestLocal(x, z, near.index)) + this.rampLift(x, z, racer.along),
    };
    const hadAir = v.airTime;
    stepVehicle(v, input, dt, ground);

    const now = t.nearestLocal(v.x, v.z, near.index);
    racer.hint = now.index;
    racer.along = now.along;
    racer.lateral = now.lateral;

    // Canyon walls: slide along the foot of the wall instead of climbing it.
    if (now.distance > t.wallLimit) {
      const [nx, nz] = this.holdWithin(v, now, t.wallLimit);
      const out = v.vx * nx + v.vz * nz;
      if (out > 0) { v.vx -= out * nx; v.vz -= out * nz; }
      this.turnAlong(racer, -nx, -nz, dt);
    } else if (now.distance > t.boundary) {
      // Soft boundary: the desert pushes you back toward the road, sideways
      // or, behind the start, forward.
      this.holdWithin(v, now, t.boundary);
      v.vx *= 0.9;
      v.vz *= 0.9;
      if (racer.isPlayer) this.emit('boundary', {});
    }

    // Wrong-way warning.
    const dir = t.samples[now.index];
    const facing = Math.sin(v.heading) * dir.dx + Math.cos(v.heading) * dir.dz;
    racer.wrongWay = facing < -0.3 && Math.abs(v.speed) > 3 ? racer.wrongWay + dt : 0;

    if (v.landed) {
      if (hadAir > 0.5) {
        v.nitro = Math.min(1, v.nitro + hadAir * 0.12);
        racer.bestAir = Math.max(racer.bestAir, hadAir);
        racer.score += Math.round(hadAir * 20);
      }
      this.emit('land', { racer: racer.id, impact: v.landed, air: hadAir, x: v.x, y: v.y, z: v.z });
    }

    racer.hitCooldown = Math.max(0, racer.hitCooldown - dt);
    racer.sinceDamage = (racer.sinceDamage ?? REGEN_DELAY) + dt;
    if (racer.sinceDamage > REGEN_DELAY && v.hp > 0) v.hp = Math.min(100, v.hp + REGEN_RATE * dt);
    racer.fireCooldown = Math.max(0, racer.fireCooldown - dt);
    racer.shield = Math.max(0, racer.shield - dt);
    racer.comboTimer -= dt;
    if (racer.comboTimer <= 0) racer.combo = 0;

    this.checkRamps(racer);
    this.checkObstacles(racer, dt);
    this.checkZombies(racer);
    this.checkPickups(racer);
    this.useWeapon(racer, input);

    if (racer.along >= t.finishDist) {
      racer.finished = true;
      racer.finishTime = this.time;
      this.emit('finish', { racer: racer.id, time: this.time });
    } else if (v.hp <= 0) {
      v.hp = 0;
      racer.wrecked = true;
      this.emit('wrecked', { racer: racer.id, x: v.x, y: v.y, z: v.z });
    }
  }

  // Moves the jeep straight back toward the road until it is `limit` meters
  // away. Returns the outward direction.
  holdWithin(v, near, limit) {
    const s = this.track.samples[near.index], d = near.distance;
    const nx = (s.dz * near.lateral + s.dx * near.over) / d;
    const nz = (s.dz * near.over - s.dx * near.lateral) / d;
    v.x -= nx * (d - limit);
    v.z -= nz * (d - limit);
    // Settle onto the ground at the new spot, or the climb just undone would
    // launch the jeep off the slope next step.
    if (v.grounded) {
      v.y = this.track.groundHeight(v.x, v.z);
      v.vy = Math.min(v.vy, 0);
    }
    return [nx, nz];
  }

  clearance(v) {
    return v.y - this.track.groundHeight(v.x, v.z);
  }

  damage(racer, amount) {
    if (racer.shield > 0 || amount <= 0) return 0;
    const dealt = amount * racer.vehicle.stats.armor;
    racer.vehicle.hp -= dealt;
    racer.sinceDamage = 0;
    return dealt;
  }

  // Height of a ramp's slope at (x, z), so a jeep too slow to jump rolls up
  // and over the ramp instead of through it.
  rampLift(x, z, along) {
    for (const r of this.ramps) {
      if (Math.abs(r.along - along) > 12) continue;
      const dx = x - r.x, dz = z - r.z;
      const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
      const a = dx * fx + dz * fz, side = dx * fz - dz * fx;
      if (Math.abs(side) < r.width / 2 && Math.abs(a) < r.length / 2) return r.height * (a / r.length + 0.5);
    }
    return 0;
  }

  checkRamps(racer) {
    const v = racer.vehicle;
    if (!v.grounded || v.speed < 8) return;
    for (const r of this.ramps) {
      if (Math.abs(r.along - racer.along) > 12) continue;
      const dx = v.x - r.x, dz = v.z - r.z;
      const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      if (Math.abs(side) < r.width / 2 && along > -r.length / 2 && along < r.length / 2) {
        launch(v, 6 + v.speed * 0.3);
        this.emit('ramp', { racer: racer.id, x: v.x, y: v.y, z: v.z });
        return;
      }
    }
  }

  checkObstacles(racer, dt = 1 / 60) {
    const v = racer.vehicle;
    const lift = this.clearance(v);
    for (const o of this.obstaclesNear(v.x, v.z)) {
      const dx = v.x - o.x, dz = v.z - o.z;
      const reach = o.r + v.stats.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach || lift > o.h) continue;
      const t = OBSTACLES[o.type];

      if (t.harmless) { this.destroyObstacle(o, 'poof'); continue; }
      if (t.explosive) { this.destroyObstacle(o, 'blast'); this.explode(o.x, o.z, t.blast, racer, t.damage); continue; }
      if (racer.shield > 0 && !o.decor) {
        this.destroyObstacle(o, 'smash');
        v.vx *= 0.92; v.vz *= 0.92;
        continue;
      }
      if (t.breakable) {
        this.destroyObstacle(o, 'smash');
        v.vx *= t.slow; v.vz *= t.slow;
        this.damage(racer, t.damage);
        this.emit('crash', { racer: racer.id, soft: true, x: o.x, y: o.y, z: o.z });
        continue;
      }

      // Solid: push out, then slide along it. Only the push into the
      // obstacle is cancelled, so scraping a rock keeps the jeep moving and a
      // hard hit costs speed once, not on every frame of contact.
      const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d;
      v.x = o.x + nx * reach;
      v.z = o.z + nz * reach;
      const [tx, tz] = this.glanceTangent(racer, nx, nz);
      const into = v.vx * nx + v.vz * nz;
      if (into < 0) {
        const impact = -into;
        const speed = Math.hypot(v.vx, v.vz) || 1;
        // The more head-on the hit, the more of it turns into a sideways
        // glance instead of a dead stop.
        const headOn = clamp(impact / speed, 0, 1);
        v.vx -= into * nx;
        v.vz -= into * nz;
        v.vx += tx * impact * 0.55 * headOn;
        v.vz += tz * impact * 0.55 * headOn;
        if (racer.hitCooldown <= 0 && impact > 4) {
          racer.hitCooldown = 1;
          const keep = 1 - (1 - (t.slow + 0.3)) * clamp((impact - 4) / 16, 0, 1);
          v.vx *= keep; v.vz *= keep;
          // Nudges are free; only real impacts hurt.
          this.damage(racer, t.damage * clamp((impact - 6) / 14, 0, 1.4));
          this.emit('crash', { racer: racer.id, soft: false, kind: o.type, x: v.x, y: v.y, z: v.z, impact });
        }
      }
      this.turnAlong(racer, nx, nz, dt, tx, tz);
    }
  }

  // Turns the nose along a face whose normal (nx, nz) points at the jeep.
  // Grip only lets the jeep travel where it points, so this is what lets a
  // slide carry on.
  turnAlong(racer, nx, nz, dt, tx, tz) {
    const v = racer.vehicle;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    if (fx * nx + fz * nz >= -0.05) return;
    if (tx === undefined) [tx, tz] = this.glanceTangent(racer, nx, nz);
    let diff = Math.atan2(tx, tz) - v.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    v.heading += clamp(diff, -GLANCE_TURN * dt, GLANCE_TURN * dt);
  }

  // The way along an obstacle's face the jeep should slide: the side the nose
  // already leans to, or when dead-on, the side the road continues on.
  glanceTangent(racer, nx, nz) {
    const v = racer.vehicle;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const tx = -nz, tz = nx;
    const leaning = fx * tx + fz * tz;
    let sign = Math.sign(leaning);
    if (Math.abs(leaning) < 0.2) {
      const ahead = this.track.pointAt(racer.along + 6, racer.lateral);
      sign = Math.sign((ahead.x - v.x) * tx + (ahead.z - v.z) * tz) || 1;
    }
    return [tx * sign, tz * sign];
  }

  destroyObstacle(o, how) {
    if (!o.alive) return;
    o.alive = false;
    this.emit('destroy', { id: o.id, kind: o.type, how, x: o.x, y: o.y, z: o.z });
  }

  checkZombies(racer) {
    const v = racer.vehicle;
    if (this.clearance(v) > 1.8) return;
    for (const z of this.zombies) {
      if (!z.alive || !z.active) continue;
      const dx = v.x - z.x, dz = v.z - z.z, reach = z.r + v.stats.radius;
      if (dx * dx + dz * dz > reach * reach) continue;
      const t = ZOMBIES[z.type];
      if (racer.shield > 0) { this.kill(z, racer, 'ram'); continue; }
      if (z.type === 'bloater') { this.explode(z.x, z.z, t.blast, racer, t.damage, z); continue; }
      if (z.type === 'brute') {
        if ((z.bump || 0) > this.time) continue;
        z.bump = this.time + 0.8;
        z.hp -= t.ramDamage;
        v.vx *= t.slow; v.vz *= t.slow;
        this.damage(racer, t.damage);
        this.emit('crash', { racer: racer.id, soft: false, x: z.x, y: z.y + 1, z: z.z, impact: 15 });
        if (z.hp <= 0) { this.kill(z, racer, 'ram'); continue; }
        // Shoved aside.
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        z.x += fx * 3; z.z += fz * 3;
        continue;
      }
      this.damage(racer, t.damage);
      v.vx *= t.slow; v.vz *= t.slow;
      this.kill(z, racer, 'ram');
    }
  }

  kill(z, racer, cause) {
    if (!z.alive) return;
    z.alive = false;
    const t = ZOMBIES[z.type];
    if (racer) {
      racer.kills++;
      racer.combo = racer.comboTimer > 0 ? racer.combo + 1 : 1;
      racer.comboTimer = COMBO_WINDOW;
      racer.score += t.score * Math.min(racer.combo, 8);
    }
    // Comic flight: zombies get launched away from the jeep.
    const v = racer ? racer.vehicle : null;
    const push = v ? Math.max(8, Math.abs(v.speed) * 0.8) : 6;
    const dir = v ? Math.atan2(z.x - v.x, z.z - v.z) : Math.random() * Math.PI * 2;
    this.corpses.push({
      type: z.type, id: z.id, x: z.x, y: z.y, z: z.z, life: 2.2,
      vx: Math.sin(dir) * push + (v ? v.vx * 0.5 : 0), vy: 7 + Math.random() * 5, vz: Math.cos(dir) * push + (v ? v.vz * 0.5 : 0),
      spin: (Math.random() - 0.5) * 16, rot: 0,
    });
    this.emit('kill', { id: z.id, kind: z.type, cause, combo: racer ? racer.combo : 0, racer: racer ? racer.id : null, x: z.x, y: z.y, z: z.z });
  }

  // Blast: kills zombies, destroys (non-scenery) obstacles, hurts racers.
  // Barrels and bloaters caught in the blast go off too.
  explode(x, z, radius, source, racerDamage, bloater = null, depth = 0) {
    if (bloater) bloater.alive = false;
    this.emit('explosion', { x, z, y: this.track.groundHeight(x, z), radius });
    const chained = [];
    for (const zb of this.zombies) {
      if (!zb.alive || zb === bloater) continue;
      if ((zb.x - x) ** 2 + (zb.z - z) ** 2 < radius * radius) {
        if (zb.type === 'bloater') { zb.alive = false; chained.push([zb.x, zb.z, zb]); if (source) { source.kills++; source.score += ZOMBIES.bloater.score; } }
        else this.kill(zb, source, 'blast');
      }
    }
    for (const o of this.obstaclesNear(x, z)) {
      if (o.decor || !o.alive) continue;
      if ((o.x - x) ** 2 + (o.z - z) ** 2 < (radius + o.r) ** 2) {
        const explosive = OBSTACLES[o.type].explosive;
        this.destroyObstacle(o, 'blast');
        if (explosive) chained.push([o.x, o.z, null]);
      }
    }
    for (const r of this.racers) {
      const v = r.vehicle;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < radius + v.stats.radius) {
        const falloff = 1 - d / (radius + v.stats.radius);
        if (racerDamage) this.damage(r, racerDamage * (0.5 + 0.5 * falloff));
        launch(v, 4 + falloff * 5);
      }
    }
    if (depth < 4) for (const [cx, cz, b] of chained) this.explode(cx, cz, radius, source, racerDamage * 0.5, b, depth + 1);
  }

  checkPickups(racer) {
    const v = racer.vehicle;
    for (const p of this.pickups) {
      if (!p.alive) continue;
      const dx = v.x - p.x, dz = v.z - p.z, dy = v.y + 1 - p.y;
      const reach = PICKUPS[p.type].r + 1.2;
      if (dx * dx + dz * dz > reach * reach || Math.abs(dy) > 2.6) continue;
      p.alive = false;
      this.applyPickup(racer, p.type);
      this.emit('pickup', { racer: racer.id, kind: p.type, id: p.id, x: p.x, y: p.y, z: p.z });
    }
  }

  applyPickup(racer, type) {
    const v = racer.vehicle;
    if (type === 'coin') { racer.coins++; racer.score += 5; }
    else if (type === 'nitro') v.nitro = Math.min(1, v.nitro + 0.45);
    else if (type === 'repair') v.hp = Math.min(100, v.hp + 35);
    else if (type === 'shield') racer.shield = PICKUPS.shield.duration;
    else if (type === 'gun' || type === 'rockets') {
      if (racer.weapon === type) racer.ammo += PICKUPS[type].ammo;
      else { racer.weapon = type; racer.ammo = PICKUPS[type].ammo; }
    }
  }

  // The roof gun fires by itself at the best target ahead; rockets fire on
  // demand and home in.
  useWeapon(racer, input) {
    if (!racer.weapon || racer.fireCooldown > 0) return;
    const target = this.targetAhead(racer, racer.weapon === 'gun' ? GUN.range : 90);
    if (racer.weapon === 'gun') {
      if (!target) return;
      racer.fireCooldown = GUN.interval;
      racer.ammo--;
      const v = racer.vehicle;
      this.emit('shot', { racer: racer.id, from: { x: v.x, y: v.y + 2.2, z: v.z }, to: { x: target.x, y: target.y + 1.2, z: target.z } });
      this.hitTarget(target, racer, 1);
    } else if (racer.weapon === 'rockets' && input.fire) {
      racer.fireCooldown = 0.45;
      racer.ammo--;
      const v = racer.vehicle;
      this.projectiles.push({
        x: v.x, y: v.y + 2, z: v.z, heading: v.heading, life: ROCKET.life, target, owner: racer,
        speed: Math.max(ROCKET.speed, v.speed + 30),
      });
      this.emit('rocket', { racer: racer.id, x: v.x, y: v.y + 2, z: v.z });
    }
    if (racer.ammo <= 0) { racer.weapon = null; racer.ammo = 0; }
  }

  targetAhead(racer, range) {
    const v = racer.vehicle;
    let best = null, bestScore = Infinity;
    const consider = (e, weight) => {
      const dx = e.x - v.x, dz = e.z - v.z, d = Math.hypot(dx, dz);
      if (d > range || d < 2) return;
      const angle = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - v.heading), Math.cos(Math.atan2(dx, dz) - v.heading)));
      if (angle > GUN.cone) return;
      const score = d * (1 + angle) * weight;
      if (score < bestScore) { bestScore = score; best = e; }
    };
    for (const z of this.zombies) if (z.alive && z.active) consider(z, z.type === 'bloater' || z.type === 'brute' ? 0.6 : 1);
    for (const o of this.obstaclesNear(v.x + Math.sin(v.heading) * 30, v.z + Math.cos(v.heading) * 30)) {
      if (o.alive && OBSTACLES[o.type].explosive) consider(o, 0.8);
    }
    return best;
  }

  hitTarget(target, racer, amount) {
    if (target.type in ZOMBIES) {
      target.hp -= amount;
      this.emit('hit', { id: target.id, x: target.x, y: target.y + 1, z: target.z });
      if (target.hp > 0) return;
      if (target.type === 'bloater') {
        racer.kills++;
        racer.score += ZOMBIES.bloater.score;
        this.explode(target.x, target.z, ZOMBIES.bloater.blast, racer, ZOMBIES.bloater.damage, target);
      } else {
        this.kill(target, racer, 'shot');
      }
    } else if (OBSTACLES[target.type].explosive) {
      this.destroyObstacle(target, 'blast');
      this.explode(target.x, target.z, OBSTACLES[target.type].blast, racer, OBSTACLES[target.type].damage);
    }
  }

  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter((p) => {
      p.life -= dt;
      if (p.target && p.target.alive !== false) {
        const want = Math.atan2(p.target.x - p.x, p.target.z - p.z);
        const diff = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
        p.heading += clamp(diff, -ROCKET.turn * dt, ROCKET.turn * dt);
      }
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      const g = this.track.groundHeight(p.x, p.z);
      p.y += (g + 1.4 - p.y) * Math.min(1, dt * 6);

      let hit = p.life <= 0 || p.y < g;
      if (!hit && p.target && (p.target.alive !== false) && Math.hypot(p.target.x - p.x, p.target.z - p.z) < 2.5) hit = true;
      if (!hit) {
        for (const o of this.obstaclesNear(p.x, p.z)) {
          if (Math.hypot(o.x - p.x, o.z - p.z) < o.r + 0.5 && p.y - o.y < o.h) { hit = true; break; }
        }
      }
      if (hit) {
        this.explode(p.x, p.z, ROCKET.blast, p.owner, 0);
        // Rockets also wreck brutes outright.
        for (const z of this.zombies) {
          if (z.alive && z.type === 'brute' && Math.hypot(z.x - p.x, z.z - p.z) < ROCKET.blast) this.kill(z, p.owner, 'blast');
        }
      }
      return !hit;
    });
  }

  updateMovers() {
    for (const o of this.movers) {
      if (!o.alive) continue;
      const p = this.track.pointAt(o.along, Math.sin(this.time * o.roll.speed + o.roll.phase) * o.roll.amp);
      o.vx = (p.x - o.x);
      o.vz = (p.z - o.z);
      o.x = p.x;
      o.z = p.z;
      o.y = this.track.groundHeight(p.x, p.z);
    }
  }

  updateZombies(dt) {
    let lead = -Infinity, last = Infinity;
    for (const r of this.racers) {
      if (r.wrecked) continue;
      lead = Math.max(lead, r.along);
      last = Math.min(last, r.along);
    }
    const t = this.track;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      if (!z.active) {
        if (z.along - lead < ZOMBIE_WAKE) z.active = true;
        else continue;
      }
      if (z.along < last - ZOMBIE_SLEEP) { z.alive = false; continue; }

      const type = ZOMBIES[z.type];
      // Head for the road ahead of the nearest racer, or chase if a runner.
      let tx, tz, speed = type.walk;
      const racer = this.nearestRacer(z);
      const v = racer.vehicle;
      const dist = Math.hypot(v.x - z.x, v.z - z.z);
      if (z.type === 'runner' && dist < type.chaseRange && z.along > racer.along - 5) {
        tx = v.x + v.vx * 0.5;
        tz = v.z + v.vz * 0.5;
        speed = type.run;
        z.state = 'chase';
      } else {
        const near = t.nearestLocal(z.x, z.z, z.hint);
        z.hint = near.index;
        const p = t.pointAt(near.along, near.lateral * 0.2);
        tx = p.x; tz = p.z;
        if (Math.hypot(tx - z.x, tz - z.z) < 1.5) { tx = v.x; tz = v.z; speed *= 0.6; }
        z.state = 'walk';
      }
      const want = Math.atan2(tx - z.x, tz - z.z);
      const diff = Math.atan2(Math.sin(want - z.heading), Math.cos(want - z.heading));
      z.heading += clamp(diff, -3 * dt, 3 * dt);
      z.x += Math.sin(z.heading) * speed * dt;
      z.z += Math.cos(z.heading) * speed * dt;
      z.y = t.groundHeight(z.x, z.z);
      z.phase += dt * speed * 2.2;
    }
  }

  nearestRacer(e) {
    let best = this.racers[0], bestD = Infinity;
    for (const r of this.racers) {
      if (r.wrecked) continue;
      const d = (r.vehicle.x - e.x) ** 2 + (r.vehicle.z - e.z) ** 2;
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  updateCorpses(dt) {
    this.corpses = this.corpses.filter((c) => {
      c.life -= dt;
      c.vy -= 20 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.rot += c.spin * dt;
      return c.life > 0;
    });
  }
}

function cellKey(cx, cz) {
  return cx * 100003 + cz;
}
