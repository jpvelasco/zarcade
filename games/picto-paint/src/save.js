// Progress under `picto-paint.v1`. DOM-free: callers pass the storage.
export const SAVE_KEY = 'picto-paint.v1';

export function defaultSave() {
  return {
    v: 1,
    puzzles: {}, // id -> { solved, stars, best }
    progress: {}, // id -> { cells, time, hints }
    lastPlayed: null,
    settings: { mode: 'helper', sound: true, music: true, palette: 'paper', pencil: 'graphite' },
    daily: { last: null, streak: 0, best: 0, done: {} },
    critters: [], // date keys of solved daily critters, newest first
    seenTutorial: false,
    seenColour: false,
  };
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

export function loadSave(storage) {
  const base = defaultSave();
  if (!storage) return base;
  let raw = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return base;
  }
  if (!raw) return base;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!obj(data)) return base;
  const out = base;
  for (const [id, r] of Object.entries(obj(data.puzzles) || {})) {
    if (!obj(r)) continue;
    out.puzzles[id] = {
      solved: !!r.solved,
      stars: Math.max(0, Math.min(3, Number(r.stars) || 0)),
      best: Number.isFinite(r.best) ? r.best : null,
    };
  }
  for (const [id, r] of Object.entries(obj(data.progress) || {})) {
    if (obj(r) && typeof r.cells === 'string') {
      out.progress[id] = { cells: r.cells, time: Number(r.time) || 0, hints: Number(r.hints) || 0 };
    }
  }
  if (typeof data.lastPlayed === 'string') out.lastPlayed = data.lastPlayed;
  const s = obj(data.settings) || {};
  if (s.mode === 'helper' || s.mode === 'expert') out.settings.mode = s.mode;
  if (typeof s.sound === 'boolean') out.settings.sound = s.sound;
  if (typeof s.music === 'boolean') out.settings.music = s.music;
  if (typeof s.palette === 'string') out.settings.palette = s.palette;
  if (typeof s.pencil === 'string') out.settings.pencil = s.pencil;
  const d = obj(data.daily);
  if (d) {
    out.daily = {
      last: typeof d.last === 'string' ? d.last : null,
      streak: Number(d.streak) || 0,
      best: Number(d.best) || 0,
      done: obj(d.done) ? { ...d.done } : {},
    };
  }
  if (Array.isArray(data.critters)) out.critters = data.critters.filter((k) => typeof k === 'string').slice(0, 400);
  out.seenTutorial = !!data.seenTutorial;
  out.seenColour = !!data.seenColour;
  return out;
}

export function writeSave(storage, save) {
  if (!storage) return false;
  try {
    // Keep only a handful of in-progress boards.
    const ids = Object.keys(save.progress);
    if (ids.length > 12) for (const id of ids.slice(0, ids.length - 12)) delete save.progress[id];
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
