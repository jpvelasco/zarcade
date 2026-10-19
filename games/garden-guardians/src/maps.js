// Garden maps. Each layout is a 16×10 grid of characters:
//   .  grass (plantable)      #  path
//   A B  spawn points (path)  G  Grandma's picnic (path end)
//   t  tree   r  rock   w  pond water   f  flower bed   (all blocked)
// Paths are traced from each spawn to G with a breadth-first search, so a
// layout only needs to draw them; tests check every path tile is used.

export const COLS = 16;
export const ROWS = 10;

export const AREAS = [
  { id: 'lawn', name: 'Backyard Lawn', blurb: 'Where the picnic blanket first goes down.' },
  { id: 'veggie', name: 'Veggie Patch', blurb: 'Rows of carrots, pumpkins and very nosy bugs.' },
  { id: 'pond', name: 'Lily Pond Orchard', blurb: 'Golden hour by the pond. The bugs are bolder here.' },
];

export const MAPS = [
  {
    id: 'sunny-lawn', name: 'Sunny Lawn', area: 'lawn', waves: 12, coins: 220, hp: 1.2, seed: 11,
    boss: ['raccoon'], bossHp: 0.55,
    roster: { ant: 1, beetle: 4, ladybug: 6 },
    layout: [
      '..t.............',
      'A#####....t.....',
      '.....#..........',
      '.....#...######.',
      '.t...#...#....#.',
      '.....#...#....#.',
      '.....#####....#.',
      '..........f...#.',
      '..r....G#######.',
      '........t.......',
    ],
  },
  {
    id: 'birdbath-bend', name: 'Birdbath Bend', area: 'lawn', waves: 13, coins: 240, hp: 1.55, seed: 23,
    boss: ['baron'], bossHp: 0.75,
    roster: { ant: 1, ladybug: 2, beetle: 3, snail: 5, butterfly: 8 },
    layout: [
      '......t.........',
      '.######......r..',
      '.#....#.........',
      '.#....#..#####..',
      'A#....#..#...#..',
      '......#..#.w.#..',
      '..t...####...#..',
      '.............#..',
      '....f...G#####..',
      '..........t.....',
    ],
  },
  {
    id: 'gnome-crossing', name: 'Gnome Crossing', area: 'lawn', waves: 14, coins: 260, hp: 1.4, seed: 37,
    boss: ['queen'], bossHp: 0.8,
    roster: { ant: 1, beetle: 2, ladybug: 3, butterfly: 4, snail: 6, wasp: 8, caterpillar: 10 },
    layout: [
      'A###...........t',
      '...#..######....',
      '.t.#..#....#....',
      '...#..#....#..r.',
      '...#..#....####.',
      '...####.......#.',
      '..............#.',
      '..f.#######...#.',
      '....#.....#####.',
      '....G...........',
    ],
  },
  {
    id: 'carrot-rows', name: 'Carrot Rows', area: 'veggie', waves: 15, coins: 280, hp: 1.3, seed: 41,
    boss: ['greatsnail'], bossHp: 0.9,
    roster: { ant: 1, caterpillar: 2, beetle: 3, snail: 4, ladybug: 5, butterfly: 6, wasp: 9 },
    layout: [
      '....A...........',
      '.r..#.......t...',
      '....#...........',
      '....#######.....',
      '..........#..f..',
      'B####.....#.....',
      '....#.....#.....',
      '....#######.....',
      '..........####G.',
      '...t............',
    ],
  },
  {
    id: 'pumpkin-spiral', name: 'Pumpkin Spiral', area: 'veggie', waves: 16, coins: 300, hp: 1.85, seed: 53,
    boss: ['bigcat'], bossHp: 1,
    roster: { ant: 1, ladybug: 2, caterpillar: 3, beetle: 4, wasp: 5, snail: 7, butterfly: 8 },
    layout: [
      '..............t.',
      '.############...',
      '.#..........#.r.',
      '.#.######...#...',
      '.#.#....#...#...',
      '.#.#.G###...#.f.',
      '.#.#........#...',
      '.#.##########...',
      '.#..............',
      '.A.......t......',
    ],
  },
  {
    id: 'scarecrow-split', name: 'Scarecrow Split', area: 'veggie', waves: 16, coins: 320, hp: 1.35, seed: 67,
    boss: ['raccoon'], bossHp: 1.05,
    roster: { ant: 1, beetle: 2, butterfly: 3, ladybug: 4, snail: 5, caterpillar: 6, wasp: 7 },
    layout: [
      'A#####..........',
      '.....#....t.....',
      '..r..#..........',
      '.....######.....',
      '..........#...t.',
      '.f........####G.',
      '..........#.....',
      '.....######.....',
      '.....#......r...',
      'B#####..........',
    ],
  },
  {
    id: 'lily-loop', name: 'Lily Pad Loop', area: 'pond', waves: 17, coins: 340, hp: 1.5, seed: 71,
    boss: ['queen'], bossHp: 1.2,
    roster: { ant: 1, butterfly: 2, beetle: 3, wasp: 4, ladybug: 5, caterpillar: 6, snail: 8 },
    layout: [
      '..........t.....',
      'A###########....',
      '...........#....',
      '.####......#.ww.',
      '.#..#.www..#.ww.',
      '.#..#.www..#....',
      '.#..#......#..t.',
      '.#..########....',
      '.#.........f....',
      '.G..............',
    ],
  },
  {
    id: 'orchard-twist', name: 'Orchard Twist', area: 'pond', waves: 18, coins: 360, hp: 2.15, seed: 83,
    boss: ['baron'], bossHp: 1.35,
    roster: { ant: 1, beetle: 2, wasp: 3, caterpillar: 4, ladybug: 5, snail: 6, butterfly: 7 },
    layout: [
      '...A........t...',
      '...#....t.......',
      '...#..#######...',
      '...#..#.....#...',
      '...####.....###B',
      '............#...',
      '..w.........#...',
      '.ww.........#.t.',
      '....G########...',
      '..........r.....',
    ],
  },
  {
    id: 'grandmas-gate', name: "Grandma's Gate", area: 'pond', waves: 20, coins: 400, hp: 2.5, seed: 97,
    boss: ['raccoon', 'queen'], bossHp: 1.4,
    roster: { ant: 1, ladybug: 2, beetle: 3, butterfly: 4, snail: 5, wasp: 6, caterpillar: 7 },
    layout: [
      'A####......t....',
      '....#...######..',
      '..t.#...#....#..',
      '....#####....#..',
      '.............#..',
      '.G######.....#..',
      '.......#..w..#..',
      '.......#######..',
      '..r.......#..t..',
      '..........B.....',
    ],
  },
];

