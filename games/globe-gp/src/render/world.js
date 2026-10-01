import * as THREE from 'three';
import { Merger, CellMergers } from './geom.js';
import { makeSky, makeClouds, makeBackdrop, makeSkylineLights } from './sky.js';
import { rng, clamp, lerp, smoothstep } from '../math.js';

// Builds a location's static scene: terrain, road, walls, scenery, landmark
// and sky. Written as a generator that yields between phases so the loader
// can spread the work over several frames.

const C = (c) => new THREE.Color(c);
const SURFACE_TINT = { asphalt: null, wet: '#1e2430', snow: '#eef4fb', sand: '#dcc08a', dirt: '#9a6a44', grass: null };

// ---------------------------------------------------------------- terrain shape

export function terrainShape(track, loc) {
  const r = rng(loc.circuit.seed * 101 + 7);
  const waves = [];
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2, k = (Math.PI * 2) / (90 + i * 70);
    waves.push({ kx: Math.cos(a) * k, kz: Math.sin(a) * k, ph: r() * 6.28, amp: 1 / (1 + i * 0.6) });
  }
  const noise = (x, z) => { let h = 0; for (const w of waves) h += Math.sin(x * w.kx + z * w.kz + w.ph) * w.amp; return h; };
  let cx = 0, cz = 0;
  for (const s of track.samples) { cx += s.x; cz += s.z; }
  cx /= track.samples.length; cz /= track.samples.length;
  let radius = 0;
  for (const s of track.samples) radius = Math.max(radius, Math.hypot(s.x - cx, s.z - cz));
  const dirA = r() * Math.PI * 2;
  const dir = { x: Math.cos(dirA), z: Math.sin(dirA) };
  const shape = { center: { x: cx, z: cz }, radius, water: null, dir };
  let base;
  switch (loc.terrain) {
    case 'dunes': base = (x, z) => noise(x, z) * 7 + Math.abs(noise(x * 1.7, z * 1.7)) * 4; break;
    case 'mountains': base = (x, z) => noise(x, z) * 6 + Math.max(0, Math.hypot(x - cx, z - cz) - radius * 0.7) * 0.25; break;
    case 'rolling': base = (x, z) => noise(x, z) * 4; break;
    case 'tundra': base = (x, z) => noise(x, z) * 3 + Math.abs(noise(x * 2.3, z * 2.3)) * 1.5; break;
    case 'beach': {
      shape.water = -2.5;
      base = (x, z) => {
        const along = (x - cx) * dir.x + (z - cz) * dir.z;
        return noise(x, z) * 1.5 + 1 - smoothstep(radius * 0.75, radius * 1.15, along) * 9 + smoothstep(-radius * 0.2, -radius * 1.2, along) * 12;
      };
      break;
    }
    case 'city': base = () => -2; break;
    default: base = (x, z) => noise(x, z) * 0.6;
  }
  if (loc.theme === 'paris') {
    // The Seine: a channel across the map, kept clear of the road.
    shape.water = -3.5;
    const inner = base;
    base = (x, z) => {
      const side = Math.abs((x - cx) * dir.z - (z - cz) * dir.x - radius * 0.15);
      return inner(x, z) - (1 - smoothstep(18, 34, side)) * 6;
    };
  }
  if (loc.theme === 'sahara') shape.water = -100; // only the oasis pool, drawn separately
  // Water always sits well below the lowest stretch of road.
  if (shape.water !== null && shape.water > -50) {
    let low = Infinity;
    for (const s of track.samples) low = Math.min(low, s.y);
    shape.water = Math.min(shape.water, low - 2);
  }
  shape.base = base;
  shape.noise = noise;
  return shape;
}

// Final ground height: the scenic shape, flattened toward the road and the
// shortcuts near them.
export function groundAt(track, shape, field, x, z) {
  const f = field.at(x, z);
  let h = shape.base(x, z);
  const city = track.location.terrain === 'city';
  if (f.i >= 0 && !city) {
    const roadY = track.samples[f.i].y - 0.5;
    h = lerp(roadY, h, smoothstep(track.wallOffset + 2, track.wallOffset + 34, f.d));
  }
  for (const sc of track.shortcuts) {
    const p = track.projectShortcut(sc, x, z);
    if (p.t < -0.05 || p.t > 1.05) continue;
    const y = lerp(sc.ya, sc.yb, clamp(p.t, 0, 1)) - 0.35;
    h = lerp(y, h, smoothstep(sc.half + 2, sc.half + 18, Math.abs(p.lateral)));
  }
  return h;
}

// ---------------------------------------------------------------- builder

export function* buildWorld(track, loc, { quality = 1, reduced = false } = {}) {
  const P = loc.palette;
  const group = new THREE.Group();
  const out = { group, animated: [] };
  const field = track.distanceField(6, 320, 90);
  const shape = terrainShape(track, loc);
  out.shape = shape;
  out.field = field;
  const ground = (x, z) => groundAt(track, shape, field, x, z);
  yield 'field';

  // ------------------------------------------------------------ terrain
  {
    const cell = 8;
    const nx = Math.ceil((field.nx * field.cell) / cell), nz = Math.ceil((field.nz * field.cell) / cell);
    const geo = new THREE.PlaneGeometry(nx * cell, nz * cell, nx, nz).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const g1 = C(P.ground), g2 = C(P.groundDark), c = new THREE.Color();
    const ox = field.minX + (nx * cell) / 2, oz = field.minZ + (nz * cell) / 2;
    const snowy = loc.theme === 'iceland', red = loc.theme === 'outback';
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + ox, z = pos.getZ(i) + oz;
      const y = ground(x, z);
      pos.setXYZ(i, x, y, z);
      const n = shape.noise(x * 2.1, z * 2.1);
      c.copy(g2).lerp(g1, 0.5 + 0.35 * n);
      if (snowy && n > 0.45) c.lerp(C('#e8f2f8'), 0.75);
      if (red && n < -0.6) c.lerp(C('#c89a4a'), 0.5);
      if (shape.water !== null && y < shape.water + 0.6) c.lerp(C(loc.terrain === 'beach' ? '#e8d49a' : '#6a7a5a'), 0.6);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: P.groundDark }));
    floor.position.y = loc.terrain === 'city' ? -2.2 : -8;
    floor.updateMatrix();
    floor.matrixAutoUpdate = false;
    group.add(floor);
    if (shape.water !== null && shape.water > -50) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
        new THREE.MeshPhongMaterial({ color: P.water, shininess: 90, specular: '#88aacc', transparent: true, opacity: 0.88 }));
      water.position.y = shape.water;
      water.updateMatrix();
      water.matrixAutoUpdate = false;
      group.add(water);
    }
  }
  yield 'terrain';

  // ------------------------------------------------------------ road
  out.road = buildRoad(track, loc);
  group.add(out.road);
  yield 'road';

  const walls = buildWalls(track, loc);
  group.add(walls.solid);
  if (walls.glow) group.add(walls.glow);
  yield 'walls';

  // ------------------------------------------------------------ scenery
  const cells = new CellMergers(150);
  const r = rng(loc.circuit.seed * 7 + (track.closed ? 1 : 2));
  const avoidCut = (x, z, pad) => track.shortcuts.some((sc) => {
    const p = track.projectShortcut(sc, x, z);
    return p.t > -0.1 && p.t < 1.1 && Math.abs(p.lateral) < sc.half + pad;
  });
  // Random spots between dmin and dmax meters from the road centre.
  const spots = (count, dmin, dmax, pad = 6, tries = 40) => {
    const list = [];
    const w = field.nx * field.cell, h = field.nz * field.cell;
    for (let k = 0; k < count * tries && list.length < count; k++) {
      const x = field.minX + r() * w, z = field.minZ + r() * h;
      const f = field.at(x, z);
      if (f.d < dmin || f.d > dmax) continue;
      if (avoidCut(x, z, pad)) continue;
      const y = ground(x, z);
      if (shape.water !== null && y < shape.water + 0.4) continue;
      const s = f.i >= 0 ? track.samples[f.i] : null;
      list.push({ x, y, z, d: f.d, ry: s ? s.heading : r() * 6.28, s });
    }
    return list;
  };
  const far = field.reach;
  const sc = quality < 1 ? 0.6 : 1;
  const n = (k) => Math.round(k * sc);
  yield* buildTheme(loc, { cells, spots, r, n, track, ground, far, shape, out });
  yield 'scenery';

  lightPools(loc, cells, track);
  overRoad(loc, { cells, track, r });
  gantry(track, loc, group);
  landmark(loc, { cells, track, shape, field, ground, r });
  const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const poolMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
  out.cells = [];
  let built = 0;
  for (const mesh of cells.buildEach({ solid: solidMat, detail: solidMat, glow: glowMat, glowd: glowMat, pool: poolMat }, group, { detailLayers: ['detail', 'glowd'] })) {
    out.cells.push(mesh);
    if (++built % 8 === 0) yield 'cells';
  }
  yield 'cells';

  // ------------------------------------------------------------ sky
  const center = new THREE.Vector3(shape.center.x, 0, shape.center.z);
  out.sky = makeSky(loc);
  group.add(out.sky);
  const clouds = makeClouds(loc, center, shape.radius);
  if (clouds) group.add(clouds);
  const backdrop = makeBackdrop(loc, center, shape.radius);
  if (backdrop) group.add(backdrop);
  const skyline = makeSkylineLights(loc, center, shape.radius);
  if (skyline) group.add(skyline);
  yield 'sky';

  // ------------------------------------------------------------ pads, coins
  out.pads = buildPads(track);
  group.add(out.pads);
  out.coins = buildCoins(track);
  group.add(out.coins);
  out.center = center;
  void reduced;
  return out;
}

