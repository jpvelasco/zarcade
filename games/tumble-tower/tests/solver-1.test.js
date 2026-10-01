import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, levelLabel } from '../src/levels.js';
import { autoplay } from './solver-helper.js';

// The look-ahead autoplayer clears every Climb level (levels 1-8 here).
for (const level of LEVELS.slice(0, 8)) {
  test(`autoplayer clears ${levelLabel(level.index)} ${level.name}`, () => {
    const g = autoplay(level);
    assert.equal(g.phase, 'won', `${level.name}: ${JSON.stringify(g.result)}`);
    assert.ok(g.used <= level.limit);
  });
}
