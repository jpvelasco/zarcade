// DOM-free, deterministic tower-defense simulation. Advance it with fixed
// steps (STEP); rendering and audio only read its state and `events`.
import { BUGS, DEFENDERS, DEFENDER_ORDER, START_BASKETS, TARGETING, WAVE_BREAK, EARLY_BONUS_PER_SECOND } from './data.js';
import { mapInfo, routePos, tileAt, isBuildableTile } from './maps.js';
import { buildWaves, waveSpawns, describeWave } from './waves.js';
import { auraFor, buildCost, canTarget, damageAfterArmor, effectiveSpeed, investedIn, pickTarget, sellValue, starsFor, upgradeCost } from './combat.js';

export const STEP = 1 / 60;
const CLEAR_BREAK = 10; // once the field is clear, the next wave comes within this many seconds
const CHAIN_HOP = 1.6;

export class Game {
  constructor(mapIndex, { unlocked, recordEvents = true } = {}) {
    this.mapIndex = mapIndex;
    this.info = mapInfo(mapIndex);
    this.map = this.info.map;
    this.waves = buildWaves(mapIndex);
    this.unlocked = new Set(unlocked ?? DEFENDER_ORDER.filter((t) => DEFENDERS[t].unlock <= mapIndex));
    this.coins = this.map.coins;
    this.baskets = START_BASKETS;
    this.maxBaskets = START_BASKETS;
    this.time = 0;
    this.wave = 0; // waves started so far
    this.status = 'ready'; // ready | playing | won | lost
    this.bugs = [];
    this.defenders = [];
    this.projectiles = [];
    this.puddles = [];
    this.slimes = [];
    this.pending = [];
    this.events = [];
    this.recordEvents = recordEvents;
    this.breakTimer = null;
    this.clearAwarded = true;
    this.nextId = 1;
    this.seen = new Set();
    this.stats = { shooed: 0, leaked: 0, built: 0, earned: 0, bonus: 0 };
  }

  emit(e) { if (this.recordEvents) this.events.push(e); }

  // ------------------------------------------------------------ queries

  get nextWave() { return this.waves[this.wave] || null; }
  get combatActive() { return this.bugs.length > 0 || this.pending.length > 0; }
  get over() { return this.status === 'won' || this.status === 'lost'; }
  get stars() { return this.status === 'won' ? starsFor(this.baskets, this.maxBaskets) : 0; }

  preview() {
    const w = this.nextWave;
    return w ? describeWave(w) : '';
  }

  defenderAt(x, y) {
    return this.defenders.find((d) => d.cx === x && d.cy === y) || null;
  }

  canBuildAt(x, y) {
    const ch = tileAt(this.map, x, y);
    return !!ch && isBuildableTile(ch) && !this.defenderAt(x, y);
  }

  canAfford(type) { return this.coins >= buildCost(type); }

  canCallWave() {
    return (this.status === 'ready' || this.status === 'playing') && this.wave < this.waves.length && this.pending.length === 0;
  }

  earlyBonus() {
    if (this.breakTimer === null) return 0;
    return Math.floor(this.breakTimer * EARLY_BONUS_PER_SECOND);
  }

  // Effective stats for a defender, including any lavender aura.
  statsOf(d) {
    const t = DEFENDERS[d.type].tiers[d.tier];
    const a = d.aura;
    return {
      ...t,
      range: t.range ? t.range * (1 + a.range) : 0,
      damage: t.damage ? t.damage * (1 + a.dmg) : 0,
      cooldown: t.cooldown ? t.cooldown / (1 + a.rate) : 0,
    };
  }

  sellValueOf(d) { return sellValue(d.invested, d.fresh); }

  // ------------------------------------------------------------ player actions

  build(type, x, y) {
    if (this.over || !this.unlocked.has(type) || !this.canBuildAt(x, y)) return null;
    const cost = buildCost(type);
    if (this.coins < cost) return null;
    this.coins -= cost;
    const d = {
      id: this.nextId++, type, cx: x, cy: y, x: x + 0.5, y: y + 0.5, tier: 0,
      cooldown: 0.25, timer: 0, targeting: 'first', invested: cost,
      aura: { dmg: 0, range: 0, rate: 0 }, aim: Math.PI / 2, builtAt: this.time, upgradedAt: -99, lastShot: -99,
      fresh: !this.combatActive, shots: 0,
    };
    this.defenders.push(d);
    this.stats.built++;
    this.refreshAuras();
    this.emit({ type: 'build', defender: type, x: d.x, y: d.y });
    return d;
  }

