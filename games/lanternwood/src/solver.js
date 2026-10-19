// Reachability and progression solver. It walks the same tile grids the game
// uses, with the same rules (tiles.js), and answers: with these items, what
// can Wren reach, which puzzles can she solve, which chests can she open?
// The tests use it to prove every room is reachable, every locked door has
// its key first, and each dungeon can be finished with the items you have
// when you arrive. The autopilot uses it to choose its next goal.
import { ROOM_W, ROOM_H, ITEM_RANGE, tileDef, isSolid, isFlyable, isPost, code } from './tiles.js';
import { F, liveGrid, roomKey, allAreas, DUNGEON_DEFS, dungeonExit } from './areas.js';
import { BOSS_NEEDS } from './bosses.js';

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SOLID_ENTITIES = new Set(['npc', 'sign', 'chest', 'statue', 'block']);

/** Tiles (as a Set of indices) blocked by solid entities. */
export function entityBlockers(area, flags, { blocks = true } = {}) {
  const set = new Set();
  for (const e of area.entities) {
    if (!SOLID_ENTITIES.has(e.type)) continue;
    if (e.type === 'block' && !blocks) continue;
    if (e.type === 'chest' && e.appear && !flags.has(F.solved(area.id, e.room))) continue;
    if (e.type === 'npc' && e.id === 'biscuit' && flags.has('cat:found')) continue;
    set.add(e.y * area.w + e.x);
  }
  return set;
}

const inRoom = (area, idx, rx, ry) => {
  const x = idx % area.w, y = Math.floor(idx / area.w);
  return Math.floor(x / ROOM_W) === rx && Math.floor(y / ROOM_H) === ry;
};
const roomOf = (area, idx) => roomKey(Math.floor((idx % area.w) / ROOM_W), Math.floor(Math.floor(idx / area.w) / ROOM_H));

/**
 * Flood fill of walkable tiles from `starts`, following grapple vines when
 * the vine seeds are owned. Returns a Set of tile indices.
 */
export function flood(area, grid, blockers, starts, items) {
  const seen = new Set();
  const queue = [];
  const walkable = (i) => !isSolid(grid[i]) && !blockers.has(i);
  for (const s of starts) if (walkable(s) && !seen.has(s)) { seen.add(s); queue.push(s); }
  while (queue.length) {
    const i = queue.pop();
    const x = i % area.w, y = (i - x) / area.w;
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= area.w || ny >= area.h) continue;
      const n = ny * area.w + nx;
      if (!seen.has(n) && walkable(n)) { seen.add(n); queue.push(n); }
    }
    if (items.grapple) {
      const rx = Math.floor(x / ROOM_W), ry = Math.floor(y / ROOM_H);
      for (const [dx, dy] of D4) {
        const land = grappleLanding(area, grid, x, y, dx, dy, rx, ry);
        if (land !== null && walkable(land) && !seen.has(land)) { seen.add(land); queue.push(land); }
      }
    }
  }
  return seen;
}

// Index of the tile the vine pulls you to, or null.
export function grappleLanding(area, grid, x, y, dx, dy, rx, ry) {
  for (let k = 1; k <= ITEM_RANGE.grapple; k++) {
    const tx = x + dx * k, ty = y + dy * k;
    if (Math.floor(tx / ROOM_W) !== rx || Math.floor(ty / ROOM_H) !== ry) return null;
    const c = grid[ty * area.w + tx];
    if (isPost(c)) return k >= 2 ? (ty - dy) * area.w + (tx - dx) : null;
    if (!isFlyable(c)) return null;
  }
  return null;
}

// Can something thrown from a reachable tile hit tile `target` within range?
function lineHit(area, grid, reach, target, range) {
  const tx = target % area.w, ty = (target - tx) / area.w;
  const rx = Math.floor(tx / ROOM_W), ry = Math.floor(ty / ROOM_H);
  for (const [dx, dy] of D4) {
    for (let k = 1; k <= range; k++) {
      const sx = tx - dx * k, sy = ty - dy * k;
      if (Math.floor(sx / ROOM_W) !== rx || Math.floor(sy / ROOM_H) !== ry) break;
      const s = sy * area.w + sx;
      if (reach.has(s)) return true;
      if (!isFlyable(grid[s])) break;
    }
  }
  return false;
}

