// All the art, painted once with Canvas paths into offscreen canvases and
// then just scaled at draw time. Coordinates inside each painter are metres,
// y up, origin at the sprite's bottom centre.
import { dinoById, hatById } from './catalog.js';
import { BIOMES } from './biomes.js';
import { hash01 } from './rng.js';

const TAU = Math.PI * 2;

// A sprite: canvas plus its size in metres. Anchor is the bottom centre
// unless `ay` says otherwise (0 = top, 1 = bottom).
function make(wm, hm, ppm, paint, ay = 1) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(wm * ppm));
  c.height = Math.max(2, Math.ceil(hm * ppm));
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height);
  g.scale(ppm, -ppm);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  paint(g);
  return { img: c, w: wm, h: hm, ay };
}

// ---- small drawing helpers (y-up metre space) --------------------------

function ellipse(g, x, y, rx, ry, fill, stroke, lw = 0.04, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), rot, 0, TAU);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

function poly(g, pts, fill, stroke, lw = 0.04) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

function rrect(g, x, y, w, h, r, fill, stroke, lw = 0.04) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

function radial(g, x, y, r, inner, outer, ox = -0.3, oy = 0.35) {
  const gr = g.createRadialGradient(x + r * ox, y + r * oy, r * 0.1, x, y, r * 1.05);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  return gr;
}

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

// ---- dinos -------------------------------------------------------------

// Head position for each body shape: centre and radius, before bob.
function headOf(shape) {
  if (shape === 'bronto') return { x: 0, y: 1.5, r: 0.22 };
  if (shape === 'anky') return { x: 0, y: 0.92, r: 0.25 };
  if (shape === 'raptor') return { x: 0, y: 1.1, r: 0.27 };
  return { x: 0, y: 1.08, r: 0.3 };
}

function bodyOf(shape) {
  if (shape === 'anky') return { y: 0.55, rx: 0.5, ry: 0.3 };
  if (shape === 'raptor') return { y: 0.66, rx: 0.3, ry: 0.32 };
  if (shape === 'bronto') return { y: 0.62, rx: 0.4, ry: 0.34 };
  return { y: 0.62, rx: 0.36, ry: 0.34 };
}

// Back view, as seen in play. pose: { legL, legR (foot lift, m), bob, tail
// (-1..1 sway), arm (-1..1), armsUp }
function paintDinoBack(g, D, pose, hat) {
  const ol = D.dark;
  const { legL = 0, legR = 0, bob = 0, tail = 0, arm = 0, armsUp = false } = pose;
  const B = bodyOf(D.shape);
  const by = B.y + bob;
  const rx = B.rx * 1.08;
  const ry = B.ry * 1.12;
  const hipX = D.shape === 'anky' ? 0.3 : 0.22;
  const H = headOf(D.shape);
  const hy = H.y + bob * 1.2;
  // Thighs and feet.
  for (const side of [-1, 1]) {
    const lift = side < 0 ? legL : legR;
    const x = side * hipX;
    ellipse(g, x, 0.26 + lift * 0.7 + bob, 0.15, 0.2, D.body, ol);
    ellipse(g, x, lift + 0.07, 0.16, 0.085, D.dark, ol);
    if (lift > 0.05) {
      ellipse(g, x, lift + 0.06, 0.11, 0.05, D.belly);
      for (let t = -1; t <= 1; t++) ellipse(g, x + t * 0.06, lift + 0.035, 0.025, 0.02, '#fffaf0');
    }
  }
  // Body: a big soft pear.
  g.beginPath();
  g.moveTo(0, by + ry);
  g.bezierCurveTo(rx * 0.75, by + ry, rx * 1.05, by + ry * 0.2, rx, by - ry * 0.25);
  g.bezierCurveTo(rx * 0.95, by - ry * 0.85, rx * 0.5, by - ry * 1.05, 0, by - ry * 1.05);
  g.bezierCurveTo(-rx * 0.5, by - ry * 1.05, -rx * 0.95, by - ry * 0.85, -rx, by - ry * 0.25);
  g.bezierCurveTo(-rx * 1.05, by + ry * 0.2, -rx * 0.75, by + ry, 0, by + ry);
  g.fillStyle = radial(g, 0, by, Math.max(rx, ry), mix(D.body, '#ffffff', 0.28), D.body, -0.25, 0.4);
  g.fill();
  g.lineWidth = 0.045;
  g.strokeStyle = ol;
  g.stroke();
  // Back markings.
  if (D.shape === 'anky') {
    ellipse(g, 0, by + 0.05, rx * 0.9, ry * 0.8, D.dark, mix(D.dark, '#000000', 0.2), 0.03);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const r = i % 2 ? 0.24 : 0.36;
      ellipse(g, Math.cos(a) * r, by + 0.05 + Math.sin(a) * r * 0.55, 0.065, 0.055, D.spot, ol, 0.025);
    }
    ellipse(g, 0, by + 0.05, 0.09, 0.075, D.spot, ol, 0.025);
  } else if (D.shape === 'raptor') {
    for (let i = 0; i < 4; i++) {
      const y = by + ry * 0.6 - i * 0.14;
      g.beginPath();
      g.moveTo(-rx * 0.7, y);
      g.quadraticCurveTo(0, y - 0.1, rx * 0.7, y);
      g.lineWidth = 0.05;
      g.strokeStyle = D.dark;
      g.stroke();
    }
  } else {
    for (const [sx, sy, r] of [[-0.18, 0.12, 0.075], [0.16, -0.02, 0.065], [0.04, 0.22, 0.05], [-0.08, -0.18, 0.05], [0.2, 0.2, 0.04]]) ellipse(g, sx, by + sy, r, r * 0.85, D.spot);
  }
  if (D.shape === 'steg') {
    // Two staggered rows of plates down the spine.
    for (let i = 0; i < 4; i++) {
      const y = by + ry * 0.7 - i * 0.17;
      const s = 0.15 - i * 0.015;
      const side = i % 2 ? 1 : -1;
      const x = side * 0.07;
      poly(g, [x - s * 0.8, y - s * 0.4, x + side * s * 0.25, y + s * 1.2, x + s * 0.8, y - s * 0.4], D.spot, ol, 0.03);
    }
  }
  if (D.shape === 'rex' || D.shape === 'bronto') {
    for (let i = 0; i < 4; i++) {
      const y = by + ry * 0.75 - i * 0.15;
      poly(g, [-0.06, y - 0.05, 0, y + 0.08, 0.06, y - 0.05], D.dark);
    }
  }
  // Tail: a chunky curve swinging toward the camera.
  const tx = tail * 0.3;
  g.beginPath();
  g.moveTo(-0.2, by - ry * 0.55);
  g.bezierCurveTo(-0.22, 0.35, tx - 0.2, 0.18, tx - 0.06, 0.05);
  g.quadraticCurveTo(tx + 0.02, -0.02, tx + 0.08, 0.06);
  g.bezierCurveTo(tx + 0.2, 0.2, 0.22, 0.35, 0.2, by - ry * 0.55);
  g.closePath();
  g.fillStyle = radial(g, tx * 0.5, by - ry, 0.45, mix(D.body, '#ffffff', 0.3), D.body, -0.1, 0.1);
  g.fill();
  g.lineWidth = 0.045;
  g.strokeStyle = ol;
  g.stroke();
  ellipse(g, tx * 0.6, 0.3, 0.05, 0.035, D.spot);
  if (D.shape === 'anky') ellipse(g, tx + 0.01, 0.1, 0.14, 0.11, D.dark, ol);
  if (D.shape === 'steg') {
    poly(g, [tx - 0.04, 0.14, tx - 0.2, 0.24, tx - 0.03, 0.22], '#fff4e0', ol, 0.025);
    poly(g, [tx + 0.04, 0.14, tx + 0.2, 0.24, tx + 0.03, 0.22], '#fff4e0', ol, 0.025);
  }
  if (D.shape === 'raptor') ellipse(g, tx, 0.1, 0.08, 0.12, D.spot);
  // Little arms.
  for (const side of [-1, 1]) {
    const swing = side * arm * 0.06;
    const ax = side * (rx + 0.01);
    const ay = armsUp ? by + ry * 0.9 : by + 0.14 + swing;
    ellipse(g, ax, ay, 0.075, 0.12, D.body, ol, 0.035, side * (armsUp ? -0.6 : 0.4));
    if (D.shape === 'raptor') poly(g, [ax, ay - 0.06, ax + side * 0.14, ay - 0.15, ax + side * 0.02, ay + 0.04], D.spot);
  }
  // Neck.
  if (D.shape === 'bronto') {
    rrect(g, -0.14, by + 0.15, 0.28, hy - by - 0.15, 0.13, D.body, ol);
    for (let i = 0; i < 3; i++) ellipse(g, 0, by + 0.4 + i * 0.2, 0.055, 0.045, D.spot);
  }
  if (D.shape === 'tri') {
    // The frill covers the back of the head; horn tips peek above it.
    poly(g, [-0.15, hy + 0.32, -0.22, hy + 0.58, -0.07, hy + 0.36], '#fff4dc', ol, 0.03);
    poly(g, [0.15, hy + 0.32, 0.22, hy + 0.58, 0.07, hy + 0.36], '#fff4dc', ol, 0.03);
    g.beginPath();
    g.ellipse(0, hy - 0.02, 0.46, 0.42, 0, 0, TAU);
    g.fillStyle = radial(g, 0, hy, 0.46, mix(D.dark, '#ffffff', 0.18), D.dark);
    g.fill();
    g.lineWidth = 0.045;
    g.strokeStyle = mix(D.dark, '#000000', 0.25);
    g.stroke();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.08 + (0.84 * i) / 6);
      ellipse(g, Math.cos(a) * 0.35, hy - 0.02 + Math.sin(a) * 0.32, 0.055, 0.055, D.spot);
    }
    ellipse(g, 0, hy - 0.06, 0.13, 0.11, D.body);
  } else {
    // Head with two bulgy eye bumps on top: reads as "face is over there".
    for (const side of [-1, 1]) ellipse(g, side * H.r * 0.55, hy + H.r * 0.62, H.r * 0.34, H.r * 0.3, D.body, ol, 0.035);
    ellipse(g, H.x, hy, H.r * 1.04, H.r * 0.95, radial(g, H.x, hy, H.r, mix(D.body, '#ffffff', 0.32), D.body), ol);
    for (const side of [-1, 1]) ellipse(g, side * H.r * 0.55, hy + H.r * 0.62, H.r * 0.22, H.r * 0.18, mix(D.body, '#ffffff', 0.25));
    if (D.shape === 'rex' || D.shape === 'bronto') {
      for (let i = 0; i < 2; i++) {
        const y = hy + H.r * 0.35 - i * H.r * 0.42;
        poly(g, [-0.05, y - 0.035, 0, y + 0.07, 0.05, y - 0.035], D.dark);
      }
    }
    ellipse(g, -H.r * 0.35, hy - H.r * 0.3, H.r * 0.2, H.r * 0.12, D.spot);
  }
  if (D.shape === 'raptor') {
    for (let i = -1; i <= 1; i++) ellipse(g, i * 0.07, hy + H.r + 0.1, 0.045, 0.13, D.spot, ol, 0.025, i * 0.4);
  }
  if (D.sparkle) {
    for (let i = 0; i < 7; i++) star(g, (hash01(i, 3) - 0.5) * 0.65, 0.3 + hash01(i, 9) * 0.95, 0.04, '#ffffff');
  }
  if (hat && hat !== 'none') {
    const top = D.shape === 'tri' ? hy + 0.38 : hy + H.r * 0.95;
    paintHat(g, hat, H.x, top, D.shape === 'tri' ? 0.32 : H.r);
  }
}

