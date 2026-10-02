import test from 'node:test';
import assert from 'node:assert/strict';

import { Game, newState, normalize, starsFor, SAVE_VERSION } from '../src/game.js';
import { ROOM_IDS, MODE_IDS, parTime } from '../src/rooms.js';
import { CURIOS, curioFor } from '../src/curios.js';
import { GHOSTS } from '../src/ghosts.js';
import { loadSave, writeSave, clearSave, STORAGE_KEY } from '../src/save.js';
import { dayKey, dayGap } from '../src/rng.js';

function fresh(seed = 7) { return new Game(newState(seed)); }

// Finish a round well enough for three stars.
function clear(game, room, mode, over = {}) {
  return game.finishRound({ room, mode, seconds: parTime(room, mode) - 10, hints: 0, misses: 0, found: 6, ...over });
}

test('a new save starts at the front door', () => {
  const game = fresh();
  assert.equal(game.state.v, SAVE_VERSION);
  assert.deepEqual(game.unlockedRooms(), ['library']);
  assert.equal(game.isModeOpen('library', 'find'), true);
  assert.equal(game.isModeOpen('library', 'diff'), false, 'extra modes wait for the find round');
  assert.equal(game.isModeOpen('kitchen', 'find'), false);
  assert.equal(game.restoredCount(), 0);
  assert.equal(game.totalStars(), 0);
  assert.equal(game.maxStars(), 63);
  assert.deepEqual(game.nextThing(), { room: 'library', mode: 'find' });
  assert.deepEqual(game.summary(), []);
});

test('clearing a find round wakes the room and opens the next one', () => {
  const game = fresh();
  const out = clear(game, 'library', 'find');
  assert.equal(out.stars, 3);
  assert.equal(out.firstClear, true);
  assert.equal(out.newBest, true);
  assert.equal(out.unlockedRoom, 'kitchen');
  assert.equal(out.party, false);
  assert.deepEqual(out.curios, [curioFor('library', 'find').id]);
  assert.equal(game.isRestored('library'), true);
  assert.equal(game.isModeOpen('library', 'diff'), true);
  assert.equal(game.isModeOpen('kitchen', 'find'), true);
  assert.deepEqual(game.unlockedRooms(), ['library', 'kitchen']);
  assert.ok(Math.abs(game.roomLight('library') - 1 / 3) < 1e-9);
  assert.deepEqual(game.nextThing(), { room: 'library', mode: 'diff' });
});

test('stars are generous but speed and hints still mean something', () => {
  const par = parTime('library', 'find');
  assert.equal(starsFor({ room: 'library', mode: 'find', seconds: par - 5, hints: 0, misses: 0 }), 3);
  assert.equal(starsFor({ room: 'library', mode: 'find', seconds: par - 5, hints: 3, misses: 0 }), 2, 'leaning on hints costs the third star');
  assert.equal(starsFor({ room: 'library', mode: 'find', seconds: par * 1.3, hints: 0, misses: 0 }), 2);
  assert.equal(starsFor({ room: 'library', mode: 'find', seconds: par * 9, hints: 9, misses: 90 }), 1, 'finishing always earns a star');
  assert.ok(starsFor({ room: 'library', mode: 'find', seconds: par, hints: 1, misses: 7 }) === 3, 'a few wrong taps are fine');
});

test('a slower replay keeps the old stars and the old best', () => {
  const game = fresh();
  clear(game, 'library', 'find');
  const slot = game.state.rooms.library.find;
  const best = slot.best;
  const out = game.finishRound({ room: 'library', mode: 'find', seconds: best + 60, hints: 4, misses: 30, found: 6 });
  assert.equal(out.stars, 1);
  assert.equal(out.grew, false);
  assert.equal(out.newBest, false);
  assert.equal(slot.stars, 3, 'stars never go down');
  assert.equal(slot.best, best);
  assert.equal(slot.plays, 2);
  assert.deepEqual(out.curios, [], 'a curio is only given once');
});

