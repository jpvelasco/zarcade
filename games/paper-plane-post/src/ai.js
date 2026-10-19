// The autopilot. It flies the attract mode on the title, the `?autopilot`
// debug flag, and the balance tests that prove every route is flyable.
//
// It is a tiny bang-bang controller: a few times a second it simulates the next
// couple of seconds with the button held and with it released, using the very
// same flight model the player gets, and keeps whichever future looks better.

import { PAD_BEFORE, PLANE_R } from './world.js';
import { GRAVITY, TRIM, clonePlane, speedOf, stepPlane } from './flight.js';
import { DROP_RADIUS } from './routes.js';

const TICK = 0.08;        // how often it reconsiders
const SIM_DT = 1 / 30;    // lookahead step: coarse on purpose, it is cheap
const HORIZON = 3;        // seconds of future
const NEAR_GOAL = 90;     // start thinking about the landing this far out
const APPROACH = 340;     // where the landing guidance takes over
const SLOPE = 12.15;      // the glider's still-air glide ratio
const SWITCH_MARGIN = 2;  // stops it flickering between the two choices

/**
 * Landing guidance: sit on the glide slope into the green, then hold the glide
 * for the last stretch. Holding it is the flare — it is what makes a landing
 * feather-soft instead of a thump.
 */
function wantsApproachDive(world) {
  const remain = world.scene.mailbox.x - world.plane.x;
  // Stop diving well out and fly a long final: that is what makes it soft.
  if (remain < 70) return false;
  const plane = world.plane;
  const clear = world.groundAt(plane.x) - plane.y;
  // Spare speed is spare height: a fast plane will balloon back up, so count
  // it in before deciding to shed more.
  const speed = speedOf(plane);
  const energy = clear + (speed * speed - TRIM.speed * TRIM.speed) / (2 * GRAVITY);
  // Never bore into the ground to shed energy: level out, let the speed bleed
  // off in fast air, and dive again. That porpoising is how a glider dumps
  // height it does not want.
  const floor = Math.max(4, Math.min(15, remain / 7));
  if (clear <= floor) return false;
  return energy > remain / SLOPE + 2;
}

/** The thing to fly at next: the nearest uncollected ring, letter or mailbox. */
export function nextTarget(world) {
  const plane = world.plane;
  let best = null;
  // Letters get a head start in the queue: a window next to a ring is worth
  // more than the ring, and both are usually on the same line anyway.
  const consider = (x, y, kind, r) => {
    if (x < plane.x + 2) return;
    const key = x - (kind === 'letter' ? 34 : 0);
    if (!best || key < best.key) best = { x, y, kind, r, key };
  };
  for (const ring of world.scene.rings) {
    if (!world.collected.has(ring.id)) consider(ring.x, ring.y, 'ring', ring.r);
  }
  for (const drop of world.scene.drops) {
    if (!world.collected.has(drop.id)) consider(drop.x, drop.y, 'letter', DROP_RADIUS);
  }
  if (world.scene.mailbox) {
    const pad = { x: world.scene.mailbox.x, y: world.scene.mailbox.y - 1.5, kind: 'mailbox', r: 20, key: world.scene.mailbox.x };
    // Close in, the landing is the only thing that matters.
    const close = pad.x - plane.x < (best && best.kind === 'letter' ? 44 : NEAR_GOAL * 0.8);
    if (close) return pad;
    consider(pad.x, pad.y, 'mailbox', 20);
  }
  if (!best) {
    const x = plane.x + 140;
    best = { x, y: world.groundAt(x) - 46, kind: 'onward', r: 24 };
  }
  return best;
}

/** How close the paper comes to the nearest hazard, in metres of clear air. */
function hazardGap(world, x, y) {
  let gap = Infinity;
  for (const hazard of world.scene.hazards) {
    if (hazard.kind === 'line') {
      if (Math.abs(x - hazard.x) > hazard.w + 1) continue;
      gap = Math.min(gap, Math.abs(y - hazard.y) - 2);
    } else {
      gap = Math.min(gap, Math.hypot(x - hazard.x, y - hazard.y) - hazard.r - 1.6);
    }
  }
  return gap;
}

/**
 * Fly `steps` of future with the button fixed and rate how it went: a score
 * where higher is better, plus `fatal` for a future that ends the run.
 */
