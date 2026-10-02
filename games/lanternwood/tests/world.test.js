import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STEP, RACE_TIME, nightAmount } from '../src/world.js';
import { newGame } from '../src/save.js';
import { allAreas, F } from '../src/areas.js';
import { TILE, ROOM_W, ROOM_H, tileDef } from '../src/tiles.js';

const areas = allAreas();
const run = (g, seconds, ctl = {}) => { for (let t = 0; t < seconds; t += STEP) g.step(STEP, typeof ctl === 'function' ? ctl(g) : ctl); };
const tap = (g, ctl) => { g.step(STEP, ctl); g.step(STEP, {}); };
const place = (g, tx, ty, face = { x: 0, y: 1 }) => { g.player.x = tx * TILE + 8; g.player.y = ty * TILE + 8; g.player.face = face; };
// Global tile from screen/room + local coords.
const at = (rx, ry, x, y) => [rx * ROOM_W + x, ry * ROOM_H + y];
function game(area = 'overworld', tx, ty, edit = () => {}) {
  const s = newGame();
  edit(s);
  if (area !== 'overworld' || tx !== undefined) s.respawn = { area, x: tx ?? areas[area].start.x, y: ty ?? areas[area].start.y };
  return new Game(s, { seed: 5 });
}

test('a new game starts on Wren\'s Lane in the daytime with sword and lantern', () => {
  const g = game();
  assert.equal(g.area.id, 'overworld');
  assert.equal(g.room.key, '1,3');
  assert.ok(g.save.items.sword && g.save.items.lantern);
  assert.ok(nightAmount(g.save.time) < 0.2);
  assert.ok(nightAmount(0) > 0.9, 'midnight is dark');
});

test('walking moves smoothly, diagonals are not faster', () => {
  const g = game();
  const x0 = g.player.x, y0 = g.player.y;
  run(g, 0.5, { x: 1, y: 0 });
  const straight = g.player.x - x0;
  assert.ok(straight > 30 && straight < 50, `moved ${straight}`);
  const g2 = game();
  run(g2, 0.5, { x: 1, y: 1 });
  const diag = Math.hypot(g2.player.x - x0, g2.player.y - y0);
  assert.ok(Math.abs(diag - straight) < 3, `diagonal ${diag} vs ${straight}`);
});

test('the sword cuts tall grass, which grows back when you return', () => {
  const [tx, ty] = at(1, 3, 1, 2); // tall grass at local (1..2, 1..2)
  const g = game('overworld', tx + 1, ty + 1);
  place(g, tx + 1, ty + 1, { x: 0, y: -1 });
  const idx = (ty) * g.area.w + tx + 1;
  assert.ok(tileDef(g.grid[idx]).grass);
  tap(g, { attack: true });
  run(g, 0.3);
  assert.ok(!tileDef(g.grid[idx]).grass, 'cut');
  g.enterRoom('1,3');
  assert.ok(tileDef(g.grid[idx]).grass, 'grew back');
});

test('crossing a screen edge slides the camera to the next screen', () => {
  const [tx, ty] = at(1, 3, 10, 1);
  const g = game('overworld', tx, ty);
  run(g, 0.4, { x: 0, y: -1 });
  assert.ok(g.transition && g.transition.kind === 'slide');
  run(g, 0.7);
  assert.equal(g.room.key, '1,2');
  assert.ok(g.save.discovered.overworld.includes('1,2'));
});

test('talking to Grandma Wick starts the main quest and offers the lamp quest', () => {
  const [tx, ty] = at(1, 2, 12, 5);
  const g = game('overworld', tx, ty);
  place(g, tx, ty, { x: 0, y: -1 });
  tap(g, { interact: true });
  assert.equal(g.mode, 'talk');
  assert.equal(g.talk.npc, 'wick');
  while (!g.talkNode.choices) g.talkNext();
  assert.equal(g.save.quests.main.stage, 1);
  g.talkChoose(0);
  assert.equal(g.save.quests.lamps.stage, 0);
  g.talkNext();
  assert.equal(g.mode, 'play');
});

test('nobody to talk to: Tumble the fox gives a hint', () => {
  const g = game();
  tap(g, { interact: true });
  assert.equal(g.talk.npc, 'tumble');
  assert.match(g.talkNode.text, /Grandma Wick/);
});

