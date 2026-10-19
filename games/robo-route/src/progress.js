// Saved progress, unlocks and the Bug Zapper collection. DOM-free.
import { WORLDS, LEVELS } from './levels.js';
import { starsFor } from './rules.js';
import { dayGap } from './daily.js';

export const STORAGE_KEY = 'robo-route.v1';

export const PAINTS = [
  { id: 'teal', name: 'Teal Classic', body: '#3fd0c9', dark: '#1f8f95', need: null },
  { id: 'sunny', name: 'Sunny Side', body: '#ffd23f', dark: '#c99410', need: { stars: 6 } },
  { id: 'cherry', name: 'Cherry Pop', body: '#ff5e7a', dark: '#c02c4e', need: { stars: 18 } },
  { id: 'mint', name: 'Mint Chip', body: '#7fe0a0', dark: '#3c9e64', need: { daily: 1 } },
  { id: 'grape', name: 'Grape Fizz', body: '#a684ff', dark: '#6a48c8', need: { world: 4 } },
  { id: 'bubblegum', name: 'Bubblegum', body: '#ff9ad5', dark: '#d0559c', need: { bugs: 6 } },
  { id: 'midnight', name: 'Midnight', body: '#5a6ad8', dark: '#2c3690', need: { stars: 60 } },
  { id: 'gold', name: 'Solid Gold', body: '#ffc94a', dark: '#b07a10', shine: true, need: { stars: 120 } },
];

export const TOPPERS = [
  { id: 'ball', name: 'Bobble', need: null },
  { id: 'spring', name: 'Boing Spring', need: { stars: 10 } },
  { id: 'star', name: 'Yard Star', need: { world: 1 } },
  { id: 'flower', name: 'Lagoon Lily', need: { world: 2 } },
  { id: 'propeller', name: 'Propeller', need: { world: 3 } },
  { id: 'heart', name: 'Daily Heart', need: { daily: 2 } },
  { id: 'dish', name: 'Builder Dish', need: { built: 1 } },
  { id: 'crown', name: 'Circuit Crown', need: { world: 5 } },
];

// Eighteen bugs to zap. `hint` says how to catch one.
export const BUGS = [
  { id: 'bonk', name: 'Bonk Beetle', hint: 'Bump Bolt into something.', look: { body: '#ff7a59', spots: '#7a2a1a', shape: 'beetle' } },
  { id: 'shrug', name: 'Shrug Moth', hint: 'Run out of tiles with work left to do.', look: { body: '#c9b8ff', spots: '#7a62c4', shape: 'moth' } },
  { id: 'tired', name: 'Sleepy Termite', hint: 'Keep Bolt busy until he gets tired.', look: { body: '#d8a070', spots: '#8a5428', shape: 'ant' } },
  { id: 'step', name: 'Step Snail', hint: 'Use the Step button 10 times.', look: { body: '#9fe0c8', spots: '#3a9a7a', shape: 'snail' } },
  { id: 'fix', name: 'Fix-it Firefly', hint: 'Pause, change the program, then win.', look: { body: '#ffe066', spots: '#d09a10', shape: 'firefly' } },
  { id: 'first', name: 'First-Try Cricket', hint: 'Win a level on your first run.', look: { body: '#8fd85a', spots: '#4a8a20', shape: 'cricket' } },
  { id: 'loop', name: 'Loop Ladybug', hint: 'Win with a Repeat block.', look: { body: '#ff4d5e', spots: '#2a1a24', shape: 'beetle' } },
  { id: 'nest', name: 'Nesting Gnat', hint: 'Win with a Repeat inside a Repeat.', look: { body: '#7ad0ff', spots: '#2a6a9a', shape: 'moth' } },
  { id: 'proc', name: 'Procedure Pillbug', hint: 'Win using P1.', look: { body: '#a0a8c8', spots: '#565e80', shape: 'pill' } },
  { id: 'recur', name: 'Recursion Roly-poly', hint: 'Win with a P1 that calls P1.', look: { body: '#b48cff', spots: '#6a40c0', shape: 'pill' } },
  { id: 'colour', name: 'Rainbow Weevil', hint: 'Win with a red or blue tile.', look: { body: '#ff8ac8', spots: '#4aa3ff', shape: 'weevil' } },
  { id: 'clever', name: 'Clever Cicada', hint: 'Beat a par with fewer tiles.', look: { body: '#5ad0a0', spots: '#1e7050', shape: 'cricket' } },
  { id: 'perfect', name: 'Perfect Mantis', hint: 'Get 3 stars on 10 levels.', look: { body: '#9ae66e', spots: '#3e8a2a', shape: 'mantis' } },
  { id: 'world', name: 'Golden Grub', hint: 'Get every star in a world.', look: { body: '#ffc94a', spots: '#b07a10', shape: 'snail' } },
  { id: 'daily', name: 'Daily Dragonfly', hint: 'Finish a Daily Circuit.', look: { body: '#4ae0e0', spots: '#1a8a9a', shape: 'dragonfly' } },
  { id: 'streak', name: 'Streak Stick-bug', hint: 'Finish the Daily Circuit 3 days in a row.', look: { body: '#c8b070', spots: '#7a6a30', shape: 'stick' } },
  { id: 'builder', name: 'Builder Bee', hint: 'Make a level and solve it.', look: { body: '#ffd23f', spots: '#2a2030', shape: 'bee' } },
  { id: 'glow', name: 'Glow-worm', hint: 'Light 100 lamps.', look: { body: '#fff1a0', spots: '#e0b020', shape: 'worm' } },
];
export const BUG = Object.fromEntries(BUGS.map((b) => [b.id, b]));

