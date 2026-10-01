// The three peaks, their twelve handcrafted slopes, the daily slope and
// Endless Mountain. DOM-free.
//
// Slopes are written in "u" units (the peak's start size) so features read
// the same on every peak; gate and bridge limits are absolute centimetres.
import { Rng, hashString } from './rng.js';
import { ITEMS } from './items.js';
import { Terrain } from './terrain.js';

export const PEAKS = [
  { id: 0, name: 'Pinecone Peak', blurb: 'Morning sun on a pine forest', u: 20, dx: 4, grow: 0.0008, sky: 'morning' },
  { id: 1, name: 'Penguin Pass', blurb: 'Sunset sledding with friends', u: 50, dx: 10, grow: 0.0008, sky: 'sunset' },
  { id: 2, name: 'Starlight Summit', blurb: 'Aurora skies over the high village', u: 150, dx: 30, grow: 0.0008, sky: 'night' },
];

// Segment helpers (lengths and heights in u). Item lists name things by id
// or by size tier relative to the slope's planned ball size at that spot:
//   xs crumbs, s small, m medium (all grabbable), big (jump or bump),
//   huge (scenery for now). Gates and bridges are relative too.
const parse = (s) => (s ? s.trim().split(/\s+/).map((p) => { const [id, n] = p.split('*'); return [id, Number(n || 1)]; }) : []);
const sl = (len, grade, items = '', o = {}) => ({ t: 'slope', len, grade, items, ...o });
const rise = (len, h, items = '', o = {}) => ({ t: 'rise', len, h, items, ...o });
const kick = (len, h, o = {}) => ({ t: 'kicker', len, h, ...o });
const dip = (len, depth, items = '', o = {}) => ({ t: 'dip', len, depth, items, ...o });
const gate = (rel = 0.9) => ({ t: 'gate', len: 16, rel, grade: 0.06 });
const bridge = (len, rel, depth, items = '', o = {}) => ({ t: 'bridge', len, rel, depth, items, grade: 0.1, ...o });
const fin = (items = '') => ({ t: 'finish', len: 70, grade: 0.06, items });

export const TIERS = { xs: [0.1, 0.22], s: [0.2, 0.34], m: [0.34, 0.47], big: [0.72, 1.25], huge: [1.7, 4] };

// Round a size limit to a sign-friendly number.
export function niceSize(cm) {
  const step = cm < 60 ? 5 : cm < 200 ? 10 : cm < 600 ? 25 : 50;
  return Math.max(step, Math.round(cm / step) * step);
}

// Pick a thing for a tier at a planned diameter, preferring the peak's own.
export function resolveTier(tier, D, peak, rng) {
  const win = TIERS[tier];
  if (!win) return tier;
  const pool = ITEMS.filter((it) => !it.rare && it.peak <= peak);
  let fits = pool.filter((it) => it.size >= D * win[0] && it.size <= D * win[1]);
  if (!fits.length) fits = ITEMS.filter((it) => !it.rare && it.size >= D * win[0] && it.size <= D * win[1]);
  if (!fits.length) {
    const mid = D * (win[0] + win[1]) / 2;
    fits = [ITEMS.filter((it) => !it.rare).reduce((a, b) => (Math.abs(Math.log(b.size / mid)) < Math.abs(Math.log(a.size / mid)) ? b : a))];
  }
  const own = fits.filter((it) => it.peak === peak);
  const list = own.length && rng.chance(0.65) ? own : fits;
  return rng.pick(list).id;
}

