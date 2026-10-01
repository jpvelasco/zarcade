// Baked art: every thing on the mountain, ball skins, hats, the Snow Cloud
// and the backdrops are drawn once into offscreen canvases and reused, so
// per-frame drawing is just drawImage.
import { ITEMS, ITEM_BY_ID } from './items.js';
import { mulberry32 } from './rng.js';

const INK = '#3a2d4d';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Small path helpers. All take the context first.
function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); }
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }
function paint(g, fill, lw) { g.fillStyle = fill; g.fill(); if (lw) { g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); } }
function shine(g, x, y, rx, ry, a = 0.45) { ell(g, x, y, rx, ry, -0.5); g.fillStyle = `rgba(255,255,255,${a})`; g.fill(); }
function eyes(g, x, y, s, gap) {
  for (const dx of [-gap, gap]) { circ(g, x + dx, y, s); g.fillStyle = INK; g.fill(); circ(g, x + dx - s * 0.3, y - s * 0.35, s * 0.35); g.fillStyle = '#fff'; g.fill(); }
}
function smile(g, x, y, r, lw) { g.beginPath(); g.arc(x, y, r, 0.2 * Math.PI, 0.8 * Math.PI); g.lineWidth = lw; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); }
function cheeks(g, x, y, gap, r) { for (const dx of [-gap, gap]) { circ(g, x + dx, y, r); g.fillStyle = 'rgba(255,120,150,0.45)'; g.fill(); } }
function snowCap(g, pts) { poly(g, pts); g.fillStyle = '#fbfdff'; g.fill(); }

