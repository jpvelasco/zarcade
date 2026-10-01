// Every picture in Potion Pals is drawn here with Canvas 2D paths: no image
// files, no fonts beyond the system stack. Ingredients get a glyph from their
// `shape`, pals get a body from their `body` plus features.
//
// Sprites are baked lazily into small offscreen canvases and cached, so the
// per-frame work is drawImage. Nothing here uses shadowBlur or filter.
import { ITEM, PAL } from './recipes.js';

export const INK = '#3a2a4a';

function ink(ctx, w) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function body(ctx, color, lw) {
  ctx.fillStyle = color;
  ctx.fill();
  if (lw > 0) { ink(ctx, lw); ctx.stroke(); }
}

function shine(ctx, x, y, rx, ry, a = 0.55) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.fill();
}

function star(ctx, x, y, r, points = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function blobPath(ctx, x, y, r, wob = 0.16, seedPhase = 0) {
  ctx.beginPath();
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + Math.sin(a * 3 + seedPhase) * wob);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.92;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
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

// --------------------------------------------------------------- ingredients

// Each shape draws inside a box of side `s`, centred, with a little padding.
const SHAPES = {
  berry(ctx, s, c1, c2, lw) {
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.58, s * 0.3, s * 0.3, 0, 0, 7); body(ctx, c1, lw);
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.3); ctx.lineTo(s * 0.52, s * 0.16); ink(ctx, lw); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(s * 0.66, s * 0.2, s * 0.14, s * 0.07, -0.5, 0, 7); body(ctx, '#5eb45e', lw * 0.8);
    shine(ctx, s * 0.4, s * 0.47, s * 0.09, s * 0.05);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(s * 0.58, s * 0.66, s * 0.12, s * 0.1, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  },
  blob(ctx, s, c1, c2, lw) {
    blobPath(ctx, s * 0.5, s * 0.58, s * 0.31, 0.12, 1); body(ctx, c1, lw);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.ellipse(s * 0.56, s * 0.68, s * 0.14, s * 0.09, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    shine(ctx, s * 0.38, s * 0.46, s * 0.1, s * 0.06);
  },
  fizz(ctx, s, c1, c2, lw) {
    SHAPES.berry(ctx, s, c1, c2, lw);
    ctx.fillStyle = c2;
    for (const [bx, by, br] of [[0.3, 0.3, 0.05], [0.72, 0.36, 0.04], [0.62, 0.2, 0.035], [0.24, 0.46, 0.03]]) {
      ctx.beginPath(); ctx.arc(s * bx, s * by, s * br, 0, 7); ctx.fill();
      ink(ctx, lw * 0.6); ctx.stroke();
    }
  },
  jar(ctx, s, c1, c2, lw) {
    roundRect(ctx, s * 0.24, s * 0.3, s * 0.52, s * 0.52, s * 0.1); body(ctx, c1, lw);
    roundRect(ctx, s * 0.28, s * 0.44, s * 0.44, s * 0.2, s * 0.06); body(ctx, '#fff6e8', lw * 0.7);
    roundRect(ctx, s * 0.2, s * 0.2, s * 0.6, s * 0.13, s * 0.05); body(ctx, c2, lw);
    shine(ctx, s * 0.34, s * 0.74, s * 0.05, s * 0.09, 0.35);
  },
  bottle(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.42, s * 0.2); ctx.lineTo(s * 0.42, s * 0.38);
    ctx.quadraticCurveTo(s * 0.24, s * 0.5, s * 0.26, s * 0.74);
    ctx.quadraticCurveTo(s * 0.27, s * 0.86, s * 0.5, s * 0.86);
    ctx.quadraticCurveTo(s * 0.73, s * 0.86, s * 0.74, s * 0.74);
    ctx.quadraticCurveTo(s * 0.76, s * 0.5, s * 0.58, s * 0.38);
    ctx.lineTo(s * 0.58, s * 0.2); ctx.closePath();
    body(ctx, c1, lw);
    ctx.save(); ctx.clip();
    ctx.fillStyle = c2; ctx.globalAlpha = 0.7;
    ctx.fillRect(0, s * 0.6, s, s); ctx.globalAlpha = 1; ctx.restore();
    roundRect(ctx, s * 0.4, s * 0.12, s * 0.2, s * 0.12, s * 0.04); body(ctx, '#c89a62', lw);
    shine(ctx, s * 0.36, s * 0.62, s * 0.04, s * 0.1, 0.4);
  },
  drop(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.16);
    ctx.quadraticCurveTo(s * 0.82, s * 0.56, s * 0.78, s * 0.68);
    ctx.arc(s * 0.5, s * 0.66, s * 0.28, 0, Math.PI);
    ctx.quadraticCurveTo(s * 0.18, s * 0.56, s * 0.5, s * 0.16);
    ctx.closePath(); body(ctx, c1, lw);
    shine(ctx, s * 0.4, s * 0.6, s * 0.07, s * 0.12);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(s * 0.6, s * 0.72, s * 0.09, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  },
  mushroom(ctx, s, c1, c2, lw) {
    roundRect(ctx, s * 0.4, s * 0.5, s * 0.2, s * 0.34, s * 0.07); body(ctx, '#fff2e0', lw);
    ctx.beginPath();
    ctx.moveTo(s * 0.14, s * 0.54);
    ctx.quadraticCurveTo(s * 0.5, s * 0.06, s * 0.86, s * 0.54);
    ctx.quadraticCurveTo(s * 0.5, s * 0.66, s * 0.14, s * 0.54);
    ctx.closePath(); body(ctx, c1, lw);
    ctx.fillStyle = c2;
    for (const [dx, dy, r] of [[0.36, 0.34, 0.07], [0.6, 0.3, 0.055], [0.5, 0.46, 0.045], [0.74, 0.46, 0.04]]) {
      ctx.beginPath(); ctx.ellipse(s * dx, s * dy, s * r, s * r * 0.8, 0, 0, 7); ctx.fill();
    }
  },
  cloud(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.arc(s * 0.34, s * 0.52, s * 0.18, Math.PI * 0.6, Math.PI * 1.8);
    ctx.arc(s * 0.52, s * 0.4, s * 0.22, Math.PI * 1.1, Math.PI * 1.9);
    ctx.arc(s * 0.7, s * 0.52, s * 0.17, Math.PI * 1.3, Math.PI * 0.4);
    ctx.lineTo(s * 0.3, s * 0.69); ctx.closePath();
    body(ctx, c1, lw);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.ellipse(s * 0.46, s * 0.36, s * 0.14, s * 0.07, -0.3, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  },
  cup(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.26, s * 0.36); ctx.lineTo(s * 0.34, s * 0.82);
    ctx.quadraticCurveTo(s * 0.5, s * 0.88, s * 0.66, s * 0.82);
    ctx.lineTo(s * 0.74, s * 0.36); ctx.closePath();
    body(ctx, '#fff6ea', lw);
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.38, s * 0.24, s * 0.08, 0, 0, 7); body(ctx, c1, lw);
    ctx.beginPath(); ctx.ellipse(s * 0.46, s * 0.3, s * 0.1, s * 0.07, -0.4, 0, 7); body(ctx, c2, lw * 0.7);
    shine(ctx, s * 0.36, s * 0.6, s * 0.04, s * 0.1, 0.4);
  },
  ring(ctx, s, c1, c2, lw) {
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.52, s * 0.3, 0, 7); body(ctx, c1, lw);
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.52, s * 0.15, 0, 7);
    ctx.fillStyle = '#fff8ee'; ctx.fill(); ink(ctx, lw * 0.8); ctx.stroke();
    shine(ctx, s * 0.36, s * 0.34, s * 0.07, s * 0.04);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(s * 0.7, s * 0.68, s * 0.07, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  },
  leaf(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.74);
    ctx.quadraticCurveTo(s * 0.24, s * 0.2, s * 0.8, s * 0.26);
    ctx.quadraticCurveTo(s * 0.78, s * 0.8, s * 0.2, s * 0.74);
    ctx.closePath(); body(ctx, c1, lw);
    ink(ctx, lw * 0.8);
    ctx.beginPath(); ctx.moveTo(s * 0.22, s * 0.74); ctx.quadraticCurveTo(s * 0.56, s * 0.56, s * 0.78, s * 0.28); ctx.stroke();
    ctx.strokeStyle = c2; ctx.lineWidth = lw * 0.7;
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      ctx.beginPath();
      ctx.moveTo(s * (0.22 + 0.56 * t), s * (0.74 - 0.46 * t));
      ctx.lineTo(s * (0.22 + 0.56 * t + 0.1), s * (0.74 - 0.46 * t - 0.14));
      ctx.stroke();
    }
  },
  flake(ctx, s, c1, c2, lw) {
    ctx.translate(s * 0.5, s * 0.52);
    ink(ctx, lw * 1.1);
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.rotate((Math.PI / 3) * i);
      ctx.strokeStyle = c1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(s * 0.1, -s * 0.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(-s * 0.1, -s * 0.28); ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, s * 0.07, 0, 7); body(ctx, c2, lw * 0.8);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },
  spark(ctx, s, c1, c2, lw) {
    star(ctx, s * 0.5, s * 0.5, s * 0.36, 4, 0.3); body(ctx, c1, lw);
    star(ctx, s * 0.5, s * 0.5, s * 0.18, 4, 0.34); body(ctx, c2, 0);
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.arc(s * 0.82, s * 0.2, s * 0.05, 0, 7); ctx.fill();
  },
  stars(ctx, s, c1, c2, lw) {
    star(ctx, s * 0.46, s * 0.48, s * 0.3); body(ctx, c1, lw);
    star(ctx, s * 0.78, s * 0.24, s * 0.11); body(ctx, c2, lw * 0.7);
    star(ctx, s * 0.24, s * 0.78, s * 0.09); body(ctx, c2, lw * 0.7);
    shine(ctx, s * 0.4, s * 0.42, s * 0.05, s * 0.03);
  },
  comb(ctx, s, c1, c2, lw) {
    const hex = (cx, cy, r) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    for (const [dx, dy] of [[0.5, 0.3], [0.31, 0.62], [0.69, 0.62]]) { hex(s * dx, s * dy, s * 0.2); body(ctx, c1, lw); }
    for (const [dx, dy] of [[0.5, 0.3], [0.31, 0.62], [0.69, 0.62]]) { hex(s * dx, s * dy, s * 0.11); body(ctx, c2, lw * 0.6); }
  },
  swirl(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const a = t * Math.PI * 4;
      const r = s * 0.06 + t * s * 0.3;
      const px = s * 0.5 + Math.cos(a) * r, py = s * 0.52 + Math.sin(a) * r * 0.9;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 3.2; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = c1; ctx.lineWidth = lw * 2.1; ctx.stroke();
    ctx.strokeStyle = c2; ctx.lineWidth = lw * 0.7; ctx.stroke();
  },
  orb(ctx, s, c1, c2, lw) {
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.52, s * 0.32, 0, 7); body(ctx, c1, lw);
    ctx.save();
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.52, s * 0.31, 0, 7); ctx.clip();
    ctx.fillStyle = 'rgba(70,60,90,0.16)';
    ctx.beginPath(); ctx.ellipse(s * 0.62, s * 0.72, s * 0.3, s * 0.2, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.arc(s * 0.38, s * 0.4, s * 0.12, 0, 7); ctx.fill();
    ctx.restore();
    shine(ctx, s * 0.38, s * 0.38, s * 0.1, s * 0.06, 0.85);
  },
  flame(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.1);
    ctx.quadraticCurveTo(s * 0.84, s * 0.44, s * 0.72, s * 0.68);
    ctx.quadraticCurveTo(s * 0.62, s * 0.88, s * 0.5, s * 0.88);
    ctx.quadraticCurveTo(s * 0.38, s * 0.88, s * 0.28, s * 0.68);
    ctx.quadraticCurveTo(s * 0.16, s * 0.44, s * 0.5, s * 0.1);
    ctx.closePath(); body(ctx, c1, lw);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.4);
    ctx.quadraticCurveTo(s * 0.66, s * 0.6, s * 0.56, s * 0.78);
    ctx.quadraticCurveTo(s * 0.5, s * 0.84, s * 0.44, s * 0.78);
    ctx.quadraticCurveTo(s * 0.34, s * 0.6, s * 0.5, s * 0.4);
    ctx.closePath(); body(ctx, c2, 0);
  },
  puddle(ctx, s, c1, c2, lw) {
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.62, s * 0.36, s * 0.17, 0, 0, 7); body(ctx, c1, lw);
    ctx.strokeStyle = c2; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(s * 0.46, s * 0.6, s * 0.16, s * 0.07, 0, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.62, s * 0.36, s * 0.06, 0, 7); body(ctx, c2, lw * 0.8);
  },
  arc(ctx, s, c1, c2, lw) {
    const cols = ['#ff7a6a', '#ffbf4a', '#8ad86a', '#5ab8f0', '#a87ae0'];
    ctx.lineCap = 'butt';
    cols.forEach((c, i) => {
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.82, s * (0.34 - i * 0.055), Math.PI, 0);
      ctx.strokeStyle = c; ctx.lineWidth = s * 0.06; ctx.stroke();
    });
    ctx.lineCap = 'round';
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.arc(s * 0.2, s * 0.84, s * 0.08, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.8, s * 0.84, s * 0.08, 0, 7); ctx.fill();
  },
  candy(ctx, s, c1, c2, lw) {
    ink(ctx, lw);
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.56); ctx.lineTo(s * 0.5, s * 0.9); ctx.stroke();
    blobPath(ctx, s * 0.5, s * 0.42, s * 0.3, 0.18, 2); body(ctx, c1, lw);
    blobPath(ctx, s * 0.56, s * 0.36, s * 0.14, 0.2, 1); body(ctx, c2, 0);
  },
  fern(ctx, s, c1, c2, lw) {
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 1.2;
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.9); ctx.quadraticCurveTo(s * 0.46, s * 0.4, s * 0.62, s * 0.14); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const x = s * (0.5 - 0.04 * t + 0.16 * t * t), y = s * (0.9 - 0.68 * t);
      const len = s * (0.26 - 0.16 * t);
      for (const dir of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(x + dir * len * 0.5, y - len * 0.14, len * 0.5, len * 0.18, dir * -0.5, 0, 7);
        body(ctx, i % 2 ? c1 : c2, lw * 0.7);
      }
    }
  },
  dust(ctx, s, c1, c2, lw) {
    const pts = [[0.5, 0.42, 0.13], [0.26, 0.6, 0.08], [0.74, 0.62, 0.09], [0.36, 0.26, 0.06], [0.68, 0.28, 0.055], [0.5, 0.76, 0.06]];
    pts.forEach(([dx, dy, r], i) => { star(ctx, s * dx, s * dy, s * r, 4, 0.34); body(ctx, i % 2 ? c2 : c1, lw * 0.6); });
  },
  galaxy(ctx, s, c1, c2, lw) {
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.36, 0, 7); body(ctx, c1, lw);
    ctx.save(); ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.36, 0, 7); ctx.clip();
    ctx.strokeStyle = c2; ctx.lineWidth = lw * 1.4;
    for (const dir of [0, Math.PI]) {
      ctx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const t = i / 30, a = dir + t * 2.6, r = s * 0.06 + t * s * 0.3;
        const px = s * 0.5 + Math.cos(a) * r, py = s * 0.5 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    for (const [dx, dy, r] of [[0.3, 0.3, 0.025], [0.72, 0.38, 0.02], [0.62, 0.72, 0.022], [0.34, 0.68, 0.018]]) {
      ctx.beginPath(); ctx.arc(s * dx, s * dy, s * r, 0, 7); ctx.fill();
    }
    ctx.restore();
    star(ctx, s * 0.5, s * 0.5, s * 0.1); body(ctx, '#fff6d0', lw * 0.6);
  },
  cube(ctx, s, c1, c2, lw) {
    const k = s * 0.26;
    const cx = s * 0.5, cy = s * 0.54;
    ctx.beginPath();
    ctx.moveTo(cx, cy - k * 1.1); ctx.lineTo(cx + k, cy - k * 0.5); ctx.lineTo(cx + k, cy + k * 0.6);
    ctx.lineTo(cx, cy + k * 1.2); ctx.lineTo(cx - k, cy + k * 0.6); ctx.lineTo(cx - k, cy - k * 0.5);
    ctx.closePath(); body(ctx, c1, lw);
    ctx.beginPath();
    ctx.moveTo(cx, cy - k * 1.1); ctx.lineTo(cx + k, cy - k * 0.5); ctx.lineTo(cx, cy + k * 0.1); ctx.lineTo(cx - k, cy - k * 0.5);
    ctx.closePath(); body(ctx, c2, lw * 0.8);
    ink(ctx, lw * 0.8);
    ctx.beginPath(); ctx.moveTo(cx, cy + k * 0.1); ctx.lineTo(cx, cy + k * 1.2); ctx.stroke();
  },
  globe(ctx, s, c1, c2, lw) {
    roundRect(ctx, s * 0.3, s * 0.74, s * 0.4, s * 0.14, s * 0.05); body(ctx, '#a8744a', lw);
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.48, s * 0.28, 0, 7); body(ctx, c1, lw);
    ctx.save(); ctx.beginPath(); ctx.arc(s * 0.5, s * 0.48, s * 0.27, 0, 7); ctx.clip();
    ctx.fillStyle = c2;
    for (const [dx, dy, r] of [[0.4, 0.34, 0.03], [0.6, 0.42, 0.025], [0.48, 0.56, 0.028], [0.64, 0.62, 0.022], [0.34, 0.54, 0.02]]) {
      ctx.beginPath(); ctx.arc(s * dx, s * dy, s * r, 0, 7); ctx.fill();
    }
    ctx.restore();
    shine(ctx, s * 0.4, s * 0.36, s * 0.08, s * 0.05, 0.7);
  },
  lamp(ctx, s, c1, c2, lw) {
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.52, s * 0.3, s * 0.1, 0, 0, 7); body(ctx, c2, 0);
    roundRect(ctx, s * 0.42, s * 0.46, s * 0.16, s * 0.34, s * 0.06); body(ctx, '#fff2e0', lw);
    ctx.beginPath();
    ctx.moveTo(s * 0.18, s * 0.5); ctx.quadraticCurveTo(s * 0.5, s * 0.1, s * 0.82, s * 0.5);
    ctx.quadraticCurveTo(s * 0.5, s * 0.62, s * 0.18, s * 0.5); ctx.closePath();
    body(ctx, c1, lw);
    roundRect(ctx, s * 0.32, s * 0.78, s * 0.36, s * 0.1, s * 0.04); body(ctx, '#a8744a', lw);
  },
  cone(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.32, s * 0.5); ctx.lineTo(s * 0.5, s * 0.92); ctx.lineTo(s * 0.68, s * 0.5); ctx.closePath();
    body(ctx, '#e0a860', lw);
    ctx.beginPath(); ctx.arc(s * 0.42, s * 0.44, s * 0.16, 0, 7); body(ctx, c1, lw);
    ctx.beginPath(); ctx.arc(s * 0.6, s * 0.38, s * 0.15, 0, 7); body(ctx, c2, lw);
    shine(ctx, s * 0.56, s * 0.3, s * 0.05, s * 0.03, 0.7);
  },
  petal(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.88);
    ctx.quadraticCurveTo(s * 0.1, s * 0.6, s * 0.5, s * 0.1);
    ctx.quadraticCurveTo(s * 0.9, s * 0.6, s * 0.5, s * 0.88);
    ctx.closePath(); body(ctx, c1, lw);
    ctx.strokeStyle = c2; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.84); ctx.lineTo(s * 0.5, s * 0.22); ctx.stroke();
  },
  flower(ctx, s, c1, c2, lw) {
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      ctx.beginPath(); ctx.ellipse(s * 0.5 + Math.cos(a) * s * 0.2, s * 0.52 + Math.sin(a) * s * 0.2, s * 0.15, s * 0.11, a, 0, 7);
      body(ctx, c1, lw);
    }
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.52, s * 0.13, 0, 7); body(ctx, c2, lw);
  },
  prism(ctx, s, c1, c2, lw) {
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.14); ctx.lineTo(s * 0.84, s * 0.76); ctx.lineTo(s * 0.16, s * 0.76); ctx.closePath();
    body(ctx, c1, lw);
    const cols = ['#ff7a6a', '#ffbf4a', '#8ad86a', '#5ab8f0'];
    cols.forEach((c, i) => {
      ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.5); ctx.lineTo(s * 0.96, s * (0.56 + i * 0.1));
      ctx.strokeStyle = c; ctx.lineWidth = lw * 1.2; ctx.stroke();
    });
    shine(ctx, s * 0.44, s * 0.46, s * 0.04, s * 0.14, 0.5);
  },
  bolt(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.58, s * 0.08); ctx.lineTo(s * 0.3, s * 0.52); ctx.lineTo(s * 0.48, s * 0.52);
    ctx.lineTo(s * 0.36, s * 0.92); ctx.lineTo(s * 0.74, s * 0.42); ctx.lineTo(s * 0.54, s * 0.42);
    ctx.lineTo(s * 0.7, s * 0.08); ctx.closePath();
    body(ctx, c1, lw);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(s * 0.6, s * 0.16); ctx.lineTo(s * 0.42, s * 0.48); ctx.lineTo(s * 0.52, s * 0.48); ctx.closePath();
    ctx.fill(); ctx.globalAlpha = 1;
  },
  lump(ctx, s, c1, c2, lw) {
    blobPath(ctx, s * 0.5, s * 0.6, s * 0.3, 0.2, 4); body(ctx, c1, lw);
    ctx.fillStyle = c2;
    for (const [dx, dy, r] of [[0.4, 0.52, 0.045], [0.62, 0.6, 0.035], [0.5, 0.7, 0.03]]) {
      ctx.beginPath(); ctx.arc(s * dx, s * dy, s * r, 0, 7); ctx.fill();
    }
  },
  shard(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.46, s * 0.08); ctx.lineTo(s * 0.76, s * 0.44); ctx.lineTo(s * 0.6, s * 0.9);
    ctx.lineTo(s * 0.3, s * 0.66); ctx.lineTo(s * 0.26, s * 0.3); ctx.closePath();
    body(ctx, c1, lw);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.65;
    ctx.beginPath(); ctx.moveTo(s * 0.46, s * 0.14); ctx.lineTo(s * 0.68, s * 0.44); ctx.lineTo(s * 0.44, s * 0.6); ctx.closePath();
    ctx.fill(); ctx.globalAlpha = 1;
  },
  spike(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.34, s * 0.14); ctx.lineTo(s * 0.66, s * 0.16);
    ctx.quadraticCurveTo(s * 0.58, s * 0.6, s * 0.5, s * 0.9);
    ctx.quadraticCurveTo(s * 0.42, s * 0.6, s * 0.34, s * 0.14);
    ctx.closePath(); body(ctx, c1, lw);
    shine(ctx, s * 0.44, s * 0.4, s * 0.035, s * 0.16, 0.7);
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.16, s * 0.17, s * 0.06, 0, 0, 7); ctx.fill();
  },
  tadpole(ctx, s, c1, c2, lw) {
    ctx.strokeStyle = c1; ctx.lineWidth = lw * 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.52, s * 0.52); ctx.quadraticCurveTo(s * 0.78, s * 0.4, s * 0.86, s * 0.68); ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.42, s * 0.54, s * 0.22, 0, 7); body(ctx, c1, lw);
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(s * 0.36, s * 0.5, s * 0.04, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.04, 0, 7); ctx.fill();
    shine(ctx, s * 0.34, s * 0.44, s * 0.05, s * 0.03, 0.6);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(s * 0.46, s * 0.64, s * 0.07, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  },
  wave(ctx, s, c1, c2, lw) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const y = s * (0.34 + i * 0.18);
      ctx.moveTo(s * 0.12, y);
      ctx.quadraticCurveTo(s * 0.3, y - s * 0.1, s * 0.5, y);
      ctx.quadraticCurveTo(s * 0.7, y + s * 0.1, s * 0.88, y);
      ctx.strokeStyle = INK; ctx.lineWidth = lw * 2.6; ctx.stroke();
      ctx.strokeStyle = i % 2 ? c2 : c1; ctx.lineWidth = lw * 1.5; ctx.stroke();
    }
  },
  worm(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.16, s * 0.72);
    ctx.quadraticCurveTo(s * 0.34, s * 0.4, s * 0.52, s * 0.62);
    ctx.quadraticCurveTo(s * 0.68, s * 0.8, s * 0.78, s * 0.42);
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 4.2; ctx.stroke();
    ctx.strokeStyle = c1; ctx.lineWidth = lw * 2.8; ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.78, s * 0.36, s * 0.14, 0, 7); body(ctx, c2, lw);
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(s * 0.74, s * 0.33, s * 0.028, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.84, s * 0.33, s * 0.028, 0, 7); ctx.fill();
  },
  block(ctx, s, c1, c2, lw) {
    roundRect(ctx, s * 0.2, s * 0.38, s * 0.6, s * 0.42, s * 0.08); body(ctx, c1, lw);
    roundRect(ctx, s * 0.26, s * 0.44, s * 0.48, s * 0.12, s * 0.05); body(ctx, c2, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(s * 0.2, s * 0.68, s * 0.6, s * 0.1);
  },
  candle(ctx, s, c1, c2, lw) {
    roundRect(ctx, s * 0.38, s * 0.38, s * 0.24, s * 0.46, s * 0.06); body(ctx, '#fff2d8', lw);
    roundRect(ctx, s * 0.26, s * 0.8, s * 0.48, s * 0.1, s * 0.04); body(ctx, '#b07a4a', lw);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.1);
    ctx.quadraticCurveTo(s * 0.66, s * 0.26, s * 0.5, s * 0.38);
    ctx.quadraticCurveTo(s * 0.34, s * 0.26, s * 0.5, s * 0.1);
    ctx.closePath(); body(ctx, c1, lw * 0.8);
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.27, s * 0.035, s * 0.06, 0, 0, 7); body(ctx, c2, 0);
  },
  flask(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.42, s * 0.2); ctx.lineTo(s * 0.42, s * 0.42);
    ctx.lineTo(s * 0.18, s * 0.78); ctx.quadraticCurveTo(s * 0.14, s * 0.88, s * 0.3, s * 0.88);
    ctx.lineTo(s * 0.7, s * 0.88); ctx.quadraticCurveTo(s * 0.86, s * 0.88, s * 0.82, s * 0.78);
    ctx.lineTo(s * 0.58, s * 0.42); ctx.lineTo(s * 0.58, s * 0.2); ctx.closePath();
    potionGlass(ctx, s, c1, c2, lw, 0.58);
    roundRect(ctx, s * 0.38, s * 0.1, s * 0.24, s * 0.12, s * 0.04); body(ctx, '#c89a62', lw);
  },
  vial(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    roundRect(ctx, s * 0.34, s * 0.22, s * 0.32, s * 0.66, s * 0.12);
    potionGlass(ctx, s, c1, c2, lw, 0.46);
    roundRect(ctx, s * 0.38, s * 0.1, s * 0.24, s * 0.13, s * 0.04); body(ctx, '#c89a62', lw);
  },
  roundflask(ctx, s, c1, c2, lw) {
    ctx.beginPath();
    ctx.moveTo(s * 0.42, s * 0.18); ctx.lineTo(s * 0.42, s * 0.42);
    ctx.arc(s * 0.5, s * 0.63, s * 0.26, Math.PI * 1.22, Math.PI * 1.78, true);
    ctx.lineTo(s * 0.58, s * 0.18); ctx.closePath();
    potionGlass(ctx, s, c1, c2, lw, 0.56);
    roundRect(ctx, s * 0.38, s * 0.08, s * 0.24, s * 0.12, s * 0.04); body(ctx, '#c89a62', lw);
  },
};

