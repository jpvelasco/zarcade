import * as THREE from 'three';
import { PROP_BASE_R, propParts } from './models.js';
import { STEP } from '../track.js';

const TILE = 200;         // terrain tile size in meters
const TILE_RES = 50;      // segments per tile side (4 m spacing)
const TERRAIN_REACH = 380;

export function sunDirection(palette) {
  const el = palette.sunElevation, az = palette.sunAzimuth;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
}

// ---------------------------------------------------------------- sky

export function makeSky(palette, night) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(palette.skyTop) },
      horizon: { value: new THREE.Color(palette.skyHorizon) },
      sunColor: { value: new THREE.Color(palette.sun) },
      sunDir: { value: sunDirection(palette) },
      night: { value: night ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, horizon, sunColor, sunDir;
      uniform float night;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, top, smoothstep(-0.02, 0.6, h));
        col = mix(col, horizon * 0.6, smoothstep(0.0, -0.3, h));
        float s = max(dot(d, sunDir), 0.0);
        float discR = night > 0.5 ? 0.99975 : 0.99955;
        col += sunColor * (pow(s, 5.0) * 0.22 + pow(s, 90.0) * 0.55) * (night > 0.5 ? 0.35 : 1.0);
        col = mix(col, sunColor * 1.8, smoothstep(discR - 0.00008, discR, s));
        if (night > 0.5) {
          // Round star dots: a few random cells get a soft point at their center.
          vec3 p = d * 380.0;
          vec3 cell = floor(p);
          float dotShape = smoothstep(0.32, 0.0, length(fract(p) - 0.5));
          float star = step(0.992, hash(cell)) * dotShape * smoothstep(0.03, 0.35, h);
          col += star * vec3(0.85, 0.9, 1.0) * (0.6 + 0.8 * hash(cell + 3.1));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), material);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

// ---------------------------------------------------------------- lights

export function makeLights(scene, palette, night) {
  const skyLight = new THREE.Color(palette.skyHorizon).lerp(new THREE.Color('#ffffff'), 0.4);
  const hemi = new THREE.HemisphereLight(skyLight, palette.sand, palette.ambient * 2.2);
  scene.add(hemi);
  // Soft fill from the opposite side so sunset-backlit things aren't black.
  const dir = sunDirection(palette);
  const fill = new THREE.DirectionalLight(palette.skyTop, palette.light * 0.55);
  fill.position.set(-dir.x * 100, 60, -dir.z * 100);
  scene.add(fill);
  const sun = new THREE.DirectionalLight(palette.sun, palette.light * 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -45; cam.right = 45; cam.top = 45; cam.bottom = -45; cam.near = 1; cam.far = 400;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target);
  if (night) scene.add(new THREE.AmbientLight('#3a4a8a', 0.25));
  return { hemi, sun, fill, dir };
}

// ---------------------------------------------------------------- terrain

export function makeTerrain(track, palette) {
  const group = new THREE.Group();
  const sand = new THREE.Color(palette.sand), dark = new THREE.Color(palette.sandDark);
  const rock = new THREE.Color(palette.rock || palette.sandDark);
  const roadCol = new THREE.Color(palette.road);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // Tiles that come within reach of the road.
  const xs = track.samples.map((s) => s.x), zs = track.samples.map((s) => s.z);
  const minX = Math.floor((Math.min(...xs) - TERRAIN_REACH) / TILE), maxX = Math.floor((Math.max(...xs) + TERRAIN_REACH) / TILE);
  const minZ = Math.floor((Math.min(...zs) - TERRAIN_REACH) / TILE), maxZ = Math.floor((Math.max(...zs) + TERRAIN_REACH) / TILE);
  const coarse = track.samples.filter((_, i) => i % 10 === 0);
  const c = new THREE.Color();

  for (let tx = minX; tx <= maxX; tx++) {
    for (let tz = minZ; tz <= maxZ; tz++) {
      const cx = (tx + 0.5) * TILE, cz = (tz + 0.5) * TILE;
      const reach = TERRAIN_REACH + TILE * 0.71;
      if (!coarse.some((s) => (s.x - cx) ** 2 + (s.z - cz) ** 2 < reach * reach)) continue;

      const geo = new THREE.PlaneGeometry(TILE, TILE, TILE_RES, TILE_RES).rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
        const near = track.nearest(x, z) || track.nearestCoarse(x, z);
        const y = track.groundHeight(x, z, near);
        pos.setXYZ(i, x, y, z);
        // Color: sand with ripples, packed near the road, rock up canyon walls.
        const n = Math.sin(x * 0.13 + z * 0.07) * Math.sin(z * 0.11 - x * 0.05);
        c.copy(dark).lerp(sand, 0.55 + 0.35 * n);
        const edge = Math.max(0, 1 - Math.abs(near.distance - track.half - 1.5) / 3);
        c.lerp(roadCol, edge * 0.5);
        const wall = track.wallHeight(near.distance) / (track.def.walls ? track.def.walls.height : 1);
        if (wall > 0) c.lerp(rock, Math.min(1, wall * 1.4)).multiplyScalar(1 - 0.15 * Math.sin(y * 0.7));
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const tile = new THREE.Mesh(geo, material);
      tile.receiveShadow = true;
      group.add(tile);
    }
  }

  // A far floor under everything so the horizon never shows a gap.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: palette.sandDark }));
  floor.position.y = -14;
  group.add(floor);
  return group;
}

