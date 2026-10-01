// Game rules: scoring, missions, ball save, tilt and the end-of-ball bonus.
// DOM-free and physics-free: the world reports switches and asks for
// decisions (lock or eject, save or drain); the rules keep score and emit
// events for the display and sound.
//
// Missions
//   Planet Tour     Complete the U-F-O lanes or the asteroid bank to light a
//                   planet at one of the five shots; shoot it to visit. Visit
//                   all five for the tour award, and Extra Ball lights.
//   Asteroid Field  Knock down all three asteroids for a 20 s frenzy: every
//                   switch scores big and the Black Hole is open.
//   Black Hole      The Comet Ramp lights the lock. Lock two balls in the
//                   Black Hole to start 3-ball multiball; jackpots at the
//                   ramp and orbits, then a super jackpot back at the hole.

import { mulberry32 } from './rng.js';

export const PLANETS = [
  { id: 'mars', name: 'MARS', shot: 'leftOrbit', color: '#ff6b4a' },
  { id: 'jupiter', name: 'JUPITER', shot: 'spinner', color: '#ffb35c' },
  { id: 'saturn', name: 'SATURN', shot: 'blackHole', color: '#ffe07a' },
  { id: 'neptune', name: 'NEPTUNE', shot: 'ramp', color: '#4fb8ff' },
  { id: 'venus', name: 'VENUS', shot: 'rightOrbit', color: '#ff7ad9' },
];
export const SHOT_IDS = ['leftOrbit', 'spinner', 'blackHole', 'ramp', 'rightOrbit'];
export const JACKPOT_SHOTS = ['leftOrbit', 'ramp', 'rightOrbit'];
export const LANE_LETTERS = ['U', 'F', 'O'];

export const SCORE = {
  bumper: 1000,
  sling: 500,
  lane: 2500,
  inlane: 2500,
  outlane: 10000,
  spin: 1000,
  target: 5000,
  orbit: 50000,
  spinnerShot: 25000,
  ramp: 75000,
  hole: 100000,
  laneSet: 25000,
  skill: 500000,
  planet: 250000,
  tour: 2500000,
  frenzyStart: 250000,
  frenzySwitch: 25000,
  jackpot: 1000000,
  jackpotStep: 250000,
  superJackpot: 5000000,
  combo: 100000,
  mystery: 250000,
  extraBall: 1000000,
};

export const TIMES = {
  ballSave: 10,
  multiballSave: 15,
  frenzy: 20,
  frenzyTarget: 2,
  combo: 4,
  tiltDecay: 0.55, // nudge meter units per second
};

export const BALLS_PER_GAME = 3;
const MAX_BONUS_X = 5;
const TILT_LIMIT = 2.6;
const TILT_WARNINGS = 2; // the third strike tilts
const KICKBACK_SPINS = 20;
const MYSTERY = ['points', 'kickback', 'ballSave', 'bonusX', 'lightLock', 'lightPlanet'];

export class Rules {
  constructor({ seed = 1, balls = BALLS_PER_GAME } = {}) {
    this.rng = mulberry32(seed);
    this.ballsPerGame = balls;
    this.events = [];
    this.newGame();
    this.playing = false;
  }

  newGame() {
    this.score = 0;
    this.ball = 1;
    this.extraBalls = 0;
    this.gameOver = false;
    this.playing = true;
    this.time = 0;
    this.tours = 0;
    this.frenzies = 0;
    this.multiballs = 0;
    this.jackpotsTotal = 0;
    this.bestCombo = 0;
    this.planetsVisited = PLANETS.map(() => false);
    this.planetsLit = PLANETS.map(() => false);
    this.lanes = [false, false, false];
    this.locked = 0;
    this.lockLit = false;
    this.extraBallLit = false;
    this.kickbackLit = true;
    this.spinsToKickback = KICKBACK_SPINS;
    this.multiball = false;
    this.jackpotValue = SCORE.jackpot;
    this.jackpots = 0;
    this.superLit = false;
    this.missions = { tour: false, frenzy: false, multiball: false };
  }

