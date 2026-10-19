// The hatching scene: a wobbling egg, three taps to crack it, a burst of
// rays and the new friend bouncing out. Draws on its own overlay canvas.
import { RARITY, RARITIES } from './data.js';
import { paintEgg, star, PAD_TOP } from './sprites.js';

const TAU = Math.PI * 2;
export const TAPS_TO_HATCH = 3;

export class Hatch {
  constructor(canvas, sprites, { reduced = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sprites = sprites;
    this.reduced = reduced;
    this.active = false;
    this.bits = [];
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = this.canvas.clientWidth || window.innerWidth;
    this.H = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
  }

  start(result, eggKind) {
    this.resize();
    this.result = result;
    this.eggKind = eggKind;
    this.taps = 0;
    this.phase = 'egg';
    this.t = 0;
    this.wob = 0;
    this.reveal = 0;
    this.bits = [];
    this.active = true;
    this.idle = 0;
  }

  // Returns 'crack', 'open' or null.
  tap() {
    if (!this.active || this.phase !== 'egg') return null;
    this.taps++;
    this.wob = 1;
    this.idle = 0;
    if (this.taps >= TAPS_TO_HATCH) {
      this.phase = 'open';
      this.t = 0;
      const { cx, cy, eh } = this.layout();
      const count = this.reduced ? 6 : 22;
      for (let k = 0; k < count; k++) {
        const a = Math.random() * TAU;
        const sp = 120 + Math.random() * 280;
        this.bits.push({ x: cx + Math.cos(a) * 20, y: cy + Math.sin(a) * eh * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 180, r: 6 + Math.random() * 10, rot: Math.random() * 6, life: 1.4 });
      }
      return 'open';
    }
    return 'crack';
  }

  layout() {
    const s = Math.min(this.W, this.H * 0.8);
    return { cx: this.W / 2, cy: this.H * 0.36, eh: Math.min(260, s * 0.42) };
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    this.idle += dt;
    this.wob = Math.max(0, this.wob - dt * 2.2);
    if (this.phase === 'open') this.reveal = Math.min(1, this.reveal + dt * 1.8);
    for (const b of this.bits) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 600 * dt;
      b.rot += dt * 5;
      b.life -= dt;
    }
    this.bits = this.bits.filter((b) => b.life > 0);
  }

  draw() {
    if (!this.active) return;
    const ctx = this.ctx;
    const { dpr, W, H } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { cx, cy, eh } = this.layout();
    const rarity = this.result.animal.rarity;
    const ri = RARITIES.indexOf(rarity);
    const color = RARITY[rarity].color;
    // rays
    if (this.phase === 'open') {
      const n = 14;
      const spin = this.reduced ? 0 : this.t * 0.4;
      const R = Math.max(W, H);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = 0.35 * this.reveal;
      for (let k = 0; k < n; k++) {
        const a = spin + (k / n) * TAU;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a - 0.1) * R, Math.sin(a - 0.1) * R);
        ctx.lineTo(Math.cos(a + 0.1) * R, Math.sin(a + 0.1) * R);
        ctx.closePath();
        ctx.fillStyle = k % 2 ? '#ffffff' : color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, eh * 1.1);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-eh * 1.2, -eh * 1.2, eh * 2.4, eh * 2.4);
      ctx.restore();
    }
    // shadow
    ctx.fillStyle = 'rgba(60,30,60,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + eh * 0.52, eh * 0.42, eh * 0.08, 0, 0, TAU);
    ctx.fill();
    if (this.phase === 'egg') {
      const idleWobble = this.reduced ? 0 : Math.sin(this.t * 3) * 0.04 * (1 + Math.min(2, this.idle * 0.3));
      const w = this.reduced ? 0 : Math.sin(this.t * 40) * 0.16 * this.wob;
      const hop = this.reduced ? 0 : Math.abs(Math.sin(this.t * 2.2)) * 8;
      ctx.save();
      ctx.translate(cx, cy + eh * 0.5 - hop);
      ctx.rotate(idleWobble + w);
      ctx.translate(0, -eh * 0.5);
      paintEgg(ctx, this.eggKind, 0, 0, eh);
      this.cracks(ctx, eh);
      ctx.restore();
      // tap stars
      for (let k = 0; k < TAPS_TO_HATCH; k++) star(ctx, cx - 30 + k * 30, cy + eh * 0.72, 11, k < this.taps ? '#ffd23f' : 'rgba(255,255,255,0.55)');
    } else {
      // the animal
      const img = this.sprites.animal(this.result.id);
      const t = this.reveal;
      const ease = this.reduced ? 1 : 1 + Math.sin(t * Math.PI) * 0.25 * (1 - t) + (t < 1 ? 0 : 0);
      const size = eh * 1.25 * Math.min(1, t * 1.5) * ease;
      const bob = this.reduced ? 0 : Math.sin(this.t * 3) * 5;
      ctx.drawImage(img, cx - size / 2, cy + eh * 0.5 - size * 1.1 * ((96 + PAD_TOP) / 110) + bob, size, size * 1.1);
      if (ri >= 2 && !this.reduced) {
        for (let k = 0; k < 6; k++) {
          const a = this.t * 1.5 + (k / 6) * TAU;
          star(ctx, cx + Math.cos(a) * eh * 0.75, cy + Math.sin(a) * eh * 0.45, 7 + Math.sin(this.t * 6 + k) * 3, ri === 3 ? '#ffd23f' : '#e0b8ff');
        }
      }
    }
    for (const b of this.bits) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = Math.min(1, b.life);
      ctx.beginPath();
      ctx.moveTo(-b.r, b.r * 0.4);
      ctx.lineTo(0, -b.r * 0.7);
      ctx.lineTo(b.r, b.r * 0.4);
      ctx.closePath();
      ctx.fillStyle = '#fff6e0';
      ctx.fill();
      ctx.strokeStyle = '#d8b890';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  cracks(ctx, eh) {
    if (!this.taps) return;
    ctx.strokeStyle = '#5a3a4a';
    ctx.lineWidth = Math.max(2.5, eh * 0.018);
    ctx.lineJoin = 'round';
    const paths = [
      [[-0.22, -0.05], [-0.1, 0.03], [-0.02, -0.06], [0.08, 0.04]],
      [[0.08, 0.04], [0.16, -0.04], [0.26, 0.05]],
      [[-0.02, -0.06], [0.02, -0.18], [-0.06, -0.26], [0.0, -0.34]],
    ];
    for (let k = 0; k < Math.min(this.taps, paths.length); k++) {
      ctx.beginPath();
      paths[k].forEach(([x, y], j) => (j ? ctx.lineTo(x * eh, y * eh) : ctx.moveTo(x * eh, y * eh)));
      ctx.stroke();
    }
  }

  stop() {
    this.active = false;
  }
}
