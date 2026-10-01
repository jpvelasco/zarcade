import * as THREE from 'three';

// Effects that never allocate per frame: a ring-buffer particle pool on the
// CPU, and weather animated entirely on the GPU.

const POINT_VERT = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 color;
  uniform float scale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = alpha;
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const POINT_FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.15, d));
    #include <colorspace_fragment>
  }`;

const tmp = new THREE.Color();

export class Particles {
  constructor(max, { additive = false } = {}) {
    this.max = max;
    this.next = 0;
    // Per particle: x y z vx vy vz life max size grow r g b alpha gravity drag
    this.data = new Float32Array(max * 16);
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 400 } },
      vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.alive = 0;
  }

  // color is a THREE.Color or a hex string (cached colors avoid parsing).
  emit(x, y, z, vx, vy, vz, life, size, color, alpha = 1, gravity = 0, drag = 0, grow = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const d = this.data, o = i * 16;
    const c = typeof color === 'string' ? tmp.set(color) : color;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = life; d[o + 7] = life; d[o + 8] = size; d[o + 9] = grow;
    d[o + 10] = c.r; d[o + 11] = c.g; d[o + 12] = c.b; d[o + 13] = alpha; d[o + 14] = gravity; d[o + 15] = drag;
  }

  update(dt) {
    const d = this.data;
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const o = i * 16;
      if (d[o + 6] <= 0) continue;
      d[o + 6] -= dt;
      if (d[o + 6] <= 0) continue;
      d[o + 4] -= d[o + 14] * dt;
      const k = d[o + 15] ? Math.exp(-d[o + 15] * dt) : 1;
      d[o + 3] *= k; d[o + 4] *= k; d[o + 5] *= k;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      const t = 1 - d[o + 6] / d[o + 7];
      this.positions[n * 3] = d[o]; this.positions[n * 3 + 1] = d[o + 1]; this.positions[n * 3 + 2] = d[o + 2];
      this.colors[n * 3] = d[o + 10]; this.colors[n * 3 + 1] = d[o + 11]; this.colors[n * 3 + 2] = d[o + 12];
      this.sizes[n] = d[o + 8] + d[o + 9] * t;
      this.alphas[n] = d[o + 13] * (1 - t) * Math.min(1, t * 10 + 0.3);
      n++;
    }
    this.alive = n;
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    if (n) for (const name of ['position', 'color', 'size', 'alpha']) {
      const attr = geo.attributes[name];
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * attr.itemSize);
      attr.needsUpdate = true;
    }
    this.points.visible = n > 0;
  }

  setViewport(height, fov) {
    this.material.uniforms.scale.value = height / (2 * Math.tan((fov * Math.PI) / 360));
  }
}

// ---------------------------------------------------------------- weather

const WEATHER = {
  rain: { count: 1400, lines: true, fall: 26, wind: 2, size: 0, len: 0.06, color: '#a8c8ff', alpha: 0.45, box: 60 },
  drizzle: { count: 600, lines: true, fall: 18, wind: 1, size: 0, len: 0.05, color: '#d8e4ff', alpha: 0.3, box: 60 },
  snow: { count: 1300, fall: 2.4, wind: 1.2, sway: 1.2, size: 0.14, color: '#ffffff', alpha: 0.9, box: 70 },
  sand: { count: 900, fall: 0.4, wind: 14, sway: 0.6, size: 0.09, color: '#f0c890', alpha: 0.55, box: 70 },
  dust: { count: 500, fall: 0.2, wind: 6, sway: 0.5, size: 0.1, color: '#e09a60', alpha: 0.4, box: 70 },
  confetti: { count: 700, fall: 2.2, wind: 0.8, sway: 1.6, size: 0.2, color: 'multi', alpha: 1, box: 60 },
  leaves: { count: 450, fall: 1.6, wind: 1.4, sway: 2, size: 0.28, color: 'autumn', alpha: 0.95, box: 70 },
};

export class Weather {
  constructor(kind, { reduced = false } = {}) {
    const def = WEATHER[kind];
    this.object = null;
    if (!def) return;
    const count = Math.round(def.count * (reduced ? 0.4 : 1));
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const uniforms = {
      time: { value: 0 }, cam: { value: new THREE.Vector3() }, box: { value: def.box },
      fall: { value: def.fall }, wind: { value: def.wind }, sway: { value: def.sway || 0 },
      scale: { value: 400 }, size: { value: def.size }, alpha: { value: def.alpha }, len: { value: def.len || 0 },
      tint: { value: new THREE.Color(def.color === 'multi' || def.color === 'autumn' ? '#ffffff' : def.color) },
      palette: { value: def.color === 'multi' ? 1 : def.color === 'autumn' ? 2 : 0 },
    };
    // Each drop wraps around a box that follows the camera.
    const place = /* glsl */ `
      uniform float time, box, fall, wind, sway, len;
      uniform vec3 cam;
      attribute vec4 seed;
      vec3 placeDrop(float lag) {
        float t = time - lag;
        vec3 p = seed.xyz * box;
        p.y -= t * fall * (0.7 + 0.6 * seed.w);
        p.x += t * wind + sin(t * 1.3 + seed.w * 40.0) * sway;
        p.z += cos(t * 1.1 + seed.w * 30.0) * sway;
        vec3 rel = mod(p - cam + box * 0.5, box) - box * 0.5;
        return cam + rel;
      }`;
    let geo, mat;
    if (def.lines) {
      geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 6), seed2 = new Float32Array(count * 8), end = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < 4; k++) { seed2[i * 8 + k] = seeds[i * 4 + k]; seed2[i * 8 + 4 + k] = seeds[i * 4 + k]; }
        end[i * 2 + 1] = 1;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('seed', new THREE.BufferAttribute(seed2, 4));
      geo.setAttribute('tail', new THREE.BufferAttribute(end, 1));
      mat = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false,
        vertexShader: place + /* glsl */ `
          attribute float tail;
          void main() {
            vec3 p = placeDrop(tail * len);
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 tint; uniform float alpha;
          void main() { gl_FragColor = vec4(tint, alpha); }`,
      });
      this.object = new THREE.LineSegments(geo, mat);
    } else {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
      mat = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false,
        vertexShader: place + /* glsl */ `
          uniform float scale, size;
          uniform int palette;
          varying vec3 vColor;
          varying float vFlip;
          vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
          void main() {
            vec3 p = placeDrop(0.0);
            vec4 mv = viewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            vFlip = palette > 0 ? abs(sin(time * (2.0 + seed.w * 4.0) + seed.x * 20.0)) : 1.0;
            gl_PointSize = size * scale / max(0.5, -mv.z) * (0.6 + 0.8 * seed.w);
            vColor = palette == 1 ? hue(seed.w) * 0.85 + 0.15 : palette == 2 ? mix(vec3(0.95, 0.35, 0.1), vec3(1.0, 0.75, 0.2), seed.w) : vec3(1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 tint; uniform float alpha; uniform int palette;
          varying vec3 vColor; varying float vFlip;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            if (palette > 0) { if (abs(c.y) > 0.5 * vFlip + 0.08) discard; }
            else if (length(c) > 0.5) discard;
            gl_FragColor = vec4(tint * vColor, alpha * (palette > 0 ? 1.0 : smoothstep(0.5, 0.2, length(c))));
            #include <colorspace_fragment>
          }`,
      });
      this.object = new THREE.Points(geo, mat);
    }
    this.object.frustumCulled = false;
    this.uniforms = uniforms;
  }

  update(time, camera, height) {
    if (!this.object) return;
    this.uniforms.time.value = time;
    this.uniforms.cam.value.copy(camera.position);
    this.uniforms.scale.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }
}