// Shared glass-and-liquid treatment for the three potion bottles. The caller
// leaves a path on the context; we fill it, clip, pour the liquid and shine it.
function potionGlass(ctx, s, c1, c2, lw, fillFrom) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = c1;
  ctx.fillRect(0, s * fillFrom, s, s);
  ctx.fillStyle = c2;
  ctx.beginPath(); ctx.ellipse(s * 0.5, s * fillFrom, s * 0.3, s * 0.045, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 0.8;
  for (const [dx, dy, r] of [[0.4, 0.74, 0.04], [0.58, 0.68, 0.03], [0.5, 0.82, 0.025]]) {
    ctx.beginPath(); ctx.arc(s * dx, s * dy, s * r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ink(ctx, lw); ctx.stroke();
  shine(ctx, s * 0.34, s * 0.66, s * 0.035, s * 0.1, 0.65);
}

export const SHAPE_NAMES = Object.keys(SHAPES);

export function drawItem(ctx, id, s) {
  const it = ITEM[id];
  if (!it) return;
  const fn = SHAPES[it.shape] || SHAPES.blob;
  ctx.save();
  fn(ctx, s, it.c1, it.c2, Math.max(1.4, s * 0.034));
  ctx.restore();
}

// A silhouette for the book: the real glyph, faded almost away. It teases the
// shape and a hint of colour without naming anything. Drawn into a scratch
// canvas and stamped at low alpha, which avoids filter() entirely.
export function drawSilhouette(ctx, id, s) {
  if (!ITEM[id]) return;
  const tmp = makeCanvas(s, s);
  drawItem(tmp.getContext('2d'), id, s);
  ctx.save();
  ctx.globalAlpha = 0.26;
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

// ----------------------------------------------------------------- pals

function eyes(ctx, s, cx, cy, r, shut, face = 1) {
  ctx.fillStyle = INK;
  const dx = r * 1.5;
  if (shut) {
    ink(ctx, Math.max(1.5, s * 0.016));
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + d * dx, cy + r * 0.3, r * 1.1, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    return;
  }
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(cx + d * dx, cy, r, r * 1.15, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.arc(cx + d * dx - r * 0.3 * face, cy - r * 0.35, r * 0.35, 0, 7); ctx.fill();
  }
}

function smile(ctx, s, cx, cy, w) {
  ink(ctx, Math.max(1.5, s * 0.018));
  ctx.beginPath();
  ctx.arc(cx, cy, w, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();
}

function blush(ctx, s, cx, cy, dx, r, color = 'rgba(255,140,170,0.5)') {
  ctx.fillStyle = color;
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(cx + d * dx, cy, r, r * 0.62, 0, 0, 7); ctx.fill();
  }
}

function wings(ctx, s, cx, cy, r, kind) {
  const lw = Math.max(1.4, s * 0.016);
  if (kind === 'batwings') {
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + d * r * 0.5, cy);
      ctx.quadraticCurveTo(cx + d * r * 2.1, cy - r * 0.9, cx + d * r * 2.0, cy + r * 0.5);
      ctx.quadraticCurveTo(cx + d * r * 1.4, cy + r * 0.2, cx + d * r * 1.2, cy + r * 0.7);
      ctx.quadraticCurveTo(cx + d * r * 0.8, cy + r * 0.3, cx + d * r * 0.5, cy);
      ctx.closePath();
      body(ctx, '#6a4a98', lw);
    }
    return;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + d * r * 1.25, cy - r * 0.2, r * 0.95, r * 0.5, d * -0.6, 0, 7);
    ctx.fill(); ink(ctx, lw); ctx.stroke();
  }
}

