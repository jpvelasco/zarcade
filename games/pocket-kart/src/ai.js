// AI drivers. Each one reads the race and returns the same controls a player
// would press: { steer, gas, brake, drift, item }. They follow the track's
// racing line with pure pursuit, slow for tight bends from the curvature
// ahead, drift long bends for mini-turbos, and use items in character.
import { KART, topSpeed } from './kart.js';
import { SAMPLE_STEP, lapDelta, linePoint, projectLine } from './track.js';
import { clamp, hashFloat, wrapAngle } from './math.js';
import { PERSONALITIES } from './karts.js';

// Difficulty classes: everyone's base speed, and how sharp the AI drives.
// The rubber band only ever nudges an AI's top speed, within these caps:
// `ahead` is how much a rival in front of you may ease off, `behind` how
// much a rival behind you may speed up.
export const CLASSES = [
  { id: 'cosy', name: 'Cosy', speed: 0.84, skill: 0.82, ahead: 0.1, behind: 0.03, blurb: 'Gentle speed, friendly rivals' },
  { id: 'zippy', name: 'Zippy', speed: 1.0, skill: 0.97, ahead: 0.05, behind: 0.05, blurb: 'Proper racing' },
  { id: 'turbo', name: 'Turbo', speed: 1.12, skill: 1.0, ahead: 0.04, behind: 0.04, blurb: 'Fast and fierce' },
];
export const classById = (id) => CLASSES.find((c) => c.id === id) || CLASSES[1];

const STEER_GAIN = 2.8;

export class Driver {
  constructor(personality, { seed = 1, skill = 1, index = 0 } = {}) {
    this.p = typeof personality === 'string' ? PERSONALITIES[personality] : personality;
    this.skill = clamp(this.p.skill * skill, 0.5, 1.02);
    this.seed = seed;
    this.index = index;
    this.phase = hashFloat(seed, index, 3) * 100;
    this.drifting = false;
    this.holdT = 0;
    this.plan = -1; // shortcut index it is taking
    this.t = 0;
    this.itemWait = 0;
  }

  // The controls for kart `k` in `race` this step.
  controls(race, k, dt) {
    this.t += dt;
    const track = race.track;
    const p = this.p;
    const v = Math.max(0, k.v);
    const top = topSpeed(k);
    const look = (46 + 0.4 * v) * p.look;

    // ---- where to aim
    let bias = p.bias * 0.5 + Math.sin(this.t * 0.7 + this.phase) * 0.15;
    bias += this.avoidance(race, k);
    bias += this.seekBox(race, k);
    bias = clamp(bias, -1, 1);
    let target = null;
    const sc = this.shortcutPlan(race, k);
    if (sc) target = this.shortcutTarget(sc, k, look, track);
    if (!target) target = linePoint(track, k.s + look, bias);

    let err = wrapAngle(Math.atan2(target.y - k.y, target.x - k.x) - k.h);
    const wob = Math.sin(this.t * 2.3 + this.phase) * p.wobble * 0.18 * (1.05 - this.skill);
    let steer = clamp(err * STEER_GAIN + wob, -1, 1);

    // ---- speed from the tightest bend we will reach before we could brake
    const brakeDist = (v * v) / (2 * KART.brake) + 40;
    const kMax = curvatureAhead(track, k.s, Math.min(420, brakeDist + 80));
    const want = Math.min(top * 1.5, (cornerSpeed(k, kMax, this.drifting) * this.skill) / p.brake);
    let gas = 1, brake = false;
    if (v > want + 25) { gas = 0; brake = v > want + 70; }
    else if (v > want) gas = 0.3;

    // ---- drift long bends
    let drift = this.decideDrift(race, k, err, v);
    if (drift && this.drifting && k.drift) {
      // Steering inside a drift tightens or widens it around the target.
      steer = clamp(err * STEER_GAIN * 1.4 + k.drift * 0.15, -1, 1);
    }
    if (k.cometT > 0) { gas = 1; brake = false; drift = false; }

    const item = this.decideItem(race, k, dt);
    return this.unstick(race, k, dt, { steer, gas, brake, drift, item });
  }

  // Steer around a kart close ahead.
  avoidance(race, k) {
    let push = 0;
    for (const o of race.karts) {
      if (o === k) continue;
      const ahead = lapDelta(race.track, k.s, o.s);
      if (ahead < -10 || ahead > 70) continue;
      const lat = o.lat ?? 0;
      const mine = k.lat ?? 0;
      const d = lat - mine;
      if (Math.abs(d) > 34) continue;
      const room = race.track.main.hw[k.hint] || 60;
      // Bumpers lean in; everyone else slips past.
      const dir = this.p.bump > 0.6 && k.v > o.v ? Math.sign(d) * 0.4 : -Math.sign(d || 1);
      push += (dir * (34 - Math.abs(d))) / room;
    }
    return push;
  }