// ---------------------------------------------------------------- road

function roadTexture(color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, 128, 256);
  // Grit.
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,240,220'},${Math.random() * 0.12})`;
    x.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
  }
  // Two worn tire tracks and dusty edges.
  x.fillStyle = 'rgba(40,20,10,0.08)';
  x.fillRect(30, 0, 14, 256);
  x.fillRect(84, 0, 14, 256);
  const edge = x.createLinearGradient(0, 0, 128, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0.18)');
  edge.addColorStop(0.08, 'rgba(0,0,0,0)');
  edge.addColorStop(0.92, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.18)');
  x.fillStyle = edge;
  x.fillRect(0, 0, 128, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function makeRoad(track, palette) {
  const group = new THREE.Group();
  const n = track.samples.length;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
  const idx = [];
  track.samples.forEach((s, i) => {
    for (let k = 0; k < 2; k++) {
      const lat = (k === 0 ? -1 : 1) * (track.half + 0.4);
      const x = s.x + s.dz * lat, z = s.z - s.dx * lat;
      pos.set([x, s.y + 0.07, z], (i * 2 + k) * 3);
      uv.set([k, (i * STEP) / 16], (i * 2 + k) * 2);
    }
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: roadTexture(palette.road), polygonOffset: true, polygonOffsetFactor: -2 }));
  road.receiveShadow = true;
  group.add(road);

  // Marker posts with reflectors every 24 m, both sides.
  const posts = [];
  for (let d = 30; d < track.length - 20; d += 24) {
    for (const side of [-1, 1]) posts.push(track.pointAt(d, side * (track.half + 1.6)));
  }
  const postGeo = new THREE.BoxGeometry(0.18, 1.1, 0.18).translate(0, 0.55, 0);
  const capGeo = new THREE.BoxGeometry(0.2, 0.22, 0.2).translate(0, 1.0, 0);
  const postMesh = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: '#efe8dc' }), posts.length);
  const capMesh = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ color: '#ff7a2a' }), posts.length);
  const m = new THREE.Matrix4();
  posts.forEach((p, i) => {
    m.makeTranslation(p.x, track.groundHeight(p.x, p.z), p.z);
    postMesh.setMatrixAt(i, m);
    capMesh.setMatrixAt(i, m);
  });
  postMesh.castShadow = true;
  group.add(postMesh, capMesh);

  group.add(makeArch(track, track.startDist + 8, 'START'));
  group.add(makeArch(track, track.finishDist, 'FINISH'));
  return group;
}

function makeArch(track, dist, label) {
  const g = new THREE.Group();
  const p = track.pointAt(dist);
  const w = track.half + 2.5;
  const poleMat = new THREE.MeshLambertMaterial({ color: '#3a2a2a' });
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.5, 0.5).translate(0, 3.75, 0), poleMat);
    pole.position.set(side * w, 0, 0);
    pole.castShadow = true;
    g.add(pole);
  }
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) {
    x.fillStyle = (i + j) % 2 ? '#1b1b1b' : '#f4f1e8';
    x.fillRect(i * 16, j * 16, 16, 16);
  }
  x.fillStyle = label === 'START' ? 'rgba(255,120,50,0.92)' : 'rgba(30,20,40,0.85)';
  x.fillRect(150, 6, 212, 52);
  x.fillStyle = '#fff';
  x.font = '900 40px ui-rounded, system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(label, 256, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 1.4, 0.2), new THREE.MeshBasicMaterial({ map: tex }));
  banner.position.y = 7;
  g.add(banner);
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.heading;
  return g;
}

// ---------------------------------------------------------------- props

// Draws every static obstacle and scenery piece with one InstancedMesh per
// prop part. Returns { group, hide(id) } so destroyed obstacles vanish.
export function makeProps(obstacles, decor, palette) {
  const group = new THREE.Group();
  const byType = new Map();
  for (const o of [...obstacles, ...decor]) {
    if (o.roll) continue; // rolling boulders are animated separately
    if (!byType.has(o.type)) byType.set(o.type, []);
    byType.get(o.type).push(o);
  }
  const slots = new Map(); // id -> [{ mesh, index }]
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [type, list] of byType) {
    for (const part of propParts(type, palette)) {
      const inst = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      inst.castShadow = type !== 'tumbleweed';
      inst.receiveShadow = true;
      list.forEach((o, i) => {
        const k = o.r / PROP_BASE_R[type];
        m.compose(p.set(o.x, o.y - 0.05, o.z), q.setFromAxisAngle(up, o.rot), s.set(k, type === 'rock' ? k * (0.8 + (o.id % 5) * 0.12) : k, k));
        inst.setMatrixAt(i, m);
        if (!slots.has(o.id)) slots.set(o.id, []);
        slots.get(o.id).push({ mesh: inst, index: i });
      });
      inst.computeBoundingSphere();
      group.add(inst);
    }
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group,
    hide(id) {
      for (const { mesh, index } of slots.get(id) || []) {
        mesh.setMatrixAt(index, zero);
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
