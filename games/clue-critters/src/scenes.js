// Painted Whiskerton places. Each place draws into a 1000×1000 "core" that
// holds everything you can tap; wide screens get extra scenery to the sides.
// Layers are baked once per place and size: back (sky, buildings, ground)
// and front (the six searchable props). Moving bits are drawn per frame.
import { makeCanvas, shade, star } from './art.js';
import { Rng, hashString } from './rng.js';

const INK = '#3a2a35';
export const HORIZON = 560;
// The tappable core: wide screens see x 0..1000, y 30..1000; tall phone
// screens see a narrower, taller slice with the props stacked in rows.
export const CORE = { x0: 0, x1: 1000, top: 30, bottom: 1000 };
export const TALL_CORE = { x0: 200, x1: 800, top: 30, bottom: 1300 };
// Very short, wide views (a phone on its side) crop the sky and roofs.
export const SHORT_CORE = { x0: 0, x1: 1000, top: 330, bottom: 1000 };

function p(ctx, fill, stroke = INK, lw = 4) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
}
// A union of shapes (bushes, tree tops): stroke wide first, then fill, so
// only the outer outline shows.
function pu(ctx, fill, lw = 4) {
  ctx.strokeStyle = INK; ctx.lineWidth = lw * 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = fill; ctx.fill();
}
function el(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

const SKIES = {
  day: ['#8fd3ff', '#cdeeff', '#fff4d6'],
  gold: ['#ffb37a', '#ffd9a0', '#fff1c9'],
};

// ------------------------------------------------------------ scenery bits

function sky(ctx, x0, x1, kind, rng) {
  const [a, b, c] = SKIES[kind] || SKIES.day;
  const g = ctx.createLinearGradient(0, -400, 0, HORIZON);
  g.addColorStop(0, a); g.addColorStop(0.7, b); g.addColorStop(1, c);
  ctx.fillStyle = g; ctx.fillRect(x0, -1200, x1 - x0, HORIZON + 1200);
  el(ctx, 830, 120, 60, 60); p(ctx, kind === 'gold' ? '#ffe28a' : '#fff6b0', null);
  el(ctx, 830, 120, 90, 90); p(ctx, 'rgba(255,246,176,0.35)', null);
  for (let x = x0 - 100; x < x1; x += 260 + rng.int(160)) {
    const y = 40 + rng.int(220);
    hill(ctx, x, y, 'rgba(255,255,255,0.85)', 1);
  }
  function hill(c2, x, y, fill) {
    c2.beginPath();
    c2.arc(x, y, 34, Math.PI * 0.5, Math.PI * 1.5); c2.arc(x + 40, y - 22, 38, Math.PI, Math.PI * 1.9);
    c2.arc(x + 90, y - 6, 32, Math.PI * 1.3, Math.PI * 0.5); c2.closePath();
    p(c2, fill, null);
  }
}

function hills(ctx, x0, x1, rng, kind) {
  const far = kind === 'gold' ? '#b9d98a' : '#a8dc8a';
  const near = kind === 'gold' ? '#9fcf6a' : '#8fd06b';
  for (const [col, base, amp] of [[far, HORIZON - 70, 60], [near, HORIZON - 20, 40]]) {
    ctx.beginPath(); ctx.moveTo(x0, HORIZON + 10);
    for (let x = x0; x <= x1 + 80; x += 80) ctx.lineTo(x, base - Math.abs(Math.sin((x + rng.int(50)) / 210)) * amp);
    ctx.lineTo(x1, HORIZON + 10); ctx.closePath(); p(ctx, col, null);
  }
}

function ground(ctx, x0, x1, kind, pathColor) {
  const g = ctx.createLinearGradient(0, HORIZON, 0, 1400);
  g.addColorStop(0, kind === 'gold' ? '#8fcb5a' : '#7fcf5f'); g.addColorStop(1, '#5aa845');
  ctx.fillStyle = g; ctx.fillRect(x0, HORIZON, x1 - x0, 1400);
  if (pathColor) {
    ctx.beginPath(); ctx.moveTo(400, HORIZON + 40); ctx.quadraticCurveTo(300, 800, 160, 1400); ctx.lineTo(840, 1400); ctx.quadraticCurveTo(700, 800, 600, HORIZON + 40); ctx.closePath();
    p(ctx, pathColor, null);
    ctx.fillStyle = shade(pathColor, -0.1);
    for (let i = 0; i < 40; i++) {
      const t = i / 40; const y = HORIZON + 60 + t * 700; const w = 200 + t * 420;
      el(ctx, 500 + Math.sin(i * 2.3) * w * 0.35, y, 14 + t * 18, 6 + t * 7); ctx.fill();
    }
  }
}

function tree(ctx, x, y, s = 1, fruit = null) {
  rr(ctx, x - 14 * s, y - 120 * s, 28 * s, 124 * s, 8 * s); p(ctx, '#9a6a3f');
  ctx.beginPath();
  for (const [dx, dy, r] of [[0, -200, 80], [-60, -150, 62], [60, -150, 62], [-30, -240, 56], [36, -236, 56]]) ctx.moveTo(x + (dx + r) * s, y + dy * s), ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
  pu(ctx, '#5fbf5a');
  el(ctx, x - 24 * s, y - 214 * s, 26 * s, 18 * s); p(ctx, 'rgba(255,255,255,0.18)', null);
  if (fruit) for (const [dx, dy] of [[-40, -160], [30, -200], [-10, -240], [60, -140], [-70, -200], [10, -150]]) { el(ctx, x + dx * s, y + dy * s, 11 * s, 11 * s); p(ctx, fruit, INK, 2.5); }
}

function house(ctx, x, y, w, h, wall, roof, rng) {
  rr(ctx, x, y - h, w, h, 6); p(ctx, wall);
  ctx.beginPath(); ctx.moveTo(x - 16, y - h + 4); ctx.lineTo(x + w / 2, y - h - w * 0.45); ctx.lineTo(x + w + 16, y - h + 4); ctx.closePath(); p(ctx, roof);
  rr(ctx, x + w * 0.36, y - h * 0.48, w * 0.28, h * 0.48, 4); p(ctx, shade(wall, -0.35));
  if (rng.chance(0.7)) { rr(ctx, x + w * 0.1, y - h * 0.8, w * 0.22, w * 0.2, 3); p(ctx, '#fff3c4'); }
}

function fence(ctx, x0, x1, y) {
  ctx.beginPath(); ctx.moveTo(x0, y - 40); ctx.lineTo(x1, y - 40); ctx.moveTo(x0, y - 18); ctx.lineTo(x1, y - 18); p(ctx, null, '#fff8ee', 8);
  for (let x = x0; x <= x1; x += 40) { rr(ctx, x - 6, y - 62, 12, 64, 4); p(ctx, '#fff8ee', INK, 3); }
}

function flowers(ctx, x, y, n, rng) {
  for (let i = 0; i < n; i++) {
    const fx = x + rng.range(-60, 60), fy = y + rng.range(-14, 14);
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 26); p(ctx, null, '#3f9a3a', 3);
    el(ctx, fx, fy - 30, 8, 8); p(ctx, rng.pick(['#ff86b8', '#ffd23f', '#fff', '#a97ae0', '#ff9b5c']), INK, 2);
  }
}

