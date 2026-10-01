// Arena data and the rules of each floor: where the ground is, how it moves
// and how it pushes blobs around. DOM-free; the renderer only reads it.
//
// Every arena is centred on (0, 0) and fits inside `extent`. A blob whose
// centre leaves the floor falls off.

export const ARENAS = [
  {
    id: 'pudding', name: 'Pudding Plate', blurb: 'A classic wobbly plate. No tricks, just bonks.',
    kind: 'disc', r: 330, extent: 340,
    theme: { sky: ['#ffd6f0', '#ff9ccf'], top: '#ffe8b0', top2: '#f7c86e', side: '#c9813d', rim: '#fff6dc', deco: 'sprinkles', glow: '#ffb4dc' },
  },
  {
    id: 'sundae', name: 'Shrinkin\' Sundae', blurb: 'The ice cream melts away. Stay in the middle!',
    kind: 'shrink', r: 340, rMin: 125, shrinkAt: 6, shrinkTime: 42, extent: 350,
    theme: { sky: ['#c8f1ff', '#7fc9ff'], top: '#fff1f6', top2: '#ffc2d8', side: '#e07fa6', rim: '#ffffff', deco: 'swirl', glow: '#ffd2e5' },
  },
  {
    id: 'rink', name: 'Frosty Rink', blurb: 'Super slippery ice. Brake early!',
    kind: 'rect', w: 640, h: 500, round: 110, extent: 330, friction: 0.55, accelMul: 0.42,
    theme: { sky: ['#dff4ff', '#8fb8ff'], top: '#e8fbff', top2: '#a8e4ff', side: '#5a8fd6', rim: '#ffffff', deco: 'ice', glow: '#c8f2ff' },
  },
  {
    id: 'conveyor', name: 'Conveyor Cafe', blurb: 'The belts carry you away. Walk against the flow.',
    kind: 'conveyor', w: 620, h: 560, extent: 320,
    belts: [{ y: -170, h: 110, v: 150 }, { y: 0, h: 110, v: -170 }, { y: 170, h: 110, v: 150 }],
    theme: { sky: ['#ffe6c2', '#ffb27a'], top: '#fdf3df', top2: '#e9d4ad', side: '#a26a3a', rim: '#fff9ee', deco: 'tiles', glow: '#ffd59a' },
  },
  {
    id: 'spin', name: 'Spin Cycle', blurb: 'A turntable that never stops. Hold on!',
    kind: 'turntable', r: 330, omega: 0.75, hub: 46, extent: 340,
    theme: { sky: ['#e5dcff', '#a68cff'], top: '#f4ecff', top2: '#cdb8ff', side: '#7a5bd1', rim: '#ffffff', deco: 'spokes', glow: '#d8c8ff' },
  },
  {
    id: 'bumpers', name: 'Bumper Garden', blurb: 'Bouncy mushrooms fling you around.',
    kind: 'disc', r: 335, extent: 345,
    bumpers: [{ x: 0, y: 0, r: 42 }, { x: -165, y: -95, r: 34 }, { x: 165, y: -95, r: 34 }, { x: -165, y: 115, r: 34 }, { x: 165, y: 115, r: 34 }],
    theme: { sky: ['#d9ffd6', '#86e6a8'], top: '#c9f59a', top2: '#8fd468', side: '#5a8a3a', rim: '#efffd8', deco: 'flowers', glow: '#e6ffc0' },
  },
  {
    id: 'lava', name: 'Lava Lagoon', blurb: 'The lava rises. Climb to the high ground.',
    kind: 'terraces', extent: 345, riseAt: 8, riseTime: 54,
    tiers: [
      { x: 0, y: 0, r: 335, h: 1 },
      { x: -150, y: -70, r: 150, h: 2 }, { x: 160, y: -60, r: 140, h: 2 }, { x: 0, y: 140, r: 150, h: 2 },
      { x: -90, y: 10, r: 105, h: 3 }, { x: 95, y: 30, r: 100, h: 3 },
      { x: 0, y: 0, r: 80, h: 4 },
    ],
    theme: { sky: ['#ffcf9a', '#ff6a4a'], top: '#b9876a', top2: '#8a5b45', side: '#5a3426', rim: '#e6b58c', deco: 'rocks', glow: '#ff9a4a' },
  },
  {
    id: 'seesaw', name: 'Teeter Tower', blurb: 'A giant seesaw. Everyone slides to the low end.',
    kind: 'seesaw', len: 720, wid: 250, extent: 360,
    theme: { sky: ['#fff4c2', '#ffc85a'], top: '#ffd98a', top2: '#e8a64a', side: '#9a5a22', rim: '#fff0c8', deco: 'planks', glow: '#ffe6a0' },
  },
  {
    id: 'cookie', name: 'Crumble Cookie', blurb: 'Tiles crack under you. Keep moving!',
    kind: 'tiles', cols: 7, rows: 7, size: 86, gap: 6, cut: 2, crack: 1.4, regrow: 7, extent: 330,
    theme: { sky: ['#ffe9d6', '#e8a77a'], top: '#e9b77a', top2: '#c98a4c', side: '#7a4a24', rim: '#f8d6a6', deco: 'chips', glow: '#ffd2a0' },
  },
  {
    id: 'donut', name: 'Donut Drift', blurb: 'Mind the hole in the middle!',
    kind: 'donut', r: 345, inner: 120, extent: 355,
    theme: { sky: ['#ffe0f5', '#c79bff'], top: '#ff8fc8', top2: '#ff5fa8', side: '#b9784a', rim: '#ffd0e8', deco: 'sprinkles', glow: '#ffb8e0' },
  },
];

