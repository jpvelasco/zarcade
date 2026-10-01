// Canvas renderer. Reads the Trip and never changes it.
//
// Static art (sky, far shore, the underwater cut-away with its bottom, the
// dock or boat, fish sprites) is baked into offscreen canvases when a scene
// starts, spread over a few frames. Each frame then draws those images plus
// a few cheap animated layers: waves, shimmer, light rays, reeds, weather,
// fireflies, birds, ripples, splashes, the line, the angler and the HUD.
import { SPAN } from './trip.js';
import { BAITS } from './gear.js';
import { bakeFish, pixelLength, shade } from './fishart.js';
import { readout, DANGER } from './fight.js';
import { mulberry32, hashSeed, clamp } from './rng.js';

const SKY = {
  dawn: ['#6c7fd8', '#f6a7b9', '#ffd9a0'],
  day: ['#3f9fec', '#86cdfa', '#d9f3ff'],
  dusk: ['#36367f', '#dd6489', '#ffb36a'],
  night: ['#060b24', '#121c4e', '#24336b'],
};
const WATER_COL = {
  pond: ['#56b49a', '#23665e', '#0e3236'],
  river: ['#55acd9', '#1f6593', '#0b2e4f'],
  coral: ['#45e3dc', '#1794bb', '#0a3c72'],
  frozen: ['#6a98c4', '#2a5486', '#0d2247'],
  lagoon: ['#4a44b8', '#20206e', '#0a0a32'],
};
const BOTTOM_COL = { pond: ['#b89a62', '#6a5636'], river: ['#a89a80', '#5e5648'], coral: ['#f6e4b4', '#d0b886'], frozen: ['#7a8494', '#3e4454'], lagoon: ['#4a3f8a', '#221a50'] };
const PERIOD_TINT = { dawn: ['#6a4a8a', 0.12], day: ['#000000', 0], dusk: ['#5a2a5a', 0.22], night: ['#030818', 0.55] };
const WEATHER_TINT = { clear: ['#000000', 0], cloudy: ['#7a8898', 0.3], rain: ['#56606e', 0.45], fog: ['#d0d8e2', 0.45], snow: ['#c8d4e4', 0.32], meteor: ['#2a1a5a', 0.15] };
const BOBBER_BAITS = new Set(['worm', 'cricket', 'dough', 'shrimp', 'waxworm', 'glowbead']);
const BAIT_COLOR = Object.fromEntries(BAITS.map((b) => [b.id, b.color]));

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function tint(hex, period, weather) {
  const [pc, pt] = PERIOD_TINT[period];
  const [wc, wt] = WEATHER_TINT[weather] || WEATHER_TINT.clear;
  return mix(mix(hex, pc, pt), wc, wt * (period === 'night' ? 0.4 : 1));
}
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export class Renderer {
  constructor(el, { reducedMotion = false } = {}) {
    this.el = el;
    this.ctx = el.getContext('2d');
    this.reduced = reducedMotion;
    this.time = 0;
    this.camX = 0;
    this.sprites = new Map();
    this.particles = [];
    this.ripples = [];
    this.texts = [];
    this.shake = 0;
    this.scene = null;
    this.layers = null;
    this.bakeQueue = [];
    this.flash = 0;
    this.castAnim = 0;
    this.landAnim = null;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.el.width = Math.round(this.W * dpr);
    this.el.height = Math.round(this.H * dpr);
    this.portrait = this.H > this.W;
    this.surfaceY = Math.round(this.H * (this.portrait ? 0.34 : 0.4));
    this.shoreX = Math.round(clamp(this.W * 0.15, 64, 200));
    this.pxX = Math.max((this.W - this.shoreX - 12) / SPAN, 11);
    this.span = (this.W - this.shoreX) / this.pxX;
    this.pxUp = clamp(this.H * 0.045, 18, 34);
    this.k = clamp(Math.min(this.W / 1300, this.H / 800), 0.62, 1.15);
    if (this.scene) this.setScene(this.scene.trip, true);
  }

  // ------------------------------------------------------------ coordinates

  get pxY() { return (this.H - this.surfaceY - 16) / this.scene.water.maxDepth; }
  sx(x) { return this.shoreX + (x - this.camX) * this.pxX; }
  sy(y) { return y >= 0 ? this.surfaceY + y * this.pxY : this.surfaceY + y * this.pxUp; }
  worldX(clientX) { return (clientX - this.shoreX) / this.pxX + this.camX; }

  // ------------------------------------------------------------ scenes

  setScene(trip, keepCamera = false) {
    const water = trip.water;
    const same = this.scene && this.scene.water === water && this.scene.period === trip.period && this.scene.weather === trip.weather && keepCamera !== true;
    this.scene = { trip, water, period: trip.period, weather: trip.weather, seed: hashSeed(water.id, trip.period, trip.weather) };
    if (same && this.layers) return;
    if (!keepCamera) this.camX = 0;
    this.layers = { sky: null, under: null, shore: null, fog: null };
    this.particles.length = 0;
    this.ripples.length = 0;
    this.initWeather();
    const tasks = [() => this.bakeSky(), () => this.bakeUnder(), () => this.bakeShore(), () => this.bakeExtras()];
    for (const f of trip.table.map((e) => e.fish)) tasks.push(() => this.sprite(f));
    this.bakeQueue = tasks;
    this.bakeStep(); // the sky first so something shows at once
  }

  // Bake a little per frame so no frame takes long.
  bakeStep(budgetMs = 10) {
    const t0 = performance.now();
    while (this.bakeQueue.length && performance.now() - t0 < budgetMs) this.bakeQueue.shift()();
  }

  get ready() { return !!(this.layers && this.layers.sky && this.layers.under && this.layers.shore); }

  sprite(fish) {
    let s = this.sprites.get(fish.id);
    if (!s) {
      s = bakeFish(fish.look, 120, { scale: this.dpr * 1.25 });
      this.sprites.set(fish.id, s);
    }
    return s;
  }

  bakeSky() {
    const { W, surfaceY, dpr } = this;
    const { period, weather, water } = this.scene;
    const c = canvas(W * dpr, (surfaceY + 4) * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const h = surfaceY + 4;
    const cols = SKY[period].map((s) => mix(s, (WEATHER_TINT[weather] || WEATHER_TINT.clear)[0], (WEATHER_TINT[weather] || WEATHER_TINT.clear)[1]));
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, cols[0]);
    grd.addColorStop(0.6, cols[1]);
    grd.addColorStop(1, cols[2]);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, h);
    const rng = mulberry32(this.scene.seed);
    // Stars and moon, or the sun.
    if (period === 'night' || weather === 'meteor') {
      const n = water.id === 'lagoon' ? 220 : 140;
      for (let i = 0; i < n; i++) {
        g.fillStyle = `rgba(255,255,${200 + ((rng() * 55) | 0)},${(0.35 + rng() * 0.6).toFixed(2)})`;
        const r = rng() < 0.08 ? 1.6 : 0.9;
        g.beginPath(); g.arc(rng() * W, rng() * h * 0.8, r, 0, 7); g.fill();
      }
      if (water.id === 'lagoon') {
        // milky way band
        g.save();
        g.translate(W * 0.5, h * 0.4);
        g.rotate(-0.35);
        const mw = g.createLinearGradient(0, -60, 0, 60);
        mw.addColorStop(0, 'rgba(180,150,255,0)');
        mw.addColorStop(0.5, 'rgba(200,170,255,0.22)');
        mw.addColorStop(1, 'rgba(180,150,255,0)');
        g.fillStyle = mw;
        g.fillRect(-W, -60, W * 2, 120);
        g.restore();
      }
      if (period === 'night') this.drawMoon(g, W * 0.78, h * 0.22, Math.max(18, h * 0.07));
      if (water.id === 'frozen' && period === 'night') this.drawAurora(g, W, h);
    } else if (weather !== 'rain' && weather !== 'fog') {
      const sunY = period === 'day' ? h * 0.2 : h * 0.62;
      const sunX = period === 'dawn' ? W * 0.22 : period === 'dusk' ? W * 0.74 : W * 0.7;
      const r = Math.max(24, h * 0.08);
      const sg = g.createRadialGradient(sunX, sunY, r * 0.5, sunX, sunY, r * 4);
      sg.addColorStop(0, period === 'day' ? 'rgba(255,250,210,0.8)' : 'rgba(255,200,140,0.8)');
      sg.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = sg;
      g.fillRect(sunX - r * 4, sunY - r * 4, r * 8, r * 8);
      g.fillStyle = period === 'day' ? '#fff6c8' : '#ffd08a';
      g.beginPath(); g.arc(sunX, sunY, r, 0, 7); g.fill();
    }
    this.drawFarShore(g, W, h, rng);
    this.layers.sky = c;
  }

  drawMoon(g, x, y, r) {
    const mg = g.createRadialGradient(x, y, r * 0.6, x, y, r * 3.5);
    mg.addColorStop(0, 'rgba(220,230,255,0.35)');
    mg.addColorStop(1, 'rgba(220,230,255,0)');
    g.fillStyle = mg;
    g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    g.fillStyle = '#f4f2e0';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = 'rgba(180,180,170,0.35)';
    for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [-0.05, 0.4, 0.12]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r, rr * r, 0, 7); g.fill(); }
  }

  drawAurora(g, W, h) {
    g.save();
    for (let k = 0; k < 3; k++) {
      const ag = g.createLinearGradient(0, h * 0.05, 0, h * 0.55);
      const col = ['80,255,190', '90,200,255', '190,120,255'][k];
      ag.addColorStop(0, `rgba(${col},0)`);
      ag.addColorStop(0.5, `rgba(${col},0.28)`);
      ag.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = ag;
      g.beginPath();
      g.moveTo(0, h * (0.2 + k * 0.08));
      for (let x = 0; x <= W; x += 40) g.lineTo(x, h * (0.18 + k * 0.08) + Math.sin(x * 0.006 + k * 2) * h * 0.08);
      for (let x = W; x >= 0; x -= 40) g.lineTo(x, h * (0.48 + k * 0.05) + Math.sin(x * 0.005 + k) * h * 0.06);
      g.fill();
    }
    g.restore();
  }

  drawFarShore(g, W, h, rng) {
    const { period, weather, water } = this.scene;
    const far = tint({ pond: '#4f8a5a', river: '#3f6a5a', coral: '#5aa080', frozen: '#c8d8ea', lagoon: '#2a2060' }[water.id], period, weather);
    const near = tint({ pond: '#3a7046', river: '#2f5a44', coral: '#e8d6a0', frozen: '#e8f2fa', lagoon: '#1a1448' }[water.id], period, weather);
    const base = h - 2;
    if (water.id === 'river' || water.id === 'frozen') {
      // mountains
      g.fillStyle = tint(water.id === 'frozen' ? '#9ab0cc' : '#6a7f9a', period, weather);
      g.beginPath(); g.moveTo(0, base);
      for (let x = 0; x <= W + 60; x += 60) g.lineTo(x, base - h * (0.22 + 0.18 * Math.abs(Math.sin(x * 0.0041 + 1.3)) + 0.08 * rng()));
      g.lineTo(W, base); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      for (let x = 30; x <= W; x += 60) {
        const y = base - h * (0.22 + 0.18 * Math.abs(Math.sin(x * 0.0041 + 1.3)));
        g.beginPath(); g.moveTo(x - 14, y + 16); g.lineTo(x, y + 2); g.lineTo(x + 14, y + 16); g.fill();
      }
    }
    if (water.id === 'coral') {
      // sea horizon with an island
      g.fillStyle = tint('#3ab8d0', period, weather);
      g.fillRect(0, base - h * 0.08, W, h * 0.08 + 2);
      const ix = W * 0.62, iy = base - h * 0.08;
      g.fillStyle = far;
      g.beginPath(); g.ellipse(ix, iy, W * 0.08, h * 0.05, 0, Math.PI, 0); g.fill();
      g.strokeStyle = tint('#6a4a2a', period, weather);
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(ix, iy - h * 0.04); g.quadraticCurveTo(ix + 6, iy - h * 0.12, ix + 14, iy - h * 0.18); g.stroke();
      g.fillStyle = tint('#3a9a4a', period, weather);
      for (let i = 0; i < 5; i++) { const a = -2.6 + i * 0.6; g.beginPath(); g.ellipse(ix + 14 + Math.cos(a) * 16, iy - h * 0.18 + Math.sin(a) * 8 + 6, 18, 5, a, 0, 7); g.fill(); }
      return;
    }
    // rolling hills / far bank
    g.fillStyle = far;
    g.beginPath(); g.moveTo(0, base);
    for (let x = 0; x <= W + 40; x += 40) g.lineTo(x, base - h * (0.12 + 0.06 * Math.sin(x * 0.007 + 2)));
    g.lineTo(W, base); g.fill();
    // trees
    const trees = water.id === 'lagoon' ? 0 : Math.floor(W / 28);
    for (let i = 0; i < trees; i++) {
      const x = rng() * W, s = (0.6 + rng() * 0.6) * h * 0.09;
      const y = base - h * (0.1 + 0.05 * Math.sin(x * 0.007 + 2));
      if (water.id === 'pond' && i % 4 === 0) {
        // willow
        g.fillStyle = shade(far, -0.15);
        g.beginPath(); g.ellipse(x, y - s * 1.2, s * 1.1, s * 1.2, 0, 0, 7); g.fill();
        g.strokeStyle = shade(far, -0.2);
        g.lineWidth = 1.5;
        for (let j = -4; j <= 4; j++) { g.beginPath(); g.moveTo(x + j * s * 0.22, y - s * 1.4); g.quadraticCurveTo(x + j * s * 0.3, y - s * 0.6, x + j * s * 0.32, y); g.stroke(); }
      } else {
        g.fillStyle = shade(far, -0.12 - rng() * 0.1);
        g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x + s * 0.6, y); g.lineTo(x - s * 0.6, y); g.fill();
        if (water.id === 'frozen') { g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x + s * 0.25, y - s * 1.2); g.lineTo(x - s * 0.25, y - s * 1.2); g.fill(); }
      }
    }
    if (water.id === 'lagoon') {
      // crystal spires glowing on far islands
      for (let i = 0; i < 9; i++) {
        const x = rng() * W, s = 10 + rng() * 26;
        g.fillStyle = mix('#c58aff', '#5ef2ff', rng());
        g.globalAlpha = 0.7;
        g.beginPath(); g.moveTo(x, base - h * 0.1 - s * 2); g.lineTo(x + s * 0.35, base - h * 0.08); g.lineTo(x - s * 0.35, base - h * 0.08); g.fill();
        g.globalAlpha = 1;
      }
    }
    g.fillStyle = near;
    g.beginPath(); g.moveTo(0, base);
    for (let x = 0; x <= W + 30; x += 30) g.lineTo(x, base - h * (0.04 + 0.02 * Math.sin(x * 0.013)));
    g.lineTo(W, base); g.fill();
  }

  bakeUnder() {
    const { dpr, shoreX, pxX, H, surfaceY } = this;
    const { water, period, weather } = this.scene;
    const wPx = shoreX + (SPAN + 10) * pxX;
    const hPx = H - surfaceY + 2;
    const c = canvas(wPx * dpr, hPx * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const ox = shoreX; // world x = 0
    const pxY = this.pxY;
    const cols = WATER_COL[water.id].map((s) => tint(s, period, weather));
    const grd = g.createLinearGradient(0, 0, 0, hPx);
    grd.addColorStop(0, cols[0]);
    grd.addColorStop(0.35, cols[1]);
    grd.addColorStop(1, cols[2]);
    g.fillStyle = grd;
    g.fillRect(0, 0, wPx, hPx);
    const rng = mulberry32(this.scene.seed + 7);
    // Bottom.
    const bc = BOTTOM_COL[water.id].map((s) => tint(s, period, weather));
    const yAt = (x) => this.scene.trip.bottom(x) * pxY;
    g.beginPath();
    g.moveTo(0, hPx);
    g.lineTo(0, yAt(0) * 0.2);
    for (let x = 0; x <= SPAN + 10; x += 0.5) g.lineTo(ox + x * pxX, yAt(x));
    g.lineTo(wPx, hPx);
    g.closePath();
    const bg = g.createLinearGradient(0, pxY * water.minDepth, 0, hPx);
    bg.addColorStop(0, bc[0]);
    bg.addColorStop(1, bc[1]);
    g.fillStyle = bg;
    g.fill();
    // A lighter sandy rim along the bottom, and tufts.
    g.strokeStyle = shade(bc[0], 0.25);
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= SPAN + 10; x += 0.5) { const X = ox + x * pxX, Y = yAt(x) + 1.5; if (x === 0) g.moveTo(X, Y); else g.lineTo(X, Y); }
    g.stroke();
    // Bank below the shore.
    const bankG = g.createLinearGradient(0, 0, 0, hPx);
    bankG.addColorStop(0, tint('#7a5a3a', period, weather));
    bankG.addColorStop(1, tint('#3e2c1e', period, weather));
    g.fillStyle = bankG;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(ox + 4, 0); g.quadraticCurveTo(ox - 6, yAt(0) * 0.6, ox + pxX * 1.5, yAt(1.5)); g.lineTo(ox + pxX * 1.5, hPx); g.lineTo(0, hPx); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 30; i++) { g.beginPath(); g.ellipse(rng() * ox, rng() * hPx, 3 + rng() * 8, 2 + rng() * 4, 0, 0, 7); g.fill(); }
    // Pebbles.
    for (let i = 0; i < 140; i++) {
      const x = rng() * (SPAN + 10);
      const y = yAt(x) + 3 + rng() * 26;
      g.fillStyle = shade(bc[0], (rng() - 0.6) * 0.5);
      g.beginPath(); g.ellipse(ox + x * pxX, y, 2 + rng() * 5, 1.5 + rng() * 2.5, 0, 0, 7); g.fill();
    }
    // Decorations per water.
    const deco = (n, fn) => { for (let i = 0; i < n; i++) { const x = 2 + rng() * (SPAN + 6); fn(ox + x * pxX, yAt(x), rng); } };
    if (water.id === 'pond' || water.id === 'river') {
      deco(water.id === 'pond' ? 26 : 12, (x, y, r) => {
        g.strokeStyle = tint(r() < 0.5 ? '#3a8a4a' : '#5aa05a', period, weather);
        g.lineWidth = 2;
        const hgt = 20 + r() * 50;
        g.beginPath(); g.moveTo(x, y + 2); g.quadraticCurveTo(x + 8, y - hgt * 0.5, x + (r() - 0.5) * 16, y - hgt); g.stroke();
      });
      deco(10, (x, y, r) => { g.fillStyle = tint('#6a6a70', period, weather); g.beginPath(); g.ellipse(x, y + 2, 8 + r() * 14, 6 + r() * 6, 0, Math.PI, 0); g.fill(); });
    } else if (water.id === 'coral') {
      const corals = ['#ff6fb0', '#ffa04a', '#b07aff', '#ff5a6a', '#ffe04a', '#4ae0c0'];
      deco(34, (x, y, r) => {
        const col = tint(corals[(r() * corals.length) | 0], period, weather);
        const kind = (r() * 3) | 0;
        g.fillStyle = col;
        g.strokeStyle = col;
        if (kind === 0) {
          g.lineWidth = 4;
          const branch = (bx, by, len, a, d) => {
            const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
            g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
            if (d > 0) { branch(ex, ey, len * 0.7, a - 0.5, d - 1); branch(ex, ey, len * 0.7, a + 0.5, d - 1); }
          };
          branch(x, y + 3, 14 + r() * 10, -Math.PI / 2, 2);
        } else if (kind === 1) {
          g.beginPath(); g.ellipse(x, y + 2, 14 + r() * 10, 10 + r() * 8, 0, Math.PI, 0); g.fill();
          g.strokeStyle = shade(col, -0.3); g.lineWidth = 1.2;
          for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x, y + 2, 4 + k * 4, Math.PI, 0); g.stroke(); }
        } else {
          g.globalAlpha = 0.85;
          g.beginPath(); g.moveTo(x, y + 2); g.quadraticCurveTo(x - 24, y - 30, x - 4, y - 44); g.quadraticCurveTo(x + 20, y - 30, x, y + 2); g.fill();
          g.globalAlpha = 1;
        }
      });
    } else if (water.id === 'lagoon') {
      deco(22, (x, y, r) => {
        const col = r() < 0.5 ? '#5ef2ff' : '#c58aff';
        const s = 8 + r() * 18;
        const gl = g.createRadialGradient(x, y - s, 2, x, y - s, s * 2.4);
        gl.addColorStop(0, col);
        gl.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.35;
        g.fillStyle = gl;
        g.fillRect(x - s * 2.4, y - s * 3.4, s * 4.8, s * 4.8);
        g.globalAlpha = 0.9;
        g.fillStyle = col;
        g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x + s * 0.4, y + 2); g.lineTo(x - s * 0.4, y + 2); g.fill();
        g.globalAlpha = 1;
      });
    } else if (water.id === 'frozen') {
      deco(12, (x, y, r) => { g.fillStyle = tint('#4a5060', period, weather); g.beginPath(); g.ellipse(x, y + 2, 10 + r() * 16, 8 + r() * 6, 0, Math.PI, 0); g.fill(); });
    }
    // Ice sheet with a fishing hole.
    if (water.ice) {
      const iceH = 0.7 * pxY + 6;
      const hole = ox + water.holeX * pxX;
      const ig = g.createLinearGradient(0, 0, 0, iceH);
      ig.addColorStop(0, '#f4fbff');
      ig.addColorStop(1, '#a8d4f0');
      g.fillStyle = ig;
      g.fillRect(0, 0, hole - 14, iceH);
      g.fillRect(hole + 14, 0, wPx - hole, iceH);
      g.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 40; i++) { const x = rng() * wPx; if (Math.abs(x - hole) > 20) g.fillRect(x, 2 + rng() * (iceH - 6), 10 + rng() * 30, 1.5); }
      g.strokeStyle = 'rgba(120,170,210,0.7)';
      g.lineWidth = 1;
      for (let i = 0; i < 14; i++) { const x = rng() * wPx; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 12, iceH * 0.5); g.lineTo(x + 4, iceH); g.stroke(); }
    }
    this.layers.under = c;
    this.layers.underW = wPx;
    this.layers.underH = hPx;
  }

  bakeShore() {
    const { dpr, shoreX, surfaceY, pxX } = this;
    const { water, period, weather } = this.scene;
    const w = shoreX + 3.2 * pxX + 40;
    const h = surfaceY + 30;
    const c = canvas(w * dpr, h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const x0 = shoreX; // world x = 0
    const sy = surfaceY;
    const T = (s) => tint(s, period, weather);
    // Bank
    const bank = { pond: '#5aa04a', river: '#7a7a6a', coral: '#f0dca0', frozen: '#f2f8ff', lagoon: '#3a2f7a' }[water.id];
    g.fillStyle = T(bank);
    g.beginPath(); g.moveTo(0, sy - 40); g.quadraticCurveTo(x0 * 0.6, sy - 46, x0 + 6, sy - 6); g.lineTo(x0 + 10, sy + 30); g.lineTo(0, sy + 30); g.fill();
    g.fillStyle = T(mix(bank, '#000000', 0.25));
    g.beginPath(); g.moveTo(0, sy - 14); g.quadraticCurveTo(x0 * 0.7, sy - 16, x0 + 8, sy + 2); g.lineTo(x0 + 10, sy + 30); g.lineTo(0, sy + 30); g.fill();
    if (water.id === 'river') {
      for (let i = 0; i < 6; i++) { g.fillStyle = T(i % 2 ? '#8a8a80' : '#6a6a64'); g.beginPath(); g.ellipse(x0 * (0.2 + i * 0.15), sy - 30 + i * 4, 20, 12, 0, 0, 7); g.fill(); }
    }
    if (water.id === 'pond' || water.id === 'lagoon') {
      // a wooden dock out over the water
      g.fillStyle = T(water.id === 'lagoon' ? '#5a4a8a' : '#a0703a');
      g.fillRect(x0 - 40, sy - 0.9 * this.pxUp - 8, 40 + 2.6 * pxX, 8);
      g.fillStyle = T(water.id === 'lagoon' ? '#3a2f6a' : '#704a22');
      for (let i = 0; i < 4; i++) g.fillRect(x0 - 30 + i * (2.6 * pxX + 30) / 3, sy - 0.9 * this.pxUp, 5, 0.9 * this.pxUp + 24);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let x = x0 - 36; x < x0 + 2.6 * pxX; x += 12) { g.beginPath(); g.moveTo(x, sy - 0.9 * this.pxUp - 8); g.lineTo(x, sy - 0.9 * this.pxUp); g.stroke(); }
    }
    if (water.id === 'frozen') {
      // ice tent
      const tx = x0 + 3;
      g.fillStyle = T('#e84a4a');
      g.beginPath(); g.moveTo(tx - 46, sy - 2); g.lineTo(tx - 18, sy - 62); g.lineTo(tx + 10, sy - 2); g.fill();
      g.fillStyle = T('#b83030');
      g.beginPath(); g.moveTo(tx - 18, sy - 62); g.lineTo(tx - 10, sy - 2); g.lineTo(tx - 26, sy - 2); g.fill();
    }
    if (water.id === 'lagoon') {
      g.fillStyle = '#ffd84f';
      g.globalAlpha = 0.9;
      g.fillRect(x0 - 26, sy - 0.9 * this.pxUp - 46, 3, 38);
      const lg = g.createRadialGradient(x0 - 24, sy - 0.9 * this.pxUp - 50, 1, x0 - 24, sy - 0.9 * this.pxUp - 50, 26);
      lg.addColorStop(0, 'rgba(255,220,120,0.9)');
      lg.addColorStop(1, 'rgba(255,220,120,0)');
      g.fillStyle = lg;
      g.fillRect(x0 - 50, sy - 0.9 * this.pxUp - 76, 52, 52);
      g.globalAlpha = 1;
    }
    this.layers.shore = c;
    this.layers.shoreW = w;
    this.layers.shoreH = h;
  }

  bakeExtras() {
    const { dpr } = this;
    const { weather, period } = this.scene;
    // Soft glow dot for fireflies and plankton.
    const gs = 32;
    const gc = canvas(gs * dpr, gs * dpr);
    const g = gc.getContext('2d');
    g.scale(dpr, dpr);
    const gr = g.createRadialGradient(gs / 2, gs / 2, 0, gs / 2, gs / 2, gs / 2);
    gr.addColorStop(0, 'rgba(255,255,200,1)');
    gr.addColorStop(0.25, 'rgba(255,240,140,0.6)');
    gr.addColorStop(1, 'rgba(255,240,140,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, gs, gs);
    this.layers.glow = gc;
    // Light ray: a soft vertical fade.
    const rc = canvas(32, 256);
    const r2 = rc.getContext('2d');
    const rg = r2.createLinearGradient(0, 0, 0, 256);
    rg.addColorStop(0, 'rgba(255,255,230,0.16)');
    rg.addColorStop(1, 'rgba(255,255,230,0)');
    r2.fillStyle = rg;
    r2.fillRect(0, 0, 32, 256);
    this.layers.ray = rc;
    // Cloud puff.
    const cw = 220, ch = 90;
    const cc = canvas(cw * dpr, ch * dpr);
    const c2 = cc.getContext('2d');
    c2.scale(dpr, dpr);
    const grey = weather === 'rain' ? '#9aa4b0' : weather === 'cloudy' || weather === 'snow' ? '#dfe5ec' : period === 'dusk' ? '#ffd2c0' : period === 'night' ? '#4a5478' : '#ffffff';
    c2.fillStyle = grey;
    c2.globalAlpha = 0.9;
    for (const [x, y, r] of [[50, 58, 30], [90, 42, 38], [140, 50, 34], [175, 62, 24], [110, 66, 30]]) { c2.beginPath(); c2.arc(x, y, r, 0, 7); c2.fill(); }
    this.layers.cloud = cc;
    // Fog band.
    if (weather === 'fog') {
      const fw = this.W, fh = 220;
      const fc = canvas(fw * dpr, fh * dpr);
      const f = fc.getContext('2d');
      f.scale(dpr, dpr);
      const rng = mulberry32(5);
      for (let i = 0; i < 26; i++) {
        const x = rng() * fw, y = 60 + rng() * 100, r = 60 + rng() * 90;
        const fg = f.createRadialGradient(x, y, 0, x, y, r);
        fg.addColorStop(0, 'rgba(235,240,248,0.5)');
        fg.addColorStop(1, 'rgba(235,240,248,0)');
        f.fillStyle = fg;
        f.fillRect(x - r, y - r, r * 2, r * 2);
      }
      this.layers.fog = fc;
    }
  }

  initWeather() {
    const { weather, period, water } = this.scene;
    const rm = this.reduced ? 0.4 : 1;
    const rng = mulberry32(this.scene.seed + 3);
    this.drops = [];
    const n = weather === 'rain' ? 110 : weather === 'snow' ? 120 : 0;
    for (let i = 0; i < n * rm; i++) this.drops.push({ x: rng() * this.W, y: rng() * this.H, v: 0.6 + rng() * 0.6, p: rng() * 6 });
    this.flies = [];
    const nightish = period === 'night' || period === 'dusk';
    if (nightish && (water.id === 'pond' || water.id === 'river' || water.id === 'lagoon') && weather !== 'rain') {
      for (let i = 0; i < 22 * rm; i++) this.flies.push({ x: rng(), y: rng(), p: rng() * 6, s: 0.5 + rng() });
    }
    this.plankton = [];
    if (water.id === 'lagoon') for (let i = 0; i < 30 * rm; i++) this.plankton.push({ x: rng() * (SPAN + 6), y: 0.5 + rng() * 14, p: rng() * 6 });
    this.birds = [];
    if ((period === 'day' || period === 'dawn') && weather !== 'rain' && water.id !== 'lagoon') {
      for (let i = 0; i < 3; i++) this.birds.push({ x: rng() * this.W, y: 0.12 + rng() * 0.3, v: 18 + rng() * 20, p: rng() * 6 });
    }
    this.clouds = [];
    const nc = weather === 'clear' ? 3 : weather === 'meteor' ? 0 : 6;
    for (let i = 0; i < nc; i++) this.clouds.push({ x: rng() * this.W, y: 0.05 + rng() * 0.4, s: 0.6 + rng() * 0.8, v: 3 + rng() * 6 });
    this.meteors = [];
    this.meteorT = 1;
    this.lilies = [];
    if (water.id === 'pond') for (let i = 0; i < 7; i++) this.lilies.push({ x: 6 + rng() * 40, s: 0.7 + rng() * 0.6, flower: rng() < 0.4, p: rng() * 6 });
    this.reeds = [];
    if (water.id === 'pond' || water.id === 'river' || water.id === 'lagoon') for (let i = 0; i < 14; i++) this.reeds.push({ x: -2.6 + rng() * 2.2, h: 0.5 + rng() * 0.8, p: rng() * 6, cat: rng() < 0.4 });
  }

  // ------------------------------------------------------------ events

  handleEvents(events, trip) {
    for (const e of events) {
      switch (e.type) {
        case 'cast': this.castAnim = 0.35; if (e.bullseye) this.say('Bullseye cast!', e.x, -2.5, '#ffe36a'); break;
        case 'splash': this.splash(trip.lure.x, 0, 10, 1); this.ripple(trip.lure.x, 1.4); break;
        case 'nibble': this.ripple(trip.lure.x, 0.6); break;
        case 'bite': this.ripple(trip.lure.x, 1.2); this.splash(trip.lure.x, 0, 6, 0.6); this.flash = 0.25; break;
        case 'hooked': this.say(e.quality === 'perfect' ? 'Perfect hook!' : 'Hooked!', trip.lure.x, -1.5, e.quality === 'perfect' ? '#ffe36a' : '#ffffff'); break;
        case 'early': this.say('Too early!', trip.lure.x, -1.2, '#ffb0a0'); break;
        case 'stolen': this.say('It stole a nibble!', trip.lure.x, -1.2, '#ffb0a0'); break;
        case 'sniff': {
          const f = trip.fishes.find((x) => x.sp === e.fish);
          if (f) this.say('?', f.x, f.y - 0.8, '#ffffff', true);
          break;
        }
        case 'jump': if (trip.hooked) { this.splash(trip.hooked.x, 0, 16, 1.4); this.ripple(trip.hooked.x, 2); if (!this.reduced) this.shake = Math.max(this.shake, 4); } break;
        case 'stage': this.say(`Round ${e.stage}!`, trip.hooked?.x ?? 10, -2, '#ffd84f'); if (!this.reduced) this.shake = 6; break;
        case 'special': break;
        case 'snapped': this.say('SNAP!', trip.lure.x, -1.5, '#ff6a6a'); if (!this.reduced) this.shake = 7; break;
        case 'escaped': this.say('It wriggled free!', trip.lure.x, -1.5, '#a8d8ff'); break;
        case 'landed': this.splash(trip.lure.x, 0, 22, 1.5); this.ripple(trip.lure.x, 2.2); this.landAnim = { t: 0, fish: e.result.fish, cm: e.result.cm, x: trip.lure.x }; break;
        case 'twitch': this.ripple(trip.lure.x, 0.4); break;
        default: break;
      }
    }
  }

  say(text, x, y, color, small = false) {
    if (this.texts.length > 6) this.texts.shift();
    this.texts.push({ text, x, y, color, t: 0, small });
  }

  splash(x, y, n, size) {
    const count = Math.round(n * (this.reduced ? 0.4 : 1));
    for (let i = 0; i < count && this.particles.length < 140; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const v = (40 + Math.random() * 90) * size;
      this.particles.push({ x: this.sx(x), y: this.sy(y), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, t: 0, r: 1.5 + Math.random() * 2.5 * size, world: x });
    }
  }

  ripple(x, size) {
    if (this.ripples.length > 18) this.ripples.shift();
    this.ripples.push({ x, t: 0, size });
  }

  // ------------------------------------------------------------ update

  update(dt, trip) {
    this.time += dt;
    this.bakeStep();
    if (!trip) return;
    // Camera follows the action.
    let focus = 0;
    const L = trip.lure;
    if (trip.state === 'ready' || trip.state === 'charging') focus = trip.landingFor(trip.state === 'charging' ? trip.cast.power : trip.cast.aim).x * 0.7;
    else if (trip.state === 'fight' && trip.hooked) focus = trip.hooked.x;
    else focus = L.x;
    const maxCam = Math.max(0, SPAN + 6 - this.span);
    const target = clamp(focus - this.span * 0.62, 0, maxCam);
    this.camX += (target - this.camX) * Math.min(1, dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 18);
    this.flash = Math.max(0, this.flash - dt);
    this.castAnim = Math.max(0, this.castAnim - dt);
    for (const p of this.particles) {
      p.t += dt;
      p.vy += 260 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.t < p.life && p.y < this.surfaceY + 6);
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < 1.6);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < 1.6);
    if (this.landAnim) { this.landAnim.t += dt; if (this.landAnim.t > 1.4) this.landAnim = null; }
    // Rain ripples.
    if (this.scene.weather === 'rain' && Math.random() < dt * 6) this.ripple(this.camX + Math.random() * this.span, 0.25);
    if (this.scene.weather === 'meteor') {
      this.meteorT -= dt;
      if (this.meteorT <= 0 && this.meteors.length < 3) {
        this.meteorT = 0.8 + Math.random() * 2.2;
        this.meteors.push({ x: Math.random() * this.W, y: Math.random() * this.surfaceY * 0.4, t: 0 });
      }
      for (const m of this.meteors) m.t += dt;
      this.meteors = this.meteors.filter((m) => m.t < 0.9);
    }
  }

  // ------------------------------------------------------------ draw

  draw(trip, ui = {}) {
    const ctx = this.ctx;
    const { W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!trip || !this.ready) {
      ctx.fillStyle = '#123a4a';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save();
    ctx.translate(sh, sh * 0.5);
    this.drawSky(ctx);
    this.drawUnder(ctx, trip);
    this.drawFishes(ctx, trip);
    this.drawSurface(ctx, trip);
    this.drawShore(ctx, trip);
    this.drawLine(ctx, trip);
    this.drawAngler(ctx, trip);
    this.drawWeather(ctx);
    this.drawParticles(ctx);
    this.drawTexts(ctx);
    ctx.restore();
    if (!ui.attract) this.drawHud(ctx, trip, ui);
    if (this.flash > 0 && !this.reduced) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = this.flash * 0.25;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  drawSky(ctx) {
    const { W, surfaceY } = this;
    ctx.drawImage(this.layers.sky, 0, 0, W, surfaceY + 4);
    const t = this.time;
    // twinkles
    if (this.scene.period === 'night' && !this.reduced) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 12; i++) {
        const a = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7);
        ctx.globalAlpha = a;
        ctx.fillRect((i * 97.3) % W, ((i * 53.1) % (surfaceY * 0.7)), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    for (const c of this.clouds) {
      const x = ((c.x + t * c.v) % (W + 260)) - 220;
      ctx.drawImage(this.layers.cloud, x, c.y * surfaceY, 220 * c.s, 90 * c.s);
    }
    for (const m of this.meteors) {
      const p = m.t / 0.9;
      const x = m.x - p * 220, y = m.y + p * 120;
      ctx.strokeStyle = '#fff0c8';
      ctx.globalAlpha = 1 - p;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60, y - 33); ctx.stroke();
      ctx.drawImage(this.layers.glow, x - 8, y - 8, 16, 16);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = this.scene.period === 'dusk' ? '#3a2030' : '#2a3040';
    ctx.lineWidth = 1.6;
    for (const b of this.birds) {
      const x = ((b.x + t * b.v) % (W + 80)) - 40;
      const y = b.y * surfaceY + Math.sin(t * 0.7 + b.p) * 6;
      const f = Math.sin(t * 8 + b.p) * 4;
      ctx.beginPath(); ctx.moveTo(x - 7, y - f); ctx.quadraticCurveTo(x - 3, y - 3, x, y); ctx.quadraticCurveTo(x + 3, y - 3, x + 7, y - f); ctx.stroke();
    }
  }

  drawUnder(ctx, trip) {
    const { surfaceY, pxX } = this;
    const L = this.layers;
    ctx.drawImage(L.under, -this.camX * pxX, surfaceY - 1, L.underW, L.underH);
    // Light rays.
    const { period, weather } = this.scene;
    if (period !== 'night' && weather !== 'fog' && weather !== 'rain' && !trip.ice && L.ray) {
      const depth = (this.H - surfaceY) * 0.75;
      ctx.save();
      for (let i = 0; i < 5; i++) {
        const x = ((i * 0.23 + 0.1) * this.W + Math.sin(this.time * 0.15 + i) * 40);
        const w = 40 + 24 * Math.sin(this.time * 0.3 + i * 2);
        ctx.setTransform(this.dpr * w / 32, 0, this.dpr * 0.35, this.dpr * depth / 256, this.dpr * x, this.dpr * surfaceY);
        ctx.drawImage(L.ray, 0, 0);
      }
      ctx.restore();
    }
    if (this.plankton.length) {
      for (const p of this.plankton) {
        const a = 0.4 + 0.4 * Math.sin(this.time * 1.5 + p.p);
        ctx.globalAlpha = a;
        const x = this.sx(p.x + Math.sin(this.time * 0.2 + p.p) * 0.8), y = this.sy(p.y + Math.cos(this.time * 0.3 + p.p) * 0.3);
        ctx.drawImage(L.glow, x - 6, y - 6, 12, 12);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawFishes(ctx, trip) {
    const k = this.k;
    const deep = this.scene.water.maxDepth;
    for (const f of trip.fishes) {
      if (f.mode === 'hooked' && f.y < 0) continue; // drawn after the surface
      this.drawOneFish(ctx, f, k, deep, trip);
    }
  }

  drawOneFish(ctx, f, k, deep, trip) {
    const s = this.sprite(f.sp);
    const cm = f.sp.cm[0] + (f.sp.cm[1] - f.sp.cm[0]) * f.t;
    const L = pixelLength(cm, k);
    const sc = L / s.L;
    const x = this.sx(f.x), y = this.sy(f.y);
    if (x < -L || x > this.W + L) return;
    const hooked = f.mode === 'hooked';
    const wig = Math.sin(f.wiggle) * (hooked ? 0.16 : 0.06);
    let ang = wig + clamp(f.vy * 0.25, -0.4, 0.4) * (f.face < 0 ? -1 : 1);
    if (hooked && f.y < 0) ang = -0.6 * f.face * Math.cos(trip.jumpP * Math.PI);
    if (hooked && trip.fight?.phase === 'tired') ang = 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(f.face < 0 ? -sc : sc, sc);
    ctx.globalAlpha = f.y > 0 ? 1 - 0.3 * Math.min(1, f.y / deep) : 1;
    if (f.sp.rarity === 'legendary') {
      ctx.globalAlpha *= 0.5 + 0.2 * Math.sin(this.time * 3);
      ctx.drawImage(this.layers.glow, -s.L, -s.L * 0.6, s.L * 2, s.L * 1.2);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawSurface(ctx, trip) {
    const { surfaceY, W } = this;
    const t = this.time;
    const amp = this.reduced ? 1 : 2.4;
    const water = this.scene.water;
    if (!trip.ice) {
      const top = tint(WATER_COL[water.id][0], this.scene.period, this.scene.weather);
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.moveTo(0, surfaceY + 8);
      for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, surfaceY + Math.sin(x * 0.03 + t * 1.6) * amp + Math.sin(x * 0.011 - t) * amp * 0.6);
      ctx.lineTo(W, surfaceY + 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= W + 20; x += 20) {
        const y = surfaceY + Math.sin(x * 0.03 + t * 1.6) * amp + Math.sin(x * 0.011 - t) * amp * 0.6;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Shimmer.
      ctx.strokeStyle = this.scene.period === 'night' ? 'rgba(220,230,255,0.45)' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 26; i++) {
        const a = Math.sin(t * 1.3 + i * 2.1);
        if (a < 0.3) continue;
        const x = ((i * 137.7 + t * 9) % (W + 40)) - 20;
        const y = surfaceY + 4 + ((i * 31) % 26);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 8 + a * 10, y);
      }
      ctx.stroke();
    }
    // Lily pads.
    for (const l of this.lilies) {
      const x = this.sx(l.x + Math.sin(t * 0.2 + l.p) * 0.2), y = surfaceY + Math.sin(t + l.p) * 1.2;
      ctx.fillStyle = '#3f9a46';
      ctx.beginPath(); ctx.ellipse(x, y, 16 * l.s * this.k, 4.5 * l.s * this.k, 0, 0.35, Math.PI * 2); ctx.lineTo(x, y); ctx.fill();
      if (l.flower) {
        ctx.fillStyle = '#ffb0d0';
        ctx.beginPath(); ctx.ellipse(x + 3, y - 4, 5 * this.k, 4 * this.k, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffe36a';
        ctx.fillRect(x + 2, y - 5, 2.5, 2.5);
      }
    }
    // Ripples.
    ctx.lineWidth = 1.5;
    for (const r of this.ripples) {
      const p = r.t / 1.6;
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.6 * (1 - p);
      ctx.beginPath();
      ctx.ellipse(this.sx(r.x), surfaceY + 1, 6 + p * 40 * r.size, 2 + p * 6 * r.size, 0, 0, 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Hooked fish in the air goes in front of the surface.
    const f = trip.hooked;
    if (f && f.mode === 'hooked' && f.y < 0) this.drawOneFish(ctx, f, this.k, water.maxDepth, trip);
    if (this.landAnim) {
      const a = this.landAnim;
      const p = Math.min(1, a.t / 0.8);
      const s = this.sprite(a.fish);
      const L = pixelLength(a.cm, this.k);
      const x0 = this.sx(a.x), x1 = this.sx(trip.tip.x - 0.4);
      const x = x0 + (x1 - x0) * p;
      const y = this.surfaceY + (this.sy(trip.tip.y) - this.surfaceY) * p - Math.sin(p * Math.PI) * 60;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.4 + p * 0.4 + Math.sin(a.t * 18) * 0.15);
      ctx.scale(-L / s.L, L / s.L);
      ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }
  }

  drawShore(ctx, trip) {
    const L = this.layers;
    const x = this.sx(0) - this.shoreX;
    if (x + L.shoreW < 0) return;
    // Reeds sway in front of the bank.
    ctx.drawImage(L.shore, x, 0, L.shoreW, L.shoreH);
    const t = this.time;
    for (const r of this.reeds) {
      const bx = this.sx(r.x), by = this.surfaceY + 4;
      const hgt = r.h * 60 * this.k;
      const sway = Math.sin(t * 1.1 + r.p) * (this.reduced ? 2 : 5);
      ctx.strokeStyle = this.scene.period === 'night' ? '#2a4a3a' : '#4a8a3a';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + sway * 0.3, by - hgt * 0.6, bx + sway, by - hgt); ctx.stroke();
      if (r.cat) {
        ctx.fillStyle = this.scene.period === 'night' ? '#3a2a1a' : '#7a4a22';
        ctx.beginPath(); ctx.ellipse(bx + sway, by - hgt + 6, 3, 8, sway * 0.03, 0, 7); ctx.fill();
      }
    }
  }

  // Rod tip in screen space (bends toward the fish under tension).
  rodTip(trip) {
    let x = this.sx(trip.tip.x), y = this.sy(trip.tip.y);
    if (trip.state === 'charging') {
      const p = trip.cast.power;
      x -= 30 * p * this.k;
      y -= 6 * p;
    } else if (this.castAnim > 0) {
      x += 14 * (this.castAnim / 0.35);
    }
    if (trip.state === 'fight' && trip.fight) {
      const r = readout(trip.fight);
      const pull = Math.min(1.1, r.frac);
      x += 14 * pull * this.k;
      y += 22 * pull * this.k;
    } else if (trip.state === 'bite') y += 10;
    return { x, y };
  }

  drawLine(ctx, trip) {
    const tip = this.rodTip(trip);
    const L = trip.lure;
    const lx = this.sx(L.x), ly = this.sy(L.y);
    const bobber = BOBBER_BAITS.has(trip.bait);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const s = trip.state;
    let bx = null, by = null;
    if (s === 'ready' || s === 'charging') {
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x, tip.y + 16);
      ctx.stroke();
      this.drawLure(ctx, trip, tip.x, tip.y + 18);
      return;
    }
    if (s === 'flying') {
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo((tip.x + lx) / 2, Math.min(tip.y, ly) - 30, lx, ly);
      ctx.stroke();
      this.drawLure(ctx, trip, lx, ly);
      return;
    }
    const fight = s === 'fight' && trip.fight;
    const frac = fight ? readout(trip.fight).frac : 0;
    const surfX = bobber && !fight ? lx : lx - Math.min(40, Math.abs(lx - tip.x) * 0.1);
    let wob = 0;
    if (s === 'nibble' && trip.bite) wob = Math.sin(this.time * 30) * 2 * (trip.bite.timer < 0.15 ? 1 : 0);
    if (fight) {
      const taut = clamp((frac - 0.05) / 0.3, 0, 1);
      const sag = (1 - taut) * 50;
      ctx.strokeStyle = frac > DANGER ? '#ff7a6a' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = frac > DANGER ? 2 : 1.4;
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo((tip.x + lx) / 2, (tip.y + ly) / 2 + sag, lx, ly);
      ctx.stroke();
      return;
    }
    // Line from the tip down to the surface, then to the lure.
    ctx.moveTo(tip.x, tip.y);
    ctx.quadraticCurveTo((tip.x + surfX) / 2, this.surfaceY - 10, surfX, this.surfaceY);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    if (bobber) {
      bx = lx;
      const dip = s === 'bite' ? 7 + Math.sin(this.time * 20) * 2 : s === 'nibble' ? (trip.bite && trip.bite.timer > 0.4 ? 0 : 3) : 0;
      by = this.surfaceY + Math.sin(this.time * 2) * 1.2 + dip + wob;
      const r = 6 * this.k;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#ff4a4a';
      ctx.beginPath(); ctx.arc(bx, by, r, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ffd84f';
      ctx.fillRect(bx - 1, by - r - 5, 2, 5);
    }
    this.drawLure(ctx, trip, lx, ly);
    if (s === 'bite') {
      const x = bx ?? lx, y = (by ?? this.surfaceY) - 30 - Math.abs(Math.sin(this.time * 10)) * 6;
      ctx.font = `900 ${Math.round(34 * this.k)}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#7a1a10';
      ctx.strokeText('!', x, y);
      ctx.fillStyle = '#ffe36a';
      ctx.fillText('!', x, y);
    }
  }

  drawLure(ctx, trip, x, y) {
    const col = BAIT_COLOR[trip.bait] || '#ffffff';
    ctx.fillStyle = col;
    if (trip.bait === 'worm' || trip.bait === 'waxworm') {
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.quadraticCurveTo(x, y + 4 + Math.sin(this.time * 6) * 2, x + 4, y); ctx.stroke();
    } else if (trip.bait === 'spinner' || trip.bait === 'starlight' || trip.bait === 'starjig') {
      const w = Math.abs(Math.sin(this.time * 12)) * 5 + 1;
      ctx.beginPath(); ctx.ellipse(x, y, w, 5, 0, 0, 7); ctx.fill();
      if (trip.bait !== 'spinner') { ctx.globalAlpha = 0.8; ctx.drawImage(this.layers.glow, x - 12, y - 12, 24, 24); ctx.globalAlpha = 1; }
    } else if (trip.bait === 'glowbead') {
      ctx.drawImage(this.layers.glow, x - 10, y - 10, 20, 20);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(x, y, 5, 3, 0, 0, 7); ctx.fill();
    }
  }

  drawAngler(ctx, trip) {
    const k = this.k;
    const base = this.sx(trip.ice ? trip.tip.x - 1.3 : 0.1);
    const feet = trip.ice ? this.surfaceY - 2 : this.scene.water.boat && this.scene.water.id !== 'lagoon' ? this.surfaceY - 4 : this.surfaceY - 0.9 * this.pxUp - 8;
    if (base < -60) return;
    const boat = this.scene.water.boat && !trip.ice && this.scene.water.id !== 'lagoon';
    const night = this.scene.period === 'night';
    // Boat hull.
    if (boat) {
      const col = { river: '#d8402a', coral: '#ffffff', frozen: '#d8402a' }[this.scene.water.id] || '#d8402a';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(base - 50 * k, this.surfaceY - 10 * k);
      ctx.lineTo(base + 50 * k, this.surfaceY - 10 * k);
      ctx.quadraticCurveTo(base + 40 * k, this.surfaceY + 10 * k, base + 20 * k, this.surfaceY + 10 * k);
      ctx.lineTo(base - 30 * k, this.surfaceY + 10 * k);
      ctx.quadraticCurveTo(base - 46 * k, this.surfaceY + 8 * k, base - 50 * k, this.surfaceY - 10 * k);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(base - 48 * k, this.surfaceY - 10 * k, 98 * k, 4 * k);
      if (this.scene.water.id === 'coral') {
        ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(base - 20 * k, this.surfaceY - 10 * k); ctx.lineTo(base - 20 * k, this.surfaceY - 120 * k); ctx.stroke();
        ctx.fillStyle = '#fff6e8';
        ctx.beginPath(); ctx.moveTo(base - 18 * k, this.surfaceY - 118 * k); ctx.lineTo(base - 18 * k, this.surfaceY - 22 * k); ctx.lineTo(base - 76 * k, this.surfaceY - 24 * k); ctx.fill();
      }
    }
    const seated = boat || trip.ice;
    const hip = feet - (seated ? 16 : 26) * k;
    const sh = hip - 24 * k;
    // legs
    ctx.strokeStyle = '#3a5ab8';
    ctx.lineWidth = 7 * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (seated) { ctx.moveTo(base, hip); ctx.lineTo(base + 14 * k, hip); ctx.lineTo(base + 14 * k, feet); }
    else { ctx.moveTo(base - 3 * k, hip); ctx.lineTo(base - 5 * k, feet); ctx.moveTo(base + 4 * k, hip); ctx.lineTo(base + 6 * k, feet); }
    ctx.stroke();
    // body (raincoat)
    ctx.fillStyle = '#ffcc33';
    ctx.beginPath();
    ctx.moveTo(base - 11 * k, hip + 2 * k);
    ctx.quadraticCurveTo(base - 12 * k, sh, base, sh - 2 * k);
    ctx.quadraticCurveTo(base + 12 * k, sh, base + 11 * k, hip + 2 * k);
    ctx.closePath();
    ctx.fill();
    // head + hat
    const hy = sh - 12 * k;
    ctx.fillStyle = '#f5c9a0';
    ctx.beginPath(); ctx.arc(base + 2 * k, hy, 10 * k, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath(); ctx.arc(base + 6 * k, hy - 1 * k, 1.6 * k, 0, 7); ctx.fill();
    ctx.strokeStyle = '#a0603a';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(base + 6 * k, hy + 3 * k, 3 * k, 0.2, 1.4); ctx.stroke();
    ctx.fillStyle = '#4aa860';
    ctx.beginPath(); ctx.ellipse(base + 2 * k, hy - 7 * k, 15 * k, 4 * k, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(base + 2 * k, hy - 8 * k, 9 * k, Math.PI, 0); ctx.fill();
    // Rod and arms.
    const tip = this.rodTip(trip);
    const hx = base + 10 * k, hyy = sh + 10 * k;
    const bend = trip.state === 'fight' && trip.fight ? readout(trip.fight).frac : 0;
    ctx.strokeStyle = '#6a4a2a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - 6 * k, hyy + 6 * k);
    ctx.quadraticCurveTo((hx + tip.x) / 2 + 4, (hyy + tip.y) / 2 - 10 + bend * 26, tip.x, tip.y);
    ctx.stroke();
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 5 * k;
    ctx.beginPath(); ctx.moveTo(base, sh + 4 * k); ctx.lineTo(hx, hyy); ctx.stroke();
    // reel
    const spin = trip.state === 'fight' || trip.state === 'reeling' ? this.time * 14 : 0;
    ctx.fillStyle = '#c0c8d0';
    ctx.beginPath(); ctx.arc(hx + 2 * k, hyy + 4 * k, 4 * k, 0, 7); ctx.fill();
    ctx.strokeStyle = '#506070';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hx + 2 * k, hyy + 4 * k); ctx.lineTo(hx + 2 * k + Math.cos(spin) * 5 * k, hyy + 4 * k + Math.sin(spin) * 5 * k); ctx.stroke();
    if (night) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.layers.glow, base - 30 * k, sh - 40 * k, 60 * k, 60 * k);
      ctx.globalAlpha = 1;
    }
  }

  drawWeather(ctx) {
    const { W, H } = this;
    const t = this.time;
    const w = this.scene.weather;
    if (w === 'rain') {
      ctx.strokeStyle = 'rgba(200,220,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of this.drops) {
        const y = (d.y + t * 520 * d.v) % this.surfaceY;
        const x = (d.x - t * 60 * d.v) % W;
        const xx = x < 0 ? x + W : x;
        ctx.moveTo(xx, y);
        ctx.lineTo(xx - 3, y + 12);
      }
      ctx.stroke();
    } else if (w === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const d of this.drops) {
        const y = (d.y + t * 40 * d.v) % H;
        const x = (d.x + Math.sin(t * 0.8 + d.p) * 20 + W) % W;
        const r = 1.2 + d.v * 1.6;
        ctx.fillRect(x, y, r, r);
      }
    }
    if (this.layers.fog) {
      ctx.globalAlpha = 0.75;
      const off = (t * 8) % W;
      ctx.drawImage(this.layers.fog, -off, this.surfaceY - 150, W, 220);
      ctx.drawImage(this.layers.fog, W - off, this.surfaceY - 150, W, 220);
      ctx.globalAlpha = 1;
    }
    if (this.flies.length) {
      for (const f of this.flies) {
        const a = Math.max(0, Math.sin(t * f.s * 2 + f.p));
        if (a < 0.05) continue;
        ctx.globalAlpha = a;
        const x = (f.x * W + Math.sin(t * 0.4 + f.p) * 30);
        const y = this.surfaceY * (0.55 + f.y * 0.42) + Math.cos(t * 0.5 + f.p * 2) * 16;
        ctx.drawImage(this.layers.glow, x - 9, y - 9, 18, 18);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawParticles(ctx) {
    ctx.fillStyle = 'rgba(230,248,255,0.9)';
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      const p = t.t / 1.6;
      const size = Math.round((t.small ? 26 : 30) * this.k);
      ctx.font = `900 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
      ctx.globalAlpha = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      const x = this.sx(t.x), y = this.sy(t.y) - p * 30;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(10,30,50,0.8)';
      ctx.strokeText(t.text, x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ HUD

  drawHud(ctx, trip, ui) {
    if (trip.state === 'ready' || trip.state === 'charging') this.drawCastHud(ctx, trip);
    if (trip.state === 'fight' && trip.fight) this.drawFightHud(ctx, trip, ui);
  }

  drawCastHud(ctx, trip) {
    const k = this.k;
    const aimLand = trip.landingFor(trip.cast.aim);
    const ax = this.sx(aimLand.x);
    // Target ring on the water (or depth marker under the ice).
    const ty = trip.ice ? this.sy(aimLand.y) : this.surfaceY;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.ellipse(ax, ty, 18 * k, 6 * k, 0, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    if (!trip.ice) {
      // Depth guide below the ring: where the lure will settle.
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.moveTo(ax, this.surfaceY + 6); ctx.lineTo(ax, this.sy(aimLand.y)); ctx.stroke();
    }
    // Arc preview while charging.
    const tip = this.rodTip(trip);
    if (trip.state === 'charging') {
      const land = trip.landingFor(trip.cast.power);
      const lx = this.sx(land.x), ly = trip.ice ? this.sy(land.y) : this.surfaceY;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 1; i <= 14; i++) {
        const p = i / 14;
        const x = tip.x + (lx - tip.x) * p;
        const y = trip.ice ? tip.y + (ly - tip.y) * p : tip.y + (ly - tip.y) * p - Math.sin(p * Math.PI) * (40 + land.x * 2.4) * k;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    // Power meter beside the angler.
    const mx = Math.max(16, this.sx(trip.ice ? trip.tip.x - 2.6 : -1.2)), mh = 120 * k, my = this.surfaceY - 30 * k - mh - (trip.ice ? 0 : 0.9 * this.pxUp);
    ctx.fillStyle = 'rgba(10,30,50,0.6)';
    ctx.fillRect(mx - 9, my - 4, 18, mh + 8);
    const p = trip.state === 'charging' ? trip.cast.power : 0;
    ctx.fillStyle = p > 0.8 ? '#ff8a4a' : p > 0.45 ? '#ffd84f' : '#7ae07a';
    ctx.fillRect(mx - 6, my + mh * (1 - p), 12, mh * p);
    const aimY = my + mh * (1 - trip.cast.aim);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mx - 13, aimY - 1.5, 26, 3);
    ctx.beginPath(); ctx.moveTo(mx + 13, aimY); ctx.lineTo(mx + 20, aimY - 5); ctx.lineTo(mx + 20, aimY + 5); ctx.fill();
  }

  drawFightHud(ctx, trip, ui) {
    const r = readout(trip.fight);
    const k = this.k;
    const W = this.W;
    const bw = Math.min(460, W - 40), bh = 22;
    const bx = (W - bw) / 2, by = this.H - (ui.touch ? 150 : 74);
    // Panel
    ctx.fillStyle = 'rgba(8,24,44,0.66)';
    ctx.fillRect(bx - 12, by - 52, bw + 24, bh + 70);
    // Stamina
    const fish = trip.fight.fish;
    ctx.font = `800 ${Math.round(15 * Math.max(0.9, k))}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ui.fishLabel || fish.name, bx, by - 34);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#bfe8ff';
    ctx.fillText(ui.distLabel || '', bx + bw, by - 34);
    const sw = bw;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx, by - 26, sw, 8);
    ctx.fillStyle = r.stage < r.stages ? '#ffb84a' : '#ff8a5a';
    ctx.fillRect(bx, by - 26, sw * r.stamina, 8);
    if (r.stages > 1) {
      for (let i = 0; i < r.stages; i++) {
        ctx.fillStyle = i < r.stages - r.stage + 1 ? '#ffd84f' : 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.arc(bx + sw - 8 - i * 16, by - 44, 5, 0, 7); ctx.fill();
      }
    }
    // Tension bar zones
    const zx = (f) => bx + bw * Math.min(1, f);
    ctx.fillStyle = '#4a8ad8'; ctx.fillRect(bx, by, zx(r.low) - bx, bh);
    ctx.fillStyle = '#4ad86a'; ctx.fillRect(zx(r.low), by, zx(r.high) - zx(r.low), bh);
    ctx.fillStyle = '#ffd84f'; ctx.fillRect(zx(r.high), by, zx(DANGER) - zx(r.high), bh);
    ctx.fillStyle = '#ff5a5a'; ctx.fillRect(zx(DANGER), by, bx + bw - zx(DANGER), bh);
    if (r.strengthMul < 1) { ctx.fillStyle = 'rgba(220,245,255,0.45)'; ctx.fillRect(bx, by, bw, bh); }
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    // Needle
    const nx = bx + bw * Math.min(1.03, r.frac) + (r.danger > 0 && !this.reduced ? (Math.random() - 0.5) * 4 : 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(nx - 2, by - 6, 4, bh + 12);
    ctx.beginPath(); ctx.moveTo(nx - 7, by - 10); ctx.lineTo(nx + 7, by - 10); ctx.lineTo(nx, by - 2); ctx.fill();
    ctx.font = `800 ${Math.round(12 * Math.max(0.9, k))}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#bfe0ff';
    ctx.fillText('LOOSE', bx, by + bh + 15);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c8ffd0';
    ctx.fillText('JUST RIGHT', (zx(r.low) + zx(r.high)) / 2, by + bh + 15);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffc0c0';
    ctx.fillText('SNAP!', bx + bw, by + bh + 15);
    // Warnings
    let warn = null;
    if (r.phase === 'rise' || r.phase === 'jump') warn = trip.ice ? 'It\'s thrashing! Let go!' : 'It\'s jumping! Let go!';
    else if (r.danger > 0.15) warn = 'Too tight! Ease off!';
    else if (r.slipping > 0.3) warn = 'Too loose! Reel!';
    else if (r.phase === 'tired') warn = 'It\'s tired! Reel it in!';
    if (warn) {
      ctx.font = `900 ${Math.round(24 * Math.max(0.85, k))}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(8,24,44,0.85)';
      ctx.strokeText(warn, W / 2, by - 66);
      ctx.fillStyle = r.slipping > 0.3 && r.phase !== 'rise' ? '#a8d8ff' : '#ffe36a';
      ctx.fillText(warn, W / 2, by - 64);
    }
    // Steering arrow by the fish.
    const f = trip.hooked;
    if (f && r.phase !== 'tired') {
      const x = this.sx(f.x), y = this.sy(f.y) - 34 * k;
      const d = -r.dir;
      const good = trip.fight.steerGood > 0;
      ctx.fillStyle = good ? '#6aff8a' : 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(x + d * 22 * k, y);
      ctx.lineTo(x + d * 6 * k, y - 11 * k);
      ctx.lineTo(x + d * 6 * k, y - 4 * k);
      ctx.lineTo(x - d * 16 * k, y - 4 * k);
      ctx.lineTo(x - d * 16 * k, y + 4 * k);
      ctx.lineTo(x + d * 6 * k, y + 4 * k);
      ctx.lineTo(x + d * 6 * k, y + 11 * k);
      ctx.closePath();
      ctx.fill();
    }
  }
}

