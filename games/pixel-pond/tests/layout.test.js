import test from 'node:test';
import assert from 'node:assert/strict';
import { pickGrid, trayPlacement, toCell, CELL_BUDGET, MIN_CELL_CSS } from '../src/layout.js';

// Stage sizes (CSS px) left for the garden once the tray has its space.
const SCREENS = [
  { name: 'desktop 16:10', w: 1440, h: 900 - 96, dpr: 1 },
  { name: 'retina desktop', w: 1440, h: 900 - 96, dpr: 2 },
  { name: 'laptop', w: 1366, h: 860 - 96, dpr: 1 },
  { name: 'phone upright', w: 390, h: 844 - 168, dpr: 3 },
  { name: 'phone on its side', w: 844 - 136, h: 390, dpr: 3 },
  { name: 'tablet', w: 1024, h: 1366 - 120, dpr: 2 },
  { name: 'big monitor', w: 2560, h: 1440 - 96, dpr: 1 },
];

test('the grid stays within the cell budget with cells at least 3 CSS px', () => {
  for (const s of SCREENS) {
    const g = pickGrid(s.w, s.h, s.dpr);
    assert.ok(g.w * g.h <= CELL_BUDGET, `${s.name}: ${g.w}x${g.h}`);
    assert.ok(g.cssCell >= MIN_CELL_CSS - 1e-9, `${s.name}: cell ${g.cssCell}px`);
    assert.equal(Number.isInteger(g.cell), true, 'whole device pixels keep cells crisp');
  }
});

test('the grid takes the shape of the screen and fills it', () => {
  for (const s of SCREENS) {
    const g = pickGrid(s.w, s.h, s.dpr);
    const usedW = g.w * g.cssCell;
    const usedH = g.h * g.cssCell;
    assert.ok(s.w - usedW < g.cssCell + 1e-6 && usedW <= s.w + 1e-6, `${s.name} width filled`);
    assert.ok(s.h - usedH < g.cssCell + 1e-6 && usedH <= s.h + 1e-6, `${s.name} height filled`);
  }
  const upright = pickGrid(390, 676, 3);
  assert.ok(upright.h > upright.w * 1.5, 'tall on a phone held upright');
  const side = pickGrid(708, 390, 3);
  assert.ok(side.w > side.h * 1.5, 'wide on its side');
});

test('odd inputs still give a usable grid', () => {
  for (const [w, h, dpr] of [[0, 0, 1], [10, 10, NaN], [5000, 3000, 8], [320, 200, 0]]) {
    const g = pickGrid(w, h, dpr);
    assert.ok(g.w >= 24 && g.h >= 24 && g.cell >= 1);
  }
});

test('the tray goes down the side only on short landscape screens', () => {
  assert.equal(trayPlacement(844, 390), 'side');
  assert.equal(trayPlacement(390, 844), 'bottom');
  assert.equal(trayPlacement(1440, 900), 'bottom');
  assert.equal(trayPlacement(1024, 500), 'side');
});

test('pointer positions map to cells and clamp to the grid', () => {
  const g = pickGrid(400, 300, 2);
  assert.deepEqual(toCell(0, 0, g), [0, 0]);
  assert.deepEqual(toCell(g.cssCell * 3.5, g.cssCell * 7.2, g), [3, 7]);
  assert.deepEqual(toCell(-20, 9999, g), [0, g.h - 1]);
});
