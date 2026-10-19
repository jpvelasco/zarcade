// Tumble Tower's small 2D rigid-body engine. DOM-free and deterministic.
//
// Convex polygons and circles; SAT + face clipping contact manifolds with
// feature ids for warm starting; a sequential-impulse solver with soft
// contacts run in substeps (integrate, warm start, biased solve, integrate
// positions, relax); a restitution pass; island sleeping. y points up.

export const LINEAR_SLOP = 0.005;
export const SPECULATIVE = 0.12;
const AABB_MARGIN = 0.06;
const MAX_PUSH = 3; // m/s, fastest speed the solver pushes overlapping bodies apart
const RESTITUTION_THRESHOLD = 1;
const SLEEP_LINEAR = 0.05;
const SLEEP_ANGULAR = 2 * Math.PI / 180;
export const TIME_TO_SLEEP = 0.5;
const MAX_SPEED = 40;

// ------------------------------------------------------------ shapes

// A convex polygon from points in any winding. Vertices are moved so the
// centroid is the origin. Returns { type, verts, normals, area, inertia, radius }
// where inertia is per unit density about the centroid.
export function polygonShape(points) {
  let pts = points.map(([x, y]) => ({ x, y }));
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  if (area2 < 0) pts = pts.reverse();
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const d = a.x * b.y - b.x * a.y;
    A += d;
    cx += (a.x + b.x) * d;
    cy += (a.y + b.y) * d;
  }
  A *= 0.5;
  cx /= 6 * A;
  cy /= 6 * A;
  const verts = pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  let I = 0, radius = 0;
  const normals = [];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    const d = a.x * b.y - b.x * a.y;
    I += (d / 12) * (a.x * a.x + a.x * b.x + b.x * b.x + a.y * a.y + a.y * b.y + b.y * b.y);
    const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey);
    normals.push({ x: ey / len, y: -ex / len });
    radius = Math.max(radius, Math.hypot(a.x, a.y));
  }
  return { type: 'poly', verts, normals, area: A, inertia: I, radius, offset: { x: cx, y: cy } };
}

export function boxShape(w, h, chamfer = 0) {
  const x = w / 2, y = h / 2, c = Math.min(chamfer, x * 0.9, y * 0.9);
  if (c <= 0) return polygonShape([[-x, -y], [x, -y], [x, y], [-x, y]]);
  return polygonShape([[-x + c, -y], [x - c, -y], [x, -y + c], [x, y - c], [x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c]]);
}

export function circleShape(r) {
  return { type: 'circle', r, area: Math.PI * r * r, inertia: 0.5 * Math.PI * r * r * r * r, radius: r, offset: { x: 0, y: 0 } };
}

// ------------------------------------------------------------ bodies

export class Body {
  constructor(shape, {
    x = 0, y = 0, angle = 0, kind = 'dynamic', density = 1, friction = 0.7, restitution = 0.05,
    linearDamping = 0.05, angularDamping = 0.1, user = null,
  } = {}) {
    this.id = -1;
    this.shape = shape;
    this.kind = kind;
    this.x = x; this.y = y; this.angle = angle;
    this.vx = 0; this.vy = 0; this.w = 0;
    this.fx = 0; this.fy = 0; // external force for the next step (cleared after)
    const mass = kind === 'dynamic' ? shape.area * density : 0;
    this.mass = mass;
    this.invMass = mass > 0 ? 1 / mass : 0;
    const I = kind === 'dynamic' ? shape.inertia * density : 0;
    this.invI = I > 0 ? 1 / I : 0;
    this.friction = friction;
    this.restitution = restitution;
    this.linearDamping = linearDamping;
    this.angularDamping = angularDamping;
    this.awake = kind !== 'static';
    this.sleepTime = 0;
    this.touching = 0; // touching contacts last step
    this.user = user;
    this.drive = null; // kinematic: (t) => { x, y, angle }
    this.c = 1; this.s = 0;
    this.wv = shape.type === 'poly' ? shape.verts.map(() => ({ x: 0, y: 0 })) : null;
    this.wn = shape.type === 'poly' ? shape.normals.map(() => ({ x: 0, y: 0 })) : null;
    this.minX = 0; this.minY = 0; this.maxX = 0; this.maxY = 0;
    // step scratch
    this.x0 = 0; this.y0 = 0; this.a0 = 0;
    this.updateTransform();
  }