function star(g, x, y, r, fill) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rr = i % 2 ? r * 0.35 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

// Front view for the shop, title and results.
function paintDinoFront(g, D, hat) {
  const ol = D.dark;
  const B = bodyOf(D.shape);
  const by = B.y;
  const H = headOf(D.shape);
  const hy = H.y;
  // Tail behind, curling out to the side.
  g.beginPath();
  g.moveTo(0.1, by - 0.2);
  g.quadraticCurveTo(0.55, by - 0.3, 0.68, by + 0.05);
  g.quadraticCurveTo(0.5, by - 0.05, 0.12, by + 0.05);
  g.closePath();
  g.fillStyle = D.body;
  g.fill();
  g.lineWidth = 0.04;
  g.strokeStyle = ol;
  g.stroke();
  if (D.shape === 'anky') ellipse(g, 0.68, by + 0.04, 0.12, 0.1, D.dark, ol);
  if (D.shape === 'steg') {
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.15 + i * 0.17);
      const x = Math.cos(a) * 0.4;
      const y = by + Math.sin(a) * 0.38;
      poly(g, [x - 0.1 * Math.sin(a), y + 0.1 * Math.cos(a) * 0.4, x + Math.cos(a) * 0.17, y + Math.sin(a) * 0.17, x + 0.1 * Math.sin(a), y - 0.1 * Math.cos(a) * 0.4], D.spot, ol, 0.03);
    }
  }
  for (const side of [-1, 1]) {
    const x = side * (D.shape === 'anky' ? 0.27 : 0.19);
    rrect(g, x - 0.11, 0.06, 0.22, by - 0.1, 0.1, D.body, ol);
    ellipse(g, x, 0.07, 0.16, 0.08, D.dark, ol);
    for (let t = -1; t <= 1; t++) ellipse(g, x + t * 0.07, 0.05, 0.03, 0.025, '#fffaf0');
  }
  ellipse(g, 0, by, B.rx, B.ry, radial(g, 0, by, Math.max(B.rx, B.ry), mix(D.body, '#ffffff', 0.25), D.body), ol);
  if (D.shape === 'anky') {
    ellipse(g, 0, by + 0.12, B.rx * 0.95, B.ry * 0.55, D.dark, ol);
    for (let i = -3; i <= 3; i++) ellipse(g, i * 0.13, by + 0.16 + Math.abs(i) * -0.02, 0.05, 0.05, D.spot, ol, 0.025);
  }
  ellipse(g, 0, by - 0.05, B.rx * 0.62, B.ry * 0.7, D.belly);
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(-B.rx * 0.45, by - 0.18 + i * 0.12);
    g.quadraticCurveTo(0, by - 0.22 + i * 0.12, B.rx * 0.45, by - 0.18 + i * 0.12);
    g.lineWidth = 0.02;
    g.strokeStyle = mix(D.belly, D.dark, 0.25);
    g.stroke();
  }
  for (const side of [-1, 1]) {
    ellipse(g, side * (B.rx * 0.55), by + 0.08, 0.06, 0.1, D.body, ol, 0.035, side * -0.5);
  }
  if (D.shape === 'bronto') {
    rrect(g, -0.13, by + 0.15, 0.26, hy - by - 0.15, 0.12, D.body, ol);
    rrect(g, -0.07, by + 0.2, 0.14, hy - by - 0.3, 0.07, D.belly);
  }
  if (D.shape === 'tri') {
    g.beginPath();
    g.ellipse(0, hy + 0.08, 0.46, 0.42, 0, 0, TAU);
    g.fillStyle = radial(g, 0, hy, 0.46, mix(D.dark, '#ffffff', 0.15), D.dark);
    g.fill();
    g.lineWidth = 0.04;
    g.strokeStyle = mix(D.dark, '#000000', 0.25);
    g.stroke();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.05 + (0.9 * i) / 6);
      ellipse(g, Math.cos(a) * 0.36, hy + 0.08 + Math.sin(a) * 0.32, 0.05, 0.05, D.spot);
    }
  }
  if (D.shape === 'raptor') {
    for (let i = -1; i <= 1; i++) ellipse(g, i * 0.07, hy + H.r + 0.06, 0.045, 0.12, D.spot, ol, 0.025, i * 0.4);
  }
  // Head and face.
  ellipse(g, 0, hy, H.r * 1.05, H.r * 0.95, radial(g, 0, hy, H.r, mix(D.body, '#ffffff', 0.3), D.body), ol);
  ellipse(g, 0, hy - H.r * 0.45, H.r * 0.7, H.r * 0.42, mix(D.belly, D.body, 0.3));
  const er = H.r * 0.3;
  for (const side of [-1, 1]) {
    const ex = side * H.r * 0.42;
    const ey = hy + H.r * 0.12;
    ellipse(g, ex, ey, er, er * 1.1, '#ffffff', ol, 0.03);
    ellipse(g, ex + side * er * 0.15, ey - er * 0.1, er * 0.58, er * 0.66, '#2a1d3a');
    ellipse(g, ex + side * er * 0.15 - er * 0.2, ey + er * 0.2, er * 0.2, er * 0.2, '#ffffff');
    ellipse(g, side * H.r * 0.7, hy - H.r * 0.35, H.r * 0.16, H.r * 0.1, 'rgba(255,120,150,0.55)');
    ellipse(g, side * H.r * 0.15, hy - H.r * 0.22, H.r * 0.05, H.r * 0.04, ol);
  }
  g.beginPath();
  g.arc(0, hy - H.r * 0.42, H.r * 0.32, Math.PI * 1.15, Math.PI * 1.85);
  g.lineWidth = 0.035;
  g.strokeStyle = mix(D.dark, '#000000', 0.3);
  g.stroke();
  if (D.shape === 'tri') {
    poly(g, [-0.17, hy + 0.2, -0.24, hy + 0.48, -0.08, hy + 0.24], '#fff4dc', ol, 0.03);
    poly(g, [0.17, hy + 0.2, 0.24, hy + 0.48, 0.08, hy + 0.24], '#fff4dc', ol, 0.03);
    poly(g, [-0.05, hy - 0.08, 0, hy + 0.06, 0.05, hy - 0.08], '#fff4dc', ol, 0.025);
  }
  if (D.sparkle) for (let i = 0; i < 7; i++) star(g, (hash01(i, 5) - 0.5) * 0.8, 0.25 + hash01(i, 7) * 1.0, 0.04, '#ffffff');
  if (hat && hat !== 'none') {
    const top = D.shape === 'tri' ? hy + 0.42 : hy + H.r * 0.88;
    paintHat(g, hat, 0, top, D.shape === 'tri' ? 0.3 : H.r);
  }
}

