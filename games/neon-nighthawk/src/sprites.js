// Sprite baking for the renderer. Everything expensive (gradients, glows,
// rooftop detail) is drawn once into an offscreen canvas and then blitted,
// so a frame never pays for `shadowBlur` or per-object gradients.
//
// Sprites are drawn in world units at `k` device pixels per unit.
import { LOT } from './scenery.js';

export const BLOCK_PAD = 26; // room around a lot for lamp pools and neon spill

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

export function hsl(h, s, l, a = 1) {
  return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})`;
}

export function rgba(hex, a) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = Number.parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function roundedRect(g, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + radius, y);
  g.arcTo(x + w, y, x + w, y + h, radius);
  g.arcTo(x + w, y + h, x, y + h, radius);
  g.arcTo(x, y + h, x, y, radius);
  g.arcTo(x, y, x + w, y, radius);
  g.closePath();
}

// ------------------------------------------------------------------ glow

const glows = new Map();

// A soft round glow, drawn with 'lighter' compositing in place of shadowBlur.
export function glowSprite(color) {
  let sprite = glows.get(color);
  if (!sprite) {
    sprite = bakeGlow(color, 64);
    glows.set(color, sprite);
  }
  return sprite;
}

// A glow baked at an exact pixel diameter, so drawing it needs no scaling.
export function bakeGlow(color, diameter) {
  const canvas = makeCanvas(diameter, diameter);
  const g = canvas.getContext('2d');
  const r = diameter / 2;
  const gradient = g.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, rgba(color, 1));
  gradient.addColorStop(0.16, rgba(color, 0.62));
  gradient.addColorStop(0.42, rgba(color, 0.2));
  gradient.addColorStop(0.7, rgba(color, 0.06));
  gradient.addColorStop(1, rgba(color, 0));
  g.fillStyle = gradient;
  g.fillRect(0, 0, diameter, diameter);
  return canvas;
}

// Draws a glow of the given diameter centred on (x, y). Callers set the
// composite operation; glows usually want 'lighter'.
export function drawGlow(g, color, x, y, size, alpha = 1) {
  if (alpha <= 0.003) return;
  const previous = g.globalAlpha;
  g.globalAlpha = previous * Math.min(1, alpha);
  g.drawImage(glowSprite(color), x - size / 2, y - size / 2, size, size);
  g.globalAlpha = previous;
}

// A neon tube: three strokes of falling width fake a bloom.
function neonStroke(g, color, width = 1.6) {
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = rgba(color, 0.12);
  g.lineWidth = width * 5;
  g.stroke();
  g.strokeStyle = rgba(color, 0.32);
  g.lineWidth = width * 2.4;
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------- blocks

const WARM = '#ffd98a';

function drawTree(g, x, y, r, lit, hue = 140) {
  g.fillStyle = 'rgba(0, 0, 0, .3)';
  g.beginPath();
  g.arc(x + r * 0.35, y + r * 0.45, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = lit ? hsl(hue, 45, 30) : hsl(hue, 10, 15);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = lit ? hsl(hue - 10, 55, 42) : hsl(hue, 10, 20);
  g.beginPath();
  g.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, Math.PI * 2);
  g.fill();
}

function drawFeature(g, f, lit, hue, accent) {
  switch (f.type) {
    case 'bed': {
      roundedRect(g, f.x, f.y, f.w, f.h, 4);
      g.fillStyle = lit ? '#3b2a24' : '#1b1a1f';
      g.fill();
      g.fillStyle = lit ? '#5fcf7d' : '#26302c';
      const step = 6;
      for (let px = f.x + 4; px < f.x + f.w - 2; px += step) {
        for (let py = f.y + 4; py < f.y + f.h - 2; py += step) {
          g.beginPath();
          g.arc(px, py, 2, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (lit) {
        g.fillStyle = '#ffd1e8';
        for (let px = f.x + 7; px < f.x + f.w - 4; px += 12) g.fillRect(px, f.y + f.h / 2, 1.6, 1.6);
      }
      break;
    }
    case 'tree':
      drawTree(g, f.x, f.y, f.r, lit, 130);
      break;
    case 'fairy': {
      g.strokeStyle = lit ? 'rgba(255, 236, 200, .35)' : 'rgba(120, 130, 150, .18)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(f.x1, f.y1);
      g.quadraticCurveTo((f.x1 + f.x2) / 2, (f.y1 + f.y2) / 2 + 10, f.x2, f.y2);
      g.stroke();
      const colors = ['#ff9ec7', '#ffe08a', '#9ef0ff', '#b6ffb0'];
      for (let i = 1; i < 9; i++) {
        const t = i / 9;
        const x = (1 - t) * (1 - t) * f.x1 + 2 * (1 - t) * t * ((f.x1 + f.x2) / 2) + t * t * f.x2;
        const y = (1 - t) * (1 - t) * f.y1 + 2 * (1 - t) * t * ((f.y1 + f.y2) / 2 + 10) + t * t * f.y2;
        if (lit) {
          g.globalCompositeOperation = 'lighter';
          drawGlow(g, colors[i % 4], x, y, 10, 0.8);
          g.globalCompositeOperation = 'source-over';
        }
        g.fillStyle = lit ? colors[i % 4] : '#39404c';
        g.fillRect(x - 1, y - 1, 2, 2);
      }
      break;
    }
    case 'panel': {
      g.fillStyle = lit ? '#1f4f8f' : '#141c2b';
      g.fillRect(f.x, f.y, f.w, f.h);
      g.strokeStyle = lit ? 'rgba(160, 220, 255, .45)' : 'rgba(110, 130, 160, .16)';
      g.lineWidth = 0.6;
      g.strokeRect(f.x + 0.3, f.y + 0.3, f.w - 0.6, f.h - 0.6);
      g.beginPath();
      g.moveTo(f.x + f.w / 2, f.y);
      g.lineTo(f.x + f.w / 2, f.y + f.h);
      g.stroke();
      if (lit) {
        g.fillStyle = 'rgba(200, 240, 255, .22)';
        g.beginPath();
        g.moveTo(f.x, f.y + f.h * 0.6);
        g.lineTo(f.x + f.w * 0.5, f.y);
        g.lineTo(f.x + f.w * 0.75, f.y);
        g.lineTo(f.x + f.w * 0.15, f.y + f.h);
        g.lineTo(f.x, f.y + f.h);
        g.closePath();
        g.fill();
      }
      break;
    }
    case 'tank': {
      g.fillStyle = 'rgba(0, 0, 0, .35)';
      g.beginPath();
      g.arc(f.x + 3, f.y + 4, f.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = lit ? hsl(hue + 160, 30, 40) : '#262b36';
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = lit ? hsl(hue + 160, 35, 58) : '#353c4a';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(f.x, f.y, f.r * 0.7, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = lit ? hsl(hue + 160, 30, 62) : '#3a4150';
      g.beginPath();
      g.arc(f.x - f.r * 0.25, f.y - f.r * 0.25, f.r * 0.22, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'vent': {
      g.fillStyle = 'rgba(0, 0, 0, .3)';
      g.fillRect(f.x + 2, f.y + 3, f.w, f.h);
      g.fillStyle = lit ? '#59617a' : '#252a35';
      g.fillRect(f.x, f.y, f.w, f.h);
      g.fillStyle = lit ? '#7d87a3' : '#2f3542';
      for (let sx = f.x + 2; sx < f.x + f.w - 1; sx += 3) g.fillRect(sx, f.y + 1.5, 1.2, f.h - 3);
      break;
    }
    case 'antenna': {
      g.strokeStyle = lit ? '#9aa4bd' : '#3a4150';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(f.x - 5, f.y + 5);
      g.lineTo(f.x, f.y);
      g.lineTo(f.x + 5, f.y + 5);
      g.stroke();
      if (lit) {
        g.globalCompositeOperation = 'lighter';
        drawGlow(g, '#ff4f74', f.x, f.y, 16, 0.9);
        g.globalCompositeOperation = 'source-over';
      }
      g.fillStyle = lit ? '#ff8099' : '#4a2f38';
      g.beginPath();
      g.arc(f.x, f.y, 1.8, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'pad': {
      g.strokeStyle = lit ? rgba(accent, 0.75) : 'rgba(140, 160, 190, .18)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(f.x - f.r * 0.32, f.y - f.r * 0.4);
      g.lineTo(f.x - f.r * 0.32, f.y + f.r * 0.4);
      g.moveTo(f.x + f.r * 0.32, f.y - f.r * 0.4);
      g.lineTo(f.x + f.r * 0.32, f.y + f.r * 0.4);
      g.moveTo(f.x - f.r * 0.32, f.y);
      g.lineTo(f.x + f.r * 0.32, f.y);
      g.stroke();
      break;
    }
    case 'pool': {
      roundedRect(g, f.x, f.y, f.w, f.h, 5);
      g.fillStyle = lit ? '#1e9fc9' : '#152330';
      g.fill();
      if (lit) {
        g.save();
        g.clip();
        g.globalCompositeOperation = 'lighter';
        drawGlow(g, '#7fe9ff', f.x + f.w / 2, f.y + f.h / 2, Math.max(f.w, f.h) * 1.4, 0.6);
        g.restore();
        g.strokeStyle = 'rgba(220, 250, 255, .5)';
        g.lineWidth = 0.8;
        for (let i = 1; i < 3; i++) {
          g.beginPath();
          g.moveTo(f.x + 4, f.y + (f.h * i) / 3);
          g.quadraticCurveTo(f.x + f.w / 2, f.y + (f.h * i) / 3 - 3, f.x + f.w - 4, f.y + (f.h * i) / 3);
          g.stroke();
        }
      }
      g.strokeStyle = lit ? 'rgba(230, 245, 255, .7)' : 'rgba(120, 140, 170, .2)';
      g.lineWidth = 1.5;
      roundedRect(g, f.x, f.y, f.w, f.h, 5);
      g.stroke();
      break;
    }
    case 'yard': {
      roundedRect(g, f.x, f.y, f.w, f.h, 5);
      g.fillStyle = lit ? '#2f6b3f' : '#18221d';
      g.fill();
      break;
    }
    default:
      break;
  }
}

function drawBuilding(g, b, lit, accent) {
  const { x, y, w, h, roofH, facade, hue } = b;
  // A soft drop shadow falls down and to the right.
  g.fillStyle = 'rgba(0, 0, 0, .38)';
  roundedRect(g, x + 4, y + 6, w, h, 5);
  g.fill();

  // The south wall, seen from just above the street.
  const wallTop = y + roofH;
  g.fillStyle = lit ? hsl(hue, 42, 19) : hsl(hue, 9, 10);
  roundedRect(g, x, wallTop - 4, w, facade + 4, 4);
  g.fill();
  const cellW = (w - 8) / b.columns;
  const cellH = (facade - 5) / b.rows;
  if (lit) g.globalCompositeOperation = 'lighter';
  for (const win of b.windows) {
    if (!lit || !win.on) continue;
    const wx = x + 4 + win.x * cellW + cellW * 0.2;
    const wy = wallTop + 3 + win.y * cellH + cellH * 0.18;
    drawGlow(g, win.warm ? '#ffb85c' : accent, wx + cellW * 0.3, wy + cellH * 0.3, cellW * 1.8, 0.5);
  }
  g.globalCompositeOperation = 'source-over';
  for (const win of b.windows) {
    const wx = x + 4 + win.x * cellW + cellW * 0.2;
    const wy = wallTop + 3 + win.y * cellH + cellH * 0.18;
    if (lit) g.fillStyle = win.on ? (win.warm ? WARM : hsl(hue, 90, 78)) : hsl(hue, 30, 12);
    else g.fillStyle = win.dim ? 'rgba(150, 170, 215, .24)' : 'rgba(8, 12, 20, .85)';
    g.fillRect(wx, wy, cellW * 0.6, cellH * 0.58);
  }

  // The roof.
  roundedRect(g, x, y, w, roofH, 4);
  g.fillStyle = lit ? hsl(hue, 46, 29) : hsl(hue, 9, 15);
  g.fill();
  g.strokeStyle = lit ? hsl(hue, 52, 40) : hsl(hue, 9, 21);
  g.lineWidth = 2.5;
  roundedRect(g, x + 1.5, y + 1.5, w - 3, roofH - 3, 3);
  g.stroke();
  g.fillStyle = lit ? hsl(hue, 60, 52, 0.55) : 'rgba(170, 190, 220, .08)';
  g.fillRect(x + 3, y + roofH - 2.5, w - 6, 1.6);

  g.save();
  g.translate(x, y);
  for (const feature of b.features) drawFeature(g, feature, lit, hue, accent);
  g.restore();

  if (lit) {
    roundedRect(g, x + 0.5, y + 0.5, w - 1, h - 1, 4);
    neonStroke(g, accent, 1.3);
  }
}

function drawSign(g, sign, lit) {
  const top = sign.y - sign.h / 2;
  if (lit) {
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, sign.color, sign.x, sign.y, sign.h * 2.2, 0.75);
    g.globalCompositeOperation = 'source-over';
  }
  roundedRect(g, sign.x - 6, top, 12, sign.h, 3);
  g.fillStyle = lit ? sign.color : '#272d3a';
  g.fill();
  g.fillStyle = lit ? 'rgba(255, 255, 255, .75)' : 'rgba(80, 90, 110, .5)';
  roundedRect(g, sign.x - 4, top + 2, 2, sign.h - 4, 1);
  g.fill();
  g.fillStyle = 'rgba(5, 8, 15, .85)';
  const slots = Math.max(2, Math.floor(sign.h / 11));
  for (let i = 0; i < slots; i++) g.fillRect(sign.x - 1.5, top + 5 + i * ((sign.h - 8) / slots), 4.5, 3.2);
}

function drawLamp(g, lamp, lit) {
  g.fillStyle = 'rgba(0, 0, 0, .4)';
  g.beginPath();
  g.arc(lamp.x + 1.5, lamp.y + 2, 3.4, 0, Math.PI * 2);
  g.fill();
  if (lit) {
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, '#ffe3a1', lamp.x, lamp.y, 22, 1);
    g.globalCompositeOperation = 'source-over';
  }
  g.fillStyle = lit ? '#fff4d1' : '#394150';
  g.beginPath();
  g.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
  g.fill();
}

// One city block, dark (HALO's curfew) or lit. The canvas covers the lot
// plus BLOCK_PAD on every side.
export function bakeBlock(scene, { lit, accent, k }) {
  const size = LOT + BLOCK_PAD * 2;
  const canvas = makeCanvas(size * k, size * k);
  const g = canvas.getContext('2d');
  g.scale(k, k);
  g.translate(BLOCK_PAD, BLOCK_PAD);
  const hue = scene.hue;

  if (lit) {
    // The block's light spills onto the street around it.
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, accent, LOT / 2, LOT / 2, LOT * 1.5, 0.18);
    g.globalCompositeOperation = 'source-over';
  }

  roundedRect(g, 0, 0, LOT, LOT, 10);
  g.fillStyle = lit ? hsl(hue, 20, 16) : '#141a26';
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = lit ? 'rgba(255, 232, 205, .06)' : 'rgba(150, 170, 200, .035)';
  g.lineWidth = 1;
  g.beginPath();
  for (let v = 12; v < LOT; v += 12) {
    g.moveTo(v, 0);
    g.lineTo(v, LOT);
    g.moveTo(0, v);
    g.lineTo(LOT, v);
  }
  g.stroke();
  g.restore();
  roundedRect(g, 1, 1, LOT - 2, LOT - 2, 9);
  g.strokeStyle = lit ? hsl(hue, 30, 42, 0.5) : 'rgba(125, 145, 175, .16)';
  g.lineWidth = 2;
  g.stroke();

  if (lit) {
    g.globalCompositeOperation = 'lighter';
    for (const lamp of scene.lamps) drawGlow(g, '#ffbf6b', lamp.x, lamp.y, 120, 0.42);
    g.globalCompositeOperation = 'source-over';
  }
  for (const tree of scene.trees) drawTree(g, tree.x, tree.y, tree.r, lit, 135);
  for (const building of scene.buildings) drawBuilding(g, building, lit, accent);
  if (scene.sign) drawSign(g, scene.sign, lit);
  for (const lamp of scene.lamps) drawLamp(g, lamp, lit);
  return canvas;
}

// -------------------------------------------------------------- vehicles

// Sprites return their canvas plus the world-space box they cover, centred
// on the object's origin.
function sprite(width, height, k, draw) {
  const canvas = makeCanvas(width * k, height * k);
  const g = canvas.getContext('2d');
  g.scale(k, k);
  g.translate(width / 2, height / 2);
  draw(g);
  return { canvas, w: width, h: height };
}

export function bakeBike(paint, k) {
  return sprite(72, 52, k, (g) => {
    // Glow under the hull.
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, paint, 0, 0, 66, 0.55);
    g.globalCompositeOperation = 'source-over';
    // Side pods.
    g.fillStyle = rgba(paint, 0.55);
    roundedRect(g, -17, -14, 20, 5, 2.5);
    g.fill();
    roundedRect(g, -17, 9, 20, 5, 2.5);
    g.fill();
    // Hull.
    g.beginPath();
    g.moveTo(24, 0);
    g.quadraticCurveTo(14, -10, 2, -10);
    g.lineTo(-16, -8);
    g.quadraticCurveTo(-21, 0, -16, 8);
    g.lineTo(2, 10);
    g.quadraticCurveTo(14, 10, 24, 0);
    g.closePath();
    const hull = g.createLinearGradient(0, -10, 0, 10);
    hull.addColorStop(0, '#ffffff');
    hull.addColorStop(0.25, paint);
    hull.addColorStop(1, rgba(paint, 0.8));
    g.fillStyle = hull;
    g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, .55)';
    g.lineWidth = 1;
    g.stroke();
    // Cockpit with Kit's helmet.
    g.fillStyle = '#0a1422';
    g.beginPath();
    g.ellipse(4, 0, 9, 5.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(1, 0, 3.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = rgba(paint, 0.9);
    g.fillRect(2.4, -1.6, 2.6, 3.2);
    // Headlight and tail fins.
    g.fillStyle = '#eafcff';
    g.beginPath();
    g.arc(21, 0, 2.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ff7aa8';
    g.fillRect(-19, -5, 3, 2.5);
    g.fillRect(-19, 2.5, 3, 2.5);
  });
}

export function bakeCar(color, length, k) {
  const L = length;
  return sprite(L + 10, 26, k, (g) => {
    g.fillStyle = 'rgba(0, 0, 0, .45)';
    roundedRect(g, -L / 2 + 2, -7 + 3.5, L, 14, 5);
    g.fill();
    const body = g.createLinearGradient(0, -7, 0, 7);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.18, color);
    body.addColorStop(1, rgba(color, 0.78));
    g.fillStyle = body;
    roundedRect(g, -L / 2, -7, L, 14, 5);
    g.fill();
    g.fillStyle = '#0b1420';
    roundedRect(g, -L * 0.12, -5, L * 0.38, 10, 3);
    g.fill();
    g.fillStyle = 'rgba(160, 220, 255, .35)';
    roundedRect(g, L * 0.08, -4.2, L * 0.12, 8.4, 2);
    g.fill();
    g.fillStyle = 'rgba(255, 255, 255, .25)';
    g.fillRect(-L / 2 + 3, -5.5, L * 0.28, 1.4);
    g.fillStyle = '#f2fbff';
    g.fillRect(L / 2 - 2.5, -5, 2, 3);
    g.fillRect(L / 2 - 2.5, 2, 2, 3);
    g.fillStyle = '#ff4466';
    g.fillRect(-L / 2, -5, 1.8, 3);
    g.fillRect(-L / 2, 2, 1.8, 3);
  });
}

// A friendly round patrol drone. `color` is its scanner state colour.
export function bakeDrone(color, k) {
  return sprite(62, 50, k, (g) => {
    g.fillStyle = 'rgba(0, 0, 0, .4)';
    g.beginPath();
    g.ellipse(4, 9, 22, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, color, 0, 0, 58, 0.55);
    g.globalCompositeOperation = 'source-over';
    for (const [rx, ry] of [[-15, -13], [15, -13], [-15, 13], [15, 13]]) {
      g.fillStyle = 'rgba(160, 190, 220, .18)';
      g.beginPath();
      g.arc(rx, ry, 8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(200, 225, 255, .45)';
      g.lineWidth = 1;
      g.stroke();
      g.strokeStyle = '#46566e';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(rx * 0.75, ry * 0.75);
      g.stroke();
    }
    g.fillStyle = '#1a2436';
    roundedRect(g, -15, -10, 30, 20, 9);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 1.6;
    g.stroke();
    g.fillStyle = '#56708f';
    roundedRect(g, -10, -7, 13, 14, 6);
    g.fill();
    // The lens looks where the scanner points.
    g.fillStyle = '#0b1220';
    g.beginPath();
    g.arc(8, 0, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(9, 0, 3.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(10, -1.4, 1.2, 0, Math.PI * 2);
    g.fill();
  });
}

export function bakeRunner(kind, k) {
  return sprite(44, 44, k, (g) => {
    g.fillStyle = 'rgba(0, 0, 0, .35)';
    g.beginPath();
    g.ellipse(2, 12, 13, 5, 0, 0, Math.PI * 2);
    g.fill();
    if (kind === 'cat') {
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, '#ffb35c', 0, 0, 44, 0.5);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#ff9e4a';
      g.beginPath();
      g.moveTo(-10, -3); g.lineTo(-9, -16); g.lineTo(-2, -9);
      g.moveTo(10, -3); g.lineTo(9, -16); g.lineTo(2, -9);
      g.fill();
      g.beginPath();
      g.arc(0, 0, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffd2a8';
      g.beginPath();
      g.ellipse(0, 4, 6, 4.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffc2d0';
      g.beginPath(); g.moveTo(-8, -10); g.lineTo(-7.5, -14); g.lineTo(-4.5, -10); g.fill();
      g.beginPath(); g.moveTo(8, -10); g.lineTo(7.5, -14); g.lineTo(4.5, -10); g.fill();
      g.fillStyle = '#1b1024';
      g.beginPath();
      g.arc(-4, -1, 2, 0, Math.PI * 2);
      g.arc(4, -1, 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(-4.6, -2.4, 1, 1);
      g.fillRect(3.4, -2.4, 1, 1);
      g.fillStyle = '#ff6b9a';
      g.beginPath(); g.moveTo(-1.4, 2.2); g.lineTo(1.4, 2.2); g.lineTo(0, 3.6); g.fill();
    } else {
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, '#c775ff', 0, 0, 44, 0.5);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#d9c4ff';
      roundedRect(g, -11, -10, 22, 18, 6);
      g.fill();
      g.fillStyle = '#b79cf0';
      roundedRect(g, -8, 8, 6, 5, 2);
      g.fill();
      roundedRect(g, 2, 8, 6, 5, 2);
      g.fill();
      g.fillStyle = '#1b1024';
      roundedRect(g, -8, -6, 16, 8, 3);
      g.fill();
      g.fillStyle = '#6df0bd';
      g.fillRect(-6, -4, 4, 4);
      g.fillRect(2, -4, 4, 4);
      g.fillStyle = '#ff8fc1';
      g.fillRect(-4, 4, 8, 1.6);
      g.strokeStyle = '#d9c4ff';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(0, -16);
      g.stroke();
    }
  });
}

export function bakeLantern(color, lit, k) {
  return sprite(18, 22, k, (g) => {
    g.fillStyle = lit ? '#3a2a20' : '#1d1f26';
    g.fillRect(-3, -9, 6, 2.2);
    g.fillRect(-3, 7, 6, 2.2);
    const body = g.createRadialGradient(-1, -2, 1, 0, 0, 8);
    if (lit) {
      body.addColorStop(0, '#fffbe8');
      body.addColorStop(0.45, color);
      body.addColorStop(1, rgba(color, 0.85));
    } else {
      body.addColorStop(0, '#3b3f4c');
      body.addColorStop(1, '#262a34');
    }
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 0, 6.5, 7.6, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = lit ? 'rgba(80, 30, 20, .35)' : 'rgba(120, 130, 150, .25)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.ellipse(0, 0, 3, 7.4, 0, 0, Math.PI * 2);
    g.moveTo(-6.4, 0);
    g.lineTo(6.4, 0);
    g.stroke();
  });
}
