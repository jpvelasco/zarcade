// Storybook drawing for critters, Detective Pip, outfits and icons. Every
// sprite is drawn once into an offscreen canvas and reused.

const INK = '#3a2a35';

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; } else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function path(ctx, fill, stroke = INK, lw = 3.2) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
}

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

function circle(ctx, x, y, r) { ellipse(ctx, x, y, r, r); }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// ------------------------------------------------------------------ faces

function eyes(ctx, x, y, gap, opts, size = 1) {
  const { blink = false, mood = 'happy' } = opts;
  for (const side of [-1, 1]) {
    const ex = x + side * gap;
    if (blink || mood === 'joy') {
      ctx.beginPath();
      ctx.arc(ex, y + 2, 6 * size, Math.PI * 1.1, Math.PI * 1.9);
      path(ctx, null, INK, 3.4);
      continue;
    }
    const surprised = mood === 'surprised';
    ellipse(ctx, ex, y, (surprised ? 7.5 : 6) * size, (surprised ? 9 : 8) * size);
    path(ctx, INK, null);
    circle(ctx, ex + 2 * size, y - 3 * size, 2.3 * size);
    path(ctx, '#fff', null);
    if (mood === 'sad') {
      ctx.beginPath();
      ctx.moveTo(ex - 7 * size * side, y - 14 * size);
      ctx.lineTo(ex + 6 * size * side, y - 11 * size);
      path(ctx, null, INK, 2.6);
    }
  }
}

function mouth(ctx, x, y, mood, w = 9) {
  ctx.beginPath();
  if (mood === 'surprised') { ellipse(ctx, x, y + 3, 4.5, 5.5); path(ctx, '#7a2b3a', INK, 2.4); return; }
  if (mood === 'sad') { ctx.arc(x, y + 8, w * 0.7, Math.PI * 1.15, Math.PI * 1.85); path(ctx, null, INK, 2.8); return; }
  if (mood === 'sheepish') {
    ctx.moveTo(x - w, y + 2); ctx.quadraticCurveTo(x - w / 2, y - 2, x, y + 2); ctx.quadraticCurveTo(x + w / 2, y + 6, x + w, y);
    path(ctx, null, INK, 2.8); return;
  }
  if (mood === 'joy') {
    ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y + w * 1.6, x + w, y); ctx.closePath();
    path(ctx, '#7a2b3a', INK, 2.6);
    ellipse(ctx, x, y + w * 0.75, w * 0.45, w * 0.28); path(ctx, '#ff8fa3', null);
    return;
  }
  ctx.arc(x, y - 2, w * 0.75, Math.PI * 0.2, Math.PI * 0.8);
  path(ctx, null, INK, 2.8);
}

function cheeks(ctx, x, y, gap, color = 'rgba(255,120,140,0.35)') {
  for (const side of [-1, 1]) { ellipse(ctx, x + side * gap, y, 8, 5); path(ctx, color, null); }
}

function nose(ctx, x, y, w = 7, color = INK) {
  ctx.beginPath();
  ctx.moveTo(x - w, y - 2); ctx.quadraticCurveTo(x, y - 5, x + w, y - 2); ctx.quadraticCurveTo(x, y + w, x - w, y - 2);
  path(ctx, color, INK, 2);
}

function whiskers(ctx, x, y, span = 30) {
  ctx.beginPath();
  for (const side of [-1, 1]) {
    for (const dy of [-3, 3]) { ctx.moveTo(x + side * 10, y + dy); ctx.lineTo(x + side * span, y + dy * 2.2); }
  }
  path(ctx, null, 'rgba(58,42,53,0.55)', 1.6);
}

// --------------------------------------------------------------- critters
//
// Head centred on (0, 0), radius about 50. `opts`: mood, blink, silhouette.

