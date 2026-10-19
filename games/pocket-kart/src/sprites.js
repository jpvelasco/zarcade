// Baked sprites: everything that is drawn many times per frame is painted
// once into an offscreen canvas at the current pixel scale, so the frame
// loop only calls drawImage. Glows are pre-rendered radial gradients drawn
// with additive blending (no shadowBlur anywhere).
//
// Sprites face +x (east). `s` is pixels per world unit.
import { mulberry32 } from './math.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// A baked sprite: canvas plus the world-unit size it covers, centred.
function sprite(wUnits, hUnits, s, draw) {
  const c = makeCanvas(wUnits * s, hUnits * s);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.scale(s, s);
  draw(g);
  return { canvas: c, w: wUnits, h: hUnits };
}

export function rr(g, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
}

function ellipse(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; gg += (255 - gg) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; gg *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

const INK = '#2a1d3a';

// ------------------------------------------------------------ glows

export function bakeGlow(color, radius, s, strength = 1) {
  return sprite(radius * 2, radius * 2, s, (g) => {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(0.25, withAlpha(color, 0.55 * strength));
    grad.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = grad;
    circle(g, 0, 0, radius);
    g.fill();
  });
}

function withAlpha(color, a) {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return color.replace(/rgb\(([^)]+)\)/, `rgba($1,${a})`);
}

export function bakeShadow(s) {
  return sprite(36, 26, s, (g) => {
    const grad = g.createRadialGradient(0, 0, 2, 0, 0, 16);
    grad.addColorStop(0, 'rgba(20,10,40,0.42)');
    grad.addColorStop(1, 'rgba(20,10,40,0)');
    g.fillStyle = grad;
    g.scale(1.25, 0.85);
    circle(g, 0, 0, 16);
    g.fill();
  });
}

// ------------------------------------------------------------ karts

// A kart body shape for each kart id, in a 26 × 18 footprint facing +x.
function kartBody(g, kartId, color, ghost) {
  const dark = ghost ? 'rgba(160,220,255,0.9)' : shade(color, -0.35);
  const light = ghost ? 'rgba(235,250,255,0.95)' : shade(color, 0.35);
  const base = ghost ? 'rgba(190,235,255,0.92)' : color;
  const wheel = ghost ? 'rgba(120,170,220,0.9)' : '#2b2438';
  // Wheels first, peeking out from the body.
  g.fillStyle = wheel;
  const wy = kartId === 'chonk' ? 9 : 8.2;
  for (const [x, y] of [[-8, -wy], [-8, wy], [7, -wy + 0.6], [7, wy - 0.6]]) {
    rr(g, x - 3.6, y - 2.3, 7.2, 4.6, 1.6);
    g.fill();
  }
  g.lineWidth = 1.1;
  g.strokeStyle = ghost ? 'rgba(90,150,210,0.8)' : INK;
  g.fillStyle = base;
  switch (kartId) {
    case 'bumble':
      ellipse(g, 0, 0, 12.5, 8.4);
      break;
    case 'zoomer':
      g.beginPath();
      g.moveTo(15, 0);
      g.quadraticCurveTo(12, -6.5, 2, -7.2);
      g.lineTo(-11, -7.5);
      g.quadraticCurveTo(-13, 0, -11, 7.5);
      g.lineTo(2, 7.2);
      g.quadraticCurveTo(12, 6.5, 15, 0);
      g.closePath();
      break;
    case 'chonk':
      rr(g, -12.5, -9, 25, 18, 5);
      break;
    case 'swish':
      g.beginPath();
      g.moveTo(14, 0);
      g.bezierCurveTo(10, -8, -6, -9, -12, -5);
      g.lineTo(-10, 0);
      g.lineTo(-12, 5);
      g.bezierCurveTo(-6, 9, 10, 8, 14, 0);
      g.closePath();
      break;
    case 'comet':
      g.beginPath();
      g.moveTo(14, 0);
      g.quadraticCurveTo(9, -8, -4, -7.5);
      g.lineTo(-13, -9);
      g.lineTo(-10, 0);
      g.lineTo(-13, 9);
      g.lineTo(-4, 7.5);
      g.quadraticCurveTo(9, 8, 14, 0);
      g.closePath();
      break;
    default:
      rr(g, -12, -7.8, 24.5, 15.6, 6);
  }
  g.fill();
  g.stroke();
  // Highlight stripe and a darker rear.
  g.save();
  g.clip();
  g.fillStyle = dark;
  g.fillRect(-16, -12, 6, 24);
  g.fillStyle = light;
  if (kartId === 'bumble') {
    g.fillStyle = ghost ? light : 'rgba(43,36,56,0.55)';
    g.fillRect(-4, -12, 2.6, 24);
    g.fillRect(2, -12, 2.6, 24);
  } else {
    g.globalAlpha = 0.85;
    g.fillRect(-14, -2, 30, 1.6);
    g.fillRect(-14, 0.8, 30, 1.6);
    g.globalAlpha = 1;
  }
  g.restore();
  // Front bumper and a spoiler for the speedy ones.
  g.fillStyle = light;
  rr(g, 10.5, -4.5, 3, 9, 1.4);
  g.fill();
  if (kartId === 'zoomer' || kartId === 'comet' || kartId === 'swish') {
    g.fillStyle = dark;
    rr(g, -15, -8.5, 3.4, 17, 1.4);
    g.fill();
    g.stroke();
  }
  if (kartId === 'chonk') {
    g.fillStyle = dark;
    rr(g, 11, -8, 3.5, 16, 1.6);
    g.fill();
    rr(g, -15, -8, 3.5, 16, 1.6);
    g.fill();
  }
}

