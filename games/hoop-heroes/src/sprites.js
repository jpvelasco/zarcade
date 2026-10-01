// Baked art: balls, Ace (from behind), rival portraits, blockers and court
// scenery. Everything is drawn once into offscreen canvases.
import { rng } from './rng.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ------------------------------------------------------------ balls

export const BALL_PX = 64; // baked radius

// The ball's surface pattern (rotates with spin). Drawn centred at 0,0.
function paintBallPattern(g, skin, r) {
  const [c0, c1] = skin.colors;
  g.save();
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.clip();
  const lw = r * 0.07;
  switch (skin.pattern) {
    case 'stripes': {
      const cols = skin.colors;
      const bands = [cols[0], cols[1], cols[2], cols[1], cols[0]];
      bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(-r, -r + (i * 2 * r) / bands.length, 2 * r, (2 * r) / bands.length + 1); });
      g.fillStyle = '#ffffff';
      for (const [x, y] of [[-0.4, -0.05], [0.35, 0.02], [0, -0.02]]) star(g, x * r, y * r, r * 0.13);
      break;
    }
    case 'melon': {
      g.fillStyle = c0; g.fillRect(-r, -r, 2 * r, 2 * r);
      g.strokeStyle = c1; g.lineWidth = r * 0.16; g.lineJoin = 'round';
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        for (let y = -r; y <= r; y += r / 6) g.lineTo(i * r * 0.32 + Math.sin(y * 9 / r + i) * r * 0.06, y);
        g.stroke();
      }
      break;
    }
    case 'beach': {
      const cols = skin.colors;
      for (let i = 0; i < 6; i++) {
        g.fillStyle = cols[i % cols.length];
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2); g.closePath(); g.fill();
      }
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, r * 0.18, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'planet': {
      const gr = g.createLinearGradient(0, -r, 0, r);
      gr.addColorStop(0, '#c7b2ff'); gr.addColorStop(0.5, c0); gr.addColorStop(1, c1);
      g.fillStyle = gr; g.fillRect(-r, -r, 2 * r, 2 * r);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (const y of [-0.5, -0.15, 0.35]) g.fillRect(-r, y * r, 2 * r, r * 0.12);
      g.strokeStyle = skin.seam; g.lineWidth = r * 0.12;
      g.beginPath(); g.ellipse(0, 0, r * 1.05, r * 0.28, -0.35, 0, Math.PI * 2); g.stroke();
      break;
    }
    case 'disco': {
      g.fillStyle = c1; g.fillRect(-r, -r, 2 * r, 2 * r);
      const rr = rng(77);
      const n = 9, s = (2 * r) / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const l = rr();
        g.fillStyle = l > 0.85 ? '#ffffff' : l > 0.6 ? '#f4c8ff' : l > 0.35 ? c0 : '#a9c0f5';
        g.fillRect(-r + i * s + 1, -r + j * s + 1, s - 2, s - 2);
      }
      break;
    }
    case 'rainbow': {
      const cols = skin.colors;
      cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(-r, -r + (i * 2 * r) / cols.length, 2 * r, (2 * r) / cols.length + 1); });
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = lw;
      g.beginPath(); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
      break;
    }
    default: {
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      gr.addColorStop(0, c0); gr.addColorStop(1, c1);
      g.fillStyle = gr; g.fillRect(-r, -r, 2 * r, 2 * r);
      // Pebble dots for texture.
      g.fillStyle = 'rgba(0,0,0,0.08)';
      const rr = rng(5);
      for (let i = 0; i < 90; i++) { g.beginPath(); g.arc(rr.range(-r, r), rr.range(-r, r), r * 0.03, 0, Math.PI * 2); g.fill(); }
    }
  }
  if (skin.pattern === 'classic' || !skin.pattern) {
    g.strokeStyle = skin.seam; g.lineWidth = lw; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
    g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke();
    g.beginPath(); g.arc(-r * 1.25, 0, r * 0.95, -0.9, 0.9); g.stroke();
    g.beginPath(); g.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
  }
  g.restore();
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

// Fixed lighting drawn over the rotating pattern.
function paintBallShade(g, r) {
  const sh = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.02);
  sh.addColorStop(0, 'rgba(255,255,255,0.55)');
  sh.addColorStop(0.25, 'rgba(255,255,255,0.12)');
  sh.addColorStop(0.7, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.38)');
  g.fillStyle = sh;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(40,16,4,0.55)';
  g.lineWidth = r * 0.05;
  g.beginPath(); g.arc(0, 0, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
}

const ballCache = new Map();
export function ballSprites(skin) {
  if (ballCache.has(skin.id)) return ballCache.get(skin.id);
  const r = BALL_PX, size = r * 2 + 4;
  const pattern = makeCanvas(size, size);
  let g = pattern.getContext('2d');
  g.translate(size / 2, size / 2);
  paintBallPattern(g, skin, r);
  const shade = makeCanvas(size, size);
  g = shade.getContext('2d');
  g.translate(size / 2, size / 2);
  paintBallShade(g, r);
  const out = { pattern, shade, size, r };
  ballCache.set(skin.id, out);
  return out;
}