function rate(world, dive, target, steps) {
  const plane = clonePlane(world.plane);
  const air = { x: 0, y: 0, rain: 0, dry: 1, lift: 0 };
  const goalX = world.scene.mailbox ? world.scene.mailbox.x : Infinity;
  let closest = Math.hypot(world.plane.x - target.x, world.plane.y - target.y);
  let minClear = Infinity;
  let minGap = Infinity;
  let score = 0;
  let fatal = false;
  let touched = null;
  for (let i = 0; i < steps; i += 1) {
    world.airAt(plane.x, plane.y, air);
    stepPlane(plane, SIM_DT, {
      dive,
      wind: air,
      rain: air.rain,
      drying: air.dry,
      tuning: world.tuning,
    });
    const ground = world.groundAt(plane.x);
    const clear = ground - plane.y;
    if (clear < minClear) minClear = clear;
    const gap = hazardGap(world, plane.x, plane.y);
    if (gap < minGap) minGap = gap;
    if (gap <= 0) {
      score -= 1200;
      fatal = true;
      break;
    }
    if (clear <= PLANE_R) {
      touched = { x: plane.x, speed: speedOf(plane), pitch: plane.pitch, water: world.terrain.kindAt(plane.x) === 'water' };
      break;
    }
    const d = Math.hypot(plane.x - target.x, plane.y - target.y);
    if (d < closest) closest = d;
    score += 0.02 * plane.vx * SIM_DT;
  }

  // Getting close to the target is the main thing; threading it is a bonus.
  score -= closest * 1.1;
  if (closest <= target.r * 0.8) score += 60;
  if (minClear < 8) score -= (8 - Math.max(0, minClear)) * 14;
  if (minGap < 9) score -= (9 - Math.max(0, minGap)) * 16;
  score -= plane.soak * 40;

  if (touched) {
    const onPad = touched.x >= goalX - PAD_BEFORE + 4;
    if (!onPad || touched.water) {
      score -= 1400;
      fatal = true;
    } else {
      score += 900;
      if (touched.speed <= world.scene.softSpeed && Math.abs(touched.pitch) <= 0.4) score += 600;
      else score -= Math.min(260, (touched.speed - world.scene.softSpeed) * 24);
    }
  } else if (target.kind === 'mailbox' && goalX - world.plane.x < NEAR_GOAL) {
    // Spend spare height early so the approach is a glide, not a dive.
    const remain = Math.max(1, goalX - plane.x);
    const ideal = remain / 12.15 + 6;
    const have = world.groundAt(goalX) - plane.y;
    score -= Math.max(0, have - ideal) * 2.5;
    score -= Math.max(0, speedOf(plane) - world.scene.softSpeed) * 8;
  }
  return { score, fatal };
}

/**
 * An autopilot for one world. Call `control(dt)` every simulation step and feed
 * the result straight into `world.step`.
 */
export function createPilot(world) {
  let wait = 0;
  let dive = false;
  let target = nextTarget(world);
  return {
    get target() { return target; },
    get dive() { return dive; },
    control(dt) {
      wait -= dt;
      if (wait <= 0) {
        wait = TICK;
        target = nextTarget(world);
        const toGoal = world.scene.mailbox ? world.scene.mailbox.x - world.plane.x : Infinity;
        const steps = Math.round((toGoal < NEAR_GOAL ? HORIZON + 2 : HORIZON) / SIM_DT);
        const soar = rate(world, false, target, steps);
        const dip = rate(world, true, target, steps);
        if (toGoal < APPROACH) {
          // Guidance picks the button; the lookahead only vetoes a future that
          // ends the run.
          const wanted = wantsApproachDive(world);
          const mine = wanted ? dip : soar;
          const other = wanted ? soar : dip;
          dive = mine.fatal && !other.fatal ? !wanted : wanted;
        } else if (dive) {
          dive = dip.score + SWITCH_MARGIN >= soar.score;
        } else {
          dive = dip.score > soar.score + SWITCH_MARGIN;
        }
      }
      return { dive };
    },
  };
}

/** Fly a whole world with the autopilot. Used by the tests. */
export function flyWithPilot(world, { dt = 1 / 60, maxSeconds = 400 } = {}) {
  const pilot = createPilot(world);
  let steps = 0;
  const limit = Math.round(maxSeconds / dt);
  while (world.status === 'flying' && steps < limit) {
    world.step(dt, pilot.control(dt));
    world.events.length = 0;
    steps += 1;
  }
  return world.result();
}
