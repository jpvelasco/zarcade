// Procedural storybook sprites drawn with Canvas 2D. Every function draws
// around the local origin (the middle of a tile) at scale `s` (tile size in
// px). Nothing here touches game state.
const TAU = Math.PI * 2;

function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}
function ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}
function line(ctx, x1, y1, x2, y2, stroke, width) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function shadow(ctx, s, rx = 0.3, ry = 0.11, y = 0.3, alpha = 0.22) {
  ellipse(ctx, 0.03 * s, y * s, rx * s, ry * s, `rgba(40, 60, 20, ${alpha})`);
}

// Cute face: two eyes looking toward (lx, ly) and an optional smile.
function face(ctx, s, x, y, size, look = [0, 0], smile = true, blush = true) {
  const e = size * s;
  for (const side of [-1, 1]) {
    circle(ctx, x + side * e * 0.9, y, e * 0.62, '#fff');
    circle(ctx, x + side * e * 0.9 + look[0] * e * 0.25, y + look[1] * e * 0.25, e * 0.36, '#2b1d14');
    circle(ctx, x + side * e * 0.9 + look[0] * e * 0.25 - e * 0.12, y + look[1] * e * 0.25 - e * 0.14, e * 0.12, '#fff');
  }
  if (blush) {
    ellipse(ctx, x - e * 1.7, y + e * 0.9, e * 0.45, e * 0.26, 'rgba(255, 120, 120, 0.45)');
    ellipse(ctx, x + e * 1.7, y + e * 0.9, e * 0.45, e * 0.26, 'rgba(255, 120, 120, 0.45)');
  }
  if (smile) {
    ctx.beginPath();
    ctx.arc(x, y + e * 0.7, e * 0.55, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = '#2b1d14';
    ctx.lineWidth = Math.max(1, e * 0.22);
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

function leaf(ctx, s, x, y, len, angle, fill = '#5fae3e') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * s * 0.5, -len * s * 0.35, len * s, 0);
  ctx.quadraticCurveTo(len * s * 0.5, len * s * 0.35, 0, 0);
  ctx.fillStyle = fill;
  ctx.fill();
  line(ctx, 0, 0, len * s * 0.8, 0, 'rgba(255,255,255,0.25)', Math.max(1, s * 0.012));
  ctx.restore();
}

function stem(ctx, s, top, sway = 0, width = 0.07, color = '#4e9a3a') {
  ctx.beginPath();
  ctx.moveTo(0, 0.04 * s);
  ctx.quadraticCurveTo(sway * s, (top * 0.5) * s, sway * 0.6 * s, top * s);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * s;
  ctx.lineCap = 'round';
  ctx.stroke();
}

// Flower pot. Tier 1 adds a gold band, tier 2 is glazed blue with a star.
function pot(ctx, s, tier) {
  const body = tier === 2 ? '#4d78c9' : '#d9774a';
  const rim = tier === 2 ? '#f3c04f' : '#ea8e5f';
  ctx.beginPath();
  ctx.moveTo(-0.22 * s, 0.04 * s);
  ctx.lineTo(0.22 * s, 0.04 * s);
  ctx.lineTo(0.16 * s, 0.3 * s);
  ctx.lineTo(-0.16 * s, 0.3 * s);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.2 * s, 0.06 * s);
  ctx.lineTo(-0.1 * s, 0.06 * s);
  ctx.lineTo(-0.08 * s, 0.29 * s);
  ctx.lineTo(-0.15 * s, 0.29 * s);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();
  if (tier >= 1) {
    ctx.fillStyle = tier === 2 ? '#f3c04f' : '#f5c542';
    ctx.fillRect(-0.19 * s, 0.13 * s, 0.38 * s, 0.045 * s);
  }
  if (tier === 2) star(ctx, 0, 0.225 * s, 0.05 * s, '#fff3c4');
  rrect(ctx, -0.25 * s, -0.02 * s, 0.5 * s, 0.08 * s, 0.03 * s);
  ctx.fillStyle = rim;
  ctx.fill();
  ellipse(ctx, 0, 0.0, 0.2 * s, 0.035 * s, '#6b4226');
}