// The critter driving, seen from just above and behind: head with its
// animal's ears and a face toward +x.
function critter(g, racer, ghost) {
  const a = racer.animal;
  const fur = ghost ? 'rgba(220,245,255,0.95)' : racer.fur;
  const line = ghost ? 'rgba(90,150,210,0.85)' : INK;
  const cx = -1.5, cy = 0, r = 6.2;
  g.lineWidth = 1;
  g.strokeStyle = line;
  // Scarf trailing behind.
  if (!ghost) {
    g.fillStyle = racer.light;
    g.beginPath();
    g.moveTo(cx - 3, -2.2);
    g.quadraticCurveTo(cx - 10, -4, cx - 13, -1.5);
    g.quadraticCurveTo(cx - 10, 0.5, cx - 3, 2.2);
    g.closePath();
    g.fill();
  }
  // Ears / tufts behind the head.
  g.fillStyle = fur;
  const ear = (x, y, rx, ry, rot) => { ellipse(g, x, y, rx, ry, rot); g.fill(); g.stroke(); };
  const tri = (pts) => { g.beginPath(); g.moveTo(...pts[0]); g.lineTo(...pts[1]); g.lineTo(...pts[2]); g.closePath(); g.fill(); g.stroke(); };
  if (a === 'bunny') { ear(cx - 6, -3.6, 6, 2.1, 0.35); ear(cx - 6, 3.6, 6, 2.1, -0.35); }
  if (a === 'fox') { tri([[cx - 2, -5], [cx - 8.5, -6.5], [cx - 4, -1.5]]); tri([[cx - 2, 5], [cx - 8.5, 6.5], [cx - 4, 1.5]]); }
  if (a === 'cat') { tri([[cx - 1, -5.5], [cx - 6.5, -7], [cx - 4.5, -2]]); tri([[cx - 1, 5.5], [cx - 6.5, 7], [cx - 4.5, 2]]); }
  if (a === 'bear') { circle(g, cx - 3, -5.4, 2.6); g.fill(); g.stroke(); circle(g, cx - 3, 5.4, 2.6); g.fill(); g.stroke(); }
  if (a === 'owl') { tri([[cx - 2, -4.5], [cx - 7.5, -5.5], [cx - 3.5, -1.5]]); tri([[cx - 2, 4.5], [cx - 7.5, 5.5], [cx - 3.5, 1.5]]); }
  // Head.
  g.fillStyle = fur;
  if (a === 'frog') {
    ellipse(g, cx, cy, r + 0.6, r - 0.4);
  } else circle(g, cx, cy, r);
  g.fill();
  g.stroke();
  if (ghost) return;
  // Face details toward +x.
  const eye = (x, y, rr2 = 1.1) => { g.fillStyle = INK; circle(g, x, y, rr2); g.fill(); g.fillStyle = '#fff'; circle(g, x + 0.35, y - 0.35, rr2 * 0.38); g.fill(); };
  if (a === 'penguin') {
    g.fillStyle = '#ffffff';
    ellipse(g, cx + 2.6, cy, 3.3, 4.3);
    g.fill();
    g.fillStyle = '#ffa630';
    tri([[cx + 7.5, 0], [cx + 4.8, -1.4], [cx + 4.8, 1.4]]);
  }
  if (a === 'duck') {
    g.fillStyle = '#ff9a2a';
    ellipse(g, cx + 6.2, 0, 2.6, 2.2);
    g.fill();
    g.stroke();
  }
  if (a === 'fox') {
    g.fillStyle = '#fff3e4';
    ellipse(g, cx + 3.6, 0, 2.6, 3);
    g.fill();
  }
  if (a === 'frog') {
    for (const y of [-3.6, 3.6]) {
      g.fillStyle = fur;
      circle(g, cx + 2.4, y, 2.6);
      g.fill();
      g.stroke();
      eye(cx + 3, y, 1.3);
    }
    g.strokeStyle = INK;
    g.beginPath();
    g.arc(cx + 2, 0, 3.4, -0.6, 0.6);
    g.stroke();
    return;
  }
  if (a === 'owl') {
    for (const y of [-2.4, 2.4]) {
      g.fillStyle = '#fff6d8';
      circle(g, cx + 3, y, 2.1);
      g.fill();
      eye(cx + 3.4, y, 1.1);
    }
    g.fillStyle = '#ffb02e';
    tri([[cx + 6.5, 0], [cx + 4.8, -0.9], [cx + 4.8, 0.9]]);
    return;
  }
  eye(cx + 3.6, -2.2);
  eye(cx + 3.6, 2.2);
  if (a === 'bunny' || a === 'cat' || a === 'bear') {
    g.fillStyle = a === 'bear' ? '#4a2a1a' : '#ff8fb5';
    circle(g, cx + 5.6, 0, 0.9);
    g.fill();
  }
  // Rosy cheeks.
  g.fillStyle = 'rgba(255,120,150,0.45)';
  circle(g, cx + 2.4, -4, 1.2); g.fill();
  circle(g, cx + 2.4, 4, 1.2); g.fill();
}

export function bakeKart(racer, kartId, s, { ghost = false } = {}) {
  return sprite(38, 30, s, (g) => {
    kartBody(g, kartId, racer.color, ghost);
    // Steering wheel just ahead of the driver.
    g.strokeStyle = ghost ? 'rgba(90,150,210,0.8)' : INK;
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(4.5, 0, 2.6, -1.2, 1.2);
    g.stroke();
    critter(g, racer, ghost);
  });
}

// A big portrait of a racer for menus (canvas sized in CSS pixels × dpr).
export function drawPortrait(canvas, racer, kartId = racer.kart, locked = false) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2 + h * 0.04);
  const s = Math.min(w, h) / 34;
  g.scale(s, s);
  g.rotate(-Math.PI / 2);
  kartBody(g, kartId, racer.color, false);
  critter(g, racer, false);
  g.restore();
  if (locked) {
    // A silhouette for what is still to unlock.
    g.save();
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = 'rgba(46,32,84,0.9)';
    g.fillRect(0, 0, w, h);
    g.restore();
  }
}

