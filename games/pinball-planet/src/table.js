// The "Pinball Planet" table: geometry, switches and insert positions.
// DOM-free data so tests can check the outline and the renderer can draw it.
//
// Layout (640 x 1100 table units, +y towards the player):
//   - a round top arc, the plunger lane on the right with a one-way gate,
//   - left and right orbit lanes, three U-F-O rollover lanes and three pop
//     bumpers at the top,
//   - the spinner lane (left), the Black Hole (centre) behind a bank of three
//     asteroid drop targets, and the Comet Ramp (right, an upper layer that
//     returns to the right inlane),
//   - slingshots, inlanes and outlanes (left outlane kickback) and the
//     flippers at the bottom.

export const TABLE = { w: 640, h: 1100, cx: 302 };
const CX2 = 604; // mirror line x' = 604 - x
const mx = (x) => CX2 - x;
const PI = Math.PI;

export const FLIPPERS = [
  { side: 'left', x: 202, y: 960 },
  { side: 'right', x: mx(202), y: 960 },
];

export const PLUNGER = { x: 602, restY: 1062, travel: 30, laneX0: 587, laneX1: 617, topY: 360 };
export const HOLE = { x: 302, y: 470, well: 48, capture: 11 };
export const SHOOTER_GATE_Y = 338;
export const INLANE_POST_Y = 730;
export const ORBIT_GATE = { y0: 440, ax: 22, ay: 468, bx: 80, by: 510 };

export function orbitGates() {
  const g = ORBIT_GATE;
  const dx = g.bx - g.ax, dy = g.by - g.ay, l = Math.hypot(dx, dy);
  return [
    { side: 'left', ax: g.ax, ay: g.ay, bx: g.bx, by: g.by, oneWay: { nx: dy / l, ny: -dx / l } },
    { side: 'right', ax: mx(g.ax), ay: g.ay, bx: mx(g.bx), by: g.by, oneWay: { nx: -dy / l, ny: -dx / l } },
  ];
}

const MAT = {
  wall: { e: 0.4, mu: 0.02, r: 3 },
  guide: { e: 0.45, mu: 0.02, r: 4 },
  rubber: { e: 0.72, mu: 0.04, r: 6 },
  post: { e: 0.7, mu: 0.04, r: 7 },
  bumper: { e: 0.5, mu: 0.02, r: 24 },
  target: { e: 0.45, mu: 0.03, r: 5 },
  ramp: { e: 0.3, mu: 0.01, r: 3 },
};

function seg(ax, ay, bx, by, kind = 'wall', o = {}) {
  const m = MAT[o.mat || kind] || MAT.wall;
  return { shape: 'seg', ax, ay, bx, by, kind, layer: 0, enabled: true, e: m.e, mu: m.mu, r: m.r, ...o };
}
function arc(x, y, R, a0, a1, kind = 'wall', o = {}) {
  const m = MAT[o.mat || kind] || MAT.wall;
  return { shape: 'arc', x, y, R, a0, a1, kind, layer: 0, enabled: true, e: m.e, mu: m.mu, r: m.r, ...o };
}
function circle(x, y, kind = 'post', o = {}) {
  const m = MAT[o.mat || kind] || MAT.post;
  return { shape: 'circle', x, y, kind, layer: 0, enabled: true, e: m.e, mu: m.mu, r: m.r, ...o };
}
function poly(points, kind, o) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) out.push(seg(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], kind, o));
  return out;
}

// Pieces of the outer outline in order; the only opening is the drain along
// the bottom edge between the left wall and the plunger-lane wall.
export const OUTLINE = [
  { shape: 'poly', points: [[20, 1100], [20, 730], [54, 690], [54, 640], [20, 560], [20, 330]] },
  { shape: 'arc', x: 320, y: 330, R: 300, a0: PI, a1: 2 * PI },
  { shape: 'poly', points: [[620, 330], [620, 1090], [584, 1090], [584, 342]] },
];
export const DRAIN = { y: 1100, x0: 20, x1: 584 };

export const SLINGS = [
  { side: 'left', a: [112, 760], b: [112, 846], c: [176, 880] },
  { side: 'right', a: [mx(112), 760], b: [mx(112), 846], c: [mx(176), 880] },
];

// The Comet Ramp's centreline, for drawing: up the left leg, round the
// U-turn, down to the right inlane.
export const RAMP = {
  entryY: 600, flareY: 560, exitY: 660, mouth: [410, 470], upX: 440, downX: 517, turnY: 390,
  outer: { x: 477, R: 57 }, inner: { x: 480, R: 20 },
  walls: { upOuter: 420, upInner: 460, downInner: 500, downOuter: 534 },
};

