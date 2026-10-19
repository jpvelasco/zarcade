import { clamp, lerp, rng, TAU, wrapAngle } from './math.js';

// Track geometry for one race. Pure data and math, no rendering.
//
// Conventions: heading h points along (sin h, cos h) in the x/z plane, and
// a car's right-hand side is (-cos h, sin h). Lateral offsets are measured to
// the right of the track direction.

export const STEP = 2;          // target meters between centerline samples
export const RUNOFF = 3;        // meters between the road edge and the wall
export const GATES = 8;         // checkpoint gates per lap
const GRID = 16;                // spatial hash cell for walls and props
const MIN_RADIUS = 17;          // tightest allowed corner radius, meters

// ---------------------------------------------------------------- generation

// Centripetal Catmull-Rom point between p1 and p2.
function catmull(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = lerp(t1, t2, t);
  const mix = (a, b, ta, tb) => {
    const k = (tt - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  };
  const a1 = mix(p0, p1, t0, t1), a2 = mix(p1, p2, t1, t2), a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2), b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

// Resamples a polyline at (nearly) equal spacing. For closed loops the
// spacing is adjusted so the last sample meets the first exactly.
function resample(dense, closed) {
  const pts = closed ? [...dense, dense[0]] : dense;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const total = cum[cum.length - 1];
  const n = Math.max(8, Math.round(total / STEP));
  const step = total / n;
  const out = [];
  let j = 0;
  for (let i = 0; i < (closed ? n : n + 1); i++) {
    const d = Math.min(total, i * step);
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = (d - cum[j]) / seg;
    out.push({ x: lerp(pts[j].x, pts[j + 1].x, t), z: lerp(pts[j].z, pts[j + 1].z, t) });
  }
  return { pts: out, step, length: total };
}

function headings(pts, closed) {
  const n = pts.length;
  return pts.map((_, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    return Math.atan2(b.x - a.x, b.z - a.z);
  });
}

// Signed curvature (heading change per meter), averaged over +-win samples.
function curvatures(hs, step, closed, win) {
  const n = hs.length;
  const idx = (i) => (closed ? (i + n) % n : clamp(i, 0, n - 1));
  return hs.map((_, i) => {
    const a = idx(i - win), b = idx(i + win);
    const span = closed ? 2 * win : b - a;
    return span ? wrapAngle(hs[b] - hs[a]) / (span * step) : 0;
  });
}

// True when any two samples that are far apart along the road come closer
// than `clearance` in space, or a corner is tighter than MIN_RADIUS.
export function violatesClearance(pts, step, closed, clearance) {
  const n = pts.length;
  const gap = Math.ceil((clearance * 2.2) / step);
  const c2 = clearance * clearance;
  for (let i = 0; i < n; i += 2) {
    for (let j = i + gap; j < n; j += 2) {
      if (closed && n - (j - i) < gap) continue;
      const dx = pts[i].x - pts[j].x, dz = pts[i].z - pts[j].z;
      if (dx * dx + dz * dz < c2) return true;
    }
  }
  const curv = curvatures(headings(pts, closed), step, closed, 2);
  return curv.some((k) => Math.abs(k) > 1 / MIN_RADIUS);
}

// A star-shaped closed loop: seeded radii around the origin, smoothed with a
// closed spline. Retries with a new sub-seed until the loop is clean.
export function generateCircuit({ seed, radius, wobble, points, width }) {
  const clearance = width + RUNOFF * 2 + 16;
  for (let attempt = 0; attempt < 120; attempt++) {
    const r = rng(seed * 1000 + attempt);
    const ctrl = [];
    for (let k = 0; k < points; k++) {
      const a = (TAU * k) / points + (r() - 0.5) * 0.55 * (TAU / points);
      const rad = radius * (1 + wobble * (r() * 2 - 1));
      ctrl.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad });
    }
    const dense = [];
    for (let k = 0; k < points; k++) {
      const p0 = ctrl[(k - 1 + points) % points], p1 = ctrl[k], p2 = ctrl[(k + 1) % points], p3 = ctrl[(k + 2) % points];
      for (let s = 0; s < 40; s++) dense.push(catmull(p0, p1, p2, p3, s / 40));
    }
    const res = resample(dense, true);
    if (!violatesClearance(res.pts, res.step, true, clearance)) return { ...res, attempt };
  }
  throw new Error(`Could not generate a circuit for seed ${seed}`);
}

