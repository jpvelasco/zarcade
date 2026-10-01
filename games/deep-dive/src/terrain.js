// Marching squares over the corner densities. DOM-free: returns plain point
// lists that the renderer fills and strokes when baking terrain chunks.

const ISO = 0.5;

function lerp(p, q, va, vb) {
  const t = (ISO - va) / (vb - va || 1e-6);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

// The solid part of one cell as a polygon, plus its contour segments (the
// rock edge inside the cell). Corners: a top-left, b top-right, c
// bottom-right, d bottom-left; (x, y) is the top-left in pixels.
export function cellShape(a, b, c, d, x, y, size) {
  const pts = [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
  const vals = [a, b, c, d];
  const poly = [];
  const crossings = []; // [point, leavingRock]
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const si = vals[i] > ISO, sj = vals[j] > ISO;
    if (si) poly.push(pts[i]);
    if (si !== sj) {
      const p = lerp(pts[i], pts[j], vals[i], vals[j]);
      poly.push(p);
      crossings.push([p, si]);
    }
  }
  // Each "leaving rock" crossing joins the next "entering rock" one.
  const segments = [];
  for (let k = 0; k < crossings.length; k++) {
    const [p, leaving] = crossings[k];
    if (!leaving) continue;
    const next = crossings[(k + 1) % crossings.length];
    if (next && !next[1]) segments.push([p, next[0]]);
  }
  return { poly: poly.length >= 3 ? poly : null, segments, full: a > ISO && b > ISO && c > ISO && d > ISO };
}

// Walk a block of cells and collect shapes. `corner(x, y)` returns the
// density at grid corner (x, y).
export function chunkShapes(corner, cx0, cy0, cols, rows, cell) {
  const polys = [];
  const segments = [];
  const full = [];
  for (let cy = cy0; cy < cy0 + rows; cy++) {
    for (let cx = cx0; cx < cx0 + cols; cx++) {
      const a = corner(cx, cy), b = corner(cx + 1, cy), c = corner(cx + 1, cy + 1), d = corner(cx, cy + 1);
      if (a <= ISO && b <= ISO && c <= ISO && d <= ISO) continue;
      const shape = cellShape(a, b, c, d, cx * cell, cy * cell, cell);
      if (shape.full) full.push([cx * cell, cy * cell]);
      else if (shape.poly) polys.push(shape.poly);
      for (const s of shape.segments) segments.push(s);
    }
  }
  return { polys, segments, full };
}
