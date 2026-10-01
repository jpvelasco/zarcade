// Baked art: bubbles, specials, otters, Coral the crab. Everything is drawn
// once per size into offscreen canvases; the frame loop only blits.
import { otterLook } from './otters.js';

export const PALETTE = [
  { name: 'Coral', base: '#ff5d5d', light: '#ffc0b4', dark: '#b8263a', glyph: 'heart' },
  { name: 'Sunny', base: '#ffc531', light: '#fff3b0', dark: '#cf7f00', glyph: 'star' },
  { name: 'Kelp', base: '#36c96a', light: '#c0f7cf', dark: '#137d3d', glyph: 'leaf' },
  { name: 'Sea', base: '#3d9bff', light: '#c6e4ff', dark: '#1a52b8', glyph: 'drop' },
  { name: 'Shell', base: '#ff7fcb', light: '#ffd7ef', dark: '#b5307f', glyph: 'flower' },
  { name: 'Berry', base: '#9a6bff', light: '#e0d1ff', dark: '#5426b8', glyph: 'moon' },
];

function canvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' && !globalThis.document
    ? new OffscreenCanvas(w, h)
    : document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ------------------------------------------------------------- glyphs

function glyphPath(ctx, kind, s) {
  ctx.beginPath();
  switch (kind) {
    case 'heart':
      ctx.moveTo(0, s * 0.75);
      ctx.bezierCurveTo(-s * 1.2, -s * 0.05, -s * 0.55, -s * 0.95, 0, -s * 0.35);
      ctx.bezierCurveTo(s * 0.55, -s * 0.95, s * 1.2, -s * 0.05, 0, s * 0.75);
      break;
    case 'star':
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? s * 0.42 : s;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    case 'leaf':
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.95, -s * 0.1, 0, s);
      ctx.quadraticCurveTo(-s * 0.95, -s * 0.1, 0, -s);
      break;
    case 'drop':
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.4, -s * 0.4, s * 0.75, 0, s * 0.75, s * 0.3);
      ctx.arc(0, s * 0.3, s * 0.75, 0, Math.PI);
      ctx.bezierCurveTo(-s * 0.75, 0, -s * 0.4, -s * 0.4, 0, -s);
      break;
    case 'flower':
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
        ctx.moveTo(Math.cos(a) * s * 0.55 + s * 0.42, Math.sin(a) * s * 0.55);
        ctx.arc(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, s * 0.42, 0, Math.PI * 2);
      }
      break;
    case 'moon':
      ctx.arc(0, 0, s * 0.85, Math.PI * 0.3, Math.PI * 1.7);
      ctx.arc(s * 0.38, -s * 0.05, s * 0.62, Math.PI * 1.55, Math.PI * 0.45, true);
      ctx.closePath();
      break;
    default:
      ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
  }
}

// ------------------------------------------------------------ bubbles

function sphere(ctx, r, { base, light, dark }, alpha = 1) {
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r);
  g.addColorStop(0, light);
  g.addColorStop(0.5, base);
  g.addColorStop(1, dark);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function shine(ctx, r, strength = 1) {
  ctx.save();
  ctx.globalAlpha = 0.85 * strength;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.36, -r * 0.44, r * 0.34, r * 0.19, -0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.7 * strength;
  ctx.beginPath();
  ctx.arc(-r * 0.62, -r * 0.08, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
  // soft bounce light on the lower right
  ctx.globalAlpha = 0.35 * strength;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, Math.PI * 0.12, Math.PI * 0.45);
  ctx.stroke();
  ctx.restore();
}