test('clearing every find round restores the manor and throws the party once', () => {
  const game = fresh();
  let party = 0;
  for (const room of ROOM_IDS) {
    const out = clear(game, room, 'find');
    if (out.party) party++;
  }
  assert.equal(party, 1);
  assert.equal(game.state.party, true);
  assert.equal(game.restoredCount(), ROOM_IDS.length);
  assert.equal(game.unlockedRooms().length, ROOM_IDS.length);
  const again = clear(game, 'cellar', 'find');
  assert.equal(again.party, false, 'the party only happens once');
});

test('every room mode hands over its own curio, 21 of them plus mouse secrets', () => {
  const game = fresh();
  for (const room of ROOM_IDS) for (const mode of MODE_IDS) clear(game, room, mode);
  assert.equal(game.curioCount(), 21);
  for (const room of ROOM_IDS) {
    for (const mode of MODE_IDS) assert.ok(game.hasCurio(curioFor(room, mode).id), `${room} ${mode}`);
  }
  assert.equal(game.totalStars(), game.maxStars());
  const mice = CURIOS.filter((c) => c.earn.kind === 'mouse');
  for (const c of mice) assert.equal(game.hasCurio(c.id), false);
});

test('the manor mouse is counted per room and unlocks secrets', () => {
  const game = fresh();
  assert.deepEqual(game.spotMouse('library'), ['mousewhistle']);
  assert.equal(game.state.mice, 1);
  assert.deepEqual(game.spotMouse('library'), [], 'the same room again adds no new curio yet');
  assert.deepEqual(game.state.mouseRooms, ['library']);
  assert.deepEqual(game.spotMouse('kitchen'), ['cheesemedal']);
  game.spotMouse('attic');
  game.spotMouse('greenhouse');
  assert.deepEqual(game.spotMouse('ballroom'), ['mouseportrait'], 'the sixth sighting');
  assert.deepEqual(game.spotMouse('cellar'), [], 'and no more after that');
  assert.equal(game.curioCount(), 3);
  assert.equal(game.state.mice, 7);
});

test('finding a mouse during a round is reported with the round', () => {
  const game = fresh();
  const out = clear(game, 'library', 'find', { mouse: true });
  assert.ok(out.curios.includes('bookmark'));
  assert.ok(out.curios.includes('mousewhistle'));
  assert.equal(game.state.mice, 1);
});

test('ghosts remember what you brought back', () => {
  const game = fresh();
  assert.equal(game.metGhosts(), 0);
  game.returnItem('lumi');
  game.returnItem('lumi');
  game.returnItem('pib');
  assert.equal(game.ghostKnown('lumi'), true);
  assert.equal(game.state.ghosts.lumi.returned, 2);
  assert.equal(game.metGhosts(), 2);
  game.returnItem('nobody');
  assert.equal(game.metGhosts(), 2, 'an unknown ghost is ignored quietly');
});

test('the daily room comes from the date and is the same all day', () => {
  const game = fresh();
  const a = game.dailyPlan('2026-10-01');
  const b = game.dailyPlan('2026-10-01');
  const c = game.dailyPlan('2026-10-02');
  assert.deepEqual(a, b);
  assert.notDeepEqual([a.room, a.mode, a.seed], [c.room, c.mode, c.seed]);
  assert.ok(ROOM_IDS.includes(a.room));
  assert.ok(MODE_IDS.includes(a.mode));
  assert.equal(a.daily, true);
  // Across a fortnight the daily should visit several rooms.
  const rooms = new Set();
  for (let d = 1; d <= 20; d++) rooms.add(game.dailyPlan(`2026-10-${String(d).padStart(2, '0')}`).room);
  assert.ok(rooms.size >= 4, `the daily only visited ${rooms.size} rooms in 20 days`);
});

test('the daily streak grows day by day and resets after a gap', () => {
  const game = fresh();
  game.ensureDaily('2026-10-01');
  game.completeDaily(3);
  assert.equal(game.state.daily.streak, 1);
  assert.equal(game.state.daily.done, true);

  game.ensureDaily('2026-10-02');
  assert.equal(game.state.daily.done, false, 'a new day is a new daily');
  game.completeDaily(2);
  assert.equal(game.state.daily.streak, 2);
  assert.equal(game.state.daily.best, 2);

  game.ensureDaily('2026-10-05');
  assert.equal(game.state.daily.streak, 0, 'three days away ends the streak');
  game.completeDaily(1);
  assert.equal(game.state.daily.streak, 1);
  assert.equal(game.state.daily.best, 2, 'the best streak is remembered');

  // Playing twice in one day does not double count.
  game.completeDaily(3);
  assert.equal(game.state.daily.streak, 1);
  assert.equal(game.state.daily.stars, 3, 'but a better run upgrades the stars');
});

