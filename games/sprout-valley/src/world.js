// The whole simulation: farmer, field, animals, villagers, critters, clock,
// shops and festivals. DOM-free; the renderer only reads it and the page
// drives it through step(dt, controls) and the menu methods.
import {
  CROPS, ITEMS, TOOLS, CAN_LEVELS, UPGRADES, ANIMALS, RECIPES, FISH, CRITTERS, DECOR, FESTIVALS, VILLAGERS,
  VILLAGER_IDS, GOALS, CROP_IDS, FISH_IDS, CRITTER_IDS, GOODS, giftable, sellable,
} from './data.js';
import {
  W, H, G, idx, inBounds, inRect, buildMap, findPath, spotFor, FIELD_A, FIELD_B, GREENHOUSE, FARM, PEN,
  PLAYER_START, homeOf, TROUGH, PEN_ROAM, DIRS4,
} from './map.js';
import { dateOf, minutesFor, weatherFor, isWet, DAY_START, DAY_END, MARKET_DAY } from './time.js';
import { mulberry32, hash, rngFor, weightedPick } from './rng.js';
import * as Crops from './crops.js';
import * as Eco from './economy.js';
import * as Vill from './villagers.js';
import * as Anim from './animals.js';
import { festivalOn, festivalRunning, newFestivalState, eggSpots } from './festivals.js';

export const BELT_SIZE = 9;
export const PLAYER_SPEED = 4.6; // tiles per second
export const VILLAGER_SPEED = 2.4;
const TOOL_TIME = 0.28;
const HALF_W = 0.28, HALF_H = 0.18;
const DIR = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const PERIODS = [[6 * 60, 'morning'], [12 * 60, 'afternoon'], [17 * 60, 'evening'], [20 * 60, 'night']];
const MAX_TUFTS = 46;

export const periodOf = (minute) => { let p = 'morning'; for (const [t, n] of PERIODS) if (minute >= t) p = n; return p; };

export class World {
  constructor({ seed = 1 } = {}) {
    this.seed = seed >>> 0;
    this.map = buildMap(this.seed);
    this.day = 0;
    this.minute = DAY_START;
    this.speed = 'normal';
    this.money = 500;
    this.earned = 0;
    this.inv = { turnip_seed: 15, hay: 10 };
    this.belt = [...TOOLS, 'turnip_seed', null, null, null];
    this.sel = 0;
    this.canLevel = 0;
    this.water = CAN_LEVELS[0].capacity;
    this.upgrades = { field: false, greenhouse: false };
    const n = W * H;
    this.soil = new Uint8Array(n);
    this.wet = new Uint8Array(n);
    this.crop = new Array(n).fill(null);
    this.obj = new Array(n).fill(null); // { type: 'stone'|'weed'|'sprinkler'|'decor', id? }
    this.tuft = new Uint8Array(n);
    this.animals = [];
    this.trough = 0;
    this.pickups = []; // { x, y, item, n, festival? }
    this.villagers = Vill.newVillagerState();
    this.vpos = {}; // runtime villager positions
    this.bin = {};
    this.requests = [];
    this.festivalsWon = {};
    this.collection = { crops: {}, fish: {}, critters: {}, goods: {} };
    this.stats = { tilled: 0, planted: 0, watered: 0, harvested: 0, shipped: 0, fed: 0, collected: 0, fishCaught: 0, crittersCaught: 0, crafted: 0, lovedGifts: 0, requests: 0, marketSales: 0, sprinklers: 0, decorPlaced: 0, daysPlayed: 0 };
    this.goalsDone = {};
    this.critters = [];
    this.events = [];
    this.player = { x: PLAYER_START[0] + 0.5, y: PLAYER_START[1] + 0.5, dir: 'down', moving: false, walk: 0, busy: 0, tool: null, fishing: null, path: null, then: null };
    this.tutorialSeen = false;
    this.lastSummary = null;
    this.talkCount = 0;
    this.newGame();
  }

  newGame() {
    const rand = rngFor(this.seed, 'farm');
    // A few stones and weeds in the field, and grass tufts to cut for hay.
    for (let i = 0; i < 40; i++) {
      const x = FIELD_A.x0 + Math.floor(rand() * (FIELD_A.x1 - FIELD_A.x0 + 1));
      const y = FIELD_A.y0 + Math.floor(rand() * (FIELD_A.y1 - FIELD_A.y0 + 1));
      const k = idx(x, y);
      if (this.obj[k] || (x < FIELD_A.x0 + 4 && y < FIELD_A.y0 + 3)) continue;
      if (rand() < 0.4) this.obj[k] = { type: rand() < 0.45 ? 'stone' : 'weed' };
    }
    this.growTufts(rand, 34);
    this.animals.push(Anim.makeAnimal('chicken', 0, rand), Anim.makeAnimal('chicken', 1, rand));
    this.startDay(true);
  }

  // ------------------------------------------------------------ queries

  get date() { return dateOf(this.day); }
  get season() { return this.date.season; }
  get festival() { return festivalOn(this.day); }
  get canInfo() { return CAN_LEVELS[this.canLevel]; }
  get selected() { return this.belt[this.sel]; }
  get tile() { return [Math.floor(this.player.x), Math.floor(this.player.y)]; }
  get facing() { const [dx, dy] = DIR[this.player.dir]; const [x, y] = this.tile; return [x + dx, y + dy]; }

  inGreenhouse(x, y) { return this.upgrades.greenhouse && inRect(GREENHOUSE.plots, x, y); }
  inField(x, y) { return inRect(this.upgrades.field ? FIELD_B : FIELD_A, x, y); }
  tillable(x, y) { return this.inField(x, y) || this.inGreenhouse(x, y); }

  solidAt(x, y) {
    if (!inBounds(x, y)) return true;
    const k = idx(x, y);
    if (this.map.solid[k]) {
      if (this.upgrades.greenhouse && x === GREENHOUSE.door[0] && y === GREENHOUSE.door[1]) return false;
      return true;
    }
    const o = this.obj[k];
    if (o && !(o.type === 'decor' && DECOR[o.id].floor)) return true;
    return false;
  }

