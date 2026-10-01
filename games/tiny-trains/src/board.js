// Level maps and the board model. DOM-free.
//
// A level map is a list of rows; each row is whitespace-separated tokens:
//   .            grass (you can build here)
//   t p w h k m f n l c   scenery: tree, pine, water, house, rock, mountain,
//                flowers, barn, lamp, candy shop (all blocked)
//   ─ │ ┼ ┌ ┐ └ ┘ fixed track (add w for a bridge over water: ─w)
//   r> b^ y< gv  depot (colour letter + the way the train leaves)
//   R- B|        station (colour letter + h/v line through the platform)
//   R= B!        paint shed (repaints trains to that colour; = across, ! up/down)
//   1> 1<        tunnel portal (pair digit + the way its mouth faces)
// Colour letters: r red, b blue, y yellow, g green, p purple, o orange.
//
// Extra fields: queue {'x,y': 'rb'} (depot sends several trains in order),
// depart {'x,y': n} (first departure tick), gap (ticks between queued trains,
// default 2), stock {X, W} crossings and switches available.

import { N, E, S, W, DX, DY, opposite } from './pieces.js';

export const LETTER_COLOR = { r: 'red', b: 'blue', y: 'yellow', g: 'green', p: 'purple', o: 'orange' };
export const COLOR_LETTER = Object.fromEntries(Object.entries(LETTER_COLOR).map(([k, v]) => [v, k]));
const ARROW = { '^': N, '>': E, v: S, '<': W };
export const ARROW_OF = ['^', '>', 'v', '<'];
const FIXED = {
  '─': { t: 'S', v: 1 }, '│': { t: 'S', v: 0 }, '┼': { t: 'X', v: 0 },
  '└': { t: 'C', v: 0 }, '┌': { t: 'C', v: 1 }, '┐': { t: 'C', v: 2 }, '┘': { t: 'C', v: 3 },
};
export const FIXED_CHAR = Object.fromEntries(Object.entries(FIXED).map(([k, p]) => [`${p.t}${p.v}`, k]));
export const SCENERY = {
  t: 'tree', p: 'pine', w: 'water', h: 'house', k: 'rock', m: 'mountain', f: 'flowers', n: 'barn', l: 'lamp', c: 'shop',
};