function sign(ctx, x, y, w, text, color = '#fff8ee', ink = INK) {
  rr(ctx, x - w / 2, y - 34, w, 68, 14); p(ctx, color);
  ctx.fillStyle = ink; ctx.font = '800 38px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 2);
}

function awning(ctx, x, y, w, c1, c2 = '#fff') {
  const n = Math.max(3, Math.round(w / 50));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    ctx.beginPath(); ctx.moveTo(x + i * sw, y); ctx.lineTo(x + (i + 1) * sw, y); ctx.lineTo(x + (i + 1) * sw, y + 50);
    ctx.quadraticCurveTo(x + (i + 0.5) * sw, y + 76, x + i * sw, y + 50); ctx.closePath(); p(ctx, i % 2 ? c2 : c1, INK, 3);
  }
}

function windows(ctx, x, y, cols, rows, w, h, gap, color = '#fff3c4') {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    rr(ctx, x + c * (w + gap), y + r * (h + gap), w, h, 8); p(ctx, color);
    ctx.beginPath(); ctx.moveTo(x + c * (w + gap) + w / 2, y + r * (h + gap)); ctx.lineTo(x + c * (w + gap) + w / 2, y + r * (h + gap) + h); p(ctx, null, INK, 3);
  }
}

function lamp(ctx, x, y) {
  rr(ctx, x - 5, y - 200, 10, 200, 4); p(ctx, '#3a3a48');
  rr(ctx, x - 16, y - 232, 32, 36, 8); p(ctx, '#ffe680');
  ctx.beginPath(); ctx.moveTo(x - 20, y - 232); ctx.lineTo(x, y - 252); ctx.lineTo(x + 20, y - 232); ctx.closePath(); p(ctx, '#3a3a48');
}

// --------------------------------------------------------------- props
//
// Each prop draws with its base centred on (0, 0) and returns its box
// { w, h } in core units (the searchable area).

