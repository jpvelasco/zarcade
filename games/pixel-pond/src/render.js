// Drawing: the garden goes into one ImageData at grid resolution (one pixel
// per cell) through colour look-up tables, then onto the screen canvas
// scaled up with smoothing off, so cells stay crisp. Glowing cells feed a
// small glow layer that is blurred by downscaling and added on top. The
// renderer only reads the world; it never changes it.
import {
  EMPTY, SAND, WATER, SOIL, SEED, STONE, LAVA, STEAM, OBSIDIAN, FIRE, STEM, LEAF, FLOWER, WOOD,
  ACORN, ICE, MOSS, FISH, FIREFLY, TIP, TYPE_COUNT, K_GRASS, K_VINE, K_TREE, K_BRANCH, K_CROWN, WET_MAX,
} from './elements.js';
import { nightAmount } from './world.js';
import { ICONS, INK } from './icons.js';
import { mulberry32 } from './rng.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pack = (r, g, b, a = 255) => ((a << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
const mix = (p, q, t) => p.map((v, k) => v + (q[k] - v) * t);

const FIXED = {
  [SAND]: ['#f2d184', '#e8c372', '#f7dc97', '#dcb563'],
  [SEED]: ['#e9c886', '#d6ad62', '#f3d89c', '#c49a55'],
  [ACORN]: ['#a8652f', '#8c5226', '#bd7a3e', '#6b3a1a'],
  [STONE]: ['#8b8f9c', '#80848f', '#979baa', '#757987'],
  [OBSIDIAN]: ['#2a1f3d', '#241a35', '#33264a', '#6a50b8'],
  [ICE]: ['#cdf2ff', '#b8e9fb', '#e8faff', '#a9def3'],
  [WOOD]: ['#8a5a36', '#7a4e2e', '#996640', '#6e4428'],
  [MOSS]: ['#4fe0b0', '#3fcf9f', '#6ff0c4', '#36b88c'],
  [FISH]: ['#ff8c32', '#ff9d45', '#ff8c32', '#ff9d45'],
};
const STEMS = {
  flower: ['#4fae4a', '#45a043', '#5cbf54', '#3e9440'],
  grass: ['#79c84e', '#6cb944', '#8ad65c', '#62ad3e'],
  vine: ['#3b9f6a', '#33905f', '#47b079', '#2c7a50'],
};
const LEAVES = ['#5cc45a', '#4fb04f', '#72d46a', '#45a046'];
const CROWNS = [
  ['#3f9e47', '#378c3f', '#4cb253', '#2f7d38'],
  ['#2e7d55', '#286f4b', '#378f62', '#215f40'],
  ['#ffb7d0', '#ff9fc0', '#ffd0e0', '#f48fb5'],
  ['#f2a03d', '#e6862f', '#f7bb55', '#d8702a'],
];
const PETALS = ['#ff7eb6', '#ff5a5f', '#ffd23f', '#b07cff', '#fff6f0', '#ff9f43', '#6fa8ff'];
const CENTRES = ['#ffd23f', '#ffd23f', '#ff8c2a', '#ffd23f', '#ffc83a', '#ffe680', '#ffd23f'];
const RAINBOW = ['#ff5a5f', '#ff9f43', '#ffd23f', '#7bdc5a', '#4fc3e0', '#6fa8ff', '#b07cff', '#ff7eb6'];
const SOIL_DRY = ['#a8754a', '#9a6a42', '#b5825a', '#8f6040'];
const SOIL_WET = ['#5e3d26', '#553620', '#68452c', '#4c311d'];
const WATER_DEPTH = ['#a6ecf7', '#6fd3ec', '#52c1e5', '#43aedd', '#3799d1', '#2c84c4', '#2672b5', '#2163a6'];
const LAVA_TONES = ['#ff5a1f', '#ff7a29', '#ffb340', '#e8401a', '#ff9a30', '#d83a14', '#ffcf5a', '#f06020'];
const FIRE_TONES = ['#ffe066', '#ffb340', '#ff8a2a', '#ff5a1f', '#fff3a0', '#ff7a29', '#ffd25a', '#ff6a1f'];
const STEAM_TONES = ['#eef2fb', '#e4e9f6', '#f6f8ff', '#dde3f2'];

