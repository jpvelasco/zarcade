// Canvas renderer. Reads world state and events; never changes the world.
// The camera looks down at the arena at a tilt (y is squashed by TILT and
// height lifts things up the screen). Static art (sky, clouds, floor
// textures, sprites) is baked into offscreen canvases; per-frame drawing is
// plain fills with no shadows or filters.
import { COLORS } from './save.js';
import { tierAt } from './arenas.js';

export const TILT = 0.6;
const THICK = 46; // arena side, world units of height
const TIER_H = 18; // lava tier step height
const SEESAW_LIFT = 0.9; // how much the seesaw tilt shows as height
const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';
const N = 16; // soft-body outline points
const TAU = Math.PI * 2;
const MAX_PARTICLES = 360;
const CANDY = ['#ff5a7e', '#4aa3ff', '#7fdc45', '#ffad2e', '#a874ff', '#3fdcc0', '#ff7ad6', '#ffe14d', '#ffffff'];
const POWER_LOOK = {
  giant: { color: '#ff8a3d', label: 'GIANT!' },
  sticky: { color: '#68d83a', label: 'STICKY!' },
  magnet: { color: '#ff4f6a', label: 'MAGNET!' },
  shield: { color: '#59c8ff', label: 'BUBBLE!' },
};
const BONKS = ['BONK!', 'BOING!', 'WHAM!', 'SPLAT!', 'KAPOW!', 'BOOP!', 'SMOOSH!'];
const FALLS = ['RING OUT!', 'BYE BYE!', 'SEE YA!', 'WHEEE!'];
const DASH = [10, 12];
const NO_DASH = [];

// Small deterministic random for decorations.
function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ------------------------------------------------------------------ soft body

// Render-only jelly: radial offsets on a ring of points springing back to a
// circle, plus a squash spring. Impacts dent the side that was hit.
export class SoftBody {
  constructor() {
    this.o = new Float32Array(N);
    this.v = new Float32Array(N);
    this.sq = 0; this.sqv = 0;
    this.t = Math.random() * 10;
    this.blink = 2 + Math.random() * 3;
    this.wasPound = 0;
    this.wasGrounded = true;
    this.spawnT = 0;
  }

  update(dt, target = 0) {
    this.t += dt;
    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 2 + Math.random() * 3.5;
    const o = this.o, v = this.v;
    for (let i = 0; i < N; i++) {
      const l = o[(i + N - 1) % N], r = o[(i + 1) % N];
      const acc = -260 * o[i] - 9 * v[i] + 90 * ((l + r) / 2 - o[i]);
      v[i] += acc * dt;
    }
    for (let i = 0; i < N; i++) o[i] = Math.max(-0.45, Math.min(0.45, o[i] + v[i] * dt));
    this.sqv += (-180 * (this.sq - target) - 10 * this.sqv) * dt;
    this.sq = Math.max(-0.5, Math.min(0.5, this.sq + this.sqv * dt));
  }

  // Dent the body on the side facing `ang` (screen angle).
  hit(ang, amount) {
    for (let i = 0; i < N; i++) {
      const d = Math.cos((i / N) * TAU - ang);
      if (d > 0.2) this.v[i] -= amount * d * 6;
      else this.v[i] += amount * 1.5;
    }
    this.sqv -= amount * 3;
  }

  squash(amount) { this.sqv += amount; }

  wobble(amount) {
    for (let i = 0; i < N; i++) this.v[i] += Math.sin(i * 2.3 + this.t * 7) * amount;
  }
}

// ------------------------------------------------------------------ sprites

function bakeShade() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  const hi = g.createRadialGradient(46, 34, 4, 52, 46, 70);
  hi.addColorStop(0, 'rgba(255,255,255,0.55)');
  hi.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.fillRect(0, 0, 128, 128);
  const lo = g.createLinearGradient(0, 40, 0, 128);
  lo.addColorStop(0, 'rgba(40,0,60,0)');
  lo.addColorStop(1, 'rgba(40,0,60,0.38)');
  g.fillStyle = lo;
  g.fillRect(0, 0, 128, 128);
  return c;
}

function bakeGlow(color, size = 128) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