export const PROPS = {
  bush(ctx) { ctx.beginPath(); for (const [x, y, r] of [[-50, -40, 46], [0, -66, 56], [52, -40, 46], [0, -30, 50]]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); } pu(ctx, '#4fae4a'); el(ctx, -14, -86, 18, 12); p(ctx, 'rgba(255,255,255,0.2)', null); return { w: 200, h: 130 }; },
  barrel(ctx) { rr(ctx, -46, -124, 92, 124, 26); p(ctx, '#b07a44'); for (const y of [-100, -24]) { rr(ctx, -48, y, 96, 12, 4); p(ctx, '#6a6a78'); } return { w: 100, h: 128 }; },
  crate(ctx) { rr(ctx, -62, -110, 124, 110, 6); p(ctx, '#d9a65a'); ctx.beginPath(); ctx.moveTo(-58, -106); ctx.lineTo(58, -4); ctx.moveTo(58, -106); ctx.lineTo(-58, -4); p(ctx, null, '#a8763a', 6); rr(ctx, -62, -110, 124, 110, 6); p(ctx, null); return { w: 128, h: 112 }; },
  flowerpot(ctx) { ctx.beginPath(); ctx.moveTo(-44, -70); ctx.lineTo(44, -70); ctx.lineTo(32, 0); ctx.lineTo(-32, 0); ctx.closePath(); p(ctx, '#e0784a'); rr(ctx, -50, -84, 100, 18, 6); p(ctx, '#e88a5a'); for (const [x, c] of [[-24, '#ff86b8'], [0, '#ffd23f'], [24, '#a97ae0']]) { ctx.beginPath(); ctx.moveTo(x, -84); ctx.lineTo(x, -134); p(ctx, null, '#3f9a3a', 5); el(ctx, x, -140, 15, 15); p(ctx, c); el(ctx, x, -140, 5, 5); p(ctx, '#fff3a0', null); } return { w: 110, h: 160 }; },
  bench(ctx) { rr(ctx, -100, -78, 200, 18, 6); p(ctx, '#c98a4a'); rr(ctx, -100, -122, 200, 16, 6); p(ctx, '#c98a4a'); for (const x of [-84, 84]) { rr(ctx, x - 6, -120, 12, 120, 4); p(ctx, '#3a3a48'); } return { w: 210, h: 126 }; },
  mailbox(ctx) { rr(ctx, -8, -90, 16, 90, 4); p(ctx, '#7a4a28'); ctx.beginPath(); ctx.moveTo(-40, -90); ctx.lineTo(-40, -130); ctx.arc(0, -130, 40, Math.PI, 0); ctx.lineTo(40, -90); ctx.closePath(); p(ctx, '#e8524a'); rr(ctx, 36, -150, 8, 34, 2); p(ctx, '#ffd23f'); return { w: 100, h: 176 }; },
  haybale(ctx) { rr(ctx, -80, -100, 160, 100, 22); p(ctx, '#f2c94c'); ctx.beginPath(); for (let x = -64; x <= 64; x += 16) { ctx.moveTo(x, -92); ctx.lineTo(x + 6, -8); } p(ctx, null, '#c99a2a', 3); rr(ctx, -80, -60, 160, 10, 3); p(ctx, '#a8763a', null); return { w: 166, h: 104 }; },
  rock(ctx) { ctx.beginPath(); ctx.moveTo(-74, 0); ctx.quadraticCurveTo(-80, -70, -20, -88); ctx.quadraticCurveTo(50, -100, 72, -30); ctx.quadraticCurveTo(80, 0, 60, 0); ctx.closePath(); p(ctx, '#a9a3b5'); el(ctx, -14, -60, 22, 10, -0.3); p(ctx, 'rgba(255,255,255,0.35)', null); return { w: 160, h: 100 }; },
  sack(ctx) { ctx.beginPath(); ctx.moveTo(-50, 0); ctx.quadraticCurveTo(-64, -80, -22, -104); ctx.lineTo(-30, -126); ctx.lineTo(30, -126); ctx.lineTo(22, -104); ctx.quadraticCurveTo(64, -80, 50, 0); ctx.closePath(); p(ctx, '#e3cfa0'); ctx.beginPath(); ctx.moveTo(-24, -106); ctx.lineTo(24, -106); p(ctx, null, '#a8763a', 6); return { w: 116, h: 130 }; },
  log(ctx) { rr(ctx, -96, -70, 192, 70, 34); p(ctx, '#a8763a'); el(ctx, 80, -35, 26, 34); p(ctx, '#e3b26a'); el(ctx, 80, -35, 12, 16); p(ctx, null, '#a8763a', 3); for (const x of [-50, 0]) { el(ctx, x, -76, 12, 8); p(ctx, '#ff6f61'); } return { w: 200, h: 84 }; },
  cart(ctx) { rr(ctx, -90, -120, 180, 70, 8); p(ctx, '#7fbfe8'); for (const [x, c] of [[-56, '#e8524a'], [-20, '#ffd23f'], [16, '#7fd36b'], [52, '#ff9b5c']]) { el(ctx, x, -126, 18, 16); p(ctx, c, INK, 3); } for (const x of [-58, 58]) { el(ctx, x, -36, 34, 34); p(ctx, '#fff8ee'); el(ctx, x, -36, 8, 8); p(ctx, INK, null); } return { w: 200, h: 166 }; },
  pumpkin(ctx) { for (const [x, r] of [[-28, 38], [28, 38], [0, 46]]) { el(ctx, x, -44, r, 44); p(ctx, '#ff9b2f'); } rr(ctx, -6, -104, 12, 20, 4); p(ctx, '#5a8a3a'); return { w: 150, h: 108 }; },
  reeds(ctx) { for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 16, 0); ctx.quadraticCurveTo(i * 22, -80, i * 26, -150 + Math.abs(i) * 14); p(ctx, null, '#3f9a3a', 7); if (i % 2 === 0) { rr(ctx, i * 26 - 7, -160 + Math.abs(i) * 14, 14, 40, 7); p(ctx, '#8a5a32'); } } return { w: 170, h: 170 }; },
  books(ctx) { for (const [y, w, c] of [[-30, 130, '#a97ae0'], [-60, 116, '#6fb7ff'], [-90, 124, '#5fc98c'], [-120, 100, '#ff9b5c']]) { rr(ctx, -w / 2 + (y % 20), y, w, 30, 4); p(ctx, c); rr(ctx, -w / 2 + (y % 20) + 8, y + 10, w - 30, 8, 2); p(ctx, 'rgba(255,255,255,0.6)', null); } return { w: 140, h: 124 }; },
  table(ctx) { rr(ctx, -6, -110, 12, 110, 4); p(ctx, '#fff8ee'); el(ctx, 0, -110, 76, 18); p(ctx, '#fff8ee'); ctx.beginPath(); ctx.moveTo(-90, -230); ctx.quadraticCurveTo(0, -300, 90, -230); ctx.closePath(); p(ctx, '#ff86b8'); rr(ctx, -3, -236, 6, 126, 2); p(ctx, '#3a3a48', null); return { w: 180, h: 300 }; },
  suitcase(ctx) { rr(ctx, -70, -100, 140, 100, 14); p(ctx, '#c9673a'); ctx.beginPath(); ctx.arc(0, -100, 22, Math.PI, 0); p(ctx, null, '#7a4a28', 8); rr(ctx, -70, -60, 140, 10, 2); p(ctx, '#7a4a28', null); el(ctx, -30, -76, 14, 10); p(ctx, '#fff3a0', null); return { w: 144, h: 126 }; },
  wheelbarrow(ctx) { ctx.beginPath(); ctx.moveTo(-90, -110); ctx.lineTo(70, -110); ctx.lineTo(40, -50); ctx.lineTo(-70, -50); ctx.closePath(); p(ctx, '#5fc98c'); el(ctx, 54, -30, 30, 30); p(ctx, '#3a3a48'); ctx.beginPath(); ctx.moveTo(-70, -60); ctx.lineTo(-110, -40); ctx.moveTo(-60, -50); ctx.lineTo(-60, 0); p(ctx, null, '#7a4a28', 7); for (const [x, c] of [[-40, '#ff86b8'], [0, '#ffd23f'], [36, '#e8524a']]) { el(ctx, x, -118, 16, 14); p(ctx, c, INK, 3); } return { w: 210, h: 140 }; },
};

