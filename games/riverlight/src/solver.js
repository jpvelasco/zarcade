// A constraint solver for Riverlight gardens. DOM-free.
//
// Variables are rotation groups: a lone stone, or twin stones that always
// turn together. Locked stones have a single value. A garden is complete
// only when every stone is wet with nothing spilling, so in any solution
// every open side meets an open side: that is the constraint we propagate
// (arc consistency). Every generated garden is a forest with one spring per
// tree, so any solution with a closed loop leaves a stone dry or mixes
// colours; loops are pruned early. Full assignments are confirmed with the
// real water simulation.
import { rotMask, popcount } from './topology.js';
import { simulate } from './flow.js';

// Rotation groups for a puzzle: groupOf[i] (-1 for empty), members[g],
// fixed[g] (locked).
export function buildGroups(puzzle) {
  const { topo, tiles } = puzzle;
  const groupOf = new Int16Array(topo.count).fill(-1);
  const members = [];
  const fixed = [];
  const pairIds = new Map();
  for (let i = 0; i < topo.count; i++) {
    const t = tiles[i];
    if (!t) continue;
    if (t.group != null && t.group >= 0 && !t.locked) {
      if (!pairIds.has(t.group)) {
        pairIds.set(t.group, members.length);
        members.push([]);
        fixed.push(false);
      }
      const g = pairIds.get(t.group);
      groupOf[i] = g;
      members[g].push(i);
    } else {
      groupOf[i] = members.length;
      members.push([i]);
      fixed.push(!!t.locked);
    }
  }
  return { groupOf, members, fixed };
}

// What a tile looks like at rotation k: its open sides plus, for gates, the
// entry side. Two rotations with the same signature are the same state.
export function signature(tile, k, n) {
  const m = rotMask(tile.mask, k, n);
  if (tile.kind !== 'gate') return m;
  return m | ((((tile.inDir + k) % n) + 1) << 8);
}

// Values of group g that give distinct states, as a bitmask.
export function distinctValues(puzzle, members, g) {
  const n = puzzle.topo.n;
  const seen = new Set();
  let dom = 0;
  for (let k = 0; k < n; k++) {
    const key = members[g].map((i) => signature(puzzle.tiles[i], k, n)).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    dom |= 1 << k;
  }
  return dom;
}

export function solve(puzzle, { cap = 2, budget = 150000 } = {}) {
  const { topo, tiles } = puzzle;
  const { n, half, count, nbr } = topo;
  const { groupOf, members, fixed } = buildGroups(puzzle);
  const G = members.length;
  const pm = new Uint8Array(count * n);
  for (let i = 0; i < count; i++) {
    if (!tiles[i]) continue;
    for (let k = 0; k < n; k++) pm[i * n + k] = rotMask(tiles[i].mask, k, n);
  }
  const groupNbrs = members.map((list, g) => {
    const set = new Set();
    for (const i of list) {
      for (let d = 0; d < n; d++) {
        const j = nbr[i * n + d];
        if (j >= 0 && groupOf[j] >= 0 && groupOf[j] !== g) set.add(groupOf[j]);
      }
    }
    return [...set];
  });
  const start = new Uint8Array(G);
  for (let g = 0; g < G; g++) start[g] = fixed[g] ? 1 : distinctValues(puzzle, members, g);

  // Bits: 1 = side can be closed, 2 = side can be open.
  function possible(dom, j, side) {
    const dj = dom[groupOf[j]];
    let bits = 0;
    for (let k = 0; k < n; k++) {
      if (!(dj & (1 << k))) continue;
      bits |= (pm[j * n + k] >> side) & 1 ? 2 : 1;
      if (bits === 3) break;
    }
    return bits;
  }

  function valid(dom, g, k) {
    for (const i of members[g]) {
      const m = pm[i * n + k];
      for (let d = 0; d < n; d++) {
        const p = (m >> d) & 1;
        const j = nbr[i * n + d];
        if (j < 0 || !tiles[j]) {
          if (p) return false;
          continue;
        }
        const od = (d + half) % n;
        if (groupOf[j] === g) {
          if (((pm[j * n + k] >> od) & 1) !== p) return false;
        } else if (!(possible(dom, j, od) & (p ? 2 : 1))) {
          return false;
        }
      }
    }
    return true;
  }

  function propagate(dom, queue) {
    const inQueue = new Uint8Array(G);
    for (const g of queue) inQueue[g] = 1;
    while (queue.length) {
      const g = queue.pop();
      inQueue[g] = 0;
      let next = 0;
      for (let k = 0; k < n; k++) if (dom[g] & (1 << k) && valid(dom, g, k)) next |= 1 << k;
      if (!next) return false;
      if (next !== dom[g]) {
        dom[g] = next;
        for (const h of groupNbrs[g]) {
          if (!inQueue[h]) {
            inQueue[h] = 1;
            queue.push(h);
          }
        }
      }
    }
    return true;
  }

  const parent = new Int16Array(count * 3);
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  function certainPort(dom, i, d) {
    const di = dom[groupOf[i]];
    for (let k = 0; k < n; k++) if (di & (1 << k) && !((pm[i * n + k] >> d) & 1)) return false;
    return true;
  }
  function hasLoop(dom) {
    for (let a = 0; a < parent.length; a++) parent[a] = a;
    for (let i = 0; i < count; i++) {
      if (!tiles[i]) continue;
      const bridgeI = tiles[i].kind === 'bridge';
      for (let d = 0; d < n; d++) {
        const j = nbr[i * n + d];
        if (j < 0 || j <= i || !tiles[j]) continue;
        const od = (d + half) % n;
        if (!certainPort(dom, i, d) || !certainPort(dom, j, od)) continue;
        const a = find(i * 3 + (bridgeI ? d % half : 0));
        const b = find(j * 3 + (tiles[j].kind === 'bridge' ? od % half : 0));
        if (a === b) return true;
        parent[a] = b;
      }
    }
    return false;
  }

  const solutions = [];
  let nodes = 0;
  let aborted = false;
  const rots = new Int8Array(count);

  function search(dom, queue) {
    if (aborted || solutions.length >= cap) return;
    if (++nodes > budget) {
      aborted = true;
      return;
    }
    if (!propagate(dom, queue)) return;
    if (hasLoop(dom)) return;
    let pick = -1;
    let best = 99;
    for (let g = 0; g < G; g++) {
      const size = popcount(dom[g]);
      if (size > 1 && size < best) {
        best = size;
        pick = g;
      }
    }
    if (pick < 0) {
      for (let g = 0; g < G; g++) {
        const k = 31 - Math.clz32(dom[g]);
        for (const i of members[g]) rots[i] = k;
      }
      if (simulate(puzzle, rots).solved) solutions.push(Array.from(rots));
      return;
    }
    for (let k = 0; k < n; k++) {
      if (!(dom[pick] & (1 << k))) continue;
      const next = dom.slice();
      next[pick] = 1 << k;
      search(next, [...groupNbrs[pick]]);
      if (aborted || solutions.length >= cap) return;
    }
  }

  search(start.slice(), Array.from({ length: G }, (_, g) => g));
  return { count: solutions.length, solutions, complete: !aborted, nodes };
}
