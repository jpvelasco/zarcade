import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Board, jelly, coral, egg, findMatches, findMoves, hasMoves, settle, collectEggs,
  shuffleBoard, swapAllowed, wouldMatch, STRIPE_H, STRIPE_V, BOMB, RAINBOW,
} from '../src/board.js';
import { Rng } from '../src/rng.js';
import { make, DEAD } from './helpers.js';


test('a run of three is a plain match with no special', () => {
  const b = make(['1110', '2345', '3456']);
  const groups = findMatches(b);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].shape, 'line3');
  assert.equal(groups[0].special, null);
  assert.deepEqual(groups[0].cells, [0, 1, 2]);
});

test('four in a row makes a striped jelly along that direction', () => {
  const h = findMatches(make(['1111', '2345', '3456']))[0];
  assert.equal(h.shape, 'line4');
  assert.equal(h.special, STRIPE_H);
  const v = findMatches(make(['1234', '1345', '1456', '1567']))[0];
  assert.equal(v.special, STRIPE_V);
});

test('an L or T shape makes a bubble bomb at the corner', () => {
  const b = make(['111', '122', '133']);
  const groups = findMatches(b);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].shape, 'cross');
  assert.equal(groups[0].special, BOMB);
  assert.equal(groups[0].at, 0, 'the special appears where the arms cross');
  assert.equal(groups[0].cells.length, 5);
});

test('five in a line makes a rainbow pearl and beats a crossing shape', () => {
  const line = findMatches(make(['11111', '23456', '34567']))[0];
  assert.equal(line.special, RAINBOW);
  const tee = findMatches(make(['11111', '23416', '34517']))[0];
  assert.equal(tee.special, RAINBOW, 'a long arm wins over the cross');
});

test('the swapped jelly is where the special lands', () => {
  const b = make(['1111', '2345', '3456']);
  assert.equal(findMatches(b, 3)[0].at, 3);
  assert.equal(findMatches(b, 0)[0].at, 0);
});

test('ice-locked jellies and coral never match and cannot be swapped', () => {
  const b = make(['111', '222', '333']);
  b.at(0).ice = 1;
  assert.equal(findMatches(b).length, 2, 'the top row no longer matches');
  assert.equal(swapAllowed(b, 0, 1), false);
  b.cells[4] = coral(1);
  assert.equal(swapAllowed(b, 4, 5), false);
  assert.equal(swapAllowed(b, 1, 2), true);
  assert.equal(swapAllowed(b, 1, 5), false, 'only neighbours swap');
});

test('a fresh board has no matches and always has a move', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const b = new Board({ rng: new Rng(seed) });
    b.fillEmpty();
    assert.equal(findMatches(b).length, 0, `seed ${seed} dealt a match`);
    assert.ok(hasMoves(b), `seed ${seed} dealt a dead board`);
  }
});

test('findMoves spots swaps that match, and swapping a special always counts', () => {
  const b = make(['112', '221', '122']);
  const moves = findMoves(b);
  assert.ok(moves.some((m) => m.a === 2 && m.b === 5 && m.kind === 'match'), 'there is a matching swap');
  assert.equal(wouldMatch(b, 0, 1).length, 0, 'swapping two of a color changes nothing');
  const dead = make(DEAD);
  assert.equal(hasMoves(dead), false);
  dead.at(0).special = BOMB;
  assert.ok(findMoves(dead).some((m) => m.kind === 'special'), 'a special is always worth a swap');
});

test('shuffling gives a dead board a move again without dealing a match', () => {
  const b = make(DEAD, { colors: 4 });
  assert.equal(hasMoves(b), false);
  const changed = shuffleBoard(b, new Rng(3));
  assert.ok(changed.length > 0);
  assert.equal(findMatches(b).length, 0);
  assert.ok(hasMoves(b));
});

test('gravity drops jellies and refills the top of each column', () => {
  const b = make(['12', '  ', '34']);
  const { moves, spawns } = settle(b);
  assert.deepEqual(moves.map((m) => [m.from, m.to]).sort(), [[0, 2], [1, 3]]);
  assert.equal(spawns.length, 2, 'two fresh jellies drop in');
  assert.ok(b.playableIndices().every((i) => b.at(i)), 'board is full again');
});

test('coral stays put and jellies slide around it', () => {
  const b = make(['111', 'x  ', '222']);
  settle(b);
  assert.equal(b.at(3).kind, 'coral');
  assert.ok(b.playableIndices().every((i) => b.at(i)));
});

test('holes are never filled and shaped boards fill completely', () => {
  const b = make(['.11.', '2222', '3333']);
  settle(b);
  assert.equal(b.at(0), null);
  assert.equal(b.at(3), null);
  assert.ok(b.playableIndices().every((i) => b.at(i)));
});

test('an egg that reaches the bottom of its column hatches', () => {
  const b = make(['1o1', '2 2', '3 3']);
  settle(b);
  const hatched = collectEggs(b);
  assert.equal(hatched.length, 1);
  assert.equal(b.at(7), null, 'the egg left the board');
});

test('boards clone without sharing cells', () => {
  const b = make(['123', '456', '789']);
  const copy = b.clone();
  copy.at(0).color = 5;
  assert.notEqual(b.at(0).color, 5);
  assert.equal(copy.w, b.w);
});
