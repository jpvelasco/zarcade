import { rng } from './math.js';

// The space lane: a gently winding centerline through world space. The
// simulation works in lane coordinates (s along, u sideways, w up); this maps
// them to world positions for rendering. Pure math, no Three.js.
export class Lane {
  constructor(seed) {
    const r = rng(seed * 13 + 5);
    this.wx = [0, 1, 2].map((i) => ({ k: (Math.PI * 2) / (1400 + r() * 1600) / (1 + i * 0.6), a: (110 + r() * 90) / (1 + i * 1.4), p: r() * 6.28 }));
    this.wy = [0, 1].map((i) => ({ k: (Math.PI * 2) / (1800 + r() * 1500) / (1 + i * 0.7), a: (45 + r() * 40) / (1 + i), p: r() * 6.28 }));
  }

  center(s) {
    let x = 0, y = 0;
    for (const w of this.wx) x += Math.sin(s * w.k + w.p) * w.a;
    for (const w of this.wy) y += Math.sin(s * w.k + w.p) * w.a;
    return { x, y, z: s };
  }

  // Orthonormal frame at s: T forward, R right on screen, U up.
  frame(s) {
    const a = this.center(s - 1), b = this.center(s + 1);
    let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
    const tl = Math.hypot(tx, ty, tz);
    tx /= tl; ty /= tl; tz /= tl;
    // R = T x worldUp, U = R x T
    let rx = -tz, ry = 0, rz = tx;
    const rl = Math.hypot(rx, ry, rz);
    rx /= rl; rz /= rl;
    const ux = ry * tz - rz * ty, uy = rz * tx - rx * tz, uz = rx * ty - ry * tx;
    return { T: { x: tx, y: ty, z: tz }, R: { x: rx, y: ry, z: rz }, U: { x: ux, y: uy, z: uz }, P: this.center(s) };
  }

  toWorld(s, u = 0, w = 0, f = this.frame(s)) {
    return {
      x: f.P.x + f.R.x * u + f.U.x * w,
      y: f.P.y + f.R.y * u + f.U.y * w,
      z: f.P.z + f.R.z * u + f.U.z * w,
    };
  }
}
