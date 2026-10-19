// A play session: one mine plus the economy around it (selling, upgrades,
// museum, milestones, Wiggles' tow, daily goals). DOM-free.
import {
  T, ORES, UPGRADES, UPGRADE_ORDER, MUSEUM, PIECES, PIECE_REWARD, MILESTONES, PAINTS,
  MAIN_WORLD, DAILY_WORLD, METERS_PER_TILE,
} from './data.js';
import { generateWorld } from './worldgen.js';
import { Mine } from './sim.js';
import { encodeDiff, applyDiff, recordDaily, dailyReward } from './progress.js';
import { makeRng } from './rng.js';

export function podStats(up) {
  const t = (k) => UPGRADES[k].tiers[Math.min(up[k] || 0, UPGRADES[k].tiers.length - 1)];
  const prop = up.prop || 0;
  return {
    power: t('drill'), tank: t('tank'), cargo: t('cargo'), hull: t('hull'), lamp: t('lamp'),
    fly: t('prop'), flyAccel: 9 + prop * 2.2, flyBurn: 1 - prop * 0.05, fan: (up.fan || 0) > 0,
  };
}

// The daily dig lends everyone the same mid-range pod.
export const LOANER = { drill: 2, tank: 1, cargo: 2, hull: 2, lamp: 2, prop: 2, fan: 0 };

export function upgradeInfo(save, key) {
  const U = UPGRADES[key];
  const tier = save.upgrades[key] || 0;
  const max = U.tiers.length - 1;
  if (tier >= max) return { key, tier, max, maxed: true };
  const next = tier + 1;
  const cost = U.cost[next];
  const needDrill = key === 'fan' ? U.needsDrill : key === 'drill' ? 0 : next - 1;
  const locked = (save.upgrades.drill || 0) < needDrill ? needDrill : 0;
  return { key, tier, max, next, cost, locked, needDrill, affordable: !locked && save.coins >= cost, name: U.names[next] };
}

export function buyUpgrade(save, key) {
  const info = upgradeInfo(save, key);
  if (info.maxed || info.locked || !info.affordable) return false;
  save.coins -= info.cost;
  save.upgrades[key] = info.next;
  return true;
}

export function towFee(depthTiles) {
  return Math.round(8 + Math.max(0, depthTiles) * 0.6);
}

export function cargoValue(cargo) {
  let v = 0;
  for (const o of cargo) v += ORES[o].value;
  return v;
}

// Today's daily dig: seed, goal and a friendly label.
export function dailyConfig(date) {
  const rng = makeRng(`daily:${date}`);
  const type = ['haul', 'acorn', 'depth'][rng.int(0, 2)];
  const goal = { type, target: 0 };
  if (type === 'haul') goal.target = 250 + rng.int(0, 6) * 25;
  else if (type === 'depth') goal.target = 90 + rng.int(0, 6) * 5; // meters
  const label = type === 'haul' ? `Bring home ${goal.target} coins of gems`
    : type === 'acorn' ? 'Find the Golden Acorn and bring it home'
      : `Dig down to ${goal.target} m and fly home`;
  return { date, seed: `daily-${date}`, goal, label };
}

const METERS = (tiles) => Math.floor(tiles * METERS_PER_TILE);

export class Session {
  // kind 'main' plays the saved mine; 'daily' plays today's mine with the
  // loaner pod; 'demo' plays any seed with the given upgrades (title screen).
  constructor(save, { kind = 'main', daily = null, seed = null, upgrades = null } = {}) {
    this.save = save;
    this.kind = kind;
    this.daily = daily;
    this.events = [];
    this.result = null;
    const cfg = kind === 'main' ? MAIN_WORLD : DAILY_WORLD;
    const worldSeed = kind === 'main' ? save.seed : kind === 'daily' ? daily.seed : seed;
    this.world = generateWorld(worldSeed, cfg);
    this.baseTiles = this.world.tiles.slice();
    if (kind === 'main') applyDiff(this.world.tiles, save.diff);
    this.upgrades = kind === 'main' ? save.upgrades : kind === 'daily' ? LOANER : upgrades;
    const stats = podStats(this.upgrades);
    const pod = kind === 'main' && save.pod ? save.pod : null;
    this.mine = new Mine(this.world, stats, pod);
    this.haul = 0;
  }

  get pod() { return this.mine.pod; }
  get stats() { return this.mine.stats; }
  depthMeters() { return METERS(this.pod.depth); }

  refreshStats() {
    this.mine.stats = podStats(this.upgrades);
  }

