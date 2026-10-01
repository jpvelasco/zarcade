// Hand-drawn doodle art as SVG strings. DOM-free and deterministic: the same
// id and frame always give the same drawing. Monsters and heroes come in
// three "line boil" frames that the page cycles for the wobbly look.
import { MONSTER, HERO } from './data.js';
import { hashString, makeRng, next } from './rng.js';

export const INK = '#2d2a32';
export const BOIL_FRAMES = 3;

const f1 = (n) => Math.round(n * 10) / 10;
const jit = (rng, a) => (next(rng) - 0.5) * 2 * a;

// ------------------------------------------------------------ primitives

// Smooth closed or open path through points (Catmull-Rom as cubic Béziers).
export function smooth(pts, closed = true) {
  const n = pts.length;
  if (n < 2) return '';
  const p = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f1(c1x)} ${f1(c1y)} ${f1(c2x)} ${f1(c2y)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

function poly(pts, closed = true) {
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${f1(pts[i][0])} ${f1(pts[i][1])}`;
  return closed ? `${d}Z` : d;
}

function wobble(rng, pts, a) {
  return pts.map(([x, y]) => [x + jit(rng, a), y + jit(rng, a)]);
}

export function ellipsePts(cx, cy, rx, ry, n = 12, start = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = start + (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return pts;
}

function rrectPts(x, y, w, h, r) {
  return [
    [x + r, y], [x + w / 2, y], [x + w - r, y], [x + w, y + r], [x + w, y + h / 2], [x + w, y + h - r],
    [x + w - r, y + h], [x + w / 2, y + h], [x + r, y + h], [x, y + h - r], [x, y + h / 2], [x, y + r],
  ];
}

const sp = (d, color, w, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

// A filled crayon shape: flat colour, a hatch of lighter strokes, and a
// doubled wobbly outline that slightly overshoots where it closes.
export function crayonShape(rng, pts, { fill = null, color = INK, w = 4, wob = 2.2, smoothIt = true, hatch = true, outline = true } = {}) {
  let out = '';
  const make = (p, closed) => (smoothIt ? smooth(p, closed) : poly(p, closed));
  if (fill) {
    const d = make(wobble(rng, pts, wob * 0.5), true);
    out += `<path d="${d}" fill="${fill}"/>`;
    if (hatch) out += `<path d="${d}" fill="url(#cq-hatch)"/>`;
  }
  if (outline) {
    const a = wobble(rng, pts, wob);
    a.push([a[0][0] + jit(rng, 3), a[0][1] + jit(rng, 3)]);
    out += sp(make(a, false), color, w);
    const b = wobble(rng, pts, wob * 1.3);
    out += sp(make(b, true), color, Math.max(1, w * 0.45), ' opacity=".55"');
  }
  return out;
}

// An open crayon line through points.
export function crayonLine(rng, pts, color = INK, w = 4, wob = 1.8, smoothIt = true) {
  const make = (p) => (smoothIt ? smooth(p, false) : poly(p, false));
  return sp(make(wobble(rng, pts, wob)), color, w) + sp(make(wobble(rng, pts, wob * 1.3)), color, Math.max(1, w * 0.4), ' opacity=".5"');
}

function line(rng, x1, y1, x2, y2, color = INK, w = 4) {
  const mx = (x1 + x2) / 2 + jit(rng, 2), my = (y1 + y2) / 2 + jit(rng, 2);
  return crayonLine(rng, [[x1, y1], [mx, my], [x2, y2]], color, w);
}

function dot(rng, x, y, r, fill) {
  return `<circle cx="${f1(x + jit(rng, 0.6))}" cy="${f1(y + jit(rng, 0.6))}" r="${f1(r)}" fill="${fill}"/>`;
}

function star(cx, cy, r, points = 5, inner = 0.45) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const t = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]);
  }
  return pts;
}

// Shared <defs> used by every inline doodle: hatch textures.
export const DEFS = `<defs>
<pattern id="cq-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><rect width="9" height="9" fill="none"/><line x1="2" y1="0" x2="2" y2="9" stroke="#fff" stroke-opacity=".22" stroke-width="2.6"/><line x1="6.5" y1="0" x2="6.5" y2="9" stroke="#000" stroke-opacity=".06" stroke-width="1.4"/></pattern>
<pattern id="cq-shade" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><line x1="2" y1="0" x2="2" y2="7" stroke="#2d2a32" stroke-opacity=".2" stroke-width="1.6"/></pattern>
</defs>`;

// Darken or lighten a #rrggbb colour.
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ------------------------------------------------------------ faces

function eyes(rng, fx, fy, s, count, look = 0) {
  let out = '';
  const xs = count === 1 ? [0] : count === 2 ? [-14, 14] : [-20, 0, 20];
  for (const dx of xs) {
    const r = (count === 1 ? 13 : 9.5) * s;
    const x = fx + dx * s, y = fy + (count === 3 && dx === 0 ? -8 * s : 0);
    out += crayonShape(rng, ellipsePts(x, y, r, r * 1.08, 9), { fill: '#fff', w: 2.6 * s, wob: 1, hatch: false });
    out += dot(rng, x + look * r * 0.35 + jit(rng, 1.2), y + r * 0.15 + jit(rng, 1), r * 0.45, INK);
    out += dot(rng, x + look * r * 0.35 - r * 0.12, y - r * 0.1, r * 0.15, '#fff');
  }
  return out;
}

function mouth(rng, kind, fx, fy, s) {
  const w = 16 * s;
  const y = fy + 22 * s;
  switch (kind) {
    case 'grin':
      return crayonLine(rng, [[fx - w, y - 3 * s], [fx - w * 0.4, y + 6 * s], [fx + w * 0.4, y + 6 * s], [fx + w, y - 3 * s]], INK, 3.4 * s);
    case 'frown':
      return crayonLine(rng, [[fx - w * 0.8, y + 5 * s], [fx, y - 3 * s], [fx + w * 0.8, y + 5 * s]], INK, 3.4 * s);
    case 'o':
      return crayonShape(rng, ellipsePts(fx, y + 2 * s, 6 * s, 8 * s, 8), { fill: '#7a2f3f', w: 2.6 * s, wob: 0.8, hatch: false });
    case 'line':
      return line(rng, fx - w * 0.7, y, fx + w * 0.7, y, INK, 3.4 * s);
    case 'tongue':
      return crayonLine(rng, [[fx - w * 0.6, y], [fx + w * 0.6, y]], INK, 3 * s) +
        crayonLine(rng, [[fx, y], [fx + 2 * s, y + 10 * s], [fx - 3 * s, y + 15 * s], [fx + 3 * s, y + 15 * s]], '#e53958', 2.6 * s);
    case 'beak':
      return crayonShape(rng, [[fx - 2 * s, y - 14 * s], [fx + 26 * s, y - 6 * s], [fx - 2 * s, y + 2 * s]], { fill: '#ffb300', w: 2.6 * s, smoothIt: false });
    case 'fangs':
      return crayonLine(rng, [[fx - w, y - 2 * s], [fx, y + 5 * s], [fx + w, y - 2 * s]], INK, 3.4 * s) +
        crayonShape(rng, [[fx - 9 * s, y + 1 * s], [fx - 5 * s, y + 11 * s], [fx - 2 * s, y + 3 * s]], { fill: '#fff', w: 2 * s, smoothIt: false, hatch: false }) +
        crayonShape(rng, [[fx + 2 * s, y + 3 * s], [fx + 5 * s, y + 11 * s], [fx + 9 * s, y + 1 * s]], { fill: '#fff', w: 2 * s, smoothIt: false, hatch: false });
    case 'teeth': {
      const pts = [[fx - w, y - 4 * s]];
      for (let i = 0; i <= 6; i++) pts.push([fx - w + (i * 2 * w) / 6, y + (i % 2 ? 2 : 9) * s]);
      return crayonShape(rng, [[fx - w, y - 4 * s], [fx + w, y - 4 * s], [fx + w * 0.7, y + 12 * s], [fx - w * 0.7, y + 12 * s]], { fill: '#5b1f2c', w: 2.8 * s, hatch: false }) +
        crayonLine(rng, pts.slice(1), '#fff', 2.4 * s, 0.8, false);
    }
    default:
      return '';
  }
}

// ------------------------------------------------------------ monsters

// Each body returns its main shape and where the face sits.
const BODIES = {
  blob: (rng) => {
    const pts = ellipsePts(100, 118, 66, 58, 14).map(([x, y], i) => [x + (i % 2 ? 5 : -3), y + (i % 3 ? 0 : -4)]);
    return { pts, face: [100, 104, 1.1], top: 60 };
  },
  rect: () => ({ pts: rrectPts(48, 62, 104, 112, 18), face: [100, 100, 1.1], top: 62, smoothIt: false }),
  circle: () => ({ pts: ellipsePts(100, 112, 56, 54, 12), face: [100, 104, 1.05], top: 58 }),
  ball: (rng) => ({ pts: ellipsePts(100, 112, 62, 60, 13).map(([x, y]) => [x + jit(rng, 7), y + jit(rng, 7)]), face: [100, 104, 1.05], top: 52, smoothIt: false }),
  snake: () => ({ pts: [[56, 70], [120, 62], [150, 92], [118, 116], [70, 120], [56, 150], [100, 176], [160, 170], [160, 186], [90, 190], [36, 160], [52, 106], [120, 100], [128, 84], [64, 88]], face: [94, 76, 0.85], top: 56 }),
  tri: () => ({ pts: [[100, 46], [128, 90], [158, 168], [100, 178], [42, 168], [72, 90]], face: [100, 112, 1.05], top: 46 }),
  dome: () => ({ pts: [[36, 160], [44, 110], [80, 72], [120, 72], [156, 110], [164, 160], [100, 168]], face: [100, 112, 1], top: 72 }),
  crab: () => ({ pts: ellipsePts(100, 128, 72, 44, 14), face: [100, 118, 1], top: 84 }),
  puddle: (rng) => ({ pts: [[30, 172], [36, 140], [62, 118], [78, 84], [102, 66], [126, 86], [140, 118], [168, 140], [174, 172], [100, 180]].map(([x, y]) => [x + jit(rng, 3), y + jit(rng, 3)]), face: [102, 118, 1.05], top: 66 }),
  hydra: () => ({ pts: ellipsePts(100, 146, 62, 38, 12), face: [100, 72, 0.8], top: 40 }),
  bird: () => ({ pts: ellipsePts(96, 118, 58, 46, 12), face: [116, 104, 1], top: 72 }),
  ghost: () => ({ pts: [[56, 176], [50, 110], [70, 64], [100, 52], [130, 64], [150, 110], [144, 176], [130, 162], [116, 178], [100, 162], [84, 178], [70, 162]], face: [100, 102, 1.05], top: 52 }),
  robot: () => ({ pts: rrectPts(52, 78, 96, 100, 10), face: [100, 116, 1], top: 50, smoothIt: false }),
  note: () => ({ pts: [[48, 60], [152, 60], [152, 146], [128, 172], [48, 172]], face: [98, 108, 1.1], top: 60, smoothIt: false }),
  shark: () => ({ pts: [[24, 118], [60, 88], [110, 82], [150, 96], [182, 120], [150, 140], [100, 150], [56, 144]], face: [128, 106, 0.85], top: 60 }),
  cloud: () => {
    const pts = [];
    const bumps = [[100, 64, 34], [140, 84, 28], [160, 124, 26], [130, 160, 30], [80, 164, 30], [44, 128, 28], [58, 84, 28]];
    for (const [x, y, r] of bumps) pts.push(...ellipsePts(x, y, r, r, 5).filter(([px, py]) => Math.hypot(px - 100, py - 116) > 36));
    pts.sort((a, b) => Math.atan2(a[1] - 116, a[0] - 100) - Math.atan2(b[1] - 116, b[0] - 100));
    return { pts, face: [100, 110, 1.2], top: 32 };
  },
};

function extras(rng, art, body, color) {
  const out = { back: '', front: '' };
  const dark = shade(color, -0.35);
  const [fx, fy, s] = body.face;
  for (const ex of art.extras) {
    switch (ex) {
      case 'crown': {
        const y = body.top + 4;
        out.front += crayonShape(rng, [[70, y], [66, y - 34], [84, y - 16], [100, y - 40], [116, y - 16], [134, y - 34], [130, y]], { fill: '#ffc93c', w: 3.2, smoothIt: false });
        out.front += dot(rng, 100, y - 14, 4.5, '#e53958');
        break;
      }
      case 'wings':
        out.back += crayonShape(rng, [[60, 100], [20, 70], [12, 108], [28, 104], [22, 130], [56, 118]], { fill: dark, w: 3, smoothIt: false });
        out.back += crayonShape(rng, [[140, 100], [180, 70], [188, 108], [172, 104], [178, 130], [144, 118]], { fill: dark, w: 3, smoothIt: false });
        break;
      case 'legs':
        out.back += line(rng, 80, 168, 74, 192, INK, 5) + line(rng, 120, 168, 126, 192, INK, 5);
        out.back += line(rng, 66, 192, 82, 192, INK, 5) + line(rng, 118, 192, 134, 192, INK, 5);
        break;
      case 'arms':
        out.back += crayonLine(rng, [[52, 120], [26, 108], [18, 84]], INK, 5) + crayonLine(rng, [[148, 120], [174, 108], [182, 84]], INK, 5);
        out.back += crayonShape(rng, ellipsePts(18, 80, 8, 8, 7), { fill: color, w: 3, hatch: false }) + crayonShape(rng, ellipsePts(182, 80, 8, 8, 7), { fill: color, w: 3, hatch: false });
        break;
      case 'horns':
        out.front += crayonShape(rng, [[82, 58], [70, 22], [94, 50]], { fill: '#fff4d6', w: 3, smoothIt: false }) + crayonShape(rng, [[106, 50], [130, 22], [118, 58]], { fill: '#fff4d6', w: 3, smoothIt: false });
        break;
      case 'tail':
        out.back += crayonLine(rng, [[150, 160], [178, 150], [188, 124], [176, 112]], color, 9) + crayonLine(rng, [[150, 160], [178, 150], [188, 124], [176, 112]], INK, 2.4);
        break;
      case 'spikes':
        for (let i = 0; i < 4; i++) {
          const x = 62 + i * 25;
          out.front += crayonShape(rng, [[x, body.top + 2], [x + 10, body.top - 18], [x + 20, body.top + 2]], { fill: '#d7d7e0', w: 2.6, smoothIt: false });
        }
        break;
      case 'scribbles': {
        const pts = [];
        for (let i = 0; i < 10; i++) pts.push([70 + i * 6 + jit(rng, 4), 150 + (i % 2 ? -12 : 10) + jit(rng, 3)]);
        out.front += crayonLine(rng, pts, dark, 2.6, 1);
        break;
      }
      case 'creases':
        out.front += crayonLine(rng, [[60, 90], [86, 128], [74, 160]], shade(color, -0.25), 2.4, 1.5, false);
        out.front += crayonLine(rng, [[150, 96], [124, 140], [140, 164]], shade(color, -0.25), 2.4, 1.5, false);
        break;
      case 'drips':
        for (const [x, y, h] of [[62, 160, 22], [132, 164, 16], [100, 170, 12]]) {
          out.front += crayonShape(rng, [[x - 5, y], [x + 5, y], [x + 4, y + h], [x, y + h + 6], [x - 4, y + h]], { fill: color, w: 2.4, hatch: false });
        }
        break;
      case 'ears':
        out.back += crayonShape(rng, [[66, 100], [22, 82], [62, 126]], { fill: color, w: 3, smoothIt: false }) + crayonShape(rng, [[134, 100], [178, 82], [138, 126]], { fill: color, w: 3, smoothIt: false });
        break;
      case 'nose':
        out.front += crayonShape(rng, ellipsePts(fx, fy + 12, 10, 7, 8), { fill: '#ff8fb1', w: 2.6, hatch: false });
        break;
      case 'shell':
        out.front += crayonLine(rng, [[60, 120], [100, 94], [140, 120]], dark, 3) + crayonLine(rng, [[78, 82], [100, 94], [122, 82]], dark, 3);
        break;
      case 'claws':
        out.back += crayonShape(rng, [[40, 112], [10, 86], [16, 62], [34, 82], [26, 96], [48, 104]], { fill: color, w: 3 });
        out.back += crayonShape(rng, [[160, 112], [190, 86], [184, 62], [166, 82], [174, 96], [152, 104]], { fill: color, w: 3 });
        break;
      case 'heads':
        for (const [x, y, k] of [[48, 72, -1], [100, 52, 0], [152, 72, 1]]) {
          out.back += crayonLine(rng, [[100 + k * 20, 140], [100 + k * 34, 110], [x, y + 18]], color, 18) + crayonLine(rng, [[100 + k * 20, 140], [100 + k * 34, 110], [x, y + 18]], INK, 2.4);
          out.front += crayonShape(rng, ellipsePts(x, y, 24, 20, 10), { fill: color, w: 3.4 });
          if (k !== 0) out.front += eyes(rng, x, y - 2, 0.6, 2) + mouth(rng, 'grin', x, y - 4, 0.6);
        }
        break;
      case 'sparkles':
        for (const [x, y, r] of [[30, 60, 9], [172, 52, 7], [168, 160, 8]]) out.front += crayonShape(rng, star(x, y, r, 4, 0.35), { fill: '#fff176', w: 2, smoothIt: false, hatch: false });
        break;
      case 'antenna':
        out.back += line(rng, 100, 78, 100, 44, INK, 4) + crayonShape(rng, ellipsePts(100, 40, 8, 8, 7), { fill: '#e53958', w: 3, hatch: false });
        out.front += crayonShape(rng, rrectPts(60, 50, 80, 40, 6), { fill: shade(color, 0.2), w: 3.4, smoothIt: false });
        break;
      case 'ticks':
        for (let i = 0; i < 7; i++) out.front += line(rng, 54, 150 - i * 10 + 20, 54 + (i % 2 ? 8 : 14), 150 - i * 10 + 20, INK, 2);
        break;
      case 'fold':
        out.front += crayonShape(rng, [[128, 172], [128, 146], [152, 146]], { fill: shade(color, -0.15), w: 3, smoothIt: false });
        break;
      case 'fin':
        out.back += crayonShape(rng, [[84, 90], [104, 46], [124, 88]], { fill: color, w: 3.4, smoothIt: false });
        break;
      case 'brows':
        out.front += line(rng, fx - 24 * s, fy - 18 * s, fx - 6 * s, fy - 12 * s, INK, 4) + line(rng, fx + 24 * s, fy - 18 * s, fx + 6 * s, fy - 12 * s, INK, 4);
        break;
      default:
        break;
    }
  }
  return out;
}

function monsterFrame(id, frame) {
  const def = MONSTER[id];
  const art = def.art;
  const rng = makeRng(hashString(id) + frame * 7919);
  const body = BODIES[art.body](makeRng(hashString(id)));
  const ex = extras(rng, art, body, art.color);
  let out = '<ellipse cx="100" cy="192" rx="62" ry="7" fill="#2d2a32" opacity=".13"/>' + ex.back;
  if (art.body === 'snake') {
    out += crayonLine(rng, body.pts.slice(0, 9), art.color, 24, 1.5) + crayonLine(rng, body.pts.slice(0, 9), INK, 2.6, 2);
    out += crayonShape(rng, ellipsePts(94, 76, 30, 24, 10), { fill: art.color, w: 3.6 });
  } else if (art.body === 'robot') {
    out += crayonShape(rng, body.pts, { fill: art.color, w: 3.8, smoothIt: false });
  } else {
    out += crayonShape(rng, body.pts, { fill: art.color, w: 4, smoothIt: body.smoothIt !== false });
  }
  out += ex.front;
  if (art.body !== 'hydra') {
    const [fx, fy, s] = art.body === 'robot' ? [100, 70, 0.9] : body.face;
    out += eyes(rng, fx, fy, s, art.eyes, -0.6) + mouth(rng, art.mouth, fx, fy, s);
  } else {
    out += eyes(rng, 100, 50, 0.6, 2, -0.5) + mouth(rng, 'teeth', 100, 48, 0.6);
  }
  return out;
}

const monsterCache = new Map();

// Full SVG for a monster: three boil frames in <g class="f fN"> groups.
export function monsterSVG(id, { frames = BOIL_FRAMES, silhouette = false } = {}) {
  const key = `${id}:${frames}:${silhouette}`;
  if (monsterCache.has(key)) return monsterCache.get(key);
  let g = '';
  for (let f = 0; f < frames; f++) g += `<g class="f f${f}">${monsterFrame(id, f)}</g>`;
  const cls = silhouette ? ' class="silhouette"' : '';
  const svg = `<svg viewBox="0 0 200 200" aria-hidden="true"${cls}>${g}</svg>`;
  monsterCache.set(key, svg);
  return svg;
}

// ------------------------------------------------------------ heroes

function heroFrame(id, frame, pose = 'idle') {
  const h = HERO[id];
  const rng = makeRng(hashString(`hero:${id}`) + frame * 104729);
  const c = h.color;
  const skin = '#ffd9b3';
  let back = '';
  let out = '';
  const lean = pose === 'attack' ? 8 : 0;
  // Legs.
  out += crayonLine(rng, [[92, 150], [86, 172], [80, 190]], INK, 6) + crayonLine(rng, [[110, 150], [116, 172], [124, 190]], INK, 6);
  out += line(rng, 70, 190, 84, 190, INK, 6) + line(rng, 120, 190, 136, 190, INK, 6);
  // Body.
  if (id === 'wizard') {
    out += crayonShape(rng, [[100 + lean, 88], [134, 160], [66, 160]], { fill: c, w: 3.8, smoothIt: false });
    for (const [x, y] of [[92, 134], [114, 146], [104, 116]]) out += crayonShape(rng, star(x, y, 6, 5), { fill: '#fff176', w: 1.6, smoothIt: false, hatch: false });
  } else {
    if (id === 'kid') back += crayonShape(rng, [[90, 96], [52, 168], [86, 160], [100, 104]], { fill: '#e53958', w: 3.4 });
    out += crayonShape(rng, [[84 + lean, 94], [118 + lean, 94], [124, 154], [78, 154]], { fill: c, w: 3.8, smoothIt: false });
    if (id === 'kid') out += crayonShape(rng, star(101 + lean / 2, 122, 10, 5), { fill: '#ffd23f', w: 2, smoothIt: false });
    if (id === 'knight') out += crayonShape(rng, rrectPts(80 + lean, 92, 42, 22, 4), { fill: '#c69c6d', w: 3, smoothIt: false });
    if (id === 'ninja') out += line(rng, 82 + lean, 128, 122, 128, '#e53958', 5);
  }
  // Arms: the front arm holds the hero's tool and swings when attacking.
  const ax = pose === 'attack' ? 150 : 134;
  const ay = pose === 'attack' ? 96 : 120;
  out += crayonLine(rng, [[86 + lean, 104], [70, 120], [64, 138]], INK, 5);
  out += crayonLine(rng, [[116 + lean, 104], [(116 + ax) / 2, ay + 4], [ax, ay]], INK, 5);
  const tool = {
    kid: () => crayonShape(rng, [[ax - 4, ay + 6], [ax + 4, ay - 30], [ax + 12, ay - 28], [ax + 6, ay + 8]], { fill: '#ff6b35', w: 3, smoothIt: false }) +
      crayonShape(rng, [[ax + 4, ay - 30], [ax + 9, ay - 42], [ax + 12, ay - 28]], { fill: '#ffe0bd', w: 2.4, smoothIt: false }),
    knight: () => crayonShape(rng, rrectPts(ax - 4, ay - 46, 10, 50, 3), { fill: '#d9b48a', w: 3, smoothIt: false }) +
      crayonShape(rng, ellipsePts(62, 140, 18, 22, 10), { fill: '#e8e2cf', w: 3.4 }) + crayonShape(rng, [[62, 132], [70, 140], [62, 150], [54, 140]], { fill: '#e53958', w: 2, smoothIt: false }),
    wizard: () => line(rng, ax, ay + 6, ax + 10, ay - 40, '#8d6e63', 5) + crayonShape(rng, ellipsePts(ax + 11, ay - 44, 7, 9, 8), { fill: '#4fc3f7', w: 2.6 }),
    ninja: () => crayonShape(rng, star(ax + 6, ay - 6, 14, 4, 0.4), { fill: '#ff8fb1', w: 2.8, smoothIt: false }),
  }[id];
  out += tool();
  // Head.
  const hx = 100 + lean, hy = 66;
  out += crayonShape(rng, ellipsePts(hx, hy, 26, 25, 11), { fill: skin, w: 3.8, hatch: false });
  out += dot(rng, hx + 6, hy - 2, 3.6, INK) + dot(rng, hx + 18, hy - 2, 3.6, INK);
  out += crayonLine(rng, [[hx + 4, hy + 10], [hx + 12, hy + 15], [hx + 20, hy + 9]], INK, 3);
  out += dot(rng, hx - 2, hy + 8, 4, '#ff8fb1');
  const hat = {
    kid: () => crayonShape(rng, [[hx - 26, hy - 8], [hx - 20, hy - 26], [hx + 6, hy - 30], [hx + 26, hy - 18], [hx + 40, hy - 14], [hx + 24, hy - 8]], { fill: '#3f7fd6', w: 3.2 }),
    knight: () => crayonShape(rng, rrectPts(hx - 30, hy - 32, 60, 40, 4), { fill: '#c69c6d', w: 3.6, smoothIt: false }) + line(rng, hx - 2, hy - 8, hx + 26, hy - 8, INK, 6) +
      crayonLine(rng, [[hx - 6, hy - 32], [hx - 2, hy - 52], [hx + 10, hy - 46]], '#e53958', 6),
    wizard: () => crayonShape(rng, [[hx - 34, hy - 12], [hx + 2, hy - 74], [hx + 34, hy - 12]], { fill: c, w: 3.6, smoothIt: false }) + crayonShape(rng, star(hx, hy - 36, 8, 5), { fill: '#fff176', w: 1.8, smoothIt: false, hatch: false }),
    ninja: () => crayonShape(rng, [[hx - 27, hy - 14], [hx + 27, hy - 14], [hx + 27, hy - 2], [hx - 27, hy - 2]], { fill: INK, w: 3, smoothIt: false }) +
      crayonLine(rng, [[hx - 26, hy - 8], [hx - 46, hy - 16], [hx - 58, hy - 6]], INK, 5) + crayonLine(rng, [[hx - 26, hy - 8], [hx - 44, hy + 2], [hx - 54, hy + 12]], INK, 5),
  }[id];
  out += hat();
  return back + out;
}

const heroCache = new Map();

export function heroSVG(id, { frames = BOIL_FRAMES, pose = 'idle', silhouette = false } = {}) {
  const key = `${id}:${frames}:${pose}:${silhouette}`;
  if (heroCache.has(key)) return heroCache.get(key);
  let g = '';
  for (let f = 0; f < frames; f++) g += `<g class="f f${f}">${heroFrame(id, f, pose)}</g>`;
  const cls = silhouette ? ' class="silhouette"' : '';
  const svg = `<svg viewBox="0 0 200 200" aria-hidden="true"${cls}>${g}</svg>`;
  heroCache.set(key, svg);
  return svg;
}

// ------------------------------------------------------------ icons

const ICON_COLORS = {
  slash: '#e53958', shield: '#3f7fd6', swirl: '#8e5cf0', box: '#c69c6d', drop: '#7c4dff', eraser: '#ff8fb1',
  zigzag: '#ff6b35', crayon: '#ff6b35', rainbow: '#e53958', poke: '#7c4dff', dash: '#ff6b35', marker: '#3d8bfd',
  dots: '#e53958', plane: '#4fc3f7', wall: '#c69c6d', pencil: '#ffb300', splash: '#29b6f6', feather: '#ab47bc',
  apple: '#ef5350', juice: '#ff9800', storm: '#5c6bc0', bash: '#3f7fd6', bulb: '#ffd23f', sharpener: '#9aa7b8',
  armor: '#3f7fd6', bubble: '#4dd0e1', boot: '#8d6e63', glue: '#e0e0e0', frenzy: '#e53958', breath: '#81d4fa',
  glitter: '#ec5fd8', heart: '#ef5350', stamp: '#e53958', palette: '#c69c6d', cap: '#3f7fd6', super: '#ffb300',
  pillow: '#f8bbd0', buddy: '#66bb6a', star: '#ffd23f', sparkle: '#ffd23f', cape: '#e53958', helmet: '#c69c6d',
  castle: '#9aa7b8', flag: '#e53958', drops: '#7c4dff', wand: '#8e5cf0', shuriken: '#ff8fb1', shoe: '#4fc3f7',
  flurry: '#2e2e3a', muscle: '#ff6b35', dizzy: '#ab47bc', up: '#66bb6a', trick: '#ab47bc', summon: '#7c5cff',
  battle: '#e53958', elite: '#7b1fa2', shop: '#43a047', rest: '#ff9800', treasure: '#ffb300', mystery: '#3d8bfd',
  boss: '#ffb300', coin: '#ffc93c', bolt: '#ffd23f', cards: '#3f7fd6', smiley: '#ffd23f', rocket: '#ff8a65',
  clover: '#66bb6a', piggy: '#f48fb1', thumb: '#ffca28', cloud: '#90caf9', banana: '#fff176', cactus: '#43a047',
  sunflower: '#fbc02d', unicorn: '#f8bbd0', owl: '#8d6e63', crown: '#ffb300', skull: '#e0e0e0', lock: '#9aa7b8',
  hp: '#ef5350', question: '#3d8bfd',
};

function iconBody(rng, name, c) {
  const L = (pts, col = INK, w = 3.4) => crayonLine(rng, pts, col, w, 1);
  const S = (pts, fill = c, opts = {}) => crayonShape(rng, pts, { fill, w: 3, wob: 1.1, ...opts });
  const E = (cx, cy, rx, ry, fill = c, opts = {}) => S(ellipsePts(cx, cy, rx, ry, 10), fill, opts);
  const P = (pts, fill = c, opts = {}) => S(pts, fill, { smoothIt: false, ...opts });
  switch (name) {
    case 'slash': case 'battle':
      return P([[10, 40], [34, 12], [40, 10], [38, 16], [14, 42]]) + L([[8, 34], [16, 40]], INK, 5) + (name === 'battle' ? P([[38, 40], [14, 12], [8, 10], [10, 16], [34, 42]], '#3f7fd6') + L([[40, 34], [32, 40]], INK, 5) : '');
    case 'shield': case 'armor':
      return P([[24, 6], [42, 12], [40, 28], [24, 42], [8, 28], [6, 12]]) + (name === 'armor' ? L([[16, 20], [24, 28], [32, 18]], '#fff', 3) : L([[24, 12], [24, 34]], '#fff', 3));
    case 'swirl': case 'trick':
      return L([[24, 24], [28, 22], [28, 28], [20, 30], [16, 22], [24, 14], [36, 20], [36, 32], [24, 40], [10, 34], [8, 20]], c, 4.4);
    case 'box': case 'wall':
      return P([[8, 16], [40, 16], [40, 40], [8, 40]]) + L([[8, 16], [16, 8], [40, 8], [40, 16]], INK, 3) + (name === 'wall' ? L([[8, 28], [40, 28]], INK, 2.4) + L([[22, 16], [22, 28]], INK, 2.4) + L([[30, 28], [30, 40]], INK, 2.4) : '');
    case 'drop': case 'poke':
      return S([[24, 6], [36, 26], [34, 38], [24, 42], [14, 38], [12, 26]]) + E(19, 28, 3, 5, '#fff', { outline: false, hatch: false }) + (name === 'poke' ? L([[38, 8], [30, 16]], INK, 3) : '');
    case 'drops':
      return S([[16, 8], [24, 22], [22, 30], [16, 32], [10, 30], [8, 22]]) + S([[32, 16], [40, 30], [38, 38], [32, 40], [26, 38], [24, 30]]);
    case 'eraser':
      return P([[8, 30], [26, 12], [42, 22], [24, 40]]) + P([[8, 30], [17, 21], [33, 31], [24, 40]], '#fff');
    case 'zigzag':
      return L([[6, 30], [14, 14], [22, 34], [30, 14], [38, 34], [44, 18]], c, 4.6);
    case 'crayon': case 'pencil':
      return P([[8, 38], [30, 12], [38, 18], [16, 44]]) + P([[30, 12], [40, 4], [38, 18]], name === 'pencil' ? '#ffe0bd' : shade(c, -0.3)) + L([[12, 36], [32, 14]], '#fff', 2);
    case 'rainbow':
      return L([[6, 38], [10, 18], [24, 10], [38, 18], [42, 38]], '#e53958', 4.4) + L([[12, 38], [15, 22], [24, 16], [33, 22], [36, 38]], '#ffd23f', 4.4) + L([[18, 38], [20, 28], [24, 24], [28, 28], [30, 38]], '#3d8bfd', 4.4);
    case 'dash':
      return E(32, 24, 9, 9) + L([[6, 18], [18, 18]], INK, 3) + L([[4, 26], [18, 26]], INK, 3) + L([[8, 34], [20, 32]], INK, 3);
    case 'marker': case 'stamp':
      return P([[16, 6], [32, 6], [32, 30], [16, 30]]) + P([[14, 30], [34, 30], [36, 42], [12, 42]], name === 'stamp' ? shade(c, -0.3) : INK);
    case 'dots':
      return E(10, 30, 5, 5) + E(24, 22, 5, 5) + E(38, 14, 5, 5);
    case 'plane':
      return P([[4, 24], [44, 8], [26, 40], [22, 28]], '#fff') + L([[22, 28], [44, 8]], INK, 2);
    case 'splash':
      return E(24, 32, 16, 8) + E(12, 16, 4, 6) + E(26, 10, 4, 5) + E(38, 18, 3, 5);
    case 'feather':
      return S([[10, 40], [18, 18], [34, 6], [38, 12], [28, 30]]) + L([[10, 40], [32, 10]], INK, 2);
    case 'apple':
      return E(24, 28, 15, 14) + L([[24, 14], [26, 6]], '#8d6e63', 3) + S([[26, 10], [36, 4], [34, 12]], '#66bb6a', { smoothIt: false });
    case 'juice':
      return P([[12, 12], [34, 12], [34, 42], [12, 42]]) + L([[28, 12], [32, 2]], INK, 3) + E(23, 28, 6, 6, '#fff', { hatch: false });
    case 'storm': case 'cloud':
      return E(16, 22, 10, 9) + E(30, 18, 12, 11) + E(34, 28, 10, 8) + E(18, 30, 10, 7) + (name === 'storm' ? P([[24, 32], [18, 44], [26, 40], [22, 48]], '#ffd23f') : '');
    case 'bash':
      return P([[20, 6], [36, 10], [34, 26], [20, 36], [8, 26], [6, 10]]) + L([[34, 34], [44, 42]], '#e53958', 4) + L([[38, 26], [46, 28]], '#e53958', 4);
    case 'bulb':
      return E(24, 20, 13, 13) + P([[18, 32], [30, 32], [30, 42], [18, 42]], '#9aa7b8') + L([[24, 2], [24, 4]], '#ffb300', 3) + L([[6, 8], [9, 10]], '#ffb300', 3) + L([[42, 8], [39, 10]], '#ffb300', 3);
    case 'sharpener':
      return P([[8, 18], [32, 18], [32, 40], [8, 40]]) + E(20, 29, 5, 5, '#2d2a32', { hatch: false }) + P([[30, 24], [44, 8], [46, 12], [34, 28]], '#ffb300');
    case 'bubble':
      return E(20, 24, 14, 14, '#e0f7fa') + E(36, 34, 7, 7, '#e0f7fa') + E(15, 18, 3, 4, '#fff', { outline: false, hatch: false });
    case 'boot': case 'shoe':
      return P([[12, 8], [24, 8], [24, 28], [42, 30], [42, 40], [12, 40]]) + L([[12, 34], [42, 34]], '#fff', 2.4);
    case 'glue':
      return P([[14, 16], [34, 16], [34, 42], [14, 42]], '#f5f5f5') + P([[20, 6], [28, 6], [30, 16], [18, 16]], '#ff8a65') + L([[18, 26], [30, 26]], '#e53958', 3);
    case 'frenzy': case 'flurry':
      return L([[6, 12], [20, 8], [10, 20], [30, 14], [12, 30], [38, 22], [16, 40], [42, 34]], c, 3.4);
    case 'breath':
      return L([[6, 18], [30, 18], [36, 12], [30, 8]], c, 4) + L([[6, 28], [38, 28], [44, 34], [38, 40]], c, 4);
    case 'glitter': case 'sparkle':
      return P(star(20, 22, 14, 4, 0.35)) + P(star(37, 36, 8, 4, 0.35), '#fff176') + P(star(38, 10, 5, 4, 0.35), '#fff176');
    case 'heart': case 'hp':
      return S([[24, 42], [8, 26], [8, 14], [16, 8], [24, 14], [32, 8], [40, 14], [40, 26]], c, { smoothIt: true });
    case 'palette':
      return E(24, 26, 19, 15) + E(16, 20, 3.5, 3.5, '#e53958', { hatch: false }) + E(26, 16, 3.5, 3.5, '#3d8bfd', { hatch: false }) + E(34, 22, 3.5, 3.5, '#66bb6a', { hatch: false }) + E(18, 32, 3.5, 3.5, '#ffd23f', { hatch: false });
    case 'cap':
      return P([[6, 30], [24, 8], [42, 30]], '#3f7fd6') + E(24, 6, 4, 4, '#ffd23f') + L([[4, 32], [44, 32]], INK, 4);
    case 'super': case 'bolt':
      return P([[28, 4], [10, 26], [22, 26], [16, 44], [38, 18], [26, 18]]);
    case 'pillow':
      return S([[6, 14], [24, 10], [42, 14], [40, 36], [24, 40], [8, 36]]) + L([[16, 24], [32, 24]], shade(c, -0.3), 2);
    case 'buddy':
      return E(24, 28, 14, 13) + E(20, 25, 2.5, 2.5, INK, { outline: false, hatch: false }) + E(29, 25, 2.5, 2.5, INK, { outline: false, hatch: false }) + L([[18, 32], [24, 35], [30, 32]], INK, 2.4) + L([[16, 16], [12, 6]], INK, 2.6) + L([[32, 16], [36, 6]], INK, 2.6);
    case 'star': case 'treasure-star':
      return P(star(24, 25, 19, 5, 0.45));
    case 'cape':
      return S([[16, 8], [32, 8], [42, 42], [24, 36], [6, 42]], c, { smoothIt: false });
    case 'helmet':
      return P([[8, 12], [40, 12], [40, 40], [8, 40]]) + L([[14, 24], [34, 24]], INK, 5) + L([[22, 12], [24, 2], [32, 4]], '#e53958', 4);
    case 'castle':
      return P([[8, 42], [8, 14], [14, 14], [14, 20], [20, 20], [20, 14], [28, 14], [28, 20], [34, 20], [34, 14], [40, 14], [40, 42]]) + P([[20, 42], [20, 32], [28, 32], [28, 42]], INK);
    case 'flag':
      return L([[12, 44], [12, 6]], '#8d6e63', 4) + P([[12, 6], [40, 12], [12, 24]]);
    case 'wand':
      return L([[8, 40], [30, 18]], '#8d6e63', 5) + P(star(34, 14, 10, 5, 0.45), '#ffd23f');
    case 'shuriken':
      return P(star(24, 24, 18, 4, 0.35)) + E(24, 24, 3, 3, '#fff', { hatch: false });
    case 'muscle':
      return S([[8, 36], [10, 22], [20, 10], [28, 14], [22, 22], [30, 20], [40, 26], [38, 38]], c);
    case 'dizzy':
      return L([[24, 24], [27, 22], [28, 27], [21, 29], [17, 22], [24, 15], [34, 20], [34, 31]], c, 3.6) + P(star(38, 10, 5, 5), '#ffd23f') + P(star(8, 36, 4, 5), '#ffd23f');
    case 'up':
      return P([[24, 4], [42, 22], [32, 22], [32, 42], [16, 42], [16, 22], [6, 22]]);
    case 'summon':
      return E(18, 28, 11, 11) + E(32, 20, 9, 9, shade(c, 0.3)) + L([[38, 34], [38, 44]], INK, 3) + L([[33, 39], [43, 39]], INK, 3);
    case 'elite': case 'skull':
      return E(24, 22, 16, 15, c === '#7b1fa2' ? '#ce93d8' : c) + L([[12, 12], [20, 18]], INK, 3.4) + L([[36, 12], [28, 18]], INK, 3.4) + E(18, 23, 3, 3, INK, { hatch: false }) + E(30, 23, 3, 3, INK, { hatch: false }) + L([[16, 34], [20, 30], [24, 34], [28, 30], [32, 34]], INK, 2.6);
    case 'shop':
      return P([[8, 18], [40, 18], [36, 42], [12, 42]]) + L([[16, 18], [16, 10], [24, 6], [32, 10], [32, 18]], INK, 3) + E(24, 30, 4, 4, '#ffd23f', { hatch: false });
    case 'rest':
      return S([[4, 40], [24, 8], [44, 40]], c, { smoothIt: false }) + P([[20, 40], [24, 26], [28, 40]], INK) + L([[30, 8], [38, 8], [30, 16], [38, 16]], '#3d8bfd', 2.4);
    case 'treasure':
      return P([[6, 20], [42, 20], [42, 42], [6, 42]], '#a0704a') + S([[6, 20], [8, 10], [24, 6], [40, 10], [42, 20]], '#c69c6d') + P([[20, 18], [28, 18], [28, 28], [20, 28]], c);
    case 'mystery': case 'question':
      return L([[14, 16], [18, 8], [30, 6], [36, 14], [32, 22], [24, 26], [24, 32]], c, 5.4) + E(24, 40, 3.4, 3.4, c, { hatch: false });
    case 'boss': case 'crown':
      return P([[6, 38], [4, 12], [16, 24], [24, 6], [32, 24], [44, 12], [42, 38]]) + E(24, 30, 3.4, 3.4, '#e53958', { hatch: false });
    case 'coin':
      return E(24, 24, 16, 16) + L([[24, 14], [24, 34]], shade(c, -0.4), 3) + L([[18, 18], [28, 18], [20, 28], [30, 30]], shade(c, -0.4), 2.4);
    case 'cards':
      return P([[10, 10], [28, 6], [34, 36], [16, 40]], '#fff') + P([[16, 12], [36, 10], [38, 42], [18, 44]], c);
    case 'smiley':
      return E(24, 24, 18, 18) + E(18, 20, 2.6, 3.4, INK, { hatch: false }) + E(30, 20, 2.6, 3.4, INK, { hatch: false }) + L([[14, 28], [24, 36], [34, 28]], INK, 3);
    case 'rocket':
      return S([[24, 4], [34, 18], [32, 36], [16, 36], [14, 18]]) + E(24, 20, 4, 4, '#90caf9', { hatch: false }) + P([[18, 36], [24, 46], [30, 36]], '#ffd23f');
    case 'clover':
      return E(16, 18, 8, 8) + E(32, 18, 8, 8) + E(16, 32, 8, 8) + E(32, 32, 8, 8) + L([[24, 26], [30, 44]], '#2e7d32', 3);
    case 'piggy':
      return E(24, 26, 18, 14) + E(36, 26, 5, 4, shade(c, -0.15), { hatch: false }) + E(20, 22, 2, 2, INK, { hatch: false }) + P([[14, 14], [18, 6], [22, 14]]) + L([[18, 10], [26, 10]], '#ffd23f', 3);
    case 'thumb':
      return S([[10, 22], [20, 22], [24, 6], [30, 8], [30, 20], [40, 22], [38, 40], [10, 40]], c, { smoothIt: false });
    case 'banana':
      return S([[8, 12], [16, 30], [32, 38], [44, 32], [30, 30], [18, 22], [14, 8]]);
    case 'cactus':
      return P([[18, 44], [18, 6], [30, 6], [30, 44]]) + P([[18, 26], [8, 26], [8, 14], [14, 14], [14, 20], [18, 20]]) + P([[30, 22], [40, 22], [40, 10], [34, 10], [34, 16], [30, 16]]);
    case 'sunflower':
      return P(star(24, 24, 20, 10, 0.6)) + E(24, 24, 8, 8, '#8d6e63');
    case 'unicorn':
      return E(22, 28, 15, 13) + P([[26, 16], [36, 2], [32, 18]], '#ffd23f') + L([[10, 18], [6, 30], [12, 40]], '#ab47bc', 4) + E(26, 26, 2.4, 2.4, INK, { hatch: false });
    case 'owl':
      return E(24, 26, 16, 18) + E(18, 22, 6, 6, '#fff', { hatch: false }) + E(30, 22, 6, 6, '#fff', { hatch: false }) + E(18, 22, 2.4, 2.4, INK, { hatch: false }) + E(30, 22, 2.4, 2.4, INK, { hatch: false }) + P([[22, 30], [26, 30], [24, 34]], '#ffb300');
    case 'lock':
      return P([[10, 22], [38, 22], [38, 44], [10, 44]]) + L([[16, 22], [16, 12], [24, 6], [32, 12], [32, 22]], INK, 4);
    default:
      return E(24, 24, 14, 14);
  }
}

const iconCache = new Map();

export function iconSVG(name, color = null) {
  const key = `${name}:${color || ''}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const c = color || ICON_COLORS[name] || '#3d8bfd';
  const rng = makeRng(hashString(`icon:${name}`));
  const svg = `<svg viewBox="0 0 48 48" aria-hidden="true">${iconBody(rng, name, c)}</svg>`;
  iconCache.set(key, svg);
  return svg;
}

export function iconNames() {
  return Object.keys(ICON_COLORS);
}

// A wobbly crayon rectangle, used for card frames and panels.
export function frameSVG(color, variant = 0, { w = 100, h = 140, fill = null, sw = 3.4 } = {}) {
  const rng = makeRng(hashString(`frame:${color}:${variant}`));
  const pts = rrectPts(4, 4, w - 8, h - 8, 8);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${crayonShape(rng, pts, { fill, color, w: sw, wob: 1.4, hatch: !!fill })}</svg>`;
}

// The animated scribble that crosses out a defeated monster.
export function crossOutSVG(seed = 1) {
  const rng = makeRng(seed);
  const pts = [];
  for (let i = 0; i < 9; i++) pts.push([30 + i * 18 + jit(rng, 6), i % 2 ? 40 + jit(rng, 10) : 160 + jit(rng, 10)]);
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><path class="xout" pathLength="1" d="${smooth(pts, false)}" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Hand-lettered title: each letter its own crayon colour and tilt.
export function letterSpans(text, seed = 7) {
  const colors = ['#e53958', '#ff6b35', '#ffb300', '#43a047', '#3d8bfd', '#8e5cf0', '#ec5fd8'];
  const rng = makeRng(seed);
  let out = '';
  let k = 0;
  for (const ch of text) {
    if (ch === ' ') {
      out += '<span class="sp"> </span>';
      continue;
    }
    const rot = f1(jit(rng, 7));
    const dy = f1(jit(rng, 4));
    out += `<span style="color:${colors[k++ % colors.length]};--r:${rot}deg;--y:${dy}px">${ch}</span>`;
  }
  return out;
}
