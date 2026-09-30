const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../logic.js');
const { GAMES } = require('../games.js');

const ROOT = path.join(__dirname, '..', '..');
const CONTROLS = ['keyboard', 'mouse', 'touch', 'gamepad'];

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}

test('every manifest entry is complete and unique', () => {
  const slugs = new Set();
  for (const g of GAMES) {
    assert.match(g.slug, /^[a-z0-9-]+$/, g.slug);
    assert.ok(!slugs.has(g.slug), `duplicate ${g.slug}`);
    slugs.add(g.slug);
    for (const key of ['title', 'tagline', 'description', 'genre']) {
      assert.equal(typeof g[key], 'string', `${g.slug}.${key}`);
      assert.ok(g[key].length > 0, `${g.slug}.${key}`);
    }
    assert.ok(g.tagline.length <= 60, `${g.slug} tagline too long`);
    assert.match(g.accent, /^#[0-9a-f]{6}$/i, `${g.slug}.accent`);
    assert.equal(typeof g.needsServer, 'boolean', `${g.slug}.needsServer`);
    assert.ok(g.controls.length > 0, `${g.slug}.controls`);
    for (const c of g.controls) assert.ok(CONTROLS.includes(c), `${g.slug} control ${c}`);
  }
});

test('manifest and games folder list the same games', () => {
  const folders = fs.readdirSync(path.join(ROOT, 'games'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  assert.deepEqual(GAMES.map((g) => g.slug).sort(), folders);
});

test('every game has an entry page, a cover, and a way back to the arcade', () => {
  for (const g of GAMES) {
    const html = fs.readFileSync(path.join(ROOT, A.gamePath(g.slug)), 'utf8');
    assert.ok(html.includes('../../index.html'), `${g.slug} links back to the arcade`);
    const cover = fs.readFileSync(path.join(ROOT, 'games', g.slug, 'cover.svg'), 'utf8');
    assert.match(cover, /viewBox="0 0 800 500"/, `${g.slug} cover is 800×500`);
  }
});

test('genres starts with All and lists each genre once', () => {
  const list = A.genres([{ genre: 'Action' }, { genre: 'Chill' }, { genre: 'Action' }]);
  assert.deepEqual(list, ['All', 'Action', 'Chill']);
});

test('filterGames keeps order and returns a copy for All', () => {
  const games = [{ slug: 'a', genre: 'X' }, { slug: 'b', genre: 'Y' }, { slug: 'c', genre: 'X' }];
  assert.deepEqual(A.filterGames(games, 'X').map((g) => g.slug), ['a', 'c']);
  const all = A.filterGames(games, 'All');
  assert.deepEqual(all, games);
  assert.notEqual(all, games);
  assert.deepEqual(A.filterGames(games, 'Z'), []);
});

test('gridMove wraps sideways and clamps vertically', () => {
  // 7 cards in 3 columns:  0 1 2 / 3 4 5 / 6
  assert.equal(A.gridMove(0, 'left', 7, 3), 6);
  assert.equal(A.gridMove(6, 'right', 7, 3), 0);
  assert.equal(A.gridMove(1, 'down', 7, 3), 4);
  assert.equal(A.gridMove(4, 'down', 7, 3), 6); // short last row
  assert.equal(A.gridMove(6, 'down', 7, 3), 6);
  assert.equal(A.gridMove(1, 'up', 7, 3), 1);
  assert.equal(A.gridMove(5, 'up', 7, 3), 2);
  assert.equal(A.gridMove(3, 'home', 7, 3), 0);
  assert.equal(A.gridMove(3, 'end', 7, 3), 6);
  assert.equal(A.gridMove(0, 'right', 0, 3), -1);
});

test('play history round-trips through storage', () => {
  const storage = memoryStorage();
  let state = A.loadState(storage);
  assert.deepEqual(state, A.freshState());
  state = A.recordPlay(state, 'glowloop');
  state = A.recordPlay(state, 'glowloop');
  state = A.recordPlay({ ...state, muted: true }, 'starhopper');
  A.saveState(storage, state);
  assert.deepEqual(A.loadState(storage), {
    plays: { glowloop: 2, starhopper: 1 },
    last: 'starhopper',
    muted: true,
  });
  assert.ok(A.STORAGE_KEY in storage.data);
});

test('loadState ignores corrupt or hostile data', () => {
  assert.deepEqual(A.loadState(memoryStorage({ 'arcade.v1': '{nope' })), A.freshState());
  const odd = A.loadState(memoryStorage({
    'arcade.v1': JSON.stringify({ plays: { a: -1, b: 'x', c: 2.7 }, last: 4, muted: 'yes' }),
  }));
  assert.deepEqual(odd, { plays: { c: 2 }, last: null, muted: false });
  assert.deepEqual(A.loadState(null), A.freshState());
});

test('module games are blocked only when opened from disk', () => {
  assert.equal(A.blockedOffline({ needsServer: true }, 'file:'), true);
  assert.equal(A.blockedOffline({ needsServer: true }, 'http:'), false);
  assert.equal(A.blockedOffline({ needsServer: false }, 'file:'), false);
});
