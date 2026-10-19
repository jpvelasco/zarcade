// The clock, the weather and who swims where. All seeded.
import { FISH, WATER, PERIODS, PERIOD_INFO, RARITY_INFO, appearsAt, bandAt } from './data.js';
import { hashSeed, mulberry32, weightedPick } from './rng.js';

// Hour (0–24) to a time of day. Starfall Lagoon is always night.
export function periodOf(hour, waterId) {
  if (waterId && WATER[waterId].nightOnly) return 'night';
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

// Weather changes every three hours, the same for everyone on the same day.
export function weatherSlot(hour) {
  return Math.floor((((hour % 24) + 24) % 24) / 3);
}

export function weatherFor(waterId, day, hour) {
  const w = WATER[waterId];
  const rng = mulberry32(hashSeed('weather', waterId, day, weatherSlot(hour)));
  const entries = Object.entries(w.weathers);
  return weightedPick(rng, entries, ([, n]) => n)[0];
}

// The hour the next time of day starts (for the "wait" button).
export function nextPeriodHour(hour, waterId) {
  if (waterId && WATER[waterId].nightOnly) return hour + 3;
  const cur = periodOf(hour);
  for (let h = Math.floor(hour) + 1; h < hour + 25; h++) if (periodOf(h) !== cur) return h;
  return hour + 3;
}

export function advanceClock(clock, hours) {
  let hour = clock.hour + hours;
  let day = clock.day;
  while (hour >= 24) { hour -= 24; day++; }
  return { day, hour };
}

// The fish that can be found in a water at a time and weather, with weights.
export function spawnTable(waterId, period, weather) {
  return FISH.filter((f) => f.water === waterId && appearsAt(f, period, weather))
    .map((fish) => ({ fish, weight: RARITY_INFO[fish.rarity].weight }));
}

export const likesBait = (fish, baitId) => fish.baits.includes(baitId);

// Pick one fish for a depth band. `baitId` makes fish that bite it more
// likely to show up near the lure (the bait's smell spreads).
export function rollFish(rng, table, { band = null, baitId = null, baitBoost = 3 } = {}) {
  const pool = band ? table.filter((e) => e.fish.bands.includes(band)) : table;
  const pick = weightedPick(rng, pool, (e) => {
    let w = e.weight;
    if (e.fish.rarity === 'legendary') w = baitId === 'starlight' ? 6 : 0;
    else if (baitId === 'starlight') w *= 0.5;
    if (baitId && likesBait(e.fish, baitId)) w *= baitBoost;
    return w;
  });
  return pick ? pick.fish : null;
}

// Size roll: big ones are rarer.
export const rollSize = (rng) => Math.pow(rng(), 1.7);

export { PERIODS, PERIOD_INFO, bandAt };
