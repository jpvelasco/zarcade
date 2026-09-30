// Moonshot Mini Golf: one hole of play (DOM-free).
//
// status flow:
//   ready  -> (putt) -> rolling -> ready             ball came to rest
//                               -> sinking -> holed  ball dropped in the cup
//                               -> falling -> ready  lost in space, +1 stroke
// A hole also ends ("picked up") once the stroke cap is reached.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./physics.js'));
  else root.MoonshotPlay = factory(root.MoonshotPhysics);
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  const SINK_TIME = 0.75;
  const FALL_TIME = 0.95;
  const REST_TIME = 0.12;
  const MAX_ROLL_TIME = 25;

  function maxStrokes(par) {
    return par + 5;
  }

  function createPlay(def, t = 0) {
    const H = P.prepare(def);
    const sim = P.createSim(H.tee.x, H.tee.y, t);
    return {
      def, H, sim,
      strokes: 0,
      status: 'ready',
      timer: 0,
      rest: 0,
      rollTime: 0,
      lastSpot: spotOf(H, sim),
      maxStrokes: maxStrokes(def.par),
      pickedUp: false,
      penalties: 0,
      fx: null, // { x, y, cause } for sink/fall animations
      events: [],
    };
  }

  // Remember where a stroke was taken. On a drifting platform we store the
  // offset from the platform so a reset puts the ball back on it.
  function spotOf(H, s) {
    const plat = H.dynamic ? P.platformAt(H, s.x, s.y, s.t) : -1;
    if (plat < 0) return { x: s.x, y: s.y, plat: -1 };
    const o = P.motion(H.floor[plat].move, s.t);
    return { x: s.x, y: s.y, plat, lx: s.x - o.x, ly: s.y - o.y };
  }

  function placeAtSpot(play) {
    const { H, sim, lastSpot: sp } = play;
    let x = sp.x, y = sp.y;
    if (sp.plat >= 0) {
      const o = P.motion(H.floor[sp.plat].move, sim.t);
      x = sp.lx + o.x;
      y = sp.ly + o.y;
    }
    if (P.isVoid(H, x, y, sim.t)) { x = H.tee.x; y = H.tee.y; }
    sim.x = x;
    sim.y = y;
    sim.vx = 0;
    sim.vy = 0;
    sim.portalLock = -1;
    sim.boostIn = 0;
    sim.lip = false;
  }

  function putt(play, angle, power) {
    if (play.status !== 'ready') return false;
    const { sim } = play;
    play.lastSpot = spotOf(play.H, sim);
    const v = P.puttSpeed(power);
    sim.vx = Math.cos(angle) * v;
    sim.vy = Math.sin(angle) * v;
    play.strokes += 1;
    play.status = 'rolling';
    play.rest = 0;
    play.rollTime = 0;
    play.events.push({ type: 'putt', x: sim.x, y: sim.y, strength: v, power });
    return true;
  }

  function stepPlay(play, dt = P.STEP) {
    const { H, sim } = play;
    sim.events = play.events;
    if (play.status === 'sinking' || play.status === 'falling') {
      play.timer += dt;
      sim.t += dt;
      if (play.status === 'sinking' && play.timer >= SINK_TIME) {
        play.status = 'holed';
      } else if (play.status === 'falling' && play.timer >= FALL_TIME) {
        play.strokes += play.fx.penalty;
        placeAtSpot(play);
        play.status = 'ready';
        play.events.push({ type: 'respawn', x: sim.x, y: sim.y });
        if (play.strokes >= play.maxStrokes) finishPickedUp(play);
      }
      return play.status;
    }
    if (play.status === 'holed') { sim.t += dt; return play.status; }

    const r = P.stepBall(H, sim, dt);
    if (r === 'sunk') {
      play.status = 'sinking';
      play.timer = 0;
      play.fx = { x: sim.x, y: sim.y, vx: sim.vx, vy: sim.vy };
      sim.vx = 0;
      sim.vy = 0;
      play.events.push({ type: 'sunk', x: H.cup.x, y: H.cup.y, strokes: play.strokes });
      return play.status;
    }
    if (r === 'void') {
      // Nudged off while waiting (by a slider, say) is free; a putt is +1.
      const penalty = play.status === 'rolling' ? 1 : 0;
      play.status = 'falling';
      play.timer = 0;
      play.penalties += penalty;
      play.fx = { ...sim.fell, vx: sim.vx, vy: sim.vy, penalty };
      sim.vx = 0;
      sim.vy = 0;
      play.events.push({ type: 'fall', x: sim.x, y: sim.y, cause: sim.fell.cause, penalty });
      return play.status;
    }
    const speed = P.speedOf(sim);
    if (play.status === 'ready') {
      if (speed > 30) { play.status = 'rolling'; play.rest = 0; play.rollTime = 0; }
      return play.status;
    }
    play.rollTime += dt;
    if (speed === 0) play.rest += dt;
    else play.rest = 0;
    if (play.rollTime > MAX_ROLL_TIME) { sim.vx = 0; sim.vy = 0; play.rest = REST_TIME; }
    if (play.rest >= REST_TIME) {
      play.status = 'ready';
      play.events.push({ type: 'rest', x: sim.x, y: sim.y });
      if (play.strokes >= play.maxStrokes) finishPickedUp(play);
    }
    return play.status;
  }

  function finishPickedUp(play) {
    play.status = 'holed';
    play.pickedUp = true;
    play.events.push({ type: 'pickup', strokes: play.strokes });
  }

  // Copy a play (used by the solver to try shots without touching the game).
  function clonePlay(play) {
    return {
      ...play,
      sim: { ...play.sim, events: null },
      lastSpot: { ...play.lastSpot },
      events: [],
      fx: play.fx ? { ...play.fx } : null,
    };
  }

  return { SINK_TIME, FALL_TIME, maxStrokes, createPlay, putt, stepPlay, clonePlay, placeAtSpot };
});
