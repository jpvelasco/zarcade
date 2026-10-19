// Canvas renderer for Riverlight. Reads game state, never changes it.
//
// Static art (paper washes, stone slots, decorations, tile faces and their
// channel beds, flowers, koi, glows) is baked into offscreen canvases when a
// garden is laid out. Each frame draws those sprites plus water strokes and a
// capped handful of particles: no shadowBlur, no filters, no per-frame
// gradients.
import { dirAngle, popcount, bounds, cellAt, HEX_R } from './topology.js';

export const THEMES = {
  spring: {
    paper: '#f4f1df', wash: ['#cfe8b8', '#f6d6dc', '#d6ecc0', '#fbe8c4'], ground: '#c2dca2', groundEdge: '#a8c886',
    stone: '#fbf7ea', stoneShade: '#e7dfc3', stoneEdge: '#bdb38f', bed: '#a8916a', bedInner: '#d3be93',
    petals: ['#f59bb8', '#fbcf5e', '#fff7f0', '#c5a3f0', '#ff9f80'], target: 'flower', decor: 'meadow', ink: '#3d4a3a',
    particle: 'petal', particleColors: ['#f8b7cb', '#fff3f6', '#fbd77a'],
  },
  summer: {
    paper: '#e9f5ef', wash: ['#a9dccf', '#cdeee2', '#bfe3f0', '#f6ebbe'], ground: '#9fd5c7', groundEdge: '#7fbfb0',
    stone: '#f8f5e7', stoneShade: '#e1dcc4', stoneEdge: '#a9ab8e', bed: '#8f8a68', bedInner: '#cbc49b',
    petals: ['#ff9fc4', '#ffc0d8', '#ffffff', '#ffb3a1'], target: 'lotus', decor: 'pond', ink: '#24474a',
    particle: 'glint', particleColors: ['#ffffff', '#fff6c8'],
  },
  autumn: {
    paper: '#f8efdc', wash: ['#f2c68f', '#eaa77f', '#f7dca9', '#dcb88c'], ground: '#ddb680', groundEdge: '#c69a63',
    stone: '#fbf3e3', stoneShade: '#ead8bb', stoneEdge: '#b49c78', bed: '#98724b', bedInner: '#cfb087',
    petals: ['#ef8a4f', '#f6c04a', '#d9603a', '#f7a3a3'], target: 'flower', decor: 'grove', ink: '#4b3524',
    particle: 'leaf', particleColors: ['#e3763f', '#f2b33d', '#c9532c', '#d9893a'],
  },
  winter: {
    paper: '#eef3f8', wash: ['#d5e2f0', '#e3ecf7', '#c9d9ec', '#f1f4fb'], ground: '#cbdaeb', groundEdge: '#adc2dc',
    stone: '#fbfdff', stoneShade: '#dfe7f1', stoneEdge: '#9eb0c6', bed: '#8197b3', bedInner: '#c2d0e2',
    petals: ['#ffffff', '#cfe3ff', '#e9dcff', '#bfe9ff'], target: 'flower', decor: 'snow', ink: '#2a3d55',
    particle: 'snow', particleColors: ['#ffffff'],
  },
  night: {
    paper: '#1b2140', wash: ['#2a3363', '#33285a', '#1f3a5c', '#3b2f62'], ground: '#262e58', groundEdge: '#1a2046',
    stone: '#434b7d', stoneShade: '#353c69', stoneEdge: '#232955', bed: '#1f2448', bedInner: '#5a639b',
    petals: ['#ffd27a'], target: 'lantern', decor: 'night', ink: '#eef0ff', dark: true,
    particle: 'firefly', particleColors: ['#fff2a8', '#d9ff9c'],
  },
  lotus: {
    paper: '#f6edf3', wash: ['#e7cde6', '#f6d9e4', '#d4e4f2', '#f0e3cb'], ground: '#c9dcea', groundEdge: '#a9c3d9',
    stone: '#fcf6f3', stoneShade: '#eadbdd', stoneEdge: '#b5a1b0', bed: '#9a8397', bedInner: '#d3bfcd',
    petals: ['#f7a8cf', '#ffd0e6', '#ffffff', '#e8b3ff'], target: 'lotus', decor: 'lagoon', ink: '#4a3150',
    particle: 'petal', particleColors: ['#ffc3dd', '#ffe6f1', '#f7a8cf'],
  },
};
export const THEME_ORDER = ['spring', 'summer', 'autumn', 'winter', 'night', 'lotus'];

const WATER = {
  1: { core: '#4fb2ec', glow: '#a6dcfa' },
  2: { core: '#f2bb3c', glow: '#ffe39a' },
  3: { core: '#5fcf7c', glow: '#b6f0b4' },
};
const NEED_COLORS = { b: '#5ab6f0', y: '#f5c24a', g: '#62cf7f' };
const PAIR_COLORS = ['#6aa8ff', '#ff8fb1', '#7fd8a6', '#c49bff', '#ffb36a', '#5fd3e0'];

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

const portXY = (n, d, r = 0.5) => {
  const a = dirAngle(n, d);
  return [Math.cos(a) * r, Math.sin(a) * r];
};

