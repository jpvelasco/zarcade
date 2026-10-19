// Storybook sprites, drawn once with canvas paths into offscreen canvases
// and reused every frame. Every sprite is designed on a 100 x 100 grid with
// its feet at y = 96. Monsters face left (toward the knight); the knight and
// pets face right.

const INK = '#3a2a3f';
const cache = new Map();

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function bake(key, px, draw) {
  const id = `${key}@${px}`;
  let c = cache.get(id);
  if (c) return c;
  c = makeCanvas(px, px);
  const g = c.getContext('2d');
  g.scale(px / 100, px / 100);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = INK;
  g.lineWidth = 3;
  draw(g);
  cache.set(id, c);
  return c;
}

export function clearSpriteCache() { cache.clear(); }

// ------------------------------------------------------------ helpers

function ell(g, x, y, rx, ry, fill, stroke = true, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) g.stroke();
}

function rrect(g, x, y, w, h, r, fill, stroke = true) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) g.stroke();
}

function poly(g, pts, fill, stroke = true) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) g.stroke();
}

// Friendly eyes looking left. mood: 'happy' | 'grumpy' | 'sleepy' | 'wide'.
function eyes(g, x, y, gap = 14, r = 6, mood = 'happy') {
  for (const ex of [x, x + gap]) {
    if (mood === 'sleepy') {
      g.beginPath();
      g.arc(ex, y, r * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      continue;
    }
    ell(g, ex, y, r, r * 1.15, '#fff', true);
    ell(g, ex - r * 0.35, y + r * 0.1, r * 0.5, r * 0.6, INK, false);
    ell(g, ex - r * 0.5, y - r * 0.3, r * 0.18, r * 0.18, '#fff', false);
  }
  if (mood === 'grumpy') {
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(x - r - 1, y - r - 4); g.lineTo(x + r, y - r);
    g.moveTo(x + gap - r, y - r); g.lineTo(x + gap + r + 1, y - r - 4);
    g.stroke();
    g.lineWidth = 3;
  }
}

function smile(g, x, y, w = 8, open = false) {
  g.beginPath();
  g.arc(x, y - w * 0.4, w, 0.15 * Math.PI, 0.85 * Math.PI);
  if (open) { g.closePath(); g.fillStyle = '#c44a5f'; g.fill(); }
  g.stroke();
}

function frown(g, x, y, w = 6) {
  g.beginPath();
  g.arc(x, y + w * 0.9, w, 1.2 * Math.PI, 1.8 * Math.PI);
  g.stroke();
}

function cheeks(g, x1, x2, y, color = 'rgba(255,120,150,0.55)') {
  ell(g, x1, y, 4.5, 3, color, false);
  ell(g, x2, y, 4.5, 3, color, false);
}

function shine(g, x, y, rx, ry) {
  ell(g, x, y, rx, ry, 'rgba(255,255,255,0.65)', false, -0.5);
}

function blob(g, color, top = 40) {
  g.beginPath();
  g.moveTo(14, 94);
  g.bezierCurveTo(6, 94, 6, 74, 16, 66);
  g.bezierCurveTo(22, top, 78, top, 84, 66);
  g.bezierCurveTo(94, 74, 94, 94, 86, 94);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.stroke();
}

function crown(g, x, y, s = 1) {
  poly(g, [x - 16 * s, y, x - 18 * s, y - 16 * s, x - 8 * s, y - 8 * s, x, y - 20 * s, x + 8 * s, y - 8 * s, x + 18 * s, y - 16 * s, x + 16 * s, y], '#ffd34f');
  ell(g, x, y - 6 * s, 3 * s, 3 * s, '#ff5d7a', false);
}

function topHat(g, x, y, s = 1, color = '#3d3355', band = '#e94b5b') {
  rrect(g, x - 15 * s, y - 2 * s, 30 * s, 5 * s, 2, color);
  rrect(g, x - 10 * s, y - 22 * s, 20 * s, 21 * s, 3, color);
  g.fillStyle = band;
  g.fillRect(x - 9 * s, y - 7 * s, 18 * s, 4 * s);
}

// ------------------------------------------------------------ monsters

const MONSTER_ART = {
  slime(g) {
    blob(g, '#77d86a', 38);
    shine(g, 34, 56, 9, 5);
    eyes(g, 34, 66, 18, 7);
    smile(g, 43, 82, 7, true);
    cheeks(g, 26, 62, 78);
  },
  jelly(g) {
    blob(g, '#ff9fd0', 44);
    g.beginPath();
    g.moveTo(22, 64); g.quadraticCurveTo(50, 54, 78, 64);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.stroke(); g.strokeStyle = INK;
    ell(g, 54, 42, 7, 7, '#e8344f');
    g.beginPath(); g.moveTo(55, 35); g.quadraticCurveTo(58, 26, 64, 24); g.stroke();
    eyes(g, 34, 70, 18, 6.5);
    smile(g, 43, 85, 6);
  },
  bee(g) {
    ell(g, 58, 30, 14, 10, 'rgba(200,235,255,0.9)', true, -0.4);
    ell(g, 70, 34, 12, 8, 'rgba(200,235,255,0.9)', true, -0.1);
    ell(g, 50, 62, 32, 26, '#ffd23f');
    g.save();
    g.beginPath(); g.ellipse(50, 62, 32, 26, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = INK;
    g.fillRect(56, 30, 8, 70);
    g.fillRect(72, 30, 8, 70);
    g.restore();
    ell(g, 50, 62, 32, 26, null);
    g.beginPath(); g.moveTo(30, 40); g.quadraticCurveTo(24, 26, 16, 24); g.stroke();
    ell(g, 15, 23, 3.5, 3.5, INK, false);
    eyes(g, 28, 58, 14, 6);
    smile(g, 34, 74, 6);
    cheeks(g, 22, 46, 70);
  },
  mushroom(g) {
    rrect(g, 34, 56, 34, 36, 12, '#f6e6c8');
    eyes(g, 40, 70, 14, 5.5, 'grumpy');
    frown(g, 48, 84, 6);
    g.beginPath();
    g.moveTo(8, 60);
    g.bezierCurveTo(8, 18, 92, 18, 92, 60);
    g.quadraticCurveTo(50, 70, 8, 60);
    g.fillStyle = '#e8484f'; g.fill(); g.stroke();
    for (const [x, y, r] of [[30, 40, 6], [54, 32, 7], [74, 46, 5], [46, 52, 4]]) ell(g, x, y, r, r * 0.85, '#fff4ea', false);
    ell(g, 38, 96, 9, 4, '#8a5a3a');
    ell(g, 64, 96, 9, 4, '#8a5a3a');
  },
  snail(g) {
    g.beginPath();
    g.moveTo(8, 94); g.lineTo(84, 94); g.quadraticCurveTo(90, 80, 70, 80);
    g.lineTo(26, 80); g.quadraticCurveTo(22, 58, 18, 50);
    g.quadraticCurveTo(6, 52, 8, 94);
    g.fillStyle = '#a9d3a0'; g.fill(); g.stroke();
    ell(g, 58, 60, 26, 26, '#f3a94b');
    g.beginPath();
    for (let a = 0; a < 12; a += 0.2) {
      const r = 22 - a * 1.7;
      const x = 58 + Math.cos(a) * r;
      const y = 60 + Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.beginPath(); g.moveTo(14, 52); g.lineTo(10, 34); g.moveTo(20, 50); g.lineTo(22, 32); g.stroke();
    ell(g, 10, 32, 4, 4, '#fff');
    ell(g, 22, 30, 4, 4, '#fff');
    ell(g, 9, 32, 2, 2, INK, false);
    ell(g, 21, 30, 2, 2, INK, false);
    // a very fine moustache
    g.beginPath();
    g.moveTo(14, 66); g.quadraticCurveTo(6, 62, 4, 68);
    g.moveTo(14, 66); g.quadraticCurveTo(22, 62, 24, 68);
    g.lineWidth = 4; g.stroke(); g.lineWidth = 3;
  },
  stump(g) {
    rrect(g, 18, 40, 64, 56, 10, '#b77a4b');
    ell(g, 50, 40, 32, 9, '#e7c08d');
    g.beginPath(); g.ellipse(50, 40, 20, 5, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(50, 40, 9, 2.5, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(70, 34); g.quadraticCurveTo(76, 18, 88, 16); g.stroke();
    ell(g, 86, 18, 8, 4, '#7fcf6a', true, -0.4);
    eyes(g, 34, 64, 18, 6, 'sleepy');
    ell(g, 43, 80, 5, 4, '#6b3d2a');
    g.strokeStyle = '#8a5a3a';
    for (const x of [26, 74]) { g.beginPath(); g.moveTo(x, 50); g.lineTo(x, 88); g.stroke(); }
    g.strokeStyle = INK;
  },
  goose(g) {
    ell(g, 58, 72, 30, 20, '#fbfbf7');
    poly(g, [80, 64, 96, 54, 88, 74], '#fbfbf7');
    g.beginPath();
    g.moveTo(40, 66); g.quadraticCurveTo(28, 50, 34, 30);
    g.lineWidth = 15; g.strokeStyle = INK; g.stroke();
    g.lineWidth = 10; g.strokeStyle = '#fbfbf7'; g.stroke();
    g.lineWidth = 3; g.strokeStyle = INK;
    ell(g, 34, 28, 13, 12, '#fbfbf7');
    poly(g, [22, 28, 6, 32, 22, 36], '#ff9f2e');
    eyes(g, 28, 26, 0, 4.5);
    // the helmet nobody can explain
    g.beginPath(); g.arc(36, 22, 14, Math.PI, 0); g.closePath();
    g.fillStyle = '#b8c4d0'; g.fill(); g.stroke();
    rrect(g, 20, 20, 32, 5, 2, '#8995a3');
    g.beginPath(); g.moveTo(36, 8); g.quadraticCurveTo(46, 0, 52, 6); g.lineWidth = 5; g.strokeStyle = '#e94b5b'; g.stroke();
    g.lineWidth = 3; g.strokeStyle = INK;
    for (const x of [50, 66]) { g.beginPath(); g.moveTo(x, 90); g.lineTo(x, 96); g.stroke(); ell(g, x - 3, 96, 6, 2.5, '#ff9f2e'); }
  },
  pumpkin(g) {
    for (const [x, rx] of [[30, 22], [70, 22], [50, 24]]) ell(g, x, 64, rx, 30, '#ff9a3c');
    g.beginPath(); g.moveTo(50, 36); g.quadraticCurveTo(48, 24, 56, 18); g.lineWidth = 6; g.strokeStyle = '#5a8f3a'; g.stroke();
    g.lineWidth = 3; g.strokeStyle = INK;
    ell(g, 64, 28, 10, 5, '#7fcf6a', true, 0.4);
    eyes(g, 34, 60, 18, 6);
    smile(g, 43, 80, 8, true);
    cheeks(g, 24, 64, 74);
  },
  pig(g) {
    ell(g, 54, 66, 34, 26, '#ffb3c4');
    poly(g, [36, 42, 30, 26, 46, 38], '#ff9fb4');
    poly(g, [62, 40, 70, 24, 74, 42], '#ff9fb4');
    ell(g, 24, 70, 11, 9, '#ff9fb4');
    ell(g, 20, 70, 2, 3, INK, false);
    ell(g, 27, 70, 2, 3, INK, false);
    eyes(g, 36, 56, 16, 5);
    ell(g, 66, 80, 8, 5, '#9a6a4a', false);
    ell(g, 76, 60, 5, 3, '#9a6a4a', false);
    for (const x of [36, 50, 64, 76]) rrect(g, x - 4, 86, 8, 10, 3, '#ff9fb4');
    g.beginPath(); g.arc(90, 62, 5, Math.PI, 2.5 * Math.PI); g.stroke();
  },
  puff(g) {
    g.fillStyle = '#ffffff';
    for (const [x, y, r] of [[28, 66, 18], [50, 52, 24], [72, 64, 18], [50, 76, 20], [36, 78, 14], [66, 80, 14]]) ell(g, x, y, r, r, '#fff');
    g.fillStyle = '#fff';
    for (const [x, y, r] of [[28, 66, 16], [50, 52, 22], [72, 64, 16], [50, 76, 18], [36, 78, 12], [66, 80, 12]]) ell(g, x, y, r, r, '#fff', false);
    eyes(g, 36, 62, 18, 6);
    smile(g, 45, 78, 6);
    cheeks(g, 28, 64, 72, 'rgba(140,170,255,0.5)');
    ell(g, 30, 96, 3, 4, '#7fb8ff', false);
  },
  teapot(g) {
    g.beginPath(); g.moveTo(28, 62); g.quadraticCurveTo(8, 60, 4, 42); g.lineWidth = 9; g.stroke(); g.lineWidth = 5; g.strokeStyle = '#4fc1b4'; g.stroke();
    g.lineWidth = 3; g.strokeStyle = INK;
    g.beginPath(); g.arc(80, 62, 12, -Math.PI / 2, Math.PI / 2); g.lineWidth = 6; g.stroke(); g.lineWidth = 3;
    ell(g, 50, 64, 30, 24, '#5fd1c3');
    rrect(g, 30, 36, 40, 8, 4, '#4fc1b4');
    ell(g, 50, 32, 6, 5, '#ffd34f');
    g.fillStyle = '#ffffff';
    for (const [x, y] of [[62, 56], [70, 70], [56, 76]]) ell(g, x, y, 3, 3, '#fff', false);
    eyes(g, 32, 60, 14, 5);
    smile(g, 38, 74, 5);
    for (const x of [38, 62]) rrect(g, x - 4, 86, 8, 10, 3, '#4fc1b4');
  },
  bat(g) {
    poly(g, [50, 56, 4, 40, 12, 56, 4, 66, 22, 66, 30, 74], '#8f6bd8');
    poly(g, [50, 56, 96, 40, 88, 56, 96, 66, 78, 66, 70, 74], '#8f6bd8');
    ell(g, 50, 62, 20, 20, '#a483ea');
    poly(g, [36, 46, 38, 30, 46, 44], '#a483ea');
    poly(g, [54, 44, 62, 30, 64, 46], '#a483ea');
    eyes(g, 42, 58, 14, 5.5);
    smile(g, 48, 72, 4);
    poly(g, [50, 80, 40, 74, 40, 86], '#ff5d7a');
    poly(g, [50, 80, 60, 74, 60, 86], '#ff5d7a');
    ell(g, 50, 80, 3, 3, '#ff5d7a');
  },
  bookworm(g) {
    rrect(g, 30, 82, 60, 12, 2, '#d9534f');
    g.fillStyle = '#fff4ea'; g.fillRect(34, 84, 52, 3);
    for (const [x, y, r] of [[80, 74, 11], [66, 70, 12], [52, 66, 13]]) ell(g, x, y, r, r, '#9ad86b');
    ell(g, 32, 52, 18, 18, '#9ad86b');
    ell(g, 26, 50, 7, 7, '#fff'); ell(g, 42, 50, 7, 7, '#fff');
    g.beginPath(); g.moveTo(33, 50); g.lineTo(35, 50); g.stroke();
    ell(g, 24, 51, 3, 3.5, INK, false); ell(g, 40, 51, 3, 3.5, INK, false);
    smile(g, 32, 64, 5);
    g.beginPath(); g.moveTo(30, 34); g.lineTo(26, 24); g.moveTo(38, 34); g.lineTo(42, 24); g.stroke();
  },
  inkblot(g) {
    g.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 34 + (i % 2 ? 6 : -2);
      const x = 50 + Math.cos(a) * r;
      const y = 64 + Math.sin(a) * r * 0.85;
      if (i === 0) g.moveTo(x, y); else g.quadraticCurveTo(50 + Math.cos(a - 0.22) * (r + 8), 64 + Math.sin(a - 0.22) * (r + 8) * 0.85, x, y);
    }
    g.fillStyle = '#3b3f9c'; g.fill(); g.stroke();
    shine(g, 36, 48, 7, 4);
    eyes(g, 36, 62, 18, 7, 'wide');
    smile(g, 45, 80, 6);
    g.beginPath(); g.moveTo(78, 40); g.lineTo(96, 6); g.lineWidth = 4; g.stroke();
    poly(g, [96, 6, 86, 18, 92, 22], '#fff4ea');
    g.lineWidth = 3;
  },
  crane(g) {
    poly(g, [20, 70, 50, 52, 80, 70, 50, 90], '#fff7f0');
    poly(g, [50, 52, 66, 18, 72, 60], '#ffd6e6');
    poly(g, [50, 52, 34, 22, 40, 62], '#ffe6c2');
    poly(g, [20, 70, 6, 40, 12, 38, 28, 66], '#fff7f0');
    poly(g, [6, 40, 0, 46, 8, 46], '#ff8fb8');
    poly(g, [80, 70, 96, 52, 86, 76], '#ffd6e6');
    ell(g, 10, 42, 1.6, 1.6, INK, false);
    g.beginPath(); g.moveTo(50, 52); g.lineTo(50, 90); g.stroke();
  },

  // ---------------------------------------------------------- bosses

  kingSlime(g) {
    MONSTER_ART.slime(g);
    crown(g, 52, 42, 1.1);
    rrect(g, 44, 88, 12, 4, 2, '#ffd34f', false);
  },
  mayorMorel(g) {
    MONSTER_ART.mushroom(g);
    topHat(g, 50, 26, 1);
    g.strokeStyle = '#ffd34f'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(36, 62); g.lineTo(66, 90); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 3;
  },
  captainHonk(g) {
    MONSTER_ART.goose(g);
    rrect(g, 18, 12, 36, 10, 4, '#2c3e7a');
    rrect(g, 14, 20, 30, 5, 2, '#1e2a55');
    ell(g, 36, 16, 4, 3, '#ffd34f', false);
    g.strokeStyle = '#ffd34f';
    g.beginPath(); g.moveTo(44, 60); g.lineTo(60, 60); g.stroke();
    g.strokeStyle = INK;
  },
  baronFluff(g) {
    MONSTER_ART.puff(g);
    topHat(g, 50, 32, 1, '#5b4b8a', '#ffd34f');
    g.beginPath();
    g.moveTo(45, 72); g.quadraticCurveTo(32, 64, 26, 74);
    g.moveTo(45, 72); g.quadraticCurveTo(58, 64, 64, 74);
    g.lineWidth = 5; g.strokeStyle = '#d8d8f0'; g.stroke();
    g.lineWidth = 3; g.strokeStyle = INK;
    g.beginPath(); g.arc(54, 62, 8, 0, Math.PI * 2); g.stroke();
  },
  grumble(g) {
    poly(g, [64, 46, 92, 26, 86, 50, 96, 52, 80, 62], '#b89cff');
    g.beginPath(); g.moveTo(80, 84); g.quadraticCurveTo(100, 88, 96, 70); g.lineWidth = 9; g.stroke(); g.lineWidth = 5; g.strokeStyle = '#8f6bd8'; g.stroke();
    g.lineWidth = 3; g.strokeStyle = INK;
    ell(g, 56, 72, 30, 24, '#8f6bd8');
    ell(g, 50, 78, 18, 14, '#ffe2a8');
    ell(g, 32, 46, 22, 18, '#8f6bd8');
    ell(g, 14, 52, 10, 8, '#8f6bd8');
    ell(g, 10, 50, 1.6, 1.6, INK, false);
    ell(g, 16, 49, 1.6, 1.6, INK, false);
    eyes(g, 26, 42, 14, 5.5, 'sleepy');
    g.beginPath(); g.moveTo(20, 58); g.quadraticCurveTo(26, 62, 32, 58); g.stroke();
    // nightcap
    poly(g, [18, 32, 52, 30, 70, 8], '#6fc6ff');
    ell(g, 72, 8, 5, 5, '#fff');
    g.fillStyle = '#fff'; g.fillRect(18, 28, 34, 6); g.strokeRect(18, 28, 34, 6);
    for (const x of [44, 66]) rrect(g, x - 5, 88, 10, 8, 3, '#8f6bd8');
  },
};

export const MONSTER_TYPES = Object.keys(MONSTER_ART);

export function monsterSprite(type, px) {
  return bake(`m:${type}`, px, (g) => (MONSTER_ART[type] || MONSTER_ART.slime)(g));
}

// A flat dark silhouette for bestiary entries not met yet.
export function silhouetteSprite(type, px) {
  return bake(`s:${type}`, px, (g) => {
    (MONSTER_ART[type] || MONSTER_ART.slime)(g);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#4a3f66';
    g.fillRect(0, 0, 100, 100);
  });
}

// ------------------------------------------------------------ knight

export const ARMOUR = {
  tin: { main: '#cfd8e2', dark: '#8d99a8', plume: '#e94b5b', trim: '#ffd34f' },
  leaf: { main: '#86d46f', dark: '#4f9a45', plume: '#ffd84f', trim: '#fff4c2' },
  sky: { main: '#86bfff', dark: '#4c7fd0', plume: '#ffffff', trim: '#ffd34f' },
  ruby: { main: '#ff7584', dark: '#c23b52', plume: '#ffd84f', trim: '#fff0f2' },
  gold: { main: '#ffd85f', dark: '#cf9a1f', plume: '#ff6fb5', trim: '#fff8d8' },
  star: { main: '#c2b2ff', dark: '#6f5bd8', plume: '#5ef2ff', trim: '#ffe36b' },
};

// frame 0/1 = walking legs. The sword is a separate sprite.
export function knightSprite(armour, frame, px) {
  const a = ARMOUR[armour] || ARMOUR.tin;
  return bake(`k:${armour}:${frame}`, px, (g) => {
    const step = frame ? 5 : -5;
    rrect(g, 36 + step, 76, 11, 18, 4, a.dark);
    rrect(g, 53 - step, 76, 11, 18, 4, a.dark);
    ell(g, 41 + step, 95, 9, 4, '#5a4a5f');
    ell(g, 59 - step, 95, 9, 4, '#5a4a5f');
    // cape
    poly(g, [32, 50, 22, 84, 40, 80], '#5b8cff');
    rrect(g, 30, 50, 40, 32, 12, a.main);
    rrect(g, 30, 72, 40, 6, 3, a.trim, false);
    g.beginPath(); g.moveTo(30, 75); g.lineTo(70, 75); g.stroke();
    // emblem
    poly(g, [50, 56, 57, 60, 55, 68, 50, 71, 45, 68, 43, 60], a.trim);
    // helmet
    ell(g, 50, 34, 21, 20, a.main);
    rrect(g, 42, 26, 30, 15, 7, '#ffe2c4');
    ell(g, 55, 33, 3.6, 4.2, '#fff', false);
    ell(g, 65, 33, 3.6, 4.2, '#fff', false);
    ell(g, 56.2, 33.6, 2.1, 2.6, INK, false);
    ell(g, 66.2, 33.6, 2.1, 2.6, INK, false);
    ell(g, 51, 38.5, 2.6, 1.6, 'rgba(255,120,150,0.6)', false);
    g.beginPath(); g.arc(61, 37, 3, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = 2; g.stroke(); g.lineWidth = 3;
    ell(g, 50, 47, 5, 2, a.dark, false);
    g.beginPath(); g.moveTo(44, 16); g.quadraticCurveTo(30, 2, 18, 14); g.quadraticCurveTo(30, 10, 38, 22);
    g.closePath(); g.fillStyle = a.plume; g.fill(); g.stroke();
    // back arm with a round shield
    ell(g, 30, 64, 11, 13, a.dark);
    ell(g, 30, 64, 6, 7, a.trim, false);
  });
}

export const SWORDS = {
  wood: { blade: '#d9a46a', edge: '#a8723f', hilt: '#7a4b2a', guard: '#a8723f' },
  iron: { blade: '#e6edf4', edge: '#9aa8b8', hilt: '#5a4a5f', guard: '#ffd34f' },
  carrot: { blade: '#ff9a3c', edge: '#e0701a', hilt: '#5a8f3a', guard: '#7fcf6a' },
  feather: { blade: '#ffffff', edge: '#cfe0ff', hilt: '#8f6bd8', guard: '#ffd34f' },
  lolly: { blade: '#ff6fb5', edge: '#fff', hilt: '#f6efe2', guard: '#ff6fb5' },
  rainbow: { blade: 'rainbow', edge: '#fff', hilt: '#5a4a5f', guard: '#ffd34f' },
};

// Pointing straight up; pivot (the grip) at (50, 88).
export function swordSprite(id, px) {
  const s = SWORDS[id] || SWORDS.wood;
  return bake(`w:${id}`, px, (g) => {
    rrect(g, 46, 78, 8, 18, 3, s.hilt);
    rrect(g, 34, 72, 32, 7, 3, s.guard);
    if (id === 'carrot') {
      poly(g, [43, 72, 57, 72, 50, 8], s.blade);
      for (const y of [30, 46, 60]) { g.beginPath(); g.moveTo(46, y); g.lineTo(52, y + 2); g.stroke(); }
      return;
    }
    if (id === 'lolly') {
      rrect(g, 47, 30, 6, 44, 3, '#f6efe2');
      ell(g, 50, 22, 18, 18, s.blade);
      g.beginPath();
      for (let a = 0; a < 14; a += 0.25) {
        const r = 16 - a * 1.1;
        g.lineTo(50 + Math.cos(a) * r, 22 + Math.sin(a) * r);
      }
      g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.stroke(); g.strokeStyle = INK; g.lineWidth = 3;
      return;
    }
    if (id === 'feather') {
      g.beginPath(); g.moveTo(50, 72); g.bezierCurveTo(30, 50, 36, 16, 54, 4); g.bezierCurveTo(66, 24, 64, 54, 50, 72);
      g.fillStyle = s.blade; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(50, 72); g.quadraticCurveTo(50, 36, 54, 6); g.strokeStyle = s.edge; g.stroke(); g.strokeStyle = INK;
      return;
    }
    let fill = s.blade;
    if (fill === 'rainbow') {
      fill = g.createLinearGradient(0, 10, 0, 72);
      ['#ff5d7a', '#ffb13d', '#ffe36b', '#6fe08a', '#5ec8ff', '#a77bff'].forEach((c, i) => fill.addColorStop(i / 5, c));
    }
    poly(g, [44, 72, 44, 16, 50, 6, 56, 16, 56, 72], fill);
    g.beginPath(); g.moveTo(50, 12); g.lineTo(50, 68); g.strokeStyle = s.edge; g.lineWidth = 2; g.stroke();
    g.strokeStyle = INK; g.lineWidth = 3;
  });
}

// ------------------------------------------------------------ pets

const PET_ART = {
  puppy(g) {
    ell(g, 50, 72, 24, 16, '#e3b47a');
    for (const x of [36, 62]) rrect(g, x - 5, 80, 10, 16, 4, '#e3b47a');
    g.beginPath(); g.moveTo(28, 68); g.quadraticCurveTo(14, 58, 18, 50); g.lineWidth = 6; g.stroke(); g.lineWidth = 3;
    ell(g, 70, 52, 17, 15, '#e3b47a');
    ell(g, 60, 50, 6, 12, '#a8723f', true, 0.3);
    ell(g, 84, 56, 5, 4, INK, false);
    ell(g, 72, 48, 2.5, 3, INK, false);
    g.beginPath(); g.arc(78, 60, 4, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
    ell(g, 82, 66, 3, 4, '#ff7a90', false);
  },
  kitten(g) {
    ell(g, 48, 74, 22, 15, '#b9b4c8');
    for (const x of [36, 58]) rrect(g, x - 5, 82, 10, 14, 4, '#b9b4c8');
    g.beginPath(); g.moveTo(28, 72); g.quadraticCurveTo(10, 66, 16, 46); g.lineWidth = 6; g.stroke(); g.lineWidth = 3;
    ell(g, 68, 54, 16, 14, '#b9b4c8');
    poly(g, [56, 46, 58, 30, 66, 42], '#b9b4c8');
    poly(g, [72, 42, 80, 30, 82, 46], '#b9b4c8');
    ell(g, 66, 52, 2.5, 3.5, INK, false);
    ell(g, 76, 52, 2.5, 3.5, INK, false);
    ell(g, 72, 58, 2, 1.5, '#ff7a90', false);
    g.beginPath(); g.moveTo(80, 58); g.lineTo(92, 56); g.moveTo(80, 61); g.lineTo(92, 63); g.stroke();
  },
  duck(g) {
    ell(g, 46, 74, 24, 18, '#ffe066');
    ell(g, 66, 50, 15, 14, '#ffe066');
    poly(g, [78, 50, 92, 54, 78, 58], '#ff9f2e');
    ell(g, 68, 46, 2.5, 3, INK, false);
    ell(g, 40, 70, 12, 8, '#ffd23f', true, -0.3);
    for (const x of [40, 56]) ell(g, x, 95, 7, 3, '#ff9f2e');
  },
  owl(g) {
    ell(g, 50, 66, 26, 30, '#a8784f');
    ell(g, 50, 74, 16, 18, '#e8d0a8', false);
    poly(g, [30, 42, 32, 26, 42, 38], '#a8784f');
    poly(g, [58, 38, 68, 26, 70, 42], '#a8784f');
    ell(g, 40, 52, 10, 10, '#fff');
    ell(g, 60, 52, 10, 10, '#fff');
    ell(g, 42, 52, 4.5, 5, INK, false);
    ell(g, 62, 52, 4.5, 5, INK, false);
    poly(g, [46, 60, 54, 60, 50, 68], '#ffb13d');
    // tiny graduation cap
    poly(g, [32, 30, 50, 22, 68, 30, 50, 38], '#3d3355');
  },
  dragon(g) {
    poly(g, [44, 54, 30, 30, 54, 46], '#a6e88a');
    g.beginPath(); g.moveTo(28, 82); g.quadraticCurveTo(6, 84, 10, 66); g.lineWidth = 8; g.stroke(); g.lineWidth = 4; g.strokeStyle = '#6fcf6a'; g.stroke();
    g.lineWidth = 3; g.strokeStyle = INK;
    ell(g, 46, 74, 22, 18, '#6fcf6a');
    ell(g, 50, 78, 12, 10, '#fff1b8', false);
    ell(g, 68, 50, 17, 15, '#6fcf6a');
    ell(g, 72, 46, 3, 3.5, INK, false);
    g.beginPath(); g.arc(78, 56, 4, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
    poly(g, [60, 38, 62, 28, 68, 36], '#ffd34f');
    for (const x of [38, 56]) rrect(g, x - 5, 84, 10, 12, 4, '#6fcf6a');
  },
};

export const PET_TYPES = Object.keys(PET_ART);

export function petSprite(id, px) {
  if (!PET_ART[id]) return null;
  return bake(`p:${id}`, px, (g) => PET_ART[id](g));
}

// A soft round glow, baked once (used for the Star Spin and sparkles).
export function glowSprite(color, px) {
  return bake(`g:${color}`, px, (g) => {
    const grad = g.createRadialGradient(50, 50, 0, 50, 50, 50);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 100, 100);
  });
}