// ---------------------------------------------------------------- road

function surfaceColor(surface, P, k) {
  const base = C(P.road);
  const tint = SURFACE_TINT[surface];
  if (surface === 'wet') base.lerp(C(tint), 0.35);
  else if (tint) base.lerp(C(tint), surface === 'snow' ? 0.55 + 0.25 * k : 0.6);
  return base.multiplyScalar(1.08 + 0.08 * k);
}

function offroadColor(loc) {
  const P = loc.palette;
  switch (loc.offroad) {
    case 'sand': return C('#e2c48c');
    case 'snow': return C('#e8eef6');
    case 'dirt': return C(P.ground).lerp(C('#8a5a34'), 0.5);
    case 'asphalt': return C(P.road).multiplyScalar(0.8);
    default: return C(P.ground).multiplyScalar(0.9);
  }
}

export function buildRoad(track, loc) {
  const P = loc.palette;
  const M = new Merger();
  const n = track.samples.length;
  const segs = track.closed ? n : n - 1;
  const city = loc.terrain === 'city';
  const runoff = offroadColor(loc);
  const curbA = C(P.curbA), curbB = C(P.curbB), line = C(P.line);
  const skirt = C(city ? '#4a4e58' : P.groundDark).multiplyScalar(0.8);
  const H = track.half, W = track.wallOffset;
  const lats = [-W, -H - 0.9, -H, H, H + 0.9, W];
  const at = (s, lat, lift = 0) => [s.x - s.dz * lat, s.y + lift, s.z + s.dx * lat];
  const r = rng(track.spec.seed + 77);
  const noiseK = new Float32Array(n).map(() => r());
  for (let i = 0; i < segs; i++) {
    const a = track.samples[i], b = track.samples[(i + 1) % n];
    const ka = noiseK[i], kb = noiseK[(i + 1) % n];
    const curb = Math.abs(a.curv) > 1 / 48;
    const stripe = Math.floor(i / 2) % 2 ? curbA : curbB;
    for (let c = 0; c < lats.length - 1; c++) {
      const l0 = lats[c], l1 = lats[c + 1];
      let ca, cb;
      if (c === 0 || c === 4) { ca = cb = runoff; }
      else if (c === 1 || c === 3) { ca = cb = curb ? stripe : surfaceColor(a.surface, P, ka).multiplyScalar(0.85); }
      else { ca = surfaceColor(a.surface, P, ka); cb = surfaceColor(b.surface, P, kb); }
      const lift = c === 1 || c === 3 ? 0.02 : 0;
      M.quad(at(a, l0, lift), at(a, l1, lift), at(b, l1, lift), at(b, l0, lift), ca, ca, cb, cb);
    }
    // Skirts down the outer edges.
    const drop = city ? 1.6 : 1.2;
    for (const side of [-1, 1]) {
      const pa = at(a, side * W), pb = at(b, side * W);
      const qa = [pa[0], pa[1] - drop, pa[2]], qb = [pb[0], pb[1] - drop, pb[2]];
      if (side > 0) M.quad(pa, qa, qb, pb, skirt);
      else M.quad(pb, qb, qa, pa, skirt);
    }
    if (city) {
      // Deck underside.
      M.quad(at(a, W, -1.6), at(a, -W, -1.6), at(b, -W, -1.6), at(b, W, -1.6), skirt);
    }
    // Lines: solid edges, dashed centre, on paved surfaces only.
    const paved = a.surface === 'asphalt' || a.surface === 'wet';
    if (paved) {
      for (const lat of [-H + 0.45, H - 0.45]) M.quad(at(a, lat - 0.12, 0.03), at(a, lat + 0.12, 0.03), at(b, lat + 0.12, 0.03), at(b, lat - 0.12, 0.03), line);
      if (i % 4 < 2) M.quad(at(a, -0.14, 0.03), at(a, 0.14, 0.03), at(b, 0.14, 0.03), at(b, -0.14, 0.03), line);
    }
  }
  // Start / finish checkerboard.
  const startI = track.indexAt(track.startDist);
  const finishI = track.closed ? startI : track.indexAt(track.finishDist);
  for (const idx of new Set([startI, finishI])) {
    const s = track.samples[idx];
    const cols = Math.round(track.width);
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < cols; k++) {
        const l0 = -H + (k * track.width) / cols, l1 = -H + ((k + 1) * track.width) / cols;
        const d0 = row * 1.1, d1 = d0 + 1.1;
        const p = (lat, d) => [s.x - s.dz * lat + s.dx * d, s.y + 0.04, s.z + s.dx * lat + s.dz * d];
        M.quad(p(l0, d0), p(l1, d0), p(l1, d1), p(l0, d1), (k + row) % 2 ? C('#111111') : C('#ffffff'));
      }
    }
  }
  // Shortcut ribbons.
  for (const sc of track.shortcuts) {
    const col = offroadColor({ ...loc, offroad: sc.surface });
    const edge = col.clone().multiplyScalar(0.8);
    const steps = Math.ceil(sc.len / 2);
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps, t1 = (k + 1) / steps;
      const p = (t, lat) => [lerp(sc.ax, sc.bx, t) - sc.dz * lat, lerp(sc.ya, sc.yb, t) + 0.05, lerp(sc.az, sc.bz, t) + sc.dx * lat];
      const wv = sc.half + 0.6;
      M.quad(p(t0, -wv), p(t0, wv), p(t1, wv), p(t1, -wv), col.clone().multiplyScalar(0.95 + 0.1 * r()));
      for (const s of [-1, 1]) M.quad(p(t0, s * wv), p(t0, s * (wv + 1)), p(t1, s * (wv + 1)), p(t1, s * wv), edge);
    }
  }
  // Ramps: striped wedges across the road.
  for (const rp of track.ramps) {
    const p = track.pointAt(rp.dist);
    M.add('wedge', { x: p.x, y: track.pointAt(rp.dist).y + 0.01, z: p.z, sx: track.width, sy: rp.height, sz: rp.length, ry: p.heading }, '#ffd23d');
    for (let k = -2; k <= 2; k++) {
      const q = track.pointAt(rp.dist + rp.length * 0.5, k * track.width * 0.18);
      M.add('box', { x: q.x, y: p.y + rp.height * 0.5 + 0.05, z: q.z, sx: 1.2, sy: 0.05, sz: rp.length * 1.02, ry: p.heading, rx: -Math.atan2(rp.height, rp.length) }, '#1a1a1a');
    }
  }
  const wet = loc.surface === 'wet' || loc.patch === 'wet';
  const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: wet ? 50 : 6, specular: wet ? '#4a5060' : '#141414', flatShading: false });
  const mesh = new THREE.Mesh(M.build(), mat);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// ---------------------------------------------------------------- walls

