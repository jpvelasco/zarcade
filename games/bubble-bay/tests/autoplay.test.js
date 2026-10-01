// The autoplayer doubles as a balance check: it must clear the opening
// levels without help, and every level must be fair with its bubble supply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, dailyLevel } from '../src/levels.js';
import { autoplay, calibrate } from '../src/ai.js';
import { Game } from '../src/game.js';

test('the autoplayer clears levels 1-20 without a continue', () => {
  for (const level of LEVELS.slice(0, 20)) {
    for (const seed of [1, 2, 3]) {
      const run = autoplay(level, { seed });
      assert.ok(run.won, `level ${level.id} seed ${seed}: ${run.reason} after ${run.shots}`);
      assert.ok(run.stars >= 1);
    }
  }
});

test('every level is fair: its supply is enough for the autoplayer', () => {
  let clean = 0;
  for (const level of LEVELS) {
    const run = autoplay(level, { seed: 7, allowContinue: true });
    assert.ok(run.won, `level ${level.id}: ${run.reason} after ${run.shots} shots of ${level.supply}`);
    if (!run.continued) clean++;
  }
  assert.ok(clean >= LEVELS.length * 0.85, `${clean} of ${LEVELS.length} without a continue`);
});

test('every level supply covers its colors, and the queue never hands out a missing color', () => {
  for (const level of LEVELS) {
    assert.ok(level.supply >= 15, `level ${level.id} supply ${level.supply}`);
    assert.ok(level.supply >= level.colors * 3);
    assert.ok(level.stars[1] < level.stars[2] && level.stars[2] < level.supply);
    const game = new Game(level, { seed: 3 });
    for (let k = 0; k < 12 && game.phase === 'aim'; k++) {
      const present = game.board.colorsPresent();
      if (present.length) {
        assert.ok(present.includes(game.current.c), `level ${level.id}: loaded ${game.current.c} not in ${present}`);
        if (game.next) assert.ok(present.includes(game.next.c));
      }
      game.fire(Math.PI / 2 + Math.sin(k * 1.7) * 1.1);
    }
  }
});

test('daily tides are calibrated by the autoplayer and fair', () => {
  for (const key of ['2026-10-01', '2026-10-02', '2026-12-25']) {
    const level = dailyLevel(key);
    const tuned = calibrate(level, { seeds: [1, 2], steps: 64 });
    assert.deepEqual(tuned, calibrate(level, { seeds: [1, 2], steps: 64 }), 'deterministic');
    const run = autoplay({ ...level, supply: tuned.supply }, { seed: 9, allowContinue: true });
    assert.ok(run.won, `${key}: ${run.reason}`);
  }
});
