import * as THREE from 'three';
import { LOCATIONS } from '../locations.js';
import { makeCarObject, wheelGeometry, setCarPaint } from './cars.js';
import { clamp, lerp, rng } from '../math.js';

// The menu scene: a spinning low-poly globe with a pin for every race
// location, a dashed route for the chosen cup, and a garage turntable.

// Rough continents as [lon, lat] outlines. Stylised, not cartographic.
const LAND = [
  [[-168, 66], [-160, 71], [-140, 70], [-125, 70], [-95, 72], [-80, 73], [-65, 62], [-60, 55], [-56, 52], [-66, 45], [-70, 42], [-76, 35], [-81, 31], [-80, 25], [-82, 27], [-84, 30], [-90, 29], [-97, 26], [-97, 22], [-92, 18], [-87, 21], [-88, 15], [-83, 9], [-78, 8], [-80, 7], [-85, 10], [-92, 14], [-105, 20], [-110, 23], [-112, 30], [-117, 32], [-124, 40], [-125, 49], [-133, 56], [-147, 60], [-155, 58], [-165, 60]],
  [[-55, 60], [-45, 60], [-20, 70], [-18, 77], [-30, 83], [-60, 82], [-72, 78], [-58, 70]],
  [[-80, 8], [-72, 12], [-62, 11], [-52, 5], [-35, -5], [-38, -13], [-41, -22], [-48, -26], [-58, -34], [-63, -41], [-66, -47], [-68, -53], [-72, -53], [-74, -45], [-73, -36], [-71, -26], [-70, -18], [-76, -14], [-81, -5], [-80, 0], [-77, 4]],
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [9, 57], [5, 59], [5, 62], [12, 66], [18, 70], [28, 71], [40, 67], [42, 60], [30, 55], [30, 48], [40, 46], [36, 42], [28, 41], [26, 38], [22, 37], [20, 40], [16, 38], [12, 44], [8, 44], [3, 42], [0, 39], [-5, 36]],
  [[-6, 50], [2, 51], [1, 53], [-2, 56], [-3, 58.6], [-6, 58], [-5, 55], [-3, 54], [-5, 52]],
  [[-10, 52], [-6, 52], [-6, 55], [-10, 54]],
  [[-24, 64], [-14, 64], [-14, 66], [-22, 66.5]],
  [[-17, 21], [-13, 28], [-6, 36], [10, 37], [11, 33], [20, 31], [32, 31], [34, 28], [43, 12], [51, 12], [51, 10], [41, -2], [40, -11], [35, -24], [32, -29], [27, -34], [20, -35], [18, -32], [12, -18], [13, -9], [9, -1], [9, 4], [5, 6], [-8, 4], [-13, 8], [-17, 14]],
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  [[26, 40], [36, 36], [35, 32], [35, 28], [43, 13], [52, 16], [57, 23], [56, 27], [50, 30], [57, 25], [62, 25], [67, 24], [73, 20], [77, 8], [80, 15], [88, 22], [92, 21], [94, 16], [98, 8], [103, 1], [104, 10], [109, 12], [106, 21], [110, 21], [117, 24], [121, 30], [122, 37], [118, 39], [122, 40], [126, 38], [129, 35], [130, 43], [140, 48], [142, 54], [135, 55], [141, 59], [150, 59], [156, 51], [160, 54], [162, 60], [170, 60], [180, 65], [180, 70], [160, 70], [140, 72], [113, 74], [100, 78], [80, 73], [67, 69], [60, 70], [50, 68], [42, 67], [40, 67], [42, 60], [30, 55], [30, 48], [40, 46], [36, 42], [28, 41]],
  [[130, 31], [132, 34], [136, 34], [140, 35], [141, 38], [142, 41], [141, 45], [145, 44], [142, 40], [140, 36], [136, 33]],
  [[95, 5], [106, -6], [104, -6], [95, 2]],
  [[109, 1], [114, 4], [119, 6], [118, 0], [116, -4], [110, -3]],
  [[131, -1], [141, -3], [150, -10], [141, -9], [134, -4]],
  [[105, -6], [114, -7], [114, -8.5], [105, -7.5]],
  [[120, 18], [122, 18], [126, 7], [122, 7]],
  [[114, -22], [114, -34], [118, -35], [124, -33], [131, -31], [138, -35], [141, -38], [146, -39], [150, -37], [153, -31], [153, -25], [146, -19], [142, -11], [141, -17], [136, -12], [130, -12], [126, -14], [122, -17]],
  [[172, -35], [175, -37], [178, -38], [174, -41], [172, -41]],
  [[167, -46], [170, -46], [174, -41], [172, -41]],
];

