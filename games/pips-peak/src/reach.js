// A coarse "can Pip get there?" checker for hand-authored levels.
//
// This is deliberately not a physics simulation. It walks a graph of standable
// tiles using a generous jump envelope, which is enough to catch the mistakes
// that actually happen when authoring ASCII levels: a sealed chimney, an
// island with no way on, a seed floating out past any jump.
//
// Pure module: used by the level tests and by the in-game `?reach` overlay.

import { DOOR, MUSHROOM, SWITCH, isBlocking, isHazard, isPlatform } from './tiles.js';
import { abilitiesFor } from './levels.js';

const key = (r, c) => `${r},${c}`;

function parse(level) {
  const rows = level.tiles;
  const height = rows.length;
  const width = rows[0].length;
  const at = (r, c) => (r < 0 || r >= height || c < 0 || c >= width ? '#' : rows[r][c]);
  return { rows, width, height, at };
}

/** A tile Pip can occupy. Gates only block while their latches are unpressed. */
function passableWith(ch, gatesOpen) {
  if (ch === DOOR) return !!gatesOpen;
  return !isBlocking(ch);
}

function standable(grid, r, c, passable) {
  if (!passable(grid.at(r, c)) || isHazard(grid.at(r, c))) return false;
  const below = grid.at(r + 1, c);
  return isBlocking(below) || isPlatform(below);
}

/**
 * True inside a chimney: walls close enough on both sides that Pip can kick
 * back and forth between them. Those cells act as perches for the flood.
 */
function inChimney(grid, r, c, reach = 5) {
  let left = false;
  let right = false;
  for (let d = 1; d <= reach && !left; d += 1) if (isBlocking(grid.at(r, c - d))) left = true;
  for (let d = 1; d <= reach && !right; d += 1) if (isBlocking(grid.at(r, c + d))) right = true;
  return left && right;
}

/** Sample an L-shaped flight path: up, across, then down. */
function pathClear(grid, passable, from, to, extra = 0) {
  const peak = Math.min(from.r, to.r) - extra;
  for (let r = from.r; r >= peak; r -= 1) if (!passable(grid.at(r, from.c))) return false;
  const step = to.c >= from.c ? 1 : -1;
  for (let c = from.c; c !== to.c + step; c += step) if (!passable(grid.at(peak, c))) return false;
  for (let r = peak; r <= to.r; r += 1) if (!passable(grid.at(r, to.c))) return false;
  return true;
}

/**
 * Flood the level from the start tile.
 *
 * Returns `{ nodes, air, start, missing }` where `nodes` is the set of
 * standable tiles Pip can get to, `air` is every tile he can pass through on
 * the way, and `missing` lists any required marker that is out of reach.
 */
