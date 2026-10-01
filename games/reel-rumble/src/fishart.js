// Procedural cartoon fish. drawFish() paints one species facing right,
// centred on (0, 0) and `L` pixels long. bakeFish() caches it in an
// offscreen canvas so the frame loop only calls drawImage.

export const SHAPES = {
  round: { h: 0.62, tail: 'fan', dorsal: 'long' },
  perch: { h: 0.36, tail: 'fork', dorsal: 'spiky' },
  long: { h: 0.24, tail: 'fork', dorsal: 'small' },
  trout: { h: 0.28, tail: 'square', dorsal: 'small', adipose: true },
  carp: { h: 0.36, tail: 'fork', dorsal: 'long', barbels: true },
  cat: { h: 0.27, tail: 'round', dorsal: 'small', whiskers: true, adipose: true, blunt: true },
  pike: { h: 0.19, tail: 'fork', dorsal: 'rear', snout: true },
  sail: { h: 0.26, tail: 'fork', dorsal: 'sail' },
  sturgeon: { h: 0.18, tail: 'shark', dorsal: 'rear', snout: true, barbels: true },
  puffer: { h: 0.78, tail: 'fan', dorsal: 'small', spikes: true, blunt: true },
  mahi: { h: 0.34, tail: 'fork', dorsal: 'full', blunt: true },
  eel: { h: 0.11, tail: 'eel', dorsal: 'full' },
  marlin: { h: 0.24, tail: 'moon', dorsal: 'sail', bill: true },
  sculpin: { h: 0.3, tail: 'round', dorsal: 'spiky', bigHead: true, bigPec: true },
  guppy: { h: 0.3, tail: 'bigfan', dorsal: 'small' },
  betta: { h: 0.32, tail: 'bigfan', dorsal: 'veil', veil: true },
  angel: { h: 0.72, tail: 'fan', dorsal: 'tall', veil: true },
  flat: { h: 0.56, tail: 'fan', flat: true },
  ray: { h: 0.7, tail: 'whip', ray: true },
};

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; } else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function bodyPath(ctx, L, sh) {
  const H = (sh.h * L) / 2;
  const x1 = L * (sh.bill ? 0.36 : sh.snout ? 0.5 : 0.47);
  const x0 = -L * (sh.tail === 'eel' ? 0.5 : 0.3);
  const th = sh.tail === 'eel' ? H * 0.15 : H * 0.3;
  const blunt = sh.blunt ? 0.95 : sh.snout ? 0.25 : 0.65;
  ctx.beginPath();
  if (sh.ray) {
    ctx.moveTo(L * 0.42, 0);
    ctx.quadraticCurveTo(L * 0.2, -H * 0.3, -L * 0.05, -H);
    ctx.quadraticCurveTo(-L * 0.12, -H * 0.3, -L * 0.3, 0);
    ctx.quadraticCurveTo(-L * 0.12, H * 0.3, -L * 0.05, H);
    ctx.quadraticCurveTo(L * 0.2, H * 0.3, L * 0.42, 0);
    ctx.closePath();
    return { H, x0: -L * 0.3, x1: L * 0.42, th: 2 };
  }
  ctx.moveTo(x1, H * 0.08);
  ctx.bezierCurveTo(x1, -H * blunt, L * 0.22, -H, L * 0.04, -H);
  ctx.bezierCurveTo(-L * 0.12, -H, -L * 0.22, -th * 1.5, x0, -th);
  ctx.lineTo(x0, th);
  ctx.bezierCurveTo(-L * 0.22, th * 1.6, -L * 0.1, H * 1.04, L * 0.05, H * 1.02);
  ctx.bezierCurveTo(L * 0.25, H, x1, H * Math.min(0.75, blunt), x1, H * 0.08);
  ctx.closePath();
  return { H, x0, x1, th };
}

