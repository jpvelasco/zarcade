// A solver for Tiny Trains levels. DOM-free.
//
// IDA* over the real simulation rules with lazy placement: a piece is only
// chosen when a train first rolls into an empty grass cell. Each touched cell
// keeps the set of piece variants (with their switch states) that agree with
// every train that has crossed it so far; a later visit splits that set by
// exit direction. Cost = cells touched (= pieces needed). The heuristic is
// the largest per-train 0-1 BFS distance (untouched grass costs 1) to a
// matching station, or to any paint shed when the level has some.

import { route, DX, DY, opposite, VARIANTS } from './pieces.js';

function initialCandidates(stock) {
  const list = [];
  for (const t of ['S', 'C']) for (let v = 0; v < VARIANTS[t]; v++) list.push({ t, v, s: 0 });
  if (stock.X > 0) list.push({ t: 'X', v: 0, s: 0 });
  if (stock.W > 0) for (let v = 0; v < 8; v++) list.push({ t: 'W', v, s: 0 });
  return list;
}

const kindOf = (cands) => {
  let plain = false, x = false, w = false;
  for (const c of cands) {
    if (c.t === 'S' || c.t === 'C') plain = true;
    else if (c.t === 'X') x = true;
    else w = true;
  }
  return plain ? 'plain' : x && w ? 'XW' : x ? 'X' : 'W';
};

// Hall's condition for two limited piece types.
export function stockFits(sets, stock, fixedCells) {
  let nx = 0, nw = 0, nxw = 0;
  for (const [i, cands] of sets) {
    if (fixedCells && fixedCells.has(i)) continue;
    const k = kindOf(cands);
    if (k === 'X') nx++;
    else if (k === 'W') nw++;
    else if (k === 'XW') nxw++;
  }
  return nx <= stock.X && nw <= stock.W && nx + nw + nxw <= stock.X + stock.W;
}

// Pick one concrete piece per touched cell that fits the stock.
export function choosePieces(sets, stock, fixedCells) {
  const out = new Map();
  let xLeft = stock.X, wLeft = stock.W;
  const later = [];
  for (const [i, cands] of sets) {
    if (fixedCells && fixedCells.has(i)) continue;
    const k = kindOf(cands);
    if (k === 'plain') {
      const c = cands.find((c) => c.t === 'S') || cands.find((c) => c.t === 'C');
      out.set(i, { t: c.t, v: c.v });
    } else if (k === 'X') { xLeft--; out.set(i, { t: 'X', v: 0 }); }
    else if (k === 'W') { wLeft--; const c = cands[0]; out.set(i, { t: 'W', v: c.v }); }
    else later.push([i, cands]);
  }
  for (const [i, cands] of later) {
    if (xLeft > 0) { xLeft--; out.set(i, { t: 'X', v: 0 }); }
    else { wLeft--; out.set(i, { t: 'W', v: cands.find((c) => c.t === 'W').v }); }
  }
  return out;
}

