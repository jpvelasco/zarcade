import * as THREE from 'three';
import { Merger } from './geom.js';

// Low-poly car bodies, built from boxes into one vertex-coloured geometry
// per car (plus one for lights). Local space: +z forward, y up, ground y=0.
// Wheels are drawn separately (one InstancedMesh for every car).

const DARK = '#22232a', TRIM = '#3a3c46', GLASS = '#1d3350', CHROME = '#c8ccd4', TYRE = '#18181c';
const HEAD = '#fff6d8', TAIL = '#ff2a3a';

// Wheel layout per car: [x, z] for front-left, front-right, rear-left,
// rear-right; r radius; w width.
export const WHEELS = {
  kart: { r: 0.32, w: 0.34, front: 0.95, rear: -0.85, track: 0.86, rearR: 0.38 },
  hatch: { r: 0.36, w: 0.3, front: 1.25, rear: -1.2, track: 0.90 },
  bug: { r: 0.37, w: 0.28, front: 1.2, rear: -1.15, track: 0.88 },
  pickup: { r: 0.48, w: 0.36, front: 1.5, rear: -1.45, track: 1.00 },
  rally: { r: 0.4, w: 0.32, front: 1.3, rear: -1.25, track: 0.93 },
  muscle: { r: 0.42, w: 0.36, front: 1.5, rear: -1.4, track: 0.98, rearR: 0.46 },
  sports: { r: 0.38, w: 0.34, front: 1.4, rear: -1.35, track: 0.96 },
  ev: { r: 0.38, w: 0.3, front: 1.4, rear: -1.35, track: 0.94 },
};

function lights(L, front, rear, y, half, { head = HEAD, tail = TAIL, bar = false } = {}) {
  if (bar) {
    L.add('box', { x: 0, y, z: front, sx: half * 1.8, sy: 0.08, sz: 0.06 }, head);
    L.add('box', { x: 0, y, z: rear, sx: half * 1.8, sy: 0.1, sz: 0.06 }, tail);
    return;
  }
  for (const s of [-1, 1]) {
    L.add('box', { x: s * half * 0.68, y, z: front, sx: 0.36, sy: 0.16, sz: 0.06 }, head);
    L.add('box', { x: s * half * 0.72, y, z: rear, sx: 0.32, sy: 0.14, sz: 0.06 }, tail);
  }
}

function windows(B, { y, z, len, w, h, rake = 0 }) {
  B.add('box', { x: 0, y: y + h * 0.02, z, sx: w + 0.03, sy: h * 0.62, sz: len + 0.03, rx: rake }, GLASS);
}