const WALL_STYLE = {
  stone: { h: 1.0, t: 0.6 }, bunting: { h: 0.8, t: 0.4 }, wood: { h: 1.0, t: 0.35 }, neon: { h: 1.0, t: 0.4, glow: true },
  sandbags: { h: 0.9, t: 0.8 }, tyres: { h: 0.9, t: 0.9 }, rail: { h: 1.1, t: 0.25, glow: true }, snowbank: { h: 1.0, t: 1.2 },
};

function buildWalls(track, loc) {
  const P = loc.palette;
  const st = WALL_STYLE[loc.wall] || WALL_STYLE.stone;
  const M = new Merger(), G = new Merger();
  const wall = C(P.wall), trim = C(P.wallTrim);
  const r = rng(track.spec.seed + 5);
  let k = 0;
  for (const w of track.walls) {
    k++;
    const y0 = w.y - 0.3, y1 = w.y + st.h;
    const ox = -w.nx * st.t, oz = -w.nz * st.t; // thickness away from the road
    const a = [w.ax, y0, w.az], b = [w.bx, y0, w.bz], a1 = [w.ax, y1, w.az], b1 = [w.bx, y1, w.bz];
    const ab = [w.ax + ox, y1, w.az + oz], bb = [w.bx + ox, y1, w.bz + oz], ab0 = [w.ax + ox, y0, w.az + oz], bb0 = [w.bx + ox, y0, w.bz + oz];
    let face = wall, top = trim;
    if (loc.wall === 'tyres') face = k % 2 ? C('#1c1c1e') : trim;
    if (loc.wall === 'sandbags') face = wall.clone().multiplyScalar(0.9 + 0.15 * r());
    if (loc.wall === 'snowbank') { face = wall.clone().multiplyScalar(0.96 + 0.04 * r()); top = C('#ffffff'); }
    if (loc.wall === 'bunting') face = k % 2 ? wall : C(P.wallTrim);
    // Front face winds toward the road side.
    const front = (w.bx - w.ax) * w.nz - (w.bz - w.az) * w.nx > 0;
    if (front) { M.quad(a, b, b1, a1, face); M.quad(bb0, ab0, ab, bb, face.clone().multiplyScalar(0.7)); M.quad(a1, b1, bb, ab, top); }
    else { M.quad(b, a, a1, b1, face); M.quad(ab0, bb0, bb, ab, face.clone().multiplyScalar(0.7)); M.quad(b1, a1, ab, bb, top); }
    if (st.glow) {
      const gy = y1 + 0.02;
      const g0 = [w.ax + ox * 0.3, gy, w.az + oz * 0.3], g1 = [w.bx + ox * 0.3, gy, w.bz + oz * 0.3];
      const g2 = [w.bx + ox * 0.7, gy, w.bz + oz * 0.7], g3 = [w.ax + ox * 0.7, gy, w.az + oz * 0.7];
      const glow = C(loc.wall === 'neon' ? (k % 30 < 15 ? P.wallTrim : P.curbB) : P.wallTrim);
      if (front) G.quad(g0, g1, g2, g3, glow); else G.quad(g1, g0, g3, g2, glow);
    }
  }
  // Bollards and arrow boards at shortcut entrances.
  for (const sc of track.shortcuts) {
    for (const cross of [sc.crossA, sc.crossB]) {
      for (const off of [-11, 11]) {
        const p = track.pointAt(cross + off, sc.side * (track.wallOffset + 0.2));
        for (let j = 0; j < 3; j++) M.add('cyl', { x: p.x, y: p.y + j * 0.4 - 0.2, z: p.z, sx: 0.5, sy: 0.4, sz: 0.5 }, j % 2 ? '#1a1a1a' : '#ffd23d');
      }
    }
    const p = track.pointAt(sc.crossA - 14, sc.side * (track.wallOffset + 1.5));
    M.add('box', { x: p.x, y: p.y + 1.2, z: p.z, sx: 0.15, sy: 2.4, sz: 0.15 }, '#3a3a3a');
    G.add('box', { x: p.x, y: p.y + 2.5, z: p.z, sx: 2.6, sy: 0.9, sz: 0.1, ry: p.heading + Math.PI / 2 }, '#ffd23d');
  }
  const solid = new THREE.Mesh(M.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  solid.receiveShadow = true;
  solid.matrixAutoUpdate = false;
  const glow = G.count ? new THREE.Mesh(G.build(), new THREE.MeshBasicMaterial({ vertexColors: true })) : null;
  if (glow) glow.matrixAutoUpdate = false;
  return { solid, glow };
}

// ---------------------------------------------------------------- pads & coins

function buildPads(track) {
  const M = new Merger();
  for (const pad of track.pads) {
    for (let k = 0; k < 3; k++) {
      const d = pad.dist + 0.8 + k * 1.8;
      const c = track.pointAt(d, pad.lateral);
      const y = c.y + 0.06;
      const half = pad.width / 2;
      const l = track.pointAt(d - 0.9, pad.lateral - half), rr = track.pointAt(d - 0.9, pad.lateral + half);
      const tip = [c.x + c.dx * 0.6, y, c.z + c.dz * 0.6];
      const lb = [l.x, y, l.z], rb = [rr.x, y, rr.z];
      const lc = [c.x - c.dz * -0.4 * 0 - c.dx * 0.3, y, c.z - c.dz * 0.3];
      M.tri(lb, tip, lc, C('#ffe36a'), C('#ff8a1a'), C('#ffe36a'));
      M.tri(lc, tip, rb, C('#ffe36a'), C('#ff8a1a'), C('#ffe36a'));
    }
    // Glowing frame.
    const a = track.pointAt(pad.dist, pad.lateral - pad.width / 2), b = track.pointAt(pad.dist, pad.lateral + pad.width / 2);
    const c2 = track.pointAt(pad.dist + pad.length, pad.lateral + pad.width / 2), d2 = track.pointAt(pad.dist + pad.length, pad.lateral - pad.width / 2);
    const y = a.y + 0.04;
    M.quad([a.x, y, a.z], [d2.x, y, d2.z], [c2.x, y, c2.z], [b.x, y, b.z], C('#3a1a6a'));
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(M.build(), mat);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function buildCoins(track) {
  const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.14, 14).rotateX(Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({ color: '#ffcf3a', emissive: '#a86a00', emissiveIntensity: 0.55, shininess: 90, specular: '#ffffff' });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, track.coins.length));
  const m = new THREE.Matrix4();
  track.coins.forEach((c, i) => mesh.setMatrixAt(i, m.makeTranslation(c.x, c.y, c.z)));
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.computeBoundingSphere();
  return mesh;
}

// ---------------------------------------------------------------- props

function tree(M, x, y, z, s, trunk, leaves, kind = 'round', r = Math.random) {
  if (kind === 'pine') {
    M.add('cyl', { x, y, z, sx: 0.5 * s, sy: 1.6 * s, sz: 0.5 * s }, trunk);
    for (let k = 0; k < 3; k++) M.add('cone', { x, y: y + (1.2 + k * 1.5) * s, z, sx: (3.4 - k * 0.9) * s, sy: 2.6 * s, sz: (3.4 - k * 0.9) * s, ry: k }, leaves[k % leaves.length]);
    return;
  }
  if (kind === 'palm') {
    const lean = (r() - 0.5) * 0.4;
    for (let k = 0; k < 4; k++) M.add('cyl6', { x: x + lean * k * s, y: y + k * 1.6 * s, z, sx: 0.45 * s, sy: 1.7 * s, sz: 0.45 * s, rz: -lean * 0.4 }, k % 2 ? trunk : C(trunk).multiplyScalar(0.85));
    const tx = x + lean * 4 * s, ty = y + 6.4 * s;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      M.add('box', { x: tx + Math.cos(a) * 1.4 * s, y: ty - 0.3 * s, z: z + Math.sin(a) * 1.4 * s, sx: 3.2 * s, sy: 0.12 * s, sz: 0.9 * s, ry: -a, rz: -0.35 }, leaves[k % leaves.length]);
    }
    return;
  }
  M.add('cyl', { x, y, z, sx: 0.55 * s, sy: 2.4 * s, sz: 0.55 * s }, trunk);
  const blobs = kind === 'gum' ? 2 : 3;
  for (let k = 0; k < blobs; k++) {
    M.add('ico', { x: x + (r() - 0.5) * 1.6 * s, y: y + (2.6 + k * 0.9 + r() * 0.4) * s, z: z + (r() - 0.5) * 1.6 * s, s: (2.8 - k * 0.5) * s * (kind === 'gum' ? 0.9 : 1), sy: (2.2 - k * 0.3) * s, ry: r() * 6 }, leaves[(k + Math.floor(r() * 3)) % leaves.length]);
  }
}

