// Saves, settings, best results and unlocks. DOM-free: the page passes in
// a storage object (or null when the browser blocks it).
import { SONGS, DIFFICULTIES, STYLES } from './songs.js';
import { clampOffset } from './timing.js';
import { betterGrade, GRADE_RANK } from './score.js';

export const SAVE_KEY = 'groove-garden.v1';
export const STARTING_SONGS = 4;

export const DECORATIONS = [
  { id: 'gnome', name: 'Garden gnome', how: 'Finish any song' },
  { id: 'watering-can', name: 'Watering can', how: 'Try practice mode' },
  { id: 'wind-chimes', name: 'Wind chimes', how: 'Calibrate your timing' },
  { id: 'birdhouse', name: 'Birdhouse', how: 'Get an A' },
  { id: 'mushrooms', name: 'Mushroom ring', how: 'Finish a song on Normal' },
  { id: 'fairy-lights', name: 'Fairy lights', how: 'Get a full combo (no misses)' },
  { id: 'beehive', name: 'Beehive', how: 'Finish 5 songs' },
  { id: 'rainbow', name: 'Rainbow', how: 'Get an S' },
  { id: 'scarecrow', name: 'Dancing scarecrow', how: 'Finish a song on Hard' },
  { id: 'windmill', name: 'Windmill', how: 'Play every style of music' },
  { id: 'pond', name: 'Lily pond', how: 'Finish 10 songs' },
  { id: 'butterflies', name: 'Butterflies', how: 'Get A or better on 3 songs' },
];

// Every skin keeps the same shape per lane; only the art changes.
export const SKINS = [
  { id: 'petals', name: 'Petals', how: 'Ready to go' },
  { id: 'seeds', name: 'Seeds', how: 'Finish 3 songs' },
  { id: 'ladybugs', name: 'Ladybugs', how: 'Finish a song on Normal or Hard' },
  { id: 'fruit', name: 'Fruit', how: 'Get an A' },
  { id: 'stars', name: 'Stars', how: 'Get an S on Hard' },
];

const RULES = {
  gnome: (s) => s.stats.clears >= 1,
  'watering-can': (s) => s.stats.practice >= 1,
  'wind-chimes': (s) => s.calibrated,
  birdhouse: (s) => s.stats.aGrades >= 1,
  mushrooms: (s) => s.stats.normalClears >= 1,
  'fairy-lights': (s) => s.stats.fullCombos >= 1,
  beehive: (s) => s.stats.clears >= 5,
  rainbow: (s) => s.stats.sGrades >= 1,
  scarecrow: (s) => s.stats.hardClears >= 1,
  windmill: (s) => Object.keys(STYLES).every((st) => s.stats.styles.includes(st)),
  pond: (s) => s.stats.clears >= 10,
  butterflies: (s) => songsAtLeast(s, 'A') >= 3,
  petals: () => true,
  seeds: (s) => s.stats.clears >= 3,
  ladybugs: (s) => s.stats.normalClears + s.stats.hardClears >= 1,
  fruit: (s) => s.stats.aGrades >= 1,
  stars: (s) => s.stats.hardS >= 1,
};

function songsAtLeast(save, grade) {
  return Object.values(save.best).filter((byDiff) => Object.values(byDiff).some((b) => GRADE_RANK[b.grade] >= GRADE_RANK[grade])).length;
}

export function defaultSave() {
  return {
    v: 1,
    inputOffsetMs: 0,
    visualOffsetMs: 0,
    calibrated: false,
    lanes: 4,
    noFail: true,
    motion: 'auto', // auto | reduced | full
    speed: 3, // 1..5 note speed
    skin: 'petals',
    muted: false,
    songs: SONGS.slice(0, STARTING_SONGS).map((s) => s.id),
    decor: [],
    hiddenDecor: [],
    skins: ['petals'],
    best: {}, // songId -> difficulty -> { score, grade, accuracy, combo, fullCombo }
    stats: { plays: 0, clears: 0, practice: 0, fullCombos: 0, normalClears: 0, hardClears: 0, aGrades: 0, sGrades: 0, hardS: 0, styles: [] },
    last: { song: SONGS[0].id, difficulty: 'easy' },
  };
}

const num = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback);
const ids = (list, valid) => (Array.isArray(list) ? [...new Set(list.filter((x) => valid.includes(x)))] : []);
const SONG_IDS = SONGS.map((s) => s.id);

