// Canvas renderer. It reads a Round and draws it; it never changes it. Each
// card has its own visual pose (centre, scale, tilt, flip) that eases toward
// the target the round implies, so animations can be interrupted and never
// hold up input (hit tests use the table layout, not the animation).
import { computeTable } from './table.js';
import { Motion, approach, easeOutCubic, easeOutBack, easeInOutCubic } from './anim.js';
import {
  bakeFace, bakeBack, bakeRim, bakeSlot, bakeGlow, bakeStar, bakeStreak, bakeFlame, bakeLogs,
  bakeSky, bakeLand, bakeDecor, THEMES, FONT, makeCanvas,
} from './sprites.js';
import { Rng } from './rng.js';

const MAX_PARTICLES = 220;
const SPARK_COLORS = ['rgba(255, 196, 92, 1)', 'rgba(255, 140, 60, 1)', 'rgba(255, 236, 170, 1)', 'rgba(150, 220, 255, 1)'];

class VisCard {
  constructor(card) {
    this.card = card;
    this.x = new Motion(0);
    this.y = new Motion(0);
    this.s = new Motion(1);
    this.r = new Motion(0);
    this.f = new Motion(0);
    this.arc = 0;
    this.z = 0;
    this.home = 'box';
    this.key = '';
    this.visible = false;
    this.flyOrder = 0;
    this.wiggleAt = -1e9;
  }
}

