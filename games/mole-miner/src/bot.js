// Autoplayer: plans tile moves with Dijkstra over the mine, steers the pod
// with ordinary controls, and shops at base. Used by the balance tests, the
// title-screen demo and the ?autopilot debug mode. DOM-free.
import { T, ORES, PHYS, UPGRADES, PIECE_REWARD } from './data.js';
import { isOre, isRelic } from './sim.js';
import { upgradeInfo, buyUpgrade } from './game.js';

const SKY = 3; // rows of sky the planner may use

// Binary min-heap over typed arrays (keys are costs, values node ids).
class Heap {
  constructor(cap = 1 << 16) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.size = 0; }
  clear() { this.size = 0; }
  push(key, val) {
    if (this.size >= this.k.length) {
      const k = new Float64Array(this.k.length * 2); k.set(this.k); this.k = k;
      const v = new Int32Array(this.v.length * 2); v.set(this.v); this.v = v;
    }
    const k = this.k, v = this.v;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    this.topKey = k[0];
    const n = --this.size;
    if (n > 0) {
      const lk = k[n], lv = v[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

export class Bot {
  constructor({ shop = true } = {}) {
    this.shop = shop;
    this.path = null;
    this.goal = null;
    this.stuck = 0;
    this.lastCell = -1;
    this.progressT = 0;
    this.fails = 0;
    this.idle = 0;
    this.idleCount = 0;
    this.dist = null;
    this.prev = null;
  }

  reset() { this.path = null; this.goal = null; this.stuck = 0; this.idle = 0; }

  // ------------------------------------------------------------ planning

  node(mine, x, y) { return (y + SKY) * mine.w + x; }

  // Dijkstra from the pod's cell. Costs are seconds (roughly fuel).
  // Grid rows run from SKY rows above the surface to the last open row.
  plan(mine, maxCost) {
    const w = mine.w, rows = mine.h - 1 + SKY, n = w * rows;
    if (!this.dist || this.dist.length !== n) {
      this.dist = new Float64Array(n);
      this.prev = new Int32Array(n);
      this.open = new Uint8Array(n);
      this.dig = new Float32Array(n);
      this.pen = new Float32Array(n);
      this.heap = new Heap();
    }
    const { dist, prev, open, dig, pen, heap } = this;
    const s = mine.stats;
    // Per-cell passability, dig time and hazard penalty for this plan.
    for (let v = 0; v < n; v++) {
      const x = v % w, y = Math.floor(v / w) - SKY;
      const code = mine.tile(x, y);
      open[v] = code === T.EMPTY ? 1 : 0;
      if (code === T.EMPTY) dig[v] = 0;
      else {
        const di = mine.digInfo(x, y);
        dig[v] = di.ok ? di.time : Infinity;
      }
      let c = 0;
      if (!s.fan && (mine.tile(x - 1, y) === T.LAVA || mine.tile(x + 1, y) === T.LAVA || mine.tile(x, y + 1) === T.LAVA)) c += 4;
      if (mine.tile(x, y - 1) === T.BOULDER) c += 1.5;
      pen[v] = c;
    }
    dist.fill(Infinity);
    prev.fill(-1);
    heap.clear();
    const p = mine.pod;
    const start = this.node(mine, Math.floor(p.x), Math.floor(p.y));
    if (start < 0 || start >= n) return start;
    dist[start] = 0;
    heap.push(0, start);
    const fly = 1 / s.fly, walk = 1 / PHYS.groundSpeed, hover = 1 / PHYS.airSpeed + 0.06;
    const relax = (u, v, cost) => {
      const nd = dist[u] + cost + pen[v];
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push(nd, v); }
    };
    while (heap.size) {
      const u = heap.pop();
      const du = heap.topKey;
      if (du > dist[u]) continue; // stale entry
      if (du > maxCost) break;
      const x = u % w, row = Math.floor(u / w);
      const below = u + w;
      const groundedHere = row + 1 >= rows || !open[below];
      // Up: fly through open cells only.
      if (row > 0 && open[u - w]) relax(u, u - w, fly);
      // Down: fall, or drill.
      if (row + 1 < rows) {
        if (open[below]) relax(u, below, 0.1);
        else if (dig[below] !== Infinity) relax(u, below, dig[below] + 0.05);
      }
      // Sideways: walk/hover through open cells, drill only from the ground.
      if (x > 1) {
        const v = u - 1;
        if (open[v]) relax(u, v, groundedHere ? walk : hover);
        else if (groundedHere && dig[v] !== Infinity) relax(u, v, dig[v] + 0.08);
      }
      if (x < w - 2) {
        const v = u + 1;
        if (open[v]) relax(u, v, groundedHere ? walk : hover);
        else if (groundedHere && dig[v] !== Infinity) relax(u, v, dig[v] + 0.08);
      }
    }
    return start;
  }

  pathTo(mine, target) {
    const out = [];
    let v = target;
    let guard = 0;
    while (v !== -1 && guard++ < 100000) { out.push(v); v = this.prev[v]; }
    out.reverse();
    return out.map((i) => ({ x: i % mine.w, y: Math.floor(i / mine.w) - SKY }));
  }

  returnCost(mine, x, y) {
    const s = mine.stats;
    const baseX = (mine.base.x0 + mine.base.x1) / 2;
    return (Math.max(0, y) + 1.5) / s.fly * s.flyBurn * 1.2 + Math.abs(x - baseX) / PHYS.groundSpeed * 0.5 + 2.5;
  }

  choose(mine, session) {
    const p = mine.pod, s = mine.stats;
    const start = this.plan(mine, p.fuel);
    const w = mine.w;
    const cargoFull = p.cargo.length >= s.cargo;
    let best = -1, bestScore = 0, bestKind = '';
    const baseNode = this.node(mine, Math.floor((mine.base.x0 + mine.base.x1) / 2), -1);
    const homeNeed = this.returnCost(mine, p.x, p.y);
    if (p.fuel > homeNeed * 1.05 + 1) {
      for (let v = 0; v < this.dist.length; v++) {
        const d = this.dist[v];
        if (d === Infinity || v === start) continue;
        const x = v % w, y = Math.floor(v / w) - SKY;
        if (y < 0) continue;
        const code = mine.tile(x, y);
        let value = 0;
        if (isOre(code)) { if (!cargoFull) value = ORES[code - T.ORE0].value; }
        else if (isRelic(code)) value = PIECE_REWARD[Math.floor((code - T.RELIC0) / 4)] * 1.5;
        else if (code === T.CORE) value = 50000;
        else if (code === T.ACORN) value = session && session.kind === 'daily' && session.daily.goal.type === 'acorn' ? 5000 : 0;
        else if (code === T.FUEL && p.fuel < s.tank * 0.6) value = 30;
        // Daily depth goals reward simply going deep.
        if (session && session.kind === 'daily' && session.daily.goal.type === 'depth') value += y * 2 >= session.daily.goal.target ? 3000 : y * 4;
        if (!value) continue;
        const need = d + this.returnCost(mine, x, y);
        if (need > p.fuel * 0.92 - 1) continue;
        const score = value / (d + 1.5);
        if (score > bestScore) { bestScore = score; best = v; bestKind = 'dig'; }
      }
    }
    const dailyDone = session && session.kind === 'daily' && this.dailyMet(session);
    if (best < 0 || cargoFull || dailyDone) {
      // Head home. If the base is beyond the fuel budget, plan without one.
      if (this.dist[baseNode] === Infinity) this.plan(mine, 1e9);
      best = baseNode;
      bestKind = 'home';
      if (this.dist[baseNode] === Infinity) return false;
    }
    this.goal = { kind: bestKind, x: best % w, y: Math.floor(best / w) - SKY };
    this.path = this.pathTo(mine, best);
    this.path.shift(); // current cell
    this.progressT = 0;
    return true;
  }

  dailyMet(session) {
    const pr = session.dailyProgress();
    return pr.now >= pr.target;
  }

  // ------------------------------------------------------------ shopping

  shopAt(save) {
    if (!this.shop) return [];
    const bought = [];
    for (let guard = 0; guard < 30; guard++) {
      const drill = upgradeInfo(save, 'drill');
      if (!drill.maxed && drill.affordable) { buyUpgrade(save, 'drill'); bought.push('drill'); continue; }
      const fan = upgradeInfo(save, 'fan');
      if (!fan.maxed && fan.affordable) { buyUpgrade(save, 'fan'); bought.push('fan'); continue; }
      const dt = save.upgrades.drill;
      const opts = ['cargo', 'tank', 'prop', 'hull', 'lamp']
        .map((k) => upgradeInfo(save, k))
        .filter((u) => !u.maxed && u.affordable && (u.key !== 'lamp' || u.next <= dt - 1));
      // Save up for the next drill when it is close.
      const reserve = drill.maxed ? 0 : (save.coins >= drill.cost * 0.6 ? drill.cost : 0);
      const pick = opts.filter((u) => save.coins - u.cost >= reserve).sort((a, b) => a.cost - b.cost)[0];
      if (!pick) break;
      buyUpgrade(save, pick.key);
      bought.push(pick.key);
    }
    return bought;
  }

  // ------------------------------------------------------------ control

  controls(session, dt) {
    const mine = session.mine;
    const p = mine.pod;
    if (p.stranded) return { ax: 0, ay: 0 };
    if (p.drill) return { ax: p.drill.dx, ay: p.drill.dy };
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    const cell = cy * 1000 + cx;
    if (cell !== this.lastCell) { this.lastCell = cell; this.stuck = 0; } else this.stuck += dt;

    if (this.idle > 0) { this.idle -= dt; return { ax: 0, ay: 0 }; }
    if (!this.path || !this.path.length || this.stuck > 2.5) {
      if (this.stuck > 2.5) { this.fails++; this.stuck = 0; }
      if (!this.choose(mine, session)) { this.idle = 1; return { ax: 0, ay: 0 }; }
      // Nothing worth digging and already home: wait a moment before asking again.
      if (this.goal.kind === 'home' && p.docked && !this.path.length) { this.idle = 1; this.idleCount = (this.idleCount || 0) + 1; }
    }
    // Pop cells we have reached; replan if we have left the path.
    while (this.path.length && this.path[0].x === cx && this.path[0].y === cy) this.path.shift();
    if (!this.path.length) {
      // Goal reached (or dug): choose the next one next frame. At home, just
      // settle on the pad so docking happens.
      this.path = null;
      return { ax: 0, ay: 0 };
    }
    const n = this.path[0];
    const dx = n.x - cx, dy = n.y - cy;
    if (Math.abs(dx) + Math.abs(dy) !== 1) { this.path = null; return { ax: 0, ay: 0 }; }
    const solidN = mine.solid(n.x, n.y);
    const tx = n.x + 0.5;
    if (solidN) {
      if (dy === 1) {
        const err = cx + 0.5 - p.x;
        return { ax: Math.abs(err) > 0.3 ? Math.sign(err) * 0.25 : 0, ay: 1 };
      }
      if (dx !== 0) {
        // Side digs need the ground: let the pod settle first.
        return { ax: dx, ay: p.grounded ? 0 : 0.5 };
      }
      this.path = null;
      return { ax: 0, ay: 0 };
    }
    if (dy === -1) {
      const err = tx - p.x;
      return { ax: Math.abs(err) > 0.06 ? Math.max(-0.25, Math.min(0.25, err * 2)) : 0, ay: -1 };
    }
    if (dy === 1) {
      const err = tx - p.x;
      return { ax: Math.abs(err) > 0.06 ? Math.max(-0.25, Math.min(0.25, err * 2)) : 0, ay: 0 };
    }
    // Sideways through open space: walk, or hover at the row centre.
    const floor = mine.solid(cx, cy + 1) || mine.solid(n.x, n.y + 1);
    let ay = 0;
    if (!floor || !p.grounded) {
      const ty = n.y + 0.55;
      const want = Math.max(-4, Math.min(4, (ty - p.y) * 6));
      ay = p.vy > want ? -1 : 0;
    }
    return { ax: dx, ay };
  }
}

// Run a session with the bot. Returns a timeline for balance checks.
export function runBot(session, { maxTime = 3600, dt = 1 / 60, until = null, bot = new Bot() } = {}) {
  const timeline = { layers: {}, trips: 0, tows: 0, buys: [], time: 0, coreAt: null, docks: 0, lostGems: 0, bonks: 0, gas: 0 };
  let t = 0;
  let towWait = 0;
  while (t < maxTime) {
    const ctl = bot.controls(session, dt);
    session.step(dt, ctl);
    t += dt;
    const p = session.pod;
    const row = Math.floor(p.y + 0.4);
    const li = row >= 0 ? session.world.layerOf[Math.min(session.world.h - 1, row)] : -1;
    if (li >= 0 && timeline.layers[li] === undefined) timeline.layers[li] = Math.round(t);
    for (const e of session.events) {
      if (e.type === 'docked') {
        timeline.docks++;
        if (e.trip) timeline.trips++;
        if (session.kind === 'main') {
          const b = bot.shopAt(session.save);
          if (b.length) { session.refreshStats(); timeline.buys.push({ t: Math.round(t), b }); }
          // Fill up with the new tank.
          session.pod.fuel = session.stats.tank;
          session.pod.hull = session.stats.hull;
        }
        bot.reset();
      } else if (e.type === 'coreReached' && timeline.coreAt === null) timeline.coreAt = Math.round(t);
      else if (e.type === 'full') timeline.lostGems++;
      else if (e.type === 'bonk') timeline.bonks++;
      else if (e.type === 'gas') timeline.gas++;
    }
    session.events.length = 0;
    if (p.stranded) {
      towWait += dt;
      if (towWait > 0.5) { session.tow(); timeline.tows++; towWait = 0; bot.reset(); }
    }
    if (session.result) break;
    if (until && until(session, t)) break;
  }
  timeline.time = Math.round(t);
  timeline.fails = bot.fails;
  timeline.idle = bot.idleCount;
  return timeline;
}

export { UPGRADES };
