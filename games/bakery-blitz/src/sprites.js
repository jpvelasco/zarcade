// Every picture in the bakery, baked once into offscreen canvases so the frame
// loop only ever blits. Nothing here runs per frame, so shadows and gradients
// are fine; the renderer must not add any.
import { RECIPES, STATIONS, CUSTOMERS } from './recipes.js';

const DISH_BOX = 96;
const STATION_BOX = 160;
const CUSTOMER_BOX = 150;

export function makeCanvas(w, h) {
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(Math.max(1, w), Math.max(1, h))
    : Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, h) });
  return canvas;
}

function bake(w, h, draw) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  return canvas;
}

// ------------------------------------------------------------------- helpers

export function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function fill(ctx, color) {
  ctx.fillStyle = color;
  ctx.fill();
}

function line(ctx, color, width, cap = 'round') {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// Tints a baked sprite without touching anything outside its shape.
function tint(canvas, color, alpha) {
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// ------------------------------------------------------------------- dishes

const DISH_ART = {
  cocoa(ctx, s) {
    const c = s / 2;
    ellipse(ctx, c, s * 0.84, s * 0.3, s * 0.07);
    fill(ctx, 'rgba(90,50,30,0.22)');
    // handle
    ctx.beginPath();
    ctx.arc(s * 0.72, s * 0.58, s * 0.13, -1.1, 1.1);
    line(ctx, '#e8d3b8', s * 0.075);
    roundRect(ctx, s * 0.26, s * 0.34, s * 0.44, s * 0.46, s * 0.09);
    fill(ctx, '#fff6ea');
    roundRect(ctx, s * 0.26, s * 0.34, s * 0.44, s * 0.46, s * 0.09);
    line(ctx, '#d9b78f', s * 0.035);
    ellipse(ctx, c - s * 0.02, s * 0.38, s * 0.19, s * 0.055);
    fill(ctx, '#6b3b1f');
    ellipse(ctx, c - s * 0.02, s * 0.375, s * 0.185, s * 0.05);
    fill(ctx, '#8d5524');
    roundRect(ctx, c - s * 0.07, s * 0.345, s * 0.1, s * 0.055, s * 0.02);
    fill(ctx, '#fffaf2');
    // steam
    ctx.beginPath();
    ctx.moveTo(c - s * 0.08, s * 0.28);
    ctx.quadraticCurveTo(c - s * 0.02, s * 0.21, c - s * 0.08, s * 0.14);
    ctx.moveTo(c + s * 0.08, s * 0.3);
    ctx.quadraticCurveTo(c + s * 0.14, s * 0.22, c + s * 0.08, s * 0.16);
    line(ctx, 'rgba(255,255,255,0.72)', s * 0.035);
  },
  pretzel(ctx, s) {
    ctx.save();
    ctx.translate(0, s * 0.04);
    const loops = [[s * 0.33, s * 0.62, s * 0.16], [s * 0.67, s * 0.62, s * 0.16], [s * 0.5, s * 0.36, s * 0.17]];
    for (const [x, y, r] of loops) {
      circle(ctx, x, y, r);
      line(ctx, '#8d4f20', s * 0.15);
    }
    for (const [x, y, r] of loops) {
      circle(ctx, x, y, r);
      line(ctx, '#c8812f', s * 0.1);
    }
    for (const [x, y, r] of loops) {
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI * 1.1, Math.PI * 1.75);
      line(ctx, 'rgba(255,224,170,0.55)', s * 0.035);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y] of [[0.36, 0.42], [0.62, 0.46], [0.5, 0.72], [0.28, 0.6], [0.72, 0.64]]) {
      circle(ctx, s * x, s * y, s * 0.022);
      ctx.fill();
    }
  },
  smoothie(ctx, s) {
    const c = s / 2;
    ctx.beginPath();
    ctx.moveTo(s * 0.33, s * 0.26);
    ctx.lineTo(s * 0.67, s * 0.26);
    ctx.lineTo(s * 0.61, s * 0.84);
    ctx.quadraticCurveTo(c, s * 0.9, s * 0.39, s * 0.84);
    ctx.closePath();
    fill(ctx, 'rgba(255,255,255,0.3)');
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#d05283';
    ctx.fillRect(s * 0.3, s * 0.34, s * 0.42, s * 0.6);
    ctx.fillStyle = '#e97aa5';
    ctx.fillRect(s * 0.3, s * 0.34, s * 0.42, s * 0.1);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(s * 0.33, s * 0.26);
    ctx.lineTo(s * 0.67, s * 0.26);
    ctx.lineTo(s * 0.61, s * 0.84);
    ctx.quadraticCurveTo(c, s * 0.9, s * 0.39, s * 0.84);
    ctx.closePath();
    line(ctx, 'rgba(255,255,255,0.8)', s * 0.03);
    ctx.beginPath();
    ctx.moveTo(s * 0.56, s * 0.3);
    ctx.lineTo(s * 0.72, s * 0.12);
    line(ctx, '#ffd166', s * 0.055);
    circle(ctx, s * 0.44, s * 0.29, s * 0.055);
    fill(ctx, '#8e3d6b');
    circle(ctx, s * 0.43, s * 0.275, s * 0.02);
    fill(ctx, 'rgba(255,255,255,0.6)');
  },
  cupcake(ctx, s) {
    const c = s / 2;
    ctx.beginPath();
    ctx.moveTo(s * 0.29, s * 0.52);
    ctx.lineTo(s * 0.71, s * 0.52);
    ctx.lineTo(s * 0.63, s * 0.86);
    ctx.lineTo(s * 0.37, s * 0.86);
    ctx.closePath();
    fill(ctx, '#e78fa6');
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < 5; i++) ctx.fillRect(s * (0.3 + i * 0.09), s * 0.5, s * 0.035, s * 0.4);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(s * 0.29, s * 0.52);
    ctx.lineTo(s * 0.71, s * 0.52);
    ctx.lineTo(s * 0.63, s * 0.86);
    ctx.lineTo(s * 0.37, s * 0.86);
    ctx.closePath();
    line(ctx, '#c4697f', s * 0.025);
    for (const [x, y, r] of [[0.36, 0.5, 0.11], [0.64, 0.5, 0.11], [0.5, 0.44, 0.14], [0.44, 0.33, 0.1], [0.58, 0.32, 0.095], [0.5, 0.24, 0.085]]) {
      circle(ctx, s * x, s * y, s * r);
      fill(ctx, '#ff7fb0');
    }
    for (const [x, y, r] of [[0.42, 0.44, 0.05], [0.47, 0.3, 0.04]]) {
      circle(ctx, s * x, s * y, s * r);
      fill(ctx, 'rgba(255,255,255,0.45)');
    }
    circle(ctx, s * 0.5, s * 0.15, s * 0.055);
    fill(ctx, '#e0433f');
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.1);
    ctx.quadraticCurveTo(s * 0.56, s * 0.05, s * 0.6, s * 0.08);
    line(ctx, '#5c8b3a', s * 0.025);
    ctx.fillStyle = '#ffe06a';
    for (const [x, y] of [[0.4, 0.38], [0.58, 0.4], [0.52, 0.32], [0.62, 0.28]]) {
      circle(ctx, s * x, s * y, s * 0.018);
      ctx.fill();
    }
  },
  tart(ctx, s) {
    const c = s / 2;
    circle(ctx, c, s * 0.56, s * 0.33);
    fill(ctx, '#d9a062');
    circle(ctx, c, s * 0.56, s * 0.33);
    line(ctx, '#b07a3f', s * 0.03);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      circle(ctx, c + Math.cos(a) * s * 0.32, s * 0.56 + Math.sin(a) * s * 0.32, s * 0.045);
      fill(ctx, '#e8b374');
    }
    circle(ctx, c, s * 0.555, s * 0.245);
    fill(ctx, '#c0302f');
    circle(ctx, c, s * 0.55, s * 0.235);
    fill(ctx, '#e0433f');
    ctx.save();
    circle(ctx, c, s * 0.55, s * 0.235);
    ctx.clip();
    ctx.strokeStyle = '#e8b374';
    ctx.lineWidth = s * 0.045;
    for (const d of [-0.16, 0, 0.16]) {
      ctx.beginPath();
      ctx.moveTo(c - s * 0.3 + s * d, s * 0.28);
      ctx.lineTo(c + s * 0.1 + s * d, s * 0.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c + s * 0.3 + s * d, s * 0.28);
      ctx.lineTo(c - s * 0.1 + s * d, s * 0.85);
      ctx.stroke();
    }
    ctx.restore();
    ellipse(ctx, c - s * 0.1, s * 0.44, s * 0.08, s * 0.035, -0.5);
    fill(ctx, 'rgba(255,255,255,0.28)');
  },
  cookies(ctx, s) {
    for (const [x, y] of [[0.34, 0.4], [0.66, 0.4], [0.5, 0.33]]) {
      circle(ctx, s * x, s * y, s * 0.14);
      fill(ctx, '#c08552');
      circle(ctx, s * x, s * y, s * 0.14);
      line(ctx, '#9a6334', s * 0.022);
      ctx.fillStyle = '#5a3418';
      for (const [dx, dy] of [[-0.05, -0.03], [0.04, 0.02], [0, 0.06], [0.05, -0.05]]) {
        circle(ctx, s * (x + dx), s * (y + dy), s * 0.022);
        ctx.fill();
      }
    }
    roundRect(ctx, s * 0.21, s * 0.46, s * 0.58, s * 0.38, s * 0.05);
    fill(ctx, '#c98a52');
    roundRect(ctx, s * 0.21, s * 0.46, s * 0.58, s * 0.38, s * 0.05);
    line(ctx, '#9a6334', s * 0.028);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(s * 0.21, s * 0.46, s * 0.58, s * 0.07);
    ctx.fillStyle = '#ff7fb0';
    ctx.fillRect(s * 0.455, s * 0.46, s * 0.09, s * 0.38);
    ctx.fillRect(s * 0.21, s * 0.6, s * 0.58, s * 0.08);
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.6);
      ctx.quadraticCurveTo(s * (0.5 + dir * 0.14), s * 0.5, s * (0.5 + dir * 0.17), s * 0.62);
      ctx.closePath();
      fill(ctx, '#ff9ec4');
    }
  },
  cake(ctx, s) {
    ellipse(ctx, s * 0.5, s * 0.88, s * 0.33, s * 0.06);
    fill(ctx, 'rgba(90,50,30,0.2)');
    const tiers = [[0.2, 0.66, 0.6, 0.2], [0.26, 0.48, 0.48, 0.19], [0.32, 0.32, 0.36, 0.17]];
    tiers.forEach(([x, y, w, h], i) => {
      roundRect(ctx, s * x, s * y, s * w, s * h, s * 0.035);
      fill(ctx, i % 2 ? '#fff0d0' : '#ffe6bd');
      roundRect(ctx, s * x, s * y, s * w, s * h, s * 0.035);
      line(ctx, '#d8ab74', s * 0.022);
      ctx.fillStyle = '#ff9ec4';
      ctx.fillRect(s * x + s * 0.01, s * (y + h * 0.42), s * w - s * 0.02, s * h * 0.2);
      // frosting drips along the top edge
      ctx.beginPath();
      ctx.moveTo(s * x, s * y);
      const steps = 5;
      for (let k = 0; k < steps; k++) {
        const x0 = s * (x + (w * k) / steps);
        const x1 = s * (x + (w * (k + 1)) / steps);
        ctx.quadraticCurveTo((x0 + x1) / 2, s * (y + 0.05), x1, s * y);
      }
      ctx.lineTo(s * (x + w), s * y);
      ctx.lineTo(s * x, s * y);
      ctx.closePath();
      fill(ctx, '#fffaf0');
    });
    for (const [x, y] of [[0.42, 0.28], [0.52, 0.26], [0.6, 0.3]]) {
      circle(ctx, s * x, s * y, s * 0.045);
      fill(ctx, '#e0433f');
      circle(ctx, s * (x - 0.012), s * (y - 0.012), s * 0.016);
      fill(ctx, 'rgba(255,255,255,0.5)');
    }
  },
  special(ctx, s, color = '#9b7bff') {
    const c = s / 2;
    ellipse(ctx, c, s * 0.82, s * 0.31, s * 0.065);
    fill(ctx, 'rgba(90,50,30,0.2)');
    ctx.beginPath();
    ctx.moveTo(s * 0.22, s * 0.78);
    ctx.quadraticCurveTo(s * 0.22, s * 0.3, c, s * 0.26);
    ctx.quadraticCurveTo(s * 0.78, s * 0.3, s * 0.78, s * 0.78);
    ctx.closePath();
    fill(ctx, '#f0d6a8');
    ctx.beginPath();
    ctx.moveTo(s * 0.24, s * 0.6);
    ctx.quadraticCurveTo(c, s * 0.3, s * 0.76, s * 0.6);
    ctx.quadraticCurveTo(c, s * 0.52, s * 0.24, s * 0.6);
    ctx.closePath();
    fill(ctx, color);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(s * (0.3 + i * 0.14), s * 0.72);
      ctx.quadraticCurveTo(s * (0.36 + i * 0.14), s * 0.6, s * (0.32 + i * 0.14), s * 0.5);
      line(ctx, 'rgba(255,255,255,0.4)', s * 0.03);
    }
    ctx.beginPath();
    ctx.moveTo(s * 0.22, s * 0.78);
    ctx.quadraticCurveTo(s * 0.22, s * 0.3, c, s * 0.26);
    ctx.quadraticCurveTo(s * 0.78, s * 0.3, s * 0.78, s * 0.78);
    ctx.closePath();
    line(ctx, '#c9a06a', s * 0.028);
    // a little sparkle so the special always reads as special
    ctx.save();
    ctx.translate(s * 0.72, s * 0.26);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * s * 0.1, Math.sin(a) * s * 0.1);
    }
    line(ctx, '#fff3c4', s * 0.026);
    ctx.restore();
  },
};

