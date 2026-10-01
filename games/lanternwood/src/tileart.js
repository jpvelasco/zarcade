// Tile painting for room backgrounds. Each room is baked once into an
// offscreen canvas (see render.js); these functions draw one tile in world
// pixels, looking at neighbours for shorelines, cliff faces and wall tops.
import { TILE } from './tiles.js';
import { hash2 } from './rng.js';

export const PALETTES = {
  village: { grass: '#7cc463', grass2: '#69b457', tuft: '#4f9944', path: '#e2c08a', path2: '#c9a26b', sand: '#efdca4', stone: '#d6cdbd', stone2: '#b9ae9b', tree: '#3f8c45', tree2: '#2f7039', treeHi: '#62ad57' },
  meadow: { grass: '#8ad46c', grass2: '#78c45e', tuft: '#5aa64a', path: '#e6c78f', path2: '#cba870', sand: '#efdca4', stone: '#d6cdbd', stone2: '#b9ae9b', tree: '#47944a', tree2: '#357a3c', treeHi: '#6cb85d' },
  forest: { grass: '#559f52', grass2: '#4a9049', tuft: '#3a7a3d', path: '#c8a674', path2: '#a8865a', sand: '#d9c690', stone: '#b8b2a2', stone2: '#9a937f', tree: '#2f7a3f', tree2: '#235f32', treeHi: '#4f9a4c' },
  hills: { grass: '#a3c467', grass2: '#93b65a', tuft: '#779a45', path: '#dcc08a', path2: '#bf9f6a', sand: '#e9d6a0', stone: '#c8c0ae', stone2: '#aaa18c', tree: '#5d8f43', tree2: '#4a7536', treeHi: '#82ad5b' },
  lake: { grass: '#7fc56f', grass2: '#6db562', tuft: '#529b4c', path: '#e4c58c', path2: '#c8a56e', sand: '#f0dfa6', stone: '#d6cdbd', stone2: '#b9ae9b', tree: '#3d8a4c', tree2: '#2d6e3d', treeHi: '#5fae5d' },
  mountain: { grass: '#b9c08e', grass2: '#a8b07e', tuft: '#8e9868', path: '#d7c7a2', path2: '#b8a682', sand: '#e6dcc0', stone: '#cfcac0', stone2: '#aca698', tree: '#4c7f55', tree2: '#3b6645', treeHi: '#6f9e70' },
  burrow: { floor: '#7a6346', floor2: '#6c573d', moss: '#6f9a46', wall: '#4d3a28', wallTop: '#6e5539', wallHi: '#8a6c48', grass: '#6f9a46', tuft: '#557a36', root: '#3a2b1d' },
  temple: { floor: '#6b8fb3', floor2: '#5f81a5', moss: '#7fb8a8', wall: '#34507a', wallTop: '#4f6f9c', wallHi: '#7898c2', grass: '#6fa89a', tuft: '#4f8a7c', root: '#2a3f60' },
  peak: { floor: '#857699', floor2: '#76688a', moss: '#b58f4c', wall: '#463a5c', wallTop: '#61527c', wallHi: '#c79a52', grass: '#9b8bb0', tuft: '#7a6b90', root: '#2e2540' },
};

const WATER = '#4aa3d8', WATER_DEEP = '#3487c2', FOAM = '#d8f4ff';
const PIT = '#120d1c';

const isWaterish = (ch) => ch === '~' || ch === 'w' || ch === '=';
const isTreeish = (ch) => ch === 'T';