  upgrade(d) {
    if (this.over || !d) return false;
    const cost = upgradeCost(d.type, d.tier);
    if (cost === null || this.coins < cost) return false;
    this.coins -= cost;
    d.tier++;
    d.invested += cost;
    d.upgradedAt = this.time;
    this.refreshAuras();
    this.emit({ type: 'upgrade', defender: d.type, tier: d.tier, x: d.x, y: d.y });
    return true;
  }

  sell(d) {
    if (this.over || !d || !this.defenders.includes(d)) return 0;
    const value = this.sellValueOf(d);
    this.coins += value;
    this.defenders = this.defenders.filter((o) => o !== d);
    this.refreshAuras();
    this.emit({ type: 'sell', defender: d.type, x: d.x, y: d.y, value });
    return value;
  }

  setTargeting(d, mode) {
    if (d && TARGETING.includes(mode) && DEFENDERS[d.type].targeting) d.targeting = mode;
  }

  cycleTargeting(d) {
    if (!d || !DEFENDERS[d.type].targeting) return;
    d.targeting = TARGETING[(TARGETING.indexOf(d.targeting) + 1) % TARGETING.length];
  }

  // Start the next wave now. Calling it during a break pays an early bonus.
  startWave() {
    if (!this.canCallWave()) return false;
    const bonus = this.earlyBonus();
    if (bonus > 0) { this.coins += bonus; this.stats.bonus += bonus; }
    const wave = this.waves[this.wave];
    for (const s of waveSpawns(wave, this.info.spawns.length)) this.pending.push({ ...s, t: this.time + s.t });
    this.wave++;
    this.status = 'playing';
    this.breakTimer = null;
    this.clearAwarded = false;
    for (const d of this.defenders) d.fresh = false;
    this.emit({ type: 'waveStart', number: this.wave, bonus, boss: wave.boss });
    for (const g of wave.groups) {
      if (!this.seen.has(g.type)) {
        this.seen.add(g.type);
        this.emit({ type: BUGS[g.type].boss ? 'boss' : 'newBug', bug: g.type });
      }
    }
    return true;
  }

  // ------------------------------------------------------------ simulation

  step(dt = STEP) {
    if (this.status !== 'playing') return;
    this.time += dt;

    while (this.pending.length && this.pending[0].t <= this.time) {
      const s = this.pending.shift();
      this.spawnBug(s.type, s.spawn, s.hpMul, 0);
    }

    this.updateBreak(dt);
    this.updateGround(dt);
    this.updateBugs(dt);
    if (this.status === 'lost') return;
    this.updateDefenders(dt);
    this.updateProjectiles(dt);
    this.bugs = this.bugs.filter((b) => b.alive);

    if (!this.combatActive && !this.clearAwarded) {
      this.clearAwarded = true;
      const bonus = 5 + 2 * this.wave;
      this.coins += bonus;
      this.emit({ type: 'waveClear', number: this.wave, bonus });
    }
    if (this.wave >= this.waves.length && !this.combatActive) {
      this.status = 'won';
      this.emit({ type: 'won', stars: this.stars });
    }
  }

  updateBreak(dt) {
    if (this.pending.length || this.wave >= this.waves.length) return;
    if (this.breakTimer === null) this.breakTimer = WAVE_BREAK;
    if (!this.bugs.length) this.breakTimer = Math.min(this.breakTimer, CLEAR_BREAK);
    this.breakTimer -= dt;
    if (this.breakTimer <= 0) {
      this.breakTimer = null;
      this.startWave();
    }
  }

  spawnBug(type, spawn, hpMul, dist, parent = null) {
    const def = BUGS[type];
    const route = def.flying ? this.info.flyRoutes[spawn] : this.info.routes[spawn];
    const hp = def.hp * hpMul;
    const pos = routePos(route, dist);
    const bug = {
      id: this.nextId++, type, def, spawn, route, dist, hp, maxHp: hp, hpMul,
      x: pos.x, y: pos.y, angle: pos.angle, remaining: route.length - dist,
      flying: !!def.flying, boss: !!def.boss, armor: def.armor, alive: true,
      slow: 0, slowT: 0, slowAmt: 0, slimed: false, slimeAcc: 0, hurt: 0,
      spawnT: def.spawner ? def.spawner.every : 0, bornAt: this.time, phase: (this.nextId * 0.37) % 1,
    };
    this.bugs.push(bug);
    if (def.boss && !parent) this.emit({ type: 'bossSpawn', bug: type, x: bug.x, y: bug.y });
    return bug;
  }

