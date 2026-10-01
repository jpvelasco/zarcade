import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLevel, parseProgram, formatProgram, program, countTiles, programSize, createRun, runProgram,
  solves, fits, features, starsFor, replay, levelRows, cellAt, MAX_STEPS,
} from '../src/rules.js';

const line = (map, extra = {}) => parseLevel({ id: 't', map, start: [0, 0, 'E'], ops: 'FLRJ*G1^@c', limits: { main: 20, p1: 20 }, ...extra });

test('levels parse heights, colours, lamps and batteries', () => {
  const lv = line(['0 1r 2bL . 0B']);
  assert.equal(lv.w, 5);
  assert.equal(lv.h, 1);
  assert.deepEqual(cellAt(lv, 1, 0), { h: 1, c: 'r', item: '' });
  assert.deepEqual(cellAt(lv, 2, 0), { h: 2, c: 'b', item: 'L' });
  assert.equal(cellAt(lv, 3, 0), null);
  assert.equal(cellAt(lv, -1, 0), null);
  assert.deepEqual(lv.lamps, [2]);
  assert.deepEqual(lv.batteries, [4]);
  assert.deepEqual(levelRows(lv), ['0 1r 2bL . 0B']);
  assert.throws(() => line(['0 9']));
});

test('program text round-trips and counts tiles', () => {
  const text = 'F 3(F r:L 2(J *)) b:1 G';
  const list = parseProgram(text);
  assert.equal(formatProgram(list), text);
  assert.equal(countTiles(list), 9);
  assert.equal(countTiles(parseProgram('')), 0);
  assert.equal(programSize(program('1', 'F * 1')), 4);
  assert.throws(() => parseProgram('3(F'));
  assert.throws(() => parseProgram('F)'));
  assert.throws(() => parseProgram('Q'));
  const uids = new Set();
  const walk = (l) => l.forEach((t) => { uids.add(t.uid); if (t.body) walk(t.body); });
  walk(list);
  assert.equal(uids.size, 9, 'every tile gets its own uid');
});

test('forward needs the same height; edges, walls and drops bonk', () => {
  assert.equal(runProgram(line(['0 0L']), program('F *')).result, 'win');
  const wall = runProgram(line(['0 1L']), program('F *'), { keepEvents: true });
  assert.equal(wall.result, 'bonk');
  assert.equal(wall.events.at(-1).reason, 'wall');
  assert.equal(runProgram(line(['1 0L']), program('F *'), { keepEvents: true }).events.at(-1).reason, 'drop');
  assert.equal(runProgram(line(['0L']), program('* F'), { keepEvents: true }).result, 'win', 'wins before walking off');
  assert.equal(runProgram(line(['0 0L']), program('L F')).result, 'bonk');
});

test('jump climbs one, drops any, hops in place on the flat and bonks on tall', () => {
  assert.equal(runProgram(line(['0 1 2L']), program('J J *')).result, 'win');
  assert.equal(runProgram(line(['3 0L']), program('J *')).result, 'win');
  const hop = runProgram(line(['0 0L']), program('J *'), { keepEvents: true });
  assert.equal(hop.events[0].kind, 'hop');
  assert.equal(hop.result, 'end');
  assert.equal(runProgram(line(['0 2L']), program('J *')).result, 'bonk');
});

test('lights stay lit, fizzle off lamps; grab collects batteries', () => {
  const r = runProgram(line(['0L 0 0B']), program('* * F * F G G'), { keepEvents: true });
  assert.deepEqual(r.events.map((e) => e.kind), ['light', 'light', 'move', 'fizzle', 'move', 'grab']);
  assert.equal(r.events[1].again, true);
  assert.equal(r.result, 'win');
  const miss = runProgram(line(['0 0B 0L']), program('G F F *'), { keepEvents: true });
  assert.equal(miss.events[0].kind, 'nograb');
  assert.equal(miss.result, 'end', 'the battery was skipped');
});

test('repeat blocks loop, nest, and stop the moment the level is solved', () => {
  const lv = line(['0L 0L 0L 0L']);
  const r = runProgram(lv, program('9(* F)'), { keepEvents: true });
  assert.equal(r.result, 'win');
  assert.equal(r.steps, 7);
  assert.equal(runProgram(line(['0 0 0 0 0 0 0L']), program('2(3(F)) *')).result, 'win');
});

