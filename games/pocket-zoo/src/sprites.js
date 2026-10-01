// Baked art: plush-style animals painted from their `look` parameters,
// visitors, decorations, balloons and eggs. Everything is drawn once into
// offscreen canvases; the renderer only blits them.
import { ANIMALS, BIOMES, DECOS } from './data.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ colour

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}
export function shade(c, k) {
  const [r, g, b] = hex(c);
  return k < 0 ? rgb([r * (1 + k), g * (1 + k), b * (1 + k)]) : rgb([r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k]);
}
// Outline colour: a deep, slightly purple version of the fill.
export function ink(c) {
  const [r, g, b] = hex(c);
  return rgb([r * 0.42 + 30, g * 0.36 + 18, b * 0.42 + 40]);
}

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && !globalThis.document) return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ------------------------------------------------------------------ paths

function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}
function paint(ctx, fill, line = ink(fill)) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.stroke();
}
function fillOnly(ctx, fill) {
  ctx.fillStyle = fill;
  ctx.fill();
}
function tri(ctx, ax, ay, bx, by, cx, cy) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
}
function clipped(ctx, pathFn, drawFn) {
  ctx.save();
  pathFn();
  ctx.clip();
  drawFn();
  ctx.restore();
}

// Soft plush shading over the last path's area.
function sheen(ctx, x, y, rx, ry) {
  ctx.save();
  ell(ctx, x - rx * 0.3, y - ry * 0.42, rx * 0.5, ry * 0.3, -0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
  ctx.restore();
}

function eyes(ctx, x, y, gap, { big = false, sleepy = false, iris = null } = {}) {
  for (const s of [-1, 1]) {
    const ex = x + s * gap;
    if (sleepy) {
      ctx.beginPath();
      ctx.arc(ex, y + 1, 3.6, Math.PI * 1.1, Math.PI * 1.9);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#2a1c2c';
      ctx.stroke();
      ctx.lineWidth = 2.6;
      continue;
    }
    if (iris) {
      ell(ctx, ex, y, big ? 7.5 : 5.5, big ? 7.5 : 5.5);
      paint(ctx, iris, '#2a1c2c');
    }
    ell(ctx, ex, y, big ? 4.6 : 3.7, big ? 5.4 : 4.5);
    fillOnly(ctx, '#2a1c2c');
    ell(ctx, ex - 1.2, y - 1.8, big ? 1.9 : 1.5, big ? 2.1 : 1.6);
    fillOnly(ctx, '#ffffff');
    ell(ctx, ex + 1.3, y + 1.6, 0.8, 0.8);
    fillOnly(ctx, 'rgba(255,255,255,0.8)');
  }
}

function blush(ctx, x, y, gap, r = 4.5) {
  for (const s of [-1, 1]) {
    ell(ctx, x + s * gap, y, r, r * 0.62);
    fillOnly(ctx, 'rgba(255,120,150,0.42)');
  }
}

function smile(ctx, x, y, w = 4) {
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w / 2, y + 3, x, y);
  ctx.quadraticCurveTo(x + w / 2, y + 3, x + w, y);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#3a2232';
  ctx.stroke();
  ctx.lineWidth = 2.6;
}

// ------------------------------------------------------------------ mammal

function tailMammal(ctx, L) {
  const c = L.body;
  const t = L.tail;
  if (!t || t === 'none') return;
  ctx.save();
  if (t === 'puff') {
    ell(ctx, 74, 80, 8, 8);
    paint(ctx, L.belly || '#fff');
  } else if (t === 'thin') {
    ctx.beginPath();
    ctx.moveTo(70, 82);
    ctx.quadraticCurveTo(86, 84, 84, 70);
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = ink(c);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = c;
    ctx.stroke();
  } else if (t === 'tuft') {
    ctx.beginPath();
    ctx.moveTo(70, 80);
    ctx.quadraticCurveTo(84, 84, 85, 70);
    ctx.lineWidth = 4;
    ctx.strokeStyle = ink(c);
    ctx.stroke();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = c;
    ctx.stroke();
    ctx.lineWidth = 2.6;
    ell(ctx, 85, 67, 4, 6, 0.3);
    paint(ctx, L.mane ? L.mane[0] : shade(c, -0.35));
  } else if (t === 'bushy') {
    ell(ctx, 79, 70, 12, 20, 0.5);
    paint(ctx, c);
    clipped(ctx, () => ell(ctx, 79, 70, 12, 20, 0.5), () => { ell(ctx, 86, 55, 10, 9); fillOnly(ctx, L.tailTip || '#fff'); });
    ell(ctx, 79, 70, 12, 20, 0.5);
    ctx.strokeStyle = ink(c);
    ctx.stroke();
  } else if (t === 'curly') {
    ctx.beginPath();
    ctx.arc(78, 76, 5, Math.PI, Math.PI * 2.6);
    ctx.lineWidth = 3;
    ctx.strokeStyle = ink(c);
    ctx.stroke();
    ctx.lineWidth = 2.6;
  } else if (t === 'curl') {
    ctx.beginPath();
    ctx.moveTo(70, 84);
    ctx.bezierCurveTo(92, 88, 94, 60, 84, 56);
    ctx.bezierCurveTo(76, 54, 76, 66, 83, 64);
    ctx.lineWidth = 6;
    ctx.strokeStyle = ink(c);
    ctx.stroke();
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = c;
    ctx.stroke();
    ctx.lineWidth = 2.6;
  } else if (t === 'striped' || t === 'ringed') {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(68, 84);
      ctx.bezierCurveTo(88, 86, 96, 66, 88, 46);
    };
    const w = t === 'ringed' ? 11 : 7;
    path();
    ctx.lineCap = 'round';
    ctx.lineWidth = w + 3;
    ctx.strokeStyle = ink(c);
    ctx.stroke();
    ctx.lineWidth = w;
    ctx.strokeStyle = t === 'ringed' ? '#ffffff' : c;
    ctx.stroke();
    ctx.setLineDash(t === 'ringed' ? [4, 5] : [3, 6]);
    ctx.strokeStyle = t === 'ringed' ? L.ring : L.stripes;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.lineWidth = 2.6;
  } else if (t === 'rainbow') {
    const cols = L.mane;
    cols.forEach((col, k) => {
      ctx.beginPath();
      ctx.moveTo(70, 78 + k * 2);
      ctx.bezierCurveTo(88, 76 + k * 3, 92, 90, 86 + k * 2, 96);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = col;
      ctx.stroke();
    });
    ctx.lineCap = 'butt';
    ctx.lineWidth = 2.6;
  } else if (t === 'dragon') {
    ctx.beginPath();
    ctx.moveTo(66, 80);
    ctx.bezierCurveTo(86, 92, 96, 80, 94, 66);
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ink(c);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = c;
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.lineWidth = 2.6;
    tri(ctx, 90, 66, 98, 58, 97, 70);
    paint(ctx, L.spikes);
  }
  ctx.restore();
}

function earsMammal(ctx, L, hx, hy, r, front) {
  const e = L.ears;
  const col = L.ear || L.body;
  const inner = L.earIn || shade(col, -0.15);
  if (!e || e === 'none') return;
  if (e === 'elephant') {
    if (front) return;
    for (const s of [-1, 1]) {
      ell(ctx, hx + s * (r + 6), hy + 2, 17, 20, s * 0.25);
      paint(ctx, col);
      ell(ctx, hx + s * (r + 7), hy + 3, 11, 14, s * 0.25);
      fillOnly(ctx, inner);
    }
    return;
  }
  if (front !== (e === 'floppy' || e === 'side')) return;
  for (const s of [-1, 1]) {
    if (e === 'round' || e === 'small' || e === 'fluffy') {
      const er = e === 'small' ? 5 : e === 'fluffy' ? 12 : 8.5;
      const ox = e === 'fluffy' ? r * 0.86 : r * 0.68;
      const oy = e === 'fluffy' ? -r * 0.45 : -r * 0.72;
      ell(ctx, hx + s * ox, hy + oy, er, er);
      paint(ctx, col);
      ell(ctx, hx + s * ox, hy + oy + 0.5, er * 0.55, er * 0.55);
      fillOnly(ctx, inner);
    } else if (e === 'pointy' || e === 'fennec') {
      const big = e === 'fennec';
      const bx = hx + s * r * (big ? 0.5 : 0.55);
      const tipX = hx + s * r * (big ? 1.25 : 0.9);
      const tipY = hy - r * (big ? 1.75 : 1.32);
      tri(ctx, bx - s * (big ? 9 : 8), hy - r * 0.62, tipX, tipY, bx + s * (big ? 11 : 9), hy - r * 0.28);
      ctx.lineJoin = 'round';
      paint(ctx, col);
      tri(ctx, bx - s * (big ? 4 : 3.5), hy - r * 0.6, tipX - s * 1.5, tipY + 6, bx + s * (big ? 6 : 4.5), hy - r * 0.38);
      fillOnly(ctx, inner);
    } else if (e === 'long') {
      const ex = hx + s * 9;
      ell(ctx, ex, hy - r - 12, 6.5, 19, s * 0.14);
      paint(ctx, col);
      ell(ctx, ex, hy - r - 11, 3.4, 14, s * 0.14);
      fillOnly(ctx, inner);
    } else if (e === 'floppy') {
      ell(ctx, hx + s * (r * 0.92), hy - 2, 7, 12, s * -0.9);
      paint(ctx, col);
      ell(ctx, hx + s * (r * 0.92), hy - 1, 3.5, 7, s * -0.9);
      fillOnly(ctx, inner);
    } else if (e === 'side') {
      ell(ctx, hx + s * (r + 1), hy + 1, 7.5, 8);
      paint(ctx, col);
      ell(ctx, hx + s * (r + 1), hy + 1, 4, 4.5);
      fillOnly(ctx, shade(col, -0.12));
    }
  }
}