// ------------------------------------------------------------ items

export function bakeItemBox(s) {
  return sprite(30, 30, s, (g) => {
    g.rotate(Math.PI / 4);
    const grad = g.createLinearGradient(-11, -11, 11, 11);
    ['#ff5f8f', '#ffb84d', '#ffe55c', '#6ee87d', '#4fc3ff', '#b47cff'].forEach((c, i) => grad.addColorStop(i / 5, c));
    g.fillStyle = 'rgba(255,255,255,0.35)';
    rr(g, -11, -11, 22, 22, 5);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = grad;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    rr(g, -8, -8, 7, 5, 2.5);
    g.fill();
    g.rotate(-Math.PI / 4);
    g.fillStyle = '#fff';
    g.strokeStyle = INK;
    g.lineWidth = 1.6;
    g.font = '900 15px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeText('?', 0, 1);
    g.fillText('?', 0, 1);
  });
}

function starPath(g, r1, r2, points = 5) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
}

export function bakeStar(s) {
  return sprite(32, 32, s, (g) => {
    g.lineJoin = 'round';
    starPath(g, 13, 6.2);
    g.fillStyle = '#ffd84a';
    g.fill();
    g.lineWidth = 1.6;
    g.strokeStyle = '#b8741a';
    g.stroke();
    starPath(g, 8, 4);
    g.fillStyle = '#fff3a8';
    g.fill();
    g.fillStyle = INK;
    circle(g, -2.4, -0.5, 1.2); g.fill();
    circle(g, 2.4, -0.5, 1.2); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 0.9;
    g.beginPath();
    g.arc(0, 1.2, 1.8, 0.2, Math.PI - 0.2);
    g.stroke();
  });
}

export function bakeJelly(s) {
  return sprite(34, 30, s, (g) => {
    g.rotate(Math.PI / 2); // dome forward
    // Tentacles trail behind (+y after rotation is backwards).
    g.strokeStyle = '#ff7ccf';
    g.lineWidth = 1.8;
    g.lineCap = 'round';
    for (const x of [-5, -1.7, 1.7, 5]) {
      g.beginPath();
      g.moveTo(x, 2);
      g.quadraticCurveTo(x + 2, 7, x - 1, 12);
      g.stroke();
    }
    const grad = g.createRadialGradient(-2, -4, 1, 0, -1, 10);
    grad.addColorStop(0, '#ffe0f4');
    grad.addColorStop(1, '#ff5cb8');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 2, 9, Math.PI, 0);
    g.quadraticCurveTo(0, 6, -9, 2);
    g.fill();
    g.strokeStyle = '#b8237a';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = INK;
    circle(g, -3, -1.5, 1.3); g.fill();
    circle(g, 3, -1.5, 1.3); g.fill();
  });
}

export function bakeBubble(s) {
  return sprite(44, 44, s, (g) => {
    const grad = g.createRadialGradient(-5, -6, 2, 0, 0, 20);
    grad.addColorStop(0, 'rgba(255,255,255,0.32)');
    grad.addColorStop(0.7, 'rgba(140,220,255,0.12)');
    grad.addColorStop(0.92, 'rgba(160,230,255,0.55)');
    grad.addColorStop(1, 'rgba(160,230,255,0)');
    g.fillStyle = grad;
    circle(g, 0, 0, 20);
    g.fill();
    g.strokeStyle = 'rgba(220,250,255,0.75)';
    g.lineWidth = 1.2;
    circle(g, 0, 0, 18.5);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    ellipse(g, -7, -8, 4.5, 2.2, -0.7);
    g.fill();
  });
}

export function bakePad(s) {
  return sprite(44, 34, s, (g) => {
    rr(g, -20, -15, 40, 30, 6);
    const grad = g.createLinearGradient(-20, 0, 20, 0);
    grad.addColorStop(0, '#1fa8ff');
    grad.addColorStop(1, '#7ff6ff');
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 1.6;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#fffbe0';
    for (const x of [-11, -1, 9]) {
      g.beginPath();
      g.moveTo(x - 4, -9);
      g.lineTo(x + 4, 0);
      g.lineTo(x - 4, 9);
      g.lineTo(x - 0.5, 9);
      g.lineTo(x + 7.5, 0);
      g.lineTo(x - 0.5, -9);
      g.closePath();
      g.fill();
    }
  });
}

export function bakeBumper(theme, r, s) {
  return sprite(r * 2 + 10, r * 2 + 10, s, (g) => {
    g.fillStyle = 'rgba(20,10,40,0.3)';
    circle(g, 2.5, 3.5, r);
    g.fill();
    if (theme === 'candy') {
      const grad = g.createRadialGradient(-r * 0.3, -r * 0.4, 1, 0, 0, r);
      grad.addColorStop(0, '#ffd6f0');
      grad.addColorStop(1, '#ff4fa0');
      g.fillStyle = grad;
      circle(g, 0, 0, r);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, d = (i % 3) * r * 0.25 + r * 0.2;
        circle(g, Math.cos(a) * d, Math.sin(a) * d, 0.9);
        g.fill();
      }
    } else if (theme === 'docks') {
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#ff4a4a';
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, r, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffe36b';
      circle(g, 0, 0, r * 0.3);
      g.fill();
    } else {
      const cols = ['#ff5a5a', '#ffd84a', '#4fb7ff', '#6ee87d'];
      for (let i = 0; i < 8; i++) {
        g.fillStyle = cols[i % 4];
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, r, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
        g.fill();
      }
    }
    g.lineWidth = 1.4;
    g.strokeStyle = INK;
    circle(g, 0, 0, r);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    ellipse(g, -r * 0.35, -r * 0.4, r * 0.3, r * 0.18, -0.6);
    g.fill();
  });
}