function tailPath(ctx, L, sh, g) {
  const { H, x0, th } = g;
  const sp = Math.max(H * 0.95, L * 0.12);
  const end = -L * 0.5;
  ctx.beginPath();
  switch (sh.tail) {
    case 'fork':
      ctx.moveTo(x0 + 2, -th);
      ctx.quadraticCurveTo(end + L * 0.06, -sp * 0.6, end, -sp);
      ctx.quadraticCurveTo(end + L * 0.06, -sp * 0.2, end + L * 0.08, 0);
      ctx.quadraticCurveTo(end + L * 0.06, sp * 0.2, end, sp);
      ctx.quadraticCurveTo(end + L * 0.06, sp * 0.6, x0 + 2, th);
      break;
    case 'moon':
      ctx.moveTo(x0 + 2, -th);
      ctx.quadraticCurveTo(end + L * 0.04, -sp * 0.8, end - L * 0.02, -sp * 1.5);
      ctx.quadraticCurveTo(end + L * 0.05, -sp * 0.3, end + L * 0.07, 0);
      ctx.quadraticCurveTo(end + L * 0.05, sp * 0.3, end - L * 0.02, sp * 1.5);
      ctx.quadraticCurveTo(end + L * 0.04, sp * 0.8, x0 + 2, th);
      break;
    case 'square':
      ctx.moveTo(x0 + 2, -th);
      ctx.lineTo(end + L * 0.02, -sp * 0.9);
      ctx.quadraticCurveTo(end + L * 0.05, 0, end + L * 0.02, sp * 0.9);
      ctx.lineTo(x0 + 2, th);
      break;
    case 'shark':
      ctx.moveTo(x0 + 2, -th);
      ctx.quadraticCurveTo(end + L * 0.08, -sp * 0.8, end - L * 0.02, -sp * 1.3);
      ctx.quadraticCurveTo(end + L * 0.08, -sp * 0.2, end + L * 0.08, sp * 0.1);
      ctx.quadraticCurveTo(end + L * 0.08, sp * 0.4, end + L * 0.06, sp * 0.7);
      ctx.lineTo(x0 + 2, th);
      break;
    case 'round':
    case 'fan':
      ctx.moveTo(x0 + 2, -th);
      ctx.quadraticCurveTo(end - L * 0.02, -sp * 1.1, end, 0);
      ctx.quadraticCurveTo(end - L * 0.02, sp * 1.1, x0 + 2, th);
      break;
    case 'bigfan': {
      const s2 = sp * 1.9;
      ctx.moveTo(x0 + 2, -th);
      ctx.bezierCurveTo(end, -s2 * 0.8, end - L * 0.12, -s2, end - L * 0.14, 0);
      ctx.bezierCurveTo(end - L * 0.12, s2, end, s2 * 0.8, x0 + 2, th);
      break;
    }
    case 'whip':
      ctx.moveTo(x0 + 2, -1.5);
      ctx.lineTo(-L * 0.62, 0);
      ctx.lineTo(x0 + 2, 1.5);
      break;
    default:
      return false;
  }
  ctx.closePath();
  return true;
}

