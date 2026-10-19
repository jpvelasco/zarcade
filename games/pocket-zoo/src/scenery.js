// The baked zoo ground: grass, roads, zone floors, habitats with level
// fences, locked lots, the gate and border trees. Painted into one
// offscreen canvas in small jobs, and repainted per zone when it changes.
import { BIOMES, PLOTS_PER_BIOME, DECO_SPOTS_PER_BIOME, HABITAT_LEVELS } from './data.js';
import { WORLD, ZONE_W, ZONE_H, COLS, ROWS, ROAD, GATE, zoneRect, plotRect, decoSpot } from './map.js';
import { makeCanvas, shade, ink, star } from './sprites.js';
import { Rng, mix } from './rng.js';

const TAU = Math.PI * 2;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}
function blob(ctx, x, y, r, fill, line) {
  ell(ctx, x, y, r, r * 0.9);
  ctx.fillStyle = fill;
  ctx.fill();
  if (line) { ctx.strokeStyle = line; ctx.stroke(); }
}

export class Ground {
  constructor({ scale = 1.5 } = {}) {
    this.scale = scale;
    this.w = WORLD.x1 - WORLD.x0;
    this.h = WORLD.y1 - WORLD.y0;
    this.canvas = makeCanvas(Math.ceil(this.w * scale), Math.ceil(this.h * scale));
    this.ctx = this.canvas.getContext('2d');
    this.jobs = [];
    this.version = 0;
  }