  get dynamic() { return this.kind === 'dynamic'; }

  updateTransform() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    this.c = c; this.s = s;
    if (this.shape.type === 'circle') {
      const r = this.shape.r;
      this.minX = this.x - r; this.maxX = this.x + r;
      this.minY = this.y - r; this.maxY = this.y + r;
      return;
    }
    const v = this.shape.verts, n = this.shape.normals;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < v.length; i++) {
      const wx = this.x + c * v[i].x - s * v[i].y;
      const wy = this.y + s * v[i].x + c * v[i].y;
      this.wv[i].x = wx; this.wv[i].y = wy;
      this.wn[i].x = c * n[i].x - s * n[i].y;
      this.wn[i].y = s * n[i].x + c * n[i].y;
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }
    this.minX = minX; this.minY = minY; this.maxX = maxX; this.maxY = maxY;
  }

  speed() { return Math.hypot(this.vx, this.vy); }

  wake() {
    if (this.kind !== 'dynamic') return;
    this.awake = true;
  }
}

// ------------------------------------------------------------ narrow phase

// Max separation of `b`'s vertices along `a`'s face normals.
function maxSeparation(a, b) {
  let best = -Infinity, edge = 0;
  const av = a.wv, an = a.wn, bv = b.wv;
  for (let i = 0; i < av.length; i++) {
    const nx = an[i].x, ny = an[i].y, vx = av[i].x, vy = av[i].y;
    let si = Infinity;
    for (let j = 0; j < bv.length; j++) {
      const d = nx * (bv[j].x - vx) + ny * (bv[j].y - vy);
      if (d < si) si = d;
    }
    if (si > best) { best = si; edge = i; }
  }
  return [best, edge];
}

function collidePolygons(A, B, out) {
  const [sepA, edgeA] = maxSeparation(A, B);
  if (sepA > SPECULATIVE) return false;
  const [sepB, edgeB] = maxSeparation(B, A);
  if (sepB > SPECULATIVE) return false;
  let ref = A, inc = B, edge = edgeA, flip = 0;
  if (sepB > sepA + 0.1 * LINEAR_SLOP) { ref = B; inc = A; edge = edgeB; flip = 1; }
  const n = ref.wn[edge];
  // incident edge: most anti-parallel to the reference normal
  let k = 0, minDot = Infinity;
  for (let i = 0; i < inc.wn.length; i++) {
    const d = n.x * inc.wn[i].x + n.y * inc.wn[i].y;
    if (d < minDot) { minDot = d; k = i; }
  }
  const m = inc.wv.length;
  const i1 = k, i2 = (k + 1) % m;
  const v11 = ref.wv[edge], v12 = ref.wv[(edge + 1) % ref.wv.length];
  let tx = v12.x - v11.x, ty = v12.y - v11.y;
  const tl = Math.hypot(tx, ty);
  tx /= tl; ty /= tl;
  // incident segment (points + feature codes)
  let p1x = inc.wv[i1].x, p1y = inc.wv[i1].y, f1 = i1;
  let p2x = inc.wv[i2].x, p2y = inc.wv[i2].y, f2 = i2;
  // clip against the side plane at v11 (keep dot(t, p) >= dot(t, v11))
  const off1 = tx * v11.x + ty * v11.y;
  {
    const d1 = tx * p1x + ty * p1y - off1, d2 = tx * p2x + ty * p2y - off1;
    if (d1 < 0 && d2 < 0) return false;
    if (d1 < 0) { const u = d1 / (d1 - d2); p1x += u * (p2x - p1x); p1y += u * (p2y - p1y); f1 = 32 + edge; }
    else if (d2 < 0) { const u = d2 / (d2 - d1); p2x += u * (p1x - p2x); p2y += u * (p1y - p2y); f2 = 32 + edge; }
  }
  const off2 = tx * v12.x + ty * v12.y;
  {
    const d1 = off2 - (tx * p1x + ty * p1y), d2 = off2 - (tx * p2x + ty * p2y);
    if (d1 < 0 && d2 < 0) return false;
    if (d1 < 0) { const u = d1 / (d1 - d2); p1x += u * (p2x - p1x); p1y += u * (p2y - p1y); f1 = 64 + edge; }
    else if (d2 < 0) { const u = d2 / (d2 - d1); p2x += u * (p1x - p2x); p2y += u * (p1y - p2y); f2 = 64 + edge; }
  }
  const front = n.x * v11.x + n.y * v11.y;
  const base = (flip << 16) | (edge << 8);
  out.nx = flip ? -n.x : n.x;
  out.ny = flip ? -n.y : n.y;
  out.count = 0;
  const s1 = n.x * p1x + n.y * p1y - front;
  if (s1 <= SPECULATIVE) {
    const p = out.points[out.count++];
    p.x = p1x - n.x * s1 * 0.5; p.y = p1y - n.y * s1 * 0.5; p.sep = s1; p.id = base | f1;
  }
  const s2 = n.x * p2x + n.y * p2y - front;
  if (s2 <= SPECULATIVE) {
    const p = out.points[out.count++];
    p.x = p2x - n.x * s2 * 0.5; p.y = p2y - n.y * s2 * 0.5; p.sep = s2; p.id = base | f2;
  }
  return out.count > 0;
}

