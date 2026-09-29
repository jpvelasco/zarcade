import { rng, weightedPick } from './math.js';
import { OBSTACLES, RAMP, ZOMBIES } from './entities.js';

const START_CLEAR = 120; // meters after the start with nothing on the road
const FINISH_CLEAR = 60;
const MIN_GAP = 6;       // a road obstacle always leaves at least this much room

// Lays out one track: obstacles, ramps, pickups, zombies and scenery. The
// same track definition always produces the same layout.
export function buildLevel(track, def) {
  const r = rng(def.seed * 7 + 3);
  const level = { obstacles: [], ramps: [], pickups: [], zombies: [], decor: [] };
  let nextId = 1;

  const addObstacle = (type, dist, lateral, extra = {}) => {
    const t = OBSTACLES[type];
    const p = track.pointAt(dist, lateral);
    const radius = t.r[0] + r() * (t.r[1] - t.r[0]);
    const o = {
      id: nextId++, type, x: p.x, z: p.z, y: track.groundHeight(p.x, p.z), r: radius, h: t.h,
      rot: r() * Math.PI * 2, along: dist, lateral, alive: true, ...extra,
    };
    level.obstacles.push(o);
    return o;
  };

  const addPickup = (type, dist, lateral, lift = 0) => {
    const p = track.pointAt(dist, lateral);
    level.pickups.push({ id: nextId++, type, x: p.x, z: p.z, y: track.groundHeight(p.x, p.z) + 1 + lift, alive: true, air: lift > 0 });
  };

  const addZombie = (type, dist, lateral) => {
    const p = track.pointAt(dist, lateral);
    const z = ZOMBIES[type];
    level.zombies.push({
      id: nextId++, type, x: p.x, z: p.z, y: track.groundHeight(p.x, p.z), heading: r() * Math.PI * 2,
      hp: z.hp, r: z.r, along: dist, alive: true, active: false, phase: r() * 10, hint: Math.floor(dist / 2),
    });
  };

  const half = track.half;
  const straightEnough = (dist) => Math.abs(headingDelta(track, dist - 25, dist + 25)) < 0.3;

  // Gameplay "beats" along the road, each owning its own stretch.
  let d = START_CLEAR;
  const end = track.finishDist - FINISH_CLEAR;
  while (d < end) {
    let span = 34 + r() * 26;
    let beat = weightedPick(def.beats, r());
    if (beat === 'ramp' && !straightEnough(d)) beat = 'coins';

    if (beat === 'obstacles') {
      const type = weightedPick(def.obstacles, r());
      if (OBSTACLES[type].rolling) {
        // A boulder that rolls back and forth across the road.
        addObstacle(type, d + span / 2, 0, { roll: { amp: half + 7, speed: 0.5 + r() * 0.3, phase: r() * 6 } });
      } else {
        // A short slalom: each obstacle blocks one side, alternating, spaced
        // far enough apart to weave through at speed.
        const count = 1 + Math.floor(r() * 2.4);
        let side = r() < 0.5 ? -1 : 1;
        span = Math.max(span, 6 + count * 30 + 12); // never spill into the next beat
        for (let i = 0; i < count; i++) {
          // |lateral| >= minOffset keeps the far side open by at least MIN_GAP.
          const minOffset = Math.max(0.5, MIN_GAP - half + OBSTACLES[type].r[1]);
          const maxOffset = Math.max(minOffset, half - 1);
          addObstacle(type, d + 6 + i * (24 + r() * 6), side * (minOffset + r() * (maxOffset - minOffset)));
          side = -side;
        }
      }
    } else if (beat === 'zombies') {
      const count = 3 + Math.floor(r() * 5);
      for (let i = 0; i < count; i++) {
        const type = weightedPick(def.zombies, r());
        const onRoad = type === 'runner' ? r() < 0.25 : r() < 0.55;
        const side = r() < 0.5 ? -1 : 1;
        const lateral = onRoad ? (r() * 2 - 1) * (half - 1.5) : side * (half + 3 + r() * 18);
        addZombie(type, d + r() * span, lateral);
      }
      // Explosive barrels just off the road beside a crowd reward a
      // well-placed shot without being easy to ram by accident.
      if (def.obstacles.barrel && r() < 0.45) addObstacle('barrel', d + span * 0.5, (r() < 0.5 ? -1 : 1) * (half + 1.8));
    } else if (beat === 'coins') {
      const count = 6 + Math.floor(r() * 4);
      const amp = (half - 2) * (0.3 + r() * 0.5), phase = r() * Math.PI * 2;
      for (let i = 0; i < count; i++) addPickup('coin', d + 4 + i * 4, Math.sin(phase + i * 0.6) * amp);
    } else if (beat === 'pickup') {
      const type = weightedPick(def.pickups, r());
      if (r() < 0.35) {
        // A choice: two different pickups side by side.
        const other = weightedPick(def.pickups, r());
        addPickup(type, d + span / 2, -half * 0.45);
        addPickup(other === type ? 'nitro' : other, d + span / 2, half * 0.45);
      } else {
        addPickup(type, d + span / 2, (r() * 2 - 1) * (half - 3));
      }
    } else if (beat === 'ramp') {
      const lateral = (r() * 2 - 1) * (half - RAMP.width / 2 - 1);
      const p = track.pointAt(d + 6, lateral);
      level.ramps.push({ id: nextId++, x: p.x, z: p.z, y: track.groundHeight(p.x, p.z), heading: p.heading, along: d + 6, lateral, ...RAMP });
      // Coins in the air above the landing zone.
      for (let i = 0; i < 4; i++) addPickup('coin', d + 20 + i * 5, lateral, 3.5 + Math.sin((i / 3) * Math.PI) * 1.5);
    }
    d += span;
  }

  placeDecor(track, def, r, level, () => nextId++);
  return level;
}

function headingDelta(track, a, b) {
  const ha = track.pointAt(a).heading, hb = track.pointAt(b).heading;
  return Math.atan2(Math.sin(hb - ha), Math.cos(hb - ha));
}

// Scenery beside the road. Anything within the drivable boundary collides;
// farther pieces are visual only.
function placeDecor(track, def, r, level, id) {
  const half = track.half;
  for (let d = 30; d < track.length; d += 7) {
    for (const side of [-1, 1]) {
      if (r() > 0.55) continue;
      const type = weightedPick(def.decor, r());
      let lateral;
      // Leave room beside the road so a wobbly driver can recover.
      if (type === 'building') lateral = half + 11 + r() * 7;
      else lateral = half + 6 + Math.pow(r(), 1.6) * 140;
      if (def.walls && lateral > half + def.walls.from - 3) lateral = half + def.walls.from - 2 + r() * 4; // at the wall's foot
      const p = track.pointAt(d, side * lateral);
      const near = track.nearest(p.x, p.z);
      if (near && near.distance < half + 4) continue; // too close to another stretch of road
      const t = OBSTACLES[type];
      const radius = t.r[0] + r() * (t.r[1] - t.r[0]);
      const piece = {
        id: id(), type, x: p.x, z: p.z, y: track.groundHeight(p.x, p.z, near), r: radius, h: t.h,
        rot: type === 'building' ? p.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2) : r() * Math.PI * 2,
        along: d, lateral: side * lateral, alive: true, decor: true,
      };
      if (lateral < track.boundary + 4) level.obstacles.push(piece);
      else level.decor.push(piece);
    }
  }
}