function paintMammal(ctx, L) {
  const c = L.body;
  const tall = !!L.tall;
  const wide = L.wide ? 1.15 : 1;
  const neck = !!L.neck;
  const hx = 50;
  const hy = neck ? 22 : tall ? 34 : 44;
  const r = neck ? 17 : tall ? 18 : 23;
  const by = tall ? 72 : 74;
  const brx = (tall ? 17 : 24) * wide;
  const bry = tall ? 23 : 20;

  if (L.glow) {
    const g = ctx.createRadialGradient(50, 60, 10, 50, 60, 52);
    g.addColorStop(0, 'rgba(180,255,240,0.55)');
    g.addColorStop(1, 'rgba(180,255,240,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-10, 0, 120, 110);
  }
  if (L.wings) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(50 + s * 10, 66);
      ctx.quadraticCurveTo(50 + s * 44, 40, 50 + s * 48, 64);
      ctx.quadraticCurveTo(50 + s * 40, 62, 50 + s * 38, 72);
      ctx.quadraticCurveTo(50 + s * 30, 68, 50 + s * 26, 78);
      ctx.quadraticCurveTo(50 + s * 18, 74, 50 + s * 12, 80);
      ctx.closePath();
      paint(ctx, L.wings);
    }
  }
  tailMammal(ctx, L);
  if (L.quills) {
    ctx.beginPath();
    const n = 16;
    for (let k = 0; k <= n; k++) {
      const a = Math.PI * (0.92 + (k / n) * 1.16);
      const rr = k % 2 ? 29 : 38;
      const x = 50 + Math.cos(a) * rr * 1.08;
      const y = 64 + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(50, 74);
    ctx.closePath();
    ctx.lineJoin = 'round';
    paint(ctx, L.quills);
  }
  // body
  ell(ctx, 50, by, brx, bry);
  paint(ctx, c);
  if (L.stripes || L.spots) {
    clipped(ctx, () => ell(ctx, 50, by, brx, bry), () => pattern(ctx, L, 50, by, brx, bry));
    ell(ctx, 50, by, brx, bry);
    ctx.strokeStyle = ink(c);
    ctx.stroke();
  }
  if (L.wool) {
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU;
      ell(ctx, 50 + Math.cos(a) * brx * 0.86, by + Math.sin(a) * bry * 0.8, 8, 8);
      paint(ctx, c, shade(c, -0.18));
    }
    ell(ctx, 50, by, brx * 0.9, bry * 0.86);
    fillOnly(ctx, c);
  }
  ell(ctx, 50, by + 4, brx * 0.58, bry * 0.6);
  fillOnly(ctx, L.belly || shade(c, 0.4));
  if (L.shell) {
    ell(ctx, 50, by - 2, 7, 6);
    paint(ctx, '#ffb8c8');
    ctx.beginPath();
    ctx.moveTo(46, by - 6); ctx.lineTo(50, by + 3); ctx.lineTo(54, by - 6);
    ctx.strokeStyle = '#d07a90';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.lineWidth = 2.6;
  }
  // arms and feet
  const arm = L.arms || shade(c, -0.08);
  for (const s of [-1, 1]) {
    ell(ctx, 50 + s * brx * 0.62, by + 3, 6.5, 8.5, s * -0.35);
    paint(ctx, arm);
    ell(ctx, 50 + s * brx * 0.55, 92, 9, 5.5);
    paint(ctx, L.arms || shade(c, -0.1));
  }
  if (L.bamboo) {
    ctx.save();
    ctx.translate(31, 70);
    ctx.rotate(-0.3);
    ctx.fillStyle = '#7ad04a';
    ctx.strokeStyle = '#3a7a2a';
    ctx.fillRect(-2.6, -26, 5.2, 34);
    ctx.strokeRect(-2.6, -26, 5.2, 34);
    ctx.fillStyle = '#3a7a2a';
    for (const y of [-16, -4]) ctx.fillRect(-3, y, 6, 1.6);
    ell(ctx, 7, -24, 7, 2.6, -0.5);
    paint(ctx, '#9ae05a', '#3a7a2a');
    ctx.restore();
  }
  // neck
  if (neck) {
    ctx.beginPath();
    ctx.moveTo(42, by - 10);
    ctx.lineTo(44, hy + 6);
    ctx.lineTo(56, hy + 6);
    ctx.lineTo(58, by - 10);
    ctx.closePath();
    paint(ctx, c);
    if (L.spots) clipped(ctx, () => { ctx.beginPath(); ctx.rect(43, hy + 6, 14, by - hy - 14); }, () => pattern(ctx, L, 50, (hy + by) / 2, 8, 30));
    ctx.beginPath();
    ctx.moveTo(42, by - 9);
    ctx.lineTo(58, by - 9);
    ctx.lineWidth = 5;
    ctx.strokeStyle = c;
    ctx.stroke();
    ctx.lineWidth = 2.6;
    if (L.mane) {
      ctx.beginPath();
      ctx.moveTo(57, hy + 8);
      ctx.lineTo(59, by - 14);
      ctx.lineWidth = 4;
      ctx.strokeStyle = L.mane[0];
      ctx.stroke();
      ctx.lineWidth = 2.6;
    }
  }
  // lion mane ring
  if (L.maneRing) {
    const n = 12;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      ell(ctx, hx + Math.cos(a) * (r + 3), hy + Math.sin(a) * (r + 2), 10, 10);
      paint(ctx, L.mane[k % L.mane.length]);
    }
  }
  earsMammal(ctx, L, hx, hy, r, false);
  if (L.horns) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + s * 8, hy - r + 4);
      ctx.quadraticCurveTo(hx + s * 14, hy - r - 10, hx + s * 20, hy - r - 12);
      ctx.quadraticCurveTo(hx + s * 16, hy - r - 2, hx + s * 15, hy - r + 6);
      ctx.closePath();
      paint(ctx, L.horns);
    }
  }
  if (L.ossicones) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + s * 6, hy - r + 3);
      ctx.lineTo(hx + s * 8, hy - r - 9);
      ctx.lineWidth = 4;
      ctx.strokeStyle = L.ossicones;
      ctx.stroke();
      ctx.lineWidth = 2.6;
      ell(ctx, hx + s * 8, hy - r - 10, 3.6, 3.6);
      paint(ctx, L.ossicones);
    }
  }
  // head
  ell(ctx, hx, hy, r * (L.wide ? 1.08 : 1), r * 0.94);
  paint(ctx, c);
  if (L.stripes || (L.spots && !neck)) {
    clipped(ctx, () => ell(ctx, hx, hy, r * (L.wide ? 1.08 : 1), r * 0.94), () => pattern(ctx, L, hx, hy - 6, r, r * 0.5, true));
    ell(ctx, hx, hy, r * (L.wide ? 1.08 : 1), r * 0.94);
    ctx.strokeStyle = ink(c);
    ctx.stroke();
  }
  if (L.spots && neck) {
    for (const [dx, dy, sr] of [[-9, -8, 3.5], [8, -10, 3], [12, 2, 2.6]]) { ell(ctx, hx + dx, hy + dy, sr, sr); fillOnly(ctx, L.spots); }
  }
  if (L.wool) {
    for (let k = 0; k < 6; k++) {
      ell(ctx, hx - 13 + k * 5.2, hy - r * 0.78 + (k % 2) * 2, 6.5, 6.5);
      paint(ctx, c, shade(c, -0.18));
    }
  }
  if (L.quills) {
    for (const s of [-1, 1]) {
      tri(ctx, hx + s * 4, hy - r + 2, hx + s * 12, hy - r - 9, hx + s * 16, hy - r + 6);
      paint(ctx, L.quills);
    }
  }
  if (L.face) {
    ctx.beginPath();
    if (L.ears === 'side') {
      ell(ctx, hx - 7, hy - 1, 9, 9);
      fillOnly(ctx, L.face);
      ell(ctx, hx + 7, hy - 1, 9, 9);
      fillOnly(ctx, L.face);
      ell(ctx, hx, hy + 8, 13, 9);
      fillOnly(ctx, L.face);
    } else {
      ell(ctx, hx, hy + 3, r * 0.78, r * 0.66);
      fillOnly(ctx, L.face);
    }
  }
  sheen(ctx, hx, hy, r, r);
  if (L.mane && !L.maneRing && !neck) {
    // a forelock and a stripe of mane on top of the head
    L.mane.forEach((m, k) => {
      ell(ctx, hx - 6 + k * 6, hy - r * 0.86 + k * 1.5, 7, 6, -0.4);
      paint(ctx, m);
    });
  }
  if (L.horn) {
    ctx.beginPath();
    ctx.moveTo(hx - 5, hy - r + 4);
    ctx.lineTo(hx + 1, hy - r - 20);
    ctx.lineTo(hx + 6, hy - r + 4);
    ctx.closePath();
    paint(ctx, L.horn);
    ctx.beginPath();
    ctx.moveTo(hx - 3, hy - r - 2); ctx.lineTo(hx + 4, hy - r - 5);
    ctx.moveTo(hx - 1.5, hy - r - 9); ctx.lineTo(hx + 3, hy - r - 11);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = shade(L.horn, -0.35);
    ctx.stroke();
    ctx.lineWidth = 2.6;
  }
  earsMammal(ctx, L, hx, hy, r, true);
  // face features
  const ey = hy - (neck ? 1 : 2);
  const gap = r * 0.4;
  if (L.eyePatch) {
    for (const s of [-1, 1]) { ell(ctx, hx + s * gap, ey + 1, 6.5, 8, s * 0.5); fillOnly(ctx, L.eyePatch); }
  }
  if (L.mask) {
    ctx.beginPath();
    ctx.ellipse(hx, ey + 1, r * 0.8, 6.5, 0, 0, TAU);
    fillOnly(ctx, L.mask);
  }
  const darkFace = L.eyePatch || L.mask;
  eyes(ctx, hx, ey, gap, { big: L.bigEyes, sleepy: L.sleepy, iris: darkFace && !L.sleepy ? '#ffffff' : null });
  if (L.muzzle) {
    ell(ctx, hx, hy + r * 0.42, r * (L.wide ? 0.62 : 0.44), r * 0.32);
    fillOnly(ctx, L.muzzle);
  }
  if (L.nostrils) {
    for (const s of [-1, 1]) { ell(ctx, hx + s * 5, hy + r * 0.38, 1.6, 1.2); fillOnly(ctx, ink(L.muzzle)); }
  }
  if (L.snout) {
    ell(ctx, hx, hy + 7, 8, 6);
    paint(ctx, L.snout);
    for (const s of [-1, 1]) { ell(ctx, hx + s * 2.8, hy + 7, 1.4, 2); fillOnly(ctx, ink(L.snout)); }
  }
  if (L.trunk) {
    ctx.beginPath();
    ctx.moveTo(hx - 5, hy + 3);
    ctx.bezierCurveTo(hx - 6, hy + 20, hx + 2, hy + 30, hx + 10, hy + 26);
    ctx.lineTo(hx + 10, hy + 20);
    ctx.bezierCurveTo(hx + 4, hy + 22, hx + 4, hy + 14, hx + 5, hy + 3);
    ctx.closePath();
    paint(ctx, c);
    ctx.beginPath();
    for (const y of [12, 17, 21]) { ctx.moveTo(hx - 3, hy + y); ctx.lineTo(hx + 3, hy + y); }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = ink(c);
    ctx.stroke();
    ctx.lineWidth = 2.6;
  }
  if (L.tusks) {
    for (const s of [-1, 1]) {
      tri(ctx, hx + s * 8, hy + 8, hx + s * 12, hy + 9, hx + s * 13, hy + 18);
      paint(ctx, '#fffaf0', '#b8a888');
    }
  }
  if (L.nose && !L.snout) {
    if (L.bigNose) {
      ell(ctx, hx, hy + 6, 6, 7.5);
      fillOnly(ctx, L.nose);
      ell(ctx, hx - 1.5, hy + 3, 2, 1.6);
      fillOnly(ctx, 'rgba(255,255,255,0.5)');
    } else {
      ell(ctx, hx, hy + r * 0.3, 3.4, 2.5);
      fillOnly(ctx, L.nose);
    }
  }
  if (!L.trunk) smile(ctx, hx, hy + r * (L.bigNose ? 0.62 : 0.5), 3.2);
  if (L.whiskers) {
    ctx.beginPath();
    for (const s of [-1, 1]) for (const d of [-2, 2]) { ctx.moveTo(hx + s * 7, hy + r * 0.4 + d); ctx.lineTo(hx + s * 18, hy + r * 0.38 + d * 2); }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(60,40,50,0.6)';
    ctx.stroke();
    ctx.lineWidth = 2.6;
  }
  if (!darkFace) blush(ctx, hx, hy + r * 0.32, r * 0.62);
}