// Each painter draws into a W×H box (origin top-left, ground at the
// bottom). `f` is the wave frame (0 or 1) for things that wave.
const PAINT = {
  pinecone(g, W, H, lw) {
    ell(g, W / 2, H * 0.52, W * 0.42, H * 0.46); paint(g, '#9a5b32', lw);
    g.strokeStyle = '#6b3a1f'; g.lineWidth = lw * 0.8;
    for (let i = 0; i < 5; i++) {
      const y = H * (0.2 + i * 0.15);
      g.beginPath(); g.moveTo(W * 0.18, y); g.quadraticCurveTo(W / 2, y + H * 0.1, W * 0.82, y); g.stroke();
    }
    snowCap(g, [W * 0.3, H * 0.12, W * 0.7, H * 0.12, W * 0.6, H * 0.04, W * 0.4, H * 0.04]);
  },
  cocoa(g, W, H, lw) {
    g.beginPath(); g.arc(W * 0.78, H * 0.6, W * 0.13, -1.4, 1.4); g.lineWidth = lw * 2.4; g.strokeStyle = INK; g.stroke();
    g.lineWidth = lw * 1.2; g.strokeStyle = '#e8505b'; g.stroke();
    rrect(g, W * 0.12, H * 0.32, W * 0.62, H * 0.64, W * 0.1); paint(g, '#e8505b', lw);
    ell(g, W * 0.43, H * 0.34, W * 0.3, H * 0.07); paint(g, '#7a4426', lw * 0.7);
    for (const [x, y] of [[0.33, 0.31], [0.5, 0.33]]) { rrect(g, W * x - W * 0.07, H * y - H * 0.06, W * 0.14, H * 0.1, 3); paint(g, '#fff', lw * 0.5); }
    g.beginPath(); g.moveTo(W * 0.4, H * 0.22); g.bezierCurveTo(W * 0.3, H * 0.12, W * 0.52, H * 0.1, W * 0.42, H * 0.0);
    g.lineWidth = lw; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.stroke();
    rrect(g, W * 0.2, H * 0.6, W * 0.46, H * 0.08, 2); g.fillStyle = '#fff'; g.fill();
  },
  mitten(g, W, H, lw) {
    g.beginPath();
    g.moveTo(W * 0.22, H * 0.78); g.lineTo(W * 0.2, H * 0.3); g.quadraticCurveTo(W * 0.22, H * 0.02, W * 0.52, H * 0.04);
    g.quadraticCurveTo(W * 0.82, H * 0.06, W * 0.78, H * 0.42); g.quadraticCurveTo(W * 0.98, H * 0.36, W * 0.94, H * 0.5);
    g.quadraticCurveTo(W * 0.88, H * 0.62, W * 0.78, H * 0.64); g.lineTo(W * 0.78, H * 0.78); g.closePath();
    paint(g, '#2bb5a6', lw);
    rrect(g, W * 0.16, H * 0.74, W * 0.68, H * 0.24, 4); paint(g, '#fff', lw);
    g.fillStyle = '#ff6f91'; for (let i = 0; i < 3; i++) { circ(g, W * (0.3 + i * 0.2), H * 0.4, W * 0.06); g.fill(); }
  },
  snowglobe(g, W, H, lw) {
    rrect(g, W * 0.12, H * 0.74, W * 0.76, H * 0.24, 4); paint(g, '#b5651d', lw);
    circ(g, W / 2, H * 0.42, W * 0.4); paint(g, 'rgba(180,225,255,0.9)', lw);
    poly(g, [W / 2, H * 0.2, W * 0.34, H * 0.6, W * 0.66, H * 0.6]); paint(g, '#2e9d5b', lw * 0.6);
    ell(g, W / 2, H * 0.68, W * 0.3, H * 0.06); g.fillStyle = '#fff'; g.fill();
    g.fillStyle = '#fff'; for (const [x, y] of [[0.3, 0.3], [0.65, 0.25], [0.7, 0.5], [0.4, 0.15]]) { circ(g, W * x, H * y, W * 0.025); g.fill(); }
    shine(g, W * 0.36, H * 0.24, W * 0.1, H * 0.05, 0.7);
    g.fillStyle = '#ffd84f'; g.font = `${H * 0.14}px sans-serif`; circ(g, W / 2, H * 0.86, W * 0.05); g.fill();
  },
  cardinal(g, W, H, lw, f) {
    ell(g, W * 0.48, H * 0.55, W * 0.36, H * 0.32); paint(g, '#e23b3b', lw);
    poly(g, [W * 0.16, H * 0.55, W * 0.0, H * 0.75, W * 0.18, H * 0.72]); paint(g, '#c22f2f', lw);
    poly(g, [W * 0.55, H * 0.28, W * 0.62, H * 0.04, W * 0.72, H * 0.3]); paint(g, '#e23b3b', lw);
    circ(g, W * 0.66, H * 0.4, W * 0.18); paint(g, '#e23b3b', lw);
    ell(g, W * 0.74, H * 0.44, W * 0.1, H * 0.09); g.fillStyle = '#2b2233'; g.fill();
    poly(g, [W * 0.82, H * 0.4, W * 0.98, H * 0.46, W * 0.82, H * 0.52]); paint(g, '#ffa53b', lw * 0.6);
    circ(g, W * 0.7, H * 0.36, W * 0.035); g.fillStyle = '#fff'; g.fill();
    ell(g, W * 0.42, H * (f ? 0.42 : 0.58), W * 0.2, H * 0.12, f ? -0.7 : 0.2); paint(g, '#b82828', lw);
    g.strokeStyle = '#ffa53b'; g.lineWidth = lw; g.beginPath(); g.moveTo(W * 0.42, H * 0.86); g.lineTo(W * 0.4, H); g.moveTo(W * 0.54, H * 0.86); g.lineTo(W * 0.56, H); g.stroke();
  },
  carrot(g, W, H, lw) {
    for (const a of [-0.4, 0, 0.4]) { ell(g, W / 2 + a * W * 0.4, H * 0.12, W * 0.12, H * 0.13, a); paint(g, '#46b04a', lw * 0.7); }
    poly(g, [W * 0.12, H * 0.2, W * 0.88, H * 0.2, W * 0.52, H * 0.99]); paint(g, '#ff8a2a', lw);
    g.strokeStyle = '#d96a12'; g.lineWidth = lw * 0.8;
    for (const y of [0.38, 0.55, 0.72]) { g.beginPath(); g.moveTo(W * 0.3, H * y); g.lineTo(W * 0.55, H * y); g.stroke(); }
  },
  bunny(g, W, H, lw, f) {
    for (const [x, r] of [[0.36, -0.15], [0.6, 0.15]]) { ell(g, W * x, H * 0.2, W * 0.1, H * 0.2, r); paint(g, '#fff', lw); ell(g, W * x, H * 0.22, W * 0.05, H * 0.14, r); g.fillStyle = '#ffb3c6'; g.fill(); }
    ell(g, W / 2, H * 0.72, W * 0.38, H * 0.28); paint(g, '#fff', lw);
    circ(g, W / 2, H * 0.46, W * 0.26); paint(g, '#fff', lw);
    eyes(g, W / 2, H * 0.44, W * 0.04, W * 0.1); cheeks(g, W / 2, H * 0.52, W * 0.15, W * 0.05);
    circ(g, W / 2, H * 0.5, W * 0.03); g.fillStyle = '#ff7a9c'; g.fill();
    ell(g, W * (f ? 0.86 : 0.8), H * (f ? 0.42 : 0.62), W * 0.09, H * 0.08); paint(g, '#fff', lw);
  },
  lantern(g, W, H, lw) {
    g.beginPath(); g.arc(W / 2, H * 0.12, W * 0.18, Math.PI, 0); g.lineWidth = lw * 1.4; g.strokeStyle = INK; g.stroke();
    poly(g, [W * 0.2, H * 0.24, W * 0.8, H * 0.24, W * 0.66, H * 0.14, W * 0.34, H * 0.14]); paint(g, '#3d4a63', lw);
    rrect(g, W * 0.22, H * 0.24, W * 0.56, H * 0.62, 4); paint(g, '#ffd36b', lw);
    ell(g, W / 2, H * 0.55, W * 0.16, H * 0.18); g.fillStyle = '#fff3c4'; g.fill();
    g.strokeStyle = '#3d4a63'; g.lineWidth = lw; g.beginPath(); g.moveTo(W / 2, H * 0.24); g.lineTo(W / 2, H * 0.86); g.stroke();
    rrect(g, W * 0.16, H * 0.86, W * 0.68, H * 0.12, 3); paint(g, '#3d4a63', lw);
  },
  candycane(g, W, H, lw) {
    const path = () => { g.beginPath(); g.moveTo(W * 0.7, H * 0.98); g.lineTo(W * 0.7, H * 0.3); g.arc(W * 0.45, H * 0.3, W * 0.25, 0, Math.PI, true); g.lineTo(W * 0.2, H * 0.42); };
    g.lineCap = 'round';
    path(); g.lineWidth = W * 0.3 + lw * 2; g.strokeStyle = INK; g.stroke();
    path(); g.lineWidth = W * 0.3; g.strokeStyle = '#fff'; g.stroke();
    path(); g.setLineDash([W * 0.16, W * 0.16]); g.strokeStyle = '#e8364a'; g.stroke(); g.setLineDash([]);
  },
  penguin(g, W, H, lw, f) {
    ell(g, W / 2, H * 0.56, W * 0.42, H * 0.42); paint(g, '#26304a', lw);
    ell(g, W / 2, H * 0.62, W * 0.28, H * 0.32); g.fillStyle = '#fff'; g.fill();
    ell(g, W / 2, H * 0.36, W * 0.3, H * 0.2); g.fillStyle = '#fff'; g.fill();
    eyes(g, W / 2, H * 0.32, W * 0.05, W * 0.12); cheeks(g, W / 2, H * 0.42, W * 0.2, W * 0.06);
    poly(g, [W * 0.4, H * 0.4, W * 0.6, H * 0.4, W / 2, H * 0.5]); paint(g, '#ffa53b', lw * 0.6);
    rrect(g, W * 0.2, H * 0.47, W * 0.6, H * 0.08, 4); paint(g, '#e8364a', lw * 0.6);
    ell(g, W * 0.12, H * 0.62, W * 0.1, H * 0.22, 0.3); paint(g, '#26304a', lw);
    if (f) { ell(g, W * 0.92, H * 0.3, W * 0.09, H * 0.22, 0.6); } else { ell(g, W * 0.88, H * 0.62, W * 0.1, H * 0.22, -0.3); }
    paint(g, '#26304a', lw);
    for (const x of [0.36, 0.64]) { ell(g, W * x, H * 0.97, W * 0.13, H * 0.04); paint(g, '#ffa53b', lw * 0.6); }
  },
  sapling(g, W, H, lw) {
    rrect(g, W * 0.43, H * 0.8, W * 0.14, H * 0.2, 2); paint(g, '#7a4a2a', lw);
    for (let i = 0; i < 3; i++) {
      const y = H * (0.04 + i * 0.24), w = W * (0.28 + i * 0.11);
      poly(g, [W / 2, y, W / 2 + w, y + H * 0.36, W / 2 - w, y + H * 0.36]); paint(g, '#2e9d5b', lw);
      snowCap(g, [W / 2, y + H * 0.02, W / 2 + w * 0.45, y + H * 0.16, W / 2 - w * 0.45, y + H * 0.16]);
    }
  },
  husky(g, W, H, lw, f) {
    g.beginPath(); g.moveTo(W * 0.14, H * 0.5); g.quadraticCurveTo(W * (f ? -0.02 : 0.02), H * (f ? 0.12 : 0.25), W * 0.14, H * 0.2); g.lineWidth = W * 0.07; g.strokeStyle = '#8a95a8'; g.lineCap = 'round'; g.stroke();
    ell(g, W * 0.44, H * 0.6, W * 0.32, H * 0.22); paint(g, '#8a95a8', lw);
    ell(g, W * 0.48, H * 0.68, W * 0.2, H * 0.12); g.fillStyle = '#f2f4f8'; g.fill();
    for (const x of [0.22, 0.34, 0.56, 0.66]) { rrect(g, W * x, H * 0.7, W * 0.08, H * 0.28, 4); paint(g, '#8a95a8', lw * 0.8); }
    circ(g, W * 0.76, H * 0.36, W * 0.17); paint(g, '#8a95a8', lw);
    poly(g, [W * 0.64, H * 0.26, W * 0.68, H * 0.02, W * 0.76, H * 0.22]); paint(g, '#8a95a8', lw);
    poly(g, [W * 0.8, H * 0.22, W * 0.88, H * 0.02, W * 0.9, H * 0.28]); paint(g, '#8a95a8', lw);
    ell(g, W * 0.82, H * 0.44, W * 0.13, H * 0.1); g.fillStyle = '#f2f4f8'; g.fill();
    eyes(g, W * 0.76, H * 0.34, W * 0.025, W * 0.05);
    circ(g, W * 0.93, H * 0.42, W * 0.035); g.fillStyle = INK; g.fill();
  },
  snowman(g, W, H, lw, f) {
    g.strokeStyle = '#7a4a2a'; g.lineWidth = lw * 1.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W * 0.3, H * 0.5); g.lineTo(W * 0.02, H * 0.4); g.moveTo(W * 0.7, H * 0.5); g.lineTo(W * 0.98, f ? H * 0.22 : H * 0.42); g.stroke();
    circ(g, W / 2, H * 0.76, W * 0.36); paint(g, '#fbfdff', lw);
    circ(g, W / 2, H * 0.47, W * 0.27); paint(g, '#fbfdff', lw);
    circ(g, W / 2, H * 0.24, W * 0.2); paint(g, '#fbfdff', lw);
    rrect(g, W * 0.3, H * 0.02, W * 0.4, H * 0.12, 2); paint(g, '#26304a', lw);
    rrect(g, W * 0.22, H * 0.11, W * 0.56, H * 0.04, 2); paint(g, '#26304a', lw);
    eyes(g, W / 2, H * 0.22, W * 0.035, W * 0.08);
    poly(g, [W / 2, H * 0.26, W * 0.72, H * 0.29, W / 2, H * 0.31]); paint(g, '#ff8a2a', lw * 0.5);
    rrect(g, W * 0.26, H * 0.34, W * 0.48, H * 0.06, 3); paint(g, '#e8364a', lw * 0.6);
    g.fillStyle = INK; for (const y of [0.46, 0.56, 0.7]) { circ(g, W / 2, H * y, W * 0.03); g.fill(); }
  },
  sled(g, W, H, lw) {
    g.strokeStyle = INK; g.lineWidth = lw * 2.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W * 0.06, H * 0.9); g.lineTo(W * 0.86, H * 0.9); g.quadraticCurveTo(W * 0.99, H * 0.88, W * 0.96, H * 0.6); g.stroke();
    g.strokeStyle = '#c9ced8'; g.lineWidth = lw; g.stroke();
    for (const x of [0.2, 0.7]) { g.beginPath(); g.moveTo(W * x, H * 0.9); g.lineTo(W * x, H * 0.55); g.lineWidth = lw * 1.2; g.strokeStyle = INK; g.stroke(); }
    rrect(g, W * 0.04, H * 0.3, W * 0.84, H * 0.28, 6); paint(g, '#e8364a', lw);
    g.fillStyle = '#ffd84f'; rrect(g, W * 0.1, H * 0.38, W * 0.7, H * 0.06, 3); g.fill();
  },
  mailbox(g, W, H, lw) {
    rrect(g, W * 0.42, H * 0.4, W * 0.16, H * 0.6, 2); paint(g, '#7a4a2a', lw);
    g.beginPath(); g.moveTo(W * 0.08, H * 0.42); g.lineTo(W * 0.08, H * 0.2); g.arc(W / 2, H * 0.2, W * 0.42, Math.PI, 0); g.lineTo(W * 0.92, H * 0.42); g.closePath(); paint(g, '#4b7bd6', lw);
    snowCap(g, [W * 0.2, H * 0.0, W * 0.8, H * 0.0, W * 0.88, H * 0.06, W * 0.12, H * 0.06]);
    rrect(g, W * 0.86, H * 0.12, W * 0.08, H * 0.16, 1); paint(g, '#e8364a', lw * 0.6);
    rrect(g, W * 0.3, H * 0.22, W * 0.4, H * 0.06, 2); g.fillStyle = '#fff'; g.fill();
  },
  skis(g, W, H, lw) {
    for (const [x, c, r] of [[0.32, '#3b82f6', -0.16], [0.68, '#ff8a2a', 0.16]]) {
      g.save(); g.translate(W * x, H * 0.55); g.rotate(r);
      rrect(g, -W * 0.1, -H * 0.48, W * 0.2, H * 0.94, W * 0.1); paint(g, c, lw);
      rrect(g, -W * 0.1, -H * 0.04, W * 0.2, H * 0.1, 2); g.fillStyle = INK; g.fill();
      g.restore();
    }
    g.strokeStyle = '#9aa3b5'; g.lineWidth = lw; g.beginPath(); g.moveTo(W * 0.08, H * 0.1); g.lineTo(W * 0.5, H * 0.98); g.moveTo(W * 0.92, H * 0.1); g.lineTo(W * 0.5, H * 0.98); g.stroke();
  },
  reindeer(g, W, H, lw, f) {
    g.strokeStyle = '#7a4a2a'; g.lineWidth = lw * 1.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W * 0.72, H * 0.18); g.lineTo(W * 0.66, H * 0.02); g.moveTo(W * 0.69, H * 0.1); g.lineTo(W * 0.6, H * 0.06);
    g.moveTo(W * 0.82, H * 0.18); g.lineTo(W * 0.9, H * 0.0); g.moveTo(W * 0.86, H * 0.1); g.lineTo(W * 0.96, H * 0.06); g.stroke();
    for (const [x, up] of [[0.2, 0], [0.32, 0], [0.56, f], [0.66, 0]]) { rrect(g, W * x, H * (up ? 0.6 : 0.64), W * 0.07, H * (up ? 0.26 : 0.36), 3); paint(g, '#a0663a', lw * 0.8); }
    ell(g, W * 0.44, H * 0.58, W * 0.32, H * 0.16); paint(g, '#a0663a', lw);
    ell(g, W * 0.48, H * 0.64, W * 0.18, H * 0.06); g.fillStyle = '#e6c8a0'; g.fill();
    rrect(g, W * 0.66, H * 0.26, W * 0.12, H * 0.32, 5); paint(g, '#a0663a', lw);
    ell(g, W * 0.8, H * 0.26, W * 0.13, H * 0.1, 0.2); paint(g, '#a0663a', lw);
    eyes(g, W * 0.78, H * 0.22, W * 0.02, W * 0.04);
    circ(g, W * 0.93, H * 0.29, W * 0.045); paint(g, '#ff3b3b', lw * 0.6);
  },
  conecart(g, W, H, lw) {
    g.strokeStyle = INK; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(W / 2, H * 0.2); g.lineTo(W / 2, H * 0.5); g.stroke();
    g.beginPath(); g.moveTo(W * 0.06, H * 0.24); g.quadraticCurveTo(W / 2, -H * 0.12, W * 0.94, H * 0.24); g.closePath(); paint(g, '#ff6f91', lw);
    g.fillStyle = '#fff'; for (const x of [0.28, 0.5, 0.72]) { poly(g, [W * x - W * 0.06, H * 0.24, W * x + W * 0.06, H * 0.24, W * x, H * 0.06]); g.fill(); }
    rrect(g, W * 0.1, H * 0.48, W * 0.8, H * 0.32, 6); paint(g, '#5ec8f2', lw);
    for (const [x, c] of [[0.3, '#ff6f91'], [0.5, '#ffd84f'], [0.7, '#8bd96a']]) { circ(g, W * x, H * 0.44, W * 0.07); paint(g, c, lw * 0.6); poly(g, [W * x - W * 0.05, H * 0.47, W * x + W * 0.05, H * 0.47, W * x, H * 0.6]); paint(g, '#e8b26a', lw * 0.5); }
    for (const x of [0.26, 0.74]) { circ(g, W * x, H * 0.86, H * 0.11); paint(g, '#3d4a63', lw); }
  },
  snowmobile(g, W, H, lw) {
    g.strokeStyle = INK; g.lineWidth = lw * 1.8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W * 0.5, H * 0.92); g.lineTo(W * 0.92, H * 0.92); g.quadraticCurveTo(W, H * 0.9, W * 0.98, H * 0.78); g.stroke();
    rrect(g, W * 0.04, H * 0.66, W * 0.5, H * 0.3, 10); paint(g, '#3d4a63', lw);
    g.beginPath(); g.moveTo(W * 0.06, H * 0.66); g.lineTo(W * 0.7, H * 0.5); g.quadraticCurveTo(W * 0.96, H * 0.5, W * 0.96, H * 0.74); g.lineTo(W * 0.06, H * 0.78); g.closePath(); paint(g, '#ffc531', lw);
    poly(g, [W * 0.56, H * 0.52, W * 0.66, H * 0.22, W * 0.74, H * 0.24, W * 0.7, H * 0.5]); paint(g, 'rgba(170,220,255,0.85)', lw);
    rrect(g, W * 0.14, H * 0.5, W * 0.36, H * 0.12, 5); paint(g, '#26304a', lw);
  },
  igloo(g, W, H, lw) {
    g.beginPath(); g.moveTo(W * 0.04, H); g.quadraticCurveTo(W * 0.04, H * 0.04, W / 2, H * 0.04); g.quadraticCurveTo(W * 0.96, H * 0.04, W * 0.96, H); g.closePath(); paint(g, '#e8f4ff', lw);
    g.strokeStyle = '#a9c8e6'; g.lineWidth = lw * 0.8;
    for (const y of [0.3, 0.52, 0.74]) { g.beginPath(); g.moveTo(W * 0.08, H * y); g.quadraticCurveTo(W / 2, H * (y - 0.08), W * 0.92, H * y); g.stroke(); }
    for (const [y, xs] of [[0.18, [0.4, 0.6]], [0.41, [0.25, 0.5, 0.75]], [0.63, [0.16, 0.38, 0.62, 0.84]], [0.87, [0.28, 0.72]]]) for (const x of xs) { g.beginPath(); g.moveTo(W * x, H * (y - 0.1)); g.lineTo(W * x, H * (y + 0.1)); g.stroke(); }
    g.beginPath(); g.moveTo(W * 0.38, H); g.lineTo(W * 0.38, H * 0.72); g.arc(W / 2, H * 0.72, W * 0.12, Math.PI, 0); g.lineTo(W * 0.62, H); g.closePath(); paint(g, '#5d7896', lw);
    shine(g, W * 0.3, H * 0.22, W * 0.1, H * 0.05);
  },
  pinetree(g, W, H, lw) {
    rrect(g, W * 0.42, H * 0.86, W * 0.16, H * 0.14, 2); paint(g, '#7a4a2a', lw);
    for (let i = 0; i < 4; i++) {
      const y = H * (0.0 + i * 0.2), w = W * (0.24 + i * 0.09);
      poly(g, [W / 2, y, W / 2 + w, y + H * 0.3, W / 2 - w, y + H * 0.3]); paint(g, i % 2 ? '#2b8f55' : '#2e9d5b', lw);
      snowCap(g, [W / 2, y + H * 0.01, W / 2 + w * 0.5, y + H * 0.14, W / 2 + w * 0.2, y + H * 0.12, W / 2 - w * 0.1, y + H * 0.15, W / 2 - w * 0.5, y + H * 0.13]);
    }
  },
  polarbear(g, W, H, lw, f) {
    ell(g, W * 0.46, H * 0.62, W * 0.36, H * 0.3); paint(g, '#f6f3ea', lw);
    for (const x of [0.18, 0.34, 0.58]) { rrect(g, W * x, H * 0.72, W * 0.12, H * 0.28, 6); paint(g, '#f6f3ea', lw * 0.8); }
    if (f) { ell(g, W * 0.86, H * 0.28, W * 0.07, H * 0.16, 0.5); } else { rrect(g, W * 0.72, H * 0.72, W * 0.12, H * 0.28, 6); }
    paint(g, '#f6f3ea', lw * 0.8);
    circ(g, W * 0.76, H * 0.4, W * 0.18); paint(g, '#f6f3ea', lw);
    for (const x of [0.66, 0.84]) { circ(g, W * x, H * 0.24, W * 0.05); paint(g, '#f6f3ea', lw * 0.8); }
    eyes(g, W * 0.76, H * 0.38, W * 0.022, W * 0.06); cheeks(g, W * 0.76, H * 0.46, W * 0.1, W * 0.03);
    ell(g, W * 0.76, H * 0.47, W * 0.04, H * 0.025); g.fillStyle = INK; g.fill();
  },
  yeti(g, W, H, lw, f) {
    ell(g, W / 2, H * 0.58, W * 0.42, H * 0.4); paint(g, '#eef3ff', lw);
    for (const x of [0.32, 0.68]) { rrect(g, W * x - W * 0.12, H * 0.82, W * 0.24, H * 0.18, 8); paint(g, '#eef3ff', lw); }
    ell(g, W * 0.08, H * 0.6, W * 0.1, H * 0.24, 0.2); paint(g, '#eef3ff', lw);
    if (f) ell(g, W * 0.9, H * 0.2, W * 0.1, H * 0.22, 0.5); else ell(g, W * 0.92, H * 0.6, W * 0.1, H * 0.24, -0.2);
    paint(g, '#eef3ff', lw);
    ell(g, W / 2, H * 0.32, W * 0.24, H * 0.15); paint(g, '#7fb5ff', lw * 0.8);
    eyes(g, W / 2, H * 0.3, W * 0.035, W * 0.09);
    smile(g, W / 2, H * 0.34, W * 0.08, lw); cheeks(g, W / 2, H * 0.37, W * 0.16, W * 0.04);
    g.fillStyle = '#d9e4ff'; for (const [x, y] of [[0.3, 0.6], [0.6, 0.7], [0.45, 0.5]]) { ell(g, W * x, H * y, W * 0.05, H * 0.02); g.fill(); }
  },
  gondola(g, W, H, lw) {
    g.strokeStyle = INK; g.lineWidth = lw * 1.5; g.beginPath(); g.moveTo(0, H * 0.04); g.lineTo(W, H * 0.04); g.moveTo(W / 2, H * 0.04); g.lineTo(W / 2, H * 0.24); g.stroke();
    rrect(g, W * 0.1, H * 0.24, W * 0.8, H * 0.74, W * 0.12); paint(g, '#e8364a', lw);
    for (const x of [0.18, 0.52]) { rrect(g, W * x, H * 0.34, W * 0.3, H * 0.28, 5); paint(g, '#bfe6ff', lw * 0.8); }
    rrect(g, W * 0.1, H * 0.7, W * 0.8, H * 0.06, 2); g.fillStyle = '#ffd84f'; g.fill();
    snowCap(g, [W * 0.18, H * 0.25, W * 0.82, H * 0.25, W * 0.78, H * 0.3, W * 0.22, H * 0.3]);
  },
  cabin(g, W, H, lw) {
    rrect(g, W * 0.64, H * 0.06, W * 0.12, H * 0.3, 2); paint(g, '#9a5b52', lw);
    g.fillStyle = 'rgba(230,236,245,0.7)'; circ(g, W * 0.72, H * 0.02, W * 0.05); g.fill();
    rrect(g, W * 0.1, H * 0.44, W * 0.8, H * 0.56, 4); paint(g, '#a0663a', lw);
    g.strokeStyle = '#7a4a2a'; g.lineWidth = lw * 0.8; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(W * 0.1, H * (0.44 + i * 0.09)); g.lineTo(W * 0.9, H * (0.44 + i * 0.09)); g.stroke(); }
    poly(g, [W * 0.02, H * 0.48, W / 2, H * 0.12, W * 0.98, H * 0.48]); paint(g, '#5e3b2a', lw);
    snowCap(g, [W * 0.0, H * 0.48, W / 2, H * 0.1, W, H * 0.48, W * 0.86, H * 0.44, W * 0.7, H * 0.36, W * 0.5, H * 0.24, W * 0.3, H * 0.38, W * 0.12, H * 0.44]);
    rrect(g, W * 0.18, H * 0.58, W * 0.2, H * 0.18, 3); paint(g, '#ffd36b', lw);
    rrect(g, W * 0.56, H * 0.62, W * 0.2, H * 0.38, 3); paint(g, '#5e3b2a', lw);
  },
  giantsnowman(g, W, H, lw, f) {
    PAINT.snowman(g, W, H, lw, f);
    rrect(g, W * 0.6, H * 0.35, W * 0.1, H * 0.2, 3); paint(g, '#e8364a', lw * 0.6);
    cheeks(g, W / 2, H * 0.27, W * 0.12, W * 0.035);
  },
  balloon(g, W, H, lw) {
    g.strokeStyle = INK; g.lineWidth = lw; g.beginPath(); g.moveTo(W * 0.3, H * 0.62); g.lineTo(W * 0.38, H * 0.82); g.moveTo(W * 0.7, H * 0.62); g.lineTo(W * 0.62, H * 0.82); g.stroke();
    g.save(); g.beginPath(); g.moveTo(W / 2, H * 0.7); g.bezierCurveTo(W * 0.02, H * 0.45, W * 0.0, H * 0.0, W / 2, H * 0.0); g.bezierCurveTo(W, H * 0.0, W * 0.98, H * 0.45, W / 2, H * 0.7); g.closePath();
    paint(g, '#ff6f91', lw); g.clip();
    const cols = ['#ffd84f', '#5ec8f2', '#ffd84f', '#5ec8f2'];
    for (let i = 0; i < 4; i++) { ell(g, W / 2, H * 0.34, W * (0.38 - i * 0.1), H * 0.4); g.lineWidth = W * 0.05; g.strokeStyle = cols[i]; g.stroke(); }
    g.restore();
    g.beginPath(); g.moveTo(W / 2, H * 0.7); g.bezierCurveTo(W * 0.02, H * 0.45, W * 0.0, H * 0.0, W / 2, H * 0.0); g.bezierCurveTo(W, H * 0.0, W * 0.98, H * 0.45, W / 2, H * 0.7); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
    rrect(g, W * 0.34, H * 0.82, W * 0.32, H * 0.18, 4); paint(g, '#b5651d', lw);
    shine(g, W * 0.3, H * 0.18, W * 0.08, H * 0.06);
  },
  lodge(g, W, H, lw) {
    rrect(g, W * 0.06, H * 0.5, W * 0.88, H * 0.5, 4); paint(g, '#b5764a', lw);
    poly(g, [W * 0.0, H * 0.54, W * 0.3, H * 0.1, W * 0.7, H * 0.1, W, H * 0.54]); paint(g, '#5e3b2a', lw);
    snowCap(g, [W * 0.0, H * 0.54, W * 0.3, H * 0.08, W * 0.7, H * 0.08, W, H * 0.54, W * 0.85, H * 0.46, W * 0.6, H * 0.3, W * 0.4, H * 0.32, W * 0.15, H * 0.46]);
    poly(g, [W * 0.38, H * 0.5, W / 2, H * 0.26, W * 0.62, H * 0.5]); paint(g, '#ffd36b', lw);
    for (const x of [0.12, 0.26, 0.66, 0.8]) { rrect(g, W * x, H * 0.62, W * 0.1, H * 0.14, 2); paint(g, '#ffd36b', lw * 0.8); }
    rrect(g, W * 0.43, H * 0.66, W * 0.14, H * 0.34, 3); paint(g, '#5e3b2a', lw);
    circ(g, W / 2, H * 0.2, W * 0.025); paint(g, '#ffd84f', lw * 0.5);
  },
  clocktower(g, W, H, lw) {
    rrect(g, W * 0.14, H * 0.3, W * 0.72, H * 0.7, 3); paint(g, '#d8c3a0', lw);
    poly(g, [W * 0.06, H * 0.32, W / 2, H * 0.0, W * 0.94, H * 0.32]); paint(g, '#4b7bd6', lw);
    snowCap(g, [W * 0.3, H * 0.15, W / 2, H * 0.0, W * 0.7, H * 0.15, W / 2, H * 0.1]);
    circ(g, W / 2, H * 0.42, W * 0.26); paint(g, '#fffaf0', lw);
    g.strokeStyle = INK; g.lineWidth = lw; g.beginPath(); g.moveTo(W / 2, H * 0.42); g.lineTo(W / 2, H * 0.34); g.moveTo(W / 2, H * 0.42); g.lineTo(W * 0.62, H * 0.44); g.stroke();
    for (const y of [0.62, 0.78]) { rrect(g, W * 0.38, H * y, W * 0.24, H * 0.1, 3); paint(g, '#ffd36b', lw * 0.7); }
  },
  icecastle(g, W, H, lw) {
    const blue = '#bfe6ff';
    for (const [x, w, top] of [[0.04, 0.18, 0.2], [0.78, 0.18, 0.2], [0.36, 0.28, 0.0]]) {
      rrect(g, W * x, H * (top + 0.12), W * w, H * (0.88 - top), 3); paint(g, blue, lw);
      poly(g, [W * (x - 0.02), H * (top + 0.14), W * (x + w / 2), H * top - H * 0.02, W * (x + w + 0.02), H * (top + 0.14)]); paint(g, '#8fb8ff', lw);
      g.strokeStyle = INK; g.lineWidth = lw * 0.7; g.beginPath(); g.moveTo(W * (x + w / 2), H * top); g.lineTo(W * (x + w / 2), H * (top - 0.08)); g.stroke();
      poly(g, [W * (x + w / 2), H * (top - 0.08), W * (x + w / 2 + 0.06), H * (top - 0.06), W * (x + w / 2), H * (top - 0.04)]); paint(g, '#ff6f91', 0);
    }
    rrect(g, W * 0.16, H * 0.46, W * 0.68, H * 0.54, 3); paint(g, '#d6f0ff', lw);
    g.beginPath(); g.moveTo(W * 0.42, H); g.lineTo(W * 0.42, H * 0.76); g.arc(W / 2, H * 0.76, W * 0.08, Math.PI, 0); g.lineTo(W * 0.58, H); g.closePath(); paint(g, '#6c8fd6', lw);
    for (const x of [0.24, 0.68]) { rrect(g, W * x, H * 0.58, W * 0.08, H * 0.12, 3); paint(g, '#ffd36b', lw * 0.6); }
    shine(g, W * 0.44, H * 0.2, W * 0.03, H * 0.06, 0.8);
  },
};

