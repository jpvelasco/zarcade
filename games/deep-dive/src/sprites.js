// Procedural art: creatures, Bubbles the sub, pickups and docks. Everything
// is drawn once into offscreen canvases; the frame loop only blits them.

const TAU = Math.PI * 2;
export const SPRITE_SCALE = 2;

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export { shade };

function eye(ctx, x, y, r, look = 0.25) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#16121f';
  ctx.beginPath(); ctx.arc(x + r * look, y, r * 0.58, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x + r * look + r * 0.2, y - r * 0.25, r * 0.22, 0, TAU); ctx.fill();
}

function blob(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, TAU); ctx.fill();
}

function bodyGradient(ctx, sp, L, H) {
  const g = ctx.createLinearGradient(0, -H, 0, H);
  g.addColorStop(0, shade(sp.c1, 0.25));
  g.addColorStop(0.55, sp.c1);
  g.addColorStop(1, shade(sp.c1, -0.25));
  return g;
}

function patternOn(ctx, sp, L, H, clip) {
  ctx.save();
  clip();
  ctx.clip();
  const p = sp.pattern;
  ctx.fillStyle = sp.c2;
  ctx.strokeStyle = sp.c2;
  if (p === 'bands') {
    for (const f of [-0.25, 0.1, 0.38]) {
      ctx.lineWidth = L * 0.09;
      ctx.beginPath(); ctx.moveTo(f * L, -H); ctx.quadraticCurveTo(f * L + L * 0.05, 0, f * L, H); ctx.stroke();
    }
    ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 1.2;
  } else if (p === 'stripes' || p === 'bars') {
    ctx.globalAlpha = p === 'bars' ? 0.5 : 0.85;
    for (let i = -3; i <= 3; i++) { ctx.fillRect(i * L * 0.13 - L * 0.025, -H, L * 0.05, H * 2); }
  } else if (p === 'spots' || p === 'dots') {
    const n = p === 'dots' ? 7 : 10;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4, r = (i / n) * 0.8;
      blob(ctx, Math.cos(a) * L * 0.35 * r + L * 0.02, Math.sin(a) * H * 0.7 * r, L * 0.035, L * 0.035, sp.c2);
    }
  } else if (p === 'saddle') {
    ctx.fillRect(-L * 0.12, -H, L * 0.28, H * 2);
    ctx.fillStyle = sp.c2; ctx.fillRect(L * 0.25, -H, L * 0.4, H * 2);
  } else if (p === 'scales') {
    ctx.globalAlpha = 0.35;
    for (let x = -L * 0.4; x < L * 0.4; x += L * 0.09) for (let y = -H; y < H; y += L * 0.09) { ctx.beginPath(); ctx.arc(x + ((y / (L * 0.09)) & 1) * L * 0.045, y, L * 0.045, 0, Math.PI); ctx.stroke(); }
  } else if (p === 'swirl') {
    ctx.lineWidth = L * 0.04;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-L * 0.2 + i * L * 0.14, (i % 2 ? 1 : -1) * H * 0.2, H * 0.4, 0, Math.PI * 1.3); ctx.stroke(); }
  } else if (p === 'leafy') {
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 6; i++) blob(ctx, -L * 0.3 + i * L * 0.12, (i % 2 ? -1 : 1) * H * 0.6, L * 0.06, H * 0.35, sp.c2, i);
  }
  ctx.restore();
}

// Fish facing right, centered on the origin. frame 0/1 swings the tail.
function fishShape(ctx, sp, L, frame, { tall = 0.36, nose = 0.5, tail = 0.3, fins = true } = {}) {
  const H = L * tall;
  const tw = frame ? 0.18 : -0.18;
  // tail
  ctx.fillStyle = shade(sp.c1, -0.1);
  ctx.beginPath();
  ctx.moveTo(-L * 0.36, 0);
  ctx.lineTo(-L * (0.36 + tail), -H * 0.85 + tw * H);
  ctx.quadraticCurveTo(-L * (0.3 + tail * 0.6), tw * H, -L * (0.36 + tail), H * 0.85 + tw * H);
  ctx.closePath();
  ctx.fill();
  // dorsal + belly fins
  if (fins) {
    ctx.fillStyle = shade(sp.c1, -0.15);
    ctx.beginPath(); ctx.moveTo(-L * 0.2, -H * 0.8); ctx.quadraticCurveTo(-L * 0.02, -H * 1.45, L * 0.14, -H * 0.85); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L * 0.12, H * 0.8); ctx.quadraticCurveTo(0, H * 1.25, L * 0.08, H * 0.82); ctx.closePath(); ctx.fill();
  }
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(L * nose, 0);
    ctx.bezierCurveTo(L * nose * 0.7, -H * 1.1, -L * 0.3, -H * 1.05, -L * 0.4, 0);
    ctx.bezierCurveTo(-L * 0.3, H * 1.05, L * nose * 0.7, H * 1.1, L * nose, 0);
    ctx.closePath();
  };
  outline();
  ctx.fillStyle = bodyGradient(ctx, sp, L, H);
  ctx.fill();
  if (sp.pattern !== 'plain') patternOn(ctx, sp, L, H, outline);
  // belly sheen
  ctx.globalAlpha = 0.25;
  blob(ctx, L * 0.05, H * 0.45, L * 0.25, H * 0.3, '#ffffff');
  ctx.globalAlpha = 1;
  // pectoral fin
  blob(ctx, L * 0.05, H * 0.2, L * 0.09, H * 0.22, shade(sp.c1, -0.2), frame ? 0.6 : 0.2);
  eye(ctx, L * nose * 0.55, -H * 0.18, Math.max(2.2, L * 0.075));
  // smile
  ctx.strokeStyle = shade(sp.c1, -0.5); ctx.lineWidth = Math.max(1, L * 0.02); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(L * nose * 0.82, H * 0.12, L * 0.05, 0.2, 1.4); ctx.stroke();
  return H;
}

