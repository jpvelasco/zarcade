// Six stages, built from one-screen "rooms" (20 × 15 tiles, like the screens
// of a 2600 jungle game) that are written as ASCII so they can be read,
// diffed and checked as data.
//
// Terrain:  '#' ground   '=' brick/stone   '-' one-way ledge   'H' ladder
//           '~' water (acid on the alien base)   'L' lava   '^' spikes
//           'Q' quicksand   'T' tar pit
// Markers:  'P' start   'K' checkpoint   'Z' boss arena (left edge of its room)
//           'v' vine anchor   'c' croc head in the water   'R' log roller
//           'm' drifting raft (3 tiles; rafts share their gap)
//           'f' crumbling platform
// Enemies:  'g' raider   'k' sniper   'j' jumper   'b' flyer   's' scorpion
//           't' turret   'p' leaper (jumps out of water or lava)
// Pickups:  '$' gold bar   '%' diamond ring   '*' jade idol
//           '1' Spread  '2' Laser  '3' Rapid  '4' Flame  '5' bomb  '6' heart
//
// Rows 0-9 are above ground, the surface is the top of row 10 (y = 160),
// rows 12-13 are the tunnel and row 14 is bedrock.

import { TILE } from './tiles.js';

export const ROOM_W = 20;
export const ROOM_H = 15;
export const SURFACE_Y = 10 * TILE;
export const VINE_LEN = 72;

const G = '####################';
const B = '====================';
const E = '                    ';
const CLOSED = [G, G, '=                  =', '=                  =', G];
const OPEN = [G, G, E, E, G];
const SOLID = [G, G, G, G, G];
const BRICKS = [B, B, B, B, B];

function room(top, bottom = CLOSED) {
  if (top.length > 10) throw new Error(`room has ${top.length} upper rows`);
  for (const row of top) if (row.length > ROOM_W) throw new Error(`room row too long: "${row}"`);
  for (const row of bottom) if (row.length !== ROOM_W) throw new Error(`room ground row must be ${ROOM_W} wide: "${row}"`);
  return [...Array(10 - top.length).fill(E), ...top.map((row) => row.padEnd(ROOM_W, ' ')), ...bottom];
}

// Bottom halves with gaps in them (water by default; stages swap the fluid).
const pit = (row10, row11 = G) => [row10, row11, '=                  =', '=                  =', G];

