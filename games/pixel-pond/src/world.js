// The falling-sand garden: a deterministic cellular automaton. DOM-free.
//
// Each cell has a type plus three bytes: `a` (wetness, energy or life),
// `b` (plant kind and colour, fish direction, firefly phase) and `tone` (a
// pixel shade). `clock` stamps a cell when it moves so it moves at most once
// a step. All randomness comes from the world's own xorshift state, so the
// same seed and the same paint calls always give the same garden.
import {
  EMPTY, SAND, WATER, SOIL, SEED, STONE, LAVA, STEAM, OBSIDIAN, FIRE, STEM, LEAF, FLOWER, WOOD,
  ACORN, ICE, MOSS, FISH, FIREFLY, TIP, TYPE_COUNT,
  K_FLOWER, K_GRASS, K_VINE, K_TREE, K_BRANCH, K_CROWN, FLOWER_COLOURS,
  WET_MAX, WET_SPROUT, STATIC, BURN_LIFE, SUPPORT, SURFACE, GROUND,
} from './elements.js';

export const STEP = 1 / 60;
export const DAY_STEPS = 14400; // one day and night: four minutes of play
export const DUSK = 0.6;
export const NIGHT_START = 0.64;
export const NIGHT_END = 0.94;
export const MORNING = 0.03;
const DISPERSE = 4; // how far water may slide sideways in one step
const GROW_P = 0.07; // chance a growing tip grows on a step
const U32 = 4294967296;

export const isNight = (t) => t >= NIGHT_START && t < NIGHT_END;

// 0 by day, 1 at night, easing through dusk and dawn.
export function nightAmount(t) {
  const ease = (v) => v * v * (3 - 2 * v);
  if (t < 0.55) return 0;
  if (t < 0.66) return ease((t - 0.55) / 0.11);
  if (t < 0.92) return 1;
  if (t < 0.99) return 1 - ease((t - 0.92) / 0.07);
  return 0;
}

// Neighbour offsets for random picks: 4 orthogonal, then 4 diagonal.
const NX = [0, 0, -1, 1, -1, 1, -1, 1];
const NY = [-1, 1, 0, 0, -1, -1, 1, 1];

function emptyStats() {
  return { sprouted: 0, bloomed: 0, rain: 0, melted: 0, steam: 0, obsidian: 0, burned: 0, painted: 0 };
}