function ground(ctx, x, y, P, tx, ty, dungeon) {
  if (dungeon) {
    ctx.fillStyle = (tx + ty) % 2 ? P.floor : P.floor2;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y + TILE - 1, TILE, 1);
    ctx.fillRect(x + TILE - 1, y, 1, TILE);
    const h = hash2(tx, ty);
    if (h < 0.18) { ctx.fillStyle = P.moss; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(x + 4 + h * 40, y + 10, 4, 2, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    return;
  }
  ctx.fillStyle = P.grass;
  ctx.fillRect(x, y, TILE, TILE);
  const h = hash2(tx, ty);
  ctx.fillStyle = P.grass2;
  if (h < 0.5) ctx.fillRect(x + (h * 31 % 12), y + (h * 97 % 12), 3, 2);
  ctx.fillStyle = P.tuft;
  if (h > 0.7) {
    const ox = x + 3 + (h * 53 % 9), oy = y + 4 + (h * 71 % 8);
    ctx.fillRect(ox, oy, 1, 2); ctx.fillRect(ox + 2, oy - 1, 1, 3); ctx.fillRect(ox + 4, oy, 1, 2);
  }
}

/** Paint the static look of one tile. `get(dx, dy)` returns a neighbour char. */
export function paintTile(ctx, ch, tx, ty, get, theme) {
  const P = PALETTES[theme] || PALETTES.village;
  const dungeon = !!P.floor;
  const x = (tx % 20) * TILE, y = (ty % 12) * TILE;
  const h = hash2(tx, ty);
  switch (ch) {
    case '.': case ',': case 'P': case 'Y': case 't': case 'c': case 'o': case 'k': case 'W':
      if (ch !== '.' && ch !== ',' && !dungeon && sandy(get)) sand(ctx, x, y, P, h);
      else ground(ctx, x, y, P, tx, ty, dungeon);
      if (ch === 'P') plate(ctx, x, y);
      if (ch === 'Y') lampPost(ctx, x, y);
      if (ch === 't') torchStand(ctx, x, y, dungeon);
      if (ch === 'c') switchStand(ctx, x, y);
      if (ch === 'o') post(ctx, x, y);
      if (ch === 'k') counter(ctx, x, y, get);
      if (ch === 'W') well(ctx, x, y);
      break;
    case 'f':
      ground(ctx, x, y, P, tx, ty, dungeon);
      flowers(ctx, x, y, tx, ty);
      break;
    case '-':
      ground(ctx, x, y, P, tx, ty, dungeon);
      path(ctx, x, y, P, get, tx, ty);
      break;
    case '_':
      ctx.fillStyle = P.stone || P.floor;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = P.stone2 || P.floor2;
      ctx.fillRect(x, y + 7, TILE, 1);
      ctx.fillRect(x + ((ty % 2) ? 4 : 11), y, 1, 7);
      ctx.fillRect(x + ((ty % 2) ? 11 : 4), y + 8, 1, 8);
      break;
    case ':':
      sand(ctx, x, y, P, h);
      break;
    case '~': case 'w':
      water(ctx, x, y, get);
      if (ch === 'w') drawbridgeUp(ctx, x, y, get);
      break;
    case '=':
      water(ctx, x, y, get);
      planks(ctx, x, y, get);
      break;
    case 'x':
      pit(ctx, x, y, get, P, dungeon);
      break;
    case 'T':
      ground(ctx, x, y, P, tx, ty, dungeon);
      break; // canopies are painted in a second pass
    case '^':
      cliff(ctx, x, y, get, P, tx, ty);
      break;
    case 'r':
      ground(ctx, x, y, P, tx, ty, dungeon);
      rock(ctx, x, y, h);
      break;
    case 'b':
      ground(ctx, x, y, P, tx, ty, dungeon);
      if (dungeon) pot(ctx, x, y, P); else bush(ctx, x, y, P);
      break;
    case '|':
      ground(ctx, x, y, P, tx, ty, dungeon);
      fence(ctx, x, y, get);
      break;
    case '%':
      if (dungeon) { wall(ctx, x, y, get, P); cracks(ctx, x, y); }
      else { ground(ctx, x, y, P, tx, ty, dungeon); rock(ctx, x, y, 0.4); cracks(ctx, x + 1, y + 2); }
      break;
    case 'g':
      ground(ctx, x, y, P, tx, ty, dungeon);
      bars(ctx, x, y);
      break;
    case 'S':
      wallBase(ctx, x, y, P);
      shutter(ctx, x, y, get);
      break;
    case 'L':
      wallBase(ctx, x, y, P);
      door(ctx, x, y, get, '#8a5a32', '#ffd25a', false);
      break;
    case 'B':
      wallBase(ctx, x, y, P);
      door(ctx, x, y, get, '#6b3f8f', '#ffd25a', true);
      break;
    case '#':
      wall(ctx, x, y, get, P);
      break;
    case 'R':
      roof(ctx, x, y, get, tx, ty);
      break;
    case 'H':
      house(ctx, x, y, get, tx, ty);
      break;
    case 'O':
      ctx.fillStyle = P.stone || '#ccc';
      ctx.fillRect(x, y, TILE, TILE);
      break;
    case '+':
      if (dungeon) stairsUp(ctx, x, y, P); else caveMouth(ctx, x, y, get, P, tx, ty);
      break;
    default:
      ground(ctx, x, y, P, tx, ty, dungeon);
  }
}

/** Second pass: things that overlap their neighbours (tree canopies, the Great Lantern base). */
export function paintOver(ctx, ch, tx, ty, get, theme) {
  const P = PALETTES[theme] || PALETTES.village;
  const x = (tx % 20) * TILE, y = (ty % 12) * TILE;
  if (ch === 'T') tree(ctx, x, y, P, hash2(tx, ty), get);
  if (ch === 'O' && get(-1, 0) !== 'O' && get(0, -1) !== 'O') lanternBase(ctx, x, y);
}

// ------------------------------------------------------------ pieces

function plate(ctx, x, y) {
  ctx.fillStyle = '#5b5368';
  ctx.fillRect(x + 2, y + 2, 12, 12);
  ctx.fillStyle = '#b9b0c9';
  ctx.fillRect(x + 3, y + 3, 10, 10);
  ctx.fillStyle = '#d9d2e6';
  ctx.fillRect(x + 3, y + 3, 10, 2);
  ctx.fillStyle = '#ffcf5a';
  ctx.beginPath(); ctx.arc(x + 8, y + 8, 2, 0, 7); ctx.fill();
}

function flowers(ctx, x, y, tx, ty) {
  const cols = ['#ff8fb1', '#fff3a8', '#ffffff', '#c7a6ff', '#ffb36b'];
  for (let i = 0; i < 3; i++) {
    const h = hash2(tx * 3 + i, ty * 7 - i);
    const fx = x + 2 + (h * 12) | 0, fy = y + 2 + ((h * 977) % 12) | 0;
    ctx.fillStyle = '#3f8a3e';
    ctx.fillRect(fx, fy + 1, 1, 3);
    ctx.fillStyle = cols[(h * 50 | 0) % cols.length];
    ctx.fillRect(fx - 1, fy, 3, 1); ctx.fillRect(fx, fy - 1, 1, 3);
    ctx.fillStyle = '#ffd84f';
    ctx.fillRect(fx, fy, 1, 1);
  }
}

function path(ctx, x, y, P, get) {
  const open = (dx, dy) => { const c = get(dx, dy); return c === '-' || c === '_' || c === '+' || c === '='; };
  const r = 4;
  const l = open(-1, 0) ? 0 : 1, rt = open(1, 0) ? 0 : 1, t = open(0, -1) ? 0 : 1, b = open(0, 1) ? 0 : 1;
  ctx.fillStyle = P.path;
  roundRect(ctx, x + l, y + t, TILE - l - rt, TILE - t - b, [t && l ? r : 0, t && rt ? r : 0, b && rt ? r : 0, b && l ? r : 0]);
  ctx.fill();
  ctx.fillStyle = P.path2;
  const h = hash2(x, y);
  ctx.fillRect(x + 3 + (h * 9 | 0), y + 5 + (h * 77 % 6 | 0), 2, 1);
  ctx.fillRect(x + 9 + (h * 5 | 0), y + 11, 1, 1);
}

function water(ctx, x, y, get) {
  ctx.fillStyle = WATER;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = WATER_DEEP;
  ctx.fillRect(x, y + 10, TILE, 6);
  // Foam where water meets land.
  ctx.fillStyle = FOAM;
  const land = (dx, dy) => !isWaterish(get(dx, dy)) && get(dx, dy) !== 'o';
  if (land(0, -1)) { ctx.fillStyle = 'rgba(30,70,110,0.35)'; ctx.fillRect(x, y, TILE, 3); ctx.fillStyle = FOAM; ctx.fillRect(x, y + 3, TILE, 1); }
  if (land(0, 1)) ctx.fillRect(x, y + TILE - 2, TILE, 2);
  if (land(-1, 0)) ctx.fillRect(x, y, 1, TILE);
  if (land(1, 0)) ctx.fillRect(x + TILE - 1, y, 1, TILE);
}

function drawbridgeUp(ctx, x, y, get) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y + 6, TILE, 4);
  if (get(-1, 0) !== 'w') {
    ctx.fillStyle = '#7a5130';
    ctx.fillRect(x, y - 2, 5, TILE + 2);
    ctx.fillStyle = '#a06c3f';
    ctx.fillRect(x + 1, y - 2, 3, TILE + 1);
  }
}

