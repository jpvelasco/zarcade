// Builds a drivable track from DOM-free data: a closed centreline spline with
// widths, a verge and walls, checkpoints, boost pads, item boxes, bumpers,
// shortcuts, a racing line, decorations and the starting grid. Also answers
// the questions the simulation asks every step: where is this point along
// the track, is it on the road, and where is the nearest legal spot.
import { clamp, hashFloat, mulberry32 } from './math.js';

export const SAMPLE_STEP = 8; // world units between centreline samples
export const CHECKPOINTS = 8;
export const KART_RADIUS = 11;
const GRID_ROWS_GAP = 36;

// ------------------------------------------------------------ spline

// Centripetal Catmull-Rom through closed control points, densely sampled.
function denseSpline(points, closed = true) {
  const n = points.length;
  const out = [];
  const get = (i) => {
    if (closed) return points[((i % n) + n) % n];
    return points[clamp(i, 0, n - 1)];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const t01 = Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 0.5) || 1e-3;
    const t12 = Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), 0.5) || 1e-3;
    const t23 = Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), 0.5) || 1e-3;
    const steps = 48;
    for (let k = 0; k < steps; k++) {
      const u = k / steps;
      out.push(catmull(p0, p1, p2, p3, t01, t12, t23, u));
    }
  }
  if (!closed) out.push([...get(n - 1)]);
  return out;
}

function catmull(p0, p1, p2, p3, t01, t12, t23, u) {
  const res = [];
  for (let d = 0; d < p1.length; d++) {
    const m1 = (p2[d] - p1[d] + t12 * ((p1[d] - p0[d]) / t01 - (p2[d] - p0[d]) / (t01 + t12)));
    const m2 = (p2[d] - p1[d] + t12 * ((p3[d] - p2[d]) / t23 - (p3[d] - p1[d]) / (t12 + t23)));
    const a = 2 * p1[d] - 2 * p2[d] + m1 + m2;
    const b = -3 * p1[d] + 3 * p2[d] - 2 * m1 - m2;
    res.push(a * u * u * u + b * u * u + m1 * u + p1[d]);
  }
  return res;
}

// Resamples a dense polyline at an even spacing. Each point keeps any extra
// channels (index 2+, such as width) interpolated.
function resample(dense, step, closed = true) {
  const pts = closed ? [...dense, dense[0]] : dense;
  const out = [];
  let carry = 0;
  out.push([...pts[0]]);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - carry;
    while (t <= len) {
      const u = t / len;
      out.push(a.map((v, d) => v + (b[d] - v) * u));
      t += step;
    }
    carry = len - (t - step);
  }
  // A closed loop ends where it starts: drop a last sample that sits on the first.
  if (closed) {
    const last = out[out.length - 1];
    if (Math.hypot(last[0] - out[0][0], last[1] - out[0][1]) < step * 0.5) out.pop();
  }
  return out;
}

// ------------------------------------------------------------ polyline

// Fills position, tangent, normal (left of travel), width and curvature
// arrays for an evenly sampled polyline.
function polyline(samples, closed, defaultHalf) {
  const n = samples.length;
  const x = new Float64Array(n), y = new Float64Array(n);
  const tx = new Float64Array(n), ty = new Float64Array(n);
  const nx = new Float64Array(n), ny = new Float64Array(n);
  const hw = new Float64Array(n), k = new Float64Array(n), s = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = samples[i][0];
    y[i] = samples[i][1];
    hw[i] = samples[i][2] ?? defaultHalf;
  }
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const ip = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    const inx = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    let dx = x[inx] - x[ip], dy = y[inx] - y[ip];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    tx[i] = dx; ty[i] = dy;
    nx[i] = -dy; ny[i] = dx;
    s[i] = acc;
    if (i < n - 1 || closed) {
      const j = (i + 1) % n;
      acc += Math.hypot(x[j] - x[i], y[j] - y[i]);
    }
  }
  for (let i = 0; i < n; i++) {
    const ip = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    const inx = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    const cross = tx[ip] * ty[inx] - ty[ip] * tx[inx];
    const dot = tx[ip] * tx[inx] + ty[ip] * ty[inx];
    const span = (inx - ip + n) % n || 2;
    k[i] = Math.atan2(cross, dot) / (span * SAMPLE_STEP);
  }
  return { n, x, y, tx, ty, nx, ny, hw, k, s, length: acc, closed };
}

