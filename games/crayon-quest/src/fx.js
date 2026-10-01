// Crayon-shaving particles on one full-screen canvas. Particles are plain
// objects in a fixed pool (no per-frame allocation) and the canvas is only
// cleared and drawn while something is alive.

const MAX = 160;
const TAU = Math.PI * 2;

export class Fx {
  constructor(canvas, { reduced = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reduced;
    this.pool = [];
    for (let i = 0; i < MAX; i++) this.pool.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 4, color: '#000', rot: 0, vr: 0, kind: 0 });
    this.alive = 0;
    this.dirty = false;
    this.dpr = 1;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  spawn(x, y, color, { count = 12, speed = 240, size = 5, kind = 0, up = 0, life = 0.7, spread = TAU } = {}) {
    if (this.reduced) count = Math.ceil(count / 3);
    for (let n = 0; n < count; n++) {
      const p = this.pool.find((q) => !q.on);
      if (!p) return;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.75);
      p.on = true;
      p.x = x + (Math.random() - 0.5) * 16;
      p.y = y + (Math.random() - 0.5) * 16;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s - up;
      p.max = p.life = life * (0.6 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.color = color;
      p.rot = Math.random() * TAU;
      p.vr = (Math.random() - 0.5) * 12;
      p.kind = kind;
      this.alive++;
    }
  }

  // Burst of crayon shavings from an element's centre.
  burstAt(el, color, opts) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.spawn(r.left + r.width / 2, r.top + r.height * 0.45, color, opts);
  }

  update(dt) {
    if (!this.alive) return;
    for (const p of this.pool) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        this.alive--;
        continue;
      }
      p.vy += (p.kind === 1 ? 120 : 620) * dt;
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw() {
    const ctx = this.ctx;
    if (!this.alive) {
      if (this.dirty) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.dirty = false;
      }
      return;
    }
    this.dirty = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const p of this.pool) {
      if (!p.on) continue;
      const a = Math.min(1, (p.life / p.max) * 1.6);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const c = Math.cos(p.rot) * this.dpr, s = Math.sin(p.rot) * this.dpr;
      ctx.setTransform(c, s, -s, c, p.x * this.dpr, p.y * this.dpr);
      if (p.kind === 1) {
        // A four-point sparkle.
        const r = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.3, -r * 0.3);
        ctx.lineTo(r, 0);
        ctx.lineTo(r * 0.3, r * 0.3);
        ctx.lineTo(0, r);
        ctx.lineTo(-r * 0.3, r * 0.3);
        ctx.lineTo(-r, 0);
        ctx.lineTo(-r * 0.3, -r * 0.3);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
      }
    }
    ctx.globalAlpha = 1;
  }
}
