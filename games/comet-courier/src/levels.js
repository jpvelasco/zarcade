// Deterministic level content. Each level is generated from a seeded RNG, so
// the same index (or date seed) always builds the same panel. From world 2 up
// the star sits in a small guarded cup: walls with a single offset gap, so a
// straight shot hits a wall and the comet must be placed, then eased in. A
// layout is shipped only when the solver solves it inside the world's par
// window, which proves every level is solvable.
import { FIELD, STAR, LEVELS_PER_WORLD, LEVEL_COUNT } from './config.js';
import { mulberry32, clamp } from './math.js';
import { solve } from './solver.js';

const CELL = 20;
const MAX_ATTEMPTS = 60;
// Par window per world: world 1 is the friendly tutorial (open star), the cup
// worlds sit around par 2 with a detour; the late worlds drift to par 3 as
// wind, springs and portals stack up.
const MIN_PAR = [1, 2, 2, 2, 2];
const MAX_PAR = 4;
// The star's cup: wall thickness and half of the pocket the star sits in.
const CUP = { t: 20, s: 40, gapW: 48 };

// Deterministic seed fold; the daily challenge feeds a date-seeded value.
function foldSeed(index, salt = 0) {
  return ((0x9e3779b9 ^ Math.imul(index + 1 + salt * 7919, 2654435761)) >>> 0) & 0x7fffffff;
}

function starFree(level, x, y, margin) {
  if (x < STAR.r + margin || x > FIELD.w - STAR.r - margin || y < STAR.r + margin || y > FIELD.h - STAR.r - margin) return false;
  for (const b of level.blocks) {
    if (x > b.x - margin && x < b.x + b.w + margin && y > b.y - margin && y < b.y + b.h + margin) return false;
  }
  for (const a of level.asteroids) {
    if (Math.hypot(x - a.x, y - a.y) < a.r + STAR.r + margin) return false;
  }
  return true;
}

// A point of free sky, away from the star and (if given) the spawn pocket.
// The margin keeps the spot clear of blocks, the cup and other obstacles.
function freeSpot(level, rng, margin = 44, spawn = null) {
  for (let i = 0; i < 400; i++) {
    const x = Math.round((40 + rng() * (FIELD.w - 80)) / CELL) * CELL;
    const y = Math.round((40 + rng() * (FIELD.h - 80)) / CELL) * CELL;
    if (Math.hypot(x - level.star.x, y - level.star.y) < STAR.r + 60) continue;
    if (spawn && Math.hypot(x - spawn.x, y - spawn.y) < 40) continue;
    if (!starFree(level, x, y, margin)) continue;
    return { x, y };
  }
  return null;
}

// Count solid colliders overlapping the rectangle; the spawn must stay clear.
function blocked(level, x, y, w, hh) {
  let n = 0;
  for (const b of level.blocks) {
    if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + hh > b.y) n++;
  }
  for (const a of level.asteroids) {
    const cx = clamp(a.x, x, x + w);
    const cy = clamp(a.y, y, y + hh);
    if (Math.hypot(a.x - cx, a.y - cy) < a.r) n++;
  }
  return n;
}

function pickSpawn(level, rng) {
  const candidates = [];
  for (const x of [70, 270, 470]) {
    for (const y of [120, 360, 600]) candidates.push({ x, y });
  }
  candidates.sort(() => rng() - 0.5);
  for (const c of candidates) {
    if (Math.hypot(c.x - level.star.x, c.y - level.star.y) < 200) continue;
    if (blocked(level, c.x - 14, c.y - 14, 28, 28) === 0) return { x: c.x, y: c.y };
  }
  return { x: 70, y: 600 };
}

// The pocket side the spawn sits on, so the cup's gap can face away from it.
function spawnSide(star, spawn) {
  const dx = spawn.x - star.x;
  const dy = spawn.y - star.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 2 : 3; // E : W
  return dy > 0 ? 1 : 0; // S : N
}

function randDir(rng) {
  const dirs = [
    { nx: 1, ny: 0 },
    { nx: -1, ny: 0 },
    { nx: 0, ny: 1 },
    { nx: 0, ny: -1 },
  ];
  return dirs[Math.floor(rng() * 4)];
}

// Guard the star with a pocket: three full walls and one side split into two
// stubs leaving a single gap. The gap is offset from the side's centre so a
// dead-centre approach still hits a wall.
function buildCup(level, gap, gapOff) {
  const { t, s, gapW } = CUP;
  const { x, y } = level.star;
  const push = (bx, by, bw, bh) => level.blocks.push({ x: Math.round(bx), y: Math.round(by), w: Math.round(bw), h: Math.round(bh) });
  const fullWall = (i) => {
    if (i === 0) push(x - s, y - s - t, 2 * s, t); // N
    if (i === 1) push(x - s, y + s, 2 * s, t); // S
    if (i === 2) push(x + s, y - s, t, 2 * s); // E
    if (i === 3) push(x - s - t, y - s, t, 2 * s); // W
  };
  for (let i = 0; i < 4; i++) {
    if (i !== gap) {
      fullWall(i);
      continue;
    }
    // Gap side: two stubs around the gap.
    const half = s;
    const lo = clamp(gapOff - gapW / 2, 0, 2 * half - gapW);
    const add = (a, b) => {
      if (b - a < 10) return;
      if (i < 2) {
        const yy = i === 0 ? y - s - t : y + s;
        push(x - half + a, yy, b - a, t);
      } else {
        const xx = i === 2 ? x + s : x - s - t;
        push(xx, y - half + a, t, b - a);
      }
    };
    add(0, lo);
    add(lo + gapW, 2 * half);
  }
}

