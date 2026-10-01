// Canvas renderer. Reads world state and never changes it. Everything
// costly (sprites, sky, ridges, cloud) is baked once; per frame it is
// drawImage, a terrain path, and a capped particle pool.
import { itemSprite, skinTexture, ballShade, hatSprite, propellerBlades, cloudSprite, iceWallSprite, SKIES, ridgeStrip, treeStrip, starfield, auroraStrip } from './sprites.js';
import { PICK_RATIO, BUMP_RATIO, ITEM_BY_ID, formatSize } from './items.js';
import { PEAKS } from './levels.js';
import { physicsFor } from './world.js';

const MAX_PARTICLES = 260;
const MAX_TEXTS = 8;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }

function softDot(color, size = 64) {
  const c = mk(size, size);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, color); gr.addColorStop(0.55, color.replace(/[\d.]+\)$/, '0.5)')); gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

function sparkSprite() {
  const c = mk(48, 48);
  const g = c.getContext('2d');
  g.translate(24, 24);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 8; i++) { const r = i % 2 ? 5 : 22; const a = (i / 8) * Math.PI * 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill();
  return c;
}

function decoTree(color) {
  const c = mk(240, 400);
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.fillStyle = color;
  g.fillRect(54, 170, 12, 30);
  for (let i = 0; i < 4; i++) {
    const y = 10 + i * 40, w = 26 + i * 10;
    g.beginPath(); g.moveTo(60, y); g.lineTo(60 + w, y + 60); g.lineTo(60 - w, y + 60); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 4; i++) {
    const y = 10 + i * 40, w = 26 + i * 10;
    g.beginPath(); g.moveTo(60, y + 2); g.lineTo(60 + w * 0.5, y + 28); g.lineTo(60 - w * 0.5, y + 30); g.closePath(); g.fill();
  }
  return c;
}

