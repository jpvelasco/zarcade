// The save file: stars, personal bests, unlocks, bestiary, daily streak,
// key stats and run history. DOM-free; the page passes in localStorage.
import { STAGES, LESSONS, STAGES_PER_REGION, REGIONS, BESTIARY } from './stages.js';
import { pushHistory } from './stats.js';
import { daysBetween } from './rng.js';

export const STORAGE_KEY = 'keyboard-knights.v1';

// ------------------------------------------------------------ wardrobe

export const ITEMS = {
  armour: [
    { id: 'tin', name: 'Tin Suit', hint: 'Every knight starts here', need: () => true },
    { id: 'leaf', name: 'Leafy Green', hint: 'Earn 6 stars', need: (s) => totalStars(s) >= 6 },
    { id: 'sky', name: 'Sky Blue', hint: 'Earn 18 stars', need: (s) => totalStars(s) >= 18 },
    { id: 'ruby', name: 'Ruby Red', hint: 'Earn 36 stars', need: (s) => totalStars(s) >= 36 },
    { id: 'gold', name: 'Shiny Gold', hint: 'Earn 60 stars', need: (s) => totalStars(s) >= 60 },
    { id: 'star', name: 'Starlight', hint: 'Earn 90 stars', need: (s) => totalStars(s) >= 90 },
  ],
  sword: [
    { id: 'wood', name: 'Wooden Sword', hint: 'A trusty start', need: () => true },
    { id: 'iron', name: 'Iron Sword', hint: 'Beat King Slime', need: (s) => !!s.stars['meadow-boss'] },
    { id: 'carrot', name: 'Carrot Sword', hint: 'Beat Mayor Morel', need: (s) => !!s.stars['woods-boss'] },
    { id: 'feather', name: 'Feather Blade', hint: 'Beat Captain Honk', need: (s) => !!s.stars['farm-boss'] },
    { id: 'lolly', name: 'Lollipop Sword', hint: 'Finish 6 lessons', need: (s) => lessonsDone(s) >= 6 },
    { id: 'rainbow', name: 'Rainbow Blade', hint: 'Beat Baron Fluff', need: (s) => !!s.stars['castle-boss'] },
  ],
  pet: [
    { id: 'none', name: 'No pet', hint: 'Adventure solo', need: () => true },
    { id: 'puppy', name: 'Biscuit the Puppy', hint: 'Finish a daily quest', need: (s) => s.daily.clears >= 1 },
    { id: 'kitten', name: 'Mittens the Kitten', hint: 'Finish 3 daily quests', need: (s) => s.daily.clears >= 3 },
    { id: 'duck', name: 'Quackers', hint: 'Reach a 15 combo', need: (s) => s.bestCombo >= 15 },
    { id: 'owl', name: 'Professor Hoot', hint: 'Meet 10 monsters', need: (s) => bestiarySeen(s) >= 10 },
    { id: 'dragon', name: 'Ember the Baby Dragon', hint: 'Read Grumble a story', need: (s) => !!s.stars['library-boss'] },
  ],
};

export const SLOTS = ['armour', 'sword', 'pet'];

export function isOwned(save, slot, id) {
  return save.owned.includes(`${slot}:${id}`);
}

// Grant everything the save now qualifies for; returns the new items.
export function checkUnlocks(save) {
  const fresh = [];
  for (const slot of SLOTS) {
    for (const item of ITEMS[slot]) {
      const key = `${slot}:${item.id}`;
      if (!save.owned.includes(key) && item.need(save)) {
        save.owned.push(key);
        fresh.push({ slot, ...item });
      }
    }
  }
  return fresh;
}

export function equip(save, slot, id) {
  if (!isOwned(save, slot, id)) return false;
  save.equipped[slot] = id;
  return true;
}

// ------------------------------------------------------------ save file

export function defaultSave() {
  return {
    v: 1,
    who: null, // chosen start: 0 little .. 3 grown-up (null = not asked yet)
    stars: {}, // stage or lesson id -> best stars
    best: {}, // stage id -> best score
    bestWpm: 0,
    bestCombo: 0,
    words: 0,
    keyStats: {},
    history: [],
    bestiary: {}, // monster id -> times poofed
    owned: ['armour:tin', 'sword:wood', 'pet:none'],
    equipped: { armour: 'tin', sword: 'wood', pet: 'none' },
    daily: { last: null, streak: 0, best: 0, clears: 0, todayStars: 0 },
    settings: { sound: true, music: true, relaxed: false, keyboard: 'auto', forgiving: false },
  };
}

