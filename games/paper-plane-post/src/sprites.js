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
  grad.addColorStop(0, 'rgba(255, 216, 150, 0.5)');
  grad.addColorStop(0.45, 'rgba(255, 232, 186, 0.26)');
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
  return make(2.4, 1.1, ppm * 20, (g) => {
    for (let i = 0; i < puffs; i += 1) {
      const x = 0.34 + (i / (puffs - 1)) * 1.7;
      const r = 0.22 + hash01(seed, i) * 0.3;
      circle(g, x, 0.74 - hash01(seed, i + 9) * 0.1, r, 'rgba(255, 255, 255, 0.92)');
    }
    g.globalAlpha = 0.55;
    for (let i = 0; i < puffs; i += 1) {
      const x = 0.38 + (i / (puffs - 1)) * 1.7;
      circle(g, x, 0.58, 0.2 + hash01(seed, i + 4) * 0.2, '#ffffff');
    }
    g.globalAlpha = 1;
  }, 0.5, 0.6);
}

export function bakeSun(accent, ppm = 6) {
  return make(4, 4, ppm * 20, (g) => {
    g.globalAlpha = 0.18;
    circle(g, 2, 2, 1.9, accent);
    g.globalAlpha = 0.3;
    circle(g, 2, 2, 1.3, accent);
    g.globalAlpha = 1;
    circle(g, 2, 2, 0.78, '#fff6d8');
  }, 0.5, 0.5);
}