export const ARENA_IDS = ARENAS.map((a) => a.id);
export const arenaById = (id) => ARENAS.find((a) => a.id === id) || null;

// Seesaw tuning.
const SEESAW = { torque: 0.000014, damp: 2.2, spring: 1.4, max: 0.3, slide: 1500 };

// ------------------------------------------------------------- state

export function createArenaState(arena, { persistent = false } = {}) {
  const st = {
    arena, kind: arena.kind, t: 0, persistent,
    r: arena.r || 0, // current radius for shrinking discs
    angle: 0, // turntable spin
    tilt: 0, tiltV: 0, // seesaw
    level: 0, // lava height (tiers at or below are under lava)
    tiles: null,
    bumpers: arena.bumpers || [],
    extent: arena.extent,
    friction: arena.friction ?? 1,
    accelMul: arena.accelMul ?? 1,
    // Sudden death: anything outside this radius is gone. Infinity = off.
    storm: Infinity,
  };
  if (arena.kind === 'tiles') st.tiles = buildTiles(arena);
  return st;
}

function buildTiles(a) {
  const tiles = [];
  const pitch = a.size + a.gap;
  const ox = -((a.cols - 1) * pitch) / 2;
  const oy = -((a.rows - 1) * pitch) / 2;
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < a.cols; c++) {
      // Cut the corners for a rounder cookie.
      const dc = Math.min(c, a.cols - 1 - c), dr = Math.min(r, a.rows - 1 - r);
      if (dc + dr < a.cut) continue;
      tiles.push({ x: ox + c * pitch, y: oy + r * pitch, half: a.size / 2, crack: 0, gone: false, regrow: 0 });
    }
  }
  return tiles;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Advance the floor. `blobs` lets the seesaw feel weight and tiles crack.
export function updateArena(st, dt, blobs, playing) {
  st.t += dt;
  const a = st.arena;
  switch (st.kind) {
    case 'shrink': {
      if (st.persistent) {
        const k = 0.5 + 0.5 * Math.cos((Math.max(0, st.t - a.shrinkAt) / 40) * Math.PI * 2);
        st.r = a.rMin + (a.r - a.rMin) * (0.35 + 0.65 * k);
      } else {
        st.r = a.r - (a.r - a.rMin) * clamp01((st.t - a.shrinkAt) / a.shrinkTime);
      }
      break;
    }
    case 'turntable':
      st.angle += a.omega * dt;
      break;
    case 'terraces': {
      const top = a.tiers.reduce((m, t) => Math.max(m, t.h), 0);
      if (st.persistent) {
        // Rises and falls, never drowning the top two tiers.
        const p = Math.max(0, st.t - a.riseAt) / 50;
        st.level = (top - 2) * (0.5 - 0.5 * Math.cos(p * Math.PI * 2)) + 0.6;
      } else {
        st.level = (top - 1) * clamp01((st.t - a.riseAt) / a.riseTime) + Math.min(0.6, st.t / 10);
      }
      break;
    }
    case 'seesaw': {
      let torque = 0;
      for (const b of blobs) {
        if (!b.grounded) continue;
        torque += b.mass * b.x * (b.pounding ? 3 : 1);
      }
      const acc = torque * SEESAW.torque * 60 - SEESAW.spring * st.tilt - SEESAW.damp * st.tiltV;
      st.tiltV += acc * dt;
      st.tilt += st.tiltV * dt;
      if (st.tilt > SEESAW.max) { st.tilt = SEESAW.max; st.tiltV = Math.min(0, st.tiltV); }
      if (st.tilt < -SEESAW.max) { st.tilt = -SEESAW.max; st.tiltV = Math.max(0, st.tiltV); }
      break;
    }
    case 'tiles': {
      for (const tile of st.tiles) {
        if (tile.gone) {
          if (st.persistent) {
            tile.regrow -= dt;
            if (tile.regrow <= 0) { tile.gone = false; tile.crack = 0; }
          }
          continue;
        }
        if (tile.crack > 0) {
          tile.crack += dt;
          if (tile.crack >= a.crack) { tile.gone = true; tile.crack = 0; tile.regrow = a.regrow; }
        }
      }
      if (playing && st.t > 2) {
        for (const b of blobs) if (b.grounded) crackAt(st, b.x, b.y, b.radius * 0.6, false);
      }
      break;
    }
    default:
  }
}