export function loadSave(storage) {
  const base = defaultSave();
  try {
    const raw = storage && storage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return base;
    return {
      ...base, ...data,
      equipped: { ...base.equipped, ...(data.equipped || {}) },
      daily: { ...base.daily, ...(data.daily || {}) },
      settings: { ...base.settings, ...(data.settings || {}) },
      owned: Array.isArray(data.owned) ? data.owned : base.owned,
      history: Array.isArray(data.history) ? data.history : [],
    };
  } catch {
    return base;
  }
}

export function writeSave(storage, save) {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ progress

export function totalStars(save) {
  return Object.values(save.stars).reduce((n, s) => n + s, 0);
}

export const MAX_STARS = (STAGES.length + LESSONS.length) * 3;

export function lessonsDone(save) {
  return LESSONS.filter((l) => save.stars[l.id]).length;
}

export function bestiarySeen(save) {
  return BESTIARY.filter((b) => save.bestiary[b.id]).length;
}

// Regions open from the "Who's playing?" choice (0-3) or by beating bosses.
export function regionsOpen(save) {
  let open = 1 + Math.max(0, save.who ?? 0);
  REGIONS.forEach((r, i) => { if (save.stars[`${r.id}-boss`]) open = Math.max(open, i + 2); });
  return Math.min(REGIONS.length, open);
}

export function isStageUnlocked(save, index) {
  const st = STAGES[index];
  if (!st || st.region >= regionsOpen(save)) return false;
  if (st.index === 0) return true;
  return !!save.stars[STAGES[index - 1].id];
}

// The stage the Play button continues from: the first unlocked one without stars.
export function nextStageIndex(save) {
  let last = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (!isStageUnlocked(save, i)) continue;
    last = i;
    if (!save.stars[STAGES[i].id]) return i;
  }
  return last;
}

// Highest tier the player has open (used by the daily quest).
export function currentTier(save) {
  return regionsOpen(save) - 1;
}

// Lessons are practice, so they are all open from the start.
export function isLessonUnlocked(save, index) {
  return index >= 0 && index < LESSONS.length;
}

// Record a finished run. Returns what is new, for the results screen.
export function recordRun(save, stage, result, dateKey) {
  const id = stage.id;
  const d = save.daily;
  const prevStars = stage.daily ? (d.last === dateKey ? d.todayStars || 0 : 0) : save.stars[id] || 0;
  const out = { newStars: Math.max(0, result.stars - prevStars), newBestWpm: false, newBestScore: false, firstClear: !prevStars };
  if (stage.daily) d.todayStars = Math.max(prevStars, result.stars);
  else save.stars[id] = Math.max(prevStars, result.stars);
  if (!stage.daily && result.score > (save.best[id] || 0)) {
    out.newBestScore = !!save.best[id];
    save.best[id] = result.score;
  }
  // Only runs with enough typing count for the WPM record.
  if (result.correct >= 20 && result.wpm > save.bestWpm) {
    out.newBestWpm = save.bestWpm > 0;
    out.prevBestWpm = save.bestWpm;
    save.bestWpm = result.wpm;
  }
  save.bestCombo = Math.max(save.bestCombo, result.maxCombo || 0);
  save.words += result.words || 0;
  if (result.correct >= 10) pushHistory(save.history, { d: dateKey, wpm: result.wpm, acc: result.acc, stage: id });
  if (stage.daily) Object.assign(out, recordDaily(save, dateKey));
  out.unlocked = checkUnlocks(save);
  return out;
}

// A finished daily quest: one per day counts, and days in a row build a streak.
export function recordDaily(save, dateKey) {
  const d = save.daily;
  if (d.last === dateKey) return { dailyRepeat: true, streak: d.streak };
  const gap = d.last ? daysBetween(d.last, dateKey) : null;
  d.streak = gap === 1 ? d.streak + 1 : 1;
  d.best = Math.max(d.best, d.streak);
  d.last = dateKey;
  d.clears += 1;
  return { dailyRepeat: false, streak: d.streak };
}

// The streak still showing today: kept if the last quest was today or yesterday.
export function liveStreak(save, dateKey) {
  const d = save.daily;
  if (!d.last) return 0;
  const gap = daysBetween(d.last, dateKey);
  return gap <= 1 ? d.streak : 0;
}

export function dailyDoneToday(save, dateKey) {
  return save.daily.last === dateKey;
}

export function recordPoof(save, monster) {
  const first = !save.bestiary[monster];
  save.bestiary[monster] = (save.bestiary[monster] || 0) + 1;
  return first;
}

export function regionStars(save, r) {
  return STAGES.filter((s) => s.region === r).reduce((n, s) => n + (save.stars[s.id] || 0), 0);
}

export { STAGES_PER_REGION };
