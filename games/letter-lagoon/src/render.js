// Canvas art: critter sprites, the lagoon backdrop with swimmers, and the
// particle layer. Everything that glows or has gradients is baked once into
// offscreen canvases; per frame we only drawImage and move things.
import { CRITTERS } from './critters.js';

const OUTLINE = '#1d3557';
export const SPRITE_W = 150;
export const SPRITE_H = 105;

const TAU = Math.PI * 2;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function eye(ctx, x, y, r = 7) {
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
  ctx.fillStyle = OUTLINE;
  ctx.beginPath(); ctx.arc(x + r * 0.25, y + r * 0.1, r * 0.55, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.25, r * 0.22, 0, TAU); ctx.fill();
}

function smile(ctx, x, y, r = 5, from = 0.15, to = 0.85) {
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, r, Math.PI * from, Math.PI * to); ctx.stroke();
}

function blush(ctx, x, y, r = 4.5) {
  ctx.fillStyle = 'rgba(255, 120, 150, 0.55)';
  ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r * 0.8, 0, 0, TAU); ctx.fill();
}

function shape(ctx, fill, build, width = 4) {
  ctx.beginPath();
  build(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round';
  ctx.stroke();
}

function shine(ctx, x, y, rx, ry, rot = -0.4) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill();
}

