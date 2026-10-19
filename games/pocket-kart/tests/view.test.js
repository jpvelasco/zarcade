import test from 'node:test';
import assert from 'node:assert/strict';
import { KART_LENGTH, aheadOf, speedZoom, viewFor } from '../src/view.js';

const cases = {
  desktop: [1366, 860],
  wide: [1920, 1200],
  phonePortrait: [390, 844],
  phoneLandscape: [844, 390],
  tablet: [820, 1180],
};

test('every viewport sees plenty of road ahead and a kart big enough to read', () => {
  for (const [name, [w, h]] of Object.entries(cases)) {
    const v = viewFor(w, h);
    const ahead = aheadOf(v, h);
    const kartPx = KART_LENGTH * v.zoom;
    assert.ok(ahead >= 260, `${name}: ${Math.round(ahead)} ahead`);
    assert.ok(kartPx >= 23 && kartPx <= 64, `${name}: kart ${Math.round(kartPx)} px`);
    // At least two road widths across.
    assert.ok(w / v.zoom >= 280, `${name}: ${Math.round(w / v.zoom)} across`);
  }
});

test('portrait phones keep the kart above the thumbs and still see far ahead', () => {
  const v = viewFor(390, 844);
  assert.ok(v.anchorY * 844 < 844 - 300, 'kart clear of the bottom steering zone');
  assert.ok(aheadOf(v, 844) > aheadOf(viewFor(1366, 860), 860));
  assert.equal(viewFor(390, 844).portrait, true);
  assert.equal(viewFor(844, 390).short, true);
});

test('rotating a phone changes the view at once', () => {
  const a = viewFor(390, 844), b = viewFor(844, 390);
  assert.notEqual(a.zoom, b.zoom);
});

test('speed zooms out a little, less with reduced motion', () => {
  assert.ok(speedZoom(2, 1) < 2);
  assert.ok(speedZoom(2, 1, true) > speedZoom(2, 1));
  assert.equal(speedZoom(2, 0), 2);
});

test('tiny or zero sizes never divide by zero', () => {
  const v = viewFor(0, 0);
  assert.ok(Number.isFinite(v.zoom) && v.zoom > 0);
});
