import { clamp, rng, wrapAngle, lerp } from './math.js';
import { CAR_BY_ID, carStats } from './cars.js';
import { surfaceFactor } from './vehicle.js';

// The six rivals. pace scales their speed; skill how close to the ideal
// corner speed they dare; aggression how much they bump instead of passing
// around; drift how often they slide corners; consistency how rarely they
// make small mistakes; boost how eagerly they burn the meter.
export const RIVALS = [
  { id: 'yuki', name: 'Yuki', flag: '🇯🇵', car: 'sports', color: '#e83a5a', accent: '#ffffff', pace: 1.0, skill: 0.97, aggression: 0.15, drift: 0.25, consistency: 0.96, boost: 0.7, offroadLove: 0.1, quip: 'Smooth is fast.' },
  { id: 'bruno', name: 'Bruno', flag: '🇧🇷', car: 'muscle', color: '#2ac46b', accent: '#ffd23d', pace: 0.995, skill: 0.9, aggression: 0.9, drift: 0.35, consistency: 0.82, boost: 0.95, offroadLove: 0.3, quip: 'Coming through!' },
  { id: 'ingrid', name: 'Ingrid', flag: '🇮🇸', car: 'rally', color: '#4ab3ff', accent: '#ffffff', pace: 0.985, skill: 0.93, aggression: 0.35, drift: 1, consistency: 0.88, boost: 0.6, offroadLove: 0.8, quip: 'Sideways is the best way!' },
  { id: 'amara', name: 'Amara', flag: '🇰🇪', car: 'hatch', color: '#ffb020', accent: '#1a1a1a', pace: 0.975, skill: 0.94, aggression: 0.25, drift: 0.3, consistency: 0.98, boost: 0.5, offroadLove: 0.2, quip: 'Steady wins the cup.' },
  { id: 'pierre', name: 'Pierre', flag: '🇫🇷', car: 'bug', color: '#b06cff', accent: '#ffe07a', pace: 1.0, skill: 0.87, aggression: 0.5, drift: 0.7, consistency: 0.68, boost: 1, offroadLove: 0.5, quip: 'Voilà! Too fast for you?' },
  { id: 'tilly', name: 'Tilly', flag: '🇦🇺', car: 'pickup', color: '#ff7a2a', accent: '#3a2a22', pace: 0.97, skill: 0.91, aggression: 0.65, drift: 0.5, consistency: 0.86, boost: 0.6, offroadLove: 1, quip: 'No worries, mate!' },
];
export const RIVAL_BY_ID = Object.fromEntries(RIVALS.map((r) => [r.id, r]));

// The autopilot that drives the player's car in tests and attract mode.
export const PILOT = { id: 'pilot', name: 'Pilot', pace: 1, skill: 0.97, aggression: 0.3, drift: 0.4, consistency: 1, boost: 0.8, offroadLove: 0.5 };

export const DIFFICULTY = {
  easy: { label: 'Easy', pace: 0.86, slow: 0.1, catchUp: 0.025, mistakes: 1.6, assist: true },
  normal: { label: 'Normal', pace: 0.93, slow: 0.07, catchUp: 0.035, mistakes: 1, assist: false },
  hard: { label: 'Hard', pace: 0.985, slow: 0.04, catchUp: 0.045, mistakes: 0.6, assist: false },
};

// Rivals race in the player's class: their top speed and acceleration
// follow the player's (un-upgraded) car, but they keep their own car's grip,
// steering, drift, weight and off-road skill.
export function rivalStats(rival, playerCar, difficulty = 'easy') {
  const own = carStats(CAR_BY_ID[rival.car]);
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.easy;
  const scale = diff.pace * rival.pace;
  const base = playerCar.stats;
  own.maxSpeed = base.maxSpeed * scale;
  own.accel = base.accel * (0.5 + 0.5 * scale);
  return own;
}

// Highest speed at which a car with turn rate `turn` can hold curvature k.
// Matches the steering model in vehicle.js: turn rate = turn * min(1, v/6) / (1 + v/70).
export function cornerSpeed(k, turn) {
  k = Math.abs(k);
  if (k < 1e-4) return Infinity;
  const c = turn;
  const a = k / 70, b = k;
  const v = (-b + Math.sqrt(b * b + 4 * a * c)) / (2 * a);
  return Math.max(6, v);
}

// Target speed for every sample: corner limits plus braking zones.
export function speedProfile(track, stats, skill) {
  const n = track.samples.length;
  const out = new Float32Array(n);
  const look = 4;
  for (let i = 0; i < n; i++) {
    let k = 0;
    for (let j = 0; j <= look; j++) k = Math.max(k, Math.abs(track.sample(i + j).curv));
    const surf = surfaceFactor(track.samples[i].surface, stats.offroad);
    const v = cornerSpeed(k, stats.turn * 0.86 * skill) * (0.8 + 0.2 * surf.grip);
    out[i] = Math.min(stats.maxSpeed * surf.speed, v);
  }
  const decel = stats.brake * 0.55;
  for (let pass = 0; pass < (track.closed ? 2 : 1); pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = track.closed ? out[(i + 1) % n] : out[Math.min(n - 1, i + 1)];
      out[i] = Math.min(out[i], Math.sqrt(next * next + 2 * decel * track.step));
    }
  }
  return out;
}

export function makeDriver(track, stats, personality, difficulty, seed) {
  const r = rng(seed);
  return {
    p: personality,
    profile: speedProfile(track, stats, personality.skill),
    r,
    laneShift: 0,
    bias: (r() * 2 - 1) * 1.2,
    mistake: 0,
    mistakeIn: 6 + r() * 14,
    mistakeRate: (DIFFICULTY[difficulty] || DIFFICULTY.easy).mistakes,
    reverse: 0,
    stuck: 0,
    shortcutLap: -1,
    useShortcut: false,
    drifting: false,
    rubber: 1,
  };
}

