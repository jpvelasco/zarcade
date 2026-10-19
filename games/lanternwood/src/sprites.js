// Every character, creature, item and prop, drawn with canvas shapes and
// baked once into small offscreen canvases at `scale` × world size. Drawing
// at runtime is then just drawImage.
import { roundRect } from './tileart.js';

const OUT = '#2a1e2e';

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function bake(w, h, scale, fn) {
  const c = makeCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  fn(ctx);
  return c;
}

const circle = (ctx, x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
const ellipse = (ctx, x, y, rx, ry, fill, rot = 0) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, 7); ctx.fill(); };

// ------------------------------------------------------------ people

export const PEOPLE = {
  wren: { skin: '#ffd9b8', hair: '#7a4428', hood: '#e2533f', hoodHi: '#ff7a5c', top: '#4f9a4a', topHi: '#6fbf5e', legs: '#5a3d2b', extra: 'lantern' },
  wick: { skin: '#f4d2b5', hair: '#e8e4ee', top: '#7b5ea8', topHi: '#9a7fc8', legs: '#4a3a5c', bun: true, shawl: '#f0c25a', extra: 'glasses' },
  mira: { skin: '#f6cba6', hair: '#f08a3c', top: '#ef7fa8', topHi: '#ffa2c3', legs: '#ef7fa8', pony: true, dress: true },
  bun: { skin: '#f3c9a0', hair: '#6b4a2e', top: '#f5f0e6', topHi: '#ffffff', legs: '#c78a3e', hat: 'chef', round: true },
  hazel: { skin: '#d9c1a6', hair: '#c9a985', top: '#5bb7c9', topHi: '#82d4e2', legs: '#3d7f8f', ears: true },
  gill: { skin: '#e8b98f', hair: '#9a9a9a', top: '#e0b43c', topHi: '#f5cd5c', legs: '#4a5a7a', hat: 'fisher', beard: true },
  pell: { skin: '#f0c7a0', hair: '#4a3020', top: '#8fc27a', topHi: '#a9d996', legs: '#6b4a2e', apron: '#fff4dc', mustache: true },
  sage: { skin: '#e3c1a0', hair: '#a8d08f', top: '#4e8a6a', topHi: '#6fae8a', legs: '#3a6450', hat: 'leaf', dress: true },
  rowan: { skin: '#f7d2b0', hair: '#3a2a20', top: '#f0a33c', topHi: '#ffc05c', legs: '#3d5a8a', hat: 'cap', small: true },
};

/**
 * Draw a person into a 16 × 16 cell. dir: 0 down, 1 up, 2 left, 3 right.
 * frame: 0 stand, 1/2 walking, 3 arms up (holding something).
 */
export function drawPerson(ctx, spec, dir, frame) {
  const side = dir >= 2;
  const flip = dir === 3;
  ctx.save();
  if (flip) { ctx.translate(16, 0); ctx.scale(-1, 1); }
  const bob = frame === 1 || frame === 2 ? -0.5 : 0;
  const k = spec.small ? 0.9 : 1;
  ctx.translate(8, 15);
  ctx.scale(k, k);
  ctx.translate(-8, -15 + bob);
  // Legs
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  ctx.fillStyle = OUT;
  if (side) {
    roundRect(ctx, 6 + step, 12, 2.6, 3.4, 1); ctx.fill();
    roundRect(ctx, 8 - step, 12, 2.6, 3.4, 1); ctx.fill();
    ctx.fillStyle = spec.legs;
    roundRect(ctx, 6.4 + step, 12.2, 1.8, 2.8, 0.8); ctx.fill();
    roundRect(ctx, 8.4 - step, 12.2, 1.8, 2.8, 0.8); ctx.fill();
  } else {
    roundRect(ctx, 5.2, 12 + (step > 0 ? -0.6 : 0), 2.6, 3.6, 1); ctx.fill();
    roundRect(ctx, 8.2, 12 + (step < 0 ? -0.6 : 0), 2.6, 3.6, 1); ctx.fill();
    ctx.fillStyle = spec.legs;
    roundRect(ctx, 5.6, 12.2 + (step > 0 ? -0.6 : 0), 1.8, 2.9, 0.8); ctx.fill();
    roundRect(ctx, 8.6, 12.2 + (step < 0 ? -0.6 : 0), 1.8, 2.9, 0.8); ctx.fill();
  }
  // Body
  ctx.fillStyle = OUT;
  roundRect(ctx, spec.round ? 3.2 : 3.8, 7.6, spec.round ? 9.6 : 8.4, spec.dress ? 6.6 : 5.6, 2.6); ctx.fill();
  ctx.fillStyle = spec.top;
  roundRect(ctx, spec.round ? 3.8 : 4.4, 8.1, spec.round ? 8.4 : 7.2, spec.dress ? 5.6 : 4.6, 2.1); ctx.fill();
  ctx.fillStyle = spec.topHi;
  roundRect(ctx, 5, 8.4, 3, 1.4, 0.7); ctx.fill();
  if (spec.apron) { ctx.fillStyle = spec.apron; roundRect(ctx, 5.6, 9.4, 4.8, 4, 1); ctx.fill(); }
  if (spec.shawl) { ctx.fillStyle = spec.shawl; roundRect(ctx, 4.2, 7.8, 7.6, 2, 1); ctx.fill(); }
  // Arms
  const armUp = frame === 3;
  ctx.fillStyle = OUT;
  if (armUp) {
    roundRect(ctx, 2.6, 4.2, 2.4, 5, 1.2); ctx.fill();
    roundRect(ctx, 11, 4.2, 2.4, 5, 1.2); ctx.fill();
    ctx.fillStyle = spec.skin;
    circle(ctx, 3.8, 4.4, 1.1, spec.skin); circle(ctx, 12.2, 4.4, 1.1, spec.skin);
  } else if (side) {
    roundRect(ctx, 6.8 - step * 0.8, 8.4, 2.6, 4.2, 1.2); ctx.fill();
    ctx.fillStyle = spec.top; roundRect(ctx, 7.2 - step * 0.8, 8.8, 1.8, 3, 0.8); ctx.fill();
    circle(ctx, 8.1 - step * 0.8, 12.4, 0.9, spec.skin);
  } else {
    roundRect(ctx, 2.8, 8.4, 2.4, 4.4, 1.2); ctx.fill();
    roundRect(ctx, 10.8, 8.4, 2.4, 4.4, 1.2); ctx.fill();
    ctx.fillStyle = spec.top;
    roundRect(ctx, 3.2, 8.8, 1.6, 3.2, 0.8); ctx.fill();
    roundRect(ctx, 11.2, 8.8, 1.6, 3.2, 0.8); ctx.fill();
    circle(ctx, 4, 12.6, 0.9, spec.skin); circle(ctx, 12, 12.6, 0.9, spec.skin);
  }
  // Wren's lantern at her hip.
  if (spec.extra === 'lantern' && !armUp) {
    const lx = side ? 4.2 : 11.6, ly = 11.4;
    ctx.fillStyle = OUT; roundRect(ctx, lx - 1.3, ly - 1.4, 2.6, 3.2, 0.8); ctx.fill();
    ctx.fillStyle = '#ffd25a'; roundRect(ctx, lx - 0.8, ly - 0.9, 1.6, 2.2, 0.5); ctx.fill();
  }
  drawHead(ctx, spec, dir);
  ctx.restore();
}

