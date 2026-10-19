import test from 'node:test';
import assert from 'node:assert/strict';
import { heroLayout } from '../src/render.js';
import { HERO } from '../src/sprites.js';

// The held ball on a portrait screen, as the renderer's camera draws it for a
// straight-on spot (measured in the browser at 390×844: (195, 486), radius 42).
function portraitBall(W, H) {
  const f = Math.min(W * 1.6, H * 0.95), s = f / 624;
  return { bx: W / 2, by: H * 0.42 + 131.5 * s, br: 42 * s };
}

// Ace's body in screen pixels: its left edge at the bottom, its right edge
// (shoulders and ears, leaning toward the ball) and the top of his head.
function body({ kb, hcx, stand, lean }) {
  return {
    left: hcx - HERO.BODY_HW * kb * Math.cos(lean),
    right: hcx + 120 * kb,
    jerseyRight: hcx + HERO.BODY_HW * kb * Math.cos(lean),
    top: stand - 290 * kb * Math.cos(lean),
  };
}

test('on portrait phones Ace stays on screen, in the bottom-left corner, clear of the flick', () => {
  for (const [W, H] of [[390, 844], [360, 640], [375, 667], [430, 932]]) {
    const { bx, by, br } = portraitBall(W, H);
    const lay = heroLayout(W, H, bx, by, br);
    const b = body(lay);
    const at = `${W}×${H}`;
    assert.ok(lay.kb <= (br / HERO.BALL_R) * 0.7, `${at}: drawn smaller than the ball suggests`);
    assert.ok(b.left >= 0, `${at}: left edge ${b.left.toFixed(0)} on screen`);
    assert.ok(lay.stand >= H, `${at}: stands on the bottom edge`);
    assert.ok(b.right < bx, `${at}: body right ${b.right.toFixed(0)} left of the ball's flight line ${bx}`);
    assert.ok(b.jerseyRight < bx - br, `${at}: jersey clear of the column under the ball`);
    assert.ok(b.top > by + br, `${at}: head top ${b.top.toFixed(0)} below the ball`);
    const share = ((b.right - Math.max(0, b.left)) * (H - b.top)) / (W * H);
    assert.ok(share <= 0.11, `${at}: body box covers ${(share * 100).toFixed(1)}% of the screen`);
  }
});

test('desktop, tablet and landscape layouts are unchanged', () => {
  for (const [W, H, bx, by, br] of [[1280, 800, 640, 468, 55], [844, 390, 422, 228, 27], [1024, 768, 512, 450, 52]]) {
    const k = br / HERO.BALL_R;
    const lay = heroLayout(W, H, bx, by, br);
    assert.equal(lay.kb, k);
    assert.equal(lay.hcx, bx - 120 * k);
    assert.equal(lay.stand, by + (HERO.H - HERO.HOLD_Y) * k + 10 * k);
    assert.equal(lay.lean, 0.18);
  }
});