// Curled-up ball for rolling (rotated at draw time).
function paintBall(g, D) {
  const r = 0.4;
  const y = r;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    poly(g, [Math.cos(a - 0.2) * r * 0.95, y + Math.sin(a - 0.2) * r * 0.95, Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25, Math.cos(a + 0.2) * r * 0.95, y + Math.sin(a + 0.2) * r * 0.95], D.shape === 'steg' ? D.spot : D.dark);
  }
  ellipse(g, 0, y, r, r, radial(g, 0, y, r, mix(D.body, '#ffffff', 0.3), D.body), D.dark);
  g.beginPath();
  for (let t = 0; t < 1; t += 0.02) {
    const a = t * TAU * 1.6;
    const rr = r * 0.75 * (1 - t * 0.85);
    g.lineTo(Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.lineWidth = 0.05;
  g.strokeStyle = D.dark;
  g.stroke();
  ellipse(g, -r * 0.35, y + r * 0.4, r * 0.18, r * 0.1, 'rgba(255,255,255,0.45)', null, 0, -0.6);
}

// ---- hats (drawn on top of a head: (x, top) and head radius r) ---------

function paintHat(g, id, x, top, r) {
  const k = r / 0.3;
  g.save();
  g.translate(x, top - 0.03 * k);
  g.scale(k, k);
  const ol = '#3a2a2a';
  switch (id) {
    case 'leaf':
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(0.02, 0.12, 0, 0.2);
      g.lineWidth = 0.03;
      g.strokeStyle = '#3a8a2e';
      g.stroke();
      ellipse(g, -0.09, 0.2, 0.1, 0.05, '#7bdc4f', '#3a8a2e', 0.025, 0.4);
      ellipse(g, 0.09, 0.22, 0.1, 0.05, '#8fe85f', '#3a8a2e', 0.025, -0.4);
      break;
    case 'party':
      poly(g, [-0.17, 0, 0.17, 0, 0, 0.42], '#ff5fa2', ol, 0.03);
      poly(g, [-0.11, 0.14, 0.11, 0.14, 0.075, 0.22, -0.075, 0.22], '#ffe14f');
      poly(g, [-0.05, 0.3, 0.05, 0.3, 0.03, 0.35, -0.03, 0.35], '#6fd3ff');
      ellipse(g, 0, 0.44, 0.06, 0.06, '#ffe14f', ol, 0.025);
      break;
    case 'flower':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ellipse(g, 0.12 + Math.cos(a) * 0.08, 0.06 + Math.sin(a) * 0.08, 0.06, 0.035, '#ffffff', '#c9c0d8', 0.015, a);
      }
      ellipse(g, 0.12, 0.06, 0.05, 0.05, '#ffcf3a', '#c98a10', 0.02);
      break;
    case 'cap':
      g.beginPath();
      g.ellipse(0, 0, 0.27, 0.22, 0, 0, Math.PI);
      g.closePath();
      g.fillStyle = '#3b82f6';
      g.fill();
      g.lineWidth = 0.03;
      g.strokeStyle = ol;
      g.stroke();
      ellipse(g, 0, -0.01, 0.2, 0.07, '#2563eb', ol, 0.03);
      ellipse(g, 0, 0.2, 0.035, 0.025, '#ffffff');
      break;
    case 'egg':
      g.beginPath();
      g.moveTo(-0.24, 0.06);
      g.quadraticCurveTo(-0.24, 0.36, 0, 0.38);
      g.quadraticCurveTo(0.24, 0.36, 0.24, 0.06);
      for (let i = 0; i <= 6; i++) g.lineTo(0.24 - i * 0.08, i % 2 ? -0.03 : 0.06);
      g.closePath();
      g.fillStyle = '#fffaf0';
      g.fill();
      g.lineWidth = 0.025;
      g.strokeStyle = '#b8a890';
      g.stroke();
      ellipse(g, -0.08, 0.22, 0.035, 0.03, '#9ad38a');
      ellipse(g, 0.1, 0.16, 0.03, 0.025, '#9ad38a');
      break;
    case 'cowboy':
      ellipse(g, 0, 0.02, 0.42, 0.08, '#b07a3c', ol, 0.03);
      rrect(g, -0.18, 0.02, 0.36, 0.24, 0.08, '#c48a48', ol, 0.03);
      rrect(g, -0.18, 0.05, 0.36, 0.05, 0.01, '#7a4a20');
      ellipse(g, 0, 0.26, 0.17, 0.04, '#a8723a');
      break;
    case 'pirate':
      g.beginPath();
      g.moveTo(-0.36, 0.02);
      g.quadraticCurveTo(-0.2, 0.42, 0, 0.3);
      g.quadraticCurveTo(0.2, 0.42, 0.36, 0.02);
      g.quadraticCurveTo(0, 0.1, -0.36, 0.02);
      g.fillStyle = '#26232e';
      g.fill();
      g.lineWidth = 0.03;
      g.strokeStyle = '#0d0b12';
      g.stroke();
      g.beginPath();
      g.moveTo(-0.33, 0.04);
      g.quadraticCurveTo(0, 0.12, 0.33, 0.04);
      g.lineWidth = 0.025;
      g.strokeStyle = '#ffd34f';
      g.stroke();
      ellipse(g, 0, 0.2, 0.05, 0.045, '#ffffff');
      ellipse(g, -0.018, 0.205, 0.012, 0.012, '#26232e');
      ellipse(g, 0.018, 0.205, 0.012, 0.012, '#26232e');
      break;
    case 'propeller':
      g.beginPath();
      g.ellipse(0, 0, 0.24, 0.2, 0, 0, Math.PI);
      g.closePath();
      g.fillStyle = '#ff6b6b';
      g.fill();
      g.lineWidth = 0.03;
      g.strokeStyle = ol;
      g.stroke();
      g.save();
      g.beginPath();
      g.ellipse(0, 0, 0.24, 0.2, 0, 0, Math.PI);
      g.clip();
      g.fillStyle = '#ffd34f';
      g.fillRect(-0.06, 0, 0.12, 0.3);
      g.fillStyle = '#4fb8ff';
      g.fillRect(-0.24, 0, 0.08, 0.3);
      g.fillRect(0.16, 0, 0.08, 0.3);
      g.restore();
      rrect(g, -0.015, 0.19, 0.03, 0.08, 0.01, '#555');
      ellipse(g, -0.13, 0.28, 0.13, 0.035, '#4fb8ff', ol, 0.02, 0.1);
      ellipse(g, 0.13, 0.28, 0.13, 0.035, '#ffd34f', ol, 0.02, -0.1);
      ellipse(g, 0, 0.28, 0.03, 0.03, '#ff6b6b', ol, 0.015);
      break;
    case 'tophat':
      ellipse(g, 0, 0.02, 0.3, 0.06, '#26232e', '#0d0b12', 0.03);
      rrect(g, -0.17, 0.02, 0.34, 0.42, 0.03, '#2d2a38', '#0d0b12', 0.03);
      rrect(g, -0.17, 0.07, 0.34, 0.07, 0.01, '#e0405a');
      ellipse(g, 0, 0.44, 0.17, 0.04, '#3a3648');
      break;
    case 'crown':
      poly(g, [-0.22, 0, 0.22, 0, 0.25, 0.26, 0.12, 0.13, 0, 0.3, -0.12, 0.13, -0.25, 0.26], '#ffd23f', '#b07a10', 0.03);
      ellipse(g, 0, 0.08, 0.04, 0.04, '#ff4f7a');
      ellipse(g, -0.13, 0.07, 0.03, 0.03, '#4fb8ff');
      ellipse(g, 0.13, 0.07, 0.03, 0.03, '#5fe06a');
      for (const px of [-0.25, 0, 0.25]) ellipse(g, px, px === 0 ? 0.31 : 0.27, 0.03, 0.03, '#fff3b0');
      break;
    default:
      break;
  }
  g.restore();
}