// ----------------------------------------------------------------- stations

const STATION_ART = {
  mixer(ctx, s) {
    ellipse(ctx, s * 0.5, s * 0.84, s * 0.34, s * 0.05);
    fill(ctx, 'rgba(60,30,14,0.2)');
    roundRect(ctx, s * 0.2, s * 0.3, s * 0.1, s * 0.5, s * 0.04);
    fill(ctx, '#cfd8e3');
    roundRect(ctx, s * 0.2, s * 0.28, s * 0.42, s * 0.1, s * 0.04);
    fill(ctx, '#e6edf5');
    roundRect(ctx, s * 0.46, s * 0.34, s * 0.07, s * 0.16, s * 0.03);
    fill(ctx, '#aab6c4');
    ctx.beginPath();
    ctx.moveTo(s * 0.3, s * 0.5);
    ctx.lineTo(s * 0.78, s * 0.5);
    ctx.quadraticCurveTo(s * 0.74, s * 0.82, s * 0.54, s * 0.82);
    ctx.quadraticCurveTo(s * 0.34, s * 0.82, s * 0.3, s * 0.5);
    ctx.closePath();
    fill(ctx, '#e9eff6');
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#fff6e2';
    ctx.fillRect(s * 0.28, s * 0.58, s * 0.52, s * 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ellipse(ctx, s * 0.44, s * 0.6, s * 0.08, s * 0.03);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(s * 0.3, s * 0.5);
    ctx.lineTo(s * 0.78, s * 0.5);
    line(ctx, '#b9c4d2', s * 0.03);
  },
  oven(ctx, s) {
    roundRect(ctx, s * 0.12, s * 0.22, s * 0.76, s * 0.66, s * 0.07);
    fill(ctx, '#8a6a52');
    roundRect(ctx, s * 0.12, s * 0.22, s * 0.76, s * 0.66, s * 0.07);
    line(ctx, '#5f452f', s * 0.03);
    roundRect(ctx, s * 0.12, s * 0.22, s * 0.76, s * 0.14, s * 0.06);
    fill(ctx, '#9d7a5e');
    roundRect(ctx, s * 0.2, s * 0.42, s * 0.6, s * 0.38, s * 0.05);
    fill(ctx, '#3a2318');
    roundRect(ctx, s * 0.2, s * 0.42, s * 0.6, s * 0.38, s * 0.05);
    line(ctx, '#2a1811', s * 0.025);
    roundRect(ctx, s * 0.24, s * 0.74, s * 0.52, s * 0.05, s * 0.02);
    fill(ctx, '#d9c3a5');
    for (const x of [0.26, 0.74]) {
      circle(ctx, s * x, s * 0.29, s * 0.045);
      fill(ctx, '#f0dcc2');
      circle(ctx, s * x, s * 0.29, s * 0.045);
      line(ctx, '#7c5c42', s * 0.018);
      ctx.beginPath();
      ctx.moveTo(s * x, s * 0.29);
      ctx.lineTo(s * x, s * 0.26);
      line(ctx, '#7c5c42', s * 0.016);
    }
  },
  icing(ctx, s) {
    roundRect(ctx, s * 0.1, s * 0.62, s * 0.8, s * 0.22, s * 0.05);
    fill(ctx, '#e8d3b8');
    roundRect(ctx, s * 0.1, s * 0.62, s * 0.8, s * 0.22, s * 0.05);
    line(ctx, '#bb9a78', s * 0.028);
    ctx.save();
    ctx.translate(s * 0.62, s * 0.2);
    ctx.rotate(0.5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.2, s * 0.08, s * 0.12, s * 0.36);
    ctx.quadraticCurveTo(s * 0.04, s * 0.46, -s * 0.06, s * 0.36);
    ctx.quadraticCurveTo(-s * 0.14, s * 0.08, 0, 0);
    ctx.closePath();
    fill(ctx, '#fdf2e2');
    ctx.beginPath();
    ctx.moveTo(s * 0.02, s * 0.4);
    ctx.lineTo(s * 0.02, s * 0.5);
    line(ctx, '#c9a06a', s * 0.07);
    ctx.restore();
    for (const [x, y, r] of [[0.3, 0.54, 0.1], [0.24, 0.46, 0.08], [0.33, 0.4, 0.07]]) {
      circle(ctx, s * x, s * y, s * r);
      fill(ctx, '#ff9ec4');
    }
    ctx.fillStyle = '#ffe06a';
    for (const [x, y] of [[0.26, 0.42], [0.34, 0.48], [0.3, 0.36]]) {
      circle(ctx, s * x, s * y, s * 0.016);
      ctx.fill();
    }
  },
  jam(ctx, s) {
    roundRect(ctx, s * 0.2, s * 0.42, s * 0.6, s * 0.42, s * 0.12);
    fill(ctx, '#9c5a3c');
    roundRect(ctx, s * 0.2, s * 0.42, s * 0.6, s * 0.42, s * 0.12);
    line(ctx, '#6e3c26', s * 0.03);
    ellipse(ctx, s * 0.5, s * 0.44, s * 0.31, s * 0.08);
    fill(ctx, '#7c4529');
    ellipse(ctx, s * 0.5, s * 0.43, s * 0.26, s * 0.06);
    fill(ctx, '#e0433f');
    for (const [x, y, r] of [[0.42, 0.41, 0.035], [0.56, 0.44, 0.028], [0.5, 0.39, 0.022]]) {
      circle(ctx, s * x, s * y, s * r);
      fill(ctx, '#ff7a6e');
    }
    ctx.beginPath();
    ctx.moveTo(s * 0.64, s * 0.4);
    ctx.lineTo(s * 0.78, s * 0.16);
    line(ctx, '#c9a06a', s * 0.05);
    ellipse(ctx, s * 0.79, s * 0.14, s * 0.05, s * 0.035, 0.5);
    fill(ctx, '#d9b78f');
    ctx.beginPath();
    ctx.moveTo(s * 0.34, s * 0.34);
    ctx.quadraticCurveTo(s * 0.4, s * 0.26, s * 0.34, s * 0.2);
    line(ctx, 'rgba(255,255,255,0.5)', s * 0.03);
  },
  cocoa(ctx, s) {
    roundRect(ctx, s * 0.24, s * 0.26, s * 0.52, s * 0.54, s * 0.08);
    fill(ctx, '#b9733f');
    roundRect(ctx, s * 0.24, s * 0.26, s * 0.52, s * 0.54, s * 0.08);
    line(ctx, '#8a5128', s * 0.03);
    roundRect(ctx, s * 0.2, s * 0.22, s * 0.6, s * 0.1, s * 0.04);
    fill(ctx, '#d08f54');
    roundRect(ctx, s * 0.42, s * 0.14, s * 0.16, s * 0.08, s * 0.03);
    fill(ctx, '#8a5128');
    ctx.beginPath();
    ctx.moveTo(s * 0.76, s * 0.56);
    ctx.lineTo(s * 0.86, s * 0.56);
    ctx.lineTo(s * 0.86, s * 0.64);
    line(ctx, '#8a5128', s * 0.045);
    roundRect(ctx, s * 0.32, s * 0.4, s * 0.36, s * 0.12, s * 0.04);
    fill(ctx, 'rgba(255,240,215,0.75)');
    ctx.beginPath();
    ctx.moveTo(s * 0.4, s * 0.12);
    ctx.quadraticCurveTo(s * 0.48, s * 0.04, s * 0.4, -s * 0.02);
    line(ctx, 'rgba(255,255,255,0.5)', s * 0.03);
  },
  decor(ctx, s) {
    roundRect(ctx, s * 0.08, s * 0.64, s * 0.84, s * 0.2, s * 0.05);
    fill(ctx, '#d9a978');
    roundRect(ctx, s * 0.08, s * 0.64, s * 0.84, s * 0.2, s * 0.05);
    line(ctx, '#a97c52', s * 0.028);
    const jars = [['#ff7fb0', 0.22], ['#7fd3ff', 0.42], ['#ffe06a', 0.62], ['#9ae26a', 0.8]];
    for (const [color, x] of jars) {
      roundRect(ctx, s * (x - 0.06), s * 0.38, s * 0.12, s * 0.26, s * 0.03);
      fill(ctx, 'rgba(255,255,255,0.4)');
      roundRect(ctx, s * (x - 0.05), s * 0.46, s * 0.1, s * 0.17, s * 0.025);
      fill(ctx, color);
      roundRect(ctx, s * (x - 0.07), s * 0.34, s * 0.14, s * 0.05, s * 0.02);
      fill(ctx, '#8a5128');
    }
  },
  juice(ctx, s) {
    roundRect(ctx, s * 0.16, s * 0.72, s * 0.68, s * 0.12, s * 0.04);
    fill(ctx, '#b9733f');
    roundRect(ctx, s * 0.24, s * 0.3, s * 0.1, s * 0.44, s * 0.03);
    fill(ctx, '#cfd8e3');
    roundRect(ctx, s * 0.24, s * 0.26, s * 0.5, s * 0.1, s * 0.04);
    fill(ctx, '#e6edf5');
    ctx.beginPath();
    ctx.moveTo(s * 0.7, s * 0.31);
    ctx.lineTo(s * 0.88, s * 0.18);
    line(ctx, '#8a5128', s * 0.06);
    roundRect(ctx, s * 0.44, s * 0.4, s * 0.26, s * 0.1, s * 0.03);
    fill(ctx, '#aab6c4');
    ctx.beginPath();
    ctx.moveTo(s * 0.46, s * 0.52);
    ctx.lineTo(s * 0.68, s * 0.52);
    ctx.lineTo(s * 0.63, s * 0.72);
    ctx.lineTo(s * 0.51, s * 0.72);
    ctx.closePath();
    fill(ctx, 'rgba(255,255,255,0.5)');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(s * 0.46, s * 0.52);
    ctx.lineTo(s * 0.68, s * 0.52);
    ctx.lineTo(s * 0.63, s * 0.72);
    ctx.lineTo(s * 0.51, s * 0.72);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#d05283';
    ctx.fillRect(s * 0.44, s * 0.58, s * 0.28, s * 0.2);
    ctx.restore();
  },
};

// ---------------------------------------------------------------- customers

function head(ctx, s, kind, cx, cy, r) {
  circle(ctx, cx, cy, r);
  fill(ctx, kind.fur);
  circle(ctx, cx, cy, r);
  line(ctx, 'rgba(60,30,14,0.3)', s * 0.015);
  ellipse(ctx, cx, cy + r * 0.38, r * 0.52, r * 0.36);
  fill(ctx, kind.ear);
}

const EARS = {
  bunny(ctx, s, kind, cx, cy, r) {
    for (const dir of [-1, 1]) {
      ellipse(ctx, cx + dir * r * 0.42, cy - r * 1.05, r * 0.22, r * 0.6, dir * 0.18);
      fill(ctx, kind.fur);
      ellipse(ctx, cx + dir * r * 0.42, cy - r * 1.02, r * 0.1, r * 0.42, dir * 0.18);
      fill(ctx, kind.ear);
    }
  },
  hedgehog(ctx, s, kind, cx, cy, r) {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.08 + (i / 8) * 0.84);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
      ctx.lineTo(cx + Math.cos(a) * r * 1.38, cy + Math.sin(a) * r * 1.38);
      line(ctx, '#6f4a2d', s * 0.022);
    }
  },
  fox(ctx, s, kind, cx, cy, r) {
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * r * 0.3, cy - r * 0.72);
      ctx.lineTo(cx + dir * r * 0.95, cy - r * 1.3);
      ctx.lineTo(cx + dir * r * 0.86, cy - r * 0.48);
      ctx.closePath();
      fill(ctx, kind.fur);
      ctx.beginPath();
      ctx.moveTo(cx + dir * r * 0.5, cy - r * 0.78);
      ctx.lineTo(cx + dir * r * 0.88, cy - r * 1.18);
      ctx.lineTo(cx + dir * r * 0.8, cy - r * 0.64);
      ctx.closePath();
      fill(ctx, '#fff3e6');
    }
  },
  cat(ctx, s, kind, cx, cy, r) {
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * r * 0.28, cy - r * 0.8);
      ctx.lineTo(cx + dir * r * 0.72, cy - r * 1.22);
      ctx.lineTo(cx + dir * r * 0.82, cy - r * 0.6);
      ctx.closePath();
      fill(ctx, kind.fur);
      ctx.beginPath();
      ctx.moveTo(cx + dir * r * 0.42, cy - r * 0.82);
      ctx.lineTo(cx + dir * r * 0.68, cy - r * 1.1);
      ctx.lineTo(cx + dir * r * 0.72, cy - r * 0.7);
      ctx.closePath();
      fill(ctx, kind.ear);
    }
  },
  owl(ctx, s, kind, cx, cy, r) {
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * r * 0.5, cy - r * 0.84);
      ctx.lineTo(cx + dir * r * 0.78, cy - r * 1.24);
      ctx.lineTo(cx + dir * r * 0.86, cy - r * 0.7);
      ctx.closePath();
      fill(ctx, kind.fur);
      circle(ctx, cx + dir * r * 0.36, cy - r * 0.04, r * 0.34);
      fill(ctx, '#fff6e6');
    }
  },
  bear(ctx, s, kind, cx, cy, r) {
    for (const dir of [-1, 1]) {
      circle(ctx, cx + dir * r * 0.72, cy - r * 0.72, r * 0.3);
      fill(ctx, kind.fur);
      circle(ctx, cx + dir * r * 0.72, cy - r * 0.72, r * 0.16);
      fill(ctx, kind.ear);
    }
  },
  squirrel(ctx, s, kind, cx, cy, r) {
    for (const dir of [-1, 1]) {
      ellipse(ctx, cx + dir * r * 0.66, cy - r * 0.76, r * 0.2, r * 0.26, dir * 0.4);
      fill(ctx, kind.fur);
    }
  },
  moose(ctx, s, kind, cx, cy, r) {
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * r * 0.5, cy - r * 0.8);
      ctx.lineTo(cx + dir * r * 0.9, cy - r * 1.3);
      ctx.moveTo(cx + dir * r * 0.78, cy - r * 1.14);
      ctx.lineTo(cx + dir * r * 1.2, cy - r * 1.14);
      ctx.moveTo(cx + dir * r * 0.86, cy - r * 1.22);
      ctx.lineTo(cx + dir * r * 1.1, cy - r * 1.5);
      line(ctx, '#c6a07a', s * 0.028);
    }
  },
  twins(ctx, s, kind, cx, cy, r) {
    EARS.bunny(ctx, s, kind, cx, cy, r);
  },
};