// Polygon A against circle B; normal points from A to B.
function collidePolygonCircle(A, B, out) {
  const r = B.shape.r, cx = B.x, cy = B.y;
  const v = A.wv, nn = A.wn;
  let best = -Infinity, edge = 0;
  for (let i = 0; i < v.length; i++) {
    const s = nn[i].x * (cx - v[i].x) + nn[i].y * (cy - v[i].y);
    if (s > best) { best = s; edge = i; }
  }
  if (best - r > SPECULATIVE) return false;
  const v1 = v[edge], v2 = v[(edge + 1) % v.length];
  let nx = nn[edge].x, ny = nn[edge].y, sep = best - r, id = edge;
  if (best > 1e-6) {
    const u1 = (cx - v1.x) * (v2.x - v1.x) + (cy - v1.y) * (v2.y - v1.y);
    const u2 = (cx - v2.x) * (v1.x - v2.x) + (cy - v2.y) * (v1.y - v2.y);
    let corner = null;
    if (u1 <= 0) corner = v1;
    else if (u2 <= 0) corner = v2;
    if (corner) {
      const dx = cx - corner.x, dy = cy - corner.y, d = Math.hypot(dx, dy);
      if (d - r > SPECULATIVE) return false;
      if (d > 1e-9) { nx = dx / d; ny = dy / d; }
      sep = d - r;
      id = 16 + (corner === v1 ? edge : (edge + 1) % v.length);
    }
  }
  out.nx = nx; out.ny = ny; out.count = 1;
  const p = out.points[0];
  p.x = cx - nx * (r + sep * 0.5); p.y = cy - ny * (r + sep * 0.5); p.sep = sep; p.id = id;
  return true;
}

function collideCircles(A, B, out) {
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
  const sep = d - A.shape.r - B.shape.r;
  if (sep > SPECULATIVE) return false;
  const nx = d > 1e-9 ? dx / d : 0, ny = d > 1e-9 ? dy / d : 1;
  out.nx = nx; out.ny = ny; out.count = 1;
  const p = out.points[0];
  p.x = A.x + nx * (A.shape.r + sep * 0.5); p.y = A.y + ny * (A.shape.r + sep * 0.5); p.sep = sep; p.id = 0;
  return true;
}

