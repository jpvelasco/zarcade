// Albums, stars, unlocks and cosmetics. DOM-free.
import { ALBUMS } from './puzzles.js';
import { buildPuzzle } from './puzzle.js';

// Built puzzles, in album order, each tagged with its album.
export const PUZZLES = [];
export const BY_ID = new Map();
for (const [ai, album] of ALBUMS.entries()) {
  album.index = ai;
  album.built = album.puzzles.map((def, pi) => {
    const p = buildPuzzle({ ...def, colour: album.colour });
    p.album = ai;
    p.number = pi + 1;
    p.order = PUZZLES.length;
    PUZZLES.push(p);
    BY_ID.set(p.id, p);
    return p;
  });
}
export { ALBUMS };
export const MAX_STARS = PUZZLES.length * 3;

// Paper palettes: page background, board, grid, ink, clue colours.
export const PALETTES = [
  { id: 'paper', name: 'Cream Paper', stars: 0, page: ['#fbf3e4', '#f3e6cf'], board: '#fffaf0', grid: '#e3d6bf', bold: '#b9a585', ink: '#3b3350', clue: '#4a4060', dim: '#c4b8a4', cross: '#b49c80', hi: 'rgba(255, 196, 92, 0.22)', accent: '#ff8a5c', dark: false },
  { id: 'mint', name: 'Mint Notebook', stars: 6, page: ['#e6f6ee', '#d2ecdf'], board: '#f7fffb', grid: '#cfe6da', bold: '#86b9a0', ink: '#2c4a43', clue: '#2f5a4e', dim: '#a9c9bb', cross: '#7fae98', hi: 'rgba(92, 200, 160, 0.22)', accent: '#2fb383', dark: false },
  { id: 'sky', name: 'Sky Blueprint', stars: 15, page: ['#dcecff', '#c8defa'], board: '#f4f9ff', grid: '#c8daf2', bold: '#7f9fd0', ink: '#24365e', clue: '#2a4378', dim: '#a6bbdb', cross: '#7d97c6', hi: 'rgba(90, 150, 240, 0.2)', accent: '#4a8fe0', dark: false },
  { id: 'peach', name: 'Peach Sketchbook', stars: 25, page: ['#ffe7dc', '#fbd2c2'], board: '#fff8f4', grid: '#f2d3c4', bold: '#d69a82', ink: '#5a2f3a', clue: '#6a3442', dim: '#e2b8a8', cross: '#cf9783', hi: 'rgba(255, 140, 120, 0.2)', accent: '#ef6f6c', dark: false },
  { id: 'night', name: 'Night Chalkboard', stars: 40, page: ['#25304a', '#1b2438'], board: '#2e3a56', grid: '#3d4a6a', bold: '#6a7aa2', ink: '#f2f0ff', clue: '#eef0ff', dim: '#56628a', cross: '#8592bb', hi: 'rgba(255, 230, 140, 0.14)', accent: '#ffd36a', dark: true },
  { id: 'grape', name: 'Grape Soda', stars: 60, page: ['#efe2ff', '#e0cdfb'], board: '#fbf7ff', grid: '#ddd0f2', bold: '#a88bd6', ink: '#3b2366', clue: '#45297a', dim: '#c1addf', cross: '#a08ac8', hi: 'rgba(170, 120, 240, 0.2)', accent: '#9a6ad6', dark: false },
];

// Pencil styles change how filled squares are drawn.
export const PENCILS = [
  { id: 'graphite', name: 'Pencil', stars: 0 },
  { id: 'crayon', name: 'Crayon', stars: 3 },
  { id: 'stamp', name: 'Ink Stamp', stars: 10 },
  { id: 'water', name: 'Watercolour', stars: 20 },
  { id: 'pixel', name: 'Pixel Block', stars: 32 },
  { id: 'neon', name: 'Neon Marker', stars: 50 },
];

export function totalStars(save) {
  let n = 0;
  for (const r of Object.values(save.puzzles)) n += r.stars || 0;
  return n;
}

export function solvedCount(save) {
  return Object.values(save.puzzles).filter((r) => r.solved).length;
}

export function albumUnlocked(save, ai) {
  return solvedCount(save) >= ALBUMS[ai].unlock;
}

export function albumStats(save, ai) {
  const list = ALBUMS[ai].built;
  let solved = 0;
  let stars = 0;
  for (const p of list) {
    const r = save.puzzles[p.id];
    if (r?.solved) solved++;
    stars += r?.stars || 0;
  }
  return { solved, stars, total: list.length, maxStars: list.length * 3 };
}

// Stars for a finished puzzle: solving, no hints, under par.
export function starsFor(puzzle, seconds, hints) {
  return 1 + (hints === 0 ? 1 : 0) + (seconds <= puzzle.par ? 1 : 0);
}

// Record a solve. Returns what changed for the results screen.
export function recordSolve(save, puzzle, seconds, hints) {
  const prev = save.puzzles[puzzle.id] || { stars: 0, best: null, solved: false };
  const stars = starsFor(puzzle, seconds, hints);
  const beforeStars = totalStars(save);
  const beforeSolved = solvedCount(save);
  const newBest = prev.best == null || seconds < prev.best;
  save.puzzles[puzzle.id] = {
    solved: true,
    stars: Math.max(prev.stars || 0, stars),
    best: newBest ? seconds : prev.best,
  };
  delete save.progress[puzzle.id];
  const afterStars = totalStars(save);
  const afterSolved = solvedCount(save);
  const unlocks = [];
  for (const p of PALETTES) if (p.stars > beforeStars && p.stars <= afterStars) unlocks.push({ kind: 'palette', ...p });
  for (const p of PENCILS) if (p.stars > beforeStars && p.stars <= afterStars) unlocks.push({ kind: 'pencil', ...p });
  for (const a of ALBUMS) if (a.unlock > beforeSolved && a.unlock <= afterSolved) unlocks.push({ kind: 'album', id: a.id, name: a.name });
  return { stars, prevStars: prev.stars || 0, newBest, prevBest: prev.best, first: !prev.solved, unlocks, totalStars: afterStars };
}

// The puzzle "Play" should open: an in-progress one, else the first
// unsolved puzzle in an unlocked album, else the first puzzle.
export function nextPuzzle(save) {
  if (save.lastPlayed && save.progress[save.lastPlayed] && BY_ID.has(save.lastPlayed)) return BY_ID.get(save.lastPlayed);
  for (const p of PUZZLES) {
    if (!albumUnlocked(save, p.album)) continue;
    if (!save.puzzles[p.id]?.solved) return p;
  }
  return PUZZLES[0];
}

// The puzzle after this one in the same album (or the next unlocked album).
export function puzzleAfter(save, puzzle) {
  for (let k = puzzle.order + 1; k < PUZZLES.length; k++) {
    const p = PUZZLES[k];
    if (albumUnlocked(save, p.album) && !save.puzzles[p.id]?.solved) return p;
  }
  for (const p of PUZZLES) if (albumUnlocked(save, p.album) && !save.puzzles[p.id]?.solved) return p;
  return null;
}

export function unlockedCosmetics(save) {
  const stars = totalStars(save);
  return {
    palettes: PALETTES.filter((p) => p.stars <= stars).map((p) => p.id),
    pencils: PENCILS.filter((p) => p.stars <= stars).map((p) => p.id),
  };
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
