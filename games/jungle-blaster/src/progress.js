// Saves and the high-score table. Storage may be missing or throw (blocked
// site data), so every read and write is guarded; a null store means
// "nothing saved".

import { STAGES } from './levels.js';

export const SAVE_KEY = 'jungle-blaster.v1';
export const TABLE_SIZE = 8;

export const DEFAULT_TABLE = Object.freeze([
  { name: 'HRY', score: 60000, stage: 6, mode: 'arcade' },
  { name: 'ACT', score: 45000, stage: 5, mode: 'arcade' },
  { name: 'DAV', score: 32000, stage: 4, mode: 'adventure' },
  { name: 'KAT', score: 24000, stage: 3, mode: 'adventure' },
  { name: 'PIX', score: 16000, stage: 3, mode: 'arcade' },
  { name: 'ZAP', score: 10000, stage: 2, mode: 'adventure' },
  { name: 'GEN', score: 6000, stage: 1, mode: 'adventure' },
  { name: 'XYZ', score: 2600, stage: 1, mode: 'arcade' },
]);

export const DEFAULT_SETTINGS = Object.freeze({ crt: true, retro: false, shake: true, muted: false, music: true });

export function freshSave() {
  return {
    unlocked: 1,
    best: {},
    table: DEFAULT_TABLE.map((row) => ({ ...row })),
    settings: { ...DEFAULT_SETTINGS },
    beaten: false,
    lastInitials: 'AAA',
  };
}

const clampInt = (n, lo, hi, fallback) => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : fallback);

export function cleanInitials(text) {
  const letters = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return letters.padEnd(3, 'A');
}

export function loadSave(storage) {
  const save = freshSave();
  if (!storage) return save;
  let raw = null;
  try { raw = JSON.parse(storage.getItem(SAVE_KEY) || 'null'); } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return save;
  save.unlocked = clampInt(raw.unlocked, 1, STAGES.length, 1);
  save.beaten = !!raw.beaten;
  if (typeof raw.lastInitials === 'string') save.lastInitials = cleanInitials(raw.lastInitials);
  if (raw.best && typeof raw.best === 'object') {
    for (const stage of STAGES) {
      const entry = raw.best[stage.id];
      if (!entry || typeof entry !== 'object') continue;
      save.best[stage.id] = {
        treasures: clampInt(entry.treasures, 0, 99, 0),
        score: clampInt(entry.score, 0, 1e9, 0),
        time: Number.isFinite(entry.time) && entry.time > 0 ? entry.time : 0,
      };
    }
  }
  if (Array.isArray(raw.table)) {
    const rows = raw.table
      .filter((row) => row && typeof row === 'object' && Number.isFinite(row.score))
      .map((row) => ({
        name: cleanInitials(row.name),
        score: clampInt(row.score, 0, 1e9, 0),
        stage: clampInt(row.stage, 1, STAGES.length, 1),
        mode: row.mode === 'arcade' ? 'arcade' : 'adventure',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TABLE_SIZE);
    if (rows.length) save.table = rows;
  }
  if (raw.settings && typeof raw.settings === 'object') {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof raw.settings[key] === 'boolean') save.settings[key] = raw.settings[key];
    }
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

/** Record a cleared stage; returns true when it is a new best score for that stage. */
export function recordStage(save, stageIndex, { treasures, score, time }) {
  const id = STAGES[stageIndex].id;
  const prev = save.best[id] || { treasures: 0, score: 0, time: 0 };
  const better = score > prev.score;
  save.best[id] = {
    treasures: Math.max(prev.treasures, treasures),
    score: Math.max(prev.score, score),
    time: prev.time ? Math.min(prev.time, time) : time,
  };
  save.unlocked = Math.max(save.unlocked, Math.min(STAGES.length, stageIndex + 2));
  if (stageIndex === STAGES.length - 1) save.beaten = true;
  return better;
}

/** Where a score would land in the table (0-based), or -1 if it doesn't make it. */
export function tableRank(save, score) {
  if (score <= 0) return -1;
  const rank = save.table.findIndex((row) => score > row.score);
  if (rank >= 0) return rank;
  return save.table.length < TABLE_SIZE ? save.table.length : -1;
}

export function addHighScore(save, { name, score, stage, mode }) {
  const rank = tableRank(save, score);
  if (rank < 0) return -1;
  const row = { name: cleanInitials(name), score: Math.floor(score), stage, mode: mode === 'arcade' ? 'arcade' : 'adventure' };
  save.table.splice(rank, 0, row);
  save.table.length = Math.min(save.table.length, TABLE_SIZE);
  save.lastInitials = row.name;
  return rank;
}

export function treasureTotals(save, totals) {
  let found = 0;
  let all = 0;
  STAGES.forEach((stage, i) => {
    found += save.best[stage.id]?.treasures || 0;
    all += totals[i] || 0;
  });
  return { found, all };
}