const BODIES = {
  slime(ctx, s, p, shut) {
    const cx = s * 0.5, base = s * 0.84, r = s * 0.33;
    ctx.beginPath();
    ctx.moveTo(cx - r, base);
    ctx.quadraticCurveTo(cx - r * 1.06, base - r * 1.5, cx, base - r * 1.72);
    ctx.quadraticCurveTo(cx + r * 1.06, base - r * 1.5, cx + r, base);
    ctx.quadraticCurveTo(cx + r * 0.5, base + s * 0.05, cx, base);
    ctx.quadraticCurveTo(cx - r * 0.5, base + s * 0.05, cx - r, base);
    ctx.closePath();
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    ctx.save(); ctx.clip();
    ctx.fillStyle = p.c2; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(cx, base, r * 1.1, s * 0.1, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1; ctx.restore();
    shine(ctx, cx - r * 0.45, base - r * 1.1, s * 0.05, s * 0.03, 0.7);
    eyes(ctx, s, cx, base - r * 0.95, s * 0.038, shut);
    smile(ctx, s, cx, base - r * 0.82, s * 0.07);
    blush(ctx, s, cx, base - r * 0.6, s * 0.15, s * 0.045);
  },
  sprite(ctx, s, p, shut) {
    const cx = s * 0.5, cy = s * 0.56, r = s * 0.22;
    wings(ctx, s, cx, cy - r * 0.2, r, 'wings');
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.5);
    ctx.quadraticCurveTo(cx + r * 1.05, cy - r * 0.2, cx + r * 0.5, cy + r * 1.1);
    ctx.quadraticCurveTo(cx, cy + r * 1.5, cx - r * 0.5, cy + r * 1.1);
    ctx.quadraticCurveTo(cx - r * 1.05, cy - r * 0.2, cx, cy - r * 1.5);
    ctx.closePath();
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    shine(ctx, cx - r * 0.4, cy - r * 0.4, s * 0.045, s * 0.028, 0.8);
    eyes(ctx, s, cx, cy - r * 0.15, s * 0.035, shut);
    smile(ctx, s, cx, cy, s * 0.055);
    blush(ctx, s, cx, cy + r * 0.2, s * 0.11, s * 0.038);
  },
  dragon(ctx, s, p, shut) {
    const cx = s * 0.5, base = s * 0.82, r = s * 0.26;
    // tail
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.6, base - r * 0.3);
    ctx.quadraticCurveTo(cx + r * 2.2, base - r * 0.1, cx + r * 1.9, base - r * 1.2);
    ctx.strokeStyle = INK; ctx.lineWidth = s * 0.05; ctx.stroke();
    ctx.strokeStyle = p.c1; ctx.lineWidth = s * 0.03; ctx.stroke();
    wings(ctx, s, cx, base - r * 1.4, r * 0.8, 'wings');
    ctx.beginPath(); ctx.ellipse(cx, base - r * 0.9, r, r * 1.05, 0, 0, 7);
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    ctx.beginPath(); ctx.ellipse(cx, base - r * 0.55, r * 0.55, r * 0.5, 0, 0, 7); body(ctx, p.c2, 0);
    // snout
    ctx.beginPath(); ctx.ellipse(cx - r * 0.72, base - r * 1.05, r * 0.4, r * 0.3, -0.2, 0, 7);
    body(ctx, p.c2, Math.max(1.4, s * 0.016));
    eyes(ctx, s, cx - r * 0.1, base - r * 1.25, s * 0.034, shut, -1);
    blush(ctx, s, cx - r * 0.1, base - r * 0.95, s * 0.1, s * 0.035);
    // feet
    ctx.fillStyle = p.c2;
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(cx + d * r * 0.45, base, r * 0.3, r * 0.16, 0, 0, 7);
      body(ctx, p.c2, Math.max(1.3, s * 0.014));
    }
  },
  kitten(ctx, s, p, shut) {
    const cx = s * 0.5, base = s * 0.84, r = s * 0.24;
    // tail
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.8, base - r * 0.2);
    ctx.quadraticCurveTo(cx + r * 2.0, base - r * 0.4, cx + r * 1.6, base - r * 1.4);
    ctx.strokeStyle = INK; ctx.lineWidth = s * 0.055; ctx.stroke();
    ctx.strokeStyle = p.c1; ctx.lineWidth = s * 0.034; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, base - r * 0.55, r * 0.95, r * 0.6, 0, 0, 7);
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    const hy = base - r * 1.35;
    const pointy = p.feats.includes('fox');
    const er = p.feats.includes('round') ? r * 0.3 : r * 0.34;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      if (pointy) {
        ctx.moveTo(cx + d * r * 0.3, hy - r * 0.5);
        ctx.lineTo(cx + d * r * 0.8, hy - r * 1.15);
        ctx.lineTo(cx + d * r * 0.86, hy - r * 0.25);
        ctx.closePath();
      } else if (p.feats.includes('round')) {
        ctx.arc(cx + d * r * 0.62, hy - r * 0.55, er, 0, 7);
      } else {
        ctx.moveTo(cx + d * r * 0.26, hy - r * 0.45);
        ctx.lineTo(cx + d * r * 0.66, hy - r * 0.95);
        ctx.lineTo(cx + d * r * 0.82, hy - r * 0.2);
        ctx.closePath();
      }
      body(ctx, p.c1, Math.max(1.5, s * 0.018));
    }
    ctx.beginPath(); ctx.ellipse(cx, hy, r * 0.78, r * 0.68, 0, 0, 7);
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    ctx.beginPath(); ctx.ellipse(cx, hy + r * 0.26, r * 0.4, r * 0.26, 0, 0, 7); body(ctx, p.c2, 0);
    eyes(ctx, s, cx, hy - r * 0.08, s * 0.032, shut);
    ctx.fillStyle = '#ff8aa8';
    ctx.beginPath(); ctx.ellipse(cx, hy + r * 0.24, s * 0.016, s * 0.012, 0, 0, 7); ctx.fill();
    smile(ctx, s, cx, hy + r * 0.3, s * 0.035);
    blush(ctx, s, cx, hy + r * 0.3, s * 0.1, s * 0.032);
  },
  bunny(ctx, s, p, shut) {
    const cx = s * 0.5, base = s * 0.86, r = s * 0.22;
    ctx.beginPath(); ctx.ellipse(cx, base - r * 0.5, r * 0.95, r * 0.62, 0, 0, 7);
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    const hy = base - r * 1.3;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + d * r * 0.4, hy - r * 1.0, r * 0.22, r * 0.72, d * 0.22, 0, 7);
      body(ctx, p.c1, Math.max(1.5, s * 0.018));
      ctx.beginPath();
      ctx.ellipse(cx + d * r * 0.4, hy - r * 1.0, r * 0.1, r * 0.5, d * 0.22, 0, 7);
      body(ctx, '#ffb8c8', 0);
    }
    ctx.beginPath(); ctx.ellipse(cx, hy, r * 0.74, r * 0.66, 0, 0, 7);
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    eyes(ctx, s, cx, hy - r * 0.05, s * 0.032, shut);
    ctx.fillStyle = '#ff8aa8';
    ctx.beginPath(); ctx.ellipse(cx, hy + r * 0.26, s * 0.016, s * 0.013, 0, 0, 7); ctx.fill();
    smile(ctx, s, cx, hy + r * 0.3, s * 0.032);
    blush(ctx, s, cx, hy + r * 0.3, s * 0.1, s * 0.03);
    ctx.fillStyle = p.c2;
    ctx.beginPath(); ctx.arc(cx + r * 0.95, base - r * 0.55, r * 0.22, 0, 7); ctx.fill();
  },
  mouse(ctx, s, p, shut) {
    const cx = s * 0.5, base = s * 0.84, r = s * 0.22;
    ctx.strokeStyle = INK; ctx.lineWidth = s * 0.016;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.9, base - r * 0.4);
    ctx.quadraticCurveTo(cx + r * 2.1, base - r * 0.1, cx + r * 1.7, base - r * 1.1);
    ctx.stroke();
    const hy = base - r * 0.9;
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.arc(cx + d * r * 0.72, hy - r * 0.5, r * 0.38, 0, 7);
      body(ctx, p.c1, Math.max(1.5, s * 0.018));
      ctx.beginPath(); ctx.arc(cx + d * r * 0.72, hy - r * 0.5, r * 0.2, 0, 7);
      body(ctx, '#ffc0c8', 0);
    }
    ctx.beginPath(); ctx.ellipse(cx, base - r * 0.4, r * 0.9, r * 0.56, 0, 0, 7);
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    ctx.beginPath(); ctx.ellipse(cx, hy, r * 0.74, r * 0.62, 0, 0, 7);
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    ctx.beginPath(); ctx.ellipse(cx, hy + r * 0.3, r * 0.3, r * 0.2, 0, 0, 7); body(ctx, p.c2, 0);
    eyes(ctx, s, cx, hy - r * 0.05, s * 0.03, shut);
    ctx.fillStyle = '#ff8aa8';
    ctx.beginPath(); ctx.arc(cx, hy + r * 0.34, s * 0.015, 0, 7); ctx.fill();
    blush(ctx, s, cx, hy + r * 0.3, s * 0.1, s * 0.03);
  },
  bird(ctx, s, p, shut) {
    const cx = s * 0.5, base = s * 0.84, r = s * 0.25;
    if (p.feats.includes('batwings')) wings(ctx, s, cx, base - r * 1.0, r * 0.8, 'batwings');
    // tail
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.6, base - r * 0.7);
    ctx.lineTo(cx + r * 1.7, base - r * 0.3);
    ctx.lineTo(cx + r * 1.6, base - r * 1.1);
    ctx.closePath(); body(ctx, p.c2, Math.max(1.4, s * 0.016));
    ctx.beginPath(); ctx.ellipse(cx, base - r * 0.8, r * 0.82, r * 0.95, 0, 0, 7);
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    if (!p.feats.includes('batwings')) {
      ctx.beginPath(); ctx.ellipse(cx + r * 0.2, base - r * 0.75, r * 0.4, r * 0.55, 0.3, 0, 7);
      body(ctx, p.c2, Math.max(1.4, s * 0.016));
    }
    if (p.feats.includes('crest')) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.1, base - r * 1.7);
      ctx.quadraticCurveTo(cx + r * 0.2, base - r * 2.2, cx + r * 0.45, base - r * 1.6);
      ctx.closePath(); body(ctx, p.c2, Math.max(1.3, s * 0.014));
    }
    // beak
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.72, base - r * 1.05);
    ctx.lineTo(cx - r * 1.2, base - r * 0.92);
    ctx.lineTo(cx - r * 0.72, base - r * 0.78);
    ctx.closePath(); body(ctx, '#ffb83a', Math.max(1.3, s * 0.014));
    eyes(ctx, s, cx - r * 0.18, base - r * 1.12, s * 0.03, shut, -1);
    blush(ctx, s, cx - r * 0.18, base - r * 0.86, s * 0.085, s * 0.028);
    ctx.fillStyle = '#ffb83a';
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(cx + d * r * 0.26, base, r * 0.2, r * 0.1, 0, 0, 7); ctx.fill();
    }
  },
  bug(ctx, s, p, shut) {
    const cx = s * 0.5, base = s * 0.82, r = s * 0.25;
    ink(ctx, Math.max(1.3, s * 0.014));
    for (const d of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + d * r * 0.5, base - r * (0.25 + i * 0.3));
        ctx.lineTo(cx + d * r * 1.05, base - r * (0.05 + i * 0.36));
        ctx.stroke();
      }
    }
    // antennae
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + d * r * 0.25, base - r * 1.4);
      ctx.quadraticCurveTo(cx + d * r * 0.7, base - r * 2.0, cx + d * r * 0.5, base - r * 2.2);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + d * r * 0.5, base - r * 2.25, r * 0.1, 0, 7); body(ctx, p.c2, Math.max(1.2, s * 0.012));
    }
    if (p.feats.includes('wings')) wings(ctx, s, cx, base - r * 1.0, r * 0.75, 'wings');
    ctx.beginPath(); ctx.ellipse(cx, base - r * 0.78, r * 0.86, r * 0.82, 0, 0, 7);
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    if (p.feats.includes('stripes')) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, base - r * 0.78, r * 0.84, r * 0.8, 0, 0, 7); ctx.clip();
      ctx.fillStyle = 'rgba(60,40,70,0.75)';
      for (let i = 0; i < 2; i++) ctx.fillRect(cx - r, base - r * (0.45 + i * 0.5), r * 2, r * 0.2);
      ctx.restore();
    }
    if (p.feats.includes('spikes')) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.08 + (i / 6) * 0.84);
        const ex = cx + Math.cos(a) * r * 0.84, ey = base - r * 0.78 + Math.sin(a) * r * 0.8;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(a) * r * 0.34, ey + Math.sin(a) * r * 0.34);
        ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.6, s * 0.02); ctx.stroke();
        ctx.strokeStyle = p.c2; ctx.lineWidth = Math.max(1, s * 0.012); ctx.stroke();
      }
    }
    eyes(ctx, s, cx, base - r * 0.95, s * 0.034, shut);
    smile(ctx, s, cx, base - r * 0.76, s * 0.05);
    blush(ctx, s, cx, base - r * 0.6, s * 0.12, s * 0.032);
  },
  ghost(ctx, s, p, shut) {
    const cx = s * 0.5, top = s * 0.26, r = s * 0.26;
    ctx.beginPath();
    ctx.moveTo(cx - r, top + r * 1.6);
    ctx.arc(cx, top + r * 0.6, r, Math.PI, 0);
    ctx.lineTo(cx + r, top + r * 1.7);
    for (let i = 0; i < 3; i++) {
      const x0 = cx + r - (i * 2 * r) / 3;
      ctx.quadraticCurveTo(x0 - r / 3, top + r * (i % 2 ? 1.3 : 2.1), x0 - (2 * r) / 3, top + r * 1.7);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.92;
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    ctx.globalAlpha = 1;
    shine(ctx, cx - r * 0.45, top + r * 0.3, s * 0.05, s * 0.03, 0.7);
    eyes(ctx, s, cx, top + r * 0.55, s * 0.036, shut);
    smile(ctx, s, cx, top + r * 0.78, s * 0.06);
    blush(ctx, s, cx, top + r * 0.95, s * 0.14, s * 0.038);
  },
  fish(ctx, s, p, shut) {
    const cx = s * 0.5, cy = s * 0.56, r = s * 0.22;
    if (p.feats.includes('bubble')) {
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.75, 0, 7);
      ctx.fillStyle = 'rgba(190,235,255,0.42)'; ctx.fill();
      ink(ctx, Math.max(1.4, s * 0.016)); ctx.stroke();
      shine(ctx, cx - r * 1.0, cy - r * 1.0, s * 0.05, s * 0.03, 0.8);
    }
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.5, cy);
    ctx.lineTo(cx + r * 1.35, cy - r * 0.55);
    ctx.lineTo(cx + r * 1.3, cy + r * 0.55);
    ctx.closePath(); body(ctx, p.c2, Math.max(1.4, s * 0.016));
    ctx.beginPath(); ctx.ellipse(cx - r * 0.05, cy, r * 0.95, r * 0.68, 0, 0, 7);
    body(ctx, p.c1, Math.max(1.6, s * 0.02));
    if (p.feats.includes('fins')) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy - r * 0.6);
      ctx.quadraticCurveTo(cx, cy - r * 1.3, cx + r * 0.35, cy - r * 0.55);
      ctx.closePath(); body(ctx, p.c2, Math.max(1.3, s * 0.014));
    }
    eyes(ctx, s, cx - r * 0.42, cy - r * 0.12, s * 0.028, shut, -1);
    smile(ctx, s, cx - r * 0.55, cy + r * 0.1, s * 0.03);
    blush(ctx, s, cx - r * 0.4, cy + r * 0.24, s * 0.07, s * 0.026);
  },
};

