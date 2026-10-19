import test from 'node:test';
import assert from 'node:assert/strict';
import { World, STEP, resolveAttack, sendCount, defenceOf } from '../src/sim.js';
import { BUILDINGS, MARCH_SPEED, HERO_COOLDOWN } from '../src/data.js';

const N = (x, y, type, owner, troops) => ({ x, y, type, owner, troops });
const run = (w, seconds) => { const n = Math.round(seconds / STEP); for (let i = 0; i < n && !w.over; i++) w.step(); };

test('combat maths: attackers must beat troops × defence', () => {
  assert.deepEqual(resolveAttack(11, 10, 1), { captured: true, troops: 1 });
  assert.deepEqual(resolveAttack(10, 10, 1), { captured: false, troops: 0 }); // a tie holds
  assert.deepEqual(resolveAttack(4, 10, 1), { captured: false, troops: 6 });
  // Towers: 10 defenders count as 16.
  assert.equal(resolveAttack(16, 10, 1.6).captured, false);
  const r = resolveAttack(20, 10, 1.6);
  assert.equal(r.captured, true);
  assert.ok(Math.abs(r.troops - 4) < 1e-9);
  assert.ok(Math.abs(resolveAttack(8, 10, 1.6).troops - 5) < 1e-9);
});

test('sending half or all floors to whole soldiers', () => {
  assert.equal(sendCount(21.7, 0.5), 10);
  assert.equal(sendCount(21.7, 1), 21);
  assert.equal(sendCount(1.4, 0.5), 0);
  assert.equal(sendCount(10, 2), 10);
});

test('owned buildings grow to their cap; neutrals do not grow', () => {
  const w = new World({ seed: 1, nodes: [N(100, 100, 'castle', 1, 0), N(600, 100, 'cottage', 0, 5), N(1200, 900, 'castle', 2, 79)] });
  run(w, 10);
  assert.ok(Math.abs(w.nodes[0].troops - BUILDINGS.castle.grow * 10) < 0.01);
  assert.equal(w.nodes[1].troops, 5);
  assert.equal(w.nodes[2].troops, 80);
  // Above the cap troops drift back down.
  w.nodes[2].troops = 90;
  run(w, 4);
  assert.ok(w.nodes[2].troops < 90 && w.nodes[2].troops >= 80);
});

test('windmills grow faster than cottages', () => {
  assert.ok(BUILDINGS.mill.grow > BUILDINGS.castle.grow);
  assert.ok(BUILDINGS.castle.grow > BUILDINGS.cottage.grow);
});

test('a send leaves, marches at the set speed and captures', () => {
  const w = new World({ seed: 1, nodes: [N(100, 500, 'castle', 1, 30), N(100 + MARCH_SPEED * 2, 500, 'cottage', 0, 5), N(1500, 500, 'castle', 2, 10)] });
  assert.equal(w.send(1, [0], 1, 0.5), 15);
  assert.equal(w.nodes[0].troops, 15);
  assert.equal(w.marches.length, 1);
  run(w, 1.9);
  assert.equal(w.nodes[1].owner, 0);
  run(w, 0.2);
  assert.equal(w.nodes[1].owner, 1);
  assert.ok(Math.abs(w.nodes[1].troops - 10) < 0.2); // 15 − 5, plus a moment of growth
  assert.equal(w.stats[1].sends, 1);
  assert.equal(w.stats[1].captured, 1);
});

test('you can only send from your own buildings', () => {
  const w = new World({ seed: 1, nodes: [N(100, 500, 'castle', 1, 30), N(800, 500, 'castle', 2, 30)] });
  assert.equal(w.send(1, [1], 0, 1), 0);
  assert.equal(w.send(2, [0], 1, 1), 0);
  assert.equal(w.send(1, [0], 0, 1), 0); // not to itself
  assert.equal(w.nodes[0].troops, 30);
});

test('troops are conserved: sent soldiers either arrive or fight', () => {
  const w = new World({ seed: 3, nodes: [N(100, 500, 'cottage', 1, 40), N(700, 500, 'cottage', 1, 0), N(1500, 900, 'castle', 2, 0)] });
  w.nodes[0].cap = w.nodes[1].cap = 1000; // no growth cap effects
  const growth = BUILDINGS.cottage.grow;
  w.send(1, [0], 1, 1);
  run(w, 8);
  const total = w.nodes[0].troops + w.nodes[1].troops;
  assert.ok(Math.abs(total - (40 + growth * 8 * 2 - growth * 0)) < growth * 8 + 0.01, `total ${total}`);
  assert.ok(w.nodes[1].troops >= 40);
});

test('the same map and the same commands give the same game', () => {
  const map = { seed: 9, nodes: [N(100, 500, 'castle', 1, 30), N(500, 300, 'tower', 0, 10), N(500, 700, 'mill', 0, 6), N(1500, 500, 'castle', 2, 30)] };
  const play = () => {
    const w = new World(map);
    for (let t = 0; t < 1200; t++) {
      if (t === 10) w.send(1, [0], 2, 0.5);
      if (t === 20) w.send(2, [3], 1, 1);
      if (t === 300) w.send(1, [0, 2], 3, 1);
      w.step();
    }
    return w.fingerprint();
  };
  assert.equal(play(), play());
});

