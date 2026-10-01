import * as THREE from 'three';
import { makeCarObject, wheelGeometry } from './cars.js';
import { Particles, Weather } from './effects.js';
import { sunDirection } from './sky.js';
import { clamp, lerp } from '../math.js';
import { driftTier } from '../vehicle.js';

// Draws one Race. Reads simulation state; never changes it.

const TIER_COLORS = [new THREE.Color('#ffffff'), new THREE.Color('#4ac8ff'), new THREE.Color('#ff9a2a'), new THREE.Color('#d86aff')];
const SMOKE = {
  asphalt: new THREE.Color('#d8d8dc'), wet: new THREE.Color('#c8d4e4'), snow: new THREE.Color('#ffffff'),
  sand: new THREE.Color('#e8c890'), dirt: new THREE.Color('#b08a60'), grass: new THREE.Color('#9ab070'),
};
const FLAME = new THREE.Color('#ff9a3a'), FLAME2 = new THREE.Color('#4ac8ff'), SPARK = new THREE.Color('#ffe08a');
const GOLD = new THREE.Color('#ffd23d');
const CONFETTI = ['#ff3a5a', '#ffd23d', '#3fe5ff', '#7cff6a', '#c86aff', '#ff8a1a'].map((c) => new THREE.Color(c));
const m4 = new THREE.Matrix4(), m4b = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
const v3 = new THREE.Vector3(), v3b = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

export class RaceView {
  constructor(renderer, race, built, { reduced = false } = {}) {
    this.renderer = renderer;
    this.race = race;
    this.built = built;
    this.reduced = reduced;
    const loc = race.location, P = loc.palette;
    this.loc = loc;
    this.time = 0;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(P.fog);
    scene.fog = new THREE.Fog(P.fog, P.fogNear, P.fogFar);
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.3, 3200);
    scene.add(built.group);

    // Lights.
    const dir = sunDirection(P);
    const hemi = new THREE.HemisphereLight(new THREE.Color(P.skyHorizon).lerp(new THREE.Color('#ffffff'), 0.4), P.groundDark, P.ambient * (loc.night ? 2.8 : 2.3));
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(P.sun, P.light * 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 300;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.5;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.sunDir = dir;
    if (loc.night) scene.add(new THREE.AmbientLight('#5a6aaa', 0.35));
    this.headlight = null;
    if (loc.night) {
      const spot = new THREE.SpotLight('#fff2d0', 60, 70, 0.55, 0.5, 1.4);
      scene.add(spot, spot.target);
      this.headlight = spot;
    }

    // Cars and wheels.
    this.cars = race.racers.map((r) => {
      const obj = makeCarObject(r.carId, r.color, r.accent);
      scene.add(obj);
      return obj;
    });
    this.ghostCar = null;
    if (race.kind === 'timetrial') {
      this.ghostCar = makeCarObject(race.player.carId, '#9fe8ff', '#ffffff', { ghost: true });
      this.ghostCar.visible = false;
      scene.add(this.ghostCar);
    }
    const wheelCount = this.cars.length * 4;
    this.wheels = new THREE.InstancedMesh(wheelGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), wheelCount);
    this.wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheels.castShadow = true;
    this.wheels.frustumCulled = false;
    scene.add(this.wheels);
    this.spin = new Float32Array(this.cars.length);
    this.pitch = new Float32Array(this.cars.length);
    this.roll = new Float32Array(this.cars.length);