// ------------------------------------------------------------ spatial grid

class Grid {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
  add(x, y, v) {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    const key = this.key(cx, cy);
    let list = this.map.get(key);
    if (!list) this.map.set(key, (list = []));
    list.push(v);
  }
  // Calls fn for every item in the cells within `r` of (x, y).
  near(x, y, r, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.map.get(this.key(cx, cy));
        if (list) for (const v of list) fn(v);
      }
    }
  }
}

// ------------------------------------------------------------ build

export function buildTrack(def, { decor = true } = {}) {
  const half = def.width ?? 64;
  const verge = def.verge ?? 26;
  const scale = def.scale ?? 1;
  const pts = def.points.map((p) => [p[0] * scale, p[1] * scale, p[2] ?? half]);
  const dense = denseSpline(pts, true);
  const main = polyline(resample(dense, SAMPLE_STEP, true), true, half);
  const L = main.length;
  const track = {
    id: def.id,
    name: def.name,
    def,
    theme: def.theme || 'toybox',
    laps: def.laps ?? 3,
    main,
    length: L,
    verge,
    wall: verge + 0, // lateral room past the road edge before the wall
    seed: def.seed ?? 1,
  };

  // Spatial index of main samples for global projection.
  let maxCorr = 0;
  for (let i = 0; i < main.n; i++) maxCorr = Math.max(maxCorr, main.hw[i] + verge);
  track.maxCorridor = maxCorr;
  track.grid = new Grid(Math.max(64, maxCorr));
  for (let i = 0; i < main.n; i++) track.grid.add(main.x[i], main.y[i], i);

  // Checkpoints: evenly spaced distances; 0 is the finish line.
  track.checkpoints = Array.from({ length: CHECKPOINTS }, (_, i) => (i * L) / CHECKPOINTS);

  // Shortcuts: open splines from one main distance to another.
  track.shortcuts = (def.shortcuts || []).map((sc, index) => buildShortcut(track, sc, index));

  // Pads, boxes and bumpers sit at a lap fraction and a lateral offset given
  // as a fraction of the half-width (+ is left of travel).
  track.pads = (def.pads || []).map((p) => placeAt(track, p.at, p.off ?? 0, { len: p.len ?? 40, w: p.w ?? 30 }));
  track.boxes = [];
  for (const row of def.boxes || []) {
    const count = row.n ?? 4;
    for (let j = 0; j < count; j++) {
      const off = count === 1 ? 0 : -0.68 + (1.36 * j) / (count - 1);
      track.boxes.push(placeAt(track, row.at, off, { r: 11 }));
    }
  }
  track.bumpers = (def.bumpers || []).map((b) => placeAt(track, b.at, b.off ?? 0, { r: b.r ?? 16 }));

  track.racingLine = racingLine(main, def.lineScale ?? 1);
  track.grid6 = startGrid(track, 6);
  track.bounds = bounds(track);
  track.decorations = decor ? decorations(track, def.decoCount ?? 150) : [];
  return track;
}

// Scenery for a track built with { decor: false }, as a separate step so a
// browser can do it in its own frame.
export function addDecorations(track) {
  track.decorations = decorations(track, track.def.decoCount ?? 150);
  return track;
}

function placeAt(track, at, off, extra) {
  const m = track.main;
  const s = (((at % 1) + 1) % 1) * track.length;
  const i = Math.round(s / track.length * m.n) % m.n;
  const lat = off * m.hw[i];
  return {
    i, s: m.s[i], lat, x: m.x[i] + m.nx[i] * lat, y: m.y[i] + m.ny[i] * lat,
    angle: Math.atan2(m.ty[i], m.tx[i]), ...extra,
  };
}

