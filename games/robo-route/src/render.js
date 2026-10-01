// Isometric board renderer: baked block sprites, a baked lamp glow, Bolt the
// robot drawn with paths, and a capped particle pool. Reads the view; never
// changes game state.
import { cellAt } from './rules.js';

export const THEMES = {
  yard: { bg: ['#173247', '#2c6466'], top: '#f6e7c4', top2: '#efdcae', left: '#cfa66a', right: '#a9844e', line: '#e1c893', speck: '#ffffff' },
  lagoon: { bg: ['#0e2a48', '#1d6a8a'], top: '#b4eef0', top2: '#9fe2e6', left: '#4fb3c4', right: '#2f8ea4', line: '#8ad8de', speck: '#c8fbff' },
  gears: { bg: ['#2a1d2a', '#5c3a2a'], top: '#f8cf98', top2: '#efbd80', left: '#c98a52', right: '#9e6634', line: '#e2ad6e', speck: '#ffd9a0' },
  rainbow: { bg: ['#271c48', '#5a3a7e'], top: '#ece2ff', top2: '#dccdfb', left: '#a890e0', right: '#8068c0', line: '#cdbcf4', speck: '#ffd6f4' },
  stars: { bg: ['#0a0f2e', '#26306c'], top: '#9aa8f0', top2: '#8696e4', left: '#5a68c0', right: '#3c4796', line: '#7f8ee0', speck: '#ffffff' },
  daily: { bg: ['#132c33', '#2f5a4a'], top: '#d4f6dc', top2: '#bfeccb', left: '#6cc08a', right: '#4a9a6a', line: '#a8e2b8', speck: '#e8fff0' },
  custom: { bg: ['#2a2238', '#4a3e5e'], top: '#fde7d0', top2: '#f5d6b8', left: '#d49a7a', right: '#ad7658', line: '#ecc4a4', speck: '#fff2e0' },
};

const RED = { top: '#ff6b7d', top2: '#ff5a6e', left: '#d6455a', right: '#b03044' };
const BLUE = { top: '#5aa8ff', top2: '#4a96f4', left: '#3a7ad6', right: '#2a5eb0' };