const scratch = { nx: 0, ny: 0, count: 0, points: [{ x: 0, y: 0, sep: 0, id: 0 }, { x: 0, y: 0, sep: 0, id: 0 }] };

// Contact manifold between two bodies (normal from A to B) or false.
export function collide(A, B, out = scratch) {
  const ta = A.shape.type, tb = B.shape.type;
  if (ta === 'poly' && tb === 'poly') return collidePolygons(A, B, out);
  if (ta === 'circle' && tb === 'circle') return collideCircles(A, B, out);
  if (ta === 'poly') return collidePolygonCircle(A, B, out);
  if (!collidePolygonCircle(B, A, out)) return false;
  out.nx = -out.nx; out.ny = -out.ny;
  return true;
}

// ------------------------------------------------------------ world

function softness(hertz, zeta, h) {
  if (hertz === 0) return { biasRate: 0, massScale: 1, impulseScale: 0 };
  const omega = 2 * Math.PI * hertz;
  const a1 = 2 * zeta + h * omega, a2 = h * omega * a1, a3 = 1 / (1 + a2);
  return { biasRate: omega / a1, massScale: a2 * a3, impulseScale: a3 };
}

export class World {
  constructor({ gravity = -12, substeps = 4, allowSleep = true } = {}) {
    this.gravity = gravity;
    this.substeps = substeps;
    this.allowSleep = allowSleep;
    this.bodies = [];
    this.nextId = 1;
    this.manifolds = new Map();
    this.list = [];
    this.time = 0;
    this.events = [];
    this.onForce = null; // (body, world) => adds body.fx/fy each step
  }

  add(body) {
    body.id = this.nextId++;
    this.bodies.push(body);
    body.updateTransform();
    return body;
  }

  remove(body) {
    const i = this.bodies.indexOf(body);
    if (i < 0) return;
    this.bodies.splice(i, 1);
    // wake whatever was touching it (sleeping pairs have no manifold, so
    // use the bounding boxes)
    const m0 = 0.1;
    for (const b of this.bodies) {
      if (!b.dynamic) continue;
      if (b.maxX + m0 < body.minX || body.maxX + m0 < b.minX || b.maxY + m0 < body.minY || body.maxY + m0 < b.minY) continue;
      b.awake = true;
      b.sleepTime = 0;
    }
    for (const [k, m] of this.manifolds) if (m.a === body || m.b === body) this.manifolds.delete(k);
    this.list = this.list.filter((m) => m.a !== body && m.b !== body);
  }

  // Manifolds touching a body (for game queries).
  contactsOf(body) {
    return this.list.filter((m) => (m.a === body || m.b === body) && m.touching);
  }

