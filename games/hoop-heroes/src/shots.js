// Shot solving and input mapping. DOM-free and deterministic.
//
// A shot "setup" describes everything a shooter faces at the moment of
// release:
//   { p0, g, hoop, time, blockers, tramp, kind, elev }
//   kind  'normal' | 'bank' | 'tramp'
//   elev  launch elevation in radians (the solver may override for tramp)
// idealShot(setup) returns { yaw, elev, speed, aim } where aim is the world
// point the player should flick toward (hoop centre, the star on the board,
// or the trampoline).
import { STEP, BALL_R, BOARD, TRAMP_Y, RIM_R, hoopState, makeBall, stepBall, launchVelocity } from './physics.js';

export const DEG = Math.PI / 180;
export const ELEV = { normal: 55 * DEG, bank: 50 * DEG, lob: 64 * DEG };
// Player input → launch. Aim error is the screen angle (radians) between the
// flick and the line to the aim point; power error is log2(flick / ideal flick).
// The gains set how much of a flick's error reaches the ball. With these, a
// flick within about 10° and 20 % of the ideal scores from every spot, in line
// with the coach's "aim a little left" (0.18 rad) and "a bit harder" (0.3)
// thresholds, and misses grow quickly past that. Aim used to be squeezed so
// hard (0.12) that anything within 15° went in, so careful aim earned nothing.
export const AIM_GAIN = 0.18;
export const POWER_GAIN = 0.03;
export const EASY_FACTOR = 0.5;
// Keyboard / gamepad timing meter: its ends are this fraction of launch speed
// too fast or slow, whatever POWER_GAIN is, so the green band always scores.
export const METER_SPEED = 0.0525;

const tmpH = {};

function horizontalTo(p0, x, z) {
  const dx = x - p0.x, dz = z - p0.z;
  return { yaw: Math.atan2(dx, dz), d: Math.hypot(dx, dz) };
}

// Speed that puts the ball through (x, y, z) from p0 at elevation elev
// (descending branch when both exist). null when unreachable.
export function analyticSpeed(p0, x, y, z, elev, g) {
  const { yaw, d } = horizontalTo(p0, x, z);
  const h = y - p0.y;
  const c = Math.cos(elev);
  const den = 2 * c * c * (d * Math.tan(elev) - h);
  if (den <= 0) return null;
  const speed = Math.sqrt((g * d * d) / den);
  return { yaw, speed, t: d / (speed * c) };
}

// Fly a shot. opts.rim=false ignores the rim (used by the solver).
// opts.after: 'board' | 'tramp' requires that before the rim crossing counts.
// Returns { cross: {x, z, t} | null, contact, ball }.
export function simulate(setup, launch, opts = {}) {
  const v = launchVelocity(launch.yaw, launch.elev, launch.speed);
  const ball = makeBall(setup.p0, v);
  const env = { g: setup.g, hoop: setup.hoop, time: setup.time || 0, blockers: setup.blockers || null, tramp: setup.tramp || null, rim: opts.rim !== false };
  const maxT = opts.maxT || 5;
  const after = opts.after || null;
  let cross = null, contact = null;
  const t0 = env.time;
  for (let i = 0; i * STEP < maxT; i++) {
    env.time = t0 + i * STEP;
    const py = ball.p.y, px = ball.p.x, pz = ball.p.z;
    const hadBoard = ball.touchedBoard;
    stepBall(ball, env, STEP, null);
    if (!hadBoard && ball.touchedBoard && !contact) contact = { x: ball.p.x, y: ball.p.y, z: ball.p.z + BALL_R };
    const h = hoopState(setup.hoop, env.time + STEP, tmpH);
    const ready = after === 'board' ? ball.touchedBoard : after === 'tramp' ? ball.tramp : true;
    if (!cross && ready && py >= h.y && ball.p.y < h.y && ball.v.y < 0) {
      const f = (py - h.y) / (py - ball.p.y);
      cross = { x: px + (ball.p.x - px) * f - h.x, z: pz + (ball.p.z - pz) * f - h.z, t: ball.t };
      if (opts.stopAtCross) break;
    }
    if (ball.dead) break;
    if (opts.stopAtCross && ball.p.y < 0.2 && ball.v.y <= 0 && (after !== 'tramp' || ball.tramp)) break;
  }
  return { cross, contact, ball };
}

