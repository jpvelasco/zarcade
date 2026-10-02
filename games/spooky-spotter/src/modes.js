// Spot the Difference. One scene is built from the seed, then a copy of it is
// nudged in five to seven places: something vanishes, something new turns up,
// something changes colour, moves or changes size. The changed prop has to be
// plainly visible in at least one of the two pictures, which is checked with
// the same mask machinery the hidden things use.
//
// DOM-free.

import { Rng, hashString, mix } from './rng.js';
import { PROPS, coverRects } from './props.js';
import { ROOM, ROOM_IDS, targetCount } from './rooms.js';
import { buildScene, buildMask, propBox, MIN_HIT_RADIUS } from './scene.js';

export const CHANGE_TYPES = ['remove', 'add', 'recolor', 'move', 'scale'];
const MIN_CHANGE_FRACTION = 0.5;
const MIN_CHANGE_RADIUS = 18;
const MIN_CHANGE_GAP = 128;

function visibility(props, p) {
  const blocking = [];
  for (const o of props) {
    if (o.z <= p.z) continue;
    for (const r of coverRects(PROPS[o.def], propBox(o))) blocking.push(r);
  }
  return buildMask(propBox(p), blocking);
}

function unionBox(a, b) {
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// Two differences must never share a click: neither region may swallow the
// other's centre.
function conflicts(changes, region, cx, cy, margin = 30, gap = MIN_CHANGE_GAP) {
  for (const c of changes) {
    if (Math.hypot(c.cx - cx, c.cy - cy) < gap) return true;
    if (distanceToBox(c.box, cx, cy) < margin) return true;
    if (distanceToBox(region, c.cx, c.cy) < margin) return true;
  }
  return false;
}

// A change that sits mostly under the HUD in either picture cannot be compared.
// `avoid` holds those screen corners as rects in room units.
export function underHud(avoid, region) {
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  let covered = 0;
  for (const a of avoid) {
    if (cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h) return true;
    const ix = Math.max(0, Math.min(region.x + region.w, a.x + a.w) - Math.max(region.x, a.x));
    const iy = Math.max(0, Math.min(region.y + region.h, a.y + a.h) - Math.max(region.y, a.y));
    covered += ix * iy;
  }
  return covered > 0.2 * region.w * region.h;
}

export function distanceToBox(box, px, py) {
  const dx = Math.max(box.x - px, 0, px - (box.x + box.w));
  const dy = Math.max(box.y - py, 0, py - (box.y + box.h));
  return Math.hypot(dx, dy);
}

export function buildDiff({ room = 'library', seed = 1, box, count = null, avoid = [] } = {}) {
  const def = ROOM[room];
  if (!def) throw new Error(`unknown room: ${room}`);
  const base = buildScene({ room, mode: 'diff', seed, box, items: [], extraMouse: false });
  count = count ?? targetCount('diff', ROOM_IDS.indexOf(room), base.box.w);
  const rng = new Rng(mix(hashString(`${room}|diffmut`), seed));
  const { w: W, h: H } = base.box;

  const props = base.props.map((p) => ({ ...p }));
  const byZ = new Map(props.map((p) => [p.z, p]));
  const changes = [];
  const used = Object.fromEntries(CHANGE_TYPES.map((t) => [t, 0]));
  const touched = new Set();

  function record(type, z, region) {
    const cx = region.x + region.w / 2;
    const cy = region.y + region.h / 2;
    changes.push({
      type, z, box: region, cx, cy,
      r: Math.max(MIN_HIT_RADIUS, Math.min(130, Math.max(region.w, region.h) * 0.45)),
      found: false, index: changes.length,
    });
    used[type]++;
  }

  // Props worth changing: big enough to notice, and clearly in view. The first
  // pass is picky; if the room is a narrow one and five differences will not
  // fit that way, later passes accept smaller props and tighter spacing.
  function mutatePass({ minW, minH, minFraction, gap, margin }) {
    const pool = [];
    for (const p of base.props) {
      if (p.layer > 5 || p.fam === 'frame' || touched.has(p.z)) continue;
      if (p.w < minW || p.h < minH) continue;
      if (p.x < 8 || p.x + p.w > W - 8) continue;
      const mask = visibility(base.props, p);
      if (mask.fraction < minFraction || mask.hit.r < MIN_CHANGE_RADIUS) continue;
      pool.push({ p, mask });
    }
    for (const cand of rng.shuffled(pool)) {
      if (changes.length >= count) return;
      const copy = byZ.get(cand.p.z);
      if (!copy) continue;
      // Try the least used kind of change first, and fall through when this
      // prop cannot take it (no room to move, no room to grow).
      const types = rng.shuffled(CHANGE_TYPES).sort((a, b) => used[a] - used[b]);
      for (const type of types) {
        const made = applyChange({ rng, type, base, def, props, copy, before: cand.p, W, H });
        if (!made) continue;
        const region = made.region;
        const cx = region.x + region.w / 2;
        const cy = region.y + region.h / 2;
        if (conflicts(changes, region, cx, cy, margin, gap) || underHud(avoid, region)) {
          // Undo: an ambiguous click is worse than one difference fewer. The
          // flags a change sets are not on the original, so clear them too.
          delete copy.gone;
          delete copy.recolored;
          Object.assign(copy, { ...cand.p });
          if (made.type === 'add') props.pop();
          continue;
        }
        touched.add(cand.p.z);
        record(made.type, cand.p.z, region);
        break;
      }
    }
  }

  mutatePass({ minW: 96, minH: 58, minFraction: MIN_CHANGE_FRACTION, gap: MIN_CHANGE_GAP, margin: 30 });
  if (changes.length < count) mutatePass({ minW: 74, minH: 46, minFraction: 0.42, gap: 104, margin: 18 });

  // Still short? Put something new in the emptiest corner of the second
  // picture, which always works and always reads as a difference.
  let guard = 0;
  while (changes.length < count && guard++ < 24) {
    const extra = addInGap(rng, base, def, changes, W, H, guard, avoid);
    if (!extra) break;
    props.push(extra);
    record('add', extra.z, propBox(extra));
  }

  props.sort((a, b) => a.z - b.z);
  changes.forEach((c, i) => { c.index = i; });

  return {
    room, seed, mode: 'diff', box: base.box, floorY: base.floorY, floorDepth: base.floorDepth,
    palette: base.palette, arch: base.arch,
    left: base.props, right: props, changes, base,
  };
}

// One mutation, or null when this prop cannot take that kind of change.
function applyChange({ rng, type, base, def, props, copy, before, W, H }) {
  const beforeBox = propBox(before);
  if (type === 'remove') {
    copy.gone = true;
    return { type, region: beforeBox };
  }
  if (type === 'recolor') {
    copy.tone = (before.tone + rng.range(0.35, 0.65)) % 1;
    copy.recolored = true;
    return { type, region: beforeBox };
  }
  if (type === 'move') {
    const far = Math.max(44, Math.min(before.w * 0.55, 120));
    const dx = rng.sign() * rng.range(far * 0.62, far);
    const dy = rng.chance(0.3) ? rng.sign() * rng.range(26, 54) : 0;
    if (copy.x + dx < 8 || copy.x + copy.w + dx > W - 8) return null;
    if (copy.y + dy < 8 || copy.y + copy.h + dy > H - 8) return null;
    copy.x += dx;
    copy.y += dy;
    copy.baseY += dy;
    return { type, region: unionBox(beforeBox, propBox(copy)) };
  }
  if (type === 'scale') {
    const k = rng.chance(0.5) ? rng.range(0.64, 0.76) : rng.range(1.24, 1.38);
    const nw = copy.w * k;
    const nh = copy.h * k;
    if (nw < 74 || nh < 48 || nw > W * 0.5 || copy.baseY - nh < 8) return null;
    copy.x += (copy.w - nw) / 2;
    copy.y = copy.baseY - nh;
    copy.w = nw;
    copy.h = nh;
    return { type, region: unionBox(beforeBox, propBox(copy)) };
  }
  const extra = addProp(rng, base, def, before);
  if (!extra) return null;
  props.push(extra);
  return { type: 'add', region: propBox(extra) };
}

// Something new in the second picture, dropped into the emptiest spot left on
// the floor. Sweeping a grid rather than guessing means this does not run out of
// luck in a narrow room.
function addInGap(rng, base, def, changes, W, H, round, avoid = []) {
  const pool = def.clutter.pools;
  const shrink = Math.max(0.6, 1 - (round - 1) * 0.08);
  const pdef = PROPS[pool[(round * 7) % pool.length]] || PROPS[pool[0]];
  const w = rng.range(pdef.w[0], pdef.w[1]) * 0.92 * shrink;
  const h = w * rng.range(pdef.ratio[0], pdef.ratio[1]);
  let best = null;
  for (let i = 0; i <= 40; i++) {
    const cx = w / 2 + 14 + (i / 40) * Math.max(0, W - w - 28);
    for (let j = 0; j <= 10; j++) {
      const baseY = Math.min(H - 20, base.floorY + (0.35 + j * 0.065) * base.floorDepth);
      if (baseY - h < 18) continue;
      const region = { x: cx - w / 2, y: baseY - h, w, h };
      if (underHud(avoid, region)) continue;
      const cy = baseY - h / 2;
      let room = Infinity;
      for (const c of changes) {
        room = Math.min(room, distanceToBox(c.box, cx, cy), distanceToBox(region, c.cx, c.cy));
      }
      if (!changes.length) room = 999;
      if (!best || room > best.room) best = { region, cx, baseY, room };
    }
  }
  if (!best || best.room < 14) return null;
  const topZ = base.props.reduce((m, p) => (p.layer <= 5 && p.z > m ? p.z : m), 0) + 0.6 + round * 0.01;
  return {
    def: pdef.id, fam: pdef.fam, layer: 4, x: best.region.x, y: best.region.y, w, h,
    depth: 0.9, flip: rng.chance(0.4), tone: rng.next(), vr: (rng.next() * 4294967296) >>> 0,
    baseY: best.baseY, z: topZ, added: true,
  };
}

// A small prop that only exists in the second picture, standing clear of the
// prop it is paired with.
function addProp(rng, base, def, near) {
  const pool = def.clutter.pools;
  const { w: W, h: H } = base.box;
  const topZ = base.props.reduce((m, p) => (p.layer <= 5 && p.z > m ? p.z : m), 0) + 0.6;
  for (let tries = 0; tries < 40; tries++) {
    const pdef = PROPS[rng.pick(pool)];
    if (!pdef) continue;
    const w = rng.range(pdef.w[0], pdef.w[1]) * 0.95;
    const h = w * rng.range(pdef.ratio[0], pdef.ratio[1]);
    const cx = near
      ? near.x + near.w / 2 + rng.sign() * rng.range(near.w * 0.6, near.w * 0.9)
      : rng.range(w / 2 + 16, W - w / 2 - 16);
    if (cx - w / 2 < 14 || cx + w / 2 > W - 14) continue;
    const baseY = Math.min(H - 24, base.floorY + rng.range(0.55, 0.95) * base.floorDepth);
    if (baseY - h < 20) continue;
    return {
      def: pdef.id, fam: pdef.fam, layer: 5, x: cx - w / 2, y: baseY - h, w, h,
      depth: 0.9, flip: rng.chance(0.4), tone: rng.next(), vr: (rng.next() * 4294967296) >>> 0,
      baseY, z: topZ, added: true,
    };
  }
  return null;
}

export function diffHitTest(diff, wx, wy, tolerance = 30) {
  let best = null;
  let bestD = Infinity;
  for (const c of diff.changes) {
    if (c.found) continue;
    // Distance to the region, then to its middle, so overlapping regions still
    // resolve to one answer.
    const d = distanceToBox(c.box, wx, wy) + Math.hypot(c.cx - wx, c.cy - wy) * 0.001;
    if (d <= tolerance + 1 && d < bestD) { best = c; bestD = d; }
  }
  return best;
}

export function diffRemaining(diff) {
  return diff.changes.filter((c) => !c.found).length;
}

export function diffHintArea(diff) {
  const open = diff.changes.filter((c) => !c.found);
  if (!open.length) return null;
  const c = open[0];
  return { x: c.cx, y: c.cy, r: Math.max(165, c.r * 1.5), index: c.index };
}

// The props one picture actually draws (the removed one is simply skipped).
export function visibleProps(list) {
  return list.filter((p) => !p.gone);
}
