// Scene composition. A room is built from a seed: architecture, furniture into
// bays, clutter, front props, then the ghosts' lost things tucked into the hide
// slots the props offer.
//
// The promise this module keeps is that every hidden thing can actually be
// found: each target carries a visibility mask built from the cover rects of
// everything drawn in front of it, and a placement is rejected unless enough of
// it shows and a finger-sized disc fits inside the visible part. The same mask
// answers clicks at run time, so the half of a sock that is behind the curtain
// does not respond and the half that shows does.
//
// DOM-free on purpose: tests/scene.test.js builds every room at many seeds and
// checks the promise.

import { Rng, hashString, mix } from './rng.js';
import { PROPS, coverRects, slotPoints } from './props.js';
import { ITEM, FINDABLE } from './items.js';
import { ROOM, WORLD_H, targetCount, clutterScale } from './rooms.js';
import { assignOwners, ghostsOf } from './ghosts.js';

export const CELL = 4;                 // mask resolution in world units
export const MIN_FRACTION = 0.45;      // at least this much of a target shows
export const MIN_AREA = 950;           // ... and at least this many world px²
export const MIN_HIT_RADIUS = 13;      // ... with room for a fingertip
export const EDGE_MARGIN = 44;         // never touch the room edges
// Keep finds apart, but not so far apart that a narrow phone-shaped room runs
// out of places to put them.
export function targetGap(width) {
  return Math.min(165, Math.max(108, width / 8));
}

// ---------------------------------------------------------------- geometry

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function propBox(p) {
  return { x: p.x, y: p.y, w: p.w, h: p.h };
}

// --------------------------------------------------------------- the mask
//
// A grid over `box`; cells are visible (1) when no cover rect of a prop drawn
// later holds their centre. The mask keeps only the largest connected visible
// blob, so a thing split into slivers by a chair's legs is not called findable.

export function buildMask(box, covers) {
  const cols = Math.max(1, Math.ceil(box.w / CELL));
  const rows = Math.max(1, Math.ceil(box.h / CELL));
  const bits = new Uint8Array(cols * rows).fill(1);
  for (const c of covers) {
    if (!rectsOverlap(box, c)) continue;
    const i0 = Math.max(0, Math.floor((c.x - box.x) / CELL));
    const i1 = Math.min(cols - 1, Math.ceil((c.x + c.w - box.x) / CELL));
    const j0 = Math.max(0, Math.floor((c.y - box.y) / CELL));
    const j1 = Math.min(rows - 1, Math.ceil((c.y + c.h - box.y) / CELL));
    for (let j = j0; j <= j1; j++) {
      const cy = box.y + (j + 0.5) * CELL;
      if (cy < c.y || cy > c.y + c.h) continue;
      for (let i = i0; i <= i1; i++) {
        const cx = box.x + (i + 0.5) * CELL;
        if (cx < c.x || cx > c.x + c.w) continue;
        bits[j * cols + i] = 0;
      }
    }
  }
  return keepLargestBlob({ cols, rows, bits, x: box.x, y: box.y, w: box.w, h: box.h });
}

// Flood fill every visible blob, keep the biggest, and measure it.
function keepLargestBlob(mask) {
  const { cols, rows, bits } = mask;
  const seen = new Int32Array(cols * rows).fill(-1);
  const stack = [];
  let best = null;
  let label = 0;
  for (let start = 0; start < bits.length; start++) {
    if (!bits[start] || seen[start] >= 0) continue;
    const cells = [];
    stack.length = 0;
    stack.push(start);
    seen[start] = label;
    while (stack.length) {
      const at = stack.pop();
      cells.push(at);
      const i = at % cols;
      const j = (at - i) / cols;
      if (i > 0) pushCell(at - 1);
      if (i < cols - 1) pushCell(at + 1);
      if (j > 0) pushCell(at - cols);
      if (j < rows - 1) pushCell(at + cols);
    }
    if (!best || cells.length > best.length) best = cells;
    label++;
  }
  function pushCell(n) {
    if (bits[n] && seen[n] < 0) { seen[n] = label; stack.push(n); }
  }

  const keep = new Uint8Array(cols * rows);
  if (best) for (const n of best) keep[n] = 1;
  mask.bits = keep;
  mask.cells = best ? best.length : 0;
  mask.area = mask.cells * CELL * CELL;
  mask.fraction = mask.area / Math.max(1, mask.w * mask.h);
  Object.assign(mask, inscribedDisc(mask));
  return mask;
}

