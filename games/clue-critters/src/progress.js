// Saves, stars, ranks, unlocks and the daily streak. DOM-free.
import { dayGap } from './rng.js';
import { CRITTERS } from './data.js';

export const STORAGE_KEY = 'clue-critters.v1';

export const RANKS = [
  { name: 'Pup', stars: 0 },
  { name: 'Sniffer', stars: 3 },
  { name: 'Tracker', stars: 8 },
  { name: 'Detective', stars: 15 },
  { name: 'Sergeant', stars: 24 },
  { name: 'Inspector', stars: 36 },
  { name: 'Chief Inspector', stars: 50 },
];

export const HATS = [
  { id: 'deerstalker', name: 'Detective Cap', need: null },
  { id: 'bowler', name: 'Bowler Hat', need: { rank: 1 } },
  { id: 'beret', name: 'Painter Beret', need: { cases: 3 } },
  { id: 'cowboy', name: 'Cowpup Hat', need: { dailyDays: 1 } },
  { id: 'top', name: 'Top Hat', need: { rank: 3 } },
  { id: 'party', name: 'Party Hat', need: { bestStreak: 3 } },
  { id: 'propeller', name: 'Propeller Cap', need: { endless: 5 } },
  { id: 'pirate', name: 'Pirate Hat', need: { rank: 5 } },
  { id: 'crown', name: 'Golden Crown', need: { story: 12 } },
];

export const COATS = [
  { id: 'trench', name: 'Trench Coat', need: null },
  { id: 'raincoat', name: 'Yellow Raincoat', need: { cases: 2 } },
  { id: 'plaid', name: 'Plaid Coat', need: { rank: 2 } },
  { id: 'sweater', name: 'Cozy Sweater', need: { dailyDays: 3 } },
  { id: 'cape', name: 'Hero Cape', need: { endless: 10 } },
  { id: 'starry', name: 'Starry Cloak', need: { rank: 6 } },
];

export function needText(need) {
  if (!need) return 'Ready to wear';
  if (need.rank != null) return `Reach ${RANKS[need.rank].name} rank`;
  if (need.cases != null) return `Solve ${need.cases} cases`;
  if (need.dailyDays != null) return need.dailyDays === 1 ? 'Solve a daily mystery' : `Solve ${need.dailyDays} daily mysteries`;
  if (need.bestStreak != null) return `Daily streak of ${need.bestStreak}`;
  if (need.endless != null) return `Solve ${need.endless} endless cases`;
  if (need.story != null) return 'Finish the story';
  return '';
}

export function newState() {
  return {
    v: 1,
    story: {},
    book: [],
    friends: {},
    cases: 0,
    endless: { 1: 0, 2: 0, 3: 0 },
    endlessNext: { 1: 1, 2: 1, 3: 1 },
    endlessStars: 0,
    dailyStars: 0,
    daily: { last: '', streak: 0, best: 0, days: 0 },
    outfit: { hat: 'deerstalker', coat: 'trench' },
    seenUnlocks: ['deerstalker', 'trench'],
    settings: { muted: false, music: true, speech: false },
    active: null,
  };
}

export function normalize(raw) {
  const base = newState();
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return base;
  const out = { ...base, ...raw };
  out.endless = { ...base.endless, ...(raw.endless || {}) };
  out.endlessNext = { ...base.endlessNext, ...(raw.endlessNext || {}) };
  out.daily = { ...base.daily, ...(raw.daily || {}) };
  out.outfit = { ...base.outfit, ...(raw.outfit || {}) };
  out.settings = { ...base.settings, ...(raw.settings || {}) };
  out.story = raw.story && typeof raw.story === 'object' ? raw.story : {};
  out.friends = raw.friends && typeof raw.friends === 'object' ? raw.friends : {};
  // Case files are drawn straight from these entries, so drop damaged ones.
  const entryOk = (e) => e && typeof e === 'object' && CRITTERS.some((c) => c.id === e.culprit);
  out.book = Array.isArray(raw.book)
    ? raw.book.filter(entryOk).slice(-200).map((e) => ({ ...e, stars: Math.max(0, Math.min(3, e.stars | 0)) }))
    : [];
  out.seenUnlocks = Array.isArray(raw.seenUnlocks) ? raw.seenUnlocks : base.seenUnlocks;
  return out;
}