// Open point-to-point road from a smoothed random walk of the curvature.
export function generateSprint({ seed, length, curviness, maxTurn, width }) {
  const n = Math.ceil(length / STEP);
  const clearance = width + RUNOFF * 2 + 30;
  for (let attempt = 0; attempt < 120; attempt++) {
    const r = rng(seed * 1000 + attempt);
    const pts = [];
    let x = 0, z = 0, heading = 0, turn = 0, targetTurn = 0, segLeft = 0;
    for (let i = 0; i <= n; i++) {
      pts.push({ x, z });
      const d = i * STEP;
      if (segLeft <= 0) {
        const sharp = r() < curviness;
        targetTurn = (r() * 2 - 1) * maxTurn * (sharp ? 1 : 0.3);
        segLeft = 40 + r() * 90;
      }
      if (Math.abs(heading) > 1.5) targetTurn = -Math.sign(heading) * maxTurn * 0.8;
      segLeft -= STEP;
      turn += (targetTurn - turn) * 0.06;
      if (d > 110) heading += turn * STEP;
      x += Math.sin(heading) * STEP;
      z += Math.cos(heading) * STEP;
    }
    if (!violatesClearance(pts, STEP, false, clearance)) return { pts, step: STEP, length: n * STEP, attempt };
  }
  throw new Error(`Could not generate a sprint for seed ${seed}`);
}

// ---------------------------------------------------------------- track

export class Track {
  constructor(location, kind = 'circuit') {
    this.location = location;
    this.kind = kind === 'sprint' ? 'sprint' : 'circuit';
    this.closed = this.kind === 'circuit';
    this.id = `${location.id}-${this.kind}`;
    const spec = this.closed ? location.circuit : location.sprint;
    this.spec = spec;
    this.width = spec.width;
    this.half = spec.width / 2;
    this.wallOffset = this.half + RUNOFF;
    this.offroad = location.offroad;
    const gen = this.closed ? generateCircuit(spec) : generateSprint(spec);
    this.step = gen.step;
    this.length = this.closed ? gen.length : (gen.pts.length - 1) * gen.step;
    let pts = gen.pts;
    if (this.closed) pts = this.rotateToStraight(pts);
    this.buildSamples(pts);
    this.startDist = this.closed ? 0 : 46;
    this.finishDist = this.closed ? this.length : this.length - 40;
    this.r = rng(spec.seed * 7919 + 13);

    this.ramps = [];
    this.buildSurfaces();
    this.shortcuts = this.closed ? this.findShortcuts(spec.shortcuts || 0) : [];
    this.ramps = this.placeRamps();
    this.buildWalls();
    this.props = this.placeProps();
    this.pads = this.placePads();
    this.coins = this.placeCoins();
    this.gates = this.placeGates();
    this.buildGrid();
  }

