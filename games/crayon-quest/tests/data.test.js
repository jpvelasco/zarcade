import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD, CARDS, ENCOUNTERS, EVENTS, HEROES, MONSTER, MONSTERS, STICKER, STICKERS, cardDef, cardLines, needsTarget } from '../src/data.js';
import { iconNames } from '../src/art.js';

const icons = new Set(iconNames());

test('cards are unique, drawable and have an upgrade', () => {
  const ids = new Set();
  for (const c of CARDS) {
    assert.ok(!ids.has(c.id), `duplicate ${c.id}`);
    ids.add(c.id);
    assert.ok(['attack', 'skill', 'magic'].includes(c.kind), c.id);
    assert.ok(['starter', 'common', 'uncommon', 'rare'].includes(c.rarity), c.id);
    assert.ok(c.cost >= 0 && c.cost <= 3, c.id);
    assert.ok(icons.has(c.icon), `icon ${c.icon} for ${c.id}`);
    assert.ok(c.up && Object.keys(c.up).length, `${c.id} upgrade`);
    const base = cardDef({ id: c.id, up: false });
    const up = cardDef({ id: c.id, up: true });
    assert.ok(cardLines(base).length > 0, c.id);
    assert.notDeepEqual({ ...up, name: base.name }, base, `${c.id} upgrade changes something`);
    assert.ok(up.cost <= base.cost, `${c.id} upgrade never costs more`);
    if (c.hero) assert.ok(HEROES.some((h) => h.id === c.hero), c.id);
  }
});

test('targeting follows the card text', () => {
  assert.equal(needsTarget(CARD.scribble), true);
  assert.equal(needsTarget(CARD.rainbow_wave), false);
  assert.equal(needsTarget(CARD.doodle_shield), false);
  assert.equal(needsTarget(CARD.paint_splat), true);
  assert.equal(needsTarget(CARD.water_spill), false);
});

test('monsters, encounters and summons are valid', () => {
  for (const m of MONSTERS) {
    assert.ok(m.hp[0] > 0 && m.hp[1] >= m.hp[0], m.id);
    assert.ok(m.moves.length > 0, m.id);
    for (const mv of m.moves) {
      assert.ok(['atk', 'def', 'buff', 'debuff', 'atkdef', 'atkdebuff', 'summon'].includes(mv.t), `${m.id} ${mv.t}`);
      if (mv.t === 'summon') assert.ok(MONSTER[mv.id], `${m.id} summons ${mv.id}`);
      if (mv.t.startsWith('atk')) assert.ok(mv.dmg > 0, m.id);
    }
  }
  assert.equal(ENCOUNTERS.length, 3);
  ENCOUNTERS.forEach((floor, f) => {
    for (const group of [...floor.easy, ...floor.hard, ...floor.elite]) {
      assert.ok(group.length >= 1 && group.length <= 3);
      for (const id of group) assert.equal(MONSTER[id].floor, f, `${id} on floor ${f}`);
    }
    for (const id of floor.elite.flat()) assert.equal(MONSTER[id].role, 'elite');
    assert.equal(MONSTER[floor.boss[0]].role, 'boss');
  });
});

test('heroes have valid decks and stickers', () => {
  for (const h of HEROES) {
    const size = h.deck.reduce((n, [id, k]) => (assert.ok(CARD[id], id), n + k), 0);
    assert.equal(size, 10, h.id);
    assert.equal(STICKER[h.sticker].rarity, 'starter');
  }
});

test('stickers and events are well formed', () => {
  for (const s of STICKERS) {
    assert.ok(icons.has(s.icon), s.id);
    assert.ok(Object.keys(s.fx).length > 0);
  }
  const effects = new Set(['upgrade', 'gold', 'heal', 'maxhp', 'hurt', 'none', 'puddle', 'sticker', 'remove', 'vend', 'copy', 'fight']);
  for (const e of EVENTS) {
    assert.ok(icons.has(e.art), e.id);
    assert.ok(e.options.length >= 2);
    for (const o of e.options) assert.ok(effects.has(o.effect.split(':')[0]), `${e.id} ${o.effect}`);
  }
});