  // With no item, drift toward the nearest box in the next row.
  seekBox(race, k) {
    if (k.item || k.rollT > 0 || !race.itemsOn) return 0;
    let best = null, bestAhead = Infinity;
    for (const b of race.boxes) {
      if (b.respawn > 0) continue;
      const ahead = lapDelta(race.track, k.s, b.s);
      if (ahead < 20 || ahead > 260) continue;
      if (ahead < bestAhead - 30 || (Math.abs(ahead - bestAhead) <= 30 && Math.abs(b.lat - (k.lat ?? 0)) < Math.abs(best.lat - (k.lat ?? 0)))) {
        best = b; bestAhead = ahead;
      }
    }
    if (!best) return 0;
    const room = race.track.main.hw[best.i] - 18;
    const line = race.track.racingLine[best.i];
    return clamp((best.lat - line) / Math.max(20, room), -1, 1) * 0.9 * this.skill;
  }

  // Whether to take a shortcut: personalities that like them do when they
  // can boost through.
  shortcutPlan(race, k) {
    const track = race.track;
    if (this.plan >= 0) {
      const sc = track.shortcuts[this.plan];
      const into = lapDelta(track, sc.sFrom, k.s);
      // Done, too far back, or the entry was missed: back to the road.
      const missed = into > 50 && k.shortcut !== sc.index;
      if (missed || into > sc.sTo - sc.sFrom + 20 || into < -260) this.plan = -1;
      else return sc;
    }
    for (const sc of track.shortcuts) {
      const ahead = lapDelta(track, k.s, sc.sFrom);
      if (ahead < 140 || ahead > 340 || k.drift) continue;
      const boost = k.item === 'mushroom' || k.item === 'triple' || k.cometT > 0;
      const roll = hashFloat(this.seed, Math.floor(race.time / 20), sc.index + 7);
      if (!boost || roll >= this.p.shortcut) continue;
      // Only when lined up well enough to make the turn in.
      const i = Math.min(sc.line.n - 1, 6);
      const err = wrapAngle(Math.atan2(sc.line.y[i] - k.y, sc.line.x[i] - k.x) - k.h);
      if (Math.abs(err) > 0.55) continue;
      this.plan = sc.index;
      return sc;
    }
    return null;
  }

  // On the way in, the shortcut is treated as the road's continuation.
  shortcutTarget(sc, k, look, track) {
    const line = sc.line;
    let s;
    if (k.shortcut === sc.index) s = projectLine(line, k.x, k.y).s + look;
    else {
      const ahead = lapDelta(track, k.s, sc.sFrom);
      s = Math.max(30, look - Math.max(0, ahead));
    }
    const i = Math.min(line.n - 1, Math.round(Math.min(line.length, s) / SAMPLE_STEP));
    return { x: line.x[i], y: line.y[i] };
  }