const HEADS = {
  rabbit(ctx, c, o) {
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * 20, -42); ctx.rotate(side * 0.16);
      ellipse(ctx, 0, -34, 14, 40); path(ctx, c.fur);
      ellipse(ctx, 0, -32, 7, 30); path(ctx, c.accent, null);
      ctx.restore();
    }
    ellipse(ctx, 0, 4, 50, 46); path(ctx, c.fur);
    ellipse(ctx, 0, 22, 24, 17); path(ctx, c.belly, null);
    eyes(ctx, 0, -2, 19, o);
    nose(ctx, 0, 14, 6, c.accent);
    mouth(ctx, 0, 24, o.mood, 8);
    if (o.mood !== 'surprised' && o.mood !== 'joy') { roundRect(ctx, -5, 22, 10, 8, 2); path(ctx, '#fff', INK, 2); }
    cheeks(ctx, 0, 16, 32);
  },
  duck(ctx, c, o) {
    ctx.beginPath(); ctx.moveTo(-6, -46); ctx.quadraticCurveTo(0, -66, 8, -48); ctx.quadraticCurveTo(14, -60, 16, -44); path(ctx, c.fur);
    ellipse(ctx, 0, 0, 48, 46); path(ctx, c.fur);
    eyes(ctx, 0, -10, 18, o);
    ellipse(ctx, 0, 16, 26, 11); path(ctx, c.accent);
    ctx.beginPath(); ctx.moveTo(-20, 16); ctx.quadraticCurveTo(0, 22, 20, 16); path(ctx, null, INK, 2);
    cheeks(ctx, 0, 6, 33);
  },
  goose(ctx, c, o) {
    ellipse(ctx, 0, 0, 44, 48); path(ctx, c.fur);
    eyes(ctx, 0, -10, 17, o, 0.9);
    // spectacles
    for (const side of [-1, 1]) { circle(ctx, side * 17, -10, 12); path(ctx, 'rgba(255,255,255,0.18)', '#8a5a2a', 2.6); }
    ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(5, -10); path(ctx, null, '#8a5a2a', 2.6);
    ctx.beginPath(); ctx.moveTo(-14, 10); ctx.quadraticCurveTo(0, 2, 14, 10); ctx.quadraticCurveTo(0, 34, -14, 10); path(ctx, c.accent);
    // bonnet
    ctx.beginPath(); ctx.arc(0, -8, 52, Math.PI * 1.05, Math.PI * 1.95); ctx.quadraticCurveTo(0, -40, -50, -22); path(ctx, '#b8d8ff');
    circle(ctx, 30, -42, 8); path(ctx, '#ff9fb2');
    cheeks(ctx, 0, 10, 28);
  },
  owl(ctx, c, o) {
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 22, -40); ctx.lineTo(side * 40, -64); ctx.lineTo(side * 44, -30); path(ctx, c.fur); }
    ellipse(ctx, 0, 0, 52, 48); path(ctx, c.fur);
    for (const side of [-1, 1]) { circle(ctx, side * 20, -6, 18); path(ctx, c.belly, null); }
    eyes(ctx, 0, -6, 20, o, 1.1);
    ctx.beginPath(); ctx.moveTo(-7, 10); ctx.lineTo(7, 10); ctx.lineTo(0, 22); ctx.closePath(); path(ctx, c.accent, INK, 2.4);
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) { ctx.moveTo(i * 10 - 4, 34); ctx.quadraticCurveTo(i * 10, 39, i * 10 + 4, 34); }
    path(ctx, null, shade(c.fur, -0.35), 2);
  },
  mouse(ctx, c, o) {
    for (const side of [-1, 1]) { circle(ctx, side * 38, -32, 26); path(ctx, c.fur); circle(ctx, side * 38, -32, 16); path(ctx, c.accent, null); }
    ellipse(ctx, 0, 6, 44, 42); path(ctx, c.fur);
    ellipse(ctx, 0, 24, 20, 14); path(ctx, c.belly, null);
    eyes(ctx, 0, 0, 17, o);
    circle(ctx, 0, 18, 6); path(ctx, c.accent);
    whiskers(ctx, 0, 20, 40);
    mouth(ctx, 0, 28, o.mood, 6);
    cheeks(ctx, 0, 16, 28);
  },
  fox(ctx, c, o) {
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 14, -36); ctx.lineTo(side * 40, -76); ctx.lineTo(side * 48, -20); path(ctx, c.fur);
      ctx.beginPath(); ctx.moveTo(side * 36, -64); ctx.lineTo(side * 40, -76); ctx.lineTo(side * 44, -60); path(ctx, c.accent, null);
    }
    ctx.beginPath(); ctx.moveTo(-50, -4); ctx.quadraticCurveTo(-46, -46, 0, -46); ctx.quadraticCurveTo(46, -46, 50, -4); ctx.quadraticCurveTo(40, 40, 0, 44); ctx.quadraticCurveTo(-40, 40, -50, -4); path(ctx, c.fur);
    ctx.beginPath(); ctx.moveTo(-46, 4); ctx.quadraticCurveTo(-20, 0, 0, 20); ctx.quadraticCurveTo(20, 0, 46, 4); ctx.quadraticCurveTo(36, 40, 0, 44); ctx.quadraticCurveTo(-36, 40, -46, 4); path(ctx, c.belly, null);
    eyes(ctx, 0, -8, 19, o);
    nose(ctx, 0, 20, 6);
    mouth(ctx, 0, 30, o.mood, 7);
  },
  bear(ctx, c, o) {
    for (const side of [-1, 1]) { circle(ctx, side * 38, -36, 16); path(ctx, c.fur); circle(ctx, side * 38, -36, 8); path(ctx, c.belly, null); }
    ellipse(ctx, 0, 2, 52, 48); path(ctx, c.fur);
    ellipse(ctx, 0, 20, 24, 18); path(ctx, c.belly);
    eyes(ctx, 0, -8, 20, o);
    nose(ctx, 0, 12, 9);
    mouth(ctx, 0, 26, o.mood, 8);
    cheeks(ctx, 0, 10, 34);
  },
  pig(ctx, c, o) {
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 20, -38); ctx.lineTo(side * 48, -48); ctx.lineTo(side * 40, -14); path(ctx, c.fur); }
    ellipse(ctx, 0, 2, 50, 46); path(ctx, c.fur);
    eyes(ctx, 0, -10, 20, o);
    ellipse(ctx, 0, 14, 18, 13); path(ctx, c.belly);
    for (const side of [-1, 1]) { ellipse(ctx, side * 6, 14, 3, 5); path(ctx, c.accent, null); }
    mouth(ctx, 0, 32, o.mood, 8);
    cheeks(ctx, 0, 8, 34, 'rgba(240,90,120,0.35)');
  },
  frog(ctx, c, o) {
    for (const side of [-1, 1]) { circle(ctx, side * 24, -30, 20); path(ctx, c.fur); }
    ellipse(ctx, 0, 6, 56, 40); path(ctx, c.fur);
    for (const side of [-1, 1]) { circle(ctx, side * 24, -30, 13); path(ctx, '#fff', null); }
    eyes(ctx, 0, -30, 24, o, 0.95);
    ellipse(ctx, 0, 24, 30, 12); path(ctx, c.belly, null);
    ctx.beginPath(); ctx.moveTo(-30, 10); ctx.quadraticCurveTo(0, o.mood === 'sad' ? 2 : 30, 30, 10); path(ctx, null, INK, 3);
    cheeks(ctx, 0, 6, 40);
  },
  hedgehog(ctx, c, o) {
    ctx.beginPath();
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * (0.95 + i * 1.1 / 14);
      const r = i % 2 ? 50 : 70;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.95 + 4);
    }
    ctx.closePath(); path(ctx, c.fur);
    ellipse(ctx, 0, 10, 42, 38); path(ctx, c.belly);
    for (const side of [-1, 1]) { circle(ctx, side * 30, -18, 9); path(ctx, c.belly); }
    eyes(ctx, 0, 2, 16, o);
    circle(ctx, 0, 18, 6); path(ctx, INK, null);
    mouth(ctx, 0, 28, o.mood, 6);
    cheeks(ctx, 0, 18, 26);
  },
  raccoon(ctx, c, o) {
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 16, -40); ctx.lineTo(side * 38, -66); ctx.lineTo(side * 46, -24); path(ctx, c.fur); }
    ellipse(ctx, 0, 2, 52, 46); path(ctx, c.fur);
    ctx.beginPath(); ctx.moveTo(-48, -8); ctx.quadraticCurveTo(-24, -26, 0, -8); ctx.quadraticCurveTo(24, -26, 48, -8); ctx.quadraticCurveTo(30, 12, 0, 2); ctx.quadraticCurveTo(-30, 12, -48, -8); path(ctx, c.accent, null);
    ellipse(ctx, 0, 22, 22, 15); path(ctx, c.belly, null);
    eyes(ctx, 0, -6, 20, o);
    nose(ctx, 0, 16, 7);
    mouth(ctx, 0, 28, o.mood, 7);
  },
  sheep(ctx, c, o) {
    for (const side of [-1, 1]) { ellipse(ctx, side * 44, -4, 18, 9, side * 0.4); path(ctx, '#f2e2cc'); }
    ctx.beginPath();
    for (let i = 0; i < 9; i++) { const a = Math.PI * (1 + i / 8); ctx.moveTo(Math.cos(a) * 40 + 14, Math.sin(a) * 34 - 22); ctx.arc(Math.cos(a) * 40, Math.sin(a) * 34 - 22, 14, 0, Math.PI * 2); }
    path(ctx, c.fur);
    ellipse(ctx, 0, 8, 36, 40); path(ctx, '#f2e2cc');
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const x = -24 + i * 12; ctx.moveTo(x + 12, -26); ctx.arc(x, -26, 12, 0, Math.PI * 2); }
    path(ctx, c.fur);
    eyes(ctx, 0, 4, 15, o);
    ellipse(ctx, 0, 24, 6, 4); path(ctx, '#d79a9a', null);
    mouth(ctx, 0, 32, o.mood, 6);
    cheeks(ctx, 0, 18, 22);
  },
  goat(ctx, c, o) {
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 12, -40); ctx.quadraticCurveTo(side * 30, -82, side * 44, -60); ctx.quadraticCurveTo(side * 30, -64, side * 24, -36); path(ctx, '#d8c49a');
      ellipse(ctx, side * 50, -10, 20, 9, side * 0.5); path(ctx, c.fur);
    }
    ctx.beginPath(); ctx.moveTo(-42, -10); ctx.quadraticCurveTo(-40, -48, 0, -48); ctx.quadraticCurveTo(40, -48, 42, -10); ctx.quadraticCurveTo(34, 38, 0, 40); ctx.quadraticCurveTo(-34, 38, -42, -10); path(ctx, c.fur);
    ctx.beginPath(); ctx.moveTo(-12, 34); ctx.quadraticCurveTo(0, 70, 12, 34); path(ctx, c.accent);
    eyes(ctx, 0, -8, 17, o);
    ellipse(ctx, 0, 16, 16, 11); path(ctx, c.belly, null);
    for (const side of [-1, 1]) { ellipse(ctx, side * 5, 14, 2.4, 3.4); path(ctx, INK, null); }
    mouth(ctx, 0, 26, o.mood, 6);
  },
  squirrel(ctx, c, o) {
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 16, -38); ctx.lineTo(side * 34, -72); ctx.lineTo(side * 44, -28); path(ctx, c.fur);
      ctx.beginPath(); ctx.moveTo(side * 30, -70); ctx.lineTo(side * 36, -84); ctx.lineTo(side * 40, -68); path(ctx, c.accent, null);
    }
    ellipse(ctx, 0, 4, 48, 44); path(ctx, c.fur);
    for (const side of [-1, 1]) { ellipse(ctx, side * 22, 18, 18, 14); path(ctx, c.belly, null); }
    eyes(ctx, 0, -6, 18, o);
    nose(ctx, 0, 14, 5);
    mouth(ctx, 0, 24, o.mood, 6);
    if (o.mood !== 'surprised') { roundRect(ctx, -4, 22, 8, 7, 2); path(ctx, '#fff', INK, 1.8); }
  },
  turtle(ctx, c, o) {
    ellipse(ctx, 0, 6, 44, 44); path(ctx, c.fur);
    ellipse(ctx, 0, 24, 26, 14); path(ctx, c.belly, null);
    eyes(ctx, 0, -6, 18, { ...o, mood: o.mood === 'happy' ? 'happy' : o.mood }, 0.9);
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * 18, -9, 9, Math.PI * 1.15, Math.PI * 1.85); path(ctx, null, shade(c.fur, -0.4), 2.2); }
    mouth(ctx, 0, 24, o.mood, 9);
    cheeks(ctx, 0, 12, 28);
    // a tiny party bow
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(-16, -52); ctx.lineTo(-16, -30); ctx.closePath(); ctx.moveTo(0, -40); ctx.lineTo(16, -52); ctx.lineTo(16, -30); ctx.closePath(); path(ctx, '#ff8fb8');
    circle(ctx, 0, -40, 5); path(ctx, '#ff6f9f');
  },
  badger(ctx, c, o) {
    for (const side of [-1, 1]) { circle(ctx, side * 38, -28, 12); path(ctx, c.accent); }
    ellipse(ctx, 0, 4, 50, 44); path(ctx, c.fur);
    ctx.beginPath(); ctx.moveTo(-10, -40); ctx.quadraticCurveTo(0, -44, 10, -40); ctx.lineTo(8, 20); ctx.lineTo(-8, 20); ctx.closePath(); path(ctx, c.belly, null);
    for (const side of [-1, 1]) { ellipse(ctx, side * 26, -6, 12, 22, side * -0.3); path(ctx, c.accent, null); }
    ellipse(ctx, 0, 24, 22, 14); path(ctx, c.belly, null);
    eyes(ctx, 0, -6, 22, o, 0.9);
    for (const side of [-1, 1]) { circle(ctx, side * 22 + 2, -9, 2); path(ctx, '#fff', null); }
    nose(ctx, 0, 18, 7);
    mouth(ctx, 0, 30, o.mood, 6);
  },
  cat(ctx, c, o) {
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 12, -38); ctx.lineTo(side * 38, -70); ctx.lineTo(side * 46, -22); path(ctx, c.fur);
      ctx.beginPath(); ctx.moveTo(side * 22, -38); ctx.lineTo(side * 36, -58); ctx.lineTo(side * 40, -30); path(ctx, c.belly, null);
    }
    ellipse(ctx, 0, 4, 50, 44); path(ctx, c.fur);
    ellipse(ctx, 0, 22, 20, 14); path(ctx, c.belly, null);
    if (!o.blink && o.mood !== 'joy') {
      for (const side of [-1, 1]) { ellipse(ctx, side * 19, -4, 9, 10); path(ctx, c.accent, INK, 2.4); }
    }
    eyes(ctx, 0, -4, 19, o, 0.75);
    nose(ctx, 0, 14, 5, '#ff9fb2');
    whiskers(ctx, 0, 18, 46);
    mouth(ctx, 0, 24, o.mood, 6);
  },
  mole(ctx, c, o) {
    ellipse(ctx, 0, 6, 48, 46); path(ctx, c.fur);
    ellipse(ctx, 0, 22, 26, 18); path(ctx, shade(c.fur, 0.15), null);
    for (const side of [-1, 1]) { circle(ctx, side * 18, -8, 12); path(ctx, 'rgba(255,255,255,0.25)', '#d9b04a', 3); }
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(6, -8); path(ctx, null, '#d9b04a', 3);
    eyes(ctx, 0, -8, 18, o, 0.55);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.moveTo(0, 16); ctx.lineTo(Math.cos(a) * 10, 16 + Math.sin(a) * 8); }
    path(ctx, null, c.accent, 5);
    circle(ctx, 0, 16, 6); path(ctx, c.belly, INK, 2);
    mouth(ctx, 0, 30, o.mood, 6);
  },
  beagle(ctx, c, o) {
    // Pip: long floppy ears, white blaze and muzzle, tan head.
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * 40, -18); ctx.rotate(side * -0.22 + (o.earWag || 0) * side);
      ellipse(ctx, side * 6, 30, 18, 38); path(ctx, '#7a4a28');
      ctx.restore();
    }
    ellipse(ctx, 0, 0, 46, 46); path(ctx, '#c98a4a');
    ctx.beginPath(); ctx.moveTo(-8, -46); ctx.quadraticCurveTo(0, -20, -6, 0); ctx.lineTo(6, 0); ctx.quadraticCurveTo(0, -20, 8, -46); path(ctx, '#fff6ea', null);
    ellipse(ctx, 0, 22, 28, 20); path(ctx, '#fff6ea', null);
    eyes(ctx, 0, -6, 18, o);
    ellipse(ctx, 0, 12, 10, 7); path(ctx, INK, null);
    circle(ctx, -3, 10, 2.4); path(ctx, '#fff', null);
    mouth(ctx, 0, 24, o.mood, 8);
    if (o.mood === 'happy' || o.mood === 'joy') { ellipse(ctx, 6, 31, 5, 7); path(ctx, '#ff8fa3', INK, 2); }
    cheeks(ctx, 0, 14, 30);
  },
};

