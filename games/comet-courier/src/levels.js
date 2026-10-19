// The thirty authored routes.
//
// Every panel is hand-laid as a deliberate route, not a scatter of obstacles:
// the mail letters sit on side trips, so par is the number of launches it takes
// to gather the whole satchel and then sink the star. `line` is the launch
// sequence that does it — angle index (0..15, see `angleAt`) and power index
// into SOLVER.powers — and `par` is simply its length.
//
// `line` came from the breadth-first solver, and `tests/levels.test.js` keeps it
// honest: it replays every line through the real simulation and re-solves every
// panel, so a level can never ship unsolvable, with a par the solver can beat,
// or with a letter nothing can reach.
//
// Compact design form, all in field units (the panel is 540x720):
//   spawn/star [x, y]        walls [x, y, w, h]        rocks [x, y, r]
//   winds [x, y, w, h, ax, ay]  (ax/ay = push, units/s^2)
//   pads [x, y, w, h, nx, ny]   (nx/ny = kick direction)
//   gates [ax, ay, bx, by]      (one portal pair)
//   wells [x, y, r?, g?]        letters [x, y]
import { FIELD, STAR, WELL, SOLVER, LEVELS_PER_WORLD, LEVEL_COUNT } from './config.js';

// The solver's angle grid. Storing lines as indices keeps them exact, which is
// what lets the Daily mirror a route without re-solving it.
export const angleAt = (i) => (i / SOLVER.angles) * Math.PI * 2 - Math.PI;

