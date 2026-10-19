// Storybook art drawn with Canvas paths: buildings, soldiers, boats, banner
// emblems and hero portraits. Static parts are baked into offscreen canvases
// by the renderer; only blades, flags and glows are drawn per frame.

export const INK = '#3b2c22';
const STONE = '#efe6d4';
const STONE_SHADE = '#d4c6ab';
const WOOD = '#9a6a43';
const WOOD_DARK = '#5e3d25';
const CREAM = '#fff6e2';

export function makeCanvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(Math.max(1, w), Math.max(1, h)) : Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, h) });
  return c;
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

function fillStroke(ctx, fill, lw = 2.4) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function rect(ctx, x, y, w, h, fill, lw = 2.4) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  fillStroke(ctx, fill, lw);
}

function roof(ctx, l, r, base, apex, pal) {
  poly(ctx, [l, base, (l + r) / 2, apex, r, base]);
  fillStroke(ctx, pal.fill);
  // Painted highlight on the lit side.
  poly(ctx, [(l + r) / 2, apex + 4, (l + r) / 2 + (r - l) * 0.08, base - 2, l + 4, base - 2]);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();
}

function merlons(ctx, x0, x1, y, h, fill) {
  const n = Math.max(2, Math.round((x1 - x0) / 9));
  const w = (x1 - x0) / (n * 2 - 1);
  for (let i = 0; i < n; i++) rect(ctx, x0 + i * w * 2, y, w, h, fill, 2);
}

function shadow(ctx, rx = 38) {
  ctx.beginPath();
  ctx.ellipse(50, 82, rx, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30,40,20,0.22)';
  ctx.fill();
}

function windowSlit(ctx, x, y, w = 5, h = 9) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w / 2);
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fillStyle = '#4a3a52';
  ctx.fill();
}

