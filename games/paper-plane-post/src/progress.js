// Saved progress. Pure functions over a storage-like object, so Node tests can
// pass a plain fake instead of localStorage.

import { earnedStamps, foldById, paperById, STAMPS } from './catalog.js';
import { MAX_STARS, REGIONS, ROUTES } from './routes.js';
import { dateKey, previousKey } from './daily.js';

export const SAVE_KEY = 'paper-plane-post.v1';

export function emptySave() {
  return {
    v: 1,
    muted: false,
    fold: 'dart',
    paper: 'cream',
    routes: {},
    lifetime: { letters: 0, rings: 0, snaps: 0, soft: 0, bullseye: 0, thermals: 0, flights: 0 },
    endless: { best: 0, bestScore: 0, runs: 0 },
    daily: { key: '', best: 0, done: false, streak: 0, lastDone: '', wins: 0 },
    stamps: [],
  };
}

export function loadSave(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || typeof parsed.routes !== 'object') return emptySave();
    const base = emptySave();
    return {
      ...base,
      ...parsed,
      routes: { ...parsed.routes },
      lifetime: { ...base.lifetime, ...parsed.lifetime },
      endless: { ...base.endless, ...parsed.endless },
      daily: { ...base.daily, ...parsed.daily },
      stamps: Array.isArray(parsed.stamps) ? parsed.stamps.slice() : [],
    };
  } catch {
    return emptySave();
  }
}

export function writeSave(storage, save) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Private browsing and full quotas are not worth interrupting a flight for.
  }
  return save;
}

export function entryFor(save, routeId) {
  return save.routes[routeId]
    || { stars: 0, best: 0, letters: 0, rings: 0, soft: false, bullseye: false, score: 0, done: false };
}

/** Lifetime counters the album and the hangar unlock against. */
export function stats(save) {
  let stars = 0;
  let routes = 0;
  for (const route of ROUTES) {
    const entry = entryFor(save, route.id);
    stars += entry.stars;
    if (entry.done) routes += 1;
  }
  const out = {
    ...save.lifetime,
    stars,
    routes,
    distance: save.endless.best,
    daily: save.daily.wins,
  };
  out.stamps = earnedStamps(out).length;
  return out;
}

export function totals(save) {
  const sum = stats(save);
  return {
    ...sum,
    maxStars: MAX_STARS,
    routeCount: ROUTES.length,
    stampCount: STAMPS.length,
  };
}

/** Fold a finished route run into the save. Returns what changed. */
export function recordRun(save, result) {
  const previous = entryFor(save, result.routeId);
  const record = result.stars > 0 && (!previous.done || result.time < previous.best);
  const entry = {
    done: previous.done || result.stars > 0,
    stars: Math.max(previous.stars, result.stars),
    best: previous.best && result.stars > 0 ? Math.min(previous.best, result.time) : (result.stars > 0 ? result.time : previous.best),
    letters: Math.max(previous.letters, result.letters),
    rings: Math.max(previous.rings, result.rings),
    soft: previous.soft || result.soft,
    bullseye: previous.bullseye || result.bullseye,
    score: Math.max(previous.score, result.score),
  };
  if (entry.done) save.routes[result.routeId] = entry;
  const before = save.stamps.slice();
  countFlight(save, result);
  const fresh = refreshStamps(save);
  return { entry, record, newStamps: fresh, hadStamps: before };
}

/** Fold an Endless Breeze or Daily Breeze run into the save. */
export function recordEndless(save, result, { daily = null } = {}) {
  const previous = save.endless.best;
  const record = result.distance > previous;
  save.endless.best = Math.max(previous, result.distance);
  save.endless.bestScore = Math.max(save.endless.bestScore, result.score);
  save.endless.runs += 1;
  let dailyWin = false;
  let dailyRecord = false;
  if (daily) {
    if (save.daily.key !== daily.key) {
      save.daily = { ...save.daily, key: daily.key, best: 0, done: false };
    }
    dailyRecord = result.distance > save.daily.best;
    save.daily.best = Math.max(save.daily.best, result.distance);
    if (!save.daily.done && result.distance >= daily.goal) {
      save.daily.done = true;
      save.daily.wins += 1;
      dailyWin = true;
      // A streak counts consecutive days, so yesterday's win extends it.
      save.daily.streak = save.daily.lastDone === previousKey(daily.key) ? save.daily.streak + 1 : 1;
      save.daily.lastDone = daily.key;
    }
  }
  countFlight(save, result);
  const fresh = refreshStamps(save);
  return { record, dailyWin, dailyRecord, newStamps: fresh };
}

function countFlight(save, result) {
  const life = save.lifetime;
  life.flights += 1;
  life.letters += result.letters;
  life.rings += result.rings;
  life.snaps += result.snaps;
  life.thermals += result.thermals;
  if (result.soft) life.soft += 1;
  if (result.bullseye) life.bullseye += 1;
}

/** Add any stamps the latest numbers have earned; returns the new ones. */
export function refreshStamps(save) {
  const earned = earnedStamps(stats(save));
  const fresh = earned.filter((id) => !save.stamps.includes(id));
  if (fresh.length) save.stamps = earned;
  return fresh;
}

/** Keep the streak honest: a missed day resets it the next time you look. */
export function freshenDaily(save, key = dateKey()) {
  if (save.daily.lastDone && save.daily.lastDone !== key && save.daily.lastDone !== previousKey(key)) {
    save.daily.streak = 0;
  }
  if (save.daily.key !== key) {
    save.daily = { ...save.daily, key, best: 0, done: false };
  }
  return save;
}

export function regionOpen(save, region) {
  if (region <= 0) return true;
  return stats(save).stars >= REGIONS[region].needStars;
}

export function routeOpen(save, index) {
  const route = ROUTES[index];
  if (!regionOpen(save, route.region)) return false;
  if (index <= 0) return true;
  if (entryFor(save, route.id).done) return true;
  const previous = ROUTES[index - 1];
  // The first route of a region opens with the region itself.
  if (previous.region !== route.region) return true;
  return entryFor(save, previous.id).done;
}

/** Index of the route the title screen's big button should open. */
export function nextRouteIndex(save) {
  for (let i = 0; i < ROUTES.length; i += 1) {
    if (routeOpen(save, i) && !entryFor(save, ROUTES[i].id).done) return i;
  }
  for (let i = ROUTES.length - 1; i >= 0; i -= 1) if (routeOpen(save, i)) return i;
  return 0;
}

export function currentFold(save) {
  return foldById(save.fold);
}

export function currentPaper(save) {
  return paperById(save.paper);
}

/** `1:04.2`, the shape used on the results card and the route map. */
export function formatTime(seconds) {
  const whole = Math.max(0, seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole - mins * 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`;
}

export function formatDistance(metres) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${Math.round(metres)} m`;
}
