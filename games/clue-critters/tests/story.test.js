import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY, STORY_CASES, CHAPTERS } from '../src/story.js';
import { gridClues } from '../src/cases.js';
import { countSolutions, deduce, NOT_TYPES, EITHER_TYPES } from '../src/logic.js';

test('twelve story cases in three chapters', () => {
  assert.ok(STORY_CASES.length >= 12);
  assert.equal(new Set(STORY.map((s) => s.id)).size, STORY.length);
  for (const ch of CHAPTERS) assert.equal(STORY.filter((s) => s.chapter === ch.id).length, 4);
});

test('story cases scale from 3 to 5 suspects', () => {
  assert.deepEqual(STORY_CASES.map((k) => k.n), [3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5]);
});

for (const [i, k] of STORY_CASES.entries()) {
  test(`story case ${i + 1} (${k.title}) has one answer reachable by simple steps`, () => {
    const clues = gridClues(k);
    assert.equal(countSolutions(k.n, clues), 1);
    const r = deduce(k.n, clues);
    assert.ok(r.solved);
    assert.deepEqual(r.world, k.solution);
    assert.equal(k.solution[k.crime.kind][k.culprit], k.crime.idx);
    const types = clues.map((c) => c.t);
    if (k.difficulty >= 2) assert.ok(types.some((t) => NOT_TYPES.includes(t)));
    if (k.difficulty >= 3) assert.ok(types.some((t) => EITHER_TYPES.includes(t)));
    const def = STORY[i];
    assert.equal(def.flavor.length, k.n);
    for (const line of [def.intro, def.reason, ...def.flavor]) assert.ok(line.length <= 80, line);
    for (const c of k.clues) assert.ok(c.text.length <= 90, c.text);
  });
}
