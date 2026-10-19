// Vector piece art (SVG path data in a 100 x 100 box) and the board themes.
// The renderer bakes these into sprites once per size and theme.

const BASE = 'M17 93 Q17 83 28 83 L72 83 Q83 83 83 93 Z';
const LIP = 'M23 83 Q23 77 32 77 L68 77 Q77 77 77 83 Z';
const COLLAR = (y, w) => `M${50 - w} ${y} Q50 ${y - 6} ${50 + w} ${y} Q${50 + w} ${y + 7} 50 ${y + 7} Q${50 - w} ${y + 7} ${50 - w} ${y} Z`;
const circle = (cx, cy, r) => `M${cx - r} ${cy} A${r} ${r} 0 1 1 ${cx + r} ${cy} A${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;

export const PIECE_PATHS = {
  // pawn
  1: {
    body: [BASE, LIP, 'M38 50 C38 62 31 70 29 77 L71 77 C69 70 62 62 62 50 Z', COLLAR(47, 17), circle(50, 28, 15)],
    detail: [],
  },
  // knight (facing left)
  2: {
    body: [BASE, LIP, 'M31 77 C30 64 37 58 47 51 C41 52 35 54 29 58 C22 62 14 58 14 50 C14 43 20 37 27 31 C33 25 38 19 43 15 L46 5 L54 13 C71 15 81 31 81 50 C81 62 77 71 75 77 Z'],
    detail: ['M58 19 C67 25 72 35 72 46', 'M52 24 C60 30 64 39 64 49', 'M14 50 L22 51'],
    dots: [[39, 30, 3.6], [21, 46, 1.9]],
  },
  // bishop
  3: {
    body: [BASE, LIP, 'M41 63 C41 70 33 72 30 77 L70 77 C67 72 59 70 59 63 Z', COLLAR(59, 17), 'M50 17 C33 28 31 46 38 56 L62 56 C69 46 67 28 50 17 Z', circle(50, 11, 6.5)],
    detail: ['M58 29 L47 43'],
  },
  // rook
  4: {
    body: [BASE, LIP, 'M34 42 L66 42 L70 77 L30 77 Z', 'M28 33 L72 33 L68 43 L32 43 Z', 'M25 12 L36 12 L36 21 L44 21 L44 12 L56 12 L56 21 L64 21 L64 12 L75 12 L75 33 L25 33 Z'],
    detail: ['M34 55 L66 55'],
  },
  // queen
  5: {
    body: [BASE, LIP, 'M34 66 C33 71 28 74 26 77 L74 77 C72 74 67 71 66 66 Z', COLLAR(61, 20), 'M30 61 L19 26 L33 43 L36 17 L45 41 L50 13 L55 41 L64 17 L67 43 L81 26 L70 61 Z',
      circle(19, 24, 5.5), circle(36, 15, 5.5), circle(50, 10, 5.5), circle(64, 15, 5.5), circle(81, 24, 5.5)],
    detail: [],
  },
  // king
  6: {
    body: [BASE, LIP, 'M34 66 C33 71 28 74 26 77 L74 77 C72 74 67 71 66 66 Z', COLLAR(61, 20),
      'M50 31 C42 22 25 24 25 37 C25 47 33 54 35 61 L65 61 C67 54 75 47 75 37 C75 24 58 22 50 31 Z',
      'M46 3 L54 3 L54 10 L61 10 L61 17 L54 17 L54 27 L46 27 L46 17 L39 17 L39 10 L46 10 Z'],
    detail: ['M50 33 L50 58'],
  },
};

// Board and piece colors per theme.
export const THEMES = {
  wood: {
    name: 'Wood',
    light: '#f1d9ae', dark: '#b97f4f', grain: true,
    coordLight: '#a0683d', coordDark: '#f6e2bf',
    last: 'rgba(255, 213, 79, 0.42)', select: 'rgba(255, 236, 110, 0.62)',
    dot: 'rgba(52, 28, 8, 0.32)', ring: 'rgba(52, 28, 8, 0.38)', cursor: '#2f7dff', arrow: 'rgba(40, 150, 90, 0.82)',
    particles: ['#ffe9b8', '#d39a5f', '#fff6dd'],
    fog: ['#3d2a1d', '#5b4130'],
    pieces: [
      { top: '#fffaf0', bottom: '#e5cfa8', outline: '#3a2614', detail: '#6b4a2a' },
      { top: '#6d4529', bottom: '#2c170b', outline: '#130903', detail: '#c99a6b' },
    ],
  },
  candy: {
    name: 'Candy',
    light: '#fff1f7', dark: '#ffa5cf', stripes: true,
    coordLight: '#e0689f', coordDark: '#fff5fa',
    last: 'rgba(130, 230, 200, 0.5)', select: 'rgba(255, 245, 120, 0.7)',
    dot: 'rgba(140, 40, 110, 0.32)', ring: 'rgba(140, 40, 110, 0.38)', cursor: '#7a4dff', arrow: 'rgba(80, 90, 255, 0.78)',
    particles: ['#ff7ab6', '#7be0c3', '#ffe36e', '#8f7bff'],
    fog: ['#b980c9', '#e9b3dc'],
    pieces: [
      // A deep berry outline and a lilac-white body keep white pieces clear
      // of both the pale and the pink squares.
      { top: '#ffffff', bottom: '#efe6ff', outline: '#6e1a4c', detail: '#b8407c', width: 4.4 },
      { top: '#8f7bff', bottom: '#4b2fb8', outline: '#22105e', detail: '#d9d0ff' },
    ],
  },
  space: {
    name: 'Space',
    light: '#4d55a8', dark: '#262a6b', stars: true,
    coordLight: '#a9b2ff', coordDark: '#8b93e6',
    last: 'rgba(120, 220, 255, 0.36)', select: 'rgba(255, 230, 120, 0.5)',
    dot: 'rgba(210, 225, 255, 0.45)', ring: 'rgba(210, 225, 255, 0.5)', cursor: '#ffd84f', arrow: 'rgba(120, 255, 190, 0.8)',
    particles: ['#ffffff', '#9fd3ff', '#ffd84f', '#ff8ac2'],
    fog: ['#070818', '#191c46'],
    glow: true,
    pieces: [
      { top: '#ffffff', bottom: '#bcd0ff', outline: '#18205a', detail: '#5b6bc8', glow: 'rgba(170, 210, 255, 0.9)' },
      { top: '#ff9a64', bottom: '#c2324e', outline: '#2c0614', detail: '#ffd0b0', glow: 'rgba(255, 120, 120, 0.85)' },
    ],
  },
};

let pathCache = null;
function paths() {
  if (pathCache) return pathCache;
  pathCache = {};
  for (const [t, def] of Object.entries(PIECE_PATHS)) {
    const body = new Path2D();
    for (const d of def.body) body.addPath(new Path2D(d));
    const detail = new Path2D();
    for (const d of def.detail) detail.addPath(new Path2D(d));
    pathCache[t] = { body, detail, dots: def.dots || [] };
  }
  return pathCache;
}

// Draw one piece filling a `size` x `size` box at (x, y). Call at bake time
// only: it builds gradients and may use shadow blur for the space glow.
export function drawPiece(ctx, type, color, theme, x, y, size) {
  const th = THEMES[theme] || THEMES.wood;
  const pc = th.pieces[color];
  const p = paths()[type];
  if (!p) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  // Soft contact shadow.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(50, 93, 33, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (pc.glow) {
    ctx.save();
    ctx.shadowColor = pc.glow;
    ctx.shadowBlur = size * 0.09;
    ctx.fillStyle = pc.bottom;
    ctx.fill(p.body);
    ctx.restore();
  }
  const g = ctx.createLinearGradient(0, 5, 0, 93);
  g.addColorStop(0, pc.top);
  g.addColorStop(1, pc.bottom);
  ctx.fillStyle = g;
  ctx.fill(p.body);
  // Rounded shading: light from the upper left.
  ctx.save();
  ctx.clip(p.body);
  const side = ctx.createLinearGradient(15, 0, 85, 0);
  side.addColorStop(0, 'rgba(255,255,255,0.38)');
  side.addColorStop(0.42, 'rgba(255,255,255,0)');
  side.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, 100, 100);
  ctx.restore();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = pc.outline;
  ctx.lineWidth = pc.width || 3.4;
  ctx.stroke(p.body);
  ctx.strokeStyle = pc.detail;
  ctx.lineWidth = 2.6;
  ctx.stroke(p.detail);
  ctx.fillStyle = color === 0 ? pc.outline : pc.detail;
  for (const [cx, cy, r] of p.dots) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
