// One fishing spot: the cast, the lure, the fish swimming around, the bite
// and the fight. DOM-free; the renderer only reads it.
//
// Coordinates are metres: x is the distance out from the shore, y is depth
// below the surface (negative is above the water).
import { WATER, BANDS, bandAt, depthAt, sizeOf } from './data.js';
import { gearStats, fishValue } from './gear.js';
import { spawnTable, rollFish, rollSize, likesBait } from './spawn.js';
import { createBite, stepBite, biteDone } from './bite.js';
import { createFight, stepFight, LAND_DIST } from './fight.js';
import { mulberry32, hashSeed, range, clamp } from './rng.js';

// Seconds of no interest before the keenest nearby fish comes over anyway.
const PATIENCE_S = 10;

export const SPAN = 60; // metres of water on screen
const BAND_RANGE = { shallow: [0.5, 3], mid: [3, 8], deep: [8, 30] };
const MOVING_LURES = new Set(['minnow', 'spinner', 'feather', 'icejig', 'starjig', 'starlight']);
const METER_SPEED = 0.85; // power meter sweeps per second
const MAX_FISH = 6;

export class Trip {
  constructor({ water, period, weather, equip, seed = 1, castIndex = 0 }) {
    this.water = WATER[water];
    this.period = period;
    this.weather = weather;
    this.equip = { ...equip };
    this.stats = gearStats(equip);
    this.table = spawnTable(water, period, weather);
    this.rng = mulberry32(hashSeed('trip', seed, water, period, weather, castIndex));
    this.ice = !!this.water.ice;
    this.tip = this.ice ? { x: this.water.holeX - 0.4, y: -1.7 } : { x: 1.2, y: this.water.boat ? -2.0 : -2.6 };
    this.fishes = [];
    this.nextId = 1;
    this.events = [];
    this.time = 0;
    this.state = 'ready'; // ready charging flying sinking waiting reeling nibble bite fight landed lost
    this.cast = { power: 0, rising: true, aim: 0.6 };
    this.lure = { x: this.tip.x, y: this.tip.y, fx: 0, fy: 0, tx: 0, ty: 0, t: 0, dur: 0, depthGoal: 0 };
    this.bite = null;
    this.fight = null;
    this.hooked = null;
    this.result = null;
    this.spawnT = 2;
    this.idleT = 0;
    this.interestT = 0;
    this.twitchT = 0;
    this.holdT = 0;
    this.lineTick = 0;
    this.sniffed = new Set();
    for (let i = 0; i < 5; i++) this.spawn({ anywhere: true });
  }

  get bait() { return this.equip.bait; }
  bottom(x) { return depthAt(this.water, x); }
  get reach() { return this.stats.cast; }
  get maxDrop() { return Math.min(this.bottom(this.water.holeX) - 0.4, this.stats.cast * 0.45); }

  // Where the lure would land for a power in [0, 1].
  landingFor(power) {
    if (this.ice) return { x: this.water.holeX, y: 0.6 + power * (this.maxDrop - 0.6) };
    const x = 3 + power * (this.reach - 3);
    return { x, y: this.bottom(x) - 0.3 };
  }

