import { Lane } from './lane.js';
import { buildJourney } from './journey.js';
import { LANE, PLAYER, CANNON, ENEMIES, HAZARDS, PICKUPS, BOLT } from './entities.js';
import { statsFor } from './progress.js';
import { aiInput } from './ai.js';
import { clamp, rng } from './math.js';

export const INTRO = 2.5;
const SPAWN_AHEAD = 440;
const BEHIND = 60;          // things this far behind the jet are gone
const BOSS_GAP = 150;
const ARRIVE_TIME = 4;
const COMBO_WINDOW = 1.5;
const TARGETABLE = new Set(['fighter', 'drone', 'ghost', 'turret', 'bosspart', 'bosscore']);

// One journey to one planet. Pure simulation in lane coordinates
// (s along, u sideways, w up); everything that happens goes onto `events`.
export class World {
  constructor(planet, { stats = statsFor(), autopilot = false } = {}) {
    this.planet = planet;
    this.journey = buildJourney(planet);
    this.lane = new Lane(planet.seed);
    this.rand = rng(planet.seed * 97 + 3);
    this.stats = stats;
    this.difficulty = this.journey.difficulty;
    this.time = -INTRO;
    this.status = 'intro'; // intro | flying | hyper | shop | boss | arriving | finished | destroyed
    this.events = [];
    this.statics = this.journey.statics.map((o) => ({ ...o, alive: true }));
    this.pickups = this.journey.pickups.map((o) => ({ ...o, alive: true }));
    this.spawnIndex = 0;
    this.enemies = [];
    this.bolts = [];
    this.enemyBolts = [];
    this.missiles = [];
    this.boss = null;
    this.nextId = this.journey.nextId + 1000;
    this.player = {
      s: 0, sPrev: 0, u: 0, w: 0, vu: 0, vw: 0, speed: stats.cruise,
      hull: stats.hull, maxHull: stats.hull, shield: stats.shield, maxShield: stats.shield, sinceHit: 9,
      boost: 1, boosting: false, cannon: stats.cannonStart, missiles: stats.missiles,
      fireCooldown: 0, missileCooldown: 0, roll: 0, rollDir: 0, rollCooldown: 0, rollHeld: false, invuln: 0,
      score: 0, dust: 0, kills: 0, spawned: 0, combo: 0, comboTimer: 0,
      hyper: 0, hyperEnd: 0, hyperDustS: 0, burgerDone: false, lock: null, autopilot,
    };
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  get landmarkAhead() {
    const p = this.player;
    return !p.burgerDone && this.journey.burger.s > p.s ? this.journey.burger.s : this.journey.bossS;
  }

  step(dt, input = {}) {
    if (this.status === 'shop' || this.status === 'finished' || this.status === 'destroyed') return;
    this.time += dt;
    const p = this.player;
    if (this.status === 'intro') {
      if (this.time < 0) return;
      this.status = 'flying';
      this.emit('launch');
    }
    const ctl = p.autopilot ? aiInput(this) : input;
    this.stepPlayer(dt, ctl);
    this.fireTriggers();
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateStatics(dt);
    this.updateBolts(dt);
    this.updateMissiles(dt);
    this.checkPickups(dt);
    this.checkBurger();

    if (p.hull <= 0 && this.status !== 'destroyed') {
      p.hull = 0;
      this.status = 'destroyed';
      this.emit('destroyed', { s: p.s, u: p.u, w: p.w });
    } else if (this.status === 'arriving' && this.time >= this.arriveAt) {
      this.status = 'finished';
      this.emit('arrived');
    }
  }

  // ------------------------------------------------------------ player

  stepPlayer(dt, ctl) {
    const p = this.player, st = this.stats;
    const hyper = this.status === 'hyper';

    // Barrel roll: a quick dodge that deflects enemy bolts.
    const rollPress = ctl.rollLeft ? -1 : ctl.rollRight ? 1 : 0;
    if (rollPress && !p.rollHeld && p.rollCooldown <= 0 && !hyper) {
      p.roll = PLAYER.rollTime;
      p.rollDir = rollPress;
      p.rollCooldown = PLAYER.rollCooldown;
      p.vu += rollPress * 16;
      this.emit('roll', { dir: rollPress });
    }
    p.rollHeld = !!rollPress;
    p.roll = Math.max(0, p.roll - dt);
    p.rollCooldown -= dt;

    // Snappy arcade steering: quick to speed up, quicker to stop when you
    // let go, so you can line up with things without sliding past them.
    p.vu = steer(p.vu, clamp(ctl.x || 0, -1, 1) * st.lateral, dt, p.roll > 0);
    p.vw = steer(p.vw, clamp(ctl.y || 0, -1, 1) * st.lateral * 0.85, dt, false);
    p.u += p.vu * dt;
    p.w += p.vw * dt;
    // Soft lane edges: outward motion eases off near the edge instead of
    // bouncing you back toward the middle.
    [p.u, p.vu] = softEdge(p.u, p.vu, LANE.halfU, dt);
    [p.w, p.vw] = softEdge(p.w, p.vw, LANE.halfW, dt);

    let target = st.cruise;
    p.boosting = false;
    if (hyper) target = st.cruise * PICKUPS.hyper.speed;
    else if (this.boss && this.boss.phase !== 'arrive') target = st.cruise;
    else if (ctl.boost && p.boost > 0.05) { target = st.boost; p.boost -= st.boostBurn * dt; p.boosting = true; }
    else if (ctl.brake) target = PLAYER.brake;
    if (!p.boosting) p.boost = Math.min(1, p.boost + 0.16 * dt);
    p.speed += (target - p.speed) * Math.min(1, dt * (hyper ? 4 : 2.5));
    p.sPrev = p.s;
    p.s += p.speed * dt;

    p.sinceHit += dt;
    if (p.sinceHit > st.shieldDelay) p.shield = Math.min(p.maxShield, p.shield + st.shieldRegen * dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.comboTimer -= dt;
    if (p.comboTimer <= 0) p.combo = 0;

    p.lock = this.lockTarget();
    p.fireCooldown -= dt;
    p.missileCooldown -= dt;
    if (!hyper && this.status !== 'arriving') {
      if (ctl.fire && p.fireCooldown <= 0) this.fireCannons();
      if (ctl.missile && p.missiles > 0 && p.missileCooldown <= 0) this.launchMissile();
    }

    if (hyper) {
      p.hyper -= dt;
      // A ribbon of stardust to chase through the tunnel.
      while (p.hyperDustS < p.s + 500) {
        p.hyperDustS += 28;
        const t = p.hyperDustS;
        this.pickups.push({ id: this.nextId++, type: 'dust', s: t, u: Math.sin(t * 0.0035) * 16, w: Math.cos(t * 0.0027) * 9, alive: true, hyper: true });
      }
      if (p.hyper <= 0 || p.s >= p.hyperEnd) this.endHyper();
    }
  }

  lockTarget() {
    const p = this.player;
    let best = null, bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || !this.targetable(e)) continue;
      const ds = e.s - p.s;
      if (ds < 25 || ds > 380) continue;
      const miss = Math.hypot(e.u - p.u, e.w - p.w);
      if (miss > 3 + ds * 0.035 + e.r) continue;
      const score = miss + ds * 0.02;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  targetable(e) {
    if (e.kind === 'ghost' && !e.visible) return false;
    if (e.kind === 'bosscore' && this.boss && this.boss.phase !== 'core') return false;
    return TARGETABLE.has(e.kind);
  }

  fireCannons() {
    const p = this.player;
    const level = CANNON[clamp(p.cannon, 1, CANNON.length - 1)];
    const vs = p.speed + PLAYER.boltSpeed;
    const target = p.lock;
    const make = (u0, yaw) => {
      let vu = Math.tan(yaw) * vs, vw = 0;
      if (target && yaw === 0) {
        // Aim assist: converge on the locked target.
        const t = Math.max(0.05, (target.s - p.s) / Math.max(40, vs - (target.vs || 0)));
        vu = (target.u + (target.vu || 0) * t - (p.u + u0)) / t;
        vw = (target.w + (target.vw || 0) * t - p.w) / t;
      }
      this.bolts.push({ s: p.s + 2, sPrev: p.s, u: p.u + u0, w: p.w - 0.3, vs, vu, vw, life: BOLT.life, dmg: this.stats.cannonDamage });
    };
    for (const off of level.offsets) make(off, 0);
    for (const a of level.angles) { make(0, a); make(0, -a); }
    p.fireCooldown = level.interval;
    this.emit('shoot', { level: p.cannon });
  }

  launchMissile() {
    const p = this.player;
    p.missiles--;
    p.missileCooldown = 0.5;
    const target = p.lock || this.bestMissileTarget();
    this.missiles.push({ s: p.s + 3, u: p.u, w: p.w - 1, vs: p.speed + 40, vu: 0, vw: 0, target, life: 4 });
    this.emit('missile', { s: p.s, u: p.u, w: p.w });
  }

  bestMissileTarget() {
    const p = this.player;
    let best = null, bestD = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || !this.targetable(e) || e.s < p.s + 20 || e.s > p.s + 500) continue;
      const d = (e.s - p.s) + Math.hypot(e.u - p.u, e.w - p.w) * 3 - (e.kind.startsWith('boss') || e.kind === 'turret' ? 200 : 0);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // Shields soak damage first. Rolling deflects bolts; hyperspace and a
  // short grace period after a crash make you untouchable.
  damage(amount, { bolt = false } = {}) {
    const p = this.player;
    if (this.status === 'hyper' || this.status === 'arriving') return false;
    if (bolt && p.roll > 0) { this.emit('deflect', { s: p.s, u: p.u, w: p.w }); return false; }
    if (!bolt && p.invuln > 0) return false;
    if (!bolt) p.invuln = 0.6;
    p.sinceHit = 0;
    const absorbed = Math.min(p.shield, amount);
    p.shield -= absorbed;
    p.hull -= amount - absorbed;
    this.emit('hurt', { amount, shielded: absorbed >= amount });
    return true;
  }

  // ------------------------------------------------------------ spawning

  fireTriggers() {
    const p = this.player;
    const spawns = this.journey.spawns;
    while (this.spawnIndex < spawns.length && spawns[this.spawnIndex].s - p.s < SPAWN_AHEAD) {
      const sp = spawns[this.spawnIndex++];
      if (this.status === 'hyper' || sp.s < p.s) continue; // flew past it
      this.spawnGroup(sp);
    }
    if (!this.boss && p.s >= this.journey.bossS - BOSS_GAP - 80) this.spawnBoss();
  }

  addEnemy(kind, props) {
    const t = ENEMIES[kind];
    // Bosses toughen more gently with depth so fights stay around 30-50 s.
    const scale = kind === 'drone' ? 1 : kind.startsWith('boss') ? 1 + (this.difficulty - 1) * 0.45 : this.difficulty;
    const hp = Math.max(1, Math.round(t.hp * scale));
    const e = { id: this.nextId++, kind, r: t.r, hp, maxHp: hp, alive: true, age: 0, vu: 0, vw: 0, fireTimer: t.fire ? 0.8 + this.rand() * t.fire : 0, phase: this.rand() * 6.28, ...props };
    this.enemies.push(e);
    this.player.spawned++;
    return e;
  }

  spawnGroup(sp) {
    const p = this.player;
    const r = this.rand;
    if (sp.kind === 'squadron') {
      for (let i = 0; i < sp.count; i++) {
        const mid = (sp.count - 1) / 2, k = i - mid;
        let du = k * 8.5, dw = 0, ds = Math.abs(k) * 8;
        if (sp.formation === 'line') { du = k * 9; ds = 0; dw = Math.sin(i) * 2; }
        if (sp.formation === 'ring') { const a = (i / sp.count) * Math.PI * 2; du = Math.cos(a) * 13; dw = Math.sin(a) * 9; ds = 0; }
        this.addEnemy('fighter', {
          s: p.s + 470 + ds, u: clamp(sp.u + du, -LANE.halfU, LANE.halfU), w: clamp(sp.w + dw, -LANE.halfW, LANE.halfW),
          vs: p.speed * 0.3, state: 'approach', hold: 62 + ds, homeU: sp.u + du, homeW: sp.w + dw, engage: 7 + r() * 3,
        });
      }
      this.emit('incoming', { kind: 'squadron' });
    } else if (sp.kind === 'drones') {
      for (let i = 0; i < sp.count; i++) {
        this.addEnemy('drone', { s: p.s + 380 + r() * 160, u: (r() * 2 - 1) * LANE.halfU, w: (r() * 2 - 1) * LANE.halfW, vs: p.speed * 0.2, state: 'rush' });
      }
    } else if (sp.kind === 'ghosts') {
      for (let i = 0; i < sp.count; i++) {
        this.addEnemy('ghost', {
          s: p.s + 440 + i * 25, u: (r() * 2 - 1) * (LANE.halfU - 6), w: (r() * 2 - 1) * (LANE.halfW - 4), vs: p.speed * 0.3,
          state: 'approach', hold: 70 + i * 12, engage: 9 + r() * 3, visible: true, blink: r() * 2,
        });
      }
      this.emit('incoming', { kind: 'ghosts' });
    } else if (sp.kind === 'cruiser') {
      const c = { id: this.nextId++, kind: 'cruiser', s: p.s + 560, u: sp.u, w: sp.w, vs: this.stats.cruise * 0.6, half: { s: 36, u: 6, w: 4.5 }, alive: true, turrets: 0 };
      this.enemies.push(c);
      for (let i = 0; i < sp.turrets; i++) {
        const ds = -28 + (56 * i) / Math.max(1, sp.turrets - 1);
        this.addEnemy('turret', { s: c.s + ds, u: c.u - Math.sign(c.u) * 5.5, w: c.w + 4.5, vs: c.vs, parent: c, ds, du: -Math.sign(c.u) * 5.5, dw: 4.5 });
        c.turrets++;
      }
      this.emit('incoming', { kind: 'cruiser' });
    }
  }

  spawnBoss() {
    const p = this.player;
    const n = Math.min(8, 4 + Math.floor(this.journey.depth / 2));
    const b = { s: p.s + BOSS_GAP + 260, u: 0, w: 0, vs: p.speed * 0.4, phase: 'arrive', t: 0, parts: [], core: null, droneTimer: 5, half: { s: 30, u: 26, w: 8 } };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      b.parts.push(this.addEnemy('bosspart', { s: b.s - 26, u: Math.cos(a) * 18, w: Math.sin(a) * 7, vs: b.vs, boss: true, du: Math.cos(a) * 18, dw: Math.sin(a) * 7 }));
    }
    b.core = this.addEnemy('bosscore', { s: b.s - 28, u: 0, w: 0, vs: b.vs, boss: true, du: 0, dw: 0 });
    this.boss = b;
    this.status = this.status === 'hyper' ? 'hyper' : 'boss';
    this.emit('bossWarning');
  }

  // ------------------------------------------------------------ enemies

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.age += dt;
      if (e.kind === 'fighter' || e.kind === 'ghost') this.flyEngager(e, dt);
      else if (e.kind === 'drone') this.flyDrone(e, dt);
      else if (e.kind === 'cruiser') e.s += e.vs * dt;
      else if (e.kind === 'turret') { e.s = e.parent.s + e.ds; e.u = e.parent.u + e.du; e.w = e.parent.w + e.dw; }

      if (e.kind === 'ghost') {
        // Phase in and out; only solid (and hittable) while visible.
        e.blink += dt;
        const t = ENEMIES.ghost;
        const cycle = t.visible + t.hidden;
        const was = e.visible;
        e.visible = e.blink % cycle < t.visible;
        if (was !== e.visible) this.emit('phase', { id: e.id, visible: e.visible });
      }

      // Shooting.
      const t = ENEMIES[e.kind];
      if (t && t.fire && e.s > p.s + 30 && e.s < p.s + 340 && (e.kind !== 'ghost' || e.visible) && !e.boss) {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = t.fire / this.difficulty * (0.8 + this.rand() * 0.4);
          this.enemyFire(e);
        }
      }

