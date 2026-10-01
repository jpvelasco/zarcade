// Baked art. Everything here draws once into an offscreen canvas and is
// reused every frame, so per-frame drawing is just drawImage calls.
import { BEANS, BEARS } from './config.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Small deterministic noise so each block size always looks the same.
function seeded(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13; a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5; a >>>= 0;
    return a / 4294967296;
  };
}

export const GUMBALL_COLORS = ['#ff4d6d', '#4dabff', '#ffd23f', '#7ee07a', '#c77dff'];
export const BEAR_COLORS = ['#ff4d5e', '#ff9a3c', '#45c96a', '#f5c400', '#ff5fa8'];

// ------------------------------------------------------------ blocks

const PAD = 4;

// A box piece w×h world units at `s` px/unit. Returns a canvas centred on
// the piece; draw it at (-c.width/2, -c.height/2) after rotating.
export function bakePiece(mat, w, h, stage, s) {
  const pw = w * s;
  const ph = h * s;
  const c = makeCanvas(pw + PAD * 2, ph + PAD * 2);
  const ctx = c.getContext('2d');
  ctx.translate(PAD, PAD);
  const rnd = seeded(Math.round(w * 97 + h * 1013 + mat.length * 7919));
  const lw = Math.max(1, s * 0.06);
  const corner = Math.min(pw, ph) * 0.2;
  let g;
  switch (mat) {
    case 'cookie': {
      g = ctx.createLinearGradient(0, 0, 0, ph);
      g.addColorStop(0, '#f6cd85');
      g.addColorStop(1, '#cf8f42');
      rr(ctx, 0, 0, pw, ph, corner);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,240,200,0.55)';
      ctx.fillRect(0, 0, pw, Math.max(1.5, ph * 0.12));
      const chips = Math.max(1, Math.round(w * h * 2.2));
      for (let i = 0; i < chips; i++) {
        const x = (0.12 + rnd() * 0.76) * pw;
        const y = (0.18 + rnd() * 0.64) * ph;
        const r = s * (0.07 + rnd() * 0.06);
        ctx.fillStyle = '#5a2e12';
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.2, r, rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      rr(ctx, lw / 2, lw / 2, pw - lw, ph - lw, corner);
      ctx.strokeStyle = '#8f5520';
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case 'glass': {
      rr(ctx, 0, 0, pw, ph, corner * 0.6);
      ctx.fillStyle = 'rgba(255,130,185,0.62)';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      const k = Math.min(pw, ph);
      ctx.moveTo(pw * 0.15, 0); ctx.lineTo(pw * 0.15 + k * 0.5, 0); ctx.lineTo(pw * 0.15 - k * 0.3 + k * 0.5, ph); ctx.lineTo(pw * 0.15 - k * 0.3, ph);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(0, 0, pw, Math.max(1.5, ph * 0.1));
      ctx.restore();
      rr(ctx, lw / 2, lw / 2, pw - lw, ph - lw, corner * 0.6);
      ctx.strokeStyle = 'rgba(214,58,128,0.9)';
      ctx.lineWidth = lw;
      ctx.stroke();
      rr(ctx, lw * 2, lw * 2, pw - lw * 4, ph - lw * 4, corner * 0.4);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, lw * 0.6);
      ctx.stroke();
      break;
    }
    case 'choc': {
      g = ctx.createLinearGradient(0, 0, pw, ph);
      g.addColorStop(0, '#80492a');
      g.addColorStop(1, '#4c2411');
      rr(ctx, 0, 0, pw, ph, corner * 0.5);
      ctx.fillStyle = g;
      ctx.fill();
      const cell = s * 0.55;
      const nx = Math.max(1, Math.round(pw / cell));
      const ny = Math.max(1, Math.round(ph / cell));
      const cw = pw / nx;
      const ch = ph / ny;
      const b = Math.max(1, Math.min(cw, ch) * 0.16);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          const x = i * cw, y = j * ch;
          ctx.fillStyle = 'rgba(255,210,170,0.22)';
          ctx.fillRect(x + b * 0.5, y + b * 0.5, cw - b, b * 0.7);
          ctx.fillRect(x + b * 0.5, y + b * 0.5, b * 0.7, ch - b);
          ctx.fillStyle = 'rgba(30,10,0,0.35)';
          ctx.fillRect(x + b * 0.5, y + ch - b * 1.2, cw - b, b * 0.7);
          ctx.fillRect(x + cw - b * 1.2, y + b * 0.5, b * 0.7, ch - b);
        }
      }
      rr(ctx, lw / 2, lw / 2, pw - lw, ph - lw, corner * 0.5);
      ctx.strokeStyle = '#2f1408';
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case 'rock': {
      g = ctx.createLinearGradient(0, 0, pw, ph);
      g.addColorStop(0, '#c9b8ff');
      g.addColorStop(0.5, '#8fb8ff');
      g.addColorStop(1, '#6f7ff0');
      rr(ctx, 0, 0, pw, ph, corner * 0.4);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.clip();
      const n = Math.max(3, Math.round(w * h * 5));
      for (let i = 0; i < n; i++) {
        const x = rnd() * pw, y = rnd() * ph, r = s * (0.18 + rnd() * 0.25);
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.28)' : 'rgba(60,40,160,0.22)';
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.8, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.8, y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < Math.max(1, n / 3); i++) {
        const x = rnd() * pw, y = rnd() * ph, r = s * 0.06;
        ctx.fillRect(x - r * 2, y - r * 0.4, r * 4, r * 0.8);
        ctx.fillRect(x - r * 0.4, y - r * 2, r * 0.8, r * 4);
      }
      ctx.restore();
      rr(ctx, lw / 2, lw / 2, pw - lw, ph - lw, corner * 0.4);
      ctx.strokeStyle = '#4a46b8';
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case 'ice': {
      g = ctx.createLinearGradient(0, 0, 0, ph);
      g.addColorStop(0, '#e8fbff');
      g.addColorStop(1, '#98d8f0');
      rr(ctx, 0, 0, pw, ph, corner * 0.5);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // Frosting drips along the top.
      ctx.fillStyle = '#ffffff';
      const band = Math.min(ph * 0.35, s * 0.18);
      ctx.fillRect(0, 0, pw, band);
      const drips = Math.max(2, Math.round(pw / (s * 0.35)));
      for (let i = 0; i < drips; i++) {
        const x = (i + 0.5) * (pw / drips);
        const len = band + rnd() * Math.min(ph * 0.4, s * 0.3);
        const r = pw / drips * 0.32;
        ctx.fillRect(x - r, 0, r * 2, len);
        ctx.beginPath(); ctx.arc(x, len, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(1, lw * 0.8);
      ctx.beginPath();
      ctx.moveTo(pw * 0.2, ph * 0.9); ctx.lineTo(pw * 0.35, ph * 0.5);
      ctx.stroke();
      ctx.restore();
      rr(ctx, lw / 2, lw / 2, pw - lw, ph - lw, corner * 0.5);
      ctx.strokeStyle = '#5aaed0';
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case 'marsh': {
      g = ctx.createLinearGradient(0, 0, 0, ph);
      g.addColorStop(0, '#fffafc');
      g.addColorStop(1, '#ffcfe3');
      rr(ctx, 0, 0, pw, ph, Math.min(pw, ph) * 0.42);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(pw * 0.32, ph * 0.28, pw * 0.18, ph * 0.1, -0.2, 0, Math.PI * 2);
      ctx.fill();
      rr(ctx, lw / 2, lw / 2, pw - lw, ph - lw, Math.min(pw, ph) * 0.42);
      ctx.strokeStyle = '#e8a1c3';
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case 'fizz': {
      rr(ctx, 0, 0, pw, ph, corner * 0.6);
      g = ctx.createLinearGradient(0, 0, 0, ph);
      g.addColorStop(0, '#ff6b81');
      g.addColorStop(1, '#d81e47');
      ctx.fillStyle = g;
      ctx.fill();
      const inset = Math.min(pw, ph) * 0.12;
      rr(ctx, inset, inset, pw - inset * 2, ph - inset * 2, corner * 0.4);
      ctx.strokeStyle = '#fff3c4';
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.stroke();
      // Lightning bolt.
      const cx = pw / 2, cy = ph / 2, k = Math.min(pw, ph) * 0.34;
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.moveTo(cx + k * 0.2, cy - k);
      ctx.lineTo(cx - k * 0.55, cy + k * 0.12);
      ctx.lineTo(cx - k * 0.02, cy + k * 0.12);
      ctx.lineTo(cx - k * 0.22, cy + k);
      ctx.lineTo(cx + k * 0.55, cy - k * 0.15);
      ctx.lineTo(cx + k * 0.02, cy - k * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8a1030';
      ctx.lineWidth = Math.max(1, lw * 0.7);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(pw * (0.22 + i * 0.12), ph * (0.75 - i * 0.12), s * (0.05 + i * 0.015), 0, Math.PI * 2);
        ctx.fill();
      }
      rr(ctx, lw / 2, lw / 2, pw - lw, ph - lw, corner * 0.6);
      ctx.strokeStyle = '#7d0d2a';
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    default: {
      ctx.fillStyle = '#ccc';
      ctx.fillRect(0, 0, pw, ph);
    }
  }
  if (stage > 0) drawCracks(ctx, pw, ph, stage, rnd, mat, s);
  return c;
}

function drawCracks(ctx, pw, ph, stage, rnd, mat, s) {
  const dark = mat === 'choc' ? 'rgba(20,6,0,0.85)' : mat === 'glass' || mat === 'ice' ? 'rgba(255,255,255,0.95)' : 'rgba(70,30,5,0.8)';
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.lineCap = 'round';
  const lines = stage === 1 ? 2 : 5;
  for (let i = 0; i < lines; i++) {
    let x = rnd() * pw;
    let y = rnd() < 0.5 ? 0 : ph;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 3 + Math.floor(rnd() * 2);
    for (let k = 0; k < steps; k++) {
      x += (rnd() - 0.5) * Math.min(pw, s * 0.8);
      y += (y < ph / 2 ? 1 : -1) * ph * (0.12 + rnd() * 0.18);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (stage === 2) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const x = rnd() < 0.5 ? 0 : pw, y = rnd() < 0.5 ? 0 : ph;
    const k = Math.min(pw, ph) * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (x ? -k : k), y);
    ctx.lineTo(x, y + (y ? -k * 0.8 : k * 0.8));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function bakeGumball(r, color, stage, s) {
  const pr = r * s;
  const c = makeCanvas(pr * 2 + PAD * 2, pr * 2 + PAD * 2);
  const ctx = c.getContext('2d');
  const cx = c.width / 2, cy = c.height / 2;
  const g = ctx.createRadialGradient(cx - pr * 0.35, cy - pr * 0.4, pr * 0.1, cx, cy, pr);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, color);
  g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = shade(color, -0.5);
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.stroke();
  // A swirl so you can see it roll.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.beginPath(); ctx.arc(cx + pr * 0.1, cy + pr * 0.1, pr * 0.55, 0.3, 2.1); ctx.stroke();
  if (stage > 0) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.clip();
    drawCracks(ctx, c.width, c.height, stage, seeded(Math.round(r * 1000)), 'glass', s);
    ctx.restore();
  }
  return c;
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// ------------------------------------------------------------ gummy bears

// mood: 'idle' | 'blink' | 'hurt' | 'scared'
export function bakeBear(size, color, mood, s) {
  const spec = BEARS[size];
  const r = spec.r * s;
  const c = makeCanvas(r * 2.8 + PAD * 2, r * 3.0 + PAD * 2);
  const ctx = c.getContext('2d');
  const cx = c.width / 2, cy = c.height / 2 + r * 0.15;
  const dark = shade(color, -0.42);
  const lw = Math.max(1.2, r * 0.07);
  // Ears.
  for (const sx of [-1, 1]) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx + sx * r * 0.66, cy - r * 0.7, r * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = lw; ctx.stroke();
    ctx.fillStyle = shade(color, 0.35);
    ctx.beginPath(); ctx.arc(cx + sx * r * 0.66, cy - r * 0.7, r * 0.17, 0, Math.PI * 2); ctx.fill();
  }
  // Head / body.
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 1.05);
  g.addColorStop(0, shade(color, 0.55));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.25));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = lw; ctx.stroke();
  // Gummy shine.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(cx - r * 0.45, cy - r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2); ctx.fill();
  // Snout.
  ctx.fillStyle = shade(color, 0.45);
  ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.32, r * 0.42, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a1020';
  ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.2, r * 0.14, r * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  // Mouth.
  ctx.strokeStyle = '#3a1020';
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood === 'hurt' || mood === 'scared') ctx.ellipse(cx, cy + r * 0.45, r * 0.1, r * 0.08, 0, 0, Math.PI * 2);
  else ctx.arc(cx, cy + r * 0.56, r * 0.16, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  // Eyes and grumpy brows.
  const ex = r * 0.34, ey = cy - r * 0.12;
  for (const sx of [-1, 1]) {
    const x = cx + sx * ex;
    if (mood === 'blink') {
      ctx.beginPath(); ctx.moveTo(x - r * 0.12, ey); ctx.lineTo(x + r * 0.12, ey); ctx.stroke();
    } else if (mood === 'hurt') {
      const k = r * 0.1;
      ctx.beginPath(); ctx.moveTo(x - k, ey - k); ctx.lineTo(x + k, ey + k); ctx.moveTo(x + k, ey - k); ctx.lineTo(x - k, ey + k); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(x, ey, r * 0.15, r * (mood === 'scared' ? 0.19 : 0.13), 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0610';
      ctx.beginPath(); ctx.arc(x - r * 0.04, ey + r * 0.02, r * 0.075, 0, Math.PI * 2); ctx.fill();
    }
    if (mood !== 'scared') {
      ctx.strokeStyle = '#3a1020';
      ctx.lineWidth = Math.max(1.2, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(x + sx * r * 0.2, ey - r * 0.32);
      ctx.lineTo(x - sx * r * 0.14, ey - r * 0.2);
      ctx.stroke();
    }
  }
  if (mood === 'hurt') {
    ctx.fillStyle = 'rgba(140,220,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.8, cy - r * 0.55);
    ctx.quadraticCurveTo(cx + r * 0.98, cy - r * 0.25, cx + r * 0.8, cy - r * 0.2);
    ctx.quadraticCurveTo(cx + r * 0.62, cy - r * 0.25, cx + r * 0.8, cy - r * 0.55);
    ctx.fill();
  }
  if (spec.helmet) {
    // A chocolate helmet.
    ctx.fillStyle = '#6b3a1f';
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.48, r * 0.9, r * 0.55, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - r * 0.95, cy - r * 0.52, r * 1.9, r * 0.16);
    ctx.fillStyle = 'rgba(255,220,180,0.35)';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.35, cy - r * 0.78, r * 0.25, r * 0.1, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a1a08'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.48, r * 0.9, r * 0.55, 0, Math.PI, Math.PI * 2); ctx.stroke();
  }
  if (spec.crown) {
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#b07800';
    ctx.lineWidth = lw;
    const by = cy - r * 0.8, w = r * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - w, by);
    ctx.lineTo(cx - w, by - r * 0.55);
    ctx.lineTo(cx - w * 0.5, by - r * 0.25);
    ctx.lineTo(cx, by - r * 0.7);
    ctx.lineTo(cx + w * 0.5, by - r * 0.25);
    ctx.lineTo(cx + w, by - r * 0.55);
    ctx.lineTo(cx + w, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const [gx, col] of [[-0.5, '#ff4d6d'], [0, '#4dabff'], [0.5, '#7ee07a']]) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(cx + gx * w, by - r * 0.12, r * 0.08, 0, Math.PI * 2); ctx.fill();
    }
  }
  return c;
}