// Start cracking tiles under a point. A pound breaks them almost at once.
export function crackAt(st, x, y, reach, instant) {
  if (!st.tiles) return 0;
  let n = 0;
  for (const tile of st.tiles) {
    if (tile.gone) continue;
    const h = tile.half + reach;
    if (Math.abs(x - tile.x) > h || Math.abs(y - tile.y) > h) continue;
    if (instant) { tile.crack = Math.max(tile.crack, st.arena.crack * 0.6); n++; }
    else if (tile.crack === 0) { tile.crack = 0.0001; n++; }
  }
  return n;
}

// The world-space x of a point on the tilted seesaw stays the same; the
// plank just looks lower on one side. Its footprint shrinks a little.
function seesawHalfLen(st) {
  return (st.arena.len / 2) * Math.cos(st.tilt);
}

function inRoundRect(x, y, w, h, r) {
  const ax = Math.abs(x) - (w / 2 - r), ay = Math.abs(y) - (h / 2 - r);
  if (ax <= 0 && Math.abs(y) <= h / 2) return true;
  if (ay <= 0 && Math.abs(x) <= w / 2) return true;
  return ax * ax + ay * ay <= r * r;
}

// Is there ground at (x, y)?
export function onFloor(st, x, y) {
  if (st.storm !== Infinity && x * x + y * y > st.storm * st.storm) return false;
  const a = st.arena;
  switch (st.kind) {
    case 'disc':
    case 'turntable':
      return x * x + y * y <= a.r * a.r;
    case 'shrink':
      return x * x + y * y <= st.r * st.r;
    case 'donut': {
      const d2 = x * x + y * y;
      return d2 <= a.r * a.r && d2 >= a.inner * a.inner;
    }
    case 'rect':
      return inRoundRect(x, y, a.w, a.h, a.round);
    case 'conveyor':
      return Math.abs(x) <= a.w / 2 && Math.abs(y) <= a.h / 2;
    case 'seesaw':
      return Math.abs(x) <= seesawHalfLen(st) && Math.abs(y) <= a.wid / 2;
    case 'terraces':
      return tierAt(st, x, y) !== null;
    case 'tiles':
      for (const tile of st.tiles) {
        if (tile.gone) continue;
        if (Math.abs(x - tile.x) <= tile.half + st.arena.gap / 2 && Math.abs(y - tile.y) <= tile.half + st.arena.gap / 2) return true;
      }
      return false;
    default:
      return false;
  }
}

// The highest tier above the lava under (x, y), or null.
export function tierAt(st, x, y) {
  let best = null;
  for (const t of st.arena.tiers) {
    if (t.h <= st.level) continue;
    const dx = x - t.x, dy = y - t.y;
    if (dx * dx + dy * dy <= t.r * t.r && (!best || t.h > best.h)) best = t;
  }
  return best;
}

// Velocity of the ground under a point (belts and the turntable carry you).
export function floorVelocity(st, x, y, out) {
  out.x = 0; out.y = 0;
  const a = st.arena;
  if (st.kind === 'conveyor') {
    for (const belt of a.belts) {
      if (Math.abs(y - belt.y) <= belt.h / 2) { out.x = belt.v; break; }
    }
  } else if (st.kind === 'turntable') {
    const d2 = x * x + y * y;
    if (d2 <= a.r * a.r) { out.x = -a.omega * y; out.y = a.omega * x; }
  }
  return out;
}

// Extra acceleration from the floor itself: the seesaw's slope and the
// turntable's outward fling.
export function floorAccel(st, x, y, out) {
  out.x = 0; out.y = 0;
  if (st.kind === 'seesaw') out.x = SEESAW.slide * Math.sin(st.tilt);
  else if (st.kind === 'turntable') {
    const w = st.arena.omega;
    out.x = w * w * x * 0.9; out.y = w * w * y * 0.9;
  }
  return out;
}