// A small deterministic tilt for each card resting on the waste.
const tiltOf = (card) => (((card * 37) % 11) - 5) * 0.012;

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.vis = Array.from({ length: 52 }, (_, i) => new VisCard(i));
    this.order = this.vis.slice();
    this.faces = new Map();
    this.backs = new Map();
    this.backId = 'plaid';
    this.layout = null;
    this.round = null;
    this.table = null;
    this.theme = THEMES.hollow;
    this.themeId = 'hollow';
    this.decor = new Set();
    this.glow = 0;
    this.glowTarget = 0;
    this.fireBoost = 0;
    this.flyCounter = 0;
    this.particles = [];
    this.popups = [];
    this.litPeaks = new Set();
    this.shooting = null;
    this.nextShoot = 4;
    this.time = 0;
    this.celebrate = 0;
    this.sparkSprites = SPARK_COLORS.map((c) => bakeGlow(16, c));
    this.starSprite = bakeStar(18);
    this.fireflySprite = bakeGlow(12, 'rgba(210, 255, 140, 1)');
    this.bulbSprite = bakeGlow(14, 'rgba(255, 214, 120, 1)');
    this.streakSprite = bakeStreak(140, 3);
    this.flames = [
      bakeFlame(64, 120, [[0, 'rgba(255, 90, 30, 0.95)'], [0.6, 'rgba(255, 120, 40, 0.85)'], [1, 'rgba(255, 150, 60, 0)']]),
      bakeFlame(48, 96, [[0, 'rgba(255, 180, 60, 1)'], [0.7, 'rgba(255, 200, 90, 0.8)'], [1, 'rgba(255, 220, 120, 0)']]),
      bakeFlame(30, 60, [[0, 'rgba(255, 250, 220, 1)'], [0.8, 'rgba(255, 240, 180, 0.7)'], [1, 'rgba(255, 240, 180, 0)']]),
    ];
    this.fireGlow = bakeGlow(128, 'rgba(255, 150, 60, 0.55)');
    const rng = new Rng(77);
    this.twinkles = Array.from({ length: 44 }, () => ({ x: rng.next(), y: rng.next(), p: rng.next() * 6.28, sp: 0.6 + rng.next() * 1.6, s: 0.5 + rng.next() * 0.7 }));
    this.flies = Array.from({ length: 14 }, () => ({ x: rng.next(), y: rng.next(), p: rng.next() * 6.28, sp: 0.3 + rng.next() * 0.5 }));
    this.dpr = 1;
    this.resize();
  }

  // ------------------------------------------------------------ setup

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = Math.max(320, window.innerWidth);
    this.vh = Math.max(300, window.innerHeight);
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.canvas.style.width = `${this.vw}px`;
    this.canvas.style.height = `${this.vh}px`;
    this.relayout();
  }

  relayout() {
    if (!this.layout) {
      this.table = null;
      this.bakeScene();
      return;
    }
    this.table = computeTable(this.vw, this.vh, this.layout);
    this.faces.clear();
    this.backs.clear();
    const t = this.table;
    this.rim = bakeRim(t.W, t.H, this.dpr, 'rgba(255, 214, 120, 0.9)', 0.8);
    this.hintRim = bakeRim(t.W, t.H, this.dpr, 'rgba(140, 255, 210, 1)', 1.4);
    this.pileHintRim = bakeRim(t.stock.w, t.stock.h, this.dpr, 'rgba(140, 255, 210, 1)', 1.4);
    this.slotSprite = bakeSlot(t.stock.w, t.stock.h, this.dpr);
    this.bakeScene();
    if (this.round) this.sync(this.round, performance.now(), 'snap');
  }

  bakeScene() {
    this.sceneDirty = false;
    const t = this.table;
    const vw = this.vw;
    const vh = this.vh;
    let horizon;
    if (!t) horizon = vh * 0.68;
    else if (t.kind === 'sides') horizon = vh * 0.74;
    else if (t.portrait) horizon = t.board.y + t.board.h + (t.stock.y - t.board.y - t.board.h) * 0.52;
    else horizon = Math.max(vh * 0.5, Math.min(vh * 0.86, t.stock.y + t.stock.h * 0.3));
    this.horizon = horizon;
    this.moon = this.pickMoon(horizon);
    this.skyNight = bakeSky(vw, vh, this.dpr, this.theme, horizon, false, this.moon);
    this.skyBright = bakeSky(vw, vh, this.dpr, this.theme, horizon, true);
    this.land = bakeLand(vw, vh, this.dpr, this.theme, horizon, this.moon ? this.moon.x / vw : null);
    const fireSize = t ? t.fire.size : Math.min(vw, vh) * 0.16;
    this.fireSize = fireSize;
    this.logs = bakeLogs(fireSize, this.dpr);
    this.placeDecor();
  }

  // The moon goes where nothing covers it: away from the HUD and the cards.
  pickMoon(horizon) {
    const vw = this.vw;
    const vh = this.vh;
    const r = Math.max(14, Math.min(vw, vh) * 0.035);
    const t = this.table;
    const blocked = t ? [t.board, t.stock, t.waste, t.undo, t.hint] : [];
    const hud = [{ x: 0, y: 0, w: Math.min(vw * 0.5, 320), h: 80 }, { x: vw - 120, y: 0, w: 120, h: 64 }];
    const pref = this.theme.moonX;
    const xs = [pref, 1 - pref, 0.88, 0.12, 0.5, 0.7, 0.3];
    const ys = [0.16, 0.1, 0.24, 0.32];
    for (const fy of ys) {
      for (const fx of xs) {
        const x = vw * fx;
        const y = Math.max(r * 2 + 4, Math.min(horizon - r * 3, vh * fy));
        const box = { x: x - r * 1.6, y: y - r * 1.6, w: r * 3.2, h: r * 3.2 };
        const hit = [...blocked, ...hud].some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h);
        if (!hit && box.x > 0 && box.x + box.w < vw) return { x, y, r };
      }
    }
    return null;
  }

  // Where each decoration stands, for this window and arrangement.
  placeDecor() {
    const t = this.table;
    const vw = this.vw;
    const vh = this.vh;
    const h = this.horizon;
    const spots = {};
    if (!t) {
      const s = Math.min(120, Math.max(50, vw * 0.1));
      spots.tent = { x: vw * 0.12, y: h + s * 0.4, s };
      spots.guitar = { x: vw * 0.86, y: h + s * 0.6, s: s * 0.8 };
      spots.canoe = { x: vw * 0.7, y: h + s * 0.3, s };
      spots.telescope = { x: vw * 0.94, y: h + s * 0.15, s: s * 0.8 };
      spots.owl = { x: vw * 0.08, y: vh * 0.3, s: s * 0.7 };
      spots.marshmallows = { x: vw * 0.44, y: vh - 20, s: s * 0.8 };
      this.fire = { x: vw / 2, y: vh - Math.min(vw, vh) * 0.08, size: Math.min(vw, vh) * 0.16 };
      this.lanterns = { x1: vw * 0.03, x2: vw * 0.97, y: 76, sag: 26 };
      this.fliesBox = { x: 0, y: h - vh * 0.2, w: vw, h: vh * 0.3 };
    } else if (t.kind === 'sides') {
      const leftW = t.stock.x;
      const rightX = t.waste.x + t.waste.w;
      const rightW = vw - rightX;
      const s = Math.max(30, Math.min(100, leftW * 0.7, vh * 0.22));
      spots.tent = { x: leftW * 0.5, y: vh - 6, s };
      spots.owl = { x: leftW * 0.5, y: t.stock.y - 6, s: s * 0.7 };
      spots.guitar = { x: rightX + rightW * 0.5, y: vh - 6, s: s * 0.8 };
      spots.telescope = { x: rightX + rightW * 0.55, y: t.waste.y - 4, s: s * 0.7 };
      spots.canoe = { x: vw * 0.5, y: vh - 2, s: s * 0.9 };
      spots.marshmallows = { x: t.fire.x - t.fire.size * 0.55, y: t.fire.y + 4, s: t.fire.size * 0.7 };
      this.fire = t.fire;
      this.lanterns = { x1: 6, x2: vw - 6, y: 64, sag: 14 };
      this.fliesBox = { x: 0, y: vh * 0.45, w: vw, h: vh * 0.5 };
    } else if (t.portrait) {
      const campTop = t.board.y + t.board.h;
      const campH = t.stock.y - campTop;
      const s = Math.max(40, Math.min(130, vw * 0.24, campH * 0.42));
      spots.tent = { x: vw * 0.2, y: h + s * 0.32, s };
      spots.guitar = { x: vw * 0.84, y: h + s * 0.5, s: s * 0.75 };
      spots.canoe = { x: vw * 0.58, y: h + s * 0.2, s: s * 0.85 };
      spots.telescope = { x: vw * 0.87, y: h - s * 0.02, s: s * 0.65 };
      spots.owl = { x: vw * 0.86, y: Math.max(100, t.board.y - 4), s: s * 0.6 };
      spots.marshmallows = { x: t.fire.x - t.fire.size * 0.5, y: t.fire.y + 4, s: t.fire.size * 0.7 };
      this.fire = t.fire;
      this.lanterns = { x1: vw * 0.03, x2: vw * 0.97, y: 80, sag: 30 };
      this.fliesBox = { x: 0, y: campTop, w: vw, h: campH };
    } else {
      const leftW = Math.min(t.board.x, t.undo.x);
      const rightX = Math.max(t.board.x + t.board.w, t.hint.x + t.hint.w);
      const rightW = vw - rightX;
      const s = Math.max(36, Math.min(140, leftW * 0.62, rightW * 0.62, vh * 0.17));
      spots.tent = { x: leftW * 0.5, y: h + s * 0.45, s };
      spots.owl = { x: leftW * 0.45, y: Math.max(130, t.board.y + t.board.h * 0.35), s: s * 0.7 };
      spots.guitar = { x: rightX + rightW * 0.3, y: h + s * 0.62, s: s * 0.8 };
      spots.canoe = { x: rightX + rightW * 0.62, y: h + s * 0.3, s: s * 0.9 };
      spots.telescope = { x: rightX + rightW * 0.6, y: Math.max(140, t.board.y + t.board.h * 0.5), s: s * 0.7 };
      spots.marshmallows = { x: t.fire.x - t.fire.size * 0.5, y: t.fire.y + 4, s: t.fire.size * 0.7 };
      this.fire = t.fire;
      this.lanterns = { x1: vw * 0.02, x2: vw * 0.98, y: 70, sag: 22 };
      this.fliesBox = { x: 0, y: h - vh * 0.25, w: vw, h: vh * 0.35 };
    }
    this.spots = spots;
    this.decorSprites = {};
    for (const [id, sp] of Object.entries(spots)) this.decorSprites[id] = bakeDecor(id, sp.s, this.dpr);
    this.bakeLanterns();
  }

  bakeLanterns() {
    const L = this.lanterns;
    const w = this.vw;
    const hgt = L.sag + 30;
    const c = makeCanvas(w * this.dpr, hgt * this.dpr);
    const ctx = c.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    ctx.strokeStyle = 'rgba(30, 24, 40, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const pts = [];
    const n = Math.max(6, Math.round((L.x2 - L.x1) / 64));
    for (let i = 0; i <= 40; i++) {
      const k = i / 40;
      const x = L.x1 + (L.x2 - L.x1) * k;
      const y = 6 + L.sag * 4 * k * (1 - k);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    const colors = ['#ffcf6b', '#ff8f6b', '#9fe6ff', '#c6ff8f', '#ffb3e6'];
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const x = L.x1 + (L.x2 - L.x1) * k;
      const y = 6 + L.sag * 4 * k * (1 - k);
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.ellipse(x, y + 7, 4.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2433';
      ctx.fillRect(x - 2.5, y, 5, 3);
      pts.push({ x, y: L.y - 6 + y + 7, c: i % colors.length, p: i * 1.7 });
    }
    this.lanternImg = c;
    this.lanternH = hgt;
    this.bulbs = pts;
  }

  // The new scene is baked by the next setRound (or right away with `now`).
  setTheme(id, now = false) {
    if (id === this.themeId) return;
    this.themeId = id;
    this.theme = THEMES[id] || THEMES.hollow;
    this.sceneDirty = true;
    if (now) this.bakeScene();
  }

  setDecor(ids) {
    this.decor = new Set(ids);
  }

  setBack(id) {
    if (id === this.backId) return;
    this.backId = id;
    this.backs.clear();
  }

  // A new round on the table. `intro` deals the cards out of the stock.
  setRound(round, { intro = true } = {}) {
    const layoutChanged = !this.round || this.round.layout !== round.layout;
    this.round = round;
    this.layout = round.layout;
    if (layoutChanged || !this.table) this.relayout();
    else if (this.sceneDirty) this.bakeScene();
    this.litPeaks.clear();
    this.popups.length = 0;
    this.glowTarget = 0;
    this.celebrate = 0;
    const now = performance.now();
    for (const v of this.vis) {
      v.home = 'box';
      v.key = '';
      v.visible = false;
    }
    this.sync(round, now, intro && !this.reduced ? 'deal' : 'snap');
  }

  // ------------------------------------------------------------ targets

  pileCenter(r) {
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  targetsFor(round) {
    const t = this.table;
    const out = new Array(52).fill(null);
    const P = t.stock.w / t.W;
    round.cards.forEach((card, i) => {
      if (round.isCleared(i)) return;
      const r = t.slots[i];
      out[card] = { home: `slot${i}`, x: r.x + r.w / 2, y: r.y + r.h / 2, s: 1, r: 0, f: round.isFaceUp(i) ? 1 : 0, z: 100 + i, visible: true };
    });
    const sc = this.pileCenter(t.stock);
    const left = round.stockLeft;
    // stock[drawn] is the top card; the pile shows a little thickness.
    const top = Math.min(left - 1, 7);
    for (let k = round.drawn; k < round.stock.length; k++) {
      const depth = k - round.drawn;
      const off = Math.max(0, top - depth) * 0.9;
      out[round.stock[k]] = { home: 'stock', x: sc.x - off * 0.5, y: sc.y - off, s: P, r: 0, f: 0, z: 5000 + (round.stock.length - k), visible: depth < 8 };
    }
    const wc = this.pileCenter(t.waste);
    const n = round.waste.length;
    round.waste.forEach((card, k) => {
      out[card] = { home: 'waste', x: wc.x, y: wc.y, s: P, r: tiltOf(card), f: 1, z: 8000 + k, visible: k >= n - 4 };
    });
    return out;
  }

  // Ease every card toward where the round says it is.
  //   mode 'animate' — after a move: flights and flips;
  //   mode 'deal'    — out of the stock into the layout;
  //   mode 'snap'    — jump (resize, reduced motion).
  sync(round, now, mode = 'animate') {
    if (!this.table) return;
    const targets = this.targetsFor(round);
    const reduced = this.reduced;
    const sc = this.pileCenter(this.table.stock);
    const P = this.table.stock.w / this.table.W;
    let dealIndex = 0;
    for (let card = 0; card < 52; card++) {
      const v = this.vis[card];
      const tg = targets[card];
      if (!tg) {
        v.visible = false;
        v.home = 'box';
        continue;
      }
      const moved = v.home !== tg.home;
      v.z = tg.z;
      if (mode === 'snap' || (reduced && mode !== 'deal')) {
        v.x.snap(tg.x);
        v.y.snap(tg.y);
        v.s.snap(tg.s);
        v.r.snap(tg.r);
        v.f.snap(tg.f);
        v.arc = 0;
      } else if (mode === 'deal') {
        // Start in the stock, face down, and fly out in deal order.
        v.x.snap(sc.x);
        v.y.snap(sc.y);
        v.s.snap(P);
        v.r.snap(0);
        v.f.snap(0);
        if (tg.home !== 'stock') {
          const delay = reduced ? 0 : (tg.home === 'waste' ? this.layout.count + 2 : dealIndex++) * 26;
          const dur = reduced ? 0 : 360;
          v.x.set(tg.x, now, dur, delay, easeOutCubic);
          v.y.set(tg.y, now, dur, delay, easeOutCubic);
          v.s.set(tg.s, now, dur, delay, easeOutCubic);
          v.r.set(tg.r, now, dur, delay);
          if (tg.f) v.f.set(1, now, reduced ? 0 : 240, delay + dur * 0.7, easeInOutCubic);
          v.arc = 0;
          v.flyOrder = ++this.flyCounter;
        } else {
          v.x.snap(tg.x);
          v.y.snap(tg.y);
        }
      } else if (moved) {
        const dist = Math.hypot(tg.x - v.x.value(now), tg.y - v.y.value(now));
        const dur = Math.min(420, 220 + dist * 0.35);
        v.x.set(tg.x, now, dur, 0, easeOutCubic);
        v.y.set(tg.y, now, dur, 0, easeOutCubic);
        v.s.set(tg.s, now, dur, 0, easeOutCubic);
        v.r.set(tg.r, now, dur, 0, easeOutBack);
        if (v.f.to !== tg.f) v.f.set(tg.f, now, 260, 30, easeInOutCubic);
        v.arc = Math.min(90, dist * 0.22);
        v.flyOrder = ++this.flyCounter;
      } else {
        // Same home: retarget quietly (a flip, or a pile shuffling down).
        if (v.x.to !== tg.x || v.y.to !== tg.y) {
          v.x.set(tg.x, now, 160);
          v.y.set(tg.y, now, 160);
        }
        if (v.f.to !== tg.f) v.f.set(tg.f, now, 230, tg.f ? 110 : 0, easeInOutCubic);
        v.s.set(tg.s, now, 160);
      }
      v.home = tg.home;
      v.visible = tg.visible;
    }
  }

  // ------------------------------------------------------------ events

  handle(events, round, now = performance.now()) {
    if (!this.table) return;
    for (const e of events) {
      if (e.type === 'play') {
        const r = this.table.slots[e.slot];
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        this.burst(cx, cy, 8 + Math.min(16, e.streak * 2), 0);
        this.popup(cx, r.y - 4, `+${e.points}`, e.streak >= 5 ? '#ffe08a' : '#fff4dc', 1);
        if (e.peak) {
          this.litPeaks.add(e.slot);
          this.burst(cx, cy, 26, 3);
          this.popup(cx, r.y - 30, '+500 Peak!', '#9fffe0', 1.25);
        }
        if (e.streak >= 3) {
          const w = this.table.waste;
          this.popup(w.x + w.w / 2, w.y - 14, `Streak ×${e.streak}!`, e.streak >= 8 ? '#ff9ad8' : '#ffd06b', e.streak >= 8 ? 1.5 : 1.2, 'streak');
        }
        this.fireBoost = Math.min(1.6, this.fireBoost + 0.35 + e.streak * 0.04);
      } else if (e.type === 'draw') {
        const s = this.table.stock;
        this.burst(s.x + s.w / 2, s.y + s.h / 2, 5, 2);
      } else if (e.type === 'nope') {
        if (e.slot >= 0 && e.slot < round.cards.length) this.vis[round.cards[e.slot]].wiggleAt = now;
      } else if (e.type === 'undo') {
        if (e.move === 'play') this.litPeaks.delete(e.slot);
      } else if (e.type === 'win') {
        this.celebrate = 1;
        const f = this.fire;
        for (let i = 0; i < 4; i++) this.burst(f.x + (i - 1.5) * f.size * 0.3, f.y - f.size * 0.4, 30, i);
        this.shooting = { t: 0, x: this.vw * 0.15, y: this.vh * 0.12, dx: this.vw * 0.7, dy: this.vh * 0.18 };
      }
    }
    this.glowTarget = round.status === 'won' ? 1 : Math.min(1, round.streak / 10);
    this.sync(round, now, 'animate');
  }

  burst(x, y, n, color) {
    const count = this.reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 160;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: 0,
        max: 0.6 + Math.random() * 0.7,
        size: 3 + Math.random() * 5,
        c: color === 3 ? 3 : (color + i) % 3,
      });
    }
  }

  // A floating label. A tagged popup replaces the last one with that tag, so
  // "Streak ×4!" takes over from "Streak ×3!" instead of piling on it.
  popup(x, y, text, color, scale = 1, tag = '') {
    if (tag) this.popups = this.popups.filter((p) => p.tag !== tag);
    if (this.popups.length > 8) this.popups.shift();
    const half = text.length * 18 * scale * 0.3 + 6;
    const cx = Math.max(half, Math.min(this.vw - half, x));
    const cy = Math.max(72, y);
    this.popups.push({ x: cx, y: cy, text, color, scale, tag, life: 0, max: 1.1 });
  }

  // ------------------------------------------------------------ frame

  update(dt) {
    this.time += dt;
    this.glow = approach(this.glow, this.glowTarget, this.reduced ? 20 : 2.2, dt);
    this.fireBoost = Math.max(0, this.fireBoost - dt * 0.9);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vx *= 1 - dt * 1.8;
      p.vy = p.vy * (1 - dt * 1.6) - 70 * dt; // sparks rise
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    // Embers drift up from the fire all the time.
    if (this.fire && !this.reduced && Math.random() < dt * (3 + this.fireBoost * 10 + this.glow * 6)) {
      const f = this.fire;
      if (this.particles.length < MAX_PARTICLES) {
        this.particles.push({ x: f.x + (Math.random() - 0.5) * f.size * 0.4, y: f.y - f.size * 0.35, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 60, life: 0, max: 1 + Math.random() * 1.4, size: 2 + Math.random() * 3, c: Math.random() < 0.5 ? 0 : 1 });
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life += dt;
      if (p.life >= p.max) this.popups.splice(i, 1);
    }
    if (this.decor.has('shooting') || this.shooting) {
      if (this.shooting) {
        this.shooting.t += dt / 0.9;
        if (this.shooting.t >= 1) this.shooting = null;
      } else if (!this.reduced) {
        this.nextShoot -= dt;
        if (this.nextShoot <= 0) {
          this.nextShoot = 5 + Math.random() * 6;
          const fromLeft = Math.random() < 0.5;
          this.shooting = { t: 0, x: this.vw * (fromLeft ? 0.1 : 0.9), y: this.vh * (0.06 + Math.random() * 0.1), dx: this.vw * (fromLeft ? 0.45 : -0.45), dy: this.vh * 0.12 };
        }
      }
    }
  }

  // ui: { focus: {kind, slot} | null, focusVisible, hint: {slot|stock}, attract, highlight }
  draw(now, ui = {}) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const vw = this.vw;
    const vh = this.vh;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.skyNight, 0, 0);
    const pulse = this.reduced ? 0 : Math.sin(this.time * 1.3) * 0.04;
    const bright = Math.max(0, Math.min(1, this.glow * 0.9 + (this.glow > 0.1 ? pulse : 0)));
    if (bright > 0.01) {
      ctx.globalAlpha = bright;
      ctx.drawImage(this.skyBright, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawTwinkles(ctx);
    this.drawShooting(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.land, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawDecor(ctx, 'back');
    this.drawFire(ctx);
    this.drawDecor(ctx, 'front');
    if (this.table && this.round) {
      this.drawConstellation(ctx);
      this.drawPiles(ctx);
      this.drawCards(ctx, now, ui);
      this.drawRings(ctx, now, ui);
    }
    this.drawParticles(ctx);
    this.drawPopups(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawTwinkles(ctx) {
    const h = this.horizon;
    const sprite = this.starSprite;
    const boost = 0.6 + this.glow * 0.6;
    for (const s of this.twinkles) {
      const a = this.reduced ? 0.6 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * s.sp + s.p));
      ctx.globalAlpha = Math.min(1, a * boost);
      const size = 8 * s.s;
      ctx.drawImage(sprite, s.x * this.vw - size / 2, s.y * h * 0.85 - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  drawShooting(ctx) {
    const s = this.shooting;
    if (!s) return;
    const k = s.t;
    const x = s.x + s.dx * k;
    const y = s.y + s.dy * k;
    const ang = Math.atan2(s.dy, s.dx);
    ctx.save();
    ctx.globalAlpha = Math.sin(Math.PI * k);
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.drawImage(this.streakSprite, -140, -3, 140, 6);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawDecor(ctx, layer) {
    const d = this.decor;
    const spots = this.spots;
    if (layer === 'back') {
      if (d.has('lanterns') && this.lanternImg) {
        ctx.drawImage(this.lanternImg, 0, this.lanterns.y - 6, this.vw, this.lanternH);
        ctx.globalCompositeOperation = 'lighter';
        for (const b of this.bulbs) {
          const a = this.reduced ? 0.5 : 0.35 + 0.25 * Math.sin(this.time * 2.1 + b.p);
          ctx.globalAlpha = a;
          ctx.drawImage(this.bulbSprite, b.x - 14, b.y - 14, 28, 28);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      for (const id of ['telescope', 'canoe', 'tent', 'owl', 'guitar']) {
        if (!d.has(id)) continue;
        const sp = spots[id];
        const img = this.decorSprites[id];
        ctx.drawImage(img.img, sp.x - img.w / 2, sp.y - img.h, img.w, img.h);
        if (id === 'owl') this.owlBlink(ctx, sp);
      }
    } else {
      if (d.has('marshmallows')) {
        const sp = spots.marshmallows;
        const img = this.decorSprites.marshmallows;
        ctx.drawImage(img.img, sp.x - img.w / 2, sp.y - img.h, img.w, img.h);
      }
      if (d.has('fireflies')) {
        const box = this.fliesBox;
        ctx.globalCompositeOperation = 'lighter';
        for (const f of this.flies) {
          const t = this.time * f.sp;
          const x = box.x + (f.x + Math.sin(t + f.p) * 0.08) * box.w;
          const y = box.y + (f.y + Math.cos(t * 0.8 + f.p) * 0.12) * box.h;
          ctx.globalAlpha = this.reduced ? 0.5 : Math.max(0, Math.sin(this.time * 1.7 + f.p * 3)) * 0.9;
          ctx.drawImage(this.fireflySprite, x - 8, y - 8, 16, 16);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  owlBlink(ctx, sp) {
    if (this.reduced || this.time % 4.2 > 0.14) return;
    const r = sp.s * 0.3;
    const cx = sp.x;
    const cy = sp.y - sp.s * 0.42;
    ctx.fillStyle = '#7d5fa6';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + s * 0.38 * r, cy - 0.18 * r, 0.34 * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFire(ctx) {
    const f = this.fire;
    if (!f) return;
    const s = f.size;
    const t = this.time;
    const boost = 1 + this.fireBoost * 0.35 + this.glow * 0.3 + this.celebrate * 0.2;
    const flick = this.reduced ? 1 : 0.88 + 0.08 * Math.sin(t * 9.1) + 0.05 * Math.sin(t * 15.7 + 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, 0.55 * flick * boost);
    const gr = s * 2.6 * boost;
    ctx.drawImage(this.fireGlow, f.x - gr, f.y - gr * 0.8, gr * 2, gr * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const logs = this.logs;
    ctx.drawImage(logs.img, f.x - logs.w / 2, f.y - logs.h * 0.7, logs.w, logs.h);
    const base = f.y - logs.h * 0.25;
    const layers = [
      [this.flames[0], 0.62, 1.05, 0, 7.3],
      [this.flames[0], 0.42, 0.75, -0.24, 8.9],
      [this.flames[0], 0.42, 0.7, 0.24, 6.1],
      [this.flames[1], 0.46, 0.78, 0, 11.3],
      [this.flames[2], 0.26, 0.46, 0, 13.7],
    ];
    ctx.globalCompositeOperation = 'lighter';
    for (const [img, wk, hk, dx, sp] of layers) {
      const wob = this.reduced ? 0 : Math.sin(t * sp + dx * 10);
      const fh = s * hk * boost * (1 + 0.1 * wob);
      const fw = s * wk * (1 + 0.04 * Math.sin(t * sp * 0.7));
      const fx = f.x + dx * s + (this.reduced ? 0 : wob * s * 0.02);
      ctx.drawImage(img, fx - fw / 2, base - fh, fw, fh);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawConstellation(ctx) {
    const L = this.layout;
    if (!L.lines.length && !this.litPeaks.size) return;
    const t = this.table;
    const centre = (p) => {
      const r = t.slots[L.peaks[p]];
      return [r.x + r.w / 2, r.y + r.h * 0.3];
    };
    ctx.lineCap = 'round';
    for (const [a, b] of L.lines) {
      const lit = this.litPeaks.has(L.peaks[a]) && this.litPeaks.has(L.peaks[b]);
      const [x1, y1] = centre(a);
      const [x2, y2] = centre(b);
      ctx.strokeStyle = lit ? 'rgba(160, 255, 225, 0.85)' : 'rgba(200, 210, 255, 0.16)';
      ctx.lineWidth = lit ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    L.peaks.forEach((slot, p) => {
      if (!this.litPeaks.has(slot)) return;
      const [x, y] = centre(p);
      const sz = t.W * (0.9 + (this.reduced ? 0 : 0.12 * Math.sin(this.time * 3 + p)));
      ctx.drawImage(this.starSprite, x - sz / 2, y - sz / 2, sz, sz);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  drawPiles(ctx) {
    const t = this.table;
    const s = this.slotSprite;
    ctx.drawImage(s.img, t.stock.x, t.stock.y, t.stock.w, t.stock.h);
    ctx.drawImage(s.img, t.waste.x, t.waste.y, t.waste.w, t.waste.h);
  }

  sprite(card, faceUp, big) {
    const t = this.table;
    const w = big ? t.stock.w : t.W;
    const h = big ? t.stock.h : t.H;
    const key = faceUp ? card * 2 + (big ? 1 : 0) : (big ? 1 : 0);
    const map = faceUp ? this.faces : this.backs;
    let sp = map.get(key);
    if (!sp) {
      sp = faceUp ? bakeFace(card, w, h, this.dpr) : bakeBack(this.backId, w, h, this.dpr);
      sp.w = w;
      sp.h = h;
      map.set(key, sp);
    }
    return sp;
  }

  drawCards(ctx, now, ui) {
    const round = this.round;
    const t = this.table;
    const order = this.order;
    for (const v of order) {
      v.drawZ = v.x.moving(now) || v.y.moving(now) ? 100000 + v.flyOrder : v.z;
    }
    order.sort((a, b) => a.drawZ - b.drawZ);
    const P = t.stock.w / t.W;
    const playable = ui.highlight ? this.playableSet(round) : null;
    for (const v of order) {
      const moving = v.drawZ >= 100000;
      if (!v.visible && !moving) continue;
      const x = v.x.value(now);
      let y = v.y.value(now);
      if (v.arc && v.y.moving(now)) y -= Math.sin(Math.PI * v.y.progress(now)) * v.arc;
      const s = v.s.value(now);
      let r = v.r.value(now);
      const wig = now - v.wiggleAt;
      if (wig < 360) r += Math.sin(wig / 26) * 0.09 * (1 - wig / 360);
      const f = v.f.value(now);
      const faceUp = f >= 0.5;
      const squash = Math.abs(Math.cos(Math.PI * f));
      const lift = 1 + 0.08 * Math.sin(Math.PI * f) * (f > 0 && f < 1 ? 1 : 0);
      const big = s > (1 + P) / 2;
      const sp = this.sprite(v.card, faceUp, big);
      const k = s / (big ? P : 1);
      const sx = k * Math.max(0.02, squash) * lift;
      const sy = k * lift;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      const slot = v.home.startsWith('slot') ? Number(v.home.slice(4)) : -1;
      if (playable && slot >= 0 && !moving && playable.has(slot)) {
        const rim = this.rim;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.globalAlpha = 0.55 + (this.reduced ? 0 : 0.2 * Math.sin(this.time * 3));
        ctx.drawImage(rim.img, x - t.W / 2 - rim.pad, y - t.H / 2 - rim.pad, t.W + rim.pad * 2, t.H + rim.pad * 2);
        ctx.globalAlpha = 1;
      }
      const d = this.dpr;
      ctx.setTransform(d * cos * sx, d * sin * sx, -d * sin * sy, d * cos * sy, d * x, d * y);
      const fullW = sp.w + sp.pad * 2;
      const fullH = sp.h + sp.pad * 2;
      ctx.drawImage(sp.img, -fullW / 2, -fullH / 2, fullW, fullH);
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Stock count badge.
    const st = t.stock;
    const left = round.stockLeft;
    const bx = st.x + st.w - 6;
    const by = st.y + 6;
    ctx.fillStyle = left ? 'rgba(20, 16, 40, 0.85)' : 'rgba(20, 16, 40, 0.6)';
    ctx.beginPath();
    ctx.arc(bx, by, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff4dc';
    ctx.font = this.font(13);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(left), bx, by + 1);
  }

  // The playable slots, recomputed only when the round changes.
  playableSet(round) {
    const key = `${round.moves}:${round.undos}:${round.status}`;
    if (this.playRound !== round || this.playKey !== key) {
      this.playRound = round;
      this.playKey = key;
      this.playable = new Set(round.status === 'play' ? round.playable() : []);
    }
    return this.playable;
  }

  slotCenter(slot) {
    const r = this.table.slots[slot];
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h };
  }

  drawRings(ctx, now, ui) {
    const t = this.table;
    if (ui.hint) {
      const a = this.reduced ? 0.9 : 0.6 + 0.4 * Math.sin(this.time * 6);
      ctx.globalAlpha = a;
      if (ui.hint.kind === 'stock') {
        const r = this.pileHintRim;
        ctx.drawImage(r.img, t.stock.x - r.pad, t.stock.y - r.pad, t.stock.w + r.pad * 2, t.stock.h + r.pad * 2);
      } else if (ui.hint.kind === 'slot') {
        const c = this.slotCenter(ui.hint.slot);
        const r = this.hintRim;
        ctx.drawImage(r.img, c.x - c.w / 2 - r.pad, c.y - c.h / 2 - r.pad, c.w + r.pad * 2, c.h + r.pad * 2);
      }
      ctx.globalAlpha = 1;
    }
    if (ui.focus && ui.focusVisible) {
      let rect;
      if (ui.focus.kind === 'stock') rect = t.stock;
      else rect = t.slots[ui.focus.slot];
      if (rect) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([]);
        const p = 4;
        ctx.beginPath();
        const rr = rect.w * 0.12;
        const x = rect.x - p;
        const y = rect.y - p;
        const w = rect.w + p * 2;
        const h = rect.h + p * 2;
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(80, 200, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  drawParticles(ctx) {
    if (!this.particles.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = (1 - k) * 0.9;
      const s = p.size * (1 - k * 0.5) * 2;
      ctx.drawImage(this.sparkSprites[p.c], p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  font(size) {
    if (!this.fonts) this.fonts = new Map();
    let f = this.fonts.get(size);
    if (!f) {
      f = `800 ${size}px ${FONT}`;
      this.fonts.set(size, f);
    }
    return f;
  }

  drawPopups(ctx) {
    if (!this.popups.length) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.popups) {
      const k = p.life / p.max;
      const rise = this.reduced ? 0 : k * 34;
      const pop = this.reduced ? 1 : Math.min(1, 0.6 + k * 4);
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const size = Math.round(18 * p.scale * pop);
      ctx.font = this.font(size);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20, 12, 36, 0.8)';
      ctx.strokeText(p.text, p.x, p.y - rise);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - rise);
    }
    ctx.globalAlpha = 1;
  }
}