// Nearest main sample to a control point (by index, fractions allowed).
function sampleNearPoint(track, def, at) {
  const scale = def.scale ?? 1;
  const n = def.points.length;
  const a = def.points[Math.floor(at) % n], b = def.points[(Math.floor(at) + 1) % n];
  const u = at - Math.floor(at);
  const x = (a[0] + (b[0] - a[0]) * u) * scale, y = (a[1] + (b[1] - a[1]) * u) * scale;
  return project(track, x, y).i;
}

function buildShortcut(track, sc, index) {
  const m = track.main;
  const def = track.def;
  const scale = def.scale ?? 1;
  const iFrom = sampleNearPoint(track, def, sc.from);
  const iTo = sampleNearPoint(track, def, sc.to);
  const halfW = sc.width ?? 30;
  const start = [m.x[iFrom], m.y[iFrom], halfW];
  const end = [m.x[iTo], m.y[iTo], halfW];
  const via = (sc.via || []).map((p) => [p[0] * scale, p[1] * scale, halfW]);
  const ctrl = [start, ...via, end];
  const line = polyline(resample(denseSpline(ctrl, false), SAMPLE_STEP, false), false, halfW);
  const sFrom = m.s[iFrom];
  let sTo = m.s[iTo];
  if (sTo <= sFrom) sTo += track.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < line.n; i++) {
    minX = Math.min(minX, line.x[i]); maxX = Math.max(maxX, line.x[i]);
    minY = Math.min(minY, line.y[i]); maxY = Math.max(maxY, line.y[i]);
  }
  const pad = halfW + 40;
  // Without a boost a shortcut is about as quick as the road it skips (its
  // surface is slow), so it pays off with a mushroom or a mini-turbo.
  const surface = sc.surface ?? clamp((line.length / (sTo - sFrom)) * 1.06, 0.42, 0.92);
  return {
    index, line, halfW, iFrom, iTo, sFrom, sTo, surface,
    box: { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad },
    saves: sTo - sFrom - line.length, // distance saved by taking it
  };
}

// ------------------------------------------------------------ racing line

// Lateral offset per sample toward the inside of each bend, smoothed so the
// line swings outside-inside-outside, and clamped to the road.
function racingLine(m, scale) {
  const n = m.n;
  const W = 9;
  const ks = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let d = -W; d <= W; d++) sum += m.k[(i + d + n) % n];
    ks[i] = sum / (2 * W + 1);
  }
  let off = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const room = Math.max(0, m.hw[i] - KART_RADIUS - 8);
    // ~1/220 curvature (a 220-unit radius) already reaches the inside edge.
    off[i] = clamp(ks[i] * 220 * scale, -1, 1) * room;
  }
  for (let pass = 0; pass < 6; pass++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let d = -6; d <= 6; d++) sum += off[(i + d + n) % n];
      const room = Math.max(0, m.hw[i] - KART_RADIUS - 8);
      next[i] = clamp(sum / 13, -room, room);
    }
    off = next;
  }
  return off;
}

// ------------------------------------------------------------ grid & bounds

// Grid slots behind the start line: two per row, staggered.
function startGrid(track, count) {
  const m = track.main;
  const slots = [];
  for (let k = 0; k < count; k++) {
    const row = Math.floor(k / 2);
    const back = 30 + row * GRID_ROWS_GAP + (k % 2) * 14;
    let s = track.length - back;
    const i = Math.round(s / SAMPLE_STEP) % m.n;
    const side = k % 2 === 0 ? 1 : -1;
    const lat = side * m.hw[i] * 0.42;
    slots.push({
      i, s: m.s[i], lat,
      x: m.x[i] + m.nx[i] * lat, y: m.y[i] + m.ny[i] * lat,
      angle: Math.atan2(m.ty[i], m.tx[i]),
    });
  }
  return slots;
}

