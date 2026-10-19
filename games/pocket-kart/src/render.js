// Canvas renderer. It only reads the race.
//
// Frames stay cheap: the track is a handful of Path2D fills built once per
// track (corridor, road, kerbs, walls, markings) drawn under one camera
// transform, ground and road texture are repeating patterns, and every
// kart, item and decoration is a sprite baked once per pixel scale. Glows
// are pre-rendered and drawn additively; there is no shadowBlur.
import { SAMPLE_STEP } from './track.js';
import { speedZoom, viewFor } from './view.js';
import { topSpeed } from './kart.js';
import { ghostAt } from './ghost.js';
import { STAR } from './items.js';
import { TAU, clamp, hashFloat, lerp, wrapAngle } from './math.js';
import * as S from './sprites.js';

export const TIER_COLORS = ['#fff4d6', '#5ec8ff', '#ffa630', '#ff5fd2'];
const MAX_SKIDS = 900;
const KART_DRAW = 1.15; // karts are drawn a touch larger than their bumpers
const WALL_THICK = 9;

// ------------------------------------------------------------ particles

class Particles {
  constructor(cap) {
    this.cap = cap;
    this.n = 0;
    const f = () => new Float32Array(cap);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f(); this.life = f(); this.max = f();
    this.size = f(); this.grow = f(); this.drag = f(); this.rot = f(); this.spin = f();
    this.kind = new Uint8Array(cap); // sprite index
    this.add = new Uint8Array(cap); // additive?
  }
  spawn(x, y, vx, vy, life, size, kind, { grow = 0, drag = 2, add = 0, spin = 0 } = {}) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow;
    this.drag[i] = drag; this.kind[i] = kind; this.add[i] = add; this.rot[i] = spin ? Math.random() * TAU : 0; this.spin[i] = spin;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
        this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j]; this.grow[i] = this.grow[j];
        this.drag[i] = this.drag[j]; this.kind[i] = this.kind[j]; this.add[i] = this.add[j]; this.rot[i] = this.rot[j]; this.spin[i] = this.spin[j];
        i--;
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d; this.vy[i] *= d;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.size[i] += this.grow[i] * dt;
      this.rot[i] += this.spin[i] * dt;
    }
  }
  clear() { this.n = 0; }
}

// Sprite indices for particles.
const P = { puff: 0, dust: 1, spark0: 2, spark1: 3, spark2: 4, spark3: 5, flame: 6, pink: 7, gold: 8, cyan: 9, star: 10, white: 11, confetti0: 12 };
const CONFETTI = ['#ff5f8f', '#ffd84a', '#5fd0ff', '#7cf08f', '#b47cff', '#ff8a3d'];

// ------------------------------------------------------------ renderer

