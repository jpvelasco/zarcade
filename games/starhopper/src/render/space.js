import * as THREE from 'three';
import { rng } from '../math.js';
import { LANE } from '../entities.js';

const NOISE_GLSL = /* glsl */ `
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise3(p); p *= 2.03; a *= 0.5; } return v; }
`;

export function sunDirection(seed) {
  const r = rng(seed * 3 + 1);
  return new THREE.Vector3(r() * 2 - 1, 0.3 + r() * 0.5, 0.6 + r() * 0.8).normalize();
}

// Nebula clouds and a distant sun painted on a sphere that follows the camera.
export function makeSky(palette, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      space: { value: new THREE.Color(palette.space) },
      nebA: { value: new THREE.Color(palette.nebulaA) },
      nebB: { value: new THREE.Color(palette.nebulaB) },
      sunColor: { value: new THREE.Color(palette.light) },
      sunDir: { value: sunDir },
      warp: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 space, nebA, nebB, sunColor, sunDir;
      uniform float warp;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = space;
        float n = fbm(d * 2.2 + 3.0);
        float m = fbm(d * 4.5 - 7.0);
        col += nebA * smoothstep(0.42, 0.85, n) * 0.55;
        col += nebB * smoothstep(0.5, 0.92, m) * 0.45;
        col += nebA * 0.08 * (1.0 - abs(d.y));
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 12.0) * 0.35 + pow(s, 400.0) * 3.0);
        col = mix(col, col * 0.4 + vec3(0.25, 0.35, 0.9) * 0.2, warp);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -2;
  return sky;
}

// Thousands of stars at a fixed pixel size, on a sphere around the camera.
export function makeStars(palette, seed) {
  const r = rng(seed * 7 + 2);
  const n = 4500;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const tint = new THREE.Color(palette.star), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, h = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * h * 20000, u * 20000, Math.sin(a) * h * 20000], i * 3);
    c.copy(tint).lerp(new THREE.Color(r() < 0.5 ? '#ffd8a8' : '#a8c8ff'), r() * 0.5).multiplyScalar(0.5 + r() * 0.8);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = r() < 0.03 ? 3.2 : 1 + r() * 1.3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { ratio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 color; uniform float ratio; varying vec3 vC;
      void main() { vC = color; gl_PointSize = size * ratio; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vC, smoothstep(0.5, 0.0, d));
        #include <colorspace_fragment>
      }`,
  });
  const stars = new THREE.Points(g, m);
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  return stars;
}

// The destination planet: procedural surface, atmosphere glow, optional rings.
export function makePlanet(palette, seed, radius, sunDir) {
  const group = new THREE.Group();
  const p = palette.planet;
  const surface = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      a: { value: new THREE.Color(p.a) }, b: { value: new THREE.Color(p.b) }, c: { value: new THREE.Color(p.c) },
      sunDir: { value: sunDir }, banded: { value: p.rings ? 1 : 0 }, seed: { value: (seed % 1000) / 10 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vP;
      void main() { vN = normalize(mat3(modelMatrix) * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 a, b, c, sunDir; uniform float banded, seed;
      varying vec3 vN; varying vec3 vP;
      ${NOISE_GLSL}
      void main() {
        vec3 q = normalize(vP);
        float n = fbm(q * 3.0 + seed);
        float bands = sin(q.y * 18.0 + n * 4.0) * 0.5 + 0.5;
        float t = mix(smoothstep(0.35, 0.7, n), bands, banded);
        vec3 col = mix(a, b, t);
        col = mix(col, c, smoothstep(0.72, 0.9, fbm(q * 7.0 - seed)) * 0.8);
        col = mix(col, c, smoothstep(0.82, 0.95, abs(q.y)) * (1.0 - banded));
        float light = clamp(dot(normalize(vN), sunDir) * 1.1 + 0.15, 0.06, 1.2);
        gl_FragColor = vec4(col * light, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), surface));
  const atmo = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { color: { value: new THREE.Color(p.atmosphere) }, sunDir: { value: sunDir } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vView;
      void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vView = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color, sunDir; varying vec3 vN; varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(vN, vView)), 2.5);
        float lit = clamp(dot(-vN, sunDir) * 0.6 + 0.6, 0.2, 1.0);
        gl_FragColor = vec4(color * rim * lit * 1.4, rim);
      }`,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 64, 48), atmo));
  if (p.rings) {
    const ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: { a: { value: new THREE.Color(p.b) }, c: { value: new THREE.Color(p.c) }, inner: { value: radius * 1.35 }, outer: { value: radius * 2.3 } },
      vertexShader: /* glsl */ `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 a, c; uniform float inner, outer; varying vec3 vP;
        void main() {
          float r = (length(vP.xy) - inner) / (outer - inner);
          float stripes = 0.5 + 0.5 * sin(r * 70.0) * sin(r * 23.0 + 1.0);
          float alpha = smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.9, r) * (0.35 + 0.45 * stripes);
          gl_FragColor = vec4(mix(a, c, stripes), alpha * 0.8);
          #include <colorspace_fragment>
        }`,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.35, radius * 2.3, 160, 1), ringMat);
    ring.rotation.x = Math.PI / 2 - 0.35;
    ring.rotation.y = 0.3;
    group.add(ring);
  }
  return group;
}

