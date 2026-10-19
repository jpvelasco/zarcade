import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Ships, hazards and pickups built from primitives. Models face +z.

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, flatShading: true, ...extra });
const glow = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

function part(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
const alongZ = (g) => g.rotateX(Math.PI / 2);

// ------------------------------------------------------------ player jet

export function makeJet(paint) {
  const g = new THREE.Group();
  const hull = std('#d7dde6');
  const paintMat = std(paint, { roughness: 0.4 });
  const dark = std('#2a2f3a');
  g.add(part(alongZ(new THREE.CylinderGeometry(0.55, 0.85, 7, 8)), hull));
  g.add(part(alongZ(new THREE.ConeGeometry(0.55, 2.6, 8)).translate(0, 0, 4.8), hull));
  const canopy = part(new THREE.SphereGeometry(0.62, 12, 8), new THREE.MeshStandardMaterial({ color: '#5fb8ff', metalness: 0.6, roughness: 0.1, emissive: '#0a3a6a' }), 0, 0.5, 1.2);
  canopy.scale.set(1, 0.7, 2.2);
  g.add(canopy);
  g.add(part(new THREE.BoxGeometry(0.2, 0.1, 5.5), paintMat, 0, 0.62, -0.8));
  // X-shaped wings with a cannon at every tip.
  const tips = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const wing = new THREE.Group();
      wing.add(part(new THREE.BoxGeometry(4.6, 0.12, 2), hull, sx * 2.6, 0, -1.2));
      wing.add(part(new THREE.BoxGeometry(2.2, 0.14, 0.5), paintMat, sx * 2.4, 0, -0.7));
      wing.add(part(alongZ(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 6)), dark, sx * 4.9, 0, -0.3));
      const tip = part(new THREE.SphereGeometry(0.18, 8, 6), glow('#ff6a4a'), sx * 4.9, 0, 1.45);
      wing.add(tip);
      tips.push(tip);
      wing.rotation.z = sx * sy * 0.22;
      g.add(wing);
    }
  }
  // Engines.
  const engineGlows = [];
  for (const [x, y] of [[-0.9, 0.5], [0.9, 0.5], [-0.9, -0.5], [0.9, -0.5]]) {
    g.add(part(alongZ(new THREE.CylinderGeometry(0.34, 0.4, 1.8, 10)), dark, x, y, -3.4));
    const e = part(alongZ(new THREE.CircleGeometry(0.3, 12)).rotateX(Math.PI), additive('#7fc8ff'), x, y, -4.35);
    const flame = part(alongZ(new THREE.ConeGeometry(0.3, 2.4, 10)).rotateX(Math.PI).translate(0, 0, -1.2), additive('#6fb8ff', 0.7), x, y, -4.3);
    g.add(e, flame);
    engineGlows.push(flame);
  }
  g.userData = { tips, engineGlows, paint: paintMat };
  return g;
}

