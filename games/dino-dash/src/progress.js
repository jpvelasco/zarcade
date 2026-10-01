// Save data under one namespaced localStorage key, plus the shop and the
// Daily Dash bookkeeping. DOM-free: storage is passed in.
import { DINOS, HATS, BOOSTS, BOOST_MAX, boostById } from './catalog.js';
import { defaultMissions, sanitizeMissions } from './missions.js';
import { previousKey } from './daily.js';

export const SAVE_KEY = 'dino-dash.v1';

export function defaultSave() {
  return {
    coins: 0,
    best: 0, // metres
    bestScore: 0,
    dino: 'pip',
    hat: 'none',
    dinos: ['pip'],
    hats: ['none', 'leaf'],
    boosts: { magnet: 0, glide: 0, shield: 0 },
    missions: defaultMissions(),
    daily: { key: '', best: 0, goalDone: false, streak: 0, lastGoal: '' },
    totals: { runs: 0, distance: 0, coins: 0 },
    muted: false,
    music: true,
    tutorial: false,
  };
}

const int = (v, max = 1e9) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);

export function loadSave(storage) {
  const save = defaultSave();
  let raw = null;
  try {
    raw = JSON.parse(storage?.getItem(SAVE_KEY) || 'null');
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object') return save;
  save.coins = int(raw.coins);
  save.best = int(raw.best);
  save.bestScore = int(raw.bestScore);
  const dinoIds = new Set(DINOS.map((d) => d.id));
  const hatIds = new Set(HATS.map((h) => h.id));
  if (Array.isArray(raw.dinos)) save.dinos = [...new Set(['pip', ...raw.dinos.filter((id) => dinoIds.has(id))])];
  if (Array.isArray(raw.hats)) save.hats = [...new Set(['none', 'leaf', ...raw.hats.filter((id) => hatIds.has(id))])];
  if (save.dinos.includes(raw.dino)) save.dino = raw.dino;
  if (save.hats.includes(raw.hat)) save.hat = raw.hat;
  if (raw.boosts && typeof raw.boosts === 'object') for (const b of BOOSTS) save.boosts[b.id] = int(raw.boosts[b.id], BOOST_MAX);
  save.missions = sanitizeMissions(raw.missions);
  const d = raw.daily;
  if (d && typeof d === 'object') {
    save.daily.key = typeof d.key === 'string' ? d.key : '';
    save.daily.best = int(d.best);
    save.daily.goalDone = d.goalDone === true;
    save.daily.streak = int(d.streak, 9999);
    save.daily.lastGoal = typeof d.lastGoal === 'string' ? d.lastGoal : '';
  }
  const t = raw.totals;
  if (t && typeof t === 'object') {
    save.totals.runs = int(t.runs);
    save.totals.distance = int(t.distance);
    save.totals.coins = int(t.coins);
  }
  save.muted = raw.muted === true;
  save.music = raw.music !== false;
  save.tutorial = raw.tutorial === true;
  return save;
}

// Returns false in private mode or when storage is full or blocked.
export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// ---- shop -------------------------------------------------------------

export function owns(save, kind, id) {
  return (kind === 'dino' ? save.dinos : save.hats).includes(id);
}

export function buy(save, kind, id) {
  const list = kind === 'dino' ? DINOS : HATS;
  const item = list.find((x) => x.id === id);
  if (!item) return { ok: false, reason: 'unknown' };
  if (owns(save, kind, id)) return { ok: false, reason: 'owned' };
  if (save.coins < item.price) return { ok: false, reason: 'coins', need: item.price - save.coins };
  save.coins -= item.price;
  (kind === 'dino' ? save.dinos : save.hats).push(id);
  equip(save, kind, id);
  return { ok: true, price: item.price };
}

export function equip(save, kind, id) {
  if (!owns(save, kind, id)) return false;
  if (kind === 'dino') save.dino = id;
  else save.hat = id;
  return true;
}

export function boostPrice(save, id) {
  const b = boostById(id);
  const lv = save.boosts[id] || 0;
  return lv >= BOOST_MAX ? null : b.prices[lv];
}

export function upgradeBoost(save, id) {
  const b = boostById(id);
  if (!b) return { ok: false, reason: 'unknown' };
  const price = boostPrice(save, id);
  if (price === null) return { ok: false, reason: 'max' };
  if (save.coins < price) return { ok: false, reason: 'coins', need: price - save.coins };
  save.coins -= price;
  save.boosts[id]++;
  return { ok: true, price, level: save.boosts[id] };
}

// ---- runs -------------------------------------------------------------

// Fold a finished run into the save. Returns what changed so the results
// screen can celebrate.
export function recordRun(save, { distance, score, coins, daily = null }) {
  const m = Math.floor(distance);
  const s = Math.floor(score);
  const out = { newBest: false, newBestScore: false, dailyGoal: false, dailyBest: false, streak: save.daily.streak, reward: 0 };
  save.coins += coins;
  save.totals.runs++;
  save.totals.distance += m;
  save.totals.coins += coins;
  if (daily) {
    if (save.daily.key !== daily.key) {
      save.daily.key = daily.key;
      save.daily.best = 0;
      save.daily.goalDone = false;
    }
    if (m > save.daily.best) {
      save.daily.best = m;
      out.dailyBest = true;
    }
    if (!save.daily.goalDone && m >= daily.goal) {
      save.daily.goalDone = true;
      save.daily.streak = save.daily.lastGoal === previousKey(daily.key) ? save.daily.streak + 1 : 1;
      save.daily.lastGoal = daily.key;
      save.coins += daily.reward;
      out.dailyGoal = true;
      out.reward = daily.reward;
      out.streak = save.daily.streak;
    }
  } else {
    // Daily runs have their own board; the main bests are for regular runs.
    if (m > save.best) {
      save.best = m;
      out.newBest = true;
    }
    if (s > save.bestScore) {
      save.bestScore = s;
      out.newBestScore = true;
    }
  }
  return out;
}

// Today's Daily Dash state for the title screen.
export function dailyStatus(save, key) {
  const today = save.daily.key === key;
  const streakAlive = save.daily.lastGoal === key || save.daily.lastGoal === previousKey(key);
  return {
    best: today ? save.daily.best : 0,
    goalDone: today && save.daily.goalDone,
    streak: streakAlive ? save.daily.streak : 0,
  };
}
