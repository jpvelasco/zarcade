// Seeded garden generator. DOM-free and deterministic: the same spec and
// seed always give the same garden and the same scramble.
//
// spec: {
//   seed, topo: { kind, w, h, wrap?, shape?, hexRadius? },
//   size,            stones to grow (ignored for full shapes)
//   fill,            grow until every active cell is used (showpieces)
//   flowers: [min, max], snake (0..1: prefer extending the newest stone),
//   maxDeg, springDeg, spring?: cell index,
//   bridges, gates, locks, pairs,
//   mode: 'single' | 'two' | 'mix',  mix: { g, b, y } stones per colour
//   repairLocks,     add locks to make the solution unique
// }
import { Rng } from './rng.js';
import { makeTopology, rotMask, popcount } from './topology.js';
import { simulate } from './flow.js';
import { solve, buildGroups, signature } from './solver.js';

const FREE = 0;
const USED = 1;
const BLOCK = 2;
const BRIDGE = 3;

function makeGrower(topo, rng, opts) {
  const { n, half, count, nbr, active } = topo;
  const state = new Uint8Array(count);
  for (let i = 0; i < count; i++) if (!active[i]) state[i] = BLOCK;
  const mask = new Uint8Array(count);
  const parentDir = new Int8Array(count).fill(-1);
  const axisUsed = new Uint8Array(count);
  const treeOf = new Int8Array(count).fill(-1);
  const trees = [];

  function maxDegFor(tree, i) {
    return i === tree.root ? opts.springDeg ?? opts.maxDeg : opts.maxDeg;
  }

  function moves(tree, a) {
    const out = [];
    if (popcount(mask[a]) >= maxDegFor(tree, a)) return out;
    for (let d = 0; d < n; d++) {
      if (mask[a] & (1 << d)) continue;
      const b = nbr[a * n + d];
      if (b < 0) continue;
      if (state[b] === FREE) {
        out.push(d);
      } else if (state[b] === BRIDGE) {
        const axis = d % half;
        if (axisUsed[b] & (1 << axis)) continue;
        const c = nbr[b * n + d];
        if (c >= 0 && state[c] === FREE) out.push(d);
      }
    }
    return out;
  }

  function attach(tree, i) {
    state[i] = USED;
    treeOf[i] = tree.id;
    tree.nodes.push(i);
    tree.open.push(i);
    tree.last = i;
  }

  function addTree(root) {
    const tree = { id: trees.length, root, nodes: [], open: [], last: root };
    trees.push(tree);
    attach(tree, root);
    return tree;
  }

  function link(a, d, b) {
    const od = (d + half) % n;
    mask[a] |= 1 << d;
    mask[b] |= 1 << od;
  }

  // One stone (or a bridge crossing plus the stone beyond it) onto a tree.
  function step(tree) {
    for (let tries = 0; tries < 400 && tree.open.length; tries++) {
      let a;
      if (rng.next() < (opts.snake ?? 0.5) && tree.open.includes(tree.last)) a = tree.last;
      else a = tree.open[rng.int(tree.open.length)];
      const options = moves(tree, a);
      if (!options.length) {
        tree.open.splice(tree.open.indexOf(a), 1);
        continue;
      }
      // Crossing a waiting bridge is preferred, so bridges get both streams.
      const crossings = options.filter((d) => state[nbr[a * n + d]] === BRIDGE);
      const d = crossings.length && rng.next() < 0.85 ? rng.pick(crossings) : rng.pick(options);
      const b = nbr[a * n + d];
      if (state[b] === BRIDGE) {
        const c = nbr[b * n + d];
        link(a, d, b);
        link(b, d, c);
        axisUsed[b] |= 1 << (d % half);
        parentDir[c] = (d + half) % n;
        attach(tree, c);
        return true;
      }
      link(a, d, b);
      parentDir[b] = (d + half) % n;
      attach(tree, b);
      return true;
    }
    return false;
  }

  return { state, mask, parentDir, axisUsed, treeOf, trees, addTree, step, link, moves };
}

