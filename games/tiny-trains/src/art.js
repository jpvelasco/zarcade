// Drawing helpers for the diorama: scenery, wooden track, buildings and the
// toy trains. Everything draws in cell-local pixels (0..s) and is baked into
// offscreen canvases by render.js; nothing here runs per object per frame
// except the small dynamic overlays.

import { openEdges, switchParts, COLOR_HEX, COLOR_DARK, COLOR_SYMBOL, opposite } from './pieces.js';
import { trackPath } from './geom.js';

export const THEMES = {
  meadow: { sky: ['#bfe9ff', '#eaf9dc'], grass: ['#93d36c', '#89ca63'], tuft: '#b5e38d', table: '#d09a5f', tableDark: '#93602f', ink: '#2f4a2a', water: '#5fc0ea', leaf: ['#4fae4a', '#68c35a', '#3d9440'] },
  creek: { sky: ['#bde6ff', '#e0f5ff'], grass: ['#97d58a', '#8dcc80'], tuft: '#bfe8a8', table: '#c99258', tableDark: '#8b5a2c', ink: '#24474a', water: '#4fb4ea', leaf: ['#3fa65a', '#5bbd68', '#2f8d4a'] },
  farm: { sky: ['#ffe8bf', '#fff6dd'], grass: ['#b7d86b', '#adcf61'], tuft: '#d4e98f', table: '#c4884c', tableDark: '#86552a', ink: '#4b3524', water: '#61bde6', leaf: ['#6aae3c', '#82c24c', '#548f2e'] },
  peaks: { sky: ['#cfe3ff', '#f4f8ff'], grass: ['#eef4fa', '#e4edf6'], tuft: '#ffffff', table: '#b98656', tableDark: '#7b5232', ink: '#2a3d55', water: '#7cc8f0', leaf: ['#2f7d5b', '#3f9670', '#24664a'] },
  town: { sky: ['#ffd9e6', '#fff1f5'], grass: ['#a4d99b', '#99cf90'], tuft: '#c6ecbd', table: '#c98f5d', tableDark: '#8a5a33', ink: '#4a3150', water: '#62c1ea', leaf: ['#47a85a', '#62bd6c', '#378f4a'] },
  night: { sky: ['#141a3d', '#2c2f66'], grass: ['#3d6e5f', '#376657'], tuft: '#4f8a76', table: '#7b5638', tableDark: '#4b321f', ink: '#eef0ff', water: '#2f6fa8', leaf: ['#2c6f55', '#3a8467', '#235b46'] },
};
export const THEME_ORDER = ['meadow', 'creek', 'farm', 'peaks', 'town', 'night'];

const WOOD = { edge: '#9a6634', face: '#ecc58c', groove: 'rgba(120, 76, 34, 0.55)', seam: 'rgba(120, 76, 34, 0.35)' };
const FIXED_WOOD = { edge: '#7a4a24', face: '#cf9a5c', groove: 'rgba(90, 52, 20, 0.6)', seam: 'rgba(90, 52, 20, 0.4)' };