const MAX_PARTICLES = 180;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export class Renderer {
  constructor(el, { reducedMotion = false } = {}) {
    this.canvas = el;
    this.ctx = el.getContext('2d');
    this.reduced = reducedMotion;
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.level = null;
    this.theme = THEMES.yard;
    this.themeName = 'yard';
    this.particles = [];
    this.time = 0;
    this.blocks = new Map();
    this.cursor = null;
    this.shake = 0;
    this.flash = 0;
    this.inset = { top: 0, bottom: 0, left: 0, right: 0 };
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.bakeBackground();
    if (this.level) this.layout();
  }

  setLevel(level, themeName = 'yard') {
    this.level = level;
    this.themeName = THEMES[themeName] ? themeName : 'yard';
    this.theme = THEMES[this.themeName];
    this.particles.length = 0;
    this.bakeBackground();
    this.layout();
  }

  // Fit the board in the canvas (minus HUD insets) and bake block sprites.
  layout() {
    const lv = this.level;
    const ins = this.inset;
    const availW = Math.max(60, this.w - ins.left - ins.right - 24);
    const availH = Math.max(60, this.h - ins.top - ins.bottom - 20);
    let maxH = 0;
    for (const c of lv.cells) if (c) maxH = Math.max(maxH, c.h);
    // Extents for tw = 1: width (w+h)/2, height (w+h)/4 + heights + base + Bolt.
    const ew = (lv.w + lv.h) / 2;
    const eh = (lv.w + lv.h) / 4 + maxH * 0.22 + 0.2 + 0.62;
    const tw = Math.max(26, Math.min(availW / ew, availH / eh, 150));
    this.tw = tw;
    this.th = tw / 2;
    this.bh = tw * 0.22;
    this.base = tw * 0.2;
    const boardW = ew * tw;
    const boardH = eh * tw;
    // Origin: the screen point of cell (0,0)'s top-face centre at height 0.
    this.ox = ins.left + (availW + 24 - boardW) / 2 + lv.h * tw / 2;
    this.oy = ins.top + (availH + 20 - boardH) / 2 + 0.62 * tw + maxH * this.bh + this.th / 2;
    this.bakeBlocks();
    this.bakeGlow();
  }

  screen(x, y, h) {
    return { x: this.ox + (x - y) * this.tw / 2, y: this.oy + (x + y) * this.th / 2 - h * this.bh };
  }

  // ------------------------------------------------------------ baking

  bakeBackground() {
    const t = this.theme;
    const W = Math.max(1, Math.round(this.w * this.dpr));
    const H = Math.max(1, Math.round(this.h * this.dpr));
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, t.bg[0]);
    grad.addColorStop(1, t.bg[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // Soft blobs and specks, seeded so they never jump around.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      g.globalAlpha = 0.025 + rnd() * 0.025;
      g.beginPath();
      g.arc(rnd() * W, rnd() * H, (0.06 + rnd() * 0.14) * Math.max(W, H), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = t.speck;
    for (let i = 0; i < 70; i++) {
      g.globalAlpha = 0.15 + rnd() * 0.35;
      const s = (0.6 + rnd() * 1.6) * this.dpr;
      g.fillRect(rnd() * W, rnd() * H, s, s);
    }
    // A faint dotted grid, like graph paper in a workshop.
    g.globalAlpha = 0.06;
    const step = 28 * this.dpr;
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) g.fillRect(x, y, 1.5 * this.dpr, 1.5 * this.dpr);
    g.globalAlpha = 1;
    this.bg = c;
  }

  // One sprite per (height, colour). Anchor: top-face centre at (ax, ay).
  bakeBlocks() {
    this.blocks.clear();
    const d = this.dpr;
    const tw = this.tw * d;
    const th = this.th * d;
    const bh = this.bh * d;
    const base = this.base * d;
    for (let h = 0; h <= 4; h++) {
      for (const col of ['', 'r', 'b']) {
        const depth = base + h * bh;
        const c = canvas(tw + 4, th + depth + 4);
        const g = c.getContext('2d');
        const ax = tw / 2 + 2;
        const ay = th / 2 + 2;
        const pal = col === 'r' ? RED : col === 'b' ? BLUE : this.theme;
        const left = col ? pal.left : this.theme.left;
        const right = col ? pal.right : this.theme.right;
        // Left face.
        g.fillStyle = left;
        g.beginPath();
        g.moveTo(ax - tw / 2, ay);
        g.lineTo(ax, ay + th / 2);
        g.lineTo(ax, ay + th / 2 + depth);
        g.lineTo(ax - tw / 2, ay + depth);
        g.closePath();
        g.fill();
        // Right face.
        g.fillStyle = right;
        g.beginPath();
        g.moveTo(ax + tw / 2, ay);
        g.lineTo(ax, ay + th / 2);
        g.lineTo(ax, ay + th / 2 + depth);
        g.lineTo(ax + tw / 2, ay + depth);
        g.closePath();
        g.fill();
        // Layer lines on tall columns.
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        g.lineWidth = Math.max(1, d);
        for (let k = 1; k <= h; k++) {
          const off = depth - k * bh;
          g.beginPath();
          g.moveTo(ax - tw / 2, ay + off);
          g.lineTo(ax, ay + th / 2 + off);
          g.lineTo(ax + tw / 2, ay + off);
          g.stroke();
        }
        // Top face with a soft inner bevel.
        g.fillStyle = col ? pal.top2 : (h % 2 ? this.theme.top2 : this.theme.top);
        diamond(g, ax, ay, tw, th);
        g.fill();
        g.fillStyle = col ? pal.top : this.theme.top;
        diamond(g, ax, ay - th * 0.04, tw * 0.84, th * 0.84);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = Math.max(1, 1.2 * d);
        g.beginPath();
        g.moveTo(ax - tw / 2, ay);
        g.lineTo(ax, ay - th / 2);
        g.lineTo(ax + tw / 2, ay);
        g.stroke();
        if (col) {
          // Pattern mark so colour reads without colour vision.
          g.fillStyle = 'rgba(255,255,255,0.92)';
          g.save();
          g.translate(ax, ay);
          g.scale(1, 0.5);
          if (col === 'r') {
            g.beginPath();
            g.arc(0, 0, tw * 0.11, 0, Math.PI * 2);
            g.fill();
          } else {
            g.rotate(Math.PI / 4);
            const s = tw * 0.16;
            g.fillRect(-s / 2, -s / 2, s, s);
          }
          g.restore();
        }
        this.blocks.set(`${h}${col}`, { c, ax, ay });
      }
    }
  }

  bakeGlow() {
    const d = this.dpr;
    const r = this.tw * 0.7 * d;
    const c = canvas(r * 2, r * 2);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,230,140,0.6)');
    grad.addColorStop(0.3, 'rgba(255,205,100,0.22)');
    grad.addColorStop(1, 'rgba(255,190,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, r * 2, r * 2);
    this.glow = { c, r };
  }

  // ---------------------------------------------------------- particles

  burst(x, y, h, kind, n = 12) {
    if (this.reduced) n = Math.ceil(n / 3);
    const p = this.screen(x, y, h);
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (kind === 'confetti' ? 120 : kind === 'spark' ? 160 : 60) * (0.4 + Math.random());
      this.particles.push({
        kind,
        x: p.x,
        y: p.y - (kind === 'confetti' ? this.tw * 0.5 : this.tw * 0.25),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.6 - (kind === 'confetti' ? 160 : kind === 'glow' ? 40 : 60),
        life: kind === 'confetti' ? 1.6 : kind === 'glow' ? 1.1 : 0.55,
        t: 0,
        c: kind === 'confetti' ? CONFETTI[i % CONFETTI.length] : kind === 'spark' ? (i % 2 ? '#ffd23f' : '#ff8a3c') : kind === 'zap' ? '#7fffd8' : kind === 'dust' ? '#ffffff' : '#fff1a0',
        s: kind === 'confetti' ? 4 + Math.random() * 4 : 2 + Math.random() * 3,
        rot: Math.random() * 6,
      });
    }
  }

  stepParticles(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t += dt;
      if (p.t >= p.life) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const grav = p.kind === 'confetti' ? 260 : p.kind === 'glow' ? -20 : 320;
      p.vy += grav * dt;
      p.vx *= 1 - dt * 1.5;
      p.rot += dt * 8;
    }
  }

  // --------------------------------------------------------------- draw

  // view: { bolt: { x, y, h, d, lift, mood, arm, squash, spin }, lit: bool[],
  //         got: bool[], paint, topper, ghost, dim }
  draw(dt, view) {
    this.time += dt;
    this.stepParticles(dt);
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    if (!this.level) return;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      if (!this.reduced) {
        sx = Math.sin(this.time * 70) * this.shake * 14;
        sy = Math.cos(this.time * 60) * this.shake * 6;
      }
    }
    ctx.setTransform(d, 0, 0, d, sx * d, sy * d);
    const lv = this.level;
    const bolt = view.bolt;
    // Bolt sorts with the cell he is in front of while moving.
    const boltKey = bolt ? Math.max(Math.round(bolt.x) + Math.round(bolt.y), Math.round(bolt.fx ?? bolt.x) + Math.round(bolt.fy ?? bolt.y)) : -1;
    let boltDrawn = !bolt;
    const sum = lv.w + lv.h - 2;
    for (let s = 0; s <= sum; s++) {
      for (let x = Math.max(0, s - lv.h + 1); x <= Math.min(lv.w - 1, s); x++) {
        const y = s - x;
        const cell = cellAt(lv, x, y);
        if (cell) this.drawCell(x, y, cell, view);
      }
      if (!boltDrawn && s === boltKey) {
        this.drawBoltOnBoard(bolt, view);
        boltDrawn = true;
      }
    }
    if (!boltDrawn) this.drawBoltOnBoard(bolt, view);
    this.drawParticles();
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = this.flash * 0.35;
      ctx.fillStyle = '#fff6c0';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
  }

  drawCell(x, y, cell, view) {
    const ctx = this.ctx;
    const d = this.dpr;
    const spr = this.blocks.get(`${cell.h}${cell.c}`);
    const p = this.screen(x, y, cell.h);
    ctx.drawImage(spr.c, p.x - spr.ax / d, p.y - spr.ay / d, spr.c.width / d, spr.c.height / d);
    const lv = this.level;
    const i = y * lv.w + x;
    if (this.cursor && this.cursor.x === x && this.cursor.y === y) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      diamond(ctx, p.x, p.y, this.tw * 0.92, this.th * 0.92);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (view.startMark && view.startMark.x === x && view.startMark.y === y) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      diamond(ctx, p.x, p.y, this.tw * 0.5, this.th * 0.5);
      ctx.fill();
    }
    if (cell.item === 'L') this.drawLamp(p, view.lit ? view.lit[lv.lamps.indexOf(i)] : false, i);
    else if (cell.item === 'B') {
      const got = view.got ? view.got[lv.batteries.indexOf(i)] : false;
      if (!got) this.drawBattery(p, i);
    }
  }

  drawLamp(p, lit, seed) {
    const ctx = this.ctx;
    const tw = this.tw;
    // Target ring on the floor.
    ctx.strokeStyle = lit ? 'rgba(255,214,90,0.9)' : 'rgba(40,60,90,0.35)';
    ctx.lineWidth = Math.max(1.5, tw * 0.03);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, tw * 0.3, tw * 0.15, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (lit) {
      const g = this.glow;
      const pulse = this.reduced ? 1 : 1 + Math.sin(this.time * 3 + seed) * 0.06;
      const r = (g.r / this.dpr) * pulse;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(g.c, p.x - r, p.y - tw * 0.38 - r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Post and bulb.
    const top = p.y - tw * 0.36;
    ctx.fillStyle = '#4a5468';
    ctx.fillRect(p.x - tw * 0.025, top + tw * 0.08, tw * 0.05, tw * 0.28);
    ctx.fillStyle = '#5c6880';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - tw * 0.01, tw * 0.09, tw * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lit ? '#fff2a8' : '#c8d2e4';
    ctx.beginPath();
    ctx.arc(p.x, top, tw * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lit ? '#ffd23f' : '#9aa6bc';
    ctx.beginPath();
    ctx.arc(p.x, top + tw * 0.015, tw * 0.065, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a4458';
    ctx.fillRect(p.x - tw * 0.06, top + tw * 0.075, tw * 0.12, tw * 0.035);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(p.x - tw * 0.035, top - tw * 0.035, tw * 0.025, 0, Math.PI * 2);
    ctx.fill();
  }

  drawBattery(p, seed) {
    const ctx = this.ctx;
    const tw = this.tw;
    const bob = this.reduced ? 0 : Math.sin(this.time * 3 + seed * 1.7) * tw * 0.03;
    const w = tw * 0.16;
    const h = tw * 0.26;
    const x = p.x - w / 2;
    const y = p.y - h - tw * 0.08 + bob;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, tw * 0.13, tw * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f8f6a';
    roundRect(ctx, x, y, w, h, w * 0.25);
    ctx.fill();
    ctx.fillStyle = '#44e0a0';
    roundRect(ctx, x + w * 0.12, y + h * 0.1, w * 0.76, h * 0.82, w * 0.18);
    ctx.fill();
    ctx.fillStyle = '#d0d8e0';
    ctx.fillRect(p.x - w * 0.22, y - h * 0.1, w * 0.44, h * 0.12);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(p.x + w * 0.1, y + h * 0.2);
    ctx.lineTo(p.x - w * 0.22, y + h * 0.55);
    ctx.lineTo(p.x, y + h * 0.55);
    ctx.lineTo(p.x - w * 0.1, y + h * 0.82);
    ctx.lineTo(p.x + w * 0.24, y + h * 0.45);
    ctx.lineTo(p.x + w * 0.02, y + h * 0.45);
    ctx.closePath();
    ctx.fill();
  }

  drawBoltOnBoard(b, view) {
    const ctx = this.ctx;
    const tw = this.tw;
    const floor = this.screen(b.x, b.y, b.floorH ?? b.h);
    const p = this.screen(b.x, b.y, b.h);
    // Shadow on whatever floor is below.
    const lift = b.lift || 0;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(floor.x, floor.y, tw * (0.2 - lift * 0.03), tw * (0.1 - lift * 0.015), 0, 0, Math.PI * 2);
    ctx.fill();
    // A chevron on the floor shows which way Bolt faces.
    if (view.chevron) {
      const dx = [0.5, 0.5, -0.5, -0.5][Math.round(b.d) & 3];
      const dy = [-0.25, 0.25, 0.25, -0.25][Math.round(b.d) & 3];
      const cx = floor.x + dx * tw * 0.62;
      const cy = floor.y + dy * tw * 0.62;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.moveTo(cx + dx * tw * 0.16, cy + dy * tw * 0.16);
      ctx.lineTo(cx - dy * tw * 0.2, cy + dx * tw * 0.1);
      ctx.lineTo(cx + dy * tw * 0.2, cy - dx * tw * 0.1);
      ctx.closePath();
      ctx.fill();
    }
    drawBolt(ctx, p.x, p.y - lift * tw * 0.5, tw, {
      d: b.d,
      paint: view.paint,
      topper: view.topper,
      mood: b.mood,
      arm: b.arm || 0,
      squash: b.squash || 0,
      t: this.time,
      blink: !this.reduced,
      tilt: b.tilt || 0,
      spin: b.spin || 0,
    });
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      } else if (p.kind === 'spark') {
        ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * (p.kind === 'dust' ? 1.6 * a + 0.5 : 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Which cell is under a canvas point? Front-most top face wins.
  pick(px, py) {
    const lv = this.level;
    if (!lv) return null;
    let best = null;
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        const c = cellAt(lv, x, y);
        const p = this.screen(x, y, c ? c.h : 0);
        const dx = Math.abs(px - p.x) / (this.tw / 2);
        const dy = Math.abs(py - p.y) / (this.th / 2);
        if (dx + dy <= 1 && (!best || x + y > best.x + best.y)) best = { x, y };
      }
    }
    return best;
  }

  // Board-space ghost outlines for empty cells (the editor uses this).
  drawGrid(dim = 0.25) {
    const lv = this.level;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.strokeStyle = `rgba(255,255,255,${dim})`;
    ctx.lineWidth = 1.5;
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        if (cellAt(lv, x, y)) continue;
        const p = this.screen(x, y, 0);
        diamond(ctx, p.x, p.y, this.tw * 0.9, this.th * 0.9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

const CONFETTI = ['#ff5e7a', '#ffd23f', '#3fd0c9', '#a684ff', '#7fe0a0', '#ff9a3c'];

function diamond(g, x, y, w, h) {
  g.beginPath();
  g.moveTo(x, y - h / 2);
  g.lineTo(x + w / 2, y);
  g.lineTo(x, y + h / 2);
  g.lineTo(x - w / 2, y);
  g.closePath();
}

export function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

const shadeCache = new Map();
function tone(hex, amt) {
  const k = hex + amt;
  let v = shadeCache.get(k);
  if (!v) { v = shade(hex, amt); shadeCache.set(k, v); }
  return v;
}

// Bolt, standing with his feet at (x, y). size ~ one tile width.
// opts: d (0 N,1 E,2 S,3 W, may be fractional while turning), paint
// {body, dark}, topper id, mood (happy/bonk/sleepy/shrug/wow), arm (0..1
// raise), squash (-1..1), t (time), tilt (radians), spin (0..1 twirl).
export function drawBolt(g, x, y, size, opts = {}) {
  const paint = opts.paint || { body: '#3fd0c9', dark: '#1f8f95' };
  const s = size;
  const dRaw = opts.d ?? 1;
  const d = ((Math.round(dRaw) % 4) + 4) % 4;
  // E and S face the viewer; N and W show his back. E/N lean right, S/W left.
  const front = d === 1 || d === 2;
  const side = d === 1 || d === 0 ? 1 : -1;
  const squash = opts.squash || 0;
  const sxS = 1 + squash * 0.18;
  const syS = 1 - squash * 0.18;
  const t = opts.t || 0;
  g.save();
  g.translate(x, y);
  if (opts.tilt) g.rotate(opts.tilt);
  g.scale(sxS * (opts.spin ? Math.cos(opts.spin * Math.PI * 2) : 1), syS);
  const bodyW = s * 0.4;
  const bodyH = s * 0.26;
  const headW = s * 0.46;
  const headH = s * 0.32;
  const bodyY = -s * 0.1 - bodyH;
  const headY = bodyY - headH + s * 0.02;
  // Treads.
  g.fillStyle = '#2a3142';
  roundRect(g, -bodyW * 0.55, -s * 0.13, bodyW * 1.1, s * 0.13, s * 0.06);
  g.fill();
  g.fillStyle = '#48526a';
  for (let i = 0; i < 4; i++) {
    const wx = -bodyW * 0.4 + i * bodyW * 0.27;
    g.beginPath();
    g.arc(wx, -s * 0.065, s * 0.035, 0, Math.PI * 2);
    g.fill();
  }
  // Arms (behind the body on the far side).
  const arm = opts.arm || 0;
  const shrug = opts.mood === 'shrug';
  const armAngle = shrug ? -1.9 : -0.25 - arm * 2.2;
  drawArm(g, -bodyW * 0.5, bodyY + bodyH * 0.35, s, shrug ? armAngle : 0.25 + Math.sin(t * 2) * 0.05, paint, -1);
  // Body.
  g.fillStyle = paint.dark;
  roundRect(g, -bodyW / 2, bodyY, bodyW, bodyH, s * 0.07);
  g.fill();
  g.fillStyle = paint.body;
  roundRect(g, -bodyW / 2, bodyY, bodyW, bodyH * 0.78, s * 0.07);
  g.fill();
  // Chest light / back panel.
  if (front) {
    g.fillStyle = '#1b2433';
    roundRect(g, -bodyW * 0.18 + side * bodyW * 0.08, bodyY + bodyH * 0.18, bodyW * 0.36, bodyH * 0.4, s * 0.025);
    g.fill();
    g.fillStyle = opts.mood === 'bonk' ? '#ff5e7a' : '#ffd23f';
    g.beginPath();
    g.arc(side * bodyW * 0.08, bodyY + bodyH * 0.38, s * 0.03, 0, Math.PI * 2);
    g.fill();
  } else {
    g.strokeStyle = tone(paint.dark, -0.1);
    g.lineWidth = s * 0.018;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(-bodyW * 0.22, bodyY + bodyH * (0.22 + i * 0.18));
      g.lineTo(bodyW * 0.22, bodyY + bodyH * (0.22 + i * 0.18));
      g.stroke();
    }
  }
  drawArm(g, bodyW * 0.5, bodyY + bodyH * 0.35, s, armAngle, paint, 1);
  // Neck.
  g.fillStyle = '#48526a';
  g.fillRect(-s * 0.05, bodyY - s * 0.03, s * 0.1, s * 0.05);
  // Antenna and topper.
  const ax = -side * headW * 0.18;
  const atop = headY - s * 0.17;
  g.strokeStyle = '#48526a';
  g.lineWidth = s * 0.025;
  g.beginPath();
  g.moveTo(ax, headY + s * 0.01);
  g.quadraticCurveTo(ax + Math.sin(t * 3) * s * 0.02, headY - s * 0.08, ax, atop);
  g.stroke();
  drawTopper(g, ax, atop, s, opts.topper || 'ball', t, paint);
  // Head.
  g.fillStyle = paint.dark;
  roundRect(g, -headW / 2, headY, headW, headH, s * 0.1);
  g.fill();
  g.fillStyle = tone(paint.body, 0.08);
  roundRect(g, -headW / 2, headY, headW, headH * 0.9, s * 0.1);
  g.fill();
  // Ear bolts.
  g.fillStyle = '#c8d2e4';
  g.beginPath();
  g.arc(-headW / 2, headY + headH * 0.5, s * 0.035, 0, Math.PI * 2);
  g.arc(headW / 2, headY + headH * 0.5, s * 0.035, 0, Math.PI * 2);
  g.fill();
  if (front) {
    // Face screen.
    const fx = -headW * 0.36 + side * headW * 0.05;
    const fw = headW * 0.72;
    const fy = headY + headH * 0.16;
    const fh = headH * 0.6;
    g.fillStyle = '#1b2433';
    roundRect(g, fx, fy, fw, fh, s * 0.06);
    g.fill();
    drawFace(g, fx + fw / 2 + side * fw * 0.06, fy + fh / 2, s, opts.mood, t, opts.blink !== false);
  } else {
    g.fillStyle = tone(paint.dark, -0.06);
    roundRect(g, -headW * 0.25 - side * headW * 0.05, headY + headH * 0.3, headW * 0.5, headH * 0.32, s * 0.04);
    g.fill();
    g.fillStyle = tone(paint.body, 0.2);
    g.beginPath();
    g.arc(-side * headW * 0.05, headY + headH * 0.46, s * 0.03, 0, Math.PI * 2);
    g.fill();
  }
  // Shine.
  g.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(g, -headW * 0.38, headY + headH * 0.06, headW * 0.3, headH * 0.1, s * 0.03);
  g.fill();
  if (paint.shine) {
    g.fillStyle = 'rgba(255,255,255,0.5)';
    const k = (t * 0.6) % 1;
    g.fillRect(-headW / 2 + headW * k, headY, s * 0.03, headH * 0.8);
  }
  g.restore();
}

function drawArm(g, x, y, s, angle, paint, dir) {
  g.save();
  g.translate(x, y);
  g.rotate(angle * dir);
  g.fillStyle = paint.dark;
  roundRect(g, -s * 0.03, 0, s * 0.06, s * 0.16, s * 0.03);
  g.fill();
  g.fillStyle = '#c8d2e4';
  g.beginPath();
  g.arc(0, s * 0.17, s * 0.04, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawFace(g, cx, cy, s, mood, t, blink) {
  const ew = s * 0.06;
  const eh = s * 0.09;
  const gap = s * 0.09;
  g.fillStyle = '#5ef0ff';
  g.strokeStyle = '#5ef0ff';
  g.lineWidth = s * 0.028;
  g.lineCap = 'round';
  if (mood === 'happy') {
    for (const k of [-1, 1]) {
      g.beginPath();
      g.arc(cx + k * gap, cy + eh * 0.2, ew * 0.75, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
  } else if (mood === 'bonk') {
    g.strokeStyle = '#ff8a9a';
    for (const k of [-1, 1]) {
      const ex = cx + k * gap;
      g.beginPath();
      g.moveTo(ex - ew * 0.6, cy - ew * 0.6);
      g.lineTo(ex + ew * 0.6, cy + ew * 0.6);
      g.moveTo(ex + ew * 0.6, cy - ew * 0.6);
      g.lineTo(ex - ew * 0.6, cy + ew * 0.6);
      g.stroke();
    }
  } else if (mood === 'sleepy') {
    for (const k of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + k * gap - ew * 0.7, cy + eh * 0.1);
      g.lineTo(cx + k * gap + ew * 0.7, cy + eh * 0.1);
      g.stroke();
    }
  } else if (mood === 'wow') {
    for (const k of [-1, 1]) {
      g.beginPath();
      g.arc(cx + k * gap, cy, ew * 0.7, 0, Math.PI * 2);
      g.stroke();
    }
  } else {
    const closed = blink && (t % 3.7) < 0.12;
    for (const k of [-1, 1]) {
      if (closed) {
        g.fillRect(cx + k * gap - ew / 2, cy - s * 0.008, ew, s * 0.016);
      } else {
        roundRect(g, cx + k * gap - ew / 2, cy - eh / 2, ew, eh, ew / 2);
        g.fill();
      }
    }
    if (mood === 'shrug') {
      g.beginPath();
      g.moveTo(cx - gap * 0.6, cy + eh * 0.85);
      g.lineTo(cx + gap * 0.6, cy + eh * 0.7);
      g.stroke();
      return;
    }
  }
  // Mouth.
  if (mood !== 'bonk' && mood !== 'sleepy') {
    g.beginPath();
    g.arc(cx, cy + eh * 0.55, s * 0.035, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  } else if (mood === 'bonk') {
    g.beginPath();
    g.arc(cx, cy + eh * 0.95, s * 0.03, 1.15 * Math.PI, 1.85 * Math.PI);
    g.stroke();
  }
}

export function drawTopper(g, x, y, s, id, t, paint) {
  g.save();
  g.translate(x, y);
  const r = s * 0.055;
  switch (id) {
    case 'spring': {
      g.strokeStyle = '#c8d2e4';
      g.lineWidth = s * 0.02;
      g.beginPath();
      for (let i = 0; i <= 12; i++) {
        const yy = -i * s * 0.008 - Math.abs(Math.sin(t * 4)) * i * s * 0.003;
        const xx = Math.sin(i * 1.6) * s * 0.03;
        if (i === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
      }
      g.stroke();
      g.fillStyle = '#ff5e7a';
      g.beginPath();
      g.arc(0, -s * 0.11 - Math.abs(Math.sin(t * 4)) * s * 0.035, r, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'star':
      g.fillStyle = '#ffd23f';
      star(g, 0, -r * 0.4, r * 1.5, r * 0.65, 5, t * 0.6);
      g.fill();
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + t * 0.5;
        g.fillStyle = '#ff9ad5';
        g.beginPath();
        g.arc(Math.cos(a) * r * 0.9, -r * 0.4 + Math.sin(a) * r * 0.9, r * 0.6, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(0, -r * 0.4, r * 0.55, 0, Math.PI * 2);
      g.fill();
      break;
    case 'propeller': {
      g.fillStyle = '#ff9a3c';
      g.beginPath();
      g.arc(0, 0, r * 0.5, 0, Math.PI * 2);
      g.fill();
      const k = Math.cos(t * 18);
      g.fillStyle = '#4a8dff';
      g.beginPath();
      g.ellipse(0, -r * 0.3, r * 2.4 * Math.abs(k) + r * 0.2, r * 0.35, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'heart':
      g.fillStyle = '#ff5e7a';
      g.beginPath();
      g.moveTo(0, r * 0.9);
      g.bezierCurveTo(-r * 2, -r * 0.4, -r * 0.9, -r * 1.9, 0, -r * 0.8);
      g.bezierCurveTo(r * 0.9, -r * 1.9, r * 2, -r * 0.4, 0, r * 0.9);
      g.fill();
      break;
    case 'dish':
      g.fillStyle = '#c8d2e4';
      g.beginPath();
      g.ellipse(0, -r * 0.6, r * 1.6, r * 0.8, -0.5 + Math.sin(t) * 0.3, 0, Math.PI);
      g.fill();
      g.fillStyle = '#ff5e7a';
      g.beginPath();
      g.arc(0, -r * 1.3, r * 0.4, 0, Math.PI * 2);
      g.fill();
      break;
    case 'crown':
      g.fillStyle = '#ffc94a';
      g.beginPath();
      g.moveTo(-r * 1.4, r * 0.4);
      g.lineTo(-r * 1.4, -r * 0.9);
      g.lineTo(-r * 0.7, -r * 0.1);
      g.lineTo(0, -r * 1.3);
      g.lineTo(r * 0.7, -r * 0.1);
      g.lineTo(r * 1.4, -r * 0.9);
      g.lineTo(r * 1.4, r * 0.4);
      g.closePath();
      g.fill();
      g.fillStyle = '#ff5e7a';
      g.beginPath();
      g.arc(0, -r * 0.1, r * 0.3, 0, Math.PI * 2);
      g.fill();
      break;
    default: {
      g.fillStyle = '#ff5e7a';
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath();
      g.arc(-r * 0.3, -r * 0.3, r * 0.35, 0, Math.PI * 2);
      g.fill();
    }
  }
  void paint;
  g.restore();
}

function star(g, x, y, R, r, n, rot = 0) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r : R;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

export { ease, lerp };
