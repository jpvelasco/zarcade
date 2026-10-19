// Baked art: every card face, card back, glow, the sky, the landscape, the
// campfire and the camp decorations are drawn once into offscreen canvases.
// Per-frame drawing is then only drawImage calls (no shadowBlur or gradient
// allocation in the frame loop).
import { rankOf, suitOf, isRed, RANK_LABELS } from './cards.js';
import { Rng } from './rng.js';

export const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const RED = '#d6334a';
const INK = '#22304a';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ------------------------------------------------------------------ suits

// Suit shapes in a unit box centred on 0,0 (size 1 = full height).
export function suitPath(ctx, suit, cx, cy, s) {
  const P = (x, y) => [cx + x * s, cy + y * s];
  ctx.beginPath();
  if (suit === 1) {
    // heart
    ctx.moveTo(...P(0, 0.42));
    ctx.bezierCurveTo(...P(-0.08, 0.3), ...P(-0.5, 0.08), ...P(-0.5, -0.16));
    ctx.bezierCurveTo(...P(-0.5, -0.42), ...P(-0.14, -0.5), ...P(0, -0.24));
    ctx.bezierCurveTo(...P(0.14, -0.5), ...P(0.5, -0.42), ...P(0.5, -0.16));
    ctx.bezierCurveTo(...P(0.5, 0.08), ...P(0.08, 0.3), ...P(0, 0.42));
  } else if (suit === 2) {
    // diamond
    ctx.moveTo(...P(0, -0.5));
    ctx.quadraticCurveTo(...P(0.16, -0.2), ...P(0.38, 0));
    ctx.quadraticCurveTo(...P(0.16, 0.2), ...P(0, 0.5));
    ctx.quadraticCurveTo(...P(-0.16, 0.2), ...P(-0.38, 0));
    ctx.quadraticCurveTo(...P(-0.16, -0.2), ...P(0, -0.5));
  } else if (suit === 0) {
    // spade
    ctx.moveTo(...P(0, -0.48));
    ctx.bezierCurveTo(...P(-0.08, -0.36), ...P(-0.5, -0.14), ...P(-0.5, 0.08));
    ctx.bezierCurveTo(...P(-0.5, 0.32), ...P(-0.16, 0.38), ...P(-0.03, 0.2));
    ctx.lineTo(...P(-0.16, 0.48));
    ctx.lineTo(...P(0.16, 0.48));
    ctx.lineTo(...P(0.03, 0.2));
    ctx.bezierCurveTo(...P(0.16, 0.38), ...P(0.5, 0.32), ...P(0.5, 0.08));
    ctx.bezierCurveTo(...P(0.5, -0.14), ...P(0.08, -0.36), ...P(0, -0.48));
  } else {
    // club
    const r = 0.21 * s;
    const circle = (x, y) => {
      const [px, py] = P(x, y);
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, Math.PI * 2);
    };
    circle(0, -0.25);
    circle(-0.24, 0.06);
    circle(0.24, 0.06);
    ctx.moveTo(...P(-0.03, 0.05));
    ctx.lineTo(...P(-0.17, 0.48));
    ctx.lineTo(...P(0.17, 0.48));
    ctx.lineTo(...P(0.03, 0.05));
    ctx.closePath();
    const [px, py] = P(0, -0.02);
    ctx.moveTo(px + r * 0.7, py);
    ctx.arc(px, py, r * 0.7, 0, Math.PI * 2);
  }
  ctx.closePath();
}

function drawSuit(ctx, suit, cx, cy, s, color) {
  suitPath(ctx, suit, cx, cy, s);
  ctx.fillStyle = color;
  ctx.fill('nonzero');
}

// ------------------------------------------------------------------ critters

function crown(ctx, cx, top, w, color = '#f4c64e') {
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, top + w * 0.5);
  ctx.lineTo(cx - w / 2, top + w * 0.1);
  ctx.lineTo(cx - w / 4, top + w * 0.3);
  ctx.lineTo(cx, top);
  ctx.lineTo(cx + w / 4, top + w * 0.3);
  ctx.lineTo(cx + w / 2, top + w * 0.1);
  ctx.lineTo(cx + w / 2, top + w * 0.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 70, 10, 0.6)';
  ctx.lineWidth = Math.max(1, w * 0.06);
  ctx.stroke();
}