function planks(ctx, x, y, get) {
  const horiz = isWaterish(get(0, -1)) || get(-1, 0) === '=' || get(1, 0) === '=';
  ctx.fillStyle = '#8a5a34';
  if (horiz) ctx.fillRect(x, y + 2, TILE, 12); else ctx.fillRect(x + 2, y, 12, TILE);
  ctx.fillStyle = '#b07a46';
  for (let i = 0; i < 4; i++) {
    if (horiz) ctx.fillRect(x + i * 4, y + 3, 3, 10); else ctx.fillRect(x + 3, y + i * 4, 10, 3);
  }
  ctx.fillStyle = '#5c3a20';
  if (horiz) { ctx.fillRect(x, y + 2, TILE, 1); ctx.fillRect(x, y + 13, TILE, 1); } else { ctx.fillRect(x + 2, y, 1, TILE); ctx.fillRect(x + 13, y, 1, TILE); }
}

function pit(ctx, x, y, get, P, dungeon) {
  ctx.fillStyle = PIT;
  ctx.fillRect(x, y, TILE, TILE);
  if (get(0, -1) !== 'x') {
    ctx.fillStyle = dungeon ? P.wall : '#6b5a48';
    ctx.fillRect(x, y, TILE, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x, y + 5, TILE, 3);
  }
  ctx.fillStyle = 'rgba(120,90,200,0.12)';
  ctx.fillRect(x + 4, y + 9, 2, 2);
}