// Glowing buoys marking the corners of the lane every 300 m.
export function makeBeacons(lane, length, color) {
  const spots = [];
  for (let s = 150; s < length + 4000; s += 300) {
    for (const [u, w] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) spots.push(lane.toWorld(s, u * (LANE.halfU + 4), w * (LANE.halfW + 4)));
  }
  const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); mesh.setMatrixAt(i, m); });
  mesh.computeBoundingSphere();
  return mesh;
}

// Speed streaks: short lines drifting past the jet, stretched by speed.
export class SpaceDust {
  constructor(count = 320) {
    this.count = count;
    const r = rng(99);
    this.items = Array.from({ length: count }, () => ({ ds: r() * 420, du: (r() * 2 - 1) * 70, dw: (r() * 2 - 1) * 45 }));
    this.pos = new Float32Array(count * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lines.frustumCulled = false;
  }

  update(dt, lane, s, u, w, speed) {
    const len = Math.max(1.5, speed * 0.035);
    this.items.forEach((d, i) => {
      d.ds -= speed * dt;
      if (d.ds < -10) d.ds += 430;
      const f = lane.frame(s + d.ds);
      const a = lane.toWorld(s + d.ds, u + d.du, w + d.dw, f);
      this.pos.set([a.x, a.y, a.z, a.x - f.T.x * len, a.y - f.T.y * len, a.z - f.T.z * len], i * 6);
    });
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}

// The hyperspace tunnel: a glowing tube of streaks around the lane.
export function makeTunnel() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { time: { value: 0 }, fade: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float time, fade; varying vec2 vUv;
      float h(float x) { return fract(sin(x * 91.7) * 43758.5453); }
      void main() {
        float lane = floor(vUv.x * 64.0);
        float streak = fract(vUv.y * (3.0 + h(lane) * 4.0) + time * (1.5 + h(lane + 3.0) * 2.0) + h(lane + 7.0));
        float glow = smoothstep(0.0, 0.25, streak) * smoothstep(1.0, 0.6, streak) * step(0.35, h(lane + 11.0));
        vec3 col = mix(vec3(0.35, 0.55, 1.0), vec3(0.9, 0.5, 1.0), h(lane));
        float ends = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
        gl_FragColor = vec4(col * glow, glow * fade * ends * 0.75);
      }`,
  });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(55, 55, 900, 48, 1, true).rotateX(Math.PI / 2), mat);
  tube.frustumCulled = false;
  tube.visible = false;
  return tube;
}