const cache = new Map();

// Sprite for a thing (and wave frame). Returns { img, w, h } where w/h are
// the canvas size in pixels for a thing of height `h` px.
export function itemSprite(id, frame = 0) {
  const key = frame ? `${id}#1` : id;
  let s = cache.get(key);
  if (s) return s;
  const def = ITEM_BY_ID[id];
  const H = def.size >= 200 ? 256 : 160;
  const W = Math.round(H * def.w);
  const pad = Math.round(H * 0.06);
  const c = canvas(W + pad * 2, H + pad * 2);
  const g = c.getContext('2d');
  g.translate(pad, pad);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  (PAINT[id] || PAINT.pinecone)(g, W, H, Math.max(2, H * 0.028), frame);
  s = { img: c, pad: pad / H, w: (W + pad * 2) / H, h: (H + pad * 2) / H };
  cache.set(key, s);
  return s;
}

// Dark silhouette version for the museum.
const silCache = new Map();
export function itemSilhouette(id) {
  let c = silCache.get(id);
  if (c) return c;
  const s = itemSprite(id);
  c = canvas(s.img.width, s.img.height);
  const g = c.getContext('2d');
  g.drawImage(s.img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#5a6a8e';
  g.fillRect(0, 0, c.width, c.height);
  silCache.set(id, c);
  return c;
}

// Bake sprites a few at a time (from an idle callback or the title screen)
// so no single frame stalls. Returns true when everything is ready.
let warmIndex = 0;
export function warmSprites(budgetMs = 6) {
  const t0 = performance.now();
  while (warmIndex < ITEMS.length * 2 && performance.now() - t0 < budgetMs) {
    const it = ITEMS[warmIndex >> 1];
    const f = warmIndex & 1;
    if (!f || it.waves) itemSprite(it.id, f);
    warmIndex++;
  }
  return warmIndex >= ITEMS.length * 2;
}

// ------------------------------------------------------------ ball skins

const SKIN_SIZE = 256;
const skinCache = new Map();

export function skinTexture(id) {
  let c = skinCache.get(id);
  if (c) return c;
  const S = SKIN_SIZE, R = S / 2;
  c = canvas(S, S);
  const g = c.getContext('2d');
  const rnd = mulberry32(id.length * 977 + id.charCodeAt(0));
  g.save();
  circ(g, R, R, R); g.clip();
  if (id === 'beach') {
    const cols = ['#ff4f5e', '#ffffff', '#ffc531', '#ffffff', '#3b82f6', '#ffffff'];
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(R, R); g.arc(R, R, R, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2); g.closePath(); g.fillStyle = cols[i]; g.fill(); }
    circ(g, R, R, R * 0.14); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#e6e6e6'; g.stroke();
  } else if (id === 'cookie') {
    g.fillStyle = '#e2b47a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) { ell(g, rnd() * S, rnd() * S, 6 + rnd() * 14, 5 + rnd() * 10, rnd() * 3); g.fillStyle = rnd() < 0.5 ? '#d39f62' : '#ecc48e'; g.fill(); }
    for (let i = 0; i < 22; i++) { const x = rnd() * S, y = rnd() * S, r = 7 + rnd() * 8; poly(g, [x, y - r, x + r, y + r * 0.6, x - r, y + r * 0.7]); g.fillStyle = '#5a3420'; g.fill(); }
  } else if (id === 'melon') {
    g.fillStyle = '#2f8f3a'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#8fdc6a'; g.lineWidth = 14;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(R + i * 40, -10); g.bezierCurveTo(R + i * 40 + 30, R * 0.6, R + i * 40 - 30, R * 1.4, R + i * 40, S + 10); g.stroke(); }
    g.fillStyle = '#1e6b28'; for (let i = 0; i < 30; i++) { circ(g, rnd() * S, rnd() * S, 2 + rnd() * 3); g.fill(); }
  } else if (id === 'disco') {
    g.fillStyle = '#9aa3b5'; g.fillRect(0, 0, S, S);
    const t = 18;
    for (let y = 0; y < S; y += t) for (let x = 0; x < S; x += t) {
      const v = 150 + Math.floor(rnd() * 105);
      const tint = rnd();
      g.fillStyle = tint < 0.08 ? '#ff9de2' : tint < 0.16 ? '#9de8ff' : `rgb(${v},${v},${Math.min(255, v + 15)})`;
      g.fillRect(x + 1, y + 1, t - 2, t - 2);
    }
  } else if (id === 'starlight') {
    const gr = g.createRadialGradient(R * 0.7, R * 0.6, 10, R, R, R);
    gr.addColorStop(0, '#6b4bd6'); gr.addColorStop(1, '#1b1650');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(160,230,255,0.4)'; g.lineWidth = 10; g.beginPath(); g.arc(R, R, R * 0.6, 0.3, 4); g.stroke();
    for (let i = 0; i < 60; i++) { circ(g, rnd() * S, rnd() * S, rnd() < 0.15 ? 3 : 1.4); g.fillStyle = rnd() < 0.2 ? '#ffe9a0' : '#fff'; g.fill(); }
  } else {
    g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) { ell(g, rnd() * S, rnd() * S, 8 + rnd() * 18, 6 + rnd() * 12, rnd() * 3); g.fillStyle = rnd() < 0.5 ? 'rgba(200,220,245,0.55)' : 'rgba(255,255,255,0.9)'; g.fill(); }
    for (let i = 0; i < 26; i++) { circ(g, rnd() * S, rnd() * S, 1.5 + rnd() * 2); g.fillStyle = 'rgba(150,185,230,0.6)'; g.fill(); }
  }
  g.restore();
  skinCache.set(id, c);
  return c;
}

