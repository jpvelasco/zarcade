import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, loadSave, writeSave, sanitize, recordCatch, SAVE_KEY } from '../src/progress.js';
import { FISH_BY_ID } from '../src/data.js';

function memory() {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('saves round-trip under the namespaced key', () => {
  const st = memory();
  const s = defaultSave();
  s.coins = 42;
  s.owned.rod.push('bamboo');
  s.equip.rod = 'bamboo';
  recordCatch(s, { fish: FISH_BY_ID.koi, cm: 50, kg: 3, coins: 10 });
  assert.equal(writeSave(st, s), true);
  assert.ok(st.data[SAVE_KEY]);
  assert.equal(SAVE_KEY, 'reel-rumble.v1');
  const back = loadSave(st);
  assert.deepEqual(back, s);
});

test('broken or hostile data falls back safely', () => {
  assert.deepEqual(loadSave(null), defaultSave());
  assert.deepEqual(loadSave({ getItem() { throw new Error('blocked'); } }), defaultSave());
  const st = memory();
  st.setItem(SAVE_KEY, '{not json');
  assert.deepEqual(loadSave(st), defaultSave());
  const s = sanitize({ coins: -5, owned: { rod: ['laser'], boat: 'canoe' }, equip: { rod: 'carbon' }, book: { nope: { n: 1 }, koi: { n: 'x' } }, clock: { day: 0, hour: 99 }, seen: ['koi', 'zzz'], medals: { a: 'platinum' } });
  assert.equal(s.coins, 0);
  assert.deepEqual(s.owned.rod, ['twig']);
  assert.equal(s.equip.rod, 'twig');
  assert.deepEqual(Object.keys(s.book), ['koi']);
  assert.equal(s.book.koi.n, 0);
  assert.deepEqual(s.seen, ['koi']);
  assert.equal(s.clock.hour < 24 && s.clock.day >= 1, true);
  assert.deepEqual(s.medals, {});
});

test('recording catches tracks new species and records', () => {
  const s = defaultSave();
  const a = recordCatch(s, { fish: FISH_BY_ID.bass, cm: 30, kg: 1, coins: 12 });
  assert.deepEqual(a, { newSpecies: true, newRecord: false });
  const b = recordCatch(s, { fish: FISH_BY_ID.bass, cm: 40, kg: 2, coins: 14 });
  assert.deepEqual(b, { newSpecies: false, newRecord: true });
  const c = recordCatch(s, { fish: FISH_BY_ID.bass, cm: 25, kg: 0.8, coins: 10 });
  assert.equal(c.newRecord, false);
  assert.deepEqual(s.book.bass, { n: 3, cm: 40, kg: 2 });
  assert.equal(s.coins, 36);
  assert.ok(s.seen.includes('bass'));
});

test('a damaged water name is dropped, even one like "toString"', () => {
  assert.equal(sanitize({ water: 'toString' }).water, 'pond');
  assert.equal(sanitize({ water: 'atlantis' }).water, 'pond');
  assert.equal(sanitize({ water: 'coral' }).water, 'coral');
});
