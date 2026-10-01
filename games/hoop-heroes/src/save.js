// Progress under the `hoop-heroes.v1` local-storage key. DOM-free: the page
// passes in a storage object (or null when storage is blocked).
import { freshMissions, progressMissions, MISSION_REWARD } from './missions.js';
import { RIVALS, LADDER_COURTS, courtRivals } from './rivals.js';
import { LOCKER, itemState } from './cosmetics.js';
import { dayDiff } from './rng.js';

export const SAVE_KEY = 'hoop-heroes.v1';
export const FLICK_REF = 2.7; // screen heights per second

export function defaultSave() {
  return {
    v: 1,
    muted: false,
    music: true,
    easy: false,
    flickRef: FLICK_REF,
    tickets: 0,
    owned: { balls: ['classic'], jerseys: ['sunny'], courts: ['park'] },
    equip: { ball: 'classic', jersey: 'sunny', court: 'park' },
    beaten: [],
    losses: {},
    rivalBest: {},
    trophies: [],
    best: { timed: 0, moving: 0, racks: 0 },
    trick: {},
    daily: { last: '', streak: 0, bestStreak: 0, scores: {} },
    missions: freshMissions(),
    stats: { rounds: 0, shots: 0, makes: 0, swishes: 0, fires: 0 },
    seenHelp: false,
  };
}

function merge(base, data) {
  if (!data || typeof data !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (!(k in data)) continue;
    const b = base[k], d = data[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, d);
    else if (Array.isArray(b)) base[k] = Array.isArray(d) ? d.slice() : b;
    else if (typeof d === typeof b) base[k] = d;
  }
  // Keep open-ended maps (rival bests, trick stars, daily scores) whole.
  return base;
}

export function loadSave(storage) {
  const save = defaultSave();
  if (!storage) return save;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return save;
    const data = JSON.parse(raw);
    merge(save, data);
    for (const k of ['losses', 'rivalBest', 'trick']) if (data[k] && typeof data[k] === 'object') save[k] = { ...data[k] };
    if (data.daily?.scores) save.daily.scores = { ...data.daily.scores };
    if (!Array.isArray(save.missions.active) || save.missions.active.length !== 3) save.missions = freshMissions();
  } catch {
    return defaultSave();
  }
  return save;
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

// ------------------------------------------------------------ tournament

export function nextRival(save) {
  return RIVALS.find((r) => !save.beaten.includes(r.id)) || null;
}

export function rivalUnlocked(save, rival) {
  const i = RIVALS.indexOf(rival);
  return i === 0 || save.beaten.includes(RIVALS[i - 1].id) || save.beaten.includes(rival.id);
}

export function rivalEase(save, rival) {
  return 1 + 0.12 * Math.min(3, save.losses[rival.id] || 0);
}

// ------------------------------------------------------------ daily

export function liveStreak(save, today) {
  if (!save.daily.last) return 0;
  const gap = dayDiff(save.daily.last, today);
  return gap <= 1 ? save.daily.streak : 0;
}

function recordDaily(save, key, score) {
  const d = save.daily;
  if (d.last !== key) {
    d.streak = d.last && dayDiff(d.last, key) === 1 ? d.streak + 1 : 1;
    d.last = key;
    d.bestStreak = Math.max(d.bestStreak, d.streak);
  }
  const prev = d.scores[key] || 0;
  d.scores[key] = Math.max(prev, score);
  // Only keep the last few weeks.
  const keys = Object.keys(d.scores).sort();
  while (keys.length > 30) delete d.scores[keys.shift()];
  return score > prev;
}

// ------------------------------------------------------------ rounds

export function ticketsFor(summary) {
  let t = 5 + Math.round(summary.score / 2);
  if (summary.won) t += 15;
  if (summary.stars) t += summary.stars * 5;
  if (summary.daily) t += 10;
  return t;
}

// summary: { mode: 'quick'|'tour'|'trick'|'daily', kind, score, stats..., won, rival, level, stars, dateKey }
// Returns what happened: { tickets, newBest, prevBest, missions, trophies, firstWin }.
export function recordRound(save, summary) {
  const out = { tickets: 0, newBest: false, prevBest: 0, missions: [], trophies: [], firstWin: false };
  const s = save.stats;
  s.rounds++;
  s.shots += summary.shots || 0;
  s.makes += summary.makes || 0;
  s.swishes += summary.swishes || 0;
  s.fires += summary.fires || 0;

  if (summary.mode === 'quick') {
    out.prevBest = save.best[summary.kind] || 0;
    if (summary.score > out.prevBest) { save.best[summary.kind] = summary.score; out.newBest = out.prevBest > 0 || summary.score > 0; }
  } else if (summary.mode === 'tour') {
    const id = summary.rival;
    out.prevBest = save.rivalBest[id] || 0;
    if (summary.score > out.prevBest) { save.rivalBest[id] = summary.score; out.newBest = out.prevBest > 0; }
    if (summary.won) {
      if (!save.beaten.includes(id)) { save.beaten.push(id); out.firstWin = true; }
      for (const c of LADDER_COURTS) {
        if (!save.trophies.includes(c) && courtRivals(c).every((r) => save.beaten.includes(r.id))) {
          save.trophies.push(c);
          out.trophies.push(c);
          if (!save.owned.courts.includes(c)) save.owned.courts.push(c);
        }
      }
      if (save.trophies.includes('space') && !save.trophies.includes('gold')) {
        save.trophies.push('gold');
        out.trophies.push('gold');
      }
      // Each won court opens the next one for Quick Play.
      const order = ['park', 'beach', 'roof', 'space'];
      for (let i = 0; i < order.length - 1; i++) {
        if (save.trophies.includes(order[i]) && !save.owned.courts.includes(order[i + 1])) save.owned.courts.push(order[i + 1]);
      }
    } else {
      save.losses[id] = (save.losses[id] || 0) + 1;
    }
  } else if (summary.mode === 'trick') {
    const t = save.trick[summary.level] || { stars: 0, best: 0 };
    out.prevBest = t.best;
    if (summary.makes > t.best) { out.newBest = t.best > 0; t.best = summary.makes; }
    t.stars = Math.max(t.stars, summary.stars || 0);
    save.trick[summary.level] = t;
  } else if (summary.mode === 'daily') {
    out.prevBest = save.daily.scores[summary.dateKey] || 0;
    out.newBest = recordDaily(save, summary.dateKey, summary.score) && out.prevBest > 0;
  }

  // Trophy cosmetics are granted the moment the trophy is won.
  for (const kind of ['balls', 'jerseys', 'courts']) {
    for (const item of LOCKER[kind]) {
      if (item.trophy && save.trophies.includes(item.trophy) && !save.owned[kind].includes(item.id) && itemState(save, kind, item) === 'owned') {
        save.owned[kind].push(item.id);
      }
    }
  }

  out.missions = progressMissions(save.missions, { ...summary, won: summary.won ? 1 : 0, daily: summary.mode === 'daily' ? 1 : 0 });
  out.tickets = ticketsFor(summary) + out.missions.length * MISSION_REWARD;
  save.tickets += out.tickets;
  return out;
}

export function buyItem(save, kind, item) {
  if (itemState(save, kind, item) !== 'buy' || save.tickets < item.price) return false;
  save.tickets -= item.price;
  save.owned[kind].push(item.id);
  return true;
}

// The player's flick reference drifts toward their own flicks.
export function adaptFlick(save, flick) {
  if (!(flick > 0)) return;
  const r = save.flickRef * Math.pow(flick / save.flickRef, 0.06);
  save.flickRef = Math.max(1.6, Math.min(4.5, r));
}