// Sky themes: day, dusk and night gradients (top, bottom).
export const THEMES = {
  meadow: { day: ['#7cc8f5', '#dff4ff'], dusk: ['#f58f7a', '#ffd9a0'], night: ['#0c1836', '#2a3d70'], star: '#fff8d8' },
  sunset: { day: ['#ffa98a', '#ffe6c4'], dusk: ['#c9578a', '#ffad66'], night: ['#24112f', '#5a2c50'], star: '#ffe0f0' },
  aurora: { day: ['#8fdfd8', '#effff9'], dusk: ['#5f8fc0', '#f0c49c'], night: ['#03101c', '#0b2f3c'], star: '#d8fff0', aurora: true },
  candy: { day: ['#ffbfe6', '#fff2fb'], dusk: ['#b98cff', '#ffc0dc'], night: ['#291748', '#5c3a7e'], star: '#ffe6ff' },
};

const TINT_DAY = [1, 1, 1];
const TINT_DUSK = [1.02, 0.86, 0.8];
const TINT_NIGHT = [0.46, 0.52, 0.78];

function duskAmount(t) {
  const bump = (c, r) => Math.max(0, 1 - Math.abs(t - c) / r);
  return Math.min(1, bump(0.6, 0.07) + bump(0.965, 0.05));
}

const BUCKETS = 96;
// Moss keeps its colour at night (it glows); everything else dims with the sky.
const EMISSIVE_NOT_TINTED = new Set([MOSS]);

// The look-up tables for one sky tint.
function buildLuts(tint, night) {
  const tone4 = (list) => Uint32Array.from(list, (h) => { const [r, g, b] = hex(h); return pack(r * tint[0], g * tint[1], b * tint[2]); });
  const raw = (list, alpha = 255) => Uint32Array.from(list, (h) => { const [r, g, b] = hex(h); return pack(r, g, b, alpha); });
  const fixed = new Uint32Array(TYPE_COUNT * 4);
  for (const [t, list] of Object.entries(FIXED)) fixed.set(EMISSIVE_NOT_TINTED.has(+t) ? raw(list) : tone4(list), +t * 4);
  const soil = new Uint32Array((WET_MAX + 1) * 4);
  for (let wet = 0; wet <= WET_MAX; wet++) {
    for (let k = 0; k < 4; k++) {
      const c = mix(hex(SOIL_DRY[k]), hex(SOIL_WET[k]), Math.min(1, wet / 5));
      soil[wet * 4 + k] = pack(c[0] * tint[0], c[1] * tint[1], c[2] * tint[2]);
    }
  }
  const water = new Uint32Array(8 * 4);
  for (let d = 0; d < 8; d++) {
    for (let k = 0; k < 4; k++) {
      const c = hex(WATER_DEPTH[d]).map((v) => v + (k - 1.5) * 3);
      water[d * 4 + k] = pack(c[0] * tint[0], c[1] * tint[1], c[2] * tint[2], d === 0 ? 235 : 255);
    }
  }
  const crowns = new Uint32Array(16);
  CROWNS.forEach((list, v) => crowns.set(tone4(list), v * 4));
  const petals = new Uint32Array(16);
  PETALS.forEach((h, k) => {
    const [r, g, b] = hex(h);
    petals[k * 2] = pack(r * tint[0], g * tint[1], b * tint[2]);
    const [cr, cg, cb] = hex(CENTRES[k]);
    petals[k * 2 + 1] = pack(cr * tint[0], cg * tint[1], cb * tint[2]);
  });
  const steam = Uint32Array.from(STEAM_TONES, (h, k) => { const [r, g, b] = hex(h); return pack(r * tint[0], g * tint[1], b * tint[2], 150 + k * 12); });
  const glowStrength = (h, s) => { const [r, g, b] = hex(h); return pack(r * s, g * s, b * s, 255); };
  return {
    fixed, soil, water, crowns, petals, steam,
    grass: tone4(['#6fbf4a', '#5fae40', '#7fcf58', '#58a33c']),
    stemFlower: tone4(STEMS.flower), stemGrass: tone4(STEMS.grass), stemVine: tone4(STEMS.vine), leaves: tone4(LEAVES),
    rainbow: tone4(RAINBOW),
    lava: raw(LAVA_TONES), fire: raw(FIRE_TONES),
    fireflyOn: pack(239, 255, 122), fireflyOff: pack(120 * tint[0] + 30, 130 * tint[1] + 30, 70 * tint[2] + 20),
    glowLava: glowStrength('#ff6a2a', 0.95), glowFire: glowStrength('#ffb040', 1),
    glowMoss: glowStrength('#3fffc0', 0.12 + 0.88 * night), glowFly: glowStrength('#eaff70', 0.35 + 0.65 * night),
  };
}

