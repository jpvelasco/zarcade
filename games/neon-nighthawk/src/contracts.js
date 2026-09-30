import { BLOCK, gridCoordinates, gridPoint, nearestIntersection, routeBetween, routeLength } from './city.js';
import { hash, pick, rng } from './math.js';
import { CHAPTERS, JOBS_PER_CHAPTER, jobFor } from './story.js';

export const DISTRICTS = [
  {
    id: 'lowrise',
    name: 'Lowrise',
    subtitle: 'Wide streets. First watch.',
    accent: '#3fe5ff',
    sky: '#071326',
    rain: 0.18,
    grip: 1,
  },
  {
    id: 'market',
    name: 'Market Stack',
    subtitle: 'Crowded lanes and borrowed shortcuts.',
    accent: '#ff5fb7',
    sky: '#1a0c28',
    rain: 0.35,
    grip: 1,
  },
  {
    id: 'floodline',
    name: 'Floodline',
    subtitle: 'Rain turns every corner into a wager.',
    accent: '#7b9dff',
    sky: '#081832',
    rain: 0.95,
    grip: 0.62,
  },
  {
    id: 'skybridge',
    name: 'Skybridge',
    subtitle: 'Fast roads. Nowhere to disappear.',
    accent: '#ffc857',
    sky: '#1b1824',
    rain: 0.48,
    grip: 1,
  },
  {
    id: 'core',
    name: 'The Core',
    subtitle: 'Every light in the city is looking for you.',
    accent: '#c775ff',
    sky: '#130b25',
    rain: 0.7,
    grip: 0.9,
  },
];

// How cargo reacts to the ride, by job kind. `damage` scales bike damage
// while carrying; `window` scales the delivery time allowance.
const KIND_RULES = {
  delivery: { label: 'DELIVERY', condition: 'STANDARD CARGO', damage: 1, window: 1 },
  multi: { label: 'MULTI-DROP', condition: 'ANY ORDER', damage: 1, window: 1 },
  collect: { label: 'COLLECTION', condition: 'FIND THEM ALL', damage: 1, window: 1.1 },
  chase: { label: 'CHASE', condition: 'CATCH IT', damage: 1, window: 1.35 },
  stealth: { label: 'STEALTH', condition: 'THREE SCANS AND IT IS OVER', damage: 1, window: 1.25 },
  express: { label: 'EXPRESS', condition: 'SHORT WINDOW', damage: 1, window: 0.68 },
  finale: { label: 'FINALE', condition: 'EVERYTHING YOU HAVE', damage: 1, window: 1.15 },
};

const FIRST_NAMES = ['Hearth', 'Rook', 'Velvet', 'Sable', 'Arden', 'Nori', 'Mara', 'Vesper'];
const LAST_NAMES = ['Terminal', 'Arcade', 'Annex', 'Spire', 'Quay', 'Yard', 'Station', 'Relay'];

export const SPARK_SPACING = 92;
const CARRY_SPEED = 130; // a relaxed average speed for time windows, px/s

function locationName(seed) {
  const random = rng(seed);
  return `${pick(FIRST_NAMES, random)} ${pick(LAST_NAMES, random)}`;
}

export function districtFor(chapter) {
  return DISTRICTS[Math.min(Math.max(chapter, 0), DISTRICTS.length - 1)];
}

const cellKey = (cell) => `${cell.column},${cell.row}`;

// A grid cell `minimum`–`maximum` blocks (Manhattan) from `origin` that is
// not in `taken`. Deterministic for a given random stream.
function placeCell(random, origin, minimum, maximum, taken) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = Math.floor(random() * (maximum * 2 + 1)) - maximum;
    const y = Math.floor(random() * (maximum * 2 + 1)) - maximum;
    const reach = Math.abs(x) + Math.abs(y);
    const cell = { column: origin.column + x, row: origin.row + y };
    if (reach >= minimum && reach <= maximum && !taken.has(cellKey(cell))) {
      taken.add(cellKey(cell));
      return cell;
    }
  }
  // A ring this wide always has a free cell, but stay total just in case.
  const cell = { column: origin.column + maximum + taken.size, row: origin.row };
  taken.add(cellKey(cell));
  return cell;
}

