// Everything in Hollowhush Manor is drawn in code: the rooms, the sixty-odd
// props, the thirty-six lost things, the ghosts and the curios. No images, no
// fonts beyond the system stack.
//
// Every drawing takes a context already translated to the top left of its box
// and draws inside (0, 0, w, h). Props get their `tone` (0..1) and `vr` (a
// uint32) so a bookcase is a slightly different bookcase every time without
// ever being random at run time.

// ------------------------------------------------------------- colour help

export function hsl(h, s, l, a = 1) {
  return a >= 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`;
}

// Colours come from three places in this game: hex literals, hsl() built by
// the prop art, and rgb() already produced by shade(). All of them have to
// survive another round of shading, so parse all three.
export function parseColor(col) {
  if (typeof col !== 'string') return [0, 0, 0];
  const s = col.trim();
  if (s[0] === '#') {
    const v = s.slice(1);
    const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
    if (!Number.isFinite(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const nums = s.match(/-?\d*\.?\d+/g);
  if (!nums) return [0, 0, 0];
  if (s.startsWith('hsl')) {
    const h = ((Number(nums[0]) % 360) + 360) % 360;
    const sat = Math.min(1, Math.max(0, Number(nums[1]) / 100));
    const l = Math.min(1, Math.max(0, Number(nums[2]) / 100));
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }
  return [0, 1, 2].map((i) => Math.min(255, Math.max(0, Math.round(Number(nums[i]) || 0))));
}

const hexToRgb = parseColor;

export function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const t = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  const m = (c) => Math.round(c + (t - c) * k);
  return `rgb(${m(r)} ${m(g)} ${m(b)})`;
}

export function mixHex(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(r1, r2)} ${m(g1, g2)} ${m(b1, b2)})`;
}