function dot(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function ellipse(ctx, x, y, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function bear(ctx, x, y, r) {
  dot(ctx, x - 0.68 * r, y - 0.62 * r, 0.32 * r, '#7a4b2e');
  dot(ctx, x + 0.68 * r, y - 0.62 * r, 0.32 * r, '#7a4b2e');
  dot(ctx, x - 0.68 * r, y - 0.62 * r, 0.17 * r, '#d9a679');
  dot(ctx, x + 0.68 * r, y - 0.62 * r, 0.17 * r, '#d9a679');
  dot(ctx, x, y, 0.9 * r, '#8e5a37');
  ellipse(ctx, x, y + 0.32 * r, 0.44 * r, 0.33 * r, '#ecc9a2');
  ellipse(ctx, x, y + 0.2 * r, 0.16 * r, 0.11 * r, '#3a2416');
  dot(ctx, x - 0.36 * r, y - 0.18 * r, 0.09 * r, '#2a1a10');
  dot(ctx, x + 0.36 * r, y - 0.18 * r, 0.09 * r, '#2a1a10');
  crown(ctx, x, y - 1.32 * r, 0.8 * r);
}

function owl(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - 0.8 * r, y - 0.55 * r);
  ctx.lineTo(x - 0.62 * r, y - 1.05 * r);
  ctx.lineTo(x - 0.25 * r, y - 0.78 * r);
  ctx.lineTo(x + 0.25 * r, y - 0.78 * r);
  ctx.lineTo(x + 0.62 * r, y - 1.05 * r);
  ctx.lineTo(x + 0.8 * r, y - 0.55 * r);
  ctx.closePath();
  ctx.fillStyle = '#6a4e8f';
  ctx.fill();
  ellipse(ctx, x, y, 0.88 * r, 0.95 * r, '#7d5fa6');
  ellipse(ctx, x, y + 0.42 * r, 0.5 * r, 0.42 * r, '#c9b4e2');
  for (const s of [-1, 1]) {
    dot(ctx, x + s * 0.38 * r, y - 0.18 * r, 0.33 * r, '#fff8e8');
    dot(ctx, x + s * 0.38 * r, y - 0.16 * r, 0.16 * r, '#2b2140');
    dot(ctx, x + s * 0.33 * r, y - 0.22 * r, 0.05 * r, '#ffffff');
  }
  ctx.beginPath();
  ctx.moveTo(x - 0.12 * r, y + 0.06 * r);
  ctx.lineTo(x + 0.12 * r, y + 0.06 * r);
  ctx.lineTo(x, y + 0.3 * r);
  ctx.closePath();
  ctx.fillStyle = '#f29a38';
  ctx.fill();
  crown(ctx, x, y - 1.36 * r, 0.62 * r, '#ffd9f2');
}

function fox(ctx, x, y, r) {
  ctx.fillStyle = '#e46f2a';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.25 * r, y - 0.55 * r);
    ctx.lineTo(x + s * 0.72 * r, y - 1.1 * r);
    ctx.lineTo(x + s * 0.9 * r, y - 0.35 * r);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x - 0.98 * r, y - 0.4 * r);
  ctx.quadraticCurveTo(x - 0.55 * r, y + 0.55 * r, x, y + 0.9 * r);
  ctx.quadraticCurveTo(x + 0.55 * r, y + 0.55 * r, x + 0.98 * r, y - 0.4 * r);
  ctx.quadraticCurveTo(x, y - 0.85 * r, x - 0.98 * r, y - 0.4 * r);
  ctx.fillStyle = '#ec7a32';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 0.9 * r, y - 0.2 * r);
  ctx.quadraticCurveTo(x - 0.35 * r, y + 0.05 * r, x, y + 0.88 * r);
  ctx.quadraticCurveTo(x + 0.35 * r, y + 0.05 * r, x + 0.9 * r, y - 0.2 * r);
  ctx.quadraticCurveTo(x + 0.4 * r, y + 0.5 * r, x, y + 0.9 * r);
  ctx.quadraticCurveTo(x - 0.4 * r, y + 0.5 * r, x - 0.9 * r, y - 0.2 * r);
  ctx.fillStyle = '#fff4e6';
  ctx.fill();
  dot(ctx, x, y + 0.78 * r, 0.12 * r, '#2a1a10');
  dot(ctx, x - 0.36 * r, y - 0.12 * r, 0.09 * r, '#2a1a10');
  dot(ctx, x + 0.36 * r, y - 0.12 * r, 0.09 * r, '#2a1a10');
  // A little ranger cap.
  ctx.beginPath();
  ctx.ellipse(x, y - 0.7 * r, 0.62 * r, 0.16 * r, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3e7a4f';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - 0.7 * r, 0.36 * r, Math.PI, 0);
  ctx.fill();
}

// ------------------------------------------------------------------ cards

