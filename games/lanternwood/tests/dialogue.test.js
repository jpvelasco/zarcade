import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptFor, brokenLinks, NPC_IDS, NAMES, hintScript, signScript } from '../src/dialogue.js';
import { newQuestState, QUESTS } from '../src/quests.js';

function view(stages = {}, extra = {}) {
  const q = newQuestState();
  for (const [id, st] of Object.entries(stages)) q[id].stage = st;
  return {
    stage: (id) => q[id].stage, count: () => 0, has: () => false, flag: () => false,
    berries: 25, pouch: false, tea: 0, shards: 0, raceTime: 30, dark: false, ...extra,
  };
}

const EFFECT = /^(event:[a-z]+:[a-z]+|flag:[a-z:]+|buy:(tea|pouch|snack):\d+|heal|race:start|ending)$/;

test('every conversation in every quest state has valid links and effects', () => {
  const states = [];
  for (let m = 0; m <= 5; m++) {
    for (const side of [-1, 0, 1, 2]) {
      const st = { main: m };
      for (const q of QUESTS) if (q.id !== 'main') st[q.id] = Math.min(side, q.stages.length - 1);
      states.push(st);
    }
  }
  for (const npc of NPC_IDS) {
    for (const st of states) {
      const s = scriptFor(npc, view(st));
      assert.deepEqual(brokenLinks(s), [], `${npc} ${JSON.stringify(st)}`);
      for (const n of Object.values(s.nodes)) {
        assert.ok(NAMES[n.who], `${npc}: speaker ${n.who} has a name`);
        assert.ok(n.text && n.text.length < 220, `${npc}: line length`);
        for (const e of [...(n.effects || []), ...(n.choices || []).flatMap((c) => c.effects || [])]) assert.match(e, EFFECT, `${npc} effect ${e}`);
      }
    }
  }
});

test('Grandma Wick starts the adventure and offers the lamp quest', () => {
  const s = scriptFor('wick', view());
  const effects = Object.values(s.nodes).flatMap((n) => [...(n.effects || []), ...(n.choices || []).flatMap((c) => c.effects || [])]);
  assert.ok(effects.includes('event:talk:wick'));
  assert.ok(effects.includes('event:accept:lamps'));
});

test('the owl riddle loops back on a wrong answer', () => {
  const s = scriptFor('owl', view());
  const q = s.nodes.q;
  const wrong = q.choices.filter((c) => !(c.effects || []).includes('event:riddle:correct'));
  assert.equal(wrong.length, 2);
  for (const c of wrong) assert.equal(s.nodes[c.next].next, 'q');
});

test('the shop offers the pouch only until you own it', () => {
  const labels = (v) => scriptFor('pell', v).nodes.a0.choices.map((c) => c.label).join('|');
  assert.match(labels(view()), /Pouch/);
  assert.doesNotMatch(labels(view({}, { pouch: true })), /Pouch/);
});

test('Tumble always has a hint and signs read their text', () => {
  for (let m = 0; m <= 5; m++) assert.match(hintScript(view({ main: m })).nodes.a0.text, /sniff/);
  assert.equal(signScript('Hello').nodes.a0.text, 'Hello');
});