function solveNormal(setup, lead) {
  const elev = setup.elev ?? ELEV.normal;
  let h = hoopState(setup.hoop, setup.time || 0, tmpH);
  let s = analyticSpeed(setup.p0, h.x, h.y, h.z, elev, setup.g);
  if (lead && setup.hoop.motion) {
    for (let k = 0; k < 4 && s; k++) {
      h = hoopState(setup.hoop, (setup.time || 0) + s.t, tmpH);
      s = analyticSpeed(setup.p0, h.x, h.y, h.z, elev, setup.g);
    }
  }
  if (!s) return null;
  const now = hoopState(setup.hoop, setup.time || 0, {});
  return { yaw: s.yaw, elev, speed: s.speed, aim: { x: now.x, y: now.y, z: now.z }, flight: s.t };
}

// Bank shot: Newton on (yaw, speed) so the rebound crosses the rim centre.
function solveBank(setup) {
  const elev = setup.elev ?? ELEV.bank;
  const h = hoopState(setup.hoop, setup.time || 0, {});
  const zc = h.z + BOARD.offset - BALL_R;
  const back = (zc - h.z) / 0.62 + (zc - h.z);
  const guess = analyticSpeed(setup.p0, h.x, h.y + 0.15, zc + back * 0.55, elev, setup.g);
  if (!guess) return null;
  let yaw = guess.yaw, speed = guess.speed;
  const err = (yw, sp) => {
    const r = simulate(setup, { yaw: yw, elev, speed: sp }, { rim: false, after: 'board', stopAtCross: true });
    if (!r.cross) return null;
    return { ex: r.cross.x, ez: r.cross.z, contact: r.contact, t: r.cross.t };
  };
  let e = err(yaw, speed);
  for (let it = 0; it < 24 && e; it++) {
    if (Math.hypot(e.ex, e.ez) < 0.002) break;
    const dy = 0.002, ds = 0.01;
    const ey = err(yaw + dy, speed), es = err(yaw, speed + ds);
    if (!ey || !es) break;
    const a = (ey.ex - e.ex) / dy, b = (es.ex - e.ex) / ds;
    const c = (ey.ez - e.ez) / dy, d = (es.ez - e.ez) / ds;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-9) break;
    let dyaw = -(d * e.ex - b * e.ez) / det;
    let dsp = -(-c * e.ex + a * e.ez) / det;
    dyaw = Math.max(-0.1, Math.min(0.1, dyaw));
    dsp = Math.max(-0.6, Math.min(0.6, dsp));
    let next = null;
    for (let damp = 1; damp > 0.05; damp *= 0.5) {
      next = err(yaw + dyaw * damp, speed + dsp * damp);
      if (next && Math.hypot(next.ex, next.ez) < Math.hypot(e.ex, e.ez)) { yaw += dyaw * damp; speed += dsp * damp; break; }
      next = null;
    }
    if (!next) break;
    e = next;
  }
  if (!e || Math.hypot(e.ex, e.ez) > 0.03) return null;
  return { yaw, elev, speed, aim: e.contact, flight: e.t };
}

// Trampoline: land on the pad, bounce through the hoop. Yaw points at the
// hoop (pads sit on the shooter-hoop line); bisection on elevation, with the
// speed for each elevation chosen to land on the pad centre.
function solveTramp(setup) {
  const tr = setup.tramp;
  const h = hoopState(setup.hoop, setup.time || 0, {});
  const { yaw } = horizontalTo(setup.p0, h.x, h.z);
  const dirx = Math.sin(yaw), dirz = Math.cos(yaw);
  const depthErr = (elev) => {
    const s = analyticSpeed(setup.p0, tr.x, TRAMP_Y + BALL_R, tr.z, elev, setup.g);
    if (!s) return null;
    const r = simulate(setup, { yaw, elev, speed: s.speed }, { rim: false, after: 'tramp', stopAtCross: true });
    if (!r.ball.tramp) return null;
    // Banking in off the board counts as long: we want clean pad shots.
    if (r.contact || r.ball.touchedBoard) return { e: 2, speed: s.speed };
    if (!r.cross) return { e: -5, speed: s.speed };
    return { e: r.cross.x * dirx + r.cross.z * dirz, speed: s.speed, t: r.cross.t };
  };
  // Scan from flat to steep for a sign change, then bisect.
  let lo = null, hi = null, prev = null, prevEl = 0;
  // Prefer a friendly lob: try 22° and up first, then flatter tosses.
  const order = [];
  for (let el = 22; el <= 75; el += 1.5) order.push(el * DEG);
  for (let el = 8; el < 23.5; el += 1.5) order.push(el * DEG);
  for (const el of order) {
    if (prev && el < prevEl) prev = null;
    const r = depthErr(el);
    if (r && prev && Math.sign(r.e) !== Math.sign(prev.e) && Math.abs(r.e - prev.e) < 3) { lo = prevEl; hi = el; break; }
    if (r) { prev = r; prevEl = el; }
  }
  if (lo === null) return null;
  let elo = depthErr(lo).e;
  let mid = lo, r = null;
  for (let it = 0; it < 30; it++) {
    mid = (lo + hi) / 2;
    r = depthErr(mid);
    if (!r) return null;
    if (Math.abs(r.e) < 0.001) break;
    if (Math.sign(r.e) === Math.sign(elo)) { lo = mid; elo = r.e; } else hi = mid;
  }
  if (!r || Math.abs(r.e) > 0.03) return null;
  return { yaw, elev: mid, speed: r.speed, aim: { x: tr.x, y: TRAMP_Y, z: tr.z }, flight: r.t };
}