function bakeCoin(size) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const gr = g.createRadialGradient(r * 0.7, r * 0.6, 1, r, r, r);
  gr.addColorStop(0, '#fff7c2');
  gr.addColorStop(0.5, '#ffd23a');
  gr.addColorStop(1, '#d68a00');
  g.fillStyle = gr;
  g.beginPath(); g.arc(r, r, r - 1, 0, TAU); g.fill();
  g.strokeStyle = '#a86400';
  g.lineWidth = size * 0.06;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = size * 0.05;
  g.beginPath(); g.arc(r, r, r * 0.66, 0, TAU); g.stroke();
  g.fillStyle = '#b87300';
  g.font = `900 ${size * 0.5}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('★', r, r + size * 0.03);
  return c;
}

function bakePower(kind, size) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const col = POWER_LOOK[kind].color;
  const gr = g.createRadialGradient(r * 0.7, r * 0.6, 1, r, r, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.35, mix(col, '#ffffff', 0.5));
  gr.addColorStop(1, col);
  g.fillStyle = gr;
  g.beginPath(); g.arc(r, r, r - 2, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = size * 0.06;
  g.stroke();
  g.save();
  g.translate(r, r);
  g.scale(size / 64, size / 64);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'giant') {
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(-12, 12); g.lineTo(12, -12); g.moveTo(0, -12); g.lineTo(12, -12); g.lineTo(12, 0);
    g.moveTo(-12, 0); g.lineTo(-12, 12); g.lineTo(0, 12); g.stroke();
  } else if (kind === 'sticky') {
    g.beginPath();
    g.moveTo(-14, -6); g.quadraticCurveTo(0, -18, 14, -6); g.lineTo(14, 2); g.quadraticCurveTo(10, 14, 7, 2);
    g.quadraticCurveTo(2, 8, -2, 2); g.quadraticCurveTo(-6, 16, -10, 2); g.lineTo(-14, 2); g.closePath(); g.fill();
  } else if (kind === 'magnet') {
    g.lineWidth = 8;
    g.beginPath(); g.arc(0, -2, 10, Math.PI, 0, true); g.stroke();
    g.fillStyle = '#ffffff';
    g.fillRect(-14, -4, 8, 12); g.fillRect(6, -4, 8, 12);
  } else {
    g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.stroke();
    g.beginPath(); g.arc(-4, -5, 4, 0, TAU); g.fill();
  }
  g.restore();
  return c;
}

function bakeBomb(size) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = size * 0.38;
  const gr = g.createRadialGradient(size * 0.4, size * 0.5, 1, size / 2, size * 0.58, r);
  gr.addColorStop(0, '#7a6a9a');
  gr.addColorStop(1, '#241a38');
  g.fillStyle = gr;
  g.beginPath(); g.arc(size / 2, size * 0.58, r, 0, TAU); g.fill();
  g.fillStyle = '#3a2f52';
  g.fillRect(size * 0.42, size * 0.12, size * 0.16, size * 0.12);
  g.strokeStyle = '#c9a26a';
  g.lineWidth = size * 0.05;
  g.beginPath(); g.moveTo(size * 0.5, size * 0.12); g.quadraticCurveTo(size * 0.62, 0, size * 0.74, size * 0.06); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath(); g.arc(size * 0.4, size * 0.48, size * 0.08, 0, TAU); g.fill();
  return c;
}

function bakeMushroom(size, hue) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  // stem
  g.fillStyle = '#fff3dc';
  g.beginPath(); g.ellipse(r, size * 0.72, r * 0.42, r * 0.36, 0, 0, TAU); g.fill();
  g.strokeStyle = '#d8b88c'; g.lineWidth = size * 0.03; g.stroke();
  // cap
  const gr = g.createRadialGradient(r * 0.75, size * 0.25, 2, r, size * 0.4, r);
  gr.addColorStop(0, mix(hue, '#ffffff', 0.5));
  gr.addColorStop(1, hue);
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(r, size * 0.45, r * 0.95, r * 0.55, 0, Math.PI, 0); g.quadraticCurveTo(r, size * 0.62, r * 0.05, size * 0.45); g.fill();
  g.strokeStyle = mix(hue, '#000000', 0.35); g.lineWidth = size * 0.035; g.stroke();
  g.fillStyle = '#ffffff';
  for (const [x, y, s] of [[0.5, 0.2, 0.1], [0.28, 0.33, 0.07], [0.72, 0.33, 0.08], [0.4, 0.4, 0.05], [0.62, 0.42, 0.05]]) {
    g.beginPath(); g.ellipse(size * x, size * y, size * s, size * s * 0.75, 0, 0, TAU); g.fill();
  }
  return c;
}

// ------------------------------------------------------------------ face & hat

function eye(ctx, x, y, s, lx, ly, closed) {
  if (closed) {
    ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x, y + s * 0.7, x + s, y); ctx.stroke();
    return;
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(x, y, s, s * 1.15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1d1030';
  ctx.beginPath(); ctx.ellipse(x + lx * s * 0.35, y + ly * s * 0.35, s * 0.55, s * 0.62, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x + lx * s * 0.35 - s * 0.2, y + ly * s * 0.35 - s * 0.25, s * 0.18, 0, TAU); ctx.fill();
}

// Draws a face centred at (x, y) for body radius r.
function drawFace(ctx, face, x, y, r, lx, ly, mood, blink) {
  const s = r * 0.19, gap = r * 0.36;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1d1030';
  ctx.fillStyle = '#1d1030';
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  const ex = x + lx * r * 0.14, ey = y + ly * r * 0.08;
  if (mood === 'hurt') {
    // >_<
    for (const d of [-1, 1]) {
      const cx = ex + d * gap;
      ctx.beginPath(); ctx.moveTo(cx - s * 0.8 * d, ey - s * 0.7); ctx.lineTo(cx + s * 0.6 * d, ey); ctx.lineTo(cx - s * 0.8 * d, ey + s * 0.7); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(ex, ey + r * 0.38, r * 0.13, r * 0.17, 0, 0, TAU); ctx.fill();
    return;
  }
  const closed = blink < 0;
  switch (face) {
    case 1: // grumpy
      eye(ctx, ex - gap, ey, s, lx, ly, closed); eye(ctx, ex + gap, ey, s, lx, ly, closed);
      ctx.beginPath(); ctx.moveTo(ex - gap - s, ey - s * 1.6); ctx.lineTo(ex - gap + s * 1.1, ey - s * 0.9);
      ctx.moveTo(ex + gap + s, ey - s * 1.6); ctx.lineTo(ex + gap - s * 1.1, ey - s * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex - r * 0.18, ey + r * 0.4); ctx.quadraticCurveTo(ex, ey + r * 0.3, ex + r * 0.18, ey + r * 0.4); ctx.stroke();
      break;
    case 2: // derp
      eye(ctx, ex - gap, ey - s * 0.2, s * 1.25, -lx, ly, closed); eye(ctx, ex + gap, ey + s * 0.2, s * 0.8, lx, -ly, closed);
      ctx.beginPath(); ctx.moveTo(ex - r * 0.25, ey + r * 0.32); ctx.quadraticCurveTo(ex, ey + r * 0.5, ex + r * 0.25, ey + r * 0.3); ctx.stroke();
      ctx.fillStyle = '#ff6f9a';
      ctx.beginPath(); ctx.ellipse(ex + r * 0.08, ey + r * 0.48, r * 0.09, r * 0.12, 0.3, 0, TAU); ctx.fill();
      break;
    case 3: // cool
      ctx.fillStyle = '#1d1030';
      ctx.beginPath(); ctx.ellipse(ex - gap, ey, s * 1.35, s * 0.95, 0, 0, TAU); ctx.ellipse(ex + gap, ey, s * 1.35, s * 0.95, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex - gap, ey - s * 0.4); ctx.lineTo(ex + gap, ey - s * 0.4); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.ellipse(ex - gap - s * 0.5, ey - s * 0.3, s * 0.35, s * 0.2, -0.4, 0, TAU); ctx.ellipse(ex + gap - s * 0.5, ey - s * 0.3, s * 0.35, s * 0.2, -0.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex - r * 0.12, ey + r * 0.38); ctx.quadraticCurveTo(ex + r * 0.1, ey + r * 0.46, ex + r * 0.24, ey + r * 0.3); ctx.stroke();
      break;
    case 4: // sleepy
      eye(ctx, ex - gap, ey, s, lx, ly, true); eye(ctx, ex + gap, ey, s, lx, ly, true);
      ctx.beginPath(); ctx.ellipse(ex, ey + r * 0.36, r * 0.07, r * 0.09, 0, 0, TAU); ctx.stroke();
      break;
    case 5: // wow
      eye(ctx, ex - gap, ey, s * 1.2, lx, ly, closed); eye(ctx, ex + gap, ey, s * 1.2, lx, ly, closed);
      ctx.fillStyle = '#5a1030';
      ctx.beginPath(); ctx.ellipse(ex, ey + r * 0.4, r * 0.12, r * 0.15, 0, 0, TAU); ctx.fill();
      break;
    case 6: // cyclops
      eye(ctx, ex, ey - s * 0.2, s * 1.7, lx, ly, closed);
      ctx.beginPath(); ctx.moveTo(ex - r * 0.28, ey + r * 0.32); ctx.quadraticCurveTo(ex, ey + r * 0.55, ex + r * 0.28, ey + r * 0.32); ctx.stroke();
      break;
    case 7: { // kitty
      eye(ctx, ex - gap, ey, s, lx, ly, closed); eye(ctx, ex + gap, ey, s, lx, ly, closed);
      const my = ey + r * 0.32;
      ctx.beginPath(); ctx.moveTo(ex - r * 0.16, my); ctx.quadraticCurveTo(ex - r * 0.08, my + r * 0.12, ex, my); ctx.quadraticCurveTo(ex + r * 0.08, my + r * 0.12, ex + r * 0.16, my); ctx.stroke();
      ctx.lineWidth = Math.max(1, r * 0.035);
      ctx.beginPath();
      for (const d of [-1, 1]) {
        ctx.moveTo(ex + d * r * 0.32, my - r * 0.02); ctx.lineTo(ex + d * r * 0.62, my - r * 0.08);
        ctx.moveTo(ex + d * r * 0.32, my + r * 0.05); ctx.lineTo(ex + d * r * 0.62, my + r * 0.08);
      }
      ctx.stroke();
      break;
    }
    default: // happy
      eye(ctx, ex - gap, ey, s, lx, ly, closed); eye(ctx, ex + gap, ey, s, lx, ly, closed);
      ctx.beginPath(); ctx.moveTo(ex - r * 0.22, ey + r * 0.3); ctx.quadraticCurveTo(ex, ey + r * 0.52, ex + r * 0.22, ey + r * 0.3); ctx.stroke();
  }
  if (mood === 'charge' && face !== 1 && face !== 3) {
    ctx.beginPath(); ctx.moveTo(ex - gap - s, ey - s * 1.7); ctx.lineTo(ex - gap + s, ey - s * 1.1);
    ctx.moveTo(ex + gap + s, ey - s * 1.7); ctx.lineTo(ex + gap - s, ey - s * 1.1); ctx.stroke();
  }
  // Rosy cheeks.
  ctx.fillStyle = 'rgba(255,90,140,0.35)';
  ctx.beginPath(); ctx.ellipse(ex - gap * 1.55, ey + r * 0.22, r * 0.11, r * 0.07, 0, 0, TAU); ctx.ellipse(ex + gap * 1.55, ey + r * 0.22, r * 0.11, r * 0.07, 0, 0, TAU); ctx.fill();
}

// Hat sitting on the top of a body at (x, y) for radius r.
function drawHat(ctx, hat, x, y, r, t, tint) {
  if (!hat) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2, r * 0.05);
  ctx.strokeStyle = '#2a1640';
  const u = r / 30;
  switch (hat) {
    case 1: { // party cone
      ctx.fillStyle = '#ff4fa3';
      ctx.beginPath(); ctx.moveTo(x - 14 * u, y + 3 * u); ctx.lineTo(x + 2 * u, y - 30 * u); ctx.lineTo(x + 14 * u, y + 3 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 3 * u;
      ctx.beginPath(); ctx.moveTo(x - 9 * u, y - 6 * u); ctx.lineTo(x + 9 * u, y - 4 * u); ctx.moveTo(x - 4 * u, y - 17 * u); ctx.lineTo(x + 7 * u, y - 15 * u); ctx.stroke();
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath(); ctx.arc(x + 2 * u, y - 31 * u, 4.5 * u, 0, TAU); ctx.fill();
      break;
    }
    case 2: { // bow
      ctx.fillStyle = '#ff3f7f';
      ctx.beginPath(); ctx.moveTo(x, y - 4 * u); ctx.lineTo(x - 16 * u, y - 14 * u); ctx.lineTo(x - 16 * u, y + 4 * u); ctx.closePath();
      ctx.moveTo(x, y - 4 * u); ctx.lineTo(x + 16 * u, y - 14 * u); ctx.lineTo(x + 16 * u, y + 4 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - 4 * u, 4.5 * u, 0, TAU); ctx.fill(); ctx.stroke();
      break;
    }
    case 3: { // propeller beanie
      ctx.fillStyle = '#4aa3ff';
      ctx.beginPath(); ctx.ellipse(x, y + 2 * u, 17 * u, 12 * u, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath(); ctx.ellipse(x, y - 4 * u, 6 * u, 10 * u, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ff5a7e';
      ctx.fillRect(x - 1.5 * u, y - 18 * u, 3 * u, 8 * u);
      const w = Math.cos(t * 18) * 16 * u;
      ctx.beginPath(); ctx.ellipse(x, y - 19 * u, Math.abs(w) + 2 * u, 3.5 * u, 0, 0, TAU); ctx.fill(); ctx.stroke();
      break;
    }
    case 4: { // top hat
      ctx.fillStyle = '#2b2440';
      ctx.beginPath(); ctx.ellipse(x, y + 1 * u, 20 * u, 5 * u, 0, 0, TAU); ctx.fill();
      ctx.fillRect(x - 12 * u, y - 24 * u, 24 * u, 25 * u);
      ctx.fillStyle = '#ff5a7e';
      ctx.fillRect(x - 12 * u, y - 7 * u, 24 * u, 5 * u);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(x - 8 * u, y - 21 * u); ctx.lineTo(x - 8 * u, y - 10 * u); ctx.stroke();
      break;
    }
    case 5: { // chef
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 11 * u, y - 10 * u, 22 * u, 12 * u);
      ctx.beginPath(); ctx.arc(x - 9 * u, y - 14 * u, 8 * u, 0, TAU); ctx.arc(x, y - 19 * u, 10 * u, 0, TAU); ctx.arc(x + 9 * u, y - 14 * u, 8 * u, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#c9c0d8';
      ctx.beginPath(); ctx.moveTo(x - 11 * u, y - 2 * u); ctx.lineTo(x + 11 * u, y - 2 * u); ctx.stroke();
      break;
    }
    case 6: { // flower
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + t * 0.5;
        ctx.beginPath(); ctx.ellipse(x + 10 * u + Math.cos(a) * 6 * u, y - 4 * u + Math.sin(a) * 6 * u, 4.5 * u, 4.5 * u, 0, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath(); ctx.arc(x + 10 * u, y - 4 * u, 4 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5ac44a';
      ctx.beginPath(); ctx.ellipse(x + 1 * u, y + 1 * u, 6 * u, 3 * u, -0.5, 0, TAU); ctx.fill();
      break;
    }
    case 7: { // viking
      ctx.fillStyle = '#fff3d6';
      ctx.beginPath(); ctx.moveTo(x - 14 * u, y - 2 * u); ctx.quadraticCurveTo(x - 30 * u, y - 10 * u, x - 24 * u, y - 28 * u); ctx.quadraticCurveTo(x - 22 * u, y - 14 * u, x - 9 * u, y - 10 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 14 * u, y - 2 * u); ctx.quadraticCurveTo(x + 30 * u, y - 10 * u, x + 24 * u, y - 28 * u); ctx.quadraticCurveTo(x + 22 * u, y - 14 * u, x + 9 * u, y - 10 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a0a8c0';
      ctx.beginPath(); ctx.ellipse(x, y + 2 * u, 16 * u, 15 * u, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d8a040';
      ctx.fillRect(x - 16 * u, y - 1 * u, 32 * u, 4 * u);
      break;
    }
    case 8: { // wizard
      ctx.fillStyle = '#5a3ccc';
      ctx.beginPath(); ctx.moveTo(x - 20 * u, y + 2 * u); ctx.quadraticCurveTo(x, y - 4 * u, x + 20 * u, y + 2 * u); ctx.lineTo(x + 10 * u, y - 4 * u);
      ctx.quadraticCurveTo(x + 8 * u, y - 30 * u, x + 18 * u, y - 38 * u); ctx.quadraticCurveTo(x - 4 * u, y - 30 * u, x - 10 * u, y - 4 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe14d';
      ctx.font = `900 ${10 * u}px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★', x, y - 12 * u);
      break;
    }
    case 9: { // halo
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = 4 * u;
      ctx.beginPath(); ctx.ellipse(x, y - 12 * u + Math.sin(t * 3) * 2 * u, 15 * u, 5 * u, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath(); ctx.ellipse(x, y - 12 * u + Math.sin(t * 3) * 2 * u, 15 * u, 5 * u, 0, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
      break;
    }
    case 10: { // crown
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath(); ctx.moveTo(x - 16 * u, y + 2 * u); ctx.lineTo(x - 18 * u, y - 16 * u); ctx.lineTo(x - 8 * u, y - 7 * u); ctx.lineTo(x, y - 20 * u); ctx.lineTo(x + 8 * u, y - 7 * u); ctx.lineTo(x + 18 * u, y - 16 * u); ctx.lineTo(x + 16 * u, y + 2 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4f7b';
      ctx.beginPath(); ctx.arc(x, y - 4 * u, 3.2 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4aa3ff';
      ctx.beginPath(); ctx.arc(x - 9 * u, y - 3 * u, 2.4 * u, 0, TAU); ctx.arc(x + 9 * u, y - 3 * u, 2.4 * u, 0, TAU); ctx.fill();
      break;
    }
    default:
  }
  void tint;
}

// ------------------------------------------------------------------ blob

// Draw one blob whose bottom sits at screen (gx, gy). `s` is extra state.
function drawBlob(ctx, shade, soft, look, gx, gy, r, s) {
  const col = COLORS[look.color] || COLORS[0];
  const sq = soft.sq;
  const o = soft.o;
  const sx = 1 - sq * 0.55, sy = 1 + sq;
  const ux = s.ux || 0, uy = s.uy || 0, st = s.stretch || 0;
  const cy = gy - r * 0.82 * sy;
  const cx = gx;
  // Outline points.
  const px = s.px, py = s.py;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const rr = r * (1 + o[i]);
    let x = Math.cos(a) * rr * sx;
    let y = Math.sin(a) * rr * sy * 0.94;
    if (st) {
      const along = x * ux + y * uy;
      x += ux * along * st;
      y += uy * along * st;
    }
    // Flat-ish bottom where the blob sits on the floor.
    const floor = r * 0.82 * sy;
    if (y > floor) y = floor + (y - floor) * 0.25;
    px[i] = cx + x;
    py[i] = cy + y;
  }
  ctx.beginPath();
  let mx = (px[N - 1] + px[0]) / 2, my = (py[N - 1] + py[0]) / 2;
  ctx.moveTo(mx, my);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    mx = (px[i] + px[j]) / 2; my = (py[i] + py[j]) / 2;
    ctx.quadraticCurveTo(px[i], py[i], mx, my);
  }
  ctx.closePath();
  ctx.fillStyle = col.body;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.drawImage(shade, cx - r * 1.25, cy - r * 1.2, r * 2.5, r * 2.4);
  if (s.slimed) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#5fd03a';
    ctx.fillRect(cx - r * 1.5, cy - r * 1.5, r * 3, r * 3);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.strokeStyle = col.dark;
  ctx.lineWidth = Math.max(1.5, r * 0.085);
  ctx.stroke();
  // Shine.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.42 * sx, cy - r * 0.5 * sy, r * 0.17, r * 0.1, -0.6, 0, TAU);
  ctx.fill();
  const lx = Math.cos(s.facing || 0), ly = Math.sin(s.facing || 0) * TILT;
  drawFace(ctx, look.face, cx, cy - r * 0.02 * sy, r * Math.min(1.1, Math.max(0.85, sx)), lx, ly, s.mood, soft.blink);
  drawHat(ctx, look.hat, cx + lx * r * 0.05, cy - r * 0.8 * sy, r, soft.t, col.body);
  return cy;
}

