// Canvas drawing for Jelly Jam: tiles, wobbly jellies with faces, blasts and
// bubbles. The view only reads game state; it never changes the board.
import { isJelly, STRIPE_H, STRIPE_V, BOMB, RAINBOW } from './board.js';

// Each colour also has its own silhouette, so the board still reads at a
// glance without relying on colour alone.
export const PALETTE = [
  { name: 'Strawberry', light: '#ffc2d4', mid: '#ff5f8f', dark: '#c4144f', shape: 'circle' },
  { name: 'Kiwi', light: '#d9ff9e', mid: '#69d43f', dark: '#2c8a1f', shape: 'square' },
  { name: 'Bubblegum', light: '#ffd0ff', mid: '#e46bff', dark: '#8f28b8', shape: 'triangle' },
  { name: 'Mango', light: '#ffe9a8', mid: '#ffb02e', dark: '#c96a00', shape: 'hexagon' },
  { name: 'Blueberry', light: '#c2f0ff', mid: '#3aa7ff', dark: '#1352aa', shape: 'pentagon' },
  { name: 'Grape', light: '#dfd2ff', mid: '#9a72ff', dark: '#4f2aa8', shape: 'star' },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - u) * (1 - u);
const easeBack = (u) => 1 + 2.2 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2);

function polygon(r, n, rot = -Math.PI / 2, inner = 0) {
  const pts = [];
  const count = inner ? n * 2 : n;
  for (let i = 0; i < count; i++) {
    const a = rot + (i / count) * Math.PI * 2;
    const rr = inner && i % 2 ? r * inner : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}

function roundedPoly(ctx, pts, radius) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const toPrev = Math.hypot(prev[0] - cur[0], prev[1] - cur[1]);
    const toNext = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const r = Math.min(radius, toPrev / 2, toNext / 2);
    const start = [cur[0] + ((prev[0] - cur[0]) / toPrev) * r, cur[1] + ((prev[1] - cur[1]) / toPrev) * r];
    if (i === 0) ctx.moveTo(start[0], start[1]);
    else ctx.lineTo(start[0], start[1]);
    ctx.arcTo(cur[0], cur[1], next[0], next[1], r);
  }
  ctx.closePath();
}

// The silhouette for one jelly, centred on the origin.
function shapePath(ctx, r, shape) {
  switch (shape) {
    case 'square': return roundedPoly(ctx, polygon(r * 1.08, 4, Math.PI / 4), r * 0.45);
    case 'triangle': return roundedPoly(ctx, polygon(r * 1.16, 3), r * 0.42);
    case 'pentagon': return roundedPoly(ctx, polygon(r * 1.06, 5), r * 0.34);
    case 'hexagon': return roundedPoly(ctx, polygon(r * 1.06, 6, 0), r * 0.3);
    case 'star': return roundedPoly(ctx, polygon(r * 1.12, 5, -Math.PI / 2, 0.58), r * 0.22);
    default:
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      return undefined;
  }
}

// Jellies are pre-rendered once per size; only the faces are drawn live.
function bakeJelly(size, color, special) {
  const pad = Math.ceil(size * 0.18);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size + pad * 2;
  const ctx = canvas.getContext('2d');
  const c = (size + pad * 2) / 2;
  const r = size * 0.45;
  ctx.translate(c, c);
  const skin = color === null ? { light: '#ffffff', mid: '#e8faff', dark: '#7fb8d8', shape: 'circle' } : PALETTE[color];

  // body
  ctx.save();
  shapePath(ctx, r, skin.shape);
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, skin.light);
  g.addColorStop(0.45, skin.mid);
  g.addColorStop(1, skin.dark);
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(2, 20, 38, 0.45)';
  ctx.shadowBlur = size * 0.16;
  ctx.shadowOffsetY = size * 0.07;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();

  // inner glow and rim
  const inner = ctx.createRadialGradient(-r * 0.3, -r * 0.42, r * 0.1, 0, 0, r * 1.25);
  inner.addColorStop(0, 'rgba(255,255,255,0.65)');
  inner.addColorStop(0.42, 'rgba(255,255,255,0.08)');
  inner.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = inner;
  ctx.fillRect(-c, -c, c * 2, c * 2);

  if (special === STRIPE_H || special === STRIPE_V) {
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    for (let k = -2; k <= 2; k++) {
      const off = k * r * 0.38;
      if (special === STRIPE_H) ctx.fillRect(-r, off - r * 0.09, r * 2, r * 0.18);
      else ctx.fillRect(off - r * 0.09, -r, r * 0.18, r * 2);
    }
  }
  if (special === RAINBOW) {
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * (1 - k * 0.14), (k / 6) * Math.PI * 2, (k / 6) * Math.PI * 2 + Math.PI * 0.9);
      ctx.strokeStyle = PALETTE[k].mid;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = r * 0.16;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // gloss
  ctx.save();
  shapePath(ctx, r, skin.shape);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(-r * 0.26, -r * 0.44, r * 0.42, r * 0.26, -0.45, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fill();
  ctx.restore();

  if (special === BOMB) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, size * 0.05);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.02, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([size * 0.09, size * 0.09]);
    ctx.lineWidth = Math.max(1.5, size * 0.035);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  return { canvas, pad, size: size + pad * 2 };
}