test('skipping a day you opened but never finished clears the streak', () => {
  const game = fresh();
  game.ensureDaily('2026-10-01');
  game.completeDaily(3);
  game.ensureDaily('2026-10-02');
  game.ensureDaily('2026-10-03');
  assert.equal(game.state.daily.streak, 0);
});

test("today's room in a locked part of the manor counts for the streak only", () => {
  const game = fresh();
  game.ensureDaily('2026-10-01');
  assert.equal(game.isModeOpen('observatory', 'hunt'), false);
  const out = game.finishRound({
    room: 'observatory', mode: 'hunt', seconds: 30, hints: 0, misses: 0, found: 6, daily: true, mouse: true,
  });
  assert.equal(out.visit, true, 'a visit, not a clear');
  assert.equal(out.stars, 3);
  assert.equal(out.firstClear, false);
  assert.equal(out.unlockedRoom, null);
  assert.deepEqual(out.curios, ['mousewhistle'], 'the mouse still counts');
  // The manor itself is untouched: the unlock order is not broken.
  assert.equal(game.state.rooms.observatory.hunt.cleared, false);
  assert.equal(game.state.rooms.observatory.hunt.stars, 0);
  assert.equal(game.state.rooms.observatory.hunt.best, 0);
  assert.equal(game.isUnlocked('kitchen'), false);
  assert.equal(game.restoredCount(), 0);
  // But the daily and the totals do count.
  assert.equal(game.state.daily.done, true);
  assert.equal(game.state.daily.streak, 1);
  assert.equal(game.state.daily.stars, 3);
  assert.equal(game.state.totals.rounds, 1);
  assert.equal(game.state.mice, 1);

  // Once the room is open the same round clears it as normal.
  const open = fresh();
  for (const id of ['library', 'kitchen', 'attic', 'greenhouse', 'ballroom', 'cellar', 'observatory']) {
    open.state.rooms[id].find.cleared = true;
  }
  open.ensureDaily('2026-10-01');
  const real = open.finishRound({ room: 'observatory', mode: 'hunt', seconds: 30, hints: 0, misses: 0, found: 6, daily: true });
  assert.equal(real.visit, undefined);
  assert.equal(open.state.rooms.observatory.hunt.cleared, true);
});

test('a normal round of a locked room (Again after a peek-ahead daily) opens nothing', () => {
  const game = fresh();
  game.ensureDaily('2026-10-02');
  assert.equal(game.isModeOpen('attic', 'hunt'), false);
  const out = game.finishRound({ room: 'attic', mode: 'hunt', seconds: 30, hints: 0, misses: 0, found: 6, daily: false });
  assert.equal(out.visit, true);
  assert.deepEqual(out.curios, [], 'no curio for a room you have not reached');
  assert.equal(game.state.rooms.attic.hunt.cleared, false);
  assert.equal(game.state.rooms.attic.hunt.stars, 0);
  assert.equal(game.hasCurio('crown'), false);
  assert.equal(game.state.daily.done, false, 'only a daily round counts for the daily');
  assert.equal(game.state.totals.rounds, 1);
});

test('a daily round reports through finishRound', () => {
  const game = fresh();
  game.ensureDaily('2026-10-01');
  const plan = game.dailyPlan('2026-10-01');
  const out = game.finishRound({ room: plan.room, mode: plan.mode, seconds: 20, hints: 0, misses: 0, found: 6, daily: true });
  assert.equal(out.stars, 3);
  assert.equal(game.state.daily.done, true);
  assert.equal(game.state.daily.streak, 1);
});