// A small preview (locker, title) with pattern + shade.
export function ballIcon(skin, px = 64) {
  const c = makeCanvas(px, px);
  const g = c.getContext('2d');
  const s = ballSprites(skin);
  g.drawImage(s.pattern, 0, 0, px, px);
  g.drawImage(s.shade, 0, 0, px, px);
  return c;
}

// ------------------------------------------------------------ glows

export function glowSprite(color, size = 128, falloff = 0.5) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, color);
  gr.addColorStop(falloff, color.replace(/[\d.]+\)$/, '0.35)'));
  gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

export function shadowSprite() {
  const c = makeCanvas(128, 64);
  const g = c.getContext('2d');
  g.translate(64, 32);
  g.scale(1, 0.5);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)');
  gr.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.fill();
  return c;
}

// Flame halo for balls on fire.
export function flameSprite() {
  const w = 200, h = 260;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const cx = w / 2, cy = h - 100;
  const layers = [['rgba(255,80,20,0.55)', 1], ['rgba(255,160,40,0.7)', 0.78], ['rgba(255,236,120,0.85)', 0.52]];
  for (const [col, k] of layers) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx - 80 * k, cy);
    g.quadraticCurveTo(cx - 90 * k, cy - 90 * k, cx - 30 * k, cy - 150 * k);
    g.quadraticCurveTo(cx - 20 * k, cy - 90 * k, cx, cy - 160 * k - 20);
    g.quadraticCurveTo(cx + 20 * k, cy - 90 * k, cx + 34 * k, cy - 140 * k);
    g.quadraticCurveTo(cx + 92 * k, cy - 80 * k, cx + 80 * k, cy);
    g.arc(cx, cy, 80 * k, 0, Math.PI);
    g.fill();
  }
  return { canvas: c, cx, cy, r: 80 };
}

// ------------------------------------------------------------ animals

export const ANIMALS = {
  puppy: { fur: '#e9b77a', ear: '#9a5a2a', ears: 'floppy', muzzle: '#fff1dc', nose: '#3a2418' },
  bunny: { fur: '#f6f1f7', ear: '#ffb3cc', ears: 'long', muzzle: '#ffffff', nose: '#ff7fa8', teeth: true },
  squirrel: { fur: '#cf7a3a', ear: '#f2c39a', ears: 'tuft', muzzle: '#f6dcb6', nose: '#5a2e14', cheeks: '#f6dcb6' },
  raccoon: { fur: '#9ba2ae', ear: '#3a3f4a', ears: 'pointy', muzzle: '#f2f2f2', nose: '#202020', mask: '#3a3f4a' },
  crab: { fur: '#ff5a4f', ears: 'none', muzzle: null, nose: null, crab: true },
  seal: { fur: '#8399b0', ears: 'none', muzzle: '#c9d6e3', nose: '#262a30', whiskers: true },
  flamingo: { fur: '#ff8fc6', ears: 'none', muzzle: null, nose: null, beak: '#2a2a2a', beakBase: '#ffe2ee' },
  pigeon: { fur: '#a2abc0', ears: 'none', muzzle: null, nose: null, beak: '#e8b07a', beakBase: '#f2d6c8', neck: '#6fd1a8' },
  cat: { fur: '#ffbf5a', ear: '#ff9db0', ears: 'pointy', muzzle: '#fff4e0', nose: '#ff7f9b', whiskers: true, stripes: '#e8892a' },
  fox: { fur: '#ff7a2f', ear: '#2a1a12', ears: 'big', muzzle: '#fff6ec', nose: '#1a1a1a', cheeksWhite: true },
  monkey: { fur: '#a8693a', ear: '#f2c9a0', ears: 'round', muzzle: '#f2c9a0', nose: '#5a3018', face: '#f2c9a0' },
  panda: { fur: '#ffffff', ear: '#1e1e24', ears: 'round', muzzle: '#ffffff', nose: '#1e1e24', patches: '#1e1e24', helmet: true },
  lion: { fur: '#f5b942', ear: '#e2953a', ears: 'round', muzzle: '#fff0c8', nose: '#5a2e14', mane: '#c8641e', crown: true },
};