  // Collision for a body centred at (x, y) in tile units.
  blocked(x, y, hw = HALF_W, hh = HALF_H) {
    const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw), y0 = Math.floor(y - hh), y1 = Math.floor(y + hh);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solidAt(tx, ty)) return true;
    return false;
  }

  villagerAt(x, y) {
    for (const id of VILLAGER_IDS) {
      const p = this.vpos[id];
      if (!p || p.hidden) continue;
      if (Math.abs(p.x - (x + 0.5)) < 0.75 && Math.abs(p.y - (y + 0.5)) < 0.85) return id;
    }
    return null;
  }

  animalAt(x, y) {
    let best = null, bd = 0.9;
    for (const a of this.animals) {
      const d = Math.hypot(a.x - (x + 0.5), a.y - (y + 0.5));
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  shopOpen() { return this.minute >= Eco.SHOP_OPEN && this.minute < Eco.SHOP_CLOSE; }
  marketOpen() { return this.date.day === MARKET_DAY && this.minute >= Eco.MARKET_OPEN && this.minute < Eco.MARKET_CLOSE && this.festival !== 'fair'; }
  festivalRunning() { return festivalRunning(this.festival, this.minute); }

  stockState() { return { season: this.season, upgrades: this.upgrades, canLevel: this.canLevel, animals: this.animals }; }

  // ------------------------------------------------------------ inventory

  add(id, n = 1) {
    const had = this.inv[id] || 0;
    this.inv[id] = had + n;
    const kind = ITEMS[id]?.kind;
    if (had === 0 && ['seed', 'sprinkler', 'decor', 'hay'].includes(kind) && id !== 'hay' && !this.belt.includes(id)) {
      const slot = this.belt.indexOf(null, TOOLS.length);
      if (slot >= 0) this.belt[slot] = id;
    }
  }

  take(id, n = 1) {
    if ((this.inv[id] || 0) < n) return false;
    this.inv[id] -= n;
    if (this.inv[id] <= 0) {
      delete this.inv[id];
      const slot = this.belt.indexOf(id);
      if (slot >= TOOLS.length) this.belt[slot] = null;
    }
    return true;
  }

  setBelt(slot, id) {
    if (slot < TOOLS.length || slot >= BELT_SIZE) return false;
    const old = this.belt.indexOf(id);
    if (old >= TOOLS.length) this.belt[old] = null;
    this.belt[slot] = id && this.inv[id] ? id : null;
    return true;
  }

  gain(amount, why = 'sale') {
    this.money += amount;
    if (why !== 'refund') this.earned += amount;
    this.events.push({ type: 'coins', amount });
  }

  toast(text, tone = 'info') { this.events.push({ type: 'toast', text, tone }); }

  // ------------------------------------------------------------ day cycle

  startDay(first = false) {
    this.minute = DAY_START;
    this.pickups = this.pickups.filter((pk) => !pk.festival);
    this.setupDay();
    const p = this.player;
    p.x = PLAYER_START[0] + 0.5; p.y = PLAYER_START[1] + 0.5; p.dir = 'down';
    // Rain and snow water every outdoor crop; sprinklers water their ring.
    const wetDay = isWet(this.weather);
    for (let i = 0; i < W * H; i++) {
      const x = i % W, y = (i - x) / W;
      if (!this.soil[i]) continue;
      this.wet[i] = this.inGreenhouse(x, y) || wetDay ? 1 : 0;
    }
    for (let i = 0; i < W * H; i++) {
      if (this.obj[i]?.type !== 'sprinkler') continue;
      const x = i % W, y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && inBounds(x + dx, y + dy) && this.soil[idx(x + dx, y + dy)]) this.wet[idx(x + dx, y + dy)] = 1;
      }
    }
    if (this.date.day === 1 || first) this.requests = Eco.makeRequests(this.seed, this.day, this.season, this.animals);
    if (!first) this.events.push({ type: 'morning', day: this.day });
  }

  // Weather, villagers, critters and festival for the current day and time.
  // Used every morning and when a saved game resumes mid-day.
  setupDay(fest = null) {
    const id = this.festival;
    this.weather = weatherFor(this.seed, this.day, !!id);
    this.tomorrow = weatherFor(this.seed, this.day + 1, !!festivalOn(this.day + 1));
    this.rand = mulberry32(hash(this.seed, this.day, Math.floor(this.minute), 'live'));
    this.fest = newFestivalState(id);
    if (this.fest && fest) {
      for (const k of ['progress', 'done', 'eggs', 'fish', 'started', 'ended', 'result']) if (fest[k] !== undefined) this.fest[k] = fest[k];
      if (Array.isArray(fest.lit)) this.fest.lit = fest.lit.filter((i) => Number.isInteger(i) && i >= 0 && i < 8);
      if (this.fest.started && !this.fest.ended && id === 'egghunt') this.spawnEggs(this.fest.eggs);
    }
    this.period = null;
    this.critters = [];
    this.warnedLate = this.minute >= 24 * 60;
    const p = this.player;
    p.busy = 0; p.fishing = null; p.path = null; p.then = null; p.tool = null;
    this.placeVillagers();
    this.updatePeriod();
  }

  spawnEggs(found = 0) {
    const spots = eggSpots(this.seed, this.day, (x, y) => !this.solidAt(x, y) && !this.map.water[idx(x, y)] && this.map.ground[idx(x, y)] !== G.SAND, FESTIVALS.egghunt.total);
    spots.forEach(([x, y], i) => { if (i >= found) this.pickups.push({ x, y, item: 'egghunt', n: 1, festival: true, color: i % 5 }); });
  }

  // End the day: ship, grow, feed, roll the calendar and start tomorrow.
  // Returns a summary for the bedtime card.
  sleep(passedOut = false) {
    const season = this.season;
    const shipped = [];
    let income = 0;
    for (const [id, n] of Object.entries(this.bin)) {
      const g = Eco.sellPrice(id) * n;
      shipped.push({ id, n, gold: g });
      income += g;
    }
    this.bin = {};
    if (income) { this.money += income; this.earned += income; }
    // Crops grow overnight.
    for (let i = 0; i < W * H; i++) {
      const c = this.crop[i];
      if (!c) continue;
      const x = i % W, y = (i - x) / W;
      Crops.growNight(c, !!this.wet[i], this.inGreenhouse(x, y));
    }
    this.trough = Anim.feedNight(this.animals, this.trough);
    this.day++;
    this.stats.daysPlayed++;
    const newSeason = this.season !== season;
    let withered = 0;
    for (let i = 0; i < W * H; i++) {
      const c = this.crop[i];
      if (!c || c.dead) continue;
      const x = i % W, y = (i - x) / W;
      Crops.checkSeason(c, this.season, this.inGreenhouse(x, y));
      if (c.dead) withered++;
    }
    // Animals make produce, grass grows back, villagers reset.
    const prand = rngFor(this.seed, this.day, 'produce');
    const made = Anim.morningProduce(this.animals, prand);
    for (const m of made) this.dropNear(m.animal.x, m.animal.y, m.item, m.n, prand);
    if (this.season !== 'winter') this.growTufts(prand, 5);
    Vill.newDay(this.villagers);
    if (this.canInfo) this.water = this.canInfo.capacity;
    // Festival leftovers vanish overnight.
    this.pickups = this.pickups.filter((pk) => !pk.festival);
    this.startDay();
    this.checkGoals();
    const summary = {
      passedOut, shipped, income, day: this.day, date: this.date, weather: this.weather, newSeason, withered,
      produce: made.reduce((s, m) => s + m.n, 0), festival: this.festival, money: this.money,
    };
    this.lastSummary = summary;
    return summary;
  }

  growTufts(rand, n) {
    let have = 0;
    for (let i = 0; i < W * H; i++) have += this.tuft[i];
    for (let t = 0; t < n * 6 && have < MAX_TUFTS && n > 0; t++) {
      const x = FARM.x0 + Math.floor(rand() * (FARM.x1 - FARM.x0));
      const y = FARM.y0 + Math.floor(rand() * (FARM.y1 - FARM.y0));
      const k = idx(x, y);
      const g = this.map.ground[k];
      if ((g !== G.GRASS && g !== G.FLOWERS) || this.map.solid[k] || this.obj[k] || this.soil[k] || this.tuft[k] || this.inField(x, y)) continue;
      if (inRect(PEN, x, y) || inRect(GREENHOUSE, x, y)) continue;
      if (Math.abs(x - PLAYER_START[0]) + Math.abs(y - PLAYER_START[1]) < 3) continue;
      this.tuft[k] = 1;
      have++;
      n--;
    }
  }

  dropNear(x, y, item, n, rand) {
    for (let t = 0; t < 20; t++) {
      const px = Math.floor(x) + Math.floor(rand() * 3) - 1, py = Math.floor(y) + Math.floor(rand() * 3) - 1;
      if (!inRect(PEN_ROAM, px, py) || this.solidAt(px, py)) continue;
      if (this.pickups.some((p) => p.x === px && p.y === py)) continue;
      this.pickups.push({ x: px, y: py, item, n });
      return;
    }
    this.pickups.push({ x: Math.floor(x), y: Math.floor(y), item, n });
  }

  // ------------------------------------------------------------ villagers

  placeVillagers() {
    const fest = this.festival;
    VILLAGER_IDS.forEach((id, slot) => {
      const spot = Vill.scheduleSpot(id, this.minute, this.weather, fest);
      const [x, y] = spotFor(spot, slot);
      this.vpos[id] = { x: x + 0.5, y: y + 0.5, spot, path: null, hidden: Vill.isHome(spot), dir: 'down', walk: 0 };
    });
  }

  villagerPassable = (x, y) => inBounds(x, y) && !this.map.solid[idx(x, y)];

  updateVillagers(dt) {
    const fest = this.festival;
    VILLAGER_IDS.forEach((id, slot) => {
      const v = this.vpos[id];
      const spot = Vill.scheduleSpot(id, this.minute, this.weather, fest);
      if (spot !== v.spot) {
        v.spot = spot;
        if (v.hidden) {
          // Step out of the front door.
          const b = homeOf(id);
          v.x = b.door[0] + 0.5; v.y = b.door[1] + 1.5; v.hidden = false;
        }
        const [tx, ty] = spotFor(spot, slot);
        v.path = findPath(this.villagerPassable, [Math.floor(v.x), Math.floor(v.y)], (x, y) => x === tx && y === ty) || [];
      }
      if (v.path && v.path.length) {
        const [nx, ny] = v.path[0];
        const dx = nx + 0.5 - v.x, dy = ny + 0.5 - v.y;
        const d = Math.hypot(dx, dy);
        const step = VILLAGER_SPEED * dt;
        if (d <= step) { v.x = nx + 0.5; v.y = ny + 0.5; v.path.shift(); }
        else { v.x += (dx / d) * step; v.y += (dy / d) * step; }
        v.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        v.walk += dt;
        v.moving = true;
        if (!v.path.length && Vill.isHome(v.spot)) v.hidden = true;
      } else {
        v.moving = false;
        if (Vill.isHome(v.spot)) v.hidden = true;
      }
    });
  }

  talkTo(id) {
    this.talkCount++;
    const res = Vill.talk(this.villagers, id, { dayIndex: this.day, season: this.season, weather: this.weather, festival: this.festivalRunning() ? this.festival : null, minute: this.minute, talkCount: this.talkCount });
    const p = this.vpos[id];
    if (p) p.dir = this.player.x < p.x - 0.3 ? 'left' : this.player.x > p.x + 0.3 ? 'right' : this.player.y < p.y ? 'up' : 'down';
    this.checkGoals();
    return { ...res, id, hearts: Vill.heartsOf(this.villagers[id].points), canGift: !this.villagers[id].gifted };
  }

  gift(id, item) {
    if (!giftable(item) || !this.inv[item]) return null;
    const res = Vill.giveGift(this.villagers, id, item, this.day);
    if (!res) return null;
    this.take(item);
    if (res.reaction === 'love') this.stats.lovedGifts++;
    this.events.push({ type: 'gift', id, reaction: res.reaction });
    this.checkGoals();
    return { ...res, hearts: Vill.heartsOf(this.villagers[id].points) };
  }

  // ------------------------------------------------------------ menus

  ship(id, n = 1) {
    if (!sellable(id) || !this.take(id, n)) return false;
    this.bin[id] = (this.bin[id] || 0) + n;
    this.stats.shipped += n;
    this.events.push({ type: 'ship', id, n });
    this.checkGoals();
    return true;
  }

  unship(id, n = 1) {
    if ((this.bin[id] || 0) < n) return false;
    this.bin[id] -= n;
    if (!this.bin[id]) delete this.bin[id];
    this.add(id, n);
    this.stats.shipped -= n;
    return true;
  }

  binValue() { return Object.entries(this.bin).reduce((s, [id, n]) => s + Eco.sellPrice(id) * n, 0); }

  sellAtMarket(id, n = 1) {
    if (!this.marketOpen() || !sellable(id) || !this.take(id, n)) return false;
    this.gain(Eco.marketPrice(id) * n);
    this.stats.marketSales += n;
    this.checkGoals();
    return true;
  }

  buy(id, n = 1) {
    const entry = Eco.shopStock(this.stockState()).find((e) => e.id === id);
    if (!entry || !this.shopOpen()) return false;
    if (entry.kind === 'upgrade' || entry.kind === 'animal') n = 1;
    const cost = entry.cost * n;
    if (this.money < cost) return false;
    this.money -= cost;
    if (entry.kind === 'upgrade') this.applyUpgrade(id);
    else if (entry.kind === 'animal') {
      const count = this.animals.filter((a) => a.type === id).length;
      this.animals.push(Anim.makeAnimal(id, count, this.rand));
      this.toast(`${ANIMALS[id].name} delivered to your pen!`);
      this.events.push({ type: 'animal', animal: id });
    } else this.add(id, n);
    this.events.push({ type: 'buy', id, n, cost });
    this.checkGoals();
    return true;
  }

  applyUpgrade(id) {
    if (id === 'can1') this.canLevel = Math.max(this.canLevel, 1);
    else if (id === 'can2') this.canLevel = Math.max(this.canLevel, 2);
    else if (id === 'field') {
      this.upgrades.field = true;
      for (let y = FIELD_B.y0; y <= FIELD_B.y1; y++) for (let x = FIELD_B.x0; x <= FIELD_B.x1; x++) this.tuft[idx(x, y)] = 0;
    } else if (id === 'greenhouse') {
      this.upgrades.greenhouse = true;
      const p = GREENHOUSE.plots;
      for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) { this.soil[idx(x, y)] = 1; this.wet[idx(x, y)] = 1; }
    }
    this.water = this.canInfo.capacity;
    this.events.push({ type: 'upgrade', id });
    this.toast(`${UPGRADES[id].name} is ready!`, 'good');
  }

  craft(recipeId) {
    if (!Eco.canCraft(this.inv, recipeId)) return false;
    for (const [id, n] of Object.entries(RECIPES[recipeId].needs)) this.take(id, n);
    this.add(recipeId);
    this.stats.crafted++;
    this.record('goods', recipeId);
    this.events.push({ type: 'craft', id: recipeId });
    this.checkGoals();
    return true;
  }

  deliver(i) {
    const r = this.requests[i];
    if (!r || r.done || (this.inv[r.item] || 0) < r.n) return false;
    this.take(r.item, r.n);
    r.done = true;
    this.gain(r.reward);
    const s = this.villagers[r.villager];
    s.points = Math.min(1000, s.points + 60);
    this.stats.requests++;
    this.events.push({ type: 'request', i });
    this.checkGoals();
    return true;
  }

  fillTrough() {
    const room = Anim.TROUGH_CAPACITY - this.trough;
    const n = Math.min(room, this.inv.hay || 0);
    if (n <= 0) {
      this.toast(room <= 0 ? 'The trough is full.' : 'No hay! Cut grass with the scythe or buy hay at the store.');
      return 0;
    }
    this.take('hay', n);
    this.trough += n;
    this.stats.fed++;
    this.toast(`Added ${n} hay to the trough (${this.trough}/${Anim.TROUGH_CAPACITY}).`);
    this.events.push({ type: 'trough', n });
    this.checkGoals();
    return n;
  }

  submitFair(items) {
    if (this.festival !== 'fair' || !this.festivalRunning() || this.fest.done) return null;
    if (!items.length || items.length > 3) return null;
    const counts = {};
    for (const id of items) counts[id] = (counts[id] || 0) + 1;
    if (Object.entries(counts).some(([id, n]) => (this.inv[id] || 0) < n || !sellable(id))) return null;
    const score = Eco.fairScore(items);
    const prize = Eco.fairRibbon(score);
    this.fest.done = true;
    this.fest.result = { score, ...prize };
    this.winFestival('fair', prize.gold);
    return this.fest.result;
  }

  winFestival(id, gold) {
    if (this.fest) this.fest.done = true;
    const first = !this.festivalsWon[id];
    this.festivalsWon[id] = true;
    if (gold) this.gain(gold, 'prize');
    const decor = FESTIVALS[id].prize.decor;
    if (first && decor) this.add(decor);
    this.events.push({ type: 'festivalWon', id, gold, decor: first ? decor : null });
    this.checkGoals();
  }

  // ------------------------------------------------------------ goals

  statValue(stat) {
    switch (stat) {
      case 'canLevel': return this.canLevel;
      case 'earned': return this.earned;
      case 'bigAnimals': return this.animals.filter((a) => a.type !== 'chicken').length;
      case 'bestHearts': return Vill.bestHearts(this.villagers);
      case 'fieldBig': return this.upgrades.field ? 1 : 0;
      case 'greenhouse': return this.upgrades.greenhouse ? 1 : 0;
      case 'festivalsWon': return Object.keys(this.festivalsWon).length;
      case 'cropKinds': return Object.keys(this.collection.crops).length;
      case 'fishKinds': return Object.keys(this.collection.fish).length;
      case 'critterKinds': return Object.keys(this.collection.critters).length;
      case 'met': return VILLAGER_IDS.filter((v) => this.villagers[v].met).length;
      default: return this.stats[stat] || 0;
    }
  }

  checkGoals() {
    for (const g of GOALS) {
      if (this.goalsDone[g.id] || this.statValue(g.stat) < g.n) continue;
      this.goalsDone[g.id] = true;
      if (g.reward) { this.money += g.reward; }
      this.events.push({ type: 'goal', id: g.id, text: g.text, reward: g.reward });
    }
  }

  // The next three unfinished goals, for the journal and HUD hint.
  activeGoals(n = 3) {
    return GOALS.filter((g) => !this.goalsDone[g.id]).slice(0, n).map((g) => ({ ...g, have: Math.min(g.n, this.statValue(g.stat)) }));
  }

  record(book, id) {
    const first = !this.collection[book][id];
    this.collection[book][id] = (this.collection[book][id] || 0) + 1;
    if (first) this.events.push({ type: 'collect', book, id });
    return first;
  }

  collectionSize() {
    return { crops: [Object.keys(this.collection.crops).length, CROP_IDS.length], fish: [Object.keys(this.collection.fish).length, FISH_IDS.length],
      critters: [Object.keys(this.collection.critters).length, CRITTER_IDS.length], goods: [Object.keys(this.collection.goods).length, Object.keys(GOODS).length] };
  }

  // ------------------------------------------------------------ step

  // controls: { mx, my, use, interact, slot, cycle, target: [x, y] | null }
  step(dt, c = {}) {
    const p = this.player;
    this.minute += minutesFor(dt, this.speed);
    if (this.minute >= 24 * 60 && !this.warnedLate) { this.warnedLate = true; this.toast('It\'s midnight. Time to head to bed soon!', 'warn'); }
    if (this.minute >= DAY_END) {
      this.events.push({ type: 'passout' });
      return;
    }
    this.updatePeriod();
    this.updateFestival();

    if (c.slot != null && c.slot >= 0 && c.slot < BELT_SIZE) this.sel = c.slot;
    if (c.cycle) this.sel = (this.sel + c.cycle + BELT_SIZE) % BELT_SIZE;

    if (p.busy > 0) p.busy = Math.max(0, p.busy - dt);
    if (p.busy === 0) p.tool = null;
    const mx = c.mx || 0, my = c.my || 0;
    const wantsMove = Math.abs(mx) > 0.15 || Math.abs(my) > 0.15;
    if (wantsMove) { p.path = null; p.then = null; }
    if (p.fishing) this.updateFishing(dt, c, wantsMove);
    else if (c.target && p.busy === 0) this.useAt(c.target[0], c.target[1], { tools: true });
    else if (c.interactAt && p.busy === 0) this.useAt(c.interactAt[0], c.interactAt[1], { tools: false });
    else if ((c.use || c.interact) && p.busy === 0) {
      const [fx, fy] = this.facing;
      this.useAt(fx, fy, { tools: !!c.use, adjacentOnly: true });
    }

    p.moving = false;
    if (!p.fishing && p.busy === 0) {
      let vx = mx, vy = my;
      if (!wantsMove && p.path) [vx, vy] = this.followPath();
      const len = Math.hypot(vx, vy);
      if (len > 0.15) {
        if (len > 1) { vx /= len; vy /= len; }
        this.move(vx * PLAYER_SPEED * dt, vy * PLAYER_SPEED * dt);
        if (Math.abs(vx) > Math.abs(vy) * 1.1) p.dir = vx > 0 ? 'right' : 'left';
        else if (Math.abs(vy) > 0.05) p.dir = vy > 0 ? 'down' : 'up';
        p.moving = true;
        p.walk += dt * Math.min(1, len);
      }
    }

    this.collectPickups();
    this.updateVillagers(dt);
    for (const a of this.animals) Anim.wander(a, dt, this.rand, (x, y) => this.blocked(x, y, 0.3, 0.2) || !inRect(PEN_ROAM, Math.floor(x), Math.floor(y)));
    this.updateCritters(dt);
  }

  move(dx, dy) {
    const p = this.player;
    if (dx) {
      if (!this.blocked(p.x + dx, p.y)) p.x += dx;
      else if (!dy) this.nudge('y', dx);
    }
    if (dy) {
      if (!this.blocked(p.x, p.y + dy)) p.y += dy;
      else if (!dx) this.nudge('x', dy);
    }
  }

  // Pushing straight into a corner slides the farmer around it.
  nudge(axis, d) {
    const p = this.player;
    const amt = Math.abs(d);
    for (const off of [0.25, 0.45]) {
      for (const s of [1, -1]) {
        const ox = axis === 'x' ? s * off : d, oy = axis === 'y' ? s * off : d;
        if (this.blocked(p.x + ox, p.y + oy)) continue;
        const nx = axis === 'x' ? p.x + s * amt : p.x, ny = axis === 'y' ? p.y + s * amt : p.y;
        if (!this.blocked(nx, ny)) { p.x = nx; p.y = ny; }
        return;
      }
    }
  }

  // Click-to-walk: move along the planned path, then act on arrival.
  followPath() {
    const p = this.player;
    if (!p.path.length) {
      p.path = null;
      if (p.then) { const [tx, ty] = p.then; p.then = null; this.faceTile(tx, ty); this.useAt(tx, ty, { tools: p.thenTools !== false, adjacentOnly: true }); }
      return [0, 0];
    }
    const [nx, ny] = p.path[0];
    const dx = nx + 0.5 - p.x, dy = ny + 0.5 - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.12) { p.path.shift(); return this.followPath(); }
    return [dx / d, dy / d];
  }

  passable = (x, y) => !this.solidAt(x, y);

  // Plan a walk to stand next to (tx, ty) and then use it.
  walkTo(tx, ty, tools = true) {
    const p = this.player;
    p.thenTools = tools;
    const target = this.solidAt(tx, ty) || this.map.water[idx(tx, ty)];
    const goal = target
      ? (x, y) => !this.solidAt(x, y) && Math.abs(x - tx) + Math.abs(y - ty) === 1
      : (x, y) => !this.solidAt(x, y) && Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1 && !(x === tx && y === ty);
    const path = findPath(this.passable, this.tile, goal, 1800);
    if (!path) { this.toast('Can\'t get there from here.'); return false; }
    p.path = path;
    p.then = [tx, ty];
    return true;
  }

  walkOnto(tx, ty) {
    const path = findPath(this.passable, this.tile, (x, y) => x === tx && y === ty, 1800);
    if (path) { this.player.path = path; this.player.then = null; }
    return !!path;
  }

  faceTile(tx, ty) {
    const p = this.player;
    const [x, y] = this.tile;
    const dx = tx - x, dy = ty - y;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) p.dir = dx > 0 ? 'right' : 'left';
    else if (dy !== 0) p.dir = dy > 0 ? 'down' : 'up';
  }

  // Use the selected belt slot (or interact) on a tile.
  useAt(tx, ty, { tools = true, adjacentOnly = false } = {}) {
    if (!inBounds(tx, ty)) return;
    const [x, y] = this.tile;
    const near = Math.abs(tx - x) <= 1 && Math.abs(ty - y) <= 1;
    const pickup = this.pickups.some((pk) => pk.x === tx && pk.y === ty) && !this.solidAt(tx, ty);
    if (pickup && !adjacentOnly) { this.walkOnto(tx, ty); return; }
    if (!near) { if (!adjacentOnly) this.walkTo(tx, ty, tools); return; }
    if (tx !== x || ty !== y) this.faceTile(tx, ty);
    const k = idx(tx, ty);
    const p = this.player;

    const vid = this.villagerAt(tx, ty);
    if (vid) { this.events.push({ type: 'menu', menu: 'dialogue', data: this.talkTo(vid) }); return; }
    const animal = this.animalAt(tx, ty);
    if (animal && this.selected !== 'net') {
      const petted = Anim.pet(animal);
      this.events.push({ type: 'pet', animal: animal.type, x: animal.x, y: animal.y, happy: petted });
      if (petted) this.toast(`${animal.name} the ${ANIMALS[animal.type].name.toLowerCase()} loves you! ${'♥'.repeat(Math.max(1, Anim.animalHearts(animal)))}`);
      else this.toast(`${animal.name} is happy. ${animal.ate ? '' : (this.trough ? 'There\'s hay in the trough.' : 'Fill the trough with hay so they can eat tonight.')}`);
      p.busy = 0.2;
      return;
    }
    const it = this.map.interact.get(k);
    if (it) { this.interact(it, tx, ty); p.busy = 0.15; return; }
    const crop = this.crop[k];
    if (crop && Crops.isRipe(crop) && !this.critterNear(tx, ty, 0.7)) { this.harvestAt(tx, ty); return; }
    const o = this.obj[k];
    if (o?.type === 'decor' || o?.type === 'sprinkler') {
      if (!tools || this.selected === 'hoe') this.pickUp(tx, ty);
      else this.toast(`Use the hoe on the ${o.type === 'decor' ? DECOR[o.id].name : 'sprinkler'} to pick it up.`);
      p.busy = 0.15;
      return;
    }
    if (!tools) {
      if (crop && !crop.dead) this.toast(`${CROPS[crop.id].name}: ${Crops.daysLeft(crop)} more day${Crops.daysLeft(crop) === 1 ? '' : 's'}${this.wet[k] ? '' : ' (needs water today)'}`);
      return;
    }
    this.useTool(this.selected, tx, ty);
  }

  interact(it, tx, ty) {
    const kind = it.kind;
    if (kind === 'door') {
      const b = it.building;
      if (b === 'house') return this.events.push({ type: 'menu', menu: 'home' });
      if (b === 'shop') return this.toast('The store counter is out front.');
      if (b === 'coop' || b === 'barn') return this.toast(`Your ${b}. The animals sleep in here and spend the day in the pen.`);
      if (b === 'bakery') return this.toast(this.minute < 18 * 60 ? 'Mmm, fresh bread smell. Clem is baking!' : 'The bakery is closed for the night.');
      if (b === 'workshop') return this.toast('Bram\'s workshop. Sawdust everywhere!');
      if (b.startsWith('home:')) { const id = b.slice(5); return this.toast(this.vpos[id]?.hidden ? `Knock knock! ${VILLAGERS[id].name} is home.` : `${VILLAGERS[id].name}'s house. Nobody's home.`); }
    }
    if (kind === 'bin') return this.events.push({ type: 'menu', menu: 'bin' });
    if (kind === 'well') return this.refill();
    if (kind === 'trough') return this.fillTrough();
    if (kind === 'shop') {
      if (!this.shopOpen()) return this.toast(this.minute < Eco.SHOP_OPEN ? 'The store opens at 8 am.' : 'The store is closed. It opens at 8 am.');
      return this.events.push({ type: 'menu', menu: 'shop' });
    }
    if (kind === 'board') return this.events.push({ type: 'menu', menu: 'board' });
    if (kind === 'stall') {
      if (this.festival === 'fair' && this.festivalRunning()) return this.events.push({ type: 'menu', menu: 'fair' });
      if (this.marketOpen()) return this.events.push({ type: 'menu', menu: 'market' });
      return this.toast(this.date.day === MARKET_DAY ? 'The market runs from 8 am to 5 pm.' : 'The market stall opens on Saturdays.');
    }
    if (kind === 'lantern') return this.lightLantern(it.i);
    if (kind === 'fountain') return this.toast(['You toss a wish into the fountain. Plink!', 'The fountain sparkles. Somewhere, a frog says hello.', 'Fresh water burbles up. Lovely.'][this.day % 3]);
    if (kind === 'planter') return this.toast('A flower bed. Clem waters it every morning.');
    if (kind === 'lamp') return undefined;
    if (kind === 'greenhouse') return this.toast(this.upgrades.greenhouse ? 'Your greenhouse!' : 'An old broken greenhouse. Mabel can arrange repairs (4,000g).');
    return undefined;
  }

  refill() {
    this.water = this.canInfo.capacity;
    this.events.push({ type: 'refill' });
    this.toast(`Watering can full (${this.water}).`);
  }

  useTool(tool, tx, ty) {
    const p = this.player;
    const k = idx(tx, ty);
    const crop = this.crop[k];
    const o = this.obj[k];
    p.busy = TOOL_TIME;
    p.tool = tool;
    const water = this.map.water[k];
    if (tool === 'hoe') {
      if (o?.type === 'stone') { this.obj[k] = null; this.events.push({ type: 'break', x: tx, y: ty }); return; }
      if (o?.type === 'weed') { this.obj[k] = null; this.events.push({ type: 'cut', x: tx, y: ty }); return; }
      if (crop?.dead) { this.crop[k] = null; this.events.push({ type: 'cut', x: tx, y: ty }); return; }
      if (crop) { this.toast(`${CROPS[crop.id].name} is growing: ${Crops.daysLeft(crop)} more day${Crops.daysLeft(crop) === 1 ? '' : 's'}.`); return; }
      if (this.soil[k]) return;
      if (!this.tillable(tx, ty) || this.solidAt(tx, ty)) { this.events.push({ type: 'thud', x: tx, y: ty }); if (!this.tillable(tx, ty)) this.toastOnce('till', 'You can only dig in your field. Expand it at the store!'); return; }
      this.soil[k] = 1;
      this.tuft[k] = 0;
      if (this.inGreenhouse(tx, ty) || isWet(this.weather)) this.wet[k] = 1;
      this.stats.tilled++;
      this.events.push({ type: 'till', x: tx, y: ty });
      this.checkGoals();
      return;
    }
    if (tool === 'can') {
      if (water) return this.refill();
      if (this.water <= 0) { this.toast('Your can is empty! Refill it at the well or the pond.', 'warn'); return; }
      const tiles = this.canTiles(tx, ty).filter(([x, y]) => this.soil[idx(x, y)]);
      if (!tiles.length) { this.events.push({ type: 'splash', tiles: [[tx, ty]], dry: true }); return; }
      for (const [x, y] of tiles) {
        const i = idx(x, y);
        if (!this.wet[i] && this.crop[i]) this.stats.watered++;
        this.wet[i] = 1;
      }
      this.water--;
      this.events.push({ type: 'splash', tiles });
      this.checkGoals();
      return;
    }
    if (tool === 'scythe') {
      if (this.tuft[k]) { this.tuft[k] = 0; this.add('hay'); this.events.push({ type: 'cut', x: tx, y: ty, hay: true }); return; }
      if (o?.type === 'weed') { this.obj[k] = null; this.events.push({ type: 'cut', x: tx, y: ty }); return; }
      if (crop?.dead) { this.crop[k] = null; this.events.push({ type: 'cut', x: tx, y: ty }); return; }
      this.events.push({ type: 'swish', x: tx, y: ty });
      return;
    }
    if (tool === 'rod') {
      if (!water) { p.busy = 0; this.toastOnce('rod', 'Face the water to cast your line.'); return; }
      p.busy = 0;
      p.fishing = { state: 'cast', t: 0, bite: 1.6 + this.rand() * 3, tx, ty, where: water };
      this.events.push({ type: 'cast', x: tx, y: ty });
      if (!this.stats.fishCaught) this.toastOnce('reel', 'Wait for the ! over your head, then use the rod again to reel it in.');
      return;
    }
    if (tool === 'net') {
      const cr = this.critterNear(tx, ty, 1.05);
      this.events.push({ type: 'net', x: tx, y: ty });
      if (cr) this.catchCritter(cr);
      return;
    }
    // Items on the belt.
    p.busy = 0.18;
    p.tool = null;
    const item = ITEMS[tool];
    if (!tool || !item) { p.busy = 0; return; }
    if (item.kind === 'seed') return this.plantAt(tool, tx, ty);
    if (item.kind === 'sprinkler') return this.placeObj(tx, ty, { type: 'sprinkler' }, tool);
    if (item.kind === 'decor') return this.placeObj(tx, ty, { type: 'decor', id: tool }, tool);
    if (item.kind === 'hay') return this.toast('Put hay in the trough in the animal pen.');
    return undefined;
  }

  toastOnce(key, text) {
    this.hinted = this.hinted || {};
    if (this.hinted[key]) return;
    this.hinted[key] = true;
    this.toast(text);
  }

  canTiles(tx, ty) {
    const area = this.canInfo.area;
    if (area === 'single') return [[tx, ty]];
    if (area === 'line') {
      const [dx, dy] = DIR[this.player.dir];
      return [0, 1, 2].map((s) => [tx + dx * s, ty + dy * s]).filter(([x, y]) => inBounds(x, y));
    }
    const out = [];
    const [dx, dy] = DIR[this.player.dir];
    const cx = tx + dx, cy = ty + dy;
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (inBounds(cx + x, cy + y)) out.push([cx + x, cy + y]);
    return out;
  }

  plantAt(seedId, tx, ty) {
    const k = idx(tx, ty);
    const cropId = ITEMS[seedId].crop;
    if (!this.soil[k]) { this.toastOnce('soil', 'Till the soil with the hoe first, then plant.'); return; }
    if (this.crop[k]) return;
    const gh = this.inGreenhouse(tx, ty);
    if (!Crops.canPlant(cropId, this.season, gh)) {
      const seasons = CROPS[cropId].seasons.map((s) => s[0].toUpperCase() + s.slice(1)).join(' and ');
      this.toast(`${CROPS[cropId].name} only grows in ${seasons} (or the greenhouse).`, 'warn');
      return;
    }
    if (!this.take(seedId)) return;
    this.crop[k] = Crops.plant(cropId);
    this.stats.planted++;
    this.events.push({ type: 'plant', x: tx, y: ty });
    this.checkGoals();
  }

  harvestAt(tx, ty) {
    const k = idx(tx, ty);
    const res = Crops.harvest(this.crop[k]);
    if (!res) return;
    if (!res.keep) this.crop[k] = null;
    this.add(res.item, res.n);
    this.stats.harvested += res.n;
    this.record('crops', res.item);
    this.player.busy = 0.18;
    this.events.push({ type: 'harvest', x: tx, y: ty, item: res.item, n: res.n });
    this.checkGoals();
  }

  placeObj(tx, ty, obj, itemId) {
    const k = idx(tx, ty);
    const g = this.map.ground[k];
    const floor = obj.type === 'decor' && DECOR[obj.id].floor;
    const ok = inRect(FARM, tx, ty) && !this.map.solid[k] && !this.obj[k] && !this.crop[k] && !this.map.water[k]
      && (obj.type === 'sprinkler' ? this.inField(tx, ty) : !this.soil[k] && (floor || (g !== G.PATH && !this.nextToDoor(tx, ty))))
      && !(this.tile[0] === tx && this.tile[1] === ty && !floor) && !this.inGreenhouse(tx, ty);
    if (!ok) { this.toast(obj.type === 'sprinkler' ? 'Sprinklers go on empty tiles in your field.' : 'You can\'t place that there.'); return; }
    if (!this.take(itemId)) return;
    this.obj[k] = obj;
    this.soil[k] = 0; this.wet[k] = 0; this.tuft[k] = 0;
    if (obj.type === 'sprinkler') this.stats.sprinklers++;
    else this.stats.decorPlaced++;
    this.events.push({ type: 'place', x: tx, y: ty, obj });
    this.checkGoals();
  }

  nextToDoor(x, y) {
    for (const [dx, dy] of [[0, -1], [0, 0]]) {
      const it = this.map.interact.get(idx(x + dx, y + dy));
      if (it) return true;
    }
    for (const [dx, dy] of DIRS4) if (this.map.interact.get(idx(x + dx, y + dy))) return true;
    return false;
  }

  pickUp(tx, ty) {
    const k = idx(tx, ty);
    const o = this.obj[k];
    if (!o) return;
    this.obj[k] = null;
    this.add(o.type === 'sprinkler' ? 'sprinkler' : o.id);
    this.events.push({ type: 'pickupObj', x: tx, y: ty });
  }

  collectPickups() {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (Math.abs(pk.x + 0.5 - p.x) < 0.6 && Math.abs(pk.y + 0.5 - p.y) < 0.6) {
        this.pickups.splice(i, 1);
        if (pk.festival) {
          this.fest.eggs++;
          this.events.push({ type: 'egg', x: pk.x, y: pk.y, n: this.fest.eggs });
          const f = FESTIVALS.egghunt;
          if (!this.fest.done && this.fest.eggs >= f.goal) this.winFestival('egghunt', f.prize.gold);
          else if (this.fest.eggs === f.total) { this.gain(200, 'prize'); this.toast('You found every egg! +200g', 'good'); }
          else this.toast(`Festival egg ${this.fest.eggs}/${f.total}!`);
          continue;
        }
        this.add(pk.item, pk.n);
        if (ITEMS[pk.item].kind === 'produce') this.stats.collected += pk.n;
        this.events.push({ type: 'pickup', x: pk.x, y: pk.y, item: pk.item, n: pk.n });
        this.checkGoals();
      }
    }
  }

  // ------------------------------------------------------------ fishing

  updateFishing(dt, c, moved) {
    const p = this.player;
    const f = p.fishing;
    f.t += dt;
    const pull = c.use || c.interact || c.target;
    if (moved) { p.fishing = null; this.events.push({ type: 'reel', got: false }); return; }
    if (f.state === 'cast') {
      if (pull && f.t > 0.3) { p.fishing = null; this.events.push({ type: 'reel', got: false }); this.toast('Too soon! Wait for the splash.'); return; }
      if (f.t >= f.bite) { f.state = 'bite'; f.t = 0; this.events.push({ type: 'bite', x: f.tx, y: f.ty }); }
    } else if (f.state === 'bite') {
      if (pull) { p.fishing = null; this.catchFish(f.where); p.busy = 0.4; return; }
      if (f.t > 1.1) { p.fishing = null; this.events.push({ type: 'reel', got: false }); this.toast('It got away! Try again.'); }
    }
  }

  fishPool(where) {
    const night = this.minute >= 19 * 60;
    const rain = isWet(this.weather);
    return Object.entries(FISH).filter(([, f]) => f.where.includes(where) && f.seasons.includes(this.season)
      && (!f.night || night) && (!f.day || !night) && (!f.rain || rain)).map(([id, f]) => [id, f.weight * (f.rain && rain ? 2 : 1)]);
  }

  catchFish(where) {
    const id = weightedPick(this.rand, this.fishPool(where));
    this.add(id);
    this.stats.fishCaught++;
    const first = this.record('fish', id);
    this.events.push({ type: 'catch', id, first });
    this.toast(`You caught a ${FISH[id].name}!${first ? ' New in your collection!' : ''}`, 'good');
    if (this.festival === 'snow' && this.festivalRunning() && where === 'town' && !this.fest.done) {
      this.fest.fish++;
      if (this.fest.fish >= FESTIVALS.snow.goal) this.winFestival('snow', FESTIVALS.snow.prize.gold);
      else this.toast(`Ice fishing: ${this.fest.fish}/${FESTIVALS.snow.goal} fish!`);
    }
    this.checkGoals();
  }

  // ------------------------------------------------------------ critters

  updatePeriod() {
    const period = periodOf(this.minute);
    if (period === this.period) return;
    this.period = period;
    this.spawnCritters();
  }

  spawnCritters() {
    const night = this.period === 'night' || this.period === 'evening';
    const rain = isWet(this.weather);
    const pool = Object.entries(CRITTERS).filter(([, c]) => c.seasons.includes(this.season) && (!c.day || !night) && (!c.night || night) && (!c.rain || rain)).map(([id]) => id);
    this.critters = [];
    if (!pool.length) return;
    const rand = rngFor(this.seed, this.day, this.period, 'critters');
    const areas = [{ x0: 24, y0: 2, x1: 31, y1: 7 }, { x0: 2, y0: 17, x1: 31, y1: 22 }, { x0: 34, y0: 2, x1: 57, y1: 37 }, { x0: 18, y0: 24, x1: 31, y1: 36 }];
    for (let n = 0; n < 9; n++) {
      const a = areas[n % areas.length];
      for (let t = 0; t < 30; t++) {
        const x = a.x0 + Math.floor(rand() * (a.x1 - a.x0 + 1)), y = a.y0 + Math.floor(rand() * (a.y1 - a.y0 + 1));
        if (this.solidAt(x, y) || this.map.water[idx(x, y)]) continue;
        const id = pool[Math.floor(rand() * pool.length)];
        this.critters.push({ id, x: x + 0.5, y: y + 0.5, hx: x + 0.5, hy: y + 0.5, t: rand() * 10, fly: !!CRITTERS[id].fly, flee: 0 });
        break;
      }
    }
  }

  updateCritters(dt) {
    const p = this.player;
    for (const c of this.critters) {
      c.t += dt;
      const s = c.fly ? 0.9 : 0.35;
      // Drift around home in a lazy loop; scoot away when a farmer runs at them.
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < 1.4 && p.moving) c.flee = 0.6;
      if (c.flee > 0) {
        c.flee -= dt;
        c.x += ((c.x - p.x) / (d || 1)) * s * 1.6 * dt;
        c.y += ((c.y - p.y) / (d || 1)) * s * 1.6 * dt;
      } else {
        const tx = c.hx + Math.sin(c.t * 0.7 * s) * 1.2, ty = c.hy + Math.cos(c.t * 0.5 * s) * 0.8;
        c.x += (tx - c.x) * Math.min(1, dt * s);
        c.y += (ty - c.y) * Math.min(1, dt * s);
      }
      if (this.solidAt(Math.floor(c.x), Math.floor(c.y)) && !c.fly) { c.x = c.hx; c.y = c.hy; }
    }
  }

  critterNear(tx, ty, r) {
    let best = null, bd = r;
    for (const c of this.critters) {
      const d = Math.hypot(c.x - (tx + 0.5), c.y - (ty + 0.5));
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  catchCritter(cr) {
    this.critters.splice(this.critters.indexOf(cr), 1);
    this.stats.crittersCaught++;
    const first = this.record('critters', cr.id);
    this.events.push({ type: 'critter', id: cr.id, x: cr.x, y: cr.y, first });
    this.toast(`You caught a ${CRITTERS[cr.id].name}!${first ? ' New in your collection!' : ''} You let it go.`, 'good');
    this.checkGoals();
  }

  // ------------------------------------------------------------ festivals

  updateFestival() {
    const f = this.fest;
    if (!f) return;
    const running = this.festivalRunning();
    if (running && !f.started) {
      f.started = true;
      this.events.push({ type: 'festivalStart', id: f.id });
      this.toast(`The ${FESTIVALS[f.id].name} has started in town!`, 'good');
      if (f.id === 'egghunt') this.spawnEggs(0);
    }
    if (!running && f.started && !f.ended) {
      f.ended = true;
      this.pickups = this.pickups.filter((pk) => !pk.festival);
      if (!f.done) {
        this.gain(50, 'prize');
        this.toast(`The ${FESTIVALS[f.id].name} is over. Thanks for coming! Here's 50g for taking part.`);
      }
    }
  }

  lightLantern(i) {
    if (this.festival !== 'lanterns' || !this.festivalRunning()) {
      this.toast(this.festival === 'lanterns' ? 'Lantern Night starts at 6 pm.' : 'A paper lantern on a post. It waits for summer Lantern Night.');
      return;
    }
    const f = this.fest;
    if (f.lit.includes(i)) return;
    f.lit.push(i);
    this.events.push({ type: 'lantern', i });
    if (f.lit.length >= FESTIVALS.lanterns.goal && !f.done) this.winFestival('lanterns', FESTIVALS.lanterns.prize.gold);
    else this.toast(`Lantern ${f.lit.length}/${FESTIVALS.lanterns.goal} lit!`);
  }

  // Seconds remaining today in real time, for the HUD.
  timeLeft() { return DAY_END - this.minute; }
}

export { DIR, TROUGH };
