// Generates the arcade's install icons (no dependencies): a gold star above
// a cabinet, on the night gradient, rendered from the same vectors as the
// favicon. Outputs the manifest icons (192 and 512, any + maskable) and the
// iOS apple-touch-icon (180) into icons/.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ the art
// Drawn in a 512×512 space. Maskable output scales the mark into the 80%
// safe zone (the outer ring may be clipped); the background stays full-bleed.

const STAR = { cx: 256, cy: 170, R: 92, r: 42 };
const MARQUEE = { x0: 166, x1: 346, y0: 280, y1: 314, r: 17 };
const BODY = { x0: 156, x1: 356, y0: 314, y1: 440, r: 24 };
const SCREEN = { x0: 184, x1: 328, y0: 328, y1: 384, r: 12 };
const BUTTONS = [
  { x: 216, y: 414, r: 15, color: [94, 242, 255] },
  { x: 256, y: 414, r: 15, color: [255, 211, 92] },
  { x: 296, y: 414, r: 15, color: [255, 79, 163] },
];
const C = {
  top: [58, 29, 122],    // #3a1d7a, the page's haze at the top of the screen
  bottom: [18, 10, 46],  // #120a2e, the arcade night
  body: [59, 34, 133],   // #3b2285, the marquee's edge (brighter than the backdrop)
  ink: [11, 6, 32],      // #0b0620
  cyan: [94, 242, 255],  // #5ef2ff
  pink: [255, 79, 163],  // #ff4fa3
  gold: [255, 211, 92],  // #ffd35c
};

function starPoints() {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rad = k % 2 === 0 ? STAR.R : STAR.r;
    pts.push([STAR.cx + rad * Math.cos(a), STAR.cy + rad * Math.sin(a)]);
  }
  return pts;
}

function inStar(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundedRect(x, y, rect) {
  const { x0, x1, y0, y1, r } = rect;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r), 0);
  const dy = Math.max(Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r), 0);
  return dx * dx + dy * dy <= r * r;
}

function shrunk(rect, by) {
  return { x0: rect.x0 + by, x1: rect.x1 - by, y0: rect.y0 + by, y1: rect.y1 - by, r: rect.r - by };
}

const STAR_PTS = starPoints();

// The mark at artwork coordinates, or null for the background.
function markColor(ax, ay) {
  if (inStar(ax, ay, STAR_PTS)) return C.gold;
  if (inRoundedRect(ax, ay, MARQUEE)) return C.pink;
  if (inRoundedRect(ax, ay, BODY)) {
    return inRoundedRect(ax, ay, shrunk(BODY, 4)) ? C.body : C.cyan; // 8px frame
  }
  if (inRoundedRect(ax, ay, SCREEN)) {
    return inRoundedRect(ax, ay, shrunk(SCREEN, 5)) ? C.ink : C.cyan; // 10px frame
  }
  for (const b of BUTTONS) {
    const dx = ax - b.x;
    const dy = ay - b.y;
    if (dx * dx + dy * dy <= b.r * b.r) return b.color;
  }
  return null;
}

// ------------------------------------------------------------- PNG output

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, rows) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  rows.forEach((row, y) => {
    raw[y * stride] = 0; // filter: none
    Buffer.from(row).copy(raw, y * stride + 1);
  });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 3×3 supersampling keeps the star tips and frames smooth at 180.
function render(size, scale) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = new Uint8Array(size * 4);
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < 3; sy++) {
        const py = y + (sy + 0.5) / 3;
        const t = py / size;
        for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3;
          let cr = C.top[0] + (C.bottom[0] - C.top[0]) * t;
          let cg = C.top[1] + (C.bottom[1] - C.top[1]) * t;
          let cb = C.top[2] + (C.bottom[2] - C.top[2]) * t;
          const m = markColor((px - size / 2) / scale + 256, (py - size / 2) / scale + 256);
          if (m) { cr = m[0]; cg = m[1]; cb = m[2]; }
          r += cr;
          g += cg;
          b += cb;
        }
      }
      row[x * 4] = Math.round(r / 9);
      row[x * 4 + 1] = Math.round(g / 9);
      row[x * 4 + 2] = Math.round(b / 9);
      row[x * 4 + 3] = 255;
    }
    rows.push(row);
  }
  return rows;
}

// size is the pixel size; k shrinks the 512-space art about its centre (0.8 =
// the maskable safe zone). The background gradient always fills the whole square.
function emit(name, size, k = 1) {
  const scale = (size * k) / 512;
  const file = join(OUT, name);
  writeFileSync(file, encodePng(size, render(size, scale)));
  console.log(`wrote ${file} (${size}×${size})`);
}

emit('icon-192.png', 192, 1);
emit('icon-512.png', 512, 1);
emit('icon-512-maskable.png', 512, 0.8);
emit('apple-touch-icon.png', 180, 1);