  // World-space drawing context for a job.
  begin(clip = null) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.scale, 0, 0, this.scale, -WORLD.x0 * this.scale, -WORLD.y0 * this.scale);
    if (clip) {
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    return ctx;
  }
  end() { this.ctx.restore(); this.version++; }

  queueAll(zoo) {
    this.jobs = [() => this.paintBase(), () => this.paintRoads(), () => this.paintGate()];
    for (let b = 0; b < BIOMES.length; b++) this.jobs.push(() => this.paintZone(zoo, b));
    this.jobs.push(() => this.paintTrees());
  }

  queueZone(zoo, b) {
    this.jobs.push(() => this.paintZone(zoo, b));
  }

  // Run jobs until the budget is used; returns true when everything is done.
  work(budgetMs = 12) {
    const t0 = performance.now();
    while (this.jobs.length && performance.now() - t0 < budgetMs) this.jobs.shift()();
    return this.jobs.length === 0;
  }

  // ---------------------------------------------------------------- base

  paintBase() {
    const ctx = this.begin();
    ctx.fillStyle = '#a6dc84';
    ctx.fillRect(WORLD.x0, WORLD.y0, this.w, this.h);
    const rng = new Rng(77);
    for (let k = 0; k < 900; k++) {
      const x = rng.range(WORLD.x0, WORLD.x1);
      const y = rng.range(WORLD.y0, WORLD.y1);
      ell(ctx, x, y, rng.range(6, 22), rng.range(3, 9));
      ctx.fillStyle = rng.next() < 0.5 ? 'rgba(120,190,90,0.35)' : 'rgba(200,240,160,0.35)';
      ctx.fill();
    }
    const flowers = ['#ffffff', '#ffe27a', '#ffb8d0'];
    for (let k = 0; k < 500; k++) {
      const x = rng.range(WORLD.x0, WORLD.x1);
      const y = rng.range(WORLD.y0, WORLD.y1);
      ell(ctx, x, y, 2, 2);
      ctx.fillStyle = flowers[k % 3];
      ctx.fill();
    }
    this.end();
  }

  paintRoads() {
    const ctx = this.begin();
    const half = ROAD / 2;
    const xs = Array.from({ length: COLS + 1 }, (_, c) => c * ZONE_W);
    const ys = Array.from({ length: ROWS + 1 }, (_, r) => r * ZONE_H);
    const W = COLS * ZONE_W;
    const H = ROWS * ZONE_H;
    const strokeAll = (width, color) => {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (const y of ys) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      for (const x of xs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      ctx.moveTo(GATE.x, H);
      ctx.lineTo(GATE.x, GATE.y + 60);
      ctx.stroke();
    };
    strokeAll(ROAD + 8, '#d9bf8a');
    strokeAll(ROAD, '#f4e2bb');
    strokeAll(ROAD - 18, '#f8ead0');
    const rng = new Rng(5);
    for (let k = 0; k < 700; k++) {
      const horizontal = rng.next() < 0.5;
      let x;
      let y;
      if (horizontal) { x = rng.range(0, W); y = rng.pick(ys) + rng.range(-half + 6, half - 6); } else { x = rng.pick(xs) + rng.range(-half + 6, half - 6); y = rng.range(0, H); }
      ell(ctx, x, y, rng.range(1.5, 3.5), rng.range(1, 2.4));
      ctx.fillStyle = rng.next() < 0.5 ? 'rgba(200,170,120,0.5)' : 'rgba(255,255,255,0.6)';
      ctx.fill();
    }
    this.end();
  }

  paintGate() {
    const ctx = this.begin();
    const x = GATE.x;
    const y = GATE.y + 10;
    // ticket booths
    for (const s of [-1, 1]) {
      const bx = x + s * 92;
      ctx.fillStyle = 'rgba(60,40,30,0.18)';
      ell(ctx, bx, y + 8, 40, 10);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(bx - 34, y - 52, 68, 56, 8);
      ctx.fillStyle = '#fff4e4';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#8a5a3a';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - 42, y - 50);
      ctx.lineTo(bx, y - 80);
      ctx.lineTo(bx + 42, y - 50);
      ctx.closePath();
      ctx.fillStyle = '#ff7a8a';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(bx - 18, y - 38, 36, 20, 4);
      ctx.fillStyle = '#7ad0ff';
      ctx.fill();
      ctx.stroke();
    }
    // arch
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(x + s * 46 - 9, y - 96, 18, 100, 6);
      ctx.fillStyle = '#ffb84a';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#8a5a3a';
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.roundRect(x - 78, y - 128, 156, 40, 16);
    ctx.fillStyle = '#7ad86a';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#3a7a3a';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#3a7a3a';
    ctx.strokeText('POCKET ZOO', x, y - 107);
    ctx.fillText('POCKET ZOO', x, y - 107);
    for (const s of [-1, 1]) star(ctx, x + s * 92, y - 128, 10, '#ffd23f');
    ell(ctx, x, y - 140, 14, 13);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#b8741a';
    ctx.stroke();
    for (const s of [-1, 1]) { ell(ctx, x + s * 5, y - 142, 1.8, 2.4); ctx.fillStyle = '#5a3a1a'; ctx.fill(); }
    ctx.beginPath();
    ctx.arc(x, y - 137, 4, 0.3, Math.PI - 0.3);
    ctx.lineWidth = 2;
    ctx.stroke();
    this.end();
  }

  paintTrees() {
    const ctx = this.begin();
    const rng = new Rng(31);
    const W = COLS * ZONE_W;
    const H = ROWS * ZONE_H;
    const spots = [];
    for (let x = WORLD.x0 + 30; x < WORLD.x1; x += 70) {
      spots.push([x + rng.range(-12, 12), WORLD.y0 + 50 + rng.range(-20, 30)]);
      if (Math.abs(x - GATE.x) > 190) spots.push([x + rng.range(-12, 12), H + 120 + rng.range(-10, 60)]);
    }
    for (let y = WORLD.y0 + 110; y < H + 80; y += 70) {
      spots.push([WORLD.x0 + 52 + rng.range(-24, 24), y + rng.range(-10, 10)]);
      spots.push([W + 98 + rng.range(-24, 24), y + rng.range(-10, 10)]);
    }
    spots.sort((a, b) => a[1] - b[1]);
    for (const [x, y] of spots) tree(ctx, x, y, rng.range(0.8, 1.2), rng);
    this.end();
  }

  // ---------------------------------------------------------------- zones

  paintZone(zoo, b) {
    const z = zoneRect(b);
    const inner = { x: z.x + ROAD / 2, y: z.y + ROAD / 2, w: z.w - ROAD, h: z.h - ROAD };
    const ctx = this.begin(inner);
    const biome = BIOMES[b];
    const locked = !zoo.isUnlocked(b);
    const rng = new Rng(mix(b + 1, 99));
    if (locked) {
      // a quiet, misty lot waiting to be opened
      ctx.fillStyle = mixColor(biome.ground, '#ece6da', 0.55);
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      ctx.globalAlpha = 0.35;
      floorTexture(ctx, biome.id, inner, rng);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#c8a070';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.roundRect(inner.x + 14, inner.y + 18, inner.w - 28, inner.h - 30, 12);
      ctx.stroke();
      for (let x = inner.x + 14; x <= inner.x + inner.w - 14; x += 46) for (const y of [inner.y + 18, inner.y + inner.h - 12]) post(ctx, x, y, '#d8b080');
      for (let y = inner.y + 64; y <= inner.y + inner.h - 40; y += 46) for (const x of [inner.x + 14, inner.x + inner.w - 14]) post(ctx, x, y, '#d8b080');
      this.end();
      return;
    }
    ctx.fillStyle = biome.ground;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    floorTexture(ctx, biome.id, inner, rng);
    for (let s = 0; s < DECO_SPOTS_PER_BIOME; s++) {
      const p = decoSpot(b * DECO_SPOTS_PER_BIOME + s);
      ell(ctx, p.x, p.y + 4, 34, 15);
      ctx.fillStyle = biome.id === 'night' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.32)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(120,90,60,0.18)';
      ctx.stroke();
    }
    for (let p = 0; p < PLOTS_PER_BIOME; p++) {
      const i = b * PLOTS_PER_BIOME + p;
      paintHabitat(ctx, zoo, i, new Rng(mix(i + 7, 3)));
    }
    this.end();
  }
}

function mixColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (n, sh) => ((n >> sh) & 255);
  const m = (sh) => Math.round(ch(pa, sh) + (ch(pb, sh) - ch(pa, sh)) * t);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

function post(ctx, x, y, col) {
  ctx.beginPath();
  ctx.roundRect(x - 3, y - 12, 6, 16, 2);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.strokeStyle = ink(col);
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

export function tree(ctx, x, y, s, rng, palette = ['#4aa84a', '#5ab85a', '#6cc66a']) {
  ctx.fillStyle = 'rgba(40,70,30,0.22)';
  ell(ctx, x, y + 6 * s, 26 * s, 9 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x - 5 * s, y - 18 * s, 10 * s, 24 * s, 3 * s);
  ctx.fillStyle = '#8a5a3a';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#5a3a24';
  ctx.stroke();
  const puffs = [[0, -40, 22], [-16, -30, 16], [16, -30, 16], [0, -24, 18]];
  for (const [dx, dy, r] of puffs) blob(ctx, x + dx * s, y + dy * s, r * s, palette[0], '#2f7a34');
  for (const [dx, dy, r] of puffs) blob(ctx, x + dx * s - 2 * s, y + dy * s - 3 * s, r * s * 0.8, palette[1]);
  blob(ctx, x - 6 * s, y - 46 * s, 8 * s, palette[2]);
  if (rng && rng.next() < 0.3) for (let k = 0; k < 3; k++) blob(ctx, x + rng.range(-16, 16) * s, y + rng.range(-46, -24) * s, 2.6 * s, '#ff6b6b');
}

function palm(ctx, x, y, s) {
  ctx.lineWidth = 7 * s;
  ctx.strokeStyle = '#a8763a';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 6 * s, y - 30 * s, x + 2 * s, y - 56 * s);
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    ell(ctx, x + 2 * s + Math.cos(a) * 16 * s, y - 56 * s + Math.sin(a) * 7 * s, 18 * s, 6 * s, a);
    ctx.fillStyle = k % 2 ? '#3aa84a' : '#4ac05a';
    ctx.fill();
    ctx.strokeStyle = '#2a7a34';
    ctx.stroke();
  }
}