function inPoly(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function isLand(lat, lon) {
  if (lat < -68) return true;
  return LAND.some((p) => inPoly(lon, lat, p));
}

export function latLonToVec(lat, lon, r = 1, out = new THREE.Vector3()) {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return out.set(Math.cos(la) * Math.cos(lo) * r, Math.sin(la) * r, -Math.cos(la) * Math.sin(lo) * r);
}

const R = 10;

function landColor(lat, lon, n) {
  const a = Math.abs(lat);
  if (a > 62 || lat < -60) return new THREE.Color('#eef4fb');
  const desert = (a > 14 && a < 33 && ((lon > -18 && lon < 60) || (lon > 113 && lon < 145 && lat < 0))) || (lat > 30 && lat < 48 && lon > 60 && lon < 110);
  if (desert) return new THREE.Color('#e8c27a').lerp(new THREE.Color('#d8a860'), n);
  if (a < 12) return new THREE.Color('#2fa84a').lerp(new THREE.Color('#228a3a'), n);
  return new THREE.Color('#6ac85a').lerp(new THREE.Color('#4aa84a'), n);
}

function buildGlobeGeometry() {
  const geo = new THREE.IcosahedronGeometry(R, 22);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const r = rng(42);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    m.copy(a).add(b).add(c).normalize();
    const lat = (Math.asin(m.y) * 180) / Math.PI;
    const lon = (Math.atan2(-m.z, m.x) * 180) / Math.PI;
    const land = isLand(lat, lon);
    const n = r();
    const col = land ? landColor(lat, lon, n) : new THREE.Color('#2a7ad8').lerp(new THREE.Color('#1a5ab8'), n * 0.5 + Math.abs(lat) / 180);
    const lift = land ? 1.018 : 1;
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k];
      v.multiplyScalar(lift);
      pos.setXYZ(i + k, v.x, v.y, v.z);
      colors.set([col.r, col.g, col.b], (i + k) * 3);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export class MenuScene {
  constructor(renderer, { reduced = false } = {}) {
    this.renderer = renderer;
    this.reduced = reduced;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#0c1030');
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
    this.camera.position.set(0, 2, 34);

    scene.add(new THREE.HemisphereLight('#bcd8ff', '#20203a', 1.2));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(-30, 20, 30);
    scene.add(sun);

    this.globe = new THREE.Group();
    scene.add(this.globe);
    const earth = new THREE.Mesh(buildGlobeGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.globe.add(earth);

    // Atmosphere glow.
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 40, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(vec3(0.35,0.65,1.0)*f*1.4, f); }',
    }));
    scene.add(atmo);

    // Clouds: little puffs orbiting just above the surface.
    const cloudGroup = new THREE.Group();
    const cr = rng(7);
    const puff = new THREE.IcosahedronGeometry(0.22, 1);
    const cloudMesh = new THREE.InstancedMesh(puff, new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#9aa4b8', transparent: true, opacity: 0.8 }), 90);
    const mm = new THREE.Matrix4(), vv = new THREE.Vector3(), qq = new THREE.Quaternion(), ss = new THREE.Vector3();
    for (let i = 0; i < 90; i++) {
      latLonToVec(cr() * 140 - 70, cr() * 360 - 180, R * 1.07, vv);
      qq.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vv.clone().normalize());
      ss.set(1 + cr() * 2.5, 0.35, 0.8 + cr() * 1.5);
      cloudMesh.setMatrixAt(i, mm.compose(vv, qq, ss));
    }
    cloudGroup.add(cloudMesh);
    this.globe.add(cloudGroup);
    this.clouds = cloudGroup;

    // Pins.
    this.pins = LOCATIONS.map((loc) => {
      const g = new THREE.Group();
      const dir = latLonToVec(loc.lat, loc.lon, 1);
      const color = new THREE.Color(loc.palette.curbA);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: '#f4f4f4' }));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshBasicMaterial({ color }));
      head.position.y = 1.05;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.position.y = 0.03;
      g.add(stem, head, ring);
      g.position.copy(dir).multiplyScalar(R * 1.01);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.globe.add(g);
      return { loc, group: g, head, ring, dir };
    });

    // Route line for the selected cup.
    this.route = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: '#ffe46a', dashSize: 0.35, gapSize: 0.25 }));
    this.globe.add(this.route);

    // Stars.
    const sr = rng(3), starPos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const v = new THREE.Vector3(sr() - 0.5, sr() - 0.5, sr() - 0.5).normalize().multiplyScalar(250 + sr() * 100);
      starPos.set([v.x, v.y, v.z], i * 3);
    }
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)), new THREE.PointsMaterial({ color: '#ffffff', size: 1.2, sizeAttenuation: false }));
    scene.add(stars);

    // Garage: a turntable off to the side.
    this.garage = new THREE.Group();
    this.garage.position.set(120, 0, 0);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.4, 40), new THREE.MeshPhongMaterial({ color: '#2a2e4a', shininess: 60 }));
    disc.position.y = -0.2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.35, 0.08, 6, 60).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3fe5ff' }));
    rim.position.y = 0.02;
    this.garage.add(disc, rim);
    const key = new THREE.SpotLight('#ffffff', 300, 40, 0.6, 0.5, 1.5);
    key.position.set(120 + 6, 10, 8);
    key.target.position.set(120, 0, 0);
    scene.add(key, key.target);
    scene.add(this.garage);
    this.wheelMesh = new THREE.InstancedMesh(wheelGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), 4);
    this.garage.add(this.wheelMesh);
    this.car = null;

    this.view = 'globe'; // globe | garage
    this.target = { rx: 0.3, ry: 0 };
    this.focus = null;
    this.spin = !reduced;
    this.time = 0;
    this.camPos = new THREE.Vector3(0, 2, 34);
    this.camLook = new THREE.Vector3();
    this.layout = { x: 0, y: 0, dist: 34 };
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Put the globe beside the menu card on wide screens, above it on tall.
    if (w / h > 1.15) this.layout = { x: -11, y: 0, dist: 46 };
    else this.layout = { x: 0, y: -12, dist: 58 };
  }

  // Rotates the globe to bring a location to the front.
  focusOn(locId) {
    const pin = this.pins.find((p) => p.loc.id === locId);
    if (!pin) { this.focus = null; return; }
    this.focus = pin;
    const { lat, lon } = pin.loc;
    const az = Math.atan2(Math.cos((lat * Math.PI) / 180) * Math.cos((lon * Math.PI) / 180), -Math.cos((lat * Math.PI) / 180) * Math.sin((lon * Math.PI) / 180));
    this.target = { rx: (lat * Math.PI) / 180 * 0.8, ry: -az };
  }

  showRoute(locIds) {
    const pts = [];
    for (let i = 0; i < locIds.length - 1; i++) {
      const a = this.pins.find((p) => p.loc.id === locIds[i]).dir, b = this.pins.find((p) => p.loc.id === locIds[i + 1]).dir;
      const steps = 40;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const v = new THREE.Vector3().copy(a).lerp(b, t).normalize();
        if (v.lengthSq() < 0.5) v.set(a.x + b.x, a.y + b.y + 0.01, a.z + b.z).normalize();
        pts.push(v.multiplyScalar(R * (1.04 + Math.sin(t * Math.PI) * 0.12)));
      }
    }
    this.route.geometry.dispose();
    this.route.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.route.computeLineDistances();
    this.route.visible = pts.length > 1;
  }

  setCar(type, paint, accent) {
    if (this.car && this.car.userData.type === type) {
      setCarPaint(this.car, paint, accent);
      return;
    }
    if (this.car) this.garage.remove(this.car);
    this.car = makeCarObject(type, paint, accent);
    this.garage.add(this.car);
  }

  showGarage(on) {
    this.view = on ? 'garage' : 'globe';
  }

  update(dt) {
    this.time += dt;
    const g = this.globe;
    if (!this.focus && this.spin) this.target.ry += dt * 0.12;
    let dy = this.target.ry - g.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    g.rotation.y += dy * Math.min(1, dt * 2.5);
    g.rotation.x += (this.target.rx - g.rotation.x) * Math.min(1, dt * 2.5);
    this.clouds.rotation.y += dt * 0.02;
    for (const p of this.pins) {
      const on = p === this.focus;
      const s = on ? 1.5 + Math.sin(this.time * 5) * 0.15 : 1;
      p.head.scale.setScalar(s);
      p.ring.scale.setScalar(on ? 1.4 + ((this.time * 1.5) % 1) * 1.6 : 1);
      p.ring.material.opacity = on ? 0.9 * (1 - ((this.time * 1.5) % 1)) : 0.6;
    }
    // Camera.
    let pos, look;
    if (this.view === 'garage') {
      const a = this.time * 0.3;
      pos = new THREE.Vector3(120 + Math.sin(a) * 2 + 7, 3.4, 9);
      look = new THREE.Vector3(120 - (this.camera.aspect > 1.15 ? 2.5 : 0), 0.9, this.camera.aspect > 1.15 ? 0 : -1.5);
      if (this.camera.aspect <= 1.15) pos.set(120 + 6, 6, 12);
      if (this.car) this.car.rotation.y = this.time * 0.5;
    } else {
      const L = this.layout;
      pos = new THREE.Vector3(L.x, L.y + 2, L.dist);
      look = new THREE.Vector3(L.x, L.y, 0);
    }
    const k = Math.min(1, dt * 3);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // Garage wheels.
    if (this.car) {
      this.car.updateMatrixWorld();
      const m = new THREE.Matrix4(), w4 = new THREE.Matrix4();
      const inv = new THREE.Matrix4().copy(this.garage.matrixWorld).invert();
      this.car.userData.wheels.forEach((w, i) => {
        m.compose(new THREE.Vector3(w.x, w.r, w.z), new THREE.Quaternion(), new THREE.Vector3(w.w, w.r * 2, w.r * 2));
        w4.multiplyMatrices(this.car.matrixWorld, m).premultiply(inv);
        this.wheelMesh.setMatrixAt(i, w4);
      });
      this.wheelMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Screen-space positions of visible pins for HTML labels.
  pinScreen(out) {
    const cam = this.camera;
    const v = new THREE.Vector3(), toCam = new THREE.Vector3();
    out.length = 0;
    for (const p of this.pins) {
      p.head.getWorldPosition(v);
      toCam.copy(cam.position).sub(v);
      const n = v.clone().normalize();
      const facing = n.dot(toCam.normalize());
      const s = v.project(cam);
      out.push({ id: p.loc.id, x: s.x, y: s.y, visible: facing > 0.15 && this.view === 'globe' });
    }
    return out;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

export { clamp, lerp };
