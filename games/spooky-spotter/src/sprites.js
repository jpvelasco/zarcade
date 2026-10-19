// The lost things, the ghosts, the curios and the shell of each room. Same
// rules as art.js: a context translated to the top left of a box, draw inside
// (0, 0, w, h).

import { rr, hsl, shade, mixHex, alpha, vseq } from './art.js';

function fillRR(c, x, y, w, h, r, fill) {
  rr(c, x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
}

function ell(c, x, y, rx, ry, fill) {
  c.beginPath();
  c.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
}

function line(c, x1, y1, x2, y2, col, width = 2) {
  c.strokeStyle = col;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

function poly(c, pts, fill) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
}

function star(c, cx, cy, r, points, inner, fill) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? r * inner : r;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
}

// ------------------------------------------------------------ lost things

const ITEM_ART = {
  teddy(c, w, h) {
    const fur = '#c98a53';
    const dark = shade(fur, -0.22);
    ell(c, w * 0.22, h * 0.2, w * 0.14, h * 0.13, dark);
    ell(c, w * 0.78, h * 0.2, w * 0.14, h * 0.13, dark);
    ell(c, w * 0.22, h * 0.2, w * 0.07, h * 0.065, '#e8b58a');
    ell(c, w * 0.78, h * 0.2, w * 0.07, h * 0.065, '#e8b58a');
    ell(c, w * 0.5, h * 0.3, w * 0.3, h * 0.24, fur);
    ell(c, w * 0.5, h * 0.37, w * 0.15, h * 0.1, '#e8c3a0');
    ell(c, w * 0.5, h * 0.34, w * 0.045, h * 0.035, '#3a2a22');
    ell(c, w * 0.41, h * 0.27, w * 0.04, h * 0.034, '#2a211c');
    ell(c, w * 0.59, h * 0.27, w * 0.04, h * 0.034, '#2a211c');
    ell(c, w * 0.42, h * 0.255, w * 0.014, h * 0.012, '#fff');
    ell(c, w * 0.6, h * 0.255, w * 0.014, h * 0.012, '#fff');
    ell(c, w * 0.5, h * 0.68, w * 0.27, h * 0.26, fur);
    ell(c, w * 0.5, h * 0.72, w * 0.16, h * 0.16, '#e8c3a0');
    ell(c, w * 0.17, h * 0.58, w * 0.13, h * 0.11, dark);
    ell(c, w * 0.83, h * 0.58, w * 0.13, h * 0.11, dark);
    ell(c, w * 0.3, h * 0.92, w * 0.14, h * 0.09, dark);
    ell(c, w * 0.7, h * 0.92, w * 0.14, h * 0.09, dark);
    c.strokeStyle = '#8a4a5a';
    c.lineWidth = Math.max(1.5, w * 0.03);
    c.beginPath();
    c.arc(w * 0.5, h * 0.47, w * 0.1, 0.2, Math.PI - 0.2);
    c.stroke();
  },
  spectacles(c, w, h) {
    const gold = '#e2c04a';
    c.strokeStyle = gold;
    c.lineWidth = Math.max(2, h * 0.11);
    c.beginPath();
    c.arc(w * 0.26, h * 0.52, w * 0.2, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(w * 0.74, h * 0.52, w * 0.2, 0, Math.PI * 2);
    c.stroke();
    ell(c, w * 0.26, h * 0.52, w * 0.18, h * 0.36, 'rgb(220 240 255 / 0.4)');
    ell(c, w * 0.74, h * 0.52, w * 0.18, h * 0.36, 'rgb(220 240 255 / 0.4)');
    line(c, w * 0.44, h * 0.46, w * 0.56, h * 0.46, gold, Math.max(2, h * 0.1));
    line(c, w * 0.07, h * 0.42, w * -0.02, h * 0.2, gold, Math.max(2, h * 0.08));
    line(c, w * 0.93, h * 0.42, w * 1.02, h * 0.2, gold, Math.max(2, h * 0.08));
  },
  teacup(c, w, h) {
    const porc = '#f2f6fb';
    ell(c, w * 0.46, h * 0.92, w * 0.3, h * 0.09, shade(porc, -0.3));
    c.beginPath();
    c.moveTo(w * 0.16, h * 0.3);
    c.quadraticCurveTo(w * 0.2, h * 0.9, w * 0.46, h * 0.88);
    c.quadraticCurveTo(w * 0.72, h * 0.9, w * 0.76, h * 0.3);
    c.closePath();
    c.fillStyle = porc;
    c.fill();
    ell(c, w * 0.46, h * 0.3, w * 0.3, h * 0.12, shade(porc, 0.4));
    ell(c, w * 0.46, h * 0.31, w * 0.25, h * 0.085, '#b4763a');
    c.strokeStyle = porc;
    c.lineWidth = Math.max(2, w * 0.07);
    c.beginPath();
    c.arc(w * 0.82, h * 0.52, w * 0.15, -1.2, 1.2);
    c.stroke();
    line(c, w * 0.22, h * 0.46, w * 0.7, h * 0.46, '#6f9ad8', Math.max(1.5, h * 0.05));
  },
  sock(c, w, h) {
    const base = '#fff2f6';
    c.beginPath();
    c.moveTo(w * 0.24, h * 0.04);
    c.lineTo(w * 0.66, h * 0.04);
    c.quadraticCurveTo(w * 0.7, h * 0.56, w * 0.64, h * 0.66);
    c.quadraticCurveTo(w * 0.98, h * 0.7, w * 0.94, h * 0.9);
    c.quadraticCurveTo(w * 0.88, h * 1.02, w * 0.4, h * 0.94);
    c.quadraticCurveTo(w * 0.2, h * 0.86, w * 0.24, h * 0.04);
    c.fillStyle = base;
    c.fill();
    c.save();
    c.beginPath();
    c.moveTo(w * 0.24, h * 0.04);
    c.lineTo(w * 0.66, h * 0.04);
    c.quadraticCurveTo(w * 0.7, h * 0.56, w * 0.64, h * 0.66);
    c.quadraticCurveTo(w * 0.98, h * 0.7, w * 0.94, h * 0.9);
    c.quadraticCurveTo(w * 0.88, h * 1.02, w * 0.4, h * 0.94);
    c.quadraticCurveTo(w * 0.2, h * 0.86, w * 0.24, h * 0.04);
    c.clip();
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? '#ff8ab0' : '#6fc8e8';
      c.fillRect(w * 0.18, h * (0.08 + i * 0.1), w * 0.9, h * 0.05);
    }
    c.restore();
    fillRR(c, w * 0.22, h * 0.0, w * 0.46, h * 0.12, 3, '#ffd2e2');
  },
  key(c, w, h) {
    const gold = '#e3b24a';
    line(c, w * 0.3, h * 0.5, w * 0.95, h * 0.5, gold, Math.max(2.5, h * 0.2));
    c.strokeStyle = gold;
    c.lineWidth = Math.max(2.5, h * 0.2);
    c.beginPath();
    c.arc(w * 0.22, h * 0.5, w * 0.16, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = gold;
    c.fillRect(w * 0.78, h * 0.5, w * 0.07, h * 0.36);
    c.fillRect(w * 0.9, h * 0.5, w * 0.07, h * 0.24);
    ell(c, w * 0.22, h * 0.5, w * 0.07, h * 0.2, 'rgb(0 0 0 / 0.18)');
  },
  mitten(c, w, h) {
    const wool = '#7fd0a8';
    c.beginPath();
    c.moveTo(w * 0.3, h * 0.26);
    c.quadraticCurveTo(w * 0.5, h * 0.1, w * 0.7, h * 0.26);
    c.quadraticCurveTo(w * 0.82, h * 0.5, w * 0.76, h * 0.78);
    c.lineTo(w * 0.26, h * 0.78);
    c.quadraticCurveTo(w * 0.2, h * 0.5, w * 0.3, h * 0.26);
    c.fillStyle = wool;
    c.fill();
    c.beginPath();
    c.moveTo(w * 0.78, h * 0.42);
    c.quadraticCurveTo(w * 0.98, h * 0.44, w * 0.94, h * 0.62);
    c.quadraticCurveTo(w * 0.86, h * 0.68, w * 0.78, h * 0.6);
    c.fillStyle = wool;
    c.fill();
    fillRR(c, w * 0.22, h * 0.76, w * 0.58, h * 0.22, 4, shade(wool, -0.2));
    c.globalAlpha = 0.5;
    for (let i = 0; i < 3; i++) line(c, w * 0.24, h * (0.8 + i * 0.06), w * 0.78, h * (0.8 + i * 0.06), shade(wool, -0.5), 1.5);
    c.globalAlpha = 1;
    ell(c, w * 0.5, h * 0.44, w * 0.1, h * 0.09, shade(wool, 0.3));
  },
  pocketwatch(c, w, h) {
    const gold = '#f0ca5a';
    c.strokeStyle = shade(gold, -0.2);
    c.lineWidth = Math.max(2, w * 0.06);
    c.beginPath();
    c.arc(w * 0.5, h * 0.12, w * 0.12, Math.PI * 0.1, Math.PI * 0.9, true);
    c.stroke();
    ell(c, w * 0.5, h * 0.6, w * 0.45, w * 0.45, gold);
    ell(c, w * 0.5, h * 0.6, w * 0.36, w * 0.36, '#fbf5e2');
    c.strokeStyle = '#4a3a2a';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      line(c, w * 0.5 + Math.cos(a) * w * 0.28, h * 0.6 + Math.sin(a) * w * 0.28,
        w * 0.5 + Math.cos(a) * w * 0.33, h * 0.6 + Math.sin(a) * w * 0.33, '#6a5a4a', 1.2);
    }
    line(c, w * 0.5, h * 0.6, w * 0.5, h * 0.6 - w * 0.22, '#3a2a2a', 2);
    line(c, w * 0.5, h * 0.6, w * 0.5 + w * 0.16, h * 0.6 + w * 0.06, '#3a2a2a', 1.8);
  },
  marble(c, w, h) {
    ell(c, w * 0.5, h * 0.5, w * 0.46, h * 0.46, '#7fc4ff');
    c.save();
    ell(c, w * 0.5, h * 0.5, w * 0.46, h * 0.46);
    c.clip();
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.75;
    c.beginPath();
    c.ellipse(w * 0.5, h * 0.5, w * 0.34, h * 0.12, 0.6, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.6;
    c.fillStyle = '#ff9ad0';
    c.beginPath();
    c.ellipse(w * 0.5, h * 0.5, w * 0.3, h * 0.09, -0.5, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.globalAlpha = 1;
    ell(c, w * 0.34, h * 0.32, w * 0.1, h * 0.08, 'rgb(255 255 255 / 0.85)');
  },
  musicbox(c, w, h) {
    const wood = '#8a5a7a';
    fillRR(c, w * 0.06, h * 0.3, w * 0.88, h * 0.62, 5, wood);
    fillRR(c, w * 0.06, h * 0.3, w * 0.88, h * 0.12, 4, shade(wood, 0.2));
    c.save();
    c.translate(w * 0.5, h * 0.32);
    c.rotate(-0.42);
    fillRR(c, -w * 0.44, -h * 0.14, w * 0.88, h * 0.14, 3, shade(wood, 0.1));
    c.restore();
    ell(c, w * 0.5, h * 0.2, w * 0.13, h * 0.12, '#ffd8ea');
    line(c, w * 0.5, h * 0.3, w * 0.5, h * 0.2, '#e8c46a', 2);
    fillRR(c, w * 0.2, h * 0.56, w * 0.6, h * 0.2, 3, '#f2d8e8');
    for (let i = 0; i < 5; i++) ell(c, w * (0.28 + i * 0.11), h * 0.66, w * 0.025, h * 0.03, '#b07ad8');
  },
  ribbon(c, w, h) {
    const red = '#ef5f78';
    c.beginPath();
    c.moveTo(w * 0.5, h * 0.5);
    c.quadraticCurveTo(w * 0.02, h * 0.12, w * 0.12, h * 0.52);
    c.quadraticCurveTo(w * 0.2, h * 0.86, w * 0.5, h * 0.5);
    c.fillStyle = red;
    c.fill();
    c.beginPath();
    c.moveTo(w * 0.5, h * 0.5);
    c.quadraticCurveTo(w * 0.98, h * 0.12, w * 0.88, h * 0.52);
    c.quadraticCurveTo(w * 0.8, h * 0.86, w * 0.5, h * 0.5);
    c.fillStyle = shade(red, -0.1);
    c.fill();
    poly(c, [[w * 0.46, h * 0.56], [w * 0.3, h * 1.0], [w * 0.44, h * 0.96]], shade(red, -0.2));
    poly(c, [[w * 0.56, h * 0.56], [w * 0.72, h * 1.0], [w * 0.58, h * 0.96]], shade(red, -0.2));
    ell(c, w * 0.5, h * 0.5, w * 0.1, h * 0.14, shade(red, 0.22));
  },
  candle(c, w, h) {
    const wax = '#fff2cf';
    fillRR(c, w * 0.28, h * 0.26, w * 0.44, h * 0.6, w * 0.1, wax);
    ell(c, w * 0.5, h * 0.28, w * 0.22, h * 0.05, shade(wax, 0.4));
    line(c, w * 0.5, h * 0.26, w * 0.5, h * 0.16, '#5a4a3a', 2);
    ell(c, w * 0.5, h * 0.1, w * 0.1, h * 0.09, '#ffd477');
    ell(c, w * 0.5, h * 0.11, w * 0.05, h * 0.05, '#fff6cf');
    poly(c, [[w * 0.14, h * 1.0], [w * 0.86, h * 1.0], [w * 0.76, h * 0.84], [w * 0.24, h * 0.84]], '#c9a24a');
    c.globalAlpha = 0.5;
    ell(c, w * 0.34, h * 0.42, w * 0.05, h * 0.16, shade(wax, -0.14));
    c.globalAlpha = 1;
  },
  thimble(c, w, h) {
    const metal = '#ccd0da';
    c.beginPath();
    c.moveTo(w * 0.2, h * 0.94);
    c.lineTo(w * 0.8, h * 0.94);
    c.quadraticCurveTo(w * 0.78, h * 0.1, w * 0.5, h * 0.08);
    c.quadraticCurveTo(w * 0.22, h * 0.1, w * 0.2, h * 0.94);
    c.fillStyle = metal;
    c.fill();
    c.fillStyle = shade(metal, -0.25);
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        ell(c, w * (0.3 + i * 0.14), h * (0.22 + j * 0.16), w * 0.03, h * 0.025, shade(metal, -0.22));
      }
    }
    ell(c, w * 0.34, h * 0.3, w * 0.06, h * 0.16, 'rgb(255 255 255 / 0.5)');
  },
  button(c, w, h) {
    ell(c, w * 0.5, h * 0.5, w * 0.46, h * 0.46, '#5b9cf0');
    ell(c, w * 0.5, h * 0.5, w * 0.36, h * 0.36, shade('#5b9cf0', 0.12));
    for (const [dx, dy] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) {
      ell(c, w * (0.5 + dx), h * (0.5 + dy), w * 0.055, h * 0.055, '#2a4a7a');
    }
    ell(c, w * 0.34, h * 0.3, w * 0.09, h * 0.07, 'rgb(255 255 255 / 0.6)');
  },
  slipper(c, w, h) {
    const fluff = '#ffb0d0';
    c.beginPath();
    c.moveTo(w * 0.08, h * 0.62);
    c.quadraticCurveTo(w * 0.1, h * 0.95, w * 0.44, h * 0.95);
    c.quadraticCurveTo(w * 0.92, h * 0.95, w * 0.94, h * 0.66);
    c.quadraticCurveTo(w * 0.7, h * 0.56, w * 0.4, h * 0.6);
    c.closePath();
    c.fillStyle = shade(fluff, -0.16);
    c.fill();
    ell(c, w * 0.3, h * 0.56, w * 0.26, h * 0.2, fluff);
    for (let i = 0; i < 7; i++) ell(c, w * (0.1 + i * 0.07), h * (0.46 + (i % 2) * 0.04), w * 0.05, h * 0.07, shade(fluff, 0.26));
    ell(c, w * 0.72, h * 0.78, w * 0.1, h * 0.06, shade(fluff, -0.3));
    c.strokeStyle = shade(fluff, -0.34);
    c.lineWidth = Math.max(1.5, h * 0.035);
    c.beginPath();
    c.moveTo(w * 0.12, h * 0.78);
    c.quadraticCurveTo(w * 0.5, h * 0.86, w * 0.9, h * 0.76);
    c.stroke();
  },
  quill(c, w, h) {
    const feather = '#eee6cd';
    c.save();
    c.translate(w * 0.5, h * 0.5);
    c.rotate(0.3);
    c.beginPath();
    c.moveTo(0, -h * 0.46);
    c.quadraticCurveTo(w * 0.34, -h * 0.1, 0, h * 0.3);
    c.quadraticCurveTo(-w * 0.3, -h * 0.1, 0, -h * 0.46);
    c.fillStyle = feather;
    c.fill();
    line(c, 0, -h * 0.44, 0, h * 0.46, '#a3906d', Math.max(1.8, w * 0.05));
    c.strokeStyle = 'rgb(140 126 98 / 0.75)';
    c.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const y = -h * 0.4 + i * h * 0.1;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w * 0.2 * (1 - i / 9), y + h * 0.05);
      c.moveTo(0, y);
      c.lineTo(-w * 0.2 * (1 - i / 9), y + h * 0.05);
      c.stroke();
    }
    poly(c, [[-w * 0.04, h * 0.4], [w * 0.04, h * 0.4], [0, h * 0.5]], '#3a3a4a');
    c.restore();
  },
  locket(c, w, h) {
    const silver = '#dde4ee';
    c.strokeStyle = silver;
    c.lineWidth = Math.max(1.5, w * 0.05);
    c.beginPath();
    c.moveTo(w * 0.5, h * 0.42);
    c.quadraticCurveTo(w * 0.04, h * 0.14, w * 0.5, h * 0.04);
    c.quadraticCurveTo(w * 0.96, h * 0.14, w * 0.5, h * 0.42);
    c.stroke();
    ell(c, w * 0.5, h * 0.66, w * 0.34, h * 0.28, silver);
    ell(c, w * 0.5, h * 0.66, w * 0.25, h * 0.2, shade(silver, -0.18));
    c.fillStyle = '#ef7a9a';
    c.beginPath();
    c.moveTo(w * 0.5, h * 0.74);
    c.quadraticCurveTo(w * 0.32, h * 0.62, w * 0.44, h * 0.58);
    c.quadraticCurveTo(w * 0.5, h * 0.56, w * 0.5, h * 0.62);
    c.quadraticCurveTo(w * 0.5, h * 0.56, w * 0.56, h * 0.58);
    c.quadraticCurveTo(w * 0.68, h * 0.62, w * 0.5, h * 0.74);
    c.fill();
  },
  yarn(c, w, h) {
    const col = '#9fd36a';
    ell(c, w * 0.5, h * 0.52, w * 0.44, h * 0.44, col);
    c.save();
    ell(c, w * 0.5, h * 0.52, w * 0.44, h * 0.44);
    c.clip();
    // bands of wool wrapped round the ball, not a doughnut
    c.strokeStyle = shade(col, -0.24);
    c.lineWidth = Math.max(2, w * 0.045);
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.ellipse(w * 0.5 + i * w * 0.12, h * 0.52, w * 0.12, h * 0.46, 0.42, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = shade(col, 0.2);
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.ellipse(w * 0.5, h * 0.52 + i * h * 0.13, w * 0.45, h * 0.12, -0.3, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
    c.strokeStyle = col;
    c.lineWidth = Math.max(2, w * 0.045);
    c.beginPath();
    c.moveTo(w * 0.86, h * 0.68);
    c.quadraticCurveTo(w * 1.04, h * 0.86, w * 0.78, h * 0.96);
    c.stroke();
    ell(c, w * 0.36, h * 0.34, w * 0.1, h * 0.07, 'rgb(255 255 255 / 0.35)');
  },
  bell(c, w, h) {
    const gold = '#f0c050';
    c.beginPath();
    c.moveTo(w * 0.1, h * 0.8);
    c.quadraticCurveTo(w * 0.18, h * 0.14, w * 0.5, h * 0.12);
    c.quadraticCurveTo(w * 0.82, h * 0.14, w * 0.9, h * 0.8);
    c.closePath();
    c.fillStyle = gold;
    c.fill();
    fillRR(c, w * 0.06, h * 0.78, w * 0.88, h * 0.1, 3, shade(gold, 0.18));
    ell(c, w * 0.5, h * 0.94, w * 0.1, h * 0.09, shade(gold, -0.3));
    fillRR(c, w * 0.44, h * 0.0, w * 0.12, h * 0.14, 3, shade(gold, -0.2));
    ell(c, w * 0.32, h * 0.4, w * 0.07, h * 0.18, 'rgb(255 255 255 / 0.4)');
  },
  spoon(c, w, h) {
    const wood = '#d5a86a';
    ell(c, w * 0.5, h * 0.2, w * 0.3, h * 0.19, wood);
    ell(c, w * 0.5, h * 0.21, w * 0.2, h * 0.13, shade(wood, -0.16));
    fillRR(c, w * 0.4, h * 0.34, w * 0.2, h * 0.64, w * 0.1, wood);
    ell(c, w * 0.42, h * 0.16, w * 0.06, h * 0.06, 'rgb(255 255 255 / 0.3)');
  },
  toyboat(c, w, h) {
    const hull = '#d85a5a';
    poly(c, [[w * 0.06, h * 0.62], [w * 0.94, h * 0.62], [w * 0.8, h * 0.9], [w * 0.2, h * 0.9]], hull);
    fillRR(c, w * 0.06, h * 0.56, w * 0.88, h * 0.09, 3, shade(hull, 0.2));
    line(c, w * 0.5, h * 0.56, w * 0.5, h * 0.06, '#8a6a4a', Math.max(2, w * 0.045));
    poly(c, [[w * 0.52, h * 0.1], [w * 0.9, h * 0.44], [w * 0.52, h * 0.5]], '#f6f1e2');
    poly(c, [[w * 0.48, h * 0.14], [w * 0.16, h * 0.44], [w * 0.48, h * 0.5]], '#e6dfcb');
    poly(c, [[w * 0.5, h * 0.06], [w * 0.68, h * 0.1], [w * 0.5, h * 0.14]], '#6fb8e8');
  },
  kite(c, w, h) {
    const col = '#ffcf5f';
    poly(c, [[w * 0.5, h * 0.04], [w * 0.92, h * 0.4], [w * 0.5, h * 0.76], [w * 0.08, h * 0.4]], col);
    line(c, w * 0.5, h * 0.04, w * 0.5, h * 0.76, shade(col, -0.3), 1.5);
    line(c, w * 0.08, h * 0.4, w * 0.92, h * 0.4, shade(col, -0.3), 1.5);
    poly(c, [[w * 0.5, h * 0.04], [w * 0.92, h * 0.4], [w * 0.5, h * 0.4]], shade(col, 0.22));
    poly(c, [[w * 0.5, h * 0.4], [w * 0.08, h * 0.4], [w * 0.5, h * 0.76]], shade(col, -0.14));
    c.strokeStyle = '#d8d0c0';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(w * 0.5, h * 0.76);
    c.quadraticCurveTo(w * 0.3, h * 0.88, w * 0.42, h * 0.99);
    c.stroke();
    for (const t of [0.82, 0.92]) poly(c, [[w * 0.36, h * t], [w * 0.5, h * (t + 0.03)], [w * 0.36, h * (t + 0.06)]], '#ef7a9a');
  },
  acorn(c, w, h) {
    const nut = '#c08a4a';
    c.beginPath();
    c.moveTo(w * 0.14, h * 0.44);
    c.quadraticCurveTo(w * 0.5, h * 1.08, w * 0.86, h * 0.44);
    c.closePath();
    c.fillStyle = nut;
    c.fill();
    fillRR(c, w * 0.08, h * 0.2, w * 0.84, h * 0.26, h * 0.1, '#7a5230');
    c.fillStyle = '#6a4528';
    for (let i = 0; i < 5; i++) ell(c, w * (0.18 + i * 0.16), h * 0.32, w * 0.05, h * 0.045, '#6a4528');
    line(c, w * 0.5, h * 0.2, w * 0.5, h * 0.04, '#5a3f26', Math.max(2, w * 0.06));
    ell(c, w * 0.36, h * 0.6, w * 0.08, h * 0.1, 'rgb(255 255 255 / 0.2)');
  },
  pinwheel(c, w, h) {
    const cols = ['#7ee0d2', '#ffd45f', '#ff8ab0', '#8ab4ff'];
    for (let i = 0; i < 4; i++) {
      c.save();
      c.translate(w * 0.5, h * 0.3);
      c.rotate((i / 4) * Math.PI * 2);
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(w * 0.34, -h * 0.08, w * 0.3, h * 0.22);
      c.closePath();
      c.fillStyle = cols[i];
      c.fill();
      c.restore();
    }
    ell(c, w * 0.5, h * 0.3, w * 0.07, h * 0.05, '#f6e6a0');
    line(c, w * 0.5, h * 0.32, w * 0.5, h, '#b07a4a', Math.max(2, w * 0.05));
  },
  snowglobe(c, w, h) {
    const base = '#8a5a3a';
    ell(c, w * 0.5, h * 0.44, w * 0.44, h * 0.38, 'rgb(190 228 255 / 0.55)');
    poly(c, [[w * 0.36, h * 0.74], [w * 0.64, h * 0.74], [w * 0.68, h * 0.5]], '#7fc08a');
    ell(c, w * 0.5, h * 0.76, w * 0.3, h * 0.07, '#e8f4ff');
    for (const [dx, dy] of [[-0.14, -0.1], [0.1, -0.2], [0.18, 0.04], [-0.06, 0.1], [0.02, -0.04]]) {
      ell(c, w * (0.5 + dx), h * (0.44 + dy), w * 0.028, h * 0.025, 'rgb(255 255 255 / 0.9)');
    }
    ell(c, w * 0.34, h * 0.28, w * 0.1, h * 0.07, 'rgb(255 255 255 / 0.55)');
    fillRR(c, w * 0.22, h * 0.76, w * 0.56, h * 0.2, 4, base);
    fillRR(c, w * 0.16, h * 0.9, w * 0.68, h * 0.1, 4, shade(base, 0.15));
  },
  domino(c, w, h) {
    fillRR(c, w * 0.08, h * 0.04, w * 0.84, h * 0.92, w * 0.12, '#f6f2e8');
    line(c, w * 0.12, h * 0.5, w * 0.88, h * 0.5, '#bdb6a6', 2);
    for (const [dx, dy] of [[0.3, 0.2], [0.7, 0.2], [0.5, 0.32]]) ell(c, w * dx, h * dy, w * 0.08, h * 0.05, '#3a3a44');
    for (const [dx, dy] of [[0.3, 0.68], [0.7, 0.68], [0.3, 0.84], [0.7, 0.84]]) ell(c, w * dx, h * dy, w * 0.08, h * 0.05, '#3a3a44');
  },
  jamjar(c, w, h) {
    fillRR(c, w * 0.14, h * 0.2, w * 0.72, h * 0.76, w * 0.14, 'rgb(236 244 250 / 0.5)');
    fillRR(c, w * 0.2, h * 0.36, w * 0.6, h * 0.56, w * 0.1, '#e05a7a');
    fillRR(c, w * 0.1, h * 0.1, w * 0.8, h * 0.16, w * 0.06, '#c08a4a');
    c.fillStyle = '#f6efdd';
    fillRR(c, w * 0.24, h * 0.56, w * 0.52, h * 0.22, 3, '#f6efdd');
    c.fillStyle = '#b04a64';
    c.font = `800 ${h * 0.14}px ui-rounded, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('JAM', w * 0.5, h * 0.68);
    ell(c, w * 0.28, h * 0.42, w * 0.07, h * 0.12, 'rgb(255 255 255 / 0.4)');
  },
  comb(c, w, h) {
    const sh = '#9a6a3a';
    fillRR(c, w * 0.04, h * 0.12, w * 0.92, h * 0.34, h * 0.14, sh);
    c.fillStyle = shade(sh, -0.2);
    const teeth = 11;
    for (let i = 0; i < teeth; i++) {
      c.fillRect(w * (0.08 + i * 0.08), h * 0.44, w * 0.045, h * 0.46);
    }
    c.globalAlpha = 0.3;
    for (let i = 0; i < 4; i++) ell(c, w * (0.2 + i * 0.2), h * 0.28, w * 0.07, h * 0.06, '#5a3a1a');
    c.globalAlpha = 1;
  },
  duck(c, w, h) {
    const y = '#ffd23f';
    ell(c, w * 0.46, h * 0.66, w * 0.42, h * 0.3, y);
    ell(c, w * 0.72, h * 0.32, w * 0.24, h * 0.24, y);
    poly(c, [[w * 0.88, h * 0.32], [w * 1.0, h * 0.38], [w * 0.88, h * 0.44]], '#ef8a3a');
    ell(c, w * 0.76, h * 0.26, w * 0.04, h * 0.04, '#2a2a2a');
    poly(c, [[w * 0.3, h * 0.52], [w * 0.5, h * 0.62], [w * 0.26, h * 0.72]], shade(y, -0.18));
    ell(c, w * 0.6, h * 0.42, w * 0.1, h * 0.06, shade(y, 0.25));
  },
  paintbrush(c, w, h) {
    fillRR(c, w * 0.38, h * 0.26, w * 0.24, h * 0.7, w * 0.1, '#d8863f');
    fillRR(c, w * 0.34, h * 0.2, w * 0.32, h * 0.12, 3, '#b0b6c0');
    poly(c, [[w * 0.36, h * 0.2], [w * 0.64, h * 0.2], [w * 0.56, h * 0.02], [w * 0.44, h * 0.02]], '#5a4a6a');
    ell(c, w * 0.5, h * 0.03, w * 0.07, h * 0.03, '#7a5ad8');
    ell(c, w * 0.44, h * 0.5, w * 0.04, h * 0.14, 'rgb(255 255 255 / 0.25)');
  },
  whistle(c, w, h) {
    const metal = '#cfd6de';
    fillRR(c, w * 0.04, h * 0.28, w * 0.66, h * 0.5, h * 0.24, metal);
    ell(c, w * 0.26, h * 0.4, w * 0.07, h * 0.1, shade(metal, -0.35));
    c.strokeStyle = shade(metal, -0.1);
    c.lineWidth = Math.max(2, h * 0.1);
    c.beginPath();
    c.arc(w * 0.78, h * 0.52, w * 0.14, Math.PI * 0.6, Math.PI * 1.9);
    c.stroke();
    fillRR(c, w * 0.1, h * 0.34, w * 0.4, h * 0.1, 3, 'rgb(255 255 255 / 0.4)');
  },
  compass(c, w, h) {
    const brass = '#e3c27a';
    ell(c, w * 0.5, h * 0.5, w * 0.48, h * 0.48, brass);
    ell(c, w * 0.5, h * 0.5, w * 0.38, h * 0.38, '#f6efdb');
    poly(c, [[w * 0.5, h * 0.16], [w * 0.58, h * 0.5], [w * 0.5, h * 0.84], [w * 0.42, h * 0.5]], '#cf4a52');
    poly(c, [[w * 0.5, h * 0.84], [w * 0.58, h * 0.5], [w * 0.42, h * 0.5]], '#e8eaf0');
    ell(c, w * 0.5, h * 0.5, w * 0.05, h * 0.05, brass);
    c.fillStyle = '#6a5a4a';
    c.font = `800 ${h * 0.14}px ui-rounded, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N', w * 0.5, h * 0.22);
  },
  hairbow(c, w, h) {
    const pink = '#ff7fb0';
    for (const s of [-1, 1]) {
      c.save();
      c.translate(w * 0.5, h * 0.5);
      c.scale(s, 1);
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(w * 0.3, -h * 0.5, w * 0.48, -h * 0.1);
      c.quadraticCurveTo(w * 0.42, h * 0.4, 0, 0);
      c.fillStyle = s > 0 ? pink : shade(pink, -0.1);
      c.fill();
      c.restore();
    }
    const dots = [[0.24, 0.36], [0.36, 0.56], [0.68, 0.38], [0.8, 0.58], [0.3, 0.68]];
    for (const [dx, dy] of dots) ell(c, w * dx, h * dy, w * 0.035, h * 0.045, 'rgb(255 255 255 / 0.8)');
    ell(c, w * 0.5, h * 0.5, w * 0.08, h * 0.13, shade(pink, 0.25));
  },
  umbrella(c, w, h) {
    const col = '#6f8fe0';
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(w * 0.5, h * 0.06);
      const x0 = w * (0.06 + i * 0.22);
      const x1 = w * (0.28 + i * 0.22);
      c.lineTo(x0, h * 0.5);
      c.quadraticCurveTo(w * (0.17 + i * 0.22), h * 0.58, x1, h * 0.5);
      c.closePath();
      c.fillStyle = i % 2 ? col : shade(col, 0.2);
      c.fill();
    }
    line(c, w * 0.5, h * 0.06, w * 0.5, h * 0.84, '#8a6a4a', Math.max(2, w * 0.05));
    c.strokeStyle = '#8a6a4a';
    c.lineWidth = Math.max(2, w * 0.05);
    c.beginPath();
    c.arc(w * 0.38, h * 0.86, w * 0.12, 0, Math.PI);
    c.stroke();
    ell(c, w * 0.5, h * 0.05, w * 0.035, h * 0.03, '#c9a24a');
  },
  cookie(c, w, h) {
    star(c, w * 0.5, h * 0.52, w * 0.46, 5, 0.52, '#e8b870');
    star(c, w * 0.5, h * 0.52, w * 0.34, 5, 0.52, '#f2cb8c');
    const rand = vseq(99);
    for (let i = 0; i < 6; i++) ell(c, w * (0.3 + rand() * 0.4), h * (0.34 + rand() * 0.38), w * 0.035, h * 0.03, '#7a4a2a');
  },
  feather(c, w, h) {
    const col = '#79b6ef';
    c.save();
    c.translate(w * 0.5, h * 0.5);
    c.rotate(-0.22);
    c.beginPath();
    c.moveTo(0, -h * 0.46);
    c.quadraticCurveTo(w * 0.4, 0, 0, h * 0.44);
    c.quadraticCurveTo(-w * 0.4, 0, 0, -h * 0.46);
    c.fillStyle = col;
    c.fill();
    c.strokeStyle = shade(col, 0.3);
    c.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const y = -h * 0.4 + i * h * 0.095;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w * 0.3 * Math.sin((i / 9) * Math.PI), y + h * 0.06);
      c.moveTo(0, y);
      c.lineTo(-w * 0.3 * Math.sin((i / 9) * Math.PI), y + h * 0.06);
      c.stroke();
    }
    line(c, 0, -h * 0.46, 0, h * 0.5, shade(col, -0.35), Math.max(1.5, w * 0.035));
    c.restore();
  },
  mouse(c, w, h) {
    const fur = '#b9b2c4';
    ell(c, w * 0.46, h * 0.68, w * 0.36, h * 0.28, fur);
    ell(c, w * 0.74, h * 0.56, w * 0.2, h * 0.2, fur);
    ell(c, w * 0.66, h * 0.36, w * 0.11, h * 0.14, shade(fur, 0.1));
    ell(c, w * 0.66, h * 0.37, w * 0.06, h * 0.08, '#e8b8c8');
    ell(c, w * 0.8, h * 0.52, w * 0.035, h * 0.035, '#2a2a30');
    ell(c, w * 0.92, h * 0.6, w * 0.035, h * 0.03, '#e88aa0');
    c.strokeStyle = '#6a6472';
    c.lineWidth = 1;
    for (const a of [-0.3, 0, 0.3]) line(c, w * 0.9, h * 0.6, w * 1.04, h * (0.6 + a * 0.3), '#6a6472', 1);
    c.strokeStyle = shade(fur, -0.2);
    c.lineWidth = Math.max(2, h * 0.045);
    c.beginPath();
    c.moveTo(w * 0.12, h * 0.72);
    c.quadraticCurveTo(w * -0.06, h * 0.5, w * 0.08, h * 0.32);
    c.stroke();
  },
};

