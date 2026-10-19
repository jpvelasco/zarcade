import test from 'node:test';
import assert from 'node:assert/strict';
import { PHYS, createPlayer, stepPlayer } from '../src/physics.js';
import { TILE } from '../src/tiles.js';

const DT = 1 / 60;

/** A tiny terrain out of strings; anything off the grid is open air. */
function terrainOf(rows) {
  return {
    tileAt(col, row) {
      if (row < 0 || row >= rows.length || col < 0 || col >= rows[0].length) return ' ';
      return rows[row][col];
    },
  };
}

function settle(p, terrain, opts) {
  for (let i = 0; i < 6; i += 1) stepPlayer(p, {}, terrain, DT, opts);
}

function run(p, terrain, input, steps, opts = {}) {
  const out = [];
  for (let i = 0; i < steps; i += 1) out.push(stepPlayer(p, input, terrain, DT, opts));
  return out;
}

test('Pip accelerates to a top speed and stops again', () => {
  const terrain = terrainOf(['              ', '              ', '##############']);
  const p = createPlayer(8, 2 * TILE);
  settle(p, terrain);
  run(p, terrain, { right: true }, 60);
  assert.ok(p.vx > PHYS.runMax * 0.97, `expected top speed, got ${p.vx}`);
  assert.ok(p.vx <= PHYS.runMax + 0.001);
  run(p, terrain, {}, 12);
  assert.equal(p.vx, 0);
});

test('turning around is quicker than starting from a standstill', () => {
  const terrain = terrainOf(['              ', '              ', '##############']);
  const p = createPlayer(8, 2 * TILE);
  settle(p, terrain);
  run(p, terrain, { right: true }, 60);
  const turning = [];
  for (let i = 0; i < 6; i += 1) {
    stepPlayer(p, { left: true }, terrain, DT, {});
    turning.push(p.vx);
  }
  const delta = Math.abs(turning[1] - turning[0]);
  assert.ok(delta > PHYS.runAccel * DT, 'a turn should get the pivot bonus');
});

test('coyote time lets a jump land just after the ledge', () => {
  const terrain = terrainOf(['      ', '      ', '###   ']);
  const p = createPlayer(8, 2 * TILE);
  settle(p, terrain);
  let steps = 0;
  while (p.onGround && steps < 240) {
    stepPlayer(p, { right: true }, terrain, DT, {});
    steps += 1;
  }
  assert.equal(p.onGround, false);
  assert.ok(p.coyote > 0 && p.coyote <= PHYS.coyote);
  stepPlayer(p, { right: true, jump: true, jumpPressed: true }, terrain, DT, {});
  assert.ok(p.vy < -300, `expected a jump, vy=${p.vy}`);
});

test('coyote time runs out, so a late press is not a free jump', () => {
  const terrain = terrainOf(['      ', '      ', '###   ']);
  const p = createPlayer(8, 2 * TILE);
  settle(p, terrain);
  while (p.onGround) stepPlayer(p, { right: true }, terrain, DT, {});
  run(p, terrain, { right: true }, Math.ceil(PHYS.coyote / DT) + 4);
  const before = p.vy;
  stepPlayer(p, { right: true, jump: true, jumpPressed: true }, terrain, DT, {});
  assert.ok(p.vy > before - 1, 'no jump once coyote time has expired');
});

test('a jump pressed just before landing is buffered', () => {
  const terrain = terrainOf(['      ', '      ', '      ', '######']);
  const p = createPlayer(8, 0);
  let pressed = false;
  let jumped = false;
  for (let i = 0; i < 120; i += 1) {
    const nearFloor = 3 * TILE - (p.y + p.h) < 26;
    const press = nearFloor && !pressed;
    if (press) pressed = true;
    const out = stepPlayer(p, { jump: pressed, jumpPressed: press }, terrain, DT, {});
    if (out.jumped === 'ground') {
      jumped = true;
      break;
    }
  }
  assert.ok(pressed, 'the test should have pressed jump in the air');
  assert.ok(jumped, 'the buffered press should fire on landing');
});