// Particles: a soft dot (tinted by drawing many colours), a puff and a spark.
export function bakeDot(color, s, r = 4) {
  return bakeGlow(color, r, s, 1.2);
}

export function bakePuff(s) {
  return sprite(20, 20, s, (g) => {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 9);
    grad.addColorStop(0, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    circle(g, 0, 0, 9);
    g.fill();
  });
}

// ------------------------------------------------------------ scenery

export const THEMES = {
  toybox: {
    variants: [
      { ground: '#d9a066', ground2: '#c98f58', verge: '#8fd16e', road: '#5d6b8a', line: '#ffffff', kerb: ['#ff5a5a', '#ffffff'], wall: ['#ff5a5a', '#ffd84a', '#4fb7ff', '#6ee87d'], short: '#b98552', sky: '#f6d3a0' },
      { ground: '#4f8fe0', ground2: '#457fd0', verge: '#ffd27a', road: '#59617a', line: '#fff6c8', kerb: ['#ffd84a', '#ff5a5a'], wall: ['#ff8a3d', '#ffffff', '#b47cff', '#6ee87d'], short: '#c69a62', sky: '#9fc8ff' },
      { ground: '#6cc070', ground2: '#5fb063', verge: '#e8d27a', road: '#5b6584', line: '#ffffff', kerb: ['#4fb7ff', '#ffffff'], wall: ['#ffd84a', '#ff5a5a', '#4fb7ff', '#ffffff'], short: '#b98552', sky: '#bfe8a8' },
      { ground: '#f0c9e0', ground2: '#e6b7d2', verge: '#9be0d0', road: '#626a8c', line: '#ffffff', kerb: ['#ff5a9a', '#ffffff'], wall: ['#4fb7ff', '#ffd84a', '#ff5a9a', '#6ee87d'], short: '#c69a62', sky: '#ffd8ec' },
    ],
  },
  candy: {
    variants: [
      { ground: '#ffc2dc', ground2: '#ffb0d2', verge: '#f4d7a6', road: '#7a4a33', line: '#ffe8f2', kerb: ['#ff3d6e', '#ffffff'], wall: ['#ff3d6e', '#ffffff'], short: '#e2a35a', sky: '#ffd6e8' },
      { ground: '#b6f0d6', ground2: '#a3e6c9', verge: '#f4d7a6', road: '#6b3f2c', line: '#ffffff', kerb: ['#2fbf8f', '#ffffff'], wall: ['#2fbf8f', '#ffffff'], short: '#e2a35a', sky: '#d4fbe9' },
      { ground: '#fff0a8', ground2: '#ffe68a', verge: '#f9c98a', road: '#7d4b30', line: '#ffffff', kerb: ['#ff8a3d', '#ffffff'], wall: ['#ff8a3d', '#fff6d0'], short: '#e2a35a', sky: '#fff6c6' },
      { ground: '#cbc2ff', ground2: '#bdb2ff', verge: '#f4d7a6', road: '#6a3d30', line: '#ffffff', kerb: ['#7b5cff', '#ffffff'], wall: ['#7b5cff', '#ffffff'], short: '#e2a35a', sky: '#e2dcff' },
    ],
  },
  docks: {
    variants: [
      { ground: '#1d2f6b', ground2: '#223878', verge: '#5b3d2a', road: '#8a5a3a', line: '#ffe9a8', kerb: ['#ffd24a', '#2a1d3a'], wall: ['#6b4428', '#ffd98a'], short: '#c9a36a', sky: '#0e1640' },
      { ground: '#163d5e', ground2: '#1b476b', verge: '#5b3d2a', road: '#7d5236', line: '#bff6ff', kerb: ['#5ef2ff', '#2a1d3a'], wall: ['#5e3c24', '#a8f4ff'], short: '#c9a36a', sky: '#0b2236' },
      { ground: '#2b1f5e', ground2: '#33256b', verge: '#56392a', road: '#8f5d3c', line: '#ffd0f5', kerb: ['#ff7ad9', '#2a1d3a'], wall: ['#6b4428', '#ffc4ef'], short: '#c9a36a', sky: '#140c36' },
      { ground: '#10264a', ground2: '#142d55', verge: '#4f3626', road: '#835537', line: '#fff3b8', kerb: ['#ffb84d', '#2a1d3a'], wall: ['#5e3c24', '#ffe39a'], short: '#c9a36a', sky: '#060f26' },
    ],
  },
};

export function palette(theme, variant) {
  const t = THEMES[theme] || THEMES.toybox;
  return t.variants[(variant | 0) % t.variants.length];
}

// The ground: a tile that repeats under the world transform.
export function bakeGroundTile(theme, pal, s, seed = 1) {
  const size = 256;
  const c = makeCanvas(size * s, size * s);
  const g = c.getContext('2d');
  g.scale(s, s);
  const rng = mulberry32(seed);
  g.fillStyle = pal.ground;
  g.fillRect(0, 0, size, size);
  if (theme === 'toybox') {
    // Floorboards (or a rug's weave for the bright variants).
    g.fillStyle = pal.ground2;
    for (let y = 0; y < size; y += 32) {
      g.fillRect(0, y, size, 2);
      const off = (y / 32) % 2 ? 0 : 128;
      g.fillRect(off + 60, y, 2, 32);
      g.fillRect((off + 188) % size, y, 2, 32);
    }
    g.globalAlpha = 0.18;
    g.strokeStyle = shade(pal.ground, -0.3);
    g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const y = rng() * size, x = rng() * size;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + 20, y + 2, x + 30, y - 2, x + 50, y + 1);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (theme === 'candy') {
    const cols = ['#ff5f8f', '#ffd84a', '#5fd0ff', '#7cf08f', '#b47cff', '#ffffff'];
    for (let i = 0; i < 70; i++) {
      g.save();
      g.translate(rng() * size, rng() * size);
      g.rotate(rng() * Math.PI);
      g.fillStyle = cols[i % cols.length];
      rr(g, -3.5, -1, 7, 2.2, 1.1);
      g.fill();
      g.restore();
    }
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 6; i++) {
      ellipse(g, rng() * size, rng() * size, 26 + rng() * 20, 12 + rng() * 8, rng() * 3);
      g.fill();
    }
  } else {
    // Night water: gentle wave strokes and a few star glints.
    g.strokeStyle = pal.ground2;
    g.lineWidth = 3;
    for (let i = 0; i < 22; i++) {
      const x = rng() * size, y = rng() * size;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 10, y - 5, x + 20, y);
      g.quadraticCurveTo(x + 30, y + 5, x + 40, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,220,0.55)';
    for (let i = 0; i < 12; i++) {
      circle(g, rng() * size, rng() * size, 0.8 + rng() * 0.8);
      g.fill();
    }
  }
  return { canvas: c, size };
}