// Frames for the player's dino and hat.
export function bakeDino(dinoId, hatId) {
  const D = dinoById(dinoId);
  const hat = hatById(hatId).id;
  const PPM = 150;
  const W = 1.5;
  const H = D.shape === 'bronto' ? 2.25 : D.shape === 'tri' ? 2.0 : 1.95;
  const run = [];
  for (let i = 0; i < 6; i++) {
    const ph = i / 6;
    const s = Math.sin(ph * TAU);
    const pose = { legL: Math.max(0, s) * 0.2, legR: Math.max(0, -s) * 0.2, bob: Math.abs(Math.cos(ph * TAU)) * 0.04, tail: Math.sin(ph * TAU + 1) * 0.8, arm: s };
    run.push(make(W, H, PPM, (g) => paintDinoBack(g, D, pose, hat)));
  }
  const jump = make(W, H, PPM, (g) => paintDinoBack(g, D, { legL: 0.18, legR: 0.12, bob: 0.03, tail: 0.2, arm: 0, armsUp: true }, hat));
  const glide = make(W, H, PPM, (g) => paintDinoBack(g, D, { legL: 0.1, legR: 0.14, bob: 0.02, tail: -0.3, armsUp: true }, hat));
  const ball = make(1.1, 1.1, PPM, (g) => paintBall(g, D), 0.5);
  return { id: `${D.id}/${hat}`, run, jump, glide, ball, height: H };
}

export function bakePortrait(dinoId, hatId, ppm = 120) {
  const D = dinoById(dinoId);
  return make(1.6, D.shape === 'bronto' ? 2.3 : 2.0, ppm, (g) => paintDinoFront(g, D, hatById(hatId).id));
}

// Hat alone, for the shop.
export function bakeHatIcon(hatId, ppm = 160) {
  return make(1.0, 0.8, ppm, (g) => paintHat(g, hatId, 0, 0.06, 0.44));
}

// ---- obstacles ---------------------------------------------------------

function paintLog(g) {
  const w = 1.9;
  const h = 0.72;
  rrect(g, -w / 2, 0.02, w, h, 0.34, radial(g, 0, 0.4, 1, '#a8703c', '#7a4a22', 0, 0.4), '#4a2a12', 0.05);
  g.lineWidth = 0.03;
  g.strokeStyle = '#5e3818';
  for (let i = 0; i < 6; i++) {
    const x = -0.7 + i * 0.27;
    g.beginPath();
    g.moveTo(x, 0.12 + (i % 2) * 0.1);
    g.quadraticCurveTo(x + 0.08, 0.4, x - 0.02, 0.62 - (i % 2) * 0.08);
    g.stroke();
  }
  for (const s of [-1, 1]) {
    ellipse(g, s * (w / 2 - 0.12), 0.38, 0.15, 0.34, '#e8c38a', '#4a2a12', 0.04);
    ellipse(g, s * (w / 2 - 0.12), 0.38, 0.09, 0.22, null, '#b8864c', 0.025);
    ellipse(g, s * (w / 2 - 0.12), 0.38, 0.035, 0.09, null, '#b8864c', 0.025);
  }
  ellipse(g, -0.3, 0.72, 0.28, 0.07, '#6fcf4f');
  ellipse(g, 0.36, 0.7, 0.2, 0.06, '#5fbf43');
  rrect(g, 0.25, 0.7, 0.05, 0.13, 0.02, '#fff0dc');
  ellipse(g, 0.275, 0.84, 0.11, 0.07, '#ff5a5a', '#9a2a2a', 0.025);
  ellipse(g, 0.24, 0.86, 0.025, 0.02, '#ffffff');
  ellipse(g, 0.31, 0.83, 0.02, 0.016, '#ffffff');
}

function paintBoulder(g) {
  g.beginPath();
  g.moveTo(-0.95, 0.05);
  g.bezierCurveTo(-1.05, 0.9, -0.55, 1.7, 0.05, 1.68);
  g.bezierCurveTo(0.7, 1.66, 1.05, 1.0, 0.95, 0.05);
  g.closePath();
  g.fillStyle = radial(g, 0, 0.8, 1.1, '#b9b4c4', '#7a7488', -0.3, 0.45);
  g.fill();
  g.lineWidth = 0.06;
  g.strokeStyle = '#4c475a';
  g.stroke();
  g.beginPath();
  g.moveTo(-0.85, 1.05);
  g.bezierCurveTo(-0.5, 1.75, 0.55, 1.75, 0.86, 1.1);
  g.bezierCurveTo(0.5, 1.25, 0.2, 1.05, -0.1, 1.2);
  g.bezierCurveTo(-0.4, 1.0, -0.6, 1.2, -0.85, 1.05);
  g.fillStyle = '#6fcf4f';
  g.fill();
  g.lineWidth = 0.035;
  g.strokeStyle = '#3e8a30';
  g.stroke();
  g.lineWidth = 0.035;
  g.strokeStyle = '#5a5468';
  g.beginPath();
  g.moveTo(0.3, 0.2);
  g.lineTo(0.42, 0.55);
  g.lineTo(0.3, 0.75);
  g.moveTo(-0.5, 0.35);
  g.lineTo(-0.35, 0.6);
  g.stroke();
  ellipse(g, -0.45, 0.95, 0.16, 0.08, 'rgba(255,255,255,0.35)', null, 0, 0.5);
  for (let i = 0; i < 4; i++) ellipse(g, -0.6 + i * 0.4, 1.32 + (i % 2) * 0.12, 0.05, 0.05, '#fff2a6');
}

