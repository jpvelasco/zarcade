// Daily Dash: one procedural time-trial track per local day (same day, same
// track for everyone), plus a gentle streak that never scolds.
import { TAU, clamp, hashString, mulberry32 } from './math.js';
import { buildTrack, validateTrack } from './track.js';
import { TRACKS } from './tracks.js';

const THEMES = ['toybox', 'candy', 'docks'];
const FIRST = ['Wiggly', 'Zippy', 'Bouncy', 'Sparkly', 'Giggly', 'Swirly', 'Sunny', 'Twinkly', 'Jolly', 'Breezy', 'Puffy', 'Snappy'];
const SECOND = {
  toybox: ['Block', 'Crayon', 'Teddy', 'Marble', 'Yo-Yo', 'Kite'],
  candy: ['Lolly', 'Toffee', 'Sprinkle', 'Jellybean', 'Cupcake', 'Fudge'],
  docks: ['Lantern', 'Harbour', 'Moonbeam', 'Comet', 'Lighthouse', 'Starfish'],
};
const THIRD = ['Loop', 'Dash', 'Circuit', 'Run', 'Ring', 'Raceway'];

// Local calendar date as YYYY-MM-DD.
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isDateKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// The day before a date key, as a date key.
export function previousDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d - 1, 12));
}

export const dailySeed = (key) => hashString(`pocket-kart:${key}`);

// A seeded closed track. Most days it is the rounded outline of a few
// joined grid cells (L, T, U and S shapes give hairpins and chicanes);
// otherwise a loose star of points. Candidates are rejected until one
// passes the same validity checks as the Grand Prix tracks. `steps` yields
// after each attempt so a browser can spread the work over frames.
export function* generateTrackSteps(seed, { id = `daily-${seed}`, name = null } = {}) {
  const rng = mulberry32(seed);
  const theme = THEMES[seed % THEMES.length];
  const title = name || `${FIRST[Math.floor(rng() * FIRST.length)]} ${SECOND[theme][Math.floor(rng() * 6)]} ${THIRD[Math.floor(rng() * THIRD.length)]}`;
  for (let attempt = 0; attempt < 80; attempt++) {
    const pts = attempt % 5 === 4 ? starPoints(rng) : cellPoints(rng);
    if (!pts) { yield null; continue; }
    const def = {
      id, name: title, cup: -1, theme, variant: Math.floor(rng() * 4), seed: (seed % 100000) + 7,
      width: 62 + Math.floor(rng() * 9), verge: 24 + Math.floor(rng() * 6), points: pts,
      pads: [{ at: 0.06, off: 0 }, { at: 0.35 + rng() * 0.1, off: 0 }, { at: 0.7 + rng() * 0.1, off: 0 }],
      boxes: [], bumpers: [],
    };
    // Scale to a friendly lap length, then start on a straight-ish stretch.
    const first = buildTrack(def, { decor: false });
    const f = 7400 / first.length;
    def.points = rotateToStraight(def.points.map(([x, y]) => [Math.round(x * f), Math.round(y * f)]));
    const track = buildTrack(def, { decor: false });
    if (validateTrack(track).length === 0) return def;
    yield null;
  }
  return { ...TRACKS[0], id, name: title, cup: -1, theme };
}