const BIRDS = new Set(['duck', 'goose', 'owl']);

// A standing body below the head, with species extras (tails, wings, shell).
function body(ctx, c, o) {
  const sp = c.species;
  const coat = o.coat;
  // tail behind
  if (sp === 'fox' || sp === 'squirrel' || sp === 'raccoon') {
    ctx.save(); ctx.translate(36, 120); ctx.rotate(sp === 'squirrel' ? -0.5 : -0.9);
    ellipse(ctx, 0, -30, sp === 'squirrel' ? 30 : 22, sp === 'squirrel' ? 56 : 44); path(ctx, c.fur);
    if (sp === 'fox') { ellipse(ctx, 0, -66, 12, 14); path(ctx, c.belly, null); }
    if (sp === 'raccoon') { for (let i = 0; i < 3; i++) { ellipse(ctx, 0, -50 + i * 22, 20, 5); path(ctx, c.accent, null); } }
    if (sp === 'squirrel') { ellipse(ctx, 0, -30, 18, 40); path(ctx, shade(c.fur, 0.2), null); }
    ctx.restore();
  }
  if (sp === 'cat' || sp === 'mouse') {
    ctx.beginPath(); ctx.moveTo(30, 140); ctx.quadraticCurveTo(80, 130, 70, 80); path(ctx, null, sp === 'mouse' ? c.accent : INK, sp === 'mouse' ? 5 : 12);
    if (sp === 'cat') { ctx.beginPath(); ctx.moveTo(30, 140); ctx.quadraticCurveTo(80, 130, 70, 80); path(ctx, null, c.fur, 7); }
  }
  if (sp === 'turtle') { ellipse(ctx, 0, 100, 60, 52); path(ctx, c.accent); ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(i * 30, 60); ctx.lineTo(i * 34, 140); } path(ctx, null, shade(c.accent, -0.3), 3); }
  // capes hang behind the body
  if (coat === 'cape' || coat === 'starry') {
    ctx.beginPath(); ctx.moveTo(-30, 52); ctx.quadraticCurveTo(-70, 110, -62, 156); ctx.quadraticCurveTo(0, 170, 62, 156); ctx.quadraticCurveTo(70, 110, 30, 52); ctx.closePath(); path(ctx, COAT_COLORS[coat]);
    if (coat === 'starry') { ctx.fillStyle = '#ffe680'; for (const [x, y] of [[-50, 130], [48, 120], [-42, 92], [44, 148]]) { star(ctx, x, y, 6); ctx.fill(); } }
  }
  // feet
  for (const side of [-1, 1]) {
    ellipse(ctx, side * 20, 150, BIRDS.has(sp) || sp === 'frog' ? 18 : 16, 9);
    path(ctx, BIRDS.has(sp) ? (c.species === 'owl' ? '#ffcf3f' : c.accent) : sp === 'frog' ? c.fur : shade(c.fur, -0.15));
  }
  // torso
  ctx.beginPath(); ctx.moveTo(-26, 50); ctx.quadraticCurveTo(-46, 110, -34, 146); ctx.quadraticCurveTo(0, 158, 34, 146); ctx.quadraticCurveTo(46, 110, 26, 50); ctx.closePath();
  path(ctx, c.fur);
  ellipse(ctx, 0, 110, 22, 30); path(ctx, c.belly, null);
  if (coat) drawCoat(ctx, coat);
  // arms / wings
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 31, 66); ctx.rotate(o.wave && side > 0 ? -2.3 : -side * 0.28);
    if (BIRDS.has(sp)) { ellipse(ctx, 0, 24, 13, 30); path(ctx, shade(c.fur, -0.08)); } else { ellipse(ctx, 0, 22, 10, 24); path(ctx, coat && coat !== 'cape' && coat !== 'starry' ? COAT_COLORS[coat] : c.fur); ellipse(ctx, 0, 42, 9, 8); path(ctx, sp === 'frog' ? c.fur : shade(c.fur, -0.1)); }
    ctx.restore();
  }
  if (c.id === 'sheep') {
    ctx.beginPath(); ctx.moveTo(-28, 52); ctx.quadraticCurveTo(0, 66, 28, 52); ctx.lineTo(26, 62); ctx.quadraticCurveTo(0, 76, -26, 62); ctx.closePath(); path(ctx, '#e8524a');
    roundRect(ctx, 10, 60, 12, 36, 4); path(ctx, '#e8524a');
  }
}