export function hash(i, salt = 0) {
  let h = (i * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export { rr as roundRect };

function blob(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------------ track

function strokePath(ctx, s, a, b) {
  const p = trackPath(a, b);
  ctx.beginPath();
  if (p.line) {
    ctx.moveTo(p.line[0] * s, p.line[1] * s);
    ctx.lineTo(p.line[2] * s, p.line[3] * s);
  } else {
    const [cx, cy, r, a0, a1, ccw] = p.arc;
    ctx.arc(cx * s, cy * s, r * s, a0, a1, ccw);
  }
  ctx.stroke();
}

function grooves(ctx, s, a, b, off) {
  const p = trackPath(a, b);
  if (p.line) {
    const [x0, y0, x1, y1] = p.line;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    for (const k of [-off, off]) {
      ctx.beginPath();
      ctx.moveTo((x0 + nx * k) * s, (y0 + ny * k) * s);
      ctx.lineTo((x1 + nx * k) * s, (y1 + ny * k) * s);
      ctx.stroke();
    }
  } else {
    const [cx, cy, r, a0, a1, ccw] = p.arc;
    for (const k of [-off, off]) {
      ctx.beginPath();
      ctx.arc(cx * s, cy * s, (r + k) * s, a0, a1, ccw);
      ctx.stroke();
    }
  }
}

// Pairs of edges joined by a piece (switches show both routes).
export function piecePairs(t, v) {
  if (t === 'S') return v === 0 ? [[0, 2]] : [[1, 3]];
  if (t === 'C') return [[v, (v + 1) & 3]];
  if (t === 'X') return [[0, 2], [1, 3]];
  if (t === 'W') {
    const p = switchParts(v);
    return [[p.stem, p.straight], [p.stem, p.curve]];
  }
  return [];
}

export function drawTrack(ctx, s, pairs, { fixed = false, alpha = 1, tint = null } = {}) {
  const wood = fixed ? FIXED_WOOD : WOOD;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(40, 30, 10, 0.18)';
  ctx.lineWidth = s * 0.5;
  ctx.save();
  ctx.translate(s * 0.03, s * 0.05);
  for (const [a, b] of pairs) strokePath(ctx, s, a, b);
  ctx.restore();
  ctx.strokeStyle = wood.edge;
  ctx.lineWidth = s * 0.5;
  for (const [a, b] of pairs) strokePath(ctx, s, a, b);
  ctx.strokeStyle = tint || wood.face;
  ctx.lineWidth = s * 0.42;
  for (const [a, b] of pairs) strokePath(ctx, s, a, b);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = s * 0.08;
  for (const [a, b] of pairs) strokePath(ctx, s, a, b);
  ctx.strokeStyle = wood.groove;
  ctx.lineWidth = Math.max(1.5, s * 0.045);
  for (const [a, b] of pairs) grooves(ctx, s, a, b, 0.105);
  // Seams where pieces meet.
  ctx.strokeStyle = wood.seam;
  ctx.lineWidth = Math.max(1, s * 0.02);
  const edges = new Set(pairs.flat());
  for (const e of edges) {
    ctx.beginPath();
    if (e === 0 || e === 2) { const y = e === 0 ? 1 : s - 1; ctx.moveTo(s * 0.29, y); ctx.lineTo(s * 0.71, y); }
    else { const x = e === 3 ? 1 : s - 1; ctx.moveTo(x, s * 0.29); ctx.lineTo(x, s * 0.71); }
    ctx.stroke();
  }
  if (fixed) {
    // Brass pins mark track you can't move.
    ctx.fillStyle = '#e9c35a';
    for (const [a, b] of pairs.slice(0, 1)) {
      const p = trackPath(a, b);
      const m = p.line ? [(p.line[0] + p.line[2]) / 2, (p.line[1] + p.line[3]) / 2]
        : [p.arc[0] + Math.cos((p.arc[3] + p.arc[4]) / 2) * 0.5, p.arc[1] + Math.sin((p.arc[3] + p.arc[4]) / 2) * 0.5];
      blob(ctx, m[0] * s, m[1] * s, s * 0.035, '#e9c35a');
    }
  }
  ctx.restore();
}

export function drawPiece(ctx, s, piece, opts) {
  drawTrack(ctx, s, piecePairs(piece.t, piece.v), opts);
  if (piece.t === 'X') {
    ctx.save();
    ctx.globalAlpha = (opts && opts.alpha) || 1;
    ctx.fillStyle = (opts && opts.fixed) ? FIXED_WOOD.face : WOOD.face;
    rr(ctx, s * 0.33, s * 0.33, s * 0.34, s * 0.34, s * 0.06);
    ctx.fill();
    ctx.strokeStyle = WOOD.groove;
    ctx.lineWidth = Math.max(1.5, s * 0.045);
    for (const k of [-0.105, 0.105]) {
      ctx.beginPath(); ctx.moveTo(s * (0.5 + k), s * 0.33); ctx.lineTo(s * (0.5 + k), s * 0.67); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.33, s * (0.5 + k)); ctx.lineTo(s * 0.67, s * (0.5 + k)); ctx.stroke();
    }
    ctx.restore();
  }
}

// The little points lever on a switch, pointing down the branch it's set to.
export function drawPoints(ctx, s, v, state, alpha = 1) {
  const p = switchParts(v);
  const to = state ? p.curve : p.straight;
  const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const from = ang[p.stem];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(s / 2, s / 2);
  // Arrow from near the stem towards the active branch.
  const sx = Math.cos(from) * s * 0.22, sy = Math.sin(from) * s * 0.22;
  let tx, ty;
  if (to === p.straight) { tx = -sx * 0.6; ty = -sy * 0.6; }
  else { const a = ang[to]; tx = Math.cos(a) * s * 0.18 + sx * 0.25; ty = Math.sin(a) * s * 0.18 + sy * 0.25; }
  ctx.strokeStyle = '#ff6b5a';
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
  const a2 = Math.atan2(ty - sy, tx - sx);
  ctx.fillStyle = '#ff6b5a';
  ctx.beginPath();
  ctx.moveTo(tx + Math.cos(a2) * s * 0.07, ty + Math.sin(a2) * s * 0.07);
  ctx.lineTo(tx + Math.cos(a2 + 2.3) * s * 0.08, ty + Math.sin(a2 + 2.3) * s * 0.08);
  ctx.lineTo(tx + Math.cos(a2 - 2.3) * s * 0.08, ty + Math.sin(a2 - 2.3) * s * 0.08);
  ctx.closePath();
  ctx.fill();
  // Lever knob beside the stem.
  const side = ang[(p.stem + 1) & 3];
  blob(ctx, sx + Math.cos(side) * s * 0.26, sy + Math.sin(side) * s * 0.26, s * 0.06, '#fff');
  blob(ctx, sx + Math.cos(side) * s * 0.26, sy + Math.sin(side) * s * 0.26, s * 0.04, state ? '#ffb02e' : '#59c26b');
  ctx.restore();
}

// ---------------------------------------------------------------- symbols

export function drawSymbol(ctx, kind, x, y, r, color = '#fff') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  switch (kind) {
    case 'heart':
      ctx.moveTo(0, r * 0.85);
      ctx.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.55, -r * 1.05, 0, -r * 0.4);
      ctx.bezierCurveTo(r * 0.55, -r * 1.05, r * 1.3, -r * 0.1, 0, r * 0.85);
      break;
    case 'drop':
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.9, -r * 0.1, r * 0.8, r * 0.9, 0, r * 0.9);
      ctx.bezierCurveTo(-r * 0.8, r * 0.9, -r * 0.9, -r * 0.1, 0, -r);
      break;
    case 'star':
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rad = k % 2 ? r * 0.45 : r;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      break;
    case 'leaf':
      ctx.moveTo(-r * 0.8, r * 0.8);
      ctx.quadraticCurveTo(-r, -r, r * 0.85, -r * 0.85);
      ctx.quadraticCurveTo(r, r * 0.9, -r * 0.8, r * 0.8);
      break;
    case 'moon':
      ctx.arc(0, 0, r, 0.6, Math.PI * 2 - 0.6, false);
      ctx.arc(r * 0.45, 0, r * 0.72, Math.PI * 2 - 1.1, 1.1, true);
      break;
    case 'sun':
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = 'round';
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.moveTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
      ctx.restore();
      return;
    default:
      ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function badge(ctx, color, x, y, r) {
  blob(ctx, x, y + r * 0.12, r * 1.08, 'rgba(0,0,0,0.18)');
  blob(ctx, x, y, r * 1.08, '#fff');
  blob(ctx, x, y, r * 0.9, COLOR_HEX[color]);
  drawSymbol(ctx, COLOR_SYMBOL[color], x, y, r * 0.55, '#fff');
}

// ---------------------------------------------------------------- scenery

export function drawScenery(ctx, s, kind, seed, theme, around) {
  const T = THEMES[theme] || THEMES.meadow;
  const r1 = hash(seed, 1), r2 = hash(seed, 2), r3 = hash(seed, 3);
  ctx.save();
  switch (kind) {
    case 'tree': {
      const cx = s * (0.45 + r1 * 0.1), cy = s * (0.48 + r2 * 0.08);
      ctx.fillStyle = 'rgba(30, 50, 20, 0.22)';
      ctx.beginPath(); ctx.ellipse(cx + s * 0.06, cy + s * 0.2, s * 0.32, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a5a34';
      rr(ctx, cx - s * 0.05, cy, s * 0.1, s * 0.22, s * 0.04); ctx.fill();
      const leaf = T.leaf;
      blob(ctx, cx - s * 0.13, cy - s * 0.02, s * 0.2, leaf[2]);
      blob(ctx, cx + s * 0.13, cy, s * 0.2, leaf[2]);
      blob(ctx, cx, cy - s * 0.14, s * 0.24, leaf[0]);
      blob(ctx, cx - s * 0.08, cy - s * 0.2, s * 0.13, leaf[1]);
      blob(ctx, cx + s * 0.07, cy - s * 0.07, s * 0.07, 'rgba(255,255,255,0.18)');
      if (r3 > 0.6 && theme !== 'night') {
        blob(ctx, cx + s * 0.1, cy - s * 0.12, s * 0.035, '#ff5f6d');
        blob(ctx, cx - s * 0.12, cy - s * 0.04, s * 0.035, '#ff5f6d');
      }
      break;
    }
    case 'pine': {
      const cx = s * (0.45 + r1 * 0.1), base = s * 0.82;
      ctx.fillStyle = 'rgba(30, 50, 40, 0.2)';
      ctx.beginPath(); ctx.ellipse(cx + s * 0.05, base, s * 0.26, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a4e2c';
      ctx.fillRect(cx - s * 0.04, base - s * 0.12, s * 0.08, s * 0.12);
      const layers = [[0.34, 0.3], [0.27, 0.12], [0.2, -0.05]];
      for (const [w, y] of layers) {
        ctx.fillStyle = T.leaf[2];
        ctx.beginPath();
        ctx.moveTo(cx, s * (y + 0.0));
        ctx.lineTo(cx - s * w, s * (y + 0.42));
        ctx.lineTo(cx + s * w, s * (y + 0.42));
        ctx.closePath();
        ctx.fill();
        if (theme === 'peaks' || theme === 'night') {
          ctx.fillStyle = theme === 'night' ? '#d8e4ff' : '#ffffff';
          ctx.beginPath();
          ctx.moveTo(cx, s * y);
          ctx.lineTo(cx - s * w * 0.42, s * (y + 0.18));
          ctx.lineTo(cx + s * w * 0.42, s * (y + 0.18));
          ctx.closePath();
          ctx.fill();
        }
      }
      break;
    }
    case 'water': {
      const pad = s * 0.02;
      ctx.fillStyle = T.water;
      const n = around || {};
      const x0 = n.w ? 0 : pad + s * 0.06, x1 = n.e ? s : s - pad - s * 0.06;
      const y0 = n.n ? 0 : pad + s * 0.06, y1 = n.s ? s : s - pad - s * 0.06;
      rr(ctx, x0, y0, x1 - x0, y1 - y0, s * 0.18);
      ctx.fill();
      if (n.w) ctx.fillRect(0, y0, s * 0.3, y1 - y0);
      if (n.e) ctx.fillRect(s * 0.7, y0, s * 0.3, y1 - y0);
      if (n.n) ctx.fillRect(x0, 0, x1 - x0, s * 0.3);
      if (n.s) ctx.fillRect(x0, s * 0.7, x1 - x0, s * 0.3);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = s * 0.03;
      ctx.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const wx = s * (0.25 + hash(seed, 10 + k) * 0.4), wy = s * (0.3 + k * 0.32);
        ctx.beginPath();
        ctx.arc(wx, wy, s * 0.08, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
      if (r3 > 0.7) {
        blob(ctx, s * 0.7, s * 0.68, s * 0.09, '#5fb85a');
        blob(ctx, s * 0.73, s * 0.66, s * 0.03, '#ff9ec0');
      }
      break;
    }
    case 'house':
    case 'shop':
    case 'barn': {
      const roofs = kind === 'barn' ? ['#c9433a'] : ['#e8604f', '#4f8fe0', '#f2a33a', '#9a6bd0', '#3fae7a'];
      const roof = roofs[Math.floor(r1 * roofs.length)];
      const x = s * 0.14, y = s * 0.16, w = s * 0.72, h = s * 0.66;
      ctx.fillStyle = 'rgba(40, 30, 20, 0.22)';
      rr(ctx, x + s * 0.05, y + s * 0.08, w, h, s * 0.08); ctx.fill();
      ctx.fillStyle = kind === 'barn' ? '#d65a45' : '#fff4dc';
      rr(ctx, x, y + h * 0.42, w, h * 0.58, s * 0.05); ctx.fill();
      ctx.fillStyle = roof;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.04, y + h * 0.48);
      ctx.lineTo(x + w * 0.5, y);
      ctx.lineTo(x + w + s * 0.04, y + h * 0.48);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w + s * 0.04, y + h * 0.48); ctx.lineTo(x + w * 0.5, y + h * 0.48);
      ctx.closePath(); ctx.fill();
      if (kind === 'barn') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = s * 0.035;
        const dx = x + w * 0.32, dy = y + h * 0.6, dw = w * 0.36, dh = h * 0.4;
        ctx.strokeRect(dx, dy, dw, dh);
        ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + dw, dy + dh); ctx.moveTo(dx + dw, dy); ctx.lineTo(dx, dy + dh); ctx.stroke();
      } else {
        ctx.fillStyle = '#8a5a34';
        rr(ctx, x + w * 0.42, y + h * 0.68, w * 0.18, h * 0.32, s * 0.02); ctx.fill();
        const glow = theme === 'night' ? '#ffd96a' : '#9fd6f5';
        ctx.fillStyle = glow;
        ctx.fillRect(x + w * 0.12, y + h * 0.62, w * 0.18, h * 0.16);
        ctx.fillRect(x + w * 0.7, y + h * 0.62, w * 0.18, h * 0.16);
        if (kind === 'shop') {
          for (let k = 0; k < 6; k++) {
            ctx.fillStyle = k % 2 ? '#fff' : roof;
            ctx.fillRect(x + (w / 6) * k, y + h * 0.42, w / 6, h * 0.12);
          }
        }
      }
      break;
    }
    case 'rock': {
      ctx.fillStyle = 'rgba(30, 30, 30, 0.2)';
      ctx.beginPath(); ctx.ellipse(s * 0.53, s * 0.68, s * 0.3, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      blob(ctx, s * 0.42, s * 0.55, s * 0.2, '#9aa0a8');
      blob(ctx, s * 0.6, s * 0.58, s * 0.16, '#878d96');
      blob(ctx, s * 0.4, s * 0.49, s * 0.08, '#b9bec5');
      break;
    }
    case 'mountain': {
      const n = around || {};
      const base = theme === 'night' ? '#4c5578' : '#a58b74';
      ctx.fillStyle = base;
      const inset = s * 0.05;
      rr(ctx, inset, inset, s - inset * 2, s - inset * 2, s * 0.24);
      ctx.fill();
      // Join up with neighbouring rock so ranges read as one.
      if (n.w) ctx.fillRect(-1, inset, s * 0.5, s - inset * 2);
      if (n.e) ctx.fillRect(s * 0.5, inset, s * 0.5 + 1, s - inset * 2);
      if (n.n) ctx.fillRect(inset, -1, s - inset * 2, s * 0.5);
      if (n.s) ctx.fillRect(inset, s * 0.5, s - inset * 2, s * 0.5 + 1);
      ctx.fillStyle = theme === 'night' ? '#5f6990' : '#bba18a';
      const px = s * (0.42 + r1 * 0.16), py = s * (0.1 + r2 * 0.08);
      ctx.beginPath();
      ctx.moveTo(s * 0.1, s * 0.84);
      ctx.lineTo(px, py);
      ctx.lineTo(s * 0.9, s * 0.84);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(s * 0.9, s * 0.84);
      ctx.lineTo(px + s * 0.08, s * 0.84);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - s * 0.12, py + s * 0.2);
      ctx.lineTo(px - s * 0.04, py + s * 0.16);
      ctx.lineTo(px + s * 0.03, py + s * 0.22);
      ctx.lineTo(px + s * 0.12, py + s * 0.19);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'flowers': {
      const cols = ['#ff7aa2', '#ffd24a', '#ffffff', '#b58cff', '#ff9a4a'];
      for (let k = 0; k < 9; k++) {
        const fx = s * (0.15 + hash(seed, 20 + k) * 0.7), fy = s * (0.15 + hash(seed, 40 + k) * 0.7);
        const c = cols[Math.floor(hash(seed, 60 + k) * cols.length)];
        for (let p = 0; p < 5; p++) {
          const a = (p * Math.PI * 2) / 5;
          blob(ctx, fx + Math.cos(a) * s * 0.035, fy + Math.sin(a) * s * 0.035, s * 0.03, c);
        }
        blob(ctx, fx, fy, s * 0.022, '#f7c531');
      }
      break;
    }
    case 'lamp': {
      ctx.fillStyle = 'rgba(30, 30, 30, 0.2)';
      ctx.beginPath(); ctx.ellipse(s * 0.55, s * 0.78, s * 0.14, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      if (theme === 'night') {
        const g = ctx.createRadialGradient(s * 0.5, s * 0.35, 0, s * 0.5, s * 0.35, s * 0.5);
        g.addColorStop(0, 'rgba(255, 220, 120, 0.55)');
        g.addColorStop(1, 'rgba(255, 220, 120, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
      }
      ctx.fillStyle = '#3d4256';
      ctx.fillRect(s * 0.47, s * 0.38, s * 0.06, s * 0.4);
      rr(ctx, s * 0.38, s * 0.22, s * 0.24, s * 0.2, s * 0.05);
      ctx.fill();
      blob(ctx, s * 0.5, s * 0.32, s * 0.07, '#ffe27a');
      break;
    }
    default:
      blob(ctx, s / 2, s / 2, s * 0.2, '#888');
  }
  ctx.restore();
}

// ---------------------------------------------------------------- buildings

// Engine shed: a little barn-roofed shed, its door facing the exit.
export function drawDepot(ctx, s, dir, colors) {
  drawTrack(ctx, s, [[opposite(dir), dir]], { fixed: true });
  const body = COLOR_HEX[colors[0]], dark = COLOR_DARK[colors[0]];
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate([-Math.PI / 2, 0, Math.PI / 2, Math.PI][dir]);
  // Now the exit points to +x. Shadow, walls, then a two-sided roof.
  ctx.fillStyle = 'rgba(30, 20, 10, 0.25)';
  rr(ctx, -s * 0.44, -s * 0.36, s * 0.78, s * 0.8, s * 0.1); ctx.fill();
  ctx.fillStyle = '#f6ead2';
  rr(ctx, -s * 0.47, -s * 0.42, s * 0.78, s * 0.84, s * 0.1); ctx.fill();
  ctx.fillStyle = body;
  rr(ctx, -s * 0.47, -s * 0.44, s * 0.66, s * 0.44, s * 0.08); ctx.fill();
  ctx.fillStyle = dark;
  rr(ctx, -s * 0.47, 0, s * 0.66, s * 0.44, s * 0.08); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (let k = 0; k < 4; k++) ctx.fillRect(-s * 0.43 + k * s * 0.16, -s * 0.42, s * 0.03, s * 0.4);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let k = 0; k < 4; k++) ctx.fillRect(-s * 0.43 + k * s * 0.16, s * 0.02, s * 0.03, s * 0.4);
  ctx.fillStyle = '#fff6e0';
  ctx.fillRect(-s * 0.47, -s * 0.025, s * 0.66, s * 0.05);
  // Door frame and dark opening at the front.
  ctx.fillStyle = '#fff6e0';
  rr(ctx, s * 0.17, -s * 0.3, s * 0.12, s * 0.6, s * 0.05); ctx.fill();
  ctx.fillStyle = '#3a2a22';
  rr(ctx, s * 0.2, -s * 0.23, s * 0.12, s * 0.46, s * 0.04); ctx.fill();
  ctx.restore();
  // Queue badges along the roof.
  const n = colors.length;
  const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][dir];
  colors.forEach((c, k) => {
    const off = (k - (n - 1) / 2) * s * 0.22;
    const bx = s / 2 - Math.cos(ang) * s * 0.16 - Math.sin(ang) * off;
    const by = s / 2 - Math.sin(ang) * s * 0.16 + Math.cos(ang) * off;
    badge(ctx, c, bx, by, s * (n > 2 ? 0.095 : 0.115));
  });
}

// The front of an engine peeking out of its shed door, facing +x.
export function drawPeek(ctx, s, color) {
  ctx.fillStyle = COLOR_DARK[color];
  rr(ctx, -s * 0.2, -s * 0.15, s * 0.3, s * 0.3, s * 0.12); ctx.fill();
  ctx.fillStyle = COLOR_HEX[color];
  rr(ctx, -s * 0.19, -s * 0.135, s * 0.28, s * 0.27, s * 0.11); ctx.fill();
  plate(ctx, s, s * 0.1, s * 0.14, '#eceaf0');
}

export function drawStation(ctx, s, cell) {
  drawPiece(ctx, s, { t: 'S', v: cell.v }, { fixed: true });
  const vertical = cell.v === 0;
  ctx.save();
  if (vertical) { ctx.translate(s, 0); ctx.rotate(Math.PI / 2); ctx.translate(0, s * 0.02); }
  else ctx.translate(0, s * 0.04);
  // Platform along the top side (in the rotated frame).
  ctx.fillStyle = 'rgba(30, 20, 10, 0.2)';
  rr(ctx, s * 0.06, s * 0.03, s * 0.88, s * 0.24, s * 0.05); ctx.fill();
  ctx.fillStyle = '#efe1c8';
  rr(ctx, s * 0.04, 0, s * 0.92, s * 0.22, s * 0.05); ctx.fill();
  ctx.fillStyle = '#d8c39f';
  ctx.fillRect(s * 0.04, s * 0.18, s * 0.92, s * 0.04);
  // Canopy.
  ctx.fillStyle = COLOR_HEX[cell.color];
  rr(ctx, s * 0.12, -s * 0.04, s * 0.76, s * 0.14, s * 0.05); ctx.fill();
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = k % 2 ? '#fff' : COLOR_DARK[cell.color];
    ctx.fillRect(s * (0.14 + k * 0.144), s * 0.08, s * 0.144, s * 0.035);
  }
  ctx.restore();
  // Sign.
  const bx = vertical ? s * 0.86 : s * 0.5, by = vertical ? s * 0.5 : s * 0.13;
  badge(ctx, cell.color, bx, by, s * 0.12);
}

