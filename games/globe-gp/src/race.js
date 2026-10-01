import { getTrack, Track } from './track.js';
import { makeVehicle, stepVehicle, followGround, surfaceFactor } from './vehicle.js';
import { collideWall, collideCircle, bumpCars } from './collide.js';
import { aiInput, makeDriver, rivalStats, RIVALS, PILOT, DIFFICULTY } from './ai.js';
import { carStats } from './cars.js';
import { clamp, lerp, hashString, wrapAngle } from './math.js';

// One race. Pure simulation: no rendering, DOM or audio. Things that happen
// are pushed onto `events` for the view, HUD and audio to read.

export const DT = 1 / 60;
export const COUNTDOWN = 3;
export const ELIM_FIRST = 30;
export const ELIM_EVERY = 25;
export const GHOST_EVERY = 3;           // record a ghost frame every 3 steps
const STILL_RESPAWN = 4;                // seconds stuck before an automatic reset
const SLIP_GAP = [2.5, 16];
const SLIP_LATERAL = 2.2;
const NO_INPUT = { throttle: 0, brake: 0, steer: 0, drift: false, boost: false };

export function lapsFor(kind) {
  return kind === 'sprint' ? 1 : kind === 'elimination' ? 99 : 3;
}

export class Race {
  constructor({ location, kind = 'circuit', car, upgrades = {}, livery = null, rivals = RIVALS, difficulty = 'easy', autopilot = false, ghost = null, laps, track, playerSlot }) {
    this.location = location;
    this.kind = kind;
    this.track = track || getTrack(location, kind === 'sprint' ? 'sprint' : 'circuit');
    this.laps = laps ?? lapsFor(kind);
    this.difficulty = difficulty;
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.easy;
    this.time = -COUNTDOWN;
    this.status = 'countdown'; // countdown | racing | finished
    this.events = [];
    this.racers = [];
    this.steps = 0;
    this.ghost = ghost;          // { frames: Float32Array [x,y,z,h,...], lap }
    this.ghostFrames = [];
    this.bestLap = ghost ? ghost.lap : Infinity;
    this.coinsTaken = new Set();
    this.elimTimer = kind === 'elimination' ? ELIM_FIRST : Infinity;
    this.eliminatedCount = 0;
    this.seed = hashString(`${this.track.id}:${kind}:${difficulty}`);
    this.tmp = [];

    const field = kind === 'timetrial' ? [] : rivals;
    const slots = field.length + 1;
    const playerAt = playerSlot ?? Math.min(slots - 1, Math.floor(slots / 2));
    let rivalIndex = 0;
    for (let slot = 0; slot < slots; slot++) {
      if (slot === playerAt) {
        this.player = this.addRacer({
          key: 'player', name: 'You', flag: '⭐', isPlayer: true, car, stats: carStats(car, upgrades),
          color: livery?.color || car.colors[0], accent: livery?.accent || '#ffffff', slot, autopilot,
        });
      } else {
        const rv = field[rivalIndex++];
        this.addRacer({
          key: rv.id, name: rv.name, flag: rv.flag, isPlayer: false, car: { id: rv.car }, stats: rivalStats(rv, car, difficulty),
          color: rv.color, accent: rv.accent, slot, personality: rv,
        });
      }
    }
    this.totalDist = this.track.closed ? this.laps * this.track.length : this.track.finishDist - this.track.startDist;
    this.updatePositions(true);
  }