    // Effects.
    this.smoke = new Particles(reduced ? 300 : 700);
    this.glow = new Particles(reduced ? 250 : 600, { additive: true });
    scene.add(this.smoke.points, this.glow.points);
    this.weather = new Weather(loc.weather, { reduced });
    if (this.weather.object) scene.add(this.weather.object);

    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, fov: 64, mode: 'intro', t: 0, ready: false };
    this.cellCenters = built.cells.map((m) => {
      m.geometry.computeBoundingSphere();
      return m.geometry.boundingSphere.center;
    });
    this.ready = false;
    this.frame = 0;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.portrait = h > w;
  }

  setShadowQuality(size) {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }

  // ------------------------------------------------------------ events

  handleEvents(events) {
    const p = this.race.player;
    const shakeScale = this.reduced ? 0.3 : 1;
    for (const ev of events) {
      switch (ev.type) {
        case 'wall':
          this.sparks(ev.x, ev.y + 0.6, ev.z, Math.min(18, 4 + ev.impact));
          if (ev.racer === p.id) this.cam.shake = Math.max(this.cam.shake, clamp(ev.impact / 25, 0.1, 0.7) * shakeScale);
          break;
        case 'bump':
          this.sparks(ev.x, ev.y, ev.z, 8);
          if (ev.a === p.id || ev.b === p.id) this.cam.shake = Math.max(this.cam.shake, 0.3 * shakeScale);
          break;
        case 'land':
          if (ev.air > 0.3) this.dustRing(ev.x, ev.y, ev.z, ev.racer);
          if (ev.racer === p.id) this.cam.shake = Math.max(this.cam.shake, clamp(ev.impact / 35, 0, 0.5) * shakeScale);
          break;
        case 'coin':
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * 6.28, s = 2 + Math.random() * 4;
            this.glow.emit(ev.x, ev.y, ev.z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, 0.45, 0.35, GOLD, 0.9, 9);
          }
          break;
        case 'turbo':
          if (ev.racer === p.id) this.cam.kick = this.reduced ? 0 : 1;
          break;
        case 'pad':
          if (ev.racer === p.id) this.cam.kick = this.reduced ? 0 : 1;
          break;
        case 'finish':
          if (ev.racer === p.id) this.confetti();
          break;
        case 'respawn': {
          const v = this.race.racers[ev.racer].vehicle;
          for (let i = 0; i < 20; i++) this.glow.emit(v.x + (Math.random() - 0.5) * 3, v.y + Math.random() * 2, v.z + (Math.random() - 0.5) * 3, 0, 2, 0, 0.6, 0.5, TIER_COLORS[1], 0.8);
          break;
        }
        case 'eliminated': {
          const v = this.race.racers[ev.racer].vehicle;
          for (let i = 0; i < 40; i++) {
            const a = Math.random() * 6.28, s = 3 + Math.random() * 6;
            this.smoke.emit(v.x, v.y + 1, v.z, Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s, 1.2, 1.4, SMOKE.asphalt, 0.7, 2, 1.5, 2);
          }
          break;
        }
      }
    }
  }

  sparks(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.28, s = 4 + Math.random() * 8;
      this.glow.emit(x, y, z, Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s, 0.3 + Math.random() * 0.2, 0.18, SPARK, 1, 18);
    }
  }

  dustRing(x, y, z, id) {
    const surf = SMOKE[this.race.racers[id].vehicle.surface] || SMOKE.asphalt;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * 6.28;
      this.smoke.emit(x, y + 0.3, z, Math.cos(a) * 7, 0.6, Math.sin(a) * 7, 0.8, 1.2, surf, 0.5, 0, 3, 2.5);
    }
  }

  confetti() {
    const v = this.race.player.vehicle;
    const n = this.reduced ? 40 : 140;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 3 + Math.random() * 8;
      this.glow.emit(v.x, v.y + 2, v.z, Math.cos(a) * s, 6 + Math.random() * 9, Math.sin(a) * s, 2.2, 0.35, CONFETTI[i % CONFETTI.length], 1, 7, 0.8);
    }
  }

  // ------------------------------------------------------------ per frame

  update(dt, { paused = false } = {}) {
    this.frame++;
    if (!paused) this.time += dt;
    const race = this.race;
    race.racers.forEach((r, i) => this.updateCar(r, i, dt, paused));
    this.wheels.instanceMatrix.needsUpdate = true;
    this.updateGhost();
    if (!paused) {
      this.updateCoins();
      this.smoke.update(dt);
      this.glow.update(dt);
    }
    this.updateCamera(dt);
    const cam = this.camera.position;
    this.built.sky.position.copy(cam);
    this.built.sky.material.uniforms.time.value = this.time;
    // Shadows follow the player.
    const pv = race.player.vehicle;
    this.sun.position.set(pv.x + this.sunDir.x * 120, pv.y + this.sunDir.y * 120, pv.z + this.sunDir.z * 120);
    this.sun.target.position.set(pv.x, pv.y, pv.z);
    if (this.headlight) {
      const fx = Math.sin(pv.heading), fz = Math.cos(pv.heading);
      this.headlight.position.set(pv.x + fx * 1.6, pv.y + 1.2, pv.z + fz * 1.6);
      this.headlight.target.position.set(pv.x + fx * 22, pv.y - 0.5, pv.z + fz * 22);
    }
    // Pads pulse.
    const k = 0.75 + 0.25 * Math.sin(this.time * 8);
    this.built.pads.material.color.setRGB(k * 1.2, k * 1.1, k * 1.2);
    // Detail scenery only near the camera.
    if (this.frame % 10 === 0) {
      this.built.cells.forEach((m, i) => {
        if (m.userData.detail) m.visible = this.cellCenters[i].distanceTo(cam) < 260;
      });
    }
    const h = this.renderer.domElement.height;
    this.smoke.setViewport(h, this.camera.fov);
    this.glow.setViewport(h, this.camera.fov);
    this.weather.update(this.time, this.camera, h);
  }

  updateCar(r, i, dt, paused) {
    const obj = this.cars[i], v = r.vehicle, ud = obj.userData;
    obj.position.set(v.x, v.y, v.z);
    // Cars brushing the camera would fill the screen: hide them.
    obj.visible = (!r.eliminated || r.vehicle.speed > 0.5) && (r.isPlayer || this.camera.position.distanceToSquared(obj.position) > 20);
    obj.rotation.y = v.heading;
    if (!obj.visible) {
      m4.makeScale(0, 0, 0);
      for (let k = 0; k < 4; k++) this.wheels.setMatrixAt(i * 4 + k, m4);
      return;
    }
    // Body pitch from vertical speed, roll from cornering.
    const speed = Math.max(0, v.speed);
    const targetPitch = v.grounded ? clamp(-v.vy / Math.max(6, speed), -0.25, 0.25) : clamp(-v.vy * 0.02, -0.3, 0.3);
    this.pitch[i] += (targetPitch - this.pitch[i]) * Math.min(1, dt * 8);
    const targetRoll = clamp(v.steer * speed * 0.006, -0.12, 0.12) * (v.drifting ? 1.6 : 1);
    this.roll[i] += (targetRoll - this.roll[i]) * Math.min(1, dt * 6);
    ud.tilt.rotation.set(this.pitch[i], v.driftAngle, this.roll[i], 'YXZ');
    if (r.ghostTime > 0) ud.bodyMesh.visible = Math.floor(this.time * 12) % 2 === 0;
    else ud.bodyMesh.visible = true;
    // Brake lights.
    ud.lightMat.color.setScalar(r.braking ? 1.8 : 1);

    // Wheels.
    if (!paused) this.spin[i] += (v.speed * dt) / 0.4;
    obj.updateMatrixWorld();
    ud.tilt.updateMatrixWorld();
    const steerAngle = -v.steer * 0.45 + (v.drifting ? -v.driftAngle * 0.8 : 0);
    ud.wheels.forEach((w, k) => {
      e.set(this.spin[i], w.front ? steerAngle : 0, 0, 'YXZ');
      q.setFromEuler(e);
      v3.set(w.x, w.r, w.z);
      v3b.set(w.w, w.r * 2, w.r * 2);
      m4.compose(v3, q, v3b);
      m4b.multiplyMatrices(obj.matrixWorld, m4);
      // Wheels follow body yaw (drift) but not pitch/roll.
      this.wheels.setMatrixAt(i * 4 + k, m4b);
    });

    if (paused) return;
    // Effects near the camera only.
    const near = this.camera.position.distanceToSquared(obj.position) < 90 * 90;
    if (!near || !v.grounded) return;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const rx = -fz, rz = fx;
    const isPlayer = r.isPlayer;
    const every = isPlayer ? 1 : 2;
    if (this.frame % every) return;
    const surfColor = SMOKE[v.surface] || SMOKE.asphalt;
    const loose = v.surface === 'sand' || v.surface === 'dirt' || v.surface === 'snow' || v.surface === 'grass';
    if (v.drifting || v.slip > 4 || (loose && speed > 12)) {
      for (const side of [-1, 1]) {
        const x = v.x - fx * 1.4 + rx * side * 0.8, z = v.z - fz * 1.4 + rz * side * 0.8;
        const hard = v.drifting || v.slip > 4;
        if (hard || this.frame % 4 === 0) {
          const big = hard ? 1 : 0.55;
          this.smoke.emit(x, v.y + 0.25, z, -fx * 2 + (Math.random() - 0.5) * 2, 0.6 + Math.random() * 0.6, -fz * 2 + (Math.random() - 0.5) * 2, hard ? 0.65 : 0.45, 0.7 * big, surfColor, (loose ? 0.32 : 0.26) * big, 0, 1.5, 1.6 * big);
        }
        if (v.drifting) {
          const tier = driftTier(v.driftCharge);
          if (tier > 0) this.glow.emit(x, v.y + 0.2, z, -fx * 3 + (Math.random() - 0.5) * 4, 1 + Math.random() * 3, -fz * 3 + (Math.random() - 0.5) * 4, 0.25, 0.22, TIER_COLORS[tier], 1, 10);
        }
      }
    }
    if (v.turbo > 0 || v.boosting) {
      const color = v.turbo > 0 && !v.boosting ? TIER_COLORS[Math.max(1, v.lastTier)] : FLAME;
      for (let k = 0; k < 2; k++) {
        this.glow.emit(v.x - fx * 2.2, v.y + 0.5, v.z - fz * 2.2, -fx * 6 + (Math.random() - 0.5), Math.random(), -fz * 6 + (Math.random() - 0.5), 0.18, 0.7, k ? FLAME2 : color, 0.9, 0, 0, -1);
      }
    }
  }

  updateGhost() {
    if (!this.ghostCar) return;
    const pose = this.race.ghostPose();
    this.ghostCar.visible = !!pose;
    if (!pose) return;
    this.ghostCar.position.set(pose.x, pose.y, pose.z);
    this.ghostCar.rotation.y = pose.heading;
  }

  updateCoins() {
    const coins = this.race.track.coins, taken = this.race.coinsTaken;
    const mesh = this.built.coins;
    const a = this.time * 3;
    q.setFromAxisAngle(v3.set(0, 1, 0), a);
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      const s = taken.has(c.id) ? 0 : 1;
      v3b.set(c.x, c.y + Math.sin(a + i) * 0.15, c.z);
      m4.compose(v3b, q, s ? one : v3.set(0, 0, 0));
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // Chase camera; a sweeping fly-in during the countdown; orbit afterwards.
  updateCamera(dt) {
    const cam = this.cam, race = this.race;
    const v = race.player.vehicle;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const speed = Math.max(0, v.speed);
    const portrait = this.portrait;
    let pos, look, fov = portrait ? 74 : 64;
    if (cam.mode === 'intro') {
      cam.t += dt;
      const k = clamp((race.time + 3.4) / 3.2, 0, 1);
      const ease = 1 - Math.pow(1 - k, 3);
      const ang = v.heading + Math.PI * 0.9 * (1 - ease);
      const dist = lerp(26, 8, ease), height = lerp(13, 3.2, ease);
      pos = v3.set(v.x - Math.sin(ang) * dist, v.y + height, v.z - Math.cos(ang) * dist);
      look = v3b.set(v.x + fx * 4, v.y + 1, v.z + fz * 4);
      cam.pos.copy(pos);
      cam.look.copy(look);
      if (race.time > -0.2) cam.mode = 'chase';
    } else if (cam.mode === 'orbit') {
      cam.t += dt;
      const ang = cam.t * 0.35 + v.heading;
      pos = v3.set(v.x - Math.sin(ang) * 9, v.y + 3.2, v.z - Math.cos(ang) * 9);
      look = v3b.set(v.x, v.y + 1, v.z);
      cam.pos.lerp(pos, Math.min(1, dt * 2));
      cam.look.lerp(look, Math.min(1, dt * 4));
    } else {
      const back = (portrait ? 8 : 6.4) + speed * 0.05;
      const height = (portrait ? 3.2 : 2.55) + speed * 0.012;
      // Swing out a little while drifting.
      const swing = v.drifting && !this.reduced ? v.driftAngle * 0.8 : 0;
      const ch = v.heading + swing;
      pos = v3.set(v.x - Math.sin(ch) * back, v.y + height, v.z - Math.cos(ch) * back);
      look = v3b.set(v.x + fx * 6, v.y + 1.35, v.z + fz * 6);
      const k = 1 - Math.exp(-dt * 7);
      cam.pos.lerp(pos, k);
      // Keep the camera above the ground behind the car.
      cam.pos.y = Math.max(cam.pos.y, v.y + 1.6);
      cam.look.lerp(look, 1 - Math.exp(-dt * 12));
      const boosting = v.turbo > 0 || v.boosting;
      fov += speed * 0.25 + (boosting && !this.reduced ? 8 : 0);
    }
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    this.camera.position.copy(cam.pos);
    if (cam.shake > 0.01) {
      const s = cam.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      cam.shake *= Math.exp(-dt * 6);
    }
    if (this.camera.fov !== cam.fov) {
      this.camera.fov = cam.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(cam.look);
  }

  // Screen position of a world point, or null when behind the camera.
  project(x, y, z, out) {
    v3.set(x, y, z).project(this.camera);
    if (v3.z > 1) return null;
    out.x = v3.x;
    out.y = v3.y;
    return out;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry && o.geometry !== wheelGeometry()) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    this.sun.shadow.map?.dispose();
  }
}