export function idealShot(setup, { lead = false } = {}) {
  if (setup.kind === 'bank') return solveBank(setup);
  if (setup.kind === 'tramp') return solveTramp(setup);
  return solveNormal(setup, lead);
}

// Player errors → launch. aimErr in screen radians, powerErr in log2 units.
// `sens` ({ aim, power }) scales how much of each error reaches the ball.
export function applyInput(ideal, aimErr, powerErr, easy = false, sens = null) {
  const k = easy ? EASY_FACTOR : 1;
  const a = Math.max(-1.2, Math.min(1.2, aimErr)) * k * (sens ? sens.aim : 1);
  const p = Math.max(-2, Math.min(2, powerErr)) * k * (sens ? sens.power : 1);
  return { yaw: ideal.yaw + a * AIM_GAIN, elev: ideal.elev, speed: ideal.speed * (1 + p * POWER_GAIN) };
}

// Trampoline shots forgive far more on court than other shots: the pad is
// big and always bounces the ball to the same height. A flick's errors count
// for more there, so they feel like other shots (within about 10° and 20 %
// always scores, 15° off misses). Meter shots keep the plain gains.
export const TRAMP_FLICK = { aim: 1.4, power: 3.5 };

// The court point a flick should head for: the shot's aim point, except on
// trampoline shots. The pad lies on the floor below the ball on screen, where
// no upward flick can point; it sits on the line to the hoop, so a flick up
// toward the hoop is the same direction on court.
export function flickTarget(setup, ideal) {
  if (setup.kind !== 'tramp') return ideal.aim;
  const h = hoopState(setup.hoop, setup.time || 0, {});
  return { x: h.x, y: h.y, z: h.z };
}

// A flick ({ dirX, dirY, speed } from measureFlick) → { aimErr, powerErr, sens }
// for applyInput. B and A are the screen positions of the ball and of
// flickTarget(); aimErr is the screen angle between the flick and the line
// from B to A, powerErr is log2(flick speed / ideal flick).
export function flickInput(flick, B, A, setup, ideal, ref) {
  const thetaI = Math.atan2(A.x - B.x, -(A.y - B.y));
  const thetaF = Math.atan2(flick.dirX, -flick.dirY);
  const aimErr = Math.atan2(Math.sin(thetaF - thetaI), Math.cos(thetaF - thetaI));
  const powerErr = Math.log2(flick.speed / idealFlick(ideal, setup.g, ref));
  return { aimErr, powerErr, sens: setup.kind === 'tramp' ? TRAMP_FLICK : null };
}

// Timing-meter marker position v (0 bottom … 1 top) → power error.
export function meterPower(v) {
  return ((v - 0.5) * 2 * METER_SPEED) / POWER_GAIN;
}

// The flick (screen heights per second) that counts as perfect for a shot.
// Deeper shots need a slightly harder flick. `ref` is the player's own
// comfortable flick (adapts over time).
export function idealFlick(ideal, g, ref) {
  return ref * (ideal.speed / referenceSpeed(g));
}
export function referenceSpeed(g) {
  // The ideal speed of a 4.6 m straight shot under gravity g (elev 55°).
  return Math.sqrt(g / 9.8) * 7.55;
}

// Outcome flags for a resolved ball.
export function outcome(ball) {
  return {
    made: ball.made,
    swish: ball.made && !ball.rimBeforeMake && !ball.boardBeforeMake,
    bank: ball.made && ball.boardBeforeMake,
    rim: ball.touchedRim,
    tramp: ball.tramp,
  };
}

export { RIM_R };
