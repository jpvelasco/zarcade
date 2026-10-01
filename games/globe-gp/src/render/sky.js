import * as THREE from 'three';
import { Merger } from './geom.js';
import { rng } from '../math.js';

export function sunDirection(p) {
  const el = p.sunElevation, az = p.sunAzimuth;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
}

// Gradient sky with sun or moon, stars at night and an aurora where asked.
export function makeSky(loc) {
  const p = loc.palette;
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(p.skyTop) },
      horizon: { value: new THREE.Color(p.skyHorizon) },
      sunColor: { value: new THREE.Color(p.sun) },
      sunDir: { value: sunDirection(p) },
      night: { value: loc.night ? 1 : 0 },
      aurora: { value: loc.id === 'iceland' ? 1 : 0 },
      time: { value: 0 },
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
      uniform float night, aurora, time;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, top, smoothstep(-0.02, 0.55, h));
        col = mix(col, horizon * 0.7, smoothstep(0.0, -0.25, h));
        float s = max(dot(d, sunDir), 0.0);
        if (night > 0.5) {
          col += sunColor * pow(s, 60.0) * 0.25;
          col = mix(col, sunColor * 1.2, smoothstep(0.9993, 0.9996, s)); // moon
          vec3 p = d * 360.0;
          vec3 cell = floor(p);
          float dotShape = smoothstep(0.34, 0.0, length(fract(p) - 0.5));
          float star = step(0.991, hash(cell)) * dotShape * smoothstep(0.03, 0.3, h);
          col += star * vec3(0.85, 0.9, 1.0) * (0.5 + 0.9 * hash(cell + 3.1));
        } else {
          col += sunColor * (pow(s, 6.0) * 0.25 + pow(s, 80.0) * 0.6);
          col = mix(col, sunColor * 1.6, smoothstep(0.99935, 0.9996, s));
        }
        if (aurora > 0.5) {
          float a = atan(d.x, d.z);
          float band = sin(a * 3.0 + time * 0.15 + sin(a * 7.0 - time * 0.3) * 0.6);
          float curtain = smoothstep(0.08, 0.25, h) * smoothstep(0.75, 0.3, h + band * 0.08);
          float ripple = 0.5 + 0.5 * sin(a * 40.0 + time * 0.8 + band * 4.0);
          vec3 green = vec3(0.2, 1.0, 0.6), violet = vec3(0.6, 0.3, 1.0);
          col += mix(green, violet, smoothstep(0.3, 0.6, h)) * curtain * (0.25 + 0.35 * ripple) * (0.6 + 0.4 * band);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), material);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

// Puffy low-poly clouds high in the sky (daytime only).
export function makeClouds(loc, center, radius) {
  if (loc.night) return null;
  const r = rng(loc.circuit.seed * 13 + 1);
  const M = new Merger();
  const base = new THREE.Color('#ffffff').lerp(new THREE.Color(loc.palette.skyHorizon), 0.25);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = radius * (0.4 + r() * 1.1);
    const x = center.x + Math.cos(a) * d, z = center.z + Math.sin(a) * d, y = 140 + r() * 90;
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const s = 18 + r() * 22;
      M.add('ico1', { x: x + (k - n / 2) * s * 0.6, y: y + r() * 6, z: z + (r() - 0.5) * s * 0.6, sx: s * 1.4, sy: s * 0.55, sz: s }, base.clone().multiplyScalar(0.92 + r() * 0.08));
    }
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 });
  const mesh = new THREE.Mesh(M.build(), mat);
  mesh.renderOrder = 0;
  return mesh;
}