  updateGround(dt) {
    for (const p of this.puddles) p.life -= dt;
    for (const s of this.slimes) s.life -= dt;
    if (this.puddles.length) this.puddles = this.puddles.filter((p) => p.life > 0);
    if (this.slimes.length) this.slimes = this.slimes.filter((s) => s.life > 0);
  }

  updateBugs(dt) {
    for (const b of this.bugs) {
      if (!b.alive) continue;
      const def = b.def;
      b.hurt = Math.max(0, b.hurt - dt);
      b.slowT = Math.max(0, b.slowT - dt);
      let slow = b.slowT > 0 ? b.slowAmt : 0;
      let slimed = false;
      if (!b.flying) {
        for (const p of this.puddles) {
          if (p.slow > slow && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 <= p.r * p.r) slow = p.slow;
        }
        if (!def.slime) {
          for (const s of this.slimes) {
            if ((b.x - s.x) ** 2 + (b.y - s.y) ** 2 <= s.r * s.r) { slimed = true; break; }
          }
        }
      }
      b.slow = slow;
      b.slimed = slimed;
      const speed = effectiveSpeed(def.speed, slow, slimed, def.slowResist || 0);
      b.dist += speed * dt;
      const pos = routePos(b.route, b.dist);
      b.x = pos.x; b.y = pos.y; b.angle = pos.angle;
      b.remaining = b.route.length - b.dist;

      if (def.slime) {
        b.slimeAcc += speed * dt;
        if (b.slimeAcc >= 0.5) {
          b.slimeAcc = 0;
          this.slimes.push({ x: b.x, y: b.y, r: 0.42 * Math.sqrt(def.slime), life: 5 * def.slime, max: 5 * def.slime });
        }
      }
      if (def.spawner) {
        b.spawnT -= dt;
        if (b.spawnT <= 0) {
          b.spawnT = def.spawner.every;
          this.spawnBug(def.spawner.type, b.spawn, b.hpMul * 0.8, Math.max(0, b.dist - 0.3), b);
          this.emit({ type: 'summon', x: b.x, y: b.y });
        }
      }
      if (b.remaining <= 0) this.leak(b);
    }
  }

  leak(b) {
    b.alive = false;
    this.baskets = Math.max(0, this.baskets - b.def.leak);
    this.stats.leaked += b.def.leak;
    this.emit({ type: 'leak', bug: b.type, x: b.x, y: b.y, amount: b.def.leak });
    if (this.baskets <= 0 && this.status === 'playing') {
      this.status = 'lost';
      this.emit({ type: 'lost' });
    }
  }

  refreshAuras() {
    for (const d of this.defenders) d.aura = auraFor(d, this.defenders);
  }

  updateDefenders(dt) {
    const active = this.combatActive;
    for (const d of this.defenders) {
      const kind = DEFENDERS[d.type];
      const st = this.statsOf(d);
      if (d.type === 'daisy') {
        if (!active) continue;
        d.timer += dt;
        if (d.timer >= st.period) {
          d.timer = 0;
          this.coins += st.income;
          this.stats.earned += st.income;
          d.lastShot = this.time;
          this.emit({ type: 'coin', x: d.x, y: d.y, amount: st.income });
        }
        continue;
      }
      if (!kind.projectile) continue;
      d.cooldown -= dt;
      if (d.cooldown > 0) continue;
      const filter = (b) => canTarget(kind, b);
      const target = pickTarget(d, st.range, this.bugs, d.targeting, filter);
      if (!target) { d.cooldown = 0; continue; }
      d.cooldown = st.cooldown;
      d.aim = Math.atan2(target.y - d.y, target.x - d.x);
      d.lastShot = this.time;
      d.shots++;
      d.fresh = false;
      this.fire(d, kind, st, target, filter);
    }
  }