  addRacer({ key, name, flag, isPlayer, car, stats, color, accent, slot, personality, autopilot }) {
    const t = this.track;
    const g = t.gridSlot(slot);
    const p = t.pointAt(g.dist, g.lateral);
    const v = makeVehicle(p.x, t.heightAt(g.dist), p.z, p.heading, stats);
    const racer = {
      id: this.racers.length, key, name, flag, isPlayer, carId: car.id, color, accent, stats, vehicle: v,
      autopilot: !!autopilot, ai: null,
      index: t.indexAt(g.dist), along: g.dist, lateral: g.lateral,
      lap: t.closed ? 0 : 1, maxLap: t.closed ? 0 : 1, cp: t.closed ? t.gates.length : 0,
      raceDist: 0, position: slot + 1,
      finished: false, finishTime: null, place: 0, eliminated: false, elimAt: 0,
      wrongTime: 0, wrongWay: false, onShortcut: null, slipTime: 0, slipping: false,
      still: 0, lost: 0, goodAlong: g.dist, ghostTime: 0, lapStart: 0, lapTimes: [], bestLap: Infinity, coins: 0,
      wallCool: 0, bumpCool: 0, padCool: 0, throttleFrom: null, perfect: false,
    };
    if (!isPlayer || autopilot) {
      racer.ai = makeDriver(t, stats, personality || PILOT, this.difficulty, this.seed + racer.id * 7919);
    }
    this.racers.push(racer);
    return racer;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  get active() {
    return this.racers.filter((r) => !r.eliminated && !r.finished);
  }

  // ------------------------------------------------------------ step

  step(dt, input = NO_INPUT) {
    this.steps++;
    const wasCountdown = this.time < 0;
    this.time += dt;
    if (wasCountdown && this.time >= 0) {
      this.status = 'racing';
      this.emit('go');
      for (const r of this.racers) {
        const perfect = r.isPlayer && !r.autopilot ? r.throttleFrom !== null && r.throttleFrom > -1.0 : r.ai && r.ai.r() < r.ai.p.skill * 0.5;
        if (perfect) {
          r.vehicle.turbo = 0.9;
          r.perfect = true;
          this.emit('perfectStart', { racer: r.id });
        }
      }
    }

    if (this.status === 'countdown') {
      const held = input.throttle > 0;
      if (held && this.player.throttleFrom === null) this.player.throttleFrom = this.time;
      if (!held) this.player.throttleFrom = null;
      return;
    }

    const t = this.track;
    for (const r of this.racers) {
      if (r.eliminated) { this.coast(r, dt); continue; }
      let control;
      if (r.isPlayer && !r.autopilot && !r.finished) control = this.assist(r, input);
      else if (r.ai) { this.rubberBand(r); control = aiInput(this, r, dt); }
      else control = this.cruise(r);
      if (r.finished && r.ai) control = { ...control, throttle: Math.min(control.throttle, 0.55), boost: false };
      if (r.isPlayer && input.reset && !r.finished) this.respawn(r);

      r.braking = control.brake > 0.1;
      const v = r.vehicle;
      const surfKey = r.onShortcut ? r.onShortcut.surface : t.surfaceAt(r.index, r.lateral);
      v.surface = surfKey;
      const surf = surfaceFactor(surfKey, r.stats.offroad);
      if (r.slipping) surf.speed *= 1.06;
      const wasDrifting = v.drifting;
      const ev = stepVehicle(v, control, dt, surf);
      if (ev === 'turbo') this.emit('turbo', { racer: r.id, tier: v.lastTier });
      if (ev === 'drift') this.emit('drift', { racer: r.id });
      if (wasDrifting && !v.drifting && ev !== 'turbo') this.emit('driftEnd', { racer: r.id });

      this.collideStatic(r, dt);
      this.updateProgress(r, dt);
      const wasGrounded = v.grounded;
      followGround(v, this.groundHeight(r), dt);
      if (wasGrounded && !v.grounded) this.emit('air', { racer: r.id });
      if (v.landed) this.emit('land', { racer: r.id, air: v.airTime, impact: v.landed, x: v.x, y: v.y, z: v.z });
      if (v.landed) v.airTime = 0;
      this.checkPads(r);
      if (r.isPlayer) this.checkCoins(r);

      r.wallCool = Math.max(0, r.wallCool - dt);
      r.bumpCool = Math.max(0, r.bumpCool - dt);
      r.padCool = Math.max(0, r.padCool - dt);
      r.ghostTime = Math.max(0, r.ghostTime - dt);
      if (!r.finished && this.status === 'racing' && Math.abs(v.speed) < 1.5 && v.grounded) r.still += dt;
      else r.still = 0;
      if (r.still > STILL_RESPAWN) this.respawn(r);
    }
    this.collideCars(dt);
    this.slipstream(dt);
    this.updatePositions();
    this.updateElimination(dt);
    this.recordGhost();
  }

  // Easy mode nudges the steering away from walls a little.
  assist(r, input) {
    if (!this.diff.assist) return input;
    const t = this.track, v = r.vehicle;
    const s = t.sample(r.index);
    const edge = Math.abs(r.lateral) - (t.half - 1.5);
    if (edge <= 0 || r.onShortcut) return input;
    const toward = Math.sign(r.lateral);
    const err = wrapAngle(s.heading - v.heading);
    // Pointing further toward the wall than the road goes: steer back.
    const heading = -err * toward;
    if (heading >= 0) return input;
    return { ...input, steer: clamp((input.steer || 0) + toward * clamp(edge / 3, 0, 1) * 0.45, -1, 1) };
  }

  // Rubber-banding: small, capped speed changes that keep the pack close.
  rubberBand(r) {
    const d = r.ai, p = this.player;
    if (this.kind === 'timetrial' || r.isPlayer || p.finished || p.eliminated) { d.rubber = 1; return; }
    const finalStretch = this.totalDist - p.raceDist < this.track.length * 0.5 && this.track.closed && this.kind !== 'elimination';
    const gap = r.raceDist - p.raceDist;
    let target = 1;
    if (!finalStretch) {
      target = gap > 0 ? 1 - this.diff.slow * clamp((gap - 15) / 150, 0, 1) : 1 + this.diff.catchUp * clamp((-gap - 25) / 150, 0, 1);
    }
    d.rubber += (target - d.rubber) * 0.02;
  }

  cruise() {
    return NO_INPUT;
  }

  coast(r, dt) {
    const v = r.vehicle;
    v.vx *= Math.exp(-2 * dt);
    v.vz *= Math.exp(-2 * dt);
    v.px = v.x; v.pz = v.z;
    v.x += v.vx * dt;
    v.z += v.vz * dt;
    v.speed = Math.hypot(v.vx, v.vz);
  }

  groundHeight(r) {
    const t = this.track;
    if (r.onShortcut) {
      const sc = r.onShortcut;
      const pr = t.projectShortcut(sc, r.vehicle.x, r.vehicle.z);
      return lerp(sc.ya, sc.yb, clamp(pr.t, 0, 1));
    }
    return Math.abs(r.lateral) <= t.half + 0.5 ? t.heightAt(r.along) : t.pointAt(r.along).y;
  }

  // ------------------------------------------------------------ collisions

  collideStatic(r, dt) {
    const v = r.vehicle, t = this.track;
    const rad = r.stats.radius;
    const s = t.sample(r.index);
    const hint = { x: s.dx, z: s.dz };
    let worst = 0;
    for (const w of t.near(t.wallGrid, v.x, v.z, this.tmp)) worst = Math.max(worst, collideWall(v, w, rad, dt, hint));
    for (const p of t.near(t.propGrid, v.x, v.z, this.tmp)) worst = Math.max(worst, collideCircle(v, p.x, p.z, p.r, rad, dt, hint));
    if (worst > 5 && r.wallCool <= 0) {
      r.wallCool = 0.4;
      this.emit('wall', { racer: r.id, impact: worst, x: v.x, y: v.y, z: v.z });
    }
  }

  collideCars() {
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) {
      const a = rs[i];
      if (a.eliminated || a.ghostTime > 0) continue;
      for (let j = i + 1; j < rs.length; j++) {
        const b = rs[j];
        if (b.eliminated || b.ghostTime > 0) continue;
        const impact = bumpCars(a.vehicle, b.vehicle, a.stats.radius, b.stats.radius);
        if (impact > 2.5 && (a.isPlayer || b.isPlayer) && (a.bumpCool <= 0 || b.bumpCool <= 0)) {
          a.bumpCool = b.bumpCool = 0.5;
          const v = a.vehicle;
          this.emit('bump', { a: a.id, b: b.id, impact, x: (v.x + b.vehicle.x) / 2, y: v.y + 0.6, z: (v.z + b.vehicle.z) / 2 });
        }
      }
    }
  }

