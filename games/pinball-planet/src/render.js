// Canvas renderer. Reads the world, rules and DMD; never mutates them.
// Static table art is baked once per size into an offscreen canvas (glows
// included), lamps and devices are pre-rendered sprites, and the dot-matrix
// display is a 128 x 32 ImageData blown up under a baked dot mask.
import {
  TABLE, SLINGS, BUMPERS, TARGETS, SPINNER, HOLE, RAMP, LANES, SHOTS, INSERTS, PLUNGER, SHOOTER_GATE_Y, buildColliders,
} from './table.js';
import { PLANETS, JACKPOT_SHOTS, LANE_LETTERS } from './rules.js';
import { DMD_W, DMD_H } from './dmd.js';
import { FLIPPER } from './physics.js';

const TAU = Math.PI * 2;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MAX_PARTICLES = 160;
const POP_BIG = `900 20px ${FONT}`;
const POP_SMALL = `800 13px ${FONT}`;
const TRAIL = 9;

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function mix(hex, to, t) {
  const a = rgb(hex), b = rgb(to);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

// An offscreen canvas `w x h` table units big, drawn at `scale` device px
// per unit, with its origin at (ox, oy) in table units.
function sprite(w, h, scale, draw, ox = w / 2, oy = h / 2) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * scale));
  c.height = Math.max(1, Math.ceil(h * scale));
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.translate(ox, oy);
  draw(g);
  return { canvas: c, w, h, ox, oy };
}

function drawSprite(ctx, s, x, y) {
  ctx.drawImage(s.canvas, x - s.ox, y - s.oy, s.w, s.h);
}

