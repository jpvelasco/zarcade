import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, TABLE_SIZE, addHighScore, cleanInitials, freshSave, loadSave, recordStage, tableRank, writeSave } from '../src/progress.js';

function memory() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

test('saves round-trip under the jungle-blaster.v1 key', () => {
  const store = memory();
  const save = freshSave();
  save.settings.retro = true;
  recordStage(save, 0, { treasures: 2, score: 15000, time: 80 });
  assert.equal(writeSave(store, save), true);
  assert.ok(store.data.has(SAVE_KEY));
  assert.equal(SAVE_KEY, 'jungle-blaster.v1');
  const back = loadSave(store);
  assert.equal(back.unlocked, 2);
  assert.equal(back.best.jungle.score, 15000);
  assert.equal(back.settings.retro, true);
});

test('blocked, missing or corrupt storage falls back to a fresh save', () => {
  assert.deepEqual(loadSave(null), freshSave());
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(throwing), freshSave());
  assert.equal(writeSave(throwing, freshSave()), false);
  const junk = memory();
  junk.setItem(SAVE_KEY, '{"unlocked": 99, "table": [{"name": "<script>", "score": 5}], "settings": {"crt": "yes"}}');
  const save = loadSave(junk);
  assert.equal(save.unlocked, 6);
  assert.equal(save.table[0].name, 'SCR');
  assert.equal(save.settings.crt, true, 'non-boolean settings ignored');
});

test('initials are three letters or digits', () => {
  assert.equal(cleanInitials('jp'), 'JPA');
  assert.equal(cleanInitials('a-b-c-d'), 'ABC');
  assert.equal(cleanInitials(''), 'AAA');
});

test('high scores slot into the table in order and the table stays eight long', () => {
  const save = freshSave();
  assert.equal(tableRank(save, 1), -1, 'too low for the table');
  const rank = addHighScore(save, { name: 'kid', score: 50000, stage: 4, mode: 'adventure' });
  assert.equal(rank, 1);
  assert.equal(save.table[1].name, 'KID');
  assert.equal(save.table.length, TABLE_SIZE);
  addHighScore(save, { name: 'TOP', score: 999999, stage: 6, mode: 'arcade' });
  assert.equal(save.table[0].name, 'TOP');
  for (let i = 1; i < save.table.length; i += 1) assert.ok(save.table[i - 1].score >= save.table[i].score);
  assert.equal(save.lastInitials, 'TOP');
});

test('clearing the last stage marks the game beaten; best scores only go up', () => {
  const save = freshSave();
  recordStage(save, 5, { treasures: 1, score: 90000, time: 200 });
  assert.equal(save.beaten, true);
  assert.equal(recordStage(save, 5, { treasures: 2, score: 1000, time: 150 }), false);
  assert.equal(save.best.alien.score, 90000);
  assert.equal(save.best.alien.treasures, 2);
  assert.equal(save.best.alien.time, 150);
});