function pattern(ctx, L, x, y, rx, ry, head = false) {
  if (L.stripes) {
    ctx.strokeStyle = L.stripes;
    ctx.lineWidth = head ? 3 : 3.6;
    ctx.lineCap = 'round';
    const n = head ? 3 : 5;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const sx = x - rx + t * rx * 2;
      ctx.beginPath();
      if (head) {
        ctx.moveTo(sx, y - ry);
        ctx.lineTo(sx + (t - 0.5) * 4, y + ry * 0.2);
      } else {
        ctx.moveTo(sx - 3, y - ry);
        ctx.quadraticCurveTo(sx + 4, y, sx - 2, y + ry * 0.4);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.lineWidth = 2.6;
  }
  if (L.spots) {
    const pts = head ? [[-0.5, -0.3, 0.2], [0.45, -0.1, 0.16]] : [[-0.55, -0.35, 0.22], [0.1, -0.55, 0.18], [0.55, -0.1, 0.2], [-0.25, 0.25, 0.16], [0.35, 0.45, 0.14], [-0.7, 0.2, 0.12]];
    for (const [dx, dy, s] of pts) {
      ell(ctx, x + dx * rx, y + dy * ry, s * rx * 1.4, s * ry * 1.2, 0.4);
      fillOnly(ctx, L.spots);
    }
  }
}

// ------------------------------------------------------------------ bird

function paintBird(ctx, L) {
  const c = L.body;
  if (L.neck) return paintOstrich(ctx, L);
  if (L.tailFeathers) {
    L.tailFeathers.forEach((f, k) => {
      ell(ctx, 60 + k * 6, 86, 5, 14, -0.5 + k * 0.3);
      paint(ctx, f);
    });
  }
  // feet
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(50 + s * 9 - 6, 95);
    ctx.lineTo(50 + s * 9, 88);
    ctx.lineTo(50 + s * 9 + 6, 95);
    ctx.closePath();
    paint(ctx, L.feet);
  }
  // body
  ell(ctx, 50, 62, 27, 31);
  paint(ctx, c);
  clipped(ctx, () => ell(ctx, 50, 62, 27, 31), () => {
    ell(ctx, 50, 76, 19, 20);
    fillOnly(ctx, L.belly);
    if (L.face) {
      ell(ctx, 50, 50, 19, 15);
      fillOnly(ctx, L.face);
    }
    if (L.cheek) {
      for (const s of [-1, 1]) { ell(ctx, 50 + s * 18, 52, 5, 7); fillOnly(ctx, L.cheek); }
    }
  });
  ell(ctx, 50, 62, 27, 31);
  ctx.strokeStyle = ink(c);
  ctx.stroke();
  sheen(ctx, 50, 52, 24, 24);
  if (L.tufts) {
    for (const s of [-1, 1]) {
      tri(ctx, 50 + s * 10, 36, 50 + s * 22, 24, 50 + s * 22, 40);
      paint(ctx, c);
    }
  }
  // wings
  for (const s of [-1, 1]) {
    ell(ctx, 50 + s * 25, 68, 8, 15, s * -0.3);
    paint(ctx, L.wing);
    if (L.wing2) {
      ell(ctx, 50 + s * 26, 76, 5, 6, s * -0.3);
      fillOnly(ctx, L.wing2);
    }
  }
  // face
  if (L.eyeRing) for (const s of [-1, 1]) { ell(ctx, 50 + s * 9, 49, 6.5, 6.5); fillOnly(ctx, L.eyeRing); }
  eyes(ctx, 50, 49, 9, { big: L.bigEyes, iris: L.bigEyes ? '#ffd24a' : null });
  if (!L.face || L.bigEyes) blush(ctx, 50, 57, 15, 4);
  beak(ctx, L);
}