  step(dt) {
    const bodies = this.bodies;
    const n = this.substeps, h = dt / n, invH = 1 / h;
    // kinematic bodies: velocity that lands them on their scripted pose
    for (const b of bodies) {
      if (b.kind !== 'kinematic') continue;
      if (b.drive) {
        const t = b.drive(this.time + dt);
        b.vx = (t.x - b.x) / dt; b.vy = (t.y - b.y) / dt; b.w = ((t.angle ?? b.angle) - b.angle) / dt;
      }
    }
    // external forces
    if (this.onForce) for (const b of bodies) if (b.dynamic && b.awake) this.onForce(b, this);

    this.collide();
    const list = this.list;

    const soft = softness(Math.min(30, 0.25 * n / dt), 10, h);
    const stiff = softness(Math.min(60, 0.5 * n / dt), 10, h);

    // prepare constraints
    for (const m of list) {
      const A = m.a, B = m.b;
      const mA = A.awake ? A.invMass : 0, iA = A.awake ? A.invI : 0;
      const mB = B.awake ? B.invMass : 0, iB = B.awake ? B.invI : 0;
      m.mA = mA; m.iA = iA; m.mB = mB; m.iB = iB;
      m.soft = (A.dynamic && B.dynamic) ? soft : stiff;
      m.rollImpulse = 0;
      const nx = m.nx, ny = m.ny, tx = ny, ty = -nx;
      for (let k = 0; k < m.count; k++) {
        const p = m.pts[k];
        const rAx = p.x - A.x, rAy = p.y - A.y, rBx = p.x - B.x, rBy = p.y - B.y;
        p.rAx = rAx; p.rAy = rAy; p.rBx = rBx; p.rBy = rBy;
        p.adj = p.sep - ((rBx - rAx) * nx + (rBy - rAy) * ny);
        const rnA = rAx * ny - rAy * nx, rnB = rBx * ny - rBy * nx;
        const kN = mA + mB + iA * rnA * rnA + iB * rnB * rnB;
        p.normalMass = kN > 0 ? 1 / kN : 0;
        const rtA = rAx * ty - rAy * tx, rtB = rBx * ty - rBy * tx;
        const kT = mA + mB + iA * rtA * rtA + iB * rtB * rtB;
        p.tangentMass = kT > 0 ? 1 / kT : 0;
        const dvx = (B.vx - B.w * rBy) - (A.vx - A.w * rAy);
        const dvy = (B.vy + B.w * rBx) - (A.vy + A.w * rAx);
        p.relVel = dvx * nx + dvy * ny;
        p.maxImpulse = 0;
      }
    }

    for (const b of bodies) { b.x0 = b.x; b.y0 = b.y; b.a0 = b.angle; }
    const g = this.gravity;
    for (let sub = 0; sub < n; sub++) {
      // integrate velocities
      for (const b of bodies) {
        if (!b.dynamic || !b.awake) continue;
        b.vx += h * b.fx * b.invMass;
        b.vy += h * (g + b.fy * b.invMass);
        const ld = 1 / (1 + h * b.linearDamping), ad = 1 / (1 + h * b.angularDamping);
        b.vx *= ld; b.vy *= ld; b.w *= ad;
        const sp = b.vx * b.vx + b.vy * b.vy;
        if (sp > MAX_SPEED * MAX_SPEED) { const f = MAX_SPEED / Math.sqrt(sp); b.vx *= f; b.vy *= f; }
        const maxW = 0.25 * Math.PI * invH;
        if (b.w > maxW) b.w = maxW; else if (b.w < -maxW) b.w = -maxW;
      }
      // warm start
      for (const m of list) {
        const A = m.a, B = m.b, nx = m.nx, ny = m.ny, tx = ny, ty = -nx;
        for (let k = 0; k < m.count; k++) {
          const p = m.pts[k];
          const Px = p.normalImpulse * nx + p.tangentImpulse * tx;
          const Py = p.normalImpulse * ny + p.tangentImpulse * ty;
          A.vx -= m.mA * Px; A.vy -= m.mA * Py; A.w -= m.iA * (p.rAx * Py - p.rAy * Px);
          B.vx += m.mB * Px; B.vy += m.mB * Py; B.w += m.iB * (p.rBx * Py - p.rBy * Px);
        }
      }
      this.solve(list, invH, true);
      // integrate positions
      for (const b of bodies) {
        if (!b.awake && b.kind !== 'kinematic') continue;
        if (b.kind === 'static') continue;
        b.x += h * b.vx; b.y += h * b.vy; b.angle += h * b.w;
      }
      this.solve(list, invH, false);
    }
    // restitution
    for (const m of list) {
      if (m.restitution === 0) continue;
      const A = m.a, B = m.b, nx = m.nx, ny = m.ny;
      for (let k = 0; k < m.count; k++) {
        const p = m.pts[k];
        if (p.relVel > -RESTITUTION_THRESHOLD || p.maxImpulse === 0) continue;
        const dvx = (B.vx - B.w * p.rBy) - (A.vx - A.w * p.rAy);
        const dvy = (B.vy + B.w * p.rBx) - (A.vy + A.w * p.rAx);
        const vn = dvx * nx + dvy * ny;
        let imp = -p.normalMass * (vn + m.restitution * p.relVel);
        const nImp = Math.max(p.normalImpulse + imp, 0);
        imp = nImp - p.normalImpulse;
        p.normalImpulse = nImp;
        const Px = imp * nx, Py = imp * ny;
        A.vx -= m.mA * Px; A.vy -= m.mA * Py; A.w -= m.iA * (p.rAx * Py - p.rAy * Px);
        B.vx += m.mB * Px; B.vy += m.mB * Py; B.w += m.iB * (p.rBx * Py - p.rBy * Px);
      }
    }
    // impacts: the first step a contact pushes after being apart
    for (const m of list) {
      let speed = 0, pushed = false, px = 0, py = 0;
      for (let k = 0; k < m.count; k++) {
        const p = m.pts[k];
        if (p.maxImpulse > 0) { pushed = true; if (-p.relVel > speed) { speed = -p.relVel; px = p.x; py = p.y; } }
      }
      if (pushed && !m.hit && speed > 0.8) this.events.push({ type: 'impact', a: m.a, b: m.b, x: px, y: py, speed });
      m.hit = pushed;
    }
    for (const b of bodies) {
      b.fx = 0; b.fy = 0;
      if (b.kind !== 'static') b.updateTransform();
    }
    this.time += dt;
    this.updateSleep(dt);
  }

