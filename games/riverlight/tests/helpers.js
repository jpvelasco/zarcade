// Small hand-built gardens for the rule tests.
import { makeTopology } from '../src/topology.js';

// Square directions as bits: N 1, E 2, S 4, W 8.
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export function garden(w, h, cells, topoExtra = {}) {
  const topo = makeTopology({ kind: 'square', w, h, ...topoExtra });
  const tiles = new Array(topo.count).fill(null);
  for (const [i, tile] of Object.entries(cells)) tiles[Number(i)] = tile;
  return { topo, tiles };
}

export const zeros = (p) => new Array(p.topo.count).fill(0);