const SLOPES_RAW = [
  // ---------------------------------------------------------- Pinecone Peak
  {
    name: 'First Flakes', tip: 'Roll over fresh snow and little things to grow.', plan: 2.6,
    segments: [
      sl(60, 0.18, 'xs*10', { bumps: 0.2 }),
      sl(80, 0.24, 'xs*8 s*4', { snow: 'powder' }),
      rise(36, 1.2, 'xs*3'),
      sl(90, 0.26, 'xs*5 s*7 snowglobe*1', { bumps: 0.3 }),
      dip(40, 1.5, 's*4'),
      sl(100, 0.28, 's*7 m*4 big*1', { snow: 'powder' }),
      rise(36, 1.4, 's*3'),
      sl(100, 0.3, 's*6 m*5 big*1', { bumps: 0.3 }),
      sl(80, 0.26, 's*4 m*4 bunny*2'),
      fin(),
    ],
  },
  {
    name: 'Bunny Hill', tip: 'Jump over things too big to grab. Bumping them knocks snow off.', plan: 3.2,
    segments: [
      sl(60, 0.22, 'xs*10 s*2', { snow: 'powder' }),
      rise(30, 1.4, 'xs*3'),
      sl(80, 0.28, 'xs*6 s*6 big*1', { bumps: 0.3 }),
      kick(18, 1.6),
      sl(80, 0.32, 's*7 m*3 big*1 snowglobe*1'),
      gate(0.85),
      sl(90, 0.26, 's*6 m*5 big*1', { snow: 'powder' }),
      rise(34, 2, 's*3'),
      sl(100, 0.3, 's*6 m*6 big*2', { bumps: 0.35 }),
      dip(40, 2, 'm*4'),
      sl(90, 0.28, 's*5 m*5 bunny*3'),
      fin(),
    ],
  },
  {
    name: 'Avalanche Alley', tip: 'The Snow Cloud wants a hug! Hold speed-up and keep rolling.', plan: 3.6,
    avalanche: { factor: 1.1 },
    segments: [
      sl(70, 0.26, 'xs*12 s*2', { snow: 'powder' }),
      sl(70, 0.3, 'xs*6 s*6 big*1', { bumps: 0.3 }),
      bridge(40, 1.25, 4, 's*4'),
      sl(80, 0.3, 's*7 m*3 big*1'),
      kick(20, 1.8),
      sl(80, 0.36, 's*6 m*4 snowglobe*1', { snow: 'ice' }),
      rise(34, 2, 's*3'),
      sl(100, 0.3, 's*7 m*6 big*2', { snow: 'powder', bumps: 0.4 }),
      sl(100, 0.32, 's*6 m*6 big*1'),
      dip(40, 2.5, 'm*4'),
      sl(90, 0.3, 's*5 m*5 lantern*2'),
      fin(),
    ],
  },
  {
    name: 'Penguin Parade', tip: 'Penguins love a ride. Grow big enough to scoop them up!', plan: 4.4,
    avalanche: { factor: 1.15, delay: 4 },
    segments: [
      sl(60, 0.24, 'xs*12 s*3', { snow: 'powder' }),
      sl(80, 0.3, 'xs*6 s*7 big*1', { bumps: 0.3 }),
      rise(30, 1.8, 's*3'),
      sl(90, 0.32, 's*7 m*4 snowglobe*1', { snow: 'powder' }),
      gate(0.85),
      sl(90, 0.3, 's*7 m*5 big*1'),
      kick(20, 2),
      sl(90, 0.36, 's*6 m*6 big*1', { snow: 'powder' }),
      bridge(44, 1.3, 5, 'm*4'),
      sl(100, 0.3, 's*7 m*6 big*2', { bumps: 0.5 }),
      rise(36, 2.6, 'm*3'),
      sl(110, 0.32, 's*7 m*5 penguin*6'),
      fin('penguin*3'),
    ],
  },
  // ---------------------------------------------------------- Penguin Pass
  {
    name: 'Sunset Sleds', tip: 'A bigger ball for bigger things. Sleds ahead!', plan: 2.5,
    segments: [
      sl(60, 0.22, 'xs*10 s*3', { snow: 'powder' }),
      sl(80, 0.28, 'xs*5 s*7 big*1', { bumps: 0.3 }),
      rise(30, 1.4, 's*3'),
      sl(90, 0.3, 's*7 m*4 big*1'),
      dip(40, 1.6, 's*4'),
      sl(100, 0.3, 's*7 m*5 big*1', { snow: 'powder', bumps: 0.3 }),
      kick(18, 1.4),
      sl(90, 0.34, 's*6 m*5 big*1'),
      sl(80, 0.28, 's*4 m*3 sled*4'),
      fin(),
    ],
  },
  {
    name: 'Snowman Slalom', tip: 'The Snow Cloud is back. Jump the snowmen!', plan: 2.8,
    avalanche: { factor: 1.15 },
    segments: [
      sl(60, 0.26, 'xs*12 s*3', { snow: 'powder' }),
      sl(80, 0.3, 'xs*5 s*7 big*1', { bumps: 0.3 }),
      sl(80, 0.32, 's*7 m*3 snowman*1'),
      bridge(36, 1.25, 3, 's*3'),
      sl(90, 0.3, 's*7 m*5 snowman*1', { snow: 'powder' }),
      rise(34, 1.8, 's*3'),
      sl(100, 0.34, 's*7 m*5 snowman*2', { bumps: 0.4 }),
      kick(20, 1.6),
      sl(90, 0.36, 's*6 m*5 big*1', { snow: 'ice' }),
      sl(90, 0.3, 's*5 m*5 snowman*2'),
      fin(),
    ],
  },
  {
    name: 'Reindeer Run', tip: 'Size gates only open for a big enough ball.', plan: 3.6,
    segments: [
      sl(60, 0.24, 'xs*12 s*3', { snow: 'powder' }),
      sl(80, 0.3, 'xs*6 s*7 big*1', { bumps: 0.3 }),
      gate(0.85),
      sl(90, 0.3, 's*7 m*5 big*1'),
      kick(18, 1.6),
      sl(90, 0.36, 's*7 m*5', { snow: 'powder' }),
      rise(34, 2, 's*3'),
      sl(100, 0.32, 's*7 m*5 big*1', { bumps: 0.4 }),
      gate(0.85),
      sl(90, 0.32, 's*6 m*6 reindeer*1', { snow: 'powder' }),
      dip(40, 2, 'm*4'),
      sl(90, 0.3, 's*5 m*5 reindeer*2'),
      fin(),
    ],
  },
  {
    name: 'Igloo Village', tip: 'Race the Snow Cloud through the village and smash the big gate!', plan: 4,
    avalanche: { factor: 1.2, delay: 3 },
    segments: [
      sl(60, 0.26, 'xs*12 s*3', { snow: 'powder' }),
      sl(80, 0.3, 'xs*6 s*7 big*1', { bumps: 0.3 }),
      rise(30, 1.6, 's*3'),
      sl(90, 0.32, 's*7 m*4 big*1'),
      bridge(40, 1.3, 4, 'm*4'),
      sl(100, 0.32, 's*7 m*5 huge*1', { snow: 'powder', bumps: 0.4 }),
      kick(20, 1.8),
      sl(90, 0.36, 's*7 m*5 big*1 huge*1'),
      gate(0.85),
      sl(100, 0.32, 's*7 m*6 igloo*1 huge*1', { snow: 'powder' }),
      rise(36, 2.4, 'm*3'),
      sl(100, 0.32, 's*6 m*6 igloo*2'),
      gate(0.9),
      sl(60, 0.28, 'm*4 igloo*2'),
      fin(),
    ],
  },
  // ---------------------------------------------------------- Starlight Summit
  {
    name: 'Starlight Trail', tip: 'Up among the stars! Grab gondolas, gifts and more.', plan: 2.6,
    segments: [
      sl(60, 0.22, 'xs*10 s*3', { snow: 'powder' }),
      sl(80, 0.28, 'xs*5 s*7 big*1', { bumps: 0.3 }),
      rise(30, 1.4, 's*3'),
      sl(90, 0.3, 's*7 m*4 big*1 huge*1'),
      dip(40, 1.6, 's*4'),
      sl(100, 0.32, 's*7 m*5 big*1', { snow: 'powder' }),
      kick(18, 1.4),
      sl(90, 0.34, 's*6 m*5 big*1 huge*1', { bumps: 0.3 }),
      sl(80, 0.3, 's*4 m*5 polarbear*1'),
      fin(),
    ],
  },
  {
    name: 'Aurora Ridge', tip: 'The Snow Cloud loves the northern lights too. Outrun it!', plan: 3.4,
    avalanche: { factor: 1.2 },
    segments: [
      sl(60, 0.26, 'xs*12 s*3', { snow: 'powder' }),
      sl(80, 0.3, 'xs*5 s*7 big*1', { bumps: 0.3 }),
      bridge(36, 1.25, 3, 's*3'),
      sl(90, 0.32, 's*7 m*4 big*1'),
      kick(18, 1.6),
      sl(90, 0.36, 's*7 m*4 huge*1', { snow: 'ice' }),
      rise(34, 1.8, 's*3'),
      sl(100, 0.32, 's*7 m*6 big*1', { snow: 'powder', bumps: 0.4 }),
      sl(100, 0.32, 's*6 m*6 big*1 huge*1'),
      sl(80, 0.3, 's*4 m*5 gondola*2'),
      fin(),
    ],
  },
  {
    name: 'Yeti Woods', tip: 'Friendly yetis everywhere! Grow big enough and they hop in for a ride.', plan: 4,
    segments: [
      sl(60, 0.24, 'xs*12 s*3', { snow: 'powder' }),
      sl(80, 0.3, 'xs*6 s*7 big*1', { bumps: 0.3 }),
      gate(0.85),
      sl(90, 0.32, 's*7 m*5 big*1'),
      kick(18, 1.6),
      sl(90, 0.34, 's*7 m*5 huge*1', { snow: 'powder' }),
      rise(34, 2, 's*3'),
      sl(100, 0.32, 's*7 m*5 big*1 pinetree*1', { bumps: 0.4 }),
      gate(0.85),
      sl(100, 0.32, 's*6 m*6 pinetree*2', { snow: 'powder' }),
      dip(40, 2, 'm*4'),
      sl(90, 0.3, 's*5 m*4 yeti*4'),
      fin(),
    ],
  },
  {
    name: 'Summit Village', tip: 'Roll through the whole village before the Snow Cloud catches up!', plan: 5.5,
    avalanche: { factor: 1.25, delay: 3 },
    segments: [
      sl(60, 0.26, 'xs*12 s*3', { snow: 'powder' }),
      sl(80, 0.3, 'xs*6 s*7 big*1', { bumps: 0.3 }),
      rise(30, 1.6, 's*3'),
      sl(90, 0.32, 's*7 m*5 big*1'),
      bridge(40, 1.3, 4, 'm*4'),
      sl(100, 0.32, 's*7 m*5 huge*1', { snow: 'powder', bumps: 0.4 }),
      kick(20, 1.8),
      sl(100, 0.36, 's*7 m*5 big*1 huge*1'),
      gate(0.85),
      sl(100, 0.32, 's*7 m*6 cabin*1', { snow: 'powder' }),
      rise(36, 2.4, 'm*3'),
      sl(100, 0.32, 's*6 m*6 cabin*1 huge*1'),
      gate(0.9),
      sl(80, 0.28, 's*4 m*5 cabin*2'),
      fin('clocktower*1 icecastle*1'),
    ],
  },
];