// Fixed light and shadow drawn over the rolling texture.
let shadeCanvas = null;
export function ballShade() {
  if (shadeCanvas) return shadeCanvas;
  const S = SKIN_SIZE, R = S / 2;
  shadeCanvas = canvas(S + 8, S + 8);
  const g = shadeCanvas.getContext('2d');
  g.translate(4, 4);
  let gr = g.createRadialGradient(R * 0.62, R * 0.55, R * 0.1, R, R, R);
  gr.addColorStop(0, 'rgba(255,255,255,0.45)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0)');
  gr.addColorStop(0.85, 'rgba(60,80,140,0.18)');
  gr.addColorStop(1, 'rgba(40,50,110,0.42)');
  circ(g, R, R, R); g.fillStyle = gr; g.fill();
  g.lineWidth = 4; g.strokeStyle = 'rgba(58,45,77,0.55)'; g.stroke();
  ell(g, R * 0.62, R * 0.45, R * 0.22, R * 0.12, -0.6); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
  gr = null;
  return shadeCanvas;
}

// ------------------------------------------------------------ hats

const hatCache = new Map();
// Hats are drawn for a ball of radius 100 px, anchored at the ball's top
// (returned canvas: hat centred, anchor at `ay` px from the top).
export function hatSprite(id) {
  if (hatCache.has(id)) return hatCache.get(id);
  if (id === 'none') { hatCache.set(id, null); return null; }
  const c = canvas(260, 220);
  const g = c.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  const cx = 130, ay = 170, lw = 5;
  if (id === 'beanie') {
    g.beginPath(); g.moveTo(cx - 78, ay - 4); g.quadraticCurveTo(cx - 74, ay - 96, cx, ay - 98); g.quadraticCurveTo(cx + 74, ay - 96, cx + 78, ay - 4); g.closePath(); paint(g, '#e8364a', lw);
    g.strokeStyle = '#c42639'; g.lineWidth = 4; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * 22, ay - 20); g.lineTo(cx + i * 18, ay - 80); g.stroke(); }
    rrect(g, cx - 84, ay - 26, 168, 30, 14); paint(g, '#fff', lw);
    circ(g, cx, ay - 108, 22); paint(g, '#fff', lw);
  } else if (id === 'party') {
    poly(g, [cx - 52, ay - 2, cx + 52, ay - 2, cx + 6, ay - 150]); paint(g, '#5ec8f2', lw);
    g.save(); poly(g, [cx - 52, ay - 2, cx + 52, ay - 2, cx + 6, ay - 150]); g.clip();
    g.fillStyle = '#ffd84f'; for (let i = 0; i < 5; i++) { g.save(); g.translate(cx, ay - 20 - i * 30); g.rotate(-0.3); g.fillRect(-60, -6, 120, 12); g.restore(); }
    g.restore(); poly(g, [cx - 52, ay - 2, cx + 52, ay - 2, cx + 6, ay - 150]); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
    circ(g, cx + 6, ay - 156, 16); paint(g, '#ff6f91', lw);
  } else if (id === 'tophat') {
    ell(g, cx, ay - 6, 92, 16); paint(g, '#26304a', lw);
    rrect(g, cx - 56, ay - 130, 112, 124, 8); paint(g, '#26304a', lw);
    rrect(g, cx - 56, ay - 44, 112, 22, 2); paint(g, '#e8364a', 0);
    shine(g, cx - 30, ay - 100, 8, 24, 0.25);
  } else if (id === 'earmuffs') {
    g.beginPath(); g.arc(cx, ay + 40, 104, Math.PI * 1.08, Math.PI * 1.92); g.lineWidth = 18; g.strokeStyle = INK; g.stroke(); g.lineWidth = 11; g.strokeStyle = '#9a7bd6'; g.stroke();
    for (const dx of [-100, 100]) { circ(g, cx + dx, ay + 6, 34); paint(g, '#ff9dc4', lw); circ(g, cx + dx, ay + 6, 18); g.fillStyle = '#ffc7dc'; g.fill(); }
  } else if (id === 'propeller') {
    g.beginPath(); g.moveTo(cx - 84, ay); g.quadraticCurveTo(cx - 80, ay - 84, cx, ay - 86); g.quadraticCurveTo(cx + 80, ay - 84, cx + 84, ay); g.closePath(); paint(g, '#ffc531', lw);
    g.save(); g.beginPath(); g.moveTo(cx - 84, ay); g.quadraticCurveTo(cx - 80, ay - 84, cx, ay - 86); g.quadraticCurveTo(cx + 80, ay - 84, cx + 84, ay); g.closePath(); g.clip();
    g.fillStyle = '#e8364a'; g.fillRect(cx - 28, ay - 90, 56, 90); g.fillStyle = '#3b82f6'; g.fillRect(cx + 28, ay - 90, 60, 90); g.restore();
    g.beginPath(); g.moveTo(cx - 84, ay); g.quadraticCurveTo(cx - 80, ay - 84, cx, ay - 86); g.quadraticCurveTo(cx + 80, ay - 84, cx + 84, ay); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
    rrect(g, cx - 4, ay - 112, 8, 28, 3); paint(g, INK, 0);
  } else if (id === 'crown') {
    poly(g, [cx - 70, ay, cx + 70, ay, cx + 78, ay - 86, cx + 40, ay - 44, cx, ay - 104, cx - 40, ay - 44, cx - 78, ay - 86]); paint(g, '#ffd84f', lw);
    for (const [x, y, c] of [[-40, -22, '#e8364a'], [0, -26, '#3b82f6'], [40, -22, '#2fbf71']]) { circ(g, cx + x, ay + y, 10); paint(g, c, 3); }
    for (const [x, y] of [[-78, -86], [0, -104], [78, -86]]) { circ(g, cx + x, ay + y, 9); paint(g, '#fff6c4', 3); }
    shine(g, cx - 40, ay - 60, 6, 14, 0.4);
  }
  const out = { img: c, ax: cx, ay, unit: 100 };
  hatCache.set(id, out);
  return out;
}

