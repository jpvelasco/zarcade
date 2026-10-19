// The zoo simulation: coins, habitats, the collection, Joy, tasks, decor,
// daily eggs and ranks. DOM-free. Actions return a result object and push
// events to `zoo.events` for the renderer, sound and UI to react to.
import {
  BIOMES, ANIMALS, ANIMAL_INDEX, animalsOf, HABITAT_LEVELS, MAX_LEVEL, PLOTS_PER_BIOME, MAX_STARS,
  DECOS, DECO_INDEX, DECO_SPOTS_PER_BIOME, RANKS, JOY, START_COINS,
} from './data.js';
import { Rng, hashString } from './rng.js';
import {
  totalRate, habitatRate, eggPrice, buildCost, upgradeCost, snackCost, unlockCost, offlineEarnings,
} from './economy.js';
import { rollEgg, dailyAvailable, dailyBiome, nextStreak } from './eggs.js';
import { fillTasks, bumpTasks, taskDone, makeTask } from './tasks.js';

export const SAVE_VERSION = 1;
export const HABITAT_COUNT = BIOMES.length * PLOTS_PER_BIOME;
export const DECO_SPOTS = BIOMES.length * DECO_SPOTS_PER_BIOME;

export function newState(seed = 1) {
  const state = {
    v: SAVE_VERSION,
    seed: seed >>> 0,
    rng: hashString(`eggs:${seed}`),
    coins: START_COINS,
    earned: 0,
    unlocked: 1,
    habitats: Array.from({ length: HABITAT_COUNT }, () => ({ level: 0, joy: 0, animals: [] })),
    animals: {},
    order: [],
    waiting: [],
    eggsBought: BIOMES.map(() => 0),
    pity: BIOMES.map(() => ({ rare: 0, legend: 0 })),
    giftEggs: 1,
    decos: { owned: [], placed: {} },
    tasks: { list: [], counter: 0, claimed: 0 },
    daily: { last: '', streak: 0, best: 0 },
    rank: 0,
    complete: [],
    stats: { pets: 0, snacks: 0, hatched: 0, visitors: 0, bestRate: 0, playSeconds: 0, upgrades: 0 },
    settings: { muted: false, music: true },
    lastSeen: 0,
  };
  state.habitats[0].level = 1; // a free starter habitat in the Meadow
  fillTasks(state);
  return state;
}

// Bring an older or partial save up to the current shape.
export function normalize(raw, seed = 1) {
  const base = newState(raw?.seed ?? seed);
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, ...raw };
  s.stats = { ...base.stats, ...(raw.stats || {}) };
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  s.daily = { ...base.daily, ...(raw.daily || {}) };
  s.decos = { owned: [...(raw.decos?.owned || [])], placed: { ...(raw.decos?.placed || {}) } };
  s.tasks = { ...base.tasks, ...(raw.tasks || {}) };
  s.habitats = base.habitats.map((h, i) => {
    const r = raw.habitats?.[i];
    if (!r) return h;
    return {
      level: Math.max(0, Math.min(MAX_LEVEL, r.level | 0)),
      joy: Math.max(0, Math.min(JOY.max, +r.joy || 0)),
      animals: (r.animals || []).filter((id) => id in ANIMAL_INDEX),
    };
  });
  s.eggsBought = BIOMES.map((_, b) => raw.eggsBought?.[b] | 0);
  s.pity = BIOMES.map((_, b) => ({ rare: raw.pity?.[b]?.rare | 0, legend: raw.pity?.[b]?.legend | 0 }));
  s.animals = {};
  for (const [id, a] of Object.entries(raw.animals || {})) if (id in ANIMAL_INDEX) s.animals[id] = { stars: Math.max(1, Math.min(MAX_STARS, a.stars | 0)) };
  s.order = (raw.order || Object.keys(s.animals)).filter((id) => s.animals[id]);
  s.waiting = (raw.waiting || []).filter((id) => s.animals[id]);
  s.unlocked = Math.max(1, Math.min(BIOMES.length, raw.unlocked | 0 || 1));
  s.coins = Math.max(0, +raw.coins || 0);
  s.lastSeen = Number.isFinite(+raw.lastSeen) && +raw.lastSeen > 0 ? +raw.lastSeen : 0;
  s.complete = (raw.complete || []).filter((b) => b >= 0 && b < BIOMES.length);
  s.v = SAVE_VERSION;
  if (!Array.isArray(s.tasks.list)) s.tasks.list = [];
  fillTasks(s);
  return s;
}

