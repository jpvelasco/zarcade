import * as THREE from 'three';
import { BIOMES } from '../biomes.js';
import { HAZARDS, PLAYER } from '../entities.js';
import { clamp } from '../math.js';
import { Particles } from './particles.js';
import { makeSky, makeStars, makePlanet, makeBeacons, SpaceDust, makeTunnel, sunDirection } from './space.js';
import {
  makeJet, makeCockpit, makeFighter, makeGhost, makeDrone, makeTurret, makeCruiser, makeMine,
  makeAsteroidGeometries, makeWreck, makeBoss, makeBurgerJoint, makeDriveThru, makePickup, PICKUP_COLORS,
} from './models.js';

const DRAW_AHEAD = 1600;
const PLANET_RADIUS = 3200;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Y = new THREE.Vector3(0, 1, 0), AXIS_Z = new THREE.Vector3(0, 0, 1);

const v3 = (o) => _p.set(o.x, o.y, o.z);

// Rotation that points an object's +z along the lane (or back at the jet).
function laneQuat(f, facing = 1, out = new THREE.Quaternion()) {
  if (facing > 0) _m.makeBasis(_x.set(-f.R.x, -f.R.y, -f.R.z), _y.set(f.U.x, f.U.y, f.U.z), _z.set(f.T.x, f.T.y, f.T.z));
  else _m.makeBasis(_x.set(f.R.x, f.R.y, f.R.z), _y.set(f.U.x, f.U.y, f.U.z), _z.set(-f.T.x, -f.T.y, -f.T.z));
  return out.setFromRotationMatrix(_m);
}

// Draws one World. Reads the simulation; never changes it.
export class JourneyView {
  constructor(renderer, world, { paint, view }) {
    this.renderer = renderer;
    this.world = world;
    this.lane = world.lane;
    this.viewMode = view;
    const biome = BIOMES[world.planet.biome];
    const pal = (this.palette = biome.palette);
    this.time = 0;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(pal.space);
    scene.fog = new THREE.Fog(pal.space, 900, 2600);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.3, 90000);
    scene.add(this.camera);

    this.sunDir = sunDirection(world.planet.seed);
    this.sky = makeSky(pal, this.sunDir);
    this.stars = makeStars(pal, world.planet.seed);
    scene.add(this.sky, this.stars);
    // Space is dark, but kids need to see the rocks: generous fill light.
    scene.add(new THREE.HemisphereLight(pal.nebulaB, pal.nebulaA, 1.6));
    scene.add(new THREE.AmbientLight(pal.light, 0.9));
    this.sun = new THREE.DirectionalLight(pal.light, 3);
    scene.add(this.sun, this.sun.target);

    const planetPos = this.lane.toWorld(world.journey.length + 7600, 0, -2600);
    this.planet = makePlanet(pal, world.planet.seed, PLANET_RADIUS, this.sunDir);
    this.planet.position.set(planetPos.x, planetPos.y, planetPos.z);
    scene.add(this.planet);

    scene.add(makeBeacons(this.lane, world.journey.length, pal.accent));
    this.dust = new SpaceDust();
    scene.add(this.dust.lines);
    this.tunnel = makeTunnel();
    scene.add(this.tunnel);

    // The Space Burger stop.
    const b = world.journey.burger;
    this.driveThru = makeDriveThru(b.ring);
    const bf = this.lane.frame(b.s);
    this.driveThru.position.copy(v3(this.lane.toWorld(b.s, b.u, b.w, bf)));
    this.driveThru.quaternion.copy(laneQuat(bf));
    this.burger = makeBurgerJoint();
    const side = b.u > 0 ? 1 : -1;
    this.burger.position.copy(v3(this.lane.toWorld(b.s + 30, b.u + side * 26, b.w - 4)));
    this.burger.quaternion.copy(laneQuat(bf));
    this.burger.rotateX(0.15);
    scene.add(this.driveThru, this.burger);