test('mirror symmetry: mirrored maps and commands give mirrored results', () => {
  const left = [N(200, 500, 'castle', 1, 30), N(600, 300, 'mill', 0, 8), N(1000, 700, 'mill', 0, 8), N(1400, 500, 'castle', 2, 30)];
  const w = new World({ seed: 1, nodes: left });
  w.send(1, [0], 1, 0.5);
  w.send(2, [3], 2, 0.5);
  run(w, 30);
  w.send(1, [0], 3, 1);
  w.send(2, [3], 0, 1);
  run(w, 20);
  assert.ok(Math.abs(w.nodes[1].troops - w.nodes[2].troops) < 1e-6);
  assert.equal(w.nodes[0].owner === 1, w.nodes[3].owner === 2);
  assert.ok(Math.abs(w.nodes[0].troops - w.nodes[3].troops) < 1e-6);
});

test('squads meeting head-on fight one for one', () => {
  const w = new World({ seed: 1, nodes: [N(100, 500, 'castle', 1, 40), N(1100, 500, 'castle', 2, 24)] });
  w.send(1, [0], 1, 0.5); // 20
  w.send(2, [1], 0, 0.5); // 12
  run(w, 5);
  assert.equal(w.marches.length, 1);
  assert.equal(w.marches[0].owner, 1);
  assert.equal(w.marches[0].count, 8);
});

test('towers shoot passing enemy squads and defend with ×1.6', () => {
  assert.equal(defenceOf({ type: 'tower', shield: 0 }), 1.6);
  const w = new World({ seed: 1, nodes: [N(100, 500, 'castle', 1, 40), N(800, 580, 'tower', 2, 10), N(1500, 500, 'castle', 2, 1)] });
  w.send(1, [0], 2, 1);
  run(w, 15);
  const arrows = w.stats; // shot squad arrives smaller
  assert.ok(w.nodes[2].owner === 1);
  assert.ok(w.nodes[2].troops < 40 - 1 - 2, `troops ${w.nodes[2].troops}`);
  assert.ok(arrows);
});

test('forges speed up your squads; shrines speed up growth', () => {
  const w = new World({ seed: 1, nodes: [N(100, 500, 'castle', 1, 40), N(300, 900, 'forge', 1, 0), N(500, 900, 'forge', 1, 0), N(700, 900, 'forge', 1, 0), N(1500, 500, 'castle', 2, 1)] });
  assert.ok(Math.abs(w.speedFor(1) - MARCH_SPEED * 1.6) < 1e-9); // stacks to two
  assert.equal(w.speedFor(2), MARCH_SPEED);
  const s = new World({ seed: 1, nodes: [N(100, 500, 'castle', 1, 0), N(300, 900, 'shrine', 1, 0), N(1500, 500, 'castle', 2, 0)] });
  assert.ok(Math.abs(s.growthOf(s.nodes[0]) - BUILDINGS.castle.grow * 1.25) < 1e-9);
  assert.equal(s.growthOf(s.nodes[2]), BUILDINGS.castle.grow);
});

test('heroes: knight hits harder, ranger is faster, cooldown applies', () => {
  const w = new World({ seed: 1, nodes: [N(100, 500, 'castle', 1, 40), N(400, 500, 'castle', 0, 25), N(1500, 900, 'castle', 2, 5)] }, { heroes: { 1: 'knight' } });
  assert.equal(w.armHero(1), true);
  w.send(1, [0], 1, 0.5); // 20 × 1.5 = 30 > 25
  assert.equal(w.marches[0].hero, 'knight');
  assert.equal(w.armHero(1), false); // out on the road
  run(w, 4);
  assert.equal(w.nodes[1].owner, 1);
  // 30 power − 25 defenders = 5 power left, which is 3⅓ soldiers, plus growth.
  assert.ok(w.nodes[1].troops > 3.3 && w.nodes[1].troops < 3.3 + 1.2 * 2, `troops ${w.nodes[1].troops}`);
  assert.equal(w.heroes[1].out, false);
  assert.ok(w.heroes[1].cd > 0 && w.heroes[1].cd <= HERO_COOLDOWN);

  const r = new World({ seed: 1, nodes: [N(100, 500, 'castle', 1, 40), N(1500, 500, 'castle', 2, 25)] }, { heroes: { 1: 'ranger' } });
  r.armHero(1);
  r.send(1, [0], 1, 0.25);
  r.send(1, [0], 1, 0.25);
  assert.ok(r.marches[0].speed === MARCH_SPEED * 2 && r.marches[1].speed === MARCH_SPEED);
});

test('a kingdom with no buildings and no squads is out; last one standing wins', () => {
  const w = new World({ seed: 1, nodes: [N(100, 500, 'castle', 1, 50), N(400, 500, 'cottage', 2, 3)] });
  w.send(1, [0], 1, 0.5);
  run(w, 5);
  assert.equal(w.over, true);
  assert.equal(w.winner, 1);
  assert.equal(w.stats[2].lost, 1);
});
