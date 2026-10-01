// Rival shooters and the autopilot. DOM-free; all randomness is seeded.
//
// A rival takes the ideal shot (leading moving hoops) and adds Gaussian
// error in yaw (radians) and speed (fraction), at a cadence per difficulty.
import { rng } from './rng.js';
import { idealShot } from './shots.js';

export const DIFFICULTY = {
  rookie: { name: 'Rookie', aim: 0.025, power: 0.018, cadence: 1.55 },
  pro: { name: 'Pro', aim: 0.019, power: 0.014, cadence: 1.4 },
  allstar: { name: 'All-Star', aim: 0.016, power: 0.0115, cadence: 1.25 },
  champion: { name: 'Champion', aim: 0.012, power: 0.0085, cadence: 1.15 },
};

// The launch a rival takes: ideal + noise. `ease` > 1 makes them sloppier
// (applied after a player loses to them, so nobody gets stuck).
export function aiShot(ideal, diff, r, ease = 1) {
  return {
    yaw: ideal.yaw + r.gauss() * diff.aim * ease,
    elev: ideal.elev,
    speed: ideal.speed * (1 + r.gauss() * diff.power * ease),
  };
}

export class Shooter {
  constructor(difficulty = 'allstar', seed = 1, { ease = 1, cadence = null } = {}) {
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.allstar;
    this.r = rng(seed);
    this.ease = ease;
    this.cadence = cadence || this.diff.cadence;
    this.wait = 0.6 + this.r() * 0.5;
  }

  // Call every step with the round; shoots when ready and the wait is over.
  update(round, dt) {
    this.wait -= dt;
    if (this.wait > 0 || !round.canShoot()) return null;
    const setup = round.shotSetup();
    const ideal = idealShot(setup, { lead: true });
    if (!ideal) { this.wait = 0.3; return null; }
    const launch = aiShot(ideal, this.diff, this.r, this.ease);
    this.wait = this.cadence * (0.8 + this.r() * 0.4);
    return round.shoot(launch);
  }
}