function acacia(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(80,60,20,0.2)';
  ell(ctx, x, y + 4, 34 * s, 8 * s);
  ctx.fill();
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = '#7a5032';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 26 * s);
  ctx.lineTo(x - 14 * s, y - 40 * s);
  ctx.moveTo(x, y - 26 * s);
  ctx.lineTo(x + 14 * s, y - 42 * s);
  ctx.stroke();
  ctx.lineWidth = 2;
  ell(ctx, x, y - 46 * s, 40 * s, 11 * s);
  ctx.fillStyle = '#7ab04a';
  ctx.fill();
  ctx.strokeStyle = '#4a7a2a';
  ctx.stroke();
  ell(ctx, x - 6 * s, y - 50 * s, 26 * s, 6 * s);
  ctx.fillStyle = '#9ac85a';
  ctx.fill();
}

function rock(ctx, x, y, s, col = '#b8b0c0') {
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 20 * s, y);
  ctx.quadraticCurveTo(x - 22 * s, y - 16 * s, x - 6 * s, y - 20 * s);
  ctx.quadraticCurveTo(x + 14 * s, y - 24 * s, x + 20 * s, y - 6 * s);
  ctx.quadraticCurveTo(x + 22 * s, y + 2 * s, x - 20 * s, y);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.strokeStyle = ink(col);
  ctx.stroke();
  ell(ctx, x - 6 * s, y - 14 * s, 7 * s, 3 * s, -0.3);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
}

function floorTexture(ctx, id, r, rng) {
  const n = 160;
  for (let k = 0; k < n; k++) {
    const x = rng.range(r.x, r.x + r.w);
    const y = rng.range(r.y, r.y + r.h);
    if (id === 'meadow') {
      ell(ctx, x, y, 3, 3);
      ctx.fillStyle = ['#ffffff', '#ffe27a', '#ffb8d0', '#c8f0a0'][k % 4];
      ctx.fill();
    } else if (id === 'savanna') {
      ctx.strokeStyle = '#c8a050';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - 4, y); ctx.lineTo(x - 6, y - 7);
      ctx.moveTo(x, y); ctx.lineTo(x, y - 9);
      ctx.moveTo(x + 4, y); ctx.lineTo(x + 6, y - 7);
      ctx.stroke();
    } else if (id === 'jungle') {
      ell(ctx, x, y, 10, 4, rng.range(0, 3));
      ctx.fillStyle = k % 2 ? 'rgba(40,120,50,0.45)' : 'rgba(140,220,110,0.35)';
      ctx.fill();
    } else if (id === 'ocean') {
      ell(ctx, x, y, 2, 1.4);
      ctx.fillStyle = k % 3 ? 'rgba(200,170,110,0.5)' : '#ffffff';
      ctx.fill();
      if (k % 23 === 0) { ctx.save(); ctx.translate(x, y); ctx.rotate(rng.range(0, 3)); starfish(ctx, 0, 0, 5); ctx.restore(); }
    } else if (id === 'arctic') {
      ell(ctx, x, y, rng.range(6, 16), rng.range(2, 5));
      ctx.fillStyle = k % 2 ? 'rgba(170,210,235,0.35)' : 'rgba(255,255,255,0.8)';
      ctx.fill();
    } else if (id === 'night') {
      ell(ctx, x, y, 1.4, 1.4);
      ctx.fillStyle = k % 5 ? 'rgba(255,255,255,0.5)' : '#ffe27a';
      ctx.fill();
    }
  }
  if (id === 'night') {
    // the house walls
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#2a2650';
    ctx.strokeRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10);
    ctx.lineWidth = 2;
    for (const [x, y] of [[r.x + 40, r.y + r.h / 2], [r.x + r.w - 40, r.y + r.h / 2]]) {
      ell(ctx, x, y, 10, 10);
      ctx.fillStyle = '#fff2b0';
      ctx.fill();
      ell(ctx, x + 4, y - 3, 8, 8);
      ctx.fillStyle = '#3b3670';
      ctx.fill();
    }
  }
}