const COAT_COLORS = { trench: '#c9a46a', raincoat: '#ffd23f', plaid: '#d9534f', sweater: '#6fb7ff', cape: '#e8524a', starry: '#3b3f8f' };

function drawCoat(ctx, coat) {
  const col = COAT_COLORS[coat];
  if (coat === 'cape' || coat === 'starry') {
    // the cape itself is drawn behind the body; this is the collar and clasp
    ctx.beginPath(); ctx.moveTo(-30, 52); ctx.quadraticCurveTo(0, 70, 30, 52); ctx.lineTo(28, 62); ctx.quadraticCurveTo(0, 80, -28, 62); ctx.closePath(); path(ctx, col);
    circle(ctx, 0, 70, 6); path(ctx, '#ffd23f');
    return;
  }
  ctx.beginPath(); ctx.moveTo(-28, 50); ctx.quadraticCurveTo(-48, 110, -36, 148); ctx.quadraticCurveTo(0, 156, 36, 148); ctx.quadraticCurveTo(48, 110, 28, 50); ctx.closePath(); path(ctx, col);
  if (coat === 'plaid') {
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(40,20,30,0.25)';
    for (let x = -50; x < 50; x += 16) ctx.fillRect(x, 40, 5, 120);
    for (let y = 50; y < 160; y += 16) ctx.fillRect(-50, y, 100, 5);
    ctx.restore();
  }
  if (coat === 'sweater') { ctx.beginPath(); for (let y = 70; y < 150; y += 18) { ctx.moveTo(-36, y); ctx.lineTo(36, y); } path(ctx, null, 'rgba(255,255,255,0.45)', 3); }
  // lapels and buttons
  ctx.beginPath(); ctx.moveTo(-18, 52); ctx.lineTo(0, 92); ctx.lineTo(18, 52); path(ctx, shade(col, -0.18));
  for (const y of [102, 120, 138]) { circle(ctx, 0, y, 3.5); path(ctx, shade(col, -0.45), null); }
  if (coat === 'trench') { roundRect(ctx, -38, 112, 76, 9, 3); path(ctx, shade(col, -0.25)); }
}

