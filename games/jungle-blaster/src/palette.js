// Colours, stage themes, the "2600 mode" palette and a tiny 3×5 pixel font.
// DOM-free so the palette math can be tested.

/** A 128-colour palette in the spirit of the 2600's NTSC chip: 16 hues × 8 levels. */
export const NTSC = (() => {
  const out = [];
  const hsl = (h, s, l) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  };
  for (let lum = 0; lum < 8; lum += 1) out.push(hsl(0, 0, 0.04 + lum * 0.13));
  for (let hue = 1; hue < 16; hue += 1) {
    for (let lum = 0; lum < 8; lum += 1) out.push(hsl((40 + (hue - 1) * 24) % 360, 0.72, 0.12 + lum * 0.105));
  }
  return out;
})();

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = ([r, g, b]) => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;

const nearestCache = new Map();
/** The closest 2600-palette colour to a hex colour (memoised). */
export function retroColor(hex) {
  let hit = nearestCache.get(hex);
  if (hit) return hit;
  const [r, g, b] = hexToRgb(hex);
  let best = NTSC[0];
  let bestD = Infinity;
  for (const c of NTSC) {
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) { bestD = d; best = c; }
  }
  hit = rgbToHex(best);
  nearestCache.set(hex, hit);
  return hit;
}

const lightCache = new Map();
/** A colour pushed most of the way to white: the "just got hit" tint. */
export function lighten(hex, amount = 0.6) {
  const key = `${hex}|${amount}`;
  let hit = lightCache.get(key);
  if (hit) return hit;
  const [r, g, b] = hexToRgb(hex);
  hit = rgbToHex([r, g, b].map((v) => Math.round(v + (255 - v) * amount)));
  lightCache.set(key, hit);
  return hit;
}

export const THEMES = {
  jungle: {
    sky: ['#1f5fb0', '#2a71c2', '#3b86cf', '#55a0da', '#76bbe3', '#9fd3e6', '#c7e6dc'],
    far: '#2c6b45', farHi: '#3a8452', mid: '#1f4d2c', trunk: '#5b3a1f', trunkHi: '#7a5230', canopy: ['#1e6b2e', '#2c8a3a', '#46a84a'],
    top: '#58c04a', topHi: '#9be05a', dirt: ['#8a5a2c', '#7b4c24', '#6b3f1d', '#5c3418'], under: '#24160c', underBand: '#2e1d10',
    brick: '#b5532a', mortar: '#e8a46a', ledge: '#7a5230', ledgeHi: '#a8743e', ladder: '#d8b070',
    water: ['#1d5fc8', '#2f78e0', '#5c9cf0'], sand: ['#d9b45a', '#c69b45'], spikes: '#d8d8e8',
    accent: '#ffd23c', fog: null,
  },
  river: {
    sky: ['#2b78b8', '#3a8ac6', '#4f9fd0', '#6cb6da', '#8dcbe0', '#b3dde2', '#d6eedd'],
    far: '#2f7a55', farHi: '#47966a', mid: '#225838', trunk: '#4e351d', trunkHi: '#6e4c2c', canopy: ['#1f6e3a', '#2f8c46', '#4caa58'],
    top: '#5cc85a', topHi: '#a6e86a', dirt: ['#8c6a3c', '#7b5b32', '#6a4d2a', '#5a4024'], under: '#1b1810', underBand: '#262014',
    brick: '#9a6a3a', mortar: '#d8b07a', ledge: '#8a6034', ledgeHi: '#b88a50', ladder: '#d8b070',
    water: ['#1667b8', '#2a85d0', '#64b4ea'], sand: ['#d9b45a', '#c69b45'], spikes: '#d8d8e8',
    accent: '#7cf0ff', river: true,
  },
  caves: {
    sky: ['#0b0814', '#110c1e', '#171128', '#1d1632', '#231b3a', '#291f42', '#2e2348'],
    far: '#241c3c', farHi: '#30264e', mid: '#1a1430', trunk: '#3a2f5a', trunkHi: '#4c3f72', canopy: ['#2a2048', '#352a5a', '#40346a'],
    top: '#8a7cb8', topHi: '#b6a8e0', dirt: ['#5e5478', '#51486a', '#443c5c', '#38314e'], under: '#120e1c', underBand: '#181226',
    brick: '#5a4a7a', mortar: '#8a7ab0', ledge: '#6a5a8a', ledgeHi: '#9888c0', ladder: '#b8a070',
    water: ['#1a1a22', '#2a2a36', '#4a4a5c'], sand: ['#262028', '#3a3040'], spikes: '#7ce8ff',
    accent: '#4de0ff', crystals: true,
  },
  temple: {
    sky: ['#3a1e4e', '#5a2a5a', '#82345a', '#aa4a52', '#cc6a4a', '#e8904a', '#f4b860'],
    far: '#5a3040', farHi: '#74404e', mid: '#3e2a2a', trunk: '#6a4a30', trunkHi: '#8a6440', canopy: ['#3a5a2a', '#4a7034', '#5c8640'],
    top: '#d8b878', topHi: '#f0d8a0', dirt: ['#b89058', '#a47e4a', '#90703e', '#7a5e34'], under: '#2a1e14', underBand: '#36281a',
    brick: '#b08850', mortar: '#6b5030', ledge: '#c8a064', ledgeHi: '#e8c88a', ladder: '#e0c080',
    water: ['#1d5fc8', '#2f78e0', '#5c9cf0'], sand: ['#d9b45a', '#c69b45'], spikes: '#e8e8f4',
    accent: '#ffcc33', temple: true,
  },
  volcano: {
    sky: ['#1a0606', '#2c0a08', '#44100a', '#62180c', '#8a240e', '#b83a12', '#e0602a'],
    far: '#2a0c0a', farHi: '#3e140e', mid: '#1e0808', trunk: '#3a2420', trunkHi: '#54342c', canopy: ['#3a1a14', '#4a221a', '#5a2a20'],
    top: '#6a5650', topHi: '#ff8a3c', dirt: ['#4a3a36', '#3e302c', '#342824', '#2a201c'], under: '#140a08', underBand: '#1e100c',
    brick: '#4a3430', mortar: '#ff6a2a', ledge: '#5a4440', ledgeHi: '#8a6a60', ladder: '#a08060',
    water: ['#e8400c', '#ff7a1a', '#ffd040'], sand: ['#1e1816', '#2e2420'], spikes: '#ffb070',
    accent: '#ff9a2a', volcano: true,
  },
  alien: {
    sky: ['#05030e', '#0a0618', '#100a24', '#170e32', '#1e1240', '#28164e', '#34205e'],
    far: '#1a1238', farHi: '#2a1e54', mid: '#120c28', trunk: '#3a3260', trunkHi: '#5a4e8a', canopy: ['#2a2050', '#3a2e6a', '#4a3e84'],
    top: '#a4b0c8', topHi: '#e0e8ff', dirt: ['#5a6278', '#4c546a', '#40475c', '#343a4e'], under: '#0e0c18', underBand: '#161424',
    brick: '#4c5470', mortar: '#7a86a8', ledge: '#6a7490', ledgeHi: '#aab4d0', ladder: '#c8d0e0',
    water: ['#1fb83a', '#46e05a', '#a8ff7a'], sand: ['#2a3a2a', '#3a4a3a'], spikes: '#ff4cf0',
    accent: '#ff4cf0', alien: true,
  },
};

