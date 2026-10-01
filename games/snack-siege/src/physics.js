// A small deterministic 2D rigid-body engine: circles and oriented boxes,
// sequential impulses with warm starting, Coulomb friction, restitution,
// split-impulse position correction and island sleeping. DOM-free.
//
// Coordinates are y-up. Bodies are plain objects so a whole world can be
// cloned cheaply (the autoplayer searches shots on clones).

export const CIRCLE = 0;
export const BOX = 1;

const SLOP = 0.008; // allowed penetration
const MARGIN = 0.004; // contacts kept slightly before touching
const BETA = 0.25; // position correction strength
const REST_THRESHOLD = 1.2; // approach speed below which nothing bounces
const SLEEP_LIN = 0.12;
const SLEEP_ANG = 0.12;
const TIME_TO_SLEEP = 0.5;
const AABB_PAD = 0.02;
const CLIP_TOL = 0.01;

const EDGE_NX = [0, 1, 0, -1];
const EDGE_NY = [-1, 0, 1, 0];
const VX = [-1, 1, 1, -1];
const VY = [-1, -1, 1, 1];

export class Physics {
  constructor({ gravity = -20, dt = 1 / 120, iterations = 8 } = {}) {
    this.gravity = gravity;
    this.dt = dt;
    this.iterations = iterations;
    this.bodies = [];
    this.nextId = 1;
    this.manifolds = new Map(); // pairKey -> manifold
    this.hits = []; // impacts from the last step: { a, b, speed, x, y, nx, ny, mass }
    this.time = 0;
    this._order = [];
  }

  add(opts) {
    const b = makeBody(opts);
    b.id = this.nextId++;
    this.bodies.push(b);
    return b;
  }

  // Remove a body and wake whatever it was touching.
  remove(body) {
    const i = this.bodies.indexOf(body);
    if (i < 0) return;
    this.bodies.splice(i, 1);
    body.removed = true;
    for (const [key, m] of this.manifolds) {
      if (m.a === body || m.b === body) {
        const other = m.a === body ? m.b : m.a;
        wake(other);
        this.manifolds.delete(key);
      }
    }
  }

  byId(id) {
    for (const b of this.bodies) if (b.id === id) return b;
    return null;
  }

  // Radial push from a point; returns the bodies it reached with their falloff.
  explode(x, y, radius, strength) {
    const reached = [];
    for (const b of this.bodies) {
      if (b.isStatic || b.ghost) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      const d = Math.hypot(dx, dy);
      if (d > radius + bodyRadius(b)) continue;
      const f = Math.max(0, 1 - Math.max(0, d - bodyRadius(b) * 0.5) / radius);
      if (f <= 0) continue;
      const nx = d > 1e-6 ? dx / d : 0;
      const ny = d > 1e-6 ? dy / d : 1;
      const j = strength * f;
      wake(b);
      // An impulse, capped so tiny glass bits don't fly away at bean speed.
      const dv = Math.min(j * b.im, 24);
      b.vx += nx * dv;
      b.vy += ny * dv + dv * 0.25;
      b.w += (nx >= 0 ? -1 : 1) * dv * 0.6;
      reached.push({ body: b, f });
    }
    return reached;
  }

  step() {
    const dt = this.dt;
    this.hits.length = 0;
    const bodies = this.bodies;
    for (const b of bodies) if (!b.isStatic && !b.sleeping) updateTransform(b);
    this.collide();
    const contacts = this._active;

    // Integrate velocities.
    for (const b of bodies) {
      if (b.isStatic || b.sleeping || b.kinematic) continue;
      b.vy += this.gravity * b.gravityScale * dt;
      if (b.linDamp) { const k = 1 / (1 + dt * b.linDamp); b.vx *= k; b.vy *= k; }
      if (b.angDamp) b.w *= 1 / (1 + dt * b.angDamp);
      b.pvx = 0; b.pvy = 0; b.pw = 0;
    }

    // Restitution and impact speeds are read before any warm start is applied.
    for (const m of contacts) preStep(m, dt, this.hits);
    for (const m of contacts) warmStart(m);
    for (let it = 0; it < this.iterations; it++) {
      for (const m of contacts) solveVelocity(m);
    }
    for (let it = 0; it < 4; it++) {
      for (const m of contacts) solvePosition(m, dt);
    }

    // Integrate positions.
    for (const b of bodies) {
      if (b.isStatic || b.sleeping || b.kinematic) continue;
      b.x += (b.vx + b.pvx) * dt;
      b.y += (b.vy + b.pvy) * dt;
      b.a += (b.w + b.pw) * dt;
      b.pvx = 0; b.pvy = 0; b.pw = 0;
    }
    this.updateSleep(contacts, dt);
    this.time += dt;
  }