// A card sprite: the card plus a soft baked shadow, at device pixels.
// `w`, `h` are CSS pixels of the card; `pad` is the shadow margin.
function cardCanvas(w, h, dpr) {
  const pad = Math.ceil(w * 0.14);
  const c = makeCanvas((w + pad * 2) * dpr, (h + pad * 2) * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.translate(pad, pad);
  return { c, ctx, pad };
}

function cardShadow(ctx, w, h, dpr, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(5, 4, 18, 0.55)';
  ctx.shadowBlur = w * 0.12 * dpr;
  ctx.shadowOffsetY = w * 0.05 * dpr;
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
}

export function bakeFace(card, w, h, dpr) {
  const { c, ctx, pad } = cardCanvas(w, h, dpr);
  const r = w * 0.1;
  cardShadow(ctx, w, h, dpr, r);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fffdf7');
  g.addColorStop(1, '#f2e8d2');
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.strokeStyle = 'rgba(122, 92, 58, 0.45)';
  ctx.stroke();

  const rank = rankOf(card);
  const suit = suitOf(card);
  const color = isRed(card) ? RED : INK;
  const label = RANK_LABELS[rank];
  // Big rank top-left: in TriPeaks the rank is the whole question.
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  const rs = w * (label.length > 1 ? 0.36 : 0.42);
  ctx.font = `800 ${rs}px ${FONT}`;
  const ix = w * 0.24;
  ctx.fillText(label, ix, h * 0.05);
  drawSuit(ctx, suit, ix, h * 0.05 + w * 0.56, w * 0.22, color);
  // Small rotated index bottom-right.
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  ctx.font = `800 ${w * 0.2}px ${FONT}`;
  ctx.fillText(label, w * 0.15, h * 0.04);
  ctx.restore();

  // Centre art.
  const cx = w * 0.58;
  const cy = h * 0.6;
  if (rank >= 10) {
    const mr = w * 0.3;
    dot(ctx, cx, cy, mr * 1.08, isRed(card) ? '#fde4e2' : '#e2e9f6');
    ctx.lineWidth = Math.max(1, w * 0.02);
    ctx.strokeStyle = isRed(card) ? 'rgba(214, 51, 74, 0.35)' : 'rgba(34, 48, 74, 0.3)';
    ctx.stroke();
    const critter = rank === 12 ? bear : rank === 11 ? owl : fox;
    critter(ctx, cx, cy + mr * 0.12, mr * 0.66);
    drawSuit(ctx, suit, cx + mr * 0.92, cy + mr * 0.9, w * 0.17, color);
  } else if (rank === 0) {
    dot(ctx, cx, cy, w * 0.3, 'rgba(244, 198, 78, 0.28)');
    drawSuit(ctx, suit, cx, cy, w * 0.5, color);
    // A sparkle: Aces are stars.
    star(ctx, cx + w * 0.22, cy - w * 0.24, w * 0.08, '#f4c64e');
  } else {
    drawSuit(ctx, suit, cx, cy, w * 0.46, color);
  }
  return { img: c, pad };
}

function star(ctx, x, y, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

const BACK_STYLES = {
  plaid(ctx, w, h) {
    ctx.fillStyle = '#a3302f';
    ctx.fillRect(0, 0, w, h);
    const band = w / 4;
    ctx.fillStyle = 'rgba(24, 66, 48, 0.62)';
    for (let x = -band / 2; x < w; x += band * 1.6) ctx.fillRect(x, 0, band * 0.7, h);
    for (let y = -band / 2; y < h; y += band * 1.6) ctx.fillRect(0, y, w, band * 0.7);
    ctx.fillStyle = 'rgba(240, 200, 110, 0.55)';
    const t = Math.max(1, w * 0.018);
    for (let x = band * 0.3; x < w; x += band * 1.6) ctx.fillRect(x, 0, t, h);
    for (let y = band * 0.3; y < h; y += band * 1.6) ctx.fillRect(0, y, w, t);
    flameEmblem(ctx, w / 2, h / 2, w * 0.17);
  },
  starry(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a2352');
    g.addColorStop(1, '#2f2d70');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rng = new Rng(7);
    for (let i = 0; i < 26; i++) dot(ctx, rng.next() * w, rng.next() * h, w * (0.008 + rng.next() * 0.014), 'rgba(255, 250, 220, 0.9)');
    moon(ctx, w * 0.5, h * 0.5, w * 0.2, '#2a2b68');
  },
  pines(ctx, w, h) {
    ctx.fillStyle = '#183f33';
    ctx.fillRect(0, 0, w, h);
    const s = w / 5;
    for (let row = 0; row * s * 0.9 < h + s; row++) {
      for (let col = -1; col * s < w + s; col++) {
        const x = col * s + (row % 2 ? s / 2 : 0);
        const y = row * s * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y - s * 0.45);
        ctx.lineTo(x + s * 0.34, y + s * 0.3);
        ctx.lineTo(x - s * 0.34, y + s * 0.3);
        ctx.closePath();
        ctx.fillStyle = row % 2 ? '#2f6b4f' : '#24583f';
        ctx.fill();
      }
    }
  },
  embers(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4a160f');
    g.addColorStop(1, '#a3401b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rng = new Rng(11);
    for (let i = 0; i < 14; i++) flameEmblem(ctx, rng.next() * w, rng.next() * h, w * (0.06 + rng.next() * 0.06), 0.5);
    flameEmblem(ctx, w / 2, h / 2, w * 0.2);
  },
  moon(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2d1f52');
    g.addColorStop(1, '#4b2f72');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rng = new Rng(3);
    for (let i = 0; i < 18; i++) dot(ctx, rng.next() * w, rng.next() * h, w * 0.012, 'rgba(255, 240, 255, 0.75)');
    moon(ctx, w * 0.5, h * 0.36, w * 0.18, '#3a2862');
    owl(ctx, w * 0.5, h * 0.72, w * 0.13);
  },
  aurora(ctx, w, h) {
    ctx.fillStyle = '#0d2335';
    ctx.fillRect(0, 0, w, h);
    const bands = [['rgba(63, 224, 168, 0.55)', 0.3], ['rgba(122, 107, 255, 0.5)', 0.55], ['rgba(63, 200, 255, 0.4)', 0.8]];
    for (const [col, yy] of bands) {
      ctx.beginPath();
      ctx.moveTo(0, h * yy);
      for (let x = 0; x <= w; x += w / 8) ctx.lineTo(x, h * yy + Math.sin(x / w * Math.PI * 2 + yy * 9) * h * 0.07);
      ctx.lineTo(w, h * yy + h * 0.12);
      for (let x = w; x >= 0; x -= w / 8) ctx.lineTo(x, h * yy + h * 0.12 + Math.sin(x / w * Math.PI * 2 + yy * 5) * h * 0.05);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    }
    star(ctx, w * 0.5, h * 0.15, w * 0.08, '#e9fff6');
  },
  gold(ctx, w, h) {
    ctx.fillStyle = '#141a3d';
    ctx.fillRect(0, 0, w, h);
    const pts = [[0.2, 0.2], [0.42, 0.32], [0.62, 0.22], [0.8, 0.4], [0.62, 0.62], [0.36, 0.7], [0.22, 0.86], [0.78, 0.84]];
    ctx.strokeStyle = 'rgba(244, 198, 78, 0.7)';
    ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    ctx.stroke();
    for (const [x, y] of pts) star(ctx, x * w, y * h, w * 0.05, '#f4c64e');
  },
};

function moon(ctx, x, y, r, shade) {
  dot(ctx, x, y, r, '#fff1c4');
  dot(ctx, x + r * 0.42, y - r * 0.18, r * 0.86, shade);
}

function flameEmblem(ctx, x, y, s, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 0.2, x + s * 0.6, y + s * 0.7, x, y + s * 0.7);
  ctx.bezierCurveTo(x - s * 0.6, y + s * 0.7, x - s * 0.7, y - s * 0.2, x, y - s);
  ctx.fillStyle = '#ffb347';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.4, y + s * 0.1, x + s * 0.3, y + s * 0.65, x, y + s * 0.65);
  ctx.bezierCurveTo(x - s * 0.3, y + s * 0.65, x - s * 0.4, y + s * 0.1, x, y - s * 0.35);
  ctx.fillStyle = '#fff1a8';
  ctx.fill();
  ctx.restore();
}

