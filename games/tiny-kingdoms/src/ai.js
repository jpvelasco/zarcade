// Rival kingdoms and the reference bot. DOM-free and deterministic: every
// choice comes from the world state and the AI's own seeded RNG.
import { BUILDINGS, DIFFICULTIES } from './data.js';
import { makeRng, hashString } from './rng.js';
import { World, STEP, defenceOf } from './sim.js';

const STYLES = {
  cautious: { margin: 1.4, reserve: 0.3, distW: 2.2, neutralW: 1, enemyW: 0.8, millW: 1, weakW: 0, defend: true, consolidate: 0.9 },
  greedy: { margin: 1.12, reserve: 0, distW: 0.8, neutralW: 1.6, enemyW: 0.8, millW: 1.6, weakW: 0, defend: false, consolidate: 0.8 },
  sneaky: { margin: 1.15, reserve: 0.1, distW: 1, neutralW: 0.8, enemyW: 1.4, millW: 1, weakW: 2.2, defend: false, consolidate: 0.95 },
  // The reference bot: balanced, and it uses its hero.
  reference: { margin: 1.1, reserve: 0.05, distW: 1.0, neutralW: 1.1, enemyW: 1.4, millW: 1.3, weakW: 2.2, defend: true, consolidate: 0.85 },
};

export const AI_STYLES = Object.keys(STYLES);
// Squads smaller than this are not worth the clutter.
const MIN_SQUAD = 3;
const BLEND = { gentle: 0, easy: 0, normal: 0.25, hard: 0.6 };

function blendStyle(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) out[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * t : a[k];
  return out;
}

export class AI {
  constructor(owner, { personality = 'greedy', difficulty = 'normal', seed = 1, grace } = {}) {
    this.owner = owner;
    this.personality = personality;
    this.difficulty = difficulty;
    this.level = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    // Smarter rivals keep their personality but lean towards the balanced
    // reference play, so difficulty matters more than personality.
    this.style = blendStyle(STYLES[personality] || STYLES.greedy, STYLES.reference, BLEND[difficulty] ?? 0.3);
    this.rng = makeRng((seed ^ Math.imul(owner + 1, 0x9e3779b1) ^ hashString(personality + difficulty)) >>> 0);
    // Stagger the first think so rivals don't move in lockstep.
    this.timer = this.level.think * (0.4 + 0.5 * this.rng());
    this.decisions = 0;
    this.grace = grace ?? this.level.grace;
  }

  update(world, dt) {
    if (world.over || !world.alive.has(this.owner)) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer += this.level.think * (0.85 + 0.3 * this.rng());
    this.think(world);
  }

  think(world) {
    const me = this.owner;
    const mine = world.nodes.filter((n) => n.owner === me);
    if (!mine.length) return;
    this.decisions++;
    const speed = world.speedFor(me);
    const lv = this.level, st = this.style;
    const defend = lv.defend || (st.defend && this.difficulty !== 'easy' && this.difficulty !== 'gentle');
    const reserve = Math.min(0.6, st.reserve + lv.reserve);
    const incoming = this.incoming(world);
    const spare = new Map();
    for (const n of mine) spare.set(n.id, n.troops * (1 - reserve));

    let actions = this.difficulty === 'hard' ? 2 : 1;

    // 1. Defence: reinforce buildings that will fall to squads already marching.
    if (defend) {
      for (const n of mine) {
        const inc = incoming.get(n.id);
        if (!inc || !inc.hostile) continue;
        const eta = inc.hostileEta;
        const hold = (n.troops + world.growthOf(n) * eta + inc.friendly) * defenceOf(n);
        const deficit = inc.hostile * (1 + 0.1 * lv.foresight) - hold;
        if (deficit <= 0) continue;
        const helpers = mine
          .filter((h) => h.id !== n.id && spare.get(h.id) >= MIN_SQUAD && dist(h, n) / speed < eta + 0.5)
          .sort((a, b) => dist(a, n) - dist(b, n));
        let need = deficit / defenceOf(n) + 2;
        const from = [];
        for (const h of helpers) {
          if (need <= 0 || from.length >= lv.sources) break;
          need -= spare.get(h.id);
          from.push(h);
        }
        if (!from.length) continue;
        for (const h of from) {
          world.send(me, [h.id], n.id, (1 - reserve));
          spare.set(h.id, 0);
        }
        if (--actions <= 0) return;
      }
    }

    // 2. Attack the best target we can afford.
    for (let tries = 0; tries < actions; tries++) {
      const plan = this.bestAttack(world, mine, spare, incoming, speed, reserve);
      if (!plan) break;
      if (this.wantsHero(world, plan)) world.armHero(me, true);
      for (const s of plan.sources) {
        const f = Math.min(1 - reserve, (s.take + 1) / Math.max(1, s.node.troops));
        world.send(me, [s.node.id], plan.target.id, f);
        spare.set(s.node.id, 0);
      }
      actions--;
    }
    if (actions <= 0) return;

    // 3. Don't waste growth: move troops from full back buildings to the front.
    const front = this.frontline(world, mine);
    if (!front) return;
    for (const n of mine) {
      if (n.id === front.id || n.troops < n.cap * st.consolidate || spare.get(n.id) < 10) continue;
      world.send(me, [n.id], front.id, 0.5);
      break;
    }
  }

