// Seeded, endless track generation. Obstacles come in rows across the three
// lanes; amber trails and power-ups fill the gaps between rows. DOM-free.
//
// Fairness rules (checked by tests over many seeds):
//  - every row has at least one passable lane (empty, log or pterodactyl);
//  - full blocks (boulder, geyser, hedge) never close all three lanes;
//  - rows are at least MIN_GAP_TIME apart at the speed you'll be running;
//  - amber never sits inside an obstacle.
import { makeRng } from './rng.js';
import { OBSTACLES, COIN, PLAYER, speedAt, tierAt, GAP_TIME, MIN_GAP_TIME, START_CLEAR } from './config.js';

export const LANE_LIST = [-1, 0, 1];
const PASSABLE = new Set([null, 'log', 'ptero']);

export const isFull = (kind) => !!kind && !!OBSTACLES[kind]?.full;
export const isPassable = (kind) => PASSABLE.has(kind ?? null);

// Pattern weights by tier (0..4). Missing keys are unavailable.
const PATTERNS = [
  { single: 5, double: 3, breather: 1.4, logs3: 0.8 },
  { single: 4, double: 4, wall: 1.5, breather: 1, logs3: 1.2, corridor: 1.4, geyserAlley: 0.8 },
  { single: 3, double: 4, wall: 2.5, breather: 0.8, logs3: 1.2, pteros3: 1, corridor: 1.8, zigzag: 1.2, geyserAlley: 1, stagger: 1.2 },
  { single: 2, double: 4, wall: 3, breather: 0.6, logs3: 1.2, pteros3: 1.2, corridor: 2, zigzag: 1.8, geyserAlley: 1.2, stagger: 1.6 },
  { single: 1.5, double: 4, wall: 3.5, breather: 0.5, logs3: 1.2, pteros3: 1.4, corridor: 2.4, zigzag: 2.2, geyserAlley: 1.4, stagger: 2 },
];

const THEME_PATTERN = {
  logjam: { logs3: 3, stagger: 2 },
  ptero: { pteros3: 3, stagger: 2 },
  geyser: { geyserAlley: 3 },
  hedge: { corridor: 3 },
  amber: { breather: 1.6 },
};
const THEME_BLOCK = {
  logjam: { log: 3 },
  ptero: { ptero: 3 },
  geyser: { geyser: 3 },
};

