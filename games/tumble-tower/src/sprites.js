// Baked animal art. Every animal gets one sprite per expression (idle,
// blink, grin, worried) plus an ice coat and a silhouette, drawn once per
// zoom level so a frame is one drawImage per animal.
import { ANIMALS, animalShape } from './animals.js';

export const EXPRESSIONS = ['idle', 'blink', 'grin', 'worried'];
const PAD = 0.32; // metres around the shape for ears and outlines

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Shape path in y-down local metres.
function shapePath(ctx, shape) {
  ctx.beginPath();
  if (shape.type === 'circle') {
    ctx.arc(0, 0, shape.r, 0, Math.PI * 2);
    return;
  }
  const v = shape.verts;
  ctx.moveTo(v[0].x, -v[0].y);
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, -v[i].y);
  ctx.closePath();
}

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), rot, 0, Math.PI * 2);
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

// ------------------------------------------------------------ faces

function eye(ctx, x, y, r, expr, dark) {
  ctx.lineCap = 'round';
  if (expr === 'blink') {
    ctx.strokeStyle = dark; ctx.lineWidth = r * 0.55;
    ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.9, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    return;
  }
  if (expr === 'grin') {
    ctx.strokeStyle = dark; ctx.lineWidth = r * 0.6;
    ctx.beginPath(); ctx.arc(x, y + r * 0.4, r * 0.9, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    return;
  }
  if (expr === 'worried') {
    ctx.fillStyle = '#ffffff';
    circle(ctx, x, y, r * 1.35); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = r * 0.25; ctx.stroke();
    ctx.fillStyle = '#1d1a2c';
    circle(ctx, x, y + r * 0.15, r * 0.62); ctx.fill();
    ctx.fillStyle = '#ffffff';
    circle(ctx, x - r * 0.2, y - r * 0.1, r * 0.2); ctx.fill();
    return;
  }
  ctx.fillStyle = '#1d1a2c';
  ellipse(ctx, x, y, r * 0.85, r * 1.05); ctx.fill();
  ctx.fillStyle = '#ffffff';
  circle(ctx, x - r * 0.28, y - r * 0.38, r * 0.34); ctx.fill();
}

function face(ctx, a, expr, opts = {}) {
  const f = a.face;
  const s = f.s * 1.25;
  const x = f.x, y = -f.y;
  const gap = (opts.gap ?? 0.2) * s;
  const er = 0.075 * s;
  const ink = opts.ink || '#1d1a2c';
  // cheeks
  if (expr !== 'worried') {
    ctx.fillStyle = a.cheek;
    ctx.globalAlpha = 0.55;
    ellipse(ctx, x - gap - 0.08 * s, y + 0.1 * s, 0.075 * s, 0.05 * s); ctx.fill();
    ellipse(ctx, x + gap + 0.08 * s, y + 0.1 * s, 0.075 * s, 0.05 * s); ctx.fill();
    ctx.globalAlpha = 1;
  }
  const ey = y - (opts.eyeLift ?? 0.04) * s;
  eye(ctx, x - gap, ey, er, expr, ink);
  eye(ctx, x + gap, ey, er, expr, ink);
  if (expr === 'worried') {
    ctx.strokeStyle = ink; ctx.lineWidth = 0.028 * s; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - gap - er * 1.4, ey - er * 2.0); ctx.lineTo(x - gap + er * 1.1, ey - er * 2.7);
    ctx.moveTo(x + gap + er * 1.4, ey - er * 2.0); ctx.lineTo(x + gap - er * 1.1, ey - er * 2.7);
    ctx.stroke();
  }
  if (opts.noMouth) return;
  const my = y + (opts.mouthDrop ?? 0.13) * s;
  ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (expr === 'grin') {
    ctx.fillStyle = '#7a2340';
    ctx.beginPath();
    ctx.moveTo(x - 0.13 * s, my - 0.02 * s);
    ctx.quadraticCurveTo(x, my + 0.03 * s, x + 0.13 * s, my - 0.02 * s);
    ctx.quadraticCurveTo(x + 0.11 * s, my + 0.17 * s, x, my + 0.18 * s);
    ctx.quadraticCurveTo(x - 0.11 * s, my + 0.17 * s, x - 0.13 * s, my - 0.02 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff7f9e';
    ellipse(ctx, x, my + 0.12 * s, 0.06 * s, 0.035 * s); ctx.fill();
  } else if (expr === 'worried') {
    ctx.lineWidth = 0.026 * s;
    ctx.beginPath();
    ctx.moveTo(x - 0.08 * s, my + 0.04 * s);
    ctx.quadraticCurveTo(x - 0.04 * s, my - 0.01 * s, x, my + 0.03 * s);
    ctx.quadraticCurveTo(x + 0.04 * s, my + 0.07 * s, x + 0.08 * s, my + 0.02 * s);
    ctx.stroke();
  } else {
    ctx.lineWidth = 0.03 * s;
    ctx.beginPath();
    ctx.arc(x, my - 0.04 * s, 0.075 * s, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
}

// ------------------------------------------------------------ bodies

function bodyBase(ctx, shape, a, lw) {
  shapePath(ctx, shape);
  ctx.fillStyle = a.color;
  ctx.fill();
  // soft top light and bottom shade inside the shape
  ctx.save();
  shapePath(ctx, shape);
  ctx.clip();
  const r = shape.radius;
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#ffffff';
  ellipse(ctx, -r * 0.2, -r * 0.75, r * 1.1, r * 0.55); ctx.fill();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = a.dark;
  ellipse(ctx, 0, r * 1.05, r * 1.4, r * 0.6); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function outline(ctx, shape, a, lw) {
  shapePath(ctx, shape);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = a.dark;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function insideClip(ctx, shape, fn) {
  ctx.save();
  shapePath(ctx, shape);
  ctx.clip();
  fn();
  ctx.restore();
}

// Species details. Coordinates are y-down metres around the centroid; the
// face anchor (a.face) is already in centroid coordinates via `fx`, `fy`.
const LOOKS = {
  hippo(ctx, shape, a, o) {
    ctx.fillStyle = a.color;
    for (const sx of [-0.55, 0.62]) { circle(ctx, sx + o.x, -0.68 + o.y, 0.14); ctx.fill(); ctx.strokeStyle = a.dark; ctx.lineWidth = 0.05; ctx.stroke(); }
    ctx.fillStyle = a.cheek; for (const sx of [-0.55, 0.62]) { circle(ctx, sx + o.x, -0.7 + o.y, 0.06); ctx.fill(); }
    bodyBase(ctx, shape, a);
    insideClip(ctx, shape, () => {
      ctx.fillStyle = a.belly;
      ellipse(ctx, 0.45 + o.x, 0.28 + o.y, 0.48, 0.27); ctx.fill();
      ctx.fillStyle = a.dark;
      circle(ctx, 0.3 + o.x, 0.24 + o.y, 0.04); ctx.fill();
      circle(ctx, 0.6 + o.x, 0.24 + o.y, 0.04); ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = a.dark;
      circle(ctx, -0.6 + o.x, 0.1 + o.y, 0.08); ctx.fill();
      circle(ctx, -0.42 + o.x, 0.25 + o.y, 0.05); ctx.fill();
      ctx.globalAlpha = 1;
    });
  },
  giraffe(ctx, shape, a, o) {
    // ossicones on the head end
    ctx.strokeStyle = a.dark; ctx.lineWidth = 0.06; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(1.15 + o.x, -0.28 + o.y); ctx.lineTo(1.1 + o.x, -0.5 + o.y);
    ctx.moveTo(1.4 + o.x, -0.28 + o.y); ctx.lineTo(1.45 + o.x, -0.5 + o.y);
    ctx.stroke();
    ctx.fillStyle = '#8a5418';
    circle(ctx, 1.1 + o.x, -0.52 + o.y, 0.06); ctx.fill();
    circle(ctx, 1.45 + o.x, -0.52 + o.y, 0.06); ctx.fill();
    bodyBase(ctx, shape, a);
    insideClip(ctx, shape, () => {
      ctx.fillStyle = '#d9862a';
      const spots = [[-1.45, -0.12, 0.13], [-1.1, 0.12, 0.15], [-0.75, -0.14, 0.12], [-0.4, 0.1, 0.16], [-0.05, -0.12, 0.13], [0.3, 0.13, 0.14], [0.65, -0.1, 0.12]];
      for (const [x, y, r] of spots) { ellipse(ctx, x + o.x, y + o.y, r * 1.2, r, 0.4); ctx.fill(); }
      ctx.fillStyle = a.belly;
      ellipse(ctx, 1.48 + o.x, 0.12 + o.y, 0.26, 0.16); ctx.fill();
    });
  },
  panda(ctx, shape, a, o) {
    ctx.fillStyle = a.dark;
    circle(ctx, -0.48, -0.5, 0.22); ctx.fill();
    circle(ctx, 0.48, -0.5, 0.22); ctx.fill();
    bodyBase(ctx, shape, a);
    ctx.fillStyle = a.dark;
    ellipse(ctx, -0.2, -0.04, 0.16, 0.2, 0.5); ctx.fill();
    ellipse(ctx, 0.2, -0.04, 0.16, 0.2, -0.5); ctx.fill();
    ctx.fillStyle = '#2a2a36';
    ellipse(ctx, 0, 0.1, 0.07, 0.05); ctx.fill();
  },
  turtle(ctx, shape, a, o) {
    // little head and feet poke out of the shell
    ctx.fillStyle = '#9be37a';
    for (const sx of [-0.95, 0.95]) { ellipse(ctx, sx, 0.3, 0.17, 0.08); ctx.fill(); }
    bodyBase(ctx, shape, a);
    insideClip(ctx, shape, () => {
      ctx.strokeStyle = 'rgba(30, 100, 50, 0.55)'; ctx.lineWidth = 0.045;
      for (const cx of [-0.75, -0.25, 0.25, 0.75]) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const px = cx + Math.cos(ang) * 0.22, py = -0.08 + Math.sin(ang) * 0.17;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      }
      ctx.fillStyle = a.belly;
      ctx.fillRect(-1.3, 0.16, 2.6, 0.2);
    });
  },
  penguin(ctx, shape, a) {
    bodyBase(ctx, shape, a);
    insideClip(ctx, shape, () => {
      ctx.fillStyle = a.belly;
      ellipse(ctx, 0, 0.18, 0.34, 0.62); ctx.fill();
      ellipse(ctx, 0, -0.32, 0.3, 0.22); ctx.fill();
    });
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath(); ctx.moveTo(-0.08, -0.2); ctx.lineTo(0.08, -0.2); ctx.lineTo(0, -0.08); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffb02e';
    ellipse(ctx, -0.2, 0.8, 0.13, 0.05); ctx.fill();
    ellipse(ctx, 0.2, 0.8, 0.13, 0.05); ctx.fill();
  },
  frog(ctx, shape, a, o) {
    bodyBase(ctx, shape, a);
    insideClip(ctx, shape, () => {
      ctx.fillStyle = a.belly;
      ellipse(ctx, 0 + o.x, 0.45 + o.y, 0.55, 0.3); ctx.fill();
      ctx.fillStyle = 'rgba(40, 120, 30, 0.35)';
      circle(ctx, -0.45 + o.x, 0.25 + o.y, 0.07); ctx.fill();
      circle(ctx, 0.5 + o.x, 0.3 + o.y, 0.06); ctx.fill();
      circle(ctx, 0.1 + o.x, -0.45 + o.y, 0.06); ctx.fill();
    });
  },
  owl(ctx, shape, a) {
    bodyBase(ctx, shape, a);
    insideClip(ctx, shape, () => {
      ctx.fillStyle = a.belly;
      ellipse(ctx, 0, 0.35, 0.42, 0.34); ctx.fill();
      ctx.strokeStyle = 'rgba(127, 82, 50, 0.6)'; ctx.lineWidth = 0.04;
      for (const [x, y] of [[-0.15, 0.3], [0.15, 0.3], [0, 0.45], [-0.25, 0.48], [0.25, 0.48]]) {
        ctx.beginPath(); ctx.moveTo(x - 0.07, y - 0.03); ctx.lineTo(x, y + 0.03); ctx.lineTo(x + 0.07, y - 0.03); ctx.stroke();
      }
      ctx.fillStyle = '#fff1dc';
      circle(ctx, -0.2, -0.1, 0.2); ctx.fill();
      circle(ctx, 0.2, -0.1, 0.2); ctx.fill();
      ctx.fillStyle = a.dark;
      ctx.beginPath(); ctx.moveTo(-0.42, -0.62); ctx.lineTo(-0.2, -0.5); ctx.lineTo(-0.46, -0.4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.42, -0.62); ctx.lineTo(0.2, -0.5); ctx.lineTo(0.46, -0.4); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath(); ctx.moveTo(-0.06, 0.0); ctx.lineTo(0.06, 0.0); ctx.lineTo(0, 0.1); ctx.closePath(); ctx.fill();
  },
  pig(ctx, shape, a, o) {
    bodyBase(ctx, shape, a);
    insideClip(ctx, shape, () => {
      ctx.fillStyle = a.dark;
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(-0.38 + o.x, -0.38 + o.y); ctx.lineTo(-0.2 + o.x, -0.5 + o.y); ctx.lineTo(-0.16 + o.x, -0.28 + o.y); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.38 + o.x, -0.38 + o.y); ctx.lineTo(0.2 + o.x, -0.5 + o.y); ctx.lineTo(0.16 + o.x, -0.28 + o.y); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = '#ff8fb3';
    ellipse(ctx, a.face.x, -a.face.y + 0.12, 0.17, 0.11); ctx.fill();
    ctx.strokeStyle = a.dark; ctx.lineWidth = 0.03; ctx.stroke();
    ctx.fillStyle = a.dark;
    ellipse(ctx, a.face.x - 0.06, -a.face.y + 0.12, 0.025, 0.04); ctx.fill();
    ellipse(ctx, a.face.x + 0.06, -a.face.y + 0.12, 0.025, 0.04); ctx.fill();
  },
  elephant(ctx, shape, a) {
    bodyBase(ctx, shape, a);
    insideClip(ctx, shape, () => {
      ctx.fillStyle = a.belly;
      ellipse(ctx, -0.45, -0.05, 0.38, 0.48); ctx.fill();
      ctx.strokeStyle = a.dark; ctx.lineWidth = 0.04; ctx.stroke();
      ctx.fillStyle = '#ffc6d2';
      ellipse(ctx, -0.45, -0.05, 0.22, 0.3); ctx.fill();
      // trunk
      ctx.strokeStyle = a.dark; ctx.lineWidth = 0.18; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0.3, 0.05); ctx.quadraticCurveTo(0.35, 0.55, 0.6, 0.55); ctx.stroke();
      ctx.strokeStyle = a.color; ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.moveTo(0.3, 0.05); ctx.quadraticCurveTo(0.35, 0.55, 0.6, 0.55); ctx.stroke();
      ctx.fillStyle = '#fffaf0';
      ctx.beginPath(); ctx.moveTo(0.1, 0.12); ctx.quadraticCurveTo(0.0, 0.3, 0.12, 0.36); ctx.lineTo(0.16, 0.16); ctx.closePath(); ctx.fill();
    });
  },
  hedgehog(ctx, shape, a, o) {
    bodyBase(ctx, shape, a);
    insideClip(ctx, shape, () => {
      // spines: a ring of dark triangles inside the dome edge
      ctx.fillStyle = '#7a5434';
      const cy = o.y;
      ctx.beginPath();
      for (let i = 0; i < 11; i++) {
        const ang = Math.PI + ((i + 0.5) / 11) * Math.PI;
        ctx.moveTo(Math.cos(ang - 0.13) * 0.58, cy + Math.sin(ang - 0.13) * 0.58);
        ctx.lineTo(Math.cos(ang) * 0.9, cy + Math.sin(ang) * 0.9);
        ctx.lineTo(Math.cos(ang + 0.13) * 0.58, cy + Math.sin(ang + 0.13) * 0.58);
        ctx.closePath();
      }
      ctx.fill();
      ctx.fillStyle = a.belly;
      ellipse(ctx, a.face.x, -a.face.y + 0.04, 0.36, 0.24); ctx.fill();
    });
    ctx.fillStyle = '#2a1d14';
    circle(ctx, a.face.x + 0.33, -a.face.y + 0.09, 0.05); ctx.fill();
  },
  croc(ctx, shape, a, o) {
    // eye bumps on top
    ctx.fillStyle = a.color;
    for (const sx of [0.8, 1.15]) { circle(ctx, sx + o.x, -0.32 + o.y, 0.12); ctx.fill(); ctx.strokeStyle = a.dark; ctx.lineWidth = 0.045; ctx.stroke(); }
    bodyBase(ctx, shape, a);
    insideClip(ctx, shape, () => {
      ctx.fillStyle = 'rgba(25, 100, 70, 0.45)';
      for (let x = -1.25; x < 0.6; x += 0.32) { ellipse(ctx, x + o.x, -0.18 + o.y, 0.12, 0.08); ctx.fill(); }
      ctx.fillStyle = a.belly;
      ctx.fillRect(-1.6 + o.x, 0.18 + o.y, 3.2, 0.2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let x = 0.75; x < 1.45; x += 0.14) { ctx.moveTo(x + o.x, 0.17 + o.y); ctx.lineTo(x + 0.06 + o.x, 0.25 + o.y); ctx.lineTo(x + 0.12 + o.x, 0.17 + o.y); }
      ctx.fill();
    });
  },
  chick(ctx, shape, a) {
    ctx.strokeStyle = '#e0a400'; ctx.lineWidth = 0.05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -0.42); ctx.quadraticCurveTo(-0.05, -0.58, 0.08, -0.6); ctx.moveTo(0, -0.42); ctx.quadraticCurveTo(0.1, -0.52, 0.18, -0.5); ctx.stroke();
    bodyBase(ctx, shape, a);
    insideClip(ctx, shape, () => {
      ctx.fillStyle = '#ffd21f';
      ellipse(ctx, -0.36, 0.12, 0.14, 0.2, 0.4); ctx.fill();
      ellipse(ctx, 0.36, 0.12, 0.14, 0.2, -0.4); ctx.fill();
    });
    ctx.fillStyle = '#ff9b2e';
    ctx.beginPath(); ctx.moveTo(-0.07, 0.04); ctx.lineTo(0.07, 0.04); ctx.lineTo(0, 0.13); ctx.closePath(); ctx.fill();
  },
};

const FACE_OPTS = {
  hippo: { gap: 0.22, mouthDrop: 0.3 },
  giraffe: { gap: 0.2, mouthDrop: 0.2, eyeLift: 0.12 },
  panda: { gap: 0.22, mouthDrop: 0.22 },
  turtle: { gap: 0.24, mouthDrop: 0.16 },
  penguin: { gap: 0.2, mouthDrop: 0.3, eyeLift: 0.08 },
  frog: { gap: 0.3, mouthDrop: 0.2, eyeLift: 0.12 },
  owl: { gap: 0.24, mouthDrop: 0.3, noMouth: true },
  pig: { gap: 0.25, mouthDrop: 0.34, eyeLift: 0.12 },
  elephant: { gap: 0.18, mouthDrop: 0.32, noMouth: true },
  hedgehog: { gap: 0.18, mouthDrop: 0.24 },
  croc: { gap: 0.22, mouthDrop: 0.22, eyeLift: 0.22, noMouth: true },
  chick: { gap: 0.2, mouthDrop: 0.3 },
};

// Draws one animal at the current transform (y-down metres, centred on the
// centroid). Used by the sprite baker and by the collection cards.
export function drawAnimal(ctx, a, expr = 'idle') {
  const shape = animalShape(a.id);
  const o = { x: -shape.offset.x, y: shape.offset.y }; // shape coords -> centroid coords (y-down)
  const fa = { ...a, face: { x: a.face.x - shape.offset.x, y: a.face.y - shape.offset.y, s: a.face.s } };
  const lw = 0.06;
  LOOKS[a.look](ctx, shape, fa, o);
  outline(ctx, shape, a, lw);
  face(ctx, fa, expr, FACE_OPTS[a.id] || {});
}

export function drawSilhouette(ctx, a, color = 'rgba(40, 30, 80, 0.55)') {
  const shape = animalShape(a.id);
  shapePath(ctx, shape);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawIce(ctx, a) {
  const shape = animalShape(a.id);
  shapePath(ctx, shape);
  ctx.fillStyle = 'rgba(190, 236, 255, 0.42)';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 0.08;
  ctx.stroke();
  insideClip(ctx, shape, () => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 0.07; ctx.lineCap = 'round';
    const r = shape.radius;
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.1); ctx.lineTo(-r * 0.45, -r * 0.45);
    ctx.moveTo(-r * 0.5, r * 0.05); ctx.lineTo(-r * 0.38, -r * 0.12);
    ctx.moveTo(r * 0.5, r * 0.4); ctx.lineTo(r * 0.68, r * 0.15);
    ctx.stroke();
  });
}

// Bakes every animal at `scale` pixels per metre.
export class SpriteBank {
  constructor() {
    this.scale = 0;
    this.sprites = new Map(); // id -> { idle, blink, grin, worried, ice, size }
  }

  bake(scale) {
    if (Math.abs(scale - this.scale) < 0.5 && this.sprites.size) return;
    this.scale = scale;
    this.sprites.clear();
    for (const a of ANIMALS) this.sprites.set(a.id, this.bakeOne(a, scale));
  }

  bakeOne(a, scale) {
    const shape = animalShape(a.id);
    const half = shape.radius + PAD;
    const px = Math.ceil(half * 2 * scale);
    const out = { half, px };
    const mk = (fn) => {
      const c = makeCanvas(px, px);
      const ctx = c.getContext('2d');
      ctx.translate(px / 2, px / 2);
      ctx.scale(scale, scale);
      fn(ctx);
      return c;
    };
    for (const e of EXPRESSIONS) out[e] = mk((ctx) => drawAnimal(ctx, a, e));
    out.ice = mk((ctx) => drawIce(ctx, a));
    return out;
  }

  get(id) { return this.sprites.get(id); }
}
