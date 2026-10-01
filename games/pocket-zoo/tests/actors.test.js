import test from 'node:test';
import assert from 'node:assert/strict';
import { Actors, roamBox, targetVisitors, MAX_VISITORS } from '../src/actors.js';
import { Zoo, newState } from '../src/zoo.js';

function zooWithAnimals() {
  const zoo = new Zoo(newState(3));
  zoo.state.coins = 1e9;
  for (let n = 0; n < 6; n++) zoo.buyEgg(0);
  zoo.build(1);
  return zoo;
}

test('animals roam inside their habitat', () => {
  const zoo = zooWithAnimals();
  const actors = new Actors(1);
  actors.sync(zoo);
  assert.equal(actors.animals.size, zoo.state.habitats.reduce((n, h) => n + h.animals.length, 0));
  for (let t = 0; t < 600; t++) {
    actors.update(0.1, zoo);
    for (const a of actors.animals.values()) {
      const b = roamBox(a.habitat);
      assert.ok(a.x >= b.x0 - 0.01 && a.x <= b.x1 + 0.01 && a.y >= b.y0 - 0.01 && a.y <= b.y1 + 0.01);
    }
  }
});

test('visitors arrive, watch habitats, pop coins and leave', () => {
  const zoo = zooWithAnimals();
  const actors = new Actors(2);
  actors.sync(zoo);
  let views = 0;
  let coins = 0;
  for (let t = 0; t < 3000; t++) {
    zoo.tick(0.1);
    actors.update(0.1, zoo);
    for (const e of actors.events) if (e.type === 'view') { views++; coins += e.amount; }
  }
  assert.ok(views > 10, `views ${views}`);
  assert.ok(coins > 0);
  assert.ok(zoo.state.stats.visitors > 3, 'some visitors went home');
  assert.ok(actors.visitors.length <= MAX_VISITORS);
});

test('petting has a cooldown for Joy but always reacts', () => {
  const zoo = zooWithAnimals();
  const actors = new Actors(4);
  actors.sync(zoo);
  const id = zoo.habitat(0).animals[0];
  assert.equal(actors.pet(id), true);
  assert.equal(actors.pet(id), false);
  assert.ok(actors.animals.get(id).petT > 0);
  actors.update(2, zoo);
  assert.equal(actors.pet(id), true);
});

test('visitor counts scale with income and stay capped', () => {
  assert.equal(targetVisitors(0), 0);
  assert.ok(targetVisitors(1) >= 3);
  assert.ok(targetVisitors(100) > targetVisitors(1));
  assert.equal(targetVisitors(1e12), MAX_VISITORS);
});

test('a golden balloon visitor turns up now and then', () => {
  const zoo = zooWithAnimals();
  const actors = new Actors(6);
  actors.sync(zoo);
  let seen = false;
  for (let t = 0; t < 1500 && !seen; t++) {
    zoo.tick(0.1);
    actors.update(0.1, zoo);
    const g = actors.visitors.find((v) => v.golden);
    if (g) {
      seen = true;
      assert.equal(actors.goldenAt(g.x, g.y - 40), g);
    }
  }
  assert.ok(seen);
});
