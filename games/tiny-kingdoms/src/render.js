// Canvas renderer. Reads world state, never changes it. Islands, sea and
// building art are baked into offscreen canvases on resize or new scene;
// each frame blits those and draws squads, labels and effects.
import { BUILDINGS, WORLD_W, WORLD_H, NEUTRAL_COLOR, HEROES } from './data.js';
import { makeView, mapBounds, PAD } from './view.js';
import { makeRng } from './rng.js';
import { sendCount } from './sim.js';
import { INK, makeCanvas, drawBuilding, drawBuildingLive, drawSoldier, drawBoat, drawHeroToken } from './sprites.js';

export const THEMES = {
  clover: {
    seaTop: '#6fd0dc', seaBottom: '#3497bf', shallow: '#a8eee6', sand: '#f4e0a6', cliff: '#d7b878',
    grass: '#83cc5c', grassDark: '#5ea845', grassLight: '#b2e481', dab: ['#6fbf50', '#9bd96d', '#c4ea8f'],
    trees: ['#3f9a4a', '#4fae52', '#2f8a46'], flowers: ['#ffffff', '#ffe066', '#ff9ec7'], decor: 'round', wave: 'rgba(255,255,255,0.45)',
  },
  windmill: {
    seaTop: '#78cbe6', seaBottom: '#3b84c4', shallow: '#b3ecf0', sand: '#f7e5ae', cliff: '#dbbd80',
    grass: '#b3d461', grassDark: '#8db446', grassLight: '#d6ea8a', dab: ['#c9dc6a', '#e6c95c', '#a2c653'],
    trees: ['#5f9e3e', '#7bb04a', '#e2a33a'], flowers: ['#ffffff', '#ff6f61', '#ffd34d'], decor: 'wheat', wave: 'rgba(255,255,255,0.45)',
  },
  fjords: {
    seaTop: '#8fc0d8', seaBottom: '#3f6f9e', shallow: '#cbe8f2', sand: '#dcd8cc', cliff: '#a9a397',
    grass: '#9cc6a3', grassDark: '#78a887', grassLight: '#c8e2cc', dab: ['#f2f7fa', '#b4d6bb', '#88b796'],
    trees: ['#2f6b5a', '#3b7e66', '#265a4c'], flowers: ['#ffffff', '#cfe6ff', '#e0d4ff'], decor: 'pine', wave: 'rgba(255,255,255,0.5)',
  },
  ember: {
    seaTop: '#5bb0bf', seaBottom: '#22587a', shallow: '#93d8d6', sand: '#6e5a4c', cliff: '#45362c',
    grass: '#a3b45a', grassDark: '#7d8d40', grassLight: '#c8cc76', dab: ['#b9a64e', '#8f9e48', '#d0b25e'],
    trees: ['#6b8a3a', '#8a9a3e', '#5a7434'], flowers: ['#ff7a3a', '#ffcf4d', '#ff4f6a'], decor: 'ember', wave: 'rgba(255,255,255,0.35)',
  },
};

const LINK = 235; // buildings closer than this share an island
const GRID = 25;

// Island shapes for a map: circles in world units, plus a land grid.
export function islandShapes(nodes, seed) {
  const rng = makeRng((seed ^ 0x51ab1e) >>> 0);
  const circles = [];
  for (const n of nodes) {
    circles.push({ x: n.x, y: n.y, r: n.r + 40 + rng() * 14 });
    const extra = 2 + rng.int(2);
    for (let i = 0; i < extra; i++) {
      const a = rng() * Math.PI * 2, d = 34 + rng() * 34;
      circles.push({ x: n.x + Math.cos(a) * d, y: n.y + Math.sin(a) * d, r: 28 + rng() * 22 });
    }
  }
  // Join near neighbours with land bridges (a spanning tree of short links).
  const parent = nodes.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const edges = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
    if (d < LINK) edges.push([d, i, j]);
  }
  edges.sort((a, b) => a[0] - b[0]);
  for (const [d, i, j] of edges) {
    if (find(i) === find(j)) continue;
    parent[find(i)] = find(j);
    const a = nodes[i], b = nodes[j];
    const steps = Math.ceil(d / 40);
    const px = -(b.y - a.y) / d, py = (b.x - a.x) / d;
    for (let k = 1; k < steps; k++) {
      const t = k / steps, wob = (rng() - 0.5) * 24;
      circles.push({ x: a.x + (b.x - a.x) * t + px * wob, y: a.y + (b.y - a.y) * t + py * wob, r: 30 + rng() * 14 });
    }
  }
  const cols = Math.ceil((WORLD_W + PAD * 2) / GRID), rows = Math.ceil((WORLD_H + PAD * 2) / GRID);
  const land = new Uint8Array(cols * rows);
  for (const c of circles) {
    const x0 = Math.max(0, Math.floor((c.x - c.r + PAD) / GRID)), x1 = Math.min(cols - 1, Math.ceil((c.x + c.r + PAD) / GRID));
    const y0 = Math.max(0, Math.floor((c.y - c.r + PAD) / GRID)), y1 = Math.min(rows - 1, Math.ceil((c.y + c.r + PAD) / GRID));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const wx = gx * GRID - PAD + GRID / 2, wy = gy * GRID - PAD + GRID / 2;
      if ((wx - c.x) ** 2 + (wy - c.y) ** 2 <= (c.r - 6) ** 2) land[gy * cols + gx] = 1;
    }
  }
  const landAt = (x, y) => {
    const gx = Math.floor((x + PAD) / GRID), gy = Math.floor((y + PAD) / GRID);
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return false;
    return land[gy * cols + gx] === 1;
  };
  return { circles, landAt };
}