function building(M, G, p, w, h, d, color, roof, opts = {}) {
  const { x, y, z, ry } = p;
  M.add('boxb', { x, y: y - 0.5, z, sx: w, sy: h + 0.5, sz: d, ry }, color, 0.25);
  if (roof === 'mansard') M.add('frustum4', { x, y: y + h, z, sx: w * 1.0, sy: 3.2, sz: d * 1.0, ry }, '#5a6478');
  else if (roof === 'gable') M.add('prism', { x, y: y + h, z, sx: w * 1.08, sy: Math.min(w, d) * 0.55, sz: d * 1.08, ry: ry + Math.PI / 2 }, opts.roofColor || '#8a3a2a');
  else if (roof === 'flat' && opts.rim) M.add('boxb', { x, y: y + h, z, sx: w * 0.6, sy: 2.5, sz: d * 0.6, ry }, C(color).multiplyScalar(0.8));
  if (G && opts.windows) {
    // Rows of lit windows on the two long faces.
    const rows = Math.max(1, Math.floor(h / 3.2));
    const cs = Math.cos(ry), sn = Math.sin(ry);
    for (let k = 0; k < rows; k++) {
      if (opts.r() < 0.18) continue;
      const wy = y + 2 + k * 3.2;
      for (const side of [-1, 1]) {
        // Face normal along local x.
        const lx = side * (w / 2 + 0.05);
        const color = opts.windows[(k + (side > 0 ? 1 : 0)) % opts.windows.length];
        if (opts.cols) {
          // Separate tall windows, like Paris apartments.
          const n = Math.floor(d / 2.6);
          for (let c = 0; c < n; c++) {
            const lz = -d / 2 + (c + 0.5) * (d / n);
            G.add('quad', { x: x + lx * cs + lz * sn, y: wy, z: z - lx * sn + lz * cs, sx: 1.1, sy: 1.8, ry: ry + side * Math.PI / 2 }, color);
          }
        } else G.add('quad', { x: x + lx * cs, y: wy, z: z - lx * sn, sx: d * 0.8, sy: 1.1, ry: ry + side * Math.PI / 2 }, color);
      }
    }
  }
}

