import * as THREE from 'three';
import { makeSky, makeLights, makeTerrain, makeRoad, makeProps } from './environment.js';
import { makeJeep, addHeadlights, makeZombie, animateZombie, propParts, PROP_BASE_R, makeRamp, makePickup, makeCoinGeometry, PICKUP_COLORS } from './models.js';
import { Particles, Tracers } from './particles.js';
import { clamp } from '../math.js';

const ZOMBIE_DRAW = 170;
const tmp = new THREE.Vector3();

// Draws one World with Three.js. Reads simulation state; never changes it.
export class RaceView {
  constructor(renderer, world, { paint }) {
    this.renderer = renderer;
    this.world = world;
    const def = world.def, pal = def.palette;
    this.palette = pal;
    this.time = 0;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(pal.fog);
    scene.fog = new THREE.Fog(pal.fog, pal.fogNear, pal.fogFar);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.4, 2400);

    this.sky = makeSky(pal, def.night);
    scene.add(this.sky);
    this.lights = makeLights(scene, pal, def.night);
    scene.add(makeTerrain(world.track, pal));
    scene.add(makeRoad(world.track, pal));
    this.props = makeProps(world.obstacles, world.decor, pal);
    scene.add(this.props.group);

    this.movers = world.movers.map((o) => {
      const g = new THREE.Group();
      for (const part of propParts('boulder', pal)) {
        const m = new THREE.Mesh(part.geometry, part.material);
        m.castShadow = true;
        g.add(m);
      }
      g.scale.setScalar(o.r / PROP_BASE_R.boulder);
      scene.add(g);
      return { o, mesh: g, roll: 0 };
    });

    for (const r of world.ramps) {
      const m = makeRamp(r);
      m.position.set(r.x, r.y, r.z);
      m.rotation.y = r.heading;
      scene.add(m);
    }

    this.buildPickups();

    this.zombieMeshes = new Map();
    this.zombiePool = new Map();

    this.jeeps = world.racers.map(() => {
      const j = makeJeep(paint);
      if (def.night) addHeadlights(j);
      scene.add(j);
      return j;
    });

    this.dust = new Particles(1600);
    this.fire = new Particles(1000, { additive: true });
    this.tracers = new Tracers();
    scene.add(this.dust.points, this.fire.points, this.tracers.lines);

    this.flash = new THREE.PointLight('#ffae5a', 0, 50, 1.6);
    scene.add(this.flash);