const BLOCKED = new Set(['t', 'r', 'w', 'f']);
const PATHLIKE = new Set(['#', 'A', 'B', 'G']);

export function tileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
  return map.layout[y][x];
}

export function isPathTile(ch) { return PATHLIKE.has(ch); }
export function isBlockedTile(ch) { return BLOCKED.has(ch); }
export function isBuildableTile(ch) { return ch === '.'; }

export function findTiles(map, ch) {
  const out = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (map.layout[y][x] === ch) out.push({ x, y });
  return out;
}

// Shortest route over path tiles from (sx, sy) to the goal. Returns cells or null.
export function tracePath(map, start, goal) {
  const key = (x, y) => y * COLS + x;
  const prev = new Map([[key(start.x, start.y), null]]);
  const queue = [start];
  while (queue.length) {
    const c = queue.shift();
    if (c.x === goal.x && c.y === goal.y) {
      const cells = [];
      for (let k = key(c.x, c.y); k !== null; k = prev.get(k)) cells.push({ x: k % COLS, y: Math.floor(k / COLS) });
      return cells.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy;
      const ch = tileAt(map, nx, ny);
      if (!ch || !isPathTile(ch) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(c.x, c.y));
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

// Compress a cell list to corner waypoints at tile centers, and add an
// entry point just off the board edge so bugs walk in from outside.
function cellsToRoute(cells) {
  const pts = [];
  const first = cells[0];
  const out = { x: first.x, y: first.y };
  if (first.x === 0) out.x = -1; else if (first.x === COLS - 1) out.x = COLS;
  else if (first.y === 0) out.y = -1; else if (first.y === ROWS - 1) out.y = ROWS;
  pts.push({ x: out.x + 0.5, y: out.y + 0.5 });
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i - 1] || out, b = cells[i], c = cells[i + 1];
    if (!c || (b.x - a.x) !== (c.x - b.x) || (b.y - a.y) !== (c.y - b.y)) pts.push({ x: b.x + 0.5, y: b.y + 0.5 });
  }
  return makeRoute(pts);
}

export function makeRoute(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return { points, cum, length: cum[cum.length - 1] };
}

// Position and heading along a route at distance d.
export function routePos(route, d) {
  const { points, cum } = route;
  if (d <= 0) {
    const a = points[0], b = points[1];
    return { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const a = points[i - 1], b = points[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = Math.min(1, (d - cum[i - 1]) / seg);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

const cache = new Map();

// Everything the simulation and renderer need about a map, computed once.
export function mapInfo(index) {
  if (cache.has(index)) return cache.get(index);
  const map = MAPS[index];
  const goal = findTiles(map, 'G')[0];
  const spawns = [...findTiles(map, 'A'), ...findTiles(map, 'B')];
  const cellPaths = spawns.map((s) => tracePath(map, s, goal));
  const routes = cellPaths.map((cells) => cellsToRoute(cells));
  // Flyers ignore the path's corners: they cut straight between points a
  // third of the way along it, so they cross the garden much faster.
  const flyRoutes = routes.map((r) => makeRoute([0, 1 / 3, 2 / 3, 1].map((f) => {
    const p = routePos(r, r.length * f);
    return { x: p.x, y: p.y };
  })));
  const buildable = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isBuildableTile(map.layout[y][x])) buildable.push({ x, y });
  const info = { index, map, goal, spawns, cellPaths, routes, flyRoutes, buildable };
  cache.set(index, info);
  return info;
}

export function areaOf(index) {
  return AREAS.find((a) => a.id === MAPS[index].area);
}
