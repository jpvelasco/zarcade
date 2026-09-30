// Canvas renderer. Reads game state and events; never mutates the game.
// In tall (portrait) viewports the board is drawn transposed (columns run
// down the screen) so tiles stay big enough to tap.
import { COLS, ROWS, mapInfo, MAPS } from './maps.js';
import { DEFENDERS } from './data.js';
import * as S from './sprites.js';
import { makeRng } from './rng.js';

const TAU = Math.PI * 2;
const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';

export const THEMES = {
  lawn: { bg: ['#fff1c9', '#cde8a0'], grass: ['#9cd66b', '#90cc61'], dirt: ['#b88652', '#dcb27b', '#ecd09c'], lip: ['#9a6a45', '#6e4630'], tint: null, accent: '#ff7eb6' },
  veggie: { bg: ['#fbe3b1', '#d9cc8c'], grass: ['#a6cf66', '#99c55b'], dirt: ['#9c6b44', '#c8935f', '#ddb07c'], lip: ['#8a5a3b', '#5e3b26'], tint: null, accent: '#ff9f1c' },
  pond: { bg: ['#ffd6a0', '#a7d8c8'], grass: ['#8fd073', '#83c468'], dirt: ['#b0845a', '#d6ae80', '#e8c99b'], lip: ['#8c6242', '#5f412c'], tint: 'rgba(255, 150, 70, 0.10)', accent: '#58c4dd' },
};

export function themeFor(mapIndex) { return THEMES[MAPS[mapIndex].area]; }

// Screen mapping for a board: tile size, origin and optional transpose.
export class View {
  constructor(ts, ox, oy, transposed) { Object.assign(this, { ts, ox, oy, transposed }); }
  get cols() { return this.transposed ? ROWS : COLS; }
  get rows() { return this.transposed ? COLS : ROWS; }
  x(x, y) { return this.ox + (this.transposed ? y : x) * this.ts; }
  y(x, y) { return this.oy + (this.transposed ? x : y) * this.ts; }
  angle(a) { return this.transposed ? Math.atan2(Math.cos(a), Math.sin(a)) : a; }
  cell(px, py) {
    const a = Math.floor((px - this.ox) / this.ts), b = Math.floor((py - this.oy) / this.ts);
    const x = this.transposed ? b : a, y = this.transposed ? a : b;
    return x >= 0 && y >= 0 && x < COLS && y < ROWS ? { x, y } : null;
  }
}

// ------------------------------------------------------------ static terrain