  collide() {
    const bodies = this.bodies;
    const order = this._order;
    order.length = 0;
    for (const b of bodies) {
      if (b.ghost) continue;
      if (!b.isStatic && !b.sleeping) computeAabb(b);
      order.push(b);
    }
    // Stable sort keeps the pair order deterministic.
    order.sort((p, q) => p.minX - q.minX || p.id - q.id);
    const next = new Map();
    const active = [];
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      for (let j = i + 1; j < order.length; j++) {
        const b = order[j];
        if (b.minX > a.maxX) break;
        if (b.minY > a.maxY || b.maxY < a.minY) continue;
        const aIdle = a.isStatic || a.sleeping || a.kinematic;
        const bIdle = b.isStatic || b.sleeping || b.kinematic;
        if (aIdle && bIdle) {
          // Keep a sleeping pair's manifold so it warm-starts on waking.
          const key = pairKey(a, b);
          const old = this.manifolds.get(key);
          if (old) next.set(key, old);
          continue;
        }
        if ((a.mask & b.cat) === 0 || (b.mask & a.cat) === 0) continue;
        const lo = a.id < b.id ? a : b;
        const hi = lo === a ? b : a;
        const key = pairKey(lo, hi);
        const m = this.manifolds.get(key) || newManifold(lo, hi);
        if (!collidePair(m)) continue;
        if (lo.sleeping) wake(lo);
        if (hi.sleeping) wake(hi);
        next.set(key, m);
        active.push(m);
      }
    }
    this.manifolds = next;
    this._active = active;
  }

  updateSleep(contacts, dt) {
    const bodies = this.bodies;
    for (const b of bodies) {
      if (b.isStatic || b.sleeping) continue;
      if (b.kinematic || !b.canSleep) { b.sleepTime = 0; continue; }
      if (b.vx * b.vx + b.vy * b.vy > SLEEP_LIN * SLEEP_LIN || b.w * b.w > SLEEP_ANG * SLEEP_ANG) b.sleepTime = 0;
      else b.sleepTime += dt;
    }
    // Union-find over touching dynamic pairs.
    for (const b of bodies) b._parent = b;
    for (const m of contacts) {
      if (m.count === 0) continue;
      const a = m.a, b = m.b;
      if (a.isStatic || b.isStatic) continue;
      union(a, b);
    }
    const minTime = new Map();
    for (const b of bodies) {
      if (b.isStatic || b.sleeping) continue;
      const r = find(b);
      const t = minTime.get(r);
      minTime.set(r, t === undefined ? b.sleepTime : Math.min(t, b.sleepTime));
    }
    for (const b of bodies) {
      if (b.isStatic || b.sleeping) continue;
      if (minTime.get(find(b)) >= TIME_TO_SLEEP) {
        b.sleeping = true;
        b.vx = 0; b.vy = 0; b.w = 0;
      }
    }
  }

  // True when every dynamic body is asleep (or nearly still).
  calm(speed = 0.3) {
    for (const b of this.bodies) {
      if (b.isStatic || b.sleeping || b.ghost || b.kinematic) continue;
      if (b.vx * b.vx + b.vy * b.vy > speed * speed || Math.abs(b.w) > speed * 2) return false;
    }
    return true;
  }

  awakeCount() {
    let n = 0;
    for (const b of this.bodies) if (!b.isStatic && !b.sleeping) n++;
    return n;
  }

  clone() {
    const p = new Physics({ gravity: this.gravity, dt: this.dt, iterations: this.iterations });
    p.nextId = this.nextId;
    p.time = this.time;
    const map = new Map();
    for (const b of this.bodies) {
      const c = { ...b, data: b.data ? { ...b.data } : null, _parent: null };
      map.set(b.id, c);
      p.bodies.push(c);
    }
    for (const [key, m] of this.manifolds) {
      const a = map.get(m.a.id);
      const b = map.get(m.b.id);
      if (!a || !b) continue;
      const c = newManifold(a, b);
      c.count = m.count;
      c.nx = m.nx; c.ny = m.ny;
      c.friction = m.friction; c.restitution = m.restitution;
      for (let i = 0; i < m.count; i++) Object.assign(c.points[i], m.points[i]);
      p.manifolds.set(key, c);
    }
    return p;
  }
}