  // A sensible aim for the bot: toward a depth where fish that like the
  // current bait live.
  suggestAim(rng = this.rng) {
    const likers = this.table.filter((e) => likesBait(e.fish, this.bait));
    if (!likers.length) return range(rng, 0.4, 1);
    const pick = likers[Math.floor(rng() * likers.length)].fish;
    const band = pick.bands[Math.floor(rng() * pick.bands.length)];
    const want = { shallow: 2, mid: 5.5, deep: 11 }[band];
    let best = 0.5, err = Infinity;
    for (let a = 0; a <= 1.0001; a += 0.05) {
      const e = Math.abs(this.landingFor(a).y - want);
      if (e < err) { err = e; best = a; }
    }
    return clamp(best + (rng() - 0.5) * 0.08, 0.05, 1);
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  // ------------------------------------------------------------ fish

  spawn({ anywhere = false, nearLure = false } = {}) {
    if (this.fishes.length >= MAX_FISH) return null;
    const lureIn = this.lureInWater();
    const band = nearLure && lureIn ? bandAt(this.lure.y) : BANDS[Math.floor(this.rng() * 3)];
    const sp = rollFish(this.rng, this.table, { band, baitId: this.bait, baitBoost: nearLure ? 6 : 2 });
    if (!sp) return null;
    // Legends are one of a kind.
    if (sp.rarity === 'legendary' && this.fishes.some((f) => f.sp === sp)) return null;
    const pos = this.placeFor(sp, nearLure ? this.lure.x : null);
    if (!pos) return null;
    const f = {
      id: this.nextId++, sp, t: rollSize(this.rng),
      x: anywhere ? pos.x : SPAN + 4, y: pos.y, tx: pos.x, ty: pos.y,
      vx: 0, vy: 0, face: -1, mode: 'swim', timer: range(this.rng, 1, 4),
      life: range(this.rng, 30, 60), wiggle: this.rng() * 6.28,
    };
    if (nearLure && !anywhere) f.x = clamp(this.lure.x + (this.rng() < 0.5 ? -1 : 1) * 9, 2, SPAN + 4);
    this.fishes.push(f);
    return f;
  }

  bandRange(sp) {
    let lo = Infinity, hi = -Infinity;
    for (const b of sp.bands) { lo = Math.min(lo, BAND_RANGE[b][0]); hi = Math.max(hi, BAND_RANGE[b][1]); }
    return [lo, hi];
  }

  // A spot in the fish's depth band, near `nearX` when given.
  placeFor(sp, nearX = null) {
    const [lo, hi] = this.bandRange(sp);
    for (let k = 0; k < 14; k++) {
      const x = nearX !== null ? clamp(nearX + range(this.rng, -6, 6), 2.5, SPAN) : range(this.rng, 3, SPAN);
      const floor = this.bottom(x) - 0.4;
      const top = Math.max(lo, this.ice ? 0.9 : 0.5);
      const bot = Math.min(hi, floor);
      if (bot > top) return { x, y: range(this.rng, top, bot) };
    }
    return null;
  }

  lureInWater() {
    return this.state === 'sinking' || this.state === 'waiting' || this.state === 'reeling';
  }

  // Can this fish notice the lure? It has to be near its depth band.
  inReach(f) {
    const [lo, hi] = this.bandRange(f.sp);
    return this.lure.y > lo - 2 && this.lure.y < hi + 2;
  }

  updateFish(dt) {
    const lureIn = this.lureInWater();
    for (const f of this.fishes) {
      f.wiggle += dt * (f.mode === 'approach' ? 9 : 5);
      f.life -= dt;
      if (f.mode === 'hooked') continue;
      if (f.mode === 'nibble') {
        f.x += (this.lure.x + f.face * -0.35 - f.x) * Math.min(1, dt * 8);
        f.y += (this.lure.y - f.y) * Math.min(1, dt * 8);
        continue;
      }
      let speed = 0.7 + 0.15 * f.sp.speed;
      if (f.mode === 'swim') {
        f.timer -= dt;
        const close = Math.hypot(f.tx - f.x, f.ty - f.y) < 0.6;
        if (close || f.timer <= 0) {
          const p = this.placeFor(f.sp, this.rng() < 0.6 ? f.x : null);
          if (p) { f.tx = p.x; f.ty = p.y; }
          f.timer = range(this.rng, 3, 7);
        }
        if (f.life <= 0) { f.mode = 'leave'; f.tx = SPAN + 8; }
      } else if (f.mode === 'approach' || f.mode === 'curious') {
        if (!lureIn) { f.mode = 'swim'; f.timer = 0; continue; }
        f.tx = this.lure.x + (f.x < this.lure.x ? -0.1 : 0.1);
        f.ty = this.lure.y;
        speed = f.mode === 'approach' ? 2 + 0.25 * f.sp.speed : 1.2;
        const d = Math.hypot(this.lure.x - f.x, this.lure.y - f.y);
        if (f.mode === 'approach' && d < 0.7 && (this.state === 'waiting' || this.state === 'sinking' || this.state === 'reeling')) {
          this.startBite(f);
          continue;
        }
        if (f.mode === 'curious' && d < 1.3) {
          f.mode = 'flee';
          f.timer = 1.4;
          if (!this.sniffed.has(f.sp.id)) {
            this.sniffed.add(f.sp.id);
            this.emit('sniff', { fish: f.sp });
          }
        }
      } else if (f.mode === 'flee') {
        f.timer -= dt;
        f.tx = f.x + (f.x < this.lure.x ? -4 : 4);
        speed = 1.6;
        if (f.timer <= 0) { f.mode = 'swim'; f.timer = 0; }
      } else if (f.mode === 'leave') {
        speed = 1.4;
      }
      const dx = f.tx - f.x, dy = f.ty - f.y;
      const d = Math.hypot(dx, dy) || 1;
      const want = Math.min(speed, d * 2 + 0.4);
      f.vx += ((dx / d) * want - f.vx) * Math.min(1, dt * 2.5);
      f.vy += ((dy / d) * want * (f.mode === 'approach' ? 1 : 0.6) - f.vy) * Math.min(1, dt * 2.5);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const floor = this.bottom(clamp(f.x, 0, SPAN)) - 0.25;
      f.y = clamp(f.y, this.ice ? 0.8 : 0.35, floor);
      if (Math.abs(f.vx) > 0.05) f.face = f.vx > 0 ? 1 : -1;
    }
    this.fishes = this.fishes.filter((f) => !(f.mode === 'leave' && f.x > SPAN + 6));

    // Respawn, and let the bait's smell bring fish when nothing is happening.
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      const lured = lureIn && this.idleT > 3.5;
      this.spawn({ nearLure: lured });
      if (lured) this.idleT = 1;
      this.spawnT = range(this.rng, 3, 6);
    }

    // Interest checks.
    if (!lureIn || this.fishes.some((f) => f.mode === 'approach' || f.mode === 'nibble')) {
      this.patienceT = 0;
      return;
    }
    // Patience: if nothing has come over in a while, the nearest fish that
    // likes this bait swims over, so a wait never drags on for young anglers.
    this.patienceT = (this.patienceT || 0) + dt;
    if (this.patienceT > PATIENCE_S) {
      const keen = this.fishes
        .filter((f) => f.mode === 'swim' && this.inReach(f) && likesBait(f.sp, this.bait))
        .sort((a, b) => Math.hypot(a.x - this.lure.x, a.y - this.lure.y) - Math.hypot(b.x - this.lure.x, b.y - this.lure.y))[0];
      if (keen) {
        keen.mode = 'approach';
        this.patienceT = 0;
        this.emit('approach', { fish: keen.sp, patient: true });
        return;
      }
    }
    this.interestT -= dt;
    if (this.interestT > 0) return;
    this.interestT = 0.25;
    const moving = this.state === 'reeling' && MOVING_LURES.has(this.bait);
    const sense = 7 + (this.twitchT > 0 ? 4 : 0) + (this.ice ? 3 : 0) + (moving ? 2 : 0);
    for (const f of this.fishes) {
      if (f.mode !== 'swim' || !this.inReach(f)) continue;
      if (Math.hypot(f.x - this.lure.x, f.y - this.lure.y) > sense) continue;
      const likes = likesBait(f.sp, this.bait);
      if (likes) {
        const p = (0.3 + (this.twitchT > 0 ? 0.15 : 0)) * (moving ? 1.6 : this.state === 'reeling' ? 0.4 : 1);
        if (this.rng() < p) {
          f.mode = 'approach';
          this.emit('approach', { fish: f.sp });
          return;
        }
      } else if (this.rng() < 0.05) {
        f.mode = 'curious';
      }
    }
  }