export class Renderer {
  constructor(canvas, { reducedMotion = false, onQuality = null } = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.reduced = reducedMotion;
    this.onQuality = onQuality;
    this.dprCap = 2;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.cam = { x: 0, y: 0, a: 0, zoom: 1, ready: false, shake: 0, intro: 0 };
    this.camera = 'follow';
    this.track = null;
    this.layers = null;
    this.particles = new Particles(reducedMotion ? 160 : 420);
    this.skids = new Float32Array(MAX_SKIDS * 4);
    this.skidAge = new Float32Array(MAX_SKIDS);
    this.skidHead = 0;
    this.skidCount = 0;
    this.k = 0; // sprite bake scale (pixels per world unit)
    this.sprites = null;
    this.kartSprites = new Map();
    this.decorSprites = new Map();
    this.tags = new Map();
    this.time = 0;
    this.frameMs = 16;
    this.slowFor = 0;
    this.prevWheel = new Map();
    this.focus = 0; // kart index the camera follows
    this.flash = 0;
    this.resize();
  }

  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.view = viewFor(w, h);
    this.layoutMinimap();
    this.ensureScale();
  }

  // Sprites are baked at the zoom the view uses, in quarter steps so small
  // changes don't rebake.
  ensureScale() {
    const k = Math.max(0.75, Math.round(this.view.zoom * this.dpr * 4) / 4);
    if (k === this.k && this.sprites) return;
    this.k = k;
    this.bakeCommon();
    this.kartSprites.clear();
    this.decorSprites.clear();
    if (this.track) this.bakeTrackSprites();
  }

  bakeCommon() {
    const k = this.k;
    const sp = {
      shadow: S.bakeShadow(k),
      box: S.bakeItemBox(k),
      star: S.bakeStar(k),
      jelly: S.bakeJelly(k),
      bubble: S.bakeBubble(k),
      pad: S.bakePad(k),
      lantern: S.bakeGlow('#ffd98a', 46, k * 0.5, 0.8),
      boostGlow: S.bakeGlow('#ffb347', 26, k * 0.6, 1),
      cometGlow: S.bakeGlow('#b8a4ff', 40, k * 0.5, 1),
      boxGlow: S.bakeGlow('#ffffff', 20, k * 0.6, 0.6),
    };
    sp.parts = [
      S.bakePuff(k), S.bakePuff(k),
      S.bakeDot(TIER_COLORS[0], k), S.bakeDot(TIER_COLORS[1], k), S.bakeDot(TIER_COLORS[2], k), S.bakeDot(TIER_COLORS[3], k),
      S.bakeDot('#ffb347', k, 5), S.bakeDot('#ff6fc8', k), S.bakeDot('#ffd84a', k), S.bakeDot('#7ff6ff', k),
      sp.star, S.bakeDot('#ffffff', k),
      ...CONFETTI.map((c) => S.bakeDot(c, k, 3)),
    ];
    this.sprites = sp;
  }

  // ------------------------------------------------------------ track

  setTrack(track) {
    this.track = track;
    this.pal = S.palette(track.theme, track.def.variant);
    this.layers = buildLayers(track, this.pal);
    this.skidCount = 0;
    this.particles.clear();
    this.cam.ready = false;
    this.bakeTrackSprites();
    this.bakeMinimap();
  }

  bakeTrackSprites() {
    const t = this.track;
    const k = Math.min(this.k, 3);
    const ground = S.bakeGroundTile(t.theme, this.pal, k, t.seed);
    const road = S.bakeRoadTile(t.theme, this.pal, k, t.seed + 1);
    this.groundPattern = this.g.createPattern(ground.canvas, 'repeat');
    this.groundPattern.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, 0, 0]));
    this.roadPattern = this.g.createPattern(road.canvas, 'repeat');
    this.roadPattern.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, 0, 0]));
    this.bumperSprites = t.bumpers.map((b) => S.bakeBumper(t.theme, b.r, this.k));
    this.decorSprites.clear();
  }

  decorSprite(kind) {
    let sp = this.decorSprites.get(kind);
    if (!sp) {
      sp = S.bakeDecor(this.track.theme, kind, this.k, this.track.seed);
      this.decorSprites.set(kind, sp);
    }
    return sp;
  }

  kartSprite(racer, kartId, ghost = false) {
    const key = `${racer.id}:${kartId}:${ghost}`;
    let sp = this.kartSprites.get(key);
    if (!sp) {
      sp = S.bakeKart(racer, kartId, this.k, { ghost });
      this.kartSprites.set(key, sp);
    }
    return sp;
  }

  tag(racer) {
    let t = this.tags.get(racer.id);
    if (!t || t.dpr !== this.dpr) {
      t = { ...S.bakeTag(racer, this.dpr), dpr: this.dpr };
      this.tags.set(racer.id, t);
    }
    return t;
  }

  layoutMinimap() {
    const size = Math.round(clamp(Math.min(this.w, this.h) * 0.22, 86, 150));
    this.mini = { size, x: this.w - size - 12, y: 64 };
    if (this.track) this.bakeMinimap();
  }

  bakeMinimap() {
    const t = this.track;
    if (!t || !this.mini) return;
    const size = this.mini.size;
    const d = this.dpr;
    const c = S.makeCanvas(size * d, size * d);
    const g = c.getContext('2d');
    const b = t.bounds;
    const pad = 10;
    const sc = Math.min((size - pad * 2) / b.w, (size - pad * 2) / b.h);
    this.mini.sc = sc;
    this.mini.ox = (size - b.w * sc) / 2 - b.minX * sc;
    this.mini.oy = (size - b.h * sc) / 2 - b.minY * sc;
    g.scale(d, d);
    S.rr(g, 0, 0, size, size, 16);
    g.fillStyle = 'rgba(20,12,44,0.42)';
    g.fill();
    g.translate(this.mini.ox, this.mini.oy);
    g.scale(sc, sc);
    const path = new Path2D();
    const m = t.main;
    for (let i = 0; i < m.n; i++) (i ? path.lineTo(m.x[i], m.y[i]) : path.moveTo(m.x[i], m.y[i]));
    path.closePath();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(20,12,44,0.85)';
    g.lineWidth = Math.max(7 / sc, m.hw[0] * 2.4);
    g.stroke(path);
    g.strokeStyle = '#ffffff';
    g.lineWidth = Math.max(3.5 / sc, m.hw[0] * 1.3);
    g.stroke(path);
    for (const scut of t.shortcuts) {
      const p = new Path2D();
      for (let i = 0; i < scut.line.n; i++) (i ? p.lineTo(scut.line.x[i], scut.line.y[i]) : p.moveTo(scut.line.x[i], scut.line.y[i]));
      g.setLineDash([8 / sc, 6 / sc]);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 2.2 / sc;
      g.stroke(p);
      g.setLineDash([]);
    }
    // Start line.
    g.strokeStyle = '#ffd84a';
    g.lineWidth = 3 / sc;
    g.beginPath();
    g.moveTo(m.x[0] + m.nx[0] * m.hw[0] * 2, m.y[0] + m.ny[0] * m.hw[0] * 2);
    g.lineTo(m.x[0] - m.nx[0] * m.hw[0] * 2, m.y[0] - m.ny[0] * m.hw[0] * 2);
    g.stroke();
    this.miniCanvas = c;
  }

  // ------------------------------------------------------------ events

  handleEvents(events, race) {
    const p = this.particles;
    const red = this.reduced;
    const focus = race.karts[this.focus];
    for (const e of events) {
      const k = e.kart !== undefined ? race.karts[e.kart] : null;
      switch (e.type) {
        case 'wall':
          for (let i = 0; i < (red ? 3 : 7); i++) p.spawn(e.x, e.y, rnd(120), rnd(120), 0.35, 2.5, P.spark0, { add: 1, drag: 5 });
          if (k === focus) this.cam.shake = Math.max(this.cam.shake, 4 * e.power);
          break;
        case 'bump':
          for (let i = 0; i < (red ? 3 : 6); i++) p.spawn(e.x, e.y, rnd(140), rnd(140), 0.5, 4, P.star, { drag: 4, spin: 6 });
          if (race.karts[e.a] === focus || race.karts[e.b] === focus) this.cam.shake = Math.max(this.cam.shake, 5 * e.power);
          break;
        case 'bumper':
          for (let i = 0; i < 6; i++) p.spawn(e.x, e.y, rnd(160), rnd(160), 0.45, 3, P.gold, { add: 1, drag: 4 });
          break;
        case 'box':
          for (let i = 0; i < (red ? 6 : 14); i++) p.spawn(e.x, e.y, rnd(170), rnd(170), 0.7, 2.6, P.confetti0 + (i % 6), { add: 0, drag: 3 });
          break;
        case 'miniturbo':
          for (let i = 0; i < 10; i++) p.spawn(k.x, k.y, rnd(90), rnd(90), 0.45, 4, P.spark0 + e.tier, { add: 1, drag: 3 });
          break;
        case 'pad':
          for (let i = 0; i < 8; i++) p.spawn(e.x, e.y, rnd(60), rnd(60), 0.5, 4, P.cyan, { add: 1, drag: 2 });
          break;
        case 'mushroom':
        case 'rocket':
        case 'tailwind-boost':
          for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; p.spawn(k.x, k.y, Math.cos(a) * 120, Math.sin(a) * 120, 0.45, 6, P.puff, { grow: 20, drag: 4 }); }
          break;
        case 'star-hit':
        case 'jelly-hit':
          for (let i = 0; i < (red ? 6 : 14); i++) p.spawn(e.x, e.y, rnd(200), rnd(200), 0.7, 4, e.type === 'star-hit' ? P.star : P.pink, { drag: 3, spin: e.type === 'star-hit' ? 8 : 0, add: e.type === 'star-hit' ? 0 : 1 });
          if (race.karts[e.kart] === focus) this.cam.shake = Math.max(this.cam.shake, 6);
          break;
        case 'shield-pop':
        case 'pop':
        case 'jelly-fizzle':
          for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; p.spawn(e.x, e.y, Math.cos(a) * 110, Math.sin(a) * 110, 0.4, 3, P.cyan, { add: 1, drag: 3 }); }
          break;
        case 'land':
          for (let i = 0; i < 4; i++) p.spawn(k.x + rnd(8), k.y + rnd(8), rnd(30), rnd(30), 0.4, 5, P.puff, { grow: 12, drag: 3 });
          break;
        case 'finish':
          if (k === focus) this.celebrate(k);
          break;
        default:
          break;
      }
    }
  }

  celebrate(k) {
    const n = this.reduced ? 30 : 90;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = 80 + Math.random() * 260;
      this.particles.spawn(k.x, k.y, Math.cos(a) * sp, Math.sin(a) * sp, 1.2 + Math.random() * 0.8, 3, P.confetti0 + (i % 6), { drag: 1.6 });
    }
  }

  // Continuous effects that depend on kart state, a few per frame.
  emit(race, dt) {
    const p = this.particles;
    const red = this.reduced ? 0.4 : 1;
    for (const k of race.karts) {
      const cos = Math.cos(k.h), sin = Math.sin(k.h);
      const rx = k.x - cos * 11, ry = k.y - sin * 11;
      const speed = Math.abs(k.v);
      // Drift sparks from both rear wheels, coloured by charge.
      if (k.drift && k.z <= 0.5) {
        const rate = (k.tier ? 26 + k.tier * 14 : 10) * red;
        if (Math.random() < rate * dt * 2) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const wx = rx - sin * 8 * side, wy = ry + cos * 8 * side;
          p.spawn(wx, wy, -cos * 60 + rnd(60), -sin * 60 + rnd(60), k.tier ? 0.32 : 0.4, k.tier ? 2.6 + k.tier * 0.5 : 4, k.tier ? P.spark0 + k.tier : P.dust, { add: k.tier ? 1 : 0, drag: 4, grow: k.tier ? 0 : 10 });
        }
        this.addSkid(k);
      } else {
        this.prevWheel.delete(k.index);
      }
      // Boost flames.
      if ((k.boostT > 0 || k.cometT > 0) && Math.random() < 40 * dt * red) {
        const kind = k.cometT > 0 ? P.confetti0 + Math.floor(Math.random() * 6) : k.boostKind === 'drift' ? P.spark2 : P.flame;
        p.spawn(rx + rnd(3), ry + rnd(3), -cos * 160 + rnd(40), -sin * 160 + rnd(40), 0.3, 4.5, kind, { add: 1, drag: 3, grow: -6 });
      }
      // Dust off the road.
      if (k.surface !== 'road' && speed > 60 && Math.random() < 18 * dt * red) {
        p.spawn(rx + rnd(6), ry + rnd(6), -cos * 30 + rnd(20), -sin * 30 + rnd(20), 0.6, 4, P.dust, { grow: 14, drag: 2 });
      }
      // Tail wind swooshes.
      if (k.mercy && Math.random() < 10 * dt * red) {
        p.spawn(k.x + rnd(20), k.y + rnd(20), cos * 80, sin * 80, 0.5, 2.5, P.white, { add: 1, drag: 1 });
      }
      if (k.wobbleT > 0 && Math.random() < 14 * dt) {
        p.spawn(k.x, k.y, rnd(40), rnd(40), 0.6, 3.5, P.star, { spin: 5, drag: 2 });
      }
    }
  }

  addSkid(k) {
    const cos = Math.cos(k.h), sin = Math.sin(k.h);
    const rx = k.x - cos * 9, ry = k.y - sin * 9;
    const prev = this.prevWheel.get(k.index);
    const now = [rx - sin * 7, ry + cos * 7, rx + sin * 7, ry - cos * 7];
    if (prev && Math.hypot(now[0] - prev[0], now[1] - prev[1]) > 3) {
      for (const side of [0, 2]) {
        const i = this.skidHead;
        this.skids[i * 4] = prev[side];
        this.skids[i * 4 + 1] = prev[side + 1];
        this.skids[i * 4 + 2] = now[side];
        this.skids[i * 4 + 3] = now[side + 1];
        this.skidAge[i] = this.time;
        this.skidHead = (this.skidHead + 1) % MAX_SKIDS;
        this.skidCount = Math.min(MAX_SKIDS, this.skidCount + 1);
      }
      this.prevWheel.set(k.index, now);
    } else if (!prev) this.prevWheel.set(k.index, now);
  }

  // ------------------------------------------------------------ camera

  updateCamera(race, dt, { attract = false } = {}) {
    const k = race.karts[this.focus] || race.karts[0];
    const cam = this.cam;
    const view = this.view;
    const top = topSpeed(k);
    const frac = clamp(Math.abs(k.v) / top, 0, 1.5);
    let zoom = speedZoom(view.zoom, frac, this.reduced);
    if (attract) zoom *= 0.82;
    // A quick swoop down to the grid before the countdown.
    if (cam.intro > 0) {
      cam.intro = Math.max(0, cam.intro - dt);
      const u = this.reduced ? 0 : cam.intro / 1.6;
      zoom *= 1 - 0.45 * u * u;
    }
    const travel = Math.abs(k.v) > 25 ? k.m + wrapAngle(k.h - k.m) * 0.3 + (k.v < 0 ? Math.PI : 0) : cam.a;
    if (!cam.ready) {
      cam.x = k.x; cam.y = k.y; cam.a = k.h; cam.zoom = zoom; cam.ready = true;
    }
    const rate = this.reduced ? 2.6 : 4.2;
    if (this.camera === 'follow') cam.a = wrapAngle(cam.a + wrapAngle(travel - cam.a) * (1 - Math.exp(-rate * dt)));
    cam.zoom = lerp(cam.zoom, zoom, 1 - Math.exp(-3 * dt));
    const lead = this.camera === 'follow' ? 0.08 : 0.32;
    const vx = Math.cos(k.m) * k.v, vy = Math.sin(k.m) * k.v;
    const tx = k.x + vx * lead, ty = k.y + vy * lead;
    const follow = 1 - Math.exp(-12 * dt);
    cam.x = lerp(cam.x, tx, follow);
    cam.y = lerp(cam.y, ty, follow);
    cam.shake = this.reduced ? 0 : Math.max(0, cam.shake - dt * 18);
  }

  // World-to-screen transform for the current camera.
  transform() {
    const cam = this.cam;
    const d = this.dpr;
    const phi = this.camera === 'follow' ? -Math.PI / 2 - cam.a : 0;
    const z = cam.zoom * d;
    const a = Math.cos(phi) * z, b = Math.sin(phi) * z, c = -Math.sin(phi) * z, dd = Math.cos(phi) * z;
    const ax = this.w / 2 + (cam.shake ? rnd(cam.shake) : 0);
    const ay = (this.camera === 'follow' ? this.view.anchorY : 0.5) * this.h + (cam.shake ? rnd(cam.shake) : 0);
    const e = ax * d - (a * cam.x + c * cam.y);
    const f = ay * d - (b * cam.x + dd * cam.y);
    this.m = [a, b, c, dd, e, f];
    this.phi = phi;
    return this.m;
  }

  toScreen(x, y) {
    const [a, b, c, d, e, f] = this.m;
    return [(a * x + c * y + e) / this.dpr, (b * x + d * y + f) / this.dpr];
  }

  // World-space box that covers the screen.
  visibleBox() {
    const [a, b, c, d, e, f] = this.m;
    const det = a * d - b * c;
    const inv = (sx, sy) => {
      const x = sx - e, y = sy - f;
      return [(d * x - c * y) / det, (-b * x + a * y) / det];
    };
    const W = this.w * this.dpr, H = this.h * this.dpr;
    const pts = [inv(0, 0), inv(W, 0), inv(0, H), inv(W, H)];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    return { minX: minX - 80, minY: minY - 80, maxX: maxX + 80, maxY: maxY + 80 };
  }

  // ------------------------------------------------------------ draw

  frame(dt, race, opts = {}) {
    this.time += dt;
    this.qualityTick(opts.frameMs ?? 16);
    if (!this.track || !race) return;
    this.updateCamera(race, dt, opts);
    this.particles.update(dt);
    if (!opts.paused) this.emit(race, dt);
    this.draw(race, opts);
  }

  qualityTick(ms) {
    this.frameMs = lerp(this.frameMs, Math.min(ms, 100), 0.05);
    if (this.frameMs > 26) this.slowFor += ms; else this.slowFor = 0;
    if (this.slowFor > 2500 && this.dprCap > 1) {
      const from = this.dprCap;
      this.dprCap = this.dprCap > 1.5 ? 1.5 : 1;
      this.slowFor = 0;
      this.resize();
      this.onQuality?.({ from, to: this.dprCap, 'frame.ms': Math.round(this.frameMs) });
    }
  }

  draw(race, opts) {
    const g = this.g;
    const L = this.layers;
    const pal = this.pal;
    const sp = this.sprites;
    const m = this.transform();
    const box = this.visibleBox();
    const t = this.time;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = pal.ground;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(...m);
    g.fillStyle = this.groundPattern;
    g.fillRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);

    // Corridor (verge), wall shadow, road, shortcuts.
    g.fillStyle = 'rgba(20,10,40,0.18)';
    g.save(); g.translate(5, 7); g.fill(L.wallsAll); g.restore();
    g.fillStyle = pal.verge;
    g.fill(L.corridor, 'evenodd');
    for (const s of L.shortcuts) g.fill(s.corridor);
    g.fillStyle = pal.short;
    for (const s of L.shortcuts) g.fill(s.road);
    g.fillStyle = pal.road;
    g.fill(L.road, 'evenodd');
    g.globalAlpha = 0.9;
    g.fillStyle = this.roadPattern;
    g.fill(L.road, 'evenodd');
    g.globalAlpha = 1;
    // Edge lines, markings, kerbs, start line.
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 2;
    g.stroke(L.edges);
    if (L.planks) { g.strokeStyle = 'rgba(40,20,10,0.35)'; g.lineWidth = 1.6; g.stroke(L.planks); }
    if (L.dashes) { g.fillStyle = pal.line; g.globalAlpha = 0.8; g.fill(L.dashes); g.globalAlpha = 1; }
    g.fillStyle = pal.kerb[0]; g.fill(L.kerbA);
    g.fillStyle = pal.kerb[1]; g.fill(L.kerbB);
    g.fillStyle = '#ffffff'; g.fill(L.startWhite);
    g.fillStyle = '#2a1d3a'; g.fill(L.startBlack);
    // Walls.
    L.walls.forEach((p, i) => { g.fillStyle = pal.wall[i % pal.wall.length]; g.fill(p); });
    g.strokeStyle = 'rgba(42,29,58,0.55)';
    g.lineWidth = 1.2;
    g.stroke(L.wallsAll);

    // Skid marks.
    if (this.skidCount) {
      g.strokeStyle = 'rgba(30,20,40,0.22)';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      for (let n = 0; n < this.skidCount; n++) {
        const i = n * 4;
        g.moveTo(this.skids[i], this.skids[i + 1]);
        g.lineTo(this.skids[i + 2], this.skids[i + 3]);
      }
      g.stroke();
      g.lineCap = 'butt';
    }

    // Boost pads.
    for (const p of this.track.pads) {
      if (!inBox(box, p.x, p.y)) continue;
      drawRot(g, sp.pad, p.x, p.y, p.angle, 1 + 0.04 * Math.sin(t * 8));
    }
    // Decorations.
    const decor = this.track.decorations;
    const glowing = S.GLOWING[this.track.theme];
    const glows = [];
    for (let i = 0; i < decor.length; i++) {
      const d = decor[i];
      if (!inBox(box, d.x, d.y)) continue;
      const spr = this.decorSprite(d.kind);
      const s = d.size;
      g.drawImage(spr.canvas, d.x - (spr.w * s) / 2, d.y - (spr.h * s) / 2, spr.w * s, spr.h * s);
      if (glowing?.has(d.kind)) glows.push(d);
    }
    // Bumpers.
    this.track.bumpers.forEach((b, i) => {
      if (!inBox(box, b.x, b.y)) return;
      const spr = this.bumperSprites[i];
      g.drawImage(spr.canvas, b.x - spr.w / 2, b.y - spr.h / 2, spr.w, spr.h);
    });
    // Item boxes.
    for (const b of race.boxes) {
      if (!inBox(box, b.x, b.y)) continue;
      const grow = b.respawn > 0 ? clamp(1 - b.respawn / 0.35, 0, 1) : 1;
      if (b.respawn > 0.35) continue;
      const bob = 1 + 0.06 * Math.sin(t * 5 + b.index);
      // Upright on screen (so the "?" reads) with a little wobble.
      drawRot(g, sp.box, b.x, b.y, 0.25 * Math.sin(t * 2 + b.index) - this.phi, grow * bob);
    }
    // Traps and jellies.
    for (const s of race.traps) if (inBox(box, s.x, s.y)) drawRot(g, sp.star, s.x, s.y, s.spin, (STAR.radius * 2.1) / sp.star.w * 1.2);
    for (const j of race.jellies) drawRot(g, sp.jelly, j.x, j.y, j.h, 0.95 + 0.08 * Math.sin(t * 14));

    // Particles below karts (dust and puffs).
    this.drawParticles(g, false);

    // The ghost.
    if (opts.ghost && opts.ghostTime >= 0) {
      const gp = ghostAt(opts.ghost, opts.ghostTime, this.ghostPose || (this.ghostPose = { x: 0, y: 0, h: 0 }));
      const spr = this.kartSprite(opts.ghostRacer, opts.ghostKart, true);
      g.globalAlpha = 0.5;
      drawRot(g, spr, gp.x, gp.y, gp.h, KART_DRAW);
      g.globalAlpha = 1;
    }

    // Karts, lowest on screen last.
    const order = this.order || (this.order = []);
    order.length = 0;
    for (const k of race.karts) order.push(k);
    const [, b, , d, , f] = m;
    order.sort((p, q) => (b * p.x + d * p.y) - (b * q.x + d * q.y));
    const upX = this.camera === 'follow' ? Math.cos(this.cam.a) : 0;
    const upY = this.camera === 'follow' ? Math.sin(this.cam.a) : -1;
    for (const k of order) {
      if (!inBox(box, k.x, k.y)) continue;
      const shadow = sp.shadow;
      g.globalAlpha = clamp(1 - k.z / 60, 0.4, 1);
      drawRot(g, shadow, k.x + 2, k.y + 3, k.h, 1 + k.z / 80);
      g.globalAlpha = 1;
      const spr = this.kartSprite(k.racer, k.kart.id);
      const lift = k.z * 0.7;
      const x = k.x + upX * lift, y = k.y + upY * lift;
      const squash = k.bumpT > 0 ? Math.sin((k.bumpT / 0.25) * Math.PI) * 0.18 : 0;
      const hop = k.z > 0 ? 0.06 * Math.min(1, k.z / 10) : 0;
      g.save();
      g.translate(x, y);
      g.rotate(k.h + k.spin);
      g.scale((1 + squash + hop) * KART_DRAW, (1 - squash * 0.8 + hop) * KART_DRAW);
      if (k.starT > 0 && k.wobbleT <= 0 && Math.floor(t * 16) % 2) g.globalAlpha = 0.55;
      g.drawImage(spr.canvas, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      g.restore();
      g.globalAlpha = 1;
      if (k.shieldT > 0) {
        const fade = k.shieldT < 1.5 && Math.floor(t * 10) % 2 ? 0.45 : 0.95;
        g.globalAlpha = fade;
        drawRot(g, sp.bubble, x, y, t * 0.5, (1 + 0.04 * Math.sin(t * 6)) * KART_DRAW);
        g.globalAlpha = 1;
      }
    }

    // Additive layer: lantern glows, boosts, comets, sparks.
    g.globalCompositeOperation = 'lighter';
    for (const dcor of glows) {
      const s = 1 + 0.08 * Math.sin(t * 3 + dcor.v * 10);
      drawRot(g, sp.lantern, dcor.x, dcor.y, 0, s * (dcor.kind === 5 ? 1.6 : 1));
    }
    if (L.lanterns) {
      for (const [x, y, ph] of L.lanterns) {
        if (!inBox(box, x, y)) continue;
        drawRot(g, sp.lantern, x, y, 0, 0.55 + 0.05 * Math.sin(t * 3 + ph));
      }
    }
    for (const k of race.karts) {
      if (!inBox(box, k.x, k.y)) continue;
      if (k.cometT > 0) drawRot(g, sp.cometGlow, k.x, k.y, 0, 1 + 0.1 * Math.sin(t * 20));
      else if (k.boostT > 0) drawRot(g, sp.boostGlow, k.x - Math.cos(k.h) * 12, k.y - Math.sin(k.h) * 12, 0, 0.9);
    }
    for (const b of race.boxes) {
      if (b.respawn > 0 || !inBox(box, b.x, b.y)) continue;
      g.globalAlpha = 0.35 + 0.2 * Math.sin(t * 4 + b.index);
      drawRot(g, sp.boxGlow, b.x, b.y, 0, 1);
    }
    g.globalAlpha = 1;
    this.drawParticles(g, true);
    g.globalCompositeOperation = 'source-over';

    // Screen space: speed lines, name tags, minimap.
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const me = race.karts[this.focus];
    if (!this.reduced && me && (me.boostT > 0 || me.cometT > 0)) this.speedLines(g, me);
    if (opts.tags !== false) {
      for (const k of race.karts) {
        if (k.index === this.focus && !opts.showYou) continue;
        const [sx, sy] = this.toScreen(k.x, k.y);
        if (sx < -40 || sy < -40 || sx > this.w + 40 || sy > this.h + 40) continue;
        const tag = this.tag(k.racer);
        const yOff = 16 + 13 * this.cam.zoom;
        g.globalAlpha = 0.92;
        g.drawImage(tag.canvas, sx - tag.w / 2, sy - yOff - tag.h, tag.w, tag.h);
      }
      g.globalAlpha = 1;
    }
    if (opts.minimap !== false) this.drawMinimap(g, race, opts);
  }

  drawParticles(g, additive) {
    const p = this.particles;
    const parts = this.sprites.parts;
    for (let i = 0; i < p.n; i++) {
      if ((p.add[i] === 1) !== additive) continue;
      const spr = parts[p.kind[i]];
      const life = p.life[i] / p.max[i];
      const s = Math.max(0.2, p.size[i]) / 4;
      g.globalAlpha = Math.min(1, life * 1.6);
      if (p.spin[i]) drawRot(g, spr, p.x[i], p.y[i], p.rot[i], s * 0.5);
      else g.drawImage(spr.canvas, p.x[i] - (spr.w * s) / 2, p.y[i] - (spr.h * s) / 2, spr.w * s, spr.h * s);
    }
    g.globalAlpha = 1;
  }

  speedLines(g, k) {
    const n = 10;
    const cx = this.w / 2, cy = this.h * (this.camera === 'follow' ? this.view.anchorY : 0.5);
    g.strokeStyle = k.cometT > 0 ? 'rgba(220,200,255,0.35)' : 'rgba(255,255,255,0.28)';
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = hashFloat(i, Math.floor(this.time * 12), 5) * TAU;
      const r0 = Math.max(this.w, this.h) * (0.42 + 0.1 * hashFloat(i, 3, 1));
      const r1 = r0 + 60;
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    g.stroke();
  }

  drawMinimap(g, race) {
    const mm = this.mini;
    if (!this.miniCanvas || !mm) return;
    g.drawImage(this.miniCanvas, mm.x, mm.y, mm.size, mm.size);
    for (const k of race.karts) {
      if (k.index === this.focus) continue;
      this.miniDot(g, k, 3.2, k.racer.color);
    }
    const me = race.karts[this.focus];
    if (me) this.miniDot(g, me, 4.6, '#ffffff', me.racer.color);
  }

  miniDot(g, k, r, fill, ring) {
    const mm = this.mini;
    const x = mm.x + mm.ox + k.x * mm.sc, y = mm.y + mm.oy + k.y * mm.sc;
    g.beginPath();
    g.arc(x, y, r + 1.4, 0, TAU);
    g.fillStyle = ring || '#2a1d3a';
    g.fill();
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fillStyle = fill;
    g.fill();
  }
}

