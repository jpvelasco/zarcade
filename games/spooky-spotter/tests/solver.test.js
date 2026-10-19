import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScene, remaining } from '../src/scene.js';
import { buildDiff, diffRemaining } from '../src/modes.js';
import { sceneBox, ROOM_IDS } from '../src/rooms.js';
import { autoplay, autoplayDiff, Bot } from '../src/solver.js';

const BOX = sceneBox(1280, 760);

test('the solver clears a find round and says what it did', () => {
  const scene = buildScene({ room: 'library', mode: 'find', seed: 19, box: BOX });
  const report = autoplay(scene);
  assert.equal(report.solved, true);
  assert.equal(report.clicks, scene.targets.length);
  assert.equal(report.found.length, scene.targets.length);
  assert.deepEqual(report.wrong, []);
  assert.equal(remaining(scene), 0);
});

test('the solver notices when a thing cannot be reached', () => {
  const scene = buildScene({ room: 'kitchen', mode: 'find', seed: 4, box: BOX });
  // Blank out one target's visible patch and the solver must report it.
  const victim = scene.targets[1];
  victim.mask.bits.fill(0);
  const report = autoplay(scene);
  assert.equal(report.solved, false);
  assert.deepEqual(report.missed, [victim.id]);
});

test('the solver clears a difference round', () => {
  const diff = buildDiff({ room: 'attic', seed: 31, box: BOX });
  const report = autoplayDiff(diff);
  assert.equal(report.solved, true);
  assert.equal(report.found.length, diff.changes.length);
  assert.equal(diffRemaining(diff), 0);
});

test('the attract bot searches, then picks something up', () => {
  const scene = buildScene({ room: 'ballroom', mode: 'find', seed: 8, box: BOX });
  const bot = new Bot({ seed: 3, pace: 1 });
  let picked = 0;
  let frames = 0;
  while (frames < 2000) {
    frames++;
    const open = scene.targets.filter((t) => !t.found);
    if (!open.length) break;
    const click = bot.step(1 / 60, open);
    assert.ok(bot.look.x !== undefined);
    if (!click) continue;
    const hit = open.find((t) => Math.hypot(t.hit.x - click.x, t.hit.y - click.y) < 1);
    assert.ok(hit, 'the bot should click something real');
    hit.found = true;
    picked++;
  }
  assert.equal(picked, scene.targets.length);
  assert.ok(frames > 60, 'it should take a moment, not happen all at once');
  assert.equal(bot.step(1 / 60, []), null);
});

test('the solver agrees with every room at a glance', () => {
  for (const room of ROOM_IDS) {
    assert.equal(autoplay(buildScene({ room, mode: 'find', seed: 55, box: BOX })).solved, true, room);
    assert.equal(autoplay(buildScene({ room, mode: 'hunt', seed: 55, box: BOX })).solved, true, room);
    assert.equal(autoplayDiff(buildDiff({ room, seed: 55, box: BOX })).solved, true, room);
  }
});
