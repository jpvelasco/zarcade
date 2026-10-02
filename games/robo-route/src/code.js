// Share codes for player-made levels: 'RR1.<board>.<name>'. The board part
// packs size, start, limits, allowed tiles, par and every cell into URL-safe
// characters, with a checksum so a mistyped code is caught.
import { parseLevel, levelRows, DIRS, ALL_OPS, MAX_SIZE } from './rules.js';
import { hashString } from './rng.js';

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ch = (n) => ABC[n];
const val = (c) => ABC.indexOf(c);
const ITEMS = ['', 'L', 'B'];
const COLS = ['', 'r', 'b'];
export const NAME_MAX = 18;

export function cleanName(name) {
  return String(name || '').replace(/[^A-Za-z0-9 !?'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}

function opsMask(ops) {
  let m = 0;
  for (let i = 0; i < ALL_OPS.length; i++) if (ops.includes(ALL_OPS[i])) m |= 1 << i;
  return m;
}

function maskOps(m) {
  let s = '';
  for (let i = 0; i < ALL_OPS.length; i++) if (m & (1 << i)) s += ALL_OPS[i];
  return s;
}

export function encodeLevel(def) {
  const lv = def.cells ? def : parseLevel(def);
  const mask = opsMask(lv.ops);
  let body = ch(lv.w) + ch(lv.h) + ch(lv.start.x) + ch(lv.start.y) + ch(lv.start.d)
    + ch(lv.limits.main) + ch(lv.limits.p1) + ch(mask & 63) + ch(mask >> 6)
    // 0 means nobody has solved it yet (an untested draft has par 99).
    + ch(lv.par && lv.par < 99 ? Math.min(63, lv.par) : 0);
  for (const c of lv.cells) {
    body += c ? ch(1 + c.h * 9 + COLS.indexOf(c.c) * 3 + ITEMS.indexOf(c.item)) : ch(0);
  }
  body += ch(hashString(body) % 64);
  const name = cleanName(lv.name).replace(/ /g, '~');
  return `RR1.${body}${name ? `.${encodeURIComponent(name)}` : ''}`;
}

// Returns { def } or { error } with a friendly reason.
export function decodeLevel(code) {
  const text = String(code || '').trim();
  const m = /^RR1\.([A-Za-z0-9_-]+)(?:\.(.*))?$/.exec(text);
  if (!m) return { error: 'That does not look like a Robo Route code.' };
  const body = m[1];
  if (body.length < 12) return { error: 'That code is too short.' };
  const sum = body[body.length - 1];
  const core = body.slice(0, -1);
  if (ch(hashString(core) % 64) !== sum) return { error: 'A letter in that code is wrong. Check it and try again.' };
  const [w, h, x, y, d, main, p1, m1, m2, par] = core.slice(0, 10).split('').map(val);
  const cells = core.slice(10);
  if (w < 1 || h < 1 || w > MAX_SIZE || h > MAX_SIZE || cells.length !== w * h) return { error: 'That board has the wrong size.' };
  if (d > 3 || x >= w || y >= h) return { error: 'Bolt is off the board in that code.' };
  const rows = [];
  for (let r = 0; r < h; r++) {
    const row = [];
    for (let c = 0; c < w; c++) {
      const v = val(cells[r * w + c]);
      if (v === 0) { row.push('.'); continue; }
      const n = v - 1;
      const hh = Math.floor(n / 9);
      if (hh > 4) return { error: 'That board has a block too tall.' };
      row.push(`${hh}${COLS[Math.floor((n % 9) / 3)]}${ITEMS[n % 3]}`);
    }
    rows.push(row.join(' '));
  }
  let name = 'Shared level';
  if (m[2]) {
    try { name = cleanName(decodeURIComponent(m[2]).replace(/~/g, ' ')) || name; } catch { /* keep default */ }
  }
  const def = {
    id: `code-${core.slice(-8)}`,
    name,
    map: rows,
    start: [x, y, DIRS[d]],
    ops: maskOps(m1 | (m2 << 6)),
    limits: { main: Math.max(1, main), p1: p1 },
    par: par || 99,
    custom: true,
  };
  let lv;
  try { lv = parseLevel(def); } catch { return { error: 'That board could not be read.' }; }
  if (!lv.cells[y * w + x]) return { error: 'Bolt has nowhere to stand in that code.' };
  if (!lv.lamps.length && !lv.batteries.length) return { error: 'That level has no lamps or batteries.' };
  return { def };
}

export { levelRows };