function finPaths(ctx, L, sh, g, finColor, outline) {
  const { H } = g;
  ctx.fillStyle = finColor;
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, L * 0.012);
  const fin = (fn) => { ctx.beginPath(); fn(); ctx.closePath(); ctx.fill(); ctx.stroke(); };
  switch (sh.dorsal) {
    case 'spiky':
      fin(() => {
        ctx.moveTo(L * 0.2, -H * 0.9);
        for (let i = 0; i <= 5; i++) {
          const x = L * (0.18 - i * 0.07);
          ctx.lineTo(x + L * 0.02, -H * (i % 2 ? 1.25 : 1.45));
          ctx.lineTo(x - L * 0.02, -H * 0.95);
        }
      });
      break;
    case 'long':
      fin(() => { ctx.moveTo(L * 0.18, -H * 0.92); ctx.quadraticCurveTo(L * 0.05, -H * 1.5, -L * 0.24, -H * 0.5); ctx.lineTo(-L * 0.18, -H * 0.7); });
      break;
    case 'small':
      fin(() => { ctx.moveTo(L * 0.1, -H * 0.95); ctx.quadraticCurveTo(L * 0.02, -H * 1.6, -L * 0.08, -H * 0.92); });
      break;
    case 'rear':
      fin(() => { ctx.moveTo(-L * 0.12, -H * 0.8); ctx.quadraticCurveTo(-L * 0.18, -H * 1.7, -L * 0.27, -H * 0.4); });
      break;
    case 'sail':
      fin(() => { ctx.moveTo(L * 0.22, -H * 0.85); ctx.quadraticCurveTo(L * 0.12, -H * 2.6, -L * 0.18, -H * 0.8); ctx.lineTo(-L * 0.1, -H * 0.95); });
      break;
    case 'full':
      fin(() => { ctx.moveTo(L * 0.34, -H * 0.82); ctx.quadraticCurveTo(L * 0.05, -H * 1.55, -L * 0.29, -g.th * 1.2); ctx.lineTo(-L * 0.2, -H * 0.6); });
      break;
    case 'veil':
      fin(() => { ctx.moveTo(L * 0.15, -H * 0.92); ctx.bezierCurveTo(L * 0.05, -H * 2.2, -L * 0.25, -H * 2, -L * 0.34, -H * 1.1); ctx.lineTo(-L * 0.2, -H * 0.7); });
      break;
    case 'tall':
      fin(() => { ctx.moveTo(L * 0.12, -H * 0.9); ctx.quadraticCurveTo(-L * 0.05, -H * 2.1, -L * 0.3, -H * 1.9); ctx.quadraticCurveTo(-L * 0.18, -H * 1.0, -L * 0.2, -H * 0.5); });
      fin(() => { ctx.moveTo(L * 0.12, H * 0.9); ctx.quadraticCurveTo(-L * 0.05, H * 2.1, -L * 0.3, H * 1.9); ctx.quadraticCurveTo(-L * 0.18, H * 1.0, -L * 0.2, H * 0.5); });
      break;
    default: break;
  }
  if (sh.veil && sh.dorsal !== 'tall') {
    fin(() => { ctx.moveTo(L * 0.05, H * 0.95); ctx.bezierCurveTo(-L * 0.02, H * 2.2, -L * 0.28, H * 2, -L * 0.34, H * 1.1); ctx.lineTo(-L * 0.2, H * 0.7); });
  } else if (!sh.flat && !sh.ray && sh.tail !== 'eel') {
    // anal fin
    fin(() => { ctx.moveTo(-L * 0.08, H * 0.85); ctx.quadraticCurveTo(-L * 0.14, H * 1.45, -L * 0.24, H * 0.55); });
  }
  if (sh.adipose) fin(() => { ctx.moveTo(-L * 0.2, -H * 0.62); ctx.quadraticCurveTo(-L * 0.23, -H * 1.0, -L * 0.26, -H * 0.5); });
}