// ------------------------------------------------------------ track layers

// Every static part of a track as Path2D objects, built once.
function buildLayers(track, pal) {
  const m = track.main;
  const n = m.n;
  const v = track.verge;
  const off = (i, lat) => [m.x[i] + m.nx[i] * lat, m.y[i] + m.ny[i] * lat];
  const ring = (fn) => {
    const p = new Path2D();
    for (let i = 0; i < n; i++) { const [x, y] = off(i, fn(i)); i ? p.lineTo(x, y) : p.moveTo(x, y); }
    p.closePath();
    return p;
  };
  const twoRings = (fn) => {
    const p = new Path2D();
    p.addPath(ring((i) => fn(i)));
    p.addPath(ring((i) => -fn(i)));
    return p;
  };
  const L = {};
  L.corridor = twoRings((i) => m.hw[i] + v);
  L.road = twoRings((i) => m.hw[i]);
  L.edges = new Path2D();
  L.edges.addPath(ring((i) => m.hw[i] - 2));
  L.edges.addPath(ring((i) => -(m.hw[i] - 2)));

  // Shortcut strips.
  L.shortcuts = track.shortcuts.map((sc) => {
    const line = sc.line;
    const strip = (half) => {
      const p = new Path2D();
      for (let i = 0; i < line.n; i++) { const x = line.x[i] + line.nx[i] * half, y = line.y[i] + line.ny[i] * half; i ? p.lineTo(x, y) : p.moveTo(x, y); }
      for (let i = line.n - 1; i >= 0; i--) p.lineTo(line.x[i] - line.nx[i] * half, line.y[i] - line.ny[i] * half);
      p.closePath();
      // Round ends so the strip blends into the road.
      p.arc(line.x[0], line.y[0], half, 0, TAU);
      p.moveTo(line.x[line.n - 1] + half, line.y[line.n - 1]);
      p.arc(line.x[line.n - 1], line.y[line.n - 1], half, 0, TAU);
      return p;
    };
    return { corridor: strip(sc.halfW + v), road: strip(sc.halfW) };
  });

  // Kerbs on bends, alternating colours, on both edges.
  L.kerbA = new Path2D();
  L.kerbB = new Path2D();
  let parity = 0;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const bend = Math.abs(m.k[i]) > 1 / 520 || Math.abs(m.k[j]) > 1 / 520;
    if (!bend) continue;
    parity ^= 1;
    for (const side of [1, -1]) {
      const a0 = off(i, side * m.hw[i]), a1 = off(j, side * m.hw[j]);
      const b0 = off(i, side * (m.hw[i] - 7)), b1 = off(j, side * (m.hw[j] - 7));
      const p = parity ? L.kerbA : L.kerbB;
      p.moveTo(a0[0], a0[1]); p.lineTo(a1[0], a1[1]); p.lineTo(b1[0], b1[1]); p.lineTo(b0[0], b0[1]); p.closePath();
    }
  }

  // Centre dashes (toys and sweets) or planks across the boardwalk (docks).
  if (track.theme === 'docks') {
    L.planks = new Path2D();
    for (let i = 0; i < n; i += 2) {
      const a = off(i, m.hw[i]), b = off(i, -m.hw[i]);
      L.planks.moveTo(a[0], a[1]); L.planks.lineTo(b[0], b[1]);
    }
    // Lanterns along the rail.
    L.lanterns = [];
    for (let i = 0; i < n; i += 12) {
      for (const side of [1, -1]) {
        const [x, y] = off(i, side * (m.hw[i] + v + WALL_THICK * 0.5));
        if (insideShortcut(track, x, y, 0)) continue;
        L.lanterns.push([x, y, hashFloat(i, side, 2) * 6]);
      }
    }
  } else {
    L.dashes = new Path2D();
    for (let i = 0; i < n - 3; i += 5) {
      const a = off(i, 1.6), b = off(i + 2, 1.6), c = off(i + 2, -1.6), d = off(i, -1.6);
      L.dashes.moveTo(a[0], a[1]); L.dashes.lineTo(b[0], b[1]); L.dashes.lineTo(c[0], c[1]); L.dashes.lineTo(d[0], d[1]); L.dashes.closePath();
    }
  }

  // Chequered start line, two rows.
  L.startWhite = new Path2D();
  L.startBlack = new Path2D();
  const hw0 = m.hw[0];
  const cells = Math.max(6, Math.round((hw0 * 2) / 9));
  const cw = (hw0 * 2) / cells;
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < cells; c++) {
      const lat0 = -hw0 + c * cw, lat1 = lat0 + cw;
      const s0 = row * 7 - 7, s1 = s0 + 7;
      const p = (c + row) % 2 ? L.startBlack : L.startWhite;
      const q = (lat, s) => [m.x[0] + m.nx[0] * lat + m.tx[0] * s, m.y[0] + m.ny[0] * lat + m.ty[0] * s];
      const [x0, y0] = q(lat0, s0), [x1, y1] = q(lat1, s0), [x2, y2] = q(lat1, s1), [x3, y3] = q(lat0, s1);
      p.moveTo(x0, y0); p.lineTo(x1, y1); p.lineTo(x2, y2); p.lineTo(x3, y3); p.closePath();
    }
  }

  // Walls: chunky blocks along the corridor edge, with gaps where a
  // shortcut joins. One path per colour, plus one for outlines/shadow.
  const colours = pal.wall.length;
  L.walls = Array.from({ length: colours }, () => new Path2D());
  L.wallsAll = new Path2D();
  const seg = track.theme === 'docks' ? 6 : 3;
  let w = 0;
  const addWall = (getIn, getOut, count, closed, skip) => {
    for (let i = 0; i < count - (closed ? 0 : 1); i += seg) {
      const j = closed ? (i + seg) % count : Math.min(count - 1, i + seg);
      if (skip(i) || skip(j)) continue;
      const a0 = getIn(i), a1 = getIn(j), b1 = getOut(j), b0 = getOut(i);
      const p = L.walls[w++ % colours];
      for (const path of [p, L.wallsAll]) {
        path.moveTo(a0[0], a0[1]); path.lineTo(a1[0], a1[1]); path.lineTo(b1[0], b1[1]); path.lineTo(b0[0], b0[1]); path.closePath();
      }
    }
  };
  for (const side of [1, -1]) {
    addWall(
      (i) => off(i, side * (m.hw[i] + v)),
      (i) => off(i, side * (m.hw[i] + v + WALL_THICK)),
      n, true,
      (i) => { const [x, y] = off(i, side * (m.hw[i] + v + 2)); return insideShortcut(track, x, y, 2); },
    );
  }
  for (const sc of track.shortcuts) {
    const line = sc.line;
    for (const side of [1, -1]) {
      const at = (i, lat) => [line.x[i] + line.nx[i] * lat, line.y[i] + line.ny[i] * lat];
      addWall(
        (i) => at(i, side * (sc.halfW + v)),
        (i) => at(i, side * (sc.halfW + v + WALL_THICK)),
        line.n, false,
        (i) => { const [x, y] = at(i, side * (sc.halfW + v + 2)); return insideMain(track, x, y, 2); },
      );
    }
  }
  return L;
}