// ------------------------------------------------------------ the places
//
// slots: six props { type, x, y } (y is the base); stand: where the suspect
// stands (feet). Coordinates in the 1000×1000 core.

const SLOTS = [
  [140, 700], [360, 650], [870, 700], [180, 950], [420, 975], [855, 965],
];
const TALL_SLOTS = [
  [305, 720], [690, 730], [305, 975], [300, 1270], [500, 1285], [695, 1275],
];

export const PLACE_ART = {
  bakery: {
    sky: 'day', path: '#e9d4b0', props: ['barrel', 'flowerpot', 'sack', 'crate', 'bush', 'bench'],
    draw(ctx, rng) {
      house(ctx, -260, HORIZON + 10, 180, 200, '#ffe0b0', '#c9673a', rng);
      rr(ctx, 250, 170, 500, 400, 10); p(ctx, '#fff1d6');
      ctx.beginPath(); ctx.moveTo(220, 180); ctx.lineTo(500, 40); ctx.lineTo(780, 180); ctx.closePath(); p(ctx, '#c9673a');
      rr(ctx, 640, 60, 50, 100, 4); p(ctx, '#b0583a');
      awning(ctx, 250, 260, 500, '#ff9fb2');
      rr(ctx, 290, 360, 200, 140, 10); p(ctx, '#bfe3ff');
      for (const [x, y] of [[330, 470], [390, 460], [450, 470]]) { el(ctx, x, y, 26, 16); p(ctx, '#e9a35a'); }
      rr(ctx, 560, 360, 130, 210, 10); p(ctx, '#c9875a'); el(ctx, 666, 470, 7, 7); p(ctx, '#ffd23f');
      sign(ctx, 500, 220, 280, 'BAKERY', '#fff8ee', '#c9673a');
    },
  },
  pond: {
    sky: 'day', path: null, props: ['reeds', 'rock', 'log', 'bush', 'reeds', 'rock'], stand: { x: 650, y: 935 },
    draw(ctx, rng) {
      tree(ctx, 120, HORIZON + 40, 1.1); tree(ctx, 1150, HORIZON + 60, 1.3); tree(ctx, -200, HORIZON + 30, 1);
      el(ctx, 520, 700, 380, 120); p(ctx, '#6fc3ff', '#3a8ac9', 6);
      el(ctx, 520, 700, 310, 86); p(ctx, '#8fd3ff', null);
      for (const [x, y] of [[360, 680], [700, 720], [520, 650]]) { el(ctx, x, y, 40, 16); p(ctx, '#5fbf5a', INK, 3); el(ctx, x + 10, y - 6, 9, 9); p(ctx, '#ff86b8', INK, 2); }
      rr(ctx, 700, 600, 220, 26, 6); p(ctx, '#c98a4a'); for (const x of [730, 800, 880]) { rr(ctx, x, 620, 14, 50, 3); p(ctx, '#a8763a'); }
      house(ctx, 1260, HORIZON + 20, 160, 180, '#cfe8ff', '#6fa3d9', rng);
    },
    dynamic(ctx, t) { for (let i = 0; i < 3; i++) { const x = 470 + i * 46 + Math.sin(t * 0.7 + i) * 10; const y = 712 + Math.sin(t * 2 + i) * 3; el(ctx, x, y, 16, 11); p(ctx, '#ffd84d', INK, 3); el(ctx, x + 12, y - 12, 9, 9); p(ctx, '#ffd84d', INK, 3); el(ctx, x + 21, y - 11, 6, 3); p(ctx, '#ff9b2f', null); } },
  },
  windmill: {
    sky: 'day', path: '#e3cfa0', props: ['haybale', 'sack', 'wheelbarrow', 'haybale', 'rock', 'sack'],
    draw(ctx, rng) {
      el(ctx, 520, HORIZON + 30, 420, 120); p(ctx, '#8fd06b', null);
      ctx.beginPath(); ctx.moveTo(400, HORIZON + 20); ctx.lineTo(430, 220); ctx.lineTo(610, 220); ctx.lineTo(640, HORIZON + 20); ctx.closePath(); p(ctx, '#fff1d6');
      ctx.beginPath(); ctx.moveTo(410, 230); ctx.lineTo(520, 120); ctx.lineTo(630, 230); ctx.closePath(); p(ctx, '#c9673a');
      rr(ctx, 488, 440, 64, 130, 30); p(ctx, '#a8763a');
      rr(ctx, 495, 300, 50, 50, 25); p(ctx, '#bfe3ff');
      fence(ctx, -300, 300, HORIZON + 60); fence(ctx, 740, 1300, HORIZON + 60);
      house(ctx, 1150, HORIZON + 20, 150, 150, '#ffd0d0', '#a8452a', rng);
    },
    dynamic(ctx, t) {
      ctx.save(); ctx.translate(520, 200); ctx.rotate(t * 0.6);
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); rr(ctx, -22, -250, 44, 220, 8); p(ctx, '#fff8ee'); ctx.beginPath(); for (let y = -230; y < -40; y += 30) { ctx.moveTo(-22, y); ctx.lineTo(22, y); } p(ctx, null, '#c9a46a', 2); }
      el(ctx, 0, 0, 22, 22); p(ctx, '#7a4a28');
      ctx.restore();
    },
  },
  bandstand: {
    sky: 'gold', path: '#e9d4b0', props: ['bench', 'bush', 'flowerpot', 'bush', 'flowerpot', 'bench'],
    draw(ctx, rng) {
      tree(ctx, 60, HORIZON + 20, 1); tree(ctx, 960, HORIZON + 30, 1.05);
      rr(ctx, 230, 480, 540, 70, 12); p(ctx, '#c9a46a');
      for (const x of [260, 380, 500, 620, 740]) { rr(ctx, x - 9, 260, 18, 230, 6); p(ctx, '#fff8ee'); }
      ctx.beginPath(); ctx.moveTo(200, 270); ctx.quadraticCurveTo(500, 60, 800, 270); ctx.closePath(); p(ctx, '#ff86b8');
      ctx.beginPath(); ctx.moveTo(200, 270); ctx.lineTo(800, 270); p(ctx, null, '#fff', 10);
      el(ctx, 500, 110, 14, 14); p(ctx, '#ffd23f');
      ctx.beginPath(); ctx.moveTo(260, 300); for (let i = 0; i < 8; i++) { const x0 = 260 + i * 60; ctx.quadraticCurveTo(x0 + 30, 340, x0 + 60, 300); } p(ctx, null, INK, 2);
      for (let i = 0; i < 8; i++) { const x0 = 275 + i * 60; ctx.beginPath(); ctx.moveTo(x0, 312); ctx.lineTo(x0 + 30, 312); ctx.lineTo(x0 + 15, 340); ctx.closePath(); p(ctx, ['#6fb7ff', '#ffd23f', '#5fc98c', '#ff9b5c'][i % 4], INK, 2); }
      lamp(ctx, -120, HORIZON + 80); lamp(ctx, 1130, HORIZON + 80);
    },
  },
  library: {
    sky: 'day', path: '#d9d0e6', props: ['books', 'bench', 'flowerpot', 'bush', 'books', 'bush'],
    draw(ctx, rng) {
      house(ctx, -280, HORIZON + 10, 200, 220, '#e8f0ff', '#6a5aa8', rng);
      rr(ctx, 200, 200, 600, 370, 8); p(ctx, '#efe6ff');
      ctx.beginPath(); ctx.moveTo(170, 210); ctx.lineTo(500, 70); ctx.lineTo(830, 210); ctx.closePath(); p(ctx, '#a97ae0');
      el(ctx, 500, 150, 34, 34); p(ctx, '#fff3c4');
      for (const x of [250, 370, 630, 750]) { rr(ctx, x - 16, 220, 32, 340, 8); p(ctx, '#fff8ee'); }
      rr(ctx, 440, 400, 120, 170, 60); p(ctx, '#7a4a8a');
      windows(ctx, 290, 280, 1, 1, 60, 90, 0); windows(ctx, 650, 280, 1, 1, 60, 90, 0);
      sign(ctx, 500, 250, 240, 'LIBRARY', '#fff8ee', '#6a5aa8');
    },
  },
  garden: {
    sky: 'day', path: '#e3cfa0', props: ['flowerpot', 'bush', 'wheelbarrow', 'flowerpot', 'bush', 'pumpkin'],
    draw(ctx, rng) {
      fence(ctx, -300, 1300, HORIZON + 30);
      for (let x = -260; x < 1300; x += 170) flowers(ctx, x, HORIZON + 70, 6, rng);
      ctx.beginPath(); ctx.moveTo(380, HORIZON + 50); ctx.lineTo(380, 300); ctx.arc(500, 300, 120, Math.PI, 0); ctx.lineTo(620, HORIZON + 50); p(ctx, null, '#3f9a3a', 22);
      for (let i = 0; i < 12; i++) { const a = Math.PI + (i / 11) * Math.PI; el(ctx, 500 + Math.cos(a) * 120, 300 + Math.sin(a) * 120, 14, 14); p(ctx, i % 2 ? '#ff86b8' : '#ff6f9f', INK, 2); }
      for (const y of [400, 470]) { el(ctx, 380, y, 12, 12); p(ctx, '#ff86b8', INK, 2); el(ctx, 620, y + 20, 12, 12); p(ctx, '#ff86b8', INK, 2); }
      tree(ctx, 120, HORIZON + 30, 0.9); tree(ctx, 900, HORIZON + 30, 0.95);
      rr(ctx, 1080, 330, 180, 230, 6); p(ctx, 'rgba(200,240,255,0.8)');
    },
  },
  market: {
    sky: 'gold', path: '#e9d4b0', props: ['crate', 'cart', 'sack', 'barrel', 'crate', 'pumpkin'],
    draw(ctx, rng) {
      house(ctx, -280, HORIZON + 10, 190, 200, '#ffe0b0', '#d9534f', rng);
      house(ctx, 1080, HORIZON + 10, 190, 220, '#e0f0d0', '#5a8a3a', rng);
      for (const [x, c] of [[140, '#ff9b5c'], [400, '#6fb7ff'], [660, '#e8524a']]) {
        for (const dx of [10, 190]) { rr(ctx, x + dx, 320, 12, 240, 4); p(ctx, '#a8763a'); }
        awning(ctx, x - 10, 290, 230, c);
        rr(ctx, x, 470, 210, 90, 6); p(ctx, '#e3b26a');
        for (let i = 0; i < 5; i++) { el(ctx, x + 30 + i * 38, 466, 17, 15); p(ctx, ['#e8524a', '#ffd23f', '#7fd36b', '#ff9b2f', '#a97ae0'][(i + x) % 5], INK, 3); }
      }
      sign(ctx, 500, 230, 250, 'MARKET', '#fff8ee', '#c9673a');
    },
  },
  townhall: {
    sky: 'day', path: '#d9d4c8', props: ['flowerpot', 'bench', 'mailbox', 'bush', 'flowerpot', 'bush'],
    draw(ctx, rng) {
      house(ctx, -270, HORIZON + 10, 180, 200, '#fff0e0', '#8a6a42', rng);
      rr(ctx, 210, 250, 580, 320, 6); p(ctx, '#f2e2cc');
      rr(ctx, 420, 90, 160, 170, 6); p(ctx, '#f2e2cc');
      ctx.beginPath(); ctx.moveTo(400, 100); ctx.lineTo(500, 10); ctx.lineTo(600, 100); ctx.closePath(); p(ctx, '#c9a46a');
      el(ctx, 500, 170, 56, 56); p(ctx, '#fff');
      ctx.beginPath(); ctx.moveTo(500, 170); ctx.lineTo(500, 130); ctx.moveTo(500, 170); ctx.lineTo(530, 180); p(ctx, null, INK, 6);
      ctx.beginPath(); ctx.moveTo(190, 260); ctx.lineTo(810, 260); ctx.lineTo(760, 220); ctx.lineTo(240, 220); ctx.closePath(); p(ctx, '#c9a46a');
      for (const x of [250, 330, 670, 750]) { rr(ctx, x - 14, 270, 28, 300, 6); p(ctx, '#fff8ee'); }
      rr(ctx, 440, 400, 120, 170, 14); p(ctx, '#8a5a32');
      for (const [y, w] of [[570, 300], [590, 340]]) { rr(ctx, 500 - w / 2, y, w, 20, 4); p(ctx, '#e6dccb'); }
      rr(ctx, 497, -100, 6, 110, 2); p(ctx, '#3a3a48', null);
      ctx.beginPath(); ctx.moveTo(503, -96); ctx.quadraticCurveTo(560, -70, 610, -90); ctx.lineTo(610, -40); ctx.quadraticCurveTo(560, -24, 503, -50); ctx.closePath(); p(ctx, '#e8524a');
    },
  },
  school: {
    sky: 'day', path: '#e3cfa0', props: ['bush', 'bench', 'books', 'flowerpot', 'rock', 'bush'],
    draw(ctx, rng) {
      rr(ctx, 230, 260, 540, 310, 6); p(ctx, '#e8524a');
      ctx.beginPath(); ctx.moveTo(200, 270); ctx.lineTo(500, 120); ctx.lineTo(800, 270); ctx.closePath(); p(ctx, '#7a4a28');
      rr(ctx, 450, 30, 100, 110, 4); p(ctx, '#fff8ee');
      ctx.beginPath(); ctx.moveTo(430, 40); ctx.lineTo(500, -20); ctx.lineTo(570, 40); ctx.closePath(); p(ctx, '#7a4a28');
      windows(ctx, 280, 330, 2, 1, 80, 100, 30); windows(ctx, 610, 330, 2, 1, 50, 100, 20);
      rr(ctx, 450, 420, 100, 150, 8); p(ctx, '#fff3c4');
      sign(ctx, 500, 220, 200, 'SCHOOL', '#fff8ee', '#e8524a');
      // swing set
      ctx.beginPath(); ctx.moveTo(1000, HORIZON + 40); ctx.lineTo(1060, 300); ctx.lineTo(1120, HORIZON + 40); ctx.moveTo(1060, 300); ctx.lineTo(1260, 300); ctx.moveTo(1200, HORIZON + 40); ctx.lineTo(1260, 300); ctx.lineTo(1320, HORIZON + 40); p(ctx, null, '#6fb7ff', 12);
      for (const x of [1130, 1200]) { ctx.beginPath(); ctx.moveTo(x - 20, 300); ctx.lineTo(x - 20, 480); ctx.moveTo(x + 20, 300); ctx.lineTo(x + 20, 480); p(ctx, null, INK, 3); rr(ctx, x - 28, 476, 56, 12, 4); p(ctx, '#ffd23f'); }
      tree(ctx, 100, HORIZON + 30, 0.95);
    },
  },
  orchard: {
    sky: 'gold', path: '#e3cfa0', props: ['haybale', 'crate', 'log', 'wheelbarrow', 'crate', 'bush'],
    draw(ctx, rng) {
      for (let x = -260; x < 1300; x += 200) tree(ctx, x, HORIZON - 20, 0.7, '#e8524a');
      for (const x of [120, 380, 640, 900]) tree(ctx, x, HORIZON + 70, 1.0, '#e8524a');
      fence(ctx, -300, 1300, HORIZON + 110);
    },
  },
  station: {
    sky: 'gold', path: null, props: ['suitcase', 'bench', 'crate', 'suitcase', 'barrel', 'sack'],
    draw(ctx, rng) {
      rr(ctx, 180, 230, 640, 300, 8); p(ctx, '#e0e8f4');
      ctx.beginPath(); ctx.moveTo(150, 240); ctx.lineTo(500, 110); ctx.lineTo(850, 240); ctx.closePath(); p(ctx, '#5a6a8a');
      el(ctx, 500, 180, 40, 40); p(ctx, '#fff');
      ctx.beginPath(); ctx.moveTo(500, 180); ctx.lineTo(500, 152); ctx.moveTo(500, 180); ctx.lineTo(520, 188); p(ctx, null, INK, 5);
      windows(ctx, 230, 300, 4, 1, 90, 110, 60);
      sign(ctx, 500, 460, 300, 'STATION', '#fff8ee', '#5a6a8a');
      ctx.fillStyle = '#d9d0c0'; ctx.fillRect(-400, HORIZON - 10, 1800, 80);
      ctx.fillStyle = '#c9b89a'; ctx.fillRect(-400, HORIZON + 66, 1800, 10);
      // a train on the far track
      for (const [x, c] of [[-380, '#e8524a'], [-150, '#6fb7ff'], [1060, '#ffd23f']]) { rr(ctx, x, 380, 210, 150, 16); p(ctx, c); windows(ctx, x + 24, 410, 3, 1, 44, 50, 16); }
    },
    dynamic(ctx, t) { for (let i = 0; i < 4; i++) { const k = (t * 0.25 + i / 4) % 1; el(ctx, 1120 - k * 40, 340 - k * 240, 20 + k * 40, 16 + k * 30); p(ctx, `rgba(255,255,255,${0.75 * (1 - k)})`, null); } },
  },
  icecream: {
    sky: 'day', path: '#ffe8f0', props: ['table', 'flowerpot', 'bench', 'bush', 'flowerpot', 'table'],
    draw(ctx, rng) {
      house(ctx, -270, HORIZON + 10, 180, 200, '#e0f6ff', '#ff86b8', rng);
      rr(ctx, 240, 260, 520, 310, 10); p(ctx, '#fff0f6');
      awning(ctx, 240, 300, 520, '#ffc0d9');
      rr(ctx, 290, 400, 220, 140, 10); p(ctx, '#bfe3ff');
      rr(ctx, 570, 380, 130, 190, 10); p(ctx, '#ff86b8');
      // giant cone on the roof
      ctx.beginPath(); ctx.moveTo(440, 260); ctx.lineTo(500, 40 + 200); ctx.lineTo(560, 260); ctx.closePath();
      ctx.beginPath(); ctx.moveTo(450, 250); ctx.lineTo(500, 380 - 120); ctx.lineTo(550, 250); ctx.closePath(); p(ctx, '#e9b46a');
      el(ctx, 470, 170, 50, 50); p(ctx, '#ffc0d9'); el(ctx, 530, 170, 50, 50); p(ctx, '#bff0d0'); el(ctx, 500, 110, 46, 46); p(ctx, '#fff3c4'); el(ctx, 500, 60, 14, 14); p(ctx, '#e8524a');
      ctx.beginPath(); ctx.moveTo(450, 220); ctx.lineTo(500, 260); ctx.lineTo(550, 220); ctx.closePath(); p(ctx, '#e9b46a');
      sign(ctx, 500, 300, 290, 'ICE CREAM', '#fff8ee', '#e8578f');
      house(ctx, 1080, HORIZON + 10, 180, 210, '#fff3c4', '#5fc98c', rng);
    },
  },
};

