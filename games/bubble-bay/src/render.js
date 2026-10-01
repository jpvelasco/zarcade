// Canvas view of a level: backdrop, board, Coral, the aim guide and all the
// juice (pops, splashes, falling clusters, otters swimming free). It reads
// game state and never changes it; the shot animation plays a result that
// the simulation has already worked out.
import { CX, CY, ROW_H, FIELD_W, LOSE_ROW, LAUNCH_Y, SIZE, NEIGHBORS, W, MIN_ANGLE, MAX_ANGLE } from './grid.js';
import { Sprites, PALETTE, drawCrabBody, drawClaw, drawLauncher, makeCanvas } from './sprites.js';
import { Rng } from './rng.js';

export const WATER_Y = 1 + (LOSE_ROW - 0.42) * ROW_H; // the tide line
export const NEXT_POS = { x: FIELD_W / 2 - 3.9, y: LAUNCH_Y + 1.3 };
export const COUNT_POS = { x: FIELD_W / 2 + 3.9, y: LAUNCH_Y + 1.3 };
const VIEW_TOP = 0.75;
const VIEW_H = LAUNCH_Y + 3.5 + VIEW_TOP;
const SHOT_SPEED = 46; // radii per second
const MAX_PARTICLES = 260;
const GRAVITY = 70;

export const THEMES = [
  { sky: ['#6fd3ef', '#b9eef0', '#ffe8c0'], sea: '#2fb3c6', panel: 'rgba(6, 52, 84, 0.34)', frame: '#c48a52', frameDark: '#8a5a32', sand: '#f3d79f', water: 'rgba(60, 200, 220, 0.55)', deco: 'pools' },
  { sky: ['#ff8f6b', '#ffbf86', '#ffe2b0'], sea: '#3a86b0', panel: 'rgba(40, 30, 70, 0.34)', frame: '#9a6640', frameDark: '#5e3a22', sand: '#e7c28b', water: 'rgba(70, 160, 210, 0.55)', deco: 'pier' },
  { sky: ['#3a3d8c', '#7a5cb0', '#f2a1a1'], sea: '#2b5b9b', panel: 'rgba(16, 18, 52, 0.4)', frame: '#8b95a3', frameDark: '#56606e', sand: '#cbb899', water: 'rgba(80, 130, 220, 0.55)', deco: 'lighthouse' },
  { sky: ['#13a0bf', '#0b6e98', '#0a416f'], sea: '#0a416f', panel: 'rgba(4, 30, 60, 0.36)', frame: '#ff8fb1', frameDark: '#c4517a', sand: '#ead39f', water: 'rgba(110, 230, 240, 0.4)', deco: 'reef' },
  { sky: ['#0e4677', '#0a2f57', '#061b36'], sea: '#061b36', panel: 'rgba(2, 14, 34, 0.42)', frame: '#7a5536', frameDark: '#4a311d', sand: '#bba47b', water: 'rgba(90, 170, 230, 0.4)', deco: 'ship' },
];

export class View {
  constructor(canvas, { reduceMotion = false, hooks = {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduceMotion = reduceMotion;
    this.hooks = hooks;
    this.sprites = new Sprites();
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.s = 10;
    this.ox = 0;
    this.oy = 0;
    this.theme = THEMES[0];
    this.area = 0;
    this.game = null;
    this.cells = new Array(SIZE).fill(null);
    this.drop = 0;
    this.aim = Math.PI / 2;
    this.guide = null;
    this.showGuide = true;
    this.flight = null;
    this.pops = [];
    this.falls = [];
    this.otters = [];
    this.floaters = [];
    this.particles = [];
    for (let k = 0; k < MAX_PARTICLES; k++) this.particles.push({ on: false });
    this.jiggle = new Float32Array(SIZE * 4); // dx, dy, vx, vy per cell
    this.time = 0;
    this.shake = 0;
    this.blink = 0;
    this.claw = 0;
    this.warn = 0;
    this.danger = 0;
    this.loadPop = 1;
    this.backdrop = null;
    this.crab = null;
  }

  // ------------------------------------------------------------- layout

  // `top` and `bottom` are HUD bands to keep the field clear of, used only
  // when the screen is too narrow for the HUD to sit beside the field.
  resize(w, h, { top = 0, bottom = 0, side = 0 } = {}) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = `${w}x${h}@${dpr}/${top}/${bottom}/${side}`;
    if (key === this.sizeKey && this.backdrop) return;
    this.sizeKey = key;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const wide = Math.min(w / (FIELD_W + 0.9), h / (VIEW_H + 0.3));
    const roomy = (w - FIELD_W * wide) / 2 >= side;
    const t = roomy ? 0 : top, b = roomy ? 0 : bottom;
    this.s = Math.max(6, Math.min(w / (FIELD_W + 0.9), (h - t - b) / (VIEW_H + 0.3)));
    this.ox = (w - FIELD_W * this.s) / 2;
    this.oy = t + Math.max(4, (h - t - b - VIEW_H * this.s) / 2) + VIEW_TOP * this.s;
    this.sprites.setRadius(this.s * dpr * 0.985);
    this.fontCount = `800 ${Math.round(this.s * 1.05)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    this.fontSmall = `800 ${Math.round(this.s * 0.8)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    this.bakeBackdrop();
    this.bakeCrab();
  }

  setGame(game) {
    this.game = game;
    this.area = game.level.area;
    this.theme = THEMES[this.area] || THEMES[0];
    this.cells = game.board.cells.slice();
    this.drop = game.board.drop;
    this.flight = null;
    this.pops.length = 0;
    this.falls.length = 0;
    this.otters.length = 0;
    this.floaters.length = 0;
    for (const p of this.particles) p.on = false;
    this.jiggle.fill(0);
    this.guide = null;
    this.backdrop = null;
    this.bakeBackdrop();
  }

  // Board units -> CSS pixels.
  X(u) { return this.ox + u * this.s; }
  Y(u) { return this.oy + u * this.s; }

  // Angle from the launcher to a CSS-pixel point; null when below it.
  angleTo(px, py) {
    const dx = (px - this.X(FIELD_W / 2)) / this.s;
    const dy = (this.Y(LAUNCH_Y) - py) / this.s;
    if (dy < -0.4) return null;
    return Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, Math.atan2(Math.max(0.05, dy), dx)));
  }

