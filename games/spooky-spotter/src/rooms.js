// The seven rooms of Hollowhush Manor. A room is a recipe, not a picture: it
// says which prop families belong in which bay, so every seed builds a new
// arrangement that still reads as the same room. DOM-free.

export const WORLD_H = 1000;

// Bays are non-overlapping fractions of the room width, so the big furniture
// never collides. `pools` are prop families (see props.js) or prop ids.

export const ROOMS = [
  {
    id: 'library',
    name: 'The Library',
    blurb: 'Books to the ceiling and one very tidy ghost who cannot find her spectacles.',
    accent: '#b98be0',
    arch: 'library',
    floorY: 0.70,
    par: 70,
    palette: {
      wall: '#4a3660', wall2: '#33244a', trim: '#6b4b84', floor: '#7a5338', floor2: '#5a3a26',
      glow: '#ffd79a', dusk: '#1d1430',
    },
    bays: [
      { x: [0.00, 0.17], pools: ['bookcase', 'ladderShelf'] },
      { x: [0.17, 0.35], pools: ['bookcaseWide', 'bookcase', 'pantryShelf'] },
      { x: [0.35, 0.52], pools: ['clock', 'ladder', 'brokenMirror'] },
      { x: [0.52, 0.72], pools: ['deskTall', 'table', 'armchair'] },
      { x: [0.72, 1.00], pools: ['bookcase', 'cabinet', 'bookcaseWide'] },
    ],
    wallSpots: [
      { x: [0.20, 0.32], y: [0.10, 0.20], pools: ['portrait', 'mapFrame'] },
      { x: [0.54, 0.66], y: [0.08, 0.17], pools: ['wallShelf', 'wallClock', 'mirrorOval'] },
      { x: [0.80, 0.92], y: [0.09, 0.19], pools: ['portrait', 'sconce'] },
    ],
    hangSpots: [{ x: [0.40, 0.62], pools: ['chandelier', 'lanternHang'] }],
    clutter: { count: [7, 10], pools: ['bookStack', 'bookStack', 'stool', 'crate', 'potPlant', 'hatbox', 'rolledRugs', 'bottles'] },
    front: [
      { x: [0.26, 0.74], pools: ['rug', 'rugRound'] },
      { x: [0.02, 0.14], pools: ['curtain'] },
      { x: [0.84, 0.98], pools: ['curtain', 'screenFold'] },
      { x: [0.18, 0.80], pools: ['crateFront', 'cushionPile'], optional: true },
    ],
  },
  {
    id: 'kitchen',
    name: 'The Kitchen',
    blurb: 'Still warm, still cluttered, and somebody has misplaced the good teacup.',
    accent: '#ffb25f',
    arch: 'kitchen',
    floorY: 0.71,
    par: 68,
    palette: {
      wall: '#6a5542', wall2: '#4b3a2c', trim: '#8e7152', floor: '#8c6a4a', floor2: '#6a4e34',
      glow: '#ffd27a', dusk: '#2a1d18',
    },
    bays: [
      { x: [0.00, 0.18], pools: ['pantryShelf', 'potShelf'] },
      { x: [0.18, 0.37], pools: ['stove', 'counter'] },
      { x: [0.37, 0.58], pools: ['counter', 'workbench', 'table'] },
      { x: [0.58, 0.76], pools: ['dresser', 'cabinet', 'potShelf'] },
      { x: [0.76, 1.00], pools: ['pantryShelf', 'wineRack', 'bookcaseWide'] },
    ],
    wallSpots: [
      { x: [0.20, 0.33], y: [0.10, 0.20], pools: ['copperPans', 'pegRail'] },
      { x: [0.44, 0.58], y: [0.08, 0.18], pools: ['wallShelf', 'herbBundle', 'wallClock'] },
      { x: [0.66, 0.80], y: [0.10, 0.20], pools: ['pegRail', 'copperPans', 'wallShelf'] },
    ],
    hangSpots: [{ x: [0.36, 0.60], pools: ['lanternHang', 'chandelier'] }],
    clutter: { count: [8, 11], pools: ['barrel', 'sack', 'bucket', 'pots', 'cheeseWheel', 'bottles', 'stool', 'logPile', 'crate'] },
    front: [
      { x: [0.28, 0.72], pools: ['rug', 'tablecloth'] },
      { x: [0.02, 0.14], pools: ['curtain'] },
      { x: [0.20, 0.84], pools: ['crateFront', 'cushionPile'], optional: true },
    ],
  },
  {
    id: 'attic',
    name: 'The Attic',
    blurb: 'Everything the manor ever loved, in boxes. The little ghost up here loves his teddy.',
    accent: '#8fd3ff',
    arch: 'attic',
    floorY: 0.72,
    par: 75,
    palette: {
      wall: '#574660', wall2: '#3b2f45', trim: '#7b6488', floor: '#6f5742', floor2: '#50402f',
      glow: '#cfe4ff', dusk: '#221a2c',
    },
    bays: [
      { x: [0.00, 0.19], pools: ['ladderShelf', 'cabinet', 'bookcase'] },
      { x: [0.19, 0.38], pools: ['dressForm', 'rockingChair', 'hatStand'] },
      { x: [0.38, 0.57], pools: ['trunk', 'suitcase', 'crate'] },
      { x: [0.57, 0.77], pools: ['brokenMirror', 'gramophone', 'ladder'] },
      { x: [0.77, 1.00], pools: ['bookcaseWide', 'dresser', 'ladderShelf'] },
    ],
    wallSpots: [
      { x: [0.22, 0.34], y: [0.12, 0.22], pools: ['portrait', 'mapFrame'] },
      { x: [0.48, 0.62], y: [0.10, 0.20], pools: ['wallShelf', 'pegRail'] },
      { x: [0.74, 0.88], y: [0.12, 0.22], pools: ['mirrorOval', 'wallClock', 'portrait'] },
    ],
    hangSpots: [{ x: [0.30, 0.66], pools: ['lanternHang', 'birdcage'] }],
    clutter: { count: [9, 12], pools: ['crate', 'suitcase', 'hatbox', 'toyBlocks', 'rolledRugs', 'bookStack', 'stool', 'barrel', 'sack'] },
    front: [
      { x: [0.24, 0.76], pools: ['rug', 'rugRound'] },
      { x: [0.03, 0.15], pools: ['curtain', 'screenFold'] },
      { x: [0.16, 0.86], pools: ['crateFront', 'cushionPile'] },
    ],
  },
  {
    id: 'greenhouse',
    name: 'The Greenhouse',
    blurb: 'Warm glass, wet soil and a shy ghost gardener missing one woolly mitten.',
    accent: '#7fd98f',
    arch: 'greenhouse',
    floorY: 0.70,
    par: 72,
    palette: {
      wall: '#3f6a56', wall2: '#2a4c3c', trim: '#5e8f74', floor: '#6b6450', floor2: '#4d4738',
      glow: '#d8ffcf', dusk: '#15261e',
    },
    bays: [
      { x: [0.00, 0.18], pools: ['potShelf', 'ladderShelf'] },
      { x: [0.18, 0.37], pools: ['pottingBench', 'workbench'] },
      { x: [0.37, 0.55], pools: ['tallPalm', 'fern', 'globeStand'] },
      { x: [0.55, 0.76], pools: ['pottingBench', 'table', 'counter'] },
      { x: [0.76, 1.00], pools: ['potShelf', 'ladderShelf', 'pantryShelf'] },
    ],
    wallSpots: [
      { x: [0.22, 0.34], y: [0.10, 0.19], pools: ['herbBundle', 'wallShelf'] },
      { x: [0.46, 0.60], y: [0.09, 0.18], pools: ['mapFrame', 'wallShelf', 'pegRail'] },
      { x: [0.72, 0.86], y: [0.10, 0.20], pools: ['herbBundle', 'sconce'] },
    ],
    hangSpots: [{ x: [0.32, 0.64], pools: ['lanternHang', 'birdcage', 'bunting'] }],
    clutter: { count: [9, 12], pools: ['fern', 'potPlant', 'wateringCan', 'bucket', 'pots', 'mushrooms', 'sack', 'stool', 'bottles'] },
    front: [
      { x: [0.26, 0.74], pools: ['rugRound', 'rug'] },
      { x: [0.14, 0.86], pools: ['vineBox', 'crateFront'] },
      { x: [0.02, 0.14], pools: ['curtain'], optional: true },
    ],
  },
  {
    id: 'ballroom',
    name: 'The Ballroom',
    blurb: 'A dance floor waiting for music. Someone cannot dance with one sock missing.',
    accent: '#ff9fd0',
    arch: 'ballroom',
    floorY: 0.69,
    par: 74,
    palette: {
      wall: '#55406e', wall2: '#3a2b50', trim: '#8d6cac', floor: '#8b6f52', floor2: '#6a523c',
      glow: '#ffe6a8', dusk: '#1f1534',
    },
    bays: [
      { x: [0.00, 0.20], pools: ['sofa', 'armchair', 'cabinet'] },
      { x: [0.20, 0.40], pools: ['piano', 'harp'] },
      { x: [0.40, 0.58], pools: ['gramophone', 'globeStand', 'hatStand'] },
      { x: [0.58, 0.78], pools: ['table', 'sideTable', 'armchair'] },
      { x: [0.78, 1.00], pools: ['bookcaseWide', 'dresser', 'brokenMirror'] },
    ],
    wallSpots: [
      { x: [0.18, 0.32], y: [0.09, 0.18], pools: ['mirrorOval', 'portrait'] },
      { x: [0.44, 0.58], y: [0.08, 0.16], pools: ['wallClock', 'mapFrame', 'wallShelf'] },
      { x: [0.70, 0.86], y: [0.09, 0.18], pools: ['portrait', 'sconce', 'mirrorOval'] },
    ],
    hangSpots: [
      { x: [0.26, 0.46], pools: ['chandelier'] },
      { x: [0.56, 0.76], pools: ['chandelier', 'bunting'] },
    ],
    clutter: { count: [7, 10], pools: ['stool', 'sideTable', 'potPlant', 'bookStack', 'hatbox', 'cushionPile', 'bottles', 'fern'] },
    front: [
      { x: [0.22, 0.78], pools: ['rug', 'rugRound'] },
      { x: [0.02, 0.14], pools: ['curtain'] },
      { x: [0.86, 0.99], pools: ['curtain'] },
      { x: [0.26, 0.74], pools: ['tablecloth', 'cushionPile'], optional: true },
    ],
  },
  {
    id: 'cellar',
    name: 'The Cellar',
    blurb: 'Cool, dim and stacked with jam. The cellar ghost would like her brass key back.',
    accent: '#9fb4ff',
    arch: 'cellar',
    floorY: 0.73,
    par: 72,
    palette: {
      wall: '#44404f', wall2: '#2e2b38', trim: '#625c72', floor: '#5a5260', floor2: '#413b48',
      glow: '#ffcf8a', dusk: '#191622',
    },
    bays: [
      { x: [0.00, 0.19], pools: ['wineRack', 'pantryShelf'] },
      { x: [0.19, 0.38], pools: ['barrel', 'wineRack', 'potShelf'] },
      { x: [0.38, 0.58], pools: ['workbench', 'table', 'counter'] },
      { x: [0.58, 0.78], pools: ['wineRack', 'cabinet', 'ladderShelf'] },
      { x: [0.78, 1.00], pools: ['pantryShelf', 'bookcase', 'ladder'] },
    ],
    wallSpots: [
      { x: [0.22, 0.34], y: [0.14, 0.24], pools: ['wallShelf', 'pegRail'] },
      { x: [0.46, 0.60], y: [0.12, 0.22], pools: ['mapFrame', 'wallClock'] },
      { x: [0.70, 0.84], y: [0.14, 0.24], pools: ['pegRail', 'herbBundle', 'sconce'] },
    ],
    hangSpots: [{ x: [0.34, 0.64], pools: ['lanternHang'] }],
    clutter: { count: [9, 13], pools: ['barrel', 'bottles', 'sack', 'logPile', 'cheeseWheel', 'mushrooms', 'bucket', 'crate', 'pots'] },
    front: [
      { x: [0.26, 0.74], pools: ['rug', 'rugRound'], optional: true },
      { x: [0.14, 0.88], pools: ['crateFront'] },
      { x: [0.02, 0.14], pools: ['curtain'], optional: true },
    ],
  },
  {
    id: 'observatory',
    name: 'The Observatory',
    blurb: 'The roof opens to the stars. The stargazer ghost has lost her pocket watch.',
    accent: '#8fb8ff',
    arch: 'observatory',
    floorY: 0.71,
    par: 78,
    palette: {
      wall: '#32355c', wall2: '#212343', trim: '#4e5490', floor: '#4a4664', floor2: '#35324a',
      glow: '#cfe0ff', dusk: '#12132a',
    },
    bays: [
      { x: [0.00, 0.18], pools: ['ladderShelf', 'bookcase'] },
      { x: [0.18, 0.40], pools: ['telescope'] },
      { x: [0.40, 0.58], pools: ['orrery', 'globeStand'] },
      { x: [0.58, 0.78], pools: ['deskTall', 'workbench', 'table'] },
      { x: [0.78, 1.00], pools: ['bookcase', 'cabinet', 'ladder'] },
    ],
    wallSpots: [
      { x: [0.20, 0.32], y: [0.10, 0.18], pools: ['starChart', 'mapFrame'] },
      { x: [0.44, 0.58], y: [0.09, 0.17], pools: ['starChart', 'wallClock', 'wallShelf'] },
      { x: [0.72, 0.86], y: [0.10, 0.19], pools: ['mirrorOval', 'starChart', 'sconce'] },
    ],
    hangSpots: [{ x: [0.34, 0.62], pools: ['lanternHang', 'chandelier'] }],
    clutter: { count: [8, 11], pools: ['bookStack', 'stool', 'crate', 'bottles', 'potPlant', 'hatbox', 'rolledRugs', 'toyBlocks'] },
    front: [
      { x: [0.24, 0.76], pools: ['rugRound', 'rug'] },
      { x: [0.02, 0.14], pools: ['curtain'] },
      { x: [0.84, 0.98], pools: ['curtain', 'screenFold'], optional: true },
    ],
  },
];

