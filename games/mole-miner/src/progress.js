// Saves, dates and streaks. DOM-free: storage is passed in (null = blocked).
import { SAVE_KEY, UPGRADE_ORDER } from './data.js';

export function newSave(seed = 'meadow-1') {
  return {
    v: 1,
    seed,
    mineNo: 1,
    coins: 0,
    upgrades: Object.fromEntries(UPGRADE_ORDER.map((k) => [k, 0])),
    museum: {},
    paints: ['sunflower'],
    paint: 'sunflower',
    bestDepth: 0,
    milestones: [],
    core: false,
    diff: '',
    pod: null,
    daily: { last: '', streak: 0, bestStreak: 0, results: {} },
    stats: { trips: 0, gems: 0, tows: 0, earned: 0, dug: 0 },
    seen: { workshop: false, help: false },
    muted: false,
    music: true,
  };
}

export function normalize(raw) {
  const base = newSave();
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return base;
  const s = { ...base, ...raw };
  s.upgrades = { ...base.upgrades, ...(raw.upgrades || {}) };
  for (const k of UPGRADE_ORDER) s.upgrades[k] = Math.max(0, Math.floor(Number(s.upgrades[k]) || 0));
  s.museum = { ...(raw.museum || {}) };
  s.paints = Array.isArray(raw.paints) && raw.paints.length ? [...new Set(['sunflower', ...raw.paints])] : ['sunflower'];
  if (!s.paints.includes(s.paint)) s.paint = 'sunflower';
  s.milestones = Array.isArray(raw.milestones) ? raw.milestones.filter((m) => typeof m === 'number') : [];
  s.daily = { ...base.daily, ...(raw.daily || {}) };
  s.daily.results = { ...(raw.daily?.results || {}) };
  s.stats = { ...base.stats, ...(raw.stats || {}) };
  s.seen = { ...base.seen, ...(raw.seen || {}) };
  s.coins = Math.max(0, Math.floor(Number(s.coins) || 0));
  s.diff = typeof s.diff === 'string' ? s.diff : '';
  return s;
}

export function loadSave(storage) {
  if (!storage) return newSave();
  try {
    const txt = storage.getItem(SAVE_KEY);
    return txt ? normalize(JSON.parse(txt)) : newSave();
  } catch {
    return newSave();
  }
}

export function writeSave(storage, save) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ grid diffs

// The mine is regenerated from its seed on load; only tiles that differ from
// the fresh mine are stored, as "delta.code" pairs (index deltas keep it
// short).
export function encodeDiff(base, tiles) {
  const out = [];
  let last = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === base[i]) continue;
    out.push((i - last).toString(36) + '.' + tiles[i].toString(36));
    last = i;
  }
  return out.join(',');
}

export function applyDiff(tiles, diff) {
  if (!diff) return 0;
  let i = 0, n = 0;
  for (const part of diff.split(',')) {
    const [d, c] = part.split('.');
    i += parseInt(d, 36);
    const code = parseInt(c, 36);
    if (!(i >= 0 && i < tiles.length) || !(code >= 0 && code < 256)) continue;
    tiles[i] = code;
    n++;
  }
  return n;
}

// ------------------------------------------------------------ dates

export function localDate(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days, 12);
  return localDate(dt);
}

// Record a finished daily dig. Returns what changed so the UI can celebrate.
// Only the first success of a day moves the streak.
export function recordDaily(save, date, { success, score }) {
  const d = save.daily;
  const prev = d.results[date] || { best: 0, done: false, tries: 0 };
  const res = { ...prev, tries: prev.tries + 1, best: Math.max(prev.best, score || 0) };
  let firstClear = false;
  if (success && !prev.done) {
    res.done = true;
    firstClear = true;
    d.streak = d.last === shiftDate(date, -1) ? d.streak + 1 : (d.last === date ? d.streak : 1);
    d.last = date;
    d.bestStreak = Math.max(d.bestStreak || 0, d.streak);
  }
  d.results[date] = res;
  // Keep the results table small.
  const keys = Object.keys(d.results).sort();
  while (keys.length > 21) delete d.results[keys.shift()];
  return { firstClear, streak: d.streak, best: res.best, newBest: (score || 0) > prev.best };
}

// The streak shown on the title: it lapses quietly after a missed day.
export function currentStreak(save, today) {
  const d = save.daily;
  if (d.last === today || d.last === shiftDate(today, -1)) return d.streak;
  return 0;
}

export function dailyReward(streak) {
  return 100 + 25 * Math.min(Math.max(streak, 1), 8);
}
