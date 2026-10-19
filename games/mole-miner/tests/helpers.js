// Tiny hand-drawn mines for simulation tests.
//   # soil   B bedrock   P pad   o copper ore   g gas   O boulder   L lava
//   . empty  f fuel can  r relic 0   ^ bounce cap  c clay (row in layer 1)
import { T } from '../src/data.js';

const LEGEND = { '#': T.SOIL, B: T.BEDROCK, P: T.PAD, o: T.ORE0, g: T.GAS, O: T.BOULDER, L: T.LAVA, '.': T.EMPTY, f: T.FUEL, r: T.RELIC0, '^': T.BOUNCE, C: T.CORE };

export function makeWorld(rows, { layer = 0, baseX0 = 1, baseX1 = 2, startX = 2 } = {}) {
  const h = rows.length, w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { tiles[y * w + x] = LEGEND[ch]; }));
  const layerOf = new Uint8Array(h).fill(layer);
  return { seed: 'test', cfg: { w, h, baseX0, baseX1, startX }, w, h, tiles, deco: new Uint8Array(w * h), layerOf, tops: [0] };
}

export function run(mine, seconds, ctl = { ax: 0, ay: 0 }, dt = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds; t += dt) {
    mine.step(dt, typeof ctl === 'function' ? ctl(mine) : ctl);
    events.push(...mine.events);
    mine.events.length = 0;
  }
  return events;
}

export const STATS = { power: 1, tank: 40, cargo: 3, hull: 40, lamp: 3, fly: 5, flyAccel: 9, flyBurn: 1, fan: false };