    this.rocketMeshes = [];
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, fov: 62, ready: false, mode: 'chase' };
  }

  buildPickups() {
    const coins = this.world.pickups.filter((p) => p.type === 'coin');
    this.coinList = coins;
    this.coinMesh = new THREE.InstancedMesh(makeCoinGeometry(), new THREE.MeshStandardMaterial({
      color: '#ffcf3a', emissive: '#a86a00', emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.3,
    }), Math.max(1, coins.length));
    this.coinMesh.castShadow = true;
    this.scene.add(this.coinMesh);
    this.pickupMeshes = new Map();
    for (const p of this.world.pickups) {
      if (p.type === 'coin') continue;
      const m = makePickup(p.type);
      m.position.set(p.x, p.y, p.z);
      this.scene.add(m);
      this.pickupMeshes.set(p.id, m);
    }
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ events

  handleEvents(events) {
    const player = this.world.player;
    for (const e of events) {
      switch (e.type) {
        case 'kill': this.poof(e); break;
        case 'explosion': this.explosion(e); break;
        case 'destroy': this.destroyed(e); break;
        case 'crash':
          this.sparks(e.x, e.y + 1, e.z, e.soft ? 6 : 16);
          if (e.racer === player.id) this.cam.shake = Math.max(this.cam.shake, e.soft ? 0.25 : 0.8);
          break;
        case 'land':
          if (e.air > 0.35) this.dustRing(e.x, e.y, e.z, 14 + e.air * 10);
          if (e.racer === player.id) this.cam.shake = Math.max(this.cam.shake, clamp(e.impact / 30, 0, 0.6));
          break;
        case 'pickup': {
          const color = PICKUP_COLORS[e.kind];
          for (let i = 0; i < (e.kind === 'coin' ? 5 : 22); i++) {
            const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
            this.fire.emit(e.x, e.y, e.z, { vx: Math.cos(a) * s, vy: 2 + Math.random() * 5, vz: Math.sin(a) * s, life: 0.45, size: e.kind === 'coin' ? 0.16 : 0.3, color, alpha: 0.8, gravity: 8 });
          }
          break;
        }
        case 'shot':
          this.tracers.add(e.from, e.to);
          this.fire.emit(e.from.x, e.from.y, e.from.z, { life: 0.06, size: 0.9, color: '#ffd27a' });
          this.aimGun(e);
          break;
        case 'hit': this.sparks(e.x, e.y, e.z, 4, '#b8ff6a'); break;
        case 'rocket': this.fire.emit(e.x, e.y, e.z, { life: 0.15, size: 2, color: '#ffb45a' }); break;
        case 'wrecked':
          this.explosion({ x: e.x, y: e.y, z: e.z, radius: 6 });
          this.wreckedSmoke = true;
          break;
        case 'finish':
          if (e.racer === player.id) this.confetti();
          break;
      }
    }
  }

  poof(e) {
    const green = e.kind === 'bloater' ? '#e6ff6a' : '#9be26a';
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fire.emit(e.x, e.y + 1.2, e.z, { vx: Math.cos(a) * 4, vy: 1 + Math.random() * 4, vz: Math.sin(a) * 4, life: 0.5, size: 0.5, color: green, drag: 2 });
    }
    this.dustRing(e.x, e.y, e.z, 8);
  }

  explosion(e) {
    const r = e.radius || 6;
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = r * (0.8 + Math.random() * 1.6);
      const h = Math.sqrt(1 - u * u);
      this.fire.emit(e.x, e.y + 1, e.z, {
        vx: Math.cos(a) * h * s, vy: Math.abs(u) * s + 2, vz: Math.sin(a) * h * s,
        life: 0.35 + Math.random() * 0.4, size: 1.6 + Math.random() * 1.6, grow: 2, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', drag: 3,
      });
    }
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
      this.dust.emit(e.x, e.y + 1.5, e.z, { vx: Math.cos(a) * s, vy: 3 + Math.random() * 4, vz: Math.sin(a) * s, life: 1.6, size: 2.5, grow: 5, color: '#4a3a36', alpha: 0.6, drag: 1.2 });
    }
    this.flash.position.set(e.x, e.y + 3, e.z);
    this.flash.intensity = 900;
    const v = this.world.player.vehicle;
    const d = Math.hypot(v.x - e.x, v.z - e.z);
    this.cam.shake = Math.max(this.cam.shake, clamp(1.2 - d / 40, 0, 1));
  }

  destroyed(e) {
    this.props.hide(e.id);
    const color = { cactus: '#4f8a3c', rock: this.palette.rock || '#8a6a55', wreck: '#8b4a2e', tumbleweed: '#a8835a', boulder: this.palette.rock || '#8a6a55' }[e.kind] || '#777';
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 6;
      this.dust.emit(e.x, e.y + 1, e.z, { vx: Math.cos(a) * s, vy: 3 + Math.random() * 6, vz: Math.sin(a) * s, life: 0.9, size: 0.45, color, gravity: 18 });
    }
    const mover = this.movers.find((m) => m.o.id === e.id);
    if (mover) mover.mesh.visible = false;
  }

  sparks(x, y, z, n, color = '#ffd27a') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7;
      this.fire.emit(x, y, z, { vx: Math.cos(a) * s, vy: 2 + Math.random() * 5, vz: Math.sin(a) * s, life: 0.35, size: 0.25, color, gravity: 20 });
    }
  }

  dustRing(x, y, z, n) {
    const sand = this.palette.sand;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, s = 3 + Math.random() * 3;
      this.dust.emit(x, y + 0.4, z, { vx: Math.cos(a) * s, vy: 0.8 + Math.random(), vz: Math.sin(a) * s, life: 1.1, size: 1.4, grow: 2.5, color: sand, alpha: 0.55, drag: 1.5 });
    }
  }

  confetti() {
    const v = this.world.player.vehicle;
    const colors = ['#ffd27a', '#ff7a45', '#6fe9ff', '#b8ff6a', '#ff6ab8'];
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 8;
      this.fire.emit(v.x, v.y + 3, v.z, { vx: Math.cos(a) * s, vy: 8 + Math.random() * 8, vz: Math.sin(a) * s, life: 2, size: 0.35, color: colors[i % colors.length], gravity: 9, drag: 1 });
    }
  }

  aimGun(e) {
    const jeep = this.jeeps[e.racer];
    if (!jeep) return;
    const v = this.world.racers[e.racer].vehicle;
    const world = Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z);
    jeep.userData.gun.rotation.y = world - v.heading;
  }

  // ------------------------------------------------------------ per frame

  update(dt) {
    this.time += dt;
    const w = this.world;
    this.world.racers.forEach((r, i) => this.updateJeep(r, this.jeeps[i], dt));
    this.updateZombies();
    this.updatePickups();
    this.updateMovers();
    this.updateRockets();

    if (this.wreckedSmoke && Math.random() < 0.5) {
      const v = w.player.vehicle;
      this.dust.emit(v.x, v.y + 1.5, v.z, { vx: (Math.random() - 0.5), vy: 3, vz: (Math.random() - 0.5), life: 2.5, size: 1.5, grow: 5, color: '#2e2828', alpha: 0.5 });
    }
    this.flash.intensity *= Math.exp(-dt * 10);
    this.dust.update(dt);
    this.fire.update(dt);
    this.tracers.update(dt);
    this.updateCamera(dt);

    // Keep the sky around the camera and the shadow box around the player.
    this.sky.position.copy(this.camera.position);
    const v = w.player.vehicle;
    const sun = this.lights.sun;
    sun.target.position.set(v.x, v.y, v.z);
    sun.position.set(v.x + this.lights.dir.x * 150, v.y + Math.max(40, this.lights.dir.y * 150), v.z + this.lights.dir.z * 150);
    const h = this.renderer.domElement.height;
    this.dust.setViewport(h, this.camera.fov);
    this.fire.setViewport(h, this.camera.fov);
  }

  updateJeep(racer, jeep, dt) {
    const v = racer.vehicle, t = this.world.track;
    const { body, wheels, pivots, gun, rockets, shield, flames } = jeep.userData;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const sx = Math.cos(v.heading), sz = -Math.sin(v.heading);

    let pitch, roll;
    if (v.grounded) {
      const hF = t.groundHeight(v.x + fx * 1.4, v.z + fz * 1.4), hB = t.groundHeight(v.x - fx * 1.4, v.z - fz * 1.4);
      const hR = t.groundHeight(v.x + sx * 1.05, v.z + sz * 1.05), hL = t.groundHeight(v.x - sx * 1.05, v.z - sz * 1.05);
      pitch = -Math.atan2(hF - hB, 2.8);
      roll = Math.atan2(hR - hL, 2.1);
    } else {
      pitch = -clamp(v.vy * 0.03, -0.35, 0.35);
      roll = 0;
    }
    const k = 1 - Math.exp(-dt * 12);
    jeep.userData.pitch = (jeep.userData.pitch || 0) + (pitch - (jeep.userData.pitch || 0)) * k;
    jeep.userData.roll = (jeep.userData.roll || 0) + (roll - (jeep.userData.roll || 0)) * k;
    jeep.position.set(v.x, v.y, v.z);
    jeep.rotation.set(jeep.userData.pitch, v.heading, jeep.userData.roll, 'YXZ');

    // Body leans into turns and bobs a little on rough ground.
    const lean = -v.steerVisual * clamp(Math.abs(v.speed) / 30, 0, 1) * 0.08;
    body.rotation.z += (lean - body.rotation.z) * k;
    body.position.y = v.grounded ? Math.sin(this.time * 18) * 0.02 * clamp(Math.abs(v.speed) / 20, 0, 1) * (v.offroad ? 3 : 1) : 0;

    for (const wheel of wheels) wheel.rotation.x += (v.speed / 0.55) * dt;
    for (const p of pivots) p.rotation.y = -v.steerVisual * 0.45;

    gun.visible = racer.weapon === 'gun';
    rockets.visible = racer.weapon === 'rockets';
    shield.visible = racer.shield > 0 && (racer.shield > 2 || Math.sin(this.time * 20) > 0);
    shield.rotation.y += dt;
    flames.visible = v.nitroOn;
    if (v.nitroOn) flames.scale.set(1, 1, 0.8 + Math.random() * 0.5);

    // Dust from the rear wheels.
    const speed = Math.abs(v.speed);
    if (v.grounded && speed > 5 && Math.random() < clamp(speed / 30, 0, 1) * (v.offroad ? 1 : 0.55)) {
      for (const side of [-1, 1]) {
        this.dust.emit(v.x - fx * 1.6 + sx * side, v.y + 0.3, v.z - fz * 1.6 + sz * side, {
          vx: -fx * 2 + (Math.random() - 0.5) * 2, vy: 0.6 + Math.random(), vz: -fz * 2 + (Math.random() - 0.5) * 2,
          life: 0.9 + Math.random() * 0.5, size: 0.9, grow: 3, color: this.palette.sand, alpha: v.offroad ? 0.55 : 0.35, drag: 1,
        });
      }
    }
    if (v.nitroOn && Math.random() < 0.8) {
      this.fire.emit(v.x - fx * 3, v.y + 0.75, v.z - fz * 3, { vx: -fx * 6, vy: 0.5, vz: -fz * 6, life: 0.25, size: 0.8, color: '#7fd4ff' });
    }
  }

  acquireZombie(type, id) {
    const pool = this.zombiePool.get(type) || [];
    const m = pool.pop() || makeZombie(type, id);
    if (!m.parent) this.scene.add(m);
    m.visible = true;
    return m;
  }

  releaseZombie(id, m) {
    m.visible = false;
    const type = m.userData.type;
    if (!this.zombiePool.has(type)) this.zombiePool.set(type, []);
    this.zombiePool.get(type).push(m);
    this.zombieMeshes.delete(id);
  }

  updateZombies() {
    const w = this.world, cam = this.camera.position;
    const needed = new Set();
    for (const z of w.zombies) {
      if (!z.alive || !z.active) continue;
      if ((z.x - cam.x) ** 2 + (z.z - cam.z) ** 2 > ZOMBIE_DRAW * ZOMBIE_DRAW) continue;
      needed.add(z.id);
      let m = this.zombieMeshes.get(z.id);
      if (!m) { m = this.acquireZombie(z.type, z.id); this.zombieMeshes.set(z.id, m); }
      m.position.set(z.x, z.y, z.z);
      m.rotation.set(0, z.heading, 0);
      animateZombie(m, z.phase, z.state);
    }
    for (const c of w.corpses) {
      needed.add(c.id);
      let m = this.zombieMeshes.get(c.id);
      if (!m) { m = this.acquireZombie(c.type, c.id); this.zombieMeshes.set(c.id, m); }
      m.position.set(c.x, c.y, c.z);
      m.rotation.set(c.rot, m.rotation.y, c.rot * 0.6);
    }
    for (const [id, m] of this.zombieMeshes) if (!needed.has(id)) this.releaseZombie(id, m);
  }

  updatePickups() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const zero = new THREE.Vector3(0, 0, 0);
    this.coinList.forEach((c, i) => {
      m.compose(p.set(c.x, c.y + Math.sin(this.time * 3 + c.id) * 0.2, c.z), q.setFromAxisAngle(up, this.time * 3 + c.id * 0.3), c.alive ? s : zero);
      this.coinMesh.setMatrixAt(i, m);
    });
    this.coinMesh.instanceMatrix.needsUpdate = true;
    for (const pk of this.world.pickups) {
      const mesh = this.pickupMeshes.get(pk.id);
      if (!mesh) continue;
      mesh.visible = pk.alive;
      if (!pk.alive) continue;
      mesh.userData.spin.rotation.y = this.time * 2;
      mesh.userData.spin.position.y = Math.sin(this.time * 2.5 + pk.id) * 0.25;
    }
  }

  updateMovers() {
    for (const mv of this.movers) {
      const o = mv.o;
      mv.mesh.position.set(o.x, o.y, o.z);
      mv.roll += Math.hypot(o.vx || 0, o.vz || 0) / o.r;
      const dir = Math.atan2(o.vx || 0, o.vz || 0);
      mv.mesh.rotation.set(mv.roll, dir, 0, 'YXZ');
    }
  }

  updateRockets() {
    const list = this.world.projectiles;
    while (this.rocketMeshes.length < list.length) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ddd' })));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb45a' })));
      this.scene.add(g);
      this.rocketMeshes.push(g);
    }
    this.rocketMeshes.forEach((g, i) => {
      const p = list[i];
      g.visible = !!p;
      if (!p) return;
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.heading;
      this.dust.emit(p.x, p.y, p.z, { vy: 0.5, life: 0.8, size: 0.6, grow: 2, color: '#d8d0c8', alpha: 0.5 });
      this.fire.emit(p.x, p.y, p.z, { life: 0.08, size: 0.9, color: '#ffb45a' });
    });
  }

  // Chase camera; orbits the jeep in menus and after the race.
  updateCamera(dt) {
    const w = this.world, v = w.player.vehicle, cam = this.cam;
    const f = tmp.set(Math.sin(v.heading), 0, Math.cos(v.heading));
    const base = new THREE.Vector3(v.x, v.y, v.z);
    let desired, look, fov = 60;

    const orbit = cam.mode === 'orbit' || w.status === 'finished' || w.status === 'wrecked';
    if (orbit) {
      const a = this.time * 0.18 + 2.4;
      desired = base.clone().add(new THREE.Vector3(Math.sin(a) * 11, 3.6, Math.cos(a) * 11));
      look = base.clone().add(new THREE.Vector3(0, 1.4, 0));
    } else {
      const speed = Math.max(0, v.speed);
      // A phone held upright sees a narrow slice of the world, mostly sky.
      // Widen the view and lift the camera so the road ahead fills it.
      const tall = clamp((1 - this.camera.aspect) / 0.55, 0, 1);
      desired = base.clone().addScaledVector(f, -(7.2 + speed * 0.04 + tall * 1.5)).add(new THREE.Vector3(0, 2.9 + speed * 0.018 + tall * 2.2, 0));
      look = base.clone().addScaledVector(f, 7 + tall * 3).add(new THREE.Vector3(0, 1.5 - tall * 0.6, 0));
      fov = (60 + speed * 0.28 + (v.nitroOn ? 9 : 0)) * (1 + tall * 0.3);
      // During the countdown, swoop in from the front.
      if (w.time < 0) {
        const t = clamp(-w.time / 3, 0, 1);
        const intro = base.clone().addScaledVector(f, 14 * t).add(new THREE.Vector3(Math.sin(t * 2) * 8 * t, 3 + 4 * t, 0));
        desired.lerp(intro, t * t * (3 - 2 * t));
      }
    }
    if (!cam.ready) { cam.pos.copy(desired); cam.look.copy(look); cam.ready = true; }
    cam.pos.lerp(desired, 1 - Math.exp(-dt * (orbit ? 2 : 6)));
    cam.look.lerp(look, 1 - Math.exp(-dt * 10));
    const ground = w.track.groundHeight(cam.pos.x, cam.pos.z);
    cam.pos.y = Math.max(cam.pos.y, ground + 1.4);
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 4));
    cam.shake = Math.max(0, cam.shake - dt * 2.2);

    this.camera.position.copy(cam.pos);
    if (cam.shake > 0) {
      const s = cam.shake * cam.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.fov = cam.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(cam.look);
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
  }
}
