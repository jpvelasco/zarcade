// The glider. A small, honest aerodynamic model with one input: dive.
//
// DOM-free and deterministic: the same state plus the same inputs always give
// the same flight, which is what the tests, the autopilot's lookahead and the
// Shift-code-style seeded runs all rely on.
//
// Units are SI-ish. 1 world unit = 1 metre, y grows downward (canvas
// convention), so a positive angle is nose-down and positive `vy` is sinking.

export const GRAVITY = 14;          // m/s², arcade-crisp rather than real
export const KLIFT = 0.16;          // 0.5 * rho * S / m, folded into one number
export const CL_SLOPE = 3.2;        // lift coefficient per radian of attack
export const STALL_AOA = 0.3;       // ~17°: past this the wing gives up
export const CD0 = 0.034;           // parasite drag
export const K_INDUCED = 0.05;      // induced drag factor
export const DIVE_PITCH = 0.78;     // nose 45° down while the button is held
export const TRIM_AOA = 0.22;       // nose above the flight path while soaring
export const PITCH_UP_LIMIT = -0.72; // never climb steeper than ~41°
export const PITCH_DOWN_LIMIT = 0.95;
export const PITCH_RATE = 5.2;      // rad/s the paper can rotate
export const MAX_SPEED = 34;
export const SOAK_DRAG = 0.09;      // extra parasite drag at full soak
export const SOAK_WEIGHT = 0.3;     // extra gravity at full soak
export const SOAK_LIFT = 0.22;      // lift lost at full soak
export const SOAK_DRY = 0.055;      // soak shed per second in dry air
export const SNAP_MIN_DIVE = 0.5;   // a dive has to last this long to snap
export const SNAP_WINDOW = 0.22;    // release this soon after the steep part
export const SNAP_IMPULSE = 0.1;    // fraction of airspeed added across the path
export const SNAP_MIN_SPEED = 14;   // and the paper has to be really moving

