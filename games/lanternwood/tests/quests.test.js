import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTS, TRANSITIONS, newQuestState, questEvent, questLog, stageOf, isDone } from '../src/quests.js';

test('a new game starts on the main quest with side quests hidden', () => {
  const s = newQuestState();
  assert.equal(stageOf(s, 'main'), 0);
  for (const q of QUESTS) if (q.id !== 'main') assert.equal(stageOf(s, q.id), -1);
  assert.deepEqual(questLog(s).map((l) => l.id), ['main']);
});

test('the main quest follows the shards in order and ignores events out of order', () => {
  const s = newQuestState();
  questEvent(s, 'shard:burrow');
  assert.equal(stageOf(s, 'main'), 0, 'cannot skip talking to Grandma Wick');
  questEvent(s, 'talk:wick');
  questEvent(s, 'shard:temple');
  assert.equal(stageOf(s, 'main'), 1);
  for (const e of ['shard:burrow', 'shard:temple', 'shard:peak', 'lantern:lit']) questEvent(s, e);
  assert.equal(stageOf(s, 'main'), 5);
  assert.ok(isDone(s, 'main'));
});

test('finding Biscuit before or after accepting both lead to the reward', () => {
  for (const acceptFirst of [true, false]) {
    const s = newQuestState();
    if (acceptFirst) questEvent(s, 'accept:cat');
    questEvent(s, 'found:cat');
    assert.equal(stageOf(s, 'cat'), 1);
    const { rewards } = questEvent(s, 'talk:mira');
    assert.deepEqual(rewards, ['heart']);
    assert.ok(isDone(s, 'cat'));
    assert.deepEqual(questEvent(s, 'talk:mira').rewards, [], 'only rewarded once');
  }
});

test('honeycaps collected early still count when Bun asks', () => {
  const s = newQuestState();
  questEvent(s, 'honeycap');
  questEvent(s, 'honeycap');
  questEvent(s, 'honeycap');
  assert.equal(stageOf(s, 'honey'), -1);
  questEvent(s, 'accept:honey');
  assert.equal(stageOf(s, 'honey'), 1, 'jumps straight to "bring them to Bun"');
  assert.deepEqual(questEvent(s, 'talk:bun').rewards, ['berries:40', 'tea']);
});

test('counters show progress in the log and stop at the target', () => {
  const s = newQuestState();
  questEvent(s, 'accept:lamps');
  questEvent(s, 'lamp');
  questEvent(s, 'lamp');
  const line = questLog(s).find((l) => l.id === 'lamps');
  assert.match(line.text, /\(2\/5\)/);
  for (let i = 0; i < 3; i++) questEvent(s, 'lamp');
  assert.equal(stageOf(s, 'lamps'), 1);
  assert.deepEqual(questEvent(s, 'talk:wick').rewards, ['heart']);
});

test('fishing, the race and the riddle each pay out once', () => {
  const s = newQuestState();
  questEvent(s, 'accept:fish');
  for (let i = 0; i < 3; i++) questEvent(s, 'fish:catch');
  assert.deepEqual(questEvent(s, 'talk:gill').rewards, ['heart']);
  questEvent(s, 'accept:race');
  questEvent(s, 'race:lose');
  assert.equal(stageOf(s, 'race'), 0, 'losing lets you try again');
  assert.deepEqual(questEvent(s, 'race:win').rewards, ['berries:60', 'pouch']);
  questEvent(s, 'accept:riddle');
  assert.deepEqual(questEvent(s, 'riddle:correct').rewards, ['heart']);
  assert.deepEqual(questEvent(s, 'riddle:correct').rewards, []);
});

test('there are six side quests and every transition names a real stage', () => {
  assert.equal(QUESTS.filter((q) => !q.main).length, 6);
  for (const t of TRANSITIONS) {
    const q = QUESTS.find((x) => x.id === t.q);
    assert.ok(q, t.q);
    assert.ok(t.to >= 0 && t.to < q.stages.length, `${t.q} -> ${t.to}`);
    assert.ok(t.from >= -1 && t.from < q.stages.length);
  }
});

test('the quest log lists active quests before finished ones', () => {
  const s = newQuestState();
  questEvent(s, 'accept:riddle');
  questEvent(s, 'riddle:correct');
  questEvent(s, 'accept:cat');
  const ids = questLog(s).map((l) => l.id);
  assert.deepEqual(ids, ['main', 'cat', 'riddle']);
  assert.equal(questLog(s).at(-1).done, true);
});