// Builds one car. Returns { body, lights } geometries.
export function buildCar(type, paint, accent = '#ffffff') {
  const B = new Merger(), L = new Merger();
  switch (type) {
    case 'kart': {
      B.add('box', { y: 0.28, sx: 1.25, sy: 0.14, sz: 2.4 }, DARK);
      B.add('box', { y: 0.42, z: 0.95, sx: 1.1, sy: 0.22, sz: 0.5 }, paint);              // nose
      for (const s of [-1, 1]) B.add('box', { x: s * 0.58, y: 0.42, z: 0.05, sx: 0.24, sy: 0.28, sz: 1.4 }, paint); // side pods
      B.add('box', { y: 0.55, z: -0.25, sx: 0.6, sy: 0.5, sz: 0.5 }, TRIM);               // seat
      B.add('box', { y: 0.95, z: -0.15, sx: 0.5, sy: 0.55, sz: 0.4 }, accent);            // driver
      B.add('sphere', { y: 1.38, z: -0.1, s: 0.46 }, paint);                              // helmet
      B.add('box', { y: 1.38, z: 0.1, sx: 0.36, sy: 0.14, sz: 0.1 }, GLASS);              // visor
      B.add('box', { y: 0.55, z: -0.95, sx: 0.8, sy: 0.4, sz: 0.5 }, TRIM);               // engine
      B.add('box', { y: 0.9, z: -1.2, sx: 1.3, sy: 0.06, sz: 0.35 }, accent);             // spoiler
      for (const s of [-1, 1]) B.add('box', { x: s * 0.55, y: 0.72, z: -1.15, sx: 0.06, sy: 0.35, sz: 0.1 }, DARK);
      B.add('cyl', { y: 0.55, z: -1.25, sx: 0.12, sy: 0.25, sz: 0.12, rx: -1.2 }, CHROME); // exhaust
      L.add('box', { y: 0.45, z: 1.21, sx: 0.5, sy: 0.08, sz: 0.04 }, HEAD);
      L.add('box', { y: 0.6, z: -1.21, sx: 0.5, sy: 0.08, sz: 0.04 }, TAIL);
      break;
    }
    case 'hatch': {
      B.add('box', { y: 0.62, sx: 1.72, sy: 0.6, sz: 3.6 }, paint);
      B.add('box', { y: 1.15, z: -0.35, sx: 1.56, sy: 0.55, sz: 2.2 }, paint);
      windows(B, { y: 1.15, z: -0.3, len: 2.15, w: 1.58, h: 0.5 });
      B.add('box', { y: 1.43, z: -0.35, sx: 0.45, sy: 0.04, sz: 2.0 }, accent);           // roof stripe
      B.add('box', { y: 0.42, z: 1.82, sx: 1.76, sy: 0.24, sz: 0.12 }, TRIM);
      B.add('box', { y: 0.42, z: -1.82, sx: 1.76, sy: 0.24, sz: 0.12 }, TRIM);
      for (const s of [-1, 1]) B.add('box', { x: s * 0.87, y: 0.6, z: 0, sx: 0.02, sy: 0.08, sz: 3.2 }, accent);
      lights(L, 1.81, -1.81, 0.72, 0.86);
      break;
    }
    case 'bug': {
      B.add('sphere', { y: 0.82, sx: 1.7, sy: 1.15, sz: 3.6 }, paint);
      B.add('box', { y: 0.45, sx: 1.6, sy: 0.3, sz: 3.3 }, paint);
      for (const s of [-1, 1]) for (const z of [1.2, -1.15]) B.add('sphere', { x: s * 0.78, y: 0.58, z, sx: 0.5, sy: 0.55, sz: 1.05 }, paint);
      B.add('sphere', { y: 1.2, z: -0.25, sx: 1.4, sy: 0.85, sz: 1.9 }, GLASS);
      B.add('sphere', { y: 1.38, z: -0.35, sx: 1.2, sy: 0.6, sz: 1.5 }, paint);           // roof
      B.add('box', { y: 0.36, z: 1.75, sx: 1.6, sy: 0.12, sz: 0.1 }, CHROME);
      B.add('box', { y: 0.36, z: -1.75, sx: 1.6, sy: 0.12, sz: 0.1 }, CHROME);
      B.add('sphere', { y: 1.0, z: 1.15, sx: 0.5, sy: 0.08, sz: 0.5 }, accent);           // hood badge
      for (const s of [-1, 1]) L.add('sphere', { x: s * 0.78, y: 0.8, z: 1.66, s: 0.26 }, HEAD);
      for (const s of [-1, 1]) L.add('box', { x: s * 0.72, y: 0.7, z: -1.7, sx: 0.18, sy: 0.24, sz: 0.06 }, TAIL);
      break;
    }
    case 'pickup': {
      B.add('box', { y: 0.95, sx: 1.9, sy: 0.75, sz: 4.4 }, paint);
      B.add('box', { y: 1.6, z: 0.35, sx: 1.8, sy: 0.65, sz: 1.6 }, paint);               // cab
      windows(B, { y: 1.6, z: 0.38, len: 1.55, w: 1.82, h: 0.6 });
      B.add('box', { y: 1.33, z: -1.25, sx: 1.7, sy: 0.05, sz: 1.9 }, DARK);              // bed floor
      B.add('box', { y: 1.95, z: 0.4, sx: 1.3, sy: 0.14, sz: 0.25 }, DARK);               // light bar
      B.add('box', { y: 0.7, z: 2.28, sx: 1.7, sy: 0.5, sz: 0.2 }, CHROME);               // bull bar
      B.add('box', { y: 0.55, z: -2.22, sx: 1.9, sy: 0.25, sz: 0.12 }, TRIM);
      for (const s of [-1, 1]) B.add('box', { x: s * 0.96, y: 0.9, z: 0, sx: 0.04, sy: 0.18, sz: 4.0 }, accent);
      for (let i = -1; i <= 1; i++) L.add('box', { x: i * 0.38, y: 2.03, z: 0.52, sx: 0.22, sy: 0.12, sz: 0.04 }, HEAD);
      lights(L, 2.21, -2.21, 1.05, 0.95);
      break;
    }
    case 'rally': {
      B.add('box', { y: 0.68, sx: 1.8, sy: 0.62, sz: 3.9 }, paint);
      B.add('box', { y: 1.2, z: -0.3, sx: 1.6, sy: 0.52, sz: 2.2 }, paint);
      windows(B, { y: 1.2, z: -0.25, len: 2.1, w: 1.62, h: 0.48 });
      B.add('box', { y: 1.5, z: 0.2, sx: 0.45, sy: 0.15, sz: 0.6 }, DARK);               // roof scoop
      B.add('box', { y: 1.42, z: -1.85, sx: 1.8, sy: 0.07, sz: 0.4 }, accent);            // wing
      for (const s of [-1, 1]) B.add('box', { x: s * 0.7, y: 1.25, z: -1.8, sx: 0.07, sy: 0.3, sz: 0.2 }, DARK);
      B.add('box', { y: 0.7, z: 0, sx: 1.84, sy: 0.18, sz: 3.0 }, accent);                // side stripe band
      for (const s of [-1, 1]) B.add('box', { x: s * 0.8, y: 0.35, z: -1.6, sx: 0.3, sy: 0.4, sz: 0.04 }, DARK); // mudflaps
      B.add('box', { y: 0.95, z: 1.96, sx: 1.3, sy: 0.3, sz: 0.1 }, DARK);                // light pod
      for (let i = 0; i < 4; i++) L.add('box', { x: -0.48 + i * 0.32, y: 0.95, z: 2.02, sx: 0.22, sy: 0.2, sz: 0.04 }, HEAD);
      lights(L, 1.96, -1.96, 0.72, 0.9);
      break;
    }
    case 'muscle': {
      B.add('box', { y: 0.66, sx: 1.95, sy: 0.6, sz: 4.6 }, paint);
      B.add('box', { y: 1.13, z: -0.55, sx: 1.6, sy: 0.45, sz: 1.8 }, paint);
      windows(B, { y: 1.13, z: -0.5, len: 1.75, w: 1.62, h: 0.42 });
      B.add('box', { y: 1.0, z: 1.2, sx: 0.6, sy: 0.18, sz: 0.9 }, DARK);                 // hood scoop
      for (const s of [-1, 1]) B.add('box', { x: s * 0.22, y: 0.97, z: 0.2, sx: 0.22, sy: 0.02, sz: 4.4 }, accent); // stripes
      for (const s of [-1, 1]) B.add('box', { x: s * 0.22, y: 1.36, z: -0.55, sx: 0.22, sy: 0.02, sz: 1.7 }, accent);
      B.add('box', { y: 0.45, z: 2.32, sx: 1.98, sy: 0.3, sz: 0.1 }, CHROME);
      B.add('box', { y: 0.45, z: -2.32, sx: 1.98, sy: 0.3, sz: 0.1 }, CHROME);
      B.add('box', { y: 1.03, z: -2.15, sx: 1.8, sy: 0.08, sz: 0.3 }, paint);             // ducktail
      for (const s of [-1, 1]) B.add('cyl', { x: s * 0.6, y: 0.3, z: -2.35, sx: 0.14, sy: 0.3, sz: 0.14, rx: Math.PI / 2 }, CHROME);
      lights(L, 2.31, -2.31, 0.72, 0.95);
      break;
    }
    case 'sports': {
      B.add('box', { y: 0.55, sx: 1.9, sy: 0.45, sz: 4.3 }, paint);
      B.add('wedge', { y: 0.77, z: 1.2, sx: 1.86, sy: 0.18, sz: 1.8, ry: Math.PI }, paint); // sloped nose
      B.add('box', { y: 0.98, z: -0.35, sx: 1.5, sy: 0.4, sz: 1.8, rx: 0.02 }, paint);
      windows(B, { y: 0.98, z: -0.25, len: 1.8, w: 1.52, h: 0.38 });
      B.add('box', { y: 1.22, z: -1.95, sx: 1.9, sy: 0.06, sz: 0.45 }, accent);           // wing
      for (const s of [-1, 1]) B.add('box', { x: s * 0.6, y: 0.98, z: -1.95, sx: 0.06, sy: 0.4, sz: 0.2 }, DARK);
      for (const s of [-1, 1]) B.add('box', { x: s * 0.96, y: 0.6, z: -0.6, sx: 0.04, sy: 0.25, sz: 0.8 }, DARK); // intakes
      B.add('box', { y: 0.36, z: 2.12, sx: 1.9, sy: 0.16, sz: 0.1 }, DARK);
      B.add('box', { y: 0.78, z: 0.2, sx: 0.3, sy: 0.02, sz: 4.0 }, accent);
      lights(L, 2.16, -2.16, 0.62, 0.95, {});
      break;
    }
    case 'ev': {
      B.add('box', { y: 0.55, sx: 1.9, sy: 0.42, sz: 4.3 }, paint);
      B.add('wedge', { y: 0.76, z: 1.0, sx: 1.86, sy: 0.3, sz: 2.2, ry: Math.PI }, paint);
      B.add('sphere', { y: 1.0, z: -0.45, sx: 1.6, sy: 0.75, sz: 2.8 }, GLASS);           // canopy
      B.add('box', { y: 0.82, z: -1.6, sx: 1.8, sy: 0.24, sz: 1.0 }, paint);
      for (const s of [-1, 1]) B.add('box', { x: s * 0.96, y: 0.42, z: 0, sx: 0.04, sy: 0.1, sz: 3.6 }, DARK);
      for (const s of [-1, 1]) L.add('box', { x: s * 0.97, y: 0.42, z: 0, sx: 0.02, sy: 0.05, sz: 3.4 }, accent); // glow strips
      lights(L, 2.16, -2.16, 0.68, 0.95, { bar: true, head: '#bff8ff' });
      break;
    }
    default:
      return buildCar('hatch', paint, accent);
  }
  return { body: B.build(), lights: L.build() };
}

