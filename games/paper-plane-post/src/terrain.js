// The ground line. A list of control points, smoothed, with a surface kind per
// span. Pure: the simulation asks for a height, the renderer asks for the same
// height, so what you see is what you land on.
//
// y grows downward, so a hilltop is a more negative number than a valley.

export const SURFACES = ['grass', 'rock', 'water', 'snow', 'sand'];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * `points` is a list of `[x, y]` or `[x, y, kind]`. The kind on a point
 * applies to the span that starts there; the first point defaults to grass.
 */
export function makeTerrain(points, { kind = 'grass' } = {}) {
  const nodes = points.map(([x, y, k], index) => ({ x, y, kind: k || (index === 0 ? kind : null) }));
  // Fill gaps so every span knows its surface.
  let current = nodes[0].kind || kind;
  for (const node of nodes) {
    if (node.kind) current = node.kind;
    else node.kind = current;
  }
  return {
    nodes,
    x0: nodes[0].x,
    x1: nodes[nodes.length - 1].x,
    /** Index of the span containing x, clamped to the ends. */
    spanAt(x) {
      let lo = 0;
      let hi = nodes.length - 1;
      if (x <= nodes[0].x) return 0;
      if (x >= nodes[hi].x) return hi - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (nodes[mid].x <= x) lo = mid;
        else hi = mid;
      }
      return lo;
    },
    /** Smooth ground height at x. */
    heightAt(x) {
      const i = this.spanAt(x);
      const a = nodes[i];
      const b = nodes[Math.min(nodes.length - 1, i + 1)];
      if (b.x === a.x) return a.y;
      const t = clamp((x - a.x) / (b.x - a.x), 0, 1);
      // Cosine easing: rounded hills instead of folded paper.
      const s = 0.5 - 0.5 * Math.cos(Math.PI * t);
      return a.y + (b.y - a.y) * s;
    },
    kindAt(x) {
      return nodes[this.spanAt(x)].kind;
    },
    /** Downhill slope (dy/dx) at x, for ridge lift and for drawing. */
    slopeAt(x) {
      const h = 2;
      return (this.heightAt(x + h) - this.heightAt(x - h)) / (2 * h);
    },
    /** Append more control points; Endless Breeze grows the valley this way. */
    extend(more) {
      let last = nodes[nodes.length - 1].kind;
      for (const [x, y, k] of more) {
        if (k) last = k;
        nodes.push({ x, y, kind: last });
      }
      this.x1 = nodes[nodes.length - 1].x;
      return this;
    },
    /** Drop control points well behind the plane so Endless stays small. */
    trim(beforeX) {
      let cut = 0;
      while (cut + 2 < nodes.length && nodes[cut + 1].x < beforeX) cut += 1;
      if (cut > 0) {
        nodes.splice(0, cut);
        this.x0 = nodes[0].x;
      }
      return this;
    },
  };
}

/** The lowest (most negative) point of a terrain, for camera limits. */
export function highestPoint(terrain) {
  let best = Infinity;
  for (const node of terrain.nodes) best = Math.min(best, node.y);
  return best;
}
