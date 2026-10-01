// Prices, shop stock, crafting and the community board. DOM-free.
import { ITEMS, CROPS, DECOR, UPGRADES, ANIMALS, RECIPES, FISH, VILLAGER_IDS } from './data.js';
import { rngFor, pick } from './rng.js';

export const MARKET_BONUS = 1.25;
export const SHOP_OPEN = 8 * 60;
export const SHOP_CLOSE = 20 * 60;
export const MARKET_OPEN = 8 * 60;
export const MARKET_CLOSE = 17 * 60;

export const sellPrice = (id) => ITEMS[id]?.sell || 0;
export const marketPrice = (id) => Math.round(sellPrice(id) * MARKET_BONUS);

// What the General Store offers today. Each entry: { id, kind, name, cost, desc? }.
export function shopStock(state) {
  const { season, upgrades, animals } = state;
  const out = [];
  for (const [id, c] of Object.entries(CROPS)) {
    if (c.seasons.includes(season) || upgrades.greenhouse) {
      out.push({ id: `${id}_seed`, kind: 'seed', name: `${c.name} Seeds`, cost: c.seed, offSeason: !c.seasons.includes(season),
        desc: `${c.days} days${c.regrow ? `, regrows every ${c.regrow}` : ''} · sells ${c.sell}g${c.yield ? ` ×${c.yield}` : ''}` });
    }
  }
  out.push({ id: 'hay', kind: 'hay', name: 'Hay', cost: ITEMS.hay.cost, desc: 'Animal feed. One bale per animal per day.' });
  out.push({ id: 'sprinkler', kind: 'sprinkler', name: 'Sprinkler', cost: ITEMS.sprinkler.cost, desc: 'Waters the 8 tiles around it every morning.' });
  for (const [id, a] of Object.entries(ANIMALS)) {
    const have = animals.filter((x) => x.type === id).length;
    if (have < a.max) out.push({ id, kind: 'animal', name: a.name, cost: a.cost, desc: `Makes ${ITEMS[a.produce].name.toLowerCase()} when fed. (${have}/${a.max})` });
  }
  for (const [id, u] of Object.entries(UPGRADES)) {
    if (upgradeOwned(state, id)) continue;
    if (u.requires && !upgradeOwned(state, u.requires)) continue;
    out.push({ id, kind: 'upgrade', name: u.name, cost: u.cost, desc: u.desc });
  }
  for (const [id, d] of Object.entries(DECOR)) {
    if (!d.prize) out.push({ id, kind: 'decor', name: d.name, cost: d.cost, desc: d.floor ? 'Walkable paving for paths.' : 'Decoration for your farm.' });
  }
  return out;
}

export function upgradeOwned(state, id) {
  if (id === 'can1') return state.canLevel >= 1;
  if (id === 'can2') return state.canLevel >= 2;
  return !!state.upgrades[id];
}

export function canCraft(inv, recipeId) {
  const r = RECIPES[recipeId];
  return !!r && Object.entries(r.needs).every(([id, n]) => (inv[id] || 0) >= n);
}

// What a request can ask for this season, given the animals the farm has.
export function requestPool(season, animals) {
  const pool = [];
  for (const [id, c] of Object.entries(CROPS)) if (c.seasons.includes(season) && c.days <= 4) pool.push({ item: id, n: c.sell < 50 ? 5 : 3 });
  for (const [id, f] of Object.entries(FISH)) if (f.seasons.includes(season) && f.weight >= 14 && !f.night && !f.rain) pool.push({ item: id, n: 1 });
  const types = new Set(animals.map((a) => a.type));
  if (types.has('chicken')) pool.push({ item: 'egg', n: 3 });
  if (types.has('cow')) pool.push({ item: 'milk', n: 2 });
  if (types.has('goat')) pool.push({ item: 'goatmilk', n: 1 });
  return pool;
}

// Three requests per season, from three different villagers.
export function makeRequests(seed, dayIndex, season, animals) {
  const rand = rngFor(seed, dayIndex, 'requests');
  const pool = requestPool(season, animals);
  const people = VILLAGER_IDS.slice();
  const out = [];
  const used = new Set();
  for (let i = 0; i < 3 && pool.length; i++) {
    const who = people.splice(Math.floor(rand() * people.length), 1)[0];
    let choice = pick(rand, pool);
    for (let t = 0; t < 6 && used.has(choice.item); t++) choice = pick(rand, pool);
    used.add(choice.item);
    const value = sellPrice(choice.item) * choice.n;
    out.push({ villager: who, item: choice.item, n: choice.n, reward: Math.round((value * 1.6 + 60) / 10) * 10, done: false });
  }
  return out;
}

// Harvest Fair judging: value plus a bonus for each different kind of thing.
export function fairScore(items) {
  const kinds = new Set(items.map((id) => ITEMS[id]?.kind));
  const value = items.reduce((s, id) => s + sellPrice(id), 0);
  return value + kinds.size * 120 + new Set(items).size * 40;
}
export function fairRibbon(score) {
  if (score >= 900) return { ribbon: 'gold', gold: 600 };
  if (score >= 500) return { ribbon: 'silver', gold: 300 };
  return { ribbon: 'bronze', gold: 150 };
}