// Wheel geometry: tyre plus hub, axis along x.
let wheelGeo = null;
export function wheelGeometry() {
  if (wheelGeo) return wheelGeo;
  const W = new Merger();
  // Unit tyre: diameter 1, width 1, centered, axis along x.
  W.add('cyl12', { x: -0.5, rz: -Math.PI / 2 }, TYRE);
  W.add('cyl6', { x: 0.5, rz: -Math.PI / 2, sx: 0.55, sy: 0.06, sz: 0.55 }, '#d8dce4');
  W.add('cyl6', { x: -0.56, rz: -Math.PI / 2, sx: 0.55, sy: 0.06, sz: 0.55 }, '#d8dce4');
  wheelGeo = W.build();
  return wheelGeo;
}

export function wheelLayout(type) {
  const w = WHEELS[type] || WHEELS.hatch;
  return [
    { x: w.track, z: w.front, r: w.r, w: w.w, front: true },
    { x: -w.track, z: w.front, r: w.r, w: w.w, front: true },
    { x: w.track, z: w.rear, r: w.rearR || w.r, w: w.w * 1.1, front: false },
    { x: -w.track, z: w.rear, r: w.rearR || w.r, w: w.w * 1.1, front: false },
  ];
}

// A car as a Three.js object: group with body + lights meshes.
export function makeCarObject(type, paint, accent, { ghost = false } = {}) {
  const { body, lights: lightGeo } = buildCar(type, paint, accent);
  const group = new THREE.Group();
  const bodyMat = ghost
    ? new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.35, depthWrite: false })
    : new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: '#555a66', flatShading: true });
  const bodyMesh = new THREE.Mesh(body, bodyMat);
  bodyMesh.castShadow = !ghost;
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: ghost, opacity: ghost ? 0.4 : 1 });
  const lightMesh = new THREE.Mesh(lightGeo, lightMat);
  const tilt = new THREE.Group(); // pitch/roll/drift yaw live here
  tilt.add(bodyMesh, lightMesh);
  group.add(tilt);
  group.userData = { type, tilt, bodyMesh, lightMesh, lightMat, wheels: wheelLayout(type) };
  return group;
}

export function setCarPaint(obj, paint, accent) {
  const { body } = buildCar(obj.userData.type, paint, accent);
  obj.userData.bodyMesh.geometry.dispose();
  obj.userData.bodyMesh.geometry = body;
}