const DRAW = {
  fish(ctx, sp, L, f) { fishShape(ctx, sp, L, f); },
  tallfish(ctx, sp, L, f) { fishShape(ctx, sp, L, f, { tall: 0.55, nose: 0.42, tail: 0.24 }); },
  longfish(ctx, sp, L, f) { fishShape(ctx, sp, L, f, { tall: 0.16, nose: 0.55, tail: 0.18 }); },
  hatchet(ctx, sp, L, f) {
    const H = fishShape(ctx, sp, L, f, { tall: 0.6, nose: 0.4, tail: 0.2, fins: false });
    ctx.fillStyle = sp.c2;
    for (let i = 0; i < 5; i++) blob(ctx, -L * 0.2 + i * L * 0.1, H * 0.75, 2, 2, sp.c2);
  },
  idol(ctx, sp, L, f) {
    const H = fishShape(ctx, sp, L, f, { tall: 0.6, nose: 0.45, tail: 0.22, fins: false });
    ctx.strokeStyle = '#f5f0e0'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L * 0.0, -H * 0.9); ctx.quadraticCurveTo(-L * 0.2, -H * 2.0, -L * 0.6, -H * 1.6); ctx.stroke();
    blob(ctx, L * 0.38, H * 0.1, L * 0.06, H * 0.12, '#ffd23f');
  },
  lionfish(ctx, sp, L, f) {
    ctx.strokeStyle = sp.c2; ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const a = -2.6 + i * 0.32 + (f ? 0.05 : 0);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * L * 0.62, Math.sin(a) * L * 0.62); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(201,68,47,0.35)';
    ctx.beginPath(); ctx.moveTo(0, 0); for (let i = 0; i < 9; i++) { const a = -2.6 + i * 0.32; ctx.lineTo(Math.cos(a) * L * 0.6, Math.sin(a) * L * 0.6); } ctx.fill();
    fishShape(ctx, sp, L * 0.85, f, { tall: 0.42, nose: 0.48 });
  },
  sword(ctx, sp, L, f) {
    ctx.strokeStyle = shade(sp.c1, -0.2); ctx.lineWidth = L * 0.03; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L * 0.3, -L * 0.02); ctx.lineTo(L * 0.62, -L * 0.03); ctx.stroke();
    fishShape(ctx, sp, L * 0.8, f, { tall: 0.22, nose: 0.5, tail: 0.25 });
  },
  shark(ctx, sp, L, f) {
    const H = L * 0.2;
    const tw = f ? 0.15 : -0.15;
    ctx.fillStyle = shade(sp.c1, -0.1);
    ctx.beginPath(); ctx.moveTo(-L * 0.35, 0); ctx.lineTo(-L * 0.55, -H * 1.6 + tw * H); ctx.lineTo(-L * 0.47, tw * H); ctx.lineTo(-L * 0.52, H * 1.0 + tw * H); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L * 0.05, -H * 0.9); ctx.lineTo(-L * 0.12, -H * 2.0); ctx.lineTo(L * 0.1, -H * 0.85); ctx.closePath(); ctx.fill();
    if (sp.id === 'reef-shark') { ctx.fillStyle = '#20242a'; ctx.beginPath(); ctx.moveTo(-L * 0.12, -H * 2.0); ctx.lineTo(-L * 0.095, -H * 1.6); ctx.lineTo(-L * 0.06, -H * 1.75); ctx.fill(); }
    const outline = () => { ctx.beginPath(); ctx.moveTo(L * 0.5, H * 0.1); ctx.bezierCurveTo(L * 0.35, -H * 1.2, -L * 0.25, -H * 1.0, -L * 0.4, 0); ctx.bezierCurveTo(-L * 0.25, H * 0.9, L * 0.35, H * 1.1, L * 0.5, H * 0.1); ctx.closePath(); };
    outline(); ctx.fillStyle = bodyGradient(ctx, sp, L, H); ctx.fill();
    ctx.save(); outline(); ctx.clip(); blob(ctx, L * 0.05, H * 0.9, L * 0.45, H * 0.6, sp.c2); ctx.restore();
    blob(ctx, L * 0.0, H * 0.6, L * 0.12, H * 0.25, shade(sp.c1, -0.2), 0.5);
    eye(ctx, L * 0.32, -H * 0.15, Math.max(2.5, L * 0.035));
    ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(L * 0.38, H * 0.25, L * 0.05, 0.3, 1.6); ctx.stroke();
  },
  chimaera(ctx, sp, L, f) {
    ctx.strokeStyle = shade(sp.c1, -0.15); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-L * 0.3, 0); ctx.quadraticCurveTo(-L * 0.5, f ? -6 : 6, -L * 0.7, 0); ctx.stroke();
    DRAW.shark(ctx, sp, L * 0.75, f);
    eye(ctx, L * 0.22, -L * 0.04, L * 0.05);
  },
  whale(ctx, sp, L, f) {
    const H = L * 0.2;
    const tw = f ? 0.2 : -0.2;
    ctx.fillStyle = shade(sp.c1, -0.15);
    ctx.beginPath(); ctx.moveTo(-L * 0.38, 0); ctx.quadraticCurveTo(-L * 0.5, -H * 0.2 + tw * H, -L * 0.58, -H * 0.7 + tw * H); ctx.lineTo(-L * 0.5, tw * H); ctx.lineTo(-L * 0.58, H * 0.7 + tw * H); ctx.closePath(); ctx.fill();
    const outline = () => { ctx.beginPath(); ctx.moveTo(L * 0.5, -H * 0.2); ctx.lineTo(L * 0.5, H * 0.6); ctx.quadraticCurveTo(L * 0.1, H * 1.15, -L * 0.4, 0); ctx.quadraticCurveTo(-L * 0.1, -H * 1.1, L * 0.35, -H * 1.0); ctx.quadraticCurveTo(L * 0.5, -H * 0.9, L * 0.5, -H * 0.2); ctx.closePath(); };
    outline(); ctx.fillStyle = bodyGradient(ctx, sp, L, H); ctx.fill();
    ctx.save(); outline(); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-L * 0.3 + i * L * 0.1, -H); ctx.lineTo(-L * 0.32 + i * L * 0.1, H); ctx.stroke(); } ctx.restore();
    blob(ctx, L * 0.1, H * 0.7, L * 0.08, H * 0.2, shade(sp.c1, -0.25), 0.5);
    eye(ctx, L * 0.3, H * 0.15, L * 0.025);
    ctx.strokeStyle = shade(sp.c1, -0.45); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(L * 0.48, H * 0.5); ctx.lineTo(L * 0.2, H * 0.6); ctx.stroke();
  },
  dolphin(ctx, sp, L, f) {
    const H = L * 0.17;
    const tw = f ? 0.25 : -0.25;
    ctx.fillStyle = shade(sp.c1, -0.12);
    ctx.beginPath(); ctx.moveTo(-L * 0.38, 0); ctx.lineTo(-L * 0.52, -H * 0.9 + tw * H); ctx.quadraticCurveTo(-L * 0.45, tw * H, -L * 0.52, H * 0.9 + tw * H); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L * 0.05, -H * 0.9); ctx.quadraticCurveTo(-L * 0.05, -H * 1.9, -L * 0.18, -H * 1.9); ctx.quadraticCurveTo(-L * 0.12, -H * 1.2, -L * 0.18, -H * 0.85); ctx.fill();
    const outline = () => { ctx.beginPath(); ctx.moveTo(L * 0.52, H * 0.25); ctx.quadraticCurveTo(L * 0.42, H * 0.05, L * 0.32, -H * 0.4); ctx.bezierCurveTo(L * 0.2, -H * 1.2, -L * 0.2, -H * 1.0, -L * 0.4, 0); ctx.bezierCurveTo(-L * 0.2, H * 0.9, L * 0.25, H * 1.0, L * 0.52, H * 0.25); ctx.closePath(); };
    outline(); ctx.fillStyle = bodyGradient(ctx, sp, L, H); ctx.fill();
    ctx.save(); outline(); ctx.clip(); blob(ctx, L * 0.1, H * 0.9, L * 0.4, H * 0.55, sp.c2); ctx.restore();
    blob(ctx, L * 0.05, H * 0.55, L * 0.1, H * 0.3, shade(sp.c1, -0.2), 0.6);
    eye(ctx, L * 0.28, -H * 0.15, L * 0.04);
    ctx.strokeStyle = '#4a5a6a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(L * 0.42, H * 0.05, L * 0.06, 0.4, 1.5); ctx.stroke();
  },
  seal(ctx, sp, L, f) {
    const H = L * 0.22;
    blob(ctx, -L * 0.42, (f ? -1 : 1) * H * 0.3, L * 0.1, H * 0.35, shade(sp.c1, -0.15), f ? 0.5 : -0.5);
    const outline = () => { ctx.beginPath(); ctx.ellipse(0, 0, L * 0.42, H, 0, 0, TAU); };
    outline(); ctx.fillStyle = bodyGradient(ctx, sp, L, H); ctx.fill();
    if (sp.pattern === 'spots') patternOn(ctx, sp, L, H, outline);
    blob(ctx, L * 0.36, -H * 0.2, H * 0.75, H * 0.7, sp.c1);
    blob(ctx, L * 0.05, H * 0.75, L * 0.12, H * 0.3, shade(sp.c1, -0.2), 0.7);
    eye(ctx, L * 0.42, -H * 0.4, L * 0.05, 0.3);
    blob(ctx, L * 0.55, -H * 0.05, L * 0.04, L * 0.03, '#2b2522');
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    for (const a of [-0.2, 0, 0.2]) { ctx.beginPath(); ctx.moveTo(L * 0.52, H * 0.1); ctx.lineTo(L * 0.7, H * 0.1 + a * L * 0.2); ctx.stroke(); }
  },
  otter(ctx, sp, L, f) {
    // Floating on its back, paws together.
    const H = L * 0.2;
    blob(ctx, -L * 0.42, (f ? -1 : 1) * 2, L * 0.15, H * 0.3, shade(sp.c1, -0.2));
    blob(ctx, 0, 0, L * 0.4, H, sp.c1);
    blob(ctx, 0, -H * 0.3, L * 0.3, H * 0.55, sp.c2);
    blob(ctx, L * 0.36, -H * 0.4, H * 0.85, H * 0.8, sp.c2);
    blob(ctx, L * 0.25, -H * 1.0, H * 0.25, H * 0.25, sp.c1);
    eye(ctx, L * 0.42, -H * 0.6, L * 0.045, 0.3);
    blob(ctx, L * 0.55, -H * 0.35, L * 0.035, L * 0.028, '#2b2522');
    blob(ctx, L * 0.1, -H * 0.9, L * 0.06, L * 0.05, shade(sp.c1, -0.1));
    blob(ctx, L * 0.0, -H * 0.85, L * 0.08, L * 0.07, '#c9a777'); // a little shell to snack on
  },
  ray(ctx, sp, L, f) {
    const W = L * 0.5;
    const flap = f ? -0.12 : 0.12;
    ctx.strokeStyle = shade(sp.c1, -0.2); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-L * 0.2, 0); ctx.quadraticCurveTo(-L * 0.45, flap * L, -L * 0.7, 0); ctx.stroke();
    ctx.fillStyle = bodyGradient(ctx, sp, L, W * 0.4);
    ctx.beginPath(); ctx.moveTo(L * 0.4, 0); ctx.quadraticCurveTo(L * 0.1, -W * (0.9 + flap), -L * 0.05, -W * (0.95 + flap)); ctx.quadraticCurveTo(-L * 0.1, -W * 0.3, -L * 0.25, 0);
    ctx.quadraticCurveTo(-L * 0.1, W * 0.3, -L * 0.05, W * (0.5 - flap)); ctx.quadraticCurveTo(L * 0.1, W * 0.4, L * 0.4, 0); ctx.closePath(); ctx.fill();
    if (sp.id === 'manta') { ctx.fillStyle = sp.c1; blob(ctx, L * 0.42, -W * 0.1, L * 0.06, W * 0.08, sp.c1, 0.4); blob(ctx, L * 0.42, W * 0.1, L * 0.06, W * 0.08, sp.c1, -0.4); blob(ctx, 0, W * 0.1, L * 0.15, W * 0.15, sp.c2); }
    eye(ctx, L * 0.25, -W * 0.15, L * 0.04);
  },
  turtle(ctx, sp, L, f) {
    const H = L * 0.25;
    const sw = f ? 0.35 : -0.35;
    blob(ctx, L * 0.15, -H * 0.9, L * 0.2, H * 0.3, shade(sp.c1, -0.1), -0.6 + sw);
    blob(ctx, L * 0.15, H * 0.9, L * 0.2, H * 0.3, shade(sp.c1, -0.1), 0.6 - sw);
    blob(ctx, -L * 0.3, -H * 0.6, L * 0.1, H * 0.2, shade(sp.c1, -0.1), 0.6);
    blob(ctx, -L * 0.3, H * 0.6, L * 0.1, H * 0.2, shade(sp.c1, -0.1), -0.6);
    blob(ctx, L * 0.38, 0, L * 0.12, H * 0.42, sp.c1);
    blob(ctx, 0, 0, L * 0.32, H * 0.95, sp.c2);
    ctx.strokeStyle = shade(sp.c2, -0.35); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0, L * 0.32, H * 0.95, 0, 0, TAU); ctx.stroke();
    for (const [x, y] of [[0, 0], [-L * 0.15, -H * 0.45], [L * 0.15, -H * 0.45], [-L * 0.15, H * 0.45], [L * 0.15, H * 0.45]]) { ctx.beginPath(); ctx.ellipse(x, y, L * 0.07, H * 0.25, 0, 0, TAU); ctx.stroke(); }
    eye(ctx, L * 0.42, -H * 0.12, L * 0.045);
  },
  puffer(ctx, sp, L, f) {
    const R = L * 0.38;
    ctx.fillStyle = shade(sp.c1, -0.1);
    ctx.beginPath(); ctx.moveTo(-R * 0.9, 0); ctx.lineTo(-R * 1.4, -R * 0.5 + (f ? 3 : -3)); ctx.lineTo(-R * 1.4, R * 0.5 + (f ? 3 : -3)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(sp.c1, -0.35); ctx.lineWidth = 1.2;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9); ctx.lineTo(Math.cos(a) * R * 1.2, Math.sin(a) * R * 1.2); ctx.stroke(); }
    const outline = () => { ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); };
    outline(); ctx.fillStyle = bodyGradient(ctx, sp, L, R); ctx.fill();
    patternOn(ctx, { ...sp, c2: shade(sp.c1, -0.35) }, L, R, outline);
    blob(ctx, 0, R * 0.4, R * 0.7, R * 0.45, sp.c2);
    eye(ctx, R * 0.4, -R * 0.25, R * 0.28);
    blob(ctx, R * 0.88, R * 0.15, R * 0.12, R * 0.1, shade(sp.c1, -0.4));
  },
  eel(ctx, sp, L, f) {
    const H = L * 0.09;
    const w = f ? 1 : -1;
    ctx.lineCap = 'round';
    ctx.strokeStyle = sp.c1; ctx.lineWidth = H * 2;
    ctx.beginPath(); ctx.moveTo(L * 0.4, 0); ctx.bezierCurveTo(L * 0.1, w * H * 2.2, -L * 0.15, -w * H * 2.2, -L * 0.45, w * H);
    ctx.stroke();
    if (sp.pattern === 'spots') {
      ctx.fillStyle = sp.c2; ctx.globalAlpha = 0.7;
      for (let i = 0; i < 8; i++) { const t = i / 8; blob(ctx, L * 0.35 - t * L * 0.75, Math.sin(t * 6 + w) * H * 0.8, 2, 2, sp.c2); }
      ctx.globalAlpha = 1;
    }
    blob(ctx, L * 0.42, 0, H * 1.6, H * 1.1, sp.c1);
    eye(ctx, L * 0.45, -H * 0.4, Math.max(2.2, H * 0.55));
    ctx.strokeStyle = shade(sp.c1, -0.5); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(L * 0.56, H * 0.3); ctx.lineTo(L * 0.44, H * 0.55); ctx.stroke();
  },
  gulper(ctx, sp, L, f) {
    const w = f ? 1 : -1;
    ctx.lineCap = 'round'; ctx.strokeStyle = sp.c1; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(L * 0.1, 0); ctx.bezierCurveTo(-L * 0.1, w * 10, -L * 0.3, -w * 10, -L * 0.55, w * 4); ctx.stroke();
    blob(ctx, -L * 0.55, w * 4, 3, 3, sp.c2);
    ctx.fillStyle = sp.c1;
    ctx.beginPath(); ctx.moveTo(L * 0.05, -4); ctx.lineTo(L * 0.45, -L * 0.18); ctx.quadraticCurveTo(L * 0.3, 0, L * 0.45, L * 0.16); ctx.lineTo(L * 0.05, 4); ctx.closePath(); ctx.fill();
    eye(ctx, L * 0.12, -4, 2.5);
  },
  angler(ctx, sp, L, f) {
    const R = L * 0.36;
    ctx.fillStyle = shade(sp.c1, -0.1);
    ctx.beginPath(); ctx.moveTo(-R * 0.8, 0); ctx.lineTo(-R * 1.5, -R * 0.6 + (f ? 3 : -3)); ctx.lineTo(-R * 1.5, R * 0.6 + (f ? 3 : -3)); ctx.closePath(); ctx.fill();
    blob(ctx, 0, 0, R * 1.05, R * 0.9, sp.c1);
    ctx.fillStyle = '#16121f';
    ctx.beginPath(); ctx.moveTo(R * 1.0, -R * 0.1); ctx.quadraticCurveTo(R * 0.5, R * 0.9, R * 0.05, R * 0.25); ctx.quadraticCurveTo(R * 0.5, R * 0.35, R * 1.0, -R * 0.1); ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) { const x = R * 0.25 + i * R * 0.16; ctx.beginPath(); ctx.moveTo(x, R * 0.25 + i * 0.02 * R); ctx.lineTo(x + 2, R * 0.42); ctx.lineTo(x + 4, R * 0.25); ctx.fill(); }
    ctx.strokeStyle = shade(sp.c1, 0.2); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(R * 0.3, -R * 0.8); ctx.quadraticCurveTo(R * 0.9, -R * 1.9, R * 1.35, -R * 1.1); ctx.stroke();
    blob(ctx, R * 1.35, -R * 1.05, 3.5, 3.5, sp.c2);
    eye(ctx, R * 0.45, -R * 0.35, R * 0.18);
  },
  barreleye(ctx, sp, L, f) {
    const H = fishShape(ctx, sp, L, f, { tall: 0.3, nose: 0.48 });
    ctx.fillStyle = 'rgba(180,255,230,0.25)'; ctx.strokeStyle = 'rgba(200,255,240,0.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(L * 0.18, -H * 0.7, L * 0.2, H * 0.8, 0, Math.PI, TAU); ctx.fill(); ctx.stroke();
    blob(ctx, L * 0.15, -H * 0.85, 3, 3, sp.c2); blob(ctx, L * 0.26, -H * 0.85, 3, 3, sp.c2);
  },
  octopus(ctx, sp, L, f) {
    const R = L * 0.3;
    ctx.strokeStyle = sp.c1; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i / 7) * Math.PI * 0.9 + Math.PI * 0.05;
      const sx = Math.cos(a) * R * 0.7, sy = R * 0.5;
      const ex = Math.cos(a) * R * 1.6, ey = R * (1.5 + (i % 2) * 0.3);
      ctx.lineWidth = R * 0.32;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(ex * 0.8 + (f ? 3 : -3), ey * 0.7, ex, ey); ctx.stroke();
      ctx.lineWidth = R * 0.16; ctx.beginPath(); ctx.arc(ex + (i < 4 ? -3 : 3), ey, 3, 0, Math.PI * 1.5); ctx.stroke();
    }
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.5, 2, 0, 0, R * 1.3);
    g.addColorStop(0, shade(sp.c1, 0.3)); g.addColorStop(1, sp.c1);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, -R * 0.15, R * 0.95, R * 1.05, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = sp.c2; ctx.globalAlpha = 0.6;
    for (let i = 0; i < 6; i++) blob(ctx, -R * 0.4 + (i % 3) * R * 0.4, -R * 0.6 + Math.floor(i / 3) * R * 0.35, R * 0.1, R * 0.1, sp.c2);
    ctx.globalAlpha = 1;
    eye(ctx, -R * 0.35, R * 0.25, R * 0.24, 0); eye(ctx, R * 0.35, R * 0.25, R * 0.24, 0);
  },
  dumbo(ctx, sp, L, f) {
    const R = L * 0.3;
    const flap = f ? -0.4 : 0.2;
    blob(ctx, -R * 0.95, -R * 0.55, R * 0.45, R * 0.28, sp.c2, -0.6 + flap);
    blob(ctx, R * 0.95, -R * 0.55, R * 0.45, R * 0.28, sp.c2, 0.6 - flap);
    ctx.fillStyle = shade(sp.c1, -0.1);
    ctx.beginPath(); ctx.moveTo(-R, R * 0.2); for (let i = 0; i <= 8; i++) { const x = -R + i * R * 0.25; ctx.lineTo(x, R * (1.3 + (i % 2) * 0.25)); } ctx.lineTo(R, R * 0.2); ctx.fill();
    blob(ctx, 0, 0, R, R * 0.95, sp.c1);
    eye(ctx, -R * 0.35, R * 0.1, R * 0.22, 0); eye(ctx, R * 0.35, R * 0.1, R * 0.22, 0);
  },
  squid(ctx, sp, L, f) {
    // Facing right: mantle at back, tentacles forward... most squid swim
    // mantle-first, so the mantle points right.
    const H = L * 0.16;
    ctx.strokeStyle = sp.c1; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, H * 0.35);
    for (let i = 0; i < 6; i++) {
      const y = (i - 2.5) * H * 0.3;
      ctx.beginPath(); ctx.moveTo(-L * 0.1, y * 0.5); ctx.quadraticCurveTo(-L * 0.3, y + (f ? 3 : -3), -L * (0.45 + (i % 2) * 0.08), y * 1.4); ctx.stroke();
    }
    ctx.fillStyle = shade(sp.c1, -0.1);
    ctx.beginPath(); ctx.moveTo(L * 0.42, 0); ctx.lineTo(L * 0.52, -H * 1.1); ctx.lineTo(L * 0.3, -H * 0.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(L * 0.42, 0); ctx.lineTo(L * 0.52, H * 1.1); ctx.lineTo(L * 0.3, H * 0.5); ctx.closePath(); ctx.fill();
    const g = ctx.createLinearGradient(0, -H, 0, H); g.addColorStop(0, shade(sp.c1, 0.3)); g.addColorStop(1, sp.c1);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.quadraticCurveTo(L * 0.2, -H * 1.3, -L * 0.12, -H * 0.7); ctx.lineTo(-L * 0.12, H * 0.7); ctx.quadraticCurveTo(L * 0.2, H * 1.3, L * 0.5, 0); ctx.fill();
    ctx.fillStyle = sp.c2; ctx.globalAlpha = 0.7;
    for (let i = 0; i < 5; i++) blob(ctx, L * 0.05 + i * L * 0.08, (i % 2 ? 1 : -1) * H * 0.3, 1.6, 1.6, sp.c2);
    ctx.globalAlpha = 1;
    eye(ctx, -L * 0.06, 0, Math.max(2.4, H * 0.5), -0.3);
  },
  jelly(ctx, sp, L, f) {
    const R = L * 0.35;
    ctx.strokeStyle = sp.c2; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.75;
    for (let i = 0; i < 7; i++) {
      const x = -R * 0.8 + i * R * 0.27;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + (f ? 4 : -4), R * 0.7, x - (f ? 4 : -4), R * 1.2, x, R * 1.8); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(0, -R * 0.4, 1, 0, -R * 0.2, R * 1.1);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.5, sp.c1); g.addColorStop(1, shade(sp.c1, -0.3));
    ctx.fillStyle = g; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(-R, 0); ctx.bezierCurveTo(-R, -R * (f ? 1.25 : 1.15), R, -R * (f ? 1.25 : 1.15), R, 0);
    for (let i = 0; i < 6; i++) { const x = R - (i + 1) * (R / 3); ctx.quadraticCurveTo(x + R / 6, R * 0.22, x, 0); }
    ctx.fill();
    ctx.globalAlpha = 1;
    if (sp.id === 'moon-jelly') { ctx.strokeStyle = 'rgba(255,160,220,0.7)'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-R * 0.45 + i * R * 0.3, -R * 0.4, R * 0.12, 0, TAU); ctx.stroke(); } }
    eye(ctx, -R * 0.3, -R * 0.4, R * 0.13, 0); eye(ctx, R * 0.3, -R * 0.4, R * 0.13, 0);
  },
  comb(ctx, sp, L, f) {
    const R = L * 0.35;
    const g = ctx.createRadialGradient(0, -R * 0.2, 1, 0, 0, R * 1.3);
    g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(200,230,255,0.25)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.8, R * 1.2, 0, 0, TAU); ctx.fill();
    const rainbow = ['#ff5a7a', '#ffb13d', '#ffe14a', '#5ef27a', '#5ac8ff', '#a66bff'];
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = rainbow[(i + f) % 6]; ctx.lineWidth = 2;
      const x = -R * 0.6 + i * R * 0.24;
      ctx.beginPath(); ctx.moveTo(x * 0.6, -R * 1.0); ctx.quadraticCurveTo(x * 1.2, 0, x * 0.6, R * 1.0); ctx.stroke();
    }
    eye(ctx, -R * 0.22, -R * 0.3, R * 0.14, 0); eye(ctx, R * 0.22, -R * 0.3, R * 0.14, 0);
  },
  crab(ctx, sp, L, f) {
    const W = L * 0.4, H = L * 0.25;
    ctx.strokeStyle = shade(sp.c1, -0.2); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = -W * 0.4 + i * W * 0.4;
      ctx.beginPath(); ctx.moveTo(x, H * 0.3); ctx.lineTo(x - W * 0.5, H * (1.0 + (f && i === 1 ? -0.15 : 0))); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-x, H * 0.3); ctx.lineTo(-x + W * 0.5, H * (1.0 + (!f && i === 1 ? -0.15 : 0))); ctx.stroke();
    }
    blob(ctx, -W * 1.05, -H * 0.4, W * 0.28, H * 0.42, sp.c1, -0.4);
    blob(ctx, W * 1.05, -H * 0.4, W * 0.28, H * 0.42, sp.c1, 0.4);
    if (sp.pattern === 'shell') {
      blob(ctx, -W * 0.15, -H * 0.2, W * 0.95, H * 1.15, sp.c2);
      ctx.strokeStyle = shade(sp.c2, -0.3); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(-W * 0.15, -H * 0.2, W * 0.5, 0, TAU * 0.8); ctx.stroke();
      blob(ctx, W * 0.75, H * 0.2, W * 0.3, H * 0.4, sp.c1);
      eye(ctx, W * 0.75, -H * 0.4, H * 0.28);
      return;
    }
    blob(ctx, 0, 0, W, H, sp.c1);
    if (sp.pattern === 'hairy') { ctx.strokeStyle = sp.c2; ctx.lineWidth = 1; for (let i = 0; i < 12; i++) { const a = Math.PI + (i / 11) * Math.PI; ctx.beginPath(); ctx.moveTo(Math.cos(a) * W * 1.2, Math.sin(a) * H * 0.2 - H * 0.4); ctx.lineTo(Math.cos(a) * W * 1.45, -H * 0.9); ctx.stroke(); } }
    blob(ctx, 0, -H * 0.3, W * 0.7, H * 0.4, shade(sp.c1, 0.2));
    eye(ctx, -W * 0.3, -H * 1.05, H * 0.3, 0); eye(ctx, W * 0.3, -H * 1.05, H * 0.3, 0);
  },
  lobster(ctx, sp, L, f) {
    const H = L * 0.12;
    ctx.strokeStyle = shade(sp.c1, -0.1); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(L * 0.3, -H * 0.4); ctx.quadraticCurveTo(L * 0.7, -H * 3, L * 0.9, -H * (f ? 1.6 : 2)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L * 0.3, -H * 0.2); ctx.quadraticCurveTo(L * 0.6, -H * 2.2, L * 0.85, -H * 0.8); ctx.stroke();
    for (let i = 0; i < 5; i++) blob(ctx, -L * 0.35 + i * L * 0.12, 0, L * 0.08, H * (1 - i * 0.02), i % 2 ? sp.c1 : shade(sp.c1, 0.15));
    ctx.fillStyle = shade(sp.c1, -0.1);
    ctx.beginPath(); ctx.moveTo(-L * 0.4, 0); ctx.lineTo(-L * 0.55, -H); ctx.lineTo(-L * 0.55, H); ctx.fill();
    blob(ctx, L * 0.25, 0, L * 0.14, H * 1.1, sp.c1);
    ctx.strokeStyle = sp.c2; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-L * 0.1 + i * L * 0.1, H * 0.8); ctx.lineTo(-L * 0.15 + i * L * 0.1, H * 1.8); ctx.stroke(); }
    eye(ctx, L * 0.32, -H * 0.6, Math.max(2, H * 0.4));
  },
  shrimp(ctx, sp, L, f) {
    const H = L * 0.14;
    ctx.strokeStyle = sp.c2; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L * 0.3, -H * 0.3); ctx.quadraticCurveTo(L * 0.7, -H * 2.5, L * 0.6, -H * (f ? 3 : 2.6)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L * 0.3, -H * 0.1); ctx.quadraticCurveTo(L * 0.8, -H * 1, L * 0.85, -H * 2); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 5) * 1.6 - 0.2;
      blob(ctx, L * 0.3 - Math.sin(a) * L * 0.45, Math.cos(a) * H * 1.6 - H * 1.2, L * 0.08, H * 0.75, i % 2 ? sp.c1 : sp.c2, a);
    }
    ctx.strokeStyle = sp.c1; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(L * (0.15 - i * 0.07), H * 0.5); ctx.lineTo(L * (0.12 - i * 0.07), H * 1.6); ctx.stroke(); }
    eye(ctx, L * 0.36, -H * 0.4, Math.max(1.8, H * 0.45));
  },
  star(ctx, sp, L, f) {
    const R = L * 0.5;
    ctx.fillStyle = sp.c1;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU + (f ? 0.04 : 0); const r = i % 2 ? R * 0.42 : R; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(sp.c1, -0.3); ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = sp.c2;
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i / 5) * TAU; for (let k = 1; k < 4; k++) blob(ctx, Math.cos(a) * R * k * 0.22, Math.sin(a) * R * k * 0.22, 1.6, 1.6, sp.c2); }
    eye(ctx, -R * 0.15, -R * 0.08, R * 0.13, 0); eye(ctx, R * 0.15, -R * 0.08, R * 0.13, 0);
  },
  urchin(ctx, sp, L, f) {
    const R = L * 0.3;
    ctx.strokeStyle = sp.c1; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) { const a = Math.PI + (i / 25) * Math.PI * 1.0 + (f ? 0.03 : 0); const r2 = R * (1.6 + (i % 3) * 0.2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2 * 0.95); ctx.stroke(); }
    blob(ctx, 0, R * 0.1, R, R * 0.85, shade(sp.c1, -0.1));
    blob(ctx, -R * 0.3, -R * 0.2, R * 0.3, R * 0.2, sp.c2);
    eye(ctx, -R * 0.35, R * 0.2, R * 0.22, 0); eye(ctx, R * 0.35, R * 0.2, R * 0.22, 0);
  },
  anemone(ctx, sp, L, f) {
    const W = L * 0.3;
    ctx.strokeStyle = sp.c1; ctx.lineCap = 'round'; ctx.lineWidth = 4;
    for (let i = 0; i < 11; i++) {
      const x = -W * 1.2 + i * W * 0.24;
      const tip = -L * (0.45 + Math.sin(i * 1.7) * 0.06);
      ctx.beginPath(); ctx.moveTo(x * 0.7, -L * 0.1); ctx.quadraticCurveTo(x * 1.1 + (f ? 3 : -3), tip * 0.6, x * 1.25 + (f ? 4 : -4), tip); ctx.stroke();
      blob(ctx, x * 1.25 + (f ? 4 : -4), tip, 2.6, 2.6, sp.c2);
    }
    ctx.fillStyle = shade(sp.c1, -0.2);
    ctx.beginPath(); ctx.moveTo(-W * 0.8, -L * 0.1); ctx.lineTo(-W * 0.6, L * 0.25); ctx.lineTo(W * 0.6, L * 0.25); ctx.lineTo(W * 0.8, -L * 0.1); ctx.closePath(); ctx.fill();
    blob(ctx, 0, -L * 0.1, W * 0.85, L * 0.06, sp.c2);
  },
  brain(ctx, sp, L) {
    const R = L * 0.5;
    ctx.fillStyle = sp.c1;
    ctx.beginPath(); ctx.ellipse(0, R * 0.2, R, R * 0.75, 0, Math.PI, TAU); ctx.lineTo(R, R * 0.4); ctx.lineTo(-R, R * 0.4); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = sp.c2; ctx.lineWidth = 2.2;
    for (let y = -R * 0.6; y < R * 0.4; y += R * 0.2) { ctx.beginPath(); for (let x = -R; x <= R; x += 4) ctx.lineTo(x, y + Math.sin(x * 0.35 + y) * 3); ctx.stroke(); }
    ctx.restore();
    eye(ctx, -R * 0.25, -R * 0.05, R * 0.12, 0); eye(ctx, R * 0.25, -R * 0.05, R * 0.12, 0);
  },
  clam(ctx, sp, L, f) {
    const W = L * 0.5;
    const open = f ? 0.45 : 0.3;
    ctx.fillStyle = shade(sp.c1, -0.25);
    ctx.beginPath(); ctx.moveTo(-W, 0); ctx.quadraticCurveTo(0, W * 0.7, W, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = sp.c2;
    ctx.beginPath(); ctx.ellipse(0, -W * 0.05, W * 0.85, W * open * 0.6, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 6; i++) blob(ctx, -W * 0.6 + i * W * 0.24, -W * 0.05, 2.5, 2.5, '#1a6a8a');
    ctx.fillStyle = sp.c1;
    ctx.beginPath(); ctx.moveTo(-W, 0);
    for (let i = 0; i <= 6; i++) { const x = -W + (i / 6) * W * 2; ctx.lineTo(x, -W * open - Math.sin((i / 6) * Math.PI) * W * 0.25 - (i % 2) * 4); }
    ctx.lineTo(W, 0); ctx.quadraticCurveTo(0, -W * 0.1, -W, 0); ctx.fill();
    eye(ctx, -W * 0.2, -W * 0.05, W * 0.11, 0); eye(ctx, W * 0.2, -W * 0.05, W * 0.11, 0);
  },
  seahorse(ctx, sp, L, f) {
    const H = L * 0.5;
    ctx.strokeStyle = sp.c1; ctx.lineCap = 'round'; ctx.lineWidth = L * 0.18;
    ctx.beginPath(); ctx.moveTo(0, -H * 0.6); ctx.quadraticCurveTo(L * 0.25, -H * 0.1, 0, H * 0.4); ctx.quadraticCurveTo(-L * 0.15, H * 0.8, L * 0.05, H * 0.9); ctx.stroke();
    ctx.lineWidth = L * 0.08;
    ctx.beginPath(); ctx.arc(L * 0.12, H * 0.82, L * 0.08, Math.PI, Math.PI * 2.6); ctx.stroke();
    blob(ctx, L * 0.05, -H * 0.7, L * 0.15, L * 0.13, sp.c1);
    ctx.fillStyle = sp.c1; ctx.beginPath(); ctx.moveTo(L * 0.12, -H * 0.78); ctx.lineTo(L * 0.42, -H * 0.66); ctx.lineTo(L * 0.4, -H * 0.56); ctx.lineTo(L * 0.12, -H * 0.6); ctx.fill();
    blob(ctx, -L * 0.12, -H * 0.1, L * 0.08, L * 0.12, sp.c2, f ? 0.4 : -0.2);
    ctx.strokeStyle = sp.c2; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-L * 0.02, -H * 0.4 + i * H * 0.18); ctx.lineTo(L * 0.14, -H * 0.42 + i * H * 0.18); ctx.stroke(); }
    if (sp.pattern === 'leafy') { for (let i = 0; i < 7; i++) blob(ctx, (i % 2 ? 1 : -1) * L * 0.2, -H * 0.5 + i * H * 0.2, L * 0.14, L * 0.05, sp.c2, (i % 2 ? 0.6 : -0.6) + (f ? 0.2 : 0)); }
    eye(ctx, L * 0.08, -H * 0.74, L * 0.065);
  },
  slug(ctx, sp, L, f) {
    const H = L * 0.18;
    blob(ctx, 0, 0, L * 0.45, H, sp.c1);
    ctx.fillStyle = sp.c2;
    for (let i = 0; i < 8; i++) { const x = -L * 0.32 + i * L * 0.08; ctx.beginPath(); ctx.moveTo(x - 3, -H * 0.5); ctx.lineTo(x + (f ? 1 : -1), -H * (1.8 + (i % 2) * 0.3)); ctx.lineTo(x + 3, -H * 0.5); ctx.fill(); }
    ctx.strokeStyle = sp.c2; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L * 0.35, -H * 0.4); ctx.lineTo(L * 0.42, -H * 1.5); ctx.moveTo(L * 0.3, -H * 0.4); ctx.lineTo(L * 0.3, -H * 1.5); ctx.stroke();
    eye(ctx, L * 0.32, 0, H * 0.35);
  },
  seapig(ctx, sp, L, f) {
    const H = L * 0.25;
    ctx.strokeStyle = sp.c1; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const x = -L * 0.3 + i * L * 0.15; ctx.beginPath(); ctx.moveTo(x, H * 0.5); ctx.lineTo(x + (f ? 2 : -2), H * 1.2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(L * 0.05, -H * 0.8); ctx.lineTo(L * 0.0, -H * 1.6); ctx.moveTo(L * 0.18, -H * 0.8); ctx.lineTo(L * 0.2, -H * 1.6); ctx.stroke();
    blob(ctx, 0, 0, L * 0.45, H, sp.c1);
    blob(ctx, -L * 0.05, -H * 0.3, L * 0.3, H * 0.4, sp.c2);
    eye(ctx, L * 0.28, -H * 0.15, H * 0.3);
  },
  isopod(ctx, sp, L, f) {
    const H = L * 0.2;
    ctx.strokeStyle = sp.c2; ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) { const x = -L * 0.3 + i * L * 0.1; ctx.beginPath(); ctx.moveTo(x, H * 0.6); ctx.lineTo(x + (f ? 2 : -2), H * 1.3); ctx.stroke(); }
    for (let i = 0; i < 7; i++) blob(ctx, -L * 0.3 + i * L * 0.1, 0, L * 0.07, H * (1 - Math.abs(i - 3) * 0.06), i % 2 ? sp.c1 : shade(sp.c1, -0.1));
    ctx.beginPath(); ctx.moveTo(L * 0.38, -H * 0.2); ctx.quadraticCurveTo(L * 0.55, -H * 1.0, L * 0.6, -H * 0.4); ctx.stroke();
    eye(ctx, L * 0.32, -H * 0.3, H * 0.28);
  },
  tubeworm(ctx, sp, L, f) {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * L * 0.2, h = L * (0.7 - i * 0.12);
      ctx.fillStyle = sp.c1; ctx.fillRect(x - L * 0.06, -h * 0.5, L * 0.12, h);
      ctx.strokeStyle = shade(sp.c1, -0.2); ctx.lineWidth = 1;
      for (let y = -h * 0.4; y < h * 0.5; y += 5) { ctx.beginPath(); ctx.moveTo(x - L * 0.06, y); ctx.lineTo(x + L * 0.06, y); ctx.stroke(); }
      blob(ctx, x, -h * 0.5 - L * 0.08, L * 0.1, L * 0.13 + (f && i === 1 ? 2 : 0), sp.c2);
    }
    eye(ctx, -L * 0.03, -L * 0.37, L * 0.035, 0); eye(ctx, L * 0.03, -L * 0.37, L * 0.035, 0);
  },
  worm(ctx, sp, L, f) {
    ctx.fillStyle = sp.c2; ctx.fillRect(-L * 0.08, -L * 0.1, L * 0.16, L * 0.5);
    ctx.strokeStyle = sp.c1; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.25 + (f ? 0.08 : -0.08); ctx.beginPath(); ctx.moveTo(0, -L * 0.1); ctx.lineTo(Math.cos(a) * L * 0.4, -L * 0.1 + Math.sin(a) * L * 0.4); ctx.stroke(); }
    eye(ctx, 0, -L * 0.08, L * 0.06, 0);
  },
  snail(ctx, sp, L, f) {
    const R = L * 0.3;
    blob(ctx, L * 0.05, R * 0.6, L * 0.42, R * 0.35, '#8a8a96');
    ctx.fillStyle = sp.c1; ctx.beginPath(); ctx.arc(-L * 0.05, 0, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = sp.c2; ctx.lineWidth = 2; ctx.beginPath();
    for (let a = 0; a < TAU * 2.2; a += 0.2) { const r = R * (1 - a / (TAU * 2.4)); ctx.lineTo(-L * 0.05 + Math.cos(a) * r, Math.sin(a) * r); }
    ctx.stroke();
    ctx.strokeStyle = '#8a8a96'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L * 0.35, R * 0.4); ctx.lineTo(L * 0.42, -R * (f ? 0.4 : 0.3)); ctx.stroke();
    eye(ctx, L * 0.42, -R * 0.4, R * 0.22);
  },
};