export const ROOMS = {
  start: room(['  P                 ']),
  walk: room([
    '            $       ',
    '          -----     ',
    '                    ',
    '      g          g  ',
  ]),
  pit: room([
    '         b          ',
    '                    ',
    '                    ',
    '                    ',
  ], pit('########~~~#########')),
  vine: room([
    '         v          ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ], pit('######~~~~~~~#######')),
  logs: room(['                   R'], [
    '#####H#########H####',
    '#####H#########H####',
    '=    H         H   =',
    '=    H  s  %   H   =',
    G,
  ]),
  camp: room([
    '     b              ',
    '                    ',
    '                    ',
    '                    ',
    '    K          g    ',
  ]),
  sand: room([
    '        1           ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ], pit('#######QQQQ#########')),
  crocs: room([
    '                    ',
    '                    ',
    '                    ',
  ], pit('######~c~~c~~c~#####')),
  branches: room([
    '              *     ',
    '            ------  ',
    '                    ',
    '                    ',
    '      -----         ',
    '                    ',
    '   j                ',
  ]),
  outpost: room([
    '           k        ',
    '          ====      ',
    '                    ',
    '  g             g   ',
  ]),
  vines: room([
    '      v      v      ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ], pit('###~~~~~~~~~~~~~~###')),
  gate: room([
    '     6        5     ',
    '                    ',
    '                    ',
    '                    ',
    '  K                 ',
  ]),
  arena: room([
    '                    ',
    '  ---          ---  ',
    '                    ',
    'Z                   ',
  ], SOLID),

  // River
  raft: room([
    '        b           ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ], pit('####~~~~~m~~~~~~####')),
  piranhas: room([
    '                    ',
    '                    ',
    '                    ',
  ], pit('####~p~##~p~##~p~###')),
  bank: room([
    '               t    ',
    '              ===   ',
    '                    ',
    '   j       j        ',
  ], OPEN),
  dock: room([
    '         $          ',
    '                    ',
    '    ---       ---   ',
    '                    ',
    '                    ',
  ], pit('###~~~###~~~##~~~###')),
  ford: room([
    '      2             ',
    '                    ',
    '                    ',
    '                    ',
    '  g                 ',
  ], pit('########~c~~c~######')),
  rapids: room([
    '                b   ',
    '                    ',
    '                    ',
    '                    ',
  ], pit('##~~~~~m~~~~~~m~~~##')),
  cove: room(['                   R'], [
    '###H############H###',
    '###H############H###',
    '=  H     *      H  =',
    '=  H    s    s  H  =',
    G,
  ]),

  // Caves
  cavein: room([
    G,
    '####    ####    ####',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '  P                 ',
  ]),
  cavern: room([
    G,
    '###      ##     ####',
    '                    ',
    '       b      b     ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '    s        s      ',
  ]),
  tarpits: room([
    G,
    '####   ######   ####',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '          4         ',
    '                    ',
    '                    ',
    '                    ',
  ], pit('####TTT#####TTTT####')),
  chasm: room([
    G,
    '####           #####',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ], [
    '####         #######',
    '####         #######',
    '####     m   #######',
    '####         #######',
    '####         #######',
  ]),
  mine: room([
    G,
    '########    ########',
    '                    ',
    '                    ',
    '            ----    ',
    '                    ',
    '                    ',
    '      ----          ',
    '                    ',
    '  K             j   ',
  ], [
    '#######H############',
    '#######H############',
    '=      H    $      =',
    '=      H  s        =',
    G,
  ]),
  crystals: room([
    G,
    '####  ##########  ##',
    '                    ',
    '                    ',
    '           t        ',
    '          ===       ',
    '                    ',
    '                    ',
    '                    ',
    '  g            g    ',
  ]),
  drop: room([
    G,
    '#####          #####',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '        %           ',
    '    -----           ',
    '                    ',
    '                    ',
  ], pit('########^^^#########')),

  // Temple
  steps: room([
    '                    ',
    '                    ',
    '              =====',
    '         =====     ',
    '    =====          ',
    '  g               g',
  ], BRICKS),
  spikes: room([
    '          b         ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ], ['=====^^^^m^^^^======', B, B, B, B]),
  halls: room([
    '====================',
    '====      ====   ===',
    '                    ',
    '                    ',
    '                    ',
    '      k         $   ',
    '     ===       ===  ',
    '                    ',
    '  K            g    ',
  ], BRICKS),
  shrine: room([
    '         b          ',
    '   *                ',
    '  ====         t    ',
    '              ===   ',
    '      -----         ',
    '        3           ',
    '                    ',
  ], [
    '=========H==========',
    '=========H==========',
    '=        H    %    =',
    '=        H   s     =',
    B,
  ]),
  idolvine: room([
    '      v      v      ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ], ['===^^^^^^^^^^^^^^===', B, B, B, B]),

  // Volcano
  embers: room([
    '         b          ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ], pit('#######~p~##########')),
  crumble: room([
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ], pit('#####~f~f~f~f~######')),
  magma: room([
    '                    ',
    '                    ',
    '                    ',
    '    g               ',
  ], pit('#########~c~~c~~c~~#')),
  ridge: room([
    '            $       ',
    '          -----     ',
    '                    ',
    '    t          j    ',
  ]),
  ashfall: room([
    '        b      b    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ], pit('###QQQ####~~~#######')),

  // Alien base
  dockbay: room([
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '  P                 ',
  ], BRICKS),
  corridor: room([
    '====================',
    '                    ',
    '                    ',
    '     b         b    ',
    '                    ',
    '                    ',
    '                    ',
    '          k         ',
    '  g      ===        ',
  ], BRICKS),
  reactor: room([
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ], ['====~~~~~m~~~~~~====', B, B, B, B]),
  turrets: room([
    '                    ',
    '        t      t    ',
    '       ===    ===   ',
    '                    ',
    '                    ',
    '                    ',
    '  g                 ',
  ], BRICKS),
  lifts: room([
    '       b            ',
    '              $     ',
    '             ===    ',
    '                    ',
    '                    ',
  ], ['===^^^^^m^^^^^======', B, B, B, B]),
  hangar: room([
    '                    ',
    '      4       6     ',
    '                    ',
    '                    ',
    '                    ',
    '  K       g      g  ',
  ], BRICKS),
  arenaMetal: room([
    '                    ',
    '  ---          ---  ',
    '                    ',
    'Z                   ',
  ], BRICKS),
};

export const STAGES = [
  {
    id: 'jungle',
    name: 'Jungle',
    title: 'Into the Jungle',
    hint: 'Swing on vines, hop the crocs, find the treasure!',
    boss: 'gorilla',
    rooms: ['start', 'walk', 'pit', 'vine', 'logs', 'camp', 'sand', 'crocs', 'branches', 'outpost', 'vines', 'gate', 'arena'],
  },
  {
    id: 'river',
    name: 'River',
    title: 'Crocodile River',
    hint: 'Ride the rafts. Piranhas jump when you least expect!',
    boss: 'croc',
    rooms: ['start', 'raft', 'bank', 'piranhas', 'ford', 'camp', 'dock', 'cove', 'rapids', 'crocs', 'bank', 'gate', 'arena'],
  },
  {
    id: 'caves',
    name: 'Caves',
    title: 'Echo Caves',
    hint: 'Mind the tar. Bats live in the dark!',
    boss: 'mole',
    subs: { '~': 'T' },
    rooms: ['cavein', 'cavern', 'tarpits', 'chasm', 'mine', 'crystals', 'drop', 'cavern', 'tarpits', 'crystals', 'gate', 'arena'],
  },
  {
    id: 'temple',
    name: 'Temple',
    title: 'Temple of the Idol',
    hint: 'Ride the stone lift over the spikes!',
    boss: 'idol',
    rooms: ['start', 'steps', 'spikes', 'halls', 'shrine', 'idolvine', 'steps', 'spikes', 'halls', 'gate', 'arena'],
  },
  {
    id: 'volcano',
    name: 'Volcano',
    title: 'Mount Kaboom',
    hint: 'Crumbling rocks over lava. Keep moving!',
    boss: 'wyrm',
    subs: { '~': 'L', Q: 'T' },
    rooms: ['start', 'embers', 'ridge', 'crumble', 'magma', 'camp', 'ashfall', 'vine', 'ridge', 'crumble', 'gate', 'arena'],
  },
  {
    id: 'alien',
    name: 'Alien Base',
    title: 'The Alien Base',
    hint: 'They came from the stars. Send them home!',
    boss: 'mothership',
    rooms: ['dockbay', 'corridor', 'reactor', 'turrets', 'lifts', 'hangar', 'corridor', 'reactor', 'turrets', 'lifts', 'gate', 'arenaMetal'],
  },
];

const ENEMY_KINDS = { g: 'raider', k: 'sniper', j: 'jumper', b: 'flyer', s: 'scorpion', t: 'turret', p: 'leaper' };
const ITEM_KINDS = { $: 'gold', '%': 'ring', '*': 'idol', 1: 'spread', 2: 'laser', 3: 'rapid', 4: 'flame', 5: 'bomb', 6: 'heart' };
export const TREASURE_VALUE = { gold: 2000, ring: 4000, idol: 6000 };
export const TREASURES = new Set(Object.keys(TREASURE_VALUE));

/** Build a stage's tile grid and entity lists from its rooms. */
export function buildStage(index) {
  const stage = STAGES[index];
  if (!stage) throw new Error(`no stage ${index}`);
  const subs = stage.subs || {};
  const rows = Array.from({ length: ROOM_H }, () => []);
  for (const name of stage.rooms) {
    const grid = ROOMS[name];
    if (!grid) throw new Error(`unknown room ${name}`);
    for (let r = 0; r < ROOM_H; r += 1) rows[r].push(grid[r]);
  }
  const lines = rows.map((parts) => parts.join('').split('').map((ch) => subs[ch] || ch));
  const cols = lines[0].length;
  const out = {
    index,
    id: stage.id,
    name: stage.name,
    title: stage.title,
    hint: stage.hint,
    boss: stage.boss,
    cols,
    rows: ROOM_H,
    width: cols * TILE,
    height: ROOM_H * TILE,
    start: null,
    checkpoints: [],
    enemies: [],
    items: [],
    vines: [],
    movers: [],
    crocs: [],
    rollers: [],
    arena: null,
  };
  const FLUIDS = new Set(['~', 'L', 'T', '^']);
  const fluidBelow = (c, r) => {
    for (const [cc, rr] of [[c - 1, r], [c + 1, r], [c, r + 1], [c, r - 1]]) {
      const t = lines[rr]?.[cc];
      if (FLUIDS.has(t)) return t;
    }
    return ' ';
  };
  const solidAt = (c, r) => lines[r][c] === '#' || lines[r][c] === '=';
  for (let r = 0; r < ROOM_H; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const ch = lines[r][c];
      const x = c * TILE + TILE / 2;
      const feet = (r + 1) * TILE;
      let clear = true;
      if (ch === 'P') out.start = { x, y: feet };
      else if (ch === 'K') out.checkpoints.push({ x, y: feet, col: c });
      else if (ch === 'Z') out.arena = { x0: c * TILE, x1: c * TILE + ROOM_W * TILE, floor: feet };
      else if (ch === 'v') out.vines.push({ ax: x, ay: r * TILE, len: VINE_LEN, phase: out.vines.length * 2.1 });
      else if (ch === 'c') { out.crocs.push({ x, y: r * TILE, phase: out.crocs.length * 0.9 }); lines[r][c] = subs['~'] || '~'; clear = false; }
      else if (ch === 'R') out.rollers.push({ x, y: feet });
      else if (ch === 'm') { out.movers.push({ kind: 'raft', col: c, row: r, x: x - 24, y: r * TILE - 3, w: 48, h: 7, ax: 0, ay: 0, period: 4.6, phase: out.movers.length * 1.7 }); lines[r][c] = fluidBelow(c, r); clear = false; }
      else if (ch === 'f') { out.movers.push({ kind: 'crumble', x: x - 8, y: r * TILE - 2, w: 16, h: 7, ax: 0, ay: 0, period: 1, phase: 0 }); lines[r][c] = fluidBelow(c, r); clear = false; }
      else if (ENEMY_KINDS[ch]) {
        const kind = ENEMY_KINDS[ch];
        if (kind === 'leaper') { out.enemies.push({ kind, x, y: r * TILE + 6 }); lines[r][c] = fluidBelow(c, r); clear = false; }
        else out.enemies.push({ kind, x, y: kind === 'flyer' ? r * TILE + 8 : feet });
      } else if (ITEM_KINDS[ch]) out.items.push({ kind: ITEM_KINDS[ch], x, y: r * TILE + 8 });
      else clear = false;
      if (clear) lines[r][c] = ' ';
    }
  }
  // Rafts drift across the gap they sit in; several rafts share it evenly.
  for (const raft of out.movers) {
    if (raft.kind !== 'raft') continue;
    let a = raft.col;
    let b = raft.col;
    while (a > 0 && !solidAt(a - 1, raft.row)) a -= 1;
    while (b < cols - 1 && !solidAt(b + 1, raft.row)) b += 1;
    const mates = out.movers.filter((m) => m.kind === 'raft' && m.row === raft.row && m.col >= a && m.col <= b);
    const slot = mates.indexOf(raft);
    const left = a * TILE;
    const width = (b + 1 - a) * TILE / mates.length;
    const center = left + width * (slot + 0.5);
    raft.x = center - raft.w / 2;
    raft.ax = Math.max(8, width / 2 - raft.w / 2 - 6);
    raft.period = 3 + raft.ax / 22;
  }
  out.grid = lines.map((line) => line.join(''));
  out.treasureTotal = out.items.filter((item) => TREASURES.has(item.kind)).length;
  return out;
}

export const STAGE_COUNT = STAGES.length;