function rim(ctx, r, color, width = 0.06, alpha = 0.45) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * width;
  ctx.beginPath();
  ctx.arc(0, 0, r * (1 - width / 2), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function colorBubble(ctx, r, color) {
  const p = PALETTE[color];
  sphere(ctx, r, p);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ffffff';
  ctx.translate(r * 0.04, r * 0.06);
  glyphPath(ctx, p.glyph, r * 0.38);
  ctx.fill();
  ctx.restore();
  rim(ctx, r, p.dark);
  shine(ctx, r);
}

function glassBubble(ctx, r, tint = 'rgba(170, 236, 255, 0.28)') {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
  g.addColorStop(0.7, tint);
  g.addColorStop(1, 'rgba(120, 220, 255, 0.55)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
}

function glassRim(ctx, r) {
  rim(ctx, r, '#ffffff', 0.08, 0.85);
  shine(ctx, r, 0.9);
}

function rainbowBubble(ctx, r) {
  const colors = ['#ff5d5d', '#ff9f43', '#ffd93d', '#4cd07d', '#3d9bff', '#9a6bff'];
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  for (let k = 0; k < colors.length; k++) {
    ctx.fillStyle = colors[k];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 1.1, -Math.PI / 2 + (k * Math.PI * 2) / 6, -Math.PI / 2 + ((k + 1) * Math.PI * 2) / 6);
    ctx.closePath();
    ctx.fill();
  }
  const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(40,20,80,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.9;
  glyphPath(ctx, 'star', r * 0.34);
  ctx.fill();
  ctx.globalAlpha = 1;
  rim(ctx, r, '#ffffff', 0.07, 0.7);
  shine(ctx, r);
}

function stoneBubble(ctx, r) {
  sphere(ctx, r, { base: '#8d96a3', light: '#d5dbe3', dark: '#525b68' });
  ctx.fillStyle = 'rgba(60, 66, 78, 0.45)';
  const spots = [[-0.3, 0.2, 0.16], [0.35, -0.1, 0.12], [0.1, 0.45, 0.1], [-0.05, -0.35, 0.08], [0.45, 0.35, 0.07]];
  for (const [x, y, s] of spots) {
    ctx.beginPath();
    ctx.ellipse(x * r, y * r, s * r, s * r * 0.8, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(50, 55, 66, 0.5)';
  ctx.lineWidth = r * 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, -r * 0.05);
  ctx.quadraticCurveTo(-r * 0.2, r * 0.05, r * 0.05, -r * 0.18);
  ctx.stroke();
  rim(ctx, r, '#3c434e', 0.07, 0.5);
  shine(ctx, r, 0.45);
}

function iceOverlay(ctx, r, hp) {
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, 'rgba(235, 252, 255, 0.78)');
  g.addColorStop(1, 'rgba(150, 215, 255, 0.55)');
  ctx.fillStyle = g;
  ctx.beginPath();
  // a faceted block of ice
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    ctx.lineTo(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = r * 0.08;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.5);
  ctx.lineTo(-r * 0.15, -r * 0.62);
  ctx.moveTo(-r * 0.62, -r * 0.18);
  ctx.lineTo(-r * 0.52, -r * 0.42);
  ctx.stroke();
  if (hp <= 1) {
    ctx.strokeStyle = 'rgba(40, 90, 140, 0.75)';
    ctx.lineWidth = r * 0.055;
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.9);
    ctx.lineTo(-r * 0.05, -r * 0.3);
    ctx.lineTo(r * 0.3, r * 0.05);
    ctx.lineTo(r * 0.05, r * 0.45);
    ctx.lineTo(r * 0.35, r * 0.85);
    ctx.moveTo(r * 0.3, r * 0.05);
    ctx.lineTo(r * 0.8, -r * 0.1);
    ctx.moveTo(-r * 0.05, -r * 0.3);
    ctx.lineTo(-r * 0.6, -r * 0.05);
    ctx.stroke();
  }
}

function bombIcon(ctx, r) {
  ctx.fillStyle = '#26314a';
  ctx.beginPath();
  ctx.arc(0, r * 0.1, r * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a5878';
  ctx.beginPath();
  ctx.arc(-r * 0.17, -r * 0.08, r * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#26314a';
  ctx.fillRect(-r * 0.14, -r * 0.55, r * 0.28, r * 0.2);
  ctx.strokeStyle = '#c9a36b';
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.55);
  ctx.quadraticCurveTo(r * 0.12, -r * 0.82, r * 0.38, -r * 0.72);
  ctx.stroke();
  // spark
  ctx.fillStyle = '#ffd23f';
  glyphPathAt(ctx, 'star', r * 0.42, -r * 0.74, r * 0.2);
  ctx.fill();
  // friendly face
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-r * 0.18, r * 0.1, r * 0.08, 0, Math.PI * 2);
  ctx.arc(r * 0.18, r * 0.1, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.arc(0, r * 0.22, r * 0.14, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function glyphPathAt(ctx, kind, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  glyphPath(ctx, kind, s);
  ctx.restore();
}

function boltPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(r * 0.12, -r * 0.72);
  ctx.lineTo(-r * 0.38, r * 0.08);
  ctx.lineTo(-r * 0.02, r * 0.08);
  ctx.lineTo(-r * 0.14, r * 0.72);
  ctx.lineTo(r * 0.4, -r * 0.12);
  ctx.lineTo(r * 0.04, -r * 0.12);
  ctx.closePath();
}

function zapIcon(ctx, r) {
  ctx.fillStyle = '#ffe14d';
  boltPath(ctx, r);
  ctx.fill();
  ctx.strokeStyle = '#c77800';
  ctx.lineWidth = r * 0.06;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function anchorIcon(ctx, r) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const draw = (color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(0, -r * 0.55, r * 0.17, 0, Math.PI * 2);
    ctx.moveTo(0, -r * 0.38);
    ctx.lineTo(0, r * 0.62);
    ctx.moveTo(-r * 0.38, -r * 0.18);
    ctx.lineTo(r * 0.38, -r * 0.18);
    ctx.moveTo(-r * 0.66, r * 0.18);
    ctx.quadraticCurveTo(-r * 0.55, r * 0.66, 0, r * 0.66);
    ctx.quadraticCurveTo(r * 0.55, r * 0.66, r * 0.66, r * 0.18);
    ctx.stroke();
  };
  draw('#3b2a1a', r * 0.3);
  draw('#ffcf5a', r * 0.17);
  ctx.fillStyle = '#ffcf5a';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.8, r * 0.1);
    ctx.lineTo(s * r * 0.5, r * 0.2);
    ctx.lineTo(s * r * 0.72, r * 0.38);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// --------------------------------------------------------------- otters

// An otter's head, centered on (0, 0), about 1 unit in radius.
export function drawOtterHead(ctx, look, { silhouette = false, happy = false } = {}) {
  const f = silhouette ? { fur: '#20344d', light: '#20344d', dark: '#20344d' } : look.fur;
  const ink = silhouette ? '#20344d' : '#2a1a10';
  // ears
  for (const s of [-1, 1]) {
    ctx.fillStyle = f.dark;
    ctx.beginPath();
    ctx.arc(s * 0.62, -0.52, 0.22, 0, Math.PI * 2);
    ctx.fill();
    if (!silhouette) {
      ctx.fillStyle = f.light;
      ctx.beginPath();
      ctx.arc(s * 0.62, -0.52, 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = f.fur;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.84, 0.74, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!silhouette) {
    ctx.fillStyle = f.light;
    ctx.beginPath();
    ctx.ellipse(0, 0.24, 0.52, 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-0.24, -0.16, 0.2, 0.15, 0, 0, Math.PI * 2);
    ctx.ellipse(0.24, -0.16, 0.2, 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    // cheeks
    ctx.fillStyle = 'rgba(255, 120, 140, 0.38)';
    ctx.beginPath();
    ctx.ellipse(-0.52, 0.2, 0.14, 0.09, 0, 0, Math.PI * 2);
    ctx.ellipse(0.52, 0.2, 0.14, 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = ink;
    if (happy) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 0.09;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(-0.27, -0.1, 0.1, Math.PI * 1.1, Math.PI * 1.9);
      ctx.moveTo(0.37, -0.1);
      ctx.arc(0.27, -0.1, 0.1, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-0.27, -0.12, 0.11, 0, Math.PI * 2);
      ctx.arc(0.27, -0.12, 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-0.24, -0.16, 0.04, 0, Math.PI * 2);
      ctx.arc(0.3, -0.16, 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
    // nose and mouth
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(0, 0.1, 0.13, 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.055;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0.18);
    ctx.lineTo(0, 0.26);
    ctx.arc(-0.09, 0.26, 0.09, 0, Math.PI * 0.9);
    ctx.moveTo(0, 0.26);
    ctx.arc(0.09, 0.26, 0.09, Math.PI, Math.PI * 0.1, true);
    ctx.stroke();
    // whisker dots
    ctx.fillStyle = 'rgba(42, 26, 16, 0.45)';
    for (const [x, y] of [[-0.3, 0.22], [-0.36, 0.3], [0.3, 0.22], [0.36, 0.3]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawAccessory(ctx, look.accessory, silhouette);
}

function drawAccessory(ctx, kind, silhouette) {
  const c = (color) => (silhouette ? '#20344d' : color);
  ctx.save();
  switch (kind) {
    case 'bow':
      ctx.translate(0.5, -0.66);
      ctx.rotate(0.3);
      ctx.fillStyle = c('#ff6fae');
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-0.3, -0.18);
      ctx.lineTo(-0.3, 0.18);
      ctx.closePath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0.3, -0.18);
      ctx.lineTo(0.3, 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c('#d63d83');
      ctx.beginPath();
      ctx.arc(0, 0, 0.08, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'sailor':
      ctx.fillStyle = c('#ffffff');
      ctx.beginPath();
      ctx.ellipse(0, -0.7, 0.5, 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.36, -0.72);
      ctx.quadraticCurveTo(0, -1.15, 0.36, -0.72);
      ctx.fill();
      ctx.fillStyle = c('#2f6fd6');
      ctx.fillRect(-0.36, -0.82, 0.72, 0.08);
      break;
    case 'flower':
      ctx.translate(-0.56, -0.62);
      ctx.fillStyle = c('#ffe14d');
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = c('#ff8a3d');
      ctx.beginPath();
      ctx.arc(0, 0, 0.08, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'starfish':
      ctx.translate(0.1, -0.78);
      ctx.rotate(-0.2);
      ctx.fillStyle = c('#ff8f4a');
      glyphPath(ctx, 'star', 0.24);
      ctx.fill();
      break;
    case 'glasses':
      ctx.strokeStyle = c('#2b4b7a');
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.arc(-0.27, -0.12, 0.17, 0, Math.PI * 2);
      ctx.moveTo(0.44, -0.12);
      ctx.arc(0.27, -0.12, 0.17, 0, Math.PI * 2);
      ctx.moveTo(-0.1, -0.14);
      ctx.lineTo(0.1, -0.14);
      ctx.stroke();
      break;
    case 'beanie':
      ctx.fillStyle = c('#ff5d5d');
      ctx.beginPath();
      ctx.moveTo(-0.62, -0.5);
      ctx.quadraticCurveTo(0, -1.25, 0.62, -0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c('#ffffff');
      ctx.fillRect(-0.64, -0.6, 1.28, 0.14);
      ctx.beginPath();
      ctx.arc(0, -1.0, 0.11, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
  }
  ctx.restore();
}

// A whole otter floating on its back, holding a shell. About 3 x 1.6 units.
export function drawOtterFloat(ctx, look) {
  const f = look.fur;
  ctx.fillStyle = f.dark;
  ctx.beginPath();
  ctx.ellipse(-1.25, 0.12, 0.55, 0.18, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = f.fur;
  ctx.beginPath();
  ctx.ellipse(-0.1, 0.05, 1.05, 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = f.light;
  ctx.beginPath();
  ctx.ellipse(-0.1, -0.08, 0.8, 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // toes up
  ctx.fillStyle = f.dark;
  ctx.beginPath();
  ctx.ellipse(-0.9, -0.36, 0.14, 0.1, -0.4, 0, Math.PI * 2);
  ctx.ellipse(-0.62, -0.42, 0.14, 0.1, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // shell on the belly
  ctx.fillStyle = '#ffd3b0';
  ctx.beginPath();
  ctx.moveTo(-0.32, -0.3);
  ctx.arc(-0.05, -0.3, 0.27, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d98b6a';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  for (let k = 1; k < 4; k++) {
    const a = Math.PI + (k * Math.PI) / 4;
    ctx.moveTo(-0.05, -0.3);
    ctx.lineTo(-0.05 + Math.cos(a) * 0.27, -0.3 + Math.sin(a) * 0.27);
  }
  ctx.stroke();
  // paws holding it
  ctx.fillStyle = f.dark;
  ctx.beginPath();
  ctx.arc(-0.35, -0.28, 0.1, 0, Math.PI * 2);
  ctx.arc(0.25, -0.28, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(1.05, -0.15);
  ctx.rotate(-0.25);
  ctx.scale(0.62, 0.62);
  drawOtterHead(ctx, look, { happy: true });
  ctx.restore();
}

// ------------------------------------------------------------ the cache

export class Sprites {
  constructor() {
    this.r = 0;
    this.cache = new Map();
    this.otters = new Map();
  }

  // Bubble radius in device pixels. Re-bakes lazily when it changes.
  setRadius(r) {
    r = Math.max(4, Math.round(r * 2) / 2);
    if (r === this.r) return;
    this.r = r;
    this.cache.clear();
    this.otters.clear();
  }

  bake(key, draw, pad = 1.25) {
    let sprite = this.cache.get(key);
    if (sprite) return sprite;
    const r = this.r;
    const size = Math.ceil(r * 2 * pad);
    const c = canvas(size, size);
    const ctx = c.getContext('2d');
    ctx.translate(size / 2, size / 2);
    draw(ctx, r);
    sprite = { canvas: c, half: size / 2 };
    this.cache.set(key, sprite);
    return sprite;
  }

  forCell(cell) {
    switch (cell.k) {
      case 'b': return this.bake(`b${cell.c}`, (ctx, r) => colorBubble(ctx, r, cell.c));
      case 'ice': return this.bake(`i${cell.c}${cell.hp}`, (ctx, r) => { colorBubble(ctx, r * 0.9, cell.c); iceOverlay(ctx, r, cell.hp); });
      case 'rainbow': return this.bake('rainbow', rainbowBubble);
      case 'stone': return this.bake('stone', stoneBubble);
      case 'bomb': return this.bake('bomb', (ctx, r) => { glassBubble(ctx, r, 'rgba(255, 150, 120, 0.35)'); bombIcon(ctx, r); glassRim(ctx, r); });
      case 'zap': return this.bake('zap', (ctx, r) => { glassBubble(ctx, r, 'rgba(120, 140, 255, 0.4)'); zapIcon(ctx, r); glassRim(ctx, r); });
      case 'anchor': return this.bake('anchor', (ctx, r) => { glassBubble(ctx, r, 'rgba(255, 220, 130, 0.3)'); anchorIcon(ctx, r * 1.02); glassRim(ctx, r); });
      case 'otter': return this.otter(cell.o);
      default: return this.bake('b0', (ctx, r) => colorBubble(ctx, r, 0));
    }
  }

  forShot(shot) {
    if (shot.kind === 'b') return this.forCell(shot);
    return this.forCell({ k: shot.kind });
  }

  otter(id) {
    return this.bake(`o${id}`, (ctx, r) => {
      glassBubble(ctx, r, 'rgba(150, 230, 255, 0.3)');
      ctx.save();
      ctx.translate(0, r * 0.08);
      ctx.scale(r * 0.7, r * 0.7);
      drawOtterHead(ctx, otterLook(id));
      ctx.restore();
      glassRim(ctx, r);
    });
  }

  freeOtter(id) {
    let sprite = this.otters.get(id);
    if (sprite) return sprite;
    const r = this.r;
    const w = Math.ceil(r * 3.6), h = Math.ceil(r * 2.2);
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.translate(w * 0.47, h * 0.58);
    ctx.scale(r, r);
    drawOtterFloat(ctx, otterLook(id));
    sprite = { canvas: c, hw: w / 2, hh: h / 2 };
    this.otters.set(id, sprite);
    return sprite;
  }

  // Ghost marker for where the shot will land.
  ghost() {
    return this.bake('ghost', (ctx, r) => {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.setLineDash([r * 0.32, r * 0.22]);
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fill();
    });
  }

  // A soft white disc used for pop flashes and splash droplets.
  dot() {
    return this.bake('dot', (ctx, r) => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }, 1);
  }
}

// Little standalone pictures for the DOM (HUD, cove, results).
export function paintBubbleIcon(target, cell, size = 40) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  target.width = Math.round(size * dpr);
  target.height = Math.round(size * dpr);
  target.style.width = `${size}px`;
  target.style.height = `${size}px`;
  const sprites = new Sprites();
  sprites.setRadius((size * dpr) / 2 / 1.1);
  const sprite = cell.k === 'b' || cell.k === 'otter' || cell.k === 'anchor' || cell.k === 'stone' || cell.k === 'ice' ? sprites.forCell(cell) : sprites.forShot({ kind: cell.k });
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(sprite.canvas, target.width / 2 - sprite.half, target.height / 2 - sprite.half);
}

export function paintOtter(target, id, size, { found = true } = {}) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  target.width = Math.round(size * dpr);
  target.height = Math.round(size * dpr);
  target.style.width = `${size}px`;
  target.style.height = `${size}px`;
  const ctx = target.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.translate(target.width / 2, target.height * 0.56);
  const s = target.width * 0.36;
  ctx.scale(s, s);
  drawOtterHead(ctx, otterLook(id), { silhouette: !found, happy: found });
}

// ------------------------------------------------------------- Coral

// Coral the crab, body only (claws and the shell launcher are drawn live).
export function drawCrabBody(ctx, u, blink = false) {
  // legs
  ctx.strokeStyle = '#d9432c';
  ctx.lineWidth = u * 0.22;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const y = u * (0.1 + k * 0.22);
      ctx.moveTo(s * u * 1.1, y);
      ctx.quadraticCurveTo(s * u * (1.75 + k * 0.1), y - u * 0.2, s * u * (1.95 + k * 0.05), y + u * 0.45);
      ctx.stroke();
    }
  }
  // shell body
  const g = ctx.createLinearGradient(0, -u * 0.8, 0, u * 0.9);
  g.addColorStop(0, '#ff9a5c');
  g.addColorStop(0.55, '#ff6a3d');
  g.addColorStop(1, '#d9432c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, u * 0.18, u * 1.45, u * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 220, 190, 0.5)';
  ctx.beginPath();
  ctx.ellipse(-u * 0.45, -u * 0.18, u * 0.5, u * 0.2, -0.25, 0, Math.PI * 2);
  ctx.fill();
  // freckles
  ctx.fillStyle = 'rgba(190, 50, 30, 0.45)';
  for (const [x, y] of [[0.65, 0.05], [0.85, 0.25], [0.5, 0.3], [-0.8, 0.35]]) {
    ctx.beginPath();
    ctx.arc(x * u, y * u, u * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  // eye stalks
  for (const s of [-1, 1]) {
    ctx.strokeStyle = '#e8553a';
    ctx.lineWidth = u * 0.16;
    ctx.beginPath();
    ctx.moveTo(s * u * 0.35, -u * 0.45);
    ctx.lineTo(s * u * 0.45, -u * 0.95);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s * u * 0.46, -u * 1.08, u * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b73a26';
    ctx.lineWidth = u * 0.05;
    ctx.stroke();
    if (blink) {
      ctx.strokeStyle = '#2a1a10';
      ctx.lineWidth = u * 0.07;
      ctx.beginPath();
      ctx.moveTo(s * u * 0.46 - u * 0.17, -u * 1.06);
      ctx.lineTo(s * u * 0.46 + u * 0.17, -u * 1.06);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();
      ctx.arc(s * u * 0.46 + s * u * 0.03, -u * 1.04, u * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s * u * 0.46 + s * u * 0.07, -u * 1.1, u * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // smile and cheeks
  ctx.strokeStyle = '#7a1d12';
  ctx.lineWidth = u * 0.09;
  ctx.beginPath();
  ctx.arc(0, -u * 0.05, u * 0.32, 0.25, Math.PI - 0.25);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 170, 190, 0.6)';
  ctx.beginPath();
  ctx.ellipse(-u * 0.68, u * 0.08, u * 0.16, u * 0.1, 0, 0, Math.PI * 2);
  ctx.ellipse(u * 0.68, u * 0.08, u * 0.16, u * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawClaw(ctx, u, open = 0) {
  ctx.fillStyle = '#ff7444';
  ctx.strokeStyle = '#c23a24';
  ctx.lineWidth = u * 0.06;
  // pincer halves
  ctx.save();
  ctx.rotate(-0.25 - open * 0.3);
  ctx.beginPath();
  ctx.ellipse(0, -u * 0.22, u * 0.42, u * 0.24, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.rotate(0.15 + open * 0.3);
  ctx.beginPath();
  ctx.ellipse(0, u * 0.1, u * 0.4, u * 0.2, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// The scallop-shell launcher, pointing up its local -y axis.
export function drawLauncher(ctx, u) {
  ctx.fillStyle = '#ffe2c8';
  ctx.strokeStyle = '#e09a78';
  ctx.lineWidth = u * 0.08;
  ctx.beginPath();
  ctx.moveTo(0, u * 0.95);
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI + (k * Math.PI) / 6;
    const r = u * 1.25;
    const mid = Math.PI + ((k - 0.5) * Math.PI) / 6;
    if (k > 0) ctx.quadraticCurveTo(Math.cos(mid) * r * 1.12, Math.sin(mid) * r * 1.12 + u * 0.4, Math.cos(a) * r, Math.sin(a) * r + u * 0.4);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r + u * 0.4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(224, 154, 120, 0.8)';
  ctx.lineWidth = u * 0.06;
  ctx.beginPath();
  for (let k = 1; k < 6; k++) {
    const a = Math.PI + (k * Math.PI) / 6;
    ctx.moveTo(0, u * 0.95);
    ctx.lineTo(Math.cos(a) * u * 1.15, Math.sin(a) * u * 1.15 + u * 0.4);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffb59a';
  ctx.beginPath();
  ctx.ellipse(0, u * 0.95, u * 0.42, u * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

export { canvas as makeCanvas };
