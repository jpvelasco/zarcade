import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Everything here is built from primitives in code: no model files to load.

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------- jeep

export function makeJeep(color) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // tilts with suspension; wheels stay put
  root.add(body);

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.25, flatShading: true });
  const dark = lambert('#26242a');
  const trim = new THREE.MeshStandardMaterial({ color: '#c9cdd2', roughness: 0.3, metalness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: '#9fd0ea', roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.45 });
  const seat = lambert('#5a3a2a');
  const skin = lambert('#f0c09a');
  const helmet = lambert('#f4f1e8');

  body.add(mesh(box(2.0, 0.55, 4.1), paint, 0, 0.95, 0));           // chassis
  body.add(mesh(box(1.9, 0.32, 1.55), paint, 0, 1.36, 1.25));        // hood
  body.add(mesh(box(0.5, 0.06, 1.2), dark, 0, 1.54, 1.3));           // hood stripe vent
  body.add(mesh(box(2.02, 0.5, 1.9), paint, 0, 1.45, -1.05));        // rear tub
  body.add(mesh(box(1.7, 0.1, 1.6), dark, 0, 1.71, -1.05));          // tub floor
  for (const x of [-1, 1]) {
    for (const z of [1.35, -1.35]) body.add(mesh(box(0.38, 0.14, 1.35), paint, x * 1.02, 1.28, z)); // fenders
  }
  // Windshield with frame.
  body.add(mesh(box(1.9, 0.08, 0.1), paint, 0, 2.3, 0.4));
  body.add(mesh(box(0.08, 0.8, 0.1), paint, -0.92, 1.9, 0.4));
  body.add(mesh(box(0.08, 0.8, 0.1), paint, 0.92, 1.9, 0.4));
  body.add(mesh(box(1.78, 0.74, 0.04), glass, 0, 1.9, 0.4));
  // Roll cage.
  for (const x of [-0.88, 0.88]) body.add(mesh(box(0.1, 1.05, 0.1), dark, x, 2.2, -0.55));
  body.add(mesh(box(1.86, 0.1, 0.1), dark, 0, 2.72, -0.55));
  body.add(mesh(box(0.1, 0.1, 1.0), dark, -0.88, 2.72, -0.05));
  body.add(mesh(box(0.1, 0.1, 1.0), dark, 0.88, 2.72, -0.05));
  // Seats and driver.
  body.add(mesh(box(0.6, 0.7, 0.2), seat, -0.45, 1.65, -0.35));
  body.add(mesh(box(0.6, 0.7, 0.2), seat, 0.45, 1.65, -0.35));
  body.add(mesh(box(0.55, 0.55, 0.4), lambert('#3a6fb5'), 0.45, 1.75, -0.15)); // torso (driver sits on the right)
  const head = mesh(new THREE.SphereGeometry(0.24, 10, 8), skin, 0.45, 2.2, -0.12);
  body.add(head);
  body.add(mesh(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), helmet, 0.45, 2.24, -0.12));
  body.add(mesh(box(0.5, 0.06, 0.12), lambert('#222'), 0.45, 2.24, 0.12)); // goggles
  // Bumpers, lights, spare.
  body.add(mesh(box(2.2, 0.28, 0.3), dark, 0, 0.8, 2.15));
  body.add(mesh(box(1.6, 0.5, 0.08), trim, 0, 1.15, 2.25)); // grille
  for (const x of [-0.7, 0.7]) {
    body.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12).rotateX(Math.PI / 2), basic('#fff6d2'), x, 1.22, 2.3));
    body.add(mesh(box(0.28, 0.16, 0.06), basic('#ff3a2a'), x * 1.2, 1.2, -2.08));
  }
  body.add(mesh(box(2.1, 0.25, 0.25), dark, 0, 0.85, -2.12));
  const spare = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14).rotateX(Math.PI / 2), dark, 0, 1.55, -2.25);
  body.add(spare);
  // Exhaust pipes for nitro flames.
  for (const x of [-0.6, 0.6]) body.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8).rotateX(Math.PI / 2), trim, x, 0.75, -2.2));

  // Weapons mounted on the roll cage (shown when equipped).
  const gun = new THREE.Group();
  gun.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 10), dark, 0, 0.1, 0));
  gun.add(mesh(box(0.22, 0.22, 0.6), lambert('#4b5320'), 0, 0.3, 0.1));
  gun.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8).rotateX(Math.PI / 2), dark, 0, 0.32, 0.8));
  gun.position.set(0, 2.78, -0.5);
  gun.visible = false;
  body.add(gun);
  const rockets = new THREE.Group();
  for (const x of [-0.95, 0.95]) {
    const pod = mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 10).rotateX(Math.PI / 2), lambert('#b8352a'), x, 2.5, -0.3);
    rockets.add(pod);
    rockets.add(mesh(new THREE.ConeGeometry(0.2, 0.3, 10).rotateX(Math.PI / 2), trim, x, 2.5, 0.35));
  }
  rockets.visible = false;
  body.add(rockets);

  // Shield bubble and nitro flames.
  const shield = new THREE.Mesh(
    new THREE.IcosahedronGeometry(3.1, 2),
    new THREE.MeshBasicMaterial({ color: '#6fe9ff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: false }),
  );
  shield.position.y = 1.4;
  shield.visible = false;
  root.add(shield);
  const flames = new THREE.Group();
  for (const x of [-0.6, 0.6]) {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 1.4, 10).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    f.position.set(x, 0.75, -3.0);
    flames.add(f);
  }
  flames.visible = false;
  body.add(flames);

  // Wheels: front ones sit in steering pivots.
  const tire = lambert('#1d1c1f');
  const hub = trim;
  const wheels = [];
  const pivots = [];
  for (const [x, z] of [[-1.05, 1.35], [1.05, 1.35], [-1.05, -1.35], [1.05, -1.35]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.55, z);
    const wheel = new THREE.Group();
    wheel.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.46, 16).rotateZ(Math.PI / 2), tire));
    wheel.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.48, 10).rotateZ(Math.PI / 2), hub));
    for (let i = 0; i < 6; i++) {
      const tread = mesh(box(0.48, 0.1, 0.2), tire);
      tread.position.set(0, Math.cos((i / 6) * Math.PI * 2) * 0.55, Math.sin((i / 6) * Math.PI * 2) * 0.55);
      tread.rotation.x = -(i / 6) * Math.PI * 2;
      wheel.add(tread);
    }
    pivot.add(wheel);
    root.add(pivot);
    wheels.push(wheel);
    if (z > 0) pivots.push(pivot);
  }

  root.userData = { body, wheels, pivots, gun, rockets, shield, flames, paint };
  return root;
}