function beak(ctx, L) {
  const b = L.beak;
  ctx.lineJoin = 'round';
  if (L.beakType === 'duck') {
    ell(ctx, 50, 58, 10, 5);
    paint(ctx, b);
    ctx.beginPath(); ctx.moveTo(42, 58); ctx.lineTo(58, 58); ctx.lineWidth = 1.2; ctx.strokeStyle = ink(b); ctx.stroke(); ctx.lineWidth = 2.6;
  } else if (L.beakType === 'short') {
    tri(ctx, 45, 55, 55, 55, 50, 63);
    paint(ctx, b);
  } else if (L.beakType === 'hook') {
    ctx.beginPath();
    ctx.moveTo(44, 54);
    ctx.quadraticCurveTo(52, 50, 57, 56);
    ctx.quadraticCurveTo(57, 64, 51, 66);
    ctx.quadraticCurveTo(53, 60, 44, 60);
    ctx.closePath();
    paint(ctx, b);
  } else if (L.beakType === 'big') {
    ctx.beginPath();
    ctx.moveTo(44, 52);
    ctx.quadraticCurveTo(78, 44, 86, 60);
    ctx.quadraticCurveTo(70, 66, 44, 62);
    ctx.closePath();
    paint(ctx, b);
    clipped(ctx, () => { ctx.beginPath(); ctx.moveTo(44, 52); ctx.quadraticCurveTo(78, 44, 86, 60); ctx.quadraticCurveTo(70, 66, 44, 62); ctx.closePath(); }, () => {
      ctx.fillStyle = L.beak2;
      ctx.fillRect(40, 40, 30, 14);
      ell(ctx, 86, 58, 6, 6);
      fillOnly(ctx, '#2a2a36');
    });
  } else if (L.beakType === 'puffin') {
    tri(ctx, 43, 53, 57, 53, 50, 67);
    paint(ctx, b);
    clipped(ctx, () => tri(ctx, 43, 53, 57, 53, 50, 67), () => { ctx.fillStyle = L.beak2; ctx.fillRect(40, 52, 20, 4); ctx.fillStyle = '#5a6a8a'; ctx.fillRect(40, 56, 20, 2); });
  }
}

function paintOstrich(ctx, L) {
  const c = L.body;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(50 + s * 7, 78);
    ctx.lineTo(50 + s * 9, 93);
    ctx.lineWidth = 4;
    ctx.strokeStyle = shade(L.feet, -0.3);
    ctx.stroke();
    ctx.lineWidth = 2.6;
    ell(ctx, 50 + s * 11, 94, 6, 3);
    paint(ctx, L.feet);
  }
  // fluffy body
  for (let k = 0; k < 7; k++) {
    ell(ctx, 30 + k * 7, 68 + (k % 2) * 3, 10, 11);
    paint(ctx, c);
  }
  ell(ctx, 50, 68, 26, 13);
  fillOnly(ctx, c);
  ell(ctx, 76, 62, 8, 7);
  paint(ctx, L.wing);
  ell(ctx, 25, 62, 8, 7);
  paint(ctx, L.wing);
  // neck and head
  ctx.beginPath();
  ctx.moveTo(46, 64);
  ctx.quadraticCurveTo(44, 40, 48, 26);
  ctx.lineTo(55, 26);
  ctx.quadraticCurveTo(52, 42, 55, 64);
  ctx.closePath();
  paint(ctx, L.head);
  ell(ctx, 51, 22, 12, 11);
  paint(ctx, L.head);
  sheen(ctx, 51, 22, 12, 11);
  for (let k = 0; k < 3; k++) { ell(ctx, 46 + k * 4, 12, 2.5, 3.5); fillOnly(ctx, '#4a3e3c'); }
  eyes(ctx, 51, 21, 5.5, { big: false });
  ctx.beginPath();
  ctx.moveTo(45, 27); ctx.quadraticCurveTo(51, 33, 57, 27); ctx.quadraticCurveTo(51, 30, 45, 27);
  paint(ctx, L.beak);
  blush(ctx, 51, 26, 9, 2.6);
}

// ------------------------------------------------------------------ sea and others

function paintFish(ctx, L) {
  const c = L.body;
  const big = L.whale;
  const cx = 50;
  const cy = 60;
  const rx = big ? 36 : L.dolphin ? 34 : 28;
  const ry = big ? 24 : L.dolphin ? 17 : 21;
  // tail
  ctx.lineJoin = 'round';
  if (big || L.dolphin) {
    ctx.beginPath();
    ctx.moveTo(cx - rx + 6, cy);
    ctx.quadraticCurveTo(cx - rx - 6, cy - 4, cx - rx - 14, cy - 16);
    ctx.quadraticCurveTo(cx - rx - 6, cy, cx - rx - 14, cy + 14);
    ctx.quadraticCurveTo(cx - rx - 4, cy + 6, cx - rx + 6, cy + 4);
    ctx.closePath();
    paint(ctx, L.fin);
  } else {
    tri(ctx, cx - rx + 6, cy, cx - rx - 14, cy - 15, cx - rx - 14, cy + 15);
    paint(ctx, L.fin);
  }
  // dorsal fin
  ctx.beginPath();
  if (L.dolphin) {
    ctx.moveTo(cx - 8, cy - ry + 3);
    ctx.quadraticCurveTo(cx - 6, cy - ry - 14, cx - 16, cy - ry - 16);
    ctx.quadraticCurveTo(cx - 12, cy - ry - 4, cx - 20, cy - ry + 6);
  } else if (!big) {
    ctx.moveTo(cx - 12, cy - ry + 4);
    ctx.quadraticCurveTo(cx, cy - ry - 12, cx + 12, cy - ry + 3);
  }
  ctx.closePath();
  if (!big) paint(ctx, L.fin);
  // body
  const body = () => {
    if (L.dolphin) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    } else ell(ctx, cx, cy, rx, ry);
  };
  body();
  paint(ctx, c);
  clipped(ctx, body, () => {
    ell(ctx, cx + 4, cy + ry * 0.75, rx * 0.95, ry * 0.6);
    fillOnly(ctx, L.belly || shade(c, 0.35));
    if (L.bands) {
      for (const bx of [cx + 14, cx - 4, cx - 20]) {
        ctx.fillStyle = L.edge;
        ctx.fillRect(bx - 5.5, cy - ry, 11, ry * 2);
        ctx.fillStyle = L.bands;
        ctx.fillRect(bx - 3.5, cy - ry, 7, ry * 2);
      }
    }
    if (big && !L.freckles) {
      ctx.strokeStyle = shade(L.belly, -0.12);
      ctx.lineWidth = 1.4;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy + ry * 0.5 + k * 3.5);
        ctx.lineTo(cx + 26, cy + ry * 0.45 + k * 3.5);
        ctx.stroke();
      }
      ctx.lineWidth = 2.6;
    }
    if (L.freckles) {
      for (const [dx, dy] of [[-18, -10], [-8, -14], [-22, 0], [-2, -6], [-14, -4], [6, -14]]) { ell(ctx, cx + dx, cy + dy, 2.2, 1.8); fillOnly(ctx, L.freckles); }
    }
  });
  body();
  ctx.strokeStyle = ink(c);
  ctx.stroke();
  sheen(ctx, cx + 6, cy, rx * 0.8, ry);
  if (L.dolphin) {
    ell(ctx, cx + rx - 2, cy + 4, 9, 5, 0.1);
    paint(ctx, c);
  }
  // side fin
  ell(ctx, cx + 2, cy + ry * 0.5, 7, 4.5, 0.6);
  paint(ctx, L.fin);
  if (L.tusk) {
    ctx.beginPath();
    ctx.moveTo(cx + rx - 4, cy - 6);
    ctx.lineTo(cx + rx + 22, cy - 18);
    ctx.lineTo(cx + rx - 3, cy - 1);
    ctx.closePath();
    paint(ctx, L.tusk, '#b8a888');
    ctx.beginPath();
    for (let k = 1; k < 4; k++) { const t = k / 4; ctx.moveTo(cx + rx - 3 + t * 24, cy - 4 - t * 13); ctx.lineTo(cx + rx - 1 + t * 24, cy - 1 - t * 14); }
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#b8a888';
    ctx.stroke();
    ctx.lineWidth = 2.6;
  }
  // face
  const ex = cx + rx * 0.5;
  const ey = cy - ry * 0.2;
  ell(ctx, ex, ey, 4.5, 5.2);
  fillOnly(ctx, '#2a1c2c');
  ell(ctx, ex - 1.3, ey - 2, 1.8, 1.9);
  fillOnly(ctx, '#fff');
  ell(ctx, ex + 1.2, ey + 4 + 6, 4, 2.4);
  fillOnly(ctx, 'rgba(255,120,150,0.45)');
  ctx.beginPath();
  ctx.arc(cx + rx * 0.78, cy + ry * 0.25, 4, 0.2, Math.PI * 0.8);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#3a2232';
  ctx.stroke();
  ctx.lineWidth = 2.6;
  if (big && !L.tusk) {
    // a happy little spout
    ctx.beginPath();
    ctx.moveTo(cx + 8, cy - ry);
    ctx.quadraticCurveTo(cx + 2, cy - ry - 14, cx - 6, cy - ry - 12);
    ctx.moveTo(cx + 8, cy - ry);
    ctx.quadraticCurveTo(cx + 14, cy - ry - 14, cx + 22, cy - ry - 12);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#a8e4ff';
    ctx.stroke();
    ctx.lineWidth = 2.6;
  }
}

