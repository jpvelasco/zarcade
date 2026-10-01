import test from 'node:test';
import assert from 'node:assert/strict';
import { ALBUMS, PUZZLES, BY_ID } from '../src/progress.js';
import { solve, maskValue } from '../src/solver.js';
import { ANIM_TYPES, PALETTE } from '../src/puzzle.js';

test('there are at least 80 hand-drawn puzzles in eight albums', () => {
  assert.ok(PUZZLES.length >= 80, `only ${PUZZLES.length}`);
  assert.equal(ALBUMS.length, 8);
  for (const a of ALBUMS) assert.ok(a.puzzles.length >= 10, `${a.id} has ${a.puzzles.length}`);
  assert.equal(BY_ID.size, PUZZLES.length, 'puzzle ids are unique');
});

test('sizes run from 5×5 to 15×15 and colour albums come later', () => {
  const sizes = PUZZLES.map((p) => Math.max(p.w, p.h));
  assert.equal(Math.min(...sizes), 5);
  assert.equal(Math.max(...sizes), 15);
  for (const p of PUZZLES) {
    assert.ok(p.w >= 4 && p.w <= 15 && p.h >= 4 && p.h <= 15, `${p.id} is ${p.w}x${p.h}`);
  }
  const firstColour = ALBUMS.findIndex((a) => a.colour);
  assert.ok(firstColour >= 3);
  for (const a of ALBUMS.slice(firstColour)) assert.equal(a.colour, true);
  for (let i = 1; i < ALBUMS.length; i++) assert.ok(ALBUMS[i].unlock >= ALBUMS[i - 1].unlock);
  assert.equal(ALBUMS[0].unlock, 0);
});

test('colour puzzles use 2–6 clue colours, black-and-white ones use one', () => {
  for (const p of PUZZLES) {
    if (p.colour) assert.ok(p.colours >= 2 && p.colours <= 6, `${p.id} has ${p.colours} colours`);
    else assert.equal(p.colours, 1);
  }
});

test('every puzzle has a name, a known animation and a sensible fill', () => {
  for (const p of PUZZLES) {
    assert.ok(p.name && p.name.length <= 22, p.id);
    assert.ok(ANIM_TYPES.includes(p.anim), `${p.id}: ${p.anim}`);
    const fill = p.solution.filter((v) => v >= 0).length / p.solution.length;
    assert.ok(fill > 0.25 && fill < 0.92, `${p.id} fill ${fill}`);
    for (const hex of p.art) if (hex) assert.match(hex, /^#[0-9a-f]{6}$/);
  }
  assert.ok(Object.keys(PALETTE).length > 10);
});

test('every puzzle is unique and solvable by line logic alone', () => {
  for (const p of PUZZLES) {
    const r = solve(p);
    assert.equal(r.contradiction, false, p.id);
    assert.equal(r.solved, true, `${p.id} needs a guess`);
    assert.deepEqual(r.masks.map(maskValue), Array.from(p.solution), `${p.id} solves to its picture`);
  }
});

test('pictures with eyes put them inside the grid', () => {
  for (const p of PUZZLES) for (const i of p.eyes) assert.ok(i >= 0 && i < p.w * p.h, p.id);
  assert.ok(PUZZLES.filter((p) => p.eyes.length).length >= 20);
});