// Where the suspect stands, and the six prop slots, for one place.
export function layout(placeId, tall = false) {
  const art = PLACE_ART[placeId];
  const slots = art.props.map((type, i) => {
    const [x, y] = (tall ? TALL_SLOTS : SLOTS)[i];
    const box = PROPS[type](nullCtx);
    let scale = tall ? 0.95 : y > 850 ? 1.2 : 1.0;
    // keep tall props (the café table) inside the narrow view
    if (box.h > 200) scale = tall ? 0.75 : 0.8;
    return { type, x, y, scale, w: box.w * scale, h: box.h * scale };
  });
  const stand = tall ? { x: 610, y: 1080 } : art.stand || { x: 650, y: 870 };
  return { slots, stand };
}

// A canvas stand-in that ignores drawing, to read prop sizes without a DOM.
const nullCtx = new Proxy({}, { get: () => () => {} });

// ------------------------------------------------------------- baking
//
// view: { w, h, dpr } in CSS pixels. The core maps to the view with
// scale s and offset (ox, oy) so that core rows CORE.top..CORE.bottom fit.

export function fitCore(w, h) {
  const tall = h > w * 1.25;
  const c = tall ? TALL_CORE : h < w * 0.45 ? SHORT_CORE : CORE;
  const s = Math.min(w / (c.x1 - c.x0), h / (c.bottom - c.top));
  const ox = (w - (c.x1 - c.x0) * s) / 2 - c.x0 * s;
  // Spare height goes to the sky, so the ground and props sit at the bottom.
  const oy = h - c.bottom * s;
  return { s, ox, oy, tall };
}