// Far silhouettes on the horizon: mountains, dunes, skylines. Drawn without
// fog, with the haze baked into their colours.
export function makeBackdrop(loc, center, radius) {
  const r = rng(loc.circuit.seed * 17 + 9);
  const M = new Merger();
  const fog = new THREE.Color(loc.palette.fog);
  const haze = (c, k) => new THREE.Color(c).lerp(fog, k);
  const R = radius + 560;
  const ring = (count, fn) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.1;
      fn(center.x + Math.cos(a) * R * (0.9 + r() * 0.25), center.z + Math.sin(a) * R * (0.9 + r() * 0.25), a, i);
    }
  };
  switch (loc.theme) {
    case 'alps':
    case 'iceland': {
      const rock = loc.theme === 'alps' ? '#6a7890' : '#2a3a44';
      ring(34, (x, z) => {
        const h = 150 + r() * 260, w = 160 + r() * 200;
        M.add('cone', { x, y: -10, z, sx: w, sy: h, sz: w * 0.8, ry: r() * 6 }, haze(rock, 0.45));
        M.add('cone', { x, y: -10 + h * 0.62, z, sx: w * 0.38, sy: h * 0.38, sz: w * 0.3, ry: r() * 6 }, haze('#f4f8ff', 0.3));
      });
      if (loc.theme === 'iceland') {
        // A glowing volcano.
        const a = 1.1, x = center.x + Math.cos(a) * R * 0.8, z = center.z + Math.sin(a) * R * 0.8;
        M.add('frustum', { x, y: -10, z, sx: 420, sy: 260, sz: 420 }, haze('#1a2228', 0.35));
      }
      break;
    }
    case 'kyoto':
    case 'rio': {
      const col = loc.theme === 'kyoto' ? '#4a6a5a' : '#3a8a4a';
      ring(28, (x, z) => {
        const h = 90 + r() * 140, w = 220 + r() * 200;
        M.add('dome', { x, y: -20, z, sx: w, sy: h * 2, sz: w * 0.8 }, haze(col, 0.5));
      });
      break;
    }
    case 'sahara': {
      ring(30, (x, z) => {
        const h = 50 + r() * 70, w = 260 + r() * 200;
        M.add('dome', { x, y: -15, z, sx: w, sy: h * 2, sz: w * 0.7, ry: r() * 6 }, haze('#e8a860', 0.45));
      });
      break;
    }
    case 'outback': {
      ring(22, (x, z) => {
        const h = 20 + r() * 40, w = 300 + r() * 200;
        M.add('dome', { x, y: -10, z, sx: w, sy: h * 2, sz: w * 0.6 }, haze('#b05a30', 0.5));
      });
      break;
    }
    case 'paris':
    case 'tokyo':
    case 'newyork': {
      const col = loc.night ? '#1a1a2e' : '#8a90a0';
      ring(120, (x, z, a) => {
        const h = (loc.theme === 'paris' ? 20 : 60) + r() * (loc.theme === 'paris' ? 30 : 160);
        const w = 30 + r() * 40;
        M.add('boxb', { x, y: -5, z, sx: w, sy: h, sz: w, ry: -a }, haze(col, loc.night ? 0.2 : 0.5));
      });
      break;
    }
    default:
  }
  if (!M.count) return null;
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  return new THREE.Mesh(M.build(), mat);
}

// Night skylines get lit windows: a second, emissive backdrop layer.
export function makeSkylineLights(loc, center, radius) {
  if (!loc.night || !['tokyo', 'newyork'].includes(loc.theme)) return null;
  const r = rng(loc.circuit.seed * 19 + 3);
  const M = new Merger();
  const R = radius + 540;
  const colors = loc.theme === 'tokyo' ? ['#ff4aa8', '#4ae8ff', '#ffe46a', '#ffb0e0'] : ['#ffd88a', '#fff0c0', '#ffc070'];
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, d = R * (0.85 + r() * 0.2);
    M.add('box', { x: center.x + Math.cos(a) * d, y: 10 + r() * 120, z: center.z + Math.sin(a) * d, sx: 3 + r() * 6, sy: 1.5 + r() * 4, sz: 3 + r() * 6, ry: -a }, colors[i % colors.length]);
  }
  return new THREE.Mesh(M.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
}