function pickBridges(topo, rng, k, reserved) {
  const { n, count, nbr, active } = topo;
  const picks = [];
  if (!k) return picks;
  const candidates = [];
  for (let i = 0; i < count; i++) {
    if (!active[i] || reserved.has(i)) continue;
    let ok = true;
    for (let d = 0; d < n && ok; d++) if (nbr[i * n + d] < 0) ok = false;
    if (ok) candidates.push(i);
  }
  rng.shuffle(candidates);
  for (const i of candidates) {
    if (picks.length >= k) break;
    let near = false;
    for (let d = 0; d < n; d++) if (picks.includes(nbr[i * n + d])) near = true;
    if (!near) picks.push(i);
  }
  return picks;
}

function distances(topo, mask, from) {
  const { n, half, count, nbr } = topo;
  const dist = new Int16Array(count).fill(-1);
  dist[from] = 0;
  const queue = [from];
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    for (let d = 0; d < n; d++) {
      if (!(mask[i] & (1 << d))) continue;
      const j = nbr[i * n + d];
      if (j < 0 || dist[j] >= 0 || !(mask[j] & (1 << ((d + half) % n)))) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return dist;
}

function randomCell(topo, rng, accept) {
  const list = [];
  for (let i = 0; i < topo.count; i++) if (topo.active[i] && accept(i)) list.push(i);
  return list.length ? rng.pick(list) : -1;
}

function centerish(topo, rng, grower) {
  let cx = 0;
  let cy = 0;
  let m = 0;
  for (let i = 0; i < topo.count; i++) {
    if (!topo.active[i]) continue;
    cx += topo.cx[i];
    cy += topo.cy[i];
    m++;
  }
  cx /= m;
  cy /= m;
  const list = [];
  for (let i = 0; i < topo.count; i++) {
    if (grower.state[i] !== FREE) continue;
    const dd = (topo.cx[i] - cx) ** 2 + (topo.cy[i] - cy) ** 2;
    list.push([dd, i]);
  }
  list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const top = list.slice(0, Math.max(1, Math.ceil(list.length / 4)));
  return rng.pick(top)[1];
}

// Build one candidate layout (tiles in solved orientation), or null.
function layout(topo, spec, rng) {
  const mode = spec.mode || 'single';
  const grower = makeGrower(topo, rng, spec);
  const reserved = new Set(spec.spring != null ? [spec.spring] : []);
  const bridges = spec.bridgeCells ? [...spec.bridgeCells] : pickBridges(topo, rng, spec.bridges || 0, reserved);
  for (const b of bridges) grower.state[b] = BRIDGE;
  const activeCount = topo.active.reduce((a, b) => a + b, 0) - bridges.length;
  const target = spec.fill ? activeCount : Math.min(spec.size, activeCount);
  const tiles = new Array(topo.count).fill(null);
  const { mask } = grower;
  const springs = [];
  const gateCells = [];

  const growAll = (list) => {
    let progress = true;
    while (progress) {
      progress = false;
      for (const [tree, size] of list) {
        if (tree.nodes.length >= size) continue;
        if (grower.step(tree)) progress = true;
      }
    }
  };

  if (mode === 'single') {
    const root = spec.spring != null ? spec.spring : randomCell(topo, rng, (i) => grower.state[i] === FREE);
    const tree = grower.addTree(root);
    growAll([[tree, target]]);
    if (!spec.fill && tree.nodes.length < target) return null;
    springs.push([root, 'b']);
  } else if (mode === 'two') {
    const a = randomCell(topo, rng, (i) => grower.state[i] === FREE);
    let b = -1;
    let far = -1;
    for (let i = 0; i < topo.count; i++) {
      if (grower.state[i] !== FREE || i === a) continue;
      const dd = (topo.cx[i] - topo.cx[a]) ** 2 + (topo.cy[i] - topo.cy[a]) ** 2 + rng.next() * 0.5;
      if (dd > far) {
        far = dd;
        b = i;
      }
    }
    const ta = grower.addTree(a);
    const tb = grower.addTree(b);
    const half = Math.floor(target / 2);
    growAll([[ta, target - half], [tb, half]]);
    if (ta.nodes.length + tb.nodes.length < target * 0.9) return null;
    springs.push([a, 'b'], [b, 'y']);
  } else {
    const mix = spec.mix;
    const root = centerish(topo, rng, grower);
    const tg = grower.addTree(root);
    growAll([[tg, mix.g]]);
    if (tg.nodes.length < mix.g) return null;
    // Two leaves of the green tree become gates fed from outside.
    const leaves = rng.shuffle(tg.nodes.filter((i) => popcount(mask[i]) === 1 && grower.state[i] === USED));
    const feeds = [];
    for (const leaf of leaves) {
      if (feeds.length >= 2) break;
      const opts = [];
      for (let d = 0; d < topo.n; d++) {
        const c = topo.nbr[leaf * topo.n + d];
        if (c >= 0 && grower.state[c] === FREE && !feeds.some((f) => f.c === c)) opts.push([d, c]);
      }
      if (!opts.length) continue;
      const [d, c] = rng.pick(opts);
      feeds.push({ leaf, d, c });
    }
    if (feeds.length < 2) return null;
    const colorTrees = [];
    for (const f of feeds) {
      grower.link(f.leaf, f.d, f.c);
      grower.parentDir[f.leaf] = f.d;
      gateCells.push(f.leaf);
      colorTrees.push(grower.addTree(f.c));
    }
    growAll([[colorTrees[0], mix.b], [colorTrees[1], mix.y]]);
    ['b', 'y'].forEach((color, k) => {
      const tree = colorTrees[k];
      const dist = distances(topo, mask, tree.root);
      let spring = tree.root;
      let bestD = -1;
      for (const i of tree.nodes) {
        if (popcount(mask[i]) !== 1) continue;
        const score = dist[i] + rng.next() * 0.5;
        if (score > bestD) {
          bestD = score;
          spring = i;
        }
      }
      springs.push([spring, color]);
    });
  }

  // Bridges: fully crossed ones stay, half-used ones become straights.
  for (const b of bridges) {
    const used = grower.axisUsed[b];
    if (!used) continue;
    const axes = popcount(used);
    if (axes >= 2) tiles[b] = { kind: 'bridge', mask: mask[b] };
    else tiles[b] = { kind: 'pipe', mask: mask[b] };
  }
  const springAt = new Map(springs);
  const treeColor = (i) => {
    if (mode === 'single') return 'b';
    const t = grower.treeOf[i];
    if (mode === 'two') return t === 0 ? 'b' : 'y';
    return t === 0 ? 'g' : t === 1 ? 'b' : 'y';
  };
  for (let i = 0; i < topo.count; i++) {
    if (grower.state[i] !== USED) continue;
    if (springAt.has(i)) tiles[i] = { kind: 'spring', mask: mask[i], color: springAt.get(i) };
    else if (gateCells.includes(i)) tiles[i] = { kind: 'gate', mask: mask[i], inDir: grower.parentDir[i] };
    else if (popcount(mask[i]) === 1) tiles[i] = { kind: 'flower', mask: mask[i], need: treeColor(i) };
    else tiles[i] = { kind: 'pipe', mask: mask[i] };
  }
  const flowerCount = tiles.filter((t) => t && t.kind === 'flower').length;
  const [fmin, fmax] = spec.flowers || [1, 99];
  if (flowerCount < fmin || flowerCount > fmax) return null;
  if (mode === 'mix') {
    for (const need of ['g', 'b', 'y']) {
      if (!tiles.some((t) => t && t.kind === 'flower' && t.need === need)) return null;
    }
  }
  if (bridges.length && !tiles.some((t) => t && t.kind === 'bridge')) return null;

  // One-way gates on straights and bends, pointing downstream.
  if (spec.gates && mode === 'single') {
    const candidates = [];
    for (let i = 0; i < topo.count; i++) {
      const t = tiles[i];
      if (!t || t.kind !== 'pipe' || popcount(t.mask) !== 2 || grower.parentDir[i] < 0) continue;
      const straight = t.mask === ((1 << grower.parentDir[i]) | (1 << ((grower.parentDir[i] + topo.half) % topo.n)));
      candidates.push([straight ? 0 : 1, rng.next(), i]);
    }
    candidates.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, , i] of candidates.slice(0, spec.gates)) {
      tiles[i] = { kind: 'gate', mask: tiles[i].mask, inDir: grower.parentDir[i] };
    }
    if (!tiles.some((t) => t && t.kind === 'gate')) return null;
  }

  const n = topo.n;
  const isSymmetric = (t) => rotMask(t.mask, 1, n) === t.mask && t.kind !== 'gate';
  if (spec.locks) {
    const list = rng.shuffle(tiles.map((t, i) => i).filter((i) => tiles[i] && !isSymmetric(tiles[i]) && tiles[i].kind !== 'spring'));
    for (const i of list.slice(0, spec.locks)) tiles[i].locked = true;
  }
  if (spec.pairs) {
    const list = rng.shuffle(
      tiles.map((t, i) => i).filter((i) => tiles[i] && !tiles[i].locked && !isSymmetric(tiles[i]) && tiles[i].kind !== 'bridge'),
    );
    let g = 0;
    for (let k = 0; k + 1 < list.length && g < spec.pairs; k += 2) {
      tiles[list[k]].group = g;
      tiles[list[k + 1]].group = g;
      g++;
    }
  }
  return tiles;
}