// Star targets baked from `calibrate` in autoplayer.js (size ×0.85, things
// ×0.75, time ×1.25 of a full-speed autoplayer run); tests/levels.test.js
// checks the autoplayer still earns all three. Size in cm, time in seconds.
const GOALS = [
  { size: 48, items: 56, time: 40 },
  { size: 52, items: 54, time: 40 },
  { size: 59, items: 66, time: 43 },
  { size: 66, items: 66, time: 43 },
  { size: 90, items: 48, time: 52 },
  { size: 96, items: 57, time: 59 },
  { size: 120, items: 60, time: 59 },
  { size: 144, items: 67, time: 67 },
  { size: 307, items: 51, time: 70 },
  { size: 378, items: 58, time: 77 },
  { size: 356, items: 57, time: 78 },
  { size: 553, items: 68, time: 86 }
];

// Turn a raw slope into cm segments with tiers, gates and bridges resolved
// against the planned growth curve D(x) = start * plan^(x / length).
function compile(raw, i) {
  const peak = PEAKS[Math.floor(i / 4)];
  const u = peak.u;
  const total = raw.segments.reduce((n, sg) => n + sg.len * u, 0);
  // Real players trail the plan a little, so things and gates are sized for 85 % of it.
  const planAt = (x) => 0.85 * u * Math.pow(raw.plan, Math.min(1, x / total));
  let x = 0;
  const segments = raw.segments.map((sg) => {
    const out = { ...sg, items: parse(sg.items) };
    for (const k of ['len', 'h', 'depth', 'bumps']) if (out[k] != null) out[k] *= u;
    if (sg.t === 'gate') out.min = niceSize(planAt(x) * sg.rel);
    if (sg.t === 'bridge') out.max = niceSize(planAt(x) * sg.rel);
    x += out.len;
    return out;
  });
  const seed = hashString(`snowball-summit/${i}/${raw.name}`);
  return {
    id: `${peak.id + 1}-${(i % 4) + 1}`,
    index: i,
    peak: peak.id,
    name: raw.name,
    tip: raw.tip,
    u,
    start: u,
    plan: raw.plan,
    dx: peak.dx,
    grow: peak.grow,
    seed,
    avalanche: raw.avalanche || null,
    segments,
    goals: GOALS[i],
    resolve: (ref, ix, rng) => resolveTier(ref, planAt(ix), peak.id, rng),
  };
}