// Headlights for night tracks, parented to the jeep.
export function addHeadlights(jeep) {
  const lights = [];
  for (const x of [-0.7, 0.7]) {
    const spot = new THREE.SpotLight('#fff1c8', 900, 120, 0.42, 0.45, 1.5);
    spot.position.set(x, 1.25, 2.2);
    spot.target.position.set(x * 1.5, 0, 26);
    jeep.userData.body.add(spot, spot.target);
    lights.push(spot);
  }
  // Glowing cones so the beams read even over dark sand.
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(4.5, 26, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 14),
    new THREE.MeshBasicMaterial({ color: '#fff1c8', transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.set(0, 1.2, 2.2);
  jeep.userData.body.add(beam);
  // A soft glow on the jeep itself so it stays readable in the dark.
  const glow = new THREE.PointLight('#ffd9a0', 18, 9, 1.5);
  glow.position.set(0, 3.2, -1);
  jeep.add(glow);
  return lights;
}

// ---------------------------------------------------------------- zombies

const SKINS = ['#86c25e', '#9ccf6c', '#73b065', '#a3c46a'];
const SHIRTS = ['#c0563f', '#4f7cc4', '#d6a33c', '#8c5bb0', '#5f9a8a', '#d06a8e'];

export function makeZombie(type, seed = 0) {
  const g = new THREE.Group();
  const skin = lambert(type === 'bloater' ? '#b7d35a' : SKINS[seed % SKINS.length]);
  const shirt = lambert(type === 'runner' ? '#d33b3b' : type === 'brute' ? '#5d5f66' : SHIRTS[seed % SHIRTS.length]);
  const pants = lambert(type === 'runner' ? '#2a2a60' : '#5a4a3a');
  const eyeMat = basic(type === 'bloater' ? '#ffee55' : '#ff4a3a');
  const scale = type === 'brute' ? 1.35 : type === 'bloater' ? 1.15 : type === 'runner' ? 0.95 : 1;

  const legs = [];
  for (const x of [-0.18, 0.18]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.85, 0);
    pivot.add(mesh(box(0.24, 0.85, 0.26, 0, -0.42, 0), pants));
    g.add(pivot);
    legs.push(pivot);
  }
  let torso;
  if (type === 'bloater') {
    torso = mesh(new THREE.SphereGeometry(0.75, 12, 10), skin, 0, 1.35, 0.05);
    torso.scale.set(1, 1.05, 0.95);
    // Glowing pustules warn that this one goes boom.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), basic('#e6ff6a'), Math.cos(a) * 0.55, 1.3 + Math.sin(a * 2) * 0.3, 0.45 + Math.sin(a) * 0.2));
    }
  } else {
    torso = mesh(box(0.62, 0.72, 0.36), shirt, 0, 1.25, 0);
  }
  g.add(torso);
  if (type === 'brute') {
    g.add(mesh(box(0.8, 0.5, 0.46), lambert('#3d3f45'), 0, 1.35, 0)); // armor vest
  }
  const head = new THREE.Group();
  head.position.set(0, type === 'bloater' ? 2.05 : 1.82, 0.05);
  head.add(mesh(box(0.44, 0.44, 0.42), skin));
  for (const x of [-0.1, 0.1]) head.add(mesh(box(0.09, 0.07, 0.04), eyeMat, x, 0.04, 0.22));
  head.add(mesh(box(0.2, 0.05, 0.04), lambert('#3a2020'), 0, -0.12, 0.22)); // mouth
  if (type === 'brute') {
    head.add(mesh(new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert('#f2c230'), 0, 0.12, 0));
    head.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 14), lambert('#f2c230'), 0, 0.12, 0));
  }
  if (type === 'runner') head.add(mesh(box(0.46, 0.08, 0.44), lambert('#ffffff'), 0, 0.14, 0)); // headband
  g.add(head);
  const arms = [];
  for (const x of [-0.4, 0.4]) {
    const pivot = new THREE.Group();
    pivot.position.set(x * (type === 'bloater' ? 1.6 : 1), 1.52, 0);
    pivot.add(mesh(box(0.18, 0.18, 0.72, 0, 0, 0.34), type === 'brute' ? shirt : skin));
    g.add(pivot);
    arms.push(pivot);
  }
  g.scale.setScalar(scale);
  g.userData = { legs, arms, head, torso, type };
  return g;
}