  fire(d, kind, st, target, filter) {
    const p = kind.projectile;
    if (p === 'pea' || p === 'thorn') {
      const targets = [target];
      for (let i = 1; i < (st.shots || 1); i++) {
        const other = pickTarget(d, st.range, this.bugs, d.targeting, (b) => filter(b) && !targets.includes(b));
        if (other) targets.push(other);
      }
      targets.forEach((t, i) => {
        this.projectiles.push({ kind: p, x: d.x, y: d.y - 0.25, target: t, tx: t.x, ty: t.y, speed: p === 'pea' ? 9 : 7, damage: st.damage, tier: d.tier, delay: i * 0.08 });
      });
      this.emit({ type: 'shoot', kind: p, x: d.x, y: d.y });
    } else if (p === 'seed' || p === 'honey') {
      const dist = Math.hypot(target.x - d.x, target.y - d.y);
      const dur = 0.5 + dist * 0.09;
      const speed = effectiveSpeed(target.def.speed, target.slow, target.slimed, target.def.slowResist || 0);
      const aim = routePos(target.route, target.dist + speed * dur);
      this.projectiles.push({ kind: p, sx: d.x, sy: d.y - 0.3, x: d.x, y: d.y, tx: aim.x, ty: aim.y, t: 0, dur, damage: st.damage, splash: st.splash, slow: st.slow || 0, puddle: st.puddle || 0, tier: d.tier });
      this.emit({ type: 'shoot', kind: p, x: d.x, y: d.y });
    } else if (p === 'zap') {
      const hit = [target];
      let last = target, dmg = st.damage;
      const points = [{ x: d.x, y: d.y - 0.45 }, { x: target.x, y: target.y }];
      this.hurt(target, dmg, true);
      for (let i = 0; i < st.chain; i++) {
        const next = pickTarget(last, CHAIN_HOP, this.bugs, 'closest', (b) => filter(b) && !hit.includes(b));
        if (!next) break;
        dmg *= st.falloff;
        hit.push(next);
        points.push({ x: next.x, y: next.y });
        this.hurt(next, dmg, true);
        last = next;
      }
      this.emit({ type: 'zap', points, tier: d.tier });
    }
  }

  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      if (p.kind === 'pea' || p.kind === 'thorn') {
        if (p.delay > 0) { p.delay -= dt; keep.push(p); continue; }
        if (p.target.alive) { p.tx = p.target.x; p.ty = p.target.y; }
        const dx = p.tx - p.x, dy = p.ty - p.y;
        const dist = Math.hypot(dx, dy);
        const move = p.speed * dt;
        if (dist <= move + 0.12) {
          if (p.target.alive) this.hurt(p.target, p.damage, false);
          this.emit({ type: 'hit', kind: p.kind, x: p.tx, y: p.ty });
          continue;
        }
        p.x += (dx / dist) * move;
        p.y += (dy / dist) * move;
        p.angle = Math.atan2(dy, dx);
        keep.push(p);
      } else {
        p.t += dt;
        const f = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * f;
        p.y = p.sy + (p.ty - p.sy) * f;
        p.z = Math.sin(f * Math.PI) * (0.9 + p.dur * 0.6);
        if (f < 1) { keep.push(p); continue; }
        this.land(p);
      }
    }
    this.projectiles = keep;
  }

  land(p) {
    const r2 = p.splash * p.splash;
    for (const b of this.bugs.slice()) {
      if (!b.alive || b.flying) continue;
      if ((b.x - p.tx) ** 2 + (b.y - p.ty) ** 2 > r2) continue;
      this.hurt(b, p.damage, false);
      if (p.slow) { b.slowAmt = Math.max(b.slowT > 0 ? b.slowAmt : 0, p.slow); b.slowT = 1.2; }
    }
    if (p.kind === 'honey') this.puddles.push({ x: p.tx, y: p.ty, r: p.splash, slow: p.slow, life: p.puddle, max: p.puddle });
    this.emit({ type: 'splash', kind: p.kind, x: p.tx, y: p.ty, r: p.splash });
  }

  hurt(b, amount, magic) {
    if (!b.alive) return;
    b.hp -= damageAfterArmor(amount, b.armor, magic);
    b.hurt = 0.12;
    if (b.hp <= 0) this.shoo(b);
  }

  shoo(b) {
    b.alive = false;
    const reward = b.def.reward;
    this.coins += reward;
    this.stats.shooed++;
    this.emit({ type: 'shoo', bug: b.type, x: b.x, y: b.y, reward, flying: b.flying, boss: b.boss, angle: b.angle });
    const split = b.def.split;
    if (split) {
      for (let i = 0; i < split.count; i++) {
        const child = this.spawnBug(split.type, b.spawn, b.hpMul, Math.max(0, b.dist - 0.2 * i), b);
        child.slowT = b.slowT; child.slowAmt = b.slowAmt;
      }
      this.emit({ type: 'split', x: b.x, y: b.y });
    }
  }
}