function cliff(ctx, x, y, get, P, tx, ty) {
  const below = get(0, 1);
  const face = below !== '^' && below !== '~';
  ctx.fillStyle = '#9b8f80';
  ctx.fillRect(x, y, TILE, TILE);
  const h = hash2(tx, ty);
  ctx.fillStyle = '#b3a897';
  ctx.fillRect(x + (h * 10 | 0), y + 2, 5, 3);
  ctx.fillStyle = '#857a6c';
  ctx.fillRect(x + 2, y + 8 + (h * 4 | 0), 6, 2);
  if (face) {
    ctx.fillStyle = '#6f6458';
    ctx.fillRect(x, y + 8, TILE, 8);
    ctx.fillStyle = '#5c5248';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 1 + i * 4, y + 9 + (i % 2) * 2, 1, 6);
    ctx.fillStyle = '#c8bfae';
    ctx.fillRect(x, y + 7, TILE, 1);
  }
  if (get(0, -1) !== '^') { ctx.fillStyle = P.grass || '#7cc463'; ctx.fillRect(x, y, TILE, 2); }
}

function rock(ctx, x, y, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 13, 7, 2.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#8e8a94';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 9, 7, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#b4b0bb';
  ctx.beginPath(); ctx.ellipse(x + 6 + h * 2, y + 7, 4, 3, -0.3, 0, 7); ctx.fill();
  ctx.fillStyle = '#6f6b77';
  ctx.fillRect(x + 10, y + 11, 3, 1);
}

function cracks(ctx, x, y) {
  ctx.strokeStyle = '#2d2433';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 3); ctx.lineTo(x + 7, y + 7); ctx.lineTo(x + 5, y + 11);
  ctx.moveTo(x + 7, y + 7); ctx.lineTo(x + 11, y + 8); ctx.lineTo(x + 12, y + 12);
  ctx.stroke();
  ctx.fillStyle = '#ff9a3c';
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x + 7, y + 7, 1, 1);
  ctx.globalAlpha = 1;
}

function bush(ctx, x, y, P) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 13, 7, 2.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = P.tree2;
  ctx.beginPath(); ctx.arc(x + 8, y + 9, 6.5, 0, 7); ctx.fill();
  ctx.fillStyle = P.tree;
  ctx.beginPath(); ctx.arc(x + 5, y + 8, 4, 0, 7); ctx.arc(x + 11, y + 8, 4, 0, 7); ctx.fill();
  ctx.fillStyle = P.treeHi;
  ctx.beginPath(); ctx.arc(x + 6, y + 6, 2, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff6f7d';
  ctx.fillRect(x + 10, y + 9, 1, 1); ctx.fillRect(x + 5, y + 11, 1, 1);
}

function pot(ctx, x, y, P) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 13, 6, 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#c56d4a';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 9, 5.5, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#e48f66';
  ctx.fillRect(x + 4, y + 7, 3, 2);
  ctx.fillStyle = '#7a3b26';
  ctx.fillRect(x + 5, y + 3, 6, 2);
}