function paintHedge(g) {
  const puffs = [[-0.65, 0.55, 0.42], [0.65, 0.55, 0.42], [-0.3, 1.0, 0.45], [0.35, 1.05, 0.45], [0, 0.6, 0.5], [0, 1.35, 0.35]];
  for (const [x, y, r] of puffs) ellipse(g, x, y, r, r * 0.92, '#2f7d3a', '#1d5226', 0.05);
  for (const [x, y, r] of puffs) ellipse(g, x - r * 0.15, y + r * 0.15, r * 0.7, r * 0.6, '#3f9a48');
  g.strokeStyle = '#6b3a2a';
  g.lineWidth = 0.035;
  for (let i = 0; i < 9; i++) {
    const x = (hash01(i, 1) - 0.5) * 1.5;
    const y = 0.3 + hash01(i, 2) * 1.2;
    poly(g, [x, y, x + 0.07, y + 0.02, x + 0.02, y + 0.09], '#f3e3c8');
  }
  for (let i = 0; i < 7; i++) {
    const x = (hash01(i, 4) - 0.5) * 1.5;
    const y = 0.35 + hash01(i, 5) * 1.1;
    ellipse(g, x, y, 0.07, 0.07, i % 2 ? '#ff7fb0' : '#a56bff', '#5a2a4a', 0.02);
    ellipse(g, x - 0.02, y + 0.02, 0.02, 0.02, '#ffffff');
  }
}

function paintVent(g) {
  ellipse(g, 0, 0.15, 0.85, 0.26, '#8a7f74', '#4f463e', 0.05);
  ellipse(g, 0, 0.2, 0.6, 0.16, '#3a3a4a');
  ellipse(g, 0, 0.22, 0.42, 0.1, '#5fc8ff');
  ellipse(g, -0.12, 0.24, 0.08, 0.03, '#c8f0ff');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    ellipse(g, Math.cos(a) * 0.78, 0.13 + Math.sin(a) * 0.22, 0.13, 0.08, '#a39887', '#4f463e', 0.03);
  }
}

// Water column, drawn bottom-up; frames wobble the edges.
function paintColumn(g, f) {
  const h = 3.6;
  g.beginPath();
  g.moveTo(-0.38, 0);
  for (let i = 0; i <= 12; i++) {
    const y = (i / 12) * h;
    g.lineTo(-0.38 - Math.sin(i * 1.7 + f * 2.1) * 0.08 - y * 0.06, y);
  }
  for (let i = 12; i >= 0; i--) {
    const y = (i / 12) * h;
    g.lineTo(0.38 + Math.sin(i * 1.9 + f * 2.3) * 0.08 + y * 0.06, y);
  }
  g.closePath();
  const gr = g.createLinearGradient(-0.5, 0, 0.5, 0);
  gr.addColorStop(0, '#7fd4ff');
  gr.addColorStop(0.45, '#e9fbff');
  gr.addColorStop(1, '#8fdcff');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 0.05;
  g.strokeStyle = '#3e9fd8';
  g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + f;
    ellipse(g, Math.cos(a) * 0.5, h + Math.sin(a) * 0.2 + 0.05, 0.32, 0.26, '#f4fdff', '#7fc8ee', 0.03);
  }
  ellipse(g, 0, h + 0.15, 0.45, 0.32, '#ffffff');
  for (let i = 0; i < 5; i++) ellipse(g, Math.sin(i * 2.3 + f) * 0.2, 0.4 + i * 0.6, 0.05, 0.12, 'rgba(255,255,255,0.8)');
}

function paintPtero(g, f) {
  const up = f === 0;
  const body = '#8f6cff';
  const dark = '#5a3fc2';
  const ol = '#3a2780';
  // Wings.
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 0.18, 0.62);
    if (up) {
      g.quadraticCurveTo(s * 0.6, 1.15, s * 1.15, 1.05);
      g.quadraticCurveTo(s * 0.85, 0.75, s * 0.95, 0.55);
      g.quadraticCurveTo(s * 0.55, 0.62, s * 0.18, 0.45);
    } else {
      g.quadraticCurveTo(s * 0.6, 0.6, s * 1.15, 0.2);
      g.quadraticCurveTo(s * 0.8, 0.28, s * 0.75, 0.12);
      g.quadraticCurveTo(s * 0.45, 0.36, s * 0.18, 0.4);
    }
    g.closePath();
    g.fillStyle = dark;
    g.fill();
    g.lineWidth = 0.04;
    g.strokeStyle = ol;
    g.stroke();
  }
  // Body and head facing us.
  ellipse(g, 0, 0.5, 0.22, 0.26, body, ol);
  ellipse(g, 0, 0.45, 0.13, 0.16, '#ffd9f0');
  for (const s of [-1, 1]) ellipse(g, s * 0.1, 0.22, 0.06, 0.04, '#ffb84f', ol, 0.025);
  // Crest.
  poly(g, [-0.05, 0.92, 0.05, 0.92, 0.0, 1.2], '#ff7fb0', ol, 0.03);
  ellipse(g, 0, 0.82, 0.22, 0.18, body, ol);
  for (const s of [-1, 1]) {
    ellipse(g, s * 0.09, 0.86, 0.065, 0.07, '#ffffff', ol, 0.02);
    ellipse(g, s * 0.08, 0.85, 0.035, 0.04, '#2a1d3a');
  }
  // Big goofy beak pointing at us.
  poly(g, [-0.11, 0.78, 0.11, 0.78, 0.0, 0.6], '#ffcf4f', '#a87a10', 0.03);
  poly(g, [-0.07, 0.74, 0.07, 0.74, 0.0, 0.68], '#ff8f6a');
}

// ---- pickups -----------------------------------------------------------

function paintAmber(g, squash) {
  g.save();
  g.translate(0, 0.32);
  g.scale(Math.max(0.12, squash), 1);
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    pts.push(Math.cos(a) * 0.26, Math.sin(a) * 0.3);
  }
  const gr = g.createLinearGradient(-0.2, 0.3, 0.2, -0.3);
  gr.addColorStop(0, '#ffe58a');
  gr.addColorStop(0.5, '#ffb52e');
  gr.addColorStop(1, '#e07a10');
  poly(g, pts, gr, '#8a4a08', 0.045);
  ellipse(g, 0, 0, 0.12, 0.15, 'rgba(255,240,180,0.55)');
  ellipse(g, 0.02, -0.02, 0.05, 0.035, 'rgba(120,60,10,0.6)');
  ellipse(g, -0.09, 0.12, 0.05, 0.08, 'rgba(255,255,255,0.8)', null, 0, -0.5);
  g.restore();
}

