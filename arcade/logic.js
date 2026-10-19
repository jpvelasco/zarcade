// Pure arcade helpers: filtering, grid navigation, and play history. No DOM
// access, so it runs in the browser (as window.Arcade) and in Node (for tests).
(function (root) {
  'use strict';

  const STORAGE_KEY = 'arcade.v1';
  const ALL = 'All';

  // Games sit on a handful of broad shelves so the filter row stays short as
  // the arcade grows. A game's own genre still shows on its cabinet.
  const SHELVES = [
    ['Action & Adventure', ['Action', 'Adventure', 'Platformer', 'Runner', 'Roguelite', 'Exploration', 'Dig & upgrade']],
    ['Racing', ['Racing']],
    ['Puzzle & Word', ['Puzzle', 'Word', 'Nonogram', 'Coding puzzle', 'Hidden object', 'Mystery', 'Typing']],
    ['Arcade & Party', ['Arcade', 'Rhythm', 'Party', 'Physics', 'Flyer']],
    ['Cozy', ['Chill', 'Life sim', 'Tycoon', 'Discovery', 'Sandbox', 'Cards']],
    ['Strategy & Sports', ['Strategy', 'Sports', 'Time management']],
  ];
  const NEW = 'New';

  function shelfOf(genre) {
    const found = SHELVES.find(([, genres]) => genres.includes(genre));
    return found ? found[0] : null;
  }

  // Filter chips: All, then New (when some new game hasn't been played),
  // then each shelf that has games, in shelf order.
  function genres(games, plays = {}) {
    const list = [ALL];
    if (games.some((g) => isNew(g, plays))) list.push(NEW);
    for (const [shelf] of SHELVES) if (games.some((g) => shelfOf(g.genre) === shelf)) list.push(shelf);
    return list;
  }

  function isNew(game, plays = {}) {
    return !!game.isNew && !plays[game.slug];
  }

  function filterGames(games, filter, plays = {}) {
    if (!filter || filter === ALL) return games.slice();
    if (filter === NEW) return games.filter((g) => isNew(g, plays));
    return games.filter((g) => shelfOf(g.genre) === filter);
  }

  function gamePath(slug) {
    return `games/${slug}/index.html`;
  }

  // Next focused card index for a direction key in a grid of `count` cards
  // laid out in `cols` columns. Left/right wrap across rows; up/down stay in
  // the column and clamp to the last card on a short final row.
  function gridMove(index, dir, count, cols) {
    if (count <= 0) return -1;
    cols = Math.max(1, cols);
    let i = Math.min(Math.max(index, 0), count - 1);
    if (dir === 'left') i = (i - 1 + count) % count;
    else if (dir === 'right') i = (i + 1) % count;
    else if (dir === 'up') i = i - cols >= 0 ? i - cols : i;
    else if (dir === 'down') {
      if (i + cols < count) i += cols;
      else if (Math.floor(i / cols) < Math.floor((count - 1) / cols)) i = count - 1;
    } else if (dir === 'home') i = 0;
    else if (dir === 'end') i = count - 1;
    return i;
  }

  function freshState() {
    return { plays: {}, last: null, muted: false };
  }

  function loadState(storage) {
    const state = freshState();
    try {
      const raw = storage && storage.getItem(STORAGE_KEY);
      if (!raw) return state;
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        if (data.plays && typeof data.plays === 'object') {
          for (const [slug, n] of Object.entries(data.plays)) {
            if (Number.isFinite(n) && n > 0) state.plays[slug] = Math.floor(n);
          }
        }
        if (typeof data.last === 'string') state.last = data.last;
        state.muted = data.muted === true;
      }
    } catch (_) {
      // Corrupt or unavailable storage falls back to a fresh arcade.
    }
    return state;
  }

  function saveState(storage, state) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Private mode or full storage: history just isn't kept.
    }
  }

  function recordPlay(state, slug) {
    return {
      ...state,
      plays: { ...state.plays, [slug]: (state.plays[slug] || 0) + 1 },
      last: slug,
    };
  }

  // Games that load ES modules can't start from file:// URLs.
  function blockedOffline(game, protocol) {
    return protocol === 'file:' && !!game.needsServer;
  }

  // What the help panel shows for one game's telemetry records.
  function problemSummary(records) {
    const problems = records.filter((r) => r.severity === 'ERROR' || r.severity === 'FATAL');
    const slow = records.filter((r) => r.severity === 'WARN' && /^(perf|frame)\./.test(r.body));
    const last = problems[problems.length - 1] || null;
    return {
      records: records.length,
      errors: problems.length,
      slow: slow.length,
      lastProblem: last ? { time: last.time, body: last.body, severity: last.severity } : null,
      lastPlayed: records.length ? records[records.length - 1].time : null,
    };
  }

  // The old cabinet code: up, up, down, down, left, right, left, right, B, A.
  // konamiStep returns how much of it has been typed; KONAMI.length is done.
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
  function konamiStep(step, code) {
    if (code === KONAMI[step]) return step + 1;
    // An extra up after "up, up" still leaves "up, up" typed.
    if (code === 'ArrowUp') return step === 2 ? 2 : 1;
    return 0;
  }

  // No keyboard? Five quick taps on the sign's coin do the same.
  function tapStreak(times, now, need = 5, within = 3000) {
    const recent = [...times, now].filter((t) => now - t <= within);
    return recent.length >= need ? { times: [], fired: true } : { times: recent, fired: false };
  }

  const Arcade = {
    STORAGE_KEY, ALL, NEW, SHELVES, shelfOf, isNew, genres, filterGames, gamePath, gridMove,
    freshState, loadState, saveState, recordPlay, blockedOffline, problemSummary,
    KONAMI, konamiStep, tapStreak,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Arcade;
  else root.Arcade = Arcade;
})(typeof window !== 'undefined' ? window : globalThis);