function* buildTheme(loc, ctx) {
  const { cells, spots, r, n, track, ground, far } = ctx;
  const P = loc.palette;
  const solid = (x, z) => cells.at(x, z, 'solid');
  const detail = (x, z) => cells.at(x, z, 'detail');
  const glow = (x, z) => cells.at(x, z, 'glow');
  const glowd = (x, z) => cells.at(x, z, 'glowd');
  const W = track.wallOffset;
  // Faces a spot toward the road: rotate so local x points at the road.
  const facing = (p) => p.ry;

  switch (loc.theme) {
    case 'paris': {
      const creams = ['#efe2c8', '#e8d6b4', '#f4ead8', '#dccaa8'];
      for (const p of spots(n(80), 24, 42, 10)) building(solid(p.x, p.z), detail(p.x, p.z), { ...p, ry: facing(p) }, 12 + r() * 8, 13 + r() * 6, 14, creams[Math.floor(r() * 4)], 'mansard', { windows: ['#5a6a88', '#4a5a78'], r, cols: true });
      yield;
      for (const p of spots(n(130), W + 5, 70)) tree(solid(p.x, p.z), p.x, p.y - 0.3, p.z, 0.9 + r() * 0.5, '#6a5040', ['#5a8a3a', '#6a9a44', '#4a7a34'], 'round', r);
      yield;
      for (const p of spots(n(60), W + 1.5, W + 3)) {
        const D = detail(p.x, p.z);
        D.add('cyl', { x: p.x, y: p.y, z: p.z, sx: 0.18, sy: 4.2, sz: 0.18 }, '#2a3a2a');
        glowd(p.x, p.z).add('sphere', { x: p.x, y: p.y + 4.3, z: p.z, s: 0.55 }, '#ffe8b0');
      }
      yield;
      for (const p of spots(n(40), W + 3, W + 12)) {
        const D = detail(p.x, p.z);
        D.add('cyl', { x: p.x, y: p.y, z: p.z, sx: 0.1, sy: 2.2, sz: 0.1 }, '#eeeeee');
        D.add('cone', { x: p.x, y: p.y + 1.9, z: p.z, sx: 2.6, sy: 0.7, sz: 2.6 }, r() < 0.5 ? '#d83a3a' : '#2a5ab0');
      }
      yield;
      break;
    }
    case 'rio': {
      for (const p of spots(n(150), W + 4, 75)) tree(solid(p.x, p.z), p.x, p.y - 0.3, p.z, 0.8 + r() * 0.5, '#9a7a50', ['#2a9a4a', '#3ab45a', '#1a8a3a'], 'palm', r);
      yield;
      const houses = ['#ff6a8a', '#ffd23d', '#3fd0ff', '#7cff6a', '#ff9a3a', '#c88aff', '#ffffff'];
      for (const p of spots(n(130), 60, far + 1, 10)) building(solid(p.x, p.z), null, p, 5 + r() * 4, 4 + r() * 5, 5 + r() * 3, houses[Math.floor(r() * houses.length)], 'flat');
      yield;
      for (const p of spots(n(60), W + 3, 30)) {
        const D = detail(p.x, p.z);
        D.add('cyl', { x: p.x, y: p.y, z: p.z, sx: 0.1, sy: 2.4, sz: 0.1 }, '#ffffff');
        D.add('cone', { x: p.x, y: p.y + 2.1, z: p.z, sx: 3, sy: 0.8, sz: 3 }, houses[Math.floor(r() * houses.length)]);
      }
      yield;
      break;
    }
    case 'kyoto': {
      const maples = ['#e04a1a', '#f07a1a', '#c8281a', '#f0a030', '#d85a2a'];
      for (const p of spots(n(240), W + 4, 80)) tree(solid(p.x, p.z), p.x, p.y - 0.3, p.z, 0.8 + r() * 0.6, '#4a3226', maples, 'round', r);
      yield;
      for (const p of spots(n(12), 30, 60, 14)) {
        building(solid(p.x, p.z), null, p, 14, 5, 10, '#b8322a', null);
        solid(p.x, p.z).add('frustum4', { x: p.x, y: p.y + 5, z: p.z, sx: 22, sy: 4, sz: 16, ry: p.ry }, '#3a3a40');
      }
      yield;
      for (const p of spots(n(70), W + 1.5, W + 6)) {
        const D = detail(p.x, p.z);
        D.add('cyl6', { x: p.x, y: p.y, z: p.z, sx: 0.5, sy: 0.9, sz: 0.5 }, '#8a8a84');
        D.add('box', { x: p.x, y: p.y + 1.2, z: p.z, sx: 0.8, sy: 0.6, sz: 0.8 }, '#9a9a94');
        glowd(p.x, p.z).add('box', { x: p.x, y: p.y + 1.2, z: p.z, sx: 0.5, sy: 0.4, sz: 0.85 }, '#ffd88a');
        D.add('cone4', { x: p.x, y: p.y + 1.5, z: p.z, sx: 1.3, sy: 0.5, sz: 1.3 }, '#6a6a64');
      }
      yield;
      for (const p of spots(n(40), W + 6, 50)) for (let k = 0; k < 6; k++) solid(p.x, p.z).add('cyl6', { x: p.x + (r() - 0.5) * 3, y: p.y, z: p.z + (r() - 0.5) * 3, sx: 0.25, sy: 7 + r() * 4, sz: 0.25 }, '#7aa84a');
      yield;
      break;
    }
    case 'tokyo': {
      const blocks = ['#2a2a3a', '#33304a', '#262636', '#3a3446', '#2e3440'];
      const neon = ['#ff3fa4', '#3fe5ff', '#ffe46a', '#7cff6a', '#b06cff', '#ff7a3a'];
      const win = ['#ffe8a8', '#bfe8ff', '#ffd0e8'];
      for (const p of spots(n(150), 25, 80, 10)) {
        const h = 12 + r() * 40, w = 10 + r() * 10, d = 10 + r() * 8;
        building(solid(p.x, p.z), glow(p.x, p.z), p, w, h, d, blocks[Math.floor(r() * blocks.length)], 'flat', { windows: win, r, rim: r() < 0.3 });
        // Neon sign on the road side.
        const s = p.s;
        if (s) {
          const toRoad = Math.sign(-(p.x - s.x) * s.dz + (p.z - s.z) * s.dx) || 1;
          const lx = toRoad * (w / 2 + 0.3);
          const cs = Math.cos(p.ry), sn = Math.sin(p.ry);
          const sy = 4 + r() * 8;
          glow(p.x, p.z).add('box', { x: p.x + lx * cs, y: p.y + 4 + r() * (h - sy - 4), z: p.z - lx * sn, sx: 0.3, sy, sz: 1.6 + r() * 2, ry: p.ry }, neon[Math.floor(r() * neon.length)]);
        }
      }
      yield;
      for (const p of spots(n(70), W + 1.5, W + 3)) {
        detail(p.x, p.z).add('cyl', { x: p.x, y: p.y, z: p.z, sx: 0.2, sy: 5, sz: 0.2 }, '#3a3a44');
        glowd(p.x, p.z).add('sphere', { x: p.x, y: p.y + 5.1, z: p.z, s: 0.6 }, '#e8f4ff');
      }
      yield;
      for (const p of spots(n(30), W + 2, W + 8)) glowd(p.x, p.z).add('boxb', { x: p.x, y: p.y, z: p.z, sx: 1, sy: 1.8, sz: 0.8, ry: p.ry }, neon[Math.floor(r() * neon.length)]);
      yield;
      break;
    }
    case 'sahara': {
      for (const p of spots(n(90), W + 4, far + 1)) solid(p.x, p.z).add('ico', { x: p.x, y: p.y, z: p.z, sx: 2 + r() * 4, sy: 1.2 + r() * 2.5, sz: 2 + r() * 4, ry: r() * 6 }, r() < 0.5 ? '#b8743a' : '#c8884a');
      yield;
      // An oasis.
      const o = spots(1, 45, 70, 20)[0];
      if (o) {
        const pool = solid(o.x, o.z);
        pool.add('cyl12', { x: o.x, y: o.y + 0.15, z: o.z, sx: 22, sy: 0.15, sz: 16 }, P.water);
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * 6.28;
          tree(pool, o.x + Math.cos(a) * 13, ground(o.x + Math.cos(a) * 13, o.z + Math.sin(a) * 10) - 0.3, o.z + Math.sin(a) * 10, 0.9 + r() * 0.4, '#8a6a40', ['#3a8a3a', '#4a9a3a'], 'palm', r);
        }
      }
      for (const p of spots(n(14), W + 8, 60, 8)) {
        // Camels!
        const M = detail(p.x, p.z), ry = r() * 6.28, cs = Math.cos(ry), sn = Math.sin(ry);
        const at = (fx, fy) => ({ x: p.x + sn * fx, z: p.z + cs * fx, y: p.y + fy });
        M.add('box', { ...at(0, 1.9), sx: 0.9, sy: 0.8, sz: 2, ry }, '#c89a5a');
        M.add('sphere', { ...at(-0.2, 2.4), s: 1.0, ry }, '#c89a5a');
        M.add('box', { ...at(1.2, 2.5), sx: 0.35, sy: 1.3, sz: 0.35, ry, rx: 0.5 }, '#c89a5a');
        M.add('box', { ...at(1.55, 3.1), sx: 0.4, sy: 0.4, sz: 0.7, ry }, '#c89a5a');
        for (const fx of [-0.7, 0.7]) for (const lx of [-0.3, 0.3]) M.add('box', { x: p.x + sn * fx + cs * lx, z: p.z + cs * fx - sn * lx, y: p.y + 0.75, sx: 0.18, sy: 1.5, sz: 0.18, ry }, '#a87a3a');
      }
      yield;
      for (const p of spots(n(8), 25, 50, 10)) solid(p.x, p.z).add('cone4', { x: p.x, y: p.y, z: p.z, sx: 6, sy: 3.5, sz: 6, ry: r() }, r() < 0.5 ? '#f4e8d0' : '#d84a3a');
      yield;
      break;
    }
    case 'outback': {
      for (const p of spots(n(120), W + 5, 80)) tree(solid(p.x, p.z), p.x, p.y - 0.3, p.z, 0.8 + r() * 0.6, '#e8e0d0', ['#7a8a4a', '#8a9a5a', '#6a7a3a'], 'gum', r);
      yield;
      for (const p of spots(n(80), W + 4, 70)) solid(p.x, p.z).add('cone', { x: p.x, y: p.y - 0.2, z: p.z, sx: 1.2 + r(), sy: 1.8 + r() * 2, sz: 1.2 + r(), ry: r() * 6 }, '#b8683a');
      yield;
      for (const p of spots(n(120), W + 3, 60)) detail(p.x, p.z).add('ico', { x: p.x, y: p.y, z: p.z, sx: 1.4, sy: 0.6, sz: 1.4 }, '#a8a050');
      yield;
      for (const p of spots(n(14), W + 1.5, W + 3)) {
        const D = detail(p.x, p.z);
        D.add('box', { x: p.x, y: p.y + 1, z: p.z, sx: 0.12, sy: 2, sz: 0.12 }, '#8a8a8a');
        D.add('box', { x: p.x, y: p.y + 2.2, z: p.z, sx: 1.1, sy: 1.1, sz: 0.06, ry: p.ry + Math.PI / 2, rz: Math.PI / 4 }, '#ffcc22');
      }
      yield;
      for (const p of spots(n(4), 30, 60, 10)) {
        const D = solid(p.x, p.z);
        D.add('frustum4', { x: p.x, y: p.y, z: p.z, sx: 2.4, sy: 9, sz: 2.4 }, '#6a6a6a');
        for (let k = 0; k < 8; k++) D.add('box', { x: p.x, y: p.y + 9, z: p.z + 0.6, sx: 0.4, sy: 3, sz: 0.05, rz: (k / 8) * Math.PI * 2 }, '#c8c8c8');
      }
      yield;
      break;
    }
    case 'newyork': {
      const blocks = ['#3a3e4a', '#4a4a54', '#2e3440', '#54505a', '#40363a'];
      const win = ['#ffd88a', '#fff0c0', '#ffc070'];
      for (const p of spots(n(230), 13, far + 1, 10)) {
        const h = 22 + r() * 70, w = 10 + r() * 10, d = 10 + r() * 10;
        building(solid(p.x, p.z), glow(p.x, p.z), { ...p, y: -2 }, w, h, d, blocks[Math.floor(r() * blocks.length)], 'flat', { windows: win, r, rim: r() < 0.4 });
        if (r() < 0.25) {
          const D = detail(p.x, p.z);
          D.add('cyl', { x: p.x, y: -2 + h, z: p.z, sx: 2.2, sy: 2.6, sz: 2.2 }, '#6a4a32');
          D.add('cone', { x: p.x, y: -2 + h + 2.6, z: p.z, sx: 2.4, sy: 1, sz: 2.4 }, '#4a3a2a');
        }
        if (r() < 0.12) glow(p.x, p.z).add('box', { x: p.x, y: -2 + h + 3, z: p.z, sx: 8, sy: 3, sz: 0.3, ry: p.ry + Math.PI / 2 }, ['#ff3a5a', '#3ad0ff', '#ffe46a'][Math.floor(r() * 3)]);
      }
      yield;
      // Pillars under the elevated road.
      for (let i = 0; i < track.samples.length; i += 12) {
        const s = track.samples[i];
        solid(s.x, s.z).add('cyl', { x: s.x, y: -2, z: s.z, sx: 3, sy: s.y - 1.6 + 2, sz: 3 }, '#6a6e78');
      }
      yield;
      // Street lights on the guard rails.
      for (let i = 0; i < track.samples.length; i += 14) {
        for (const side of [-1, 1]) {
          const p = track.pointAt(track.samples[i].dist, side * (W + 0.3));
          detail(p.x, p.z).add('cyl', { x: p.x, y: p.y, z: p.z, sx: 0.18, sy: 5, sz: 0.18 }, '#5a5e68');
          glowd(p.x, p.z).add('sphere', { x: p.x - p.dz * side * -0.6, y: p.y + 5, z: p.z + p.dx * side * -0.6, s: 0.6 }, '#fff0c0');
        }
      }
      yield;
      break;
    }
    case 'alps': {
      for (const p of spots(n(320), W + 4, far + 1)) tree(solid(p.x, p.z), p.x, p.y - 0.3, p.z, 0.8 + r() * 0.7, '#4a3a2a', ['#2a5a3a', '#f4f8ff', '#3a6a44'], 'pine', r);
      yield;
      for (const p of spots(n(22), 22, 50, 10)) {
        building(solid(p.x, p.z), null, p, 8, 4.5, 7, '#9a6a3a', 'gable', { roofColor: '#f0f4fa' });
        glowd(p.x, p.z).add('box', { x: p.x, y: p.y + 2.2, z: p.z, sx: 8.1, sy: 1, sz: 1.6, ry: p.ry }, '#ffd88a');
      }
      yield;
      for (const p of spots(n(50), W + 3, 50)) solid(p.x, p.z).add('ico', { x: p.x, y: p.y, z: p.z, sx: 2 + r() * 3, sy: 1.5 + r() * 2, sz: 2 + r() * 3, ry: r() * 6 }, '#8a94a4');
      yield;
      break;
    }
    case 'iceland': {
      for (const p of spots(n(70), W + 3, far + 1)) {
        const S = solid(p.x, p.z);
        for (let k = 0; k < 5; k++) S.add('cyl6', { x: p.x + (r() - 0.5) * 3, y: p.y - 0.5, z: p.z + (r() - 0.5) * 3, sx: 1 + r() * 0.5, sy: 1.5 + r() * 4, sz: 1 + r() * 0.5 }, r() < 0.5 ? '#2a2e34' : '#3a3e46');
      }
      yield;
      for (const p of spots(n(100), W + 3, far + 1)) detail(p.x, p.z).add('ico', { x: p.x, y: p.y, z: p.z, sx: 2.5, sy: 0.9, sz: 2.5, ry: r() * 6 }, r() < 0.5 ? '#5a7a4a' : '#e8f2f8');
      yield;
      for (const p of spots(n(10), 25, 55, 10)) {
        building(solid(p.x, p.z), null, p, 6, 2.5, 5, '#5a4a3a', 'gable', { roofColor: '#4a8a4a' });
        glowd(p.x, p.z).add('box', { x: p.x, y: p.y + 1.3, z: p.z, sx: 6.1, sy: 0.8, sz: 1, ry: p.ry }, '#ffc870');
      }
      yield;
      for (let i = 0; i < track.samples.length; i += 16) {
        for (const side of [-1, 1]) {
          const p = track.pointAt(track.samples[i].dist, side * (W + 0.8));
          detail(p.x, p.z).add('cyl', { x: p.x, y: p.y, z: p.z, sx: 0.14, sy: 1.6, sz: 0.14 }, '#e8e8e8');
          glowd(p.x, p.z).add('box', { x: p.x, y: p.y + 1.4, z: p.z, sx: 0.2, sy: 0.25, sz: 0.2 }, P.wallTrim);
        }
      }
      yield;
      break;
    }
    default:
  }
}