export function drawPaintShed(ctx, s, cell) {
  drawPiece(ctx, s, { t: 'S', v: cell.v }, { fixed: true });
  ctx.save();
  ctx.translate(s / 2, s / 2);
  if (cell.v === 1) ctx.rotate(Math.PI / 2);
  // Track runs up/down here; arch posts left and right.
  const c = COLOR_HEX[cell.color];
  ctx.fillStyle = 'rgba(30,20,10,0.22)';
  rr(ctx, -s * 0.44, -s * 0.2, s * 0.9, s * 0.44, s * 0.08); ctx.fill();
  ctx.fillStyle = c;
  rr(ctx, -s * 0.46, -s * 0.24, s * 0.92, s * 0.18, s * 0.08); ctx.fill();
  rr(ctx, -s * 0.46, -s * 0.24, s * 0.16, s * 0.46, s * 0.06); ctx.fill();
  rr(ctx, s * 0.3, -s * 0.24, s * 0.16, s * 0.46, s * 0.06); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  rr(ctx, -s * 0.42, -s * 0.22, s * 0.84, s * 0.05, s * 0.03); ctx.fill();
  // Drips.
  ctx.fillStyle = c;
  for (const dx of [-0.2, -0.05, 0.12]) {
    rr(ctx, s * dx, -s * 0.08, s * 0.05, s * (0.08 + Math.abs(dx) * 0.3), s * 0.025); ctx.fill();
  }
  // Bucket.
  ctx.fillStyle = '#e9edf2';
  rr(ctx, s * 0.32, s * 0.26, s * 0.14, s * 0.14, s * 0.03); ctx.fill();
  ctx.fillStyle = c;
  ctx.fillRect(s * 0.32, s * 0.26, s * 0.14, s * 0.04);
  ctx.restore();
}