function paintPower(g, kind) {
  const y = 0.5;
  ellipse(g, 0, y, 0.48, 0.48, 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.85)', 0.05);
  ellipse(g, -0.17, y + 0.2, 0.1, 0.06, 'rgba(255,255,255,0.8)', null, 0, -0.6);
  if (kind === 'shield') {
    ellipse(g, 0, y - 0.03, 0.24, 0.3, '#fffaf0', '#b8a890', 0.04);
    ellipse(g, -0.08, y + 0.05, 0.06, 0.05, '#7fd36f');
    ellipse(g, 0.09, y - 0.1, 0.05, 0.04, '#7fd36f');
    ellipse(g, 0.04, y + 0.15, 0.04, 0.035, '#7fd36f');
  } else if (kind === 'magnet') {
    g.beginPath();
    g.arc(0, y + 0.02, 0.2, Math.PI, 0, true);
    g.lineWidth = 0.13;
    g.strokeStyle = '#e8384f';
    g.lineCap = 'butt';
    g.stroke();
    g.beginPath();
    g.moveTo(-0.2, y + 0.02);
    g.lineTo(-0.2, y + 0.2);
    g.moveTo(0.2, y + 0.02);
    g.lineTo(0.2, y + 0.2);
    g.stroke();
    g.strokeStyle = '#e8eef5';
    g.beginPath();
    g.moveTo(-0.2, y + 0.14);
    g.lineTo(-0.2, y + 0.24);
    g.moveTo(0.2, y + 0.14);
    g.lineTo(0.2, y + 0.24);
    g.stroke();
    g.lineCap = 'round';
  } else {
    paintLeaf(g, 0, y - 0.24, 0.62);
  }
}

function paintLeaf(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(-0.45, 0.35, 0, 0.85);
  g.quadraticCurveTo(0.45, 0.35, 0, 0);
  g.fillStyle = '#5fd44a';
  g.fill();
  g.lineWidth = 0.04;
  g.strokeStyle = '#2f8a2a';
  g.stroke();
  g.beginPath();
  g.moveTo(0, -0.08);
  g.lineTo(0, 0.78);
  for (let i = 1; i < 5; i++) {
    g.moveTo(0, i * 0.16);
    g.lineTo(-0.18 + i * 0.02, i * 0.16 + 0.12);
    g.moveTo(0, i * 0.16);
    g.lineTo(0.18 - i * 0.02, i * 0.16 + 0.12);
  }
  g.lineWidth = 0.025;
  g.stroke();
  g.restore();
}

// The big leaf held overhead while gliding.
function paintParasol(g) {
  g.save();
  g.beginPath();
  g.moveTo(-0.95, 0.2);
  g.quadraticCurveTo(0, 0.95, 0.95, 0.2);
  g.quadraticCurveTo(0.6, 0.32, 0.4, 0.14);
  g.quadraticCurveTo(0.2, 0.3, 0, 0.12);
  g.quadraticCurveTo(-0.2, 0.3, -0.4, 0.14);
  g.quadraticCurveTo(-0.6, 0.32, -0.95, 0.2);
  g.fillStyle = radial(g, 0, 0.4, 1, '#8fe85f', '#4fbf3a', 0, 0.3);
  g.fill();
  g.lineWidth = 0.04;
  g.strokeStyle = '#2f8a2a';
  g.stroke();
  g.beginPath();
  g.moveTo(0, 0.12);
  g.lineTo(0, 0.72);
  for (let i = -3; i <= 3; i++) {
    if (!i) continue;
    g.moveTo(0, 0.68 - Math.abs(i) * 0.12);
    g.lineTo(i * 0.27, 0.3 + Math.abs(i) * 0.02);
  }
  g.lineWidth = 0.025;
  g.stroke();
  rrect(g, -0.02, -0.4, 0.04, 0.55, 0.02, '#3f8a2e');
  g.restore();
}

function paintEggShield(g) {
  g.beginPath();
  g.ellipse(0, 0.95, 0.85, 1.05, 0, 0, TAU);
  const gr = g.createRadialGradient(-0.3, 1.4, 0.1, 0, 0.95, 1.05);
  gr.addColorStop(0, 'rgba(255,255,255,0.35)');
  gr.addColorStop(0.7, 'rgba(255,248,225,0.12)');
  gr.addColorStop(1, 'rgba(255,240,200,0.5)');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 0.05;
  g.strokeStyle = 'rgba(255,250,235,0.9)';
  g.stroke();
  for (const [x, y] of [[-0.5, 1.5], [0.45, 1.7], [0.6, 0.6], [-0.62, 0.55]]) ellipse(g, x, y, 0.09, 0.07, 'rgba(140,210,120,0.6)');
  ellipse(g, -0.4, 1.55, 0.18, 0.08, 'rgba(255,255,255,0.7)', null, 0, -0.7);
}

// ---- Lavvy, the friendly lava blob ------------------------------------

function paintLavvy(g, f) {
  const wob = f * 0.06;
  g.beginPath();
  g.moveTo(-1.5, 0);
  g.bezierCurveTo(-1.7, 1.2, -1.1, 2.3 + wob, 0, 2.35 + wob);
  g.bezierCurveTo(1.1, 2.3 + wob, 1.7, 1.2, 1.5, 0);
  for (let i = 0; i <= 6; i++) g.quadraticCurveTo(1.5 - (i + 0.5) * 0.5, -0.3 - (i % 2) * 0.2, 1.5 - (i + 1) * 0.5, 0);
  g.closePath();
  g.fillStyle = radial(g, 0, 1.2, 1.8, '#ffe36a', '#ff5a1f', -0.2, 0.35);
  g.fill();
  g.lineWidth = 0.08;
  g.strokeStyle = '#b8320c';
  g.stroke();
  for (const [x, y, r] of [[-0.9, 1.5, 0.16], [0.8, 0.6, 0.2], [-0.3, 0.4, 0.12], [1.0, 1.6, 0.1]]) ellipse(g, x, y, r, r * 0.8, 'rgba(255,170,40,0.8)');
  for (const s of [-1, 1]) {
    ellipse(g, s * 0.45, 1.55, 0.3, 0.36, '#ffffff', '#7a1e08', 0.05);
    ellipse(g, s * 0.4, 1.45, 0.16, 0.2, '#3a1208');
    ellipse(g, s * 0.36, 1.55, 0.06, 0.06, '#ffffff');
    ellipse(g, s * 0.85, 1.05, 0.18, 0.1, 'rgba(255,90,130,0.6)');
  }
  g.beginPath();
  g.moveTo(-0.45, 1.0);
  g.quadraticCurveTo(0, 0.4, 0.45, 1.0);
  g.quadraticCurveTo(0, 0.85, -0.45, 1.0);
  g.fillStyle = '#7a1e08';
  g.fill();
  ellipse(g, 0, 0.78, 0.16, 0.08, '#ff8fa0');
  // Arms out for a hug.
  for (const s of [-1, 1]) ellipse(g, s * 1.55, 1.1 + f * 0.1, 0.32, 0.18, '#ff7a2a', '#b8320c', 0.06, s * (0.5 + f * 0.2));
}

// ---- roadside props ----------------------------------------------------

