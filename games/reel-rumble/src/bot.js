// The bot angler: plays the fight, the bite and the cast using only what a
// player can see. Used by tests (balance checks), the title-screen demo and
// ?autopilot. Also a tiny "career" planner that shops and picks waters.
import { readout } from './fight.js';
import { clamp } from './rng.js';
import { WATERS } from './data.js';
import { BAITS, LINES, REELS, RODS, buy, buyBlock, equip, owns } from './gear.js';
import { spawnTable, periodOf, weatherFor } from './spawn.js';

// Keep tension a bit above the middle of the green; let go while the fish
// is in the air; steer against its run.
export function fightControls(fight, memo, { skill = 1, rng = Math.random } = {}) {
  const r = readout(fight);
  const goal = (r.low + r.high) / 2 + 0.03;
  const airborne = r.phase === 'rise' || r.phase === 'jump';
  let reel = memo.reel ?? 0.5;
  if (airborne) reel = 0;
  else {
    const err = goal - r.frac;
    reel = clamp(reel + err * 0.9 + (r.danger > 0.25 ? -0.3 : 0) + (r.slipping > 0.3 ? 0.25 : 0), 0, 1);
  }
  if (skill < 1 && rng() > skill) reel = clamp(reel + (rng() - 0.5) * 0.6, 0, 1);
  memo.reel = reel;
  const steer = skill >= 0.5 ? -r.dir : 0;
  return { reel, steer };
}

export class Bot {
  constructor({ skill = 1, rng = Math.random } = {}) {
    this.skill = skill;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.memo = {};
    this.aim = null;
    this.waitT = 0;
    this.reactT = 0;
    this.prevHold = false;
  }

  // Controls for one step of a Trip (see trip.js).
  controls(trip, dt) {
    const ctl = { hold: false, steer: 0, aim: null, press: false };
    const s = trip.state;
    if (s === 'ready') {
      if (this.aim === null) this.aim = trip.suggestAim(this.rng);
      ctl.aim = this.aim;
      ctl.hold = true;
      this.waitT = 0;
    } else if (s === 'charging') {
      ctl.aim = this.aim;
      // Let go when the meter is close to the aim mark on the way up.
      ctl.hold = !(trip.cast.power >= this.aim - 0.02 && trip.cast.rising);
    } else if (s === 'waiting' || s === 'sinking') {
      this.aim = null;
      this.waitT += dt;
      if (this.waitT > 22) ctl.hold = true; // nothing biting: reel in and recast
    } else if (s === 'reeling') {
      ctl.hold = true;
    } else if (s === 'bite') {
      this.reactT += dt;
      if (this.reactT > 0.18 + (1 - this.skill) * 0.25) { ctl.press = true; this.reactT = 0; }
    } else if (s === 'fight') {
      const c = fightControls(trip.fight, this.memo, { skill: this.skill, rng: this.rng });
      ctl.hold = c.reel > 0.5;
      ctl.reel = c.reel;
      ctl.steer = c.steer;
    } else {
      this.reactT = 0;
      this.memo = {};
    }
    ctl.press = ctl.press || (ctl.hold && !this.prevHold && (s === 'bite'));
    this.prevHold = ctl.hold;
    return ctl;
  }
}

// ------------------------------------------------------------ career planning

const ORDER = [
  ['rod', 'bamboo'], ['boat', 'canoe'], ['line', 'mono'], ['reel', 'smooth'], ['bait', 'cricket'], ['bait', 'dough'],
  ['bait', 'minnow'], ['bait', 'spinner'], ['rod', 'fiberglass'], ['boat', 'sailboat'], ['bait', 'shrimp'],
  ['bait', 'squid'], ['line', 'braid'], ['reel', 'gearmaster'], ['bait', 'feather'], ['boat', 'snowrunner'],
  ['bait', 'waxworm'], ['bait', 'icejig'], ['rod', 'carbon'], ['boat', 'starferry'], ['bait', 'glowbead'],
  ['bait', 'starjig'], ['line', 'silk'], ['reel', 'tidal'], ['bait', 'starlight'], ['rod', 'starlight'],
];

// Buy the next affordable upgrade in a sensible order. Returns what it bought.
export function autoShop(save) {
  const bought = [];
  for (const [slot, id] of ORDER) {
    if (owns(save, slot, id)) continue;
    if (buyBlock(save, slot, id)) break;
    buy(save, slot, id);
    bought.push(`${slot}:${id}`);
  }
  // Keep the best rod, reel and line equipped.
  for (const [slot, list] of [['rod', RODS], ['reel', REELS], ['line', LINES]]) {
    const best = [...list].reverse().find((it) => owns(save, slot, it.id));
    if (best) equip(save, slot, best.id);
  }
  return bought;
}

export const reachable = (save) => WATERS.filter((w) => !w.boat || owns(save, 'boat', w.boat));

// Pick a water and bait where uncaught fish are likely to bite now.
export function planOuting(save, rng = Math.random) {
  let best = null;
  for (const w of reachable(save)) {
    const period = periodOf(save.clock.hour, w.id);
    const weather = weatherFor(w.id, save.clock.day, save.clock.hour);
    const table = spawnTable(w.id, period, weather);
    for (const bait of BAITS) {
      if (!owns(save, 'bait', bait.id)) continue;
      let score = 0;
      for (const { fish, weight } of table) {
        if (!fish.baits.includes(bait.id)) continue;
        const fresh = !(save.book[fish.id]?.n > 0);
        score += weight * (fresh ? 4 : 0.4) * (fish.rarity === 'legendary' ? 3 : 1);
      }
      score *= 0.9 + rng() * 0.2;
      if (!best || score > best.score) best = { water: w.id, bait: bait.id, score };
    }
  }
  return best;
}
