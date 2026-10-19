// One delivery run. DOM-free, fixed-step and deterministic, so the tests, the
// autopilot and the browser all fly exactly the same flight.

import { DEFAULT_TUNING, clonePlane, createPlane, speedOf, stepPlane } from './flight.js';
import { DROP_RADIUS } from './routes.js';
import { windAt } from './wind.js';

// The landing green: a long mown strip around the mailbox. Touching down
// anywhere on it delivers the post, so coming in high is never a wasted run —
// landing right by the box is what earns the bullseye.
export const PAD_BEFORE = 60;
export const GREEN_AFTER = 130;     // how far the mown grass is drawn past the box
export const BULLSEYE = 25;
export const PLANE_R = 0.9;         // collision radius of the paper
export const LINE_THICK = 1.4;
export const SOFT_PITCH = 0.42;     // a feather landing needs a shallow nose
export const CEILING_PUSH = 7;      // thin air above the ceiling nudges you down
export const THERMAL_GAIN = 5;      // climb that counts as "rode a column"
export const WARN_SOAK = 0.55;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class World {
  /**
   * `scene` is a route (see `routes.js`) or an Endless Breeze scene: both
   * expose terrain, air, drops, rings, hazards, a mailbox and a start.
   */
  constructor(scene, { tuning = DEFAULT_TUNING, breeze = null } = {}) {
    this.scene = scene;
    this.endless = !!scene.endless;
    this.tuning = tuning;
    this.breeze = breeze || scene.breeze || { x: 0, y: 0 };
    this.terrain = scene.terrain;
    this.plane = createPlane(scene.start);
    this.startX = scene.start.x;
    this.time = 0;
    this.status = 'flying';     // flying | done | failed
    this.outcome = '';          // landed | missed | short | crash | water | stuck
    this.events = [];
    this.wind = { x: 0, y: 0, rain: 0, dry: 1, lift: 0 };
    this.letters = 0;
    this.ringsHit = 0;
    this.thermals = 0;
    this.soft = false;
    this.bullseye = false;
    this.landSpeed = 0;
    this.peakSoak = 0;
    this.distance = 0;
    this.best = 0;              // furthest x reached, for Endless records
    this.columnFrom = null;
    this.goalX = scene.mailbox ? scene.mailbox.x : Infinity;
    this.letterTotal = scene.drops ? scene.drops.length : 0;
    this.ringTotal = scene.rings ? scene.rings.length : 0;
    this.collected = new Set();
    this.events.push({ type: 'launch' });
  }

  groundAt(x) {
    return this.terrain.heightAt(x);
  }

  /** Air at a point, including the thin-air ceiling push. Reuses one object. */
  airAt(x, y, out = this.wind) {
    windAt(this.scene.air, x, y, this.time, this.breeze, out);
    const ceiling = this.scene.ceiling ?? -9999;
    if (y < ceiling) out.y += Math.min(CEILING_PUSH, (ceiling - y) * 0.25);
    return out;
  }

  step(dt, controls = {}) {
    if (this.status !== 'flying') return this;
    this.time += dt;
    const plane = this.plane;

    if (this.scene.ensure) this.scene.ensure(plane.x + 420);

    const air = this.airAt(plane.x, plane.y);
    const wasSoak = plane.soak;
    stepPlane(plane, dt, {
      dive: !!controls.dive,
      wind: air,
      rain: air.rain,
      drying: air.dry,
      tuning: this.tuning,
    });
    this.peakSoak = Math.max(this.peakSoak, plane.soak);
    if (plane.snap) this.events.push({ type: 'snap', x: plane.x, y: plane.y });
    if (wasSoak < WARN_SOAK && plane.soak >= WARN_SOAK) this.events.push({ type: 'soaking' });
    if (wasSoak > 0.02 && plane.soak <= 0.02) this.events.push({ type: 'dry' });

    // Riding a warm column: count it once you actually gain height in one.
    if (air.lift > 2.2) {
      if (this.columnFrom === null) this.columnFrom = plane.y;
    } else if (this.columnFrom !== null) {
      if (this.columnFrom - plane.y >= THERMAL_GAIN) {
        this.thermals += 1;
        this.events.push({ type: 'thermal', gain: this.columnFrom - plane.y, x: plane.x, y: plane.y });
      }
      this.columnFrom = null;
    }

    this.distance = Math.max(0, plane.x - this.startX);
    if (this.distance > this.best) {
      const beforeHundred = Math.floor(this.best / 100);
      this.best = this.distance;
      if (this.endless && Math.floor(this.best / 100) > beforeHundred) {
        this.events.push({ type: 'milestone', metres: Math.floor(this.best / 100) * 100 });
      }
    }

    this.collect(plane);
    this.checkContact(plane);
    if (this.endless && this.scene.trim) this.scene.trim(plane.x - 160);
    return this;
  }

  collect(plane) {
    const rings = this.scene.rings;
    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      if (this.collected.has(ring.id)) continue;
      if (Math.abs(ring.x - plane.x) > ring.r || Math.abs(ring.y - plane.y) > ring.r) continue;
      if (Math.hypot(ring.x - plane.x, ring.y - plane.y) > ring.r) continue;
      this.collected.add(ring.id);
      this.ringsHit += 1;
      this.events.push({ type: 'ring', x: ring.x, y: ring.y, index: this.ringsHit });
    }
    const drops = this.scene.drops;
    for (let i = 0; i < drops.length; i += 1) {
      const drop = drops[i];
      if (this.collected.has(drop.id)) continue;
      if (Math.abs(drop.x - plane.x) > DROP_RADIUS || Math.abs(drop.y - plane.y) > DROP_RADIUS) continue;
      if (Math.hypot(drop.x - plane.x, drop.y - plane.y) > DROP_RADIUS) continue;
      this.collected.add(drop.id);
      this.letters += 1;
      this.events.push({ type: 'letter', x: drop.x, y: drop.y, index: this.letters });
    }
  }

  /** Ground, water, hazards and the mailbox pad. */
  checkContact(plane) {
    for (const hazard of this.scene.hazards) {
      if (hazard.kind === 'line') {
        if (Math.abs(plane.x - hazard.x) <= hazard.w && Math.abs(plane.y - hazard.y) <= LINE_THICK) {
          return this.fail('stuck', { x: plane.x, y: plane.y, hazard: hazard.kind });
        }
      } else if (Math.hypot(plane.x - hazard.x, plane.y - hazard.y) <= hazard.r + PLANE_R) {
        return this.fail('stuck', { x: plane.x, y: plane.y, hazard: hazard.kind });
      }
    }

    const ground = this.groundAt(plane.x);
    if (plane.y < ground - PLANE_R) return null;

    const surface = this.terrain.kindAt(plane.x);
    if (surface === 'water') return this.fail('water', { x: plane.x, y: ground });
    if (this.endless) return this.fail('crash', { x: plane.x, y: ground });

    const speed = speedOf(plane);
    this.landSpeed = speed;
    if (plane.x < this.goalX - PAD_BEFORE) {
      return this.fail('short', { x: plane.x, y: ground });
    }
    this.soft = speed <= this.scene.softSpeed && Math.abs(plane.pitch) <= SOFT_PITCH;
    this.bullseye = Math.abs(plane.x - this.goalX) <= BULLSEYE;
    this.status = 'done';
    this.outcome = 'landed';
    plane.y = ground - PLANE_R;
    plane.vx = 0;
    plane.vy = 0;
    this.events.push({ type: 'land', soft: this.soft, bullseye: this.bullseye, speed, x: plane.x, y: ground });
    return null;
  }

  fail(outcome, info = {}) {
    this.status = 'failed';
    this.outcome = outcome;
    this.plane.alive = false;
    this.events.push({ type: 'fail', outcome, ...info });
    return null;
  }

  /** Height above the ground right now, for the HUD and the autopilot. */
  altitude() {
    return this.groundAt(this.plane.x) - this.plane.y;
  }

  /** A copy of the plane for lookahead; see `ai.js`. */
  snapshot() {
    return clonePlane(this.plane);
  }

  stars() {
    if (this.outcome !== 'landed') return 0;
    let stars = 1;
    if (this.letterTotal === 0 || this.letters >= this.letterTotal) stars += 1;
    if (this.ringTotal === 0 || this.ringsHit >= this.ringTotal) stars += 1;
    return stars;
  }

  score() {
    return Math.round(
      this.letters * 120
      + this.ringsHit * 60
      + this.plane.snapCount * 30
      + this.thermals * 40
      + (this.outcome === 'landed' ? 300 : 0)
      + (this.soft ? 400 : 0)
      + (this.bullseye ? 200 : 0)
      + (this.endless ? this.best * 2 : 0),
    );
  }

  result() {
    return {
      routeId: this.scene.id,
      endless: this.endless,
      outcome: this.outcome,
      stars: this.stars(),
      letters: this.letters,
      letterTotal: this.letterTotal,
      rings: this.ringsHit,
      ringTotal: this.ringTotal,
      snaps: this.plane.snapCount,
      thermals: this.thermals,
      soft: this.soft,
      bullseye: this.bullseye,
      landSpeed: this.landSpeed,
      time: this.time,
      distance: Math.round(this.best),
      score: this.score(),
      peakSoak: this.peakSoak,
    };
  }
}

/** Clamp helper shared with the renderer's camera. */
export { clamp };