// ------------------------------------------------------------ bodies

function makeBody(o) {
  const shape = o.shape === 'circle' || o.shape === CIRCLE ? CIRCLE : BOX;
  const density = o.density ?? 1;
  const isStatic = !!o.isStatic;
  let area;
  let inertiaPerMass;
  const r = o.r ?? 0.5;
  const hw = (o.w ?? 1) / 2;
  const hh = (o.h ?? 1) / 2;
  if (shape === CIRCLE) {
    area = Math.PI * r * r;
    inertiaPerMass = (r * r) / 2;
  } else {
    area = 4 * hw * hh;
    inertiaPerMass = (4 * hw * hw + 4 * hh * hh) / 12;
  }
  const m = isStatic ? 0 : density * area;
  const b = {
    id: 0,
    shape,
    r: shape === CIRCLE ? r : 0,
    hw: shape === BOX ? hw : 0,
    hh: shape === BOX ? hh : 0,
    x: o.x ?? 0,
    y: o.y ?? 0,
    a: o.a ?? 0,
    vx: o.vx ?? 0,
    vy: o.vy ?? 0,
    w: o.w0 ?? 0,
    pvx: 0, pvy: 0, pw: 0,
    m,
    im: m > 0 ? 1 / m : 0,
    I: m * inertiaPerMass,
    iI: m > 0 ? 1 / (m * inertiaPerMass) : 0,
    friction: o.friction ?? 0.6,
    restitution: o.restitution ?? 0.1,
    isStatic,
    kinematic: false,
    ghost: false,
    gravityScale: 1,
    linDamp: o.linDamp ?? 0,
    angDamp: o.angDamp ?? (shape === CIRCLE ? 0.8 : 0.1),
    cat: o.cat ?? 1,
    mask: o.mask ?? 0xffff,
    canSleep: o.canSleep ?? true,
    sleeping: !!o.sleeping && !isStatic,
    sleepTime: 0,
    removed: false,
    c: 1, s: 0,
    minX: 0, minY: 0, maxX: 0, maxY: 0,
    data: o.data ?? null,
    _parent: null,
  };
  updateTransform(b);
  computeAabb(b);
  return b;
}

// Change a body's density in place (Grape Boulder's heavy power).
export function setDensity(b, density) {
  const area = b.shape === CIRCLE ? Math.PI * b.r * b.r : 4 * b.hw * b.hh;
  const ipm = b.shape === CIRCLE ? (b.r * b.r) / 2 : (4 * b.hw * b.hw + 4 * b.hh * b.hh) / 12;
  b.m = density * area;
  b.im = 1 / b.m;
  b.I = b.m * ipm;
  b.iI = 1 / b.I;
}

export function wake(b) {
  if (b.isStatic) return;
  b.sleeping = false;
  b.sleepTime = 0;
}

export function bodyRadius(b) {
  return b.shape === CIRCLE ? b.r : Math.hypot(b.hw, b.hh);
}

function updateTransform(b) {
  b.c = Math.cos(b.a);
  b.s = Math.sin(b.a);
}

function computeAabb(b) {
  updateTransform(b);
  if (b.shape === CIRCLE) {
    b.minX = b.x - b.r - AABB_PAD; b.maxX = b.x + b.r + AABB_PAD;
    b.minY = b.y - b.r - AABB_PAD; b.maxY = b.y + b.r + AABB_PAD;
  } else {
    const ex = Math.abs(b.c) * b.hw + Math.abs(b.s) * b.hh;
    const ey = Math.abs(b.s) * b.hw + Math.abs(b.c) * b.hh;
    b.minX = b.x - ex - AABB_PAD; b.maxX = b.x + ex + AABB_PAD;
    b.minY = b.y - ey - AABB_PAD; b.maxY = b.y + ey + AABB_PAD;
  }
}

// World-space vertex i of a box.
function vx(b, i) { return b.x + b.c * VX[i] * b.hw - b.s * VY[i] * b.hh; }
function vy(b, i) { return b.y + b.s * VX[i] * b.hw + b.c * VY[i] * b.hh; }
function nx(b, i) { return b.c * EDGE_NX[i] - b.s * EDGE_NY[i]; }
function ny(b, i) { return b.s * EDGE_NX[i] + b.c * EDGE_NY[i]; }