export function reachable(level, options = {}) {
  const gatesOpen = options.gatesOpen !== false;
  const passable = (ch) => passableWith(ch, gatesOpen);
  const grid = parse(level);
  const abilities = abilitiesFor(level);
  const maxUp = abilities.doubleJump ? 5 : 3;
  const maxAcross = abilities.doubleJump ? 8 : 6;

  const boosts = new Set(); // cells sitting on a mushroom: a huge launch
  const nodes = [];
  for (let r = 0; r < grid.height; r += 1) {
    for (let c = 0; c < grid.width; c += 1) {
      if (!standable(grid, r, c, passable)) continue;
      nodes.push({ r, c });
      if (grid.at(r + 1, c) === MUSHROOM) boosts.add(key(r, c));
    }
  }
  if (abilities.wallJump) {
    for (let r = 0; r < grid.height; r += 1) {
      for (let c = 0; c < grid.width; c += 1) {
        if (!passable(grid.at(r, c)) || isHazard(grid.at(r, c))) continue;
        if (inChimney(grid, r, c)) nodes.push({ r, c });
      }
    }
  }
  // Moving platforms and updrafts: treat their span as standable and as a
  // shortcut between their two extremes.
  const bridges = [];
  for (const m of level.movers || []) {
    const ends = [
      { r: Math.round(m.y) - 1, c0: Math.round(m.x), c1: Math.round(m.x + (m.w || 2)) },
      { r: Math.round(m.y + (m.dy || 0)) - 1, c0: Math.round(m.x + (m.dx || 0)), c1: Math.round(m.x + (m.dx || 0) + (m.w || 2)) },
    ];
    const cells = [];
    for (const end of ends) {
      for (let c = end.c0; c <= end.c1; c += 1) {
        if (passable(grid.at(end.r, c))) cells.push({ r: end.r, c });
      }
    }
    bridges.push(cells);
    nodes.push(...cells);
  }
  for (const w of level.winds || []) {
    // An updraft lets Pip hover: every free column inside it becomes a node.
    if ((w.ay || 0) > -200) continue;
    for (let c = Math.round(w.x); c < Math.round(w.x + w.w); c += 1) {
      for (let r = Math.round(w.y); r < Math.round(w.y + w.h); r += 1) {
        if (passable(grid.at(r, c))) nodes.push({ r, c });
      }
    }
  }

  const index = new Map();
  for (const n of nodes) if (!index.has(key(n.r, n.c))) index.set(key(n.r, n.c), n);
  const all = [...index.values()];

  let start = null;
  for (let r = 0; r < grid.height; r += 1) {
    for (let c = 0; c < grid.width; c += 1) if (grid.at(r, c) === 'S') start = { r, c };
  }
  if (!start) return { nodes: new Set(), air: new Set(), start: null, missing: ['start'] };

  const startNode = index.get(key(start.r, start.c)) || start;
  const seen = new Set([key(startNode.r, startNode.c)]);
  const air = new Set();
  const queue = [startNode];

  const markAir = (from, to) => {
    const peak = Math.min(from.r, to.r);
    for (let r = from.r; r >= peak; r -= 1) air.add(key(r, from.c));
    const step = to.c >= from.c ? 1 : -1;
    // A real jump arcs above the straight line, so credit a couple of rows of
    // headroom along the way: that is where seeds get placed.
    for (let arc = 0; arc <= 2; arc += 1) {
      for (let c = from.c; c !== to.c + step; c += step) {
        if (!passable(grid.at(peak - arc, c))) break;
        air.add(key(peak - arc, c));
      }
    }
    for (let r = peak; r <= to.r; r += 1) air.add(key(r, to.c));
  };

  while (queue.length) {
    const from = queue.pop();
    air.add(key(from.r, from.c));
    const up = boosts.has(key(from.r, from.c)) ? (abilities.doubleJump ? 10 : 8) : maxUp;
    // Everything straight overhead within jump range is touchable.
    for (let r = from.r; r >= from.r - up; r -= 1) {
      if (!passable(grid.at(r, from.c))) break;
      air.add(key(r, from.c));
    }
    for (const to of all) {
      const id = key(to.r, to.c);
      if (seen.has(id)) continue;
      const dr = from.r - to.r; // >0 means climbing
      const dc = Math.abs(to.c - from.c);
      let ok = false;
      if (dr >= 0) {
        const budget = Math.max(2, maxAcross - Math.max(0, dr - 1));
        ok = dr <= up && dc <= budget;
      } else {
        ok = dc <= maxAcross + Math.min(8, -dr);
      }
      // Try an arcing flight first, then a flat one (walking under an overhang).
      if (!ok) continue;
      if (!pathClear(grid, passable, from, to, dr >= 0 ? 1 : 0) && !pathClear(grid, passable, from, to, 0)) continue;
      seen.add(id);
      markAir(from, to);
      queue.push(to);
    }
    for (const cells of bridges) {
      if (!cells.some((cell) => seen.has(key(cell.r, cell.c)))) continue;
      for (const cell of cells) {
        const id = key(cell.r, cell.c);
        if (seen.has(id)) continue;
        seen.add(id);
        air.add(id);
        queue.push(cell);
      }
    }
  }

  // Anything a player has to touch must sit in a tile we can pass through.
  const missing = [];
  for (let r = 0; r < grid.height; r += 1) {
    for (let c = 0; c < grid.width; c += 1) {
      const ch = grid.at(r, c);
      const wanted = gatesOpen ? 'Gfo@!' : SWITCH;
      if (wanted.includes(ch) && !air.has(key(r, c))) missing.push(`${ch} at ${c},${r}`);
    }
  }
  return { nodes: seen, air, start, missing };
}

/** Level drawn as text with `+` on reachable tiles: handy while authoring. */
export function reachOverlay(level, options) {
  const { air } = reachable(level, options);
  return level.tiles
    .map((row, r) => row.split('').map((ch, c) => (ch === ' ' && air.has(key(r, c)) ? '+' : ch)).join(''))
    .join('\n');
}
