// Where a train is inside a cell. DOM-free; units are cells (0..1).

import { opposite } from './pieces.js';

const EDGE = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
const CORNER = { '0,1': [1, 0], '1,2': [1, 1], '2,3': [0, 1], '0,3': [0, 0] };
const cornerOf = (a, b) => CORNER[a < b ? `${a},${b}` : `${b},${a}`];

export const edgePoint = (e) => EDGE[e];

// Arc-length of a segment, in cells.
export function segLength(seg) {
  if (seg.kind === 'depart' || seg.kind === 'arrive' || seg.kind === 'in' || seg.kind === 'out' || seg.kind === 'wait') return 0.5;
  return seg.entry === opposite(seg.exit) ? 1 : Math.PI / 4;
}

// Point and heading (radians, 0 = east, clockwise positive like canvas) at
// arc-length s (0..segLength) along a segment.
export function pointAt(seg, s) {
  const k = seg.kind;
  if (k === 'wait') {
    const [ex, ey] = EDGE[seg.exit];
    const ang = Math.atan2(ey - 0.5, ex - 0.5);
    return { x: 0.5 - Math.cos(ang) * 0.12, y: 0.5 - Math.sin(ang) * 0.12, a: ang };
  }
  if (k === 'depart' || k === 'out') {
    const [ex, ey] = EDGE[seg.exit];
    const t = s / 0.5;
    return { x: 0.5 + (ex - 0.5) * t, y: 0.5 + (ey - 0.5) * t, a: Math.atan2(ey - 0.5, ex - 0.5) };
  }
  if (k === 'arrive' || k === 'in') {
    const [ex, ey] = EDGE[seg.entry];
    const t = s / 0.5;
    return { x: ex + (0.5 - ex) * t, y: ey + (0.5 - ey) * t, a: Math.atan2(0.5 - ey, 0.5 - ex) };
  }
  const [ax, ay] = EDGE[seg.entry];
  const [bx, by] = EDGE[seg.exit];
  if (seg.entry === opposite(seg.exit)) {
    return { x: ax + (bx - ax) * s, y: ay + (by - ay) * s, a: Math.atan2(by - ay, bx - ax) };
  }
  const [cx, cy] = cornerOf(seg.entry, seg.exit);
  const a0 = Math.atan2(ay - cy, ax - cx);
  const a1 = Math.atan2(by - cy, bx - cx);
  let d = a1 - a0;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  const t = s / (Math.PI / 4);
  const ang = a0 + d * t;
  const x = cx + Math.cos(ang) * 0.5, y = cy + Math.sin(ang) * 0.5;
  return { x, y, a: ang + (d > 0 ? Math.PI / 2 : -Math.PI / 2) };
}

// Path for drawing a piece's track from edge a to edge b, as canvas ops in
// cell units: { line: [x0, y0, x1, y1] } or { arc: [cx, cy, r, a0, a1, ccw] }.
export function trackPath(a, b) {
  const [ax, ay] = EDGE[a];
  const [bx, by] = EDGE[b];
  if (a === opposite(b)) return { line: [ax, ay, bx, by] };
  const [cx, cy] = cornerOf(a, b);
  const a0 = Math.atan2(ay - cy, ax - cx);
  const a1 = Math.atan2(by - cy, bx - cx);
  let d = a1 - a0;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return { arc: [cx, cy, 0.5, a0, a1, d < 0] };
}

// Ease the very start and end of a run so trains pull away and pull in.
export function easedS(seg, u) {
  const len = segLength(seg);
  let t = u;
  if (seg.kind === 'depart') t = u * u * (1.5 - 0.5 * u); // gentle start
  else if (seg.kind === 'arrive') t = 1 - (1 - u) * (1 - u);
  return t * len;
}