export function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// Hats sit on a head of radius ~46 centred on (0, 0).
export function drawHat(ctx, hat) {
  switch (hat) {
    case 'deerstalker':
      ctx.beginPath(); ctx.ellipse(0, -36, 44, 30, 0, Math.PI, 0); ctx.closePath(); path(ctx, '#a8865a');
      ctx.beginPath(); ctx.moveTo(-44, -36); ctx.quadraticCurveTo(-62, -30, -58, -22); ctx.lineTo(-38, -32); path(ctx, '#8a6a42');
      ctx.beginPath(); ctx.moveTo(44, -36); ctx.quadraticCurveTo(62, -30, 58, -22); ctx.lineTo(38, -32); path(ctx, '#8a6a42');
      ctx.save(); ctx.beginPath(); ctx.ellipse(0, -36, 44, 30, 0, Math.PI, 0); ctx.clip();
      ctx.strokeStyle = 'rgba(70,40,20,0.35)'; ctx.lineWidth = 3;
      for (let x = -50; x < 50; x += 12) { ctx.beginPath(); ctx.moveTo(x, -70); ctx.lineTo(x + 30, -30); ctx.stroke(); }
      ctx.restore();
      circle(ctx, 0, -66, 6); path(ctx, '#8a6a42');
      break;
    case 'bowler':
      ellipse(ctx, 0, -36, 54, 10); path(ctx, '#3a3a48');
      ctx.beginPath(); ctx.ellipse(0, -40, 36, 34, 0, Math.PI, 0); ctx.closePath(); path(ctx, '#3a3a48');
      roundRect(ctx, -36, -46, 72, 8, 2); path(ctx, '#d9534f', null);
      break;
    case 'beret':
      ellipse(ctx, 6, -44, 50, 22, 0.15); path(ctx, '#d9534f');
      ctx.beginPath(); ctx.moveTo(6, -66); ctx.lineTo(8, -76); path(ctx, null, INK, 4);
      break;
    case 'cowboy':
      ctx.beginPath(); ctx.moveTo(-70, -38); ctx.quadraticCurveTo(0, -18, 70, -38); ctx.quadraticCurveTo(0, -30, -70, -38); path(ctx, '#b07a3a');
      ctx.beginPath(); ctx.moveTo(-34, -36); ctx.quadraticCurveTo(-36, -84, -12, -76); ctx.quadraticCurveTo(0, -66, 12, -76); ctx.quadraticCurveTo(36, -84, 34, -36); ctx.closePath(); path(ctx, '#c98a4a');
      roundRect(ctx, -34, -46, 68, 8, 2); path(ctx, '#7a4a28', null);
      break;
    case 'top':
      ellipse(ctx, 0, -38, 52, 10); path(ctx, '#2a2a36');
      roundRect(ctx, -30, -112, 60, 76, 6); path(ctx, '#2a2a36');
      roundRect(ctx, -30, -56, 60, 12, 2); path(ctx, '#a97ae0', null);
      break;
    case 'party':
      ctx.beginPath(); ctx.moveTo(-28, -36); ctx.lineTo(4, -112); ctx.lineTo(30, -36); ctx.closePath(); path(ctx, '#6fd3ff');
      ctx.save(); ctx.clip(); ctx.fillStyle = '#ff86b8';
      for (let y = -110; y < -30; y += 22) ctx.fillRect(-40, y, 80, 9);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-28, -36); ctx.lineTo(4, -112); ctx.lineTo(30, -36); ctx.closePath(); path(ctx, null);
      circle(ctx, 4, -114, 9); path(ctx, '#ffd23f');
      break;
    case 'propeller':
      ctx.beginPath(); ctx.ellipse(0, -36, 40, 30, 0, Math.PI, 0); ctx.closePath(); path(ctx, '#ffd23f');
      ctx.beginPath(); ctx.moveTo(-40, -36); ctx.ellipse(0, -36, 40, 30, 0, Math.PI, Math.PI * 1.33); ctx.lineTo(0, -36); ctx.closePath(); path(ctx, '#e8524a', null);
      ctx.beginPath(); ctx.moveTo(0, -66); ctx.lineTo(0, -78); path(ctx, null, INK, 4);
      ellipse(ctx, -16, -80, 18, 5); path(ctx, '#6fb7ff');
      ellipse(ctx, 16, -80, 18, 5); path(ctx, '#5fc98c');
      break;
    case 'pirate':
      ctx.beginPath(); ctx.moveTo(-60, -34); ctx.quadraticCurveTo(-40, -96, 0, -84); ctx.quadraticCurveTo(40, -96, 60, -34); ctx.quadraticCurveTo(0, -48, -60, -34); path(ctx, '#2a2a36');
      ctx.beginPath(); ctx.moveTo(-56, -38); ctx.quadraticCurveTo(0, -52, 56, -38); path(ctx, null, '#ffd23f', 4);
      circle(ctx, 0, -66, 9); path(ctx, '#fff');
      ctx.beginPath(); ctx.moveTo(-4, -60); ctx.lineTo(4, -60); path(ctx, null, INK, 2);
      break;
    case 'crown':
      ctx.beginPath(); ctx.moveTo(-34, -36); ctx.lineTo(-38, -80); ctx.lineTo(-18, -60); ctx.lineTo(0, -88); ctx.lineTo(18, -60); ctx.lineTo(38, -80); ctx.lineTo(34, -36); ctx.closePath(); path(ctx, '#ffd23f');
      for (const [x, y, col] of [[-20, -48, '#e8524a'], [0, -50, '#6fb7ff'], [20, -48, '#5fc98c']]) { circle(ctx, x, y, 5); path(ctx, col, INK, 2); }
      break;
    default: break;
  }
}

function magnifier(ctx, x, y, r = 22) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.6);
  roundRect(ctx, -5, r - 2, 10, 34, 4); path(ctx, '#7a4a28');
  circle(ctx, 0, 0, r); path(ctx, 'rgba(190,230,255,0.55)', '#c99a3a', 6);
  ctx.beginPath(); ctx.arc(-6, -6, r * 0.55, Math.PI * 1.1, Math.PI * 1.5); path(ctx, null, 'rgba(255,255,255,0.9)', 3);
  ctx.restore();
}

// Draw a critter or Pip at the origin (head centre). kind 'head' or 'body'.
export function drawCritter(ctx, c, opts = {}) {
  const o = { mood: 'happy', ...opts };
  ctx.save();
  if (o.silhouette) {
    // Draw into the current canvas, then flood it with one colour below.
    ctx.globalCompositeOperation = 'source-over';
  }
  if (o.kind === 'body') body(ctx, c, o);
  HEADS[c.species](ctx, c, o);
  if (c.species === 'beagle' && o.hat) drawHat(ctx, o.hat);
  if (c.species === 'beagle' && o.kind === 'body' && o.glass !== false) magnifier(ctx, -46, 96, 24);
  ctx.restore();
}

export const PIP_CRITTER = { id: 'pip', species: 'beagle', fur: '#c98a4a', belly: '#fff6ea', accent: '#7a4a28' };

// Bake a critter to a canvas. Returns { canvas, ox, oy, scale } where (ox, oy)
// is the head centre inside the canvas, in canvas pixels.
export function bakeCritter(c, px, opts = {}) {
  const kind = opts.kind || 'head';
  // Logical bounds around the head centre.
  const box = kind === 'body' ? { x: -110, y: -130, w: 220, h: 300 } : { x: -90, y: -120, w: 180, h: 200 };
  if (opts.hat === 'top' || opts.hat === 'party') { box.y -= 20; box.h += 20; }
  const scale = px / box.h;
  const canvas = makeCanvas(box.w * scale, box.h * scale);
  const ctx = canvas.getContext('2d');
  ctx.translate(-box.x * scale, -box.y * scale);
  ctx.scale(scale, scale);
  drawCritter(ctx, c, { ...opts, kind });
  if (opts.silhouette) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = opts.silhouette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (kind === 'head' && opts.trim !== false) return trimmed(canvas, -box.x * scale, -box.y * scale, scale);
  return { canvas, ox: -box.x * scale, oy: -box.y * scale, scale };
}

// Crop a baked head to its drawn pixels so portraits fill their frames.
function trimmed(canvas, ox, oy, scale) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { canvas, ox, oy, scale };
  const pad = 2;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(canvas, -x0, -y0);
  return { canvas: out, ox: ox - x0, oy: oy - y0, scale };
}

// --------------------------------------------------------------- icons
//
// Icons draw in a 100×100 box centred on (0, 0).

export const PLACE_COLORS = {
  bakery: '#ffb36b', pond: '#6fc3ff', windmill: '#f2d06b', bandstand: '#ff86b8', library: '#a97ae0', garden: '#7fd36b',
  market: '#ff9b5c', townhall: '#c9a46a', school: '#e8524a', orchard: '#5fc98c', station: '#8aa4c8', icecream: '#ffc0d9',
};