test('lighting a lamp post with a lantern flame counts toward Light the Way', () => {
  const [tx, ty] = at(2, 3, 16, 5); // the meadow lamp is at local (16,4)
  const g = game('overworld', tx, ty);
  place(g, tx, ty + 2, { x: 0, y: -1 });
  g.save.equipped = 'lantern';
  tap(g, { item: true });
  run(g, 0.5);
  assert.ok(g.flag(F.lamp((4 + 36) * g.area.w + 56)));
  assert.equal(g.save.quests.lamps.count, 1);
});

test('the leafarang bonks the drawbridge switch across the river', () => {
  const [tx, ty] = at(3, 2, 3, 3);
  const g = game('overworld', tx, ty, (s) => { s.items.boomerang = true; s.equipped = 'boomerang'; });
  place(g, tx, ty, { x: 1, y: 0 });
  const bridge = (24 + 5) * g.area.w + 60 + 5;
  assert.equal(String.fromCharCode(g.grid[bridge]), 'w');
  tap(g, { item: true });
  run(g, 1.2);
  assert.ok(g.flag(F.solved('overworld', '3,2')));
  assert.equal(String.fromCharCode(g.grid[bridge]), '=');
});

test('vine seeds zip Wren across the chasm', () => {
  const [tx, ty] = at(1, 1, 9, 5);
  const g = game('overworld', tx, ty, (s) => { s.items.grapple = true; s.equipped = 'grapple'; });
  place(g, tx, ty, { x: 0, y: -1 });
  tap(g, { item: true });
  run(g, 1);
  assert.equal(Math.floor(g.player.y / TILE), 12 + 2, 'landed on the north ledge');
});

test('a small key opens a locked door and is used up', () => {
  const area = areas.burrow;
  const [tx, ty] = at(1, 1, 17, 5);
  const g = game('burrow', tx, ty, (s) => { s.keys.burrow = 1; });
  g.enemies = [];
  run(g, 0.6, { x: 1, y: 0 });
  assert.ok(g.flag(F.link('burrow:1,1:e')));
  assert.equal(g.save.keys.burrow, 0);
  assert.equal(String.fromCharCode(g.grid[(12 + 5) * area.w + 39]), '.');
});

test('locked doors stay shut without a key', () => {
  const [tx, ty] = at(1, 1, 17, 5);
  const g = game('burrow', tx, ty);
  g.enemies = [];
  run(g, 0.6, { x: 1, y: 0 });
  assert.ok(!g.flag(F.link('burrow:1,1:e')));
  assert.match(g.toast.text, /key/);
});

test('pushing the block onto the plate opens the shutter', () => {
  // Pebble Push: block at local (9,8); push it north three times, then west twice.
  const [bx, by] = at(0, 1, 9, 8);
  const g = game('burrow', bx, by + 1);
  g.enemies = [];
  const push = (dx, dy) => { for (let i = 0; i < 40 && !g.blocks[0].move; i++) g.step(STEP, { x: dx, y: dy }); run(g, 0.3); };
  for (let i = 0; i < 3; i++) { place(g, g.blocks[0].tx, g.blocks[0].ty + 1, { x: 0, y: -1 }); push(0, -1); }
  for (let i = 0; i < 2; i++) { place(g, g.blocks[0].tx + 1, g.blocks[0].ty, { x: -1, y: 0 }); push(-1, 0); }
  run(g, 0.2);
  assert.ok(g.flag(F.solved('burrow', '0,1')), `block at ${g.blocks[0].tx},${g.blocks[0].ty}`);
});

test('lighting every torch makes the big key chest appear and opening it gives the key', () => {
  const g = game('burrow', ...at(0, 0, 9, 6));
  g.enemies = [];
  for (const i of g.roomTiles((d) => d.torch)) g.lightTorch(i % g.area.w, Math.floor(i / g.area.w));
  g.step(STEP, {});
  assert.ok(g.flag(F.solved('burrow', '0,0')));
  place(g, 9, 6, { x: 0, y: -1 });
  tap(g, { interact: true });
  assert.equal(g.mode, 'itemget');
  assert.equal(g.save.bigKeys.burrow, true);
});

test('defeating every enemy in a "clear" room solves it, and they stay gone', () => {
  const g = game('burrow', ...at(0, 2, 18, 6));
  assert.equal(g.enemies.length, 3);
  for (const e of g.enemies) { e.hp = 0; e.alive = false; }
  g.step(STEP, {});
  assert.ok(g.flag(F.solved('burrow', '0,2')));
  g.enterRoom('0,2');
  assert.equal(g.enemies.length, 0);
});