function balloonSprite(color) {
  const c = mk(80, 100);
  const g = c.getContext('2d');
  g.beginPath(); g.moveTo(40, 6); g.bezierCurveTo(76, 6, 76, 62, 40, 78); g.bezierCurveTo(4, 62, 4, 6, 40, 6); g.closePath();
  g.fillStyle = color; g.fill(); g.lineWidth = 4; g.strokeStyle = '#3a2d4d'; g.stroke();
  g.beginPath(); g.moveTo(34, 84); g.lineTo(46, 84); g.lineTo(40, 76); g.closePath(); g.fillStyle = color; g.fill(); g.stroke();
  g.beginPath(); g.ellipse(28, 26, 7, 12, -0.5, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fill();
  return c;
}

function decoRock() {
  const c = mk(140, 90);
  const g = c.getContext('2d');
  g.fillStyle = '#7c8aa5';
  g.beginPath(); g.moveTo(6, 90); g.quadraticCurveTo(10, 20, 60, 14); g.quadraticCurveTo(130, 10, 134, 90); g.closePath(); g.fill();
  g.fillStyle = '#fbfdff';
  g.beginPath(); g.moveTo(24, 36); g.quadraticCurveTo(60, 4, 116, 30); g.quadraticCurveTo(80, 30, 24, 36); g.fill();
  return c;
}

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.reduced = reducedMotion;
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.flash = 0;
    this.time = 0;
    this.cam = { x: 0, y: 0, viewH: 200 };
    this.sky = null;
    this.peak = -1;
    this.flakes = [];
    this.spark = sparkSprite();
    this.puff = softDot('rgba(255,255,255,0.9)');
    this.glowWarm = softDot('rgba(255,220,140,0.8)');
    this.rock = decoRock();
    this.balloons = ['#ff6f91', '#ffc531', '#5ec8f2', '#8bd96a', '#b48cff'].map(balloonSprite);
    this.hint = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, window.innerWidth), h = Math.max(320, window.innerHeight);
    this.dpr = dpr;
    this.W = w; this.H = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ui = Math.max(0.72, Math.min(1.25, Math.min(w, h) / 640));
    if (this.peak >= 0) this.bakeSky(this.peak, true);
    const n = this.reduced ? 24 : 70;
    this.flakes = Array.from({ length: n }, (_, i) => ({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 2.4, s: 0.4 + Math.random(), p: i }));
  }

  // Backdrops are baked once per peak (and screen height) and cached, so
  // Endless Mountain can change peaks without a hitch.
  bakeSky(peak, force = false) {
    if (peak === this.peak && !force) return;
    if (force) this.skyCache = new Map();
    this.skyCache ??= new Map();
    this.peak = peak;
    let set = this.skyCache.get(peak);
    if (!set) {
      set = this.buildSky(peak);
      this.skyCache.set(peak, set);
    }
    Object.assign(this, set);
  }

  buildSky(peak) {
    const key = PEAKS[peak]?.sky || 'morning';
    const P = SKIES[key];
    const H = this.H;
    const sky = mk(2, H);
    const g = sky.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, P.top); gr.addColorStop(0.55, P.mid); gr.addColorStop(1, P.bottom);
    g.fillStyle = gr; g.fillRect(0, 0, 2, H);
    const wg = mk(140, 2);
    const w2 = wg.getContext('2d');
    const lg = w2.createLinearGradient(0, 0, 140, 0);
    lg.addColorStop(0, 'rgba(120,170,255,0.75)'); lg.addColorStop(1, 'rgba(120,170,255,0)');
    w2.fillStyle = lg; w2.fillRect(0, 0, 140, 2);
    return {
      pal: P,
      sky,
      ridges: [ridgeStrip(P.far, 'rgba(255,255,255,0.75)', 11 + peak, 1400, 360, 1.1), ridgeStrip(P.mid2, 'rgba(255,255,255,0.55)', 23 + peak, 1100, 300, 0.9)],
      trees: treeStrip(P.trees, 31 + peak, 1024, 240),
      decoTree: decoTree(P.trees),
      stars: key === 'night' ? starfield(this.W, this.H) : null,
      aurora: key === 'night' ? auroraStrip(1200, 320) : null,
      sun: key === 'night' ? softDot('rgba(240,245,255,0.95)', 160) : key === 'sunset' ? softDot('rgba(255,200,120,0.95)', 220) : softDot('rgba(255,250,220,0.95)', 200),
      warnEdge: wg,
    };
  }

  // Bake the other peaks' backdrops ahead of time (one per call).
  warmSkies() {
    this.skyCache ??= new Map();
    for (let p = 0; p < PEAKS.length; p++) if (!this.skyCache.has(p)) { this.skyCache.set(p, this.buildSky(p)); return false; }
    return true;
  }

  reset(world, { snap = true } = {}) {
    this.bakeSky(world.level.peak);
    this.particles.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.hint = 6;
    if (snap) {
      const b = world.ball;
      this.cam.viewH = this.targetViewH(world);
      this.cam.x = b.x;
      this.cam.y = b.y;
      this.update(0, world, true);
    }
  }

  targetViewH(world) {
    const b = world.ball;
    const { vmax } = physicsFor(b.D);
    const sp = Math.min(1.4, Math.hypot(b.vx, b.vy) / vmax);
    const aspect = this.W / this.H;
    // Portrait screens need more height to see enough slope ahead.
    const base = aspect < 1 ? 8.2 : 6.4;
    const chase = world.avalanche && world.avalanche.delay <= 0 && world.status === 'play' ? 1.12 : 1;
    return b.D * base * chase * (1 + sp * 0.18);
  }

  update(dt, world, snap = false) {
    this.time += dt;
    if (!world) return;
    const b = world.ball;
    if (world.endless) this.bakeSky(world.level.zoneAt(b.x));
    const T = world.terrain;
    const c = this.cam;
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.2);
    const target = this.targetViewH(world);
    c.viewH = Math.exp(Math.log(c.viewH) + (Math.log(target) - Math.log(c.viewH)) * k);
    const viewW = c.viewH * (this.W / this.H);
    let lead = viewW * (this.W > this.H ? 0.16 : 0.08);
    // Behind the title card, frame the ball off to the lower left.
    if (this.attract) lead = viewW * (this.W > this.H ? 0.3 : 0.05);
    const av = world.avalanche;
    // With the Snow Cloud behind, frame the ball nearer the middle so its
    // puffy front looms at the left edge.
    if (av && av.delay <= 0 && world.status === 'play') lead = -viewW * (0.04 + 0.1 * Math.max(0, 1 - av.gap / 6.5));
    // Follow the ball tightly in x; ease the look-ahead and the height.
    c.lead = snap || c.lead == null ? lead : c.lead + (lead - c.lead) * (1 - Math.exp(-dt * 2));
    const ahead = T.groundY(b.x + viewW * 0.3);
    const ty = Math.min(b.y, (b.y + ahead) / 2) + c.viewH * (this.attract && this.W > this.H ? -0.16 : 0.06);
    c.x = b.x + c.lead;
    c.y += (ty - c.y) * (snap ? 1 : 1 - Math.exp(-dt * 4));
    // Particles
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 2);
    if (this.hint > 0) this.hint -= dt;
    // Rolling snow spray
    if (!snap && b.grounded && world.status !== 'caught') {
      const sp = Math.abs(b.vx) / physicsFor(b.D).vmax;
      const n = this.reduced ? 0 : sp > 0.25 ? (Math.random() < sp * 0.8 ? 1 : 0) : 0;
      for (let i = 0; i < n; i++) this.emit('snow', b.x - b.r * 0.3, b.y + b.r * 0.92, -b.vx * 0.15 - Math.random() * b.D * 0.6, -b.D * (0.6 + Math.random() * 2), b.D * (0.025 + Math.random() * 0.035), 0.45, b.D * 9);
    }
    if (!snap && av && av.delay <= 0 && !this.reduced && Math.random() < 0.5) {
      const ay = T.groundY(av.x);
      this.emit('puff', av.x - Math.random() * b.D * 2, ay - Math.random() * b.D * 6, av.v * 0.6, -b.D * Math.random(), b.D * (0.5 + Math.random()), 0.9, 0);
    }
  }

  emit(kind, x, y, vx, vy, size, life, g = 0, color = '#fff') {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ kind, x, y, vx, vy, size, life, max: life, g, color, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 10 });
  }

  // Floating words. `follow` keeps them beside the ball as it rolls on.
  say(text, x, y, color = '#fff', size = 1, life = 1.2, follow = null) {
    const same = this.texts.find((t) => t.text === text);
    if (same) { same.life = same.max; return; }
    if (this.texts.length >= MAX_TEXTS) this.texts.shift();
    // Words that follow the ball stack upwards instead of overlapping.
    const stack = follow ? this.texts.filter((t) => t.follow && t.life > t.max * 0.35).length : 0;
    const lift = follow ? stack * follow.D * 0.42 : 0;
    this.texts.push({ text, x, y, color, size, life, max: life, follow, ox: follow ? x - follow.x : 0, oy: follow ? y - follow.y - lift : 0 });
  }

  handleEvents(events, world) {
    const b = world.ball;
    const D = b.D;
    const burst = this.reduced ? 0.35 : 1;
    for (const e of events) {
      switch (e.type) {
        case 'pick': {
          if (e.air) this.emit('balloon', e.x, e.y - e.size * 1.6, D * 0.5, -D * 3, Math.max(e.size * 0.5, D * 0.1), 1.6, -D * 2, '#ff6f91');
          const n = Math.round(6 * burst);
          for (let i = 0; i < n; i++) this.emit('spark', e.x, e.y, (Math.random() - 0.5) * D * 4, -Math.random() * D * 4, D * 0.12, 0.6, D * 6);
          const def = ITEM_BY_ID[e.item];
          const firstOfType = world.byType[e.item] === 1;
          if (firstOfType || def.waves || e.ratio > 0.4) this.say(`+${def.name}`, b.x + D * 0.2, b.y - D * 0.8, def.waves ? '#ffe36b' : '#ffffff', e.ratio > 0.35 ? 1 : 0.8, 0.9, b);
          break;
        }
        case 'bump':
          for (let i = 0; i < Math.round(12 * burst); i++) this.emit('snow', b.x + b.r * 0.6, b.y, (Math.random() - 0.3) * D * 5, -Math.random() * D * 5, D * (0.08 + Math.random() * 0.12), 0.8, D * 10);
          this.say(e.drop ? `Bonk! ${e.drop} fell off` : 'Bonk!', b.x, b.y - D * 0.9, '#ffb3c0', 1, 1.1, b);
          this.shake = Math.max(this.shake, 0.5);
          break;
        case 'jump':
          for (let i = 0; i < Math.round(6 * burst); i++) this.emit('snow', e.x, e.y, (Math.random() - 0.5) * D * 3, -Math.random() * D * 2, D * 0.08, 0.5, D * 8);
          break;
        case 'land':
          for (let i = 0; i < Math.round(10 * burst * (0.4 + e.power)); i++) this.emit('snow', e.x + (Math.random() - 0.5) * D, e.y, (Math.random() - 0.5) * D * 6, -Math.random() * D * 3 * e.power, D * 0.1, 0.6, D * 8);
          if (e.power > 0.5) this.shake = Math.max(this.shake, 0.4 * e.power);
          break;
        case 'air':
          this.say(e.time > 1.4 ? 'Mega air!' : 'Big air!', b.x, b.y - D, '#8ff6ff', 1, 1, b);
          break;
        case 'milestone':
          this.say(`Size up! ${formatSize(e.size)}`, b.x, b.y - D * 1.25, '#ffe36b', 1.25, 1.4, b);
          for (let i = 0; i < Math.round(14 * burst); i++) { const a = (i / 14) * Math.PI * 2; this.emit('spark', b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, Math.cos(a) * D * 2, Math.sin(a) * D * 2, D * 0.12, 0.7, 0); }
          break;
        case 'gate.smash':
          for (let i = 0; i < Math.round(26 * burst); i++) this.emit('shard', e.x, e.y - Math.random() * e.min * 1.6, Math.random() * D * 6, -Math.random() * D * 5, e.min * (0.05 + Math.random() * 0.08), 1.2, D * 10, i % 3 ? '#bfe6ff' : '#ffffff');
          this.say('Smash!', e.x, e.y - e.min * 1.8, '#8ff6ff', 1.3, 1.2);
          this.shake = Math.max(this.shake, 0.8);
          this.flash = 0.35;
          break;
        case 'gate.block':
          for (let i = 0; i < Math.round(14 * burst); i++) this.emit('snow', e.x - D * 1.2, e.y - D * 2 - Math.random() * D, (Math.random() - 0.2) * D * 2, -Math.random() * D * 2, D * 0.12, 0.8, D * 6);
          this.say(e.size >= e.min ? 'Big enough now!' : `Need ${formatSize(e.min)}`, e.x - D, e.y - D * 2.4, '#ffd28f', 1, 1.2);
          this.shake = Math.max(this.shake, 0.35);
          break;
        case 'bridge.break':
          for (let i = 0; i < Math.round(16 * burst); i++) this.emit('plank', e.x + (Math.random() - 0.5) * D * 2, e.y, (Math.random() - 0.5) * D * 3, -Math.random() * D * 2, D * (0.15 + Math.random() * 0.15), 1.4, D * 9, '#a0663a');
          this.say('Crack! Too heavy!', b.x, b.y - D * 1.2, '#ffd28f', 1, 1.3, b);
          this.shake = Math.max(this.shake, 0.6);
          break;
        case 'assist':
          this.say('A Snow Pal gives you a push!', b.x, b.y - D * 1.3, '#c8f7c5', 0.9, 1.6, b);
          break;
        case 'bridge.cross':
          this.say('Light as a snowflake!', e.x, e.y - D * 1.4, '#c8f7c5', 0.9, 1.1);
          break;
        case 'finish':
          for (let i = 0; i < Math.round(40 * burst); i++) this.emit('confetti', e.x, e.y - D * 2, (Math.random() - 0.5) * D * 8, -Math.random() * D * 8, D * 0.12, 2, D * 6, ['#ff6f91', '#ffd84f', '#5ec8f2', '#8bd96a'][i % 4]);
          break;
        case 'caught':
          for (let i = 0; i < Math.round(30 * burst); i++) this.emit('puff', b.x + (Math.random() - 0.5) * D * 3, b.y + (Math.random() - 0.5) * D * 3, (Math.random() - 0.5) * D * 3, -Math.random() * D * 2, D * (0.6 + Math.random()), 1.4, 0);
          this.shake = 0.6;
          break;
        default: break;
      }
    }
  }

  // ------------------------------------------------------------ drawing

  draw(world, opts = {}) {
    const g = this.g;
    const { W, H, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawSky(g, world);
    if (!world) return;
    const c = this.cam;
    const s = H / c.viewH;
    this.s = s;
    let sx = 0, sy = 0;
    if (this.shake > 0 && !this.reduced) { sx = (Math.random() - 0.5) * this.shake * 12; sy = (Math.random() - 0.5) * this.shake * 12; }
    this.ox = W / 2 - c.x * s + sx;
    this.oy = H / 2 - c.y * s + sy;
    this.drawDeco(g, world);
    this.drawTerrain(g, world);
    this.drawBridges(g, world);
    this.drawFinish(g, world);
    this.drawGates(g, world);
    this.drawItems(g, world);
    this.drawDropped(g, world);
    this.drawBall(g, world, opts.skin || 'snowy', opts.hat || 'none');
    this.drawParticles(g);
    this.drawAvalanche(g, world);
    this.drawSnowfall(g);
    this.drawTexts(g);
    if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`; g.fillRect(0, 0, W, H); }
    if (!opts.attract) this.drawHud(g, world, opts);
  }

  X(x) { return this.ox + x * this.s; }
  Y(y) { return this.oy + y * this.s; }

  drawSky(g, world) {
    const { W, H } = this;
    if (!this.sky) this.bakeSky(world ? world.level.peak : 0);
    g.drawImage(this.sky, 0, 0, W, H);
    const P = this.pal;
    if (this.stars) g.drawImage(this.stars, 0, 0, W, H);
    const camX = this.cam.x * (this.s || 1);
    if (this.aurora) {
      const aw = W * 1.4, off = -((this.time * 12 + camX * 0.01) % aw);
      g.globalAlpha = 0.9;
      for (let x = off; x < W; x += aw - 2) g.drawImage(this.aurora, x, 0, aw, H * 0.5);
      g.globalAlpha = 1;
    }
    const sunR = Math.min(W, H) * (P === SKIES.sunset ? 0.32 : 0.24);
    const sunY = P === SKIES.sunset ? H * 0.5 : H * 0.18;
    g.drawImage(this.sun, W * 0.74 - sunR, sunY - sunR, sunR * 2, sunR * 2);
    // Parallax ridges and trees.
    const layers = [[this.ridges[0], 0.015, H * 0.3, H * 0.42, 1.6], [this.ridges[1], 0.04, H * 0.42, H * 0.36, 1.3], [this.trees, 0.1, H * 0.58, H * 0.26, 0.9]];
    for (const [img, f, y, h, wScale] of layers) {
      const w = h * (img.width / img.height) * wScale;
      let x = -((camX * f) % w);
      if (x > 0) x -= w;
      for (; x < W; x += w) g.drawImage(img, x, y, w + 1, h);
      g.fillStyle = P.near;
    }
    g.fillStyle = this.pal.trees;
    g.fillRect(0, H * 0.84 - 1, W, H * 0.17);
  }

  visibleRange() {
    const x0 = (0 - this.ox) / this.s, x1 = (this.W - this.ox) / this.s;
    return [x0, x1];
  }

  drawDeco(g, world) {
    const T = world.terrain;
    const [x0, x1] = this.visibleRange();
    const u = world.level.u;
    for (const d of T.deco) {
      const size = d.size || d.s * u * 5;
      if (d.x < x0 - size || d.x > x1 + size) continue;
      const gy = T.groundY(d.x);
      if (d.kind === 'tree') {
        const h = size * this.s, w = h * 0.6;
        g.drawImage(this.decoTree, this.X(d.x) - w / 2, this.Y(gy) - h + h * 0.06, w, h);
      } else {
        const h = size * 0.22 * this.s, w = h * 1.55;
        g.drawImage(this.rock, this.X(d.x) - w / 2, this.Y(gy) - h * 0.85, w, h);
      }
    }
  }

  drawTerrain(g, world) {
    const T = world.terrain;
    const P = this.pal;
    const dx = T.dx;
    const [x0, x1] = this.visibleRange();
    const i0 = Math.max(0, Math.floor(x0 / dx) - 2), i1 = Math.min(T.ys.length - 1, Math.ceil(x1 / dx) + 2);
    const step = Math.max(1, Math.floor((i1 - i0) / 420));
    const H = this.H;
    g.beginPath();
    g.moveTo(this.X(i0 * dx), H + 10);
    for (let i = i0; i <= i1; i += step) g.lineTo(this.X(i * dx), this.Y(T.ys[i]));
    g.lineTo(this.X(i1 * dx), this.Y(T.ys[i1]));
    g.lineTo(this.X(i1 * dx), H + 10);
    g.closePath();
    const midY = this.Y(T.groundY(this.cam.x));
    const gr = g.createLinearGradient(0, midY - H * 0.2, 0, midY + H * 0.7);
    gr.addColorStop(0, P.snowBody); gr.addColorStop(1, P.snowDeep);
    g.fillStyle = gr;
    g.fill();
    const D = world.ball.D * this.s;
    // A soft drift band under the surface gives the snow some depth.
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = Math.max(6, D * 0.6);
    g.beginPath();
    for (let i = i0; i <= i1; i += step) g.lineTo(this.X(i * dx), this.Y(T.ys[i]) + D * 0.55);
    g.stroke();
    // Bright rim
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = P.snowTop;
    g.lineWidth = Math.max(3, D * 0.16);
    g.beginPath();
    for (let i = i0; i <= i1; i += step) g.lineTo(this.X(i * dx), this.Y(T.ys[i]) + g.lineWidth * 0.35);
    g.stroke();
    // Ice and powder accents, and the packed track behind the ball.
    const runs = (test, style, width, offset) => {
      g.strokeStyle = style;
      g.lineWidth = width;
      g.beginPath();
      let open = false;
      for (let i = i0; i <= i1; i += step) {
        if (test(i)) {
          const X = this.X(i * dx), Y = this.Y(T.ys[i]) + offset;
          if (!open) { g.moveTo(X, Y); open = true; } else g.lineTo(X, Y);
        } else open = false;
      }
      g.stroke();
    };
    runs((i) => T.snow[i] === 3, 'rgba(170,235,255,0.95)', Math.max(3, D * 0.14), D * 0.05);
    runs((i) => T.snow[i] === 3, 'rgba(255,255,255,0.8)', Math.max(1, D * 0.03), D * 0.02);
    runs((i) => T.snow[i] === 2 && T.fresh[i], '#ffffff', Math.max(4, D * 0.26), -D * 0.02);
    runs((i) => !T.fresh[i] && T.snow[i] !== 3 && T.snow[i] !== 0, P.track, Math.max(2, D * 0.12), D * 0.12);
    // Powder sparkles
    if (!this.reduced) {
      const sp = this.spark;
      const tw = this.time * 3;
      for (let i = i0 - (i0 % 23); i <= i1; i += 23) {
        if (T.snow[i] !== 2 || !T.fresh[i]) continue;
        const a = Math.sin(tw + i * 1.7);
        if (a < 0.4) continue;
        const sz = Math.max(4, D * 0.12) * a;
        g.globalAlpha = a;
        g.drawImage(sp, this.X(i * dx) - sz / 2, this.Y(T.ys[i]) - sz / 2, sz, sz);
      }
      g.globalAlpha = 1;
    }
  }

  drawBridges(g, world) {
    const T = world.terrain;
    const [x0, x1] = this.visibleRange();
    const D = world.ball.D;
    for (const br of T.bridges) {
      if (br.x1 < x0 || br.x0 > x1) continue;
      const th = Math.max(3, br.max * 0.12 * this.s);
      const post = br.max * 0.9;
      const ok = D <= br.max;
      // Posts and the sign
      for (const [x, y] of [[br.x0, br.y0], [br.x1, br.y1]]) {
        g.fillStyle = '#7a4a2a';
        g.fillRect(this.X(x) - th * 0.5, this.Y(y - post), th, post * this.s + th);
      }
      if (!br.broken) {
        g.strokeStyle = '#3a2d4d'; g.lineWidth = th + 3;
        g.beginPath(); g.moveTo(this.X(br.x0), this.Y(br.y0) + th * 0.5); g.lineTo(this.X(br.x1), this.Y(br.y1) + th * 0.5); g.stroke();
        g.strokeStyle = '#b5764a'; g.lineWidth = th;
        g.stroke();
        g.strokeStyle = '#7a4a2a'; g.lineWidth = Math.max(1, th * 0.25);
        const n = Math.max(4, Math.round((br.x1 - br.x0) / (br.max * 0.35)));
        g.beginPath();
        for (let k = 1; k < n; k++) { const u = k / n; const x = br.x0 + (br.x1 - br.x0) * u, y = br.y0 + (br.y1 - br.y0) * u; g.moveTo(this.X(x), this.Y(y)); g.lineTo(this.X(x), this.Y(y) + th); }
        g.stroke();
        // Rope rail
        g.strokeStyle = '#d9b48a'; g.lineWidth = Math.max(1.5, th * 0.3);
        g.beginPath(); g.moveTo(this.X(br.x0), this.Y(br.y0 - post));
        g.quadraticCurveTo(this.X((br.x0 + br.x1) / 2), this.Y((br.y0 + br.y1) / 2 - post * 0.35), this.X(br.x1), this.Y(br.y1 - post)); g.stroke();
      } else {
        // Snapped planks dangle from each post.
        const len = Math.min((br.x1 - br.x0) * 0.22, br.max * 2.2);
        g.lineCap = 'butt';
        for (const [x, y, dir] of [[br.x0, br.y0, 1], [br.x1, br.y1, -1]]) {
          const ex = x + dir * len * 0.35, ey = y + len * 0.93;
          g.strokeStyle = '#3a2d4d'; g.lineWidth = th + 3;
          g.beginPath(); g.moveTo(this.X(x), this.Y(y)); g.lineTo(this.X(ex), this.Y(ey)); g.stroke();
          g.strokeStyle = '#b5764a'; g.lineWidth = th;
          g.stroke();
        }
        g.lineCap = 'round';
      }
      this.sign(g, br.x0 - br.max * 0.2, br.y0 - post * 1.25, `≤ ${formatSize(br.max)}`, ok ? '#5fcf7a' : '#ff9f5a', br.max * 0.32, 'bridge');
    }
  }

  sign(g, x, y, text, color, hWorld, icon) {
    const h = Math.max(16, Math.min(46, hWorld * this.s));
    g.font = `800 ${Math.round(h * 0.58)}px ${FONT}`;
    const tw = g.measureText(text).width;
    const w = tw + h * (icon ? 1.3 : 0.8);
    const X = this.X(x) - w / 2, Y = this.Y(y) - h / 2;
    g.fillStyle = '#3a2d4d';
    roundRect(g, X - 2, Y - 2, w + 4, h + 4, h * 0.35); g.fill();
    g.fillStyle = color;
    roundRect(g, X, Y, w, h, h * 0.3); g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    if (icon) {
      g.beginPath(); g.arc(X + h * 0.5, Y + h * 0.5, h * 0.24, 0, Math.PI * 2); g.fill();
    }
    g.fillText(text, X + (icon ? h * 0.9 : h * 0.4), Y + h * 0.54);
  }

  drawGates(g, world) {
    const T = world.terrain;
    const [x0, x1] = this.visibleRange();
    const D = world.ball.D;
    const wall = iceWallSprite();
    for (const gt of T.gates) {
      if (gt.smashed || gt.x < x0 - gt.min * 4 || gt.x > x1 + gt.min * 4) continue;
      const hgt = Math.max(gt.min * 1.9, D * 2.4);
      const w = Math.max(gt.min * 0.7, D * 0.6);
      const X = this.X(gt.x), base = this.Y(gt.y + D * 0.15);
      const top = this.Y(gt.y - hgt);
      g.drawImage(wall, X - w * 0.25 * this.s, top, w * this.s, base - top);
      const ok = D >= gt.min;
      this.sign(g, gt.x + w * 0.25, gt.y - hgt * 0.55, `${formatSize(gt.min)}+`, ok ? '#5fcf7a' : '#ff9f5a', Math.max(gt.min, D) * 0.42, 'gate');
      // The Snow Pal on top of the wall helps small balls through.
      const pal = itemSprite('snowman', Math.sin(this.time * 4) > 0 ? 1 : 0);
      const ph = Math.max(gt.min, D) * 0.75 * this.s;
      g.drawImage(pal.img, X + w * 0.25 * this.s - ph * pal.w / 2, top - ph * (pal.h - pal.pad) + ph * 0.05, ph * pal.w, ph * pal.h);
    }
  }

  drawFinish(g, world) {
    const T = world.terrain;
    if (!Number.isFinite(T.finishX)) return;
    const [x0, x1] = this.visibleRange();
    const h = world.ball.D * 2.6;
    if (T.finishX < x0 - h || T.finishX > x1 + h) return;
    const xA = T.finishX - h * 0.15, xB = T.finishX + h * 0.6;
    const yA = T.groundY(xA), yB = T.groundY(xB);
    const pw = Math.max(3, h * 0.05 * this.s);
    g.fillStyle = '#e8364a';
    g.fillRect(this.X(xA) - pw / 2, this.Y(yA - h), pw, h * this.s);
    g.fillRect(this.X(xB) - pw / 2, this.Y(yB - h), pw, h * this.s);
    const bh = h * 0.2;
    const bx0 = this.X(xA), bx1 = this.X(xB), by0 = this.Y(yA - h), by1 = this.Y(yB - h);
    const n = 10;
    for (let k = 0; k < n; k++) {
      for (let r = 0; r < 2; r++) {
        g.fillStyle = (k + r) % 2 ? '#26304a' : '#ffffff';
        const xa = bx0 + (bx1 - bx0) * (k / n), xb = bx0 + (bx1 - bx0) * ((k + 1) / n);
        const ya = by0 + (by1 - by0) * (k / n), yb = by0 + (by1 - by0) * ((k + 1) / n);
        const hh = (bh * this.s) / 2;
        g.beginPath(); g.moveTo(xa, ya + r * hh); g.lineTo(xb, yb + r * hh); g.lineTo(xb, yb + (r + 1) * hh); g.lineTo(xa, ya + (r + 1) * hh); g.closePath(); g.fill();
      }
    }
  }

  drawItems(g, world) {
    const T = world.terrain;
    const [x0, x1] = this.visibleRange();
    const D = world.ball.D;
    const items = T.items;
    const t = this.time;
    // Scenery first (behind), then the rest.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = Math.max(0, world.itemLo - 30); i < items.length; i++) {
        const it = items[i];
        if (it.state === 'picked' || it.state === 'gone') continue;
        const half = it.size * it.w;
        if (it.state === 'idle' && it.x - half > x1) break;
        if (it.x + half < x0 || it.x - half > x1) continue;
        const scenery = it.size > D * BUMP_RATIO;
        if ((pass === 0) !== scenery) continue;
        const def = ITEM_BY_ID[it.type];
        const frame = def.waves && Math.sin(t * 3 + it.id) > 0.3 ? 1 : 0;
        const sp = itemSprite(it.type, frame);
        const h = it.size * this.s;
        const w = h * sp.w, hh = h * sp.h;
        if (it.state === 'tumble') {
          g.save();
          g.translate(this.X(it.x), this.Y(it.y - it.size / 2));
          g.rotate(it.rot);
          g.globalAlpha = Math.max(0, Math.min(1, (2.5 - it.t) * 2));
          g.drawImage(sp.img, -w / 2, -hh / 2, w, hh);
          g.restore();
          g.globalAlpha = 1;
          continue;
        }
        let X = this.X(it.x), Y = this.Y(it.y);
        if (it.air) {
          // Floating on a party balloon, bobbing gently.
          const bob = this.reduced ? 0 : Math.sin(t * 2 + it.id) * h * 0.06;
          Y += bob;
          const bimg = this.balloons[it.id % this.balloons.length];
          const bh = Math.max(h * 0.9, 18), bw = bh * 0.8;
          const by = Y - h * 1.02 - bh * 1.35;
          g.strokeStyle = '#3a2d4d'; g.lineWidth = Math.max(1, bh * 0.04);
          g.beginPath(); g.moveTo(X, Y - h * 0.95); g.quadraticCurveTo(X + bw * 0.25, by + bh * 1.1, X, by + bh * 0.84); g.stroke();
          g.drawImage(bimg, X - bw / 2, by, bw, bh);
        }
        if (scenery) g.globalAlpha = 0.92;
        if (it.flip) {
          g.save(); g.translate(X, 0); g.scale(-1, 1);
          g.drawImage(sp.img, -w / 2, Y - hh + h * sp.pad, w, hh);
          g.restore();
        } else g.drawImage(sp.img, X - w / 2, Y - hh + h * sp.pad, w, hh);
        g.globalAlpha = 1;
        // A twinkle over things you can grab.
        if (it.size <= D * PICK_RATIO && !this.reduced) {
          const a = Math.sin(t * 4 + it.id * 1.3);
          if (a > 0.55) {
            const sz = Math.max(6, h * 0.35) * (a - 0.4);
            g.globalAlpha = (a - 0.55) * 2;
            g.drawImage(this.spark, X + w * 0.3 - sz / 2, Y - h - sz / 2, sz, sz);
            g.globalAlpha = 1;
          }
        }
      }
    }
  }

  drawDropped(g, world) {
    for (const it of world.dropped) {
      const sp = itemSprite(it.type);
      const h = it.size * this.s, w = h * sp.w, hh = h * sp.h;
      g.save();
      g.translate(this.X(it.x), this.Y(it.y - it.size / 2));
      g.rotate(it.rot);
      g.globalAlpha = Math.max(0, Math.min(1, (2.5 - it.t) * 2));
      g.drawImage(sp.img, -w / 2, -hh / 2, w, hh);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  drawBall(g, world, skin, hat) {
    const b = world.ball;
    const T = world.terrain;
    const s = this.s;
    const X = this.X(b.x), Y = this.Y(b.y), R = b.r * s;
    if (world.status === 'caught') return;
    // Shadow on the ground
    const gy = T.groundY(b.x);
    const hAbove = Math.max(0, gy - (b.y + b.r));
    const k = Math.max(0.25, 1 - hAbove / (b.D * 3));
    g.fillStyle = 'rgba(40,50,110,0.22)';
    g.beginPath(); g.ellipse(X, this.Y(gy) + R * 0.05, R * 0.9 * k, R * 0.18 * k, 0, 0, Math.PI * 2); g.fill();
    const sq = this.reduced ? 0 : b.squash;
    g.save();
    g.translate(X, Y + R * sq * 0.3);
    g.scale(1 + sq * 0.25, 1 - sq * 0.25);
    g.save();
    g.rotate(b.rot);
    g.drawImage(skinTexture(skin), -R, -R, R * 2, R * 2);
    // Things stuck to the ball
    const st = world.stuck;
    const wave = Math.sin(this.time * 9) > 0 ? 1 : 0;
    const from = Math.max(0, st.length - 45);
    for (let i = from; i < st.length; i++) {
      const it = st[i];
      const rel = it.size / b.D;
      if (rel < 0.07) continue;
      const def = ITEM_BY_ID[it.type];
      const sp = itemSprite(it.type, def.waves ? wave : 0);
      const h = it.size * s;
      // Spread things over the face so the ball looks covered, like a 3D
      // ball seen from the side; the newest ones stick out at the rim.
      const age = st.length - 1 - i;
      const depth = age < 3 ? 1 : 0.5 + 0.5 * (((i * 2654435761) >>> 0) % 1000) / 1000;
      const dist = Math.max(0, (R - h * 0.28) * depth);
      g.save();
      g.rotate(it.ang);
      g.translate(dist, 0);
      g.rotate(Math.PI / 2);
      if (rel < 0.12) g.globalAlpha = (rel - 0.07) / 0.05;
      if (depth < 0.92) g.globalAlpha *= 0.55 + depth * 0.45;
      g.drawImage(sp.img, -h * sp.w / 2, -h * (sp.h - sp.pad) + h * 0.35, h * sp.w, h * sp.h);
      g.globalAlpha = 1;
      g.restore();
    }
    g.restore();
    const shade = ballShade();
    const sk = R / 128;
    g.drawImage(shade, -R - 4 * sk, -R - 4 * sk, shade.width * sk, shade.height * sk);
    if (skin === 'disco' && !this.reduced) {
      for (let i = 0; i < 3; i++) {
        const a = this.time * 1.7 + i * 2.1;
        const sz = R * (0.25 + 0.15 * Math.sin(a * 3));
        g.globalAlpha = 0.5 + 0.5 * Math.sin(a * 2);
        g.drawImage(this.spark, Math.cos(a) * R * 0.6 - sz / 2, Math.sin(a * 1.3) * R * 0.6 - sz / 2, sz, sz);
      }
      g.globalAlpha = 1;
    }
    const hs = hatSprite(hat);
    if (hs) {
      const k2 = R / hs.unit;
      g.drawImage(hs.img, -hs.ax * k2, -R * 0.9 - hs.ay * k2, hs.img.width * k2, hs.img.height * k2);
      if (hat === 'propeller') propellerBlades(g, 0, -R * 0.9 - 112 * k2, k2, this.time);
    }
    g.restore();
  }

  drawParticles(g) {
    for (const p of this.particles) {
      const a = Math.min(1, p.life / p.max * 1.5);
      const X = this.X(p.x), Y = this.Y(p.y), S = Math.max(1.5, p.size * this.s);
      if (p.kind === 'snow') {
        g.globalAlpha = a; g.fillStyle = '#fff';
        g.beginPath(); g.arc(X, Y, S, 0, Math.PI * 2); g.fill();
      } else if (p.kind === 'spark') {
        g.globalAlpha = a; g.drawImage(this.spark, X - S, Y - S, S * 2, S * 2);
      } else if (p.kind === 'balloon') {
        g.globalAlpha = a; const b0 = this.balloons[0]; g.drawImage(b0, X - S * 0.8, Y - S, S * 1.6, S * 2);
      } else if (p.kind === 'puff') {
        g.globalAlpha = a * 0.8; const r = S * (1.6 - p.life / p.max * 0.6); g.drawImage(this.puff, X - r, Y - r, r * 2, r * 2);
      } else {
        g.globalAlpha = a;
        g.save(); g.translate(X, Y); g.rotate(p.rot);
        g.fillStyle = p.color;
        if (p.kind === 'plank') g.fillRect(-S, -S * 0.25, S * 2, S * 0.5);
        else if (p.kind === 'confetti') g.fillRect(-S * 0.6, -S * 0.3, S * 1.2, S * 0.6);
        else { g.beginPath(); g.moveTo(0, -S); g.lineTo(S * 0.7, S * 0.6); g.lineTo(-S * 0.7, S * 0.4); g.closePath(); g.fill(); }
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }

  drawAvalanche(g, world) {
    const a = world.avalanche;
    if (!a) return;
    const b = world.ball;
    const T = world.terrain;
    const img = cloudSprite();
    const h = b.D * 8 * this.s;
    const w = h * (img.width / img.height);
    const bob = this.reduced ? 0 : Math.sin(this.time * 3) * h * 0.015;
    const front = a.x + b.D * 1.1;
    const right = this.X(front);
    if (right < -w * 0.05) return;
    // Sit the cloud so its face is level with the ball and its puffs bury the slope.
    const bottom = this.Y(T.groundY(front - b.D)) + h * 0.22;
    g.drawImage(img, right - w, bottom - h + bob, w, h);
    if (right - w * 0.75 > 0) g.drawImage(img, right - w * 1.7, bottom - h * 1.05 - bob, w, h);
  }

  drawSnowfall(g) {
    const { W, H } = this;
    const dt = 1 / 60;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    const dxCam = this.lastCamX == null ? 0 : (this.cam.x - this.lastCamX) * this.s;
    const dyCam = this.lastCamY == null ? 0 : (this.cam.y - this.lastCamY) * this.s;
    this.lastCamX = this.cam.x; this.lastCamY = this.cam.y;
    for (const f of this.flakes) {
      f.y += (20 + f.s * 30) * dt - dyCam * 0.3 * f.s;
      f.x += Math.sin(this.time + f.p) * 0.3 - dxCam * 0.3 * f.s;
      if (f.y > H + 5) f.y -= H + 10; else if (f.y < -5) f.y += H + 10;
      if (f.x < -5) f.x += W + 10; else if (f.x > W + 5) f.x -= W + 10;
      g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
    }
  }

  drawTexts(g) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = 1 - t.life / t.max;
      const px = Math.round(26 * this.ui * t.size);
      g.font = `900 ${px}px ${FONT}`;
      const wx = t.follow ? t.follow.x + t.ox : t.x, wy = t.follow ? t.follow.y + t.oy : t.y;
      const X = Math.max(px * 3, Math.min(this.W - px * 3, this.X(wx))), Y = Math.max(px * 5, this.Y(wy) - k * 40 * this.ui);
      g.globalAlpha = Math.min(1, t.life / t.max * 3);
      g.lineWidth = Math.max(3, px * 0.18);
      g.strokeStyle = '#3a2d4d';
      g.strokeText(t.text, X, Y);
      g.fillStyle = t.color;
      g.fillText(t.text, X, Y);
    }
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------ HUD

  drawHud(g, world, opts) {
    const { W, H } = this;
    const u = this.ui;
    const b = world.ball;
    const goals = world.level.goals;
    const checks = world.starChecks();
    const pad = 14 * u;
    const safeTop = Math.max(pad, 10);
    // Panel
    const pw = 236 * u, ph = (world.endless ? 92 : 112) * u;
    g.fillStyle = 'rgba(30,24,60,0.55)';
    roundRect(g, pad, safeTop, pw, ph, 16 * u); g.fill();
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.font = `900 ${Math.round(30 * u)}px ${FONT}`;
    g.fillText(formatSize(b.D), pad + 46 * u, safeTop + 26 * u);
    g.drawImage(skinTexture(opts.skin || 'snowy'), pad + 12 * u, safeTop + 12 * u, 28 * u, 28 * u);
    const shade = ballShade();
    g.drawImage(shade, pad + 11 * u, safeTop + 11 * u, 30 * u, 30 * u);
    g.font = `800 ${Math.round(15 * u)}px ${FONT}`;
    const line = (y, text, star, done) => {
      g.fillStyle = '#e8e6ff';
      g.fillText(text, pad + 14 * u, y);
      if (star != null) {
        g.textAlign = 'right';
        g.fillStyle = done ? '#ffd84f' : 'rgba(255,255,255,0.55)';
        g.fillText(`${done ? '★' : '☆'} ${star}`, pad + pw - 12 * u, y);
        g.textAlign = 'left';
      }
    };
    if (goals) {
      const frac = Math.min(1, b.D / goals.size);
      const barW = pw - 110 * u;
      g.fillStyle = 'rgba(255,255,255,0.18)'; roundRect(g, pad + 14 * u, safeTop + 47 * u, barW, 8 * u, 4 * u); g.fill();
      g.fillStyle = checks[0] ? '#ffd84f' : '#8ff6ff'; roundRect(g, pad + 14 * u, safeTop + 47 * u, Math.max(8 * u, barW * frac), 8 * u, 4 * u); g.fill();
      g.fillStyle = checks[0] ? '#ffd84f' : 'rgba(255,255,255,0.55)';
      g.textAlign = 'right'; g.font = `800 ${Math.round(15 * u)}px ${FONT}`;
      g.fillText(`${checks[0] ? '★' : '☆'} ${formatSize(goals.size)}`, pad + pw - 12 * u, safeTop + 51 * u);
      g.textAlign = 'left'; g.font = `800 ${Math.round(15 * u)}px ${FONT}`;
      line(safeTop + 72 * u, things(world.collected), goals.items, checks[1]);
      const tLeft = world.time <= goals.time;
      line(safeTop + 94 * u, clock(world.finishTime ?? world.time), clock(goals.time), tLeft);
    } else if (world.endless) {
      line(safeTop + 60 * u, `${Math.floor(world.distance / 100)} m rolled`, opts.best ? `best ${opts.best} m` : null, world.distance / 100 > (opts.best || 0));
      line(safeTop + 80 * u, things(world.collected), null);
    } else {
      line(safeTop + 62 * u, things(world.collected), null);
      line(safeTop + 84 * u, clock(world.time), null);
    }
    // Course progress along the bottom.
    if (!world.endless) {
      const T = world.terrain;
      const x0 = world.startX0(), span = T.finishX - x0;
      const bx = 20 * u + pad, bw = W - bx * 2, by = H - 26 * u - Math.max(0, opts.safeBottom || 0);
      g.fillStyle = 'rgba(30,24,60,0.45)'; roundRect(g, bx - 8 * u, by - 12 * u, bw + 16 * u, 24 * u, 12 * u); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; roundRect(g, bx, by - 3 * u, bw, 6 * u, 3 * u); g.fill();
      const at = (x) => bx + bw * Math.max(0, Math.min(1, (x - x0) / span));
      for (const gt of T.gates) { g.fillStyle = gt.smashed ? 'rgba(160,215,255,0.5)' : '#a0d7ff'; g.fillRect(at(gt.x) - 2 * u, by - 8 * u, 4 * u, 16 * u); }
      for (const br of T.bridges) { g.fillStyle = br.broken ? 'rgba(181,118,74,0.5)' : '#d9a06a'; g.fillRect(at(br.x0), by - 2 * u, at(br.x1) - at(br.x0), 4 * u); }
      g.fillStyle = '#ffd84f'; g.font = `900 ${Math.round(16 * u)}px ${FONT}`; g.textAlign = 'center';
      g.fillText('⚑', bx + bw, by - 1 * u);
      if (world.avalanche && world.avalanche.delay <= 0) {
        const ax = at(world.avalanche.x);
        g.fillStyle = '#eef4ff'; g.beginPath(); g.arc(ax, by, 8 * u, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#7f9ad6'; g.lineWidth = 2; g.stroke();
      }
      const px = at(b.x);
      g.drawImage(skinTexture(opts.skin || 'snowy'), px - 9 * u, by - 9 * u, 18 * u, 18 * u);
      g.strokeStyle = '#3a2d4d'; g.lineWidth = 2; g.beginPath(); g.arc(px, by, 9 * u, 0, Math.PI * 2); g.stroke();
    }
    // Avalanche warning
    const av = world.avalanche;
    if (av && av.delay <= 0 && av.gap < 7 && world.status === 'play') {
      const k = Math.max(0, Math.min(1, 1.15 - av.gap / 7));
      g.globalAlpha = k;
      g.drawImage(this.warnEdge, 0, 0, 140 * u, H);
      g.globalAlpha = 1;
      if (av.gap < 4) {
        g.textAlign = 'left';
        g.font = `900 ${Math.round(20 * u)}px ${FONT}`;
        g.lineWidth = 5; g.strokeStyle = '#3a2d4d';
        const y = safeTop + ph + 26 * u;
        const pulse = this.reduced ? 1 : 0.75 + 0.25 * Math.sin(this.time * 10);
        g.globalAlpha = pulse;
        g.strokeText('Snow Cloud! Speed up ▶', pad, y);
        g.fillStyle = '#bfe0ff'; g.fillText('Snow Cloud! Speed up ▶', pad, y);
        g.globalAlpha = 1;
      }
    }
    // Touch hints
    if (opts.touch && this.hint > 0 && world.status === 'play') {
      const a = Math.min(1, this.hint / 1.5);
      g.globalAlpha = a * 0.9;
      g.font = `900 ${Math.round(18 * u)}px ${FONT}`;
      g.textAlign = 'center';
      const y = H * 0.72;
      g.fillStyle = 'rgba(30,24,60,0.45)';
      roundRect(g, W * 0.04, y - 26 * u, W * 0.42, 52 * u, 16 * u); g.fill();
      roundRect(g, W * 0.54, y - 26 * u, W * 0.42, 52 * u, 16 * u); g.fill();
      const tw = g.measureText('Tap anywhere to jump').width + 36 * u;
      roundRect(g, W / 2 - tw / 2, y - 74 * u, tw, 44 * u, 14 * u); g.fill();
      g.fillStyle = '#fff';
      g.fillText('◀ Hold: brake', W * 0.25, y);
      g.fillText('Hold: speed ▶', W * 0.75, y);
      g.fillText('Tap anywhere to jump', W / 2, y - 52 * u);
      g.globalAlpha = 1;
    }
    if (opts.banner) {
      g.textAlign = 'center';
      g.font = `900 ${Math.round(46 * u)}px ${FONT}`;
      g.lineWidth = 8; g.strokeStyle = '#3a2d4d';
      g.strokeText(opts.banner, W / 2, H * 0.36);
      g.fillStyle = '#fff'; g.fillText(opts.banner, W / 2, H * 0.36);
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export const things = (n) => `${n} thing${n === 1 ? '' : 's'}`;

export function clock(t) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
