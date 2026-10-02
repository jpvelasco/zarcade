// One round on one arena: blobs, floor, power-ups, hazards and the mode's
// scoring. Fixed-step and seeded, so the same seed and controls always
// replay the same round. DOM-free; the renderer and sound only read
// `world` and the `events` list (which the page empties after each frame).
import { BLOB, BUMP, POWER, POWER_KINDS, HAZARD, ROUND, STEP } from './config.js';
import { Rng, hashSeed } from './rng.js';
import { ARENAS, arenaById, createArenaState, updateArena, onFloor, floorVelocity, floorAccel, randomFloorPoint, spawnPoints, crackAt, safeAt } from './arenas.js';
import { collideBlobs, collideBumper, radialPush } from './physics.js';
import { MODE_RULES } from './modes.js';

const NO_INPUT = Object.freeze({ mx: 0, my: 0, dash: false, pound: false });
const AIRBORNE = 18; // above this height blobs pass over each other
const tmpV = { x: 0, y: 0 };
const tmpA = { x: 0, y: 0 };

function makeBlob(i, player, spawn) {
  return {
    i,
    look: player.look || { color: i, face: 0, hat: 0 },
    name: player.name || `P${i + 1}`,
    bot: player.bot || null,
    x: spawn.x, y: spawn.y, vx: 0, vy: 0, z: 0, vz: 0,
    baseRadius: BLOB.radius, radius: BLOB.radius, mass: BLOB.mass,
    facing: Math.atan2(-spawn.y, -spawn.x),
    charge: 0, charging: false,
    dashT: 0, dashCd: 0, dashPower: 0,
    knock: 0,
    pound: 0, // 0 | 1 rising | 2 slamming
    poundCd: 0, heavy: 0,
    grounded: true, falling: false, fallT: 0,
    out: false, eliminated: false, respawnT: 0, invuln: 0,
    shield: 0, giant: 0, sticky: 0, magnet: 0, slime: 0,
    lastHit: -1, lastHitT: -99, cause: 'oops', causeT: -99,
    score: 0, place: 0,
    stats: { bonks: 0, ringouts: 0, pounds: 0, falls: 0, coins: 0, dashes: 0, powerups: 0 },
    moving: false, // stick held this step (for the renderer)
  };
}

export class World {
  // opts: { arena: id, mode: 'lbs'|'koth'|'coins', players: [{ name, look, bot }],
  //         seed, powerups, hazards, target, timeLimit }
  constructor(opts) {
    const def = arenaById(opts.arena) || ARENAS[0];
    this.mode = MODE_RULES[opts.mode] ? opts.mode : 'lbs';
    this.rules = MODE_RULES[this.mode];
    this.seed = (opts.seed ?? 1) >>> 0;
    this.rng = new Rng(hashSeed(this.seed, 0xb10b));
    this.arenaDef = def;
    this.arena = createArenaState(def, { persistent: this.rules.respawns });
    this.powerupsOn = opts.powerups !== false;
    this.hazardsOn = opts.hazards !== false;
    this.target = opts.target || this.rules.defaultTarget;
    this.timeLimit = opts.timeLimit || ROUND.timeLimit;
    const players = opts.players && opts.players.length ? opts.players : [{}, {}];
    const spawns = spawnPoints(this.arena, players.length);
    this.blobs = players.map((p, i) => makeBlob(i, p, spawns[i]));
    this.phase = 'countdown';
    this.clock = 0; // seconds since the round was created
    this.t = 0; // seconds of play since "go"
    this.countdown = ROUND.countdown;
    this.hitstop = 0;
    this.events = [];
    this.powerups = [];
    this.bombs = [];
    this.coins = [];
    this.zone = null;
    this.nextPower = this.range(POWER.every) * 0.6;
    this.nextBomb = this.range(HAZARD.every) + 4;
    this.outOrder = [];
    this.sudden = false;
    this.overtime = false;
    this.result = null;
    this.steps = 0;
    this.rules.init(this);
    this.emit('countdown', { n: Math.ceil(this.countdown) });
  }