export function star(ctx, x, y, r, fill, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function crown(ctx, s, x, y, w) {
  const h = w * 0.6;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w / 2, y - h);
  ctx.lineTo(x - w / 4, y - h * 0.5);
  ctx.lineTo(x, y - h * 1.1);
  ctx.lineTo(x + w / 4, y - h * 0.5);
  ctx.lineTo(x + w / 2, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fillStyle = '#ffcf3f';
  ctx.fill();
  ctx.strokeStyle = '#d99a1e';
  ctx.lineWidth = Math.max(1, w * 0.08);
  ctx.stroke();
  circle(ctx, x, y - h * 0.35, w * 0.08, '#ff5d73');
}

// ------------------------------------------------------------ defenders

// o: { tier, aim (screen radians), t (seconds), fire (0..1 recoil), glow (0..1) }
export function drawDefender(ctx, s, type, o) {
  const tier = o.tier || 0;
  const look = [Math.cos(o.aim ?? Math.PI / 2), Math.sin(o.aim ?? Math.PI / 2)];
  const sway = Math.sin((o.t || 0) * 1.6 + (o.phase || 0)) * 0.015;
  switch (type) {
    case 'pea': return peaPod(ctx, s, tier, o, look, sway);
    case 'sunflower': return sunflower(ctx, s, tier, o, look, sway);
    case 'honey': return honeyPot(ctx, s, tier, o);
    case 'daisy': return daisy(ctx, s, tier, o, sway);
    case 'thistle': return thistle(ctx, s, tier, o, look, sway);
    case 'mage': return mushroom(ctx, s, tier, o, look);
    case 'lavender': return lantern(ctx, s, tier, o);
    default: return null;
  }
}

function peaPod(ctx, s, tier, o, look, sway) {
  shadow(ctx, s);
  pot(ctx, s, tier);
  stem(ctx, s, -0.26, sway);
  leaf(ctx, s, 0, -0.08 * s, 0.2, -2.6, '#63b347');
  leaf(ctx, s, 0, -0.12 * s, 0.2, -0.5, '#58a53d');
  const hx = sway * s * 0.6, hy = -0.36 * s;
  const aim = o.aim ?? Math.PI / 2;
  const recoil = (o.fire || 0) * 0.06 * s;
  const barrels = tier + 1;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(aim);
  for (let i = 0; i < barrels; i++) {
    const off = (i - (barrels - 1) / 2) * 0.085 * s;
    rrect(ctx, 0.04 * s - recoil, off - 0.055 * s, 0.26 * s, 0.11 * s, 0.05 * s);
    ctx.fillStyle = '#4f9d33';
    ctx.fill();
    circle(ctx, 0.3 * s - recoil, off, 0.062 * s, '#3e7f27');
    circle(ctx, 0.3 * s - recoil, off, 0.035 * s, '#23461a');
  }
  ctx.restore();
  ellipse(ctx, hx, hy, 0.19 * s, 0.17 * s, '#72c94a');
  ellipse(ctx, hx - 0.05 * s, hy - 0.06 * s, 0.08 * s, 0.05 * s, 'rgba(255,255,255,0.35)');
  face(ctx, s, hx, hy + 0.01 * s, 0.045, look, true);
  if (tier === 2) {
    leaf(ctx, s, hx, hy - 0.14 * s, 0.14, -1.9, '#8fdc5a');
    leaf(ctx, s, hx, hy - 0.14 * s, 0.14, -1.25, '#8fdc5a');
  }
}

function sunflower(ctx, s, tier, o, look, sway) {
  shadow(ctx, s, 0.32);
  pot(ctx, s, tier);
  stem(ctx, s, -0.34, sway, 0.08);
  leaf(ctx, s, 0, -0.1 * s, 0.22, -2.7, '#5fae3e');
  leaf(ctx, s, 0, -0.16 * s, 0.22, -0.4, '#56a13a');
  const squash = 1 - (o.fire || 0) * 0.12;
  const fx = sway * s * 0.6 + look[0] * 0.04 * s, fy = -0.44 * s + look[1] * 0.02 * s;
  const R = (0.25 + tier * 0.025) * s;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(1 / squash, squash);
  const petals = 13;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU + (o.t || 0) * 0.05;
    ellipse(ctx, Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72, R * 0.42, R * 0.17, tier === 2 ? '#ffc629' : '#ffd23f', a);
  }
  if (tier >= 1) {
    for (let i = 0; i < petals; i++) {
      const a = ((i + 0.5) / petals) * TAU;
      ellipse(ctx, Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, R * 0.3, R * 0.13, '#ff9f1c', a);
    }
  }
  circle(ctx, 0, 0, R * 0.52, '#7a4a21');
  circle(ctx, 0, 0, R * 0.42, '#8f5a2a');
  for (let i = 0; i < 8; i++) {
    const a = i * 0.8;
    circle(ctx, Math.cos(a) * R * 0.32, Math.sin(a) * R * 0.32, R * 0.045, '#5b3517');
  }
  face(ctx, s, 0, -R * 0.06, 0.042, look, true);
  ctx.restore();
  if (tier === 2) crown(ctx, s, fx, fy - R * 0.95, 0.2 * s);
}

function honeyPot(ctx, s, tier, o) {
  shadow(ctx, s, 0.3);
  const lift = (o.fire || 0) * 0.08 * s;
  // jar
  ellipse(ctx, 0, 0.06 * s, 0.25 * s, 0.24 * s, tier === 2 ? '#e58b2a' : '#e9a23b');
  ellipse(ctx, -0.08 * s, -0.02 * s, 0.07 * s, 0.11 * s, 'rgba(255,255,255,0.25)');
  rrect(ctx, -0.15 * s, -0.22 * s, 0.3 * s, 0.1 * s, 0.03 * s);
  ctx.fillStyle = '#d68a2c';
  ctx.fill();
  if (tier === 2) {
    ctx.fillStyle = '#8e5bd6';
    ctx.fillRect(-0.24 * s, 0.03 * s, 0.48 * s, 0.06 * s);
  }
  // honey spilling over the rim
  ctx.beginPath();
  ctx.moveTo(-0.16 * s, -0.14 * s);
  ctx.quadraticCurveTo(-0.14 * s, -0.02 * s, -0.1 * s, -0.12 * s);
  ctx.quadraticCurveTo(-0.06 * s, 0.04 * s, 0.0, -0.12 * s);
  ctx.quadraticCurveTo(0.07 * s, -0.04 * s, 0.1 * s, -0.12 * s);
  ctx.lineTo(0.16 * s, -0.14 * s);
  ctx.closePath();
  ctx.fillStyle = '#ffb627';
  ctx.fill();
  circle(ctx, -0.06 * s, 0.02 * s + Math.sin((o.t || 0) * 2) * 0.015 * s, 0.03 * s, '#ffb627');
  // lid
  ctx.save();
  ctx.translate(0, -lift);
  ellipse(ctx, 0, -0.24 * s, 0.18 * s, 0.06 * s, '#b86424');
  circle(ctx, 0, -0.29 * s, 0.045 * s, '#b86424');
  if (tier === 2) crown(ctx, s, 0, -0.31 * s, 0.13 * s);
  ctx.restore();
  // bee badge
  ellipse(ctx, 0.07 * s, 0.1 * s, 0.07 * s, 0.05 * s, '#ffd23f');
  ctx.fillStyle = '#2b1d14';
  ctx.fillRect(0.05 * s, 0.055 * s, 0.018 * s, 0.09 * s);
  ctx.fillRect(0.085 * s, 0.055 * s, 0.018 * s, 0.09 * s);
  if (tier >= 1) {
    // a busy bee buzzing around the jar
    const a = (o.t || 0) * 3 + (o.phase || 0) * 5;
    const bx = Math.cos(a) * 0.3 * s, by = -0.15 * s + Math.sin(a * 2) * 0.06 * s;
    ellipse(ctx, bx, by - 0.03 * s, 0.035 * s, 0.025 * s, 'rgba(255,255,255,0.8)');
    ellipse(ctx, bx, by, 0.04 * s, 0.03 * s, '#ffd23f');
    ctx.fillStyle = '#2b1d14';
    ctx.fillRect(bx - 0.005 * s, by - 0.03 * s, 0.012 * s, 0.06 * s);
    // wooden dipper
    line(ctx, 0.1 * s, -0.16 * s, 0.24 * s, -0.36 * s, '#9c6b3f', 0.035 * s);
    circle(ctx, 0.25 * s, -0.37 * s, 0.035 * s, '#ffb627');
  }
}

