// Which cards get dealt: trail levels, the Daily Deal and Quick Deals. Each
// one is the first seed (counting up from a base seed) that the solver proves
// winnable within a fixed node budget, so every level and every daily can be
// cleared, the same way on every device.
import { hashSeed } from './rng.js';
import { Round } from './game.js';
import { solve, lineStreak } from './solver.js';
import { LAYOUTS, layoutById } from './layouts.js';

export const DEAL_BUDGET = 25000;
const MAX_TRIES = 48;

export function findWinnableDeal(layout, baseSeed, stockSize, { budget = DEAL_BUDGET, maxTries = MAX_TRIES } = {}) {
  let fallback = null;
  let nodes = 0;
  for (let t = 0; t < maxTries; t++) {
    const seed = hashSeed(baseSeed, t);
    const round = new Round({ layout, seed, stockSize });
    const res = solve(round.position(), { budget });
    nodes += res.nodes;
    if (res.result === 'win') {
      return { seed, tries: t + 1, verified: true, line: res.line, streak: lineStreak(res.line), nodes };
    }
    if (!fallback || res.best.cleared > fallback.cleared) fallback = { seed, cleared: res.best.cleared };
  }
  // Never expected (the tests prove it for levels and dailies); keep playing
  // the closest deal rather than failing to deal at all.
  return { seed: fallback.seed, tries: maxTries, verified: false, line: null, streak: 0, nodes };
}

// ------------------------------------------------------------------ trail

export const SECTIONS = [
  { id: 'hollow', name: 'Pine Hollow', blurb: 'Pitch camp among the pines.', stock: 24 },
  { id: 'lake', name: 'Lakeside', blurb: 'Lanterns and loons by the water.', stock: 21 },
  { id: 'ridge', name: 'Starry Ridge', blurb: 'Up where the stars are close.', stock: 19 },
];
export const LEVELS_PER_SECTION = 8;

const TRAIL = [
  ['peaks', 'tent', 'canoe', 'pine', 'lantern', 'twin', 'peaks', 'campfire'],
  ['canoe', 'dipper', 'tent', 'twin', 'lantern', 'cassiopeia', 'pine', 'campfire'],
  ['dipper', 'orion', 'cassiopeia', 'twin', 'campfire', 'tent', 'pine', 'orion'],
];
// The streak each level asks for, before capping at what its verified line
// reaches (so the goal is always possible).
const STREAK_TARGETS = [
  [3, 4, 4, 5, 5, 5, 6, 6],
  [6, 6, 7, 7, 7, 8, 8, 8],
  [8, 8, 9, 9, 9, 10, 10, 10],
];

export const LEVELS = TRAIL.flatMap((ids, s) => ids.map((id, j) => ({
  index: s * LEVELS_PER_SECTION + j,
  section: s,
  layoutId: id,
  // The section's stock, or what's left of the deck for a big layout.
  stock: Math.min(SECTIONS[s].stock, 51 - layoutById(id).count),
  target: STREAK_TARGETS[s][j],
  baseSeed: hashSeed(0xca3bf1, s * LEVELS_PER_SECTION + j),
})));
export const LEVEL_COUNT = LEVELS.length;
export const levelLabel = (i) => `Level ${i + 1}`;

const levelCache = new Map();
export const levelCached = (index) => levelCache.has(index);

// The level's deal plus its streak goal. Cached: replays deal instantly.
export function levelDeal(index) {
  if (levelCache.has(index)) return levelCache.get(index);
  const lv = LEVELS[index];
  const layout = layoutById(lv.layoutId);
  const found = findWinnableDeal(layout, lv.baseSeed, lv.stock);
  const deal = {
    kind: 'level',
    index,
    layout,
    seed: found.seed,
    stock: lv.stock,
    verified: found.verified,
    line: found.line,
    lineStreak: found.streak,
    streakGoal: Math.max(2, Math.min(lv.target, found.streak)),
    nodes: found.nodes,
  };
  levelCache.set(index, deal);
  return deal;
}

// ------------------------------------------------------------------ daily

// The local calendar date, so everyone sees the same deal on the same day.
export function dateKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return dateKey(d) === key ? d : null;
}

// Whole days since 1970-01-01 for a local date (DST-proof).
export const dayNumber = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);

// The layout of the day walks a fixed shuffle of every layout, so a week of
// dailies never repeats a shape.
const DAILY_ORDER = ['peaks', 'dipper', 'tent', 'twin', 'canoe', 'orion', 'lantern', 'campfire', 'pine', 'cassiopeia'];
export const DAILY_STOCK = 22;

const dailyCache = new Map();

// Today's layout, without dealing (cheap, for the title screen).
export function dailyLayout(date = new Date()) {
  const day = dayNumber(date);
  return layoutById(DAILY_ORDER[((day % DAILY_ORDER.length) + DAILY_ORDER.length) % DAILY_ORDER.length]);
}

export function dailyDeal(date = new Date()) {
  const key = dateKey(date);
  if (dailyCache.has(key)) return dailyCache.get(key);
  const day = dayNumber(date);
  const layout = dailyLayout(date);
  const found = findWinnableDeal(layout, hashSeed(0xda11, day), DAILY_STOCK);
  const deal = {
    kind: 'daily',
    key,
    layout,
    seed: found.seed,
    stock: DAILY_STOCK,
    verified: found.verified,
    line: found.line,
    lineStreak: found.streak,
    streakGoal: Math.max(2, Math.min(8, found.streak)),
    nodes: found.nodes,
  };
  dailyCache.set(key, deal);
  return deal;
}

// ------------------------------------------------------------------ quick

export const QUICK_STOCK = 22;

// A fresh winnable deal on any layout the player has reached on the trail
// (or on the one asked for).
export function quickDeal(seed, unlockedLevel = 0, layoutId = null) {
  const reached = [...new Set(LEVELS.slice(0, unlockedLevel + 1).map((l) => l.layoutId))];
  const pool = reached.length ? reached : [LAYOUTS[0].id];
  const layout = layoutById(layoutId && pool.includes(layoutId) ? layoutId : pool[(seed >>> 3) % pool.length]);
  const found = findWinnableDeal(layout, seed, QUICK_STOCK);
  return {
    kind: 'quick',
    layout,
    seed: found.seed,
    stock: QUICK_STOCK,
    verified: found.verified,
    line: found.line,
    lineStreak: found.streak,
    streakGoal: Math.max(2, Math.min(8, found.streak)),
    nodes: found.nodes,
  };
}

export const roundFor = (deal) => new Round({ layout: deal.layout, seed: deal.seed, stockSize: deal.stock });