const SHOT_COLORS = { leftOrbit: '#ff6b4a', spinner: '#ffb35c', blackHole: '#ffe07a', ramp: '#4fb8ff', rightOrbit: '#ff7ad9' };
const DMD_LUT = (() => {
  const lut = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const r = Math.round(40 + 215 * Math.pow(t, 0.8));
    const g = Math.round(14 + 150 * Math.pow(t, 1.25));
    const b = Math.round(6 + 60 * Math.pow(t, 2.2));
    lut[i] = (255 << 24) | (b << 16) | (g << 8) | r; // little-endian RGBA
  }
  return lut;
})();

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.particles = [];
    this.popups = [];
    this.trails = new Map();
    this.cam = { x: 0, y: 0, vx: 0, vy: 0 };
    this.tiltFlash = 0;
    this.flashAll = 0;
    this.time = 0;
    this.lamps = new Float32Array(64);
    this.glows = new Map();
    this.dmdCanvas = document.createElement('canvas');
    this.dmdCanvas.width = DMD_W;
    this.dmdCanvas.height = DMD_H;
    this.dmdCtx = this.dmdCanvas.getContext('2d');
    this.dmdImage = this.dmdCtx.createImageData(DMD_W, DMD_H);
    this.dmdPixels = new Uint32Array(this.dmdImage.data.buffer);
    this.colliders = buildColliders();
    this.resize();
  }

  // ------------------------------------------------------------ layout

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = dpr;
    this.cw = w;
    this.ch = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const pad = 8;
    let s = (h - pad * 2) / TABLE.h;
    s = Math.min(s, (w - pad * 2) / TABLE.w);
    const side = (w - TABLE.w * s) / 2;
    if (side >= 240 && w > h) {
      // Landscape: the table fills the height, the DMD sits to its left.
      const tx = (w - TABLE.w * s) / 2;
      const dw = Math.min(side - 36, 470);
      const dh = dw / 4;
      const dmd = { x: tx - 18 - dw, y: Math.max(pad + 52, h * 0.12), w: dw, h: dh };
      const gy = dmd.y + dh + 34;
      const glass = h - gy - 24 > 170 ? { x: dmd.x - 6, y: gy, w: dw + 12, h: Math.min(h - gy - 24, dw * 1.25) } : null;
      this.layout = { mode: 'landscape', s, tx, ty: (h - TABLE.h * s) / 2, dmd, glass };
    } else {
      // Portrait: DMD above the table, like a backbox.
      const ratio = 1 / 4.4;
      // Keep the top strip free for the HUD buttons and the full-screen pill.
      const reserve = 58;
      s = Math.min((w - pad * 2) / TABLE.w, (h - reserve - pad * 2) / (TABLE.h + TABLE.w * ratio));
      const tw = TABLE.w * s, dh = tw * ratio;
      const total = dh + pad + TABLE.h * s;
      const top = Math.max(reserve, (h - total) / 2);
      const tx = (w - tw) / 2;
      this.layout = { mode: 'portrait', s, tx, ty: top + dh + pad, dmd: { x: tx + tw * 0.04, y: top, w: tw * 0.92, h: dh } };
    }
    this.baked = null;
    this.glowCss = null;
    this.glows.clear();
  }

  toTable(clientX, clientY) {
    const L = this.layout;
    return { x: (clientX - L.tx) / L.s, y: (clientY - L.ty) / L.s };
  }

  // Bake everything that depends on size. Split into steps so the caller can
  // spread it over frames; returns true when finished.
  bakeStep() {
    if (!this.bakeQueue) {
      this.bakeQueue = [
        () => this.bakeTable(),
        () => this.bakeHardware(),
        () => this.bakeSprites(),
        () => this.bakeLampSprites(),
        () => this.bakeDmdPanel(),
        () => this.bakeBackglass(),
      ];
      this.bakeParts = {};
    }
    const job = this.bakeQueue.shift();
    if (job) job();
    if (this.bakeQueue.length) return false;
    this.bakeQueue = null;
    this.baked = this.bakeParts;
    return true;
  }

  ensureBaked() {
    while (!this.baked) this.bakeStep();
  }

  get px() { return this.layout.s * this.dpr; }

  glow(color, r) {
    const key = `${color}|${r}`;
    let g = this.glows.get(key);
    if (!g) {
      g = sprite(r * 2, r * 2, this.px, (c) => {
        const grad = c.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0, rgba(color, 0.9));
        grad.addColorStop(0.25, rgba(color, 0.45));
        grad.addColorStop(1, rgba(color, 0));
        c.fillStyle = grad;
        c.fillRect(-r, -r, r * 2, r * 2);
      });
      this.glows.set(key, g);
    }
    return g;
  }

  // ------------------------------------------------------------ baking

  outlinePath(g) {
    g.beginPath();
    g.moveTo(20, TABLE.h);
    g.lineTo(20, 330);
    g.arc(320, 330, 300, Math.PI, TAU);
    g.lineTo(620, TABLE.h);
    g.closePath();
  }

  bakeTable() {
    const s = this.px;
    this.bakeParts.table = sprite(TABLE.w, TABLE.h, s, (g) => {
      // Cabinet wood around the playfield.
      const wood = g.createLinearGradient(0, 0, TABLE.w, 0);
      wood.addColorStop(0, '#1b0e3a');
      wood.addColorStop(0.5, '#2a1458');
      wood.addColorStop(1, '#1b0e3a');
      g.fillStyle = wood;
      g.fillRect(0, 0, TABLE.w, TABLE.h);
      g.save();
      this.outlinePath(g);
      g.clip();
      // Deep space.
      const sky = g.createLinearGradient(0, 0, 0, TABLE.h);
      sky.addColorStop(0, '#0b0730');
      sky.addColorStop(0.45, '#170b4a');
      sky.addColorStop(0.8, '#2a0d5e');
      sky.addColorStop(1, '#14082f');
      g.fillStyle = sky;
      g.fillRect(0, 0, TABLE.w, TABLE.h);
      const neb = (x, y, r, col, a) => {
        const n = g.createRadialGradient(x, y, 0, x, y, r);
        n.addColorStop(0, rgba(col, a));
        n.addColorStop(1, rgba(col, 0));
        g.fillStyle = n;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      };
      neb(140, 260, 260, '#ff4fd8', 0.22);
      neb(500, 420, 240, '#2fd3ff', 0.18);
      neb(260, 700, 300, '#8b5cff', 0.22);
      neb(470, 820, 200, '#ff8a3d', 0.12);
      for (let i = 0; i < 260; i++) {
        const x = 20 + hash(i) * 600, y = 30 + hash(i + 900) * 1060;
        const r = 0.5 + hash(i + 400) * 1.4;
        g.fillStyle = `rgba(255,255,255,${0.25 + hash(i + 77) * 0.6})`;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      // The home planet rising behind the flippers.
      const P = { x: 302, y: 1300, r: 420 };
      const atm = g.createRadialGradient(P.x, P.y, P.r * 0.9, P.x, P.y, P.r * 1.12);
      atm.addColorStop(0, 'rgba(79,243,255,0.45)');
      atm.addColorStop(1, 'rgba(79,243,255,0)');
      g.fillStyle = atm;
      g.beginPath(); g.arc(P.x, P.y, P.r * 1.12, 0, TAU); g.fill();
      const ground = g.createLinearGradient(0, P.y - P.r, 0, TABLE.h);
      ground.addColorStop(0, '#1d6b8f');
      ground.addColorStop(0.3, '#18406e');
      ground.addColorStop(1, '#0c1838');
      g.fillStyle = ground;
      g.beginPath(); g.arc(P.x, P.y, P.r, 0, TAU); g.fill();
      g.save();
      g.beginPath(); g.arc(P.x, P.y, P.r, 0, TAU); g.clip();
      g.strokeStyle = 'rgba(140,255,220,0.14)';
      g.lineWidth = 10;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.ellipse(P.x, P.y, P.r * (0.98 - i * 0.07), P.r * (0.98 - i * 0.07) * 0.98, 0, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      }
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `rgba(120,255,200,${0.06 + hash(i + 3) * 0.08})`;
        g.beginPath();
        g.ellipse(80 + hash(i + 10) * 450, 920 + hash(i + 20) * 170, 20 + hash(i) * 40, 8 + hash(i + 5) * 10, 0, 0, TAU);
        g.fill();
      }
      g.restore();
      // Painted lanes: shooter lane, orbit lanes, inlanes and outlanes.
      g.fillStyle = 'rgba(0,0,0,0.32)';
      g.fillRect(PLUNGER.laneX0 - 3, SHOOTER_GATE_Y - 10, PLUNGER.laneX1 - PLUNGER.laneX0 + 6, TABLE.h);
      this.paintLaneChevrons(g, 45, 360, 4, '#ff6b4a');
      this.paintLaneChevrons(g, 559, 360, 4, '#ff7ad9');
      this.paintLaneChevrons(g, SPINNER.x, 412, 2, '#ffb35c');
      // Black Hole: accretion swirl painted around the hole.
      const bh = g.createRadialGradient(HOLE.x, HOLE.y, 4, HOLE.x, HOLE.y, 70);
      bh.addColorStop(0, 'rgba(0,0,0,1)');
      bh.addColorStop(0.22, 'rgba(0,0,0,0.95)');
      bh.addColorStop(0.32, 'rgba(255,160,60,0.45)');
      bh.addColorStop(0.5, 'rgba(160,60,255,0.25)');
      bh.addColorStop(1, 'rgba(60,0,120,0)');
      g.fillStyle = bh;
      g.beginPath(); g.arc(HOLE.x, HOLE.y, 70, 0, TAU); g.fill();
      // Ringed planet art by the top lanes, and a red planet top-left.
      this.paintPlanet(g, 120, 210, 34, '#ffb35c', true);
      this.paintPlanet(g, 470, 150, 22, '#ff6b4a', false);
      this.paintPlanet(g, 540, 820, 14, '#ff7ad9', false);
      // Labels.
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const label = (txt, x, y, size, col, rot = 0) => {
        g.save();
        g.translate(x, y);
        g.rotate(rot);
        g.font = `900 ${size}px ${FONT}`;
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillText(txt, 1, 1.5);
        g.fillStyle = col;
        g.fillText(txt, 0, 0);
        g.restore();
      };
      label('SPINNER', SPINNER.x, 386, 12, '#ffd9a8');
      label('BLACK HOLE', HOLE.x, 412, 12, '#ffe9b0');
      label('ORBIT', 45, 600, 12, '#ffc3b5', -Math.PI / 2);
      label('ORBIT', 559, 600, 12, '#ffd0f0', -Math.PI / 2);
      label('KICKBACK', 41, 1010, 10, '#c8f8ff', -Math.PI / 2);
      label('KICKBACK', 563, 1010, 10, '#c8f8ff', -Math.PI / 2);
      label('SHOOT AGAIN', 302, 1086, 11, '#ffe9b0');
      label('LOCK', INSERTS.lock.x, INSERTS.lock.y + 18, 10, '#e0d0ff');
      label('EXTRA', INSERTS.extraBall.x, INSERTS.extraBall.y + 18, 9, '#ffe9b0');
      label('ASTEROID FRENZY', INSERTS.frenzy.x, INSERTS.frenzy.y + 18, 10, '#ffd9a8');
      label('JACKPOT', INSERTS.jackpot.x, INSERTS.jackpot.y + 18, 10, '#fff2a8');
      label('BALL SAVE', INSERTS.ballSave.x, INSERTS.ballSave.y + 18, 9, '#c8f8ff');
      PLANETS.forEach((p, i) => {
        const pos = INSERTS.planets[i];
        label(p.name, pos.x, pos.y + 24, 9.5, mix(p.color, '#ffffff', 0.45));
      });
      label('VISIT ALL 5 PLANETS', 302, 802, 11, '#f4f1ff');
      // Big logo on the planet.
      g.save();
      g.translate(302, 1035);
      g.font = `italic 900 30px ${FONT}`;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillText('PINBALL PLANET', 2, 3);
      const lg = g.createLinearGradient(-120, -15, 120, 15);
      lg.addColorStop(0, '#5ef2ff');
      lg.addColorStop(0.5, '#ffffff');
      lg.addColorStop(1, '#ff7ad9');
      g.fillStyle = lg;
      g.globalAlpha = 0.28;
      g.fillText('PINBALL PLANET', 0, 0);
      g.restore();
      g.restore(); // clip
    }, 0, 0);
  }

  paintLaneChevrons(g, x, y, n, col) {
    g.save();
    g.strokeStyle = rgba(col, 0.35);
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const yy = y + i * 22;
      g.beginPath();
      g.moveTo(x - 9, yy + 7); g.lineTo(x, yy); g.lineTo(x + 9, yy + 7);
      g.stroke();
    }
    g.restore();
  }

  paintPlanet(g, x, y, r, col, rings) {
    g.save();
    if (rings) {
      g.strokeStyle = rgba(col, 0.35);
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(x, y, r * 1.9, r * 0.5, -0.35, Math.PI, TAU); g.stroke();
    }
    const pg = g.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    pg.addColorStop(0, mix(col, '#ffffff', 0.5));
    pg.addColorStop(0.6, col);
    pg.addColorStop(1, mix(col, '#1a0638', 0.75));
    g.globalAlpha = 0.55;
    g.fillStyle = pg;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    if (rings) {
      g.globalAlpha = 0.55;
      g.beginPath(); g.ellipse(x, y, r * 1.9, r * 0.5, -0.35, 0, Math.PI); g.stroke();
    }
    g.restore();
  }

  // Walls, guides, rubbers, slingshot plastics, insert bases.
  bakeHardware() {
    const base = this.bakeParts.table.canvas.getContext('2d');
    base.save();
    base.setTransform(this.px, 0, 0, this.px, 0, 0);
    const g = base;
    // Insert bases (unlit).
    this.eachInsert((ins) => this.drawInsert(g, ins, 0));
    // Lane letters (rollover buttons).
    LANES.forEach((x, i) => {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.arc(x, 135, 9, 0, TAU); g.fill();
      g.font = `900 13px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(200,240,255,0.55)';
      g.fillText(LANE_LETTERS[i], x, 168);
    });
    // Drop target slots.
    for (const t of TARGETS) {
      g.fillStyle = '#05030f';
      g.fillRect(t.x - t.half - 2, t.y - 4, t.half * 2 + 4, 8);
    }
    // Bumper skirts.
    for (const b of BUMPERS) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath(); g.arc(b.x + 2, b.y + 3, 30, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(94,242,255,0.55)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(b.x, b.y, 28, 0, TAU); g.stroke();
    }
    // Slingshot plastics.
    for (const sl of SLINGS) {
      const grad = g.createLinearGradient(sl.a[0], sl.a[1], sl.c[0], sl.c[1]);
      grad.addColorStop(0, '#ff4fd8');
      grad.addColorStop(1, '#7b2cff');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(...sl.a); g.lineTo(...sl.b); g.lineTo(...sl.c); g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      const cx = (sl.a[0] + sl.b[0] + sl.c[0]) / 3, cy = (sl.a[1] + sl.b[1] + sl.c[1]) / 3;
      g.moveTo(...sl.a); g.lineTo(cx, cy); g.lineTo(...sl.b); g.closePath(); g.fill();
      // Star decal.
      g.fillStyle = 'rgba(255,240,170,0.8)';
      this.star(g, cx, cy, 7, 3);
      g.fill();
    }
    // Rails and guides from the real colliders, so art matches physics.
    for (const c of this.colliders) {
      if (c.layer !== 0 || c.kind === 'plunger' || c.kind === 'target' || c.kind === 'bumper') continue;
      this.drawCollider(g, c);
    }
    base.restore();
  }

  drawCollider(g, c) {
    const rubber = c.kind === 'rubber' || c.kind === 'sling' || c.kind === 'post';
    const gate = c.kind === 'gate';
    const width = Math.max(2, c.r * 2);
    const path = () => {
      g.beginPath();
      if (c.shape === 'seg') { g.moveTo(c.ax, c.ay); g.lineTo(c.bx, c.by); } else if (c.shape === 'arc') g.arc(c.x, c.y, c.R, c.a0, c.a1);
      else g.arc(c.x, c.y, c.r * 0.5, 0, TAU);
    };
    g.lineCap = 'round';
    if (c.shape === 'circle') {
      // Posts: metal stud in a rubber ring.
      g.fillStyle = rubber ? '#f6f3ff' : '#9aa6d8';
      g.beginPath(); g.arc(c.x, c.y, c.r, 0, TAU); g.fill();
      g.fillStyle = '#5b5f8c';
      g.beginPath(); g.arc(c.x, c.y, c.r * 0.55, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath(); g.arc(c.x - c.r * 0.2, c.y - c.r * 0.25, c.r * 0.22, 0, TAU); g.fill();
      return;
    }
    if (gate) {
      g.strokeStyle = 'rgba(220,230,255,0.85)';
      g.lineWidth = 2;
      path(); g.stroke();
      return;
    }
    if (rubber) {
      g.strokeStyle = c.kind === 'sling' ? '#fff6c8' : '#f2eeff';
      g.lineWidth = width;
      path(); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.15)';
      g.lineWidth = width * 0.4;
      path(); g.stroke();
      return;
    }
    // Metal rail with a neon edge.
    g.strokeStyle = '#121032';
    g.lineWidth = width + 5;
    path(); g.stroke();
    g.strokeStyle = '#8f9bd6';
    g.lineWidth = width + 1.5;
    path(); g.stroke();
    g.strokeStyle = '#e8eeff';
    g.lineWidth = Math.max(1, width * 0.35);
    path(); g.stroke();
    if (c.kind === 'wall') {
      g.strokeStyle = 'rgba(94,242,255,0.28)';
      g.lineWidth = width + 10;
      path(); g.stroke();
    }
  }

  star(g, x, y, R, r, points = 5) {
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      const rad = i % 2 ? r : R;
      g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    g.closePath();
  }

  bakeSprites() {
    const s = this.px;
    const P = this.bakeParts;
    // Chrome ball.
    P.ball = sprite(30, 30, s, (g) => {
      const r = 13;
      const grad = g.createRadialGradient(-4, -5, 1, 0, 0, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.25, '#e4e9ff');
      grad.addColorStop(0.6, '#8890b8');
      grad.addColorStop(0.85, '#3a3c64');
      grad.addColorStop(1, '#a6aee0');
      g.fillStyle = grad;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,79,216,0.25)';
      g.beginPath(); g.ellipse(2, 6, 8, 3.5, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath(); g.ellipse(-4.5, -5, 3, 2, -0.6, 0, TAU); g.fill();
    });
    P.shadow = sprite(36, 36, s, (g) => {
      const grad = g.createRadialGradient(0, 0, 2, 0, 0, 16);
      grad.addColorStop(0, 'rgba(0,0,0,0.5)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(-18, -18, 36, 36);
    });
    // Flipper, pointing along +x from its pivot.
    const L = FLIPPER.len, r0 = FLIPPER.r0, r1 = FLIPPER.r1;
    const capsule = (g, grow = 0) => {
      const a = Math.asin((r0 - r1) / L);
      g.beginPath();
      g.arc(0, 0, r0 + grow, Math.PI / 2 + a, Math.PI * 1.5 - a);
      g.arc(L, 0, r1 + grow, -Math.PI / 2 - a, Math.PI / 2 + a);
      g.closePath();
    };
    P.flipper = sprite(L + 40, 44, s, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.save(); g.translate(3, 4); capsule(g, 1); g.fill(); g.restore();
      capsule(g, 2.5);
      g.fillStyle = '#ff4fd8';
      g.fill();
      const body = g.createLinearGradient(0, -r0, 0, r0);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.5, '#e9e4ff');
      body.addColorStop(1, '#a99ee0');
      capsule(g);
      g.fillStyle = body;
      g.fill();
      g.fillStyle = '#5a3fb0';
      g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
      g.fillStyle = '#c9bcff';
      g.beginPath(); g.arc(0, 0, 2.2, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,79,216,0.6)';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(10, 0); g.lineTo(L - 6, 0); g.stroke();
    }, 18, 22);
    // Pop bumper caps: normal and lit.
    const cap = (lit) => (g) => {
      const R = 24;
      if (lit) {
        const halo = g.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.8);
        halo.addColorStop(0, 'rgba(94,242,255,0.75)');
        halo.addColorStop(1, 'rgba(94,242,255,0)');
        g.fillStyle = halo;
        g.beginPath(); g.arc(0, 0, R * 1.8, 0, TAU); g.fill();
      }
      g.fillStyle = lit ? '#e8fdff' : '#2c2a6e';
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
      const top = g.createRadialGradient(-6, -8, 2, 0, 0, R * 0.85);
      top.addColorStop(0, lit ? '#ffffff' : '#a9f6ff');
      top.addColorStop(0.5, lit ? '#7ff6ff' : '#2bb9e0');
      top.addColorStop(1, lit ? '#2bb9e0' : '#16437a');
      g.fillStyle = top;
      g.beginPath(); g.arc(0, 0, R * 0.82, 0, TAU); g.fill();
      g.fillStyle = lit ? '#fff7b0' : '#ffd34f';
      this.star(g, 0, 0, 11, 5);
      g.fill();
    };
    P.bumper = sprite(90, 90, s, cap(false));
    P.bumperLit = sprite(90, 90, s, cap(true));
    // Asteroid drop target.
    P.target = sprite(34, 22, s, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath(); g.ellipse(2, 4, 14, 7, 0, 0, TAU); g.fill();
      const rock = g.createLinearGradient(0, -8, 0, 8);
      rock.addColorStop(0, '#d9b48a');
      rock.addColorStop(0.5, '#8a6448');
      rock.addColorStop(1, '#4d3326');
      g.fillStyle = rock;
      g.beginPath();
      const pts = [[-13, -2], [-10, -7], [-3, -8], [5, -7], [12, -4], [13, 3], [8, 7], [-2, 8], [-11, 6]];
      g.moveTo(...pts[0]);
      for (const p of pts.slice(1)) g.lineTo(...p);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(40,20,10,0.55)';
      for (const [x, y, r] of [[-6, -1, 2.4], [3, 2, 2], [8, -3, 1.4]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(255,240,210,0.55)';
      g.beginPath(); g.ellipse(-3, -5, 5, 1.6, 0, 0, TAU); g.fill();
    });
    // Black hole accretion disk (rotates).
    P.disk = sprite(110, 110, s, (g) => {
      for (let i = 0; i < 3; i++) {
        g.strokeStyle = ['rgba(255,170,70,0.55)', 'rgba(255,79,216,0.4)', 'rgba(140,90,255,0.35)'][i];
        g.lineWidth = 4 - i;
        g.beginPath();
        for (let a = 0; a < TAU * 1.6; a += 0.1) {
          const r = 14 + a * 6 + i * 4;
          g.lineTo(Math.cos(a + i * 2.1) * r, Math.sin(a + i * 2.1) * r * 0.9);
        }
        g.stroke();
      }
      g.fillStyle = '#000';
      g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,200,120,0.9)';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 0, 13.5, 0, TAU); g.stroke();
    });
    // Comet Ramp: translucent plastic over the table.
    P.ramp = sprite(TABLE.w, TABLE.h, s, (g) => {
      const W = RAMP.walls;
      const channel = () => {
        g.beginPath();
        g.moveTo(RAMP.mouth[0], RAMP.entryY);
        g.lineTo(W.upOuter, RAMP.flareY);
        g.lineTo(W.upOuter, RAMP.turnY);
        g.arc(RAMP.outer.x, RAMP.turnY, RAMP.outer.R, Math.PI, TAU);
        g.lineTo(W.downOuter, RAMP.exitY);
        g.lineTo(W.downInner, RAMP.exitY);
        g.lineTo(W.downInner, RAMP.turnY);
        g.arc(RAMP.inner.x, RAMP.turnY, RAMP.inner.R, TAU, Math.PI, true);
        g.lineTo(W.upInner, RAMP.flareY);
        g.lineTo(RAMP.mouth[1], RAMP.entryY);
        g.closePath();
      };
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.save(); g.translate(5, 7); channel(); g.fill(); g.restore();
      const plastic = g.createLinearGradient(400, 330, 540, 660);
      plastic.addColorStop(0, 'rgba(79,184,255,0.34)');
      plastic.addColorStop(1, 'rgba(140,90,255,0.30)');
      g.fillStyle = plastic;
      channel(); g.fill();
      g.strokeStyle = 'rgba(190,235,255,0.9)';
      g.lineWidth = 3;
      g.lineJoin = 'round';
      channel(); g.stroke();
      // Chevrons up the ramp and down the return.
      g.strokeStyle = 'rgba(220,245,255,0.55)';
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      for (const y of [560, 535, 415]) {
        g.beginPath(); g.moveTo(RAMP.upX - 9, y + 6); g.lineTo(RAMP.upX, y); g.lineTo(RAMP.upX + 9, y + 6); g.stroke();
      }
      for (let y = 430; y < 640; y += 32) {
        g.beginPath(); g.moveTo(RAMP.downX - 8, y - 5); g.lineTo(RAMP.downX, y); g.lineTo(RAMP.downX + 8, y - 5); g.stroke();
      }
      g.font = `900 9px ${FONT}`;
      g.fillStyle = 'rgba(230,248,255,0.85)';
      g.textAlign = 'center';
      g.save(); g.translate(RAMP.outer.x, RAMP.turnY - RAMP.outer.R + 9); g.fillText('COMET', 0, 0); g.restore();
      g.font = `900 11px ${FONT}`;
      g.save(); g.translate(RAMP.upX, 470); g.rotate(-Math.PI / 2); g.fillText('COMET RAMP', 0, 4); g.restore();
    }, 0, 0);
    // A white-hot spark.
    P.spark = this.glow('#ffe7a8', 7);
  }

  // ------------------------------------------------------------ inserts

  // Every lamp: { id, kind, x, y, color, ... }. Index = lamp slot.
  eachInsert(fn) {
    if (!this.inserts) {
      const list = [];
      PLANETS.forEach((p, i) => list.push({ kind: 'planet', i, ...INSERTS.planets[i], color: p.color }));
      SHOTS.forEach((sh) => list.push({ kind: 'arrow', id: sh.id, ...sh.arrow, color: SHOT_COLORS[sh.id] }));
      INSERTS.bonusX.forEach((b) => list.push({ kind: 'bonusX', ...b, color: '#ffd34f' }));
      list.push({ kind: 'round', id: 'shootAgain', ...INSERTS.shootAgain, color: '#ff4f6a', r: 11 });
      list.push({ kind: 'shield', id: 'ballSave', ...INSERTS.ballSave, color: '#4ff3ff' });
      list.push({ kind: 'up', id: 'kickback', ...INSERTS.kickback, color: '#4ff3ff' });
      list.push({ kind: 'up', id: 'kickback', ...INSERTS.kickbackRight, color: '#4ff3ff' });
      list.push({ kind: 'round', id: 'lock', ...INSERTS.lock, color: '#b28cff', r: 9 });
      list.push({ kind: 'round', id: 'extraBall', ...INSERTS.extraBall, color: '#ff8a3d', r: 8 });
      list.push({ kind: 'star', id: 'frenzy', ...INSERTS.frenzy, color: '#ffb35c' });
      list.push({ kind: 'star', id: 'jackpot', ...INSERTS.jackpot, color: '#fff2a8' });
      LANES.forEach((x, i) => list.push({ kind: 'lane', i, x, y: 135, color: '#5ef2ff' }));
      list.forEach((ins, slot) => { ins.slot = slot; });
      this.inserts = list;
    }
    this.inserts.forEach(fn);
  }

  insertShape(g, ins) {
    g.beginPath();
    switch (ins.kind) {
      case 'planet': g.arc(ins.x, ins.y, 14, 0, TAU); break;
      case 'arrow': {
        const { x, y } = ins;
        g.moveTo(x, y - 16); g.lineTo(x + 12, y + 2); g.lineTo(x + 5, y + 2); g.lineTo(x + 5, y + 12);
        g.lineTo(x - 5, y + 12); g.lineTo(x - 5, y + 2); g.lineTo(x - 12, y + 2); g.closePath();
        break;
      }
      case 'bonusX': g.arc(ins.x, ins.y, 9, 0, TAU); break;
      case 'round': g.arc(ins.x, ins.y, ins.r, 0, TAU); break;
      case 'shield': {
        const { x, y } = ins;
        g.moveTo(x, y - 10); g.quadraticCurveTo(x + 11, y - 9, x + 10, y - 2); g.quadraticCurveTo(x + 8, y + 7, x, y + 11);
        g.quadraticCurveTo(x - 8, y + 7, x - 10, y - 2); g.quadraticCurveTo(x - 11, y - 9, x, y - 10); g.closePath();
        break;
      }
      case 'up': {
        const { x, y } = ins;
        g.moveTo(x, y - 12); g.lineTo(x + 9, y + 2); g.lineTo(x - 9, y + 2); g.closePath();
        g.moveTo(x, y); g.lineTo(x + 9, y + 14); g.lineTo(x - 9, y + 14); g.closePath();
        break;
      }
      case 'star': this.star(g, ins.x, ins.y, 11, 5); break;
      case 'lane': g.arc(ins.x, ins.y, 7, 0, TAU); break;
      default: break;
    }
  }

  // Unlit (lit = 0) is painted into the table; lit sprites are drawn on top.
  drawInsert(g, ins, lit) {
    const col = ins.color;
    g.save();
    this.insertShape(g, ins);
    if (!lit) {
      g.fillStyle = mix(col, '#140a30', 0.72);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = 1.2;
      g.stroke();
    } else {
      const grad = g.createRadialGradient(ins.x - 3, ins.y - 4, 1, ins.x, ins.y, 16);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.45, mix(col, '#ffffff', 0.35));
      grad.addColorStop(1, col);
      g.fillStyle = grad;
      g.fill();
    }
    g.restore();
    // Little labels / pictures inside some inserts.
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (ins.kind === 'bonusX') {
      g.font = `900 8px ${FONT}`;
      g.fillStyle = lit ? '#3a2500' : 'rgba(255,230,150,0.6)';
      g.fillText(`${ins.n}X`, ins.x, ins.y + 0.5);
    } else if (ins.kind === 'planet') {
      const p = PLANETS[ins.i];
      g.fillStyle = lit ? mix(p.color, '#ffffff', 0.2) : mix(p.color, '#140a30', 0.45);
      g.beginPath(); g.arc(ins.x, ins.y, 8, 0, TAU); g.fill();
      if (p.id === 'saturn') {
        g.strokeStyle = lit ? '#fff7d0' : 'rgba(255,240,180,0.45)';
        g.lineWidth = 1.6;
        g.beginPath(); g.ellipse(ins.x, ins.y, 12, 3.5, -0.3, 0, TAU); g.stroke();
      }
    } else if (ins.id === 'shootAgain' || ins.id === 'extraBall') {
      g.font = `900 ${ins.id === 'shootAgain' ? 9 : 7}px ${FONT}`;
      g.fillStyle = lit ? '#3a0010' : 'rgba(255,200,210,0.5)';
      g.fillText(ins.id === 'shootAgain' ? 'SA' : 'EB', ins.x, ins.y + 0.5);
    }
    g.restore();
  }

  bakeLampSprites() {
    const s = this.px;
    this.lampSprites = [];
    this.eachInsert((ins) => {
      const R = 34;
      this.lampSprites[ins.slot] = sprite(R * 2, R * 2, s, (g) => {
        const halo = g.createRadialGradient(0, 0, 4, 0, 0, R);
        halo.addColorStop(0, rgba(ins.color, 0.55));
        halo.addColorStop(1, rgba(ins.color, 0));
        g.fillStyle = halo;
        g.fillRect(-R, -R, R * 2, R * 2);
        g.translate(-ins.x, -ins.y);
        this.drawInsert(g, ins, 1);
      });
    });
  }

  // ------------------------------------------------------------ DMD panel

  bakeDmdPanel() {
    const D = this.layout.dmd;
    const dpr = this.dpr;
    const pad = Math.max(6, D.w * 0.025);
    // Frame.
    const frame = document.createElement('canvas');
    frame.width = Math.ceil((D.w + pad * 2) * dpr);
    frame.height = Math.ceil((D.h + pad * 2) * dpr);
    const g = frame.getContext('2d');
    g.scale(dpr, dpr);
    const W = D.w + pad * 2, H = D.h + pad * 2;
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    const body = g.createLinearGradient(0, 0, 0, H);
    body.addColorStop(0, '#3a2a7a');
    body.addColorStop(1, '#140a36');
    g.fillStyle = body;
    rr(0, 0, W, H, pad * 1.4); g.fill();
    g.strokeStyle = 'rgba(160,140,255,0.65)';
    g.lineWidth = 2;
    rr(1, 1, W - 2, H - 2, pad * 1.4); g.stroke();
    g.fillStyle = '#070308';
    rr(pad - 2, pad - 2, D.w + 4, D.h + 4, 4); g.fill();
    // Dot mask: opaque black with round holes where the dots shine through.
    const mask = document.createElement('canvas');
    mask.width = Math.ceil(D.w * dpr);
    mask.height = Math.ceil(D.h * dpr);
    const m = mask.getContext('2d');
    m.fillStyle = '#070308';
    m.fillRect(0, 0, mask.width, mask.height);
    m.globalCompositeOperation = 'destination-out';
    const cw = mask.width / DMD_W, chh = mask.height / DMD_H;
    const r = Math.min(cw, chh) * 0.42;
    m.beginPath();
    for (let y = 0; y < DMD_H; y++) {
      for (let x = 0; x < DMD_W; x++) {
        m.moveTo((x + 0.5) * cw + r, (y + 0.5) * chh);
        m.arc((x + 0.5) * cw, (y + 0.5) * chh, r, 0, TAU);
      }
    }
    m.fill();
    this.bakeParts.dmdFrame = { canvas: frame, x: D.x - pad, y: D.y - pad, w: W, h: H };
    this.bakeParts.dmdMask = mask;
  }

  // Landscape only: cartoon backglass art under the DMD.
  bakeBackglass() {
    const G = this.layout.glass;
    this.bakeParts.glass = null;
    if (!G) return;
    const dpr = this.dpr;
    const c = document.createElement('canvas');
    c.width = Math.ceil(G.w * dpr);
    c.height = Math.ceil(G.h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const W = G.w, H = G.h, u = W / 400;
    g.save();
    g.beginPath(); g.roundRect(0, 0, W, H, 22 * u); g.clip();
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#120a44');
    sky.addColorStop(0.6, '#3a1170');
    sky.addColorStop(1, '#5a1466');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const neb = (x, y, r, col, a) => {
      const n = g.createRadialGradient(x, y, 0, x, y, r);
      n.addColorStop(0, rgba(col, a)); n.addColorStop(1, rgba(col, 0));
      g.fillStyle = n; g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    neb(W * 0.2, H * 0.3, W * 0.6, '#ff4fd8', 0.3);
    neb(W * 0.85, H * 0.75, W * 0.6, '#2fd3ff', 0.25);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + hash(i + 50) * 0.6})`;
      g.beginPath(); g.arc(hash(i) * W, hash(i + 300) * H, (0.4 + hash(i + 600) * 1.3) * u, 0, TAU); g.fill();
    }
    // Big ringed planet.
    const px = W * 0.42, py = H * 0.62, pr = 92 * u;
    g.save();
    g.translate(px, py); g.rotate(-0.32);
    g.strokeStyle = 'rgba(255,225,160,0.9)'; g.lineWidth = 9 * u;
    g.beginPath(); g.ellipse(0, 0, pr * 1.75, pr * 0.42, 0, Math.PI, TAU); g.stroke();
    const pg = g.createRadialGradient(-pr * 0.4, -pr * 0.45, pr * 0.1, 0, 0, pr);
    pg.addColorStop(0, '#fff3c4'); pg.addColorStop(0.45, '#ffb35c'); pg.addColorStop(1, '#a33d2a');
    g.fillStyle = pg; g.beginPath(); g.arc(0, 0, pr, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(0, i * pr * 0.32, pr * 0.98, pr * 0.07, 0, 0, TAU); g.fill(); }
    // A friendly face.
    g.fillStyle = '#3a1020';
    g.beginPath(); g.ellipse(-pr * 0.3, -pr * 0.08, pr * 0.07, pr * 0.11, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(pr * 0.3, -pr * 0.08, pr * 0.07, pr * 0.11, 0, 0, TAU); g.fill();
    g.strokeStyle = '#3a1020'; g.lineWidth = 5 * u; g.lineCap = 'round';
    g.beginPath(); g.arc(0, pr * 0.12, pr * 0.28, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = 'rgba(255,110,150,0.5)';
    g.beginPath(); g.arc(-pr * 0.5, pr * 0.15, pr * 0.1, 0, TAU); g.fill();
    g.beginPath(); g.arc(pr * 0.5, pr * 0.15, pr * 0.1, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,225,160,0.9)'; g.lineWidth = 9 * u;
    g.beginPath(); g.ellipse(0, 0, pr * 1.75, pr * 0.42, 0, 0, Math.PI); g.stroke();
    g.restore();
    // Little planets.
    [[0.12, 0.22, 20, '#ff6b4a'], [0.86, 0.3, 26, '#4fb8ff'], [0.82, 0.86, 16, '#ff7ad9'], [0.14, 0.88, 13, '#8dff5c']].forEach(([x, y, r, col]) => {
      const gg = g.createRadialGradient(W * x - r * 0.4 * u, H * y - r * 0.4 * u, 1, W * x, H * y, r * u);
      gg.addColorStop(0, mix(col, '#ffffff', 0.6)); gg.addColorStop(1, mix(col, '#1a0638', 0.5));
      g.fillStyle = gg; g.beginPath(); g.arc(W * x, H * y, r * u, 0, TAU); g.fill();
    });
    // A chrome pinball with a comet tail.
    const bx = W * 0.78, by = H * 0.52, br = 22 * u;
    const tail = g.createLinearGradient(bx - 150 * u, by + 70 * u, bx, by);
    tail.addColorStop(0, 'rgba(255,79,216,0)'); tail.addColorStop(1, 'rgba(143,246,255,0.85)');
    g.fillStyle = tail;
    g.beginPath(); g.moveTo(bx - 160 * u, by + 80 * u); g.lineTo(bx - br * 0.7, by - br * 0.7); g.lineTo(bx + br * 0.7, by + br * 0.7); g.closePath(); g.fill();
    const bg = g.createRadialGradient(bx - br * 0.35, by - br * 0.4, 1, bx, by, br);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#c3c9ef'); bg.addColorStop(1, '#4a4d7c');
    g.fillStyle = bg; g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill();
    // Title.
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `italic 900 ${40 * u}px ${FONT}`;
    g.fillStyle = 'rgba(20,0,40,0.6)';
    g.fillText('PINBALL PLANET', W / 2 + 3 * u, 42 * u + 4 * u);
    const tg = g.createLinearGradient(0, 20 * u, 0, 64 * u);
    tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.5, '#ffd34f'); tg.addColorStop(1, '#ff8a3d');
    g.fillStyle = tg;
    g.fillText('PINBALL PLANET', W / 2, 42 * u);
    g.font = `800 ${15 * u}px ${FONT}`;
    g.fillStyle = 'rgba(230,240,255,0.9)';
    g.fillText('Visit all five planets!', W / 2, H - 22 * u);
    g.restore();
    g.strokeStyle = 'rgba(160,140,255,0.7)';
    g.lineWidth = 2;
    g.beginPath(); g.roundRect(1, 1, W - 2, H - 2, 22 * u); g.stroke();
    this.bakeParts.glass = { canvas: c, ...G };
  }

  // ------------------------------------------------------------ effects

  spawn(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  sparks(x, y, n, color, speed = 420, life = 0.35) {
    if (this.reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
      this.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.5), max: life, color, size: 4 });
    }
  }

  ring(x, y, color, r = 40, life = 0.35) {
    this.spawn({ kind: 'ring', x, y, vx: 0, vy: 0, life, max: life, color, size: r });
  }

  popup(x, y, points) {
    if (this.popups.length > 10) this.popups.shift();
    const text = points >= 1e6 ? `${(points / 1e6).toFixed(points % 1e6 ? 1 : 0)}M` : points >= 1000 ? `${Math.round(points / 1000)}K` : `${points}`;
    this.popups.push({ x, y, text, life: 0.9, big: points >= 100000 });
  }

  handleEvents(events, world) {
    for (const e of events) {
      switch (e.type) {
        case 'bumper':
          this.ring(e.x, e.y, '#5ef2ff', 46, 0.3);
          this.sparks(e.x, e.y, 6, '#bff8ff', 380);
          break;
        case 'sling':
          this.sparks(e.x, e.y, 8, '#ffd0f4', 360);
          break;
        case 'target':
          this.sparks(e.x, e.y, 14, '#ffb35c', 320, 0.5);
          this.ring(e.x, e.y, '#ffb35c', 30, 0.3);
          break;
        case 'flipHit':
          if (e.speed > 900) this.sparks(e.x, e.y + 8, 5, '#ffffff', 300, 0.25);
          break;
        case 'hit':
          if (e.speed > 1400) this.sparks(e.x, e.y, 3, '#c9d6ff', 240, 0.2);
          break;
        case 'holeIn':
          this.ring(e.x, e.y, '#ffb347', 60, 0.5);
          this.ring(e.x, e.y, '#b28cff', 90, 0.7);
          break;
        case 'holeOut':
          this.sparks(e.x, e.y, 12, '#ffd08a', 300, 0.4);
          break;
        case 'kickback':
          this.sparks(e.x, 1000, 14, '#5ef2ff', 420, 0.4);
          break;
        case 'nudge':
          if (!this.reduced) this.cam.vx -= e.dir * 320;
          if (e.result === 'danger') this.tiltFlash = Math.max(this.tiltFlash, 0.5);
          break;
        case 'tilt':
          this.tiltFlash = 1.2;
          if (!this.reduced) this.cam.vy += 260;
          break;
        case 'score':
          if (e.points >= 2500) this.popup(e.x, e.y - 18, e.points);
          break;
        case 'callout':
          if (['jackpot', 'super', 'multiball', 'tour', 'extraBall', 'skill'].includes(e.kind)) this.flashAll = this.reduced ? 0.4 : 1;
          break;
        case 'drain':
          break;
        default: break;
      }
    }
    // Ball trails.
    for (const b of world.balls) {
      let t = this.trails.get(b.id);
      if (!t) { t = { xs: new Float32Array(TRAIL), ys: new Float32Array(TRAIL), n: 0, i: 0 }; this.trails.set(b.id, t); }
    }
    if (this.trails.size > world.balls.length + 4) {
      for (const id of this.trails.keys()) if (!world.balls.some((b) => b.id === id)) this.trails.delete(id);
    }
  }

  update(dt, world) {
    this.time += dt;
    // Camera spring (table jolt on nudge / tilt).
    const c = this.cam;
    c.vx += (-c.x * 420 - c.vx * 22) * dt;
    c.vy += (-c.y * 420 - c.vy * 22) * dt;
    c.x += c.vx * dt; c.y += c.vy * dt;
    this.tiltFlash = Math.max(0, this.tiltFlash - dt);
    this.flashAll = Math.max(0, this.flashAll - dt * 1.4);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt;
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y -= 40 * dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
    if (world) {
      for (const b of world.balls) {
        const t = this.trails.get(b.id);
        if (!t || b.held) continue;
        t.xs[t.i] = b.x; t.ys[t.i] = b.y;
        t.i = (t.i + 1) % TRAIL;
        t.n = Math.min(TRAIL, t.n + 1);
      }
      this.updateLamps(dt, world);
    }
  }

  // Lamp targets from the rules; lamps fade like incandescent bulbs.
  updateLamps(dt, world) {
    const r = world.rules;
    const t = this.time;
    const blink = (hz, phase = 0) => (Math.floor(t * hz * 2 + phase) % 2 === 0 ? 1 : 0);
    const attract = world.state === 'attract' || world.state === 'idle' || world.state === 'over';
    const playing = world.state === 'play' || world.state === 'bonus';
    const target = (ins) => {
      if (attract) {
        // Light show: a sweep up the table plus twinkles.
        const phase = (ins.y / TABLE.h) * 3 - t * 1.4;
        return (Math.sin(phase * Math.PI) > 0.55 ? 1 : 0) || (hash(ins.slot + Math.floor(t * 3)) > 0.93 ? 1 : 0);
      }
      if (!playing || r.tilted) return 0;
      switch (ins.kind) {
        case 'planet': return r.planetsVisited[ins.i] ? 1 : r.planetsLit[ins.i] ? blink(2, ins.i * 0.3) : 0;
        case 'arrow': {
          const p = PLANETS.findIndex((pl) => pl.shot === ins.id);
          if (r.multiball && JACKPOT_SHOTS.includes(ins.id)) return blink(4);
          if (ins.id === 'blackHole' && (r.lockLit || r.superLit || r.extraBallLit)) return blink(3);
          return p >= 0 && r.planetsLit[p] ? blink(2) : 0;
        }
        case 'bonusX': return r.bonusX >= ins.n ? 1 : 0;
        case 'lane': {
          const inShooter = !!world.shooterBall();
          if ((r.skill.ready && inShooter) || r.skill.active) return ins.i === r.skill.lane ? blink(4) : r.lanes[ins.i] ? 1 : 0;
          return r.lanes[ins.i] ? 1 : 0;
        }
        default: break;
      }
      switch (ins.id) {
        case 'shootAgain': return r.extraBalls > 0 ? 1 : r.ballSave > 0 ? blink(r.ballSave < 3 ? 4 : 2) : 0;
        case 'ballSave': return r.ballSave > 0 ? blink(r.ballSave < 3 ? 4 : 2) : 0;
        case 'kickback': return r.kickbackLit ? 1 : 0;
        case 'lock': return r.lockLit ? blink(2) : r.locked > 0 ? 1 : 0;
        case 'extraBall': return r.extraBallLit ? blink(2) : 0;
        case 'frenzy': return r.frenzy > 0 ? blink(r.frenzy < 4 ? 5 : 2.5) : r.targetsDown.filter(Boolean).length / 3 * 0.6;
        case 'jackpot': return r.multiball ? blink(4) : 0;
        default: return 0;
      }
    };
    const rise = Math.min(1, dt * 22), fall = Math.min(1, dt * 9);
    this.eachInsert((ins) => {
      let v = target(ins);
      if (this.flashAll > 0 && playing) v = Math.max(v, blink(6) * this.flashAll);
      const cur = this.lamps[ins.slot];
      this.lamps[ins.slot] = cur + (v - cur) * (v > cur ? rise : fall);
    });
  }

  // ------------------------------------------------------------ draw

  draw(world, dmd, { attract = false } = {}) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.baked) return;
    const L = this.layout, B = this.baked, s = L.s;
    const ox = L.tx + this.cam.x, oy = L.ty + this.cam.y;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    // Table art.
    ctx.drawImage(B.table.canvas, 0, 0, TABLE.w, TABLE.h);
    if (world) {
      this.drawLamps(ctx);
      this.drawDevices(ctx, world);
      this.drawBalls(ctx, world, 0);
      ctx.drawImage(B.ramp.canvas, 0, 0, TABLE.w, TABLE.h);
      this.drawBalls(ctx, world, 1);
      this.drawFlippers(ctx, world);
      this.drawParticles(ctx);
    }
    if (this.tiltFlash > 0) {
      ctx.fillStyle = `rgba(255,40,60,${Math.min(0.35, this.tiltFlash * 0.3)})`;
      ctx.fillRect(0, 0, TABLE.w, TABLE.h);
    }
    // DMD and backglass.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawDmd(ctx, dmd);
    if (B.glass) this.drawBackglass(ctx, B.glass, world);
  }

  drawLamps(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    this.eachInsert((ins) => {
      const v = this.lamps[ins.slot];
      if (v < 0.02) return;
      ctx.globalAlpha = Math.min(1, v);
      drawSprite(ctx, this.lampSprites[ins.slot], ins.x, ins.y);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawDevices(ctx, world) {
    const B = this.baked;
    const f = world.flash;
    // Black hole disk and the balls waiting in it.
    ctx.save();
    ctx.translate(HOLE.x, HOLE.y);
    ctx.rotate(this.reduced ? 0 : -this.time * 1.6);
    ctx.globalAlpha = 0.85 + f.hole * 0.15;
    drawSprite(ctx, B.disk, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
    const locked = world.rules.locked;
    for (let i = 0; i < locked; i++) {
      const a = this.time * 2.4 + i * Math.PI;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(B.ball.canvas, HOLE.x + Math.cos(a) * 26 - 8, HOLE.y + Math.sin(a) * 20 - 8, 16, 16);
    }
    ctx.globalAlpha = 1;
    // Asteroid targets (standing ones).
    for (let i = 0; i < world.targets.length; i++) {
      const c = world.targets[i];
      if (c.enabled) drawSprite(ctx, B.target, (c.ax + c.bx) / 2, c.ay);
    }
    // Pop bumpers.
    BUMPERS.forEach((b, i) => {
      const lit = f.bumpers[i] > 0.05;
      const pulse = 1 + f.bumpers[i] * 0.08;
      if (lit) {
        ctx.globalAlpha = Math.min(1, f.bumpers[i] * 1.5);
        ctx.drawImage(B.bumperLit.canvas, b.x - 45 * pulse, b.y - 45 * pulse, 90 * pulse, 90 * pulse);
        ctx.globalAlpha = 1;
      } else drawSprite(ctx, B.bumper, b.x, b.y);
    });
    // Slingshot flashes.
    SLINGS.forEach((sl, i) => {
      if (f.slings[i] <= 0.02) return;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = f.slings[i];
      const g = this.glow('#ff8ae8', 60);
      drawSprite(ctx, g, (sl.a[0] + sl.c[0]) / 2, (sl.a[1] + sl.c[1]) / 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    });
    // Spinner: a flat plate seen edge-on as it turns.
    const a = world.spinner.angle * TAU;
    const c = Math.cos(a);
    const h = 2 + Math.abs(c) * 9;
    ctx.fillStyle = c > 0 ? '#ffd9a8' : '#b2763c';
    ctx.fillRect(SPINNER.x - SPINNER.half, SPINNER.y - h / 2, SPINNER.half * 2, h);
    ctx.fillStyle = c > 0 ? '#ff8a3d' : '#5c3412';
    ctx.fillRect(SPINNER.x - SPINNER.half + 4, SPINNER.y - h / 4, SPINNER.half * 2 - 8, h / 2);
    ctx.fillStyle = '#e8eeff';
    ctx.fillRect(SPINNER.x - SPINNER.half - 4, SPINNER.y - 1.5, 4, 3);
    ctx.fillRect(SPINNER.x + SPINNER.half, SPINNER.y - 1.5, 4, 3);
    // Plunger: a spring and knob that compress as it is pulled.
    const tip = world.plungerTip.ay;
    const x0 = PLUNGER.laneX0 + 3, x1 = PLUNGER.laneX1 - 3;
    ctx.strokeStyle = '#c9d3ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const coils = 7;
    for (let i = 0; i <= coils * 2; i++) {
      const y = tip + 4 + ((TABLE.h - tip - 4) * i) / (coils * 2);
      ctx.lineTo(i % 2 ? x1 - 4 : x0 + 4, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#ff4fd8';
    ctx.fillRect(x0, tip - 2, x1 - x0, 6);
    ctx.fillStyle = '#ffd0f4';
    ctx.fillRect(x0, tip - 2, x1 - x0, 2);
    if (world.plunger.held) {
      // Power meter beside the lane.
      const p = world.plunger.pull;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(PLUNGER.laneX0 - 16, 900, 8, 150);
      const grad = this.meterGrad || (this.meterGrad = (() => {
        const gg = ctx.createLinearGradient(0, 1050, 0, 900);
        gg.addColorStop(0, '#5ef2ff'); gg.addColorStop(0.45, '#ffd34f'); gg.addColorStop(1, '#ff4f6a');
        return gg;
      })());
      ctx.fillStyle = grad;
      ctx.fillRect(PLUNGER.laneX0 - 15, 1050 - 148 * p, 6, 148 * p);
    }
    // Kickback flash.
    if (f.kickback > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = f.kickback;
      drawSprite(ctx, this.glow('#5ef2ff', 50), f.kickbackX, 1000);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawBalls(ctx, world, layer) {
    const B = this.baked;
    for (const b of world.balls) {
      if (b.layer !== layer) continue;
      if (b.held) {
        // Spiralling inside the Black Hole.
        const k = Math.max(0, Math.min(1, b.held.t / 1.3));
        const a = this.time * 9;
        const r = 4 + 8 * k;
        ctx.globalAlpha = 0.5 + 0.5 * k;
        ctx.drawImage(B.ball.canvas, HOLE.x + Math.cos(a) * r - 10 * k, HOLE.y + Math.sin(a) * r - 10 * k, 20 * k + 6, 20 * k + 6);
        ctx.globalAlpha = 1;
        continue;
      }
      // Trail (only when moving fast).
      const t = this.trails.get(b.id);
      const speed = Math.hypot(b.vx, b.vy);
      if (t && speed > 900 && !this.reduced) {
        ctx.globalCompositeOperation = 'lighter';
        const g = this.glow(layer ? '#7fd4ff' : '#c9a8ff', 12);
        for (let k = 1; k < t.n; k++) {
          const idx = (t.i - 1 - k + TRAIL * 2) % TRAIL;
          ctx.globalAlpha = ((t.n - k) / t.n) * 0.35 * Math.min(1, (speed - 900) / 1500);
          drawSprite(ctx, g, t.xs[idx], t.ys[idx]);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      const lift = layer ? 6 : 3;
      drawSprite(ctx, B.shadow, b.x + lift, b.y + lift + 2);
      drawSprite(ctx, B.ball, b.x, b.y);
    }
  }

  drawFlippers(ctx, world) {
    const B = this.baked;
    for (const f of world.flippers) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      if (f.side === 'right') ctx.scale(1, -1);
      drawSprite(ctx, B.flipper, 0, 0);
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    if (this.particles.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        const k = p.life / p.max;
        ctx.globalAlpha = Math.min(1, k * 1.4);
        if (p.kind === 'ring') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * k + 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - k * 0.7), 0, TAU);
          ctx.stroke();
        } else {
          const g = this.glow(p.color, 7);
          drawSprite(ctx, g, p.x, p.y);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.popups.length) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of this.popups) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.font = p.big ? POP_BIG : POP_SMALL;
        ctx.fillStyle = 'rgba(20,0,40,0.7)';
        ctx.fillText(p.text, p.x + 1, p.y + 1.5);
        ctx.fillStyle = p.big ? '#ffe27a' : '#ffffff';
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawBackglass(ctx, G, world) {
    ctx.drawImage(G.canvas, G.x, G.y, G.w, G.h);
    // Chasing bulbs round the frame; faster in multiball.
    const n = 28;
    const speed = world && world.rules.multiball ? 14 : 5;
    const head = (this.time * speed) % n;
    const glow = this.glowCss || (this.glowCss = this.cssGlow('#ffd34f', 9));
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const per = 2 * (G.w + G.h);
      let d = t * per, x, y;
      if (d < G.w) { x = G.x + d; y = G.y; } else if ((d -= G.w) < G.h) { x = G.x + G.w; y = G.y + d; } else if ((d -= G.h) < G.w) { x = G.x + G.w - d; y = G.y + G.h; } else { d -= G.w; x = G.x; y = G.y + G.h - d; }
      const k = (head - i + n) % n;
      ctx.globalAlpha = this.reduced ? 0.5 : k < 4 ? 1 - k * 0.22 : 0.18;
      ctx.drawImage(glow, x - 9, y - 9, 18, 18);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // A glow sprite in CSS pixels (for the panels outside the table).
  cssGlow(color, r) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(r * 2 * this.dpr);
    const g = c.getContext('2d');
    g.scale(this.dpr, this.dpr);
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, rgba(color, 1));
    grad.addColorStop(0.3, rgba(color, 0.6));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, r * 2, r * 2);
    return c;
  }

  drawDmd(ctx, dmd) {
    const B = this.baked;
    const D = this.layout.dmd;
    const F = B.dmdFrame;
    ctx.drawImage(F.canvas, F.x, F.y, F.w, F.h);
    if (!dmd) return;
    const buf = dmd.buf, px = this.dmdPixels;
    for (let i = 0; i < buf.length; i++) px[i] = DMD_LUT[buf[i]];
    this.dmdCtx.putImageData(this.dmdImage, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.dmdCanvas, D.x, D.y, D.w, D.h);
    ctx.drawImage(B.dmdMask, D.x, D.y, D.w, D.h);
    // Soft glow over the dots.
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28;
    ctx.drawImage(this.dmdCanvas, D.x - 2, D.y - 2, D.w + 4, D.h + 4);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