const PAINTERS = {
  clownfish(ctx, c) {
    shape(ctx, c.body, (p) => { p.moveTo(-32, 0); p.lineTo(-56, -20); p.quadraticCurveTo(-48, 0, -56, 20); p.closePath(); });
    shape(ctx, c.body, (p) => { p.moveTo(-16, -20); p.quadraticCurveTo(0, -42, 20, -20); p.closePath(); });
    shape(ctx, c.body, (p) => { p.moveTo(-6, 20); p.quadraticCurveTo(4, 36, 14, 20); p.closePath(); });
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, 40, 26, 0, 0, TAU); ctx.fillStyle = c.body; ctx.fill();
    ctx.clip();
    for (const [x, w] of [[16, 10], [-10, 11], [-34, 8]]) {
      ctx.fillStyle = c.accent; ctx.fillRect(x - w / 2, -30, w, 60);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5; ctx.strokeRect(x - w / 2, -32, w, 64);
    }
    shine(ctx, 4, -14, 16, 5);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, 40, 26, 0, 0, TAU); ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.stroke();
    eye(ctx, 26, -6, 7);
    smile(ctx, 34, 6, 4);
    blush(ctx, 26, 8);
  },
  angelfish(ctx, c) {
    shape(ctx, c.body, (p) => { p.moveTo(-24, 0); p.lineTo(-50, -18); p.lineTo(-44, 0); p.lineTo(-50, 18); p.closePath(); });
    shape(ctx, c.accent, (p) => { p.moveTo(-2, -26); p.lineTo(-30, -52); p.lineTo(-14, -14); p.closePath(); });
    shape(ctx, c.accent, (p) => { p.moveTo(-2, 26); p.lineTo(-30, 52); p.lineTo(-14, 14); p.closePath(); });
    const body = (p) => { p.moveTo(40, 0); p.bezierCurveTo(32, -24, 2, -36, -18, -10); p.lineTo(-28, 0); p.lineTo(-18, 10); p.bezierCurveTo(2, 36, 32, 24, 40, 0); p.closePath(); };
    ctx.save();
    ctx.beginPath(); body(ctx); ctx.fillStyle = c.body; ctx.fill(); ctx.clip();
    ctx.fillStyle = c.accent;
    for (const x of [10, -8]) ctx.fillRect(x - 4, -40, 8, 80);
    shine(ctx, 12, -14, 14, 5);
    ctx.restore();
    ctx.beginPath(); body(ctx); ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.stroke();
    eye(ctx, 24, -5, 6.5);
    smile(ctx, 33, 5, 3.5);
    blush(ctx, 23, 8, 3.5);
  },
  pufferfish(ctx, c) {
    ctx.fillStyle = c.accent; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      ctx.beginPath();
      ctx.moveTo(4 + Math.cos(a - 0.12) * 29, Math.sin(a - 0.12) * 29);
      ctx.lineTo(4 + Math.cos(a) * 39, Math.sin(a) * 39);
      ctx.lineTo(4 + Math.cos(a + 0.12) * 29, Math.sin(a + 0.12) * 29);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    shape(ctx, c.body, (p) => { p.moveTo(-26, 0); p.lineTo(-44, -12); p.lineTo(-44, 12); p.closePath(); });
    shape(ctx, c.body, (p) => p.arc(4, 0, 31, 0, TAU));
    ctx.fillStyle = '#fff7d6';
    ctx.beginPath(); ctx.ellipse(6, 14, 22, 12, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = c.accent;
    for (const [x, y] of [[-10, -14], [0, -22], [-16, 2], [12, -18]]) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill(); }
    shine(ctx, -6, -16, 10, 5);
    eye(ctx, 12, -6, 7.5);
    eye(ctx, 26, -5, 6);
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.ellipse(33, 9, 3.2, 4, 0, 0, TAU); ctx.fill();
    blush(ctx, 18, 9, 4);
  },
  turtle(ctx, c) {
    const flipper = (x, y, rx, ry, rot) => shape(ctx, '#8be0a6', (p) => p.ellipse(x, y, rx, ry, rot, 0, TAU), 3.5);
    flipper(16, -24, 16, 7, -0.7);
    flipper(-26, -18, 10, 5, 0.6);
    shape(ctx, '#8be0a6', (p) => { p.moveTo(-34, 0); p.lineTo(-48, -4); p.lineTo(-36, 6); p.closePath(); }, 3.5);
    shape(ctx, '#8be0a6', (p) => p.ellipse(40, -6, 15, 12, 0, 0, TAU));
    shape(ctx, c.body, (p) => p.ellipse(-2, -2, 36, 25, 0, 0, TAU));
    ctx.save();
    ctx.beginPath(); ctx.ellipse(-2, -2, 36, 25, 0, 0, TAU); ctx.clip();
    ctx.strokeStyle = c.accent; ctx.lineWidth = 3;
    const hex = (x, y, r) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
      ctx.closePath(); ctx.stroke();
    };
    hex(-2, -4, 11);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; hex(-2 + Math.cos(a) * 21, -4 + Math.sin(a) * 18, 10); }
    shine(ctx, -10, -16, 14, 5);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(-2, -2, 36, 25, 0, 0, TAU); ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.stroke();
    flipper(16, 22, 17, 7, 0.6);
    flipper(-24, 20, 10, 5, -0.5);
    eye(ctx, 44, -10, 5.5);
    smile(ctx, 46, -2, 4, 0.1, 0.7);
    blush(ctx, 40, 0, 3.5);
  },
  octopus(ctx, c) {
    const legs = [[-24, 14], [-14, 18], [-4, 20], [6, 20], [16, 18], [26, 14]];
    ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      legs.forEach(([x, y], i) => {
        const swing = i % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x * 0.8, y - 6);
        ctx.bezierCurveTo(x * 1.1, y + 10, x * 1.25 + swing * 10, y + 22, x * 1.3 - swing * 4, y + 26);
        ctx.strokeStyle = pass ? c.body : OUTLINE;
        ctx.lineWidth = pass ? 8 : 13;
        ctx.stroke();
      });
    }
    ctx.fillStyle = c.accent;
    for (const [x, y] of legs) { ctx.beginPath(); ctx.arc(x * 1.2, y + 16, 2, 0, TAU); ctx.fill(); }
    shape(ctx, c.body, (p) => { p.moveTo(-32, 10); p.bezierCurveTo(-38, -44, 38, -44, 32, 10); p.quadraticCurveTo(0, 22, -32, 10); p.closePath(); });
    shine(ctx, -10, -22, 12, 6);
    ctx.fillStyle = c.accent;
    for (const [x, y] of [[14, -24], [22, -14], [-20, -14]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
    eye(ctx, -10, -4, 8);
    eye(ctx, 12, -4, 8);
    blush(ctx, -18, 7, 4); blush(ctx, 20, 7, 4);
    smile(ctx, 1, 5, 5);
  },
  jellyfish(ctx, c) {
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const x = -20 + i * 10;
      for (const pass of [0, 1]) {
        ctx.beginPath();
        ctx.moveTo(x, 6);
        ctx.bezierCurveTo(x - 8, 20, x + 8, 30, x - 2 + (i % 2 ? 6 : -6), 46);
        ctx.strokeStyle = pass ? c.accent : OUTLINE;
        ctx.lineWidth = pass ? 4 : 7;
        ctx.stroke();
      }
    }
    const bell = (p) => {
      p.moveTo(-32, 6);
      p.bezierCurveTo(-34, -42, 34, -42, 32, 6);
      for (let i = 0; i < 5; i++) {
        const x0 = 32 - i * 12.8;
        p.quadraticCurveTo(x0 - 6.4, 14, x0 - 12.8, 6);
      }
      p.closePath();
    };
    shape(ctx, c.body, bell);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath(); ctx.ellipse(0, -2, 22, 8, 0, 0, TAU); ctx.fill();
    shine(ctx, -14, -20, 9, 5);
    eye(ctx, -9, -10, 6);
    eye(ctx, 9, -10, 6);
    blush(ctx, -16, -1, 3.5); blush(ctx, 16, -1, 3.5);
    smile(ctx, 0, -4, 4);
  },
  seahorse(ctx, c) {
    ctx.lineCap = 'round';
    const tail = () => { ctx.beginPath(); ctx.moveTo(2, 20); ctx.bezierCurveTo(-6, 36, 0, 48, 12, 46); ctx.bezierCurveTo(22, 44, 20, 32, 11, 33); };
    tail(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 15; ctx.stroke();
    tail(); ctx.strokeStyle = c.body; ctx.lineWidth = 9; ctx.stroke();
    shape(ctx, c.accent, (p) => { p.moveTo(-6, -8); p.lineTo(-22, -16); p.lineTo(-22, 6); p.closePath(); }, 3);
    shape(ctx, c.body, (p) => {
      p.moveTo(4, -40);
      p.bezierCurveTo(20, -42, 26, -30, 20, -24);
      p.lineTo(40, -21); p.lineTo(40, -13); p.lineTo(17, -13);
      p.bezierCurveTo(26, 0, 22, 16, 8, 24);
      p.bezierCurveTo(-2, 28, -8, 14, -8, 0);
      p.bezierCurveTo(-16, -14, -12, -38, 4, -40);
      p.closePath();
    });
    ctx.fillStyle = c.accent;
    for (const [x, y] of [[0, -44], [-7, -38], [-11, -30]]) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y + 6); ctx.lineTo(x - 2, y + 8); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = c.accent; ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(8, -4 + i * 7, 9, -0.3, 0.9); ctx.stroke(); }
    shine(ctx, 2, -30, 7, 4);
    eye(ctx, 12, -26, 6);
    blush(ctx, 12, -16, 3);
  },
  starfish(ctx, c) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU;
      const r = i % 2 ? 17 : 38;
      pts.push([Math.cos(a) * r, Math.sin(a) * r + 4]);
    }
    const star = (p) => { pts.forEach(([x, y], i) => p[i ? 'lineTo' : 'moveTo'](x, y)); p.closePath(); };
    ctx.lineJoin = 'round';
    ctx.beginPath(); star(ctx); ctx.lineWidth = 16; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.beginPath(); star(ctx); ctx.lineWidth = 9; ctx.strokeStyle = c.body; ctx.stroke(); ctx.fillStyle = c.body; ctx.fill();
    ctx.fillStyle = c.accent;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * TAU;
      for (const r of [20, 29]) { ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r + 4, 2.4, 0, TAU); ctx.fill(); }
    }
    eye(ctx, -7, 0, 5.5);
    eye(ctx, 7, 0, 5.5);
    smile(ctx, 0, 6, 4);
    blush(ctx, -13, 9, 3); blush(ctx, 13, 9, 3);
  },
  ray(ctx, c) {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-24, 0); ctx.quadraticCurveTo(-44, 2, -62, 10);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = c.body; ctx.lineWidth = 2.5; ctx.stroke();
    shape(ctx, c.body, (p) => {
      p.moveTo(40, 0);
      p.bezierCurveTo(24, -8, 6, -42, -8, -42);
      p.bezierCurveTo(-14, -24, -22, -8, -28, 0);
      p.bezierCurveTo(-22, 8, -14, 24, -8, 42);
      p.bezierCurveTo(6, 42, 24, 8, 40, 0);
      p.closePath();
    });
    ctx.fillStyle = c.accent;
    for (const [x, y] of [[-4, -24], [-12, -12], [-4, 24], [-12, 12], [2, -34], [2, 34]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
    shine(ctx, 8, -14, 12, 5, -0.9);
    eye(ctx, 18, -9, 5.5);
    eye(ctx, 18, 9, 5.5);
    smile(ctx, 30, 0, 4, -0.35, 0.35);
  },
  dolphin(ctx, c) {
    shape(ctx, c.body, (p) => { p.moveTo(0, -16); p.bezierCurveTo(4, -34, -10, -36, -16, -15); p.closePath(); });
    shape(ctx, c.body, (p) => { p.moveTo(10, 8); p.lineTo(-2, 24); p.lineTo(18, 11); p.closePath(); }, 3.5);
    const body = (p) => {
      p.moveTo(56, 0);
      p.bezierCurveTo(50, -5, 42, -6, 36, -8);
      p.bezierCurveTo(24, -24, -12, -20, -32, -6);
      p.lineTo(-48, -18); p.lineTo(-42, 0); p.lineTo(-50, 14); p.lineTo(-32, 5);
      p.bezierCurveTo(-10, 16, 22, 14, 36, 5);
      p.bezierCurveTo(42, 3, 50, 4, 56, 0);
      p.closePath();
    };
    ctx.save();
    ctx.beginPath(); body(ctx); ctx.fillStyle = c.body; ctx.fill(); ctx.clip();
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.ellipse(10, 14, 36, 10, 0, 0, TAU); ctx.fill();
    shine(ctx, 6, -12, 18, 4, -0.1);
    ctx.restore();
    ctx.beginPath(); body(ctx); ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.stroke();
    eye(ctx, 32, -4, 5);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(54, 1); ctx.quadraticCurveTo(46, 5, 40, 3); ctx.stroke();
    blush(ctx, 34, 5, 3);
  },
  whale(ctx, c) {
    const body = (p) => {
      p.moveTo(52, 4);
      p.bezierCurveTo(52, -22, 20, -32, -10, -26);
      p.bezierCurveTo(-30, -22, -40, -12, -46, -4);
      p.lineTo(-60, -18); p.lineTo(-55, 0); p.lineTo(-62, 14); p.lineTo(-44, 6);
      p.bezierCurveTo(-30, 24, 22, 30, 52, 4);
      p.closePath();
    };
    ctx.save();
    ctx.beginPath(); body(ctx); ctx.fillStyle = c.body; ctx.fill(); ctx.clip();
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.ellipse(16, 22, 42, 15, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(29, 53, 87, 0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-6 + i * 12, 12); ctx.lineTo(4 + i * 12, 22); ctx.stroke(); }
    shine(ctx, 10, -18, 22, 5, -0.1);
    ctx.restore();
    ctx.beginPath(); body(ctx); ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.stroke();
    shape(ctx, c.body, (p) => { p.moveTo(6, 12); p.quadraticCurveTo(-6, 28, 10, 26); p.lineTo(20, 14); p.closePath(); }, 3.5);
    eye(ctx, 32, -2, 6);
    smile(ctx, 40, 4, 7, 0.1, 0.55);
    blush(ctx, 30, 8, 4);
  },
  narwhal(ctx, c) {
    ctx.save();
    ctx.translate(-8, 2);
    ctx.scale(0.86, 0.86);
    // the tusk
    ctx.beginPath(); ctx.moveTo(50, -6); ctx.lineTo(86, -20); ctx.lineTo(51, 0); ctx.closePath();
    ctx.fillStyle = c.accent; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) { const t = 0.2 + i * 0.2; ctx.beginPath(); ctx.moveTo(50 + 36 * t, -6 - 14 * t); ctx.lineTo(51 + 34 * t + 3, -14 * t + 1); ctx.stroke(); }
    PAINTERS.whale(ctx, { body: c.body, accent: '#eef3ff' });
    ctx.fillStyle = 'rgba(29, 53, 87, 0.28)';
    for (const [x, y] of [[-6, -18], [6, -22], [-20, -10], [18, -20], [-30, -2]]) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill(); }
    ctx.restore();
  },
};

