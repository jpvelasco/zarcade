// The canvas view: a baked diorama, then trains, steam and overlays drawn
// each frame. Rendering only reads game state.

import {
  THEMES, drawPiece, drawPoints, drawScenery, drawDepot, drawStation, drawPaintShed, drawPortal,
  bakeTrain, puffSprite, makeCanvas, roundRect, badge, hash, drawSymbol, piecePairs, drawPeek, drawPortalHood,
} from './art.js';
import { pointAt, segLength, easedS, hopLifts } from './geom.js';
import { wrapTime } from './sim.js';
import { COLOR_HEX, DX, DY } from './pieces.js';

const MAX_PARTICLES = 160;
const CONFETTI = ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#b197fc', '#ff922b'];

export class View {
  constructor(canvas, { reduceMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduceMotion = reduceMotion;
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
    this.insets = { top: 0, bottom: 0, left: 0, right: 0 };
    this.board = null;
    this.theme = 'meadow';
    this.layout = new Map();
    this.skin = 'puffer';
    this.cs = 40;
    this.ox = 0;
    this.oy = 0;
    this.bg = null;
    this.boardCache = null;
    this.boardDirty = true;
    this.sprites = new Map();
    this.puff = null;
    this.run = null;          // simulate() result being played back
    this.time = 0;            // playback time in ticks
    this.particles = [];
    this.pops = [];           // { cell, t }
    this.cursor = -1;
    this.showCursor = false;
    this.hover = -1;
    this.ghost = null;        // { cell, piece }
    this.hint = null;         // { cell, piece, t }
    this.tutorial = null;     // list of cells for the first-level finger
    this.failMarks = [];
    this.served = new Set();
    this.dim = 0;
    this.clock = 0;
    this.shake = 0;
    this.selected = -1;
  }

  resize(w, h, insets) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = w;
    this.height = h;
    if (insets) this.insets = insets;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.fit();
    this.bg = null;
  }

  setScene({ board, theme, layout, skin }) {
    this.board = board;
    this.theme = theme || 'meadow';
    this.layout = layout || new Map();
    if (skin) this.skin = skin;
    this.run = null;
    this.time = 0;
    this.particles.length = 0;
    this.pops.length = 0;
    this.failMarks = [];
    this.served = new Set();
    this.hint = null;
    this.ghost = null;
    this.tutorial = null;
    this.fit();
    this.bg = null;
    this.boardDirty = true;
  }

  setLayout(layout) {
    this.layout = layout;
    this.boardDirty = true;
  }

  setSkin(skin) {
    if (skin === this.skin) return;
    this.skin = skin;
    this.sprites.clear();
  }

  fit() {
    if (!this.board) return;
    const { top, bottom, left, right } = this.insets;
    const aw = Math.max(80, this.width - left - right);
    const ah = Math.max(80, this.height - top - bottom);
    const { w, h } = this.board;
    const cs = Math.floor(Math.min(aw / (w + 0.8), ah / (h + 1.0), 120));
    const next = Math.max(20, cs);
    if (next !== this.cs) this.sprites.clear();
    this.cs = next;
    this.ox = Math.round(left + (aw - this.cs * w) / 2);
    this.oy = Math.round(top + (ah - this.cs * h) / 2 - this.cs * 0.08);
    this.boardDirty = true;
  }

  cellAt(clientX, clientY) {
    if (!this.board) return -1;
    const x = Math.floor((clientX - this.ox) / this.cs);
    const y = Math.floor((clientY - this.oy) / this.cs);
    if (x < 0 || y < 0 || x >= this.board.w || y >= this.board.h) return -1;
    return y * this.board.w + x;
  }

  cellCenter(i) {
    const { w } = this.board;
    return { x: this.ox + ((i % w) + 0.5) * this.cs, y: this.oy + (Math.floor(i / w) + 0.5) * this.cs };
  }

  // -------------------------------------------------------------- baking

