// Save data: coins, tackle, the collection book, quests and the clock.
import { FISH_BY_ID } from './data.js';
import { SLOTS } from './gear.js';

export const SAVE_KEY = 'reel-rumble.v1';

export function defaultSave() {
  return {
    coins: 0,
    owned: { rod: ['twig'], reel: ['clicker'], line: ['cotton'], bait: ['worm'], boat: [] },
    equip: { rod: 'twig', reel: 'clicker', line: 'cotton', bait: 'worm' },
    book: {}, // id -> { n, cm, kg }
    seen: [],
    quests: [], // finished quest ids
    medals: {}, // tournament id -> 'gold' | 'silver' | 'bronze'
    clock: { day: 1, hour: 7 },
    water: 'pond',
    stats: { casts: 0, caught: 0, lost: 0, coinsEarned: 0 },
    muted: false,
    music: true,
    intro: false,
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d, lo = -Infinity, hi = Infinity) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

// Merge stored data over the defaults, dropping anything unknown or broken.
export function sanitize(raw) {
  const s = defaultSave();
  if (!isObj(raw)) return s;
  s.coins = Math.floor(num(raw.coins, 0, 0, 1e7));
  if (isObj(raw.owned)) {
    for (const slot of Object.keys(SLOTS)) {
      const ids = Array.isArray(raw.owned[slot]) ? raw.owned[slot] : [];
      const valid = ids.filter((id) => SLOTS[slot].some((it) => it.id === id));
      s.owned[slot] = [...new Set([...s.owned[slot], ...valid])];
    }
  }
  if (isObj(raw.equip)) {
    for (const slot of ['rod', 'reel', 'line', 'bait']) {
      if (s.owned[slot].includes(raw.equip[slot])) s.equip[slot] = raw.equip[slot];
    }
  }
  if (isObj(raw.book)) {
    for (const [id, e] of Object.entries(raw.book)) {
      if (!FISH_BY_ID[id] || !isObj(e)) continue;
      s.book[id] = { n: Math.floor(num(e.n, 0, 0, 1e6)), cm: num(e.cm, 0, 0, 1000), kg: num(e.kg, 0, 0, 1000) };
    }
  }
  if (Array.isArray(raw.seen)) s.seen = [...new Set(raw.seen.filter((id) => FISH_BY_ID[id]))];
  if (Array.isArray(raw.quests)) s.quests = [...new Set(raw.quests.filter((q) => typeof q === 'string'))];
  if (isObj(raw.medals)) {
    for (const [k, v] of Object.entries(raw.medals)) if (['gold', 'silver', 'bronze'].includes(v)) s.medals[k] = v;
  }
  if (isObj(raw.clock)) s.clock = { day: Math.floor(num(raw.clock.day, 1, 1, 1e6)), hour: num(raw.clock.hour, 7, 0, 23.99) };
  if (typeof raw.water === 'string') s.water = raw.water;
  if (isObj(raw.stats)) for (const k of Object.keys(s.stats)) s.stats[k] = Math.floor(num(raw.stats[k], 0, 0, 1e9));
  s.muted = raw.muted === true;
  s.music = raw.music !== false;
  s.intro = raw.intro === true;
  return s;
}

export function loadSave(storage) {
  try {
    const text = storage?.getItem(SAVE_KEY);
    return sanitize(text ? JSON.parse(text) : null);
  } catch {
    return defaultSave();
  }
}

export function writeSave(storage, save) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
    return !!storage;
  } catch {
    return false;
  }
}

export function markSeen(save, id) {
  if (!save.seen.includes(id)) { save.seen.push(id); return true; }
  return false;
}

// Record a landed fish. Returns what was new about it.
export function recordCatch(save, result) {
  const id = result.fish.id;
  const prev = save.book[id];
  const newSpecies = !prev || prev.n === 0;
  const newRecord = !newSpecies && result.kg > prev.kg;
  save.book[id] = {
    n: (prev?.n || 0) + 1,
    cm: Math.max(prev?.cm || 0, result.cm),
    kg: Math.max(prev?.kg || 0, result.kg),
  };
  markSeen(save, id);
  save.coins += result.coins;
  save.stats.caught++;
  save.stats.coinsEarned += result.coins;
  return { newSpecies, newRecord };
}