    this.jet = makeJet(paint);
    scene.add(this.jet);
    this.cockpit = makeCockpit(pal.accent);
    this.camera.add(this.cockpit);

    this.rockGeos = makeAsteroidGeometries();
    this.rockMat = new THREE.MeshStandardMaterial({ color: pal.rock, roughness: 0.95, metalness: 0.05, flatShading: true });
    this.meshes = new Map();
    this.pools = new Map();

    // Instanced bolts and stardust.
    this.playerBolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.14, 4.5, 6).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#7fffd0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 400);
    this.enemyBolts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#ff4a8a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 400);
    this.dustPickups = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.7),
      new THREE.MeshBasicMaterial({ color: PICKUP_COLORS.dust }), 500);
    for (const m of [this.playerBolts, this.enemyBolts, this.dustPickups]) { m.frustumCulled = false; m.count = 0; scene.add(m); }

    this.fire = new Particles(1800, { additive: true });
    this.smoke = new Particles(900);
    scene.add(this.fire.points, this.smoke.points);
    this.flash = new THREE.PointLight('#ffb070', 0, 160, 1.4);
    scene.add(this.flash);

    this.bossMesh = null;
    this.cam = { shake: 0, fov: 72, warp: 0, hurt: 0 };
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.stars.material.uniforms.ratio.value = this.renderer.getPixelRatio();
  }

  worldPos(s, u, w) {
    return this.lane.toWorld(s, u, w);
  }

  // ------------------------------------------------------------ pooling

  acquire(key, make) {
    const pool = this.pools.get(key);
    const m = (pool && pool.pop()) || make();
    if (!m.parent) this.scene.add(m);
    m.visible = true;
    m.userData.poolKey = key;
    return m;
  }

  release(id) {
    const m = this.meshes.get(id);
    if (!m) return;
    m.visible = false;
    const key = m.userData.poolKey;
    if (!this.pools.has(key)) this.pools.set(key, []);
    this.pools.get(key).push(m);
    this.meshes.delete(id);
  }

  meshFor(id, key, make) {
    let m = this.meshes.get(id);
    if (!m) { m = this.acquire(key, make); this.meshes.set(id, m); }
    return m;
  }

  // ------------------------------------------------------------ events

  handleEvents(events) {
    const p = this.world.player;
    for (const e of events) {
      const at = e.s !== undefined ? this.worldPos(e.s, e.u, e.w) : null;
      switch (e.type) {
        case 'explode':
          this.boom(at, e.big ? 2.4 : e.kind === 'missile' ? 1.3 : 1, e.kind === 'ghost' ? '#7affd8' : null);
          if (Math.abs(e.s - p.s) < 80) this.cam.shake = Math.max(this.cam.shake, e.big ? 1 : 0.35);
          break;
        case 'rockBreak': this.rubble(at, e.size); break;
        case 'hit': this.sparks(at, 6, '#ffe07a'); break;
        case 'ping': this.sparks(at, 3, '#9fb8ff'); break;
        case 'deflect': this.sparks(this.worldPos(p.s + 3, p.u, p.w), 10, '#7fe0ff'); break;
        case 'pickup': this.sparkle(at, PICKUP_COLORS[e.kind] || '#fff', e.kind === 'dust' ? 5 : 26); break;
        case 'hurt': this.cam.shake = Math.max(this.cam.shake, 0.5); this.cam.hurt = e.shielded ? -1 : 1; break;
        case 'crash': this.cam.shake = Math.max(this.cam.shake, 1); break;
        case 'shoot': this.muzzle = 0.06; break;
        case 'bossDown': this.bossDown = { t: 0, s: e.s, u: e.u, w: e.w }; break;
        case 'destroyed': this.boom(this.worldPos(p.s, p.u, p.w), 2); this.jet.visible = false; this.cam.shake = 1.2; break;
        case 'missile': this.fire.emit(at.x, at.y, at.z, { life: 0.12, size: 2, color: '#ffc080' }); break;
      }
    }
  }

  boom(at, scale = 1, tint = null) {
    if (!at) return;
    const n = Math.round(40 * scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, h = Math.sqrt(1 - u * u), sp = (6 + Math.random() * 16) * scale;
      this.fire.emit(at.x, at.y, at.z, {
        vx: Math.cos(a) * h * sp, vy: u * sp, vz: Math.sin(a) * h * sp, life: 0.4 + Math.random() * 0.5, size: (1.4 + Math.random() * 2) * scale, grow: 3 * scale,
        color: tint || (Math.random() < 0.5 ? '#ffb347' : '#ff6a2a'), drag: 2.5,
      });
    }
    for (let i = 0; i < n / 2; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, h = Math.sqrt(1 - u * u), sp = (3 + Math.random() * 6) * scale;
      this.smoke.emit(at.x, at.y, at.z, { vx: Math.cos(a) * h * sp, vy: u * sp, vz: Math.sin(a) * h * sp, life: 1.4, size: 2.5 * scale, grow: 6 * scale, color: '#3a3448', alpha: 0.5, drag: 1.2 });
    }
    this.flash.position.copy(at);
    this.flash.intensity = 4000 * scale;
  }

  rubble(at, size) {
    const n = 8 + size * 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, h = Math.sqrt(1 - u * u), sp = 4 + Math.random() * 8;
      this.smoke.emit(at.x, at.y, at.z, { vx: Math.cos(a) * h * sp, vy: u * sp, vz: Math.sin(a) * h * sp, life: 1.2, size: 0.4 + Math.random() * size * 0.4, color: this.palette.rock, alpha: 0.95, drag: 0.8 });
    }
    this.sparks(at, 6, '#ffd08a');
  }

  sparks(at, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, h = Math.sqrt(1 - u * u), sp = 5 + Math.random() * 10;
      this.fire.emit(at.x, at.y, at.z, { vx: Math.cos(a) * h * sp, vy: u * sp, vz: Math.sin(a) * h * sp, life: 0.3, size: 0.35, color });
    }
  }

  sparkle(at, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, h = Math.sqrt(1 - u * u), sp = 3 + Math.random() * 6;
      this.fire.emit(at.x, at.y, at.z, { vx: Math.cos(a) * h * sp, vy: u * sp, vz: Math.sin(a) * h * sp, life: 0.5, size: 0.3, color });
    }
  }

  // ------------------------------------------------------------ per frame

  update(dt) {
    this.time += dt;
    const w = this.world, p = w.player;
    this.syncStatics();
    this.syncEnemies();
    this.syncBoss(dt);
    this.syncPickups();
    this.syncProjectiles();
    this.updateJet(dt);
    this.updateBurger();
    if (this.bossDown) this.bossFinale(dt);

    this.dust.update(dt, this.lane, p.s, p.u, p.w, p.speed);
    this.fire.update(dt);
    this.smoke.update(dt);
    this.flash.intensity *= Math.exp(-dt * 8);

    // Hyperspace.
    const hyper = w.status === 'hyper';
    this.cam.warp += ((hyper ? 1 : 0) - this.cam.warp) * Math.min(1, dt * 3);
    this.tunnel.visible = this.cam.warp > 0.01;
    if (this.tunnel.visible) {
      // Keep the camera on the tunnel's axis: extend straight ahead of the jet.
      const f = this.lane.frame(p.s);
      const at = this.lane.toWorld(p.s, p.u, p.w, f);
      this.tunnel.position.set(at.x + f.T.x * 250, at.y + f.T.y * 250, at.z + f.T.z * 250);
      this.tunnel.quaternion.copy(laneQuat(f));
      this.tunnel.material.uniforms.time.value = this.time;
      this.tunnel.material.uniforms.fade.value = this.cam.warp;
    }
    this.sky.material.uniforms.warp.value = this.cam.warp;

    this.updateCamera(dt);
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    this.sun.position.copy(this.camera.position).addScaledVector(this.sunDir, 500);
    this.sun.target.position.copy(this.camera.position);
    const h = this.renderer.domElement.height;
    this.fire.setViewport(h, this.camera.fov);
    this.smoke.setViewport(h, this.camera.fov);
  }

  place(obj, s, u, w, facing = 1) {
    const f = this.lane.frame(s);
    obj.position.copy(v3(this.lane.toWorld(s, u, w, f)));
    laneQuat(f, facing, obj.quaternion);
    return f;
  }

  syncStatics() {
    const p = this.world.player;
    const seen = new Set();
    for (const o of this.world.statics) {
      if (!o.alive || o.s < p.s - 60 || o.s > p.s + DRAW_AHEAD) continue;
      seen.add(o.id);
      if (o.kind === 'asteroid') {
        const m = this.meshFor(o.id, `rock${o.id % 4}`, () => new THREE.Mesh(this.rockGeos[o.id % 4], this.rockMat));
        this.place(m, o.s, o.u, o.w);
        m.scale.setScalar(HAZARDS.asteroid[o.size].r);
        m.rotateX(this.time * (o.spin || 0.3) + o.id);
        m.rotateY(this.time * (o.spin || 0.3) * 0.7);
      } else if (o.kind === 'mine') {
        const m = this.meshFor(o.id, 'mine', makeMine);
        this.place(m, o.s, o.u, o.w);
        m.rotateY(this.time);
        m.userData.light.visible = Math.sin(this.time * 8 + o.id) > 0;
      } else if (o.kind === 'wreck') {
        const m = this.meshFor(o.id, `wreck${o.id}`, () => makeWreck(o.size));
        this.place(m, o.s, o.u, o.w);
        m.rotateZ(o.rot);
      }
    }
    for (const [id, m] of this.meshes) {
      const k = m.userData.poolKey;
      if ((k.startsWith('rock') || k === 'mine' || k.startsWith('wreck')) && !seen.has(id)) this.release(id);
    }
  }

  syncEnemies() {
    const w = this.world, p = w.player;
    const seen = new Set();
    for (const e of w.enemies) {
      if (!e.alive || e.boss || e.s > p.s + DRAW_AHEAD) continue;
      seen.add(e.id);
      if (e.kind === 'fighter') {
        const m = this.meshFor(e.id, 'fighter', () => makeFighter());
        this.place(m, e.s, e.u, e.w, e.state === 'leave' ? 1 : -1);
        m.scale.setScalar(1.7);
        m.rotateZ(Math.sin(e.age * 2 + e.phase) * 0.4);
      } else if (e.kind === 'ghost') {
        const m = this.meshFor(e.id, 'ghost', makeGhost);
        this.place(m, e.s, e.u, e.w, -1);
        m.scale.setScalar(1.7);
        const target = e.visible ? 0.55 : 0.04;
        const mat = m.userData.ghostMat;
        mat.opacity += (target - mat.opacity) * 0.15;
        mat.opacity *= 0.9 + Math.random() * 0.2;
      } else if (e.kind === 'drone') {
        const m = this.meshFor(e.id, 'drone', makeDrone);
        this.place(m, e.s, e.u, e.w, -1);
        m.scale.setScalar(1.7);
        m.rotateZ(this.time * 3);
      } else if (e.kind === 'turret') {
        const m = this.meshFor(e.id, 'turret', makeTurret);
        this.place(m, e.s, e.u, e.w, 1);
        m.userData.head.lookAt(this.camera.position);
      } else if (e.kind === 'cruiser') {
        const m = this.meshFor(e.id, `cruiser${e.id}`, () => makeCruiser(this.palette.accent));
        this.place(m, e.s, e.u, e.w, 1);
      }
    }
    for (const [id, m] of this.meshes) {
      const k = m.userData.poolKey;
      if (['fighter', 'ghost', 'drone', 'turret'].includes(k) || k.startsWith('cruiser')) if (!seen.has(id)) this.release(id);
    }
  }

  syncBoss() {
    const b = this.world.boss;
    if (!b) return;
    if (!this.bossMesh) {
      this.bossMesh = makeBoss(this.palette.accent, b.parts);
      this.scene.add(this.bossMesh);
    }
    const m = this.bossMesh;
    m.visible = b.phase !== 'dead' || (this.bossDown && this.bossDown.t < 1.2);
    this.place(m, b.s, b.u, b.w, -1);
    b.parts.forEach((pt, i) => { m.userData.partMeshes[i].visible = pt.alive; });
    m.userData.shield.visible = b.phase !== 'core';
    m.userData.core.scale.setScalar(1 + Math.sin(this.time * 6) * 0.05);
  }

  bossFinale(dt) {
    const d = this.bossDown;
    d.t += dt;
    if (d.t < 2 && Math.random() < 0.35) {
      this.boom(this.worldPos(d.s - 20 + Math.random() * 40, d.u + (Math.random() - 0.5) * 50, d.w + (Math.random() - 0.5) * 16), 1.6);
      this.cam.shake = Math.max(this.cam.shake, 0.6);
    }
  }

  syncPickups() {
    const p = this.world.player;
    const seen = new Set();
    let n = 0;
    for (const k of this.world.pickups) {
      if (!k.alive || k.s < p.s - 20 || k.s > p.s + DRAW_AHEAD) continue;
      if (k.type === 'dust') {
        if (n >= 500) continue;
        const f = this.lane.frame(k.s);
        const pos = this.lane.toWorld(k.s, k.u, k.w, f);
        _q.setFromAxisAngle(AXIS_Y, this.time * 3 + k.id);
        _m.compose(_s.set(pos.x, pos.y, pos.z), _q, _p.set(1, 1, 1));
        this.dustPickups.setMatrixAt(n++, _m);
        continue;
      }
      seen.add(k.id);
      const m = this.meshFor(k.id, `pick-${k.type}`, () => makePickup(k.type));
      this.place(m, k.s, k.u, k.w);
      m.userData.spin.rotation.y = this.time * 2;
      m.userData.spin.rotation.x = Math.sin(this.time + k.id) * 0.4;
    }
    this.dustPickups.count = n;
    this.dustPickups.instanceMatrix.needsUpdate = true;
    for (const [id, m] of this.meshes) if (m.userData.poolKey.startsWith('pick-') && !seen.has(id)) this.release(id);
  }

  syncProjectiles() {
    const w = this.world;
    let n = 0;
    for (const b of w.bolts) {
      if (n >= 400) break;
      const f = this.lane.frame(b.s);
      const pos = this.lane.toWorld(b.s, b.u, b.w, f);
      laneQuat(f, 1, _q);
      _m.compose(_s.set(pos.x, pos.y, pos.z), _q, _p.set(1, 1, 1));
      this.playerBolts.setMatrixAt(n++, _m);
    }
    this.playerBolts.count = n;
    this.playerBolts.instanceMatrix.needsUpdate = true;
    n = 0;
    for (const b of w.enemyBolts) {
      if (n >= 400) break;
      const pos = this.lane.toWorld(b.s, b.u, b.w);
      _m.makeTranslation(pos.x, pos.y, pos.z);
      this.enemyBolts.setMatrixAt(n++, _m);
    }
    this.enemyBolts.count = n;
    this.enemyBolts.instanceMatrix.needsUpdate = true;
    for (const m of w.missiles) {
      const pos = this.lane.toWorld(m.s, m.u, m.w);
      this.fire.emit(pos.x, pos.y, pos.z, { life: 0.1, size: 1.1, color: '#ffb45a' });
      this.smoke.emit(pos.x, pos.y, pos.z, { life: 0.9, size: 0.8, grow: 2.5, color: '#d8d0e0', alpha: 0.45 });
    }
  }

  updateJet(dt) {
    const p = this.world.player;
    this.place(this.jet, p.s, p.u, p.w);
    const rollAnim = p.roll > 0 ? (1 - p.roll / PLAYER.rollTime) * Math.PI * 2 * p.rollDir : 0;
    this.jet.rotateZ(clamp(p.vu * 0.025, -0.6, 0.6) + rollAnim);
    this.jet.rotateX(-clamp(p.vw * 0.012, -0.3, 0.3));
    for (const flame of this.jet.userData.engineGlows) flame.scale.z = (p.boosting || this.world.status === 'hyper' ? 1.8 : 1) * (0.85 + Math.random() * 0.3);
    this.jet.visible = this.viewMode === 'chase' && this.world.status !== 'destroyed';
    this.cockpit.visible = this.viewMode === 'cockpit' && this.world.status !== 'destroyed';
    this.muzzle = Math.max(0, (this.muzzle || 0) - dt);
    for (const m of this.cockpit.userData.muzzles) m.material.opacity = this.muzzle > 0 ? 1 : 0;
    for (const t of this.jet.userData.tips) t.scale.setScalar(this.muzzle > 0 ? 2.2 : 1);
    this.cockpit.userData.bob.rotation.z = Math.sin(this.time * 5) * 0.25 - p.vu * 0.01;
    this.cockpit.userData.lights.forEach((l, i) => { l.visible = Math.sin(this.time * (2 + i) + i) > -0.3; });
  }

  updateBurger() {
    const ring = this.driveThru.userData.ring;
    ring.material.color.setHSL(0.08 + Math.sin(this.time * 4) * 0.04, 1, 0.55);
    this.burger.userData.burger.rotation.y = this.time * 0.6;
    this.driveThru.rotation.z += 0.01;
  }

  updateCamera(dt) {
    const w = this.world, p = w.player, cam = this.cam;
    const f = this.lane.frame(p.s);
    const chase = this.viewMode === 'chase' || w.status === 'arriving' || w.status === 'finished' || w.status === 'destroyed';
    let fov = 72 + (p.boosting ? 8 : 0) + cam.warp * 30;
    if (chase) {
      const back = w.status === 'arriving' || w.status === 'finished' ? 24 : 16;
      const pos = this.lane.toWorld(p.s - back, p.u * 0.8, p.w * 0.8 + 5);
      const look = this.lane.toWorld(p.s + 30, p.u * 0.9, p.w * 0.9 + 1);
      this.camera.position.set(pos.x, pos.y, pos.z);
      this.camera.up.set(f.U.x, f.U.y, f.U.z);
      this.camera.lookAt(look.x, look.y, look.z);
      this.camera.rotateZ(-clamp(p.vu * 0.006, -0.12, 0.12));
    } else {
      const pos = this.lane.toWorld(p.s, p.u, p.w + 0.3, f);
      this.camera.position.set(pos.x, pos.y, pos.z);
      _m.makeBasis(_x.set(f.R.x, f.R.y, f.R.z), _y.set(f.U.x, f.U.y, f.U.z), _z.set(-f.T.x, -f.T.y, -f.T.z));
      this.camera.quaternion.setFromRotationMatrix(_m);
      const rollAnim = p.roll > 0 ? (1 - p.roll / PLAYER.rollTime) * Math.PI * 2 * p.rollDir : 0;
      this.camera.quaternion.multiply(_q.setFromAxisAngle(AXIS_Y, -clamp(p.vu * 0.004, -0.12, 0.12)));
      this.camera.quaternion.multiply(_q2.setFromAxisAngle(AXIS_X, clamp(p.vw * 0.004, -0.08, 0.08)));
      this.camera.quaternion.multiply(_q.setFromAxisAngle(AXIS_Z, -clamp(p.vu * 0.012, -0.35, 0.35) - rollAnim));
    }
    cam.shake = Math.max(0, cam.shake - dt * 2.5);
    if (cam.shake > 0) {
      const s = cam.shake * cam.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    this.camera.fov = cam.fov;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const key of Object.keys(m)) if (m[key] && m[key].isTexture) m[key].dispose();
        m.dispose();
      }
    });
    for (const pool of this.pools.values()) for (const m of pool) m.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