  // ------------------------------------------------------------ progress

  updateProgress(r, dt) {
    const t = this.track, v = r.vehicle;
    const prevAlong = r.along;
    let proj = t.nearestLocal(v.x, v.z, r.index, 12);
    if (Math.abs(proj.lateral) > t.wallOffset + 30) proj = t.nearestGlobal(v.x, v.z);
    let along = proj.along;
    r.onShortcut = null;
    if (t.shortcuts.length && Math.abs(proj.lateral) > t.half + 1) {
      const cut = t.shortcutAt(v.x, v.z);
      if (cut) {
        r.onShortcut = cut.sc;
        along = cut.sc.a + clamp(cut.t, 0, 1) * (cut.sc.b - cut.sc.a);
      }
    }
    r.along = along;
    r.index = t.indexAt(along);
    r.lateral = proj.lateral;
    if (r.finished || r.eliminated) { this.updateRaceDist(r); return; }

    const delta = t.delta(along, prevAlong);
    const continuous = Math.abs(delta) < 30;
    const inCorridor = Math.abs(r.lateral) <= t.wallOffset + 1 || !!r.onShortcut;
    // Lost in an infield or behind a wall: back to the last good spot.
    if (inCorridor) { r.lost = 0; r.goodAlong = along; } else r.lost += dt;
    if (r.lost > (r.ai && !r.isPlayer ? 1.5 : 3)) { this.respawn(r, r.goodAlong); return; }
    const gates = t.gates;

    if (t.closed) {
      const crossedFwd = delta > 0 && along < prevAlong;
      const crossedBack = delta < 0 && along > prevAlong;
      if (crossedFwd) {
        if (r.cp >= gates.length && continuous) this.completeLap(r);
        else this.missed(r);
      } else if (crossedBack) {
        if (continuous) { r.lap--; r.cp = gates.length; }
      } else {
        this.passGates(r, prevAlong, along, inCorridor && continuous, continuous);
      }
    } else {
      this.passGates(r, prevAlong, along, inCorridor && continuous, continuous);
      if (along >= t.finishDist && prevAlong < t.finishDist) {
        if (r.cp >= gates.length) this.finish(r);
        else this.missed(r);
      }
    }

    // Wrong way: facing back down the road while moving.
    const s = t.sample(r.index);
    const facing = Math.sin(v.heading) * s.dx + Math.cos(v.heading) * s.dz;
    if (facing < -0.35 && v.speed > 3 && !r.onShortcut) r.wrongTime += dt;
    else r.wrongTime = Math.max(0, r.wrongTime - dt * 2);
    const wrong = r.wrongTime > 1;
    if (wrong !== r.wrongWay) {
      r.wrongWay = wrong;
      if (r.isPlayer) this.emit(wrong ? 'wrongWay' : 'rightWay', { racer: r.id });
    }
    this.updateRaceDist(r);
  }

