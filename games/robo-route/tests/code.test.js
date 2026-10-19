import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeLevel, decodeLevel, cleanName } from '../src/code.js';
import { LEVELS } from '../src/levels.js';
import { parseLevel, levelRows, program, runProgram } from '../src/rules.js';

test('every campaign level survives a share code round trip', () => {
  for (const def of LEVELS) {
    const code = encodeLevel(def);
    assert.match(code, /^RR1\.[A-Za-z0-9_-]+(\.[^\s]+)?$/);
    const { def: back, error } = decodeLevel(code);
    assert.equal(error, undefined, def.id);
    const a = parseLevel(def);
    const b = parseLevel(back);
    assert.deepEqual(levelRows(b), levelRows(a), def.id);
    assert.deepEqual(b.start, a.start);
    assert.deepEqual(b.limits, a.limits);
    assert.equal([...b.ops].sort().join(''), [...a.ops].sort().join(''));
    assert.equal(b.par, def.par);
    assert.equal(back.name, def.name.replace(/[^A-Za-z0-9 !?'-]/g, '').trim());
    assert.equal(runProgram(b, program(def.solution.main, def.solution.p1 || '')).win, true);
  }
});

test('typos and junk are caught with friendly messages', () => {
  const code = encodeLevel(LEVELS[5]);
  const body = code.split('.')[1];
  const flipped = body.slice(0, 12) + (body[12] === 'A' ? 'B' : 'A') + body.slice(13);
  assert.match(decodeLevel(`RR1.${flipped}`).error, /wrong/);
  assert.match(decodeLevel('hello').error, /does not look/);
  assert.match(decodeLevel('RR1.AB').error, /short/);
  assert.ok(decodeLevel(`  ${code}  `).def, 'whitespace is fine');
});

test('names are cleaned and kept short', () => {
  assert.equal(cleanName('  <b>My   Cool Level!!</b> with extra words '), 'bMy Cool Level!!b');
  assert.equal(cleanName('x'.repeat(40)).length, 18);
  const def = { ...LEVELS[0], name: 'Zig & Zag' };
  assert.equal(decodeLevel(encodeLevel(def)).def.name, 'Zig Zag');
});

test('an untested level stays untested through a code', async () => {
  const { blankDraft, applyTool, draftToDef, draftFromDef, draftProblem } = await import('../src/editor.js');
  const d = blankDraft();
  for (let y = 0; y < 5; y++) applyTool(d, 'erase', 2, y);
  const def = draftToDef(d);
  assert.equal(def.par, 99, 'never solved');
  const back = decodeLevel(encodeLevel(def)).def;
  assert.equal(back.par, 99);
  const again = draftFromDef(back, 0);
  assert.equal(again.par, null, 'reopening it in the editor must not make it shareable');
  assert.equal(draftProblem(again), '');
});

test('codes asking for bigger strips than the editor makes are refused', () => {
  const big = { id: 'x', name: 'Huge', map: ['0 0 0L'], start: [0, 0, 'E'], ops: 'FLR*1', limits: { main: 63, p1: 0 }, par: 2 };
  assert.match(decodeLevel(encodeLevel(big)).error, /more tiles/);
  const p1 = { ...big, limits: { main: 4, p1: 40 } };
  assert.match(decodeLevel(encodeLevel(p1)).error, /more tiles/);
  const ok = { ...big, limits: { main: 16, p1: 12 } };
  assert.ok(decodeLevel(encodeLevel(ok)).def);
});