test('P1 calls and tail recursion run without growing the stack', () => {
  const road = line(['0 0L 0L 0L 0L 0L 0L 0L']);
  assert.equal(runProgram(road, program('1', 'F * 1')).result, 'win');
  const ring = parseLevel({ id: 'ring', map: ['0 0 0', '0 . 0', '0 0 0L'], start: [0, 0, 'E'], ops: 'FLR*1^', limits: { main: 2, p1: 5 } });
  // A forever loop that never finishes gets tired, not stuck.
  const tired = runProgram(ring, program('1', 'F F R 1'));
  assert.equal(tired.result, 'tired');
  assert.equal(tired.steps, MAX_STEPS);
  // Calls with no work in them are cut off too.
  assert.equal(runProgram(ring, program('1', '1')).result, 'tired');
  assert.equal(runProgram(ring, program('1', '')).result, 'end');
});

test('painted tiles only run on matching floors', () => {
  const lv = line(['0 0r', '. 0L']);
  const r = runProgram(lv, program('1', 'F r:R b:L * 1'), { keepEvents: true });
  assert.equal(r.result, 'win');
  const kinds = r.events.map((e) => e.kind);
  assert.ok(kinds.includes('skip'));
  assert.ok(kinds.includes('turn'));
});

test('events carry the tile uid and the active Repeat/P1 frames', () => {
  const lv = line(['0 0 0 0L']);
  const prog = program('1', '3(F) *');
  const run = createRun(lv, prog);
  const ev = run.step();
  assert.equal(ev.kind, 'move');
  assert.equal(ev.uid, prog.p1[0].body[0].uid);
  assert.deepEqual(ev.active.map((a) => a.uid), [prog.main[0].uid, prog.p1[0].uid]);
  assert.equal(ev.active[1].iter, 1);
  run.step();
  assert.equal(run.step().active[1].iter, 3);
  const last = run.step();
  assert.equal(last.kind, 'light');
  assert.equal(last.win, true);
  assert.equal(run.done, true);
  assert.equal(run.step(), null);
});

test('solves() agrees with the full interpreter', () => {
  const cases = [
    [['0 0L 0L'], '1', 'F * 1'],
    [['0 1 2L'], 'J J *', ''],
    [['0 2L'], 'J *', ''],
    [['0 0 0r', '. . 0', '0L 0 0r'], '1', 'F r:R * 1'],
    [['0 0 0L'], '1', '1'],
  ];
  for (const [map, main, p1] of cases) {
    const lv = line(map);
    const prog = program(main, p1);
    assert.equal(solves(lv, prog), runProgram(lv, prog).win, `${map} ${main}/${p1}`);
  }
});

test('fits checks limits, allowed tiles, recursion and nesting', () => {
  const lv = parseLevel({ id: 'x', map: ['0 0L'], start: [0, 0, 'E'], ops: 'F*1@', limits: { main: 3, p1: 2 } });
  assert.equal(fits(lv, program('F *')).ok, true);
  assert.deepEqual(fits(lv, program('F F F *')).problems, ['main']);
  assert.ok(fits(lv, program('J')).problems.includes('op:J'));
  assert.ok(fits(lv, program('r:F')).problems.includes('colour'));
  assert.ok(fits(lv, program('1', '1')).problems.includes('recursion'));
  assert.ok(fits(lv, program('2(2(2(F)))')).problems.includes('nest'));
});

test('features notice the ideas a program uses', () => {
  assert.deepEqual(features(program('F')), { repeat: false, call: false, recursion: false, colour: false, nested: false });
  const f = features(program('1', '2(3(F)) r:L 1'));
  assert.equal(f.call && f.recursion && f.repeat && f.nested && f.colour, true);
  assert.equal(features(program('F', '1')).recursion, false, 'P1 never called from main');
});

test('stars: 3 at or under par, 2 within two, else 1', () => {
  assert.equal(starsFor(5, 6), 3);
  assert.equal(starsFor(6, 6), 3);
  assert.equal(starsFor(8, 6), 2);
  assert.equal(starsFor(9, 6), 1);
});

test('replay repositions a run after an edit', () => {
  const lv = line(['0 0 0 0L']);
  const prog = program('F F F *');
  const { run, trace } = replay(lv, prog, 2);
  assert.equal(run.state.x, 2);
  assert.equal(trace.length, 2);
  assert.equal(run.step().kind, 'move');
});
