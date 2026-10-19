// Settings, looks, stats, stars and trophies under one namespaced key.
// DOM-free: the page passes in `localStorage` (or null when blocked).
import { cleanSettings, defaultSettings } from './match.js';
import { ARENA_IDS } from './arenas.js';

export const SAVE_KEY = 'bumper-blobs.v1';

export const COLORS = [
  { name: 'Strawberry', body: '#ff5a7e', dark: '#c22a54', light: '#ffb3c4' },
  { name: 'Blueberry', body: '#4aa3ff', dark: '#1f63c2', light: '#b4daff' },
  { name: 'Lime', body: '#7fdc45', dark: '#3f9a1e', light: '#cdf5ad' },
  { name: 'Mango', body: '#ffad2e', dark: '#c46d00', light: '#ffdc9c' },
  { name: 'Grape', body: '#a874ff', dark: '#6a3ccc', light: '#dccaff' },
  { name: 'Mint', body: '#3fdcc0', dark: '#16957f', light: '#b6f5ea' },
  { name: 'Bubblegum', body: '#ff7ad6', dark: '#c23e9d', light: '#ffc6ef' },
  { name: 'Lemon', body: '#ffe14d', dark: '#c2a312', light: '#fff4b0' },
];

export const FACES = ['Happy', 'Grumpy', 'Derp', 'Cool', 'Sleepy', 'Wow', 'Cyclops', 'Kitty'];

// Hats unlock with stars. The first two are free.
export const HATS = [
  { name: 'No hat', stars: 0 },
  { name: 'Party hat', stars: 0 },
  { name: 'Bow', stars: 3 },
  { name: 'Propeller', stars: 6 },
  { name: 'Top hat', stars: 10 },
  { name: 'Chef', stars: 15 },
  { name: 'Flower', stars: 20 },
  { name: 'Viking', stars: 28 },
  { name: 'Wizard', stars: 36 },
  { name: 'Halo', stars: 45 },
  { name: 'Crown', stars: 60 },
];

// Trophies: each is worth 5 stars, once.
export const TROPHIES = [
  { id: 'firstMatch', name: 'Jelly Debut', text: 'Finish a match', test: (s) => s.matches >= 1 },
  { id: 'firstWin', name: 'Wobble Winner', text: 'Win a match', test: (s) => s.wins >= 1 },
  { id: 'bonk50', name: 'Bonk Boss', text: 'Bonk 50 blobs', test: (s) => s.bonks >= 50 },
  { id: 'ringout25', name: 'Edge Lord', text: 'Knock 25 blobs off', test: (s) => s.ringouts >= 25 },
  { id: 'pound25', name: 'Belly Flop', text: 'Ground-pound 25 times', test: (s) => s.pounds >= 25 },
  { id: 'coins100', name: 'Piggy Bank', text: 'Grab 100 coins', test: (s) => s.coins >= 100 },
  { id: 'allModes', name: 'Triple Threat', text: 'Play all three modes', test: (s) => s.modes.length >= 3 },
  { id: 'hardWin', name: 'Bot Buster', text: 'Win against Hard bots', test: (s) => s.hardWins >= 1 },
  { id: 'tourist', name: 'Arena Tourist', text: 'Win a round on 5 arenas', test: (s) => s.arenasWon.length >= 5 },
  { id: 'everywhere', name: 'World Champ', text: 'Win a round on every arena', test: (s) => s.arenasWon.length >= ARENA_IDS.length },
];

const freshStats = () => ({ matches: 0, wins: 0, rounds: 0, roundWins: 0, bonks: 0, ringouts: 0, pounds: 0, coins: 0, falls: 0, hardWins: 0, modes: [], arenasWon: [] });

export function defaultLooks() {
  return [0, 1, 2, 3].map((i) => ({ color: [0, 1, 2, 3][i], face: i % FACES.length, hat: i === 0 ? 1 : 0 }));
}

export function defaultSave() {
  return { muted: false, music: true, settings: defaultSettings(), looks: defaultLooks(), stats: freshStats(), stars: 0, trophies: [] };
}

const int = (v, max) => { const n = v | 0; return n >= 0 && n < max ? n : 0; };

export function loadSave(storage) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return defaultSave();
    const save = defaultSave();
    save.muted = data.muted === true;
    save.music = data.music !== false;
    save.settings = cleanSettings(data.settings);
    if (Array.isArray(data.looks)) {
      save.looks = save.looks.map((d, i) => {
        const l = data.looks[i] || {};
        return { color: int(l.color, COLORS.length), face: int(l.face, FACES.length), hat: int(l.hat, HATS.length) };
      });
    }
    const st = data.stats && typeof data.stats === 'object' ? data.stats : {};
    for (const k of Object.keys(save.stats)) {
      if (Array.isArray(save.stats[k])) save.stats[k] = Array.isArray(st[k]) ? st[k].filter((x) => typeof x === 'string').slice(0, 20) : [];
      else save.stats[k] = Math.max(0, Number(st[k]) | 0);
    }
    save.stars = Math.max(0, data.stars | 0);
    save.trophies = Array.isArray(data.trophies) ? data.trophies.filter((t) => TROPHIES.some((x) => x.id === t)) : [];
    return save;
  } catch {
    return defaultSave();
  }
}

// Takes another tab's newer save into this tab's save object in place, so a
// stale copy here is never written back over it.
export function adoptSave(save, fresh) {
  for (const key of Object.keys(save)) delete save[key];
  return Object.assign(save, fresh);
}

export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export const hatUnlocked = (save, hat) => (HATS[hat]?.stars ?? Infinity) <= save.stars;
export const nextHat = (save) => HATS.find((h) => h.stars > save.stars) || null;

// Record a finished match for the human players.
// match: a finished Match; humans: indices of human players.
// Returns { stars, newTrophies, newHats } for the results screen.
export function recordMatch(save, match, humans) {
  const st = save.stats;
  const before = save.stars;
  const hatsBefore = HATS.filter((h) => h.stars <= before).length;
  let stars = 0;
  if (humans.length) {
    st.matches++;
    if (!st.modes.includes(match.mode)) st.modes.push(match.mode);
    stars += 1;
    for (const i of humans) {
      const t = match.totals[i];
      st.bonks += t.bonks; st.ringouts += t.ringouts; st.pounds += t.pounds; st.coins += t.coins; st.falls += t.falls;
    }
    st.rounds += match.history.length;
    for (const h of match.history) {
      if (!humans.includes(h.winner)) continue;
      st.roundWins++;
      stars += match.mode === 'lbs' ? 1 : 0;
      if (!st.arenasWon.includes(h.arena)) st.arenasWon.push(h.arena);
    }
    if (humans.includes(match.winner)) {
      st.wins++;
      stars += 3;
      const bots = match.players.filter((p) => p.bot);
      if (bots.length && bots.every((p) => p.bot === 'hard')) st.hardWins++;
    }
  }
  const newTrophies = [];
  for (const t of TROPHIES) {
    if (save.trophies.includes(t.id) || !t.test(st)) continue;
    save.trophies.push(t.id);
    newTrophies.push(t);
    stars += 5;
  }
  save.stars += stars;
  const newHats = HATS.filter((h) => h.stars > before && h.stars <= save.stars);
  return { stars, newTrophies, newHats, hatsUnlocked: hatsBefore + newHats.length };
}