const DESIGNS = [
  // ---------------------------------------------------------------- world 1
  // Letter Belt: the basics, one at a time — aim and power, a letter off the
  // line, a bank off a wall, then a pocket you have to set up for.
  {
    note: 'Aim and launch. The letter is off the straight line, so fetch it first.',
    spawn: [80, 620], star: [440, 140],
    walls: [[246, 300, 56, 130]],
    letters: [[140, 360]],
    line: [[2, 2], [4, 3]],
  },
  {
    note: 'Power control: the letters are stacked up the middle, the star is not.',
    spawn: [270, 650], star: [460, 120],
    walls: [[0, 360, 196, 24], [344, 360, 196, 24]],
    letters: [[270, 520], [270, 245]],
    line: [[12, 3], [1, 3]],
  },
  {
    note: 'The wall kills the straight shot: bank the comet off the sky instead.',
    spawn: [80, 630], star: [80, 130],
    walls: [[0, 318, 212, 24]],
    letters: [[440, 440]],
    line: [[13, 1], [7, 3]],
  },
  {
    note: 'Two alcoves, one pocket. Collect across the top, then drop in.',
    spawn: [270, 660], star: [270, 420],
    walls: [[210, 476, 120, 22], [188, 356, 22, 142], [330, 356, 22, 142], [188, 356, 54, 22], [298, 356, 54, 22], [0, 230, 170, 22], [370, 230, 170, 22]],
    letters: [[82, 150], [458, 150]],
    line: [[2, 1], [1, 3], [13, 3]],
  },
  {
    note: 'A rock in the road. Bounce off it, or go around it.',
    spawn: [70, 650], star: [470, 110],
    rocks: [[270, 400, 46]],
    walls: [[0, 236, 150, 22], [390, 236, 150, 22]],
    letters: [[270, 640], [70, 150]],
    line: [[15, 3], [7, 3], [0, 3]],
  },
  {
    note: 'The pocket opens away from you: place the comet, then ease it in.',
    spawn: [90, 110], star: [420, 580],
    walls: [[360, 520, 120, 22], [338, 520, 22, 124], [480, 520, 22, 124], [338, 642, 70, 22], [448, 642, 54, 22]],
    letters: [[96, 610], [450, 120]],
    line: [[8, 0], [14, 2], [11, 3]],
  },
  // ---------------------------------------------------------------- world 2
  // Asteroid Post: round bouncers. A rock gives back more than a wall, so the
  // carom becomes the tool.
  {
    note: 'One big rock in the middle; a letter sits behind each shoulder.',
    spawn: [270, 660], star: [270, 70],
    rocks: [[270, 380, 60]],
    letters: [[70, 330], [470, 330]],
    line: [[2, 0], [6, 3], [3, 3]],
  },
  {
    note: 'A gate of rocks, and a letter on each side of the divider.',
    spawn: [80, 640], star: [460, 100],
    rocks: [[180, 300, 40], [380, 300, 40]],
    walls: [[258, 450, 24, 212]],
    letters: [[470, 650], [80, 150]],
    line: [[4, 3], [9, 3], [1, 3]],
  },
  {
    note: 'The tucked letter is a carom: hit the rock on its far cheek.',
    spawn: [100, 120], star: [100, 560],
    walls: [[200, 340, 24, 380], [0, 340, 86, 24]],
    rocks: [[380, 240, 52]],
    letters: [[460, 500], [330, 100]],
    line: [[6, 2], [10, 1], [15, 3]],
  },
  {
    note: 'Pinball alley. Three rocks, two letters, one pocket at the top.',
    spawn: [270, 670], star: [270, 110],
    rocks: [[140, 480, 36], [400, 480, 36], [270, 320, 42]],
    walls: [[0, 200, 190, 22], [350, 200, 190, 22]],
    letters: [[66, 600], [474, 600]],
    line: [[7, 3], [15, 2], [0, 3]],
  },
  {
    note: 'The sorting shelves. Each slot takes its own trip in from the right.',
    spawn: [470, 660], star: [470, 90],
    walls: [[0, 180, 300, 22], [0, 340, 300, 22], [0, 500, 300, 22]],
    rocks: [[400, 300, 44], [390, 560, 40]],
    letters: [[80, 110], [80, 270], [80, 430]],
    line: [[6, 2], [10, 3], [15, 3], [1, 3]],
  },
  {
    note: 'Three bays off one corridor. One letter in each, so one trip each.',
    spawn: [70, 650], star: [270, 650],
    walls: [[150, 0, 24, 300], [366, 0, 24, 300]],
    rocks: [[90, 470, 36], [450, 470, 36]],
    letters: [[72, 110], [270, 110], [462, 110]],
    line: [[5, 2], [2, 3], [6, 3], [5, 3]],
  },
  // ---------------------------------------------------------------- world 3
  // Wind Alley: a constant push inside the band. Cross it fast and it barely
  // bends you; drift in slowly and it carries you.
  {
    note: 'One band across the middle. Let it carry you to the far letter.',
    spawn: [80, 650], star: [460, 110],
    winds: [[0, 330, 540, 150, 420, 0]],
    letters: [[120, 400], [450, 400]],
    line: [[1, 3], [12, 3], [9, 3]],
  },
  {
    note: 'Two bands push against each other. Pick your lane.',
    spawn: [270, 670], star: [270, 80],
    winds: [[0, 260, 250, 200, 0, -400], [290, 260, 250, 200, 0, 400]],
    walls: [[250, 200, 40, 320]],
    letters: [[70, 170], [470, 580]],
    line: [[10, 1], [3, 3], [4, 3]],
  },
  {
    note: 'A windy corridor with a pocket at the end of it.',
    spawn: [80, 100], star: [450, 620],
    walls: [[0, 240, 380, 24], [160, 460, 380, 24], [386, 540, 24, 180]],
    winds: [[0, 264, 540, 196, 440, 0]],
    letters: [[470, 130], [90, 390]],
    line: [[1, 3], [1, 3], [10, 3]],
  },
  {
    note: 'Up the chimney: the draught does the lifting, once you are in it.',
    spawn: [270, 660], star: [270, 80],
    walls: [[180, 0, 24, 420], [336, 0, 24, 420]],
    winds: [[204, 0, 132, 420, 0, -520]],
    letters: [[80, 200], [470, 200]],
    line: [[2, 2], [14, 2], [1, 3], [11, 2]],
  },
  {
    note: 'An updraught down the left, and three slots that only open to it.',
    spawn: [80, 660], star: [80, 90],
    walls: [[240, 180, 300, 22], [240, 340, 300, 22], [240, 500, 300, 22]],
    winds: [[0, 120, 230, 560, 0, -320]],
    rocks: [[160, 620, 36]],
    letters: [[460, 110], [460, 270], [460, 430]],
    line: [[1, 3], [9, 0], [15, 3], [0, 3]],
  },
  {
    note: 'The weather gate: two bays below, and a crosswind over the top.',
    spawn: [270, 660], star: [270, 90],
    walls: [[150, 420, 24, 300], [366, 420, 24, 300]],
    winds: [[0, 190, 540, 140, 440, 0]],
    letters: [[72, 660], [462, 660], [70, 120]],
    line: [[6, 2], [12, 3], [12, 3], [2, 3]],
  },
  // ---------------------------------------------------------------- world 4
  // Spring Steps: a pad adds speed in its own direction, so it turns a dying
  // comet into a fresh one.
  {
    note: 'A pad kicks you up the panel. Arrive slowly, leave fast.',
    spawn: [270, 660], star: [270, 90],
    pads: [[230, 380, 80, 70, 0, -1]],
    walls: [[150, 520, 24, 200], [366, 520, 24, 200], [0, 250, 180, 22], [360, 250, 180, 22]],
    letters: [[72, 660], [462, 660]],
    line: [[6, 2], [5, 3], [1, 3]],
  },
  {
    note: 'Two pads make a staircase. Step up, step across.',
    spawn: [70, 660], star: [470, 110],
    pads: [[120, 480, 90, 80, 1, 0], [330, 300, 90, 80, 0, -1]],
    walls: [[250, 440, 24, 200], [250, 170, 24, 150], [0, 266, 212, 22]],
    letters: [[80, 150], [470, 450]],
    line: [[2, 3], [2, 2], [7, 3]],
  },
  {
    note: 'Walls, a pad, and a letter in every quarter you would rather skip.',
    spawn: [270, 670], star: [80, 120],
    walls: [[0, 520, 200, 24], [340, 520, 200, 24], [0, 300, 380, 24], [250, 90, 24, 190]],
    pads: [[240, 560, 90, 80, 0, -1]],
    letters: [[470, 300], [470, 660], [110, 420]],
    line: [[9, 2], [7, 0], [1, 3]],
  },
  {
    note: 'A zig-zag of three floors. A pad on each, and a letter on each.',
    spawn: [80, 660], star: [460, 110],
    walls: [[0, 250, 340, 22], [200, 460, 340, 22]],
    pads: [[60, 560, 80, 70, 1, 0], [220, 350, 80, 70, 1, 0]],
    winds: [[0, 60, 540, 150, 380, 0]],
    letters: [[470, 620], [80, 370], [270, 130]],
    line: [[6, 2], [1, 3], [3, 3]],
  },
  {
    note: 'Pads and rocks together: the carom and the kick in one route.',
    spawn: [70, 110], star: [470, 660],
    pads: [[200, 140, 80, 80, 0, 1], [380, 420, 80, 80, -1, 0]],
    rocks: [[150, 420, 48], [340, 600, 42]],
    walls: [[250, 500, 24, 220]],
    letters: [[470, 110], [90, 660], [120, 300]],
    line: [[7, 0], [15, 3], [10, 3]],
  },
  {
    note: 'A chain of kicks that ends at the pocket mouth.',
    spawn: [80, 660], star: [270, 220],
    walls: [[210, 276, 120, 22], [188, 156, 22, 142], [330, 156, 22, 142], [188, 156, 50, 22], [298, 156, 54, 22], [250, 500, 24, 220], [0, 390, 170, 22]],
    pads: [[60, 480, 80, 80, 0, -1], [420, 360, 80, 80, -1, 0]],
    letters: [[80, 300], [470, 660], [470, 300]],
    line: [[7, 3], [0, 3], [10, 3], [6, 3]],
  },
  // ---------------------------------------------------------------- world 5
  // Gravity Gate: wells bend the comet as it passes, portals move it outright.
  {
    note: 'A gravity well pulls as you pass. Curve around the wall with it.',
    spawn: [80, 650], star: [460, 120],
    wells: [[270, 400]],
    walls: [[250, 540, 24, 180], [250, 90, 24, 180]],
    letters: [[90, 330], [460, 480]],
    line: [[10, 3], [11, 3], [6, 3]],
  },
  {
    note: 'Two wells, a slalom. Let each one hand you to the next.',
    spawn: [270, 670], star: [270, 70],
    wells: [[140, 250, 100], [400, 250, 100]],
    walls: [[150, 500, 24, 220], [366, 500, 24, 220], [0, 390, 170, 22], [370, 390, 170, 22]],
    letters: [[72, 660], [462, 660]],
    line: [[3, 3], [7, 2], [6, 3], [3, 3]],
  },
  {
    note: 'Portals. Fall in one mouth and come out the other, still moving.',
    spawn: [70, 430], star: [460, 300],
    walls: [[258, 120, 24, 440], [0, 300, 170, 22]],
    gates: [[150, 630, 470, 150]],
    letters: [[80, 160], [160, 660], [470, 630]],
    line: [[7, 1], [7, 3], [11, 3]],
  },
  {
    note: 'A portal and a rock field, and a pocket that opens the wrong way.',
    spawn: [270, 670], star: [114, 360],
    gates: [[462, 640, 470, 110]],
    rocks: [[300, 380, 46], [270, 180, 40]],
    walls: [[48, 296, 50, 22], [158, 296, 44, 22], [48, 416, 154, 22], [26, 296, 22, 142], [180, 296, 22, 142], [150, 520, 24, 200], [366, 520, 24, 200]],
    letters: [[72, 660], [462, 660], [470, 360]],
    line: [[3, 3], [6, 2], [13, 2], [15, 2]],
  },
  {
    note: 'Wells and portals at once. Plan the whole round trip.',
    spawn: [80, 120], star: [270, 650],
    wells: [[150, 400], [400, 300]],
    gates: [[470, 650, 80, 650]],
    walls: [[210, 580, 120, 22], [188, 580, 22, 120], [330, 580, 22, 120]],
    letters: [[470, 120], [270, 360], [90, 650]],
    line: [[12, 3], [10, 2], [9, 0], [14, 3]],
  },
  {
    note: 'The last round: a well, a gate, a pad and three letters.',
    spawn: [270, 60], star: [270, 400],
    wells: [[270, 190, 100]],
    gates: [[80, 620, 470, 620]],
    pads: [[220, 540, 100, 70, 0, -1]],
    walls: [[180, 340, 180, 22], [180, 340, 22, 120], [338, 340, 22, 120], [180, 438, 50, 22], [290, 438, 70, 22], [0, 250, 150, 22], [390, 250, 150, 22]],
    letters: [[75, 160], [465, 160], [270, 680]],
    line: [[9, 2], [15, 3], [9, 3], [10, 3]],
  },
];