// Small road texture that does not depend on direction.
export function bakeRoadTile(theme, pal, s, seed = 2) {
  const size = 128;
  const c = makeCanvas(size * s, size * s);
  const g = c.getContext('2d');
  g.scale(s, s);
  const rng = mulberry32(seed);
  if (theme === 'candy') {
    const cols = ['#ff7aa8', '#ffe066', '#7fe0ff', '#9cf5a6', '#ffffff'];
    for (let i = 0; i < 26; i++) {
      g.save();
      g.translate(rng() * size, rng() * size);
      g.rotate(rng() * Math.PI);
      g.fillStyle = cols[i % cols.length];
      rr(g, -2.6, -0.8, 5.2, 1.6, 0.8);
      g.fill();
      g.restore();
    }
  } else if (theme === 'toybox') {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 60; i++) { circle(g, rng() * size, rng() * size, 0.6 + rng()); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 60; i++) { circle(g, rng() * size, rng() * size, 0.6 + rng()); g.fill(); }
  } else {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 30; i++) { circle(g, rng() * size, rng() * size, 0.6 + rng() * 0.8); g.fill(); }
  }
  return { canvas: c, size };
}

// Eight scenery pieces per theme. Each fits in roughly 70 × 70 units.
export function bakeDecor(theme, kind, s, seed) {
  const rng = mulberry32(seed * 131 + kind);
  return sprite(80, 80, s, (g) => {
    g.lineJoin = 'round';
    g.lineWidth = 1.6;
    g.strokeStyle = INK;
    // Soft ground shadow.
    g.fillStyle = 'rgba(20,10,40,0.22)';
    ellipse(g, 5, 7, 24, 18);
    g.fill();
    if (theme === 'toybox') toyDecor(g, kind, rng);
    else if (theme === 'candy') candyDecor(g, kind, rng);
    else dockDecor(g, kind, rng);
  });
}

const BRIGHT = ['#ff5a5a', '#ffd84a', '#4fb7ff', '#6ee87d', '#b47cff', '#ff8a3d'];
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

