// Tile icons as inline SVG, shared by the palette, the program strips, hints
// and help cards. Colours carry meaning: green moves, blue turns, orange
// jumps, yellow lights, teal grabs, purple calls, pink repeats.

export const TILE_INFO = {
  F: { name: 'Forward', key: 'F', bg: '#35c06a', edge: '#1f8a46' },
  L: { name: 'Turn left', key: 'L', bg: '#4a8dff', edge: '#2a5ec4' },
  R: { name: 'Turn right', key: 'R', bg: '#4a8dff', edge: '#2a5ec4' },
  J: { name: 'Jump', key: 'J', bg: '#ff9a3c', edge: '#c8661a' },
  '*': { name: 'Light', key: 'E', bg: '#ffcc33', edge: '#c99a10' },
  G: { name: 'Grab', key: 'G', bg: '#2fc2a8', edge: '#1a8a76' },
  1: { name: 'Call P1', key: '1', bg: '#9a6bff', edge: '#6a40d0' },
  '@': { name: 'Repeat', key: 'O', bg: '#ff6fa8', edge: '#c84078' },
};

export const PALETTE_ORDER = ['F', 'L', 'R', 'J', '*', 'G', '@', '1'];

const S = (body, vb = '0 0 32 32') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const W = 'stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" fill="none"';
const D = 'stroke="#5a3e00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"';

export const ICON = {
  F: S(`<path ${W} d="M16 26V7"/><path ${W} d="M8 14l8-8 8 8"/>`),
  L: S(`<path ${W} d="M23 26V17a6 6 0 0 0-6-6H8"/><path ${W} d="M13 5l-6 6 6 6"/>`),
  R: S(`<path ${W} d="M9 26V17a6 6 0 0 1 6-6h9"/><path ${W} d="M19 5l6 6-6 6"/>`),
  J: S(`<path ${W} d="M5 25c2-12 8-17 13-17 4 0 7 3 8 7"/><path ${W} d="M21 13l5 3 2-6"/><path stroke="#fff" stroke-width="3" stroke-linecap="round" d="M4 28h9"/>`),
  '*': S(`<path ${D} d="M12 21c-3-2-5-5-5-8a9 9 0 0 1 18 0c0 3-2 6-5 8v3h-8z" fill="#fff6c8"/><path ${D} d="M12.5 28h7"/><path stroke="#5a3e00" stroke-width="2.4" stroke-linecap="round" d="M16 1.5v2.5M3 6l2 1.6M29 6l-2 1.6"/>`),
  G: S(`<rect x="9" y="7" width="14" height="21" rx="3" fill="#fff"/><rect x="13" y="4" width="6" height="4" rx="1.5" fill="#fff"/><path d="M17.5 10.5l-5 8h4l-2 6 5.5-8.5h-4z" fill="#1a8a76"/>`),
  1: S(`<path fill="#fff" d="M16 3l2.2 3.3 3.9-.9.9 3.9L26.3 11.5 25 15.3l2.6 3-3.2 2.3.4 4-4 .2-1.7 3.6-3.1-2.5-3.1 2.5-1.7-3.6-4-.2.4-4-3.2-2.3 2.6-3-1.3-3.8 3.3-2.2.9-3.9 3.9.9z"/><circle cx="16" cy="16" r="7.4" fill="#6a40d0"/><text x="16" y="20.6" text-anchor="middle" font-size="13" font-weight="900" font-family="system-ui,sans-serif" fill="#fff">1</text>`),
  '@': S(`<path ${W} d="M25 12a10 10 0 0 0-17.5-2.5"/><path ${W} d="M7 4v6h6"/><path ${W} d="M7 20a10 10 0 0 0 17.5 2.5"/><path ${W} d="M25 28v-6h-6"/>`),
  play: S(`<path fill="#fff" d="M10 6l17 10-17 10z"/>`),
  pause: S(`<rect x="8" y="6" width="6" height="20" rx="2" fill="#fff"/><rect x="18" y="6" width="6" height="20" rx="2" fill="#fff"/>`),
  step: S(`<path fill="#fff" d="M6 6l13 10-13 10z"/><rect x="21" y="6" width="5" height="20" rx="2" fill="#fff"/>`),
  reset: S(`<path ${W} d="M7 16a9 9 0 1 0 3-6.7"/><path ${W} d="M6 4v6h6"/>`),
  clear: S(`<path ${W} d="M7 9h18M13 9V6h6v3M9 9l1.5 17h11L23 9"/>`),
  hint: S(`<circle cx="16" cy="16" r="12" fill="none" stroke="#fff" stroke-width="3"/><path ${W} d="M12 12.5a4 4 0 1 1 5.5 3.7c-1 .5-1.5 1.2-1.5 2.3v.5"/><circle cx="16" cy="23.5" r="2" fill="#fff"/>`),
  main: S(`<path fill="#fff" d="M9 6l17 10-17 10z"/>`),
};

// A small pattern so colours read without colour vision: red has a dot,
// blue has a diamond.
export const COLOUR_INFO = {
  r: { name: 'Red', bg: '#ff5a6e', mark: '<circle cx="8" cy="8" r="4.2" fill="#fff"/>' },
  b: { name: 'Blue', bg: '#3f8cff', mark: '<path d="M8 2.8L13.2 8 8 13.2 2.8 8z" fill="#fff"/>' },
};

export function colourBadge(c) {
  const info = COLOUR_INFO[c];
  if (!info) return '';
  return `<span class="cbadge c-${c}"><svg viewBox="0 0 16 16" aria-hidden="true">${info.mark}</svg></span>`;
}

export function tileLabel(t) {
  const info = TILE_INFO[t.op];
  let label = info ? info.name : t.op;
  if (t.op === '@') label += ` ${t.n} times`;
  if (t.c) label = `${COLOUR_INFO[t.c].name} only: ${label}`;
  return label;
}