export const BACK_IDS = Object.keys(BACK_STYLES);

export function bakeBack(id, w, h, dpr) {
  const { c, ctx, pad } = cardCanvas(w, h, dpr);
  const r = w * 0.1;
  cardShadow(ctx, w, h, dpr, r);
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fillStyle = id === 'gold' ? '#f4c64e' : '#f7efdc';
  ctx.fill();
  const inset = w * 0.07;
  ctx.save();
  roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, r * 0.6);
  ctx.clip();
  ctx.translate(inset, inset);
  (BACK_STYLES[id] || BACK_STYLES.plaid)(ctx, w - inset * 2, h - inset * 2);
  ctx.restore();
  roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, r * 0.6);
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.stroke();
  roundRect(ctx, 0, 0, w, h, r);
  ctx.strokeStyle = 'rgba(80, 50, 30, 0.45)';
  ctx.stroke();
  return { img: c, pad };
}

// A soft rim behind a card: golden for playable cards, brighter for the hint.
export function bakeRim(w, h, dpr, color, strength = 1) {
  const pad = Math.ceil(w * 0.3);
  const c = makeCanvas((w + pad * 2) * dpr, (h + pad * 2) * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.translate(pad, pad);
  ctx.shadowColor = color;
  ctx.shadowBlur = w * 0.25 * dpr * strength;
  roundRect(ctx, -1, -1, w + 2, h + 2, w * 0.12);
  ctx.lineWidth = Math.max(2, w * 0.05);
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.stroke();
  return { img: c, pad };
}

// An empty pile outline.
export function bakeSlot(w, h, dpr) {
  const c = makeCanvas(w * dpr, h * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  roundRect(ctx, 1, 1, w - 2, h - 2, w * 0.1);
  ctx.fillStyle = 'rgba(255, 240, 210, 0.06)';
  ctx.fill();
  ctx.setLineDash([w * 0.08, w * 0.06]);
  ctx.lineWidth = Math.max(1.5, w * 0.025);
  ctx.strokeStyle = 'rgba(255, 230, 190, 0.35)';
  ctx.stroke();
  return { img: c, pad: 0 };
}

// ------------------------------------------------------------------ glows

export function bakeGlow(r, inner, outer = 'rgba(0,0,0,0)') {
  const c = makeCanvas(r * 2, r * 2);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, (m) => `${parseFloat(m) * 0.45})`));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, r * 2, r * 2);
  return c;
}