function daisy(ctx, s, tier, o, sway) {
  shadow(ctx, s);
  pot(ctx, s, tier);
  stem(ctx, s, -0.3, sway);
  leaf(ctx, s, 0, -0.09 * s, 0.2, -2.6);
  leaf(ctx, s, 0, -0.14 * s, 0.18, -0.5);
  const fx = sway * s * 0.6, fy = -0.38 * s;
  const glow = o.glow || 0;
  if (glow > 0) {
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 0.5 * s);
    g.addColorStop(0, `rgba(255, 230, 120, ${0.7 * glow})`);
    g.addColorStop(1, 'rgba(255, 230, 120, 0)');
    circle(ctx, fx, fy, 0.5 * s, g);
  }
  const R = (0.21 + tier * 0.02) * s;
  const spin = (o.t || 0) * 0.4;
  const rings = tier === 2 ? 2 : 1;
  for (let r = rings - 1; r >= 0; r--) {
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + spin + r * 0.3;
      const rr = R * (r ? 1.2 : 0.75);
      ellipse(ctx, fx + Math.cos(a) * rr, fy + Math.sin(a) * rr, R * 0.42, R * 0.15, r ? '#ffe9a3' : tier >= 1 ? '#fff6d8' : '#ffffff', a);
    }
  }
  if (tier >= 1) {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + spin;
      circle(ctx, fx + Math.cos(a) * R * 1.05, fy + Math.sin(a) * R * 1.05, R * 0.07, '#ffcf3f');
    }
  }
  circle(ctx, fx, fy, R * 0.5, '#ffc93c');
  circle(ctx, fx - R * 0.12, fy - R * 0.14, R * 0.18, 'rgba(255,255,255,0.4)');
  face(ctx, s, fx, fy - R * 0.05, 0.035, [0, 0.3], true);
}

function thistle(ctx, s, tier, o, look, sway) {
  shadow(ctx, s);
  pot(ctx, s, tier);
  const heads = tier === 2 ? [[-0.12, -0.36], [0.13, -0.42]] : [[0, -0.4]];
  for (const [hx0] of heads) {
    ctx.beginPath();
    ctx.moveTo(0, 0.04 * s);
    ctx.quadraticCurveTo(hx0 * 0.2 * s, -0.2 * s, hx0 * s + sway * s, -0.3 * s);
    ctx.strokeStyle = '#5b8f3a';
    ctx.lineWidth = 0.06 * s;
    ctx.stroke();
  }
  leaf(ctx, s, 0, -0.1 * s, 0.2, -2.8, '#6e9e45');
  leaf(ctx, s, 0, -0.12 * s, 0.2, -0.35, '#6e9e45');
  if (tier >= 1) circle(ctx, 0.17 * s, -0.12 * s, 0.05 * s, '#b07fe0');
  heads.forEach(([hx0, hy0], k) => {
    const hx = hx0 * s + sway * s + look[0] * 0.03 * s, hy = hy0 * s + look[1] * 0.015 * s;
    const R = 0.16 * s;
    // spiky green cup
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.05 + (i / 10) * Math.PI * 0.9;
      const rr = i % 2 ? R * 0.8 : R * 1.12;
      ctx.lineTo(hx + Math.cos(a) * rr, hy + 0.04 * s + Math.sin(a) * rr * 0.8);
    }
    ctx.closePath();
    ctx.fillStyle = '#4f8a36';
    ctx.fill();
    ellipse(ctx, hx, hy + 0.05 * s, R * 0.9, R * 0.6, '#65a843');
    // purple tuft
    const fuzz = 14;
    for (let i = 0; i < fuzz; i++) {
      const a = Math.PI + (i / (fuzz - 1)) * Math.PI;
      line(ctx, hx, hy, hx + Math.cos(a) * R * 1.1, hy + Math.sin(a) * R * 1.15, i % 2 ? '#b388eb' : '#8e5bd6', 0.035 * s);
    }
    circle(ctx, hx, hy - R * 0.2, R * 0.55, '#9d6ee0');
    face(ctx, s, hx, hy + R * 0.3, 0.035, look, k === 0);
  });
}