function paintCrab(ctx, L) {
  const c = L.body;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(50 + s * 16, 76 + k * 4);
      ctx.lineTo(50 + s * (30 + k * 3), 84 + k * 4);
      ctx.lineTo(50 + s * (32 + k * 3), 94);
      ctx.lineWidth = 4;
      ctx.strokeStyle = ink(c);
      ctx.stroke();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = c;
      ctx.stroke();
    }
    // claw arm and claw
    ctx.beginPath();
    ctx.moveTo(50 + s * 18, 68);
    ctx.lineTo(50 + s * 32, 54);
    ctx.lineWidth = 6;
    ctx.strokeStyle = ink(c);
    ctx.stroke();
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = c;
    ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(50 + s * 34, 46, 10, s > 0 ? -2.4 : -0.74 + Math.PI, s > 0 ? 2.0 : 1.14 + Math.PI);
    ctx.lineTo(50 + s * 34, 46);
    ctx.closePath();
    paint(ctx, c);
  }
  ctx.lineCap = 'butt';
  // eyestalks
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(50 + s * 7, 62);
    ctx.lineTo(50 + s * 9, 50);
    ctx.lineWidth = 3;
    ctx.strokeStyle = ink(c);
    ctx.stroke();
    ctx.lineWidth = 2.6;
    ell(ctx, 50 + s * 9, 47, 6, 6);
    paint(ctx, '#ffffff', ink(c));
    ell(ctx, 50 + s * 9.5, 47.5, 3.2, 3.6);
    fillOnly(ctx, '#2a1c2c');
    ell(ctx, 50 + s * 9 - 1, 46, 1.2, 1.2);
    fillOnly(ctx, '#fff');
  }
  ell(ctx, 50, 74, 25, 16);
  paint(ctx, c);
  ell(ctx, 50, 79, 15, 8);
  fillOnly(ctx, L.belly);
  sheen(ctx, 50, 72, 24, 15);
  smile(ctx, 50, 76, 4);
  blush(ctx, 50, 75, 13, 3.6);
}

function paintOctopus(ctx, L) {
  const c = L.body;
  ctx.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const x = 26 + k * 9.6;
    const s = k < 3 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 62);
    ctx.bezierCurveTo(x + s * 2, 80, x - s * 6, 88, x + s * 6, 94);
    ctx.lineWidth = 9;
    ctx.strokeStyle = ink(c);
    ctx.stroke();
    ctx.lineWidth = 6.4;
    ctx.strokeStyle = c;
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(22, 66);
  ctx.bezierCurveTo(14, 18, 86, 18, 78, 66);
  ctx.quadraticCurveTo(50, 74, 22, 66);
  ctx.closePath();
  paint(ctx, c);
  for (const [x, y, r] of [[38, 34, 4], [60, 30, 3], [66, 46, 3.5], [30, 50, 2.6]]) { ell(ctx, x, y, r, r); fillOnly(ctx, L.spots); }
  sheen(ctx, 50, 42, 26, 22);
  eyes(ctx, 50, 52, 10, { big: true });
  blush(ctx, 50, 60, 17, 4);
  smile(ctx, 50, 61, 3.5);
}

function paintSeahorse(ctx, L) {
  const c = L.body;
  ctx.lineJoin = 'round';
  // curled tail
  ctx.beginPath();
  ctx.moveTo(48, 70);
  ctx.bezierCurveTo(44, 88, 60, 96, 62, 86);
  ctx.bezierCurveTo(63, 80, 55, 80, 56, 85);
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink(c);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = c;
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.lineWidth = 2.6;
  // back fin
  ell(ctx, 38, 56, 7, 11, 0.3);
  paint(ctx, L.fin);
  // body
  ctx.beginPath();
  ctx.moveTo(44, 36);
  ctx.bezierCurveTo(30, 46, 36, 74, 50, 74);
  ctx.bezierCurveTo(62, 72, 64, 52, 56, 42);
  ctx.closePath();
  paint(ctx, c);
  ell(ctx, 54, 58, 6, 12, -0.2);
  fillOnly(ctx, L.belly);
  ctx.beginPath();
  for (let k = 0; k < 4; k++) { ctx.moveTo(49, 50 + k * 6); ctx.lineTo(58, 49 + k * 6); }
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = shade(c, -0.25);
  ctx.stroke();
  ctx.lineWidth = 2.6;
  // head and snout
  ell(ctx, 50, 32, 13, 12);
  paint(ctx, c);
  ctx.beginPath();
  ctx.moveTo(58, 30);
  ctx.lineTo(74, 32);
  ctx.lineTo(74, 39);
  ctx.lineTo(58, 38);
  ctx.closePath();
  paint(ctx, c);
  tri(ctx, 44, 22, 48, 13, 52, 21);
  paint(ctx, L.fin);
  sheen(ctx, 50, 32, 12, 11);
  eyes(ctx, 54, 30, 0.01, {});
  blush(ctx, 52, 37, 0.01, 3.2);
}

function paintFrog(ctx, L) {
  const c = L.body;
  for (const s of [-1, 1]) {
    ell(ctx, 50 + s * 24, 92, 9, 4.5);
    paint(ctx, L.feet);
  }
  ell(ctx, 50, 76, 30, 19);
  paint(ctx, c);
  ell(ctx, 50, 82, 19, 11);
  fillOnly(ctx, L.belly);
  for (const s of [-1, 1]) {
    ell(ctx, 50 + s * 15, 56, 11, 11);
    paint(ctx, c);
    ell(ctx, 50 + s * 15, 56, 7.5, 7.5);
    paint(ctx, L.eye, '#2a1c2c');
    ell(ctx, 50 + s * 15, 56, 2.4, 5.8);
    fillOnly(ctx, '#2a1c2c');
    ell(ctx, 50 + s * 15 - 2.5, 53, 1.8, 1.8);
    fillOnly(ctx, '#fff');
  }
  sheen(ctx, 50, 72, 26, 16);
  ctx.beginPath();
  ctx.moveTo(36, 72);
  ctx.quadraticCurveTo(50, 82, 64, 72);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3a2232';
  ctx.stroke();
  ctx.lineWidth = 2.6;
  blush(ctx, 50, 72, 21, 4);
  for (const s of [-1, 1]) {
    for (let k = -1; k <= 1; k++) {
      ell(ctx, 50 + s * 14 + k * 3.5, 94, 2.4, 2.4);
      fillOnly(ctx, L.feet);
    }
  }
}