export const BODY_NAMES = Object.keys(BODIES);

function featureOverlay(ctx, s, p) {
  const cx = s * 0.5;
  const lw = Math.max(1.4, s * 0.016);
  if (p.feats.includes('crown')) {
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.12 + (i / 4) * 0.76);
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * s * 0.17, s * 0.34 + Math.sin(a) * s * 0.14, s * 0.05, s * 0.032, a, 0, 7);
      body(ctx, p.c2, lw * 0.8);
    }
  }
  if (p.feats.includes('leaf')) {
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.13, s * 0.26, s * 0.08, s * 0.04, -0.7, 0, 7);
    body(ctx, '#5eb45e', lw * 0.8);
  }
  if (p.feats.includes('horn')) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.02, s * 0.3);
    ctx.lineTo(cx + s * 0.05, s * 0.16);
    ctx.lineTo(cx + s * 0.1, s * 0.31);
    ctx.closePath(); body(ctx, '#fff0d8', lw * 0.8);
  }
  if (p.feats.includes('star')) {
    star(ctx, s * 0.78, s * 0.24, s * 0.07); body(ctx, '#fff0a0', lw * 0.7);
  }
  if (p.feats.includes('shine')) {
    star(ctx, s * 0.24, s * 0.3, s * 0.055, 4, 0.3); body(ctx, '#ffffff', 0);
  }
  if (p.feats.includes('spots')) {
    ctx.fillStyle = 'rgba(70,60,80,0.3)';
    for (const [dx, dy, r] of [[0.36, 0.6, 0.045], [0.62, 0.68, 0.035], [0.52, 0.5, 0.03]]) {
      ctx.beginPath(); ctx.arc(s * dx, s * dy, s * r, 0, 7); ctx.fill();
    }
  }
  if (p.feats.includes('puffy')) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [dx, dy, r] of [[0.26, 0.66, 0.08], [0.74, 0.66, 0.075], [0.2, 0.52, 0.055], [0.8, 0.52, 0.05]]) {
      ctx.beginPath(); ctx.arc(s * dx, s * dy, s * r, 0, 7); ctx.fill();
      ink(ctx, lw * 0.7); ctx.stroke();
    }
  }
  if (p.feats.includes('glow')) {
    star(ctx, s * 0.2, s * 0.36, s * 0.05, 4, 0.3); body(ctx, '#fff6c0', 0);
    star(ctx, s * 0.82, s * 0.44, s * 0.04, 4, 0.3); body(ctx, '#fff6c0', 0);
  }
}