// Draw a building in a 100 × 115 box; the ground point is (50, 80).
// pal: { fill, dark, light }. emblem: optional banner emblem name.
export function drawBuilding(ctx, type, pal, emblem) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (type === 'castle') {
    shadow(ctx, 44);
    rect(ctx, 20, 40, 60, 40, STONE);
    merlons(ctx, 20, 80, 33, 8, STONE);
    // Side towers.
    for (const x of [8, 70]) {
      rect(ctx, x, 32, 22, 50, STONE);
      ctx.fillStyle = STONE_SHADE;
      ctx.fillRect(x + 15, 33, 6, 48);
      windowSlit(ctx, x + 8.5, 46);
      roof(ctx, x - 4, x + 26, 33, 4, pal);
    }
    // Keep.
    rect(ctx, 36, 22, 28, 58, STONE);
    ctx.fillStyle = STONE_SHADE;
    ctx.fillRect(56, 23, 7, 56);
    merlons(ctx, 34, 66, 15, 8, STONE);
    // Gate.
    ctx.beginPath();
    ctx.moveTo(42, 80);
    ctx.lineTo(42, 66);
    ctx.arc(50, 66, 8, Math.PI, 0);
    ctx.lineTo(58, 80);
    ctx.closePath();
    fillStroke(ctx, WOOD_DARK, 2);
    ctx.strokeStyle = 'rgba(255,220,160,0.35)';
    ctx.lineWidth = 1.2;
    for (const x of [46, 50, 54]) { ctx.beginPath(); ctx.moveTo(x, 61); ctx.lineTo(x, 80); ctx.stroke(); }
    // Banner on the keep.
    poly(ctx, [41, 28, 59, 28, 59, 50, 50, 45, 41, 50]);
    fillStroke(ctx, pal.fill, 1.8);
    if (emblem) {
      ctx.save();
      ctx.translate(50, 36.5);
      ctx.scale(6, 6);
      drawEmblem(ctx, emblem, '#fff8e8');
      ctx.restore();
    }
    // Flagpole (the flag itself is animated).
    ctx.beginPath();
    ctx.moveTo(50, 15);
    ctx.lineTo(50, -4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
  } else if (type === 'cottage') {
    shadow(ctx, 34);
    rect(ctx, 26, 46, 48, 34, CREAM);
    ctx.strokeStyle = WOOD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(26, 58); ctx.lineTo(74, 58);
    ctx.moveTo(36, 46); ctx.lineTo(36, 80);
    ctx.moveTo(64, 46); ctx.lineTo(64, 80);
    ctx.stroke();
    rect(ctx, 61, 20, 8, 18, '#b5654a', 2);
    roof(ctx, 16, 84, 49, 16, pal);
    rect(ctx, 44, 62, 12, 18, WOOD, 2);
    rect(ctx, 28.5, 61, 6, 7, '#ffe48a', 1.6);
    rect(ctx, 65.5, 61, 6, 7, '#ffe48a', 1.6);
    // Flower box.
    ctx.fillStyle = '#ff7aa8';
    for (const x of [29, 32, 66, 69]) { ctx.beginPath(); ctx.arc(x, 70, 1.8, 0, Math.PI * 2); ctx.fill(); }
  } else if (type === 'mill') {
    shadow(ctx, 30);
    poly(ctx, [33, 80, 67, 80, 61, 30, 39, 30]);
    fillStroke(ctx, CREAM);
    poly(ctx, [56, 31, 61, 31, 67, 79, 60, 79]);
    ctx.fillStyle = 'rgba(160,130,90,0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(35, 34);
    ctx.quadraticCurveTo(50, 8, 65, 34);
    ctx.closePath();
    fillStroke(ctx, pal.fill);
    ctx.beginPath();
    ctx.moveTo(44, 80); ctx.lineTo(44, 69); ctx.arc(50, 69, 6, Math.PI, 0); ctx.lineTo(56, 80); ctx.closePath();
    fillStroke(ctx, WOOD, 2);
    rect(ctx, 47, 46, 6, 7, '#ffe48a', 1.6);
  } else if (type === 'tower') {
    shadow(ctx, 26);
    rect(ctx, 35, 24, 30, 57, STONE);
    ctx.fillStyle = STONE_SHADE;
    ctx.fillRect(56, 25, 8, 55);
    ctx.strokeStyle = 'rgba(120,100,80,0.45)';
    ctx.lineWidth = 1.2;
    for (let y = 34; y < 80; y += 9) {
      ctx.beginPath(); ctx.moveTo(35, y); ctx.lineTo(65, y); ctx.stroke();
      const off = (y / 9) % 2 ? 44 : 52;
      ctx.beginPath(); ctx.moveTo(off, y); ctx.lineTo(off, y + 9); ctx.stroke();
    }
    rect(ctx, 31, 17, 38, 9, STONE, 2.2);
    merlons(ctx, 31, 69, 11, 7, STONE);
    roof(ctx, 34, 66, 12, -10, pal);
    windowSlit(ctx, 47.5, 40, 5, 11);
    windowSlit(ctx, 47.5, 60, 5, 11);
    // Shield with the owner's colour.
    poly(ctx, [41, 30, 59, 30, 59, 35, 50, 39, 41, 35]);
  } else if (type === 'forge') {
    shadow(ctx, 40);
    rect(ctx, 66, 16, 10, 28, '#a9573f', 2);
    rect(ctx, 18, 50, 64, 30, '#ddd0b8');
    ctx.fillStyle = STONE_SHADE;
    ctx.fillRect(70, 51, 11, 28);
    poly(ctx, [12, 53, 26, 34, 74, 34, 88, 53]);
    fillStroke(ctx, pal.fill);
    poly(ctx, [26, 37, 50, 37, 46, 51, 18, 51]);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    // Furnace mouth.
    ctx.beginPath();
    ctx.moveTo(26, 80); ctx.lineTo(26, 67); ctx.arc(36, 67, 10, Math.PI, 0); ctx.lineTo(46, 80); ctx.closePath();
    fillStroke(ctx, '#3a2420', 2);
    ctx.beginPath();
    ctx.arc(36, 74, 6, Math.PI, 0);
    ctx.fillStyle = '#ffb347';
    ctx.fill();
    // Anvil.
    poly(ctx, [56, 66, 76, 66, 72, 70, 68, 70, 70, 78, 60, 78, 62, 70, 58, 70]);
    fillStroke(ctx, '#6c7380', 1.6);
  } else if (type === 'shrine') {
    shadow(ctx, 32);
    rect(ctx, 22, 72, 56, 8, STONE, 2);
    rect(ctx, 27, 65, 46, 7, STONE, 2);
    for (const x of [31, 41.5, 52.5, 63]) rect(ctx, x, 42, 6, 23, CREAM, 1.8);
    rect(ctx, 27, 38, 46, 5, STONE, 2);
    ctx.beginPath();
    ctx.moveTo(28, 38);
    ctx.arc(50, 38, 22, Math.PI, 0);
    ctx.closePath();
    fillStroke(ctx, pal.fill);
    ctx.beginPath();
    ctx.arc(44, 30, 9, Math.PI * 1.1, Math.PI * 1.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(50, 16); ctx.lineTo(50, 8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (type === 'tower') fillStroke(ctx, pal.fill, 1.6);
}

// Animated parts, drawn each frame on top of the baked sprite. `u` is the
// size of one unit of the 100-unit box in screen pixels.
export function drawBuildingLive(ctx, type, pal, x, y, u, t, reduced) {
  if (type === 'mill') {
    const a = reduced ? 0.4 : t * 1.6;
    const hx = x, hy = y - 50 * u;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(a);
    ctx.lineWidth = Math.max(1, 1.6 * u);
    ctx.strokeStyle = INK;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#fbf3df';
      ctx.beginPath();
      ctx.rect(2 * u, -3.2 * u, 30 * u, 7 * u);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(32 * u, 0);
      ctx.strokeStyle = WOOD_DARK;
      ctx.stroke();
      ctx.strokeStyle = INK;
    }
    ctx.beginPath();
    ctx.arc(0, 0, 3.4 * u, 0, Math.PI * 2);
    ctx.fillStyle = pal.dark;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else if (type === 'castle') {
    flag(ctx, x, y - 84 * u, u, pal, t, reduced);
  } else if (type === 'shrine') {
    const g = 0.55 + 0.35 * Math.sin(t * 2.4);
    ctx.globalAlpha = reduced ? 0.7 : g;
    ctx.beginPath();
    ctx.arc(x, y - 73 * u, 5 * u, 0, Math.PI * 2);
    ctx.fillStyle = pal.light;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y - 73 * u, 2.6 * u, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  } else if (type === 'forge') {
    const f = reduced ? 0.6 : 0.5 + 0.4 * Math.sin(t * 9) * Math.sin(t * 5.3);
    ctx.globalAlpha = 0.35 + 0.4 * f;
    ctx.beginPath();
    ctx.arc(x - 14 * u, y - 7 * u, 5 * u, Math.PI, 0);
    ctx.fillStyle = '#fff1a8';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function flag(ctx, x, y, u, pal, t, reduced) {
  const w = 18 * u, h = 10 * u;
  const wave = reduced ? 0 : Math.sin(t * 5) * 2 * u;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + w * 0.5, y - wave, x + w, y + wave * 0.6);
  ctx.lineTo(x + w - 2 * u, y + h * 0.5 + wave * 0.6);
  ctx.lineTo(x + w, y + h + wave * 0.6);
  ctx.quadraticCurveTo(x + w * 0.5, y + h - wave, x, y + h);
  ctx.closePath();
  ctx.fillStyle = pal.fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.4 * u);
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// A little round soldier, centred in a box of `s` pixels.
export function drawSoldier(ctx, pal, s) {
  const r = s * 0.36;
  const cx = s / 2, cy = s * 0.56;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.95, r * 0.9, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,30,20,0.25)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = pal.fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.1, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
  // Helmet.
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r * 0.95, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fillStyle = '#cfd6e0';
  ctx.fill();
  ctx.stroke();
  // Eyes.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy + r * 0.12, Math.max(0.6, r * 0.12), 0, Math.PI * 2);
  ctx.arc(cx + r * 0.3, cy + r * 0.12, Math.max(0.6, r * 0.12), 0, Math.PI * 2);
  ctx.fill();
}

// A rowboat with a sail, centred in a box of `s` pixels.
export function drawBoat(ctx, pal, s) {
  const u = s / 40;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.ellipse(20 * u, 31 * u, 15 * u, 3 * u, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4 * u, 24 * u);
  ctx.lineTo(36 * u, 24 * u);
  ctx.quadraticCurveTo(33 * u, 32 * u, 26 * u, 32 * u);
  ctx.lineTo(14 * u, 32 * u);
  ctx.quadraticCurveTo(7 * u, 32 * u, 4 * u, 24 * u);
  ctx.closePath();
  ctx.fillStyle = WOOD;
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.6 * u);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(20 * u, 24 * u);
  ctx.lineTo(20 * u, 4 * u);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(21 * u, 5 * u);
  ctx.quadraticCurveTo(32 * u, 12 * u, 31 * u, 21 * u);
  ctx.lineTo(21 * u, 21 * u);
  ctx.closePath();
  ctx.fillStyle = pal.fill;
  ctx.fill();
  ctx.stroke();
}

// Emblems in a box from -1 to 1.
export function drawEmblem(ctx, emblem, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  switch (emblem) {
    case 'crown':
      ctx.moveTo(-0.9, 0.6); ctx.lineTo(-0.9, -0.4); ctx.lineTo(-0.45, 0.05); ctx.lineTo(0, -0.7);
      ctx.lineTo(0.45, 0.05); ctx.lineTo(0.9, -0.4); ctx.lineTo(0.9, 0.6); ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.42 : 0.95;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      break;
    case 'heart':
      ctx.moveTo(0, 0.85);
      ctx.bezierCurveTo(-1.1, 0.05, -0.75, -0.95, 0, -0.35);
      ctx.bezierCurveTo(0.75, -0.95, 1.1, 0.05, 0, 0.85);
      break;
    case 'moon':
      ctx.arc(0, 0, 0.85, Math.PI * 0.3, Math.PI * 1.7);
      ctx.arc(0.35, -0.05, 0.65, Math.PI * 1.55, Math.PI * 0.45, true);
      ctx.closePath();
      break;
    case 'shield':
      ctx.moveTo(-0.8, -0.8); ctx.lineTo(0.8, -0.8); ctx.lineTo(0.8, 0);
      ctx.quadraticCurveTo(0.7, 0.65, 0, 0.95); ctx.quadraticCurveTo(-0.7, 0.65, -0.8, 0); ctx.closePath();
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
        ctx.moveTo(Math.cos(a) * 0.5 + 0.38, Math.sin(a) * 0.5);
        ctx.arc(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.38, 0, Math.PI * 2);
      }
      break;
    case 'sun':
      ctx.arc(0, 0, 0.45, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(Math.cos(a - 0.2) * 0.55, Math.sin(a - 0.2) * 0.55);
        ctx.lineTo(Math.cos(a) * 0.98, Math.sin(a) * 0.98);
        ctx.lineTo(Math.cos(a + 0.2) * 0.55, Math.sin(a + 0.2) * 0.55);
      }
      break;
    case 'fish':
      ctx.ellipse(-0.1, 0, 0.6, 0.38, 0, 0, Math.PI * 2);
      ctx.moveTo(0.4, 0); ctx.lineTo(0.95, -0.45); ctx.lineTo(0.95, 0.45); ctx.closePath();
      break;
    case 'acorn':
      ctx.ellipse(0, 0.2, 0.5, 0.62, 0, 0, Math.PI * 2);
      ctx.moveTo(-0.7, -0.15); ctx.quadraticCurveTo(0, -0.95, 0.7, -0.15); ctx.closePath();
      ctx.rect(-0.08, -0.95, 0.16, 0.3);
      break;
    case 'dragon':
      ctx.moveTo(-0.9, 0.5); ctx.lineTo(-0.3, 0.1); ctx.lineTo(-0.55, -0.7); ctx.lineTo(0, -0.15);
      ctx.lineTo(0.2, -0.85); ctx.lineTo(0.35, -0.1); ctx.lineTo(0.95, -0.25); ctx.lineTo(0.55, 0.25);
      ctx.lineTo(0.75, 0.75); ctx.lineTo(0.1, 0.45); ctx.lineTo(-0.35, 0.8); ctx.closePath();
      break;
    default:
      ctx.arc(0, 0, 0.7, 0, Math.PI * 2);
  }
  ctx.fill('evenodd');
  ctx.restore();
}

// A hero portrait in a box of `s` pixels.
export function drawHero(ctx, id, s, { silhouette = false } = {}) {
  const u = s / 100;
  ctx.save();
  ctx.scale(u, u);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const ink = silhouette ? '#5b5470' : INK;
  const f = (c) => (silhouette ? '#7a7290' : c);
  const st = (lw = 3) => { ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke(); };
  // Body.
  const cloak = { knight: '#e2589f', ranger: '#2fa85a', wizard: '#3d6fe0', shepherd: '#eab421' }[id] || '#888';
  ctx.beginPath();
  ctx.moveTo(22, 100); ctx.quadraticCurveTo(24, 66, 50, 64); ctx.quadraticCurveTo(76, 66, 78, 100); ctx.closePath();
  ctx.fillStyle = f(cloak); ctx.fill(); st();
  // Face.
  ctx.beginPath();
  ctx.arc(50, 50, 22, 0, Math.PI * 2);
  ctx.fillStyle = f('#ffd9b5'); ctx.fill(); st();
  if (!silhouette) {
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(42, 52, 2.6, 0, Math.PI * 2); ctx.arc(58, 52, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(50, 58, 6, 0.15 * Math.PI, 0.85 * Math.PI); st(2.4);
    ctx.fillStyle = 'rgba(255,120,120,0.35)';
    ctx.beginPath(); ctx.arc(36, 59, 4, 0, Math.PI * 2); ctx.arc(64, 59, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (id === 'knight') {
    ctx.beginPath();
    ctx.moveTo(26, 50); ctx.arc(50, 46, 25, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(74, 50); ctx.lineTo(66, 44); ctx.lineTo(34, 44); ctx.closePath();
    ctx.fillStyle = f('#cfd6e0'); ctx.fill(); st();
    ctx.beginPath(); ctx.moveTo(50, 21); ctx.quadraticCurveTo(66, 4, 80, 14); ctx.quadraticCurveTo(66, 16, 56, 26); ctx.closePath();
    ctx.fillStyle = f('#ff7aa8'); ctx.fill(); st(2.4);
  } else if (id === 'ranger') {
    ctx.beginPath();
    ctx.moveTo(24, 60); ctx.quadraticCurveTo(22, 20, 50, 18); ctx.quadraticCurveTo(80, 20, 76, 60);
    ctx.quadraticCurveTo(72, 36, 50, 34); ctx.quadraticCurveTo(28, 36, 24, 60); ctx.closePath();
    ctx.fillStyle = f('#2b8a4a'); ctx.fill(); st();
    ctx.beginPath(); ctx.moveTo(66, 24); ctx.quadraticCurveTo(86, 8, 90, 2); ctx.quadraticCurveTo(84, 20, 70, 30); ctx.closePath();
    ctx.fillStyle = f('#f0862a'); ctx.fill(); st(2.2);
  } else if (id === 'wizard') {
    ctx.beginPath(); ctx.moveTo(32, 68); ctx.quadraticCurveTo(50, 98, 68, 68); ctx.quadraticCurveTo(50, 74, 32, 68); ctx.closePath();
    ctx.fillStyle = f('#f4f4f4'); ctx.fill(); st(2.4);
    ctx.beginPath(); ctx.moveTo(20, 36); ctx.lineTo(80, 36); ctx.lineTo(56, 30); ctx.lineTo(62, -2); ctx.lineTo(40, 30); ctx.closePath();
    ctx.fillStyle = f('#3d5fc0'); ctx.fill(); st();
    if (!silhouette) {
      ctx.save(); ctx.translate(52, 22); ctx.scale(5, 5); drawEmblem(ctx, 'star', '#ffe48a'); ctx.restore();
    }
  } else if (id === 'shepherd') {
    ctx.beginPath(); ctx.ellipse(50, 32, 36, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = f('#e8c45a'); ctx.fill(); st();
    ctx.beginPath(); ctx.moveTo(32, 32); ctx.quadraticCurveTo(50, 6, 68, 32); ctx.closePath();
    ctx.fillStyle = f('#f2d47a'); ctx.fill(); st();
    ctx.beginPath(); ctx.moveTo(30, 31); ctx.lineTo(70, 31);
    ctx.strokeStyle = silhouette ? ink : '#e2589f'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(88, 100); ctx.lineTo(88, 30); ctx.arc(80, 30, 8, 0, Math.PI, true);
    ctx.lineWidth = 4; ctx.strokeStyle = silhouette ? ink : WOOD; ctx.stroke();
  }
  if (silhouette) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 50, 54);
  }
  ctx.restore();
}

// A small hero figure that marches at the front of a squad.
export function drawHeroToken(ctx, id, pal, s) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2);
  ctx.fillStyle = pal.fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.strokeStyle = '#fff8e0';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(s * 0.04, s * 0.06);
  drawHero(ctx, id, s * 0.92);
  ctx.restore();
}