function mushroom(ctx, s, tier, o, look) {
  shadow(ctx, s, 0.3);
  ellipse(ctx, 0, 0.24 * s, 0.26 * s, 0.08 * s, '#7a5236');
  const t = o.t || 0;
  // stem with face
  rrect(ctx, -0.14 * s, -0.16 * s, 0.28 * s, 0.4 * s, 0.12 * s);
  ctx.fillStyle = '#f6ead0';
  ctx.fill();
  ellipse(ctx, -0.06 * s, 0.02 * s, 0.035 * s, 0.12 * s, 'rgba(255,255,255,0.5)');
  face(ctx, s, 0, 0.0, 0.04, look, true);
  // cap
  const capColor = tier === 0 ? '#e0483b' : tier === 1 ? '#6a5ae0' : '#9b4fd1';
  ctx.beginPath();
  ctx.moveTo(-0.3 * s, -0.12 * s);
  ctx.quadraticCurveTo(-0.3 * s, -0.46 * s, 0, -0.47 * s);
  ctx.quadraticCurveTo(0.3 * s, -0.46 * s, 0.3 * s, -0.12 * s);
  ctx.quadraticCurveTo(0, -0.05 * s, -0.3 * s, -0.12 * s);
  ctx.fillStyle = capColor;
  ctx.fill();
  ellipse(ctx, -0.12 * s, -0.33 * s, 0.07 * s, 0.035 * s, 'rgba(255,255,255,0.3)', -0.5);
  if (tier === 0) {
    for (const [x, y, r] of [[-0.16, -0.24, 0.045], [0.05, -0.36, 0.05], [0.18, -0.2, 0.04], [-0.02, -0.2, 0.03]]) circle(ctx, x * s, y * s, r * s, '#fff5e8');
  } else {
    for (const [x, y, r] of [[-0.16, -0.24, 0.05], [0.07, -0.35, 0.055], [0.18, -0.2, 0.045]]) star(ctx, x * s, y * s, r * s, '#ffe066');
  }
  if (tier === 2) {
    // tall wizard hat
    ctx.beginPath();
    ctx.moveTo(-0.14 * s, -0.42 * s);
    ctx.quadraticCurveTo(0.02 * s, -0.62 * s, 0.14 * s, -0.8 * s);
    ctx.lineTo(0.14 * s, -0.42 * s);
    ctx.closePath();
    ctx.fillStyle = '#4b2a8a';
    ctx.fill();
    ellipse(ctx, 0, -0.43 * s, 0.2 * s, 0.045 * s, '#3a1f6e');
    star(ctx, 0.05 * s, -0.56 * s, 0.035 * s, '#ffe066');
  }
  // staff with glowing orb
  line(ctx, 0.26 * s, 0.24 * s, 0.3 * s, -0.22 * s, '#8a5a34', 0.04 * s);
  const pulse = 0.6 + 0.4 * Math.sin(t * 4) + (o.fire || 0) * 1.2;
  const orb = tier === 2 ? '#ffe066' : '#c49bff';
  const g = ctx.createRadialGradient(0.3 * s, -0.26 * s, 0, 0.3 * s, -0.26 * s, 0.16 * s * (0.8 + pulse * 0.3));
  g.addColorStop(0, tier === 2 ? 'rgba(255, 240, 150, 0.9)' : 'rgba(210, 180, 255, 0.9)');
  g.addColorStop(1, 'rgba(200, 160, 255, 0)');
  circle(ctx, 0.3 * s, -0.26 * s, 0.18 * s, g);
  circle(ctx, 0.3 * s, -0.26 * s, 0.05 * s, orb);
  circle(ctx, 0.285 * s, -0.275 * s, 0.018 * s, '#fff');
}

function lantern(ctx, s, tier, o) {
  shadow(ctx, s, 0.3);
  const t = o.t || 0;
  // lavender sprigs
  const sprigs = 3 + tier * 2;
  for (let i = 0; i < sprigs; i++) {
    const x = (-0.24 + (i / (sprigs - 1)) * 0.48) * s;
    const h = (0.24 + ((i * 7) % 3) * 0.04) * s;
    line(ctx, x, 0.25 * s, x + Math.sin(t * 1.3 + i) * 0.02 * s, 0.25 * s - h, '#6f9e4f', 0.025 * s);
    for (let k = 0; k < 4; k++) {
      ellipse(ctx, x + Math.sin(t * 1.3 + i) * 0.02 * s, 0.25 * s - h + k * 0.04 * s, 0.028 * s, 0.022 * s, k % 2 ? '#a17fe0' : '#8c63d9');
    }
  }
  // post
  rrect(ctx, -0.035 * s, -0.36 * s, 0.07 * s, 0.62 * s, 0.02 * s);
  ctx.fillStyle = '#8a5a34';
  ctx.fill();
  line(ctx, 0, -0.36 * s, 0.14 * s, -0.36 * s, '#8a5a34', 0.04 * s);
  // lantern
  const lx = 0.14 * s, ly = -0.24 * s;
  const glow = 0.75 + 0.25 * Math.sin(t * 2.2);
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, (0.35 + tier * 0.08) * s);
  g.addColorStop(0, `rgba(255, 214, 120, ${0.6 * glow})`);
  g.addColorStop(1, 'rgba(200, 160, 255, 0)');
  circle(ctx, lx, ly, (0.35 + tier * 0.08) * s, g);
  line(ctx, lx, -0.36 * s, lx, ly - 0.08 * s, '#5a3b22', 0.015 * s);
  rrect(ctx, lx - 0.07 * s, ly - 0.08 * s, 0.14 * s, 0.17 * s, 0.03 * s);
  ctx.fillStyle = `rgba(255, 226, 150, ${0.85 * glow + 0.15})`;
  ctx.fill();
  ctx.strokeStyle = '#5a3b22';
  ctx.lineWidth = 0.02 * s;
  ctx.stroke();
  circle(ctx, lx, ly + 0.01 * s, 0.03 * s, '#fff6d8');
  ellipse(ctx, lx, ly - 0.09 * s, 0.09 * s, 0.025 * s, '#5a3b22');
  if (tier >= 1) {
    ctx.fillStyle = '#b388eb';
    ctx.beginPath();
    ctx.moveTo(-0.035 * s, -0.2 * s);
    ctx.lineTo(-0.13 * s, -0.12 * s);
    ctx.lineTo(-0.1 * s, -0.22 * s);
    ctx.fill();
  }
  if (tier === 2) {
    ctx.beginPath();
    ctx.arc(0, -0.45 * s, 0.08 * s, 0.3 * Math.PI, 1.7 * Math.PI);
    ctx.arc(0.04 * s, -0.46 * s, 0.065 * s, 1.6 * Math.PI, 0.4 * Math.PI, true);
    ctx.closePath();
    ctx.fillStyle = '#ffe9a3';
    ctx.fill();
  }
}

// ------------------------------------------------------------ bugs

const BUTTERFLY_COLORS = [['#ff9f1c', '#ffcf69'], ['#58c4dd', '#b8f2ff'], ['#f78fb3', '#ffd1e3'], ['#b388eb', '#e4d4ff']];