// Cockpit interior, parented to the camera (which looks down -z). Sized so
// the dashboard fills only the bottom strip and the frame hugs the edges.
export function makeCockpit(accent) {
  const g = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: '#161a26' });
  const trim = new THREE.MeshLambertMaterial({ color: '#232a3a' });
  // Dashboard: a low console with glowing screens.
  g.add(part(new THREE.BoxGeometry(3.6, 0.5, 0.9), frame, 0, -0.98, -1.2));
  g.add(part(new THREE.BoxGeometry(3.6, 0.05, 0.7).rotateX(-0.35), trim, 0, -0.72, -1.05));
  const screens = [];
  for (const [x, w] of [[-0.95, 0.5], [0, 0.38], [0.95, 0.5]]) {
    const sc = part(new THREE.PlaneGeometry(w, 0.16), glow(accent, { transparent: true, opacity: 0.55 }), x, -0.69, -0.98);
    sc.rotation.x = -0.35;
    g.add(sc);
    screens.push(sc);
  }
  const lights = [];
  for (let i = 0; i < 6; i++) {
    const l = part(new THREE.SphereGeometry(0.014, 6, 4), glow(i % 2 ? '#ff5a4a' : '#6dff9e'), -0.35 + i * 0.14, -0.7, -0.84);
    g.add(l);
    lights.push(l);
  }
  // A little burger bobblehead, because every pilot needs a mascot.
  const bob = new THREE.Group();
  bob.add(part(new THREE.CylinderGeometry(0.01, 0.01, 0.05, 6), trim, 0, 0.025, 0));
  const burger = new THREE.Group();
  burger.add(part(new THREE.SphereGeometry(0.04, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std('#e0a050', { metalness: 0 }), 0, 0.011, 0));
  burger.add(part(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 12), std('#5a3020', { metalness: 0 }), 0, 0.004, 0));
  burger.add(part(new THREE.CylinderGeometry(0.045, 0.045, 0.005, 12), std('#6ac04a', { metalness: 0 }), 0, -0.005, 0));
  burger.add(part(new THREE.CylinderGeometry(0.04, 0.036, 0.014, 12), std('#e0a050', { metalness: 0 }), 0, -0.014, 0));
  burger.position.y = 0.065;
  bob.add(burger);
  bob.position.set(0.62, -0.7, -0.88);
  g.add(bob);
  // Thin canopy pillars near the screen edges; the top bar sits just out of view.
  for (const sx of [-1, 1]) {
    const pillar = part(new THREE.BoxGeometry(0.025, 1.8, 0.025), frame, sx * 1.4, 0.1, -1.25);
    pillar.rotation.z = sx * 0.18;
    g.add(pillar);
  }
  g.add(part(new THREE.BoxGeometry(2.6, 0.035, 0.035), frame, 0, 0.98, -1.3));
  // Muzzle flashes from the wing cannons, just off the bottom corners.
  const muzzles = [];
  for (const sx of [-1, 1]) {
    const m = part(new THREE.SphereGeometry(0.14, 8, 6), additive('#ff9a6a', 0), sx * 2.5, -1.5, -4.8);
    g.add(m);
    muzzles.push(m);
  }
  g.userData = { screens, lights, bob: burger, muzzles };
  return g;
}

// ------------------------------------------------------------ enemies

export function makeFighter(accent = '#ff3a4a') {
  const g = new THREE.Group();
  const body = std('#2d2a38', { metalness: 0.6 });
  const edge = glow(accent);
  const core = part(new THREE.OctahedronGeometry(1.4), body);
  core.scale.set(1, 0.7, 1.8);
  g.add(core);
  for (const sx of [-1, 1]) {
    const fin = part(new THREE.BoxGeometry(0.18, 3.6, 2.8), body, sx * 1.9, 0, -0.3);
    g.add(fin);
    g.add(part(new THREE.BoxGeometry(0.22, 3.7, 0.16), edge, sx * 1.9, 0, 1.1));
    g.add(part(new THREE.BoxGeometry(1.8, 0.2, 0.3), body, sx * 1, 0, 0));
  }
  g.add(part(new THREE.SphereGeometry(0.45, 10, 8), edge, 0, 0.2, 1.8));
  return g;
}

export function makeGhost() {
  const g = makeFighter('#7affd8');
  const mat = new THREE.MeshBasicMaterial({ color: '#7affd8', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: false });
  g.traverse((o) => { if (o.isMesh) o.material = mat; });
  g.userData.ghostMat = mat;
  return g;
}

export function makeDrone() {
  const g = new THREE.Group();
  g.add(part(new THREE.IcosahedronGeometry(1.1, 1), std('#3a3440', { metalness: 0.7 })));
  const spikeMat = std('#6a6070');
  for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1]]) {
    const spike = part(new THREE.ConeGeometry(0.28, 1.2, 6), spikeMat, x * 1.2, y * 1.2, z * 1.2);
    spike.lookAt(x * 5, y * 5, z * 5);
    spike.rotateX(Math.PI / 2);
    g.add(spike);
  }
  const eye = part(new THREE.SphereGeometry(0.5, 12, 8), glow('#ff3a3a'), 0, 0, 0.8);
  g.add(eye);
  g.userData = { eye };
  return g;
}