  // Is a point on the "next bubble" clam or on Coral (tap to swap)?
  onSwapSpot(px, py) {
    const x = (px - this.ox) / this.s, y = (py - this.oy) / this.s;
    const nearNext = Math.hypot(x - NEXT_POS.x, y - NEXT_POS.y) < 1.7;
    const onCrab = Math.abs(x - FIELD_W / 2) < 2 && y > LAUNCH_Y + 1.0 && y < LAUNCH_Y + 3.4;
    return nearNext || onCrab;
  }

  get busy() {
    return !!this.flight;
  }

  get settling() {
    return this.pops.length > 0 || this.falls.length > 0 || this.flight !== null;
  }

  // ------------------------------------------------------------ baking

  bakeBackdrop() {
    if (!this.game) return;
    const { dpr, w, h, s, theme } = this;
    const c = makeCanvas(w * dpr, h * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    const rng = new Rng(1234 + this.area);

    // sky / sea
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, theme.sky[0]);
    sky.addColorStop(0.55, theme.sky[1]);
    sky.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    this.paintScenery(ctx, rng);

    // the play panel
    const x0 = this.X(-0.35), x1 = this.X(FIELD_W + 0.35);
    const y0 = this.Y(-0.35), y1 = this.Y(WATER_Y + 1.1);
    ctx.fillStyle = theme.panel;
    roundRect(ctx, x0, y0, x1 - x0, y1 - y0, s * 0.8);
    ctx.fill();
    // faint hex dimples so empty cells read as a grid
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    for (let i = 0; i < SIZE; i++) {
      const r = (i / W) | 0;
      if (r > LOSE_ROW - 1 || (r & 1 && i % W === W - 1)) continue;
      ctx.beginPath();
      ctx.arc(this.X(CX[i]), this.Y(CY[i]), s * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
    // frame
    ctx.lineWidth = s * 0.42;
    ctx.strokeStyle = theme.frameDark;
    roundRect(ctx, x0, y0, x1 - x0, y1 - y0, s * 0.8);
    ctx.stroke();
    ctx.lineWidth = s * 0.24;
    ctx.strokeStyle = theme.frame;
    ctx.stroke();
    ctx.lineWidth = s * 0.06;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    roundRect(ctx, x0 + s * 0.05, y0 + s * 0.05, x1 - x0 - s * 0.1, y1 - y0 - s * 0.1, s * 0.75);
    ctx.stroke();

    // the sandbar Coral stands on
    const sandTop = this.Y(LAUNCH_Y + 1.5);
    ctx.fillStyle = theme.sand;
    ctx.beginPath();
    ctx.moveTo(this.X(FIELD_W / 2 - 7), h + 4);
    ctx.quadraticCurveTo(this.X(FIELD_W / 2 - 5.5), sandTop, this.X(FIELD_W / 2), sandTop - s * 0.1);
    ctx.quadraticCurveTo(this.X(FIELD_W / 2 + 5.5), sandTop, this.X(FIELD_W / 2 + 7), h + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let k = 0; k < 14; k++) {
      ctx.beginPath();
      ctx.arc(this.X(FIELD_W / 2 + (rng.next() - 0.5) * 9), sandTop + s * (0.3 + rng.next() * 1.4), s * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    // the clam that holds the next bubble, and the bubble counter shell
    for (const pos of [NEXT_POS, COUNT_POS]) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(this.X(pos.x), this.Y(pos.y + 0.75), s * 1.05, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    this.paintClam(ctx, this.X(NEXT_POS.x), this.Y(NEXT_POS.y), s);
    this.backdrop = c;
  }

  paintClam(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ffd1e3';
    ctx.strokeStyle = '#d97aa6';
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.5, s * 1.05, s * 0.36, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, s * 0.5, s * 1.05, s * 0.22, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = '#c45a8a';
    ctx.fill();
    ctx.restore();
  }

  paintScenery(ctx, rng) {
    const { w, h, s, theme } = this;
    const horizon = this.Y(8);
    switch (theme.deco) {
      case 'pools': {
        ctx.fillStyle = 'rgba(255, 250, 220, 0.9)';
        ctx.beginPath();
        ctx.arc(w * 0.82, h * 0.12, s * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.sea;
        ctx.fillRect(0, horizon, w, h - horizon);
        this.paintClouds(ctx, rng, 5);
        // a sandy shore with rock pools on both sides of the board
        ctx.fillStyle = theme.sand;
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, h * 0.78);
        ctx.quadraticCurveTo(w * 0.25, h * 0.72, w * 0.5, h * 0.8);
        ctx.quadraticCurveTo(w * 0.75, h * 0.72, w, h * 0.76);
        ctx.lineTo(w, h);
        ctx.fill();
        for (let k = 0; k < 10; k++) {
          const left = k % 2 === 0;
          const room = Math.max(this.ox - s * 1.2, s * 2);
          const x = left ? s + rng.next() * room : w - s - rng.next() * room;
          const y = horizon + s * 1.5 + rng.next() * (h - horizon - s * 2);
          rock(ctx, x, y, s * (1.6 + rng.next() * 1.6), rng, k % 3 !== 2);
        }
                break;
      }
      case 'pier': {
        ctx.fillStyle = 'rgba(255, 240, 200, 0.95)';
        ctx.beginPath();
        ctx.arc(w * 0.18, horizon - s * 0.4, s * 3, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = theme.sea;
        ctx.fillRect(0, horizon, w, h - horizon);
        this.paintClouds(ctx, rng, 4);
        // pier deck and posts on both sides
        for (const side of [0, 1]) {
          const xa = side ? this.X(FIELD_W + 0.6) : 0;
          const xb = side ? w : this.X(-0.6);
          if (xb - xa < 4) continue;
          ctx.fillStyle = '#7a4d2e';
          ctx.fillRect(xa, horizon - s * 1.2, xb - xa, s * 0.7);
          ctx.fillStyle = '#5a3720';
          for (let x = xa + s * 0.8; x < xb; x += s * 3) ctx.fillRect(x, horizon - s * 1.2, s * 0.5, h);
        }
        ctx.strokeStyle = 'rgba(60, 40, 40, 0.6)';
        ctx.lineWidth = s * 0.12;
        for (let k = 0; k < 4; k++) {
          const x = rng.next() * w, y = rng.next() * horizon * 0.6 + s;
          ctx.beginPath();
          ctx.arc(x - s * 0.4, y, s * 0.4, Math.PI * 1.1, Math.PI * 1.9);
          ctx.arc(x + s * 0.4, y, s * 0.4, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
        break;
      }
      case 'lighthouse': {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let k = 0; k < 40; k++) {
          ctx.beginPath();
          ctx.arc(rng.next() * w, rng.next() * horizon, s * (0.04 + rng.next() * 0.06), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#fff6d0';
        ctx.beginPath();
        ctx.arc(w * 0.85, h * 0.1, s * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.sea;
        ctx.fillRect(0, horizon, w, h - horizon);
        // cliffs and the lighthouse on the left
        ctx.fillStyle = '#3c3150';
        ctx.beginPath();
        ctx.moveTo(0, horizon - s * 2);
        ctx.lineTo(Math.max(this.ox * 0.9, s * 3), horizon - s * 1.4);
        ctx.lineTo(Math.max(this.ox, s * 4), h);
        ctx.lineTo(0, h);
        ctx.fill();
        const lx = Math.max(s * 1.6, this.ox * 0.45);
        ctx.fillStyle = 'rgba(255, 245, 180, 0.18)';
        ctx.beginPath();
        ctx.moveTo(lx, horizon - s * 8.5);
        ctx.lineTo(w * 0.9, horizon - s * 12);
        ctx.lineTo(w * 0.9, horizon - s * 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f4f0ea';
        ctx.beginPath();
        ctx.moveTo(lx - s * 1.1, horizon - s * 2);
        ctx.lineTo(lx - s * 0.7, horizon - s * 8);
        ctx.lineTo(lx + s * 0.7, horizon - s * 8);
        ctx.lineTo(lx + s * 1.1, horizon - s * 2);
        ctx.fill();
        ctx.fillStyle = '#e0524f';
        for (let k = 0; k < 3; k++) ctx.fillRect(lx - s * (1 - k * 0.1), horizon - s * (3 + k * 2), s * (2 - k * 0.2), s * 0.8);
        ctx.fillStyle = '#ffe680';
        ctx.fillRect(lx - s * 0.55, horizon - s * 9, s * 1.1, s * 1);
        ctx.fillStyle = '#3c3150';
        ctx.beginPath();
        ctx.moveTo(lx - s * 0.8, horizon - s * 9);
        ctx.lineTo(lx, horizon - s * 9.8);
        ctx.lineTo(lx + s * 0.8, horizon - s * 9);
        ctx.fill();
        break;
      }
      case 'reef': {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        for (let k = 0; k < 6; k++) {
          const x = rng.next() * w;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + s * 2, 0);
          ctx.lineTo(x + s * 7, h);
          ctx.lineTo(x + s * 3, h);
          ctx.fill();
        }
        const corals = ['#ff7aa8', '#ffb35c', '#b28cff', '#5ee0b0', '#ff6b6b'];
        for (let k = 0; k < 16; k++) {
          const side = k % 2;
          const x = side ? w - rng.next() * Math.max(this.ox, s * 2) : rng.next() * Math.max(this.ox, s * 2);
          const base = h - rng.next() * s * 2;
          ctx.strokeStyle = corals[k % corals.length];
          ctx.lineWidth = s * (0.25 + rng.next() * 0.25);
          ctx.lineCap = 'round';
          branch(ctx, x, base, -Math.PI / 2 + (rng.next() - 0.5) * 0.6, s * (2 + rng.next() * 3), 3, rng);
        }
        this.paintBubblesBg(ctx, rng);
        break;
      }
      case 'ship': {
        this.paintBubblesBg(ctx, rng);
        ctx.fillStyle = '#2a1d16';
        for (const side of [0, 1]) {
          const x = side ? this.X(FIELD_W + 0.8) : this.X(-0.8);
          const dir = side ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(x, h * 0.35);
          ctx.quadraticCurveTo(x + dir * s * 6, h * 0.3, x + dir * s * 12, h * 0.5);
          ctx.lineTo(x + dir * s * 12, h);
          ctx.lineTo(x, h);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 220, 140, 0.25)';
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.arc(x + dir * s * (2 + k * 2.6), h * 0.5 + s * k * 0.4, s * 0.55, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#2a1d16';
        }
        ctx.fillStyle = '#ffcf5a';
        for (let k = 0; k < 10; k++) {
          ctx.beginPath();
          ctx.arc(rng.next() * w, h - rng.next() * s * 1.5, s * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default:
    }
  }

  paintClouds(ctx, rng, n) {
    const { w, s } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let k = 0; k < n; k++) {
      const x = rng.next() * w, y = s * (1 + rng.next() * 5);
      for (let j = 0; j < 4; j++) {
        ctx.beginPath();
        ctx.arc(x + j * s * 0.9, y + Math.sin(j * 2) * s * 0.2, s * (0.7 + (j % 2) * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  paintBubblesBg(ctx, rng) {
    const { w, h, s } = this;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(1, s * 0.06);
    for (let k = 0; k < 40; k++) {
      ctx.beginPath();
      ctx.arc(rng.next() * w, rng.next() * h, s * (0.1 + rng.next() * 0.35), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  bakeCrab() {
    const { dpr, s } = this;
    const u = s * 1.05 * dpr;
    const body = makeCanvas(u * 4.6, u * 3.2);
    const ctx = body.getContext('2d');
    ctx.translate(u * 2.3, u * 1.75);
    drawCrabBody(ctx, u);
    const blink = makeCanvas(u * 4.6, u * 3.2);
    const bctx = blink.getContext('2d');
    bctx.translate(u * 2.3, u * 1.75);
    drawCrabBody(bctx, u, true);
    const claw = makeCanvas(u * 1.1, u * 1.1);
    const cctx = claw.getContext('2d');
    cctx.translate(u * 0.55, u * 0.55);
    drawClaw(cctx, u);
    const shell = makeCanvas(u * 3, u * 2.6);
    const sctx = shell.getContext('2d');
    sctx.translate(u * 1.5, u * 1.3);
    drawLauncher(sctx, u);
    this.crab = { body, blink, claw, shell, u };
  }

  // ----------------------------------------------------------- the shot

  // `result` comes from game.fire; `before` is the board before the shot.
  playShot(result, before) {
    const path = result.trace.path;
    let total = 0;
    const segs = [];
    for (let k = 1; k < path.length; k++) {
      const len = Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y);
      segs.push(len);
      total += len;
    }
    const shot = result.shot;
    this.flight = { result, path, segs, total, d: 0, sprite: this.sprites.forShot(shot), shot, before, bounced: 0 };
    this.cells = before.cells.slice();
    this.drop = before.drop;
    this.loadPop = 0;
    this.claw = 1;
    // a lightning shot zaps cells as it flies past them
    if (shot.kind === 'zap') this.flight.zapAt = result.trace.touched.map((i) => ({ i, at: this.distanceTo(path, segs, CX[i], before.y(i)) }));
  }

  distanceTo(path, segs, x, y) {
    let best = 0, bestD = Infinity, acc = 0;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      const len = segs[k - 1] || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (len * len)));
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bestD) { bestD = d; best = acc + len * t; }
      acc += len;
    }
    return best;
  }

  flightPos(d) {
    const { path, segs } = this.flight;
    let acc = 0;
    for (let k = 1; k < path.length; k++) {
      const len = segs[k - 1];
      if (acc + len >= d) {
        const t = len ? (d - acc) / len : 1;
        return { x: path[k - 1].x + (path[k].x - path[k - 1].x) * t, y: path[k - 1].y + (path[k].y - path[k - 1].y) * t, seg: k };
      }
      acc += len;
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y, seg: path.length - 1 };
  }

  land() {
    const { result, before } = this.flight;
    const ev = result.events;
    this.flight = null;
    const game = this.game;
    // board after the shot, minus whatever is still to animate
    this.cells = game.board.cells.slice();
    const landY = (i) => before.y(i);
    if (result.trace.land >= 0) {
      this.hooks.land?.(result.shot.kind);
      this.bump(result.trace.land, before);
    }
    const color = (cell) => (cell.k === 'b' || cell.k === 'ice' ? PALETTE[cell.c].base : cell.k === 'stone' ? '#b7bfca' : '#ffffff');
    for (const p of ev.pops) {
      if (result.shot.kind === 'zap') continue; // zapped in flight
      this.pops.push({ x: CX[p.i], y: landY(p.i), sprite: this.sprites.forCell(p.cell), at: this.time + 0.045 * p.t + 0.02, k: p.t, color: color(p.cell), kind: p.cell.k });
    }
    if (result.trace.land >= 0 && ev.pops.length === 0 && (result.shot.kind === 'b' || result.shot.kind === 'rainbow')) {
      // just stuck: nothing else to show
    }
    for (const b of ev.blasts) {
      this.pops.push({ x: CX[b.i], y: landY(b.i), sprite: null, at: this.time + 0.045 * b.t + 0.03, blast: b.kind, row: (b.i / W) | 0 });
    }
    for (const c of ev.cracks) this.burst(CX[c.i], landY(c.i), '#e8fbff', 6, 0.6);
    const popEnd = ev.pops.reduce((m, p) => Math.max(m, p.t), 0) * 0.045 + 0.08;
    for (const d of ev.drops) {
      this.falls.push({
        x: CX[d.i], y: landY(d.i), vx: (Math.sin(d.i * 12.9898) * 0.5) * 6, vy: -2 - (d.i % 3), sprite: this.sprites.forCell(d.cell),
        wait: popEnd, color: color(d.cell), anchor: d.cell.k === 'anchor',
      });
    }
    for (const f of ev.freed) this.freeOtter(f.cell.o, CX[f.i], landY(f.i), f.how === 'drop' ? popEnd : 0.05 * f.t + 0.05);
    if (result.gained > 0 && (ev.pops.length || ev.drops.length || ev.freed.length)) {
      const at = result.trace.land >= 0 ? result.trace.land : (ev.pops[0]?.i ?? 0);
      this.floater(`+${result.gained}`, CX[at], landY(at) - 0.6, ev.pops.length + ev.drops.length >= 10 ? '#ffe14d' : '#ffffff', ev.pops.length + ev.drops.length >= 10 ? 1.3 : 1);
    }
    if (ev.drops.length >= 6) this.hooks.bigDrop?.(ev.drops.length);
    if (result.creep) this.hooks.creep?.();
    this.loadPop = 0;
  }

  // Neighbors wobble away from where a bubble lands.
  bump(i, board) {
    if (this.reduceMotion) return;
    for (const n of NEIGHBORS[i]) {
      for (const m of [n, ...NEIGHBORS[n]]) {
        if (m === i) continue;
        const dx = CX[m] - CX[i], dy = CY[m] - CY[i];
        const d = Math.hypot(dx, dy) || 1;
        const k = m === n ? 4 : 1.6;
        this.jiggle[m * 4 + 2] += (dx / d) * k;
        this.jiggle[m * 4 + 3] += (dy / d) * k;
      }
    }
  }

  freeOtter(id, x, y, delay) {
    const left = x < FIELD_W / 2;
    this.otters.push({ id, x, y, vx: 0, vy: 0, t: -delay, phase: 'wait', dir: left ? -1 : 1, spin: 0 });
  }

  floater(text, x, y, color = '#ffffff', size = 1) {
    if (this.floaters.length > 10) this.floaters.shift();
    this.floaters.push({ text, x, y, t: 0, color, size });
  }

  // ---------------------------------------------------------- particles

  spawn(x, y, vx, vy, life, size, color, kind = 'drop') {
    for (const p of this.particles) {
      if (p.on) continue;
      p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color; p.kind = kind;
      return p;
    }
    return null;
  }

  burst(x, y, color, n = 10, power = 1) {
    if (this.reduceMotion) n = Math.ceil(n / 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.sin(k * 7.3 + x) * 0.4;
      const v = (4 + (k % 3) * 2.5) * power;
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v - 2, 0.45 + (k % 4) * 0.08, 0.1 + (k % 3) * 0.05, color);
    }
    this.spawn(x, y, 0, 0, 0.3, 1.1, color, 'ring');
  }

  splash(x, color) {
    const n = this.reduceMotion ? 3 : 8;
    for (let k = 0; k < n; k++) {
      const vx = (k / (n - 1) - 0.5) * 8;
      this.spawn(x, WATER_Y, vx, -6 - (k % 3) * 2.5, 0.6, 0.12 + (k % 2) * 0.06, k % 2 ? '#ffffff' : color);
    }
    this.spawn(x, WATER_Y, 0, 0, 0.45, 0.9, '#ffffff', 'ripple');
  }

  // --------------------------------------------------------------- update

  update(dt) {
    this.time += dt;
    const game = this.game;
    if (!game) return;
    this.blink -= dt;
    if (this.blink < -3.2) this.blink = 0.14;
    this.claw = Math.max(0, this.claw - dt * 4);
    this.loadPop = Math.min(1, this.loadPop + dt * 5);
    this.shake = Math.max(0, this.shake - dt * 3);
    // the ceiling eases down to the board's drop
    const targetDrop = this.flight ? this.flight.before.drop : game.board.drop;
    this.drop += (targetDrop - this.drop) * Math.min(1, dt * 6);
    if (Math.abs(targetDrop - this.drop) < 0.002) this.drop = targetDrop;
    this.warn = game.phase === 'aim' && game.creepIn <= 2 && !game.goalMet() ? Math.min(1, this.warn + dt * 3) : Math.max(0, this.warn - dt * 3);
    const low = game.board.lowestRow();
    this.danger += ((low >= LOSE_ROW - 2 ? 1 : 0) - this.danger) * Math.min(1, dt * 4);

    // shot in flight
    if (this.flight) {
      const f = this.flight;
      const before = f.d;
      f.d = Math.min(f.total, f.d + SHOT_SPEED * dt);
      const pos = this.flightPos(f.d);
      if (pos.seg - 1 > f.bounced && f.path[pos.seg - 1]?.bounce) { f.bounced = pos.seg - 1; this.hooks.bounce?.(); }
      if (f.zapAt) {
        for (const z of f.zapAt) {
          if (z.at > before && z.at <= f.d + 0.5) {
            const cell = this.cells[z.i];
            if (cell) {
              this.burst(CX[z.i], f.before.y(z.i), '#ffe14d', 8, 1.1);
              this.cells[z.i] = null;
              this.hooks.pop?.(0);
            }
          }
        }
        if (!this.reduceMotion) this.spawn(pos.x, pos.y, 0, 0, 0.25, 0.5, '#ffe14d', 'ring');
      }
      if (f.d >= f.total) this.land();
    }

    // cascading pops
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const p = this.pops[k];
      if (this.time < p.at) continue;
      this.pops.splice(k, 1);
      if (p.blast) {
        this.hooks.blast?.(p.blast);
        if (p.blast === 'bomb') {
          if (!this.reduceMotion) this.shake = Math.min(1, this.shake + 0.6);
          this.burst(p.x, p.y, '#ffb35c', 16, 1.8);
          this.spawn(p.x, p.y, 0, 0, 0.4, 3.2, '#fff1c0', 'ring');
        } else {
          for (let x = 1; x < FIELD_W; x += 1.5) this.spawn(x, p.y, 0, -1, 0.35, 0.35, '#ffe14d', 'spark');
          this.spawn(p.x, p.y, 0, 0, 0.35, 1.6, '#ffe14d', 'ring');
        }
        continue;
      }
      this.burst(p.x, p.y, p.color, p.kind === 'b' ? 9 : 6);
      this.hooks.pop?.(p.k);
    }

    // falling clusters
    for (let k = this.falls.length - 1; k >= 0; k--) {
      const f = this.falls[k];
      if (f.wait > 0) { f.wait -= dt; continue; }
      f.vy += GRAVITY * dt * 0.5;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < 1 || f.x > FIELD_W - 1) f.vx = -f.vx;
      if (f.y >= WATER_Y) {
        this.splash(f.x, f.color);
        this.hooks.splash?.(f.anchor);
        this.falls.splice(k, 1);
      }
    }

    // otters
    for (let k = this.otters.length - 1; k >= 0; k--) {
      const o = this.otters[k];
      o.t += dt;
      if (o.phase === 'wait') {
        if (o.t >= 0) {
          o.phase = 'hop';
          o.t = 0;
          o.vy = -9;
          o.vx = o.dir * 2.5;
          this.burst(o.x, o.y, '#bff4ff', 12, 1.2);
          this.hooks.otter?.(o.id);
          this.floater(this.hooks.otterName?.(o.id) || 'Rescued!', o.x, o.y - 1.4, '#9ff7ff', 1.1);
        }
      } else if (o.phase === 'hop') {
        o.vy += GRAVITY * 0.45 * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        o.spin = this.reduceMotion ? 0 : Math.min(Math.PI * 2, o.t * 9);
        if (o.x < 1.5 || o.x > FIELD_W - 1.5) o.vx = -o.vx * 0.6;
        if (o.y >= WATER_Y + 0.15 && o.vy > 0) {
          o.phase = 'swim';
          o.y = WATER_Y + 0.15;
          o.t = 0;
          o.spin = 0;
          this.splash(o.x, '#bff4ff');
        }
      } else {
        o.x += o.dir * 5 * dt;
        if (o.x < -4 - this.ox / this.s || o.x > FIELD_W + 4 + this.ox / this.s) this.otters.splice(k, 1);
      }
    }

    for (const p of this.particles) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      if (p.kind === 'drop') { p.vy += GRAVITY * 0.35 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      else if (p.kind === 'spark') { p.y += p.vy * dt; }
    }
    for (let k = this.floaters.length - 1; k >= 0; k--) {
      const f = this.floaters[k];
      f.t += dt;
      f.y -= dt * 1.4;
      if (f.t > 1.1) this.floaters.splice(k, 1);
    }

    // jiggle springs
    const j = this.jiggle;
    const decay = Math.exp(-dt * 7);
    for (let i = 0; i < SIZE; i++) {
      const b = i * 4;
      if (j[b] === 0 && j[b + 1] === 0 && j[b + 2] === 0 && j[b + 3] === 0) continue;
      j[b + 2] -= j[b] * 220 * dt;
      j[b + 3] -= j[b + 1] * 220 * dt;
      j[b + 2] *= decay;
      j[b + 3] *= decay;
      j[b] += j[b + 2] * dt;
      j[b + 1] += j[b + 3] * dt;
      if (Math.abs(j[b]) + Math.abs(j[b + 1]) + Math.abs(j[b + 2]) + Math.abs(j[b + 3]) < 0.003) j[b] = j[b + 1] = j[b + 2] = j[b + 3] = 0;
    }
  }

  setGuide(trace) {
    this.guide = trace;
  }

  // ----------------------------------------------------------------- draw

  draw() {
    const { ctx, dpr, s } = this;
    const game = this.game;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0, this.w, this.h);
    else { ctx.fillStyle = '#0b3a5a'; ctx.fillRect(0, 0, this.w, this.h); }
    if (!game) return;
    if (this.shake > 0) {
      const a = this.shake * s * 0.18;
      ctx.translate(Math.sin(this.time * 61) * a, Math.cos(this.time * 47) * a);
    }
    const dropY = this.drop * ROW_H;

    this.drawCeiling(dropY);
    this.drawWater();

    // board
    const r = this.sprites.r / dpr;
    for (let i = 0; i < SIZE; i++) {
      const cell = this.cells[i];
      if (!cell) continue;
      const sprite = this.sprites.forCell(cell);
      let x = CX[i] + this.jiggle[i * 4];
      let y = CY[i] + dropY + this.jiggle[i * 4 + 1];
      if (cell.k === 'otter' && !this.reduceMotion) y += Math.sin(this.time * 2.2 + i) * 0.05;
      this.blit(sprite, this.X(x), this.Y(y));
    }
    // waiting pops swell a little before they burst
    for (const p of this.pops) {
      if (!p.sprite) continue;
      const k = Math.max(0, 1 - (p.at - this.time) / 0.2);
      this.blit(p.sprite, this.X(p.x), this.Y(p.y), 1 + k * 0.15);
    }
    for (const f of this.falls) this.blit(f.sprite, this.X(f.x), this.Y(f.y));

    if (game.phase === 'aim' && this.showGuide && !this.flight) this.drawGuide(r);
    this.drawCrab();
    if (this.flight) {
      const pos = this.flightPos(this.flight.d);
      this.blit(this.flight.sprite, this.X(pos.x), this.Y(pos.y));
    }
    this.drawOtters();
    this.drawParticles();
    this.drawFloaters();
  }

  blit(sprite, x, y, scale = 1) {
    const size = sprite.canvas.width / this.dpr * scale;
    this.ctx.drawImage(sprite.canvas, x - size / 2, y - size / 2, size, size);
  }

  drawCeiling(dropY) {
    const { ctx, s, theme } = this;
    const top = this.Y(-0.35);
    const y = this.Y(dropY);
    const x0 = this.X(-0.2), x1 = this.X(FIELD_W + 0.2);
    if (dropY > 0.01) {
      ctx.fillStyle = 'rgba(8, 20, 40, 0.45)';
      ctx.fillRect(x0, top, x1 - x0, y - top);
      ctx.strokeStyle = 'rgba(230, 200, 150, 0.8)';
      ctx.lineWidth = s * 0.12;
      ctx.beginPath();
      for (const u of [2.5, FIELD_W - 2.5]) {
        ctx.moveTo(this.X(u), top);
        ctx.lineTo(this.X(u), y - s * 0.2);
      }
      ctx.stroke();
    }
    // the plank, wobbling when it is about to creep
    const wob = this.warn * (this.reduceMotion ? 0 : Math.sin(this.time * 18) * s * 0.06);
    ctx.fillStyle = theme.frameDark;
    ctx.fillRect(x0, y - s * 0.55 + wob, x1 - x0, s * 0.55);
    ctx.fillStyle = theme.frame;
    ctx.fillRect(x0, y - s * 0.55 + wob, x1 - x0, s * 0.36);
    // shells counting the shots until it moves
    const game = this.game;
    const pips = game.level.creep;
    const left = game.creepIn;
    for (let k = 0; k < pips; k++) {
      const px = this.X(FIELD_W / 2 + (k - (pips - 1) / 2) * 0.9);
      const py = y - s * 0.28 + wob;
      ctx.fillStyle = k < left ? (left <= 2 ? '#ffb35c' : '#fff3dc') : 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(px, py, s * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawWater() {
    const { ctx, s, theme } = this;
    const y = this.Y(WATER_Y);
    const x0 = this.X(-0.2), x1 = this.X(FIELD_W + 0.2);
    const bottom = this.Y(WATER_Y + 0.95);
    const t = this.reduceMotion ? 0 : this.time;
    ctx.fillStyle = theme.water;
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let u = -0.2; u <= FIELD_W + 0.21; u += 0.5) {
      ctx.lineTo(this.X(u), y + Math.sin(u * 0.9 + t * 2.2) * s * 0.12);
    }
    ctx.lineTo(x1, bottom);
    ctx.closePath();
    ctx.fill();
    // foam line: brighter as the bubbles get close
    ctx.strokeStyle = this.danger > 0.05 ? `rgba(255, ${Math.round(255 - 120 * this.danger)}, ${Math.round(255 - 140 * this.danger)}, ${0.7 + 0.3 * Math.sin(this.time * 8) * this.danger})` : 'rgba(255,255,255,0.75)';
    ctx.lineWidth = s * 0.14;
    ctx.setLineDash([s * 0.4, s * 0.3]);
    ctx.beginPath();
    for (let u = -0.2; u <= FIELD_W + 0.21; u += 0.5) {
      const yy = y + Math.sin(u * 0.9 + t * 2.2) * s * 0.12;
      if (u === -0.2) ctx.moveTo(this.X(u), yy); else ctx.lineTo(this.X(u), yy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawGuide(r) {
    const { ctx, s } = this;
    const trace = this.guide;
    if (!trace) return;
    const path = trace.path;
    const shot = this.game.current;
    const color = shot && shot.kind === 'b' ? PALETTE[shot.c].light : shot?.kind === 'zap' ? '#ffe14d' : '#ffffff';
    // dots along the path; they drift outward so the line feels alive
    const spacing = 0.9;
    const offset = this.reduceMotion ? 0 : (this.time * 2.2) % spacing;
    let acc = 0;
    let n = 0;
    ctx.fillStyle = color;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let d = (spacing - ((acc - offset) % spacing + spacing) % spacing) % spacing;
      for (; d < len; d += spacing) {
        const t = d / len;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const fade = Math.max(0.25, 1 - n * 0.012);
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.arc(this.X(x), this.Y(y), s * (0.15 - Math.min(0.05, n * 0.0015)), 0, Math.PI * 2);
        ctx.fill();
        n++;
      }
      acc += len;
    }
    ctx.globalAlpha = 1;
    if (trace.land >= 0) {
      this.blit(this.sprites.ghost(), this.X(CX[trace.land]), this.Y(CY[trace.land] + this.drop * ROW_H));
    }
  }

  drawCrab() {
    const { ctx, dpr, crab } = this;
    const game = this.game;
    if (!crab) return;
    const u = crab.u / dpr;
    const bob = this.reduceMotion ? 0 : Math.sin(this.time * 2.4) * u * 0.05;
    const cx = this.X(FIELD_W / 2), cy = this.Y(LAUNCH_Y + 2.15) + bob;
    const lx = this.X(FIELD_W / 2), ly = this.Y(LAUNCH_Y) + bob * 0.5;
    const a = Math.PI / 2 - this.aim;
    // the scallop launcher behind the bubble, turned to the aim
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(a);
    const kick = this.claw * u * 0.3;
    const sw = crab.shell.width / dpr * 0.8, sh = crab.shell.height / dpr * 0.8;
    ctx.drawImage(crab.shell, -sw / 2, -sh / 2 + u * 0.55 + kick, sw, sh);
    ctx.restore();
    // loaded bubble
    if (game.current && !this.flight) this.blit(this.sprites.forShot(game.current), lx, ly, 0.5 + 0.5 * easeOutBack(this.loadPop));
    // arms up to the shell, then the body in front
    ctx.strokeStyle = '#e8553a';
    ctx.lineWidth = u * 0.24;
    ctx.lineCap = 'round';
    const cw = crab.claw.width / dpr;
    const grips = [];
    for (const side of [-1, 1]) {
      const gx = lx + side * u * (1.2 - this.claw * 0.12);
      const gy = ly + u * 0.35;
      grips.push([side, gx, gy]);
      ctx.beginPath();
      ctx.moveTo(cx + side * u * 1.05, cy - u * 0.15);
      ctx.quadraticCurveTo(cx + side * u * 1.9, cy - u * 0.9, gx, gy + u * 0.3);
      ctx.stroke();
    }
    const body = this.blink > 0 ? crab.blink : crab.body;
    const bw = body.width / dpr, bh = body.height / dpr;
    ctx.drawImage(body, cx - bw * 0.5, cy - bh * (1.75 / 3.2), bw, bh);
    for (const [side, gx, gy] of grips) {
      ctx.save();
      ctx.translate(gx, gy);
      ctx.scale(-side, 1);
      ctx.rotate(-0.35 - this.claw * 0.3);
      ctx.drawImage(crab.claw, -cw / 2, -cw / 2, cw * 0.85, cw * 0.85);
      ctx.restore();
    }
    // next bubble in the clam
    if (game.next) this.blit(this.sprites.forShot(game.next), this.X(NEXT_POS.x), this.Y(NEXT_POS.y), 0.78);
    // bubbles left
    const n = game.shotsLeft;
    const x = this.X(COUNT_POS.x), y = this.Y(COUNT_POS.y);
    const low = n <= 3 && game.phase === 'aim';
    ctx.fillStyle = low ? '#ff6b6b' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, this.s * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = this.s * 0.12;
    ctx.strokeStyle = 'rgba(20, 60, 100, 0.5)';
    ctx.stroke();
    ctx.fillStyle = low ? '#ffffff' : '#12406a';
    ctx.font = n >= 100 ? this.fontSmall : this.fontCount;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + this.s * 0.05);
  }

  drawOtters() {
    const { ctx } = this;
    for (const o of this.otters) {
      if (o.phase === 'wait') {
        this.blit(this.sprites.otter(o.id), this.X(o.x), this.Y(o.y));
        continue;
      }
      const sprite = this.sprites.freeOtter(o.id);
      const w = sprite.canvas.width / this.dpr, h = sprite.canvas.height / this.dpr;
      const bob = o.phase === 'swim' && !this.reduceMotion ? Math.sin(this.time * 6 + o.id) * this.s * 0.1 : 0;
      ctx.save();
      ctx.translate(this.X(o.x), this.Y(o.y) + bob);
      if (o.spin) ctx.rotate(o.spin * o.dir);
      ctx.scale(o.dir < 0 ? -1 : 1, 1);
      ctx.drawImage(sprite.canvas, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  drawParticles() {
    const { ctx, s } = this;
    for (const p of this.particles) {
      if (!p.on) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.4);
      if (p.kind === 'ring' || p.kind === 'ripple') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = s * 0.12 * k;
        ctx.beginPath();
        if (p.kind === 'ripple') ctx.ellipse(this.X(p.x), this.Y(p.y), s * p.size * (1.6 - k), s * p.size * 0.3 * (1.6 - k), 0, 0, Math.PI * 2);
        else ctx.arc(this.X(p.x), this.Y(p.y), s * p.size * (1.3 - k * 0.6), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(this.X(p.x), this.Y(p.y), s * p.size * (0.6 + 0.4 * k), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFloaters() {
    const { ctx, s } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of this.floaters) {
      const k = f.t / 1.1;
      ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      const size = Math.round(s * 0.95 * f.size * (k < 0.15 ? 0.6 + k * 2.6 : 1));
      ctx.font = `900 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
      ctx.lineWidth = Math.max(2, s * 0.18);
      ctx.strokeStyle = 'rgba(10, 40, 70, 0.8)';
      ctx.strokeText(f.text, this.X(f.x), this.Y(f.y));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, this.X(f.x), this.Y(f.y));
    }
    ctx.globalAlpha = 1;
  }

  // The continue wave: everything it washed away bursts into foam.
  washed(events, board) {
    this.cells = board.cells.slice();
    for (const p of events.pops) this.burst(CX[p.i], board.y(p.i), '#e8fbff', 5, 0.9);
    for (const d of events.drops) {
      this.falls.push({ x: CX[d.i], y: board.y(d.i), vx: 0, vy: 0, sprite: this.sprites.forCell(d.cell), wait: 0.1, color: '#e8fbff', anchor: d.cell.k === 'anchor' });
    }
    for (const f of events.freed) this.freeOtter(f.cell.o, CX[f.i], board.y(f.i), 0.1);
    for (let x = 1; x < FIELD_W; x += 2) this.splash(x, '#bff4ff');
  }

  // Leftover bubbles fly up and burst as a finale.
  finaleBubble(k) {
    const x = 1.5 + ((k * 7.31) % 17);
    const y = 4 + ((k * 3.7) % 12);
    const color = PALETTE[k % PALETTE.length].base;
    this.burst(x, y, color, 10, 1.2);
    this.spawn(FIELD_W / 2, LAUNCH_Y, (x - FIELD_W / 2) * 0.5, -12, 0.35, 0.3, color);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A rounded tide-pool rock, maybe with a little pool, seaweed and a starfish.
function rock(ctx, x, y, r, rng, pool) {
  const pts = [];
  const n = 11;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = r * (0.85 + rng.next() * 0.3);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.62]);
  }
  const blob = (dy = 0, scale = 1) => {
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      const p = pts[k % n], q = pts[(k + 1) % n];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const px = x + (p[0] - x) * scale, py = y + dy + (p[1] - y) * scale;
      const mxs = x + (mx - x) * scale, mys = y + dy + (my - y) * scale;
      if (k === 0) ctx.moveTo(mxs, mys); else ctx.quadraticCurveTo(px, py, mxs, mys);
    }
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(10, 40, 60, 0.25)';
  blob(r * 0.18, 1.02);
  ctx.fill();
  ctx.fillStyle = '#6f7787';
  blob();
  ctx.fill();
  ctx.fillStyle = '#9aa3b3';
  blob(-r * 0.1, 0.82);
  ctx.fill();
  ctx.fillStyle = '#b9c1cf';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.28, r * 0.1, -0.3, 0, Math.PI * 2);
  ctx.fill();
  if (pool) {
    ctx.fillStyle = '#2b9fb5';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.1, y - r * 0.05, r * 0.5, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6fe0ec';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.05, y - r * 0.09, r * 0.38, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.1, y - r * 0.12, r * 0.12, r * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#3c9a5a';
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const sx = x - r * 0.6 + k * r * 0.18;
    ctx.beginPath();
    ctx.moveTo(sx, y + r * 0.3);
    ctx.quadraticCurveTo(sx - r * 0.25, y + r * 0.05, sx + r * 0.05, y - r * 0.25 - k * r * 0.08);
    ctx.stroke();
  }
  ctx.fillStyle = ['#ff8a5c', '#ff6fae', '#ffd25a'][Math.floor(rng.next() * 3)];
  star(ctx, x + r * 0.62, y + r * 0.22, r * 0.2);
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function branch(ctx, x, y, angle, len, depth, rng) {
  const x2 = x + Math.cos(angle) * len, y2 = y + Math.sin(angle) * len;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (depth <= 0) return;
  branch(ctx, x2, y2, angle - 0.5 + rng.next() * 0.2, len * 0.65, depth - 1, rng);
  branch(ctx, x2, y2, angle + 0.5 - rng.next() * 0.2, len * 0.65, depth - 1, rng);
}

function easeOutBack(t) {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