export const LANES = [277.5, 332.5, 387.5]; // U F O rollovers
export const LANE_GUIDES = [250, 305, 360, 415];
export const LANE_Y = [110, 150];
export const BUMPERS = [
  { id: 0, x: 290, y: 230 },
  { id: 1, x: 390, y: 230 },
  { id: 2, x: 340, y: 300 },
];
export const TARGETS = [
  { id: 0, x: 268, y: 600, half: 12 },
  { id: 1, x: 302, y: 600, half: 12 },
  { id: 2, x: 336, y: 600, half: 12 },
];
export const SPINNER = { x: 177, y: 450, half: 23, walls: [150, 204], y0: 400, y1: 500 };

// Shots and the planet each one visits on the Planet Tour.
export const SHOTS = [
  { id: 'leftOrbit', name: 'LEFT ORBIT', arrow: { x: 45, y: 548, a: -PI / 2 } },
  { id: 'spinner', name: 'SPINNER', arrow: { x: 177, y: 540, a: -PI / 2 } },
  { id: 'blackHole', name: 'BLACK HOLE', arrow: { x: 302, y: 548, a: -PI / 2 } },
  { id: 'ramp', name: 'COMET RAMP', arrow: { x: 440, y: 640, a: -PI / 2 } },
  { id: 'rightOrbit', name: 'RIGHT ORBIT', arrow: { x: 559, y: 548, a: -PI / 2 } },
];

export const INSERTS = {
  planets: [
    { x: 196, y: 770 }, { x: 249, y: 750 }, { x: 302, y: 742 }, { x: 355, y: 750 }, { x: 408, y: 770 },
  ],
  bonusX: [{ x: 254, y: 842, n: 2 }, { x: 286, y: 852, n: 3 }, { x: 318, y: 852, n: 4 }, { x: 350, y: 842, n: 5 }],
  shootAgain: { x: 302, y: 1060 },
  ballSave: { x: 302, y: 905 },
  kickback: { x: 43, y: 950 },
  lock: { x: 302, y: 660 },
  extraBall: { x: 302, y: 528 },
  frenzy: { x: 302, y: 690 },
  jackpot: { x: 440, y: 690 },
};

// Switches. Lines report crossings; `layer` limits which balls they see.
export const SENSORS = [
  ...LANES.map((x, i) => ({ id: `lane${i}`, ax: x - 21, ay: 135, bx: x + 21, by: 135, layer: 0 })),
  { id: 'leftOrbit', ax: 24, ay: 410, bx: 66, by: 410, layer: 0 },
  { id: 'rightOrbit', ax: 538, ay: 410, bx: 580, by: 410, layer: 0 },
  { id: 'spinner', ax: SPINNER.x - 22, ay: SPINNER.y, bx: SPINNER.x + 22, by: SPINNER.y, layer: 0 },
  { id: 'leftInlane', ax: 70, ay: 805, bx: 105, by: 805, layer: 0 },
  { id: 'leftOutlane', ax: 24, ay: 880, bx: 62, by: 880, layer: 0 },
  { id: 'rightInlane', ax: mx(105), ay: 805, bx: mx(70), by: 805, layer: 0 },
  { id: 'rightOutlane', ax: mx(62), ay: 880, bx: mx(24), by: 880, layer: 0 },
  { id: 'kickback', ax: 24, ay: 985, bx: 62, by: 985, layer: 0 },
  { id: 'rampEntry', ax: 410, ay: RAMP.entryY, bx: 470, by: RAMP.entryY, layer: -1 },
  { id: 'rampTop', ax: 478, ay: 372, bx: 478, by: 328, layer: 1 },
  { id: 'rampExit', ax: 500, ay: RAMP.exitY, bx: 534, by: RAMP.exitY, layer: 1 },
];

