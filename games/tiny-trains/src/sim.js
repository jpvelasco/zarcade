// The train simulation. DOM-free and deterministic.
//
// Time runs in whole ticks. During tick t each moving train crosses one cell:
// a segment {cell, entry, exit, kind}. Kinds:
//   depart  leaves its depot: centre → exit edge
//   pass    entry edge → exit edge
//   arrive  entry edge → centre of its own-colour station, then it's done
//   in      into a tunnel mouth: entry edge → centre (then hidden)
//   out     out of the partner mouth: centre → exit edge
//   wait    still parked in its depot
// simulate() runs a whole Go up front and returns a timeline the renderer
// plays back, plus the result: win, crash, derail or loop.

import { route, DX, DY, opposite } from './pieces.js';

// The piece a train runs on in cell i (fixed track, station, paint or placed).
export function pieceAt(board, layout, i) {
  const c = board.cells[i];
  if (c.k === 'track' || c.k === 'station' || c.k === 'paint') return c;
  if (c.k === 'grass') return layout.get(i) || null;
  return null;
}

// Where a train goes after crossing edge `exit` of cell i on a segment of `kind`.
// Returns a segment (without colour) or a failure description.
export function nextSegment(board, layout, sw, seg, color) {
  const here = board.cells[seg.cell];
  if (seg.kind === 'in') {
    const j = here.link;
    const mouth = board.cells[j].mouth;
    return { cell: j, entry: opposite(mouth), exit: mouth, kind: 'out' };
  }
  const x = (seg.cell % board.w) + DX[seg.exit];
  const y = Math.floor(seg.cell / board.w) + DY[seg.exit];
  if (x < 0 || y < 0 || x >= board.w || y >= board.h) return { fail: 'edge' };
  const j = y * board.w + x;
  const entry = opposite(seg.exit);
  const c = board.cells[j];
  if (c.k === 'portal') {
    if (entry !== c.mouth) return { fail: 'mountain', cell: j };
    return { cell: j, entry, exit: -1, kind: 'in' };
  }
  if (c.k === 'depot') return { fail: 'depot', cell: j };
  if (c.k === 'block') return { fail: 'block', cell: j };
  const p = pieceAt(board, layout, j);
  if (!p) return { fail: 'grass', cell: j };
  const r = route(p.t, p.v, sw.get(j) || 0, entry);
  if (!r) return { fail: 'side', cell: j };
  if (c.k === 'station' && c.color === color) return { cell: j, entry, exit: -1, kind: 'arrive' };
  const seg2 = { cell: j, entry, exit: r.exit, kind: 'pass' };
  if (p.t === 'W') seg2.flip = r.s;
  return seg2;
}

function stateKey(trains, sw) {
  let k = '';
  for (const tr of trains) {
    k += tr.status === 'run' ? `${tr.seg.cell},${tr.seg.entry},${tr.seg.kind},${tr.color};` : `${tr.status};`;
  }
  for (const [i, s] of sw) k += `${i}:${s}`;
  return k;
}

