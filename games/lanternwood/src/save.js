// Save files: three slots in one localStorage entry, `lanternwood.v1`.
// Progress is written at statues, on every big moment (items, keys, bosses,
// quests) and when changing area; loading resumes at the last checkpoint with
// everything you collected.
import { newQuestState } from './quests.js';

export const SAVE_KEY = 'lanternwood.v1';
export const SLOTS = 3;
export const START_HEARTS = 3;
export const MAX_HEARTS = 12;

export function newGame(name = 'Wren') {
  return {
    version: 1,
    name,
    created: 0,
    playTime: 0,
    area: 'overworld',
    respawn: null,          // { area, x, y } in tiles; null = area start
    maxHearts: START_HEARTS,
    hearts: START_HEARTS * 2,
    berries: 0,
    pouch: false,
    tea: 0,
    items: { sword: true, lantern: true, boomerang: false, grapple: false, dash: false },
    equipped: 'lantern',
    keys: {},
    bigKeys: {},
    shards: [],
    flags: [],
    quests: newQuestState(),
    discovered: {},
    time: 0.3,             // day clock, 0..1 (0.25 = morning, 0.75 = dusk)
    stats: { defeated: 0, chests: 0, fish: 0, deaths: 0 },
    ended: false,
  };
}

export const berryCap = (save) => (save.pouch ? 300 : 99);

/** Fill in anything missing from an older or damaged save. */
export function normalize(raw) {
  const base = newGame();
  if (!raw || typeof raw !== 'object') return null;
  const s = { ...base, ...raw };
  s.items = { ...base.items, ...(raw.items || {}) };
  s.quests = { ...base.quests };
  for (const [id, q] of Object.entries(raw.quests || {})) {
    if (s.quests[id] && q && typeof q.stage === 'number') s.quests[id] = { stage: q.stage, count: q.count | 0 };
  }
  s.flags = Array.isArray(raw.flags) ? raw.flags.filter((f) => typeof f === 'string') : [];
  s.shards = Array.isArray(raw.shards) ? raw.shards : [];
  s.keys = { ...(raw.keys || {}) };
  s.bigKeys = { ...(raw.bigKeys || {}) };
  s.discovered = { ...(raw.discovered || {}) };
  s.stats = { ...base.stats, ...(raw.stats || {}) };
  s.maxHearts = Math.max(START_HEARTS, Math.min(MAX_HEARTS, s.maxHearts | 0));
  s.hearts = Math.max(1, Math.min(s.maxHearts * 2, s.hearts | 0));
  if (!s.items[s.equipped]) s.equipped = 'lantern';
  return s;
}

/** Read all slots. A missing, blocked or broken store gives empty slots. */
export function loadAll(storage) {
  const empty = { slots: new Array(SLOTS).fill(null), last: 0, muted: false, music: true };
  if (!storage) return empty;
  let raw = null;
  try { raw = JSON.parse(storage.getItem(SAVE_KEY) || 'null'); } catch { raw = null; }
  if (!raw || !Array.isArray(raw.slots)) return empty;
  return {
    slots: Array.from({ length: SLOTS }, (_, i) => normalize(raw.slots[i])),
    last: Math.max(0, Math.min(SLOTS - 1, raw.last | 0)),
    muted: !!raw.muted,
    music: raw.music !== false,
  };
}

export function writeAll(storage, all) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** Short summary for the slot picker. */
export function slotSummary(save) {
  if (!save) return null;
  const mins = Math.floor((save.playTime || 0) / 60);
  return {
    hearts: save.maxHearts,
    shards: save.shards.length,
    berries: save.berries,
    time: mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`,
    ended: !!save.ended,
  };
}
