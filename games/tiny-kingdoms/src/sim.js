// The DOM-free, deterministic battle simulation. A World steps in fixed
// STEP increments; the renderer reads it and never mutates it.
import {
  BUILDINGS, MARCH_SPEED, FORGE_BONUS, SHRINE_BONUS, MAX_STACK, OVERCAP_DECAY, TOWER_DAMAGE,
  HERO_COOLDOWN, KNIGHT_POWER, WIZARD_SHIELD, SHEPHERD_BOOST,
} from './data.js';
import { makeRng } from './rng.js';

export const STEP = 0.05;

// Defence multiplier of a building right now.
export function defenceOf(node) {
  return BUILDINGS[node.type].def * (node.shield > 0 ? 2 : 1);
}

// Resolve `attackers` (already multiplied by any attack power) hitting a
// garrison. Returns { captured, troops } where troops is what is left in the
// building afterwards (for the attacker if captured, the defender if not).
export function resolveAttack(attackers, troops, defence) {
  const wall = troops * defence;
  if (attackers > wall + 1e-9) return { captured: true, troops: attackers - wall };
  return { captured: false, troops: Math.max(0, troops - attackers / defence) };
}

// Troops a send of `fraction` takes from a building holding `troops`.
export function sendCount(troops, fraction) {
  return Math.max(0, Math.floor(troops * Math.min(1, Math.max(0, fraction)) + 1e-9));
}

export class World {
  // map: { seed, nodes: [{ x, y, type, owner, troops }] }
  // opts: { heroes: { [owner]: heroId } }
  constructor(map, opts = {}) {
    this.map = map;
    this.rng = makeRng((map.seed ?? 1) ^ 0x5bd1e995);
    this.nodes = map.nodes.map((n, id) => {
      const b = BUILDINGS[n.type];
      if (!b) throw new Error(`unknown building ${n.type}`);
      return {
        id, x: n.x, y: n.y, type: n.type, owner: n.owner | 0, troops: n.troops ?? 0,
        r: b.r, cap: b.cap, shield: 0, boost: 0, towerCd: 0,
      };
    });
    this.marches = [];
    this.nextMarch = 1;
    this.time = 0;
    this.tick = 0;
    this.events = [];
    this.owners = [...new Set(this.nodes.map((n) => n.owner).filter((o) => o > 0))].sort((a, b) => a - b);
    this.alive = new Set(this.owners);
    this.stats = {};
    for (const o of this.owners) this.stats[o] = { sends: 0, sent: 0, lost: 0, captured: 0, outAt: null };
    this.heroes = {};
    for (const [owner, id] of Object.entries(opts.heroes || {})) {
      if (id) this.heroes[owner] = { id, cd: 0, armed: false, out: false };
    }
    this.winner = null;
    this.over = false;
    this.mods = {};
    this.refreshMods();
  }

  // Forge and shrine bonuses per owner.
  refreshMods() {
    const mods = {};
    for (const o of this.owners) mods[o] = { forges: 0, shrines: 0 };
    for (const n of this.nodes) {
      if (!n.owner || !mods[n.owner]) continue;
      if (n.type === 'forge') mods[n.owner].forges++;
      if (n.type === 'shrine') mods[n.owner].shrines++;
    }
    this.mods = mods;
  }

  speedFor(owner) {
    const f = Math.min(MAX_STACK, this.mods[owner]?.forges || 0);
    return MARCH_SPEED * (1 + FORGE_BONUS * f);
  }

  growthOf(node) {
    if (!node.owner) return 0;
    const s = Math.min(MAX_STACK, this.mods[node.owner]?.shrines || 0);
    return BUILDINGS[node.type].grow * (1 + SHRINE_BONUS * s) * (node.boost > 0 ? 2 : 1);
  }

  // Arm the owner's hero so the next send carries it. Returns true if armed.
  armHero(owner, on = true) {
    const h = this.heroes[owner];
    if (!h || h.cd > 0 || h.out) return false;
    h.armed = on;
    return true;
  }