// o: { angle (screen radians), t, phase, id }
// Top-down bugs are drawn facing +x and rotated; snails and the raccoon
// are drawn from the side and flipped.
export function drawBug(ctx, s, type, o) {
  const t = o.t || 0, ph = (o.phase || 0) * TAU;
  const side = type === 'snail' || type === 'greatsnail' || type === 'raccoon';
  ctx.save();
  if (side) {
    if (Math.cos(o.angle || 0) < -0.01) ctx.scale(-1, 1);
  } else ctx.rotate(o.angle || 0);
  switch (type) {
    case 'ant': ant(ctx, s, t, ph); break;
    case 'ladybug': ladybug(ctx, s, t, ph); break;
    case 'beetle': beetle(ctx, s, t, ph, 1, false); break;
    case 'baron': beetle(ctx, s * 1.9, t, ph, 1, true); break;
    case 'snail': snail(ctx, s, t, ph, false); break;
    case 'greatsnail': snail(ctx, s * 1.8, t, ph, true); break;
    case 'butterfly': butterfly(ctx, s, t, ph, o.id || 0); break;
    case 'wasp': wasp(ctx, s, t, ph, false); break;
    case 'queen': wasp(ctx, s * 1.9, t, ph, true); break;
    case 'caterpillar': caterpillar(ctx, s, t, ph, 5, false); break;
    case 'wiggler': caterpillar(ctx, s * 0.75, t, ph, 3, false); break;
    case 'bigcat': caterpillar(ctx, s * 1.5, t, ph, 7, true); break;
    case 'raccoon': raccoon(ctx, s, t, ph); break;
    default: circle(ctx, 0, 0, 0.2 * s, '#333');
  }
  ctx.restore();
}

function legs(ctx, s, t, ph, xs, len, color, speed = 18) {
  for (let i = 0; i < xs.length; i++) {
    const swing = Math.sin(t * speed + ph + i * 2.1) * 0.05 * s;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(xs[i] * s, 0);
      ctx.quadraticCurveTo(xs[i] * s + swing * side, side * len * 0.6 * s, xs[i] * s + swing * side * 1.6 - 0.02 * s, side * len * s);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, 0.022 * s);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
}

function antennae(ctx, s, x, len, color, t, ph) {
  const wob = Math.sin(t * 6 + ph) * 0.02 * s;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, side * 0.02 * s);
    ctx.quadraticCurveTo(x + len * 0.6 * s, side * len * 0.2 * s + wob, x + len * s, side * len * 0.55 * s + wob);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, 0.02 * s);
    ctx.stroke();
    circle(ctx, x + len * s, side * len * 0.55 * s + wob, 0.022 * s, color);
  }
}

function bugEyes(ctx, s, x, r) {
  for (const side of [-1, 1]) {
    circle(ctx, x, side * r * 1.1, r, '#fff');
    circle(ctx, x + r * 0.35, side * r * 1.1, r * 0.55, '#1d140e');
  }
}

function ant(ctx, s, t, ph) {
  legs(ctx, s, t, ph, [-0.02, 0.02, 0.06], 0.14, '#4a2618');
  circle(ctx, -0.13 * s, 0, 0.1 * s, '#7a3f2a');
  circle(ctx, -0.15 * s, -0.035 * s, 0.035 * s, 'rgba(255,255,255,0.25)');
  circle(ctx, 0.01 * s, 0, 0.06 * s, '#8a4a31');
  circle(ctx, 0.12 * s, 0, 0.075 * s, '#8f4f34');
  antennae(ctx, s, 0.17 * s, 0.12, '#4a2618', t, ph);
  bugEyes(ctx, s, 0.15 * s, 0.022 * s);
}

function ladybug(ctx, s, t, ph) {
  legs(ctx, s, t, ph, [-0.04, 0.02, 0.07], 0.12, '#222', 26);
  circle(ctx, 0.11 * s, 0, 0.07 * s, '#1f1f24');
  circle(ctx, 0, 0, 0.13 * s, '#e5383b');
  line(ctx, -0.13 * s, 0, 0.1 * s, 0, '#1f1f24', 0.015 * s);
  for (const [x, y] of [[-0.06, -0.06], [-0.06, 0.06], [0.03, -0.07], [0.03, 0.07], [-0.1, 0]]) circle(ctx, x * s, y * s, 0.025 * s, '#1f1f24');
  ellipse(ctx, -0.03 * s, -0.06 * s, 0.04 * s, 0.02 * s, 'rgba(255,255,255,0.45)', 0.4);
  bugEyes(ctx, s, 0.15 * s, 0.02 * s);
}

function beetle(ctx, s, t, ph, _k, baron) {
  legs(ctx, s, t, ph, [-0.06, 0.0, 0.06], 0.17, '#1c1c2b', 14);
  if (baron) {
    // big stag mandibles
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0.14 * s, side * 0.04 * s);
      ctx.quadraticCurveTo(0.3 * s, side * 0.12 * s, 0.3 * s, side * 0.01 * s);
      ctx.quadraticCurveTo(0.24 * s, side * 0.06 * s, 0.16 * s, side * 0.01 * s);
      ctx.fillStyle = '#3a2d5c';
      ctx.fill();
    }
  }
  circle(ctx, 0.14 * s, 0, 0.06 * s, '#1c1c2b');
  const g = ctx.createLinearGradient(-0.17 * s, -0.13 * s, 0.1 * s, 0.13 * s);
  g.addColorStop(0, baron ? '#9f86c0' : '#2a9d8f');
  g.addColorStop(1, baron ? '#5e548e' : '#355c9b');
  ellipse(ctx, -0.03 * s, 0, 0.17 * s, 0.13 * s, g);
  if (baron) {
    ctx.beginPath();
    ctx.ellipse(-0.03 * s, 0, 0.17 * s, 0.13 * s, 0, 0, TAU);
    ctx.strokeStyle = '#ffcf3f';
    ctx.lineWidth = 0.012 * s;
    ctx.stroke();
  }
  line(ctx, -0.19 * s, 0, 0.13 * s, 0, 'rgba(0,0,0,0.35)', 0.012 * s);
  ellipse(ctx, -0.06 * s, -0.06 * s, 0.07 * s, 0.025 * s, 'rgba(255,255,255,0.4)', 0.2);
  bugEyes(ctx, s, 0.17 * s, 0.018 * s);
  if (baron) crownTop(ctx, s, 0.06 * s, 0);
}

function crownTop(ctx, s, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 2);
  crown(ctx, s, 0, 0.03 * s, 0.09 * s);
  ctx.restore();
}