function stonePath(ctx, n, inset = 1) {
  ctx.beginPath();
  if (n === 4) {
    const h = 0.455 * inset;
    const r = 0.13;
    ctx.roundRect(-h, -h, h * 2, h * 2, r);
  } else {
    const R = HEX_R * 0.95 * inset;
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
}

// Channel path in unit space for a mask (one channel).
const pathCache = new Map();
function channelPath(n, mask) {
  const key = `${n}:${mask}`;
  let p = pathCache.get(key);
  if (p) return p;
  p = new Path2D();
  const ports = [];
  for (let d = 0; d < n; d++) if (mask & (1 << d)) ports.push(d);
  const reach = 0.5;
  if (ports.length === 1) {
    const [x, y] = portXY(n, ports[0], reach);
    p.moveTo(x, y);
    p.lineTo(0, 0);
  } else if (ports.length === 2) {
    const [x0, y0] = portXY(n, ports[0], reach);
    const [x1, y1] = portXY(n, ports[1], reach);
    p.moveTo(x0, y0);
    p.quadraticCurveTo(0, 0, x1, y1);
  } else {
    for (const d of ports) {
      const [x, y] = portXY(n, d, reach);
      p.moveTo(x, y);
      p.lineTo(0, 0);
    }
  }
  pathCache.set(key, p);
  return p;
}

// Axis masks of a bridge in its own (unrotated) frame.
function bridgeAxes(n, mask) {
  const half = n / 2;
  const axes = [];
  for (let a = 0; a < half; a++) if (mask & (1 << a) && mask & (1 << (a + half))) axes.push(a);
  return axes;
}

// Gate chevrons from entry to exit.
function gatePath(n, mask, inDir) {
  const key = `g${n}:${mask}:${inDir}`;
  let p = pathCache.get(key);
  if (p) return p;
  p = new Path2D();
  let out = 0;
  for (let d = 0; d < n; d++) if (mask & (1 << d) && d !== inDir) out = d;
  const [ix, iy] = portXY(n, inDir, 0.5);
  const [ox, oy] = portXY(n, out, 0.5);
  const at = (t) => {
    const u = 1 - t;
    return [u * u * ix + t * t * ox, u * u * iy + t * t * oy];
  };
  for (const t of [0.3, 0.62]) {
    const [x, y] = at(t);
    const [x2, y2] = at(t + 0.02);
    const a = Math.atan2(y2 - y, x2 - x);
    const s = 0.1;
    p.moveTo(x - Math.cos(a - 0.9) * s, y - Math.sin(a - 0.9) * s);
    p.lineTo(x, y);
    p.lineTo(x - Math.cos(a + 0.9) * s, y - Math.sin(a + 0.9) * s);
  }
  pathCache.set(key, p);
  return p;
}

const easeOutBack = (t) => {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

export class View {
  constructor(canvas, { reduceMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduceMotion = reduceMotion;
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.insets = { top: 0, bottom: 0, left: 0, right: 0 };
    this.game = null;
    this.theme = THEMES.spring;
    this.themeKey = 'spring';
    this.time = 0;
    this.cursor = -1;
    this.showCursor = false;
    this.hover = -1;
    this.hint = null;
    this.photo = false;
    this.dim = 0;
    this.sprites = new Map();
    this.particles = [];
    this.fireflies = [];
    this.koi = [];
    this.celebrateAt = -1;
    this.bg = null;
  }

  setGame(game, themeKey) {
    this.game = game;
    this.themeKey = themeKey;
    this.theme = THEMES[themeKey] || THEMES.spring;
    const count = game.topo.count;
    this.turns = Float64Array.from(game.rots);
    this.angle = Float64Array.from(game.rots);
    this.wetAnim = new Float32Array(count);
    this.wetDelay = new Float32Array(count);
    this.bloom = new Float32Array(count);
    this.pulse = new Float32Array(count);
    this.prevWet = new Uint8Array(count);
    this.cursor = -1;
    this.hint = null;
    this.hover = -1;
    this.particles.length = 0;
    this.fireflies.length = 0;
    this.koi.length = 0;
    this.celebrateAt = -1;
    this.sprites.clear();
    this.layout();
    this.syncFlow(true);
    if (game.solved) this.celebrate(true);
  }

  resize(cssW, cssH, insets = this.insets) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const same = cssW === this.cssW && cssH === this.cssH && dpr === this.dpr &&
      ['top', 'bottom', 'left', 'right'].every((k) => insets[k] === this.insets[k]);
    if (same && this.bg) return;
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.insets = insets;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    if (this.game) {
      this.sprites.clear();
      this.layout();
    }
  }

  layout() {
    const topo = this.game.topo;
    const b = bounds(topo);
    this.box = b;
    const pad = topo.wrap ? 0.55 : 0.4;
    const availW = this.cssW - this.insets.left - this.insets.right - 16;
    const availH = this.cssH - this.insets.top - this.insets.bottom - 16;
    this.scale = clamp(Math.min(availW / (b.w + pad * 2), availH / (b.h + pad * 2)), 18, 118);
    const cx = this.insets.left + 8 + availW / 2;
    const cy = this.insets.top + 8 + availH / 2;
    this.ox = cx - (b.x0 + b.w / 2) * this.scale;
    this.oy = cy - (b.y0 + b.h / 2) * this.scale;
    this.bakeBackground();
  }

  // Screen (CSS px) position of a cell centre.
  cellX(i) {
    return this.ox + this.game.topo.cx[i] * this.scale;
  }
  cellY(i) {
    return this.oy + this.game.topo.cy[i] * this.scale;
  }

  cellAtClient(x, y) {
    if (!this.game) return -1;
    return cellAt(this.game.topo, (x - this.ox) / this.scale, (y - this.oy) / this.scale);
  }

  // After every game action: catch the drawn rotations up and stage water.
  sync() {
    const g = this.game;
    const n = g.n;
    for (let i = 0; i < g.topo.count; i++) {
      if (!g.puzzle.tiles[i]) continue;
      let delta = (((g.rots[i] - this.turns[i]) % n) + n) % n;
      if (delta > n / 2) delta -= n;
      if (delta) {
        this.turns[i] += delta;
        this.pulse[i] = 1;
        if (this.reduceMotion) this.angle[i] = this.turns[i];
      }
    }
    this.syncFlow(false);
  }

  syncFlow(instant) {
    const flow = this.game.flow;
    const count = this.game.topo.count;
    let d0 = Infinity;
    for (let i = 0; i < count; i++) {
      const wet = flow.depth[i] >= 0 ? 1 : 0;
      if (wet && !this.prevWet[i]) d0 = Math.min(d0, flow.depth[i]);
    }
    for (let i = 0; i < count; i++) {
      const wet = flow.depth[i] >= 0 ? 1 : 0;
      if (wet && !this.prevWet[i]) this.wetDelay[i] = instant || this.reduceMotion ? 0 : (flow.depth[i] - d0) * 0.055;
      if (instant) this.wetAnim[i] = wet;
      this.prevWet[i] = wet;
    }
    if (instant) for (const f of flow.flowers) this.bloom[f.i] = f.ok ? 1 : 0;
  }

  celebrate(quiet = false) {
    if (this.celebrateAt >= 0) return;
    this.celebrateAt = this.time;
    const g = this.game;
    const flowers = g.flow.flowers;
    const heavy = !this.reduceMotion && !quiet;
    if (heavy) {
      for (const f of flowers) {
        for (let k = 0; k < 6; k++) this.spawnPetal(this.cellX(f.i), this.cellY(f.i), true);
      }
    }
    const tiles = g.puzzle.tiles.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
    const ff = this.reduceMotion ? 8 : 22;
    for (let k = 0; k < ff; k++) {
      const i = tiles[(k * 7) % tiles.length];
      this.fireflies.push({
        x: this.cellX(i) + (Math.random() - 0.5) * this.scale,
        y: this.cellY(i) + (Math.random() - 0.5) * this.scale,
        vx: 0, vy: 0, phase: Math.random() * TAU, born: this.time + Math.random() * 1.5,
      });
    }
    const koiCount = clamp(Math.round(tiles.length / 9), 2, 5);
    const springs = tiles.filter((i) => g.puzzle.tiles[i].kind === 'spring');
    for (let k = 0; k < koiCount; k++) {
      const start = springs[k % springs.length] ?? tiles[0];
      const koi = { i: start, from: -1, to: -1, t: 0, speed: 0.55 + Math.random() * 0.25, color: k % 3, born: this.time + k * 0.9 };
      this.pickKoiExit(koi);
      this.koi.push(koi);
    }
  }

  worldPorts(i) {
    return this.game.flow.ports[i];
  }

  pickKoiExit(koi) {
    const g = this.game;
    const n = g.n;
    const t = g.puzzle.tiles[koi.i];
    const ports = this.worldPorts(koi.i);
    if (t.kind === 'bridge' && koi.from >= 0) {
      koi.to = (koi.from + n / 2) % n;
      return;
    }
    const options = [];
    for (let d = 0; d < n; d++) if (ports & (1 << d) && d !== koi.from) options.push(d);
    koi.to = options.length ? options[Math.floor(Math.random() * options.length)] : koi.from;
  }

  koiPos(koi) {
    const n = this.game.n;
    const cx = this.cellX(koi.i);
    const cy = this.cellY(koi.i);
    const r = this.scale * 0.5;
    const p0 = koi.from < 0 ? [cx, cy] : [cx + Math.cos(dirAngle(n, koi.from)) * r, cy + Math.sin(dirAngle(n, koi.from)) * r];
    const p2 = [cx + Math.cos(dirAngle(n, koi.to)) * r, cy + Math.sin(dirAngle(n, koi.to)) * r];
    const t = koi.t;
    const u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * cx + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * cy + t * t * p2[1];
    const dx = 2 * u * (cx - p0[0]) + 2 * t * (p2[0] - cx);
    const dy = 2 * u * (cy - p0[1]) + 2 * t * (p2[1] - cy);
    return [x, y, Math.atan2(dy, dx)];
  }

  spawnPetal(x, y, burst = false) {
    const cap = this.reduceMotion ? 10 : 70;
    if (this.particles.length >= cap) return;
    const colors = this.theme.particleColors;
    const a = Math.random() * TAU;
    const sp = burst ? 30 + Math.random() * 70 : 6 + Math.random() * 10;
    this.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (burst ? 30 : 0),
      rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 3,
      life: burst ? 2.2 + Math.random() : 9 + Math.random() * 5, age: 0,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 0.6 + Math.random() * 0.6,
      burst,
    });
  }

  update(dt) {
    if (!this.game) return;
    this.time += dt;
    const g = this.game;
    const count = g.topo.count;
    const turnRate = 1 - Math.exp(-dt * (this.reduceMotion ? 40 : 17));
    for (let i = 0; i < count; i++) {
      if (!g.puzzle.tiles[i]) continue;
      const a = this.angle[i];
      const t = this.turns[i];
      if (a !== t) this.angle[i] = Math.abs(t - a) < 0.002 ? t : a + (t - a) * turnRate;
      if (this.pulse[i] > 0) this.pulse[i] = Math.max(0, this.pulse[i] - dt * 3);
      const wet = g.flow.depth[i] >= 0;
      if (wet) {
        if (this.wetDelay[i] > 0) this.wetDelay[i] -= dt;
        else this.wetAnim[i] = Math.min(1, this.wetAnim[i] + dt * 5);
      } else {
        this.wetAnim[i] = Math.max(0, this.wetAnim[i] - dt * 6);
      }
    }
    for (const f of g.flow.flowers) {
      const target = f.ok && this.wetAnim[f.i] > 0.6 ? 1 : 0;
      this.bloom[f.i] += (target - this.bloom[f.i]) * Math.min(1, dt * (target ? 2.6 : 6));
    }
    // ambient season particles
    const ambient = this.reduceMotion ? 4 : 14;
    const ambientCount = this.particles.filter((p) => !p.burst).length;
    if (this.theme.particle !== 'firefly' && ambientCount < ambient && Math.random() < dt * 1.2) {
      this.spawnPetal(Math.random() * this.cssW, -10);
    }
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k];
      p.age += dt;
      if (p.burst) {
        p.vx *= 1 - dt * 1.5;
        p.vy = p.vy * (1 - dt * 1.5) + dt * 40;
      } else {
        p.vx = Math.sin(this.time * 0.7 + p.rot) * 14;
        p.vy = this.theme.particle === 'glint' ? 0 : 16 + p.size * 10;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.age > p.life || p.y > this.cssH + 20) this.particles.splice(k, 1);
    }
    if (this.theme.particle === 'firefly' && this.fireflies.length < (this.reduceMotion ? 3 : 8)) {
      this.fireflies.push({ x: Math.random() * this.cssW, y: Math.random() * this.cssH, vx: 0, vy: 0, phase: Math.random() * TAU, born: this.time });
    }
    for (const f of this.fireflies) {
      f.vx += (Math.sin(this.time * 0.9 + f.phase * 3) * 18 - f.vx) * dt;
      f.vy += (Math.cos(this.time * 0.7 + f.phase * 5) * 14 - f.vy) * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    if (g.solved) {
      for (const koi of this.koi) {
        if (this.time < koi.born) continue;
        koi.t += dt * koi.speed * (this.reduceMotion ? 0.6 : 1);
        if (koi.t >= 1) {
          koi.t = 0;
          if (koi.to === koi.from || koi.to < 0) {
            koi.from = koi.to;
            this.pickKoiExit(koi);
            continue;
          }
          const j = g.topo.nbr[koi.i * g.n + koi.to];
          if (j < 0 || !g.puzzle.tiles[j]) {
            koi.from = koi.to;
            koi.to = koi.from;
            continue;
          }
          koi.from = (koi.to + g.n / 2) % g.n;
          koi.i = j;
          this.pickKoiExit(koi);
        }
      }
    }
  }

  // ----------------------------------------------------------- baking

  bakeBackground() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const bg = canvasOf(W, H);
    let c = bg.getContext('2d');
    const th = this.theme;
    const dpr = this.dpr;
    const g = this.game;
    const topo = g.topo;
    const rnd = rand(hashStr(`${this.themeKey}:${topo.w}x${topo.h}:${g.level.id}`));
    c.fillStyle = th.paper;
    c.fillRect(0, 0, W, H);
    for (let k = 0; k < 10; k++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = (0.18 + rnd() * 0.35) * Math.max(W, H);
      const grad = c.createRadialGradient(x, y, 0, x, y, r);
      const col = th.wash[k % th.wash.length];
      grad.addColorStop(0, `${col}88`);
      grad.addColorStop(0.6, `${col}33`);
      grad.addColorStop(1, `${col}00`);
      c.fillStyle = grad;
      c.fillRect(0, 0, W, H);
    }
    // paper grain
    c.fillStyle = th.dark ? 'rgba(255,255,255,0.05)' : 'rgba(90,70,40,0.05)';
    for (let k = 0; k < 900; k++) c.fillRect(rnd() * W, rnd() * H, dpr, dpr);
    if (th.dark) {
      c.fillStyle = 'rgba(255,255,240,0.8)';
      for (let k = 0; k < 70; k++) {
        c.globalAlpha = 0.2 + rnd() * 0.6;
        c.beginPath();
        c.arc(rnd() * W, rnd() * H * 0.9, (0.4 + rnd() * 1.1) * dpr, 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    const s = this.scale * dpr;
    const ox = this.ox * dpr;
    const oy = this.oy * dpr;
    // garden ground: soft blobs under every active cell, a watercolour bed
    const blob = (rad, color, jitter) => {
      c.fillStyle = color;
      for (let i = 0; i < topo.count; i++) {
        if (!topo.active[i]) continue;
        c.beginPath();
        c.arc(ox + topo.cx[i] * s + (rnd() - 0.5) * jitter * s, oy + topo.cy[i] * s + (rnd() - 0.5) * jitter * s, rad * s, 0, TAU);
        c.fill();
      }
    };
    // Each wash is painted opaque on its own layer, then laid down once, so
    // overlapping blobs read as one soft pool of colour.
    const layer = canvasOf(W, H);
    const lc = layer.getContext('2d');
    const wash = (rad, color, jitter, alpha) => {
      lc.clearRect(0, 0, W, H);
      const keep = c;
      c = lc;
      blob(rad, color, jitter);
      c = keep;
      c.globalAlpha = alpha;
      c.drawImage(layer, 0, 0);
      c.globalAlpha = 1;
    };
    wash(1.0, th.groundEdge, 0.25, 0.45);
    wash(0.88, th.ground, 0.18, 0.6);
    wash(0.7, th.ground, 0.3, 0.35);
    if (topo.wrap) {
      const b = this.box;
      c.save();
      c.strokeStyle = th.dark ? 'rgba(170,200,255,0.55)' : 'rgba(80,120,170,0.45)';
      c.lineWidth = 0.05 * s;
      c.setLineDash([0.16 * s, 0.12 * s]);
      c.beginPath();
      c.roundRect(ox + (b.x0 - 0.08) * s, oy + (b.y0 - 0.08) * s, (b.w + 0.16) * s, (b.h + 0.16) * s, 0.25 * s);
      c.stroke();
      c.restore();
    }
    // slots and empty-stone decorations
    const n = topo.n;
    for (let i = 0; i < topo.count; i++) {
      if (!topo.active[i]) continue;
      const x = ox + topo.cx[i] * s;
      const y = oy + topo.cy[i] * s;
      c.save();
      c.translate(x, y + 0.045 * s);
      c.scale(s, s);
      stonePath(c, n, 1.02);
      c.fillStyle = th.dark ? 'rgba(0,0,10,0.35)' : 'rgba(60,50,30,0.16)';
      c.fill();
      c.restore();
      if (!g.puzzle.tiles[i]) this.drawDecor(c, x, y, s, rnd);
    }
    this.bg = bg;
  }

  drawDecor(c, x, y, s, rnd) {
    const th = this.theme;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    const kind = th.decor;
    if (kind === 'pond' || kind === 'lagoon') {
      c.fillStyle = kind === 'pond' ? '#7cc4a4' : '#9dc9b6';
      c.beginPath();
      const a = rnd() * TAU;
      c.moveTo(0, 0);
      c.arc(0, 0, 0.27, a + 0.35, a + TAU - 0.05);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(40,90,70,0.35)';
      c.lineWidth = 0.02;
      c.stroke();
      if (rnd() < 0.6) {
        c.fillStyle = th.petals[0];
        c.beginPath();
        c.arc(0.06, -0.04, 0.07, 0, TAU);
        c.fill();
      }
    } else if (kind === 'snow') {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.ellipse(0, 0.08, 0.32, 0.16, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#e4ecf6';
      c.beginPath();
      c.ellipse(0.08, 0.12, 0.2, 0.08, 0, 0, TAU);
      c.fill();
    } else if (kind === 'night') {
      c.fillStyle = '#1b2a48';
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.arc((k - 1) * 0.15, 0.05 - (k === 1 ? 0.08 : 0), 0.17, 0, TAU);
        c.fill();
      }
      c.fillStyle = 'rgba(255,240,160,0.8)';
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.arc((rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.3, 0.018, 0, TAU);
        c.fill();
      }
    } else {
      // meadow and grove: mossy rocks, grass, a little flower or mushroom
      c.fillStyle = kind === 'grove' ? '#b89a72' : '#b9b8a0';
      c.beginPath();
      c.ellipse(-0.08, 0.06, 0.2, 0.14, -0.2, 0, TAU);
      c.fill();
      c.fillStyle = kind === 'grove' ? '#d0b48b' : '#d3d2bb';
      c.beginPath();
      c.ellipse(-0.11, 0.02, 0.12, 0.07, -0.2, 0, TAU);
      c.fill();
      c.strokeStyle = kind === 'grove' ? '#a46b35' : '#6fa055';
      c.lineWidth = 0.03;
      c.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const gx = 0.1 + k * 0.04;
        c.beginPath();
        c.moveTo(gx, 0.2);
        c.quadraticCurveTo(gx + 0.02, 0.08, gx + (rnd() - 0.3) * 0.08, -0.02 - rnd() * 0.08);
        c.stroke();
      }
      if (kind === 'grove') {
        c.fillStyle = '#d9533a';
        c.beginPath();
        c.arc(0.18, -0.08, 0.08, Math.PI, 0);
        c.fill();
        c.fillStyle = '#f3e6d0';
        c.fillRect(0.16, -0.08, 0.04, 0.08);
      } else {
        c.fillStyle = th.petals[Math.floor(rnd() * th.petals.length)];
        c.beginPath();
        c.arc(0.2, -0.12, 0.05, 0, TAU);
        c.fill();
      }
    }
    c.restore();
  }

  sprite(key, size, draw) {
    let sp = this.sprites.get(key);
    if (sp) return sp;
    const px = Math.ceil(size * this.scale * this.dpr);
    const cv = canvasOf(px, px);
    const c = cv.getContext('2d');
    c.translate(px / 2, px / 2);
    c.scale(this.scale * this.dpr, this.scale * this.dpr);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    draw(c);
    sp = { cv, size };
    this.sprites.set(key, sp);
    return sp;
  }

  tileSprite(i) {
    const t = this.game.puzzle.tiles[i];
    const n = this.game.n;
    const th = this.theme;
    const key = `t:${t.kind}:${t.mask}:${t.inDir ?? ''}:${t.color ?? ''}`;
    return this.sprite(key, 1.3, (c) => {
      const rnd = rand(hashStr(key));
      stonePath(c, n);
      const grad = c.createRadialGradient(0, 0, 0.05, 0, 0, 0.6);
      grad.addColorStop(0, th.stone);
      grad.addColorStop(1, th.stoneShade);
      c.fillStyle = grad;
      c.fill();
      c.strokeStyle = th.stoneEdge;
      c.lineWidth = 0.022;
      c.stroke();
      // speckles
      c.fillStyle = th.dark ? 'rgba(255,255,255,0.08)' : 'rgba(110,90,60,0.12)';
      for (let k = 0; k < 9; k++) {
        const a = rnd() * TAU;
        const r = 0.15 + rnd() * 0.25;
        c.beginPath();
        c.arc(Math.cos(a) * r, Math.sin(a) * r, 0.012 + rnd() * 0.012, 0, TAU);
        c.fill();
      }
      c.save();
      stonePath(c, n);
      c.clip();
      const bed = (path, w1 = 0.36, w2 = 0.27) => {
        c.strokeStyle = th.bed;
        c.lineWidth = w1;
        c.stroke(path);
        c.strokeStyle = th.bedInner;
        c.lineWidth = w2;
        c.stroke(path);
      };
      if (t.kind === 'bridge') {
        const axes = bridgeAxes(n, t.mask);
        bed(channelPath(n, (1 << axes[0]) | (1 << (axes[0] + n / 2))));
      } else {
        bed(channelPath(n, t.mask));
      }
      if (popcount(t.mask) >= 3 && t.kind !== 'bridge') {
        c.fillStyle = th.bed;
        c.beginPath();
        c.arc(0, 0, 0.2, 0, TAU);
        c.fill();
        c.fillStyle = th.bedInner;
        c.beginPath();
        c.arc(0, 0, 0.155, 0, TAU);
        c.fill();
      }
      if (t.kind === 'flower') {
        c.fillStyle = th.dark ? '#20284e' : '#7a6a4c';
        c.beginPath();
        c.arc(0, 0, 0.17, 0, TAU);
        c.fill();
      }
      if (t.kind === 'spring') {
        c.fillStyle = th.stoneEdge;
        c.beginPath();
        c.arc(0, 0, 0.25, 0, TAU);
        c.fill();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + rnd() * 0.3;
          c.fillStyle = k % 2 ? th.stoneShade : th.stone;
          c.beginPath();
          c.arc(Math.cos(a) * 0.235, Math.sin(a) * 0.235, 0.05, 0, TAU);
          c.fill();
        }
      }
      c.restore();
      stonePath(c, n);
      c.strokeStyle = th.stoneEdge;
      c.lineWidth = 0.022;
      c.stroke();
    });
  }

  deckSprite(axis) {
    const n = this.game.n;
    const th = this.theme;
    return this.sprite(`deck:${axis}`, 1.3, (c) => {
      stonePath(c, n);
      c.clip();
      const path = channelPath(n, (1 << axis) | (1 << (axis + n / 2)));
      c.strokeStyle = th.dark ? 'rgba(0,0,0,0.35)' : 'rgba(60,40,20,0.22)';
      c.lineWidth = 0.46;
      c.stroke(path);
      c.strokeStyle = th.dark ? '#6b5a8a' : '#c79a62';
      c.lineWidth = 0.4;
      c.lineCap = 'butt';
      c.stroke(path);
      // planks
      c.strokeStyle = th.dark ? '#57487a' : '#a87c49';
      c.lineWidth = 0.012;
      const a = dirAngle(n, axis);
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      for (let k = -4; k <= 4; k++) {
        const px = ux * k * 0.11;
        const py = uy * k * 0.11;
        c.beginPath();
        c.moveTo(px - uy * 0.2, py + ux * 0.2);
        c.lineTo(px + uy * 0.2, py - ux * 0.2);
        c.stroke();
      }
      c.lineCap = 'round';
      c.strokeStyle = th.bedInner;
      c.lineWidth = 0.24;
      c.stroke(path);
    });
  }

  flowerSprite(need, variant, lit) {
    const th = this.theme;
    const type = th.target;
    const key = `f:${type}:${need}:${variant}:${lit ? 1 : 0}`;
    return this.sprite(key, 1.2, (c) => {
      if (type === 'lantern') {
        const col = NEED_COLORS[need];
        if (lit) {
          const grad = c.createRadialGradient(0, 0, 0, 0, 0, 0.55);
          grad.addColorStop(0, `${col}aa`);
          grad.addColorStop(0.45, `${col}33`);
          grad.addColorStop(1, `${col}00`);
          c.fillStyle = grad;
          c.beginPath();
          c.arc(0, 0, 0.55, 0, TAU);
          c.fill();
        }
        c.strokeStyle = '#2a2140';
        c.lineWidth = 0.03;
        c.beginPath();
        c.moveTo(0, -0.26);
        c.lineTo(0, -0.18);
        c.stroke();
        c.fillStyle = lit ? col : `${col}66`;
        c.beginPath();
        c.ellipse(0, 0, 0.16, 0.19, 0, 0, TAU);
        c.fill();
        c.strokeStyle = lit ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
        c.lineWidth = 0.016;
        for (const k of [-0.08, 0, 0.08]) {
          c.beginPath();
          c.ellipse(0, 0, Math.abs(k) + 0.02, 0.19, 0, 0, TAU);
          c.stroke();
        }
        c.fillStyle = '#3a2c4a';
        c.fillRect(-0.09, -0.22, 0.18, 0.05);
        c.fillRect(-0.09, 0.17, 0.18, 0.05);
        if (lit) {
          c.fillStyle = 'rgba(255,255,255,0.75)';
          c.beginPath();
          c.ellipse(-0.04, -0.05, 0.04, 0.07, 0, 0, TAU);
          c.fill();
        }
        return;
      }
      const petals = th.petals;
      const col = petals[variant % petals.length];
      if (type === 'lotus') {
        c.fillStyle = '#6cb38c';
        c.beginPath();
        c.arc(0, 0.04, 0.27, 0.3, Math.PI * 2 - 0.2);
        c.lineTo(0, 0.04);
        c.fill();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          c.save();
          c.rotate(a);
          c.fillStyle = k % 2 ? col : '#ffffff';
          c.beginPath();
          c.moveTo(0, 0);
          c.quadraticCurveTo(0.09, -0.1, 0, -0.24);
          c.quadraticCurveTo(-0.09, -0.1, 0, 0);
          c.fill();
          c.restore();
        }
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU + 0.3;
          c.save();
          c.rotate(a);
          c.fillStyle = col;
          c.beginPath();
          c.moveTo(0, 0);
          c.quadraticCurveTo(0.06, -0.07, 0, -0.15);
          c.quadraticCurveTo(-0.06, -0.07, 0, 0);
          c.fill();
          c.restore();
        }
        c.fillStyle = '#ffd86b';
        c.beginPath();
        c.arc(0, 0, 0.045, 0, TAU);
        c.fill();
        return;
      }
      // meadow flower
      c.fillStyle = '#5f9d4c';
      for (const s of [-1, 1]) {
        c.beginPath();
        c.ellipse(s * 0.17, 0.12, 0.1, 0.045, s * 0.5, 0, TAU);
        c.fill();
      }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        c.fillStyle = col;
        c.beginPath();
        c.ellipse(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.1, 0.07, a, 0, TAU);
        c.fill();
      }
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 0.012;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        c.beginPath();
        c.moveTo(Math.cos(a) * 0.06, Math.sin(a) * 0.06);
        c.lineTo(Math.cos(a) * 0.17, Math.sin(a) * 0.17);
        c.stroke();
      }
      c.fillStyle = need === 'b' && th.decor === 'snow' ? '#ffd86b' : '#ffcf4a';
      c.beginPath();
      c.arc(0, 0, 0.065, 0, TAU);
      c.fill();
      c.fillStyle = '#e8a52c';
      c.beginPath();
      c.arc(0.015, 0.015, 0.03, 0, TAU);
      c.fill();
    });
  }

  budSprite(need) {
    const th = this.theme;
    return this.sprite(`bud:${th.target}:${need}`, 1, (c) => {
      c.fillStyle = th.dark ? '#3c6a4a' : '#5f9d4c';
      c.beginPath();
      c.ellipse(0, 0.02, 0.1, 0.13, 0, 0, TAU);
      c.fill();
      c.fillStyle = th.dark ? NEED_COLORS[need] : th.petals[0];
      c.globalAlpha = th.dark ? 0.55 : 0.9;
      c.beginPath();
      c.moveTo(-0.06, -0.02);
      c.quadraticCurveTo(0, -0.22, 0.06, -0.02);
      c.closePath();
      c.fill();
    });
  }

  glowSprite(color) {
    return this.sprite(`glow:${color}`, 0.5, (c) => {
      const grad = c.createRadialGradient(0, 0, 0, 0, 0, 0.25);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.15, color);
      grad.addColorStop(0.5, `${color}44`);
      grad.addColorStop(1, `${color}00`);
      c.fillStyle = grad;
      c.beginPath();
      c.arc(0, 0, 0.25, 0, TAU);
      c.fill();
    });
  }

  koiSprite(color) {
    const body = ['#ff8a3d', '#fff4e8', '#f25c3c'][color];
    const spot = ['#ffffff', '#ff7a3a', '#2a2a36'][color];
    return this.sprite(`koi:${color}`, 0.6, (c) => {
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.beginPath();
      c.ellipse(0.02, 0.03, 0.14, 0.05, 0, 0, TAU);
      c.fill();
      c.fillStyle = body;
      c.beginPath();
      c.moveTo(-0.12, 0);
      c.lineTo(-0.2, -0.06);
      c.lineTo(-0.18, 0);
      c.lineTo(-0.2, 0.06);
      c.closePath();
      c.fill();
      c.beginPath();
      c.ellipse(0.02, 0, 0.13, 0.05, 0, 0, TAU);
      c.fill();
      c.fillStyle = spot;
      c.beginPath();
      c.arc(0.05, -0.01, 0.025, 0, TAU);
      c.arc(-0.04, 0.012, 0.02, 0, TAU);
      c.fill();
      c.fillStyle = body;
      c.beginPath();
      c.ellipse(0.0, -0.05, 0.04, 0.015, -0.6, 0, TAU);
      c.ellipse(0.0, 0.05, 0.04, 0.015, 0.6, 0, TAU);
      c.fill();
    });
  }

  particleSprite(color) {
    const kind = this.theme.particle;
    return this.sprite(`p:${kind}:${color}`, 0.3, (c) => {
      c.fillStyle = color;
      if (kind === 'leaf') {
        c.beginPath();
        c.moveTo(-0.08, 0);
        c.quadraticCurveTo(0, -0.07, 0.08, 0);
        c.quadraticCurveTo(0, 0.07, -0.08, 0);
        c.fill();
      } else if (kind === 'snow') {
        c.strokeStyle = color;
        c.lineWidth = 0.012;
        for (let k = 0; k < 3; k++) {
          c.save();
          c.rotate((k * Math.PI) / 3);
          c.beginPath();
          c.moveTo(-0.05, 0);
          c.lineTo(0.05, 0);
          c.stroke();
          c.restore();
        }
        c.beginPath();
        c.arc(0, 0, 0.015, 0, TAU);
        c.fill();
      } else if (kind === 'glint') {
        c.globalAlpha = 0.8;
        c.beginPath();
        c.moveTo(0, -0.06);
        c.lineTo(0.012, 0);
        c.lineTo(0, 0.06);
        c.lineTo(-0.012, 0);
        c.closePath();
        c.fill();
      } else {
        c.beginPath();
        c.ellipse(0, 0, 0.055, 0.03, 0, 0, TAU);
        c.fill();
      }
    });
  }

  badgeSprite(group) {
    const color = PAIR_COLORS[group % PAIR_COLORS.length];
    return this.sprite(`badge:${group}`, 0.36, (c) => {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(0, 0, 0.11, 0, TAU);
      c.fill();
      c.fillStyle = color;
      c.beginPath();
      c.arc(0, 0, 0.09, 0, TAU);
      c.fill();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 0.016;
      for (let k = 0; k < 3; k++) {
        c.save();
        c.rotate((k * Math.PI) / 3);
        c.beginPath();
        c.moveTo(-0.06, 0);
        c.lineTo(0.06, 0);
        c.stroke();
        c.restore();
      }
    });
  }

  lockSprite() {
    const th = this.theme;
    return this.sprite('lock', 1.3, (c) => {
      stonePath(c, this.game.n, 0.97);
      c.strokeStyle = th.dark ? '#5d8a6a' : '#7fa860';
      c.lineWidth = 0.05;
      c.stroke();
      const rnd = rand(77);
      c.fillStyle = th.dark ? '#4f7d5d' : '#86b064';
      for (let k = 0; k < 14; k++) {
        const a = rnd() * TAU;
        const r = this.game.n === 4 ? 0.42 : 0.47;
        c.beginPath();
        c.arc(Math.cos(a) * r, Math.sin(a) * r, 0.03 + rnd() * 0.035, 0, TAU);
        c.fill();
      }
    });
  }

  // ----------------------------------------------------------- drawing

  blit(sp, x, y, angle = 0, scale = 1, alpha = 1) {
    const ctx = this.ctx;
    const px = sp.cv.width;
    const dpr = this.dpr;
    // Sprites are baked in device pixels already: only position needs dpr.
    const cs = Math.cos(angle) * scale;
    const sn = Math.sin(angle) * scale;
    ctx.globalAlpha = alpha;
    ctx.setTransform(cs, sn, -sn, cs, x * dpr, y * dpr);
    ctx.drawImage(sp.cv, -px / 2, -px / 2);
  }

  unitTransform(x, y, angle, scale = 1) {
    const s = this.scale * this.dpr * scale;
    const cs = Math.cos(angle) * s;
    const sn = Math.sin(angle) * s;
    this.ctx.setTransform(cs, sn, -sn, cs, x * this.dpr, y * this.dpr);
  }

  drawWater(path, color, amount, offset) {
    const ctx = this.ctx;
    ctx.lineCap = 'butt';
    const w = WATER[color] || WATER[1];
    ctx.globalAlpha = 0.45 * amount;
    ctx.strokeStyle = w.glow;
    ctx.lineWidth = 0.27 * amount;
    ctx.stroke(path);
    ctx.globalAlpha = amount;
    ctx.strokeStyle = w.core;
    ctx.lineWidth = 0.16 * amount;
    ctx.stroke(path);
    if (!this.reduceMotion && amount > 0.5) {
      ctx.globalAlpha = 0.55 * amount;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.045;
      ctx.setLineDash([0.06, 0.2]);
      ctx.lineDashOffset = offset;
      ctx.stroke(path);
      ctx.setLineDash([]);
    }
    ctx.lineCap = 'round';
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (!this.game || !this.bg) {
      ctx.fillStyle = '#f4f1df';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    ctx.drawImage(this.bg, 0, 0);
    const g = this.game;
    const { topo, puzzle, flow } = g;
    const n = g.n;
    const half = n / 2;
    const step = TAU / n;
    const tiles = puzzle.tiles;
    const shimmer = -this.time * 0.35;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const solvedGlow = this.celebrateAt >= 0 ? clamp((this.time - this.celebrateAt) / 1.2, 0, 1) : 0;

    for (let i = 0; i < topo.count; i++) {
      const t = tiles[i];
      if (!t) continue;
      const x = this.cellX(i);
      const y = this.cellY(i);
      const a = this.angle[i] * step;
      const pop = this.reduceMotion ? 1 : 1 + Math.sin(this.pulse[i] * Math.PI) * 0.05;
      this.blit(this.tileSprite(i), x, y, a, pop);
      ctx.globalAlpha = 1;
      const wa = this.wetAnim[i];
      if (t.kind === 'bridge') {
        const axes = bridgeAxes(n, t.mask);
        const rot = Math.round(this.turns[i]);
        axes.forEach((axis, k) => {
          if (k > 0) {
            this.blit(this.deckSprite(axis), x, y, a, pop);
            ctx.globalAlpha = 1;
          }
          const worldAxis = ((((axis + rot) % n) + n) % n) % half;
          const color = flow.wet[i * 3 + worldAxis];
          if (color && wa > 0) {
            this.unitTransform(x, y, a, pop);
            this.drawWater(channelPath(n, (1 << axis) | (1 << (axis + half))), color, wa, shimmer);
          }
        });
      } else if (wa > 0 && flow.wet[i * 3]) {
        this.unitTransform(x, y, a, pop);
        this.drawWater(channelPath(n, t.mask), flow.wet[i * 3], wa, shimmer);
        if (popcount(t.mask) >= 3) {
          const w = WATER[flow.wet[i * 3]] || WATER[1];
          ctx.globalAlpha = wa;
          ctx.fillStyle = w.core;
          ctx.beginPath();
          ctx.arc(0, 0, 0.12 * wa, 0, TAU);
          ctx.fill();
        }
      }
      if (t.kind === 'gate') {
        this.unitTransform(x, y, a, pop);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.theme.dark ? '#2a2140' : '#6a4a2a';
        ctx.lineWidth = 0.075;
        ctx.stroke(gatePath(n, t.mask, t.inDir));
        ctx.strokeStyle = this.theme.dark ? '#ffd27a' : '#f7e3b8';
        ctx.lineWidth = 0.035;
        ctx.stroke(gatePath(n, t.mask, t.inDir));
      }
      if (t.kind === 'spring') {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        const w = WATER[t.color === 'y' ? 2 : 1];
        const r = this.scale * 0.2;
        ctx.globalAlpha = 1;
        ctx.fillStyle = w.core;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, this.scale * 0.02);
        for (let k = 0; k < 2; k++) {
          const ph = this.reduceMotion ? 0.5 : (this.time * 0.5 + k * 0.5) % 1;
          ctx.globalAlpha = (1 - ph) * 0.7;
          ctx.beginPath();
          ctx.arc(x, y, r * (0.25 + ph * 0.75), 0, TAU);
          ctx.stroke();
        }
      }
    }

    // flowers, upright on top
    flow.flowers.forEach((f, k) => {
      const t = tiles[f.i];
      const x = this.cellX(f.i);
      const y = this.cellY(f.i);
      const b = this.bloom[f.i];
      const sway = this.reduceMotion ? 0 : Math.sin(this.time * 1.3 + f.i) * 0.06;
      if (b < 0.98) {
        this.blit(this.budSprite(t.need), x, y, sway, 1 - b * 0.6, 1 - b);
      }
      if (this.theme.target === 'lantern' && b < 0.98) {
        this.blit(this.flowerSprite(t.need, k, false), x, y, sway, 0.85, 1 - b);
      }
      if (b > 0.02) {
        const s = easeOutBack(clamp(b, 0, 1));
        this.blit(this.flowerSprite(t.need, k, true), x, y, sway, 0.4 + 0.6 * s, Math.min(1, b * 1.6));
      }
      // a wrong colour gets a little ring showing what it wants
      if (f.have && !f.ok) {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.globalAlpha = 0.6 + Math.sin(this.time * 4) * 0.3;
        ctx.strokeStyle = NEED_COLORS[t.need];
        ctx.lineWidth = Math.max(2, this.scale * 0.04);
        ctx.beginPath();
        ctx.arc(x, y, this.scale * 0.3, 0, TAU);
        ctx.stroke();
      }
    });

    // locks and twin badges
    for (let i = 0; i < topo.count; i++) {
      const t = tiles[i];
      if (!t) continue;
      if (t.locked) this.blit(this.lockSprite(), this.cellX(i), this.cellY(i));
      const grp = g.groupOf[i];
      if (t.group != null && grp >= 0) {
        const off = this.scale * (n === 4 ? 0.3 : 0.28);
        this.blit(this.badgeSprite(t.group), this.cellX(i) + off, this.cellY(i) - off);
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // spills: little splashes at open ends
    if (!g.solved) {
      for (const sp of flow.spills) {
        const ang = dirAngle(n, sp.d);
        const px = this.cellX(sp.i) + Math.cos(ang) * this.scale * 0.5;
        const py = this.cellY(sp.i) + Math.sin(ang) * this.scale * 0.5;
        const w = WATER[flow.wet[sp.i * 3] || 1] || WATER[1];
        ctx.fillStyle = w.core;
        for (let k = 0; k < 3; k++) {
          const ph = this.reduceMotion ? 0.4 : (this.time * 1.4 + k / 3) % 1;
          ctx.globalAlpha = (1 - ph) * 0.8 * this.wetAnim[sp.i];
          const spread = (k - 1) * 0.6;
          const r = this.scale * (0.05 + ph * 0.16);
          ctx.beginPath();
          ctx.arc(px + Math.cos(ang + spread) * r, py + Math.sin(ang + spread) * r, Math.max(1.5, this.scale * 0.035 * (1 - ph * 0.5)), 0, TAU);
          ctx.fill();
        }
      }
    }

    // koi follow the channels once the garden is finished
    for (const koi of this.koi) {
      if (this.time < koi.born) continue;
      const [x, y, h] = this.koiPos(koi);
      const fade = clamp((this.time - koi.born) / 1, 0, 1);
      const wiggle = this.reduceMotion ? 0 : Math.sin(this.time * 9 + koi.born) * 0.12;
      this.blit(this.koiSprite(koi.color), x, y, h + wiggle, 1, fade * 0.95);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // cursor, hover and hint
    if (!this.photo) {
      if (this.hover >= 0 && tiles[this.hover] && !g.solved && this.hover !== this.cursor) {
        this.ring(this.hover, this.theme.dark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.75)', 0.03, 1.0);
      }
      if (this.showCursor && this.cursor >= 0 && !g.solved) {
        this.ring(this.cursor, this.theme.dark ? '#ffe9a8' : '#3b5d7a', 0.05, 1.04 + Math.sin(this.time * 4) * 0.02);
      }
      const focus = this.showCursor ? this.cursor : this.hover;
      if (focus >= 0 && tiles[focus] && tiles[focus].group != null && !g.solved) {
        const mates = g.partners(focus);
        ctx.strokeStyle = PAIR_COLORS[tiles[focus].group % PAIR_COLORS.length];
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = Math.max(2, this.scale * 0.035);
        ctx.setLineDash([this.scale * 0.08, this.scale * 0.08]);
        ctx.beginPath();
        mates.forEach((m, k) => (k ? ctx.lineTo(this.cellX(m), this.cellY(m)) : ctx.moveTo(this.cellX(m), this.cellY(m))));
        ctx.stroke();
        ctx.setLineDash([]);
        for (const m of mates) this.ring(m, ctx.strokeStyle, 0.035, 1);
      }
      if (this.hint && !g.solved) this.drawHint(this.hint);
    }

    // particles
    for (const p of this.particles) {
      const fade = p.burst ? 1 - p.age / p.life : Math.min(1, p.age, (p.life - p.age) / 2);
      this.blit(this.particleSprite(p.color), p.x, p.y, p.rot, p.size, clamp(fade, 0, 1));
    }
    const ffColor = this.theme.dark ? '#fff2a8' : '#fff7c0';
    for (const f of this.fireflies) {
      if (this.time < f.born) continue;
      const tw = 0.5 + 0.5 * Math.sin(this.time * 2.2 + f.phase * 7);
      const fade = clamp(this.time - f.born, 0, 1);
      this.blit(this.glowSprite(ffColor), f.x, f.y, 0, 0.6 + tw * 0.5, fade * (0.35 + tw * 0.65));
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (solvedGlow > 0 && solvedGlow < 1 && !this.reduceMotion) {
      ctx.globalAlpha = Math.sin(solvedGlow * Math.PI) * 0.18;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
    if (this.dim > 0) {
      ctx.globalAlpha = this.dim;
      ctx.fillStyle = this.theme.dark ? '#0b0e22' : '#fbf8ee';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
  }

  ring(i, color, width, scale) {
    const ctx = this.ctx;
    const x = this.cellX(i);
    const y = this.cellY(i);
    ctx.save();
    ctx.setTransform(this.scale * this.dpr * scale, 0, 0, this.scale * this.dpr * scale, x * this.dpr, y * this.dpr);
    stonePath(ctx, this.game.n, 1.06);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }

  drawHint(h) {
    const ctx = this.ctx;
    const x = this.cellX(h.i);
    const y = this.cellY(h.i);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
    this.ring(h.i, `rgba(255, 214, 102, ${0.55 + pulse * 0.45})`, 0.07, 1.06 + pulse * 0.04);
    // curved arrow showing which way to turn
    const r = this.scale * 0.62;
    const dir = h.dir;
    const a0 = -Math.PI * 0.75;
    const a1 = a0 + dir * 0.9;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.strokeStyle = '#f2a93b';
    ctx.lineWidth = Math.max(3, this.scale * 0.06);
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(x, y, r, Math.min(a0, a1), Math.max(a0, a1));
    ctx.stroke();
    const hx = x + Math.cos(a1) * r;
    const hy = y + Math.sin(a1) * r;
    const tangent = a1 + (dir * Math.PI) / 2;
    const s = this.scale * 0.14;
    ctx.fillStyle = '#f2a93b';
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(tangent) * s, hy + Math.sin(tangent) * s);
    ctx.lineTo(hx + Math.cos(tangent + 2.4) * s, hy + Math.sin(tangent + 2.4) * s);
    ctx.lineTo(hx + Math.cos(tangent - 2.4) * s, hy + Math.sin(tangent - 2.4) * s);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  snapshot() {
    return this.canvas.toDataURL('image/png');
  }
}

export { NEED_COLORS };