const PROP_PAINTERS = {
  fern(g) {
    for (let i = -3; i <= 3; i++) {
      g.save();
      g.rotate(i * 0.3);
      ellipse(g, 0, 0.55, 0.1, 0.55, i % 2 ? '#3fae49' : '#4fc055', '#2a7a32', 0.03);
      g.restore();
    }
  },
  cycad(g) {
    rrect(g, -0.13, 0, 0.26, 2.2, 0.1, '#9a6a3a', '#5a3a1a', 0.04);
    for (let i = 0; i < 6; i++) ellipse(g, 0, 0.3 + i * 0.35, 0.15, 0.06, '#7a4e26');
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.05 + i * 0.15);
      g.save();
      g.translate(0, 2.2);
      g.rotate(a - Math.PI / 2);
      ellipse(g, 0, 0.6, 0.16, 0.65, i % 2 ? '#4fc055' : '#3fae49', '#2a7a32', 0.03);
      g.restore();
    }
  },
  tree(g) {
    rrect(g, -0.25, 0, 0.5, 2.0, 0.15, '#8a5a32', '#5a3a1a', 0.05);
    for (const [x, y, r] of [[-0.8, 2.3, 0.8], [0.8, 2.4, 0.85], [0, 3.0, 1.0], [0, 2.1, 0.7]]) ellipse(g, x, y, r, r * 0.9, '#3e9a48', '#22612a', 0.05);
    for (const [x, y, r] of [[-0.6, 2.6, 0.45], [0.3, 3.3, 0.5], [0.9, 2.6, 0.35]]) ellipse(g, x, y, r, r * 0.8, '#5ab85a');
  },
  rock(g) {
    ellipse(g, 0, 0.35, 0.65, 0.4, radial(g, 0, 0.35, 0.65, '#c4bfcc', '#8a8494'), '#5a5468', 0.04);
    ellipse(g, -0.2, 0.55, 0.2, 0.06, '#6fcf4f');
  },
  mushroom(g) {
    rrect(g, -0.12, 0, 0.24, 0.6, 0.08, '#fff2dc', '#b89a78', 0.03);
    g.beginPath();
    g.ellipse(0, 0.6, 0.5, 0.42, 0, 0, Math.PI);
    g.closePath();
    g.fillStyle = '#ff5a5a';
    g.fill();
    g.lineWidth = 0.04;
    g.strokeStyle = '#9a2a2a';
    g.stroke();
    for (const [x, y] of [[-0.25, 0.75], [0.1, 0.9], [0.3, 0.7]]) ellipse(g, x, y, 0.07, 0.06, '#ffffff');
  },
  nest(g) {
    ellipse(g, 0, 0.18, 0.55, 0.2, '#b88a4a', '#6a4a22', 0.04);
    ellipse(g, -0.15, 0.36, 0.14, 0.18, '#fffaf0', '#b8a890', 0.03);
    ellipse(g, 0.15, 0.34, 0.13, 0.17, '#e6f4ff', '#a0b0c0', 0.03);
    ellipse(g, 0.02, 0.4, 0.13, 0.17, '#fff0f5', '#c0a0b0', 0.03);
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.moveTo(-0.5 + i * 0.14, 0.1);
      g.lineTo(-0.4 + i * 0.13, 0.32);
      g.lineWidth = 0.03;
      g.strokeStyle = '#8a6030';
      g.stroke();
    }
  },
  mesa(g) {
    poly(g, [-1.2, 0, -0.95, 1.6, -0.5, 1.75, 0.6, 1.7, 0.95, 1.5, 1.2, 0], '#d9824a', '#8a4a22', 0.05);
    poly(g, [-1.05, 0.6, 1.08, 0.6, 1.12, 0.45, -1.1, 0.45], '#c46c3a');
    poly(g, [-0.98, 1.2, 0.98, 1.2, 1.0, 1.08, -1.0, 1.08], '#e8995a');
  },
  bones(g) {
    g.lineWidth = 0.1;
    g.strokeStyle = '#f6efe0';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(0, 0, 0.3 + i * 0.12, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    }
    ellipse(g, 0.55, 0.12, 0.2, 0.12, '#f6efe0', '#b8ab90', 0.03);
  },
  cactus(g) {
    rrect(g, -0.18, 0, 0.36, 1.5, 0.18, '#4fae5a', '#2a6a32', 0.04);
    rrect(g, -0.6, 0.6, 0.26, 0.6, 0.13, '#4fae5a', '#2a6a32', 0.04);
    rrect(g, -0.5, 0.6, 0.4, 0.2, 0.1, '#4fae5a');
    rrect(g, 0.34, 0.8, 0.26, 0.5, 0.13, '#4fae5a', '#2a6a32', 0.04);
    rrect(g, 0.12, 0.8, 0.4, 0.2, 0.1, '#4fae5a');
    ellipse(g, 0, 1.52, 0.1, 0.08, '#ff7fb0');
  },
  reeds(g) {
    for (let i = -3; i <= 3; i++) {
      const x = i * 0.12;
      g.beginPath();
      g.moveTo(x, 0);
      g.quadraticCurveTo(x + i * 0.05, 0.8, x + i * 0.1, 1.3 + (i % 2) * 0.2);
      g.lineWidth = 0.05;
      g.strokeStyle = '#4a8a4a';
      g.stroke();
      if (i % 2 === 0) rrect(g, x + i * 0.1 - 0.05, 1.05 + (i % 2) * 0.2, 0.1, 0.3, 0.05, '#8a5a32');
    }
  },
  lily(g) {
    rrect(g, -0.06, 0, 0.12, 1.1, 0.05, '#4a9a5a');
    ellipse(g, 0, 1.1, 0.6, 0.18, '#5fc8a0', '#2a7a5a', 0.04);
    ellipse(g, 0.2, 1.2, 0.12, 0.08, '#ffb0d0', '#c06090', 0.02);
  },
  glow(g) {
    rrect(g, -0.08, 0, 0.16, 0.7, 0.06, '#d8f0ff', '#7aa0c0', 0.03);
    ellipse(g, 0, 0.75, 0.75, 0.75, 'rgba(120,255,230,0.12)');
    g.beginPath();
    g.ellipse(0, 0.7, 0.42, 0.34, 0, 0, Math.PI);
    g.closePath();
    g.fillStyle = '#6fffe0';
    g.fill();
    g.lineWidth = 0.04;
    g.strokeStyle = '#2aa8a0';
    g.stroke();
    for (const [x, y] of [[-0.2, 0.82], [0.12, 0.92], [0.25, 0.76]]) ellipse(g, x, y, 0.05, 0.04, '#ffffff');
  },
  crystal(g) {
    poly(g, [-0.3, 0, -0.4, 0.8, -0.2, 1.2, -0.05, 0.6, 0, 0], '#c08aff', '#6a3ac0', 0.04);
    poly(g, [-0.1, 0, 0, 1.5, 0.2, 1.7, 0.3, 0.9, 0.25, 0], '#e0b8ff', '#6a3ac0', 0.04);
    poly(g, [0.2, 0, 0.45, 0.6, 0.55, 0.9, 0.5, 0], '#a070ff', '#6a3ac0', 0.04);
    ellipse(g, 0.1, 1.2, 0.05, 0.15, 'rgba(255,255,255,0.7)');
    ellipse(g, 0, 0.7, 0.9, 0.9, 'rgba(200,150,255,0.1)');
  },
};
const PROP_SIZE = { fern: [1.4, 1.2], cycad: [2.4, 3.2], tree: [3.8, 4.2], rock: [1.4, 0.9], mushroom: [1.1, 1.1], nest: [1.2, 0.65], mesa: [2.6, 1.9], bones: [1.3, 0.75], cactus: [1.4, 1.7], reeds: [1.2, 1.7], lily: [1.3, 1.4], glow: [1.6, 1.6], crystal: [2.0, 2.0] };

function paintShadow(g) {
  const gr = g.createRadialGradient(0, 0.3, 0, 0, 0.3, 0.5);
  gr.addColorStop(0, 'rgba(30,20,40,0.42)');
  gr.addColorStop(1, 'rgba(30,20,40,0)');
  g.save();
  g.scale(1, 0.6);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0.5, 0.5, 0, TAU);
  g.fill();
  g.restore();
}

// Generic soft blob for dust/steam particles and a 4-point sparkle.
function paintPuff(g, color) {
  const gr = g.createRadialGradient(0, 0.5, 0, 0, 0.5, 0.5);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0.5, 0.5, 0, TAU);
  g.fill();
}

function paintSparkle(g, color) {
  g.beginPath();
  g.moveTo(0, 1);
  g.quadraticCurveTo(0.08, 0.58, 0.5, 0.5);
  g.quadraticCurveTo(0.08, 0.42, 0, 0);
  g.quadraticCurveTo(-0.08, 0.42, -0.5, 0.5);
  g.quadraticCurveTo(-0.08, 0.58, 0, 1);
  g.fillStyle = color;
  g.fill();
}