export function paintCritter(ctx, id, x, y, scale = 1) {
  const c = CRITTERS[id];
  if (!c) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  PAINTERS[id](ctx, c);
  ctx.restore();
}

// Cached sprite of one critter, `height` CSS pixels tall at device scale.
const spriteCache = new Map();
export function critterSprite(id, height = 72, dpr = 1) {
  const k = `${id}:${height}:${dpr}`;
  if (!spriteCache.has(k)) {
    const s = (height / SPRITE_H) * dpr;
    const c = canvas(SPRITE_W * s, SPRITE_H * s);
    const ctx = c.getContext('2d');
    paintCritter(ctx, id, (SPRITE_W / 2) * s, (SPRITE_H / 2) * s, s);
    spriteCache.set(k, c);
  }
  return spriteCache.get(k);
}

// Draws a critter into a DOM canvas sized by CSS.
export function drawCritterIcon(el, id, cssWidth = 56) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssHeight = (cssWidth * SPRITE_H) / SPRITE_W;
  el.width = Math.round(cssWidth * dpr);
  el.height = Math.round(cssHeight * dpr);
  const ctx = el.getContext('2d');
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.drawImage(critterSprite(id, cssHeight, dpr), 0, 0, el.width, el.height);
}

// ------------------------------------------------------------- small sprites