function snail(ctx, s, t, ph, great) {
  const stretch = 1 + Math.sin(t * 3 + ph) * 0.04;
  // body
  ctx.beginPath();
  ctx.moveTo(-0.24 * s * stretch, 0.1 * s);
  ctx.quadraticCurveTo(0, 0.14 * s, 0.2 * s * stretch, 0.1 * s);
  ctx.quadraticCurveTo(0.26 * s * stretch, 0.0, 0.18 * s * stretch, -0.04 * s);
  ctx.quadraticCurveTo(0.05 * s, 0.02 * s, -0.24 * s * stretch, 0.1 * s);
  ctx.fillStyle = great ? '#b6c7a0' : '#c6d3b2';
  ctx.fill();
  // eye stalks
  for (const dx of [0.14, 0.2]) {
    line(ctx, dx * s * stretch, -0.02 * s, (dx + 0.03) * s * stretch, -0.16 * s, '#a9ba94', 0.025 * s);
    circle(ctx, (dx + 0.03) * s * stretch, -0.17 * s, 0.03 * s, '#fff');
    circle(ctx, (dx + 0.04) * s * stretch, -0.17 * s, 0.016 * s, '#1d140e');
  }
  // shell
  const R = 0.15 * s;
  const cx = -0.04 * s, cy = -0.04 * s;
  const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  g.addColorStop(0, great ? '#e7a3c4' : '#f0a868');
  g.addColorStop(1, great ? '#a2587e' : '#b8612f');
  circle(ctx, cx, cy, R, g);
  ctx.beginPath();
  for (let a = 0; a < TAU * 2.2; a += 0.2) {
    const r = R * (0.85 - a / (TAU * 2.6));
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.strokeStyle = great ? '#7d3f5f' : '#8c4520';
  ctx.lineWidth = 0.02 * s;
  ctx.stroke();
  if (great) {
    // a tiny top hat for Sir Slimesalot
    ctx.fillStyle = '#2d2433';
    ctx.fillRect(0.12 * s, -0.3 * s, 0.1 * s, 0.1 * s);
    ctx.fillRect(0.09 * s, -0.21 * s, 0.16 * s, 0.025 * s);
    ctx.fillStyle = '#e63946';
    ctx.fillRect(0.12 * s, -0.235 * s, 0.1 * s, 0.02 * s);
  }
}

function butterfly(ctx, s, t, ph, id) {
  const [c1, c2] = BUTTERFLY_COLORS[id % BUTTERFLY_COLORS.length];
  const flap = 0.3 + 0.7 * Math.abs(Math.sin(t * 9 + ph));
  for (const side of [-1, 1]) {
    ellipse(ctx, 0.03 * s, side * 0.13 * s * flap, 0.12 * s, 0.13 * s * flap, c1, side * 0.3);
    ellipse(ctx, -0.09 * s, side * 0.1 * s * flap, 0.08 * s, 0.09 * s * flap, c2, -side * 0.3);
    circle(ctx, 0.05 * s, side * 0.15 * s * flap, 0.03 * s * Math.max(0.3, flap), '#fff');
  }
  ellipse(ctx, 0, 0, 0.13 * s, 0.03 * s, '#3b2a2a');
  antennae(ctx, s, 0.12 * s, 0.1, '#3b2a2a', t, ph);
  bugEyes(ctx, s, 0.12 * s, 0.016 * s);
}

function wasp(ctx, s, t, ph, queen) {
  const flap = Math.abs(Math.sin(t * 30 + ph));
  for (const side of [-1, 1]) ellipse(ctx, -0.02 * s, side * (0.09 + flap * 0.05) * s, 0.1 * s, 0.05 * s, 'rgba(235, 248, 255, 0.75)', side * 0.4);
  // striped abdomen
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(-0.1 * s, 0, 0.12 * s, 0.075 * s, 0, 0, TAU);
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#2b2118';
  for (let i = 0; i < 3; i++) ctx.fillRect((-0.18 + i * 0.07) * s, -0.1 * s, 0.03 * s, 0.2 * s);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-0.22 * s, -0.012 * s);
  ctx.lineTo(-0.27 * s, 0);
  ctx.lineTo(-0.22 * s, 0.012 * s);
  ctx.fillStyle = '#2b2118';
  ctx.fill();
  circle(ctx, 0.04 * s, 0, 0.05 * s, '#3a2c1c');
  circle(ctx, 0.11 * s, 0, 0.055 * s, '#ffcf3f');
  antennae(ctx, s, 0.15 * s, 0.08, '#2b2118', t, ph);
  bugEyes(ctx, s, 0.13 * s, 0.018 * s);
  if (queen) crownTop(ctx, s, 0.08 * s, 0);
}

function caterpillar(ctx, s, t, ph, n, king) {
  const seg = 0.075 * s;
  for (let i = n - 1; i >= 0; i--) {
    const x = (0.12 - i * 0.075) * s;
    const y = Math.sin(t * 7 + ph - i * 0.9) * 0.025 * s;
    const colors = king ? ['#a06cd5', '#7fc84a'] : ['#8bd346', '#6fbf3b'];
    circle(ctx, x, y + seg * 0.9, seg * 0.35, 'rgba(0,0,0,0.25)');
    circle(ctx, x, y, seg * (i === 0 ? 1.15 : 1), colors[i % 2]);
    circle(ctx, x - seg * 0.3, y - seg * 0.35, seg * 0.3, 'rgba(255,255,255,0.3)');
    if (i === 0) {
      antennae(ctx, s, x + seg * 0.6, 0.07, '#3d5a1e', t, ph);
      bugEyes(ctx, s, x + seg * 0.45, seg * 0.3);
      if (king) crownTop(ctx, s, x, y);
    }
  }
}