test('letting go of jump early gives a lower hop', () => {
  const terrain = terrainOf(['              ', '              ', '              ', '##############']);
  const apex = (holdFrames) => {
    const p = createPlayer(8, 3 * TILE);
    settle(p, terrain);
    stepPlayer(p, { jump: true, jumpPressed: true }, terrain, DT, {});
    let top = p.y;
    for (let i = 0; i < 90; i += 1) {
      stepPlayer(p, { jump: i < holdFrames }, terrain, DT, {});
      top = Math.min(top, p.y);
    }
    return 3 * TILE - p.h - top;
  };
  const tall = apex(60);
  const short = apex(2);
  assert.ok(tall > short + 8, `hold=${tall} tap=${short}`);
  assert.ok(tall > 44 && tall < 64, `a full jump clears three tiles: ${tall}`);
  assert.ok(short > 12, 'even a tap should leave the ground properly');
});

test('a double jump only works once the ability is unlocked', () => {
  const terrain = terrainOf(['              ', '              ', '              ', '##############']);
  const secondHop = (abilities) => {
    const p = createPlayer(8, 3 * TILE);
    settle(p, terrain, { abilities });
    stepPlayer(p, { jump: true, jumpPressed: true }, terrain, DT, { abilities });
    run(p, terrain, { jump: true }, 20, { abilities });
    const before = p.vy;
    stepPlayer(p, { jump: true, jumpPressed: true }, terrain, DT, { abilities });
    return before - p.vy;
  };
  assert.ok(secondHop({ doubleJump: true }) > 200, 'the second hop should push upward');
  assert.ok(secondHop({}) < 0, 'without the ability nothing happens');
});

test('a wall slide caps the fall and kicks off sideways', () => {
  const terrain = terrainOf([
    '    #',
    '    #',
    '    #',
    '    #',
    '#####',
  ]);
  const abilities = { doubleJump: true, wallJump: true };
  const p = createPlayer(8, 4 * TILE);
  settle(p, terrain, { abilities });
  run(p, terrain, { right: true }, 60, { abilities }); // walk up against the wall
  assert.equal(p.x + p.w, 4 * TILE);
  stepPlayer(p, { right: true, jump: true, jumpPressed: true }, terrain, DT, { abilities });
  let sliding = false;
  for (let i = 0; i < 90 && !sliding; i += 1) {
    stepPlayer(p, { right: true }, terrain, DT, { abilities });
    sliding = p.wallSlide;
  }
  assert.ok(sliding, 'Pip should catch the wall');
  assert.ok(p.vy <= PHYS.wallSlideMax + 1, `slide is capped, vy=${p.vy}`);
  stepPlayer(p, { right: true, jump: true, jumpPressed: true }, terrain, DT, { abilities });
  assert.ok(p.vy < -300, 'the kick goes up');
  assert.ok(p.vx < -100, 'and away from the wall');
});

test('kicks chain up a chimney, even when leaning away from the wall', () => {
  // A three-tile-wide chimney: walls at column 0 and column 4.
  const rows = [];
  for (let i = 0; i < 24; i += 1) rows.push('#   #');
  rows.push('#####');
  const terrain = terrainOf(rows);
  const abilities = { doubleJump: false, wallJump: true };
  const p = createPlayer(2 * TILE + 8, 24 * TILE);
  settle(p, terrain, { abilities });
  const floor = p.y;
  let highest = p.y;
  let dir = 1;
  let held = false;
  for (let i = 0; i < 600; i += 1) {
    let press = false;
    if (p.onGround) press = true;
    else if (p.wallSlide) {
      press = true;
      dir = -p.wallDir; // lean away as we kick, like a player would
    }
    if (press) held = true;
    if (p.vy > 0) held = false;
    stepPlayer(p, { left: dir < 0, right: dir > 0, jump: held, jumpPressed: press }, terrain, DT, { abilities });
    highest = Math.min(highest, p.y);
  }
  const climbed = (floor - highest) / TILE;
  assert.ok(climbed > 8, `expected to climb the chimney, got ${climbed.toFixed(1)} tiles`);
});