export function bakeStar(r, color = '#fff6d8') {
  const c = makeCanvas(r * 2, r * 2);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,246,216,0.8)');
  g.addColorStop(1, 'rgba(255,246,216,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, r * 2, r * 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.moveTo(r, r * 0.15);
  ctx.lineTo(r, r * 1.85);
  ctx.moveTo(r * 0.15, r);
  ctx.lineTo(r * 1.85, r);
  ctx.stroke();
  return c;
}

// A tapered streak for shooting stars (drawn rotated).
export function bakeStreak(len, thick) {
  const c = makeCanvas(len, thick * 2);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.85, 'rgba(255,248,220,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, thick);
  ctx.lineTo(len, thick * 0.4);
  ctx.lineTo(len, thick * 1.6);
  ctx.closePath();
  ctx.fill();
  return c;
}

// ------------------------------------------------------------------ fire

export function bakeFlame(w, h, stops) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, h, 0, 0);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.bezierCurveTo(w * 0.72, h * 0.3, w, h * 0.62, w * 0.86, h * 0.84);
  ctx.quadraticCurveTo(w * 0.7, h, w / 2, h);
  ctx.quadraticCurveTo(w * 0.3, h, w * 0.14, h * 0.84);
  ctx.bezierCurveTo(0, h * 0.62, w * 0.28, h * 0.3, w / 2, 0);
  ctx.fillStyle = g;
  ctx.fill();
  return c;
}

export function bakeLogs(s, dpr) {
  const w = s * 1.5;
  const h = s * 0.6;
  const c = makeCanvas(w * dpr, h * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  // Stones ring.
  const rng = new Rng(5);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.05 + (i / 8) * 0.9);
    const x = w / 2 - Math.cos(a) * w * 0.44;
    const y = h * 0.62 + Math.sin(a) * h * 0.18;
    ellipse(ctx, x, y, s * (0.1 + rng.next() * 0.03), s * 0.075, i % 2 ? '#5d5a6e' : '#6d6a80');
  }
  const log = (x1, y1, x2, y2, col) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = col;
    ctx.lineWidth = s * 0.16;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  log(w * 0.2, h * 0.78, w * 0.78, h * 0.42, '#6b3f24');
  log(w * 0.8, h * 0.78, w * 0.22, h * 0.42, '#7d4a2a');
  ellipse(ctx, w * 0.2, h * 0.78, s * 0.07, s * 0.07, '#c58b56');
  ellipse(ctx, w * 0.8, h * 0.78, s * 0.07, s * 0.07, '#d39a62');
  // Glowing embers at the base.
  ellipse(ctx, w / 2, h * 0.62, s * 0.3, s * 0.08, 'rgba(255, 120, 40, 0.85)');
  ellipse(ctx, w / 2, h * 0.62, s * 0.16, s * 0.05, 'rgba(255, 210, 120, 0.9)');
  return { img: c, w, h };
}