function bounds(track) {
  const m = track.main;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < m.n; i++) {
    const r = m.hw[i] + track.verge;
    minX = Math.min(minX, m.x[i] - r); maxX = Math.max(maxX, m.x[i] + r);
    minY = Math.min(minY, m.y[i] - r); maxY = Math.max(maxY, m.y[i] + r);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Scenery outside the walls: kind (0..7), position, size and a spin. The
// renderer picks art per theme; the simulation ignores them.
function decorations(track, count) {
  const rng = mulberry32((track.seed * 7919 + 17) >>> 0);
  const b = track.bounds;
  const pad = 260;
  const list = [];
  let tries = 0;
  while (list.length < count && tries < count * 30) {
    tries++;
    const x = b.minX - pad + rng() * (b.w + pad * 2);
    const y = b.minY - pad + rng() * (b.h + pad * 2);
    const size = 0.75 + rng() * 0.6;
    const clear = 30 * size + 14;
    if (!clearOfTrack(track, x, y, clear)) continue;
    if (list.some((d) => Math.hypot(d.x - x, d.y - y) < (d.size + size) * 26)) continue;
    // Closer to the road is busier: keep far-off scenery sparser.
    const p = project(track, x, y);
    const far = p.dist - (track.main.hw[p.i] + track.verge);
    if (far > 160 && rng() < 0.55) continue;
    list.push({ x, y, size, kind: Math.floor(rng() * 8), spin: rng() * Math.PI * 2, v: rng() });
  }
  return list;
}

// True when a circle of radius r at (x, y) is clear of every corridor.
export function clearOfTrack(track, x, y, r) {
  const p = project(track, x, y);
  if (p.dist < track.main.hw[p.i] + track.verge + r) return false;
  for (const sc of track.shortcuts) {
    const q = projectLine(sc.line, x, y, null);
    if (q.dist < sc.halfW + track.verge + r) return false;
  }
  return true;
}

// ------------------------------------------------------------ projection

// Nearest point of a closed main centreline. `hint` (a sample index) makes
// it a cheap local search; without one, the spatial grid narrows it down.
export function project(track, x, y, hint = null) {
  const m = track.main;
  let best = -1, bestD = Infinity;
  if (hint !== null && hint >= 0) {
    for (let d = -6; d <= 6; d++) {
      const i = (hint + d + m.n) % m.n;
      const dd = (m.x[i] - x) ** 2 + (m.y[i] - y) ** 2;
      if (dd < bestD) { bestD = dd; best = i; }
    }
    if (Math.sqrt(bestD) > track.maxCorridor * 1.2) best = -1;
  }
  if (best < 0) {
    bestD = Infinity;
    let r = track.maxCorridor * 1.5;
    for (let attempt = 0; attempt < 6 && best < 0; attempt++, r *= 3) {
      track.grid.near(x, y, r, (i) => {
        const dd = (m.x[i] - x) ** 2 + (m.y[i] - y) ** 2;
        if (dd < bestD) { bestD = dd; best = i; }
      });
    }
    if (best < 0) {
      for (let i = 0; i < m.n; i++) {
        const dd = (m.x[i] - x) ** 2 + (m.y[i] - y) ** 2;
        if (dd < bestD) { bestD = dd; best = i; }
      }
    }
  }
  return refine(m, best, x, y, track.length);
}

// Projection onto an open polyline (shortcuts). Always a full search: they
// are short.
export function projectLine(line, x, y) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < line.n; i++) {
    const dd = (line.x[i] - x) ** 2 + (line.y[i] - y) ** 2;
    if (dd < bestD) { bestD = dd; best = i; }
  }
  return refine(line, best, x, y, line.length);
}

// Continuous distance along the line and signed lateral offset at sample i.
function refine(m, i, x, y, L) {
  const dx = x - m.x[i], dy = y - m.y[i];
  const along = dx * m.tx[i] + dy * m.ty[i];
  const lat = dx * m.nx[i] + dy * m.ny[i];
  let s = m.s[i] + along;
  if (m.closed) s = ((s % L) + L) % L;
  else s = clamp(s, 0, L);
  return { i, s, lat, dist: Math.hypot(dx, dy) };
}

