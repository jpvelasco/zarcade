// The mountain as a side-view heightfield. DOM-free.
//
// World units are centimetres; x grows to the right (downhill), y grows down
// (like the screen). A slope is built from a list of segments:
//   { t: 'slope',  len, grade, snow, bumps, items }
//   { t: 'rise',   len, h, grade, snow, items }   a hump to roll or jump over
//   { t: 'kicker', len, h, grade }                a ramp ending in a drop
//   { t: 'dip',    len, depth, grade, snow, items }
//   { t: 'gate',   len, min, grade }              size gate (min diameter)
//   { t: 'bridge', len, max, depth, grade, items } wooden bridge (max diameter)
//   { t: 'finish', len }                          finish arch and run-out
// `grade` is drop per run (0.3 = 30 % downhill); it eases in from the
// previous segment's grade. `snow` is 'snow' (default), 'powder' or 'ice'.
// `items` is a list of [id, count] scattered with the slope's seeded RNG.
// Segments can be appended later, which is how Endless Mountain grows.
import { Rng } from './rng.js';
import { ITEM_BY_ID } from './items.js';

export const SNOW = { none: 0, snow: 1, powder: 2, ice: 3 };
export const SNOW_GROWTH = [0, 1, 1.7, 0];

const smooth = (u) => u * u * (3 - 2 * u);

export class Terrain {
  constructor({ dx = 5, seed = 1, startGrade = 0.25 } = {}) {
    this.dx = dx;
    this.rng = new Rng(seed);
    this.ys = [0];
    this.snow = [SNOW.snow];
    this.fresh = [1];
    this.deck = [NaN];
    this.deckBridge = [-1];
    this.items = [];
    this.gates = [];
    this.bridges = [];
    this.deco = [];
    this.kickers = [];
    this.finishX = Infinity;
    this.cursorX = 0;
    this.cursorY = 0;
    this.grade = startGrade;
    this.segmentCount = 0;
    this.nextItemId = 0;
  }

  get length() { return (this.ys.length - 1) * this.dx; }