  // Send `fraction` of the troops from each source to `toId`. Returns the
  // number of troops sent (0 if nothing could go).
  send(owner, fromIds, toId, fraction = 0.5) {
    if (this.over) return 0;
    const target = this.nodes[toId];
    if (!target) return 0;
    const hero = this.heroes[owner];
    let total = 0;
    let biggest = null;
    const squads = [];
    for (const fid of new Set(fromIds)) {
      const src = this.nodes[fid];
      if (!src || src.owner !== owner || fid === toId) continue;
      const count = sendCount(src.troops, fraction);
      if (count < 1) continue;
      src.troops -= count;
      const dx = target.x - src.x, dy = target.y - src.y;
      const dist = Math.hypot(dx, dy);
      const m = {
        id: this.nextMarch++, owner, from: fid, to: toId, count, start: count,
        sx: src.x, sy: src.y, tx: target.x, ty: target.y, dist, travelled: 0,
        x: src.x, y: src.y, speed: this.speedFor(owner), hero: null, born: this.time,
      };
      this.marches.push(m);
      squads.push(m);
      total += count;
      if (!biggest || count > biggest.count) biggest = m;
    }
    if (!total) return 0;
    if (hero && hero.armed && biggest) {
      biggest.hero = hero.id;
      if (hero.id === 'ranger') biggest.speed *= 2;
      hero.armed = false;
      hero.out = true;
      hero.cd = HERO_COOLDOWN;
    }
    const st = this.stats[owner];
    if (st) { st.sends++; st.sent += total; }
    this.events.push({ type: 'send', owner, to: toId, from: squads.map((m) => m.from), count: total, hero: biggest?.hero || null });
    return total;
  }

  step(dt = STEP) {
    if (this.over) return;
    this.time += dt;
    this.tick++;
    for (const h of Object.values(this.heroes)) if (!h.out && h.cd > 0) h.cd = Math.max(0, h.cd - dt);

    // Growth.
    for (const n of this.nodes) {
      if (n.shield > 0) n.shield = Math.max(0, n.shield - dt);
      if (n.boost > 0) n.boost = Math.max(0, n.boost - dt);
      if (!n.owner) continue;
      if (n.troops < n.cap) n.troops = Math.min(n.cap, n.troops + this.growthOf(n) * dt);
      else if (n.troops > n.cap) n.troops = Math.max(n.cap, n.troops - OVERCAP_DECAY * dt);
    }

    // Movement.
    for (const m of this.marches) {
      m.travelled = Math.min(m.dist, m.travelled + m.speed * dt);
      const t = m.dist ? m.travelled / m.dist : 1;
      m.x = m.sx + (m.tx - m.sx) * t;
      m.y = m.sy + (m.ty - m.sy) * t;
    }

    this.clashes();
    this.towers(dt);

    // Arrivals, in march order so results are deterministic.
    let changed = false;
    for (const m of this.marches) {
      if (m.count <= 0 || m.travelled < m.dist) continue;
      changed = this.arrive(m) || changed;
      m.count = 0;
    }
    if (this.marches.some((m) => m.count <= 0)) {
      for (const m of this.marches) {
        if (m.count <= 0 && m.hero && this.heroes[m.owner]) this.heroes[m.owner].out = false;
      }
      this.marches = this.marches.filter((m) => m.count > 0);
    }
    if (changed) this.refreshMods();
    this.checkOut();
  }