const adjacentReach = (area, reach, idx) => {
  const x = idx % area.w, y = (idx - x) / area.w;
  return D4.some(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < area.w && ny < area.h && reach.has(ny * area.w + nx);
  });
};

// ------------------------------------------------------------ push blocks

/**
 * Solve a room's pressure-plate puzzle: can the blocks be pushed so every
 * plate is covered? Returns the list of pushes [{from, dir}] or null.
 * The player starts anywhere in `reach` inside the room.
 */
export function solvePlates(area, grid, flags, rx, ry, reach, maxStates = 200000, liveBlocks = null) {
  const ox = rx * ROOM_W, oy = ry * ROOM_H;
  const w = area.w;
  const plates = [], blocks = [];
  for (let y = 1; y < ROOM_H - 1; y++) for (let x = 1; x < ROOM_W - 1; x++) {
    const i = (oy + y) * w + ox + x;
    if (tileDef(grid[i]).plate) plates.push(i);
  }
  const others = entityBlockers(area, flags, { blocks: false });
  if (liveBlocks) blocks.push(...liveBlocks);
  else for (const e of area.entities) if (e.type === 'block' && e.room === roomKey(rx, ry)) blocks.push(e.y * w + e.x);
  if (!plates.length || blocks.length < plates.length) return null;
  const interior = (i) => {
    const x = i % w - ox, y = Math.floor(i / w) - oy;
    return x >= 1 && y >= 1 && x < ROOM_W - 1 && y < ROOM_H - 1;
  };
  const free = (i) => !isSolid(grid[i]) && !others.has(i) && inRoom(area, i, rx, ry);
  const blockFree = (i) => free(i) && interior(i) && !tileDef(grid[i]).warp;
  const starts = [...reach].filter((i) => inRoom(area, i, rx, ry) && free(i));
  if (!starts.length) return null;

  // Flood of the player's free space with the blocks in place, using a stamp
  // array instead of Sets: this runs thousands of times per puzzle.
  const stamp = new Int32Array(area.w * area.h);
  const freeTile = new Uint8Array(area.w * area.h);
  for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
    const i = (oy + y) * w + ox + x;
    freeTile[i] = free(i) ? 1 : 0;
  }
  let gen = 0;
  const stack = new Int32Array(ROOM_W * ROOM_H * 4);
  const region = (bset, start) => {
    gen++;
    for (const b of bset) stamp[b] = -gen;
    let min = start, sp = 0;
    stack[sp++] = start; stamp[start] = gen;
    const tiles = [];
    while (sp) {
      const i = stack[--sp];
      tiles.push(i);
      if (i < min) min = i;
      for (const n of [i + 1, i - 1, i + w, i - w]) {
        if (freeTile[n] && stamp[n] !== gen && stamp[n] !== -gen) { stamp[n] = gen; stack[sp++] = n; }
      }
    }
    const g = gen;
    return { seen: { has: (i) => stamp[i] === g }, min, tiles };
  };
  const keyOf = (bl, min) => `${bl.join(',')}|${min}`;
  const startBlocks = [...blocks].sort((a, b) => a - b);
  const first = region(new Set(startBlocks), starts.find((s) => !startBlocks.includes(s)));
  const queue = [{ bl: startBlocks, pos: first.min, parent: null, push: null }];
  const seen = new Set([keyOf(startBlocks, first.min)]);
  const pathOf = (node) => { const out = []; for (let n = node; n.push; n = n.parent) out.push(n.push); return out.reverse(); };
  for (let head = 0; head < queue.length && seen.size < maxStates; head++) {
    const node = queue[head];
    const { bl, pos } = node;
    if (plates.every((p) => bl.includes(p))) return pathOf(node);
    const bset = new Set(bl);
    const reachable = new Set(region(bset, pos).tiles);
    const area1 = reachable;
    for (let bi = 0; bi < bl.length; bi++) {
      const b = bl[bi];
      const bx = b % w, by = (b - bx) / w;
      for (const [dx, dy] of D4) {
        const from = (by - dy) * w + bx - dx; // player stands here
        const to = (by + dy) * w + bx + dx;
        if (!area1.has(from) || !blockFree(to) || bset.has(to)) continue;
        const nb = bl.slice();
        nb[bi] = to;
        nb.sort((a, c) => a - c);
        const r = region(new Set(nb), b);
        const k = keyOf(nb, r.min);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ bl: nb, pos: b, parent: node, push: { block: b, from, dir: [dx, dy] } });
      }
    }
  }
  return null;
}