export function alpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${a})`;
}

// A deterministic little generator from a prop's `vr`.
export function vseq(vr) {
  let s = (vr >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ------------------------------------------------------------ shape help

export function rr(c, x, y, w, h, r) {
  const k = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.beginPath();
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

function fillRR(c, x, y, w, h, r, fill) {
  rr(c, x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
}

function ell(c, x, y, rx, ry, fill) {
  c.beginPath();
  c.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
}

function line(c, x1, y1, x2, y2, col, width = 2) {
  c.strokeStyle = col;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

function poly(c, pts, fill) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
}

// Wood: a flat panel with a couple of grain strokes, cheap and warm.
function wood(c, x, y, w, h, base, rand, grain = 3) {
  fillRR(c, x, y, w, h, Math.min(6, w * 0.08), base);
  c.save();
  rr(c, x, y, w, h, Math.min(6, w * 0.08));
  c.clip();
  c.globalAlpha = 0.16;
  for (let i = 0; i < grain; i++) {
    const gy = y + h * (0.15 + 0.7 * rand());
    line(c, x, gy, x + w, gy + h * 0.02 * (rand() - 0.5), shade(base, -0.5), Math.max(1, h * 0.012));
  }
  c.restore();
  c.globalAlpha = 1;
}

const WOODS = ['#8a5a36', '#7a4a2c', '#9c6b42', '#6b4530', '#a87a4e', '#5d3d2a'];
const FABRICS = ['#8a5570', '#4f6f8a', '#7a6a9a', '#6a8a6a', '#9a6a5a', '#5a6a8a'];
const METALS = ['#9aa0ab', '#b0a07a', '#8d9aa6', '#a8903f'];

function fromList(list, tone) {
  return list[Math.floor(tone * list.length) % list.length];
}

// ------------------------------------------------------------------ props

const PROP_ART = {};

// ---- shelf units ---------------------------------------------------------

function shelfUnit(c, w, h, p, pal, opts) {
  const rand = vseq(p.vr);
  const base = fromList(WOODS, p.tone);
  const dark = shade(base, -0.45);
  wood(c, 0, 0, w, h, base, rand, 2);
  const shelves = opts.shelves;
  const inset = w * 0.07;
  const top = h * 0.05;
  const gap = (h * 0.9) / shelves;
  fillRR(c, inset * 0.5, top * 0.4, w - inset, h * 0.94, 3, shade(base, -0.3));
  for (let i = 0; i < shelves; i++) {
    const y = top + i * gap;
    const inner = { x: inset, y: y + gap * 0.08, w: w - inset * 2, h: gap * 0.78 };
    c.fillStyle = shade(base, -0.62);
    c.fillRect(inner.x, inner.y, inner.w, inner.h);
    if (opts.books) fillBooks(c, inner, rand, pal);
    if (opts.pots) fillPots(c, inner, rand);
    if (opts.jars) fillJars(c, inner, rand);
    if (opts.bottles) fillBottles(c, inner, rand);
    // the shelf board itself
    fillRR(c, inset * 0.6, inner.y + inner.h, w - inset * 1.2, gap * 0.12, 2, shade(base, 0.08));
  }
  if (opts.feet) {
    c.fillStyle = dark;
    c.fillRect(w * 0.06, h * 0.97, w * 0.1, h * 0.03);
    c.fillRect(w * 0.84, h * 0.97, w * 0.1, h * 0.03);
  }
}

function fillBooks(c, box, rand, pal) {
  let x = box.x + 2;
  const hues = [12, 190, 95, 265, 40, 340, 215];
  while (x < box.x + box.w - 6) {
    const bw = box.w * (0.05 + rand() * 0.07);
    const lean = rand() < 0.12;
    const bh = box.h * (0.74 + rand() * 0.24);
    const hue = hues[Math.floor(rand() * hues.length)];
    c.save();
    c.translate(x, box.y + box.h);
    if (lean) c.rotate(-0.22);
    c.fillStyle = hsl(hue, 34, 34 + rand() * 16);
    c.fillRect(0, -bh, bw, bh);
    c.fillStyle = hsl(hue, 30, 68);
    c.fillRect(0, -bh + box.h * 0.08, bw, box.h * 0.035);
    c.restore();
    x += bw + box.w * 0.008;
  }
}

function fillPots(c, box, rand) {
  let x = box.x + box.w * 0.04;
  while (x < box.x + box.w - box.w * 0.14) {
    const pw = box.w * (0.14 + rand() * 0.1);
    const ph = box.h * (0.5 + rand() * 0.35);
    const col = hsl(18 + rand() * 20, 36, 38 + rand() * 14);
    c.fillStyle = col;
    poly(c, [[x, box.y + box.h], [x + pw, box.y + box.h], [x + pw * 0.86, box.y + box.h - ph], [x + pw * 0.14, box.y + box.h - ph]], col);
    fillRR(c, x - pw * 0.04, box.y + box.h - ph - ph * 0.12, pw * 1.08, ph * 0.16, 2, shade(col, 0.22));
    c.globalAlpha = 0.25;
    line(c, x + pw * 0.2, box.y + box.h - ph * 0.8, x + pw * 0.24, box.y + box.h - ph * 0.1, '#000', 2);
    c.globalAlpha = 1;
    x += pw + box.w * 0.04;
  }
}

function fillJars(c, box, rand) {
  let x = box.x + box.w * 0.05;
  while (x < box.x + box.w - box.w * 0.12) {
    const jw = box.w * (0.11 + rand() * 0.07);
    const jh = box.h * (0.55 + rand() * 0.3);
    const y = box.y + box.h - jh;
    fillRR(c, x, y, jw, jh, jw * 0.25, hsl(30 + rand() * 60, 40, 55, 0.75));
    fillRR(c, x + jw * 0.1, y + jh * 0.08, jw * 0.8, jh * 0.3, jw * 0.2, 'rgb(255 255 255 / 0.18)');
    fillRR(c, x - jw * 0.04, y - jh * 0.06, jw * 1.08, jh * 0.12, 2, '#b08a5a');
    x += jw + box.w * 0.05;
  }
}

function fillBottles(c, box, rand) {
  let x = box.x + box.w * 0.04;
  while (x < box.x + box.w - box.w * 0.1) {
    const bw = box.w * (0.1 + rand() * 0.06);
    const bh = box.h * (0.7 + rand() * 0.28);
    const y = box.y + box.h - bh;
    const col = hsl(90 + rand() * 50, 30, 26 + rand() * 12);
    fillRR(c, x, y + bh * 0.3, bw, bh * 0.7, bw * 0.3, col);
    c.fillStyle = col;
    c.fillRect(x + bw * 0.34, y, bw * 0.32, bh * 0.34);
    fillRR(c, x + bw * 0.3, y - bh * 0.03, bw * 0.4, bh * 0.07, 1, '#6a4a2a');
    x += bw + box.w * 0.035;
  }
}

PROP_ART.bookcase = (c, w, h, p, pal) => shelfUnit(c, w, h, p, pal, { shelves: 4, books: true, feet: true });
PROP_ART.bookcaseWide = (c, w, h, p, pal) => shelfUnit(c, w, h, p, pal, { shelves: 3, books: true, feet: true });
PROP_ART.pantryShelf = (c, w, h, p, pal) => shelfUnit(c, w, h, p, pal, { shelves: 3, jars: true, feet: true });
PROP_ART.potShelf = (c, w, h, p, pal) => shelfUnit(c, w, h, p, pal, { shelves: 3, pots: true, feet: true });

PROP_ART.cabinet = (c, w, h, p, pal) => {
  const rand = vseq(p.vr);
  const base = fromList(WOODS, p.tone);
  wood(c, 0, 0, w, h, base, rand, 2);
  // glazed top, doors below
  const topH = h * 0.46;
  c.fillStyle = shade(base, -0.6);
  c.fillRect(w * 0.08, h * 0.05, w * 0.84, topH);
  fillBooks(c, { x: w * 0.1, y: h * 0.07, w: w * 0.8, h: topH * 0.44 }, rand, pal);
  fillJars(c, { x: w * 0.1, y: h * 0.07 + topH * 0.5, w: w * 0.8, h: topH * 0.44 }, rand);
  c.fillStyle = 'rgb(210 236 255 / 0.14)';
  c.fillRect(w * 0.08, h * 0.05, w * 0.84, topH);
  line(c, w * 0.5, h * 0.05, w * 0.5, h * 0.05 + topH, shade(base, 0.1), Math.max(1, w * 0.02));
  for (const dx of [0.1, 0.52]) {
    fillRR(c, w * dx, h * 0.56, w * 0.38, h * 0.38, 4, shade(base, 0.06));
    ell(c, w * (dx + 0.34), h * 0.75, w * 0.022, w * 0.022, '#e8c46a');
  }
};

PROP_ART.dresser = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const base = fromList(WOODS, p.tone);
  wood(c, 0, h * 0.06, w, h * 0.94, base, rand, 2);
  fillRR(c, -w * 0.02, 0, w * 1.04, h * 0.1, 4, shade(base, 0.12));
  for (let i = 0; i < 3; i++) {
    const y = h * (0.16 + i * 0.26);
    fillRR(c, w * 0.08, y, w * 0.84, h * 0.2, 4, shade(base, 0.05));
    fillRR(c, w * 0.4, y + h * 0.08, w * 0.2, h * 0.03, 3, '#e8c46a');
  }
};

PROP_ART.ladderShelf = (c, w, h, p, pal) => {
  const rand = vseq(p.vr);
  const base = fromList(WOODS, p.tone);
  for (const x of [0.04, 0.84]) wood(c, w * x, 0, w * 0.12, h, base, rand, 1);
  for (let i = 0; i < 4; i++) {
    const y = h * (0.08 + i * 0.28);
    fillRR(c, w * 0.02, y, w * 0.96, h * 0.05, 2, shade(base, 0.1));
    if (i < 3) fillBooks(c, { x: w * 0.1, y: y - h * 0.14, w: w * 0.5, h: h * 0.14 }, rand, pal);
  }
};

PROP_ART.wineRack = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const base = fromList(WOODS, p.tone);
  wood(c, 0, 0, w, h, base, rand, 2);
  const cols = 4;
  const rows = 3;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cw = (w * 0.9) / cols;
      const ch = (h * 0.9) / rows;
      const x = w * 0.05 + i * cw;
      const y = h * 0.05 + j * ch;
      c.fillStyle = shade(base, -0.65);
      c.fillRect(x + 2, y + 2, cw - 4, ch - 4);
      if (rand() < 0.78) {
        ell(c, x + cw / 2, y + ch / 2, cw * 0.26, ch * 0.26, hsl(100 + rand() * 40, 26, 22));
        ell(c, x + cw / 2 - cw * 0.07, y + ch / 2 - ch * 0.07, cw * 0.08, ch * 0.08, 'rgb(255 255 255 / 0.2)');
      }
    }
  }
};

// ---- tables --------------------------------------------------------------

function tableLike(c, w, h, p, opts) {
  const rand = vseq(p.vr);
  const base = fromList(WOODS, p.tone);
  const topH = h * (opts.thickTop ? 0.2 : 0.14);
  if (opts.solid) {
    wood(c, 0, topH, w, h - topH, shade(base, -0.18), rand, 2);
    for (let i = 0; i < (opts.drawers || 0); i++) {
      fillRR(c, w * (0.08 + i * 0.3), h * 0.3, w * 0.24, h * 0.22, 3, shade(base, 0.04));
      fillRR(c, w * (0.16 + i * 0.3), h * 0.39, w * 0.08, h * 0.03, 2, '#e8c46a');
    }
  } else {
    const legW = w * 0.08;
    for (const lx of [0.07, 0.85]) wood(c, w * lx, topH, legW, h - topH, shade(base, -0.3), rand, 1);
    if (opts.stretcher) fillRR(c, w * 0.08, h * 0.78, w * 0.84, h * 0.06, 2, shade(base, -0.35));
  }
  fillRR(c, -w * 0.02, 0, w * 1.04, topH, 4, base);
  fillRR(c, -w * 0.02, 0, w * 1.04, topH * 0.35, 4, shade(base, 0.14));
  if (opts.shelf) {
    fillRR(c, w * 0.06, h * 0.56, w * 0.88, h * 0.07, 2, shade(base, -0.1));
    fillPots(c, { x: w * 0.1, y: h * 0.42, w: w * 0.8, h: h * 0.14 }, rand);
  }
}

PROP_ART.table = (c, w, h, p) => tableLike(c, w, h, p, { stretcher: true });
PROP_ART.deskTall = (c, w, h, p) => tableLike(c, w, h, p, { solid: true, drawers: 3, thickTop: true });
PROP_ART.sideTable = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const base = fromList(WOODS, p.tone);
  fillRR(c, 0, 0, w, h * 0.16, 4, base);
  wood(c, w * 0.42, h * 0.16, w * 0.16, h * 0.78, shade(base, -0.3), rand, 1);
  ell(c, w * 0.5, h * 0.97, w * 0.3, h * 0.05, shade(base, -0.4));
};
PROP_ART.counter = (c, w, h, p) => tableLike(c, w, h, p, { solid: true, drawers: 2, thickTop: true });
PROP_ART.workbench = (c, w, h, p) => tableLike(c, w, h, p, { stretcher: true, thickTop: true });
PROP_ART.pottingBench = (c, w, h, p) => tableLike(c, w, h, p, { stretcher: true, shelf: true });

// ---- seating -------------------------------------------------------------

PROP_ART.armchair = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const cloth = fromList(FABRICS, p.tone);
  fillRR(c, w * 0.1, 0, w * 0.8, h * 0.72, w * 0.16, cloth);
  fillRR(c, w * 0.18, h * 0.08, w * 0.64, h * 0.5, w * 0.12, shade(cloth, 0.12));
  fillRR(c, 0, h * 0.34, w * 0.22, h * 0.44, w * 0.1, shade(cloth, -0.12));
  fillRR(c, w * 0.78, h * 0.34, w * 0.22, h * 0.44, w * 0.1, shade(cloth, -0.12));
  fillRR(c, w * 0.12, h * 0.58, w * 0.76, h * 0.2, w * 0.08, shade(cloth, 0.06));
  const leg = shade('#6b4530', -0.1);
  c.fillStyle = leg;
  c.fillRect(w * 0.14, h * 0.76, w * 0.08, h * 0.22);
  c.fillRect(w * 0.78, h * 0.76, w * 0.08, h * 0.22);
  if (rand() < 0.5) {
    fillRR(c, w * 0.3, h * 0.46, w * 0.26, h * 0.18, w * 0.06, shade(cloth, 0.3));
  }
};

PROP_ART.sofa = (c, w, h, p) => {
  const cloth = fromList(FABRICS, p.tone);
  fillRR(c, w * 0.04, 0, w * 0.92, h * 0.62, h * 0.18, cloth);
  for (let i = 0; i < 3; i++) fillRR(c, w * (0.1 + i * 0.27), h * 0.1, w * 0.24, h * 0.36, h * 0.1, shade(cloth, 0.12));
  fillRR(c, 0, h * 0.26, w * 0.14, h * 0.48, h * 0.12, shade(cloth, -0.12));
  fillRR(c, w * 0.86, h * 0.26, w * 0.14, h * 0.48, h * 0.12, shade(cloth, -0.12));
  fillRR(c, w * 0.08, h * 0.5, w * 0.84, h * 0.26, h * 0.1, shade(cloth, 0.05));
  c.fillStyle = '#5d3d2a';
  c.fillRect(w * 0.12, h * 0.74, w * 0.07, h * 0.24);
  c.fillRect(w * 0.81, h * 0.74, w * 0.07, h * 0.24);
};

PROP_ART.stool = (c, w, h, p) => {
  const base = fromList(WOODS, p.tone);
  fillRR(c, 0, 0, w, h * 0.18, 4, base);
  c.fillStyle = shade(base, -0.3);
  for (const dx of [0.14, 0.72]) {
    c.save();
    c.translate(w * dx, h * 0.16);
    c.rotate(dx < 0.5 ? 0.06 : -0.06);
    c.fillRect(0, 0, w * 0.13, h * 0.84);
    c.restore();
  }
  fillRR(c, w * 0.12, h * 0.6, w * 0.76, h * 0.07, 2, shade(base, -0.2));
};

PROP_ART.rockingChair = (c, w, h, p) => {
  const base = fromList(WOODS, p.tone);
  const dark = shade(base, -0.35);
  c.strokeStyle = dark;
  c.lineWidth = Math.max(2, w * 0.05);
  for (let i = 0; i < 5; i++) line(c, w * (0.2 + i * 0.12), h * 0.04, w * (0.2 + i * 0.12), h * 0.52, base, Math.max(2, w * 0.04));
  fillRR(c, w * 0.14, h * 0.0, w * 0.62, h * 0.07, 3, dark);
  fillRR(c, w * 0.1, h * 0.5, w * 0.76, h * 0.1, 4, base);
  line(c, w * 0.16, h * 0.6, w * 0.2, h * 0.88, dark, Math.max(2, w * 0.05));
  line(c, w * 0.78, h * 0.6, w * 0.74, h * 0.88, dark, Math.max(2, w * 0.05));
  c.beginPath();
  c.strokeStyle = dark;
  c.lineWidth = Math.max(2, w * 0.05);
  c.moveTo(w * 0.02, h * 0.86);
  c.quadraticCurveTo(w * 0.5, h * 1.02, w * 0.98, h * 0.86);
  c.stroke();
};

PROP_ART.cushionPile = (c, w, h, p) => {
  const rand = vseq(p.vr);
  for (let i = 0; i < 3; i++) {
    const col = fromList(FABRICS, (p.tone + i * 0.3) % 1);
    const y = h * (0.56 - i * 0.26);
    c.save();
    c.translate(w * 0.5, y + h * 0.2);
    c.rotate((rand() - 0.5) * 0.3);
    fillRR(c, -w * 0.44, -h * 0.2, w * 0.88, h * 0.4, h * 0.14, col);
    fillRR(c, -w * 0.3, -h * 0.12, w * 0.6, h * 0.16, h * 0.08, shade(col, 0.12));
    c.restore();
  }
};

// ---- chests --------------------------------------------------------------

function crateArt(c, w, h, p, front) {
  const rand = vseq(p.vr);
  const base = fromList(WOODS, p.tone);
  wood(c, 0, 0, w, h, base, rand, 2);
  c.strokeStyle = shade(base, -0.45);
  c.lineWidth = Math.max(2, w * 0.035);
  for (const y of [0.16, 0.5, 0.84]) line(c, w * 0.04, h * y, w * 0.96, h * y, shade(base, -0.45), Math.max(2, h * 0.04));
  line(c, w * 0.06, h * 0.9, w * 0.94, h * 0.14, shade(base, -0.3), Math.max(1, w * 0.02));
  if (front) {
    fillRR(c, w * 0.1, h * 0.02, w * 0.8, h * 0.1, 3, shade(base, 0.12));
    if (rand() < 0.6) fillRR(c, w * 0.26, h * -0.04, w * 0.46, h * 0.08, 3, shade(base, -0.2));
  }
}

PROP_ART.crate = (c, w, h, p) => crateArt(c, w, h, p, false);
PROP_ART.crateFront = (c, w, h, p) => crateArt(c, w, h, p, true);

PROP_ART.trunk = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const base = fromList(['#6a4a8a', '#8a5a3a', '#3a5a7a', '#6a3a3a'], p.tone);
  fillRR(c, 0, h * 0.3, w, h * 0.7, w * 0.05, base);
  fillRR(c, -w * 0.01, h * 0.08, w * 1.02, h * 0.3, w * 0.08, shade(base, 0.1));
  for (const x of [0.16, 0.74]) {
    c.fillStyle = '#c9a24a';
    c.fillRect(w * x, h * 0.1, w * 0.1, h * 0.88);
  }
  fillRR(c, w * 0.42, h * 0.34, w * 0.16, h * 0.16, 3, '#e8c46a');
  if (rand() < 0.5) line(c, w * 0.08, h * 0.6, w * 0.92, h * 0.6, shade(base, -0.3), Math.max(1, h * 0.02));
};

PROP_ART.barrel = (c, w, h, p) => {
  const base = fromList(WOODS, p.tone);
  c.beginPath();
  c.moveTo(w * 0.14, h * 0.02);
  c.quadraticCurveTo(w * -0.04, h * 0.5, w * 0.14, h * 0.98);
  c.lineTo(w * 0.86, h * 0.98);
  c.quadraticCurveTo(w * 1.04, h * 0.5, w * 0.86, h * 0.02);
  c.closePath();
  c.fillStyle = base;
  c.fill();
  for (let i = 0; i < 4; i++) line(c, w * 0.08, h * (0.1 + i * 0.25), w * 0.92, h * (0.1 + i * 0.25), shade(base, -0.45), Math.max(1, w * 0.02));
  for (const y of [0.16, 0.8]) fillRR(c, w * 0.04, h * y, w * 0.92, h * 0.07, 2, '#8a8a96');
  ell(c, w * 0.5, h * 0.05, w * 0.36, h * 0.05, shade(base, 0.16));
};

PROP_ART.sack = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const base = fromList(['#b9a584', '#a8946f', '#c2b093'], p.tone);
  c.beginPath();
  c.moveTo(w * 0.5, h * 0.06);
  c.bezierCurveTo(w * 0.06, h * 0.3, w * 0.02, h * 1.0, w * 0.5, h);
  c.bezierCurveTo(w * 0.98, h * 1.0, w * 0.94, h * 0.3, w * 0.5, h * 0.06);
  c.fillStyle = base;
  c.fill();
  fillRR(c, w * 0.38, h * 0.0, w * 0.24, h * 0.14, 4, shade(base, -0.2));
  c.globalAlpha = 0.2;
  for (let i = 0; i < 3; i++) line(c, w * 0.2, h * (0.4 + i * 0.18), w * 0.8, h * (0.42 + i * 0.18), shade(base, -0.6), 2);
  c.globalAlpha = 1;
  if (rand() < 0.4) line(c, w * 0.4, h * 0.14, w * 0.6, h * 0.14, '#8a6a4a', 3);
};

PROP_ART.suitcase = (c, w, h, p) => {
  const base = fromList(['#7a5236', '#5a4030', '#8a6a4a'], p.tone);
  fillRR(c, 0, 0, w, h, w * 0.04, base);
  line(c, 0, h * 0.42, w, h * 0.42, shade(base, -0.4), Math.max(2, h * 0.05));
  for (const x of [0.2, 0.68]) fillRR(c, w * x, h * -0.02, w * 0.12, h * 1.04, 2, shade(base, -0.25));
  fillRR(c, w * 0.42, h * -0.08, w * 0.16, h * 0.1, 3, '#3a2a22');
  fillRR(c, w * 0.08, h * 0.34, w * 0.07, h * 0.14, 2, '#d8b45a');
};

PROP_ART.hatbox = (c, w, h, p) => {
  const base = fromList(['#c08aa0', '#8aa0c0', '#c0b08a', '#a0c08a'], p.tone);
  fillRR(c, 0, h * 0.18, w, h * 0.82, w * 0.06, base);
  ell(c, w * 0.5, h * 0.2, w * 0.52, h * 0.18, shade(base, 0.14));
  line(c, w * 0.5, h * 0.2, w * 0.5, h, shade(base, -0.2), 2);
  c.globalAlpha = 0.5;
  for (let i = 0; i < 4; i++) line(c, w * (0.1 + i * 0.25), h * 0.3, w * (0.1 + i * 0.25), h, shade(base, -0.3), Math.max(1, w * 0.02));
  c.globalAlpha = 1;
};

// ---- tall things ---------------------------------------------------------

PROP_ART.clock = (c, w, h, p) => {
  const base = fromList(WOODS, p.tone);
  const rand = vseq(p.vr);
  wood(c, 0, 0, w, h, base, rand, 2);
  fillRR(c, w * 0.08, h * 0.04, w * 0.84, h * 0.3, w * 0.1, shade(base, -0.2));
  ell(c, w * 0.5, h * 0.19, w * 0.3, w * 0.3, '#f4ecd8');
  ell(c, w * 0.5, h * 0.19, w * 0.26, w * 0.26, '#fff8e8');
  line(c, w * 0.5, h * 0.19, w * 0.5, h * 0.19 - w * 0.18, '#3a2a2a', 2);
  line(c, w * 0.5, h * 0.19, w * 0.5 + w * 0.14, h * 0.19 + w * 0.05, '#3a2a2a', 2);
  c.fillStyle = shade(base, -0.65);
  c.fillRect(w * 0.18, h * 0.4, w * 0.64, h * 0.45);
  c.fillStyle = 'rgb(255 240 200 / 0.1)';
  c.fillRect(w * 0.18, h * 0.4, w * 0.64, h * 0.45);
  line(c, w * 0.5, h * 0.4, w * 0.5, h * 0.74, '#c9a24a', 2);
  ell(c, w * 0.5, h * 0.78, w * 0.1, w * 0.1, '#e8c46a');
  fillRR(c, w * 0.04, h * 0.86, w * 0.92, h * 0.12, 4, shade(base, 0.08));
};

PROP_ART.hatStand = (c, w, h, p) => {
  const base = fromList(WOODS, p.tone);
  c.fillStyle = shade(base, -0.2);
  c.fillRect(w * 0.44, h * 0.04, w * 0.12, h * 0.92);
  ell(c, w * 0.5, h * 0.97, w * 0.3, h * 0.03, shade(base, -0.4));
  for (const [dx, dy] of [[0.16, 0.1], [0.84, 0.14], [0.22, 0.26], [0.78, 0.3]]) {
    c.strokeStyle = shade(base, -0.1);
    c.lineWidth = Math.max(2, w * 0.05);
    c.beginPath();
    c.moveTo(w * 0.5, h * (dy + 0.04));
    c.quadraticCurveTo(w * ((dx + 0.5) / 2), h * dy, w * dx, h * (dy + 0.03));
    c.stroke();
    ell(c, w * dx, h * (dy + 0.03), w * 0.035, w * 0.035, '#e8c46a');
  }
  // a hat, because it is a hat stand
  const hat = fromList(FABRICS, (p.tone + 0.4) % 1);
  ell(c, w * 0.26, h * 0.12, w * 0.19, h * 0.025, shade(hat, -0.2));
  fillRR(c, w * 0.14, h * 0.07, w * 0.24, h * 0.05, 4, hat);
};

PROP_ART.ladder = (c, w, h, p) => {
  const base = fromList(WOODS, p.tone);
  const rand = vseq(p.vr);
  wood(c, w * 0.06, 0, w * 0.12, h, base, rand, 1);
  wood(c, w * 0.82, 0, w * 0.12, h, base, rand, 1);
  for (let i = 0; i < 5; i++) fillRR(c, w * 0.08, h * (0.08 + i * 0.21), w * 0.84, h * 0.045, 2, shade(base, 0.08));
};

PROP_ART.globeStand = (c, w, h, p) => {
  const base = fromList(WOODS, p.tone);
  ell(c, w * 0.5, h * 0.34, w * 0.4, w * 0.4, '#5f86b8');
  c.save();
  ell(c, w * 0.5, h * 0.34, w * 0.4, w * 0.4);
  c.clip();
  const rand = vseq(p.vr);
  for (let i = 0; i < 9; i++) {
    const cx = w * (0.16 + rand() * 0.68);
    const cy = h * 0.34 + (rand() - 0.5) * w * 0.62;
    const r = w * (0.05 + rand() * 0.07);
    c.beginPath();
    c.moveTo(cx + r, cy);
    for (let k = 1; k <= 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const rr2 = r * (0.6 + rand() * 0.7);
      c.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2 * 0.8);
    }
    c.closePath();
    c.fillStyle = i % 3 ? '#86bf6a' : '#6ea85a';
    c.fill();
  }
  // a hint of sphere shading
  const sg = c.createRadialGradient(w * 0.36, h * 0.24, w * 0.05, w * 0.5, h * 0.34, w * 0.44);
  sg.addColorStop(0, 'rgb(255 255 255 / 0.28)');
  sg.addColorStop(0.6, 'rgb(255 255 255 / 0)');
  sg.addColorStop(1, 'rgb(20 20 50 / 0.3)');
  c.fillStyle = sg;
  c.fillRect(0, 0, w, h);
  c.restore();
  c.strokeStyle = '#c9a24a';
  c.lineWidth = Math.max(2, w * 0.035);
  c.beginPath();
  c.arc(w * 0.5, h * 0.34, w * 0.44, Math.PI * 0.1, Math.PI * 1.1);
  c.stroke();
  c.fillStyle = shade(base, -0.2);
  c.fillRect(w * 0.44, h * 0.6, w * 0.12, h * 0.36);
  ell(c, w * 0.5, h * 0.97, w * 0.26, h * 0.04, shade(base, -0.4));
};

PROP_ART.telescope = (c, w, h, p) => {
  const metal = fromList(METALS, p.tone);
  c.save();
  c.translate(w * 0.5, h * 0.3);
  c.rotate(-0.42);
  fillRR(c, -w * 0.38, -h * 0.07, w * 0.76, h * 0.14, h * 0.07, metal);
  fillRR(c, w * 0.26, -h * 0.09, w * 0.16, h * 0.18, h * 0.06, shade(metal, -0.25));
  fillRR(c, -w * 0.42, -h * 0.05, w * 0.1, h * 0.1, h * 0.04, shade(metal, 0.2));
  line(c, -w * 0.1, -h * 0.07, -w * 0.1, h * 0.07, shade(metal, -0.4), 2);
  c.restore();
  const base = '#5d3d2a';
  c.fillStyle = base;
  c.fillRect(w * 0.44, h * 0.38, w * 0.1, h * 0.52);
  poly(c, [[w * 0.26, h], [w * 0.74, h], [w * 0.6, h * 0.86], [w * 0.4, h * 0.86]], shade(base, 0.08));
  line(c, w * 0.5, h * 0.4, w * 0.72, h * 0.6, base, Math.max(2, w * 0.03));
};

PROP_ART.orrery = (c, w, h, p) => {
  const metal = fromList(METALS, p.tone);
  const rand = vseq(p.vr);
  ell(c, w * 0.5, h * 0.3, w * 0.09, w * 0.09, '#ffd477');
  for (let i = 0; i < 3; i++) {
    const r = w * (0.16 + i * 0.12);
    c.strokeStyle = shade(metal, -0.1);
    c.lineWidth = Math.max(1, w * 0.012);
    c.beginPath();
    c.ellipse(w * 0.5, h * 0.3, r, r * 0.32, 0, 0, Math.PI * 2);
    c.stroke();
    const a = rand() * Math.PI * 2;
    ell(c, w * 0.5 + Math.cos(a) * r, h * 0.3 + Math.sin(a) * r * 0.32, w * 0.035, w * 0.035, hsl(200 + i * 60, 50, 62));
  }
  c.fillStyle = shade(metal, -0.3);
  c.fillRect(w * 0.45, h * 0.52, w * 0.1, h * 0.4);
  ell(c, w * 0.5, h * 0.95, w * 0.24, h * 0.05, shade(metal, -0.45));
};

PROP_ART.gramophone = (c, w, h, p) => {
  const metal = fromList(['#c9a24a', '#b08a3a', '#9aa0ab'], p.tone);
  const base = '#5d3d2a';
  fillRR(c, w * 0.22, h * 0.52, w * 0.56, h * 0.44, 6, base);
  fillRR(c, w * 0.26, h * 0.5, w * 0.48, h * 0.08, 4, shade(base, 0.14));
  // the horn: a narrow throat opening into a wide bell
  c.save();
  c.translate(w * 0.46, h * 0.46);
  c.rotate(-0.62);
  c.beginPath();
  c.moveTo(0, w * 0.05);
  c.quadraticCurveTo(w * 0.26, w * 0.02, w * 0.4, w * 0.3);
  c.lineTo(w * 0.62, w * 0.24);
  c.quadraticCurveTo(w * 0.42, -w * 0.3, 0, -w * 0.05);
  c.closePath();
  c.fillStyle = metal;
  c.fill();
  // the bell mouth
  c.save();
  c.translate(w * 0.5, w * 0.0);
  c.rotate(0.35);
  ell(c, 0, 0, w * 0.17, w * 0.3, shade(metal, 0.18));
  ell(c, 0, 0, w * 0.11, w * 0.22, shade(metal, -0.35));
  c.restore();
  c.restore();
  // the turntable and a record
  ell(c, w * 0.52, h * 0.52, w * 0.2, w * 0.06, shade(base, 0.2));
  ell(c, w * 0.52, h * 0.51, w * 0.17, w * 0.05, '#2b2b32');
  ell(c, w * 0.52, h * 0.51, w * 0.04, w * 0.013, '#c9a24a');
  line(c, w * 0.74, h * 0.4, w * 0.56, h * 0.5, shade(metal, -0.2), Math.max(1.5, w * 0.022));
};

PROP_ART.piano = (c, w, h, p) => {
  const body = fromList(['#2a2229', '#3a2a2a', '#241f2c'], p.tone);
  fillRR(c, 0, h * 0.2, w, h * 0.6, w * 0.03, body);
  fillRR(c, -w * 0.01, h * 0.12, w * 1.02, h * 0.12, w * 0.02, shade(body, 0.2));
  // keys
  const kx = w * 0.12;
  const kw = w * 0.76;
  fillRR(c, kx, h * 0.44, kw, h * 0.14, 3, '#f6f1e4');
  const keys = 18;
  for (let i = 1; i < keys; i++) line(c, kx + (kw / keys) * i, h * 0.44, kx + (kw / keys) * i, h * 0.58, '#cfc6b4', 1);
  for (let i = 0; i < keys; i++) {
    if ([2, 6, 9, 13, 16].includes(i % 17)) {
      c.fillStyle = '#2a2429';
      c.fillRect(kx + (kw / keys) * (i + 0.72), h * 0.44, (kw / keys) * 0.56, h * 0.085);
    }
  }
  c.fillStyle = shade(body, -0.2);
  c.fillRect(w * 0.08, h * 0.8, w * 0.1, h * 0.2);
  c.fillRect(w * 0.82, h * 0.8, w * 0.1, h * 0.2);
  fillRR(c, w * 0.42, h * 0.84, w * 0.16, h * 0.1, 2, '#c9a24a');
};

PROP_ART.harp = (c, w, h, p) => {
  const base = fromList(['#c9a24a', '#a8853a'], p.tone);
  // soundbox down the right, neck curving over the top, pillar on the left
  c.beginPath();
  c.moveTo(w * 0.62, h * 0.98);
  c.quadraticCurveTo(w * 0.86, h * 0.5, w * 0.68, h * 0.1);
  c.lineTo(w * 0.52, h * 0.12);
  c.quadraticCurveTo(w * 0.66, h * 0.52, w * 0.44, h * 0.98);
  c.closePath();
  c.fillStyle = shade(base, -0.25);
  c.fill();
  c.strokeStyle = base;
  c.lineWidth = Math.max(4, w * 0.085);
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(w * 0.6, h * 0.12);
  c.quadraticCurveTo(w * 0.34, h * -0.04, w * 0.14, h * 0.26);
  c.stroke();
  c.beginPath();
  c.moveTo(w * 0.14, h * 0.26);
  c.quadraticCurveTo(w * 0.2, h * 0.62, w * 0.46, h * 0.94);
  c.stroke();
  // strings
  c.globalAlpha = 0.8;
  for (let i = 1; i < 13; i++) {
    const t = i / 13;
    const x0 = w * (0.58 - 0.4 * t);
    const y0 = h * (0.14 + 0.2 * t * t);
    const x1 = w * (0.5 + 0.08 * (1 - t));
    const y1 = h * (0.18 + 0.78 * t);
    line(c, x0, y0, x1, y1, i % 4 === 0 ? '#ffd9a8' : '#f4ecd8', 1.2);
  }
  c.globalAlpha = 1;
  poly(c, [[w * 0.34, h], [w * 0.74, h], [w * 0.66, h * 0.93], [w * 0.42, h * 0.93]], shade(base, -0.4));
};

PROP_ART.brokenMirror = (c, w, h, p) => {
  const base = fromList(WOODS, p.tone);
  const rand = vseq(p.vr);
  fillRR(c, 0, 0, w, h, w * 0.08, base);
  fillRR(c, w * 0.1, h * 0.06, w * 0.8, h * 0.88, w * 0.06, '#9fb4c4');
  c.save();
  rr(c, w * 0.1, h * 0.06, w * 0.8, h * 0.88, w * 0.06);
  c.clip();
  c.fillStyle = 'rgb(255 255 255 / 0.18)';
  poly(c, [[w * 0.1, h * 0.5], [w * 0.9, h * 0.1], [w * 0.9, h * 0.3], [w * 0.1, h * 0.72]], 'rgb(255 255 255 / 0.16)');
  c.strokeStyle = 'rgb(255 255 255 / 0.5)';
  c.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.moveTo(w * (0.2 + rand() * 0.6), h * 0.06);
    c.lineTo(w * (0.2 + rand() * 0.6), h * (0.4 + rand() * 0.5));
    c.stroke();
  }
  c.restore();
};

PROP_ART.stove = (c, w, h, p) => {
  const body = fromList(['#3a3238', '#2f2a30', '#4a3c38'], p.tone);
  fillRR(c, 0, h * 0.1, w, h * 0.9, w * 0.05, body);
  fillRR(c, -w * 0.02, h * 0.04, w * 1.04, h * 0.1, 4, shade(body, 0.2));
  for (const dx of [0.2, 0.62]) ell(c, w * (dx + 0.09), h * 0.09, w * 0.08, h * 0.02, shade(body, -0.4));
  fillRR(c, w * 0.1, h * 0.26, w * 0.52, h * 0.38, 5, shade(body, -0.3));
  fillRR(c, w * 0.16, h * 0.32, w * 0.4, h * 0.26, 3, '#ff9a3a');
  fillRR(c, w * 0.2, h * 0.4, w * 0.32, h * 0.16, 3, '#ffd477');
  fillRR(c, w * 0.68, h * 0.26, w * 0.24, h * 0.6, 4, shade(body, 0.08));
  ell(c, w * 0.8, h * 0.46, w * 0.05, w * 0.05, '#c9a24a');
  c.fillStyle = shade(body, -0.5);
  c.fillRect(w * 0.06, h * 0.94, w * 0.1, h * 0.06);
  c.fillRect(w * 0.84, h * 0.94, w * 0.1, h * 0.06);
};

PROP_ART.dressForm = (c, w, h, p) => {
  const cloth = fromList(['#d8c4a8', '#c9a8b8', '#a8c0c9'], p.tone);
  c.beginPath();
  c.moveTo(w * 0.5, h * 0.02);
  c.bezierCurveTo(w * 0.9, h * 0.12, w * 0.78, h * 0.34, w * 0.72, h * 0.44);
  c.bezierCurveTo(w * 0.9, h * 0.52, w * 0.84, h * 0.62, w * 0.5, h * 0.64);
  c.bezierCurveTo(w * 0.16, h * 0.62, w * 0.1, h * 0.52, w * 0.28, h * 0.44);
  c.bezierCurveTo(w * 0.22, h * 0.34, w * 0.1, h * 0.12, w * 0.5, h * 0.02);
  c.fillStyle = cloth;
  c.fill();
  c.fillStyle = shade(cloth, -0.5);
  c.fillRect(w * 0.45, h * 0.62, w * 0.1, h * 0.3);
  ell(c, w * 0.5, h * 0.95, w * 0.26, h * 0.04, shade(cloth, -0.6));
  line(c, w * 0.3, h * 0.3, w * 0.7, h * 0.3, shade(cloth, -0.25), 2);
};

// ---- plants --------------------------------------------------------------

function leafFan(c, cx, cy, size, count, col, rand, spread = Math.PI) {
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i / (count - 1) - 0.5) * spread + (rand() - 0.5) * 0.2;
    const len = size * (0.7 + rand() * 0.5);
    const wide = size * (0.16 + rand() * 0.08);
    c.save();
    c.translate(cx, cy);
    c.rotate(a);
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(wide, -len * 0.6, 0, -len);
    c.quadraticCurveTo(-wide, -len * 0.6, 0, 0);
    c.fillStyle = i % 2 ? col : shade(col, 0.16);
    c.fill();
    // midrib and a couple of veins, so a frond reads as a leaf
    line(c, 0, 0, 0, -len * 0.94, shade(col, 0.3), Math.max(1, size * 0.012));
    c.globalAlpha = 0.45;
    for (let v = 1; v < 4; v++) {
      const t = v / 4;
      const vw = wide * (1 - t) * 0.9;
      line(c, 0, -len * t, vw, -len * (t + 0.13), shade(col, 0.34), 1);
      line(c, 0, -len * t, -vw, -len * (t + 0.13), shade(col, 0.34), 1);
    }
    c.globalAlpha = 1;
    c.restore();
  }
}

PROP_ART.fern = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const green = hsl(100 + p.tone * 40, 40, 40 + p.tone * 10);
  const potCol = hsl(20, 34, 40);
  leafFan(c, w * 0.5, h * 0.66, w * 0.46, 11, green, rand, Math.PI * 1.1);
  poly(c, [[w * 0.26, h], [w * 0.74, h], [w * 0.68, h * 0.58], [w * 0.32, h * 0.58]], potCol);
  fillRR(c, w * 0.28, h * 0.54, w * 0.44, h * 0.08, 3, shade(potCol, 0.14));
};

PROP_ART.potPlant = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const green = hsl(130 + p.tone * 50, 38, 42);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (rand() - 0.5) * 1.5;
    c.save();
    c.translate(w * 0.5, h * 0.52);
    c.rotate(a);
    c.strokeStyle = green;
    c.lineWidth = Math.max(2, w * 0.03);
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(w * 0.1, -h * 0.2, 0, -h * (0.26 + rand() * 0.2));
    c.stroke();
    ell(c, 0, -h * (0.26 + rand() * 0.18), w * 0.09, w * 0.06, shade(green, 0.15));
    c.restore();
  }
  const potCol = hsl(16, 36, 40);
  poly(c, [[w * 0.3, h], [w * 0.7, h], [w * 0.76, h * 0.5], [w * 0.24, h * 0.5]], potCol);
  fillRR(c, w * 0.2, h * 0.46, w * 0.6, h * 0.1, 3, shade(potCol, 0.18));
};

PROP_ART.tallPalm = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const green = hsl(118 + p.tone * 34, 38, 40);
  c.strokeStyle = '#7a5a3a';
  c.lineWidth = Math.max(3, w * 0.06);
  c.beginPath();
  c.moveTo(w * 0.5, h * 0.66);
  c.quadraticCurveTo(w * 0.44, h * 0.4, w * 0.5, h * 0.18);
  c.stroke();
  leafFan(c, w * 0.5, h * 0.2, w * 0.5, 9, green, rand, Math.PI * 1.6);
  const potCol = hsl(18, 38, 38);
  poly(c, [[w * 0.32, h], [w * 0.68, h], [w * 0.64, h * 0.66], [w * 0.36, h * 0.66]], potCol);
};

PROP_ART.vineBox = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const boxCol = fromList(WOODS, p.tone);
  wood(c, 0, h * 0.42, w, h * 0.58, boxCol, rand, 2);
  const green = hsl(110 + p.tone * 40, 40, 40);
  for (let i = 0; i < 9; i++) {
    const x = w * (0.06 + (i / 9) * 0.9);
    c.strokeStyle = green;
    c.lineWidth = Math.max(2, w * 0.016);
    c.beginPath();
    c.moveTo(x, h * 0.44);
    c.quadraticCurveTo(x + (rand() - 0.5) * w * 0.1, h * 0.24, x + (rand() - 0.5) * w * 0.14, h * (0.02 + rand() * 0.14));
    c.stroke();
    for (let j = 0; j < 3; j++) {
      ell(c, x + (rand() - 0.5) * w * 0.1, h * (0.1 + j * 0.12), w * 0.028, w * 0.02, shade(green, 0.18));
    }
  }
};

PROP_ART.mushrooms = (c, w, h, p) => {
  const rand = vseq(p.vr);
  for (let i = 0; i < 4; i++) {
    const x = w * (0.16 + i * 0.22 + (rand() - 0.5) * 0.08);
    const s = w * (0.12 + rand() * 0.1);
    c.fillStyle = '#efe4d2';
    c.fillRect(x - s * 0.18, h - s * 1.1, s * 0.36, s * 1.1);
    ell(c, x, h - s * 1.0, s * 0.6, s * 0.46, hsl(10 + rand() * 20, 46, 46));
    ell(c, x - s * 0.2, h - s * 1.1, s * 0.1, s * 0.07, 'rgb(255 255 255 / 0.5)');
  }
};

// ---- small clutter -------------------------------------------------------

PROP_ART.bookStack = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const bh = h / n;
    const y = h - (i + 1) * bh;
    const off = (rand() - 0.5) * w * 0.16;
    fillRR(c, w * 0.06 + off, y + bh * 0.1, w * 0.88, bh * 0.82, 2, hsl([12, 190, 95, 265, 40][i % 5], 32, 36));
    fillRR(c, w * 0.06 + off, y + bh * 0.1, w * 0.1, bh * 0.82, 2, '#f1e8d4');
  }
};

PROP_ART.bucket = (c, w, h, p) => {
  const metal = fromList(METALS, p.tone);
  poly(c, [[w * 0.14, h * 0.18], [w * 0.86, h * 0.18], [w * 0.74, h], [w * 0.26, h]], metal);
  ell(c, w * 0.5, h * 0.18, w * 0.36, h * 0.07, shade(metal, 0.18));
  c.strokeStyle = shade(metal, -0.3);
  c.lineWidth = Math.max(2, w * 0.03);
  c.beginPath();
  c.arc(w * 0.5, h * 0.2, w * 0.36, Math.PI, Math.PI * 2);
  c.stroke();
  line(c, w * 0.2, h * 0.6, w * 0.8, h * 0.6, shade(metal, -0.2), Math.max(1, h * 0.03));
};

PROP_ART.wateringCan = (c, w, h, p) => {
  const metal = fromList(['#7fa8b8', '#9aa0ab', '#8aa87f'], p.tone);
  fillRR(c, w * 0.18, h * 0.3, w * 0.52, h * 0.66, w * 0.08, metal);
  ell(c, w * 0.44, h * 0.3, w * 0.26, h * 0.07, shade(metal, 0.2));
  c.strokeStyle = metal;
  c.lineWidth = Math.max(3, w * 0.06);
  c.beginPath();
  c.moveTo(w * 0.66, h * 0.44);
  c.quadraticCurveTo(w * 0.98, h * 0.3, w * 0.92, h * 0.08);
  c.stroke();
  ell(c, w * 0.9, h * 0.06, w * 0.1, h * 0.05, shade(metal, 0.1));
  c.beginPath();
  c.moveTo(w * 0.24, h * 0.32);
  c.quadraticCurveTo(w * 0.08, h * 0.18, w * 0.3, h * 0.12);
  c.stroke();
};

PROP_ART.bottles = (c, w, h, p) => {
  const rand = vseq(p.vr);
  fillBottles(c, { x: 0, y: 0, w, h }, rand);
};

PROP_ART.pots = (c, w, h, p) => {
  const rand = vseq(p.vr);
  fillPots(c, { x: 0, y: 0, w, h }, rand);
};

PROP_ART.cheeseWheel = (c, w, h, p) => {
  const rand = vseq(p.vr);
  fillRR(c, w * 0.06, h * 0.2, w * 0.88, h * 0.76, w * 0.08, '#e8c46a');
  ell(c, w * 0.5, h * 0.22, w * 0.44, h * 0.14, '#f4d888');
  for (let i = 0; i < 5; i++) ell(c, w * (0.2 + rand() * 0.6), h * (0.4 + rand() * 0.45), w * 0.05, w * 0.045, '#d8b45a');
};

PROP_ART.toyBlocks = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const letters = ['A', 'B', 'C', 'M', 'G', 'H'];
  for (let i = 0; i < 5; i++) {
    const s = w * (0.22 + rand() * 0.08);
    const x = w * (0.04 + rand() * 0.66);
    const y = h - s * (1 + Math.floor(rand() * 2) * 0.9);
    fillRR(c, x, y, s, s, 3, hsl([8, 44, 120, 210, 280][i % 5], 56, 56));
    c.fillStyle = 'rgb(255 255 255 / 0.85)';
    c.font = `900 ${s * 0.62}px ui-rounded, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(letters[i % letters.length], x + s / 2, y + s * 0.56);
  }
};