  startBite(f) {
    f.mode = 'nibble';
    f.face = f.x < this.lure.x ? 1 : -1;
    this.hooked = f;
    this.bite = createBite(f.sp, this.rng, { hook: this.stats.hook });
    this.state = 'nibble';
    this.emit('arrive', { fish: f.sp });
  }

  releaseFish(f, mode = 'flee') {
    f.mode = mode;
    f.timer = 2;
    f.face = f.x < this.lure.x ? -1 : 1;
    if (this.hooked === f) this.hooked = null;
  }

  // ------------------------------------------------------------ step

  // ctl: { hold, press, aim (0..1 or null), steer (-1..1), reel (0..1, optional) }
  step(dt, ctl = {}) {
    this.time += dt;
    this.twitchT = Math.max(0, this.twitchT - dt);
    const hold = !!ctl.hold;
    this.holdT = hold ? this.holdT + dt : 0;
    const L = this.lure;
    switch (this.state) {
      case 'ready':
        if (ctl.aim !== null && ctl.aim !== undefined) this.cast.aim = clamp(ctl.aim, 0, 1);
        L.x = this.tip.x; L.y = this.tip.y;
        if (hold) {
          this.state = 'charging';
          this.cast.power = 0;
          this.cast.rising = true;
          this.emit('charge');
        }
        break;
      case 'charging': {
        if (ctl.aim !== null && ctl.aim !== undefined) this.cast.aim = clamp(ctl.aim, 0, 1);
        const c = this.cast;
        c.power += (c.rising ? 1 : -1) * METER_SPEED * dt;
        if (c.power >= 1) { c.power = 1; c.rising = false; }
        if (c.power <= 0) { c.power = 0; c.rising = true; }
        if (!hold) this.release();
        break;
      }
      case 'flying': {
        L.t += dt;
        const p = Math.min(1, L.t / L.dur);
        L.x = L.fx + (L.tx - L.fx) * p;
        const arc = this.ice ? 0.6 : 2 + L.tx * 0.12;
        L.y = L.fy + (L.ty - L.fy) * p - Math.sin(p * Math.PI) * arc;
        if (p >= 1) {
          L.y = 0;
          this.state = 'sinking';
          this.idleT = 0;
          this.emit('splash', { x: L.x, size: 1 });
        }
        break;
      }
      case 'sinking':
      case 'waiting': {
        this.idleT += dt;
        if (this.state === 'sinking') {
          L.y += this.stats.sink * dt;
          if (L.y >= L.depthGoal) { L.y = L.depthGoal; this.state = 'waiting'; this.emit('settle'); }
        } else if (this.water.drift) {
          L.x = Math.min(this.reach + 4, L.x + this.water.drift * 0.25 * dt);
          L.depthGoal = this.bottom(L.x) - 0.3;
          L.y += (L.depthGoal - L.y) * Math.min(1, dt);
        }
        if (ctl.press && !this.fishes.some((f) => f.mode === 'approach')) this.twitch();
        if (hold && this.holdT > 0.25) this.state = 'reeling';
        break;
      }
      case 'reeling': {
        this.idleT += dt * 0.5;
        if (!hold) {
          this.state = 'sinking';
          L.depthGoal = this.ice ? L.y : this.bottom(L.x) - 0.3;
          break;
        }
        const sp = this.stats.reelSpeed * 0.8 * dt;
        if (this.ice) L.y -= sp;
        else {
          L.x -= sp;
          L.y = Math.min(this.bottom(L.x) - 0.3, Math.max(0.3, L.y - 0.35 * dt));
        }
        this.tickLine(sp);
        if ((this.ice && L.y < 0.4) || (!this.ice && L.x < 2.2)) this.reeledIn();
        break;
      }
      case 'nibble':
      case 'bite': {
        stepBite(this.bite, dt, !!ctl.press);
        for (const e of this.bite.events) this.events.push(e);
        this.bite.events.length = 0;
        if (this.bite.phase === 'bite') this.state = 'bite';
        if (biteDone(this.bite)) {
          const f = this.hooked;
          if (this.bite.phase === 'hooked') this.startFight(f, this.bite.quality);
          else {
            this.releaseFish(f);
            this.state = 'waiting';
            this.idleT = 0;
          }
        }
        break;
      }
      case 'fight': {
        const reel = ctl.reel !== undefined ? ctl.reel : hold ? 1 : 0;
        const before = this.fight.dist;
        stepFight(this.fight, dt, { reel, steer: ctl.steer || 0 });
        for (const e of this.fight.events) this.events.push(e);
        this.fight.events.length = 0;
        if (this.fight.dist < before) this.tickLine(before - this.fight.dist);
        this.placeHooked(dt);
        if (this.fight.outcome === 'landed') this.land();
        else if (this.fight.outcome) this.lose(this.fight.outcome);
        break;
      }
      default:
        break;
    }
    this.updateFish(dt);
    if (this.hooked && this.state === 'fight') this.hooked.mode = 'hooked';
  }

