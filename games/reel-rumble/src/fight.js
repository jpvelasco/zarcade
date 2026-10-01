// The reel fight: a tension model. Pure and seeded.
//
// The fish pulls in phases (runs, darts, rests and jumps). Reeling adds
// tension and brings line in; the rod's flex soaks up part of every tug.
// Keep tension in the green zone and the fish tires. Too much tension for
// too long snaps the line; too little for too long and the hook slips out.
// Steering against the fish's run (arrows) eases the pull and tires it
// faster. Legendary fish fight in three stages and have a special move.
import { BEHAVIORS } from './data.js';
import { clamp, range, weightedPick } from './rng.js';

export const GREEN_HIGH = 0.85; // fraction of line strength
export const DANGER = 0.88;
export const SNAP_TIME = 1.1;
export const SLACK_TIME = 2.6;
export const LAND_DIST = 1.5;
const TENSION_RATE = 7;
const TIRE_RATE = 0.45; // stamina drain scale: higher means shorter fights

const PULL = { run: 1, dart: 0.75, rise: 0.6, jump: 0.15, surge: 1.25, tired: 0.15 };
const IN = { run: 0.35, dart: 0.7, rest: 1, rise: 0.6, jump: 0.15, surge: 0.25, tired: 1.2 };
const SPECIAL = {
  mud: { pull: 0.85, in: 0.4, out: 0.35, dur: [3, 4.2] },
  rapids: { pull: 0.85, in: 0.3, out: 0.3, drift: 1.3, dur: [3, 4] },
  tailwalk: { pull: 0.6, in: 0.6, out: 0, dur: [0.4, 0.4], jumps: 3 },
  frost: { pull: 0.7, in: 0.8, out: 0.1, strength: 0.75, dur: [3.5, 4.5] },
  starburst: { pull: 0.6, in: 0.6, out: 0.15, flip: 0.55, dur: [3, 4] },
};

export function createFight(fish, t, stats, rng, { dist = 20, perfect = false } = {}) {
  const sizeMul = 0.8 + 0.45 * t;
  const P = fish.power * sizeMul;
  const f = {
    fish, rng, stats, t,
    P,
    resist: clamp(P / 8, 0.25, 1.2),
    stamMax: fish.stamina * (0.85 + 0.3 * t),
    stamina: perfect ? 0.85 : 1,
    stage: 1,
    stages: fish.stages || 1,
    dist,
    maxLine: stats.cast + 25,
    tension: 0,
    phase: 'run',
    phaseT: range(rng, 1, 1.8),
    special: null,
    jumpsLeft: 0,
    flipT: 0,
    strengthMul: 1,
    dir: rng() < 0.5 ? -1 : 1,
    slackT: 0,
    overT: 0,
    time: 0,
    pull: 0,
    outcome: null, // landed | snapped | escaped
    events: [],
  };
  f.tension = stats.flex * P * 0.6;
  return f;
}

export const strengthOf = (f) => f.stats.strength * f.strengthMul;
export const slackLevel = (f) => Math.min(0.12, (0.3 * f.P * f.stats.flex) / f.stats.strength);
export const greenLow = (f) => clamp(slackLevel(f) * 2.5, 0.08, 0.3);
export const tensionFrac = (f) => f.tension / strengthOf(f);

function setPhase(f, phase, dur) {
  f.phase = phase;
  f.phaseT = dur;
  f.events.push({ type: 'phase', phase });
}

function nextPhase(f) {
  const rng = f.rng;
  const b = BEHAVIORS[f.fish.behavior];
  if (f.jumpsLeft > 0 && f.phase === 'jump') {
    setPhase(f, 'rise', 0.4);
    return;
  }
  if (f.phase === 'rise') {
    if (f.jumpsLeft > 0) f.jumpsLeft--;
    setPhase(f, 'jump', 0.85);
    f.events.push({ type: 'jump' });
    return;
  }
  if (f.special) {
    f.special = null;
    f.strengthMul = 1;
  }
  if (f.stamina <= 0 && f.stage >= f.stages) {
    setPhase(f, 'tired', 99);
    return;
  }
  const entries = Object.entries(b.weights).filter(([k]) => !(k === 'jump' && f.phase === 'jump'));
  const [kind] = weightedPick(rng, entries, ([, w]) => w);
  f.dir = kind === 'dart' ? -f.dir : rng() < 0.5 ? -1 : 1;
  if (kind === 'jump') {
    setPhase(f, 'rise', 0.55);
    f.events.push({ type: 'rise' });
  } else if (kind === 'special') {
    const sp = SPECIAL[f.fish.special];
    f.special = f.fish.special;
    f.events.push({ type: 'special', special: f.special });
    if (sp.jumps) {
      f.jumpsLeft = sp.jumps;
      setPhase(f, 'rise', sp.dur[0]);
      f.events.push({ type: 'rise' });
    } else {
      f.strengthMul = sp.strength || 1;
      f.flipT = sp.flip || 0;
      setPhase(f, 'special', range(rng, sp.dur[0], sp.dur[1]));
    }
  } else {
    setPhase(f, kind, range(rng, b[kind][0], b[kind][1]));
  }
}

