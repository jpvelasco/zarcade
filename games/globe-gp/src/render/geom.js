import * as THREE from 'three';

// Low-poly building blocks merged into a few big vertex-coloured meshes, so a
// whole town of scenery costs one or two draw calls.

const protos = new Map();

function toProto(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return { pos: g.attributes.position.array, nor: g.attributes.normal.array };
}

// Cached unit primitives, all non-indexed.
export function proto(name) {
  if (protos.has(name)) return protos.get(name);
  let geo;
  switch (name) {
    case 'box': geo = new THREE.BoxGeometry(1, 1, 1); break;                        // centered
    case 'boxb': geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0); break;   // base at y=0
    case 'cyl': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0); break;
    case 'cyl6': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0); break;
    case 'cyl12': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0); break;
    case 'cone': geo = new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0); break;
    case 'cone4': geo = new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0); break;
    case 'cone12': geo = new THREE.ConeGeometry(0.5, 1, 12).translate(0, 0.5, 0); break;
    case 'frustum': geo = new THREE.CylinderGeometry(0.3, 0.5, 1, 8).translate(0, 0.5, 0); break;
    case 'frustum4': geo = new THREE.CylinderGeometry(0.35, 0.7071, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0); break;
    case 'ico': geo = new THREE.IcosahedronGeometry(0.5, 0); break;
    case 'ico1': geo = new THREE.IcosahedronGeometry(0.5, 1); break;
    case 'sphere': geo = new THREE.SphereGeometry(0.5, 10, 7); break;
    case 'dome': geo = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); break;
    case 'torus': geo = new THREE.TorusGeometry(0.4, 0.1, 5, 10); break;
    case 'prism': { // roof: triangle cross-section along z, base y=0, width 1, height 1
      const s = new THREE.Shape();
      s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.closePath();
      geo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
      break;
    }
    case 'wedge': { // ramp: rises along +z from 0 to 1
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(1, 0); s.lineTo(1, 1); s.closePath();
      geo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.5, 0, 0);
      break;
    }
    case 'plane': geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); break;
    case 'quad': geo = new THREE.PlaneGeometry(1, 1); break; // facing +z
    default: throw new Error(`unknown proto ${name}`);
  }
  const p = toProto(geo);
  protos.set(name, p);
  return p;
}

const m4 = new THREE.Matrix4();
const n3 = new THREE.Matrix3();
const v = new THREE.Vector3();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const sc = new THREE.Vector3();
const pos = new THREE.Vector3();
const col = new THREE.Color();

export class Merger {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
  }

  get count() {
    return this.pos.length / 3;
  }

  // Adds a primitive. t: { x, y, z, sx, sy, sz, rx, ry, rz } or a Matrix4.
  add(name, t, color, shade = 0) {
    const p = proto(name);
    let m;
    if (t.isMatrix4) m = t;
    else {
      pos.set(t.x || 0, t.y || 0, t.z || 0);
      sc.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
      e.set(t.rx || 0, t.ry || 0, t.rz || 0, 'YXZ');
      q.setFromEuler(e);
      m = m4.compose(pos, q, sc);
    }
    n3.getNormalMatrix(m);
    col.set(color);
    const { r, g, b } = col;
    for (let i = 0; i < p.pos.length; i += 3) {
      v.set(p.pos[i], p.pos[i + 1], p.pos[i + 2]).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
      v.set(p.nor[i], p.nor[i + 1], p.nor[i + 2]).applyMatrix3(n3).normalize();
      this.nor.push(v.x, v.y, v.z);
      // A little shading toward the bottom gives depth without lights.
      const k = shade ? 1 - shade * (1 - Math.min(1, (p.pos[i + 1] + 0.5))) : 1;
      this.col.push(r * k, g * k, b * k);
    }
    return this;
  }

  // Raw triangle with per-vertex colors.
  tri(a, b, c, ca, cb = ca, cc = ca) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const [p, cl] of [[a, ca], [b, cb], [c, cc]]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(cl.r, cl.g, cl.b);
    }
  }

  // Quad a-b-c-d (counter-clockwise seen from the front).
  quad(a, b, c, d, ca, cb = ca, cc = cb, cd = ca) {
    this.tri(a, b, c, ca, cb, cc);
    this.tri(a, c, d, ca, cc, cd);
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

// Grid of mergers keyed by world position, so scenery is cut into chunks
// that the camera can cull (and drop at distance).
export class CellMergers {
  constructor(size = 160) {
    this.size = size;
    this.cells = new Map();
  }

  at(x, z, layer = 'solid') {
    const key = `${Math.floor(x / this.size)},${Math.floor(z / this.size)},${layer}`;
    let m = this.cells.get(key);
    if (!m) this.cells.set(key, (m = new Merger()));
    return m;
  }

  // One mesh per non-empty cell and layer, built lazily so the caller can
  // spread the work over frames. materials: { layer: Material }.
  *buildEach(materials, group, { detailLayers = [] } = {}) {
    for (const [key, m] of this.cells) {
      if (!m.count) continue;
      const layer = key.split(',')[2];
      const mesh = new THREE.Mesh(m.build(), materials[layer]);
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = layer === 'solid';
      mesh.userData.detail = detailLayers.includes(layer);
      group.add(mesh);
      yield mesh;
    }
  }
}

export const tmpColor = new THREE.Color();
export function mixColor(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}