// A pal you have not met: the same shape, asleep, in one flat shade. Stamped
// from a scratch canvas because some bodies set their own globalAlpha.
export function drawPalSilhouette(ctx, id, s) {
  if (!PAL[id]) return;
  const tmp = makeCanvas(s, s);
  drawPal(tmp.getContext('2d'), id, s, true);
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

export function drawPal(ctx, id, s, shut = false) {
  const p = PAL[id];
  if (!p) return;
  const fn = BODIES[p.body] || BODIES.slime;
  ctx.save();
  // A soft ground shadow keeps the pal planted without shadowBlur.
  ctx.fillStyle = 'rgba(60,40,70,0.16)';
  ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.88, s * 0.26, s * 0.055, 0, 0, 7); ctx.fill();
  fn(ctx, s, p, shut);
  featureOverlay(ctx, s, p);
  ctx.restore();
}

// ------------------------------------------------------------- sprite cache

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

// Lazy bakes with a background queue: a brand-new player only ever bakes the
// eight starting glyphs, and the rest arrive as they are discovered.
export class Sprites {
  constructor({ dpr = 1, itemSize = 64, palSize = 84 } = {}) {
    this.scale = Math.min(2, Math.max(1, dpr));
    this.itemPx = Math.round(itemSize * this.scale);
    this.palPx = Math.round(palSize * this.scale);
    this.items = new Map();
    this.pals = new Map();
    this.queue = [];
  }

