// Canvas renderer. Reads session state, never changes it.
// Terrain is baked into 8 x 8 tile chunks that rebuild only when a tile in
// (or next to) them changes; light is a half-resolution darkness map.
import { T, D, LAYERS, ORES, PAINTS } from './data.js';
import { tileHash } from './rng.js';
import {
  canvas, bakeSheet, podSprite, lightSprite, glowSprite, skylightSprite, buildingSprites,
  cloudSprite, hillsSprite, skySprite, sunSprite, wormSprite,
} from './sprites.js';

const CH = 8; // chunk size in tiles
const MAX_CHUNKS = 36;
const MAX_PARTICLES = 260;
const AMBIENT = [0.3, 0.6, 0.74, 0.8, 0.82, 0.7, 0.82]; // darkness by layer

const isOre = (c) => c >= T.ORE0 && c < T.ORE0 + ORES.length;
const isRelic = (c) => c >= T.RELIC0 && c < T.RELIC0 + 24;
const isSoilLike = (c) => c === T.SOIL || c === T.GAS || c === T.FUEL || c === T.ACORN || isOre(c) || isRelic(c);

const CHIP_COLORS = LAYERS.map((L) => [L.colors.base, L.colors.light, L.colors.dark, L.colors.speck]);
const DARK_STYLES = Array.from({ length: 101 }, (_, i) => `rgba(8,5,16,${(i / 100).toFixed(2)})`);