// Where a point sits: on the road, verge or a shortcut, its lap distance and
// how far it pokes through the wall (> 0 means outside the corridor, and
// normal points back inside).
export function locate(track, x, y, hint = null, radius = KART_RADIUS) {
  const m = track.main;
  const p = project(track, x, y, hint);
  const hw = m.hw[p.i];
  const over = Math.abs(p.lat) - (hw + track.verge - radius);
  const sign = Math.sign(p.lat) || 1;
  let res = {
    i: p.i, s: p.s, lat: p.lat, surface: Math.abs(p.lat) <= hw ? 'road' : 'verge', grip: 1,
    over, shortcut: -1, normalX: -m.nx[p.i] * sign, normalY: -m.ny[p.i] * sign,
  };
  if (Math.abs(p.lat) <= hw) return res;
  // Off the main road: a shortcut may claim the point.
  for (const sc of track.shortcuts) {
    if (x < sc.box.minX || x > sc.box.maxX || y < sc.box.minY || y > sc.box.maxY) continue;
    const q = projectLine(sc.line, x, y);
    const onPath = Math.abs(q.lat) <= sc.halfW;
    const scOver = Math.abs(q.lat) - (sc.halfW + track.verge - radius);
    if (onPath || (res.over > 0 && scOver < res.over)) {
      const u = sc.line.length ? q.s / sc.line.length : 0;
      const qs = Math.sign(q.lat) || 1;
      res = {
        i: p.i, s: (sc.sFrom + u * (sc.sTo - sc.sFrom)) % track.length, lat: p.lat,
        surface: onPath ? 'shortcut' : 'verge', grip: sc.surface, over: scOver, shortcut: sc.index,
        normalX: -sc.line.nx[q.i] * qs, normalY: -sc.line.ny[q.i] * qs,
      };
      if (onPath) return res;
    }
  }
  return res;
}

// A point on the main centreline at lap distance s, offset lat to the left.
export function pointAt(track, s, lat = 0) {
  const m = track.main;
  const L = track.length;
  s = ((s % L) + L) % L;
  const f = s / SAMPLE_STEP;
  const i = Math.floor(f) % m.n;
  const j = (i + 1) % m.n;
  const u = f - Math.floor(f);
  const x = m.x[i] + (m.x[j] - m.x[i]) * u;
  const y = m.y[i] + (m.y[j] - m.y[i]) * u;
  const tx = m.tx[i] + (m.tx[j] - m.tx[i]) * u;
  const ty = m.ty[i] + (m.ty[j] - m.ty[i]) * u;
  const tl = Math.hypot(tx, ty) || 1;
  const nx = -ty / tl, ny = tx / tl;
  return { x: x + nx * lat, y: y + ny * lat, tx: tx / tl, ty: ty / tl, nx, ny, i, hw: m.hw[i] };
}

// A point on the racing line at lap distance s.
export function linePoint(track, s, bias = 0) {
  const m = track.main;
  const i = Math.round((((s % track.length) + track.length) % track.length) / SAMPLE_STEP) % m.n;
  const room = Math.max(0, m.hw[i] - KART_RADIUS - 6);
  const lat = clamp(track.racingLine[i] + bias * room, -room, room);
  return pointAt(track, s, lat);
}

// Signed lap-distance difference b - a, wrapped into (-L/2, L/2].
export function lapDelta(track, a, b) {
  const L = track.length;
  let d = (b - a) % L;
  if (d > L / 2) d -= L;
  if (d <= -L / 2) d += L;
  return d;
}

// The tightest curvature (absolute) between s and s + ahead along the line.
export function maxCurvatureAhead(track, s, ahead) {
  const m = track.main;
  const i0 = Math.round(s / SAMPLE_STEP);
  const steps = Math.max(1, Math.round(ahead / SAMPLE_STEP));
  let best = 0;
  for (let d = 0; d < steps; d += 2) {
    const i = (i0 + d) % m.n;
    const k = Math.abs(m.k[(i + m.n) % m.n]);
    if (k > best) best = k;
  }
  return best;
}

// ------------------------------------------------------------ validity