  passGates(r, prevAlong, along, counts, continuous) {
    const gates = this.track.gates;
    while (counts && r.cp < gates.length && prevAlong < gates[r.cp] && along >= gates[r.cp]) {
      r.cp++;
      if (r.isPlayer) this.emit('gate', { racer: r.id, gate: r.cp });
    }
    while (continuous && r.cp > 0 && along < gates[r.cp - 1] && prevAlong >= gates[r.cp - 1] && along < prevAlong) r.cp--;
  }

  updateRaceDist(r) {
    const t = this.track;
    r.raceDist = t.closed ? (r.lap - 1) * t.length + r.along : r.along - t.startDist;
  }

  completeLap(r) {
    r.lap++;
    r.cp = 0;
    // Re-crossing after backing over the line restores the lap, nothing more.
    if (r.lap <= r.maxLap) return;
    r.maxLap = r.lap;
    if (r.lap >= 2) {
      const lapTime = this.time - r.lapStart;
      r.lapTimes.push(lapTime);
      if (lapTime < r.bestLap) r.bestLap = lapTime;
      if (r.isPlayer) {
        this.emit('lap', { racer: r.id, lap: r.lap - 1, time: lapTime });
        if (this.kind === 'timetrial' && lapTime < this.bestLap) {
          this.bestLap = lapTime;
          this.newGhost = { frames: Float32Array.from(this.ghostFrames), lap: lapTime };
          this.emit('ghostBest', { time: lapTime });
        }
      }
    }
    r.lapStart = this.time;
    if (r.isPlayer) this.ghostFrames.length = 0;
    if (this.track.closed && r.lap > this.laps) this.finish(r);
    else if (r.isPlayer && r.lap === this.laps && this.laps > 1 && this.kind !== 'elimination') this.emit('finalLap', { racer: r.id });
  }

  // Crossing the line or the finish with a gate missed: back to that gate.
  missed(r) {
    const t = this.track;
    const gate = t.gates[r.cp] ?? t.gates[0];
    this.emit('missed', { racer: r.id });
    this.respawn(r, gate - 12);
  }

  finish(r) {
    if (r.finished) return;
    r.finished = true;
    r.finishTime = this.time;
    r.place = this.racers.filter((o) => o.finished && !o.eliminated).length;
    if (r.ai && r.isPlayer === false) r.ai.rubber = 1;
    if (r.isPlayer && !r.ai) {
      // Let the autopilot bring the car home after the flag.
      r.ai = makeDriver(this.track, r.stats, PILOT, this.difficulty, this.seed + 1);
      r.autopilot = true;
    }
    this.emit('finish', { racer: r.id, place: r.place, time: r.finishTime });
    if (r.isPlayer) this.end();
  }