// Propeller blades, drawn separately so they can spin.
export function propellerBlades(g, x, y, s, t) {
  const k = Math.cos(t * 18);
  g.save(); g.translate(x, y); g.scale(s, s);
  ell(g, 0, 0, 60 * Math.abs(k) + 6, 9); paint(g, '#5ec8f2', 3);
  circ(g, 0, 0, 7); paint(g, '#e8364a', 2);
  g.restore();
}

// ------------------------------------------------------------ Snow Cloud

let cloudCanvas = null;
export function cloudSprite() {
  if (cloudCanvas) return cloudCanvas;
  const W = 520, H = 720;
  cloudCanvas = canvas(W, H);
  const g = cloudCanvas.getContext('2d');
  const rnd = mulberry32(7);
  const puffs = [];
  for (let i = 0; i < 26; i++) {
    const y = H * (0.08 + rnd() * 0.88);
    const x = W * (0.12 + rnd() * 0.5) + (y / H) * W * 0.18;
    puffs.push([x, y, 70 + rnd() * 80]);
  }
  puffs.push([W * 0.62, H * 0.42, 150], [W * 0.68, H * 0.62, 140], [W * 0.5, H * 0.86, 150], [W * 0.56, H * 0.22, 120]);
  for (const [x, y, r] of puffs) { circ(g, x + 8, y + 10, r); g.fillStyle = 'rgba(120,150,210,0.5)'; g.fill(); }
  for (const [x, y, r] of puffs) { circ(g, x, y, r); g.fillStyle = '#eef4ff'; g.fill(); }
  for (const [x, y, r] of puffs) { circ(g, x - r * 0.25, y - r * 0.3, r * 0.55); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill(); }
  // Friendly face
  const fx = W * 0.68, fy = H * 0.45;
  for (const dx of [-42, 42]) { ell(g, fx + dx, fy, 16, 22); g.fillStyle = INK; g.fill(); circ(g, fx + dx - 5, fy - 8, 6); g.fillStyle = '#fff'; g.fill(); }
  g.beginPath(); g.arc(fx, fy + 30, 34, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = 9; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke();
  cheeks(g, fx, fy + 30, 66, 16);
  return cloudCanvas;
}

// ------------------------------------------------------------ backdrops

export const SKIES = {
  morning: { top: '#6fc3ff', mid: '#b9e6ff', bottom: '#fff1d6', far: '#a9c9ee', mid2: '#8cb2e0', near: '#6f97c9', trees: '#4f8fae', snowTop: '#ffffff', snowBody: '#e6f2ff', snowDeep: '#bcd6f2', track: 'rgba(120,150,200,0.45)' },
  sunset: { top: '#5b4bb5', mid: '#e98bb0', bottom: '#ffc58a', far: '#c690c4', mid2: '#a873ab', near: '#7f5a97', trees: '#5b4a85', snowTop: '#fff6f2', snowBody: '#f5e2ec', snowDeep: '#d6bcd6', track: 'rgba(150,110,160,0.45)' },
  night: { top: '#0b1236', mid: '#1f2a6b', bottom: '#46407e', far: '#33407c', mid2: '#2a3369', near: '#202857', trees: '#18204a', snowTop: '#e8f0ff', snowBody: '#b9c8ef', snowDeep: '#8494c8', track: 'rgba(70,90,160,0.5)' },
};

// A tileable mountain ridge strip (period = width).
export function ridgeStrip(color, cap, seed, w = 1024, h = 300, rough = 1) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  const waves = [[1, rnd() * 6.28, 0.32], [2, rnd() * 6.28, 0.16 * rough], [5, rnd() * 6.28, 0.07 * rough], [11, rnd() * 6.28, 0.03 * rough]];
  const yAt = (x) => {
    let y = 0;
    for (const [k, p, a] of waves) y += Math.sin((x / w) * Math.PI * 2 * k + p) * a;
    return h * (0.5 - y * 0.8);
  };
  g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) g.lineTo(x, yAt(x));
  g.lineTo(w, h); g.closePath(); g.fillStyle = color; g.fill();
  if (cap) {
    g.save(); g.clip();
    g.beginPath();
    for (let x = 0; x <= w; x += 4) g.lineTo(x, yAt(x) + 2);
    for (let x = w; x >= 0; x -= 4) g.lineTo(x, yAt(x) + h * (0.06 + 0.05 * Math.sin(x * 0.05)));
    g.closePath(); g.fillStyle = cap; g.fill();
    g.restore();
  }
  return c;
}

