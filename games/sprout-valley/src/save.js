// Saving and loading a farm. The world is written as plain JSON under one
// namespaced localStorage key; settings live alongside it.
import { World, BELT_SIZE } from './world.js';
import { W, H } from './map.js';
import { ITEMS, CROPS, VILLAGER_IDS, ANIMALS, DECOR, TOOLS, FESTIVAL_IDS, GOALS } from './data.js';
import { SPEEDS } from './time.js';

export const SAVE_KEY = 'sprout-valley.v1';
export const VERSION = 1;

export function serialize(w) {
  const tiles = [];
  for (let i = 0; i < W * H; i++) {
    const c = w.crop[i], o = w.obj[i];
    if (!w.soil[i] && !c && !o && !w.tuft[i]) continue;
    const t = [i, w.soil[i], w.wet[i], w.tuft[i]];
    t.push(c ? [c.id, c.age, c.harvests, c.dead ? 1 : 0] : 0);
    t.push(o ? (o.type === 'decor' ? o.id : o.type) : 0);
    tiles.push(t);
  }
  return {
    v: VERSION, seed: w.seed, day: w.day, money: w.money, earned: w.earned, speed: w.speed,
    inv: { ...w.inv }, belt: w.belt.slice(), sel: w.sel, canLevel: w.canLevel, upgrades: { ...w.upgrades },
    tiles, trough: w.trough,
    animals: w.animals.map((a) => ({ type: a.type, name: a.name, points: a.points, ate: a.ate, x: +a.x.toFixed(2), y: +a.y.toFixed(2) })),
    pickups: w.pickups.filter((p) => !p.festival).map((p) => [p.x, p.y, p.item, p.n]),
    villagers: Object.fromEntries(VILLAGER_IDS.map((id) => { const s = w.villagers[id]; return [id, { points: s.points, met: s.met, known: s.known }]; })),
    requests: w.requests.map((r) => ({ ...r })),
    festivalsWon: { ...w.festivalsWon }, collection: JSON.parse(JSON.stringify(w.collection)),
    stats: { ...w.stats }, goalsDone: { ...w.goalsDone }, tutorialSeen: w.tutorialSeen, hinted: { ...(w.hinted || {}) },
  };
}

const int = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d);

