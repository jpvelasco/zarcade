// All the art, painted once with Canvas paths into offscreen canvases and then
// just scaled and rotated at draw time. Nothing in here runs per frame.
//
// Inside a painter, units are metres and y grows downward, matching the world.
// The origin is the sprite's top-left corner.

import { hash01 } from './rng.js';

const TAU = Math.PI * 2;

/** Bake one sprite. `ax`/`ay` are the anchor as a fraction of width/height. */
function make(wm, hm, ppm, paint, ax = 0.5, ay = 0.5) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.ceil(wm * ppm));
  canvas.height = Math.max(2, Math.ceil(hm * ppm));
  const g = canvas.getContext('2d');
  g.scale(ppm, ppm);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  paint(g);
  return { img: canvas, w: wm, h: hm, ax, ay };
}

/** Draw a baked sprite at a world position, optionally rotated. */
export function draw(ctx, sprite, x, y, scale = 1, rotation = 0, alpha = 1) {
  if (!sprite) return;
  const w = sprite.w * scale;
  const h = sprite.h * scale;
  const ox = -w * sprite.ax;
  const oy = -h * sprite.ay;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.drawImage(sprite.img, ox, oy, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(sprite.img, x + ox, y + oy, w, h);
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// ------------------------------------------------------------- small helpers

function poly(g, points, fill, stroke, lw = 0.05) {
  g.beginPath();
  g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

function rrect(g, x, y, w, h, r, fill, stroke, lw = 0.05) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

function circle(g, x, y, r, fill, stroke, lw = 0.05) {
  g.beginPath();
  g.arc(x, y, Math.max(0.001, r), 0, TAU);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

function line(g, x1, y1, x2, y2, color, lw) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.stroke();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const to = amount < 0 ? 0 : 255;
  const mix = Math.abs(amount);
  const mixer = (channel) => Math.round(channel + (to - channel) * mix);
  return `rgb(${mixer((n >> 16) & 255)}, ${mixer((n >> 8) & 255)}, ${mixer(n & 255)})`;
}

// ------------------------------------------------------------------- the plane

const FOLD_SHAPE = {
  // Each shape is the upper wing outline, nose at (2.5, 0.75), tail at the left.
  dart: { top: [0, 0.1, 2.5, 0.78, 0.12, 1.1], under: [0, 1.5, 2.5, 0.84, 0.12, 1.12], span: 1.6 },
  glider: { top: [0.1, 0.0, 2.3, 0.82, 0.2, 1.08], under: [0.1, 1.68, 2.3, 0.88, 0.2, 1.1], span: 1.82 },
  arrow: { top: [0, 0.34, 2.9, 0.8, 0.1, 1.0], under: [0, 1.3, 2.9, 0.84, 0.1, 1.02], span: 1.5 },
  crane: { top: [0.2, 0.0, 2.4, 0.8, 0.3, 1.0], under: [0.2, 1.62, 2.4, 0.86, 0.3, 1.04], span: 1.74 },
  hawk: { top: [0, 0.18, 2.6, 0.78, 0.55, 1.06], under: [0, 1.44, 2.6, 0.84, 0.55, 1.08], span: 1.66 },
  sunray: { top: [0, 0.12, 2.5, 0.78, 0.14, 1.1], under: [0, 1.5, 2.5, 0.84, 0.14, 1.12], span: 1.62 },
};

/**
 * The paper plane, nose pointing right (+x). Anchored on its middle so the
 * renderer can rotate it about the flight point.
 */
export function bakePlane(fold, paper, { soak = 0, ppm = 46 } = {}) {
  const shape = FOLD_SHAPE[fold.shape] || FOLD_SHAPE.dart;
  const wet = Math.min(1, soak);
  const ink = wet ? mix(paper.ink, '#7f8aa0', wet * 0.55) : paper.ink;
  const trim = wet ? mix(paper.trim, '#6d7791', wet * 0.5) : paper.trim;
  return make(3.1, 1.9, ppm, (g) => {
    g.translate(0.2, 0.2);
    // Under wing first, then the top wing over it: a simple paper fold read.
    poly(g, shape.under, shade(trim, -0.18), shade(trim, -0.38), 0.045);
    poly(g, shape.top, ink, shade(trim, -0.3), 0.05);
    // The crease down the middle.
    line(g, 0.1, 1.05, 2.45, 0.8, shade(trim, -0.22), 0.045);
    paperPattern(g, paper, shape);
    if (fold.shape === 'crane') {
      // A little head and beak on the crane.
      poly(g, [2.3, 0.78, 2.95, 0.42, 2.45, 0.92], paper.accent, shade(paper.accent, -0.3), 0.04);
      poly(g, [0.3, 0.98, -0.18, 0.5, 0.42, 0.76], ink, shade(trim, -0.3), 0.04);
    }
    if (fold.shape === 'hawk') {
      poly(g, [0.55, 1.06, 0.1, 1.5, 0.95, 1.0], shade(trim, -0.24), shade(trim, -0.44), 0.04);
    }
    if (fold.shape === 'sunray' || paper.sparkle) {
      g.globalAlpha = 0.75;
      for (let i = 0; i < 4; i += 1) {
        const t = 0.4 + i * 0.44;
        line(g, t, 0.9 - i * 0.04, t + 0.3, 0.72 - i * 0.04, '#fff3b0', 0.05);
      }
      g.globalAlpha = 1;
    }
    if (wet > 0.25) {
      g.globalAlpha = 0.3 * wet;
      poly(g, shape.top, '#5b6b86');
      g.globalAlpha = 1;
      for (let i = 0; i < 3; i += 1) {
        circle(g, 0.7 + i * 0.6, 0.95 - i * 0.07, 0.1, 'rgba(180, 210, 240, 0.65)');
      }
    }
  }, 0.52, 0.5);
}

function mix(a, b, t) {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round((((na >> shift) & 255) * (1 - t)) + (((nb >> shift) & 255) * t));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

function paperPattern(g, paper, shape) {
  g.save();
  g.beginPath();
  g.moveTo(shape.top[0], shape.top[1]);
  for (let i = 2; i < shape.top.length; i += 2) g.lineTo(shape.top[i], shape.top[i + 1]);
  g.closePath();
  g.clip();
  g.globalAlpha = 0.5;
  switch (paper.id) {
    case 'lined':
      for (let i = 0; i < 6; i += 1) line(g, 0, 0.2 + i * 0.2, 3, 0.2 + i * 0.2, paper.trim, 0.035);
      break;
    case 'grid':
      for (let i = 0; i < 7; i += 1) line(g, 0, 0.12 + i * 0.18, 3, 0.12 + i * 0.18, paper.trim, 0.03);
      for (let i = 0; i < 12; i += 1) line(g, i * 0.26, 0, i * 0.26, 2, paper.trim, 0.03);
      break;
    case 'polka':
      for (let i = 0; i < 16; i += 1) {
        circle(g, 0.1 + (i % 6) * 0.45 + (i > 7 ? 0.2 : 0), 0.25 + Math.floor(i / 6) * 0.3, 0.07, paper.accent);
      }
      break;
    case 'candy':
      for (let i = 0; i < 9; i += 1) line(g, i * 0.34, 0, i * 0.34 - 0.5, 2, paper.accent, 0.1);
      break;
    case 'leaf':
      for (let i = 0; i < 4; i += 1) {
        g.beginPath();
        g.ellipse(0.5 + i * 0.55, 0.6 + (i % 2) * 0.22, 0.17, 0.08, -0.5, 0, TAU);
        g.fillStyle = paper.accent;
        g.fill();
      }
      break;
    case 'map':
      line(g, 0.1, 0.9, 2.6, 0.6, paper.accent, 0.045);
      line(g, 0.4, 0.4, 1.4, 1.2, paper.accent, 0.035);
      circle(g, 1.9, 0.72, 0.09, paper.accent);
      break;
    case 'aurora':
      for (let i = 0; i < 3; i += 1) {
        g.beginPath();
        g.moveTo(0, 0.4 + i * 0.3);
        g.quadraticCurveTo(1.3, 0.1 + i * 0.3, 2.6, 0.5 + i * 0.26);
        g.strokeStyle = i % 2 ? paper.accent : '#7fe7d2';
        g.lineWidth = 0.09;
        g.stroke();
      }
      break;
    case 'stripe':
    case 'peach':
      for (let i = 0; i < 5; i += 1) line(g, i * 0.5, 0, i * 0.5 + 0.2, 2, paper.trim, 0.09);
      break;
    case 'waxed':
      g.globalAlpha = 0.3;
      for (let i = 0; i < 5; i += 1) circle(g, 0.4 + i * 0.5, 0.8 + (i % 2) * 0.2, 0.2, paper.trim);
      break;
    default:
      break;
  }
  g.globalAlpha = 1;
  g.restore();
}

/** A fold shown on a card in the hangar, drawn big. */
export function bakePlaneIcon(fold, paper, ppm = 60) {
  return bakePlane(fold, paper, { ppm });
}

// --------------------------------------------------------------- the scenery

/** A soft warm column: one baked gradient, stretched to each source. */
export function bakeColumn(ppm = 10) {
  const w = 2;
  const h = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * ppm * 24);
  canvas.height = Math.ceil(h * ppm * 24);
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, canvas.height, 0, 0);
  grad.addColorStop(0, 'rgba(255, 206, 128, 0.62)');
  grad.addColorStop(0.4, 'rgba(255, 228, 176, 0.34)');
  grad.addColorStop(1, 'rgba(255, 244, 220, 0)');
  // Bell-shaped across so the edges fade out like the field does.
  for (let i = 0; i < canvas.width; i += 1) {
    const t = (i / (canvas.width - 1)) * 2 - 1;
    const bell = Math.max(0, 1 - t * t) ** 1.2;
    g.globalAlpha = bell;
    g.fillStyle = grad;
    g.fillRect(i, 0, 1, canvas.height);
  }
  return { img: canvas, w: 1, h: 1, ax: 0.5, ay: 1 };
}

export function bakeRainCloud(ppm = 9) {
  return make(2, 1.3, ppm * 20, (g) => {
    const puffs = [[0.42, 0.74, 0.4], [0.86, 0.6, 0.5], [1.34, 0.72, 0.42], [1.66, 0.84, 0.3], [0.2, 0.86, 0.24]];
    for (const [x, y, r] of puffs) circle(g, x, y, r, 'rgba(118, 134, 162, 0.92)');
    for (const [x, y, r] of puffs) circle(g, x, y - 0.1, r * 0.82, 'rgba(158, 174, 200, 0.95)');
    g.globalAlpha = 0.5;
    for (const [x, y, r] of puffs) circle(g, x - r * 0.2, y - 0.22, r * 0.5, 'rgba(216, 228, 246, 0.9)');
    g.globalAlpha = 1;
  }, 0.5, 0.55);
}

export function bakeCloud(seed, ppm = 7) {
  const puffs = 4 + Math.floor(hash01(seed, 3) * 3);
  return make(2.6, 1.5, ppm * 20, (g) => {
    for (let i = 0; i < puffs; i += 1) {
      const x = 0.46 + (i / (puffs - 1)) * 1.7;
      const r = 0.2 + hash01(seed, i) * 0.26;
      circle(g, x, 0.9 - hash01(seed, i + 9) * 0.12, r, 'rgba(255, 255, 255, 0.9)');
    }
    g.globalAlpha = 0.6;
    for (let i = 0; i < puffs; i += 1) {
      const x = 0.5 + (i / (puffs - 1)) * 1.66;
      circle(g, x, 0.74, 0.17 + hash01(seed, i + 4) * 0.18, '#ffffff');
    }
    g.globalAlpha = 1;
  }, 0.5, 0.62);
}

export function bakeSun(accent, ppm = 6) {
  return make(4, 4, ppm * 20, (g) => {
    const glow = g.createRadialGradient(2, 2, 0.3, 2, 2, 2);
    glow.addColorStop(0, 'rgba(255, 250, 224, 0.95)');
    glow.addColorStop(0.3, 'rgba(255, 244, 206, 0.6)');
    glow.addColorStop(0.62, `${accent}44`);
    glow.addColorStop(1, `${accent}00`);
    g.fillStyle = glow;
    g.fillRect(0, 0, 4, 4);
    circle(g, 2, 2, 0.62, '#fff8e2');
  }, 0.5, 0.5);
}

/** A ring the letters fly through: baked once, tinted when taken. */
export function bakeRing(taken, ppm = 22) {
  const r = 9;
  return make(r * 2 + 2.4, r * 2 + 2.4, ppm / 4, (g) => {
    const c = r + 1.2;
    g.lineWidth = 1;
    g.strokeStyle = taken ? 'rgba(255, 206, 92, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    g.beginPath();
    g.ellipse(c, c, r, r * 0.96, 0, 0, TAU);
    g.stroke();
    g.lineWidth = 0.45;
    g.strokeStyle = taken ? 'rgba(255, 246, 206, 0.95)' : 'rgba(126, 196, 240, 0.9)';
    g.beginPath();
    g.ellipse(c, c, r - 0.8, r * 0.96 - 0.8, 0, 0, TAU);
    g.stroke();
    // Little ribbons so the ring reads as paper, not metal.
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + 0.3;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r * 0.96;
      circle(g, x, y, 0.7, taken ? '#ffd66e' : '#ffffff');
    }
  }, 0.5, 0.5);
}

/** The mailbox on its post, plus the flag that pops up on delivery. */
export function bakeMailbox(flag, ppm = 26) {
  return make(3.2, 5.4, ppm, (g) => {
    line(g, 1.6, 5.3, 1.6, 2.5, '#8a6a46', 0.42);
    rrect(g, 0.5, 1.2, 2.2, 1.6, 0.5, '#5aa7d8', '#2f6f99', 0.14);
    rrect(g, 0.68, 1.95, 1.84, 0.85, 0.22, '#79c2ea');
    rrect(g, 1.0, 2.2, 1.2, 0.4, 0.14, '#2f6f99');
    if (flag) {
      line(g, 2.6, 1.45, 2.6, 0.2, '#b9835a', 0.14);
      poly(g, [2.6, 0.24, 3.15, 0.56, 2.6, 0.9], '#ff6f7d', '#c2404f', 0.1);
    } else {
      line(g, 2.6, 1.45, 2.6, 0.86, '#b9835a', 0.14);
      poly(g, [2.6, 1.0, 3.1, 1.2, 2.6, 1.42], '#ff6f7d', '#c2404f', 0.1);
    }
    circle(g, 1.2, 1.95, 0.1, '#1e3a4e');
  }, 0.5, 1);
}

const DROP_PALETTE = {
  house: { wall: '#f7e5c8', roof: '#d4694f', trim: '#b98f5e' },
  hut: { wall: '#f2efe4', roof: '#4e7f9b', trim: '#9aa08f' },
  treehouse: { wall: '#d6b184', roof: '#6aa75a', trim: '#8a6a46' },
  boathouse: { wall: '#eef3f6', roof: '#5f8fbe', trim: '#9ab0bf' },
  cabin: { wall: '#e8d6bd', roof: '#9fb6d2', trim: '#8a6a46' },
};

/** The lit window a letter goes through, plus a plant once it has arrived. */
function paintWindow(g, cx, cy, taken) {
  rrect(g, cx - 1.1, cy - 1.1, 2.2, 2.2, 0.26, taken ? '#ffe9a8' : '#fff4c8', '#9a7a4a', 0.16);
  line(g, cx, cy - 1.1, cx, cy + 1.1, '#9a7a4a', 0.12);
  line(g, cx - 1.1, cy, cx + 1.1, cy, '#9a7a4a', 0.12);
  if (taken) {
    circle(g, cx + 0.45, cy + 0.55, 0.3, '#ff8fb0');
    circle(g, cx - 0.45, cy + 0.55, 0.26, '#8fd45c');
  }
}

/**
 * A building with a window the letter goes through. The height comes from the
 * route, so each region has a tall shape that makes sense at thirty metres:
 * a narrow townhouse, a lighthouse, a pine treehouse, a stilted boathouse and
 * a timber cable-car tower.
 */
export function bakeDrop(kind, height, taken, seed, ppm = 16) {
  const h = Math.max(6, Math.min(40, height));
  const palette = DROP_PALETTE[kind] || DROP_PALETTE.house;
  const tall = h > 19;
  const w = (kind === 'treehouse' ? 7 : 8.2) * (tall ? 0.78 : 1);

  if (kind === 'hut') {
    // A lighthouse: tapered, banded, with a lamp room on top.
    return make(w + 2, h + 1.4, ppm, (g) => {
      const top = 4.6;
      const bw = w * 0.34;
      const tw = w * 0.2;
      const cx = w / 2 + 1;
      poly(g, [cx - tw, top, cx + tw, top, cx + bw, h, cx - bw, h], palette.wall, palette.trim, 0.22);
      const bands = Math.max(1, Math.round((h - top) / 7));
      for (let i = 0; i < bands; i += 1) {
        const y0 = top + (h - top) * ((i + 0.45) / bands);
        const y1 = top + (h - top) * ((i + 0.95) / bands);
        const f = (y) => tw + (bw - tw) * ((y - top) / (h - top));
        poly(g, [cx - f(y0), y0, cx + f(y0), y0, cx + f(y1), y1, cx - f(y1), y1], '#d9604f');
      }
      rrect(g, cx - tw - 0.9, top - 1, (tw + 0.9) * 2, 1, 0.3, palette.roof, shade(palette.roof, -0.3), 0.14);
      rrect(g, cx - tw - 0.3, top - 3.6, (tw + 0.3) * 2, 2.8, 0.3, '#cfe7f4', palette.trim, 0.18);
      poly(g, [cx - tw - 1.1, top - 3.6, cx, top - 6.1, cx + tw + 1.1, top - 3.6], palette.roof, shade(palette.roof, -0.3), 0.18);
      paintWindow(g, cx, top - 2.2, taken);
      g.globalAlpha = 0.5;
      poly(g, [cx + tw, top - 3, cx + tw + 7, top - 4.6, cx + tw + 7, top - 1.4], '#fff3b0');
      g.globalAlpha = 1;
    }, 0.5, 1);
  }

  if (kind === 'cabin') {
    // A timber tower with a cable-car hut on top.
    return make(w + 2, h + 1.4, ppm, (g) => {
      const cx = w / 2 + 1;
      const bodyH = Math.min(5.4, h * 0.42);
      const legTop = bodyH + 0.4;
      const spread = w * 0.42;
      line(g, cx - spread, h, cx - w * 0.2, legTop, '#8a6a46', 0.5);
      line(g, cx + spread, h, cx + w * 0.2, legTop, '#8a6a46', 0.5);
      const rungs = Math.max(1, Math.floor((h - legTop) / 4.5));
      for (let i = 0; i < rungs; i += 1) {
        const t0 = i / rungs;
        const t1 = (i + 1) / rungs;
        const lx = (t) => cx - (w * 0.2 + (spread - w * 0.2) * t);
        const rx = (t) => cx + (w * 0.2 + (spread - w * 0.2) * t);
        const ly = (t) => legTop + (h - legTop) * t;
        line(g, lx(t0), ly(t0), rx(t1), ly(t1), '#9a7a52', 0.26);
        line(g, rx(t0), ly(t0), lx(t1), ly(t1), '#9a7a52', 0.26);
        line(g, lx(t1), ly(t1), rx(t1), ly(t1), '#8a6a46', 0.3);
      }
      rrect(g, cx - w * 0.34, 2.6, w * 0.68, bodyH - 2.2, 0.4, palette.wall, palette.trim, 0.22);
      poly(g, [cx - w * 0.42, 2.8, cx, 0.5, cx + w * 0.42, 2.8], palette.roof, shade(palette.roof, -0.3), 0.2);
      paintWindow(g, cx, 4.2, taken);
      line(g, 0, 1.4, w + 2, 0.4, '#7a8a9a', 0.2);
    }, 0.5, 1);
  }

  if (kind === 'treehouse') {
    return make(w + 2, h + 1.4, ppm, (g) => {
      const cx = w / 2 + 1;
      line(g, cx, h, cx, 4.4, '#8a6a46', 1.1);
      g.globalAlpha = 0.95;
      const tiers = Math.max(2, Math.floor(h / 7));
      for (let i = 0; i < tiers; i += 1) {
        const ty = h - 1.6 - i * ((h - 6) / tiers);
        const r = 2.6 - 1.2 * (i / tiers);
        circle(g, cx - 1.6, ty, r, '#4f9a4a');
        circle(g, cx + 1.7, ty - 0.6, r * 0.9, '#58a852');
      }
      g.globalAlpha = 1;
      rrect(g, cx - w * 0.36, 2.8, w * 0.72, 3.8, 0.4, palette.wall, palette.trim, 0.2);
      poly(g, [cx - w * 0.46, 3, cx, 0.6, cx + w * 0.46, 3], palette.roof, shade(palette.roof, -0.3), 0.2);
      line(g, cx - w * 0.36, 6.6, cx + w * 0.36, 6.6, '#8a6a46', 0.3);
      paintWindow(g, cx, 4.5, taken);
    }, 0.5, 1);
  }

  if (kind === 'boathouse') {
    return make(w + 2, h + 1.4, ppm, (g) => {
      const cx = w / 2 + 1;
      const bodyH = Math.min(6.4, h * 0.5);
      for (const off of [-w * 0.3, 0, w * 0.3]) line(g, cx + off, h, cx + off, bodyH, '#a08a70', 0.4);
      for (let i = 1; i * 5 < h - bodyH; i += 1) {
        line(g, cx - w * 0.32, bodyH + i * 5, cx + w * 0.32, bodyH + i * 5, '#a08a70', 0.24);
      }
      rrect(g, cx - w * 0.4, 3.2, w * 0.8, bodyH - 2.8, 0.3, palette.wall, palette.trim, 0.22);
      poly(g, [cx - w * 0.5, 3.4, cx, 0.6, cx + w * 0.5, 3.4], palette.roof, shade(palette.roof, -0.3), 0.2);
      paintWindow(g, cx, 4.9, taken);
      circle(g, cx + w * 0.42, 2.4, 0.5, '#ffe08a', '#c89a2c', 0.14);
    }, 0.5, 1);
  }

  // A narrow townhouse with floors, shop awning and a front door.
  return make(w + 1.4, h + 1.4, ppm, (g) => {
    const bodyTop = 2.8;
    const left = 0.9;
    const width = w - 0.4;
    const cx = left + width / 2;
    rrect(g, left, bodyTop, width, h - bodyTop, 0.3, palette.wall, palette.trim, 0.2);
    const floors = Math.max(1, Math.floor((h - bodyTop - 3) / 5.2));
    for (let i = 0; i < floors; i += 1) {
      const fy = bodyTop + 4.6 + i * 5.2;
      if (fy > h - 1) break;
      line(g, left, fy, left + width, fy, palette.trim, 0.12);
      if (fy < h - 4) {
        rrect(g, left + 0.9, fy + 1.2, 1.5, 2.2, 0.2, '#cfe3ef', palette.trim, 0.12);
        rrect(g, left + width - 2.4, fy + 1.2, 1.5, 2.2, 0.2, '#cfe3ef', palette.trim, 0.12);
      }
    }
    poly(g, [left - 0.7, bodyTop + 0.2, cx, 0.4, left + width + 0.7, bodyTop + 0.2], palette.roof, shade(palette.roof, -0.3), 0.2);
    rrect(g, left + width - 2.1, 0.2, 0.9, bodyTop, 0.2, '#b2563f', '#83382a', 0.14);
    if (h > 13 && hash01(seed, 11) > 0.45) {
      const ay = h - 6.6;
      for (let i = 0; i < 5; i += 1) {
        rrect(g, left + i * (width / 5), ay, width / 5, 1.5, 0.1, i % 2 ? '#ffffff' : palette.roof);
      }
    }
    rrect(g, cx - 0.9, h - 3.2, 1.8, 3.2, 0.25, shade(palette.trim, -0.2), palette.trim, 0.12);
    circle(g, cx + 0.55, h - 1.6, 0.14, '#ffe08a');
    paintWindow(g, cx, bodyTop + 1.6, taken);
  }, 0.5, 1);
}

/** Trees, rock needles, masts: things that catch a paper plane. */
export function bakeHazard(kind, reach, ppm = 16) {
  const h = Math.max(6, Math.min(70, reach));
  switch (kind) {
    case 'branch':
      return make(9, h + 1, ppm, (g) => {
        line(g, 4.5, h, 4.5, 1.6, '#6b4a2c', 0.8);
        for (let i = 0; i < Math.max(3, Math.floor(h / 6)); i += 1) {
          const y = h - 1.5 - i * (h / Math.max(3, Math.floor(h / 6)));
          const spread = 1.4 + 2.6 * (1 - i / Math.max(3, Math.floor(h / 6)));
          poly(g, [4.5, y - 1.6, 4.5 + spread, y + 0.9, 4.5 - spread, y + 0.9], '#3f8a46', '#2c6a35', 0.16);
        }
        // Sticky sap on the crown: this is the bit that grabs you.
        poly(g, [4.5, 0.3, 8.2, 3.4, 0.8, 3.4], '#54a558', '#2c6a35', 0.18);
        for (let i = 0; i < 3; i += 1) circle(g, 3.1 + i * 1.4, 2.6 + (i % 2) * 0.5, 0.42, '#ffe08a', '#d9a63c', 0.12);
      }, 0.5, 1);
    case 'spire':
      return make(8, h + 1, ppm, (g) => {
        poly(g, [4, 0.2, 6.6, h, 1.4, h], '#9aa7ad', '#6b7a82', 0.2);
        poly(g, [4, 0.2, 5.2, h, 2.6, h], '#b7c2c7');
        circle(g, 4, 1.4, 0.5, '#e8eef1');
      }, 0.5, 1);
    case 'pole':
    case 'mast':
      return make(5, h + 1, ppm, (g) => {
        line(g, 2.5, h, 2.5, 0.6, '#8b7f6e', 0.44);
        circle(g, 2.5, 0.6, 0.6, '#d9b24c', '#9a7a22', 0.14);
        poly(g, [2.7, 0.9, 4.8, 1.8, 2.7, 2.7], '#ff8fb0', '#c2566f', 0.12);
        for (let i = 1; i < Math.floor(h / 10) + 1; i += 1) {
          line(g, 1.4, i * 10, 3.6, i * 10, '#8b7f6e', 0.22);
        }
      }, 0.5, 1);
    case 'birds':
      return make(13, 6, ppm, (g) => {
        const flock = [[2, 3], [5, 1.8], [8, 3.4], [10.6, 2.2], [6.4, 4.4]];
        for (const [x, y] of flock) {
          g.strokeStyle = '#4b5a72';
          g.lineWidth = 0.4;
          g.beginPath();
          g.moveTo(x - 1.3, y + 0.5);
          g.quadraticCurveTo(x - 0.5, y - 0.6, x, y);
          g.quadraticCurveTo(x + 0.5, y - 0.6, x + 1.3, y + 0.5);
          g.stroke();
          circle(g, x, y + 0.1, 0.3, '#5f7088');
        }
      }, 0.5, 0.5);
    default:
      return make(4, 4, ppm, (g) => circle(g, 2, 2, 1.6, '#8b7f6e'));
  }
}

/**
 * Ground sprinkles: whatever grows or sits on the valley floor. One painter,
 * a handful of kinds, picked per region so each place looks like itself.
 */
export function bakeTuft(kind, seed, ppm = 18) {
  switch (kind) {
    case 'pine':
    case 'pinesnow': {
      const tall = 9 + hash01(seed, 2) * 7;
      const snowy = kind === 'pinesnow';
      return make(7, tall + 1, ppm, (g) => {
        line(g, 3.5, tall, 3.5, tall * 0.5, '#6b4a2c', 0.55);
        const tiers = 4;
        for (let i = 0; i < tiers; i += 1) {
          const base = tall * (0.92 - i * 0.2);
          const apex = base - tall * 0.28;
          const spread = 2.9 * (1 - i * 0.21);
          poly(g, [3.5, apex, 3.5 + spread, base, 3.5 - spread, base],
            snowy ? '#5c8f6c' : '#3f8a46', snowy ? '#43705a' : '#2c6a35', 0.16);
          if (snowy) {
            g.globalAlpha = 0.85;
            poly(g, [3.5, apex, 3.5 + spread * 0.55, apex + tall * 0.11, 3.5 - spread * 0.55, apex + tall * 0.11], '#f2f8ff');
            g.globalAlpha = 1;
          }
        }
      }, 0.5, 1);
    }
    case 'bush':
      return make(4, 3, ppm, (g) => {
        circle(g, 1.3, 2.3, 0.85, '#4f9a4a');
        circle(g, 2.6, 2.4, 0.75, '#5fb155');
        circle(g, 1.95, 1.7, 0.8, '#69bd5c');
      }, 0.5, 1);
    case 'fern':
      return make(4, 2.6, ppm, (g) => {
        for (let i = 0; i < 5; i += 1) {
          const a = -1.2 + i * 0.6;
          g.beginPath();
          g.moveTo(2, 2.5);
          g.quadraticCurveTo(2 + Math.sin(a) * 1.1, 1.4, 2 + Math.sin(a) * 1.9, 0.5 + Math.abs(Math.sin(a)) * 0.7);
          g.strokeStyle = '#4f9a4a';
          g.lineWidth = 0.22;
          g.stroke();
        }
      }, 0.5, 1);
    case 'flower':
      return make(3, 2.6, ppm, (g) => {
        line(g, 1.5, 2.5, 1.4, 1.1, '#4f9a4a', 0.14);
        const petal = ['#ff9ec4', '#ffe08a', '#b9a6ff', '#ffffff'][Math.floor(hash01(seed, 2) * 4)];
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * TAU;
          circle(g, 1.4 + Math.cos(a) * 0.34, 0.95 + Math.sin(a) * 0.34, 0.26, petal);
        }
        circle(g, 1.4, 0.95, 0.2, '#fff3b0');
      }, 0.5, 1);
    case 'rock':
      return make(4.4, 2.6, ppm, (g) => {
        poly(g, [0.5, 2.5, 1.1, 1.1, 2.4, 0.6, 3.6, 1.5, 3.9, 2.5], '#a9b3b8', '#7d878c', 0.16);
        poly(g, [1.4, 2.5, 2.1, 1.3, 3.0, 1.1, 3.1, 2.5], '#c3ccd0');
      }, 0.5, 1);
    case 'snowrock':
      return make(5, 3, ppm, (g) => {
        poly(g, [0.5, 2.9, 1.3, 1.1, 2.7, 0.5, 4.1, 1.6, 4.5, 2.9], '#b9c6d6', '#8e9cae', 0.16);
        poly(g, [1.1, 1.5, 2.7, 0.5, 4.0, 1.5, 2.6, 1.9], '#f4faff');
      }, 0.5, 1);
    case 'reed':
      return make(4, 3.2, ppm, (g) => {
        for (let i = 0; i < 5; i += 1) {
          const x = 0.8 + i * 0.6;
          line(g, x, 3.1, x + (hash01(seed, i) - 0.5) * 0.9, 0.6 + hash01(seed, i + 7) * 1.1, '#6f9a52', 0.16);
        }
        circle(g, 1.4, 0.8, 0.22, '#b88a4e');
        circle(g, 3.1, 1.0, 0.2, '#b88a4e');
      }, 0.5, 1);
    case 'fence':
      return make(7, 2.4, ppm, (g) => {
        line(g, 0.4, 1.3, 6.6, 1.3, '#cbb28c', 0.26);
        line(g, 0.4, 1.9, 6.6, 1.9, '#cbb28c', 0.26);
        for (let i = 0; i < 4; i += 1) line(g, 0.8 + i * 1.8, 2.3, 0.8 + i * 1.8, 0.8, '#b89a70', 0.3);
      }, 0.5, 1);
    default:
      return make(3.4, 2.6, ppm, (g) => {
        for (let i = 0; i < 5; i += 1) {
          const x = 0.6 + i * 0.55;
          line(g, x, 2.5, x + (hash01(seed, i) - 0.5) * 0.8, 0.8 + hash01(seed, i + 7) * 0.9, '#5fa94a', 0.16);
        }
      }, 0.5, 1);
  }
}