function drawHead(ctx, spec, dir) {
  const side = dir >= 2, back = dir === 1;
  const hx = 8, hy = 5.2, r = 4.3;
  if (spec.ears) {
    ellipse(ctx, 6, 0.6, 1.3, 3, OUT); ellipse(ctx, 10, 0.6, 1.3, 3, OUT);
    ellipse(ctx, 6, 0.8, 0.8, 2.4, spec.hair); ellipse(ctx, 10, 0.8, 0.8, 2.4, spec.hair);
    ellipse(ctx, 6, 1, 0.4, 1.6, '#f3b7c4'); ellipse(ctx, 10, 1, 0.4, 1.6, '#f3b7c4');
  }
  if (spec.hood) {
    circle(ctx, hx, hy, r + 1.1, OUT);
    circle(ctx, hx, hy, r + 0.5, spec.hood);
    if (!back) {
      circle(ctx, side ? hx - 0.8 : hx, hy + 0.6, r - 0.9, spec.skin);
      ctx.fillStyle = spec.hair;
      ctx.beginPath(); ctx.ellipse(side ? hx - 0.4 : hx, hy - 2, r - 1, 1.6, 0, 0, 7); ctx.fill();
    } else {
      ellipse(ctx, hx, hy - 1.6, 2.6, 1.6, spec.hoodHi);
    }
    // The hood's little tail.
    ctx.fillStyle = spec.hood;
    ctx.beginPath(); ctx.moveTo(side ? hx + 3 : hx + 2.4, hy - 3); ctx.quadraticCurveTo(hx + 6, hy - 6, hx + 5.6, hy - 1.4); ctx.closePath(); ctx.fill();
  } else {
    circle(ctx, hx, hy, r + 0.6, OUT);
    circle(ctx, hx, hy, r, back ? spec.hair : spec.skin);
    if (!back) {
      ctx.fillStyle = spec.hair;
      ctx.beginPath(); ctx.ellipse(side ? hx + 0.6 : hx, hy - 2.2, r - 0.2, 2.1, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(hx - r + 0.2, hy - 2.4, 1.4, 2.6);
      if (!side) ctx.fillRect(hx + r - 1.6, hy - 2.4, 1.4, 2.6);
    }
    if (spec.bun) { circle(ctx, hx, hy - 4.8, 2, OUT); circle(ctx, hx, hy - 4.8, 1.5, spec.hair); }
    if (spec.pony) { circle(ctx, side ? hx + 4.4 : hx + 4.6, hy + 0.6, 1.8, OUT); circle(ctx, side ? hx + 4.4 : hx + 4.6, hy + 0.6, 1.3, spec.hair); }
  }
  if (!back) {
    const ex = side ? hx - 1.6 : hx;
    ctx.fillStyle = OUT;
    if (side) ctx.fillRect(ex - 0.7, hy, 1, 1.5);
    else { ctx.fillRect(ex - 2, hy, 1, 1.5); ctx.fillRect(ex + 1, hy, 1, 1.5); }
    ctx.fillStyle = 'rgba(255,120,120,0.45)';
    if (!side) { ctx.fillRect(ex - 3.2, hy + 1.8, 1.4, 0.8); ctx.fillRect(ex + 1.9, hy + 1.8, 1.4, 0.8); }
    if (spec.extra === 'glasses') {
      ctx.strokeStyle = OUT; ctx.lineWidth = 0.5;
      if (!side) { ctx.beginPath(); ctx.arc(ex - 1.5, hy + 0.7, 1.2, 0, 7); ctx.moveTo(ex + 2.7, hy + 0.7); ctx.arc(ex + 1.5, hy + 0.7, 1.2, 0, 7); ctx.stroke(); }
    }
    if (spec.beard) { ctx.fillStyle = spec.hair; ctx.beginPath(); ctx.ellipse(side ? ex : hx, hy + 3, 3, 1.8, 0, 0, Math.PI); ctx.fill(); }
    if (spec.mustache) { ctx.fillStyle = spec.hair; roundRect(ctx, (side ? ex : hx) - 1.8, hy + 2, 3.6, 0.9, 0.4); ctx.fill(); }
  }
  if (spec.hat === 'chef') {
    ctx.fillStyle = OUT; roundRect(ctx, hx - 3.8, hy - 8.4, 7.6, 5.4, 2.4); ctx.fill();
    ctx.fillStyle = '#ffffff'; roundRect(ctx, hx - 3.3, hy - 7.9, 6.6, 4.6, 2); ctx.fill();
  } else if (spec.hat === 'fisher') {
    ellipse(ctx, hx, hy - 3, 6, 1.6, OUT); ellipse(ctx, hx, hy - 3.2, 5.4, 1.1, '#3f6a8a');
    ctx.fillStyle = '#3f6a8a'; roundRect(ctx, hx - 3, hy - 6, 6, 3.2, 1.4); ctx.fill();
  } else if (spec.hat === 'leaf') {
    ctx.fillStyle = '#6fbf4a';
    ctx.beginPath(); ctx.ellipse(hx, hy - 4.2, 5, 1.8, -0.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#4f9a3a'; ctx.fillRect(hx - 0.3, hy - 6.6, 0.8, 2.4);
  } else if (spec.hat === 'cap') {
    ctx.fillStyle = '#d94f4f';
    ctx.beginPath(); ctx.ellipse(hx, hy - 2.6, 4.4, 2.4, 0, Math.PI, 0); ctx.fill();
    if (!back) ctx.fillRect(side ? hx - 6 : hx - 2.5, hy - 2.8, side ? 4 : 5, 1.2);
  }
}

// ------------------------------------------------------------ animals

export function drawFox(ctx, frame, sit) {
  // Tumble: a small orange fox with a big white-tipped tail, facing right.
  const leg = frame === 1 ? 0.8 : frame === 2 ? -0.8 : 0;
  if (sit) {
    ellipse(ctx, 6, 12, 4, 3, OUT); ellipse(ctx, 6, 12, 3.4, 2.4, '#ff9a3c');
    ellipse(ctx, 2.8, 12.8, 3.2, 1.6, OUT); ellipse(ctx, 2.8, 12.6, 2.6, 1.1, '#ff9a3c'); ellipse(ctx, 0.9, 12.6, 1, 0.9, '#fff');
    ellipse(ctx, 8.4, 11, 2, 3.4, OUT); ellipse(ctx, 8.4, 11, 1.4, 2.8, '#ffe6c8');
  } else {
    ctx.fillStyle = OUT;
    ctx.fillRect(4 + leg, 11.5, 1.6, 3.4); ctx.fillRect(9 - leg, 11.5, 1.6, 3.4);
    ellipse(ctx, 1.6, 9.4, 3.6, 2, OUT, -0.4); ellipse(ctx, 1.8, 9.3, 3, 1.4, '#ff9a3c', -0.4); ellipse(ctx, -0.6, 10.4, 1.2, 1, '#fff');
    ellipse(ctx, 7, 10.4, 4.8, 2.8, OUT); ellipse(ctx, 7, 10.3, 4.2, 2.2, '#ff9a3c');
    ellipse(ctx, 7.6, 11.4, 2.4, 1, '#ffe6c8');
  }
  const hx = sit ? 8.8 : 11.6, hy = sit ? 7.2 : 8;
  ctx.fillStyle = OUT;
  ctx.beginPath(); ctx.moveTo(hx - 2.6, hy - 1); ctx.lineTo(hx - 2, hy - 4.6); ctx.lineTo(hx - 0.4, hy - 1.8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(hx + 0.6, hy - 1.8); ctx.lineTo(hx + 1.6, hy - 4.6); ctx.lineTo(hx + 2.4, hy - 1); ctx.fill();
  ellipse(ctx, hx, hy, 3.2, 2.7, OUT);
  ellipse(ctx, hx, hy, 2.6, 2.1, '#ff9a3c');
  ellipse(ctx, hx + 1.6, hy + 0.9, 1.6, 1, '#ffe6c8');
  ctx.fillStyle = OUT; ctx.fillRect(hx + 0.4, hy - 0.8, 0.9, 0.9); ctx.fillRect(hx + 2.8, hy + 0.6, 0.8, 0.7);
}

export function drawCat(ctx, frame) {
  const b = frame % 2 ? 0.4 : 0;
  ellipse(ctx, 3, 10 - b, 1.2, 3, OUT, 0.5); ellipse(ctx, 3, 10 - b, 0.7, 2.4, '#f39a45', 0.5); ellipse(ctx, 2.2, 7.6 - b, 0.7, 0.7, '#fff');
  ellipse(ctx, 7, 12, 4, 2.8, OUT); ellipse(ctx, 7, 12, 3.4, 2.2, '#f39a45');
  ellipse(ctx, 9.6, 8.6, 3, 2.6, OUT); ellipse(ctx, 9.6, 8.6, 2.4, 2.1, '#f39a45');
  ctx.fillStyle = OUT;
  ctx.beginPath(); ctx.moveTo(7.4, 7.4); ctx.lineTo(7.8, 4.8); ctx.lineTo(9, 6.6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10.2, 6.6); ctx.lineTo(11.4, 4.8); ctx.lineTo(11.8, 7.4); ctx.fill();
  ctx.fillRect(8.6, 8.2, 0.8, 1); ctx.fillRect(10.6, 8.2, 0.8, 1);
  ellipse(ctx, 10, 9.8, 0.6, 0.4, '#ff8fb1');
}

export function drawOwl(ctx, frame) {
  const blink = frame === 2;
  ellipse(ctx, 8, 9.6, 5.6, 5.8, OUT); ellipse(ctx, 8, 9.6, 5, 5.2, '#a07a52');
  ellipse(ctx, 8, 11, 3.2, 3.4, '#e9d3a8');
  ctx.fillStyle = OUT;
  ctx.beginPath(); ctx.moveTo(3, 5.5); ctx.lineTo(4.2, 2.6); ctx.lineTo(6, 4.8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(13, 5.5); ctx.lineTo(11.8, 2.6); ctx.lineTo(10, 4.8); ctx.fill();
  circle(ctx, 5.8, 7.6, 2.2, '#fff4d6'); circle(ctx, 10.2, 7.6, 2.2, '#fff4d6');
  if (blink) { ctx.fillStyle = OUT; ctx.fillRect(4.4, 7.4, 2.8, 0.6); ctx.fillRect(8.8, 7.4, 2.8, 0.6); }
  else { circle(ctx, 6, 7.8, 1.1, OUT); circle(ctx, 10, 7.8, 1.1, OUT); circle(ctx, 6.3, 7.4, 0.35, '#fff'); circle(ctx, 10.3, 7.4, 0.35, '#fff'); }
  ctx.fillStyle = '#ffb23c'; ctx.beginPath(); ctx.moveTo(7.2, 9); ctx.lineTo(8.8, 9); ctx.lineTo(8, 10.6); ctx.fill();
  ctx.fillStyle = '#ffb23c'; ctx.fillRect(6, 15, 1.4, 0.8); ctx.fillRect(8.8, 15, 1.4, 0.8);
}

// ------------------------------------------------------------ enemies

export function drawSlime(ctx, frame, big) {
  // frame 0 rest, 1 squash, 2 stretch
  const sx = frame === 1 ? 1.2 : frame === 2 ? 0.85 : 1, sy = frame === 1 ? 0.75 : frame === 2 ? 1.2 : 1;
  ctx.save();
  ctx.translate(8, 15);
  ctx.scale(sx * (big ? 1.9 : 1), sy * (big ? 1.9 : 1));
  ctx.fillStyle = OUT;
  ctx.beginPath(); ctx.moveTo(-6.4, 0); ctx.quadraticCurveTo(-6.6, -9.4, 0, -9.6); ctx.quadraticCurveTo(6.6, -9.4, 6.4, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = big ? '#6dd38a' : '#7bdc6a';
  ctx.beginPath(); ctx.moveTo(-5.6, -0.6); ctx.quadraticCurveTo(-5.8, -8.6, 0, -8.8); ctx.quadraticCurveTo(5.8, -8.6, 5.6, -0.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(-2.6, -6, 1.6, 1, -0.5, 0, 7); ctx.fill();
  ctx.fillStyle = OUT;
  ctx.fillRect(-2.6, -4.6, 1.2, 1.8); ctx.fillRect(1.4, -4.6, 1.2, 1.8);
  ctx.fillStyle = 'rgba(255,120,140,0.6)';
  ctx.fillRect(-4.2, -2.6, 1.6, 0.8); ctx.fillRect(2.6, -2.6, 1.6, 0.8);
  ctx.restore();
}

export function drawBat(ctx, frame) {
  const up = frame % 2 === 0;
  ctx.fillStyle = OUT;
  ctx.beginPath();
  if (up) { ctx.moveTo(8, 8); ctx.lineTo(1, 3); ctx.lineTo(2.4, 7.6); ctx.lineTo(0.6, 9.6); ctx.lineTo(4.6, 9.4); ctx.closePath(); }
  else { ctx.moveTo(8, 8); ctx.lineTo(0.6, 11); ctx.lineTo(3.4, 11.2); ctx.lineTo(3.6, 13); ctx.lineTo(6, 10.6); ctx.closePath(); }
  ctx.fill();
  ctx.beginPath();
  if (up) { ctx.moveTo(8, 8); ctx.lineTo(15, 3); ctx.lineTo(13.6, 7.6); ctx.lineTo(15.4, 9.6); ctx.lineTo(11.4, 9.4); ctx.closePath(); }
  else { ctx.moveTo(8, 8); ctx.lineTo(15.4, 11); ctx.lineTo(12.6, 11.2); ctx.lineTo(12.4, 13); ctx.lineTo(10, 10.6); ctx.closePath(); }
  ctx.fill();
  ctx.fillStyle = '#8a64c8';
  ctx.beginPath();
  if (up) { ctx.moveTo(7.6, 8.2); ctx.lineTo(2.2, 4.4); ctx.lineTo(3.2, 7.8); ctx.lineTo(2, 9); ctx.lineTo(5, 8.9); ctx.closePath(); ctx.moveTo(8.4, 8.2); ctx.lineTo(13.8, 4.4); ctx.lineTo(12.8, 7.8); ctx.lineTo(14, 9); ctx.lineTo(11, 8.9); ctx.closePath(); }
  ctx.fill();
  ellipse(ctx, 8, 8.6, 3, 3, OUT); ellipse(ctx, 8, 8.6, 2.4, 2.4, '#9b74d8');
  ctx.fillStyle = OUT; ctx.beginPath(); ctx.moveTo(6, 6.6); ctx.lineTo(6.4, 4.6); ctx.lineTo(7.2, 6.2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10, 6.6); ctx.lineTo(9.6, 4.6); ctx.lineTo(8.8, 6.2); ctx.fill();
  ctx.fillStyle = '#ffe36b'; ctx.fillRect(6.6, 8, 1, 1); ctx.fillRect(8.6, 8, 1, 1);
  ctx.fillStyle = '#fff'; ctx.fillRect(7.4, 10, 0.6, 0.8); ctx.fillRect(8.2, 10, 0.6, 0.8);
}

export function drawBeetle(ctx, dir, frame, big, knight) {
  // Drawn facing down, then rotated for other directions.
  ctx.save();
  ctx.translate(8, 9);
  ctx.rotate([0, Math.PI, Math.PI / 2, -Math.PI / 2][dir]);
  const s = big ? 1.75 : 1;
  ctx.scale(s, s);
  const legs = frame % 2 ? 0.8 : -0.8;
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const yy of [-2, 0.5, 3]) { ctx.moveTo(-4, yy); ctx.lineTo(-6.6, yy + legs); ctx.moveTo(4, yy); ctx.lineTo(6.6, yy - legs); }
  ctx.stroke();
  ellipse(ctx, 0, 0, 5.4, 6, OUT);
  const shell = knight ? '#b98d4a' : big ? '#3f8fbf' : '#4a7fd0';
  ellipse(ctx, 0, -0.6, 4.8, 5.2, shell);
  ctx.fillStyle = OUT; ctx.fillRect(-0.3, -5, 0.6, 9);
  ellipse(ctx, -2, -2.4, 1.4, 1.8, 'rgba(255,255,255,0.4)');
  // Armored head plate (the front).
  ellipse(ctx, 0, 5, 3.6, 2.4, OUT);
  ellipse(ctx, 0, 5, 3, 1.8, knight ? '#e0c068' : '#c9d4e6');
  ctx.fillStyle = OUT; ctx.fillRect(-1.6, 4.6, 0.9, 0.9); ctx.fillRect(0.7, 4.6, 0.9, 0.9);
  if (knight) { ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(0, -1, 2, 0, 7); ctx.fill(); ctx.fillStyle = OUT; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.fillRect(Math.cos(a) * 2.2 - 0.4, -1 + Math.sin(a) * 2.2 - 0.4, 0.8, 0.8); } }
  ctx.restore();
}

export function drawWisp(ctx, frame) {
  const w = frame % 2 ? 0.6 : -0.6;
  ctx.fillStyle = 'rgba(40,20,70,0.85)';
  ctx.beginPath();
  ctx.moveTo(3, 11); ctx.quadraticCurveTo(2, 4, 8, 2 + w); ctx.quadraticCurveTo(14, 4, 13, 11);
  ctx.quadraticCurveTo(11.5, 9.4 + w, 10.5, 12.6); ctx.quadraticCurveTo(9, 10.4, 8, 13); ctx.quadraticCurveTo(7, 10.4, 5.5, 12.6); ctx.quadraticCurveTo(4.5, 9.4 - w, 3, 11);
  ctx.fill();
  ctx.fillStyle = '#5a3d8f';
  ctx.beginPath(); ctx.ellipse(8, 7, 3.6, 3.2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#d8c8ff';
  ctx.fillRect(6, 6.4, 1.3, 1.6); ctx.fillRect(8.8, 6.4, 1.3, 1.6);
}

export function drawToad(ctx, frame) {
  // 32 × 32: a big mossy toad. frame 0 sit, 1 crouch, 2 puffed, 3 dazed
  const crouch = frame === 1 ? 2 : 0, puff = frame === 2;
  ctx.save();
  ctx.translate(0, crouch);
  ellipse(ctx, 16, 21, 14, 10 - crouch * 0.5, OUT);
  ellipse(ctx, 16, 21, 13, 9 - crouch * 0.5, '#5aa253');
  ellipse(ctx, 16, 25, 9, 5, '#d9e6a0');
  for (const [x, y] of [[8, 17], [22, 15], [13, 13], [25, 22]]) ellipse(ctx, x, y, 2, 1.4, '#3f7f3c');
  ellipse(ctx, 10, 12, 4.2, 4, OUT); ellipse(ctx, 22, 12, 4.2, 4, OUT);
  ellipse(ctx, 10, 12, 3.4, 3.2, '#f6f0c8'); ellipse(ctx, 22, 12, 3.4, 3.2, '#f6f0c8');
  if (frame === 3) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 0.9;
    for (const ex of [10, 22]) { ctx.beginPath(); ctx.moveTo(ex - 2, 10.4); ctx.lineTo(ex + 2, 13.6); ctx.moveTo(ex + 2, 10.4); ctx.lineTo(ex - 2, 13.6); ctx.stroke(); }
  } else { circle(ctx, 10.5, 12.6, 1.7, OUT); circle(ctx, 21.5, 12.6, 1.7, OUT); circle(ctx, 11, 12, 0.6, '#fff'); circle(ctx, 22, 12, 0.6, '#fff'); }
  if (puff) { ellipse(ctx, 16, 22, 7, 5, OUT); ellipse(ctx, 16, 22, 6.2, 4.3, '#ff9fb2'); }
  else { ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(9, 19); ctx.quadraticCurveTo(16, 23, 23, 19); ctx.stroke(); }
  // A tiny crown of leaves.
  ctx.fillStyle = '#7fd06a';
  for (const a of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.ellipse(16 + a * 8, 9.5 - Math.abs(a) * -2, 1.6, 3, a, 0, 7); ctx.fill(); }
  ctx.restore();
}

export function drawCrab(ctx, frame, stunned) {
  // 32 × 32: a crab wearing a bronze bell as a shell. Flipped when stunned.
  ctx.save();
  if (stunned) { ctx.translate(16, 16); ctx.rotate(Math.PI); ctx.translate(-16, -16); }
  const snap = frame === 1;
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.moveTo(16 + s * 9, 22 + i * 2); ctx.lineTo(16 + s * 14, 25 + i * 2.4); }
  ctx.stroke();
  for (const s of [-1, 1]) {
    ellipse(ctx, 16 + s * 12, 15, 4.6, 3.8, OUT); ellipse(ctx, 16 + s * 12, 15, 3.9, 3.1, '#e8674d');
    ctx.fillStyle = OUT; ctx.fillRect(16 + s * 12 - 0.5, snap ? 11 : 12.5, 1, 3);
  }
  ellipse(ctx, 16, 22, 9, 6, OUT); ellipse(ctx, 16, 22, 8.2, 5.2, '#e8674d');
  // Bell shell
  ctx.fillStyle = OUT; ctx.beginPath(); ctx.moveTo(6.4, 21); ctx.quadraticCurveTo(7, 6, 16, 5.6); ctx.quadraticCurveTo(25, 6, 25.6, 21); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d7a548'; ctx.beginPath(); ctx.moveTo(7.6, 20.4); ctx.quadraticCurveTo(8.2, 7, 16, 6.8); ctx.quadraticCurveTo(23.8, 7, 24.4, 20.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2cf72'; ctx.fillRect(10, 10, 2, 8);
  ctx.fillStyle = '#9c6f2a'; ctx.fillRect(7.6, 18, 16.8, 2.4);
  if (!stunned) {
    circle(ctx, 13, 25, 1.6, '#fff'); circle(ctx, 19, 25, 1.6, '#fff');
    circle(ctx, 13.3, 25.3, 0.9, OUT); circle(ctx, 19.3, 25.3, 0.9, OUT);
  }
  ctx.restore();
}

export function drawShade(ctx, frame, revealed) {
  // 32 × 32: a cloaked shadow with a wobbly crown and big round eyes.
  const w = frame % 2 ? 1 : -1;
  ctx.fillStyle = revealed ? '#3b2a6b' : 'rgba(30,18,60,0.9)';
  ctx.beginPath();
  ctx.moveTo(6, 28); ctx.quadraticCurveTo(4, 12, 16, 8); ctx.quadraticCurveTo(28, 12, 26, 28);
  ctx.quadraticCurveTo(23, 25 + w, 21, 30); ctx.quadraticCurveTo(18.5, 26, 16, 30); ctx.quadraticCurveTo(13.5, 26, 11, 30); ctx.quadraticCurveTo(9, 25 - w, 6, 28);
  ctx.fill();
  ctx.fillStyle = revealed ? '#5b46a0' : '#2a1d4f';
  ctx.beginPath(); ctx.ellipse(16, 15, 7, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffd25a';
  ctx.beginPath(); ctx.moveTo(10, 9); ctx.lineTo(11, 3.6); ctx.lineTo(13.4, 6.6); ctx.lineTo(16, 2.6); ctx.lineTo(18.6, 6.6); ctx.lineTo(21, 3.6); ctx.lineTo(22, 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2f0ff';
  ellipse(ctx, 13.4, 15, 2.2, 2.6, '#f2f0ff'); ellipse(ctx, 18.6, 15, 2.2, 2.6, '#f2f0ff');
  circle(ctx, 13.8, 15.6, 1.1, OUT); circle(ctx, 19, 15.6, 1.1, OUT);
  if (revealed) { ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(16, 19, 2, 0.2, Math.PI - 0.2); ctx.stroke(); }
}

// ------------------------------------------------------------ items & props

export function drawItem(ctx, item) {
  switch (item) {
    case 'sword':
      ctx.save(); ctx.translate(8, 8); ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = OUT; roundRect(ctx, -1.6, -7.4, 3.2, 10, 1.2); ctx.fill();
      ctx.fillStyle = '#e8eef8'; roundRect(ctx, -0.9, -6.8, 1.8, 9, 0.8); ctx.fill();
      ctx.fillStyle = OUT; roundRect(ctx, -3.6, 2, 7.2, 2.2, 1); ctx.fill();
      ctx.fillStyle = '#ffd25a'; roundRect(ctx, -3, 2.5, 6, 1.2, 0.6); ctx.fill();
      ctx.fillStyle = '#7a4e2c'; ctx.fillRect(-0.8, 4.2, 1.6, 3);
      ctx.restore(); break;
    case 'lantern':
      ctx.fillStyle = OUT; roundRect(ctx, 4, 4, 8, 10, 2); ctx.fill();
      ctx.fillStyle = '#ffd25a'; roundRect(ctx, 5, 5.5, 6, 7, 1.4); ctx.fill();
      ctx.fillStyle = '#fff3c0'; ctx.beginPath(); ctx.ellipse(8, 9.4, 1.4, 2.2, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(8, 4, 2.4, Math.PI, 0); ctx.stroke(); break;
    case 'boomerang':
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.moveTo(2, 4); ctx.quadraticCurveTo(8, 6, 14, 3); ctx.quadraticCurveTo(10, 9, 13, 14); ctx.quadraticCurveTo(6, 10, 2, 4); ctx.fill();
      ctx.fillStyle = '#6fbf4a'; ctx.beginPath(); ctx.moveTo(3.4, 4.8); ctx.quadraticCurveTo(8, 6.6, 12.4, 4.4); ctx.quadraticCurveTo(9.4, 9, 11.6, 12.4); ctx.quadraticCurveTo(6, 9.4, 3.4, 4.8); ctx.fill();
      ctx.strokeStyle = '#3f8a2e'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(4, 5); ctx.quadraticCurveTo(8.6, 7.4, 11.4, 11.6); ctx.stroke(); break;
    case 'grapple':
      circle(ctx, 6, 9, 3.6, OUT); circle(ctx, 6, 9, 2.9, '#a8743c'); circle(ctx, 11, 8, 3, OUT); circle(ctx, 11, 8, 2.3, '#c48a4a');
      ctx.strokeStyle = '#4fae3a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(6, 6); ctx.quadraticCurveTo(7, 1, 12, 2); ctx.stroke();
      ctx.fillStyle = '#7fd06a'; ctx.beginPath(); ctx.ellipse(12.6, 2.4, 2, 1, -0.4, 0, 7); ctx.fill(); break;
    case 'dash':
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.moveTo(8, 1); ctx.quadraticCurveTo(15, 8, 11, 14); ctx.quadraticCurveTo(8, 16, 5, 14); ctx.quadraticCurveTo(1, 8, 8, 1); ctx.fill();
      ctx.fillStyle = '#ff7a3c'; ctx.beginPath(); ctx.moveTo(8, 2.6); ctx.quadraticCurveTo(13.6, 8, 10.6, 13); ctx.quadraticCurveTo(8, 14.4, 5.4, 13); ctx.quadraticCurveTo(2.4, 8, 8, 2.6); ctx.fill();
      ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.moveTo(8, 6); ctx.quadraticCurveTo(11, 10, 9.4, 12.6); ctx.quadraticCurveTo(8, 13.4, 6.6, 12.6); ctx.quadraticCurveTo(5, 10, 8, 6); ctx.fill(); break;
    case 'key':
      ctx.fillStyle = OUT; circle(ctx, 5, 6, 3.6, OUT); ctx.fillRect(6, 5, 9, 3); ctx.fillRect(11, 7, 2, 4); ctx.fillRect(14, 7, 1.6, 3);
      circle(ctx, 5, 6, 2.8, '#ffd25a'); circle(ctx, 5, 6, 1.2, OUT); ctx.fillStyle = '#ffd25a'; ctx.fillRect(6.6, 5.7, 8, 1.6); ctx.fillRect(11.6, 7, 0.9, 3); break;
    case 'bigkey':
      ctx.fillStyle = OUT; circle(ctx, 5, 6, 4.6, OUT); ctx.fillRect(7, 4.6, 8.6, 3.8); ctx.fillRect(10.4, 7, 2.4, 5.6); ctx.fillRect(13.6, 7, 2.2, 4.4);
      circle(ctx, 5, 6, 3.7, '#ffb23c'); ctx.fillStyle = '#ffb23c'; ctx.fillRect(7.6, 5.3, 7.4, 2.4); ctx.fillRect(11, 7, 1.2, 4.8);
      ctx.fillStyle = '#fff3a8'; ctx.beginPath(); ctx.moveTo(5, 3.6); ctx.lineTo(5.8, 5.4); ctx.lineTo(7.6, 5.6); ctx.lineTo(6.2, 6.8); ctx.lineTo(6.6, 8.6); ctx.lineTo(5, 7.6); ctx.lineTo(3.4, 8.6); ctx.lineTo(3.8, 6.8); ctx.lineTo(2.4, 5.6); ctx.lineTo(4.2, 5.4); ctx.closePath(); ctx.fill(); break;
    case 'heart': case 'container':
      heartShape(ctx, 8, 8.4, 6.6, OUT); heartShape(ctx, 8, 8.4, 5.4, '#ff5a7a');
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(5.4, 6.4, 1.4, 1, -0.6, 0, 7); ctx.fill();
      if (item === 'container') { ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = 1; heartPath(ctx, 8, 8.4, 7.4); ctx.stroke(); }
      break;
    case 'shard':
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.moveTo(8, 0.6); ctx.lineTo(13.4, 7); ctx.lineTo(8, 15.4); ctx.lineTo(2.6, 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffb23c'; ctx.beginPath(); ctx.moveTo(8, 2.2); ctx.lineTo(12, 7); ctx.lineTo(8, 13.6); ctx.lineTo(4, 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff3a8'; ctx.beginPath(); ctx.moveTo(8, 3.4); ctx.lineTo(10, 7); ctx.lineTo(8, 9.6); ctx.lineTo(6, 7); ctx.closePath(); ctx.fill(); break;
    case 'berry': case 'berries': case 'berry5':
      circle(ctx, 8, 9, 4.4, OUT); circle(ctx, 8, 9, 3.6, item === 'berry5' ? '#ff6fb1' : '#7f8cff');
      circle(ctx, 6.8, 7.8, 1.2, '#e0e6ff');
      ctx.fillStyle = '#4fae3a'; ctx.beginPath(); ctx.ellipse(9.6, 4.6, 2.2, 1.1, -0.5, 0, 7); ctx.fill(); break;
    case 'tea':
      ctx.fillStyle = OUT; roundRect(ctx, 4, 3, 8, 12, 3); ctx.fill();
      ctx.fillStyle = '#c8f0ff'; roundRect(ctx, 5, 6, 6, 8, 2.4); ctx.fill();
      ctx.fillStyle = '#ff8fd0'; roundRect(ctx, 5, 9, 6, 5, 2.2); ctx.fill();
      ctx.fillStyle = '#a06c3f'; ctx.fillRect(6, 2, 4, 2.4);
      circle(ctx, 9.4, 8, 0.8, '#fff'); break;
    case 'pouch':
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.ellipse(8, 10, 6, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#c78a3e'; ctx.beginPath(); ctx.ellipse(8, 10, 5.2, 4.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = OUT; ctx.fillRect(5, 4, 6, 2.4); circle(ctx, 8, 10, 1.6, '#7f8cff'); break;
    case 'honeycap':
      ctx.fillStyle = OUT; roundRect(ctx, 6, 8, 4, 7, 1.4); ctx.fill();
      ctx.fillStyle = '#fff4dc'; roundRect(ctx, 6.7, 8.5, 2.6, 6, 1); ctx.fill();
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.ellipse(8, 8, 6.4, 4.6, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ffc23c'; ctx.beginPath(); ctx.ellipse(8, 8, 5.6, 3.8, 0, Math.PI, 0); ctx.fill();
      circle(ctx, 6, 5.6, 0.9, '#fff3a8'); circle(ctx, 9.6, 6.2, 0.7, '#fff3a8'); break;
    default:
      circle(ctx, 8, 8, 4, '#fff');
  }
}

function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.8);
  ctx.bezierCurveTo(x - s * 1.2, y - s * 0.1, x - s * 0.6, y - s * 0.95, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 0.95, x + s * 1.2, y - s * 0.1, x, y + s * 0.8);
  ctx.closePath();
}
function heartShape(ctx, x, y, s, fill) { ctx.fillStyle = fill; heartPath(ctx, x, y, s); ctx.fill(); }

export function drawChest(ctx, open, big) {
  const w = big ? 14 : 12, x = (16 - w) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(8, 14.6, w / 2 + 1, 1.8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = OUT; roundRect(ctx, x - 0.6, 5.4, w + 1.2, 9.6, 2); ctx.fill();
  ctx.fillStyle = big ? '#7b4fb0' : '#a56a3a'; roundRect(ctx, x, 9, w, 5.4, 1.4); ctx.fill();
  if (open) {
    ctx.fillStyle = '#2a1e2e'; ctx.fillRect(x + 1, 7.4, w - 2, 2.2);
    ctx.fillStyle = big ? '#9a6fd0' : '#c88a50'; roundRect(ctx, x, 3, w, 4.4, 1.6); ctx.fill();
  } else {
    ctx.fillStyle = big ? '#9a6fd0' : '#c88a50'; roundRect(ctx, x, 6, w, 4.2, 1.6); ctx.fill();
  }
  ctx.fillStyle = '#ffd25a';
  ctx.fillRect(x + 1, open ? 9 : 9.6, w - 2, 1);
  if (!open) { roundRect(ctx, 6.8, 8.4, 2.4, 3, 0.6); ctx.fill(); ctx.fillStyle = OUT; ctx.fillRect(7.7, 9.4, 0.6, 1.2); }
}

export function drawStatue(ctx, lit) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(8, 14.6, 7, 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = OUT; roundRect(ctx, 2.4, 10.4, 11.2, 4.8, 1.4); ctx.fill();
  ctx.fillStyle = '#b8b0c8'; roundRect(ctx, 3, 10.8, 10, 3.8, 1); ctx.fill();
  ctx.fillStyle = OUT; roundRect(ctx, 4.6, 1.4, 6.8, 10, 2.6); ctx.fill();
  ctx.fillStyle = '#d4cee0'; roundRect(ctx, 5.2, 2, 5.6, 8.8, 2.2); ctx.fill();
  ctx.fillStyle = lit ? '#ffd25a' : '#8e86a8'; roundRect(ctx, 6.4, 3.6, 3.2, 4.4, 1.2); ctx.fill();
  if (lit) { ctx.fillStyle = '#fff3c0'; ctx.beginPath(); ctx.ellipse(8, 6, 0.8, 1.4, 0, 0, 7); ctx.fill(); }
}

export function drawSign(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(8, 14.6, 5, 1.6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6b4526'; ctx.fillRect(7, 8, 2, 7);
  ctx.fillStyle = OUT; roundRect(ctx, 1.6, 2.4, 12.8, 7.6, 1.4); ctx.fill();
  ctx.fillStyle = '#c99a5a'; roundRect(ctx, 2.2, 3, 11.6, 6.4, 1); ctx.fill();
  ctx.fillStyle = '#8a6036'; ctx.fillRect(4, 5, 8, 0.8); ctx.fillRect(4, 7, 6, 0.8);
}

export function drawFlag(ctx, frame) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(6, 14.8, 3, 1.2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6b4526'; ctx.fillRect(5, 1, 1.6, 14);
  const w = frame % 2 ? 1 : -1;
  ctx.fillStyle = '#ff5a7a';
  ctx.beginPath(); ctx.moveTo(6.6, 1.6); ctx.quadraticCurveTo(10, 2.4 + w, 14, 2); ctx.lineTo(13, 4.4); ctx.lineTo(14, 7); ctx.quadraticCurveTo(10, 7.4 - w, 6.6, 6.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillRect(9, 3.6, 2, 1.4);
}

export function drawBlock(ctx, theme) {
  const cols = { burrow: ['#8b6f4e', '#a88a62', '#5f4a32'], temple: ['#5f87ad', '#80a6ca', '#3e5f82'], peak: ['#8a7aa3', '#a898c0', '#5e5078'] }[theme] || ['#8b8b8b', '#aaa', '#666'];
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(1, 13, 15, 3);
  ctx.fillStyle = OUT; roundRect(ctx, 0.4, 0.4, 15.2, 14.6, 2); ctx.fill();
  ctx.fillStyle = cols[0]; roundRect(ctx, 1, 1, 14, 13.4, 1.6); ctx.fill();
  ctx.fillStyle = cols[1]; roundRect(ctx, 1, 1, 14, 4, 1.6); ctx.fill();
  ctx.fillStyle = cols[2]; ctx.fillRect(3, 8, 10, 1); ctx.fillRect(7.5, 5, 1, 9);
}

export function drawHoneycapGlow(ctx) { drawItem(ctx, 'honeycap'); }

// ------------------------------------------------------------ the sprite sheet

/** Bake every sprite once. Returns lookup tables of canvases. */
export function bakeSprites(scale) {
  const S = {};
  const b16 = (fn) => bake(16, 16, scale, fn);
  const b32 = (fn) => bake(32, 32, scale, fn);
  S.people = {};
  for (const [id, spec] of Object.entries(PEOPLE)) {
    S.people[id] = [];
    for (let d = 0; d < 4; d++) {
      S.people[id][d] = [];
      for (let f = 0; f < 4; f++) S.people[id][d][f] = b16((c) => drawPerson(c, spec, d, f));
    }
  }
  S.fox = [0, 1, 2].map((f) => b16((c) => drawFox(c, f, false)));
  S.foxSit = b16((c) => drawFox(c, 0, true));
  S.cat = [0, 1].map((f) => b16((c) => drawCat(c, f)));
  S.owl = [0, 1, 2].map((f) => b16((c) => drawOwl(c, f)));
  S.slime = [0, 1, 2].map((f) => b16((c) => drawSlime(c, f, false)));
  S.bigslime = [0, 1, 2].map((f) => b32((c) => { c.translate(8, 16); drawSlime(c, f, true); }));
  S.bat = [0, 1].map((f) => b16((c) => drawBat(c, f)));
  S.beetle = [0, 1, 2, 3].map((d) => [0, 1].map((f) => b16((c) => drawBeetle(c, d, f, false))));
  S.shellbeetle = [0, 1, 2, 3].map((d) => [0, 1].map((f) => b32((c) => { c.translate(8, 8); drawBeetle(c, d, f, true); })));
  S.gearknight = [0, 1, 2, 3].map((d) => [0, 1].map((f) => b32((c) => { c.translate(8, 6); drawBeetle(c, d, f, true, true); })));
  S.wisp = [0, 1].map((f) => b16((c) => drawWisp(c, f)));
  S.toad = [0, 1, 2, 3].map((f) => b32((c) => drawToad(c, f)));
  S.crab = [0, 1].map((f) => b32((c) => drawCrab(c, f, false)));
  S.crabFlip = b32((c) => drawCrab(c, 0, true));
  S.shade = [0, 1].map((f) => [false, true].map((r) => b32((c) => drawShade(c, f, r))));
  S.items = {};
  for (const it of ['sword', 'lantern', 'boomerang', 'grapple', 'dash', 'key', 'bigkey', 'heart', 'container', 'shard', 'berry', 'berry5', 'berries', 'tea', 'pouch', 'honeycap']) S.items[it] = b16((c) => drawItem(c, it));
  S.chest = { closed: b16((c) => drawChest(c, false, false)), open: b16((c) => drawChest(c, true, false)), bigClosed: b16((c) => drawChest(c, false, true)), bigOpen: b16((c) => drawChest(c, true, true)) };
  S.statue = [b16((c) => drawStatue(c, false)), b16((c) => drawStatue(c, true))];
  S.sign = b16(drawSign);
  S.flag = [0, 1].map((f) => b16((c) => drawFlag(c, f)));
  S.block = {};
  for (const t of ['burrow', 'temple', 'peak', 'overworld']) S.block[t] = b16((c) => drawBlock(c, t));
  S.light = lightSprite(64);
  S.glow = glowSprite(32, '255,210,90');
  S.glowBlue = glowSprite(32, '150,220,255');
  S.glowPurple = glowSprite(32, '170,120,255');
  return S;
}

function lightSprite(size) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.85)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function glowSprite(size, rgb) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb},0.9)`);
  g.addColorStop(0.35, `rgba(${rgb},0.35)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** A dialogue portrait for a speaker, `size` px square. */
export function drawPortrait(canvas, who) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  const bg = { wren: '#ffd6b8', tumble: '#ffcf9a', wick: '#d8c8f0', mira: '#ffd0e0', bun: '#fff0c8', hazel: '#c8eef4', gill: '#cfe0f4', owl: '#e8d8b8', pell: '#d8f0c8', sage: '#cfeedd', rowan: '#ffe0b8', biscuit: '#ffe0c0', shade: '#cdbff4', sign: '#f0dcb8' }[who] || '#eee';
  const g = ctx.createRadialGradient(size / 2, size * 0.45, size * 0.1, size / 2, size / 2, size * 0.7);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const k = size / 12;
  if (PEOPLE[who]) {
    ctx.translate(size / 2 - 8 * k * 0.95, size * 0.06);
    ctx.scale(k * 0.95, k * 0.95);
    drawPerson(ctx, PEOPLE[who], 0, 0);
  } else if (who === 'tumble') { ctx.translate(-size * 0.25, -size * 0.12); ctx.scale(k * 1.1, k * 1.1); drawFox(ctx, 0, true); }
  else if (who === 'biscuit') { ctx.translate(-size * 0.15, -size * 0.2); ctx.scale(k * 1.1, k * 1.1); drawCat(ctx, 0); }
  else if (who === 'owl') { ctx.translate(size * 0.0, -size * 0.06); ctx.scale(k * 0.8, k * 0.8); drawOwl(ctx, 0); }
  else if (who === 'shade') { ctx.translate(-size * 0.1, -size * 0.05); ctx.scale(k * 0.48, k * 0.48); drawShade(ctx, 0, true); }
  else { ctx.translate(size * 0.12, size * 0.12); ctx.scale(k * 0.9, k * 0.9); drawSign(ctx); }
  ctx.restore();
}