// One AI decision. Reads the race, never changes anything except the
// driver's own memory.
export function aiInput(race, racer, dt) {
  const d = racer.ai, p = d.p, v = racer.vehicle, track = race.track;
  const speed = v.speed;
  const out = { throttle: 1, brake: 0, steer: 0, drift: false, boost: false };

  // Mistakes: brief lifts or wobbles, rarer for consistent drivers.
  d.mistakeIn -= dt * d.mistakeRate;
  if (d.mistakeIn <= 0) {
    d.mistake = 0.6 + d.r() * 0.6;
    d.mistakeWobble = (d.r() * 2 - 1) * 0.35;
    d.mistakeIn = (8 + d.r() * 18) / Math.max(0.05, 1.05 - p.consistency);
  }
  if (d.mistake > 0) d.mistake -= dt;

  // Decide once per lap whether to take a shortcut.
  if (track.shortcuts.length && d.shortcutLap !== racer.lap) {
    d.shortcutLap = racer.lap;
    d.useShortcut = d.r() < 0.15 + p.offroadLove * 0.55;
  }

  // Where to aim.
  const look = 7 + Math.max(0, speed) * 0.42;
  const idx = racer.index;
  const s = track.sample(idx);
  let tx, tz;
  let target = d.profile[track.indexAt(racer.along + Math.max(0, speed) * 0.35)];
  let onCut = null;
  if (d.useShortcut) {
    for (const sc of track.shortcuts) {
      const before = track.delta(sc.a, racer.along);
      if (before < 30 && track.delta(racer.along, sc.b) < -12) { onCut = sc; break; }
    }
  }
  if (onCut) {
    const pr = track.projectShortcut(onCut, v.x, v.z);
    const t = clamp((pr.t * onCut.len + look) / onCut.len, 0.02, 1);
    tx = lerp(onCut.ax, onCut.bx, t);
    tz = lerp(onCut.az, onCut.bz, t);
    const surf = surfaceFactor(onCut.surface, v.stats.offroad);
    target = Math.min(target * 1.2, v.stats.maxSpeed * surf.speed * 0.92);
    if (pr.t > 0.85) target = Math.min(target, d.profile[track.indexAt(onCut.b + 10)] * 1.05);
  } else {
    const aim = track.pointAt(racer.along + look, clamp(track.sample(track.indexAt(racer.along + look)).line * p.skill + d.bias + d.laneShift, -track.half + 1.6, track.half - 1.6));
    tx = aim.x;
    tz = aim.z;
  }

  // Overtaking: pick a side around the car ahead, unless pushy.
  let blocker = null, gapAhead = Infinity;
  for (const o of race.racers) {
    if (o === racer || o.eliminated || o.ghost) continue;
    const gap = track.delta(o.along, racer.along);
    if (gap > 1 && gap < 22 && Math.abs(o.lateral - racer.lateral) < 3.4 && gap < gapAhead) { blocker = o; gapAhead = gap; }
  }
  let shiftTarget = 0;
  if (blocker && speed > blocker.vehicle.speed - 2) {
    const side = blocker.lateral > racer.lateral ? -1 : 1;
    const room = side < 0 ? blocker.lateral + track.half : track.half - blocker.lateral;
    const dir = room > 4.5 ? side : -side;
    shiftTarget = dir * (4.2 - 2.6 * p.aggression) + (blocker.lateral - s.line) * 0.6;
  }
  d.laneShift += (shiftTarget - d.laneShift) * Math.min(1, dt * 1.5);

  // Steering toward the aim point.
  const want = Math.atan2(tx - v.x, tz - v.z);
  let err = wrapAngle(want - v.heading);
  if (d.mistake > 0) err += d.mistakeWobble * 0.3;
  out.steer = clamp(-err * 2.6, -1, 1);

  // Speed.
  target *= d.rubber;
  if (d.mistake > 0) target *= 0.86;
  if (speed < target - 0.4) out.throttle = 1;
  else if (speed > target + 1.5) { out.throttle = 0; out.brake = clamp((speed - target) / 6, 0.2, 1); }
  else out.throttle = 0.4;

  // Drifting through long bends.
  const ahead = Math.abs(track.sample(track.indexAt(racer.along + 10)).wide);
  if (!d.drifting && !onCut && p.drift > 0.2 && speed > 17 && ahead > 0.016 && Math.abs(out.steer) > 0.35 && d.r() < p.drift * 0.08) d.drifting = true;
  if (d.drifting && (ahead < 0.009 || speed < 13 || onCut)) d.drifting = false;
  out.drift = d.drifting;

  // Boost on straights.
  const straight = Math.abs(track.sample(track.indexAt(racer.along + 30)).wide) < 0.006 && Math.abs(s.wide) < 0.008;
  out.boost = straight && v.meter > 0.55 - 0.3 * p.boost && !onCut;

  // Unsticking: back up and turn when pinned.
  if (race.status === 'racing' && Math.abs(speed) < 2 && out.throttle > 0) d.stuck += dt;
  else d.stuck = Math.max(0, d.stuck - dt * 2);
  if (d.stuck > 1.2) { d.reverse = 0.9; d.stuck = 0; }
  if (d.reverse > 0) {
    d.reverse -= dt;
    out.throttle = 0;
    out.brake = 1;
    out.steer = -out.steer;
    out.drift = false;
  }
  return out;
}