test('running out of hearts sends Wren back to her last statue with everything kept', () => {
  const g = game('burrow', ...at(1, 1, 9, 9));
  g.save.respawn = { area: 'burrow', x: 29, y: 32 };
  g.save.keys.burrow = 1;
  g.setFlag('chest:test');
  g.player.hp = 1; g.save.hearts = 1;
  g.hurt(2, g.player.x + 5, g.player.y);
  assert.equal(g.mode, 'dead');
  g.respawn();
  assert.equal(g.mode, 'play');
  assert.equal(g.player.hp, g.save.maxHearts * 2);
  assert.equal(g.save.keys.burrow, 1);
  assert.ok(g.flag('chest:test'));
  assert.equal(g.room.key, '1,2');
});

test('touching a statue saves a checkpoint and refills hearts', () => {
  const [tx, ty] = at(1, 2, 5, 10); // statue at (5,9) in Lantern Plaza
  const g = game('overworld', tx + 1, ty);
  g.player.hp = g.save.hearts = 2;
  run(g, 0.2, { x: -1, y: 0 });
  assert.deepEqual(g.save.respawn, { area: 'overworld', x: 25, y: 34 });
  assert.equal(g.player.hp, 6);
});

test('stepping on the burrow entrance warps inside, and the exit stairs warp back', () => {
  const [tx, ty] = at(0, 2, 7, 4);
  const g = game('overworld', tx, ty);
  g.enemies = [];
  run(g, 0.5, { x: 0, y: -1 });
  run(g, 1);
  assert.equal(g.area.id, 'burrow');
  assert.deepEqual(g.save.respawn, { area: 'burrow', x: areas.burrow.start.x, y: areas.burrow.start.y });
  run(g, 0.5, { x: 0, y: 1 });
  run(g, 1);
  assert.equal(g.area.id, 'overworld');
});

test('the shop sells Fairy Tea only when you can afford it', () => {
  const [tx, ty] = at(2, 2, 3, 5);
  const g = game('overworld', tx, ty);
  place(g, tx, ty, { x: 0, y: -1 });
  tap(g, { interact: true });
  assert.equal(g.talk.npc, 'pell');
  g.talkChoose(0);
  assert.match(g.talkNode.text, /not quite enough/);
  g.talkNext();
  g.save.berries = 50;
  tap(g, { interact: true });
  g.talkChoose(0);
  assert.equal(g.save.tea, 1);
  assert.equal(g.save.berries, 20);
});

test('fishing: strike when the bobber dips', () => {
  const [tx, ty] = at(3, 1, 15, 5);
  const g = game('overworld', tx, ty, (s) => { s.quests.fish.stage = 0; });
  g.enemies = [];
  place(g, tx, ty, { x: -1, y: 0 });
  tap(g, { interact: true });
  assert.equal(g.mode, 'fishing');
  for (let i = 0; i < 600 && g.fishing.phase === 'wait'; i++) g.step(STEP, {});
  assert.equal(g.fishing.phase, 'bite');
  tap(g, { attack: true });
  assert.equal(g.save.quests.fish.count, 1);
});

test('Hazel\'s race is won by reaching the flag in time and lost when time runs out', () => {
  const [fx, fy] = at(0, 1, 7, 4);
  const g = game('overworld', fx, fy + 2, (s) => { s.quests.race.stage = 0; });
  g.enemies = [];
  g.runEffect('race:start');
  run(g, 0.6, { x: 0, y: -1 });
  assert.equal(g.save.quests.race.stage, 1);
  assert.equal(g.race, null);
  const g2 = game('overworld', fx, fy + 4, (s) => { s.quests.race.stage = 0; });
  g2.enemies = [];
  g2.runEffect('race:start');
  run(g2, RACE_TIME + 0.5);
  assert.equal(g2.race, null);
  assert.equal(g2.save.quests.race.stage, 0);
});

test('Biscuit hops in your satchel and Mira gives a heart container', () => {
  const [cx, cy] = at(0, 1, 16, 3);
  const g = game('overworld', cx, cy);
  g.enemies = [];
  place(g, cx, cy, { x: 0, y: -1 });
  tap(g, { interact: true });
  while (g.mode === 'talk') g.talkNext();
  assert.ok(g.flag('cat:found'));
  assert.equal(g.save.quests.cat.stage, 1);
  const [mx, my] = at(1, 2, 3, 4);
  g.enterArea('overworld', mx, my);
  place(g, mx, my, { x: 0, y: -1 });
  tap(g, { interact: true });
  while (g.mode === 'talk') g.talkNext();
  assert.equal(g.save.maxHearts, 4);
  assert.equal(g.save.quests.cat.stage, 2);
});

