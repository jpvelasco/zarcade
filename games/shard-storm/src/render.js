// Canvas renderer for Shard Storm. Reads World state and events; never
// mutates the simulation. The fixed FIELD is scaled to fit (DPR aware) over
// a drifting starfield. All glow is shadowBlur + additive compositing, so
// the neon look stays cheap on phones.
import { FIELD, BLADE, COMBO, COLORS, SHIELD } from './config.js';
import { dailyLabel } from './daily.js';

const TAU = Math.PI * 2;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// A five-point gem silhouette (unit radius), drawn rotated by the shard's spin.
const GEM = [[0, -1], [0.85, -0.3], [0.52, 0.9], [-0.52, 0.9], [-0.85, -0.3]];
const MINE_SPIKES = 9;

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// A stable 0..1 hash for starfield positions.
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ff5a4e';
    this.time = 0;
    this.daily = false;
    this.stars = Array.from({ length: 130 }, (_, i) => ({
      x: hash(i), y: hash(i + 500), z: 0.2 + hash(i + 900) * 0.8, tw: hash(i + 1300) * TAU,
    }));
    this.vignette = null;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = dpr;
    this.cw = w;
    this.ch = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const margin = Math.min(w, h) > 600 ? 16 : 0;
    this.scale = Math.min((w - margin * 2) / FIELD.w, (h - margin * 2) / FIELD.h);
    this.ox = (w - FIELD.w * this.scale) / 2;
    const spare = h - FIELD.h * this.scale;
    this.oy = Math.max(0, spare / 2);
    const g = this.ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(2,3,10,0.7)');
    this.vignette = g;
  }

  toField(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / this.scale, y: (clientY - r.top - this.oy) / this.scale };
  }

  reset(world, { daily = false } = {}) {
    this.particles.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.daily = daily;
    if (world && world.status !== 'over') this.time = 0;
  }

  // ------------------------------------------------------------ events

  handleEvents(events, world) {
    for (const e of events) {
      switch (e.type) {
        case 'shard': {
          const c = COLORS.shard[e.color % COLORS.shard.length];
          const n = this.reduced ? 6 : 14;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, sp = 120 + Math.random() * 340;
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, age: 0, life: 0.5 + Math.random() * 0.3, size: 2 + Math.random() * 3.5, color: c, grav: 500 });
          }
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * TAU, sp = 380 + Math.random() * 260;
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.22, size: 1.6, color: '#ffffff', grav: 0 });
          }
          const pts = 10 + e.combo * 2;
          this.texts.push({ x: e.x, y: e.y - 18, text: `+${pts}`, age: 0, life: 0.7, color: c, size: 15 + Math.min(10, e.combo), vy: -50 });
          if (e.combo >= COMBO.slowCombo && e.combo % COMBO.slowCombo === 0) {
            this.texts.push({ x: FIELD.w / 2, y: FIELD.h * 0.42, text: `×${e.combo} COMBO`, age: 0, life: 0.9, color: COLORS.accent, size: 30, vy: -24 });
          }
          this.shake = Math.max(this.shake, this.reduced ? 0 : 2.5);
          break;
        }
        case 'shell': {
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * TAU, sp = 180 + Math.random() * 220;
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.4, size: 2.4, color: COLORS.shield, grav: 200 });
          }
          this.texts.push({ x: e.x, y: e.y - 26, text: 'CRACK', age: 0, life: 0.5, color: COLORS.shield, size: 14, vy: -40 });
          break;
        }
        case 'mine': {
          const n = this.reduced ? 12 : 26;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, sp = 160 + Math.random() * 480;
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.55 + Math.random() * 0.3, size: 2 + Math.random() * 4, color: i % 3 ? COLORS.mine : '#ff9d5e', grav: 300 });
          }
          this.flash = this.reduced ? 0.18 : 0.4;
          this.flashColor = COLORS.mine;
          this.shake = this.reduced ? 0 : 9;
          this.texts.push({ x: e.x, y: e.y - 24, text: 'MINE!', age: 0, life: 0.8, color: COLORS.mine, size: 20, vy: -36 });
          break;
        }
        case 'wave':
          this.texts.push({ x: FIELD.w / 2, y: FIELD.h * 0.36, text: 'STORM RISING', age: 0, life: 1.1, color: COLORS.gold, size: 24, vy: -18 });
          break;
        case 'dailyClear':
          this.texts.push({ x: FIELD.w / 2, y: FIELD.h * 0.4, text: 'STORM CLEARED!', age: 0, life: 1.4, color: COLORS.gold, size: 30, vy: -22 });
          break;
        default: break;
      }
    }
  }

  // ------------------------------------------------------------ update

  update(dt, world) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 1.6);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      if (t.age >= t.life) { this.texts.splice(i, 1); continue; }
      t.y += t.vy * dt;
    }
    if (world && !this.reduced) {
      const speed = world.slowTimer > 0 ? 0.3 : 1;
      for (const s of this.stars) {
        s.y += 0.012 * s.z * speed;
        if (s.y > 1) { s.y -= 1; s.x = hash(Math.floor(s.x * 1000) + this.time); }
      }
    }
  }

  // ------------------------------------------------------------ draw

  draw(world, { attract = false, daily = false } = {}) {
    const { ctx, cw, ch } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.bg0;
    ctx.fillRect(0, 0, cw, ch);

    // Starfield in screen space, gently drifting.
    for (const s of this.stars) {
      const a = 0.25 + 0.5 * s.z * (0.6 + 0.4 * Math.sin(this.time * 1.5 + s.tw));
      ctx.fillStyle = `rgba(190,215,255,${a.toFixed(3)})`;
      const sz = (s.reduced || this.reduced) ? 1 : 0.6 + s.z * 1.8;
      ctx.fillRect(s.x * cw, s.y * ch, sz, sz);
    }

    // Field transform with a little shake.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sx = this.reduced ? 0 : (Math.random() - 0.5) * this.shake;
    const sy = this.reduced ? 0 : (Math.random() - 0.5) * this.shake;
    ctx.translate(this.ox + sx * this.scale, this.oy + sy * this.scale);
    ctx.scale(this.scale, this.scale);

    // Playfield backdrop: a deep panel with a soft top glow.
    ctx.fillStyle = rgba(COLORS.bg1, 0.55);
    ctx.fillRect(0, 0, FIELD.w, FIELD.h);
    const top = ctx.createLinearGradient(0, 0, 0, 200);
    top.addColorStop(0, rgba(COLORS.accent, 0.07));
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, FIELD.w, 200);

    // Slow-mo tint.
    if (world && world.slowTimer > 0) {
      ctx.fillStyle = rgba(COLORS.accent, 0.05);
      ctx.fillRect(0, 0, FIELD.w, FIELD.h);
    }

    for (const sh of world.shards) this.drawShard(ctx, sh);
    this.drawBlade(ctx, world);
    this.drawParticles(ctx);
    this.drawTexts(ctx, world);

    if (world && world.status === 'ready') {
      const a = Math.min(1, Math.min(world.readyT, 1) / 0.5);
      const n = Math.ceil(world.readyT);
      ctx.font = `800 ${54 + (1 - world.readyT) * 8}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba('#ffffff', a * 0.85);
      ctx.shadowColor = rgba(COLORS.accent, 0.9 * a);
      ctx.shadowBlur = 24;
      ctx.fillText(n > 1 ? String(n) : 'GO!', FIELD.w / 2, FIELD.h * 0.42);
      ctx.font = `700 16px ${FONT}`;
      ctx.fillStyle = rgba('#ffffff', 0.6 * a);
      ctx.shadowBlur = 0;
      ctx.fillText(daily ? `DAILY STORM · ${dailyLabel()}` : 'SWIPE TO SLICE', FIELD.w / 2, FIELD.h * 0.42 + 30);
    }

    // Vignette in screen space.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, cw, ch);
    if (this.flash > 0) {
      ctx.fillStyle = rgba(this.flashColor, Math.min(0.5, this.flash) * 0.45);
      ctx.fillRect(0, 0, cw, ch);
    }
    if (attract) {
      const g = ctx.createLinearGradient(0, 0, 0, cw > ch ? ch : cw);
      g.addColorStop(0, 'rgba(5,4,18,0.1)');
      g.addColorStop(1, 'rgba(5,4,18,0.45)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  drawShard(ctx, sh) {
    if (sh.mine) {
      const pulse = 1 + 0.12 * Math.sin(this.time * 6 + sh.rot);
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(sh.rot * 0.3);
      ctx.shadowColor = COLORS.mine;
      ctx.shadowBlur = 22;
      ctx.fillStyle = '#2a0d14';
      ctx.beginPath();
      for (let i = 0; i < MINE_SPIKES; i++) {
        const a = (i / MINE_SPIKES) * TAU;
        const r1 = sh.r * 0.62 * pulse, r2 = sh.r * 0.95 * pulse;
        const a1 = a - 0.22, a2 = a + 0.22;
        ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.lineTo(Math.cos(a2) * r1, Math.sin(a2) * r1);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(COLORS.mine, 0.9);
      ctx.beginPath();
      ctx.arc(0, 0, sh.r * 0.34 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(-sh.r * 0.1, -sh.r * 0.1, sh.r * 0.1, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    const c = COLORS.shard[sh.color % COLORS.shard.length];
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(sh.rot);
    ctx.shadowColor = c;
    ctx.shadowBlur = 18;
    ctx.fillStyle = rgba(c, 0.92);
    ctx.beginPath();
    GEM.forEach(([gx, gy], i) => (i ? ctx.lineTo(gx * sh.r, gy * sh.r) : ctx.moveTo(gx * sh.r, gy * sh.r)));
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // Facets.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const [gx, gy] of GEM) ctx.moveTo(0, 0), ctx.lineTo(gx * sh.r, gy * sh.r);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(-sh.r * 0.2, -sh.r * 0.35, sh.r * 0.16, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (sh.shielded) {
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(this.time * 1.2);
      ctx.strokeStyle = rgba(COLORS.shield, 0.75);
      ctx.lineWidth = 3;
      ctx.shadowColor = COLORS.shield;
      ctx.shadowBlur = 12;
      ctx.setLineDash([14, 9]);
      ctx.beginPath();
      ctx.arc(0, 0, SHIELD.r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  drawBlade(ctx, world) {
    const pts = world.blade.pts;
    if (!pts.length || world.blade.life <= 0) return;
    const k = world.blade.life / BLADE.life;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Outer glow, then a hot white core.
    for (const [width, color] of [[BLADE.radius * 2, rgba(COLORS.bladeEdge, 0.28 * k)], [BLADE.radius, rgba(COLORS.bladeEdge, 0.55 * k)], [3.5, rgba(COLORS.blade, 0.95 * k)]]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.shadowColor = COLORS.bladeEdge;
      ctx.shadowBlur = width > 5 ? 16 : 0;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) (i ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y));
      ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * a), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawTexts(ctx, world) {
    if (!this.texts.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const a = t.age < 0.15 ? t.age / 0.15 : 1 - Math.max(0, (t.age - t.life * 0.55) / (t.life * 0.45));
      ctx.font = `800 ${t.size}px ${FONT}`;
      ctx.fillStyle = rgba(t.color, Math.max(0, a));
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 10;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