// Soft pools of light on the road under street lamps and signs, drawn as
// additive fans that fade to black at the rim.
function lightPools(loc, cells, track) {
  const colors = { tokyo: ['#ff3fa4', '#3fe5ff', '#ffe46a', '#b06cff'], newyork: ['#ffc070'], iceland: ['#3affc8'], paris: ['#ffb060'] }[loc.theme];
  if (!colors) return;
  const strength = loc.night ? 0.42 : 0.12;
  const black = C('#000000');
  let k = 0;
  for (let i = 0; i < track.samples.length; i += 7) {
    for (const side of [-1, 1]) {
      if ((i / 7 + (side > 0 ? 1 : 0)) % 2) continue;
      const s = track.samples[i];
      const p = track.pointAt(s.dist, side * (track.half - 2));
      const col = C(colors[k++ % colors.length]).multiplyScalar(strength);
      const M = cells.at(p.x, p.z, 'pool');
      const rx = loc.theme === 'tokyo' ? 3.2 : 5, rz = loc.theme === 'tokyo' ? 9 : 5;
      const y = s.y + 0.08;
      for (let a = 0; a < 12; a++) {
        const a0 = (a / 12) * Math.PI * 2, a1 = ((a + 1) / 12) * Math.PI * 2;
        const pt = (ang) => {
          const lx = Math.cos(ang) * rx, lz = Math.sin(ang) * rz;
          return [p.x - s.dz * lx + s.dx * lz, y, p.z + s.dx * lx + s.dz * lz];
        };
        M.tri([p.x, y, p.z], pt(a1), pt(a0), col, black, black);
      }
    }
  }
}