function customerArt(ctx, s, id) {
  const kind = CUSTOMERS[id];
  const cx = s * 0.5;
  const bodyTop = s * 0.5;
  // body
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.26, s * 0.95);
  ctx.quadraticCurveTo(cx - s * 0.3, bodyTop, cx, bodyTop - s * 0.02);
  ctx.quadraticCurveTo(cx + s * 0.3, bodyTop, cx + s * 0.26, s * 0.95);
  ctx.closePath();
  fill(ctx, kind.fur);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.26, s * 0.95);
  ctx.quadraticCurveTo(cx - s * 0.3, bodyTop, cx, bodyTop - s * 0.02);
  ctx.quadraticCurveTo(cx + s * 0.3, bodyTop, cx + s * 0.26, s * 0.95);
  ctx.closePath();
  line(ctx, 'rgba(60,30,14,0.28)', s * 0.015);
  ellipse(ctx, cx, s * 0.84, s * 0.17, s * 0.13);
  fill(ctx, kind.ear);
  if (id === 'squirrel') {
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.2, s * 0.9);
    ctx.quadraticCurveTo(cx + s * 0.56, s * 0.78, cx + s * 0.42, s * 0.42);
    ctx.quadraticCurveTo(cx + s * 0.36, s * 0.24, cx + s * 0.2, s * 0.34);
    ctx.quadraticCurveTo(cx + s * 0.4, s * 0.5, cx + s * 0.2, s * 0.9);
    ctx.closePath();
    fill(ctx, kind.ear);
  }
  if (id === 'twins') {
    EARS.twins(ctx, s, kind, cx - s * 0.16, s * 0.34, s * 0.14);
    head(ctx, s, kind, cx - s * 0.16, s * 0.34, s * 0.14);
    EARS.twins(ctx, s, kind, cx + s * 0.17, s * 0.36, s * 0.13);
    head(ctx, s, kind, cx + s * 0.17, s * 0.36, s * 0.13);
    return;
  }
  const r = s * (id === 'bear' || id === 'moose' ? 0.22 : 0.2);
  const cy = s * 0.33;
  EARS[id](ctx, s, kind, cx, cy, r);
  head(ctx, s, kind, cx, cy, r);
}