// Fresh colliders for one game (drop targets change state, so each world
// gets its own copy).
export function buildColliders() {
  const c = [];
  // Outline.
  c.push(...poly(OUTLINE[0].points, 'wall'));
  c.push(arc(320, 330, 300, PI, 2 * PI, 'wall'));
  c.push(...poly([[620, 330], [620, 1090], [584, 1090]], 'wall'));
  c.push(seg(584, 1100, 584, 342, 'wall'));
  // One-way shooter gate: open from the lane below, solid from above.
  c.push(seg(588, SHOOTER_GATE_Y, 618, SHOOTER_GATE_Y - 24, 'gate', { mat: 'wall', oneWay: { nx: -0.625, ny: -0.781 } }));
  // Orbit lane guides.
  c.push(seg(70, 340, 70, ORBIT_GATE.y0, 'guide'));
  c.push(seg(mx(70), 340, mx(70), ORBIT_GATE.y0, 'guide'));
  // Bump on the right playfield wall (mirror of the left one).
  c.push(...poly([[584, 560], [mx(54), 640], [mx(54), 690], [584, 730]], 'wall'));
  // One-way diverters at the bottom of each orbit lane: shots pass up
  // through them, balls coming back down are turned towards the middle
  // instead of running down the wall into the outlane.
  for (const g of orbitGates()) c.push(seg(g.ax, g.ay, g.bx, g.by, 'gate', { mat: 'wall', oneWay: g.oneWay }));
  // Top lane guides.
  for (const x of LANE_GUIDES) c.push(seg(x, LANE_Y[0], x, LANE_Y[1], 'guide'));
  // Pop bumpers.
  for (const b of BUMPERS) c.push(circle(b.x, b.y, 'bumper', { id: b.id }));
  // Spinner lane.
  for (const x of SPINNER.walls) c.push(seg(x, SPINNER.y0, x, SPINNER.y1, 'guide'));
  // Black Hole back wall (open at the sides and bottom).
  c.push(arc(HOLE.x, HOLE.y, 40, PI + 0.3, 2 * PI - 0.3, 'guide', { mat: 'guide' }));
  // Asteroid drop targets.
  for (const t of TARGETS) c.push(seg(t.x - t.half, t.y, t.x + t.half, t.y, 'target', { id: t.id }));
  // Ramp mouth posts (playfield level).
  c.push(circle(RAMP.mouth[0], RAMP.entryY + 2, 'post', { r: 5 }));
  c.push(circle(RAMP.mouth[1], RAMP.entryY + 2, 'post', { r: 5 }));
  // Comet Ramp (upper layer).
  const W = RAMP.walls, L1 = { layer: 1, mat: 'ramp' };
  // The mouth flares out so a ball that squeezes between the posts is
  // always inside the channel once it is on the ramp.
  c.push(seg(RAMP.mouth[0], RAMP.entryY, W.upOuter, RAMP.flareY, 'ramp', L1));
  c.push(seg(RAMP.mouth[1], RAMP.entryY, W.upInner, RAMP.flareY, 'ramp', L1));
  c.push(seg(W.upOuter, RAMP.flareY, W.upOuter, RAMP.turnY, 'ramp', L1));
  c.push(seg(W.upInner, RAMP.flareY, W.upInner, RAMP.turnY, 'ramp', L1));
  c.push(arc(RAMP.outer.x, RAMP.turnY, RAMP.outer.R, PI, 2 * PI, 'ramp', L1));
  c.push(arc(RAMP.inner.x, RAMP.turnY, RAMP.inner.R, PI, 2 * PI, 'ramp', L1));
  c.push(seg(W.downOuter, RAMP.turnY, W.downOuter, RAMP.exitY, 'ramp', L1));
  c.push(seg(W.downInner, RAMP.turnY, W.downInner, RAMP.exitY, 'ramp', L1));
  // Slingshots: the kicking face points at the middle of the table.
  for (const s of SLINGS) {
    // Unit normal of the kicking face, pointing into the playfield.
    let kx = s.c[1] - s.a[1], ky = -(s.c[0] - s.a[0]);
    if ((s.side === 'left') !== (kx > 0)) { kx = -kx; ky = -ky; }
    const kl = Math.hypot(kx, ky);
    c.push(seg(s.a[0], s.a[1], s.c[0], s.c[1], 'sling', { mat: 'rubber', side: s.side, kick: { nx: kx / kl, ny: ky / kl } }));
    c.push(seg(s.a[0], s.a[1], s.b[0], s.b[1], 'rubber'));
    c.push(seg(s.b[0], s.b[1], s.c[0], s.c[1], 'rubber'));
    for (const p of [s.a, s.b, s.c]) c.push(circle(p[0], p[1], 'post'));
  }
  // Inlane / outlane guides; the lower end meets the flipper's pivot so a
  // ball rolls smoothly off the inlane onto the flipper.
  for (const sgn of [1, -1]) {
    const X = (x) => (sgn > 0 ? x : mx(x));
    c.push(circle(X(66), INLANE_POST_Y, 'post', { r: 5 }));
    c.push(seg(X(66), INLANE_POST_Y, X(66), 871.1, 'guide'));
    c.push(seg(X(66), 871.1, X(206.5), 952.2, 'guide'));
  }
  // Plunger tip (moved by the world as it is pulled).
  c.push(seg(PLUNGER.laneX0, PLUNGER.restY, PLUNGER.laneX1, PLUNGER.restY, 'plunger', { mat: 'wall', r: 2 }));
  return c;
}

// Ball serving position on the plunger tip.
export const SERVE = { x: PLUNGER.x, y: PLUNGER.restY - 2 - 13 };

export function inShooterLane(b) {
  return b.x > PLUNGER.laneX0 - 2 && b.y > PLUNGER.topY;
}