function circlesPath(ctx, circles, view, grow, dx = 0, dy = 0) {
  ctx.beginPath();
  for (const c of circles) {
    const p = view.toScreen(c.x, c.y);
    const r = Math.max(1, (c.r + grow) * view.s);
    ctx.moveTo(p.x + dx + r, p.y + dy);
    ctx.arc(p.x + dx, p.y + dy, r, 0, Math.PI * 2);
  }
}

// Paint sea and islands into ctx (screen space). Used for the board, map
// thumbnails and the world-map art.
export function paintIslands(ctx, w, h, view, shapes, theme, seed, { nodes = [], detail = 1 } = {}) {
  const rng = makeRng((seed ^ 0xdec0) >>> 0);
  const s = view.s;
  const sea = ctx.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, theme.seaTop);
  sea.addColorStop(1, theme.seaBottom);
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, w, h);
  // Soft light patches in the water.
  for (let i = 0; i < 6 * detail; i++) {
    const x = rng() * w, y = rng() * h, r = (120 + rng() * 220) * Math.max(0.5, s);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Painted wave marks.
  ctx.strokeStyle = theme.wave;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, 2.2 * s);
  const waves = Math.round((w * h) / 9000 * detail);
  for (let i = 0; i < waves; i++) {
    const x = rng() * w, y = rng() * h;
    const wp = view.toWorld(x, y);
    if (shapes.landAt(wp.x, wp.y)) continue;
    const L = (10 + rng() * 12) * Math.max(0.6, s * 1.4);
    ctx.globalAlpha = 0.35 + rng() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - L, y);
    ctx.quadraticCurveTo(x - L / 2, y - L * 0.35, x, y);
    ctx.quadraticCurveTo(x + L / 2, y - L * 0.35, x + L, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const C = shapes.circles;
  // Shallow water glow, foam, cliff lip, sand, grass lip, grass.
  ctx.globalAlpha = 0.5;
  circlesPath(ctx, C, view, 34);
  ctx.fillStyle = theme.shallow;
  ctx.fill();
  ctx.globalAlpha = 0.85;
  circlesPath(ctx, C, view, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.globalAlpha = 1;
  circlesPath(ctx, C, view, 10, 0, 9 * s);
  ctx.fillStyle = theme.cliff;
  ctx.fill();
  circlesPath(ctx, C, view, 10);
  ctx.fillStyle = theme.sand;
  ctx.fill();
  circlesPath(ctx, C, view, -6, 0, 6 * s);
  ctx.fillStyle = theme.grassDark;
  ctx.fill();
  circlesPath(ctx, C, view, -6);
  ctx.fillStyle = theme.grass;
  ctx.fill();
  // Brush dabs and highlights clipped to the grass.
  ctx.save();
  circlesPath(ctx, C, view, -6);
  ctx.clip();
  for (const c of C) {
    const p = view.toScreen(c.x, c.y);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(p.x - 8 * s, p.y - 10 * s, c.r * 0.62 * s, 0, Math.PI * 2);
    ctx.fillStyle = theme.grassLight;
    ctx.fill();
  }
  const dabs = Math.round(C.length * 9 * detail);
  for (let i = 0; i < dabs; i++) {
    const c = C[rng.int(C.length)];
    const a = rng() * Math.PI * 2, d = rng() * c.r;
    const p = view.toScreen(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d);
    ctx.globalAlpha = 0.18 + rng() * 0.22;
    ctx.fillStyle = theme.dab[rng.int(theme.dab.length)];
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, (5 + rng() * 9) * s * 1.2, (2.5 + rng() * 4) * s * 1.2, rng() * 0.6 - 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  decorate(ctx, view, shapes, theme, rng, nodes, detail);
}

function clearOfNodes(nodes, x, y, gap) {
  for (const n of nodes) if (Math.hypot(n.x - x, n.y - y) < n.r + gap) return false;
  return true;
}

function decorate(ctx, view, shapes, theme, rng, nodes, detail) {
  const s = view.s;
  const C = shapes.circles;
  const items = [];
  const count = Math.round(C.length * 1.6 * detail);
  for (let i = 0; i < count; i++) {
    const c = C[rng.int(C.length)];
    const a = rng() * Math.PI * 2, d = rng() * (c.r - 18);
    const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    if (!shapes.landAt(x, y) || !shapes.landAt(x + 20, y) || !shapes.landAt(x - 20, y) || !shapes.landAt(x, y + 22)) continue;
    if (!clearOfNodes(nodes, x, y, 46)) continue;
    const kind = rng() < 0.45 ? 'tree' : rng() < 0.7 ? 'flowers' : rng() < 0.6 ? 'bush' : 'rock';
    items.push({ x, y, kind, k: rng(), k2: rng() });
  }
  items.sort((a, b) => view.toScreen(a.x, a.y).y - view.toScreen(b.x, b.y).y);
  ctx.lineJoin = 'round';
  for (const it of items) {
    const p = view.toScreen(it.x, it.y);
    const z = Math.max(0.45, s * 1.25);
    if (it.kind === 'tree') tree(ctx, p.x, p.y, z * (0.85 + it.k * 0.5), theme, it.k2);
    else if (it.kind === 'bush') {
      ctx.fillStyle = 'rgba(30,50,20,0.2)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 4 * z, 11 * z, 3.5 * z, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = theme.trees[1];
      for (const [ox, oy, r] of [[-5, 0, 6], [4, -1, 7], [0, -5, 6]]) { ctx.beginPath(); ctx.arc(p.x + ox * z, p.y + oy * z, r * z, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(p.x - 2 * z, p.y - 6 * z, 3 * z, 0, Math.PI * 2); ctx.fill();
    } else if (it.kind === 'rock') {
      ctx.fillStyle = theme.decor === 'ember' ? '#4a3f45' : '#a59e92';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 7 * z, 5 * z, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.8, 1.2 * z); ctx.stroke();
      if (theme.decor === 'ember' && it.k2 < 0.5) {
        ctx.fillStyle = '#ff8a3d';
        ctx.beginPath(); ctx.arc(p.x, p.y - 2 * z, 1.6 * z, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      for (let f = 0; f < 4; f++) {
        const fx = p.x + (Math.sin(it.k * 40 + f * 2.1) * 9) * z, fy = p.y + (Math.cos(it.k2 * 30 + f * 1.7) * 5) * z;
        if (theme.decor === 'wheat') {
          ctx.strokeStyle = '#d9a83c'; ctx.lineWidth = Math.max(1, 1.6 * z);
          ctx.beginPath(); ctx.moveTo(fx, fy + 4 * z); ctx.lineTo(fx + 1 * z, fy - 5 * z); ctx.stroke();
          ctx.fillStyle = '#f0c95a'; ctx.beginPath(); ctx.ellipse(fx + 1 * z, fy - 6 * z, 1.6 * z, 3 * z, 0.2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = theme.flowers[(f + Math.floor(it.k * 9)) % theme.flowers.length];
          ctx.beginPath(); ctx.arc(fx, fy, 2.2 * z, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffd34d';
          ctx.beginPath(); ctx.arc(fx, fy, 0.9 * z, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
}

function tree(ctx, x, y, z, theme, k) {
  ctx.fillStyle = 'rgba(30,50,20,0.22)';
  ctx.beginPath(); ctx.ellipse(x, y + 2 * z, 12 * z, 4 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(0.8, 1.5 * z);
  ctx.strokeStyle = INK;
  const col = theme.trees[Math.floor(k * theme.trees.length)];
  if (theme.decor === 'pine' || (theme.decor === 'ember' && k > 0.6)) {
    ctx.fillStyle = '#7a5235';
    ctx.fillRect(x - 1.5 * z, y - 4 * z, 3 * z, 6 * z);
    for (let i = 0; i < 3; i++) {
      const ty = y - 4 * z - i * 7 * z, wdt = (12 - i * 3) * z;
      ctx.beginPath(); ctx.moveTo(x - wdt, ty); ctx.lineTo(x, ty - 11 * z); ctx.lineTo(x + wdt, ty); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.stroke();
      if (theme.decor === 'pine') {
        ctx.beginPath(); ctx.moveTo(x - wdt * 0.45, ty - 6 * z); ctx.lineTo(x, ty - 11 * z); ctx.lineTo(x + wdt * 0.45, ty - 6 * z); ctx.closePath();
        ctx.fillStyle = '#f4f8fb'; ctx.fill();
      }
    }
    return;
  }
  ctx.fillStyle = '#7a5235';
  ctx.beginPath(); ctx.rect(x - 2 * z, y - 8 * z, 4 * z, 10 * z); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y - 15 * z, 10 * z, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x - 3.5 * z, y - 18 * z, 4 * z, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
  if (theme.decor === 'round' && k < 0.3) {
    ctx.fillStyle = '#ff5a5a';
    for (const [ox, oy] of [[4, -12], [-5, -11], [1, -20]]) { ctx.beginPath(); ctx.arc(x + ox * z, y + oy * z, 1.6 * z, 0, Math.PI * 2); ctx.fill(); }
  }
}

function paperGrain() {
  const c = makeCanvas(160, 160);
  const g = c.getContext('2d');
  const rng = makeRng(7);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(80,60,30,0.07)' : 'rgba(255,255,255,0.08)';
    g.fillRect(rng() * 160, rng() * 160, 1 + rng() * 1.5, 1 + rng() * 1.5);
  }
  return c;
}

const MAX_PARTICLES = 420;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.insets = { top: 0, bottom: 0, side: 0 };
    this.view = makeView(1, 1);
    this.scene = null;
    this.bg = null;
    this.sprites = new Map();
    this.particles = [];
    this.arrows = [];
    this.nodeFx = [];
    this.t = 0;
    this.shake = 0;
    this.reduced = false;
    this.grain = paperGrain();
    this.grainPattern = null;
  }

  resize(w, h, dpr, insets = this.insets) {
    const same = w === this.w && h === this.h && dpr === this.dpr && JSON.stringify(insets) === JSON.stringify(this.insets);
    if (same && this.bg) return;
    this.w = w; this.h = h; this.dpr = dpr; this.insets = insets;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.view = makeView(w, h, insets, this.scene ? this.bounds : null);
    this.grainPattern = this.ctx.createPattern(this.grain, 'repeat');
    this.sprites.clear();
    if (this.scene) this.bake();
  }

  // scene: { world, palettes: {owner: pal}, emblems: {owner: emblem}, labels, theme }
  setScene(scene) {
    this.scene = scene;
    this.shapes = islandShapes(scene.world.nodes, scene.world.map.seed ?? 1);
    this.bounds = mapBounds(scene.world.nodes);
    this.view = makeView(this.w, this.h, this.insets, this.bounds);
    this.particles.length = 0;
    this.arrows.length = 0;
    this.nodeFx = scene.world.nodes.map(() => ({ squash: 0, hit: 0 }));
    this.shake = 0;
    this.bake();
  }

  palette(owner) {
    return (owner && this.scene.palettes[owner]) || NEUTRAL_COLOR;
  }

  bake() {
    const { w, h, dpr } = this;
    const bg = makeCanvas(Math.round(w * dpr), Math.round(h * dpr));
    const g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const theme = THEMES[this.scene.theme] || THEMES.clover;
    paintIslands(g, w, h, this.view, this.shapes, theme, this.scene.world.map.seed ?? 1, { nodes: this.scene.world.nodes });
    // Paper grain and a soft vignette.
    g.fillStyle = g.createPattern(this.grain, 'repeat');
    g.fillRect(0, 0, w, h);
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(40,30,60,0)');
    v.addColorStop(1, 'rgba(40,30,60,0.28)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
    this.bg = bg;
    // Buildings never move: sort them top to bottom once per layout.
    const nodes = this.scene.world.nodes;
    const sy = nodes.map((n) => this.view.toScreen(n.x, n.y).y);
    this.order = nodes.map((n) => n.id).sort((a, b) => sy[a] - sy[b]);
    // Sparkles on the sea.
    const rng = makeRng(99);
    this.glints = [];
    for (let i = 0; i < 40; i++) {
      const x = rng() * w, y = rng() * h;
      const wp = this.view.toWorld(x, y);
      if (!this.shapes.landAt(wp.x, wp.y)) this.glints.push({ x, y, ph: rng() * 6.28, sp: 0.6 + rng() });
    }
    this.sprites.clear();
  }

  spriteW(type) {
    return BUILDINGS[type].r * 2.8 * this.view.s;
  }

  buildingSprite(type, owner) {
    const pal = this.palette(owner);
    const emblem = owner ? this.scene.emblems?.[owner] : null;
    const key = `${type}|${pal.id}|${emblem}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const W = this.spriteW(type);
    const u = (W / 100) * this.dpr;
    c = makeCanvas(Math.ceil(100 * u + 4), Math.ceil(125 * u + 4));
    const g = c.getContext('2d');
    g.translate(2, 2 + 14 * u);
    g.scale(u, u);
    drawBuilding(g, type, pal, emblem);
    this.sprites.set(key, c);
    return c;
  }

  soldierSprite(owner, kind) {
    const pal = this.palette(owner);
    const key = `${kind}|${pal.id}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const size = kind === 'boat' ? this.boatSize() : this.soldierSize();
    const px = Math.ceil(size * this.dpr);
    c = makeCanvas(px, px);
    const g = c.getContext('2d');
    if (kind === 'boat') drawBoat(g, pal, px);
    else drawSoldier(g, pal, px);
    this.sprites.set(key, c);
    return c;
  }

  heroSprite(id, owner) {
    const pal = this.palette(owner);
    const key = `hero|${id}|${pal.id}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const px = Math.ceil(this.heroSize() * this.dpr);
    c = makeCanvas(px, px);
    drawHeroToken(c.getContext('2d'), id, pal, px);
    this.sprites.set(key, c);
    return c;
  }

  soldierSize() { return Math.max(10, 21 * this.view.s); }
  heroSize() { return Math.max(28, 54 * this.view.s); }
  boatSize() { return Math.max(20, 40 * this.view.s); }
  fontPx() { return Math.round(Math.max(13, Math.min(21, 26 * this.view.s))); }

  // ---------------------------------------------------------------- effects

  emit(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  burst(x, y, color, n, speed = 120, kind = 'confetti') {
    const count = this.reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      this.emit({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life: 0, max: 0.7 + Math.random() * 0.5, color, size: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
  }

  text(x, y, str, color) {
    this.emit({ kind: 'text', x, y, vx: 0, vy: -38, life: 0, max: 1.3, color, str, size: 0 });
  }

  ring(x, y, color, r = 40) {
    this.emit({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0, max: 0.55, color, size: r });
  }

  handleEvents(events, me = 1) {
    if (!this.scene) return;
    const world = this.scene.world;
    const v = this.view;
    for (const e of events) {
      if (e.type === 'capture') {
        const n = world.nodes[e.node];
        const p = v.toScreen(n.x, n.y);
        const pal = this.palette(e.owner);
        this.ring(p.x, p.y, pal.light, this.spriteW(n.type) * 0.7);
        this.burst(p.x, p.y - 10, pal.fill, 22, 160);
        this.burst(p.x, p.y - 10, '#fff4c2', 8, 120);
        this.nodeFx[e.node].squash = 1;
        if (e.owner === me) this.text(p.x, p.y - this.spriteW(n.type) * 0.55, e.prev ? 'Captured!' : 'Yours!', pal.dark);
        else if (e.prev === me) {
          this.text(p.x, p.y - this.spriteW(n.type) * 0.55, 'Lost!', '#7a2a2a');
          if (!this.reduced) this.shake = Math.max(this.shake, 0.35);
        }
      } else if (e.type === 'hold') {
        const n = world.nodes[e.node];
        const p = v.toScreen(n.x, n.y);
        this.burst(p.x, p.y, '#fff7d6', 7, 90, 'spark');
        this.nodeFx[e.node].hit = 1;
      } else if (e.type === 'reinforce') {
        const n = world.nodes[e.node];
        const p = v.toScreen(n.x, n.y);
        this.burst(p.x, p.y - 6, this.palette(e.owner).light, 5, 60, 'spark');
      } else if (e.type === 'send') {
        for (const id of e.from) {
          const n = world.nodes[id];
          const p = v.toScreen(n.x, n.y);
          this.emit({ kind: 'puff', x: p.x, y: p.y + 8, vx: 0, vy: -10, life: 0, max: 0.5, color: 'rgba(255,255,255,0.7)', size: 10 });
        }
      } else if (e.type === 'arrow') {
        const n = world.nodes[e.node];
        const a = v.toScreen(n.x, n.y);
        const b = v.toScreen(e.x, e.y);
        this.arrows.push({ x0: a.x, y0: a.y - this.spriteW('tower') * 0.5, x1: b.x, y1: b.y, t: 0, dur: 0.3 });
      } else if (e.type === 'clash') {
        const p = v.toScreen(e.x, e.y);
        this.emit({ kind: 'puff', x: p.x, y: p.y, vx: 0, vy: -8, life: 0, max: 0.6, color: 'rgba(255,250,235,0.85)', size: 14 });
        this.burst(p.x, p.y, '#fff2b0', 5, 80, 'spark');
      } else if (e.type === 'hero') {
        const n = world.nodes[e.node];
        const p = v.toScreen(n.x, n.y);
        this.burst(p.x, p.y - 10, '#ffe066', 16, 140, 'spark');
        this.text(p.x, p.y - this.spriteW(n.type) * 0.75, HEROES[e.hero].name + '!', '#7a5a00');
      }
    }
  }

  update(dt) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt);
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'confetti' || p.kind === 'spark') { p.vy += 260 * dt; p.vx *= 0.98; p.rot += p.vr * dt; }
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const a of this.arrows) a.t += dt;
    this.arrows = this.arrows.filter((a) => a.t < a.dur);
    for (const f of this.nodeFx) {
      f.squash = Math.max(0, f.squash - dt * 2.2);
      f.hit = Math.max(0, f.hit - dt * 4);
    }
  }

  // ---------------------------------------------------------------- draw

  // ui: { commander, me, pointer: {x, y} | null (screen), hover, cursor: id|null,
  //       showLetters, fraction, labels, banner }
  draw(ui = {}) {
    const ctx = this.ctx;
    const { dpr, w, h } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.scene || !this.bg) {
      ctx.fillStyle = '#3497bf';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      const k = this.shake * 10;
      sx = Math.sin(this.t * 70) * k;
      sy = Math.cos(this.t * 53) * k;
    }
    ctx.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
    ctx.drawImage(this.bg, -0, -0, w, h);
    const t = this.t;
    // Glints.
    ctx.fillStyle = '#ffffff';
    for (const gl of this.glints) {
      const a = Math.sin(t * gl.sp + gl.ph);
      if (a < 0.6) continue;
      ctx.globalAlpha = (a - 0.6) * 1.8;
      ctx.fillRect(gl.x - 4, gl.y, 8, 1.5);
      ctx.fillRect(gl.x - 1, gl.y - 2.5, 2, 6);
    }
    ctx.globalAlpha = 1;

    const world = this.scene.world;
    const v = this.view;
    const me = ui.me ?? 1;
    const selected = ui.commander ? ui.commander.selected : new Set();

    // March lines.
    ctx.lineWidth = Math.max(1.5, 3 * v.s);
    ctx.setLineDash([Math.max(2, 4 * v.s), Math.max(4, 9 * v.s)]);
    ctx.lineDashOffset = -t * 30;
    for (const m of world.marches) {
      const a = v.toScreen(m.x, m.y), b = v.toScreen(m.tx, m.ty);
      ctx.strokeStyle = this.palette(m.owner).fill;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Tower ranges for selected or hovered towers.
    for (const n of world.nodes) {
      if (n.type !== 'tower' || !n.owner) continue;
      if (!(selected.has(n.id) || ui.hover === n.id)) continue;
      const p = v.toScreen(n.x, n.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, BUILDINGS.tower.range * v.s, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Buildings, top to bottom on screen.
    for (const id of this.order) this.drawNode(world.nodes[id], ui, selected, me);

    // Drag preview.
    if (ui.preview) this.drawPreview(ui.preview, world, me);

    // Squads.
    for (const m of world.marches) this.drawSquad(m);

    // Arrows from towers.
    ctx.strokeStyle = '#4a3020';
    ctx.lineWidth = 2;
    for (const a of this.arrows) {
      const k = a.t / a.dur;
      const x = a.x0 + (a.x1 - a.x0) * k, y = a.y0 + (a.y1 - a.y0) * k - Math.sin(k * Math.PI) * 18;
      const dx = a.x1 - a.x0, dy = a.y1 - a.y0, d = Math.hypot(dx, dy) || 1;
      ctx.beginPath();
      ctx.moveTo(x - (dx / d) * 8, y - (dy / d) * 8);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    this.drawParticles();

    // Keyboard / gamepad cursor.
    if (ui.cursorPos) {
      const c = ui.cursorPos;
      const bob = this.reduced ? 0 : Math.sin(t * 6) * 3;
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(7, 18); ctx.lineTo(11, 12); ctx.lineTo(19, 12); ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  drawNode(n, ui, selected, me) {
    const ctx = this.ctx, v = this.view, t = this.t;
    const p = v.toScreen(n.x, n.y);
    const W = this.spriteW(n.type), u = W / 100;
    const pal = this.palette(n.owner);
    const fx = this.nodeFx[n.id];
    const isSel = selected.has(n.id);
    const isHover = ui.hover === n.id || ui.cursor === n.id;
    // Selection / hover ring on the ground.
    if (isSel || isHover || (ui.preview && ui.preview.target === n.id)) {
      const pulse = this.reduced ? 0 : Math.sin(t * 6) * 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 22 * u, W * 0.5 + pulse, W * 0.2 + pulse * 0.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.2)';
      ctx.fill();
      ctx.lineWidth = isSel ? 3.5 : 2.5;
      ctx.strokeStyle = isSel ? this.palette(me).light : '#ffffff';
      ctx.stroke();
      if (isSel) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
    }
    // Shield bubble.
    if (n.shield > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y - 4 * u, W * 0.58, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(160,220,255,0.18)';
      ctx.fill();
      ctx.strokeStyle = `rgba(190,235,255,${0.5 + 0.3 * Math.sin(t * 5)})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    if (n.boost > 0 && !this.reduced && Math.random() < 0.15) {
      this.emit({ kind: 'spark', x: p.x + (Math.random() - 0.5) * W * 0.8, y: p.y, vx: 0, vy: -50, life: 0, max: 0.8, color: '#c8ff9a', size: 3, rot: 0, vr: 0 });
    }
    const spr = this.buildingSprite(n.type, n.owner);
    const sq = fx.squash, hit = fx.hit;
    const sxk = 1 + Math.sin(sq * Math.PI) * 0.12, syk = 1 - Math.sin(sq * Math.PI) * 0.1;
    const dw = spr.width / this.dpr * sxk, dh = spr.height / this.dpr * syk;
    const jig = hit && !this.reduced ? Math.sin(t * 60) * 2 * hit : 0;
    // The sprite box has 14 units of headroom; the ground is at box y 80.
    const gx = p.x + jig, gy = p.y + 24 * u;
    ctx.drawImage(spr, gx - dw / 2, gy - (94 * u + 2) * syk, dw, dh);
    drawBuildingLive(ctx, n.type, pal, gx, gy, u, t + n.id, this.reduced);

    // Troop count pill.
    const count = Math.floor(n.troops);
    const fs = this.fontPx();
    ctx.font = `800 ${fs}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    const label = String(count);
    const tw = ctx.measureText(label).width;
    const pw = Math.max(fs * 1.7, tw + fs * 0.9), ph = fs * 1.35;
    const px = p.x - pw / 2, py = gy + 2;
    roundRect(ctx, px, py, pw, ph, ph / 2);
    ctx.fillStyle = n.owner ? pal.fill : '#f6f1e6';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = n.owner ? INK : '#8a8170';
    ctx.stroke();
    ctx.fillStyle = n.owner ? '#ffffff' : '#4a4236';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, py + ph / 2 + 1);
    // Full: a little gold pip says "send me!".
    if (n.owner === me && n.troops >= n.cap - 0.01) {
      ctx.beginPath();
      ctx.arc(px + pw - 2, py + 2, fs * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd34d';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    // Keyboard letter tag.
    if (ui.showLetters && ui.labels) {
      const L = ui.labels[n.id];
      const r = fs * 0.62;
      const lx = p.x - W * 0.42, ly = p.y - W * 0.38;
      ctx.beginPath();
      ctx.arc(lx, ly, r, 0, Math.PI * 2);
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.font = `800 ${Math.round(fs * 0.8)}px ui-rounded, system-ui, sans-serif`;
      ctx.fillStyle = INK;
      ctx.fillText(L, lx, ly + 1);
    }
  }

  drawPreview(pv, world, me) {
    const ctx = this.ctx, v = this.view;
    const pal = this.palette(me);
    const end = pv.target != null ? v.toScreen(world.nodes[pv.target].x, world.nodes[pv.target].y) : pv.point;
    if (!end) return;
    let total = 0;
    ctx.lineCap = 'round';
    for (const id of pv.from) {
      const n = world.nodes[id];
      if (id === pv.target) continue;
      total += sendCount(n.troops, pv.fraction);
      const a = v.toScreen(n.x, n.y);
      const mx = (a.x + end.x) / 2, my = (a.y + end.y) / 2 - Math.hypot(end.x - a.x, end.y - a.y) * 0.15;
      for (const [lw, col] of [[9, INK], [5.5, pal.light]]) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, end.x, end.y);
        ctx.lineWidth = lw;
        ctx.strokeStyle = col;
        ctx.stroke();
      }
      // Arrowhead.
      const ang = Math.atan2(end.y - my, end.x - mx);
      const back = pv.target != null ? this.spriteW(world.nodes[pv.target].type) * 0.3 : 0;
      const hx = end.x - Math.cos(ang) * back, hy = end.y - Math.sin(ang) * back;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - Math.cos(ang - 0.5) * 16, hy - Math.sin(ang - 0.5) * 16);
      ctx.lineTo(hx - Math.cos(ang + 0.5) * 16, hy - Math.sin(ang + 0.5) * 16);
      ctx.closePath();
      ctx.fillStyle = pal.light;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    if (pv.target != null && total > 0) {
      const fs = this.fontPx();
      const str = `${total}`;
      ctx.font = `800 ${fs}px ui-rounded, system-ui, sans-serif`;
      const tw = ctx.measureText(str).width + fs;
      const bx = end.x - tw / 2, by = end.y - this.spriteW(world.nodes[pv.target].type) * 0.75 - fs;
      roundRect(ctx, bx, by, tw, fs * 1.4, fs * 0.7);
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = pal.dark;
      ctx.stroke();
      ctx.fillStyle = pal.dark;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(str, end.x, by + fs * 0.72);
    }
  }

  drawSquad(m) {
    const ctx = this.ctx, v = this.view, t = this.t;
    const p = v.toScreen(m.x, m.y);
    const b = v.toScreen(m.tx, m.ty), a = v.toScreen(m.sx, m.sy);
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const onWater = !this.shapes.landAt(m.x, m.y);
    const fs = Math.max(11, this.fontPx() - 3);
    let topY;
    if (onWater) {
      const spr = this.soldierSprite(m.owner, 'boat');
      const S = this.boatSize() * (m.count > 20 ? 1.25 : 1);
      const bob = this.reduced ? 0 : Math.sin(t * 4 + m.id) * 2;
      ctx.drawImage(spr, p.x - S / 2, p.y - S * 0.7 + bob, S, S);
      topY = p.y - S * 0.7;
    } else {
      const spr = this.soldierSprite(m.owner, 'soldier');
      const S = this.soldierSize();
      const n = Math.min(m.count, m.count <= 6 ? m.count : Math.min(16, 5 + Math.ceil(Math.sqrt(m.count) * 1.6)));
      const cols = n <= 3 ? n : n <= 8 ? 3 : 4;
      const gap = S * 0.78;
      const px = -dy, py = dx;
      topY = p.y;
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / cols), col = i % cols;
        const inRow = Math.min(cols, n - row * cols);
        const off = (col - (inRow - 1) / 2) * gap;
        const x = p.x - dx * row * gap + px * off;
        const y = p.y - dy * row * gap + py * off - (this.reduced ? 0 : Math.abs(Math.sin(t * 11 + i * 1.3 + m.id)) * S * 0.18);
        ctx.drawImage(spr, x - S / 2, y - S / 2, S, S);
        topY = Math.min(topY, y - S / 2);
      }
    }
    if (m.hero) {
      const hs = this.heroSprite(m.hero, m.owner);
      const H = this.heroSize();
      ctx.drawImage(hs, p.x + dx * H * 0.6 - H / 2, p.y + dy * H * 0.6 - H * 0.75, H, H);
    }
    // Count chip.
    const label = String(m.count);
    ctx.font = `800 ${fs}px ui-rounded, system-ui, sans-serif`;
    const tw = ctx.measureText(label).width + fs * 0.8;
    const pal = this.palette(m.owner);
    const cy = topY - fs * 0.85;
    roundRect(ctx, p.x - tw / 2, cy - fs * 0.62, tw, fs * 1.24, fs * 0.62);
    ctx.fillStyle = pal.dark;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff8e8';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, cy + 1);
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.max(0, 1 - k);
      if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.kind === 'spark') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'puff') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + k), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 5 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + k), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'text') {
        const fs = this.fontPx();
        ctx.font = `900 ${fs}px ui-rounded, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#fffaf0';
        ctx.strokeText(p.str, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.str, p.x, p.y);
      }
    }
    ctx.globalAlpha = 1;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A small picture of a map for briefing and skirmish screens.
export function drawThumbnail(canvas, map, theme, palettes) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const nodes = map.nodes.map((n, id) => ({ ...n, id, r: BUILDINGS[n.type].r }));
  const view = makeView(w, h, {}, mapBounds(nodes));
  const shapes = islandShapes(nodes, map.seed ?? 1);
  paintIslands(ctx, w, h, view, shapes, THEMES[theme] || THEMES.clover, map.seed ?? 1, { nodes, detail: 0.35 });
  for (const n of nodes) {
    const p = view.toScreen(n.x, n.y);
    const pal = (n.owner && palettes[n.owner]) || NEUTRAL_COLOR;
    const r = Math.max(4, n.r * view.s * 0.6);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = pal.fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (n.type === 'castle') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }
}