// ------------------------------------------------------------------ scene

// Night and "streak" skies share the landscape; the bright one fades in.
export function bakeSky(vw, vh, dpr, theme, horizon, bright, moonAt = null) {
  const c = makeCanvas(vw * dpr, vh * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  if (bright) {
    g.addColorStop(0, '#1d2a6e');
    g.addColorStop(0.55, '#2f3f92');
    g.addColorStop(1, '#6c5aa8');
  } else {
    g.addColorStop(0, '#070a1f');
    g.addColorStop(0.6, '#111843');
    g.addColorStop(1, theme.horizonGlow);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
  const rng = new Rng(bright ? 99 : 42);
  const count = Math.round((vw * horizon) / (bright ? 1800 : 2600));
  for (let i = 0; i < count; i++) {
    const y = rng.next() * horizon * 0.95;
    const r = 0.4 + rng.next() * (bright ? 1.1 : 0.9);
    dot(ctx, rng.next() * vw, y, r, `rgba(255, 248, 230, ${0.25 + rng.next() * 0.6})`);
  }
  if (bright) {
    // An aurora ribbon for a hot streak.
    for (const [col, yy, amp] of [['rgba(80, 240, 180, 0.22)', 0.22, 0.05], ['rgba(140, 120, 255, 0.2)', 0.3, 0.04]]) {
      ctx.beginPath();
      const base = horizon * yy;
      ctx.moveTo(0, base);
      for (let x = 0; x <= vw; x += vw / 16) ctx.lineTo(x, base + Math.sin(x / vw * 7 + yy * 20) * horizon * amp);
      for (let x = vw; x >= 0; x -= vw / 16) ctx.lineTo(x, base + horizon * 0.12 + Math.sin(x / vw * 5 + yy * 13) * horizon * amp);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    }
  } else if (moonAt) {
    // The moon, with a halo.
    const { x: mx, y: my, r: mr } = moonAt;
    const halo = ctx.createRadialGradient(mx, my, mr, mx, my, mr * 5);
    halo.addColorStop(0, 'rgba(255, 240, 200, 0.22)');
    halo.addColorStop(1, 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    moon(ctx, mx, my, mr, '#0c1233');
  }
  return c;
}

// Mountains, a lake or meadow, and pines along the horizon; transparent sky.
export function bakeLand(vw, vh, dpr, theme, horizon, moonX = null) {
  const c = makeCanvas(vw * dpr, vh * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const rng = new Rng(theme.seed);
  const unit = Math.max(40, Math.min(vw, vh) * 0.12);
  // Far mountains.
  ctx.fillStyle = theme.mountain;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  let x = 0;
  while (x < vw + unit) {
    const peak = horizon - unit * (theme.mountainH * (0.6 + rng.next() * 0.8));
    ctx.lineTo(x + unit * 0.9, peak);
    x += unit * (1.6 + rng.next());
    ctx.lineTo(x, horizon - unit * 0.3 * rng.next());
  }
  ctx.lineTo(vw, horizon);
  ctx.closePath();
  ctx.fill();
  // Ground.
  const ground = ctx.createLinearGradient(0, horizon, 0, vh);
  ground.addColorStop(0, theme.groundTop);
  ground.addColorStop(1, theme.groundBottom);
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, vw, vh - horizon);
  if (theme.lake) {
    const lakeY = horizon + unit * 0.12;
    const lakeH = unit * 0.55;
    const lg = ctx.createLinearGradient(0, lakeY, 0, lakeY + lakeH);
    lg.addColorStop(0, '#1d2d63');
    lg.addColorStop(1, '#121c45');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.ellipse(vw * 0.5, lakeY + lakeH / 2, vw * 0.62, lakeH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 240, 200, 0.25)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const ry = lakeY + lakeH * (0.25 + rng.next() * 0.5);
      const rx = vw * (moonX ?? theme.moonX) + (rng.next() - 0.5) * unit;
      ctx.beginPath();
      ctx.moveTo(rx - unit * 0.3, ry);
      ctx.lineTo(rx + unit * 0.3, ry);
      ctx.stroke();
    }
  }
  // Pines along the horizon, taller at the edges so the middle stays open.
  const trees = Math.ceil(vw / (unit * 0.42));
  for (let i = 0; i < trees; i++) {
    const tx = (i + rng.next() * 0.6) * (vw / trees);
    const edge = Math.abs(tx / vw - 0.5) * 2;
    const th = unit * (0.5 + rng.next() * 0.5 + edge * edge * theme.edgeTrees);
    pine(ctx, tx, horizon + unit * 0.06, th, i % 3 ? theme.tree : theme.tree2);
  }
  // Foreground grass tufts.
  ctx.fillStyle = theme.grass;
  for (let i = 0; i < vw / 18; i++) {
    const gx = rng.next() * vw;
    const gy = horizon + unit * 0.4 + rng.next() * (vh - horizon);
    ctx.beginPath();
    ctx.moveTo(gx - 4, gy);
    ctx.lineTo(gx - 1, gy - 7 - rng.next() * 6);
    ctx.lineTo(gx + 1, gy);
    ctx.lineTo(gx + 3, gy - 6 - rng.next() * 5);
    ctx.lineTo(gx + 5, gy);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

function pine(ctx, x, base, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x - h * 0.03, base - h * 0.15, h * 0.06, h * 0.15);
  ctx.beginPath();
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const top = base - h + (t * h * 0.24);
    const bot = base - h * 0.12 - (tiers - 1 - t) * h * 0.18;
    const half = h * (0.16 + t * 0.07);
    ctx.moveTo(x, top);
    ctx.lineTo(x + half, bot);
    ctx.lineTo(x - half, bot);
    ctx.closePath();
  }
  ctx.fill();
}

export const THEMES = {
  hollow: { seed: 3, horizonGlow: '#3a2a5c', mountain: '#1a1f45', mountainH: 0.6, groundTop: '#16241f', groundBottom: '#0d1612', tree: '#0e1a1a', tree2: '#122222', grass: '#1c2e25', lake: false, moonX: 0.8, edgeTrees: 1.4 },
  lake: { seed: 8, horizonGlow: '#2c3570', mountain: '#18204a', mountainH: 0.9, groundTop: '#152320', groundBottom: '#0c1513', tree: '#0d1819', tree2: '#112021', grass: '#1a2b25', lake: true, moonX: 0.22, edgeTrees: 1.1 },
  ridge: { seed: 13, horizonGlow: '#4a2a5e', mountain: '#21204e', mountainH: 1.5, groundTop: '#1c1f2b', groundBottom: '#10121b', tree: '#10131e', tree2: '#151826', grass: '#232633', lake: false, moonX: 0.7, edgeTrees: 0.8 },
};

// ------------------------------------------------------------------ decor

// Each decoration is baked at a size `s` (CSS px) and anchored bottom-centre.
export function bakeDecor(id, s, dpr) {
  const w = s * 1.4;
  const h = s * 1.2;
  const c = makeCanvas(w * dpr, h * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const bx = w / 2;
  const by = h - 2;
  DECOR_ART[id]?.(ctx, bx, by, s);
  return { img: c, w, h };
}

const DECOR_ART = {
  tent(ctx, x, y, s) {
    const tw = s * 1.15;
    const th = s * 0.85;
    ctx.beginPath();
    ctx.moveTo(x - tw / 2, y);
    ctx.lineTo(x, y - th);
    ctx.lineTo(x + tw / 2, y);
    ctx.closePath();
    ctx.fillStyle = '#d9622b';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - th);
    ctx.lineTo(x + tw / 2, y);
    ctx.lineTo(x + tw * 0.2, y);
    ctx.closePath();
    ctx.fillStyle = '#b44a1f';
    ctx.fill();
    // Lit doorway.
    ctx.beginPath();
    ctx.moveTo(x - tw * 0.16, y);
    ctx.lineTo(x, y - th * 0.62);
    ctx.lineTo(x + tw * 0.16, y);
    ctx.closePath();
    ctx.fillStyle = '#ffd27a';
    ctx.fill();
    ctx.strokeStyle = '#3a1d0d';
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath();
    ctx.moveTo(x, y - th);
    ctx.lineTo(x, y - th - s * 0.12);
    ctx.stroke();
    ctx.fillStyle = '#ffe36b';
    ctx.beginPath();
    ctx.moveTo(x, y - th - s * 0.12);
    ctx.lineTo(x + s * 0.14, y - th - s * 0.08);
    ctx.lineTo(x, y - th - s * 0.04);
    ctx.fill();
  },
  guitar(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.35);
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(-s * 0.05, -s * 1.02, s * 0.1, s * 0.62);
    ctx.fillStyle = '#3a2414';
    ctx.fillRect(-s * 0.08, -s * 1.12, s * 0.16, s * 0.14);
    ellipse(ctx, 0, -s * 0.32, s * 0.24, s * 0.22, '#d98b3a');
    ellipse(ctx, 0, -s * 0.12, s * 0.3, s * 0.24, '#e39a48');
    dot(ctx, 0, -s * 0.26, s * 0.07, '#3a2414');
    ctx.fillStyle = '#3a2414';
    ctx.fillRect(-s * 0.1, -s * 0.06, s * 0.2, s * 0.04);
    ctx.strokeStyle = 'rgba(255, 245, 220, 0.7)';
    ctx.lineWidth = 0.7;
    for (const dx of [-0.025, 0, 0.025]) {
      ctx.beginPath();
      ctx.moveTo(dx * s, -s * 1.08);
      ctx.lineTo(dx * s, -s * 0.05);
      ctx.stroke();
    }
    ctx.restore();
  },
  canoe(ctx, x, y, s) {
    // Paddle leaning behind the boat.
    ctx.strokeStyle = '#8a5a32';
    ctx.lineWidth = Math.max(1.5, s * 0.045);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.18, y - s * 0.78);
    ctx.lineTo(x + s * 0.38, y - s * 0.2);
    ctx.stroke();
    ellipse(ctx, x + s * 0.42, y - s * 0.12, s * 0.07, s * 0.14, '#a26a3a');
    // Hull: a deep belly with both ends sweeping up.
    ctx.beginPath();
    ctx.moveTo(x - s * 0.7, y - s * 0.42);
    ctx.quadraticCurveTo(x - s * 0.62, y - s * 0.02, x - s * 0.2, y - s * 0.02);
    ctx.lineTo(x + s * 0.2, y - s * 0.02);
    ctx.quadraticCurveTo(x + s * 0.62, y - s * 0.02, x + s * 0.7, y - s * 0.42);
    ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.24, x, y - s * 0.24);
    ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.24, x - s * 0.7, y - s * 0.42);
    ctx.closePath();
    ctx.fillStyle = '#c4452f';
    ctx.fill();
    // Shadowed lower hull.
    ctx.beginPath();
    ctx.moveTo(x - s * 0.52, y - s * 0.12);
    ctx.quadraticCurveTo(x, y + s * 0.02, x + s * 0.52, y - s * 0.12);
    ctx.quadraticCurveTo(x, y - s * 0.04, x - s * 0.52, y - s * 0.12);
    ctx.fillStyle = '#93311f';
    ctx.fill();
    // Gunwale and ribs.
    ctx.strokeStyle = '#f2d38a';
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.68, y - s * 0.4);
    ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.24, x, y - s * 0.24);
    ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.24, x + s * 0.68, y - s * 0.4);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, s * 0.022);
    for (const dx of [-0.3, 0, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * s, y - s * 0.24);
      ctx.lineTo(x + dx * s * 0.9, y - s * 0.06);
      ctx.stroke();
    }
  },
  telescope(ctx, x, y, s) {
    ctx.strokeStyle = '#8b8fa8';
    ctx.lineWidth = Math.max(1.5, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.5);
    ctx.lineTo(x - s * 0.28, y);
    ctx.moveTo(x, y - s * 0.5);
    ctx.lineTo(x + s * 0.28, y);
    ctx.moveTo(x, y - s * 0.5);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y - s * 0.55);
    ctx.rotate(-0.6);
    ctx.fillStyle = '#d7b45a';
    ctx.fillRect(-s * 0.32, -s * 0.07, s * 0.62, s * 0.14);
    ctx.fillStyle = '#3d4466';
    ctx.fillRect(s * 0.22, -s * 0.09, s * 0.12, s * 0.18);
    ctx.restore();
  },
  owl(ctx, x, y, s) {
    ctx.strokeStyle = '#2a1d16';
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.6, y - s * 0.08);
    ctx.lineTo(x + s * 0.6, y - s * 0.02);
    ctx.stroke();
    owl(ctx, x, y - s * 0.42, s * 0.3);
  },
  marshmallows(ctx, x, y, s) {
    ctx.strokeStyle = '#7a5434';
    ctx.lineWidth = Math.max(1.5, s * 0.03);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.55, y);
    ctx.lineTo(x + s * 0.35, y - s * 0.55);
    ctx.stroke();
    ctx.save();
    ctx.translate(x + s * 0.3, y - s * 0.52);
    ctx.rotate(-0.55);
    roundRect(ctx, -s * 0.1, -s * 0.07, s * 0.2, s * 0.14, s * 0.04);
    ctx.fillStyle = '#fff6e6';
    ctx.fill();
    roundRect(ctx, -s * 0.34, -s * 0.07, s * 0.2, s * 0.14, s * 0.04);
    ctx.fillStyle = '#e9b36a';
    ctx.fill();
    ctx.restore();
  },
};