      if (e.s < p.s - BEHIND) e.alive = false;
      if (e.kind === 'cruiser') this.checkBox(e, 16);
      else if (t && t.contact && (e.kind !== 'ghost' || e.visible)) {
        if (dist3(e, p) < e.r + PLAYER.radius) {
          this.damage(t.contact);
          this.destroyEnemy(e, 'ram');
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  flyEngager(e, dt) {
    const p = this.player;
    if (e.state === 'approach') {
      e.s += e.vs * dt;
      if (e.s - p.s <= e.hold) { e.state = 'engage'; e.t = 0; }
    } else if (e.state === 'engage') {
      e.t += dt;
      // Hold position ahead of the jet, weaving.
      e.vs = p.speed + (e.s - p.s < e.hold ? 4 : -4);
      e.s += e.vs * dt;
      e.u += ((e.homeU ?? e.u) + Math.sin(e.age * 0.9 + e.phase) * 8 - e.u) * Math.min(1, dt * 1.5);
      e.w += ((e.homeW ?? e.w) + Math.cos(e.age * 0.7 + e.phase) * 5 - e.w) * Math.min(1, dt * 1.5);
      if (e.t > e.engage) { e.state = 'leave'; e.vs = p.speed - 110; }
    } else {
      e.s += e.vs * dt;
      e.u += Math.sign(e.u || 1) * 12 * dt;
    }
  }

  flyDrone(e, dt) {
    const p = this.player;
    e.s += e.vs * dt;
    const ahead = e.s - p.s;
    if (ahead > 0) {
      const t = Math.max(0.3, ahead / Math.max(20, p.speed - e.vs));
      const speed = ENEMIES.drone.speed * 0.4 * this.difficulty;
      const du = (p.u - e.u) / t, dw = (p.w - e.w) / t;
      const m = Math.hypot(du, dw);
      e.vu = m > speed ? (du / m) * speed : du;
      e.vw = m > speed ? (dw / m) * speed : dw;
    }
    e.u += e.vu * dt;
    e.w += e.vw * dt;
  }

  // Enemies lead their shots; deeper into the galaxy they aim better and
  // fighters fire three-shot spreads.
  enemyFire(e) {
    const p = this.player;
    const vs = e.vs - BOLT.enemySpeed;
    const closing = p.speed - vs;
    const t = Math.max(0.4, (e.s - p.s) / closing);
    const lead = Math.min(1, 0.55 + 0.1 * this.journey.depth);
    const miss = (this.rand() - 0.5) * 2.5;
    const aimU = (p.u + p.vu * t * lead + miss - e.u) / t, aimW = (p.w + p.vw * t * lead - e.w) / t;
    const spreads = e.kind === 'fighter' && this.journey.depth >= 3 ? [-5, 0, 5] : [0];
    for (const sp of spreads) {
      this.enemyBolts.push({
        s: e.s - e.r, sPrev: e.s, u: e.u, w: e.w, vs, vu: aimU + sp, vw: aimW,
        life: t + 1.5, dmg: BOLT.enemyDamage * (0.8 + 0.2 * this.difficulty),
      });
    }
    this.emit('enemyShoot', { kind: e.kind });
  }

  // Axis-aligned box collision in lane coordinates (cruisers, the boss hull).
  checkBox(box, damage) {
    const p = this.player;
    const h = box.half;
    const ds = p.s - box.s, du = p.u - box.u, dw = p.w - box.w;
    const r = PLAYER.radius;
    if (Math.abs(ds) > h.s + r || Math.abs(du) > h.u + r || Math.abs(dw) > h.w + r) return false;
    if (this.damage(damage)) this.emit('crash', { s: p.s, u: p.u, w: p.w });
    // Shove the jet out along the shallowest axis (never backward).
    const pu = h.u + r - Math.abs(du), pw = h.w + r - Math.abs(dw);
    if (pu < pw) { p.u = box.u + Math.sign(du || 1) * (h.u + r); p.vu = 0; }
    else { p.w = box.w + Math.sign(dw || 1) * (h.w + r); p.vw = 0; }
    return true;
  }

  destroyEnemy(e, cause) {
    if (!e.alive) return;
    e.alive = false;
    const p = this.player;
    const t = ENEMIES[e.kind];
    p.kills++;
    p.combo = p.comboTimer > 0 ? p.combo + 1 : 1;
    p.comboTimer = COMBO_WINDOW;
    const points = t.score * Math.min(p.combo, 6);
    p.score += points;
    p.dust += t.dust;
    this.emit('explode', { kind: e.kind, id: e.id, s: e.s, u: e.u, w: e.w, big: e.kind.startsWith('boss'), points, combo: p.combo, cause });
    if (e.kind === 'turret' && e.parent && --e.parent.turrets <= 0) {
      e.parent.alive = false;
      p.score += 500;
      p.dust += 10;
      this.emit('explode', { kind: 'cruiser', id: e.parent.id, s: e.parent.s, u: e.parent.u, w: e.parent.w, big: true, points: 500, combo: 0 });
    }
    if (e.kind === 'bosspart' && this.boss && this.boss.parts.every((b) => !b.alive)) {
      this.boss.phase = 'core';
      this.emit('coreExposed');
    }
    if (e.kind === 'bosscore' && this.boss) {
      this.boss.phase = 'dead';
      this.status = 'arriving';
      this.arriveAt = this.time + ARRIVE_TIME;
      this.enemyBolts.length = 0;
      for (const o of this.enemies) if (o.alive && o !== e) { o.alive = false; this.emit('explode', { kind: o.kind, id: o.id, s: o.s, u: o.u, w: o.w, big: false, points: 0 }); }
      this.emit('bossDown', { s: this.boss.s, u: this.boss.u, w: this.boss.w });
    }
  }

  hitEnemy(e, dmg) {
    e.hp -= dmg;
    this.emit('hit', { id: e.id, s: e.s, u: e.u, w: e.w, kind: e.kind });
    if (e.hp <= 0) this.destroyEnemy(e, 'shot');
  }

  // ------------------------------------------------------------ boss

  updateBoss(dt) {
    const b = this.boss, p = this.player;
    if (!b || b.phase === 'dead') return;
    b.t += dt;
    if (b.phase === 'arrive') {
      b.s += b.vs * dt;
      if (b.s - p.s <= BOSS_GAP) { b.phase = 'fight'; this.emit('bossFight'); }
    } else {
      b.s = p.s + BOSS_GAP;
      b.vs = p.speed;
      b.u = Math.sin(b.t * 0.3) * 9;
      b.w = Math.sin(b.t * 0.45) * 4;
    }
    for (const part of [...b.parts, b.core]) {
      if (!part.alive) continue;
      part.s = b.s - 26 - (part === b.core ? 2 : 0);
      part.u = b.u + part.du;
      part.w = b.w + part.dw;
      part.vs = b.vs;
    }
    if (b.phase === 'arrive') return;
    const d = this.difficulty;
    for (const part of b.parts) {
      if (!part.alive) continue;
      part.fireTimer -= dt;
      if (part.fireTimer <= 0) { part.fireTimer = ENEMIES.bosspart.fire / d * (0.8 + this.rand() * 0.5); this.enemyFire(part); }
    }
    if (b.phase === 'core') {
      const c = b.core;
      c.fireTimer -= dt;
      if (c.fireTimer <= 0) {
        c.fireTimer = ENEMIES.bosscore.fire / d;
        // A ring of bolts with a gap to fly through, plus an aimed shot.
        const gap = this.rand() * Math.PI * 2;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          if (Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) < 0.6) continue;
          this.enemyBolts.push({ s: c.s - 6, sPrev: c.s, u: c.u, w: c.w, vs: c.vs - BOLT.enemySpeed * 0.8, vu: Math.cos(a) * 16, vw: Math.sin(a) * 11, life: 4, dmg: BOLT.enemyDamage });
        }
        this.enemyFire(c);
      }
      b.droneTimer -= dt;
      if (b.droneTimer <= 0) {
        b.droneTimer = 6 / d;
        for (let i = 0; i < 3; i++) this.addEnemy('drone', { s: b.s - 20, u: b.u + (i - 1) * 12, w: b.w, vs: p.speed * 0.2, state: 'rush' });
      }
    }
    this.checkBox(b, 16);
  }

