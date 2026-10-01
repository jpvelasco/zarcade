// Round rules: Quick Play modes, trick-shot levels and the Daily Shootout.
// Pure data builders; Round (round.js) runs them.
import { COURT_BY_ID } from './courts.js';
import { ELEV } from './shots.js';
import { hashString, rng } from './rng.js';

export const TIMED_SPOTS = [
  { d: 4.2, a: 0 }, { d: 4.6, a: -30 }, { d: 4.6, a: 30 },
  { d: 5.2, a: -55 }, { d: 5.2, a: 55 }, { d: 5.6, a: 0 },
];
export const RACK_SPOTS = [
  { d: 5.3, a: -68 }, { d: 5.3, a: -34 }, { d: 5.5, a: 0 }, { d: 5.3, a: 34 }, { d: 5.3, a: 68 },
];
export const MOTIONS = {
  slide: { ax: 0.75, wx: 0.95 },
  swing: { ax: 1.05, wx: 1.25 },
  bob: { ax: 0.85, wx: 1.1, ay: 0.22, wy: 1.6 },
  zoom: { ax: 1.15, wx: 1.55, ay: 0.18, wy: 2.1 },
};

export const MODE_INFO = {
  timed: { name: 'Hot Shot', icon: '⏱️', blurb: 'Score as many baskets as you can before the buzzer.' },
  moving: { name: 'Moving Hoop', icon: '↔️', blurb: 'The hoop slides around. Lead it!' },
  racks: { name: 'Money Racks', icon: '💰', blurb: 'Five racks around the arc. Rainbow balls score double.' },
};

function base(kind, courtId, time) {
  const court = COURT_BY_ID[courtId] || COURT_BY_ID.park;
  return { kind, court: court.id, g: court.g, time, balls: 0, spots: TIMED_SPOTS, spotEvery: 0, motion: null, racks: null, trick: null, elev: ELEV.normal };
}

export function timedRules(courtId, time = 60, spots = TIMED_SPOTS) {
  return { ...base('timed', courtId, time), spots, spotEvery: 3 };
}

export function movingRules(courtId, time = 60, motion = MOTIONS.slide, spots = [{ d: 4.6, a: 0 }, { d: 4.8, a: -20 }, { d: 4.8, a: 20 }]) {
  return { ...base('moving', courtId, time), spots, spotEvery: 4, motion: { ...motion } };
}

export function racksRules(courtId, time = 60, spots = RACK_SPOTS) {
  const racks = spots.map((_, i) => ({ spot: i, balls: 5, money: i === spots.length - 1 ? [0, 1, 2, 3, 4] : [4] }));
  return { ...base('racks', courtId, time), spots, racks, balls: racks.length * 5 };
}

export function quickRules(kind, courtId, motionId = 'slide') {
  if (kind === 'moving') return movingRules(courtId, 60, MOTIONS[motionId] || MOTIONS.slide);
  if (kind === 'racks') return racksRules(courtId, 60);
  return timedRules(courtId, 60);
}

// ------------------------------------------------------------ trick shots