PROP_ART.rolledRugs = (c, w, h, p) => {
  const rand = vseq(p.vr);
  for (let i = 0; i < 3; i++) {
    const col = fromList(FABRICS, (p.tone + i * 0.27) % 1);
    const y = h * (0.9 - i * 0.3);
    c.save();
    c.translate(w * (0.1 + rand() * 0.1), y);
    c.rotate(-0.12 - rand() * 0.1);
    fillRR(c, 0, -h * 0.26, w * 0.8, h * 0.26, h * 0.12, col);
    ell(c, w * 0.78, -h * 0.13, h * 0.05, h * 0.12, shade(col, 0.2));
    c.restore();
  }
};

PROP_ART.dustpan = (c, w, h, p) => {
  const metal = fromList(METALS, p.tone);
  poly(c, [[w * 0.18, h * 0.5], [w * 0.92, h * 0.42], [w * 0.88, h], [w * 0.22, h]], metal);
  c.strokeStyle = '#8a6a4a';
  c.lineWidth = Math.max(3, w * 0.06);
  line(c, w * 0.2, h * 0.5, w * 0.06, h * 0.06, '#8a6a4a', Math.max(3, w * 0.06));
  // a little broom head
  poly(c, [[w * 0.5, h * 0.56], [w * 0.8, h * 0.5], [w * 0.84, h * 0.88], [w * 0.52, h * 0.9]], '#c9a24a');
};