export function paintTerrain(ctx, mapIndex, view, w, h, { background = true } = {}) {
  const info = mapInfo(mapIndex);
  const map = info.map;
  const theme = themeFor(mapIndex);
  const rng = makeRng(map.seed * 101 + 7);
  const ts = view.ts;
  const bw = view.cols * ts, bh = view.rows * ts;
  const { ox, oy } = view;
  const lip = ts * 0.3;

  if (background) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, theme.bg[0]);
    g.addColorStop(1, theme.bg[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // soft dappled light and far-off clover
    for (let i = 0; i < 40; i++) {
      const x = rng() * w, y = rng() * h, r = 20 + rng() * 80;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(120,170,80,0.08)';
      ctx.fill();
    }
  }

  // raised garden bed
  ctx.save();
  ctx.shadowColor = 'rgba(60, 40, 20, 0.35)';
  ctx.shadowBlur = ts * 0.5;
  ctx.shadowOffsetY = ts * 0.2;
  ctx.beginPath();
  ctx.roundRect(ox, oy + ts * 0.2, bw, bh + lip - ts * 0.2, ts * 0.35);
  const lg = ctx.createLinearGradient(0, oy + bh, 0, oy + bh + lip);
  lg.addColorStop(0, theme.lip[0]);
  lg.addColorStop(1, theme.lip[1]);
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.restore();
  // pebbles in the soil lip
  for (let i = 0; i < bw / (ts * 0.35); i++) {
    ctx.beginPath();
    ctx.ellipse(ox + ts * 0.3 + rng() * (bw - ts * 0.6), oy + bh + lip * (0.3 + rng() * 0.5), ts * (0.03 + rng() * 0.04), ts * 0.025, 0, 0, TAU);
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    ctx.fill();
  }

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ox, oy, bw, bh, ts * 0.35);
  ctx.clip();

  // mowed lawn stripes
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = view.x(x, y), py = view.y(x, y);
      ctx.fillStyle = theme.grass[x % 2];
      ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
      if ((x + y) % 2) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(px, py, ts + 0.5, ts + 0.5); }
    }
  }
  // grass tufts and tiny flowers
  for (const t of info.buildable) {
    const cx = view.x(t.x + 0.5, t.y + 0.5), cy = view.y(t.x + 0.5, t.y + 0.5);
    for (let k = 0; k < 3; k++) {
      const x = cx + (rng() - 0.5) * ts * 0.8, y = cy + (rng() - 0.5) * ts * 0.8;
      ctx.strokeStyle = 'rgba(50, 110, 40, 0.35)';
      ctx.lineWidth = Math.max(1, ts * 0.02);
      ctx.beginPath();
      ctx.moveTo(x - ts * 0.03, y); ctx.lineTo(x - ts * 0.05, y - ts * 0.07);
      ctx.moveTo(x, y); ctx.lineTo(x, y - ts * 0.09);
      ctx.moveTo(x + ts * 0.03, y); ctx.lineTo(x + ts * 0.05, y - ts * 0.07);
      ctx.stroke();
    }
    if (rng() < 0.18) {
      const x = cx + (rng() - 0.5) * ts * 0.6, y = cy + (rng() - 0.5) * ts * 0.6;
      const c = ['#ffffff', '#ffe066', '#ffb3c6', '#c8b6ff'][Math.floor(rng() * 4)];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * ts * 0.03, y + Math.sin(a) * ts * 0.03, ts * 0.025, 0, TAU);
        ctx.fillStyle = c;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, ts * 0.02, 0, TAU);
      ctx.fillStyle = '#ffb627';
      ctx.fill();
    }
  }

  // winding dirt paths
  const passes = [[0.9, theme.dirt[0]], [0.76, theme.dirt[1]], [0.36, theme.dirt[2]]];
  for (const [wd, color] of passes) {
    for (const r of info.routes) {
      ctx.beginPath();
      r.points.forEach((p, i) => (i ? ctx.lineTo(view.x(p.x, p.y), view.y(p.x, p.y)) : ctx.moveTo(view.x(p.x, p.y), view.y(p.x, p.y))));
      ctx.strokeStyle = color;
      ctx.globalAlpha = wd < 0.5 ? 0.55 : 1;
      ctx.lineWidth = ts * wd;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  for (const cells of info.cellPaths) {
    for (const c of cells) {
      for (let k = 0; k < 2; k++) {
        const x = view.x(c.x + 0.5 + (rng() - 0.5) * 0.6, c.y + 0.5 + (rng() - 0.5) * 0.6);
        const y = view.y(c.x + 0.5 + (rng() - 0.5) * 0.6, c.y + 0.5 + (rng() - 0.5) * 0.6);
        ctx.beginPath();
        ctx.ellipse(x, y, ts * (0.03 + rng() * 0.03), ts * 0.022, rng() * 3, 0, TAU);
        ctx.fillStyle = rng() < 0.5 ? 'rgba(120, 80, 40, 0.35)' : 'rgba(255, 245, 220, 0.5)';
        ctx.fill();
      }
    }
  }

  // pond water: overlapping blobs, then lily pads
  const water = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (map.layout[y][x] === 'w') water.push({ x, y });
  for (const [r, c] of [[0.64, '#6fb7c9'], [0.56, '#86d0e0'], [0.36, '#a5e3ee']]) {
    for (const t of water) {
      ctx.beginPath();
      ctx.arc(view.x(t.x + 0.5, t.y + 0.5), view.y(t.x + 0.5, t.y + 0.5), ts * r, 0, TAU);
      ctx.fillStyle = c;
      ctx.fill();
    }
  }
  for (const t of water) {
    if (rng() < 0.6) {
      const x = view.x(t.x + 0.3 + rng() * 0.4, t.y + 0.3 + rng() * 0.4), y = view.y(t.x + 0.3 + rng() * 0.4, t.y + 0.3 + rng() * 0.4);
      const a = rng() * TAU;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, ts * 0.16, a, a + TAU * 0.88);
      ctx.closePath();
      ctx.fillStyle = '#5fae3e';
      ctx.fill();
      if (rng() < 0.4) {
        ctx.beginPath();
        ctx.arc(x + ts * 0.04, y - ts * 0.03, ts * 0.05, 0, TAU);
        ctx.fillStyle = '#ffb3c6';
        ctx.fill();
      }
    }
  }

  // bug burrows where the path enters the garden
  for (const r of info.routes) {
    const p = r.points[0], q = r.points[1];
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const ex = p.x + ((q.x - p.x) / len) * 0.75, ey = p.y + ((q.y - p.y) / len) * 0.75;
    const sx = view.x(ex, ey), sy = view.y(ex, ey);
    ctx.beginPath();
    ctx.ellipse(sx, sy, ts * 0.42, ts * 0.42, 0, 0, TAU);
    ctx.fillStyle = 'rgba(80, 50, 25, 0.55)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(sx, sy, ts * 0.28, ts * 0.28, 0, 0, TAU);
    ctx.fillStyle = 'rgba(40, 22, 10, 0.75)';
    ctx.fill();
  }

  // Grandma's gingham picnic blanket
  const gx = view.x(info.goal.x + 0.5, info.goal.y + 0.5), gy = view.y(info.goal.x + 0.5, info.goal.y + 0.5);
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(-0.12);
  const B = ts * 1.5, n = 6;
  ctx.shadowColor = 'rgba(60,40,20,0.3)';
  ctx.shadowBlur = ts * 0.15;
  ctx.shadowOffsetY = ts * 0.05;
  ctx.fillStyle = '#fff8ee';
  ctx.fillRect(-B / 2, -B / 2, B, B);
  ctx.shadowColor = 'transparent';
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = 'rgba(230, 57, 70, 0.55)';
    if (i % 2 === 0) {
      ctx.fillRect(-B / 2 + (i * B) / n, -B / 2, B / n, B);
      ctx.fillRect(-B / 2, -B / 2 + (i * B) / n, B, B / n);
    }
  }
  ctx.strokeStyle = '#e63946';
  ctx.lineWidth = ts * 0.04;
  ctx.strokeRect(-B / 2, -B / 2, B, B);
  ctx.restore();

  ctx.restore(); // unclip
  if (theme.tint) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, theme.tint);
    g.addColorStop(1, 'rgba(255, 120, 150, 0.06)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

// Props that stand up off the ground (drawn y-sorted with everything else).
export function propsFor(mapIndex) {
  const map = MAPS[mapIndex];
  const out = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = map.layout[y][x];
    if ('trf'.includes(ch)) out.push({ ch, x: x + 0.5, y: y + 0.5, seed: x * 7 + y * 3 });
  }
  return out;
}