function starfish(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#ff9a7a';
  ctx.fill();
}

// ---------------------------------------------------------------- habitats

const FLOORS = {
  meadow: ['#b8ea8e', '#a6de7c'],
  savanna: ['#f6dc96', '#ead08a'],
  jungle: ['#6cc46a', '#5ab45a'],
  ocean: ['#5cc8f0', '#48b8e8'],
  arctic: ['#f2f9ff', '#dcedf8'],
  night: ['#4a4488', '#403c7a'],
};

function paintHabitat(ctx, zoo, i, rng) {
  const p = plotRect(i);
  const h = zoo.habitat(i);
  const b = p.biome;
  const id = BIOMES[b].id;
  if (!h.level) {
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
    ctx.setLineDash([12, 10]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = id === 'night' ? 'rgba(255,255,255,0.4)' : 'rgba(110,80,50,0.4)';
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const [f1, f2] = FLOORS[id];
  ctx.beginPath();
  ctx.roundRect(p.x, p.y, p.w, p.h, 16);
  ctx.fillStyle = f1;
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (id === 'ocean') {
    // sandy rim and a pool
    ctx.fillStyle = '#f6e6b8';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.beginPath();
    ctx.roundRect(p.x + 14, p.y + 22, p.w - 28, p.h - 34, 40);
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    g.addColorStop(0, '#7ad8f8');
    g.addColorStop(1, '#2a9ae0');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      const x = rng.range(p.x + 30, p.x + p.w - 60);
      const y = rng.range(p.y + 40, p.y + p.h - 30);
      ctx.beginPath();
      ctx.arc(x, y, 10, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    for (let k = 0; k < 4; k++) {
      const x = p.x + 30 + k * ((p.w - 60) / 3);
      kelp(ctx, x, p.y + p.h - 18, rng);
    }
  } else {
    for (let k = 0; k < 40; k++) {
      ell(ctx, rng.range(p.x, p.x + p.w), rng.range(p.y, p.y + p.h), rng.range(8, 22), rng.range(4, 9));
      ctx.fillStyle = f2;
      ctx.fill();
    }
    if (id === 'arctic') {
      ell(ctx, p.x + p.w * 0.7, p.y + p.h * 0.62, 46, 22);
      ctx.fillStyle = '#7ad0f0';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
    if (id === 'meadow' && h.level >= 2) {
      ell(ctx, p.x + p.w * 0.74, p.y + p.h * 0.7, 34, 16);
      ctx.fillStyle = '#7ad0f0';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
    if (id === 'savanna' && h.level >= 2) {
      ell(ctx, p.x + p.w * 0.28, p.y + p.h * 0.72, 36, 15);
      ctx.fillStyle = '#6ac0e0';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#c8a050';
      ctx.stroke();
    }
  }
  ctx.restore();
  // back-row props, kept clear of the roaming area
  const back = p.side === 'top' ? p.y + p.h - 12 : p.y + 40;
  const props = h.level >= 3 ? 3 : 2;
  for (let k = 0; k < props; k++) {
    const x = p.x + 30 + (k / Math.max(1, props - 1)) * (p.w - 60);
    const yb = p.side === 'top' ? back : back;
    const s = 0.62 + rng.range(0, 0.12);
    if (k === 1 && props === 3) continue;
    if (id === 'meadow') tree(ctx, x, yb, s * 0.9, rng);
    else if (id === 'savanna') acacia(ctx, x, yb, s * 0.9);
    else if (id === 'jungle') palm(ctx, x, yb, s);
    else if (id === 'ocean') rock(ctx, x, yb - 2, s, '#c8b8a8');
    else if (id === 'arctic') { rock(ctx, x, yb, s * 1.1, '#e8f4ff'); }
    else if (id === 'night') mushrooms(ctx, x, yb, s);
  }
  if (h.level >= 4) {
    // a cozy shelter in a corner
    const x = p.x + p.w - 44;
    const y = p.side === 'top' ? p.y + p.h - 26 : p.y + 52;
    shelter(ctx, x, y, id);
  }
  if (h.level >= 3 && id !== 'ocean') {
    ell(ctx, p.x + 46, p.side === 'top' ? p.y + p.h - 30 : p.y + 60, 9, 9);
    ctx.fillStyle = ['#ff6b8a', '#4fb6ff', '#ffd23f'][i % 3];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(60,30,40,0.5)';
    ctx.stroke();
  }
  fence(ctx, p, h.level, id);
  sign(ctx, p, BIOMES[b].habitats[i % PLOTS_PER_BIOME], h.level);
}

function kelp(ctx, x, y, rng) {
  ctx.strokeStyle = '#3aa86a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + rng.range(-10, 10), y - 18, x + rng.range(-4, 4), y - 30);
  ctx.stroke();
}

function mushrooms(ctx, x, y, s) {
  for (const [dx, r, col] of [[-10, 9, '#7af0d0'], [6, 12, '#b49bff'], [18, 7, '#ffe27a']]) {
    const g = ctx.createRadialGradient(x + dx * s, y - 14 * s, 1, x + dx * s, y - 14 * s, r * 2.6 * s);
    g.addColorStop(0, `${col}88`);
    g.addColorStop(1, `${col}00`);
    ctx.fillStyle = g;
    ctx.fillRect(x + dx * s - r * 3 * s, y - 14 * s - r * 3 * s, r * 6 * s, r * 6 * s);
    ctx.beginPath();
    ctx.roundRect(x + dx * s - 2.5 * s, y - 12 * s, 5 * s, 12 * s, 2);
    ctx.fillStyle = '#f4ecff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + dx * s, y - 12 * s, r * s, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = ink(col);
    ctx.stroke();
  }
}

function shelter(ctx, x, y, id) {
  const roof = { meadow: '#ff7a6a', savanna: '#d9a05a', jungle: '#8a5a3a', ocean: '#ffffff', arctic: '#ffffff', night: '#6a5aaa' }[id];
  const wall = id === 'arctic' ? '#e8f4ff' : id === 'night' ? '#2a2650' : '#f4dcb0';
  ctx.lineWidth = 2;
  if (id === 'arctic') {
    ctx.beginPath();
    ctx.arc(x, y, 22, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#9ac8e0';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 8, Math.PI, 0);
    ctx.fillStyle = '#5a7aa0';
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.roundRect(x - 18, y - 22, 36, 24, 3);
  ctx.fillStyle = wall;
  ctx.fill();
  ctx.strokeStyle = ink(wall);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 24, y - 20);
  ctx.lineTo(x, y - 40);
  ctx.lineTo(x + 24, y - 20);
  ctx.closePath();
  ctx.fillStyle = roof;
  ctx.fill();
  ctx.strokeStyle = ink(roof);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y + 2, 7, Math.PI, 0);
  ctx.fillStyle = '#4a3040';
  ctx.fill();
}

const FENCE = [
  { post: '#a8784a', rail: '#c8945a', gap: 30 },
  { post: '#ffffff', rail: '#ffffff', gap: 18 },
  { hedge: '#4aa84a' },
  { stone: '#c8c0d0' },
  { post: '#ffd23f', rail: '#ffc83a', gap: 22, gold: true },
];

function fence(ctx, p, level, id) {
  const f = FENCE[level - 1];
  const x0 = p.x + 4;
  const y0 = p.y + 6;
  const x1 = p.x + p.w - 4;
  const y1 = p.y + p.h - 4;
  ctx.lineCap = 'round';
  if (f.hedge || f.stone) {
    const col = f.hedge || f.stone;
    const r = f.hedge ? 9 : 8;
    const step = f.hedge ? 14 : 15;
    const pts = [];
    for (let x = x0; x <= x1; x += step) { pts.push([x, y0]); pts.push([x, y1]); }
    for (let y = y0 + step; y < y1; y += step) { pts.push([x0, y]); pts.push([x1, y]); }
    pts.sort((a, b) => a[1] - b[1]);
    for (const [x, y] of pts) {
      if (f.hedge) {
        blob(ctx, x, y, r, col, '#2f7a34');
        blob(ctx, x - 2, y - 2, r * 0.6, '#6cc66a');
      } else {
        ctx.beginPath();
        ctx.roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, 4);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#8a8098';
        ctx.stroke();
      }
    }
    if (f.stone) {
      // flower boxes along the front
      const fy = p.side === 'top' ? y0 : y1;
      for (let x = x0 + 30; x < x1 - 20; x += 42) {
        for (let k = 0; k < 3; k++) blob(ctx, x + k * 6 - 6, fy - 9, 3.4, ['#ff6b9a', '#ffd23f', '#b07aff'][k]);
      }
    }
    return;
  }
  ctx.lineWidth = level === 2 ? 3 : 4;
  ctx.strokeStyle = ink(f.rail);
  const rails = (inset) => {
    ctx.beginPath();
    ctx.roundRect(x0, y0 - inset, x1 - x0, y1 - y0, 6);
    ctx.stroke();
  };
  rails(10);
  ctx.lineWidth = level === 2 ? 1.6 : 2.4;
  ctx.strokeStyle = f.rail;
  rails(10);
  const posts = [];
  for (let x = x0; x <= x1 + 0.1; x += f.gap) { posts.push([x, y0]); posts.push([x, y1]); }
  for (let y = y0 + f.gap; y < y1; y += f.gap) { posts.push([x0, y]); posts.push([x1, y]); }
  posts.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of posts) {
    ctx.beginPath();
    if (level === 2) {
      ctx.moveTo(x - 3, y + 2);
      ctx.lineTo(x - 3, y - 12);
      ctx.lineTo(x, y - 16);
      ctx.lineTo(x + 3, y - 12);
      ctx.lineTo(x + 3, y + 2);
      ctx.closePath();
    } else ctx.roundRect(x - 3.5, y - 16, 7, 19, 2.5);
    ctx.fillStyle = f.post;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = ink(f.post);
    ctx.stroke();
  }
  if (f.gold) {
    for (const [x, y] of [[x0, y0], [x1, y0]]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x, y - 46);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#8a6a3a';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - 46);
      ctx.lineTo(x + 22, y - 40);
      ctx.lineTo(x, y - 33);
      ctx.closePath();
      ctx.fillStyle = BIOMES.find((b) => b.id === id).accent;
      ctx.fill();
    }
  }
}

function sign(ctx, p, name, level) {
  const x = p.x + p.w / 2;
  const y = p.side === 'top' ? p.y - 2 : p.y + p.h + 2;
  ctx.font = `800 12px ${FONT}`;
  const w = Math.max(84, ctx.measureText(name).width + 22);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 13, w, 26, 9);
  ctx.fillStyle = '#fff6e4';
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#a8784a';
  ctx.stroke();
  ctx.fillStyle = '#6a4030';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x, y - 1);
  for (let k = 0; k < level; k++) star(ctx, x - (level - 1) * 6 + k * 12, y + 15, 5.5, '#ffc83a');
}

export const HABITAT_CAPS = HABITAT_LEVELS.map((l) => l.cap);