function paintHeart(g) {
  g.beginPath();
  g.moveTo(0, 0.1);
  g.bezierCurveTo(-0.6, 0.5, -0.35, 1.0, 0, 0.72);
  g.bezierCurveTo(0.35, 1.0, 0.6, 0.5, 0, 0.1);
  g.fillStyle = '#ff5f8f';
  g.fill();
  g.lineWidth = 0.06;
  g.strokeStyle = '#ffffff';
  g.stroke();
}

function paintFlag(g) {
  rrect(g, -0.05, 0, 0.1, 2.6, 0.04, '#8a5a32', '#5a3a1a', 0.03);
  poly(g, [0.05, 2.55, 1.15, 2.3, 0.05, 2.0], '#ff4f7a', '#9a1a3a', 0.04);
  star(g, 0.42, 2.28, 0.12, '#fff3b0');
}

function paintSmoke(g) {
  for (const [x, y, r] of [[-0.6, 0.5, 0.55], [0.5, 0.55, 0.6], [0, 0.85, 0.65], [0, 0.4, 0.5]]) {
    const gr = g.createRadialGradient(x - r * 0.3, y + r * 0.3, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(225,215,235,0.75)');
    ellipse(g, x, y, r, r * 0.85, gr);
  }
}

// ---- background layers (screen-space, not metre-space) -----------------

// A wide strip of hills, tileable horizontally. Painted in pixels.
export function bakeHills(color, seed, w = 1024, h = 180, jag = 0.5, snow = null) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, h);
  const n = 64;
  const ys = [];
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    let y = 0;
    y += Math.sin((x * 3 + hash01(seed, 1)) * TAU) * 0.22;
    y += Math.sin((x * 7 + hash01(seed, 2)) * TAU) * 0.12 * (1 + jag);
    y += Math.sin((x * 13 + hash01(seed, 3)) * TAU) * 0.05 * jag * 2;
    ys.push(h * (0.55 - y * 0.6));
  }
  for (let i = 0; i <= n; i++) g.lineTo((i / n) * w, ys[i]);
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  if (snow) {
    g.save();
    g.clip();
    g.fillStyle = snow;
    for (let i = 0; i <= n; i++) if (ys[i] < h * 0.3) g.fillRect((i / n) * w - 6, ys[i], 12, 10);
    g.restore();
  }
  return c;
}

export function bakeStars(w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  for (let i = 0; i < 140; i++) {
    const x = hash01(i, 11) * w;
    const y = hash01(i, 12) * h;
    const r = 0.5 + hash01(i, 13) * 1.4;
    g.fillStyle = `rgba(255,255,255,${0.4 + hash01(i, 14) * 0.6})`;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  return c;
}

export function bakeSun(color, night) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, color);
  gr.addColorStop(0.28, color);
  gr.addColorStop(0.32, night ? 'rgba(240,235,255,0.35)' : 'rgba(255,250,210,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
  if (night) {
    g.fillStyle = 'rgba(200,190,235,0.6)';
    for (const [x, y, r] of [[0.45, 0.45, 0.05], [0.56, 0.55, 0.035], [0.47, 0.58, 0.025]]) {
      g.beginPath();
      g.arc(x * s, y * s, r * s, 0, TAU);
      g.fill();
    }
  }
  return c;
}

// Sky gradient strip (1 px wide, stretched).
export function bakeSky(top, bottom, fog) {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(0.75, bottom);
  gr.addColorStop(1, fog);
  g.fillStyle = gr;
  g.fillRect(0, 0, 1, 256);
  return c;
}

// Fog fading from opaque at the horizon to clear further down.
export function bakeFog(rgb) {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  gr.addColorStop(0.3, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.9)`);
  gr.addColorStop(0.45, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`);
  gr.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 1, 128);
  return c;
}

// Signpost with a distance on it.
export function bakeSign(text) {
  return make(1.6, 2.1, 90, (g) => {
    rrect(g, -0.06, 0, 0.12, 1.5, 0.04, '#8a5a32', '#5a3a1a', 0.03);
    rrect(g, -0.75, 1.2, 1.5, 0.8, 0.12, '#e8b878', '#7a4a22', 0.06);
    g.save();
    g.scale(1, -1);
    g.fillStyle = '#5a3018';
    g.font = '900 0.42px ui-rounded, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 0, -1.6);
    g.restore();
  });
}

// Everything except the player's dino. Returned as a list of [key, bake]
// jobs so the page can spread the work over a few frames.
export function spriteJobs(out) {
  const jobs = [];
  const add = (key, fn) => jobs.push(() => { out[key] = fn(); });
  add('log', () => make(2.0, 0.95, 110, paintLog));
  add('boulder', () => make(2.1, 1.8, 100, paintBoulder));
  add('hedge', () => make(1.95, 1.8, 90, paintHedge));
  add('vent', () => make(1.9, 0.5, 100, paintVent));
  for (let f = 0; f < 3; f++) add(`column${f}`, () => make(1.5, 4.1, 70, (g) => paintColumn(g, f)));
  for (let f = 0; f < 2; f++) add(`ptero${f}`, () => make(2.4, 1.3, 100, (g) => paintPtero(g, f), 1));
  for (let f = 0; f < 8; f++) add(`amber${f}`, () => make(0.62, 0.66, 110, (g) => paintAmber(g, Math.cos((f / 8) * Math.PI))));
  for (const k of ['shield', 'magnet', 'glide']) add(`power_${k}`, () => make(1.05, 1.05, 110, (g) => paintPower(g, k)));
  add('parasol', () => make(2.0, 1.3, 100, paintParasol));
  add('eggShield', () => make(1.8, 2.1, 90, paintEggShield));
  for (let f = 0; f < 2; f++) add(`lavvy${f}`, () => make(3.6, 2.9, 80, (g) => paintLavvy(g, f)));
  for (const [name, [w, h]] of Object.entries(PROP_SIZE)) add(`prop_${name}`, () => make(w, h, 70, PROP_PAINTERS[name]));
  add('shadow', () => make(1, 0.6, 64, paintShadow));
  add('dust', () => make(1, 1, 32, (g) => paintPuff(g, 'rgba(240,220,180,0.9)')));
  add('steam', () => make(1, 1, 32, (g) => paintPuff(g, 'rgba(255,255,255,0.95)')));
  add('ember', () => make(1, 1, 32, (g) => paintPuff(g, 'rgba(255,170,60,0.95)')));
  add('sparkle', () => make(1, 1, 48, (g) => paintSparkle(g, '#fff6c0')));
  add('sparkleBlue', () => make(1, 1, 48, (g) => paintSparkle(g, '#c8f4ff')));
  add('heart', () => make(1, 1, 48, paintHeart));
  add('chip', () => make(1, 1, 24, (g) => rrect(g, -0.4, 0.3, 0.8, 0.4, 0.1, '#8a5a2a')));
  add('leafBit', () => make(1, 1, 32, (g) => paintLeaf(g, 0, 0.05, 0.9)));
  add('flag', () => make(1.4, 2.7, 80, paintFlag));
  add('smoke', () => make(2.4, 1.6, 50, paintSmoke));
  BIOMES.forEach((b, i) => {
    add(`far${i}`, () => bakeHills(b.far, i * 2 + 1, 1024, 200, 0.9, b.night ? null : 'rgba(255,255,255,0.55)'));
    add(`near${i}`, () => bakeHills(b.near, i * 2 + 2, 1024, 140, 0.3));
    add(`sun${i}`, () => bakeSun(b.sun, b.night));
  });
  add('stars', () => bakeStars());
  return jobs;
}