export const SHAPES = Object.keys(DRAW);

// Bake a creature sprite: { canvas, w, h } in world pixels (canvas is 2x).
export function bakeCreature(sp, frame, { silhouette = false } = {}) {
  const L = sp.size;
  const pad = L * 0.9;
  const w = L * 2 + pad, h = L * 2 + pad;
  const c = makeCanvas(w * SPRITE_SCALE, h * SPRITE_SCALE);
  const ctx = c.getContext('2d');
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(w / 2, h / 2);
  (DRAW[sp.shape] || DRAW.fish)(ctx, sp, L, frame);
  if (silhouette) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#0d2440';
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return { canvas: c, w, h };
}

// Draw a creature straight into a small DOM canvas (encyclopedia cards).
export function drawCreatureCard(canvas, sp, { silhouette = false } = {}) {
  const ctx = canvas.getContext('2d');
  const s = bakeCreature(sp, 0, { silhouette });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fit = Math.min(canvas.width / (sp.size * 1.45), canvas.height / (sp.size * 1.25));
  const dw = s.w * fit, dh = s.h * fit;
  ctx.drawImage(s.canvas, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
}

// ---------------------------------------------------------------- Bubbles

// Bubbles the sub, facing right. Parts show up on the hull as you find them.
export function bakeSub(paint, ups, frame) {
  const W = 120, H = 90;
  const c = makeCanvas(W * SPRITE_SCALE, H * SPRITE_SCALE);
  const ctx = c.getContext('2d');
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(W / 2, H / 2 + 4);
  const L = 33, R = 17;
  const body = paint.body, trim = paint.trim;

  // propeller
  ctx.fillStyle = '#5a6270';
  ctx.fillRect(-L - 10, -3, 8, 6);
  const blade = [0.9, 0.35, -0.2][frame % 3];
  ctx.fillStyle = '#c9d2de';
  blob(ctx, -L - 12, -8 * blade, 3, 7 * Math.abs(blade) + 2, '#c9d2de');
  blob(ctx, -L - 12, 8 * blade, 3, 7 * Math.abs(blade) + 2, '#aab4c2');
  if (ups.has('turbo')) {
    ctx.fillStyle = '#ff6a3d';
    ctx.beginPath(); ctx.moveTo(-L + 4, -R + 2); ctx.lineTo(-L - 10, -R - 10); ctx.lineTo(-L - 2, -R + 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L + 4, R - 2); ctx.lineTo(-L - 10, R + 10); ctx.lineTo(-L - 2, R - 6); ctx.fill();
    blob(ctx, -L - 4, 0, 6, 9, '#ff8a3d');
  }
  // tail fins
  ctx.fillStyle = trim;
  ctx.beginPath(); ctx.moveTo(-L + 6, -R + 6); ctx.lineTo(-L - 6, -R - 4); ctx.lineTo(-L - 4, -R + 10); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-L + 6, R - 6); ctx.lineTo(-L - 6, R + 4); ctx.lineTo(-L - 4, R - 10); ctx.closePath(); ctx.fill();

  // conning tower and periscope
  ctx.fillStyle = trim;
  ctx.beginPath(); ctx.roundRect(-10, -R - 12, 22, 16, 6); ctx.fill();
  ctx.strokeStyle = '#5a6270'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(4, -R - 12); ctx.lineTo(4, -R - 20); ctx.lineTo(10, -R - 20); ctx.stroke();

  // hull
  const outline = () => { ctx.beginPath(); ctx.ellipse(0, 0, L, R, 0, 0, TAU); };
  outline();
  const g = ctx.createLinearGradient(0, -R, 0, R);
  g.addColorStop(0, shade(body, 0.45));
  g.addColorStop(0.45, body);
  g.addColorStop(1, shade(body, -0.3));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  outline();
  ctx.clip();
  const p = paint.pattern;
  if (p === 'stripes') { ctx.fillStyle = trim; for (let i = -3; i <= 3; i++) ctx.fillRect(i * 12 - 3, -R, 5, R * 2); }
  else if (p === 'dots') { ctx.fillStyle = trim; for (let i = 0; i < 9; i++) blob(ctx, -26 + (i % 5) * 12 + (i > 4 ? 6 : 0), i > 4 ? 6 : -6, 3, 3, trim); }
  else if (p === 'tiger') { ctx.fillStyle = trim; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 11, -R); ctx.lineTo(i * 11 + 6, -R); ctx.lineTo(i * 11 + 1, -2); ctx.fill(); } }
  else if (p === 'stars') { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 16; i++) blob(ctx, -30 + ((i * 37) % 60), -14 + ((i * 23) % 28), 1 + (i % 3) * 0.5, 1 + (i % 3) * 0.5, i % 4 ? '#ffffff' : trim); }
  else if (p === 'rainbow') { const cols = ['#ff5a5a', '#ffa63d', '#ffe14a', '#5ee27a', '#4ab8ff', '#a66bff']; cols.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(-L, -R + i * (R * 2 / 6), L * 2, R * 2 / 6 + 1); }); }
  else if (p === 'shine') { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(-20, -R); ctx.lineTo(-8, -R); ctx.lineTo(-24, R); ctx.lineTo(-36, R); ctx.fill(); }
  else if (p === 'glow') { ctx.strokeStyle = trim; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-L, -6 + i * 6); ctx.lineTo(L, -6 + i * 6); ctx.stroke(); } }
  // belly band
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(-L, R * 0.45, L * 2, R);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  blob(ctx, -6, -R * 0.62, L * 0.6, R * 0.16, 'rgba(255,255,255,0.35)');
  ctx.restore();
  outline();
  ctx.strokeStyle = shade(paint.pattern === 'rainbow' ? '#a66bff' : body, -0.45);
  ctx.lineWidth = 2;
  ctx.stroke();
  if (ups.has('hull')) {
    ctx.strokeStyle = '#7a8496'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, L - 1, R - 1, 0, 0.3, Math.PI - 0.3); ctx.stroke();
    ctx.fillStyle = '#c9d2de';
    for (let i = 0; i < 7; i++) { const a = 0.4 + i * 0.36; blob(ctx, Math.cos(a) * (L - 2), Math.sin(a) * (R - 2), 1.4, 1.4, '#e0e6ee'); }
  }
  // portholes
  for (const x of [-16, -6]) {
    blob(ctx, x, 1, 3.6, 3.6, '#5a6270');
    blob(ctx, x, 1, 2.6, 2.6, '#9fe6ff');
  }
  // the big window face
  blob(ctx, 16, -2, 12, 12, '#5a6270');
  const wg = ctx.createRadialGradient(13, -6, 1, 16, -2, 11);
  wg.addColorStop(0, '#e8fbff'); wg.addColorStop(1, '#6fd0f0');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.arc(16, -2, 10, 0, TAU); ctx.fill();
  eye(ctx, 12.5, -3, 3.4, 0.35);
  eye(ctx, 20, -3, 3.4, 0.35);
  ctx.strokeStyle = '#2b3a4a'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(16.5, 1.5, 3.5, 0.3, Math.PI - 0.3); ctx.stroke();
  blob(ctx, 10.5, 2, 1.6, 1, 'rgba(255,120,150,0.7)');
  blob(ctx, 22, 2, 1.6, 1, 'rgba(255,120,150,0.7)');

  if (ups.has('lights')) {
    ctx.fillStyle = '#5a6270';
    ctx.beginPath(); ctx.roundRect(L - 8, -R + 2, 8, 7, 2); ctx.fill();
    blob(ctx, L - 1, -R + 5.5, 2.6, 3, '#fff6c4');
  }
  if (ups.has('drill')) {
    ctx.fillStyle = '#9aa4b2';
    ctx.beginPath(); ctx.moveTo(L - 3, -7); ctx.lineTo(L + 13, 0); ctx.lineTo(L - 3, 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5a6270'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) { const x = L + i * 4 + (frame % 3) * 1.3; ctx.beginPath(); ctx.moveTo(x, -6 + i * 2); ctx.lineTo(x + 3, 6 - i * 2); ctx.stroke(); }
  }
  if (ups.has('grabber')) {
    ctx.strokeStyle = '#5a6270'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(8, R - 3); ctx.lineTo(16, R + 7); ctx.lineTo(25, R + 6); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(25, R + 6); ctx.lineTo(30, R + 2); ctx.moveTo(25, R + 6); ctx.lineTo(30, R + 10); ctx.stroke();
  }
  return { canvas: c, w: W, h: H, ox: W / 2, oy: H / 2 + 4 };
}