export function newState() {
  return {
    v: 1,
    levels: {},
    daily: { last: '', streak: 0, best: 0, count: 0, done: {} },
    bugs: {},
    paint: 'teal',
    topper: 'ball',
    seenTeach: {},
    settings: { muted: false, music: true, speed: 1 },
    stats: { runs: 0, wins: 0, steps: 0, bonks: 0, lamps: 0, stepPresses: 0, hints: 0 },
    custom: [],
    built: 0,
    drafts: {},
    last: '1-1',
  };
}

export function normalize(raw) {
  const s = newState();
  if (!raw || typeof raw !== 'object') return s;
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  for (const [id, r] of Object.entries(obj(raw.levels))) {
    if (!r || typeof r !== 'object') continue;
    s.levels[id] = { stars: clampInt(r.stars, 0, 3), best: clampInt(r.best, 0, 99), hinted: !!r.hinted };
  }
  const d = obj(raw.daily);
  s.daily = {
    last: typeof d.last === 'string' ? d.last : '',
    streak: clampInt(d.streak, 0, 9999),
    best: clampInt(d.best, 0, 9999),
    count: clampInt(d.count, 0, 99999),
    done: {},
  };
  for (const [k, v] of Object.entries(obj(d.done))) if (/^\d{4}-\d\d-\d\d$/.test(k)) s.daily.done[k] = clampInt(v, 0, 3);
  for (const k of Object.keys(obj(raw.bugs))) if (BUG[k]) s.bugs[k] = true;
  if (PAINTS.some((p) => p.id === raw.paint)) s.paint = raw.paint;
  if (TOPPERS.some((t) => t.id === raw.topper)) s.topper = raw.topper;
  for (const k of Object.keys(obj(raw.seenTeach))) s.seenTeach[k] = true;
  const st = obj(raw.settings);
  s.settings = { muted: !!st.muted, music: st.music !== false, speed: [1, 2, 4].includes(st.speed) ? st.speed : 1 };
  for (const k of Object.keys(s.stats)) s.stats[k] = clampInt(obj(raw.stats)[k], 0, 1e9);
  if (Array.isArray(raw.custom)) {
    s.custom = raw.custom
      .filter((c) => c && typeof c.code === 'string')
      .slice(0, 24)
      .map((c) => ({ code: c.code, name: String(c.name || 'My level').slice(0, 18), solved: !!c.solved, mine: !!c.mine }));
  }
  s.built = clampInt(raw.built, 0, 9999);
  for (const [k, v] of Object.entries(obj(raw.drafts))) {
    if (v && typeof v.main === 'string' && typeof v.p1 === 'string' && v.main.length < 400 && v.p1.length < 400) {
      s.drafts[k] = { main: v.main, p1: v.p1 };
      if (typeof v.day === 'string') s.drafts[k].day = v.day;
    }
  }
  if (typeof raw.last === 'string') s.last = raw.last;
  return s;
}

function clampInt(v, lo, hi) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

// --------------------------------------------------------------- progress

export function totalStars(state) {
  let n = 0;
  for (const l of LEVELS) n += state.levels[l.id]?.stars || 0;
  return n;
}

export function worldStars(state, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  let n = 0;
  for (const id of w.levels) n += state.levels[id]?.stars || 0;
  return n;
}

export function worldSolved(state, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  return w.levels.filter((id) => state.levels[id]?.stars > 0).length;
}

export function worldComplete(state, worldId) {
  const w = WORLDS.find((x) => x.id === worldId);
  return w.levels.every((id) => state.levels[id]?.stars > 0);
}

export const WORLD_UNLOCK = 6;

export function worldOpen(state, worldId) {
  if (worldId === 1) return true;
  return worldSolved(state, worldId - 1) >= WORLD_UNLOCK;
}

// A level is open when its world is open and one of the two levels before it
// is solved (so one tricky level never blocks the way).
export function levelOpen(state, levelId) {
  const lv = LEVELS.find((l) => l.id === levelId);
  if (!lv) return false;
  if (!worldOpen(state, lv.world)) return false;
  const w = WORLDS.find((x) => x.id === lv.world);
  const i = w.levels.indexOf(levelId);
  if (i === 0) return true;
  if (state.levels[w.levels[i - 1]]?.stars) return true;
  return i >= 2 && !!state.levels[w.levels[i - 2]]?.stars;
}

