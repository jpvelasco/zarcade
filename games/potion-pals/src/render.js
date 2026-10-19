// Drawing the treehouse. The whole static scene (tree, rooms, hearth, cauldron
// body) is baked into one offscreen canvas when the window size or the number
// of rooms changes; every frame then blits that and draws only the things that
// move: fire, liquid, bubbles, pals and particles.
import { layout, potSlots } from './layout.js';
import { ROOMS } from './alchemy.js';
import { ITEM, PAL } from './recipes.js';
import { Sprites, makeCanvas, INK } from './art.js';
import { liftOf } from './pals.js';

export const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const MAX_PARTICLES = 180;
const EMPTY_LIQUID = '#2f5a4a';

const WALL = ['#6b4a3a', '#5e4436', '#6f4e3c', '#4f3a30', '#5a4a52', '#5e4458'];
const PAPER = ['#b8905e', '#7fb07a', '#7fa0cf', '#a98f6e', '#9183c4', '#c086a8'];
const RUG = ['#c0527a', '#4a9a86', '#5a78c0', '#a86a3a', '#7a5ac0', '#c05a9a'];

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(list) {
  if (!list.length) return EMPTY_LIQUID;
  let r = 0, g = 0, b = 0;
  for (const hex of list) {
    const c = hexRgb(hex);
    r += c[0]; g += c[1]; b += c[2];
  }
  const n = list.length;
  return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
}

function parse(color) {
  if (color[0] === '#') return hexRgb(color);
  const m = color.match(/-?\d+/g);
  return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
}

function lerpColor(a, b, k) {
  const x = parse(a), y = parse(b);
  return `rgb(${Math.round(x[0] + (y[0] - x[0]) * k)},${Math.round(x[1] + (y[1] - x[1]) * k)},${Math.round(x[2] + (y[2] - x[2]) * k)})`;
}