  // Puts sample 0 a little past the start of the straightest stretch, so the
  // grid sits on a straight behind the line.
  rotateToStraight(pts) {
    const n = pts.length;
    const curv = curvatures(headings(pts, true), this.step, true, 3);
    let best = 0, bestScore = Infinity;
    const back = Math.round(60 / this.step), ahead = Math.round(40 / this.step);
    for (let i = 0; i < n; i++) {
      let score = 0;
      for (let k = -back; k <= ahead; k++) score += Math.abs(curv[(i + k + n) % n]);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return pts.map((_, i) => pts[(i + best) % n]);
  }

  buildSamples(pts) {
    const n = pts.length;
    const hs = headings(pts, this.closed);
    const curv = curvatures(hs, this.step, this.closed, 4);
    const wide = curvatures(hs, this.step, this.closed, 10);
    const spec = this.spec;
    const r = rng(spec.seed * 31 + 5);
    const waves = [1, 2, 3].map((k) => ({ k, amp: (spec.hills || 0) / k, phase: r() * TAU }));
    const L = this.length;
    this.samples = pts.map((p, i) => {
      const dist = i * this.step;
      let y = spec.base || 0;
      if (this.closed) for (const w of waves) y += Math.sin((TAU * w.k * dist) / L + w.phase) * w.amp;
      else for (const w of waves) y += Math.sin((dist / (380 / w.k)) * TAU + w.phase) * w.amp * Math.min(1, dist / 150);
      return {
        x: p.x, z: p.z, y, dx: Math.sin(hs[i]), dz: Math.cos(hs[i]), heading: hs[i], dist, curv: curv[i], wide: wide[i],
        surface: this.location.surface, line: 0,
      };
    });
    // Racing line: inside of corners, eased in and out.
    const raw = wide.map((k) => clamp(-k * 32, -1, 1) * 0.62 * this.half);
    const win = 8;
    for (let i = 0; i < n; i++) {
      let sum = 0, count = 0;
      for (let k = -win; k <= win; k++) {
        const j = this.closed ? (i + k + n) % n : clamp(i + k, 0, n - 1);
        sum += raw[j]; count++;
      }
      this.samples[i].line = sum / count;
    }
    // Total turning tells which side of the road faces the infield.
    let turn = 0;
    for (let i = 0; i < n; i++) turn += wrapAngle(hs[(i + 1) % n] - hs[i]);
    this.interiorSide = this.closed ? (turn > 0 ? -1 : 1) : 0;
  }

  buildSurfaces() {
    const loc = this.location;
    if (!loc.patch || !(loc.patchShare > 0)) return;
    const r = rng(this.spec.seed * 97 + 3);
    let d = 70;
    const end = this.closed ? this.length - 50 : this.finishDist;
    while (d < end) {
      const len = 30 + r() * 60;
      const gap = len * (1 / loc.patchShare - 1) * (0.6 + r() * 0.8);
      d += gap;
      for (let x = d; x < Math.min(end, d + len); x += this.step) this.samples[this.indexAt(x)].surface = loc.patch;
      d += len;
    }
  }

  // ------------------------------------------------------------ lookup

  wrap(d) {
    if (this.closed) return ((d % this.length) + this.length) % this.length;
    return clamp(d, 0, this.length);
  }

  indexAt(d) {
    const n = this.samples.length;
    const i = Math.floor(this.wrap(d) / this.step);
    return this.closed ? i % n : Math.min(n - 1, i);
  }

  sample(i) {
    const n = this.samples.length;
    return this.samples[this.closed ? ((i % n) + n) % n : clamp(i, 0, n - 1)];
  }

  // Interpolated centerline point at distance d, shifted `lateral` meters to
  // the right.
  pointAt(d, lateral = 0) {
    const n = this.samples.length;
    const f = this.wrap(d) / this.step;
    let i = Math.floor(f);
    if (!this.closed) i = Math.min(n - 2, i);
    const t = f - i;
    const a = this.sample(i), b = this.sample(i + 1);
    let h = a.heading + wrapAngle(b.heading - a.heading) * t;
    const dx = Math.sin(h), dz = Math.cos(h);
    return {
      x: lerp(a.x, b.x, t) - dz * lateral,
      z: lerp(a.z, b.z, t) + dx * lateral,
      y: lerp(a.y, b.y, t),
      dx, dz, heading: h,
    };
  }

  // Projection of (x, z) onto the segment that starts at sample i.
  project(i, x, z) {
    const s = this.sample(i);
    const ox = x - s.x, oz = z - s.z;
    const along = s.dist + ox * s.dx + oz * s.dz;
    const lateral = -ox * s.dz + oz * s.dx;
    return { index: this.closed ? ((i % this.samples.length) + this.samples.length) % this.samples.length : i, along: this.wrap(along), lateral };
  }

  // Nearest centerline point searching only around a previous index, so
  // things that move along the road never jump to another stretch.
  nearestLocal(x, z, hint, window = 12) {
    const n = this.samples.length;
    let best = hint, bestD = Infinity;
    for (let k = -window; k <= window; k++) {
      let i = hint + k;
      if (this.closed) i = (i + n) % n;
      else if (i < 0 || i >= n) continue;
      const s = this.samples[i];
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    // Use the segment behind the nearest sample when the point is behind it.
    const s = this.samples[best];
    if ((x - s.x) * s.dx + (z - s.z) * s.dz < 0 && (this.closed || best > 0)) best = this.closed ? (best - 1 + n) % n : best - 1;
    return this.project(best, x, z);
  }

  nearestGlobal(x, z) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i];
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return this.nearestLocal(x, z, best, 2);
  }

