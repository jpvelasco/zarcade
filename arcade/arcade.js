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
    } else if (kind === 'secret') {
      // A little "you found it" fanfare, then the coin.
      [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.14, 'square', 0.04));
      tone(1319, t + 0.4, 0.45, 'triangle', 0.05);
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
    for (const name of A.genres(GAMES, state.plays)) {
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
    shown = A.filterGames(GAMES, genre, state.plays);
    const row = $('row');
    row.replaceChildren();
    shown.forEach((game, i) => {
      const li = el('li');
      li.style.setProperty('--i', i);
      const cab = el('a', 'cab');
      cab.href = A.gamePath(game.slug);
      cab.dataset.slug = game.slug;
      cab.style.setProperty('--accent', game.accent);
      // No aria-label: the cabinet is named by what it shows (title, ribbon,
      // genre, tagline), so voice control can say exactly what it reads.
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
      else if (A.isNew(game, state.plays)) screen.append(el('span', 'ribbon new', 'New'));

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

  // ---------------------------------------------------------------- psst

  // The sign has a secret name. Type the old cabinet code (or tap the coin
  // five times) and a buzzing neon Z flickers on in front of ARCADE.
  let secretStep = 0;
  let coinTaps = [];
  let secretTimer = 0;
  function revealSecret() {
    const main = document.querySelector('.logo-main');
    if (!main) return;
    if (!main.querySelector('.logo-z')) {
      const z = document.createElement('span');
      z.className = 'logo-z';
      z.textContent = 'Z';
      main.prepend(z);
    }
    document.body.classList.add('secret');
    sfx('secret');
    toast('🕹️ Secret found! This place has another name: Zarcade.');
    // The arrows in the code also walk the cabinets down the page: bring the
    // sign back into view so the Z is actually seen. It stays for the visit;
    // only the rainbow bulbs settle down.
    scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    clearTimeout(secretTimer);
    secretTimer = setTimeout(() => document.body.classList.remove('secret'), 9000);
  }
  document.querySelector('.coin')?.addEventListener('pointerdown', () => {
    const r = A.tapStreak(coinTaps, performance.now());
    coinTaps = r.times;
    if (r.fired) revealSecret();
  });

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
      // The game just played may no longer be new, which can empty the New
      // shelf or drop its chip, so rebuild the chips too.
      if (!A.genres(GAMES, state.plays).includes(genre)) genre = A.ALL;
      buildFilters();
      buildRow();
      select(current, { focus: false, sound: false });
    }
  });

  // ------------------------------------------------------------- controls

  function columns() {
    const list = cabs();
    if (list.length < 2) return 1;
    // offsetTop ignores the lift and rise transforms, so a raised card still
    // counts as part of its row.
    const top = list[0].parentElement.offsetTop;
    let n = 0;
    for (const c of list) {
      if (c.parentElement.offsetTop !== top) break;
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
    if (e.altKey || e.metaKey || e.ctrlKey || $('help').open) return;
    secretStep = A.konamiStep(secretStep, e.code);
    if (secretStep === A.KONAMI.length) { secretStep = 0; revealSecret(); }
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
    if (pads.length && !$('help').open) {
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

  // --------------------------------------------------- install the arcade

  // A browser that can offer a real install (beforeinstallprompt) gets the
  // button; Safari on iOS/iPadOS has no such event, so it gets the
  // share-sheet hint instead. The decision lives in logic.installMode so it
  // can be tested without a phone.
  const DISMISS_KEY = 'arcade.v1.installDismissed';
  let installPrompt = null;
  const isStandalone = matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS poses as Mac

  function dismissedInstall() {
    try { return storage?.getItem(DISMISS_KEY) === '1'; } catch (_) { return false; }
  }

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // our button re-triggers the browser prompt
    installPrompt = e;
    if (A.installMode({ canPrompt: true, standalone: isStandalone, dismissed: dismissedInstall() }) === 'button') {
      $('btn-install').classList.remove('hidden');
    }
  });

  if (A.installMode({ ios: isIOS, standalone: isStandalone, dismissed: dismissedInstall() }) === 'hint') {
    $('install-hint').classList.remove('hidden');
  }

  $('btn-install').addEventListener('click', () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then(() => {
      installPrompt = null;
      $('btn-install').classList.add('hidden');
    });
  });

  $('install-hint-close').addEventListener('click', () => {
    $('install-hint').classList.add('hidden');
    try { storage?.setItem(DISMISS_KEY, '1'); } catch (_) { /* session only */ }
  });

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

  // ------------------------------------------------------- help & support

  // Every game keeps its own telemetry log under `<slug>.v1.log` on this
  // origin, so the arcade can gather them into one support report.
  const T = window.Telemetry;

  function gameLogs() {
    const sources = [{ slug: 'arcade', title: 'Starlight Arcade' }, ...GAMES];
    return sources.map((game) => {
      let records = [];
      try {
        records = T ? T.loadRecords(localStorage, game.slug) : [];
      } catch (_) {
        records = [];
      }
      return { game, records, summary: A.problemSummary(records) };
    });
  }

  function timeAgo(ms) {
    const minutes = Math.round((Date.now() - ms) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
  }

  function renderHelp() {
    const list = $('help-games');
    list.replaceChildren();
    for (const { game, summary } of gameLogs()) {
      if (!summary.records) continue;
      const item = el('li', `help-game${summary.errors ? ' has-errors' : ''}`);
      const name = el('b', null, game.title);
      const status = summary.errors
        ? `${summary.errors} problem${summary.errors === 1 ? '' : 's'} · last: ${summary.lastProblem.body} (${timeAgo(summary.lastProblem.time)})`
        : summary.slow ? `${summary.slow} slow moment${summary.slow === 1 ? '' : 's'} · no errors` : 'All good';
      item.append(name, el('span', null, status));
      list.append(item);
    }
    if (!list.children.length) list.append(el('li', 'help-game', 'No logs yet. Play a game and they will show up here.'));
    const endpoint = safeEndpoint();
    $('send-logs').checked = !!endpoint;
    $('otlp-endpoint').value = endpoint ? endpoint.replace(/\/v1\/logs$/, '') : (offline ? '' : location.origin);
    $('otlp-endpoint').disabled = !endpoint;
  }

  function safeEndpoint() {
    try {
      return localStorage.getItem(T ? T.ENDPOINT_KEY : 'telemetry.v1.endpoint') || '';
    } catch (_) {
      return '';
    }
  }

  function setEndpoint(value) {
    try {
      if (value) localStorage.setItem(T.ENDPOINT_KEY, value);
      else localStorage.removeItem(T.ENDPOINT_KEY);
    } catch (_) {
      // Storage blocked: sending stays off.
    }
    if (T) T.log.setEndpoint(value);
  }

  function helpStatus(text) {
    $('help-status').textContent = text;
  }

  $('btn-help').addEventListener('click', () => {
    stopAttract();
    renderHelp();
    helpStatus('');
    $('help').showModal();
  });

  $('btn-copy-report').addEventListener('click', async () => {
    const parts = gameLogs()
      .filter(({ records }) => records.length)
      .map(({ game, records }) => T.formatReport(game.slug, { 'service.name': game.slug }, records, 40));
    const report = [`Starlight Arcade diagnostics, ${new Date().toISOString()}`, `user_agent: ${navigator.userAgent}`, '', ...parts].join('\n\n');
    try {
      await navigator.clipboard.writeText(report);
      helpStatus('Report copied. Paste it into a message to whoever looks after the arcade.');
    } catch (_) {
      helpStatus('Could not reach the clipboard. The report is in the browser console.');
      console.log(report);
    }
  });

  $('btn-clear-logs').addEventListener('click', () => {
    for (const { game } of gameLogs()) {
      try {
        localStorage.removeItem(T.logKey(game.slug));
      } catch (_) {
        // Nothing to clear.
      }
    }
    if (T) T.log.clear();
    renderHelp();
    helpStatus('Logs cleared.');
  });

  $('send-logs').addEventListener('change', (e) => {
    const value = e.target.checked ? ($('otlp-endpoint').value.trim() || location.origin) : '';
    setEndpoint(value);
    $('otlp-endpoint').disabled = !value;
    helpStatus(value ? `Games will send logs to ${T.normalizeEndpoint(value)}.` : 'Sending is off. Logs stay on this device.');
    if (value) T.log.event('telemetry.enabled', { endpoint: T.normalizeEndpoint(value) });
  });

  $('otlp-endpoint').addEventListener('change', (e) => {
    if (!$('send-logs').checked) return;
    const value = e.target.value.trim();
    setEndpoint(value);
    helpStatus(value ? `Games will send logs to ${T.normalizeEndpoint(value)}.` : 'Sending is off.');
  });

  if (!T) $('btn-help').hidden = true;

  // ----------------------------------------------------------------- boot

  $('game-count').textContent = `${GAMES.length} games`;
  $('btn-mute').setAttribute('aria-pressed', String(state.muted));
  $('offline').classList.toggle('hidden', !(offline && GAMES.some((g) => g.needsServer)));
  buildFilters();
  buildRow();
  select(Math.max(0, GAMES.findIndex((g) => g.slug === state.last)), { focus: false, sound: false });
  if (!state.last) startAttract();
  requestAnimationFrame(pollPads);

  // ---------------------------------------------------------- service worker

  // Caches the arcade shell for offline relaunch. Only deployment origins
  // (https) register the worker; on the dev server it is opt-in with ?sw=1,
  // and file:// has no service workers at all.
  const swEnabled = 'serviceWorker' in navigator && (location.protocol === 'https:' || location.search.includes('sw=1'));
  if (swEnabled) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* The arcade works fine without the worker; the next visit retries. */
    });
  }
})();