// Turn every group away from solved, never leaving the garden complete.
export function scramble(puzzle, rng) {
  const { topo, tiles } = puzzle;
  const n = topo.n;
  const { members, fixed } = buildGroups(puzzle);
  const rots = new Array(topo.count).fill(0);
  for (let attempt = 0; attempt < 50; attempt++) {
    rots.fill(0);
    let changed = 0;
    members.forEach((list, g) => {
      if (fixed[g]) return;
      const k = 1 + rng.int(n - 1);
      for (const i of list) rots[i] = k;
      if (list.some((i) => signature(tiles[i], k, n) !== signature(tiles[i], 0, n))) changed++;
    });
    if (changed >= Math.min(2, members.length) && !simulate(puzzle, rots).solved) return rots;
  }
  throw new Error('could not scramble garden');
}

// Fewest taps back to the intended solution (tap = +1, long-press = -1).
export function parMoves(puzzle, rots) {
  const { topo, tiles } = puzzle;
  const n = topo.n;
  const { members, fixed } = buildGroups(puzzle);
  let total = 0;
  members.forEach((list, g) => {
    if (fixed[g]) return;
    const k = rots[list[0]];
    let best = Infinity;
    for (let t = 0; t < n; t++) {
      if (!list.every((i) => signature(tiles[i], t, n) === signature(tiles[i], 0, n))) continue;
      const up = (((t - k) % n) + n) % n;
      best = Math.min(best, up, n - up);
    }
    total += best;
  });
  return total;
}