export class Track {
  constructor(seed = 1, { theme = 'mixed' } = {}) {
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed);
    this.theme = theme;
    this.items = []; // obstacles: { id, kind, lane, z, len, gone }
    this.coins = []; // { id, lane, z, y, taken }
    this.powers = []; // { id, kind, lane, z, y, taken }
    this.rows = []; // { z, gap, cells } with hedges shown as 'hedge'
    this.z = START_CLEAR;
    this.nextId = 1;
    this.hedgeUntil = [-Infinity, -Infinity, -Infinity];
    this.coinLane = 0;
    this.nextPower = 240 + this.rng.range(0, 120);
  }

  // Generate rows until the track reaches `toZ`.
  fill(toZ) {
    if (this.z >= toZ) return;
    while (this.z < toZ) this.pattern();
    // Arcs over logs start a little before the row; keep amber in z order.
    this.coins.sort((a, b) => a.z - b.z);
  }

  // Forget everything well behind the dino.
  prune(d) {
    const keep = (min) => (o) => o.z + (o.len || 0) >= min;
    if (this.items.length && this.items[0].z < d - 60) this.items = this.items.filter(keep(d - 30));
    if (this.coins.length && this.coins[0].z < d - 40) this.coins = this.coins.filter(keep(d - 20));
    if (this.powers.length && this.powers[0].z < d - 40) this.powers = this.powers.filter(keep(d - 20));
    if (this.rows.length > 400) this.rows = this.rows.filter(keep(d - 30));
  }

  tier() {
    return tierAt(this.z);
  }

  // Seconds-to-metres for the gap after a row at z. Uses the speed a little
  // further on, so a gap is never shorter than promised.
  gapAt(z, scale = 1) {
    const v = speedAt(z + 40);
    const base = z < 300 ? Math.max(1.1, GAP_TIME[tierAt(z)]) : GAP_TIME[tierAt(z)];
    return Math.max(MIN_GAP_TIME, base * scale) * v;
  }

  covered(lane, z = this.z) {
    return this.hedgeUntil[lane + 1] > z + 0.01;
  }

  freeLanes() {
    return LANE_LIST.filter((l) => !this.covered(l));
  }

  block(allowFull = true) {
    const tier = this.tier();
    const w = { log: 3, boulder: allowFull ? 2 : 0, ptero: this.z > 150 ? 2.2 : 0, geyser: allowFull && (tier >= 1 || this.theme === 'geyser') ? 2 : 0 };
    const t = THEME_BLOCK[this.theme];
    if (t) for (const k in t) if (w[k] > 0 || k === 'ptero') w[k] = (w[k] || 1) * t[k];
    if (this.z <= 150) w.ptero = 0;
    return this.rng.weighted(w);
  }

  passableBlock() {
    return this.z > 150 && this.rng.chance(0.45) ? 'ptero' : 'log';
  }

  pattern() {
    const tier = this.tier();
    const w = { ...PATTERNS[tier] };
    const t = THEME_PATTERN[this.theme];
    if (t) for (const k in t) if (k in w || tier >= 1) w[k] = (w[k] || 1) * t[k];
    if (tier === 0 && this.theme !== 'ptero') delete w.pteros3;
    if (this.z <= 150) delete w.pteros3;
    const name = this.rng.weighted(w);
    this[name]();
  }

  // ---- patterns -------------------------------------------------------

  single() {
    const cells = [null, null, null];
    const free = this.freeLanes();
    cells[this.rng.pick(free) + 1] = this.block();
    this.row(cells);
  }

  double() {
    const cells = [null, null, null];
    const free = this.freeLanes();
    const open = this.rng.pick(LANE_LIST);
    for (const l of free) if (l !== open) cells[l + 1] = this.block();
    this.row(cells);
  }

  wall() {
    const cells = [null, null, null];
    for (const l of this.freeLanes()) cells[l + 1] = this.block();
    const soft = this.rng.pick(this.freeLanes());
    cells[soft + 1] = this.passableBlock();
    this.row(cells);
  }

  logs3() {
    this.row(LANE_LIST.map((l) => (this.covered(l) ? null : 'log')));
  }

  pteros3() {
    this.row(LANE_LIST.map((l) => (this.covered(l) ? null : 'ptero')));
  }

  breather() {
    this.row([null, null, null], 1.25);
  }

  zigzag() {
    const n = this.rng.int(3, 4);
    let open = this.rng.pick([-1, 1]);
    for (let i = 0; i < n; i++) {
      const cells = LANE_LIST.map((l) => (l === open || this.covered(l) ? null : this.rng.chance(0.5) ? 'boulder' : 'geyser'));
      this.row(cells);
      open = open === 0 ? this.rng.pick([-1, 1]) : open === -1 ? (this.rng.chance(0.5) ? 0 : 1) : (this.rng.chance(0.5) ? 0 : -1);
    }
  }

  stagger() {
    const lane = this.rng.pick(this.freeLanes());
    const kinds = this.rng.chance(0.5) ? ['log', 'ptero', 'log'] : ['ptero', 'log', 'ptero'];
    for (const k of kinds) {
      const cells = [null, null, null];
      if (!this.covered(lane)) cells[lane + 1] = this.z > 150 ? k : 'log';
      this.row(cells);
    }
  }

  geyserAlley() {
    const n = this.rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const cells = [null, null, null];
      const free = this.freeLanes();
      const a = this.rng.pick(free);
      cells[a + 1] = 'geyser';
      if (this.rng.chance(0.5)) {
        const b = this.rng.pick(free.filter((l) => l !== a));
        if (b !== undefined) cells[b + 1] = 'geyser';
      }
      this.row(cells, 0.95);
    }
  }

  corridor() {
    const tier = this.tier();
    const rows = this.rng.int(3, 5);
    const two = tier >= 3 && this.rng.chance(0.4);
    let lanes;
    if (two) {
      const open = this.rng.pick(LANE_LIST);
      lanes = LANE_LIST.filter((l) => l !== open);
    } else {
      lanes = [this.rng.pick(LANE_LIST)];
    }
    lanes = lanes.filter((l) => !this.covered(l));
    // Never close every lane: if another hedge is still running, keep it to one.
    const coveredNow = LANE_LIST.filter((l) => this.covered(l)).length;
    if (coveredNow + lanes.length > 2) lanes = lanes.slice(0, Math.max(0, 2 - coveredNow));
    // The hedge runs alongside every corridor row and ends just after the
    // last one, leaving a whole gap to change lanes before the next row.
    let len = 0;
    let z = this.z;
    for (let i = 0; i < rows - 1; i++) {
      const g = this.gapAt(z);
      len += g;
      z += g;
    }
    len = Math.max(10, len + 2.5);
    for (const l of lanes) this.addHedge(l, this.z, len);
    for (let i = 0; i < rows; i++) {
      const cells = [null, null, null];
      for (const l of this.freeLanes()) {
        if (this.rng.chance(0.45)) cells[l + 1] = this.block();
      }
      this.row(cells);
    }
  }

  // ---- building blocks ------------------------------------------------

  addHedge(lane, z, len) {
    this.items.push({ id: this.nextId++, kind: 'hedge', lane, z, len, gone: false });
    this.hedgeUntil[lane + 1] = Math.max(this.hedgeUntil[lane + 1], z + len);
  }

  // Emit one row at this.z, fix it up so it is always passable, then fill
  // the gap after it with amber and maybe a power-up.
  row(cells, gapScale = 1) {
    const z = this.z;
    const eff = cells.map((k, i) => (this.covered(i - 1, z) ? 'hedge' : k));
    // You can't cross a hedge in the middle lane, so both sides stay
    // passable while it runs.
    if (eff[1] === 'hedge') {
      for (const i of [0, 2]) if (isFull(eff[i]) && eff[i] !== 'hedge') eff[i] = this.passableBlock();
    }
    // At least one passable lane: soften a full block if needed.
    if (!eff.some(isPassable)) {
      const options = [0, 1, 2].filter((i) => eff[i] !== 'hedge');
      const i = this.rng.pick(options);
      eff[i] = 'log';
    }
    for (let i = 0; i < 3; i++) {
      const kind = eff[i];
      if (kind && kind !== 'hedge') this.items.push({ id: this.nextId++, kind, lane: i - 1, z, len: OBSTACLES[kind].len, gone: false });
    }
    const gap = this.gapAt(z, gapScale);
    this.rows.push({ z, gap, cells: eff });
    this.coinsAfter(z, gap, eff);
    this.maybePower(z, gap);
    this.z = z + gap;
  }

  coinsAfter(z, gap, cells) {
    const trail = this.theme === 'amber' ? 1 : 0.7;
    if (!this.rng.chance(trail)) return;
    const from = z + 1.6;
    const to = z + gap - 1.6;
    const ok = (l) => isPassable(cells[l + 1]) && !this.covered(l, z) && !this.hedgeHits(l, from, to);
    let lane = this.coinLane;
    if (!ok(lane) || this.rng.chance(0.25)) {
      const options = LANE_LIST.filter(ok);
      if (!options.length) return;
      options.sort((a, b) => Math.abs(a - this.coinLane) - Math.abs(b - this.coinLane));
      lane = this.rng.chance(0.7) ? options[0] : this.rng.pick(options);
    }
    this.coinLane = lane;
    const kind = cells[lane + 1];
    if (kind === 'log') {
      // An arc over the log, following the jump.
      for (let i = -2; i <= 2; i++) {
        const t = i / 2.6;
        this.addCoin(lane, z + OBSTACLES.log.len / 2 + i * 1.6, COIN.y + 1.5 * (1 - t * t));
      }
    } else if (kind === 'ptero') {
      this.addCoin(lane, z - 0.6, 0.35);
      this.addCoin(lane, z + 1.4, 0.35);
    }
    for (let c = from; c <= to; c += COIN.spacing) this.addCoin(lane, c, COIN.y);
  }

  hedgeHits(lane, from, to) {
    for (let i = this.items.length - 1; i >= 0 && i > this.items.length - 40; i--) {
      const it = this.items[i];
      if (it.kind === 'hedge' && it.lane === lane && it.z < to + 0.5 && it.z + it.len > from - 0.5) return true;
    }
    return false;
  }

  addCoin(lane, z, y) {
    this.coins.push({ id: this.nextId++, lane, z, y, taken: false });
  }

  maybePower(z, gap) {
    if (z < this.nextPower) return;
    const mid = z + gap / 2;
    const lanes = LANE_LIST.filter((l) => !this.covered(l, z) && !this.hedgeHits(l, mid - 1, mid + 1));
    if (!lanes.length) return;
    const lane = this.rng.pick(lanes);
    const kind = this.rng.weighted({ magnet: 1.2, shield: 1, glide: 0.8 });
    // Don't leave amber under the power-up.
    this.coins = this.coins.filter((c) => !(c.lane === lane && Math.abs(c.z - mid) < 1.4));
    this.powers.push({ id: this.nextId++, kind, lane, z: mid, y: 0.9, taken: false });
    this.nextPower = z + this.rng.range(260, 420);
  }

  // Sky amber for a glide, from `from` to `to`.
  skyCoins(from, to) {
    let i = 0;
    for (let z = from; z < to; z += COIN.spacing, i++) {
      const lane = Math.max(-1, Math.min(1, Math.round(Math.sin(i * 0.22 + this.seed) * 1.3)));
      this.addCoin(lane, z, PLAYER.glideHeight + 0.5);
    }
    this.coins.sort((a, b) => a.z - b.z);
  }

  // Clear the path (landing from a glide).
  clear(from, to) {
    for (const it of this.items) {
      if (it.gone) continue;
      const end = it.z + it.len;
      if (end < from || it.z > to) continue;
      if (it.kind === 'hedge' && end > to) {
        it.len = end - to;
        it.z = to;
      } else it.gone = true;
    }
  }
}