/** What grows on the floor of each region, with how often each kind turns up. */
export const SCENERY = {
  town: [['grass', 0.3], ['flower', 0.24], ['bush', 0.18], ['fence', 0.14], ['pine', 0.09], ['rock', 0.05]],
  cliffs: [['grass', 0.38], ['rock', 0.26], ['bush', 0.16], ['flower', 0.12], ['pine', 0.08]],
  forest: [['pine', 0.44], ['fern', 0.2], ['bush', 0.18], ['grass', 0.12], ['flower', 0.06]],
  lake: [['reed', 0.34], ['grass', 0.26], ['bush', 0.18], ['flower', 0.14], ['pine', 0.08]],
  peaks: [['snowrock', 0.34], ['pinesnow', 0.3], ['grass', 0.22], ['rock', 0.14]],
};

/**
 * A tiled band of far hills. The ridge is a sum of sines at whole-number
 * frequencies, so it rolls smoothly and the tile repeats without a seam.
 */
export function bakeHills(color, seed, { width = 1024, height = 170, jag = 0.5, snow = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const waves = [1, 2, 3, 5, 8].map((freq, i) => ({
    freq,
    amp: 1 / (1 + i * 1.15),
    phase: hash01(seed, i) * TAU,
  }));
  const ridge = (t) => {
    let v = 0;
    let total = 0;
    for (const wave of waves) {
      v += Math.sin(t * TAU * wave.freq + wave.phase) * wave.amp;
      total += wave.amp;
    }
    return v / total;               // -1 .. 1
  };
  const yAt = (t) => height * (0.99 - (0.3 + ridge(t) * 0.26 * (0.5 + jag)) * 0.92);

  g.beginPath();
  g.moveTo(0, height);
  for (let x = 0; x <= width; x += 3) g.lineTo(x, yAt(x / width));
  g.lineTo(width, height);
  g.closePath();
  g.fillStyle = color;
  g.fill();

  if (snow) {
    g.save();
    g.clip();
    g.fillStyle = snow;
    // Caps on the high ground only, following the ridge.
    const cap = height * 0.46;
    g.beginPath();
    g.moveTo(0, cap);
    for (let x = 0; x <= width; x += 3) g.lineTo(x, yAt(x / width));
    g.lineTo(width, cap);
    g.closePath();
    g.fill();
    g.restore();
  }
  return { img: canvas, w: width, h: height, color };
}

export function bakeSky(colors, width = 8, height = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(0.62, colors[1]);
  grad.addColorStop(1, colors[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, width, height);
  return { img: canvas, w: width, h: height };
}

/** A letter in flight, for the delivery flourish. */
export function bakeLetter(ppm = 30) {
  return make(2.2, 1.6, ppm, (g) => {
    rrect(g, 0.1, 0.1, 2, 1.4, 0.16, '#fffaf0', '#d9b98a', 0.12);
    poly(g, [0.1, 0.16, 1.1, 1.0, 2.1, 0.16], null, '#d9b98a', 0.1);
    rrect(g, 1.3, 0.28, 0.6, 0.42, 0.08, '#ff9ec4');
  }, 0.5, 0.5);
}

/**
 * What a warm column rises from: a chimney pot, a campfire, sun-baked rock or
 * a warm shoal. Drawn at the base of every `up` source so the lift has a
 * visible cause.
 */
export function bakeVent(kind, ppm = 20) {
  switch (kind) {
    case 'campfire':
      return make(7, 4.2, ppm, (g) => {
        for (let i = 0; i < 4; i += 1) {
          line(g, 1.6 + i * 0.5, 3.9, 4.4 - i * 0.5, 2.6, '#7d5a38', 0.42);
        }
        poly(g, [3.5, 0.5, 4.9, 3.1, 2.1, 3.1], '#ff9a3c', '#e0631c', 0.18);
        poly(g, [3.5, 1.5, 4.2, 3.1, 2.8, 3.1], '#ffe08a');
        circle(g, 1.1, 3.9, 0.45, '#9aa7ad');
        circle(g, 5.9, 3.9, 0.45, '#9aa7ad');
      }, 0.5, 1);
    case 'warmrock':
      return make(10, 4.6, ppm, (g) => {
        poly(g, [0.6, 4.4, 2.2, 1.4, 5.4, 0.7, 8.2, 2.2, 9.4, 4.4], '#b8a894', '#8c7b68', 0.22);
        poly(g, [2.4, 4.4, 3.6, 2.2, 5.6, 1.6, 6.8, 3.0], '#d4c6b0');
        g.globalAlpha = 0.55;
        poly(g, [4.4, 1.3, 6.6, 1.9, 5.2, 2.6], '#fff2c2');
        g.globalAlpha = 1;
      }, 0.5, 1);
    case 'shoal':
      return make(12, 2.6, ppm, (g) => {
        g.globalAlpha = 0.7;
        for (let i = 0; i < 3; i += 1) {
          g.beginPath();
          g.ellipse(3 + i * 3, 1.8 - i * 0.2, 2.4, 0.6, 0, 0, TAU);
          g.fillStyle = '#e8dcae';
          g.fill();
        }
        g.globalAlpha = 1;
        for (let i = 0; i < 4; i += 1) line(g, 2 + i * 2.6, 2.4, 2.4 + i * 2.6, 0.6, '#6f9a52', 0.16);
      }, 0.5, 1);
    default:   // a chimney pot on a little roof
      return make(7, 7.4, ppm, (g) => {
        poly(g, [0.3, 7.2, 3.5, 3.2, 6.7, 7.2], '#d4694f', '#a24a37', 0.22);
        rrect(g, 4.2, 1.1, 1.6, 3.4, 0.3, '#b2563f', '#83382a', 0.2);
        rrect(g, 4.0, 0.7, 2, 0.8, 0.26, '#8c4030');
        rrect(g, 1.2, 5.1, 1.5, 1.6, 0.25, '#fff4c8', '#9a7a4a', 0.16);
      }, 0.5, 1);
  }
}