// Largest disc that fits inside the visible blob, by chamfer distance
// transform. Cells outside the box count as blocked, so the answer is never
// optimistic.
function inscribedDisc(mask) {
  const { cols, rows, bits } = mask;
  const dist = new Float32Array(cols * rows);
  const BIG = 1e6;
  for (let n = 0; n < bits.length; n++) dist[n] = bits[n] ? BIG : 0;
  const step = 1;
  const diag = Math.SQRT2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const n = j * cols + i;
      if (!bits[n]) continue;
      let d = dist[n];
      // Outside the box is blocked: distance from the border is the border gap.
      d = Math.min(d, i + 0.5, j + 0.5);
      if (i > 0) d = Math.min(d, dist[n - 1] + step);
      if (j > 0) d = Math.min(d, dist[n - cols] + step);
      if (i > 0 && j > 0) d = Math.min(d, dist[n - cols - 1] + diag);
      if (i < cols - 1 && j > 0) d = Math.min(d, dist[n - cols + 1] + diag);
      dist[n] = d;
    }
  }
  let bestN = -1;
  let bestD = 0;
  for (let j = rows - 1; j >= 0; j--) {
    for (let i = cols - 1; i >= 0; i--) {
      const n = j * cols + i;
      if (!bits[n]) continue;
      let d = dist[n];
      d = Math.min(d, cols - i - 0.5, rows - j - 0.5);
      if (i < cols - 1) d = Math.min(d, dist[n + 1] + step);
      if (j < rows - 1) d = Math.min(d, dist[n + cols] + step);
      if (i < cols - 1 && j < rows - 1) d = Math.min(d, dist[n + cols + 1] + diag);
      if (i > 0 && j < rows - 1) d = Math.min(d, dist[n + cols - 1] + diag);
      dist[n] = d;
      if (d > bestD) { bestD = d; bestN = n; }
    }
  }
  if (bestN < 0) return { hit: { x: mask.x + mask.w / 2, y: mask.y + mask.h / 2, r: 0 } };
  const i = bestN % cols;
  const j = (bestN - i) / cols;
  return {
    hit: {
      x: mask.x + (i + 0.5) * CELL,
      y: mask.y + (j + 0.5) * CELL,
      r: bestD * CELL,
    },
  };
}