function eye(g, x, y, r, look = 0) {
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(x, y, r, r * 1.12, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1b1530';
  g.beginPath(); g.arc(x + look * r * 0.25, y + r * 0.12, r * 0.62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(x + look * r * 0.25 - r * 0.22, y - r * 0.15, r * 0.22, 0, Math.PI * 2); g.fill();
}

// Front-facing portrait: head and shoulders in a jersey. Drawn into a
// square of side s (the head fills the upper ~70%).
export function paintAnimal(g, id, s, jersey = '#ffcf3a', number = '') {
  const a = ANIMALS[id] || ANIMALS.puppy;
  const cx = s / 2, hy = s * 0.44, hr = s * 0.27;
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Shoulders + jersey.
  g.fillStyle = a.fur;
  g.beginPath(); g.ellipse(cx, s * 1.02, s * 0.44, s * 0.32, 0, Math.PI, 0); g.fill();
  g.fillStyle = jersey;
  g.beginPath();
  g.moveTo(cx - s * 0.3, s);
  g.lineTo(cx - s * 0.27, s * 0.78);
  g.quadraticCurveTo(cx, s * 0.9, cx + s * 0.27, s * 0.78);
  g.lineTo(cx + s * 0.3, s);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = s * 0.025;
  g.beginPath(); g.moveTo(cx - s * 0.27, s * 0.78); g.quadraticCurveTo(cx, s * 0.9, cx + s * 0.27, s * 0.78); g.stroke();
  if (number) {
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.font = `900 ${Math.round(s * 0.11)}px ui-rounded, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(number, cx, s * 0.94);
  }
  if (a.neck) { g.fillStyle = a.neck; g.beginPath(); g.ellipse(cx, s * 0.74, s * 0.16, s * 0.08, 0, 0, Math.PI * 2); g.fill(); }

  // Mane behind the head.
  if (a.mane) {
    g.fillStyle = a.mane;
    g.beginPath();
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2, rr = hr * (i % 2 ? 1.32 : 1.5);
      g.lineTo(cx + Math.cos(ang) * rr, hy + Math.sin(ang) * rr);
    }
    g.closePath(); g.fill();
  }
  // Ears.
  const ears = a.ears;
  g.fillStyle = a.fur;
  if (ears === 'long') {
    for (const sx of [-1, 1]) {
      g.fillStyle = a.fur;
      g.beginPath(); g.ellipse(cx + sx * hr * 0.45, hy - hr * 1.25, hr * 0.26, hr * 0.75, sx * 0.15, 0, Math.PI * 2); g.fill();
      g.fillStyle = a.ear;
      g.beginPath(); g.ellipse(cx + sx * hr * 0.45, hy - hr * 1.2, hr * 0.13, hr * 0.55, sx * 0.15, 0, Math.PI * 2); g.fill();
    }
  } else if (ears === 'pointy' || ears === 'big' || ears === 'tuft') {
    const k = ears === 'big' ? 1.25 : ears === 'tuft' ? 0.85 : 1;
    for (const sx of [-1, 1]) {
      g.fillStyle = a.fur;
      g.beginPath();
      g.moveTo(cx + sx * hr * 0.25, hy - hr * 0.75);
      g.lineTo(cx + sx * hr * 0.85, hy - hr * (1.35 * k));
      g.lineTo(cx + sx * hr * 0.98, hy - hr * 0.35);
      g.closePath(); g.fill();
      g.fillStyle = a.ear;
      g.beginPath();
      g.moveTo(cx + sx * hr * 0.42, hy - hr * 0.72);
      g.lineTo(cx + sx * hr * 0.82, hy - hr * (1.15 * k));
      g.lineTo(cx + sx * hr * 0.88, hy - hr * 0.5);
      g.closePath(); g.fill();
      if (ears === 'tuft') {
        g.fillStyle = a.fur;
        g.beginPath(); g.arc(cx + sx * hr * 0.85, hy - hr * 1.2, hr * 0.12, 0, Math.PI * 2); g.fill();
      }
    }
  } else if (ears === 'round') {
    for (const sx of [-1, 1]) {
      g.fillStyle = id === 'panda' ? a.ear : a.fur;
      g.beginPath(); g.arc(cx + sx * hr * 0.82, hy - hr * 0.72, hr * 0.36, 0, Math.PI * 2); g.fill();
      if (id !== 'panda') { g.fillStyle = a.ear; g.beginPath(); g.arc(cx + sx * hr * 0.82, hy - hr * 0.72, hr * 0.2, 0, Math.PI * 2); g.fill(); }
    }
  }
  // Crab claws and eye stalks.
  if (a.crab) {
    for (const sx of [-1, 1]) {
      g.strokeStyle = a.fur; g.lineWidth = hr * 0.22;
      g.beginPath(); g.moveTo(cx + sx * hr * 0.9, hy + hr * 0.2); g.quadraticCurveTo(cx + sx * hr * 1.5, hy - hr * 0.1, cx + sx * hr * 1.45, hy - hr * 0.75); g.stroke();
      g.fillStyle = a.fur;
      g.beginPath(); g.arc(cx + sx * hr * 1.45, hy - hr * 0.95, hr * 0.38, sx > 0 ? -2.6 : -0.55, sx > 0 ? 1.0 : 3.7); g.fill();
      g.strokeStyle = '#e0443a'; g.lineWidth = hr * 0.1;
      g.beginPath(); g.moveTo(cx + sx * hr * 0.3, hy - hr * 0.6); g.lineTo(cx + sx * hr * 0.4, hy - hr * 1.1); g.stroke();
    }
  }
  // Head.
  g.fillStyle = a.fur;
  g.beginPath();
  if (a.crab) g.ellipse(cx, hy + hr * 0.15, hr * 1.1, hr * 0.78, 0, 0, Math.PI * 2);
  else if (id === 'flamingo' || id === 'pigeon') g.ellipse(cx, hy, hr * 0.82, hr * 0.92, 0, 0, Math.PI * 2);
  else g.ellipse(cx, hy, hr, hr * 0.95, 0, 0, Math.PI * 2);
  g.fill();
  // Fur shading.
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath(); g.ellipse(cx - hr * 0.3, hy - hr * 0.45, hr * 0.45, hr * 0.28, -0.4, 0, Math.PI * 2); g.fill();

  if (a.stripes) {
    g.strokeStyle = a.stripes; g.lineWidth = hr * 0.1;
    for (const dx of [-0.25, 0, 0.25]) { g.beginPath(); g.moveTo(cx + dx * hr, hy - hr * 0.92); g.lineTo(cx + dx * hr * 0.8, hy - hr * 0.6); g.stroke(); }
  }
  if (a.face) { g.fillStyle = a.face; g.beginPath(); g.ellipse(cx - hr * 0.3, hy + hr * 0.05, hr * 0.42, hr * 0.5, 0, 0, Math.PI * 2); g.ellipse(cx + hr * 0.3, hy + hr * 0.05, hr * 0.42, hr * 0.5, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(cx, hy + hr * 0.4, hr * 0.55, hr * 0.42, 0, 0, Math.PI * 2); g.fill(); }
  if (a.mask) { g.fillStyle = a.mask; g.beginPath(); g.ellipse(cx, hy - hr * 0.1, hr * 0.92, hr * 0.32, 0, 0, Math.PI * 2); g.fill(); }
  if (a.patches) { g.fillStyle = a.patches; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * hr * 0.38, hy - hr * 0.08, hr * 0.27, hr * 0.34, sx * -0.5, 0, Math.PI * 2); g.fill(); } }
  if (a.cheeksWhite) { g.fillStyle = a.muzzle; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * hr * 0.5, hy + hr * 0.42, hr * 0.48, hr * 0.38, 0, 0, Math.PI * 2); g.fill(); } }
  // Muzzle.
  if (a.muzzle) { g.fillStyle = a.muzzle; g.beginPath(); g.ellipse(cx, hy + hr * 0.42, hr * 0.48, hr * 0.36, 0, 0, Math.PI * 2); g.fill(); }
  // Eyes.
  const ey = a.crab ? hy - hr * 1.12 : hy - hr * 0.1, ex = a.crab ? hr * 0.42 : hr * 0.38;
  const er = hr * (a.crab ? 0.22 : 0.2);
  eye(g, cx - ex, ey, er, 0.3);
  eye(g, cx + ex, ey, er, 0.3);
  // Nose, beak, mouth.
  if (a.beak) {
    g.fillStyle = a.beakBase;
    g.beginPath(); g.moveTo(cx - hr * 0.25, hy + hr * 0.18); g.quadraticCurveTo(cx, hy + hr * 0.05, cx + hr * 0.25, hy + hr * 0.18); g.lineTo(cx, hy + hr * (id === 'flamingo' ? 0.75 : 0.55)); g.closePath(); g.fill();
    g.fillStyle = a.beak;
    g.beginPath(); g.moveTo(cx - hr * 0.1, hy + hr * (id === 'flamingo' ? 0.5 : 0.4)); g.lineTo(cx + hr * 0.1, hy + hr * (id === 'flamingo' ? 0.5 : 0.4)); g.lineTo(cx, hy + hr * (id === 'flamingo' ? 0.78 : 0.56)); g.closePath(); g.fill();
  } else if (a.crab) {
    g.strokeStyle = '#7a1a14'; g.lineWidth = hr * 0.08;
    g.beginPath(); g.arc(cx, hy + hr * 0.15, hr * 0.32, 0.2, Math.PI - 0.2); g.stroke();
  } else {
    g.fillStyle = a.nose;
    g.beginPath(); g.ellipse(cx, hy + hr * 0.28, hr * 0.15, hr * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,20,20,0.75)'; g.lineWidth = hr * 0.06;
    g.beginPath(); g.moveTo(cx, hy + hr * 0.36); g.lineTo(cx, hy + hr * 0.46); g.stroke();
    g.beginPath(); g.arc(cx - hr * 0.12, hy + hr * 0.46, hr * 0.12, 0.1, Math.PI - 0.4); g.stroke();
    g.beginPath(); g.arc(cx + hr * 0.12, hy + hr * 0.46, hr * 0.12, 0.4, Math.PI - 0.1); g.stroke();
    if (a.teeth) { g.fillStyle = '#ffffff'; g.fillRect(cx - hr * 0.08, hy + hr * 0.5, hr * 0.16, hr * 0.13); g.strokeRect(cx - hr * 0.08, hy + hr * 0.5, hr * 0.16, hr * 0.13); }
  }
  if (a.whiskers) {
    g.strokeStyle = 'rgba(30,30,40,0.55)'; g.lineWidth = hr * 0.03;
    for (const sx of [-1, 1]) for (const dy of [-0.05, 0.08]) { g.beginPath(); g.moveTo(cx + sx * hr * 0.3, hy + hr * (0.38 + dy)); g.lineTo(cx + sx * hr * 0.9, hy + hr * (0.32 + dy * 2)); g.stroke(); }
  }
  // Blush.
  g.fillStyle = 'rgba(255,110,140,0.35)';
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * hr * 0.62, hy + hr * 0.25, hr * 0.15, hr * 0.09, 0, 0, Math.PI * 2); g.fill(); }
  if (ears === 'floppy') {
    for (const sx of [-1, 1]) {
      g.fillStyle = a.ear;
      g.beginPath(); g.ellipse(cx + sx * hr * 0.95, hy - hr * 0.05, hr * 0.28, hr * 0.62, sx * -0.35, 0, Math.PI * 2); g.fill();
    }
  }
  if (a.helmet) {
    g.strokeStyle = 'rgba(200,240,255,0.9)'; g.lineWidth = hr * 0.08;
    g.fillStyle = 'rgba(160,220,255,0.16)';
    g.beginPath(); g.arc(cx, hy + hr * 0.05, hr * 1.38, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.ellipse(cx - hr * 0.7, hy - hr * 0.7, hr * 0.22, hr * 0.12, -0.7, 0, Math.PI * 2); g.fill();
  }
  if (a.crown) {
    g.fillStyle = '#ffd23f'; g.strokeStyle = '#c27a00'; g.lineWidth = hr * 0.05;
    g.beginPath();
    const by = hy - hr * 0.86, w = hr * 0.62;
    g.moveTo(cx - w, by); g.lineTo(cx - w, by - hr * 0.3); g.lineTo(cx - w * 0.5, by - hr * 0.12); g.lineTo(cx, by - hr * 0.42); g.lineTo(cx + w * 0.5, by - hr * 0.12); g.lineTo(cx + w, by - hr * 0.3); g.lineTo(cx + w, by); g.closePath();
    g.fill(); g.stroke();
  }
  g.restore();
}

const portraitCache = new Map();
export function portrait(id, jersey, number = '', size = 192) {
  const key = `${id}|${jersey}|${number}|${size}`;
  if (portraitCache.has(key)) return portraitCache.get(key);
  const c = makeCanvas(size, size);
  paintAnimal(c.getContext('2d'), id, size, jersey, number);
  portraitCache.set(key, c);
  return c;
}

// ------------------------------------------------------------ Ace from behind

// Head, ears and jersey seen from behind. The ball-hold point is (W/2, HOLD_Y)
// and the ball radius in sprite units is HERO_BALL_R; arms are drawn live.
export const HERO = { W: 300, H: 390, HOLD_Y: 62, BALL_R: 40, SHOULDER_Y: 214, SHOULDER_X: 64 };

export function heroSprite(jersey) {
  const { W, H } = HERO;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const a = ANIMALS.puppy;
  const cx = W / 2;
  g.lineJoin = 'round';
  // Body/shoulders.
  g.fillStyle = a.fur;
  g.beginPath(); g.ellipse(cx, 262, 96, 66, 0, Math.PI, 0); g.lineTo(cx + 104, H); g.lineTo(cx - 104, H); g.closePath(); g.fill();
  // Jersey (tank top) with arm holes.
  g.fillStyle = jersey.body;
  g.beginPath();
  g.moveTo(cx - 46, 204);
  g.quadraticCurveTo(cx, 226, cx + 46, 204);
  g.quadraticCurveTo(cx + 62, 252, cx + 92, 256);
  g.lineTo(cx + 100, H); g.lineTo(cx - 100, H);
  g.lineTo(cx - 92, 256);
  g.quadraticCurveTo(cx - 62, 252, cx - 46, 204);
  g.closePath(); g.fill();
  g.save(); g.clip();
  if (jersey.stripes) {
    g.fillStyle = jersey.trim;
    for (let x = -130; x < 150; x += 34) { g.beginPath(); g.moveTo(cx + x, 200); g.lineTo(cx + x + 13, 200); g.lineTo(cx + x - 25, H); g.lineTo(cx + x - 38, H); g.closePath(); g.fill(); }
  }
  if (jersey.stars) {
    g.fillStyle = 'rgba(255,255,255,0.75)';
    const rr = rng(9);
    for (let i = 0; i < 14; i++) star(g, cx + rr.range(-90, 90), rr.range(240, 380), rr.range(3, 6));
  }
  // Soft shading down the back.
  const sh = g.createLinearGradient(cx - 100, 0, cx + 100, 0);
  sh.addColorStop(0, 'rgba(0,0,0,0.16)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.08)'); sh.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = sh; g.fillRect(0, 190, W, H);
  g.restore();
  g.strokeStyle = jersey.trim; g.lineWidth = 8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 46, 204); g.quadraticCurveTo(cx, 226, cx + 46, 204); g.stroke();
  g.beginPath(); g.moveTo(cx - 46, 206); g.quadraticCurveTo(cx - 62, 252, cx - 92, 258); g.stroke();
  g.beginPath(); g.moveTo(cx + 46, 206); g.quadraticCurveTo(cx + 62, 252, cx + 92, 258); g.stroke();
  // Name and number on the back.
  g.fillStyle = jersey.number;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 24px ui-rounded, system-ui, sans-serif';
  g.fillText('ACE', cx, 252);
  g.font = '900 70px ui-rounded, system-ui, sans-serif';
  g.lineWidth = 7; g.strokeStyle = jersey.trim;
  g.strokeText('7', cx, 310);
  g.fillText('7', cx, 310);
  // Head from behind.
  g.fillStyle = a.fur;
  g.beginPath(); g.ellipse(cx, 152, 54, 52, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath(); g.ellipse(cx - 18, 126, 24, 15, -0.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(120,70,30,0.16)';
  g.beginPath(); g.ellipse(cx, 192, 38, 12, 0, 0, Math.PI * 2); g.fill();
  // Floppy ears hanging down the sides.
  g.fillStyle = a.ear;
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * 54, 160, 17, 38, sx * -0.3, 0, Math.PI * 2); g.fill(); }
  // Headband round the back of the head.
  g.save();
  g.beginPath(); g.ellipse(cx, 152, 54, 52, 0, 0, Math.PI * 2); g.clip();
  g.fillStyle = jersey.trim;
  g.beginPath(); g.moveTo(cx - 60, 124); g.quadraticCurveTo(cx, 138, cx + 60, 124); g.lineTo(cx + 60, 138); g.quadraticCurveTo(cx, 152, cx - 60, 138); g.closePath(); g.fill();
  g.restore();
  return c;
}

// ------------------------------------------------------------ props

// Inflatable defender (front view). Unit: the box is w × h metres; the
// sprite is drawn into 200 × 300 so it can be stretched.
export function blockerSprite(look = 'bear') {
  const W = 200, H = 300;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const panda = look === 'panda';
  const fur = panda ? '#f4f6fb' : '#b0703a', dark = panda ? '#25252e' : '#7a4520', belly = panda ? '#ffffff' : '#f2c58e';
  const cx = W / 2;
  g.lineJoin = 'round'; g.lineCap = 'round';
  // Arms up.
  g.strokeStyle = panda ? dark : fur; g.lineWidth = 34;
  g.beginPath(); g.moveTo(cx - 52, 140); g.quadraticCurveTo(cx - 90, 80, cx - 78, 24); g.stroke();
  g.beginPath(); g.moveTo(cx + 52, 140); g.quadraticCurveTo(cx + 90, 80, cx + 78, 24); g.stroke();
  g.fillStyle = panda ? dark : fur;
  g.beginPath(); g.arc(cx - 78, 22, 22, 0, Math.PI * 2); g.arc(cx + 78, 22, 22, 0, Math.PI * 2); g.fill();
  // Body.
  g.fillStyle = fur;
  g.beginPath(); g.ellipse(cx, 210, 72, 92, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = belly;
  g.beginPath(); g.ellipse(cx, 222, 46, 62, 0, 0, Math.PI * 2); g.fill();
  // Legs / base.
  g.fillStyle = panda ? dark : fur;
  g.beginPath(); g.ellipse(cx - 40, 290, 30, 14, 0, 0, Math.PI * 2); g.ellipse(cx + 40, 290, 30, 14, 0, 0, Math.PI * 2); g.fill();
  // Head.
  g.fillStyle = panda ? dark : fur;
  g.beginPath(); g.arc(cx - 40, 76, 18, 0, Math.PI * 2); g.arc(cx + 40, 76, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = fur;
  g.beginPath(); g.ellipse(cx, 108, 52, 46, 0, 0, Math.PI * 2); g.fill();
  if (panda) { g.fillStyle = dark; g.beginPath(); g.ellipse(cx - 20, 102, 13, 16, 0.5, 0, Math.PI * 2); g.ellipse(cx + 20, 102, 13, 16, -0.5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = belly;
  g.beginPath(); g.ellipse(cx, 124, 24, 17, 0, 0, Math.PI * 2); g.fill();
  eye(g, cx - 19, 100, 8, 0);
  eye(g, cx + 19, 100, 8, 0);
  g.fillStyle = dark;
  g.beginPath(); g.ellipse(cx, 117, 8, 6, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = dark; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, 124, 9, 0.3, Math.PI - 0.3); g.stroke();
  // Shine (inflatable).
  g.fillStyle = 'rgba(255,255,255,0.32)';
  g.beginPath(); g.ellipse(cx - 30, 180, 12, 34, 0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx - 22, 90, 10, 6, -0.5, 0, Math.PI * 2); g.fill();
  // "No!" hands sign.
  return { canvas: c, W, H };
}

// ------------------------------------------------------------ scenery

// A tileable strip that sits on the horizon. Height 420; the horizon line is
// at y = SCENE_HORIZON.
export const SCENE_W = 1800, SCENE_H = 460, SCENE_HORIZON = 400;

const sceneCache = new Map();
export function scenery(court) {
  if (sceneCache.has(court.id)) return sceneCache.get(court.id);
  const c = makeCanvas(SCENE_W, SCENE_H);
  sceneCache.set(court.id, c);
  const g = c.getContext('2d');
  const r = rng(court.id.length * 101 + 7);
  const H0 = SCENE_HORIZON;
  const W = SCENE_W;
  // Draw a shape at x and again at x±W so the strip tiles.
  const tile = (fn) => { for (const off of [-W, 0, W]) { g.save(); g.translate(off, 0); fn(); g.restore(); } };
  switch (court.scenery) {
    case 'park': {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 7; i++) { const x = r.range(0, W), y = r.range(50, 170), s = r.range(30, 60); tile(() => cloud(g, x, y, s)); }
      g.fillStyle = '#8fd37a';
      tile(() => { g.beginPath(); g.moveTo(0, H0); for (let x = 0; x <= W; x += 30) g.lineTo(x, H0 - 70 - Math.sin(x / 260) * 30 - Math.sin(x / 90) * 8); g.lineTo(W, H0); g.closePath(); g.fill(); });
      for (let i = 0; i < 16; i++) {
        const x = (i / 16) * W + r.range(-30, 30), s = r.range(50, 85), shade = r() < 0.5 ? '#3f9a43' : '#2f8a3c';
        tile(() => {
          g.fillStyle = '#7a4a2a'; g.fillRect(x - s * 0.1, H0 - s * 1.3, s * 0.2, s * 1.3);
          g.fillStyle = shade;
          for (const [dx, dy, rr] of [[0, -1.7, 0.75], [-0.5, -1.35, 0.55], [0.5, -1.35, 0.55], [0, -1.15, 0.6]]) { g.beginPath(); g.arc(x + dx * s, H0 + dy * s, rr * s, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(x - s * 0.25, H0 - s * 1.95, s * 0.3, 0, Math.PI * 2); g.fill();
        });
      }
      break;
    }
    case 'beach': {
      g.fillStyle = 'rgba(255,240,210,0.9)';
      g.beginPath(); g.arc(W * 0.3, H0 - 60, 120, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 5; i++) { const x = r.range(0, W), y = r.range(40, 160), s = r.range(25, 50); tile(() => cloud(g, x, y, s)); }
      const sea = g.createLinearGradient(0, H0 - 80, 0, H0);
      sea.addColorStop(0, '#3fb6d8'); sea.addColorStop(1, '#2a8fbf');
      g.fillStyle = sea; g.fillRect(0, H0 - 80, W, 80);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 40; i++) g.fillRect(r.range(0, W), r.range(H0 - 75, H0 - 5), r.range(20, 60), 3);
      for (let i = 0; i < 9; i++) {
        const x = (i / 9) * W + r.range(-40, 40), h = r.range(150, 230), lean = r.range(-30, 30);
        tile(() => palm(g, x, H0, h, lean));
      }
      // Umbrellas.
      for (let i = 0; i < 5; i++) { const x = r.range(0, W), col = r.pick(['#ff6f91', '#ffd23f', '#3fb6ff']); tile(() => umbrella(g, x, H0, col)); }
      break;
    }
    case 'roof': {
      g.fillStyle = '#fff6d6'; g.beginPath(); g.arc(W * 0.7, 90, 46, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 70; i++) g.fillRect(r.range(0, W), r.range(0, 220), 2, 2);
      for (let layer = 0; layer < 2; layer++) {
        let x = 0;
        while (x < W) {
          const w = r.range(60, 140), h = layer ? r.range(120, 300) : r.range(80, 200);
          g.fillStyle = layer ? '#24164a' : '#3a2770';
          g.fillRect(x, H0 - h, w - 6, h);
          if (layer) {
            for (let wy = H0 - h + 14; wy < H0 - 10; wy += 18) for (let wx = x + 8; wx < x + w - 18; wx += 16) {
              if (r() < 0.45) { g.fillStyle = r() < 0.8 ? '#ffd86b' : '#7cf0ff'; g.fillRect(wx, wy, 8, 10); }
            }
            if (r() < 0.25) { g.fillStyle = r.pick(['#ff4fa3', '#4ff3ff', '#ffe14d']); g.fillRect(x + 10, H0 - h - 24, w - 26, 14); }
          }
          x += w;
        }
      }
      break;
    }
    case 'space': {
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 160; i++) { const s = r() < 0.1 ? 3 : 2; g.globalAlpha = r.range(0.4, 1); g.fillRect(r.range(0, W), r.range(0, H0 - 30), s, s); }
      g.globalAlpha = 1;
      // A big ringed planet and a little blue one.
      tile(() => {
        const px = W * 0.62, py = 170;
        const pg = g.createRadialGradient(px - 40, py - 40, 10, px, py, 120);
        pg.addColorStop(0, '#ffc9a8'); pg.addColorStop(1, '#c2577a');
        g.fillStyle = pg; g.beginPath(); g.arc(px, py, 110, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,220,170,0.8)'; g.lineWidth = 12;
        g.beginPath(); g.ellipse(px, py, 190, 40, -0.25, 0, Math.PI * 2); g.stroke();
        const eg = g.createRadialGradient(W * 0.18 - 10, 120, 4, W * 0.18, 130, 46);
        eg.addColorStop(0, '#9be6ff'); eg.addColorStop(1, '#2a6fd6');
        g.fillStyle = eg; g.beginPath(); g.arc(W * 0.18, 130, 42, 0, Math.PI * 2); g.fill();
      });
      // A moon-like surface far below the station.
      g.fillStyle = '#3a3360';
      g.beginPath(); g.moveTo(0, H0);
      for (let x = 0; x <= W; x += 40) g.lineTo(x, H0 - 30 - Math.sin(x / 140) * 14 - Math.sin(x / 37) * 5);
      g.lineTo(W, H0); g.closePath(); g.fill();
      break;
    }
    case 'neon': {
      tile(() => {
        const sx = W * 0.5, sy = H0 - 60;
        const sg = g.createLinearGradient(0, sy - 150, 0, sy + 30);
        sg.addColorStop(0, '#ffe14d'); sg.addColorStop(1, '#ff3fd0');
        g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, 150, Math.PI, 0); g.fill();
        g.fillStyle = '#0c0830';
        for (let i = 0; i < 6; i++) g.fillRect(sx - 160, sy - 12 - i * 22, 320, 4 + i);
      });
      g.strokeStyle = '#ff3fd0'; g.lineWidth = 3;
      g.fillStyle = '#140f3a';
      g.beginPath(); g.moveTo(0, H0);
      for (let x = 0; x <= W; x += 90) g.lineTo(x, H0 - 40 - (Math.sin(x * 0.013) + 1) * 60 * r.range(0.6, 1));
      g.lineTo(W, H0); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(79,243,255,0.6)'; g.lineWidth = 2;
      for (let x = 0; x < W; x += 60) { g.beginPath(); g.moveTo(x, H0 - 30); g.lineTo(x, H0); g.stroke(); }
      g.beginPath(); g.moveTo(0, H0 - 30); g.lineTo(W, H0 - 30); g.stroke();
      break;
    }
    case 'candy': {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 7; i++) { const x = r.range(0, W), y = r.range(40, 170), s = r.range(30, 55); tile(() => cloud(g, x, y, s)); }
      for (let i = 0; i < 12; i++) {
        const x = (i / 12) * W + r.range(-30, 30), s = r.range(70, 130), col = r.pick(['#ff8fc6', '#9be6c8', '#ffd36b', '#b59bff']);
        tile(() => { g.fillStyle = col; g.beginPath(); g.ellipse(x, H0, s, s * 0.9, 0, Math.PI, 0); g.fill(); g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.ellipse(x - s * 0.3, H0 - s * 0.6, s * 0.2, s * 0.12, -0.5, 0, Math.PI * 2); g.fill(); });
      }
      for (let i = 0; i < 8; i++) {
        const x = r.range(0, W), h = r.range(110, 180), col = r.pick(['#ff4f8b', '#8a6cff', '#ffb03a']);
        tile(() => {
          g.fillStyle = '#ffffff'; g.fillRect(x - 4, H0 - h, 8, h);
          g.fillStyle = col; g.beginPath(); g.arc(x, H0 - h, 34, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.arc(x, H0 - h, 20, 0, Math.PI * 1.5); g.stroke();
        });
      }
      break;
    }
  }
  return c;
}

function cloud(g, x, y, s) {
  g.beginPath();
  g.arc(x, y, s * 0.6, 0, Math.PI * 2);
  g.arc(x + s * 0.6, y + s * 0.1, s * 0.5, 0, Math.PI * 2);
  g.arc(x - s * 0.6, y + s * 0.15, s * 0.45, 0, Math.PI * 2);
  g.arc(x + s * 0.15, y - s * 0.3, s * 0.45, 0, Math.PI * 2);
  g.fill();
}

function palm(g, x, base, h, lean) {
  g.strokeStyle = '#8a5a32'; g.lineWidth = 12; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + lean * 0.3, base - h * 0.5, x + lean, base - h); g.stroke();
  g.fillStyle = '#2f9a5a';
  const tx = x + lean, ty = base - h;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55;
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + Math.cos(a) * 70, ty + Math.sin(a) * 50 - 20, tx + Math.cos(a) * 95, ty + Math.sin(a) * 30 + 35);
    g.quadraticCurveTo(tx + Math.cos(a) * 60, ty + Math.sin(a) * 30 + 5, tx, ty);
    g.fill();
  }
  g.fillStyle = '#7a4a22';
  g.beginPath(); g.arc(tx - 6, ty + 8, 7, 0, Math.PI * 2); g.arc(tx + 7, ty + 9, 7, 0, Math.PI * 2); g.fill();
}

function umbrella(g, x, base, col) {
  g.strokeStyle = '#ffffff'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - 70); g.stroke();
  g.fillStyle = col;
  g.beginPath(); g.moveTo(x - 50, base - 60); g.quadraticCurveTo(x, base - 110, x + 50, base - 60); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath(); g.moveTo(x - 10, base - 60); g.quadraticCurveTo(x, base - 105, x + 10, base - 60); g.closePath(); g.fill();
}