  solve(list, invH, useBias) {
    for (const m of list) {
      const A = m.a, B = m.b, nx = m.nx, ny = m.ny, tx = ny, ty = -nx;
      const mA = m.mA, iA = m.iA, mB = m.mB, iB = m.iB;
      const dax = A.x - A.x0, day = A.y - A.y0, dbx = B.x - B.x0, dby = B.y - B.y0;
      const daA = A.angle - A.a0, daB = B.angle - B.a0;
      const cA = Math.cos(daA), sA = Math.sin(daA), cB = Math.cos(daB), sB = Math.sin(daB);
      const soft = m.soft;
      let total = 0;
      for (let k = 0; k < m.count; k++) {
        const p = m.pts[k];
        const rAx = p.rAx, rAy = p.rAy, rBx = p.rBx, rBy = p.rBy;
        // current separation from the motion so far this step
        const prAx = cA * rAx - sA * rAy, prAy = sA * rAx + cA * rAy;
        const prBx = cB * rBx - sB * rBy, prBy = sB * rBx + cB * rBy;
        const dx = (dbx - dax) + (prBx - prAx), dy = (dby - day) + (prBy - prAy);
        const s = dx * nx + dy * ny + p.adj;
        let bias = 0, massScale = 1, impulseScale = 0;
        if (s > 0) bias = s * invH;
        else if (useBias) {
          bias = Math.max(soft.biasRate * Math.min(0, s + LINEAR_SLOP), -MAX_PUSH);
          massScale = soft.massScale; impulseScale = soft.impulseScale;
        }
        const dvx = (B.vx - B.w * rBy) - (A.vx - A.w * rAy);
        const dvy = (B.vy + B.w * rBx) - (A.vy + A.w * rAx);
        const vn = dvx * nx + dvy * ny;
        let imp = -p.normalMass * massScale * (vn + bias) - impulseScale * p.normalImpulse;
        const nImp = Math.max(p.normalImpulse + imp, 0);
        imp = nImp - p.normalImpulse;
        p.normalImpulse = nImp;
        if (nImp > p.maxImpulse) p.maxImpulse = nImp;
        total += nImp;
        const Px = imp * nx, Py = imp * ny;
        A.vx -= mA * Px; A.vy -= mA * Py; A.w -= iA * (rAx * Py - rAy * Px);
        B.vx += mB * Px; B.vy += mB * Py; B.w += iB * (rBx * Py - rBy * Px);
      }
      const fr = m.friction;
      for (let k = 0; k < m.count; k++) {
        const p = m.pts[k];
        const rAx = p.rAx, rAy = p.rAy, rBx = p.rBx, rBy = p.rBy;
        const dvx = (B.vx - B.w * rBy) - (A.vx - A.w * rAy);
        const dvy = (B.vy + B.w * rBx) - (A.vy + A.w * rAx);
        const vt = dvx * tx + dvy * ty;
        let imp = -p.tangentMass * vt;
        const maxF = fr * p.normalImpulse;
        const nImp = Math.max(-maxF, Math.min(maxF, p.tangentImpulse + imp));
        imp = nImp - p.tangentImpulse;
        p.tangentImpulse = nImp;
        const Px = imp * tx, Py = imp * ty;
        A.vx -= mA * Px; A.vy -= mA * Py; A.w -= iA * (rAx * Py - rAy * Px);
        B.vx += mB * Px; B.vy += mB * Py; B.w += iB * (rBx * Py - rBy * Px);
      }
      // rolling resistance for round bodies so pandas come to rest
      if (m.rolling > 0 && total > 0) {
        const maxR = m.rolling * total;
        const dw = B.w - A.w;
        const k = iA + iB;
        if (k > 0) {
          let imp = -dw / k;
          const nImp = Math.max(-maxR, Math.min(maxR, m.rollImpulse + imp));
          imp = nImp - m.rollImpulse;
          m.rollImpulse = nImp;
          A.w -= iA * imp; B.w += iB * imp;
        }
      }
    }
  }