export function animateZombie(model, phase, state) {
  const { legs, arms, head } = model.userData;
  const run = state === 'chase';
  const swing = Math.sin(phase) * (run ? 0.9 : 0.45);
  legs[0].rotation.x = swing;
  legs[1].rotation.x = -swing;
  arms[0].rotation.x = -0.1 + Math.sin(phase * 0.5) * 0.15 - (run ? 0.3 : 0);
  arms[1].rotation.x = -0.1 + Math.cos(phase * 0.5) * 0.15 - (run ? 0.3 : 0);
  head.rotation.z = Math.sin(phase * 0.5) * 0.18;
  model.rotation.z = Math.sin(phase * 0.5) * (run ? 0.05 : 0.1);
}

// ---------------------------------------------------------------- props

// Props are modeled at natural size; an obstacle of radius r is drawn at
// scale r / PROP_BASE_R[type].
export const PROP_BASE_R = { cactus: 0.7, rock: 1, boulder: 1, wreck: 2.3, barrel: 0.6, building: 6, palm: 0.6, tumbleweed: 1 };

// Returns [{ geometry, material }] parts for a prop type.
export function propParts(type, palette) {
  switch (type) {
    case 'cactus': {
      const g = mergeGeometries([
        new THREE.CylinderGeometry(0.36, 0.42, 3.8, 8).translate(0, 1.9, 0),
        new THREE.SphereGeometry(0.36, 8, 6).translate(0, 3.8, 0),
        new THREE.CylinderGeometry(0.24, 0.24, 1.3, 8).translate(0.75, 2.5, 0),
        new THREE.CylinderGeometry(0.24, 0.24, 0.6, 8).rotateZ(Math.PI / 2).translate(0.45, 1.9, 0),
        new THREE.CylinderGeometry(0.22, 0.22, 1.0, 8).translate(-0.65, 2.1, 0),
        new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8).rotateZ(Math.PI / 2).translate(-0.4, 1.6, 0),
      ].map((x) => x.toNonIndexed()));
      return [{ geometry: g, material: lambert('#4f8a3c') }];
    }
    case 'rock':
      return [{ geometry: new THREE.DodecahedronGeometry(1, 0).scale(1.1, 0.75, 1).translate(0, 0.45, 0), material: lambert(palette.rock || '#8a6a55') }];
    case 'boulder':
      return [{ geometry: new THREE.DodecahedronGeometry(1, 1).translate(0, 1, 0), material: lambert(palette.rock || '#8a6a55') }];
    case 'wreck':
      return [
        { geometry: mergeGeometries([box(1.8, 0.7, 4, 0, 0.6, 0), box(1.6, 0.6, 1.8, 0, 1.25, -0.3)]), material: lambert('#8b4a2e') },
        { geometry: mergeGeometries([-1, 1].flatMap((x) => [1.3, -1.3].map((z) => new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10).rotateZ(Math.PI / 2).translate(x * 0.9, 0.3, z)))), material: lambert('#2a2624') },
      ];
    case 'barrel':
      return [
        { geometry: new THREE.CylinderGeometry(0.55, 0.55, 1.2, 12).translate(0, 0.6, 0), material: lambert('#c9352a') },
        { geometry: new THREE.CylinderGeometry(0.57, 0.57, 0.18, 12).translate(0, 0.7, 0), material: basic('#ffd23a') },
      ];
    case 'building': {
      // Old-west storefront with a tall false front.
      const walls = mergeGeometries([box(1.6, 1.0, 1.4, 0, 0.5, 0), box(1.7, 0.45, 0.08, 0, 1.2, 0.72)]);
      const roof = box(1.7, 0.08, 1.5, 0, 1.02, 0);
      const windows = mergeGeometries([box(0.35, 0.3, 0.04, -0.45, 0.6, 0.72), box(0.35, 0.3, 0.04, 0.45, 0.6, 0.72), box(0.3, 0.55, 0.04, 0, 0.3, 0.72)]);
      return [
        { geometry: walls.scale(4, 4, 4), material: lambert('#8e6a4e') },
        { geometry: roof.scale(4, 4, 4), material: lambert('#5a3f30') },
        { geometry: windows.scale(4, 4, 4), material: basic('#b87a3a') },
      ];
    }
    case 'palm': {
      const trunk = mergeGeometries([0, 1, 2, 3].map((i) => new THREE.CylinderGeometry(0.28 - i * 0.03, 0.32 - i * 0.03, 2.2, 7).translate(i * 0.25, 1.1 + i * 2.1, 0)).map((x) => x.toNonIndexed()));
      const leaves = mergeGeometries([0, 1, 2, 3, 4, 5, 6].map((i) => {
        const leaf = new THREE.ConeGeometry(0.5, 3.4, 4).rotateX(Math.PI / 2).translate(0, 0, 1.7);
        leaf.scale(1, 0.25, 1);
        leaf.rotateX(0.5);
        leaf.rotateY((i / 7) * Math.PI * 2);
        return leaf.translate(0.75, 8.6, 0).toNonIndexed();
      }));
      return [
        { geometry: trunk, material: lambert('#7a5638') },
        { geometry: leaves, material: lambert('#3f7a45') },
      ];
    }
    case 'tumbleweed': {
      // A tangle of twigs: several jittered wire balls on top of each other.
      const balls = [0, 1, 2].map((i) => {
        const g = new THREE.IcosahedronGeometry(0.8 + i * 0.12, 1);
        const pos = g.attributes.position;
        for (let v = 0; v < pos.count; v++) pos.setXYZ(v, pos.getX(v) * (0.85 + ((v * 7 + i) % 5) * 0.07), pos.getY(v) * 0.85, pos.getZ(v) * (0.85 + ((v * 3 + i) % 4) * 0.08));
        return g.rotateY(i * 0.7).rotateX(i * 0.5).translate(0, 0.85, 0);
      });
      return [{ geometry: mergeGeometries(balls), material: new THREE.MeshLambertMaterial({ color: '#b08a5c', wireframe: true }) }];
    }
    default:
      throw new Error(`Unknown prop ${type}`);
  }
}