export function generate(spec) {
  const rng = new Rng(spec.seed >>> 0 || 1);
  const topo = makeTopology(spec.topo);
  let best = null;
  let solverRuns = 0;
  for (let attempt = 0; attempt < 400 && solverRuns < (spec.tries ?? 6); attempt++) {
    const tiles = layout(topo, spec, rng);
    if (!tiles) continue;
    const puzzle = { topo, tiles };
    if (!simulate(puzzle, new Array(topo.count).fill(0)).solved) continue;
    solverRuns++;
    const result = solve(puzzle, { cap: 2 });
    if (!result.count) continue;
    const score = result.complete ? result.count : 3;
    if (!best || score < best.score) best = { tiles, score, result };
    if (score === 1) break;
  }
  if (!best) throw new Error(`could not generate garden for seed ${spec.seed}`);
  let { tiles } = best;
  let unique = best.score === 1;
  if (!unique && spec.repairLocks) {
    for (let k = 0; k < 6 && !unique; k++) {
      const puzzle = { topo, tiles };
      const res = solve(puzzle, { cap: 2 });
      if (res.complete && res.count === 1) {
        unique = true;
        break;
      }
      const alt = res.solutions.find((s) => s.some((r, i) => tiles[i] && signature(tiles[i], r, topo.n) !== signature(tiles[i], 0, topo.n)));
      if (!alt) break;
      const diff = alt.findIndex((r, i) => tiles[i] && !tiles[i].locked && tiles[i].group == null && signature(tiles[i], r, topo.n) !== signature(tiles[i], 0, topo.n));
      if (diff < 0) break;
      tiles[diff].locked = true;
    }
  }
  const puzzle = { topo, tiles, unique };
  const rots = scramble(puzzle, rng);
  return { ...puzzle, rots, par: parMoves(puzzle, rots) };
}