  // Per-ball state; returns nothing, emits a ballStart event.
  startBall() {
    this.tilted = false;
    this.tiltMeter = 0;
    this.warnings = 0;
    this.bonusX = 1;
    this.ballSave = 0;
    this.ballSaveArmed = true;
    this.ballSaved = false;
    this.targetsDown = [false, false, false];
    this.frenzy = 0;
    this.frenzyScore = 0;
    this.combo = { count: 0, timer: 0 };
    this.skill = { active: false, ready: true, lane: Math.floor(this.rng() * 3) };
    this.stats = { planets: 0, spins: 0, targets: 0, lanes: 0, switches: 0 };
    if (!this.planetsLit.some(Boolean)) this.lightPlanet(false);
    this.emit({ type: 'ballStart', ball: this.ball });
  }

  emit(e) { this.events.push(e); }

  callout(kind, title, sub = '', extra = {}) {
    this.emit({ type: 'callout', kind, title, sub, ...extra });
  }

  add(points, at = null) {
    if (this.tilted || points <= 0) return 0;
    this.score += points;
    if (at) this.emit({ type: 'score', points, x: at.x, y: at.y });
    return points;
  }

  update(dt) {
    this.time += dt;
    if (this.tiltMeter > 0) this.tiltMeter = Math.max(0, this.tiltMeter - TIMES.tiltDecay * dt);
    if (this.combo.timer > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) this.combo.count = 0;
    }
    if (this.ballSave > 0) this.ballSave = Math.max(0, this.ballSave - dt);
    if (this.frenzy > 0) {
      this.frenzy -= dt;
      if (this.frenzy <= 0) this.endFrenzy();
    }
  }

  // ------------------------------------------------------------ plunger

  // The ball left the plunger. The first launch of a ball arms the skill
  // shot and starts the ball-save clock.
  onLaunch() {
    if (this.skill.ready) {
      this.skill.ready = false;
      this.skill.active = true;
    }
    if (this.ballSaveArmed) {
      this.ballSaveArmed = false;
      this.ballSave = TIMES.ballSave;
    }
  }

  // Flipper buttons rotate the lit U-F-O lanes (and the skill-shot lane
  // while the ball waits on the plunger).
  laneChange(dir, inShooter) {
    if (this.tilted) return;
    if (inShooter && (this.skill.ready || this.skill.active)) {
      this.skill.lane = (this.skill.lane + dir + 3) % 3;
      return;
    }
    const l = this.lanes;
    this.lanes = dir > 0 ? [l[2], l[0], l[1]] : [l[1], l[2], l[0]];
  }

  // ------------------------------------------------------------ switches

  onSwitch(id, at = null) {
    if (this.tilted || !this.playing) return;
    this.stats.switches++;
    const frenzyBonus = this.frenzy > 0 ? SCORE.frenzySwitch : 0;
    if (frenzyBonus) this.frenzyScore += frenzyBonus;
    if (id.startsWith('lane')) return this.onLane(Number(id.slice(4)), at, frenzyBonus);
    if (this.skill.active) this.skill.active = false;
    switch (id) {
      case 'bumper': this.add(SCORE.bumper + frenzyBonus, at); break;
      case 'sling': this.add(SCORE.sling + frenzyBonus, at); break;
      case 'leftInlane': case 'rightInlane': this.add(SCORE.inlane + frenzyBonus, at); break;
      case 'leftOutlane': case 'rightOutlane': this.add(SCORE.outlane + frenzyBonus, at); break;
      case 'spin':
        this.add(SCORE.spin + (frenzyBonus ? SCORE.spin * 9 : 0));
        this.stats.spins++;
        if (!this.kickbackLit && --this.spinsToKickback <= 0) {
          this.kickbackLit = true;
          this.spinsToKickback = KICKBACK_SPINS;
          this.callout('kickbackLit', 'KICKBACK', 'IS LIT');
        }
        break;
      case 'leftOrbit': case 'rightOrbit':
        this.add(SCORE.orbit + frenzyBonus, at);
        this.shot(id, at);
        break;
      case 'spinner':
        this.add(SCORE.spinnerShot + frenzyBonus, at);
        this.shot('spinner', at);
        break;
      case 'ramp':
        this.add(SCORE.ramp + frenzyBonus, at);
        if (!this.multiball && !this.lockLit) {
          this.lockLit = true;
          this.callout('lockLit', 'LOCK IS LIT', 'SHOOT THE BLACK HOLE');
        }
        this.shot('ramp', at);
        break;
      default:
        if (id.startsWith('target')) this.onTarget(Number(id.slice(6)), at, frenzyBonus);
        break;
    }
  }

  onLane(i, at, frenzyBonus) {
    this.add(SCORE.lane + frenzyBonus, at);
    this.stats.lanes++;
    if (this.skill.active) {
      this.skill.active = false;
      if (i === this.skill.lane) {
        this.add(SCORE.skill, at);
        this.callout('skill', 'SKILL SHOT', '500,000');
      }
    }
    this.lanes[i] = true;
    if (this.lanes.every(Boolean)) {
      this.lanes = [false, false, false];
      const x = Math.min(MAX_BONUS_X, this.bonusX + 1);
      this.add(SCORE.laneSet * this.bonusX, at);
      if (x !== this.bonusX) this.bonusX = x;
      const lit = this.lightPlanet(false);
      this.callout('lanes', 'U F O COMPLETE', lit ? `${lit.name} IS LIT` : `BONUS ${this.bonusX}X`, { bonusX: this.bonusX });
    }
  }

  onTarget(i, at, frenzyBonus) {
    if (this.targetsDown[i]) return;
    this.targetsDown[i] = true;
    this.stats.targets++;
    this.add(SCORE.target + frenzyBonus, at);
    if (this.frenzy > 0) this.frenzy += TIMES.frenzyTarget;
    if (this.targetsDown.every(Boolean) && this.frenzy <= 0) this.startFrenzy(at);
  }

  startFrenzy(at) {
    this.frenzy = TIMES.frenzy;
    this.frenzyScore = 0;
    this.frenzies++;
    this.missions.frenzy = true;
    this.add(SCORE.frenzyStart * this.frenzies, at);
    const lit = this.lightPlanet(false);
    this.callout('frenzy', 'ASTEROID FRENZY', lit ? `${lit.name} IS LIT` : 'EVERYTHING SCORES');
  }

  endFrenzy() {
    this.frenzy = 0;
    this.targetsDown = [false, false, false];
    this.emit({ type: 'resetTargets' });
    this.callout('frenzyEnd', 'FRENZY TOTAL', fmt(this.frenzyScore));
  }

  // A major shot was made: combos, planet visits and jackpots.
  shot(id, at) {
    this.combo.count = this.combo.timer > 0 ? this.combo.count + 1 : 1;
    this.combo.timer = TIMES.combo;
    if (this.combo.count >= 2) {
      this.add(SCORE.combo * (this.combo.count - 1), at);
      this.bestCombo = Math.max(this.bestCombo, this.combo.count);
      this.callout('combo', `${this.combo.count}-WAY COMBO`, fmt(SCORE.combo * (this.combo.count - 1)));
    }
    const p = PLANETS.findIndex((pl) => pl.shot === id);
    if (p >= 0 && this.planetsLit[p]) this.visitPlanet(p, at);
    if (this.multiball && JACKPOT_SHOTS.includes(id)) {
      this.jackpots++;
      this.jackpotsTotal++;
      this.add(this.jackpotValue, at);
      this.callout('jackpot', 'JACKPOT', fmt(this.jackpotValue));
      this.jackpotValue += SCORE.jackpotStep;
      if (this.jackpots % 3 === 0 && !this.superLit) {
        this.superLit = true;
        this.callout('superLit', 'SUPER JACKPOT', 'IS LIT AT THE BLACK HOLE');
      }
    }
  }

  // Light a random unvisited planet that isn't lit yet; returns it or null.
  lightPlanet(announce = true) {
    const options = PLANETS.map((_, i) => i).filter((i) => !this.planetsVisited[i] && !this.planetsLit[i]);
    if (!options.length) return null;
    const i = options[Math.floor(this.rng() * options.length)];
    this.planetsLit[i] = true;
    if (announce) this.callout('planetLit', `${PLANETS[i].name} IS LIT`, 'SHOOT THE FLASHING ARROW', { planet: i });
    return PLANETS[i];
  }

  visitPlanet(i, at) {
    this.planetsLit[i] = false;
    this.planetsVisited[i] = true;
    this.stats.planets++;
    const count = this.planetsVisited.filter(Boolean).length;
    const value = SCORE.planet * count * (this.tours + 1);
    this.add(value, at);
    this.callout('planet', PLANETS[i].name, `PLANET ${count} OF 5`, { planet: i, points: value });
    if (count === PLANETS.length) {
      this.tours++;
      this.missions.tour = true;
      this.add(SCORE.tour * this.tours, at);
      this.planetsVisited = PLANETS.map(() => false);
      this.planetsLit = PLANETS.map(() => false);
      this.extraBallLit = true;
      this.callout('tour', 'PLANET TOUR', 'EXTRA BALL IS LIT');
      this.lightPlanet(false);
    } else if (!this.planetsLit.some(Boolean)) {
      // Keep the tour moving: the next planet lights on its own.
      this.lightPlanet(false);
    }
  }

  // ------------------------------------------------------------ black hole

  // A ball fell into the Black Hole. Returns 'lock' (keep it and serve a new
  // ball), 'multiball' (release every ball) or 'eject'.
  onHole(at = null) {
    if (this.tilted) return 'eject';
    if (this.skill.active) this.skill.active = false;
    this.add(SCORE.hole + (this.frenzy > 0 ? SCORE.frenzySwitch : 0), at);
    this.shot('blackHole', at);
    if (this.multiball && this.superLit) {
      this.superLit = false;
      this.jackpots = 0;
      this.add(SCORE.superJackpot, at);
      this.callout('super', 'SUPER JACKPOT', fmt(SCORE.superJackpot));
      return 'eject';
    }
    if (!this.multiball && this.lockLit) {
      this.lockLit = false;
      this.locked++;
      if (this.locked >= 2) {
        this.locked = 0;
        this.multiball = true;
        this.multiballs++;
        this.missions.multiball = true;
        this.jackpots = 0;
        this.ballSave = Math.max(this.ballSave, TIMES.multiballSave);
        this.callout('multiball', 'MULTIBALL', 'SHOOT FOR JACKPOTS');
        return 'multiball';
      }
      this.callout('lock', 'BALL 1 LOCKED', 'LIGHT LOCK AT THE RAMP');
      return 'lock';
    }
    if (this.extraBallLit) {
      this.extraBallLit = false;
      this.extraBalls++;
      this.add(SCORE.extraBall, at);
      this.callout('extraBall', 'EXTRA BALL', 'SHOOT AGAIN');
      return 'eject';
    }
    this.mystery(at);
    return 'eject';
  }

  mystery(at) {
    let pick = MYSTERY[Math.floor(this.rng() * MYSTERY.length)];
    if (pick === 'kickback' && this.kickbackLit) pick = 'points';
    if (pick === 'lightLock' && (this.lockLit || this.multiball)) pick = 'points';
    if (pick === 'bonusX' && this.bonusX >= MAX_BONUS_X) pick = 'points';
    let sub = '';
    switch (pick) {
      case 'kickback': this.kickbackLit = true; sub = 'KICKBACK LIT'; break;
      case 'ballSave': this.ballSave = Math.max(this.ballSave, 10); sub = 'BALL SAVE 10 SEC'; break;
      case 'bonusX': this.bonusX++; sub = `BONUS ${this.bonusX}X`; break;
      case 'lightLock': this.lockLit = true; sub = 'LOCK IS LIT'; break;
      case 'lightPlanet': {
        const p = this.lightPlanet(false);
        sub = p ? `${p.name} IS LIT` : fmt(this.add(SCORE.mystery, at));
        break;
      }
      default: sub = fmt(this.add(SCORE.mystery, at)); break;
    }
    this.callout('mystery', 'SPACE MYSTERY', sub);
    return pick;
  }

  // ------------------------------------------------------------ kickback, tilt

  // The ball reached an outlane kickback switch. True if it fires.
  useKickback() {
    if (!this.kickbackLit || this.tilted) return false;
    this.kickbackLit = false;
    this.spinsToKickback = KICKBACK_SPINS;
    this.callout('kickback', 'KICKBACK', 'SPIN TO RELIGHT');
    return true;
  }

  // Returns 'ok', 'danger' or 'tilt'.
  nudge() {
    if (this.tilted) return 'tilt';
    this.tiltMeter += 1;
    if (this.tiltMeter <= TILT_LIMIT) return 'ok';
    this.tiltMeter = 1;
    this.warnings++;
    if (this.warnings > TILT_WARNINGS) {
      this.tilted = true;
      this.ballSave = 0;
      this.frenzy = 0;
      this.callout('tilt', 'TILT', 'BALL LOST');
      this.emit({ type: 'tilt' });
      return 'tilt';
    }
    this.callout('danger', 'DANGER', this.warnings === TILT_WARNINGS ? 'LAST WARNING' : 'CAREFUL NOW');
    return 'danger';
  }

  // ------------------------------------------------------------ drains

  // A ball drained; `inPlay` balls are still on the table (or held in the
  // Black Hole). Returns 'save' (serve a replacement), 'continue' or
  // 'endBall'.
  onDrain(inPlay) {
    if (this.ballSave > 0 && !this.tilted) {
      if (!this.multiball) {
        this.ballSave = 0;
        this.ballSaved = true;
      }
      this.callout('ballSave', 'BALL SAVED', 'DON\'T MOVE');
      return 'save';
    }
    if (inPlay > 0) {
      if (this.multiball && inPlay === 1) {
        this.multiball = false;
        this.superLit = false;
        this.callout('multiballEnd', 'MULTIBALL OVER', `${this.jackpots} JACKPOTS`);
      }
      return 'continue';
    }
    return 'endBall';
  }

  // The last ball drained. Returns the bonus breakdown and what happens next.
  endBall() {
    this.multiball = false;
    this.superLit = false;
    if (this.frenzy > 0) { this.frenzy = 0; this.emit({ type: 'resetTargets' }); }
    const lines = [
      ['PLANETS', this.stats.planets, 25000],
      ['SPINS', this.stats.spins, 1000],
      ['ASTEROIDS', this.stats.targets, 5000],
      ['LANES', this.stats.lanes, 2500],
    ].map(([label, n, each]) => ({ label, n, points: n * each }));
    const base = lines.reduce((s, l) => s + l.points, 0);
    const total = this.tilted ? 0 : base * this.bonusX;
    this.score += total;
    let next;
    if (this.extraBalls > 0) {
      this.extraBalls--;
      next = 'shootAgain';
    } else if (this.ball < this.ballsPerGame) {
      this.ball++;
      next = 'nextBall';
    } else {
      next = 'gameOver';
      this.gameOver = true;
      this.playing = false;
    }
    const bonus = { lines, bonusX: this.bonusX, total, tilted: this.tilted, next };
    this.emit({ type: 'bonus', ...bonus });
    return bonus;
  }

  missionsDone() {
    return Object.values(this.missions).filter(Boolean).length;
  }
}

export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}