  tickLine(m) {
    this.lineTick += m;
    if (this.lineTick >= 1) { this.lineTick = 0; this.emit('reelTick'); }
  }

  release() {
    const c = this.cast;
    const land = this.landingFor(c.power);
    const L = this.lure;
    L.fx = this.tip.x; L.fy = this.tip.y;
    L.tx = land.x; L.ty = 0;
    L.depthGoal = land.y;
    L.t = 0;
    L.dur = this.ice ? 0.45 : 0.55 + 0.022 * land.x;
    this.state = 'flying';
    const off = Math.abs(c.power - c.aim);
    const bullseye = off < 0.05;
    if (bullseye) this.twitchT = 6; // a perfect cast gets noticed
    this.emit('cast', { power: c.power, aim: c.aim, bullseye, x: land.x });
  }

  twitch() {
    const L = this.lure;
    if (!this.ice) L.x = Math.max(2.4, L.x - 0.35);
    L.y = Math.max(0.3, L.y - 0.35);
    if (this.state === 'waiting') this.state = 'sinking';
    this.twitchT = 3;
    this.emit('twitch');
  }

  reeledIn() {
    this.state = 'ready';
    this.lure.x = this.tip.x;
    this.lure.y = this.tip.y;
    for (const f of this.fishes) if (f.mode === 'approach' || f.mode === 'curious') { f.mode = 'swim'; f.timer = 0; }
    this.emit('reeledIn');
  }