export const TRICK_LEVELS = [
  { id: 'bank1', type: 'bank', name: 'Glass Kiss', tip: 'Bank it! Aim for the star on the board.', spots: [{ d: 4.2, a: -35 }], balls: 8, stars: [2, 4, 6] },
  { id: 'bank2', type: 'bank', name: 'Other Side', tip: 'Same trick, other side.', spots: [{ d: 4.4, a: 38 }], balls: 8, stars: [2, 4, 6] },
  { id: 'bank3', type: 'bank', name: 'Deep Bank', tip: 'A long one off the glass.', spots: [{ d: 5.2, a: -45 }], balls: 8, stars: [2, 4, 6] },
  { id: 'bank4', type: 'bank', name: 'Ping Pong', tip: 'Switch sides after every bank.', spots: [{ d: 4.5, a: -40 }, { d: 4.5, a: 40 }], spotEvery: 1, balls: 10, stars: [3, 5, 7] },
  { id: 'block1', type: 'blocker', name: 'Big Bear', tip: 'Loop it high over the bouncy bear.', spots: [{ d: 4.6, a: 0 }], balls: 8, stars: [2, 4, 6], blockers: [{ at: 0.8, w: 1.5, h: 3.45 }] },
  { id: 'block2', type: 'blocker', name: 'Tall Teddy', tip: 'This bear is extra tall!', spots: [{ d: 5.0, a: -15 }], balls: 8, stars: [2, 4, 6], blockers: [{ at: 0.74, w: 1.5, h: 3.75 }] },
  { id: 'block3', type: 'blocker', name: 'Wiggle Bear', tip: 'The bear wiggles. Time it!', spots: [{ d: 4.8, a: 0 }], balls: 10, stars: [3, 5, 7], blockers: [{ at: 0.76, w: 1.3, h: 3.6, sway: { ax: 0.7, w: 1.4 } }] },
  { id: 'block4', type: 'blocker', name: 'Bear Hug', tip: 'Two bears, one big arc.', spots: [{ d: 5.4, a: 0 }], balls: 10, stars: [3, 5, 7], blockers: [{ at: 0.45, w: 1.4, h: 4.0, look: 'panda' }, { at: 0.8, w: 1.4, h: 3.7 }] },
  { id: 'tramp1', type: 'tramp', name: 'Boing!', tip: 'Toss it gently onto the trampoline.', spots: [{ d: 4.5, a: 0 }], balls: 8, stars: [2, 4, 6], tramp: { at: 0.4, r: 0.6 } },
  { id: 'tramp2', type: 'tramp', name: 'Long Boing', tip: 'Further back, same bounce.', spots: [{ d: 5.6, a: 0 }], balls: 8, stars: [2, 4, 6], tramp: { at: 0.38, r: 0.6 } },
  { id: 'tramp3', type: 'tramp', name: 'Side Boing', tip: 'From the side this time.', spots: [{ d: 4.8, a: -30 }], balls: 8, stars: [2, 4, 6], tramp: { at: 0.4, r: 0.55 } },
  { id: 'tramp4', type: 'tramp', name: 'Boing Over', tip: 'Bounce it over the bear!', spots: [{ d: 5.2, a: 0 }], balls: 10, stars: [3, 5, 7], tramp: { at: 0.42, r: 0.6 }, blockers: [{ at: 0.72, w: 1.3, h: 2.9 }] },
];

export const TRICK_TYPES = {
  bank: { name: 'Bank Shots', icon: '🪟', need: 'bank' },
  blocker: { name: 'Over the Bear', icon: '🧸', need: 'any' },
  tramp: { name: 'Trampoline', icon: '🤸', need: 'tramp' },
};

export function trickRules(level, courtId = 'park') {
  const r = base('trick', courtId, 0);
  const need = TRICK_TYPES[level.type].need;
  return {
    ...r,
    level: level.id,
    spots: level.spots,
    spotEvery: level.spotEvery || 0,
    balls: level.balls,
    stars: level.stars,
    elev: level.type === 'blocker' ? ELEV.lob : level.type === 'bank' ? ELEV.bank : ELEV.normal,
    trick: { need, blockers: level.blockers || null, tramp: level.tramp || null },
  };
}

export function trickStars(level, makes) {
  return level.stars.filter((s) => makes >= s).length;
}

// ------------------------------------------------------------ daily shootout

const DAILY_COURTS = ['park', 'beach', 'roof', 'space'];
const DAILY_KINDS = ['timed', 'moving', 'racks'];

export function dailyRules(key) {
  const r = rng(hashString(`hoop-heroes:${key}`));
  const kind = DAILY_KINDS[r.int(DAILY_KINDS.length)];
  const court = DAILY_COURTS[r.int(DAILY_COURTS.length)];
  const shuffled = TIMED_SPOTS.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const spots = shuffled.map((s) => ({ d: Math.round((s.d + r.range(-0.3, 0.3)) * 10) / 10, a: s.a }));
  let rules;
  if (kind === 'moving') {
    const m = MOTIONS[r.pick(['slide', 'swing', 'bob'])];
    rules = movingRules(court, 60, { ...m, ph: Math.round(r.range(0, 6.28) * 100) / 100 }, spots.slice(0, 3));
  } else if (kind === 'racks') {
    rules = racksRules(court, 60);
  } else {
    rules = timedRules(court, 60, spots);
  }
  return { ...rules, daily: key, seed: hashString(`hoop-heroes:${key}`) };
}
