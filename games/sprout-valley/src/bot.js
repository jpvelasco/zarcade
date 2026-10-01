// A bot farmer: plays through the same controls a mouse player has
// (pick a belt slot, click a tile) and answers menus the way the UI would.
// Used by the balance tests and the ?autopilot attract mode.
import { CROPS, ITEMS, TOOLS, sellable } from './data.js';
import { W, idx, FIELD_A, FIELD_B, WELL, BIN, TROUGH, SHOP_COUNTER, BUILDINGS } from './map.js';

const HOUSE_DOOR = BUILDINGS.find((b) => b.id === 'house').door;
import { isRipe } from './crops.js';
import { DAYS_PER_SEASON } from './time.js';
import { shopStock } from './economy.js';

const PHASES = ['harvest', 'collect', 'ship', 'trough', 'water', 'plant', 'shop', 'plant', 'water', 'hay', 'home'];

export class FarmerBot {
  constructor(world, { upgrades = true, maxPlots = 80 } = {}) {
    this.w = world;
    this.upgrades = upgrades;
    this.maxPlots = maxPlots;
    this.queue = [];
    this.phase = 0;
    this.day = world.day;
    this.cmd = null;
    this.cmdTime = 0;
    this.slept = false;
    this.lastSummary = null;
  }

  // Controls for one step. Call handleEvents(world.events) after each step.
  controls(dt) {
    const w = this.w;
    if (w.day !== this.day) { this.day = w.day; this.phase = 0; this.queue = []; this.cmd = null; }
    const p = w.player;
    if (this.cmd) {
      this.cmdTime += dt;
      const idle = !p.path && p.busy === 0 && !p.fishing;
      if (this.cmd.wait) { if (w.minute >= this.cmd.wait || this.cmdTime > 400) this.cmd = null; return {}; }
      if (idle || this.cmdTime > 25) this.cmd = null;
      return {};
    }
    while (!this.queue.length && this.phase < PHASES.length) {
      this.queue = this.plan(PHASES[this.phase]);
      this.phase++;
    }
    if (!this.queue.length) {
      // Nothing left: wait at home until it is late enough, then sleep.
      return {};
    }
    this.cmd = this.queue.shift();
    this.cmdTime = 0;
    this.cmd.sent = true;
    return this.send(this.cmd);
  }

  send(cmd) {
    const w = this.w;
    let slot = null;
    if (cmd.item) {
      slot = w.belt.indexOf(cmd.item);
      if (slot < 0) { w.setBelt(TOOLS.length, cmd.item); slot = w.belt.indexOf(cmd.item); }
    } else if (cmd.tool) slot = TOOLS.indexOf(cmd.tool);
    if (cmd.item && !w.inv[cmd.item]) return {};
    return { slot, target: cmd.target };
  }

  handleEvents(events) {
    const w = this.w;
    for (const e of events) {
      if (e.type === 'passout') { this.lastSummary = w.sleep(true); continue; }
      if (e.type !== 'menu') continue;
      if (e.menu === 'bin') {
        for (const [id, n] of Object.entries(w.inv)) if (sellable(id) && !this.keep(id)) w.ship(id, n);
      } else if (e.menu === 'shop') this.shop();
      else if (e.menu === 'home') {
        if (this.phase >= PHASES.length) this.lastSummary = w.sleep();
      }
    }
  }

  keep() { return false; }

  // Best seed to plant today: most profit per plot that ripens this season.
  bestSeed() {
    const w = this.w;
    const daysLeft = DAYS_PER_SEASON - w.date.day;
    let best = null, bestValue = 0;
    for (const [id, c] of Object.entries(CROPS)) {
      if (!c.seasons.includes(w.season) || c.days > daysLeft) continue;
      let harvests = 1;
      if (c.regrow) harvests += Math.floor((daysLeft - c.days) / c.regrow);
      const value = (c.sell * (c.yield || 1) * harvests - c.seed);
      if (value > bestValue) { bestValue = value; best = id; }
    }
    return best;
  }

  freePlots() {
    const w = this.w;
    const field = w.upgrades.field ? FIELD_B : FIELD_A;
    const out = [];
    for (let y = field.y0; y <= field.y1; y++) for (let x = field.x0; x <= field.x1; x++) {
      const k = idx(x, y);
      if (w.crop[k] || w.map.solid[k] || w.obj[k]?.type === 'sprinkler' || w.obj[k]?.type === 'decor') continue;
      out.push([x, y]);
    }
    return out;
  }

  plantedCount() {
    let n = 0;
    for (const c of this.w.crop) if (c && !c.dead) n++;
    return n;
  }