  // Build samples for one segment, then place its items.
  addSegment(seg) {
    const dx = this.dx;
    const len = Math.max(dx * 4, seg.len || 0);
    const n = Math.round(len / dx);
    const x0 = this.cursorX, y0 = this.cursorY;
    const g0 = this.grade;
    const g1 = seg.grade ?? (seg.t === 'finish' ? 0.08 : g0);
    const blend = Math.min(n, Math.max(4, Math.round(n * 0.3)));
    const snowCode = SNOW[seg.snow || 'snow'] ?? SNOW.snow;
    const rng = this.rng;
    const bumpAmp = seg.bumps || 0;
    const ph1 = rng.range(0, 6.28), ph2 = rng.range(0, 6.28);
    const w1 = rng.range(1.5, 3.5), w2 = rng.range(4, 8);
    let base = y0;
    const startIndex = this.ys.length - 1;
    let bridge = null;
    if (seg.t === 'bridge') {
      bridge = { x0, x1: x0 + n * dx, y0, y1: 0, max: seg.max, broken: false, index: this.bridges.length };
      this.bridges.push(bridge);
    }
    let lastBase = base;
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const g = k <= blend ? g0 + (g1 - g0) * smooth(k / blend) : g1;
      base += g * dx;
      lastBase = base;
      let off = 0;
      if (bumpAmp) off += bumpAmp * (Math.sin(u * w1 * Math.PI * 2 + ph1) * 0.6 + Math.sin(u * w2 * Math.PI * 2 + ph2) * 0.4) * Math.sin(u * Math.PI);
      if (seg.t === 'rise') off -= seg.h * Math.sin(Math.PI * u) ** 2;
      if (seg.t === 'dip') off += seg.depth * Math.sin(Math.PI * u) ** 2;
      if (seg.t === 'kicker') off -= k === n ? 0 : seg.h * u * u;
      if (seg.t === 'bridge') off += seg.depth * Math.sin(Math.PI * u);
      this.ys.push(base + off);
      let code = snowCode;
      if (seg.t === 'kicker' || seg.t === 'gate') code = SNOW.snow;
      this.snow.push(code);
      this.fresh.push(1);
      if (bridge && k < n) {
        this.deck.push(0); // filled in once the far rim is known
        this.deckBridge.push(bridge.index);
      } else {
        this.deck.push(NaN);
        this.deckBridge.push(-1);
      }
    }
    this.grade = g1;
    const x1 = x0 + n * dx;
    if (bridge) {
      bridge.y1 = lastBase;
      // Rewrite deck as a straight line rim to rim.
      for (let i = startIndex + 1; i < startIndex + n; i++) {
        const u = (i * dx - x0) / (n * dx);
        this.deck[i] = y0 + (lastBase - y0) * u;
      }
    }
    if (seg.t === 'kicker') this.kickers.push({ x: x1, h: seg.h });
    if (seg.t === 'gate') {
      const gx = x0 + len * 0.7;
      this.gates.push({ x: gx, y: this.groundY(gx), min: seg.min, smashed: false, blocks: 0, index: this.gates.length });
    }
    if (seg.t === 'finish') this.finishX = x0 + len * 0.3;
    this.placeItems(seg, x0, x1, bridge);
    this.placeDeco(x0, x1, seg);
    this.cursorX = x1;
    this.cursorY = lastBase;
    this.segmentCount++;
  }

  placeItems(seg, x0, x1, bridge) {
    if (!seg.items || !seg.items.length) return;
    const rng = this.rng;
    const list = [];
    const air = [];
    const first = this.items.length;
    for (const [id, count, up] of seg.items) for (let i = 0; i < count; i++) (up ? air : list).push(id);
    if (air.length) this.placeAir(seg, x0, x1, air);
    this.placeGround(list, x0, x1, bridge);
    // Keep this segment's things sorted by x (earlier ones never move here).
    const added = this.items.splice(first).sort((a, b) => a.x - b.x);
    for (const it of added) this.items.push(it);
  }

  placeGround(list, x0, x1, bridge) {
    if (!list.length) return;
    const rng = this.rng;
    // Shuffle, then place stratified along the segment so things spread out.
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng.float() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    const lo = bridge ? 0.25 : 0.08, hi = bridge ? 0.75 : 0.92;
    const span = (x1 - x0) * (hi - lo);
    list.forEach((ref, i) => {
      const u = lo + (span * (i + rng.range(0.2, 0.8))) / list.length / (x1 - x0);
      const x = x0 + (x1 - x0) * u;
      const id = this.resolve ? this.resolve(ref, x, rng) : ref;
      const def = ITEM_BY_ID[id];
      if (!def) throw new Error(`unknown item ${ref}`);
      this.items.push({
        id: this.nextItemId++, type: id, x, y: this.groundY(x), size: def.size, w: def.w,
        state: 'idle', flip: rng.chance(0.5), t: 0, vx: 0, vy: 0, spin: 0, rot: 0,
      });
    });
  }

  // Things floating on party balloons: a little arc over the middle of the
  // segment, high enough that only a jump reaches them.
  placeAir(seg, x0, x1, refs) {
    const rng = this.rng;
    const mid = (x0 + x1) / 2;
    const lift0 = seg.airLift || (this.airLift ? this.airLift(mid) : 60);
    const n = refs.length;
    const gap = lift0 * 0.75;
    refs.forEach((ref, k) => {
      const x = mid + (k - (n - 1) / 2) * gap;
      const id = this.resolve ? this.resolve(ref, x, rng) : ref;
      const def = ITEM_BY_ID[id];
      if (!def) throw new Error(`unknown item ${ref}`);
      const c = n > 1 ? (k / (n - 1)) * 2 - 1 : 0;
      const lift = lift0 * (1.15 - 0.35 * c * c);
      this.items.push({
        id: this.nextItemId++, type: id, x, y: this.groundY(x) - lift, size: def.size, w: def.w, air: true, lift,
        state: 'idle', flip: rng.chance(0.5), t: 0, vx: 0, vy: 0, spin: 0, rot: 0,
      });
    });
  }

  placeDeco(x0, x1, seg) {
    const rng = this.rng;
    const u = seg.u || this.dx * 5;
    const step = u * 14;
    for (let x = x0 + rng.range(0, step); x < x1; x += step * rng.range(0.6, 1.6)) {
      const s = rng.range(0.7, 1.4);
      this.deco.push({ x, kind: rng.chance(0.75) ? 'tree' : 'rock', s, size: s * u * 5, layer: rng.chance(0.5) ? 1 : 2 });
    }
  }

  // Ground height at x (linear between samples, clamped to the ends).
  groundY(x) {
    const f = x / this.dx;
    const n = this.ys.length - 1;
    if (f <= 0) return this.ys[0] - (this.ys[1] - this.ys[0]) * -f;
    if (f >= n) return this.ys[n] + (this.ys[n] - this.ys[n - 1]) * (f - n);
    const i = Math.floor(f), t = f - i;
    return this.ys[i] + (this.ys[i + 1] - this.ys[i]) * t;
  }

  // Ground slope dy/dx at x.
  slopeAt(x) {
    const d = this.dx;
    return (this.groundY(x + d) - this.groundY(x - d)) / (2 * d);
  }

  sample(i) {
    const n = this.ys.length - 1;
    if (i < 0) return this.ys[0] - (this.ys[1] - this.ys[0]) * i * -1;
    if (i > n) return this.ys[n] + (this.ys[n] - this.ys[n - 1]) * (i - n);
    return this.ys[i];
  }

  // Lowest centre y a ball of radius r at x can have without overlapping the
  // ground, with the contact normal. `deckOk(bridge)` decides whether a
  // bridge deck counts (only when the ball is above it).
  support(x, r, y, deckOk) {
    const dx = this.dx;
    const i0 = Math.floor((x - r) / dx), i1 = Math.ceil((x + r) / dx);
    const stride = Math.max(1, Math.floor((i1 - i0) / 40));
    let best = Infinity, bi = 0, bestDeck = false;
    const r2 = r * r;
    const test = (i, deck) => {
      const xi = i * dx, d = xi - x;
      if (d * d > r2) return;
      const gy = deck ? this.deck[i] : this.sample(i);
      const cy = gy - Math.sqrt(r2 - d * d);
      if (cy < best) { best = cy; bi = i; bestDeck = deck; }
    };
    for (let i = i0; i <= i1; i += stride) test(i, false);
    if (stride > 1) for (let i = bi - stride; i <= bi + stride; i++) test(i, false);
    const groundBest = best, gbi = bi;
    // Bridge decks.
    let deckBest = Infinity, dbi = -1, bridge = null;
    const n = this.ys.length;
    for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
      const b = this.deckBridge[i];
      if (b < 0) continue;
      const br = this.bridges[b];
      if (br.broken || (deckOk && !deckOk(br))) continue;
      const d = i * dx - x;
      if (d * d > r2) continue;
      const cy = this.deck[i] - Math.sqrt(r2 - d * d);
      if (cy < deckBest) { deckBest = cy; dbi = i; bridge = br; }
    }
    // A deck only holds a ball that is (nearly) above it.
    if (bridge && deckBest < groundBest && y <= deckBest + r * 0.35) {
      const slope = (bridge.y1 - bridge.y0) / (bridge.x1 - bridge.x0);
      const l = Math.hypot(slope, 1);
      return { y: deckBest, nx: slope / l, ny: -1 / l, bridge, px: dbi * dx, py: this.deck[dbi] };
    }
    // Refine the contact between samples so the normal does not jitter.
    let px = gbi * dx, py = this.sample(gbi), cy = groundBest;
    for (let k = -4; k <= 4; k++) {
      const xq = gbi * dx + (k * dx) / 4, d = xq - x;
      if (d * d > r2) continue;
      const gy = this.groundY(xq);
      const c = gy - Math.sqrt(r2 - d * d);
      if (c < cy) { cy = c; px = xq; py = gy; }
    }
    let nx = x - px, ny = cy - py;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    // On smooth ground use the true surface normal; keep the geometric one
    // at sharp edges (a kicker lip, a gully rim).
    const sl = this.slopeAt(px);
    const ls = Math.hypot(sl, 1);
    const sx = sl / ls, sy = -1 / ls;
    if (nx * sx + ny * sy > 0.96) { nx = sx; ny = sy; }
    if (ny > -0.2) { ny = -0.2; const m = Math.hypot(nx, ny); nx /= m; ny /= m; }
    return { y: cy, nx, ny, bridge: null, px, py };
  }

  // Mark snow under a ball rolled from xa to xb as packed; returns the
  // weighted length of fresh snow consumed.
  consume(xa, xb) {
    if (xb < xa) [xa, xb] = [xb, xa];
    const dx = this.dx;
    const i0 = Math.max(0, Math.ceil(xa / dx)), i1 = Math.min(this.ys.length - 1, Math.floor(xb / dx));
    let total = 0;
    for (let i = i0; i <= i1; i++) {
      if (this.fresh[i]) { total += SNOW_GROWTH[this.snow[i]] * dx; this.fresh[i] = 0; }
    }
    return total;
  }

  snowAt(x) {
    const i = Math.max(0, Math.min(this.ys.length - 1, Math.round(x / this.dx)));
    return this.snow[i];
  }
}

// Build a whole slope from a level definition.
export function buildTerrain(level) {
  const t = new Terrain({ dx: level.dx, seed: level.seed, startGrade: level.segments[0].grade ?? 0.25 });
  if (level.resolve) t.resolve = level.resolve;
  if (level.airLift) t.airLift = level.airLift;
  for (const seg of level.segments) t.addSegment(seg);
  return t;
}