PROP_ART.logPile = (c, w, h, p) => {
  const rand = vseq(p.vr);
  for (let i = 0; i < 6; i++) {
    const r = w * (0.1 + rand() * 0.05);
    const x = w * (0.14 + (i % 3) * 0.3);
    const y = h - r - Math.floor(i / 3) * r * 1.9;
    ell(c, x, y, r, r, '#7a5a3a');
    ell(c, x, y, r * 0.66, r * 0.66, '#a8835a');
    c.strokeStyle = '#8a6a4a';
    c.lineWidth = 1;
    for (let k = 1; k < 3; k++) {
      c.beginPath();
      c.arc(x, y, r * 0.22 * k, 0, Math.PI * 2);
      c.stroke();
    }
  }
};

// ---- wall mounted --------------------------------------------------------

PROP_ART.portrait = (c, w, h, p, pal) => {
  const rand = vseq(p.vr);
  const frame = fromList(['#c9a24a', '#8a6a3a', '#7a5a4a'], p.tone);
  fillRR(c, 0, 0, w, h, w * 0.05, frame);
  fillRR(c, w * 0.09, h * 0.08, w * 0.82, h * 0.84, w * 0.02, shade(pal.wall2, -0.2));
  // a vague ancestor
  const skin = hsl(28, 30, 70);
  ell(c, w * 0.5, h * 0.42, w * 0.2, h * 0.17, skin);
  poly(c, [[w * 0.28, h * 0.92], [w * 0.72, h * 0.92], [w * 0.64, h * 0.58], [w * 0.36, h * 0.58]], fromList(FABRICS, (p.tone + 0.5) % 1));
  ell(c, w * 0.5, h * 0.3, w * 0.22, h * 0.1, rand() < 0.5 ? '#4a3a2a' : '#8a7a6a');
  c.fillStyle = 'rgb(0 0 0 / 0.5)';
  c.fillRect(w * 0.42, h * 0.42, w * 0.04, h * 0.02);
  c.fillRect(w * 0.54, h * 0.42, w * 0.04, h * 0.02);
};

