import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Dmd, DmdShow, FONTS, DMD_W, DMD_H } from '../src/dmd.js';
import { Rules } from '../src/rules.js';

test('every font has the letters, digits and punctuation the game prints', () => {
  const needed = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-:\'/+';
  for (const [name, f] of Object.entries(FONTS)) {
    for (const ch of needed) assert.ok(f.glyphs[ch], `${name} is missing "${ch}"`);
  }
});

test('text draws inside the display and fit() picks a font that fits', () => {
  const d = new Dmd();
  const w = d.text('PINBALL', 0, 0, { font: 'big' });
  assert.equal(w, d.measure('PINBALL', 'big'));
  assert.ok(d.buf.some((v) => v > 0));
  assert.equal(d.fit('JACKPOT'), 'big');
  assert.equal(d.fit('ASTEROID FRENZY'), 'normal');
  assert.equal(d.fit('SHOOT THE FLASHING ARROW', 126, 'normal'), 'small');
  // Off-screen drawing is clipped, never throws.
  d.text('X', -50, -50); d.circle(500, 500, 9, 15, true); d.line(-10, -10, 400, 90);
  assert.equal(d.buf.length, DMD_W * DMD_H);
});

test('every callout title in the rules fits on the display', () => {
  const src = readFileSync(new URL('../src/rules.js', import.meta.url), 'utf8');
  const titles = [...src.matchAll(/callout\('\w+', '([^']+)'(?:, '([^']+)')?/g)].flatMap((m) => [m[1], m[2]].filter(Boolean));
  assert.ok(titles.length > 20);
  const d = new Dmd();
  for (const t of titles) assert.ok(d.measure(t, 'small') <= DMD_W - 2, `"${t}" is too long`);
});

test('the show queues callouts, lets important ones jump in, and expires them', () => {
  const show = new DmdShow();
  show.handle([{ type: 'callout', kind: 'combo', title: '2-WAY COMBO', sub: '100,000' }]);
  show.update(0.01);
  assert.equal(show.current.kind, 'combo');
  show.handle([{ type: 'callout', kind: 'jackpot', title: 'JACKPOT', sub: '1,000,000' }]);
  show.update(0.01);
  assert.equal(show.current.kind, 'jackpot', 'jackpot interrupts a combo');
  for (let i = 0; i < 20; i++) show.handle([{ type: 'callout', kind: 'lanes', title: 'U F O COMPLETE' }]);
  assert.ok(show.queue.length <= 4, 'queue stays short');
  for (let t = 0; t < 30; t += 0.1) show.update(0.1);
  assert.equal(show.current, null);
});

test('every screen and callout draws without errors', () => {
  const show = new DmdShow();
  const rules = new Rules({ seed: 1 });
  rules.newGame();
  rules.startBall();
  const kinds = ['skill', 'planet', 'tour', 'frenzy', 'lock', 'multiball', 'jackpot', 'super', 'extraBall', 'ballSave', 'tilt', 'danger', 'combo', 'mystery', 'lanes'];
  for (const kind of kinds) {
    show.reset();
    show.handle([{ type: 'callout', kind, title: kind.toUpperCase(), sub: 'SUB LINE', planet: 2 }]);
    for (let t = 0; t < 1.5; t += 0.25) { show.update(0.25); show.draw({ mode: 'play', rules }); }
  }
  show.handle([{ type: 'bonus', lines: [{ label: 'SPINS', n: 3, points: 3000 }], bonusX: 2, total: 6000, tilted: false, next: 'nextBall' }]);
  for (let t = 0; t < 3; t += 0.2) { show.update(0.2); show.draw({ mode: 'play', rules }); }
  for (const mode of ['attract', 'over', 'initials']) {
    for (let t = 0; t < 25; t += 0.5) { show.update(0.5); show.draw({ mode, rules, scores: [{ name: 'AAA', score: 5 }], lastScore: 10 }); }
  }
  assert.ok(show.dmd.buf.some((v) => v > 0));
});