// input: { reel: 0..1, steer: -1..1 }
export function stepFight(f, dt, input) {
  if (f.outcome) return f;
  f.time += dt;
  const reel = clamp(input.reel || 0, 0, 1);
  const steer = clamp(input.steer || 0, -1, 1);
  const b = BEHAVIORS[f.fish.behavior];

  f.phaseT -= dt;
  if (f.phaseT <= 0) nextPhase(f);
  const sp = f.special ? SPECIAL[f.special] : null;
  if (f.phase === 'special' && sp?.flip) {
    f.flipT -= dt;
    if (f.flipT <= 0) { f.flipT = sp.flip; f.dir = -f.dir; f.events.push({ type: 'flip' }); }
  }

  // Steering against the run helps; steering with it hurts a little.
  const along = steer * f.dir;
  const good = along < -0.25 ? Math.min(1, -along) : 0;
  const bad = along > 0.25 ? Math.min(1, along) : 0;
  f.steerGood = good;

  const stamF = 0.35 + 0.65 * Math.max(0, f.stamina);
  let mul = f.phase === 'rest' ? b.restPull : f.phase === 'special' ? sp.pull : PULL[f.phase];
  if (f.phase === 'special' && f.special === 'starburst') mul *= 0.6 + 0.8 * Math.abs(Math.sin(f.time * 7));
  let F = f.P * mul * (f.phase === 'tired' ? 1 : stamF);
  F *= (1 - 0.2 * good) * (1 + 0.15 * bad);
  f.pull = F;

  const R = reel * f.stats.reelPower * f.resist;
  let target = f.phase === 'jump' || f.phase === 'rise' && f.phaseT < 0.15
    ? f.stats.flex * (F + 2.2 * R + 0.25 * f.P)
    : f.stats.flex * (F + 0.7 * R);

  // Line in and out.
  let out = 0;
  if (f.phase === 'run') out = f.fish.speed * stamF;
  else if (f.phase === 'surge') out = f.fish.speed * 1.2;
  else if (f.phase === 'dart') out = f.fish.speed * 0.2;
  else if (f.phase === 'special') out = f.fish.speed * sp.out + (sp.drift || 0) * (1 - 0.8 * good);
  out *= 1 - 0.4 * good;
  const inF = f.phase === 'special' ? sp.in : IN[f.phase];
  f.dist += (out - reel * f.stats.reelSpeed * inF) * dt;
  if (f.dist >= f.maxLine) {
    f.dist = f.maxLine;
    if (out > 0) target += 0.4 * strengthOf(f);
  }

  f.tension += (target - f.tension) * Math.min(1, dt * TENSION_RATE);
  const frac = tensionFrac(f);

  // Tiring: the fish tires fastest while the tension is in the green.
  const low = greenLow(f);
  const eff = frac < slackLevel(f) ? 0 : frac < low ? 0.35 : frac <= GREEN_HIGH ? 1 : 1.1;
  const busy = f.phase === 'run' || f.phase === 'surge' || f.phase === 'dart' || f.phase === 'special' ? 1.2 : 1;
  if (f.phase !== 'tired') {
    f.stamina -= ((0.12 + 0.9 * eff) * busy * (1 + 0.6 * good) * TIRE_RATE / f.stamMax) * dt;
    if (f.phase === 'rest' && frac < low) f.stamina = Math.min(1, f.stamina + 0.03 * dt);
  }
  if (f.stamina <= 0 && f.phase !== 'tired') {
    if (f.stage < f.stages) {
      f.stage++;
      f.stamina = 0.75;
      f.special = null;
      f.strengthMul = 1;
      f.jumpsLeft = 0;
      setPhase(f, 'surge', 2.4);
      f.events.push({ type: 'stage', stage: f.stage });
    } else {
      f.stamina = 0;
      setPhase(f, 'tired', 99);
      f.events.push({ type: 'tired' });
    }
  }

  // Snap and slack.
  if (frac >= 1) f.overT += dt * 2;
  else if (frac >= DANGER) f.overT += dt;
  else f.overT = Math.max(0, f.overT - dt * 0.7);
  const airborne = f.phase === 'jump' || f.phase === 'rise';
  if (frac < slackLevel(f) && !airborne) f.slackT += dt;
  else f.slackT = Math.max(0, f.slackT - dt * 1.5);

  if (f.overT >= SNAP_TIME) {
    f.outcome = 'snapped';
    f.events.push({ type: 'snapped' });
  } else if (f.slackT >= SLACK_TIME) {
    f.outcome = 'escaped';
    f.events.push({ type: 'escaped' });
  } else if (f.dist <= LAND_DIST) {
    const ready = f.phase === 'tired' || (f.stage >= f.stages && f.stamina <= 0.3);
    if (ready) {
      f.dist = LAND_DIST;
      f.outcome = 'landed';
      f.events.push({ type: 'caught' });
    } else {
      // A fresh fish won't come out of the water: one last dash.
      f.dist = LAND_DIST + 0.2;
      if (f.phase !== 'run' && f.phase !== 'surge') {
        f.dir = -f.dir;
        setPhase(f, 'run', range(f.rng, 1.2, 2));
      }
    }
  }
  return f;
}

// What the HUD and the bot read.
export function readout(f) {
  return {
    frac: tensionFrac(f),
    low: greenLow(f),
    slack: slackLevel(f),
    high: GREEN_HIGH,
    danger: f.overT / SNAP_TIME,
    slipping: f.slackT / SLACK_TIME,
    stamina: Math.max(0, f.stamina),
    stage: f.stage,
    stages: f.stages,
    dist: f.dist,
    phase: f.phase,
    dir: f.dir,
    special: f.special,
    strengthMul: f.strengthMul,
  };
}