export function solve(board, { maxCost = 40, nodeLimit = 3_000_000, maxTicks, startBound = 0 } = {}) {
  const { w, h, cells, stock } = board;
  const n = cells.length;
  const hasPaint = cells.some((c) => c.k === 'paint');
  const maxDepart = board.trains.reduce((m, t) => Math.max(m, t.depart), 0);
  const tickCap = maxTicks ?? n * 2 + maxDepart + 6;
  const init = initialCandidates(stock);
  const fixedCells = new Set();
  const stations = [];
  for (let i = 0; i < n; i++) if (cells[i].k === 'station') stations.push(i);
  const sets0 = new Map();
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    if (c.k === 'track' && c.t === 'W') { sets0.set(i, [{ t: 'W', v: c.v, s: 0 }]); fixedCells.add(i); }
  }

  // Neighbours for the BFS heuristic (portals link to their partner).
  const adj = [];
  for (let i = 0; i < n; i++) {
    const list = [];
    const c = cells[i];
    if (c.k !== 'block') {
      for (let e = 0; e < 4; e++) {
        const x = (i % w) + DX[e], y = Math.floor(i / w) + DY[e];
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const j = y * w + x;
        const d = cells[j];
        if (d.k === 'block' || d.k === 'depot') continue;
        if (d.k === 'portal' && opposite(e) !== d.mouth) continue;
        if (c.k === 'portal' && e !== c.mouth) continue;
        list.push(j);
      }
      if (c.k === 'portal') list.push(c.link);
    }
    adj.push(list);
  }
  const targetsFor = {};
  for (const t of board.trains) {
    if (targetsFor[t.color]) continue;
    const set = new Set();
    for (let i = 0; i < n; i++) {
      if ((cells[i].k === 'station' && cells[i].color === t.color) || (hasPaint && cells[i].k === 'paint')) set.add(i);
    }
    targetsFor[t.color] = set;
  }
  // When paint can change colours, any station is a possible goal.
  if (hasPaint) {
    for (const color of Object.keys(targetsFor)) {
      for (let i = 0; i < n; i++) if (cells[i].k === 'station') targetsFor[color].add(i);
    }
  }
  for (let i = 0; i < n; i++) {
    if (cells[i].k === 'paint' && !targetsFor[cells[i].color]) {
      const set = new Set();
      for (let j = 0; j < n; j++) if (cells[j].k === 'station' || cells[j].k === 'paint') set.add(j);
      targetsFor[cells[i].color] = set;
    }
  }

  // Plain step distances to each colour's goals, for move ordering.
  const radj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (const j of adj[i]) radj[j].push(i);
  const away = {};
  for (const [color, targets] of Object.entries(targetsFor)) {
    const d = new Int32Array(n).fill(1e6);
    const queue = [...targets];
    for (const i of targets) d[i] = 0;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      for (const j of radj[i]) if (d[j] > d[i] + 1) { d[j] = d[i] + 1; queue.push(j); }
    }
    away[color] = d;
  }
  const stepTo = (i, e) => {
    const x = (i % w) + DX[e], y = Math.floor(i / w) + DY[e];
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  };

  const deque = new Int32Array(n * 4);
  // 0-1 BFS over every cell from a set of sources (forward along adj, or
  // backward along radj). Cost counts untouched grass, never the source:
  // forward pays for each cell entered, backward for each cell left, so a
  // backward fill from a goal gives the cost of the cells after v up to it.
  function fill(sources, links, sets, seed) {
    const out = new Int32Array(n).fill(1e9);
    let head = n * 2, tail = n * 2;
    if (seed) {
      // Seeded sources start at their own cost: Dijkstra-ish via repeated
      // relaxation is fine at this size, so push them in cost order.
      const order = [...sources].sort((a, b) => seed[a] - seed[b]);
      for (const i of order) if (seed[i] < out[i]) { out[i] = seed[i]; deque[tail++] = i; }
    } else for (const i of sources) { out[i] = 0; deque[tail++] = i; }
    const forward = links === adj;
    while (head < tail) {
      const i = deque[head++];
      const d = out[i];
      const wi = cells[i].k === 'grass' && !sets.has(i) ? 1 : 0;
      for (const j of links[i]) {
        const cost = forward ? (cells[j].k === 'grass' && !sets.has(j) ? 1 : 0) : wi;
        if (d + cost < out[j]) {
          out[j] = d + cost;
          if (seed) { if (tail >= deque.length) return relax(out, links, sets); deque[tail++] = j; }
          else if (cost) deque[tail++] = j; else deque[--head] = j;
        }
      }
    }
    return out;
  }
  // Fallback for seeded fills: plain Bellman-Ford sweeps until stable.
  function relax(out, links, sets) {
    const forward = links === adj;
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < n; i++) {
        if (out[i] >= 1e9) continue;
        const wi = cells[i].k === 'grass' && !sets.has(i) ? 1 : 0;
        for (const j of links[i]) {
          const cost = forward ? (cells[j].k === 'grass' && !sets.has(j) ? 1 : 0) : wi;
          if (out[i] + cost < out[j]) { out[j] = out[i] + cost; changed = true; }
        }
      }
    }
    return out;
  }
  // Distance fields only depend on which cells are touched, so cache them
  // per (immutable) sets map.
  const fieldCache = new WeakMap();
  const stationSet = stations.map((i) => new Set([i]));
  function fields(sets) {
    let f = fieldCache.get(sets);
    if (!f) {
      f = { color: {}, station: [], depot: {} };
      fieldCache.set(sets, f);
    }
    return f;
  }
  const toColor = (f, sets, c) => f.color[c] || (f.color[c] = fill(targetsFor[c], radj, sets));
  // A station whose colour no train has yet must be reached through a paint
  // shed of that colour: seed the field at those sheds.
  const paintsOf = {};
  for (let i = 0; i < n; i++) if (cells[i].k === 'paint') (paintsOf[cells[i].color] ||= []).push(i);
  const toStation = (f, sets, si) => f.station[si] || (f.station[si] = fill(stationSet[si], radj, sets));
  const viaPaint = (f, sets, si) => {
    f.via ||= [];
    if (f.via[si]) return f.via[si];
    const direct = toStation(f, sets, si);
    const sheds = paintsOf[cells[stations[si]].color] || [];
    const seed = new Int32Array(n).fill(1e9);
    for (const p of sheds) seed[p] = direct[p];
    return (f.via[si] = sheds.length ? fill(sheds, radj, sets, seed) : new Int32Array(n).fill(1e9));
  };
  const stationField = (f, sets, si, trains) => {
    const c = cells[stations[si]].color;
    if (!hasPaint || trains.some((tr) => live(tr) && tr.color === c)) return toStation(f, sets, si);
    return viaPaint(f, sets, si);
  };
  const fromDepot = (f, sets, d) => f.depot[d] || (f.depot[d] = fill([d], adj, sets));

  const depotIds = [...new Set(board.trains.map((t) => t.depot))];
  const noSwitches = stock.W === 0 && fixedCells.size === 0;
  const posOf = (tr) => (tr.status === 'wait' ? tr.depot : tr.seg.cell);
  const live = (tr) => tr.status !== 'done' && !(tr.status === 'run' && tr.seg.kind === 'arrive');

  // Lower bound on pieces still needed: the furthest train from any goal;
  // the furthest unserved station from any train that could serve it; and,
  // since trains from one depot form one connected network (travelled cells
  // are free), a 3-terminal Steiner bound over each depot and its goals.
  function heuristic(trains, sets) {
    const f = fields(sets);
    let best = 0;
    for (const tr of trains) {
      if (!live(tr)) continue;
      const d = toColor(f, sets, tr.color)[posOf(tr)];
      if (d > best) best = d;
    }
    if (best >= 1e9) return best;
    const served = new Set();
    for (const tr of trains) if (tr.at !== undefined) served.add(tr.at);
    for (let si = 0; si < stations.length; si++) {
      const st = stations[si];
      if (served.has(st)) continue;
      let near = 1e9;
      for (const tr of trains) {
        if (!live(tr) || (!hasPaint && tr.color !== cells[st].color)) continue;
        const d = stationField(f, sets, si, trains)[posOf(tr)];
        if (d < near) near = d;
      }
      if (near > best) best = near;
      if (best >= 1e9) return best;
    }
    // Without switches, trains from different depots can only share track at
    // crossings (or, rarely, head-to-tail through each other's stations,
    // which this bound ignores: it may then overestimate par, never a
    // solution). So their needs add up, less one per crossing still in stock.
    if (noSwitches && depotIds.length > 1) {
      let sum = 0;
      for (const dep of depotIds) {
        let g = 0;
        for (const tr of trains) {
          if (tr.depot !== dep || !live(tr)) continue;
          const d = toColor(f, sets, tr.color)[posOf(tr)];
          if (d > g) g = d;
        }
        sum += g;
      }
      let xLeft = stock.X;
      for (const cands of sets.values()) if (kindOf(cands) === 'X') xLeft--;
      if (sum - Math.max(0, xLeft) > best) best = sum - Math.max(0, xLeft);
    }
    for (const dep of depotIds) {
      const goals = [];
      const colors = new Set();
      let any = false;
      for (const tr of trains) if (tr.depot === dep && live(tr)) { any = true; colors.add(tr.color); }
      if (!any) continue;
      if (!hasPaint) for (const c of colors) goals.push(toColor(f, sets, c));
      for (let si = 0; si < stations.length; si++) {
        const st = stations[si];
        if (served.has(st)) continue;
        const able = (tr) => live(tr) && (hasPaint || tr.color === cells[st].color);
        let mine = false, other = false;
        for (const tr of trains) if (able(tr)) { if (tr.depot === dep) mine = true; else other = true; }
        if (mine && !other) goals.push(stationField(f, sets, si, trains));
      }
      if (goals.length < 2) continue;
      const F = fromDepot(f, sets, dep);
      for (let a = 0; a < goals.length; a++) {
        for (let b = a + 1; b < goals.length; b++) {
          const A = goals[a], B = goals[b];
          let m = 1e9;
          for (let v = 0; v < n; v++) {
            const val = F[v] + A[v] + B[v];
            if (val < m) m = val;
          }
          if (m > best) best = m;
        }
      }
    }
    return best;
  }

  let nodes = 0;
  let bound = 0;
  let nextBound = Infinity;
  let found = null;
  let seen = new Set();

  const keyOf = (t, trains, sets) => {
    let k = `${t}|`;
    for (const tr of trains) k += tr.status === 'run' ? `${tr.seg.cell}.${tr.seg.entry}.${tr.seg.kind}.${tr.color};` : `${tr.status[0]}${tr.at ?? ''};`;
    const ids = [...sets.keys()].sort((a, b) => a - b);
    for (const i of ids) {
      k += `${i}:`;
      for (const c of sets.get(i)) k += `${c.t}${c.v}${c.s}`;
      k += ',';
    }
    return k;
  };

  function dfs(t, trains, sets, cost, order) {
    if (found) return;
    nodes++;
    if (nodes > nodeLimit) return;
    trains = trains.map((tr) => (tr.status === 'run' && tr.seg.kind === 'arrive' ? { ...tr, status: 'done', at: tr.seg.cell } : tr));
    let left = 0;
    let unserved = 0;
    for (const tr of trains) if (tr.status !== 'done') left++;
    for (const i of stations) if (!trains.some((tr) => tr.at === i)) unserved++;
    if (unserved > left) return;
    if (!left) {
      found = { sets, cost, order, ticks: t };
      return;
    }
    if (t >= tickCap) return;
    const hval = heuristic(trains, sets);
    if (cost + hval > bound) {
      if (cost + hval < nextBound) nextBound = cost + hval;
      return;
    }
    const key = keyOf(t, trains, sets);
    if (seen.has(key)) return;
    if (seen.size > 400_000) seen = new Set();
    seen.add(key);
    expand(t, trains, 0, [], sets, cost, order, new Map());
  }

  function expand(t, trains, k, moved, sets, cost, order, prev) {
    if (found || nodes > nodeLimit) return;
    if (k === trains.length) {
      // Departures for the next tick, then collisions.
      const next = moved.map((tr) => (tr.status === 'wait' && tr.depart === t + 1
        ? { ...tr, status: 'run', seg: { cell: tr.depot, entry: -1, exit: tr.dir, kind: 'depart' } }
        : tr));
      const run = next.filter((tr) => tr.status === 'run');
      for (let a = 0; a < run.length; a++) {
        for (let b = a + 1; b < run.length; b++) {
          if (run[a].seg.cell === run[b].seg.cell) return;
          if (prev.get(run[a].id) === run[b].seg.cell && prev.get(run[b].id) === run[a].seg.cell) return;
        }
      }
      dfs(t + 1, next, sets, cost, order);
      return;
    }
    const tr = trains[k];
    if (tr.status !== 'run') {
      expand(t, trains, k + 1, [...moved, tr], sets, cost, order, prev);
      return;
    }
    const prev2 = new Map(prev);
    prev2.set(tr.id, tr.seg.cell);
    const seg = tr.seg;
    let j, entry;
    if (seg.kind === 'in') {
      j = cells[seg.cell].link;
      const mouth = cells[j].mouth;
      expand(t, trains, k + 1, [...moved, { ...tr, seg: { cell: j, entry: opposite(mouth), exit: mouth, kind: 'out' } }], sets, cost, order, prev2);
      return;
    }
    const x = (seg.cell % w) + DX[seg.exit], y = Math.floor(seg.cell / w) + DY[seg.exit];
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    j = y * w + x;
    entry = opposite(seg.exit);
    const c = cells[j];
    if (c.k === 'portal') {
      if (entry !== c.mouth) return;
      expand(t, trains, k + 1, [...moved, { ...tr, seg: { cell: j, entry, exit: -1, kind: 'in' } }], sets, cost, order, prev2);
      return;
    }
    if (c.k === 'depot' || c.k === 'block') return;
    if (c.k === 'track' && !sets.has(j) || c.k === 'station' || c.k === 'paint') {
      const r = route(c.t, c.v, 0, entry);
      if (!r) return;
      if (c.k === 'station' && c.color === tr.color) {
        expand(t, trains, k + 1, [...moved, { ...tr, seg: { cell: j, entry, exit: -1, kind: 'arrive' } }], sets, cost, order, prev2);
        return;
      }
      const color = c.k === 'paint' ? c.color : tr.color;
      expand(t, trains, k + 1, [...moved, { ...tr, color, seg: { cell: j, entry, exit: r.exit, kind: 'pass' } }], sets, cost, order, prev2);
      return;
    }
    // Grass (or a fixed switch): split the candidate set by exit edge.
    const fresh = !sets.has(j);
    const cands = fresh ? init : sets.get(j);
    const groups = new Map();
    for (const cand of cands) {
      const r = route(cand.t, cand.v, cand.s, entry);
      if (!r) continue;
      let g = groups.get(r.exit);
      if (!g) groups.set(r.exit, (g = []));
      g.push(cand.s === r.s ? cand : { t: cand.t, v: cand.v, s: r.s });
    }
    const options = [...groups];
    if (options.length > 1) {
      const d = away[tr.color];
      const score = (e) => { const q = stepTo(j, e); return q < 0 ? 1e7 : d[q]; };
      options.sort((a, b) => score(a[0]) - score(b[0]));
    }
    for (const [exit, g] of options) {
      const sets2 = new Map(sets);
      sets2.set(j, g);
      if (!stockFits(sets2, stock, fixedCells)) continue;
      const cost2 = cost + (fresh ? 1 : 0);
      if (cost2 > bound) { if (cost2 < nextBound) nextBound = cost2; continue; }
      const order2 = fresh ? [...order, j] : order;
      expand(t, trains, k + 1, [...moved, { ...tr, seg: { cell: j, entry, exit, kind: 'pass' } }], sets2, cost2, order2, prev2);
      if (found) return;
    }
  }

  const start = board.trains.map((t) => ({ id: t.id, color: t.color, depart: t.depart, depot: t.depot, dir: t.dir, status: 'wait', seg: null }));
  const t0 = start.map((tr) => (tr.depart === 0 ? { ...tr, status: 'run', seg: { cell: tr.depot, entry: -1, exit: tr.dir, kind: 'depart' } } : tr));
  const h0 = heuristic(t0, sets0);
  bound = Math.max(startBound, h0);
  if (bound >= 1e9) return { solved: false, nodes: 0, reason: 'unreachable' };
  while (!found && bound <= maxCost && nodes <= nodeLimit) {
    nextBound = Infinity;
    seen = new Set();
    dfs(0, t0, sets0, 0, []);
    if (found) break;
    if (nextBound === Infinity) break;
    bound = nextBound;
  }
  if (!found) return { solved: false, nodes, reason: nodes > nodeLimit ? 'budget' : 'none' };
  const pieces = choosePieces(found.sets, stock, fixedCells);
  const order = found.order.map((i) => ({ cell: i, piece: pieces.get(i), options: found.sets.get(i).map((c) => ({ t: c.t, v: c.v })) }));
  return { solved: true, par: found.cost, layout: pieces, order, nodes, ticks: found.ticks, h0 };
}