function tree(ctx, x, y, P, h, get) {
  const cx = x + 8, cy = y + 7;
  const r = 9.5 + h * 1.2;
  ctx.fillStyle = 'rgba(10,30,15,0.28)';
  ctx.beginPath(); ctx.ellipse(cx + 1, y + 14, 8, 3, 0, 0, 7); ctx.fill();
  if (get(0, 1) !== 'T') { ctx.fillStyle = '#6b4a2e'; ctx.fillRect(cx - 2, y + 9, 4, 6); }
  ctx.fillStyle = P.tree2;
  ctx.beginPath(); ctx.arc(cx, cy + 1, r, 0, 7); ctx.fill();
  ctx.fillStyle = P.tree;
  ctx.beginPath(); ctx.arc(cx - 1.5, cy - 1, r - 2.5, 0, 7); ctx.fill();
  ctx.fillStyle = P.treeHi;
  ctx.beginPath(); ctx.arc(cx - 4, cy - 4, 3.2, 0, 7); ctx.arc(cx + 2, cy - 5, 2.2, 0, 7); ctx.fill();
  if (h > 0.82) { ctx.fillStyle = '#ff7f8f'; ctx.fillRect(cx + 3, cy, 2, 2); ctx.fillRect(cx - 5, cy + 3, 2, 2); }
}

function fence(ctx, x, y, get) {
  const isF = (dx, dy) => get(dx, dy) === '|';
  ctx.fillStyle = '#7d5532';
  if (isF(-1, 0) || isF(1, 0) || (!isF(0, -1) && !isF(0, 1))) {
    ctx.fillRect(isF(-1, 0) ? x : x + 6, y + 6, isF(1, 0) ? (isF(-1, 0) ? TILE : 10) : (isF(-1, 0) ? 9 : 4), 2);
    ctx.fillRect(isF(-1, 0) ? x : x + 6, y + 10, isF(1, 0) ? (isF(-1, 0) ? TILE : 10) : (isF(-1, 0) ? 9 : 4), 2);
  }
  if (isF(0, -1) || isF(0, 1)) ctx.fillRect(x + 7, isF(0, -1) ? y : y + 4, 2, isF(0, 1) ? TILE : 10);
  ctx.fillStyle = '#a5754a';
  ctx.fillRect(x + 6, y + 3, 4, 11);
  ctx.fillStyle = '#5c3d22';
  ctx.fillRect(x + 6, y + 13, 4, 1);
}

function wallBase(ctx, x, y, P) {
  ctx.fillStyle = P.wall || '#555';
  ctx.fillRect(x, y, TILE, TILE);
}

function wall(ctx, x, y, get, P) {
  const below = get(0, 1);
  const front = below !== '#' && below !== '%' && below !== 'L' && below !== 'B' && below !== 'S';
  ctx.fillStyle = P.wallTop;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = P.wall;
  ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
  ctx.fillStyle = P.wallTop;
  ctx.fillRect(x + 2, y + 2, 5, 3); ctx.fillRect(x + 9, y + 8, 5, 3);
  if (front) {
    ctx.fillStyle = P.wall;
    ctx.fillRect(x, y + 9, TILE, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y + 9, TILE, 7);
    ctx.fillStyle = P.wallHi;
    ctx.fillRect(x, y + 8, TILE, 1);
    ctx.fillStyle = P.root;
    ctx.fillRect(x + 3, y + 10, 1, 5); ctx.fillRect(x + 10, y + 11, 1, 4);
  }
}

function bars(ctx, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y + 12, TILE, 3);
  ctx.fillStyle = '#5e5a6e';
  ctx.fillRect(x, y + 2, TILE, 2);
  ctx.fillRect(x, y + 11, TILE, 2);
  ctx.fillStyle = '#9d98b3';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 1 + i * 4, y + 1, 2, 13);
}

function shutter(ctx, x, y) {
  ctx.fillStyle = '#5b5670';
  ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
  ctx.fillStyle = '#7d7896';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 1, y + 2 + i * 4, TILE - 2, 2);
  ctx.fillStyle = '#ffcf5a';
  ctx.fillRect(x + 7, y + 7, 2, 2);
}

