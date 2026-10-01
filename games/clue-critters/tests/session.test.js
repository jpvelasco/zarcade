import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, autoRun, autoPlan, autoStep } from '../src/session.js';
import { STORY_CASES } from '../src/story.js';
import { generateCase } from '../src/cases.js';
import { YES, NO, BLANK } from '../src/logic.js';

test('the autoplayer solves every story case with no wrong guesses', () => {
  for (const k of STORY_CASES) {
    const s = new Session(k);
    const r = autoRun(s);
    assert.ok(r.ok, `${k.id} solved`);
    assert.equal(s.wrong, 0);
    assert.ok(s.allFound, `${k.id}: every clue can be found`);
    assert.ok(s.gridDone, `${k.id}: the grid is full`);
  }
});

test('the autoplayer solves generated cases too', () => {
  for (let seed = 0; seed < 60; seed++) {
    for (const d of [1, 2, 3]) {
      const s = new Session(generateCase(seed, d));
      assert.ok(autoRun(s).ok);
    }
  }
});

test('searching finds scene clues and jokes', () => {
  const k = STORY_CASES[0];
  const s = new Session(k);
  const c = k.clues.findIndex((x) => x.src.kind === 'scene');
  const { place, spot } = k.clues[c].src;
  const r = s.search(place, spot);
  assert.equal(r.kind, 'clue');
  assert.equal(r.clue, c);
  assert.ok(r.isNew);
  assert.equal(s.search(place, spot).isNew, false);
  const empty = [0, 1, 2, 3, 4, 5].find((sp) => s.clueAt(place, sp) < 0);
  const j = s.search(place, empty);
  assert.equal(j.kind, 'joke');
  assert.ok(j.text.length > 0);
});

test('talking hands over statements', () => {
  const k = STORY_CASES[4];
  const s = new Session(k);
  for (let who = 0; who < k.n; who++) {
    const r = s.talk(who);
    assert.ok(r.flavor);
    for (const i of r.clues) assert.ok(s.found.has(i));
  }
});

test('remaining counts drop as clues are found', () => {
  const k = STORY_CASES[2];
  const s = new Session(k);
  const before = [...Array(k.n).keys()].reduce((a, p) => a + s.remainingAt(p), 0);
  assert.equal(before, k.clues.length);
  autoRun(s);
  for (let p = 0; p < k.n; p++) assert.equal(s.remainingAt(p), 0);
});

test('cells cycle and helpers fill on easy', () => {
  const s = new Session(STORY_CASES[0]);
  assert.equal(s.helper, 2);
  assert.equal(s.cycle('place', 0, 0).value, NO);
  const r = s.cycle('place', 0, 0);
  assert.equal(r.value, YES);
  assert.ok(r.auto.length >= 4);
  assert.equal(s.grid.place[0][1], NO);
  assert.equal(s.cycle('place', 0, 0).value, BLANK);
});

test('hints count, fix wrong marks and walk to a full grid', () => {
  const k = STORY_CASES[5];
  const s = new Session(k);
  const first = s.hint();
  assert.equal(first.kind, 'more');
  assert.equal(first.counted, false);
  assert.equal(s.hints, 0);
  for (const a of autoPlan(s)) if (a.do !== 'reason' && a.do !== 'accuse') autoStep(s, a);
  const wrongV = (k.solution.place[0] + 1) % k.n;
  s.set('place', 0, wrongV, YES);
  const w = s.hint();
  assert.equal(w.kind, 'wrong');
  assert.equal(s.grid.place[0][wrongV], BLANK);
  let guard = 0;
  let h;
  do { h = s.hint(); guard++; } while (h.kind === 'step' && guard < 200);
  assert.equal(h.kind, 'done');
  assert.ok(s.gridDone);
  assert.ok(s.hints > 1);
  for (const x of [w]) for (const line of x.lines) assert.ok(line.length > 0);
});

test('a wrong accusation is gentle and counted', () => {
  const k = STORY_CASES[0];
  const s = new Session(k);
  const other = (k.culprit + 1) % k.n;
  const r = s.accuse(other, k.solution.place[k.culprit], k.solution.thing[k.culprit]);
  assert.equal(r.ok, false);
  assert.equal(r.right.who, false);
  assert.equal(r.right.where, true);
  assert.equal(s.wrong, 1);
  assert.ok(s.accuse(k.culprit, k.solution.place[k.culprit], k.solution.thing[k.culprit]).ok);
  assert.equal(s.wrong, 1);
});

test('progress survives a save and ignores junk', () => {
  const k = STORY_CASES[3];
  const s = new Session(k);
  s.search(0, 0); s.talk(1); s.cycle('thing', 1, 1); s.wrong = 2;
  const saved = JSON.parse(JSON.stringify(s));
  const t = new Session(k, saved);
  assert.deepEqual(t.toJSON(), s.toJSON());
  const junk = new Session(k, { id: k.id, found: [999, -1, 'x'], grid: { place: [[9]] }, wrong: -4, searched: [[77]] });
  assert.equal(junk.found.size, 0);
  assert.equal(junk.wrong, 0);
  assert.equal(new Session(k, { id: 'other', found: [0] }).found.size, 0);
});