PROP_ART.wallShelf = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const base = fromList(WOODS, p.tone);
  fillRR(c, 0, h * 0.1, w, h * 0.3, 3, base);
  poly(c, [[w * 0.12, h * 0.4], [w * 0.26, h * 0.4], [w * 0.16, h], [w * 0.12, h]], shade(base, -0.3));
  poly(c, [[w * 0.74, h * 0.4], [w * 0.88, h * 0.4], [w * 0.84, h], [w * 0.8, h]], shade(base, -0.3));
  fillJars(c, { x: w * 0.1, y: h * -0.6, w: w * 0.8, h: h * 0.7 }, rand);
};

PROP_ART.pegRail = (c, w, h, p) => {
  const base = fromList(WOODS, p.tone);
  fillRR(c, 0, 0, w, h * 0.55, 3, base);
  for (let i = 0; i < 4; i++) {
    const x = w * (0.12 + i * 0.25);
    c.fillStyle = shade(base, -0.25);
    c.fillRect(x, h * 0.5, w * 0.035, h * 0.4);
    ell(c, x + w * 0.017, h * 0.92, w * 0.035, h * 0.1, shade(base, 0.1));
  }
};

PROP_ART.wallClock = (c, w, h, p) => {
  const frame = fromList(['#c9a24a', '#7a5a3a'], p.tone);
  ell(c, w * 0.5, h * 0.5, w * 0.48, h * 0.48, frame);
  ell(c, w * 0.5, h * 0.5, w * 0.4, h * 0.4, '#f6efdd');
  c.strokeStyle = '#3a2a2a';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    line(c, w * 0.5 + Math.cos(a) * w * 0.34, h * 0.5 + Math.sin(a) * h * 0.34,
      w * 0.5 + Math.cos(a) * w * 0.39, h * 0.5 + Math.sin(a) * h * 0.39, '#6a5a4a', 1.5);
  }
  line(c, w * 0.5, h * 0.5, w * 0.5, h * 0.24, '#3a2a2a', 2.5);
  line(c, w * 0.5, h * 0.5, w * 0.68, h * 0.56, '#3a2a2a', 2);
  ell(c, w * 0.5, h * 0.5, w * 0.035, w * 0.035, '#c04a4a');
};