test('a wall beside a ground jump does not add a kick on the way up', () => {
  const rows = [];
  for (let i = 0; i < 20; i += 1) rows.push('#      ');
  rows.push('#######');
  const terrain = terrainOf(rows);
  const abilities = { doubleJump: true, wallJump: true };
  const p = createPlayer(TILE + PHYS.width / 2 + 1, 20 * TILE);
  settle(p, terrain, { abilities });
  assert.equal(p.onGround, true);
  const jumps = [];
  for (let i = 0; i < 12; i += 1) {
    const result = stepPlayer(p, { jump: true, jumpPressed: i === 0 || i === 6 }, terrain, DT, { abilities });
    if (result.jumped) jumps.push(result.jumped);
  }
  assert.deepEqual(jumps, ['ground', 'double']);
});

test('one-way planks catch a fall but let Pip rise through', () => {
  const terrain = terrainOf(['     ', '     ', '-----', '     ', '#####']);
  const dropped = createPlayer(8, 0);
  for (let i = 0; i < 60; i += 1) stepPlayer(dropped, {}, terrain, DT, {});
  assert.equal(dropped.onGround, true);
  assert.equal(dropped.y + dropped.h, 2 * TILE);

  const below = createPlayer(8, 4 * TILE);
  settle(below, terrain);
  stepPlayer(below, { jump: true, jumpPressed: true }, terrain, DT, {});
  let rose = false;
  for (let i = 0; i < 40; i += 1) {
    stepPlayer(below, { jump: true }, terrain, DT, {});
    if (below.y + below.h < 2 * TILE) rose = true;
  }
  assert.ok(rose, 'planks are not a ceiling');
});

test('holding down and jumping drops through a plank', () => {
  const terrain = terrainOf(['     ', '     ', '-----', '     ', '#####']);
  const p = createPlayer(8, 2 * TILE);
  settle(p, terrain);
  assert.equal(p.onGround, true);
  stepPlayer(p, { down: true, jump: true, jumpPressed: true }, terrain, DT, {});
  for (let i = 0; i < 40; i += 1) stepPlayer(p, { down: true }, terrain, DT, {});
  assert.equal(p.y + p.h, 4 * TILE, 'Pip should end up on the floor below');
});

test('a drop press steps off a plank on its own but does nothing on solid ground', () => {
  const terrain = terrainOf(['     ', '     ', '-----', '     ', '#####']);
  const p = createPlayer(8, 2 * TILE);
  settle(p, terrain);
  stepPlayer(p, { down: true, dropPressed: true }, terrain, DT, {});
  for (let i = 0; i < 40; i += 1) stepPlayer(p, { down: true }, terrain, DT, {});
  assert.equal(p.y + p.h, 4 * TILE, 'Pip should end up on the floor below');
  const y = p.y;
  stepPlayer(p, { down: true, dropPressed: true }, terrain, DT, {});
  for (let i = 0; i < 20; i += 1) stepPlayer(p, {}, terrain, DT, {});
  assert.equal(p.y, y, 'solid ground is not a plank');
  assert.equal(p.onGround, true);
});

test('ice keeps its speed much longer than grass', () => {
  const stopFrames = (surface) => {
    const terrain = terrainOf(['              ', '              ', surface.repeat(14)]);
    const p = createPlayer(8, 2 * TILE);
    settle(p, terrain);
    run(p, terrain, { right: true }, 60);
    let frames = 0;
    while (p.vx > 1 && frames < 600) {
      stepPlayer(p, {}, terrain, DT, {});
      frames += 1;
    }
    return frames;
  };
  assert.ok(stopFrames('I') > stopFrames('#') * 4, 'ice should be properly slippery');
});

test('a mushroom launches Pip far higher than a jump', () => {
  const terrain = terrainOf(['              ', '              ', '              ', '              ', '######M#######']);
  const p = createPlayer(6 * TILE + 8, 4 * TILE);
  let top = p.y;
  let bounced = false;
  for (let i = 0; i < 200; i += 1) {
    const out = stepPlayer(p, {}, terrain, DT, {});
    if (out.bounced) bounced = true;
    top = Math.min(top, p.y);
  }
  assert.ok(bounced, 'landing on a mushroom should bounce');
  assert.ok(4 * TILE - p.h - top > 100, 'and launch well over six tiles');
});
