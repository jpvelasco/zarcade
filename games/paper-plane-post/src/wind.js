// The air. A field summed from a handful of data-only sources plus one
// constant regional breeze.
//
// Pure and cheap: the simulation, the autopilot's lookahead and the renderer's
// drifting ribbons all read the same `windAt`, so what you see is what pushes
// the plane.

const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** 1 at the middle, 0 at the edge, smooth in between. */
const bell = (t) => {
  const a = Math.abs(t);
  if (a >= 1) return 0;
  const u = 1 - a * a;
  return u * u;
};
const smoothstep = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

/** Warm air rising off a chimney, a campfire or sun-baked rock. */
export const updraft = (x, base, h, w, s, extra = {}) =>
  ({ t: 'up', x, y: base, h, w, s, ...extra });
/** Lift that hugs a slope: wide, leaning downwind. */
export const ridge = (x, base, h, w, s, extra = {}) =>
  ({ t: 'ridge', x, y: base, h, w, s, ...extra });
/** A horizontal band of moving air. Positive `s` pushes the plane onward. */
export const band = (x, y, w, h, s, extra = {}) =>
  ({ t: 'band', x, y, w, h, s, ...extra });
/** A band that breathes: the same spot is never quite the same twice. */
export const gust = (x, y, w, h, s, period = 3.4, extra = {}) =>
  ({ t: 'gust', x, y, w, h, s, period, phase: extra.phase ?? 0, ...extra });
/** A rain cloud: pushes down, and soaks the paper. */
export const rain = (x, y, w, h, s = 4, extra = {}) =>
  ({ t: 'rain', x, y, w, h, s, rain: extra.rain ?? 1, ...extra });
/** A sunbeam: gentle lift and the paper dries twice as fast. */
export const sunbeam = (x, y, w, h, s = 2.6, extra = {}) =>
  ({ t: 'sun', x, y, w, h, s, dry: extra.dry ?? 2.4, ...extra });

/** Bounding box in world units, used for culling and for drawing. */
export function sourceBounds(source) {
  switch (source.t) {
    case 'up':
    case 'ridge':
      return { x0: source.x - source.w, x1: source.x + source.w, y0: source.y - source.h, y1: source.y + source.h * 0.12 };
    default:
      return { x0: source.x - source.w, x1: source.x + source.w, y0: source.y - source.h, y1: source.y + source.h };
  }
}

/** How strongly `source` is felt at (x, y), 0..1. */
export function sourceStrength(source, x, y, time = 0) {
  switch (source.t) {
    case 'up':
    case 'ridge': {
      const lean = source.t === 'ridge' ? (source.y - y) * 0.22 : 0;
      const across = bell((x - (source.x + lean)) / source.w);
      if (across <= 0) return 0;
      // Strongest at the base and fading slowly with height, with a soft lip
      // underneath: dive into the warm core and the column pays you back.
      const up = (source.y - y) / source.h;
      if (up > 1) return 0;
      const along = up >= 0 ? (1 - up) ** 0.6 : smoothstep(1 + up * 7);
      return across * along;
    }
    case 'band':
    case 'rain':
    case 'sun': {
      return bell((x - source.x) / source.w) * bell((y - source.y) / source.h);
    }
    case 'gust': {
      const shape = bell((x - source.x) / source.w) * bell((y - source.y) / source.h);
      if (shape <= 0) return 0;
      const pulse = 0.55 + 0.45 * Math.sin(TAU * (time / source.period + source.phase));
      return shape * pulse;
    }
    default:
      return 0;
  }
}

/**
 * Air movement at a point: `{ x, y, rain, dry }` in m/s plus how hard it is
 * raining there (0..1) and how fast paper dries (1 = normal).
 *
 * `out` lets the caller reuse one object so the frame loop allocates nothing.
 */
export function windAt(sources, x, y, time = 0, breeze = null, out = { x: 0, y: 0, rain: 0, dry: 1, lift: 0 }) {
  out.x = breeze ? breeze.x : 0;
  out.y = breeze ? breeze.y : 0;
  out.rain = 0;
  out.dry = 1;
  out.lift = 0;
  if (!sources) return out;
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    // Cheap reject before the smooth falloff maths.
    if (x < source.x - source.w || x > source.x + source.w) continue;
    const strength = sourceStrength(source, x, y, time);
    if (strength <= 0) continue;
    switch (source.t) {
      case 'up':
      case 'ridge':
      case 'sun':
        out.y -= source.s * strength;
        out.lift += source.s * strength;
        if (source.t === 'sun') out.dry = Math.max(out.dry, 1 + (source.dry - 1) * strength);
        if (source.t === 'ridge') out.x += source.s * strength * 0.3;
        break;
      case 'band':
      case 'gust':
        out.x += source.s * strength;
        if (source.lift) out.y -= source.lift * strength;
        break;
      case 'rain':
        out.y += source.s * strength;
        out.rain = Math.max(out.rain, source.rain * strength);
        break;
      default:
        break;
    }
  }
  return out;
}

/** Sources whose bounding box overlaps a view rectangle, for drawing. */
export function sourcesInView(sources, x0, x1, y0, y1) {
  const found = [];
  for (const source of sources) {
    const box = sourceBounds(source);
    if (box.x1 < x0 || box.x0 > x1 || box.y1 < y0 || box.y0 > y1) continue;
    found.push(source);
  }
  return found;
}
