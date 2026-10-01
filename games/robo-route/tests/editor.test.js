import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDraft, applyTool, resizeDraft, draftToDef, draftFromDef, draftProblem } from '../src/editor.js';
import { parseLevel, levelRows } from '../src/rules.js';
import { encodeLevel, decodeLevel } from '../src/code.js';

test('a blank draft is a playable level', () => {
  const d = blankDraft();
  assert.equal(draftProblem(d), '');
  const lv = parseLevel(draftToDef(d));
  assert.equal(lv.lamps.length, 1);
  assert.ok(lv.ops.includes('F') && lv.ops.includes('*'));
});

test('tools raise, lower, erase, paint and place Bolt', () => {
  const d = blankDraft();
  assert.equal(applyTool(d, 'raise', 2, 2), true);
  assert.equal(d.cells[12].h, 1);
  for (let i = 0; i < 5; i++) applyTool(d, 'raise', 2, 2);
  assert.equal(d.cells[12].h, 4, 'capped at 4');
  applyTool(d, 'erase', 1, 1);
  assert.equal(d.cells[6], null);
  assert.equal(applyTool(d, 'erase', 0, 0), false, 'never erase under Bolt');
  applyTool(d, 'red', 1, 1);
  assert.deepEqual(d.cells[6], { h: 0, c: 'r', item: '' }, 'painting a hole makes a block');
  applyTool(d, 'red', 1, 1);
  assert.equal(d.cells[6].c, '');
  applyTool(d, 'battery', 3, 0);
  assert.equal(d.cells[3].item, 'B');
  applyTool(d, 'bolt', 4, 0);
  assert.deepEqual(d.start, { x: 4, y: 0, d: 1 });
  applyTool(d, 'bolt', 4, 0);
  assert.equal(d.start.d, 2, 'tapping Bolt again turns him');
  applyTool(d, 'lower', 4, 4);
  assert.equal(d.cells[24], null, 'lowering a floor block removes it');
  assert.equal(draftProblem(d), '', 'the battery is still something to do');
});

test('resizing keeps what fits and keeps Bolt on a block', () => {
  const d = blankDraft();
  d.start = { x: 4, y: 4, d: 0 };
  resizeDraft(d, 3, 3);
  assert.equal(d.w, 3);
  assert.equal(d.cells.length, 9);
  assert.deepEqual(d.start, { x: 2, y: 2, d: 0 });
  assert.ok(d.cells[8]);
  assert.match(draftProblem(d), /lamp/);
  resizeDraft(d, 20, 1);
  assert.equal(d.w, 8);
  assert.equal(d.h, 2);
});

test('drafts become share codes and come back', () => {
  const d = blankDraft();
  d.name = 'Zig';
  d.ops.add('J');
  d.p1 = 4;
  applyTool(d, 'raise', 1, 0);
  d.par = 7;
  const def = draftToDef(d);
  assert.ok(def.ops.includes('1'), 'P1 room switches the P1 tile on');
  const back = decodeLevel(encodeLevel(def)).def;
  assert.equal(back.par, 7);
  assert.deepEqual(levelRows(parseLevel(back)), def.map);
  const again = draftFromDef(back);
  assert.equal(again.name, 'Zig');
  assert.equal(again.p1, 4);
  assert.equal(again.par, 7);
});
