// Special jellies: what they clear, and what happens when two meet.
import { isJelly, isMatchable, STRIPE_H, STRIPE_V, BOMB, RAINBOW } from './board.js';

export const CROSS = 'cross';       // stripe + stripe
export const BIG_CROSS = 'bigCross'; // bomb + stripe
export const MEGA = 'mega';         // bomb + bomb
export const WHOLE = 'whole';       // pearl + pearl

// Only the two-special combos get a banner; a lone special firing is quiet.
export const SPECIAL_LABELS = {
  [RAINBOW]: 'Rainbow pearl!',
  [CROSS]: 'Double stripe!',
  [BIG_CROSS]: 'Bomb stripe!',
  [MEGA]: 'Mega bubble!',
  [WHOLE]: 'Pearl storm!',
  pearlStripe: 'Pearl stripes!',
  pearlBomb: 'Pearl bombs!',
};

export function dominantColor(board, rng) {
  const counts = new Array(board.colors).fill(0);
  for (const i of board.playableIndices()) {
    const cell = board.at(i);
    if (isMatchable(cell)) counts[cell.color]++;
  }
  const best = Math.max(...counts);
  if (best === 0) return rng ? rng.int(board.colors) : 0;
  const tied = counts.map((n, k) => (n === best ? k : -1)).filter((k) => k >= 0);
  return rng ? rng.pick(tied) : tied[0];
}

function box(board, i, radius) {
  const out = [];
  const c0 = board.col(i), r0 = board.row(i);
  for (let r = r0 - radius; r <= r0 + radius; r++) {
    for (let c = c0 - radius; c <= c0 + radius; c++) {
      if (!board.inside(c, r)) continue;
      const j = board.idx(c, r);
      if (board.playable(j)) out.push(j);
    }
  }
  return out;
}

function band(board, i, { rows = 0, cols = 0, row = false, col = false }) {
  const out = new Set();
  const c0 = board.col(i), r0 = board.row(i);
  if (row) for (let dr = -rows; dr <= rows; dr++) {
    for (let c = 0; c < board.w; c++) if (board.inside(c, r0 + dr) && board.playable(board.idx(c, r0 + dr))) out.add(board.idx(c, r0 + dr));
  }
  if (col) for (let dc = -cols; dc <= cols; dc++) {
    for (let r = 0; r < board.h; r++) if (board.inside(c0 + dc, r) && board.playable(board.idx(c0 + dc, r))) out.add(board.idx(c0 + dc, r));
  }
  return [...out];
}

// The cells a single blast touches.
export function areaFor(board, index, kind, color = null) {
  switch (kind) {
    case STRIPE_H: return band(board, index, { row: true });
    case STRIPE_V: return band(board, index, { col: true });
    case BOMB: return box(board, index, 1);
    case CROSS: return band(board, index, { row: true, col: true });
    case BIG_CROSS: return band(board, index, { row: true, col: true, rows: 1, cols: 1 });
    case MEGA: return box(board, index, 2);
    case WHOLE: return board.playableIndices();
    case RAINBOW: {
      const out = board.playableIndices().filter((j) => {
        const cell = board.at(j);
        return isMatchable(cell) && cell.color === color;
      });
      if (!out.includes(index)) out.push(index);
      return out;
    }
    default: return [index];
  }
}

// Fires the given seeds, chaining into any specials caught in the blasts.
export function detonate(board, seeds, { rng = board.rng } = {}) {
  const hits = new Set();
  const blasts = [];
  const fired = new Set();
  const queue = seeds.slice();
  let guard = 0;
  while (queue.length && guard++ < 400) {
    const seed = queue.shift();
    // A combo uses up its partner special, so it must not fire again.
    if (seed.spent !== undefined) fired.add(seed.spent);
    if (seed.index >= 0) {
      if (fired.has(seed.index)) continue;
      fired.add(seed.index);
    }
    const color = seed.color ?? dominantColor(board, rng);
    const cells = areaFor(board, seed.index, seed.kind, color);
    blasts.push({ index: seed.index, kind: seed.kind, color, cells });
    for (const j of cells) {
      hits.add(j);
      const cell = board.at(j);
      if (j !== seed.index && isJelly(cell) && cell.special && cell.ice === 0 && !fired.has(j)) {
        queue.push({ index: j, kind: cell.special, color: cell.color ?? undefined });
      }
    }
  }
  return { hits: [...hits].sort((a, b) => a - b), blasts };
}

// Works out what a swap involving at least one special should fire.
// `transforms` must be written into the board before detonating.
export function swapBlast(board, a, b, { rng = board.rng } = {}) {
  const ca = board.at(a), cb = board.at(b);
  const sa = isJelly(ca) ? ca.special : null;
  const sb = isJelly(cb) ? cb.special : null;
  if (!sa && !sb) return null;
  const stripe = (s) => s === STRIPE_H || s === STRIPE_V;

  if (sa === RAINBOW && sb === RAINBOW) {
    return { kind: WHOLE, seeds: [{ index: b, kind: WHOLE, spent: a }], transforms: [] };
  }
  const pearl = sa === RAINBOW ? a : sb === RAINBOW ? b : -1;
  if (pearl >= 0) {
    const otherIdx = pearl === a ? b : a;
    const other = board.at(otherIdx);
    const otherSpecial = pearl === a ? sb : sa;
    if (otherSpecial && other.color !== null) {
      // Pearl + striped/bomb: every jelly of that color becomes one and fires.
      const targets = board.playableIndices().filter((j) => {
        const cell = board.at(j);
        return isMatchable(cell) && cell.color === other.color && j !== pearl;
      });
      const transforms = targets.map((j, k) => ({
        index: j,
        special: otherSpecial === BOMB ? BOMB : k % 2 ? STRIPE_V : STRIPE_H,
      }));
      const seeds = transforms.map((t) => ({ index: t.index, kind: t.special, color: other.color }));
      seeds.push({ index: pearl, kind: RAINBOW, color: other.color });
      return { kind: otherSpecial === BOMB ? 'pearlBomb' : 'pearlStripe', seeds, transforms };
    }
    const color = other && other.color !== null ? other.color : dominantColor(board, rng);
    return { kind: RAINBOW, seeds: [{ index: pearl, kind: RAINBOW, color }], transforms: [] };
  }
  if (stripe(sa) && stripe(sb)) return { kind: CROSS, seeds: [{ index: b, kind: CROSS, spent: a }], transforms: [] };
  if (sa === BOMB && sb === BOMB) return { kind: MEGA, seeds: [{ index: b, kind: MEGA, spent: a }], transforms: [] };
  if ((sa === BOMB && stripe(sb)) || (sb === BOMB && stripe(sa))) {
    return { kind: BIG_CROSS, seeds: [{ index: b, kind: BIG_CROSS, spent: a }], transforms: [] };
  }
  // A special swapped with a plain jelly simply goes off where it lands.
  const solo = sa ? a : b;
  const cell = board.at(solo);
  return { kind: cell.special, seeds: [{ index: solo, kind: cell.special, color: cell.color ?? undefined }], transforms: [] };
}
