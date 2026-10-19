// The run simulation: the dino, the track, bumps, amber and power-ups.
// DOM-free; the renderer and sound read `world` and its `events`.
import { Track } from './track.js';
import { PLAYER, OBSTACLES, HIT, POWER, COIN, VIEW_AHEAD, speedAt } from './config.js';

const ease = (t) => t * t * (3 - 2 * t);

export function newStats() {
  return {
    distance: 0, coins: 0, jumps: 0, rolls: 0, logs: 0, pteros: 0, geysers: 0, lanes: 0,
    powers: 0, glide: 0, magnetCoins: 0, shieldSaves: 0, hits: 0, clean: 0, cleanBest: 0,
    dailyRuns: 0, runs: 0,
  };
}

export class World {
  constructor({ seed = 1, theme = 'mixed', multiplier = 1, boosts = {}, best = 0, daily = false, startDistance = 0 } = {}) {
    this.seed = seed;
    this.track = new Track(seed, { theme });
    this.theme = theme;
    this.daily = daily;
    this.multiplier = multiplier;
    this.boosts = { magnet: 0, glide: 0, shield: 0, ...boosts };
    this.best = best;
    this.d = startDistance;
    this.startDistance = startDistance;
    this.time = 0;
    this.speed = speedAt(this.d);
    this.score = 0;
    this.status = 'running'; // running | caught
    this.caughtTime = 0;
    this.events = [];
    this.stats = newStats();
    this.passedBest = best <= 0;
    this.nextMilestone = Math.floor(this.d / 500) * 500 + 500;

    this.p = {
      lane: 0, from: 0, laneT: 1, x: 0,
      y: 0, vy: 0, air: false, rolling: 0, gliding: 0, landing: false,
      buffered: null, bufferT: 0, run: 0, // run = animation phase
    };
    this.power = { shield: 0, magnet: 0, glide: 0 };
    this.lavvy = 0; // seconds Lavvy stays close after a bump
    this.immune = 0;
    this.slow = 0;
    this.track.fill(this.d + VIEW_AHEAD);
    if (startDistance > 0) this.track.clear(0, startDistance + 40);
  }

  // The run is over: count it (and a Daily Dash) for missions. Done at the
  // end, after missions took their starting snapshot, so the counts register.
  finish() {
    this.stats.runs = 1;
    this.stats.dailyRuns = this.daily ? 1 : 0;
  }

  emit(type, data) {
    this.events.push(data ? { type, ...data } : { type });
  }

  get rolling() {
    return this.p.rolling > 0;
  }

  get height() {
    return this.p.rolling > 0 ? PLAYER.rollHeight : PLAYER.height;
  }

  // controls: { left, right, jump, roll } presses for this step.
  step(dt, controls = {}) {
    this.time += dt;
    if (this.status === 'caught') {
      this.caughtTime += dt;
      this.p.vy = 0;
      return;
    }
    const p = this.p;
    this.input(controls);

    // Speed, with a short slow-down after a bump.
    const base = speedAt(this.d);
    this.slow = Math.max(0, this.slow - dt);
    const slowF = 1 - HIT.slow * (this.slow / HIT.slowTime);
    this.speed = base * slowF;
    const dd = this.speed * dt;
    this.d += dd;
    this.score += dd * this.multiplier;
    this.stats.distance = this.d - this.startDistance;
    this.stats.clean += dd;
    this.stats.cleanBest = Math.max(this.stats.cleanBest, this.stats.clean);
    p.run += dd;

    // Lane change.
    if (p.laneT < 1) {
      p.laneT = Math.min(1, p.laneT + dt / PLAYER.laneTime);
      p.x = p.from + (p.lane - p.from) * ease(p.laneT);
    } else p.x = p.lane;

    this.moveVertical(dt);
    this.updatePowers(dt, dd);
    this.immune = Math.max(0, this.immune - dt);
    if (this.lavvy > 0) {
      this.lavvy = Math.max(0, this.lavvy - dt);
      if (this.lavvy === 0) this.emit('lavvyGone');
    }

    this.collide();
    this.collect(dt);
    this.milestones();
    this.track.fill(this.d + VIEW_AHEAD);
    this.track.prune(this.d);
  }

  input(c) {
    const p = this.p;
    if (c.left) this.changeLane(-1);
    if (c.right) this.changeLane(1);
    if (c.jump) this.queue('jump');
    if (c.roll) this.queue('roll');
    if (p.buffered) {
      p.bufferT -= 1 / 120;
      if (this.tryAction(p.buffered)) p.buffered = null;
      else if (p.bufferT <= 0) p.buffered = null;
    }
  }