  // Road height at a distance, including ramp wedges.
  heightAt(d) {
    let y = this.pointAt(d).y;
    for (const r of this.ramps) {
      const k = (this.wrap(d) - r.dist) / r.length;
      if (k >= 0 && k <= 1) y += r.height * k;
    }
    return y;
  }

  surfaceAt(index, lateral) {
    return Math.abs(lateral) <= this.half + 0.4 ? this.sample(index).surface : this.offroad;
  }

  // Distance of `a` ahead of `b` along a lap, in (-length/2, length/2].
  delta(a, b) {
    let d = a - b;
    if (this.closed) {
      if (d > this.length / 2) d -= this.length;
      if (d <= -this.length / 2) d += this.length;
    }
    return d;
  }

  // ------------------------------------------------------------ shortcuts

  // Chords across the infield of a bend, entered and left through gaps in
  // the inner wall. Saves distance but runs on loose ground.
  findShortcuts(count) {
    if (!count || !this.interiorSide) return [];
    const out = [];
    const side = this.interiorSide;
    const minClear = this.wallOffset + 5;
    const candidates = [];
    const n = this.samples.length;
    for (let i = Math.round(90 / this.step); i < n - Math.round(200 / this.step); i += 3) {
      for (let span = 70; span <= 170; span += 10) {
        const a = i * this.step, b = a + span;
        if (b > this.length - 70) continue;
        const pa = this.pointAt(a, side * this.half * 0.45), pb = this.pointAt(b, side * this.half * 0.45);
        const chord = Math.hypot(pb.x - pa.x, pb.z - pa.z);
        if (chord < 40) continue;
        const ratio = span / chord;
        if (ratio < 1.3 || ratio > 2.2) continue;
        // The bend must turn toward the infield.
        const turn = wrapAngle(this.pointAt(b).heading - this.pointAt(a).heading);
        if (Math.sign(turn) !== -side || Math.abs(turn) < 0.8) continue;
        candidates.push({ a, b, pa, pb, chord, score: span - chord - Math.abs(ratio - 1.6) * 20 });
      }
    }
    candidates.sort((p, q) => q.score - p.score);
    for (const c of candidates) {
      if (out.length >= count) break;
      if (out.some((s) => Math.abs(s.a - c.a) < 250)) continue;
      // Clearance from every part of the road, away from the two ends.
      let ok = true, crossA = null, crossB = null;
      for (let t = 0; t <= c.chord; t += 2) {
        const k = t / c.chord;
        const x = lerp(c.pa.x, c.pb.x, k), z = lerp(c.pa.z, c.pb.z, k);
        const near = this.nearestGlobal(x, z);
        const off = Math.abs(near.lateral);
        if (off > this.wallOffset && crossA === null) crossA = near.along;
        if (off > this.wallOffset) crossB = null;
        else if (crossA !== null && crossB === null) crossB = near.along;
        if (t > 22 && t < c.chord - 22 && off < minClear) { ok = false; break; }
      }
      if (!ok || crossA === null || crossB === null) continue;
      out.push({
        id: out.length, a: c.a, b: c.b, side, half: 4,
        ax: c.pa.x, az: c.pa.z, bx: c.pb.x, bz: c.pb.z, len: c.chord,
        ya: this.heightAt(c.a), yb: this.heightAt(c.b),
        dx: (c.pb.x - c.pa.x) / c.chord, dz: (c.pb.z - c.pa.z) / c.chord,
        crossA, crossB, surface: this.location.offroad === 'asphalt' ? 'dirt' : this.location.offroad,
      });
    }
    return out;
  }