PROP_ART.mapFrame = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const frame = fromList(['#8a6a3a', '#5a4a3a'], p.tone);
  fillRR(c, 0, 0, w, h, 4, frame);
  fillRR(c, w * 0.06, h * 0.08, w * 0.88, h * 0.84, 2, '#e8dcb8');
  c.strokeStyle = '#8a7a52';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(w * 0.14, h * 0.6);
  for (let i = 0; i < 6; i++) c.lineTo(w * (0.14 + i * 0.14), h * (0.3 + rand() * 0.45));
  c.stroke();
  for (let i = 0; i < 5; i++) ell(c, w * (0.2 + rand() * 0.6), h * (0.2 + rand() * 0.6), 2, 2, '#b04a3a');
};

PROP_ART.mirrorOval = (c, w, h, p) => {
  const frame = fromList(['#c9a24a', '#9aa0ab', '#8a6a3a'], p.tone);
  ell(c, w * 0.5, h * 0.5, w * 0.48, h * 0.48, frame);
  ell(c, w * 0.5, h * 0.5, w * 0.4, h * 0.4, '#9fb4c4');
  c.save();
  ell(c, w * 0.5, h * 0.5, w * 0.4, h * 0.4);
  c.clip();
  poly(c, [[w * 0.1, h * 0.6], [w * 0.9, h * 0.18], [w * 0.9, h * 0.34], [w * 0.1, h * 0.78]], 'rgb(255 255 255 / 0.22)');
  c.restore();
};