export function drawItem(c, id, w, h) {
  const art = ITEM_ART[id];
  if (!art) return;
  c.save();
  art(c, w, h);
  c.restore();
}

export const ITEM_ART_KEYS = Object.keys(ITEM_ART);

// A flat shape of the same thing, for Silhouette Hunt and the collection
// placeholders: draw it, then keep only the alpha.
export function drawSilhouette(c, id, w, h, fill = '#1a1420') {
  const art = ITEM_ART[id];
  if (!art) return;
  c.save();
  art(c, w, h);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = fill;
  c.fillRect(-2, -2, w + 4, h + 4);
  c.restore();
}

// ------------------------------------------------------------------ ghosts

const SHAPES = {
  tall: { w: 0.66, top: 0.06, tail: 4 },
  round: { w: 0.84, top: 0.14, tail: 3 },
  wide: { w: 0.94, top: 0.2, tail: 5 },
  small: { w: 0.7, top: 0.24, tail: 3 },
};

// `mood` 0 = shy and dim, 1 = delighted. `t` is seconds, for the wobble.
export function drawGhost(c, ghost, w, h, t = 0, mood = 0.4, opts = {}) {
  const shape = SHAPES[ghost.shape] || SHAPES.round;
  const bw = w * shape.w;
  const x0 = (w - bw) / 2;
  const top = h * shape.top;
  const bodyH = h * (0.94 - shape.top);
  const wob = Math.sin(t * 2.2) * bw * 0.02;
  const glow = mixHex(ghost.hue, ghost.glow, 0.3 + mood * 0.5);

  c.save();
  c.globalAlpha = (opts.alpha ?? 1) * (0.62 + mood * 0.34);

  // the soft halo, baked flat so no shadowBlur is needed
  const g = c.createRadialGradient(w / 2, top + bodyH * 0.45, bw * 0.1, w / 2, top + bodyH * 0.45, bw * 0.95);
  g.addColorStop(0, alpha(ghost.glow, 0.34 + mood * 0.2));
  g.addColorStop(1, alpha(ghost.glow, 0));
  c.fillStyle = g;
  c.fillRect(-w * 0.3, top - h * 0.2, w * 1.6, bodyH * 1.5);

  // body: a dome with a wavy hem
  c.beginPath();
  c.moveTo(x0 + wob, top + bodyH * 0.72);
  c.quadraticCurveTo(x0 + wob, top, w / 2 + wob * 0.5, top);
  c.quadraticCurveTo(x0 + bw + wob, top, x0 + bw + wob, top + bodyH * 0.72);
  const tails = shape.tail;
  for (let i = 0; i < tails; i++) {
    const t0 = 1 - i / tails;
    const t1 = 1 - (i + 1) / tails;
    const xm = x0 + bw * ((t0 + t1) / 2) + wob;
    const ym = top + bodyH * (0.72 + 0.26 * (i % 2 ? 1 : 0.55) + Math.sin(t * 3 + i) * 0.04);
    c.quadraticCurveTo(xm, ym, x0 + bw * t1 + wob, top + bodyH * 0.76);
  }
  c.closePath();
  c.fillStyle = glow;
  c.fill();

  // a lighter core
  c.globalAlpha *= 0.5;
  c.beginPath();
  c.ellipse(w / 2 + wob, top + bodyH * 0.38, bw * 0.3, bodyH * 0.26, 0, 0, Math.PI * 2);
  c.fillStyle = ghost.glow;
  c.fill();
  c.globalAlpha /= 0.5;

  // face
  const eyeY = top + bodyH * (0.3 + (mood > 0.7 ? 0.01 : 0));
  const eyeDx = bw * 0.17;
  const blink = Math.sin(t * 0.9 + (ghost.id?.length || 2)) > 0.97;
  c.fillStyle = '#2b2336';
  if (blink) {
    for (const s of [-1, 1]) {
      c.fillRect(w / 2 + wob + s * eyeDx - bw * 0.06, eyeY, bw * 0.12, bodyH * 0.012);
    }
  } else if (mood > 0.7) {
    // happy squints
    for (const s of [-1, 1]) {
      c.beginPath();
      c.arc(w / 2 + wob + s * eyeDx, eyeY + bodyH * 0.03, bw * 0.07, Math.PI * 1.1, Math.PI * 1.9);
      c.lineWidth = Math.max(1.5, bw * 0.035);
      c.strokeStyle = '#2b2336';
      c.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      ell(c, w / 2 + wob + s * eyeDx, eyeY, bw * 0.062, bodyH * 0.05, '#2b2336');
      ell(c, w / 2 + wob + s * eyeDx - bw * 0.02, eyeY - bodyH * 0.018, bw * 0.022, bodyH * 0.016, 'rgb(255 255 255 / 0.85)');
    }
  }
  // mouth
  c.strokeStyle = '#2b2336';
  c.lineWidth = Math.max(1.5, bw * 0.03);
  c.beginPath();
  if (mood > 0.7) c.arc(w / 2 + wob, eyeY + bodyH * 0.1, bw * 0.1, 0.1, Math.PI - 0.1);
  else c.arc(w / 2 + wob, eyeY + bodyH * 0.14, bw * 0.07, 0.3, Math.PI - 0.3);
  c.stroke();
  // blush when delighted
  if (mood > 0.7) {
    c.globalAlpha *= 0.5;
    ell(c, w / 2 + wob - bw * 0.3, eyeY + bodyH * 0.06, bw * 0.08, bodyH * 0.045, '#ff9ab8');
    ell(c, w / 2 + wob + bw * 0.3, eyeY + bodyH * 0.06, bw * 0.08, bodyH * 0.045, '#ff9ab8');
    c.globalAlpha /= 0.5;
  }
  c.restore();
}