export function boxVertices(b) {
  const out = [];
  for (let i = 0; i < 4; i++) out.push([vx(b, i), vy(b, i)]);
  return out;
}

// ------------------------------------------------------------ manifolds

function pairKey(a, b) {
  return a.id < b.id ? a.id * 100000 + b.id : b.id * 100000 + a.id;
}

function newPoint() {
  return { id: -1, x: 0, y: 0, sep: 0, pn: 0, pt: 0, pp: 0, rax: 0, ray: 0, rbx: 0, rby: 0, mn: 0, mt: 0, bias: 0 };
}

function newManifold(a, b) {
  return {
    a, b, nx: 0, ny: 0, count: 0,
    points: [newPoint(), newPoint()],
    friction: Math.sqrt(a.friction * b.friction),
    restitution: Math.max(a.restitution, b.restitution),
  };
}

// Scratch for warm-start matching.
const oldIds = [0, 0];
const oldPn = [0, 0];
const oldPt = [0, 0];

function setPoints(m, count) {
  for (let i = 0; i < m.count; i++) {
    oldIds[i] = m.points[i].id;
    oldPn[i] = m.points[i].pn;
    oldPt[i] = m.points[i].pt;
  }
  const oldCount = m.count;
  m.count = count;
  return oldCount;
}

function matchWarm(m, oldCount) {
  for (let i = 0; i < m.count; i++) {
    const p = m.points[i];
    p.pn = 0; p.pt = 0; p.pp = 0;
    for (let k = 0; k < oldCount; k++) {
      if (oldIds[k] === p.id) { p.pn = oldPn[k]; p.pt = oldPt[k]; break; }
    }
  }
}

function collidePair(m) {
  m.friction = Math.sqrt(m.a.friction * m.b.friction);
  m.restitution = Math.max(m.a.restitution, m.b.restitution);
  const a = m.a, b = m.b;
  let ok;
  if (a.shape === CIRCLE && b.shape === CIRCLE) ok = circleCircle(m, a, b);
  else if (a.shape === BOX && b.shape === CIRCLE) ok = boxCircle(m, a, b, false);
  else if (a.shape === CIRCLE && b.shape === BOX) ok = boxCircle(m, b, a, true);
  else ok = boxBox(m, a, b);
  if (!ok) m.count = 0;
  return ok;
}

function circleCircle(m, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const sep = d - a.r - b.r;
  if (sep > MARGIN) return false;
  const n0 = d > 1e-9 ? dx / d : 0;
  const n1 = d > 1e-9 ? dy / d : 1;
  const old = setPoints(m, 1);
  m.nx = n0; m.ny = n1;
  const p = m.points[0];
  p.id = 0;
  p.sep = sep;
  p.x = a.x + n0 * (a.r + sep / 2);
  p.y = a.y + n1 * (a.r + sep / 2);
  matchWarm(m, old);
  return true;
}

// Box `p` against circle `c`. The manifold normal points from m.a to m.b.
function boxCircle(m, p, c, flipped) {
  // Circle centre in box space.
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const lx = p.c * dx + p.s * dy;
  const ly = -p.s * dx + p.c * dy;
  let best = -Infinity;
  let edge = 0;
  for (let i = 0; i < 4; i++) {
    const s = EDGE_NX[i] * (lx - VX[i] * p.hw) + EDGE_NY[i] * (ly - VY[i] * p.hh);
    if (s > best) { best = s; edge = i; }
  }
  if (best > c.r + MARGIN) return false;
  let lnx, lny, sep;
  if (best < 1e-9) {
    lnx = EDGE_NX[edge]; lny = EDGE_NY[edge];
    sep = best - c.r;
  } else {
    const i2 = (edge + 1) & 3;
    const ax = VX[edge] * p.hw, ay = VY[edge] * p.hh;
    const bx = VX[i2] * p.hw, by = VY[i2] * p.hh;
    const u1 = (lx - ax) * (bx - ax) + (ly - ay) * (by - ay);
    const u2 = (lx - bx) * (ax - bx) + (ly - by) * (ay - by);
    if (u1 <= 0 || u2 <= 0) {
      const vxl = u1 <= 0 ? ax : bx;
      const vyl = u1 <= 0 ? ay : by;
      const ddx = lx - vxl, ddy = ly - vyl;
      const d = Math.hypot(ddx, ddy);
      sep = d - c.r;
      if (sep > MARGIN) return false;
      lnx = d > 1e-9 ? ddx / d : EDGE_NX[edge];
      lny = d > 1e-9 ? ddy / d : EDGE_NY[edge];
    } else {
      lnx = EDGE_NX[edge]; lny = EDGE_NY[edge];
      sep = best - c.r;
    }
  }
  const wnx = p.c * lnx - p.s * lny;
  const wny = p.s * lnx + p.c * lny;
  const old = setPoints(m, 1);
  m.nx = flipped ? -wnx : wnx;
  m.ny = flipped ? -wny : wny;
  const pt = m.points[0];
  pt.id = edge;
  pt.sep = sep;
  pt.x = c.x - wnx * (c.r + sep / 2);
  pt.y = c.y - wny * (c.r + sep / 2);
  matchWarm(m, old);
  return true;
}

