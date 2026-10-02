import { clamp, lerp, rng, smoothstep } from './math.js';

export const STEP = 2;           // meters between centerline samples
const GRID = 24;                 // spatial hash cell size in meters
const STRAIGHT_START = 90;       // meters of straight road after the start line
const BOUNDARY = 58;             // how far off the road the jeep may wander

// Rolling dunes as a sum of seeded sine waves. Returns h(x, z) in meters.
export function makeDunes({ seed, duneHeight, duneScale }) {
  const r = rng(seed * 31 + 7);
  const waves = [];
  for (let i = 0; i < 5; i++) {
    const angle = r() * Math.PI * 2;
    const k = (Math.PI * 2) / (duneScale * (1 + i * 0.65));
    waves.push({ kx: Math.cos(angle) * k, kz: Math.sin(angle) * k, phase: r() * Math.PI * 2, amp: duneHeight / (1 + i * 0.8) });
  }
  return (x, z) => {
    let h = 0;
    for (const w of waves) h += Math.sin(x * w.kx + z * w.kz + w.phase) * w.amp;
    return h;
  };
}

// Winding centerline from a smoothed random walk of the curvature. Retries with
// a new sub-seed until the road never comes close to crossing itself.
export function generateCenterline({ seed, length, curviness, maxTurn, width }) {
  const n = Math.ceil(length / STEP);
  const clearance = width * 2 + 50;
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = rng(seed * 1000 + attempt);
    const pts = [];
    let x = 0, z = 0, heading = 0, turn = 0, targetTurn = 0, segLeft = 0;
    for (let i = 0; i <= n; i++) {
      pts.push({ x, z });
      const d = i * STEP;
      if (segLeft <= 0) {
        const sharp = r() < curviness;
        targetTurn = (r() * 2 - 1) * maxTurn * (sharp ? 1 : 0.25);
        segLeft = 50 + r() * 110;
      }
      // Keep the road heading roughly "forward" so it never spirals.
      if (Math.abs(heading) > 1.6) targetTurn = -Math.sign(heading) * maxTurn * 0.8;
      segLeft -= STEP;
      turn += (targetTurn - turn) * 0.05;
      if (d > STRAIGHT_START) heading += turn * STEP;
      x += Math.sin(heading) * STEP;
      z += Math.cos(heading) * STEP;
    }
    if (!selfApproaches(pts, clearance)) return pts;
  }
  throw new Error(`Could not generate a track for seed ${seed}`);
}

function selfApproaches(pts, clearance) {
  const gap = Math.ceil((clearance * 3) / STEP); // ignore neighbors along the road
  const c2 = clearance * clearance;
  for (let i = 0; i < pts.length; i += 3) {
    for (let j = i + gap; j < pts.length; j += 3) {
      const dx = pts[i].x - pts[j].x, dz = pts[i].z - pts[j].z;
      if (dx * dx + dz * dz < c2) return true;
    }
  }
  return false;
}