  // Projection onto a shortcut: t in [0, 1] along it and lateral offset.
  projectShortcut(sc, x, z) {
    const ox = x - sc.ax, oz = z - sc.az;
    const along = ox * sc.dx + oz * sc.dz;
    const lateral = -ox * sc.dz + oz * sc.dx;
    return { t: along / sc.len, lateral };
  }

  shortcutAt(x, z) {
    for (const sc of this.shortcuts) {
      const p = this.projectShortcut(sc, x, z);
      if (p.t >= 0 && p.t <= 1 && Math.abs(p.lateral) <= sc.half + 4) return { sc, ...p };
    }
    return null;
  }

  // ------------------------------------------------------------ walls

  inGap(side, d) {
    for (const sc of this.shortcuts) {
      if (side !== sc.side) continue;
      if (Math.abs(this.delta(d, sc.crossA)) < 11 || Math.abs(this.delta(d, sc.crossB)) < 11) return true;
    }
    return false;
  }

  buildWalls() {
    this.walls = [];
    const n = this.samples.length;
    const every = 2;
    for (const side of [-1, 1]) {
      const count = this.closed ? n : n - 1;
      for (let i = 0; i < count; i += every) {
        const j = this.closed ? (i + every) % n : Math.min(n - 1, i + every);
        const sa = this.samples[i];
        const da = sa.dist, db = this.samples[j].dist;
        const mid = this.closed ? this.wrap(da + this.step * every * 0.5) : (da + db) / 2;
        if (this.inGap(side, mid)) continue;
        const pa = this.pointAt(da, side * this.wallOffset), pb = this.pointAt(db, side * this.wallOffset);
        this.addWall(pa.x, pa.z, pb.x, pb.z, sa.x, sa.z, (pa.y + pb.y) / 2, { side, dist: da });
      }
    }
    // Sprint end caps behind the grid and past the finish.
    if (!this.closed) {
      for (const [d, toward] of [[1, 1], [this.length - 1, -1]]) {
        const p = this.pointAt(d);
        const l = this.pointAt(d, -this.wallOffset), rr = this.pointAt(d, this.wallOffset);
        this.addWall(l.x, l.z, rr.x, rr.z, p.x + p.dx * toward * 10, p.z + p.dz * toward * 10, p.y, { cap: true, dist: d });
      }
    }
    // Shortcut posts: short walls flanking the gaps so the opening reads.
  }

  // Adds a wall segment whose normal points toward (insideX, insideZ).
  addWall(ax, az, bx, bz, insideX, insideZ, y, extra = {}) {
    const ex = bx - ax, ez = bz - az;
    const len = Math.hypot(ex, ez) || 1;
    let nx = -ez / len, nz = ex / len;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if ((insideX - mx) * nx + (insideZ - mz) * nz < 0) { nx = -nx; nz = -nz; }
    this.walls.push({ id: this.walls.length, ax, az, bx, bz, ex, ez, len, nx, nz, y, ...extra });
  }

  // ------------------------------------------------------------ placement

  // Long, nearly straight stretches (for ramps, pads, coins), as distances.
  straightSpots(minGap, margin) {
    const spots = [];
    const n = this.samples.length;
    const win = Math.round(24 / this.step);
    const lo = this.closed ? Math.round(110 / this.step) : Math.round((this.startDist + 90) / this.step);
    const hi = this.closed ? n - Math.round(70 / this.step) : Math.round((this.finishDist - 60) / this.step);
    for (let i = lo; i < hi; i += 2) {
      let worst = 0;
      for (let k = -win; k <= win; k++) worst = Math.max(worst, Math.abs(this.sample(i + k).curv));
      if (worst > 0.008) continue;
      const d = i * this.step;
      if (this.shortcuts.some((sc) => d > sc.a - margin && d < sc.b + margin)) continue;
      if (spots.length && d - spots[spots.length - 1] < minGap) continue;
      spots.push(d);
    }
    return spots;
  }