// A tileable strip of pine silhouettes.
export function treeStrip(color, seed, w = 1024, h = 260) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = color;
  g.fillRect(0, h * 0.82, w, h * 0.18);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * w, th = h * (0.35 + rnd() * 0.5), tw = th * 0.38;
    for (const ox of [0, -w, w]) {
      poly(g, [x + ox, h * 0.86 - th, x + ox + tw, h * 0.86, x + ox - tw, h * 0.86]);
      g.fill();
    }
  }
  return c;
}

// Night sky stars and aurora, baked once per screen size.
export function starfield(w, h, seed = 3) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  for (let i = 0; i < (w * h) / 5000; i++) {
    circ(g, rnd() * w, rnd() * h * 0.75, rnd() < 0.1 ? 1.8 : 1);
    g.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`; g.fill();
  }
  return c;
}

export function auroraStrip(w = 1024, h = 300) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  for (let band = 0; band < 3; band++) {
    const col = ['rgba(90,255,180,', 'rgba(120,200,255,', 'rgba(200,140,255,'][band];
    for (let x = 0; x < w; x += 3) {
      const y = h * (0.35 + 0.18 * Math.sin((x / w) * Math.PI * 2 * (band + 1) + band) + band * 0.08);
      const len = h * (0.25 + 0.15 * Math.sin((x / w) * Math.PI * 6 + band * 2));
      const gr = g.createLinearGradient(0, y - len, 0, y);
      gr.addColorStop(0, col + '0)'); gr.addColorStop(1, col + '0.22)');
      g.fillStyle = gr; g.fillRect(x, y - len, 3, len);
    }
  }
  return c;
}