  queue(action) {
    if (this.tryAction(action)) return;
    this.p.buffered = action;
    this.p.bufferT = PLAYER.buffer;
  }

  tryAction(action) {
    const p = this.p;
    if (p.gliding > 0 || p.landing) return action === 'jump' || action === 'roll' ? true : false;
    if (action === 'jump') {
      if (p.air) return false;
      p.rolling = 0;
      p.air = true;
      p.vy = PLAYER.jumpSpeed;
      this.stats.jumps++;
      this.emit('jump');
      return true;
    }
    if (action === 'roll') {
      if (p.air) {
        p.vy = Math.min(p.vy, PLAYER.slamSpeed);
        p.rolling = PLAYER.rollTime + 0.12;
        this.emit('slam');
        this.stats.rolls++;
        return true;
      }
      if (p.rolling > 0.25) return false;
      p.rolling = PLAYER.rollTime;
      this.stats.rolls++;
      this.emit('roll');
      return true;
    }
    return false;
  }

  changeLane(dir) {
    const p = this.p;
    const target = p.lane + dir;
    if (target < -1 || target > 1) {
      this.emit('edge', { dir });
      return;
    }
    p.from = p.x;
    p.lane = target;
    p.laneT = 0;
    this.stats.lanes++;
    this.emit('lane', { dir });
  }