// Shortest distance from a point to the visible part of a target, in world
// units. Zero when the point is on the thing. Cheap enough for clicks.
export function distanceToMask(mask, px, py) {
  const { cols, rows, bits } = mask;
  const ci = Math.floor((px - mask.x) / CELL);
  const cj = Math.floor((py - mask.y) / CELL);
  if (ci >= 0 && cj >= 0 && ci < cols && cj < rows && bits[cj * cols + ci]) return 0;
  let best = Infinity;
  for (let j = 0; j < rows; j++) {
    const dy = mask.y + (j + 0.5) * CELL - py;
    if (dy * dy >= best) continue;
    for (let i = 0; i < cols; i++) {
      if (!bits[j * cols + i]) continue;
      const dx = mask.x + (i + 0.5) * CELL - px;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
  }
  return best === Infinity ? Infinity : Math.sqrt(best);
}

// --------------------------------------------------------------- placement

function pickDef(rng, pools) {
  const id = rng.pick(pools);
  return PROPS[id] || null;
}

function sizeFor(rng, def, scale) {
  const w = rng.range(def.w[0], def.w[1]) * scale;
  const ratio = rng.range(def.ratio[0], def.ratio[1]);
  return { w, h: w * ratio };
}

function makeProp(rng, def, { cx, baseY, depth, box, flip }) {
  const p = {
    def: def.id,
    fam: def.fam,
    layer: def.layer,
    x: cx - box.w / 2,
    y: baseY - box.h,
    w: box.w,
    h: box.h,
    depth,
    flip: flip ?? rng.chance(0.4),
    tone: rng.next(),
    vr: (rng.next() * 4294967296) >>> 0,
    baseY,
  };
  return p;
}

function floorDepthOf(room, h) {
  return (h - room.floorY * h) * 0.68;
}

// ------------------------------------------------------------------ scene

export function buildScene({ room = 'library', mode = 'find', seed = 1, box, items = null, extraMouse = true } = {}) {
  const def = ROOM[room];
  if (!def) throw new Error(`unknown room: ${room}`);
  const W = Math.round(box?.w || 1400);
  const H = Math.round(box?.h || WORLD_H);
  const rng = new Rng(mix(hashString(`${room}|${mode}`), seed));
  const floorY = def.floorY * H;
  const floorDepth = floorDepthOf(def, H);
  const props = [];

  // --- furniture bays, back to front
  for (const bay of def.bays) {
    const pdef = pickDef(rng, bay.pools);
    if (!pdef) continue;
    const x0 = bay.x[0] * W;
    const x1 = bay.x[1] * W;
    const depth = rng.range(0, 0.2);
    const size = sizeFor(rng, pdef, 0.92 + 0.26 * depth);
    size.w = Math.min(size.w, Math.max(120, (x1 - x0) * 1.12));
    size.h = size.w * rng.range(pdef.ratio[0], pdef.ratio[1]);
    const half = size.w / 2;
    const lo = Math.min(x0 + half, x1 - half);
    const hi = Math.max(x0 + half, x1 - half);
    const cx = lo === hi ? lo : rng.range(Math.min(lo, hi), Math.max(lo, hi));
    props.push(makeProp(rng, pdef, { cx, baseY: floorY + depth * floorDepth, depth, box: size }));
  }

  // --- things on the back wall
  for (const spot of def.wallSpots) {
    if (rng.chance(0.12)) continue;
    const pdef = pickDef(rng, spot.pools);
    if (!pdef) continue;
    const size = sizeFor(rng, pdef, 1);
    const cx = rng.range(spot.x[0], spot.x[1]) * W;
    const top = rng.range(spot.y[0], spot.y[1]) * H;
    props.push(makeProp(rng, pdef, { cx, baseY: top + size.h, depth: -0.05, box: size, flip: false }));
  }

  // --- hanging from the ceiling
  for (const spot of def.hangSpots) {
    if (rng.chance(0.18)) continue;
    const pdef = pickDef(rng, spot.pools);
    if (!pdef) continue;
    const size = sizeFor(rng, pdef, 1);
    const cx = rng.range(spot.x[0], spot.x[1]) * W;
    const top = rng.range(0.02, 0.1) * H;
    props.push(makeProp(rng, pdef, { cx, baseY: top + size.h, depth: -0.08, box: size, flip: false }));
  }

  // --- floor clutter, spread out so it reads as a room and not a heap
  const density = clutterScale(W);
  const count = Math.round(rng.between(def.clutter.count[0], def.clutter.count[1]) * density);
  const placedCx = [];
  for (let i = 0; i < count; i++) {
    const pdef = pickDef(rng, def.clutter.pools);
    if (!pdef) continue;
    const depth = rng.range(0.22, 0.95);
    const size = sizeFor(rng, pdef, 0.82 + 0.2 * depth);
    let cx = 0;
    for (let tries = 0; tries < 8; tries++) {
      cx = rng.range(size.w * 0.55, W - size.w * 0.55);
      if (placedCx.every((o) => Math.abs(o - cx) > size.w * 0.52)) break;
    }
    placedCx.push(cx);
    props.push(makeProp(rng, pdef, { cx, baseY: floorY + depth * floorDepth, depth, box: size }));
  }

  // --- front layer: rugs, curtains, crates to peek around
  for (const spot of def.front) {
    if (spot.optional && rng.chance(0.45)) continue;
    const pdef = pickDef(rng, spot.pools);
    if (!pdef) continue;
    const depth = rng.range(0.82, 1.08);
    const size = sizeFor(rng, pdef, 0.95 + 0.2 * depth);
    const cx = rng.range(spot.x[0], spot.x[1]) * W;
    let baseY = floorY + depth * floorDepth + size.h * 0.06;
    if (pdef.base === 'ceiling') {
      size.h = Math.min(size.h, floorY * rng.range(0.96, 1.06));
      size.w = size.h / rng.range(pdef.ratio[0], pdef.ratio[1]);
      baseY = size.h;
    }
    props.push(makeProp(rng, pdef, { cx, baseY, depth, box: size, flip: pdef.fam === 'curtain' ? spot.x[0] > 0.5 : undefined }));
  }

  // --- cobwebs and dust in the very front, pure decoration
  const webs = Math.round(rng.between(3, 6) * Math.min(1.6, density));
  for (let i = 0; i < webs; i++) {
    const pdef = PROPS[i < 3 ? 'cobweb' : 'dustMote'];
    const size = sizeFor(rng, pdef, 1);
    const corner = i % 4;
    const cx = corner === 0 || corner === 2 ? rng.range(0.02, 0.2) * W : rng.range(0.8, 0.98) * W;
    const cy = corner < 2 ? rng.range(0.02, 0.16) * H : rng.range(0.2, 0.5) * H;
    props.push(makeProp(rng, pdef, { cx, baseY: cy + size.h, depth: 1.1, box: size }));
  }

  // --- painter's order: by layer, then by how far forward it stands
  props.sort((a, b) => (a.layer - b.layer) || (a.baseY - b.baseY) || (a.x - b.x));
  props.forEach((p, i) => { p.z = i + 1; });

  const scene = {
    room, mode, seed, box: { w: W, h: H }, floorY, floorDepth,
    palette: def.palette, arch: def.arch,
    props, targets: [], changes: [], mouse: null, silhouette: mode === 'hunt',
  };

  // --- hide slots offered by the props, plus a few honest patches of floor
  const slots = [];
  for (const p of props) {
    const pdef = PROPS[p.def];
    if (!pdef.slots?.length) continue;
    for (const s of slotPoints(pdef, propBox(p))) {
      slots.push({ x: s.x, y: s.y, kind: s.kind, host: p });
    }
  }
  const floorSlots = Math.round(rng.between(9, 13) * density);
  for (let i = 0; i < floorSlots; i++) {
    slots.push({
      x: rng.range(0.05, 0.95) * W,
      y: floorY + rng.range(0.3, 0.98) * floorDepth,
      kind: 'floor',
      host: null,
    });
  }

  const covers = props.map((p) => ({ z: p.z, rects: coverRects(PROPS[p.def], propBox(p)) }));

  // --- which things are lost here
  const wanted = items || pickItems(rng, room, mode);
  const owners = assignOwners(room, wanted);
  const placedTargets = [];
  const usedSlots = new Set();

  for (let i = 0; i < wanted.length; i++) {
    const t = placeTarget({ rng, scene, slots, usedSlots, covers, itemId: wanted[i], placed: placedTargets, floorY });
    if (!t) throw new Error(`spooky-spotter: no room for ${wanted[i]} in ${room} (seed ${seed})`);
    t.owner = owners[i];
    t.index = i;
    placedTargets.push(t);
  }

  if (extraMouse && mode === 'find') {
    const m = placeTarget({ rng, scene, slots, usedSlots, covers, itemId: 'mouse', placed: placedTargets, floorY, optional: true });
    if (m) {
      m.secret = true;
      m.index = placedTargets.length;
      placedTargets.push(m);
      scene.mouse = m;
    }
  }

  scene.targets = placedTargets;
  scene.wanted = placedTargets.filter((t) => !t.secret).map((t) => t.id);
  return scene;
}

// Six to nine things, the resident ghosts' favourites first.
function pickItems(rng, room, mode) {
  const n = targetCount(mode, Math.max(0, ROOM_ORDER.indexOf(room)));
  const must = ghostsOf(room).map((g) => g.favourite).filter((id) => ITEM[id]);
  const out = [];
  for (const id of must) if (out.length < n && !out.includes(id)) out.push(id);
  const rest = rng.shuffled(FINDABLE.map((it) => it.id)).filter((id) => !out.includes(id));
  while (out.length < n && rest.length) out.push(rest.shift());
  return out;
}

const ROOM_ORDER = ['library', 'kitchen', 'attic', 'greenhouse', 'ballroom', 'cellar', 'observatory'];

function placeTarget({ rng, scene, slots, usedSlots, covers, itemId, placed, floorY, optional = false }) {
  const item = ITEM[itemId];
  if (!item) return null;
  const { w: W, h: H } = scene.box;
  const order = rng.shuffled(slots.map((_, i) => i));
  for (const si of order) {
    if (usedSlots.has(si)) continue;
    const slot = slots[si];
    if (!item.kinds.includes(slot.kind)) continue;

    const jitterX = rng.range(-10, 10);
    const scale = rng.range(0.92, 1.06);
    const w = item.w * scale;
    const h = item.h * scale;
    let x = slot.x + jitterX - w / 2;
    let y = slot.kind === 'hook' ? slot.y - h * 0.05 : slot.y - h * 0.92;
    if (slot.kind === 'under') y = slot.y - h * 0.72;
    if (slot.kind === 'high') y = slot.y - h * 0.96;

    const bx = { x, y, w, h };
    if (bx.x < EDGE_MARGIN || bx.y < EDGE_MARGIN || bx.x + bx.w > W - EDGE_MARGIN || bx.y + bx.h > H - EDGE_MARGIN) continue;

    // Keep finds apart so a corner never holds three of them.
    const cxp = bx.x + bx.w / 2;
    const cyp = bx.y + bx.h / 2;
    if (placed.some((t) => Math.hypot(t.cx - cxp, t.cy - cyp) < targetGap(W))) continue;

    const host = slot.host;
    const behind = slot.kind === 'under' || slot.kind === 'behind';
    let z;
    if (host) z = host.z + (behind ? -0.5 : 0.5);
    else {
      let below = 0;
      for (const p of scene.props) {
        if (p.layer <= 4 && p.baseY <= bx.y + bx.h && p.z > below) below = p.z;
      }
      z = below + 0.5;
    }

    const blocking = [];
    for (const c of covers) if (c.z > z) for (const r of c.rects) blocking.push(r);
    const mask = buildMask(bx, blocking);

    const ok = mask.fraction >= MIN_FRACTION && mask.area >= MIN_AREA && mask.hit.r >= MIN_HIT_RADIUS;
    const target = {
      id: itemId, label: item.label, kind: slot.kind,
      x: bx.x, y: bx.y, w: bx.w, h: bx.h, cx: cxp, cy: cyp,
      z, mask, hit: mask.hit, tone: rng.next(), vr: (rng.next() * 4294967296) >>> 0,
      found: false, secret: false, owner: null, index: 0,
    };
    if (ok) { usedSlots.add(si); return target; }
  }

  // No slot worked out. Rather than hide a thing where nobody can click it,
  // drop it in a clear patch of floor in front of everything.
  if (optional) return null;
  return openFloorTarget({ rng, scene, covers, item, placed, floorY });
}

// Last resort: an unobstructed spot at the very front of the room.
function openFloorTarget({ rng, scene, covers, item, placed, floorY }) {
  const { w: W, h: H } = scene.box;
  const topZ = scene.props.reduce((m, p) => (p.layer <= 5 && p.z > m ? p.z : m), 0) + 0.5;
  for (let tries = 0; tries < 220; tries++) {
    const w = item.w;
    const h = item.h;
    const x = rng.range(EDGE_MARGIN + 10, W - EDGE_MARGIN - w - 10);
    const y = rng.range(Math.max(EDGE_MARGIN + 10, floorY), H - EDGE_MARGIN - h - 10);
    const bx = { x, y, w, h };
    const cxp = x + w / 2;
    const cyp = y + h / 2;
    if (placed.some((t) => Math.hypot(t.cx - cxp, t.cy - cyp) < targetGap(W))) continue;
    const blocking = [];
    for (const c of covers) if (c.z > topZ) for (const r of c.rects) blocking.push(r);
    const mask = buildMask(bx, blocking);
    if (mask.fraction < 0.95 || mask.hit.r < MIN_HIT_RADIUS) continue;
    return {
      id: item.id, label: item.label, kind: 'floor',
      x, y, w, h, cx: cxp, cy: cyp, z: topZ,
      mask, hit: mask.hit, tone: rng.next(), vr: (rng.next() * 4294967296) >>> 0,
      found: false, secret: false, owner: null, index: 0, rescued: true,
    };
  }
  return null;
}

// ------------------------------------------------------------- hit testing

// The nearest unfound target within `tolerance` world units, or null. The
// tolerance is how forgiving a tap is; main.js scales it with the zoom so a
// fingertip always covers about the same patch of screen.
export function hitTest(scene, wx, wy, tolerance = 26) {
  let best = null;
  let bestD = Infinity;
  for (const t of scene.targets) {
    if (t.found) continue;
    const d = distanceToMask(t.mask, wx, wy);
    if (d <= tolerance && d < bestD) { best = t; bestD = d; }
  }
  return best;
}

export function targetById(scene, id) {
  return scene.targets.find((t) => t.id === id) || null;
}

export function remaining(scene) {
  return scene.targets.filter((t) => !t.found && !t.secret).length;
}

// A gentle hint: the area to light up, never the exact spot.
export function hintArea(scene, preferId = null) {
  const open = scene.targets.filter((t) => !t.found && !t.secret);
  if (!open.length) return null;
  const t = (preferId && open.find((o) => o.id === preferId)) || open[0];
  const jx = ((t.vr % 61) - 30) * 0.9;
  const jy = (((t.vr >> 8) % 61) - 30) * 0.9;
  return { x: t.cx + jx, y: t.cy + jy, r: 150, id: t.id };
}