function raccoon(ctx, s, t, ph) {
  const S = s * 1.9;
  const bob = Math.abs(Math.sin(t * 5 + ph)) * 0.02 * S;
  // striped tail
  ctx.save();
  ctx.translate(-0.2 * S, -0.02 * S - bob);
  ctx.rotate(-0.5 + Math.sin(t * 3) * 0.15);
  ellipse(ctx, -0.12 * S, 0, 0.16 * S, 0.06 * S, '#7d8597');
  for (let i = 0; i < 3; i++) ctx.fillRect((-0.22 + i * 0.08) * S, -0.06 * S, 0.035 * S, 0.12 * S);
  ctx.restore();
  // feet
  for (const dx of [-0.1, 0.1]) ellipse(ctx, dx * S + Math.sin(t * 10 + dx * 20) * 0.02 * S, 0.14 * S, 0.05 * S, 0.03 * S, '#4a4e5a');
  // body
  ellipse(ctx, 0, -bob, 0.22 * S, 0.17 * S, '#8d99ae');
  ellipse(ctx, 0.04 * S, 0.03 * S - bob, 0.13 * S, 0.11 * S, '#c9d1dc');
  // head
  const hx = 0.17 * S, hy = -0.14 * S - bob;
  for (const dx of [-0.08, 0.07]) {
    ctx.beginPath();
    ctx.moveTo(hx + (dx - 0.04) * S, hy - 0.06 * S);
    ctx.lineTo(hx + dx * S, hy - 0.16 * S);
    ctx.lineTo(hx + (dx + 0.04) * S, hy - 0.06 * S);
    ctx.fillStyle = '#6c757d';
    ctx.fill();
  }
  circle(ctx, hx, hy, 0.12 * S, '#9aa5b5');
  ellipse(ctx, hx + 0.02 * S, hy + 0.04 * S, 0.09 * S, 0.06 * S, '#eef1f5');
  ellipse(ctx, hx, hy - 0.015 * S, 0.12 * S, 0.04 * S, '#2d2f36');
  for (const dx of [-0.045, 0.05]) {
    circle(ctx, hx + dx * S, hy - 0.015 * S, 0.028 * S, '#fff');
    circle(ctx, hx + dx * S + 0.01 * S, hy - 0.015 * S, 0.015 * S, '#111');
  }
  circle(ctx, hx + 0.1 * S, hy + 0.035 * S, 0.022 * S, '#2d2f36');
  ellipse(ctx, hx + 0.06 * S, hy + 0.08 * S, 0.02 * S, 0.012 * S, '#ff7b9c');
}

// ------------------------------------------------------------ props

export function drawTree(ctx, s, variant = 0, t = 0) {
  shadow(ctx, s, 0.42, 0.15, 0.3, 0.25);
  rrect(ctx, -0.06 * s, -0.05 * s, 0.12 * s, 0.33 * s, 0.03 * s);
  ctx.fillStyle = '#8a5a34';
  ctx.fill();
  const sway = Math.sin(t * 0.8 + variant) * 0.01 * s;
  const greens = variant === 2 ? ['#4f9a3e', '#5eae48', '#78c45a'] : ['#3f8f3a', '#52a444', '#6fbf52'];
  circle(ctx, -0.18 * s + sway, -0.22 * s, 0.24 * s, greens[0]);
  circle(ctx, 0.18 * s + sway, -0.24 * s, 0.24 * s, greens[0]);
  circle(ctx, sway, -0.42 * s, 0.3 * s, greens[1]);
  circle(ctx, -0.08 * s + sway, -0.5 * s, 0.14 * s, greens[2]);
  if (variant === 2) for (const [x, y] of [[-0.18, -0.3], [0.12, -0.45], [0.2, -0.2], [-0.05, -0.28]]) circle(ctx, x * s + sway, y * s, 0.045 * s, '#e63946');
}

export function drawPumpkin(ctx, s) {
  shadow(ctx, s, 0.36, 0.12, 0.26);
  for (const [x, r] of [[-0.14, 0.17], [0.14, 0.17], [0, 0.2]]) ellipse(ctx, x * s, 0.06 * s, r * s, 0.19 * s, x === 0 ? '#ff9a3c' : '#f07f2a');
  ellipse(ctx, -0.05 * s, -0.02 * s, 0.04 * s, 0.1 * s, 'rgba(255,255,255,0.2)');
  line(ctx, 0, -0.1 * s, 0.03 * s, -0.2 * s, '#5b7a2e', 0.05 * s);
  leaf(ctx, s, 0.02 * s, -0.14 * s, 0.16, -0.3, '#6ea843');
}

export function drawGnome(ctx, s) {
  shadow(ctx, s, 0.22, 0.08, 0.28);
  ellipse(ctx, 0, 0.12 * s, 0.14 * s, 0.16 * s, '#3a7bd5');
  ellipse(ctx, 0, 0.04 * s, 0.1 * s, 0.1 * s, '#f6d5b8');
  ctx.beginPath();
  ctx.moveTo(-0.11 * s, 0.08 * s);
  ctx.quadraticCurveTo(0, 0.3 * s, 0.11 * s, 0.08 * s);
  ctx.fillStyle = '#fff';
  ctx.fill();
  circle(ctx, 0, 0.07 * s, 0.03 * s, '#f28b82');
  ctx.beginPath();
  ctx.moveTo(-0.12 * s, -0.02 * s);
  ctx.quadraticCurveTo(0.02 * s, -0.2 * s, 0.05 * s, -0.36 * s);
  ctx.lineTo(0.12 * s, -0.02 * s);
  ctx.closePath();
  ctx.fillStyle = '#e63946';
  ctx.fill();
  for (const dx of [-0.04, 0.04]) circle(ctx, dx * s, 0.02 * s, 0.014 * s, '#2b1d14');
}

export function drawRock(ctx, s, mossy = true) {
  shadow(ctx, s, 0.3, 0.1, 0.22);
  ctx.beginPath();
  ctx.moveTo(-0.26 * s, 0.18 * s);
  ctx.quadraticCurveTo(-0.28 * s, -0.08 * s, -0.05 * s, -0.12 * s);
  ctx.quadraticCurveTo(0.24 * s, -0.12 * s, 0.26 * s, 0.18 * s);
  ctx.closePath();
  ctx.fillStyle = '#a3a7ad';
  ctx.fill();
  ellipse(ctx, -0.08 * s, -0.02 * s, 0.1 * s, 0.05 * s, 'rgba(255,255,255,0.3)');
  if (mossy) ellipse(ctx, 0.08 * s, -0.08 * s, 0.12 * s, 0.04 * s, '#7fb24a');
}

