import { rng, weightedPick } from './math.js';
import { BIOMES } from './biomes.js';
import { LANE, HAZARDS } from './entities.js';

const START_CLEAR = 450;
const LANDMARK_CLEAR = 320; // quiet space around the burger stop and the boss

// Builds the layout of one journey to a planet. Static things (asteroids,
// mines, wrecks, pickups, the burger stop) get positions; enemy groups get
// spawn triggers that the world fires when the jet gets close.
export function buildJourney(planet) {
  const r = rng(planet.seed * 31 + 11);
  const depth = Math.max(1, planet.depth);
  const biome = BIOMES[planet.biome];
  const length = Math.min(10500, 7200 + depth * 350);
  const burgerS = Math.round(length * (0.46 + r() * 0.08));
  const bossS = length;
  const j = {
    planet, depth, biome: planet.biome, length, seed: planet.seed,
    difficulty: 1 + (depth - 1) * 0.2,
    stretches: [], statics: [], pickups: [], spawns: [],
    burger: { s: burgerS, u: (r() * 2 - 1) * 10, w: (r() * 2 - 1) * 5, ring: 7 },
    bossS,
  };
  let id = 1;
  const nextId = () => id++;
  const inLane = (m = 0) => ({ u: (r() * 2 - 1) * (LANE.halfU - m), w: (r() * 2 - 1) * (LANE.halfW - m) });

  // Fill the space between landmarks with stretches.
  const zones = [[START_CLEAR, burgerS - LANDMARK_CLEAR], [burgerS + LANDMARK_CLEAR, bossS - LANDMARK_CLEAR]];
  let hyperGates = 0;
  for (const [from, to] of zones) {
    let s = from;
    while (s < to - 250) {
      const len = Math.min(to - s, 550 + r() * 350);
      let type = weightedPick(biome.stretches, r());
      // Avoid the same stretch twice in a row so journeys keep changing pace.
      const prev = j.stretches[j.stretches.length - 1];
      for (let tries = 0; prev && type === prev.type && tries < 4; tries++) type = weightedPick(biome.stretches, r());
      // One quiet stretch per journey gets a hyperspace booster instead.
      if (hyperGates < 1 && s > 1200 && r() < 0.18) { type = 'hyper'; hyperGates++; }
      j.stretches.push({ type, s0: s, s1: s + len });
      fill(type, s, s + len);
      // A little something to pick up in every stretch.
      addDustLine(s + len * (0.2 + r() * 0.6));
      if (r() < 0.55) {
        const pick = weightedPick({ power: 1.1, shield: 0.7, repair: 0.8, missiles: 0.7 }, r());
        const p = inLane(4);
        j.pickups.push({ id: nextId(), type: pick, s: s + r() * len, ...p });
      }
      s += len;
    }
  }

  function addDustLine(s0) {
    const count = 6 + Math.floor(r() * 5);
    const p = inLane(6);
    const du = (r() * 2 - 1) * 1.2, dw = (r() * 2 - 1) * 0.8;
    for (let i = 0; i < count; i++) {
      j.pickups.push({ id: nextId(), type: 'dust', s: s0 + i * 14, u: p.u + du * i * 2, w: p.w + dw * i * 2 });
    }
  }

  function fill(type, s0, s1) {
    const span = s1 - s0;
    const d = j.difficulty;
    if (type === 'asteroids') {
      const n = Math.round((16 + r() * 10) * Math.min(1.8, d));
      for (let i = 0; i < n; i++) {
        const size = weightedPick({ 3: 0.3, 2: 0.4, 1: 0.3 }, r());
        const p = { u: (r() * 2 - 1) * (LANE.halfU + 6), w: (r() * 2 - 1) * (LANE.halfW + 4) };
        j.statics.push({
          id: nextId(), kind: 'asteroid', size: Number(size), s: s0 + r() * span, ...p,
          hp: HAZARDS.asteroid[size].hp, du: (r() - 0.5) * 3, dw: (r() - 0.5) * 2, spin: (r() - 0.5) * 1.5,
        });
      }
    } else if (type === 'mines') {
      const n = Math.round((10 + r() * 6) * Math.min(1.6, d));
      for (let i = 0; i < n; i++) j.statics.push({ id: nextId(), kind: 'mine', s: s0 + r() * span, ...inLane(2), hp: 1 });
    } else if (type === 'wrecks') {
      const n = 6 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        // Big derelict hulls; always leave room to fly around them.
        const side = r() < 0.5 ? -1 : 1;
        j.statics.push({
          id: nextId(), kind: 'wreck', s: s0 + (i + 0.5) * (span / n), u: side * (6 + r() * 14), w: (r() * 2 - 1) * 8,
          size: { s: 18 + r() * 20, u: 6 + r() * 6, w: 5 + r() * 5 }, rot: r() * 6.28,
        });
      }
      // Ghost ships lurk among the wrecks.
      j.spawns.push({ s: s0 + span * 0.5, kind: 'ghosts', count: 2 + Math.floor(r() * 2) });
    } else if (type === 'squadron') {
      const waves = 2 + (r() < 0.4 + d * 0.1 ? 1 : 0);
      for (let i = 0; i < waves; i++) {
        j.spawns.push({ s: s0 + (i + 0.3) * (span / waves), kind: 'squadron', count: Math.min(7, 3 + Math.floor(r() * 2 + d * 0.8)), formation: weightedPick({ v: 1, line: 1, ring: 0.6 }, r()), ...inLane(8) });
      }
    } else if (type === 'drones') {
      j.spawns.push({ s: s0 + span * 0.3, kind: 'drones', count: Math.min(12, Math.round((5 + r() * 3) * d)) });
      j.spawns.push({ s: s0 + span * 0.75, kind: 'drones', count: Math.min(12, Math.round((4 + r() * 3) * d)) });
    } else if (type === 'cruiser') {
      const side = r() < 0.5 ? -1 : 1;
      j.spawns.push({ s: s0 + span * 0.25, kind: 'cruiser', u: side * (14 + r() * 4), w: (r() * 2 - 1) * 6, turrets: Math.min(6, 3 + Math.floor(d)) });
    } else if (type === 'ghosts') {
      j.spawns.push({ s: s0 + span * 0.3, kind: 'ghosts', count: Math.min(7, 3 + Math.floor(r() * 2 + d * 0.8)) });
      j.spawns.push({ s: s0 + span * 0.75, kind: 'ghosts', count: Math.min(6, 2 + Math.floor(r() * 2 + d * 0.5)) });
    } else if (type === 'hyper') {
      j.pickups.push({ id: nextId(), type: 'hyper', s: s0 + span * 0.5, u: 0, w: 0 });
    }
  }

  j.statics.sort((a, b) => a.s - b.s);
  j.pickups.sort((a, b) => a.s - b.s);
  j.spawns.sort((a, b) => a.s - b.s);
  j.nextId = id;
  return j;
}