/** A ring the letters fly through: baked once, tinted when taken. */
export function bakeRing(taken, ppm = 22) {
  const r = 9;
  return make(r * 2 + 2.4, r * 2 + 2.4, ppm / 4, (g) => {
    const c = r + 1.2;
    g.lineWidth = 1.5;
    g.strokeStyle = taken ? 'rgba(255, 214, 110, 0.95)' : 'rgba(255, 255, 255, 0.78)';
    g.beginPath();
    g.ellipse(c, c, r, r * 0.96, 0, 0, TAU);
    g.stroke();
    g.lineWidth = 0.6;
    g.strokeStyle = taken ? 'rgba(255, 246, 206, 0.95)' : 'rgba(190, 228, 255, 0.8)';
    g.beginPath();
    g.ellipse(c, c, r - 1.2, r * 0.96 - 1.2, 0, 0, TAU);
    g.stroke();
    // Little ribbons so the ring reads as paper, not metal.
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + 0.3;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r * 0.96;
      circle(g, x, y, 0.75, taken ? '#ffd66e' : '#eaf6ff');
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

/**
 * A building with a window the letter goes through. One painter covers the
 * whole valley: the region just changes the roof, the colours and the trim.
 */
export function bakeDrop(kind, height, taken, seed, ppm = 16) {
  const h = Math.max(6, Math.min(26, height));
  const w = kind === 'treehouse' ? 6.4 : 8.2;
  const palette = {
    house: { wall: '#f7e5c8', roof: '#d4694f', trim: '#b98f5e' },
    hut: { wall: '#e9e2d2', roof: '#6f93a6', trim: '#8d8171' },
    treehouse: { wall: '#d6b184', roof: '#6aa75a', trim: '#8a6a46' },
    boathouse: { wall: '#eef3f6', roof: '#5f8fbe', trim: '#9ab0bf' },
    cabin: { wall: '#e8d6bd', roof: '#9fb6d2', trim: '#8a6a46' },
  }[kind] || { wall: '#f7e5c8', roof: '#d4694f', trim: '#b98f5e' };
  return make(w + 1, h + 1.2, ppm, (g) => {
    const bodyTop = 2.6;
    if (kind === 'treehouse') {
      // A trunk to the ground with the cabin up top.
      line(g, w / 2 + 0.5, h, w / 2 + 0.5, bodyTop + 2, '#8a6a46', 1.1);
      g.globalAlpha = 0.85;
      for (let i = 0; i < 3; i += 1) {
        circle(g, 1.6 + i * 1.9, h - 2 - i * 1.2, 1.5, '#4f9a4a');
      }
      g.globalAlpha = 1;
    } else {
      rrect(g, 1.1, bodyTop, w - 1.2, h - bodyTop, 0.3, palette.wall, palette.trim, 0.2);
      for (let i = 0; i < Math.floor((h - bodyTop) / 4.5); i += 1) {
        line(g, 1.1, bodyTop + 3.4 + i * 4.5, w - 0.1, bodyTop + 3.4 + i * 4.5, palette.trim, 0.12);
      }
    }
    // Roof.
    poly(g, [0.5, bodyTop + 0.2, w / 2 + 0.5, 0.4, w + 0.5, bodyTop + 0.2], palette.roof, shade(palette.roof, -0.3), 0.18);
    if (kind === 'treehouse') {
      rrect(g, 1.4, bodyTop, w - 1.8, 3.6, 0.3, palette.wall, palette.trim, 0.18);
    }
    if (kind === 'house' || kind === 'cabin') {
      rrect(g, w - 2.2, 0.1, 0.9, bodyTop, 0.2, '#b2563f', '#83382a', 0.14);
    }
    // The lit window the letter goes through, right at the top.
    const wx = w / 2 + 0.5;
    const wy = bodyTop + 1.5;
    rrect(g, wx - 1.1, wy - 1.0, 2.2, 2.0, 0.25, taken ? '#ffe9a8' : '#fff4c8', '#9a7a4a', 0.16);
    line(g, wx, wy - 1.0, wx, wy + 1.0, '#9a7a4a', 0.12);
    line(g, wx - 1.1, wy, wx + 1.1, wy, '#9a7a4a', 0.12);
    if (taken) {
      // A happy little plant appears in the window once the post arrives.
      circle(g, wx + 0.45, wy + 0.52, 0.3, '#ff8fb0');
      circle(g, wx - 0.45, wy + 0.52, 0.26, '#8fd45c');
    }
    if (hash01(seed, 5) > 0.5 && kind !== 'treehouse') {
      line(g, 1.5, bodyTop + 0.4, w - 0.5, bodyTop + 0.4, shade(palette.roof, -0.2), 0.12);
    }
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

/** Grass tufts, flowers, rocks: cheap foreground sprinkles. */
export function bakeTuft(kind, seed, ppm = 20) {
  return make(2.6, 2.2, ppm, (g) => {
    if (kind === 'flower') {
      line(g, 1.3, 2.1, 1.2, 0.9, '#4f9a4a', 0.12);
      const petal = ['#ff9ec4', '#ffe08a', '#b9a6ff', '#9be8ff'][Math.floor(hash01(seed, 2) * 4)];
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * TAU;
        circle(g, 1.2 + Math.cos(a) * 0.3, 0.8 + Math.sin(a) * 0.3, 0.24, petal);
      }
      circle(g, 1.2, 0.8, 0.18, '#fff3b0');
    } else if (kind === 'rock') {
      poly(g, [0.4, 2.1, 0.8, 1.1, 1.6, 0.9, 2.2, 2.1], '#a9b3b8', '#7d878c', 0.12);
    } else if (kind === 'reed') {
      for (let i = 0; i < 4; i += 1) {
        line(g, 0.7 + i * 0.4, 2.1, 0.5 + i * 0.5, 0.5 + hash01(seed, i) * 0.6, '#6f9a52', 0.1);
      }
    } else {
      for (let i = 0; i < 5; i += 1) {
        const x = 0.4 + i * 0.45;
        line(g, x, 2.1, x + (hash01(seed, i) - 0.5) * 0.6, 0.7 + hash01(seed, i + 7) * 0.7, '#5fa94a', 0.12);
      }
    }
  }, 0.5, 1);
}

/** A tiled band of far hills, repeated across the sky. */
export function bakeHills(color, seed, { width = 1024, height = 170, jag = 0.5, snow = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const points = [];
  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    // Matching ends keep the tile seamless.
    const wobble = Math.sin(t * TAU) * 0.5 + 0.5;
    const n = hash01(seed, i % steps) * 0.6 + hash01(seed + 31, (i * 7) % steps) * 0.4;
    points.push([t * width, height * (0.95 - (0.25 + n * jag) * (0.5 + wobble * 0.5))]);
  }
  g.beginPath();
  g.moveTo(0, height);
  for (const [x, y] of points) g.lineTo(x, y);
  g.lineTo(width, height);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  if (snow) {
    g.save();
    g.clip();
    g.fillStyle = snow;
    for (const [x, y] of points) {
      g.beginPath();
      g.moveTo(x - 36, y + 34);
      g.lineTo(x, y - 2);
      g.lineTo(x + 36, y + 34);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  return { img: canvas, w: width, h: height };
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
