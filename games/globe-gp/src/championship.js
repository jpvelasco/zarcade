import { LOCATION_BY_ID } from './locations.js';

// The world tour: four cups of 3-4 races. Points per place, trophies by
// final standing. Pure data and bookkeeping.

export const POINTS = [10, 8, 6, 5, 4, 3, 2];

export const CUPS = [
  {
    id: 'sunrise', name: 'Sunrise Cup', emoji: '🌅', needStars: 0, color: '#ffb35c',
    blurb: 'A gentle start through Europe, Brazil and Japan.',
    races: [
      { loc: 'paris', kind: 'circuit' },
      { loc: 'rio', kind: 'sprint' },
      { loc: 'kyoto', kind: 'circuit' },
    ],
  },
  {
    id: 'thunder', name: 'Thunder Cup', emoji: '⚡', needStars: 2, color: '#ff4a8a',
    blurb: 'Neon nights, desert dunes and sky-high bridges.',
    races: [
      { loc: 'tokyo', kind: 'circuit' },
      { loc: 'sahara', kind: 'sprint' },
      { loc: 'outback', kind: 'elimination' },
      { loc: 'newyork', kind: 'circuit' },
    ],
  },
  {
    id: 'aurora', name: 'Aurora Cup', emoji: '🌌', needStars: 4, color: '#3affc8',
    blurb: 'Ice, snow and the northern lights.',
    races: [
      { loc: 'alps', kind: 'sprint' },
      { loc: 'iceland', kind: 'circuit' },
      { loc: 'kyoto', kind: 'elimination' },
      { loc: 'tokyo', kind: 'sprint' },
    ],
  },
  {
    id: 'globe', name: 'Globe Cup', emoji: '🌍', needStars: 7, color: '#ffd23d',
    blurb: 'The grand finale. Every corner of the world.',
    races: [
      { loc: 'rio', kind: 'circuit' },
      { loc: 'alps', kind: 'circuit' },
      { loc: 'sahara', kind: 'elimination' },
      { loc: 'iceland', kind: 'sprint' },
    ],
  },
];
export const CUP_BY_ID = Object.fromEntries(CUPS.map((c) => [c.id, c]));

// Every cup race must point at a real location.
export function cupRaces(cup) {
  return cup.races.map((r) => ({ ...r, location: LOCATION_BY_ID[r.loc] }));
}

export function pointsFor(place) {
  return POINTS[place - 1] || 0;
}

export function newCup(cupId, roster) {
  return { cupId, round: 0, points: Object.fromEntries(roster.map((k) => [k, 0])), places: Object.fromEntries(roster.map((k) => [k, []])) };
}

// `order` lists racer keys from first to last.
export function applyResult(state, order) {
  order.forEach((key, i) => {
    if (!(key in state.points)) { state.points[key] = 0; state.places[key] = []; }
    state.points[key] += pointsFor(i + 1);
    state.places[key].push(i + 1);
  });
  state.round++;
  return state;
}

// Sorted standings. Ties go to whoever has more wins, then more seconds, and
// so on, then to the better last race.
export function standings(state) {
  const keys = Object.keys(state.points);
  const countOf = (key, place) => state.places[key].filter((p) => p === place).length;
  return keys
    .map((key) => ({ key, points: state.points[key], places: state.places[key] }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      for (let place = 1; place <= POINTS.length; place++) {
        const d = countOf(b.key, place) - countOf(a.key, place);
        if (d) return d;
      }
      const la = a.places[a.places.length - 1] ?? 99, lb = b.places[b.places.length - 1] ?? 99;
      return la - lb;
    });
}

export function cupComplete(state) {
  return state.round >= CUP_BY_ID[state.cupId].races.length;
}

export function placeOf(state, key) {
  return standings(state).findIndex((s) => s.key === key) + 1;
}

export const TROPHIES = ['gold', 'silver', 'bronze'];
export function trophyFor(place) {
  return TROPHIES[place - 1] || null;
}
export function starsFor(place) {
  return place >= 1 && place <= 3 ? 4 - place : 0;
}

// Coins for a single race finish.
export function raceCoins(place, kind) {
  const base = [60, 45, 35, 25, 20, 15, 10][place - 1] || 5;
  return kind === 'elimination' ? Math.round(base * 1.1) : base;
}