  moveVertical(dt) {
    const p = this.p;
    if (p.gliding > 0 || p.landing) {
      const target = p.gliding > 0 ? PLAYER.glideHeight : 0;
      if (p.gliding > 0) {
        p.y += (target - p.y) * Math.min(1, dt * 4);
      } else {
        p.y = Math.max(0, p.y - dt * 7.5);
        if (p.y === 0) {
          p.landing = false;
          p.air = false;
          this.track.clear(this.d - 2, this.d + this.speed * POWER.landClear);
          this.immune = Math.max(this.immune, 0.6);
          this.emit('land', { glide: true });
        }
      }
      p.rolling = 0;
      return;
    }
    if (p.air) {
      p.vy -= PLAYER.gravity * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.air = false;
        this.emit('land');
      }
    }
    if (p.rolling > 0 && !p.air) p.rolling = Math.max(0, p.rolling - dt);
  }

  updatePowers(dt, dd) {
    const pw = this.power;
    if (pw.shield > 0) {
      pw.shield = Math.max(0, pw.shield - dt);
      if (pw.shield === 0) this.emit('powerEnd', { kind: 'shield' });
    }
    if (pw.magnet > 0) {
      pw.magnet = Math.max(0, pw.magnet - dt);
      if (pw.magnet === 0) this.emit('powerEnd', { kind: 'magnet' });
    }
    const p = this.p;
    if (p.gliding > 0) {
      p.gliding = Math.max(0, p.gliding - dt);
      this.stats.glide += dd;
      pw.glide = p.gliding;
      if (p.gliding === 0) {
        p.landing = true;
        this.emit('powerEnd', { kind: 'glide' });
      }
    }
  }

  duration(kind) {
    const lv = this.boosts[kind] || 0;
    if (kind === 'magnet') return POWER.magnetBase + 2 * lv;
    if (kind === 'glide') return POWER.glideBase + lv;
    return POWER.shield + 6 * lv;
  }

  // Does the dino's body overlap an obstacle right now?
  touching(it) {
    const p = this.p;
    const o = OBSTACLES[it.kind];
    if (Math.abs(p.x - it.lane) >= PLAYER.laneReach) return false;
    if (it.z >= this.d + PLAYER.halfLen || it.z + it.len <= this.d - PLAYER.halfLen) return false;
    const bottom = p.y;
    const top = p.y + this.height;
    return top > o.bottom && bottom < o.top;
  }

  collide() {
    const p = this.p;
    const items = this.track.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.gone) continue;
      if (it.z > this.d + 3) continue;
      const end = it.z + it.len;
      if (end < this.d - 3) {
        if (!it.passed) {
          it.passed = true;
          if (!it.bumped && p.gliding === 0) this.passed(it);
        }
        continue;
      }
      // Near-miss bookkeeping: in our lane and alongside, but clear.
      if (!it.near && Math.abs(p.x - it.lane) < PLAYER.laneReach && it.z < this.d + PLAYER.halfLen && end > this.d - PLAYER.halfLen) {
        if (!this.touching(it)) it.near = true;
      }
      if (p.gliding > 0 || p.landing || this.immune > 0 || it.bumped) continue;
      if (!this.touching(it)) continue;
      const side = p.laneT < 1 && it.lane !== Math.round(p.from) && (it.kind === 'hedge' || it.z < this.d - 0.1);
      this.hit(it, side);
      if (this.status === 'caught') return;
    }
  }

  passed(it) {
    if (it.kind === 'geyser') {
      this.stats.geysers++;
      this.emit('pass', { kind: 'geyser' });
    }
    if (!it.near || it.kind === 'hedge') return;
    if (it.kind === 'log') {
      this.stats.logs++;
      this.emit('pass', { kind: 'log' });
    } else if (it.kind === 'ptero') {
      this.stats.pteros++;
      this.emit('pass', { kind: 'ptero' });
    }
  }

  hit(it, side) {
    const p = this.p;
    if (side) {
      // Bounce back to the lane we came from.
      const back = Math.round(p.from);
      p.from = p.x;
      p.lane = back;
      p.laneT = 0;
    }
    it.bumped = true;
    if (!side) it.gone = true;
    this.immune = HIT.immune;
    if (this.power.shield > 0) {
      this.power.shield = 0;
      this.stats.shieldSaves++;
      this.emit('hit', { kind: it.kind, lane: it.lane, z: it.z, shield: true, side });
      this.emit('powerEnd', { kind: 'shield' });
      return;
    }
    this.stats.hits++;
    this.stats.clean = 0;
    if (this.lavvy > 0) {
      this.status = 'caught';
      this.caughtTime = 0;
      this.speed = 0;
      p.rolling = 0;
      this.emit('hit', { kind: it.kind, lane: it.lane, z: it.z, side });
      this.emit('caught');
      return;
    }
    this.lavvy = HIT.lavvyWindow;
    this.slow = HIT.slowTime;
    this.emit('hit', { kind: it.kind, lane: it.lane, z: it.z, side });
  }

  collect(dt) {
    const p = this.p;
    const magnet = this.power.magnet > 0;
    const coins = this.track.coins;
    const top = p.y + this.height + 0.4;
    const bottom = p.y - 0.4;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.taken) continue;
      const dz = c.z - this.d;
      if (dz > POWER.magnetRange + 2) break;
      if (dz < -2) continue;
      if (magnet && !c.pulled && dz < POWER.magnetRange && dz > -1) c.pulled = true;
      if (c.pulled) {
        const k = Math.min(1, dt * 9);
        c.lane += (p.x - c.lane) * k;
        c.y += (p.y + 0.7 - c.y) * k;
        c.z += (this.d - c.z) * k * 0.9;
      }
      if (Math.abs(c.lane - p.x) < 0.5 && Math.abs(c.z - this.d) < COIN.reachZ && c.y > bottom && c.y < top) {
        c.taken = true;
        this.stats.coins++;
        if (c.pulled) this.stats.magnetCoins++;
        this.emit('coin', { lane: c.lane, z: c.z, y: c.y });
      }
    }
    for (const pw of this.track.powers) {
      if (pw.taken) continue;
      const dz = pw.z - this.d;
      if (dz > 3) break;
      if (dz < -2) continue;
      if (Math.abs(pw.lane - p.x) < 0.55 && Math.abs(dz) < 1.1 && pw.y < top + 0.3 && pw.y > bottom) {
        pw.taken = true;
        this.grab(pw.kind);
      }
    }
  }

  grab(kind) {
    const p = this.p;
    this.stats.powers++;
    const t = this.duration(kind);
    if (kind === 'shield') this.power.shield = t;
    else if (kind === 'magnet') this.power.magnet = t;
    else if (kind === 'glide') {
      const fresh = p.gliding === 0;
      p.gliding = t;
      this.power.glide = t;
      p.landing = false;
      p.air = true;
      p.rolling = 0;
      p.vy = 0;
      if (fresh) this.track.skyCoins(this.d + 10, this.d + this.speed * (t - 0.6));
    }
    this.emit('power', { kind, seconds: t });
  }

  milestones() {
    if (this.d >= this.nextMilestone) {
      this.emit('milestone', { distance: this.nextMilestone });
      this.nextMilestone += 500;
    }
    if (!this.passedBest && this.d - this.startDistance > this.best) {
      this.passedBest = true;
      this.emit('best');
    }
  }
}