export function simulate(board, layout, { maxTicks = 600 } = {}) {
  const trains = board.trains.map((t) => ({
    id: t.id, color: t.color, depart: t.depart, depot: t.depot, dir: t.dir, status: 'wait', seg: null,
  }));
  const sw = new Map();
  const served = new Set();
  const stations = [];
  for (let i = 0; i < board.cells.length; i++) if (board.cells[i].k === 'station') stations.push(i);
  for (let i = 0; i < board.cells.length; i++) {
    const p = pieceAt(board, layout, i);
    if (p && p.t === 'W') sw.set(i, 0);
  }
  const frames = [];
  const events = [];
  const seen = new Map();
  const result = { frames, events, outcome: null, endTime: 0, failures: [], loopFrom: -1, period: 0, delivered: 0 };

  const snapshot = () => ({
    trains: trains.map((tr) => {
      if (tr.status === 'run') return { ...tr.seg, color: tr.seg.color, color2: tr.color };
      if (tr.status === 'wait') return { kind: 'wait', cell: tr.depot, entry: -1, exit: tr.dir, color: tr.color, color2: tr.color, depart: tr.depart };
      return null;
    }),
    sw: sw.size ? [...sw.values()] : null,
  });

  const depart = (t) => {
    for (const tr of trains) {
      if (tr.status === 'wait' && tr.depart === t) {
        tr.status = 'run';
        tr.seg = { cell: tr.depot, entry: -1, exit: tr.dir, kind: 'depart', color: tr.color };
        events.push({ t, type: 'depart', train: tr.id, cell: tr.depot, color: tr.color });
      }
    }
  };

  if (!trains.length) {
    result.outcome = 'empty';
    return result;
  }

  depart(0);
  frames.push(snapshot());
  for (let t = 0; t < maxTicks; t++) {
    // Trains that pulled in during tick t are done.
    for (const tr of trains) {
      if (tr.status === 'run' && tr.seg.kind === 'arrive') {
        tr.status = 'done';
        result.delivered++;
        served.add(tr.seg.cell);
        events.push({ t, type: 'deliver', train: tr.id, cell: tr.seg.cell, color: tr.color });
      }
    }
    if (trains.every((tr) => tr.status === 'done')) {
      const waiting = stations.filter((i) => !served.has(i));
      result.endTime = t + 0.5;
      if (waiting.length) {
        result.outcome = 'unserved';
        for (const i of waiting) result.failures.push({ type: 'unserved', cell: i, color: board.cells[i].color });
      } else result.outcome = 'win';
      return result;
    }
    // Loop check once nobody is waiting to leave.
    if (trains.every((tr) => tr.status !== 'wait')) {
      const key = stateKey(trains, sw);
      if (seen.has(key)) {
        result.outcome = 'loop';
        result.loopFrom = seen.get(key);
        result.period = t - result.loopFrom;
        result.endTime = t;
        frames.length = t + 1;
        return result;
      }
      seen.set(key, t);
    }
    // Move everyone one cell.
    const prev = new Map();
    for (const tr of trains) {
      if (tr.status !== 'run') continue;
      prev.set(tr.id, tr.seg.cell);
      const n = nextSegment(board, layout, sw, tr.seg, tr.color);
      if (n.fail) {
        result.failures.push({ type: 'derail', reason: n.fail, train: tr.id, cell: tr.seg.cell, edge: tr.seg.exit, into: n.cell ?? -1, color: tr.color });
        continue;
      }
      if (n.flip !== undefined) {
        sw.set(n.cell, n.flip);
        events.push({ t: t + 1, type: 'flip', cell: n.cell, s: n.flip });
        delete n.flip;
      }
      n.color = tr.color;
      const c = board.cells[n.cell];
      if (c.k === 'paint' && c.color !== tr.color) {
        tr.color = c.color;
        events.push({ t: t + 1, type: 'paint', train: tr.id, cell: n.cell, color: c.color });
      }
      if (n.kind === 'in') events.push({ t: t + 1, type: 'tunnel', train: tr.id, cell: n.cell });
      tr.seg = n;
    }
    if (result.failures.length) {
      result.outcome = 'derail';
      result.endTime = t + 1;
      return result;
    }
    depart(t + 1);
    // Collisions in the new tick.
    const running = trains.filter((tr) => tr.status === 'run');
    for (let a = 0; a < running.length; a++) {
      for (let b = a + 1; b < running.length; b++) {
        const A = running[a], B = running[b];
        if (A.seg.cell === B.seg.cell) {
          result.failures.push({ type: 'crash', a: A.id, b: B.id, cell: A.seg.cell, edge: -1 });
        } else if (prev.get(A.id) === B.seg.cell && prev.get(B.id) === A.seg.cell) {
          result.failures.push({ type: 'crash', a: A.id, b: B.id, cell: A.seg.cell, other: B.seg.cell, edge: A.seg.entry, swap: true });
        }
      }
    }
    frames.push(snapshot());
    if (result.failures.length) {
      result.outcome = 'crash';
      result.endTime = t + 1 + (result.failures.some((f) => !f.swap) ? 0.42 : 0.02);
      return result;
    }
  }
  result.outcome = 'loop';
  result.endTime = frames.length - 1;
  return result;
}

// Map wall-clock playback time onto the timeline (sandbox loops wrap).
export function wrapTime(result, time) {
  if (result.outcome === 'loop' && result.period > 0 && time >= result.loopFrom + result.period) {
    return result.loopFrom + ((time - result.loopFrom) % result.period);
  }
  return time;
}

export function piecesUsed(board, layout) {
  let n = 0;
  for (const i of layout.keys()) if (board.cells[i] && board.cells[i].k === 'grass') n++;
  return n;
}

export function starsFor(par, used) {
  if (used <= par) return 3;
  if (used <= par + Math.max(2, Math.ceil(par / 4))) return 2;
  return 1;
}