function stop(kind, cell, name, index) {
  return { id: `${kind}-${index}`, kind, name, done: false, ...gridPoint(cell.column, cell.row) };
}

// Visit order used for the reference route, sparks and the time window:
// always head for the closest stop next, finishing each leg before the next.
function referenceOrder(from, legs) {
  const order = [];
  let at = from;
  for (const leg of legs) {
    const left = leg.slice();
    while (left.length) {
      left.sort((a, b) => (Math.abs(a.x - at.x) + Math.abs(a.y - at.y)) - (Math.abs(b.x - at.x) + Math.abs(b.y - at.y)));
      const next = left.shift();
      order.push(next);
      at = next;
    }
  }
  return order;
}

// Sparks sit along the suggested route, spaced evenly and kept clear of stops.
function sparksAlong(from, order, seed) {
  const sparks = [];
  let at = nearestIntersection(from);
  let carry = SPARK_SPACING * 0.6;
  for (const target of order) {
    let previous = at;
    for (const corner of routeBetween(at, target, seed)) {
      const length = Math.abs(corner.x - previous.x) + Math.abs(corner.y - previous.y);
      const dx = Math.sign(corner.x - previous.x);
      const dy = Math.sign(corner.y - previous.y);
      let d = carry;
      for (; d < length; d += SPARK_SPACING) {
        const point = { x: previous.x + dx * d, y: previous.y + dy * d };
        const nearStop = order.some((s) => Math.abs(s.x - point.x) + Math.abs(s.y - point.y) < 70);
        if (!nearStop) sparks.push({ x: point.x, y: point.y, taken: false });
      }
      carry = d - length;
      previous = corner;
    }
    at = target;
  }
  return sparks;
}

function defaultSentries(chapter, job, kind) {
  if (chapter === 0 && job === 0) return 0;
  return Math.min(7, 1 + chapter + (kind === 'stealth' ? 2 : 0) + (kind === 'finale' ? 1 : 0));
}

// Sentry drones hover over intersections on the suggested route, sweeping a
// scanner cone. Posts stay clear of the start and every stop, and apart from
// each other, so there is always a way past.
function sentriesAlong(from, order, seed, count) {
  if (count <= 0) return [];
  const random = rng(seed ^ 0x5e17);
  const posts = [];
  let at = from;
  for (const target of order) {
    let previous = at;
    for (const corner of routeBetween(at, target, seed)) {
      const steps = (Math.abs(corner.x - previous.x) + Math.abs(corner.y - previous.y)) / BLOCK;
      const dx = Math.sign(corner.x - previous.x);
      const dy = Math.sign(corner.y - previous.y);
      for (let i = 1; i <= steps; i++) posts.push({ x: previous.x + dx * i * BLOCK, y: previous.y + dy * i * BLOCK });
      previous = corner;
    }
    at = target;
  }
  const blocked = [from, ...order];
  const clear = posts.filter((post) => blocked.every((b) => Math.abs(b.x - post.x) + Math.abs(b.y - post.y) > BLOCK * 1.5));
  for (let i = clear.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [clear[i], clear[j]] = [clear[j], clear[i]];
  }
  const chosen = [];
  for (const post of clear) {
    if (chosen.length >= count) break;
    if (chosen.every((c) => Math.abs(c.x - post.x) + Math.abs(c.y - post.y) >= BLOCK * 2)) {
      chosen.push({
        x: post.x,
        y: post.y,
        base: Math.floor(random() * 4) * (Math.PI / 2),
        sweep: 0.7 + random() * 0.6,
        phase: random() * Math.PI * 2,
      });
    }
  }
  return chosen;
}