// ------------------------------------------------------------ jelly beans

export function beanPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(-1.12 * r, 0.05 * r);
  ctx.bezierCurveTo(-1.18 * r, -0.86 * r, -0.28 * r, -0.98 * r, 0, -0.62 * r);
  ctx.bezierCurveTo(0.28 * r, -0.98 * r, 1.18 * r, -0.86 * r, 1.12 * r, 0.05 * r);
  ctx.bezierCurveTo(1.06 * r, 0.98 * r, -1.06 * r, 0.98 * r, -1.12 * r, 0.05 * r);
  ctx.closePath();
}

// face: 'happy' | 'go' (flying) | 'sleepy'
export function bakeBean(type, r, face, s) {
  const spec = BEANS[type];
  const pr = r * s;
  const c = makeCanvas(pr * 2.6 + PAD * 2, pr * 2.3 + PAD * 2);
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  const g = ctx.createLinearGradient(0, -pr, 0, pr);
  g.addColorStop(0, spec.light);
  g.addColorStop(0.45, spec.color);
  g.addColorStop(1, spec.dark);
  beanPath(ctx, pr);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = spec.dark;
  ctx.lineWidth = Math.max(1.2, pr * 0.08);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.ellipse(-pr * 0.5, -pr * 0.42, pr * 0.32, pr * 0.13, -0.35, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.arc(pr * 0.62, -pr * 0.38, pr * 0.07, 0, Math.PI * 2); ctx.fill();
  // Face, looking right.
  const ey = -pr * 0.08;
  for (const ex of [0.05, 0.5]) {
    const x = ex * pr;
    if (face === 'sleepy') {
      ctx.strokeStyle = '#2a0f1a';
      ctx.lineWidth = Math.max(1, pr * 0.08);
      ctx.beginPath(); ctx.arc(x, ey, pr * 0.12, 0.2, Math.PI - 0.2); ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(x, ey, pr * 0.17, pr * 0.21, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a0610';
    ctx.beginPath(); ctx.arc(x + pr * 0.06, ey + pr * 0.02, pr * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x + pr * 0.09, ey - pr * 0.03, pr * 0.035, 0, Math.PI * 2); ctx.fill();
    if (face === 'go') {
      ctx.strokeStyle = '#2a0f1a';
      ctx.lineWidth = Math.max(1, pr * 0.08);
      ctx.beginPath(); ctx.moveTo(x - pr * 0.16, ey - pr * 0.32); ctx.lineTo(x + pr * 0.16, ey - pr * 0.24); ctx.stroke();
    }
  }
  ctx.strokeStyle = '#2a0f1a';
  ctx.lineWidth = Math.max(1, pr * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (face === 'go') { ctx.ellipse(pr * 0.3, pr * 0.32, pr * 0.14, pr * 0.1, 0, 0, Math.PI * 2); ctx.fillStyle = '#5a0d22'; ctx.fill(); }
  else ctx.arc(pr * 0.28, pr * 0.2, pr * 0.16, 0.3, Math.PI - 0.3);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,120,150,0.45)';
  ctx.beginPath(); ctx.ellipse(-pr * 0.25, pr * 0.22, pr * 0.12, pr * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  return c;
}

// ------------------------------------------------------------ slingshot

// Slingshot geometry in world units relative to the pouch rest point.
export const SLING_GEOM = {
  baseY: -3.3, forkY: -1.2, backTip: [-0.62, 0.25], frontTip: [0.5, 0.18], thick: 0.42,
};

function slingFill(ctx, skin, x0, y0, x1, y1) {
  if (skin.style === 'rainbow') {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    ['#ff5d8f', '#ffb347', '#ffe066', '#7ee07a', '#5dd3ff', '#c77dff'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    return g;
  }
  if (skin.style === 'worm') {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, skin.wood); g.addColorStop(1, skin.wood2);
    return g;
  }
  const g = ctx.createLinearGradient(x0, y0, x1, y0 + (x1 - x0));
  g.addColorStop(0, skin.wood2);
  g.addColorStop(1, skin.wood);
  return g;
}

function strokeLimb(ctx, skin, pts, w, s) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = 'rgba(40,20,10,0.55)';
  ctx.lineWidth = w + Math.max(2, s * 0.08);
  ctx.stroke();
  ctx.strokeStyle = slingFill(ctx, skin, pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1]);
  ctx.lineWidth = w;
  ctx.stroke();
  // Decoration along the limb.
  const len = pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  ctx.save();
  ctx.lineWidth = Math.max(1, w * 0.3);
  if (skin.style === 'stripe' || skin.style === 'twist' || skin.style === 'pretzel') {
    ctx.setLineDash([w * 0.45, w * 0.55]);
    ctx.strokeStyle = skin.style === 'stripe' ? skin.wood2 : skin.style === 'twist' ? 'rgba(255,255,255,0.22)' : 'rgba(255,230,180,0.45)';
    ctx.lineWidth = w * (skin.style === 'stripe' ? 0.9 : 0.35);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (skin.style === 'pretzel') {
    ctx.fillStyle = '#ffffff';
    const n = Math.round(len / (w * 0.7));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const [x, y] = along(pts, t);
      ctx.fillRect(x + ((i * 37) % 7 - 3) * w * 0.06, y + ((i * 53) % 5 - 2) * w * 0.07, w * 0.12, w * 0.09);
    }
  }
  if (skin.style === 'grid') {
    ctx.strokeStyle = 'rgba(90,50,10,0.45)';
    ctx.lineWidth = Math.max(1, w * 0.1);
    ctx.setLineDash([w * 0.12, w * 0.3]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineWidth = w * 0.8;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (skin.style === 'fluff') {
    const n = Math.round(len / (w * 0.8));
    for (let i = 0; i < n; i++) {
      const [x, y] = along(pts, (i + 0.5) / n);
      ctx.fillStyle = i % 2 ? 'rgba(255,194,226,0.95)' : 'rgba(168,220,255,0.95)';
      ctx.beginPath(); ctx.arc(x + Math.sin(i * 2.1) * w * 0.25, y, w * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (skin.style === 'worm') {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([w * 0.15, w * 0.5]);
    ctx.lineWidth = w * 0.85;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  // Shine.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, w * 0.18);
  ctx.beginPath();
  ctx.moveTo(pts[0][0] - w * 0.22, pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] - w * 0.22, pts[i][1]);
  ctx.stroke();
}

function along(pts, t) {
  const lens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); total += l; }
  let d = t * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]) { const k = d / lens[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

// Bakes the slingshot's back (stem + rear arm) and front arm. Returns the
// canvases and the pouch position inside them, in pixels.
export function bakeSling(skin, s) {
  const G = SLING_GEOM;
  const w = G.thick * s;
  const width = 2.2 * s;
  const height = 4.2 * s;
  const ox = width / 2, oy = 0.9 * s; // pouch rest point inside the canvas
  const P = (x, y) => [ox + x * s, oy - y * s];
  const back = makeCanvas(width, height);
  let ctx = back.getContext('2d');
  strokeLimb(ctx, skin, [P(0, G.baseY), P(0, G.forkY), P(G.backTip[0], G.backTip[1])], w, s);
  if (skin.style === 'star') {
    ctx.fillStyle = '#fff6b0';
    star(ctx, ...P(0, G.forkY - 0.1), w * 1.0, w * 0.45);
  }
  const front = makeCanvas(width, height);
  ctx = front.getContext('2d');
  strokeLimb(ctx, skin, [P(0.02, G.forkY + 0.05), P(G.frontTip[0], G.frontTip[1])], w * 0.92, s);
  // Band wraps at the tips.
  for (const [cv, tip] of [[back, G.backTip], [front, G.frontTip]]) {
    const c2 = cv.getContext('2d');
    const [x, y] = P(tip[0], tip[1] - 0.12);
    c2.fillStyle = skin.band;
    c2.fillRect(x - w * 0.6, y - w * 0.3, w * 1.2, w * 0.6);
  }
  return { back, front, ox, oy };
}

export function star(ctx, x, y, R, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  ctx.closePath();
  ctx.fill();
}

// ------------------------------------------------------------ backdrops

export const THEMES = [
  {
    sky: ['#ffe9c7', '#ffc28a', '#ff9f80'], sun: '#fff3c9',
    far: '#eaa66c', far2: '#d98a50', mid: '#c87638', mid2: '#a95f2a',
    ground: '#c98a45', groundTop: '#f2c27a', groundDark: '#8d5422', crumb: '#6b3a16',
    liquid: '#7a3e1d', liquidTop: '#a55a2e',
  },
  {
    sky: ['#e2fbff', '#a9e7fb', '#6fc7f2'], sun: '#ffffff',
    far: '#8fd9e8', far2: '#6fc0d6', mid: '#5fd6b0', mid2: '#3fb592',
    ground: '#48b98f', groundTop: '#9af0c8', groundDark: '#24785a', crumb: '#ffffff',
    liquid: '#3aa4ff', liquidTop: '#9ad8ff',
  },
  {
    sky: ['#f6efff', '#d6c8ff', '#a99cf0'], sun: '#ffffff',
    far: '#b6a5f0', far2: '#9a87e6', mid: '#e7dcff', mid2: '#c7b7f5',
    ground: '#d9cdfa', groundTop: '#ffffff', groundDark: '#9c8ad8', crumb: '#b9a6f5',
    liquid: '#5f8dff', liquidTop: '#b7caff',
  },
];

// The sky: gradient, sun and soft clouds, full screen.
export function bakeSky(theme, W, H, worldIdx) {
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, theme.sky[2]);
  g.addColorStop(0.55, theme.sky[1]);
  g.addColorStop(1, theme.sky[0]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const sr = Math.min(W, H) * 0.09;
  const sx = W * 0.78, sy = H * 0.2;
  const sg = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 3);
  sg.addColorStop(0, 'rgba(255,255,255,0.9)');
  sg.addColorStop(0.3, 'rgba(255,255,240,0.35)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = theme.sun;
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  const rnd = seeded(31 + worldIdx * 7);
  for (let i = 0; i < 6; i++) {
    const x = rnd() * W, y = H * (0.08 + rnd() * 0.35), k = Math.min(W, H) * (0.04 + rnd() * 0.04);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let j = 0; j < 5; j++) {
      ctx.beginPath();
      ctx.arc(x + (j - 2) * k * 0.9, y + Math.abs(j - 2) * k * 0.25, k * (1 - Math.abs(j - 2) * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

// A horizontally tileable parallax layer. `base` is the screen y of the
// layer's bottom edge (the horizon).
export function bakeLayer(theme, worldIdx, depth, T, H, unit) {
  const c = makeCanvas(T, H);
  const ctx = c.getContext('2d');
  const rnd = seeded(101 + worldIdx * 13 + depth * 977);
  const col = depth === 0 ? theme.far : theme.mid;
  const col2 = depth === 0 ? theme.far2 : theme.mid2;
  const base = H;
  const wrap = (fn) => { fn(0); fn(T); fn(-T); };
  if (worldIdx === 0) {
    if (depth === 0) {
      // Mesas with chocolate-drizzled tops.
      let x = 0;
      while (x < T) {
        const w = unit * (5 + rnd() * 7), h = unit * (4 + rnd() * 5), xx = x;
        wrap((o) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(o + xx - w * 0.1, base);
          ctx.lineTo(o + xx + w * 0.08, base - h);
          ctx.lineTo(o + xx + w * 0.92, base - h);
          ctx.lineTo(o + xx + w * 1.1, base);
          ctx.fill();
          ctx.fillStyle = col2;
          for (let k = 1; k < 4; k++) ctx.fillRect(o + xx + w * 0.02, base - h + (h * k) / 4, w * 0.98, unit * 0.18);
          ctx.fillStyle = '#7a3e1d';
          ctx.fillRect(o + xx + w * 0.08, base - h, w * 0.84, unit * 0.3);
          for (let k = 0; k < 5; k++) {
            const dx = o + xx + w * (0.15 + k * 0.17);
            ctx.beginPath(); ctx.arc(dx, base - h + unit * 0.3 + ((k * 7) % 3) * unit * 0.2, unit * 0.16, 0, Math.PI * 2); ctx.fill();
            ctx.fillRect(dx - unit * 0.16, base - h, unit * 0.32, unit * 0.3 + ((k * 7) % 3) * unit * 0.2);
          }
        });
        x += w + unit * (2 + rnd() * 5);
      }
    } else {
      hills(ctx, T, base, unit * 3.2, unit * 2.2, col, rnd, wrap);
      ctx.fillStyle = col2;
      for (let i = 0; i < T / (unit * 1.5); i++) {
        const x = rnd() * T, y = base - rnd() * unit * 2;
        ctx.beginPath(); ctx.ellipse(x, y, unit * 0.18, unit * 0.12, rnd() * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (worldIdx === 1) {
    if (depth === 0) {
      // Bottle rocks and bubble towers.
      let x = 0;
      while (x < T) {
        const w = unit * (1.6 + rnd() * 1.5), h = unit * (5 + rnd() * 6), xx = x;
        wrap((o) => {
          ctx.fillStyle = col;
          rr(ctx, o + xx, base - h, w, h + 2, w * 0.4);
          ctx.fill();
          ctx.fillRect(o + xx + w * 0.3, base - h - unit * 1.2, w * 0.4, unit * 1.4);
          ctx.fillStyle = col2;
          ctx.fillRect(o + xx + w * 0.25, base - h - unit * 1.3, w * 0.5, unit * 0.35);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(o + xx + w * 0.18, base - h + unit * 0.6, w * 0.12, h * 0.6);
        });
        x += w + unit * (1.5 + rnd() * 4);
      }
    } else {
      hills(ctx, T, base, unit * 2.8, unit * 1.8, col, rnd, wrap);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 0; i < T / unit; i++) {
        const x = rnd() * T, y = base - rnd() * unit * 1.8;
        ctx.beginPath(); ctx.arc(x, y, unit * (0.08 + rnd() * 0.12), 0, Math.PI * 2); ctx.fill();
      }
    }
  } else {
    if (depth === 0) {
      // Frosted peaks.
      let x = 0;
      while (x < T) {
        const w = unit * (6 + rnd() * 6), h = unit * (6 + rnd() * 6), xx = x;
        wrap((o) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(o + xx, base); ctx.lineTo(o + xx + w / 2, base - h); ctx.lineTo(o + xx + w, base);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          const cap = 0.35;
          ctx.moveTo(o + xx + w / 2, base - h);
          ctx.lineTo(o + xx + w / 2 + (w / 2) * cap, base - h + h * cap);
          for (let k = 3; k >= 0; k--) {
            const px = o + xx + w / 2 - (w / 2) * cap + ((w * cap) * k) / 3;
            ctx.lineTo(px, base - h + h * cap + (k % 2 ? unit * 0.5 : unit * 0.15));
          }
          ctx.lineTo(o + xx + w / 2 - (w / 2) * cap, base - h + h * cap);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = col2;
          ctx.beginPath();
          ctx.moveTo(o + xx + w / 2, base - h); ctx.lineTo(o + xx + w, base); ctx.lineTo(o + xx + w * 0.7, base);
          ctx.closePath();
          ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
        });
        x += w * 0.7 + unit * rnd() * 3;
      }
    } else {
      hills(ctx, T, base, unit * 2.6, unit * 1.6, col, rnd, wrap);
      ctx.fillStyle = col2;
      for (let i = 0; i < T / (unit * 2); i++) {
        const x = rnd() * T, y = base - rnd() * unit * 1.6;
        ctx.beginPath(); ctx.arc(x, y, unit * 0.12, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  return c;
}

function hills(ctx, T, base, amp, vary, col, rnd, wrap) {
  const n = Math.max(3, Math.round(T / (amp * 2.2)));
  const hs = Array.from({ length: n }, () => amp + rnd() * vary);
  wrap((o) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(o, base);
    for (let i = 0; i <= n; i++) {
      const x = o + (i / n) * T;
      const h = hs[i % n];
      const px = o + ((i - 0.5) / n) * T;
      if (i === 0) ctx.lineTo(x, base - h);
      else ctx.quadraticCurveTo(px, base - h - amp * 0.6, x, base - h);
    }
    ctx.lineTo(o + T, base);
    ctx.closePath();
    ctx.fill();
  });
}

// The ground's top band (grass, crust or icing), tileable, `unit` px tall.
export function bakeGroundStrip(theme, worldIdx, T, unit) {
  const h = unit * 1.6;
  const c = makeCanvas(T, h);
  const ctx = c.getContext('2d');
  const rnd = seeded(7 + worldIdx);
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, unit * 0.35, T, h);
  ctx.fillStyle = theme.groundTop;
  ctx.fillRect(0, 0, T, unit * 0.38);
  const n = Math.round(T / (unit * 0.6));
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (T / n);
    const len = unit * (0.15 + rnd() * 0.35);
    const r = (T / n) * 0.36;
    ctx.fillRect(x - r, 0, r * 2, unit * 0.3 + len);
    ctx.beginPath(); ctx.arc(x, unit * 0.3 + len, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, unit * 0.04, T, unit * 0.08);
  // Crumbs / sprinkles in the soil.
  const sprinkles = ['#ff6b81', '#ffd23f', '#5dd3ff', '#7ee07a', '#ffffff', '#c77dff'];
  for (let i = 0; i < T / (unit * 0.5); i++) {
    const x = rnd() * T, y = unit * (0.9 + rnd() * 0.6);
    ctx.fillStyle = worldIdx === 0 ? theme.crumb : sprinkles[i % sprinkles.length];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd() * Math.PI);
    ctx.fillRect(-unit * 0.1, -unit * 0.035, unit * 0.2, unit * 0.07);
    ctx.restore();
  }
  return c;
}