// Largest separation of b's vertices along a's face normals.
function maxSeparation(a, b, out) {
  let best = -Infinity;
  let edge = 0;
  for (let i = 0; i < 4; i++) {
    const n0 = nx(a, i), n1 = ny(a, i);
    const v0 = vx(a, i), v1 = vy(a, i);
    let si = Infinity;
    for (let j = 0; j < 4; j++) {
      const s = n0 * (vx(b, j) - v0) + n1 * (vy(b, j) - v1);
      if (s < si) si = s;
    }
    if (si > best) { best = si; edge = i; }
  }
  out[0] = best;
  out[1] = edge;
}

const sepA = [0, 0];
const sepB = [0, 0];
const clipX = [0, 0];
const clipY = [0, 0];
const clipId = [0, 0];

function boxBox(m, a, b) {
  maxSeparation(a, b, sepA);
  if (sepA[0] > MARGIN) return false;
  maxSeparation(b, a, sepB);
  if (sepB[0] > MARGIN) return false;
  let ref, inc, refEdge, flip;
  if (sepB[0] > sepA[0] + 0.0005 * 2) { ref = b; inc = a; refEdge = sepB[1]; flip = 1; }
  else { ref = a; inc = b; refEdge = sepA[1]; flip = 0; }
  const n0 = nx(ref, refEdge), n1 = ny(ref, refEdge);
  // Incident edge: most anti-parallel to the reference normal.
  let incEdge = 0;
  let minDot = Infinity;
  for (let i = 0; i < 4; i++) {
    const d = n0 * nx(inc, i) + n1 * ny(inc, i);
    if (d < minDot) { minDot = d; incEdge = i; }
  }
  const i2 = (incEdge + 1) & 3;
  clipX[0] = vx(inc, incEdge); clipY[0] = vy(inc, incEdge); clipId[0] = incEdge;
  clipX[1] = vx(inc, i2); clipY[1] = vy(inc, i2); clipId[1] = i2;
  const r1x = vx(ref, refEdge), r1y = vy(ref, refEdge);
  const r2 = (refEdge + 1) & 3;
  const r2x = vx(ref, r2), r2y = vy(ref, r2);
  let tx = r2x - r1x, ty = r2y - r1y;
  const tl = Math.hypot(tx, ty);
  tx /= tl; ty /= tl;
  // Clip against the reference edge's side planes.
  if (!clip(-tx, -ty, -(tx * r1x + ty * r1y), 0)) return false;
  if (!clip(tx, ty, tx * r2x + ty * r2y, 1)) return false;
  const old = setPoints(m, 0);
  let count = 0;
  for (let k = 0; k < 2; k++) {
    const sep = n0 * (clipX[k] - r1x) + n1 * (clipY[k] - r1y);
    if (sep > MARGIN) continue;
    const p = m.points[count++];
    p.id = (flip << 7) | (refEdge << 4) | clipId[k];
    p.sep = sep;
    p.x = clipX[k] - n0 * sep * 0.5;
    p.y = clipY[k] - n1 * sep * 0.5;
  }
  if (count === 0) { m.count = 0; return false; }
  m.count = count;
  m.nx = flip ? -n0 : n0;
  m.ny = flip ? -n1 : n1;
  matchWarm(m, old);
  return true;
}

