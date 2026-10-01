import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/world.js';
import { newGame } from '../src/save.js';
import { allAreas } from '../src/areas.js';
import { runAutopilot } from '../src/ai.js';

test('the autopilot clears Mossy Burrow from the entrance with the starting gear', () => {
  const areas = allAreas();
  const save = newGame();
  save.respawn = { area: 'burrow', x: areas.burrow.start.x, y: areas.burrow.start.y };
  const g = new Game(save, { seed: 11 });
  const { t } = runAutopilot(g, { seconds: 400, done: (game) => game.save.shards.includes('burrow') && game.area.id === 'overworld' });
  assert.deepEqual(save.shards, ['burrow'], `finished in ${t.toFixed(0)} s`);
  assert.ok(save.items.boomerang);
  assert.equal(save.maxHearts, 4);
  assert.ok(t < 300, `took ${t.toFixed(0)} s`);
});

test('the autopilot also clears the Sunken Bell Temple once it has the leafarang', () => {
  const areas = allAreas();
  const save = newGame();
  save.items.boomerang = true;
  save.respawn = { area: 'temple', x: areas.temple.start.x, y: areas.temple.start.y };
  const g = new Game(save, { seed: 4 });
  runAutopilot(g, { seconds: 500, done: (game) => game.save.shards.includes('temple') && game.area.id === 'overworld' });
  assert.deepEqual(save.shards, ['temple']);
});