// Expand a design into the plain level object the simulation reads.
function expand(d, index) {
  return {
    index,
    world: Math.floor(index / LEVELS_PER_WORLD),
    name: levelLabel(index),
    note: d.note,
    spawn: { x: d.spawn[0], y: d.spawn[1] },
    star: { x: d.star[0], y: d.star[1] },
    blocks: (d.walls || []).map(([x, y, w, h]) => ({ x, y, w, h })),
    asteroids: (d.rocks || []).map(([x, y, r]) => ({ x, y, r })),
    winds: (d.winds || []).map(([x, y, w, h, vx, vy]) => ({ x, y, w, h, vx, vy })),
    springs: (d.pads || []).map(([x, y, w, h, nx, ny]) => ({ x, y, w, h, nx, ny })),
    portals: (d.gates || []).map(([ax, ay, bx, by]) => ({ ax, ay, bx, by })),
    wells: (d.wells || []).map(([x, y, r = WELL.r, g = WELL.pull]) => ({ x, y, r, g })),
    letters: (d.letters || []).map(([x, y]) => ({ x, y })),
    // Each act keeps its grid indices so the Daily can mirror the line exactly.
    line: (d.line || []).map(([ai, pi]) => ({ ai, pi, angle: angleAt(ai), power: SOLVER.powers[pi] })),
    par: (d.line || []).length,
  };
}