// 3×5 pixel font: 5 rows of 3 cells per glyph, '#' for ink. '<' draws a heart.
export const FONT = {
  A: '.#.#.#####.##.#',
  B: '##.#.###.#.###.',
  C: '.###..#..#...##',
  D: '##.#.##.##.###.',
  E: '####..##.#..###',
  F: '####..##.#..#..',
  G: '.###..#.##.#.##',
  H: '#.##.#####.##.#',
  I: '###.#..#..#.###',
  J: '..#..#..##.#.#.',
  K: '#.##.###.#.##.#',
  L: '#..#..#..#..###',
  M: '#.########.##.#',
  N: '##.#.##.##.##.#',
  O: '.#.#.##.##.#.#.',
  P: '##.#.###.#..#..',
  Q: '.#.#.##.###..##',
  R: '##.#.###.#.##.#',
  S: '.###...#...###.',
  T: '###.#..#..#..#.',
  U: '#.##.##.##.####',
  V: '#.##.##.##.#.#.',
  W: '#.##.########.#',
  X: '#.##.#.#.#.##.#',
  Y: '#.##.#.#..#..#.',
  Z: '###..#.#.#..###',
  '0': '####.##.##.####',
  '1': '.#.##..#..#.###',
  '2': '##...#.#.#..###',
  '3': '##...#.#...###.',
  '4': '#.##.####..#..#',
  '5': '####..##...###.',
  '6': '.###..####.####',
  '7': '###..#.#..#..#.',
  '8': '####.#####.####',
  '9': '####.####..###.',
  '.': '.............#.',
  ',': '..........#.#..',
  '!': '.#..#..#.....#.',
  '?': '##...#.#.....#.',
  '-': '......###......',
  '+': '....#.###.#....',
  ':': '....#.....#....',
  '/': '..#..#.#.#..#..',
  "'": '.#..#..........',
  x: '...#.#.#.#.#...',
  '(': '.#.#..#..#...#.',
  ')': '.#...#..#..#.#.',
  '%': '#.#..#.#.#..#.#',
  '*': '...#.#.#.#.#...',
  ' ': '...............',
  '<': '....#.######.#.',
};

export const GLYPH_W = 3;
export const GLYPH_H = 5;
export const textWidth = (text, scale = 1) => (text.length * (GLYPH_W + 1) - 1) * scale;