  item(id) {
    let c = this.items.get(id);
    if (c) return c;
    const s = this.itemPx;
    c = makeCanvas(s, s);
    drawItem(c.getContext('2d'), id, s);
    this.items.set(id, c);
    return c;
  }

  pal(id, shut = false) {
    const key = shut ? `${id}!` : id;
    let c = this.pals.get(key);
    if (c) return c;
    const s = this.palPx;
    c = makeCanvas(s, s);
    drawPal(c.getContext('2d'), id, s, shut);
    this.pals.set(key, c);
    return c;
  }

  // Ask for things to be ready soon without baking them all in one frame.
  want(ids = [], palIds = []) {
    for (const id of ids) if (!this.items.has(id)) this.queue.push(['item', id]);
    for (const id of palIds) {
      if (!this.pals.has(id)) this.queue.push(['pal', id]);
      if (!this.pals.has(`${id}!`)) this.queue.push(['palShut', id]);
    }
  }

  // Bake for at most `ms` milliseconds. Returns true when the queue is empty.
  work(ms = 5) {
    if (!this.queue.length) return true;
    const until = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + ms;
    while (this.queue.length) {
      const [kind, id] = this.queue.shift();
      if (kind === 'item') this.item(id);
      else if (kind === 'pal') this.pal(id, false);
      else this.pal(id, true);
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now >= until) break;
    }
    return this.queue.length === 0;
  }
}