function block(g, x, y, w, col, letter) {
  rr(g, x - w / 2, y - w / 2, w, w, 3);
  g.fillStyle = col;
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  rr(g, x - w / 2 + 2, y - w / 2 + 2, w - 4, w * 0.28, 2);
  g.fill();
  if (letter) {
    g.fillStyle = '#ffffff';
    g.font = `900 ${w * 0.6}px ui-rounded, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, x, y + 1);
  }
}

function toyDecor(g, kind, rng) {
  switch (kind) {
    case 0: // block stack
      block(g, -9, 6, 18, pick(rng, BRIGHT), 'A');
      block(g, 9, 6, 18, pick(rng, BRIGHT), 'B');
      block(g, 0, -10, 18, pick(rng, BRIGHT), 'C');
      break;
    case 1: { // beach ball
      for (let i = 0; i < 6; i++) {
        g.fillStyle = BRIGHT[i];
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 17, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2); g.fill();
      }
      circle(g, 0, 0, 17); g.stroke();
      g.fillStyle = '#fff'; circle(g, 0, 0, 4); g.fill(); g.stroke();
      break;
    }
    case 2: { // teddy bear seen from above
      g.fillStyle = '#c98a55';
      circle(g, -10, -9, 5); g.fill(); g.stroke();
      circle(g, -10, 9, 5); g.fill(); g.stroke();
      ellipse(g, 6, 0, 16, 13); g.fill(); g.stroke();
      circle(g, -9, 0, 11); g.fill(); g.stroke();
      g.fillStyle = '#f0c9a2';
      circle(g, -2, 0, 4.2); g.fill();
      g.fillStyle = INK;
      circle(g, -6, -4, 1.6); g.fill(); circle(g, -6, 4, 1.6); g.fill();
      circle(g, 0, 0, 1.4); g.fill();
      break;
    }
    case 3: // crayons
      for (const [y, col, rot] of [[-7, pick(rng, BRIGHT), -0.2], [6, pick(rng, BRIGHT), 0.25]]) {
        g.save(); g.translate(0, y); g.rotate(rot);
        g.fillStyle = col;
        rr(g, -22, -4.5, 36, 9, 2); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(14, -4.5); g.lineTo(23, 0); g.lineTo(14, 4.5); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(-14, -4.5, 3, 9); g.fillRect(-6, -4.5, 3, 9);
        g.restore();
      }
      break;
    case 4: // rubber duck
      g.fillStyle = '#ffd84a';
      ellipse(g, 2, 0, 15, 11); g.fill(); g.stroke();
      circle(g, -9, 0, 8); g.fill(); g.stroke();
      g.fillStyle = '#ff8a3d';
      ellipse(g, -17, 0, 4, 3); g.fill(); g.stroke();
      g.fillStyle = INK; circle(g, -11, -3.5, 1.4); g.fill(); circle(g, -11, 3.5, 1.4); g.fill();
      break;
    case 5: { // spinning top
      const cols = [pick(rng, BRIGHT), '#ffffff', pick(rng, BRIGHT)];
      [16, 11, 6].forEach((r, i) => { g.fillStyle = cols[i]; circle(g, 0, 0, r); g.fill(); g.stroke(); });
      g.fillStyle = INK; circle(g, 0, 0, 2.2); g.fill();
      break;
    }
    case 6: // toy brick
      g.fillStyle = pick(rng, BRIGHT);
      rr(g, -18, -11, 36, 22, 3); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.4)';
      for (let x = -12; x <= 12; x += 8) for (const y of [-4, 4]) { circle(g, x, y, 2.8); g.fill(); g.stroke(); }
      break;
    default: // one big alphabet block
      block(g, 0, 0, 28, pick(rng, BRIGHT), pick(rng, ['K', 'A', 'R', 'T', 'Z', 'O']));
  }
}

function candyDecor(g, kind, rng) {
  switch (kind) {
    case 0: { // lollipop swirl
      g.fillStyle = '#fff4d6';
      rr(g, 8, -2, 22, 4, 2); g.fill(); g.stroke();
      g.fillStyle = pick(rng, ['#ff5f8f', '#5fd0ff', '#ffb84d', '#b47cff']);
      circle(g, 0, 0, 15); g.fill(); g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 3;
      g.beginPath();
      for (let a = 0; a < 12; a += 0.2) g.lineTo(Math.cos(a) * a * 1.15, Math.sin(a) * a * 1.15);
      g.stroke();
      break;
    }
    case 1: // gumdrops
      for (const [x, y, col] of [[-9, -6, '#ff5f8f'], [8, -7, '#6ee87d'], [0, 8, '#ffd84a']]) {
        g.fillStyle = col; circle(g, x, y, 8.5); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.7)'; circle(g, x - 2.5, y - 2.5, 2); g.fill();
      }
      break;
    case 2: // cupcake
      g.fillStyle = '#ffb3d1'; circle(g, 0, 0, 16); g.fill(); g.stroke();
      g.fillStyle = '#fff'; circle(g, 0, 0, 11); g.fill();
      g.fillStyle = '#ffe0ee'; circle(g, 0, 0, 6.5); g.fill();
      g.fillStyle = '#ff2f5f'; circle(g, 0, 0, 3.6); g.fill(); g.stroke();
      break;
    case 3: { // donut
      g.fillStyle = '#e8a560'; circle(g, 0, 0, 17); g.fill(); g.stroke();
      g.fillStyle = pick(rng, ['#ff7ab8', '#7a4a33', '#b6f0d6']);
      circle(g, 0, 0, 14); g.fill();
      g.fillStyle = '#ffc2dc'; circle(g, 0, 0, 5.5); g.fill(); g.stroke();
      const cols = ['#fff', '#ffd84a', '#5fd0ff', '#6ee87d'];
      for (let i = 0; i < 14; i++) {
        const a = rng() * 6.28, d = 7.5 + rng() * 5;
        g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d); g.rotate(rng() * 3);
        g.fillStyle = cols[i % 4]; g.fillRect(-2, -0.7, 4, 1.4); g.restore();
      }
      break;
    }
    case 4: // wrapped sweet
      g.fillStyle = pick(rng, ['#5fd0ff', '#ff8a3d', '#b47cff']);
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 8, 0); g.lineTo(sx * 20, -8); g.lineTo(sx * 20, 8); g.closePath(); g.fill(); g.stroke(); }
      ellipse(g, 0, 0, 11, 8); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.6)'; ellipse(g, -3, -3, 4, 2, -0.3); g.fill();
      break;
    case 5: // ice cream scoops
      for (const [x, y, col] of [[-7, 4, '#fff1c9'], [7, 4, '#ff9ec7'], [0, -8, '#8a5a3a']]) { g.fillStyle = col; circle(g, x, y, 9.5); g.fill(); g.stroke(); }
      g.fillStyle = '#ff2f5f'; circle(g, 0, -10, 3); g.fill(); g.stroke();
      break;
    case 6: // candy canes
      for (const [x, rot] of [[-7, -0.3], [7, 0.3]]) {
        g.save(); g.translate(x, 0); g.rotate(rot);
        g.lineCap = 'round'; g.lineWidth = 7; g.strokeStyle = INK;
        g.beginPath(); g.moveTo(0, 18); g.lineTo(0, -8); g.arc(-6, -8, 6, 0, -Math.PI, true); g.stroke();
        g.lineWidth = 5; g.strokeStyle = '#fff';
        g.beginPath(); g.moveTo(0, 18); g.lineTo(0, -8); g.arc(-6, -8, 6, 0, -Math.PI, true); g.stroke();
        g.setLineDash([3, 3]); g.strokeStyle = '#ff3d6e';
        g.beginPath(); g.moveTo(0, 18); g.lineTo(0, -8); g.arc(-6, -8, 6, 0, -Math.PI, true); g.stroke();
        g.setLineDash([]);
        g.restore();
      }
      g.lineWidth = 1.6; g.strokeStyle = INK;
      break;
    default: { // cookie
      g.fillStyle = '#e0a868'; circle(g, 0, 0, 17); g.fill(); g.stroke();
      g.fillStyle = '#5a3420';
      for (let i = 0; i < 7; i++) { circle(g, (rng() - 0.5) * 22, (rng() - 0.5) * 22, 2.2); g.fill(); }
    }
  }
}

function dockDecor(g, kind, rng) {
  switch (kind) {
    case 0: { // little boat
      g.fillStyle = pick(rng, ['#ff5a5a', '#ffd84a', '#4fb7ff', '#ffffff']);
      g.beginPath(); g.moveTo(24, 0); g.quadraticCurveTo(14, -12, -18, -10); g.lineTo(-20, 10); g.quadraticCurveTo(14, 12, 24, 0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff6e0'; rr(g, -10, -6, 14, 12, 3); g.fill(); g.stroke();
      g.fillStyle = '#ffe36b'; rr(g, -7, -3, 4, 6, 1); g.fill();
      break;
    }
    case 1: // crates
      for (const [x, y] of [[-8, -6], [8, -6], [0, 9]]) {
        g.fillStyle = '#b07a46'; rr(g, x - 9, y - 9, 18, 18, 2); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(x - 9, y - 9); g.lineTo(x + 9, y + 9); g.moveTo(x + 9, y - 9); g.lineTo(x - 9, y + 9); g.stroke();
      }
      break;
    case 2: // lantern post (its glow is drawn live)
      g.fillStyle = '#5e3c24'; circle(g, 0, 0, 6); g.fill(); g.stroke();
      g.fillStyle = '#ffe39a'; circle(g, 0, 0, 3.6); g.fill();
      break;
    case 3: // buoy
      g.fillStyle = '#ff4a4a'; circle(g, 0, 0, 11); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.fillRect(-11, -3, 22, 6);
      circle(g, 0, 0, 11); g.stroke();
      break;
    case 4: // barrels
      for (const [x, y] of [[-7, 0], [8, -5], [6, 9]]) {
        g.fillStyle = '#8b5a33'; circle(g, x, y, 7.5); g.fill(); g.stroke();
        g.strokeStyle = '#3d2a1a'; circle(g, x, y, 4.5); g.stroke(); g.strokeStyle = INK;
      }
      break;
    case 5: // lighthouse top
      g.fillStyle = '#ffffff'; circle(g, 0, 0, 15); g.fill(); g.stroke();
      g.fillStyle = '#ff4a4a'; circle(g, 0, 0, 10); g.fill(); g.stroke();
      g.fillStyle = '#fff3a8'; circle(g, 0, 0, 5); g.fill(); g.stroke();
      break;
    case 6: // starfish
      g.fillStyle = pick(rng, ['#ff8a3d', '#ff6fae', '#ffd84a']);
      starPath(g, 15, 6);
      g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; circle(g, Math.cos(a) * 7, Math.sin(a) * 7, 1); g.fill(); }
      break;
    default: // floating paper lantern
      g.fillStyle = pick(rng, ['#ff9ec7', '#ffd27a', '#a8f4ff']);
      rr(g, -8, -10, 16, 20, 6); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(42,29,58,0.5)';
      g.beginPath(); g.moveTo(-8, -3); g.lineTo(8, -3); g.moveTo(-8, 3); g.lineTo(8, 3); g.stroke();
  }
}

// Which decoration kinds glow at night.
export const GLOWING = { docks: new Set([2, 5, 7]) };

// A name tag above a rival: a coloured pill with the name.
export function bakeTag(racer, dpr) {
  const c = makeCanvas(1, 1);
  const g = c.getContext('2d');
  const px = 12 * dpr;
  g.font = `800 ${px}px ui-rounded, system-ui, sans-serif`;
  const w = g.measureText(racer.name).width + 12 * dpr;
  c.width = Math.ceil(w);
  c.height = Math.ceil(px * 1.6);
  const h = c.height;
  const g2 = c.getContext('2d');
  rr(g2, 0, 0, c.width, h, h / 2);
  g2.fillStyle = racer.color;
  g2.fill();
  g2.fillStyle = '#ffffff';
  g2.font = `800 ${px}px ui-rounded, system-ui, sans-serif`;
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.fillText(racer.name, c.width / 2, h / 2 + dpr * 0.5);
  return { canvas: c, w: c.width / dpr, h: h / dpr };
}

// ------------------------------------------------------------ item icons

function mushroom(g, x, y, r) {
  g.fillStyle = '#fff3e0';
  rr(g, x - r * 0.45, y - r * 0.1, r * 0.9, r * 0.95, r * 0.3);
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(x, y, r, Math.PI, 0);
  g.quadraticCurveTo(x, y + r * 0.35, x - r, y);
  g.fillStyle = '#ff4a5a';
  g.fill();
  g.stroke();
  g.fillStyle = '#ffffff';
  for (const [dx, dy, rr2] of [[-0.45, -0.45, 0.22], [0.35, -0.6, 0.18], [0.1, -0.15, 0.15]]) {
    circle(g, x + dx * r, y + dy * r, rr2 * r);
    g.fill();
  }
  g.fillStyle = INK;
  circle(g, x - r * 0.18, y + r * 0.35, r * 0.09); g.fill();
  circle(g, x + r * 0.18, y + r * 0.35, r * 0.09); g.fill();
}

// Draws an item's icon into a square canvas (HUD slot and touch button).
export function drawItemIcon(canvas, id) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  if (!id) return;
  const s = Math.min(w, h) / 34;
  g.translate(w / 2, h / 2);
  g.scale(s, s);
  g.lineWidth = 1.4;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  const blit = (spr, scale = 1, rot = 0) => {
    g.save();
    g.rotate(rot);
    g.scale(scale / s, scale / s);
    g.drawImage(spr.canvas, -spr.canvas.width / 2, -spr.canvas.height / 2);
    g.restore();
  };
  switch (id) {
    case 'shield': {
      const grad = g.createRadialGradient(-4, -5, 1, 0, 0, 14);
      grad.addColorStop(0, '#e9fdff');
      grad.addColorStop(0.6, '#7fe3ff');
      grad.addColorStop(1, '#3aa8ff');
      g.fillStyle = grad;
      circle(g, 0, 0, 13);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      ellipse(g, -5, -6, 4, 2, -0.7);
      g.fill();
      circle(g, 6, 5, 1.6);
      g.fill();
      break;
    }
    case 'star': blit(bakeStar(s * 0.95), 1); break;
    case 'jelly': blit(bakeJelly(s * 0.95), 1, -Math.PI / 2); break;
    case 'mushroom': mushroom(g, 0, 2, 11); break;
    case 'triple':
      mushroom(g, -7, 6, 7); mushroom(g, 7, 6, 7); mushroom(g, 0, -4, 7.5);
      break;
    case 'comet': {
      const grad = g.createLinearGradient(-14, 10, 8, -6);
      ['#ff5f8f', '#ffd84a', '#6ee87d', '#4fc3ff', '#b47cff'].forEach((c, i) => grad.addColorStop(i / 4, c));
      g.strokeStyle = grad;
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(-13, 11); g.quadraticCurveTo(-6, 0, 4, -4); g.stroke();
      g.lineWidth = 1.4;
      g.strokeStyle = INK;
      g.translate(6, -5);
      starPath(g, 9, 4.2);
      g.fillStyle = '#fff3a8';
      g.fill();
      g.stroke();
      break;
    }
    default: break;
  }
}

// ------------------------------------------------------------ face portraits

// A front-facing face for the racer picker: much easier to tell critters
// apart than the top-down kart.
export function drawFace(canvas, racer, locked = false) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  const s = Math.min(w, h) / 100;
  g.translate(w / 2, h / 2 + 6 * s);
  g.scale(s, s);
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  const fur = racer.fur, a = racer.animal;
  // Badge behind in the racer's colour.
  g.fillStyle = racer.color;
  circle(g, 0, -6, 44);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  circle(g, -12, -20, 22);
  g.fill();
  g.fillStyle = fur;
  const ear = (x, y, rx, ry, rot, inner) => {
    g.fillStyle = fur; ellipse(g, x, y, rx, ry, rot); g.fill(); g.stroke();
    if (inner) { g.fillStyle = inner; ellipse(g, x, y + ry * 0.15, rx * 0.5, ry * 0.65, rot); g.fill(); }
  };
  const tri = (pts, fill = fur) => { g.fillStyle = fill; g.beginPath(); g.moveTo(...pts[0]); g.lineTo(...pts[1]); g.lineTo(...pts[2]); g.closePath(); g.fill(); g.stroke(); };
  if (a === 'bunny') { ear(-13, -40, 7, 22, -0.15, '#ffb3cf'); ear(13, -40, 7, 22, 0.15, '#ffb3cf'); }
  if (a === 'fox') { tri([[-28, -14], [-20, -46], [-4, -24]]); tri([[28, -14], [20, -46], [4, -24]]); }
  if (a === 'cat') { tri([[-26, -12], [-22, -42], [-6, -24]]); tri([[26, -12], [22, -42], [6, -24]]); }
  if (a === 'bear') { ear(-22, -26, 9, 9, 0, '#e0a477'); ear(22, -26, 9, 9, 0, '#e0a477'); }
  if (a === 'owl') { tri([[-24, -16], [-26, -40], [-8, -26]]); tri([[24, -16], [26, -40], [8, -26]]); }
  // Head.
  g.fillStyle = fur;
  if (a === 'frog') ellipse(g, 0, 0, 32, 24);
  else circle(g, 0, -2, 27);
  g.fill();
  g.stroke();
  const eye = (x, y, r = 4.5) => { g.fillStyle = INK; circle(g, x, y, r); g.fill(); g.fillStyle = '#fff'; circle(g, x + r * 0.35, y - r * 0.35, r * 0.38); g.fill(); };
  if (a === 'penguin') { g.fillStyle = '#fff'; ellipse(g, 0, 4, 19, 20); g.fill(); }
  if (a === 'fox') { g.fillStyle = '#fff3e4'; ellipse(g, 0, 10, 15, 11); g.fill(); }
  if (a === 'owl') { for (const x of [-10, 10]) { g.fillStyle = '#fff6d8'; circle(g, x, -4, 9.5); g.fill(); g.stroke(); } }
  if (a === 'frog') {
    for (const x of [-15, 15]) { g.fillStyle = fur; circle(g, x, -20, 10); g.fill(); g.stroke(); eye(x, -20, 5); }
    g.beginPath(); g.arc(0, 2, 13, 0.3, Math.PI - 0.3); g.stroke();
  } else {
    eye(-10, -4);
    eye(10, -4);
  }
  // Noses and beaks.
  if (a === 'penguin' || a === 'owl') tri([[-5, 6], [5, 6], [0, 13]], '#ffa630');
  else if (a === 'duck') { g.fillStyle = '#ff9a2a'; ellipse(g, 0, 10, 12, 6); g.fill(); g.stroke(); }
  else if (a !== 'frog') {
    g.fillStyle = a === 'bear' || a === 'fox' ? INK : '#ff8fb5';
    ellipse(g, 0, 6, 4, 3); g.fill();
    g.beginPath(); g.moveTo(-6, 11); g.quadraticCurveTo(-3, 14, 0, 11); g.quadraticCurveTo(3, 14, 6, 11); g.stroke();
  }
  if (a === 'cat') {
    g.lineWidth = 1.6;
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 9, 8); g.lineTo(sx * 24, 5); g.moveTo(sx * 9, 11); g.lineTo(sx * 24, 12); g.stroke(); }
    g.lineWidth = 3;
  }
  g.fillStyle = 'rgba(255,110,150,0.45)';
  circle(g, -17, 7, 4.5); g.fill();
  circle(g, 17, 7, 4.5); g.fill();
  // Scarf.
  g.fillStyle = racer.light;
  rr(g, -24, 22, 48, 11, 5);
  g.fill();
  g.stroke();
  if (locked) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = 'rgba(46,32,84,0.92)';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
}