export function drawWateringCan(ctx, s) {
  shadow(ctx, s, 0.28, 0.1, 0.24);
  rrect(ctx, -0.16 * s, -0.08 * s, 0.26 * s, 0.28 * s, 0.05 * s);
  ctx.fillStyle = '#57a773';
  ctx.fill();
  line(ctx, 0.08 * s, 0.08 * s, 0.28 * s, -0.1 * s, '#57a773', 0.05 * s);
  ellipse(ctx, 0.29 * s, -0.11 * s, 0.05 * s, 0.03 * s, '#3f8a5a', -0.6);
  ctx.beginPath();
  ctx.arc(-0.03 * s, -0.08 * s, 0.1 * s, Math.PI, 0);
  ctx.strokeStyle = '#3f8a5a';
  ctx.lineWidth = 0.035 * s;
  ctx.stroke();
}

export function drawFlowerBed(ctx, s, area, seed = 0) {
  ellipse(ctx, 0, 0.08 * s, 0.4 * s, 0.26 * s, area === 'pond' ? '#6b8f4e' : '#8a5a3b');
  ellipse(ctx, 0, 0.05 * s, 0.36 * s, 0.22 * s, area === 'pond' ? '#7ea85a' : '#9c6a45');
  const colors = area === 'veggie' ? ['#ff8c42'] : area === 'pond' ? ['#8b5e3c'] : ['#ff5d8f', '#ffd23f', '#fff', '#b388eb'];
  const pts = [[-0.2, 0.02], [0, -0.04], [0.2, 0.02], [-0.1, 0.14], [0.1, 0.14]];
  pts.forEach(([x, y], i) => {
    if (area === 'veggie') {
      // carrot tops
      ellipse(ctx, x * s, y * s + 0.03 * s, 0.035 * s, 0.03 * s, '#ff8c42');
      for (const a of [-0.5, 0, 0.5]) leaf(ctx, s, x * s, y * s, 0.12, -Math.PI / 2 + a, '#5fae3e');
    } else if (area === 'pond') {
      // cattails
      line(ctx, x * s, y * s + 0.05 * s, x * s, y * s - 0.22 * s, '#6f9e4f', 0.02 * s);
      ellipse(ctx, x * s, y * s - 0.16 * s, 0.025 * s, 0.06 * s, '#8b5e3c');
    } else {
      line(ctx, x * s, y * s + 0.05 * s, x * s, y * s - 0.1 * s, '#4e9a3a', 0.02 * s);
      const c = colors[(i + seed) % colors.length];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        circle(ctx, x * s + Math.cos(a) * 0.035 * s, y * s - 0.12 * s + Math.sin(a) * 0.035 * s, 0.028 * s, c);
      }
      circle(ctx, x * s, y * s - 0.12 * s, 0.02 * s, '#ffcf3f');
    }
  });
}

export function drawCoinIcon(ctx, x, y, r) {
  circle(ctx, x, y, r, '#f2a900');
  circle(ctx, x, y, r * 0.8, '#ffcf3f');
  star(ctx, x, y, r * 0.5, '#f7b500');
}

export function drawBasket(ctx, s, fill = 1) {
  ellipse(ctx, 0, 0.12 * s, 0.2 * s, 0.06 * s, 'rgba(60,40,20,0.25)');
  ctx.beginPath();
  ctx.arc(0, -0.02 * s, 0.13 * s, Math.PI, 0);
  ctx.strokeStyle = '#8a5a34';
  ctx.lineWidth = 0.03 * s;
  ctx.stroke();
  if (fill > 0) {
    circle(ctx, -0.07 * s, -0.02 * s, 0.05 * s, '#e63946');
    ellipse(ctx, 0.05 * s, -0.02 * s, 0.07 * s, 0.035 * s, '#f4d35e');
  }
  rrect(ctx, -0.17 * s, -0.02 * s, 0.34 * s, 0.14 * s, 0.04 * s);
  ctx.fillStyle = '#c98b4f';
  ctx.fill();
  ctx.strokeStyle = '#a06a3a';
  ctx.lineWidth = 0.015 * s;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 0.06 * s, -0.02 * s);
    ctx.lineTo(i * 0.06 * s, 0.12 * s);
    ctx.stroke();
  }
  ctx.fillStyle = '#e63946';
  ctx.fillRect(-0.17 * s, 0.03 * s, 0.34 * s, 0.025 * s);
}

// Little snacks laid out on the picnic blanket, one per basket left.
export function drawSnack(ctx, s, kind) {
  switch (kind % 4) {
    case 0: // apple
      circle(ctx, 0, 0, 0.07 * s, '#e63946');
      circle(ctx, -0.02 * s, -0.02 * s, 0.02 * s, 'rgba(255,255,255,0.5)');
      line(ctx, 0, -0.06 * s, 0.01 * s, -0.1 * s, '#6b4226', 0.015 * s);
      break;
    case 1: // cupcake
      ctx.beginPath();
      ctx.moveTo(-0.06 * s, 0);
      ctx.lineTo(0.06 * s, 0);
      ctx.lineTo(0.045 * s, 0.07 * s);
      ctx.lineTo(-0.045 * s, 0.07 * s);
      ctx.fillStyle = '#f4a259';
      ctx.fill();
      circle(ctx, 0, -0.01 * s, 0.065 * s, '#ffb3c6');
      circle(ctx, 0, -0.07 * s, 0.02 * s, '#e63946');
      break;
    case 2: // sandwich
      ctx.beginPath();
      ctx.moveTo(-0.08 * s, 0.05 * s);
      ctx.lineTo(0.08 * s, 0.05 * s);
      ctx.lineTo(0, -0.07 * s);
      ctx.closePath();
      ctx.fillStyle = '#f6e3b4';
      ctx.fill();
      ctx.fillStyle = '#7fb24a';
      ctx.fillRect(-0.07 * s, 0.03 * s, 0.14 * s, 0.02 * s);
      break;
    default: // cookie
      circle(ctx, 0, 0, 0.065 * s, '#d4a373');
      for (const [x, y] of [[-0.02, -0.02], [0.025, 0.01], [-0.01, 0.03]]) circle(ctx, x * s, y * s, 0.012 * s, '#5b3517');
  }
}