export function bakePlace(placeId, w, h, dpr, areaH = h) {
  const art = PLACE_ART[placeId];
  const fit = fitCore(w, areaH);
  const rng = new Rng(hashString(placeId));
  const back = makeCanvas(w * dpr, h * dpr);
  const bctx = back.getContext('2d');
  bctx.setTransform(dpr * fit.s, 0, 0, dpr * fit.s, dpr * fit.ox, dpr * fit.oy);
  const x0 = -fit.ox / fit.s - 10, x1 = (w - fit.ox) / fit.s + 10;
  sky(bctx, x0, x1, art.sky, rng);
  hills(bctx, x0, x1, rng, art.sky);
  for (let x = Math.floor(x0 / 300) * 300; x < x1; x += 300) {
    if (x > -200 && x < 1100) continue;
    if (rng.chance(0.6)) tree(bctx, x + rng.int(120), HORIZON - 10, 0.7 + rng.next() * 0.3);
    else house(bctx, x + rng.int(80), HORIZON - 10, 150, 150, rng.pick(['#ffe0b0', '#e0f0ff', '#ffd8e0', '#e8ffd8']), rng.pick(['#c9673a', '#6a5aa8', '#5a8a3a', '#d9534f']), rng);
  }
  ground(bctx, x0, x1, art.sky, art.path);
  art.draw(bctx, rng);
  // foreground grass tufts in the wings
  for (let x = x0; x < x1; x += 90) {
    if (x > 0 && x < 1000) continue;
    flowers(bctx, x, 880 + rng.int(200), 3, rng);
  }
  const front = makeCanvas(w * dpr, h * dpr);
  const fctx = front.getContext('2d');
  fctx.setTransform(dpr * fit.s, 0, 0, dpr * fit.s, dpr * fit.ox, dpr * fit.oy);
  const lay = layout(placeId, fit.tall);
  for (const slot of lay.slots) {
    fctx.save(); fctx.translate(slot.x, slot.y); fctx.scale(slot.scale, slot.scale);
    el(fctx, 0, 0, slot.w / slot.scale * 0.5, 12); p(fctx, 'rgba(40,60,30,0.22)', null);
    PROPS[slot.type](fctx);
    fctx.restore();
  }
  return { back, front, fit, layout: lay, dynamic: art.dynamic || null };
}