class Sprite {
  constructor(cell, idx, x, y) {
    this.cell = cell;
    this.id = cell.id;
    this.idx = idx;
    this.x = x;
    this.y = y;
    this.fromX = x;
    this.fromY = y;
    this.el = 0;
    this.dur = 0;
    this.sx = 1;
    this.sy = 1;
    this.vy = 0;
    this.pop = -1;       // >= 0 while clearing
    this.born = 0;       // < 1 while appearing
    this.blink = 2 + Math.random() * 4;
    this.mood = 0;       // 0 calm, 1 surprised
    this.hatch = -1;
    this.spin = 0;
  }

  moveTo(x, y, dur) {
    this.fromX = this.x;
    this.fromY = this.y;
    this.el = 0;
    this.dur = dur;
  }

  target(view) {
    return [view.colOf(this.idx), view.rowOf(this.idx)];
  }
}

export class BoardView {
  constructor(canvas, { reduceMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduce = reduceMotion;
    this.sprites = new Map();
    this.effects = [];
    this.particles = [];
    this.timer = 0;
    this.time = 0;
    this.shake = 0;
    this.selected = -1;
    this.cursor = -1;
    this.hover = -1;
    this.hint = null;
    this.hintGlow = 0;
    this.pointer = null;
    this.tile = 48;
    this.game = null;
    this.flash = 0;
  }

  setGame(game) {
    this.game = game;
    this.sprites.clear();
    this.effects.length = 0;
    this.particles.length = 0;
    this.timer = 0;
    this.selected = this.cursor = this.hover = -1;
    this.hint = null;
    this.reconcile(0);
  }

  // ------------------------------------------------------------- layout

  colOf(i) { return this.game.board.col(i); }
  rowOf(i) { return this.game.board.row(i); }

  resize(width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const b = this.game?.board;
    const cols = b ? b.w : 8;
    const rows = b ? b.h : 8;
    const pad = 14;
    this.tile = Math.max(18, Math.min((width - pad * 2) / cols, (height - pad * 2) / rows));
    this.ox = (width - this.tile * cols) / 2;
    this.oy = (height - this.tile * rows) / 2;
    this.cache = new Map();
  }

  px(col) { return this.ox + (col + 0.5) * this.tile; }
  py(row) { return this.oy + (row + 0.5) * this.tile; }

  centerOf(i) { return { x: this.px(this.colOf(i)), y: this.py(this.rowOf(i)) }; }

  cellAt(x, y) {
    const b = this.game?.board;
    if (!b) return -1;
    const c = Math.floor((x - this.ox) / this.tile);
    const r = Math.floor((y - this.oy) / this.tile);
    if (!b.inside(c, r)) return -1;
    const i = b.idx(c, r);
    return b.playable(i) ? i : -1;
  }

  baked(color, special) {
    const key = `${color}|${special}|${Math.round(this.tile)}`;
    let art = this.cache.get(key);
    if (!art) {
      art = bakeJelly(Math.round(this.tile), color, special);
      this.cache.set(key, art);
    }
    return art;
  }

  // ------------------------------------------------------------ sprites

  // Makes the sprite list agree with the board again. Cheap insurance so a
  // missed animation can never leave a ghost jelly behind.
  reconcile(dur = 0.18) {
    const board = this.game.board;
    const seen = new Set();
    for (const i of board.playableIndices()) {
      const cell = board.at(i);
      if (!cell) continue;
      seen.add(cell.id);
      let sprite = this.sprites.get(cell.id);
      if (!sprite) {
        sprite = new Sprite(cell, i, this.colOf(i), this.rowOf(i));
        sprite.born = 0;
        this.sprites.set(cell.id, sprite);
      }
      sprite.cell = cell;
      if (sprite.idx !== i) {
        sprite.idx = i;
        sprite.moveTo(sprite.x, sprite.y, dur);
      }
    }
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id) && sprite.pop < 0 && sprite.hatch < 0) this.sprites.delete(id);
    }
  }

  get busy() {
    return this.timer > 0;
  }

  // ---------------------------------------------------------- animation

  swapAnim(a, b, { fail = false } = {}) {
    const dur = this.reduce ? 0.1 : fail ? 0.26 : 0.16;
    const sa = this.spriteAt(a);
    const sb = this.spriteAt(b);
    if (fail) {
      for (const [s, other] of [[sa, b], [sb, a]]) {
        if (!s) continue;
        s.bump = { x: (this.colOf(other) - this.colOf(s.idx)) * 0.34, y: (this.rowOf(other) - this.rowOf(s.idx)) * 0.34, el: 0, dur };
        s.mood = 1;
      }
      this.timer = Math.max(this.timer, dur);
      return;
    }
    if (sa) { sa.idx = b; sa.moveTo(sa.x, sa.y, dur); }
    if (sb) { sb.idx = a; sb.moveTo(sb.x, sb.y, dur); }
    this.timer = Math.max(this.timer, dur);
  }

  spriteAt(idx) {
    for (const s of this.sprites.values()) if (s.idx === idx && s.pop < 0) return s;
    return null;
  }

  playStep(step) {
    if (step.type === 'clear') return this.playClear(step);
    if (step.type === 'fall') return this.playFall(step);
    if (step.type === 'party') return this.playParty(step);
    if (step.type === 'shuffle') return this.playShuffle(step);
    return 0;
  }

  playClear(step) {
    const dur = this.reduce ? 0.16 : 0.3;
    for (const blast of step.blasts) this.addBlast(blast);
    for (const gone of step.cleared) {
      const sprite = this.sprites.get(gone.id);
      if (!sprite) continue;
      sprite.pop = 0;
      sprite.popDur = dur;
      this.burst(sprite.x, sprite.y, gone.color, gone.special ? 14 : 7);
    }
    for (const chip of [...step.sand, ...step.ice, ...step.coral]) {
      const c = this.colOf(chip.index), r = this.rowOf(chip.index);
      this.puff(c, r, chip.left);
    }
    for (const made of step.created) {
      const old = this.spriteAt(made.index);
      if (old) { old.pop = 0; old.popDur = dur * 0.6; }
      const cell = this.game.board.at(made.index);
      if (cell) {
        const sprite = new Sprite(cell, made.index, this.colOf(made.index), this.rowOf(made.index));
        sprite.born = 0;
        this.sprites.set(cell.id, sprite);
        this.sparkle(sprite.x, sprite.y);
      }
    }
    if (step.chain > 1) this.flash = Math.min(0.5, 0.12 * step.chain);
    const power = step.cleared.length;
    if (!this.reduce) this.shake = Math.max(this.shake, clamp((power - 4) * 0.7, 0, 9));
    this.timer = Math.max(this.timer, dur + 0.02);
    return dur;
  }

  playFall(step) {
    const board = this.game.board;
    let far = 1;
    for (const mv of step.moves) {
      const sprite = this.sprites.get(mv.id);
      if (!sprite) continue;
      const dist = Math.abs(board.row(mv.to) - board.row(mv.from)) + Math.abs(board.col(mv.to) - board.col(mv.from));
      far = Math.max(far, dist);
      sprite.idx = mv.to;
      sprite.land = true;
      sprite.moveTo(sprite.x, sprite.y, 0);
    }
    for (const sp of step.spawns) {
      const cell = board.at(sp.to);
      if (!cell) continue;
      const sprite = new Sprite(cell, sp.to, this.colOf(sp.to), -sp.above - 0.4);
      sprite.land = true;
      this.sprites.set(cell.id, sprite);
      far = Math.max(far, this.rowOf(sp.to) + sp.above);
    }
    for (const egg of step.eggs) {
      const sprite = this.sprites.get(egg.id);
      if (sprite) { sprite.hatch = 0; sprite.idx = egg.index; }
      const c = this.colOf(egg.index), r = this.rowOf(egg.index);
      this.burst(c, r, 3, 18);
      this.sparkle(c, r);
    }
    const dur = (this.reduce ? 0.08 : 0.13) + far * (this.reduce ? 0.012 : 0.035);
    for (const s of this.sprites.values()) if (s.land) { s.moveTo(s.x, s.y, dur); s.land = false; s.falling = true; }
    this.timer = Math.max(this.timer, dur + 0.02);
    return dur;
  }

  playParty(step) {
    for (const made of step.created) {
      const old = this.spriteAt(made.index);
      const cell = this.game.board.at(made.index);
      if (old && cell) { old.cell = cell; old.born = 0.35; this.sparkle(old.x, old.y); }
    }
    this.timer = Math.max(this.timer, this.reduce ? 0.05 : 0.1);
    return 0.1;
  }

  playShuffle(step) {
    const dur = this.reduce ? 0.2 : 0.75;
    for (const s of this.sprites.values()) {
      s.swirl = { el: 0, dur, a: Math.random() * Math.PI * 2, r: 0.5 + Math.random() * 0.7 };
      s.mood = 1;
    }
    for (const i of step.cells) this.sparkle(this.colOf(i), this.rowOf(i));
    this.timer = Math.max(this.timer, dur);
    return dur;
  }

  // ------------------------------------------------------------ effects

  addBlast(blast) {
    const board = this.game.board;
    const at = { x: this.colOf(blast.index), y: this.rowOf(blast.index) };
    const kind = blast.kind;
    if (kind === STRIPE_H || kind === STRIPE_V || kind === 'cross' || kind === 'bigCross') {
      const rows = kind === STRIPE_H || kind === 'cross' || kind === 'bigCross';
      const cols = kind === STRIPE_V || kind === 'cross' || kind === 'bigCross';
      const wide = kind === 'bigCross' ? 1 : 0;
      if (rows) this.effects.push({ kind: 'beam', dir: 'h', at, wide, life: 0, max: 0.36 });
      if (cols) this.effects.push({ kind: 'beam', dir: 'v', at, wide, life: 0, max: 0.36 });
    } else if (kind === BOMB || kind === 'mega') {
      this.effects.push({ kind: 'ring', at, r: kind === 'mega' ? 2.7 : 1.7, life: 0, max: 0.4 });
    } else if (kind === RAINBOW || kind === 'whole' || kind === 'pearlStripe' || kind === 'pearlBomb') {
      this.effects.push({ kind: 'shimmer', at, life: 0, max: 0.5 });
    }
    if (!this.reduce) this.shake = Math.max(this.shake, kind === 'whole' ? 14 : kind === 'mega' ? 10 : 5);
    for (const i of blast.cells.slice(0, 26)) {
      if (!board.playable(i)) continue;
      this.burst(this.colOf(i), this.rowOf(i), blast.color ?? 4, 3);
    }
  }

  burst(x, y, color, n) {
    if (this.reduce) n = Math.ceil(n / 3);
    const skin = color === null || color === undefined ? PALETTE[4] : PALETTE[color % PALETTE.length];
    for (let k = 0; k < n; k++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 3.4,
        vy: -Math.random() * 2.6 - 0.5,
        r: 0.06 + Math.random() * 0.12,
        life: 0,
        max: 0.5 + Math.random() * 0.5,
        color: Math.random() < 0.4 ? '#ffffff' : skin.light,
        kind: 'bubble',
      });
    }
  }

  sparkle(x, y) {
    const n = this.reduce ? 4 : 10;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * 2.4,
        vy: Math.sin(a) * 2.4,
        r: 0.08,
        life: 0,
        max: 0.42,
        color: '#fff6d8',
        kind: 'spark',
      });
    }
  }

  puff(x, y, left) {
    const n = this.reduce ? 2 : 6;
    for (let k = 0; k < n; k++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 1.2,
        r: 0.05 + Math.random() * 0.08,
        life: 0,
        max: 0.4,
        color: left > 0 ? '#e9d7a8' : '#cdeacf',
        kind: 'grain',
      });
    }
  }

  // ------------------------------------------------------------- update

  update(dt) {
    this.time += dt;
    this.timer = Math.max(0, this.timer - dt);
    this.shake *= Math.pow(0.0015, dt);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.hintGlow += dt;

    for (const [id, s] of this.sprites) {
      const [tx, ty] = s.target(this);
      if (s.dur > 0) {
        s.el += dt;
        const u = clamp(s.el / s.dur, 0, 1);
        const e = easeOut(u);
        s.x = s.fromX + (tx - s.fromX) * e;
        s.y = s.fromY + (ty - s.fromY) * e;
        if (u >= 1) {
          s.dur = 0;
          s.x = tx;
          s.y = ty;
          if (s.falling) { s.vy = -3.4; s.falling = false; }
        }
      } else {
        s.x += (tx - s.x) * Math.min(1, dt * 18);
        s.y += (ty - s.y) * Math.min(1, dt * 18);
      }
      if (s.bump) {
        s.bump.el += dt;
        if (s.bump.el >= s.bump.dur) { s.bump = null; s.mood = 0; }
      }
      if (s.swirl) {
        s.swirl.el += dt;
        if (s.swirl.el >= s.swirl.dur) { s.swirl = null; s.mood = 0; }
      }
      // squash spring
      const target = 1;
      s.vy += (target - s.sy) * 240 * dt;
      s.vy *= Math.pow(0.02, dt);
      s.sy += s.vy * dt;
      s.sy = clamp(s.sy, 0.55, 1.4);
      s.sx = 1 + (1 - s.sy) * 0.85;
      if (s.born < 1) s.born = Math.min(1, s.born + dt * (this.reduce ? 8 : 4.5));
      if (s.pop >= 0) {
        s.pop += dt / (s.popDur || 0.3);
        if (s.pop >= 1) this.sprites.delete(id);
      }
      if (s.hatch >= 0) {
        s.hatch += dt / 0.55;
        if (s.hatch >= 1) this.sprites.delete(id);
      }
      s.blink -= dt;
      if (s.blink < -0.14) s.blink = 2.5 + Math.random() * 5;
      if (s.mood > 0 && !s.bump && !s.swirl) s.mood = Math.max(0, s.mood - dt * 2);
    }

    for (let k = this.effects.length - 1; k >= 0; k--) {
      const fx = this.effects[k];
      fx.life += dt;
      if (fx.life >= fx.max) this.effects.splice(k, 1);
    }
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'bubble') p.vy -= dt * 1.6;
      else p.vy += dt * 3.2;
      p.vx *= Math.pow(0.15, dt);
      if (p.life >= p.max) this.particles.splice(k, 1);
    }
  }

  // --------------------------------------------------------------- draw

  draw() {
    const ctx = this.ctx;
    const board = this.game.board;
    const t = this.time;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    if (this.shake > 0.2) {
      ctx.translate(Math.sin(t * 61) * this.shake * 0.6, Math.cos(t * 47) * this.shake * 0.6);
    }
    this.drawPanel(ctx, board);
    this.drawTiles(ctx, board, t);
    this.drawHints(ctx, board, t);

    const list = [...this.sprites.values()].sort((a, b) => (a.pop >= 0 ? 1 : 0) - (b.pop >= 0 ? 1 : 0) || a.y - b.y);
    for (const s of list) this.drawSprite(ctx, s, t);

    this.drawEffects(ctx);
    this.drawParticles(ctx);
    this.drawCursor(ctx, board, t);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    ctx.restore();
  }

  drawPanel(ctx, board) {
    const pad = this.tile * 0.24;
    const x = this.ox - pad, y = this.oy - pad;
    const w = board.w * this.tile + pad * 2, h = board.h * this.tile + pad * 2;
    const r = this.tile * 0.5;
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(6, 46, 78, 0.78)');
    g.addColorStop(1, 'rgba(3, 24, 44, 0.86)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(2, this.tile * 0.05);
    ctx.strokeStyle = 'rgba(180, 240, 255, 0.22)';
    ctx.stroke();
    ctx.restore();
  }

  drawTiles(ctx, board, t) {
    const size = this.tile;
    const eggLevel = this.game.level.goals.some((g) => g.type === 'eggs');
    if (eggLevel) {
      // Show where the eggs are heading: a glowing hatch under each column.
      const pulse = 0.35 + 0.25 * Math.sin(t * 2.4);
      for (const i of board.exits) {
        const x = this.px(this.colOf(i));
        const y = this.oy + (this.rowOf(i) + 1) * size;
        ctx.save();
        const g = ctx.createLinearGradient(0, y - size * 0.6, 0, y);
        g.addColorStop(0, 'rgba(120, 255, 210, 0)');
        g.addColorStop(1, `rgba(120, 255, 210, ${pulse})`);
        ctx.fillStyle = g;
        ctx.fillRect(x - size * 0.42, y - size * 0.6, size * 0.84, size * 0.6);
        ctx.strokeStyle = `rgba(160, 255, 225, ${0.4 + pulse})`;
        ctx.lineWidth = Math.max(1.5, size * 0.05);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - size * 0.16, y - size * 0.24);
        ctx.lineTo(x, y - size * 0.1);
        ctx.lineTo(x + size * 0.16, y - size * 0.24);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (const i of board.playableIndices()) {
      const x = this.ox + this.colOf(i) * size;
      const y = this.oy + this.rowOf(i) * size;
      const inset = size * 0.045;
      roundRect(ctx, x + inset, y + inset, size - inset * 2, size - inset * 2, size * 0.22);
      const checker = (this.colOf(i) + this.rowOf(i)) % 2;
      ctx.fillStyle = checker ? 'rgba(120, 220, 255, 0.10)' : 'rgba(120, 220, 255, 0.05)';
      ctx.fill();
      const layers = board.ground[i];
      if (layers > 0) {
        roundRect(ctx, x + inset, y + inset, size - inset * 2, size - inset * 2, size * 0.22);
        ctx.fillStyle = layers > 1 ? '#1f7a5c' : '#c9a86a';
        ctx.fill();
        ctx.save();
        roundRect(ctx, x + inset, y + inset, size - inset * 2, size - inset * 2, size * 0.22);
        ctx.clip();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = layers > 1 ? '#39c98d' : '#e8d3a0';
        for (let k = 0; k < 5; k++) {
          const px = x + size * (0.18 + ((k * 37) % 70) / 100);
          const py = y + size * (0.2 + ((k * 53) % 62) / 100);
          if (layers > 1) {
            ctx.beginPath();
            ctx.moveTo(px, y + size * 0.92);
            ctx.quadraticCurveTo(px + Math.sin(t * 1.4 + k) * size * 0.1, py, px + size * 0.04, y + size * 0.1);
            ctx.lineWidth = size * 0.07;
            ctx.strokeStyle = '#39c98d';
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(px, py, size * 0.05, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }
  }

  drawHints(ctx, board, t) {
    const size = this.tile;
    const ring = (i, color, width, scale = 1) => {
      const x = this.px(this.colOf(i)), y = this.py(this.rowOf(i));
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, size * 0.46 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.restore();
    };
    if (this.hint) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
      for (const i of [this.hint.a, this.hint.b]) {
        ring(i, `rgba(255, 246, 190, ${0.35 + pulse * 0.5})`, Math.max(2, size * 0.07), 1 + pulse * 0.07);
      }
    }
    if (this.hover >= 0 && this.hover !== this.selected) ring(this.hover, 'rgba(255,255,255,0.35)', Math.max(1.5, size * 0.04));
    if (this.selected >= 0) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 8);
      ring(this.selected, `rgba(255,255,255,${0.6 + pulse * 0.4})`, Math.max(2.5, size * 0.08), 1.03 + pulse * 0.04);
    }
  }

  drawCursor(ctx, board, t) {
    if (this.cursor < 0) return;
    const size = this.tile;
    const x = this.ox + this.colOf(this.cursor) * size;
    const y = this.oy + this.rowOf(this.cursor) * size;
    const wob = Math.sin(t * 5) * size * 0.02;
    ctx.save();
    ctx.strokeStyle = '#4ef0d0';
    ctx.lineWidth = Math.max(2.5, size * 0.07);
    ctx.setLineDash([size * 0.2, size * 0.14]);
    ctx.lineDashOffset = -t * size * 0.6;
    roundRect(ctx, x + wob, y + wob, size - wob * 2, size - wob * 2, size * 0.24);
    ctx.stroke();
    ctx.restore();
  }

  drawSprite(ctx, s, t) {
    const cell = s.cell;
    if (!cell) return;
    let x = this.px(s.x - 0);
    let y = this.py(s.y - 0);
    x = this.ox + (s.x + 0.5) * this.tile;
    y = this.oy + (s.y + 0.5) * this.tile;
    if (s.bump) {
      const u = s.bump.el / s.bump.dur;
      const k = Math.sin(u * Math.PI * 2.5) * (1 - u);
      x += s.bump.x * this.tile * k;
      y += s.bump.y * this.tile * k;
    }
    if (s.swirl) {
      const u = s.swirl.el / s.swirl.dur;
      const k = Math.sin(u * Math.PI);
      x += Math.cos(s.swirl.a + u * 7) * this.tile * s.swirl.r * k;
      y += Math.sin(s.swirl.a + u * 7) * this.tile * s.swirl.r * k;
    }

    let scale = 1;
    let alpha = 1;
    if (s.born < 1) scale *= 0.35 + 0.65 * easeBack(s.born);
    if (s.pop >= 0) {
      scale *= 1 + s.pop * 0.5;
      alpha = 1 - s.pop;
    }
    if (s.hatch >= 0) {
      this.drawHatch(ctx, x, y, s.hatch);
      return;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale * s.sx, scale * s.sy);

    if (cell.kind === 'coral') this.drawCoral(ctx, cell, t);
    else if (cell.kind === 'egg') this.drawEgg(ctx, t);
    else {
      const art = this.baked(cell.color, cell.special);
      ctx.drawImage(art.canvas, -art.size / 2, -art.size / 2, art.size, art.size);
      this.drawFace(ctx, s, t);
      if (cell.ice > 0) this.drawIce(ctx, cell.ice);
    }
    ctx.restore();
  }

  drawFace(ctx, s, t) {
    const size = this.tile;
    const r = size * 0.45;
    const surprised = s.mood > 0.3 || s.pop >= 0;
    const blinking = s.blink < 0 && s.pop < 0;
    let look = { x: 0, y: 0 };
    if (this.pointer) {
      const dx = this.pointer.x - (this.ox + (s.x + 0.5) * size);
      const dy = this.pointer.y - (this.oy + (s.y + 0.5) * size);
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / (size * 4));
      look = { x: (dx / d) * reach * r * 0.12, y: (dy / d) * reach * r * 0.1 };
    }
    const eyeY = -r * 0.12;
    const eyeDx = r * 0.3;
    const eyeR = surprised ? r * 0.2 : r * 0.17;
    for (const side of [-1, 1]) {
      const ex = side * eyeDx;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeR, blinking ? eyeR * 0.14 : eyeR, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      if (!blinking) {
        ctx.beginPath();
        ctx.ellipse(ex + look.x, eyeY + look.y, eyeR * 0.52, eyeR * 0.58, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#1b2a3a';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex + look.x - eyeR * 0.2, eyeY + look.y - eyeR * 0.24, eyeR * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(30, 44, 60, 0.85)';
    ctx.lineWidth = Math.max(1.3, r * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (surprised) {
      ctx.ellipse(0, r * 0.3, r * 0.13, r * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30, 44, 60, 0.8)';
      ctx.fill();
    } else {
      ctx.arc(0, r * 0.16, r * 0.24, 0.25 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();
    }
    // cheeks
    ctx.fillStyle = 'rgba(255, 140, 170, 0.32)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.56, r * 0.26, r * 0.14, r * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawIce(ctx, layers) {
    const r = this.tile * 0.46;
    ctx.save();
    roundRect(ctx, -r, -r, r * 2, r * 2, r * 0.32);
    ctx.fillStyle = layers > 1 ? 'rgba(205, 245, 255, 0.62)' : 'rgba(205, 245, 255, 0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.2);
    ctx.lineTo(r * 0.1, r * 0.55);
    ctx.moveTo(r * 0.55, -r * 0.55);
    ctx.lineTo(-r * 0.1, r * 0.1);
    ctx.stroke();
    ctx.restore();
  }

  drawCoral(ctx, cell, t) {
    const r = this.tile * 0.44;
    const tough = (cell.max ?? cell.hits) > 1;
    const hurt = cell.hits < (cell.max ?? cell.hits);
    const skin = tough
      ? { a: '#ffd6ab', b: '#ff9445', c: '#b8480f' }
      : { a: '#ffd9e6', b: '#ff7fa6', c: '#af1f4c' };
    const w = r * 0.92, h = r * 0.62;
    ctx.save();
    ctx.translate(0, r * 0.12);
    // stem
    ctx.fillStyle = skin.c;
    roundRect(ctx, -r * 0.16, h * 0.2, r * 0.32, r * 0.62, r * 0.14);
    ctx.fill();
    // scalloped sea fan
    const lobes = tough ? 4 : 5;
    ctx.beginPath();
    ctx.moveTo(-w, h * 0.3);
    for (let i = 0; i <= 28; i++) {
      const u = i / 28;
      const a = Math.PI - u * Math.PI;
      const swell = 1 + 0.09 * Math.sin(u * lobes * Math.PI * 2 + t * 1.2);
      ctx.lineTo(Math.cos(a) * w * swell, h * 0.3 - Math.sin(a) * h * 2.1 * swell);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -h * 1.8, 0, h);
    g.addColorStop(0, skin.a);
    g.addColorStop(0.5, skin.b);
    g.addColorStop(1, skin.c);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 15, 40, 0.35)';
    ctx.lineWidth = Math.max(1.2, r * 0.05);
    ctx.stroke();
    // ribs
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = Math.max(1.2, r * 0.07);
    ctx.lineCap = 'round';
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(0, h * 0.3);
      ctx.lineTo(k * w * 0.42, -h * 1.7);
      ctx.stroke();
    }
    ctx.restore();
    if (hurt) {
      ctx.strokeStyle = 'rgba(50, 6, 20, 0.7)';
      ctx.lineWidth = Math.max(1.6, r * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-w * 0.55, -h * 0.3);
      ctx.lineTo(-w * 0.1, -h * 0.9);
      ctx.lineTo(w * 0.1, -h * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawEgg(ctx, t) {
    const r = this.tile * 0.4;
    ctx.save();
    ctx.rotate(Math.sin(t * 2) * 0.05);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.82, r, 0, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#fffaf0');
    g.addColorStop(0.5, '#f7e6c6');
    g.addColorStop(1, '#d9bd90');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(2,20,38,0.4)';
    ctx.shadowBlur = r * 0.35;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(150, 120, 80, 0.4)';
    for (const [sx, sy, sr] of [[-0.3, -0.35, 0.1], [0.28, -0.1, 0.08], [-0.1, 0.35, 0.09], [0.3, 0.42, 0.07]]) {
      ctx.beginPath();
      ctx.arc(sx * r, sy * r, sr * r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.42, r * 0.22, r * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
    // a curious hatchling peeking out
    ctx.fillStyle = '#3fd0a0';
    ctx.beginPath();
    ctx.arc(0, -r * 0.05, r * 0.26, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#12303a';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.1, -r * 0.14, r * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawHatch(ctx, x, y, u) {
    const r = this.tile * 0.4 * (1 + u * 0.6);
    ctx.save();
    ctx.globalAlpha = 1 - u;
    ctx.translate(x, y - u * this.tile * 1.4);
    ctx.rotate(Math.sin(u * 8) * 0.3);
    ctx.fillStyle = '#3fd0a0';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.7, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2aa87f';
    for (const [fx, fy] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.5], [0.8, 0.5]]) {
      ctx.beginPath();
      ctx.ellipse(fx * r * 0.7, fy * r * 0.6, r * 0.24, r * 0.14, fx * fy > 0 ? 0.6 : -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#c8f7e4';
    ctx.beginPath();
    ctx.arc(0, -r * 0.62, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#12303a';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.12, -r * 0.66, r * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawEffects(ctx) {
    const size = this.tile;
    for (const fx of this.effects) {
      const u = fx.life / fx.max;
      const fade = 1 - u;
      ctx.save();
      if (fx.kind === 'beam') {
        const thick = size * (0.5 + fx.wide * 1.0) * (0.4 + fade * 0.9);
        const grad = fx.dir === 'h'
          ? ctx.createLinearGradient(this.ox, 0, this.ox + this.game.board.w * size, 0)
          : ctx.createLinearGradient(0, this.oy, 0, this.oy + this.game.board.h * size);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, `rgba(255, 250, 220, ${0.85 * fade})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        if (fx.dir === 'h') ctx.fillRect(this.ox, this.py(fx.at.y) - thick / 2, this.game.board.w * size, thick);
        else ctx.fillRect(this.px(fx.at.x) - thick / 2, this.oy, thick, this.game.board.h * size);
      } else if (fx.kind === 'ring') {
        ctx.strokeStyle = `rgba(200, 245, 255, ${fade})`;
        ctx.lineWidth = size * 0.3 * fade + 2;
        ctx.beginPath();
        ctx.arc(this.px(fx.at.x), this.py(fx.at.y), size * fx.r * easeOut(u), 0, Math.PI * 2);
        ctx.stroke();
      } else if (fx.kind === 'shimmer') {
        const g = ctx.createRadialGradient(this.px(fx.at.x), this.py(fx.at.y), 0, this.px(fx.at.x), this.py(fx.at.y), size * 9 * easeOut(u));
        g.addColorStop(0, `rgba(255,255,255,${0.5 * fade})`);
        g.addColorStop(0.4, `rgba(180, 240, 255, ${0.3 * fade})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.width, this.height);
      }
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    const size = this.tile;
    for (const p of this.particles) {
      const u = p.life / p.max;
      const x = this.ox + (p.x + 0.5) * size;
      const y = this.oy + (p.y + 0.5) * size;
      ctx.save();
      ctx.globalAlpha = 1 - u;
      if (p.kind === 'spark') {
        ctx.translate(x, y);
        ctx.rotate(u * 4);
        ctx.fillStyle = p.color;
        const r = p.r * size * (1 - u * 0.5);
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const rr = k % 2 ? r * 0.4 : r;
          ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, p.r * size * (p.kind === 'bubble' ? 1 + u * 0.4 : 1 - u * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        if (p.kind === 'bubble') {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Small jelly portrait for the goal chips and the title screen.
export function drawJellyIcon(canvas, color, size = 26) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const art = bakeJelly(size * 0.86, color, null);
  ctx.drawImage(art.canvas, (size - art.size) / 2, (size - art.size) / 2, art.size, art.size);
  const r = size * 0.45;
  const cx = size / 2, cy = size / 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * r * 0.3, cy - r * 0.12, r * 0.17, r * 0.17, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + side * r * 0.3, cy - r * 0.1, r * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = '#1b2a3a';
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(30, 44, 60, 0.85)';
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.16, r * 0.24, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
}
