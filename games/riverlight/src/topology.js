// Board shapes: square grids (optionally wrapping at the edges) and flat-top
// hex grids in odd-q offset coordinates. DOM-free.
//
// Directions run clockwise from north. Square: 0 N, 1 E, 2 S, 3 W.
// Hex: 0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW. Rotating a tile clockwise by one
// step moves its open side d to d + 1.
//
// Geometry is in units where every tile's apothem (centre to edge midpoint)
// is 0.5, so channels look the same on both grids.

const SQUARE_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// Axial offsets (dq, dr) for a flat-top hex grid, clockwise from north.
const HEX_DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
export const HEX_R = 1 / Math.sqrt(3); // circumradius when the apothem is 0.5

export function rotMask(mask, r, n) {
  const k = ((r % n) + n) % n;
  const full = (1 << n) - 1;
  return ((mask << k) | (mask >> (n - k))) & full;
}

export function popcount(mask) {
  let c = 0;
  for (let m = mask; m; m &= m - 1) c++;
  return c;
}

const toAxial = (col, row) => [col, row - (col - (col & 1)) / 2];
const toOffset = (q, r) => [q, r + (q - (q & 1)) / 2];

// spec: { kind: 'square' | 'hex', w, h, wrap?, shape?: string[] | null, hexRadius? }
// shape rows use '.' for cells outside the garden; any other character is in.
export function makeTopology(spec) {
  const kind = spec.kind === 'hex' ? 'hex' : 'square';
  const n = kind === 'hex' ? 6 : 4;
  const w = spec.w;
  const h = spec.h;
  const wrap = !!spec.wrap && kind === 'square';
  const count = w * h;
  const active = new Uint8Array(count).fill(1);
  if (spec.shape) {
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const ch = (spec.shape[r] || '')[c] || '.';
        active[r * w + c] = ch === '.' ? 0 : 1;
      }
    }
  }
  if (kind === 'hex' && spec.hexRadius != null) {
    const R = spec.hexRadius;
    const cq = (w - 1) >> 1;
    const [aq, ar] = toAxial(cq, (h - 1) >> 1);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const [q, rr] = toAxial(c, r);
        const dq = q - aq;
        const dr = rr - ar;
        const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
        if (dist > R) active[r * w + c] = 0;
      }
    }
  }
  const nbr = new Int16Array(count * n).fill(-1);
  const cx = new Float32Array(count);
  const cy = new Float32Array(count);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (kind === 'square') {
        cx[i] = c;
        cy[i] = r;
      } else {
        cx[i] = 1.5 * HEX_R * c;
        cy[i] = r + 0.5 * (c & 1);
      }
      if (!active[i]) continue;
      for (let d = 0; d < n; d++) {
        let c2;
        let r2;
        if (kind === 'square') {
          c2 = c + SQUARE_DIRS[d][0];
          r2 = r + SQUARE_DIRS[d][1];
          if (wrap) {
            c2 = (c2 + w) % w;
            r2 = (r2 + h) % h;
          }
        } else {
          const [q, ar] = toAxial(c, r);
          [c2, r2] = toOffset(q + HEX_DIRS[d][0], ar + HEX_DIRS[d][1]);
        }
        if (c2 < 0 || r2 < 0 || c2 >= w || r2 >= h) continue;
        const j = r2 * w + c2;
        if (j === i || !active[j]) continue;
        nbr[i * n + d] = j;
      }
    }
  }
  return { kind, n, half: n / 2, w, h, wrap, count, active, nbr, cx, cy };
}

export const opposite = (topo, d) => (d + topo.half) % topo.n;
export const neighbor = (topo, i, d) => topo.nbr[i * topo.n + d];

// Angle (radians, canvas convention: y down) of direction d.
export function dirAngle(n, d) {
  return ((-90 + (d * 360) / n) * Math.PI) / 180;
}

// Bounding box of active cells in unit space, including tile extents.
export function bounds(topo) {
  const ex = topo.kind === 'hex' ? HEX_R : 0.5;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < topo.count; i++) {
    if (!topo.active[i]) continue;
    x0 = Math.min(x0, topo.cx[i] - ex);
    x1 = Math.max(x1, topo.cx[i] + ex);
    y0 = Math.min(y0, topo.cy[i] - 0.5);
    y1 = Math.max(y1, topo.cy[i] + 0.5);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// Cell whose centre is nearest (x, y) in unit space, within a tile.
export function cellAt(topo, x, y) {
  let best = -1;
  let bestD = 0.36; // squared: just over the apothem
  for (let i = 0; i < topo.count; i++) {
    if (!topo.active[i]) continue;
    const dx = topo.cx[i] - x;
    const dy = topo.cy[i] - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Keyboard cursor: the nearest cell (from `allowed`) roughly in screen
// direction (dx, dy), so arrows work the same on square and hex boards.
export function stepCursor(topo, from, dx, dy, allowed = () => true) {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < topo.count; i++) {
    if (i === from || !topo.active[i] || !allowed(i)) continue;
    const vx = topo.cx[i] - topo.cx[from];
    const vy = topo.cy[i] - topo.cy[from];
    const along = vx * dx + vy * dy;
    if (along <= 0.2) continue;
    const across = Math.abs(vx * dy - vy * dx);
    if (across > along * 1.25 + 0.05) continue;
    const score = along * along + across * across * 4;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