  // Wedged against something: back out and point down the road again.
  unstick(race, k, dt, c) {
    if (k.wobbleT > 0 || race.state !== 'racing') { this.stuckT = 0; return c; }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      const t = linePoint(race.track, k.s + 80, 0);
      const err = wrapAngle(Math.atan2(t.y - k.y, t.x - k.x) - k.h);
      return { steer: clamp(-err * 2, -1, 1), gas: 0, brake: true, drift: false, item: false };
    }
    if (c.gas > 0.5 && Math.abs(k.v) < 35) this.stuckT = (this.stuckT || 0) + dt;
    else this.stuckT = Math.max(0, (this.stuckT || 0) - dt * 2);
    if (this.stuckT > 1.2) {
      this.stuckT = 0;
      this.reverseT = 0.7;
      this.plan = -1;
    }
    return c;
  }

  decideDrift(race, k, err, v) {
    const track = race.track;
    const p = this.p;
    if (this.drifting) {
      if (!k.drift && k.hopT > 0.35) { this.drifting = false; return false; }
      this.holdT += 1 / 120;
      if (this.holdT < 0.3) return true;
      // Release when the bend runs out, the target swings outside, or the
      // spark tier we were patient for is reached and the bend eases.
      const left = turnAhead(track, k.s, 130) * (k.drift || 1);
      const outside = err * (k.drift || 1) < -0.35;
      const tierGoal = Math.min(3, 1 + p.patience);
      if (outside || left < 0.2 || (k.tier >= tierGoal && left < 0.4)) {
        this.drifting = false;
        return false;
      }
      return true;
    }
    if (v < KART.driftMin + 25 || k.wobbleT > 0 || k.cometT > 0 || this.plan >= 0) return false;
    const bend = turnAhead(track, k.s + 20, 260);
    if (Math.abs(bend) < 0.8 || Math.abs(turnAhead(track, k.s, 110)) < 0.3) return false;
    // Same bend, same choice: seeded per bend so races replay exactly.
    const bendId = Math.floor((k.s + 30) / 200);
    if (hashFloat(this.seed, bendId, Math.floor(race.time / 30) + 11) > p.drift * this.skill) return false;
    if (Math.sign(err) !== Math.sign(bend) && Math.abs(err) > 0.1) return false;
    this.drifting = true;
    this.holdT = 0;
    return true;
  }

  decideItem(race, k, dt) {
    if (!k.item || k.rollT > 0) { this.itemWait = 0; return false; }
    this.itemWait += dt;
    const p = this.p;
    const track = race.track;
    const straight = Math.abs(turnAhead(track, k.s, 240)) < 0.35;
    const behind = race.nearestBehind(k);
    const ahead = race.racerAhead(k);
    switch (k.item) {
      case 'mushroom':
      case 'triple':
        if (this.plan >= 0) return lapDelta(track, track.shortcuts[this.plan].sFrom, k.s) > -30;
        if (p.items === 'eager') return straight;
        return straight && k.v > topSpeed(k) * 0.8 && this.itemWait > 1;
      case 'star':
        if (behind && behind.gap < (p.items === 'trapper' ? 160 : 90)) return true;
        return this.itemWait > (p.items === 'trapper' ? 8 : 4);
      case 'shield':
        if (race.jellyChasing(k)) return true;
        if (p.items === 'careful') return this.itemWait > 9 || (behind && behind.gap < 40);
        return this.itemWait > 1.5;
      case 'jelly':
        if (!ahead) return this.itemWait > 6;
        if (p.items === 'hunter' || p.items === 'eager') return ahead.gap < 1000;
        return ahead.gap < 600 || this.itemWait > 5;
      case 'comet':
        return true;
      default:
        return true;
    }
  }
}

// Fastest speed that still makes a bend of curvature kMax. Normal steering
// fades a little at speed; a drift keeps its full turn rate.
export function cornerSpeed(k, kMax, drifting = false) {
  if (kMax < 1e-4) return Infinity;
  const R = 1.28 / kMax; // the racing line is wider than the centreline
  const top = topSpeed(k);
  const T = KART.turn * k.mods.turn * 0.94;
  const plain = (R * T) / (1 + (KART.turnFade * R * T) / top);
  return drifting ? Math.max(plain, R * (KART.driftTurn + KART.driftRange * 0.55) * k.mods.turn) : plain;
}

// Largest |curvature| from s over `ahead` units, read every other sample.
export function curvatureAhead(track, s, ahead) {
  const m = track.main;
  const i0 = Math.round(s / SAMPLE_STEP);
  const steps = Math.max(1, Math.round(ahead / SAMPLE_STEP));
  let best = 0;
  for (let d = 0; d < steps; d += 2) {
    // Average neighbours so one noisy sample doesn't slam the brakes.
    const i = (((i0 + d) % m.n) + m.n) % m.n;
    const k = Math.abs((m.k[i] + m.k[(i + 1) % m.n] + m.k[(i + m.n - 1) % m.n]) / 3);
    if (k > best) best = k;
  }
  return best;
}

// Total signed turning (radians) of the centreline over the next `ahead`.
export function turnAhead(track, s, ahead) {
  const m = track.main;
  const i0 = Math.round(s / SAMPLE_STEP);
  const steps = Math.max(1, Math.round(ahead / SAMPLE_STEP));
  let sum = 0;
  for (let d = 0; d < steps; d++) sum += m.k[(((i0 + d) % m.n) + m.n) % m.n] * SAMPLE_STEP;
  return sum;
}

// Controls for a kart riding a comet or finishing its victory lap: a
// careful line follower with no items and no drifting.
export function autopilot(race, k) {
  const track = race.track;
  const look = 50 + 0.45 * Math.max(0, k.v);
  const t = linePoint(track, k.s + look, 0);
  const err = wrapAngle(Math.atan2(t.y - k.y, t.x - k.x) - k.h);
  const kMax = curvatureAhead(track, k.s, 260);
  const riding = k.cometT > 0 ? 1.8 : 1;
  const corner = cornerSpeed(k, kMax) * riding * 0.95;
  const v = Math.max(0, k.v);
  return { steer: clamp(err * STEER_GAIN, -1, 1), gas: v > corner ? 0 : 1, brake: v > corner + 70, drift: false, item: false, cap: corner };
}