function insideShortcut(track, x, y, pad) {
  for (const sc of track.shortcuts) {
    if (x < sc.box.minX || x > sc.box.maxX || y < sc.box.minY || y > sc.box.maxY) continue;
    const line = sc.line;
    for (let i = 0; i < line.n; i++) {
      const dx = x - line.x[i], dy = y - line.y[i];
      if (dx * dx + dy * dy < (sc.halfW + track.verge - pad) ** 2) return true;
    }
  }
  return false;
}

function insideMain(track, x, y, pad) {
  const m = track.main;
  let inside = false;
  track.grid.near(x, y, track.maxCorridor + 10, (i) => {
    if (inside) return;
    const dx = x - m.x[i], dy = y - m.y[i];
    if (dx * dx + dy * dy < (m.hw[i] + track.verge - pad) ** 2) inside = true;
  });
  return inside;
}

function drawRot(g, spr, x, y, a, s) {
  const c = Math.cos(a) * s, sn = Math.sin(a) * s;
  g.save();
  g.transform(c, sn, -sn, c, x, y);
  g.drawImage(spr.canvas, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
  g.restore();
}

function inBox(b, x, y) {
  return x > b.minX && x < b.maxX && y > b.minY && y < b.maxY;
}

const rnd = (r) => (Math.random() * 2 - 1) * r;