function paintSeal(ctx, L) {
  const c = L.body;
  const wide = L.wide ? 1.15 : 1;
  for (const s of [-1, 1]) {
    ell(ctx, 50 + s * 24 * wide, 86, 11, 6, s * 0.5);
    paint(ctx, shade(c, -0.08));
  }
  ctx.beginPath();
  ctx.moveTo(50 - 28 * wide, 90);
  ctx.bezierCurveTo(50 - 34 * wide, 50, 50 - 22 * wide, 24, 50, 24);
  ctx.bezierCurveTo(50 + 22 * wide, 24, 50 + 34 * wide, 50, 50 + 28 * wide, 90);
  ctx.quadraticCurveTo(50, 98, 50 - 28 * wide, 90);
  ctx.closePath();
  paint(ctx, c);
  ell(ctx, 50, 76, 18 * wide, 16);
  fillOnly(ctx, L.belly);
  sheen(ctx, 50, 44, 22, 20);
  eyes(ctx, 50, 44, 10, { big: true });
  // muzzle
  for (const s of [-1, 1]) {
    ell(ctx, 50 + s * 5, 55, 6.5, 5);
    fillOnly(ctx, L.tusks ? shade(c, 0.2) : '#ffffff');
  }
  if (L.tusks) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(50 + s * 4, 58);
      ctx.lineTo(50 + s * 6, 76);
      ctx.lineTo(50 + s * 8, 58);
      ctx.closePath();
      paint(ctx, '#fffaf0', '#b8a888');
    }
    for (const s of [-1, 1]) for (const [dx, dy] of [[3, 0], [7, 1], [5, 3]]) { ell(ctx, 50 + s * dx, 54 + dy, 0.8, 0.8); fillOnly(ctx, ink(c)); }
  }
  ell(ctx, 50, 51, 3.6, 2.6);
  fillOnly(ctx, L.nose);
  if (L.whiskers) {
    ctx.beginPath();
    for (const s of [-1, 1]) for (const d of [-2, 2]) { ctx.moveTo(50 + s * 9, 55 + d); ctx.lineTo(50 + s * 20, 54 + d * 2); }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(60,40,50,0.55)';
    ctx.stroke();
    ctx.lineWidth = 2.6;
  }
  blush(ctx, 50, 52, 16, 4);
}

const PAINTERS = { mammal: paintMammal, bird: paintBird, fish: paintFish, crab: paintCrab, octopus: paintOctopus, seahorse: paintSeahorse, frog: paintFrog, seal: paintSeal };

// Paint an animal into a 100 × 110 box (feet at y = 96 + PAD_TOP).
export const PAD_TOP = 14;
export function paintAnimal(ctx, def) {
  ctx.save();
  ctx.translate(0, PAD_TOP);
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  PAINTERS[def.look.kind](ctx, def.look);
  ctx.restore();
}

// ------------------------------------------------------------------ bakes

export class SpriteBank {
  constructor() {
    this.animals = new Map();
    this.silhouettes = new Map();
    this.queue = ANIMALS.map((a) => a.id);
    this.visitors = [];
    this.decos = new Map();
    this.balloons = [];
    this.eggs = new Map();
    this.px = 150;
  }

  // Bake a few animals per call so no frame stalls.
  bakeSome(budgetMs = 8) {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) this.animal(this.queue.shift());
    return this.queue.length === 0;
  }

  animal(id) {
    let c = this.animals.get(id);
    if (c) return c;
    const def = ANIMALS.find((a) => a.id === id);
    const px = this.px;
    c = makeCanvas(px, Math.round(px * 1.1));
    const ctx = c.getContext('2d');
    ctx.scale(px / 100, px / 100);
    paintAnimal(ctx, def);
    this.animals.set(id, c);
    return c;
  }

  silhouette(id) {
    let c = this.silhouettes.get(id);
    if (c) return c;
    const src = this.animal(id);
    c = makeCanvas(src.width, src.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#6a5a8a';
    ctx.fillRect(0, 0, c.width, c.height);
    this.silhouettes.set(id, c);
    return c;
  }

  visitor(v, frame) {
    const k = v * 2 + frame;
    if (!this.visitors[k]) this.visitors[k] = bakeVisitor(v, frame);
    return this.visitors[k];
  }

  balloon(i) {
    const k = i < 0 ? 5 : i;
    if (!this.balloons[k]) this.balloons[k] = bakeBalloon(k);
    return this.balloons[k];
  }

  deco(id) {
    let c = this.decos.get(id);
    if (!c) { c = bakeDeco(id); this.decos.set(id, c); }
    return c;
  }

  egg(kind) {
    let c = this.eggs.get(kind);
    if (!c) { c = bakeEgg(kind, 120); this.eggs.set(kind, c); }
    return c;
  }
}

// ------------------------------------------------------------------ visitors

const SKIN = ['#ffdcc2', '#f2c29a', '#d89a6a', '#b0764a', '#8a5636', '#ffe8d4'];
const HAIR = ['#3a2a22', '#7a4a2a', '#e8b84a', '#2a2228', '#c8643a', '#5a3a2a'];
const SHIRT = ['#ff6b8a', '#4fb6ff', '#ffc83a', '#7ad86a', '#b07aff', '#ff8a3d', '#3ad1c0', '#ff5a5a'];
const PANTS = ['#4a5a8a', '#3a3a4a', '#6a4a3a', '#2a6a7a'];