// Things that span the road: torii gates, bunting, sign gantries, bridge towers.
function overRoad(loc, { cells, track, r }) {
  const W = track.wallOffset;
  const spans = [];
  const total = track.closed ? track.length : track.finishDist;
  const count = { kyoto: 7, rio: 6, tokyo: 5, newyork: 2, paris: 3, alps: 3 }[loc.theme] || 0;
  for (let k = 0; k < count; k++) {
    const d = ((k + 0.5) / count) * (total - 80) + 40;
    if (track.ramps.some((rp) => Math.abs(track.delta(rp.dist, d)) < 30)) continue;
    if (track.shortcuts.some((sc) => d > sc.a - 15 && d < sc.b + 15)) continue;
    spans.push(d);
  }
  for (const d of spans) {
    const c = track.pointAt(d);
    const S = cells.at(c.x, c.z, 'solid'), G = cells.at(c.x, c.z, 'glow');
    const ry = c.heading;
    const post = (side, h, sx, color) => {
      const p = track.pointAt(d, side * (W + 0.9));
      S.add('cyl', { x: p.x, y: p.y - 0.3, z: p.z, sx, sy: h, sz: sx }, color);
      return p;
    };
    const beam = (y, sy, color, over = 3, layer = S) => layer.add('box', { x: c.x, y: c.y + y, z: c.z, sx: (W + 0.9) * 2 + over, sy, sz: 0.7, ry: ry + Math.PI / 2 * 0 }, color);
    // Beams lie across the road: local x across, so rotate by heading.
    switch (loc.theme) {
      case 'kyoto':
        post(-1, 8, 0.9, '#d8321e'); post(1, 8, 0.9, '#d8321e');
        S.add('box', { x: c.x, y: c.y + 8.2, z: c.z, sx: W * 2 + 6, sy: 0.7, sz: 0.9, ry }, '#1a1a1a');
        S.add('box', { x: c.x, y: c.y + 7.3, z: c.z, sx: W * 2 + 2.5, sy: 0.5, sz: 0.6, ry }, '#d8321e');
        break;
      case 'rio': {
        post(-1, 7, 0.3, '#ffffff'); post(1, 7, 0.3, '#ffffff');
        const colors = ['#ff3a5a', '#ffd23d', '#18b86b', '#3fa0ff', '#ff8a1a'];
        const N = 14;
        for (let i = 0; i <= N; i++) {
          const lat = -W - 0.9 + ((W + 0.9) * 2 * i) / N;
          const p = track.pointAt(d, lat);
          const sag = 6.6 - Math.sin((i / N) * Math.PI) * 1.2;
          S.add('cone', { x: p.x, y: p.y + sag - 0.9, z: p.z, sx: 0.8, sy: 0.9, sz: 0.1, ry, rx: Math.PI }, colors[i % colors.length]);
        }
        break;
      }
      case 'tokyo':
        post(-1, 7, 0.5, '#3a3a44'); post(1, 7, 0.5, '#3a3a44');
        S.add('box', { x: c.x, y: c.y + 7, z: c.z, sx: W * 2 + 2, sy: 0.5, sz: 0.5, ry }, '#3a3a44');
        G.add('box', { x: c.x, y: c.y + 8.4, z: c.z, sx: W * 1.2, sy: 2.4, sz: 0.3, ry }, ['#ff3fa4', '#3fe5ff', '#ffe46a'][Math.floor(r() * 3)]);
        break;
      case 'newyork':
        // Suspension-bridge towers with arches.
        for (const side of [-1, 1]) {
          const p = track.pointAt(d, side * (W + 2.5));
          S.add('boxb', { x: p.x, y: -2, z: p.z, sx: 4, sy: c.y + 28, sz: 5, ry }, '#8a7a6a');
        }
        S.add('box', { x: c.x, y: c.y + 18, z: c.z, sx: W * 2 + 9, sy: 3, sz: 4, ry }, '#8a7a6a');
        S.add('box', { x: c.x, y: c.y + 25, z: c.z, sx: W * 2 + 9, sy: 2, sz: 4.4, ry }, '#7a6a5a');
        break;
      case 'paris':
      case 'alps':
        post(-1, 6, 0.35, '#e8e8e8'); post(1, 6, 0.35, '#e8e8e8');
        S.add('box', { x: c.x, y: c.y + 6, z: c.z, sx: W * 2 + 2, sy: 1.4, sz: 0.25, ry }, loc.theme === 'paris' ? '#2a4a9a' : '#e23a3a');
        break;
      default:
    }
    void beam;
  }
}