export function drawPlaceIcon(ctx, id) {
  const col = PLACE_COLORS[id] || '#ccc';
  circle(ctx, 0, 0, 46); path(ctx, shade(col, 0.55), null);
  switch (id) {
    case 'bakery':
      ctx.beginPath(); ctx.moveTo(-34, 10); ctx.quadraticCurveTo(-30, -26, 0, -26); ctx.quadraticCurveTo(30, -26, 34, 10); ctx.quadraticCurveTo(0, 22, -34, 10); path(ctx, '#e9a35a');
      ctx.beginPath(); for (const x of [-16, 0, 16]) { ctx.moveTo(x - 6, -16); ctx.lineTo(x + 6, 0); } path(ctx, null, '#a8652a', 4);
      break;
    case 'pond':
      ellipse(ctx, 0, 14, 40, 18); path(ctx, '#6fc3ff');
      ctx.save(); ctx.translate(0, -4); ctx.scale(0.42, 0.42); HEADS.duck(ctx, { fur: '#ffd84d', belly: '#fff2a8', accent: '#ff9b2f' }, { mood: 'happy' }); ctx.restore();
      break;
    case 'windmill':
      roundRect(ctx, -12, -10, 24, 46, 4); path(ctx, '#f2d06b');
      ctx.save(); ctx.translate(0, -12);
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); roundRect(ctx, -5, -38, 10, 34, 3); path(ctx, '#fff'); }
      ctx.restore(); circle(ctx, 0, -12, 5); path(ctx, '#a8652a');
      break;
    case 'bandstand':
      ctx.beginPath(); ctx.moveTo(-38, -6); ctx.lineTo(0, -36); ctx.lineTo(38, -6); ctx.closePath(); path(ctx, '#ff86b8');
      for (const x of [-30, 0, 30]) { roundRect(ctx, x - 3, -6, 6, 34, 2); path(ctx, '#fff'); }
      roundRect(ctx, -40, 26, 80, 10, 3); path(ctx, '#c9a46a');
      break;
    case 'library':
      for (const [x, h, c] of [[-26, 54, '#a97ae0'], [-8, 62, '#6fb7ff'], [10, 50, '#5fc98c'], [26, 58, '#ff9b5c']]) { roundRect(ctx, x - 8, 30 - h, 16, h, 3); path(ctx, c); }
      break;
    case 'garden':
      for (const [x, y, c] of [[-20, -6, '#ff86b8'], [16, -14, '#ffd23f'], [0, 12, '#a97ae0']]) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, 34); path(ctx, null, '#3f9a3a', 4);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ellipse(ctx, x + Math.cos(a) * 9, y + Math.sin(a) * 9, 7, 7); path(ctx, c, INK, 2); }
        circle(ctx, x, y, 5); path(ctx, '#ffcf3f', INK, 2);
      }
      break;
    case 'market':
      roundRect(ctx, -36, -10, 72, 40, 4); path(ctx, '#e8c48a');
      ctx.beginPath(); ctx.moveTo(-42, -10); ctx.lineTo(-34, -34); ctx.lineTo(34, -34); ctx.lineTo(42, -10); ctx.closePath(); path(ctx, '#ff9b5c');
      ctx.save(); ctx.beginPath(); ctx.moveTo(-42, -10); ctx.lineTo(-34, -34); ctx.lineTo(34, -34); ctx.lineTo(42, -10); ctx.closePath(); ctx.clip();
      ctx.fillStyle = '#fff'; for (let x = -36; x < 40; x += 20) ctx.fillRect(x, -36, 10, 30); ctx.restore();
      for (const [x, c] of [[-20, '#e8524a'], [0, '#7fd36b'], [20, '#ffd23f']]) { circle(ctx, x, 6, 8); path(ctx, c, INK, 2); }
      break;
    case 'townhall':
      ctx.beginPath(); ctx.moveTo(-40, -8); ctx.lineTo(0, -36); ctx.lineTo(40, -8); ctx.closePath(); path(ctx, '#c9a46a');
      roundRect(ctx, -34, -8, 68, 40, 2); path(ctx, '#f2e2cc');
      for (const x of [-22, -8, 8, 22]) { roundRect(ctx, x - 3, -4, 6, 34, 1); path(ctx, '#fff', INK, 2); }
      circle(ctx, 0, -18, 6); path(ctx, '#fff', INK, 2);
      break;
    case 'school':
      roundRect(ctx, -32, -12, 64, 44, 3); path(ctx, '#e8524a');
      ctx.beginPath(); ctx.moveTo(-38, -12); ctx.lineTo(0, -34); ctx.lineTo(38, -12); ctx.closePath(); path(ctx, '#7a4a28');
      roundRect(ctx, -8, 8, 16, 24, 2); path(ctx, '#fff3c4');
      ctx.beginPath(); ctx.arc(0, -16, 6, Math.PI, 0); ctx.closePath(); path(ctx, '#ffd23f', INK, 2);
      break;
    case 'orchard':
      roundRect(ctx, -6, 4, 12, 32, 3); path(ctx, '#8a5a32');
      circle(ctx, 0, -12, 32); path(ctx, '#5fc98c');
      for (const [x, y] of [[-14, -18], [12, -22], [2, -2], [-18, 2], [18, 0]]) { circle(ctx, x, y, 6); path(ctx, '#e8524a', INK, 2); }
      break;
    case 'station':
      roundRect(ctx, -38, -8, 52, 32, 6); path(ctx, '#6fb7ff');
      roundRect(ctx, 10, -24, 28, 48, 6); path(ctx, '#e8524a');
      roundRect(ctx, -30, -2, 14, 12, 2); path(ctx, '#fff3c4', INK, 2);
      roundRect(ctx, 16, -18, 16, 14, 2); path(ctx, '#fff3c4', INK, 2);
      for (const x of [-26, -2, 24]) { circle(ctx, x, 28, 7); path(ctx, '#3a3a48'); }
      break;
    case 'icecream':
      ctx.beginPath(); ctx.moveTo(-16, -2); ctx.lineTo(0, 38); ctx.lineTo(16, -2); ctx.closePath(); path(ctx, '#e9b46a');
      circle(ctx, -8, -12, 14); path(ctx, '#ffc0d9');
      circle(ctx, 8, -14, 14); path(ctx, '#bff0d0');
      circle(ctx, 0, -28, 13); path(ctx, '#fff3c4');
      circle(ctx, 0, -42, 5); path(ctx, '#e8524a');
      break;
    default: break;
  }
}