export const TRIM = Object.freeze({
  /** Rough steady-glide speed, handy for tuning and for the HUD's scale. */
  speed: Math.sqrt(GRAVITY / (KLIFT * CL_SLOPE * TRIM_AOA)),
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Fold and paper multipliers folded into one tuning object. */
export function tuningFor(fold = null, paper = null) {
  const lift = (fold?.liftScale ?? 1) * (paper?.liftScale ?? 1);
  const drag = (fold?.dragScale ?? 1) * (paper?.dragScale ?? 1);
  const dive = (fold?.diveScale ?? 1) * (paper?.diveScale ?? 1);
  const soak = (fold?.soakResist ?? 1) * (paper?.soakResist ?? 1);
  const snap = (fold?.snapScale ?? 1) * (paper?.snapScale ?? 1);
  return { lift, drag, dive, soak, snap };
}

export const DEFAULT_TUNING = Object.freeze(tuningFor());

export function createPlane({ x = 0, y = 0, speed = TRIM.speed, angle = 0 } = {}) {
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    pitch: angle,
    soak: 0,
    diveTime: 0,
    glideTime: 0,
    airspeed: speed,
    aoa: TRIM_AOA,
    lift: 0,
    stalling: false,
    snap: false,        // true on the step a snap lands
    snapCount: 0,
    alive: true,
  };
}

export function speedOf(plane) {
  return Math.hypot(plane.vx, plane.vy);
}

/** Lift coefficient with a stall roll-off, so holding too much nose costs you. */
export function liftCoefficient(aoa) {
  const sign = aoa < 0 ? -1 : 1;
  const a = Math.abs(aoa);
  if (a <= STALL_AOA) return sign * CL_SLOPE * a;
  // Past the stall the wing sheds most of its lift over the next 0.35 rad.
  const over = Math.min(1, (a - STALL_AOA) / 0.35);
  const peak = CL_SLOPE * STALL_AOA;
  return sign * peak * (1 - 0.72 * over * over);
}

/**
 * One fixed step of flight.
 *
 * `wind` is the air movement at the plane ({ x, y }); `rain` is how hard it is
 * raining on the plane right now (0..1); `drying` scales how fast the paper
 * sheds water. Returns the plane for convenience.
 */
export function stepPlane(plane, dt, {
  dive = false,
  wind = null,
  rain = 0,
  drying = 1,
  tuning = DEFAULT_TUNING,
} = {}) {
  const windX = wind ? wind.x : 0;
  const windY = wind ? wind.y : 0;

  // Soak first: wet paper flies worse this very step.
  const soakRate = rain > 0 ? rain * 0.19 / Math.max(0.2, tuning.soak) : 0;
  plane.soak = clamp(plane.soak + (soakRate - (rain > 0 ? 0 : SOAK_DRY * drying)) * dt, 0, 1);
  const soak = plane.soak;

  // Airspeed is measured against the air, not the ground: an updraft is just
  // air that happens to be going up.
  let ax = plane.vx - windX;
  let ay = plane.vy - windY;
  let air = Math.hypot(ax, ay);
  if (air < 0.0001) {
    ax = 0.0001;
    air = 0.0001;
  }
  const path = Math.atan2(ay, ax);

  // Pitch: the one button picks an attitude, the paper rotates toward it.
  const target = dive
    ? DIVE_PITCH * tuning.dive
    : clamp(path - TRIM_AOA * tuning.lift, PITCH_UP_LIMIT, PITCH_DOWN_LIMIT);
  const maxTurn = PITCH_RATE * dt;
  const delta = clamp(target - plane.pitch, -maxTurn, maxTurn);
  plane.pitch += delta;

  const aoa = plane.pitch - path;
  const cl = liftCoefficient(aoa) * tuning.lift * (1 - SOAK_LIFT * soak);
  const cd = (CD0 + SOAK_DRAG * soak) * tuning.drag + K_INDUCED * cl * cl;
  const q = KLIFT * air * air;

  // Lift is perpendicular to the airflow, drag opposes it.
  const nx = -ay / air;
  const ny = ax / air;
  const liftMag = q * cl;
  const dragMag = q * cd;
  const fx = nx * liftMag - (ax / air) * dragMag;
  const fy = ny * liftMag - (ay / air) * dragMag + GRAVITY * (1 + SOAK_WEIGHT * soak);

  plane.vx += fx * dt;
  plane.vy += fy * dt;

  // Dive timing: a snap needs a real dive, then a release near the steep part.
  plane.snap = false;
  if (dive) {
    plane.diveTime += dt;
    plane.glideTime = 0;
  } else {
    const steep = plane.pitch > DIVE_PITCH * 0.58 && plane.vy > 0 && air > SNAP_MIN_SPEED;
    if (plane.diveTime >= SNAP_MIN_DIVE && plane.glideTime < SNAP_WINDOW && steep) {
      const bonus = air * SNAP_IMPULSE * tuning.snap;
      plane.vx += nx * bonus;
      plane.vy += ny * bonus;
      plane.snap = true;
      plane.snapCount += 1;
      plane.diveTime = 0;      // one snap per dive
    }
    plane.glideTime += dt;
    if (plane.glideTime >= SNAP_WINDOW) plane.diveTime = 0;
  }

  const speed = Math.hypot(plane.vx, plane.vy);
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    plane.vx *= scale;
    plane.vy *= scale;
  }

  plane.x += plane.vx * dt;
  plane.y += plane.vy * dt;

  plane.airspeed = air;
  plane.aoa = aoa;
  plane.lift = liftMag;
  plane.stalling = Math.abs(aoa) > STALL_AOA;
  return plane;
}

/** A cheap copy for lookahead: the autopilot simulates futures on these. */
export function clonePlane(plane) {
  return {
    x: plane.x,
    y: plane.y,
    vx: plane.vx,
    vy: plane.vy,
    pitch: plane.pitch,
    soak: plane.soak,
    diveTime: plane.diveTime,
    glideTime: plane.glideTime,
    airspeed: plane.airspeed,
    aoa: plane.aoa,
    lift: plane.lift,
    stalling: plane.stalling,
    snap: false,
    snapCount: plane.snapCount,
    alive: plane.alive,
  };
}

/**
 * Steady-glide numbers for a tuning, found by flying in still air until the
 * speed settles. Used by the balance tests and by the hangar's stat bars.
 */
export function glideStats(tuning = DEFAULT_TUNING) {
  const plane = createPlane({ speed: TRIM.speed });
  const dt = 1 / 120;
  for (let i = 0; i < 1800; i += 1) stepPlane(plane, dt, { tuning });
  const speed = speedOf(plane);
  const sink = plane.vy;
  return { speed, sink, ratio: plane.vx / Math.max(0.0001, sink) };
}
