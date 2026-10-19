// Living pictures: how a finished picture moves once it comes to life.
// Draws onto any 2D context; `pic` holds a w×h canvas (one pixel per square)
// built by the renderer. Effects are computed from time alone, so nothing is
// allocated per frame.

const TAU = Math.PI * 2;
const frac = (v) => v - Math.floor(v);
const hash = (n) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);

// Where a picture sits for a given animation at time t: offsets in squares,
// rotation, and scale.
function pose(anim, t, amp) {
  const o = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };
  switch (anim) {
    case 'bounce': {
      const p = Math.abs(Math.sin(t * 3.2));
      o.y = -p * 0.9 * amp;
      const squash = Math.max(0, 0.25 - p) * 0.35 * amp;
      o.sx = 1 + squash;
      o.sy = 1 - squash;
      break;
    }
    case 'beat': {
      const p = frac(t / 1.1);
      const pulse = Math.max(0, Math.sin(p * TAU * 2)) * (p < 0.5 ? 1 : 0);
      o.sx = o.sy = 1 + pulse * 0.1 * amp;
      break;
    }
    case 'wiggle': o.rot = Math.sin(t * 5) * 0.09 * amp; o.y = -Math.abs(Math.sin(t * 5)) * 0.15 * amp; break;
    case 'bob': o.y = Math.sin(t * 2) * 0.35 * amp; o.rot = Math.sin(t * 2 - 0.6) * 0.07 * amp; break;
    case 'hop': {
      const p = frac(t / 1.3);
      if (p < 0.45) o.y = -Math.sin((p / 0.45) * Math.PI) * 1.6 * amp;
      else if (p < 0.6) { const q = (p - 0.45) / 0.15; const sq = Math.sin(q * Math.PI) * 0.12 * amp; o.sx = 1 + sq; o.sy = 1 - sq; }
      break;
    }
    case 'drive': o.y = (Math.sin(t * 22) > 0.2 ? -0.08 : 0) * amp; o.x = Math.sin(t * 0.9) * 0.6 * amp; break;
    case 'fly': o.y = Math.sin(t * 2.1) * 0.6 * amp; o.rot = Math.sin(t * 2.1 + 0.7) * 0.06 * amp; o.x = Math.sin(t * 0.7) * 0.5 * amp; break;
    case 'float': o.y = Math.sin(t * 1.4) * 0.7 * amp; o.rot = Math.sin(t * 0.9) * 0.05 * amp; break;
    case 'swim': o.x = Math.sin(t * 0.8) * 0.7 * amp; break;
    case 'spin': o.rot = t * 0.7 * amp; break;
    case 'flap': o.sx = 1 - Math.abs(Math.sin(t * 5)) * 0.35 * amp; o.y = Math.sin(t * 5) * 0.12 * amp; break;
    case 'blink': case 'twinkle': case 'steam': case 'smoke': o.sx = o.sy = 1 + Math.sin(t * 2) * 0.02 * amp; break;
    case 'sway': break;
    case 'launch': {
      const p = t % 5;
      if (p < 1.1) o.x = Math.sin(t * 70) * 0.08 * amp;
      else if (p < 2.6) { const q = (p - 1.1) / 1.5; o.y = -q * q * 30 * amp; }
      else if (p < 3.3) o.y = -30;
      else { const q = (p - 3.3) / 1.7; const e = 1 - (1 - q) ** 3; o.y = (1 - e) * 24; }
      break;
    }
    default: break;
  }
  return o;
}

// Is a blink happening? Eyes close for a moment every few seconds.
function blinking(t) {
  const p = t % 3.4;
  return p > 3.2 || (p > 1.6 && p < 1.68 && hash(Math.floor(t / 3.4)) > 0.6);
}