  // Squads heading to each building: hostile power and friendly troops.
  incoming(world) {
    const map = new Map();
    for (const m of world.marches) {
      const t = world.nodes[m.to];
      let e = map.get(t.id);
      if (!e) map.set(t.id, (e = { hostile: 0, friendly: 0, mine: 0, hostileEta: Infinity }));
      const eta = (m.dist - m.travelled) / m.speed;
      if (m.owner === t.owner) e.friendly += m.count;
      else {
        e.hostile += m.count * (m.hero === 'knight' ? 1.5 : 1);
        e.hostileEta = Math.min(e.hostileEta, eta);
      }
      if (m.owner === this.owner) e.mine += m.count;
    }
    return map;
  }

  bestAttack(world, mine, spare, incoming, speed, reserve) {
    const me = this.owner, lv = this.level, st = this.style;
    const graceOn = world.time < this.grace;
    let best = null;
    for (const t of world.nodes) {
      if (t.owner === me) continue;
      if (graceOn && t.owner) continue;
      const inc = incoming.get(t.id);
      const mineIncoming = inc ? inc.mine : 0;
      // Sources, nearest first.
      const sources = mine
        .filter((s) => spare.get(s.id) >= MIN_SQUAD)
        .map((s) => ({ node: s, d: dist(s, t), avail: Math.floor(spare.get(s.id)) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, lv.sources);
      if (!sources.length) continue;
      const far = sources[sources.length - 1].d;
      const eta = far / speed;
      const def = this.difficulty === 'easy' || this.difficulty === 'gentle' ? 1 : defenceOf(t);
      let garrison = t.troops;
      if (t.owner) garrison += world.growthOf(t) * eta * lv.foresight;
      if (inc && lv.foresight > 0) {
        // Reinforcements already heading there make it harder.
        garrison += inc.friendly * lv.foresight;
      }
      const need = Math.max(1, garrison * def * st.margin + 1 - mineIncoming);
      if (mineIncoming > 0 && need <= 1) continue; // already handled
      // Pick just enough of the nearest sources.
      let sum = 0;
      const used = [];
      for (const s of sources) {
        if (sum >= need) break;
        const take = Math.min(s.avail, need - sum);
        used.push({ node: s.node, take });
        sum += s.avail;
      }
      if (sum < need) continue;
      // Value of the target.
      const b = BUILDINGS[t.type];
      let value = b.grow * 18 + (t.type === 'castle' ? 6 : 0) + (t.type === 'tower' ? 4 : 0) + 6;
      if (t.type === 'mill') value *= st.millW;
      if (!t.owner) value *= st.neutralW;
      else {
        value *= st.enemyW;
        value += 6; // also weakens a rival
        if (st.weakW && t.troops < Math.max(6, t.cap * 0.2)) value *= 1 + st.weakW * 0.5;
        if (st.weakW && inc && inc.hostile === 0 && t.troops < 10) value *= 1 + st.weakW * 0.25;
      }
      const cost = need + st.distW * (far / speed) * 2.2;
      let score = value / cost;
      if (lv.noise) score *= 1 + lv.noise * (this.rng() * 2 - 1);
      if (!best || score > best.score) best = { target: t, sources: used, score, need };
    }
    return best;
  }

  wantsHero(world, plan) {
    const h = world.heroes[this.owner];
    if (!h || h.cd > 0 || h.out) return false;
    if (h.id === 'knight') return plan.need >= 12;
    if (h.id === 'ranger') return true;
    if (h.id === 'wizard') return !!plan.target.owner;
    return plan.target.type === 'mill' || plan.target.type === 'castle';
  }

  // Our building closest to any building we don't own.
  frontline(world, mine) {
    let best = null, bestD = Infinity;
    for (const n of mine) {
      for (const t of world.nodes) {
        if (t.owner === this.owner || !t.owner) continue;
        const d = dist(n, t);
        if (d < bestD) { bestD = d; best = n; }
      }
    }
    return best;
  }
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Run a whole match headlessly. `players` maps owner → AI options, or
// 'idle' for a kingdom that never acts. Returns the finished world.
export function simulate(map, players, { maxTime = 600, heroes = {}, onStep, aiSeed = 0 } = {}) {
  const world = new World(map, { heroes });
  const ais = [];
  for (const [owner, opts] of Object.entries(players)) {
    if (opts === 'idle') continue;
    ais.push(new AI(Number(owner), { seed: (map.seed + aiSeed) >>> 0, ...opts }));
  }
  while (!world.over && world.time < maxTime) {
    for (const ai of ais) ai.update(world, STEP);
    world.step(STEP);
    world.events.length = 0;
    if (onStep) onStep(world);
  }
  return world;
}
