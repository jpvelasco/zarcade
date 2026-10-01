// Canvas renderer. Reads game state, never changes it. Sprites are baked
// once per level and scale; particles and pops come from fixed pools.
import { SLING, MAX_PULL, BEANS, BEARS, POWERS } from './config.js';
import { trajectory, pullToVelocity } from './game.js';
import {
  bakePiece, bakeGumball, bakeBear, bakeBean, bakeSling, bakeSky, bakeLayer, bakeGroundStrip,
  THEMES, GUMBALL_COLORS, BEAR_COLORS, SLING_GEOM, makeCanvas, star,
} from './sprites.js';

const MAX_PARTICLES = 360;
const MAX_POPS = 24;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const MAT_COLORS = {
  cookie: ['#f2c27a', '#c98a3e', '#5a2e12', '#e3a65a'],
  glass: ['#ff9ec8', '#ffd1e6', '#ffffff', '#ff6fae'],
  choc: ['#6b3a1f', '#8a5230', '#3b1a0a', '#a0643c'],
  rock: ['#b7c8ff', '#8fb8ff', '#ffffff', '#7a6ff0'],
  ice: ['#e8fbff', '#bfe9f7', '#ffffff', '#8fd3ee'],
  marsh: ['#ffffff', '#ffd6e8', '#ffeef6', '#f3b6cf'],
  fizz: ['#ff4d6d', '#ffe14d', '#ffffff', '#ff9a3c'],
  gumball: ['#ff4d6d', '#4dabff', '#ffd23f', '#7ee07a'],
  bear: ['#ff4d5e', '#ffd23f', '#45c96a', '#ff9a3c'],
  ground: ['#e3c08a', '#c9a06a', '#ffffff', '#b98a50'],
};
const CONFETTI = ['#ff4d6d', '#ffd23f', '#4dabff', '#7ee07a', '#c77dff', '#ff9a3c', '#ffffff'];
const RAINBOW = ['#ff5d8f', '#ffb347', '#ffe066', '#7ee07a', '#5dd3ff', '#c77dff'];

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.dpr = 1;
    this.W = 1; this.H = 1;
    this.s = 40;
    this.camX = -1; this.camY = -1.2;
    this.camTargetX = -1;
    this.shake = 0; this.shakeX = 0; this.shakeY = 0;
    this.time = 0;
    this.level = null;
    this.theme = THEMES[0];
    this.world = 0;
    this.skin = null;
    this.cache = new Map();
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({ on: false }));
    this.pops = Array.from({ length: MAX_POPS }, () => ({ on: false }));
    this.trail = []; this.lastTrail = [];
    this.trailTick = 0;
    this.band = 0; // band wobble after a launch
    this.intro = 0;
    this.aimEndX = null;
    this.ambient = [];
    this.flash = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(innerWidth * dpr));
    const h = Math.max(1, Math.round(innerHeight * dpr));
    this.dpr = dpr;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.W = w; this.H = h;
    if (this.level) this.fit(true);
  }

  // ------------------------------------------------------------ level setup

  setLevel(game, skin, { intro = true } = {}) {
    this.level = game.level;
    this.world = game.level.world;
    this.theme = THEMES[this.world];
    this.skin = skin;
    this.particles.forEach((p) => { p.on = false; });
    this.pops.forEach((p) => { p.on = false; });
    this.trail = []; this.lastTrail = [];
    this.shake = 0;
    this.flash = 0;
    this.fit(true);
    this.intro = intro && !this.reduced && this.needsPan ? 2.6 : 0;
    this.camX = this.intro ? this.maxCamX : this.homeCamX();
    this.makeAmbient();
  }

  setSkin(skin) {
    this.skin = skin;
    this.cache.delete('sling');
  }

  fit(rebake) {
    const lv = this.level;
    const left = -1.4;
    const right = lv.width + 0.6;
    const top = Math.max(lv.height + 3, 11);
    const bottom = -1.4;
    // Phones held upright keep sprites big enough and pan instead.
    const portrait = this.H > this.W * 1.15;
    const minS = (portrait ? 23 : 15) * this.dpr;
    const fitS = Math.min(this.W / (right - left), this.H / (top - bottom));
    const s = Math.max(minS, fitS);
    const changed = Math.abs(s - this.s) > 0.01;
    this.s = s;
    this.left = left;
    this.right = right;
    const viewW = this.W / s;
    this.viewW = viewW;
    this.needsPan = viewW < right - left - 0.5;
    this.minCamX = left;
    this.maxCamX = this.needsPan ? right - viewW : left - (viewW - (right - left)) / 2;
    const contentH = (top - bottom) * s;
    const extra = this.H - contentH;
    this.camY = extra > 0 ? bottom - (extra * (portrait ? 0.3 : 0.42)) / s : bottom;
    if (changed || rebake) this.bake();
  }

  homeCamX() {
    return this.needsPan ? this.minCamX : this.maxCamX;
  }

  bake() {
    this.cache.clear();
    const s = this.s;
    const unit = s;
    this.sky = bakeSky(this.theme, this.W, this.H, this.world);
    const T = Math.max(this.W, 900);
    this.layerT = T;
    this.far = bakeLayer(this.theme, this.world, 0, T, Math.round(14 * unit * 0.6), unit * 0.6);
    this.mid = bakeLayer(this.theme, this.world, 1, T, Math.round(6 * unit * 0.75), unit * 0.75);
    this.strip = bakeGroundStrip(this.theme, this.world, T, unit);
    this.sling = bakeSling(this.skin, s);
    // Static terrain sprites.
    this.terrain = this.level.terrain.map((t) => {
      const c = makeCanvas(t.w * s + 4, t.h * s + 4);
      const ctx = c.getContext('2d');
      ctx.translate(2, 2);
      ctx.fillStyle = this.theme.ground;
      ctx.fillRect(0, 0, t.w * s, t.h * s);
      ctx.fillStyle = this.theme.groundDark;
      ctx.globalAlpha = 0.25;
      for (let y = s * 1.2; y < t.h * s; y += s * 0.9) ctx.fillRect(0, y, t.w * s, s * 0.12);
      ctx.globalAlpha = 1;
      const strip = this.strip;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, t.w * s, t.h * s); ctx.clip();
      for (let x = 0; x < t.w * s; x += strip.width) ctx.drawImage(strip, x, 0);
      if (t.ice) {
        ctx.fillStyle = 'rgba(200,240,255,0.75)';
        ctx.fillRect(0, 0, t.w * s, s * 0.25);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(0, s * 0.03, t.w * s, s * 0.06);
      }
      ctx.restore();
      ctx.strokeStyle = this.theme.groundDark;
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.strokeRect(0, 0, t.w * s, t.h * s);
      return c;
    });
  }

  sprite(key, make) {
    let c = this.cache.get(key);
    if (!c) { c = make(); this.cache.set(key, c); }
    return c;
  }

  pieceSprite(b) {
    const d = b.data;
    const frac = d.hp / d.maxHp;
    const stage = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
    if (b.shape === 0) {
      const color = GUMBALL_COLORS[b.id % GUMBALL_COLORS.length];
      return this.sprite(`g|${b.r}|${color}|${stage}`, () => bakeGumball(b.r, color, stage, this.s));
    }
    const w = b.hw * 2, h = b.hh * 2;
    return this.sprite(`p|${d.mat}|${w.toFixed(2)}|${h.toFixed(2)}|${stage}`, () => bakePiece(d.mat, w, h, stage, this.s));
  }

  bearSprite(b, mood) {
    const color = BEAR_COLORS[b.id % BEAR_COLORS.length];
    return this.sprite(`b|${b.data.size}|${color}|${mood}`, () => bakeBear(b.data.size, color, mood, this.s));
  }

  beanSprite(type, r, face) {
    return this.sprite(`n|${type}|${r}|${face}`, () => bakeBean(type, r, face, this.s));
  }

  // Bake the current level's sprites up front so the first shot never stalls.
  prebake(game) {
    for (const b of game.bodies) {
      if (!b.data) continue;
      if (b.data.kind === 'piece') this.pieceSprite(b);
      else if (b.data.kind === 'bear') { this.bearSprite(b, 'idle'); this.bearSprite(b, 'blink'); }
    }
    for (const t of new Set(game.queue)) {
      this.beanSprite(t, BEANS[t].r, 'happy');
      this.beanSprite(t, BEANS[t].r, 'go');
    }
  }

  makeAmbient() {
    this.ambient = [];
    const n = this.reduced ? 6 : 18;
    for (let i = 0; i < n; i++) {
      this.ambient.push({ x: Math.random(), y: Math.random(), v: 0.3 + Math.random() * 0.7, r: 0.5 + Math.random(), p: Math.random() * 6 });
    }
  }

  // ------------------------------------------------------------ coordinates

  sx(x) { return (x - this.camX) * this.s + this.shakeX; }
  sy(y) { return this.H - (y - this.camY) * this.s + this.shakeY; }
  toWorld(px, py) {
    const x = (px * this.dpr - this.shakeX) / this.s + this.camX;
    const y = (this.H - py * this.dpr + this.shakeY) / this.s + this.camY;
    return { x, y };
  }
  // CSS pixels per world unit.
  get unitPx() { return this.s / this.dpr; }
  pouchScreen() { return { x: this.sx(SLING.x) / this.dpr, y: this.sy(SLING.y) / this.dpr }; }

  // ------------------------------------------------------------ effects

  spawn(kind, x, y, vx, vy, life, size, color) {
    for (const p of this.particles) {
      if (p.on) continue;
      p.on = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.max = life; p.size = size; p.color = color;
      p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 12;
      return p;
    }
    return null;
  }

  burst(x, y, n, colors, { speed = 6, up = 3, size = 0.16, life = 0.9, kind = 0 } = {}) {
    if (this.reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.spawn(kind, x, y, Math.cos(a) * v, Math.sin(a) * v + up, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), colors[i % colors.length]);
    }
  }

  pop(text, x, y, color = '#ffffff', size = 0.7, life = 1.1) {
    let slot = this.pops.find((p) => !p.on);
    if (!slot) slot = this.pops.reduce((a, b) => (a.life < b.life ? a : b));
    slot.on = true;
    slot.text = text; slot.x = x; slot.y = y; slot.color = color;
    slot.size = size; slot.life = life; slot.max = life;
    slot.font = `900 ${Math.round(size * this.s)}px ${FONT}`;
  }

  nudge(amount) {
    if (this.reduced) return;
    this.shake = Math.min(1.2, this.shake + amount);
  }

  handleEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'launch':
          this.band = 1;
          this.lastTrail = this.trail;
          this.trail = [];
          this.trailTick = 0;
          break;
        case 'hit':
          if (e.strength > 0.5) {
            const cols = MAT_COLORS[e.mat] || MAT_COLORS.ground;
            this.burst(e.x, e.y, Math.min(8, 2 + Math.round(e.strength * 1.5)), cols, { speed: 3 + e.speed * 0.15, size: 0.11 });
            if (e.strength > 3) this.nudge(Math.min(0.35, e.strength * 0.04));
          } else if (e.speed > 5 && e.mat === 'ground') {
            this.burst(e.x, e.y, 3, ['rgba(255,255,255,0.8)'], { speed: 2, size: 0.25, kind: 2, life: 0.5, up: 1 });
          }
          break;
        case 'break': {
          const cols = MAT_COLORS[e.mat];
          const area = e.round ? Math.PI * e.r * e.r : e.w * e.h;
          const n = Math.min(22, 6 + Math.round(area * 6));
          const kind = e.mat === 'glass' || e.mat === 'ice' || e.mat === 'rock' ? 1 : 0;
          this.burst(e.x, e.y, n, cols, { speed: 5, size: 0.17, kind });
          this.burst(e.x, e.y, 3, ['rgba(255,255,255,0.75)'], { speed: 1.5, size: 0.5, kind: 2, life: 0.6, up: 0.5 });
          this.pop(`+${e.points}`, e.x, e.y + 0.3, '#ffffff', 0.55, 0.9);
          this.nudge(Math.min(0.3, 0.06 + area * 0.06));
          break;
        }
        case 'pop': {
          this.burst(e.x, e.y, 16, CONFETTI, { speed: 7, size: 0.2, up: 4 });
          this.burst(e.x, e.y, 6, ['#ffffff'], { speed: 2.5, size: e.r * 0.9, kind: 2, life: 0.7, up: 0.5 });
          this.burst(e.x, e.y, 5, ['#ffe14d'], { speed: 4, size: 0.3, kind: 3, life: 1, up: 3 });
          this.pop(`+${e.points.toLocaleString('en-US')}`, e.x, e.y + 0.8, '#ffe14d', 0.8, 1.3);
          this.nudge(0.4);
          break;
        }
        case 'explode':
          this.burst(e.x, e.y, 26, ['#ffe14d', '#ff9a3c', '#ff4d6d', '#ffffff'], { speed: 11, size: 0.2, kind: 5, life: 0.6, up: 1 });
          this.burst(e.x, e.y, 6, ['rgba(255,240,200,0.8)'], { speed: 3, size: 1.1, kind: 2, life: 0.7, up: 1 });
          this.spawn(6, e.x, e.y, 0, 0, 0.35, e.radius, '#fff6c0');
          this.flash = Math.max(this.flash, this.reduced ? 0 : 0.35);
          this.nudge(0.8);
          break;
        case 'burst':
          this.burst(e.x, e.y, 22, ['#ffb31f', '#ffe08a', '#ff8a00'], { speed: 8, size: 0.2, life: 0.9, up: 2 });
          this.spawn(6, e.x, e.y, 0, 0, 0.35, POWERS.sticky.radius, '#ffe08a');
          this.nudge(0.7);
          break;
        case 'stick':
          this.burst(e.x, e.y, 8, ['#ffb31f', '#ffe08a'], { speed: 2.5, size: 0.14, up: 1 });
          this.pop('Splat!', e.x, e.y + 0.8, '#ffe08a', 0.55, 0.8);
          break;
        case 'combo':
          // Milestones only, lifted above the score pops so they stay readable.
          if (e.n === 3 || e.n === 5 || e.n === 8 || (e.n > 8 && e.n % 4 === 0)) {
            this.pop(`Combo ×${e.n}!`, e.x, e.y + 2.4, RAINBOW[e.n % RAINBOW.length], 0.62 + Math.min(0.45, e.n * 0.03), 1.3);
          }
          break;
        case 'power': {
          const b = BEANS[e.bean];
          this.burst(e.x, e.y, 10, [b.light, '#ffffff', b.color], { speed: 5, size: 0.14, kind: 3, life: 0.7, up: 0 });
          const word = { split: 'Split!', hop: 'Boing!', heavy: 'SLAM!', boost: 'Zoom!', sticky: 'Pop!' }[e.power];
          if (word) this.pop(word, e.x, e.y + 1, b.light, 0.6, 0.8);
          break;
        }
        case 'bounce':
          this.burst(e.x, e.y, 4, ['rgba(255,255,255,0.8)'], { speed: 2, size: 0.25, kind: 2, life: 0.4, up: 0.5 });
          break;
        case 'fell':
          if (e.y < 0.5) this.burst(e.x, -0.2, 10, [this.theme.liquidTop, this.theme.liquid, '#ffffff'], { speed: 5, size: 0.16, up: 6 });
          break;
        case 'poof':
          this.burst(e.x, e.y, 5, ['rgba(255,255,255,0.8)'], { speed: 1.5, size: 0.35, kind: 2, life: 0.5, up: 0.5 });
          break;
        case 'won':
          this.celebrate();
          break;
        default:
          break;
      }
    }
  }

  celebrate() {
    const n = this.reduced ? 20 : 70;
    for (let i = 0; i < n; i++) {
      const x = this.camX + Math.random() * this.viewW;
      const y = this.camY + this.H / this.s + 0.5;
      this.spawn(0, x, y, (Math.random() - 0.5) * 3, -Math.random() * 2, 3 + Math.random() * 2, 0.22, CONFETTI[i % CONFETTI.length]);
    }
  }

  // The spare beans pop one by one for the bonus.
  spareBeanPop(i, count) {
    const p = this.queueSlot(i, count);
    this.burst(p.x, p.y, 12, CONFETTI, { speed: 5, size: 0.18, up: 4 });
    this.pop('+10,000', p.x, p.y + 1, '#ffe14d', 0.6, 1.1);
  }

  queueSlot(i, count = 3) {
    const gap = Math.min(1.0, 3.2 / Math.max(1, count - 1));
    return { x: SLING.x - 1.25 - i * gap, y: 0.45 };
  }

  // ------------------------------------------------------------ per frame

  update(dt, game, { aiming = false } = {}) {
    this.time += dt;
    // Camera.
    let target = this.homeCamX();
    if (this.intro > 0) {
      this.intro -= dt;
      target = this.intro > 1.1 ? this.maxCamX : this.homeCamX();
    } else if (this.needsPan && game) {
      const flying = game.state === 'flying';
      let bx = null;
      for (const id of game.active) { const b = game.phys.byId(id); if (b) bx = bx === null ? b.x : Math.max(bx, b.x); }
      if (flying && bx !== null) target = bx - this.viewW * 0.42;
      else if (flying || game.state === 'won' || game.state === 'lost') target = this.camTargetX;
      else if (aiming && this.aimEndX !== null) target = Math.max(this.homeCamX(), this.aimEndX - this.viewW * 0.7);
    }
    target = Math.max(this.minCamX, Math.min(this.maxCamX, target));
    if (!this.needsPan) target = this.maxCamX;
    this.camTargetX = target;
    const k = 1 - Math.exp(-dt * (this.intro > 0 ? 2.2 : 4.5));
    this.camX += (target - this.camX) * k;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.8);
      const a = this.shake * this.s * 0.35;
      this.shakeX = (Math.random() - 0.5) * a;
      this.shakeY = (Math.random() - 0.5) * a;
    } else { this.shakeX = 0; this.shakeY = 0; }
    this.band = Math.max(0, this.band - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 2);

    for (const p of this.particles) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      if (p.kind === 2 || p.kind === 6) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; continue; }
      p.vy -= (p.kind === 5 ? 6 : 18) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y < 0.05 && p.vy < 0 && p.kind !== 5 && this.onGround(p.x)) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; }
    }
    for (const p of this.pops) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) p.on = false;
      else p.y += dt * 0.9;
    }
    // Flight trail.
    if (game && game.state === 'flying') {
      this.trailTick += dt;
      if (this.trailTick > 0.045) {
        this.trailTick = 0;
        const b = game.phys.byId(game.active[0]);
        if (b && b.data.hits === 0 && this.trail.length < 120) this.trail.push([b.x, b.y, this.trail.length]);
      }
    }
  }

  onGround(x) {
    for (const [a, b] of this.level.ground) if (x >= a && x <= b) return true;
    return false;
  }

  draw(game, ui = {}) {
    const ctx = this.ctx;
    const s = this.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.sky, 0, 0);
    const groundY = this.sy(0);
    // Parallax layers.
    const T = this.layerT;
    const farOff = -(((this.camX * s * 0.15) % T) + T) % T;
    const midOff = -(((this.camX * s * 0.4) % T) + T) % T;
    for (let x = farOff; x < this.W; x += T) ctx.drawImage(this.far, x, groundY - this.far.height + s * 0.3);
    for (let x = midOff; x < this.W; x += T) ctx.drawImage(this.mid, x, groundY - this.mid.height + s * 0.25);
    this.drawAmbientBack(ctx);
    this.drawGround(ctx, groundY);
    for (let i = 0; i < this.level.terrain.length; i++) {
      const t = this.level.terrain[i];
      const c = this.terrain[i];
      ctx.setTransform(1, 0, 0, 1, this.sx(t.x), this.sy(t.y));
      ctx.rotate(-(t.a || 0));
      ctx.drawImage(c, -c.width / 2, -c.height / 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!game) return;

    this.drawTrails(ctx);
    // Slingshot back half and band.
    const sl = this.sling;
    const px = this.sx(SLING.x), py = this.sy(SLING.y);
    ctx.drawImage(sl.back, px - sl.ox, py - sl.oy);
    const aiming = game.state === 'aim' && game.bean;
    let pouch = { x: SLING.x, y: SLING.y };
    if (aiming && ui.pull) pouch = { x: SLING.x + ui.pull.x, y: SLING.y + ui.pull.y };
    const wob = this.band * Math.sin(this.time * 60) * 0.25;
    const backTip = [SLING.x + SLING_GEOM.backTip[0], SLING.y + SLING_GEOM.backTip[1] - 0.12];
    const frontTip = [SLING.x + SLING_GEOM.frontTip[0], SLING.y + SLING_GEOM.frontTip[1] - 0.12];
    const bandW = Math.max(2, s * 0.13);
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.skin.band;
    ctx.lineWidth = bandW;
    ctx.beginPath();
    ctx.moveTo(this.sx(backTip[0]), this.sy(backTip[1]));
    ctx.lineTo(this.sx(pouch.x - 0.3), this.sy(pouch.y + wob));
    ctx.stroke();

    this.drawQueue(ctx, game);
    this.drawBodies(ctx, game);

    if (aiming) {
      const r = BEANS[game.bean].r;
      const spr = this.beanSprite(game.bean, r, ui.pull ? 'go' : 'happy');
      ctx.setTransform(1, 0, 0, 1, this.sx(pouch.x), this.sy(pouch.y));
      if (ui.pull) ctx.rotate(Math.atan2(ui.pull.y, -ui.pull.x) * 0.5);
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Pouch.
      ctx.fillStyle = '#5a2a1a';
      ctx.beginPath();
      ctx.ellipse(this.sx(pouch.x - r * 0.75), this.sy(pouch.y), s * 0.16, s * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = this.skin.band;
    ctx.lineWidth = bandW;
    ctx.beginPath();
    ctx.moveTo(this.sx(frontTip[0]), this.sy(frontTip[1]));
    ctx.lineTo(this.sx(pouch.x - 0.3), this.sy(pouch.y + wob));
    ctx.stroke();
    ctx.drawImage(sl.front, px - sl.ox, py - sl.oy);

    if (aiming && ui.pull) this.drawAim(ctx, game, ui.pull);
    else this.aimEndX = null;
    this.drawParticles(ctx);
    this.drawPops(ctx);
    this.drawOffscreen(ctx, game);
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.5;
      ctx.fillStyle = '#fff8e0';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
  }

  drawGround(ctx, groundY) {
    const s = this.s;
    const strip = this.strip;
    const th = this.theme;
    // Liquid in pits.
    for (const [a, b] of this.level.pits) {
      const x0 = this.sx(a), x1 = this.sx(b);
      const top = this.sy(-0.45);
      ctx.fillStyle = th.liquid;
      ctx.fillRect(x0, top, x1 - x0, this.H - top);
      ctx.fillStyle = th.liquidTop;
      const n = Math.max(4, Math.round((b - a) * 2));
      ctx.beginPath();
      ctx.moveTo(x0, top + s * 0.25);
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        ctx.lineTo(x, top + Math.sin(this.time * 2.4 + i * 1.3) * s * 0.07);
      }
      ctx.lineTo(x1, top + s * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < n; i++) {
        const t = (this.time * 0.6 + i * 0.37) % 1;
        ctx.beginPath();
        ctx.arc(x0 + ((i + 0.5) / n) * (x1 - x0) + Math.sin(i * 3.1) * s * 0.2, top + s * (1.6 - t * 1.6), s * 0.07 * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const [a, b] of this.level.ground) {
      const x0 = Math.max(-10, this.sx(a)), x1 = Math.min(this.W + 10, this.sx(b));
      if (x1 <= x0) continue;
      ctx.fillStyle = th.ground;
      ctx.fillRect(x0, groundY + s * 0.5, x1 - x0, this.H - groundY);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, groundY - s * 0.05, x1 - x0, strip.height + s * 0.1); ctx.clip();
      const off = (((this.sx(0) - x0) % strip.width) + strip.width) % strip.width;
      for (let x = x0 + off - strip.width; x < x1; x += strip.width) ctx.drawImage(strip, x, groundY);
      ctx.restore();
      ctx.fillStyle = th.groundDark;
      ctx.globalAlpha = 0.18;
      for (let y = groundY + s * 2.2; y < this.H; y += s * 1.4) ctx.fillRect(x0, y, x1 - x0, s * 0.12);
      ctx.globalAlpha = 1;
    }
  }

  drawAmbientBack(ctx) {
    const s = this.s;
    const t = this.time;
    if (this.world === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (const a of this.ambient) {
        const y = this.H - ((a.y * this.H + t * a.v * s * 1.2) % this.H);
        const x = a.x * this.W + Math.sin(t * a.v + a.p) * s * 0.4;
        ctx.beginPath(); ctx.arc(x, y, s * 0.09 * a.r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (this.world === 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const a of this.ambient) {
        const y = (a.y * this.H + t * a.v * s * 0.9) % this.H;
        const x = a.x * this.W + Math.sin(t * 0.8 * a.v + a.p) * s * 0.6;
        ctx.fillRect(x, y, s * 0.08 * a.r, s * 0.08 * a.r);
      }
    } else {
      ctx.fillStyle = 'rgba(255,240,210,0.6)';
      for (const a of this.ambient) {
        const x = (a.x * this.W + t * a.v * s * 0.5) % this.W;
        const y = a.y * this.H * 0.6 + Math.sin(t * a.v + a.p) * s * 0.3;
        ctx.beginPath(); ctx.arc(x, y, s * 0.05 * a.r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  drawTrails(ctx) {
    const s = this.s;
    const style = this.skin.trail;
    const draw = (list, alpha) => {
      ctx.globalAlpha = alpha;
      for (const [x, y, i] of list) {
        const r = s * (i % 3 === 0 ? 0.13 : 0.08);
        ctx.fillStyle = style === 'rainbow' ? RAINBOW[i % RAINBOW.length] : style === 'sparkle' ? (i % 2 ? '#ffe066' : '#ffffff') : style;
        if (style === 'sparkle' && i % 3 === 0) star(ctx, this.sx(x), this.sy(y), r * 1.6, r * 0.7);
        else { ctx.beginPath(); ctx.arc(this.sx(x), this.sy(y), r, 0, Math.PI * 2); ctx.fill(); }
      }
    };
    if (this.lastTrail.length) draw(this.lastTrail, 0.35);
    if (this.trail.length) draw(this.trail, 0.85);
    ctx.globalAlpha = 1;
  }

  drawQueue(ctx, game) {
    const t = this.time;
    const start = game.state === 'aim' ? 1 : 0;
    for (let i = start; i < game.queue.length; i++) {
      if (game.state === 'won' && i < (this.hideQueue || 0)) continue;
      const type = game.queue[i];
      const r = BEANS[type].r;
      const spr = this.beanSprite(type, r, 'happy');
      const slot = this.queueSlot(i - start, game.queue.length - start);
      const hop = Math.max(0, Math.sin(t * 3 + i * 1.7)) * 0.18;
      ctx.setTransform(1, 0, 0, 1, this.sx(slot.x), this.sy(slot.y + hop));
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawBodies(ctx, game) {
    const t = this.time;
    const s = this.s;
    const flying = [];
    for (const id of game.active) { const b = game.phys.byId(id); if (b) flying.push(b); }
    for (const b of game.bodies) {
      const d = b.data;
      if (!d || d.kind === 'ground') continue;
      const x = this.sx(b.x), y = this.sy(b.y);
      if (x < -s * 3 || x > this.W + s * 3 || y < -s * 3 || y > this.H + s * 3) continue;
      if (d.kind === 'piece') {
        const spr = this.pieceSprite(b);
        ctx.setTransform(1, 0, 0, 1, x, y);
        ctx.rotate(-b.a);
        ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
      } else if (d.kind === 'bear') {
        let mood = 'idle';
        if (d.hp < d.maxHp - 1e-6) mood = 'hurt';
        else if (flying.some((f) => Math.hypot(f.x - b.x, f.y - b.y) < 5)) mood = 'scared';
        else if ((t + b.id * 0.77) % 3.4 < 0.14) mood = 'blink';
        const spr = this.bearSprite(b, mood);
        const wob = this.reduced ? 0 : Math.sin(t * 3.2 + b.id) * 0.035;
        ctx.setTransform(1 + wob, 0, 0, 1 - wob, x, y);
        ctx.rotate(-b.a);
        ctx.drawImage(spr, -spr.width / 2, -spr.height / 2 - BEARS[d.size].r * s * 0.15);
      } else if (d.kind === 'bean') {
        const active = game.active.includes(b.id);
        const face = active ? 'go' : 'sleepy';
        const spr = this.beanSprite(d.bean, b.r, face);
        ctx.setTransform(1, 0, 0, 1, x, y);
        const speed = Math.hypot(b.vx, b.vy);
        if (active && speed > 4 && !this.reduced) {
          const va = -Math.atan2(b.vy, b.vx);
          const k = Math.min(0.22, speed / 140);
          ctx.rotate(va);
          ctx.scale(1 + k, 1 - k * 0.6);
          ctx.rotate(-va);
        }
        if (game.honey && game.honey.id === b.id) {
          const f = 1 - game.honey.fuse / POWERS.sticky.fuse;
          const pulse = 1 + f * 0.35 + Math.sin(t * (10 + f * 30)) * 0.06 * f;
          ctx.scale(pulse, pulse);
        }
        ctx.rotate(-b.a);
        if (d.heavy) ctx.scale(1.25, 1.25);
        ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
        if (d.boost && active) {
          ctx.setTransform(1, 0, 0, 1, x, y);
          ctx.rotate(-Math.atan2(b.vy, b.vx));
          ctx.fillStyle = 'rgba(180,255,240,0.7)';
          for (let i = 1; i < 4; i++) ctx.fillRect(-b.r * s * (1.2 + i * 0.5), (i - 2) * b.r * s * 0.35, b.r * s * 0.8, s * 0.05);
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawAim(ctx, game, pull) {
    const len = Math.hypot(pull.x, pull.y);
    const v = pullToVelocity(pull.x, pull.y, MAX_PULL);
    const pts = trajectory(v.vx, v.vy, { steps: 70, dt: 0.035, floor: -0.5 });
    const s = this.s;
    let n = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (this.hitsSomething(game, x, y)) break;
      n = i + 1;
    }
    this.aimEndX = n ? pts[n - 1][0] : null;
    const strength = Math.min(1, len / MAX_PULL);
    for (let i = 1; i < n; i += 1) {
      const [x, y] = pts[i];
      const k = 1 - i / (n + 6);
      const r = s * (0.06 + 0.07 * k);
      ctx.globalAlpha = 0.35 + 0.6 * k;
      ctx.fillStyle = 'rgba(60,20,40,0.55)';
      ctx.beginPath(); ctx.arc(this.sx(x), this.sy(y) + s * 0.03, r * 1.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = i % 4 === 0 ? '#ffe14d' : '#ffffff';
      ctx.beginPath(); ctx.arc(this.sx(x), this.sy(y), r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Power meter arc around the pouch.
    const cx = this.sx(SLING.x), cy = this.sy(SLING.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = s * 0.1;
    ctx.beginPath(); ctx.arc(cx, cy, s * 2.9, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
    ctx.strokeStyle = strength > 0.95 ? '#ff4d6d' : strength > 0.6 ? '#ffd23f' : '#7ee07a';
    ctx.beginPath(); ctx.arc(cx, cy, s * 2.9, Math.PI * 1.4 - Math.PI * 0.8 * strength, Math.PI * 1.4); ctx.stroke();
  }

  hitsSomething(game, x, y) {
    for (const b of game.bodies) {
      if (b.ghost || (b.data && b.data.kind === 'bean')) continue;
      if (x > b.minX - 0.25 && x < b.maxX + 0.25 && y > b.minY - 0.25 && y < b.maxY + 0.25) return true;
    }
    return false;
  }

  drawParticles(ctx) {
    const s = this.s;
    for (const p of this.particles) {
      if (!p.on) continue;
      const k = p.life / p.max;
      const x = this.sx(p.x), y = this.sy(p.y);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.min(1, k * 2);
      const r = p.size * s;
      switch (p.kind) {
        case 0:
          ctx.setTransform(1, 0, 0, 1, x, y);
          ctx.rotate(p.rot);
          ctx.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          break;
        case 1:
          ctx.setTransform(1, 0, 0, 1, x, y);
          ctx.rotate(p.rot);
          ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r, r); ctx.lineTo(-r, r * 0.6); ctx.closePath(); ctx.fill();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          break;
        case 2:
          ctx.globalAlpha = k * 0.8;
          ctx.beginPath(); ctx.arc(x, y, r * (1.6 - k * 0.6), 0, Math.PI * 2); ctx.fill();
          break;
        case 3:
          star(ctx, x, y, r, r * 0.45);
          break;
        case 5:
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, r * 0.6);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * s * 0.03, y + p.vy * s * 0.03); ctx.stroke();
          break;
        case 6:
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = k;
          ctx.lineWidth = s * 0.25 * k;
          ctx.beginPath(); ctx.arc(x, y, r * (1.1 - k * 0.8), 0, Math.PI * 2); ctx.stroke();
          break;
        default: break;
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPops(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const p of this.pops) {
      if (!p.on) continue;
      const k = p.life / p.max;
      const grow = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.font = p.font;
      const x = this.sx(p.x), y = this.sy(p.y);
      ctx.setTransform(grow, 0, 0, grow, x, y);
      ctx.lineWidth = this.s * p.size * 0.22;
      ctx.strokeStyle = 'rgba(60,15,40,0.85)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  // An arrow at the top edge when the bean flies above the screen.
  drawOffscreen(ctx, game) {
    for (const id of game.active) {
      const b = game.phys.byId(id);
      if (!b) continue;
      const y = this.sy(b.y);
      if (y > 0) continue;
      const x = this.sx(b.x);
      const s = this.s;
      ctx.fillStyle = BEANS[b.data.bean].color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(x, s * 0.4); ctx.lineTo(x - s * 0.4, s * 1.1); ctx.lineTo(x + s * 0.4, s * 1.1); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }
}