PROP_ART.sconce = (c, w, h, p, pal) => {
  const metal = fromList(METALS, p.tone);
  fillRR(c, w * 0.4, h * 0.3, w * 0.2, h * 0.6, 3, metal);
  poly(c, [[w * 0.26, h * 0.36], [w * 0.74, h * 0.36], [w * 0.62, h * 0.08], [w * 0.38, h * 0.08]], shade(metal, 0.1));
  ell(c, w * 0.5, h * 0.12, w * 0.18, h * 0.08, alpha(pal.glow, 0.9));
  ell(c, w * 0.5, h * 0.12, w * 0.34, h * 0.2, alpha(pal.glow, 0.18));
};

PROP_ART.copperPans = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const metal = fromList(['#c9833a', '#b8923a', '#a8772a'], p.tone);
  fillRR(c, 0, 0, w, h * 0.1, 2, '#6a5a4a');
  for (let i = 0; i < 3; i++) {
    const r = h * (0.24 + rand() * 0.1);
    const x = w * (0.2 + i * 0.3);
    // the hook and the handle it hangs by
    line(c, x, h * 0.08, x, h * 0.2, shade(metal, -0.4), Math.max(2, w * 0.012));
    fillRR(c, x - r * 0.1, h * 0.18, r * 0.2, r * 0.9, r * 0.1, shade(metal, -0.3));
    ell(c, x, h * 0.2 + r * 1.1, r, r * 0.92, metal);
    ell(c, x, h * 0.2 + r * 1.1, r * 0.76, r * 0.68, shade(metal, 0.16));
    ell(c, x - r * 0.32, h * 0.2 + r * 0.8, r * 0.26, r * 0.17, 'rgb(255 255 255 / 0.3)');
  }
};

PROP_ART.herbBundle = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const green = hsl(80 + p.tone * 40, 26, 34);
  for (let i = 0; i < 9; i++) {
    const x = w * (0.3 + (i / 9) * 0.4);
    c.strokeStyle = i % 2 ? green : shade(green, 0.14);
    c.lineWidth = Math.max(2, w * 0.03);
    c.beginPath();
    c.moveTo(w * 0.5, h * 0.06);
    c.quadraticCurveTo(x, h * 0.5, x + (rand() - 0.5) * w * 0.2, h * (0.7 + rand() * 0.28));
    c.stroke();
  }
  fillRR(c, w * 0.36, h * 0.02, w * 0.28, h * 0.1, 3, '#b0763a');
};

PROP_ART.starChart = (c, w, h, p) => {
  const rand = vseq(p.vr);
  fillRR(c, 0, 0, w, h, 4, '#2a2a4a');
  fillRR(c, w * 0.04, h * 0.06, w * 0.92, h * 0.88, 2, '#1c1c38');
  for (let i = 0; i < 26; i++) {
    const x = w * (0.08 + rand() * 0.84);
    const y = h * (0.1 + rand() * 0.8);
    ell(c, x, y, 1 + rand() * 1.6, 1 + rand() * 1.6, 'rgb(230 240 255 / 0.9)');
  }
  c.strokeStyle = 'rgb(160 190 255 / 0.5)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(w * 0.2, h * 0.3);
  c.lineTo(w * 0.42, h * 0.5);
  c.lineTo(w * 0.6, h * 0.34);
  c.lineTo(w * 0.78, h * 0.6);
  c.stroke();
};

// ---- hanging -------------------------------------------------------------

PROP_ART.chandelier = (c, w, h, p, pal) => {
  const metal = fromList(['#c9a24a', '#9aa0ab'], p.tone);
  line(c, w * 0.5, 0, w * 0.5, h * 0.3, shade(metal, -0.3), Math.max(2, w * 0.02));
  ell(c, w * 0.5, h * 0.34, w * 0.42, h * 0.1, metal);
  for (let i = 0; i < 5; i++) {
    const x = w * (0.14 + i * 0.18);
    line(c, x, h * 0.36, x, h * 0.58, shade(metal, -0.1), Math.max(2, w * 0.016));
    fillRR(c, x - w * 0.025, h * 0.5, w * 0.05, h * 0.2, 2, '#f6eedb');
    ell(c, x, h * 0.48, w * 0.03, h * 0.05, alpha(pal.glow, 0.95));
    ell(c, x, h * 0.48, w * 0.09, h * 0.14, alpha(pal.glow, 0.14));
  }
  for (let i = 0; i < 7; i++) {
    const x = w * (0.1 + i * 0.13);
    ell(c, x, h * 0.46, w * 0.016, h * 0.05, 'rgb(220 240 255 / 0.5)');
  }
};

PROP_ART.lanternHang = (c, w, h, p, pal) => {
  const metal = fromList(METALS, p.tone);
  line(c, w * 0.5, 0, w * 0.5, h * 0.2, shade(metal, -0.3), 2);
  c.strokeStyle = metal;
  c.lineWidth = Math.max(2, w * 0.04);
  c.beginPath();
  c.arc(w * 0.5, h * 0.26, w * 0.2, Math.PI, Math.PI * 2);
  c.stroke();
  fillRR(c, w * 0.24, h * 0.3, w * 0.52, h * 0.52, w * 0.08, shade(metal, -0.1));
  fillRR(c, w * 0.32, h * 0.36, w * 0.36, h * 0.4, w * 0.05, alpha(pal.glow, 0.85));
  ell(c, w * 0.5, h * 0.56, w * 0.44, h * 0.3, alpha(pal.glow, 0.14));
  poly(c, [[w * 0.18, h * 0.32], [w * 0.82, h * 0.32], [w * 0.68, h * 0.2], [w * 0.32, h * 0.2]], metal);
  fillRR(c, w * 0.42, h * 0.84, w * 0.16, h * 0.1, 2, shade(metal, -0.2));
};

PROP_ART.birdcage = (c, w, h, p) => {
  const metal = fromList(METALS, p.tone);
  line(c, w * 0.5, 0, w * 0.5, h * 0.16, shade(metal, -0.3), 2);
  c.strokeStyle = metal;
  c.lineWidth = Math.max(1.5, w * 0.02);
  c.beginPath();
  c.arc(w * 0.5, h * 0.2, w * 0.1, Math.PI, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.moveTo(w * 0.16, h * 0.86);
  c.quadraticCurveTo(w * 0.1, h * 0.34, w * 0.5, h * 0.22);
  c.quadraticCurveTo(w * 0.9, h * 0.34, w * 0.84, h * 0.86);
  c.stroke();
  for (let i = 1; i < 6; i++) {
    const x = w * (0.16 + i * 0.136);
    line(c, x, h * 0.86, x, h * (0.3 + Math.abs(3 - i) * 0.03), metal, Math.max(1, w * 0.012));
  }
  fillRR(c, w * 0.1, h * 0.84, w * 0.8, h * 0.1, 3, shade(metal, -0.15));
  line(c, w * 0.26, h * 0.6, w * 0.74, h * 0.6, metal, Math.max(1, w * 0.016));
};

PROP_ART.bunting = (c, w, h, p) => {
  const rand = vseq(p.vr);
  c.strokeStyle = '#d8c8a8';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, h * 0.1);
  c.quadraticCurveTo(w * 0.5, h * 0.42, w, h * 0.1);
  c.stroke();
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = w * t;
    const y = h * 0.1 + Math.sin(Math.PI * t) * h * 0.3;
    poly(c, [[x - w * 0.045, y], [x + w * 0.045, y], [x, y + h * 0.42]], hsl([0, 42, 120, 200, 280, 330][Math.floor(rand() * 6)], 54, 58));
  }
};