// Start gantry with a painted banner.
function gantry(track, loc, group) {
  const d = track.startDist + 2;
  const c = track.pointAt(d);
  const W = track.wallOffset + 1;
  const M = new Merger();
  for (const side of [-1, 1]) {
    const p = track.pointAt(d, side * W);
    M.add('boxb', { x: p.x, y: p.y - 0.3, z: p.z, sx: 0.8, sy: 7.6, sz: 0.8, ry: c.heading }, '#2a2a34');
  }
  M.add('box', { x: c.x, y: c.y + 7.2, z: c.z, sx: W * 2 + 0.8, sy: 0.6, sz: 0.9, ry: c.heading }, '#2a2a34');
  const mesh = new THREE.Mesh(M.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.matrixAutoUpdate = false;
  group.add(mesh);
  // Banner: canvas texture.
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 128;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#ff3a5a'); grad.addColorStop(0.5, '#ffb020'); grad.addColorStop(1, '#3a8aff');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 128);
  for (let k = 0; k < 32; k++) { g.fillStyle = k % 2 ? '#111' : '#fff'; g.fillRect(k * 32, 0, 32, 14); g.fillRect(k * 32 + 16, 114, 32, 14); }
  g.fillStyle = '#ffffff';
  g.font = '900 64px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`GLOBE GP  ★  ${loc.city.toUpperCase()}`, 512, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - 1, (W * 2 - 1) / 8), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  banner.position.set(c.x, c.y + 6.0, c.z);
  banner.rotation.y = c.heading + Math.PI;
  group.add(banner);
}

// The big landmark for each stop, placed where the start straight looks.
function landmark(loc, { cells, track, shape, field, ground, r }) {
  const start = track.pointAt(track.startDist + 10);
  let best = null;
  for (let k = 0; k < 24; k++) {
    const a = start.heading + (k % 2 ? 1 : -1) * Math.floor(k / 2) * 0.12 + 0.25;
    const dist = shape.radius * 0.9 + 160;
    const x = start.x + Math.sin(a) * dist, z = start.z + Math.cos(a) * dist;
    if (field.at(x, z).d >= field.reach - 1) { best = { x, z }; break; }
  }
  if (!best) best = { x: shape.center.x + shape.radius + 220, z: shape.center.z };
  const { x, z } = best;
  const y = ground(x, z) - 1;
  const S = cells.at(x, z, 'solid'), G = cells.at(x, z, 'glow');
  switch (loc.theme) {
    case 'paris': {
      const col = '#6a5644';
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.add('box', { x: x + sx * 9, y: y + 12, z: z + sz * 9, sx: 3, sy: 28, sz: 3, rx: sz * 0.32, rz: -sx * 0.32 }, col);
      S.add('box', { x, y: y + 22, z, sx: 20, sy: 2, sz: 20 }, col);
      S.add('frustum4', { x, y: y + 23, z, sx: 9, sy: 30, sz: 9 }, col);
      S.add('box', { x, y: y + 52, z, sx: 6, sy: 1.6, sz: 6 }, col);
      S.add('frustum4', { x, y: y + 53, z, sx: 4, sy: 26, sz: 4 }, col);
      S.add('cyl', { x, y: y + 79, z, sx: 0.6, sy: 8, sz: 0.6 }, col);
      G.add('sphere', { x, y: y + 87, z, s: 1.6 }, '#ffe8b0');
      break;
    }
    case 'rio':
      S.add('dome', { x, y: y - 4, z, sx: 70, sy: 150, sz: 60 }, '#5a7a4a');
      S.add('dome', { x: x + 70, y: y - 4, z: z + 30, sx: 50, sy: 80, sz: 45 }, '#4a6a3a');
      S.add('box', { x, y: y + 75, z, sx: 2.2, sy: 12, sz: 2 }, '#f4f4f4');
      S.add('box', { x, y: y + 78, z, sx: 12, sy: 1.8, sz: 1.6 }, '#f4f4f4');
      S.add('sphere', { x, y: y + 82, z, s: 2 }, '#f4f4f4');
      break;
    case 'kyoto':
      for (let k = 0; k < 5; k++) {
        const s = 1 - k * 0.14;
        S.add('boxb', { x, y: y + k * 7, z, sx: 10 * s, sy: 5, sz: 10 * s }, '#c8402a');
        S.add('frustum4', { x, y: y + k * 7 + 5, z, sx: 17 * s, sy: 2, sz: 17 * s }, '#2a2a30');
      }
      S.add('cyl', { x, y: y + 35, z, sx: 0.6, sy: 9, sz: 0.6 }, '#c8a040');
      break;
    case 'tokyo':
      for (let k = 0; k < 8; k++) {
        const s = 1 - k * 0.11;
        S.add('frustum4', { x, y: y + k * 10, z, sx: 22 * s, sy: 10, sz: 22 * s }, k % 2 ? '#f4f4f4' : '#e8401a');
        G.add('box', { x, y: y + k * 10 + 9.5, z, sx: 20 * s, sy: 0.4, sz: 20 * s }, '#ffb080');
      }
      S.add('box', { x, y: y + 42, z, sx: 10, sy: 5, sz: 10 }, '#e8401a');
      G.add('box', { x, y: y + 42, z, sx: 10.4, sy: 1.2, sz: 10.4 }, '#ffe8c0');
      S.add('cyl', { x, y: y + 80, z, sx: 1, sy: 18, sz: 1 }, '#f4f4f4');
      G.add('sphere', { x, y: y + 98, z, s: 1.5 }, '#ff3a3a');
      break;
    case 'sahara':
      S.add('cone4', { x, y, z, sx: 110, sy: 70, sz: 110, ry: 0.3 }, '#e0b070');
      S.add('cone4', { x: x + 120, y: y - 2, z: z + 60, sx: 90, sy: 58, sz: 90, ry: 0.3 }, '#d8a868');
      S.add('cone4', { x: x - 90, y: y - 2, z: z + 90, sx: 50, sy: 32, sz: 50, ry: 0.3 }, '#d0a060');
      break;
    case 'outback':
      S.add('ico1', { x, y: y + 4, z, sx: 220, sy: 60, sz: 110, ry: 0.4 }, '#c85a2a');
      break;
    case 'newyork':
      S.add('boxb', { x, y: -2, z, sx: 26, sy: 120, sz: 26 }, '#7a7a84');
      S.add('boxb', { x, y: 118, z, sx: 16, sy: 30, sz: 16 }, '#8a8a94');
      S.add('boxb', { x, y: 148, z, sx: 9, sy: 18, sz: 9 }, '#9a9aa4');
      S.add('cyl', { x, y: 166, z, sx: 1.4, sy: 22, sz: 1.4 }, '#c8c8d0');
      G.add('box', { x, y: 140, z, sx: 16.4, sy: 1.6, sz: 16.4 }, '#ffe8a0');
      G.add('sphere', { x, y: 188, z, s: 1.6 }, '#ff3a3a');
      break;
    case 'alps':
      S.add('cone', { x, y: y - 10, z, sx: 220, sy: 230, sz: 180, ry: 0.5 }, '#6a7488');
      S.add('cone', { x: x + 6, y: y + 120, z: z - 4, sx: 90, sy: 108, sz: 70, ry: 0.5, rz: 0.08 }, '#f4f8ff');
      break;
    case 'iceland':
      S.add('frustum', { x, y: y - 6, z, sx: 200, sy: 90, sz: 200 }, '#24282e');
      G.add('cyl12', { x, y: y + 83.5, z, sx: 112, sy: 1.5, sz: 112 }, '#ff6a1a');
      break;
    default:
  }
  void r;
}