export class World {
  constructor(w, h, seed = 1) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    this.type = new Uint8Array(this.n);
    this.a = new Uint8Array(this.n);
    this.b = new Uint8Array(this.n);
    this.tone = new Uint8Array(this.n);
    this.clock = new Uint16Array(this.n);
    this.seed = (seed >>> 0) || 0x9e3779b9;
    this.tick = 0;
    this.stamp = 1;
    this.time = MORNING;
    this.warp = null; // { to, speed } while the sky hurries to dusk or morning
    this.autoFireflies = false;
    this.stats = emptyStats();
    // Per-frame event counts for sound and sparkles; the page reads and
    // clears them (the renderer never does).
    this.fx = { flow: 0, lava: 0, hiss: 0, sprout: 0, bloom: 0, rain: 0, burn: 0, splash: 0 };
    this.pops = []; // recent { x, y, kind } moments worth a sparkle
    this.markers = []; // goal guides in grid coordinates, moved by refit
    this.counts = new Uint32Array(TYPE_COUNT);
    this.wetSoil = 0;
    this.vineCells = 0;
    this.flowerSpots = [];
  }

  // ------------------------------------------------------------ randomness

  rnd() {
    let s = this.seed;
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    this.seed = s;
    return s;
  }

  chance(p) {
    return this.rnd() < p * U32;
  }

  // ------------------------------------------------------------ cells

  idx(x, y) {
    return y * this.w + x;
  }

  at(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return STONE; // the edges are walls
    return this.type[y * this.w + x];
  }

  swap(i, j) {
    const T = this.type;
    const A = this.a;
    const B = this.b;
    const N = this.tone;
    let v = T[i]; T[i] = T[j]; T[j] = v;
    v = A[i]; A[i] = A[j]; A[j] = v;
    v = B[i]; B[i] = B[j]; B[j] = v;
    v = N[i]; N[i] = N[j]; N[j] = v;
    this.clock[i] = this.stamp;
    this.clock[j] = this.stamp;
  }

  put(i, t, a = 0, b = 0) {
    this.type[i] = t;
    this.a[i] = a;
    this.b[i] = b;
    this.tone[i] = this.rnd() & 3;
    this.clock[i] = this.stamp;
  }

  // A freshly painted element with its starting state.
  spawn(i, el) {
    switch (el) {
      case MOSS: this.put(i, MOSS, 22); break;
      case STEAM: this.put(i, STEAM, 40 + (this.rnd() % 80)); break;
      case FIRE: this.put(i, FIRE, 30); break;
      case FISH: this.put(i, FISH, 0, this.rnd() & 1); break;
      case FIREFLY: this.put(i, FIREFLY, 0, this.rnd() & 127); break;
      default: this.put(i, el);
    }
  }

  // ------------------------------------------------------------ painting

  // Fill a disc. `density` < 1 scatters (a pour); `over` is a mask of types
  // this element may replace besides empty space and steam. EMPTY erases.
  paint(cx, cy, r, el, density = 1, over = null) {
    const { w, h, type } = this;
    const r2 = r * r + r;
    let changed = 0;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= h) continue;
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        if (x < 0 || x >= w) continue;
        if (density < 1 && !this.chance(density)) continue;
        const i = y * w + x;
        const t = type[i];
        if (el === EMPTY) {
          if (t !== EMPTY) { this.put(i, EMPTY); changed++; }
        } else if (t === EMPTY || t === STEAM || (over && over[t])) {
          this.spawn(i, el);
          changed++;
        }
      }
    }
    this.stats.painted += changed;
    return changed;
  }

  // Scatter `count` single cells within radius r.
  spray(cx, cy, r, el, count, over = null) {
    let changed = 0;
    for (let k = 0; k < count; k++) {
      const dx = (this.rnd() % (2 * r + 1)) - r;
      const dy = (this.rnd() % (2 * r + 1)) - r;
      if (dx * dx + dy * dy > r * r + r) continue;
      changed += this.paint(cx + dx, cy + dy, 0, el, 1, over);
    }
    return changed;
  }

  // Stamp discs along a straight line.
  line(x0, y0, x1, y1, r, el, density = 1, over = null) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(1, r * 0.75)));
    let changed = 0;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      changed += this.paint(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), r, el, density, over);
    }
    return changed;
  }

  // One fish at a cell, into air or water.
  addFish(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const i = y * this.w + x;
    const t = this.type[i];
    if (t !== EMPTY && t !== WATER && t !== STEAM) return false;
    this.spawn(i, FISH);
    this.stats.painted++;
    return true;
  }

  clear() {
    this.type.fill(0);
    this.a.fill(0);
    this.b.fill(0);
    this.clock.fill(0);
    this.census();
  }

  // ------------------------------------------------------------ undo

  snapshot() {
    return {
      w: this.w, h: this.h,
      type: this.type.slice(), a: this.a.slice(), b: this.b.slice(), tone: this.tone.slice(),
      stats: { ...this.stats },
    };
  }

  restore(s) {
    if (!s || s.w !== this.w || s.h !== this.h) return false;
    this.type.set(s.type);
    this.a.set(s.a);
    this.b.set(s.b);
    this.tone.set(s.tone);
    this.clock.fill(0);
    this.stats = { ...emptyStats(), ...s.stats };
    this.census();
    return true;
  }

  // ------------------------------------------------------------ sky

  // Hurry the clock forward to `to` (0..1) over about a second and a half.
  skipTo(to) {
    const d = (to - this.time + 1) % 1;
    this.warp = { to, left: d, speed: Math.max(0.004, d / 90) };
  }

  advanceTime() {
    if (this.warp) {
      const step = Math.min(this.warp.left, this.warp.speed);
      this.time += step;
      this.warp.left -= step;
      if (this.warp.left <= 1e-9) { this.time = this.warp.to; this.warp = null; }
    } else {
      this.time += 1 / DAY_STEPS;
    }
    if (this.time >= 1) this.time -= 1;
  }

  // ------------------------------------------------------------ step

  step() {
    const { w, h, type, clock } = this;
    this.tick++;
    const stamp = (this.tick % 65535) + 1;
    this.stamp = stamp;
    this.advanceTime();
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w;
      const ltr = ((y + this.tick) & 1) === 0;
      let x = ltr ? 0 : w - 1;
      const dx = ltr ? 1 : -1;
      for (let k = 0; k < w; k++, x += dx) {
        const i = row + x;
        const t = type[i];
        if (STATIC[t] || clock[i] === stamp) continue;
        switch (t) {
          case SAND: case SEED: case ACORN: this.powder(x, y, i, t); break;
          case SOIL: this.soil(x, y, i); break;
          case WATER: this.water(x, y, i); break;
          case LAVA: this.lava(x, y, i); break;
          case STEAM: this.steam(x, y, i); break;
          case FIRE: this.fire(x, y, i); break;
          case TIP: this.tip(x, y, i); break;
          case MOSS: this.moss(x, y, i); break;
          case FISH: this.fish(x, y, i); break;
          case FIREFLY: this.firefly(x, y, i); break;
        }
      }
    }
    if (this.tick % 30 === 0) this.census();
    this.nightLife();
  }

  run(steps) {
    for (let s = 0; s < steps; s++) this.step();
  }

  pop(x, y, kind) {
    if (this.pops.length < 24) this.pops.push({ x, y, kind });
  }

  // ------------------------------------------------------------ powders

  powder(x, y, i, t) {
    const { w, type } = this;
    if (y < this.h - 1) {
      const d = i + w;
      const td = type[d];
      if (td === EMPTY || td === STEAM) { this.swap(i, d); return; }
      if (td === WATER && this.chance(t === SEED ? 0.12 : 0.55)) { this.swap(i, d); return; }
      const s = (this.rnd() & 1) ? 1 : -1;
      if (this.slide(x, i, d, s, t !== SEED) || this.slide(x, i, d, -s, t !== SEED)) return;
    }
    if (t !== SAND) this.germinate(x, y, i, t);
  }

  slide(x, i, d, s, sinks) {
    const nx = x + s;
    if (nx < 0 || nx >= this.w) return false;
    const j = d + s;
    const tj = this.type[j];
    if (tj === EMPTY || tj === STEAM || (sinks && tj === WATER && this.chance(0.3))) {
      this.swap(i, j);
      return true;
    }
    return false;
  }

  soil(x, y, i) {
    const { w, h, type } = this;
    if (y < h - 1) {
      const d = i + w;
      const td = type[d];
      if (td === EMPTY || td === STEAM) { this.swap(i, d); return; }
      if (td === WATER && this.chance(0.4)) { this.swap(i, d); return; }
      // Dry soil slides a little; wet soil holds its shape.
      if (this.a[i] < 3 && this.chance(0.4)) {
        const s = (this.rnd() & 1) ? 1 : -1;
        if (this.slide(x, i, d, s, false) || this.slide(x, i, d, -s, false)) return;
      }
    }
    // Wetness creeps down and sideways into drier soil.
    const wet = this.a[i];
    if (wet > 1 && this.chance(0.06)) {
      const r = this.rnd() % 3;
      let j = -1;
      if (r === 0) { if (y < h - 1) j = i + w; } else if (r === 1) { if (x > 0) j = i - 1; } else if (x < w - 1) j = i + 1;
      if (j >= 0 && type[j] === SOIL && this.a[j] < wet - 1) { this.a[j]++; this.a[i]--; }
    }
  }

  // ------------------------------------------------------------ plants

  germinate(x, y, i, t) {
    if (y >= this.h - 1) return;
    const d = i + this.w;
    if (this.type[d] !== SOIL || this.a[d] < WET_SPROUT) return;
    if (!this.chance(t === ACORN ? 0.015 : 0.025)) return;
    this.a[d]--;
    let kind;
    let energy;
    let colour;
    if (t === ACORN) {
      kind = K_TREE;
      energy = 14 + (this.rnd() % 12);
      const r = this.rnd() % 100;
      colour = r < 45 ? 0 : r < 70 ? 1 : r < 85 ? 2 : 3;
    } else if (this.supportNear(x, y)) {
      kind = K_VINE;
      energy = 30 + (this.rnd() % 30);
      colour = 0;
    } else if (this.chance(0.72)) {
      kind = K_FLOWER;
      energy = 5 + (this.rnd() % 8);
      colour = this.rnd() % FLOWER_COLOURS;
    } else {
      kind = K_GRASS;
      energy = 2 + (this.rnd() % 4);
      colour = 0;
    }
    this.put(i, TIP, energy, kind | (colour << 4));
    this.stats.sprouted++;
    this.fx.sprout++;
    this.pop(x, y, 'sprout');
  }

  // A seed this close to stone or wood grows into a climbing vine.
  supportNear(x, y) {
    for (let dy = -2; dy <= 0; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        if (SUPPORT[this.type[ny * this.w + nx]]) return true;
      }
    }
    return false;
  }

  hasSupport(x, y) {
    for (let k = 0; k < 4; k++) {
      const nx = x + NX[k];
      const ny = y + NY[k];
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      if (SUPPORT[this.type[ny * this.w + nx]]) return true;
    }
    return false;
  }

  canGrowInto(x, y, kind) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const t = this.type[y * this.w + x];
    return t === EMPTY || t === STEAM || (t === WATER && (kind === K_GRASS || kind === K_VINE));
  }

  // Move the growing tip from i to (x+dx, y+dy); i becomes `leave`.
  growTo(x, y, i, dx, dy, leave) {
    const kind = this.b[i] & 7;
    if (!this.canGrowInto(x + dx, y + dy, kind)) return false;
    const j = (y + dy) * this.w + x + dx;
    this.put(j, TIP, this.a[i] - 1, this.b[i]);
    this.type[i] = leave;
    this.a[i] = 0;
    return true;
  }

  // A new tip of `kind` at (x, y), if there is room.
  bud(x, y, kind, energy, colour, dir = 0) {
    if (!this.canGrowInto(x, y, kind)) return false;
    this.put(y * this.w + x, TIP, energy, kind | (dir << 3) | (colour << 4));
    return true;
  }

  leafAt(x, y, b) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const j = y * this.w + x;
    if (this.type[j] === EMPTY) this.put(j, LEAF, 0, b);
  }

  petalAt(x, y, b) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const j = y * this.w + x;
    const t = this.type[j];
    if (t === EMPTY || t === STEAM || (t === LEAF && (this.b[j] & 7) === K_FLOWER)) this.put(j, FLOWER, 0, b);
  }

  tip(x, y, i) {
    if (!this.chance(GROW_P)) return;
    const B = this.b[i];
    const kind = B & 7;
    const colour = B >> 4;
    const energy = this.a[i];
    if (energy === 0) { this.finishTip(x, y, i, kind, B); return; }
    switch (kind) {
      case K_FLOWER:
      case K_GRASS: {
        const dx = kind === K_FLOWER && this.chance(0.18) ? ((this.rnd() & 1) ? 1 : -1) : 0;
        if (this.growTo(x, y, i, dx, -1, STEM) || (dx && this.growTo(x, y, i, 0, -1, STEM))) {
          if (kind === K_FLOWER && energy > 2 && this.chance(0.3)) this.leafAt(x + ((this.rnd() & 1) ? 1 : -1), y, K_FLOWER);
        } else this.finishTip(x, y, i, kind, B);
        break;
      }
      case K_VINE: {
        if (!this.growVine(x, y, i)) this.finishTip(x, y, i, kind, B);
        else if (this.chance(0.35)) this.leafAt(x + ((this.rnd() & 1) ? 1 : -1), y, K_VINE);
        break;
      }
      case K_TREE: {
        const s = (this.rnd() & 1) ? 1 : -1;
        if (energy % 6 === 3 && energy > 4) this.bud(x + s, y - 1, K_BRANCH, 2 + (this.rnd() % 4), colour, s > 0 ? 1 : 0);
        if (this.growTo(x, y, i, 0, -1, WOOD) || this.growTo(x, y, i, s, -1, WOOD)) {
          // The lower trunk is two cells thick.
          if (energy >= 10 && x + 1 < this.w && this.type[i + 1] === EMPTY) this.put(i + 1, WOOD, 0, K_TREE);
        } else this.finishTip(x, y, i, kind, B);
        break;
      }
      case K_BRANCH: {
        const s = (B & 8) ? 1 : -1;
        const out = this.chance(0.6);
        if (!(this.growTo(x, y, i, out ? s : 0, -1, WOOD) || this.growTo(x, y, i, s, 0, WOOD))) this.finishTip(x, y, i, kind, B);
        break;
      }
      case K_CROWN: {
        // The canopy spreads like a soft flood: each tip buds into most of
        // its open neighbours, one ring smaller, then settles as a leaf.
        for (let k = 0; k < 8; k++) {
          if (this.chance(k < 4 ? 0.7 : 0.4)) this.bud(x + NX[k], y + NY[k], K_CROWN, energy - 1, colour);
        }
        this.finishTip(x, y, i, kind, B);
        break;
      }
      default:
        this.type[i] = STEM;
    }
  }

  // Vines prefer to climb along stone and wood; with nothing to hold they
  // reach upward.
  growVine(x, y, i) {
    let best = -1;
    let bestScore = -1;
    const dxs = [0, -1, 1, -1, 1];
    const dys = [-1, -1, -1, 0, 0];
    for (let k = 0; k < 5; k++) {
      const nx = x + dxs[k];
      const ny = y + dys[k];
      if (!this.canGrowInto(nx, ny, K_VINE)) continue;
      let score = this.hasSupport(nx, ny) ? 4 : 0;
      if (dys[k] < 0) score += 1;
      if (dys[k] === 0 && score < 4) continue; // never crawl sideways in mid-air
      score += (this.rnd() & 3) / 8;
      if (score > bestScore) { bestScore = score; best = k; }
    }
    if (best < 0) return false;
    // Bit 3 marks a vine reaching into open air; it soon gives up there.
    const loose = bestScore < 4;
    if (loose && (this.b[i] & 8) && this.chance(0.5)) return false;
    this.b[i] = loose ? this.b[i] | 8 : this.b[i] & ~8;
    return this.growTo(x, y, i, dxs[best], dys[best], STEM);
  }

  finishTip(x, y, i, kind, B) {
    const colour = B >> 4;
    switch (kind) {
      case K_FLOWER: {
        this.type[i] = FLOWER;
        this.a[i] = 0;
        this.b[i] = K_FLOWER | 8 | (colour << 4);
        const petal = K_FLOWER | (colour << 4);
        this.petalAt(x, y - 1, petal);
        this.petalAt(x - 1, y, petal);
        this.petalAt(x + 1, y, petal);
        this.stats.bloomed++;
        this.fx.bloom++;
        this.pop(x, y, 'bloom');
        break;
      }
      case K_TREE: {
        this.type[i] = WOOD;
        this.a[i] = 0;
        const size = 4 + (this.rnd() % 3);
        this.put(i, TIP, size, K_CROWN | (colour << 4)); // the top of the trunk becomes the canopy's heart
        this.pop(x, y, 'tree');
        break;
      }
      case K_BRANCH: {
        this.type[i] = WOOD;
        this.a[i] = 0;
        for (let k = 0; k < 4; k++) this.bud(x + NX[k], y + NY[k], K_CROWN, 2 + (this.rnd() % 2), colour);
        break;
      }
      case K_CROWN:
        this.type[i] = LEAF;
        this.a[i] = 0;
        break;
      default:
        this.type[i] = STEM;
        this.a[i] = 0;
    }
  }

  // ------------------------------------------------------------ liquids

  water(x, y, i) {
    const { w, h, type } = this;
    const s = (this.rnd() & 1) ? 1 : -1;
    if (y < h - 1) {
      const d = i + w;
      const td = type[d];
      if (td === EMPTY || td === STEAM) { this.swap(i, d); this.fx.flow++; return; }
      if (td === SOIL && this.a[d] < WET_MAX && this.chance(0.08)) { this.soak(i, d); return; }
      for (let k = 0; k < 2; k++) {
        const ds = k ? -s : s;
        const nx = x + ds;
        if (nx < 0 || nx >= w) continue;
        const j = d + ds;
        const tj = type[j];
        if (tj === EMPTY || tj === STEAM) { this.swap(i, j); this.fx.flow++; return; }
      }
    }
    if (this.spread(x, y, i, s) || this.spread(x, y, i, -s)) return;
    // Resting beside soil: soak in slowly.
    if (this.chance(0.03)) {
      const nx = x + s;
      if (nx >= 0 && nx < w && type[i + s] === SOIL && this.a[i + s] < WET_MAX) this.soak(i, i + s);
    }
  }

  soak(i, j) {
    this.a[j] = Math.min(WET_MAX, this.a[j] + 4);
    this.put(i, EMPTY);
  }

  spread(x, y, i, s) {
    const { w, h, type } = this;
    let best = -1;
    for (let k = 1; k <= DISPERSE; k++) {
      const nx = x + s * k;
      if (nx < 0 || nx >= w) break;
      const j = i + s * k;
      const tj = type[j];
      if (tj !== EMPTY && tj !== STEAM) break;
      best = j;
      if (y < h - 1) {
        const tb = type[j + w];
        if (tb === EMPTY || tb === STEAM) break; // spill over the edge here
      }
    }
    if (best < 0) return false;
    this.swap(i, best);
    return true;
  }

  countAround(x, y, t) {
    let n = 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + NX[k];
      const ny = y + NY[k];
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      if (this.type[ny * this.w + nx] === t) n++;
    }
    return n;
  }

  lava(x, y, i) {
    const { w, h, type } = this;
    // Lava is heavy: it plunges into water before it has time to cool.
    if (y < h - 1 && type[i + w] === WATER && this.chance(0.5)) { this.swap(i, i + w); return; }
    if (this.chance(0.5)) {
      const k = this.rnd() & 3;
      const nx = x + NX[k];
      const ny = y + NY[k];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
        const j = ny * w + nx;
        const tj = type[j];
        if (tj === WATER) {
          if (this.chance(0.6)) { this.cool(x, y, i, j); return; }
        } else if (tj === ICE) {
          if (this.chance(0.25)) {
            this.put(j, WATER);
            this.stats.melted++;
            this.fx.hiss++;
            if (this.chance(0.2)) { this.put(i, STONE); return; }
          }
        } else if (BURN_LIFE[tj]) {
          if (this.chance(0.4)) this.ignite(j, tj);
        } else if (tj === SOIL) {
          this.a[j] = 0;
        }
      }
    }
    if (!this.chance(0.35)) return;
    if (y < h - 1) {
      const d = i + w;
      const td = type[d];
      if (td === EMPTY || td === STEAM) { this.swap(i, d); this.fx.lava++; return; }
      const s = (this.rnd() & 1) ? 1 : -1;
      for (let k = 0; k < 2; k++) {
        const ds = k ? -s : s;
        const nx = x + ds;
        if (nx < 0 || nx >= w) continue;
        const j = d + ds;
        if (type[j] === EMPTY || type[j] === STEAM) { this.swap(i, j); this.fx.lava++; return; }
      }
    }
    const s = (this.rnd() & 1) ? 1 : -1;
    for (let k = 0; k < 2; k++) {
      const ds = k ? -s : s;
      const nx = x + ds;
      if (nx < 0 || nx >= w) continue;
      if (type[i + ds] === EMPTY || type[i + ds] === STEAM) { this.swap(i, i + ds); return; }
    }
  }

  // Lava meets water: the water boils away and the lava sets hard, into
  // obsidian when it is deep in water, otherwise into stone.
  // A shallow touch boils the water and only sometimes crusts the lava over,
  // so a lava pool keeps steaming for a while.
  cool(x, y, i, j) {
    const deep = this.countAround(x, y, WATER) >= 4;
    if (deep) {
      this.put(i, OBSIDIAN);
      this.stats.obsidian++;
      this.pop(x, y, 'obsidian');
    } else if (this.chance(0.3)) {
      this.put(i, STONE);
    }
    this.put(j, STEAM, 40 + (this.rnd() % 80));
    this.stats.steam++;
    this.fx.hiss++;
  }

  ignite(j, t) {
    this.put(j, FIRE, BURN_LIFE[t] + (this.rnd() % 10));
    this.fx.burn++;
  }

  // ------------------------------------------------------------ gases and fire

  steam(x, y, i) {
    const { w, type } = this;
    const life = this.a[i];
    if (life === 0) { this.condense(x, y, i); return; }
    this.a[i] = life - 1;
    if (!this.chance(0.7)) return;
    const s = (this.rnd() & 1) ? 1 : -1;
    if (y > 0) {
      const u = i - w;
      const tu = type[u];
      if (tu === EMPTY) { this.swap(i, u); return; }
      if (tu === WATER && this.chance(0.5)) { this.swap(i, u); return; } // bubbles rise
      for (let k = 0; k < 2; k++) {
        const ds = k ? -s : s;
        const nx = x + ds;
        if (nx < 0 || nx >= w) continue;
        if (type[u + ds] === EMPTY) { this.swap(i, u + ds); return; }
      }
    }
    const nx = x + s;
    if (nx >= 0 && nx < w && type[i + s] === EMPTY && this.chance(0.5)) { this.swap(i, i + s); return; }
    // Stuck under the sky or a ceiling: cool off sooner.
    if (this.chance(y === 0 ? 0.06 : 0.02)) this.condense(x, y, i);
  }

  condense(x, y, i) {
    this.type[i] = WATER;
    this.a[i] = 0;
    this.b[i] = 0;
    this.stats.rain++;
    this.fx.rain++;
  }

  fire(x, y, i) {
    const { w, h, type } = this;
    const life = this.a[i];
    if (life <= 1) { this.put(i, EMPTY); this.stats.burned++; return; }
    this.a[i] = life - 1;
    if (!this.chance(0.45)) return;
    const k = this.rnd() & 7;
    const nx = x + NX[k];
    const ny = y + NY[k];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
    const j = ny * w + nx;
    const tj = type[j];
    if (BURN_LIFE[tj]) {
      if (this.chance(tj === WOOD ? 0.25 : 0.6)) this.ignite(j, tj);
    } else if (tj === WATER) {
      this.put(i, EMPTY);
      this.put(j, STEAM, 30 + (this.rnd() % 40));
      this.fx.hiss++;
    } else if (tj === ICE && this.chance(0.3)) {
      this.put(j, WATER);
      this.stats.melted++;
    }
  }

  // ------------------------------------------------------------ moss

  moss(x, y, i) {
    const e = this.a[i];
    if (e === 0 || !this.chance(0.25)) return;
    const k = this.rnd() & 7; // diagonals too, so moss follows curved walls
    const nx = x + NX[k];
    const ny = y + NY[k];
    if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) return;
    const j = ny * this.w + nx;
    if (this.type[j] !== EMPTY || !this.touchesSurface(nx, ny)) return;
    this.put(j, MOSS, e - 1);
  }

  touchesSurface(x, y) {
    for (let k = 0; k < 4; k++) {
      const nx = x + NX[k];
      const ny = y + NY[k];
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      if (SURFACE[this.type[ny * this.w + nx]]) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ critters

  fish(x, y, i) {
    const { w, h, type } = this;
    const below = y < h - 1 ? type[i + w] : STONE;
    if (below === EMPTY || below === STEAM) { this.swap(i, i + w); return; }
    const inWater = below === WATER || (y > 0 && type[i - w] === WATER)
      || (x > 0 && type[i - 1] === WATER) || (x < w - 1 && type[i + 1] === WATER);
    const s = (this.b[i] & 1) ? 1 : -1;
    if (!inWater) {
      // Out of water a fish flops about, downhill first, until it finds a pond.
      if (!this.chance(0.06)) return;
      for (const dy of [1, 0, -1]) {
        const nx = x + s;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (type[j] === EMPTY || type[j] === WATER) {
          this.swap(i, j);
          if (type[j] === FISH && this.chance(0.3)) this.b[j] ^= 1;
          this.fx.splash++;
          return;
        }
      }
      this.b[i] ^= 1;
      return;
    }
    if (!this.chance(0.3)) return;
    if (this.chance(0.15)) {
      const dy = (this.rnd() & 1) ? 1 : -1;
      const ny = y + dy;
      // Stay under the surface: only swim up into water with water above it.
      if (ny >= 0 && ny < h && type[i + dy * w] === WATER && (dy > 0 || (ny > 0 && type[i - 2 * w] === WATER))) {
        this.swap(i, i + dy * w);
      }
      return;
    }
    const nx = x + s;
    if (nx >= 0 && nx < w && type[i + s] === WATER) {
      this.swap(i, i + s);
      if (this.chance(0.02)) this.b[i + s] ^= 1;
    } else {
      this.b[i] ^= 1;
    }
  }

  firefly(x, y, i) {
    const { w, h, type } = this;
    // Visiting fireflies drift away in the morning; painted ones stay.
    if ((this.b[i] & 128) && !isNight(this.time) && this.time < 0.5 && this.chance(0.01)) { this.put(i, EMPTY); return; }
    if (!this.chance(0.3)) return;
    let dx = (this.rnd() % 3) - 1;
    let dy = (this.rnd() % 3) - 1;
    if (y < 3) dy = 1;
    else if (dy < 0 && this.airBelow(x, y, 16)) dy = 1; // hover low, near the plants
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
    const j = ny * w + nx;
    if (type[j] === EMPTY) this.swap(i, j);
  }

  airBelow(x, y, n) {
    for (let k = 1; k <= n; k++) {
      if (y + k >= this.h) return false;
      if (this.type[(y + k) * this.w + x] !== EMPTY) return false;
    }
    return true;
  }

  // At night, fireflies come to visit the flowers once they are unlocked.
  nightLife() {
    if (!this.autoFireflies || !isNight(this.time) || this.tick % 90 !== 0) return;
    if (this.counts[FIREFLY] >= 14 || !this.flowerSpots.length) return;
    const spot = this.flowerSpots[this.rnd() % this.flowerSpots.length];
    const x = spot % this.w;
    const y0 = Math.floor(spot / this.w);
    for (let k = 2; k <= 7; k++) {
      const y = y0 - k;
      if (y < 0) break;
      const j = y * this.w + x;
      if (this.type[j] === EMPTY) {
        this.put(j, FIREFLY, 0, 128 | (this.rnd() & 127));
        this.counts[FIREFLY]++;
        return;
      }
    }
  }

  // ------------------------------------------------------------ census

  census() {
    const c = this.counts;
    c.fill(0);
    const { type, a, b, n } = this;
    let wet = 0;
    let vine = 0;
    const spots = (this.flowerSpots = []);
    let seen = 0;
    for (let i = 0; i < n; i++) {
      const t = type[i];
      c[t]++;
      if (t === SOIL) { if (a[i] >= 3) wet++; } else if ((t === STEM || t === TIP) && (b[i] & 7) === K_VINE) vine++;
      else if (t === FLOWER) {
        seen++;
        if (spots.length < 48) spots.push(i);
        else if (this.rnd() % seen < 48) spots[this.rnd() % 48] = i;
      }
    }
    this.wetSoil = wet;
    this.vineCells = vine;
  }

  // FNV-1a over the cell state, for determinism checks.
  hash() {
    let hsh = 0x811c9dc5;
    for (const arr of [this.type, this.a, this.b]) {
      for (let i = 0; i < arr.length; i++) hsh = Math.imul(hsh ^ arr[i], 16777619) >>> 0;
    }
    return hsh;
  }
}

// Copy a garden onto a grid of a new shape (a resize or a rotation). Cells
// keep their size, anchored to the bottom and centred; ground at the old
// side edges extends into new width. Plain stone and soil may be cropped at
// the sides, but anything else (water, plants, sand, critters) stays on
// screen: the garden is scaled down evenly only when that would not fit.
// So turning a phone sideways and back gives the same garden. Goal markers
// move with the content.
export function refit(old, nw, nh) {
  const world = new World(nw, nh, old.seed);
  world.tick = old.tick;
  world.time = old.time;
  world.warp = old.warp ? { ...old.warp } : null;
  world.autoFireflies = old.autoFireflies;
  world.stats = { ...old.stats };
  const { w: ow, h: oh, type } = old;
  let minY = oh;
  let minX = ow;
  let maxX = -1;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const t = type[y * ow + x];
      if (t === EMPTY) continue;
      if (y < minY) minY = y;
      if (t === STONE || t === SOIL) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  for (const m of old.markers) {
    for (const k of ['x', 'x0', 'x1']) {
      if (m[k] === undefined) continue;
      minX = Math.min(minX, m[k]);
      maxX = Math.max(maxX, m[k]);
    }
  }
  const ch = oh - minY;
  const cw = maxX - minX + 1;
  const f = Math.min(1, ch > 0 ? nh / ch : 1, maxX < 0 ? 1 : nw / cw);
  const cOld = (ow - 1) / 2;
  let cNew = (nw - 1) / 2;
  if (maxX >= 0) {
    const lo = (minX - cOld) * f + cNew;
    const hi = (maxX - cOld) * f + cNew;
    if (lo < 0) cNew -= lo;
    else if (hi > nw - 1) cNew -= hi - (nw - 1);
  }
  const toX = (x) => (x - cOld) * f + cNew;
  const toY = (y) => (nh - 1) - (oh - 1 - y) * f;
  for (let ny = 0; ny < nh; ny++) {
    const oy = Math.round((oh - 1) - (nh - 1 - ny) / f);
    if (oy < 0 || oy >= oh) continue;
    for (let nx = 0; nx < nw; nx++) {
      let ox = Math.round(cOld + (nx - cNew) / f);
      let edge = false;
      if (ox < 0) { ox = 0; edge = true; } else if (ox >= ow) { ox = ow - 1; edge = true; }
      const oi = oy * ow + ox;
      const t = type[oi];
      if (t === EMPTY || (edge && !GROUND[t])) continue;
      const ni = ny * nw + nx;
      world.type[ni] = t;
      world.a[ni] = old.a[oi];
      world.b[ni] = old.b[oi];
      // Extended ground gets its own grain instead of copying the edge.
      world.tone[ni] = edge ? (Math.imul(ni, 2654435761) >>> 30) : old.tone[oi];
    }
  }
  world.markers = old.markers.map((m) => {
    const out = { ...m };
    for (const k of ['x', 'x0', 'x1']) if (m[k] !== undefined) out[k] = Math.round(toX(m[k]));
    for (const k of ['y', 'y0', 'y1', 'base']) if (m[k] !== undefined) out[k] = Math.round(toY(m[k]));
    return out;
  });
  world.census();
  return { world, f, toX, toY };
}