// ------------------------------------------------------------ exploring

/**
 * Explore one area as far as possible. `state` = { items, keys, bigKey,
 * flags:Set, gains:[] } and is updated in place. Returns the reachable set
 * and the locked doors that could be opened next (the caller chooses).
 */
export function explore(area, state, starts) {
  const items = state.items;
  for (let guard = 0; guard < 500; guard++) {
    const grid = liveGrid(area, state.flags);
    const blockers = entityBlockers(area, state.flags);
    const reach = flood(area, grid, blockers, starts, items);
    let changed = false;

    for (const room of area.rooms.values()) {
      if (!room.cond) continue;
      const flag = F.solved(area.id, room.key);
      if (state.flags.has(flag)) continue;
      if (roomSolvable(area, grid, state, room, reach)) {
        state.flags.add(flag);
        state.gains.push(`solve ${area.id} ${room.key} (${room.cond})`);
        if (room.cond === 'boss') onBoss(area, state);
        changed = true;
      }
    }
    for (const e of area.entities) {
      if (e.type !== 'chest') continue;
      const flag = F.chest(e.uid);
      if (state.flags.has(flag)) continue;
      if (e.appear && !state.flags.has(F.solved(area.id, e.room))) continue;
      if (!adjacentReach(area, reach, e.y * area.w + e.x)) continue;
      state.flags.add(flag);
      give(state, e.contents, area);
      state.gains.push(`chest ${e.contents} ${e.room}`);
      changed = true;
    }
    if (items.dash) {
      for (let i = 0; i < grid.length; i++) {
        if (tileDef(grid[i]).crack && adjacentReach(area, reach, i)) {
          state.flags.add(F.crack(area.id, i));
          changed = true;
        }
      }
    }
    if (changed) continue;

    const options = [];
    for (const link of area.links.values()) {
      if (state.flags.has(F.link(link.id))) continue;
      if (link.type !== 'locked' && link.type !== 'boss') continue;
      if (!link.tiles.some((t) => adjacentReach(area, reach, t))) continue;
      if (link.type === 'locked' && state.keys[area.id] > 0) options.push(link);
      if (link.type === 'boss' && state.bigKeys[area.id]) options.push(link);
    }
    return { reach, options, grid };
  }
  throw new Error('explore did not settle');
}

function roomSolvable(area, grid, state, room, reach) {
  const inThis = [...reach].filter((i) => roomOf(area, i) === room.key);
  if (!inThis.length) return false;
  const tilesOfRoom = (pred) => {
    const out = [];
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const i = (room.ry * ROOM_H + y) * area.w + room.rx * ROOM_W + x;
      if (pred(tileDef(grid[i]))) out.push(i);
    }
    return out;
  };
  const items = state.items;
  switch (room.cond) {
    case 'clear':
      return !!items.sword;
    case 'switch':
      return tilesOfRoom((d) => d.switch).some((s) =>
        (items.sword && adjacentReach(area, reach, s)) || (items.boomerang && lineHit(area, grid, reach, s, ITEM_RANGE.boomerang)));
    case 'torches': {
      const torches = tilesOfRoom((d) => d.torch);
      return items.lantern && torches.length > 0 && torches.every((t) =>
        adjacentReach(area, reach, t) || lineHit(area, grid, reach, t, ITEM_RANGE.ember));
    }
    case 'plates':
      return !!solvePlates(area, grid, state.flags, room.rx, room.ry, new Set(inThis));
    case 'boss': {
      const boss = area.entities.find((e) => e.type === 'boss' && e.room === room.key);
      return !!boss && (BOSS_NEEDS[boss.kind] || []).every((it) => items[it]);
    }
    default:
      return false;
  }
}