// The title backdrop: a Whiskerton skyline at golden hour.
export function bakeTitle(w, h, dpr) {
  const canvas = makeCanvas(w * dpr, h * dpr);
  const ctx = canvas.getContext('2d');
  const fit = fitCore(w, h);
  ctx.setTransform(dpr * fit.s, 0, 0, dpr * fit.s, dpr * fit.ox, dpr * fit.oy);
  const rng = new Rng(7);
  const x0 = -fit.ox / fit.s - 10, x1 = (w - fit.ox) / fit.s + 10;
  sky(ctx, x0, x1, 'gold', rng);
  hills(ctx, x0, x1, rng, 'gold');
  const cols = [['#ffe0b0', '#c9673a'], ['#e0f0ff', '#6a5aa8'], ['#ffd8e0', '#d9534f'], ['#e8ffd8', '#5a8a3a'], ['#fff3c4', '#a8763a']];
  for (let x = Math.floor(x0 / 170) * 170; x < x1; x += 170) {
    const [wall, roof] = cols[Math.abs(Math.round(x / 170)) % cols.length];
    if (Math.abs(Math.round(x / 170)) % 4 === 3) tree(ctx, x + 60, HORIZON + 20, 0.8);
    else house(ctx, x, HORIZON + 20, 140, 120 + rng.int(80), wall, roof, rng);
  }
  ground(ctx, x0, x1, 'gold', '#e9d4b0');
  for (let x = x0; x < x1; x += 120) flowers(ctx, x + 40, 700 + rng.int(260), 3, rng);
  return { canvas, fit };
}

export { star };