function pattern(ctx, L, g, look, rng) {
  const { H } = g;
  const a = look.accent;
  switch (look.pattern) {
    case 'bands':
      ctx.fillStyle = shade(look.body, -0.35);
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 6; i++) ctx.fillRect(L * (0.22 - i * 0.09), -H, L * 0.035, H * 2);
      break;
    case 'bars':
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 6; i++) ctx.fillRect(L * (0.2 - i * 0.085), -H, L * 0.03, H * 1.25);
      break;
    case 'stripe':
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(-L * 0.4, -H * 0.12, L * 0.8, H * 0.22);
      break;
    case 'rainbow':
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(-L * 0.4, -H * 0.1, L * 0.75, H * 0.32);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = shade(look.body, -0.5);
      for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.arc((rng() - 0.6) * L * 0.8, (rng() - 0.6) * H * 1.6, L * 0.008 + 0.6, 0, 7); ctx.fill(); }
      break;
    case 'spots': case 'paleSpots': case 'redspots': case 'blotch': {
      const n = look.pattern === 'blotch' ? 7 : 20;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = look.pattern === 'redspots' && i % 3 === 0 ? a : look.pattern === 'paleSpots' ? a : shade(look.body, -0.45);
        ctx.globalAlpha = look.pattern === 'blotch' ? 0.35 : 0.75;
        const r = look.pattern === 'blotch' ? L * 0.06 : L * 0.016 + 0.6;
        ctx.beginPath();
        ctx.arc((rng() - 0.55) * L * 0.75, (rng() - 0.55) * H * 1.5, r, 0, 7);
        ctx.fill();
      }
      break;
    }
    case 'scales':
      ctx.strokeStyle = shade(look.body, -0.3);
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = Math.max(0.8, L * 0.008);
      for (let y = -H; y < H; y += L * 0.06) for (let x = -L * 0.3; x < L * 0.3; x += L * 0.06) {
        ctx.beginPath();
        ctx.arc(x + ((y / (L * 0.06)) % 2 ? L * 0.03 : 0), y, L * 0.032, -1.2, 1.2);
        ctx.stroke();
      }
      break;
    case 'koi': case 'starkoi':
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.95;
      for (const [x, y, r] of [[0.28, -0.4, 0.1], [0.05, -0.55, 0.13], [-0.16, 0.1, 0.1], [0.12, 0.3, 0.07]]) {
        ctx.beginPath(); ctx.ellipse(L * x, H * y, L * r, L * r * 0.7, 0.3, 0, 7); ctx.fill();
      }
      if (look.pattern === 'starkoi') {
        ctx.fillStyle = '#fff6c8';
        for (let i = 0; i < 9; i++) star(ctx, (rng() - 0.5) * L * 0.6, (rng() - 0.5) * H * 1.4, L * 0.025);
      }
      break;
    case 'clown':
      for (const x of [0.27, 0.02, -0.22]) {
        ctx.fillStyle = '#1a1a1a';
        ctx.globalAlpha = 1;
        ctx.fillRect(L * x - L * 0.05, -H * 1.2, L * 0.1, H * 2.4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(L * x - L * 0.037, -H * 1.2, L * 0.074, H * 2.4);
      }
      break;
    case 'tang':
      ctx.fillStyle = look.accent;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(L * 0.3, -H * 0.5);
      ctx.quadraticCurveTo(0, -H * 1.0, -L * 0.28, -H * 0.1);
      ctx.quadraticCurveTo(-L * 0.05, -H * 0.3, L * 0.05, H * 0.2);
      ctx.quadraticCurveTo(L * 0.15, -H * 0.3, L * 0.3, -H * 0.5);
      ctx.fill();
      break;
    case 'greenhead':
      ctx.fillStyle = a;
      ctx.globalAlpha = 1;
      ctx.fillRect(L * 0.22, -H * 1.2, L * 0.4, H * 2.4);
      break;
    case 'scutes':
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 9; i++) { const x = L * (0.3 - i * 0.07); ctx.beginPath(); ctx.moveTo(x, -H * 0.8); ctx.lineTo(x + L * 0.02, -H * 0.6); ctx.lineTo(x, -H * 0.4); ctx.lineTo(x - L * 0.02, -H * 0.6); ctx.fill(); }
      break;
    case 'moss':
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = i % 2 ? a : shade(look.body, -0.3);
        ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.arc((rng() - 0.5) * L * 0.75, (rng() - 0.8) * H, L * (0.02 + rng() * 0.04), 0, 7); ctx.fill();
      }
      break;
    case 'crown':
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < 14; i++) star(ctx, (rng() - 0.55) * L * 0.75, (rng() - 0.65) * H * 1.3, L * 0.022);
      ctx.fillStyle = '#ff9ab8';
      ctx.globalAlpha = 0.45;
      ctx.fillRect(-L * 0.4, -H * 0.05, L * 0.75, H * 0.28);
      break;
    case 'crystal':
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = Math.max(1, L * 0.01);
      for (let i = 0; i < 10; i++) {
        const x = (rng() - 0.5) * L * 0.7, y = (rng() - 0.5) * H * 1.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + L * 0.08, y - H * 0.3); ctx.lineTo(x + L * 0.12, y + H * 0.1); ctx.stroke();
      }
      break;
    case 'glow':
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(-L * 0.4, -H * 0.08, L * 0.75, H * 0.18);
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(L * (0.2 - i * 0.09), H * 0.5, L * 0.018 + 0.5, 0, 7); ctx.fill(); }
      break;
    case 'aurora': {
      const cols = ['#3affc8', '#5ef2ff', '#a07aff', '#ff6ad8'];
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = cols[i % 4];
        ctx.globalAlpha = 0.55;
        ctx.fillRect(L * (0.45 - i * 0.12), -H, L * 0.07, H * 2);
      }
      break;
    }
    case 'stars':
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < 16; i++) star(ctx, (rng() - 0.5) * L * 0.7, (rng() - 0.5) * H * 1.5, L * 0.02);
      break;
    default: break;
  }
  ctx.globalAlpha = 1;
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