function onBoss(area, state) {
  state.shards.push(area.id);
  state.hearts += 1;
}

export function give(state, contents, area) {
  const [what, n] = contents.split(':');
  if (what === 'key') state.keys[area.id] = (state.keys[area.id] || 0) + 1;
  else if (what === 'bigkey') state.bigKeys[area.id] = true;
  else if (what === 'heart') state.hearts += 1;
  else if (what === 'berries') state.berries += Number(n) || 0;
  else state.items[what] = true;
}

export function newState(items = { sword: true, lantern: true }) {
  return { items: { ...items }, keys: {}, bigKeys: {}, flags: new Set(), gains: [], shards: [], hearts: 0, berries: 0 };
}

const clone = (s) => ({
  items: { ...s.items }, keys: { ...s.keys }, bigKeys: { ...s.bigKeys }, flags: new Set(s.flags),
  gains: [...s.gains], shards: [...s.shards], hearts: s.hearts, berries: s.berries,
});

/**
 * Solve a dungeon from its entrance, trying every order of opening locked
 * doors. Returns { complete, everyOrder, state } where `state` is one
 * finished run and `everyOrder` says no order of key use gets stuck.
 */
export function solveDungeon(area, state) {
  const start = [area.start.y * area.w + area.start.x];
  let finished = null;
  let stuck = 0;
  let leaves = 0;
  const visit = (s, depth) => {
    const { options } = explore(area, s, start);
    if (s.flags.has(F.solved(area.id, bossRoom(area)))) { leaves++; finished ||= s; return; }
    if (!options.length || depth > 12) { leaves++; stuck++; return; }
    for (const link of options) {
      const next = clone(s);
      next.flags.add(F.link(link.id));
      if (link.type === 'locked') next.keys[area.id]--;
      next.gains.push(`open ${link.id}`);
      visit(next, depth + 1);
    }
  };
  visit(clone(state), 0);
  return { complete: !!finished, everyOrder: stuck === 0, leaves, state: finished };
}

export function bossRoom(area) {
  for (const r of area.rooms.values()) if (r.cond === 'boss') return r.key;
  return null;
}

/**
 * The whole adventure from the first step: explore the overworld, enter each
 * dungeon you can reach, finish it with what you carry, and repeat.
 * Returns the order dungeons were finished and the final state.
 */
export function solveAdventure(areas = allAreas()) {
  const ow = areas.overworld;
  let state = newState();
  const order = [];
  const owStart = [ow.start.y * ow.w + ow.start.x];
  const starts = () => [...owStart, ...order.map((id) => { const e = dungeonExit(id); return e.y * ow.w + e.x; })];
  for (let round = 0; round < 10; round++) {
    const { reach } = explore(ow, state, starts());
    let progressed = false;
    for (const d of DUNGEON_DEFS) {
      if (order.includes(d.id)) continue;
      const warp = ow.entities.find((e) => e.type === 'warp' && e.to === d.id);
      if (!reach.has(warp.y * ow.w + warp.x)) continue;
      const res = solveDungeon(areas[d.id], state);
      if (!res.complete) continue;
      state = res.state;
      order.push(d.id);
      progressed = true;
    }
    if (!progressed) {
      return { order, state, reach };
    }
  }
  return { order, state, reach: explore(ow, state, starts()).reach };
}

export { code };