export const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
export const ROOM_IDS = ROOMS.map((r) => r.id);

export function roomIndex(id) {
  return ROOM_IDS.indexOf(id);
}

export const MODES = [
  { id: 'find', name: 'Find the things', short: 'Find', icon: '🔍' },
  { id: 'diff', name: 'Spot the difference', short: 'Difference', icon: '🪞' },
  { id: 'hunt', name: 'Silhouette hunt', short: 'Silhouettes', icon: '🌙' },
];

export const MODE = Object.fromEntries(MODES.map((m) => [m.id, m]));
export const MODE_IDS = MODES.map((m) => m.id);

// How many things each mode asks for. Later rooms ask for more; a narrow
// phone-shaped room asks for fewer differences, because seven well separated
// differences do not fit in it and a cramped picture is no fun to compare.
export function targetCount(mode, roomIdx = 0, boxW = 1400) {
  if (mode === 'diff') {
    const byRoom = 5 + Math.min(2, Math.floor(roomIdx / 3));
    const fits = boxW >= 1250 ? 7 : boxW >= 1060 ? 6 : 5;
    return Math.min(byRoom, fits);
  }
  if (mode === 'hunt') return 6;
  return Math.min(9, 6 + Math.floor(roomIdx / 2));
}

// Par time in seconds for three stars.
export function parTime(roomId, mode) {
  const base = ROOM[roomId]?.par ?? 72;
  if (mode === 'diff') return Math.round(base * 0.85);
  if (mode === 'hunt') return Math.round(base * 0.95);
  return base;
}

// The room box grows with the viewport so a phone is not asked to show a
// cinema-wide room: height is always WORLD_H, width follows the aspect.
export function sceneBox(viewW, viewH) {
  const aspect = viewW > 0 && viewH > 0 ? viewW / viewH : 1.4;
  const w = Math.round(Math.max(900, Math.min(2000, WORLD_H * aspect)));
  return { w, h: WORLD_H };
}