export function drawProp(ctx, ts, p, area, t) {
  if (p.ch === 't') {
    if (area === 'veggie') S.drawPumpkin(ctx, ts);
    else S.drawTree(ctx, ts, area === 'pond' ? 2 : p.seed % 2, t);
  } else if (p.ch === 'r') {
    if (area === 'lawn') S.drawGnome(ctx, ts);
    else if (area === 'veggie') S.drawWateringCan(ctx, ts);
    else S.drawRock(ctx, ts, true);
  } else if (p.ch === 'f') S.drawFlowerBed(ctx, ts, area, p.seed);
}

export function renderThumbnail(canvas, mapIndex) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = canvas.clientWidth || 160, h = canvas.clientHeight || 100;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ts = Math.min(w / COLS, h / (ROWS + 0.3));
  const view = new View(ts, (w - ts * COLS) / 2, (h - ts * (ROWS + 0.3)) / 2, false);
  paintTerrain(ctx, mapIndex, view, w, h);
  const area = MAPS[mapIndex].area;
  for (const p of propsFor(mapIndex).sort((a, b) => a.y - b.y)) {
    ctx.save();
    ctx.translate(view.x(p.x, p.y), view.y(p.x, p.y));
    drawProp(ctx, ts, p, area, 0);
    ctx.restore();
  }
}