export function drawThingIcon(ctx, id) {
  switch (id) {
    case 'kite':
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(26, -6); ctx.lineTo(0, 22); ctx.lineTo(-26, -6); ctx.closePath(); path(ctx, '#ff86b8');
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(0, 22); ctx.moveTo(-26, -6); ctx.lineTo(26, -6); path(ctx, null, INK, 2);
      ctx.beginPath(); ctx.moveTo(0, 22); ctx.quadraticCurveTo(10, 32, 0, 40); ctx.quadraticCurveTo(-10, 46, 4, 50); path(ctx, null, INK, 2.4);
      break;
    case 'umbrella':
      ctx.beginPath(); ctx.arc(0, -4, 36, Math.PI, 0); ctx.quadraticCurveTo(24, -12, 12, -4); ctx.quadraticCurveTo(0, -12, -12, -4); ctx.quadraticCurveTo(-24, -12, -36, -4); path(ctx, '#6fb7ff');
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 30); ctx.quadraticCurveTo(0, 40, -10, 36); path(ctx, null, INK, 4);
      break;
    case 'basket':
      ctx.beginPath(); ctx.arc(0, -4, 24, Math.PI, 0); path(ctx, null, '#a8652a', 5);
      ctx.beginPath(); ctx.moveTo(-32, -4); ctx.lineTo(32, -4); ctx.lineTo(24, 30); ctx.lineTo(-24, 30); ctx.closePath(); path(ctx, '#e3b26a');
      ctx.beginPath(); for (const y of [6, 18]) { ctx.moveTo(-30, y); ctx.lineTo(30, y); } path(ctx, null, '#a8652a', 2);
      break;
    case 'ladder':
      ctx.beginPath(); ctx.moveTo(-16, -40); ctx.lineTo(-20, 40); ctx.moveTo(16, -40); ctx.lineTo(20, 40); path(ctx, null, '#a8652a', 7);
      ctx.beginPath(); for (let y = -30; y <= 30; y += 15) { ctx.moveTo(-18, y); ctx.lineTo(18, y); } path(ctx, null, '#c98a4a', 5);
      break;
    case 'book':
      ctx.save(); ctx.rotate(-0.15);
      roundRect(ctx, -30, -24, 60, 44, 4); path(ctx, '#a97ae0');
      roundRect(ctx, -26, 16, 56, 8, 2); path(ctx, '#fff');
      roundRect(ctx, -10, -10, 24, 10, 2); path(ctx, '#ffd23f', null);
      ctx.restore();
      break;
    case 'trumpet':
      ctx.beginPath(); ctx.moveTo(-36, -4); ctx.lineTo(14, -4); ctx.lineTo(36, -20); ctx.lineTo(36, 20); ctx.lineTo(14, 4); ctx.lineTo(-36, 4); ctx.closePath(); path(ctx, '#ffcf3f');
      for (const x of [-12, -2, 8]) { roundRect(ctx, x - 2, -14, 5, 10, 2); path(ctx, '#e9a32a', INK, 2); }
      break;
    case 'balloon':
      ellipse(ctx, 0, -12, 24, 30); path(ctx, '#e8524a');
      ellipse(ctx, -8, -22, 6, 10, -0.4); path(ctx, 'rgba(255,255,255,0.6)', null);
      ctx.beginPath(); ctx.moveTo(0, 18); ctx.quadraticCurveTo(10, 32, -2, 46); path(ctx, null, INK, 2.4);
      break;
    case 'can':
      roundRect(ctx, -22, -14, 40, 40, 8); path(ctx, '#5fc98c');
      ctx.beginPath(); ctx.moveTo(18, -2); ctx.lineTo(40, -24); path(ctx, null, '#5fc98c', 8);
      ctx.beginPath(); ctx.moveTo(18, -2); ctx.lineTo(40, -24); path(ctx, null, INK, 1.5);
      ctx.beginPath(); ctx.arc(-2, -14, 16, Math.PI, 0); path(ctx, null, INK, 4);
      break;
    case 'bucket':
      ctx.beginPath(); ctx.moveTo(-26, -16); ctx.lineTo(26, -16); ctx.lineTo(20, 30); ctx.lineTo(-20, 30); ctx.closePath(); path(ctx, '#6fb7ff');
      ctx.beginPath(); ctx.arc(0, -16, 26, Math.PI, 0); path(ctx, null, INK, 3);
      ellipse(ctx, 0, -16, 26, 6); path(ctx, '#bfe3ff');
      break;
    case 'net':
      ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(36, 40); path(ctx, null, '#a8652a', 6);
      circle(ctx, -6, -8, 24); path(ctx, 'rgba(255,255,255,0.6)');
      ctx.save(); circle(ctx, -6, -8, 24); ctx.clip();
      ctx.beginPath(); for (let i = -30; i < 30; i += 10) { ctx.moveTo(i, -40); ctx.lineTo(i, 30); ctx.moveTo(-40, i); ctx.lineTo(30, i); } path(ctx, null, 'rgba(58,42,53,0.45)', 1.5);
      ctx.restore();
      break;
    case 'lantern':
      ctx.beginPath(); ctx.arc(0, -30, 10, Math.PI, 0); path(ctx, null, INK, 4);
      roundRect(ctx, -18, -26, 36, 8, 3); path(ctx, '#3a3a48');
      roundRect(ctx, -16, -18, 32, 40, 8); path(ctx, '#ffe680');
      ellipse(ctx, 0, 2, 6, 10); path(ctx, '#ff9b2f', null);
      roundRect(ctx, -18, 20, 36, 8, 3); path(ctx, '#3a3a48');
      break;
    case 'teapot':
      ellipse(ctx, 0, 6, 28, 22); path(ctx, '#ffc0d9');
      ctx.beginPath(); ctx.moveTo(24, 0); ctx.quadraticCurveTo(42, -6, 42, -20); path(ctx, null, '#ffc0d9', 7);
      ctx.beginPath(); ctx.moveTo(-26, -6); ctx.quadraticCurveTo(-46, 4, -26, 18); path(ctx, null, INK, 4);
      ellipse(ctx, 0, -16, 14, 5); path(ctx, '#ff86b8');
      circle(ctx, 0, -22, 4); path(ctx, '#ff86b8');
      break;
    default: break;
  }
}

// The clue you find in a scene, by trace kind or "drop"/"crime".
export function drawClueItem(ctx, kind, color = '#c98a4a') {
  switch (kind) {
    case 'feather':
      ctx.save(); ctx.rotate(-0.6);
      ellipse(ctx, 0, 0, 12, 34); path(ctx, color);
      ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, 42); path(ctx, null, INK, 2.4);
      ctx.restore(); break;
    case 'fur':
    case 'wool':
      ctx.beginPath();
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; ctx.moveTo(Math.cos(a) * 14 + 12, Math.sin(a) * 10); ctx.arc(Math.cos(a) * 14, Math.sin(a) * 10, 12, 0, Math.PI * 2); }
      path(ctx, color); break;
    case 'pawprint':
    case 'hoofprint':
    case 'webprint':
    case 'shellprint':
      for (const [x, y, r] of [[-18, 14, 0.2], [14, -12, -0.2]]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(r);
        if (kind === 'webprint') { ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-12, -10); ctx.lineTo(0, -4); ctx.lineTo(12, -10); ctx.closePath(); path(ctx, shade(color, -0.3), null); }
        else if (kind === 'hoofprint') { for (const s of [-1, 1]) { ellipse(ctx, s * 5, 0, 4.5, 9); path(ctx, shade(color, -0.4), null); } }
        else if (kind === 'shellprint') { ellipse(ctx, 0, 0, 13, 7); path(ctx, shade(color, -0.4), null); }
        else { ellipse(ctx, 0, 4, 8, 6.5); path(ctx, shade(color, -0.4), null); for (const [tx, ty] of [[-8, -6], [-2, -10], [5, -9], [10, -4]]) { circle(ctx, tx, ty, 3); path(ctx, shade(color, -0.4), null); } }
        ctx.restore();
      }
      break;
    case 'quill':
      ctx.save(); ctx.rotate(0.7);
      ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(5, 20); ctx.lineTo(-5, 20); ctx.closePath(); path(ctx, color);
      ellipse(ctx, 0, 24, 5, 4); path(ctx, '#f2d9bd');
      ctx.restore(); break;
    case 'dirt':
      ctx.beginPath(); ctx.moveTo(-30, 14); ctx.quadraticCurveTo(0, -30, 30, 14); ctx.closePath(); path(ctx, '#8a6a4a');
      for (const [x, y] of [[-10, 2], [8, -4], [14, 8]]) { circle(ctx, x, y, 3); path(ctx, '#6a4a32', null); }
      break;
    case 'crumbs':
      for (const [x, y, r] of [[-16, 8, 7], [4, -6, 9], [18, 10, 6], [-4, 14, 5], [10, -18, 4]]) { circle(ctx, x, y, r); path(ctx, color, INK, 2); }
      break;
    default:
      drawThingIcon(ctx, kind);
  }
}