// Rebuild a World from saved data. Unknown or broken fields fall back to a
// fresh farm's values, so an old or corrupt save can never crash the game.
export function deserialize(data) {
  if (!data || typeof data !== 'object' || data.v !== VERSION) return null;
  const w = new World({ seed: int(data.seed, 0, 0xffffffff, 1) });
  w.day = int(data.day, 0, 100000, 0);
  w.money = int(data.money, 0, 1e9, 500);
  w.earned = int(data.earned, 0, 1e10, 0);
  if (SPEEDS[data.speed]) w.speed = data.speed;
  w.inv = {};
  for (const [id, n] of Object.entries(data.inv || {})) if (ITEMS[id] && n > 0) w.inv[id] = int(n, 0, 99999, 0);
  if (Array.isArray(data.belt) && data.belt.length === BELT_SIZE) {
    w.belt = data.belt.map((id, i) => (i < TOOLS.length ? TOOLS[i] : (ITEMS[id] && w.inv[id] ? id : null)));
  }
  w.sel = int(data.sel, 0, BELT_SIZE - 1, 0);
  w.canLevel = int(data.canLevel, 0, 2, 0);
  w.upgrades = { field: !!data.upgrades?.field, greenhouse: !!data.upgrades?.greenhouse };
  w.soil.fill(0); w.wet.fill(0); w.tuft.fill(0); w.crop.fill(null); w.obj.fill(null);
  for (const t of Array.isArray(data.tiles) ? data.tiles : []) {
    const [i, soil, wet, tuft, c, o] = t;
    if (!Number.isInteger(i) || i < 0 || i >= W * H) continue;
    w.soil[i] = soil ? 1 : 0; w.wet[i] = wet ? 1 : 0; w.tuft[i] = tuft ? 1 : 0;
    if (Array.isArray(c) && CROPS[c[0]]) w.crop[i] = { id: c[0], age: int(c[1], 0, 99, 0), harvests: int(c[2], 0, 999, 0), dead: !!c[3] };
    if (o === 'stone' || o === 'weed' || o === 'sprinkler') w.obj[i] = { type: o };
    else if (DECOR[o]) w.obj[i] = { type: 'decor', id: o };
  }
  w.trough = int(data.trough, 0, 99, 0);
  if (Array.isArray(data.animals)) {
    w.animals = data.animals.filter((a) => ANIMALS[a?.type]).map((a) => ({
      type: a.type, name: String(a.name || ANIMALS[a.type].name).slice(0, 20), points: int(a.points, 0, 1000, 0), ate: !!a.ate, petted: false,
      x: Number.isFinite(a.x) ? a.x : 8, y: Number.isFinite(a.y) ? a.y : 31, tx: null, ty: null, wait: 1, dir: 1, bob: 0,
    }));
  }
  w.pickups = (Array.isArray(data.pickups) ? data.pickups : []).filter((p) => Array.isArray(p) && ITEMS[p[2]]).map(([x, y, item, n]) => ({ x: int(x, 0, W - 1, 0), y: int(y, 0, H - 1, 0), item, n: int(n, 1, 99, 1) }));
  for (const id of VILLAGER_IDS) {
    const s = data.villagers?.[id];
    if (!s) continue;
    w.villagers[id].points = int(s.points, 0, 1000, 0);
    w.villagers[id].met = !!s.met;
    w.villagers[id].known = s.known && typeof s.known === 'object' ? { ...s.known } : {};
  }
  const requests = !Array.isArray(data.requests) ? null : data.requests.filter((r) => r && VILLAGER_IDS.includes(r.villager) && ITEMS[r.item]).map((r) => ({ villager: r.villager, item: r.item, n: int(r.n, 1, 99, 1), reward: int(r.reward, 0, 1e6, 0), done: !!r.done }));
  w.festivalsWon = {};
  for (const id of FESTIVAL_IDS) if (data.festivalsWon?.[id]) w.festivalsWon[id] = true;
  for (const book of ['crops', 'fish', 'critters', 'goods']) {
    w.collection[book] = {};
    for (const [id, n] of Object.entries(data.collection?.[book] || {})) if (ITEMS[id] || book === 'critters') w.collection[book][id] = int(n, 1, 1e6, 1);
  }
  for (const k of Object.keys(w.stats)) w.stats[k] = int(data.stats?.[k], -1e6, 1e9, 0);
  w.goalsDone = {};
  for (const g of GOALS) if (data.goalsDone?.[g.id]) w.goalsDone[g.id] = true;
  w.tutorialSeen = !!data.tutorialSeen;
  w.hinted = data.hinted && typeof data.hinted === 'object' ? { ...data.hinted } : {};
  // Resume at the start of the saved day: weather, villagers and critters.
  w.startDay(true);
  if (requests && requests.length) w.requests = requests;
  w.events.length = 0;
  return w;
}

export function loadWorld(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return null;
    return deserialize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export const SETTINGS_KEY = `${SAVE_KEY}.settings`;

export function writeWorld(storage, w) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(w)));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(storage) {
  const d = { muted: false, music: true, speed: 'normal', reduced: false };
  try {
    const raw = JSON.parse(storage?.getItem(SETTINGS_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      d.muted = raw.muted === true;
      d.music = raw.music !== false;
      if (SPEEDS[raw.speed]) d.speed = raw.speed;
    }
  } catch { /* blocked or corrupt: defaults */ }
  return d;
}

export function writeSettings(storage, settings) {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}

export function clearSave(storage) {
  try { storage?.removeItem(SAVE_KEY); return true; } catch { return false; }
}
