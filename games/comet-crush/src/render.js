// Canvas renderer. Reads World state and events; never mutates the world.
// The fixed FIELD is scaled to fit the window (DPR aware) and centred over
// a full-screen sky. Bricks are pre-rendered to sprites with their glow baked.
import { FIELD, GRID, PADDLE, LASER, CAPSULE, TIMING } from './config.js';
import { POWERUPS, TIMED } from './powerups.js';
import { CONSTELLATIONS, levelLabel } from './levels.js';

const TAU = Math.PI * 2;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SPRITE_PAD = 10;

// ------------------------------------------------------------ colour utils

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(hex, to, t) {
  const a = rgb(hex), b = to === 'white' ? [255, 255, 255] : to === 'black' ? [0, 0, 0] : rgb(to);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}
function rgba(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function starPath(g, x, y, R, r, rot = -Math.PI / 2, points = 5) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points;
    const rad = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
}

// Seeded pseudo-random for stable decorations (cracks, craters).
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
    this.trails = new Map();
    this.sprites = new Map();
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.time = 0;
    this.intro = 0;
    this.toast = null;
    this.cleared = [];
    this.constellation = CONSTELLATIONS[0];
    this.stars = Array.from({ length: 150 }, (_, i) => ({ x: hash(i), y: hash(i + 500), z: 0.25 + hash(i + 900) * 0.75, tw: hash(i + 1300) * TAU }));
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
    // Leave a little breathing room on big screens, none on phones.
    const margin = Math.min(w, h) > 600 ? 16 : 0;
    this.scale = Math.min((w - margin * 2) / FIELD.w, (h - margin * 2) / FIELD.h);
    this.ox = (w - FIELD.w * this.scale) / 2;
    this.oy = (h - FIELD.h * this.scale) / 2;
    this.sprites.clear();
    this.sky = null;
  }

  toField(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / this.scale, y: (clientY - r.top - this.oy) / this.scale };
  }

  // Screen rect of the playfield (CSS px), for positioning DOM overlays.
  fieldRect() {
    return { x: this.ox, y: this.oy, w: FIELD.w * this.scale, h: FIELD.h * this.scale };
  }

  reset(world, { cleared = [], intro = true } = {}) {
    this.particles.length = 0;
    this.texts.length = 0;
    this.trails.clear();
    this.shake = 0;
    this.flash = 0;
    this.toast = null;
    this.intro = intro ? 2.6 : 0;
    this.cleared = cleared;
    if (world && CONSTELLATIONS[world.level.c] !== this.constellation) {
      this.constellation = CONSTELLATIONS[world.level.c];
      this.sky = null;
    }
    this.sky = null;
  }

  // ------------------------------------------------------------ effects

  burst(x, y, color, n, { speed = 260, life = 0.8, size = 4, gravity = 700, kind = 'shard' } = {}) {
    if (this.reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.65);
      this.particles.push({
        kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.25, life: life * (0.6 + Math.random() * 0.4), max: life,
        size: size * (0.6 + Math.random() * 0.8), color, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, gravity, delay: 0,
      });
    }
  }

  ring(x, y, color, radius = 60, life = 0.45, delay = 0) {
    this.particles.push({ kind: 'ring', x, y, vx: 0, vy: 0, life, max: life, size: radius, color, rot: 0, vr: 0, gravity: 0, delay });
  }

  text(x, y, str, color = '#fff', size = 18, life = 0.9) {
    this.texts.push({ x, y, str, color, size, life, max: life });
  }

  kick(amount) {
    if (!this.reduced) this.shake = Math.min(18, Math.max(this.shake, amount));
  }

  flashScreen(color, amount) {
    if (this.reduced) return;
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color;
  }

  handleEvents(events, world) {
    const pal = this.constellation.palette;
    for (const e of events) {
      switch (e.type) {
        case 'brick':
          this.burst(e.x, e.y, e.color, e.kind === 'explosive' ? 10 : 12, { size: 5 });
          this.burst(e.x, e.y, '#ffffff', 4, { size: 2.5, kind: 'spark', speed: 320, gravity: 0, life: 0.35 });
          this.ring(e.x, e.y, e.color, 28, 0.3);
          // Floating scores for the juicy ones only, throttled so chains stay readable.
          if (e.points >= 200 && this.time - (this.lastScoreText || 0) > 0.15) {
            this.lastScoreText = this.time;
            this.text(e.x, e.y - 6, `+${e.points}`, '#fff', 13 + Math.min(9, e.points / 150));
          }
          if (e.combo > 0 && e.combo % 10 === 0) this.text(FIELD.w / 2, 470, `COMBO ${e.combo}!`, pal[2], 34, 1.2);
          break;
        case 'crack':
          this.burst(e.x, e.y, e.color, 5, { size: 3, speed: 160 });
          break;
        case 'metal':
          this.burst(e.x, e.y, '#e6ecff', 6, { size: 2, kind: 'spark', speed: 280, gravity: 0, life: 0.25 });
          break;
        case 'explode':
          this.ring(e.x, e.y, '#ffb347', 80, 0.45);
          this.ring(e.x, e.y, '#ff4f6d', 50, 0.35, 0.05);
          this.burst(e.x, e.y, '#ffd84f', 16, { kind: 'spark', speed: 420, gravity: 0, life: 0.45, size: 3 });
          this.burst(e.x, e.y, '#ff6a3d', 10, { kind: 'glow', speed: 90, gravity: -40, life: 0.6, size: 18 });
          this.kick(7);
          this.flashScreen('#ffb347', 0.12);
          break;
        case 'paddle':
          this.burst(e.x, e.y, pal[0], 5, { kind: 'spark', speed: 200, gravity: 300, life: 0.3, size: 2 });
          this.kick(1.5);
          break;
        case 'wall':
          this.burst(e.x, e.y, pal[0], 3, { kind: 'spark', speed: 140, gravity: 0, life: 0.2, size: 2 });
          if (e.duck) this.text(e.x, e.y, 'squeak!', '#ffe14f', 12, 0.6);
          break;
        case 'power': {
          const p = POWERUPS[e.kind];
          this.ring(e.x, e.y, p.color, 90, 0.5);
          this.burst(e.x, e.y, p.color, 14, { kind: 'spark', speed: 300, gravity: 0, life: 0.5, size: 3 });
          this.toast = { str: p.name, color: p.color, life: 1.6 };
          break;
        }
        case 'star':
          this.burst(e.x, e.y, '#ffe066', 18, { kind: 'star', speed: 260, gravity: 200, life: 0.9, size: 6 });
          this.text(e.x, e.y - 20, '+1000 ★', '#ffe066', 22, 1.1);
          break;
        case 'lost':
          this.burst(world ? world.paddle.x : FIELD.w / 2, FIELD.h - 10, '#ff4f6d', 20, { kind: 'spark', speed: 420, life: 0.6, size: 3 });
          this.kick(10);
          this.flashScreen('#ff2d55', 0.25);
          this.trails.clear();
          break;
        case 'bossHit':
          this.burst(e.x, e.y, '#ffffff', 8, { kind: 'spark', speed: 340, gravity: 0, life: 0.3, size: 3 });
          this.ring(e.x, e.y, '#ffffff', 36, 0.25);
          this.kick(3);
          break;
        case 'bossDefeat':
          for (let i = 0; i < 12; i++) {
            const dx = (hash(i) - 0.5) * 180, dy = (hash(i + 7) - 0.5) * 100;
            this.ring(e.x + dx, e.y + dy, i % 2 ? '#ffd84f' : '#ff6a3d', 60 + hash(i + 3) * 60, 0.5, i * 0.12);
          }
          this.burst(e.x, e.y, '#ffd84f', 50, { kind: 'spark', speed: 600, gravity: 0, life: 1.2, size: 4 });
          this.burst(e.x, e.y, this.constellation.palette[1], 40, { size: 7, speed: 500, life: 1.4 });
          this.kick(18);
          this.flashScreen('#ffffff', 0.6);
          break;
        case 'portal':
          this.ring(e.from.x, e.from.y, '#5ef2ff', 40, 0.4);
          this.ring(e.to.x, e.to.y, '#ff4fd8', 40, 0.4);
          break;
        case 'pop':
          this.ring(e.x, e.y, e.kind === 'meteor' ? '#ffb347' : '#bff6ff', 26, 0.3);
          this.burst(e.x, e.y, e.kind === 'meteor' ? '#ff8a3d' : '#bff6ff', 8, { kind: 'spark', speed: 200, gravity: 0, life: 0.3, size: 2 });
          this.text(e.x, e.y, 'pop!', '#bff6ff', 14, 0.6);
          break;
        case 'bonk':
          this.burst(e.x, e.y, '#bff6ff', 10, { kind: 'star', speed: 140, gravity: 0, life: 0.8, size: 5 });
          this.text(e.x, PADDLE.y - 40, 'sleepy…', '#bff6ff', 16, 1.2);
          this.kick(4);
          break;
        case 'shield':
          this.ring(e.x, e.y, '#4fd8ff', 50, 0.4);
          break;
        case 'regrow':
          this.burst(e.x, e.y, e.color, 4, { kind: 'glow', speed: 40, gravity: 0, life: 0.4, size: 10 });
          break;
        case 'clear':
          for (let i = 0; i < (this.reduced ? 20 : 70); i++) {
            const c = this.constellation.palette[i % 6];
            this.particles.push({ kind: 'shard', x: Math.random() * FIELD.w, y: FIELD.top - 10, vx: (Math.random() - 0.5) * 120, vy: 60 + Math.random() * 200, life: 2.2, max: 2.2, size: 5, color: c, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10, gravity: 120, delay: Math.random() * 0.5 });
          }
          break;
        case 'restless':
          if (world) for (const b of world.balls) this.ring(b.x, b.y, '#ffffff', 22, 0.3);
          break;
        default: break;
      }
    }
  }

  update(dt, world) {
    this.time += dt;
    this.intro = Math.max(0, this.intro - dt);
    this.shake *= Math.pow(0.001, dt);
    if (this.shake < 0.2) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.toast) { this.toast.life -= dt; if (this.toast.life <= 0) this.toast = null; }
    for (const p of this.particles) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'spark') { p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
    for (const t of this.texts) { t.life -= dt; t.y -= 40 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);

    if (!world) return;
    // Comet trails (renderer-owned history).
    const seen = new Set();
    for (const b of world.balls) {
      seen.add(b.id);
      let tr = this.trails.get(b.id);
      if (!tr) { tr = []; this.trails.set(b.id, tr); }
      if (b.stuck) tr.length = 0;
      else tr.push({ x: b.x, y: b.y });
      if (tr.length > 14) tr.shift();
      if (world.effects.fire > 0 && !b.stuck && !this.reduced && Math.random() < 0.6) {
        this.particles.push({ kind: 'glow', x: b.x + (Math.random() - 0.5) * 8, y: b.y + (Math.random() - 0.5) * 8, vx: 0, vy: -20, life: 0.35, max: 0.35, size: 10, color: Math.random() < 0.5 ? '#ffb347' : '#ff4f2d', rot: 0, vr: 0, gravity: 0, delay: 0 });
      }
    }
    for (const id of this.trails.keys()) if (!seen.has(id)) this.trails.delete(id);
  }

  // ------------------------------------------------------------ sky

  buildSky() {
    const c = document.createElement('canvas');
    const { cw, ch, dpr } = this;
    c.width = Math.max(1, Math.round(cw * dpr));
    c.height = Math.max(1, Math.round(ch * dpr));
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const [a, b, n] = this.constellation.sky;
    const grad = g.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, '#05030f');
    grad.addColorStop(0.45, a);
    grad.addColorStop(1, b);
    g.fillStyle = grad;
    g.fillRect(0, 0, cw, ch);
    const pal = this.constellation.palette;
    const blobs = [[0.18, 0.25, n, 0.55], [0.85, 0.2, pal[1], 0.16], [0.75, 0.8, pal[0], 0.14], [0.1, 0.85, pal[4], 0.16], [0.5, 0.55, n, 0.35]];
    for (const [x, y, col, al] of blobs) {
      const r = Math.max(cw, ch) * 0.45;
      const rg = g.createRadialGradient(x * cw, y * ch, 0, x * cw, y * ch, r);
      rg.addColorStop(0, rgba(col.startsWith('#') ? col : '#ffffff', al));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, cw, ch);
    }
    // Faint dust.
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(255,255,255,${0.05 + hash(i + 77) * 0.25})`;
      const s = hash(i + 33) < 0.95 ? 1 : 2;
      g.fillRect(hash(i + 11) * cw, hash(i + 22) * ch, s, s);
    }
    this.sky = c;
  }

  // The constellation figure, drawn huge and faint behind the field, with
  // cleared levels lit up.
  drawConstellation(ctx) {
    const c = this.constellation;
    const size = Math.min(this.cw * 0.9, this.ch * 1.2);
    const x0 = (this.cw - size) / 2, y0 = (this.ch - size * 0.7) / 2;
    const P = (i) => [x0 + (c.stars[i][0] / 100) * size, y0 + (c.stars[i][1] / 100) * size];
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 8]);
    for (const [a, b] of c.lines) {
      const lit = this.cleared[a] && this.cleared[b];
      ctx.strokeStyle = lit ? rgba(c.palette[0], 0.45) : 'rgba(255,255,255,0.08)';
      const [ax, ay] = P(a), [bx, by] = P(b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    c.stars.forEach((_, i) => {
      const [x, y] = P(i);
      const lit = this.cleared[i];
      const tw = this.reduced ? 1 : 0.8 + Math.sin(this.time * 2 + i) * 0.2;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, lit ? 26 : 12);
      rg.addColorStop(0, lit ? rgba('#ffffff', 0.9 * tw) : 'rgba(255,255,255,0.25)');
      rg.addColorStop(0.3, lit ? rgba(c.palette[0], 0.5 * tw) : 'rgba(255,255,255,0.06)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - 30, y - 30, 60, 60);
    });
    ctx.restore();
  }

  drawStars(ctx, speed) {
    const { cw, ch } = this;
    for (const s of this.stars) {
      const y = ((s.y + (this.reduced ? 0 : this.time * 0.012 * s.z * speed)) % 1) * ch;
      const a = 0.35 + 0.65 * s.z * (this.reduced ? 1 : 0.75 + 0.25 * Math.sin(this.time * 3 + s.tw));
      ctx.fillStyle = `rgba(220,235,255,${a})`;
      const sz = s.z > 0.85 ? 2 : 1.3;
      ctx.fillRect(s.x * cw, y, sz, sz);
    }
  }

  // ------------------------------------------------------------ sprites

  sprite(b) {
    const side = b.part && b.part.side ? b.part.side : 0;
    const key = `${b.kind}|${b.skin}|${b.color}|${b.w}|${b.h}|${side}`;
    let s = this.sprites.get(key);
    if (s) return s;
    const k = this.scale * this.dpr;
    const c = document.createElement('canvas');
    c.width = Math.ceil((b.w + SPRITE_PAD * 2) * k);
    c.height = Math.ceil((b.h + SPRITE_PAD * 2) * k);
    const g = c.getContext('2d');
    g.scale(k, k);
    g.translate(SPRITE_PAD, SPRITE_PAD);
    drawBrickArt(g, b, side);
    s = c;
    this.sprites.set(key, s);
    return s;
  }

  // ------------------------------------------------------------ frame

  draw(world, opts = {}) {
    const ctx = this.ctx;
    const { dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.sky) this.buildSky();
    ctx.drawImage(this.sky, 0, 0, this.cw, this.ch);
    this.drawConstellation(ctx);
    this.drawStars(ctx, world && world.effects.slow > 0 ? 0.4 : 1);
    if (!world) return;

    const sx = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0;
    const s = this.scale;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (this.ox + sx), dpr * (this.oy + sy));

    this.drawField(ctx, world);
    this.drawPortals(ctx, world);
    this.drawBricks(ctx, world);
    if (world.boss && !world.boss.dead) this.drawBoss(ctx, world);
    this.drawShots(ctx, world);
    this.drawCapsules(ctx, world);
    this.drawTokens(ctx, world);
    this.drawLasers(ctx, world);
    this.drawShield(ctx, world);
    this.drawPaddle(ctx, world);
    this.drawBalls(ctx, world);
    this.drawParticles(ctx);
    if (!opts.attract) {
      this.drawHud(ctx, world);
      this.drawMessages(ctx, world, opts);
    }

    if (this.flash > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = this.flash * 0.6;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.cw, this.ch);
      ctx.globalAlpha = 1;
    }
  }

  drawField(ctx, world) {
    const pal = this.constellation.palette;
    const disco = world.effects.disco > 0;
    ctx.fillStyle = 'rgba(4, 3, 18, 0.62)';
    ctx.fillRect(0, 0, FIELD.w, FIELD.h);
    if (disco && !this.reduced) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const a = this.time * 1.3 + (i * TAU) / 5;
        const x = FIELD.w / 2 + Math.cos(a) * 220, y = 420 + Math.sin(a * 1.3) * 260;
        const rg = ctx.createRadialGradient(x, y, 0, x, y, 170);
        rg.addColorStop(0, `hsla(${(i * 72 + this.time * 120) % 360}, 100%, 60%, 0.22)`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(x - 170, y - 170, 340, 340);
      }
      ctx.restore();
    }
    // Subtle grid glow behind the bricks.
    ctx.strokeStyle = 'rgba(120,140,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = GRID.x; x <= GRID.x + GRID.cols * GRID.bw; x += GRID.bw) { ctx.moveTo(x, FIELD.top); ctx.lineTo(x, FIELD.h); }
    ctx.stroke();
    // Neon walls.
    ctx.save();
    ctx.shadowColor = pal[0];
    ctx.shadowBlur = 14;
    ctx.strokeStyle = rgba(pal[0], 0.85);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1.5, FIELD.h);
    ctx.lineTo(1.5, FIELD.top);
    ctx.lineTo(FIELD.w - 1.5, FIELD.top);
    ctx.lineTo(FIELD.w - 1.5, FIELD.h);
    ctx.stroke();
    ctx.restore();
    // Danger fade at the bottom.
    const fade = ctx.createLinearGradient(0, FIELD.h - 60, 0, FIELD.h);
    fade.addColorStop(0, 'rgba(255,40,90,0)');
    fade.addColorStop(1, 'rgba(255,40,90,0.14)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, FIELD.h - 60, FIELD.w, 60);
  }

  drawPortals(ctx, world) {
    world.portals.forEach((p, i) => {
      const col = i ? '#ff4fd8' : '#5ef2ff';
      const t = this.time * (i ? -2.2 : 2.2);
      ctx.save();
      ctx.translate(p.x, p.y);
      const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, 20);
      rg.addColorStop(0, '#05010f');
      rg.addColorStop(0.6, rgba(col, 0.5));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, TAU);
      ctx.fill();
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        ctx.lineWidth = 2.5 - k * 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, 16 - k * 4, t + k * 2, t + k * 2 + 2.6);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  drawBricks(ctx, world) {
    const disco = world.effects.disco > 0 && !this.reduced;
    const parts = [];
    for (const b of world.bricks) {
      if (!b.alive) continue;
      if (b.part) { parts.push(b); continue; }
      this.drawBrick(ctx, b, disco);
    }
    for (const b of parts) this.drawBrick(ctx, b, false);
  }

  drawBrick(ctx, b, disco) {
    ctx.drawImage(this.sprite(b), b.x - SPRITE_PAD, b.y - SPRITE_PAD, b.w + SPRITE_PAD * 2, b.h + SPRITE_PAD * 2);
    if (b.kind === 'tough' && b.hp < b.maxHp) drawCracks(ctx, b);
    if (b.kind === 'explosive') {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 6 + b.id);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
      rg.addColorStop(0, `rgba(255,220,120,${0.35 + pulse * 0.4})`);
      rg.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(cx - 16, cy - 16, 32, 32);
      ctx.restore();
    }
    if (disco && b.kind !== 'metal') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `hsla(${(b.x * 0.8 + b.y * 1.5 + this.time * 240) % 360}, 100%, 60%, 0.35)`;
      roundRect(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 5);
      ctx.fill();
      ctx.restore();
    }
    if (b.flash > 0) {
      ctx.save();
      ctx.globalAlpha = b.flash * 0.8;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, 5);
      ctx.fill();
      ctx.restore();
    }
  }

  drawBoss(ctx, world) {
    const bs = world.boss;
    ctx.save();
    ctx.translate(bs.x, bs.y);
    const angry = bs.hp <= bs.maxHp / 2;
    if (angry && !this.reduced) {
      const a = 0.18 + 0.12 * Math.sin(this.time * 8);
      const rg = ctx.createRadialGradient(0, 0, 10, 0, 0, bs.w * 0.75);
      rg.addColorStop(0, `rgba(255,60,90,${a})`);
      rg.addColorStop(1, 'rgba(255,60,90,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(-bs.w, -bs.w, bs.w * 2, bs.w * 2);
    }
    const look = nearestBall(world, bs);
    BOSS_ART[bs.kind](ctx, bs, this.time, look, angry);
    if (bs.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = bs.flash * 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 0, bs.w / 2, bs.h / 2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawShots(ctx, world) {
    for (const s of world.shots) {
      ctx.save();
      ctx.translate(s.x, s.y);
      if (s.kind === 'bubble') {
        const wob = 1 + Math.sin(s.t * 7) * 0.06;
        ctx.scale(wob, 2 - wob);
        const rg = ctx.createRadialGradient(-s.r * 0.3, -s.r * 0.3, 1, 0, 0, s.r);
        rg.addColorStop(0, 'rgba(255,255,255,0.5)');
        rg.addColorStop(0.6, 'rgba(150,230,255,0.15)');
        rg.addColorStop(1, 'rgba(150,230,255,0.45)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0, 0, s.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,245,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.ellipse(-s.r * 0.4, -s.r * 0.45, s.r * 0.25, s.r * 0.14, -0.6, 0, TAU);
        ctx.fill();
      } else {
        const ang = Math.atan2(s.vy, s.vx);
        ctx.save();
        ctx.rotate(ang);
        const fl = ctx.createLinearGradient(-s.r * 3.5, 0, 0, 0);
        fl.addColorStop(0, 'rgba(255,80,40,0)');
        fl.addColorStop(1, 'rgba(255,190,70,0.85)');
        ctx.fillStyle = fl;
        ctx.beginPath();
        ctx.moveTo(-s.r * 3.5, 0);
        ctx.lineTo(0, -s.r * 0.9);
        ctx.lineTo(0, s.r * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.rotate(s.t * 3);
        const rg = ctx.createRadialGradient(-3, -3, 1, 0, 0, s.r);
        rg.addColorStop(0, '#ffd9a0');
        rg.addColorStop(0.5, '#c46a3a');
        rg.addColorStop(1, '#5a2a1a');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0, 0, s.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(60,20,10,0.5)';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(Math.cos(i * 2.1) * s.r * 0.45, Math.sin(i * 2.1) * s.r * 0.45, s.r * 0.2, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  drawCapsules(ctx, world) {
    for (const c of world.capsules) {
      const p = POWERUPS[c.kind];
      const w = CAPSULE.w, h = CAPSULE.h;
      const bob = this.reduced ? 1 : 1 + Math.sin(c.t * 7) * 0.05;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(bob, 1);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 14;
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, mix(p.color, 'white', 0.55));
      g.addColorStop(0.5, p.color);
      g.addColorStop(1, mix(p.color, 'black', 0.45));
      ctx.fillStyle = g;
      roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Moving shine band.
      const shine = ((c.t * 1.4) % 1.6) - 0.3;
      ctx.save();
      roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(-w / 2 + shine * w, -h / 2);
      ctx.lineTo(-w / 2 + shine * w + 10, -h / 2);
      ctx.lineTo(-w / 2 + shine * w, h / 2);
      ctx.lineTo(-w / 2 + shine * w - 10, h / 2);
      ctx.fill();
      ctx.restore();
      ctx.font = `800 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(p.label, 0, 1.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(p.label, 0, 0);
      ctx.restore();
    }
  }

  drawTokens(ctx, world) {
    for (const s of world.tokens) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(this.reduced ? 0 : s.t * 2.5);
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur = 16;
      const g = ctx.createRadialGradient(0, -3, 1, 0, 0, 14);
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(1, '#ffb400');
      ctx.fillStyle = g;
      starPath(ctx, 0, 0, 14, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff6c0';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawLasers(ctx, world) {
    if (!world.lasers.length) return;
    ctx.save();
    ctx.shadowColor = '#ff5170';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffd0da';
    for (const l of world.lasers) {
      roundRect(ctx, l.x - LASER.w / 2, l.y, LASER.w, LASER.h, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawShield(ctx, world) {
    if (world.shield <= 0) return;
    const y = FIELD.h - 18;
    ctx.save();
    ctx.shadowColor = '#4fd8ff';
    ctx.shadowBlur = 16;
    for (let i = 0; i < world.shield; i++) {
      ctx.strokeStyle = `rgba(120,230,255,${0.9 - i * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= FIELD.w; x += 12) {
        const yy = y + i * 5 + (this.reduced ? 0 : Math.sin(x * 0.05 + this.time * 5 + i) * 1.5);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPaddle(ctx, world) {
    const p = world.paddle;
    const pal = this.constellation.palette;
    const w = p.w, h = PADDLE.h;
    const sq = this.reduced ? 0 : p.squash;
    ctx.save();
    ctx.translate(p.x, PADDLE.y + sq * 2);
    ctx.scale(1 + sq * 0.08, 1 - sq * 0.28);

    // Thrusters.
    const flick = this.reduced ? 1 : 0.8 + Math.random() * 0.4;
    for (const sx of [-0.3, 0.3]) {
      const fx = sx * w;
      const fl = ctx.createLinearGradient(0, h / 2, 0, h / 2 + 22 * flick);
      fl.addColorStop(0, rgba(pal[0], 0.9));
      fl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fl;
      ctx.beginPath();
      ctx.moveTo(fx - 7, h / 2 - 2);
      ctx.lineTo(fx + 7, h / 2 - 2);
      ctx.lineTo(fx, h / 2 + 22 * flick);
      ctx.closePath();
      ctx.fill();
    }
    const glow = ctx.createRadialGradient(0, 4, 4, 0, 4, w * 0.7);
    glow.addColorStop(0, rgba(pal[0], 0.28));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-w, -40, w * 2, 80);

    // Cockpit dome.
    const dome = ctx.createLinearGradient(0, -h / 2 - 10, 0, -h / 2 + 4);
    dome.addColorStop(0, '#ffffff');
    dome.addColorStop(1, pal[1]);
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.ellipse(0, -h / 2 + 2, 15, 10, 0, Math.PI, 0);
    ctx.fill();

    // Body.
    ctx.shadowColor = pal[0];
    ctx.shadowBlur = 14;
    const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.35, mix(pal[0], 'white', 0.35));
    body.addColorStop(0.7, '#3a5cff');
    body.addColorStop(1, '#1a1f66');
    ctx.fillStyle = body;
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(pal[0], 0.95);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Panel line + lights.
    ctx.strokeStyle = 'rgba(20,30,90,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 12, 2);
    ctx.lineTo(w / 2 - 12, 2);
    ctx.stroke();
    const blink = Math.floor(this.time * 3) % 2;
    ctx.fillStyle = blink ? pal[1] : '#ffffff';
    ctx.beginPath();
    ctx.arc(-w / 2 + 8, 0, 3, 0, TAU);
    ctx.arc(w / 2 - 8, 0, 3, 0, TAU);
    ctx.fill();

    if (world.effects.laser > 0) {
      ctx.fillStyle = '#ff5170';
      ctx.shadowColor = '#ff5170';
      ctx.shadowBlur = 10;
      for (const s of [-1, 1]) {
        roundRect(ctx, s * (w / 2 - 10) - 3.5, -h / 2 - 10, 7, 12, 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    if (world.effects.sticky > 0) {
      ctx.fillStyle = 'rgba(182,255,79,0.85)';
      for (let i = -3; i <= 3; i++) {
        const gx = (i / 3.5) * (w / 2 - 10);
        const drip = 3 + Math.abs(Math.sin(this.time * 2 + i)) * 4;
        ctx.beginPath();
        ctx.ellipse(gx, -h / 2 + 1, 6, 3, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(gx + 2, -h / 2 + drip, 2, drip / 2, 0, 0, TAU);
        ctx.fill();
      }
    }
    if (p.sleepy > 0) {
      ctx.fillStyle = 'rgba(180,240,255,0.25)';
      ctx.strokeStyle = 'rgba(200,245,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2 + 8, h + 4, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dff8ff';
      ctx.font = `700 14px ${FONT}`;
      ctx.textAlign = 'center';
      const z = (this.time * 1.5) % 1;
      ctx.globalAlpha = 1 - z;
      ctx.fillText('z', w / 2 + 6 + z * 10, -h - z * 18);
      ctx.fillText('Z', w / 2 - 2 + z * 6, -h - 10 - z * 22);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawBalls(ctx, world) {
    const fire = world.effects.fire > 0;
    const duck = world.effects.duck > 0;
    const pal = this.constellation.palette;
    const col = fire ? '#ff8a2d' : pal[0];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of world.balls) {
      const tr = this.trails.get(b.id);
      if (!tr) continue;
      const n = tr.length;
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / n;
        ctx.fillStyle = fire ? `rgba(255,${Math.round(120 + 100 * t)},60,${0.35 * t})` : rgba(i % 2 ? pal[0] : pal[1], 0.3 * t);
        ctx.beginPath();
        ctx.arc(tr[i].x, tr[i].y, b.r * (0.35 + 0.65 * t), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    for (const b of world.balls) {
      const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.6);
      glow.addColorStop(0, rgba(fire ? '#ffd27a' : '#ffffff', 0.7));
      glow.addColorStop(0.35, rgba(col, 0.35));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(b.x - b.r * 3, b.y - b.r * 3, b.r * 6, b.r * 6);
      if (duck) { drawDuck(ctx, b); continue; }
      const core = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0.5, b.x, b.y, b.r);
      core.addColorStop(0, '#ffffff');
      core.addColorStop(0.55, fire ? '#ffe08a' : mix(col, 'white', 0.6));
      core.addColorStop(1, col);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
  }

  drawParticles(ctx) {
    ctx.save();
    for (const p of this.particles) {
      if (p.delay > 0) continue;
      const t = p.life / p.max;
      if (p.kind === 'ring') {
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * t + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t * t) + 2, 0, TAU);
        ctx.stroke();
      } else if (p.kind === 'spark') {
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.kind === 'glow') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t * 0.6;
        const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        rg.addColorStop(0, p.color);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === 'star') {
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        starPath(ctx, p.x, p.y, p.size, p.size * 0.45, p.rot);
        ctx.fill();
      } else {
        ctx.globalAlpha = Math.min(1, t * 1.5);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = Math.min(1, (t.life / t.max) * 2);
      ctx.globalAlpha = a;
      ctx.font = `900 ${t.size}px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10,5,30,0.8)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ HUD

  drawHud(ctx, world) {
    const pal = this.constellation.palette;
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.top);
    g.addColorStop(0, 'rgba(10,6,34,0.95)');
    g.addColorStop(1, 'rgba(10,6,34,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.w, FIELD.top);
    ctx.textBaseline = 'alphabetic';

    // Score.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(200,210,255,0.7)';
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText('SCORE', 16, 22);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 26px ${FONT}`;
    ctx.fillText(world.score.toLocaleString('en-US'), 16, 50);

    // Level.
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(pal[0], 0.9);
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText(this.constellation.name.toUpperCase(), FIELD.w / 2, 22);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 17px ${FONT}`;
    ctx.fillText(`${levelLabel(world.levelIndex)}  ${world.level.name}`, FIELD.w / 2, 44);

    // Lives: little ships.
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(200,210,255,0.7)';
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText('SHIPS', FIELD.w - 16, 22);
    const shown = Math.min(world.lives, 5);
    for (let i = 0; i < shown; i++) {
      const x = FIELD.w - 30 - i * 28, y = 42;
      const sg = ctx.createLinearGradient(0, y - 5, 0, y + 5);
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(1, '#3a5cff');
      ctx.fillStyle = sg;
      roundRect(ctx, x - 11, y - 4, 22, 8, 4);
      ctx.fill();
      ctx.fillStyle = pal[1];
      ctx.beginPath();
      ctx.ellipse(x, y - 3, 5, 4, 0, Math.PI, 0);
      ctx.fill();
    }
    if (world.lives > 5) {
      ctx.fillStyle = '#fff';
      ctx.font = `800 13px ${FONT}`;
      ctx.fillText(`+${world.lives - 5}`, FIELD.w - 30 - 5 * 28 + 8, 47);
    }

    // Boss health, just under the HUD.
    const bs = world.boss;
    if (bs && !bs.dead) {
      const y = FIELD.top + 8;
      ctx.textAlign = 'center';
      ctx.font = `800 10px ${FONT}`;
      ctx.fillStyle = '#ffd0f0';
      ctx.fillText(bs.name.toUpperCase(), FIELD.w / 2, y + 4);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(ctx, 100, y + 8, FIELD.w - 200, 6, 3);
      ctx.fill();
      const hg = ctx.createLinearGradient(100, 0, FIELD.w - 100, 0);
      hg.addColorStop(0, '#ff4fd8');
      hg.addColorStop(1, '#ffd84f');
      ctx.fillStyle = hg;
      roundRect(ctx, 100, y + 8, (FIELD.w - 200) * (bs.hp / bs.maxHp), 6, 3);
      ctx.fill();
    }

    // Combo meter, bottom right.
    const mult = world.multiplier();
    if (world.combo > 1) {
      const t = world.comboTimer / TIMING.comboWindow;
      const x = FIELD.w - 14, y = FIELD.h - 16;
      ctx.textAlign = 'right';
      ctx.font = `900 ${mult > 1 ? 17 : 14}px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10,4,30,0.8)';
      const str = `${world.combo} combo${mult > 1 ? ` ×${mult}` : ''}`;
      ctx.strokeText(str, x, y);
      ctx.fillStyle = mult > 1 ? pal[2] : 'rgba(255,255,255,0.85)';
      ctx.fillText(str, x, y);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x - 110, y + 5, 110, 3);
      ctx.fillStyle = pal[2];
      ctx.fillRect(x - 110 * t, y + 5, 110 * t, 3);
    }

    // Active power-ups along the bottom.
    let x = 10;
    const y = FIELD.h - 12;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 9px ${FONT}`;
    const active = TIMED.filter((k) => world.effects[k] > 0);
    for (const k of active) {
      const p = POWERUPS[k];
      const frac = world.effects[k] / p.time;
      const low = world.effects[k] < 2 && Math.floor(this.time * 6) % 2;
      ctx.globalAlpha = low ? 0.4 : 1;
      ctx.fillStyle = 'rgba(10,6,30,0.8)';
      roundRect(ctx, x, y - 8, 50, 16, 8);
      ctx.fill();
      ctx.fillStyle = rgba(p.color, 0.55);
      roundRect(ctx, x, y - 8, 50 * frac, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(p.label, x + 25, y + 0.5);
      x += 55;
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawMessages(ctx, world, opts) {
    const pal = this.constellation.palette;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const big = (str, y, size, color, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${size}px ${FONT}`;
      ctx.lineWidth = size / 5;
      ctx.strokeStyle = 'rgba(10,4,30,0.85)';
      ctx.strokeText(str, FIELD.w / 2, y);
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = color;
      ctx.fillText(str, FIELD.w / 2, y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };
    if (this.intro > 0 && world.status === 'playing') {
      const a = Math.min(1, this.intro / 0.5, (2.6 - this.intro) / 0.3);
      big(world.boss ? 'BOSS!' : levelLabel(world.levelIndex), 520, 54, world.boss ? '#ff4fd8' : pal[0], a);
      big(world.level.name, 572, 26, '#ffffff', a);
    }
    const waiting = world.balls.some((b) => b.serve) && world.status === 'playing';
    if (waiting && this.intro < 1.6) {
      const a = 0.55 + 0.45 * Math.sin(this.time * 4);
      ctx.globalAlpha = a;
      ctx.font = `800 16px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(opts.launchHint || 'Press Space to launch', FIELD.w / 2, PADDLE.y - 64);
      ctx.globalAlpha = 1;
    }
    if (world.status === 'clearing' || world.status === 'cleared') {
      const pulse = this.reduced ? 1 : 1 + Math.sin(this.time * 6) * 0.04;
      ctx.save();
      ctx.translate(FIELD.w / 2, 470);
      ctx.scale(pulse, pulse);
      ctx.translate(-FIELD.w / 2, -470);
      big(world.boss ? 'BOSS DEFEATED!' : 'LEVEL CLEAR!', 470, 46, pal[2]);
      ctx.restore();
      const r = world.rating();
      ctx.font = `900 40px ${FONT}`;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < r ? '#ffe066' : 'rgba(255,255,255,0.18)';
        ctx.fillText('★', FIELD.w / 2 + (i - 1) * 48, 530);
      }
    }
    if (this.toast) {
      const a = Math.min(1, this.toast.life / 0.4);
      big(this.toast.str, 640, 24, this.toast.color, a);
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------ brick art

function drawBrickArt(g, b, side) {
  const w = b.w, h = b.h, c = b.color;
  const inset = 1.5;
  const x = inset, y = inset, bw = w - inset * 2, bh = h - inset * 2;
  if (b.skin === 'tentacle') {
    g.shadowColor = c;
    g.shadowBlur = 8;
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, mix(c, 'black', 0.3));
    gr.addColorStop(0.5, mix(c, 'white', 0.25));
    gr.addColorStop(1, mix(c, 'black', 0.3));
    g.fillStyle = gr;
    roundRect(g, x, y, bw, bh, bh / 2);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = mix(c, '#ffc1ec', 0.7);
    for (const dx of [0.3, 0.7]) {
      g.beginPath();
      g.arc(w * dx, h * 0.55, 3, 0, TAU);
      g.fill();
    }
    return;
  }
  if (b.skin === 'claw') {
    g.shadowColor = c;
    g.shadowBlur = 10;
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.5, mix(c, 'white', 0.3));
    gr.addColorStop(1, mix(c, 'black', 0.35));
    g.fillStyle = gr;
    g.beginPath();
    if (side < 0) {
      g.moveTo(2, h * 0.3); g.lineTo(w * 0.55, 2); g.lineTo(w - 2, h * 0.4); g.lineTo(w * 0.7, h * 0.55);
      g.lineTo(w - 4, h - 3); g.lineTo(w * 0.35, h - 2); g.lineTo(2, h * 0.7);
    } else {
      g.moveTo(w - 2, h * 0.3); g.lineTo(w * 0.45, 2); g.lineTo(2, h * 0.4); g.lineTo(w * 0.3, h * 0.55);
      g.lineTo(4, h - 3); g.lineTo(w * 0.65, h - 2); g.lineTo(w - 2, h * 0.7);
    }
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.2;
    g.stroke();
    return;
  }
  if (b.skin === 'segment') {
    const r = Math.min(w, h) / 2 - 1;
    g.shadowColor = c;
    g.shadowBlur = 10;
    const gr = g.createRadialGradient(w / 2 - r * 0.3, h / 2 - r * 0.3, 1, w / 2, h / 2, r);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.4, mix(c, 'white', 0.2));
    gr.addColorStop(1, mix(c, 'black', 0.4));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, TAU);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.75)';
    starPath(g, w / 2, h / 2, r * 0.45, r * 0.2);
    g.fill();
    return;
  }
  if (b.skin === 'wall') {
    g.shadowColor = c;
    g.shadowBlur = 8;
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#fffbe0');
    gr.addColorStop(1, mix(c, 'black', 0.2));
    g.fillStyle = gr;
    roundRect(g, x, y, bw, bh, bh / 2);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,95,162,0.7)';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(x + bw * (0.25 + i * 0.25), y + bh / 2, 3, 0, TAU);
      g.fill();
    }
    return;
  }

  if (b.kind === 'metal') {
    const gr = g.createLinearGradient(0, 0, w * 0.3, h);
    gr.addColorStop(0, '#f2f5ff');
    gr.addColorStop(0.45, '#9aa4c2');
    gr.addColorStop(0.55, '#c9d0e6');
    gr.addColorStop(1, '#5b6485');
    g.shadowColor = 'rgba(200,215,255,0.6)';
    g.shadowBlur = 5;
    g.fillStyle = gr;
    roundRect(g, x, y, bw, bh, 3);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = '#3a4160';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = '#4a5270';
    for (const [rx, ry] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) {
      g.beginPath();
      g.arc(rx, ry, 1.6, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.moveTo(w * 0.3, y + 1);
    g.lineTo(w * 0.18, h - 2);
    g.stroke();
    return;
  }

  const base = b.kind === 'explosive' ? '#ff5a36' : b.kind === 'star' ? '#ffc93c' : c;
  g.shadowColor = base;
  g.shadowBlur = 9;
  const gr = g.createLinearGradient(0, 0, 0, h);
  if (b.kind === 'explosive') {
    gr.addColorStop(0, '#ffb06b');
    gr.addColorStop(0.5, '#ff4f2d');
    gr.addColorStop(1, '#8f1030');
  } else {
    gr.addColorStop(0, mix(base, 'white', 0.45));
    gr.addColorStop(0.5, base);
    gr.addColorStop(1, mix(base, 'black', 0.35));
  }
  g.fillStyle = gr;
  roundRect(g, x, y, bw, bh, 5);
  g.fill();
  g.shadowBlur = 0;
  // Glossy top.
  g.fillStyle = 'rgba(255,255,255,0.32)';
  roundRect(g, x + 3, y + 2, bw - 6, bh * 0.36, 3);
  g.fill();
  // Crystal facet.
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x + bw * 0.62, y + 1);
  g.lineTo(x + bw * 0.78, y + bh - 1);
  g.stroke();
  g.strokeStyle = b.kind === 'tough' ? 'rgba(255,255,255,0.95)' : rgba(base.startsWith('#') ? base : '#ffffff', 1);
  g.lineWidth = b.kind === 'tough' ? 2.4 : 1;
  roundRect(g, x + 0.5, y + 0.5, bw - 1, bh - 1, 5);
  g.globalAlpha = b.kind === 'tough' ? 0.9 : 0.5;
  g.strokeStyle = b.kind === 'tough' ? '#ffffff' : mix(base, 'white', 0.6);
  g.stroke();
  g.globalAlpha = 1;

  const cx = w / 2, cy = h / 2;
  if (b.kind === 'tough') {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const dx of [-12, 0, 12]) {
      g.beginPath();
      g.moveTo(cx + dx, cy - 4); g.lineTo(cx + dx + 3.5, cy); g.lineTo(cx + dx, cy + 4); g.lineTo(cx + dx - 3.5, cy);
      g.closePath();
      g.fill();
    }
  } else if (b.kind === 'explosive') {
    g.fillStyle = '#2a0710';
    g.beginPath();
    g.arc(cx, cy + 1, 6.5, 0, TAU);
    g.fill();
    g.fillStyle = '#ffd84f';
    g.font = `900 11px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', cx, cy + 1.5);
  } else if (b.kind === 'star') {
    g.fillStyle = '#ffffff';
    starPath(g, cx, cy + 0.5, 7.5, 3.3);
    g.fill();
  } else if (b.kind === 'moving') {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - 8, cy - 4); g.lineTo(cx - 12, cy); g.lineTo(cx - 8, cy + 4);
    g.moveTo(cx + 8, cy - 4); g.lineTo(cx + 12, cy); g.lineTo(cx + 8, cy + 4);
    g.stroke();
  }
}

function drawCracks(ctx, b) {
  const n = b.maxHp - b.hp;
  ctx.save();
  ctx.strokeStyle = 'rgba(20,5,40,0.75)';
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  for (let k = 0; k < n * 2; k++) {
    let x = b.x + b.w * (0.2 + hash(b.id * 7 + k) * 0.6), y = b.y + (k % 2 ? b.h - 2 : 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 3; s++) {
      x += (hash(b.id + k * 13 + s) - 0.5) * 12;
      y += (k % 2 ? -1 : 1) * b.h * 0.22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawDuck(ctx, b) {
  const r = b.r * 1.25;
  const dir = b.dx < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(dir, 1);
  ctx.fillStyle = '#ffd92e';
  ctx.beginPath();
  ctx.ellipse(-r * 0.15, r * 0.25, r, r * 0.7, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.4, -r * 0.4, r * 0.55, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ff8a2d';
  ctx.beginPath();
  ctx.moveTo(r * 0.85, -r * 0.45);
  ctx.lineTo(r * 1.35, -r * 0.3);
  ctx.lineTo(r * 0.85, -r * 0.15);
  ctx.fill();
  ctx.fillStyle = '#1a1030';
  ctx.beginPath();
  ctx.arc(r * 0.55, -r * 0.55, r * 0.12, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f2b800';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, r * 0.2, r * 0.45, r * 0.25, -0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function nearestBall(world, bs) {
  let best = null, d = Infinity;
  for (const b of world.balls) {
    const dd = Math.hypot(b.x - bs.x, b.y - bs.y);
    if (dd < d) { d = dd; best = b; }
  }
  if (!best) return { x: 0, y: 1 };
  const len = d || 1;
  return { x: (best.x - bs.x) / len, y: (best.y - bs.y) / len };
}

function eyes(ctx, xs, y, r, look, { lid = 0, color = '#1a1030' } = {}) {
  for (const x of xs) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + look.x * r * 0.4, y + look.y * r * 0.4, r * 0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + look.x * r * 0.4 - r * 0.18, y + look.y * r * 0.4 - r * 0.2, r * 0.16, 0, TAU);
    ctx.fill();
    if (lid) {
      ctx.fillStyle = 'rgba(40,10,60,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, r + 0.5, Math.PI + 0.2, -0.2);
      ctx.lineTo(x + r, y - r * (1 - lid));
      ctx.lineTo(x - r, y - r * (1 - lid));
      ctx.fill();
    }
  }
}

const BOSS_ART = {
  saucer(ctx, bs, t, look, angry) {
    const w = bs.w, h = bs.h;
    // Tractor glow.
    const beam = ctx.createLinearGradient(0, h * 0.2, 0, h * 2.2);
    beam.addColorStop(0, 'rgba(94,242,255,0.25)');
    beam.addColorStop(1, 'rgba(94,242,255,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(-w * 0.18, h * 0.2);
    ctx.lineTo(w * 0.18, h * 0.2);
    ctx.lineTo(w * 0.4, h * 2.2);
    ctx.lineTo(-w * 0.4, h * 2.2);
    ctx.fill();
    // Dome with a little alien.
    const dome = ctx.createRadialGradient(-10, -h * 0.4, 2, 0, -h * 0.1, w * 0.3);
    dome.addColorStop(0, 'rgba(255,255,255,0.9)');
    dome.addColorStop(1, 'rgba(94,242,255,0.35)');
    ctx.fillStyle = '#7dff9e';
    ctx.beginPath();
    ctx.arc(0, -h * 0.12, 16, 0, TAU);
    ctx.fill();
    eyes(ctx, [-6, 6], -h * 0.16, 5, look, { lid: angry ? 0.45 : 0 });
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.05, w * 0.28, h * 0.55, 0, Math.PI, 0);
    ctx.fill();
    // Disc.
    ctx.shadowColor = '#5ef2ff';
    ctx.shadowBlur = 16;
    const disc = ctx.createLinearGradient(0, -h * 0.1, 0, h * 0.4);
    disc.addColorStop(0, '#f2f8ff');
    disc.addColorStop(0.5, '#8fa2d8');
    disc.addColorStop(1, '#343d7a');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.ellipse(0, h * 0.12, w / 2, h * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI;
      const on = (Math.floor(t * 6) + i) % 3 === 0;
      ctx.fillStyle = on ? '#ffd84f' : ['#ff4fd8', '#5ef2ff', '#6dff9e'][i % 3];
      ctx.beginPath();
      ctx.arc(-Math.cos(a) * w * 0.4, h * 0.18 + Math.sin(a) * h * 0.08, on ? 5 : 3.5, 0, TAU);
      ctx.fill();
    }
  },

  octopus(ctx, bs, t, look, angry) {
    const w = bs.w, h = bs.h;
    ctx.shadowColor = '#b86bff';
    ctx.shadowBlur = 20;
    const g = ctx.createRadialGradient(-w * 0.15, -h * 0.3, 5, 0, 0, w * 0.6);
    g.addColorStop(0, '#f0c8ff');
    g.addColorStop(0.5, '#b86bff');
    g.addColorStop(1, '#4a1f8f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.05, w / 2, h / 2 + 4, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,200,255,0.35)';
    for (const [x, y, r] of [[-50, -30, 10], [40, -36, 7], [60, -8, 5], [-66, 0, 6], [10, -44, 5]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    eyes(ctx, [-34, 34], 6, 17, look, { lid: angry ? 0.5 : 0 });
    ctx.fillStyle = '#ff9ef0';
    ctx.beginPath();
    ctx.ellipse(-58, 26, 10, 5, 0, 0, TAU);
    ctx.ellipse(58, 26, 10, 5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2a0a4a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (bs.flash > 0.3) ctx.arc(0, 34, 7, 0, TAU);
    else ctx.arc(0, 28, 10, 0.2, Math.PI - 0.2);
    ctx.stroke();
  },

  crab(ctx, bs, t, look, angry) {
    const w = bs.w, h = bs.h;
    // Legs.
    ctx.strokeStyle = '#ff7ae0';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const k = Math.sin(t * 10 + i * 1.7) * 5;
        ctx.beginPath();
        ctx.moveTo(s * (w * 0.3 + i * 8), h * 0.2);
        ctx.lineTo(s * (w * 0.5 + 12 + i * 6), h * 0.1 + k);
        ctx.lineTo(s * (w * 0.5 + 18 + i * 8), h * 0.55 + k);
        ctx.stroke();
      }
    }
    // Eye stalks.
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-18, -h * 0.35); ctx.lineTo(-22, -h * 0.75);
    ctx.moveTo(18, -h * 0.35); ctx.lineTo(22, -h * 0.75);
    ctx.stroke();
    eyes(ctx, [-22, 22], -h * 0.78, 9, look, { lid: angry ? 0.45 : 0 });
    // Crystal shell.
    ctx.shadowColor = '#ff7ae0';
    ctx.shadowBlur = 18;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#ffe4f8');
    g.addColorStop(0.5, '#ff7ae0');
    g.addColorStop(1, '#8a1f78');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 4);
    ctx.lineTo(-w * 0.32, -h / 2);
    ctx.lineTo(w * 0.32, -h / 2);
    ctx.lineTo(w / 2, 4);
    ctx.lineTo(w * 0.3, h / 2);
    ctx.lineTo(-w * 0.3, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, -h / 2); ctx.lineTo(0, 4); ctx.lineTo(w * 0.32, -h / 2);
    ctx.moveTo(-w / 2, 4); ctx.lineTo(w / 2, 4);
    ctx.moveTo(0, 4); ctx.lineTo(0, h / 2);
    ctx.stroke();
  },

  serpent(ctx, bs, t, look, angry) {
    const r = bs.w / 2;
    ctx.shadowColor = '#6bffb8';
    ctx.shadowBlur = 18;
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r * 1.1);
    g.addColorStop(0, '#e8fff4');
    g.addColorStop(0.5, '#6bffb8');
    g.addColorStop(1, '#127a55');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.05, r, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Crest of stars.
    ctx.fillStyle = '#fff06b';
    for (let i = -1; i <= 1; i++) {
      starPath(ctx, i * 14, -r - 4 + Math.abs(i) * 5, 7, 3);
      ctx.fill();
    }
    eyes(ctx, [-12, 12], -4, 8, look, { lid: angry ? 0.45 : 0 });
    // Flicking tongue.
    if (Math.sin(t * 5) > 0.4) {
      ctx.strokeStyle = '#ff4f6d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.7);
      ctx.lineTo(0, r * 1.2);
      ctx.lineTo(-5, r * 1.45);
      ctx.moveTo(0, r * 1.2);
      ctx.lineTo(5, r * 1.45);
      ctx.stroke();
    }
    ctx.strokeStyle = '#0a3a28';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 8, 9, 0.3, Math.PI - 0.3);
    ctx.stroke();
  },

  mech(ctx, bs, t, look, angry) {
    const w = bs.w, h = bs.h;
    // Gumball dome.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.35, w * 0.3, h * 0.5, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(200,240,255,0.18)';
    ctx.fill();
    ctx.clip();
    const cols = ['#ff5fa2', '#8cf2ff', '#fff38c', '#b58cff', '#6dff9e'];
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = cols[i % 5];
      ctx.beginPath();
      ctx.arc(-w * 0.25 + (i % 7) * 16 + (i > 6 ? 8 : 0), -h * 0.42 - (i > 6 ? 14 : 0), 7.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.35, w * 0.3, h * 0.5, 0, Math.PI, 0);
    ctx.stroke();
    // Arms / cannons.
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#7c86a3';
      roundRect(ctx, s * w * 0.36 - 11, h * 0.1, 22, h * 0.55, 6);
      ctx.fill();
      ctx.fillStyle = '#ff5fa2';
      ctx.beginPath();
      ctx.arc(s * w * 0.36, h * 0.65, 8, 0, TAU);
      ctx.fill();
    }
    // Body.
    ctx.shadowColor = '#ff5fa2';
    ctx.shadowBlur = 16;
    const g = ctx.createLinearGradient(0, -h * 0.35, 0, h / 2);
    g.addColorStop(0, '#ffe0ef');
    g.addColorStop(0.4, '#ff5fa2');
    g.addColorStop(1, '#7a1848');
    ctx.fillStyle = g;
    roundRect(ctx, -w * 0.42, -h * 0.35, w * 0.84, h * 0.8, 16);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Visor.
    ctx.fillStyle = '#1a0a2a';
    roundRect(ctx, -w * 0.3, -h * 0.18, w * 0.6, 22, 11);
    ctx.fill();
    const scan = Math.sin(t * 2.5) * w * 0.22;
    ctx.fillStyle = angry ? '#ff3355' : '#8cf2ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(scan + look.x * 6 - 16, -h * 0.18 + 11, 6, 0, TAU);
    ctx.arc(scan + look.x * 6 + 16, -h * 0.18 + 11, 6, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 5; i++) {
      roundRect(ctx, -30 + i * 13, h * 0.2, 8, 8, 2);
      ctx.fill();
    }
  },

  kraken(ctx, bs, t, look, angry) {
    const w = bs.w, h = bs.h;
    ctx.shadowColor = '#d44fff';
    ctx.shadowBlur = 24;
    const g = ctx.createRadialGradient(-w * 0.15, -h * 0.3, 5, 0, 0, w * 0.6);
    g.addColorStop(0, '#ffd6ff');
    g.addColorStop(0.45, '#d44fff');
    g.addColorStop(1, '#301060');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Crown.
    ctx.shadowColor = '#ffd84f';
    ctx.shadowBlur = 12;
    const cg = ctx.createLinearGradient(0, -h * 0.9, 0, -h * 0.4);
    cg.addColorStop(0, '#fff6b0');
    cg.addColorStop(1, '#ffae00');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(-44, -h * 0.4);
    for (let i = 0; i <= 4; i++) {
      ctx.lineTo(-44 + i * 22, -h * 0.4 - (i % 2 ? 18 : 34));
      if (i < 4) ctx.lineTo(-44 + i * 22 + 11, -h * 0.4 - 12);
    }
    ctx.lineTo(44, -h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff4fd8';
    ctx.beginPath();
    ctx.arc(0, -h * 0.4 - 8, 5, 0, TAU);
    ctx.fill();
    eyes(ctx, [-36, 36], 4, 18, look, { lid: angry ? 0.5 : 0.15, color: '#300a4a' });
    // Lashes.
    ctx.strokeStyle = '#300a4a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + s * (0.5 + i * 0.35);
        ctx.beginPath();
        ctx.moveTo(s * 36 + Math.cos(a) * 18, 4 + Math.sin(a) * 18);
        ctx.lineTo(s * 36 + Math.cos(a) * 25, 4 + Math.sin(a) * 25);
        ctx.stroke();
      }
    }
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 30, 12, 0.25, Math.PI - 0.25);
    ctx.stroke();
  },
};
