// Starlight Arcade page: builds the cabinet row from the manifest, keeps the
// big screen in sync with the focused game, and launches games.
(function () {
  'use strict';

  const { GAMES } = window.ArcadeGames;
  const A = window.Arcade;
  const $ = (id) => document.getElementById(id);

  const CONTROL_LABELS = {
    keyboard: '⌨️ Keyboard',
    mouse: '🖱️ Mouse',
    touch: '👆 Touch',
    gamepad: '🎮 Gamepad',
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const offline = location.protocol === 'file:';

  // Reading `localStorage` throws when the browser blocks site storage.
  const storage = (() => { try { return localStorage; } catch (_) { return null; } })();
  let state = A.loadState(storage);
  let genre = A.ALL;
  let shown = GAMES.slice();
  let current = -1;
  let attractTimer = 0;
  let launching = false;

  // ---------------------------------------------------------------- sound

  let ctx = null;
  function tone(freq, time, dur, type = 'square', gain = 0.05) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    amp.gain.setValueAtTime(gain, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + dur);
  }
  function sfx(kind) {
    if (state.muted) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (_) {
      return;
    }
    const t = ctx.currentTime;
    if (kind === 'move') tone(660, t, 0.06, 'square', 0.025);
    else if (kind === 'filter') tone(440, t, 0.08, 'triangle', 0.05);
    else if (kind === 'coin') {
      tone(988, t, 0.08, 'square', 0.05);
      tone(1319, t + 0.08, 0.35, 'square', 0.05);
    } else if (kind === 'nope') {
      tone(220, t, 0.12, 'sawtooth', 0.04);
      tone(165, t + 0.12, 0.18, 'sawtooth', 0.04);
    }
  }

  // ---------------------------------------------------------------- build

  function coverOf(game) {
    return `games/${game.slug}/cover.svg`;
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function buildFilters() {
    const nav = $('filters');
    nav.replaceChildren();
    for (const name of A.genres(GAMES)) {
      const btn = el('button', 'filter', name);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(name === genre));
      btn.addEventListener('click', () => {
        genre = name;
        sfx('filter');
        for (const b of nav.children) b.setAttribute('aria-pressed', String(b === btn));
        buildRow();
        select(0, { focus: false });
      });
      nav.append(btn);
    }
  }

  function buildRow() {
    shown = A.filterGames(GAMES, genre);
    const row = $('row');
    row.replaceChildren();
    shown.forEach((game, i) => {
      const li = el('li');
      li.style.setProperty('--i', i);
      const cab = el('a', 'cab');
      cab.href = A.gamePath(game.slug);
      cab.dataset.slug = game.slug;
      cab.style.setProperty('--accent', game.accent);
      cab.setAttribute('aria-label', `${game.title}: ${game.tagline}`);
      if (A.blockedOffline(game, location.protocol)) cab.classList.add('is-blocked');

      const screen = el('div', 'cab-screen');
      const img = el('img');
      img.src = coverOf(game);
      img.alt = '';
      img.loading = 'lazy';
      img.width = 800;
      img.height = 500;
      screen.append(img, el('span', 'scan'));
      if (state.last === game.slug) screen.append(el('span', 'ribbon', 'Last played'));

      const panel = el('div', 'cab-panel');
      panel.append(el('span', 'stick'), el('span', 'knob a'), el('span', 'knob b'), el('span', 'cab-genre', game.genre));

      const marquee = el('div', 'cab-marquee', game.title);
      if (game.title.length > 14) marquee.classList.add('long');
      cab.append(marquee, screen, panel, el('p', 'cab-tag', game.tagline));
      cab.addEventListener('mouseenter', () => select(i, { focus: false, sound: false }));
      cab.addEventListener('focus', () => select(i, { focus: false, sound: false }));
      cab.addEventListener('click', (e) => {
        e.preventDefault();
        launch(game);
      });
      li.append(cab);
      row.append(li);
    });
  }

  // --------------------------------------------------------------- select

  function cabs() {
    return Array.from($('row').querySelectorAll('.cab'));
  }

  function select(i, { focus = true, sound = true } = {}) {
    if (!shown.length) return;
    const next = Math.min(Math.max(i, 0), shown.length - 1);
    const changed = next !== current || $('stage-title').textContent !== shown[next].title;
    current = next;
    cabs().forEach((c, n) => c.classList.toggle('is-current', n === current));
    if (focus) cabs()[current]?.focus({ preventScroll: false });
    if (changed) {
      renderStage(shown[current]);
      if (sound) sfx('move');
    }
  }

  function renderStage(game) {
    const stage = $('stage');
    stage.style.setProperty('--accent', game.accent);
    const img = $('stage-cover');
    const glass = img.parentElement;
    glass.classList.add('retune');
    img.src = coverOf(game);
    img.alt = `${game.title} cover art`;
    void glass.offsetWidth; // restart the tune-in animation
    glass.classList.remove('retune');

    $('stage-genre').textContent = game.genre;
    $('stage-title').textContent = game.title;
    $('stage-desc').textContent = game.description;

    const list = $('stage-controls');
    list.replaceChildren();
    for (const c of game.controls) list.append(el('li', 'chip', CONTROL_LABELS[c] || c));
    if (offline) {
      list.append(game.needsServer
        ? el('li', 'chip needs-server', '🔌 Needs npm run serve')
        : el('li', 'chip offline-ok', '✓ Works offline'));
    }

    const play = $('stage-play');
    play.href = A.gamePath(game.slug);
    play.setAttribute('aria-label', `Play ${game.title}`);
    const plays = state.plays[game.slug] || 0;
    $('stage-meta').textContent = plays ? `Played ${plays}×` : 'Never played. Give it a go!';
  }

  // --------------------------------------------------------------- launch

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 4200);
  }

  function launch(game) {
    if (launching) return;
    if (A.blockedOffline(game, location.protocol)) {
      sfx('nope');
      toast(`${game.title} needs the local server. Run "npm run serve" and open http://localhost:8000.`);
      return;
    }
    launching = true;
    stopAttract();
    state = A.recordPlay(state, game.slug);
    A.saveState(storage, state);
    sfx('coin');
    document.body.style.setProperty('--accent', game.accent);
    $('launch').style.setProperty('--accent', game.accent);
    document.body.classList.add('launching');
    setTimeout(() => location.assign(A.gamePath(game.slug)), reducedMotion.matches ? 0 : 520);
  }

  // Coming back with the browser Back button can restore this page from
  // the back/forward cache mid-launch, so reset it.
  addEventListener('pageshow', (e) => {
    launching = false;
    padPrev = null;
    document.body.classList.remove('launching');
    if (e.persisted) {
      state = A.loadState(storage);
      buildRow();
      select(current, { focus: false, sound: false });
    }
  });

  // ------------------------------------------------------------- controls

  function columns() {
    const list = cabs();
    if (list.length < 2) return 1;
    const top = list[0].getBoundingClientRect().top;
    let n = 0;
    for (const c of list) {
      if (Math.abs(c.getBoundingClientRect().top - top) > 4) break;
      n++;
    }
    return n;
  }

  function move(dir) {
    stopAttract();
    select(A.gridMove(current, dir, shown.length, columns()));
  }

  const KEY_DIRS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', Home: 'home', End: 'end',
  };

  addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const inFilters = e.target.closest && e.target.closest('.filters');
    const dir = KEY_DIRS[e.code];
    if (dir && !(inFilters && (dir === 'left' || dir === 'right'))) {
      e.preventDefault();
      move(dir);
    } else if ((e.code === 'Enter' || e.code === 'Space') && !inFilters && !e.target.closest?.('button')) {
      e.preventDefault();
      if (shown[current]) launch(shown[current]);
    } else if (e.code === 'KeyM') {
      toggleMute();
    }
  });

  $('stage-play').addEventListener('click', (e) => {
    e.preventDefault();
    if (shown[current]) launch(shown[current]);
  });

  function toggleMute() {
    state = { ...state, muted: !state.muted };
    A.saveState(storage, state);
    $('btn-mute').setAttribute('aria-pressed', String(state.muted));
    if (!state.muted) sfx('filter');
  }
  $('btn-mute').addEventListener('click', toggleMute);

  // Gamepads: d-pad or left stick to choose, A or Start to play. The first
  // reading only records what is already held, so a button still down from
  // leaving a game (A on "Back to arcade") does not relaunch it.
  let padPrev = null;
  let padRepeat = 0;
  function pollPads(now) {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    if (pads.length) {
      const p = pads[0];
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const held = {
        left: b(14) || ax < -0.5, right: b(15) || ax > 0.5,
        up: b(12) || ay < -0.5, down: b(13) || ay > 0.5,
        go: b(0) || b(9),
      };
      if (!padPrev) padPrev = held;
      for (const dir of ['left', 'right', 'up', 'down']) {
        if (held[dir] && (!padPrev[dir] || now > padRepeat)) {
          move(dir);
          padRepeat = now + (padPrev[dir] ? 140 : 380);
        }
      }
      if (held.go && !padPrev.go && shown[current]) launch(shown[current]);
      padPrev = held;
    }
    requestAnimationFrame(pollPads);
  }

  // Attract mode: until someone touches something, the big screen cycles
  // through the games like a cabinet waiting for a coin.
  function startAttract() {
    if (reducedMotion.matches) return;
    attractTimer = setInterval(() => {
      if (!document.hidden) select((current + 1) % shown.length, { focus: false, sound: false });
    }, 5200);
  }
  function stopAttract() {
    clearInterval(attractTimer);
    attractTimer = 0;
  }
  for (const type of ['pointerdown', 'keydown', 'wheel']) addEventListener(type, stopAttract, { once: true, passive: true });
  $('row').addEventListener('mouseenter', stopAttract, { once: true });

  // ----------------------------------------------------------------- boot

  $('game-count').textContent = `${GAMES.length} games`;
  $('btn-mute').setAttribute('aria-pressed', String(state.muted));
  $('offline').classList.toggle('hidden', !(offline && GAMES.some((g) => g.needsServer)));
  buildFilters();
  buildRow();
  select(Math.max(0, GAMES.findIndex((g) => g.slug === state.last)), { focus: false, sound: false });
  if (!state.last) startAttract();
  requestAnimationFrame(pollPads);
})();
