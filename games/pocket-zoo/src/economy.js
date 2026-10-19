// Pure economy formulas. Everything here is a function of plain numbers and
// the save state, so offline earnings and tests agree with play.
import {
  BIOMES, RARITY, HABITAT_LEVELS, ANIMAL_INDEX, ANIMALS, DECOS, DECO_INDEX, JOY,
  STAR_BONUS, EGG_GROWTH, EGG_MAX_MULT, BUILD_MULT, SNACK_MULT, OFFLINE_CAP_S, OFFLINE_MIN_S, OFFLINE_PURSE_S,
  OFFLINE_RATE, OFFLINE_FRESH_S, OFFLINE_TAIL,
} from './data.js';

export function animalRate(id, stars = 1) {
  const a = ANIMALS[ANIMAL_INDEX[id]];
  const tier = BIOMES.find((b) => b.id === a.biome).tier;
  return RARITY[a.rarity].base * tier * (1 + STAR_BONUS * (Math.max(1, stars) - 1));
}

export function joyMult(joy) {
  return 1 + JOY.bonus * Math.max(0, Math.min(JOY.max, joy)) / JOY.max;
}

export function decoBonus(state) {
  let bonus = 0;
  for (const id of Object.values(state.decos.placed)) bonus += DECOS[DECO_INDEX[id]]?.bonus || 0;
  return bonus;
}

// Income of one habitat per second, before the decoration bonus.
export function habitatRate(state, i, { joy = true } = {}) {
  const h = state.habitats[i];
  if (!h || h.level < 1) return 0;
  let sum = 0;
  for (const id of h.animals) sum += animalRate(id, state.animals[id]?.stars || 1);
  return sum * HABITAT_LEVELS[h.level - 1].mult * (joy ? joyMult(h.joy) : 1);
}

export function totalRate(state, opts) {
  let sum = 0;
  for (let i = 0; i < state.habitats.length; i++) sum += habitatRate(state, i, opts);
  return sum * (1 + decoBonus(state));
}

export const eggPrice = (state, b) => Math.round(BIOMES[b].egg * Math.min(EGG_MAX_MULT, EGG_GROWTH ** state.eggsBought[b]));
export const buildCost = (b, plot) => Math.round(BIOMES[b].egg * BUILD_MULT[plot]);
export const upgradeCost = (b, level) => Math.round(BIOMES[b].egg * 2 * 2.2 ** (level - 1));
export const snackCost = (b) => Math.max(3, Math.round(BIOMES[b].egg * SNACK_MULT));
export const unlockCost = (b) => BIOMES[b]?.unlock ?? Infinity;

// Coins earned while away: a share of the base rate (no Joy bonus), full pace
// for the first OFFLINE_FRESH_S and a slower trickle after that, up to the time
// cap, and never more than OFFLINE_PURSE_S of base income.
export function offlineEarnings(state, nowMs) {
  const last = +state.lastSeen;
  const away = last > 0 ? (nowMs - last) / 1000 : 0;
  if (!Number.isFinite(away) || !(away >= OFFLINE_MIN_S)) return { seconds: 0, coins: 0, capped: false };
  const seconds = Math.min(away, OFFLINE_CAP_S);
  const paced = Math.min(seconds, OFFLINE_FRESH_S) + Math.max(0, seconds - OFFLINE_FRESH_S) * OFFLINE_TAIL;
  const rate = totalRate(state, { joy: false });
  const earned = Number.isFinite(rate) ? rate * paced * OFFLINE_RATE : 0;
  const purse = rate * OFFLINE_PURSE_S;
  const coins = Math.max(0, Math.floor(Math.min(earned, purse)));
  return { seconds, away, coins, capped: away > OFFLINE_CAP_S || earned > purse };
}

// Two significant figures, for task goals and rewards.
export function niceRound(x) {
  if (x < 10) return Math.max(1, Math.round(x));
  const p = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa'];
export function fmt(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  let u = 0;
  let v = n;
  while (v >= 1000 && u < UNITS.length - 1) { v /= 1000; u++; }
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  let text = v.toFixed(digits);
  if (+text >= 1000 && u < UNITS.length - 1) { text = (+text / 1000).toFixed(2); u++; }
  // Drop trailing zeros after the decimal point only, so 200K stays 200K.
  if (text.includes('.')) text = text.replace(/\.?0+$/, '');
  return `${text}${UNITS[u]}`;
}

export function fmtRate(r) {
  if (r < 10) return (Math.round(r * 10) / 10).toString();
  return fmt(r);
}

export function fmtDuration(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${s} s`;
}