export class Renderer {
  constructor(cv, { reducedMotion = false } = {}) {
    this.canvas = cv;
    this.ctx = cv.getContext('2d');
    this.reduced = reducedMotion;
    this.chunks = new Map();
    this.pool = [];
    this.session = null;
    this.cam = { x: 10, y: 0 };
    this.shake = 0;
    this.time = 0;
    this.parts = Array.from({ length: MAX_PARTICLES }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, kind: 0, size: 1, color: '#fff', g: 0 }));
    this.texts = [];
    this.emissive = [];
    this.flash = 0;
    this.podSprites = {};
    this.chipT = 0;
    this.lampTier = -1;
    this.camTarget = null;
    this.resize();
  }

  // ------------------------------------------------------------ setup

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H; this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    const TS = Math.round(Math.max(34, Math.min(64, Math.min(W / 11, H / 11))));
    const P = Math.min(80, Math.round(TS * dpr));
    this.TS = TS;
    if (P !== this.P) {
      this.P = P;
      this.sheet = bakeSheet(P);
      this.buildings = buildingSprites(P);
      this.clouds = [0, 1, 2].map((k) => cloudSprite(P, k));
      this.sun = sunSprite(P);
      this.worm = wormSprite(P);
      this.podSprites = {};
      this.crack = this.bakeCracks(P);
      this.dropChunks();
    }
    this.light = canvas(Math.ceil(W / 2), Math.ceil(H / 2));
    this.lg = this.light.getContext('2d');
    this.lightTex = lightSprite(256);
    this.skylight = skylightSprite();
    this.glows = {
      lava: glowSprite(128, '#ff7a2e'), shroom: glowSprite(128, '#44f0d0'), crystal: glowSprite(128, '#c7a8ff'),
      torch: glowSprite(128, '#ffb04a'), core: glowSprite(128, '#ff8ae6'), gem: glowSprite(128, '#ffffff'),
    };
    this.puff = glowSprite(64, '#ffffff');
    this.puffGas = glowSprite(64, '#b8ff8a');
    this.puffDust = glowSprite(64, '#c8a07a');
    this.sky = skySprite(256);
    this.hillFar = hillsSprite(Math.max(800, W * 1.2), Math.max(120, TS * 4), '#8fd18a', 'far', 3);
    this.hillNear = hillsSprite(Math.max(900, W * 1.3), Math.max(110, TS * 3.2), '#5fbf6a', 'near', 4);
  }

  bakeCracks(P) {
    return [0.33, 0.66, 1].map((k, i) => {
      const c = canvas(P, P), g = c.getContext('2d');
      g.strokeStyle = 'rgba(20,10,10,0.75)';
      g.lineWidth = Math.max(1.5, P * 0.05);
      g.lineCap = 'round';
      const n = 2 + i * 2;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + i;
        g.beginPath();
        g.moveTo(P / 2, P / 2);
        g.lineTo(P / 2 + Math.cos(a) * P * 0.25 * k + 3, P / 2 + Math.sin(a) * P * 0.2 * k);
        g.lineTo(P / 2 + Math.cos(a + 0.3) * P * 0.48 * k, P / 2 + Math.sin(a + 0.3) * P * 0.45 * k);
        g.stroke();
      }
      return c;
    });
  }

  dropChunks() {
    for (const ch of this.chunks.values()) this.pool.push(ch.canvas);
    this.chunks.clear();
  }

  setSession(session) {
    this.session = session;
    this.dropChunks();
    this.lampTier = session.stats.lamp;
    const p = session.pod;
    this.cam.x = this.camTarget ? this.camTarget.x : p.x;
    this.cam.y = this.camTarget ? this.camTarget.y : p.y;
    for (const pt of this.parts) pt.on = false;
    this.texts.length = 0;
    this.shake = 0;
    this.clampCam();
  }

  podSprite(paintId) {
    if (!this.podSprites[paintId]) this.podSprites[paintId] = podSprite(this.P, PAINTS.find((p) => p.id === paintId) || PAINTS[0]);
    return this.podSprites[paintId];
  }

  // ------------------------------------------------------------ chunks

  markDirty(i) {
    const mine = this.session.mine;
    const x = i % mine.w, y = Math.floor(i / mine.w);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = Math.floor((x + dx) / CH), cy = Math.floor((y + dy) / CH);
        const ch = this.chunks.get(cy * 64 + cx);
        if (ch) ch.dirty = true;
      }
    }
  }

  chunk(cx, cy, budget) {
    const key = cy * 64 + cx;
    let ch = this.chunks.get(key);
    if (ch) {
      this.chunks.delete(key);
      this.chunks.set(key, ch);
      if (ch.dirty && budget.n > 0) { budget.n--; this.bakeChunk(ch, cx, cy); }
      return ch;
    }
    if (budget.n <= 0) return null;
    budget.n--;
    const size = CH * this.P;
    let cv = this.pool.pop();
    if (!cv || cv.width !== size) cv = canvas(size, size);
    ch = { canvas: cv, dirty: true };
    this.chunks.set(key, ch);
    if (this.chunks.size > MAX_CHUNKS) {
      const oldest = this.chunks.keys().next().value;
      this.pool.push(this.chunks.get(oldest).canvas);
      this.chunks.delete(oldest);
    }
    this.bakeChunk(ch, cx, cy);
    return ch;
  }

  bakeChunk(ch, cx, cy) {
    ch.dirty = false;
    const g = ch.canvas.getContext('2d');
    const P = this.P, S = this.sheet;
    const mine = this.session.mine;
    const world = this.session.world;
    const gasTell = this.session.stats.lamp >= 4;
    g.clearRect(0, 0, ch.canvas.width, ch.canvas.height);
    const r = P * 0.3;
    for (let j = 0; j < CH; j++) {
      const ty = cy * CH + j;
      if (ty < 0 || ty >= mine.h) continue;
      const li = world.layerOf[ty];
      const L = S.layers[li];
      for (let i = 0; i < CH; i++) {
        const tx = cx * CH + i;
        if (tx >= mine.w) continue;
        const code = mine.tile(tx, ty);
        const px = i * P, py = j * P;
        const h = tileHash(tx, ty);
        if (code === T.BEDROCK) { g.drawImage(S.bedrock, px, py); continue; }
        if (code === T.PAD) { g.drawImage(S.pad, px, py); continue; }
        if (code === T.LAVA) {
          g.drawImage(S.lava[Math.floor(h * 3)], px, py);
          if (mine.tile(tx, ty - 1) === T.EMPTY) { g.fillStyle = '#ffe27a'; g.fillRect(px, py, P, Math.max(2, P * 0.08)); }
          continue;
        }
        const soil = isSoilLike(code) || code === T.COOLED || code === T.BRICK
          || (code === T.BOULDER && mine.tile(tx, ty - 1) !== T.EMPTY && mine.tile(tx - 1, ty) !== T.EMPTY && mine.tile(tx + 1, ty) !== T.EMPTY);
        // Background wall (not on the surface row, where the sky shows).
        if (!soil || ty > 0) g.drawImage(L.bg[h < 0.5 ? 0 : 1], px, py);
        if (code === T.EMPTY) {
          this.shadeOpening(g, mine, tx, ty, px, py, P);
          const dk = world.deco[ty * mine.w + tx];
          if (dk && L.deco[dk]) g.drawImage(L.deco[dk], px, py);
          continue;
        }
        if (code === T.BOULDER) {
          if (soil) g.drawImage(L.solid[Math.floor(h * 4)], px, py);
          g.drawImage(S.boulder, px, py);
          continue;
        }
        if (code === T.CORE) { g.drawImage(S.core, px, py); continue; }
        if (code === T.BOUNCE) { g.drawImage(L.bounce || L.solid[0], px, py); continue; }
        // Solid material with rounded corners where it meets open space.
        const up = ty === 0 || mine.tile(tx, ty - 1) === T.EMPTY;
        const dn = mine.tile(tx, ty + 1) === T.EMPTY;
        const lf = mine.tile(tx - 1, ty) === T.EMPTY;
        const rt = mine.tile(tx + 1, ty) === T.EMPTY;
        const sprite = code === T.COOLED ? S.cooled : code === T.BRICK ? S.brick : L.solid[Math.floor(h * 4)];
        const rounded = (up && (lf || rt)) || (dn && (lf || rt));
        if (rounded && g.roundRect) {
          g.save();
          g.beginPath();
          g.roundRect(px, py, P, P, [up && lf ? r : 0, up && rt ? r : 0, dn && rt ? r : 0, dn && lf ? r : 0]);
          g.clip();
          g.drawImage(sprite, px, py);
          this.edges(g, L, up, dn, lf, rt, px, py, P, ty === 0);
          g.restore();
        } else {
          g.drawImage(sprite, px, py);
          this.edges(g, L, up, dn, lf, rt, px, py, P, ty === 0);
        }
        if (ty === 0 && soil) this.grass(g, tx, px, py, P, lf, rt);
        if (isOre(code)) g.drawImage(S.ores[code - T.ORE0], px, py);
        else if (isRelic(code)) g.drawImage(S.relics[Math.floor((code - T.RELIC0) / 4)], px, py);
        else if (code === T.FUEL) g.drawImage(S.fuel, px, py);
        else if (code === T.ACORN) g.drawImage(S.acorn, px, py);
        else if (code === T.GAS && gasTell) { g.globalAlpha = 0.8; g.drawImage(S.gas, px, py); g.globalAlpha = 1; }
      }
    }
  }

  edges(g, L, up, dn, lf, rt, px, py, P, surface) {
    if (up && !surface) { g.fillStyle = L.edgeLight; g.globalAlpha = 0.55; g.fillRect(px, py, P, Math.max(2, P * 0.08)); }
    if (dn) { g.fillStyle = L.edgeDark; g.globalAlpha = 0.7; g.fillRect(px, py + P * 0.88, P, P * 0.12); }
    if (lf) { g.fillStyle = L.edgeDark; g.globalAlpha = 0.45; g.fillRect(px, py, P * 0.07, P); }
    if (rt) { g.fillStyle = L.edgeDark; g.globalAlpha = 0.45; g.fillRect(px + P * 0.93, py, P * 0.07, P); }
    g.globalAlpha = 1;
  }

  // Soft shadow inside an open tile under its solid neighbours.
  shadeOpening(g, mine, tx, ty, px, py, P) {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    if (ty > 0 && mine.tile(tx, ty - 1) !== T.EMPTY) { g.fillRect(px, py, P, P * 0.16); g.fillRect(px, py, P, P * 0.07); }
    if (mine.tile(tx - 1, ty) !== T.EMPTY) g.fillRect(px, py, P * 0.08, P);
    if (mine.tile(tx + 1, ty) !== T.EMPTY) g.fillRect(px + P * 0.92, py, P * 0.08, P);
  }

  grass(g, tx, px, py, P, lf, rt) {
    g.fillStyle = '#4caf50';
    g.fillRect(px + (lf ? P * 0.08 : 0), py, P - (lf ? P * 0.08 : 0) - (rt ? P * 0.08 : 0), P * 0.18);
    g.fillStyle = '#7bd36b';
    g.fillRect(px + (lf ? P * 0.08 : 0), py, P - (lf ? P * 0.08 : 0) - (rt ? P * 0.08 : 0), P * 0.07);
    g.fillStyle = '#3d9a44';
    for (let k = 0; k < 4; k++) {
      const x = px + P * (0.12 + k * 0.24 + tileHash(tx, k, 3) * 0.08);
      g.beginPath(); g.moveTo(x - P * 0.04, py + P * 0.16); g.lineTo(x, py - P * 0.1); g.lineTo(x + P * 0.04, py + P * 0.16); g.fill();
    }
    const f = tileHash(tx, 0, 9);
    if (f < 0.35) {
      const x = px + P * (0.2 + f * 1.6);
      g.fillStyle = '#3d9a44';
      g.fillRect(x - 1, py - P * 0.18, Math.max(1.5, P * 0.03), P * 0.2);
      g.fillStyle = ['#ffd84a', '#ff8fb0', '#ffffff', '#b07cff'][Math.floor(f * 11) % 4];
      for (let a = 0; a < 5; a++) {
        const ang = (a / 5) * Math.PI * 2;
        g.beginPath(); g.arc(x + Math.cos(ang) * P * 0.05, py - P * 0.2 + Math.sin(ang) * P * 0.05, P * 0.04, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#ffb02e';
      g.beginPath(); g.arc(x, py - P * 0.2, P * 0.03, 0, Math.PI * 2); g.fill();
    }
  }

  // ------------------------------------------------------------ events

  handleEvents(events) {
    const red = this.reduced;
    for (const e of events) {
      switch (e.type) {
        case 'dug': {
          const col = CHIP_COLORS[e.layer ?? 0];
          for (let k = 0; k < (red ? 4 : 10); k++) this.spawn(0, e.x + 0.5, e.y + 0.5, (Math.random() - 0.5) * 5, -Math.random() * 4, 0.6, col[k % 4], 0.09 + Math.random() * 0.06, 14);
          break;
        }
        case 'gem': {
          const o = ORES[e.ore];
          for (let k = 0; k < (red ? 4 : 12); k++) this.spawn(1, e.x + 0.5, e.y + 0.5, (Math.random() - 0.5) * 4, -1 - Math.random() * 3, 0.8, o.color, 0.12, 4);
          this.text(`+${o.name}`, e.x + 0.5, e.y, o.color);
          break;
        }
        case 'full': this.text('Hold full!', e.x + 0.5, e.y, '#ffb4b4'); break;
        case 'relic': {
          for (let k = 0; k < (red ? 6 : 24); k++) this.spawn(1, e.x + 0.5, e.y + 0.5, (Math.random() - 0.5) * 6, -2 - Math.random() * 3, 1.1, '#fff2a8', 0.14, 3);
          this.text('Museum find!', e.x + 0.5, e.y, '#fff2a8');
          break;
        }
        case 'fuel': this.text('+Fuel', e.x + 0.5, e.y, '#ff8a7a'); break;
        case 'gas':
          for (let k = 0; k < (red ? 3 : 8); k++) this.spawn(2, e.x + 0.5, e.y + 0.5, (Math.random() - 0.5) * 3, -Math.random() * 2, 0.9, 'gas', 0.8 + Math.random() * 0.6, -1);
          this.text('Pfft!', e.x + 0.5, e.y, '#c8ff9a');
          this.kick(0.25);
          break;
        case 'bonk':
          for (let k = 0; k < (red ? 4 : 12); k++) this.spawn(0, e.x, e.y, (Math.random() - 0.5) * 6, -Math.random() * 5, 0.8, k % 2 ? '#7a7884' : '#9d9ba8', 0.14, 14);
          this.text('Bonk!', e.x, e.y - 0.5, '#ffffff');
          this.kick(0.45);
          this.flash = 0.25;
          break;
        case 'thud':
          for (let k = 0; k < (red ? 2 : 6); k++) this.spawn(2, e.x, e.y, (Math.random() - 0.5) * 3, -Math.random(), 0.6, 'dust', 0.6, -0.5);
          this.kick(0.15);
          break;
        case 'thump': this.kick(Math.min(0.3, e.impact * 0.02)); break;
        case 'hot':
          this.text('Hot hot!', e.x, e.y - 0.6, '#ffb070');
          this.flash = 0.15;
          break;
        case 'cool': case 'hiss':
          for (let k = 0; k < (red ? 2 : 5); k++) this.spawn(2, e.x + 0.5, e.y + 0.3, (Math.random() - 0.5) * 2, -1 - Math.random() * 2, 1.0, 'steam', 0.7, -1.5);
          break;
        case 'boing':
          this.text('Boing!', e.x, e.y - 0.4, '#ff9ee8');
          break;
        case 'blocked':
          if (e.reason === 'hard') this.text('Too hard!', e.x + 0.5, e.y + 0.2, '#ffffff');
          else if (e.reason === 'hot') this.text('Too hot!', e.x + 0.5, e.y + 0.2, '#ffb070');
          break;
        case 'core':
          for (let k = 0; k < (red ? 10 : 60); k++) this.spawn(1, e.x + 0.5, e.y + 0.5, (Math.random() - 0.5) * 10, -Math.random() * 8, 1.8, ['#ff6bd5', '#ffd84a', '#5ef2ff', '#8b7bff'][k % 4], 0.16, 3);
          this.kick(0.6);
          break;
        case 'acorn': this.text('Golden Acorn!', e.x + 0.5, e.y, '#ffd84a'); break;
        default: break;
      }
    }
  }

  kick(a) { this.shake = Math.max(this.shake, this.reduced ? a * 0.25 : a); }

  spawn(kind, x, y, vx, vy, life, color, size, g) {
    let p = null;
    for (let i = 0; i < this.parts.length; i++) if (!this.parts[i].on) { p = this.parts[i]; break; }
    if (!p) return;
    p.on = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = 0; p.life = life; p.color = color; p.size = size; p.g = g;
  }

  text(str, x, y, color) {
    if (this.texts.length > 10) this.texts.shift();
    this.texts.push({ str, x, y, t: 0, color });
  }

  // ------------------------------------------------------------ update

  update(dt, session) {
    this.time += dt;
    const mine = session.mine;
    for (const i of mine.changed) this.markDirty(i);
    mine.changed.length = 0;
    if (session.stats.lamp !== this.lampTier) {
      this.lampTier = session.stats.lamp;
      for (const ch of this.chunks.values()) ch.dirty = true;
    }
    const p = mine.pod;
    // Chips fly while the drill chews.
    if (p.drill) {
      this.chipT += dt;
      const rate = this.reduced ? 0.12 : 0.04;
      while (this.chipT > rate) {
        this.chipT -= rate;
        const d = p.drill;
        const col = CHIP_COLORS[session.world.layerOf[Math.max(0, d.ty)]];
        const ex = d.dx ? d.tx + (d.dx > 0 ? 0.1 : 0.9) : p.x;
        const ey = d.dy ? d.ty + 0.1 : p.y + 0.1;
        this.spawn(0, ex, ey, (Math.random() - 0.5) * 4 - d.dx * 2, -1.5 - Math.random() * 3, 0.5, col[Math.floor(Math.random() * 4)], 0.07 + Math.random() * 0.05, 14);
      }
    }
    for (const pt of this.parts) {
      if (!pt.on) continue;
      pt.t += dt;
      if (pt.t >= pt.life) { pt.on = false; continue; }
      pt.vy += pt.g * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.kind === 2) { pt.vx *= 1 - dt * 2; }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      t.y -= dt * 0.9;
      if (t.t > 1.3) this.texts.splice(i, 1);
    }
    // Camera: follow with a little look-ahead.
    const k = 1 - Math.exp(-dt * 7);
    const look = Math.max(-1.5, Math.min(2, p.vy * 0.12));
    const tx = this.camTarget ? this.camTarget.x : p.x, ty = this.camTarget ? this.camTarget.y : p.y + look;
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.clampCam();
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt);
  }

  clampCam() {
    if (!this.session) return;
    const vw = this.W / this.TS, vh = this.H / this.TS;
    const w = this.session.mine.w, h = this.session.mine.h;
    if (vw >= w) this.cam.x = w / 2;
    else this.cam.x = Math.max(vw / 2, Math.min(w - vw / 2, this.cam.x));
    this.cam.y = Math.max(-8, Math.min(h - vh / 2 + 0.5, this.cam.y));
  }

  // Screen position of a world point.
  sx(x) { return (x - this.camX) * this.TS + this.W / 2; }
  sy(y) { return (y - this.camY) * this.TS + this.H / 2; }

  toWorld(clientX, clientY) {
    return { x: (clientX - this.W / 2) / this.TS + this.camX, y: (clientY - this.H / 2) / this.TS + this.camY };
  }

  // ------------------------------------------------------------ draw

  draw(session, opts = {}) {
    const g = this.ctx, TS = this.TS, W = this.W, H = this.H;
    const mine = session.mine, world = session.world, p = mine.pod;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sh = this.shake > 0 ? this.shake * 0.35 : 0;
    this.camX = this.cam.x + (sh ? (Math.random() - 0.5) * sh : 0);
    this.camY = this.cam.y + (sh ? (Math.random() - 0.5) * sh : 0);
    const x0 = this.camX - W / 2 / TS, y0 = this.camY - H / 2 / TS;
    const x1 = x0 + W / TS, y1 = y0 + H / TS;

    // Underground backdrop, then sky if visible.
    const midRow = Math.max(0, Math.min(mine.h - 1, Math.floor(this.camY)));
    g.fillStyle = LAYERS[world.layerOf[midRow]].colors.bg;
    g.fillRect(0, 0, W, H);
    if (y0 < 0.5) this.drawSky(g, mine, y0);

    // Terrain chunks.
    const budget = { n: opts.bakeBudget ?? 5 };
    const cx0 = Math.max(0, Math.floor(x0 / CH)), cx1 = Math.min(Math.ceil(mine.w / CH) - 1, Math.floor(x1 / CH));
    const cy0 = Math.max(0, Math.floor(y0 / CH)), cy1 = Math.min(Math.ceil(mine.h / CH) - 1, Math.floor(y1 / CH));
    const size = CH * TS;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const ch = this.chunk(cx, cy, budget);
        const X = this.sx(cx * CH), Y = this.sy(cy * CH);
        if (ch) g.drawImage(ch.canvas, X, Y, size + 0.5, size + 0.5);
        else { g.fillStyle = LAYERS[world.layerOf[Math.min(mine.h - 1, cy * CH)]].colors.base; g.fillRect(X, Y, size + 0.5, size + 0.5); }
      }
    }
    // Outside the mine walls.
    g.fillStyle = '#16141c';
    if (x0 < 0) g.fillRect(0, Math.max(0, this.sy(0)), this.sx(0), H);
    if (x1 > mine.w) g.fillRect(this.sx(mine.w), Math.max(0, this.sy(0)), W, H);

    if (y0 < 1) this.drawBase(g, session);

    // Dynamic tile bits: drill cracks, wobbling boulders.
    if (p.drill) {
      const k = Math.min(1, p.drill.t / p.drill.dur);
      const stage = k < 0.34 ? 0 : k < 0.67 ? 1 : 2;
      g.drawImage(this.crack[stage], this.sx(p.drill.tx), this.sy(p.drill.ty), TS, TS);
    }
    for (const b of mine.boulders) {
      const bx = this.sx(b.x), by = this.sy(b.y);
      if (b.state === 'wobble') {
        const li = world.layerOf[Math.max(0, b.y)];
        g.drawImage(this.sheet.layers[li].bg[0], bx, by, TS, TS);
        const wob = Math.sin(this.time * 40) * TS * 0.06 * (this.reduced ? 0.4 : 1);
        g.drawImage(this.sheet.boulder, bx + wob, by, TS, TS);
        g.fillStyle = '#fff';
        g.font = `900 ${Math.round(TS * 0.4)}px ui-rounded, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.fillText('!', bx + TS / 2, by - TS * 0.05);
      } else {
        g.drawImage(this.sheet.boulder, bx, by, TS, TS);
      }
    }

    if (opts.tow) this.drawWorm(g, opts.tow);
    if (!opts.tow || opts.tow.showPod) this.drawPod(g, session, opts);
    this.drawParticles(g);
    this.drawLight(g, session, x0, y0, x1, y1);
    this.drawTexts(g);
    if (this.flash > 0 && !this.reduced) {
      g.fillStyle = `rgba(255,90,90,${(this.flash * 0.9).toFixed(2)})`;
      g.fillRect(0, 0, W, H);
    }
    if (opts.fade) {
      g.fillStyle = `rgba(10,6,20,${opts.fade.toFixed(3)})`;
      g.fillRect(0, 0, W, H);
    }
  }

  drawSky(g, mine, y0) {
    const W = this.W, TS = this.TS;
    const ground = this.sy(0);
    const top = this.sy(-10);
    g.fillStyle = '#5fb7ff';
    g.fillRect(0, 0, W, Math.max(0, top));
    g.drawImage(this.sky, 0, top, W, ground - top + 1);
    // Sun and clouds drift with parallax.
    const par = (x, k) => (x - this.camX * k) * TS + W / 2;
    g.drawImage(this.sun, par(mine.w * 0.78, 0.25) - TS * 1.5, this.sy(-7.2) - TS * 1.5, TS * 3, TS * 3);
    const span = mine.w + 16;
    this.clouds.forEach((c, k) => {
      const wx = ((k * 13.7 + this.time * (0.25 + k * 0.08)) % span) - 8;
      const cw = c.width / this.P * TS, chh = c.height / this.P * TS;
      g.drawImage(c, par(wx, 0.5), this.sy(-8 + k * 1.3), cw, chh);
    });
    // Hills, tiled.
    const far = this.hillFar, near = this.hillNear;
    const fh = TS * 4, nh = TS * 3.2;
    const fw = far.width, nw = near.width;
    const fo = ((-this.camX * TS * 0.3) % fw + fw) % fw;
    for (let x = -fo; x < W; x += fw) g.drawImage(far, x, ground - fh, fw, fh);
    const no = ((-this.camX * TS * 0.6) % nw + nw) % nw;
    for (let x = -no; x < W; x += nw) g.drawImage(near, x, ground - nh + TS * 0.2, nw, nh);
  }

  drawBase(g, session) {
    const TS = this.TS, B = this.buildings;
    const mine = session.mine;
    const ground = this.sy(0);
    const put = (img, wx, wTiles) => {
      const w = wTiles * TS, h = img.height / img.width * w;
      g.drawImage(img, this.sx(wx), ground - h, w, h);
    };
    if (session.kind === 'main') {
      put(B.museum, mine.base.x0 + 0.05, 2.3);
      put(B.shop, mine.base.x0 + 2.45, 2.5);
      put(B.pump, mine.base.x0 + 5.0, 1.1);
      put(B.workshop, mine.base.x0 + 6.2, 2.5);
    } else {
      put(B.shop, mine.base.x0 + 0.1, 2.5);
      put(B.pump, mine.base.x0 + 2.8, 1.1);
    }
    // A sign post at the pad edge.
    const sxp = this.sx(mine.base.x1 + 1.05);
    g.fillStyle = '#6b4a2c';
    g.fillRect(sxp - TS * 0.04, ground - TS * 1.1, TS * 0.08, TS * 1.1);
    g.fillStyle = '#ffd24a';
    g.beginPath(); g.moveTo(sxp, ground - TS * 1.1); g.lineTo(sxp + TS * 0.55, ground - TS * 0.95); g.lineTo(sxp, ground - TS * 0.8); g.fill();
  }

  drawPod(g, session, opts) {
    const TS = this.TS, p = session.pod;
    const img = this.podSprite(opts.paint || 'sunflower');
    const S = TS * 1.2;
    const cx = this.sx(p.x), bottom = this.sy(p.y + 0.4);
    let sq = 1;
    if (p.landT > 0 && !this.reduced) sq = 1 - p.landT * 0.4;
    const hsz = S * sq, wsz = S * (2 - sq);
    const top = bottom - 0.88 * hsz;
    if (p.hitT > 0 && Math.floor(this.time * 18) % 2 === 0) g.globalAlpha = 0.45;
    g.save();
    g.translate(cx, 0);
    const face = p.facing < 0 ? -1 : 1;
    g.scale(face, 1);
    const left = -wsz / 2;
    const u = wsz / 100, uy = hsz / 100;
    // Drill (behind the body). Points down while drilling down.
    const spin = p.drill ? this.time * 30 : 0;
    const down = p.drill ? p.drill.dy === 1 : false;
    g.fillStyle = '#b9c2d6';
    g.strokeStyle = '#5a6278';
    g.lineWidth = Math.max(1, 2.2 * u);
    g.beginPath();
    if (down) {
      const dx = left + 50 * u, dy = top + 84 * uy;
      g.moveTo(dx - 12 * u, dy); g.lineTo(dx + 12 * u, dy); g.lineTo(dx, dy + 26 * uy); g.closePath();
      g.fill(); g.stroke();
      for (let k = 0; k < 3; k++) {
        const t = ((k / 3 + spin * 0.05) % 1);
        g.beginPath(); g.moveTo(dx - 12 * u * (1 - t), dy + 26 * uy * t); g.lineTo(dx + 12 * u * (1 - t) * 0.6, dy + 26 * uy * t + 4 * uy); g.stroke();
      }
    } else {
      const dx = left + 84 * u, dy = top + 60 * uy;
      g.moveTo(dx, dy - 11 * uy); g.lineTo(dx, dy + 11 * uy); g.lineTo(dx + 26 * u, dy); g.closePath();
      g.fill(); g.stroke();
      for (let k = 0; k < 3; k++) {
        const t = ((k / 3 + spin * 0.05) % 1);
        g.beginPath(); g.moveTo(dx + 26 * u * t, dy - 11 * uy * (1 - t)); g.lineTo(dx + 26 * u * t + 4 * u, dy + 11 * uy * (1 - t) * 0.6); g.stroke();
      }
    }
    g.drawImage(img, left, top, wsz, hsz);
    // Propeller: a mast and two spinning blades.
    const mx = left + 46 * u, my = top + 17 * uy;
    g.fillStyle = '#5a6278';
    g.fillRect(mx - 1.6 * u, my, 3.2 * u, 8 * uy);
    const rate = p.flying ? 40 : 3;
    const ph = this.time * rate;
    const bw = 28 * u * Math.abs(Math.cos(ph));
    g.fillStyle = p.flying ? 'rgba(230,240,255,0.85)' : '#e8eef8';
    g.beginPath(); g.ellipse(mx - bw / 2 - 1 * u, my, Math.max(1, bw / 2), 3 * uy, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(mx + bw / 2 + 1 * u, my, Math.max(1, bw / 2), 3 * uy, 0, 0, Math.PI * 2); g.fill();
    if (p.flying && !this.reduced) {
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath(); g.ellipse(mx, my, 30 * u, 4 * uy, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ff6b8b';
    g.beginPath(); g.arc(mx, my, 3 * u, 0, Math.PI * 2); g.fill();
    g.restore();
    g.globalAlpha = 1;
  }

  drawWorm(g, tow) {
    const TS = this.TS;
    const img = this.worm;
    const w = TS * 1.4, h = img.height / img.width * w;
    const x = this.sx(tow.x) - w / 2;
    const base = this.sy(tow.y);
    const rise = Math.max(0, Math.min(1, tow.emerge));
    const wave = Math.sin(this.time * 6) * 0.06;
    g.save();
    g.beginPath();
    g.rect(x - TS, base - h - TS, w + TS * 2, h + TS);
    g.clip();
    g.translate(x + w / 2, base + h * (1 - rise));
    g.rotate(wave);
    g.drawImage(img, -w / 2, -h, w, h);
    g.restore();
  }

  drawParticles(g) {
    const TS = this.TS;
    for (const pt of this.parts) {
      if (!pt.on) continue;
      const a = 1 - pt.t / pt.life;
      const X = this.sx(pt.x), Y = this.sy(pt.y);
      if (pt.kind === 0) {
        g.globalAlpha = Math.min(1, a * 2);
        g.fillStyle = pt.color;
        const s = pt.size * TS;
        g.fillRect(X - s / 2, Y - s / 2, s, s);
      } else if (pt.kind === 1) {
        g.globalAlpha = a;
        g.fillStyle = pt.color;
        const s = pt.size * TS * (0.6 + a * 0.6);
        g.fillRect(X - s / 2, Y - s * 0.12, s, s * 0.24);
        g.fillRect(X - s * 0.12, Y - s / 2, s * 0.24, s);
      } else {
        g.globalAlpha = a * 0.8;
        const s = pt.size * TS * (1 + pt.t * 1.5);
        const img = pt.color === 'gas' ? this.puffGas : pt.color === 'dust' ? this.puffDust : this.puff;
        g.drawImage(img, X - s / 2, Y - s / 2, s, s);
      }
    }
    g.globalAlpha = 1;
  }

  drawLight(g, session, x0, y0, x1, y1) {
    const mine = session.mine, world = session.world, p = mine.pod;
    const TS = this.TS;
    // Darkness grows with depth; daylight above.
    const row = this.camY;
    let dark = 0;
    if (row > 1) {
      const li = world.layerOf[Math.min(mine.h - 1, Math.floor(row))];
      const surf = Math.min(1, (row - 1) / 10);
      dark = AMBIENT[li] * (li === 0 ? surf : 1);
    }
    if (session.kind !== 'main') dark *= 0.9;
    if (dark <= 0.01) return;
    const lg = this.lg, LW = this.light.width, LH = this.light.height;
    const hs = 0.5; // light map scale
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, LW, LH);
    lg.fillStyle = DARK_STYLES[Math.round(dark * 100)];
    lg.fillRect(0, 0, LW, LH);
    lg.globalCompositeOperation = 'destination-out';
    // Sky and daylight leaking into the top rows.
    const ground = this.sy(0) * hs;
    if (ground > 0) lg.fillRect(0, 0, LW, ground);
    const leak = this.sy(8) * hs;
    if (leak > 0 && ground < LH) lg.drawImage(this.skylight, 0, ground, LW, leak - ground);
    // The pod's lamp, nudged forward.
    const lamp = session.stats.lamp;
    const flick = this.reduced ? 1 : 1 + Math.sin(this.time * 9) * 0.02;
    const R = lamp * TS * hs * flick * 1.05;
    const lx = this.sx(p.x + p.facing * 0.35) * hs, ly = this.sy(p.y) * hs;
    lg.drawImage(this.lightTex, lx - R, ly - R, R * 2, R * 2);
    // Glowing tiles.
    const em = this.emissive;
    em.length = 0;
    const tx0 = Math.max(0, Math.floor(x0) - 2), tx1 = Math.min(mine.w - 1, Math.ceil(x1) + 2);
    const ty0 = Math.max(0, Math.floor(y0) - 2), ty1 = Math.min(mine.h - 1, Math.ceil(y1) + 2);
    const pulse = this.reduced ? 1 : 0.85 + Math.sin(this.time * 2.2) * 0.15;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * mine.w + tx;
        const c = mine.tiles[i];
        let r = 0, kind = null, a = 1;
        if (c === T.LAVA) { r = 1.6; kind = 'lava'; a = 0.8; }
        else if (c === T.CORE) { r = 5; kind = 'core'; }
        else if (isOre(c) && ORES[c - T.ORE0].glow) { r = 0.85; kind = 'gem'; a = 0.4; }
        else if (c === T.EMPTY) {
          const d = world.deco[i];
          if (d === D.SHROOM) { r = 1.7; kind = 'shroom'; a = 0.8; }
          else if (d === D.CRYSTAL_UP || d === D.CRYSTAL_DOWN) { r = 1.4; kind = 'crystal'; a = 0.7; }
          else if (d === D.TORCH) { r = 2.6; kind = 'torch'; }
        }
        if (!r) continue;
        const X = this.sx(tx + 0.5) * hs, Y = this.sy(ty + 0.5) * hs, rr = r * TS * hs * (kind === 'lava' || kind === 'torch' ? pulse : 1);
        lg.globalAlpha = a;
        lg.drawImage(this.lightTex, X - rr, Y - rr, rr * 2, rr * 2);
        if (kind !== 'gem' && em.length < 160) em.push(kind, tx, ty, r);
      }
    }
    lg.globalAlpha = 1;
    lg.globalCompositeOperation = 'source-over';
    g.drawImage(this.light, 0, 0, this.W, this.H);
    // Coloured glow on top.
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < em.length; k += 4) {
      const kind = em[k], tx = em[k + 1], ty = em[k + 2], r = em[k + 3] * 0.9;
      const img = this.glows[kind];
      const X = this.sx(tx + 0.5), Y = this.sy(ty + 0.5), rr = r * TS;
      g.globalAlpha = kind === 'lava' ? 0.35 * pulse : 0.45;
      g.drawImage(img, X - rr, Y - rr, rr * 2, rr * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  drawTexts(g) {
    if (!this.texts.length) return;
    const TS = this.TS;
    g.font = `900 ${Math.round(Math.max(14, TS * 0.36))}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(3, TS * 0.08);
    g.strokeStyle = 'rgba(20,10,30,0.85)';
    for (const t of this.texts) {
      g.globalAlpha = Math.min(1, (1.3 - t.t) * 2.5);
      const X = this.sx(t.x), Y = this.sy(t.y);
      g.strokeText(t.str, X, Y);
      g.fillStyle = t.color;
      g.fillText(t.str, X, Y);
    }
    g.globalAlpha = 1;
  }

  // Prebake the chunks around the pod (spread over frames by the budget).
  warm(session) {
    this.update(0, session);
  }
}
