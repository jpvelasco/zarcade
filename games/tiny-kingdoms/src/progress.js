// Save data, stars, unlocks, the daily streak and personal bests.
// DOM-free: the page passes in `localStorage` (or null).
import { COLORS, COLOR_UNLOCKS, EMBLEMS, EMBLEM_UNLOCKS, HEROES, HERO_ORDER } from './data.js';
import { CAMPAIGN, starsFor } from './campaign.js';

export const SAVE_KEY = 'tiny-kingdoms.v1';

export function defaultSave() {
  return {
    stars: {}, goals: {}, best: {}, wins: 0, played: 0,
    color: 'bluebell', emblem: 'crown', hero: null,
    daily: { lastWin: null, streak: 0, bestStreak: 0, best: {} },
    skirmish: { best: {}, wins: 0, size: 'medium', rivals: 1, difficulty: 'normal' },
    seen: {}, muted: false, music: true, sendAll: false,
  };
}

export function loadSave(storage) {
  const base = defaultSave();
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return base;
    const obj = (v) => (v && typeof v === 'object' ? v : {});
    return {
      ...base, ...data,
      stars: { ...obj(data.stars) },
      goals: { ...obj(data.goals) },
      best: { ...obj(data.best) },
      daily: { ...base.daily, ...obj(data.daily), best: { ...obj(obj(data.daily).best) } },
      skirmish: { ...base.skirmish, ...obj(data.skirmish), best: { ...obj(obj(data.skirmish).best) } },
      seen: { ...obj(data.seen) },
    };
  } catch {
    return base;
  }
}

// Returns false when nothing was saved (storage full, disabled or blocked).
export function writeSave(storage, save) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function totalStars(save) {
  return CAMPAIGN.reduce((sum, lv) => sum + (save.stars[lv.id] || 0), 0);
}

export function mapsCleared(save) {
  return CAMPAIGN.filter((lv) => (save.stars[lv.id] || 0) > 0).length;
}

// The next map opens on any win, so nobody gets stuck.
export function isMapUnlocked(save, index) {
  return index === 0 || (save.stars[CAMPAIGN[index - 1]?.id] || 0) > 0;
}

export function highestUnlocked(save) {
  let i = 0;
  while (i + 1 < CAMPAIGN.length && isMapUnlocked(save, i + 1)) i++;
  return i;
}

function meets(req, save) {
  if (req.stars && totalStars(save) < req.stars) return false;
  if (req.wins && save.wins < req.wins) return false;
  if (req.streak && save.daily.bestStreak < req.streak) return false;
  return true;
}

export function unlockText(req) {
  if (req.stars) return `${req.stars} ★`;
  if (req.wins) return `${req.wins} wins`;
  if (req.streak) return req.streak === 1 ? 'Win a daily' : `${req.streak}-day streak`;
  return '';
}

export function unlockedColors(save) {
  return COLORS.filter((c) => meets(COLOR_UNLOCKS[c.id] || {}, save)).map((c) => c.id);
}

export function unlockedEmblems(save) {
  return EMBLEMS.filter((e) => meets(EMBLEM_UNLOCKS[e] || {}, save));
}

export function unlockedHeroes(save) {
  const cleared = mapsCleared(save);
  return HERO_ORDER.filter((h) => cleared >= HEROES[h].unlock);
}

function unlockSnapshot(save) {
  return { colors: unlockedColors(save), emblems: unlockedEmblems(save), heroes: unlockedHeroes(save) };
}

function unlockDiff(before, after) {
  const out = [];
  for (const c of after.colors) if (!before.colors.includes(c)) out.push({ kind: 'color', id: c });
  for (const e of after.emblems) if (!before.emblems.includes(e)) out.push({ kind: 'emblem', id: e });
  for (const h of after.heroes) if (!before.heroes.includes(h)) out.push({ kind: 'hero', id: h });
  return out;
}

// The hero to take into a match: the chosen one if unlocked, else the
// newest unlocked one.
export function activeHero(save) {
  const list = unlockedHeroes(save);
  if (save.hero === 'none') return null;
  if (save.hero && list.includes(save.hero)) return save.hero;
  return list[list.length - 1] || null;
}

// result: { won, time, sends, lost }
export function recordCampaign(save, index, result) {
  const lv = CAMPAIGN[index];
  const before = unlockSnapshot(save);
  const { met } = starsFor(lv, result);
  const prev = save.stars[lv.id] || 0;
  // Goals count once met, even in different wins: stars only ever grow.
  const ever = (save.goals[lv.id] || []).slice(0, lv.goals.length);
  if (result.won) met.forEach((m, k) => { if (m) ever[k] = true; });
  const stars = result.won ? 1 + lv.goals.filter((g, k) => ever[k]).length : 0;
  const prevBest = save.best[lv.id];
  save.played++;
  let newBest = false;
  if (result.won) {
    save.wins++;
    save.goals[lv.id] = lv.goals.map((g, k) => !!ever[k]);
    if (stars > prev) save.stars[lv.id] = stars;
    if (prevBest == null || result.time < prevBest) {
      newBest = prevBest != null;
      save.best[lv.id] = Math.round(result.time * 10) / 10;
    }
  }
  return {
    stars, met, prev, improved: stars > prev, newBest,
    best: save.best[lv.id] ?? null,
    firstClear: result.won && prev === 0,
    unlocks: unlockDiff(before, unlockSnapshot(save)),
  };
}

export function previousDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const mm = String(date.getMonth() + 1).padStart(2, '0'), dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// The streak counts days in a row with a daily win. Missing a day just
// starts a new streak next time.
export function currentStreak(save, todayKey) {
  const d = save.daily;
  if (d.lastWin === todayKey || d.lastWin === previousDay(todayKey)) return d.streak;
  return 0;
}

export function recordDaily(save, key, result) {
  const before = unlockSnapshot(save);
  const d = save.daily;
  save.played++;
  let newBest = false;
  if (result.won) {
    save.wins++;
    if (d.lastWin !== key) {
      d.streak = d.lastWin === previousDay(key) ? d.streak + 1 : 1;
      d.lastWin = key;
      d.bestStreak = Math.max(d.bestStreak, d.streak);
    }
    const prev = d.best[key];
    if (prev == null || result.time < prev) {
      newBest = prev != null;
      d.best[key] = Math.round(result.time * 10) / 10;
    }
    // Keep the bests table small: only the last 14 days.
    const keys = Object.keys(d.best).sort();
    while (keys.length > 14) delete d.best[keys.shift()];
  }
  return { streak: d.streak, newBest, best: d.best[key] ?? null, unlocks: unlockDiff(before, unlockSnapshot(save)) };
}

export function skirmishKey(size, rivals, difficulty) {
  return `${size}-${rivals}-${difficulty}`;
}

export function recordSkirmish(save, key, result) {
  const before = unlockSnapshot(save);
  save.played++;
  let newBest = false;
  if (result.won) {
    save.wins++;
    save.skirmish.wins++;
    const prev = save.skirmish.best[key];
    if (prev == null || result.time < prev) {
      newBest = prev != null;
      save.skirmish.best[key] = Math.round(result.time * 10) / 10;
    }
  }
  return { newBest, best: save.skirmish.best[key] ?? null, unlocks: unlockDiff(before, unlockSnapshot(save)) };
}

export function formatTime(sec) {
  if (sec == null) return '—';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