  placeRamps() {
    const spots = this.straightSpots(260, 40);
    const want = this.closed ? 1 : 2;
    const picks = [];
    for (let k = 0; k < spots.length && picks.length < want; k++) {
      const d = spots[Math.floor((k + 0.5) * spots.length / Math.max(want, 1)) % spots.length] ?? spots[k];
      if (picks.some((p) => Math.abs(this.delta(p.dist, d)) < 200)) continue;
      picks.push({ id: picks.length, dist: d, length: 7, height: 1.25 });
    }
    return picks;
  }

  placePads() {
    const pads = [];
    const spots = this.straightSpots(90, 30).filter((d) => !this.ramps.some((r) => Math.abs(this.delta(r.dist, d)) < 40));
    const want = this.closed ? 3 : 4;
    for (let k = 0; k < want && spots.length; k++) {
      const d = spots[Math.floor((k * spots.length) / want)];
      if (pads.some((p) => Math.abs(this.delta(p.dist, d)) < 60)) continue;
      const lateral = (this.r() * 2 - 1) * (this.half - 3);
      pads.push({ id: pads.length, dist: d, lateral, length: 6, width: 4 });
    }
    return pads;
  }

  placeCoins() {
    const coins = [];
    const rows = this.closed ? 7 : 9;
    const span = this.closed ? this.length - 80 : this.finishDist - this.startDist - 120;
    const first = this.closed ? 50 : this.startDist + 70;
    for (let k = 0; k < rows; k++) {
      const d0 = first + ((k + this.r() * 0.5) * span) / rows;
      const i = this.indexAt(d0);
      const lat0 = clamp(this.samples[i].line * 0.6 + (this.r() * 2 - 1) * 2, -this.half + 1.5, this.half - 1.5);
      for (let c = 0; c < 5; c++) {
        const p = this.pointAt(d0 + c * 5, lat0);
        coins.push({ id: coins.length, x: p.x, z: p.z, y: this.heightAt(d0 + c * 5) + 1, dist: this.wrap(d0 + c * 5) });
      }
    }
    for (const sc of this.shortcuts) {
      for (let c = 1; c <= 5; c++) {
        const t = 0.25 + c * 0.09;
        coins.push({ id: coins.length, x: lerp(sc.ax, sc.bx, t), z: lerp(sc.az, sc.bz, t), y: lerp(sc.ya, sc.yb, t) + 1, dist: lerp(sc.a, sc.b, t), shortcut: sc.id });
      }
    }
    return coins;
  }

  // Tyre stacks on the outside of tight corners, hay bales and rocks lining
  // shortcuts. Round, solid; cars slide around them.
  placeProps() {
    const props = [];
    const n = this.samples.length;
    for (let i = 0; i < n; i += Math.round(10 / this.step)) {
      const s = this.samples[i];
      if (Math.abs(s.curv) < 1 / 34) continue;
      if (!this.closed && (s.dist < this.startDist + 20 || s.dist > this.finishDist)) continue;
      const outside = s.curv < 0 ? -1 : 1; // right turn: outside is left
      if (this.inGap(outside, s.dist)) continue;
      const p = this.pointAt(s.dist, outside * (this.wallOffset - 1.25));
      props.push({ id: props.length, type: 'tyres', x: p.x, z: p.z, y: s.y, r: 1.05, h: 1.1 });
    }
    for (const sc of this.shortcuts) {
      for (let t = 0.3; t <= 0.71; t += 0.2) {
        for (const lat of [-1, 1]) {
          const x = lerp(sc.ax, sc.bx, t) - sc.dz * lat * (sc.half + 3.4);
          const z = lerp(sc.az, sc.bz, t) + sc.dx * lat * (sc.half + 3.4);
          props.push({ id: props.length, type: 'rock', x, z, y: lerp(sc.ya, sc.yb, t), r: 1.3, h: 1.4 });
        }
      }
    }
    return props;
  }