export function loadSave(storage) {
  if (!storage) return newState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : newState();
  } catch {
    return newState();
  }
}

export function writeSave(storage, state) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage) {
  try { storage?.removeItem(STORAGE_KEY); return true; } catch { return false; }
}

// Three stars for a clean solve, two for one or two slips, one otherwise.
export function starsFor(wrong, hints) {
  const slips = wrong + hints;
  if (slips === 0) return 3;
  if (slips <= 2) return 2;
  return 1;
}

export function storyStars(state) {
  return Object.values(state.story).reduce((sum, r) => sum + (r.stars || 0), 0);
}

export function storySolved(state) {
  return Object.values(state.story).filter((r) => r.stars > 0).length;
}

export function totalStars(state) {
  return storyStars(state) + state.endlessStars + state.dailyStars;
}

export function rankFor(stars) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (stars >= RANKS[i].stars) index = i;
  const next = RANKS[index + 1] || null;
  const from = RANKS[index].stars;
  const progress = next ? (stars - from) / (next.stars - from) : 1;
  return { index, name: RANKS[index].name, next, progress, stars };
}

function endlessTotal(state) {
  return state.endless[1] + state.endless[2] + state.endless[3];
}

export function meets(state, need) {
  if (!need) return true;
  if (need.rank != null) return rankFor(totalStars(state)).index >= need.rank;
  if (need.cases != null) return state.cases >= need.cases;
  if (need.dailyDays != null) return state.daily.days >= need.dailyDays;
  if (need.bestStreak != null) return state.daily.best >= need.bestStreak;
  if (need.endless != null) return endlessTotal(state) >= need.endless;
  if (need.story != null) return storySolved(state) >= need.story;
  return false;
}

export function unlockedIds(state) {
  return [...HATS, ...COATS].filter((x) => meets(state, x.need)).map((x) => x.id);
}

// Streak as shown today: it only counts if the last solve was today or
// yesterday. Missing a day quietly starts again at zero.
export function currentStreak(state, today) {
  const gap = dayGap(state.daily.last, today);
  return gap <= 1 ? state.daily.streak : 0;
}

// Record a solved case. `kase` needs id, kind, difficulty, title, culprit
// critter id and reason; `day` is today's key. Returns what changed so the
// results screen can celebrate it.
export function recordSolve(state, kase, { wrong = 0, hints = 0, day = '', storyIndex = -1 } = {}) {
  const stars = starsFor(wrong, hints);
  const rankBefore = rankFor(totalStars(state)).index;
  const unlockedBefore = new Set(unlockedIds(state));
  let newBest = false;
  state.cases++;
  if (kase.kind === 'story') {
    const prev = state.story[kase.id]?.stars || 0;
    if (stars > prev) { state.story[kase.id] = { stars }; newBest = prev > 0; }
  } else if (kase.kind === 'daily') {
    if (state.daily.last !== day) {
      const gap = dayGap(state.daily.last, day);
      state.daily.streak = gap === 1 ? state.daily.streak + 1 : 1;
      state.daily.best = Math.max(state.daily.best, state.daily.streak);
      state.daily.last = day;
      state.daily.days++;
      state.dailyStars += stars;
    }
  } else {
    state.endless[kase.difficulty]++;
    state.endlessStars += stars;
    state.endlessNext[kase.difficulty]++;
  }
  const newFriends = kase.suspects.filter((id) => !state.friends[id]);
  for (const id of kase.suspects) state.friends[id] = true;
  state.book.push({ id: kase.id, kind: kase.kind, title: kase.title, culprit: kase.suspects[kase.culprit], reason: kase.reason, stars, day, storyIndex });
  if (state.book.length > 200) state.book.splice(0, state.book.length - 200);
  state.active = null;
  const rank = rankFor(totalStars(state));
  const unlocked = unlockedIds(state).filter((id) => !unlockedBefore.has(id));
  return { stars, newBest, rank, rankUp: rank.index > rankBefore, unlocked, newFriends };
}

// The daily mystery for today has been solved already?
export function dailyDone(state, day) {
  return state.daily.last === day;
}