export const SLOPES = SLOPES_RAW.map(compile);

export const SLOPES_PER_PEAK = 4;

// ------------------------------------------------------------ generated slopes

// Things that suit a ball of about diameter D: mostly grabbable, some easy
// crumbs, a few obstacles to jump.
function palette(D) {
  const grab = ITEMS.filter((it) => !it.rare && it.size >= D * 0.12 && it.size <= D * 0.5);
  const crumbs = ITEMS.filter((it) => !it.rare && it.size < D * 0.12 && it.size >= D * 0.05);
  const big = ITEMS.filter((it) => !it.rare && it.size > D * 0.6 && it.size <= D * 1.3);
  return { grab: grab.length ? grab : ITEMS.slice(0, 3), crumbs, big };
}

function itemsFor(rng, D, len) {
  const p = palette(D);
  const n = Math.max(2, Math.round(len / (D * 3.6)));
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    const r = rng.float();
    const list = r < 0.12 && p.big.length ? p.big : r < 0.3 && p.crumbs.length ? p.crumbs : p.grab;
    const id = rng.pick(list).id;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  if (rng.chance(0.06)) counts.set('snowglobe', 1);
  return [...counts.entries()];
}

// A run of generated segments (cm) for a ball growing from D0 to D1.
export function generateSegments(rng, { u, D0, D1, count, gates = true, bridges = true, kickers = true, first = false }) {
  const segs = [];
  for (let k = 0; k < count; k++) {
    // Players usually trail the plan a little, so size things for 85 % of it.
    const D = 0.85 * D0 * Math.pow(D1 / D0, k / Math.max(1, count - 1));
    const r = rng.float();
    const grade = rng.range(0.22, 0.36);
    const snow = rng.chance(0.25) ? 'powder' : rng.chance(0.1) ? 'ice' : 'snow';
    const L = rng.range(45, 70) * u;
    if (first && k === 0) { segs.push({ t: 'slope', len: 40 * u, grade: 0.22, snow: 'powder', items: itemsFor(rng, D, 40 * u) }); continue; }
    if (gates && r < 0.08 && k > 2) { segs.push({ t: 'gate', len: 14 * u, min: niceSize(D * 0.8), grade: 0.06, items: [] }); continue; }
    if (bridges && r < 0.15 && k > 1) {
      segs.push({ t: 'bridge', len: rng.range(28, 38) * u, max: niceSize(D * 1.35), depth: rng.range(3, 4.5) * u, grade: 0.1, items: itemsFor(rng, D * 1.3, 20 * u) });
      continue;
    }
    if (kickers && r < 0.25) { segs.push({ t: 'kicker', len: rng.range(14, 18) * u, h: rng.range(1.3, 1.9) * u, grade, items: [] }); continue; }
    if (r < 0.4) { segs.push({ t: 'rise', len: rng.range(24, 32) * u, h: rng.range(1.2, 2.2) * u, grade, items: itemsFor(rng, D, 15 * u) }); continue; }
    if (r < 0.5) { segs.push({ t: 'dip', len: rng.range(26, 34) * u, depth: rng.range(1.4, 2.4) * u, grade, items: itemsFor(rng, D, 20 * u) }); continue; }
    segs.push({ t: 'slope', len: L, grade, snow, bumps: rng.range(0, 0.4) * u, items: itemsFor(rng, D, L) });
  }
  for (const sg of segs) sg.u = u;
  return segs;
}

