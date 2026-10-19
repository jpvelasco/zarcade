import { clamp, hash2, hashFloat, mod, rng } from './math.js';

export const BLOCK = 280;
export const ROAD = 96;
export const ROAD_HALF = ROAD / 2;
// Cars travel near the curb, leaving a centerline for the Nighthawk to use
// for tight, charge-building near misses without unavoidable collisions.
export const LANE = 27;

export function centered(value, size = BLOCK) {
  return mod(value + size / 2, size) - size / 2;
}

export function nearestStreet(value) {
  return Math.round(value / BLOCK) * BLOCK;
}

export function nearestIntersection(point) {
  return { x: nearestStreet(point.x), y: nearestStreet(point.y) };
}

export function gridPoint(column, row) {
  return { x: column * BLOCK, y: row * BLOCK };
}

export function gridCoordinates(point) {
  return {
    column: Math.round(point.x / BLOCK),
    row: Math.round(point.y / BLOCK),
  };
}

export function roadKind(x, y, inset = 0) {
  const vertical = Math.abs(centered(x)) <= ROAD_HALF - inset;
  const horizontal = Math.abs(centered(y)) <= ROAD_HALF - inset;
  if (vertical && horizontal) return 'intersection';
  if (vertical) return 'vertical';
  if (horizontal) return 'horizontal';
  return 'building';
}

export function isRoad(x, y, inset = 0) {
  return roadKind(x, y, inset) !== 'building';
}

// Moves a point that entered a city block back to the closest driveable lane.
// The caller uses `hit` to convert the scrape into speed loss and damage.
export function keepOnRoad(point, inset = 13) {
  const localX = centered(point.x);
  const localY = centered(point.y);
  const edge = ROAD_HALF - inset;
  // Physics can leave a bike at 30.00000000000002 rather than 30 exactly.
  // That is still the edge of a valid lane, not a repeated wall collision.
  const tolerance = 1e-6;
  if (Math.abs(localX) <= edge + tolerance || Math.abs(localY) <= edge + tolerance) {
    return { x: point.x, y: point.y, hit: false };
  }

  const xDistance = Math.abs(localX) - edge;
  const yDistance = Math.abs(localY) - edge;
  if (xDistance < yDistance) {
    return {
      x: point.x - Math.sign(localX || 1) * xDistance,
      y: point.y,
      hit: true,
      normal: { x: Math.sign(localX || 1), y: 0 },
    };
  }
  return {
    x: point.x,
    y: point.y - Math.sign(localY || 1) * yDistance,
    hit: true,
    normal: { x: 0, y: Math.sign(localY || 1) },
  };
}

export function blockAt(x, y, seed = 0) {
  const column = Math.floor((x + BLOCK / 2) / BLOCK);
  const row = Math.floor((y + BLOCK / 2) / BLOCK);
  const value = hash2(column, row, seed);
  const shape = value % 5;
  return {
    column,
    row,
    seed: value,
    hue: 195 + (value % 95),
    height: 0.45 + ((value >>> 8) % 55) / 100,
    inset: 13 + ((value >>> 16) % 18),
    roof: shape,
    sign: (value >>> 25) % 4 === 0,
  };
}

function compact(points) {
  return points.filter((point, index) =>
    index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}

// A deterministic Manhattan path. The occasional extra bend keeps routes from
// feeling identical while every segment stays on a street.
export function routeBetween(from, to, seed = 0) {
  const start = nearestIntersection(from);
  const end = nearestIntersection(to);
  if (start.x === end.x && start.y === end.y) return [end];

  const startGrid = gridCoordinates(start);
  const endGrid = gridCoordinates(end);
  const horizontalFirst = (hash2(startGrid.column + endGrid.column, startGrid.row + endGrid.row, seed) & 1) === 0;
  const points = [];

  if (start.x === end.x || start.y === end.y) {
    points.push(end);
  } else if (horizontalFirst) {
    points.push({ x: end.x, y: start.y }, end);
  } else {
    points.push({ x: start.x, y: end.y }, end);
  }

  return compact(points);
}

export function routeLength(from, route) {
  let total = 0;
  let previous = from;
  for (const point of route) {
    total += Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
    previous = point;
  }
  return total;
}

export function makeTraffic(seed, count = 44) {
  const random = rng(seed ^ 0x51f15e);
  const colors = ['#f5c84b', '#31d7e8', '#ee5bb4', '#e9edf9', '#9b72ff', '#ff784f'];
  const traffic = [];

  for (let index = 0; index < count; index++) {
    const axis = random() < 0.5 ? 'x' : 'y';
    const road = Math.round((random() - 0.5) * 18) * BLOCK;
    const lane = (random() < 0.5 ? -1 : 1) * LANE;
    traffic.push({
      id: index,
      axis,
      road,
      lane,
      dir: random() < 0.5 ? -1 : 1,
      pos: (random() - 0.5) * BLOCK * 20,
      speed: 110 + random() * 105,
      length: 22 + random() * 13,
      color: colors[Math.floor(random() * colors.length)],
      near: false,
    });
  }
  return traffic;
}

export function trafficPosition(vehicle) {
  if (vehicle.axis === 'x') return { x: vehicle.pos, y: vehicle.road + vehicle.lane };
  return { x: vehicle.road + vehicle.lane, y: vehicle.pos };
}

export function signalState(column, row, time) {
  const phase = mod(time * 0.85 + hashFloat(column, row, 19) * 8, 8);
  return phase < 4 ? 'horizontal' : 'vertical';
}

export function districtGlow(seed, x, y) {
  const value = hashFloat(Math.floor(x / BLOCK), Math.floor(y / BLOCK), seed + 91);
  return clamp(0.3 + value * 0.7, 0, 1);
}
