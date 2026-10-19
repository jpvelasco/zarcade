import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK, isRoad } from '../src/city.js';
import { DISTRICTS, districtFor, makeContract } from '../src/contracts.js';
import { CHAPTERS, JOB_KINDS, SPEAKERS } from '../src/story.js';

const every = (fn) => {
  for (let chapter = 0; chapter < CHAPTERS.length; chapter++) {
    for (let job = 0; job < 3; job++) {
      for (const seed of [1, 34, 92, 711, 81234]) fn(makeContract(seed, chapter, job), `${seed}/${chapter}/${job}`);
    }
  }
};

test('a Shift Code regenerates the same job', () => {
  assert.deepEqual(makeContract(81234, 2, 1), makeContract(81234, 2, 1));
  assert.notDeepEqual(makeContract(81234, 2, 1).legs, makeContract(81235, 2, 1).legs);
});

test('every stop sits on an intersection and no two share one', () => {
  every((contract, label) => {
    const seen = new Set([`${contract.start.x},${contract.start.y}`]);
    for (const stop of contract.legs.flat()) {
      assert.ok(stop.x % BLOCK === 0, label);
      assert.ok(stop.y % BLOCK === 0, label);
      assert.equal(isRoad(stop.x, stop.y), true, label);
      const key = `${stop.x},${stop.y}`;
      assert.ok(!seen.has(key), `${label} reuses ${key}`);
      seen.add(key);
    }
  });
});

test('jobs have the legs their kind promises', () => {
  every((contract, label) => {
    const { def, legs } = contract;
    assert.equal(legs.length, 2, label);
    assert.equal(legs[1].length, def.kind === 'multi' ? def.items : 1, label);
    if (def.kind === 'collect' || def.kind === 'finale') assert.equal(legs[0].length, def.items, label);
    if (def.kind === 'chase') assert.equal(legs[0][0].kind, 'runner', label);
  });
});

test('sparks line the route, sentries stay clear of stops, windows are fair', () => {
  every((contract, label) => {
    assert.ok(contract.sparks.length >= 8, `${label} has ${contract.sparks.length} sparks`);
    for (const spark of contract.sparks) assert.equal(isRoad(spark.x, spark.y), true, label);
    for (const sentry of contract.sentries) {
      for (const stop of [contract.start, ...contract.legs.flat()]) {
        if (stop.kind === 'runner') continue;
        assert.ok(Math.abs(sentry.x - stop.x) + Math.abs(sentry.y - stop.y) > BLOCK, `${label} sentry on a stop`);
      }
    }
    assert.ok(contract.timeLimit >= 25 && contract.timeLimit <= 180, `${label}: ${contract.timeLimit}s`);
  });
});

test('the story reaches every district and uses every kind of job', () => {
  assert.deepEqual(CHAPTERS.map((_, i) => districtFor(i)), DISTRICTS);
  const kinds = new Set(CHAPTERS.flatMap((chapter) => chapter.jobs.map((job) => job.kind)));
  assert.deepEqual([...kinds].sort(), [...JOB_KINDS].sort());
  assert.equal(CHAPTERS.at(-1).jobs.at(-1).kind, 'finale');
});

test('every line of dialogue has a known speaker', () => {
  const lines = CHAPTERS.flatMap((chapter) => [
    ...chapter.intro, ...chapter.outro,
    ...chapter.jobs.flatMap((job) => [...job.brief, ...Object.values(job.radio)]),
  ]);
  for (const [speaker, text] of lines) {
    assert.ok(SPEAKERS[speaker], speaker);
    assert.ok(text.length > 0 && text.length < 140, text);
  }
});