// ---------------------------------------------------------------- pickups and props

export function bakeGlow(radius, color, strength = 1) {
  const c = makeCanvas(radius * 2, radius * 2);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color.replace(/[\d.]+\)$/, `${0.45 * strength})`));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, radius * 2, radius * 2);
  return c;
}

export function bakeChest() {
  const c = makeCanvas(56 * SPRITE_SCALE, 48 * SPRITE_SCALE);
  const ctx = c.getContext('2d');
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(28, 26);
  ctx.fillStyle = '#7a4a22'; ctx.beginPath(); ctx.roundRect(-18, -4, 36, 20, 3); ctx.fill();
  ctx.fillStyle = '#a5672f'; ctx.beginPath(); ctx.moveTo(-18, -2); ctx.quadraticCurveTo(0, -20, 18, -2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-18, -3, 36, 3); ctx.fillRect(-11, -12, 3, 28); ctx.fillRect(8, -12, 3, 28);
  ctx.fillStyle = '#ffe58a'; ctx.beginPath(); ctx.roundRect(-4, -2, 8, 8, 2); ctx.fill();
  ctx.fillStyle = '#5a3416'; ctx.fillRect(-1, 1, 2, 3);
  blob(ctx, -6, -8, 3, 2, 'rgba(255,255,255,0.35)');
  return c;
}

