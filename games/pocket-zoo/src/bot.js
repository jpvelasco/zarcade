// A greedy keeper for balance tests, the title-screen demo zoo and
// ?autopilot. It weighs each purchase by income gained per coin.
import { BIOMES, RARITIES, RARITY, HABITAT_LEVELS, MAX_LEVEL, PLOTS_PER_BIOME, DECOS, animalsOf, JOY } from './data.js';
import { animalRate } from './economy.js';
import { dayKey } from './eggs.js';

export class Bot {
  constructor(zoo, { pets = true, petRate = 1.5 } = {}) {
    this.zoo = zoo;
    this.pets = pets;
    this.petRate = petRate; // pets per second, like a busy player
    this.petClock = 0;
    this.thinkClock = 0;
    this.actions = [];
  }

  // Expected income from one more egg in biome b.
  eggValue(b) {
    const zoo = this.zoo;
    const s = zoo.state;
    const animals = animalsOf(BIOMES[b].id);
    const weights = RARITIES.map((r) => RARITY[r].weight);
    const total = weights.reduce((a, w) => a + w, 0);
    let room = 0;
    for (let p = 0; p < PLOTS_PER_BIOME; p++) {
      const i = b * PLOTS_PER_BIOME + p;
      const h = s.habitats[i];
      if (h.level) room += zoo.capacity(i) - h.animals.length;
    }
    room -= zoo.waitingIn(b).length;
    let v = 0;
    RARITIES.forEach((r, ri) => {
      const pool = animals.filter((a) => a.rarity === r);
      for (const a of pool) {
        const owned = s.animals[a.id];
        const per = (weights[ri] / total) / pool.length;
        const base = animalRate(a.id, 1);
        if (!owned) v += per * (room > 0 ? base * 1.4 : base * 0.3);
        else if (owned.stars < 5) v += per * base * 0.2 * 1.4;
      }
    });
    return v;
  }

  options() {
    const zoo = this.zoo;
    const s = zoo.state;
    const rate = Math.max(1, zoo.rate);
    const out = [];
    for (let b = 0; b < s.unlocked; b++) {
      out.push({ kind: 'egg', b, cost: zoo.eggPrice(b), gain: this.eggValue(b) });
      for (let p = 0; p < PLOTS_PER_BIOME; p++) {
        const i = b * PLOTS_PER_BIOME + p;
        const h = s.habitats[i];
        const waiting = zoo.waitingIn(b);
        if (h.level === 0) {
          const gain = waiting.slice(0, 2).reduce((a, id) => a + animalRate(id, s.animals[id].stars) * 1.4, 0) + this.eggValue(b) * 0.3;
          out.push({ kind: 'build', i, cost: zoo.buildCost(i), gain });
        } else if (h.level < MAX_LEVEL) {
          const cur = HABITAT_LEVELS[h.level - 1];
          const nxt = HABITAT_LEVELS[h.level];
          const hr = zoo.habitatRate(i) || 0;
          let gain = hr * (nxt.mult / cur.mult - 1);
          if (nxt.cap > cur.cap && waiting.length) gain += animalRate(waiting[0], s.animals[waiting[0]].stars) * nxt.mult;
          out.push({ kind: 'upgrade', i, cost: zoo.upgradeCost(i), gain });
        }
      }
    }
    const nb = zoo.nextBiome();
    if (nb >= 0) out.push({ kind: 'unlock', cost: zoo.unlockCost(), gain: BIOMES[nb].tier * 3 + rate * 0.15 });
    for (const d of DECOS) if (!s.decos.owned.includes(d.id)) out.push({ kind: 'deco', id: d.id, cost: d.price, gain: rate * d.bonus });
    for (const o of out) o.roi = o.gain / Math.max(1, o.cost);
    return out.sort((a, b) => b.roi - a.roi);
  }

  doOption(o) {
    const zoo = this.zoo;
    let res;
    if (o.kind === 'egg') res = zoo.buyEgg(o.b);
    else if (o.kind === 'build') res = zoo.build(o.i);
    else if (o.kind === 'upgrade') res = zoo.upgrade(o.i);
    else if (o.kind === 'unlock') res = zoo.unlockNext();
    else if (o.kind === 'deco') {
      res = zoo.buyDeco(o.id);
      if (res.ok) this.placeDeco(o.id);
    }
    if (res?.ok) this.actions.push(o.kind);
    return res;
  }

  placeDeco(id) {
    const zoo = this.zoo;
    for (let spot = 0; spot < BIOMES.length * 3; spot++) {
      if (zoo.spotOpen(spot) && !zoo.decoAt(spot)) return zoo.placeDeco(id, spot);
    }
    return null;
  }

  // One decision. Returns true when it did something.
  think(now = Date.now()) {
    const zoo = this.zoo;
    const s = zoo.state;
    for (let k = 0; k < s.tasks.list.length; k++) if (zoo.claimTask(k).ok) return true;
    const key = dayKey(new Date(now));
    if (this.daily && zoo.dailyAvailable(key)) { zoo.claimDaily(key); return true; }
    if (s.giftEggs > 0) {
      let best = 0;
      let bestV = -1;
      for (let b = 0; b < s.unlocked; b++) { const v = this.eggValue(b); if (v > bestV) { bestV = v; best = b; } }
      zoo.useGiftEgg(best);
      return true;
    }
    for (let b = 0; b < s.unlocked; b++) {
      const decoFree = s.decos.owned.find((id) => zoo.spotOf(id) < 0);
      if (decoFree && this.placeDeco(decoFree)?.ok) return true;
    }
    const opts = this.options();
    const best = opts[0];
    if (!best) return false;
    if (s.coins >= best.cost) return !!this.doOption(best).ok;
    // Saving for the best option; buy a cheap good one meanwhile.
    const alt = opts.find((o) => o.roi >= best.roi * 0.6 && o.cost <= s.coins && o.cost < best.cost * 0.25);
    if (alt) return !!this.doOption(alt).ok;
    return false;
  }

  // Advance the zoo by dt, thinking twice a second and petting.
  step(dt, now) {
    const zoo = this.zoo;
    if (this.pets) {
      this.petClock += dt * this.petRate;
      while (this.petClock >= 1) {
        this.petClock -= 1;
        const s = zoo.state;
        let low = -1;
        for (let i = 0; i < s.habitats.length; i++) {
          const h = s.habitats[i];
          if (h.animals.length && h.joy < JOY.max - JOY.pet && (low < 0 || h.joy < s.habitats[low].joy)) low = i;
        }
        if (low >= 0) zoo.pet(low);
      }
      const s = zoo.state;
      for (let i = 0; i < s.habitats.length; i++) {
        const h = s.habitats[i];
        if (h.animals.length && h.joy < 30 && zoo.snackCost(i) < zoo.rate * 4) { zoo.feed(i); break; }
      }
    }
    this.thinkClock += dt;
    if (this.thinkClock >= 0.5) {
      this.thinkClock = 0;
      this.think(now);
    }
    zoo.tick(dt);
  }
}

// Run a zoo forward in big steps (tests and the title demo).
export function simulate(zoo, seconds, { dt = 1, onSecond = null, ...opts } = {}) {
  const bot = new Bot(zoo, opts);
  for (let t = 0; t < seconds; t += dt) {
    bot.step(dt, 0);
    zoo.events.length = 0;
    if (onSecond) onSecond(t, zoo);
  }
  return bot;
}