function bakeVisitor(v, frame) {
  const s = 2;
  const c = makeCanvas(40 * s, 64 * s);
  const ctx = c.getContext('2d');
  ctx.scale(s, s);
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  const kid = v % 3 !== 0;
  const skin = SKIN[v % SKIN.length];
  const hair = HAIR[(v * 5) % HAIR.length];
  const shirt = SHIRT[(v * 3) % SHIRT.length];
  const pants = PANTS[v % PANTS.length];
  const style = v % 4;
  const top = kid ? 22 : 12;
  const legY = 50;
  // legs
  for (const sd of [-1, 1]) {
    const off = frame ? sd * 2 : 0;
    ctx.beginPath();
    ctx.roundRect(20 + sd * 4 - 2.5 + off, legY - 2, 5, 12, 2);
    paint(ctx, pants);
    ell(ctx, 20 + sd * 4 + off, 61, 3.6, 2.2);
    fillOnly(ctx, '#3a2a2a');
  }
  // body
  ctx.beginPath();
  ctx.roundRect(11, top + 16, 18, legY - top - 14, 7);
  paint(ctx, shirt);
  for (const sd of [-1, 1]) {
    ell(ctx, 20 + sd * 10, top + 26 + (frame ? sd : -sd), 3, 6, sd * 0.2);
    paint(ctx, shirt);
    ell(ctx, 20 + sd * 10.6, top + 31 + (frame ? sd : -sd), 2.4, 2.4);
    fillOnly(ctx, skin);
  }
  // head
  if (style === 1) for (const sd of [-1, 1]) { ell(ctx, 20 + sd * 11, top + 6, 4, 5); paint(ctx, hair); }
  ell(ctx, 20, top + 8, 9.5, 9);
  paint(ctx, skin);
  ctx.save();
  ell(ctx, 20, top + 8, 9.5, 9);
  ctx.clip();
  ctx.fillStyle = hair;
  if (style === 2) ctx.fillRect(9, top - 2, 22, 7);
  else ctx.fillRect(9, top - 2, 22, 6 + (style === 0 ? 0 : 1));
  ctx.restore();
  if (style === 2) { ell(ctx, 20, top - 2, 5, 4); paint(ctx, hair); }
  if (style === 3) {
    // cap
    ctx.beginPath();
    ctx.arc(20, top + 5, 10, Math.PI, 0);
    ctx.closePath();
    paint(ctx, SHIRT[(v + 4) % SHIRT.length]);
    ell(ctx, 25, top + 5, 7, 2.2);
    paint(ctx, SHIRT[(v + 4) % SHIRT.length]);
  }
  for (const sd of [-1, 1]) { ell(ctx, 20 + sd * 3.6, top + 9, 1.3, 1.7); fillOnly(ctx, '#2a1c2c'); }
  ell(ctx, 20 - 6, top + 12, 2, 1.2); fillOnly(ctx, 'rgba(255,110,140,0.4)');
  ell(ctx, 20 + 6, top + 12, 2, 1.2); fillOnly(ctx, 'rgba(255,110,140,0.4)');
  ctx.beginPath();
  ctx.arc(20, top + 11.5, 2.2, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = '#3a2232';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  return c;
}

const BALLOONS = ['#ff5a7a', '#4fb6ff', '#ffd23f', '#7ad86a', '#b07aff', '#ffcf3a'];
function bakeBalloon(k) {
  const s = 2;
  const c = makeCanvas(24 * s, 34 * s);
  const ctx = c.getContext('2d');
  ctx.scale(s, s);
  ctx.lineWidth = 1.4;
  const col = BALLOONS[k];
  ell(ctx, 12, 11, 9, 10.5);
  if (k === 5) {
    const g = ctx.createRadialGradient(9, 7, 1, 12, 11, 11);
    g.addColorStop(0, '#fff6c8');
    g.addColorStop(1, '#ffb52e');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#b8741a';
    ctx.stroke();
    star(ctx, 12, 11, 4.6, '#ffffff');
  } else paint(ctx, col);
  tri(ctx, 10, 22, 14, 22, 12, 20);
  paint(ctx, col);
  ell(ctx, 8.5, 7, 2.4, 3.4, -0.5);
  fillOnly(ctx, 'rgba(255,255,255,0.55)');
  return c;
}

export function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function heart(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.fillStyle = fill;
  ctx.fill();
}

// ------------------------------------------------------------------ decorations

function bakeDeco(id) {
  const s = 2;
  const c = makeCanvas(100 * s, 110 * s);
  const ctx = c.getContext('2d');
  ctx.scale(s, s);
  ctx.translate(0, 10);
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  DECO_PAINTERS[id](ctx);
  return c;
}

const DECO_PAINTERS = {
  flowers(ctx) {
    ell(ctx, 50, 86, 34, 12);
    paint(ctx, '#8a5a3a');
    ell(ctx, 50, 83, 30, 9);
    fillOnly(ctx, '#6a3e2a');
    const cols = ['#ff6b9a', '#ffd23f', '#b07aff', '#ff8a3d', '#ffffff', '#4fb6ff'];
    for (let k = 0; k < 9; k++) {
      const x = 26 + (k % 5) * 12 + (k > 4 ? 6 : 0);
      const y = k > 4 ? 82 : 74;
      ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y); ctx.strokeStyle = '#3a8a3a'; ctx.stroke();
      for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ell(ctx, x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3.4, 3.4); fillOnly(ctx, cols[k % cols.length]); }
      ell(ctx, x, y, 2.2, 2.2);
      fillOnly(ctx, '#ffe27a');
    }
  },
  bench(ctx) {
    ctx.fillStyle = '#7a4a2a';
    for (const x of [24, 72]) { ctx.beginPath(); ctx.roundRect(x, 70, 5, 22, 2); paint(ctx, '#7a4a2a'); }
    for (const [y, h] of [[52, 8], [62, 6], [74, 7]]) { ctx.beginPath(); ctx.roundRect(18, y, 64, h, 3); paint(ctx, '#d98a4a'); }
    ell(ctx, 50, 94, 36, 5); fillOnly(ctx, 'rgba(40,30,20,0.18)');
  },
  lamp(ctx) {
    ell(ctx, 50, 94, 14, 4); fillOnly(ctx, 'rgba(40,30,20,0.2)');
    ctx.beginPath(); ctx.roundRect(46, 30, 8, 62, 3); paint(ctx, '#3a4a6a');
    ctx.beginPath(); ctx.roundRect(40, 86, 20, 7, 3); paint(ctx, '#3a4a6a');
    const g = ctx.createRadialGradient(50, 22, 2, 50, 22, 26);
    g.addColorStop(0, 'rgba(255,230,140,0.7)'); g.addColorStop(1, 'rgba(255,230,140,0)');
    ctx.fillStyle = g; ctx.fillRect(20, -6, 60, 56);
    ctx.beginPath(); ctx.roundRect(38, 12, 24, 22, 6); paint(ctx, '#ffe48a', '#3a4a6a');
    tri(ctx, 34, 14, 66, 14, 50, 2); paint(ctx, '#3a4a6a');
  },
  balloons(ctx) {
    ell(ctx, 50, 94, 26, 5); fillOnly(ctx, 'rgba(40,30,20,0.2)');
    ctx.beginPath(); ctx.roundRect(28, 64, 44, 24, 5); paint(ctx, '#ff8ab0');
    ctx.fillStyle = '#ffffff'; for (let k = 0; k < 4; k++) ctx.fillRect(30 + k * 11, 66, 5, 20);
    for (const x of [34, 66]) { ell(ctx, x, 90, 5, 5); paint(ctx, '#5a5a6a'); }
    const cols = ['#ff5a7a', '#4fb6ff', '#ffd23f', '#7ad86a', '#b07aff'];
    cols.forEach((col, k) => {
      const bx = 30 + k * 10;
      const by = 18 + (k % 2) * 10;
      ctx.beginPath(); ctx.moveTo(50, 64); ctx.lineTo(bx, by + 10); ctx.lineWidth = 1; ctx.strokeStyle = '#6a6a7a'; ctx.stroke(); ctx.lineWidth = 2.4;
      ell(ctx, bx, by, 8, 10); paint(ctx, col);
      ell(ctx, bx - 2.5, by - 4, 2, 3, -0.4); fillOnly(ctx, 'rgba(255,255,255,0.6)');
    });
  },
  topiary(ctx) {
    ell(ctx, 50, 94, 22, 5); fillOnly(ctx, 'rgba(40,30,20,0.2)');
    ctx.beginPath(); ctx.moveTo(36, 78); ctx.lineTo(64, 78); ctx.lineTo(60, 94); ctx.lineTo(40, 94); ctx.closePath(); paint(ctx, '#d9744a');
    ell(ctx, 50, 62, 20, 18); paint(ctx, '#4aa84a');
    ell(ctx, 50, 38, 14, 13); paint(ctx, '#4aa84a');
    for (const s of [-1, 1]) { ell(ctx, 50 + s * 6, 16, 4.5, 12, s * 0.15); paint(ctx, '#4aa84a'); }
    ell(ctx, 66, 70, 6, 6); paint(ctx, '#5aba5a');
    for (const s of [-1, 1]) { ell(ctx, 50 + s * 5, 37, 1.8, 2.2); fillOnly(ctx, '#1e4a1e'); }
  },
  icecream(ctx) {
    ell(ctx, 50, 94, 34, 5); fillOnly(ctx, 'rgba(40,30,20,0.2)');
    ctx.beginPath(); ctx.roundRect(22, 52, 56, 40, 6); paint(ctx, '#fff4e4');
    ctx.fillStyle = '#7ad0ff'; ctx.fillRect(24, 60, 52, 8);
    for (const x of [24, 74]) { ctx.beginPath(); ctx.roundRect(x - 2, 22, 4, 32, 2); paint(ctx, '#c8c8d8'); }
    ctx.beginPath(); ctx.moveTo(14, 30); ctx.lineTo(86, 30); ctx.lineTo(80, 16); ctx.lineTo(20, 16); ctx.closePath(); paint(ctx, '#ff8ab0');
    ctx.fillStyle = '#ffffff'; for (let k = 0; k < 5; k++) ctx.fillRect(24 + k * 12, 17, 6, 12);
    // cone on top
    tri(ctx, 44, 8, 56, 8, 50, -6 + 30); paint(ctx, '#e8a85a');
    ell(ctx, 50, 4, 8, 7); paint(ctx, '#ffb8d0');
    ell(ctx, 50, -3, 5, 4.5); paint(ctx, '#ffeaa0');
  },
  fountain(ctx) {
    ell(ctx, 50, 84, 40, 12); paint(ctx, '#c8d0e0');
    ell(ctx, 50, 81, 34, 8); fillOnly(ctx, '#7ad0ff');
    ctx.beginPath(); ctx.roundRect(45, 46, 10, 34, 3); paint(ctx, '#c8d0e0');
    ell(ctx, 50, 46, 18, 6); paint(ctx, '#c8d0e0');
    ell(ctx, 50, 45, 14, 3.6); fillOnly(ctx, '#7ad0ff');
    ctx.strokeStyle = '#a8e4ff';
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(50, 30); ctx.quadraticCurveTo(50 + s * 20, 20, 50 + s * 28, 76); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(50, 44); ctx.lineTo(50, 24); ctx.stroke();
    ell(ctx, 50, 22, 4, 4); fillOnly(ctx, '#d4f4ff');
  },
  treehouse(ctx) {
    ell(ctx, 50, 94, 30, 6); fillOnly(ctx, 'rgba(40,30,20,0.2)');
    ctx.beginPath(); ctx.roundRect(44, 40, 12, 54, 3); paint(ctx, '#8a5a3a');
    ell(ctx, 34, 26, 22, 18); paint(ctx, '#5ab04a');
    ell(ctx, 66, 24, 22, 18); paint(ctx, '#5ab04a');
    ell(ctx, 50, 14, 22, 16); paint(ctx, '#6ac05a');
    ctx.beginPath(); ctx.roundRect(34, 42, 32, 20, 3); paint(ctx, '#d9944a');
    tri(ctx, 30, 44, 70, 44, 50, 30); paint(ctx, '#ff6b6b');
    ctx.beginPath(); ctx.roundRect(46, 48, 8, 14, 2); paint(ctx, '#6a3e2a');
    ctx.strokeStyle = '#d9b07a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); for (let y = 66; y < 92; y += 6) { ctx.moveTo(58, y); ctx.lineTo(66, y); } ctx.moveTo(58, 62); ctx.lineTo(58, 92); ctx.moveTo(66, 62); ctx.lineTo(66, 92); ctx.stroke();
  },
  carousel(ctx) {
    ell(ctx, 50, 90, 40, 8); paint(ctx, '#c88ad8');
    for (let k = 0; k < 4; k++) { const x = 18 + k * 21; ctx.beginPath(); ctx.roundRect(x - 1.5, 36, 3, 52, 1); paint(ctx, '#ffd23f'); }
    const cols = ['#ffffff', '#ffb8d0', '#a8e4ff', '#ffeaa0'];
    for (let k = 0; k < 4; k++) { const x = 18 + k * 21; ell(ctx, x, 66 + (k % 2) * 6, 7, 5); paint(ctx, cols[k]); ell(ctx, x + 5, 61 + (k % 2) * 6, 3.4, 3.4); paint(ctx, cols[k]); }
    ctx.beginPath(); ctx.moveTo(8, 38); ctx.lineTo(92, 38); ctx.lineTo(50, 8); ctx.closePath(); paint(ctx, '#ff6b9a');
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(50, 8); ctx.lineTo(14 + k * 22, 38); ctx.lineTo(24 + k * 22, 38); ctx.closePath(); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(8, 38); ctx.lineTo(92, 38); ctx.lineTo(50, 8); ctx.closePath(); ctx.strokeStyle = ink('#ff6b9a'); ctx.stroke();
    star(ctx, 50, 4, 6, '#ffd23f');
  },
  arch(ctx) {
    const cols = ['#ff5a5a', '#ff9a3d', '#ffd23f', '#7ad86a', '#4fb6ff', '#b07aff'];
    cols.forEach((col, k) => {
      ctx.beginPath();
      ctx.arc(50, 88, 44 - k * 5, Math.PI, 0);
      ctx.lineWidth = 5.4;
      ctx.strokeStyle = col;
      ctx.stroke();
    });
    ctx.lineWidth = 2.4;
    for (const x of [8, 92]) { ell(ctx, x, 88, 10, 7); paint(ctx, '#ffffff', '#c8d0e0'); ell(ctx, x + 6, 84, 7, 6); paint(ctx, '#ffffff', '#c8d0e0'); }
  },
  telescope(ctx) {
    ell(ctx, 50, 94, 26, 5); fillOnly(ctx, 'rgba(40,30,20,0.2)');
    ctx.strokeStyle = '#5a4a6a'; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(50, 56); ctx.lineTo(32, 92); ctx.moveTo(50, 56); ctx.lineTo(68, 92); ctx.moveTo(50, 56); ctx.lineTo(50, 92); ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.save(); ctx.translate(50, 50); ctx.rotate(-0.55);
    ctx.beginPath(); ctx.roundRect(-30, -9, 56, 18, 6); paint(ctx, '#6a5aff');
    ctx.beginPath(); ctx.roundRect(22, -11, 12, 22, 4); paint(ctx, '#ffd23f');
    ctx.fillStyle = '#ffffff'; for (const x of [-18, -2, 12]) star(ctx, x, 0, 4, '#ffffff');
    ctx.restore();
  },
  statue(ctx) {
    ell(ctx, 50, 94, 30, 5); fillOnly(ctx, 'rgba(40,30,20,0.2)');
    ctx.beginPath(); ctx.roundRect(26, 70, 48, 22, 4); paint(ctx, '#e8e0f0');
    ctx.beginPath(); ctx.roundRect(22, 86, 56, 8, 3); paint(ctx, '#d8d0e4');
    const g = ctx.createLinearGradient(30, 10, 70, 70);
    g.addColorStop(0, '#fff2a0'); g.addColorStop(0.5, '#ffc83a'); g.addColorStop(1, '#d9902a');
    // a golden lion, sitting
    ell(ctx, 50, 54, 18, 16); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#a8681a'; ctx.stroke();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; ell(ctx, 50 + Math.cos(a) * 13, 30 + Math.sin(a) * 12, 7, 7); ctx.fillStyle = '#e8a83a'; ctx.fill(); ctx.stroke(); }
    ell(ctx, 50, 30, 13, 12); ctx.fillStyle = g; ctx.fill(); ctx.stroke();
    for (const s of [-1, 1]) { ell(ctx, 50 + s * 5, 29, 1.6, 2); fillOnly(ctx, '#8a4a1a'); }
    ell(ctx, 50, 35, 2.4, 1.8); fillOnly(ctx, '#8a4a1a');
    star(ctx, 82, 14, 5, '#ffffff');
  },
};