// Everything that would make a track unfair or broken. Empty means good.
export function validateTrack(track) {
  const problems = [];
  const m = track.main;
  const n = m.n;
  // Closed: the last sample joins the first at the usual spacing.
  const gap = Math.hypot(m.x[0] - m.x[n - 1], m.y[0] - m.y[n - 1]);
  if (gap > SAMPLE_STEP * 1.6) problems.push(`not closed (gap ${gap.toFixed(1)})`);
  if (track.length < 3000) problems.push(`too short (${Math.round(track.length)})`);
  // Bends wider than the inner wall offset, so the walls never fold.
  for (let i = 0; i < n; i++) {
    const inner = m.hw[i] + track.verge;
    if (Math.abs(m.k[i]) * inner > 0.82) {
      problems.push(`bend too tight at sample ${i} (radius ${Math.round(1 / Math.abs(m.k[i]))}, needs ${Math.round(inner / 0.82)})`);
      break;
    }
  }
  // No two far-apart parts of the track overlap.
  const window = Math.ceil((track.maxCorridor * 2 * Math.PI) / SAMPLE_STEP);
  outer: for (let i = 0; i < n; i++) {
    const ri = m.hw[i] + track.verge;
    let hit = -1;
    track.grid.near(m.x[i], m.y[i], track.maxCorridor * 2 + 24, (j) => {
      if (hit >= 0) return;
      const sep = Math.min(Math.abs(i - j), n - Math.abs(i - j));
      if (sep < window) return;
      const rj = m.hw[j] + track.verge;
      if (Math.hypot(m.x[i] - m.x[j], m.y[i] - m.y[j]) < ri + rj + 20) hit = j;
    });
    if (hit >= 0) {
      problems.push(`overlaps itself near samples ${i} and ${hit}`);
      break outer;
    }
  }
  // Checkpoints in increasing order, starting at the line.
  for (let c = 0; c < track.checkpoints.length; c++) {
    if (c === 0 && track.checkpoints[0] !== 0) problems.push('first checkpoint is not the finish line');
    if (c > 0 && !(track.checkpoints[c] > track.checkpoints[c - 1])) problems.push(`checkpoint ${c} out of order`);
  }
  for (const [what, list] of [['pad', track.pads], ['box', track.boxes], ['bumper', track.bumpers]]) {
    for (const o of list) {
      const p = project(track, o.x, o.y);
      const r = o.r ?? Math.max(o.len ?? 0, o.w ?? 0) / 2;
      if (Math.abs(p.lat) + (what === 'pad' ? (o.w ?? 30) / 2 : r) > m.hw[p.i] + 1) problems.push(`${what} off the road at ${o.s.toFixed(0)}`);
    }
  }
  // Bumpers leave room to pass on at least one side.
  for (const b of track.bumpers) {
    const hw = m.hw[b.i];
    const room = Math.max(hw - (b.lat + b.r), (b.lat - b.r) + hw);
    if (room < KART_RADIUS * 2 + 12) problems.push(`bumper blocks the road at ${b.s.toFixed(0)}`);
  }
  for (const slot of track.grid6) {
    const p = project(track, slot.x, slot.y);
    if (Math.abs(p.lat) > m.hw[p.i] - KART_RADIUS) problems.push('grid slot off the road');
  }
  for (const sc of track.shortcuts) {
    if (sc.saves < 60) problems.push(`shortcut ${sc.index} saves too little (${Math.round(sc.saves)})`);
    if (sc.sTo - sc.sFrom > track.length / 2) problems.push(`shortcut ${sc.index} skips over half a lap`);
    // The shortcut must not cross any checkpoint-free part of the map: its
    // middle stays clear of unrelated main-road sections.
    for (let i = 4; i < sc.line.n - 4; i++) {
      const p = project(track, sc.line.x[i], sc.line.y[i]);
      const between = lapDelta(track, sc.sFrom, p.s) >= -40 && lapDelta(track, p.s, sc.sTo) >= -40;
      if (!between && p.dist < m.hw[p.i] + track.verge + sc.halfW) {
        problems.push(`shortcut ${sc.index} touches another part of the track`);
        break;
      }
    }
  }
  return problems;
}

// Deterministic per-object variety for renderers.
export const variety = (i, salt) => hashFloat(i, salt, 911);