// Write a garden's cells into `px` (and glowing cells into `glow`). Works on
// a World or on decoded gallery cells ({ w, h, type, a, b, tone }).
export function fillPixels(cells, luts, px, glow, frame = 0, rainbow = false, depth = null) {
  const { w, h, type, a, b, tone } = cells;
  const L = luts;
  const fixed = L.fixed;
  const col = depth || new Uint16Array(w);
  col.fill(0);
  if (glow) glow.fill(0);
  const tails = [];
  const f4 = frame >> 2;
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const t = type[i];
      if (t === EMPTY) { px[i] = 0; col[x] = 0; continue; }
      if (t === WATER || t === FISH) {
        const d = col[x]++;
        if (t === WATER) { px[i] = L.water[(d > 7 ? 7 : d) * 4 + tone[i]]; continue; }
      } else col[x] = 0;
      switch (t) {
        case SOIL:
          // Damp soil open to the sky grows a thin coat of grass.
          px[i] = a[i] >= 3 && y > 0 && type[i - w] === EMPTY ? L.grass[tone[i]] : L.soil[(a[i] << 2) | tone[i]];
          break;
        case FLOWER: {
          const bb = b[i];
          if (rainbow && !(bb & 8)) px[i] = L.rainbow[((x + y + (frame >> 3)) >> 1) & 7];
          else px[i] = L.petals[((bb >> 4) % 7) * 2 + ((bb & 8) ? 1 : 0)];
          break;
        }
        case STEM: case TIP: {
          const k = b[i] & 7;
          if (k === K_TREE || k === K_BRANCH) px[i] = fixed[WOOD * 4 + tone[i]];
          else if (k === K_CROWN) px[i] = L.crowns[((b[i] >> 4) & 3) * 4 + tone[i]];
          else px[i] = (k === K_VINE ? L.stemVine : k === K_GRASS ? L.stemGrass : L.stemFlower)[tone[i]];
          break;
        }
        case LEAF: {
          const k = b[i] & 7;
          px[i] = k === K_CROWN ? L.crowns[((b[i] >> 4) & 3) * 4 + tone[i]] : L.leaves[tone[i]];
          break;
        }
        case LAVA:
          px[i] = L.lava[(Math.imul(i, 2654435761) + f4 * 40503 >>> 29) & 7];
          if (glow) glow[i] = L.glowLava;
          break;
        case FIRE:
          px[i] = L.fire[(Math.imul(i, 40503) + frame * 7 >>> 27) & 7];
          if (glow) glow[i] = L.glowFire;
          break;
        case MOSS:
          px[i] = fixed[MOSS * 4 + tone[i]];
          if (glow) glow[i] = L.glowMoss;
          break;
        case FIREFLY: {
          const on = ((frame + (b[i] & 127) * 5) % 90) < 58;
          px[i] = on ? L.fireflyOn : L.fireflyOff;
          if (glow && on) {
            // A single cell's light would blur away: give it a little cross.
            glow[i] = L.glowFly;
            if (x > 0) glow[i - 1] = L.glowFly;
            if (x < w - 1) glow[i + 1] = L.glowFly;
            if (y > 0) glow[i - w] = L.glowFly;
            if (y < h - 1) glow[i + w] = L.glowFly;
          }
          break;
        }
        case STEAM: px[i] = L.steam[tone[i]]; break;
        case FISH:
          px[i] = fixed[FISH * 4 + tone[i]];
          tails.push(i, b[i] & 1);
          break;
        case OBSIDIAN:
          // A rare glint drifts across obsidian.
          px[i] = fixed[OBSIDIAN * 4 + (tone[i] === 3 && ((x + y + (frame >> 4)) % 7) ? 2 : tone[i])];
          break;
        default:
          px[i] = fixed[t * 4 + tone[i]];
      }
    }
  }
  // A darker tail pixel behind each fish, when it is in water.
  for (let k = 0; k < tails.length; k += 2) {
    const j = tails[k] + (tails[k + 1] ? -1 : 1);
    const x = tails[k] % w;
    if ((tails[k + 1] ? x > 0 : x < w - 1) && type[j] === WATER) px[j] = pack(224, 96, 26);
  }
}