/** Read the save, repairing anything missing, corrupt or out of range. */
export function loadSave(storage) {
  const save = defaultSave();
  let data = null;
  try {
    const raw = storage?.getItem(SAVE_KEY);
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object') return save;
  save.inputOffsetMs = clampOffset(data.inputOffsetMs ?? 0);
  save.visualOffsetMs = clampOffset(data.visualOffsetMs ?? 0);
  save.calibrated = data.calibrated === true;
  save.lanes = data.lanes === 3 ? 3 : 4;
  save.noFail = data.noFail !== false;
  save.motion = ['auto', 'reduced', 'full'].includes(data.motion) ? data.motion : 'auto';
  save.speed = Math.round(num(data.speed, 1, 5, 3));
  save.muted = data.muted === true;
  save.songs = [...new Set([...save.songs, ...ids(data.songs, SONG_IDS)])];
  save.decor = ids(data.decor, DECORATIONS.map((d) => d.id));
  save.hiddenDecor = ids(data.hiddenDecor, save.decor);
  save.skins = [...new Set(['petals', ...ids(data.skins, SKINS.map((s) => s.id))])];
  save.skin = save.skins.includes(data.skin) ? data.skin : 'petals';
  if (data.best && typeof data.best === 'object') {
    for (const id of SONG_IDS) {
      const byDiff = data.best[id];
      if (!byDiff || typeof byDiff !== 'object') continue;
      for (const d of DIFFICULTIES) {
        const b = byDiff[d];
        if (!b || typeof b !== 'object' || !(b.grade in GRADE_RANK)) continue;
        (save.best[id] ||= {})[d] = {
          score: Math.round(num(b.score, 0, 1000000, 0)),
          grade: b.grade,
          accuracy: num(b.accuracy, 0, 1, 0),
          combo: Math.round(num(b.combo, 0, 100000, 0)),
          fullCombo: b.fullCombo === true,
        };
      }
    }
  }
  const st = data.stats && typeof data.stats === 'object' ? data.stats : {};
  for (const k of Object.keys(save.stats)) {
    if (k === 'styles') save.stats.styles = ids(st.styles, Object.keys(STYLES));
    else save.stats[k] = Math.round(num(st[k], 0, 1e6, 0));
  }
  if (data.last && SONG_IDS.includes(data.last.song)) save.last.song = data.last.song;
  if (data.last && DIFFICULTIES.includes(data.last.difficulty)) save.last.difficulty = data.last.difficulty;
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

/** Grant any decorations and skins whose rule is now met. Returns the new ones. */
export function checkUnlocks(save) {
  const fresh = [];
  for (const d of DECORATIONS) {
    if (!save.decor.includes(d.id) && RULES[d.id](save)) {
      save.decor.push(d.id);
      fresh.push({ type: 'decor', id: d.id, name: d.name });
    }
  }
  for (const s of SKINS) {
    if (!save.skins.includes(s.id) && RULES[s.id](save)) {
      save.skins.push(s.id);
      fresh.push({ type: 'skin', id: s.id, name: s.name });
    }
  }
  return fresh;
}

export function isSongUnlocked(save, id) {
  return save.songs.includes(id);
}

/**
 * Record a finished play. Finishing a song opens the next locked one (two
 * for an S); practice and wilted runs never change bests.
 * Returns { newBest, unlocks }.
 */
export function recordResult(save, { songId, difficulty, practice = false, results }) {
  const song = SONGS.find((s) => s.id === songId);
  const unlocks = [];
  let newBest = false;
  save.stats.plays++;
  if (practice) {
    save.stats.practice++;
  } else if (!results.failed) {
    save.stats.clears++;
    if (difficulty === 'normal') save.stats.normalClears++;
    if (difficulty === 'hard') save.stats.hardClears++;
    if (results.fullCombo) save.stats.fullCombos++;
    if (GRADE_RANK[results.grade] >= GRADE_RANK.A) save.stats.aGrades++;
    if (results.grade === 'S') save.stats.sGrades++;
    if (results.grade === 'S' && difficulty === 'hard') save.stats.hardS++;
    if (song && !save.stats.styles.includes(song.style)) save.stats.styles.push(song.style);
    const byDiff = (save.best[songId] ||= {});
    const prev = byDiff[difficulty];
    if (!prev || results.score > prev.score) newBest = true;
    byDiff[difficulty] = {
      score: Math.max(prev?.score ?? 0, results.score),
      grade: prev ? betterGrade(results.grade, prev.grade) : results.grade,
      accuracy: Math.max(prev?.accuracy ?? 0, results.accuracy),
      combo: Math.max(prev?.combo ?? 0, results.maxCombo),
      fullCombo: !!(prev?.fullCombo || results.fullCombo),
    };
    let opens = results.grade === 'S' ? 2 : 1;
    for (const s of SONGS) {
      if (opens <= 0) break;
      if (save.songs.includes(s.id)) continue;
      save.songs.push(s.id);
      unlocks.push({ type: 'song', id: s.id, name: s.title });
      opens--;
    }
  }
  unlocks.push(...checkUnlocks(save));
  return { newBest, unlocks };
}