// The full builder. Seeded, so the same (seed, world, posInWorld) always
// ships the same panel; `seed` lets the daily challenge reuse it with a date
// seed. Returns a plain level definition (no name/index — the caller labels).
export function buildLevelFor(seed, world, posInWorld) {
  const rng = mulberry32(seed);
  const level = { blocks: [], asteroids: [], winds: [], springs: [], portals: [], star: { x: 270, y: 200 } };
  const margin = CUP.s + CUP.t + 24;

  // World 0 stays a friendly open star; later worlds cup it.
  if (world === 0) {
    level.star = { x: Math.round((160 + rng() * (FIELD.w - 320)) / CELL) * CELL, y: Math.round((100 + rng() * 160) / CELL) * CELL };
  } else {
    level.star = {
      x: Math.round((margin + rng() * (FIELD.w - 2 * margin)) / CELL) * CELL,
      y: Math.round((margin + rng() * (FIELD.h - 2 * margin)) / CELL) * CELL,
    };
  }

  const spawn = pickSpawn(level, rng);
  level.spawn = spawn;

  // Cup the star, gap facing away from the spawn so a straight shot hits a
  // wall and the comet must be placed, then eased in.
  if (world > 0) {
    const facing = spawnSide(level.star, spawn); // side the spawn sits on
    const gap = (facing + 2) % 4; // opposite side
    const gapOff = Math.round((rng() * 2 - 1) * 14);
    buildCup(level, gap, gapOff);
  }

  // Extra blocks (world 0: none, the tutorial line must stay open). The
  // position is the block's top-left, clamped so the box never leaves the
  // field.
  const nBlocks = world === 0 ? 0 : 1 + world;
  for (let i = 0; i < nBlocks; i++) {
    const s = freeSpot(level, rng, 44, spawn);
    if (!s) continue;
    const w = CELL * (2 + Math.floor(rng() * 3));
    const hh = CELL * (1 + Math.floor(rng() * 2));
    let bx = clamp(s.x, 0, FIELD.w - w);
    let by = clamp(s.y, 0, FIELD.h - hh);
    level.blocks.push({ x: Math.round(bx), y: Math.round(by), w, h: hh });
  }

  const nAst = world >= 1 ? 1 + Math.floor(world / 1.5) + (posInWorld >= 4 ? 1 : 0) : 0;
  for (let i = 0; i < nAst; i++) {
    const r = 22 + Math.floor(rng() * 16);
    const s = freeSpot(level, rng, r + CUP.s + CUP.t + 10, spawn);
    if (!s) continue;
    level.asteroids.push({ x: s.x, y: s.y, r });
  }

  if (world >= 2) {
    const s = freeSpot(level, rng, CUP.s + CUP.t + 10, spawn);
    if (s) {
      const dir = randDir(rng);
      level.winds.push({ x: s.x - 120, y: s.y - 120, w: 240, h: 240, vx: dir.nx * 420, vy: dir.ny * 420 });
    }
  }

  if (world >= 3) {
    const s = freeSpot(level, rng, CUP.s + CUP.t + 10, spawn);
    if (s) {
      const dir = randDir(rng);
      level.springs.push({ x: s.x - 40, y: s.y - 40, w: 80, h: 80, nx: dir.nx, ny: dir.ny });
    }
  }

  if (world >= 4) {
    const a = freeSpot(level, rng, CUP.s + CUP.t + 10, spawn);
    const b = freeSpot(level, rng, CUP.s + CUP.t + 10, spawn);
    if (a && b && Math.hypot(a.x - b.x, a.y - b.y) > 240) level.portals.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
  }

  return { index: world * LEVELS_PER_WORLD + posInWorld, world, star: { ...level.star }, spawn, blocks: level.blocks, asteroids: level.asteroids, winds: level.winds, springs: level.springs, portals: level.portals };
}

// Build one named level definition (plain object). `index` is 0-based.
export function buildLevel(index, attempt = 0) {
  const def = buildLevelFor(foldSeed(index, attempt), Math.floor(index / LEVELS_PER_WORLD), index % LEVELS_PER_WORLD);
  return { ...def, name: levelLabel(index) };
}

// Generate until the solver solves the layout inside the world's par window.
// Deterministic: attempts are seeded, so the same index always ships the same
// panel. Returns the first in-window layout; otherwise the lowest-par one
// found; throws if none is solvable.
export function buildSolved(index) {
  const minPar = MIN_PAR[Math.floor(index / LEVELS_PER_WORLD)];
  let fallback = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const def = buildLevel(index, attempt);
    const res = solve(def, def.spawn);
    if (!res) continue;
    if (res.par >= minPar && res.par <= MAX_PAR) return { ...def, par: res.par, line: res.line };
    if (!fallback || res.par < fallback.res.par) fallback = { def, res };
  }
  if (fallback) return { ...fallback.def, par: fallback.res.par, line: fallback.res.line };
  throw new Error(`comet-courier level ${index + 1} unsolvable`);
}

export { LEVEL_COUNT, LEVELS_PER_WORLD } from './config.js';

export const worldOf = (index) => Math.floor(index / LEVELS_PER_WORLD);
export const levelLabel = (index) => `${worldOf(index) + 1}-${(index % LEVELS_PER_WORLD) + 1}`;
export const isUnlocked = (save, index) => index <= save.unlocked;

export const LEVELS = Array.from({ length: LEVEL_COUNT }, (_, i) => {
  const built = buildSolved(i);
  return { ...built, index: i, name: levelLabel(i) };
});