  startFight(f, quality) {
    this.state = 'fight';
    f.mode = 'hooked';
    const dist = Math.hypot(this.lure.x - this.tip.x, this.lure.y - this.tip.y);
    this.fight = createFight(f.sp, f.t, this.stats, this.rng, { dist, perfect: quality === 'perfect' });
    this.hookDepth = this.lure.y;
    this.jumpP = 0;
    this.ox = 0;
  }

  // Put the hooked fish (and the lure in its mouth) where the fight says.
  placeHooked(dt) {
    const f = this.hooked;
    const fi = this.fight;
    if (!f) return;
    const phase = fi.phase;
    const floor = (x) => this.bottom(clamp(x, 0, SPAN)) - 0.4;
    if (phase === 'jump' && !this.ice) this.jumpP = Math.min(1, this.jumpP + dt / 0.85);
    else this.jumpP = 0;
    let depth = this.hookDepth;
    if (phase === 'run' || phase === 'surge' || phase === 'special') depth += dt * 1.2;
    else if (phase === 'rise') depth -= dt * (this.ice ? 1.5 : 6);
    else if (phase === 'tired') depth -= dt * 1.5;
    else depth += Math.sin(this.time * 1.3) * dt * 0.4;
    if (this.ice) {
      this.ox = clamp(this.ox + fi.dir * dt * (phase === 'rest' ? 0.3 : 1.4), -12, 12);
      const lim = Math.max(0.9, fi.dist * 0.9);
      this.ox = clamp(this.ox, -lim, lim);
      const y = Math.sqrt(Math.max(0, fi.dist * fi.dist - this.ox * this.ox));
      depth = clamp(Math.min(depth, y), 0.9, floor(this.water.holeX + this.ox));
      this.hookDepth = depth;
      f.x = this.water.holeX + this.ox * Math.min(1, fi.dist / 3);
      f.y = Math.max(0.9, Math.min(depth, fi.dist));
    } else {
      this.hookDepth = clamp(depth, 0.5, 30);
      const dy = this.hookDepth - this.tip.y;
      let x = this.tip.x + Math.sqrt(Math.max(0.25, fi.dist * fi.dist - dy * dy));
      x = clamp(x + fi.dir * 0.8 * Math.sin(this.time * 2), 1.6, SPAN + 2);
      const fl = floor(x);
      this.hookDepth = Math.min(this.hookDepth, fl);
      if (fi.dist < LAND_DIST + 2) this.hookDepth = Math.min(this.hookDepth, 0.6);
      f.x = x;
      f.y = this.jumpP > 0 ? -Math.sin(this.jumpP * Math.PI) * (1.6 + f.sp.cm[1] / 150) : this.hookDepth;
      if (this.jumpP > 0) f.x += fi.dir * this.jumpP * 1.2;
    }
    f.face = phase === 'tired' ? -1 : fi.dir;
    this.lure.x = f.x - f.face * 0.3;
    this.lure.y = f.y;
  }

  land() {
    const f = this.hooked;
    const size = sizeOf(f.sp, f.t);
    this.result = {
      fish: f.sp, t: f.t, cm: size.cm, kg: size.kg, coins: fishValue(f.sp, f.t),
      quality: this.bite?.quality || 'good', time: this.fight.time,
    };
    this.fishes = this.fishes.filter((x) => x !== f);
    this.hooked = null;
    this.state = 'landed';
    this.emit('landed', { result: this.result });
  }

  lose(reason) {
    const f = this.hooked;
    this.result = { fish: f.sp, lost: reason };
    if (f) {
      f.mode = 'leave';
      f.tx = SPAN + 8;
      f.ty = f.y > 0 ? f.y + 2 : 2;
      f.life = 0;
    }
    this.hooked = null;
    this.state = 'lost';
    this.emit('lost', { reason, fish: f.sp });
  }

  // Back to "ready" for the next cast.
  next() {
    this.state = 'ready';
    this.bite = null;
    this.fight = null;
    this.result = null;
    this.lure.x = this.tip.x;
    this.lure.y = this.tip.y;
  }

  // Change equipped gear between casts.
  setEquip(equip) {
    this.equip = { ...equip };
    this.stats = gearStats(equip);
  }
}