  // ------------------------------------------------------------ hazards

  updateStatics(dt) {
    const p = this.player;
    const hyper = this.status === 'hyper';
    const spawned = [];
    for (const o of this.statics) {
      if (!o.alive) continue;
      if (o.s < p.s - BEHIND) { o.alive = false; continue; }
      if (o.s > p.s + 900) continue;
      if (o.kind === 'asteroid') {
        o.u += o.du * dt;
        o.w += o.dw * dt;
        if (!hyper && dist3(o, p) < HAZARDS.asteroid[o.size].r + PLAYER.radius) {
          if (this.damage(HAZARDS.asteroid[o.size].damage)) this.emit('crash', { s: p.s, u: p.u, w: p.w });
          this.breakAsteroid(o, spawned, false);
        }
      } else if (o.kind === 'mine') {
        if (!hyper && dist3(o, p) < HAZARDS.mine.trigger) this.detonateMine(o);
      } else if (o.kind === 'wreck' && !hyper) {
        const h = { s: o.size.s / 2, u: o.size.u / 2, w: o.size.w / 2 };
        this.checkBox({ s: o.s, u: o.u, w: o.w, half: h }, HAZARDS.wreck.damage);
      }
    }
    if (spawned.length) this.statics.push(...spawned);
    if (this.statics.length > 600) this.statics = this.statics.filter((o) => o.alive);
  }