export function parseLevel(level) {
  const rows = level.map.map((row) => row.trim().split(/\s+/));
  const h = rows.length;
  const w = rows[0].length;
  const cells = [];
  const trains = [];
  const portals = {};
  const errors = [];
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) errors.push(`row ${y} has ${rows[y].length} cells, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const tok = rows[y][x] || '.';
      const i = y * w + x;
      const key = `${x},${y}`;
      let cell;
      if (tok === '.') cell = { k: 'grass' };
      else if (tok.length === 1 && SCENERY[tok]) cell = { k: 'block', deco: SCENERY[tok] };
      else if (tok.length === 1 && FIXED[tok]) cell = { k: 'track', ...FIXED[tok] };
      else if (tok.length === 2 && FIXED[tok[0]] && tok[1] === 'w') cell = { k: 'track', ...FIXED[tok[0]], deco: 'bridge' };
      else if (tok.length === 2 && LETTER_COLOR[tok[0]] && tok[1] in ARROW) {
        const dir = ARROW[tok[1]];
        const queue = (level.queue && level.queue[key]) || tok[0];
        cell = { k: 'depot', dir, color: LETTER_COLOR[queue[0]], colors: [...queue].map((l) => LETTER_COLOR[l]) };
        const first = (level.depart && level.depart[key]) || 0;
        const gap = level.gap || 2;
        [...queue].forEach((letter, n) => {
          if (!LETTER_COLOR[letter]) errors.push(`bad queue colour ${letter} at ${key}`);
          trains.push({ id: trains.length, color: LETTER_COLOR[letter], depot: i, dir, depart: first + n * gap });
        });
      } else if (tok.length === 2 && LETTER_COLOR[tok[0].toLowerCase()] && tok[0] === tok[0].toUpperCase() && '-|=!'.includes(tok[1])) {
        const color = LETTER_COLOR[tok[0].toLowerCase()];
        const vertical = tok[1] === '|' || tok[1] === '!';
        cell = { k: tok[1] === '-' || tok[1] === '|' ? 'station' : 'paint', color, t: 'S', v: vertical ? 0 : 1 };
      } else if (tok.length === 2 && /[0-9]/.test(tok[0]) && tok[1] in ARROW) {
        cell = { k: 'portal', mouth: ARROW[tok[1]], pair: tok[0] };
        (portals[tok[0]] ||= []).push(i);
      } else {
        errors.push(`unknown token "${tok}" at ${key}`);
        cell = { k: 'grass' };
      }
      cell.x = x;
      cell.y = y;
      cells.push(cell);
    }
  }
  for (const [pair, list] of Object.entries(portals)) {
    if (list.length !== 2) { errors.push(`tunnel ${pair} needs two portals`); continue; }
    cells[list[0]].link = list[1];
    cells[list[1]].link = list[0];
  }
  trains.sort((a, b) => a.depart - b.depart || a.id - b.id);
  trains.forEach((t, n) => { t.id = n; });
  return {
    id: level.id, name: level.name, w, h, cells, trains, errors,
    stock: { X: (level.stock && level.stock.X) || 0, W: (level.stock && level.stock.W) || 0 },
  };
}

export const idx = (board, x, y) => (x < 0 || y < 0 || x >= board.w || y >= board.h ? -1 : y * board.w + x);
export const neighbour = (board, i, e) => idx(board, (i % board.w) + DX[e], Math.floor(i / board.w) + DY[e]);

// Build a board directly (sandbox and daily puzzles) from cell objects.
export function makeBoard({ w, h, cells, trains, stock = { X: 0, W: 0 }, id = 'custom', name = '' }) {
  return { id, name, w, h, cells, trains, stock, errors: [] };
}

// Turn a board back into map rows (used to show generated puzzles in tests).
export function boardToRows(board) {
  const rows = [];
  for (let y = 0; y < board.h; y++) {
    const r = [];
    for (let x = 0; x < board.w; x++) {
      const c = board.cells[y * board.w + x];
      if (c.k === 'grass') r.push('.');
      else if (c.k === 'block') r.push(Object.keys(SCENERY).find((k) => SCENERY[k] === c.deco) || 't');
      else if (c.k === 'track') r.push(FIXED_CHAR[`${c.t}${c.v}`] + (c.deco === 'bridge' ? 'w' : ''));
      else if (c.k === 'depot') r.push(COLOR_LETTER[c.color] + ARROW_OF[c.dir]);
      else if (c.k === 'station') r.push(COLOR_LETTER[c.color].toUpperCase() + (c.v === 0 ? '|' : '-'));
      else if (c.k === 'paint') r.push(COLOR_LETTER[c.color].toUpperCase() + (c.v === 0 ? '!' : '='));
      else if (c.k === 'portal') r.push(c.pair + ARROW_OF[c.mouth]);
    }
    rows.push(r.join(' '));
  }
  return rows;
}

export { N, E, S, W, opposite };

// Turn a level a quarter turn clockwise (tall phones get wide levels upright).
// The puzzle is the same; only the picture turns.
const TURN_ARROW = { '^': '>', '>': 'v', v: '<', '<': '^' };
const TURN_FIXED = { '─': '│', '│': '─', '┼': '┼', '└': '┌', '┌': '┐', '┐': '┘', '┘': '└' };
const TURN_LINE = { '-': '|', '|': '-', '=': '!', '!': '=' };

function turnToken(tok) {
  if (tok.length === 1) return TURN_FIXED[tok] || tok;
  if (TURN_FIXED[tok[0]]) return TURN_FIXED[tok[0]] + tok.slice(1);
  if (tok[1] in TURN_ARROW) return tok[0] + TURN_ARROW[tok[1]];
  if (tok[1] in TURN_LINE) return tok[0] + TURN_LINE[tok[1]];
  return tok;
}

export function rotateLevel(level) {
  const rows = level.map.map((row) => row.trim().split(/\s+/));
  const h = rows.length, w = rows[0].length;
  const map = [];
  for (let ny = 0; ny < w; ny++) {
    const out = [];
    for (let nx = 0; nx < h; nx++) out.push(turnToken(rows[h - 1 - nx][ny]));
    map.push(out.join(' '));
  }
  const moveKeys = (obj) => {
    if (!obj) return obj;
    const next = {};
    for (const [key, value] of Object.entries(obj)) {
      const [x, y] = key.split(',').map(Number);
      next[`${h - 1 - y},${x}`] = value;
    }
    return next;
  };
  return { ...level, map, queue: moveKeys(level.queue), depart: moveKeys(level.depart), rotated: (level.rotated || 0) + 1 };
}
