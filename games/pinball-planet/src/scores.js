// Saves and the high-score table, under one namespaced localStorage key.
export const SAVE_KEY = 'pinball-planet.v1';
export const TABLE_SIZE = 5;

export const DEFAULT_SCORES = [
  { name: 'NOVA', score: 8000000 },
  { name: 'ZAP', score: 5000000 },
  { name: 'MOON', score: 3000000 },
  { name: 'PIP', score: 1500000 },
  { name: 'BOB', score: 750000 },
].map((s) => ({ ...s, name: s.name.slice(0, 3) }));

export function defaultSave() {
  return { scores: DEFAULT_SCORES.map((s) => ({ ...s })), muted: false, music: true, games: 0, last: 0, initials: 'AAA' };
}

// Initials: up to three letters A-Z (or digits), upper case.
export function cleanName(name) {
  const s = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return s || 'AAA';
}

export function loadSave(storage) {
  const save = defaultSave();
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return save;
    if (Array.isArray(raw.scores)) {
      const list = raw.scores
        .filter((s) => s && Number.isFinite(s.score) && s.score >= 0)
        .map((s) => ({ name: cleanName(s.name), score: Math.floor(s.score) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, TABLE_SIZE);
      if (list.length) save.scores = list;
    }
    save.muted = raw.muted === true;
    save.music = raw.music !== false;
    if (Number.isInteger(raw.games) && raw.games >= 0) save.games = raw.games;
    if (Number.isFinite(raw.last) && raw.last >= 0) save.last = Math.floor(raw.last);
    if (typeof raw.initials === 'string') save.initials = cleanName(raw.initials);
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  return save;
}

// False when storage is full, blocked or in private mode.
export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function qualifies(save, score) {
  if (score <= 0) return false;
  return save.scores.length < TABLE_SIZE || score > save.scores[save.scores.length - 1].score;
}

// Insert a score; returns its 0-based rank, or -1 if it didn't make the table.
export function addScore(save, name, score) {
  if (!qualifies(save, score)) return -1;
  const entry = { name: cleanName(name), score: Math.floor(score) };
  save.scores.push(entry);
  save.scores.sort((a, b) => b.score - a.score);
  save.scores.length = Math.min(save.scores.length, TABLE_SIZE);
  save.initials = entry.name;
  return save.scores.indexOf(entry);
}

export const best = (save) => (save.scores[0] ? save.scores[0].score : 0);