// ------------------------------------------------------------------ curios

const CURIO_ART = {
  bookmark(c, w, h, tint) {
    poly(c, [[w * 0.36, h * 0.08], [w * 0.64, h * 0.08], [w * 0.64, h * 0.86], [w * 0.5, h * 0.72], [w * 0.36, h * 0.86]], tint);
    ell(c, w * 0.5, h * 0.3, w * 0.07, h * 0.1, '#7fb86a');
    line(c, w * 0.5, h * 0.3, w * 0.5, h * 0.52, '#5a8a4a', 1.5);
  },
  inkpot(c, w, h, tint) {
    fillRR(c, w * 0.26, h * 0.4, w * 0.48, h * 0.48, w * 0.08, tint);
    fillRR(c, w * 0.34, h * 0.28, w * 0.32, h * 0.16, 3, shade(tint, -0.2));
    ell(c, w * 0.5, h * 0.3, w * 0.16, h * 0.05, shade(tint, 0.4));
    for (const [dx, dy] of [[0.3, 0.22], [0.68, 0.18]]) star(c, w * dx, h * dy, w * 0.06, 4, 0.4, '#fff4c0');
  },
  candleStub(c, w, h, tint) {
    fillRR(c, w * 0.34, h * 0.36, w * 0.32, h * 0.54, 4, tint);
    ell(c, w * 0.5, h * 0.22, w * 0.08, h * 0.1, '#ffd477');
    line(c, w * 0.5, h * 0.36, w * 0.5, h * 0.28, '#6a5a3a', 2);
    fillRR(c, w * 0.22, h * 0.86, w * 0.56, h * 0.1, 4, '#c9a24a');
  },
  whisk(c, w, h, tint) {
    fillRR(c, w * 0.44, h * 0.56, w * 0.12, h * 0.4, 4, '#8a6a4a');
    c.strokeStyle = tint;
    c.lineWidth = Math.max(1.5, w * 0.03);
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(w * 0.5, h * 0.56);
      c.quadraticCurveTo(w * (0.2 + i * 0.15), h * 0.3, w * 0.5, h * 0.1);
      c.stroke();
    }
  },
  sugarMouse(c, w, h, tint) {
    ell(c, w * 0.48, h * 0.64, w * 0.34, h * 0.26, tint);
    ell(c, w * 0.74, h * 0.54, w * 0.16, h * 0.16, tint);
    ell(c, w * 0.66, h * 0.4, w * 0.09, h * 0.1, shade(tint, 0.2));
    ell(c, w * 0.8, h * 0.52, w * 0.03, h * 0.03, '#5a4a52');
    line(c, w * 0.16, h * 0.66, w * 0.04, h * 0.44, '#e8c8d8', 2);
  },
  teapot(c, w, h, tint) {
    ell(c, w * 0.48, h * 0.62, w * 0.34, h * 0.28, tint);
    c.strokeStyle = tint;
    c.lineWidth = Math.max(2, w * 0.05);
    c.beginPath();
    c.arc(w * 0.84, h * 0.6, w * 0.14, -1.1, 1.1);
    c.stroke();
    poly(c, [[w * 0.16, h * 0.52], [w * 0.02, h * 0.4], [w * 0.14, h * 0.68]], tint);
    ell(c, w * 0.48, h * 0.36, w * 0.14, h * 0.06, shade(tint, 0.3));
    ell(c, w * 0.48, h * 0.3, w * 0.05, h * 0.05, shade(tint, -0.2));
  },
  robot(c, w, h, tint) {
    fillRR(c, w * 0.3, h * 0.18, w * 0.4, h * 0.3, 4, tint);
    fillRR(c, w * 0.26, h * 0.48, w * 0.48, h * 0.34, 4, shade(tint, -0.14));
    ell(c, w * 0.42, h * 0.3, w * 0.05, h * 0.05, '#2a2a32');
    ell(c, w * 0.58, h * 0.3, w * 0.05, h * 0.05, '#2a2a32');
    line(c, w * 0.5, h * 0.18, w * 0.5, h * 0.08, shade(tint, -0.3), 2);
    ell(c, w * 0.5, h * 0.07, w * 0.04, h * 0.04, '#ef5f78');
    c.fillStyle = shade(tint, -0.3);
    c.fillRect(w * 0.34, h * 0.82, w * 0.1, h * 0.12);
    c.fillRect(w * 0.56, h * 0.82, w * 0.1, h * 0.12);
    ell(c, w * 0.5, h * 0.62, w * 0.08, h * 0.06, '#ffd477');
  },
  horse(c, w, h, tint) {
    ell(c, w * 0.46, h * 0.5, w * 0.3, h * 0.18, tint);
    ell(c, w * 0.74, h * 0.36, w * 0.14, h * 0.12, tint);
    poly(c, [[w * 0.72, h * 0.26], [w * 0.8, h * 0.2], [w * 0.78, h * 0.3]], shade(tint, -0.2));
    c.fillStyle = shade(tint, -0.25);
    for (const dx of [0.28, 0.4, 0.56, 0.66]) c.fillRect(w * dx, h * 0.62, w * 0.06, h * 0.26);
    line(c, w * 0.5, h * 0.16, w * 0.5, h * 0.9, '#c9a24a', 2);
    ell(c, w * 0.6, h * 0.3, w * 0.03, h * 0.03, '#3a2a2a');
  },
  paperCrown(c, w, h, tint) {
    poly(c, [[w * 0.14, h * 0.78], [w * 0.14, h * 0.42], [w * 0.3, h * 0.6], [w * 0.42, h * 0.3],
      [w * 0.56, h * 0.6], [w * 0.7, h * 0.3], [w * 0.84, h * 0.6], [w * 0.86, h * 0.78]], tint);
    for (const dx of [0.3, 0.5, 0.7]) ell(c, w * dx, h * 0.68, w * 0.04, h * 0.04, '#ef5f78');
  },
  bellJar(c, w, h, tint) {
    fillRR(c, w * 0.2, h * 0.78, w * 0.6, h * 0.12, 3, '#8a6a4a');
    c.beginPath();
    c.moveTo(w * 0.24, h * 0.78);
    c.quadraticCurveTo(w * 0.24, h * 0.2, w * 0.5, h * 0.18);
    c.quadraticCurveTo(w * 0.76, h * 0.2, w * 0.76, h * 0.78);
    c.closePath();
    c.fillStyle = alpha(tint, 0.55);
    c.fill();
    ell(c, w * 0.5, h * 0.14, w * 0.05, h * 0.05, '#cfe8df');
    ell(c, w * 0.5, h * 0.52, w * 0.1, h * 0.1, '#fffbe8');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      line(c, w * 0.5, h * 0.52, w * 0.5 + Math.cos(a) * w * 0.16, h * 0.52 + Math.sin(a) * h * 0.16, 'rgb(255 255 255 / 0.7)', 1);
    }
  },
  seedPacket(c, w, h, tint) {
    fillRR(c, w * 0.24, h * 0.18, w * 0.52, h * 0.66, 3, '#e8dcb8');
    fillRR(c, w * 0.3, h * 0.26, w * 0.4, h * 0.26, 2, tint);
    ell(c, w * 0.5, h * 0.38, w * 0.1, h * 0.08, '#fff2a8');
    c.fillStyle = '#6a5a4a';
    for (let i = 0; i < 3; i++) c.fillRect(w * 0.32, h * (0.6 + i * 0.07), w * 0.36, h * 0.02);
  },
  trowel(c, w, h, tint) {
    poly(c, [[w * 0.5, h * 0.9], [w * 0.3, h * 0.5], [w * 0.5, h * 0.34], [w * 0.7, h * 0.5]], tint);
    fillRR(c, w * 0.44, h * 0.1, w * 0.12, h * 0.3, 4, '#8a6a4a');
    ell(c, w * 0.5, h * 0.6, w * 0.08, h * 0.1, shade(tint, -0.2));
  },
  silverBell(c, w, h, tint) {
    c.beginPath();
    c.moveTo(w * 0.22, h * 0.74);
    c.quadraticCurveTo(w * 0.28, h * 0.22, w * 0.5, h * 0.2);
    c.quadraticCurveTo(w * 0.72, h * 0.22, w * 0.78, h * 0.74);
    c.closePath();
    c.fillStyle = tint;
    c.fill();
    fillRR(c, w * 0.18, h * 0.72, w * 0.64, h * 0.08, 3, shade(tint, -0.14));
    ell(c, w * 0.5, h * 0.84, w * 0.07, h * 0.06, shade(tint, -0.3));
    fillRR(c, w * 0.46, h * 0.1, w * 0.08, h * 0.1, 2, shade(tint, -0.2));
    for (const s of [-1, 1]) line(c, w * (0.5 + s * 0.3), h * 0.3, w * (0.5 + s * 0.42), h * 0.22, 'rgb(255 255 255 / 0.6)', 1.5);
  },
  danceCard(c, w, h, tint) {
    fillRR(c, w * 0.24, h * 0.16, w * 0.52, h * 0.68, 3, tint);
    c.fillStyle = '#9a4a6a';
    for (let i = 0; i < 5; i++) c.fillRect(w * 0.3, h * (0.3 + i * 0.1), w * 0.4, h * 0.02);
    ell(c, w * 0.5, h * 0.24, w * 0.06, h * 0.03, '#9a4a6a');
  },
  mask(c, w, h, tint) {
    c.beginPath();
    c.moveTo(w * 0.12, h * 0.42);
    c.quadraticCurveTo(w * 0.5, h * 0.2, w * 0.88, h * 0.42);
    c.quadraticCurveTo(w * 0.72, h * 0.78, w * 0.5, h * 0.72);
    c.quadraticCurveTo(w * 0.28, h * 0.78, w * 0.12, h * 0.42);
    c.fillStyle = tint;
    c.fill();
    ell(c, w * 0.34, h * 0.46, w * 0.09, h * 0.06, '#241c2c');
    ell(c, w * 0.66, h * 0.46, w * 0.09, h * 0.06, '#241c2c');
    for (const dx of [0.2, 0.8]) line(c, w * dx, h * 0.46, w * (dx < 0.5 ? 0.02 : 0.98), h * 0.38, shade(tint, 0.3), 2);
    star(c, w * 0.5, h * 0.3, w * 0.05, 5, 0.5, '#ffd477');
  },
  lantern(c, w, h, tint) {
    fillRR(c, w * 0.32, h * 0.3, w * 0.36, h * 0.44, 4, alpha(tint, 0.85));
    poly(c, [[w * 0.26, h * 0.3], [w * 0.74, h * 0.3], [w * 0.64, h * 0.2], [w * 0.36, h * 0.2]], '#8a8a96');
    fillRR(c, w * 0.3, h * 0.72, w * 0.4, h * 0.08, 2, '#8a8a96');
    c.strokeStyle = '#8a8a96';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(w * 0.5, h * 0.2, w * 0.14, Math.PI, Math.PI * 2);
    c.stroke();
    ell(c, w * 0.5, h * 0.5, w * 0.1, h * 0.12, '#fff2c0');
  },
  rosette(c, w, h, tint) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ell(c, w * 0.5 + Math.cos(a) * w * 0.18, h * 0.4 + Math.sin(a) * h * 0.18, w * 0.1, h * 0.08, i % 2 ? tint : shade(tint, 0.2));
    }
    ell(c, w * 0.5, h * 0.4, w * 0.13, h * 0.13, '#f6efdd');
    c.fillStyle = shade(tint, -0.3);
    c.font = `800 ${h * 0.14}px ui-rounded, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('1st', w * 0.5, h * 0.41);
    poly(c, [[w * 0.4, h * 0.56], [w * 0.5, h * 0.56], [w * 0.44, h * 0.9]], tint);
    poly(c, [[w * 0.5, h * 0.56], [w * 0.6, h * 0.56], [w * 0.56, h * 0.9]], shade(tint, -0.12));
  },
  corkCrown(c, w, h, tint) {
    for (let i = 0; i < 5; i++) {
      fillRR(c, w * (0.16 + i * 0.14), h * (0.4 - (i === 2 ? 0.1 : 0)), w * 0.12, h * 0.26, 3, tint);
    }
    fillRR(c, w * 0.14, h * 0.64, w * 0.72, h * 0.14, 4, shade(tint, -0.2));
  },
  starCompass(c, w, h, tint) {
    ell(c, w * 0.5, h * 0.5, w * 0.36, h * 0.36, tint);
    ell(c, w * 0.5, h * 0.5, w * 0.28, h * 0.28, '#1c2440');
    star(c, w * 0.5, h * 0.5, w * 0.22, 4, 0.3, '#ffe9a8');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ell(c, w * 0.5 + Math.cos(a) * w * 0.32, h * 0.5 + Math.sin(a) * h * 0.32, 2, 2, shade(tint, -0.3));
    }
  },
  moonDial(c, w, h, tint) {
    ell(c, w * 0.5, h * 0.5, w * 0.36, h * 0.36, tint);
    c.save();
    ell(c, w * 0.5, h * 0.5, w * 0.36, h * 0.36);
    c.clip();
    ell(c, w * 0.66, h * 0.46, w * 0.3, h * 0.3, '#2a3058');
    c.restore();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      line(c, w * 0.5 + Math.cos(a) * w * 0.26, h * 0.5 + Math.sin(a) * h * 0.26,
        w * 0.5 + Math.cos(a) * w * 0.32, h * 0.5 + Math.sin(a) * h * 0.32, '#5a608a', 1);
    }
    line(c, w * 0.5, h * 0.5, w * 0.5, h * 0.26, '#3a4068', 2);
  },
  cometMarble(c, w, h, tint) {
    ell(c, w * 0.5, h * 0.5, w * 0.36, h * 0.36, tint);
    c.save();
    ell(c, w * 0.5, h * 0.5, w * 0.36, h * 0.36);
    c.clip();
    c.fillStyle = 'rgb(255 255 255 / 0.85)';
    c.beginPath();
    c.ellipse(w * 0.42, h * 0.44, w * 0.08, h * 0.05, -0.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgb(255 255 255 / 0.4)';
    c.beginPath();
    c.moveTo(w * 0.44, h * 0.46);
    c.lineTo(w * 0.76, h * 0.72);
    c.lineTo(w * 0.66, h * 0.78);
    c.closePath();
    c.fill();
    c.restore();
    ell(c, w * 0.38, h * 0.34, w * 0.07, h * 0.05, 'rgb(255 255 255 / 0.7)');
  },
  mouseWhistle(c, w, h, tint) {
    fillRR(c, w * 0.18, h * 0.42, w * 0.56, h * 0.2, h * 0.1, tint);
    ell(c, w * 0.34, h * 0.48, w * 0.05, h * 0.04, shade(tint, -0.5));
    c.strokeStyle = shade(tint, -0.2);
    c.lineWidth = 3;
    c.beginPath();
    c.arc(w * 0.78, h * 0.52, w * 0.1, Math.PI * 0.5, Math.PI * 1.9);
    c.stroke();
    ell(c, w * 0.3, h * 0.3, w * 0.04, h * 0.03, '#b9b2c4');
  },
  cheeseMedal(c, w, h, tint) {
    ell(c, w * 0.5, h * 0.58, w * 0.3, h * 0.3, tint);
    ell(c, w * 0.44, h * 0.54, w * 0.05, h * 0.05, shade(tint, -0.3));
    ell(c, w * 0.58, h * 0.64, w * 0.04, h * 0.04, shade(tint, -0.3));
    poly(c, [[w * 0.34, h * 0.3], [w * 0.5, h * 0.3], [w * 0.42, h * 0.1]], '#cf4a52');
    poly(c, [[w * 0.5, h * 0.3], [w * 0.66, h * 0.3], [w * 0.58, h * 0.1]], '#cf4a52');
  },
  mousePortrait(c, w, h, tint) {
    fillRR(c, w * 0.18, h * 0.14, w * 0.64, h * 0.72, 4, '#8a6a3a');
    fillRR(c, w * 0.24, h * 0.2, w * 0.52, h * 0.6, 2, tint);
    ell(c, w * 0.5, h * 0.58, w * 0.16, h * 0.12, '#cfc8d8');
    ell(c, w * 0.42, h * 0.44, w * 0.08, h * 0.09, '#cfc8d8');
    ell(c, w * 0.58, h * 0.44, w * 0.08, h * 0.09, '#cfc8d8');
    ell(c, w * 0.5, h * 0.5, w * 0.1, h * 0.1, '#e8e2f0');
    ell(c, w * 0.46, h * 0.49, w * 0.02, h * 0.02, '#2a2a32');
    ell(c, w * 0.54, h * 0.49, w * 0.02, h * 0.02, '#2a2a32');
  },
};

export function drawCurio(c, art, w, h, tint) {
  const fn = CURIO_ART[art];
  if (!fn) return;
  c.save();
  fn(c, w, h, tint);
  c.restore();
}

export const CURIO_ART_KEYS = Object.keys(CURIO_ART);

// ----------------------------------------------------------- room shells

// The architecture behind the props: walls, floor, windows and whatever makes
// each room itself. `light` is 0 for a dusty, sleeping room and 1 for one that
// has been put right.
export function drawArch(c, scene, light = 0, time = 0) {
  const { w: W, h: H } = scene.box;
  const pal = scene.palette;
  const floorY = scene.floorY;
  const warm = (hex) => mixHex(hex, pal.glow, 0.09 + light * 0.2);

  // back wall
  const wallGrad = c.createLinearGradient(0, 0, 0, floorY);
  wallGrad.addColorStop(0, mixHex(pal.wall2, pal.dusk, 0.22 - light * 0.18));
  wallGrad.addColorStop(1, warm(pal.wall));
  c.fillStyle = wallGrad;
  c.fillRect(0, 0, W, floorY + 2);

  // floor
  const floorGrad = c.createLinearGradient(0, floorY, 0, H);
  floorGrad.addColorStop(0, mixHex(pal.floor2, pal.dusk, 0.2 - light * 0.16));
  floorGrad.addColorStop(1, warm(pal.floor));
  c.fillStyle = floorGrad;
  c.fillRect(0, floorY, W, H - floorY);

  const arch = ARCH[scene.arch] || ARCH.library;
  arch(c, W, H, floorY, pal, light, scene);

  // floorboards, drawn in perspective towards the viewer
  c.save();
  c.globalAlpha = 0.18;
  c.strokeStyle = mixHex(pal.floor2, '#000000', 0.4);
  c.lineWidth = 2;
  for (let i = -6; i <= 18; i++) {
    const x = W * (i / 12);
    c.beginPath();
    c.moveTo(W * 0.5 + (x - W * 0.5) * 0.52, floorY);
    c.lineTo(x, H);
    c.stroke();
  }
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const y = floorY + (H - floorY) * t * t;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  c.restore();

  // skirting board
  c.fillStyle = mixHex(pal.trim, pal.dusk, 0.2 - light * 0.2);
  c.fillRect(0, floorY - H * 0.022, W, H * 0.024);

  // dust and gloom in the corners when the room is still asleep
  const gloom = 0.4 - light * 0.3;
  const vign = c.createRadialGradient(W * 0.5, floorY * 0.72, Math.min(W, H) * 0.18, W * 0.5, floorY * 0.7, Math.max(W, H) * 0.78);
  vign.addColorStop(0, alpha(pal.dusk, 0));
  vign.addColorStop(1, alpha(pal.dusk, gloom));
  c.fillStyle = vign;
  c.fillRect(0, 0, W, H);
}

function windowPane(c, x, y, w, h, pal, light, night) {
  c.fillStyle = mixHex(pal.trim, '#000000', 0.25);
  c.fillRect(x - w * 0.06, y - h * 0.05, w * 1.12, h * 1.1);
  const g = c.createLinearGradient(x, y, x, y + h);
  if (night) {
    g.addColorStop(0, '#1b2246');
    g.addColorStop(1, mixHex('#2c3560', pal.glow, 0.1 + light * 0.2));
  } else {
    g.addColorStop(0, mixHex('#5a7aa8', pal.glow, 0.2 + light * 0.3));
    g.addColorStop(1, mixHex('#8aa8c0', pal.glow, 0.3 + light * 0.3));
  }
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  if (night) {
    const rand = vseq(0x51a2 ^ Math.round(x));
    for (let i = 0; i < 14; i++) {
      ell(c, x + w * rand(), y + h * rand() * 0.8, 1.3, 1.3, 'rgb(240 246 255 / 0.85)');
    }
    ell(c, x + w * 0.72, y + h * 0.22, w * 0.1, w * 0.1, 'rgb(255 250 220 / 0.85)');
  }
  c.strokeStyle = mixHex(pal.trim, '#ffffff', 0.1);
  c.lineWidth = Math.max(2, w * 0.035);
  c.beginPath();
  c.moveTo(x + w / 2, y);
  c.lineTo(x + w / 2, y + h);
  c.moveTo(x, y + h * 0.5);
  c.lineTo(x + w, y + h * 0.5);
  c.stroke();
  // a soft pool of light on the wall
  const spill = c.createRadialGradient(x + w / 2, y + h / 2, w * 0.2, x + w / 2, y + h / 2, w * 1.5);
  spill.addColorStop(0, alpha(pal.glow, 0.14 + light * 0.14));
  spill.addColorStop(1, alpha(pal.glow, 0));
  c.fillStyle = spill;
  c.fillRect(x - w, y - h * 0.5, w * 3, h * 2.4);
}

const ARCH = {
  library(c, W, H, floorY, pal, light) {
    // wainscot panels
    c.fillStyle = mixHex(pal.trim, pal.dusk, 0.3 - light * 0.2);
    c.fillRect(0, floorY - H * 0.2, W, H * 0.2);
    for (let i = 0; i < Math.ceil(W / 180); i++) {
      const x = i * 180 + 14;
      c.fillStyle = mixHex(pal.wall, pal.dusk, 0.12 - light * 0.1);
      c.fillRect(x, floorY - H * 0.175, 152, H * 0.13);
    }
    windowPane(c, W * 0.42, H * 0.12, W * 0.16, H * 0.34, pal, light, true);
    // a painted frieze
    c.fillStyle = alpha(pal.trim, 0.5);
    c.fillRect(0, H * 0.055, W, H * 0.012);
  },
  kitchen(c, W, H, floorY, pal, light) {
    // tiles above the counters
    c.save();
    c.globalAlpha = 0.5;
    const tile = Math.max(44, W / 26);
    for (let y = floorY - H * 0.34; y < floorY - H * 0.08; y += tile) {
      for (let x = 0; x < W; x += tile) {
        c.fillStyle = ((x / tile + y / tile) | 0) % 2 ? mixHex('#e8e0cf', pal.dusk, 0.3 - light * 0.2) : mixHex('#cfc4ae', pal.dusk, 0.3 - light * 0.2);
        c.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    }
    c.restore();
    windowPane(c, W * 0.44, H * 0.14, W * 0.14, H * 0.26, pal, light, true);
    // beams
    c.fillStyle = mixHex('#4a3828', pal.dusk, 0.2 - light * 0.2);
    c.fillRect(0, H * 0.02, W, H * 0.035);
  },
  attic(c, W, H, floorY, pal, light) {
    // sloped roof on both sides
    c.fillStyle = mixHex(pal.wall2, pal.dusk, 0.35 - light * 0.25);
    poly(c, [[0, 0], [W * 0.2, 0], [0, floorY * 0.9]], mixHex(pal.wall2, pal.dusk, 0.35 - light * 0.25));
    poly(c, [[W, 0], [W * 0.8, 0], [W, floorY * 0.9]], mixHex(pal.wall2, pal.dusk, 0.35 - light * 0.25));
    c.strokeStyle = mixHex('#4a3828', pal.dusk, 0.2 - light * 0.2);
    c.lineWidth = Math.max(5, W * 0.012);
    c.beginPath();
    c.moveTo(0, floorY * 0.9);
    c.lineTo(W * 0.2, 0);
    c.moveTo(W, floorY * 0.9);
    c.lineTo(W * 0.8, 0);
    c.stroke();
    // round attic window
    const cx = W * 0.5;
    const cy = H * 0.2;
    const r = Math.min(W, H) * 0.08;
    ell(c, cx, cy, r * 1.14, r * 1.14, mixHex(pal.trim, '#000', 0.2));
    ell(c, cx, cy, r, r, '#1f2748');
    const rand = vseq(0x4771);
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2;
      const rr2 = rand() * r * 0.85;
      ell(c, cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2, 1.3, 1.3, 'rgb(236 244 255 / 0.9)');
    }
    c.strokeStyle = mixHex(pal.trim, '#fff', 0.1);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx - r, cy);
    c.lineTo(cx + r, cy);
    c.moveTo(cx, cy - r);
    c.lineTo(cx, cy + r);
    c.stroke();
    const spill = c.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 6);
    spill.addColorStop(0, alpha(pal.glow, 0.16 + light * 0.12));
    spill.addColorStop(1, alpha(pal.glow, 0));
    c.fillStyle = spill;
    c.fillRect(0, 0, W, floorY);
  },
  greenhouse(c, W, H, floorY, pal, light) {
    // glass panes all the way up
    const paneW = Math.max(90, W / 10);
    for (let x = 0; x < W; x += paneW) {
      const g = c.createLinearGradient(x, 0, x, floorY);
      g.addColorStop(0, mixHex('#2d4d5e', pal.glow, 0.1 + light * 0.2));
      g.addColorStop(1, mixHex('#4a6a58', pal.glow, 0.16 + light * 0.2));
      c.fillStyle = g;
      c.fillRect(x + 3, 0, paneW - 6, floorY - H * 0.02);
      c.fillStyle = alpha('#ffffff', 0.05);
      c.fillRect(x + 3, 0, (paneW - 6) * 0.3, floorY - H * 0.02);
    }
    c.strokeStyle = mixHex(pal.trim, pal.dusk, 0.2 - light * 0.2);
    c.lineWidth = Math.max(4, W * 0.006);
    for (let x = 0; x <= W; x += paneW) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, floorY);
      c.stroke();
    }
    for (const y of [0.18, 0.4, 0.58]) {
      c.beginPath();
      c.moveTo(0, H * y);
      c.lineTo(W, H * y);
      c.stroke();
    }
    // condensation and a creeping vine
    c.globalAlpha = 0.5;
    const rand = vseq(0x6ee2);
    for (let i = 0; i < 40; i++) ell(c, W * rand(), floorY * rand(), 2 + rand() * 3, 3 + rand() * 6, 'rgb(220 255 240 / 0.12)');
    c.globalAlpha = 1;
  },
  ballroom(c, W, H, floorY, pal, light) {
    // tall arched panels with mirrors
    const n = Math.max(3, Math.round(W / 320));
    for (let i = 0; i < n; i++) {
      const bw = W / n;
      const x = i * bw + bw * 0.18;
      const w = bw * 0.64;
      const y = H * 0.08;
      const h = floorY - H * 0.22;
      c.fillStyle = mixHex(pal.wall2, pal.glow, 0.05 + light * 0.1);
      c.beginPath();
      c.moveTo(x, y + h);
      c.lineTo(x, y + w * 0.5);
      c.arc(x + w / 2, y + w * 0.5, w / 2, Math.PI, 0);
      c.lineTo(x + w, y + h);
      c.closePath();
      c.fill();
      c.strokeStyle = mixHex(pal.trim, pal.glow, 0.2 + light * 0.2);
      c.lineWidth = Math.max(3, W * 0.004);
      c.stroke();
    }
    windowPane(c, W * 0.46, H * 0.16, W * 0.1, H * 0.3, pal, light, true);
    // parquet
    c.save();
    c.globalAlpha = 0.14;
    const s = Math.max(40, W / 22);
    for (let y = floorY; y < H; y += s) {
      for (let x = 0; x < W; x += s) {
        c.fillStyle = ((x / s + y / s) | 0) % 2 ? '#000' : '#fff';
        c.fillRect(x, y, s, s);
      }
    }
    c.restore();
    // gold cornice
    c.fillStyle = alpha(mixHex(pal.trim, pal.glow, 0.4), 0.7);
    c.fillRect(0, H * 0.03, W, H * 0.018);
  },
  cellar(c, W, H, floorY, pal, light) {
    // brick vault
    const bw = Math.max(60, W / 18);
    const bh = bw * 0.44;
    c.save();
    c.globalAlpha = 0.5;
    for (let y = 0, r = 0; y < floorY; y += bh, r++) {
      for (let x = (r % 2 ? -bw / 2 : 0); x < W; x += bw) {
        c.fillStyle = mixHex(r % 3 ? '#5a5260' : '#4e4858', pal.dusk, 0.25 - light * 0.2);
        c.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      }
    }
    c.restore();
    // an arch at the back
    c.fillStyle = mixHex(pal.dusk, '#000000', 0.3);
    const ax = W * 0.44;
    const aw = W * 0.12;
    c.beginPath();
    c.moveTo(ax, floorY);
    c.lineTo(ax, floorY - H * 0.16);
    c.arc(ax + aw / 2, floorY - H * 0.16, aw / 2, Math.PI, 0);
    c.lineTo(ax + aw, floorY);
    c.closePath();
    c.fill();
    const spill = c.createRadialGradient(ax + aw / 2, floorY - H * 0.1, aw * 0.2, ax + aw / 2, floorY - H * 0.1, aw * 3);
    spill.addColorStop(0, alpha(pal.glow, 0.1 + light * 0.12));
    spill.addColorStop(1, alpha(pal.glow, 0));
    c.fillStyle = spill;
    c.fillRect(0, 0, W, floorY);
  },
  observatory(c, W, H, floorY, pal, light) {
    // the dome opens on the night sky
    const cx = W * 0.5;
    const r = Math.min(W * 0.46, floorY * 0.78);
    c.save();
    c.beginPath();
    c.moveTo(cx - r, floorY);
    c.arc(cx, floorY, r, Math.PI, 0);
    c.closePath();
    c.clip();
    c.fillStyle = mixHex('#141a38', pal.glow, 0.04 + light * 0.1);
    c.fillRect(0, 0, W, floorY);
    const rand = vseq(0x0b5e);
    for (let i = 0; i < 90; i++) {
      const x = W * rand();
      const y = floorY * rand();
      ell(c, x, y, 0.8 + rand() * 1.5, 0.8 + rand() * 1.5, `rgb(236 244 255 / ${0.3 + rand() * 0.6})`);
    }
    // the open shutter slit
    c.fillStyle = alpha('#0b1130', 0.6);
    c.fillRect(0, 0, cx - r * 0.18, floorY);
    c.fillRect(cx + r * 0.18, 0, W, floorY);
    c.strokeStyle = mixHex(pal.trim, pal.glow, 0.2 + light * 0.2);
    c.lineWidth = Math.max(4, W * 0.006);
    for (let i = -4; i <= 4; i++) {
      c.beginPath();
      c.moveTo(cx + i * r * 0.24, floorY);
      c.lineTo(cx + i * r * 0.44, 0);
      c.stroke();
    }
    for (const t of [0.4, 0.66, 0.86]) {
      c.beginPath();
      c.arc(cx, floorY, r * t, Math.PI, 0);
      c.stroke();
    }
    c.restore();
    const spill = c.createRadialGradient(cx, floorY * 0.4, r * 0.1, cx, floorY * 0.4, r * 1.6);
    spill.addColorStop(0, alpha(pal.glow, 0.12 + light * 0.12));
    spill.addColorStop(1, alpha(pal.glow, 0));
    c.fillStyle = spill;
    c.fillRect(0, 0, W, floorY);
  },
};

export const ARCH_KEYS = Object.keys(ARCH);