test('replays get a new layout, and the layout is reproducible', () => {
  const game = fresh(123);
  const first = game.startRound('library', 'find');
  assert.equal(first.seed, game.seedFor('library', 'find', 0));
  clear(game, 'library', 'find');
  const second = game.startRound('library', 'find');
  assert.notEqual(first.seed, second.seed, 'a replay should be a new room');
  assert.equal(second.seed, game.seedFor('library', 'find', 1));
  assert.notEqual(game.seedFor('library', 'find'), game.seedFor('library', 'diff'));
  assert.notEqual(fresh(1).seedFor('library', 'find'), fresh(2).seedFor('library', 'find'));
});

test('the title summary grows as you play', () => {
  const game = fresh();
  clear(game, 'library', 'find');
  game.returnItem('lumi');
  const bits = game.summary().join(' ');
  assert.match(bits, /1\/7 rooms awake/);
  assert.match(bits, /3\/63 stars/);
  assert.match(bits, /1\/9 ghost friends/);
  assert.match(bits, /1\/24 curios/);
});

test('normalize repairs nonsense without throwing anything away', () => {
  const good = newState(5);
  good.rooms.library.find = { cleared: true, stars: 2, best: 41.5, plays: 3 };
  good.curios = ['bookmark', 'not-a-curio'];
  good.mice = 2;
  const back = normalize(JSON.parse(JSON.stringify(good)), 1);
  assert.equal(back.seed, 5);
  assert.deepEqual(back.rooms.library.find, { cleared: true, stars: 2, best: 41.5, plays: 3 });
  assert.deepEqual(back.curios, ['bookmark']);
  assert.equal(back.mice, 2);

  const junk = normalize({ rooms: 'nope', ghosts: 7, curios: 'x', daily: 3, settings: null, totals: [], mice: -9 }, 2);
  assert.equal(junk.seed, 2);
  assert.equal(junk.mice, 0);
  assert.equal(junk.rooms.library.find.cleared, false);
  assert.equal(junk.daily.streak, 0);
  assert.equal(junk.settings.music, true);
  assert.equal(normalize(null, 3).seed, 3);
  assert.equal(normalize('garbage', 4).seed, 4);

  const silly = normalize({ rooms: { library: { find: { stars: 99, best: -4, plays: 'x' } } }, ghosts: { lumi: { returned: -3, met: 1 } } }, 1);
  assert.equal(silly.rooms.library.find.stars, 3);
  assert.equal(silly.rooms.library.find.best, 0);
  assert.equal(silly.ghosts.lumi.returned, 0);
  assert.equal(silly.ghosts.lumi.met, true);
  assert.equal(Object.keys(silly.ghosts).length, GHOSTS.length);
});

test('saves round-trip through storage and survive a broken one', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  assert.equal(loadSave(storage, 9).fresh, true);
  const game = new Game(loadSave(storage, 9).state);
  clear(game, 'library', 'find');
  assert.equal(writeSave(storage, game.state), true);
  const again = loadSave(storage, 1);
  assert.equal(again.fresh, false);
  assert.equal(again.state.rooms.library.find.cleared, true);
  assert.equal(again.state.seed, 9);

  store.set(STORAGE_KEY, '{oh no');
  const broken = loadSave(storage, 4);
  assert.equal(broken.broken, true);
  assert.equal(broken.state.rooms.library.find.cleared, false);

  clearSave(storage);
  assert.equal(loadSave(storage, 1).fresh, true);

  // Blocked storage must not throw.
  const angry = { getItem() { throw new Error('nope'); }, setItem() { throw new Error('nope'); }, removeItem() { throw new Error('nope'); } };
  assert.equal(loadSave(angry, 1).broken, true);
  assert.equal(writeSave(angry, newState(1)), false);
  assert.equal(clearSave(angry), false);
  assert.equal(loadSave(null, 1).fresh, true);
  assert.equal(writeSave(null, newState(1)), false);
});

test('day keys and gaps behave', () => {
  assert.equal(dayKey(new Date(2026, 9, 1)), '2026-10-01');
  assert.equal(dayKey(new Date(2026, 0, 9)), '2026-01-09');
  assert.equal(dayGap('2026-10-01', '2026-10-02'), 1);
  assert.equal(dayGap('2026-02-28', '2026-03-01'), 1);
  assert.equal(dayGap('2026-10-01', '2026-10-01'), 0);
  assert.equal(dayGap('bad', '2026-10-01'), Infinity);
});