// Today's slope: one peak's look, a finite run with stars.
export function dailySlope(dateKey) {
  const seed = hashString(`snowball-summit/daily/${dateKey}`);
  const rng = new Rng(seed);
  const peak = PEAKS[seed % 3];
  const growth = [2.4, 2.8, 3.4][peak.id];
  const segments = generateSegments(rng, { u: peak.u, D0: peak.u * 1.1, D1: peak.u * growth, count: peak.id === 0 ? 19 : 15, first: true });
  segments.push({ t: 'finish', len: 60 * peak.u, grade: 0.06, items: [] });
  return {
    id: `daily-${dateKey}`, index: -1, daily: dateKey, peak: peak.id, name: 'Daily Slope', tip: 'A fresh slope every day. Same slope for everyone today!',
    u: peak.u, start: peak.u, dx: peak.dx, grow: peak.grow, seed,
    avalanche: rng.chance(0.5) ? { factor: 1.1 } : null,
    segments, goals: null,
  };
}

// Endless Mountain: chunks from a seed, bigger and faster as you go.
export function endlessLevel(seed = 20261001) {
  const dx = 6;
  const terrain = new Terrain({ dx, seed, startGrade: 0.22 });
  const level = {
    id: 'endless', index: -1, endless: true, peak: 0, name: 'Endless Mountain', tip: 'How far can you roll before the Snow Cloud hugs you?',
    u: 20, start: 20, dx, grow: 0.0022, seed, terrain,
    avalanche: { factor: 0.95, delay: 2.5 },
    goals: null,
    avalancheFactor(x) { return avalancheFactorForEndless(level.zoneIndex(x)); },
    zoneAt(x) { return Math.min(PEAKS.length - 1, Math.floor(level.zoneIndex(x) / 3)); },
    zoneIndex(x) { return chunkStarts.findLastIndex((s) => s <= x); },
    extend(t, chunk) {
      const rng = new Rng(hashString(`endless/${seed}/${chunk}`));
      const D0 = 20 * Math.pow(1.4, Math.min(chunk, 10));
      const u = Math.min(D0, 160);
      chunkStarts.push(t.cursorX);
      for (const s of generateSegments(rng, { u, D0, D1: D0 * 1.45, count: 5, first: chunk === 0, gates: chunk > 1 })) t.addSegment(s);
    },
  };
  const chunkStarts = [];
  return level;
}

export function avalancheFactorForEndless(chunk) {
  return Math.min(1.7, 0.95 + chunk * 0.05);
}