export function bakeShell() {
  const c = makeCanvas(48 * SPRITE_SCALE, 48 * SPRITE_SCALE);
  const ctx = c.getContext('2d');
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(24, 26);
  const g = ctx.createLinearGradient(0, -16, 0, 14);
  g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#d99a0b');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, 12);
  for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI; ctx.lineTo(Math.cos(a) * 16, -2 + Math.sin(a) * 14 - (i % 2) * 1.5); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#b8780b'; ctx.lineWidth = 1.4;
  for (let i = 1; i < 8; i++) { const a = Math.PI + (i / 8) * Math.PI; ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(Math.cos(a) * 14, -2 + Math.sin(a) * 12); ctx.stroke(); }
  ctx.fillStyle = '#e8a90f'; ctx.beginPath(); ctx.moveTo(-6, 12); ctx.lineTo(6, 12); ctx.lineTo(4, 8); ctx.lineTo(-4, 8); ctx.fill();
  blob(ctx, -6, -8, 3, 2, 'rgba(255,255,255,0.8)');
  return c;
}

export function bakePart(icon) {
  const c = makeCanvas(64 * SPRITE_SCALE, 64 * SPRITE_SCALE);
  const ctx = c.getContext('2d');
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(32, 32);
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 30);
  g.addColorStop(0, 'rgba(255,240,150,0.9)'); g.addColorStop(1, 'rgba(255,200,60,0)');
  ctx.fillStyle = g; ctx.fillRect(-32, -32, 64, 64);
  ctx.fillStyle = '#2f6bff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(-16, -16, 32, 32, 8); ctx.fill(); ctx.stroke();
  ctx.font = '20px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(icon, 0, 1);
  return c;
}