// ------------------------------------------------------------------ renderer

export class Renderer {
  constructor(cvs, { reducedMotion = false } = {}) {
    this.canvas = cvs;
    this.ctx = cvs.getContext('2d');
    this.reduced = reducedMotion;
    this.shade = bakeShade();
    this.coin = bakeCoin(64);
    this.bomb = bakeBomb(64);
    this.powerSprites = {};
    for (const k of Object.keys(POWER_LOOK)) this.powerSprites[k] = bakePower(k, 64);
    this.mushrooms = [bakeMushroom(128, '#ff5a7e'), bakeMushroom(128, '#a874ff'), bakeMushroom(128, '#ffad2e')];
    this.glowWhite = bakeGlow('rgba(255,255,255,0.9)');
    this.glowWarm = bakeGlow('rgba(255,170,60,0.9)');
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles.push({ on: false });
    this.pops = [];
    this.softs = [];
    this.pts = { px: new Float32Array(N), py: new Float32Array(N) };
    this.sprites = [];
    this.shake = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.time = 0;
    this.arenaId = null;
    this.tileState = null;
    this.fallingTiles = [];
    this.bumperSquash = [];
    this.flash = 0;
    this.dpr = 1;
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    // Cap the backing store so huge screens stay fast.
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w * h * dpr * dpr > 2.6e6) dpr = Math.sqrt(2.6e6 / (w * h));
    this.dpr = dpr;
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.fontBig = `900 ${Math.round(Math.min(w, h) * 0.16)}px ${FONT}`;
    this.fontPop = `900 48px ${FONT}`;
    this.fontTag = `800 ${Math.max(11, Math.round(Math.min(w, h) * 0.018))}px ${FONT}`;
    this.bg = null;
    if (this.arenaDef) this.setArena(this.arenaDef);
  }

  // Fit the camera to the arena and bake its art.
  setArena(def) {
    this.arenaDef = def;
    const E = def.extent + (def.kind === 'terraces' ? 30 : 0);
    const w = this.w, h = this.h;
    const topPad = this.h < 560 ? 52 : 74, bottomPad = this.coarse ? Math.min(150, this.h * 0.2) : 36;
    const availW = this.w * 0.94, availH = this.h - topPad - bottomPad;
    const needH = 2 * E * TILT + THICK + 70;
    this.k = Math.min(availW / (2 * E), availH / needH);
    this.ox = this.w / 2;
    this.oy = topPad + (availH - needH * this.k) / 2 + (E * TILT + 40) * this.k + (h > w * 1.4 ? h * 0.05 : 0);
    this.E = E;
    // Base camera; update() may zoom toward a focus point from here.
    this.baseK = this.k; this.baseOx = this.ox; this.baseOy = this.oy;
    this.camX = 0; this.camY = 0; this.zoom = 1;
    this.bakeBackground(def);
    this.bakeFloor(def);
    this.arenaId = def.id;
  }

  setCoarse(c) { this.coarse = c; }

  bakeBackground(def) {
    const dpr = this.dpr, w = this.w, h = this.h;
    const bg = canvas(w * dpr, h * dpr);
    const g = bg.getContext('2d');
    g.scale(dpr, dpr);
    const th = def.theme;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, th.sky[0]);
    sky.addColorStop(1, th.sky[1]);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w * 0.5, this.oy, 10, w * 0.5, this.oy, Math.max(w, h) * 0.7);
    glow.addColorStop(0, mix(th.glow, '#ffffff', 0.4));
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = 0.55;
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
    const rnd = lcg(def.id.length * 977 + 13);
    // Distant floating islands.
    for (let i = 0; i < 6; i++) {
      const x = rnd() * w, y = h * (0.15 + rnd() * 0.75), s = 16 + rnd() * 34;
      g.fillStyle = mix(th.sky[1], th.side, 0.35);
      g.beginPath(); g.ellipse(x, y + s * 0.25, s * 0.9, s * 0.55, 0, 0, Math.PI); g.fill();
      g.fillStyle = mix(th.sky[1], th.top, 0.45);
      g.beginPath(); g.ellipse(x, y, s, s * 0.32, 0, 0, TAU); g.fill();
    }
    // Sparkles.
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w, y = rnd() * h, s = 0.8 + rnd() * 2;
      g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    }
    this.bg = bg;
    // Clouds layer, twice as wide for scrolling.
    const cw = Math.ceil(w), ch = Math.ceil(h);
    const cl = canvas(cw * dpr, ch * dpr);
    const c = cl.getContext('2d');
    c.scale(dpr, dpr);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 9; i++) {
      const x = rnd() * cw, y = ch * (0.05 + rnd() * 0.9), s = 30 + rnd() * 60;
      for (let k = 0; k < 5; k++) {
        const px = x + (k - 2) * s * 0.5, py = y - Math.sin((k / 4) * Math.PI) * s * 0.35;
        for (const off of [-cw, 0, cw]) { c.beginPath(); c.arc(px + off, py, s * (0.35 + 0.2 * Math.sin(k * 1.7)), 0, TAU); c.fill(); }
      }
    }
    this.clouds = cl;
  }

  // Floor texture in world units: base gradient plus the theme decoration.
  bakeFloor(def) {
    const E = def.extent + 40;
    const res = Math.min(1.4, this.k * this.dpr * 1.1);
    const size = Math.ceil(2 * E * res);
    const tex = canvas(size, size);
    const g = tex.getContext('2d');
    g.scale(res, res);
    g.translate(E, E);
    const th = def.theme;
    const base = g.createRadialGradient(-E * 0.25, -E * 0.3, 10, 0, 0, E);
    base.addColorStop(0, mix(th.top, '#ffffff', 0.25));
    base.addColorStop(0.6, th.top);
    base.addColorStop(1, th.top2);
    g.fillStyle = base;
    g.fillRect(-E, -E, 2 * E, 2 * E);
    const rnd = lcg(def.id.charCodeAt(0) * 131 + def.id.length);
    switch (th.deco) {
      case 'sprinkles':
        for (let i = 0; i < 260; i++) {
          g.save();
          g.translate((rnd() * 2 - 1) * E, (rnd() * 2 - 1) * E);
          g.rotate(rnd() * TAU);
          g.fillStyle = CANDY[Math.floor(rnd() * CANDY.length)];
          g.fillRect(-7, -2.2, 14, 4.4);
          g.restore();
        }
        break;
      case 'swirl':
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        g.lineWidth = 7;
        for (let r = 30; r < E; r += 34) {
          g.beginPath();
          for (let a = 0; a <= TAU + 0.01; a += 0.1) {
            const rr = r + Math.sin(a * 6 + r) * 6;
            const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
            if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
        }
        g.fillStyle = '#ff4f6a';
        for (let i = 0; i < 18; i++) { g.beginPath(); g.arc((rnd() * 2 - 1) * E * 0.8, (rnd() * 2 - 1) * E * 0.8, 6, 0, TAU); g.fill(); }
        break;
      case 'ice':
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineCap = 'round';
        for (let i = 0; i < 40; i++) {
          const x = (rnd() * 2 - 1) * E, y = (rnd() * 2 - 1) * E, l = 20 + rnd() * 70, a = -0.5 + rnd() * 0.3;
          g.lineWidth = 2 + rnd() * 5;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
        g.strokeStyle = 'rgba(90,143,214,0.25)';
        g.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          let x = (rnd() * 2 - 1) * E, y = (rnd() * 2 - 1) * E;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); }
          g.stroke();
        }
        // Centre line and circles like a hockey rink.
        g.strokeStyle = 'rgba(255,90,120,0.35)'; g.lineWidth = 8;
        g.beginPath(); g.moveTo(0, -E); g.lineTo(0, E); g.stroke();
        g.strokeStyle = 'rgba(74,163,255,0.35)';
        g.beginPath(); g.arc(0, 0, 70, 0, TAU); g.stroke();
        break;
      case 'tiles':
        for (let x = -E; x < E; x += 50) for (let y = -E; y < E; y += 50) {
          if (((x + y) / 50) % 2 === 0) { g.fillStyle = 'rgba(160,100,60,0.12)'; g.fillRect(x, y, 50, 50); }
        }
        break;
      case 'spokes':
        for (let k = 0; k < 12; k++) {
          g.fillStyle = k % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(122,91,209,0.18)';
          g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, E, (k / 12) * TAU, ((k + 1) / 12) * TAU); g.closePath(); g.fill();
        }
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 6;
        for (const r of [110, 220]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
        break;
      case 'flowers':
        for (let i = 0; i < 70; i++) {
          const x = (rnd() * 2 - 1) * E, y = (rnd() * 2 - 1) * E;
          g.strokeStyle = 'rgba(70,140,40,0.5)'; g.lineWidth = 2.5;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y - 9); g.moveTo(x, y); g.lineTo(x + 4, y - 8); g.stroke();
        }
        for (let i = 0; i < 46; i++) {
          const x = (rnd() * 2 - 1) * E, y = (rnd() * 2 - 1) * E;
          g.fillStyle = ['#ffffff', '#ffe14d', '#ff9ad0', '#9ad0ff'][Math.floor(rnd() * 4)];
          for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos((k / 5) * TAU) * 5, y + Math.sin((k / 5) * TAU) * 5, 4, 0, TAU); g.fill(); }
          g.fillStyle = '#ffad2e'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill();
        }
        break;
      case 'rocks':
        for (let i = 0; i < 90; i++) {
          g.fillStyle = rnd() < 0.5 ? 'rgba(60,30,20,0.25)' : 'rgba(255,220,180,0.18)';
          g.beginPath(); g.ellipse((rnd() * 2 - 1) * E, (rnd() * 2 - 1) * E, 4 + rnd() * 12, 3 + rnd() * 7, rnd() * 3, 0, TAU); g.fill();
        }
        break;
      case 'planks':
        g.strokeStyle = 'rgba(120,60,20,0.35)'; g.lineWidth = 3;
        for (let y = -E; y < E; y += 42) { g.beginPath(); g.moveTo(-E, y); g.lineTo(E, y); g.stroke(); }
        for (let i = 0; i < 40; i++) {
          const y = Math.floor(rnd() * (2 * E / 42)) * 42 - E, x = (rnd() * 2 - 1) * E;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 42); g.stroke();
          g.fillStyle = 'rgba(120,60,20,0.3)'; g.beginPath(); g.arc(x + 20, y + 21, 2.5, 0, TAU); g.fill();
        }
        break;
      case 'chips':
        for (let i = 0; i < 70; i++) {
          g.fillStyle = rnd() < 0.8 ? '#5a3020' : '#3a1c10';
          const x = (rnd() * 2 - 1) * E, y = (rnd() * 2 - 1) * E, s = 5 + rnd() * 7;
          g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x + s, y + s * 0.6, x, y + s * 0.6); g.quadraticCurveTo(x - s, y + s * 0.6, x, y - s); g.fill();
        }
        break;
      default:
    }
    this.tex = tex;
    this.texE = E;
    // Side shading runs left to right, built once in floor space.
    const side = this.ctx.createLinearGradient(-E, 0, E, 0);
    side.addColorStop(0, mix(th.side, '#000000', 0.35));
    side.addColorStop(0.35, th.side);
    side.addColorStop(0.55, mix(th.side, '#ffffff', 0.18));
    side.addColorStop(1, mix(th.side, '#000000', 0.45));
    this.sideFill = side;
    this.rimColor = th.rim;
    this.sideDark = mix(th.side, '#000000', 0.4);
    if (def.kind === 'terraces') {
      const lava = this.ctx.createRadialGradient(0, 0, 40, 0, 0, E + 40);
      lava.addColorStop(0, '#ffd34a');
      lava.addColorStop(0.6, '#ff7a1a');
      lava.addColorStop(1, '#e0360f');
      this.lavaFill = lava;
    }
    this.tileState = null;
    this.fallingTiles.length = 0;
  }

  // ------------------------------------------------------------ projection

  sx(x) { return this.ox + this.shakeX + x * this.k; }
  sy(y, h = 0) { return this.oy + this.shakeY + (y * TILT - h) * this.k; }

  // Visual ground height under a point.
  groundAt(world, x, y) {
    const st = world.arena;
    if (st.kind === 'terraces') {
      const t = tierAt(st, x, y);
      return t ? (t.h - 1) * TIER_H : 0;
    }
    if (st.kind === 'seesaw') return -x * Math.sin(st.tilt) * SEESAW_LIFT;
    return 0;
  }

  // Put the canvas in floor space: world units, y squashed by the tilt.
  floorSpace(h = 0) {
    const d = this.dpr, k = this.k;
    this.ctx.setTransform(k * d, 0, 0, k * TILT * d, (this.ox + this.shakeX) * d, (this.oy + this.shakeY - h * k) * d);
  }

  screenSpace() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }

  // ------------------------------------------------------------ world hookup

  reset(world) {
    if (this.arenaId !== world.arenaDef.id) this.setArena(world.arenaDef);
    this.softs = world.blobs.map(() => new SoftBody());
    for (const s of this.softs) s.spawnT = 0.5;
    this.bumperSquash = world.arena.bumpers.map(() => 0);
    for (const p of this.particles) p.on = false;
    this.pops.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.tileState = null;
    this.fallingTiles.length = 0;
  }

  addShake(a) { if (!this.reduced) this.shake = Math.min(18, this.shake + a); }

  particle(kind, x, y, z, vx, vy, vz, life, size, color) {
    for (const p of this.particles) {
      if (p.on) continue;
      p.on = true; p.kind = kind; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
      p.life = life; p.max = life; p.size = size; p.color = color; p.rot = Math.random() * TAU; p.spin = (Math.random() - 0.5) * 12;
      return p;
    }
    return null;
  }

  burst(x, y, z, count, color, speed = 300, kind = 'drop', size = 7) {
    const n = this.reduced ? Math.ceil(count / 3) : count;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
      this.particle(kind, x, y, z, Math.cos(a) * s, Math.sin(a) * s, 150 + Math.random() * 350, 0.5 + Math.random() * 0.5, size * (0.6 + Math.random() * 0.8), color);
    }
  }

  ring(x, y, r, color, life = 0.45) {
    this.particle('ring', x, y, 0, 0, 0, 0, life, r, color);
  }

  // A big announcer text pop. (x, y) are world coords or null for centre.
  announce(text, color = '#ffffff', { x = null, y = null, size = 1, life = 1.1 } = {}) {
    if (x !== null) {
      // One fresh world pop at a time, at most three on screen.
      const world = this.pops.filter((p) => p.x !== null);
      if (world.some((p) => p.max - p.life < 0.3) || world.length >= 3) return;
    }
    if (this.pops.length > 6) this.pops.shift();
    this.pops.push({ text, color, x, y, size, life, max: life, wobble: Math.random() * TAU });
  }

  handleEvents(events, world) {
    for (const e of events) {
      switch (e.type) {
        case 'bonk': {
          const p = Math.min(1, e.power / 1300);
          const a = world.blobs[e.a], b = world.blobs[e.b];
          const ang = Math.atan2(e.ny * TILT, e.nx);
          this.softs[e.a]?.hit(ang, 0.25 + p * 0.5);
          this.softs[e.b]?.hit(ang + Math.PI, 0.25 + p * 0.5);
          const ca = COLORS[a.look.color].body, cb = COLORS[b.look.color].body;
          this.burst(e.x, e.y, 20, 6 + Math.round(p * 10), ca, 200 + p * 300);
          this.burst(e.x, e.y, 20, 6 + Math.round(p * 10), cb, 200 + p * 300);
          if (p > 0.35) this.burst(e.x, e.y, 30, 5, '#ffffff', 350, 'star', 9);
          this.addShake(3 + p * 9);
          if (e.power > 650 && !this.reduced) this.flash = 0.06 + p * 0.06;
          if (e.power > 560) this.announce(BONKS[Math.floor(Math.random() * BONKS.length)], '#ffffff', { x: e.x, y: e.y, size: 0.55 + p * 0.5, life: 0.8 });
          break;
        }
        case 'bumper': {
          const k = world.arena.bumpers.findIndex((b) => b.x === e.bx && b.y === e.by);
          if (k >= 0) this.bumperSquash[k] = 1;
          this.softs[e.i]?.hit(Math.atan2(-e.ny * TILT, -e.nx), 0.4);
          this.burst(e.x, e.y, 20, 6, '#ffffff', 260, 'star', 8);
          this.addShake(3);
          if (Math.random() < 0.5) this.announce('BOING!', '#fff3a0', { x: e.x, y: e.y, size: 0.5, life: 0.7 });
          break;
        }
        case 'dash':
          this.softs[e.i]?.wobble(0.6);
          this.ring(e.x, e.y, 40 + e.power * 30, '#ffffff', 0.3);
          break;
        case 'hop':
          this.softs[e.i]?.squash(4);
          this.burst(e.x, e.y, 0, 5, 'rgba(255,255,255,0.7)', 120, 'dust', 6);
          break;
        case 'pound': {
          const b = world.blobs[e.i];
          this.softs[e.i]?.squash(-9);
          this.ring(e.x, e.y, e.r, '#ffffff', 0.5);
          this.ring(e.x, e.y, e.r * 0.6, COLORS[b.look.color].light, 0.4);
          this.burst(e.x, e.y, 0, 10, 'rgba(255,255,255,0.7)', 380, 'dust', 7);
          this.addShake(e.hits ? 10 : 5);
          if (e.hits) this.announce('SLAM!', '#ffe14d', { x: e.x, y: e.y, size: 0.8, life: 0.9 });
          break;
        }
        case 'fall': {
          const b = world.blobs[e.i];
          this.softs[e.i]?.squash(5);
          const word = world.arena.kind === 'terraces' ? 'TOO HOT!' : FALLS[Math.floor(Math.random() * FALLS.length)];
          this.announce(word, COLORS[b.look.color].light, { x: e.x, y: e.y, size: 0.75, life: 1.1 });
          break;
        }
        case 'out': {
          const b = world.blobs[e.i];
          const fx = b.x, fy = b.y;
          if (world.arena.kind === 'terraces') this.burst(fx, fy, -60, 16, '#ffb02e', 300, 'drop', 8);
          else this.burst(fx, fy, -120, 14, COLORS[b.look.color].body, 260, 'drop', 8);
          this.addShake(4);
          break;
        }
        case 'respawn': {
          const s = this.softs[e.i];
          if (s) { s.spawnT = 0.45; s.squash(5); }
          this.burst(e.x, e.y, 0, 12, '#ffffff', 220, 'star', 8);
          break;
        }
        case 'powerup': {
          const look = POWER_LOOK[e.kind];
          this.burst(e.x, e.y, 30, 16, look.color, 320, 'star', 9);
          this.announce(look.label, look.color, { x: e.x, y: e.y, size: 0.7, life: 1 });
          this.softs[e.i]?.squash(5);
          break;
        }
        case 'shieldPop':
          this.burst(e.x, e.y, 30, 14, '#bfeaff', 320, 'drop', 6);
          this.announce('POP!', '#bfeaff', { x: e.x, y: e.y, size: 0.6, life: 0.7 });
          break;
        case 'coin':
          this.burst(e.x, e.y, 20, e.value > 1 ? 14 : 6, '#ffd23a', 220, 'star', 7);
          if (e.value > 1) this.announce(`+${e.value}!`, '#ffd23a', { x: e.x, y: e.y, size: 0.6, life: 0.8 });
          break;
        case 'spill':
          this.announce(`-${e.lost} coins`, '#ffd23a', { size: 0.45, life: 1 });
          break;
        case 'bomb':
          this.ring(e.x, e.y, e.r * 1.2, '#ffcf4a', 0.5);
          this.ring(e.x, e.y, e.r * 0.7, '#ff6a3a', 0.4);
          this.burst(e.x, e.y, 10, 22, '#ff8a3d', 480, 'drop', 9);
          this.burst(e.x, e.y, 10, 10, 'rgba(80,60,90,0.6)', 260, 'dust', 9);
          this.addShake(14);
          if (!this.reduced) this.flash = 0.12;
          this.announce('KABOOM!', '#ffcf4a', { x: e.x, y: e.y, size: 0.9, life: 1 });
          break;
        case 'countdown':
          this.announce(String(e.n), '#ffffff', { size: 2.2, life: 0.9 });
          break;
        case 'go':
          this.announce('BONK!', '#ffe14d', { size: 2, life: 1 });
          for (const s of this.softs) s.squash(6);
          break;
        case 'sudden':
          this.announce('SUDDEN DEATH!', '#ff6a6a', { size: 1, life: 1.8 });
          break;
        case 'overtime':
          this.announce('OVERTIME!', '#ffe14d', { size: 1.1, life: 1.6 });
          break;
        case 'zoneMove':
          this.ring(e.x, e.y, 110, '#ffffff', 0.6);
          this.announce('THE HILL MOVED!', '#ffffff', { size: 0.55, life: 1.2 });
          break;
        default:
      }
    }
  }

  // Follow a point (world coords) with a zoom, or pass null to frame the arena.
  setFocus(p, zoom = 1.45) { this.focus = p; this.focusZoom = zoom; }

  updateCamera(dt) {
    if (this.baseK === undefined) return;
    const f = this.focus;
    const want = f ? this.focusZoom : 1;
    const a = Math.min(1, dt * 3);
    this.zoom += (want - this.zoom) * a;
    const tx = f ? f.x * 0.75 : 0, ty = f ? f.y * 0.75 : 0;
    this.camX += (tx - this.camX) * a;
    this.camY += (ty - this.camY) * a;
    const z = this.zoom;
    this.k = this.baseK * z;
    this.ox = this.baseOx - this.camX * this.k;
    this.oy = this.baseOy - this.camY * TILT * this.k;
  }

  update(dt, world) {
    this.time += dt;
    this.updateCamera(dt);
    // Shake decays; noise is cheap trig, no allocations.
    this.shake = Math.max(0, this.shake - dt * 40);
    const s = this.reduced ? 0 : this.shake;
    this.shakeX = Math.sin(this.time * 71) * s * 0.6;
    this.shakeY = Math.cos(this.time * 53) * s * 0.6;
    this.flash = Math.max(0, this.flash - dt);
    for (let k = 0; k < this.bumperSquash.length; k++) this.bumperSquash[k] = Math.max(0, this.bumperSquash[k] - dt * 3);
    if (world) {
      for (let i = 0; i < world.blobs.length; i++) {
        const b = world.blobs[i], soft = this.softs[i];
        if (!soft) continue;
        soft.spawnT = Math.max(0, soft.spawnT - dt);
        let target = 0;
        if (b.charging) target = -0.22 * b.charge;
        if (b.pound === 1) target = 0.25;
        if (b.pound === 2) target = 0.35;
        if (b.falling) target = 0.2;
        soft.update(dt, target);
        if (b.charging && !this.reduced) soft.wobble(0.06 * b.charge);
        if (b.grounded && !soft.wasGrounded) soft.squash(-5);
        soft.wasGrounded = b.grounded;
        // Dash trail.
        if (b.dashT > 0 && !b.out && Math.random() < 0.6) {
          this.particle('drop', b.x + (Math.random() - 0.5) * 20, b.y + (Math.random() - 0.5) * 20, 10, -b.vx * 0.1, -b.vy * 0.1, 60, 0.3, 6, COLORS[b.look.color].light);
        }
        if (b.slime > 0 && Math.random() < dt * 8) this.particle('drop', b.x, b.y, 10, 0, 0, 40, 0.5, 4, '#68d83a');
      }
      this.updateTiles(world, dt);
    }
    for (const p of this.particles) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      if (p.kind === 'ring') continue;
      if (p.kind === 'confetti') {
        p.vx *= Math.exp(-1.5 * dt);
        p.vy += 240 * dt;
        p.x += p.vx * dt + Math.sin(p.life * 6 + p.rot) * 20 * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        continue;
      }
      const drag = p.kind === 'dust' ? 4 : 1.2;
      p.vx *= Math.exp(-drag * dt);
      p.vy *= Math.exp(-drag * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind !== 'dust') {
        p.vz -= 1400 * dt;
        p.z += p.vz * dt;
        if (p.z < 0 && p.z > -30 && world && world.arena && p.kind === 'drop') { p.z = 0; p.vz *= -0.3; }
      } else p.z += 20 * dt;
      p.rot += p.spin * dt;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      this.pops[i].life -= dt;
      if (this.pops[i].life <= 0) this.pops.splice(i, 1);
    }
  }

  // Watch tiles disappear to animate them falling.
  updateTiles(world, dt) {
    const tiles = world.arena.tiles;
    if (!tiles) return;
    if (!this.tileState || this.tileState.length !== tiles.length) this.tileState = tiles.map((t) => t.gone);
    for (let k = 0; k < tiles.length; k++) {
      if (tiles[k].gone && !this.tileState[k] && this.fallingTiles.length < 20) this.fallingTiles.push({ x: tiles[k].x, y: tiles[k].y, half: tiles[k].half, t: 0 });
      this.tileState[k] = tiles[k].gone;
    }
    for (let k = this.fallingTiles.length - 1; k >= 0; k--) {
      const f = this.fallingTiles[k];
      f.t += dt;
      if (f.t > 1.2) this.fallingTiles.splice(k, 1);
    }
  }

  // ------------------------------------------------------------ drawing

  draw(world, opts = {}) {
    const ctx = this.ctx;
    this.screenSpace();
    if (!this.bg) this.setArena(world.arenaDef);
    ctx.drawImage(this.bg, 0, 0, this.w, this.h);
    const drift = this.reduced ? 0 : (this.time * 12) % this.w;
    ctx.drawImage(this.clouds, -drift, 0, this.w, this.h);
    ctx.drawImage(this.clouds, this.w - drift, 0, this.w, this.h);

    // Falling blobs behind the arena (they went off the far side).
    for (const b of world.blobs) if (b.falling && b.y < this.fallSplit(world, b)) this.drawFallingBlob(world, b);
    this.drawFallingTiles(world, true);
    this.drawFloor(world);
    this.drawFloorOverlays(world);

    // Sorted sprites: blobs, bumpers, coins, power-ups.
    const list = this.sprites;
    list.length = 0;
    for (const b of world.blobs) if (!b.falling && !b.out) list.push(b);
    for (const b of world.arena.bumpers) list.push(b);
    for (const c of world.coins) list.push(c);
    for (const p of world.powerups) list.push(p);
    list.sort((a, b) => a.y - b.y);
    for (const s of list) {
      if (s.look) this.drawWorldBlob(world, s, opts);
      else if (s.r) this.drawBumper(world, s);
      else if (s.kind) this.drawPower(world, s);
      else this.drawCoin(world, s);
    }
    this.drawBombs(world);
    for (const b of world.blobs) if (b.falling && b.y >= this.fallSplit(world, b)) this.drawFallingBlob(world, b);
    this.drawFallingTiles(world, false);
    this.drawParticles(world);
    if (opts.tags !== false) this.drawTags(world, opts);
    this.drawPops();
    if (this.flash > 0) {
      this.screenSpace();
      ctx.globalAlpha = Math.min(0.35, this.flash * 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
  }

  // Blobs falling off the far edge go behind the floor.
  fallSplit(world) { return world.arena.kind === 'seesaw' ? 0 : -20; }

  drawFloor(world) {
    const ctx = this.ctx;
    const st = world.arena, a = st.arena;
    const T = THICK / TILT;
    switch (st.kind) {
      case 'disc': case 'shrink': case 'turntable': case 'donut': {
        const r = st.kind === 'shrink' ? st.r : a.r;
        this.floorSpace();
        ctx.fillStyle = this.sideFill;
        ctx.beginPath(); ctx.rect(-r, 0, 2 * r, T); ctx.arc(0, T, r, 0, TAU); ctx.fill();
        this.drawDrips(r, T);
        ctx.save();
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
        if (st.kind === 'donut') ctx.arc(0, 0, a.inner, 0, TAU, true);
        ctx.clip();
        if (st.kind === 'turntable') { ctx.rotate(st.angle); }
        ctx.drawImage(this.tex, -this.texE, -this.texE, 2 * this.texE, 2 * this.texE);
        ctx.restore();
        ctx.strokeStyle = this.rimColor;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(0, 0, r - 3, 0, TAU); ctx.stroke();
        if (st.kind === 'donut') this.drawHole(a.inner, T);
        if (st.kind === 'turntable') {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(0, 0, a.hub, 0, TAU); ctx.fill();
          ctx.fillStyle = this.sideDark;
          ctx.beginPath(); ctx.arc(0, 0, a.hub * 0.45, 0, TAU); ctx.fill();
        }
        if (st.kind === 'shrink' && st.r < a.r - 2) {
          // Melting ghost of the old edge.
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 3;
          ctx.setLineDash(DASH);
          ctx.beginPath(); ctx.arc(0, 0, a.r, 0, TAU); ctx.stroke();
          ctx.setLineDash(NO_DASH);
        }
        break;
      }
      case 'rect': case 'conveyor': {
        this.floorSpace();
        const w = a.w, h = a.h, r = a.round || 0;
        ctx.fillStyle = this.sideFill;
        ctx.beginPath(); this.roundRect(-w / 2, -h / 2 + T, w, h, r); ctx.rect(-w / 2, 0, w, h / 2 + T - r); ctx.fill();
        ctx.save();
        ctx.beginPath(); this.roundRect(-w / 2, -h / 2, w, h, r); ctx.clip();
        ctx.drawImage(this.tex, -this.texE, -this.texE, 2 * this.texE, 2 * this.texE);
        if (st.kind === 'conveyor') this.drawBelts(world);
        ctx.restore();
        ctx.strokeStyle = this.rimColor;
        ctx.lineWidth = 6;
        ctx.beginPath(); this.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, Math.max(0, r - 3)); ctx.stroke();
        break;
      }
      case 'seesaw': this.drawSeesaw(world, T); break;
      case 'tiles': this.drawTiles(world, T); break;
      case 'terraces': this.drawTerraces(world); break;
      default:
    }
    if (st.storm !== Infinity) {
      // Sudden death: a dark ring closes in.
      this.floorSpace();
      ctx.fillStyle = 'rgba(60,0,40,0.45)';
      ctx.beginPath(); ctx.arc(0, 0, this.E * 1.6, 0, TAU); ctx.arc(0, 0, Math.max(1, st.storm), 0, TAU, true); ctx.fill();
      ctx.strokeStyle = '#ff6a6a';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, Math.max(1, st.storm), 0, TAU); ctx.stroke();
    }
    this.screenSpace();
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    if (!r) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Icing drips down the side of round desserts.
  drawDrips(r, T) {
    const ctx = this.ctx;
    ctx.fillStyle = this.rimColor;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI);
    const n = 18;
    let px = -r, py = 0;
    ctx.lineTo(px, py + T * 0.12);
    for (let k = n - 1; k >= 0; k--) {
      const a = (k / n) * Math.PI;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      const len = T * (0.18 + 0.42 * (((k * 7) % 5) / 4));
      const mx = (px + x) / 2, my = (py + y) / 2;
      // A rounded drip hanging between the previous point and this one.
      ctx.quadraticCurveTo(mx, my + len * 2, x, y + T * 0.12);
      px = x; py = y;
    }
    ctx.closePath();
    ctx.globalAlpha = 0.8;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // The donut hole: sky shows through, with the far inner wall.
  drawHole(inner, T) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, inner, 0, TAU); ctx.clip();
    this.screenSpace();
    ctx.drawImage(this.bg, 0, 0, this.w, this.h);
    this.floorSpace();
    ctx.fillStyle = this.sideFill;
    ctx.beginPath(); ctx.arc(0, 0, inner, 0, TAU); ctx.arc(0, T, inner, 0, TAU, true); ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = this.rimColor;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, inner + 3, 0, TAU); ctx.stroke();
  }

  drawBelts(world) {
    const ctx = this.ctx;
    const a = world.arena.arena;
    const t = world.arena.t;
    for (const belt of a.belts) {
      ctx.fillStyle = 'rgba(60,40,40,0.72)';
      ctx.fillRect(-a.w / 2, belt.y - belt.h / 2, a.w, belt.h);
      ctx.fillStyle = belt.v > 0 ? 'rgba(255,214,90,0.9)' : 'rgba(110,220,255,0.9)';
      const dir = Math.sign(belt.v);
      const step = 70;
      const off = ((t * belt.v) % step + step) % step;
      ctx.beginPath();
      for (let x = -a.w / 2 - step + off; x < a.w / 2 + step; x += step) {
        const y0 = belt.y - belt.h * 0.28, y1 = belt.y + belt.h * 0.28;
        ctx.moveTo(x, y0); ctx.lineTo(x + 22 * dir, belt.y); ctx.lineTo(x, y1); ctx.lineTo(x + 12 * dir, y1); ctx.lineTo(x + 34 * dir, belt.y); ctx.lineTo(x + 12 * dir, y0); ctx.closePath();
      }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-a.w / 2, belt.y - belt.h / 2, a.w, 4);
      ctx.fillRect(-a.w / 2, belt.y + belt.h / 2 - 4, a.w, 4);
    }
  }

  drawSeesaw(world, T) {
    const ctx = this.ctx;
    const st = world.arena, a = st.arena;
    const L = a.len / 2 * Math.cos(st.tilt), W = a.wid / 2;
    const shear = (Math.sin(st.tilt) * SEESAW_LIFT) / TILT;
    // Fulcrum.
    this.floorSpace();
    ctx.fillStyle = this.sideDark;
    ctx.beginPath(); ctx.moveTo(-70, W + T * 3.2); ctx.lineTo(0, W * 0.2); ctx.lineTo(70, W + T * 3.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = this.sideFill;
    ctx.beginPath(); ctx.moveTo(-50, W + T * 3); ctx.lineTo(0, W * 0.4); ctx.lineTo(50, W + T * 3); ctx.closePath(); ctx.fill();
    // Plank, sheared so one end rises.
    ctx.transform(1, shear, 0, 1, 0, 0);
    ctx.fillStyle = this.sideFill;
    ctx.fillRect(-L, W, 2 * L, T * 0.55);
    ctx.fillRect(-L, -W + T * 0.55, 2 * L, 2 * W);
    ctx.save();
    ctx.beginPath(); ctx.rect(-L, -W, 2 * L, 2 * W); ctx.clip();
    ctx.drawImage(this.tex, -this.texE, -this.texE, 2 * this.texE, 2 * this.texE);
    ctx.restore();
    ctx.strokeStyle = this.rimColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(-L + 3, -W + 3, 2 * L - 6, 2 * W - 6);
    // Arrows showing which way things slide.
    if (Math.abs(st.tilt) > 0.05) {
      const d = Math.sign(st.tilt);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      for (const x of [-200, 0, 200]) { ctx.moveTo(x - 20 * d, -26); ctx.lineTo(x + 24 * d, 0); ctx.lineTo(x - 20 * d, 26); ctx.closePath(); }
      ctx.fill();
    }
  }

  drawTiles(world, T) {
    const ctx = this.ctx;
    const st = world.arena, a = st.arena;
    this.floorSpace();
    const t = this.time;
    // Sides first, then tops so nearer tiles cover farther tiles' sides.
    ctx.fillStyle = this.sideFill;
    for (const tile of st.tiles) {
      if (tile.gone) continue;
      const j = tile.crack > 0 && !this.reduced ? Math.sin(t * 60 + tile.x) * 2 * tile.crack : 0;
      ctx.fillRect(tile.x - tile.half + j, tile.y + tile.half - 8, tile.half * 2, T * 0.7 + 8);
    }
    ctx.save();
    ctx.beginPath();
    for (const tile of st.tiles) {
      if (tile.gone) continue;
      const j = tile.crack > 0 && !this.reduced ? Math.sin(t * 60 + tile.x) * 2 * tile.crack : 0;
      ctx.rect(tile.x - tile.half + j, tile.y - tile.half, tile.half * 2, tile.half * 2);
    }
    ctx.clip();
    ctx.drawImage(this.tex, -this.texE, -this.texE, 2 * this.texE, 2 * this.texE);
    ctx.restore();
    // Cracks.
    ctx.strokeStyle = 'rgba(70,30,10,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const tile of st.tiles) {
      if (tile.gone || tile.crack <= 0) continue;
      const p = tile.crack / a.crack, h = tile.half;
      ctx.moveTo(tile.x - h * 0.8 * p, tile.y - h * 0.3);
      ctx.lineTo(tile.x - h * 0.1, tile.y + h * 0.1);
      ctx.lineTo(tile.x + h * 0.7 * p, tile.y - h * 0.5 * p);
      ctx.moveTo(tile.x - h * 0.1, tile.y + h * 0.1);
      ctx.lineTo(tile.x + h * 0.2, tile.y + h * 0.8 * p);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,90,60,0.22)';
    for (const tile of st.tiles) {
      if (tile.gone || tile.crack <= 0) continue;
      ctx.fillRect(tile.x - tile.half, tile.y - tile.half, tile.half * 2, tile.half * 2);
    }
  }

  drawFallingTiles(world, behind) {
    if (!this.fallingTiles.length) return;
    const ctx = this.ctx;
    const T = THICK / TILT;
    this.floorSpace();
    for (const f of this.fallingTiles) {
      if ((f.y < 0) !== behind) continue;
      const drop = f.t * f.t * 700 / TILT;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      ctx.fillStyle = this.sideFill;
      ctx.fillRect(f.x - f.half, f.y - f.half + drop + 6, f.half * 2, f.half * 2 + T * 0.5);
      ctx.fillStyle = this.arenaDef.theme.top2;
      ctx.fillRect(f.x - f.half, f.y - f.half + drop, f.half * 2, f.half * 2);
    }
    ctx.globalAlpha = 1;
    this.screenSpace();
  }

  drawTerraces(world) {
    const ctx = this.ctx;
    const st = world.arena, a = st.arena;
    const E = a.extent + 25;
    const lavaH = (st.level - 1) * TIER_H;
    // Rocky bowl holding the lava.
    this.floorSpace(-TIER_H);
    ctx.fillStyle = this.sideDark;
    ctx.beginPath(); ctx.rect(-E, 0, 2 * E, THICK / TILT); ctx.arc(0, THICK / TILT, E, 0, TAU); ctx.fill();
    this.floorSpace(Math.max(-TIER_H, lavaH));
    ctx.fillStyle = this.lavaFill;
    ctx.beginPath(); ctx.arc(0, 0, E, 0, TAU); ctx.fill();
    // Lava bubbles.
    ctx.fillStyle = 'rgba(255,240,150,0.7)';
    for (let k = 0; k < 10; k++) {
      const ph = (this.time * 0.6 + k * 0.37) % 1;
      const ang = k * 2.39, rr = E * (0.55 + 0.4 * ((k * 0.618) % 1));
      ctx.beginPath(); ctx.arc(Math.cos(ang) * rr, Math.sin(ang) * rr, 4 + ph * 12, 0, TAU); ctx.fill();
    }
    // Tiers above the lava, low to high.
    const sorted = this.sortedTiers || (this.sortedTiers = a.tiers.slice().sort((p, q) => p.h - q.h));
    for (const tier of sorted) {
      if (tier.h <= st.level) continue;
      const h = (tier.h - 1) * TIER_H;
      const side = Math.min(TIER_H * 1.6, h - lavaH + 10) / TILT;
      this.floorSpace(h);
      ctx.fillStyle = this.sideFill;
      ctx.beginPath(); ctx.rect(tier.x - tier.r, tier.y, 2 * tier.r, side); ctx.arc(tier.x, tier.y + side, tier.r, 0, TAU); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(tier.x, tier.y, tier.r, 0, TAU); ctx.clip();
      ctx.drawImage(this.tex, -this.texE, -this.texE, 2 * this.texE, 2 * this.texE);
      ctx.restore();
      ctx.strokeStyle = this.rimColor;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(tier.x, tier.y, tier.r - 2, 0, TAU); ctx.stroke();
      // Glow where the lava is about to reach.
      if (tier.h - st.level < 0.5) {
        ctx.fillStyle = 'rgba(255,120,40,0.35)';
        ctx.beginPath(); ctx.arc(tier.x, tier.y, tier.r, 0, TAU); ctx.fill();
      }
    }
  }

  drawFloorOverlays(world) {
    const ctx = this.ctx;
    // King of the Hill zone.
    if (world.zone) {
      const z = world.zone;
      this.floorSpace(this.groundAt(world, z.x, z.y));
      const owner = z.owner >= 0 ? COLORS[world.blobs[z.owner].look.color] : null;
      const pulse = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 5);
      ctx.globalAlpha = 0.28 + pulse * 0.15;
      ctx.fillStyle = owner ? owner.body : z.contested ? '#ffffff' : '#ffe14d';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = owner ? owner.light : '#fff6b0';
      ctx.lineWidth = 7;
      ctx.setLineDash(DASH);
      ctx.lineDashOffset = -this.time * 30;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
      ctx.setLineDash(NO_DASH);
      ctx.lineDashOffset = 0;
      // Timer arc until it moves.
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r + 12, -Math.PI / 2, -Math.PI / 2 + TAU * (z.timer / 12)); ctx.stroke();
    }
    // Bomb warnings.
    for (const bomb of world.bombs) {
      this.floorSpace(this.groundAt(world, bomb.x, bomb.y));
      const p = bomb.t / bomb.warn;
      const blink = this.reduced ? 0.5 : (Math.sin(bomb.t * (8 + p * 20)) > 0 ? 1 : 0.4);
      ctx.globalAlpha = 0.18 + 0.25 * blink;
      ctx.fillStyle = '#ff3a3a';
      ctx.beginPath(); ctx.arc(bomb.x, bomb.y, 115 * (0.4 + 0.6 * p), 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ff5a4a';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(bomb.x, bomb.y, 115, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Shadows.
    for (const b of world.blobs) {
      if (b.out || b.falling) continue;
      const g = this.groundAt(world, b.x, b.y);
      this.floorSpace(g);
      const lift = Math.max(0, b.z);
      const s = Math.max(0.4, 1 - lift / 300);
      ctx.fillStyle = 'rgba(40,10,50,0.24)';
      ctx.beginPath(); ctx.arc(b.x, b.y + 4, b.radius * 0.95 * s, 0, TAU); ctx.fill();
      // Charge ring.
      if (b.charging) {
        ctx.strokeStyle = b.charge >= 1 ? '#ffffff' : COLORS[b.look.color].light;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius * (1.2 + b.charge * 0.7), -Math.PI / 2, -Math.PI / 2 + TAU * b.charge); ctx.stroke();
      }
    }
    // Floor rings (shockwaves).
    for (const p of this.particles) {
      if (!p.on || p.kind !== 'ring') continue;
      const t = 1 - p.life / p.max;
      this.floorSpace(this.groundAt(world, p.x, p.y));
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 10 * (1 - t) + 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.3 + 0.7 * Math.sqrt(t)), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.screenSpace();
  }

  drawWorldBlob(world, b, opts) {
    const ctx = this.ctx;
    const soft = this.softs[b.i];
    if (!soft) return;
    const g = this.groundAt(world, b.x, b.y);
    const k = this.k;
    let z = b.z;
    if (soft.spawnT > 0) z += soft.spawnT * soft.spawnT * 1400;
    let gx = this.sx(b.x), gy = this.sy(b.y, g + z);
    if (b.charging && !this.reduced) { gx += Math.sin(this.time * 70) * b.charge * 1.8; }
    const r = b.radius * k;
    const s = this.pts;
    s.facing = b.facing;
    s.mood = b.knock > 0.15 ? 'hurt' : b.charging ? 'charge' : '';
    s.slimed = b.slime > 0;
    const sp = Math.hypot(b.vx, b.vy * TILT);
    s.stretch = Math.min(0.28, sp / 2600);
    s.ux = sp > 1 ? b.vx / sp : 0; s.uy = sp > 1 ? (b.vy * TILT) / sp : 0;
    if (b.invuln > 0) ctx.globalAlpha = this.reduced ? 0.7 : (Math.floor(b.invuln * 10) % 2 ? 0.45 : 0.9);
    if (b.magnet > 0) this.drawMagnetField(gx, gy - r * 0.8, r, b);
    const cy = drawBlob(ctx, this.shade, soft, b.look, gx, gy, r, s);
    if (b.sticky > 0) {
      ctx.fillStyle = '#68d83a';
      for (let d = -1; d <= 1; d++) {
        const dy = (Math.sin(this.time * 3 + d) * 0.5 + 0.5) * r * 0.25;
        ctx.beginPath(); ctx.ellipse(gx + d * r * 0.5, gy - r * 0.1 + dy, r * 0.12, r * 0.18 + dy * 0.4, 0, 0, TAU); ctx.fill();
      }
    }
    if (b.shield > 0) {
      const R = r * 1.35;
      ctx.fillStyle = 'rgba(160,225,255,0.18)';
      ctx.strokeStyle = 'rgba(220,245,255,0.85)';
      ctx.lineWidth = Math.max(2, r * 0.07);
      ctx.beginPath(); ctx.arc(gx, cy, R, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(gx, cy, R * 0.8, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawMagnetField(x, y, r, b) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,80,110,0.45)';
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    for (let k = 0; k < 3; k++) {
      const p = this.reduced ? 0.5 : ((this.time * 1.2 + k / 3) % 1);
      ctx.globalAlpha = (1 - p) * 0.8;
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, r * (1 + 3 * (1 - p)), r * (1 + 3 * (1 - p)) * TILT, 0, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = b.invuln > 0 ? 0.6 : 1;
  }

  drawFallingBlob(world, b) {
    const soft = this.softs[b.i];
    if (!soft) return;
    const p = Math.min(1, b.fallT / 1.1);
    const g = this.groundAt(world, b.x, b.y);
    const scale = 1 - p * 0.55;
    const gx = this.sx(b.x), gy = this.sy(b.y, g + b.z);
    const s = this.pts;
    s.facing = b.facing; s.mood = 'hurt'; s.slimed = false; s.stretch = 0;
    this.ctx.globalAlpha = 1 - p * 0.6;
    drawBlob(this.ctx, this.shade, soft, b.look, gx, gy, b.radius * this.k * scale, s);
    this.ctx.globalAlpha = 1;
  }

  drawBumper(world, bm) {
    const k = this.bumperSquash[world.arena.bumpers.indexOf(bm)] || 0;
    const r = bm.r * this.k * (1 + k * 0.25);
    const x = this.sx(bm.x), y = this.sy(bm.y);
    const img = this.mushrooms[Math.abs(Math.round(bm.x + bm.y)) % 3];
    const w = r * 2.3, h = r * 2.3 * (1 - k * 0.15);
    this.ctx.fillStyle = 'rgba(40,10,50,0.22)';
    this.ctx.beginPath(); this.ctx.ellipse(x, y, r * 1.05, r * 1.05 * TILT, 0, 0, TAU); this.ctx.fill();
    this.ctx.drawImage(img, x - w / 2, y - h * 0.85, w, h);
  }

  drawCoin(world, c) {
    const g = this.groundAt(world, c.x, c.y);
    const bounce = c.t < 0.35 ? (1 - c.t / 0.35) * 60 : Math.abs(Math.sin(this.time * 3 + c.spin)) * 6;
    const x = this.sx(c.x), y = this.sy(c.y, g + bounce + 14);
    const s = (c.value > 1 ? 34 : 24) * this.k * 1.2;
    const w = Math.max(0.15, Math.abs(Math.cos(this.time * 3 + c.spin))) * s;
    this.ctx.fillStyle = 'rgba(40,10,50,0.2)';
    this.ctx.beginPath(); this.ctx.ellipse(this.sx(c.x), this.sy(c.y, g), s * 0.45, s * 0.45 * TILT, 0, 0, TAU); this.ctx.fill();
    this.ctx.drawImage(this.coin, x - w / 2, y - s / 2, w, s);
  }

  drawPower(world, p) {
    const ctx = this.ctx;
    const g = this.groundAt(world, p.x, p.y);
    const bob = this.reduced ? 0 : Math.sin(this.time * 4 + p.x) * 5;
    const s = 46 * this.k * 1.1;
    const x = this.sx(p.x), y = this.sy(p.y, g + 26 + bob);
    ctx.fillStyle = 'rgba(40,10,50,0.2)';
    ctx.beginPath(); ctx.ellipse(this.sx(p.x), this.sy(p.y, g), s * 0.4, s * 0.4 * TILT, 0, 0, TAU); ctx.fill();
    const fade = p.life - p.t < 2 && !this.reduced ? (Math.sin(p.t * 20) > 0 ? 1 : 0.4) : 1;
    ctx.globalAlpha = 0.5 * fade;
    ctx.drawImage(this.glowWhite, x - s, y - s, s * 2, s * 2);
    ctx.globalAlpha = fade;
    ctx.drawImage(this.powerSprites[p.kind], x - s / 2, y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }

  drawBombs(world) {
    for (const bomb of world.bombs) {
      const p = bomb.t / bomb.warn;
      const h = (1 - p) * (1 - p) * 900;
      const g = this.groundAt(world, bomb.x, bomb.y);
      const s = 52 * this.k * 1.2;
      const x = this.sx(bomb.x), y = this.sy(bomb.y, g + h + 20);
      if (y < -s) continue;
      this.ctx.drawImage(this.bomb, x - s / 2, y - s / 2, s, s);
    }
  }

  drawParticles(world) {
    const ctx = this.ctx;
    for (const p of this.particles) {
      if (!p.on || p.kind === 'ring') continue;
      const a = Math.min(1, p.life / p.max * 1.6);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'confetti') {
        const w = p.size, h = p.size * 0.55 * Math.abs(Math.cos(p.rot));
        ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h + 1);
        continue;
      }
      const g = world && p.kind !== 'dust' ? 0 : 0;
      const x = this.sx(p.x), y = this.sy(p.y, p.z + g);
      const s = p.size * this.k * (p.kind === 'dust' ? 1 + (1 - p.life / p.max) * 0.8 : 1);
      if (p.kind === 'star') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillRect(-s, -s * 0.25, s * 2, s * 0.5);
        ctx.fillRect(-s * 0.25, -s, s * 0.5, s * 2);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Name tags so everyone can find their blob.
  drawTags(world, opts) {
    const ctx = this.ctx;
    ctx.font = this.fontTag;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    for (const b of world.blobs) {
      if (b.out || (opts.tagHumansOnly && b.bot)) continue;
      const soft = this.softs[b.i];
      const g = this.groundAt(world, b.x, b.y);
      const z = b.falling ? b.z : b.z + (soft ? soft.spawnT * soft.spawnT * 1400 : 0);
      const x = this.sx(b.x), y = this.sy(b.y, g + z) - b.radius * this.k * (b.look.hat ? 2.75 : 2.15);
      const label = opts.labels ? opts.labels[b.i] : b.name;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(30,10,50,0.75)';
      ctx.strokeText(label, x, y);
      ctx.fillStyle = COLORS[b.look.color].light;
      ctx.fillText(label, x, y);
      // Little pointer.
      ctx.fillStyle = COLORS[b.look.color].body;
      ctx.beginPath(); ctx.moveTo(x - 4, y + 1); ctx.lineTo(x + 4, y + 1); ctx.lineTo(x, y + 6); ctx.closePath(); ctx.fill();
    }
  }

  drawPops() {
    const ctx = this.ctx;
    this.screenSpace();
    ctx.font = this.fontPop;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const base = Math.min(this.w, this.h) / 900;
    for (const p of this.pops) {
      const t = 1 - p.life / p.max;
      // Pop in with an overshoot, then float up and fade.
      const grow = t < 0.15 ? (t / 0.15) * 1.25 : t < 0.25 ? 1.25 - ((t - 0.15) / 0.1) * 0.25 : 1;
      let x, y;
      if (p.x === null) { x = this.w / 2; y = this.h * 0.42; } else { x = this.sx(p.x); y = this.sy(p.y, 60) - t * 40; }
      const sc = grow * p.size * Math.max(0.6, base * 1.4) * (this.reduced ? 1 : 1 + Math.sin(t * 20 + p.wobble) * 0.02);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.reduced ? 0 : Math.sin(p.wobble) * 0.08);
      ctx.scale(sc, sc);
      ctx.globalAlpha = t > 0.75 ? (1 - t) / 0.25 : 1;
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#2a0f45';
      ctx.strokeText(p.text, 0, 3);
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ podium

  startPodium(ranking, looks, def) {
    if (def && def.id !== this.arenaId) this.setArena(def);
    this.podium = { ranking, looks, t: 0, softs: ranking.map(() => new SoftBody()), confetti: 0 };
    for (const p of this.particles) p.on = false;
    this.pops.length = 0;
  }

  drawPodium(dt) {
    const pd = this.podium;
    if (!pd) return;
    pd.t += dt;
    this.time += dt;
    const ctx = this.ctx;
    this.screenSpace();
    ctx.drawImage(this.bg, 0, 0, this.w, this.h);
    const drift = this.reduced ? 0 : (this.time * 12) % this.w;
    ctx.drawImage(this.clouds, -drift, 0, this.w, this.h);
    ctx.drawImage(this.clouds, this.w - drift, 0, this.w, this.h);
    const W = this.w, H = this.h;
    const portrait = H > W;
    const unit = Math.min(W / 7, H / (portrait ? 9 : 7.5));
    const baseY = portrait ? H * 0.46 : H * 0.5;
    const steps = [
      { place: 1, x: W / 2, h: unit * 1.7, color: '#ffd23a' },
      { place: 2, x: W / 2 - unit * 1.7, h: unit * 1.15, color: '#d8e2f0' },
      { place: 3, x: W / 2 + unit * 1.7, h: unit * 0.8, color: '#f0a868' },
      { place: 4, x: W / 2 + unit * 3.1, h: unit * 0.35, color: '#c9b8e8' },
    ];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < pd.ranking.length && i < 4; i++) {
      const s = steps[i];
      const w = unit * 1.5;
      ctx.fillStyle = mix(s.color, '#000000', 0.25);
      ctx.fillRect(s.x - w / 2, baseY - s.h + unit * 0.18, w, s.h);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - w / 2, baseY - s.h, w, s.h);
      ctx.fillStyle = mix(s.color, '#ffffff', 0.4);
      ctx.fillRect(s.x - w / 2, baseY - s.h, w, unit * 0.12);
      if (s.h > unit * 0.5) {
        ctx.font = `900 ${Math.round(unit * 0.55)}px ${FONT}`;
        ctx.fillStyle = mix(s.color, '#000000', 0.4);
        ctx.fillText(String(s.place), s.x, baseY - s.h / 2 + unit * 0.05);
      }
      const soft = pd.softs[i];
      const delay = (3 - i) * 0.35;
      const t = pd.t - delay;
      if (t < 0) continue;
      soft.update(dt, 0);
      const hop = i === 0 && !this.reduced ? Math.abs(Math.sin(pd.t * 3.2)) * unit * 0.35 : 0;
      const drop = t < 0.4 ? (1 - t / 0.4) ** 2 * H * 0.6 : 0;
      if (t < 0.45 && t + dt >= 0.4) soft.squash(-8);
      if (i === 0 && hop < unit * 0.02 && !this.reduced) soft.squash(-1.2);
      const look = pd.looks[pd.ranking[i]];
      const r = unit * (i === 0 ? 0.62 : 0.5);
      const st = this.pts;
      st.facing = Math.PI / 2; st.mood = ''; st.slimed = false; st.stretch = 0;
      ctx.fillStyle = 'rgba(40,10,50,0.25)';
      ctx.beginPath(); ctx.ellipse(s.x, baseY - s.h, r, r * 0.25, 0, 0, TAU); ctx.fill();
      drawBlob(ctx, this.shade, soft, look, s.x, baseY - s.h - hop - drop, r, st);
    }
    // Confetti.
    pd.confetti += dt * (this.reduced ? 10 : 60);
    while (pd.confetti > 1) {
      pd.confetti--;
      this.particle('confetti', Math.random() * W, -20, 0, (Math.random() - 0.5) * 120, 60 + Math.random() * 120, 0, 4 + Math.random() * 2, 8 + Math.random() * 8, CANDY[Math.floor(Math.random() * CANDY.length)]);
    }
    this.update(dt, null);
    this.drawParticles(null);
  }

  // A single blob on a small canvas (join cards, HUD chips, collection).
  drawPreview(cvs, look, soft, t, { mood = '', bob = true } = {}) {
    const ctx = cvs.getContext('2d');
    const w = cvs.width, h = cvs.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const r = Math.min(w, h) * 0.27;
    ctx.fillStyle = 'rgba(40,10,50,0.22)';
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.86, r * 0.95, r * 0.28, 0, 0, TAU); ctx.fill();
    const st = this.pts;
    st.facing = Math.PI / 2 + Math.sin(t * 0.8) * 0.6; st.mood = mood; st.slimed = false; st.stretch = 0;
    const hop = bob && !this.reduced ? Math.max(0, Math.sin(t * 4)) * r * 0.15 : 0;
    drawBlob(ctx, this.shade, soft, look, w / 2, h * 0.86 - hop, r, st);
  }
}

export { SoftBody as Jelly };