// Keep the part of the clip segment where dot(n, p) <= offset.
function clip(n0, n1, offset, sideId) {
  // A vertex sitting right on the side plane is kept as is, so the contact
  // id (and its warm start) doesn't flicker for neatly stacked blocks.
  const d0 = n0 * clipX[0] + n1 * clipY[0] - offset - CLIP_TOL;
  const d1 = n0 * clipX[1] + n1 * clipY[1] - offset - CLIP_TOL;
  if (d0 <= 0 && d1 <= 0) return true;
  if (d0 > 0 && d1 > 0) return false;
  const t = d0 / (d0 - d1);
  const ix = clipX[0] + t * (clipX[1] - clipX[0]);
  const iy = clipY[0] + t * (clipY[1] - clipY[0]);
  if (d0 > 0) { clipX[0] = ix; clipY[0] = iy; clipId[0] = 4 + sideId; }
  else { clipX[1] = ix; clipY[1] = iy; clipId[1] = 6 + sideId; }
  return true;
}

// ------------------------------------------------------------ solver

function preStep(m, dt, hits) {
  const a = m.a, b = m.b;
  const n0 = m.nx, n1 = m.ny;
  const t0 = n1, t1 = -n0;
  let maxApproach = 0;
  let hx = 0, hy = 0;
  for (let i = 0; i < m.count; i++) {
    const p = m.points[i];
    p.rax = p.x - a.x; p.ray = p.y - a.y;
    p.rbx = p.x - b.x; p.rby = p.y - b.y;
    const rnA = p.rax * n1 - p.ray * n0;
    const rnB = p.rbx * n1 - p.rby * n0;
    const kn = a.im + b.im + a.iI * rnA * rnA + b.iI * rnB * rnB;
    p.mn = kn > 0 ? 1 / kn : 0;
    const rtA = p.rax * t1 - p.ray * t0;
    const rtB = p.rbx * t1 - p.rby * t0;
    const kt = a.im + b.im + a.iI * rtA * rtA + b.iI * rtB * rtB;
    p.mt = kt > 0 ? 1 / kt : 0;
    const dvx = b.vx - b.w * p.rby - a.vx + a.w * p.ray;
    const dvy = b.vy + b.w * p.rbx - a.vy - a.w * p.rax;
    const vn = dvx * n0 + dvy * n1;
    p.bias = vn < -REST_THRESHOLD ? -m.restitution * vn : 0;
    p.pp = 0;
    if (-vn > maxApproach) { maxApproach = -vn; hx = p.x; hy = p.y; }
  }
  // Two-point manifolds are solved as a block (both points at once), which
  // keeps neatly stacked boxes from rocking.
  m.block = false;
  if (m.count === 2) {
    const p1 = m.points[0], p2 = m.points[1];
    const rn1A = p1.rax * n1 - p1.ray * n0, rn1B = p1.rbx * n1 - p1.rby * n0;
    const rn2A = p2.rax * n1 - p2.ray * n0, rn2B = p2.rbx * n1 - p2.rby * n0;
    const k11 = a.im + b.im + a.iI * rn1A * rn1A + b.iI * rn1B * rn1B;
    const k22 = a.im + b.im + a.iI * rn2A * rn2A + b.iI * rn2B * rn2B;
    const k12 = a.im + b.im + a.iI * rn1A * rn2A + b.iI * rn1B * rn2B;
    const det = k11 * k22 - k12 * k12;
    if (k11 * k11 < 1000 * det) {
      m.block = true;
      m.k11 = k11; m.k12 = k12; m.k22 = k22;
      const id = 1 / det;
      m.i11 = k22 * id; m.i12 = -k12 * id; m.i22 = k11 * id;
    }
  }
  if (maxApproach > 0.6) {
    const ka = a.im + b.im;
    hits.push({ a, b, speed: maxApproach, x: hx, y: hy, nx: n0, ny: n1, mass: ka > 0 ? 1 / ka : 0 });
  }
}

function warmStart(m) {
  const n0 = m.nx, n1 = m.ny;
  const t0 = n1, t1 = -n0;
  for (let i = 0; i < m.count; i++) {
    const p = m.points[i];
    applyImpulse(m.a, m.b, p, p.pn * n0 + p.pt * t0, p.pn * n1 + p.pt * t1);
  }
}

function applyImpulse(a, b, p, px, py) {
  a.vx -= a.im * px; a.vy -= a.im * py;
  a.w -= a.iI * (p.rax * py - p.ray * px);
  b.vx += b.im * px; b.vy += b.im * py;
  b.w += b.iI * (p.rbx * py - p.rby * px);
}

