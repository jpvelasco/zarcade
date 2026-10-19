import test from 'node:test';
import assert from 'node:assert/strict';
import { plantGarden, Garden, hashString } from '../src/garden.js';
import { SONGS } from '../src/songs.js';
import { buildChart } from '../src/chart.js';
import { Session } from '../src/play.js';
import { simulate } from '../src/autoplay.js';

test('a song always plants the same garden', () => {
  assert.deepEqual(plantGarden('sprout-shuffle'), plantGarden('sprout-shuffle'));
  assert.notDeepEqual(plantGarden('sprout-shuffle'), plantGarden('disco-daisies'));
  assert.equal(hashString('abc'), hashString('abc'));
  const plants = plantGarden(42, 20);
  const thresholds = plants.map((p) => p.threshold).sort((a, b) => a - b);
  assert.ok(thresholds[0] >= 0.02 && thresholds[thresholds.length - 1] <= 0.921);
  assert.equal(new Set(thresholds.map((t) => t.toFixed(4))).size, 20, 'evenly spread');
});

function grow(session, chart) {
  const garden = new Garden(chart.songId, chart.judgements);
  garden.handle(session.events, session);
  garden.update(10);
  return garden;
}

test('playing well fills the garden; playing poorly still grows something', () => {
  const chart = buildChart(SONGS[0], 'normal');
  const great = grow(simulate(Session, chart), chart);
  assert.equal(great.bloom, 1);
  assert.equal(great.openCount, great.plants.length);

  const half = new Session(chart);
  for (const n of chart.notes.filter((_, i) => i % 2 === 0)) { half.press(n.lane, n.t); half.release(n.lane, (n.end ?? n.t) + 0.02); half.update(n.end ?? n.t); }
  half.update(chart.length + 2);
  const meh = grow(half, chart);
  assert.ok(meh.openCount > 0 && meh.openCount < great.openCount, `${meh.openCount} plants`);
});

test('misses never wilt what has grown', () => {
  const g = new Garden('x', 10);
  g.handle([{ type: 'hit', judgement: 'perfect' }, { type: 'hit', judgement: 'perfect' }, { type: 'hit', judgement: 'perfect' }]);
  g.update(1);
  const before = g.openCount;
  const bloom = g.bloom;
  g.handle([{ type: 'hit', judgement: 'miss' }, { type: 'tail', judgement: 'miss' }]);
  g.update(1);
  assert.equal(g.openCount, before);
  assert.equal(g.bloom, bloom);
});

test('dancing builds with the combo', () => {
  const g = new Garden('x', 100);
  g.handle([], { combo: 0, glow: 1 });
  assert.equal(g.dance, 0);
  g.handle([], { combo: 15, glow: 1 });
  assert.equal(g.dance, 0.5);
  g.handle([], { combo: 90, glow: 1 });
  assert.equal(g.dance, 1);
});