function bubbleSprite(r) {
  const c = canvas(r * 2 + 4, r * 2 + 4);
  const ctx = c.getContext('2d');
  const cx = r + 2;
  const g = ctx.createRadialGradient(cx - r * 0.35, cx - r * 0.35, r * 0.1, cx, cx, r);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.85, 'rgba(200,245,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0.65)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cx, r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.ellipse(cx - r * 0.4, cx - r * 0.42, r * 0.22, r * 0.13, -0.7, 0, TAU); ctx.fill();
  return c;
}

function sparkleSprite(r, color) {
  const c = canvas(r * 2, r * 2);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * 0.28 : r;
    ctx[i ? 'lineTo' : 'moveTo'](r + Math.cos(a) * rr, r + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  return c;
}

function coinSprite(r) {
  const c = canvas(r * 2 + 2, r * 2 + 2);
  const ctx = c.getContext('2d');
  const cx = r + 1;
  const g = ctx.createRadialGradient(cx - r * 0.3, cx - r * 0.3, 1, cx, cx, r);
  g.addColorStop(0, '#fff6b8'); g.addColorStop(0.5, '#ffcf4a'); g.addColorStop(1, '#e09a12');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cx, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#c27c0e'; ctx.lineWidth = Math.max(1, r * 0.18); ctx.stroke();
  return c;
}

function fishSilhouette(color) {
  const c = canvas(40, 22);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(22, 11, 13, 7, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10, 11); ctx.lineTo(2, 4); ctx.lineTo(2, 18); ctx.closePath(); ctx.fill();
  return c;
}

// ------------------------------------------------------------------ the sea

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// Seeded random for the baked scenery so it doesn't jump on resize.
function sceneryRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Sea {
  constructor(el, { reduceMotion = false } = {}) {
    this.el = el;
    this.ctx = el.getContext('2d');
    this.reduceMotion = reduceMotion;
    this.zone = { hue: '#4fd6e8', sand: '#f6dca0' };
    this.zoneIndex = 0;
    this.time = 0;
    this.bubbles = [];
    this.swimmers = [];
    this.ambient = [];
    this.mode = 'calm';
    this.bubbleSprites = [bubbleSprite(5), bubbleSprite(9), bubbleSprite(15)];
    this.fishSprites = [fishSilhouette('rgba(10, 70, 110, 0.35)'), fishSilhouette('rgba(255, 255, 255, 0.22)')];
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.w = Math.max(1, window.innerWidth);
    this.h = Math.max(1, window.innerHeight);
    this.el.width = Math.round(this.w * this.dpr);
    this.el.height = Math.round(this.h * this.dpr);
    this.bake();
    const count = this.reduceMotion ? 8 : 26;
    this.bubbles = Array.from({ length: count }, (_, i) => this.newBubble(true, i));
    this.ambient = Array.from({ length: this.reduceMotion ? 2 : 6 }, (_, i) => ({
      x: Math.random() * this.w, y: this.h * (0.18 + Math.random() * 0.5), v: (14 + Math.random() * 20) * (i % 2 ? 1 : -1),
      sprite: this.fishSprites[i % 2], s: 0.7 + Math.random() * 0.6, phase: Math.random() * TAU,
    }));
    for (const s of this.swimmers) { s.x = Math.min(this.w - 20, Math.max(20, s.x)); s.y = Math.min(this.h * 0.85, s.y); s.home = Math.min(s.home, this.h * 0.82); }
  }

  setZone(zone, index) {
    if (zone === this.zone) return;
    this.zone = zone;
    this.zoneIndex = index;
    this.bake();
  }

  bake() {
    const w = Math.round(this.w * this.dpr), h = Math.round(this.h * this.dpr);
    const c = this.baked && this.baked.width === w && this.baked.height === h ? this.baked : canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const deep = this.zoneIndex >= 6;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mix(deep ? '#3aa6d8' : '#8ef0f8', this.zone.hue, 0.18));
    sky.addColorStop(0.35, mix(deep ? '#1a6fb0' : '#2cc3df', this.zone.hue, 0.22));
    sky.addColorStop(1, mix(deep ? '#0b2e66' : '#0a6aa0', this.zone.hue, 0.15));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const rand = sceneryRng(1234 + this.zoneIndex * 97);
    // light rays from the surface
    for (let i = 0; i < 6; i++) {
      const x = W * (0.05 + i * 0.18 + rand() * 0.06);
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.8);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 20, 0); ctx.lineTo(x + 30 + rand() * 30, 0);
      ctx.lineTo(x + 120 + rand() * 80, H * 0.8); ctx.lineTo(x + 20, H * 0.8);
      ctx.closePath(); ctx.fill();
    }
    // the surface shimmer
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let x = 0; x < W; x += 46) {
      ctx.beginPath(); ctx.ellipse(x + rand() * 20, 6 + rand() * 6, 22, 4, 0, 0, TAU); ctx.fill();
    }
    // far rocks
    ctx.fillStyle = 'rgba(8, 60, 110, 0.28)';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 40; x += 40) ctx.lineTo(x, H * 0.78 - Math.sin(x * 0.012 + this.zoneIndex) * 26 - rand() * 18);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // coral and rocks on the sand
    const coralColors = ['#ff7f9e', '#ffb35c', '#b48cff', '#ff6f61', '#5ee0b8'];
    const branches = (x, y, len, angle, depth, color) => {
      ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, depth * 2.6);
      const x2 = x + Math.cos(angle) * len, y2 = y + Math.sin(angle) * len;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      if (depth > 1) {
        branches(x2, y2, len * 0.72, angle - 0.45 - rand() * 0.2, depth - 1, color);
        branches(x2, y2, len * 0.72, angle + 0.45 + rand() * 0.2, depth - 1, color);
      } else {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x2, y2, 3, 0, TAU); ctx.fill();
      }
    };
    const n = Math.max(4, Math.round(W / 170));
    for (let i = 0; i < n; i++) {
      const x = (i + 0.3 + rand() * 0.4) * (W / n);
      const y = H * 0.9 + rand() * H * 0.03;
      const color = coralColors[(i + this.zoneIndex) % coralColors.length];
      const kind = (i + this.zoneIndex) % 3;
      if (kind === 0) branches(x, y, 26 + rand() * 18, -Math.PI / 2, 4, color);
      else if (kind === 1) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.ellipse(x, y, 26 + rand() * 10, 18 + rand() * 8, 0, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(x, y, 8 + k * 6, 5 + k * 4, 0, Math.PI, 0); ctx.stroke(); }
      } else {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(x - 4, y);
        ctx.quadraticCurveTo(x - 40, y - 50, x, y - 60); ctx.quadraticCurveTo(x + 40, y - 50, x + 4, y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
        for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + k * 9, y - 50 + Math.abs(k) * 4); ctx.stroke(); }
      }
    }
    // sand dunes
    const sand = ctx.createLinearGradient(0, H * 0.86, 0, H);
    sand.addColorStop(0, this.zone.sand);
    sand.addColorStop(1, mix(this.zone.sand.startsWith('#') ? this.zone.sand : '#f6dca0', '#c99a5a', 0.4));
    ctx.fillStyle = sand;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 30; x += 30) ctx.lineTo(x, H * 0.91 - Math.sin(x * 0.01 + 1) * 10 - Math.sin(x * 0.033) * 4);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < W / 30; i++) { ctx.beginPath(); ctx.arc(rand() * W, H * 0.93 + rand() * H * 0.06, 1 + rand() * 2, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(150, 100, 60, 0.25)';
    for (let i = 0; i < W / 60; i++) { ctx.beginPath(); ctx.ellipse(rand() * W, H * 0.94 + rand() * H * 0.05, 4 + rand() * 4, 2 + rand() * 2, 0, 0, TAU); ctx.fill(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.baked = c;
    // kelp strands drawn live (they sway)
    const krand = sceneryRng(77 + this.zoneIndex);
    const strands = Math.max(3, Math.round(W / 260));
    this.kelp = Array.from({ length: strands }, (_, i) => ({
      x: (i + 0.5 + (krand() - 0.5) * 0.6) * (W / strands),
      h: H * (0.22 + krand() * 0.2),
      phase: krand() * TAU,
      color: krand() < 0.5 ? 'rgba(40, 160, 110, 0.55)' : 'rgba(70, 190, 120, 0.5)',
    }));
  }

  newBubble(anywhere, i = 0) {
    const big = Math.random();
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : this.h + 20,
      v: 18 + Math.random() * 30,
      phase: Math.random() * TAU + i,
      sprite: this.bubbleSprites[big < 0.6 ? 0 : big < 0.9 ? 1 : 2],
    };
  }

  // A rescued critter joins the scene at a screen point and swims about.
  addSwimmer(id, x, y, { scale = 1, home = null } = {}) {
    const info = CRITTERS[id];
    const crawl = info.swim === 'crawl';
    const s = {
      id, x, y,
      home: crawl ? this.h * (0.9 + Math.random() * 0.04) : home ?? this.h * (0.25 + Math.random() * 0.5),
      dir: Math.random() < 0.5 ? -1 : 1,
      speed: (crawl ? 10 : info.swim === 'bob' ? 22 : 38) * (0.7 + Math.random() * 0.6),
      phase: Math.random() * TAU,
      size: 54 * info.size * scale,
      sprite: null,
      crawl,
      enter: 1,
    };
    s.sprite = critterSprite(id, Math.round(s.size), this.dpr);
    this.swimmers.push(s);
    if (this.swimmers.length > 30) this.swimmers.shift();
    return s;
  }

  clearSwimmers() { this.swimmers.length = 0; }

  // Fills the aquarium with a roster of critter ids.
  setRoster(ids, scale = 1.2) {
    this.clearSwimmers();
    ids.forEach((id, i) => {
      const depth = 0.75 + (i % 3) * 0.2;
      const s = this.addSwimmer(id, Math.random() * this.w, this.h * (0.2 + Math.random() * 0.55), { scale: scale * depth, home: this.h * (0.2 + ((i * 37) % 55) / 100) });
      s.enter = 0;
    });
  }

  update(dt) {
    this.time += dt;
    const W = this.w, H = this.h;
    for (const b of this.bubbles) {
      b.y -= b.v * dt;
      b.x += Math.sin(this.time * 1.6 + b.phase) * 8 * dt;
      if (b.y < -30) Object.assign(b, this.newBubble(false));
    }
    for (const f of this.ambient) {
      f.x += f.v * dt;
      if (f.x < -60) f.x = W + 40;
      if (f.x > W + 60) f.x = -40;
    }
    for (const s of this.swimmers) {
      s.enter = Math.max(0, s.enter - dt * 0.8);
      s.x += s.dir * s.speed * dt * (1 + s.enter * 1.5);
      s.y += (s.home - s.y) * Math.min(1, dt * (s.crawl ? 2 : 0.8));
      const margin = s.size * 0.7;
      if (s.x < margin && s.dir < 0) s.dir = 1;
      if (s.x > W - margin && s.dir > 0) s.dir = -1;
      if (!s.crawl && Math.random() < dt * 0.05) s.home = H * (0.2 + Math.random() * 0.55);
    }
  }

  draw() {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.baked, 0, 0);
    const t = this.time;
    // swaying kelp
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineCap = 'round';
    for (const k of this.kelp) {
      const sway = Math.sin(t * 0.9 + k.phase) * (this.reduceMotion ? 4 : 16);
      ctx.strokeStyle = k.color;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(k.x, this.h);
      ctx.quadraticCurveTo(k.x + sway, this.h - k.h * 0.5, k.x + sway * 1.6, this.h - k.h);
      ctx.stroke();
    }
    for (const f of this.ambient) {
      const y = f.y + Math.sin(t * 1.3 + f.phase) * 6;
      const sx = f.v < 0 ? -f.s : f.s;
      ctx.setTransform(d * sx, 0, 0, d * f.s, f.x * d, y * d);
      ctx.drawImage(f.sprite, -20, -11);
    }
    for (const s of this.swimmers) {
      const bob = s.crawl ? 0 : Math.sin(t * 2 + s.phase) * 5;
      const w = s.sprite.width / d, h = s.sprite.height / d;
      ctx.setTransform(d * s.dir, 0, 0, d, s.x * d, (s.y + bob) * d);
      ctx.drawImage(s.sprite, -w / 2, -h / 2, w, h);
    }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    for (const b of this.bubbles) ctx.drawImage(b.sprite, b.x, b.y);
  }
}