export function makeTurret() {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(1.4, 1.7, 1.2, 10), std('#3a3848')));
  const head = new THREE.Group();
  head.add(part(new THREE.SphereGeometry(1.1, 10, 8), std('#4a4658')));
  head.add(part(alongZ(new THREE.CylinderGeometry(0.22, 0.22, 3, 8)).translate(0, 0, 1.6), std('#222')));
  head.add(part(new THREE.SphereGeometry(0.3, 8, 6), glow('#ff4a3a'), 0, 0.5, 0.8));
  head.position.y = 0.9;
  g.add(head);
  g.userData = { head };
  return g;
}

export function makeCruiser(accent) {
  const g = new THREE.Group();
  const hull = std('#3d3a4a', { metalness: 0.55 });
  const stripe = glow(accent);
  g.add(part(new THREE.BoxGeometry(12, 9, 64), hull));
  g.add(part(alongZ(new THREE.ConeGeometry(6.5, 14, 4)).rotateZ(Math.PI / 4).translate(0, 0, 39), hull));
  g.add(part(new THREE.BoxGeometry(6, 5, 12), hull, 0, 6.5, -20));
  g.add(part(new THREE.BoxGeometry(12.2, 0.4, 60), stripe, 0, 1.5, 0));
  // Lit windows.
  const win = [];
  for (let i = 0; i < 22; i++) win.push(new THREE.BoxGeometry(0.5, 0.5, 0.6).translate((i % 2 ? -1 : 1) * 6.05, -1.5 + (i % 3), -28 + i * 2.6));
  g.add(part(mergeGeometries(win), glow('#ffd98a')));
  for (const x of [-3.5, 0, 3.5]) g.add(part(alongZ(new THREE.CircleGeometry(1.6, 12)).rotateX(Math.PI), additive('#ff7a4a'), x, 0, -32.1));
  return g;
}

export function makeMine() {
  const g = new THREE.Group();
  g.add(part(new THREE.IcosahedronGeometry(1.1, 0), std('#5a5460', { metalness: 0.7 })));
  const spikes = [];
  const dirs = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  for (let i = 0; i < dirs.count; i += 3) {
    const v = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
    spikes.push(new THREE.CylinderGeometry(0.06, 0.06, 1, 4).translate(0, 1.3, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v)));
  }
  g.add(part(mergeGeometries(spikes), std('#8a8290')));
  const light = part(new THREE.SphereGeometry(0.35, 8, 6), glow('#ff2a2a'));
  g.add(light);
  g.userData = { light };
  return g;
}

