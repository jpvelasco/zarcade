import test from 'node:test';
import assert from 'node:assert/strict';
import { measureFlick } from '../src/input.js';

const drag = (pts) => ({ samples: pts.map(([x, y, t]) => ({ x, y, t })), t0: pts[0][2], x0: pts[0][0], y0: pts[0][1] });

test('an upward flick reports direction and speed in screen heights per second', () => {
  const f = measureFlick(drag([[200, 700, 0], [200, 600, 50], [200, 400, 100]]), 100, 800);
  assert.ok(f);
  assert.ok(Math.abs(f.dirX) < 1e-9 && f.dirY < 0);
  assert.ok(Math.abs(f.speed - 300 / 0.1 / 800) < 0.01);
});

test('a slanted flick aims to the side; taps and downward drags are ignored', () => {
  const f = measureFlick(drag([[200, 700, 0], [260, 500, 100]]), 100, 800);
  assert.ok(f.dirX > 0.2);
  assert.equal(measureFlick(drag([[200, 700, 0], [202, 695, 80]]), 80, 800), null);
  assert.equal(measureFlick(drag([[200, 500, 0], [200, 700, 80]]), 80, 800), null);
});

test('the speed comes from the end of the gesture', () => {
  // Slow start, fast finish.
  const f = measureFlick(drag([[200, 800, 0], [200, 780, 300], [200, 760, 400], [200, 560, 480]]), 480, 800);
  assert.ok(f.speed > 2.5, String(f.speed));
});
