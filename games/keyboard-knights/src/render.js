// Canvas renderer: the storybook road, the knight, monsters with word tags,
// confetti and the HUD. Reads battle state and never changes it.
import { REACH_X, VIEW_X, METER_MAX, HEARTS } from './battle.js';

// The DOM mute and pause buttons sit in this top-right corner (CSS px).
const HUD_CORNER = { w: 120, h: 66 };
import { REGIONS } from './stages.js';
import { mulberry32 } from './rng.js';
import { monsterSprite, knightSprite, swordSprite, petSprite, glowSprite } from './sprites.js';

const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const INK = '#3a2a3f';
const CONFETTI = ['#ff5d7a', '#ffb13d', '#ffe36b', '#6fe08a', '#5ec8ff', '#a77bff', '#ff8fd0'];
const MAX_PARTICLES = 260;

function layerCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.region = 0;
    this.look = { armour: 'tin', sword: 'wood', pet: 'none' };
    this.particles = [];
    this.rings = [];
    this.floaters = [];
    this.flyers = [];
    this.scroll = 0;
    this.time = 0;
    this.shake = 0;
    this.swing = 0;
    this.jab = 0;
    this.spin = 0;
    this.wave = -1;
    this.petHop = 0;
    this.heartPop = 0;
    this.banner = null;
    this.toasts = [];
    this.widthCache = new Map();
    this.lockScale = new Map();
    this.tops = new Map();
    this.resize();
  }

  setReducedMotion(on) { this.reduced = on; }

  resize() {
    const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : { width: innerWidth, height: innerHeight };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = Math.max(200, Math.round(rect.width));
    // Never taller than the stage, or the lanes would hide behind the keyboard.
    this.H = Math.max(120, Math.round(rect.height));
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    const { W, H } = this;
    this.horizon = H * 0.56;
    this.laneY = [H * 0.73, H * 0.83, H * 0.93];
    this.S = Math.max(46, Math.min(H * 0.2, W * (W < H ? 0.19 : 0.16), 150));
    this.knightX = Math.max(this.S * 0.7, W * 0.09);
    this.font = Math.round(Math.max(17, Math.min(30, this.S * 0.3)));
    this.widthCache.clear();
    this.spritePx = Math.round(Math.min(256, this.S * dpr * 1.9));
    this.bake();
  }

  setRegion(r) {
    if (r === this.region && this.layers) return;
    this.region = r;
    this.bake();
  }

  setLook(look) { this.look = { ...this.look, ...look }; }

  // ------------------------------------------------------------ backgrounds

  bake() {
    const { W, H, dpr } = this;
    const reg = REGIONS[this.region] || REGIONS[0];
    const w = Math.round(W * dpr);
    const h = Math.round(H * dpr);
    const sky = layerCanvas(w, h);
    const mid = layerCanvas(w, h);
    const road = layerCanvas(w, h);
    const rng = mulberry32(17 + this.region * 31);
    const paint = (c, fn) => { const g = c.getContext('2d'); g.scale(dpr, dpr); g.lineJoin = 'round'; g.lineCap = 'round'; fn(g); };
    paint(sky, (g) => this.paintSky(g, reg, rng));
    // Paint the scrolling props three times (shifted by a screen width) from
    // the same seed so trees cut by one edge continue on the other: seamless.
    const midSeed = 91 + this.region * 7;
    paint(mid, (g) => {
      for (const dx of [-W, 0, W]) {
        g.save(); g.translate(dx, 0); this.paintMid(g, reg, mulberry32(midSeed)); g.restore();
      }
    });
    paint(road, (g) => this.paintRoad(g, reg));
    const cloud = layerCanvas(Math.round(160 * dpr), Math.round(70 * dpr));
    paint(cloud, (g) => {
      g.fillStyle = this.region === 4 ? 'rgba(255,230,200,0.5)' : 'rgba(255,255,255,0.92)';
      for (const [x, y, r] of [[40, 44, 22], [70, 32, 28], [104, 40, 24], [128, 48, 16], [80, 52, 22]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    });
    this.layers = { sky, mid, road, cloud };
    this.clouds = Array.from({ length: 4 }, (_, i) => ({ x: rng() * W, y: H * (0.06 + rng() * 0.22), s: 0.6 + rng() * 0.6, v: 6 + i * 3 }));
  }

  paintSky(g, reg, rng) {
    const { W, H, horizon } = this;
    const grad = g.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, reg.sky[0]);
    grad.addColorStop(1, reg.sky[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    if (this.region === 4) {
      // The library: a cosy wall of bookshelves under a sunset window.
      g.fillStyle = 'rgba(255,240,200,0.9)';
      for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(rng() * W, rng() * horizon * 0.5, 1 + rng() * 1.5, 0, Math.PI * 2); g.fill(); }
      const shelfTop = horizon * 0.42;
      g.fillStyle = '#6b4a3a';
      g.fillRect(0, shelfTop, W, horizon - shelfTop);
      const rows = 3;
      const rowH = (horizon - shelfTop) / rows;
      for (let r = 0; r < rows; r++) {
        let x = 4;
        const y = shelfTop + r * rowH;
        while (x < W) {
          const bw = 8 + rng() * 12;
          const bh = rowH * (0.6 + rng() * 0.3);
          g.fillStyle = CONFETTI[Math.floor(rng() * CONFETTI.length)];
          g.globalAlpha = 0.75;
          g.fillRect(x, y + rowH - bh - 4, bw - 2, bh);
          g.globalAlpha = 1;
          x += bw + (rng() < 0.1 ? 14 : 0);
        }
        g.fillStyle = '#4e3428';
        g.fillRect(0, y + rowH - 4, W, 5);
      }
      return;
    }
    // sun
    g.fillStyle = 'rgba(255,248,214,0.95)';
    g.beginPath(); g.arc(W * 0.8, horizon * 0.32, Math.min(W, H) * 0.06, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,248,214,0.35)';
    g.beginPath(); g.arc(W * 0.8, horizon * 0.32, Math.min(W, H) * 0.1, 0, Math.PI * 2); g.fill();
    // two rows of hills
    const hills = (y, amp, color, seed) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, y - amp * (0.5 + 0.5 * Math.sin(x / (W * 0.18) + seed)) - amp * 0.3 * Math.sin(x / (W * 0.07) + seed * 2));
      g.lineTo(W, H);
      g.fill();
    };
    const far = { meadow: '#b7e3a0', woods: '#4f8a63', farm: '#f0cf7a', castle: '#d9d4ff' }[reg.id];
    const near = { meadow: '#9ad67f', woods: '#3f7a52', farm: '#cfe07a', castle: '#c4ccff' }[reg.id];
    hills(horizon, H * 0.1, far, 1.3);
    if (reg.id === 'castle') {
      // pastel towers far away
      for (const fx of [0.28, 0.62]) {
        const x = W * fx;
        g.fillStyle = '#efe6ff';
        g.fillRect(x - 30, horizon - H * 0.22, 60, H * 0.22);
        g.fillRect(x - 46, horizon - H * 0.14, 20, H * 0.14);
        g.fillRect(x + 26, horizon - H * 0.14, 20, H * 0.14);
        g.fillStyle = '#b29cff';
        for (const [tx, ty, tw] of [[x, horizon - H * 0.22, 34], [x - 36, horizon - H * 0.14, 14], [x + 36, horizon - H * 0.14, 14]]) {
          g.beginPath(); g.moveTo(tx - tw, ty); g.lineTo(tx, ty - tw * 1.3); g.lineTo(tx + tw, ty); g.fill();
        }
      }
    }
    hills(horizon + H * 0.03, H * 0.06, near, 4.1);
  }

  paintMid(g, reg, rng) {
    const { W, horizon, H } = this;
    const base = horizon + H * 0.06;
    const S = this.S;
    if (reg.id === 'meadow') {
      for (let i = 0; i < 5; i++) {
        const x = (i + rng() * 0.6) * (W / 5);
        const r = S * (0.35 + rng() * 0.2);
        g.fillStyle = '#7a5235';
        g.fillRect(x - r * 0.12, base - r * 1.2, r * 0.24, r * 1.2);
        g.fillStyle = i % 2 ? '#5fbf5a' : '#73c95c';
        for (const [dx, dy, rr] of [[0, -1.5, 0.75], [-0.5, -1.15, 0.55], [0.5, -1.15, 0.55]]) { g.beginPath(); g.arc(x + dx * r, base + dy * r, rr * r, 0, Math.PI * 2); g.fill(); }
      }
      g.strokeStyle = '#c99a63'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, base - 10); g.lineTo(W, base - 10); g.stroke();
      for (let x = 10; x < W; x += 34) { g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - 22); g.stroke(); }
    } else if (reg.id === 'woods') {
      for (let i = 0; i < 7; i++) {
        const x = (i + rng() * 0.5) * (W / 7);
        g.fillStyle = '#6d4a33';
        g.fillRect(x - S * 0.1, base - S * 2.4, S * 0.2, S * 2.4);
        g.fillStyle = '#2f6b45';
        g.beginPath(); g.moveTo(x - S * 0.6, base - S * 1.2); g.lineTo(x, base - S * 2.7); g.lineTo(x + S * 0.6, base - S * 1.2); g.fill();
      }
      for (let i = 0; i < 4; i++) {
        const x = (i + 0.3 + rng() * 0.4) * (W / 4);
        const r = S * (0.3 + rng() * 0.2);
        g.fillStyle = '#f6e6c8'; g.fillRect(x - r * 0.25, base - r * 0.9, r * 0.5, r * 0.9);
        g.fillStyle = '#e8484f'; g.beginPath(); g.ellipse(x, base - r * 0.9, r, r * 0.6, 0, Math.PI, 0); g.fill();
        g.fillStyle = '#fff4ea';
        g.beginPath(); g.arc(x - r * 0.4, base - r * 1.15, r * 0.12, 0, Math.PI * 2); g.arc(x + r * 0.3, base - r * 1.25, r * 0.14, 0, Math.PI * 2); g.fill();
      }
    } else if (reg.id === 'farm') {
      const bx = W * 0.3;
      g.fillStyle = '#d9534f';
      g.fillRect(bx - S * 0.8, base - S * 1.2, S * 1.6, S * 1.2);
      g.fillStyle = '#8a3a36';
      g.beginPath(); g.moveTo(bx - S * 0.95, base - S * 1.2); g.lineTo(bx, base - S * 1.8); g.lineTo(bx + S * 0.95, base - S * 1.2); g.fill();
      g.fillStyle = '#fff4ea';
      g.fillRect(bx - S * 0.25, base - S * 0.7, S * 0.5, S * 0.7);
      const wx = W * 0.78;
      g.fillStyle = '#efe2c8';
      g.beginPath(); g.moveTo(wx - S * 0.3, base); g.lineTo(wx - S * 0.18, base - S * 1.6); g.lineTo(wx + S * 0.18, base - S * 1.6); g.lineTo(wx + S * 0.3, base); g.fill();
      g.strokeStyle = '#8a6a4a'; g.lineWidth = 5;
      for (let a = 0; a < 4; a++) {
        const ang = a * Math.PI / 2 + 0.4;
        g.beginPath(); g.moveTo(wx, base - S * 1.6); g.lineTo(wx + Math.cos(ang) * S * 0.8, base - S * 1.6 + Math.sin(ang) * S * 0.8); g.stroke();
      }
      for (const hx of [0.08, 0.55, 0.95]) {
        g.fillStyle = '#f2c94c';
        g.beginPath(); g.ellipse(W * hx, base - S * 0.25, S * 0.4, S * 0.3, 0, Math.PI, 0); g.fill();
      }
      g.strokeStyle = '#fff4ea'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, base - 14); g.lineTo(W, base - 14); g.stroke();
      for (let x = 6; x < W; x += 30) { g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - 24); g.stroke(); }
    } else if (reg.id === 'castle') {
      g.globalAlpha = 0.85;
      const cx = W * 0.5;
      const rr = Math.min(W * 0.45, S * 3.2);
      CONFETTI.slice(0, 6).forEach((c, i) => {
        g.strokeStyle = c; g.lineWidth = Math.max(4, S * 0.08);
        g.beginPath(); g.arc(cx, base + 10, rr - i * g.lineWidth, Math.PI, 0); g.stroke();
      });
      g.globalAlpha = 1;
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(rng() * W, base - rng() * S * 0.3, S * (0.25 + rng() * 0.3), 0, Math.PI * 2); g.fill(); }
    } else {
      for (let i = 0; i < 4; i++) {
        const x = (i + 0.5) * (W / 4);
        g.fillStyle = '#4e3428';
        g.fillRect(x - 3, base - S * 1.3, 6, S * 1.3);
        g.fillStyle = '#ffd98a';
        g.beginPath(); g.moveTo(x - S * 0.3, base - S * 1.3); g.lineTo(x + S * 0.3, base - S * 1.3); g.lineTo(x + S * 0.18, base - S * 1.62); g.lineTo(x - S * 0.18, base - S * 1.62); g.fill();
        g.fillStyle = 'rgba(255,230,150,0.25)';
        g.beginPath(); g.arc(x, base - S * 1.3, S * 0.7, 0, Math.PI * 2); g.fill();
        let y = base;
        for (let b = 0; b < 3; b++) {
          const bw = S * (0.5 + rng() * 0.3);
          g.fillStyle = CONFETTI[(i + b * 2) % CONFETTI.length];
          g.fillRect(x + S * 0.35 - bw / 2, y - S * 0.14, bw, S * 0.14);
          y -= S * 0.14;
        }
      }
    }
  }

  paintRoad(g, reg) {
    const { W, H, horizon } = this;
    const top = horizon + H * 0.06;
    g.fillStyle = reg.ground;
    g.fillRect(0, top, W, H - top);
    const rt = this.laneY[0] - this.S * 0.12;
    g.fillStyle = reg.road;
    g.beginPath();
    g.moveTo(0, rt);
    const waves = Math.max(1, Math.round(W / 380));
    for (let x = 0; x < W; x += 10) g.lineTo(x, rt + Math.sin((x / W) * Math.PI * 2 * waves) * 3);
    g.lineTo(W, rt);
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(0, rt, W, 6);
    if (reg.id === 'library') {
      g.fillStyle = '#c94a5a';
      g.fillRect(0, rt + (H - rt) * 0.25, W, (H - rt) * 0.5);
      g.fillStyle = '#ffd34f';
      g.fillRect(0, rt + (H - rt) * 0.25, W, 3);
      g.fillRect(0, rt + (H - rt) * 0.75 - 3, W, 3);
    }
    // pebbles and dashes that scroll with the road
    g.fillStyle = 'rgba(80,50,30,0.18)';
    const gap = W / Math.max(1, Math.round(W / 46));
    for (let x = 12; x < W; x += gap) {
      g.beginPath(); g.ellipse(x, this.laneY[1] + this.S * 0.18, 9, 3, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x + 23, this.laneY[2] - this.S * 0.04, 4, 2, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    const gap2 = W / Math.max(1, Math.round(W / 70));
    for (let x = 30; x < W; x += gap2) { g.beginPath(); g.ellipse(x, this.laneY[0] + this.S * 0.06, 4, 2, 0, 0, Math.PI * 2); g.fill(); }
  }

  // ------------------------------------------------------------ mapping

  screenX(x) {
    const a = this.knightX + this.S * 0.75;
    return a + ((x - REACH_X) / (VIEW_X - REACH_X)) * (this.W * 0.95 - a);
  }

  laneScale(lane) { return [0.88, 1, 1.1][lane] ?? 1; }

  // ------------------------------------------------------------ effects

  reset() {
    this.particles.length = 0;
    this.rings.length = 0;
    this.floaters.length = 0;
    this.flyers.length = 0;
    this.toasts.length = 0;
    this.lockScale.clear();
    this.wave = -1;
    this.spin = 0;
    this.shake = 0;
  }

  showBanner(title, sub, time = 2.2) {
    this.banner = { title, sub, t: 0, time };
  }

  toast(text, color = '#ffd34f') {
    this.toasts.push({ text, color, t: 0 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  confetti(x, y, n) {
    const count = this.reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 260;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, life: 1.1 + Math.random() * 0.7, t: 0,
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, s: 4 + Math.random() * 5, c: CONFETTI[i % CONFETTI.length],
      });
    }
  }

  monsterPos(e) {
    const lane = e.lane ?? 1;
    return { x: this.screenX(e.x ?? 50), y: this.laneY[lane] - this.S * this.laneScale(lane) * 0.45 };
  }

  handleEvents(events) {
    for (const e of events) {
      if (e.type === 'key' && e.ok) this.jab = 1;
      else if (e.type === 'typo') {
        if (!this.reduced) this.shake = Math.max(this.shake, 0.18);
      } else if (e.type === 'poof') {
        const p = this.monsterPos(e);
        this.confetti(p.x, p.y, e.special ? 14 : 26);
        if (this.rings.length < 30) this.rings.push({ x: p.x, y: p.y, t: 0, big: false });
        if (this.floaters.length < 20) this.floaters.push({ x: p.x, y: p.y - this.S * 0.5, text: `+${e.points}`, t: 0, color: '#ffffff' });
        this.swing = 1;
        this.petHop = 1;
        this.lockScale.delete(e.id);
      } else if (e.type === 'bossHit') {
        const p = this.monsterPos(e);
        this.confetti(p.x, p.y, 20);
        this.rings.push({ x: p.x, y: p.y, t: 0, big: true });
        this.floaters.push({ x: p.x, y: p.y - this.S, text: `+${e.points}`, t: 0, color: '#ffe36b' });
        this.swing = 1;
        if (!this.reduced) this.shake = 0.25;
      } else if (e.type === 'bossDefeated') {
        const p = this.monsterPos(e);
        this.confetti(p.x, p.y, 90);
        this.rings.push({ x: p.x, y: p.y, t: 0, big: true });
        this.swing = 1;
        this.petHop = 1;
      } else if (e.type === 'bonk') {
        this.heartPop = 1;
        if (!this.reduced) this.shake = 0.35;
        this.flyers.push({ type: e.monster, boss: e.boss, lane: e.lane, x: this.knightX + this.S * 0.8, y: this.laneY[e.lane ?? 1], vx: 420, vy: -380, t: 0, rot: 0 });
        if (this.flyers.length > 8) this.flyers.shift();
      } else if (e.type === 'special') {
        this.wave = 0;
        this.spin = 1;
      } else if (e.type === 'combo') {
        this.floaters.push({ x: this.knightX, y: this.laneY[1] - this.S * 1.6, text: `Combo ${e.combo}!`, t: 0, color: '#ffe36b', big: true });
      } else if (e.type === 'meterFull') {
        this.toast('Star Spin ready!', '#ffe36b');
      }
    }
  }

  update(dt) {
    this.time += dt;
    this.scroll += dt * this.S * 0.35;
    this.shake = Math.max(0, this.shake - dt);
    this.swing = Math.max(0, this.swing - dt * 5);
    this.jab = Math.max(0, this.jab - dt * 9);
    this.spin = Math.max(0, this.spin - dt * 1.6);
    this.petHop = Math.max(0, this.petHop - dt * 3);
    this.heartPop = Math.max(0, this.heartPop - dt * 2);
    if (this.wave >= 0) { this.wave += dt * 1.8; if (this.wave > 1.2) this.wave = -1; }
    for (const c of this.clouds) { c.x -= c.v * dt; if (c.x < -200) c.x = this.W + 40; }
    const g = 640;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t > p.life) { this.particles.splice(i, 1); continue; }
      p.vy += g * dt;
      p.vx *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) if ((this.rings[i].t += dt) > 0.5) this.rings.splice(i, 1);
    for (let i = this.floaters.length - 1; i >= 0; i--) if ((this.floaters[i].t += dt) > 1.1) this.floaters.splice(i, 1);
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt; f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += dt * 8;
      if (f.t > 1.4) this.flyers.splice(i, 1);
    }
    for (let i = this.toasts.length - 1; i >= 0; i--) if ((this.toasts[i].t += dt) > 2.4) this.toasts.splice(i, 1);
    if (this.banner && (this.banner.t += dt) > this.banner.time) this.banner = null;
  }

  // ------------------------------------------------------------ drawing

  draw(battle, opts = {}) {
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0 && !this.reduced) {
      sx = (Math.random() - 0.5) * 10 * this.shake / 0.35;
      sy = (Math.random() - 0.5) * 6 * this.shake / 0.35;
    }
    ctx.drawImage(this.layers.sky, 0, 0, W, H);
    if (this.region !== 4) for (const c of this.clouds) ctx.drawImage(this.layers.cloud, c.x, c.y, 160 * c.s, 70 * c.s);
    // Snap scroll offsets to device pixels so the two tiles meet without a seam.
    const snap = (v) => Math.round(v * dpr) / dpr;
    const midOff = snap(-((this.scroll * 0.35) % W));
    ctx.drawImage(this.layers.mid, midOff, 0, W, H);
    ctx.drawImage(this.layers.mid, midOff + W - 1 / dpr, 0, W, H);
    ctx.translate(sx, sy);
    const roadOff = snap(-(this.scroll % W));
    ctx.drawImage(this.layers.road, roadOff, 0, W, H);
    ctx.drawImage(this.layers.road, roadOff + W - 1 / dpr, 0, W, H);

    if (battle) {
      this.drawMonsters(battle, opts);
      this.drawKnight(battle);
      this.drawFlyers();
      this.drawLabels(battle);
    }
    this.drawEffects();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (battle && !opts.attract) this.drawHud(battle, opts);
    this.drawOverlayText(opts);
  }

  drawMonsters(battle) {
    const { ctx, S } = this;
    const list = battle.monsters.slice().sort((a, b) => a.lane - b.lane || b.x - a.x);
    this.tops.clear();
    for (const m of list) {
      const scale = this.laneScale(m.lane) * (m.boss ? 1.75 : 1);
      const size = S * scale;
      const x = this.screenX(m.x);
      const feet = this.laneY[m.lane];
      const t = m.age * (m.state === 'wait' ? 5 : 8) + m.id;
      const hop = this.reduced ? 0 : Math.abs(Math.sin(t)) * size * 0.06;
      const squash = this.reduced ? 1 : 1 + Math.sin(t * 2) * 0.04;
      const fly = m.type === 'bee' || m.type === 'bat' || m.type === 'crane' || m.type === 'puff' || m.type === 'baronFluff';
      const lift = fly ? size * 0.25 + Math.sin(m.age * 3 + m.id) * size * 0.06 : hop;
      // shadow
      ctx.fillStyle = 'rgba(40,20,30,0.18)';
      ctx.beginPath();
      ctx.ellipse(x, feet - 2, size * 0.32, size * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      const img = monsterSprite(m.type, m.boss ? Math.min(400, this.spritePx * 1.6) : this.spritePx);
      const w = size * (2 - squash);
      const h = size * squash;
      ctx.drawImage(img, x - w / 2, feet - h * 0.96 - lift, w, h);
      if (battle.target === m.id && !this.reduced) {
        ctx.drawImage(glowSprite('rgba(255,227,107,0.5)', 64), x - size * 0.7, feet - size * 1.1 - lift, size * 1.4, size * 1.2);
        ctx.drawImage(img, x - w / 2, feet - h * 0.96 - lift, w, h);
      }
      this.tops.set(m.id, feet - h - lift);
    }
  }

  drawKnight(battle) {
    const { ctx, S } = this;
    const x = this.knightX;
    const feet = this.laneY[1];
    const size = S * 1.15;
    const frame = this.reduced ? 0 : Math.floor(this.time * 6) % 2;
    const stumble = battle.stumble > 0 ? battle.stumble / 0.35 : 0;
    ctx.save();
    ctx.translate(x, feet);
    ctx.fillStyle = 'rgba(40,20,30,0.2)';
    ctx.beginPath(); ctx.ellipse(0, -2, size * 0.32, size * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    const bob = this.reduced ? 0 : Math.abs(Math.sin(this.time * 6)) * size * 0.025;
    const tilt = -stumble * 0.25 + (this.spin > 0 ? 0 : 0);
    ctx.translate(0, -bob);
    ctx.rotate(tilt);
    if (this.spin > 0 && !this.reduced) ctx.scale(Math.cos(this.spin * Math.PI * 4), 1);
    ctx.drawImage(knightSprite(this.look.armour, frame, this.spritePx), -size / 2, -size * 0.96, size, size);
    // sword arm: pivot at the front hand
    const swing = this.swing > 0 ? Math.sin(this.swing * Math.PI) : 0;
    const angle = -0.35 + swing * 2.1 + this.jab * 0.35 - stumble * 0.6;
    ctx.save();
    ctx.translate(size * 0.2, -size * 0.36);
    ctx.rotate(angle);
    const sw = size * 0.8;
    ctx.drawImage(swordSprite(this.look.sword, this.spritePx), -sw / 2, -sw * 0.88, sw, sw);
    ctx.restore();
    ctx.fillStyle = '#cfd8e2';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(size * 0.2, -size * 0.36, size * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (stumble > 0) {
      // dizzy stars
      for (let i = 0; i < 3; i++) {
        const a = this.time * 6 + (i * Math.PI * 2) / 3;
        this.star(x + Math.cos(a) * size * 0.3, feet - size * 1.05 + Math.sin(a) * size * 0.08, size * 0.07, '#ffe36b');
      }
    }
    // pet companion
    const pet = petSprite(this.look.pet, Math.round(this.spritePx * 0.6));
    if (pet) {
      const ps = S * 0.6;
      const hop = this.reduced ? 0 : Math.abs(Math.sin(this.time * 7)) * ps * 0.1 + this.petHop * ps * 0.5;
      const px = x - S * 0.75;
      ctx.fillStyle = 'rgba(40,20,30,0.18)';
      ctx.beginPath(); ctx.ellipse(px, this.laneY[2] - 2, ps * 0.3, ps * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(pet, px - ps / 2, this.laneY[2] - ps * 0.96 - hop, ps, ps);
    }
  }

  drawFlyers() {
    const { ctx, S } = this;
    for (const f of this.flyers) {
      const size = S * (f.boss ? 1.6 : 1);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      ctx.translate(f.x, f.y - size * 0.5);
      ctx.rotate(f.rot);
      ctx.drawImage(monsterSprite(f.type, this.spritePx), -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  measure(text, fs) {
    const key = `${fs}|${text}`;
    let w = this.widthCache.get(key);
    if (w === undefined) {
      w = this.ctx.measureText(text).width;
      if (this.widthCache.size > 600) this.widthCache.clear();
      this.widthCache.set(key, w);
    }
    return w;
  }

  drawLabels(battle) {
    const { ctx } = this;
    const placed = [];
    const list = battle.monsters.slice().sort((a, b) => (a.id === battle.target ? -1 : b.id === battle.target ? 1 : a.x - b.x));
    for (const m of list) {
      const top = this.tops.get(m.id);
      if (top === undefined) continue;
      const locked = battle.target === m.id;
      const fs = Math.round(this.font * (m.boss ? 1.15 : m.word.length === 1 ? 1.7 : m.word.length <= 3 ? 1.2 : 1));
      ctx.font = `800 ${fs}px ${FONT}`;
      const prev = this.lockScale.get(m.id) || 1;
      const k = prev + ((locked ? 1.12 : 1) - prev) * 0.3;
      this.lockScale.set(m.id, k);
      const word = m.word;
      const tw = this.measure(word, fs);
      const padX = fs * 0.45;
      const w = (tw + padX * 2) * k;
      const h = fs * 1.5 * k;
      let cx = Math.min(this.W - w / 2 - 6, Math.max(w / 2 + 6, this.screenX(m.x)));
      let y = top - 8;
      // nudge up until it no longer overlaps an earlier tag
      for (let tries = 0; tries < 6; tries++) {
        const hit = placed.find((r) => cx - w / 2 < r.x + r.w && cx + w / 2 > r.x && y - h < r.y + r.h && y > r.y);
        if (!hit) break;
        y = hit.y - 4;
      }
      y = Math.max(h + 4, y);
      // Keep clear of the mute and pause buttons in the top-right corner.
      if (y - h - (m.boss ? 18 : 0) < HUD_CORNER.h && cx + w / 2 > this.W - HUD_CORNER.w) cx = Math.max(w / 2 + 6, this.W - HUD_CORNER.w - w / 2);
      placed.push({ x: cx - w / 2, y: y - h, w, h });
      const x0 = cx - w / 2;
      ctx.save();
      ctx.translate(x0, y - h);
      ctx.scale(k, k);
      const bw = tw + padX * 2;
      const bh = fs * 1.5;
      ctx.fillStyle = 'rgba(58,42,63,0.25)';
      ctx.beginPath(); ctx.roundRect(0, 4, bw, bh, bh * 0.35); ctx.fill();
      ctx.fillStyle = m.boss ? '#fff4d6' : '#fffaf0';
      ctx.beginPath(); ctx.roundRect(0, 0, bw, bh, bh * 0.35); ctx.fill();
      ctx.lineWidth = locked ? 4 : 2.5;
      ctx.strokeStyle = locked ? '#ffb13d' : INK;
      ctx.stroke();
      // little tail pointing at the monster
      ctx.fillStyle = m.boss ? '#fff4d6' : '#fffaf0';
      ctx.beginPath(); ctx.moveTo(bw / 2 - 6, bh - 1); ctx.lineTo(bw / 2, bh + 7); ctx.lineTo(bw / 2 + 6, bh - 1); ctx.fill();
      const baseY = bh * 0.7;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      const typed = word.slice(0, m.typed);
      const tx = padX;
      const typedW = typed ? this.measure(typed, fs) : 0;
      if (typed) { ctx.fillStyle = '#2e9e44'; ctx.fillText(typed, tx, baseY); }
      const next = word[m.typed];
      if (next !== undefined) {
        const nw = next === ' ' ? fs * 0.4 : this.measure(next, fs);
        ctx.fillStyle = locked ? '#ffe9b0' : 'rgba(255,177,61,0.25)';
        ctx.fillRect(tx + typedW - 1, baseY - fs * 0.82, nw + 2, fs * 1.0);
        ctx.fillStyle = '#ff7a1a';
        ctx.fillRect(tx + typedW, baseY + fs * 0.12, nw, 3);
        ctx.fillStyle = INK;
        ctx.fillText(word.slice(m.typed), tx + typedW, baseY);
      }
      ctx.restore();
      if (m.boss) this.drawBossHp(m, cx, y - h - 6);
    }
  }

  drawBossHp(m, cx, y) {
    const n = m.phrases.length;
    const r = 6;
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * (r * 2.6);
      this.ctx.fillStyle = i < m.hp ? '#ff5d7a' : 'rgba(255,255,255,0.5)';
      this.ctx.strokeStyle = INK;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath(); this.ctx.arc(x, y - r, r, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke();
    }
  }

  star(x, y, r, color) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  drawEffects() {
    const { ctx, S } = this;
    for (const r of this.rings) {
      const k = r.t / 0.5;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ffffff';
      const base = S * (r.big ? 0.6 : 0.35);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(r.x + Math.cos(a) * base * (0.6 + k), r.y + Math.sin(a) * base * (0.6 + k) * 0.7, base * (0.45 - k * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, (p.life - p.t) * 2);
      ctx.fillStyle = p.c;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (this.wave >= 0) {
      const x = this.knightX + (this.W * 1.1) * Math.min(1, this.wave);
      ctx.globalAlpha = Math.max(0, 1 - this.wave * 0.8);
      ctx.drawImage(glowSprite('rgba(255,227,107,0.9)', 64), x - S * 1.5, this.laneY[0] - S * 2, S * 3, S * 3);
      for (let i = 0; i < 5; i++) this.star(x - i * S * 0.4, this.laneY[i % 3] - S * 0.6, S * 0.18, i % 2 ? '#fff' : '#ffe36b');
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const k = f.t / 1.1;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `900 ${Math.round(this.font * (f.big ? 1.2 : 0.95))}px ${FONT}`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.strokeText(f.text, f.x, f.y - k * S * 0.6);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - k * S * 0.6);
    }
    ctx.globalAlpha = 1;
  }

  heart(x, y, r, full) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.35);
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
    ctx.fillStyle = full ? '#ff5d7a' : 'rgba(255,255,255,0.35)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  drawHud(battle, opts) {
    const { ctx, W, H } = this;
    const pad = 14;
    const r = Math.max(10, Math.min(15, W * 0.03));
    const top = pad + r;
    if (!battle.gentle) {
      for (let i = 0; i < HEARTS; i++) {
        const pop = i === battle.hearts && this.heartPop > 0 ? 1 + this.heartPop * 0.5 : 1;
        this.heart(pad + r + i * r * 2.6, top, r * pop, i < battle.hearts);
      }
    }
    ctx.font = `900 ${Math.round(r * 1.5)}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const scoreX = battle.gentle ? pad : pad + r * 2.6 * HEARTS + 4;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(58,42,63,0.8)';
    const scoreText = battle.score.toLocaleString('en-US');
    ctx.strokeText(scoreText, scoreX, top + 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(scoreText, scoreX, top + 1);
    // progress along the road
    const pw = Math.min(200, W * 0.32);
    const py = top + r + 10;
    ctx.fillStyle = 'rgba(58,42,63,0.35)';
    ctx.beginPath(); ctx.roundRect(pad, py, pw, 8, 4); ctx.fill();
    ctx.fillStyle = '#6fe08a';
    ctx.beginPath(); ctx.roundRect(pad, py, Math.max(8, pw * battle.progress), 8, 4); ctx.fill();
    if (opts.stageName) {
      ctx.font = `800 ${Math.round(r * 1.05)}px ${FONT}`;
      ctx.strokeStyle = 'rgba(58,42,63,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(opts.stageName, pad, py + 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(opts.stageName, pad, py + 22);
    }
    // combo above the knight
    if (battle.combo >= 2) {
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.round(this.font * 0.8)}px ${FONT}`;
      const text = `×${battle.combo}`;
      const cy = this.laneY[1] - this.S * 1.45;
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.strokeText(text, this.knightX, cy);
      ctx.fillStyle = battle.combo >= 10 ? '#ff8fd0' : battle.combo >= 5 ? '#ffe36b' : '#fff';
      ctx.fillText(text, this.knightX, cy);
    }
    // Star Spin meter along the bottom left
    if (opts.showMeter !== false) {
      const mw = Math.min(220, W * 0.4);
      const mh = 14;
      const mx = pad;
      const my = H - pad - mh;
      const full = battle.meter >= METER_MAX;
      ctx.fillStyle = 'rgba(58,42,63,0.55)';
      ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, mh / 2); ctx.fill();
      ctx.fillStyle = full ? (Math.floor(this.time * 4) % 2 && !this.reduced ? '#fff4b0' : '#ffd34f') : '#ffd34f';
      ctx.beginPath(); ctx.roundRect(mx, my, Math.max(mh, mw * (battle.meter / METER_MAX)), mh, mh / 2); ctx.fill();
      ctx.font = `900 ${Math.round(mh * 1.05)}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      const label = full ? (opts.touch ? '★ Star Spin ready! Tap ★' : '★ Star Spin ready! Press Enter') : '★ Star Spin';
      ctx.strokeText(label, mx, my - 10);
      ctx.fillStyle = full ? '#ffe36b' : '#fff';
      ctx.fillText(label, mx, my - 10);
    }
    if (opts.hint) {
      ctx.textAlign = 'center';
      ctx.font = `800 ${Math.round(this.font * 0.7)}px ${FONT}`;
      const y = this.horizon * 0.45;
      const tw = ctx.measureText(opts.hint).width + 28;
      ctx.fillStyle = 'rgba(58,42,63,0.72)';
      ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, y - 18, tw, 36, 18); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(opts.hint, W / 2, y);
    }
  }

  drawOverlayText() {
    const { ctx, W, H } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.banner) {
      const b = this.banner;
      const k = Math.min(1, b.t / 0.25);
      const out = Math.max(0, (b.t - (b.time - 0.4)) / 0.4);
      ctx.globalAlpha = Math.min(k, 1 - out);
      const y = this.horizon * 0.42;
      ctx.font = `900 ${Math.round(Math.min(48, W * 0.08))}px ${FONT}`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = INK;
      ctx.strokeText(b.title, W / 2, y);
      ctx.fillStyle = '#fff4b0';
      ctx.fillText(b.title, W / 2, y);
      if (b.sub) {
        ctx.font = `800 ${Math.round(Math.min(22, W * 0.042))}px ${FONT}`;
        ctx.lineWidth = 5;
        ctx.strokeText(b.sub, W / 2, y + Math.min(44, W * 0.075));
        ctx.fillStyle = '#fff';
        ctx.fillText(b.sub, W / 2, y + Math.min(44, W * 0.075));
      }
      ctx.globalAlpha = 1;
    }
    let ty = H * 0.3;
    for (const t of this.toasts) {
      const a = Math.min(1, t.t * 4, (2.4 - t.t) * 2);
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `900 ${Math.round(Math.min(26, W * 0.05))}px ${FONT}`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.strokeText(t.text, W / 2, ty);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, W / 2, ty);
      ty += 34;
    }
    ctx.globalAlpha = 1;
  }
}