export class Zoo {
  constructor(state = newState()) {
    this.state = state;
    this.rng = new Rng(state.rng);
    this.events = [];
    this.session = 0;
    this.rate = totalRate(state);
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  // ---------------------------------------------------------------- queries

  get coins() { return this.state.coins; }
  biomeOf(i) { return Math.floor(i / PLOTS_PER_BIOME); }
  plotOf(i) { return i % PLOTS_PER_BIOME; }
  isUnlocked(b) { return b < this.state.unlocked; }
  habitat(i) { return this.state.habitats[i]; }
  capacity(i) { const h = this.habitat(i); return h.level ? HABITAT_LEVELS[h.level - 1].cap : 0; }
  hasRoom(i) { const h = this.habitat(i); return h.level > 0 && h.animals.length < this.capacity(i); }
  habitatOfAnimal(id) { return this.state.habitats.findIndex((h) => h.animals.includes(id)); }
  owned(id) { return !!this.state.animals[id]; }
  ownedCount(b = null) {
    return Object.keys(this.state.animals).filter((id) => b === null || ANIMALS[ANIMAL_INDEX[id]].biome === BIOMES[b].id).length;
  }
  biomeComplete(b) { return animalsOf(BIOMES[b].id).every((a) => this.state.animals[a.id]); }
  waitingIn(b) { return this.state.waiting.filter((id) => ANIMALS[ANIMAL_INDEX[id]].biome === BIOMES[b].id); }
  habitatRate(i) { return habitatRate(this.state, i) * (1 + this.decoBonus()); }
  decoBonus() { let s = 0; for (const id of Object.values(this.state.decos.placed)) s += DECOS[DECO_INDEX[id]].bonus; return s; }

  eggPrice(b) { return eggPrice(this.state, b); }
  buildCost(i) { return buildCost(this.biomeOf(i), this.plotOf(i)); }
  upgradeCost(i) { return upgradeCost(this.biomeOf(i), this.habitat(i).level); }
  snackCost(i) { return snackCost(this.biomeOf(i)); }
  unlockCost() { return unlockCost(this.state.unlocked); }
  nextBiome() { return this.state.unlocked < BIOMES.length ? this.state.unlocked : -1; }

  score() {
    const s = this.state;
    let score = 0;
    for (const a of Object.values(s.animals)) score += 10 + (a.stars - 1) * 2;
    for (const h of s.habitats) score += h.level * 3;
    score += s.decos.owned.length * 5 + (s.unlocked - 1) * 10;
    return score;
  }
  rankIndex() {
    const sc = this.score();
    let r = 0;
    RANKS.forEach((rank, i) => { if (sc >= rank.score) r = i; });
    return r;
  }

  // ---------------------------------------------------------------- time

  tick(dt) {
    const s = this.state;
    this.rate = totalRate(s);
    const gain = this.rate * dt;
    s.coins += gain;
    s.earned += gain;
    s.stats.playSeconds += dt;
    this.session += dt;
    if (this.rate > s.stats.bestRate) {
      const prev = s.stats.bestRate;
      s.stats.bestRate = this.rate;
      // Only celebrate real jumps, not every tiny Joy wiggle.
      if (prev > 0 && this.rate >= prev * 1.25 && this.rate - (this.lastBestShown || 0) > prev * 0.2) {
        this.lastBestShown = this.rate;
        this.emit('best', { rate: this.rate });
      }
    }
    for (const h of s.habitats) if (h.joy > 0) h.joy = Math.max(0, h.joy - JOY.fadePerSec * dt);
    this.taskEvent('earn', gain);
  }

  // Credit coins for time away; returns { seconds, coins }.
  applyOffline(nowMs) {
    const res = offlineEarnings(this.state, nowMs);
    if (res.coins > 0) {
      this.state.coins += res.coins;
      this.state.earned += res.coins;
    }
    this.state.lastSeen = nowMs;
    return res;
  }

  // ---------------------------------------------------------------- actions

  spend(cost) {
    if (!(this.state.coins >= cost)) return false;
    this.state.coins -= cost;
    return true;
  }

  buyEgg(b) {
    if (!this.isUnlocked(b)) return { ok: false, reason: 'locked' };
    const price = this.eggPrice(b);
    if (!this.spend(price)) return { ok: false, reason: 'coins' };
    this.state.eggsBought[b]++;
    return this.hatch(b, { source: 'shop', price });
  }

  useGiftEgg(b) {
    if (!this.isUnlocked(b) || this.state.giftEggs < 1) return { ok: false, reason: 'none' };
    this.state.giftEggs--;
    return this.hatch(b, { source: 'gift' });
  }

  dailyAvailable(key) { return dailyAvailable(this.state, key); }
  dailyBiome(key) { return dailyBiome(key, this.state.unlocked); }

  claimDaily(key) {
    const s = this.state;
    if (!dailyAvailable(s, key)) return { ok: false, reason: 'claimed' };
    s.daily.streak = nextStreak(s.daily, key);
    s.daily.last = key;
    s.daily.best = Math.max(s.daily.best, s.daily.streak);
    const gift = Math.round(Math.max(20, totalRate(s, { joy: false }) * 30) * Math.min(7, s.daily.streak));
    s.coins += gift;
    const res = this.hatch(this.dailyBiome(key), { source: 'daily', daily: true });
    res.streak = s.daily.streak;
    res.gift = gift;
    this.emit('daily', { streak: s.daily.streak, gift });
    return res;
  }

  hatch(b, { source = 'shop', daily = false, price = 0 } = {}) {
    const s = this.state;
    const animal = rollEgg(s, b, this.rng, { daily });
    s.rng = this.rng.state;
    const isNew = !s.animals[animal.id];
    let home = -1;
    if (isNew) {
      s.animals[animal.id] = { stars: 1 };
      s.order.push(animal.id);
      home = this.placeAnimal(animal.id);
    } else {
      const a = s.animals[animal.id];
      a.stars = Math.min(MAX_STARS, a.stars + 1);
      home = this.habitatOfAnimal(animal.id);
    }
    s.stats.hatched++;
    const res = {
      ok: true, id: animal.id, animal, biome: b, isNew, stars: s.animals[animal.id].stars,
      home, waiting: isNew && home < 0, source, price,
    };
    this.emit('hatch', res);
    this.taskEvent('hatch', 1, { biome: b });
    if (isNew && this.biomeComplete(b) && !s.complete.includes(b)) {
      s.complete.push(b);
      this.emit('biomeComplete', { biome: b });
    }
    this.checkRank();
    return res;
  }

  // Move a new animal into the first habitat of its biome with room.
  placeAnimal(id) {
    const b = BIOMES.findIndex((x) => x.id === ANIMALS[ANIMAL_INDEX[id]].biome);
    for (let p = 0; p < PLOTS_PER_BIOME; p++) {
      const i = b * PLOTS_PER_BIOME + p;
      if (this.hasRoom(i)) {
        this.habitat(i).animals.push(id);
        this.state.waiting = this.state.waiting.filter((w) => w !== id);
        return i;
      }
    }
    if (!this.state.waiting.includes(id)) this.state.waiting.push(id);
    return -1;
  }

  placeWaiting(b) {
    const moved = [];
    for (const id of this.waitingIn(b)) {
      const home = this.placeAnimal(id);
      if (home >= 0) moved.push({ id, home });
    }
    for (const m of moved) this.emit('moveIn', m);
    return moved;
  }

  build(i) {
    const h = this.habitat(i);
    const b = this.biomeOf(i);
    if (!h || h.level > 0 || !this.isUnlocked(b)) return { ok: false, reason: 'invalid' };
    if (!this.spend(this.buildCost(i))) return { ok: false, reason: 'coins' };
    h.level = 1;
    this.emit('build', { habitat: i });
    this.placeWaiting(b);
    this.taskEvent('build', 1);
    this.checkRank();
    return { ok: true };
  }

  upgrade(i) {
    const h = this.habitat(i);
    if (!h || h.level < 1 || h.level >= MAX_LEVEL) return { ok: false, reason: 'invalid' };
    if (!this.spend(this.upgradeCost(i))) return { ok: false, reason: 'coins' };
    h.level++;
    this.state.stats.upgrades++;
    this.emit('upgrade', { habitat: i, level: h.level });
    this.placeWaiting(this.biomeOf(i));
    this.taskEvent('upgrade', 1);
    this.checkRank();
    return { ok: true, level: h.level };
  }

  feed(i) {
    const h = this.habitat(i);
    if (!h || !h.animals.length) return { ok: false, reason: 'empty' };
    if (h.joy >= JOY.max - 1) return { ok: false, reason: 'full' };
    if (!this.spend(this.snackCost(i))) return { ok: false, reason: 'coins' };
    h.joy = Math.min(JOY.max, h.joy + JOY.snack);
    this.state.stats.snacks++;
    this.emit('snack', { habitat: i });
    this.taskEvent('snack', 1);
    return { ok: true, joy: h.joy };
  }

  pet(i, id = null) {
    const h = this.habitat(i);
    if (!h || !h.animals.length) return { ok: false };
    h.joy = Math.min(JOY.max, h.joy + JOY.pet);
    this.state.stats.pets++;
    this.emit('pet', { habitat: i, id: id || h.animals[0] });
    this.taskEvent('pet', 1);
    return { ok: true, joy: h.joy };
  }

  unlockNext() {
    const b = this.nextBiome();
    if (b < 0) return { ok: false, reason: 'done' };
    if (!this.spend(unlockCost(b))) return { ok: false, reason: 'coins' };
    this.state.unlocked++;
    this.habitat(b * PLOTS_PER_BIOME).level = 1; // the first habitat comes with the land
    this.emit('unlock', { biome: b });
    this.checkRank();
    return { ok: true, biome: b };
  }

  buyDeco(id) {
    const d = DECOS[DECO_INDEX[id]];
    if (!d || this.state.decos.owned.includes(id)) return { ok: false, reason: 'invalid' };
    if (!this.spend(d.price)) return { ok: false, reason: 'coins' };
    this.state.decos.owned.push(id);
    this.emit('decoBuy', { id });
    this.checkRank();
    return { ok: true };
  }

  spotOpen(spot) { return Math.floor(spot / DECO_SPOTS_PER_BIOME) < this.state.unlocked; }
  decoAt(spot) { return this.state.decos.placed[spot] || null; }
  spotOf(id) {
    const e = Object.entries(this.state.decos.placed).find(([, d]) => d === id);
    return e ? Number(e[0]) : -1;
  }

  // Place an owned decoration. If the spot is taken, the old one goes back
  // to storage; if this deco was elsewhere it moves.
  placeDeco(id, spot) {
    const placed = this.state.decos.placed;
    if (!this.state.decos.owned.includes(id) || !this.spotOpen(spot) || spot < 0 || spot >= DECO_SPOTS) return { ok: false };
    const from = this.spotOf(id);
    if (from >= 0) delete placed[from];
    const replaced = placed[spot] || null;
    placed[spot] = id;
    this.emit('decoPlace', { id, spot, replaced });
    this.taskEvent('deco', 1);
    return { ok: true, replaced };
  }

  storeDeco(id) {
    const spot = this.spotOf(id);
    if (spot < 0) return { ok: false };
    delete this.state.decos.placed[spot];
    this.emit('decoStore', { id, spot });
    return { ok: true };
  }

  welcomeVisitor() {
    this.state.stats.visitors++;
    this.taskEvent('visitors', 1);
  }

  taskEvent(type, amount, extra) {
    const done = bumpTasks(this.state, type, amount, extra);
    for (const t of done) this.emit('taskDone', { task: t });
  }

  claimTask(k) {
    const s = this.state;
    const task = s.tasks.list[k];
    if (!task || !taskDone(task)) return { ok: false };
    if (task.reward.coins) s.coins += task.reward.coins;
    if (task.reward.egg) s.giftEggs += task.reward.egg;
    s.tasks.claimed++;
    const taken = s.tasks.list.filter((_, j) => j !== k).map((t) => t.type);
    s.tasks.list[k] = makeTask(s, s.tasks.counter++, taken);
    this.emit('taskClaim', { task });
    return { ok: true, reward: task.reward, task };
  }

  checkRank() {
    const r = this.rankIndex();
    if (r > this.state.rank) {
      const gained = r - this.state.rank;
      this.state.rank = r;
      this.state.giftEggs += gained;
      this.emit('rank', { rank: r });
    }
  }
}
