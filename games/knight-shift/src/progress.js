// Save data under one namespaced localStorage key: settings, the game in
// progress, puzzle stars and results per bot.
import { PUZZLES } from './puzzles.js';
import { BOTS } from './bots.js';

export const SAVE_KEY = 'knight-shift.v1';
export const THEMES = ['wood', 'candy', 'space'];

export function defaultSave() {
  const stats = {};
  for (const b of BOTS) stats[b.id] = { w: 0, l: 0, d: 0 };
  return {
    settings: { theme: 'wood', sound: true, showMoves: true, coach: true, hints: true },
    current: null,
    puzzles: {},
    stats,
    friendGames: 0,
    lastSetup: { mode: 'classic', opponent: 0, color: 'w' },
  };
}

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const count = (v) => (Number.isInteger(v) && v >= 0 ? Math.min(v, 1e6) : 0);

export function loadSave(storage) {
  const save = defaultSave();
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return save;
    const s = raw.settings || {};
    if (THEMES.includes(s.theme)) save.settings.theme = s.theme;
    for (const k of ['sound', 'showMoves', 'coach', 'hints']) save.settings[k] = bool(s[k], save.settings[k]);
    if (raw.puzzles && typeof raw.puzzles === 'object') {
      for (const p of PUZZLES) { const v = raw.puzzles[p.id]; if ([1, 2, 3].includes(v)) save.puzzles[p.id] = v; }
    }
    if (raw.stats && typeof raw.stats === 'object') {
      for (const b of BOTS) {
        const r = raw.stats[b.id];
        if (r && typeof r === 'object') save.stats[b.id] = { w: count(r.w), l: count(r.l), d: count(r.d) };
      }
    }
    save.friendGames = count(raw.friendGames);
    if (raw.current && typeof raw.current === 'object' && raw.current.setup && Array.isArray(raw.current.moves)) save.current = raw.current;
    if (raw.lastSetup && typeof raw.lastSetup === 'object') {
      const l = raw.lastSetup;
      if (['classic', 'fog', 'powers', '960'].includes(l.mode)) save.lastSetup.mode = l.mode;
      if (l.opponent === 'friend' || (Number.isInteger(l.opponent) && l.opponent >= 0 && l.opponent < BOTS.length)) save.lastSetup.opponent = l.opponent;
      if (['w', 'b', 'r'].includes(l.color)) save.lastSetup.color = l.color;
    }
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
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

// outcome: 'w' | 'l' | 'd' from the player's side.
export function recordResult(save, botId, outcome) {
  const r = save.stats[botId];
  if (!r || !['w', 'l', 'd'].includes(outcome)) return false;
  r[outcome]++;
  return outcome === 'w' && r.w === 1; // first win against this bot
}

export function recordPuzzle(save, id, stars) {
  const prev = save.puzzles[id] || 0;
  if (stars > prev) save.puzzles[id] = stars;
  return { first: !prev, better: stars > prev };
}

// The first unsolved puzzle and everything before it are open.
export function puzzleUnlocked(save, index) {
  for (let i = 0; i < index; i++) if (!save.puzzles[PUZZLES[i].id]) return false;
  return index >= 0 && index < PUZZLES.length;
}

export function nextPuzzle(save) {
  const i = PUZZLES.findIndex((p) => !save.puzzles[p.id]);
  return i < 0 ? 0 : i;
}

export const puzzleStarsTotal = (save) => Object.values(save.puzzles).reduce((a, b) => a + b, 0);
export const botsBeaten = (save) => BOTS.filter((b) => save.stats[b.id].w > 0).length;