// ------------------------------------------------------------ renderer

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.terrain = document.createElement('canvas');
    this.game = null;
    this.w = 1; this.h = 1; this.dpr = 1;
    this.view = new View(40, 0, 0, false);
    this.clock = 0;
    this.particles = [];
    this.texts = [];
    this.flyaways = [];
    this.zaps = [];
    this.pops = new Map(); // "x,y" -> clock when planted or upgraded
    this.shake = 0;
    this.grandmaGasp = 0;
    this.reduced = false;
    this.dirty = true;
  }

  setGame(game) {
    this.game = game;
    this.props = propsFor(game.mapIndex);
    this.area = game.map.area;
    this.particles = []; this.texts = []; this.flyaways = []; this.zaps = [];
    this.pops.clear();
    this.dirty = true;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const m = Math.max(6, Math.min(16, Math.min(w, h) * 0.02));
    const fit = (cols, rows) => Math.min((w - 2 * m) / cols, (h - 2 * m) / (rows + 0.3));
    const tsN = fit(COLS, ROWS), tsT = fit(ROWS, COLS);
    const transposed = tsT > tsN * 1.12;
    const ts = Math.floor(transposed ? tsT : tsN);
    const cols = transposed ? ROWS : COLS, rows = transposed ? COLS : ROWS;
    this.view = new View(ts, Math.round((w - cols * ts) / 2), Math.round((h - (rows + 0.3) * ts) / 2), transposed);
    this.dirty = true;
  }

  // Screen-space rectangle of a tile (for positioning DOM popups).
  tileRect(x, y) {
    const v = this.view;
    return { x: v.x(x, y), y: v.y(x, y), size: v.ts };
  }

  cellAt(px, py) { return this.view.cell(px, py); }

  repaintTerrain() {
    const { w, h, dpr } = this;
    this.terrain.width = Math.round(w * dpr);
    this.terrain.height = Math.round(h * dpr);
    const ctx = this.terrain.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintTerrain(ctx, this.game.mapIndex, this.view, w, h);
    this.dirty = false;
  }

  // ------------------------------------------------------------ effects

  handleEvents(events) {
    const many = this.reduced ? 0.4 : 1;
    for (const e of events) {
      switch (e.type) {
        case 'build':
          this.pops.set(`${Math.floor(e.x)},${Math.floor(e.y)}`, this.clock);
          this.burst(e.x, e.y + 0.2, 10 * many, ['#8a5a3b', '#6b4226', '#a3cf69'], 2.2, 'dot');
          break;
        case 'upgrade':
          this.pops.set(`${Math.floor(e.x)},${Math.floor(e.y)}`, this.clock);
          this.burst(e.x, e.y - 0.2, 16 * many, ['#ffe066', '#fff3c4', '#ffcf3f'], 2.5, 'star');
          break;
        case 'sell':
          this.burst(e.x, e.y, 12 * many, ['#7fc84a', '#a3cf69', '#5fae3e'], 2, 'leaf');
          this.text(e.x, e.y - 0.4, `+${e.value}`, '#ffd23f');
          break;
        case 'shoo':
          this.burst(e.x, e.y - (e.flying ? 0.35 : 0), (e.boss ? 26 : 8) * many, ['#ffffff', '#f4f1ea', '#e9f5ff'], e.boss ? 3 : 1.6, 'puff');
          this.flyaways.push({ type: e.bug, x: e.x, y: e.y - (e.flying ? 0.35 : 0), life: 1.1, max: 1.1, spin: (e.x * 13) % 2 > 1 ? 1 : -1, angle: e.angle });
          this.text(e.x, e.y - 0.45, `+${e.reward}`, '#ffd23f', e.boss ? 1.6 : 1);
          if (e.boss) this.shake = Math.max(this.shake, 0.5);
          break;
        case 'leak':
          this.text(e.x, e.y - 0.5, `−${e.amount}`, '#ff6b6b', 1.1);
          this.burst(e.x, e.y, 8 * many, ['#e63946', '#ffb3c6'], 2, 'dot');
          this.shake = Math.max(this.shake, 0.3);
          this.grandmaGasp = 1.2;
          break;
        case 'splash':
          if (e.kind === 'seed') {
            this.burst(e.x, e.y, 12 * many, ['#7a4a21', '#ffd23f', '#c8935f'], 2.8 * e.r, 'dot');
            this.ring(e.x, e.y, e.r, 'rgba(255, 230, 150, 0.8)');
          } else {
            this.burst(e.x, e.y, 10 * many, ['#ffb627', '#ffcf3f', '#f4a259'], 2 * e.r, 'dot');
          }
          break;
        case 'hit':
          this.burst(e.x, e.y, 3 * many, e.kind === 'pea' ? ['#8fdc5a', '#c7f59b'] : ['#b388eb', '#e4d4ff'], 1.2, 'dot');
          break;
        case 'zap':
          this.zaps.push({ points: e.points, life: 0.22, max: 0.22, tier: e.tier });
          break;
        case 'coin':
          this.text(e.x, e.y - 0.6, `+${e.amount}`, '#ffd23f', 1.1);
          this.burst(e.x, e.y - 0.4, 8 * many, ['#ffe066', '#fff3c4'], 1.5, 'star');
          break;
        case 'split':
          this.burst(e.x, e.y, 8 * many, ['#8bd346', '#c7f59b'], 1.6, 'dot');
          break;
        case 'bossSpawn':
          this.shake = Math.max(this.shake, 0.6);
          break;
        case 'summon':
          this.burst(e.x, e.y - 0.35, 5 * many, ['#ffd23f', '#fff'], 1.2, 'dot');
          break;
        default:
      }
    }
  }

  burst(x, y, n, colors, speed, kind) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x, y, vx: Math.cos(a) * v * 0.6, vy: Math.sin(a) * v * 0.4, z: 0.1, vz: 1 + Math.random() * speed,
        life: 0.5 + Math.random() * 0.4, max: 0.9, color: colors[i % colors.length], kind, size: 0.04 + Math.random() * 0.05, rot: Math.random() * TAU,
      });
    }
  }

  ring(x, y, r, color) {
    this.particles.push({ x, y, vx: 0, vy: 0, z: 0, vz: 0, life: 0.35, max: 0.35, color, kind: 'ring', size: r, rot: 0 });
  }

  text(x, y, str, color, scale = 1) {
    this.texts.push({ x, y, str, color, life: 1.1, max: 1.1, scale });
  }

  update(dt) {
    this.clock += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.grandmaGasp = Math.max(0, this.grandmaGasp - dt);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'puff') { p.vx *= 0.9; p.vy *= 0.9; p.z += dt * 0.6; }
      else { p.vz -= 7 * dt; p.z = Math.max(0, p.z + p.vz * dt); if (p.z === 0) { p.vx *= 0.8; p.vy *= 0.8; } }
      p.rot += dt * 4;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
    for (const t of this.texts) { t.life -= dt; t.y -= dt * 0.7; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const f of this.flyaways) { f.life -= dt; }
    this.flyaways = this.flyaways.filter((f) => f.life > 0);
    for (const z of this.zaps) z.life -= dt;
    this.zaps = this.zaps.filter((z) => z.life > 0);
  }

  // ------------------------------------------------------------ frame

  draw(ui = {}) {
    const { ctx, game, view: v, dpr } = this;
    if (!game) return;
    if (this.dirty) this.repaintTerrain();
    const ts = v.ts;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.drawImage(this.terrain, 0, 0, this.w, this.h);
    if (this.shake > 0 && !this.reduced) {
      const k = this.shake * ts * 0.08;
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
    const T = this.clock;
    const SX = (x, y) => v.x(x, y), SY = (x, y) => v.y(x, y);

    // slime and honey on the ground
    for (const s of game.slimes) {
      ctx.beginPath();
      ctx.ellipse(SX(s.x, s.y), SY(s.x, s.y), s.r * ts, s.r * ts * 0.8, 0, 0, TAU);
      ctx.fillStyle = `rgba(190, 230, 210, ${0.45 * Math.min(1, s.life / 1.5)})`;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(SX(s.x, s.y) - s.r * ts * 0.2, SY(s.x, s.y) - s.r * ts * 0.2, s.r * ts * 0.25, s.r * ts * 0.12, -0.4, 0, TAU);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * Math.min(1, s.life / 1.5)})`;
      ctx.fill();
    }
    for (const p of game.puddles) {
      const a = Math.min(1, p.life / 0.6);
      const x = SX(p.x, p.y), y = SY(p.x, p.y);
      const r = p.r * ts * 0.85;
      ctx.globalAlpha = 0.85 * a;
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const ang = (k / 12) * TAU;
        const wob = 1 + Math.sin(ang * 3 + p.x * 5) * 0.08;
        ctx.lineTo(x + Math.cos(ang) * r * wob, y + Math.sin(ang) * r * 0.78 * wob);
      }
      ctx.closePath();
      ctx.fillStyle = '#f5a524';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y - r * 0.05, r * 0.82, r * 0.6, 0, 0, TAU);
      ctx.fillStyle = '#ffc233';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - r * 0.35, y - r * 0.28, r * 0.25, r * 0.1, -0.4, 0, TAU);
      ctx.fillStyle = '#fff3c4';
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    this.drawOverlays(ui);

    // flyer shadows
    for (const b of game.bugs) {
      if (!b.flying) continue;
      ctx.beginPath();
      ctx.ellipse(SX(b.x, b.y), SY(b.x, b.y) + ts * 0.1, ts * b.def.size * 0.8, ts * b.def.size * 0.35, 0, 0, TAU);
      ctx.fillStyle = 'rgba(40, 60, 20, 0.18)';
      ctx.fill();
    }

    // y-sorted world
    const items = [];
    for (const p of this.props) items.push({ sy: SY(p.x, p.y), draw: () => this.drawPropAt(p) });
    for (const d of game.defenders) items.push({ sy: SY(d.x, d.y) + 0.1, draw: () => this.drawDefenderAt(d, ui) });
    for (const b of game.bugs) if (!b.flying) items.push({ sy: SY(b.x, b.y), draw: () => this.drawBugAt(b) });
    const g = game.info.goal;
    items.push({ sy: SY(g.x + 0.5, g.y + 0.5) - ts * 0.3, draw: () => this.drawPicnic() });
    items.sort((a, b) => a.sy - b.sy);
    for (const it of items) it.draw();

    if (ui.ghost) this.drawGhost(ui.ghost);

    for (const b of game.bugs) if (b.flying) this.drawBugAt(b);
    this.drawProjectiles();
    this.drawZaps();
    this.drawFlyaways();
    this.drawParticles();
    this.drawHealthBars();
    this.drawTexts();
    if (ui.cursor) this.drawCursor(ui.cursor);
    this.drawBossBar();
  }

  drawOverlays(ui) {
    const { ctx, game, view: v } = this;
    const ts = v.ts;
    const tile = (x, y, fill, stroke) => {
      ctx.beginPath();
      ctx.roundRect(v.x(x, y) + 2, v.y(x, y) + 2, ts - 4, ts - 4, ts * 0.18);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(2, ts * 0.05); ctx.stroke(); }
    };
    // placement grid hints while choosing where to plant
    if (ui.placing) {
      for (const t of game.info.buildable) if (game.canBuildAt(t.x, t.y)) tile(t.x, t.y, 'rgba(255,255,255,0.12)');
    }
    if (ui.hover && !ui.selected) {
      const ok = game.canBuildAt(ui.hover.x, ui.hover.y) || game.defenderAt(ui.hover.x, ui.hover.y);
      if (ui.placing) tile(ui.hover.x, ui.hover.y, game.canBuildAt(ui.hover.x, ui.hover.y) ? 'rgba(255,255,255,0.28)' : 'rgba(255,80,80,0.28)');
      else if (ok) tile(ui.hover.x, ui.hover.y, 'rgba(255,255,255,0.2)');
    }
    if (ui.site) {
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 5);
      tile(ui.site.x, ui.site.y, `rgba(255, 240, 180, ${0.25 + pulse * 0.15})`, 'rgba(255, 255, 255, 0.9)');
    }
    // lavender auras while a lantern is involved
    const showAuras = ui.placing === 'lavender' || ui.selected?.type === 'lavender';
    for (const d of game.defenders) {
      if (d.type !== 'lavender' || (!showAuras && d !== ui.selected)) continue;
      const r = DEFENDERS.lavender.tiers[d.tier].aura;
      this.rangeCircle(d.x, d.y, r, 'rgba(179, 136, 235, 0.16)', 'rgba(179, 136, 235, 0.7)');
    }
    const sel = ui.selected;
    if (sel && DEFENDERS[sel.type].tiers[sel.tier].range) {
      const r = game.statsOf(sel).range;
      this.rangeCircle(sel.x, sel.y, r, 'rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.85)');
    }
  }

  rangeCircle(x, y, r, fill, stroke) {
    const { ctx, view: v } = this;
    ctx.beginPath();
    ctx.ellipse(v.x(x, y), v.y(x, y), r * v.ts, r * v.ts, 0, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.setLineDash([v.ts * 0.12, v.ts * 0.08]);
    ctx.lineDashOffset = -this.clock * v.ts * 0.3;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1.5, v.ts * 0.03);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawGhost(g) {
    const { ctx, game, view: v } = this;
    const ok = game.canBuildAt(g.x, g.y) && game.coins >= DEFENDERS[g.type].tiers[0].cost;
    const t = DEFENDERS[g.type].tiers[0];
    if (t.range) this.rangeCircle(g.x + 0.5, g.y + 0.5, t.range, ok ? 'rgba(255,255,255,0.14)' : 'rgba(255,80,80,0.12)', ok ? 'rgba(255,255,255,0.8)' : 'rgba(255,90,90,0.8)');
    if (t.aura) this.rangeCircle(g.x + 0.5, g.y + 0.5, t.aura, 'rgba(179,136,235,0.14)', 'rgba(179,136,235,0.8)');
    ctx.save();
    ctx.globalAlpha = ok ? 0.75 : 0.4;
    ctx.translate(v.x(g.x + 0.5, g.y + 0.5), v.y(g.x + 0.5, g.y + 0.5));
    S.drawDefender(ctx, v.ts, g.type, { tier: 0, t: this.clock, aim: Math.PI / 2 });
    ctx.restore();
  }

  drawPropAt(p) {
    const { ctx, view: v } = this;
    ctx.save();
    ctx.translate(v.x(p.x, p.y), v.y(p.x, p.y));
    drawProp(ctx, v.ts, p, this.area, this.reduced ? 0 : this.clock);
    ctx.restore();
  }

  drawDefenderAt(d, ui) {
    const { ctx, game, view: v } = this;
    const ts = v.ts;
    const x = v.x(d.x, d.y), y = v.y(d.x, d.y);
    const popAt = this.pops.get(`${d.cx},${d.cy}`);
    let scale = 1;
    if (popAt !== undefined) {
      const k = (this.clock - popAt) / 0.45;
      if (k < 1) scale = k < 0.6 ? 0.2 + (k / 0.6) * 1.0 : 1.2 - ((k - 0.6) / 0.4) * 0.2; // sprout pops up with overshoot
      else this.pops.delete(`${d.cx},${d.cy}`);
    }
    const since = game.time - d.lastShot;
    const fire = since < 0.18 ? 1 - since / 0.18 : 0;
    ctx.save();
    ctx.translate(x, y + ts * 0.3);
    ctx.scale(scale, scale);
    ctx.translate(0, -ts * 0.3);
    if (d === ui.selected) {
      ctx.beginPath();
      ctx.ellipse(0, ts * 0.3, ts * 0.4, ts * 0.15, 0, 0, TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(2, ts * 0.05);
      ctx.stroke();
    }
    S.drawDefender(ctx, ts, d.type, {
      tier: d.tier, aim: v.angle(d.aim), t: this.reduced ? 0 : this.clock, phase: d.id * 0.7, fire,
      glow: d.type === 'daisy' && since < 0.8 ? 1 - since / 0.8 : 0,
    });
    // tier pips
    for (let i = 0; i < d.tier; i++) S.star(ctx, (i - (d.tier - 1) / 2) * ts * 0.14, ts * 0.42, ts * 0.06, '#ffd23f');
    if (d.aura.dmg > 0) {
      ctx.beginPath();
      ctx.arc(-ts * 0.3, -ts * 0.35, ts * 0.06, 0, TAU);
      ctx.fillStyle = 'rgba(179, 136, 235, 0.9)';
      ctx.fill();
    }
    ctx.restore();
  }

  drawBugAt(b) {
    const { ctx, view: v } = this;
    const ts = v.ts;
    const lift = b.flying ? ts * (0.38 + Math.sin(this.clock * 3 + b.phase * TAU) * 0.05) : 0;
    const x = v.x(b.x, b.y), y = v.y(b.x, b.y) - lift;
    ctx.save();
    ctx.translate(x, y);
    if (!b.flying) {
      ctx.beginPath();
      ctx.ellipse(ts * 0.02, ts * 0.08, ts * b.def.size * 0.9, ts * b.def.size * 0.45, 0, 0, TAU);
      ctx.fillStyle = 'rgba(40, 60, 20, 0.2)';
      ctx.fill();
    }
    if (b.slow > 0) {
      ctx.beginPath();
      ctx.ellipse(0, ts * 0.06, ts * b.def.size * 1.1, ts * b.def.size * 0.55, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255, 182, 39, 0.45)';
      ctx.fill();
    }
    const age = this.game.time - b.bornAt;
    if (age < 0.3) ctx.globalAlpha = age / 0.3;
    S.drawBug(ctx, ts * 1.25, b.type, { angle: v.angle(b.angle), t: this.reduced ? this.clock * 0.4 : this.clock, phase: b.phase, id: b.id });
    if (b.hurt > 0) {
      ctx.globalAlpha = (b.hurt / 0.12) * 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, ts * b.def.size * (b.boss ? 1.4 : 0.9), 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    if (b.slimed && !b.flying) {
      ctx.globalAlpha = 0.8;
      S.star(ctx, ts * 0.12, -ts * 0.16, ts * 0.04, '#c7f9e0');
    }
    ctx.restore();
  }

  drawHealthBars() {
    const { ctx, game, view: v } = this;
    const ts = v.ts;
    for (const b of game.bugs) {
      if (b.boss || b.hp >= b.maxHp) continue;
      const lift = b.flying ? ts * 0.38 : 0;
      const w = ts * 0.46, h = Math.max(3, ts * 0.07);
      const x = v.x(b.x, b.y) - w / 2, y = v.y(b.x, b.y) - lift - ts * (b.def.size + 0.2);
      ctx.fillStyle = 'rgba(40, 30, 20, 0.55)';
      ctx.beginPath(); ctx.roundRect(x - 1, y - 1, w + 2, h + 2, h); ctx.fill();
      const f = Math.max(0, b.hp / b.maxHp);
      ctx.fillStyle = f > 0.5 ? '#7ed957' : f > 0.25 ? '#ffc93c' : '#ff6b6b';
      ctx.beginPath(); ctx.roundRect(x, y, w * f, h, h); ctx.fill();
    }
  }

  drawBossBar() {
    const { ctx, game, view: v } = this;
    const bosses = game.bugs.filter((b) => b.boss);
    if (!bosses.length) return;
    const ts = v.ts;
    const bw = Math.min(v.cols * ts * 0.6, 420), h = Math.max(10, ts * 0.2);
    bosses.forEach((b, i) => {
      const x = v.ox + (v.cols * ts - bw) / 2, y = v.oy + v.rows * ts - ts * 0.35 - h - i * (h + ts * 0.42);
      ctx.fillStyle = 'rgba(60, 30, 40, 0.65)';
      ctx.beginPath(); ctx.roundRect(x - 3, y - 3, bw + 6, h + 6, h); ctx.fill();
      const g = ctx.createLinearGradient(x, 0, x + bw, 0);
      g.addColorStop(0, '#ff6b6b'); g.addColorStop(1, '#ffb347');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(x, y, bw * Math.max(0, b.hp / b.maxHp), h, h); ctx.fill();
      ctx.font = `800 ${Math.max(11, ts * 0.22)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(60, 30, 40, 0.7)';
      ctx.strokeText(b.def.name, x + bw / 2, y - 4);
      ctx.fillStyle = '#fff';
      ctx.fillText(b.def.name, x + bw / 2, y - 4);
    });
  }

  drawPicnic() {
    const { ctx, game, view: v } = this;
    const ts = v.ts;
    const g = game.info.goal;
    const cx = v.x(g.x + 0.5, g.y + 0.5), cy = v.y(g.x + 0.5, g.y + 0.5);
    ctx.save();
    ctx.translate(cx, cy);
    const n = game.baskets;
    for (let i = 0; i < game.maxBaskets; i++) {
      if (i >= n) continue;
      const a = (i / game.maxBaskets) * TAU - Math.PI / 2;
      ctx.save();
      ctx.translate(Math.cos(a) * ts * 0.5, Math.sin(a) * ts * 0.45);
      S.drawSnack(ctx, ts, i);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(0, -ts * 0.02);
    S.drawBasket(ctx, ts * 1.4, n > 0 ? 1 : 0);
    ctx.restore();
    // Grandma keeps an eye on her picnic from the corner of the blanket
    ctx.translate(ts * 0.62, -ts * 0.42);
    this.drawGrandma(ts);
    ctx.restore();
  }

  drawGrandma(ts) {
    const { ctx } = this;
    const gasp = this.grandmaGasp > 0;
    const bob = this.reduced ? 0 : Math.sin(this.clock * 2) * ts * 0.01;
    ctx.beginPath(); ctx.ellipse(0, ts * 0.2, ts * 0.2, ts * 0.06, 0, 0, TAU); ctx.fillStyle = 'rgba(40,40,20,0.2)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, ts * 0.08 + bob, ts * 0.17, ts * 0.15, 0, 0, TAU); ctx.fillStyle = '#b388eb'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, ts * 0.12 + bob, ts * 0.1, ts * 0.08, 0, 0, TAU); ctx.fillStyle = '#fff6f0'; ctx.fill();
    const hy = -ts * 0.1 + bob;
    ctx.beginPath(); ctx.arc(0, hy - ts * 0.1, ts * 0.07, 0, TAU); ctx.fillStyle = '#eceff4'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, hy, ts * 0.11, 0, TAU); ctx.fillStyle = '#f6d5b8'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, hy - ts * 0.03, ts * 0.11, Math.PI * 1.05, Math.PI * 1.95); ctx.fillStyle = '#eceff4'; ctx.fill();
    ctx.lineWidth = Math.max(1, ts * 0.012);
    ctx.strokeStyle = '#5a4a3a';
    for (const dx of [-0.045, 0.045]) { ctx.beginPath(); ctx.arc(dx * ts, hy + ts * 0.01, ts * 0.03, 0, TAU); ctx.stroke(); }
    ctx.beginPath();
    if (gasp) { ctx.arc(0, hy + ts * 0.06, ts * 0.022, 0, TAU); ctx.fillStyle = '#7a3b3b'; ctx.fill(); }
    else { ctx.arc(0, hy + ts * 0.045, ts * 0.03, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  }

  drawProjectiles() {
    const { ctx, game, view: v } = this;
    const ts = v.ts;
    for (const p of game.projectiles) {
      if (p.delay > 0) continue;
      const x = v.x(p.x, p.y), y = v.y(p.x, p.y);
      if (p.kind === 'pea') {
        ctx.beginPath(); ctx.arc(x, y - ts * 0.2, ts * (0.06 + p.tier * 0.01), 0, TAU); ctx.fillStyle = '#6cc644'; ctx.fill();
        ctx.beginPath(); ctx.arc(x - ts * 0.02, y - ts * 0.22, ts * 0.02, 0, TAU); ctx.fillStyle = '#d8ffb8'; ctx.fill();
      } else if (p.kind === 'thorn') {
        ctx.save();
        ctx.translate(x, y - ts * 0.35);
        ctx.rotate(v.angle(p.angle || 0));
        ctx.beginPath(); ctx.moveTo(ts * 0.12, 0); ctx.lineTo(-ts * 0.08, -ts * 0.035); ctx.lineTo(-ts * 0.08, ts * 0.035); ctx.closePath();
        ctx.fillStyle = '#8e5bd6'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-ts * 0.08, 0); ctx.lineTo(-ts * 0.2, 0); ctx.strokeStyle = 'rgba(179,136,235,0.5)'; ctx.lineWidth = ts * 0.03; ctx.stroke();
        ctx.restore();
      } else {
        // lobbed seed bombs and honey globs: shadow on the ground, body up in the arc
        ctx.beginPath(); ctx.ellipse(x, y, ts * 0.1, ts * 0.04, 0, 0, TAU); ctx.fillStyle = 'rgba(40,60,20,0.2)'; ctx.fill();
        const zy = y - (p.z || 0) * ts;
        if (p.kind === 'seed') {
          ctx.save();
          ctx.translate(x, zy);
          ctx.rotate(p.t * 12);
          ctx.beginPath(); ctx.ellipse(0, 0, ts * 0.1, ts * 0.065, 0, 0, TAU); ctx.fillStyle = '#5b3517'; ctx.fill();
          ctx.beginPath(); ctx.ellipse(0, 0, ts * 0.07, ts * 0.03, 0, 0, TAU); ctx.fillStyle = '#f6e3b4'; ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(x, zy, ts * 0.09, 0, TAU); ctx.fillStyle = '#ffb627'; ctx.fill();
          ctx.beginPath(); ctx.arc(x - ts * 0.03, zy - ts * 0.03, ts * 0.03, 0, TAU); ctx.fillStyle = '#fff3c4'; ctx.fill();
        }
      }
    }
  }

  drawZaps() {
    const { ctx, view: v } = this;
    const ts = v.ts;
    for (const z of this.zaps) {
      const a = z.life / z.max;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [wdt, color] of [[0.14, `rgba(179, 136, 235, ${0.35 * a})`], [0.05, `rgba(255, 255, 255, ${0.95 * a})`]]) {
        ctx.beginPath();
        z.points.forEach((p, i) => {
          const x = v.x(p.x, p.y), y = v.y(p.x, p.y) - ts * 0.15;
          if (!i) { ctx.moveTo(x, y); return; }
          const q = z.points[i - 1];
          const qx = v.x(q.x, q.y), qy = v.y(q.x, q.y) - ts * 0.15;
          for (let k = 1; k <= 3; k++) {
            const f = k / 4;
            const j = ((k * 7 + i * 13 + Math.floor(z.life * 60)) % 5 - 2) * ts * 0.05;
            ctx.lineTo(qx + (x - qx) * f + j, qy + (y - qy) * f - j);
          }
          ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = ts * wdt;
        ctx.stroke();
      }
      for (const p of z.points.slice(1)) S.star(ctx, v.x(p.x, p.y), v.y(p.x, p.y) - ts * 0.15, ts * 0.1 * a, `rgba(255, 240, 150, ${a})`);
      ctx.restore();
    }
  }

  drawFlyaways() {
    const { ctx, view: v } = this;
    const ts = v.ts;
    for (const f of this.flyaways) {
      const k = 1 - f.life / f.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k * 1.1);
      ctx.translate(v.x(f.x, f.y) + f.spin * k * ts * 0.9, v.y(f.x, f.y) - k * ts * 1.4 - Math.sin(k * Math.PI) * ts * 0.3);
      ctx.rotate(f.spin * k * 2.5);
      ctx.scale(1 - k * 0.4, 1 - k * 0.4);
      S.drawBug(ctx, ts * 1.25, f.type, { angle: v.angle(f.angle || 0), t: this.clock, phase: 0 });
      ctx.restore();
    }
  }

  drawParticles() {
    const { ctx, view: v } = this;
    const ts = v.ts;
    for (const p of this.particles) {
      const a = Math.min(1, p.life / p.max * 1.5);
      const x = v.x(p.x, p.y), y = v.y(p.x, p.y) - p.z * ts * 0.4;
      ctx.globalAlpha = a;
      if (p.kind === 'puff') {
        const r = ts * (0.1 + (1 - p.life / p.max) * 0.18);
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = p.color; ctx.fill();
      } else if (p.kind === 'star') {
        S.star(ctx, x, y, ts * p.size * 1.3, p.color);
      } else if (p.kind === 'leaf') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, ts * 0.07, ts * 0.035, 0, 0, TAU); ctx.fillStyle = p.color; ctx.fill();
        ctx.restore();
      } else if (p.kind === 'ring') {
        const k = 1 - p.life / p.max;
        ctx.beginPath(); ctx.ellipse(x, y, p.size * ts * (0.4 + k * 0.6), p.size * ts * (0.3 + k * 0.5), 0, 0, TAU);
        ctx.strokeStyle = p.color; ctx.lineWidth = ts * 0.06 * (1 - k); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(x, y, ts * p.size * 0.7, 0, TAU); ctx.fillStyle = p.color; ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTexts() {
    const { ctx, view: v } = this;
    const ts = v.ts;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = 1 - t.life / t.max;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
      ctx.globalAlpha = Math.min(1, t.life / 0.35);
      ctx.font = `900 ${Math.round(Math.max(12, ts * 0.3) * t.scale * pop)}px ${FONT}`;
      const x = v.x(t.x, t.y), y = v.y(t.x, t.y);
      ctx.lineWidth = Math.max(3, ts * 0.07);
      ctx.strokeStyle = 'rgba(90, 50, 20, 0.75)';
      ctx.strokeText(t.str, x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, x, y);
    }
    ctx.globalAlpha = 1;
  }

  drawCursor(c) {
    const { ctx, view: v } = this;
    const ts = v.ts;
    const x = v.x(c.x, c.y), y = v.y(c.x, c.y);
    const k = ts * 0.22, pad = 3 + Math.sin(this.clock * 6) * 1.5;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(3, ts * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [[x + pad, y + pad, 1, 1], [x + ts - pad, y + pad, -1, 1], [x + pad, y + ts - pad, 1, -1], [x + ts - pad, y + ts - pad, -1, -1]]) {
      ctx.moveTo(cx, cy + dy * k); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * k, cy);
    }
    ctx.stroke();
  }
}