function lighten(color, k) {
  const c = parse(color);
  return `rgb(${Math.round(c[0] + (255 - c[0]) * k)},${Math.round(c[1] + (255 - c[1]) * k)},${Math.round(c[2] + (255 - c[2]) * k)})`;
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

function bowl(ctx, c) {
  const { x, y, r } = c;
  ctx.beginPath();
  ctx.moveTo(x - r, y - r * 0.5);
  ctx.bezierCurveTo(x - r * 1.08, y + r * 0.62, x - r * 0.62, y + r, x, y + r);
  ctx.bezierCurveTo(x + r * 0.62, y + r, x + r * 1.08, y + r * 0.62, x + r, y - r * 0.5);
  ctx.closePath();
}

// The hollow the liquid sits in: inset from the pot so its iron walls stay
// dark, and shallow so the fire below still shows through.
function innerBowl(ctx, c) {
  const { x, y, r } = c;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.9, y - r * 0.5);
  ctx.bezierCurveTo(x - r * 0.95, y + r * 0.34, x - r * 0.56, y + r * 0.62, x, y + r * 0.62);
  ctx.bezierCurveTo(x + r * 0.56, y + r * 0.62, x + r * 0.95, y + r * 0.34, x + r * 0.9, y - r * 0.5);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.sprites = new Sprites({ dpr: this.dpr });
    this.particles = [];
    this.bubbles = [];
    this.liquid = EMPTY_LIQUID;
    this.target = EMPTY_LIQUID;
    this.fill = 0;
    this.heat = 0;
    this.t = 0;
    this.rooms = 1;
    this.scene = null;
    this.rim = null;
    this.hover = null;
    this.W = 1;
    this.H = 1;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(240, Math.round(rect.width));
    const H = Math.max(200, Math.round(rect.height));
    this.W = W;
    this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.lay = layout(W, H);
    this.slots = potSlots(this.lay);
    this.scene = null;
  }

  setRooms(n) {
    if (n === this.rooms) return;
    this.rooms = n;
    this.scene = null;
  }

  // ----------------------------------------------------------- static scene

  ensureScene() {
    if (this.scene) return false;
    const { W, H } = this;
    const c = makeCanvas(Math.round(W * this.dpr), Math.round(H * this.dpr));
    const ctx = c.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.bakeScene(ctx);
    this.scene = c;
    this.rim = this.bakeRim();
    return true;
  }

  bakeScene(ctx) {
    const { W, H, lay } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1d1238');
    sky.addColorStop(0.45, '#32204c');
    sky.addColorStop(1, '#1a1026');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // stars and a moon
    for (let i = 0; i < 130; i++) {
      const x = ((i * 9301 + 49297) % 233280) / 233280 * W;
      const y = ((i * 4253 + 1973) % 104729) / 104729 * H * 0.86;
      const r = 0.6 + ((i * 7) % 5) * 0.3;
      ctx.fillStyle = i % 9 === 0 ? 'rgba(255,230,180,0.95)' : 'rgba(255,245,210,0.8)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (i % 11 === 0) {
        ctx.strokeStyle = 'rgba(255,245,210,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - r * 3, y); ctx.lineTo(x + r * 3, y);
        ctx.moveTo(x, y - r * 3); ctx.lineTo(x, y + r * 3);
        ctx.stroke();
      }
    }
    // The moon hangs in the open sky above the workshop floor, clear of the
    // rooms and off to one side of the cauldron.
    const moonR = Math.round(Math.min(46, lay.hearth.h * 0.2, W * 0.07));
    const moonX = Math.round(Math.max(moonR * 1.4, W * 0.13));
    const moonY = Math.round(lay.hearth.y + lay.hearth.h * 0.2);
    ctx.fillStyle = '#ffeeb8';
    ctx.beginPath(); ctx.arc(moonX, moonY, moonR, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(190,150,110,0.22)';
    ctx.beginPath(); ctx.arc(moonX - moonR * 0.34, moonY - moonR * 0.3, moonR * 0.24, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(moonX + moonR * 0.3, moonY + moonR * 0.26, moonR * 0.17, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(moonX + moonR * 0.1, moonY - moonR * 0.5, moonR * 0.12, 0, 7); ctx.fill();

    this.bakeTree(ctx);
    // Branches and leaves first, so none of them is drawn across a room.
    const shown = this.shownRooms();
    for (let i = 0; i < ROOMS.length; i++) {
      if (i < shown) this.bakeBranch(ctx, i);
      else this.bakeLeaves(ctx, this.lay.rooms[i]);
    }
    for (let i = 0; i < shown; i++) this.bakeRoom(ctx, i);
    this.bakeHearth(ctx);
    this.bakeSlots(ctx);
  }

  // Rooms you have, plus the next one as a boarded-up promise. Anything past
  // that is just leaves, so a new workshop never looks like a derelict block.
  shownRooms() {
    return Math.min(ROOMS.length, this.rooms + 1);
  }

  bakeBranch(ctx, i) {
    const r = this.lay.rooms[i];
    ctx.strokeStyle = '#4a3024';
    ctx.lineWidth = Math.max(5, r.w * 0.03);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.W / 2, Math.min(this.lay.hearth.y - 8, r.y + r.h * 0.6));
    ctx.lineTo(r.x + r.w / 2, r.y + r.h - 4);
    ctx.stroke();
  }

  bakeTree(ctx) {
    const { W, H, lay } = this;
    const cx = W / 2;
    const tw = lay.trunkW;
    // A scalloped canopy across the top, drawn as overlapping circles so the
    // edge reads as leaves rather than one flat cloud.
    const canopy = (y, step, rad, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.rect(0, 0, W, y);
      for (let x = -step; x <= W + step; x += step) {
        const wob = ((x * 37) % 11) - 5;
        ctx.moveTo(x + rad, y + wob);
        ctx.arc(x, y + wob, rad, 0, 7);
      }
      ctx.fill();
    };
    const top = Math.min(84, H * 0.1);
    canopy(top + 10, Math.max(26, W * 0.035), Math.max(16, W * 0.026), '#1b3828');
    canopy(top - 6, Math.max(30, W * 0.04), Math.max(14, W * 0.023), '#2b5438');
    canopy(top - 22, Math.max(34, W * 0.046), Math.max(12, W * 0.02), '#3c6b42');
    // hanging vines from the canopy
    ctx.strokeStyle = '#2b5438';
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const x = ((i * 2654435761) % 1000) / 1000 * W;
      const len = 20 + ((i * 97) % 40);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.quadraticCurveTo(x + 6, top + len * 0.6, x - 3, top + len);
      ctx.stroke();
    }

    // trunk with roots fanning into the hearth
    const topY = 0;
    const baseY = lay.hearth.y + lay.hearth.h;
    ctx.beginPath();
    ctx.moveTo(cx - tw / 2, topY);
    ctx.lineTo(cx - tw / 2, lay.hearth.y - 10);
    ctx.quadraticCurveTo(cx - tw * 1.3, baseY - 30, cx - tw * 2.2, baseY);
    ctx.lineTo(cx + tw * 2.2, baseY);
    ctx.quadraticCurveTo(cx + tw * 1.3, baseY - 30, cx + tw / 2, lay.hearth.y - 10);
    ctx.lineTo(cx + tw / 2, topY);
    ctx.closePath();
    ctx.fillStyle = '#5a3a2c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,24,20,0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,180,0.1)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const x = cx - tw * 0.35 + (i * tw * 0.7) / 4;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.quadraticCurveTo(x + (i % 2 ? 6 : -6), lay.hearth.y * 0.5, x, lay.hearth.y - 14);
      ctx.stroke();
    }

    // a rope ladder down the trunk
    ctx.strokeStyle = 'rgba(220,190,150,0.3)';
    ctx.lineWidth = 2.4;
    const lx = cx + tw * 0.62;
    ctx.beginPath(); ctx.moveTo(lx, lay.rooms[4].y); ctx.lineTo(lx, lay.hearth.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx + 16, lay.rooms[4].y); ctx.lineTo(lx + 16, lay.hearth.y); ctx.stroke();
    for (let y = lay.rooms[4].y; y < lay.hearth.y; y += 26) {
      ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx + 16, y); ctx.stroke();
    }
  }

  bakeRoom(ctx, i) {
    const r = this.lay.rooms[i];
    const open = i < this.rooms;
    const info = ROOMS[i];

    // shell
    roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(18, r.w * 0.07));
    ctx.fillStyle = open ? WALL[i] : '#3a2c34';
    ctx.fill();
    ctx.strokeStyle = 'rgba(24,14,20,0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();
    if (open) {
      roundRect(ctx, r.x + 2.5, r.y + 2.5, r.w - 5, r.h - 5, Math.min(16, r.w * 0.065));
      ctx.strokeStyle = 'rgba(255,220,170,0.16)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // back wall
    const n = r.inner;
    ctx.save();
    roundRect(ctx, n.x, n.y, n.w, n.h, 8);
    ctx.clip();
    ctx.fillStyle = open ? PAPER[i] : '#2a2030';
    ctx.fillRect(n.x, n.y, n.w, n.h);
    if (open) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      for (let s = 0; s < n.w; s += 16) ctx.fillRect(n.x + s, n.y, 6, n.h);
      // warm pool of lantern light, baked (no shadowBlur)
      const g = ctx.createRadialGradient(n.x + n.w * 0.5, n.y + n.h * 0.2, 2, n.x + n.w * 0.5, n.y + n.h * 0.2, n.w * 0.7);
      g.addColorStop(0, 'rgba(255,220,140,0.34)');
      g.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(n.x, n.y, n.w, n.h);
    }
    ctx.restore();

    // roof
    ctx.fillStyle = open ? '#8a4a3a' : '#43323c';
    ctx.beginPath();
    ctx.moveTo(r.x - 6, r.y + r.roofH);
    ctx.lineTo(r.x + r.w * 0.5, r.y - r.roofH * 0.5);
    ctx.lineTo(r.x + r.w + 6, r.y + r.roofH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,18,24,0.6)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // floorboards
    ctx.fillStyle = open ? '#8a5a3a' : '#3a2c34';
    ctx.fillRect(n.x, n.y + n.h, n.w, r.floorH);
    ctx.strokeStyle = 'rgba(40,24,20,0.45)';
    ctx.lineWidth = 1.5;
    for (let s = n.x + 14; s < n.x + n.w; s += 22) {
      ctx.beginPath(); ctx.moveTo(s, n.y + n.h); ctx.lineTo(s, n.y + n.h + r.floorH); ctx.stroke();
    }

    if (!open) {
      // boards across a room that has not opened yet, plus the sign
      ctx.strokeStyle = '#6a5a4a';
      ctx.lineWidth = Math.max(8, r.h * 0.055);
      ctx.lineCap = 'round';
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(n.x + 6, n.y + (k > 0 ? 10 : n.h - 10));
        ctx.lineTo(n.x + n.w - 6, n.y + (k > 0 ? n.h - 10 : 10));
        ctx.stroke();
      }
      const label = `${info.at} pals`;
      const fs = Math.max(12, Math.min(20, r.w * 0.1));
      ctx.font = `900 ${fs}px ${FONT}`;
      const tw = ctx.measureText(label).width;
      roundRect(ctx, r.x + r.w / 2 - tw / 2 - 12, r.y + r.h * 0.44, tw + 24, fs + 14, 10);
      ctx.fillStyle = '#f0e0c0';
      ctx.fill();
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#5a3a28';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h * 0.44 + 7);
      ctx.textAlign = 'left';
      return;
    }

    this.bakeDecor(ctx, r, i);

    // name plaque
    const fs = Math.max(10, Math.min(15, r.w * 0.075));
    ctx.font = `900 ${fs}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,240,210,0.88)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(info.name, r.x + r.w / 2, r.y + r.roofH + fs * 0.1);
    ctx.textAlign = 'left';
  }

  // A cell with no room yet: a cluster of leaves and a couple of fireflies, so
  // the tree looks full instead of half-built.
  bakeLeaves(ctx, r) {
    // a bare branch with a sprig of leaves: a spot where a room could go
    const cx = r.x + r.w * 0.5;
    const cy = r.y + r.h * 0.6;
    const unit = Math.min(r.w * 0.055, r.h * 0.11);
    ctx.strokeStyle = '#3a2820';
    ctx.lineWidth = Math.max(3, r.w * 0.012);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.W / 2, Math.min(this.lay.hearth.y - 8, r.y + r.h * 0.85));
    ctx.quadraticCurveTo((this.W / 2 + cx) / 2, cy + r.h * 0.1, cx, cy);
    ctx.stroke();
    const cluster = (color, spread, scale) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (Math.PI * 2 * i) / 9;
        const px = cx + Math.cos(a) * r.w * spread;
        const py = cy + Math.sin(a) * r.h * spread * 0.5;
        ctx.moveTo(px + unit * scale, py);
        ctx.arc(px, py, unit * scale, 0, 7);
      }
      ctx.fill();
    };
    cluster('#1b3828', 0.1, 1.25);
    cluster('#2b5438', 0.06, 1.05);
    ctx.fillStyle = 'rgba(255,240,160,0.7)';
    for (const [dx, dy] of [[-0.14, -0.06], [0.13, 0.1]]) {
      ctx.beginPath();
      ctx.arc(cx + r.w * dx, cy + r.h * dy, 2.4, 0, 7);
      ctx.fill();
    }
  }

  bakeDecor(ctx, r, i) {
    const n = r.inner;
    const line = (x1, y1, x2, y2, w, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    const blob = (x, y, rx, ry, color) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(40,24,36,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    };
    const base = n.y + n.h;
    // a round window onto the night, a rug, and a hanging lantern: every room
    // gets all three so none of them reads as an empty box
    const wx = n.x + n.w * (i % 2 ? 0.14 : 0.9);
    const wr = Math.min(n.w * 0.075, n.h * 0.16);
    ctx.beginPath();
    ctx.arc(wx, n.y + n.h * 0.26, wr, 0, 7);
    ctx.fillStyle = '#1d1238';
    ctx.fill();
    ctx.strokeStyle = '#8a5a3a';
    ctx.lineWidth = Math.max(2.5, wr * 0.22);
    ctx.stroke();
    ctx.fillStyle = '#fff3c8';
    ctx.beginPath(); ctx.arc(wx - wr * 0.3, n.y + n.h * 0.26 - wr * 0.3, wr * 0.26, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(wx + wr * 0.4, n.y + n.h * 0.26 + wr * 0.3, 1.6, 0, 7); ctx.fill();

    ctx.globalAlpha = 0.65;
    ctx.fillStyle = RUG[i];
    ctx.beginPath();
    ctx.ellipse(n.x + n.w * 0.5, base - n.h * 0.045, n.w * 0.27, n.h * 0.05, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,245,225,0.5)';
    ctx.beginPath();
    ctx.ellipse(n.x + n.w * 0.5, base - n.h * 0.045, n.w * 0.17, n.h * 0.028, 0, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;

    const lx = n.x + n.w * (i % 2 ? 0.84 : 0.16);
    line(lx, n.y, lx, n.y + n.h * 0.18, 2, 'rgba(40,24,20,0.6)');
    blob(lx, n.y + n.h * 0.25, n.w * 0.042, n.h * 0.07, '#ffd87a');
    switch (i) {
      case 0: { // Workshop: a shelf of jars and a broom
        const sy = n.y + n.h * 0.3;
        ctx.fillStyle = '#7a5038';
        ctx.fillRect(n.x + n.w * 0.08, sy, n.w * 0.46, 6);
        const jars = ['#c86a9a', '#6ac8a8', '#e8c060'];
        jars.forEach((c, k) => {
          roundRect(ctx, n.x + n.w * (0.12 + k * 0.14), sy - n.h * 0.17, n.w * 0.1, n.h * 0.17, 4);
          ctx.fillStyle = c; ctx.fill();
          ctx.strokeStyle = 'rgba(40,24,36,0.5)'; ctx.lineWidth = 1.8; ctx.stroke();
        });
        line(n.x + n.w * 0.12, base, n.x + n.w * 0.2, n.y + n.h * 0.5, 4, '#8a6040');
        blob(n.x + n.w * 0.2, n.y + n.h * 0.5, n.w * 0.035, n.h * 0.07, '#d8b060');
        break;
      }
      case 1: { // Mossy Nook: cushions, ferns, a tiny pond
        blob(n.x + n.w * 0.22, base - 6, n.w * 0.13, n.h * 0.09, '#d86a8a');
        blob(n.x + n.w * 0.42, base - 4, n.w * 0.1, n.h * 0.07, '#e8a860');
        blob(n.x + n.w * 0.76, base - 4, n.w * 0.14, n.h * 0.05, '#5ab8d8');
        for (const fx of [0.1, 0.9]) {
          for (let k = 0; k < 4; k++) {
            const a = -0.9 + k * 0.6;
            line(n.x + n.w * fx, base - 4, n.x + n.w * fx + Math.sin(a) * n.w * 0.09, base - 4 - Math.cos(a) * n.h * 0.2, 3.4, '#4a9a52');
          }
        }
        break;
      }
      case 2: { // Cloud Loft: a hammock between the walls
        line(n.x + 6, n.y + n.h * 0.4, n.x + n.w - 6, n.y + n.h * 0.4, 2.4, 'rgba(240,220,190,0.7)');
        ctx.fillStyle = '#e8d8f0';
        ctx.beginPath();
        ctx.moveTo(n.x + 8, n.y + n.h * 0.4);
        ctx.quadraticCurveTo(n.x + n.w * 0.5, n.y + n.h * 0.78, n.x + n.w - 8, n.y + n.h * 0.4);
        ctx.quadraticCurveTo(n.x + n.w * 0.5, n.y + n.h * 0.62, n.x + 8, n.y + n.h * 0.4);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(40,24,36,0.45)'; ctx.lineWidth = 2; ctx.stroke();
        blob(n.x + n.w * 0.2, n.y + n.h * 0.2, n.w * 0.12, n.h * 0.07, 'rgba(255,255,255,0.75)');
        break;
      }
      case 3: { // Root Cellar: barrels and jars
        for (let k = 0; k < 3; k++) {
          roundRect(ctx, n.x + n.w * (0.1 + k * 0.17), base - n.h * 0.26, n.w * 0.14, n.h * 0.26, 6);
          ctx.fillStyle = '#9a6a42'; ctx.fill();
          ctx.strokeStyle = 'rgba(40,24,20,0.55)'; ctx.lineWidth = 2; ctx.stroke();
          line(n.x + n.w * (0.1 + k * 0.17), base - n.h * 0.16, n.x + n.w * (0.24 + k * 0.17), base - n.h * 0.16, 2, 'rgba(40,24,20,0.5)');
        }
        blob(n.x + n.w * 0.78, base - n.h * 0.08, n.w * 0.07, n.h * 0.1, '#8ad8a0');
        break;
      }
      case 4: { // Star Deck: a telescope and a railing
        for (let x = n.x + 8; x < n.x + n.w - 8; x += n.w * 0.12) line(x, base, x, base - n.h * 0.14, 3, '#8a6040');
        line(n.x + 8, base - n.h * 0.14, n.x + n.w - 8, base - n.h * 0.14, 3.4, '#8a6040');
        const tx = n.x + n.w * 0.7, ty = base - n.h * 0.3;
        line(tx, base, tx - n.w * 0.07, base, 3, '#5a4a52');
        line(tx, base, tx + n.w * 0.07, base, 3, '#5a4a52');
        line(tx, base, tx, ty, 3, '#5a4a52');
        line(tx - n.w * 0.1, ty + n.h * 0.1, tx + n.w * 0.12, ty - n.h * 0.09, 7, '#cfd8e8');
        break;
      }
      default: { // Dream Attic: pillows and a mobile
        for (let k = 0; k < 3; k++) {
          blob(n.x + n.w * (0.2 + k * 0.26), base - n.h * 0.05, n.w * 0.11, n.h * 0.07, ['#f0c0d8', '#c0d8f0', '#f0e0b0'][k]);
        }
        line(n.x + n.w * 0.5, n.y, n.x + n.w * 0.5, n.y + n.h * 0.16, 2, 'rgba(40,24,20,0.6)');
        line(n.x + n.w * 0.3, n.y + n.h * 0.16, n.x + n.w * 0.7, n.y + n.h * 0.16, 2, 'rgba(40,24,20,0.6)');
        for (const mx of [0.3, 0.5, 0.7]) {
          line(n.x + n.w * mx, n.y + n.h * 0.16, n.x + n.w * mx, n.y + n.h * 0.26, 1.6, 'rgba(40,24,20,0.5)');
          blob(n.x + n.w * mx, n.y + n.h * 0.3, n.w * 0.035, n.h * 0.045, '#ffe08a');
        }
        break;
      }
    }
  }

  bakeHearth(ctx) {
    const { lay, W } = this;
    const h = lay.hearth;
    const c = lay.cauldron;
    // the warm pool the fire throws across the floorboards
    const glow = ctx.createRadialGradient(c.x, c.y + c.r * 0.6, c.r * 0.2, c.x, c.y + c.r * 0.6, c.r * 4);
    ctx.fillStyle = glow;
    glow.addColorStop(0, 'rgba(255,170,70,0.3)');
    glow.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillRect(0, h.y - c.r, W, h.h + c.r);

    // the workshop floor: planks, a skirting rail and a ring of hearth stones
    const deckY = h.y + h.h * 0.6;
    const floor = ctx.createLinearGradient(0, deckY, 0, h.y + h.h);
    floor.addColorStop(0, '#7d5236');
    floor.addColorStop(1, '#492e24');
    ctx.fillStyle = floor;
    ctx.fillRect(0, deckY, W, h.h);
    ctx.strokeStyle = 'rgba(30,16,14,0.45)';
    ctx.lineWidth = 2;
    for (let x = 34; x < W; x += 68) {
      ctx.beginPath();
      ctx.moveTo(x, deckY);
      ctx.lineTo(x, h.y + h.h);
      ctx.stroke();
    }
    ctx.fillStyle = '#8a5a3a';
    ctx.fillRect(0, deckY - 9, W, 11);
    ctx.fillStyle = 'rgba(255,220,170,0.2)';
    ctx.fillRect(0, deckY - 9, W, 3);

    ctx.fillStyle = '#4e3c48';
    for (let i = -3; i <= 3; i++) {
      const sx = c.x + i * c.r * 0.52;
      ctx.beginPath();
      ctx.ellipse(sx, c.y + c.r * 1.08 + Math.abs(i) * 2, c.r * 0.2, c.r * 0.1, 0, 0, 7);
      ctx.fill();
    }

    this.bakeClutter(ctx, deckY + Math.max(6, c.r * 0.1), c);
  }

  // Workshop clutter along the floor so the hearth is not a bare plank.
  bakeClutter(ctx, deckY, c) {
    const { W } = this;
    const u = Math.max(18, c.r * 0.46);
    const outline = (color, lw = 2.4) => {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(28,16,22,0.7)';
      ctx.lineWidth = lw;
      ctx.stroke();
    };
    const far = Math.max(u * 2.4, Math.min(W * 0.2, c.x - c.r * 1.9));

    // a crate of spare ingredients
    roundRect(ctx, far - u * 1.1, deckY - u * 1.1, u * 2.2, u * 1.1, u * 0.14);
    outline('#8a5a38');
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(far - u * 0.7 + i * u * 0.7, deckY - u * 1.14, u * 0.26, Math.PI, 0);
      outline(['#c86a9a', '#6ac8a8', '#e8c060'][i], 2);
    }
    // a little stool
    const sx = far + u * 2.2;
    roundRect(ctx, sx - u * 0.7, deckY - u * 0.95, u * 1.4, u * 0.26, u * 0.1);
    outline('#a8744a');
    ctx.strokeStyle = '#8a5a3a';
    ctx.lineWidth = Math.max(3, u * 0.14);
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx + k * u * 0.45, deckY - u * 0.7);
      ctx.lineTo(sx + k * u * 0.6, deckY);
      ctx.stroke();
    }

    // a stack of spell books on the other side
    const bx = W - far;
    const colors = ['#5a7ad0', '#c05a7a', '#d8a040'];
    for (let i = 0; i < 3; i++) {
      roundRect(ctx, bx - u * (0.8 - i * 0.07), deckY - u * (0.3 + i * 0.3), u * (1.6 - i * 0.14), u * 0.3, u * 0.06);
      outline(colors[i], 2);
    }
    // a broom leaning on the wall
    const brx = bx + u * 1.9;
    ctx.strokeStyle = '#8a6040';
    ctx.lineWidth = Math.max(3.5, u * 0.16);
    ctx.beginPath();
    ctx.moveTo(brx, deckY);
    ctx.lineTo(brx + u * 0.55, deckY - u * 2.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(brx - u * 0.2, deckY);
    ctx.lineTo(brx + u * 0.3, deckY - u * 0.9);
    ctx.lineTo(brx + u * 0.72, deckY - u * 0.8);
    ctx.lineTo(brx + u * 0.4, deckY);
    ctx.closePath();
    outline('#d8b060');

    // logs under the pot
    ctx.strokeStyle = '#6a4630';
    ctx.lineWidth = Math.max(6, c.r * 0.13);
    ctx.lineCap = 'round';
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(c.x - c.r * 0.85 * k, c.y + c.r * 0.9);
      ctx.lineTo(c.x + c.r * 0.85 * k, c.y + c.r * 1.04);
      ctx.stroke();
    }

    // pot: legs, belly, handles
    ctx.fillStyle = '#2c2430';
    for (const k of [-1, 0, 1]) {
      if (k === 0) continue;
      roundRect(ctx, c.x + k * c.r * 0.55 - c.r * 0.08, c.y + c.r * 0.7, c.r * 0.16, c.r * 0.3, 4);
      ctx.fill();
    }
    ctx.strokeStyle = '#1c1620';
    ctx.lineWidth = Math.max(5, c.r * 0.1);
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(c.x + k * c.r * 0.98, c.y - c.r * 0.12, c.r * 0.26, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.stroke();
    }
    bowl(ctx, c);
    const g = ctx.createLinearGradient(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r);
    g.addColorStop(0, '#48404f');
    g.addColorStop(0.45, '#2e2833');
    g.addColorStop(1, '#201a26');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#17121c';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.ellipse(c.x - c.r * 0.42, c.y + c.r * 0.1, c.r * 0.12, c.r * 0.3, -0.3, 0, 7);
    ctx.fill();
  }

  bakeSlots(ctx) {
    for (const s of this.slots) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 7);
      ctx.fillStyle = 'rgba(255,245,220,0.1)';
      ctx.fill();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(255,240,200,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  bakeRim() {
    const c = this.lay.cauldron;
    const pad = Math.ceil(c.r * 0.3);
    const w = Math.ceil(c.r * 2.3) + pad * 2;
    const h = Math.ceil(c.r * 0.9) + pad * 2;
    const cv = makeCanvas(Math.round(w * this.dpr), Math.round(h * this.dpr));
    const ctx = cv.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cx = w / 2;
    const cy = h / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, c.r * 1.06, c.r * 0.32, 0, 0, 7);
    ctx.strokeStyle = '#17121c';
    ctx.lineWidth = Math.max(7, c.r * 0.15);
    ctx.stroke();
    ctx.strokeStyle = '#4e4458';
    ctx.lineWidth = Math.max(3.5, c.r * 0.08);
    ctx.stroke();
    this.rimOffset = { x: cx, y: cy };
    return cv;
  }

  // -------------------------------------------------------------- effects

  spawn(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  sparkle(x, y, n = 10, color = '#ffe68a') {
    const count = this.reduced ? Math.min(4, n) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 150;
      this.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0, max: 0.6 + Math.random() * 0.5, size: 3 + Math.random() * 5, color, rot: Math.random() * 6 });
    }
  }

  hearts(x, y, n = 3) {
    const count = this.reduced ? Math.min(2, n) : n;
    for (let i = 0; i < count; i++) {
      this.spawn({ kind: 'heart', x: x + (Math.random() - 0.5) * 24, y, vx: (Math.random() - 0.5) * 24, vy: -50 - Math.random() * 40, life: 0, max: 0.9, size: 7 + Math.random() * 5, color: '#ff8ab0', rot: 0 });
    }
  }

  puff(x, y, color = '#cfc0e0', n = 10) {
    const count = this.reduced ? Math.min(4, n) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 70;
      this.spawn({ kind: 'puff', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0, max: 0.8 + Math.random() * 0.6, size: 12 + Math.random() * 20, color, rot: 0 });
    }
  }

  ring(x, y, color = '#ffe68a') {
    this.spawn({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0, max: 0.6, size: 10, color, rot: 0 });
  }

  rise(x, y, text, color = '#fff0c0') {
    this.spawn({ kind: 'text', x, y, vx: 0, vy: -46, life: 0, max: 1.3, size: 18, color, rot: 0, text });
  }

  // ---------------------------------------------------------------- update

  update(dt, { pot = [], heat = 0 } = {}) {
    this.t += dt;
    const colors = pot.map((id) => ITEM[id]?.c1).filter(Boolean);
    this.target = mixHex(colors);
    this.liquid = lerpColor(this.liquid, this.target, Math.min(1, dt * 4));
    this.fill += (Math.min(1, pot.length / 3) - this.fill) * Math.min(1, dt * 5);
    this.heat += (heat - this.heat) * Math.min(1, dt * 6);

    const rate = this.reduced ? 1.4 : 3 + pot.length * 2.4 + this.heat * 14;
    this.bubbleClock = (this.bubbleClock || 0) + dt * rate;
    while (this.bubbleClock > 1 && this.bubbles.length < 26) {
      this.bubbleClock -= 1;
      const c = this.lay.cauldron;
      this.bubbles.push({
        x: c.x + (Math.random() - 0.5) * c.r * 1.3,
        y: c.y - c.r * 0.5 + Math.random() * c.r * 0.2,
        r: 2 + Math.random() * (c.r * 0.09),
        v: 14 + Math.random() * 28,
        life: 0,
        max: 0.5 + Math.random() * 0.6,
      });
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.life += dt;
      b.y -= b.v * dt;
      if (b.life > b.max) this.bubbles.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'spark') { p.vy += 240 * dt; p.rot += dt * 7; }
      else if (p.kind === 'puff') { p.vy *= 1 - dt * 1.6; p.vx *= 1 - dt * 1.4; }
      else if (p.kind === 'heart') p.vy *= 1 - dt * 0.9;
    }
  }

  // ------------------------------------------------------------------ draw

  draw(sim, { pot = [], hoverPal = null, dim = false } = {}) {
    const ctx = this.ctx;
    const { W, H, lay } = this;
    this.ensureScene();
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.scene, 0, 0, W, H);
    this.drawFire(ctx);
    this.drawLiquid(ctx);
    ctx.drawImage(this.rim, lay.cauldron.x - this.rimOffset.x, lay.cauldron.y - lay.cauldron.r * 0.5 - this.rimOffset.y, this.rim.width / this.dpr, this.rim.height / this.dpr);
    if (this.dropHot) {
      const c = lay.cauldron;
      ctx.setLineDash([9, 7]);
      ctx.strokeStyle = '#ffe07a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - c.r * 0.2, c.r * 1.28, c.r * 1.1, 0, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.drawPot(ctx, pot);
    if (sim) this.drawPals(ctx, sim, hoverPal);
    this.drawParticles(ctx);
    if (dim) {
      ctx.fillStyle = 'rgba(30,16,36,0.45)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawFire(ctx) {
    const c = this.lay.cauldron;
    const base = c.y + c.r * 1.02;
    const wob = this.reduced ? 0 : Math.sin(this.t * 9);
    for (let i = -1; i <= 1; i++) {
      const h = c.r * (0.46 + 0.12 * (1 - Math.abs(i))) * (1 + (this.reduced ? 0 : Math.sin(this.t * 7 + i) * 0.12)) * (0.85 + this.heat * 0.6);
      const x = c.x + i * c.r * 0.74;
      ctx.beginPath();
      ctx.moveTo(x - c.r * 0.24, base);
      ctx.bezierCurveTo(x - c.r * 0.3 + wob * 3, base - h * 0.55, x - c.r * 0.1 + wob * 5, base - h * 0.8, x + wob * 6, base - h);
      ctx.bezierCurveTo(x + c.r * 0.1 + wob * 5, base - h * 0.8, x + c.r * 0.3 + wob * 3, base - h * 0.55, x + c.r * 0.24, base);
      ctx.closePath();
      ctx.fillStyle = '#ff7a1a';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - c.r * 0.13, base);
      ctx.bezierCurveTo(x - c.r * 0.14 + wob * 2, base - h * 0.4, x + wob * 3, base - h * 0.5, x + wob * 3, base - h * 0.66);
      ctx.bezierCurveTo(x + c.r * 0.14 + wob * 2, base - h * 0.44, x + c.r * 0.13, base - h * 0.3, x + c.r * 0.13, base);
      ctx.closePath();
      ctx.fillStyle = '#ffdd6a';
      ctx.fill();
    }
  }

  drawLiquid(ctx) {
    const c = this.lay.cauldron;
    const surf = c.y - c.r * 0.44 + (1 - this.fill) * c.r * 0.16;
    ctx.save();
    innerBowl(ctx, c);
    ctx.clip();
    ctx.fillStyle = this.liquid;
    ctx.fillRect(c.x - c.r * 1.2, surf, c.r * 2.4, c.r * 2);
    // surface, wobbling gently
    const wob = this.reduced ? 1 : 1 + Math.sin(this.t * 2.6) * 0.03;
    ctx.beginPath();
    ctx.ellipse(c.x, surf, c.r * 0.84 * wob, c.r * 0.26, 0, 0, 7);
    ctx.fillStyle = lighten(this.liquid, 0.22);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x - c.r * 0.26, surf - c.r * 0.04, c.r * 0.22, c.r * 0.07, -0.2, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
    // bubbles
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.6;
    for (const b of this.bubbles) {
      const k = 1 - b.life / b.max;
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.6));
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, 7);
      ctx.fillStyle = lighten(this.liquid, 0.4);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawPot(ctx, pot) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const id = pot[i];
      if (!id) continue;
      const bob = this.reduced ? 0 : Math.sin(this.t * 3 + i) * 3;
      const sprite = this.sprites.item(id);
      const size = s.r * 2.1;
      ctx.beginPath();
      ctx.arc(s.x, s.y + bob, s.r * 1.04, 0, 7);
      ctx.fillStyle = 'rgba(255,245,220,0.2)';
      ctx.fill();
      ctx.strokeStyle = '#ffeab0';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.drawImage(sprite, s.x - size / 2, s.y + bob - size / 2, size, size);
    }
  }

  drawPals(ctx, sim, hoverPal) {
    for (const a of sim.actors) {
      const lift = liftOf(a, this.reduced);
      const sprite = this.sprites.pal(a.id, a.blink > 0 || a.state === 'nap');
      const room = this.lay.rooms[Math.min(this.lay.rooms.length - 1, a.room)];
      const size = Math.min(96, room.inner.h * 0.78) * a.size;
      const squash = a.state === 'play' && !this.reduced ? 1 + Math.sin(a.phase) * 0.08 : 1;
      ctx.save();
      ctx.translate(a.x, a.y - lift);
      ctx.scale(a.face * (2 - squash), squash);
      ctx.drawImage(sprite, -size / 2, -size + size * 0.12, size, size);
      ctx.restore();
      if (a.state === 'nap') this.drawZs(ctx, a, size);
      if (hoverPal === a.id) {
        const p = PAL[a.id];
        ctx.font = `900 14px ${FONT}`;
        const w = ctx.measureText(p.name).width + 18;
        roundRect(ctx, a.x - w / 2, a.y - size - 24, w, 22, 11);
        ctx.fillStyle = 'rgba(255,248,230,0.95)';
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.name, a.x, a.y - size - 12);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  drawZs(ctx, a, size) {
    ctx.font = `900 ${Math.round(size * 0.22)}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,245,220,0.8)';
    const phase = this.reduced ? 0 : (this.t * 0.6) % 1;
    for (let i = 0; i < 2; i++) {
      const k = (phase + i * 0.5) % 1;
      ctx.globalAlpha = 0.9 * (1 - k);
      ctx.fillText('z', a.x + size * 0.3 + k * size * 0.2, a.y - size * 0.9 - k * size * 0.4);
    }
    ctx.globalAlpha = 1;
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      if (p.kind === 'spark') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        const s = p.size * (1 - k * 0.5);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * i) / 4;
          const rr = i % 2 ? s * 0.4 : s;
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'puff') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + k * 1.1), 0, 7);
        ctx.fill();
      } else if (p.kind === 'heart') {
        const s = p.size * (1 + k * 0.4);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + s * 0.8);
        ctx.bezierCurveTo(p.x - s * 1.3, p.y - s * 0.3, p.x - s * 0.4, p.y - s, p.x, p.y - s * 0.3);
        ctx.bezierCurveTo(p.x + s * 0.4, p.y - s, p.x + s * 1.3, p.y - s * 0.3, p.x, p.y + s * 0.8);
        ctx.fill();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * (1 - k);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + k * 90, 0, 7);
        ctx.stroke();
      } else if (p.kind === 'text') {
        ctx.font = `900 ${p.size}px ${FONT}`;
        ctx.fillStyle = p.color;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        ctx.textAlign = 'left';
      }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------- hit tests

  slotAt(x, y) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if ((x - s.x) ** 2 + (y - s.y) ** 2 <= (s.r * 1.15) ** 2) return i;
    }
    return -1;
  }

  cauldronAt(x, y) {
    const c = this.lay.cauldron;
    return (x - c.x) ** 2 / (c.r * 1.15) ** 2 + (y - c.y) ** 2 / (c.r * 1.05) ** 2 <= 1;
  }

  roomAt(x, y) {
    for (let i = 0; i < this.lay.rooms.length; i++) {
      const r = this.lay.rooms[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }
}