// ------------------------------------------------------------------- extras

function heartArt(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.86);
  ctx.bezierCurveTo(s * 0.04, s * 0.54, s * 0.16, s * 0.1, s * 0.5, s * 0.3);
  ctx.bezierCurveTo(s * 0.84, s * 0.1, s * 0.96, s * 0.54, s * 0.5, s * 0.86);
  ctx.closePath();
  fill(ctx, '#ff6b8e');
  ellipse(ctx, s * 0.34, s * 0.38, s * 0.1, s * 0.07, -0.5);
  fill(ctx, 'rgba(255,255,255,0.55)');
}

function coinArt(ctx, s) {
  circle(ctx, s * 0.5, s * 0.5, s * 0.44);
  fill(ctx, '#d99a2b');
  circle(ctx, s * 0.5, s * 0.5, s * 0.37);
  fill(ctx, '#ffd166');
  circle(ctx, s * 0.5, s * 0.5, s * 0.37);
  line(ctx, '#e2a93c', s * 0.04);
  ellipse(ctx, s * 0.38, s * 0.36, s * 0.1, s * 0.06, -0.6);
  fill(ctx, 'rgba(255,255,255,0.6)');
}

function starArt(ctx, s, on) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = s * (i % 2 ? 0.2 : 0.46);
    const fn = i ? 'lineTo' : 'moveTo';
    ctx[fn](s * 0.5 + Math.cos(a) * r, s * 0.5 + Math.sin(a) * r);
  }
  ctx.closePath();
  fill(ctx, on ? '#ffd166' : 'rgba(255,255,255,0.12)');
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = s * (i % 2 ? 0.2 : 0.46);
    const fn = i ? 'lineTo' : 'moveTo';
    ctx[fn](s * 0.5 + Math.cos(a) * r, s * 0.5 + Math.sin(a) * r);
  }
  ctx.closePath();
  line(ctx, on ? '#e2a93c' : 'rgba(255,255,255,0.3)', s * 0.05);
}