// Draw a living picture centred at (cx, cy) with square size s.
export function drawLiving(ctx, pic, cx, cy, s, t, anim, { reduced = false, alpha = 1 } = {}) {
  const amp = reduced ? 0.25 : 1;
  const W = pic.w * s;
  const H = pic.h * s;
  const o = pose(anim, t, amp);
  if (anim === 'launch' && !reduced) drawFlame(ctx, pic, cx + o.x * s, cy + o.y * s, s, t, H);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx + o.x * s, cy + o.y * s + (o.sy !== 1 ? (H / 2) * (1 - o.sy) : 0));
  if (o.rot) ctx.rotate(o.rot);
  if (o.sx !== 1 || o.sy !== 1) ctx.scale(o.sx, o.sy);
  const x0 = -W / 2;
  const y0 = -H / 2;
  if (anim === 'sway') {
    for (let y = 0; y < pic.h; y++) {
      const dx = Math.sin(t * 2.2 - y * 0.35) * 0.4 * amp * (1 - y / pic.h) * s;
      ctx.drawImage(pic.canvas, 0, y, pic.w, 1, x0 + dx, y0 + y * s, W, s + 0.5);
    }
  } else if (anim === 'swim') {
    for (let x = 0; x < pic.w; x++) {
      const dy = Math.sin(t * 3.2 - x * 0.6) * 0.28 * amp * s;
      ctx.drawImage(pic.canvas, x, 0, 1, pic.h, x0 + x * s, y0 + dy, s + 0.5, H);
    }
  } else {
    ctx.drawImage(pic.canvas, x0, y0, W, H);
  }
  if (pic.eyes.length && blinking(t)) {
    ctx.fillStyle = pic.lid;
    for (const [ex, ey] of pic.eyes) {
      let dx = 0;
      let dy = 0;
      if (anim === 'sway') dx = Math.sin(t * 2.2 - ey * 0.35) * 0.4 * amp * (1 - ey / pic.h) * s;
      if (anim === 'swim') dy = Math.sin(t * 3.2 - ex * 0.6) * 0.28 * amp * s;
      ctx.fillRect(x0 + ex * s + dx, y0 + ey * s + dy, s + 0.5, s + 0.5);
    }
  }
  ctx.restore();
  if (!reduced) drawEffects(ctx, pic, cx + o.x * s, cy + o.y * s, s, t, anim, W, H, alpha);
}

function drawFlame(ctx, pic, cx, cy, s, t, H) {
  const p = t % 5;
  if (p < 0.5 || (p > 2.6 && p < 3.3)) return;
  const power = p < 1.1 ? 0.5 : p < 2.6 ? 1.2 : 0.6;
  const base = cy + H / 2;
  for (let k = 0; k < 6; k++) {
    const f = frac(t * 3 + k / 6);
    const r = s * (1.1 - f) * power;
    ctx.globalAlpha = (1 - f) * 0.9;
    ctx.fillStyle = f < 0.35 ? '#fff3b0' : f < 0.65 ? '#ffb347' : '#ff6b4a';
    const x = cx + (hash(k + Math.floor(t * 3)) - 0.5) * s * 1.6;
    ctx.beginPath();
    ctx.arc(x, base + f * s * 4 * power, Math.max(1, r), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawEffects(ctx, pic, cx, cy, s, t, anim, W, H, alpha) {
  if (anim === 'twinkle' || anim === 'beat') {
    for (let k = 0; k < 4; k++) {
      const period = 1.6;
      const ph = frac(t / period + k * 0.25);
      const cycle = Math.floor(t / period + k * 0.25);
      const cell = pic.filled[Math.floor(hash(cycle * 7 + k * 13) * pic.filled.length)];
      if (cell == null) continue;
      const x = cx - W / 2 + ((cell % pic.w) + 0.5) * s;
      const y = cy - H / 2 + (Math.floor(cell / pic.w) + 0.5) * s;
      const r = Math.sin(ph * Math.PI) * s * 0.55;
      const th = Math.max(1, s * 0.09);
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9 * alpha;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - r, y - th / 2, r * 2, th);
      ctx.fillRect(x - th / 2, y - r, th, r * 2);
      ctx.fillRect(x - th, y - th, th * 2, th * 2);
    }
    ctx.globalAlpha = 1;
  } else if (anim === 'steam' || anim === 'smoke') {
    const top = cy - H / 2;
    const sx = anim === 'smoke' ? cx + W * 0.2 : cx;
    for (let k = 0; k < 4; k++) {
      const ph = frac(t * 0.45 + k / 4);
      ctx.globalAlpha = (1 - ph) * 0.55 * alpha;
      ctx.fillStyle = anim === 'smoke' ? '#c9c4cf' : '#ffffff';
      ctx.beginPath();
      ctx.arc(sx + Math.sin(ph * 5 + k) * s * 0.8 + (k - 1.5) * s * 0.6, top - ph * s * 5, s * (0.4 + ph * 0.9), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (anim === 'drive' || anim === 'fly') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let k = 0; k < 3; k++) {
      const ph = frac(t * 1.6 + k / 3);
      const y = cy - H * 0.25 + k * H * 0.25;
      const len = s * 2.4 * (1 - ph);
      ctx.globalAlpha = (1 - ph) * alpha;
      ctx.fillRect(cx - W / 2 - s * 0.6 - ph * s * 4 - len, y, len, Math.max(1.5, s * 0.16));
    }
    ctx.globalAlpha = 1;
  }
}

// How long one loop of an animation lasts (for previews).
export function loopSeconds(anim) {
  return anim === 'launch' ? 5 : 3.4;
}
