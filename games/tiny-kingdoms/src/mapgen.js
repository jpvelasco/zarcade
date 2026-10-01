// Deterministic map generator for skirmish, the daily skirmish and most
// campaign maps. Kingdoms sit in rotationally symmetric sectors of an
// ellipse, so every kingdom starts with the same neighbourhood.
import { WORLD_W, WORLD_H, BUILDINGS } from './data.js';
import { makeRng, hashString } from './rng.js';

export const SIZES = {
  small: { name: 'Small', perSector: 3 },
  medium: { name: 'Medium', perSector: 4 },
  large: { name: 'Large', perSector: 5 },
};

const TYPE_WEIGHTS = { cottage: 4, mill: 2.2, tower: 1.4, forge: 1, shrine: 0.8, castle: 0.6 };
const GARRISON = {
  cottage: [6, 12], mill: [12, 20], tower: [12, 18], forge: [10, 16], shrine: [14, 22], castle: [22, 32],
};
const MAX_NODES = 23;
const MIN_GAP = 150;
const CX = WORLD_W / 2, CY = WORLD_H / 2, RX = WORLD_W / 2 - 110, RY = WORLD_H / 2 - 95;

function toXY(rho, theta) {
  return { x: CX + rho * RX * Math.cos(theta), y: CY + rho * RY * Math.sin(theta) };
}

// options:
//   seed, size ('small'|'medium'|'large'), kingdoms (2..4)
//   types: building types neutrals may use
//   neutral: garrison multiplier
//   start: starting troops in each capital, or an array per kingdom
//   center: true to add a big neutral prize in the middle
//   extra: number of starting cottages per kingdom (array per kingdom ok)
//   ensure: building types that must appear
export function generateMap(options = {}) {
  const {
    seed = 1, size = 'medium', kingdoms = 2,
    types = ['cottage', 'mill', 'tower', 'forge', 'shrine', 'castle'],
    neutral = 1, start = 20, center = true, extra = 0, ensure = [],
  } = options;
  const rng = makeRng(seed >>> 0);
  const k = Math.max(2, Math.min(4, kingdoms));
  const per = Math.min(SIZES[size]?.perSector ?? 4, Math.floor((MAX_NODES - k - 1) / k));
  const sym = symmetry(k, rng);
  const pool = types.filter((t) => TYPE_WEIGHTS[t]);
  const pickType = () => {
    const total = pool.reduce((s, t) => s + TYPE_WEIGHTS[t], 0);
    let r = rng() * total;
    for (const t of pool) { r -= TYPE_WEIGHTS[t]; if (r <= 0) return t; }
    return pool[0] || 'cottage';
  };

  // One kingdom's neighbourhood, copied to every kingdom by the symmetry.
  const capital = sym.capital;
  const sector = [];
  const fits = (p) => {
    const imgs = sym.images(p);
    for (const q of imgs) {
      if (q.x < 85 || q.x > WORLD_W - 85 || q.y < 85 || q.y > WORLD_H - 85) return false;
      if (center && Math.hypot(q.x - CX, q.y - CY) < MIN_GAP + 20) return false;
      for (const other of [capital, ...sector]) {
        for (const o of sym.images(other)) if (Math.hypot(q.x - o.x, q.y - o.y) < MIN_GAP) return false;
      }
    }
    // Images of the same point must not crowd each other either.
    for (let i = 0; i < imgs.length; i++) for (let j = i + 1; j < imgs.length; j++) {
      if (Math.hypot(imgs[i].x - imgs[j].x, imgs[i].y - imgs[j].y) < MIN_GAP) return false;
    }
    return true;
  };
  let guard = 0;
  while (sector.length < per && guard++ < 5000) {
    const p = sym.sample();
    if (!fits(p)) continue;
    const type = pickType();
    const [lo, hi] = GARRISON[type];
    // Buildings close to your capital are cheaper to take.
    const near = Math.min(1, Math.hypot(p.x - capital.x, p.y - capital.y) / 700);
    const troops = Math.max(2, Math.round(rng.range(lo, hi) * neutral * (0.55 + 0.7 * near)));
    sector.push({ x: p.x, y: p.y, type, troops });
  }
  sector.sort((a, b) => d2(a, capital) - d2(b, capital));
  // Make sure a newly introduced building type is on the map, in the middle
  // distance where it matters.
  ensure.forEach((type, i) => {
    if (sector.some((s) => s.type === type) || !sector.length) return;
    const s = sector[Math.min(sector.length - 1, 1 + i)];
    const [lo, hi] = GARRISON[type];
    s.type = type;
    s.troops = Math.round(((lo + hi) / 2) * neutral);
  });
  const extras = (i) => (Array.isArray(extra) ? extra[i] || 0 : extra);
  const starts = (i) => (Array.isArray(start) ? start[i] ?? start[0] : start);
  const nodes = [];
  for (let i = 0; i < k; i++) {
    const c = sym.images(capital)[i];
    nodes.push({ x: Math.round(c.x), y: Math.round(c.y), type: 'castle', owner: i + 1, troops: starts(i) });
    sector.forEach((s, j) => {
      const p = sym.images(s)[i];
      const mine = j < extras(i);
      nodes.push({ x: Math.round(p.x), y: Math.round(p.y), type: mine ? 'cottage' : s.type, owner: mine ? i + 1 : 0, troops: mine ? 10 : s.troops });
    });
  }
  if (center) {
    const type = types.includes('castle') ? 'castle' : types.includes('mill') ? 'mill' : 'cottage';
    nodes.push({ x: CX, y: CY, type, owner: 0, troops: Math.round((type === 'castle' ? 40 : 26) * neutral) });
  }
  return { seed: seed >>> 0, nodes, kingdoms: k, size };
}