export function generateTrackDef(seed, opts) {
  const it = generateTrackSteps(seed, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

function starPoints(rng) {
  const n = 7 + Math.floor(rng() * 5);
  const radii = Array.from({ length: n }, () => 0.45 + rng() * 0.7);
  const sx = 1.1 + rng() * 0.3, sy = 0.8 + rng() * 0.2;
  const spin = rng() * TAU;
  return radii.map((r, i) => {
    const a = spin + (i / n) * TAU + (rng() - 0.5) * (TAU / n) * 0.35;
    return [Math.cos(a) * r * 1000 * sx, Math.sin(a) * r * 1000 * sy];
  });
}

// Rounded outline of 4-7 joined cells on a 4×3 grid.
function cellPoints(rng) {
  const W = 4, H = 3;
  const key = (x, y) => y * W + x;
  const cells = new Set();
  const want = 4 + Math.floor(rng() * 4);
  cells.add(key(Math.floor(rng() * W), Math.floor(rng() * H)));
  let guard = 0;
  while (cells.size < want && guard++ < 200) {
    const list = [...cells];
    const c = list[Math.floor(rng() * list.length)];
    const cx = c % W, cy = Math.floor(c / W);
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)];
    const nx = cx + dx, ny = cy + dy;
    if (nx >= 0 && nx < W && ny >= 0 && ny < H) cells.add(key(nx, ny));
  }
  const has = (x, y) => x >= 0 && x < W && y >= 0 && y < H && cells.has(key(x, y));
  // Boundary edges, wound so the filled side is on the left.
  const edges = new Map();
  const addEdge = (ax, ay, bx, by) => {
    const k = `${ax},${ay}`;
    if (edges.has(k)) edges.set(k, null); // a pinch point: two ways out
    else edges.set(k, [bx, by]);
  };
  for (const c of cells) {
    const x = c % W, y = Math.floor(c / W);
    if (!has(x, y - 1)) addEdge(x + 1, y, x, y);
    if (!has(x - 1, y)) addEdge(x, y, x, y + 1);
    if (!has(x, y + 1)) addEdge(x, y + 1, x + 1, y + 1);
    if (!has(x + 1, y)) addEdge(x + 1, y + 1, x + 1, y);
  }
  if ([...edges.values()].some((v) => v === null)) return null;
  const [sx, sy] = [...edges.keys()][0].split(',').map(Number);
  const loop = [[sx, sy]];
  let [cx, cy] = edges.get(`${sx},${sy}`);
  while ((cx !== sx || cy !== sy) && loop.length <= edges.size) {
    loop.push([cx, cy]);
    const next = edges.get(`${cx},${cy}`);
    if (!next) return null;
    [cx, cy] = next;
  }
  if (loop.length !== edges.size) return null; // a hole or a second loop
  // Corners only, then two rounding points per corner.
  const corners = loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
  if (corners.length < 6) return null; // plain rectangles are dull
  const inset = 0.3 + rng() * 0.08;
  const out = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const a = corners[(i - 1 + n) % n], p = corners[i], b = corners[(i + 1) % n];
    const toward = (q, t) => [p[0] + (q[0] - p[0]) * t / Math.hypot(q[0] - p[0], q[1] - p[1]), p[1] + (q[1] - p[1]) * t / Math.hypot(q[0] - p[0], q[1] - p[1])];
    out.push(toward(a, inset), toward(b, inset));
  }
  const jitter = () => (rng() - 0.5) * 0.12;
  return out.map(([x, y]) => [(x + jitter()) * 900, (y + jitter()) * 900]);
}

// Starts the point list at the middle of its longest gap, so the grid sits
// on a straight.
function rotateToStraight(pts) {
  let best = 0, bestLen = -1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > bestLen) { bestLen = len; best = i; }
  }
  const a = pts[best], b = pts[(best + 1) % pts.length];
  const mid = [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
  return [mid, ...pts.slice(best + 1), ...pts.slice(0, best + 1)];
}

export function dailyTrackDef(key) {
  return generateTrackDef(dailySeed(key), { id: `daily-${key}` });
}

// Records a daily run in the save. Streaks count days in a row; missing a
// day starts a fresh streak (the best is kept) and plays are always counted.
export function recordDaily(save, key, time) {
  const d = save.daily;
  const firstToday = d.day !== key;
  if (firstToday) {
    d.streak = d.lastDay && previousDay(key) === d.lastDay ? d.streak + 1 : 1;
    d.lastDay = key;
    d.plays += 1;
    d.day = key;
    d.best = null;
    d.ghost = null;
    d.medal = 0;
  }
  d.bestStreak = Math.max(d.bestStreak, d.streak);
  const newBest = Number.isFinite(time) && (d.best === null || time < d.best);
  if (newBest) d.best = Math.round(time * 1000) / 1000;
  return { newBest, firstToday, streak: d.streak };
}

// What the title and daily card show about the streak.
export function streakLabel(save, key) {
  const d = save.daily;
  if (d.lastDay === key) return d.streak > 1 ? `${d.streak}-day streak!` : 'Played today';
  if (d.lastDay && previousDay(key) === d.lastDay) return `${d.streak}-day streak · keep it going`;
  return d.plays ? 'A fresh track is waiting' : 'New every day';
}

export const clampStreak = (n) => clamp(n | 0, 0, 100000);