// ---- front layer ---------------------------------------------------------

function rugPattern(c, w, h, p, round) {
  const rand = vseq(p.vr);
  const col = fromList(['#8a3a4a', '#35576a', '#63487a', '#7a5a2a', '#36634a'], p.tone);
  const edge = shade(col, 0.24);
  const deep = shade(col, -0.3);
  if (round) {
    ell(c, w * 0.5, h * 0.5, w * 0.5, h * 0.5, deep);
    ell(c, w * 0.5, h * 0.5, w * 0.46, h * 0.46, col);
    ell(c, w * 0.5, h * 0.5, w * 0.37, h * 0.37, edge);
    ell(c, w * 0.5, h * 0.5, w * 0.33, h * 0.33, col);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ell(c, w * 0.5 + Math.cos(a) * w * 0.22, h * 0.5 + Math.sin(a) * h * 0.22, w * 0.035, h * 0.05, edge);
    }
    ell(c, w * 0.5, h * 0.5, w * 0.1, h * 0.1, edge);
    ell(c, w * 0.5, h * 0.5, w * 0.05, h * 0.05, deep);
    return;
  }
  // a rug seen at an angle: narrower at the back, fringe at the front
  const inset = w * 0.08;
  const body = (k) => [
    [inset * (1 - k) + w * k * 0.5, h * 0.02 + h * 0.1 * k],
    [w - inset * (1 - k) - w * k * 0.5, h * 0.02 + h * 0.1 * k],
    [w * (1 - 0.01 * (1 - k)) - w * k * 0.5, h * (0.95 - 0.1 * k)],
    [w * 0.01 * (1 - k) + w * k * 0.5, h * (0.95 - 0.1 * k)],
  ];
  poly(c, body(0), deep);
  poly(c, body(0.05), col);
  poly(c, body(0.16), edge);
  poly(c, body(0.24), col);
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    ell(c, w * (0.14 + t * 0.72), h * 0.52, w * 0.034, h * 0.13, edge);
    ell(c, w * (0.14 + t * 0.72), h * 0.52, w * 0.016, h * 0.06, deep);
  }
  // fringe
  for (let i = 0; i < 20; i++) {
    const x = w * (0.02 + (i / 20) * 0.96);
    line(c, x, h * 0.94, x + (rand() - 0.5) * w * 0.01, h * 1.0, edge, Math.max(1.5, w * 0.008));
  }
}

PROP_ART.rug = (c, w, h, p) => rugPattern(c, w, h, p, false);
PROP_ART.rugRound = (c, w, h, p) => rugPattern(c, w, h, p, true);

PROP_ART.curtain = (c, w, h, p, pal) => {
  const col = fromList(['#6a2a3a', '#2a3a5a', '#4a2a5a', '#2a4a3a', '#5a3a2a'], p.tone);
  const waist = 0.58;
  const folds = 6;
  // The curtain is gathered at a tie-back: wide at the top, pinched, then
  // flaring out again to the floor.
  for (let i = 0; i < folds; i++) {
    const t0 = i / folds;
    const t1 = (i + 1) / folds;
    const pinch = (t) => 0.22 + t * 0.56;    // narrower around the waist
    c.beginPath();
    c.moveTo(w * t0, h * 0.03);
    c.lineTo(w * t1, h * 0.03);
    c.quadraticCurveTo(w * (0.5 + (pinch(t1) - 0.5) * 0.9), h * waist, w * (0.06 + t1 * 0.88), h);
    c.lineTo(w * (0.06 + t0 * 0.88), h);
    c.quadraticCurveTo(w * (0.5 + (pinch(t0) - 0.5) * 0.9), h * waist, w * t0, h * 0.03);
    c.closePath();
    c.fillStyle = i % 2 ? shade(col, 0.14) : shade(col, -0.18);
    c.fill();
  }
  // pole and valance
  fillRR(c, -w * 0.06, 0, w * 1.12, h * 0.022, 3, '#6a5a3a');
  for (let i = 0; i < 7; i++) {
    const x = w * (i / 7);
    c.beginPath();
    c.moveTo(x, h * 0.022);
    c.quadraticCurveTo(x + w / 14, h * 0.085, x + w / 7, h * 0.022);
    c.fillStyle = shade(col, 0.24);
    c.fill();
  }
  // the tie-back cord
  c.save();
  c.translate(w * 0.5, h * waist);
  fillRR(c, -w * 0.3, -h * 0.016, w * 0.6, h * 0.032, h * 0.016, shade(col, 0.34));
  ell(c, w * 0.3, 0, w * 0.05, h * 0.026, '#d8b45a');
  c.restore();
};

PROP_ART.tablecloth = (c, w, h, p) => {
  const col = fromList(['#d8cdb8', '#c9d8d0', '#e0cdc0', '#cdd0e0'], p.tone);
  // the cloth falls from a table top down to a scalloped hem
  c.beginPath();
  c.moveTo(0, h * 0.12);
  c.quadraticCurveTo(w * 0.5, h * -0.02, w, h * 0.12);
  c.lineTo(w, h * 0.74);
  const scallops = 6;
  for (let i = scallops; i > 0; i--) {
    const x1 = w * ((i - 1) / scallops);
    const xm = w * ((i - 0.5) / scallops);
    c.quadraticCurveTo(xm, h * 0.95, x1, h * 0.74);
  }
  c.closePath();
  c.fillStyle = col;
  c.fill();
  // top surface and a stripe or two
  c.beginPath();
  c.moveTo(0, h * 0.12);
  c.quadraticCurveTo(w * 0.5, h * -0.02, w, h * 0.12);
  c.lineTo(w, h * 0.22);
  c.quadraticCurveTo(w * 0.5, h * 0.1, 0, h * 0.22);
  c.closePath();
  c.fillStyle = shade(col, 0.22);
  c.fill();
  c.globalAlpha = 0.3;
  for (let i = 1; i < 6; i++) {
    const x = w * (i / 6);
    line(c, x, h * 0.16, x, h * 0.8, shade(col, -0.5), Math.max(1.5, w * 0.008));
  }
  line(c, 0, h * 0.44, w, h * 0.44, shade(col, -0.45), Math.max(1.5, w * 0.008));
  c.globalAlpha = 1;
};

PROP_ART.screenFold = (c, w, h, p) => {
  const rand = vseq(p.vr);
  const frame = fromList(WOODS, p.tone);
  const panels = 3;
  for (let i = 0; i < panels; i++) {
    const pw = w / panels;
    const x = i * pw;
    const lean = i === 1 ? 0 : h * 0.03;
    fillRR(c, x + 2, lean, pw - 4, h - lean, 4, frame);
    fillRR(c, x + pw * 0.12, lean + h * 0.05, pw * 0.76, h * 0.86, 3, i % 2 ? '#d8c8a8' : '#cbbb9a');
    // a painted branch
    c.strokeStyle = '#6a5a4a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x + pw * 0.2, h * 0.8);
    c.quadraticCurveTo(x + pw * 0.5, h * 0.5, x + pw * 0.78, h * (0.2 + rand() * 0.2));
    c.stroke();
    for (let k = 0; k < 4; k++) ell(c, x + pw * (0.3 + k * 0.14), h * (0.7 - k * 0.12), pw * 0.05, pw * 0.04, '#b06a8a');
  }
};

// ---- the very front ------------------------------------------------------

PROP_ART.cobweb = (c, w, h, p) => {
  const rand = vseq(p.vr);
  c.strokeStyle = 'rgb(236 240 250 / 0.3)';
  c.lineWidth = 1.2;
  const rings = 4;
  const spokes = 6;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * (Math.PI / 2);
    line(c, 0, 0, Math.cos(a) * w, Math.sin(a) * h, 'rgb(236 240 250 / 0.28)', 1.2);
  }
  for (let r = 1; r <= rings; r++) {
    const t = r / rings * (0.7 + rand() * 0.3);
    c.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * (Math.PI / 2);
      const x = Math.cos(a) * w * t;
      const y = Math.sin(a) * h * t;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
};

PROP_ART.dustMote = (c, w, h, p) => {
  const rand = vseq(p.vr);
  for (let i = 0; i < 5; i++) {
    ell(c, w * rand(), h * rand(), 1.4, 1.4, 'rgb(255 250 230 / 0.35)');
  }
};

// --------------------------------------------------------- the prop facade

export function drawProp(c, prop, pal) {
  const art = PROP_ART[prop.def];
  if (!art) return;
  c.save();
  c.translate(prop.x, prop.y);
  if (prop.flip) {
    c.translate(prop.w, 0);
    c.scale(-1, 1);
  }
  art(c, prop.w, prop.h, prop, pal);
  c.restore();
}

export const PROP_ART_KEYS = Object.keys(PROP_ART);
