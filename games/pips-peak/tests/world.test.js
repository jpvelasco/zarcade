import test from 'node:test';
import assert from 'node:assert/strict';
import { PETALS, World } from '../src/world.js';
import { TILE } from '../src/tiles.js';
import { findLevel, LEVELS } from '../src/levels.js';

const DT = 1 / 60;

/** A throwaway level built from strings, so each rule gets a tiny stage. */
function stage(tiles, extra = {}) {
  return new World({ id: 'stage', zone: 3, name: 'Stage', hint: '-', tiles, ...extra });
}

function place(world, col, row) {
  const p = world.player;
  p.x = col * TILE + (TILE - p.w) / 2;
  p.y = row * TILE + TILE - p.h;
  p.vx = 0;
  p.vy = 0;
}

function tick(world, steps, input = {}) {
  const seen = [];
  for (let i = 0; i < steps; i += 1) {
    world.step(DT, input);
    seen.push(...world.events);
    world.events.length = 0;
  }
  return seen;
}

test('a level knows its seeds, acorns, flowers and spawn', () => {
  const world = stage([
    '          ',
    ' S o @ f  ',
    '##########',
  ]);
  assert.equal(world.seedTotal, 1);
  assert.equal(world.acornTotal, 1);
  assert.equal(world.checkpoints.length, 1);
  assert.equal(world.spawn.col, 1);
  assert.equal(world.petals, PETALS);
  assert.equal(world.status, 'play');
});

test('running over a seed collects it exactly once', () => {
  const world = stage([
    '          ',
    ' S  o     ',
    '##########',
  ]);
  const events = tick(world, 90, { right: true });
  assert.equal(world.seedsTaken, 1);
  assert.equal(events.filter((e) => e.type === 'seed').length, 1);
});

test('a flower blooms, moves the respawn point and restores petals', () => {
  const world = stage([
    '          ',
    ' S    f   ',
    '##########',
  ]);
  world.petals = 1;
  tick(world, 120, { right: true });
  assert.equal(world.checkpoints[0].bloomed, true);
  assert.equal(world.respawn.col, 6);
  assert.equal(world.petals, PETALS);
});

test('thorns cost a petal and send Pip back to the last flower', () => {
  const world = stage([
    '           ',
    ' S  f    ^ ',
    '###########',
  ]);
  const events = tick(world, 200, { right: true });
  assert.equal(world.respawn.col, 4, 'the flower became the respawn point');
  assert.ok(events.some((e) => e.type === 'hurt' && e.cause === 'thorns'), 'thorns should hurt');
  assert.equal(world.petals, PETALS - 1);
});

test('falling out of the level costs a petal instead of ending the run', () => {
  const world = stage([
    '        ',
    ' S      ',
    '###     ',
  ]);
  const events = tick(world, 240, { right: true });
  assert.ok(events.some((e) => e.type === 'hurt' && e.cause === 'fall'));
  assert.equal(world.status, 'play');
});

test('losing the last petal wilts Pip but hands the petals back', () => {
  const world = stage([
    '        ',
    ' S    ^ ',
    '########',
  ]);
  world.petals = 1;
  const events = tick(world, 200, { right: true });
  assert.ok(events.some((e) => e.type === 'wilt'));
  assert.equal(world.petals, PETALS);
  assert.equal(world.status, 'play');
});

test('landing on a beetle pops it; walking into one hurts', () => {
  const stomped = stage([
    '          ',
    '          ',
    '   b      ',
    '##########',
  ]);
  place(stomped, 3, 0);
  stomped.player.vy = 200;
  let stomp = null;
  for (let i = 0; i < 40 && !stomp; i += 1) {
    stomped.step(DT, {});
    stomp = stomped.events.find((e) => e.type === 'stomp');
    stomped.events.length = 0;
  }
  assert.ok(stomp, 'a falling Pip should land on the beetle');
  assert.equal(stomped.enemies[0].alive, false);
  assert.ok(stomped.player.vy < 0, 'and bounces Pip upward');

  const bumped = stage([
    '          ',
    ' S b      ',
    '##########',
  ]);
  const hits = tick(bumped, 120, { right: true });
  assert.ok(hits.some((e) => e.type === 'hurt'));
});

