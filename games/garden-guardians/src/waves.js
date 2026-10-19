// Deterministic wave scripts built from each map's roster and seed.
import { BUGS } from './data.js';
import { MAPS, mapInfo } from './maps.js';
import { makeRng } from './rng.js';

// Rough "ant equivalents" per bug, used to spend a wave's budget.
export const THREAT = { ant: 1, ladybug: 0.7, beetle: 2.6, snail: 5, butterfly: 1.4, wasp: 2.4, caterpillar: 3.2 };
const FLYERS = ['butterfly', 'wasp'];

export function waveBudget(mapIndex, w) {
  return (6 + 2.3 * w + 0.04 * w * w) * (1 + 0.05 * mapIndex);
}

export function waveHpMul(map, w) {
  return map.hp * (1 + 0.11 * (w - 1));
}

export const MAX_GROUP = 48;

function group(type, count, spawnCount) {
  return { type, count: Math.max(1, Math.min(MAX_GROUP, Math.round(count))), gap: BUGS[type].gap, spawn: spawnCount > 1 ? 'alt' : 0, delay: 0 };
}

export function buildWaves(mapIndex) {
  const map = MAPS[mapIndex];
  const nSpawns = mapInfo(mapIndex).spawns.length;
  const rng = makeRng(map.seed * 7919 + 13);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const waves = [];
  let lastMain = null;
  for (let w = 1; w <= map.waves; w++) {
    const available = Object.keys(map.roster).filter((t) => map.roster[t] <= w);
    const fresh = available.find((t) => map.roster[t] === w && w > 1);
    const budget = waveBudget(mapIndex, w);
    const groups = [];
    const last = w === map.waves;
    if (last) {
      for (const b of map.boss) groups.push({ ...group(b, 1, 1), hpMul: map.bossHp, spawn: 0 });
      const escort = available.filter((t) => t !== 'snail');
      const e = pick(escort);
      groups.push(group(e, (budget * 0.3) / THREAT[e], nSpawns));
      groups.push(group('ant', budget * 0.25, nSpawns));
    } else if (fresh) {
      // A new bug gets its own spotlight group, with ants for company.
      groups.push(group('ant', budget * 0.45, nSpawns));
      groups.push(group(fresh, Math.max(2, (budget * 0.55) / THREAT[fresh]), nSpawns));
    } else if (w % 5 === 0 && available.includes('ladybug')) {
      groups.push(group('ladybug', (budget * 0.7) / THREAT.ladybug, nSpawns));
      const flyers = FLYERS.filter((t) => available.includes(t));
      const extra = flyers.length ? pick(flyers) : 'beetle';
      groups.push(group(extra, (budget * 0.3) / THREAT[extra], nSpawns));
    } else {
      const choices = available.filter((t) => t !== lastMain);
      const main = pick(choices.length ? choices : available);
      lastMain = main;
      const others = available.filter((t) => t !== main);
      const share = others.length && rng() < 0.7 ? 0.6 : 1;
      groups.push(group(main, (budget * share) / THREAT[main], nSpawns));
      if (share < 1) {
        const second = pick(others);
        groups.push(group(second, (budget * (1 - share)) / THREAT[second], nSpawns));
      }
    }
    // Stagger groups so they overlap a little.
    let t = 0;
    for (const g of groups) {
      g.delay = t;
      t += g.count * g.gap * 0.6 + 1;
    }
    waves.push({ number: w, groups, hpMul: waveHpMul(map, w), boss: last });
  }
  return waves;
}

// Flatten a wave into timed spawn orders.
export function waveSpawns(wave, nSpawns = 1) {
  const out = [];
  wave.groups.forEach((g, gi) => {
    for (let k = 0; k < g.count; k++) {
      const spawn = g.spawn === 'alt' ? (k + gi) % nSpawns : g.spawn;
      out.push({ t: g.delay + k * g.gap, type: g.type, spawn, hpMul: g.hpMul ?? wave.hpMul });
    }
  });
  return out.sort((a, b) => a.t - b.t);
}

export function waveCounts(wave) {
  const counts = {};
  for (const g of wave.groups) counts[g.type] = (counts[g.type] || 0) + g.count;
  return counts;
}

// "20 ants · 3 beetles" style preview, bosses first.
export function describeWave(wave) {
  const counts = waveCounts(wave);
  const parts = Object.entries(counts).sort(([a], [b]) => (BUGS[b].boss ? 1 : 0) - (BUGS[a].boss ? 1 : 0));
  return parts
    .map(([type, n]) => (BUGS[type].boss ? `BOSS ${BUGS[type].name}` : `${n} ${n === 1 ? BUGS[type].name.toLowerCase() : BUGS[type].plural}`))
    .join(' · ');
}

export function hasFlyers(wave) {
  return wave.groups.some((g) => BUGS[g.type].flying);
}