// True when the whole circle of radius `margin` around (x, y) is on the floor.
export function safeAt(st, x, y, margin) {
  if (!onFloor(st, x, y)) return false;
  if (margin <= 0) return true;
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    if (!onFloor(st, x + Math.cos(ang) * margin, y + Math.sin(ang) * margin)) return false;
  }
  return true;
}

// A random point with ground all around it (for spawns, coins, power-ups).
export function randomFloorPoint(st, rng, margin = 40, tries = 40) {
  const e = st.extent;
  for (let i = 0; i < tries; i++) {
    const x = (rng.next() * 2 - 1) * e, y = (rng.next() * 2 - 1) * e;
    if (safeAt(st, x, y, margin) && !inBumper(st, x, y, margin)) return { x, y };
  }
  // Shrink the margin and fall back to the safest-known spot.
  if (margin > 10) return randomFloorPoint(st, rng, margin / 2, tries);
  return safestPoint(st);
}

export function inBumper(st, x, y, pad = 0) {
  for (const b of st.bumpers) {
    const dx = x - b.x, dy = y - b.y, r = b.r + pad;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

// The point that stays on the floor longest: the centre for most arenas,
// the top tier for the lava, the ring for the donut.
export function safestPoint(st) {
  const a = st.arena;
  if (st.kind === 'donut') return { x: (a.r + a.inner) / 2, y: 0 };
  if (st.kind === 'terraces') {
    const t = tierAt(st, 0, 0) ? { x: 0, y: 0 } : null;
    if (t) return t;
    let best = null;
    for (const tier of a.tiers) if (tier.h > st.level && (!best || tier.h > best.h)) best = tier;
    return best ? { x: best.x, y: best.y } : { x: 0, y: 0 };
  }
  if (st.kind === 'tiles') {
    let best = null, bd = Infinity;
    for (const tile of st.tiles) {
      if (tile.gone || tile.crack > 0) continue;
      const d = tile.x * tile.x + tile.y * tile.y;
      if (d < bd) { bd = d; best = tile; }
    }
    return best ? { x: best.x, y: best.y } : { x: 0, y: 0 };
  }
  if (st.kind === 'turntable') return { x: a.hub + 50, y: 0 };
  if (st.bumpers.some((b) => b.x === 0 && b.y === 0)) return { x: 0, y: 95 };
  return { x: 0, y: 0 };
}

// Four starting spots around the arena, on solid ground.
export function spawnPoints(st, count) {
  const a = st.arena;
  const pts = [];
  if (st.kind === 'seesaw') {
    const spots = [[-250, -50], [250, 50], [-100, 60], [100, -60]];
    for (let i = 0; i < count; i++) pts.push({ x: spots[i % 4][0], y: spots[i % 4][1] });
    return pts;
  }
  let rad;
  if (st.kind === 'donut') rad = (a.r + a.inner) / 2;
  else if (st.kind === 'rect' || st.kind === 'conveyor') rad = 170;
  else if (st.kind === 'tiles') rad = 175;
  else rad = Math.min(190, (st.r || a.extent) * 0.58);
  for (let i = 0; i < count; i++) {
    const ang = Math.PI * 0.75 + (i / Math.max(2, count)) * Math.PI * 2;
    let x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
    if (inBumper(st, x, y, 40)) { x *= 0.75; y *= 0.75; }
    pts.push({ x, y });
  }
  return pts;
}

// King of the Hill zone spots for an arena, all on solid ground at the start.
export function zoneSpots(st) {
  const a = st.arena;
  if (st.kind === 'seesaw') return [{ x: 0, y: 0 }, { x: -200, y: 0 }, { x: 200, y: 0 }];
  if (st.kind === 'donut') {
    const r = (a.r + a.inner) / 2;
    return [0, 1, 2, 3, 4, 5].map((k) => ({ x: Math.cos((k / 6) * Math.PI * 2 + 0.5) * r, y: Math.sin((k / 6) * Math.PI * 2 + 0.5) * r }));
  }
  if (st.kind === 'terraces') return a.tiers.filter((t) => t.h >= 3).map((t) => ({ x: t.x, y: t.y }));
  const r = st.kind === 'shrink' ? 80 : 150;
  const pts = [{ x: 0, y: 0 }];
  for (let k = 0; k < 8; k++) pts.push({ x: Math.cos((k / 8) * Math.PI * 2 + 0.4) * r, y: Math.sin((k / 8) * Math.PI * 2 + 0.4) * r });
  const ok = pts.filter((p) => safeAt(st, p.x, p.y, 50) && !inBumper(st, p.x, p.y, 40));
  // Keep them spread out: drop spots too close to one already kept.
  const kept = [];
  for (const p of ok) if (kept.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > r * 0.7)) kept.push(p);
  return kept;
}
