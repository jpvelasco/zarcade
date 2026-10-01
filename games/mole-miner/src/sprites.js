// Baked art. Everything is drawn once into offscreen canvases at the current
// tile size, then stamped by the renderer. No per-frame gradients or blur.
import { LAYERS, ORES, T, D, PAINTS } from './data.js';
import { makeRng } from './rng.js';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function blob(g, x, y, rx, ry) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  g.fill();
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; gg += (255 - gg) * k; b += (255 - b) * k; } else { r *= 1 + k; gg *= 1 + k; b *= 1 + k; }
  return `rgb(${Math.round(r)},${Math.round(gg)},${Math.round(b)})`;
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ------------------------------------------------------------ tiles

function solidTile(P, L, li, variant) {
  const c = canvas(P, P), g = c.getContext('2d');
  const rng = makeRng(`tile:${li}:${variant}`);
  const C = L.colors;
  g.fillStyle = C.base;
  g.fillRect(0, 0, P, P);
  if (L.id === 'ruins') {
    // Sandstone blocks.
    g.fillStyle = C.dark;
    const rows = 2;
    for (let r = 0; r < rows; r++) {
      const y = (r * P) / rows;
      g.fillRect(0, y, P, Math.max(1, P * 0.04));
      const off = (r + variant) % 2 ? P * 0.5 : 0;
      g.fillRect(off + P * 0.25, y, Math.max(1, P * 0.04), P / rows);
      if (off) g.fillRect(off - P * 0.5 + P * 0.25 + P * 0.5, y, Math.max(1, P * 0.04), P / rows);
    }
    g.fillStyle = C.light;
    for (let r = 0; r < rows; r++) g.fillRect(0, (r * P) / rows + P * 0.04, P, Math.max(1, P * 0.03));
  }
  if (L.id === 'clay') {
    g.fillStyle = C.dark;
    for (let k = 0; k < 3; k++) {
      const y = P * (0.2 + k * 0.3 + rng() * 0.08);
      g.globalAlpha = 0.35;
      g.fillRect(0, y, P, Math.max(1, P * 0.05));
    }
    g.globalAlpha = 1;
  }
  // Specks and pebbles.
  const n = 9 + Math.floor(rng() * 5);
  for (let k = 0; k < n; k++) {
    const x = rng() * P, y = rng() * P, r = P * (0.03 + rng() * 0.05);
    g.fillStyle = rng() < 0.5 ? C.dark : C.light;
    g.globalAlpha = 0.55 + rng() * 0.35;
    blob(g, x, y, r * 1.3, r);
  }
  g.globalAlpha = 1;
  // One soft, low-contrast pebble so ores stand out against the rock.
  {
    const x = P * (0.2 + rng() * 0.6), y = P * (0.2 + rng() * 0.6), r = P * (0.06 + rng() * 0.04);
    g.fillStyle = C.dark;
    g.globalAlpha = 0.7;
    blob(g, x, y + r * 0.25, r * 1.2, r * 0.9);
    g.fillStyle = shade(C.base, 0.08);
    blob(g, x, y, r * 1.05, r * 0.75);
    g.globalAlpha = 1;
  }
  if (L.id === 'rock' || L.id === 'lava') {
    g.strokeStyle = L.id === 'lava' ? rgba(C.speck, 0.55) : C.dark;
    g.lineWidth = Math.max(1, P * 0.035);
    g.beginPath();
    let x = rng() * P, y = 0;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * P * 0.4; y += P * 0.25; g.lineTo(x, y); }
    g.stroke();
  }
  if (L.id === 'crystal' && variant % 2 === 0) {
    g.fillStyle = rgba(C.speck, 0.8);
    const x = P * (0.2 + rng() * 0.6), y = P * (0.3 + rng() * 0.5);
    g.beginPath(); g.moveTo(x, y - P * 0.14); g.lineTo(x + P * 0.06, y); g.lineTo(x, y + P * 0.06); g.lineTo(x - P * 0.06, y); g.fill();
  }
  if (L.id === 'mushroom') {
    g.fillStyle = rgba(C.speck, 0.5);
    for (let k = 0; k < 4; k++) blob(g, rng() * P, rng() * P, P * 0.025, P * 0.025);
  }
  if (L.id === 'meadow' && variant === 1) {
    // A little root.
    g.strokeStyle = '#d9b07a';
    g.globalAlpha = 0.6;
    g.lineWidth = Math.max(1, P * 0.03);
    g.beginPath();
    g.moveTo(P * 0.2, P * 0.1);
    g.quadraticCurveTo(P * 0.5, P * 0.4, P * 0.35, P * 0.75);
    g.stroke();
    g.globalAlpha = 1;
  }
  return c;
}

