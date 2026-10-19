// The Daily Tower: one level per local date. Same day, same tower.
import { hashString, rng } from './rng.js';
import { drawSequence } from './levels.js';

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Every animal can appear (today's guest stars), whatever you've unlocked.
const POOL = { hippo: 3, turtle: 2, giraffe: 2, panda: 0.6, penguin: 1, frog: 0.6, owl: 1, pig: 0.8, elephant: 2.5, hedgehog: 0.6, croc: 1.2, chick: 0.5 };

const FLAVOURS = [
  { tag: 'Calm day', make: () => ({}) },
  { tag: 'Breezy', make: (r) => ({ wind: { strength: r.range(0.6, 1.1), gust: r.range(0.3, 0.6), flip: r() < 0.3 } }) },
  { tag: 'Icy', make: (r) => ({ ice: r.range(0.25, 0.4) }) },
  { tag: 'Bobbing raft', make: (r) => ({ mover: { amp: r.range(0.4, 0.7), speed: r.range(0.4, 0.5) } }) },
  { tag: 'Windy and icy', make: (r) => ({ wind: { strength: r.range(0.5, 0.8), gust: 0.4 }, ice: 0.25 }) },
];

export function dailyLevel(key) {
  const seed = hashString(`tumble-tower:${key}`);
  const r = rng(seed);
  const flavour = FLAVOURS[r.int(FLAVOURS.length)];
  const extra = flavour.make(r);
  const goal = Math.round(r.range(4.5, 6) * 2) / 2;
  const limit = Math.round(goal * 1.6) + 3;
  const level = {
    index: -1,
    island: -1,
    number: 0,
    daily: key,
    name: `Daily Tower · ${MONTHS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8))}`,
    flavour: flavour.tag,
    goal,
    limit,
    par: Math.round(goal) + 1,
    width: Math.round(r.range(5, 6) * 2) / 2,
    pool: POOL,
    wind: extra.wind || null,
    ice: extra.ice || 0,
    mover: extra.mover || null,
    seed,
  };
  level.sequence = drawSequence(POOL, limit, seed ^ 0x5bd1e995, { ice: level.ice });
  return level;
}