export function drawPortal(ctx, s, cell, theme) {
  const m = cell.mouth;
  drawTrack(ctx, s, [[m, opposite(m)]], { fixed: true });
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate([-Math.PI / 2, 0, Math.PI / 2, Math.PI][m]);
  // Mouth faces +x. The hill covers the back half.
  const rock = theme === 'night' ? '#4c5578' : '#a58b74';
  const rock2 = theme === 'night' ? '#5f6990' : '#bba18a';
  ctx.fillStyle = rock;
  rr(ctx, -s * 0.56, -s * 0.5, s * 0.74, s * 1.0, s * 0.2); ctx.fill();
  ctx.fillStyle = rock2;
  rr(ctx, -s * 0.5, -s * 0.44, s * 0.5, s * 0.88, s * 0.2); ctx.fill();
  // Stone arch and dark opening.
  ctx.fillStyle = '#d9cfc2';
  rr(ctx, s * 0.02, -s * 0.31, s * 0.14, s * 0.62, s * 0.06); ctx.fill();
  ctx.fillStyle = '#20160f';
  rr(ctx, s * 0.06, -s * 0.24, s * 0.1, s * 0.48, s * 0.04); ctx.fill();
  ctx.restore();
  // Tunnel number.
  const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][m];
  const bx = s / 2 - Math.cos(ang) * s * 0.22, by = s / 2 - Math.sin(ang) * s * 0.22;
  blob(ctx, bx, by, s * 0.11, '#fff');
  ctx.fillStyle = '#5a4636';
  ctx.font = `800 ${Math.round(s * 0.15)}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cell.pair, bx, by + s * 0.01);
}

// ------------------------------------------------------------------ trains

// Each skin draws a loco facing +x, centred at 0,0, roughly 0.66s long and
// 0.42s wide. body = route colour.
const SKIN_DRAW = {
  puffer(ctx, s, body, dark) {
    // Cab with a cream roof.
    ctx.fillStyle = dark;
    rr(ctx, -s * 0.4, -s * 0.215, s * 0.3, s * 0.43, s * 0.07); ctx.fill();
    ctx.fillStyle = '#fff4dc';
    rr(ctx, -s * 0.37, -s * 0.18, s * 0.24, s * 0.36, s * 0.06); ctx.fill();
    // Boiler.
    ctx.fillStyle = dark;
    rr(ctx, -s * 0.13, -s * 0.155, s * 0.42, s * 0.31, s * 0.15); ctx.fill();
    ctx.fillStyle = body;
    rr(ctx, -s * 0.12, -s * 0.14, s * 0.4, s * 0.28, s * 0.14); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    rr(ctx, -s * 0.09, -s * 0.11, s * 0.3, s * 0.06, s * 0.03); ctx.fill();
    ctx.fillStyle = '#f4c542';
    ctx.fillRect(-s * 0.005, -s * 0.15, s * 0.025, s * 0.3);
    blob(ctx, -s * 0.07, 0, s * 0.05, '#f4c542');
    blob(ctx, -s * 0.07, -s * 0.015, s * 0.022, '#fff1b3');
    // Chimney.
    blob(ctx, s * 0.09, 0, s * 0.075, '#2a2724');
    blob(ctx, s * 0.09, 0, s * 0.05, '#4d4642');
    blob(ctx, s * 0.09, 0, s * 0.028, '#151312');
    plate(ctx, s, s * 0.3, s * 0.15, '#eceaf0');
  },
  bullet(ctx, s, body, dark) {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-s * 0.33, -s * 0.17);
    ctx.lineTo(s * 0.12, -s * 0.17);
    ctx.quadraticCurveTo(s * 0.36, -s * 0.14, s * 0.36, 0);
    ctx.quadraticCurveTo(s * 0.36, s * 0.14, s * 0.12, s * 0.17);
    ctx.lineTo(-s * 0.33, s * 0.17);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-s * 0.33, -s * 0.03, s * 0.5, s * 0.06);
    ctx.fillStyle = '#2b3550';
    rr(ctx, s * 0.1, -s * 0.11, s * 0.12, s * 0.22, s * 0.06); ctx.fill();
    ctx.fillStyle = dark;
    ctx.fillRect(-s * 0.33, -s * 0.17, s * 0.06, s * 0.34);
    eyes(ctx, s, s * 0.27, s * 0.08);
  },
  wooden(ctx, s, body, dark) {
    ctx.fillStyle = '#e7c08a';
    rr(ctx, -s * 0.34, -s * 0.19, s * 0.66, s * 0.38, s * 0.05); ctx.fill();
    ctx.fillStyle = body;
    rr(ctx, -s * 0.3, -s * 0.16, s * 0.22, s * 0.32, s * 0.04); ctx.fill();
    rr(ctx, -s * 0.04, -s * 0.13, s * 0.32, s * 0.26, s * 0.04); ctx.fill();
    blob(ctx, s * 0.12, 0, s * 0.075, '#e7c08a');
    blob(ctx, s * 0.12, 0, s * 0.05, dark);
    plate(ctx, s, s * 0.3, s * 0.13, '#f3dcb4');
    ctx.strokeStyle = 'rgba(140, 90, 40, 0.5)';
    ctx.lineWidth = s * 0.015;
    for (const y of [-0.1, 0, 0.1]) { ctx.beginPath(); ctx.moveTo(-s * 0.32, s * y); ctx.lineTo(-s * 0.3, s * y); ctx.stroke(); }
  },
  ladybug(ctx, s, body, dark) {
    ctx.fillStyle = '#2a2a2a';
    blob(ctx, s * 0.22, 0, s * 0.12, '#2a2a2a');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-s * 0.04, 0, s * 0.3, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = s * 0.025;
    ctx.beginPath(); ctx.moveTo(-s * 0.34, 0); ctx.lineTo(s * 0.26, 0); ctx.stroke();
    for (const [x, y] of [[-0.18, -0.09], [-0.02, -0.11], [-0.16, 0.1], [0.02, 0.09], [0.12, -0.05]]) blob(ctx, s * x, s * y, s * 0.035, '#2a2a2a');
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = s * 0.02;
    for (const k of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 0.3, k * s * 0.05); ctx.quadraticCurveTo(s * 0.38, k * s * 0.08, s * 0.38, k * s * 0.15); ctx.stroke();
      blob(ctx, s * 0.38, k * s * 0.15, s * 0.025, '#2a2a2a');
    }
    void dark;
  },
  duck(ctx, s, body, dark) {
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-s * 0.08, 0, s * 0.27, s * 0.19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(-s * 0.12, -s * 0.03, s * 0.14, s * 0.08, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-s * 0.12, s * 0.03, s * 0.14, s * 0.08, 0.3, 0, Math.PI * 2); ctx.fill();
    blob(ctx, s * 0.2, 0, s * 0.12, '#ffe066');
    ctx.fillStyle = '#ff9a2e';
    ctx.beginPath(); ctx.ellipse(s * 0.33, 0, s * 0.07, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  },
  rocket(ctx, s, body, dark) {
    ctx.fillStyle = dark;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, k * s * 0.12); ctx.lineTo(-s * 0.36, k * s * 0.24); ctx.lineTo(-s * 0.32, k * s * 0.1);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#f2f4f8';
    ctx.beginPath();
    ctx.moveTo(-s * 0.32, -s * 0.14);
    ctx.lineTo(s * 0.12, -s * 0.15);
    ctx.quadraticCurveTo(s * 0.38, 0, s * 0.12, s * 0.15);
    ctx.lineTo(-s * 0.32, s * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = body;
    ctx.fillRect(-s * 0.2, -s * 0.15, s * 0.12, s * 0.3);
    ctx.beginPath(); ctx.moveTo(s * 0.18, -s * 0.11); ctx.quadraticCurveTo(s * 0.38, 0, s * 0.18, s * 0.11); ctx.closePath(); ctx.fill();
    blob(ctx, s * 0.04, 0, s * 0.06, '#7fd0ff');
    blob(ctx, s * 0.04, 0, s * 0.035, '#ffffff');
  },
  tinker(ctx, s, body, dark) {
    ctx.fillStyle = '#b9c2cf';
    rr(ctx, -s * 0.33, -s * 0.19, s * 0.64, s * 0.38, s * 0.04); ctx.fill();
    ctx.fillStyle = body;
    rr(ctx, -s * 0.3, -s * 0.16, s * 0.58, s * 0.32, s * 0.03); ctx.fill();
    ctx.fillStyle = '#e6ebf2';
    for (const [x, y] of [[-0.25, -0.11], [-0.25, 0.11], [0.23, -0.11], [0.23, 0.11]]) blob(ctx, s * x, s * y, s * 0.025, '#e6ebf2');
    ctx.strokeStyle = dark;
    ctx.lineWidth = s * 0.02;
    ctx.beginPath(); ctx.moveTo(-s * 0.05, 0); ctx.lineTo(-s * 0.05, -s * 0.0); ctx.stroke();
    blob(ctx, s * 0.0, 0, s * 0.07, '#2b3550');
    blob(ctx, s * 0.0, 0, s * 0.04, '#7cf0c9');
    blob(ctx, -s * 0.18, 0, s * 0.035, '#ff5a5a');
  },
  whale(ctx, s, body, dark) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-s * 0.26, 0);
    ctx.lineTo(-s * 0.38, -s * 0.14);
    ctx.quadraticCurveTo(-s * 0.32, 0, -s * 0.38, s * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(s * 0.02, 0, s * 0.32, s * 0.19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.ellipse(s * 0.04, s * 0.08, s * 0.22, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    blob(ctx, s * 0.08, -s * 0.0, s * 0.03, '#204060');
  },
  dragon(ctx, s, body, dark) {
    ctx.fillStyle = dark;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, k * s * 0.12);
      ctx.quadraticCurveTo(-s * 0.2, k * s * 0.34, -s * 0.3, k * s * 0.18);
      ctx.lineTo(-s * 0.22, k * s * 0.12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = body;
    rr(ctx, -s * 0.33, -s * 0.15, s * 0.58, s * 0.3, s * 0.14); ctx.fill();
    ctx.fillStyle = '#ffd34a';
    for (let k = 0; k < 4; k++) {
      const x = -s * 0.24 + k * s * 0.13;
      ctx.beginPath(); ctx.moveTo(x, -s * 0.03); ctx.lineTo(x + s * 0.05, 0); ctx.lineTo(x, s * 0.03); ctx.closePath(); ctx.fill();
    }
    blob(ctx, s * 0.27, 0, s * 0.1, body);
    blob(ctx, s * 0.33, -s * 0.04, s * 0.02, '#2a2a2a');
    blob(ctx, s * 0.33, s * 0.04, s * 0.02, '#2a2a2a');
  },
  moon(ctx, s, body, dark) {
    SKIN_DRAW.puffer(ctx, s, body, dark);
    drawSymbol(ctx, 'moon', s * 0.0, -s * 0.0, s * 0.06, '#fff6c2');
  },
  gold(ctx, s, body, dark) {
    SKIN_DRAW.puffer(ctx, s, body, dark);
    ctx.strokeStyle = '#ffd34a';
    ctx.lineWidth = s * 0.03;
    rr(ctx, -s * 0.12, -s * 0.14, s * 0.4, s * 0.28, s * 0.14); ctx.stroke();
    drawSymbol(ctx, 'star', s * 0.02, 0, s * 0.06, '#ffd34a');
  },
  rainbow(ctx, s, body, dark) {
    ctx.fillStyle = dark;
    rr(ctx, -s * 0.33, -s * 0.2, s * 0.24, s * 0.4, s * 0.06); ctx.fill();
    const bands = ['#ff5a5a', '#ffa53a', '#ffe14a', '#5ad06a', '#4aa8ff', '#9a6bff'];
    ctx.save();
    rr(ctx, -s * 0.12, -s * 0.15, s * 0.42, s * 0.3, s * 0.14);
    ctx.clip();
    bands.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(-s * 0.12, -s * 0.15 + k * s * 0.05, s * 0.42, s * 0.05); });
    ctx.restore();
    ctx.fillStyle = body;
    rr(ctx, -s * 0.29, -s * 0.11, s * 0.12, s * 0.22, s * 0.03); ctx.fill();
    blob(ctx, s * 0.14, 0, s * 0.07, '#33302e');
  },
};

// The round smokebox at the front with a friendly face.
function plate(ctx, s, x, r, color) {
  blob(ctx, x + s * 0.01, s * 0.012, r * 1.06, 'rgba(0,0,0,0.25)');
  blob(ctx, x, 0, r, color);
  blob(ctx, x - r * 0.25, -r * 0.3, r * 0.35, 'rgba(255,255,255,0.6)');
  eyes(ctx, s, x + r * 0.15, r * 0.42, r);
}

function eyes(ctx, s, x, gap, r = s * 0.15) {
  const er = r * 0.24;
  for (const k of [-1, 1]) {
    blob(ctx, x, k * gap, er, '#fff');
    blob(ctx, x + er * 0.35, k * gap, er * 0.62, '#222');
    blob(ctx, x + er * 0.5, k * gap - er * 0.25, er * 0.22, '#fff');
  }
  ctx.strokeStyle = '#222';
  ctx.lineWidth = Math.max(1, r * 0.11);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x - r * 0.15, 0, r * 0.5, -0.75, 0.75);
  ctx.stroke();
  blob(ctx, x - r * 0.18, -gap * 1.45, r * 0.13, 'rgba(255, 110, 140, 0.6)');
  blob(ctx, x - r * 0.18, gap * 1.45, r * 0.13, 'rgba(255, 110, 140, 0.6)');
}

export function drawLoco(ctx, s, skin, color) {
  const body = COLOR_HEX[color], dark = COLOR_DARK[color];
  // Shadow and wheels.
  ctx.fillStyle = 'rgba(20, 20, 20, 0.25)';
  rr(ctx, -s * 0.32, -s * 0.18, s * 0.68, s * 0.42, s * 0.12); ctx.fill();
  ctx.fillStyle = '#2d2d36';
  for (const x of [-0.25, 0.0, 0.2]) {
    rr(ctx, s * (x - 0.06), -s * 0.25, s * 0.12, s * 0.06, s * 0.025); ctx.fill();
    rr(ctx, s * (x - 0.06), s * 0.19, s * 0.12, s * 0.06, s * 0.025); ctx.fill();
  }
  (SKIN_DRAW[skin] || SKIN_DRAW.puffer)(ctx, s, body, dark);
  if (['rocket', 'tinker', 'rainbow'].includes(skin)) plate(ctx, s, s * 0.3, s * 0.13, '#eceaf0');
  if (skin === 'duck' || skin === 'whale' || skin === 'ladybug' || skin === 'dragon') eyes(ctx, s, skin === 'duck' ? s * 0.22 : skin === 'whale' ? s * 0.2 : s * 0.25, s * 0.06, s * 0.1);
  // Buffer bar.
  ctx.fillStyle = '#d33b3b';
  rr(ctx, -s * 0.37, -s * 0.12, s * 0.04, s * 0.24, s * 0.02); ctx.fill();
  // Route symbol on the roof so colour isn't the only cue.
  badge(ctx, color, -s * 0.25, 0, s * 0.085);
}

const SKIN_TINT = ['#ffd6a5', '#c9f2c7', '#bde0fe', '#ffc8dd', '#fdffb6', '#e2c2ff'];
export function drawCarriage(ctx, s, color, passengers = 2, seed = 0) {
  const body = COLOR_HEX[color], dark = COLOR_DARK[color];
  ctx.fillStyle = 'rgba(20, 20, 20, 0.22)';
  rr(ctx, -s * 0.22, -s * 0.15, s * 0.48, s * 0.36, s * 0.08); ctx.fill();
  ctx.fillStyle = '#2d2d36';
  for (const x of [-0.12, 0.12]) {
    rr(ctx, s * (x - 0.05), -s * 0.21, s * 0.1, s * 0.045, s * 0.02); ctx.fill();
    rr(ctx, s * (x - 0.05), s * 0.165, s * 0.1, s * 0.045, s * 0.02); ctx.fill();
  }
  ctx.fillStyle = dark;
  rr(ctx, -s * 0.24, -s * 0.18, s * 0.48, s * 0.36, s * 0.07); ctx.fill();
  ctx.fillStyle = body;
  rr(ctx, -s * 0.21, -s * 0.15, s * 0.42, s * 0.3, s * 0.05); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  rr(ctx, -s * 0.18, -s * 0.12, s * 0.36, s * 0.24, s * 0.04); ctx.fill();
  for (let k = 0; k < passengers; k++) {
    const x = (k - (passengers - 1) / 2) * s * 0.16;
    const skinTone = SKIN_TINT[Math.floor(hash(seed * 7 + k, 5) * SKIN_TINT.length)];
    const hat = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc'][Math.floor(hash(seed * 7 + k, 9) * 5)];
    blob(ctx, x, 0, s * 0.075, skinTone);
    ctx.fillStyle = hat;
    ctx.beginPath(); ctx.arc(x - s * 0.01, 0, s * 0.075, Math.PI * 0.6, Math.PI * 1.4); ctx.closePath(); ctx.fill();
    blob(ctx, x + s * 0.035, -s * 0.03, s * 0.012, '#222');
    blob(ctx, x + s * 0.035, s * 0.03, s * 0.012, '#222');
  }
}

// A soft steam puff sprite (white, drawn once).
export function puffSprite(size) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(250,251,253,0.95)');
  grad.addColorStop(0.72, 'rgba(178,190,206,0.75)');
  grad.addColorStop(1, 'rgba(178,190,206,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Bake a loco or carriage, facing east, into a canvas with a margin.
export const TRAIN_SCALE = 1.24;
export function bakeTrain(kind, skin, color, s, seed = 0) {
  const k = s * TRAIN_SCALE;
  const w = Math.ceil(k * 0.9), h = Math.ceil(k * 0.64);
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.translate(w / 2, h / 2);
  if (kind === 'loco') drawLoco(g, k, skin, color);
  else drawCarriage(g, k, color, 2, seed);
  return c;
}

// A thumbnail for the Train Shed: loco and carriage side by side.
export function drawShedThumb(canvas, skin, color, locked) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const s = Math.min(W / 1.45, H * 1.45);
  g.save();
  g.translate(W * 0.64 - s * 0.72, H / 2);
  drawCarriage(g, s, color, 2, 3);
  g.restore();
  g.save();
  g.translate(W * 0.64, H / 2);
  drawLoco(g, s, skin, color);
  g.restore();
  if (locked) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#3d4466';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = `900 ${Math.round(H * 0.42)}px ui-rounded, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', W * 0.64, H * 0.53);
  }
}

export { COLOR_HEX, COLOR_DARK, openEdges };
