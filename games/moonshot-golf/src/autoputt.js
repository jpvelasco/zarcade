// Moonshot Mini Golf: a simple autoputter (DOM-free).
//
// It scores candidate shots by fully simulating them with the real physics
// and measuring where the ball ends up on a walking-distance map to the cup
// (a grid flood fill that respects walls, space and one-way portals). Used
// by the tests to prove every hole is playable and by ?autoplay in the game.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./physics.js'), require('./play.js'));
  else root.MoonshotAutoputt = factory(root.MoonshotPhysics, root.MoonshotPlay);
})(typeof self !== 'undefined' ? self : this, function (P, Play) {
  'use strict';

  const CELL = 10;
  const fields = new WeakMap();

  function distToSeg(x, y, g) {
    const dx = g.bx - g.ax, dy = g.by - g.ay;
    const l2 = dx * dx + dy * dy;
    let u = l2 ? ((x - g.ax) * dx + (y - g.ay) * dy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    return Math.hypot(x - g.ax - dx * u, y - g.ay - dy * u);
  }

  function passable(H, x, y) {
    let floor = P.onFloor(H, x, y, 0);
    if (!floor && H.dynamic) {
      for (const f of H.floor) {
        if (!f.move) continue;
        for (let k = 0; k <= 8 && !floor; k++) {
          const o = P.motion(f.move, (f.move.period * k) / 16);
          if (P.inShape(f, x, y, o.x, o.y)) floor = true;
        }
      }
    }
    if (!floor || P.hazardAt(H, x, y)) return false;
    for (const g of H.segs) if (distToSeg(x, y, g) < P.WALL_T + P.BALL_R * 0.6) return false;
    for (const p of [...H.posts, ...H.bumpers]) if (Math.hypot(x - p.x, y - p.y) < p.r + P.BALL_R * 0.6) return false;
    for (const w of H.wells) if (Math.hypot(x - w.x, y - w.y) < Math.max(w.core * 3, 1)) return false;
    return true;
  }

  // Walking distance from every grid cell to the cup (Dijkstra, 8-way).
  function fieldFor(H) {
    if (fields.has(H)) return fields.get(H);
    const cols = Math.ceil(1000 / CELL), rows = Math.ceil(600 / CELL);
    const n = cols * rows;
    const open = new Uint8Array(n);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) open[r * cols + c] = passable(H, (c + 0.5) * CELL, (r + 0.5) * CELL) ? 1 : 0;
    }
    const idx = (x, y) => {
      const c = Math.max(0, Math.min(cols - 1, Math.floor(x / CELL)));
      const r = Math.max(0, Math.min(rows - 1, Math.floor(y / CELL)));
      return r * cols + c;
    };
    // Reverse portal edges: reaching an exit cell also reaches its entrance.
    const viaExit = new Map();
    for (const p of H.portals) {
      const b = idx(p.b[0], p.b[1]);
      const list = viaExit.get(b) || [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.hypot((c + 0.5) * CELL - p.a[0], (r + 0.5) * CELL - p.a[1]) < p.r) list.push(r * cols + c);
        }
      }
      viaExit.set(b, list);
    }
    const dist = new Float64Array(n).fill(Infinity);
    const start = idx(H.cup.x, H.cup.y);
    dist[start] = 0;
    open[start] = 1;
    // Small binary heap.
    const heap = [[0, start]];
    const push = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.length) {
      const [d, i] = pop();
      if (d > dist[i]) continue;
      const c = i % cols, r = (i / cols) | 0;
      for (const [dc, dr, w] of dirs) {
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const j = rr * cols + cc;
        if (!open[j]) continue;
        const nd = d + w * CELL;
        if (nd < dist[j]) { dist[j] = nd; push([nd, j]); }
      }
      const ents = viaExit.get(i);
      if (ents) for (const j of ents) if (d < dist[j]) { dist[j] = d; push([d, j]); }
    }
    const field = { dist, idx, cols, rows };
    fields.set(H, field);
    return field;
  }

  function costAt(H, x, y) {
    const f = fieldFor(H);
    let best = f.dist[f.idx(x, y)];
    if (!Number.isFinite(best)) {
      // Resting against a wall can sit in a blocked cell: look around it.
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const d = f.dist[f.idx(x + dx * CELL, y + dy * CELL)] + Math.hypot(dx, dy) * CELL;
          if (d < best) best = d;
        }
      }
    }
    return Number.isFinite(best) ? best : 5000 + Math.hypot(x - H.cup.x, y - H.cup.y);
  }

  // Simulate one shot on a copy of the play. Returns the finished copy.
  function trial(play, angle, power, wait) {
    const p = Play.clonePlay(play);
    for (let w = 0; w < wait && p.status === 'ready'; w += P.STEP) Play.stepPlay(p);
    while (p.status !== 'ready') {
      if (p.status === 'holed') return p;
      Play.stepPlay(p);
    }
    Play.putt(p, angle, power);
    const start = p.strokes;
    let guard = 0;
    while (p.status !== 'ready' && p.status !== 'holed' && guard++ < 6000) Play.stepPlay(p);
    p.fellDuring = p.strokes > start;
    return p;
  }

  function scoreTrial(p) {
    if (p.status === 'holed' && !p.pickedUp) return -1e6;
    const c = costAt(p.H, p.sim.x, p.sim.y);
    return c + (p.fellDuring ? 400 : 0);
  }

  function planShot(play, opts = {}) {
    const H = play.H;
    const dyn = H.dynamic;
    const nAngles = opts.angles || (dyn ? 40 : 64);
    const powers = opts.powers || (dyn ? [0.1, 0.18, 0.28, 0.4, 0.55, 0.7, 0.85, 1] : [0.06, 0.1, 0.15, 0.2, 0.27, 0.35, 0.44, 0.54, 0.66, 0.8, 1]);
    const waits = opts.waits || (dyn ? [0, 0.5, 1, 1.5, 2, 2.5, 3] : [0]);
    const toCup = Math.atan2(H.cup.y - play.sim.y, H.cup.x - play.sim.x);
    const cands = [];
    for (let i = 0; i < nAngles; i++) cands.push(toCup + (i / nAngles) * Math.PI * 2);
    let best = null;
    const consider = (angle, power, wait) => {
      const p = trial(play, angle, power, wait);
      const s = scoreTrial(p) + wait * 5;
      if (!best || s < best.score) best = { angle, power, wait, score: s, holed: p.status === 'holed' && !p.pickedUp };
      return s;
    };
    const top = [];
    for (const wait of waits) {
      for (const a of cands) {
        for (const pw of powers) {
          const s = consider(a, pw, wait);
          top.push({ s, a, pw, wait });
          if (best.holed) return best;
        }
      }
    }
    top.sort((x, y) => x.s - y.s);
    const step = (Math.PI * 2) / nAngles;
    for (const c of top.slice(0, 6)) {
      for (const da of [-0.5, -0.25, 0.25, 0.5]) {
        for (const dp of [-0.04, 0, 0.04]) {
          consider(c.a + da * step, Math.max(0.03, Math.min(1, c.pw + dp)), c.wait);
          if (best.holed) return best;
        }
      }
    }
    return best;
  }

  // Play a whole hole with the autoputter. Returns the finished play.
  function autoplayHole(def, opts = {}) {
    const play = Play.createPlay(def);
    let guard = 0;
    while (play.status !== 'holed' && guard++ < 20) {
      while (play.status !== 'ready' && play.status !== 'holed') Play.stepPlay(play);
      if (play.status === 'holed') break;
      const shot = planShot(play, opts);
      for (let w = 0; w < shot.wait && play.status === 'ready'; w += P.STEP) Play.stepPlay(play);
      if (play.status !== 'ready') continue;
      Play.putt(play, shot.angle, shot.power);
      if (opts.log) opts.log(play, shot);
      while (play.status !== 'ready' && play.status !== 'holed') Play.stepPlay(play);
    }
    return play;
  }

  return { fieldFor, costAt, planShot, autoplayHole };
});
