// Canvas renderer. Reads world state only; owns the camera, baked terrain
// chunks, particles and the darkness/light pass.
import { AREAS } from './areas.js';
import { CELL, SURFACE_Y, ROCK, WATER, kindAt, gateRect } from './map.js';
import { chunkShapes, cellShape } from './terrain.js';
import { SPECIES } from './creatures.js';
import { UPGRADES } from './areas.js';
import { SCAN_TIME, SONAR_R } from './world.js';
import {
  makeCanvas, bakeCreature, bakeSub, bakeGlow, bakeChest, bakeShell, bakePart, bakeHeart, bakeDock,
  bakeBubble, bakeHatch, bakeCoralWall, SPRITE_SCALE, shade,
} from './sprites.js';
import { hash2 } from './rng.js';

const CHUNK = 16; // cells per chunk side
const CHUNK_PX = CHUNK * CELL;
const MAX_CHUNKS = 26;
const DARKNESS = [0, 0.08, 0.42, 0.22, 0.86, 0.92, 0.74];
const CHUNK_PAD = 3; // world px of overlap so chunk seams never show
const TAU = Math.PI * 2;
const MAX_PARTICLES = 220;

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.cam = { x: 0, y: 0, zoom: 1, shake: 0 };
    this.time = 0;
    this.quality = 1;
    this.chunks = new Map();
    this.particles = [];
    this.labels = [];
    this.snow = [];
    this.spriteCache = new Map();
    this.bakeQueue = [];
    this.subSprites = null;
    this.subKey = '';
    this.paint = null;
    this.flash = 0;
    this.overlay = makeCanvas(8, 8);
    this.octx = this.overlay.getContext('2d');
    this.chest = bakeChest();
    this.shell = bakeShell();
    this.heart = bakeHeart();
    this.bubble = bakeBubble(8);
    this.docks = { buoy: bakeDock('buoy'), station: bakeDock('station') };
    this.parts = Object.fromEntries(UPGRADES.map((u) => [u.id, bakePart(u.icon)]));
    this.glows = {
      white: bakeGlow(64, 'rgba(255,255,255,1)'),
      warm: bakeGlow(64, 'rgba(255,230,160,1)'),
    };
    this.cone = this.bakeCone();
    this.colorGlow = new Map();
    for (let i = 0; i < 70; i++) this.snow.push({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, s: 0.6 + Math.random() * 1.6 });
    this.resize();
  }

  bakeCone() {
    const L = 360, Wd = 220;
    const c = makeCanvas(L, Wd);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(0, Wd / 2, 10, 0, Wd / 2, L);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, Wd / 2 - 8);
    ctx.lineTo(L, 0);
    ctx.lineTo(L, Wd);
    ctx.lineTo(0, Wd / 2 + 8);
    ctx.closePath();
    ctx.fill();
    return c;
  }

  glowOf(color) {
    let g = this.colorGlow.get(color);
    if (!g) {
      const [r, gg, b] = hexRgb(color);
      g = bakeGlow(48, `rgba(${r},${gg},${b},0.9)`);
      this.colorGlow.set(color, g);
    }
    return g;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1) * this.quality;
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.cam.zoom = Math.max(0.58, Math.min(1.3, Math.sqrt(this.w * this.h) / 1000));
    // Sky the camera may show above the sea. On a phone the HUD covers the top
    // of the screen, so more sky keeps Bubbles below it at the surface.
    this.skyMargin = 60 + (this.w < 720 || this.h < 520 ? 130 / this.cam.zoom : 0);
    this.overlay.width = Math.ceil(this.w / 3);
    this.overlay.height = Math.ceil(this.h / 3);
    const res = Math.min(1.25, this.cam.zoom * dpr);
    if (Math.abs((this.chunkRes || 0) - res) > 0.2) { this.chunkRes = res; this.chunks.clear(); }
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.resize();
  }

  // ---------------------------------------------------------------- world caches

  setWorld(world) {
    if (this.map === world.map) return;
    const map = world.map;
    this.map = map;
    this.chunks.clear();
    // Low-res color maps: one pixel per cell, scaled up with smoothing.
    this.waterMap = makeCanvas(map.cols, map.rows);
    this.rockMap = makeCanvas(map.cols, map.rows);
    this.darkMap = makeCanvas(map.cols, map.rows);
    const wctx = this.waterMap.getContext('2d'), rctx = this.rockMap.getContext('2d'), dctx = this.darkMap.getContext('2d');
    const wImg = wctx.createImageData(map.cols, map.rows), rImg = rctx.createImageData(map.cols, map.rows), dImg = dctx.createImageData(map.cols, map.rows);
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const i = y * map.cols + x, o = i * 4;
        const a = map.tint[i];
        const area = AREAS[a];
        const depthF = Math.min(1, Math.max(0, (y - 3) / 100));
        const [wr, wg, wb] = hexRgb(area.water);
        const lift = y < 12 ? (12 - y) / 12 * 0.35 : 0;
        wImg.data[o] = wr * (1 - depthF * 0.35) + (255 - wr) * lift;
        wImg.data[o + 1] = wg * (1 - depthF * 0.35) + (255 - wg) * lift;
        wImg.data[o + 2] = wb * (1 - depthF * 0.3) + (255 - wb) * lift;
        wImg.data[o + 3] = 255;
        const [rr, rg, rb] = hexRgb(area.rock[0]);
        rImg.data[o] = rr; rImg.data[o + 1] = rg; rImg.data[o + 2] = rb; rImg.data[o + 3] = 255;
        let dk = DARKNESS[a];
        if (y < 6) dk = 0;
        dImg.data[o] = 2; dImg.data[o + 1] = 6; dImg.data[o + 2] = 20; dImg.data[o + 3] = Math.round(dk * 255);
      }
    }
    // Soften darkness so area edges fade instead of stepping cell by cell.
    const alpha = new Float32Array(map.cols * map.rows);
    for (let i = 0; i < alpha.length; i++) alpha[i] = dImg.data[i * 4 + 3];
    for (let pass = 0; pass < 3; pass++) {
      const src = alpha.slice();
      for (let y = 0; y < map.rows; y++) {
        for (let x = 0; x < map.cols; x++) {
          let sum = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= map.cols || yy >= map.rows) continue;
            sum += src[yy * map.cols + xx]; n++;
          }
          alpha[y * map.cols + x] = sum / n;
        }
      }
    }
    for (let i = 0; i < alpha.length; i++) dImg.data[i * 4 + 3] = Math.round(alpha[i]);
    wctx.putImageData(wImg, 0, 0);
    rctx.putImageData(rImg, 0, 0);
    dctx.putImageData(dImg, 0, 0);

    this.sky = this.bakeSky(map);
    this.gateSprites = new Map(map.gates.map((g, i) => [g.id, g.kind === 'hatch' ? bakeHatch(g.w, g.h, CELL) : bakeCoralWall(g.w, g.h, CELL, 97 + i * 31)]));
    this.decorate(map);
    this.fog = makeCanvas(map.cols, map.rows);
    this.fogImg = this.fog.getContext('2d').createImageData(map.cols, map.rows);
    this.fogColors = [];
    for (let i = 0; i < map.cols * map.rows; i++) {
      const area = AREAS[map.tint[i]];
      this.fogColors.push(map.kind[i] === WATER ? hexRgb(area.water).map((v) => Math.min(255, v * 1.25 + 20)) : map.kind[i] === ROCK ? hexRgb(area.rock[1]).map((v) => v * 0.7) : [0, 0, 0]);
    }
    // Pre-bake every creature sprite over the next frames.
    for (let i = 0; i < SPECIES.length; i++) this.bakeQueue.push(i);
  }

  bakeSky(map) {
    const c = makeCanvas(map.width / 4, SURFACE_Y / 4 + 2);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#7fd4ff');
    g.addColorStop(1, '#d9f4ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) {
      const x = hash2(i, 1, 5) * c.width, y = 3 + hash2(i, 2, 5) * 8;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x + k * 4, y + (k % 2) * 1.5, 5, 3, 0, 0, TAU); ctx.fill(); }
    }
    ctx.fillStyle = '#ffe680';
    ctx.beginPath(); ctx.arc(40, 9, 6, 0, TAU); ctx.fill();
    return c;
  }

  // Decorations come from the terrain edges, sorted into chunks; lights go in a
  // list for the darkness pass; kelp stalks are swayed every frame.
  decorate(map) {
    this.decor = new Map();
    this.lights = [];
    this.kelp = [];
    this.vents = [];
    const corner = (x, y) => (x < 0 || y < 0 || x > map.cols || y > map.rows ? 1 : map.corners[y * (map.cols + 1) + x]);
    for (let cy = 0; cy < map.rows; cy++) {
      for (let cx = 0; cx < map.cols; cx++) {
        const a = corner(cx, cy), b = corner(cx + 1, cy), c = corner(cx + 1, cy + 1), d = corner(cx, cy + 1);
        const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
        if (lo > 0.5 || hi <= 0.5) continue;
        const shape = cellShape(a, b, c, d, cx * CELL, cy * CELL, CELL);
        for (const [p, q] of shape.segments) {
          const dx = q[0] - p[0], dy = q[1] - p[1];
          const len = Math.hypot(dx, dy) || 1;
          const nx = dy / len, ny = -dx / len; // toward the water
          const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
          const area = map.tint[cy * map.cols + cx];
          const r = hash2(cx, cy, 11);
          const up = ny < -0.6;
          const key = `${Math.floor(cx / CHUNK)},${Math.floor(cy / CHUNK)}`;
          const add = (o) => { if (!this.decor.has(key)) this.decor.set(key, []); this.decor.get(key).push(o); };
          if (area === 1 && up && r < 0.55 && cy > 6) this.kelp.push({ x: mx, y: my + 4, h: 110 + hash2(cx, cy, 3) * 220, phase: r * 20, w: 4 + hash2(cx, cy, 4) * 3 });
          else if (area === 0 && up && r < 0.4) add({ type: 'grass', x: mx, y: my, r, n: 3 + Math.floor(r * 10) });
          else if (area === 0 && up && r > 0.93) add({ type: 'pebble', x: mx, y: my, r });
          else if (area === 3 && up && r < 0.7) add({ type: 'coral', x: mx, y: my, r });
          else if (area === 3 && r > 0.85) add({ type: 'polyp', x: mx + nx * 3, y: my + ny * 3, r });
          else if (area === 2 && r < 0.18) add({ type: 'bolt', x: mx - nx * 8, y: my - ny * 8, r });
          else if (area === 4 && up && r < 0.3) add({ type: 'sponge', x: mx, y: my, r });
          else if (area === 5 && r < 0.3) {
            const col = r < 0.15 ? '#5ef2d0' : '#c77dff';
            add({ type: 'crystal', x: mx, y: my, nx, ny, r, col });
            if (r < 0.2) this.lights.push({ x: mx + nx * 8, y: my + ny * 8, r: 70, col });
          } else if (area === 6 && up && r < 0.12) {
            add({ type: 'chimney', x: mx, y: my, r });
            this.vents.push({ x: mx, y: my - 30 - r * 60, t: r * 5 });
            this.lights.push({ x: mx, y: my - 20, r: 90, col: '#ff8a3d' });
          } else if (area === 6 && r > 0.8) {
            add({ type: 'crack', x: mx - nx * 6, y: my - ny * 6, nx, ny, r });
          }
        }
      }
    }
  }

  chunk(kx, ky) {
    const key = `${kx},${ky}`;
    let c = this.chunks.get(key);
    if (c) { c.used = this.time; return c; }
    if (this.bakesThisFrame >= 2) return null;
    this.bakesThisFrame++;
    c = { canvas: this.bakeChunk(kx, ky), used: this.time };
    this.chunks.set(key, c);
    if (this.chunks.size > MAX_CHUNKS) {
      let oldK = null, oldT = Infinity;
      for (const [k, v] of this.chunks) if (v.used < oldT) { oldT = v.used; oldK = k; }
      this.chunks.delete(oldK);
    }
    return c;
  }

  bakeChunk(kx, ky) {
    const map = this.map;
    const res = this.chunkRes;
    const size = Math.ceil((CHUNK_PX + CHUNK_PAD * 2) * res);
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.scale(res, res);
    ctx.translate(-kx * CHUNK_PX + CHUNK_PAD, -ky * CHUNK_PX + CHUNK_PAD);
    const corner = (x, y) => (x < 0 || y < 0 || x > map.cols || y > map.rows ? 1 : map.corners[y * (map.cols + 1) + x]);
    // Shapes from one cell beyond each side cover the padded overlap.
    const cx0 = Math.max(0, kx * CHUNK - 1), cy0 = Math.max(0, ky * CHUNK - 1);
    const cols = Math.min(CHUNK + 2, map.cols - cx0), rows = Math.min(CHUNK + 2, map.rows - cy0);
    if (cols <= 0 || rows <= 0) return canvas;
    const { polys, segments, full } = chunkShapes(corner, cx0, cy0, cols, rows, CELL);
    if (!polys.length && !full.length) return canvas;
    const path = new Path2D();
    for (const [x, y] of full) path.rect(x - 0.5, y - 0.5, CELL + 1, CELL + 1);
    for (const poly of polys) {
      path.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
      path.closePath();
    }
    // Skip air: rock above the surface never exists, but guard anyway.
    ctx.save();
    ctx.clip(path);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.rockMap, cx0 - 1, cy0 - 1, cols + 2, rows + 2, (cx0 - 1) * CELL + CELL / 2, (cy0 - 1) * CELL + CELL / 2, (cols + 2) * CELL, (rows + 2) * CELL);
    // Texture: seeded speckles and strata.
    for (let cy = cy0; cy < cy0 + rows; cy++) {
      for (let cx = cx0; cx < cx0 + cols; cx++) {
        if (kindAt(map, cx, cy) !== ROCK && kindAt(map, cx, cy) !== WATER) continue;
        const area = map.tint[cy * map.cols + cx];
        const rock = AREAS[area].rock;
        for (let k = 0; k < 3; k++) {
          const r = hash2(cx * 3 + k, cy, 21);
          ctx.fillStyle = k === 0 ? rock[1] : rock[2];
          ctx.globalAlpha = 0.25 + r * 0.25;
          const s = 2 + r * 5;
          ctx.beginPath(); ctx.ellipse(cx * CELL + hash2(cx, cy * 3 + k, 22) * CELL, cy * CELL + hash2(cx, cy * 3 + k, 23) * CELL, s, s * 0.7, r * 3, 0, TAU); ctx.fill();
        }
        if (area === 2) {
          // Ship planks.
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = rock[1];
          ctx.fillRect(cx * CELL, cy * CELL + 15, CELL, 2);
          if (hash2(cx, cy, 31) < 0.3) ctx.fillRect(cx * CELL + 10, cy * CELL, 2, 16);
        }
      }
    }
    ctx.globalAlpha = 1;
    // Inner shading along edges.
    if (segments.length) {
      const edge = new Path2D();
      for (const [p, q] of segments) { edge.moveTo(p[0], p[1]); edge.lineTo(q[0], q[1]); }
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 26;
      ctx.stroke(edge);
      ctx.restore();
      // Rims: floors get a sandy or mossy top, walls a light edge.
      ctx.lineCap = 'round';
      for (const [p, q] of segments) {
        const dx = q[0] - p[0], dy = q[1] - p[1];
        const len = Math.hypot(dx, dy) || 1;
        const ny = -dx / len;
        const cx = Math.floor((p[0] + q[0]) / 2 / CELL), cy = Math.floor((p[1] + q[1]) / 2 / CELL);
        const rock = AREAS[map.tint[Math.min(map.rows - 1, Math.max(0, cy)) * map.cols + Math.min(map.cols - 1, Math.max(0, cx))]].rock;
        ctx.strokeStyle = ny < -0.5 ? rock[2] : shade(rock[2], -0.15);
        ctx.lineWidth = ny < -0.5 ? 7 : 3.5;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
    } else {
      ctx.restore();
    }
    // Decorations.
    // Decorations from this chunk and its neighbours (they may overhang the edge).
    const bx0 = kx * CHUNK_PX - 70, by0 = ky * CHUNK_PX - 90, bx1 = (kx + 1) * CHUNK_PX + 70, by1 = (ky + 1) * CHUNK_PX + 70;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const d of this.decor.get(`${kx + dx},${ky + dy}`) || []) {
          if (d.x > bx0 && d.x < bx1 && d.y > by0 && d.y < by1) this.drawDecor(ctx, d);
        }
      }
    }
    return canvas;
  }

  drawDecor(ctx, d) {
    const { x, y, r } = d;
    if (d.type === 'grass') {
      ctx.strokeStyle = r < 0.2 ? '#5fbf5a' : '#7fcf6a';
      ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      for (let i = 0; i < d.n % 5 + 2; i++) {
        const ox = (i - 2) * 4, h = 14 + hash2(i, Math.floor(x), 9) * 18;
        ctx.beginPath(); ctx.moveTo(x + ox, y + 2); ctx.quadraticCurveTo(x + ox + 4, y - h * 0.5, x + ox + (i % 2 ? 6 : -4), y - h); ctx.stroke();
      }
    } else if (d.type === 'pebble') {
      ctx.fillStyle = r > 0.97 ? '#ff7a3d' : '#f5f0e0';
      if (r > 0.97) { // a little sea star
        ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU; const rr = i % 2 ? 3 : 7; ctx.lineTo(x + Math.cos(a) * rr, y - 3 + Math.sin(a) * rr); } ctx.fill();
      } else { ctx.beginPath(); ctx.ellipse(x, y, 6, 3.5, 0, Math.PI, TAU); ctx.fill(); ctx.strokeStyle = '#d9b77a'; ctx.lineWidth = 1; ctx.stroke(); }
    } else if (d.type === 'coral') {
      const cols = ['#ff7eb6', '#ffb36a', '#b07aff', '#ff5a7a', '#5ef2d0', '#ffd23f'];
      const col = cols[Math.floor(r * 60) % cols.length];
      const kind = Math.floor(r * 100) % 4;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round';
      if (kind === 0) {
        const branch = (bx, by, ang, len, w, depth) => {
          const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
          ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
          if (depth > 0) { branch(ex, ey, ang - 0.45, len * 0.72, w * 0.75, depth - 1); branch(ex, ey, ang + 0.4, len * 0.7, w * 0.75, depth - 1); }
        };
        branch(x, y + 3, -Math.PI / 2 + (r - 0.3) * 0.5, 16 + r * 10, 5, 3);
      } else if (kind === 1) {
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.arc(x, y, 18 + r * 8, Math.PI * 1.1, Math.PI * 1.9); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = shade(col, -0.3); ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) { const a = Math.PI * 1.1 + (i / 5) * Math.PI * 0.8; ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20); ctx.stroke(); }
      } else if (kind === 2) {
        for (let i = 0; i < 3; i++) { ctx.fillRect(x - 9 + i * 7, y - 10 - i * 6 - r * 6, 6, 14 + i * 6 + r * 6); ctx.fillStyle = shade(col, -0.35); ctx.fillRect(x - 8 + i * 7, y - 10 - i * 6 - r * 6, 4, 3); ctx.fillStyle = col; }
      } else {
        ctx.beginPath(); ctx.ellipse(x, y, 14, 10, 0, Math.PI, TAU); ctx.fill();
        ctx.strokeStyle = shade(col, -0.3); ctx.lineWidth = 1.5;
        ctx.beginPath(); for (let i = -12; i <= 12; i += 3) ctx.lineTo(x + i, y - 5 + Math.sin(i) * 2); ctx.stroke();
      }
    } else if (d.type === 'polyp') {
      ctx.fillStyle = r > 0.92 ? '#ffd23f' : '#ff9fd0';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + (i - 1.5) * 4, y + (i % 2) * 3, 2, 0, TAU); ctx.fill(); }
    } else if (d.type === 'bolt') {
      ctx.fillStyle = '#c9a77a';
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
      if (r < 0.04) { ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill(); ctx.strokeStyle = '#c9a77a'; ctx.lineWidth = 3; ctx.stroke(); }
    } else if (d.type === 'sponge') {
      ctx.fillStyle = r < 0.15 ? '#7aa8ff' : '#a07ad0';
      ctx.beginPath(); ctx.roundRect(x - 6, y - 22 - r * 30, 12, 24 + r * 30, 6); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y - 18 - r * 30, 3.5, 2, 0, 0, TAU); ctx.fill();
    } else if (d.type === 'crystal') {
      const g = this.glowOf(d.col);
      ctx.globalAlpha = 0.7;
      ctx.drawImage(g, x - 30, y - 30, 60, 60);
      ctx.globalAlpha = 1;
      ctx.fillStyle = d.col;
      const ang = Math.atan2(d.ny, d.nx);
      for (let i = 0; i < 3; i++) {
        const a = ang + (i - 1) * 0.45, len = 12 + hash2(i, Math.floor(x), 3) * 14;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a + 1.57) * 4, y + Math.sin(a + 1.57) * 4);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.lineTo(x + Math.cos(a - 1.57) * 4, y + Math.sin(a - 1.57) * 4);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(x + d.nx * 6, y + d.ny * 6, 2, 0, TAU); ctx.fill();
    } else if (d.type === 'chimney') {
      ctx.fillStyle = '#3a2424';
      ctx.beginPath(); ctx.moveTo(x - 14, y + 4); ctx.lineTo(x - 7, y - 30 - r * 60); ctx.lineTo(x + 7, y - 30 - r * 60); ctx.lineTo(x + 14, y + 4); ctx.fill();
      ctx.fillStyle = '#ff8a3d'; ctx.fillRect(x - 6, y - 32 - r * 60, 12, 4);
      ctx.strokeStyle = 'rgba(255,138,61,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 2, y - 20); ctx.lineTo(x + 2, y - 28); ctx.stroke();
    } else if (d.type === 'crack') {
      ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - d.nx * 10 + d.ny * 6, y - d.ny * 10 - d.nx * 6); ctx.lineTo(x - d.nx * 18, y - d.ny * 18); ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- sprites

  creatureSprite(si, frame) {
    const key = si * 2 + frame;
    let s = this.spriteCache.get(key);
    if (!s) {
      if (this.bakesThisFrame > 6) return null;
      this.bakesThisFrame++;
      s = bakeCreature(SPECIES[si], frame);
      this.spriteCache.set(key, s);
    }
    return s;
  }

  // Bake a few queued sprites; call during menus and the first frames.
  warm(budgetMs = 6) {
    const t0 = performance.now();
    while (this.bakeQueue.length && performance.now() - t0 < budgetMs) {
      const si = this.bakeQueue.shift();
      for (const f of [0, 1]) if (!this.spriteCache.has(si * 2 + f)) this.spriteCache.set(si * 2 + f, bakeCreature(SPECIES[si], f));
    }
  }

  subSprite(world, paint) {
    const key = `${paint.id}:${[...world.ups].sort().join(',')}`;
    if (key !== this.subKey) {
      this.subKey = key;
      this.subSprites = [0, 1, 2].map((f) => bakeSub(paint, world.ups, f));
    }
    return this.subSprites;
  }

  // ---------------------------------------------------------------- events and particles

  spawn(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  burst(x, y, n, opts = {}) {
    const k = this.reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < k; i++) {
      const a = Math.random() * TAU, sp = (opts.speed || 120) * (0.3 + Math.random() * 0.7);
      this.spawn({ type: opts.type || 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.lift || 0), life: 0, max: opts.life || 0.8, size: opts.size || 3, color: opts.color || '#ffe58a' });
    }
  }

  label(x, y, text, color = '#ffffff') {
    if (this.quiet) return;
    this.labels.push({ x, y, text, color, life: 0 });
    if (this.labels.length > 6) this.labels.shift();
  }

  // `quiet` keeps the sparkles but drops the text labels: the title demo
  // must not tell the player about finds that are not theirs.
  handleEvents(events, world, { quiet = false } = {}) {
    this.quiet = quiet;
    for (const e of events) {
      if (e.type === 'bump') {
        if (!this.reduced) this.cam.shake = Math.max(this.cam.shake, 3 + e.power * 6);
        this.burst(e.x, e.y, 8, { type: 'bubble', speed: 60, life: 1.1, size: 4, lift: 30 });
      } else if (e.type === 'sonar') {
        this.flash = this.reduced ? 0 : 0.1;
      } else if (e.type === 'scan') {
        this.burst(e.x, e.y, 18, { color: e.first ? '#8affff' : '#ffffff', speed: 150, life: 0.9 });
        this.label(e.x, e.y - 30, e.first ? `New! ${SPECIES[e.species].name}` : SPECIES[e.species].name, '#bfffff');
      } else if (e.type === 'treasure') {
        this.burst(e.x, e.y, 22, { color: '#ffd23f', speed: 170 });
        this.label(e.x, e.y - 24, e.name, '#ffe58a');
      } else if (e.type === 'shell') {
        this.burst(e.x, e.y, 30, { color: '#fff3b0', speed: 200, life: 1.1 });
        this.label(e.x, e.y - 24, 'Golden shell!', '#ffe58a');
      } else if (e.type === 'part' || e.type === 'heart') {
        this.burst(e.x, e.y, 40, { color: '#ffffff', speed: 240, life: 1.2, size: 4 });
        this.burst(e.x, e.y, 20, { color: '#ffd23f', speed: 160, life: 1.2 });
      } else if (e.type === 'gate') {
        const coral = e.kind === 'coral';
        for (let i = 0; i < (this.reduced ? 8 : 26); i++) {
          const a = Math.random() * TAU, sp = 60 + Math.random() * 160;
          this.spawn({ type: 'chunk', x: e.x + (Math.random() - 0.5) * 60, y: e.y + (Math.random() - 0.5) * 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 1.4, size: 3 + Math.random() * 5, color: coral ? ['#ff7eb6', '#ffa3c9', '#ffb36a'][i % 3] : ['#8a6a52', '#c96a2a', '#5a4434'][i % 3] });
        }
        this.burst(e.x, e.y, 14, { type: 'bubble', speed: 90, life: 1.3, size: 5, lift: 40 });
        if (!this.reduced) this.cam.shake = 7;
      } else if (e.type === 'dock') {
        const d = world.map.docks.find((q) => q.id === e.dock);
        if (d) this.burst(d.x * CELL + 16, d.y * CELL + 16, 16, { type: 'bubble', speed: 80, life: 1.4, size: 5, lift: 40 });
      } else if (e.type === 'reveal') {
        this.burst(e.x, e.y, 10, { color: '#bfffff', speed: 80, life: 0.7 });
      } else if (e.type === 'startle') {
        this.label(e.x, e.y - 26, '!', '#ffd23f');
      } else if (e.type === 'returned') {
        this.snapCamera(world);
      }
    }
    this.quiet = false;
  }

  snapCamera(world) {
    this.cam.x = world.sub.x;
    this.cam.y = world.sub.y;
    this.clampCamera(world.map);
  }

  // Keep the view inside the world (a little sky allowed above the surface).
  clampCamera(map) {
    const hw = this.w / 2 / this.cam.zoom, hh = this.h / 2 / this.cam.zoom;
    this.cam.x = hw * 2 >= map.width ? map.width / 2 : Math.max(hw, Math.min(map.width - hw, this.cam.x));
    this.cam.y = Math.max(hh - (this.skyMargin || 60), Math.min(map.height - hh, this.cam.y));
  }

  update(dt, world) {
    this.time += dt;
    const s = world.sub;
    // Camera: follow with a little lead in the swim direction.
    const lx = s.x + s.vx * 0.35, ly = s.y + s.vy * 0.25;
    const k = Math.min(1, dt * 3.2);
    this.cam.x += (lx - this.cam.x) * k;
    this.cam.y += (ly - this.cam.y) * k;
    this.clampCamera(world.map);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 18);
    this.flash = Math.max(0, this.flash - dt);

    // Propeller bubbles.
    this.bubbleT = (this.bubbleT || 0) - dt * (0.4 + s.thrust * 2.5);
    if (this.bubbleT <= 0 && world.status === 'play') {
      this.bubbleT = this.reduced ? 0.4 : 0.12;
      this.spawn({ type: 'bubble', x: s.x - s.face * 44, y: s.y + (Math.random() - 0.5) * 6, vx: -s.face * (20 + Math.random() * 30), vy: -20 - Math.random() * 20, life: 0, max: 1.4 + Math.random(), size: 2 + Math.random() * 3 });
    }
    // Vent bubbles and current streaks near the camera.
    const view = this.viewRect(200);
    this.ventT = (this.ventT || 0) - dt;
    if (this.ventT <= 0) {
      this.ventT = this.reduced ? 0.5 : 0.18;
      for (const v of this.vents) if (v.x > view.x0 && v.x < view.x1 && v.y > view.y0 && v.y < view.y1) this.spawn({ type: 'bubble', x: v.x + (Math.random() - 0.5) * 8, y: v.y, vx: (Math.random() - 0.5) * 10, vy: -40 - Math.random() * 40, life: 0, max: 2.2, size: 2 + Math.random() * 3 });
      for (const c of world.map.currents) {
        const x0 = c.x * CELL, y0 = c.y * CELL;
        if (x0 > view.x1 || x0 + c.w * CELL < view.x0 || y0 > view.y1 || y0 + c.h * CELL < view.y0) continue;
        for (let i = 0; i < 2; i++) this.spawn({ type: 'streak', x: x0 + Math.random() * c.w * CELL, y: y0 + Math.random() * c.h * CELL, vx: c.dx * 380, vy: c.dy * 380, life: 0, max: 0.6, size: 18 });
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'bubble') { p.vy -= 30 * dt; p.vx *= 0.98; p.x += Math.sin((p.life + p.size) * 6) * 0.3; if (p.y < SURFACE_Y) p.life = p.max; }
      else if (p.type === 'chunk') { p.vy += 120 * dt; p.vx *= 0.97; }
      else if (p.type === 'spark') { p.vx *= 0.94; p.vy *= 0.94; }
    }
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i];
      l.life += dt;
      l.y -= 22 * dt;
      if (l.life > 2.2) this.labels.splice(i, 1);
    }
  }

  viewRect(pad = 0) {
    const hw = this.w / 2 / this.cam.zoom, hh = this.h / 2 / this.cam.zoom;
    return { x0: this.cam.x - hw - pad, x1: this.cam.x + hw + pad, y0: this.cam.y - hh - pad, y1: this.cam.y + hh + pad };
  }

  toWorld(clientX, clientY) {
    return { x: this.cam.x + (clientX - this.w / 2) / this.cam.zoom, y: this.cam.y + (clientY - this.h / 2) / this.cam.zoom };
  }

  // ---------------------------------------------------------------- draw

  draw(world, opts = {}) {
    const ctx = this.ctx;
    const map = world.map;
    this.bakesThisFrame = 0;
    const z = this.cam.zoom * this.dpr;
    const sx = this.cam.shake ? (Math.random() - 0.5) * this.cam.shake : 0;
    const sy = this.cam.shake ? (Math.random() - 0.5) * this.cam.shake : 0;
    const view = this.viewRect();
    const ox = this.w / 2 / this.cam.zoom - this.cam.x + sx, oy = this.h / 2 / this.cam.zoom - this.cam.y + sy;
    ctx.setTransform(z, 0, 0, z, ox * z, oy * z);
    ctx.imageSmoothingEnabled = true;

    // Water: the low-res color map, stretched and smoothed.
    const vw = view.x1 - view.x0, vh = view.y1 - view.y0;
    ctx.drawImage(this.waterMap, view.x0 / CELL - 0.5, view.y0 / CELL - 0.5, vw / CELL, vh / CELL, view.x0, view.y0, vw, vh);
    if (view.y0 < 0) {
      ctx.fillStyle = '#7fd4ff';
      ctx.fillRect(view.x0, view.y0, vw, -view.y0 + 1);
    }
    if (view.y0 < SURFACE_Y) {
      ctx.drawImage(this.sky, view.x0 / 4, view.y0 / 4, vw / 4, (SURFACE_Y - view.y0) / 4, view.x0, view.y0, vw, SURFACE_Y - view.y0);
    }
    this.drawRays(ctx, view);
    this.drawSnow(ctx, view);
    this.drawKelp(ctx, view, 0);

    // Docks sit behind the terrain edge so stations look planted.
    for (const d of map.docks) {
      const x = d.x * CELL + CELL / 2, y = d.y * CELL + CELL / 2;
      if (x < view.x0 - 80 || x > view.x1 + 80 || y < view.y0 - 80 || y > view.y1 + 80) continue;
      const surf = d.y <= 3;
      const img = surf ? this.docks.buoy : this.docks.station;
      const bob = surf ? Math.sin(this.time * 1.6 + d.x) * 2 : 0;
      ctx.drawImage(img, x - 60, (surf ? SURFACE_Y - 40 : y - 64) + bob, 120, 120);
    }

    // Terrain chunks.
    const k0 = Math.max(0, Math.floor(view.x0 / CHUNK_PX)), k1 = Math.floor(view.x1 / CHUNK_PX);
    const j0 = Math.max(0, Math.floor(view.y0 / CHUNK_PX)), j1 = Math.floor(view.y1 / CHUNK_PX);
    for (let ky = j0; ky <= j1; ky++) {
      for (let kx = k0; kx <= k1; kx++) {
        if (kx * CHUNK >= map.cols || ky * CHUNK >= map.rows) continue;
        const c = this.chunk(kx, ky);
        if (c) ctx.drawImage(c.canvas, kx * CHUNK_PX - CHUNK_PAD, ky * CHUNK_PX - CHUNK_PAD, CHUNK_PX + CHUNK_PAD * 2, CHUNK_PX + CHUNK_PAD * 2);
      }
    }
    this.drawSurface(ctx, view);

    // Gates.
    for (const g of map.gates) {
      if (world.opened.has(g.id)) continue;
      const r = gateRect(g);
      if (r.x > view.x1 || r.x + r.w < view.x0 || r.y > view.y1 || r.y + r.h < view.y0) continue;
      const img = this.gateSprites.get(g.id);
      if (g.kind === 'hatch') ctx.drawImage(img, r.x, r.y, r.w, r.h);
      else ctx.drawImage(img, r.x - 8, r.y - 8, r.w + 16, r.h + 16);
    }

    this.drawItems(ctx, world, view);
    this.drawCreatures(ctx, world, view);
    this.drawSub(ctx, world, opts.paint);
    this.drawParticles(ctx, view);
    this.drawKelp(ctx, view, 1);

    // Darkness, with lights punched out of it.
    this.drawDarkness(ctx, world, view);

    // Over the dark: sonar rings, scanning, labels.
    ctx.setTransform(z, 0, 0, z, ox * z, oy * z);
    for (const p of world.pings) {
      const a = Math.max(0, 1 - p.r / SONAR_R);
      ctx.strokeStyle = `rgba(140,255,240,${(0.75 * a).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(140,255,240,${(0.3 * a).toFixed(3)})`;
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0, p.r - 14), 0, TAU); ctx.stroke();
    }
    this.drawScan(ctx, world);
    ctx.font = '700 15px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(5,20,40,0.75)';
    for (const l of this.labels) {
      ctx.globalAlpha = Math.min(1, 2.2 - l.life);
      ctx.strokeText(l.text, l.x, l.y);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, l.x, l.y);
    }
    ctx.globalAlpha = 1;
    if (this.flash > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(140,255,240,${(this.flash * 0.6).toFixed(3)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  drawRays(ctx, view) {
    if (view.y0 > 26 * CELL) return;
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = '#ffffff';
    const sway = this.reduced ? 0 : Math.sin(this.time * 0.3) * 40;
    const start = Math.floor(view.x0 / 260) - 1;
    for (let i = start; i < start + Math.ceil((view.x1 - view.x0) / 260) + 3; i++) {
      const x = i * 260 + hash2(i, 0, 3) * 120;
      const w = 40 + hash2(i, 1, 3) * 60;
      ctx.beginPath();
      ctx.moveTo(x, SURFACE_Y);
      ctx.lineTo(x + w, SURFACE_Y);
      ctx.lineTo(x + w + 260 + sway, SURFACE_Y + 700);
      ctx.lineTo(x + 180 + sway, SURFACE_Y + 700);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawSnow(ctx, view) {
    const w = view.x1 - view.x0, h = view.y1 - view.y0;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const p of this.snow) {
      const px = view.x0 + ((((p.x * 1600 - this.cam.x * p.z * 0.5 + this.time * 6 * p.z) % 1600) + 1600) % 1600) / 1600 * w;
      const py = view.y0 + ((((p.y * 1200 - this.cam.y * p.z * 0.5 + this.time * 10 * p.z) % 1200) + 1200) % 1200) / 1200 * h;
      ctx.fillRect(px, py, p.s, p.s);
    }
  }

  drawSurface(ctx, view) {
    if (view.y0 > SURFACE_Y + 20) return;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    const x0 = Math.floor(view.x0 / 24) * 24;
    ctx.moveTo(x0, SURFACE_Y - 6);
    for (let x = x0; x <= view.x1 + 24; x += 24) ctx.lineTo(x, SURFACE_Y - 2 + Math.sin(x * 0.03 + this.time * 2) * 3);
    ctx.lineTo(view.x1 + 24, SURFACE_Y + 4);
    ctx.lineTo(x0, SURFACE_Y + 4);
    ctx.closePath();
    ctx.fill();
  }

  drawKelp(ctx, view, layer) {
    if (!this.kelp.length) return;
    const t = this.reduced ? 0 : this.time;
    const stem = new Path2D(), leaf = new Path2D();
    let any = false;
    for (let i = 0; i < this.kelp.length; i++) {
      // Every fourth stalk sways in front of Bubbles for depth.
      if ((i % 4 === 3) !== (layer === 1)) continue;
      const k = this.kelp[i];
      if (k.x < view.x0 - 120 || k.x > view.x1 + 120 || k.y - k.h > view.y1 || k.y < view.y0) continue;
      any = true;
      let px = k.x, py = k.y;
      stem.moveTo(px, py);
      for (let s = 1; s <= 7; s++) {
        const f = s / 7;
        const nx = k.x + Math.sin(t * 0.9 + k.phase + f * 2.2) * f * 22, ny = k.y - k.h * f;
        stem.quadraticCurveTo(px, (py + ny) / 2, nx, ny);
        if (s > 1) { const side = s % 2 ? 1 : -1; leaf.moveTo(nx + side * 19, ny + 4); leaf.ellipse(nx + side * 9, ny + 4, 10, 4, side * 0.6, 0, TAU); }
        px = nx; py = ny;
      }
    }
    if (!any) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = layer ? 0.6 : 1;
    ctx.strokeStyle = layer ? '#2f6a2a' : '#4f8a3a';
    ctx.lineWidth = 5;
    ctx.stroke(stem);
    ctx.fillStyle = layer ? '#3f7a32' : '#6aa84f';
    ctx.fill(leaf);
    ctx.globalAlpha = 1;
  }

  drawItems(ctx, world, view) {
    const map = world.map;
    const t = this.time;
    const inView = (x, y, pad = 60) => x > view.x0 - pad && x < view.x1 + pad && y > view.y0 - pad && y < view.y1 + pad;
    for (const tr of map.treasures) {
      if (world.treasures.has(tr.id)) continue;
      const x = tr.x * CELL + CELL / 2, y = tr.y * CELL + CELL / 2 + Math.sin(t * 2 + tr.x) * 2;
      if (!inView(x, y)) continue;
      ctx.drawImage(this.chest, x - 28, y - 26, 56, 48);
      if ((t * 0.7 + tr.x * 0.37) % 2 < 0.25) this.sparkle(ctx, x + 10, y - 12, 6);
    }
    for (const sh of map.shells) {
      if (world.shells.has(sh.id)) continue;
      const x = sh.x * CELL + CELL / 2, y = sh.y * CELL + CELL / 2 + Math.sin(t * 2.4 + sh.x) * 3;
      if (!inView(x, y)) continue;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.glows.warm, x - 34, y - 34, 68, 68);
      ctx.globalAlpha = 1;
      const sxs = this.reduced ? 1 : Math.abs(Math.cos(t * 1.5 + sh.y)) * 0.6 + 0.4;
      ctx.drawImage(this.shell, x - 24 * sxs, y - 24, 48 * sxs, 48);
      if ((t + sh.y) % 1.5 < 0.2) this.sparkle(ctx, x - 8, y - 10, 7);
    }
    for (const p of map.parts) {
      if (world.ups.has(p.id)) continue;
      const x = p.x * CELL + CELL / 2, y = p.y * CELL + CELL / 2 + Math.sin(t * 2) * 4;
      if (!inView(x, y)) continue;
      const pulse = 1 + Math.sin(t * 4) * 0.06;
      ctx.drawImage(this.parts[p.id], x - 32 * pulse, y - 32 * pulse, 64 * pulse, 64 * pulse);
    }
    if (!world.heart) {
      const h = map.heart;
      const x = h.x * CELL + CELL / 2, y = h.y * CELL + CELL / 2 + Math.sin(t * 1.5) * 5;
      if (inView(x, y, 100)) {
        const pulse = 1 + Math.sin(t * 3) * 0.08;
        ctx.drawImage(this.heart, x - 48 * pulse, y - 48 * pulse, 96 * pulse, 96 * pulse);
      }
    }
  }

  sparkle(ctx, x, y, r) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y - r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.25, y + r * 0.25);
    ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y + r * 0.25); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.25, y - r * 0.25);
    ctx.closePath(); ctx.fill();
  }

  drawCreatures(ctx, world, view) {
    const t = this.time;
    for (const c of world.creatures) {
      const pad = c.sp.size * 1.5;
      if (c.x < view.x0 - pad || c.x > view.x1 + pad || c.y < view.y0 - pad || c.y > view.y1 + pad) continue;
      const frame = Math.sin(c.phase) > 0 ? 1 : 0;
      const s = this.creatureSprite(c.species, frame);
      if (!s) continue;
      let alpha = 1;
      if (c.sp.beh === 'hide' && !world.visible(c)) alpha = 0.1 + (this.reduced ? 0 : Math.max(0, Math.sin(t * 1.3 + c.id)) * 0.08);
      else if (c.sp.beh === 'hide' && c.revealUntil - world.t < 2) alpha = 0.3 + 0.7 * Math.max(0, (c.revealUntil - world.t) / 2);
      ctx.globalAlpha = alpha;
      const upright = c.sp.spot === 'floor' || ['jelly', 'comb', 'octopus', 'dumbo', 'seahorse', 'anemone', 'tubeworm', 'worm', 'brain', 'clam', 'star', 'urchin'].includes(c.sp.shape);
      const flip = upright ? 1 : c.face;
      const bob = c.sp.beh === 'still' ? 0 : Math.sin(c.phase * 0.5) * 2;
      const tilt = upright ? 0 : Math.max(-0.5, Math.min(0.5, (c.vy / (Math.abs(c.vx) + 30)) * 0.4)) * flip;
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      if (tilt) ctx.rotate(tilt);
      ctx.scale(flip, 1);
      ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
      if (world.scanned.has(c.sp.id) && alpha === 1 && !world.wanted.has(c.sp.id)) {
        // a tiny check mark: already in the book
      } else if (world.wanted.has(c.sp.id) && alpha > 0.5) {
        ctx.fillStyle = '#ffd23f';
        ctx.font = '700 14px ui-rounded, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★', c.x, c.y - c.sp.size * 0.55 - 6 + Math.sin(t * 4) * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawSub(ctx, world, paint) {
    if (!paint) return;
    const s = world.sub;
    const sprites = this.subSprite(world, paint);
    const frame = Math.floor(this.time * (6 + s.thrust * 18)) % 3;
    const sp = sprites[frame];
    const bob = this.reduced ? 0 : Math.sin(this.time * 2) * 2 * (1 - s.thrust);
    ctx.save();
    ctx.translate(s.x, s.y + bob);
    ctx.rotate(s.tilt * s.face);
    ctx.scale(s.face, 1);
    ctx.drawImage(sp.canvas, -sp.ox, -sp.oy, sp.w, sp.h);
    ctx.restore();
  }

  drawParticles(ctx, view) {
    for (const p of this.particles) {
      if (p.x < view.x0 - 30 || p.x > view.x1 + 30 || p.y < view.y0 - 30 || p.y > view.y1 + 30) continue;
      const f = 1 - p.life / p.max;
      if (p.type === 'bubble') {
        ctx.globalAlpha = Math.min(1, f * 2);
        ctx.drawImage(this.bubble, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else if (p.type === 'streak') {
        ctx.globalAlpha = Math.sin(f * Math.PI) * 0.5;
        ctx.strokeStyle = '#d8fbff';
        ctx.lineWidth = 2;
        const l = Math.hypot(p.vx, p.vy) || 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - (p.vx / l) * p.size * 2, p.y - (p.vy / l) * p.size * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = f;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawDarkness(ctx, world, view) {
    const o = this.octx, ow = this.overlay.width, oh = this.overlay.height;
    const map = world.map;
    const s = world.sub;
    // Quick check: is any dark cell on screen?
    const ys = Math.floor(view.y1 / CELL);
    if (ys < 12) return;
    const scale = ow / (view.x1 - view.x0);
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, ow, oh);
    o.imageSmoothingEnabled = true;
    o.drawImage(this.darkMap, view.x0 / CELL - 0.5, view.y0 / CELL - 0.5, (view.x1 - view.x0) / CELL, (view.y1 - view.y0) / CELL, 0, 0, ow, oh);
    o.globalCompositeOperation = 'destination-out';
    o.setTransform(scale, 0, 0, scale, -view.x0 * scale, -view.y0 * scale);
    const glow = this.glows.white;
    const lights = world.ups.has('lights');
    // Sub halo and headlights.
    const halo = lights ? 170 : 120;
    o.globalAlpha = 0.95;
    o.drawImage(glow, s.x - halo, s.y - halo, halo * 2, halo * 2);
    if (lights) {
      o.save();
      o.translate(s.x + s.face * 28, s.y - 4);
      o.rotate(s.tilt * s.face);
      o.scale(s.face, 1);
      o.globalAlpha = 1;
      o.drawImage(this.cone, 0, -110, 360, 220);
      o.restore();
    }
    // Glowing creatures, crystals, docks.
    o.globalAlpha = 0.85;
    for (const c of world.creatures) {
      if (!c.sp.glow) continue;
      if (c.x < view.x0 - 80 || c.x > view.x1 + 80 || c.y < view.y0 - 80 || c.y > view.y1 + 80) continue;
      const r = 26 + c.sp.size * 0.6 + Math.sin(c.phase) * 4;
      o.drawImage(glow, c.x - r, c.y - r, r * 2, r * 2);
    }
    for (const l of this.lights) {
      if (l.x < view.x0 - 100 || l.x > view.x1 + 100 || l.y < view.y0 - 100 || l.y > view.y1 + 100) continue;
      o.drawImage(glow, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    for (const d of map.docks) {
      const x = d.x * CELL + 16, y = d.y * CELL + 16;
      if (x < view.x0 - 200 || x > view.x1 + 200 || y < view.y0 - 200 || y > view.y1 + 200) continue;
      o.drawImage(glow, x - 150, y - 150, 300, 300);
    }
    // Pickups glint through the dark a little, so explorers can spot them.
    o.globalAlpha = 0.5;
    for (const sh of map.shells) {
      if (world.shells.has(sh.id)) continue;
      const x = sh.x * CELL + 16, y = sh.y * CELL + 16;
      if (x < view.x0 - 60 || x > view.x1 + 60 || y < view.y0 - 60 || y > view.y1 + 60) continue;
      o.drawImage(glow, x - 40, y - 40, 80, 80);
    }
    for (const p of map.parts) {
      if (world.ups.has(p.id)) continue;
      const x = p.x * CELL + 16, y = p.y * CELL + 16;
      if (x < view.x0 - 80 || x > view.x1 + 80 || y < view.y0 - 80 || y > view.y1 + 80) continue;
      o.drawImage(glow, x - 70, y - 70, 140, 140);
    }
    if (!world.heart) {
      const x = map.heart.x * CELL + 16, y = map.heart.y * CELL + 16;
      if (x > view.x0 - 200 && x < view.x1 + 200 && y > view.y0 - 200 && y < view.y1 + 200) { o.globalAlpha = 1; o.drawImage(glow, x - 160, y - 160, 320, 320); }
    }
    // Sonar rings light the dark as they pass.
    o.globalAlpha = 1;
    for (const p of world.pings) {
      const a = Math.max(0, 1 - p.r / SONAR_R);
      o.strokeStyle = `rgba(0,0,0,${(0.7 * a).toFixed(3)})`;
      o.lineWidth = 60;
      o.beginPath(); o.arc(p.x, p.y, Math.max(1, p.r - 20), 0, TAU); o.stroke();
    }
    o.globalCompositeOperation = 'source-over';
    o.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.overlay, 0, 0, ow, oh, 0, 0, this.canvas.width, this.canvas.height);
  }

  drawScan(ctx, world) {
    const sc = world.scan;
    const c = sc.target;
    if (!c) return;
    const r = c.sp.size * 0.6 + 14;
    const f = Math.min(1, sc.t / SCAN_TIME);
    ctx.strokeStyle = 'rgba(140,255,240,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -this.time * 20;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#8affff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(c.x, c.y, r, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
    // A gentle beam from Bubbles.
    const s = world.sub;
    ctx.strokeStyle = 'rgba(140,255,240,0.25)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(s.x + s.face * 20, s.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    ctx.font = '700 14px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(5,20,40,0.8)';
    const name = world.scanned.has(c.sp.id) ? c.sp.name : 'Scanning…';
    ctx.strokeText(name, c.x, c.y - r - 8);
    ctx.fillStyle = '#d8fffb';
    ctx.fillText(name, c.x, c.y - r - 8);
  }

  // ---------------------------------------------------------------- map views

  // Fog-of-war image: revealed cells in their colors.
  updateFog(world) {
    const img = this.fogImg, d = img.data, rev = world.revealed;
    for (let i = 0; i < rev.length; i++) {
      const o = i * 4;
      if (!rev[i]) { d[o + 3] = 0; continue; }
      const c = this.fogColors[i];
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
      d[o + 3] = world.map.kind[i] === 2 ? 0 : 255;
    }
    this.fog.getContext('2d').putImageData(img, 0, 0);
  }

  drawMap(canvas, world, { full = false, center = null } = {}) {
    const ctx = canvas.getContext('2d');
    const map = world.map;
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#040e22';
    ctx.fillRect(0, 0, W, H);
    let scale, ox, oy;
    if (full) {
      scale = Math.min(W / map.cols, H / map.rows);
      ox = (W - map.cols * scale) / 2; oy = (H - map.rows * scale) / 2;
    } else {
      scale = 3 * (W / 180);
      const c = center || { x: world.sub.x / CELL, y: world.sub.y / CELL };
      ox = W / 2 - c.x * scale; oy = H / 2 - c.y * scale;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.fog, ox, oy, map.cols * scale, map.rows * scale);
    const dot = (cx, cy, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ox + cx * scale, oy + cy * scale, r, 0, TAU); ctx.fill(); };
    const known = (x, y) => world.revealed[y * map.cols + x];
    for (const d of map.docks) if (known(d.x, d.y)) { dot(d.x + 0.5, d.y + 0.5, Math.max(3, scale * 1.2), '#ffffff'); dot(d.x + 0.5, d.y + 0.5, Math.max(2, scale * 0.7), '#ff9f1c'); }
    for (const t of map.treasures) if (!world.treasures.has(t.id) && known(t.x, t.y)) dot(t.x + 0.5, t.y + 0.5, Math.max(1.6, scale * 0.6), '#ffd23f');
    for (const s of map.shells) if (!world.shells.has(s.id) && known(s.x, s.y)) dot(s.x + 0.5, s.y + 0.5, Math.max(2, scale * 0.8), '#fff3b0');
    for (const p of map.parts) if (!world.ups.has(p.id) && known(p.x, p.y)) dot(p.x + 0.5, p.y + 0.5, Math.max(2.5, scale), '#5ac8ff');
    for (const g of map.gates) {
      if (world.opened.has(g.id) || !known(g.x, g.y)) continue;
      ctx.fillStyle = g.kind === 'coral' ? '#ff7eb6' : '#c96a2a';
      ctx.fillRect(ox + g.x * scale, oy + g.y * scale, g.w * scale, g.h * scale);
    }
    if (!world.heart && known(map.heart.x, map.heart.y)) dot(map.heart.x + 0.5, map.heart.y + 0.5, Math.max(3, scale * 1.2), '#ff4fa8');
    // Bubbles.
    const pulse = 1 + Math.sin(this.time * 5) * 0.25;
    dot(world.sub.x / CELL, world.sub.y / CELL, Math.max(3.5, scale * 1.1) * pulse, '#ffd23f');
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ox + (world.sub.x / CELL) * scale, oy + (world.sub.y / CELL) * scale, Math.max(3.5, scale * 1.1) * pulse, 0, TAU); ctx.stroke();
    if (full) {
      ctx.font = `700 ${Math.max(11, Math.round(scale * 3.2))}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(4,14,34,0.9)';
      const labels = [[25, 8], [75, 14], [110, 30], [30, 39], [50, 67], [60, 95], [131, 80]];
      AREAS.forEach((a, i) => {
        if (!world.visited.has(i)) return;
        const [x, y] = labels[i];
        ctx.strokeText(a.name, ox + x * scale, oy + y * scale);
        ctx.fillStyle = a.accent;
        ctx.fillText(a.name, ox + x * scale, oy + y * scale);
      });
    }
  }
}