  breakAsteroid(o, out, byPlayer = true) {
    o.alive = false;
    const t = HAZARDS.asteroid[o.size];
    if (byPlayer) { this.player.score += t.score; this.player.dust += t.dust; }
    this.emit('rockBreak', { id: o.id, size: o.size, s: o.s, u: o.u, w: o.w });
    if (o.size > 1) {
      for (const sign of [-1, 1]) {
        out.push({
          id: this.nextId++, kind: 'asteroid', size: o.size - 1, s: o.s + this.rand() * 4, u: o.u + sign * t.r * 0.5, w: o.w + (this.rand() - 0.5) * t.r,
          hp: HAZARDS.asteroid[o.size - 1].hp, du: sign * (4 + this.rand() * 4), dw: (this.rand() - 0.5) * 6, spin: (this.rand() - 0.5) * 3, alive: true,
        });
      }
    }
  }

  detonateMine(o) {
    o.alive = false;
    const p = this.player;
    this.emit('explode', { kind: 'mine', id: o.id, s: o.s, u: o.u, w: o.w, big: false, points: 0 });
    if (dist3(o, p) < HAZARDS.mine.blast) this.damage(HAZARDS.mine.damage);
  }

  // ------------------------------------------------------------ projectiles

  updateBolts(dt) {
    const p = this.player;
    const spawned = [];
    this.bolts = this.bolts.filter((b) => {
      b.life -= dt;
      b.sPrev = b.s;
      b.s += b.vs * dt;
      b.u += b.vu * dt;
      b.w += b.vw * dt;
      if (b.life <= 0 || b.s > p.s + 600) return false;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.kind === 'cruiser') {
          if (sweptBox(b, e)) { this.emit('ping', { s: b.s, u: b.u, w: b.w }); return false; }
          continue;
        }
        if (!this.targetable(e)) {
          if (e.kind === 'bosscore' && sweptHit(b, e, e.r)) { this.emit('ping', { s: b.s, u: b.u, w: b.w }); return false; }
          continue;
        }
        if (sweptHit(b, e, e.r + 0.6)) { this.hitEnemy(e, b.dmg); return false; }
      }
      for (const o of this.statics) {
        if (!o.alive || Math.abs(o.s - b.s) > 12) continue;
        if (o.kind === 'asteroid' && sweptHit(b, o, HAZARDS.asteroid[o.size].r + 0.4)) {
          if ((o.hp -= b.dmg) <= 0) this.breakAsteroid(o, spawned);
          else this.emit('ping', { s: b.s, u: b.u, w: b.w });
          return false;
        }
        if (o.kind === 'mine' && sweptHit(b, o, HAZARDS.mine.r + 0.6)) { p.score += HAZARDS.mine.score; this.detonateMine(o); return false; }
        if (o.kind === 'wreck' && sweptBox(b, { s: o.s, u: o.u, w: o.w, half: { s: o.size.s / 2, u: o.size.u / 2, w: o.size.w / 2 } })) return false;
      }
      return true;
    });
    if (spawned.length) this.statics.push(...spawned);

    this.enemyBolts = this.enemyBolts.filter((b) => {
      b.life -= dt;
      b.sPrev = b.s;
      b.s += b.vs * dt;
      b.u += b.vu * dt;
      b.w += b.vw * dt;
      if (b.life <= 0 || b.s < p.s - 30) return false;
      // The jet moves too; test against its path this step.
      const lo = Math.min(b.s, b.sPrev) - 1.5, hi = Math.max(b.s, b.sPrev) + 1.5;
      if (p.s >= lo - p.speed * dt && p.s <= hi && Math.hypot(b.u - p.u, b.w - p.w) < PLAYER.radius + 0.6) {
        this.damage(b.dmg, { bolt: true });
        return false;
      }
      return true;
    });
  }

  updateMissiles(dt) {
    const p = this.player;
    this.missiles = this.missiles.filter((m) => {
      m.life -= dt;
      m.vs += (PLAYER.missileSpeed + p.speed - m.vs) * Math.min(1, dt * 2);
      if (m.target && m.target.alive) {
        const t = Math.max(0.1, (m.target.s - m.s) / Math.max(30, m.vs - (m.target.vs || 0)));
        m.vu += ((m.target.u - m.u) / t - m.vu) * Math.min(1, dt * 6);
        m.vw += ((m.target.w - m.w) / t - m.vw) * Math.min(1, dt * 6);
      }
      m.sPrev = m.s;
      m.s += m.vs * dt;
      m.u += m.vu * dt;
      m.w += m.vw * dt;
      let hit = m.life <= 0;
      if (!hit) {
        for (const e of this.enemies) {
          if (e.alive && (this.targetable(e) || e.kind === 'cruiser') && Math.abs(e.s - m.s) < 12 && Math.hypot(e.u - m.u, e.w - m.w) < (e.half ? e.half.u : e.r) + 1.5) { hit = true; break; }
        }
      }
      if (hit) this.missileBlast(m);
      return !hit;
    });
  }

  missileBlast(m) {
    const blast = PLAYER.missileBlast + 2;
    this.emit('explode', { kind: 'missile', s: m.s, u: m.u, w: m.w, big: false, points: 0 });
    for (const e of this.enemies) {
      if (!e.alive || !this.targetable(e)) continue;
      if (dist3(e, m) < blast + e.r) this.hitEnemy(e, this.stats.missileDamage);
    }
    const spawned = [];
    for (const o of this.statics) {
      if (o.alive && o.kind === 'asteroid' && dist3(o, m) < blast + HAZARDS.asteroid[o.size].r) this.breakAsteroid(o, spawned);
      else if (o.alive && o.kind === 'mine' && dist3(o, m) < blast) this.detonateMine(o);
    }
    this.statics.push(...spawned);
  }

  // ------------------------------------------------------------ pickups, burger, hyperspace

  checkPickups(dt = 1 / 60) {
    const p = this.player;
    for (const k of this.pickups) {
      if (!k.alive || k.s < p.s - 10 || k.s > p.s + 70) continue;
      // Gentle magnet: things you're nearly lined up with drift into reach.
      const du = p.u - k.u, dw = p.w - k.w, off = Math.hypot(du, dw);
      if (k.s > p.s + 10) {
        if (off < 11 && off > 0.01) {
          const pull = Math.min(off, 22 * dt);
          k.u += (du / off) * pull;
          k.w += (dw / off) * pull;
        }
        continue;
      }
      if (Math.hypot(k.s - p.s, k.u - p.u, k.w - p.w) > PICKUPS[k.type].r + PLAYER.radius) continue;
      k.alive = false;
      this.applyPickup(k.type);
      this.emit('pickup', { kind: k.type, id: k.id, s: k.s, u: k.u, w: k.w });
    }
    if (this.pickups.length > 400) this.pickups = this.pickups.filter((k) => k.alive && k.s > p.s - 20);
  }

  applyPickup(type) {
    const p = this.player;
    if (type === 'dust') { p.dust += 1; p.score += 10; }
    else if (type === 'power') { if (p.cannon < CANNON.length - 1) p.cannon++; else p.score += 500; }
    else if (type === 'shield') p.shield = p.maxShield;
    else if (type === 'repair') p.hull = Math.min(p.maxHull, p.hull + 35);
    else if (type === 'missiles') p.missiles += PICKUPS.missiles.amount;
    else if (type === 'hyper') this.startHyper();
  }

  startHyper() {
    const p = this.player;
    const end = Math.min(p.s + this.stats.cruise * PICKUPS.hyper.speed * PICKUPS.hyper.duration, this.landmarkAhead - 380);
    if (end - p.s < 700 || this.boss) { p.dust += 15; this.emit('hyperFizzle'); return; }
    this.status = 'hyper';
    p.hyper = PICKUPS.hyper.duration;
    p.hyperEnd = end;
    p.hyperDustS = p.s + 60;
    this.enemyBolts.length = 0;
    this.emit('hyperStart');
  }

  endHyper() {
    const p = this.player;
    this.status = this.boss ? 'boss' : 'flying';
    p.hyper = 0;
    p.invuln = 1;
    p.speed = this.stats.cruise * 1.3;
    for (const k of this.pickups) if (k.hyper) k.alive = false;
    // Clear anything that would be right in your face on exit.
    for (const e of this.enemies) if (e.alive && e.s < p.s + 60 && e.kind !== 'cruiser') e.alive = false;
    this.emit('hyperEnd');
  }

  checkBurger() {
    const p = this.player, b = this.journey.burger;
    if (p.burgerDone || p.s < b.s) return;
    p.burgerDone = true;
    if (Math.abs(p.u - b.u) < b.ring && Math.abs(p.w - b.w) < b.ring) {
      this.status = 'shop';
      this.emit('shop');
    } else {
      this.emit('missedBurger');
    }
  }

  leaveShop() {
    if (this.status !== 'shop') return;
    this.status = 'flying';
    this.player.invuln = 1.5;
    this.emit('shopDone');
  }

  applyMenuItem(id) {
    const p = this.player;
    const all = id === 'combo';
    if (id === 'burger' || all) p.hull = Math.min(p.maxHull, p.hull + 40);
    if (id === 'fries' || all) p.missiles += 4;
    if (id === 'shake' || all) p.cannon = Math.min(CANNON.length - 1, p.cannon + 1);
    if (id === 'cola' || all) p.shield = p.maxShield;
  }

  result() {
    const p = this.player;
    return { kills: p.kills, spawned: p.spawned, hull: p.hull, maxHull: p.maxHull, dust: p.dust, score: p.score };
  }
}