test('beating a boss drops a heart container and a Flame Shard, then you leave the dungeon', () => {
  const g = game('burrow', ...at(1, 0, 10, 9));
  const boss = g.enemies.find((e) => e.boss);
  assert.ok(boss);
  boss.hp = 1; boss.state = 'dazed'; boss.z = 0;
  g.damageEnemy(boss, 2, boss.x, boss.y + 20, 'sword');
  assert.ok(g.flag(F.solved('burrow', '1,0')));
  assert.equal(g.pickups.filter((k) => k.kind === 'shard').length, 1);
  g.collect(g.pickups.find((k) => k.kind === 'shard'));
  assert.equal(g.save.maxHearts, 4);
  for (let i = 0; i < 600 && g.area.id === 'burrow'; i++) g.step(STEP, {});
  assert.equal(g.area.id, 'overworld');
  assert.deepEqual(g.save.shards, ['burrow']);
  assert.equal(g.save.quests.main.stage, 0, 'main stage needs Wick first');
});

test('the same seed replays the same enemy moves', () => {
  const a = game('burrow', ...at(0, 2, 18, 6));
  const b = game('burrow', ...at(0, 2, 18, 6));
  run(a, 3); run(b, 3);
  assert.deepEqual(a.enemies.map((e) => [e.x, e.y]), b.enemies.map((e) => [e.x, e.y]));
});

test('walking into a sitting or dazed Grumbletoad is safe, being landed on is not', () => {
  const g = game('burrow', ...at(1, 0, 10, 9));
  const boss = g.enemies.find((e) => e.kind === 'toad');
  for (const state of ['rest', 'crouch', 'dazed']) {
    boss.state = state; boss.z = 0;
    g.player.x = boss.x; g.player.y = boss.y; g.player.iframes = 0;
    const hp = g.player.hp;
    g.checkContact();
    assert.equal(g.player.hp, hp, `${state} toad hurt on contact`);
  }
  boss.state = 'air'; boss.z = 2;
  g.player.x = boss.x; g.player.y = boss.y; g.player.iframes = 0;
  const hp = g.player.hp;
  g.checkContact();
  assert.ok(g.player.hp < hp, 'a landing toad hurts');
});

test('Tumble points a new player at Grandma Wick, and gives a tip in each boss room', () => {
  const g = game();
  const seen = new Set();
  for (let t = 0; t < 12; t += STEP) { g.step(STEP, {}); if (g.toast) seen.add(g.toast.text); }
  assert.ok([...seen].some((s) => /Grandma Wick/.test(s)), [...seen].join(' / '));
  assert.ok([...seen].some((s) => /hint/.test(s)));
  const b = game('burrow', ...at(1, 0, 10, 9));
  let tip = '';
  for (let t = 0; t < 6 && !tip; t += STEP) { b.step(STEP, {}); if (b.toast && /Tumble/.test(b.toast.text)) tip = b.toast.text; }
  assert.match(tip, /wobbles/);
});

test('leaving during the Shade King\'s speech still leaves the last Flame Shard to collect', () => {
  const ent = areas.peak.entities.find((e) => e.type === 'boss');
  const g = game('peak', ent.x, ent.y + 3, (s) => { Object.assign(s.items, { boomerang: true, grapple: true, dash: true }); s.shards = ['burrow', 'temple']; });
  const boss = g.enemies.find((e) => e.boss);
  boss.hp = 1; boss.revealed = true; boss.state = 'rest';
  g.damageEnemy(boss, 5, boss.x, boss.y + 20, 'sword');
  assert.equal(g.mode, 'talk');
  const saved = JSON.parse(JSON.stringify(g.syncSave()));
  const g2 = new Game(saved, { seed: 6 });
  g2.enterRoom(ent.room);
  assert.equal(g2.enemies.length, 0, 'the Shade King stays beaten');
  assert.deepEqual(g2.pickups.map((k) => k.kind), ['shard'], 'only the shard waits; his heart was already given');
  g2.collect(g2.pickups[0]);
  assert.deepEqual(g2.save.shards, ['burrow', 'temple', 'peak']);
});
