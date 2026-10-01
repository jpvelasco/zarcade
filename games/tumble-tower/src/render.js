// Canvas renderer. Reads game state, never changes it. Static art (sky,
// island, clouds, animals) is baked into offscreen canvases; a frame is
// mostly drawImage calls.
import { SpriteBank, drawAnimal, drawSilhouette } from './sprites.js';
import { ANIMAL_BY_ID, animalShape } from './animals.js';
import { THEME_BY_ID } from './themes.js';
import { HOLD_SECONDS, PLAYER_COLORS } from './game.js';
import { rng } from './rng.js';

const SKY_TOP = 90, SKY_BOTTOM = -6; // metres covered by the baked sky strip
const SEA_Y = -1.25;
const MAX_PARTICLES = 240;
const CONFETTI = ['#ff5e7a', '#ffd23f', '#3fd6ff', '#7cf06b', '#b57aff', '#ff9a3c'];
const DUST = 'rgba(255, 255, 255, 0.7)';
const LABELS = Array.from({ length: 401 }, (_, i) => `${i} m`);

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t;
  const g = ((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t;
  const bl = (pa & 255) + ((pb & 255) - (pa & 255)) * t;
  return `rgb(${r | 0}, ${g | 0}, ${bl | 0})`;
}

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.bank = new SpriteBank();
    this.theme = THEME_BY_ID.sunny;
    this.camBottom = -2.6;
    this.camX = 0;
    this.bottomPad = 0; // px kept clear for on-screen buttons
    this.railY = 0;
    this.side = false; // menus on wide screens: tower to the right of the card
    this.scale = 0;
    this.time = 0;
    this.shake = 0;
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 0, color: DUST, kind: 0, rot: 0, vr: 0 });
    this.banners = [];
    this.squash = new WeakMap();
    this.width = 6;
    this.islandKey = '';
    this.windX = 0;
    this.resize();
  }

  // ---------------------------------------------------------- setup

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.layout();
  }

  layout() {
    // Zoom range: close up while the tower is small, further out as it grows.
    const portrait = this.H > this.W * 1.3;
    const viewW = portrait ? this.width + 2.6 : Math.max(this.width + 5.2, 10.5);
    this.maxScale = Math.min(this.W / viewW, this.H / 9.5);
    this.minScale = Math.min(this.W / viewW, this.H / 17);
    this.bakeScale = this.maxScale;
    if (!this.scale || this.scale > this.maxScale || this.scale < this.minScale) this.scale = this.maxScale;
    this.viewH = this.H / this.scale;
    this.bank.bake(this.bakeScale * this.dpr);
    this.bakeScene();
  }

  setTheme(id) {
    const t = THEME_BY_ID[id] || THEME_BY_ID.sunny;
    if (t === this.theme && this.sky) return;
    this.theme = t;
    this.bakeScene();
  }

  setGame(game) {
    this.width = game.level.width;
    this.mover = !!game.level.mover;
    this.camBottom = -2.6;
    this.scale = 0;
    for (const p of this.particles) p.on = false;
    this.banners.length = 0;
    this.shake = 0;
    this.layout();
  }

  bakeScene() {
    const t = this.theme, s = this.bakeScale * this.dpr;
    // sky strip: one pixel column per height, stretched at draw time
    const sky = makeCanvas(4, 512);
    const g = sky.getContext('2d');
    for (let i = 0; i < 512; i++) {
      const y = SKY_TOP - (i / 511) * (SKY_TOP - SKY_BOTTOM);
      let col;
      if (y > 40) col = lerpColor(t.high[1], t.high[0], Math.min(1, (y - 40) / 50));
      else if (y > 14) col = lerpColor(t.sky[0], t.high[1], (y - 14) / 26);
      else if (y > 4) col = lerpColor(t.sky[1], t.sky[0], (y - 4) / 10);
      else col = lerpColor(t.sky[2], t.sky[1], Math.max(0, (y + 2) / 6));
      g.fillStyle = col;
      g.fillRect(0, i, 4, 1);
    }
    this.sky = sky;
    this.bakeDecor(s);
    this.bakeIsland(s);
    this.bakeCrane();
    // sea gradient lives in sea-local coordinates (0 = surface)
    const ctx = this.ctx;
    this.seaGrad = ctx.createLinearGradient(0, 0, 0, 3 * this.bakeScale);
    this.seaGrad.addColorStop(0, t.sea[0]);
    this.seaGrad.addColorStop(1, t.sea[1]);
    this.goalFont = `900 ${Math.round(Math.max(13, Math.min(18, this.bakeScale * 0.3)))}px ui-rounded, system-ui, sans-serif`;
  }

  bakeDecor(s) {
    const t = this.theme;
    const sprites = {};
    const cloud = (w, h, col, puffs) => {
      const c = makeCanvas(w * s, h * s);
      const g = c.getContext('2d');
      g.scale(s, s);
      g.fillStyle = col;
      for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
      return c;
    };
    if (t.decor === 'clouds' || t.decor === 'candy') {
      const col = t.decor === 'candy' ? 'rgba(255, 240, 250, 0.9)' : 'rgba(255, 255, 255, 0.88)';
      sprites.a = cloud(4, 1.6, col, [[0.9, 1.0, 0.55], [1.7, 0.75, 0.7], [2.6, 0.95, 0.55], [3.2, 1.1, 0.4], [1.8, 1.15, 0.45]]);
      sprites.b = cloud(2.6, 1.2, col, [[0.6, 0.75, 0.4], [1.3, 0.55, 0.5], [2.0, 0.78, 0.38]]);
    }
    if (t.decor === 'candy') {
      const c = makeCanvas(1.2 * s, 2.4 * s);
      const g = c.getContext('2d');
      g.scale(s, s);
      g.fillStyle = '#fff'; g.fillRect(0.56, 1.0, 0.08, 1.4);
      const cols = ['#ff5fae', '#ffd23f', '#5ed2ff'];
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0.6, 0.6, 0.55 - i * 0.17, 0, Math.PI * 2); g.fillStyle = cols[i]; g.fill(); }
      sprites.pop = c;
    }
    if (t.decor === 'jungle') {
      const c = makeCanvas(3 * s, 1.5 * s);
      const g = c.getContext('2d');
      g.scale(s, s);
      g.fillStyle = 'rgba(46, 138, 53, 0.55)';
      for (const [x, y, r] of [[0.7, 0.9, 0.6], [1.5, 0.6, 0.75], [2.3, 0.9, 0.55]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); g.fill(); }
      sprites.a = c;
      const v = makeCanvas(0.6 * s, 5 * s);
      const vg = v.getContext('2d');
      vg.scale(s, s);
      vg.strokeStyle = '#2e8a35'; vg.lineWidth = 0.08;
      vg.beginPath(); vg.moveTo(0.3, 0); vg.bezierCurveTo(0.05, 1.5, 0.55, 3, 0.3, 5); vg.stroke();
      vg.fillStyle = '#4cc24a';
      for (let y = 0.5; y < 5; y += 0.6) { vg.beginPath(); vg.ellipse(0.3 + Math.sin(y * 2) * 0.15, y, 0.18, 0.09, 0.6, 0, Math.PI * 2); vg.fill(); }
      sprites.vine = v;
    }
    if (t.decor === 'space') {
      const st = makeCanvas(12 * s, 12 * s);
      const g = st.getContext('2d');
      const r = rng(77);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = r() < 0.2 ? '#ffe7a3' : '#ffffff';
        g.globalAlpha = 0.4 + r() * 0.6;
        g.beginPath(); g.arc(r() * st.width, r() * st.height, (0.5 + r() * 1.4) * this.dpr, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      sprites.stars = st;
      const p = makeCanvas(3 * s, 3 * s);
      const pg = p.getContext('2d');
      pg.scale(s, s);
      pg.fillStyle = '#ff9a6b'; pg.beginPath(); pg.arc(1.5, 1.5, 0.9, 0, Math.PI * 2); pg.fill();
      pg.fillStyle = 'rgba(255, 255, 255, 0.25)'; pg.beginPath(); pg.arc(1.25, 1.2, 0.5, 0, Math.PI * 2); pg.fill();
      pg.strokeStyle = '#ffd6a3'; pg.lineWidth = 0.12; pg.beginPath(); pg.ellipse(1.5, 1.5, 1.4, 0.35, -0.3, 0, Math.PI * 2); pg.stroke();
      sprites.planet = p;
    }
    // distant islands near the horizon
    const far = makeCanvas(30 * s, 3 * s);
    const fg = far.getContext('2d');
    fg.scale(s, s);
    fg.fillStyle = t.decor === 'space' ? 'rgba(120, 110, 200, 0.45)' : t.decor === 'candy' ? 'rgba(255, 150, 200, 0.5)' : 'rgba(70, 150, 120, 0.4)';
    for (const [x, w, h] of [[3, 4, 1.2], [9, 2.5, 0.8], [20, 5, 1.6], [26, 2.2, 0.7]]) {
      fg.beginPath(); fg.ellipse(x, 3, w, h, 0, Math.PI, 0); fg.fill();
    }
    sprites.far = far;
    this.decor = sprites;
    // deterministic placements in world space
    const r = rng(1234);
    this.decorItems = [];
    for (let i = 0; i < 46; i++) {
      const y = 3 + i * 2.6 + r() * 1.5;
      const kind = t.decor === 'space' ? (i % 9 === 4 ? 'planet' : null) : t.decor === 'candy' ? (i % 4 === 1 ? 'pop' : (i % 2 ? 'b' : 'a')) : (i % 2 ? 'b' : 'a');
      if (!kind || !sprites[kind]) continue;
      this.decorItems.push({ kind, x: (r() - 0.5) * 26, y, speed: 0.08 + r() * 0.15, par: 0.55 + r() * 0.25 });
    }
  }

  bakeIsland(s) {
    const t = this.theme, w = this.width;
    const key = `${t.id}:${w}:${s}:${this.mover}`;
    if (key === this.islandKey) return;
    this.islandKey = key;
    const padX = 1.2, depth = 3.2;
    const c = makeCanvas((w + padX * 2) * s, (depth + 0.6) * s);
    const g = c.getContext('2d');
    g.scale(s, s);
    g.translate(padX + w / 2, 0.4); // x = 0 centre, y = 0 island top
    const gr = t.ground;
    if (this.mover) {
      // a wooden raft on barrels
      g.fillStyle = '#7a4a26';
      for (const bx of [-w / 2 + 0.6, 0, w / 2 - 0.6]) { g.beginPath(); g.ellipse(bx, 1.05, 0.55, 0.38, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#b07040';
      for (const bx of [-w / 2 + 0.6, 0, w / 2 - 0.6]) { g.fillRect(bx - 0.52, 0.95, 1.04, 0.08); }
      g.fillStyle = '#c98a4f';
      g.fillRect(-w / 2, 0, w, 0.7);
      g.strokeStyle = '#8a5530'; g.lineWidth = 0.05;
      for (let x = -w / 2; x < w / 2 - 0.01; x += 0.5) { g.strokeRect(x, 0, 0.5, 0.7); }
      g.fillStyle = 'rgba(255, 255, 255, 0.18)';
      g.fillRect(-w / 2, 0, w, 0.1);
      g.strokeStyle = '#e8d3a3'; g.lineWidth = 0.08;
      g.beginPath(); g.moveTo(-w / 2 + 0.25, 0.1); g.lineTo(-w / 2 + 0.25, 0.65); g.moveTo(w / 2 - 0.25, 0.1); g.lineTo(w / 2 - 0.25, 0.65); g.stroke();
    } else {
      // rock body tapering into the sea
      g.fillStyle = gr.rock;
      g.beginPath();
      g.moveTo(-w / 2 - 0.05, 0.1);
      g.quadraticCurveTo(-w / 2 + 0.1, 1.4, -w / 2 + 0.7, depth);
      g.lineTo(w / 2 - 0.7, depth);
      g.quadraticCurveTo(w / 2 - 0.1, 1.4, w / 2 + 0.05, 0.1);
      g.closePath();
      g.fill();
      g.fillStyle = gr.rockDark;
      const r = rng(9);
      for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse((r() - 0.5) * (w - 1.2), 0.7 + r() * 2.2, 0.18 + r() * 0.25, 0.1 + r() * 0.12, 0, 0, Math.PI * 2); g.fill(); }
      if (t.decor === 'candy') {
        // cake layers with icing drips
        g.fillStyle = '#ffd6e8'; g.fillRect(-w / 2 + 0.05, 0.9, w - 0.1, 0.25);
        g.fillStyle = '#fff2f8';
        g.beginPath(); g.moveTo(-w / 2 - 0.08, 0);
        for (let x = -w / 2; x <= w / 2; x += 0.4) g.quadraticCurveTo(x + 0.2, 0.65 + ((x * 7) % 3 === 0 ? 0.2 : 0), x + 0.4, 0.3);
        g.lineTo(w / 2 + 0.08, 0); g.closePath(); g.fill();
        const sp = ['#ff5fae', '#5ed2ff', '#ffd23f', '#7cf06b'];
        for (let i = 0; i < w * 4; i++) { g.fillStyle = sp[i % 4]; g.fillRect(-w / 2 + 0.15 + r() * (w - 0.3), 0.05 + r() * 0.2, 0.12, 0.04); }
      } else {
        // grass (or moss, or metal deck) lip
        g.fillStyle = gr.edge;
        g.beginPath(); g.moveTo(-w / 2 - 0.1, 0);
        g.lineTo(w / 2 + 0.1, 0); g.lineTo(w / 2 + 0.05, 0.38);
        for (let x = w / 2; x > -w / 2; x -= 0.3) g.quadraticCurveTo(x - 0.15, 0.62, x - 0.3, 0.38);
        g.closePath(); g.fill();
        g.fillStyle = gr.top; g.fillRect(-w / 2 - 0.1, 0, w + 0.2, 0.2);
        if (t.decor === 'space') {
          g.fillStyle = '#5ef2ff';
          for (let x = -w / 2 + 0.3; x < w / 2; x += 0.7) { g.beginPath(); g.arc(x, 0.36, 0.06, 0, Math.PI * 2); g.fill(); }
        } else {
          const fl = t.decor === 'jungle' ? ['#ffcf3f', '#ff7a1a'] : ['#ffffff', '#ffd23f', '#ff8fb8'];
          for (let i = 0; i < w * 1.6; i++) {
            g.fillStyle = fl[i % fl.length];
            g.beginPath(); g.arc(-w / 2 + 0.2 + r() * (w - 0.4), 0.3 + r() * 0.18, 0.05, 0, Math.PI * 2); g.fill();
          }
        }
      }
    }
    this.island = { canvas: c, ox: (padX + w / 2) * s, oy: 0.4 * s };
  }

  bakeCrane() {
    const h = 22 * this.dpr;
    const c = makeCanvas(64 * this.dpr, h);
    const g = c.getContext('2d');
    g.scale(this.dpr, this.dpr);
    g.fillStyle = '#ffc43d'; g.fillRect(0, 2, 64, 16);
    g.strokeStyle = '#c98a14'; g.lineWidth = 2;
    g.strokeRect(1, 3, 62, 14);
    g.beginPath();
    for (let x = 0; x < 64; x += 16) { g.moveTo(x, 3); g.lineTo(x + 8, 17); g.lineTo(x + 16, 3); }
    g.stroke();
    this.girder = c;
  }

  // ---------------------------------------------------------- coordinates

  sx(x) { return this.W / 2 + (x - this.camX) * this.scale; }
  sy(y) { return this.H - (y - this.camBottom) * this.scale; }
  worldX(clientX) { return (clientX - this.W / 2) / this.scale + this.camX; }

  // ---------------------------------------------------------- events

  spawn(kind, x, y, vx, vy, life, size, color) {
    const reduced = this.reduced;
    if (reduced && kind === 2) return;
    for (const p of this.particles) {
      if (p.on) continue;
      p.on = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color;
      p.rot = Math.random() * 6; p.vr = (Math.random() - 0.5) * 10;
      return;
    }
  }

  banner(text, sub = '', color = '#ffffff', time = 1.6) {
    this.banners.push({ text, sub, color, t: 0, time });
    if (this.banners.length > 3) this.banners.shift();
  }

  handleEvents(events, game) {
    for (const e of events) {
      if (e.type === 'impact') {
        const n = Math.min(8, Math.floor(e.speed * 1.5));
        for (let i = 0; i < n; i++) this.spawn(0, e.x + (Math.random() - 0.5) * 0.4, e.y, (Math.random() - 0.5) * 2.5, Math.random() * 1.2, 0.45, 0.05 + Math.random() * 0.06, DUST);
        if (e.body) this.squash.set(e.body, Math.min(0.09, e.speed * 0.025));
        if (e.speed > 3 && !this.reduced) this.shake = Math.min(0.12, this.shake + e.speed * 0.01);
      } else if (e.type === 'splash') {
        for (let i = 0; i < 18; i++) this.spawn(1, e.x, SEA_Y, (Math.random() - 0.5) * 4, 3 + Math.random() * 4, 0.9, 0.08 + Math.random() * 0.08, this.theme.foam);
      } else if (e.type === 'win') {
        for (let i = 0; i < (this.reduced ? 20 : 90); i++) {
          this.spawn(2, (Math.random() - 0.5) * 10, game.top + 2 + Math.random() * 4, (Math.random() - 0.5) * 3, Math.random() * 3, 2.6, 0.12, CONFETTI[i % CONFETTI.length]);
        }
      } else if (e.type === 'milestone') {
        this.banner(`${e.height} m!`, 'Keep going!', '#ffd23f', 1.4);
        for (let i = 0; i < (this.reduced ? 8 : 30); i++) this.spawn(2, (Math.random() - 0.5) * 6, e.height + Math.random() * 2, (Math.random() - 0.5) * 3, Math.random() * 3, 2, 0.1, CONFETTI[i % CONFETTI.length]);
      }
    }
  }

  // ---------------------------------------------------------- update

  update(dt, game) {
    this.time += dt;
    if (game) {
      const k = Math.min(1, dt * 2.5);
      const need = Math.max(game.craneY + 3.4, (game.goal ?? 0) + 2.2, 6) + 2.4;
      const ws = Math.max(this.minScale, Math.min(this.maxScale, this.H / need));
      this.scale += (ws - this.scale) * Math.min(1, dt * 1.6);
      this.viewH = this.H / this.scale;
      const floor = -2.4 - this.bottomPad / this.scale;
      const want = Math.max(floor, game.craneY + 3.2 - this.viewH);
      this.camBottom += (want - this.camBottom) * k;
      const wantX = this.side && this.W > 900 ? -(this.W * 0.2) / this.scale : 0;
      this.camX += (wantX - this.camX) * k;
      this.windX = game.windNow;
      const railWant = Math.max(0, Math.min(this.H * 0.45, this.sy(game.craneY + 4.2)));
      this.railY += (railWant - this.railY) * k;
    }
    this.shake = Math.max(0, this.shake - dt * 0.6);
    const g = -9;
    for (const p of this.particles) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      if (p.kind === 2) { p.vy += g * 0.15 * dt; p.vx += (this.windX * 0.6 - p.vx) * dt; p.vx *= 0.99; p.rot += p.vr * dt; }
      else if (p.kind === 1) p.vy += g * dt;
      else if (p.kind === 3) { /* wind streak: straight */ }
      else { p.vx *= 0.92; p.vy *= 0.92; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (const b of this.banners) b.t += dt;
    while (this.banners.length && this.banners[0].t > this.banners[0].time) this.banners.shift();
    // wind streaks
    if (game && Math.abs(game.windNow) > 0.25 && !this.reduced && Math.random() < Math.abs(game.windNow) * dt * 14) {
      const dir = Math.sign(game.windNow);
      const halfW = this.W / this.scale / 2;
      this.spawn(3, -dir * (halfW + 1), this.camBottom + Math.random() * this.viewH, dir * (6 + Math.abs(game.windNow) * 3), 0, 2.2, 0.6 + Math.random() * 0.8, 'rgba(255, 255, 255, 0.55)');
    }
  }

  // ---------------------------------------------------------- draw

  draw(game, opts = {}) {
    const ctx = this.ctx, dpr = this.dpr, s = this.scale;
    let ox = 0, oy = 0;
    if (this.shake > 0) { ox = (Math.random() - 0.5) * this.shake * s; oy = (Math.random() - 0.5) * this.shake * s; }
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    this.drawSky(ctx);
    this.drawDecor(ctx);
    this.drawSeaBack(ctx);
    if (!game) return;
    this.drawIsland(ctx, game);
    this.drawGoal(ctx, game);
    this.drawWindsock(ctx, game);
    for (const b of game.blocks) this.drawBlock(ctx, b, game);
    if (game.held) this.drawHeld(ctx, game, opts);
    this.drawSeaFront(ctx);
    this.drawParticles(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (opts.hud !== false) this.drawRuler(ctx, game);
    this.drawCraneRail(ctx, game, opts);
    this.drawHold(ctx, game);
    this.drawBanners(ctx);
  }

  drawSky(ctx) {
    const top = this.camBottom + this.viewH;
    const span = SKY_TOP - SKY_BOTTOM;
    const r0 = Math.max(0, Math.min(511, ((SKY_TOP - top) / span) * 511));
    const r1 = Math.max(r0 + 1, Math.min(512, ((SKY_TOP - this.camBottom) / span) * 511));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.sky, 0, r0, 4, r1 - r0, -20, -20, this.W + 40, this.H + 40);
  }

  drawDecor(ctx) {
    const d = this.decor, s = this.scale, dpr = this.dpr;
    if (d.stars) {
      const tile = d.stars.width / dpr;
      const off = ((this.camBottom * s * 0.3) % tile + tile) % tile;
      for (let y = -tile + off; y < this.H; y += tile) for (let x = 0; x < this.W; x += tile) ctx.drawImage(d.stars, x, y, tile, tile);
    }
    const halfW = this.W / s / 2 + 3;
    const kk = s / this.bakeScale / dpr;
    for (const it of this.decorItems) {
      const img = d[it.kind];
      // parallax: decor drifts up the screen slower than the tower
      const py = this.sy(it.y + (this.camBottom + 2.6) * (1 - it.par));
      if (py < -img.height * kk || py > this.H + img.height * kk) continue;
      let x = it.x + (it.kind === 'pop' || it.kind === 'planet' ? 0 : this.time * it.speed);
      x = ((x + halfW) % (halfW * 2) + halfW * 2) % (halfW * 2) - halfW;
      const iw = img.width * kk, ih = img.height * kk;
      ctx.drawImage(img, this.sx(x) - iw / 2, py - ih / 2, iw, ih);
    }
    if (d.vine) {
      const vh = d.vine.height / dpr, vw = d.vine.width / dpr;
      for (const [fx, len] of [[0.04, 1], [0.12, 0.7], [0.9, 0.85], [0.97, 1.1]]) {
        ctx.drawImage(d.vine, this.W * fx - vw / 2, -vh * (1 - len) - 10, vw, vh);
      }
    }
    // horizon islands
    const far = d.far;
    const fw = far.width * kk, fh = far.height * kk;
    const fy = this.sy(SEA_Y) - fh + 2;
    if (fy < this.H + 10) ctx.drawImage(far, this.W / 2 - fw / 2 - this.camX * s * 0.3, fy, fw, fh);
  }

  drawSeaBack(ctx) {
    const y = this.sy(SEA_Y + 0.15);
    if (y > this.H) return;
    ctx.save();
    ctx.translate(0, y);
    ctx.fillStyle = this.seaGrad;
    ctx.fillRect(-20, 0, this.W + 40, this.H - y + 20);
    ctx.restore();
  }

  drawSeaFront(ctx) {
    const base = this.sy(SEA_Y);
    if (base > this.H + 20) return;
    const s = this.scale, t = this.time;
    ctx.save();
    ctx.translate(0, base);
    ctx.fillStyle = this.seaGrad;
    ctx.beginPath();
    ctx.moveTo(-20, this.H);
    const amp = this.reduced ? 0.04 : 0.09;
    for (let x = -20; x <= this.W + 20; x += 16) {
      const wx = x / s;
      ctx.lineTo(x, (Math.sin(wx * 1.6 + t * 1.8) * amp + Math.sin(wx * 0.7 - t * 1.1) * amp * 0.6) * s);
    }
    ctx.lineTo(this.W + 20, this.H);
    ctx.closePath();
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.theme.foam;
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.beginPath();
    for (let x = -20; x <= this.W + 20; x += 16) {
      const wx = x / s;
      const yy = (Math.sin(wx * 1.6 + t * 1.8) * amp + Math.sin(wx * 0.7 - t * 1.1) * amp * 0.6) * s;
      if (x === -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawIsland(ctx, game) {
    const isl = this.island, p = game.platform, k = this.scale / this.bakeScale / this.dpr;
    const x = this.sx(p.x), y = this.sy(p.y + 0.5);
    ctx.save();
    ctx.translate(x, y);
    if (p.angle) ctx.rotate(-p.angle);
    ctx.drawImage(isl.canvas, -isl.ox * k, -isl.oy * k, isl.canvas.width * k, isl.canvas.height * k);
    ctx.restore();
  }

  drawGoal(ctx, game) {
    if (game.goal == null) return;
    const y = this.sy(game.goal);
    if (y < -10 || y > this.H + 10) return;
    const reached = game.top >= game.goal;
    ctx.save();
    ctx.strokeStyle = reached ? '#ffd23f' : this.theme.goal;
    ctx.lineWidth = reached ? 4 : 3;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -this.time * 20;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke();
    ctx.setLineDash([]);
    // flag on the right
    const fx = this.sx(-game.level.width / 2 + 0.2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(fx - 1.5, y - 34, 3, 34);
    ctx.fillStyle = reached ? '#ffd23f' : this.theme.goal;
    ctx.beginPath(); ctx.moveTo(fx + 1.5, y - 34); ctx.lineTo(fx + 30, y - 26); ctx.lineTo(fx + 1.5, y - 18); ctx.closePath(); ctx.fill();
    ctx.font = this.goalFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.strokeText('GOAL', fx + 6, y - 38 + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('GOAL', fx + 6, y - 38 + 2);
    ctx.restore();
  }

  drawWindsock(ctx, game) {
    const w = game.windNow;
    if (!game.level.wind && Math.abs(w) < 0.05) return;
    const x = this.sx(game.platform.x - game.level.width / 2 + 0.25), y = this.sy(0);
    const h = 1.6 * this.scale;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
    const len = Math.min(1.2, 0.3 + Math.abs(w) * 0.45) * this.scale;
    const dir = Math.sign(w) || 1;
    const flap = Math.sin(this.time * 9) * 3;
    ctx.fillStyle = '#ff5e7a';
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + dir * len, y - h + 6 + flap);
    ctx.lineTo(x + dir * len, y - h + 14 + flap);
    ctx.lineTo(x, y - h + 20);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.min(x, x + dir * len * 0.5), y - h + 4, len * 0.25, 14);
  }

  expression(b, game) {
    if (game.phase === 'lost') return 'worried';
    if (game.phase === 'won' || game.holdTime > 0) return 'grin';
    const kin = game.platform.kind === 'kinematic';
    const v = Math.hypot(kin ? b.vx - game.platform.vx : b.vx, b.vy) + Math.abs(b.w - (kin ? game.platform.w : 0)) * 0.7;
    if (v > 0.35 || game.sway > 0.8) return 'worried';
    const k = (b.id * 1.37) % 4.3;
    return ((this.time + k) % 4.3) < 0.14 ? 'blink' : 'idle';
  }

  drawSprite(ctx, id, ice, x, y, angle, expr, sq = 0) {
    const sp = this.bank.get(id);
    if (!sp) return;
    const dpr = this.dpr;
    const c = Math.cos(-angle), sn = Math.sin(-angle);
    const sxp = this.sx(x), syp = this.sy(y);
    const k = 1 / (this.bank.scale / this.scale); // sprite px -> css px
    const ax = 1 + sq * 0.6, ay = 1 - sq;
    ctx.setTransform(c * ax * k * dpr, sn * ax * k * dpr, -sn * ay * k * dpr, c * ay * k * dpr, (sxp + 0) * dpr, syp * dpr);
    const half = sp.px / 2;
    ctx.drawImage(sp[expr], -half, -half);
    if (ice) ctx.drawImage(sp.ice, -half, -half);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  drawBlock(ctx, b, game) {
    const y = this.sy(b.y);
    if (y < -200 || y > this.H + 200) return;
    let sq = this.squash.get(b) || 0;
    if (sq > 0) { sq = Math.max(0, sq - 0.008); this.squash.set(b, sq); }
    if (this.reduced) sq = 0;
    this.drawSprite(ctx, b.user.animal, b.user.ice, b.x, b.y, b.angle, this.expression(b, game), sq);
  }

  drawHeld(ctx, game, opts) {
    const h = game.held;
    const y = game.craneY;
    // drop guide: a soft column down to whatever is below
    const halfW = this.extentX(h.animal, h.angle);
    let below = -1.4;
    const plat = game.platform;
    if (h.x + halfW > plat.minX && h.x - halfW < plat.maxX) below = plat.maxY;
    for (const b of game.blocks) {
      if (b.maxX < h.x - halfW || b.minX > h.x + halfW) continue;
      if (b.maxY > below && b.maxY < y) below = b.maxY;
    }
    const x0 = this.sx(h.x - halfW), x1 = this.sx(h.x + halfW);
    const yTop = this.sy(y), yBot = this.sy(below);
    ctx.fillStyle = opts.canDrop === false ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(x0, yBot - 3, x1 - x0, 3);
    // cable from the rail at the top of the screen
    const topExt = this.extentUp(h.animal, h.angle);
    const cx = this.sx(h.x), cy = this.sy(y + topExt);
    ctx.strokeStyle = '#3d3355'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, this.railY + 20); ctx.lineTo(cx, cy - 8); ctx.stroke();
    // claw
    ctx.strokeStyle = '#5b4f78'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy + 4); ctx.lineTo(cx - 10, cy - 8); ctx.lineTo(cx + 10, cy - 8); ctx.lineTo(cx + 12, cy + 4);
    ctx.stroke();
    const expr = ((this.time * 1.0) % 3.7) < 0.14 ? 'blink' : (opts.worriedHeld ? 'worried' : 'idle');
    const bob = this.reduced ? 0 : Math.sin(this.time * 3) * 0.03;
    this.drawSprite(ctx, h.animal, h.ice, h.x, y + bob, h.angle, expr);
  }

  extentX(id, angle) {
    const s = animalShape(id);
    if (s.type === 'circle') return s.r;
    const c = Math.cos(angle), sn = Math.sin(angle);
    let m = 0;
    for (const v of s.verts) m = Math.max(m, Math.abs(c * v.x - sn * v.y));
    return m;
  }

  extentUp(id, angle) {
    const s = animalShape(id);
    if (s.type === 'circle') return s.r;
    const c = Math.cos(angle), sn = Math.sin(angle);
    let m = 0;
    for (const v of s.verts) m = Math.max(m, sn * v.x + c * v.y);
    return m;
  }

  drawCraneRail(ctx, game, opts) {
    if (!game.held && game.phase !== 'settling') return;
    const g = this.girder, dpr = this.dpr;
    const gw = g.width / dpr, gh = g.height / dpr;
    const ry = this.railY;
    for (let x = 0; x < this.W; x += gw) ctx.drawImage(g, x, ry, gw, gh);
    const hx = game.held ? this.sx(game.held.x) : null;
    if (hx != null) {
      ctx.fillStyle = game.mode === 'pass' ? PLAYER_COLORS[game.turn] : '#ff7a59';
      ctx.beginPath(); ctx.roundRect(hx - 18, ry + 4, 36, 20, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#3d3355';
      ctx.beginPath(); ctx.arc(hx - 9, ry + 24, 4, 0, Math.PI * 2); ctx.arc(hx + 9, ry + 24, 4, 0, Math.PI * 2); ctx.fill();
    }
    void opts;
  }

  drawRuler(ctx, game) {
    const s = this.scale;
    const x = this.W - 8;
    const from = Math.max(0, Math.ceil(this.camBottom)), to = Math.min(400, Math.floor(this.camBottom + this.viewH));
    ctx.font = '700 11px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const step = this.viewH > 15 ? 2 : 1;
    for (let m = from; m <= to; m++) {
      const y = this.sy(m);
      const major = m % 5 === 0;
      ctx.fillStyle = 'rgba(30, 30, 60, 0.35)';
      ctx.fillRect(x - (major ? 16 : 9), y - 1, major ? 16 : 9, 2);
      if (m % step === 0 && y > 76) {
        ctx.fillStyle = 'rgba(30, 30, 60, 0.55)';
        ctx.fillText(LABELS[m], x - (major ? 20 : 13), y);
      }
    }
    // the current height marker
    if (game.top > 0.05) {
      const y = this.sy(game.top);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y - 6); ctx.lineTo(x - 10, y + 6); ctx.closePath(); ctx.fill();
    }
  }

  drawHold(ctx, game) {
    if (!(game.holdTime > 0) || game.phase === 'won') return;
    const left = Math.max(1, Math.ceil(HOLD_SECONDS - game.holdTime));
    const frac = game.holdTime / HOLD_SECONDS;
    const cx = this.W / 2, cy = Math.max(120, Math.min(this.H * 0.25, 170));
    const r = 40;
    ctx.fillStyle = 'rgba(20, 16, 50, 0.45)';
    ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 40px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(left), cx, cy + 2);
    ctx.font = '900 20px ui-rounded, system-ui, sans-serif';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20, 16, 50, 0.5)';
    ctx.strokeText('Hold steady!', cx, cy + r + 28);
    ctx.fillText('Hold steady!', cx, cy + r + 28);
  }

  drawParticles(ctx) {
    const dpr = this.dpr, s = this.scale;
    for (const p of this.particles) {
      if (!p.on) continue;
      const a = Math.min(1, p.life / p.max * 2);
      const x = this.sx(p.x), y = this.sy(p.y);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 2) {
        const w = p.size * s, h = w * 0.55;
        const c = Math.cos(p.rot), sn = Math.sin(p.rot);
        ctx.setTransform(c * dpr, sn * dpr, -sn * dpr, c * dpr, x * dpr, y * dpr);
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else if (p.kind === 3) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.sign(p.vx) * p.size * s, y); ctx.stroke();
      } else {
        const r = p.size * s * (p.kind === 0 ? (1.6 - a * 0.6) : 1);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawBanners(ctx) {
    let y = Math.max(96, this.H * 0.18);
    for (const b of this.banners) {
      const t = b.t;
      const pop = this.reduced ? 1 : Math.min(1, t / 0.18) * (1 + Math.max(0, 0.15 - Math.abs(t - 0.18)) * 1.2);
      const fade = Math.min(1, (b.time - t) / 0.35);
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(this.W / 2, y);
      ctx.scale(pop, pop);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 34px ui-rounded, system-ui, sans-serif';
      ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(30, 20, 70, 0.55)';
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, 0, 0);
      if (b.sub) {
        ctx.font = '800 17px ui-rounded, system-ui, sans-serif';
        ctx.lineWidth = 5;
        ctx.strokeText(b.sub, 0, 30);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(b.sub, 0, 30);
      }
      ctx.restore();
      y += 70;
    }
  }
}

// A small card picture of an animal (collection, HUD preview, results).
export function paintAnimal(canvas, id, { locked = false, expr = 'idle', ice = false } = {}) {
  const a = ANIMAL_BY_ID[id];
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const shape = animalShape(id);
  const r = shape.radius + 0.25;
  const k = Math.min(w, h) / (2 * r) * dpr;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(k, k);
  if (locked) drawSilhouette(ctx, a);
  else {
    drawAnimal(ctx, a, expr);
    if (ice) {
      ctx.globalAlpha = 0.5;
      drawSilhouette(ctx, a, 'rgba(190, 236, 255, 0.7)');
      ctx.globalAlpha = 1;
    }
  }
}