// ------------------------------------------------------------------ eggs

// kind: a biome id, 'daily' or 'gift'.
export function paintEgg(ctx, kind, cx, cy, h) {
  const b = BIOMES.find((x) => x.id === kind);
  const w = h * 0.78;
  const eggPath = () => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.bezierCurveTo(cx + w * 0.62, cy - h / 2, cx + w * 0.62, cy + h / 2, cx, cy + h / 2);
    ctx.bezierCurveTo(cx - w * 0.62, cy + h / 2, cx - w * 0.62, cy - h / 2, cx, cy - h / 2);
    ctx.closePath();
  };
  let c1;
  let c2;
  if (kind === 'daily') { c1 = '#fff2a8'; c2 = '#ffb52e'; } else if (kind === 'gift') { c1 = '#ffd6ea'; c2 = '#ff7ab8'; } else { c1 = b.egg1; c2 = b.egg2; }
  const g = ctx.createLinearGradient(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
  g.addColorStop(0, shade(c1, 0.3));
  g.addColorStop(1, c1);
  eggPath();
  ctx.fillStyle = g;
  ctx.fill();
  clipped(ctx, eggPath, () => {
    ctx.fillStyle = c2;
    if (kind === 'daily') {
      for (const [x, y, r] of [[-0.2, -0.2, 0.12], [0.18, 0.05, 0.1], [-0.1, 0.25, 0.09], [0.2, -0.3, 0.07]]) star(ctx, cx + x * w * 1.4, cy + y * h, r * h, c2);
    } else if (kind === 'gift') {
      ctx.fillRect(cx - h * 0.07, cy - h, h * 0.14, h * 2);
      ctx.fillRect(cx - h, cy - h * 0.07, h * 2, h * 0.14);
    } else {
      const i = BIOMES.indexOf(b);
      if (i % 3 === 0) for (const [x, y, r] of [[-0.18, -0.2, 0.09], [0.16, 0, 0.11], [-0.12, 0.22, 0.08], [0.2, 0.3, 0.06], [0.05, -0.36, 0.06]]) { ell(ctx, cx + x * w * 1.4, cy + y * h, r * h, r * h); ctx.fill(); }
      else if (i % 3 === 1) {
        ctx.beginPath();
        for (let k = 0; k < 9; k++) ctx.lineTo(cx - w + k * w * 0.25, cy + (k % 2 ? -1 : 1) * h * 0.06);
        for (let k = 8; k >= 0; k--) ctx.lineTo(cx - w + k * w * 0.25, cy + (k % 2 ? -1 : 1) * h * 0.06 + h * 0.12);
        ctx.fill();
        ctx.fillRect(cx - w, cy - h * 0.3, w * 2, h * 0.06);
      } else for (let k = 0; k < 3; k++) ctx.fillRect(cx - w, cy - h * 0.28 + k * h * 0.24, w * 2, h * 0.07);
    }
    ell(ctx, cx - w * 0.18, cy - h * 0.22, w * 0.14, h * 0.18, -0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  });
  eggPath();
  ctx.lineWidth = Math.max(2, h * 0.03);
  ctx.strokeStyle = ink(c2);
  ctx.stroke();
  if (kind === 'gift') {
    for (const s of [-1, 1]) { ell(ctx, cx + s * h * 0.1, cy - h * 0.52, h * 0.1, h * 0.06, s * 0.5); ctx.fillStyle = c2; ctx.fill(); ctx.stroke(); }
  }
}

function bakeEgg(kind, px) {
  const c = makeCanvas(px, px);
  const ctx = c.getContext('2d');
  paintEgg(ctx, kind, px / 2, px / 2, px * 0.86);
  return c;
}

export const DECO_LIST = DECOS;
