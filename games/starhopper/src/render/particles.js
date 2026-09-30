import * as THREE from 'three';

// A pool of soft round particles drawn as one Points object. Sizes are in
// world meters.
export class Particles {
  constructor(max, { additive = false } = {}) {
    this.max = max;
    this.count = 0;
    this.items = [];
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
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 400 } },
      vertexShader: /* glsl */ `
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
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.1, d));
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  emit(x, y, z, { vx = 0, vy = 0, vz = 0, life = 1, size = 1, grow = 0, color = '#ffffff', alpha = 1, gravity = 0, drag = 0 }) {
    if (this.items.length >= this.max) this.items.shift();
    const c = new THREE.Color(color);
    this.items.push({ x, y, z, vx, vy, vz, life, max: life, size, grow, r: c.r, g: c.g, b: c.b, alpha, gravity, drag });
  }

  update(dt) {
    let n = 0;
    this.items = this.items.filter((p) => (p.life -= dt) > 0);
    for (const p of this.items) {
      p.vy -= p.gravity * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = 1 - p.life / p.max;
      this.positions[n * 3] = p.x; this.positions[n * 3 + 1] = p.y; this.positions[n * 3 + 2] = p.z;
      this.colors[n * 3] = p.r; this.colors[n * 3 + 1] = p.g; this.colors[n * 3 + 2] = p.b;
      this.sizes[n] = p.size + p.grow * t;
      this.alphas[n] = p.alpha * (1 - t) * Math.min(1, t * 8 + 0.3);
      n++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    for (const name of ['position', 'color', 'size', 'alpha']) geo.attributes[name].needsUpdate = true;
  }

  setViewport(height, fov) {
    this.material.uniforms.scale.value = height / (2 * Math.tan((fov * Math.PI) / 360));
  }
}