function normalVel(a, b, p, n0, n1) {
  const dvx = b.vx - b.w * p.rby - a.vx + a.w * p.ray;
  const dvy = b.vy + b.w * p.rbx - a.vy - a.w * p.rax;
  return dvx * n0 + dvy * n1;
}

function solveVelocity(m) {
  const a = m.a, b = m.b;
  const n0 = m.nx, n1 = m.ny;
  const t0 = n1, t1 = -n0;
  for (let i = 0; i < m.count; i++) {
    const p = m.points[i];
    const vt = normalVel(a, b, p, t0, t1);
    let dpt = -p.mt * vt;
    const maxF = m.friction * p.pn;
    const pt0 = p.pt;
    p.pt = Math.max(-maxF, Math.min(maxF, pt0 + dpt));
    dpt = p.pt - pt0;
    applyImpulse(a, b, p, dpt * t0, dpt * t1);
  }
  if (m.block) { solveBlock(m, a, b, n0, n1); return; }
  for (let i = 0; i < m.count; i++) {
    const p = m.points[i];
    const vn = normalVel(a, b, p, n0, n1);
    let dpn = p.mn * (-vn + p.bias);
    const pn0 = p.pn;
    p.pn = Math.max(pn0 + dpn, 0);
    dpn = p.pn - pn0;
    applyImpulse(a, b, p, dpn * n0, dpn * n1);
  }
}

// The two-contact LCP, solved by trying each active set (as in Box2D).
function solveBlock(m, a, b, n0, n1) {
  const p1 = m.points[0], p2 = m.points[1];
  const a1 = p1.pn, a2 = p2.pn;
  let b1 = normalVel(a, b, p1, n0, n1) - p1.bias;
  let b2 = normalVel(a, b, p2, n0, n1) - p2.bias;
  b1 -= m.k11 * a1 + m.k12 * a2;
  b2 -= m.k12 * a1 + m.k22 * a2;
  let x1 = -(m.i11 * b1 + m.i12 * b2);
  let x2 = -(m.i12 * b1 + m.i22 * b2);
  if (!(x1 >= 0 && x2 >= 0)) {
    x1 = -p1.mn * b1; x2 = 0;
    if (!(x1 >= 0 && m.k12 * x1 + b2 >= 0)) {
      x1 = 0; x2 = -p2.mn * b2;
      if (!(x2 >= 0 && m.k12 * x2 + b1 >= 0)) {
        x1 = 0; x2 = 0;
        if (!(b1 >= 0 && b2 >= 0)) return;
      }
    }
  }
  const d1 = x1 - a1, d2 = x2 - a2;
  applyImpulse(a, b, p1, d1 * n0, d1 * n1);
  applyImpulse(a, b, p2, d2 * n0, d2 * n1);
  p1.pn = x1; p2.pn = x2;
}

// Split impulse: push overlapping bodies apart through pseudo-velocities
// that are thrown away after integration, so correction adds no energy.
function solvePosition(m, dt) {
  const a = m.a, b = m.b;
  const n0 = m.nx, n1 = m.ny;
  for (let i = 0; i < m.count; i++) {
    const p = m.points[i];
    const pen = -p.sep - SLOP;
    if (pen <= 0) continue;
    const target = (BETA / dt) * pen;
    const dvx = b.pvx - b.pw * p.rby - a.pvx + a.pw * p.ray;
    const dvy = b.pvy + b.pw * p.rbx - a.pvy - a.pw * p.rax;
    const vn = dvx * n0 + dvy * n1;
    let dp = p.mn * (target - vn);
    const p0 = p.pp;
    p.pp = Math.max(p0 + dp, 0);
    dp = p.pp - p0;
    const px = dp * n0, py = dp * n1;
    a.pvx -= a.im * px; a.pvy -= a.im * py;
    a.pw -= a.iI * (p.rax * py - p.ray * px);
    b.pvx += b.im * px; b.pvy += b.im * py;
    b.pw += b.iI * (p.rbx * py - p.rby * px);
  }
}

function find(b) {
  while (b._parent !== b) {
    b._parent = b._parent._parent;
    b = b._parent;
  }
  return b;
}

function union(a, b) {
  const ra = find(a);
  const rb = find(b);
  if (ra === rb) return;
  if (ra.id < rb.id) rb._parent = ra;
  else ra._parent = rb;
}