export function makeAsteroidGeometries(seedCount = 4) {
  const out = [];
  for (let k = 0; k < seedCount; k++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 0.75 + 0.35 * Math.abs(Math.sin(v.x * (3 + k) + v.y * 5.1) * Math.cos(v.z * (4 - k * 0.5) + v.x * 2.3));
      v.multiplyScalar(n);
      pos.setXYZ(i, v.x, v.y * (0.8 + k * 0.08), v.z);
    }
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

export function makeWreck(size) {
  const g = new THREE.Group();
  const mat = std('#4a5552', { metalness: 0.4, roughness: 0.8 });
  const rust = std('#6a4a3a', { roughness: 0.9 });
  g.add(part(new THREE.BoxGeometry(size.u, size.w, size.s * 0.7), mat, 0, 0, -size.s * 0.15));
  const nose = part(new THREE.BoxGeometry(size.u * 0.7, size.w * 0.6, size.s * 0.35), rust, size.u * 0.1, -size.w * 0.1, size.s * 0.33);
  nose.rotation.set(0.2, 0.3, 0.15);
  g.add(nose);
  g.add(part(new THREE.BoxGeometry(size.u * 1.8, 0.3, size.s * 0.2), mat, 0, size.w * 0.2, -size.s * 0.2));
  g.add(part(new THREE.SphereGeometry(0.4, 6, 4), glow('#7affd8'), 0, size.w * 0.5, 0));
  return g;
}

// ------------------------------------------------------------ boss

export function makeBoss(accent, parts) {
  const g = new THREE.Group();
  const hull = std('#5a5470', { metalness: 0.5, roughness: 0.45 });
  const trim = std('#7a7494', { metalness: 0.5 });
  const dark = std('#2a2636');
  const stripe = glow(accent);
  // A wide wedge hull, nose toward the jet (+z here).
  g.add(part(new THREE.BoxGeometry(56, 14, 60), hull));
  const nose = part(new THREE.BoxGeometry(44, 9, 22), trim, 0, 1, 36);
  g.add(nose);
  // Command bridge with a menacing red eye.
  g.add(part(new THREE.BoxGeometry(16, 16, 16), trim, 0, 14, -8));
  g.add(part(new THREE.BoxGeometry(12, 3, 1), glow('#ff3a4a'), 0, 17, 0.2));
  for (const sx of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(16, 8, 54), hull, sx * 35, -2, -4));
    g.add(part(new THREE.BoxGeometry(1, 1.2, 52), stripe, sx * 27.6, 5, -2));
    g.add(part(new THREE.BoxGeometry(1, 1.2, 50), stripe, sx * 43.5, -2, -4));
    g.add(part(alongZ(new THREE.ConeGeometry(4, 10, 4)).rotateZ(Math.PI / 4), dark, sx * 35, -2, 27));
  }
  // Glowing trim across the front and rows of lit windows.
  for (const y of [-4, 4]) g.add(part(new THREE.BoxGeometry(46, 0.8, 0.8), stripe, 0, y, 47.4));
  const windows = [];
  for (let i = 0; i < 40; i++) windows.push(new THREE.BoxGeometry(1.2, 0.8, 0.4).translate(-24 + (i % 20) * 2.5, i < 20 ? 3 : -3, 30.2));
  g.add(part(mergeGeometries(windows), glow('#ffd98a')));
  for (let i = 0; i < 5; i++) g.add(part(alongZ(new THREE.CircleGeometry(3.2, 16)).rotateX(Math.PI), additive('#ff7a4a'), -18 + i * 9, 0, -30.2));
  // Weak points on the front face, and the core in the middle.
  const partMeshes = parts.map((pt) => {
    const m = new THREE.Group();
    m.add(part(new THREE.SphereGeometry(2.8, 14, 10), dark));
    m.add(part(new THREE.SphereGeometry(1.8, 12, 8), glow(accent), 0, 0, 1.6));
    m.add(part(new THREE.SphereGeometry(3.6, 12, 8), additive(accent, 0.25)));
    m.position.set(pt.du, pt.dw, 27);
    g.add(m);
    return m;
  });
  const core = new THREE.Group();
  core.add(part(new THREE.SphereGeometry(5, 20, 14), glow('#ff5a2a')));
  core.add(part(new THREE.SphereGeometry(6.5, 16, 10), additive('#ffb03a', 0.3)));
  const shield = part(new THREE.SphereGeometry(8, 24, 16), additive('#7fc8ff', 0.35));
  core.add(shield);
  core.position.set(0, 0, 29);
  g.add(core);
  g.userData = { partMeshes, core, shield };
  return g;
}

// ------------------------------------------------------------ Space Burger

function signTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, 512, 128);
  x.strokeStyle = fg;
  x.lineWidth = 8;
  x.strokeRect(8, 8, 496, 112);
  x.fillStyle = fg;
  x.font = '900 64px ui-rounded, system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeBurgerJoint() {
  const g = new THREE.Group();
  // The diner: a saucer with a glowing dome.
  const diner = new THREE.Group();
  diner.add(part(new THREE.CylinderGeometry(13, 10, 3.2, 32), std('#e8e2d8', { metalness: 0.5 })));
  diner.add(part(new THREE.CylinderGeometry(13.2, 13.2, 0.8, 32), glow('#ff5aa8'), 0, 0.4, 0));
  diner.add(part(new THREE.SphereGeometry(8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffd59a', emissive: '#ff9a3a', emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }), 0, 1.6, 0));
  // A giant burger on the roof.
  const burger = new THREE.Group();
  burger.add(part(new THREE.SphereGeometry(5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#e0a050', { metalness: 0 }), 0, 2.4, 0));
  burger.add(part(new THREE.CylinderGeometry(5.3, 5.3, 1.2, 20), std('#6a3a22', { metalness: 0 }), 0, 1.8, 0));
  burger.add(part(new THREE.BoxGeometry(8, 0.3, 8).rotateY(0.4), std('#ffd23a', { metalness: 0 }), 0, 2.45, 0));
  burger.add(part(new THREE.CylinderGeometry(5.6, 5.6, 0.4, 20), std('#6ac04a', { metalness: 0 }), 0, 1.1, 0));
  burger.add(part(new THREE.CylinderGeometry(5, 4.6, 1.4, 20), std('#e0a050', { metalness: 0 }), 0, 0.2, 0));
  const seeds = [];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, r = 1.5 + (i % 3) * 1.1;
    seeds.push(new THREE.SphereGeometry(0.22, 6, 4).scale(1.6, 0.6, 1).translate(Math.cos(a) * r, 2.4 + Math.sqrt(Math.max(0, 25 - r * r)) - 0.1, Math.sin(a) * r));
  }
  burger.add(part(mergeGeometries(seeds), std('#fff3d0', { metalness: 0 })));
  burger.position.y = 8.5;
  diner.add(burger);
  // Neon sign.
  const sign = part(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: signTexture('SPACE BURGER', '#2a0a2a', '#ff7ad8'), side: THREE.DoubleSide }), 0, 21, 0);
  sign.rotation.y = Math.PI; // the lane frame's +z points away from the jet; face it
  diner.add(sign);
  g.add(diner);
  g.userData = { diner, burger, sign };
  return g;
}

export function makeDriveThru(radius) {
  const g = new THREE.Group();
  const ring = part(new THREE.TorusGeometry(radius, 0.45, 12, 48), glow('#ffb03a'));
  g.add(ring);
  const inner = part(new THREE.TorusGeometry(radius - 0.9, 0.12, 8, 48), glow('#ff5aa8'));
  g.add(inner);
  const label = part(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: signTexture('DRIVE-THRU', '#1a0a20', '#ffd23a'), side: THREE.DoubleSide, transparent: true }), 0, radius + 2.2, 0);
  label.rotation.y = Math.PI; // read the right way round from the approaching jet
  g.add(label);
  g.userData = { ring, inner };
  return g;
}

// ------------------------------------------------------------ pickups

export const PICKUP_COLORS = { dust: '#ffe07a', power: '#ff9a3a', shield: '#6fe9ff', repair: '#6dff9e', missiles: '#ff5a5a', hyper: '#c77dff' };

export function makePickup(type) {
  const g = new THREE.Group();
  const color = PICKUP_COLORS[type];
  const spin = new THREE.Group();
  if (type === 'power') spin.add(part(new THREE.OctahedronGeometry(1.4), std(color, { emissive: color, emissiveIntensity: 0.6 })));
  else if (type === 'shield') spin.add(part(new THREE.IcosahedronGeometry(1.3, 1), std(color, { emissive: color, emissiveIntensity: 0.4, transparent: true, opacity: 0.8 })));
  else if (type === 'repair') {
    spin.add(part(new THREE.BoxGeometry(2.4, 0.8, 0.8), std(color, { emissive: color, emissiveIntensity: 0.5 })));
    spin.add(part(new THREE.BoxGeometry(0.8, 2.4, 0.8), std(color, { emissive: color, emissiveIntensity: 0.5 })));
  } else if (type === 'missiles') {
    spin.add(part(alongZ(new THREE.CylinderGeometry(0.4, 0.4, 2.2, 10)), std('#f2f2f2')));
    spin.add(part(alongZ(new THREE.ConeGeometry(0.4, 0.8, 10)).translate(0, 0, 1.5), std(color, { emissive: color, emissiveIntensity: 0.6 })));
  } else if (type === 'hyper') {
    spin.add(part(new THREE.TorusGeometry(1.8, 0.35, 10, 32), glow(color)));
    spin.add(part(new THREE.TorusGeometry(1.1, 0.2, 8, 24), glow('#ffffff')));
  }
  g.add(spin);
  g.add(part(new THREE.SphereGeometry(2.6, 12, 8), additive(color, 0.16)));
  g.userData = { spin };
  return g;
}