  bakeBackground() {
    const T = THEMES[this.theme];
    const c = makeCanvas(this.canvas.width, this.canvas.height);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, T.sky[0]);
    grad.addColorStop(1, T.sky[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    const night = this.theme === 'night';
    // Soft floor pattern: a playroom rug or night stars.
    for (let k = 0; k < 70; k++) {
      const x = hash(k, 1) * c.width, y = hash(k, 2) * c.height;
      if (night) {
        g.fillStyle = `rgba(255, 250, 220, ${0.3 + hash(k, 3) * 0.6})`;
        g.beginPath(); g.arc(x, y, (0.6 + hash(k, 4) * 1.6) * this.dpr, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = 'rgba(255, 255, 255, 0.22)';
        g.beginPath(); g.arc(x, y, (8 + hash(k, 4) * 26) * this.dpr, 0, Math.PI * 2); g.fill();
      }
    }
    if (night) {
      g.fillStyle = '#fff6c9';
      g.beginPath(); g.arc(c.width * 0.86, c.height * 0.14, 26 * this.dpr, 0, Math.PI * 2); g.fill();
      g.fillStyle = T.sky[0];
      g.beginPath(); g.arc(c.width * 0.86 + 12 * this.dpr, c.height * 0.14 - 6 * this.dpr, 22 * this.dpr, 0, Math.PI * 2); g.fill();
    }
    this.bg = c;
  }

  bakeBoard() {
    const { board } = this;
    const d = this.dpr;
    const s = this.cs * d;
    const pad = Math.round(s * 0.32);
    const thick = Math.round(s * 0.2);
    const W = board.w * s + pad * 2, H = board.h * s + pad * 2 + thick;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const T = THEMES[this.theme];
    // Table top with a chunky edge.
    g.fillStyle = 'rgba(30, 20, 10, 0.25)';
    roundRect(g, s * 0.08, s * 0.14, W - s * 0.08, H - s * 0.1, s * 0.3); g.fill();
    g.fillStyle = T.tableDark;
    roundRect(g, 0, thick * 0.6, W, H - thick * 0.6, s * 0.3); g.fill();
    g.fillStyle = T.table;
    roundRect(g, 0, 0, W, H - thick, s * 0.3); g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.18)';
    roundRect(g, s * 0.06, s * 0.05, W - s * 0.12, s * 0.12, s * 0.06); g.fill();
    // Grass.
    g.save();
    g.translate(pad, pad);
    g.fillStyle = T.grass[0];
    roundRect(g, -s * 0.06, -s * 0.06, board.w * s + s * 0.12, board.h * s + s * 0.12, s * 0.18); g.fill();
    for (let y = 0; y < board.h; y++) {
      for (let x = 0; x < board.w; x++) {
        if ((x + y) % 2) { g.fillStyle = T.grass[1]; g.fillRect(x * s, y * s, s, s); }
        const i = y * board.w + x;
        g.fillStyle = T.tuft;
        for (let k = 0; k < 3; k++) {
          const tx = x * s + hash(i, 30 + k) * s, ty = y * s + hash(i, 50 + k) * s;
          g.fillRect(tx, ty, Math.max(1, s * 0.025), Math.max(2, s * 0.06));
        }
      }
    }
    const isKind = (x, y, pred) => x >= 0 && y >= 0 && x < board.w && y < board.h && pred(board.cells[y * board.w + x]);
    for (let y = 0; y < board.h; y++) {
      for (let x = 0; x < board.w; x++) {
        const i = y * board.w + x;
        const cell = board.cells[i];
        g.save();
        g.translate(x * s, y * s);
        if (cell.k === 'block') {
          const same = (c2) => (c2.k === 'block' && c2.deco === cell.deco) || (cell.deco === 'water' && c2.deco === 'bridge') || (cell.deco === 'mountain' && c2.k === 'portal');
          const around = { n: isKind(x, y - 1, same), s: isKind(x, y + 1, same), w: isKind(x - 1, y, same), e: isKind(x + 1, y, same) };
          drawScenery(g, s, cell.deco, i, this.theme, around);
        } else if (cell.k === 'track') {
          if (cell.deco === 'bridge') {
            const wet = (c2) => (c2.k === 'block' && c2.deco === 'water') || c2.deco === 'bridge';
            const around = { n: isKind(x, y - 1, wet), s: isKind(x, y + 1, wet), w: isKind(x - 1, y, wet), e: isKind(x + 1, y, wet) };
            drawScenery(g, s, 'water', i, this.theme, around);
            g.fillStyle = '#8a5a34';
            if (cell.v === 1) { g.fillRect(0, s * 0.18, s, s * 0.08); g.fillRect(0, s * 0.74, s, s * 0.08); }
            else { g.fillRect(s * 0.18, 0, s * 0.08, s); g.fillRect(s * 0.74, 0, s * 0.08, s); }
          }
          drawPiece(g, s, cell, { fixed: true });
        } else if (cell.k === 'depot') drawDepot(g, s, cell.dir, cell.colors || [cell.color]);
        else if (cell.k === 'station') drawStation(g, s, cell);
        else if (cell.k === 'paint') drawPaintShed(g, s, cell);
        else if (cell.k === 'portal') drawPortal(g, s, cell, this.theme);
        else if (cell.k === 'grass') {
          const p = this.layout.get(i);
          if (p) drawPiece(g, s, p);
        }
        g.restore();
      }
    }
    g.restore();
    this.boardCache = { canvas: c, pad: pad / d, w: W / d, h: H / d };
    this.boardDirty = false;
  }

  sprite(kind, color) {
    const key = `${kind}:${this.skin}:${color}`;
    let sp = this.sprites.get(key);
    if (!sp) {
      sp = bakeTrain(kind, this.skin, color, this.cs * this.dpr, color.length);
      this.sprites.set(key, sp);
    }
    return sp;
  }

  // ------------------------------------------------------------ playback

  setRun(result) {
    this.run = result;
    this.time = 0;
    this.failMarks = [];
    this.served = new Set();
    this.shake = 0;
  }

  frameAt(f) {
    const r = this.run;
    if (!r) return null;
    if (r.outcome === 'loop' && r.period > 0 && f >= r.loopFrom + r.period) f = r.loopFrom + ((f - r.loopFrom) % r.period);
    return r.frames[Math.max(0, Math.min(r.frames.length - 1, f))];
  }

  prevIndex(f) {
    const r = this.run;
    if (r.outcome === 'loop' && r.period > 0 && f === r.loopFrom) return r.loopFrom + r.period - 1;
    return f - 1;
  }

  // Head (d = 0) or a point d cells behind it, for train id at time T.
  trainPoint(id, T, d) {
    const r = this.run;
    let f = Math.floor(T);
    const fr = this.frameAt(f);
    if (!fr) return null;
    let seg = fr.trains[id];
    if (!seg) return null;
    const u = Math.min(1, T - f);
    let s = seg.kind === 'wait' ? 0 : easedS(seg, u);
    let wrappedF = r.outcome === 'loop' && r.period > 0 && f >= r.loopFrom + r.period ? r.loopFrom + ((f - r.loopFrom) % r.period) : Math.min(f, r.frames.length - 1);
    let guard = 4;
    // How far a trailing carriage is still back inside its depot shed.
    let inShed = 0;
    while (s < d && guard--) {
      d -= s;
      const pf = this.prevIndex(wrappedF);
      const prev = pf >= 0 ? r.frames[pf] && r.frames[pf].trains[id] : null;
      if (!prev || prev.kind === 'wait') { inShed = seg.kind === 'depart' ? d : 0; s = 0; d = 0; break; }
      seg = prev;
      wrappedF = pf;
      s = segLength(seg);
    }
    const p = pointAt(seg, Math.max(0, s - d));
    if (inShed) {
      // Slide out of the shed behind the engine instead of piling up on it.
      p.x -= Math.cos(p.a) * inShed;
      p.y -= Math.sin(p.a) * inShed;
    }
    const { w } = this.board;
    let alpha = inShed ? Math.max(0, 1 - inShed / 0.3) : 1;
    const sl = Math.max(0, s - d);
    if (seg.kind === 'in') alpha = Math.max(0, Math.min(1, (0.46 - sl) / 0.22));
    if (seg.kind === 'out') alpha = Math.max(0, Math.min(1, (sl - 0.04) / 0.22));
    return {
      x: this.ox + ((seg.cell % w) + p.x) * this.cs,
      y: this.oy + (Math.floor(seg.cell / w) + p.y) * this.cs,
      a: p.a,
      alpha,
      color: sl >= 0.5 || seg.kind === 'out' ? seg.color2 || seg.color : seg.color,
      seg,
    };
  }

  // ----------------------------------------------------------- particles

  emit(kind, x, y, opts = {}) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    const a = opts.angle ?? Math.random() * Math.PI * 2;
    const sp = opts.speed ?? 30;
    this.particles.push({
      kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: opts.life ?? 1,
      size: opts.size ?? 8, color: opts.color || '#fff', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8, grav: opts.grav ?? 0,
    });
  }