test('a hurt ends the enemy pass, so no enemy is stomped by the old Pip', () => {
  const world = stage([
    '            ',
    ' S          ',
    '      bb    ',
    '############',
  ]);
  const p = world.player;
  const [side, under] = world.enemies;
  // Falling onto the second beetle, but the first one is already in Pip's face.
  p.x = under.x;
  p.y = under.y - p.h + 3;
  p.vy = 120;
  side.x = p.x;
  side.y = p.y;
  world.step(DT, {});
  const types = world.events.map((e) => e.type);
  assert.ok(types.includes('hurt'));
  assert.ok(!types.includes('stomp'), `unexpected events: ${types.join(', ')}`);
  assert.ok(world.enemies.every((e) => e.alive));
});

test('a crumbling block gives way shortly after Pip lands, then grows back', () => {
  const world = stage([
    '     ',
    '  S  ',
    '  C  ',
    '     ',
    '     ',
    '#####',
  ]);
  tick(world, 6);
  assert.equal(world.player.onGround, true);
  const block = world.crumbles.get('2,2');
  assert.equal(block.state, 'shaking');
  tick(world, 30);
  assert.equal(block.state, 'gone');
  assert.ok(world.player.y > 3 * TILE, 'Pip drops through the hole');
  tick(world, 240);
  assert.equal(block.state, 'idle', 'and it comes back for the next try');
});

test('pressing every latch opens the gates', () => {
  const world = stage([
    '          ',
    ' S ! D    ',
    '##########',
  ]);
  assert.equal(world.gatesOpen, false);
  assert.equal(world.tileAt(5, 1), 'D');
  const events = tick(world, 90, { right: true });
  assert.ok(events.some((e) => e.type === 'switch'));
  assert.ok(events.some((e) => e.type === 'gate'));
  assert.equal(world.gatesOpen, true);
  assert.equal(world.tileAt(5, 1), ' ');
});

test('touching the sunrise completes the level and scores stars', () => {
  const world = stage([
    '          ',
    ' S o @  G ',
    '##########',
  ]);
  tick(world, 200, { right: true });
  assert.equal(world.status, 'complete');
  const result = world.result();
  assert.equal(result.seeds, 1);
  assert.equal(result.acorns, 1);
  assert.equal(result.stars, 3);
  assert.ok(result.time > 0);
});

test('a moving platform carries Pip along with it', () => {
  const world = stage([
    '            ',
    '            ',
    '            ',
    '            ',
  ], { movers: [{ x: 1, y: 3, dx: 6, dy: 0, speed: 0.25, kind: 'stone', w: 3 }] });
  place(world, 2, 2);
  tick(world, 10);
  assert.equal(world.player.onGround, true, 'Pip should be standing on the platform');
  const startX = world.player.x;
  tick(world, 60);
  assert.ok(world.player.x - startX > 10, `carried along, moved ${world.player.x - startX}`);
  assert.equal(world.player.onGround, true);
});

test('wind pushes Pip sideways while he is in the air inside the gust', () => {
  const tiles = ['      ', '      ', '      ', '      ', '######'];
  const calm = stage(tiles);
  const windy = stage(tiles, { winds: [{ x: 0, y: 0, w: 6, h: 4, ax: 400, ay: 0 }] });
  for (const world of [calm, windy]) {
    place(world, 1, 3);
    tick(world, 4);
    tick(world, 16, { jump: true, jumpPressed: true });
  }
  assert.ok(windy.player.x > calm.player.x + 6, 'the gust should carry him along');
  assert.ok(windy.player.vx > 40, 'and give him sideways speed');
});

test('every real level builds, spawns Pip on the ground and is winnable in size', () => {
  for (const level of LEVELS) {
    const world = new World(level);
    tick(world, 12);
    assert.equal(world.status, 'play', `${level.id} should not end instantly`);
    assert.ok(world.player.onGround, `${level.id} does not drop Pip onto footing`);
    assert.equal(world.petals, PETALS, `${level.id} hurts Pip at the spawn`);
    assert.ok(world.seedTotal >= 12 && world.acornTotal === 3, level.id);
  }
});

test('the summit finale has every mechanic in it', () => {
  const finale = findLevel('summit-3');
  const world = new World(finale);
  assert.ok(world.movers.length > 0);
  assert.ok(world.winds.length > 0);
  assert.ok(world.crumbles.size > 0);
  assert.ok(world.enemies.length >= 3);
  assert.equal(world.abilities.wallJump, true);
});