export class Renderer {
  constructor(canvas, { reduced = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reduced;
    this.grid = null;
    this.off = document.createElement('canvas');
    this.offCtx = this.off.getContext('2d');
    this.glowCanvas = document.createElement('canvas');
    this.glowCtx = this.glowCanvas.getContext('2d');
    this.blurA = document.createElement('canvas');
    this.blurB = document.createElement('canvas');
    this.lutCache = new Map();
    this.skyCache = new Map();
    this.particles = [];
    this.frame = 0;
    this.stars = (() => {
      const r = mulberry32(77);
      return Array.from({ length: 80 }, () => ({ x: r(), y: r() * 0.7, s: r() < 0.15 ? 2 : 1, p: r() * 6.28 }));
    })();
    this.clouds = [0.1, 0.42, 0.7, 0.9].map((x, k) => ({ x, y: [0.1, 0.18, 0.08, 0.24][k], speed: [0.9, 0.6, 1.2, 0.75][k], sprite: makeCloud(k) }));
  }

  // Size the canvas for a grid from layout.pickGrid.
  setGrid(grid) {
    this.grid = grid;
    const { w, h, cell, dpr } = grid;
    this.canvas.width = w * cell;
    this.canvas.height = h * cell;
    this.canvas.style.width = `${(w * cell) / dpr}px`;
    this.canvas.style.height = `${(h * cell) / dpr}px`;
    this.off.width = w;
    this.off.height = h;
    this.img = this.offCtx.createImageData(w, h);
    this.px = new Uint32Array(this.img.data.buffer);
    this.glowCanvas.width = w;
    this.glowCanvas.height = h;
    this.glowImg = this.glowCtx.createImageData(w, h);
    this.glowPx = new Uint32Array(this.glowImg.data.buffer);
    this.blurA.width = Math.max(1, Math.ceil(w / 3));
    this.blurA.height = Math.max(1, Math.ceil(h / 3));
    this.blurB.width = Math.max(1, Math.ceil(w / 8));
    this.blurB.height = Math.max(1, Math.ceil(h / 8));
    this.depth = new Uint16Array(w);
  }

  luts(time, theme) {
    const bucket = Math.floor(time * BUCKETS) % BUCKETS;
    const key = `${theme}:${bucket}`;
    let l = this.lutCache.get(key);
    if (!l) {
      const t = (bucket + 0.5) / BUCKETS;
      const n = nightAmount(t);
      const d = duskAmount(t) * (1 - n);
      l = buildLuts(mix(mix(TINT_DAY, TINT_DUSK, d), TINT_NIGHT, n), n);
      if (this.lutCache.size > 200) this.lutCache.clear();
      this.lutCache.set(key, l);
    }
    return l;
  }

  skyColours(time, themeId) {
    const th = THEMES[themeId] || THEMES.meadow;
    const n = nightAmount(time);
    const d = duskAmount(time) * (1 - n);
    return [0, 1].map((k) => mix(mix(hex(th.day[k]), hex(th.dusk[k]), d), hex(th.night[k]), n));
  }

  skyGradient(time, themeId) {
    const bucket = Math.floor(time * BUCKETS) % BUCKETS;
    const key = `${themeId}:${bucket}`;
    let c = this.skyCache.get(key);
    if (!c) {
      const [top, bottom] = this.skyColours((bucket + 0.5) / BUCKETS, themeId);
      c = document.createElement('canvas');
      c.width = 1;
      c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, `rgb(${top.map(Math.round).join(',')})`);
      grad.addColorStop(1, `rgb(${bottom.map(Math.round).join(',')})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 1, 64);
      if (this.skyCache.size > 200) this.skyCache.clear();
      this.skyCache.set(key, c);
    }
    return c;
  }

  // ------------------------------------------------------------ particles

  sparkle(x, y, colour, count = 6) {
    if (this.reduced) count = Math.min(count, 2);
    for (let k = 0; k < count && this.particles.length < 160; k++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 8;
      this.particles.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 4, life: 0, max: 0.5 + Math.random() * 0.5, colour, kind: 'spark' });
    }
  }

  confetti(count = 90) {
    if (!this.grid) return;
    if (this.reduced) count = 16;
    const { w } = this.grid;
    for (let k = 0; k < count && this.particles.length < 220; k++) {
      this.particles.push({
        x: Math.random() * w, y: -2 - Math.random() * 20, vx: (Math.random() - 0.5) * 6, vy: 8 + Math.random() * 12,
        life: 0, max: 2.2 + Math.random() * 1.6, colour: RAINBOW[k % RAINBOW.length], kind: 'confetti', spin: Math.random() * 6,
      });
    }
  }

  update(dt) {
    this.frame++;
    const ps = this.particles;
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      p.life += dt;
      if (p.life >= p.max) { ps.splice(k, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'spark') { p.vx *= 0.9; p.vy = p.vy * 0.9 + 6 * dt; } else { p.vx += Math.sin(p.life * 3 + p.spin) * 0.5; }
    }
  }

  // ------------------------------------------------------------ draw

  draw(world, view) {
    const { ctx, canvas, grid } = this;
    if (!grid || !world) return;
    const W = canvas.width;
    const H = canvas.height;
    const cell = grid.cell;
    const time = world.time;
    const theme = view.theme || 'meadow';
    const night = nightAmount(time);

    // Sky.
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.skyGradient(time, theme), 0, 0, W, H);
    this.drawSkyBits(ctx, W, H, cell, time, theme, night);

    // The garden.
    const luts = this.luts(time, theme);
    const glowing = world.counts[LAVA] + world.counts[FIRE] + world.counts[MOSS] + world.counts[FIREFLY] > 0;
    fillPixels(world, luts, this.px, glowing ? this.glowPx : null, this.frame, view.rainbow, this.depth);
    this.offCtx.putImageData(this.img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, W, H);

    if (glowing) {
      this.glowCtx.putImageData(this.glowImg, 0, 0);
      const a = this.blurA.getContext('2d');
      const b = this.blurB.getContext('2d');
      a.imageSmoothingEnabled = true;
      b.imageSmoothingEnabled = true;
      a.clearRect(0, 0, this.blurA.width, this.blurA.height);
      a.drawImage(this.glowCanvas, 0, 0, this.blurA.width, this.blurA.height);
      b.clearRect(0, 0, this.blurB.width, this.blurB.height);
      b.drawImage(this.blurA, 0, 0, this.blurB.width, this.blurB.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.35 + 0.35 * night;
      ctx.drawImage(this.blurA, 0, 0, W, H);
      ctx.globalAlpha = 0.45 + 0.4 * night;
      ctx.drawImage(this.blurB, 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    this.drawMarkers(ctx, world, cell, grid.dpr, view);
    this.drawParticles(ctx, cell);
    if (view.cursor) this.drawCursor(ctx, view.cursor, cell, grid.dpr);
  }

  drawSkyBits(ctx, W, H, cell, time, theme, night) {
    const th = THEMES[theme] || THEMES.meadow;
    // Stars.
    if (night > 0.02) {
      ctx.fillStyle = th.star;
      const s = Math.max(1, Math.round(cell * 0.5));
      for (const st of this.stars) {
        const tw = this.reduced ? 0.8 : 0.55 + 0.45 * Math.sin(this.frame / 40 + st.p);
        ctx.globalAlpha = night * tw;
        ctx.fillRect(Math.round(st.x * W), Math.round(st.y * H), s * st.s, s * st.s);
      }
      ctx.globalAlpha = 1;
    }
    if (th.aurora && night > 0.05) {
      // Soft curtains: thin slices of a cached gradient riding slow waves.
      if (!this.auroraSprites) this.auroraSprites = [makeAurora('61,255,176'), makeAurora('140,110,255')];
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      const slices = 72;
      const sw = W / slices;
      const t = this.reduced ? 0 : this.frame / 150;
      for (let layer = 0; layer < 2; layer++) {
        const sprite = this.auroraSprites[layer];
        for (let k = 0; k < slices; k++) {
          const u = k / slices;
          const y = H * (0.06 + layer * 0.05 + 0.06 * Math.sin(u * 7 + t + layer * 2) + 0.03 * Math.sin(u * 17 - t * 1.3));
          const hgt = H * (0.16 + 0.07 * Math.sin(u * 5 + t * 0.7 + layer));
          ctx.globalAlpha = night * (0.22 + 0.16 * Math.sin(u * 11 + t * 0.9 + layer * 3)) * (layer ? 0.7 : 1);
          ctx.drawImage(sprite, k * sw, y, sw + 1, hgt);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // Sun by day, moon by night, each crossing the sky in an arc.
    const r = Math.max(6, Math.min(W, H) * 0.045);
    const arc = (p) => [W * (0.08 + p * 0.84), H * (0.5 - Math.sin(p * Math.PI) * 0.4)];
    const dayP = ((time + 0.06) % 1) / 0.68;
    if (dayP <= 1) {
      const [x, y] = arc(dayP);
      ctx.globalAlpha = 1 - night;
      ctx.fillStyle = '#fff3b0';
      pixelDisc(ctx, x, y, r * 1.35, cell, 'rgba(255, 243, 176, 0.35)');
      pixelDisc(ctx, x, y, r, cell, '#ffe27a');
    }
    if (time > 0.6 && time < 0.99) {
      const [x, y] = arc((time - 0.6) / 0.39);
      ctx.globalAlpha = Math.min(1, night * 1.2);
      pixelDisc(ctx, x, y, r * 0.9, cell, '#f4f1ff');
      // The crescent's shadow is painted in the sky's own colour there.
      const [top, bottom] = this.skyColours(time, theme);
      const sky = mix(top, bottom, Math.max(0, Math.min(1, y / H))).map(Math.round);
      ctx.globalAlpha = 1;
      pixelDisc(ctx, x + r * 0.35, y - r * 0.2, r * 0.75, cell, `rgb(${sky.join(',')})`);
    }
    ctx.globalAlpha = 1;
    // Clouds drift by day.
    if (night < 0.95) {
      ctx.imageSmoothingEnabled = false;
      for (const c of this.clouds) {
        const cw = c.sprite.width * cell * 1.5;
        const ch = c.sprite.height * cell * 1.5;
        const x = (((c.x + time * c.speed * 3) % 1.3) - 0.15) * W;
        ctx.globalAlpha = 0.85 * (1 - night * 0.85);
        ctx.drawImage(c.sprite, Math.round(x), Math.round(c.y * H), cw, ch);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawMarkers(ctx, world, cell, dpr, view) {
    if (!world.markers.length || view.hideMarkers) return;
    ctx.save();
    ctx.lineWidth = Math.max(2, Math.round(dpr * 2));
    ctx.font = `700 ${Math.round(13 * dpr)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    for (const m of world.markers) {
      ctx.setLineDash([cell * 2, cell * 2]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.shadowColor = 'rgba(30, 20, 40, 0.6)';
      ctx.shadowBlur = 0;
      if (m.kind === 'line') {
        const y = (m.y + 0.5) * cell;
        ctx.strokeStyle = 'rgba(40, 30, 60, 0.45)';
        ctx.beginPath();
        ctx.moveTo(0, y + dpr);
        ctx.lineTo(this.canvas.width, y + dpr);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.canvas.width, y);
        ctx.stroke();
        this.label(ctx, m.label, this.canvas.width - 10 * dpr, y - 14 * dpr, dpr, 'right');
      } else if (m.kind === 'box') {
        const x0 = m.x0 * cell;
        const y0 = m.y0 * cell;
        ctx.strokeRect(x0, y0, (m.x1 - m.x0 + 1) * cell, (m.y1 - m.y0 + 1) * cell);
        this.label(ctx, m.label, x0 + ((m.x1 - m.x0 + 1) * cell) / 2, y0 - 14 * dpr, dpr, 'center');
      } else if (m.kind === 'label') {
        this.label(ctx, m.label, (m.x + 0.5) * cell, (m.y - 2) * cell, dpr, 'center');
      }
    }
    ctx.restore();
  }

  label(ctx, text, x, y, dpr, align) {
    ctx.setLineDash([]);
    const tw = ctx.measureText(text).width;
    const pw = tw + 16 * dpr;
    const ph = 22 * dpr;
    let lx = align === 'right' ? x - pw : align === 'center' ? x - pw / 2 : x;
    lx = Math.max(4 * dpr, Math.min(this.canvas.width - pw - 4 * dpr, lx));
    const ly = Math.max(4 * dpr, y - ph / 2);
    ctx.fillStyle = 'rgba(42, 31, 61, 0.78)';
    ctx.beginPath();
    ctx.roundRect(lx, ly, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = '#fff8e8';
    ctx.textAlign = 'left';
    ctx.fillText(text, lx + 8 * dpr, ly + ph / 2 + dpr * 0.5);
  }

  drawParticles(ctx, cell) {
    for (const p of this.particles) {
      const t = p.life / p.max;
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = p.colour;
      const x = Math.round(p.x * cell);
      const y = Math.round(p.y * cell);
      if (p.kind === 'spark') {
        const s = Math.max(1, Math.round(cell * 0.6));
        ctx.fillRect(x - s, y, s * 3, s);
        ctx.fillRect(x, y - s, s, s * 3);
      } else {
        const s = Math.max(2, Math.round(cell * 0.9));
        ctx.fillRect(x, y, s, Math.max(1, Math.round(s * (0.4 + 0.6 * Math.abs(Math.sin(p.life * 6 + p.spin))))));
      }
    }
    ctx.globalAlpha = 1;
  }

  drawCursor(ctx, c, cell, dpr) {
    if (c.line) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(42, 31, 61, 0.5)';
      ctx.lineWidth = (c.r * 2 + 1) * cell + 4 * dpr;
      ctx.beginPath();
      ctx.moveTo((c.line[0] + 0.5) * cell, (c.line[1] + 0.5) * cell);
      ctx.lineTo((c.x + 0.5) * cell, (c.y + 0.5) * cell);
      ctx.stroke();
      ctx.strokeStyle = c.colour || 'rgba(255,255,255,0.8)';
      ctx.lineWidth = (c.r * 2 + 1) * cell;
      ctx.stroke();
      ctx.restore();
    }
    if (!c.visible) return;
    const x = (c.x + 0.5) * cell;
    const y = (c.y + 0.5) * cell;
    const r = Math.max(cell * 0.9, (c.r + 0.5) * cell);
    ctx.save();
    ctx.lineWidth = Math.max(1.5, 1.5 * dpr);
    if (c.spray) ctx.setLineDash([cell * 1.5, cell * 1.5]);
    ctx.strokeStyle = 'rgba(42, 31, 61, 0.75)';
    ctx.beginPath();
    ctx.arc(x, y, r + ctx.lineWidth, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = c.erase ? '#ff9bb0' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// A disc made of whole cells, so the sun and moon match the pixel art.
function pixelDisc(ctx, cx, cy, r, cell, colour) {
  const s = Math.max(1, cell);
  ctx.fillStyle = colour;
  const n = Math.ceil(r / s);
  for (let j = -n; j <= n; j++) {
    const half = Math.floor(Math.sqrt(Math.max(0, n * n - j * j)));
    if (half <= 0 && j !== 0) continue;
    ctx.fillRect(Math.round(cx / s - half) * s, Math.round(cy / s + j) * s, (half * 2 + 1) * s, s);
  }
}

// One vertical aurora slice: bright along its lower edge, fading upward.
function makeAurora(rgb) {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, `rgba(${rgb},0)`);
  grad.addColorStop(0.7, `rgba(${rgb},0.55)`);
  grad.addColorStop(0.9, `rgba(${rgb},0.9)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 64);
  return c;
}

function makeCloud(seed) {
  const r = mulberry32(seed + 5);
  const w = 26 + Math.floor(r() * 14);
  const h = 9;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const puffs = 4 + Math.floor(r() * 3);
  for (let k = 0; k < puffs; k++) {
    const px = 4 + r() * (w - 8);
    const pr = 2.5 + r() * 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dy = (y - (h - pr)) / pr;
        const dx = (x - px) / (pr * 1.3);
        if (dx * dx + dy * dy <= 1) {
          g.fillStyle = y > h - 3 ? '#e8eefb' : '#ffffff';
          g.fillRect(x, y, 1, 1);
        }
      }
    }
  }
  return c;
}

// ------------------------------------------------------------ icons and thumbnails

const iconCache = new Map();

// A data URL for an icon; silhouettes show locked or undiscovered things.
export function iconUrl(id, silhouette = false) {
  const key = `${id}:${silhouette}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const rows = ICONS[id] || ICONS.stone;
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < 12; x++) {
      const ch = row[x];
      if (!ch || ch === '.') continue;
      g.fillStyle = silhouette ? '#463d66' : INK[ch] || '#ff00ff';
      g.fillRect(x, y, 1, 1);
    }
  });
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

// Daytime colour tables, for thumbnails and the cover art generator.
export const dayLuts = () => buildLuts(TINT_DAY, 0);

let thumbLuts = null;

// A small picture of a saved garden on a daytime sky.
export function thumbnail(cells, themeId = 'meadow') {
  const { w, h } = cells;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const th = THEMES[themeId] || THEMES.meadow;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, th.day[0]);
  grad.addColorStop(1, th.day[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  if (!thumbLuts) thumbLuts = dayLuts();
  const img = g.createImageData(w, h);
  fillPixels(cells, thumbLuts, new Uint32Array(img.data.buffer), null, 0, false);
  const layer = document.createElement('canvas');
  layer.width = w;
  layer.height = h;
  layer.getContext('2d').putImageData(img, 0, 0);
  g.drawImage(layer, 0, 0);
  return c;
}

// Colours the HUD uses for sparkles at events.
export const SPARK = { sprout: '#9be584', bloom: '#ff9ccf', obsidian: '#b59cff', tree: '#ffe27a' };
