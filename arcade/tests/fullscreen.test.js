const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../fullscreen.js');
const { GAMES } = require('../games.js');

const ROOT = path.join(__dirname, '..', '..');

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
}

test('off by default: clicks and keys do nothing until the player asks', () => {
  const state = F.createState(memoryStorage());
  assert.equal(state.wanted, false);
  assert.equal(state.gesture('a'), 'none');
});

test('the pill turns it on, and it is remembered for the next page', () => {
  const storage = memoryStorage();
  const state = F.createState(storage);
  assert.equal(state.toggle(), 'enter');
  state.changed(true);
  assert.equal(storage.data[F.PREF_KEY], 'on');

  // Changing page ends full screen, but that is not the player's choice.
  state.leave();
  state.changed(false);
  assert.equal(storage.data[F.PREF_KEY], 'on');

  // On the next page, the first click or key goes back to full screen, once.
  const next = F.createState(storage);
  assert.equal(next.wanted, true);
  assert.equal(next.gesture('ArrowUp'), 'enter');
  next.requested(true);
  assert.equal(next.gesture('ArrowUp'), 'none', 'no second request while one is pending');
  next.changed(true);
  assert.equal(next.gesture('x'), 'none', 'already in full screen');
});

test('Esc, the pill, or the browser leaving full screen turns it off for good', () => {
  const storage = memoryStorage({ [F.PREF_KEY]: 'on' });
  const byEsc = F.createState(storage);
  byEsc.changed(true);
  byEsc.changed(false); // the browser handled Esc
  assert.equal(byEsc.wanted, false);
  assert.equal(storage.data[F.PREF_KEY], undefined);
  assert.equal(F.createState(storage).gesture('a'), 'none', 'stays off on the next page');

  const byPill = F.createState(memoryStorage({ [F.PREF_KEY]: 'on' }));
  byPill.changed(true);
  assert.equal(byPill.toggle(), 'exit');
  assert.equal(byPill.wanted, false);
});

test('Esc and F11 never trigger full screen, and a refused request can retry', () => {
  const state = F.createState(memoryStorage({ [F.PREF_KEY]: 'on' }));
  assert.equal(state.gesture('Escape'), 'none');
  assert.equal(state.gesture('F11'), 'none');
  state.requested(true);
  state.failed();
  assert.equal(state.gesture('Enter'), 'enter');
});

test('blocked storage keeps working for the current page', () => {
  const blocked = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  const state = F.createState(blocked);
  assert.equal(state.wanted, false);
  assert.equal(state.toggle(), 'enter');
  assert.doesNotThrow(() => state.changed(true));
});

test('isArcadeUrl matches links back to the arcade page, whatever the query or hash', () => {
  const arcade = 'https://jp.example/zarcade/?play=glowloop';
  for (const href of ['https://jp.example/zarcade/index.html', 'https://jp.example/zarcade/', 'https://jp.example/zarcade/index.html#top', 'https://jp.example/zarcade/?sw=1']) {
    assert.equal(F.isArcadeUrl(href, arcade), true, href);
  }
  for (const href of ['https://jp.example/zarcade/games/glowloop/index.html', 'https://other.example/zarcade/', 'https://jp.example/', 'not a url']) {
    assert.equal(F.isArcadeUrl(href, arcade), false, href);
  }
  assert.equal(F.isArcadeUrl('https://jp.example/zarcade/', 'https://jp.example/zarcade/index.html'), true);
});

test('framedBy finds the arcade only when it named the frame and shares the origin', () => {
  const parent = { document: {} };
  const framed = (name, parentWin) => ({ name, parent: parentWin });
  assert.equal(F.framedBy(framed(F.FRAME_NAME, parent)), parent);
  assert.equal(F.framedBy(framed('other', parent)), null, 'someone else framing a game');
  const top = { name: F.FRAME_NAME };
  top.parent = top;
  assert.equal(F.framedBy(top), null, 'a top-level page is not framed');
  const foreign = { get document() { throw new Error('cross-origin'); } };
  assert.equal(F.framedBy(framed(F.FRAME_NAME, foreign)), null, 'a cross-origin parent is not the arcade');
});

test('the arcade and every game load fullscreen.js, and the copies match', () => {
  const canonical = fs.readFileSync(path.join(ROOT, 'arcade', 'fullscreen.js'), 'utf8');
  assert.match(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /<script src="arcade\/fullscreen\.js"><\/script>/);
  for (const game of GAMES) {
    const copy = fs.readFileSync(path.join(ROOT, 'games', game.slug, 'fullscreen.js'), 'utf8');
    assert.equal(copy, canonical, `${game.slug}/fullscreen.js is out of date: run npm run sync-telemetry`);
    const html = fs.readFileSync(path.join(ROOT, 'games', game.slug, 'index.html'), 'utf8');
    assert.ok(html.includes('<script src="fullscreen.js"></script>'), `${game.slug} loads fullscreen.js`);
  }
});