  // Checkpoint gates spread round the lap, kept clear of shortcut spans so
  // using a shortcut never skips one.
  placeGates() {
    const gates = [];
    const from = this.closed ? 0 : this.startDist;
    const to = this.closed ? this.length : this.finishDist;
    for (let k = 1; k <= GATES; k++) {
      let d = from + ((to - from) * k) / (GATES + 1);
      for (const sc of this.shortcuts) if (d > sc.a - 12 && d < sc.b + 12) d = sc.b + 16;
      if (gates.length && d <= gates[gates.length - 1] + 20) continue;
      if (d < to - 15) gates.push(d);
    }
    return gates;
  }

  // ------------------------------------------------------------ grid

  buildGrid() {
    this.wallGrid = new Map();
    this.propGrid = new Map();
    const add = (grid, x, z, item) => {
      const key = this.cellKey(Math.floor(x / GRID), Math.floor(z / GRID));
      let list = grid.get(key);
      if (!list) grid.set(key, (list = []));
      if (!list.includes(item)) list.push(item);
    };
    for (const w of this.walls) {
      const steps = Math.ceil(w.len / (GRID / 2));
      for (let s = 0; s <= steps; s++) add(this.wallGrid, w.ax + (w.ex * s) / steps, w.az + (w.ez * s) / steps, w);
    }
    for (const p of this.props) add(this.propGrid, p.x, p.z, p);
  }

  cellKey(cx, cz) {
    return cx * 100003 + cz;
  }

  near(grid, x, z, out) {
    out.length = 0;
    const cx = Math.floor(x / GRID), cz = Math.floor(z / GRID);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const list = grid.get(this.cellKey(cx + ox, cz + oz));
        if (!list) continue;
        for (const item of list) if (!out.includes(item)) out.push(item);
      }
    }
    return out;
  }

  // Grid slot k: two columns, staggered, behind the start line.
  gridSlot(k) {
    const row = Math.floor(k / 2), col = k % 2;
    return { dist: this.wrap(this.startDist - 7 - row * 7.5 - col * 3), lateral: (col ? 1 : -1) * this.half * 0.4 };
  }

  // Distance from the centerline sampled on a grid, for terrain and
  // scenery placement. Cells farther than `reach` keep `reach`.
  distanceField(cell = 6, margin = 260, reach = 70) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of this.samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
    }
    minX -= margin; minZ -= margin; maxX += margin; maxZ += margin;
    const nx = Math.ceil((maxX - minX) / cell) + 1, nz = Math.ceil((maxZ - minZ) / cell) + 1;
    const dist = new Float32Array(nx * nz).fill(reach);
    const index = new Int32Array(nx * nz).fill(-1);
    const rc = Math.ceil(reach / cell);
    for (let i = 0; i < this.samples.length; i += 2) {
      const s = this.samples[i];
      const gx = Math.round((s.x - minX) / cell), gz = Math.round((s.z - minZ) / cell);
      for (let oz = -rc; oz <= rc; oz++) {
        const z = gz + oz;
        if (z < 0 || z >= nz) continue;
        for (let ox = -rc; ox <= rc; ox++) {
          const x = gx + ox;
          if (x < 0 || x >= nx) continue;
          const wx = minX + x * cell, wz = minZ + z * cell;
          const d = Math.hypot(wx - s.x, wz - s.z);
          const k = z * nx + x;
          if (d < dist[k]) { dist[k] = d; index[k] = i; }
        }
      }
    }
    const field = { minX, minZ, nx, nz, cell, dist, index, reach };
    field.at = (x, z) => {
      const gx = clamp(Math.round((x - minX) / cell), 0, nx - 1), gz = clamp(Math.round((z - minZ) / cell), 0, nz - 1);
      const k = gz * nx + gx;
      return { d: dist[k], i: index[k] };
    };
    return field;
  }
}

// Tracks are deterministic, so build each one once.
const cache = new Map();
export function getTrack(location, kind) {
  const key = `${location.id}-${kind === 'sprint' ? 'sprint' : 'circuit'}`;
  if (!cache.has(key)) cache.set(key, new Track(location, kind));
  return cache.get(key);
}