// ---------------------------------------------------------------- particles

const MAX_PARTICLES = 180;

export class Fx {
  constructor(el, { reduceMotion = false } = {}) {
    this.el = el;
    this.ctx = el.getContext('2d');
    this.reduceMotion = reduceMotion;
    this.parts = [];
    this.dirty = false;
    this.sprites = {
      gold: sparkleSprite(14, 'rgba(255, 210, 80, 0.9)'),
      aqua: sparkleSprite(14, 'rgba(120, 240, 255, 0.9)'),
      pink: sparkleSprite(14, 'rgba(255, 150, 200, 0.9)'),
      bubble: bubbleSprite(10),
      coin: coinSprite(9),
    };
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.el.width = Math.round(window.innerWidth * this.dpr);
    this.el.height = Math.round(window.innerHeight * this.dpr);
  }

  add(p) {
    if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
    this.parts.push(p);
  }

  burst(x, y, { count = 12, kinds = ['gold', 'aqua'], speed = 180, life = 0.8, gravity = 120, size = 1 } = {}) {
    const n = this.reduceMotion ? Math.ceil(count / 3) : count;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.add({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, g: gravity,
        life, max: life, s: size * (0.5 + Math.random() * 0.7), sprite: this.sprites[kinds[i % kinds.length]], spin: Math.random() * TAU,
      });
    }
  }

  bubbles(x, y, count = 8) {
    const n = this.reduceMotion ? 2 : count;
    for (let i = 0; i < n; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 30, y, vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 90, g: -30,
        life: 1.2, max: 1.2, s: 0.4 + Math.random() * 0.8, sprite: this.sprites.bubble, spin: 0,
      });
    }
  }

  // Coins that arc from one point to another (the coin counter).
  coins(from, to, count = 4) {
    const n = this.reduceMotion ? 1 : count;
    for (let i = 0; i < n; i++) {
      this.add({
        x: from.x, y: from.y, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, arc: true,
        delay: i * 0.08, life: 0.75, max: 0.75, s: 1, sprite: this.sprites.coin, spin: 0,
      });
    }
  }

  update(dt) {
    if (!this.parts.length) return;
    for (const p of this.parts) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.arc) {
        const k = 1 - p.life / p.max;
        const e = k * k * (3 - 2 * k);
        p.x = p.fromX + (p.toX - p.fromX) * e;
        p.y = p.fromY + (p.toY - p.fromY) * e - Math.sin(k * Math.PI) * 80;
      } else {
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.spin += dt * 4;
      }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
  }

  draw() {
    const ctx = this.ctx;
    if (!this.parts.length) {
      if (this.dirty) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.el.width, this.el.height); this.dirty = false; }
      return;
    }
    this.dirty = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    const d = this.dpr;
    for (const p of this.parts) {
      if (p.delay > 0) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = p.arc ? 1 : Math.min(1, k * 2);
      const s = p.s * d * (p.arc ? 1 : 0.6 + k * 0.4);
      const cos = Math.cos(p.spin) * s, sin = Math.sin(p.spin) * s;
      ctx.setTransform(cos, sin, -sin, cos, p.x * d, p.y * d);
      ctx.drawImage(p.sprite, -p.sprite.width / 2, -p.sprite.height / 2);
    }
    ctx.globalAlpha = 1;
  }
}