  shop() {
    const w = this.w;
    const stock = shopStock(w.stockState());
    const has = (id) => stock.some((s) => s.id === id);
    if (this.upgrades) {
      if (w.canLevel === 0 && has('can1') && w.money >= 900) w.buy('can1');
      if (w.canLevel === 1 && has('can2') && w.money >= 3000) w.buy('can2');
      if (has('field') && w.money >= 3200 && w.canLevel >= 1) w.buy('field');
      if ((w.inv.hay || 0) + w.trough < w.animals.length * 3 && w.money > 200) w.buy('hay', w.animals.length * 3);
    }
    const seed = this.bestSeed();
    if (!seed) return;
    const held = Object.entries(w.inv).reduce((n, [id, k]) => n + (ITEMS[id].kind === 'seed' ? k : 0), 0);
    const room = Math.min(this.maxPlots - this.plantedCount(), this.freePlots().length) - held;
    const cost = CROPS[seed].seed;
    const n = Math.max(0, Math.min(room, Math.floor((w.money - 50) / cost)));
    if (n > 0) w.buy(`${seed}_seed`, n);
  }

  plan(phase) {
    const w = this.w;
    const cmds = [];
    if (phase === 'harvest') {
      const ripe = [];
      for (let i = 0; i < w.crop.length; i++) if (isRipe(w.crop[i])) ripe.push([i % W, Math.floor(i / W)]);
      for (const t of nearestChain(ripe, w.tile)) cmds.push({ tool: 'hoe', target: t });
      // Withered plants get cleared too.
      for (let i = 0; i < w.crop.length; i++) if (w.crop[i]?.dead) cmds.push({ tool: 'hoe', target: [i % W, Math.floor(i / W)] });
    } else if (phase === 'collect') {
      for (const pk of nearestChain(w.pickups.filter((p) => !p.festival).map((p) => [p.x, p.y]), w.tile)) cmds.push({ tool: 'hoe', target: pk });
    } else if (phase === 'ship') {
      if (Object.keys(w.inv).some((id) => sellable(id))) cmds.push({ tool: 'hoe', target: BIN });
    } else if (phase === 'trough') {
      if (w.trough < w.animals.length && w.inv.hay) cmds.push({ tool: 'hoe', target: TROUGH[0] });
    } else if (phase === 'water') {
      const dry = [];
      for (let i = 0; i < w.crop.length; i++) {
        const c = w.crop[i];
        if (c && !c.dead && !w.wet[i] && !isRipe(c)) dry.push([i % W, Math.floor(i / W)]);
      }
      let water = w.water;
      for (const t of nearestChain(dry, w.tile)) {
        if (water <= 0) { cmds.push({ tool: 'hoe', target: WELL }); water = w.canInfo.capacity; }
        cmds.push({ tool: 'can', target: t, water: true });
        water--;
      }
      return cmds;
    } else if (phase === 'plant') {
      const seed = Object.keys(w.inv).find((id) => ITEMS[id].kind === 'seed' && CROPS[ITEMS[id].crop].seasons.includes(w.season) && CROPS[ITEMS[id].crop].days <= DAYS_PER_SEASON - w.date.day);
      if (!seed) return cmds;
      let n = Math.min(w.inv[seed], this.maxPlots - this.plantedCount());
      for (const [x, y] of this.freePlots()) {
        if (n <= 0) break;
        const k = idx(x, y);
        if (w.obj[k]) cmds.push({ tool: 'hoe', target: [x, y] });
        if (!w.soil[k]) cmds.push({ tool: 'hoe', target: [x, y] });
        cmds.push({ item: seed, target: [x, y] });
        n--;
      }
    } else if (phase === 'shop') {
      if (w.money < 60) return cmds;
      if (w.minute < 8 * 60) cmds.push({ wait: 8 * 60 });
      cmds.push({ tool: 'hoe', target: SHOP_COUNTER[1] });
    } else if (phase === 'hay') {
      if ((w.inv.hay || 0) < 6) {
        const tufts = [];
        for (let i = 0; i < w.tuft.length; i++) if (w.tuft[i]) tufts.push([i % W, Math.floor(i / W)]);
        for (const t of nearestChain(tufts, w.tile).slice(0, 8)) cmds.push({ tool: 'scythe', target: t });
      }
    } else if (phase === 'home') {
      cmds.push({ tool: 'hoe', target: HOUSE_DOOR });
    }
    return cmds;
  }

}

// Greedy nearest-neighbour tour, so the bot walks the field in sweeps.
export function nearestChain(list, from) {
  const left = list.slice();
  const out = [];
  let cur = from;
  while (left.length) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = Math.abs(left[i][0] - cur[0]) + Math.abs(left[i][1] - cur[1]);
      if (d < bd) { bd = d; bi = i; }
    }
    cur = left.splice(bi, 1)[0];
    out.push(cur);
  }
  return out;
}