// The next level to suggest after `levelId` (or the first unsolved one).
export function nextLevel(state, levelId) {
  const i = LEVELS.findIndex((l) => l.id === levelId);
  for (let j = i + 1; j < LEVELS.length; j++) if (levelOpen(state, LEVELS[j].id)) return LEVELS[j].id;
  const open = LEVELS.find((l) => levelOpen(state, l.id) && !state.levels[l.id]?.stars);
  return open ? open.id : null;
}

function meets(state, need) {
  if (!need) return true;
  if (need.stars) return totalStars(state) >= need.stars;
  if (need.world) return worldComplete(state, need.world);
  if (need.daily) return state.daily.count >= need.daily;
  if (need.bugs) return Object.keys(state.bugs).length >= need.bugs;
  if (need.built) return state.built >= need.built;
  return false;
}

export function needText(need) {
  if (!need) return 'Ready to wear';
  if (need.stars) return `Collect ${need.stars} stars`;
  if (need.world) return `Finish ${WORLDS[need.world - 1].name}`;
  if (need.daily) return need.daily === 1 ? 'Finish a Daily Circuit' : `Finish ${need.daily} Daily Circuits`;
  if (need.bugs) return `Zap ${need.bugs} bugs`;
  if (need.built) return 'Make and solve a level';
  return '';
}

export function unlocked(state) {
  return {
    paints: PAINTS.filter((p) => meets(state, p.need)).map((p) => p.id),
    toppers: TOPPERS.filter((t) => meets(state, t.need)).map((t) => t.id),
  };
}

// Award a bug; returns true when it is new.
export function zap(state, id) {
  if (!BUG[id] || state.bugs[id]) return false;
  state.bugs[id] = true;
  return true;
}

// Record a solved run. ctx: { tiles, par, features, firstRun, editedWhilePaused,
// hinted, lamps }. Returns what changed so the result card can celebrate.
export function recordWin(state, levelId, ctx) {
  const before = unlocked(state);
  const prev = state.levels[levelId] || { stars: 0, best: 0, hinted: false };
  const stars = starsFor(ctx.tiles, ctx.par);
  const newBest = !prev.best || ctx.tiles < prev.best;
  const rec = {
    stars: Math.max(prev.stars, stars),
    best: prev.best ? Math.min(prev.best, ctx.tiles) : ctx.tiles,
    hinted: prev.hinted || !!ctx.hinted,
  };
  if (!ctx.daily && !ctx.custom) state.levels[levelId] = rec;
  state.stats.wins++;
  const bugs = [];
  const award = (id) => { if (zap(state, id)) bugs.push(id); };
  const f = ctx.features || {};
  if (f.repeat) award('loop');
  if (f.nested) award('nest');
  if (f.call) award('proc');
  if (f.recursion) award('recur');
  if (f.colour) award('colour');
  if (ctx.firstRun) award('first');
  if (ctx.editedWhilePaused) award('fix');
  if (ctx.tiles < ctx.par) award('clever');
  if (state.stats.lamps >= 100) award('glow');
  let threes = 0;
  for (const l of LEVELS) if (state.levels[l.id]?.stars === 3) threes++;
  if (threes >= 10) award('perfect');
  for (const w of WORLDS) if (worldStars(state, w.id) === w.levels.length * 3) award('world');
  if (ctx.daily) {
    const r = recordDaily(state, ctx.daily, stars);
    if (r.first) award('daily');
    if (state.daily.streak >= 3) award('streak');
  }
  if (ctx.custom && ctx.mine) award('builder');
  const after = unlocked(state);
  const unlocks = [
    ...after.paints.filter((p) => !before.paints.includes(p)).map((id) => ({ kind: 'paint', id })),
    ...after.toppers.filter((t) => !before.toppers.includes(t)).map((id) => ({ kind: 'topper', id })),
  ];
  return { stars, prevStars: prev.stars, newBest: newBest && !!prev.best, best: rec.best, bugs, unlocks };
}

// Daily bookkeeping: one completion per day, a streak for consecutive days.
export function recordDaily(state, key, stars) {
  const d = state.daily;
  const first = !(key in d.done);
  d.done[key] = Math.max(d.done[key] || 0, stars);
  if (!first) return { first };
  d.count++;
  if (d.last && dayGap(d.last, key) === 1) d.streak++;
  else if (d.last !== key) d.streak = 1;
  d.last = key;
  d.best = Math.max(d.best, d.streak);
  // Keep the done-map small.
  const keys = Object.keys(d.done).sort();
  while (keys.length > 60) delete d.done[keys.shift()];
  return { first };
}

// The streak shown today: still alive if the last finish was today or yesterday.
export function liveStreak(state, today) {
  const d = state.daily;
  if (!d.last) return 0;
  const gap = dayGap(d.last, today);
  return gap <= 1 ? d.streak : 0;
}