function glowArt(ctx, s, color) {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.45, color.replace('1)', '0.42)'));
  g.addColorStop(1, color.replace('1)', '0)'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

function bellArt(ctx, s) {
  circle(ctx, s * 0.5, s * 0.5, s * 0.46);
  fill(ctx, '#ffd166');
  ctx.beginPath();
  ctx.moveTo(s * 0.28, s * 0.66);
  ctx.quadraticCurveTo(s * 0.3, s * 0.3, s * 0.5, s * 0.26);
  ctx.quadraticCurveTo(s * 0.7, s * 0.3, s * 0.72, s * 0.66);
  ctx.closePath();
  fill(ctx, '#8a5128');
  ctx.fillRect(s * 0.24, s * 0.66, s * 0.52, s * 0.07);
  circle(ctx, s * 0.5, s * 0.78, s * 0.07);
  fill(ctx, '#8a5128');
}

function mouseArt(ctx, s) {
  ellipse(ctx, s * 0.46, s * 0.6, s * 0.3, s * 0.22);
  fill(ctx, '#c9c2cf');
  circle(ctx, s * 0.74, s * 0.46, s * 0.18);
  fill(ctx, '#d6d0db');
  circle(ctx, s * 0.66, s * 0.26, s * 0.13);
  fill(ctx, '#e8c3cf');
  circle(ctx, s * 0.86, s * 0.42, s * 0.03);
  fill(ctx, '#3a2318');
  ctx.beginPath();
  ctx.moveTo(s * 0.18, s * 0.62);
  ctx.quadraticCurveTo(s * 0.02, s * 0.5, s * 0.1, s * 0.3);
  line(ctx, '#e8c3cf', s * 0.045);
  roundRect(ctx, s * 0.3, s * 0.52, s * 0.3, s * 0.3, s * 0.05);
  fill(ctx, '#fff6e6');
}

function flowersArt(ctx, s) {
  roundRect(ctx, 0, s * 0.56, s, s * 0.42, s * 0.06);
  fill(ctx, '#8a5128');
  roundRect(ctx, 0, s * 0.56, s, s * 0.1, s * 0.04);
  fill(ctx, '#a9683a');
  const petals = ['#ff9ec4', '#ffe06a', '#fff6e6', '#ff8f6a'];
  for (let i = 0; i < 5; i++) {
    const x = s * (0.12 + i * 0.19);
    const y = s * (0.38 - (i % 2) * 0.1);
    ctx.beginPath();
    ctx.moveTo(x, s * 0.6);
    ctx.lineTo(x, y);
    line(ctx, '#5c8b3a', s * 0.03);
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      circle(ctx, x + Math.cos(a) * s * 0.055, y + Math.sin(a) * s * 0.055, s * 0.045);
      fill(ctx, petals[i % petals.length]);
    }
    circle(ctx, x, y, s * 0.035);
    fill(ctx, '#ffd166');
  }
}

function jukeboxArt(ctx, s) {
  roundRect(ctx, s * 0.1, s * 0.12, s * 0.8, s * 0.8, s * 0.18);
  fill(ctx, '#7c3f55');
  roundRect(ctx, s * 0.1, s * 0.12, s * 0.8, s * 0.8, s * 0.18);
  line(ctx, '#55283a', s * 0.04);
  roundRect(ctx, s * 0.2, s * 0.24, s * 0.6, s * 0.3, s * 0.12);
  fill(ctx, '#ffd166');
  roundRect(ctx, s * 0.24, s * 0.28, s * 0.52, s * 0.22, s * 0.1);
  fill(ctx, '#fff3c4');
  for (let i = 0; i < 4; i++) {
    roundRect(ctx, s * (0.22 + i * 0.15), s * 0.62, s * 0.1, s * 0.2, s * 0.04);
    fill(ctx, i % 2 ? '#ff9ec4' : '#7fd3ff');
  }
}

// ----------------------------------------------------------------- the pack

export class Sprites {
  constructor() {
    this.dish = Object.create(null);
    this.crispy = Object.create(null);
    this.station = Object.create(null);
    this.customer = Object.create(null);
    for (const id of Object.keys(RECIPES)) this.bakeDish(id);
    for (const id of Object.keys(STATIONS)) {
      this.station[id] = bake(STATION_BOX, STATION_BOX, (ctx, w) => STATION_ART[id](ctx, w));
    }
    for (const id of Object.keys(CUSTOMERS)) {
      this.customer[id] = bake(CUSTOMER_BOX, CUSTOMER_BOX, (ctx, w) => customerArt(ctx, w, id));
    }
    this.heart = bake(48, 48, heartArt);
    this.coin = bake(40, 40, coinArt);
    this.starOn = bake(48, 48, (ctx, w) => starArt(ctx, w, true));
    this.starOff = bake(48, 48, (ctx, w) => starArt(ctx, w, false));
    this.bell = bake(48, 48, bellArt);
    this.mouse = bake(64, 64, mouseArt);
    this.flowers = bake(120, 90, flowersArt);
    this.jukebox = bake(90, 90, jukeboxArt);
    this.glowWarm = bake(128, 128, (ctx, w) => glowArt(ctx, w, 'rgba(255,186,92,1)'));
    this.glowMint = bake(128, 128, (ctx, w) => glowArt(ctx, w, 'rgba(140,255,214,1)'));
    this.glowRose = bake(128, 128, (ctx, w) => glowArt(ctx, w, 'rgba(255,140,170,1)'));
  }

  // The daily special changes colour and name every day, so it re-bakes.
  bakeDish(id) {
    const recipe = RECIPES[id];
    const art = DISH_ART[id];
    this.dish[id] = bake(DISH_BOX, DISH_BOX, (ctx, w) => art(ctx, w, recipe.color));
    const crispy = bake(DISH_BOX, DISH_BOX, (ctx, w) => art(ctx, w, recipe.color));
    tint(crispy, '#6b3a14', 0.42);
    this.crispy[id] = crispy;
    return this.dish[id];
  }

  dishArt(id, quality) {
    return quality === 'crispy' ? this.crispy[id] : this.dish[id];
  }
}

// Where the food sits inside each station's picture, in station-sprite units:
// in the bowl, behind the oven door, on the icing plate.
export const STATION_SLOTS = {
  mixer: [0.54, 0.66],
  oven: [0.5, 0.61],
  icing: [0.31, 0.47],
  jam: [0.5, 0.44],
  cocoa: [0.5, 0.46],
  decor: [0.5, 0.52],
  juice: [0.57, 0.6],
};
