// Water simulation and the completion rule. DOM-free.
//
// A puzzle is { topo, tiles } where tiles[i] is null (an empty stone) or
//   { kind: 'pipe' | 'spring' | 'flower' | 'gate' | 'bridge',
//     mask,        open sides in the solved orientation
//     inDir?,      gate: the side water must enter by (solved orientation)
//     color?,      spring: 'b' (blue) or 'y' (gold)
//     need?,       flower: 'b', 'y' or 'g' (blue + gold)
//     locked?, group? }
// and rots[i] is how many clockwise steps tile i is turned from solved.
//
// A garden is complete when every stone is wet, nothing spills and every
// flower gets exactly its colour.
import { rotMask } from './topology.js';

export const COLOR_BITS = { b: 1, y: 2, g: 3 };
export const BIT_COLORS = ['', 'b', 'y', 'g'];

export function portsOf(tile, rot, n) {
  return rotMask(tile.mask, rot, n);
}

export function gateInOf(tile, rot, n) {
  return (((tile.inDir + rot) % n) + n) % n;
}

// Channels a tile carries, as indices into wet[]: bridges carry one per
// axis (axis = side % half), everything else one.
function channelOf(tile, side, half) {
  return tile.kind === 'bridge' ? side % half : 0;
}

export function simulate(puzzle, rots) {
  const { topo, tiles } = puzzle;
  const { n, half, count, nbr } = topo;
  const wet = new Uint8Array(count * 3);
  const depth = new Int16Array(count).fill(-1);
  const ports = new Uint8Array(count);
  for (let i = 0; i < count; i++) if (tiles[i]) ports[i] = rotMask(tiles[i].mask, rots[i], n);
  const spills = new Map();
  const blocked = new Set();
  const queue = [];
  for (const color of [1, 2]) {
    queue.length = 0;
    for (let i = 0; i < count; i++) {
      const t = tiles[i];
      if (t && t.kind === 'spring' && COLOR_BITS[t.color || 'b'] === color) queue.push(i, -1, 0);
    }
    for (let head = 0; head < queue.length; head += 3) {
      const i = queue[head];
      const e = queue[head + 1];
      const dep = queue[head + 2];
      const t = tiles[i];
      let exits;
      if (t.kind === 'bridge') {
        exits = 1 << ((e + half) % n);
      } else if (t.kind === 'gate') {
        if (e !== gateInOf(t, rots[i], n)) {
          blocked.add(i);
          continue;
        }
        exits = ports[i] & ~(1 << e);
      } else {
        exits = e < 0 ? ports[i] : ports[i] & ~(1 << e);
      }
      const k = i * 3 + (e < 0 ? 0 : channelOf(t, e, half));
      if (wet[k] & color) continue;
      wet[k] |= color;
      if (depth[i] < 0 || dep < depth[i]) depth[i] = dep;
      for (let d = 0; d < n; d++) {
        if (!(exits & (1 << d))) continue;
        const j = nbr[i * n + d];
        const od = (d + half) % n;
        if (j < 0 || !tiles[j] || !((ports[j] >> od) & 1)) spills.set(i * 8 + d, { i, d });
        else queue.push(j, od, dep + 1);
      }
    }
  }
  let dry = 0;
  let total = 0;
  const flowers = [];
  for (let i = 0; i < count; i++) {
    const t = tiles[i];
    if (!t) continue;
    total++;
    if (t.kind === 'bridge') {
      for (let a = 0; a < half; a++) {
        if ((ports[i] >> a) & 1 && !wet[i * 3 + a]) {
          dry++;
          break;
        }
      }
    } else if (!wet[i * 3]) {
      dry++;
    }
    if (t.kind === 'flower') {
      const need = COLOR_BITS[t.need || 'b'];
      const have = wet[i * 3];
      flowers.push({ i, need, have, ok: have === need });
    }
  }
  const spillList = [...spills.values()];
  const bloomed = flowers.filter((f) => f.ok).length;
  return {
    wet,
    depth,
    ports,
    spills: spillList,
    blocked: [...blocked],
    flowers,
    bloomed,
    dry,
    total,
    solved: spillList.length === 0 && dry === 0 && bloomed === flowers.length,
  };
}

export function isSolved(puzzle, rots) {
  return simulate(puzzle, rots).solved;
}
