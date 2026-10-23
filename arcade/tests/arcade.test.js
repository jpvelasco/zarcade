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

test('Pinball Planet lists the mouse, which works its flippers', () => {
  const g = GAMES.find((x) => x.slug === 'pinball-planet');
  assert.ok(g.controls.includes('mouse'));
  const input = fs.readFileSync(path.join(ROOT, 'games', 'pinball-planet', 'src', 'input.js'), 'utf8');
  assert.match(input, /pointerType === 'mouse'/);
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

// Screens a touch player once got stuck on, with no back or arcade control.
// An installed iPhone app has no browser back button, so each needs its own.
const ESCAPE_HATCHES = {
  'clue-critters': ['screen-intro'],
  'globe-gp': ['screen-loading'],
  glowloop: ['results'],
  'jungle-blaster': ['screen-clear'],
  'keyboard-knights': ['screen-who'],
  'sprout-valley': ['screen-intro', 'screen-night'],
};

test('screens that once trapped touch players offer a way back', () => {
  for (const [slug, ids] of Object.entries(ESCAPE_HATCHES)) {
    const html = fs.readFileSync(path.join(ROOT, A.gamePath(slug)), 'utf8');
    for (const id of ids) {
      const start = html.indexOf(`id="${id}"`);
      assert.ok(start > 0, `${slug} has #${id}`);
      const section = html.slice(start, html.indexOf('</section>', start));
      assert.match(section, /href="\.\.\/\.\.\/index\.html"|data-back/, `${slug} #${id} has an arcade link or a back button`);
    }
  }
});

test('every page locks pinch-zoom out during play', () => {
  for (const file of ['index.html', ...GAMES.map((g) => A.gamePath(g.slug))]) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const vp = html.match(/<meta name="viewport"[^>]*>/);
    assert.ok(vp, `${file} has a viewport meta`);
    assert.match(vp[0], /user-scalable=no/, `${file} forbids pinch-zoom during play`);
  }
});

test('every page is ready to be shared: language, viewport, title, description, icon', () => {
  for (const file of ['index.html', ...GAMES.map((g) => A.gamePath(g.slug))]) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(html, /<html lang="[a-z]{2}/, `${file} declares its language`);
    assert.match(html, /<meta name="viewport"/, `${file} has a viewport`);
    assert.match(html, /<title>[^<]+<\/title>/, `${file} has a title`);
    assert.match(html, /<meta name="description" content="[^"]{20,}"/, `${file} has a description`);
    assert.match(html, /<link rel="icon"/, `${file} has a favicon`);
  }
});

test('every game sits on a shelf', () => {
  for (const g of GAMES) assert.ok(A.shelfOf(g.genre), `${g.slug} genre "${g.genre}" has no shelf`);
});

test('filter chips: All, New while something is unplayed, then shelves in order', () => {
  const games = [
    { slug: 'a', genre: 'Racing' },
    { slug: 'b', genre: 'Action', isNew: true },
    { slug: 'c', genre: 'Puzzle' },
  ];
  assert.deepEqual(A.genres(games), ['All', 'New', 'Action & Adventure', 'Racing', 'Puzzle & Word']);
  assert.deepEqual(A.genres(games, { b: 1 }), ['All', 'Action & Adventure', 'Racing', 'Puzzle & Word']);
});

test('filterGames keeps order, copies for All, and finds new and shelved games', () => {
  const games = [
    { slug: 'a', genre: 'Action' },
    { slug: 'b', genre: 'Word', isNew: true },
    { slug: 'c', genre: 'Platformer', isNew: true },
  ];
  assert.deepEqual(A.filterGames(games, 'Action & Adventure').map((g) => g.slug), ['a', 'c']);
  const all = A.filterGames(games, 'All');
  assert.deepEqual(all, games);
  assert.notEqual(all, games);
  assert.deepEqual(A.filterGames(games, 'New').map((g) => g.slug), ['b', 'c']);
  assert.deepEqual(A.filterGames(games, 'New', { c: 2 }).map((g) => g.slug), ['b']);
  assert.deepEqual(A.filterGames(games, 'Cozy'), []);
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

test('problemSummary counts errors and slow frames and finds the latest problem', () => {
  const records = [
    { time: 1, severity: 'INFO', body: 'session.start' },
    { time: 2, severity: 'WARN', body: 'frame.long' },
    { time: 3, severity: 'ERROR', body: 'frame.stall' },
    { time: 4, severity: 'WARN', body: 'resource failed to load' },
    { time: 5, severity: 'FATAL', body: 'kaput' },
    { time: 6, severity: 'INFO', body: 'job.start' },
  ];
  assert.deepEqual(A.problemSummary(records), {
    records: 6, errors: 2, slow: 1, lastProblem: { time: 5, body: 'kaput', severity: 'FATAL' }, lastPlayed: 6,
  });
  assert.deepEqual(A.problemSummary([]), { records: 0, errors: 0, slow: 0, lastProblem: null, lastPlayed: null });
});

// ---------------------------------------------------------------- the secret

function typeCode(codes) {
  let step = 0;
  let fired = 0;
  for (const c of codes) {
    step = A.konamiStep(step, c);
    if (step === A.KONAMI.length) { fired++; step = 0; }
  }
  return fired;
}

test('the old cabinet code unlocks the secret', () => {
  assert.equal(typeCode(A.KONAMI), 1);
  assert.equal(A.KONAMI.length, 10);
});

test('a wrong key starts the code over, but extra ups at the start still count', () => {
  assert.equal(typeCode(['ArrowUp', 'ArrowDown', ...A.KONAMI.slice(2)]), 0, 'one up is not enough');
  assert.equal(typeCode(['ArrowUp', 'ArrowUp', 'ArrowUp', ...A.KONAMI.slice(2)]), 1, 'up, up, up still works');
  assert.equal(typeCode(['ArrowUp', 'KeyX', ...A.KONAMI]), 1, 'a stray key then the real code');
  assert.equal(typeCode([...A.KONAMI.slice(0, 9), 'KeyB', 'KeyA']), 0, 'B twice breaks it');
  assert.equal(typeCode([...A.KONAMI, ...A.KONAMI]), 2, 'it works again and again');
});

test('installMode: button for beforeinstallprompt browsers, hint for iOS, never when installed or dismissed', () => {
  assert.equal(A.installMode({ canPrompt: true }), 'button');
  assert.equal(A.installMode({ ios: true }), 'hint');
  assert.equal(A.installMode({}), null, 'desktop browsers with no prompt offer get nothing');
  assert.equal(A.installMode({ canPrompt: true, standalone: true }), null, 'installed apps do not prompt');
  assert.equal(A.installMode({ ios: true, standalone: true }), null);
  assert.equal(A.installMode({ canPrompt: true, dismissed: true }), null);
  assert.equal(A.installMode({ ios: true, dismissed: true }), null);
});

test('tapping the coin five times quickly unlocks it on touch screens', () => {
  let s = { times: [], fired: false };
  for (const t of [0, 400, 800, 1200]) {
    s = A.tapStreak(s.times, t);
    assert.equal(s.fired, false);
  }
  s = A.tapStreak(s.times, 1600);
  assert.equal(s.fired, true, 'the fifth tap fires');
  assert.deepEqual(s.times, [], 'and the count starts over');
  // Slow taps never add up.
  s = { times: [], fired: false };
  for (let i = 0; i < 10; i++) {
    s = A.tapStreak(s.times, i * 1000);
    assert.equal(s.fired, false, `slow tap ${i}`);
  }
});

test('the arcade page has a link preview card, and its image is 1200×630', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const meta = (prop) => (html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`)) || [])[1];
  for (const prop of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card']) assert.ok(meta(prop), `${prop} is set`);
  // Until launch the address is the {{SITE_URL}} placeholder; after, a real https URL.
  for (const prop of ['og:url', 'og:image']) assert.match(meta(prop), /^(\{\{SITE_URL\}\}|https:\/\/)/, `${prop} is a placeholder or a full address`);
  const image = 'docs/assets/social-preview.png';
  assert.ok(meta('og:image').endsWith(`/${image}`), 'og:image points at the card in docs/assets');
  const png = fs.readFileSync(path.join(ROOT, image));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], 'the card is 1200×630');
});