export function makeRamp({ width, length, height }) {
  // Wedge rising toward +z.
  const w = width / 2, l = length / 2;
  const pos = [
    -w, 0, -l, w, 0, -l, w, height, l, -w, height, l, // slope
    -w, 0, l, w, 0, l, // back bottom
  ];
  const idx = [0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4, 0, 3, 4, 1, 5, 2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1];
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#f2c230';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#222';
  for (let i = -64; i < 128; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 11, 0); x.lineTo(i - 53, 64); x.lineTo(i - 64, 64); x.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- pickups

export const PICKUP_COLORS = {
  coin: '#ffd54a', nitro: '#4fb4ff', repair: '#ff5a5a', shield: '#6fe9ff', gun: '#b6d94a', rockets: '#ff8a3a',
};

export function makePickup(type) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  if (type === 'nitro') {
    spin.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14), new THREE.MeshStandardMaterial({ color: '#2f86e8', emissive: '#1a4f9a', metalness: 0.5, roughness: 0.3 })));
    spin.add(mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.3, 10), new THREE.MeshStandardMaterial({ color: '#d7dde3', metalness: 0.8 }), 0, 0.7, 0));
    spin.add(mesh(box(0.1, 0.55, 0.9), basic('#ffe45a'), 0, 0, 0));
  } else if (type === 'repair') {
    spin.add(mesh(box(1.0, 1.0, 1.0), lambert('#f4f1ea')));
    spin.add(mesh(box(0.25, 0.7, 1.04), basic('#ff3a3a')));
    spin.add(mesh(box(0.7, 0.25, 1.04), basic('#ff3a3a')));
  } else if (type === 'shield') {
    spin.add(mesh(new THREE.IcosahedronGeometry(0.75, 1), new THREE.MeshStandardMaterial({ color: '#6fe9ff', emissive: '#1a8aa8', transparent: true, opacity: 0.75, roughness: 0.1 })));
  } else if (type === 'gun') {
    spin.add(mesh(box(1.1, 0.7, 1.1), lambert('#5c6b2e')));
    spin.add(mesh(box(0.2, 0.2, 1.3), lambert('#222'), 0, 0.5, 0.2));
  } else if (type === 'rockets') {
    spin.add(mesh(box(1.1, 0.7, 1.1), lambert('#8f2f22')));
    for (const x of [-0.3, 0, 0.3]) spin.add(mesh(new THREE.ConeGeometry(0.12, 0.6, 8), basic('#ffb45a'), x, 0.65, 0));
  }
  // Halo and beam so pickups read from far away.
  const color = PICKUP_COLORS[type];
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.9, 7, 12, 1, true).translate(0, 3, 0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  g.add(beam);
  g.userData = { spin };
  return g;
}

export function makeCoinGeometry() {
  return new THREE.CylinderGeometry(0.6, 0.6, 0.16, 16).rotateX(Math.PI / 2);
}