export function bakeHeart() {
  const c = makeCanvas(96 * SPRITE_SCALE, 96 * SPRITE_SCALE);
  const ctx = c.getContext('2d');
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(48, 50);
  const glow = ctx.createRadialGradient(0, 0, 6, 0, 0, 46);
  glow.addColorStop(0, 'rgba(255,120,200,0.8)'); glow.addColorStop(1, 'rgba(255,120,200,0)');
  ctx.fillStyle = glow; ctx.fillRect(-48, -48, 96, 96);
  const g = ctx.createLinearGradient(-20, -20, 20, 20);
  g.addColorStop(0, '#ffd0f0'); g.addColorStop(0.5, '#ff4fa8'); g.addColorStop(1, '#a01a6a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, 20); ctx.bezierCurveTo(-30, 0, -20, -26, 0, -10); ctx.bezierCurveTo(20, -26, 30, 0, 0, 20); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
  blob(ctx, -9, -8, 5, 3, 'rgba(255,255,255,0.7)', -0.5);
  return c;
}

export function bakeDock(kind) {
  const c = makeCanvas(120 * SPRITE_SCALE, 120 * SPRITE_SCALE);
  const ctx = c.getContext('2d');
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(60, 60);
  if (kind === 'buoy') {
    // A floating dock: planks at the waterline with a flag.
    ctx.fillStyle = '#8a5a3a'; ctx.fillRect(-46, -26, 92, 10);
    ctx.fillStyle = '#a5714a'; for (let i = 0; i < 6; i++) ctx.fillRect(-46 + i * 16, -26, 14, 8);
    ctx.fillStyle = '#ff5a5a'; blob(ctx, -40, -14, 8, 9, '#ff5a5a'); blob(ctx, 40, -14, 8, 9, '#ff5a5a');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-48, -16, 16, 3); ctx.fillRect(32, -16, 16, 3);
    ctx.strokeStyle = '#5a3a24'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(30, -26); ctx.lineTo(30, -58); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(30, -58); ctx.lineTo(52, -51); ctx.lineTo(30, -44); ctx.fill();
    ctx.strokeStyle = '#c9d2de'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-20, -16); ctx.quadraticCurveTo(-24, 10, -10, 30); ctx.stroke();
  } else {
    // An undersea station: a glass dome on legs with warm lights.
    ctx.strokeStyle = '#5a6270'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-30, 10); ctx.lineTo(-40, 40); ctx.moveTo(30, 10); ctx.lineTo(40, 40); ctx.stroke();
    ctx.fillStyle = '#7a8496'; ctx.beginPath(); ctx.roundRect(-40, 4, 80, 12, 5); ctx.fill();
    const g = ctx.createRadialGradient(-10, -24, 4, 0, -10, 40);
    g.addColorStop(0, 'rgba(230,250,255,0.85)'); g.addColorStop(1, 'rgba(120,210,255,0.35)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 4, 34, Math.PI, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffd23f'; for (let i = 0; i < 5; i++) blob(ctx, -28 + i * 14, 10, 2.4, 2.4, '#ffe58a');
    ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.roundRect(-8, -14, 16, 18, 4); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('O₂', 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-14, -14, 14, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
  }
  return c;
}

