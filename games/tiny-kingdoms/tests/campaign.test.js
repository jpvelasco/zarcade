import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN, REGIONS, INTROS, campaignPlayers, heroFor, starsFor, goalText } from '../src/campaign.js';
import { simulate } from '../src/ai.js';
import { BUILDINGS, WORLD_W, WORLD_H, PERSONALITIES, DIFFICULTIES } from '../src/data.js';
import { LETTERS } from '../src/mapgen.js';

test('the campaign has 32 maps in four regions', () => {
  assert.equal(CAMPAIGN.length, 32);
  for (const r of REGIONS) assert.equal(CAMPAIGN.filter((l) => l.region === r.id).length, 8);
  assert.equal(new Set(CAMPAIGN.map((l) => l.name)).size, 32);
});

test('every map is valid: one capital each, in bounds, spaced out, labelled', () => {
  for (const lv of CAMPAIGN) {
    const { nodes } = lv.map;
    assert.ok(nodes.length <= LETTERS.length, `${lv.name} has too many buildings`);
    const owners = new Set(nodes.filter((n) => n.owner).map((n) => n.owner));
    assert.equal(owners.size, lv.rivals.length + 1, lv.name);
    for (const r of lv.rivals) {
      assert.ok(PERSONALITIES[r.personality], lv.name);
      assert.ok(DIFFICULTIES[r.difficulty], lv.name);
    }
    for (const n of nodes) {
      assert.ok(BUILDINGS[n.type], lv.name);
      assert.ok(n.x >= 60 && n.x <= WORLD_W - 60 && n.y >= 60 && n.y <= WORLD_H - 60, `${lv.name} out of bounds`);
      assert.ok(Number.isFinite(n.troops) && n.troops >= 0);
    }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      assert.ok(d >= BUILDINGS[nodes[i].type].r + BUILDINGS[nodes[j].type].r + 40, `${lv.name}: buildings ${i} and ${j} overlap`);
    }
    assert.equal(lv.goals.length, 2);
    if (lv.intro) assert.ok(INTROS[lv.intro], lv.intro);
  }
});

test('new building types are introduced gently', () => {
  const first = {};
  CAMPAIGN.forEach((lv, i) => { for (const t of lv.types) if (first[t] == null) first[t] = i + 1; });
  assert.equal(first.cottage, 1);
  assert.equal(first.mill, 3);
  assert.equal(first.tower, 6);
  assert.equal(first.forge, 10);
  assert.equal(first.shrine, 15);
  // Early maps: one easy rival.
  for (const lv of CAMPAIGN.slice(0, 7)) {
    assert.equal(lv.rivals.length, 1);
    assert.equal(lv.rivals[0].difficulty, 'easy');
  }
});

test('every campaign map is won by the reference bot against its rivals', () => {
  for (const lv of CAMPAIGN) {
    const hero = heroFor(lv.index);
    const players = { 1: { personality: 'reference', difficulty: 'hard' }, ...campaignPlayers(lv) };
    const w = simulate(lv.map, players, { maxTime: 900, heroes: hero ? { 1: hero } : {} });
    assert.equal(w.winner, 1, `map ${lv.index + 1} ${lv.name}: winner ${w.winner} at ${Math.round(w.time)}s`);
  }
});

test('the reference bot also wins with differently seeded rivals', () => {
  // Robustness: the maps are not won by one lucky roll.
  for (const lv of CAMPAIGN.filter((l, i) => i % 3 === 0)) {
    const hero = heroFor(lv.index);
    const players = { 1: { personality: 'reference', difficulty: 'hard' }, ...campaignPlayers(lv) };
    const w = simulate(lv.map, players, { maxTime: 900, heroes: hero ? { 1: hero } : {}, aiSeed: 303 });
    assert.equal(w.winner, 1, `map ${lv.index + 1} ${lv.name}`);
  }
});

test('par times are generous and stars count goals met', () => {
  for (const lv of CAMPAIGN) {
    for (const g of lv.goals) {
      if (g.type === 'time') assert.ok(g.value >= 150, lv.name);
      if (g.type === 'sends') assert.ok(g.value >= 8, lv.name);
      assert.ok(goalText(g).length > 4);
    }
  }
  const lv = CAMPAIGN[0];
  assert.equal(starsFor(lv, { won: false, time: 10, sends: 1, lost: 0 }).stars, 0);
  assert.equal(starsFor(lv, { won: true, time: 9999, sends: 999, lost: 3 }).stars, 1);
  assert.equal(starsFor(lv, { won: true, time: 10, sends: 1, lost: 0 }).stars, 3);
});