export function buildLevel(index) {
  return expand(DESIGNS[index], index);
}

// Mirror a whole panel. Both flips are exact: the simulation is symmetric, the
// solver's angle grid maps onto itself, and so the mirrored line solves the
// mirrored panel in the same number of launches. The Daily uses this to show a
// known-good route from an unfamiliar side.
export function mirrorLevel(level, flipX, flipY) {
  const mx = (x) => (flipX ? FIELD.w - x : x);
  const my = (y) => (flipY ? FIELD.h - y : y);
  const pt = ({ x, y }) => ({ x: mx(x), y: my(y) });
  // Angle indices: a horizontal flip sends angle a to (8 - a), a vertical flip
  // to (16 - a), both modulo the grid.
  const ai = (a) => {
    let v = a;
    if (flipX) v = SOLVER.angles / 2 - v;
    if (flipY) v = -v;
    return ((v % SOLVER.angles) + SOLVER.angles) % SOLVER.angles;
  };
  return {
    ...level,
    spawn: pt(level.spawn),
    star: pt(level.star),
    blocks: level.blocks.map((b) => ({ x: flipX ? FIELD.w - b.x - b.w : b.x, y: flipY ? FIELD.h - b.y - b.h : b.y, w: b.w, h: b.h })),
    asteroids: level.asteroids.map((a) => ({ ...a, x: mx(a.x), y: my(a.y) })),
    winds: level.winds.map((w) => ({ x: flipX ? FIELD.w - w.x - w.w : w.x, y: flipY ? FIELD.h - w.y - w.h : w.y, w: w.w, h: w.h, vx: flipX ? -w.vx : w.vx, vy: flipY ? -w.vy : w.vy })),
    springs: level.springs.map((s) => ({ x: flipX ? FIELD.w - s.x - s.w : s.x, y: flipY ? FIELD.h - s.y - s.h : s.y, w: s.w, h: s.h, nx: flipX ? -s.nx : s.nx, ny: flipY ? -s.ny : s.ny })),
    portals: level.portals.map((p) => ({ ax: mx(p.ax), ay: my(p.ay), bx: mx(p.bx), by: my(p.by) })),
    wells: level.wells.map((w) => ({ ...w, x: mx(w.x), y: my(w.y) })),
    letters: level.letters.map(pt),
    line: level.line.map((a) => ({ ai: ai(a.ai), pi: a.pi, angle: angleAt(ai(a.ai)), power: a.power })),
  };
}

export { LEVEL_COUNT, LEVELS_PER_WORLD } from './config.js';

export const worldOf = (index) => Math.floor(index / LEVELS_PER_WORLD);
export const levelLabel = (index) => `${worldOf(index) + 1}-${(index % LEVELS_PER_WORLD) + 1}`;
export const isUnlocked = (save, index) => index <= save.unlocked;
export const starOf = (level) => level.star;

export const LEVELS = Array.from({ length: LEVEL_COUNT }, (_, i) => buildLevel(i));

// Does anything solid sit on this spot? Used by the level tests to prove no
// letter, star or spawn is buried where the comet can never reach it.
export function spotBlocked(level, x, y, pad = 0) {
  if (x < pad || y < pad || x > FIELD.w - pad || y > FIELD.h - pad) return true;
  for (const b of level.blocks) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  }
  for (const a of level.asteroids) {
    if (Math.hypot(x - a.x, y - a.y) < a.r + pad) return true;
  }
  return false;
}

export { STAR };