  end() {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.endTime = this.time;
    this.emit('raceEnd', { place: this.player.place });
  }

  respawn(r, dist = r.along) {
    const t = this.track;
    const d = t.closed ? t.wrap(dist) : clamp(dist, t.startDist - 30, t.finishDist - 5);
    const lat = clamp(t.sample(t.indexAt(d)).line * 0.5, -t.half + 2, t.half - 2);
    const p = t.pointAt(d, lat);
    const v = r.vehicle;
    const prev = r.along;
    v.x = v.px = p.x;
    v.z = v.pz = p.z;
    v.y = t.heightAt(d) + 0.3;
    v.vx = v.vz = v.vy = 0;
    v.speed = 0;
    v.heading = p.heading;
    v.drifting = false;
    v.grounded = false;
    r.index = t.indexAt(d);
    r.along = d;
    r.lateral = lat;
    r.still = 0;
    r.wrongTime = 0;
    r.ghostTime = 1.5;
    // Moving backward over gates un-counts them; over the line, a lap.
    if (t.closed) {
      const delta = t.delta(d, prev);
      if (delta < 0 && d > prev) { r.lap--; r.cp = t.gates.length; }
    }
    while (r.cp > 0 && d < t.gates[r.cp - 1]) r.cp--;
    this.updateRaceDist(r);
    this.emit('respawn', { racer: r.id, dist: d });
  }

  // ------------------------------------------------------------ extras

  checkPads(r) {
    const v = r.vehicle;
    if (!v.grounded || r.padCool > 0) return;
    const t = this.track;
    for (const pad of t.pads) {
      const k = t.delta(r.along, pad.dist);
      if (k >= 0 && k <= pad.length && Math.abs(r.lateral - pad.lateral) < pad.width / 2 + 0.6) {
        v.turbo = Math.max(v.turbo, 1.1);
        r.padCool = 1;
        this.emit('pad', { racer: r.id });
        return;
      }
    }
  }

  checkCoins(r) {
    const v = r.vehicle;
    for (const c of this.track.coins) {
      if (this.coinsTaken.has(c.id)) continue;
      const dx = c.x - v.x, dz = c.z - v.z;
      if (dx * dx + dz * dz < 6 && Math.abs(c.y - 1 - v.y) < 2.8) {
        this.coinsTaken.add(c.id);
        r.coins++;
        this.emit('coin', { racer: r.id, id: c.id, x: c.x, y: c.y, z: c.z });
      }
    }
  }

  slipstream(dt) {
    const t = this.track;
    for (const r of this.racers) {
      if (r.eliminated || r.vehicle.speed < 15) { r.slipTime = 0; r.slipping = false; continue; }
      let behind = false;
      for (const o of this.racers) {
        if (o === r || o.eliminated) continue;
        const gap = t.delta(o.along, r.along);
        if (gap > SLIP_GAP[0] && gap < SLIP_GAP[1] && Math.abs(o.lateral - r.lateral) < SLIP_LATERAL) { behind = true; break; }
      }
      r.slipTime = behind ? r.slipTime + dt : Math.max(0, r.slipTime - dt * 3);
      const slipping = r.slipTime > 0.5;
      if (slipping) r.vehicle.meter = Math.min(1, r.vehicle.meter + 0.12 * dt);
      if (slipping && !r.slipping && r.isPlayer) this.emit('slip', { racer: r.id });
      r.slipping = slipping;
    }
  }