export class Track {
  constructor(def) {
    this.def = def;
    this.width = def.width;
    this.half = def.width / 2;
    this.dunes = makeDunes(def);

    const pts = generateCenterline(def);
    this.samples = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: p.x, z: p.z, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len, dist: i * STEP, y: 0 };
    });
    this.length = (pts.length - 1) * STEP;
    this.startDist = 14;
    this.finishDist = this.length - 40;

    this.buildRoadHeights();
    this.buildGrid();
  }

  // The road follows a heavily smoothed version of the dunes so it rolls
  // gently; crests give small jumps.
  buildRoadHeights() {
    const raw = this.samples.map((s) => this.dunes(s.x, s.z) * (this.def.roadHills ?? 0.7));
    const win = 20;
    for (let i = 0; i < raw.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(raw.length - 1, i + win); j++) { sum += raw[j]; count++; }
      this.samples[i].y = sum / count;
    }
  }

  buildGrid() {
    this.grid = new Map();
    this.samples.forEach((s, i) => {
      const key = this.cellKey(Math.floor(s.x / GRID), Math.floor(s.z / GRID));
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(i);
    });
  }

  cellKey(cx, cz) {
    return cx * 100003 + cz;
  }

  // Projects (x, z) onto the segment starting at sample i. Past either end
  // of the road, `over` is how far beyond it the point is (negative behind
  // the start) and counts toward the distance from the road.
  project(i, x, z) {
    const s = this.samples[i];
    const raw = s.dist + (x - s.x) * s.dx + (z - s.z) * s.dz;
    const lateral = (x - s.x) * s.dz - (z - s.z) * s.dx; // signed sideways offset
    const over = raw < 0 ? raw : raw > this.length ? raw - this.length : 0;
    return { index: i, along: clamp(raw, 0, this.length), lateral, over, distance: over ? Math.hypot(lateral, over) : Math.abs(lateral) };
  }

  // Nearest road point to (x, z) anywhere on the track, or null if farther
  // than ~2 grid cells from the road.
  nearest(x, z) {
    const cx = Math.floor(x / GRID), cz = Math.floor(z / GRID);
    let best = -1, bestD = Infinity;
    for (let ox = -2; ox <= 2; ox++) {
      for (let oz = -2; oz <= 2; oz++) {
        const cell = this.grid.get(this.cellKey(cx + ox, cz + oz));
        if (!cell) continue;
        for (const i of cell) {
          const s = this.samples[i];
          const d = (s.x - x) ** 2 + (s.z - z) ** 2;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    return best < 0 ? null : this.project(best, x, z);
  }

  // Slow fallback for points far from the road (scenery, terrain edges):
  // checks every 5th sample and returns the true distance to that point.
  nearestCoarse(x, z) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.samples.length; i += 5) {
      const s = this.samples[i];
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return { ...this.project(best, x, z), distance: Math.sqrt(bestD) };
  }

  // Nearest road point searching only near a previous index. Use this for
  // things that move along the track so they never "jump" to another stretch.
  nearestLocal(x, z, hint, window = 40) {
    let best = hint, bestD = Infinity;
    const lo = Math.max(0, hint - window), hi = Math.min(this.samples.length - 1, hint + window);
    for (let i = lo; i <= hi; i++) {
      const s = this.samples[i];
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return this.project(best, x, z);
  }

  // Interpolated centerline point at a distance along the track, optionally
  // shifted sideways (same sign convention as project().lateral).
  pointAt(dist, lateral = 0) {
    const f = clamp(dist, 0, this.length) / STEP;
    const i = Math.min(this.samples.length - 2, Math.floor(f));
    const t = f - i;
    const a = this.samples[i], b = this.samples[i + 1];
    const dx = lerp(a.dx, b.dx, t), dz = lerp(a.dz, b.dz, t);
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    return {
      x: lerp(a.x, b.x, t) + nz * lateral,
      z: lerp(a.z, b.z, t) - nx * lateral,
      y: lerp(a.y, b.y, t),
      dx: nx, dz: nz,
      heading: Math.atan2(nx, nz),
    };
  }

  roadHeightAt(dist) {
    return this.pointAt(dist).y;
  }

  // Ground height anywhere: the road surface near the road, blending into the
  // dunes (and canyon walls on tracks that have them) farther out.
  groundHeight(x, z, near = this.nearest(x, z)) {
    if (!near) near = this.nearestCoarse(x, z);
    const dunes = this.dunes(x, z);
    const d = near.distance;
    const road = this.roadHeightAt(near.along);
    const wild = dunes * (1 + 0.5 * smoothstep(30, 120, d));
    return lerp(road, wild, smoothstep(this.half + 1, this.half + 22, d)) + this.wallHeight(d);
  }

  wallHeight(d) {
    const w = this.def.walls;
    if (!w) return 0;
    return w.height * smoothstep(this.half + w.from, this.half + w.from + 14, d);
  }

  // Soft limit on how far the jeep may leave the road.
  get boundary() {
    return this.half + BOUNDARY;
  }

  // Canyon walls are too steep to drive up: the jeep stops at their foot.
  get wallLimit() {
    return this.def.walls ? this.half + this.def.walls.from : Infinity;
  }
}