function door(ctx, x, y, get, wood, gold, big) {
  ctx.fillStyle = '#2a1e2e';
  ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
  ctx.fillStyle = wood;
  ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 3);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x + 2, y + 2, TILE - 4, 2);
  ctx.fillStyle = gold;
  // Keyhole on the inner side of the pair.
  const left = get(1, 0) === get(0, 0) || get(0, 1) === get(0, 0);
  const kx = left ? x + TILE - 4 : x + 2, ky = y + 6;
  if (big) {
    ctx.beginPath(); ctx.arc(left ? x + TILE - 1 : x + 1, y + 8, 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a1e2e'; ctx.fillRect(left ? x + TILE - 2 : x, y + 7, 2, 4);
  } else {
    ctx.fillRect(kx, ky, 2, 5);
    ctx.fillStyle = '#2a1e2e'; ctx.fillRect(kx + (left ? 0 : 1), ky + 1, 1, 2);
  }
}

function roof(ctx, x, y, get, tx, ty) {
  // Every roof gets one colour, picked from its top-left corner.
  let lx = 0, ly = 0;
  while (get(lx - 1, 0) === 'R' && lx > -8) lx--;
  while (get(lx, ly - 1) === 'R' && ly > -8) ly--;
  const cols = [['#c95b4a', '#a8463a', '#e27a62'], ['#4f78b8', '#3d6198', '#6f98d6'], ['#c78a3e', '#a46f2e', '#e2a95c']][Math.floor(hash2(tx + lx, ty + ly) * 3)];
  ctx.fillStyle = cols[0];
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = cols[1];
  for (let i = 0; i < 4; i++) ctx.fillRect(x, y + 3 + i * 4, TILE, 1);
  ctx.fillStyle = cols[2];
  for (let i = 0; i < 4; i++) ctx.fillRect(x + ((i % 2) ? 4 : 0) + 2, y + 1 + i * 4, 2, 1);
  if (get(0, -1) !== 'R') { ctx.fillStyle = cols[1]; ctx.fillRect(x, y, TILE, 2); }
  if (get(-1, 0) !== 'R') { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x, y, 2, TILE); }
  if (get(1, 0) !== 'R') { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + TILE - 2, y, 2, TILE); }
  if (get(0, 1) !== 'R') { ctx.fillStyle = 'rgba(40,20,20,0.35)'; ctx.fillRect(x, y + TILE - 2, TILE, 2); }
}

function house(ctx, x, y, get) {
  ctx.fillStyle = '#f1e2c2';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#d6c29b';
  ctx.fillRect(x, y + TILE - 2, TILE, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x, y, TILE, 3);
  const below = get(0, 1);
  // One door per house, just left of the middle of its front wall.
  if ((below === '-' || below === '_') && get(-1, 0) === 'H' && get(-2, 0) !== 'H') {
    ctx.fillStyle = '#7a4e2c';
    roundRect(ctx, x + 4, y + 4, 8, 12, [4, 4, 0, 0]); ctx.fill();
    ctx.fillStyle = '#ffd25a'; ctx.fillRect(x + 10, y + 10, 1, 1);
  } else {
    ctx.fillStyle = '#7a4e2c';
    ctx.fillRect(x + 4, y + 5, 8, 7);
    ctx.fillStyle = '#ffe9a0';
    ctx.fillRect(x + 5, y + 6, 6, 5);
    ctx.fillStyle = '#7a4e2c';
    ctx.fillRect(x + 7, y + 6, 1, 5); ctx.fillRect(x + 5, y + 8, 6, 1);
    ctx.fillStyle = '#ff8fb1'; ctx.fillRect(x + 4, y + 12, 8, 2);
    ctx.fillStyle = '#4f9944'; ctx.fillRect(x + 4, y + 12, 1, 2); ctx.fillRect(x + 8, y + 12, 1, 2);
  }
}