// One story job. Everything here is derived from the shift seed, so a Shift
// Code recreates the same stops, sparks and windows on any machine.
export function makeContract(shiftSeed, chapter, job, from = { x: 0, y: 0 }) {
  const def = jobFor(chapter, job);
  if (!def) throw new Error(`No job ${chapter}/${job}`);
  const seed = hash((shiftSeed | 0) ^ Math.imul(chapter * JOBS_PER_CHAPTER + job + 1, 0x9e3779b9));
  const random = rng(seed);
  const start = gridCoordinates(nearestIntersection(from));
  const taken = new Set([cellKey(start)]);
  const rules = KIND_RULES[def.kind];
  const district = districtFor(chapter);
  const reach = 4 + Math.min(chapter, 3);
  const legs = [];
  let runner = null;

  if (def.kind === 'collect' || def.kind === 'finale') {
    const items = [];
    for (let i = 0; i < def.items; i++) {
      items.push(stop(def.kind === 'finale' ? 'piece' : 'cell', placeCell(random, start, 3, reach + 1, taken), def.itemName, i));
    }
    const hub = placeCell(random, start, reach - 1, reach + 1, taken);
    legs.push(items, [stop('drop', hub, def.dropName, 0)]);
  } else if (def.kind === 'chase') {
    const home = placeCell(random, start, 3, 4, taken);
    runner = {
      kind: def.runner,
      name: def.runnerName,
      ...gridPoint(home.column, home.row),
      home: gridPoint(home.column, home.row),
    };
    const drop = placeCell(random, start, reach, reach + 2, taken);
    legs.push([{ id: 'runner-0', kind: 'runner', name: def.runnerName, done: false, x: runner.x, y: runner.y }]);
    legs.push([stop('drop', drop, def.dropName, 0)]);
  } else if (def.kind === 'multi') {
    const pickupCell = placeCell(random, start, 3, reach, taken);
    const drops = [];
    for (let i = 0; i < def.items; i++) {
      drops.push(stop('drop', placeCell(random, pickupCell, 3, reach + 1, taken), def.dropNames[i] || locationName(seed ^ (i + 7)), i));
    }
    legs.push([stop('pickup', pickupCell, def.pickupName, 0)], drops);
  } else {
    const pickupCell = placeCell(random, start, 3, reach, taken);
    const dropCell = placeCell(random, pickupCell, reach + 2, reach + 4, taken);
    legs.push([stop('pickup', pickupCell, def.pickupName || locationName(seed ^ 0x17), 0)]);
    legs.push([stop('drop', dropCell, def.dropName || locationName(seed ^ 0xb4), 0)]);
  }

  const origin = gridPoint(start.column, start.row);
  const order = referenceOrder(origin, legs);
  let distance = 0;
  let at = origin;
  for (const point of order) {
    distance += routeLength(at, routeBetween(at, point, seed));
    at = point;
  }
  if (runner) distance += BLOCK * 3; // the runner won't sit still
  const timeLimit = Math.round((distance / CARRY_SPEED + 20 + order.length * 4) * rules.window);
  const reward = 110 + chapter * 70 + job * 25 + Math.round(distance / 40);

  return {
    id: `${(shiftSeed >>> 0).toString(36)}-${chapter}-${job}`,
    seed,
    chapter,
    job,
    kind: def.kind,
    title: def.title,
    def,
    type: {
      id: def.kind,
      label: rules.label,
      name: def.title,
      condition: def.fragile ? 'FRAGILE CARGO' : rules.condition,
      damage: def.fragile ? 1.7 : rules.damage,
      scanLimit: def.scanLimit || 0,
    },
    district,
    start: origin,
    legs,
    runner,
    sparks: sparksAlong(origin, order, seed),
    sentries: sentriesAlong(origin, order, seed, def.sentries ?? defaultSentries(chapter, job, def.kind)),
    distance,
    timeLimit,
    reward,
    patrols: def.patrols,
  };
}

export function chapterCount() {
  return CHAPTERS.length;
}