const GLOWS = new Set(['glow', 'starkoi', 'crown', 'crystal', 'aurora']);
const glowRy = (look, L) => Math.min(L * 0.62, (SHAPES[look.shape] || SHAPES.perch).h * L * 1.1 + L * 0.08);

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// opts.silhouette: one flat colour (the collection book's unknown fish).
export function drawFish(ctx, look, L, { silhouette = null } = {}) {
  const sh = SHAPES[look.shape] || SHAPES.perch;
  const outline = silhouette || shade(look.body, -0.55);
  const finCol = silhouette || look.fin;
  const rng = seeded(look.body.length * 977 + look.fin.charCodeAt(2) * 31 + look.shape.length);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Glow halo for glowing species.
  if (!silhouette && GLOWS.has(look.pattern)) {
    const ry = glowRy(look, L);
    ctx.save();
    ctx.scale(1, ry / (L * 0.62));
    const gr = ctx.createRadialGradient(0, 0, L * 0.05, 0, 0, L * 0.62);
    gr.addColorStop(0, look.pattern === 'glow' ? look.accent : look.fin);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(0, 0, L * 0.62, 0, 7); ctx.fill();
    ctx.restore();
  }
  const g0 = { H: (sh.h * L) / 2, x0: -L * 0.3, th: (sh.h * L) / 2 * 0.3 };
  // Tail and fins behind the body.
  if (tailPath(ctx, L, sh, g0)) {
    ctx.fillStyle = finCol;
    ctx.globalAlpha = sh.tail === 'bigfan' ? 0.85 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1, L * 0.014);
    ctx.stroke();
  }
  if (sh.flat) {
    ctx.fillStyle = finCol;
    ctx.strokeStyle = outline;
    ctx.beginPath(); ctx.ellipse(0, 0, L * 0.4, (sh.h * L) / 2 * 1.25, 0, 0, 7); ctx.fill(); ctx.stroke();
  }
  if (sh.ray) {
    ctx.strokeStyle = finCol;
    ctx.lineWidth = Math.max(1.5, L * 0.02);
    ctx.beginPath(); ctx.moveTo(-L * 0.28, 0); ctx.lineTo(-L * 0.62, 0); ctx.stroke();
  }
  finPaths(ctx, L, sh, g0, finCol, outline);
  // Body.
  const g = bodyPath(ctx, L, sh);
  if (silhouette) ctx.fillStyle = silhouette;
  else {
    const grd = ctx.createLinearGradient(0, -g.H, 0, g.H);
    grd.addColorStop(0, shade(look.body, -0.18));
    grd.addColorStop(0.45, look.body);
    grd.addColorStop(1, look.belly);
    ctx.fillStyle = grd;
  }
  ctx.fill();
  if (!silhouette) {
    ctx.save();
    ctx.clip();
    pattern(ctx, L, g, look, rng);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.ellipse(L * 0.08, -g.H * 0.5, L * 0.25, g.H * 0.28, -0.05, 0, 7); ctx.fill();
    ctx.restore();
  }
  bodyPath(ctx, L, sh);
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1.2, L * 0.016);
  ctx.stroke();
  if (silhouette) { ctx.restore(); return; }

  const H = g.H;
  // Gill line and pectoral fin.
  if (!sh.ray && !sh.flat) {
    ctx.strokeStyle = shade(look.body, -0.4);
    ctx.lineWidth = Math.max(1, L * 0.01);
    ctx.beginPath();
    const gx = sh.bigHead ? L * 0.14 : L * (sh.bill ? 0.18 : 0.25);
    ctx.arc(gx + H * 0.9, 0, H * 0.9, Math.PI * 0.72, Math.PI * 1.28);
    ctx.stroke();
    ctx.fillStyle = look.fin;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    const ps = sh.bigPec ? 1.8 : 1;
    ctx.moveTo(gx - L * 0.01, H * 0.25);
    ctx.quadraticCurveTo(gx - L * 0.12 * ps, H * 0.35, gx - L * 0.1 * ps, H * 0.75 * ps);
    ctx.quadraticCurveTo(gx - L * 0.02, H * 0.6, gx - L * 0.01, H * 0.25);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Bill, whiskers, spikes.
  if (sh.bill) {
    ctx.fillStyle = shade(look.body, -0.2);
    ctx.beginPath(); ctx.moveTo(g.x1 - 2, -H * 0.2); ctx.lineTo(L * 0.62, -H * 0.05); ctx.lineTo(g.x1 - 2, H * 0.12); ctx.fill();
  }
  if (sh.whiskers || sh.barbels) {
    ctx.strokeStyle = shade(look.body, -0.5);
    ctx.lineWidth = Math.max(1, L * 0.01);
    const n = sh.whiskers ? 3 : 2;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(g.x1 - L * 0.02, H * (0.1 + i * 0.12));
      ctx.quadraticCurveTo(g.x1 + L * 0.08, H * (0.3 + i * 0.3), g.x1 + L * (sh.whiskers ? 0.04 : 0.02), H * (0.6 + i * 0.4));
      ctx.stroke();
    }
  }
  if (sh.spikes) {
    ctx.strokeStyle = shade(look.body, -0.45);
    ctx.lineWidth = Math.max(1, L * 0.012);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const cx = Math.cos(a) * L * 0.3, cy = Math.sin(a) * H * 0.92;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx * 1.12, cy * 1.12); ctx.stroke();
    }
  }
  // Eye(s) and mouth.
  const eyeR = Math.max(1.6, L * (L < 60 ? 0.05 : sh.bigHead ? 0.05 : 0.038));
  const eyes = sh.flat || sh.ray ? [[L * 0.24, -H * 0.45], [L * 0.3, -H * 0.15]] : [[sh.bill ? L * 0.26 : sh.snout ? L * 0.36 : L * 0.33, -H * (sh.h > 0.5 ? 0.25 : 0.22)]];
  for (const [ex, ey] of eyes) {
    ctx.fillStyle = look.eye === 'glow' ? '#fff3a0' : '#ffffff';
    ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, 7); ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(0.8, eyeR * 0.25);
    ctx.stroke();
    ctx.fillStyle = '#10131c';
    ctx.beginPath(); ctx.arc(ex + eyeR * 0.2, ey, eyeR * 0.58, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(ex + eyeR * 0.38, ey - eyeR * 0.28, eyeR * 0.22, 0, 7); ctx.fill();
  }
  if (!sh.ray) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1, L * 0.012);
    ctx.beginPath();
    ctx.moveTo(g.x1 - L * 0.005, H * 0.12);
    ctx.quadraticCurveTo(g.x1 - L * 0.04, H * 0.22, g.x1 - L * 0.07, H * 0.16);
    ctx.stroke();
  }
  ctx.restore();
}

// Offscreen sprite: { canvas, w, h, L } with the fish centred.
export function bakeFish(look, L, { silhouette = null, scale = 1 } = {}) {
  const sh = SHAPES[look.shape] || SHAPES.perch;
  const tallness = Math.max(sh.h * 2.6, sh.dorsal === 'sail' ? 1.0 : 0.8, sh.tail === 'bigfan' || sh.veil ? 1.4 : 0);
  const glowH = GLOWS.has(look.pattern) ? glowRy(look, L) * 2 / L : 0;
  const w = Math.ceil(L * 1.5 * scale), h = Math.ceil(L * Math.max(tallness, glowH) * scale + 8 * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.translate(w / 2 - L * 0.04 * scale, h / 2);
  ctx.scale(scale, scale);
  drawFish(ctx, look, L, { silhouette });
  return { canvas: c, w: w / scale, h: h / scale, L };
}

// Display length in pixels for a real length in centimetres.
export const pixelLength = (cm, k = 1) => Math.max(20, Math.min(200, 14 + 12.5 * Math.sqrt(cm))) * k;
