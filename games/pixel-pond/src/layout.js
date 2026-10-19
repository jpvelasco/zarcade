// Screen layout maths: where the tray goes and how big a cell is. Pure.

export const CELL_BUDGET = 60000; // cells the simulation may hold
export const MIN_CELL_CSS = 3; // a cell is never smaller than this many CSS px
export const MIN_SIDE = 24;

// The tray sits at the bottom, or down the left side when the screen is a
// short landscape (a phone on its side), so it never covers the garden.
export function trayPlacement(vw, vh) {
  return vw > vh && vh < 560 ? 'side' : 'bottom';
}

// Pick an integer device-pixel cell size so the grid fills the stage, stays
// within the cell budget and keeps cells at least MIN_CELL_CSS wide.
export function pickGrid(cssW, cssH, dpr = 1, budget = CELL_BUDGET, minCss = MIN_CELL_CSS) {
  const ratio = Math.max(0.5, Math.min(4, Number.isFinite(dpr) ? dpr : 1));
  const devW = Math.max(1, Math.round(cssW * ratio));
  const devH = Math.max(1, Math.round(cssH * ratio));
  let cell = Math.max(1, Math.ceil(minCss * ratio - 1e-9));
  while ((Math.floor(devW / cell) * Math.floor(devH / cell)) > budget) cell++;
  const w = Math.max(MIN_SIDE, Math.floor(devW / cell));
  const h = Math.max(MIN_SIDE, Math.floor(devH / cell));
  return { cell, w, h, dpr: ratio, cssCell: cell / ratio };
}

// Map a pointer position (CSS px relative to the canvas) to a cell.
export function toCell(px, py, grid) {
  const x = Math.floor((px * grid.dpr) / grid.cell);
  const y = Math.floor((py * grid.dpr) / grid.cell);
  return [Math.max(0, Math.min(grid.w - 1, x)), Math.max(0, Math.min(grid.h - 1, y))];
}
