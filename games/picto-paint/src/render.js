// Canvas renderer: paper, board, clues, pencil tiles, hint glow, particles,
// the reveal and living pictures. Reads game state, never changes it.
import { drawLiving } from './anim.js';
import { UNKNOWN, CROSS } from './board.js';

const TILE = 96; // baked tile resolution
const MAX_PARTICLES = 220;
const TAU = Math.PI * 2;

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const canvas2d = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

// Draw one filled square in a pencil style onto a TILE×TILE canvas.
export function bakeTile(style, hex, dark = false) {
  const c = canvas2d(TILE, TILE);
  const g = c.getContext('2d');
  const rnd = seeded(parseInt(hex.slice(1), 16) + style.length * 977);
  const T = TILE;
  switch (style) {
    case 'crayon': {
      g.fillStyle = hex;
      rrect(g, 5, 5, T - 10, T - 10, 12);
      g.fill();
      g.globalCompositeOperation = 'source-atop';
      g.strokeStyle = shade(hex, -0.18);
      g.lineWidth = 3;
      for (let k = 0; k < 26; k++) {
        const y = rnd() * T;
        g.globalAlpha = 0.25 + rnd() * 0.25;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(T, y - 30 + rnd() * 10);
        g.stroke();
      }
      g.fillStyle = dark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.55)';
      for (let k = 0; k < 140; k++) {
        g.globalAlpha = 0.3 + rnd() * 0.5;
        g.fillRect(rnd() * T, rnd() * T, 1.5 + rnd() * 2.5, 1.5 + rnd() * 2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      break;
    }
    case 'stamp': {
      g.fillStyle = shade(hex, -0.25);
      rrect(g, 8, 10, T - 16, T - 16, 22);
      g.fill();
      g.fillStyle = hex;
      rrect(g, 8, 7, T - 16, T - 17, 22);
      g.fill();
      g.strokeStyle = shade(hex, 0.35);
      g.lineWidth = 4;
      rrect(g, 16, 14, T - 32, T - 32, 14);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.arc(28, 26, 6, 0, TAU);
      g.fill();
      break;
    }
    case 'water': {
      const grad = g.createRadialGradient(T * 0.42, T * 0.38, 4, T / 2, T / 2, T * 0.62);
      grad.addColorStop(0, shade(hex, 0.45));
      grad.addColorStop(0.65, hex);
      grad.addColorStop(1, shade(hex, -0.25));
      g.fillStyle = grad;
      g.globalAlpha = 0.92;
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * TAU;
        const r = T * 0.5 * (0.93 + rnd() * 0.07);
        const x = T / 2 + Math.cos(a) * r * 0.98;
        const y = T / 2 + Math.sin(a) * r * 0.98;
        // squarish blob
        const sx = Math.sign(Math.cos(a)) * Math.min(Math.abs(Math.cos(a)) * 1.5, 1);
        const sy = Math.sign(Math.sin(a)) * Math.min(Math.abs(Math.sin(a)) * 1.5, 1);
        const px = T / 2 + sx * r * 0.92 * 0.5 + (x - T / 2) * 0.5;
        const py = T / 2 + sy * r * 0.92 * 0.5 + (y - T / 2) * 0.5;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
      g.globalAlpha = 0.35;
      g.strokeStyle = shade(hex, -0.35);
      g.lineWidth = 3;
      g.stroke();
      g.globalAlpha = 1;
      break;
    }
    case 'pixel': {
      g.fillStyle = hex;
      g.fillRect(2, 2, T - 4, T - 4);
      g.fillStyle = shade(hex, 0.38);
      g.fillRect(2, 2, T - 4, 12);
      g.fillRect(2, 2, 12, T - 4);
      g.fillStyle = shade(hex, -0.3);
      g.fillRect(2, T - 14, T - 4, 12);
      g.fillRect(T - 14, 2, 12, T - 4);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(18, 18, 10, 10);
      break;
    }
    case 'neon': {
      g.fillStyle = shade(hex, -0.62);
      rrect(g, 6, 6, T - 12, T - 12, 16);
      g.fill();
      g.shadowColor = hex;
      g.shadowBlur = 14;
      g.strokeStyle = shade(hex, 0.25);
      g.lineWidth = 7;
      rrect(g, 14, 14, T - 28, T - 28, 11);
      g.stroke();
      g.shadowBlur = 0;
      g.strokeStyle = shade(hex, 0.75);
      g.lineWidth = 2.5;
      rrect(g, 14, 14, T - 28, T - 28, 11);
      g.stroke();
      break;
    }
    default: { // graphite pencil
      g.fillStyle = hex;
      rrect(g, 4, 4, T - 8, T - 8, 10);
      g.fill();
      g.save();
      rrect(g, 4, 4, T - 8, T - 8, 10);
      g.clip();
      g.strokeStyle = dark ? 'rgba(255,255,255,0.12)' : shade(hex, -0.22);
      g.globalAlpha = 0.55;
      g.lineWidth = 2;
      for (let k = -T; k < T * 2; k += 9) {
        g.beginPath();
        g.moveTo(k + rnd() * 2, 0);
        g.lineTo(k - T + rnd() * 2, T);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(4, 4, T - 8, 10);
      g.restore();
    }
  }
  return c;
}

function bakeCross(colour) {
  const c = canvas2d(TILE, TILE);
  const g = c.getContext('2d');
  g.strokeStyle = colour;
  g.lineCap = 'round';
  g.lineWidth = 9;
  const a = TILE * 0.3, b = TILE * 0.7;
  g.beginPath();
  g.moveTo(a, a + 2); g.lineTo(b, b - 2);
  g.moveTo(b - 2, a); g.lineTo(a + 2, b);
  g.stroke();
  return c;
}

function bakeWrong() {
  const c = canvas2d(TILE, TILE);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(239, 111, 108, 0.35)';
  rrect(g, 6, 6, TILE - 12, TILE - 12, 16);
  g.fill();
  g.strokeStyle = '#e8504f';
  g.setLineDash([10, 8]);
  g.lineWidth = 5;
  rrect(g, 8, 8, TILE - 16, TILE - 16, 14);
  g.stroke();
  return c;
}

// Page background: soft gradient, paper grain and faint pixel doodles.
function bakePage(w, h, dpr, pal) {
  const c = canvas2d(w * dpr, h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, pal.page[0]);
  grad.addColorStop(1, pal.page[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const rnd = seeded(1234);
  g.fillStyle = pal.dark ? 'rgba(255,255,255,0.05)' : 'rgba(120,90,50,0.06)';
  for (let k = 0; k < (w * h) / 900; k++) g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
  // notebook dots
  g.fillStyle = pal.dark ? 'rgba(255,255,255,0.07)' : 'rgba(120,90,50,0.08)';
  for (let y = 18; y < h; y += 28) for (let x = 18; x < w; x += 28) g.fillRect(x, y, 2, 2);
  return c;
}

export class Renderer {
  constructor(canvas, { reduced = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reduced;
    this.dpr = 1;
    this.W = 1;
    this.H = 1;
    this.scene = 'backdrop'; // backdrop | play | reveal | viewer
    this.board = null;
    this.view = { z: 1, tx: 0, ty: 0 };
    this.lay = null;
    this.insets = { top: 64, bottom: 90 };
    this.tiles = new Map();
    this.pics = new Map();
    this.dirty = true;
    this.time = 0;
    this.hover = -1;
    this.cursor = 0;
    this.showCursor = false;
    this.flashes = [];
    this.hintFx = null;
    this.popT = null;
    this.colour = 0;
    this.tool = 'fill';
    this.floaters = [];
    this.viewerPic = null;
    this.reveal = null;
    this.cardTop = 0;
    this.p = {
      x: new Float32Array(MAX_PARTICLES), y: new Float32Array(MAX_PARTICLES),
      vx: new Float32Array(MAX_PARTICLES), vy: new Float32Array(MAX_PARTICLES),
      life: new Float32Array(MAX_PARTICLES), max: new Float32Array(MAX_PARTICLES),
      size: new Float32Array(MAX_PARTICLES), rot: new Float32Array(MAX_PARTICLES),
      col: new Array(MAX_PARTICLES).fill('#fff'), count: 0,
    };
    this.setTheme(null, 'graphite');
  }

  setTheme(pal, pencil) {
    if (pal) this.pal = pal;
    this.pencil = pencil || this.pencil;
    this.tiles.clear();
    this.page = null;
    this.crossTile = this.pal ? bakeCross(this.pal.cross) : null;
    this.wrongTile = bakeWrong();
    this.dirty = true;
  }

  tile(hex) {
    let t = this.tiles.get(hex);
    if (!t) {
      t = bakeTile(this.pencil, hex, this.pal?.dark);
      this.tiles.set(hex, t);
    }
    return t;
  }

  // Bake tiles a board needs ahead of time (spread over frames by caller).
  warm(hexes) { for (const h of hexes) this.tile(h); }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.dpr = dpr;
    this.W = W;
    this.H = H;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.page = null;
    if (this.board) this.layout(this.insets);
    this.dirty = true;
  }

  // A picture as a w×h canvas, one pixel per square.
  pic(puzzle) {
    let p = this.pics.get(puzzle.id);
    if (p) return p;
    const c = canvas2d(puzzle.w, puzzle.h);
    const g = c.getContext('2d');
    const filled = [];
    const counts = new Map();
    for (let i = 0; i < puzzle.art.length; i++) {
      const hex = puzzle.art[i];
      if (!hex) continue;
      filled.push(i);
      counts.set(hex, (counts.get(hex) || 0) + 1);
      g.fillStyle = hex;
      g.fillRect(i % puzzle.w, (i / puzzle.w) | 0, 1, 1);
    }
    let main = '#888888';
    let most = 0;
    for (const [hex, n] of counts) if (n > most && hex !== '#2b2440') { most = n; main = hex; }
    const eyes = puzzle.eyes.map((i) => [i % puzzle.w, (i / puzzle.w) | 0]);
    let lid = main;
    if (eyes.length) {
      const [ex, ey] = eyes[0];
      const above = ey > 0 ? puzzle.art[(ey - 1) * puzzle.w + ex] : null;
      if (above && above !== '#2b2440') lid = above;
    }
    p = { canvas: c, w: puzzle.w, h: puzzle.h, eyes, lid, filled, main, tint: puzzle.tint || '#ffe9c9' };
    this.pics.set(puzzle.id, p);
    return p;
  }

  // ------------------------------------------------------------ board

  setBoard(board) {
    this.board = board;
    this.popT = new Float32Array(board.w * board.h).fill(9);
    this.flashes.length = 0;
    this.hintFx = null;
    this.reveal = null;
    this.view = { z: 1, tx: 0, ty: 0 };
    this.cursor = Math.floor(board.h / 2) * board.w + Math.floor(board.w / 2);
    this.prepClues();
    this.layout(this.insets);
    this.dirty = true;
  }

  prepClues() {
    const b = this.board;
    const p = b.p;
    const conv = (clue) => clue.map((blk) => {
      const hex = p.paints[blk.c];
      return { txt: String(blk.n), hex, ink: luminance(hex) > 0.62 ? '#3b3350' : '#ffffff' };
    });
    this.rowClues = p.rows.map(conv);
    this.colClues = p.cols.map(conv);
    this.refreshBlocks();
  }

  refreshBlocks() {
    const b = this.board;
    if (!b) return;
    this.rowBlocks = this.rowClues.map((_, y) => b.doneBlocks('row', y));
    this.colBlocks = this.colClues.map((_, x) => b.doneBlocks('col', x));
    this.dirty = true;
  }

  layout(insets) {
    this.insets = insets;
    const b = this.board;
    if (!b) return;
    const rc = Math.max(1, ...this.rowClues.map((c) => c.length));
    const cc = Math.max(1, ...this.colClues.map((c) => c.length));
    const m = this.W < 520 ? 8 : 18;
    const right = insets.right || 0;
    const availW = this.W - right - m * 2;
    const availH = this.H - insets.top - insets.bottom - m * 2;
    const CLUE = this.W < 520 ? 0.7 : 0.82; // clue cell size relative to a square
    const unitsW = b.w + rc * CLUE + 0.3;
    const unitsH = b.h + cc * CLUE + 0.3;
    const s = Math.max(8, Math.min(76, Math.floor(Math.min(availW / unitsW, availH / unitsH))));
    const totalW = unitsW * s;
    const totalH = unitsH * s;
    const ox = Math.round((this.W - right - totalW) / 2);
    const oy = Math.round(insets.top + m + (availH - totalH) / 2);
    this.lay = { s, rc, cc, ox, oy, clue: CLUE, gx: ox + (rc * CLUE + 0.15) * s, gy: oy + (cc * CLUE + 0.15) * s, totalW, totalH };
    this.clampView();
    this.dirty = true;
  }

  // Board-to-screen: screen = world * z + t
  get S() { return this.lay.s * this.view.z; }
  sx(wx) { return wx * this.view.z + this.view.tx; }
  sy(wy) { return wy * this.view.z + this.view.ty; }

  // Screen x of the row-clue band's right edge and y of the column-clue
  // band's bottom edge. Zoomed in, the bands pin to the screen and cover
  // squares, so squares only count where they show.
  bandEdges() {
    const L = this.lay;
    const Cu = L.clue * Math.min(this.S, L.s * 1.45);
    const clueW = L.rc * Cu;
    const clueH = L.cc * Cu;
    return {
      x: Math.max(this.sx(L.gx) - clueW, 2) + clueW,
      y: Math.max(this.sy(L.gy) - clueH, this.insets.top) + clueH,
    };
  }

  cellAt(x, y) {
    if (!this.lay || !this.board) return -1;
    const edge = this.bandEdges();
    if (x < edge.x || y < edge.y) return -1;
    const S = this.S;
    const cx = Math.floor((x - this.sx(this.lay.gx)) / S);
    const cy = Math.floor((y - this.sy(this.lay.gy)) / S);
    if (cx < 0 || cy < 0 || cx >= this.board.w || cy >= this.board.h) return -1;
    return cy * this.board.w + cx;
  }

  // Nearest cell, clamped to the grid (for drags that leave the board).
  cellNear(x, y) {
    const edge = this.bandEdges();
    x = Math.max(x, edge.x);
    y = Math.max(y, edge.y);
    const S = this.S;
    const cx = Math.max(0, Math.min(this.board.w - 1, Math.floor((x - this.sx(this.lay.gx)) / S)));
    const cy = Math.max(0, Math.min(this.board.h - 1, Math.floor((y - this.sy(this.lay.gy)) / S)));
    return cy * this.board.w + cx;
  }

  maxZoom() { return this.lay ? Math.min(3, Math.max(1.5, 52 / this.lay.s)) : 1; }

  canZoom() { return this.board && Math.max(this.board.w, this.board.h) >= 10; }

  zoomAt(factor, x, y) {
    if (!this.canZoom()) return;
    const v = this.view;
    const z = Math.max(1, Math.min(this.maxZoom(), v.z * factor));
    const wx = (x - v.tx) / v.z;
    const wy = (y - v.ty) / v.z;
    v.z = z;
    v.tx = x - wx * z;
    v.ty = y - wy * z;
    this.clampView();
    this.dirty = true;
  }

  panBy(dx, dy) {
    this.view.tx += dx;
    this.view.ty += dy;
    this.clampView();
    this.dirty = true;
  }

  resetView() {
    this.view = { z: 1, tx: 0, ty: 0 };
    this.dirty = true;
  }

  clampView() {
    const v = this.view;
    if (!this.lay) return;
    if (v.z <= 1.001) { v.z = 1; v.tx = 0; v.ty = 0; return; }
    const L = this.lay;
    const top = this.insets.top;
    const bottom = this.H - this.insets.bottom;
    const S = L.s * v.z;
    const Cu = L.clue * Math.min(S, L.s * 1.45);
    const x0 = L.gx * v.z, x1 = (L.gx + this.board.w * L.s) * v.z;
    const y0 = L.gy * v.z, y1 = (L.gy + this.board.h * L.s) * v.z;
    const pad = 10;
    // keep the grid filling the space beside the (pinned) clue bands
    const minTx = this.W - (this.insets.right || 0) - pad - x1, maxTx = 2 + L.rc * Cu - x0;
    const minTy = bottom - pad - y1, maxTy = top + L.cc * Cu - y0;
    v.tx = minTx > maxTx ? (minTx + maxTx) / 2 : Math.max(minTx, Math.min(maxTx, v.tx));
    v.ty = minTy > maxTy ? (minTy + maxTy) / 2 : Math.max(minTy, Math.min(maxTy, v.ty));
  }

  // Pan so the keyboard cursor stays on screen while zoomed.
  follow(i) {
    if (this.view.z <= 1) return;
    const S = this.S;
    const x = this.sx(this.lay.gx) + (i % this.board.w) * S;
    const y = this.sy(this.lay.gy) + ((i / this.board.w) | 0) * S;
    const m = S * 1.5;
    let dx = 0, dy = 0;
    const CLUE = this.lay.clue;
    const Cu = CLUE * Math.min(S, this.lay.s * 1.45);
    if (x < m + this.lay.rc * Cu) dx = m + this.lay.rc * Cu - x;
    if (x + S > this.W - m) dx = this.W - m - x - S;
    if (y < this.insets.top + m + this.lay.cc * Cu) dy = this.insets.top + m + this.lay.cc * Cu - y;
    if (y + S > this.H - this.insets.bottom - m) dy = this.H - this.insets.bottom - m - y - S;
    if (dx || dy) this.panBy(dx, dy);
  }

  // Screen y range covered by some squares.
  cellsSpan(ids) {
    if (!this.lay || !ids.length) return null;
    const S = this.S;
    const gy = this.sy(this.lay.gy);
    let lo = Infinity, hi = -Infinity;
    for (const i of ids) { const y = (i / this.board.w) | 0; lo = Math.min(lo, y); hi = Math.max(hi, y); }
    return [gy + lo * S, gy + (hi + 1) * S];
  }

  // ------------------------------------------------------------ effects

  pop(ids) {
    if (!this.popT) return;
    for (const i of ids) this.popT[i] = 0;
    this.dirty = true;
  }

  flashLine(axis, index) {
    this.flashes.push({ axis, index, t: 0 });
    if (this.lay && !this.reduced) {
      const S = this.S;
      const n = axis === 'row' ? this.board.w : this.board.h;
      for (let k = 0; k < n; k += 2) {
        const x = this.sx(this.lay.gx) + ((axis === 'row' ? k : index) + 0.5) * S;
        const y = this.sy(this.lay.gy) + ((axis === 'row' ? index : k) + 0.5) * S;
        this.burst(x, y, ['#ffd36a', '#ffffff'], 2, { speed: 90, size: Math.max(3, S * 0.12), life: 0.6, gravity: false });
      }
    }
    this.dirty = true;
  }

  showHint(hint) {
    this.hintFx = hint ? { cells: hint.cells.map((c) => c.i), line: hint.line, t: 0 } : null;
    this.dirty = true;
  }

  burst(x, y, colours, n = 30, { speed = 260, size = 6, life = 1.2, gravity = true } = {}) {
    if (this.reduced) n = Math.ceil(n / 4);
    const P = this.p;
    for (let k = 0; k < n; k++) {
      let i = P.count < MAX_PARTICLES ? P.count++ : -1;
      if (i < 0) {
        // reuse the oldest-looking slot
        i = (k * 37 + Math.floor(this.time * 60)) % MAX_PARTICLES;
      }
      const a = Math.random() * TAU;
      const v = speed * (0.35 + Math.random() * 0.65);
      P.x[i] = x;
      P.y[i] = y;
      P.vx[i] = Math.cos(a) * v;
      P.vy[i] = Math.sin(a) * v - (gravity ? speed * 0.5 : 0);
      P.life[i] = 0;
      P.max[i] = life * (0.6 + Math.random() * 0.6);
      P.size[i] = size * (0.6 + Math.random() * 0.8);
      P.rot[i] = gravity ? 1 : 0;
      P.col[i] = colours[k % colours.length];
    }
    this.dirty = true;
  }

  // Pencil dust where a square was filled.
  dust(i, hex) {
    if (!this.lay || this.reduced) return;
    const S = this.S;
    const x = this.sx(this.lay.gx) + ((i % this.board.w) + 0.5) * S;
    const y = this.sy(this.lay.gy) + (((i / this.board.w) | 0) + 0.5) * S;
    this.burst(x, y, [hex], 3, { speed: 60, size: Math.max(2, S * 0.1), life: 0.4, gravity: false });
  }

  stepParticles(dt) {
    const P = this.p;
    let n = P.count;
    for (let i = 0; i < n; i++) {
      P.life[i] += dt;
      if (P.life[i] >= P.max[i]) {
        n--;
        P.x[i] = P.x[n]; P.y[i] = P.y[n]; P.vx[i] = P.vx[n]; P.vy[i] = P.vy[n];
        P.life[i] = P.life[n]; P.max[i] = P.max[n]; P.size[i] = P.size[n]; P.rot[i] = P.rot[n]; P.col[i] = P.col[n];
        i--;
        continue;
      }
      P.x[i] += P.vx[i] * dt;
      P.y[i] += P.vy[i] * dt;
      if (P.rot[i]) P.vy[i] += 520 * dt;
      P.vx[i] *= 1 - 1.5 * dt;
    }
    P.count = n;
  }

  drawParticles(ctx) {
    const P = this.p;
    for (let i = 0; i < P.count; i++) {
      const f = 1 - P.life[i] / P.max[i];
      ctx.globalAlpha = Math.min(1, f * 1.5);
      ctx.fillStyle = P.col[i];
      const s = P.size[i];
      if (P.rot[i]) {
        // confetti flutter
        const w = s * Math.abs(Math.cos(P.life[i] * 9 + i));
        ctx.fillRect(P.x[i] - w / 2, P.y[i] - s / 2, w + 1, s * 0.6);
      } else {
        ctx.fillRect(P.x[i] - s / 2, P.y[i] - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ scenes

  setBackdrop(pics) {
    this.scene = 'backdrop';
    this.floaters = pics.map((pic, k) => {
      const s = Math.max(5, Math.min(12, 90 / Math.max(pic.w, pic.h)));
      return {
        pic,
        anim: pic.anim || 'float',
        x: ((k + 0.5) / pics.length + (Math.random() - 0.5) * 0.08),
        y: 0.12 + ((k * 0.37) % 1) * 0.8,
        vx: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8),
        s,
        t0: Math.random() * 5,
      };
    });
    this.dirty = true;
  }

  startReveal(onCard) {
    const b = this.board;
    const L = this.lay;
    this.reveal = {
      t: 0,
      pic: this.pic(b.p),
      from: { cx: this.sx(L.gx) + (b.w * this.S) / 2, cy: this.sy(L.gy) + (b.h * this.S) / 2, s: this.S },
      burst: false,
      cardShown: false,
      onCard,
    };
    this.hintFx = null;
    this.scene = 'reveal';
    this.dirty = true;
  }

  // Showcase spot for a living picture (above the results card).
  showcase(pic, cardTop) {
    const card = this.cardRect;
    // Card beside the picture (landscape phones): use the space to its left.
    if (card && card.left > this.W * 0.4) {
      const availW = card.left - 16;
      const availH = this.H - 20;
      const s = Math.max(4, Math.min(availH * 0.7 / pic.h, availW * 0.7 / pic.w, 30));
      return { cx: availW / 2 + 8, cy: this.H / 2, s };
    }
    const top = this.insets.top + 6;
    const bottom = Math.max(top + 120, cardTop - 10);
    const availH = bottom - top;
    const s = Math.max(4, Math.min(availH * 0.66 / pic.h, availH * 0.66 / pic.w, this.W * 0.62 / pic.w, 30));
    return { cx: this.W / 2, cy: top + availH / 2, s };
  }

  setViewer(pic, anim) {
    this.scene = 'viewer';
    this.viewerPic = { pic, anim, t: 0 };
    this.dirty = true;
  }

  // ------------------------------------------------------------ frame

  update(dt) {
    this.time += dt;
    if (this.popT) for (let i = 0; i < this.popT.length; i++) if (this.popT[i] < 1) { this.popT[i] += dt; this.dirty = true; }
    for (let k = this.flashes.length - 1; k >= 0; k--) {
      this.flashes[k].t += dt;
      if (this.flashes[k].t > 0.7) this.flashes.splice(k, 1);
      this.dirty = true;
    }
    if (this.hintFx) { this.hintFx.t += dt; this.dirty = true; }
    if (this.p.count) { this.stepParticles(dt); this.dirty = true; }
    if (this.scene === 'backdrop' && !this.reduced) this.dirty = true;
    if (this.scene === 'reveal') { this.reveal.t += dt; this.dirty = true; }
    if (this.scene === 'viewer') { this.viewerPic.t += dt; this.dirty = true; }
  }

  draw() {
    if (!this.dirty) return false;
    this.dirty = false;
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.page && this.pal) this.page = bakePage(this.W, this.H, dpr, this.pal);
    if (this.page) ctx.drawImage(this.page, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.scene === 'backdrop') this.drawBackdrop(ctx);
    else if (this.scene === 'play') this.drawBoard(ctx, 1);
    else if (this.scene === 'reveal') this.drawReveal(ctx);
    else if (this.scene === 'viewer') this.drawViewer(ctx);
    this.drawParticles(ctx);
    return true;
  }

  drawBackdrop(ctx) {
    const W = this.W, H = this.H;
    for (const f of this.floaters) {
      if (!this.reduced) {
        f.x += (f.vx / W) * (1 / 60);
        const span = (f.pic.w * f.s) / W;
        if (f.x > 1 + span) f.x = -span;
        if (f.x < -span) f.x = 1 + span;
      }
      const t = this.reduced ? 0 : this.time + f.t0;
      drawLiving(ctx, f.pic, f.x * W, f.y * H, f.s, t, f.anim, { reduced: this.reduced, alpha: this.backdropAlpha ?? 0.9 });
    }
  }

  drawViewer(ctx) {
    const v = this.viewerPic;
    const sc = this.showcase(v.pic, this.cardTop || this.H * 0.75);
    this.drawSpot(ctx, sc, v.pic);
    drawLiving(ctx, v.pic, sc.cx, sc.cy, sc.s, v.t, v.anim, { reduced: this.reduced });
  }

  drawSpot(ctx, sc, pic) {
    const r = Math.max(pic.w, pic.h) * sc.s * 0.72;
    ctx.globalAlpha *= 0.85;
    ctx.fillStyle = pic.tint;
    ctx.beginPath();
    ctx.arc(sc.cx, sc.cy, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawBoard(ctx, alpha, revealT = -1) {
    const b = this.board;
    const L = this.lay;
    const pal = this.pal;
    const S = this.S;
    const gx = this.sx(L.gx);
    const gy = this.sy(L.gy);
    const gw = b.w * S;
    const gh = b.h * S;
    // Clue bands grow a little with zoom, but not all the way.
    const Cu = L.clue * Math.min(S, L.s * 1.45);
    this.Cu = Cu;
    const clueW = L.rc * Cu;
    const clueH = L.cc * Cu;
    const top = this.insets.top;
    // Clue bands stay pinned on screen when zoomed in.
    const rowX = Math.max(gx - clueW, 2);
    const colY = Math.max(gy - clueH, top);
    const fade = revealT < 0 ? 1 : Math.max(0, 1 - revealT * 1.6);

    ctx.globalAlpha = alpha;
    // card + shadow
    const cx0 = gx - clueW - S * 0.15, cy0 = gy - clueH - S * 0.15;
    const cw = gw + clueW + S * 0.3, ch = gh + clueH + S * 0.3;
    ctx.fillStyle = pal.dark ? 'rgba(0,0,0,0.25)' : 'rgba(110,80,40,0.12)';
    rrect(ctx, cx0 + 3, cy0 + 6, cw, ch, Math.min(18, S * 0.5));
    ctx.fill();
    ctx.fillStyle = pal.board;
    rrect(ctx, cx0, cy0, cw, ch, Math.min(18, S * 0.5));
    ctx.fill();

    // hover / cursor bands
    const focus = this.showCursor ? this.cursor : this.hover;
    if (focus >= 0 && revealT < 0) {
      const fx = focus % b.w, fy = (focus / b.w) | 0;
      ctx.fillStyle = pal.hi;
      ctx.fillRect(rowX, gy + fy * S, gx + gw - rowX, S);
      ctx.fillRect(gx + fx * S, colY, S, gy + gh - colY);
    }

    // line flashes
    for (const f of this.flashes) {
      const a = Math.sin((f.t / 0.7) * Math.PI) * 0.8;
      ctx.globalAlpha = a * alpha;
      ctx.fillStyle = pal.dark ? '#5a5a8a' : '#ffe9a0';
      if (f.axis === 'row') ctx.fillRect(gx, gy + f.index * S, gw, S);
      else ctx.fillRect(gx + f.index * S, gy, S, gh);
    }
    ctx.globalAlpha = alpha;

    // cells
    const stroke = b.stroke;
    const art = b.p.art;
    const ink = pal.ink;
    const sweep = revealT >= 0 ? revealT * 1.5 : -1;
    for (let y = 0; y < b.h; y++) {
      const py = gy + y * S;
      if (py > this.H || py + S < 0) continue;
      for (let x = 0; x < b.w; x++) {
        const px = gx + x * S;
        if (px > this.W || px + S < 0) continue;
        const i = y * b.w + x;
        const v = b.cells[i];
        let k = 1;
        const pt = this.popT[i];
        if (pt < 0.16) k = 0.55 + 0.45 * (1 - (1 - pt / 0.16) ** 3) + Math.sin((pt / 0.16) * Math.PI) * 0.08;
        const pad = (S * (1 - k)) / 2;
        if (v >= 0) {
          if (sweep >= 0) {
            const local = Math.max(0, Math.min(1, (sweep - (x + y) / (b.w + b.h)) * 3));
            if (local < 1) ctx.drawImage(this.tile(b.p.colour ? b.p.paints[v] : ink), px, py, S, S);
            if (local > 0 && art[i]) {
              ctx.globalAlpha = alpha * local;
              ctx.fillStyle = art[i];
              ctx.fillRect(px - 0.25, py - 0.25, S + 0.5, S + 0.5);
              ctx.globalAlpha = alpha;
            }
          } else {
            ctx.drawImage(this.tile(b.p.colour ? b.p.paints[v] : ink), px + pad, py + pad, S - pad * 2, S - pad * 2);
          }
        } else if (v === CROSS && fade > 0) {
          ctx.globalAlpha = alpha * fade;
          ctx.drawImage(this.crossTile, px + pad, py + pad, S - pad * 2, S - pad * 2);
          ctx.globalAlpha = alpha;
        }
        if (stroke && stroke.wrong.has(i)) ctx.drawImage(this.wrongTile, px, py, S, S);
      }
    }

    // grid lines
    ctx.globalAlpha = alpha * fade;
    ctx.fillStyle = pal.grid;
    for (let x = 0; x <= b.w; x++) ctx.fillRect(gx + x * S - 0.5, gy, 1, gh);
    for (let y = 0; y <= b.h; y++) ctx.fillRect(gx, gy + y * S - 0.5, gw, 1);
    ctx.fillStyle = pal.bold;
    for (let x = 0; x <= b.w; x += 5) ctx.fillRect(gx + x * S - 1, gy, 2, gh);
    for (let y = 0; y <= b.h; y += 5) ctx.fillRect(gx, gy + y * S - 1, gw, 2);
    ctx.fillRect(gx + b.w * S - 1, gy, 2, gh);
    ctx.fillRect(gx, gy + b.h * S - 1, gw, 2);

    // hint glow
    if (this.hintFx && revealT < 0) {
      const h = this.hintFx;
      const pulse = 0.5 + 0.5 * Math.sin(h.t * 6);
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = Math.max(2, S * 0.1);
      ctx.globalAlpha = 0.5 + pulse * 0.5;
      if (h.line) {
        const { axis, index } = h.line;
        if (axis === 'row') { rrect(ctx, rowX + 2, gy + index * S + 1, gx + gw - rowX - 3, S - 2, S * 0.3); }
        else { rrect(ctx, gx + index * S + 1, colY + 2, S - 2, gy + gh - colY - 3, S * 0.3); }
        ctx.stroke();
      }
      ctx.fillStyle = pal.accent;
      ctx.globalAlpha = 0.18 + pulse * 0.2;
      for (const i of h.cells) ctx.fillRect(gx + (i % b.w) * S + 2, gy + ((i / b.w) | 0) * S + 2, S - 4, S - 4);
      ctx.globalAlpha = alpha;
    }

    // clue bands (pinned panels when zoomed)
    const pinX = rowX > gx - clueW + 0.5;
    const pinY = colY > gy - clueH + 0.5;
    const bottom = this.H - this.insets.bottom + 4;
    ctx.globalAlpha = alpha * fade;
    ctx.fillStyle = pal.board;
    if (pinX) ctx.fillRect(0, colY, rowX + clueW, bottom - colY);
    if (pinY) ctx.fillRect(rowX - 2, 0, this.W - rowX + 2, colY + clueH);
    if (pinX || pinY) {
      ctx.fillStyle = pal.bold;
      if (pinX) ctx.fillRect(rowX + clueW - 1, colY + clueH, 2, bottom - colY - clueH);
      if (pinY) ctx.fillRect(rowX + clueW, colY + clueH - 1, this.W, 2);
    }
    // A little preview of the picture so far, in the empty corner.
    if (!pinX && !pinY && fade > 0) {
      const ps = Math.floor(Math.min(clueW / b.w, clueH / b.h) * 0.8);
      if (ps >= 2) {
        const px0 = gx - clueW / 2 - (b.w * ps) / 2 - S * 0.04;
        const py0 = gy - clueH / 2 - (b.h * ps) / 2 - S * 0.04;
        ctx.globalAlpha = alpha * fade * 0.9;
        for (let i = 0; i < b.cells.length; i++) {
          const v = b.cells[i];
          if (v < 0) continue;
          ctx.fillStyle = b.p.colour ? b.p.paints[v] : ink;
          ctx.fillRect(px0 + (i % b.w) * ps, py0 + ((i / b.w) | 0) * ps, ps, ps);
        }
        ctx.globalAlpha = alpha * fade;
      }
    }
    if (fade > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, colY + clueH - 1, rowX + clueW + 1, Math.max(0, bottom - colY - clueH));
      ctx.clip();
      this.drawClues(ctx, gx, gy, S, rowX, colY, clueW, clueH, alpha * fade, 'rows');
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(rowX + clueW - 1, 0, this.W, colY + clueH + 1);
      ctx.clip();
      this.drawClues(ctx, gx, gy, S, rowX, colY, clueW, clueH, alpha * fade, 'cols');
      ctx.restore();
    }

    // keyboard cursor
    if (this.showCursor && revealT < 0) {
      const x = gx + (this.cursor % b.w) * S;
      const y = gy + ((this.cursor / b.w) | 0) * S;
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = Math.max(2.5, S * 0.09);
      rrect(ctx, x + 1, y + 1, S - 2, S - 2, S * 0.2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawClues(ctx, gx, gy, S, rowX, colY, clueW, clueH, alpha, which) {
    const b = this.board;
    const pal = this.pal;
    const C = this.Cu;
    const colour = b.p.colour;
    const size = Math.max(9, Math.min(C * 0.62, 26));
    ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const focus = this.showCursor ? this.cursor : this.hover;
    const fx = focus >= 0 ? focus % b.w : -1;
    const fy = focus >= 0 ? (focus / b.w) | 0 : -1;
    const drawBlock = (blk, x, y, done, hot) => {
      if (colour) {
        ctx.globalAlpha = alpha * (done ? 0.32 : 1);
        ctx.fillStyle = blk.hex;
        rrect(ctx, x - C * 0.42, y - C * 0.42, C * 0.84, C * 0.84, C * 0.2);
        ctx.fill();
        ctx.fillStyle = blk.ink;
        ctx.fillText(blk.txt, x, y + 1);
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = done ? pal.dim : hot ? pal.accent : pal.clue;
        ctx.fillText(blk.txt, x, y + 1);
      }
    };
    const top = this.insets.top;
    if (which === 'rows') for (let y = 0; y < b.h; y++) {
      const cy = gy + (y + 0.5) * S;
      if (cy < top - S || cy > this.H) continue;
      const clue = this.rowClues[y];
      const done = this.rowBlocks[y];
      const n = clue.length;
      if (!n) { ctx.globalAlpha = alpha; ctx.fillStyle = pal.dim; ctx.fillText('0', rowX + clueW - C * 0.5, cy + 1); continue; }
      for (let k = 0; k < n; k++) drawBlock(clue[k], rowX + clueW - (n - k - 0.5) * C - S * 0.08, cy, done[k], y === fy);
    }
    if (which === 'cols') for (let x = 0; x < b.w; x++) {
      const cx = gx + (x + 0.5) * S;
      if (cx < -S || cx > this.W) continue;
      const clue = this.colClues[x];
      const done = this.colBlocks[x];
      const n = clue.length;
      if (!n) { ctx.globalAlpha = alpha; ctx.fillStyle = pal.dim; ctx.fillText('0', cx, colY + clueH - C * 0.5); continue; }
      for (let k = 0; k < n; k++) drawBlock(clue[k], cx, colY + clueH - (n - k - 0.5) * C - S * 0.08, done[k], x === fx);
    }
    ctx.globalAlpha = 1;
  }

  drawReveal(ctx) {
    const r = this.reveal;
    const t = r.t;
    if (t < 1.1) {
      this.drawBoard(ctx, 1, t);
      if (t > 0.75 && !r.burst) {
        r.burst = true;
        const cols = r.pic.filled.length ? [...new Set(this.board.p.art.filter(Boolean))].slice(0, 6) : ['#ffd36a'];
        cols.push('#ffffff', '#ffd36a');
        this.burst(r.from.cx, r.from.cy, cols, 70, { speed: 420, size: 9, life: 1.6 });
      }
      return;
    }
    if (!r.cardShown) {
      r.cardShown = true;
      r.onCard?.();
    }
    const to = this.showcase(r.pic, this.cardTop || this.H * 0.62);
    const k = Math.min(1, (t - 1.1) / 0.6);
    const e = 1 - (1 - k) ** 3;
    const cx = r.from.cx + (to.cx - r.from.cx) * e;
    const cy = r.from.cy + (to.cy - r.from.cy) * e;
    const s = r.from.s + (to.s - r.from.s) * e;
    ctx.globalAlpha = e;
    this.drawSpot(ctx, { cx, cy, s }, r.pic);
    ctx.globalAlpha = 1;
    const live = Math.max(0, t - 1.7);
    drawLiving(ctx, r.pic, cx, cy, s, live, live > 0 ? this.board.p.anim : 'none', { reduced: this.reduced });
  }

  // Static thumbnail canvas of a picture (for albums and the gallery).
  thumb(puzzle, px = 84) {
    const pic = this.pic(puzzle);
    const c = canvas2d(px * 2, px * 2);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = pic.tint;
    rrect(g, 0, 0, c.width, c.height, c.width * 0.16);
    g.fill();
    const s = Math.floor((px * 2 * 0.8) / Math.max(pic.w, pic.h));
    g.drawImage(pic.canvas, (c.width - pic.w * s) / 2, (c.height - pic.h * s) / 2, pic.w * s, pic.h * s);
    return c;
  }
}