  step(dt, controls) {
    this.mine.step(dt, controls);
    const evs = this.mine.events;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      this.events.push(e);
      if (e.type === 'dock') this.dock();
      else if (e.type === 'core' && this.kind === 'main') this.reachCore();
      else if (e.type === 'dug' && this.kind === 'main') this.save.stats.dug++;
    }
    evs.length = 0;
    if (this.kind === 'main') this.checkDepth();
  }

  // ------------------------------------------------------------ main mine

  checkDepth() {
    const s = this.save;
    const m = METERS(this.pod.maxDepth);
    if (m > s.bestDepth) {
      const was = s.bestDepth;
      s.bestDepth = m;
      if (was > 0 && Math.floor(m / 50) > Math.floor(was / 50)) this.events.push({ type: 'record', m });
    }
    for (const ms of MILESTONES) {
      if (ms.m > m || s.milestones.includes(ms.m)) continue;
      s.milestones.push(ms.m);
      s.coins += ms.coins;
      s.stats.earned += ms.coins;
      const paint = ms.paint && this.unlockPaint(ms.paint) ? ms.paint : null;
      this.events.push({ type: 'milestone', m: ms.m, coins: ms.coins, paint, label: ms.label || '' });
    }
  }

  unlockPaint(id) {
    if (this.save.paints.includes(id)) return false;
    this.save.paints.push(id);
    return true;
  }

  dock() {
    const p = this.pod, s = this.save;
    const value = cargoValue(p.cargo);
    const count = p.cargo.length;
    const wentDown = p.maxDepth > 1.2;
    if (this.kind === 'daily') {
      this.haul += value;
      p.cargo = [];
      if (wentDown && !this.result) this.finishDaily();
      p.fuel = Math.max(p.fuel, 0);
      return;
    }
    if (this.kind === 'demo') {
      p.cargo = [];
      p.relics = [];
      p.fuel = this.stats.tank;
      p.hull = this.stats.hull;
      p.maxDepth = 0;
      this.events.push({ type: 'docked', value, count, pieces: [], paints: [], trip: wentDown });
      return;
    }
    s.coins += value;
    s.stats.earned += value;
    s.stats.gems += count;
    p.cargo = [];
    const pieces = [];
    const paints = [];
    for (const idx of p.relics) {
      const piece = PIECES[idx];
      const dupe = !!s.museum[piece.id];
      const reward = Math.round(PIECE_REWARD[piece.setIndex] * (dupe ? 0.5 : 1));
      s.coins += reward;
      s.stats.earned += reward;
      s.museum[piece.id] = 1;
      pieces.push({ index: idx, id: piece.id, name: piece.name, reward, dupe });
      const set = MUSEUM[piece.setIndex];
      if (!dupe && set.pieces.every((id) => s.museum[id]) && this.unlockPaint(set.paint)) paints.push(set.paint);
    }
    p.relics = [];
    const refuel = this.stats.tank - p.fuel;
    p.fuel = this.stats.tank;
    p.hull = this.stats.hull;
    if (wentDown) s.stats.trips++;
    p.maxDepth = 0;
    this.events.push({ type: 'docked', value, count, pieces, paints, refuel, trip: wentDown });
  }

  reachCore() {
    const s = this.save;
    const first = !s.core;
    s.core = true;
    const paint = this.unlockPaint('rainbow') ? 'rainbow' : null;
    const coins = first ? 5000 : 1500;
    s.coins += coins;
    s.stats.earned += coins;
    this.events.push({ type: 'coreReached', first, paint, coins });
  }

  // Wiggles tows the pod home. The fee never exceeds the coins you hold.
  tow() {
    const p = this.pod;
    const reason = p.stranded || 'call';
    if (this.kind === 'daily') {
      if (!this.result) this.finishDaily(reason);
      return 0;
    }
    const fee = this.kind === 'main' ? Math.min(this.save.coins, towFee(p.depth)) : 0;
    if (this.kind === 'main') {
      this.save.coins -= fee;
      this.save.stats.tows++;
    }
    this.mine.boulders.length = 0;
    this.mine.wakeLoose();
    this.mine.resetToBase();
    this.events.push({ type: 'towed', fee, reason });
    // Land on the pad: sell, refuel, repair.
    p.docked = true;
    this.dock();
    return fee;
  }

  // Fresh mine after the core: same upgrades and museum, new seed.
  static freshMine(save) {
    save.mineNo = (save.mineNo || 1) + 1;
    save.seed = `meadow-${save.mineNo}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    save.diff = '';
    save.pod = null;
  }

  // Write the mine and pod into the save (call before persisting).
  store() {
    if (this.kind !== 'main') return;
    this.save.diff = encodeDiff(this.baseTiles, this.mine.tiles);
    const p = this.pod;
    // Falling boulders settle before saving, and a pod mid-drill keeps its
    // starting spot, so a reload never shows anything half-way.
    const x = p.drill ? p.drill.x0 : p.x, y = p.drill ? p.drill.y0 : p.y;
    this.save.pod = {
      x, y, fuel: p.fuel, hull: p.hull, cargo: p.cargo.slice(), relics: p.relics.slice(),
      maxDepth: p.maxDepth, docked: p.docked, facing: p.facing,
    };
  }

  // ------------------------------------------------------------ daily

  dailyProgress() {
    const g = this.daily.goal, p = this.pod;
    if (g.type === 'haul') return { now: this.haul + cargoValue(p.cargo), target: g.target, unit: 'coins' };
    if (g.type === 'depth') return { now: METERS(p.maxDepth), target: g.target, unit: 'm' };
    return { now: p.acorn ? 1 : 0, target: 1, unit: 'acorn' };
  }

  finishDaily(failReason = null) {
    const g = this.daily.goal, p = this.pod;
    let success = false;
    if (!failReason) {
      if (g.type === 'haul') success = this.haul >= g.target;
      else if (g.type === 'depth') success = METERS(p.maxDepth) >= g.target;
      else success = p.acorn;
    }
    const score = this.haul;
    const rec = recordDaily(this.save, this.daily.date, { success, score });
    let reward = 0;
    if (rec.firstClear) {
      reward = dailyReward(rec.streak);
      this.save.coins += reward;
      this.save.stats.earned += reward;
    }
    const paints = [];
    if (rec.streak >= 3 && this.unlockPaint('sunrise')) paints.push('sunrise');
    if (rec.streak >= 7 && this.unlockPaint('moonbeam')) paints.push('moonbeam');
    this.result = { success, score, failReason, reward, paints, ...rec, depth: METERS(p.maxDepth) };
    this.events.push({ type: 'dailyEnd', ...this.result });
  }
}

export function totalPieces(save) {
  return PIECES.filter((p) => save.museum[p.id]).length;
}

export function paintById(id) {
  return PAINTS.find((p) => p.id === id) || PAINTS[0];
}

export { UPGRADE_ORDER, T };