function counter(ctx, x, y) {
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(x, y + 4, TILE, 10);
  ctx.fillStyle = '#b07a46';
  ctx.fillRect(x, y + 4, TILE, 3);
  ctx.fillStyle = '#ff6f6f'; ctx.beginPath(); ctx.arc(x + 4, y + 3, 2.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(x + 10, y + 3, 2.5, 0, 7); ctx.fill();
}

function well(ctx, x, y) {
  ctx.fillStyle = '#8e8a94';
  ctx.beginPath(); ctx.arc(x + 8, y + 9, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a4b6e';
  ctx.beginPath(); ctx.arc(x + 8, y + 9, 4.5, 0, 7); ctx.fill();
}

function lampPost(ctx, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 14, 5, 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#3b3550';
  ctx.fillRect(x + 7, y - 4, 2, 18);
  ctx.fillRect(x + 5, y + 12, 6, 2);
  ctx.fillStyle = '#4e4767';
  ctx.fillRect(x + 4, y - 8, 8, 2);
  ctx.fillRect(x + 5, y - 6, 6, 5);
  ctx.fillStyle = '#6d6589';
  ctx.fillRect(x + 6, y - 5, 4, 3);
}

function torchStand(ctx, x, y, dungeon) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 14, 5, 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = dungeon ? '#4a4058' : '#5a4632';
  ctx.fillRect(x + 6, y + 6, 4, 8);
  ctx.fillStyle = '#7a6d8e';
  ctx.beginPath(); ctx.moveTo(x + 2, y + 3); ctx.lineTo(x + 14, y + 3); ctx.lineTo(x + 11, y + 8); ctx.lineTo(x + 5, y + 8); ctx.fill();
  ctx.fillStyle = '#2a2233';
  ctx.fillRect(x + 4, y + 3, 8, 2);
}

function switchStand(ctx, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 14, 5, 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6d6589';
  ctx.fillRect(x + 4, y + 10, 8, 4);
  ctx.fillStyle = '#8e86a8';
  ctx.fillRect(x + 4, y + 10, 8, 1);
}

function post(ctx, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 14, 5, 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6b4526';
  ctx.fillRect(x + 5, y + 2, 6, 12);
  ctx.fillStyle = '#9a6a3c';
  ctx.fillRect(x + 6, y + 2, 2, 12);
  ctx.fillStyle = '#c99a5a';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 2, 3, 1.5, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6fbf4a';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(x + 8, y + 7, 4, 1.8, 0, 0, 7); ctx.stroke();
}

function stairsUp(ctx, x, y, P) {
  ctx.fillStyle = P.wall;
  ctx.fillRect(x, y, TILE, TILE);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? P.floor : P.wallHi;
    ctx.fillRect(x + 1, y + 1 + i * 4, TILE - 2, 3);
  }
  ctx.fillStyle = 'rgba(255,240,180,0.35)';
  ctx.fillRect(x + 1, y + 1, TILE - 2, 3);
}

function sandy(get) {
  return [get(-1, 0), get(1, 0), get(0, -1), get(0, 1)].filter((c) => c === ':').length >= 2;
}

function sand(ctx, x, y, P, h) {
  ctx.fillStyle = P.sand || '#efdca4';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = 'rgba(160,120,60,0.25)';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + ((h * 97 * (i + 1)) % 15), y + ((h * 53 * (i + 2)) % 15), 1, 1);
}

function caveMouth(ctx, x, y, get, P, tx, ty) {
  if (sandy(get)) sand(ctx, x, y, P, hash2(tx, ty)); else ground(ctx, x, y, P, tx, ty, false);
  ctx.fillStyle = '#1a1220';
  roundRect(ctx, x + 1, y + 2, TILE - 2, TILE - 2, [7, 7, 1, 1]); ctx.fill();
  ctx.fillStyle = '#3a2a3e';
  ctx.fillRect(x + 3, y + 11, 10, 2);
  ctx.fillRect(x + 4, y + 7, 8, 1);
}

function lanternBase(ctx, x, y) {
  // The Great Lantern's stone plinth; the lantern itself is drawn live.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x + 16, y + 29, 15, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#9b93a8';
  roundRect(ctx, x + 2, y + 18, 28, 11, 3); ctx.fill();
  ctx.fillStyle = '#b9b2c6';
  ctx.fillRect(x + 3, y + 18, 26, 3);
  ctx.fillStyle = '#7d758c';
  ctx.fillRect(x + 6, y + 24, 20, 2);
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + rr[0], y);
  ctx.lineTo(x + w - rr[1], y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr[1]);
  ctx.lineTo(x + w, y + h - rr[2]); ctx.quadraticCurveTo(x + w, y + h, x + w - rr[2], y + h);
  ctx.lineTo(x + rr[3], y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr[3]);
  ctx.lineTo(x, y + rr[0]); ctx.quadraticCurveTo(x, y, x + rr[0], y);
  ctx.closePath();
}