  range([a, b]) { return a + this.rng.next() * (b - a); }

  emit(type, data) { this.events.push({ type, ...data }); }

  get playing() { return this.phase === 'play'; }

  // Blobs still in the round (not fallen, not out).
  active() { return this.blobs.filter((b) => !b.out && !b.falling); }

  step(dt = STEP, controls = []) {
    this.clock += dt;
    this.steps++;
    if (this.hitstop > 0) { this.hitstop = Math.max(0, this.hitstop - dt); return; }
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && after > 0) this.emit('countdown', { n: after });
      if (this.countdown <= 0) { this.phase = 'play'; this.emit('go', {}); }
    } else if (this.phase === 'play') {
      this.t += dt;
    }
    const playing = this.phase === 'play';
    updateArena(this.arena, playing ? dt : 0, this.blobs, playing);
    if (playing && this.rules.suddenDeath) this.updateSudden();
    for (const b of this.blobs) this.updateBlob(b, dt, playing ? (controls[b.i] || NO_INPUT) : NO_INPUT);
    this.collide();
    if (playing) {
      this.updatePowerups(dt);
      this.updateBombs(dt);
    }
    for (const b of this.blobs) this.checkFloor(b);
    if (playing) {
      this.rules.step(this, dt);
      const res = this.rules.finished(this);
      if (res) this.finish(res);
    }
  }

  // ---------------------------------------------------------------- blobs

  updateBlob(b, dt, input) {
    if (b.out) {
      if (b.respawnT > 0 && this.phase === 'play') {
        b.respawnT -= dt;
        if (b.respawnT <= 0) this.respawn(b);
      }
      return;
    }
    if (this.phase === 'countdown') return; // frozen until "go"
    if (b.falling) {
      b.fallT += dt;
      b.vz -= BLOB.gravity * dt;
      b.z += b.vz * dt;
      b.vx *= Math.exp(-1.5 * dt);
      b.vy *= Math.exp(-1.5 * dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.fallT >= BLOB.fallTime) this.ringOut(b);
      return;
    }
    // Timers.
    b.dashT = Math.max(0, b.dashT - dt);
    b.dashCd = Math.max(0, b.dashCd - dt);
    b.knock = Math.max(0, b.knock - dt);
    b.poundCd = Math.max(0, b.poundCd - dt);
    b.heavy = Math.max(0, b.heavy - dt);
    b.invuln = Math.max(0, b.invuln - dt);
    b.slime = Math.max(0, b.slime - dt);
    if (b.shield > 0) { b.shield -= dt; if (b.shield <= 0) { b.shield = 0; this.emit('shieldPop', { i: b.i, x: b.x, y: b.y }); } }
    if (b.sticky > 0) b.sticky = Math.max(0, b.sticky - dt);
    if (b.magnet > 0) b.magnet = Math.max(0, b.magnet - dt);
    if (b.giant > 0) { b.giant = Math.max(0, b.giant - dt); if (b.giant === 0) this.emit('shrink', { i: b.i }); }
    // Grow and shrink smoothly.
    const want = b.giant > 0 ? POWER.giant.scale : 1;
    const scale = b.radius / b.baseRadius;
    const next = scale + (want - scale) * Math.min(1, dt * 8);
    b.radius = b.baseRadius * next;
    b.mass = BLOB.mass * (1 + (POWER.giant.mass - 1) * ((next - 1) / (POWER.giant.scale - 1)));

    // Stick.
    let mx = input.mx || 0, my = input.my || 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const hasDir = len > 0.3;
    b.moving = len > 0.15;
    if (b.moving) b.facing = Math.atan2(my, mx);
    // Letting go of the stick a split second before the button still dashes.
    b.dirAge = hasDir ? 0 : (b.dirAge ?? 9) + dt;

    // Ground pound: rise, hang, slam.
    if (b.pound) {
      b.vz -= BLOB.gravity * 1.6 * dt;
      if (b.pound === 1 && b.vz <= 0) { b.pound = 2; b.vz = BLOB.poundSlam; }
      b.z += b.vz * dt;
      b.vx *= Math.exp(-6 * dt);
      b.vy *= Math.exp(-6 * dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.grounded = false;
      if (b.z <= 0) this.land(b);
      return;
    }

    // Dash: hold to charge, let go to launch. Let go without a direction
    // (or press pound) to ground-pound instead.
    const wantsPound = !!input.pound;
    if (input.dash && b.dashCd <= 0 && !wantsPound) {
      if (!b.charging) { b.charging = true; b.charge = 0; this.emit('charge', { i: b.i }); }
      b.charge = Math.min(1, b.charge + dt / BLOB.chargeTime);
    } else if (b.charging) {
      b.charging = false;
      if (hasDir) this.dash(b, mx, my);
      else if (b.dirAge < 0.15) this.dash(b, Math.cos(b.facing), Math.sin(b.facing));
      else this.startPound(b);
      b.charge = 0;
    }
    if (wantsPound && !b.charging) this.startPound(b);
    if (b.pound) return;

    // Steering, relative to the moving floor.
    floorVelocity(this.arena, b.x, b.y, tmpV);
    let accel = BLOB.accel * this.arena.accelMul;
    if (b.charging) accel *= 0.3;
    if (b.slime > 0) accel *= POWER.sticky.slow;
    if (b.dashT > 0) accel *= 0.25;
    if (b.moving) {
      const rel = (b.vx - tmpV.x) * mx + (b.vy - tmpV.y) * my;
      const top = BLOB.maxSpeed * Math.min(1, len) * (b.slime > 0 ? 0.6 : 1);
      if (rel < top) {
        b.vx += mx * accel * dt;
        b.vy += my * accel * dt;
      }
    }
    floorAccel(this.arena, b.x, b.y, tmpA);
    b.vx += tmpA.x * dt;
    b.vy += tmpA.y * dt;
    // Magnets tug everyone else in.
    for (const m of this.blobs) {
      if (m === b || m.magnet <= 0 || m.out || m.falling || b.invuln > 0) continue;
      const dx = m.x - b.x, dy = m.y - b.y, d = Math.hypot(dx, dy);
      if (d > POWER.magnet.range || d < 1) continue;
      const pull = POWER.magnet.pull * (1 - d / POWER.magnet.range) / b.mass;
      b.vx += (dx / d) * pull * dt;
      b.vy += (dy / d) * pull * dt;
    }
    // Friction toward the floor's velocity.
    let fric = BLOB.friction * this.arena.friction;
    // Knocked blobs slide, unless they dig in against the slide.
    if (b.knock > 0) {
      const against = b.moving && (b.vx * mx + b.vy * my) < 0;
      fric *= against ? BLOB.knockFriction * 1.8 : BLOB.knockFriction;
    }
    if (b.dashT > 0) fric *= 0.3;
    if (b.slime > 0) fric *= 1.6;
    const k = Math.exp(-fric * dt);
    b.vx = tmpV.x + (b.vx - tmpV.x) * k;
    b.vy = tmpV.y + (b.vy - tmpV.y) * k;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.grounded = true;
  }

  dash(b, mx, my) {
    const len = Math.hypot(mx, my) || 1;
    const speed = BLOB.dashMin + (BLOB.dashMax - BLOB.dashMin) * b.charge;
    b.vx = (mx / len) * speed;
    b.vy = (my / len) * speed;
    b.facing = Math.atan2(my, mx);
    b.dashT = BLOB.dashTime;
    b.dashPower = b.charge;
    b.dashCd = BLOB.dashCooldown;
    b.stats.dashes++;
    this.emit('dash', { i: b.i, power: b.charge, x: b.x, y: b.y });
  }

  startPound(b) {
    if (b.poundCd > 0 || b.pound || !b.grounded) return;
    b.pound = 1;
    b.vz = BLOB.poundRise;
    b.z = 0.01;
    b.grounded = false;
    b.charging = false;
    b.charge = 0;
    this.emit('hop', { i: b.i, x: b.x, y: b.y });
  }

  land(b) {
    b.z = 0;
    b.vz = 0;
    b.pound = 0;
    b.poundCd = BLOB.poundCooldown;
    b.heavy = 0.22;
    b.grounded = true;
    b.stats.pounds++;
    const reach = BLOB.poundRadius * (b.radius / b.baseRadius);
    const force = BLOB.poundForce * Math.sqrt(b.mass);
    let hits = 0;
    for (const o of this.blobs) {
      if (o === b || o.out || o.falling || o.z > AIRBORNE) continue;
      if (o.invuln > 0) continue;
      if (o.shield > 0 && Math.hypot(o.x - b.x, o.y - b.y) < reach + o.radius) { this.popShield(o); continue; }
      const f = radialPush(o, b.x, b.y, reach, force);
      if (f > 0) {
        hits++;
        o.knock = BLOB.knockTime;
        o.lastHit = b.i; o.lastHitT = this.clock; o.cause = 'pound';
        if (b.sticky > 0) o.slime = POWER.sticky.slime;
      }
    }
    crackAt(this.arena, b.x, b.y, 0, true);
    this.emit('pound', { i: b.i, x: b.x, y: b.y, hits, r: reach });
    if (hits) this.hitstop = Math.max(this.hitstop, 0.07);
  }

  popShield(b) {
    b.shield = 0;
    this.emit('shieldPop', { i: b.i, x: b.x, y: b.y });
  }

  checkFloor(b) {
    if (b.out || b.falling || b.z > 0.5 || b.pound) return;
    if (onFloor(this.arena, b.x, b.y)) return;
    b.falling = true;
    b.fallT = 0;
    b.vz = 0;
    b.charging = false;
    b.stats.falls++;
    const by = b.lastHit >= 0 && this.clock - b.lastHitT < 3.5 ? b.lastHit : -1;
    if (by >= 0) this.blobs[by].stats.ringouts++;
    const recent = Math.max(b.lastHitT, b.causeT);
    const cause = this.clock - recent < 2 ? b.cause : 'oops';
    this.emit('fall', { i: b.i, by, cause, x: b.x, y: b.y });
  }

  ringOut(b) {
    b.falling = false;
    b.out = true;
    b.z = 0;
    b.vx = b.vy = b.vz = 0;
    b.giant = b.sticky = b.magnet = b.shield = b.slime = 0;
    b.radius = b.baseRadius;
    b.mass = BLOB.mass;
    this.outOrder.push(b.i);
    this.emit('out', { i: b.i });
    // A fall after the round is decided (during the celebration) costs nothing.
    if (this.phase !== 'done') this.rules.onOut(this, b);
    if (this.rules.respawns && this.phase !== 'done') b.respawnT = ROUND.respawn;
    else b.eliminated = true;
  }

  respawn(b) {
    const p = this.spawnSpot();
    Object.assign(b, { x: p.x, y: p.y, vx: 0, vy: 0, z: 0, vz: 0, out: false, falling: false, fallT: 0, pound: 0, knock: 0, charge: 0, charging: false, dashT: 0, lastHit: -1, invuln: ROUND.invulnerable, grounded: true });
    this.emit('respawn', { i: b.i, x: p.x, y: p.y });
  }

  // A floor spot away from everyone else.
  spawnSpot() {
    let best = null, bestScore = -Infinity;
    for (let k = 0; k < 8; k++) {
      const p = randomFloorPoint(this.arena, this.rng, 70);
      let near = Infinity;
      for (const o of this.blobs) if (!o.out && !o.falling) near = Math.min(near, Math.hypot(o.x - p.x, o.y - p.y));
      const score = Math.min(near, 400) - Math.hypot(p.x, p.y) * 0.4;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  // ---------------------------------------------------------------- contacts

  collide() {
    const list = this.blobs;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.out || a.falling || a.z > AIRBORNE) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.out || b.falling || b.z > AIRBORNE) continue;
        this.bump(a, b);
      }
      for (const bumper of this.arena.bumpers) {
        const hit = collideBumper(a, bumper);
        if (hit) {
          a.knock = BLOB.knockTime;
          a.cause = 'bumper'; a.causeT = this.clock;
          this.emit('bumper', { i: a.i, x: bumper.x + hit.nx * bumper.r, y: bumper.y + hit.ny * bumper.r, nx: hit.nx, ny: hit.ny, power: hit.speed, bx: bumper.x, by: bumper.y });
        }
      }
    }
  }

  bump(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, rr = a.radius + b.radius;
    if (dx * dx + dy * dy >= rr * rr) return;
    // Attack strength: dashing, and moving toward the other blob.
    const d = Math.hypot(dx, dy) || 1;
    const aIn = (a.vx * dx + a.vy * dy) / d, bIn = -(b.vx * dx + b.vy * dy) / d;
    const aAtk = a.dashT > 0 ? 1 + a.dashPower : 0;
    const bAtk = b.dashT > 0 ? 1 + b.dashPower : 0;
    let boost = BUMP.boost;
    if (aAtk && aIn > 0) boost += BUMP.dashBoost * aAtk * 0.5;
    if (bAtk && bIn > 0) boost += BUMP.dashBoost * bAtk * 0.5;
    // Shields and fresh spawns don't budge; a shield pops on a real hit.
    const closing = aIn + bIn;
    const hard = closing > 260 || aAtk > 0 || bAtk > 0;
    const aWall = a.invuln > 0 || a.heavy > 0 || (a.shield > 0 && hard);
    const bWall = b.invuln > 0 || b.heavy > 0 || (b.shield > 0 && hard);
    const contact = collideBlobs(a, b, { boost: aWall && bWall ? 0 : boost, immovableA: aWall && !bWall, immovableB: bWall && !aWall });
    if (!contact) return;
    if (a.shield > 0 && hard) this.popShield(a);
    if (b.shield > 0 && hard) this.popShield(b);
    const power = contact.speed + (aAtk || bAtk ? 280 : 0);
    // The weaker attacker gets knocked into a long slide.
    if (power > 200) {
      if (aAtk >= bAtk && !bWall) { b.knock = BLOB.knockTime; b.charging = false; b.charge = 0; }
      if (bAtk >= aAtk && !aWall) { a.knock = BLOB.knockTime; a.charging = false; a.charge = 0; }
    }
    a.lastHit = b.i; a.lastHitT = this.clock; a.cause = bAtk ? 'dash' : 'bump';
    b.lastHit = a.i; b.lastHitT = this.clock; b.cause = aAtk ? 'dash' : 'bump';
    if (a.sticky > 0 && !bWall) b.slime = POWER.sticky.slime;
    if (b.sticky > 0 && !aWall) a.slime = POWER.sticky.slime;
    if (power > 160) {
      if (aAtk >= bAtk) a.stats.bonks++;
      if (bAtk > aAtk) b.stats.bonks++;
      const x = a.x + contact.nx * a.radius, y = a.y + contact.ny * a.radius;
      this.emit('bonk', { a: a.i, b: b.i, x, y, nx: contact.nx, ny: contact.ny, power, dash: aAtk > 0 || bAtk > 0 });
      if (power > BUMP.hitstopMin) this.hitstop = Math.max(this.hitstop, Math.min(BUMP.hitstopMax, 0.03 + power / 14000));
    }
  }

  // ---------------------------------------------------------------- items

  updatePowerups(dt) {
    if (this.powerupsOn) {
      this.nextPower -= dt;
      if (this.nextPower <= 0) {
        this.nextPower = this.range(POWER.every);
        if (this.powerups.length < POWER.max) {
          const p = randomFloorPoint(this.arena, this.rng, 70);
          const kind = POWER_KINDS[this.rng.int(POWER_KINDS.length)];
          this.powerups.push({ kind, x: p.x, y: p.y, t: 0, life: 12 });
          this.emit('powerSpawn', { kind, x: p.x, y: p.y });
        }
      }
    }
    for (let k = this.powerups.length - 1; k >= 0; k--) {
      const p = this.powerups[k];
      p.t += dt;
      if (p.t > p.life || !onFloor(this.arena, p.x, p.y)) { this.powerups.splice(k, 1); continue; }
      for (const b of this.blobs) {
        if (b.out || b.falling || b.z > AIRBORNE) continue;
        const r = b.radius + 22;
        if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 > r * r) continue;
        this.grant(b, p.kind);
        this.powerups.splice(k, 1);
        break;
      }
    }
  }

  grant(b, kind) {
    b.stats.powerups++;
    if (kind === 'giant') b.giant = POWER.giant.time;
    else if (kind === 'sticky') b.sticky = POWER.sticky.time;
    else if (kind === 'magnet') b.magnet = POWER.magnet.time;
    else if (kind === 'shield') b.shield = POWER.shield.time;
    this.emit('powerup', { i: b.i, kind, x: b.x, y: b.y });
  }

  updateBombs(dt) {
    if (this.hazardsOn) {
      this.nextBomb -= dt;
      if (this.nextBomb <= 0) {
        this.nextBomb = this.range(HAZARD.every);
        const live = this.active();
        let p;
        if (live.length && this.rng.next() < 0.55) {
          const b = live[this.rng.int(live.length)];
          p = { x: b.x + (this.rng.next() - 0.5) * 80, y: b.y + (this.rng.next() - 0.5) * 80 };
        } else p = randomFloorPoint(this.arena, this.rng, 50);
        this.bombs.push({ x: p.x, y: p.y, t: 0, warn: HAZARD.warn });
        this.emit('bombWarn', { x: p.x, y: p.y });
      }
    }
    for (let k = this.bombs.length - 1; k >= 0; k--) {
      const bomb = this.bombs[k];
      bomb.t += dt;
      if (bomb.t < bomb.warn) continue;
      this.bombs.splice(k, 1);
      for (const b of this.blobs) {
        if (b.out || b.falling || b.invuln > 0) continue;
        if (b.shield > 0 && Math.hypot(b.x - bomb.x, b.y - bomb.y) < HAZARD.radius + b.radius) { this.popShield(b); continue; }
        if (b.z > AIRBORNE * 2) continue;
        if (radialPush(b, bomb.x, bomb.y, HAZARD.radius, HAZARD.force) > 0) { b.knock = BLOB.knockTime; b.cause = 'bomb'; b.causeT = this.clock; }
      }
      crackAt(this.arena, bomb.x, bomb.y, HAZARD.radius * 0.5, true);
      this.emit('bomb', { x: bomb.x, y: bomb.y, r: HAZARD.radius });
      this.hitstop = Math.max(this.hitstop, 0.06);
    }
  }

  // Sudden death: after the round timer, a closing ring removes the floor.
  updateSudden() {
    if (this.t < ROUND.lbsTime) return;
    if (!this.sudden) { this.sudden = true; this.emit('sudden', {}); }
    const p = (this.t - ROUND.lbsTime) / ROUND.suddenTime;
    this.arena.storm = Math.max(0, this.arena.extent * 1.05 * (1 - p));
  }

  // ---------------------------------------------------------------- end

  finish(res) {
    this.phase = 'done';
    // Scores as they stood when the round was decided, for the results.
    this.result = { ...res, scores: this.blobs.map((b) => Math.floor(b.score)) };
    for (const b of this.blobs) b.charging = false;
    this.emit('roundOver', { winner: res.winner });
  }

  // Seconds left on the clock (null in Last Blob Standing before sudden death).
  timeLeft() {
    if (this.mode === 'lbs') return this.sudden ? 0 : Math.max(0, ROUND.lbsTime - this.t);
    return Math.max(0, this.timeLimit - this.t);
  }

  isSafe(x, y, margin) { return safeAt(this.arena, x, y, margin); }
}