export function bakeBubble(r = 8) {
  const c = makeCanvas(r * 2 * SPRITE_SCALE, r * 2 * SPRITE_SCALE);
  const ctx = c.getContext('2d');
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2;
  ctx.fillStyle = 'rgba(200,240,255,0.18)';
  ctx.beginPath(); ctx.arc(r, r, r - 1, 0, TAU); ctx.fill(); ctx.stroke();
  blob(ctx, r - r * 0.35, r - r * 0.35, r * 0.25, r * 0.18, 'rgba(255,255,255,0.9)', -0.6);
  return c;
}

export function bakeHatch(wCells, hCells, cell) {
  const w = wCells * cell, h = hCells * cell;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#8a6a52'); g.addColorStop(1, '#5a4434');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = '#c96a2a'; ctx.globalAlpha = 0.5;
  for (let i = 0; i < 9; i++) blob(ctx, (i * 37) % w, (i * 53) % h, 6 + (i % 3) * 3, 4 + (i % 2) * 3, '#c96a2a', i);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#c9d2de';
  for (let x = 8; x < w - 4; x += 16) { blob(ctx, x, 8, 2, 2, '#c9d2de'); blob(ctx, x, h - 8, 2, 2, '#c9d2de'); }
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.28, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w / 2 - Math.min(w, h) * 0.28, h / 2); ctx.lineTo(w / 2 + Math.min(w, h) * 0.28, h / 2);
  ctx.moveTo(w / 2, h / 2 - Math.min(w, h) * 0.28); ctx.lineTo(w / 2, h / 2 + Math.min(w, h) * 0.28); ctx.stroke();
  return c;
}

export function bakeCoralWall(wCells, hCells, cell, seed = 1) {
  const w = wCells * cell, h = hCells * cell;
  const c = makeCanvas(w + 16, h + 16);
  const ctx = c.getContext('2d');
  ctx.translate(8, 8);
  const cols = ['#ff7eb6', '#ff5a8a', '#ffa3c9', '#f26a9a', '#ffb36a'];
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  ctx.fillStyle = '#c9507a'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 10); ctx.fill();
  for (let i = 0; i < wCells * hCells * 7; i++) {
    const x = r() * w, y = r() * h, rad = 6 + r() * 10;
    blob(ctx, x, y, rad, rad, cols[i % cols.length]);
    blob(ctx, x - rad * 0.3, y - rad * 0.3, rad * 0.3, rad * 0.3, 'rgba(255,255,255,0.35)');
  }
  ctx.fillStyle = 'rgba(120,20,60,0.5)';
  for (let i = 0; i < wCells * hCells * 6; i++) blob(ctx, r() * w, r() * h, 1.6, 1.6, 'rgba(120,20,60,0.5)');
  return c;
}