// The missing thing for each mystery, for case cards and the reveal.
export function drawMysteryItem(ctx, id) {
  switch (id) {
    case 'pie':
      ellipse(ctx, 0, 14, 44, 16); path(ctx, '#e9e2f0');
      ctx.beginPath(); ctx.moveTo(-38, 8); ctx.quadraticCurveTo(0, -36, 38, 8); ctx.quadraticCurveTo(0, 22, -38, 8); path(ctx, '#e9a35a');
      ctx.beginPath(); for (const x of [-16, 0, 16]) { ctx.moveTo(x - 4, -10); ctx.lineTo(x + 4, 4); } path(ctx, null, '#a8652a', 3);
      ellipse(ctx, 0, 0, 10, 5); path(ctx, '#c9375a', null);
      break;
    case 'hat':
      ellipse(ctx, 0, 30, 44, 9); path(ctx, '#2a2a36');
      roundRect(ctx, -26, -42, 52, 72, 6); path(ctx, '#2a2a36');
      roundRect(ctx, -26, 10, 52, 12, 2); path(ctx, '#e8524a', null);
      ctx.beginPath(); ctx.moveTo(20, 10); ctx.quadraticCurveTo(44, -20, 30, -50); path(ctx, null, '#5fc98c', 5);
      break;
    case 'kitten':
      ctx.save(); ctx.scale(0.62, 0.62); HEADS.cat(ctx, { fur: '#f6a35a', belly: '#fff3e6', accent: '#7fd36b' }, { mood: 'happy' }); ctx.restore();
      break;
    case 'cookies':
      roundRect(ctx, -30, -30, 60, 64, 14); path(ctx, 'rgba(200,235,255,0.7)');
      roundRect(ctx, -22, -42, 44, 14, 4); path(ctx, '#ff86b8');
      for (const [x, y] of [[-10, 14], [10, 18], [0, 0]]) { circle(ctx, x, y, 11); path(ctx, '#e9a35a'); circle(ctx, x - 3, y - 2, 2); path(ctx, '#6a3a1a', null); }
      break;
    case 'bell':
      ctx.beginPath(); ctx.moveTo(-34, 24); ctx.quadraticCurveTo(-30, -36, 0, -36); ctx.quadraticCurveTo(30, -36, 34, 24); ctx.closePath(); path(ctx, '#ffcf3f');
      circle(ctx, 0, 30, 8); path(ctx, '#e9a32a');
      ctx.beginPath(); ctx.arc(0, -40, 7, Math.PI, 0); path(ctx, null, INK, 4);
      break;
    case 'trophy':
      ctx.beginPath(); ctx.moveTo(-26, -34); ctx.lineTo(26, -34); ctx.quadraticCurveTo(26, 6, 0, 10); ctx.quadraticCurveTo(-26, 6, -26, -34); path(ctx, '#ffcf3f');
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 28, -20, 10, s > 0 ? -1.6 : 1.6 - Math.PI, s > 0 ? 1.6 : -1.6 - Math.PI, s < 0); path(ctx, null, '#e9a32a', 5); }
      roundRect(ctx, -6, 10, 12, 16, 2); path(ctx, '#e9a32a');
      roundRect(ctx, -22, 26, 44, 12, 3); path(ctx, '#a8652a');
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ellipse(ctx, Math.cos(a) * 8, -16 + Math.sin(a) * 8, 5, 5); path(ctx, '#fff3a0', null); }
      circle(ctx, 0, -16, 5); path(ctx, '#a8652a', null);
      break;
    case 'cake':
      roundRect(ctx, -36, -6, 72, 36, 6); path(ctx, '#ffc0d9');
      roundRect(ctx, -26, -30, 52, 26, 6); path(ctx, '#fff3e6');
      ctx.beginPath(); ctx.moveTo(-36, 4); for (let x = -36; x <= 36; x += 12) ctx.quadraticCurveTo(x + 6, 14, x + 12, 4); path(ctx, null, '#ff86b8', 3);
      for (const x of [-12, 0, 12]) { roundRect(ctx, x - 2, -44, 4, 14, 1); path(ctx, '#6fb7ff', INK, 1.5); ellipse(ctx, x, -48, 3, 5); path(ctx, '#ffcf3f', null); }
      break;
    case 'acorn':
      ellipse(ctx, 0, 8, 26, 30); path(ctx, '#ffcf3f');
      ctx.beginPath(); ctx.moveTo(-30, -6); ctx.quadraticCurveTo(0, -40, 30, -6); ctx.quadraticCurveTo(0, 2, -30, -6); path(ctx, '#a8652a');
      roundRect(ctx, -3, -36, 6, 12, 2); path(ctx, '#7a4a28');
      ellipse(ctx, -8, 8, 5, 10); path(ctx, 'rgba(255,255,255,0.6)', null);
      break;
    case 'scarf':
      ctx.beginPath(); ctx.moveTo(-40, -20); ctx.quadraticCurveTo(0, 0, 40, -20); ctx.lineTo(40, -4); ctx.quadraticCurveTo(0, 16, -40, -4); ctx.closePath(); path(ctx, '#e8524a');
      roundRect(ctx, 10, -4, 16, 44, 4); path(ctx, '#e8524a');
      ctx.beginPath(); for (const y of [12, 24]) { ctx.moveTo(10, y); ctx.lineTo(26, y); } path(ctx, null, '#fff', 3);
      break;
    case 'map':
      ctx.beginPath(); ctx.moveTo(-36, -28); ctx.lineTo(-12, -22); ctx.lineTo(12, -28); ctx.lineTo(36, -22); ctx.lineTo(36, 30); ctx.lineTo(12, 24); ctx.lineTo(-12, 30); ctx.lineTo(-36, 24); ctx.closePath(); path(ctx, '#f2dfb0');
      ctx.beginPath(); ctx.moveTo(-26, 14); ctx.quadraticCurveTo(-10, -10, 4, 6); ctx.quadraticCurveTo(14, 16, 20, -6); ctx.setLineDash([4, 5]); path(ctx, null, '#a8652a', 3); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(16, -14); ctx.lineTo(26, -4); ctx.moveTo(26, -14); ctx.lineTo(16, -4); path(ctx, null, '#e8524a', 4);
      break;
    default: break;
  }
}

// Bake any icon function into a square canvas of `px` pixels.
export function bakeIcon(fn, id, px, ...args) {
  const canvas = makeCanvas(px, px);
  const ctx = canvas.getContext('2d');
  ctx.translate(px / 2, px / 2);
  ctx.scale(px / 110, px / 110);
  fn(ctx, id, ...args);
  return canvas;
}
