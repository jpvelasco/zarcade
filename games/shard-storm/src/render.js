// Canvas renderer for Shard Storm. Reads World state and events; never
// mutates the simulation. The field is FIELD.h tall and as wide as the window's
// shape asks (fieldWidthFor), scaled to fill the window (DPR aware) over a
// drifting starfield. There is no panel: the storm is the whole screen.
//
// Every crystal is a sprite baked once into an offscreen canvas, so the neon
// glow costs no shadowBlur per frame and stays cheap on phones.
import { FIELD, BLADE, COMBO, COLORS, SHIELD, CLUSTER, FROST, GOLD, MINE, SURGE } from './config.js';
import { dailyLabel } from './daily.js';
import { fieldWidthFor, objectScaleFor } from './world.js';

const TAU = Math.PI * 2;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// A five-point gem silhouette (unit radius), drawn rotated by the shard's spin.
const GEM = [[0, -1], [0.85, -0.3], [0.52, 0.9], [-0.52, 0.9], [-0.85, -0.3]];
const MINE_SPIKES = 9;
// Sprites are baked at three times field resolution: an upright 3x phone asks
// for ~2.8 device pixels per field unit, and grown crystals on a sideways
// phone for ~2.
const BAKE = 3;
const PAD = 22; // field px of glow headroom around a sprite

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
    this.rings = [];
    this.floorHits = []; // where the storm took one back
    this.shake = 0;
    this.flash = 0;
    this.flashColor = COLORS.mine;
    this.time = 0;
    this.daily = false;
    this.stars = Array.from({ length: 130 }, (_, i) => ({
      x: hash(i), y: hash(i + 500), z: 0.2 + hash(i + 900) * 0.8, tw: hash(i + 1300) * TAU,
    }));
    this.vignette = null;
    this.sprites = new Map();
    this.resize();
  }

  // ------------------------------------------------------------ sprites

  // Bake one centred sprite covering a `size` × `size` box of field space.
  bake(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * BAKE);
    const g = c.getContext('2d');
    g.scale(BAKE, BAKE);
    g.translate(size / 2, size / 2);
    draw(g);
    return { canvas: c, size };
  }

  sprite(sh) {
    const key = `${sh.kind}${sh.piece ? 'p' : ''}:${sh.kind === 'shard' || sh.kind === 'cluster' ? sh.color % COLORS.shard.length : 0}`;
    let sp = this.sprites.get(key);
    if (!sp) {
      sp = this.bakeKind(sh);
      this.sprites.set(key, sp);
    }
    return sp;
  }

  // Baked at the designed radius; drawShard scales by the crystal's size.
  bakeKind(sh) {
    const r = sh.r / (sh.size || 1);
    const size = r * 2 + PAD * 2;
    const c = COLORS.shard[sh.color % COLORS.shard.length];
    switch (sh.kind) {
      case 'mine': return this.bake(size, (g) => this.paintMine(g, r));
      case 'gold': return this.bake(size, (g) => this.paintGold(g, r));
      case 'frost': return this.bake(size, (g) => this.paintFrost(g, r));
      case 'cluster': return this.bake(size, (g) => this.paintCluster(g, r, c));
      default: return this.bake(size, (g) => this.paintGem(g, r, c));
    }
  }

  // A faceted gem: the everyday crystal.
  paintGem(g, r, c) {
    g.shadowColor = c;
    g.shadowBlur = 18;
    g.fillStyle = rgba(c, 0.92);
    g.beginPath();
    GEM.forEach(([gx, gy], i) => (i ? g.lineTo(gx * r, gy * r) : g.moveTo(gx * r, gy * r)));
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = Math.max(1, r * 0.05);
    g.beginPath();
    for (const [gx, gy] of GEM) { g.moveTo(0, 0); g.lineTo(gx * r, gy * r); }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.arc(-r * 0.2, -r * 0.35, r * 0.16, 0, TAU);
    g.fill();
  }

  // A cluster reads as a fat geode: a rounded shell with the fracture lines
  // of the shards waiting inside it.
  paintCluster(g, r, c) {
    // A dim shell with four bright gems packed inside it, ringed in the
    // cluster accent so a cluster reads as a cluster whatever colour it is.
    g.shadowColor = COLORS.cluster;
    g.shadowBlur = 18;
    g.fillStyle = 'rgba(8,16,34,0.78)';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const rr = r * (i % 2 ? 0.86 : 1);
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = rgba(COLORS.cluster, 0.9);
    g.lineWidth = Math.max(1.4, r * 0.075);
    g.stroke();
    g.shadowBlur = 0;
    // Four nodules: the pieces it will burst into, with the shell showing
    // between them so the silhouette is busy, not a disc.
    for (let i = 0; i < CLUSTER.pieces; i++) {
      const a = (i / CLUSTER.pieces) * TAU + 0.78;
      const px = Math.cos(a) * r * 0.46, py = Math.sin(a) * r * 0.46;
      g.save();
      g.translate(px, py);
      g.rotate(a);
      g.shadowColor = c;
      g.shadowBlur = 10;
      g.fillStyle = c;
      g.beginPath();
      GEM.forEach(([gx, gy], j) => {
        const x = gx * r * 0.33, y = gy * r * 0.33;
        j ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.arc(-r * 0.07, -r * 0.1, r * 0.055, 0, TAU);
      g.fill();
      g.restore();
    }
  }

  // Frost: a pale hexagon with a snowflake cross. Cold and obviously friendly.
  paintFrost(g, r) {
    const c = COLORS.frost;
    g.shadowColor = c;
    g.shadowBlur = 20;
    g.fillStyle = 'rgba(205,243,255,0.9)';
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(90,170,210,0.85)';
    g.lineWidth = Math.max(1, r * 0.08);
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      g.moveTo(-Math.cos(a) * r * 0.78, -Math.sin(a) * r * 0.78);
      g.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
    }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.arc(0, 0, r * 0.2, 0, TAU);
    g.fill();
  }

  // Gold: a six-point star. The one thing on screen worth chasing.
  paintGold(g, r) {
    const c = COLORS.gold;
    g.shadowColor = c;
    g.shadowBlur = 26;
    g.fillStyle = c;
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU - Math.PI / 2;
      const rr = i % 2 ? r * 0.46 : r;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.arc(0, 0, r * 0.26, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,240,190,0.8)';
    g.lineWidth = Math.max(1, r * 0.06);
    g.beginPath();
    g.arc(0, 0, r * 0.62, 0, TAU);
    g.stroke();
  }

  paintMine(g, r) {
    g.shadowColor = COLORS.mine;
    g.shadowBlur = 22;
    g.fillStyle = '#2a0d14';
    g.beginPath();
    for (let i = 0; i < MINE_SPIKES; i++) {
      const a = (i / MINE_SPIKES) * TAU;
      const r1 = r * 0.62, r2 = r * 0.95;
      g.lineTo(Math.cos(a - 0.22) * r1, Math.sin(a - 0.22) * r1);
      g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      g.lineTo(Math.cos(a + 0.22) * r1, Math.sin(a + 0.22) * r1);
    }
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = rgba(COLORS.mine, 0.9);
    g.beginPath();
    g.arc(0, 0, r * 0.34, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.arc(-r * 0.1, -r * 0.1, r * 0.1, 0, TAU);
    g.fill();
  }

  shieldSprite() {
    if (!this._shield) {
      const size = SHIELD.r * 2 + PAD * 2;
      this._shield = this.bake(size, (g) => {
        g.strokeStyle = rgba(COLORS.shield, 0.75);
        g.lineWidth = 3;
        g.shadowColor = COLORS.shield;
        g.shadowBlur = 12;
        g.setLineDash([14, 9]);
        g.beginPath();
        g.arc(0, 0, SHIELD.r, 0, TAU);
        g.stroke();
      });
    }
    return this._shield;
  }

  // ------------------------------------------------------------ layout

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
    // The field takes the window's shape, so it fills the screen exactly;
    // only past the width clamp (very tall or very wide windows) is there any
    // spare starfield, split evenly. main.js gives the world this width.
    this.fw = fieldWidthFor(w, h);
    this.k = objectScaleFor(w, h); // crystals grow on short screens
    this.scale = Math.min(w / this.fw, h / FIELD.h);
    this.ox = (w - this.fw * this.scale) / 2;
    this.oy = (h - FIELD.h * this.scale) / 2;
    // The visible span in field units, for things that run edge to edge.
    this.viewL = -this.ox / this.scale;
    this.viewR = (w - this.ox) / this.scale;
    // The night deepens toward the storm floor, across the whole screen.
    const bg = this.ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, COLORS.bg0);
    bg.addColorStop(1, '#0a1230');
    this.bg = bg;
    // A soft glow along the top of the screen.
    const top = this.ctx.createLinearGradient(0, 0, 0, Math.min(h * 0.3, 240));
    top.addColorStop(0, rgba(COLORS.accent, 0.07));
    top.addColorStop(1, 'rgba(0,0,0,0)');
    this.topGlow = top;
    // Screen-space gradients, cached: built in CSS pixels because every
    // screen-space pass runs under a dpr scale.
    const g = this.ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(2,3,10,0.7)');
    this.vignette = g;
    // Danger/ready blooms hug the screen edges: the playfield has to stay
    // readable even with the surge meter full.
    this.edge = {};
    for (const [name, hex] of [['surge', COLORS.surge], ['ready', COLORS.accent]]) {
      const e = this.ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.46, w / 2, h / 2, Math.max(w, h) * 0.6);
      e.addColorStop(0, rgba(hex, 0));
      e.addColorStop(0.6, rgba(hex, 0.1));
      e.addColorStop(1, rgba(hex, 0.42));
      this.edge[name] = e;
    }
  }

  toField(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / this.scale, y: (clientY - r.top - this.oy) / this.scale };
  }

  reset(world, { daily = false } = {}) {
    this.particles.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.floorHits.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.daily = daily;
    if (world && world.status !== 'over') this.time = 0;
  }

  // ------------------------------------------------------------ events

  burst(x, y, color, n, { speed = 340, life = 0.55, size = 3.2, grav = 460 } = {}) {
    const count = this.reduced ? Math.ceil(n / 2) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, sp = speed * (0.35 + Math.random());
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, age: 0,
        life: life * (0.7 + Math.random() * 0.6), size: size * (0.5 + Math.random()), color, grav,
      });
    }
  }

  ring(x, y, color, maxR, life = 0.45) {
    this.rings.push({ x, y, color, maxR, age: 0, life });
  }

  pop(x, y, text, color, size = 15, life = 0.7) {
    this.texts.push({ x, y, text, age: 0, life, color, size, vy: -50 });
  }

  banner(text, color, size = 28, life = 1.1) {
    this.texts.push({ x: this.fw / 2, y: FIELD.h * 0.38, text, age: 0, life, color, size, vy: -20 });
  }

  handleEvents(events, world) {
    for (const e of events) {
      switch (e.type) {
        case 'shard': {
          const c = COLORS.shard[e.color % COLORS.shard.length];
          this.burst(e.x, e.y, c, e.piece ? 8 : 14);
          this.burst(e.x, e.y, '#ffffff', 4, { speed: 520, life: 0.22, size: 1.6, grav: 0 });
          this.pop(e.x, e.y - 18, `+${e.points}`, c, (e.piece ? 13 : 15) + Math.min(10, e.combo));
          if (e.combo >= COMBO.slowCombo && e.combo % COMBO.slowCombo === 0) this.banner(`×${e.combo} COMBO`, COLORS.accent, 30, 0.9);
          this.shake = Math.max(this.shake, this.reduced ? 0 : 2.5);
          break;
        }
        case 'cluster': {
          const c = COLORS.shard[e.color % COLORS.shard.length];
          this.burst(e.x, e.y, c, 18, { speed: 420 });
          this.ring(e.x, e.y, c, CLUSTER.r * 2.6 * this.k, 0.4);
          this.pop(e.x, e.y - 22, `+${e.points}`, c, 18 + Math.min(10, e.combo));
          this.pop(e.x, e.y - 44, 'BURST', COLORS.cluster, 14, 0.6);
          this.shake = Math.max(this.shake, this.reduced ? 0 : 4);
          break;
        }
        case 'frost': {
          this.burst(e.x, e.y, COLORS.frost, 16, { speed: 300, grav: 120 });
          this.ring(e.x, e.y, COLORS.frost, FROST.r * 3.4 * this.k, 0.5);
          this.pop(e.x, e.y - 22, `+${e.points}`, COLORS.frost, 18);
          this.pop(e.x, e.y - 46, 'FROST', COLORS.frost, 15, 0.7);
          break;
        }
        case 'gold': {
          this.burst(e.x, e.y, COLORS.gold, 26, { speed: 480, life: 0.8 });
          this.ring(e.x, e.y, COLORS.gold, GOLD.r * 4.5 * this.k, 0.6);
          this.pop(e.x, e.y - 24, `+${e.points}`, COLORS.gold, 24);
          this.banner(e.life ? 'GOLDEN SHARD · +1 LIFE' : 'GOLDEN SHARD!', COLORS.gold, 26, 1.2);
          this.flash = Math.max(this.flash, this.reduced ? 0.1 : 0.22);
          this.flashColor = COLORS.gold;
          break;
        }
        case 'shell': {
          this.burst(e.x, e.y, COLORS.shield, 8, { speed: 280, grav: 200, life: 0.4 });
          this.pop(e.x, e.y - 26, 'CRACK', COLORS.shield, 14, 0.5);
          break;
        }
        case 'mine': {
          this.burst(e.x, e.y, COLORS.mine, 26, { speed: 560, life: 0.7, size: 3.6, grav: 300 });
          this.ring(e.x, e.y, COLORS.mine, MINE.r * 5 * this.k, 0.5);
          this.flash = this.reduced ? 0.18 : 0.4;
          this.flashColor = COLORS.mine;
          this.shake = this.reduced ? 0 : 9;
          this.pop(e.x, e.y - 24, 'MINE!', COLORS.mine, 20, 0.8);
          break;
        }
        case 'miss':
          // The storm took one back: mark the floor where it fell through.
          this.floorHits.push({ x: e.x, age: 0, life: 0.6, cost: e.cost });
          break;
        case 'overload':
          this.flash = this.reduced ? 0.2 : 0.45;
          this.flashColor = COLORS.surge;
          this.shake = this.reduced ? 0 : 10;
          this.banner('STORM SURGE!', COLORS.surge, 30, 1.3);
          this.ring(this.fw / 2, FIELD.h * 0.8, COLORS.surge, Math.max(this.fw, FIELD.h) * 0.7, 0.7);
          break;
        case 'break': {
          for (const p of e.pts) {
            const c = p.kind === 'gold' ? COLORS.gold : p.kind === 'frost' ? COLORS.frost : COLORS.shard[p.color % COLORS.shard.length];
            this.burst(p.x, p.y, c, 12, { speed: 420 });
          }
          this.ring(this.fw / 2, FIELD.h * 0.55, COLORS.accent, Math.max(this.fw, FIELD.h), 0.75);
          this.ring(this.fw / 2, FIELD.h * 0.55, '#ffffff', Math.max(this.fw, FIELD.h) * 0.7, 0.5);
          this.flash = this.reduced ? 0.2 : 0.5;
          this.flashColor = COLORS.accent;
          this.shake = this.reduced ? 0 : 7;
          this.banner(`STORM BREAK  +${e.score}`, COLORS.accent, 30, 1.3);
          if (e.defused) this.pop(this.fw / 2, FIELD.h * 0.47, `${e.defused} mine${e.defused > 1 ? 's' : ''} defused`, COLORS.shield, 16, 1);
          break;
        }
        case 'breakReady':
          this.pop(this.fw / 2, FIELD.h * 0.3, 'STORM BREAK READY', COLORS.accent, 18, 1.1);
          break;
        case 'life':
          this.banner('EXTRA LIFE', COLORS.gold, 24, 1.1);
          break;
        case 'wave':
          this.banner(e.level === 2 ? 'MINES INCOMING' : 'STORM RISING', COLORS.gold, 24, 1.1);
          break;
        case 'dailyClear':
          this.banner('STORM CLEARED!', COLORS.gold, 30, 1.4);
          break;
        default: break;
      }
    }
    this.surge = world ? world.surge : 0;
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
    for (const list of [this.rings, this.floorHits]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].age += dt;
        if (list[i].age >= list[i].life) list.splice(i, 1);
      }
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
    const { ctx, cw, ch, dpr } = this;
    const surge = world ? world.surge : 0;

    // Screen-space pass. Everything here is in CSS pixels, so it runs under a
    // dpr scale: the backing store is cw*dpr × ch*dpr and an identity
    // transform would only cover the top-left corner of it.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = this.topGlow;
    ctx.fillRect(0, 0, cw, ch);
    if (world && world.slowTimer > 0) {
      ctx.fillStyle = rgba(COLORS.accent, 0.05); // slow-mo tint
      ctx.fillRect(0, 0, cw, ch);
    }

    // Starfield in screen space, gently drifting.
    for (const s of this.stars) {
      const a = 0.25 + 0.5 * s.z * (0.6 + 0.4 * Math.sin(this.time * 1.5 + s.tw));
      ctx.fillStyle = `rgba(190,215,255,${a.toFixed(3)})`;
      const sz = this.reduced ? 1 : 0.6 + s.z * 1.8;
      ctx.fillRect(s.x * cw, s.y * ch, sz, sz);
    }
    ctx.restore();

    // Field transform with a little shake.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = this.reduced ? 0 : (Math.random() - 0.5) * this.shake;
    const sy = this.reduced ? 0 : (Math.random() - 0.5) * this.shake;
    ctx.translate(this.ox + sx * this.scale, this.oy + sy * this.scale);
    ctx.scale(this.scale, this.scale);

    this.drawFloor(ctx, surge);
    if (world) for (const sh of world.shards) this.drawShard(ctx, sh);
    if (world) this.drawBlade(ctx, world);
    this.drawRings(ctx);
    this.drawParticles(ctx);
    this.drawTexts(ctx);

    if (world && world.status === 'ready') {
      const a = Math.min(1, Math.min(world.readyT, 1) / 0.5);
      const n = Math.ceil(world.readyT);
      ctx.textAlign = 'center';
      ctx.font = `800 ${54 + (1 - world.readyT) * 8}px ${FONT}`;
      ctx.fillStyle = rgba('#ffffff', a * 0.85);
      ctx.fillText(n > 1 ? String(n) : 'GO!', this.fw / 2, FIELD.h * 0.42);
      ctx.font = `700 16px ${FONT}`;
      ctx.fillStyle = rgba('#ffffff', 0.6 * a);
      ctx.fillText(daily ? `DAILY STORM · ${dailyLabel()}` : 'SWIPE TO SLICE', this.fw / 2, FIELD.h * 0.42 + 30);
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = rgba(COLORS.accent, 0.5 * a);
      ctx.fillText('DON’T LET THEM FALL BACK', this.fw / 2, FIELD.h * 0.42 + 54);
    }

    // Screen-space overlays, again under the dpr scale.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, cw, ch);
    // The edges bloom red as the surge climbs: the danger is never a surprise.
    if (surge > 0.3) {
      const k = Math.min(1, (surge - 0.3) / 0.7);
      ctx.globalAlpha = k * (surge >= SURGE.warn && !this.reduced ? 0.8 + 0.2 * Math.sin(this.time * 9) : 0.8);
      ctx.fillStyle = this.edge.surge;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalAlpha = 1;
    }
    if (world && world.breakReady && world.status === 'play') {
      ctx.globalAlpha = this.reduced ? 0.26 : 0.2 + 0.14 * Math.sin(this.time * 5);
      ctx.fillStyle = this.edge.ready;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalAlpha = 1;
    }
    if (this.flash > 0) {
      ctx.fillStyle = rgba(this.flashColor, Math.min(0.5, this.flash) * 0.45);
      ctx.fillRect(0, 0, cw, ch);
    }
    if (attract) {
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, 'rgba(5,4,18,0.1)');
      g.addColorStop(1, 'rgba(5,4,18,0.45)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.restore();
  }

  // The storm floor: it glows brighter the fuller the surge, and flares where
  // a crystal just fell back through it.
  drawFloor(ctx, surge) {
    const h = 56;
    const g = ctx.createLinearGradient(0, FIELD.h - h, 0, FIELD.h);
    const hot = surge >= SURGE.warn ? COLORS.surge : surge > 0.3 ? COLORS.surgeWarn : COLORS.accent;
    g.addColorStop(0, rgba(hot, 0));
    g.addColorStop(1, rgba(hot, 0.1 + 0.3 * surge));
    ctx.fillStyle = g;
    // Edge to edge, even where the window is wider than the field.
    const x0 = this.viewL, span = this.viewR - this.viewL;
    ctx.fillRect(x0, FIELD.h - h, span, h);
    ctx.fillStyle = rgba(hot, 0.3 + 0.5 * surge);
    ctx.fillRect(x0, FIELD.h - 3, span, 3);
    for (const f of this.floorHits) {
      const k = 1 - f.age / f.life;
      const w = 90 * (1.6 - k);
      const fg = ctx.createRadialGradient(f.x, FIELD.h, 0, f.x, FIELD.h, w);
      fg.addColorStop(0, rgba(COLORS.surge, 0.75 * k));
      fg.addColorStop(1, rgba(COLORS.surge, 0));
      ctx.fillStyle = fg;
      ctx.fillRect(f.x - w, FIELD.h - w, w * 2, w);
    }
  }

  drawShard(ctx, sh) {
    const sp = this.sprite(sh);
    let scale = 1;
    if (sh.kind === 'mine') scale = 1 + 0.12 * Math.sin(this.time * 6 + sh.rot);
    else if (sh.kind === 'gold') scale = 1 + 0.1 * Math.sin(this.time * 7 + sh.rot);
    const size = sp.size * scale * (sh.size || 1);
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(sh.kind === 'mine' ? sh.rot * 0.3 : sh.rot);
    ctx.drawImage(sp.canvas, -size / 2, -size / 2, size, size);
    ctx.restore();

    if (sh.shielded) {
      const ring = this.shieldSprite();
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(this.reduced ? 0 : this.time * 1.2);
      const rs = ring.size * (sh.size || 1);
      ctx.drawImage(ring.canvas, -rs / 2, -rs / 2, rs, rs);
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
    ctx.globalCompositeOperation = 'lighter';
    // Outer glow, then a hot white core.
    for (const [width, color] of [
      [BLADE.radius * 2.4, rgba(COLORS.bladeEdge, 0.14 * k)],
      [BLADE.radius * 1.3, rgba(COLORS.bladeEdge, 0.4 * k)],
      [3.5, rgba(COLORS.blade, 0.95 * k)],
    ]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) (i ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y));
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRings(ctx) {
    if (!this.rings.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const k = r.age / r.life;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, 7 * (1 - k));
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.maxR * (0.15 + 0.85 * k), 0, TAU);
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

  drawTexts(ctx) {
    if (!this.texts.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const a = t.age < 0.15 ? t.age / 0.15 : 1 - Math.max(0, (t.age - t.life * 0.55) / (t.life * 0.45));
      ctx.font = `800 ${t.size}px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(4,6,18,${Math.max(0, a) * 0.7})`;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = rgba(t.color, Math.max(0, a));
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