  burst(kind, x, y, n, opts = {}) {
    const count = this.reduceMotion ? Math.ceil(n / 3) : n;
    for (let k = 0; k < count; k++) {
      this.emit(kind, x, y, { ...opts, speed: (opts.speed ?? 60) * (0.5 + Math.random()), color: opts.colors ? opts.colors[k % opts.colors.length] : opts.color });
    }
  }

  confetti() {
    const n = this.reduceMotion ? 20 : 70;
    for (let k = 0; k < n; k++) {
      this.emit('confetti', this.width * (0.1 + Math.random() * 0.8), -10 - Math.random() * 60, {
        angle: Math.PI / 2 + (Math.random() - 0.5), speed: 40 + Math.random() * 80, life: 2.6 + Math.random(),
        size: 6 + Math.random() * 6, color: CONFETTI[k % CONFETTI.length], grav: 60,
      });
    }
  }

  pop(cell) {
    this.pops.push({ cell, t: 0 });
    const c = this.cellCenter(cell);
    this.burst('dust', c.x, c.y, 6, { speed: 50, life: 0.45, size: 5, color: '#f3e3c6' });
  }

  update(dt) {
    this.clock += dt;
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'puff') { p.vx *= 0.96; p.vy = p.vy * 0.96 - 6 * dt; p.size += dt * 10; }
      else if (p.kind !== 'confetti') { p.vx *= 0.92; p.vy *= 0.92; }
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.35);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  // ---------------------------------------------------------------- draw

  draw() {
    const ctx = this.ctx;
    const d = this.dpr;
    if (!this.bg) this.bakeBackground();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (!this.board) return;
    if (this.boardDirty || !this.boardCache) this.bakeBoard();
    const bc = this.boardCache;
    ctx.save();
    if (this.shake > 0 && !this.reduceMotion) {
      ctx.translate((Math.random() - 0.5) * this.shake * 8, (Math.random() - 0.5) * this.shake * 8);
    }
    ctx.drawImage(bc.canvas, this.ox - bc.pad, this.oy - bc.pad, bc.w, bc.h);
    this.drawDynamic(ctx);
    ctx.restore();
    this.drawParticles(ctx);
    if (this.dim > 0) {
      ctx.fillStyle = `rgba(255, 250, 240, ${this.dim})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  drawDynamic(ctx) {
    const { board, cs } = this;
    const T = this.run ? Math.min(wrapTime(this.run, this.time), this.run.endTime) : 0;
    const frame = this.run ? this.frameAt(Math.floor(T)) : null;
    // Switch points.
    let swIndex = 0;
    for (let i = 0; i < board.cells.length; i++) {
      const p = board.cells[i].k === 'grass' ? this.layout.get(i) : (board.cells[i].k === 'track' && board.cells[i].t === 'W' ? board.cells[i] : null);
      if (!p || p.t !== 'W') continue;
      const state = frame && frame.sw ? frame.sw[swIndex] : 0;
      swIndex++;
      ctx.save();
      ctx.translate(this.ox + (i % board.w) * cs, this.oy + Math.floor(i / board.w) * cs);
      drawPoints(ctx, cs, p.v, state);
      ctx.restore();
    }
    // Waiting passengers on platforms.
    for (let i = 0; i < board.cells.length; i++) {
      const c = board.cells[i];
      if (c.k !== 'station' || this.served.has(i)) continue;
      const cx = this.ox + (i % board.w) * cs, cy = this.oy + Math.floor(i / board.w) * cs;
      for (let k = 0; k < 2; k++) {
        const bob = this.reduceMotion ? 0 : Math.abs(Math.sin(this.clock * 3 + k * 1.7 + i)) * cs * 0.03;
        const px = c.v === 0 ? cx + cs * 0.88 : cx + cs * (0.24 + k * 0.52);
        const py = c.v === 0 ? cy + cs * (0.24 + k * 0.52) : cy + cs * 0.1;
        ctx.fillStyle = ['#ffd6a5', '#bde0fe', '#ffc8dd'][(i + k) % 3];
        ctx.beginPath(); ctx.arc(px, py - bob, cs * 0.07, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLOR_HEX[c.color];
        ctx.beginPath(); ctx.arc(px, py - bob, cs * 0.07, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
      }
    }
    // Ghost, hint, cursor.
    if (this.ghost && this.ghost.piece) this.drawGhost(ctx, this.ghost.cell, this.ghost.piece, 0.45);
    if (this.hint) {
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 6);
      this.highlight(ctx, this.hint.cell, `rgba(255, 214, 64, ${0.5 + pulse * 0.4})`, 4);
      if (this.hint.piece) this.drawGhost(ctx, this.hint.cell, this.hint.piece, 0.55 + pulse * 0.25);
    }
    for (const p of this.pops) {
      const c = this.cellCenter(p.cell);
      const k = p.t / 0.35;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * (1 - k)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c.x, c.y, cs * (0.3 + k * 0.4), 0, Math.PI * 2); ctx.stroke();
    }
    if (this.showCursor && this.cursor >= 0) this.highlight(ctx, this.cursor, '#ffffff', 4, true);
    if (this.selected >= 0) this.highlight(ctx, this.selected, '#ff8a3d', 3);
    if (this.tutorial && !this.run) this.drawTutorial(ctx);
    // Trains.
    if (this.run) {
      this.drawTrains(ctx, T);
      // Tunnel hills go back over the trains so they disappear inside.
      for (let i = 0; i < board.cells.length; i++) {
        if (board.cells[i].k !== 'portal') continue;
        ctx.save();
        ctx.translate(this.ox + (i % board.w) * cs, this.oy + Math.floor(i / board.w) * cs);
        drawPortalHood(ctx, cs, board.cells[i], this.theme);
        ctx.restore();
      }
    } else this.drawParked(ctx);
    for (const m of this.failMarks) this.drawFailMark(ctx, m);
  }

  drawGhost(ctx, cell, piece, alpha) {
    const { cs, board } = this;
    ctx.save();
    ctx.translate(this.ox + (cell % board.w) * cs, this.oy + Math.floor(cell / board.w) * cs);
    drawPiece(ctx, cs, piece, { alpha });
    ctx.restore();
  }

  highlight(ctx, cell, color, width, dashed = false) {
    const { cs, board } = this;
    const x = this.ox + (cell % board.w) * cs, y = this.oy + Math.floor(cell / board.w) * cs;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([cs * 0.16, cs * 0.1]);
    roundRect(ctx, x + 3, y + 3, cs - 6, cs - 6, cs * 0.14);
    ctx.stroke();
    if (dashed) {
      ctx.strokeStyle = 'rgba(40, 40, 60, 0.6)';
      ctx.lineDashOffset = cs * 0.13;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTutorial(ctx) {
    const cells = this.tutorial;
    if (!cells || cells.length < 2) return;
    const pts = cells.map((i) => this.cellCenter(i));
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = this.cs * 0.08;
    ctx.lineCap = 'round';
    ctx.setLineDash([this.cs * 0.12, this.cs * 0.16]);
    ctx.lineDashOffset = -this.clock * this.cs * 0.6;
    ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    // A finger gliding along.
    const t = (Math.max(0, this.clock) * 0.45) % 1.3;
    const u = Math.min(1, t) * (pts.length - 1);
    const k = Math.min(pts.length - 2, Math.floor(u));
    const f = u - k;
    const x = pts[k].x + (pts[k + 1].x - pts[k].x) * f, y = pts[k].y + (pts[k + 1].y - pts[k].y) * f;
    ctx.globalAlpha = t > 1 ? 1 - (t - 1) / 0.3 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.arc(x + 4, y + 6, this.cs * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, this.cs * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb4a2';
    ctx.beginPath(); ctx.arc(x, y, this.cs * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawTrainSprite(ctx, kind, color, x, y, a, alpha = 1, wobble = 0, lift = 0) {
    const sp = this.sprite(kind, color);
    const d = this.dpr;
    ctx.save();
    ctx.globalAlpha = alpha;
    // A hop rises straight up the screen, whichever way the train faces.
    ctx.translate(x, y - lift * this.cs * 0.3);
    ctx.rotate(a + wobble);
    if (lift) ctx.scale(1 + lift * 0.12, 1 + lift * 0.12);
    ctx.drawImage(sp, -sp.width / d / 2, -sp.height / d / 2, sp.width / d, sp.height / d);
    ctx.restore();
  }

  // Engines peeking out of their sheds before Go.
  drawParked(ctx) {
    const { board, cs } = this;
    const seen = new Set();
    for (const t of board.trains) {
      if (seen.has(t.depot)) continue;
      seen.add(t.depot);
      const c = this.cellCenter(t.depot);
      const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][t.dir];
      const bob = this.reduceMotion ? 0 : Math.sin(this.clock * 3 + t.depot) * cs * 0.015;
      ctx.save();
      ctx.translate(c.x + Math.cos(ang) * (cs * 0.3 + bob), c.y + Math.sin(ang) * (cs * 0.3 + bob));
      ctx.rotate(ang);
      drawPeek(ctx, cs, t.color);
      ctx.restore();
    }
  }

  drawTrains(ctx, T) {
    const frame = this.frameAt(Math.floor(T));
    if (!frame) return;
    const ended = this.time >= this.run.endTime && this.run.outcome !== 'loop' && this.run.outcome !== 'win';
    const shownWait = new Set();
    // A depot is busy while a leaving train (engine or carriage) is still on it.
    const cars = frame.trains.map((seg, id) => (seg && seg.kind !== 'wait' ? this.trainPoint(id, T, 0.7) : null));
    const busy = new Set();
    frame.trains.forEach((seg, id) => {
      if (seg && seg.kind === 'depart') busy.add(seg.cell);
      if (cars[id] && cars[id].seg.kind === 'depart') busy.add(cars[id].seg.cell);
    });
    const heads = frame.trains.map((seg, id) => (seg && seg.kind !== 'wait' ? this.trainPoint(id, T, 0) : null));
    const visible = (p) => (p && p.alpha > 0.02 ? p : null);
    const bonked = this.failMarks.filter((m) => m.type === 'crash').map((m) => m.trains);
    const lifts = hopLifts(heads.map((h, id) => (visible(h) ? { head: h, car: visible(cars[id]) } : null)), this.cs * 0.55, bonked);
    // Hopping trains go on top, so the engine passes over the carriage.
    const order = frame.trains.map((_, id) => id).sort((a, b) => lifts[a] - lifts[b]);
    for (const id of order) {
      const seg = frame.trains[id];
      if (!seg) continue;
      if (seg.kind === 'wait') {
        // Only the next train in a queue peeks out, once the shed is clear.
        if (shownWait.has(seg.cell) || busy.has(seg.cell)) continue;
        shownWait.add(seg.cell);
      }
      const wob = ended && this.failMarks.some((m) => m.trains && m.trains.includes(id)) ? Math.sin(this.clock * 30) * 0.12 : 0;
      const car = cars[id];
      const head = heads[id] || this.trainPoint(id, T, 0);
      const lift = lifts[id];
      if (lift > 0) for (const p of [car, head]) if (p && p.alpha > 0.02) this.drawHopShadow(ctx, p, lift);
      if (car && car.alpha > 0.02) this.drawTrainSprite(ctx, 'car', car.color, car.x, car.y, car.a, car.alpha, wob * 0.5, lift);
      if (head && head.alpha > 0.02) this.drawTrainSprite(ctx, 'loco', head.color, head.x, head.y, head.a, head.alpha, wob, lift);
    }
  }

  // A soft shadow left on the track while a train hops over another.
  drawHopShadow(ctx, p, lift) {
    const { cs } = this;
    ctx.save();
    ctx.globalAlpha = p.alpha * 0.25 * lift;
    ctx.fillStyle = '#141414';
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.beginPath(); ctx.ellipse(0, 0, cs * 0.26, cs * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawFailMark(ctx, m) {
    const { cs } = this;
    const k = Math.min(1, (this.clock - m.t0) * 3);
    const s = 0.6 + 0.4 * Math.sin(Math.min(1, k) * Math.PI * 0.5);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(s, s);
    if (m.type === 'crash') {
      ctx.fillStyle = '#ffd43b';
      drawSymbol(ctx, 'star', 0, 0, cs * 0.42, '#ffd43b');
      drawSymbol(ctx, 'star', 0, 0, cs * 0.28, '#ff6b3d');
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.round(cs * 0.2)}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BONK', 0, cs * 0.02);
    } else {
      const label = m.type === 'loop' ? '↻' : m.type === 'unserved' ? '!' : '?';
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.arc(2, 4, cs * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = m.type === 'unserved' ? '#ff922b' : '#ff6b6b';
      ctx.beginPath(); ctx.arc(0, 0, cs * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.round(cs * 0.32)}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, cs * 0.02);
    }
    ctx.restore();
  }

  addFailMarks(result) {
    const { cs, board } = this;
    const now = this.clock;
    for (const f of result.failures) {
      const c = this.cellCenter(f.cell);
      if (f.type === 'crash') {
        let x = c.x, y = c.y;
        if (f.swap) { const o = this.cellCenter(f.other); x = (x + o.x) / 2; y = (y + o.y) / 2; }
        this.failMarks.push({ type: 'crash', x, y, t0: now, trains: [f.a, f.b] });
      } else if (f.type === 'derail') {
        const x = c.x + DX[f.edge] * cs * 0.5, y = c.y + DY[f.edge] * cs * 0.5;
        this.failMarks.push({ type: 'derail', x, y: y - cs * 0.3, t0: now, trains: [f.train] });
      } else if (f.type === 'unserved') {
        this.failMarks.push({ type: 'unserved', x: c.x, y: c.y - cs * 0.35, t0: now });
      }
    }
    if (result.outcome === 'loop' && board.trains.length) {
      const fr = this.frameAt(Math.floor(result.endTime));
      const seg = fr && fr.trains.find((t) => t);
      if (seg) { const c = this.cellCenter(seg.cell); this.failMarks.push({ type: 'loop', x: c.x, y: c.y - cs * 0.4, t0: now }); }
    }
  }

  drawParticles(ctx) {
    if (!this.puff) this.puff = puffSprite(64);
    for (const p of this.particles) {
      const k = p.life / p.max;
      if (p.kind === 'puff') {
        ctx.globalAlpha = (1 - k) * (1 - k * 0.3);
        const s = p.size;
        ctx.drawImage(this.puff, p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.kind === 'confetti') {
        ctx.globalAlpha = Math.min(1, (1 - k) * 2);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.kind === 'heart' || p.kind === 'star') {
        ctx.globalAlpha = 1 - k;
        drawSymbol(ctx, p.kind, p.x, p.y, p.size * (0.6 + k * 0.5), p.color);
      } else {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Steam from each running loco's chimney (called a few times per tick).
  steam() {
    if (!this.run) return;
    const T = Math.min(wrapTime(this.run, this.time), this.run.endTime);
    const frame = this.frameAt(Math.floor(T));
    if (!frame) return;
    for (let id = 0; id < frame.trains.length; id++) {
      const seg = frame.trains[id];
      if (!seg || seg.kind === 'wait' || seg.kind === 'arrive') continue;
      const h = this.trainPoint(id, T, 0);
      if (!h || h.alpha < 0.5) continue;
      const x = h.x + Math.cos(h.a) * this.cs * 0.17, y = h.y + Math.sin(h.a) * this.cs * 0.17;
      this.emit('puff', x, y - this.cs * 0.06, { angle: -Math.PI / 2 + (Math.random() - 0.5), speed: 16, life: 1.3, size: this.cs * 0.17 });
    }
  }

  // Piece shown in the tray button.
  static drawTool(canvas, piece) {
    const g = canvas.getContext('2d');
    const s = canvas.width;
    g.clearRect(0, 0, s, s);
    if (piece) drawPiece(g, s, piece);
  }
}

export { piecePairs, badge };