  collide() {
    const bodies = this.bodies;
    const old = this.manifolds;
    const next = new Map();
    const list = [];
    // sleeping bodies keep their count from when they fell asleep
    for (const b of bodies) b.tcount = 0;
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      const aActive = (A.dynamic && A.awake) || (A.kind === 'kinematic');
      for (let j = i + 1; j < bodies.length; j++) {
        const B = bodies[j];
        if (!A.dynamic && !B.dynamic) continue;
        const bActive = (B.dynamic && B.awake) || (B.kind === 'kinematic');
        if (!aActive && !bActive) continue;
        if (!A.dynamic && !B.awake) continue;
        if (!B.dynamic && !A.awake) continue;
        if (A.maxX + AABB_MARGIN < B.minX || B.maxX + AABB_MARGIN < A.minX ||
            A.maxY + AABB_MARGIN < B.minY || B.maxY + AABB_MARGIN < A.minY) continue;
        if (!collide(A, B, scratch)) continue;
        const key = A.id * 100000 + B.id;
        const prev = old.get(key);
        const m = prev || {
          a: A, b: B, nx: 0, ny: 0, count: 0, touching: false, rollImpulse: 0,
          pts: [{ id: -1 }, { id: -1 }].map((p) => Object.assign(p, { x: 0, y: 0, sep: 0, normalImpulse: 0, tangentImpulse: 0 })),
          friction: Math.sqrt(A.friction * B.friction),
          restitution: Math.max(A.restitution, B.restitution),
          rolling: (A.shape.type === 'circle' || B.shape.type === 'circle') ? 0.06 : 0,
        };
        // match feature ids for warm starting
        const keep0 = m.pts[0], keep1 = m.pts[1];
        const oldIds = [m.count > 0 ? keep0.id : -2, m.count > 1 ? keep1.id : -2];
        const oldN = [keep0.normalImpulse, keep1.normalImpulse];
        const oldT = [keep0.tangentImpulse, keep1.tangentImpulse];
        m.nx = scratch.nx; m.ny = scratch.ny; m.count = scratch.count;
        let minSep = Infinity;
        for (let k = 0; k < scratch.count; k++) {
          const s = scratch.points[k], p = m.pts[k];
          p.x = s.x; p.y = s.y; p.sep = s.sep;
          const at = s.id === oldIds[0] ? 0 : s.id === oldIds[1] ? 1 : -1;
          p.id = s.id;
          p.normalImpulse = at >= 0 ? oldN[at] : 0;
          p.tangentImpulse = at >= 0 ? oldT[at] : 0;
          if (s.sep < minSep) minSep = s.sep;
        }
        m.touching = minSep < LINEAR_SLOP * 4;
        if (m.touching) {
          A.tcount++; B.tcount++;
          // wake a sleeper touched by something moving
          if (A.dynamic && !A.awake && (B.awake || B.kind === 'kinematic')) wakeTouch(A, B);
          if (B.dynamic && !B.awake && (A.awake || A.kind === 'kinematic')) wakeTouch(B, A);
        }
        next.set(key, m);
        list.push(m);
      }
    }
    for (const b of bodies) if (b.awake || !b.dynamic) b.touching = b.tcount;
    this.manifolds = next;
    this.list = list;
  }

  updateSleep(dt) {
    const bodies = this.bodies;
    for (const b of bodies) {
      if (!b.dynamic || !b.awake) continue;
      if (!this.allowSleep || b.vx * b.vx + b.vy * b.vy > SLEEP_LINEAR * SLEEP_LINEAR || b.w * b.w > SLEEP_ANGULAR * SLEEP_ANGULAR) b.sleepTime = 0;
      else b.sleepTime += dt;
    }
    if (!this.allowSleep) return;
    // islands over touching dynamic-dynamic contacts
    const parent = new Map();
    const find = (b) => {
      let r = b;
      while (parent.get(r) !== r) r = parent.get(r);
      let c = b;
      while (parent.get(c) !== r) { const nx = parent.get(c); parent.set(c, r); c = nx; }
      return r;
    };
    for (const b of bodies) if (b.dynamic) parent.set(b, b);
    const onMover = new Set();
    for (const m of this.list) {
      if (!m.touching) continue;
      if (m.a.dynamic && m.b.dynamic) {
        const ra = find(m.a), rb = find(m.b);
        if (ra !== rb) parent.set(ra, rb);
      } else if (m.a.kind === 'kinematic' || m.b.kind === 'kinematic') {
        const k = m.a.kind === 'kinematic' ? m.a : m.b;
        if (k.vx || k.vy || k.w) onMover.add(m.a.dynamic ? m.a : m.b);
      }
    }
    const minTime = new Map();
    for (const b of bodies) {
      if (!b.dynamic) continue;
      const r = find(b);
      const t = onMover.has(b) ? 0 : (b.awake ? b.sleepTime : Infinity);
      minTime.set(r, Math.min(minTime.get(r) ?? Infinity, t));
    }
    for (const b of bodies) {
      if (!b.dynamic) continue;
      const t = minTime.get(find(b));
      if (t >= TIME_TO_SLEEP) {
        if (b.awake) { b.awake = false; b.vx = 0; b.vy = 0; b.w = 0; }
      } else if (!b.awake) {
        b.awake = true;
      }
    }
  }

  // Deep copy for look-ahead planning. User data is shared by reference.
  clone() {
    const w = new World({ gravity: this.gravity, substeps: this.substeps, allowSleep: this.allowSleep });
    w.nextId = this.nextId;
    w.time = this.time;
    w.onForce = this.onForce;
    const map = new Map();
    for (const b of this.bodies) {
      const c = Object.create(Body.prototype);
      Object.assign(c, b);
      c.wv = b.wv ? b.wv.map((p) => ({ x: p.x, y: p.y })) : null;
      c.wn = b.wn ? b.wn.map((p) => ({ x: p.x, y: p.y })) : null;
      map.set(b, c);
      w.bodies.push(c);
    }
    for (const [k, m] of this.manifolds) {
      const c = { ...m, a: map.get(m.a), b: map.get(m.b), pts: m.pts.map((p) => ({ ...p })) };
      w.manifolds.set(k, c);
      w.list.push(c);
    }
    w.map = map;
    return w;
  }
}

function wakeTouch(sleeper, other) {
  // A touch only wakes a sleeper when the other side is actually moving.
  const v2 = other.vx * other.vx + other.vy * other.vy;
  if (v2 > SLEEP_LINEAR * SLEEP_LINEAR * 4 || Math.abs(other.w) > SLEEP_ANGULAR * 2) {
    sleeper.awake = true;
    sleeper.sleepTime = 0;
  }
}