  // Order: finishers by place, then the field by race distance, then the
  // eliminated (most recently eliminated first).
  updatePositions(initial = false) {
    const order = this.racers.slice().sort((a, b) => {
      if (a.finished !== b.finished && !a.eliminated && !b.eliminated) return a.finished ? -1 : 1;
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.eliminated) return b.elimAt - a.elimAt;
      if (a.finished) return a.place - b.place;
      return b.raceDist - a.raceDist;
    });
    const p = this.player;
    const before = p.position;
    order.forEach((r, i) => { r.position = i + 1; });
    this.order = order;
    if (!initial && this.status === 'racing' && p.position !== before && !p.finished) {
      const passed = p.position < before ? order[p.position] : order[p.position - 2];
      this.emit(p.position < before ? 'overtake' : 'overtaken', { racer: p.id, other: passed.id, name: passed.name, position: p.position });
    }
  }

  updateElimination(dt) {
    if (this.kind !== 'elimination' || this.status !== 'racing') return;
    this.elimTimer -= dt;
    if (this.elimTimer > 0) return;
    this.elimTimer = ELIM_EVERY;
    const alive = this.order.filter((r) => !r.eliminated);
    const out = alive[alive.length - 1];
    out.eliminated = true;
    out.elimAt = this.time;
    out.place = alive.length;
    this.eliminatedCount++;
    this.emit('eliminated', { racer: out.id, name: out.name, place: out.place });
    if (out.isPlayer) {
      out.finished = true;
      out.finishTime = this.time;
      this.end();
    } else if (alive.length - 1 === 1) {
      const winner = alive[0];
      winner.finished = true;
      winner.finishTime = this.time;
      winner.place = 1;
      this.emit('finish', { racer: winner.id, place: 1, time: this.time });
      if (winner.isPlayer) this.end();
    }
    this.updatePositions(true);
  }

  recordGhost() {
    if (this.kind !== 'timetrial' || this.steps % GHOST_EVERY) return;
    const v = this.player.vehicle;
    if (this.player.lap < 1 || this.player.finished) return;
    this.ghostFrames.push(v.x, v.y, v.z, v.heading);
  }

  // Ghost pose for the current lap, or null.
  ghostPose() {
    const g = this.ghost;
    if (!g || this.player.lap < 1 || this.player.finished) return null;
    const f = (this.time - this.player.lapStart) / (GHOST_EVERY * DT);
    const i = Math.floor(f), n = g.frames.length / 4;
    if (i >= n - 1 || i < 0) return null;
    const k = f - i, a = i * 4, b = a + 4, fr = g.frames;
    return {
      x: lerp(fr[a], fr[b], k), y: lerp(fr[a + 1], fr[b + 1], k), z: lerp(fr[a + 2], fr[b + 2], k),
      heading: fr[a + 3] + wrapAngle(fr[b + 3] - fr[a + 3]) * k,
    };
  }

  // Final standings. Racers still driving get an estimated finish time from
  // their average pace so far.
  results() {
    const total = this.totalDist;
    const rows = this.racers.map((r) => {
      let time = r.finishTime;
      if (!r.finished && !r.eliminated) {
        const pace = Math.max(8, r.raceDist / Math.max(1, this.time));
        time = this.time + Math.max(0, total - r.raceDist) / pace;
      }
      return { id: r.id, key: r.key, name: r.name, flag: r.flag, color: r.color, carId: r.carId, isPlayer: r.isPlayer, time, eliminated: r.eliminated, place: r.place, bestLap: r.bestLap, elimAt: r.elimAt };
    });
    if (this.kind === 'elimination') {
      rows.sort((a, b) => (a.eliminated !== b.eliminated ? (a.eliminated ? 1 : -1) : a.eliminated ? b.elimAt - a.elimAt : this.racers[a.id].position - this.racers[b.id].position));
    } else {
      rows.sort((a, b) => {
        const fa = this.racers[a.id].finished, fb = this.racers[b.id].finished;
        if (fa && fb) return a.place - b.place;
        if (fa !== fb) return fa ? -1 : 1;
        return a.time - b.time;
      });
    }
    rows.forEach((row, i) => { row.place = i + 1; });
    return rows;
  }
}

// Runs a whole race headlessly with every car on autopilot. Used by tests
// and to compute time-trial medal times.
export function simulate(opts, maxTime = 600) {
  const race = new Race({ ...opts, autopilot: true });
  const steps = Math.ceil((maxTime + COUNTDOWN) / DT);
  for (let i = 0; i < steps; i++) {
    race.step(DT);
    race.events.length = 0;
    if (opts.untilAll ? race.racers.every((r) => r.finished || r.eliminated) : race.status === 'finished') break;
  }
  return race;
}

// Medal times for a time trial: a flying lap by the autopilot. `medalRace`
// and `medalsFrom` let a caller spread the simulation over several frames.
export function medalRace(location, car) {
  return new Race({ location, kind: 'timetrial', car, laps: 2, autopilot: true });
}

export function medalsFrom(race) {
  const lap = race.player.lapTimes[1] || race.player.lapTimes[0] || 60;
  return { gold: lap * 1.05, silver: lap * 1.15, bronze: lap * 1.3, pilot: lap };
}

export function medalTimes(location, car) {
  const race = medalRace(location, car);
  for (let i = 0; i < 300 / DT && race.status !== 'finished'; i++) { race.step(DT); race.events.length = 0; }
  return medalsFrom(race);
}

export { Track };