function steer(v, target, dt, rolling) {
  const stopping = Math.abs(target) < Math.abs(v) || Math.sign(target) !== Math.sign(v);
  const rate = rolling ? 2 : stopping ? 14 : 9;
  return v + (target - v) * Math.min(1, dt * rate);
}

function softEdge(x, v, half, dt) {
  const zone = 5;
  const over = Math.abs(x) - (half - zone);
  if (over > 0 && Math.sign(v) === Math.sign(x)) v *= Math.exp(-dt * 10 * (over / zone));
  if (Math.abs(x) > half) { x = Math.sign(x) * half; if (Math.sign(v) === Math.sign(x)) v = 0; }
  return [x, v];
}

function dist3(a, b) {
  return Math.hypot(a.s - b.s, a.u - b.u, a.w - b.w);
}

// Did a fast bolt pass within `r` of the target during its last step?
function sweptHit(b, t, r) {
  const lo = Math.min(b.s, b.sPrev) - r, hi = Math.max(b.s, b.sPrev) + r;
  return t.s >= lo && t.s <= hi && Math.hypot(b.u - t.u, b.w - t.w) < r;
}

function sweptBox(b, box) {
  const h = box.half;
  const lo = Math.min(b.s, b.sPrev), hi = Math.max(b.s, b.sPrev);
  return hi >= box.s - h.s && lo <= box.s + h.s && Math.abs(b.u - box.u) < h.u && Math.abs(b.w - box.w) < h.w;
}