  // Squads marching opposite ways on the same road fight one for one.
  clashes() {
    const ms = this.marches;
    for (let i = 0; i < ms.length; i++) {
      const a = ms[i];
      if (a.count <= 0) continue;
      for (let j = i + 1; j < ms.length; j++) {
        const b = ms[j];
        if (b.count <= 0 || b.owner === a.owner) continue;
        if (a.from !== b.to || a.to !== b.from) continue;
        if (a.travelled + b.travelled < a.dist) continue;
        const k = Math.min(a.count, b.count);
        a.count -= k;
        b.count -= k;
        this.events.push({ type: 'clash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, count: k, owners: [a.owner, b.owner] });
        if (a.count <= 0) break;
      }
    }
  }

  towers(dt) {
    for (const n of this.nodes) {
      if (n.type !== 'tower' || !n.owner) continue;
      if (n.towerCd > 0) { n.towerCd -= dt; continue; }
      const range = BUILDINGS.tower.range;
      let best = null, bestD = range * range;
      for (const m of this.marches) {
        if (m.owner === n.owner || m.count <= 0) continue;
        const d = (m.x - n.x) ** 2 + (m.y - n.y) ** 2;
        if (d < bestD) { bestD = d; best = m; }
      }
      if (!best) continue;
      n.towerCd = BUILDINGS.tower.fire;
      best.count = Math.max(0, best.count - TOWER_DAMAGE);
      this.events.push({ type: 'arrow', node: n.id, owner: n.owner, x: best.x, y: best.y, march: best.id });
    }
  }

  arrive(m) {
    const n = this.nodes[m.to];
    if (n.owner === m.owner) {
      n.troops += m.count;
      this.events.push({ type: 'reinforce', node: n.id, owner: m.owner, count: m.count });
      this.heroLanding(m, n);
      return false;
    }
    const power = m.hero === 'knight' ? KNIGHT_POWER : 1;
    const r = resolveAttack(m.count * power, n.troops, defenceOf(n));
    if (r.captured) {
      const prev = n.owner;
      n.owner = m.owner;
      n.troops = r.troops / power; // leftover power back into soldiers
      n.shield = 0;
      n.boost = 0;
      if (this.stats[prev]) this.stats[prev].lost++;
      if (this.stats[m.owner]) this.stats[m.owner].captured++;
      this.events.push({ type: 'capture', node: n.id, owner: m.owner, prev, count: m.count });
      this.heroLanding(m, n);
      return true;
    }
    n.troops = r.troops;
    this.events.push({ type: 'hold', node: n.id, owner: n.owner, attacker: m.owner, count: m.count });
    return false;
  }

  heroLanding(m, n) {
    if (m.hero === 'wizard') n.shield = WIZARD_SHIELD;
    if (m.hero === 'shepherd') n.boost = SHEPHERD_BOOST;
    if (m.hero) this.events.push({ type: 'hero', hero: m.hero, node: n.id, owner: m.owner });
  }

  checkOut() {
    for (const o of this.alive) {
      if (this.nodes.some((n) => n.owner === o) || this.marches.some((m) => m.owner === o)) continue;
      this.alive.delete(o);
      this.stats[o].outAt = this.time;
      this.events.push({ type: 'out', owner: o });
    }
    if (this.alive.size <= 1 && this.owners.length > 1) {
      this.over = true;
      this.winner = this.alive.size ? [...this.alive][0] : 0;
      this.events.push({ type: 'over', winner: this.winner });
    }
  }

  // Total troops per owner (buildings + squads), for the HUD and AI.
  strength() {
    const s = {};
    for (const o of this.owners) s[o] = 0;
    for (const n of this.nodes) if (n.owner) s[n.owner] += n.troops;
    for (const m of this.marches) s[m.owner] += m.count;
    return s;
  }

  buildingsOf(owner) {
    return this.nodes.filter((n) => n.owner === owner);
  }

  // A compact fingerprint of the full state, for determinism tests.
  fingerprint() {
    const parts = [this.tick, this.winner ?? '-'];
    for (const n of this.nodes) parts.push(n.owner, n.troops.toFixed(4));
    for (const m of this.marches) parts.push(m.id, m.owner, m.count, m.travelled.toFixed(3));
    return parts.join(',');
  }
}