// Symmetries: two kingdoms mirror through the centre, four mirror across
// both axes (exactly fair); three share an ellipse turned in thirds.
function symmetry(k, rng) {
  if (k === 2) {
    return {
      capital: { x: CX - 0.86 * RX, y: CY + rng.range(-120, 120) },
      sample: () => ({ x: rng.range(90, CX - 40), y: rng.range(90, WORLD_H - 90) }),
      images: (p) => [{ x: p.x, y: p.y }, { x: WORLD_W - p.x, y: WORLD_H - p.y }],
    };
  }
  if (k === 4) {
    return {
      capital: { x: 170, y: 160 },
      sample: () => ({ x: rng.range(90, CX - 40), y: rng.range(90, CY - 40) }),
      images: (p) => [
        { x: p.x, y: p.y }, { x: WORLD_W - p.x, y: WORLD_H - p.y },
        { x: WORLD_W - p.x, y: p.y }, { x: p.x, y: WORLD_H - p.y },
      ],
    };
  }
  const base = Math.PI;
  const wedge = (Math.PI * 2) / k;
  const polar = (x, y) => ({ rho: Math.hypot((x - CX) / RX, (y - CY) / RY), th: Math.atan2((y - CY) / RY, (x - CX) / RX) });
  return {
    capital: toXY(0.86, base),
    sample: () => toXY(rng.range(0.2, 1), base + rng.range(-wedge / 2, wedge / 2)),
    images: (p) => {
      const { rho, th } = polar(p.x, p.y);
      const out = [];
      for (let i = 0; i < k; i++) out.push(toXY(rho, th + i * wedge));
      return out;
    },
  };
}

function d2(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

// Local date key (same day, same skirmish).
export function dateKey(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const PERSONALITY_LIST = ['cautious', 'greedy', 'sneaky'];

// The daily skirmish: map, rivals and their moods all come from the date.
export function dailySetup(key) {
  const seed = hashString(`tiny-kingdoms:${key}`);
  const rng = makeRng(seed);
  const kingdoms = 2 + rng.int(2);
  const size = rng.pick(['small', 'medium', 'large']);
  const rivals = [];
  for (let i = 1; i < kingdoms; i++) rivals.push({ personality: rng.pick(PERSONALITY_LIST), difficulty: 'normal' });
  const map = generateMap({ seed, size, kingdoms });
  return { key, seed, size, kingdoms, rivals, map };
}

// Skirmish: a fresh map from settings and a seed.
export function skirmishSetup({ seed, size = 'medium', rivals = 1, difficulty = 'normal' }) {
  const rng = makeRng(seed ^ 0x1234567);
  const list = [];
  for (let i = 0; i < rivals; i++) list.push({ personality: rng.pick(PERSONALITY_LIST), difficulty });
  const map = generateMap({ seed, size, kingdoms: rivals + 1 });
  return { seed, size, rivals: list, difficulty, map };
}

// Building letters for keyboard play: left to right, skipping H, M, P.
export const LETTERS = 'ABCDEFGIJKLNOQRSTUVWXYZ';
export function labelNodes(nodes) {
  const order = nodes.map((n, i) => i).sort((a, b) => (nodes[a].x - nodes[b].x) || (nodes[a].y - nodes[b].y));
  const labels = new Array(nodes.length);
  order.forEach((idx, i) => { labels[idx] = LETTERS[i] || ''; });
  return labels;
}

export function buildingRadius(type) {
  return BUILDINGS[type].r;
}