function bgTile(P, L, li, variant) {
  const c = canvas(P, P), g = c.getContext('2d');
  const rng = makeRng(`bg:${li}:${variant}`);
  const C = L.colors;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, P, P);
  for (let k = 0; k < 7; k++) {
    g.fillStyle = rng() < 0.5 ? C.edge : shade(C.bg, 0.12);
    g.globalAlpha = 0.6;
    blob(g, rng() * P, rng() * P, P * (0.05 + rng() * 0.08), P * (0.04 + rng() * 0.05));
  }
  g.globalAlpha = 1;
  return c;
}

// Faceted gem clusters or metal nuggets.
function oreSprite(P, ore, k) {
  const c = canvas(P, P), g = c.getContext('2d');
  const rng = makeRng(`ore:${k}`);
  const metal = ['copper', 'iron', 'silver', 'idol'].includes(ore.id);
  const col = ore.color;
  if (ore.glow) {
    // Baked halo (once, not per frame).
    const grd = g.createRadialGradient(P / 2, P / 2, 0, P / 2, P / 2, P * 0.5);
    grd.addColorStop(0, rgba(col, 0.5));
    grd.addColorStop(1, rgba(col, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, P, P);
  }
  const spots = metal ? 4 : 3;
  for (let i = 0; i < spots; i++) {
    const x = P * (0.25 + rng() * 0.5), y = P * (0.25 + rng() * 0.5), r = P * (metal ? 0.1 + rng() * 0.05 : 0.12 + rng() * 0.06);
    if (metal) {
      g.fillStyle = shade(col, -0.45);
      blob(g, x, y + r * 0.2, r * 1.15, r);
      g.fillStyle = col;
      blob(g, x, y, r, r * 0.85);
      g.fillStyle = shade(col, 0.6);
      blob(g, x - r * 0.35, y - r * 0.35, r * 0.35, r * 0.25);
      g.lineWidth = Math.max(1, P * 0.025);
      g.strokeStyle = shade(col, -0.65);
      g.beginPath(); g.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2); g.stroke();
      if (ore.id === 'idol') {
        g.fillStyle = shade(col, -0.3);
        g.font = `900 ${Math.round(r * 1.2)}px system-ui, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('☼', x, y + r * 0.05);
      }
    } else {
      const rot = rng() * Math.PI;
      const pts = 6;
      g.save();
      g.translate(x, y);
      g.rotate(rot * 0.3);
      g.beginPath();
      for (let j = 0; j < pts; j++) {
        const a = (j / pts) * Math.PI * 2;
        const rr = j % 2 ? r * 0.8 : r * 1.1;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 1.2);
      }
      g.closePath();
      g.fillStyle = shade(col, -0.5);
      g.lineWidth = Math.max(1, P * 0.035);
      g.strokeStyle = shade(col, -0.6);
      g.fill();
      g.stroke();
      g.beginPath();
      for (let j = 0; j < pts; j++) {
        const a = (j / pts) * Math.PI * 2;
        const rr = (j % 2 ? r * 0.8 : r * 1.1) * 0.72;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 1.2 - r * 0.1);
      }
      g.closePath();
      g.fillStyle = col;
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.moveTo(-r * 0.45, -r * 0.5); g.lineTo(-r * 0.05, -r * 0.7); g.lineTo(-r * 0.2, -r * 0.15); g.closePath();
      g.fill();
      g.restore();
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.95)';
  star(g, P * (0.68 + rng() * 0.12), P * (0.2 + rng() * 0.1), P * (ore.id === 'starheart' || ore.id === 'moonpearl' ? 0.11 : 0.075));
  return c;
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.35 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

// A museum piece buried in the ground: fossils up top, treasure deeper.
function relicSprite(P, setIndex) {
  const c = canvas(P, P), g = c.getContext('2d');
  const bone = '#f3ead2', boneDark = '#a8977a';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (setIndex === 0) {
    // Spiral shell fossil.
    g.strokeStyle = boneDark; g.lineWidth = P * 0.1;
    spiral(g, P / 2, P / 2, P * 0.3);
    g.strokeStyle = bone; g.lineWidth = P * 0.06;
    spiral(g, P / 2, P / 2, P * 0.3);
  } else if (setIndex === 1) {
    // A bone.
    g.save(); g.translate(P / 2, P / 2); g.rotate(-0.6);
    for (const [col, wd] of [[boneDark, 0.17], [bone, 0.11]]) {
      g.strokeStyle = col; g.lineWidth = P * wd;
      g.beginPath(); g.moveTo(-P * 0.26, 0); g.lineTo(P * 0.26, 0); g.stroke();
      g.fillStyle = col;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) blob(g, sx * P * 0.28, sy * P * 0.07, P * wd * 0.75, P * wd * 0.75);
    }
    g.restore();
  } else {
    // A small chest with a set-coloured gem.
    const gem = ['#6fd3ff', '#c8f56c', '#ff8a3c', '#ffe066'][setIndex - 2];
    const x = P * 0.18, y = P * 0.3, w = P * 0.64, h = P * 0.46;
    g.fillStyle = '#5a3416';
    g.fillRect(x - P * 0.02, y - P * 0.02, w + P * 0.04, h + P * 0.04);
    g.fillStyle = '#9a5c2a';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#b8743a';
    g.fillRect(x, y, w, h * 0.38);
    g.fillStyle = '#ffd24a';
    g.fillRect(x, y + h * 0.36, w, P * 0.05);
    g.fillRect(x + w * 0.45, y, w * 0.1, h);
    g.fillStyle = gem;
    star(g, x + w * 0.5, y + h * 0.4, P * 0.11);
  }
  // Sparkle: hints that this is special.
  g.fillStyle = 'rgba(255,255,230,0.95)';
  star(g, P * 0.8, P * 0.18, P * 0.08);
  return c;
}

function spiral(g, cx, cy, r) {
  g.beginPath();
  for (let t = 0; t <= 1; t += 0.03) {
    const a = t * Math.PI * 5;
    const rr = r * t;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.stroke();
}

function fuelSprite(P) {
  const c = canvas(P, P), g = c.getContext('2d');
  const x = P * 0.28, y = P * 0.22, w = P * 0.44, h = P * 0.58;
  g.fillStyle = '#7a1414';
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = '#e83c3c';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#ff8a7a';
  g.fillRect(x + w * 0.12, y + h * 0.1, w * 0.18, h * 0.7);
  g.fillStyle = '#ffd24a';
  g.fillRect(x + w * 0.55, y - P * 0.1, w * 0.3, P * 0.12);
  g.fillStyle = '#fff';
  g.font = `900 ${Math.round(P * 0.26)}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('F', x + w * 0.6, y + h * 0.55);
  return c;
}

function gasTell(P) {
  const c = canvas(P, P), g = c.getContext('2d');
  g.strokeStyle = 'rgba(190,255,150,0.55)';
  g.lineWidth = Math.max(1, P * 0.035);
  for (const [x, y, r] of [[0.3, 0.6, 0.09], [0.55, 0.4, 0.06], [0.68, 0.66, 0.07]]) {
    g.beginPath(); g.arc(P * x, P * y, P * r, 0, Math.PI * 2); g.stroke();
  }
  return c;
}

function boulderSprite(P) {
  const c = canvas(P, P), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.35)';
  blob(g, P * 0.5, P * 0.9, P * 0.42, P * 0.08);
  g.fillStyle = '#4c4a52';
  blob(g, P * 0.5, P * 0.52, P * 0.47, P * 0.44);
  g.fillStyle = '#7a7884';
  blob(g, P * 0.47, P * 0.47, P * 0.4, P * 0.36);
  g.fillStyle = '#9d9ba8';
  blob(g, P * 0.36, P * 0.34, P * 0.15, P * 0.1);
  g.strokeStyle = '#4c4a52';
  g.lineWidth = Math.max(1, P * 0.04);
  g.beginPath(); g.moveTo(P * 0.62, P * 0.25); g.lineTo(P * 0.55, P * 0.45); g.lineTo(P * 0.68, P * 0.6); g.stroke();
  return c;
}

function lavaSprite(P, v) {
  const c = canvas(P, P), g = c.getContext('2d');
  const rng = makeRng(`lava:${v}`);
  g.fillStyle = '#ff5a1f';
  g.fillRect(0, 0, P, P);
  g.fillStyle = '#ffb02e';
  for (let k = 0; k < 4; k++) blob(g, rng() * P, rng() * P, P * (0.1 + rng() * 0.12), P * (0.06 + rng() * 0.08));
  g.fillStyle = '#fff1a0';
  for (let k = 0; k < 3; k++) blob(g, rng() * P, rng() * P, P * 0.04, P * 0.03);
  g.fillStyle = 'rgba(120,20,10,0.55)';
  for (let k = 0; k < 3; k++) blob(g, rng() * P, rng() * P, P * (0.06 + rng() * 0.08), P * 0.05);
  return c;
}

function cooledSprite(P) {
  const c = canvas(P, P), g = c.getContext('2d');
  g.fillStyle = '#2a2236';
  g.fillRect(0, 0, P, P);
  g.fillStyle = '#463a5c';
  blob(g, P * 0.35, P * 0.3, P * 0.2, P * 0.12);
  blob(g, P * 0.7, P * 0.65, P * 0.18, P * 0.1);
  g.strokeStyle = 'rgba(255,120,60,0.55)';
  g.lineWidth = Math.max(1, P * 0.03);
  g.beginPath(); g.moveTo(P * 0.1, P * 0.7); g.lineTo(P * 0.4, P * 0.55); g.lineTo(P * 0.55, P * 0.8); g.stroke();
  g.fillStyle = 'rgba(160,220,255,0.35)';
  blob(g, P * 0.25, P * 0.2, P * 0.08, P * 0.04);
  return c;
}

function bounceSprite(P, L) {
  const c = canvas(P, P), g = c.getContext('2d');
  g.fillStyle = L.colors.base;
  g.fillRect(0, P * 0.45, P, P * 0.55);
  g.fillStyle = '#e8f6e0';
  g.fillRect(P * 0.38, P * 0.35, P * 0.24, P * 0.65);
  g.fillStyle = '#ff5fa8';
  g.beginPath();
  g.ellipse(P * 0.5, P * 0.42, P * 0.5, P * 0.36, 0, Math.PI, 0);
  g.fill();
  g.fillRect(0, P * 0.38, P, P * 0.08);
  g.fillStyle = '#ffd0ea';
  for (const [x, y, r] of [[0.28, 0.24, 0.07], [0.55, 0.16, 0.06], [0.75, 0.3, 0.05]]) blob(g, P * x, P * y, P * r, P * r * 0.8);
  return c;
}

function brickSprite(P) {
  const c = canvas(P, P), g = c.getContext('2d');
  g.fillStyle = '#5b4528';
  g.fillRect(0, 0, P, P);
  g.fillStyle = '#c9a466';
  const m = Math.max(1, P * 0.05);
  g.fillRect(m, m, P / 2 - m * 1.5, P / 2 - m * 1.5);
  g.fillRect(P / 2 + m / 2, m, P / 2 - m * 1.5, P / 2 - m * 1.5);
  g.fillRect(m, P / 2 + m / 2, P * 0.25 - m, P / 2 - m * 1.5);
  g.fillRect(P * 0.25 + m / 2, P / 2 + m / 2, P / 2 - m, P / 2 - m * 1.5);
  g.fillRect(P * 0.75 + m / 2, P / 2 + m / 2, P * 0.25 - m * 1.5, P / 2 - m * 1.5);
  g.fillStyle = 'rgba(255,240,190,0.35)';
  g.fillRect(m, m, P / 2 - m * 1.5, m);
  g.fillRect(P / 2 + m / 2, m, P / 2 - m * 1.5, m);
  g.fillStyle = 'rgba(255,215,90,0.8)';
  g.font = `900 ${Math.round(P * 0.22)}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('✦', P * 0.25, P * 0.25);
  return c;
}

function padSprite(P) {
  const c = canvas(P, P), g = c.getContext('2d');
  g.fillStyle = '#6b4a2c';
  g.fillRect(0, 0, P, P);
  g.fillStyle = '#c9905a';
  g.fillRect(0, 0, P, P * 0.3);
  g.fillStyle = '#e8b47a';
  g.fillRect(0, 0, P, P * 0.08);
  g.fillStyle = '#8a5c34';
  g.fillRect(P * 0.48, 0, Math.max(1, P * 0.04), P * 0.3);
  g.fillStyle = '#55381f';
  for (const x of [0.15, 0.85]) blob(g, P * x, P * 0.17, P * 0.03, P * 0.03);
  g.fillStyle = '#4a3220';
  for (let k = 0; k < 4; k++) blob(g, P * (0.15 + k * 0.23), P * (0.55 + (k % 2) * 0.2), P * 0.08, P * 0.05);
  return c;
}

function bedrockSprite(P) {
  const c = canvas(P, P), g = c.getContext('2d');
  const rng = makeRng('bedrock');
  g.fillStyle = '#1b1a22';
  g.fillRect(0, 0, P, P);
  for (let k = 0; k < 6; k++) {
    g.fillStyle = k % 2 ? '#2b2a35' : '#121118';
    blob(g, rng() * P, rng() * P, P * (0.12 + rng() * 0.1), P * (0.08 + rng() * 0.08));
  }
  return c;
}

function coreSprite(P) {
  const c = canvas(P, P), g = c.getContext('2d');
  const grd = g.createRadialGradient(P / 2, P / 2, 0, P / 2, P / 2, P / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.4, 'rgba(255,140,230,0.7)');
  grd.addColorStop(1, 'rgba(120,120,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, P, P);
  g.save();
  g.translate(P / 2, P / 2);
  const cols = ['#ff6bd5', '#ffd84a', '#5ef2ff', '#8b7bff'];
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2);
    g.fillStyle = cols[i];
    g.beginPath(); g.moveTo(0, 0); g.lineTo(P * 0.14, -P * 0.1); g.lineTo(0, -P * 0.4); g.lineTo(-P * 0.14, -P * 0.1); g.fill();
  }
  g.fillStyle = '#fff';
  blob(g, 0, 0, P * 0.1, P * 0.1);
  g.restore();
  return c;
}

function acornSprite(P) {
  const c = canvas(P, P), g = c.getContext('2d');
  g.fillStyle = 'rgba(255,220,90,0.35)';
  blob(g, P / 2, P / 2, P * 0.45, P * 0.45);
  g.fillStyle = '#c98a1a';
  blob(g, P * 0.5, P * 0.58, P * 0.24, P * 0.26);
  g.fillStyle = '#ffd84a';
  blob(g, P * 0.48, P * 0.56, P * 0.2, P * 0.22);
  g.fillStyle = '#fff5c0';
  blob(g, P * 0.42, P * 0.52, P * 0.06, P * 0.08);
  g.fillStyle = '#8a5a16';
  g.beginPath(); g.ellipse(P * 0.5, P * 0.36, P * 0.28, P * 0.13, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(P * 0.48, P * 0.14, P * 0.05, P * 0.12);
  return c;
}

// ------------------------------------------------------------ decorations

function decoSprite(P, kind, L) {
  const c = canvas(P, P), g = c.getContext('2d');
  if (kind === D.CRYSTAL_UP || kind === D.CRYSTAL_DOWN) {
    if (kind === D.CRYSTAL_DOWN) { g.translate(0, P); g.scale(1, -1); }
    const cols = ['#c7a8ff', '#7fe6ff', '#ff9ee8'];
    for (const [x, h, w, ci] of [[0.3, 0.45, 0.12, 0], [0.5, 0.7, 0.15, 1], [0.7, 0.4, 0.11, 2]]) {
      g.fillStyle = cols[ci];
      g.beginPath();
      g.moveTo(P * (x - w), P);
      g.lineTo(P * (x - w * 0.6), P * (1 - h * 0.8));
      g.lineTo(P * x, P * (1 - h));
      g.lineTo(P * (x + w * 0.6), P * (1 - h * 0.8));
      g.lineTo(P * (x + w), P);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath(); g.moveTo(P * (x - w * 0.4), P); g.lineTo(P * x, P * (1 - h)); g.lineTo(P * (x - w * 0.1), P); g.fill();
    }
  } else if (kind === D.SHROOM) {
    for (const [x, h, r, col] of [[0.32, 0.42, 0.18, '#44f0d0'], [0.66, 0.3, 0.13, '#9dffb0']]) {
      g.fillStyle = '#d8fff4';
      g.fillRect(P * (x - 0.035), P * (1 - h), P * 0.07, P * h);
      g.fillStyle = col;
      g.beginPath(); g.ellipse(P * x, P * (1 - h), P * r, P * r * 0.7, 0, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      blob(g, P * (x - r * 0.4), P * (1 - h - r * 0.3), P * 0.025, P * 0.02);
      blob(g, P * (x + r * 0.3), P * (1 - h - r * 0.4), P * 0.02, P * 0.016);
    }
  } else if (kind === D.PILLAR) {
    g.fillStyle = '#8a7348';
    g.fillRect(P * 0.3, 0, P * 0.4, P);
    g.fillStyle = '#b39660';
    g.fillRect(P * 0.34, 0, P * 0.1, P);
    g.fillStyle = '#6a5636';
    g.fillRect(P * 0.6, 0, P * 0.06, P);
  } else if (kind === D.TORCH) {
    g.fillStyle = '#5a3a1a';
    g.fillRect(P * 0.45, P * 0.45, P * 0.1, P * 0.35);
    g.fillStyle = '#ff9a2e';
    blob(g, P * 0.5, P * 0.38, P * 0.1, P * 0.14);
    g.fillStyle = '#fff1a0';
    blob(g, P * 0.5, P * 0.41, P * 0.05, P * 0.07);
  } else if (kind === D.ROOTS) {
    g.strokeStyle = L.id === 'mushroom' ? 'rgba(160,255,220,0.7)' : 'rgba(220,180,120,0.75)';
    g.lineWidth = Math.max(1, P * 0.035);
    g.lineCap = 'round';
    for (const [x, len, bend] of [[0.25, 0.45, 0.1], [0.5, 0.3, -0.08], [0.72, 0.5, 0.06]]) {
      g.beginPath(); g.moveTo(P * x, 0); g.quadraticCurveTo(P * (x + bend), P * len * 0.6, P * (x - bend * 0.5), P * len); g.stroke();
    }
  }
  return c;
}

// ------------------------------------------------------------ lights

export function lightSprite(size) {
  const c = canvas(size, size), g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

export function glowSprite(size, color) {
  const c = canvas(size, size), g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, rgba(color, 0.55));
  grd.addColorStop(0.5, rgba(color, 0.18));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

// Vertical fade used as daylight leaking into the top rows.
export function skylightSprite() {
  const c = canvas(4, 128), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  return c;
}

// ------------------------------------------------------------ pod

// The pod body (without drill and propeller, which animate) for a paint.
export function podSprite(P, paint) {
  const S = Math.round(P * 1.2);
  const c = canvas(S, S), g = c.getContext('2d');
  const u = S / 100;
  let body = paint.body;
  if (paint.rainbow) {
    const grd = g.createLinearGradient(0, 30 * u, 100 * u, 70 * u);
    ['#ff6bd5', '#ffd84a', '#5ef2a0', '#5ec8ff', '#a77bff'].forEach((col, i) => grd.addColorStop(i / 4, col));
    body = grd;
  }
  // Treads.
  g.fillStyle = '#2b2533';
  rr(g, 14 * u, 70 * u, 72 * u, 18 * u, 9 * u);
  g.fill();
  g.fillStyle = '#4a4258';
  for (const x of [24, 40, 56, 72]) { g.beginPath(); g.arc(x * u, 79 * u, 5.5 * u, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#8c84a0';
  for (const x of [24, 40, 56, 72]) { g.beginPath(); g.arc(x * u, 79 * u, 2 * u, 0, Math.PI * 2); g.fill(); }
  // Body.
  g.fillStyle = paint.trim;
  rr(g, 12 * u, 40 * u, 76 * u, 36 * u, 14 * u);
  g.fill();
  g.fillStyle = body;
  rr(g, 12 * u, 38 * u, 76 * u, 32 * u, 14 * u);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  rr(g, 18 * u, 41 * u, 50 * u, 6 * u, 3 * u);
  g.fill();
  // Trim stripe and rivets.
  g.fillStyle = paint.trim;
  g.fillRect(12 * u, 60 * u, 76 * u, 4 * u);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (const x of [20, 34, 66, 80]) { g.beginPath(); g.arc(x * u, 52 * u, 1.8 * u, 0, Math.PI * 2); g.fill(); }
  // Headlight at the front (right side; the renderer flips for left).
  g.fillStyle = '#fff4b8';
  g.beginPath(); g.arc(84 * u, 50 * u, 5 * u, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd24a';
  g.beginPath(); g.arc(84 * u, 50 * u, 2.6 * u, 0, Math.PI * 2); g.fill();
  // Cockpit dome with Momo.
  g.fillStyle = 'rgba(160,220,255,0.35)';
  g.beginPath(); g.arc(46 * u, 38 * u, 20 * u, Math.PI, 0); g.closePath(); g.fill();
  momo(g, 46 * u, 33 * u, u);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2.2 * u;
  g.beginPath(); g.arc(46 * u, 38 * u, 20 * u, Math.PI, 0); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2 * u;
  g.beginPath(); g.arc(46 * u, 38 * u, 14 * u, Math.PI * 1.15, Math.PI * 1.45); g.stroke();
  g.fillStyle = paint.trim;
  g.fillRect(24 * u, 36 * u, 44 * u, 4 * u);
  return c;
}

// Momo the mole: round head, pink nose, tiny eyes, a miner's helmet.
export function momo(g, x, y, u) {
  g.fillStyle = '#5b4a5e';
  g.beginPath(); g.arc(x, y + 2 * u, 11 * u, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#7a6880';
  g.beginPath(); g.arc(x + 3 * u, y + 5 * u, 7 * u, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff8fb0';
  g.beginPath(); g.ellipse(x + 8 * u, y + 4 * u, 4.2 * u, 3.4 * u, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd0de';
  g.beginPath(); g.arc(x + 7 * u, y + 2.6 * u, 1.3 * u, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a1420';
  g.beginPath(); g.arc(x + 2 * u, y, 1.6 * u, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(x + 7.5 * u, y - 1.2 * u, 1.4 * u, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff9db8';
  g.globalAlpha = 0.6;
  g.beginPath(); g.arc(x + 1 * u, y + 5 * u, 2 * u, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  // Helmet.
  g.fillStyle = '#ffd24a';
  g.beginPath(); g.arc(x, y - 3 * u, 11 * u, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); g.fill();
  g.fillStyle = '#e09a1e';
  g.fillRect(x - 11 * u, y - 4.5 * u, 22 * u, 2.5 * u);
  g.fillStyle = '#fff6c8';
  g.beginPath(); g.arc(x + 3 * u, y - 9 * u, 3 * u, 0, Math.PI * 2); g.fill();
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

// ------------------------------------------------------------ surface

export function buildingSprites(P) {
  const out = {};
  // Gem shop: striped awning and a gem sign.
  {
    const w = P * 2.6, h = P * 2.4, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#f6e7c8'; g.fillRect(P * 0.2, P * 0.9, w - P * 0.4, h - P * 0.9);
    g.fillStyle = '#d9c39a'; g.fillRect(P * 0.2, h - P * 0.2, w - P * 0.4, P * 0.2);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#fff' : '#ff6b8b'; g.fillRect(P * 0.1 + i * (w - P * 0.2) / 6, P * 0.7, (w - P * 0.2) / 6 + 1, P * 0.35); }
    g.fillStyle = '#ff6b8b';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(P * 0.1 + (i + 0.5) * (w - P * 0.2) / 6, P * 1.05, (w - P * 0.2) / 12, 0, Math.PI); g.fill(); }
    g.fillStyle = '#7ad3ff'; g.fillRect(P * 0.55, P * 1.35, P * 0.7, P * 0.6);
    g.fillStyle = '#6b4a2c'; g.fillRect(P * 1.5, P * 1.35, P * 0.6, h - P * 1.55);
    g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(P * 2.0, P * 1.9, P * 0.05, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a3a6e'; rr(g, P * 0.5, P * 0.05, P * 1.6, P * 0.55, P * 0.15); g.fill();
    g.fillStyle = '#c66bff'; star(g, P * 0.8, P * 0.33, P * 0.18);
    g.fillStyle = '#fff'; g.font = `800 ${Math.round(P * 0.28)}px ui-rounded, system-ui, sans-serif`; g.textBaseline = 'middle';
    g.fillText('GEMS', P * 1.05, P * 0.34);
    out.shop = c;
  }
  // Fuel pump.
  {
    const w = P * 1.2, h = P * 1.7, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#e83c3c'; rr(g, P * 0.2, P * 0.25, P * 0.7, h - P * 0.25, P * 0.12); g.fill();
    g.fillStyle = '#fff'; rr(g, P * 0.3, P * 0.4, P * 0.5, P * 0.35, P * 0.06); g.fill();
    g.fillStyle = '#333'; g.font = `800 ${Math.round(P * 0.22)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('⛽', P * 0.55, P * 0.58);
    g.strokeStyle = '#2b2533'; g.lineWidth = P * 0.07; g.beginPath(); g.moveTo(P * 0.9, P * 0.9); g.quadraticCurveTo(P * 1.15, P * 1.1, P * 1.0, P * 1.4); g.stroke();
    g.fillStyle = '#b02222'; g.fillRect(P * 0.2, h - P * 0.15, P * 0.7, P * 0.15);
    out.pump = c;
  }
  // Workshop: a little barn with a gear.
  {
    const w = P * 2.6, h = P * 2.5, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#c0583a'; g.beginPath(); g.moveTo(P * 0.1, P * 1.0); g.lineTo(w / 2, P * 0.15); g.lineTo(w - P * 0.1, P * 1.0); g.fill();
    g.fillStyle = '#e07a52'; g.fillRect(P * 0.25, P * 0.95, w - P * 0.5, h - P * 0.95);
    g.fillStyle = '#fff2dc'; g.fillRect(P * 0.85, P * 1.35, P * 0.9, h - P * 1.35);
    g.strokeStyle = '#c0583a'; g.lineWidth = P * 0.07;
    g.beginPath(); g.moveTo(P * 0.85, P * 1.35); g.lineTo(P * 1.75, h); g.moveTo(P * 1.75, P * 1.35); g.lineTo(P * 0.85, h); g.stroke();
    // Gear.
    g.save(); g.translate(w / 2, P * 0.68); g.fillStyle = '#ffd24a';
    for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.fillRect(-P * 0.05, -P * 0.24, P * 0.1, P * 0.1); }
    g.beginPath(); g.arc(0, 0, P * 0.17, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c0583a'; g.beginPath(); g.arc(0, 0, P * 0.07, 0, Math.PI * 2); g.fill();
    g.restore();
    out.workshop = c;
  }
  // Museum: little temple with columns.
  {
    const w = P * 2.4, h = P * 2.4, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#efe6d2'; g.beginPath(); g.moveTo(P * 0.05, P * 0.85); g.lineTo(w / 2, P * 0.25); g.lineTo(w - P * 0.05, P * 0.85); g.fill();
    g.fillStyle = '#d7c9a8'; g.fillRect(P * 0.1, P * 0.85, w - P * 0.2, P * 0.18);
    g.fillStyle = '#f7f0e0';
    for (let i = 0; i < 4; i++) g.fillRect(P * 0.3 + i * P * 0.55, P * 1.03, P * 0.25, h - P * 1.25);
    g.fillStyle = '#d7c9a8'; g.fillRect(P * 0.05, h - P * 0.22, w - P * 0.1, P * 0.22);
    g.fillStyle = '#a8977a'; g.font = `900 ${Math.round(P * 0.3)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('🦴', w / 2, P * 0.62);
    out.museum = c;
  }
  return out;
}

export function cloudSprite(P, k) {
  const w = P * (3 + k), h = P * 1.4, c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.92)';
  const rng = makeRng(`cloud${k}`);
  for (let i = 0; i < 5; i++) blob(g, w * (0.2 + i * 0.15), h * (0.55 + (rng() - 0.5) * 0.2), h * (0.28 + rng() * 0.12), h * (0.25 + rng() * 0.1));
  g.fillRect(w * 0.18, h * 0.6, w * 0.64, h * 0.3);
  return c;
}

export function hillsSprite(w, h, color, seed, bumps) {
  const c = canvas(w, h), g = c.getContext('2d');
  const rng = makeRng(seed);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, h);
  const pts = bumps * 4;
  const phase = [];
  for (let i = 0; i < 3; i++) phase.push(rng() * Math.PI * 2);
  for (let i = 0; i <= pts; i++) {
    const t = i / pts;
    const y = h * (0.45 + 0.2 * Math.sin(t * Math.PI * 2 * bumps + phase[0]) + 0.1 * Math.sin(t * Math.PI * 2 * bumps * 2.3 + phase[1]));
    g.lineTo(t * w, y);
  }
  g.lineTo(w, h);
  g.fill();
  return c;
}

export function skySprite(h) {
  const c = canvas(4, h), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#5fb7ff');
  grd.addColorStop(0.65, '#a6dcff');
  grd.addColorStop(1, '#ffe9c2');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, h);
  return c;
}

export function sunSprite(P) {
  const S = P * 3, c = canvas(S, S), g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,248,200,1)');
  grd.addColorStop(0.25, 'rgba(255,230,120,1)');
  grd.addColorStop(0.32, 'rgba(255,220,120,0.45)');
  grd.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return c;
}

// Wiggles the worm: pink, striped, friendly.
export function wormSprite(P) {
  const w = P * 1.4, h = P * 2.2, c = canvas(w, h), g = c.getContext('2d');
  const u = P / 100;
  for (let i = 5; i >= 0; i--) {
    g.fillStyle = i % 2 ? '#ff8fb0' : '#ff7aa2';
    blob(g, w / 2 + Math.sin(i * 0.9) * 6 * u, h - 22 * u - i * 26 * u, 34 * u, 20 * u);
  }
  const hx = w / 2 + Math.sin(5 * 0.9) * 6 * u, hy = h - 22 * u - 5 * 26 * u - 14 * u;
  g.fillStyle = '#ff9dbb';
  blob(g, hx, hy, 36 * u, 32 * u);
  g.fillStyle = '#fff';
  blob(g, hx - 12 * u, hy - 6 * u, 9 * u, 10 * u);
  blob(g, hx + 12 * u, hy - 6 * u, 9 * u, 10 * u);
  g.fillStyle = '#2a1a2a';
  blob(g, hx - 10 * u, hy - 4 * u, 4.5 * u, 5.5 * u);
  blob(g, hx + 14 * u, hy - 4 * u, 4.5 * u, 5.5 * u);
  g.strokeStyle = '#a03a5a'; g.lineWidth = 4 * u; g.lineCap = 'round';
  g.beginPath(); g.arc(hx + 2 * u, hy + 8 * u, 10 * u, 0.2, Math.PI - 0.2); g.stroke();
  // A little flat cap.
  g.fillStyle = '#4fa3ff';
  g.beginPath(); g.ellipse(hx, hy - 26 * u, 30 * u, 10 * u, 0, Math.PI, 0); g.fill();
  g.fillRect(hx - 2 * u, hy - 28 * u, 38 * u, 6 * u);
  return c;
}

// ------------------------------------------------------------ sheet

// All tile art for one tile size, grouped for the chunk baker.
export function bakeSheet(P) {
  const sheet = { P, layers: [], ores: [], relics: [], deco: [] };
  LAYERS.forEach((L, li) => {
    sheet.layers.push({
      solid: [0, 1, 2, 3].map((v) => solidTile(P, L, li, v)),
      bg: [0, 1].map((v) => bgTile(P, L, li, v)),
      bounce: L.id === 'mushroom' ? bounceSprite(P, L) : null,
      deco: [null, D.CRYSTAL_UP, D.CRYSTAL_DOWN, D.SHROOM, D.PILLAR, D.TORCH, D.ROOTS].map((k) => (k ? decoSprite(P, k, L) : null)),
      edgeLight: L.colors.light,
      edgeDark: L.colors.edge,
    });
  });
  ORES.forEach((o, k) => sheet.ores.push(oreSprite(P, o, k)));
  for (let s = 0; s < 6; s++) sheet.relics.push(relicSprite(P, s));
  sheet.fuel = fuelSprite(P);
  sheet.gas = gasTell(P);
  sheet.boulder = boulderSprite(P);
  sheet.lava = [0, 1, 2].map((v) => lavaSprite(P, v));
  sheet.cooled = cooledSprite(P);
  sheet.brick = brickSprite(P);
  sheet.pad = padSprite(P);
  sheet.bedrock = bedrockSprite(P);
  sheet.core = coreSprite(P);
  sheet.acorn = acornSprite(P);
  return sheet;
}

export function paintSprites(P) {
  const out = {};
  for (const p of PAINTS) out[p.id] = podSprite(P, p);
  return out;
}

export { T, rgba, shade };
