// Moonshot Mini Golf: screens, input, game flow and the frame loop.
(function () {
  'use strict';

  const P = window.MoonshotPhysics;
  const Play = window.MoonshotPlay;
  const Rules = window.MoonshotRules;
  const Holes = window.MoonshotHoles;
  const Auto = window.MoonshotAutoputt;
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;

  // Telemetry is optional: the game still runs if telemetry.js is missing.
  const telemetry = window.Telemetry || null;
  const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

  const params = new URLSearchParams(location.search);
  const AUTOPLAY = params.has('autoplay');
  const UNLOCK_ALL = params.has('unlock');

  const canvas = $('game');
  const renderer = new window.MoonshotRender(canvas);
  const audio = new window.MoonshotAudio();
  const save = Rules.loadSave(safeStorage());
  audio.setMuted(save.muted);

  let mode = 'title'; // title | worlds | play | paused | card | results
  let round = null;   // { worldIndex, holes, index, scores, picked }
  let play = null;
  let attract = null;
  let acc = 0;
  let finished = false;
  let cardTimer = -1;
  let idleAim = 0;
  let autoTimer = 0;
  let autoShot = null;

  // Aim state shared by mouse/touch, keyboard and gamepad.
  const aim = { angle: 0, power: 0.4, visible: false, charging: false, chargeT: 0, band: null, source: null, hint: false };
  let drag = null;

  function safeStorage() {
    try { return window.localStorage; } catch { return null; }
  }
  // ?autoplay is a debug mode: it never writes the player's save. Saving can
  // fail (private mode, full or blocked storage); play on and report it once.
  let saveWarned = false;
  function persist() {
    if (AUTOPLAY || Rules.writeSave(safeStorage(), save) || saveWarned) return;
    saveWarned = true;
    log.warn('save.failed', { 'storage.available': !!safeStorage() });
  }

  // Another tab saved: take its progress, so this tab never writes a stale
  // copy over it (whichever tab saved last used to win). A hole in progress
  // keeps going and records into the fresh copy.
  window.addEventListener('storage', (e) => {
    if (e.key !== Rules.SAVE_KEY && e.key !== null) return;
    const fresh = Rules.loadSave(safeStorage());
    for (const k of Object.keys(save)) delete save[k];
    Object.assign(save, fresh);
    audio.setMuted(save.muted);
    drawMuteIcon();
    if (mode === 'title') toTitle();
    else if (mode === 'worlds') toWorlds();
  });

  // ------------------------------------------------------------ layout

  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const hud = $('hud');
    const playing = !hud.classList.contains('hidden');
    renderer.insets.top = playing ? Math.ceil(hud.getBoundingClientRect().bottom) + 8 : 20;
    renderer.insets.bottom = playing ? 14 : 20;
    renderer.resize(w, h, dpr);
  }
  window.addEventListener('resize', layout);

  // ------------------------------------------------------------ screens

  const SCREENS = ['screen-title', 'screen-worlds', 'screen-pause', 'screen-card', 'screen-results'];
  function show(id) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
    const btn = id && $(id).querySelector('.btn.primary');
    if (btn && !matchMedia('(pointer: coarse)').matches) btn.focus({ preventScroll: true });
  }
  function setHud(on) {
    const was = !$('hud').classList.contains('hidden');
    $('hud').classList.toggle('hidden', !on);
    if (was !== on) layout();
  }

  function toTitle() {
    mode = 'title';
    setHud(false);
    hideBanner(true);
    show('screen-title');
    const total = Holes.WORLDS.reduce((n, w) => n + Rules.worldStars(save, Holes.holesIn(w.id)), 0);
    $('title-stars').textContent = total ? `★ ${total} of ${Holes.HOLES.length * 3} stars collected` : '18 holes · 3 worlds · no timers, just putting';
    startAttract();
  }

  function unlocked(i) {
    return UNLOCK_ALL || Rules.isWorldUnlocked(save, Holes.WORLDS, i);
  }

  function toWorlds() {
    mode = 'worlds';
    setHud(false);
    hideBanner(true);
    const list = $('world-list');
    list.innerHTML = '';
    let total = 0;
    Holes.WORLDS.forEach((w, i) => {
      const holes = Holes.holesIn(w.id);
      const stars = Rules.worldStars(save, holes);
      total += stars;
      const open = unlocked(i);
      const b = document.createElement('button');
      b.className = `world${open ? '' : ' locked'}`;
      b.style.setProperty('--w1', w.palette.sky1);
      b.style.setProperty('--w2', w.palette.floorDark);
      const best = save.rounds[w.id];
      const par = holes.reduce((n, h) => n + h.par, 0);
      b.innerHTML = `${planetSvg(w.id)}
        <h3>${w.name}</h3>
        <p>${w.blurb}</p>
        <div class="world-meta"><span class="st">★ ${stars} / ${holes.length * 3}</span><span>${best !== undefined ? `Best ${best} (${fmtDiff(best - par)})` : `Par ${par}`}</span></div>
        <div class="holes">${holes.map((h) => {
          const bs = save.best[h.id];
          const st = bs !== undefined ? Rules.starsFor(bs, h.par) : 0;
          return `<span class="s${st}" title="${h.name}">${bs !== undefined ? bs : h.number}</span>`;
        }).join('')}</div>
        ${open ? '' : `<span class="lock-badge">🔒 Finish ${Holes.WORLDS[i - 1].name}</span>`}`;
      b.setAttribute('aria-label', `${w.name}${open ? '' : ' (locked)'}`);
      b.addEventListener('click', () => {
        if (!open) { audio.click(); b.animate?.([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 250 }); return; }
        audio.click();
        startRound(i, 0);
      });
      list.appendChild(b);
    });
    $('worlds-stars').textContent = `★ ${total}`;
    show('screen-worlds');
    const first = list.querySelector('.world:not(.locked)');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }

  function planetSvg(id) {
    if (id === 'moon') {
      return `<svg class="world-planet" viewBox="0 0 200 120" aria-hidden="true"><circle cx="100" cy="62" r="46" fill="#d6d9f7"/><circle cx="100" cy="62" r="46" fill="url(#none)"/><circle cx="84" cy="48" r="10" fill="#a7acd9"/><circle cx="118" cy="74" r="14" fill="#a7acd9"/><circle cx="92" cy="86" r="6" fill="#a7acd9"/><circle cx="124" cy="42" r="5" fill="#a7acd9"/><path d="M66 40a46 46 0 0 1 40-24" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/><circle cx="165" cy="26" r="6" fill="#fff6c9"/><circle cx="30" cy="92" r="3" fill="#fff"/></svg>`;
    }
    if (id === 'mars') {
      return `<svg class="world-planet" viewBox="0 0 200 120" aria-hidden="true"><circle cx="100" cy="62" r="46" fill="#f08a55"/><path d="M58 50q42 14 84 0M56 72q44 14 88 0" stroke="#c4502c" stroke-width="7" fill="none" stroke-linecap="round" opacity=".6"/><circle cx="120" cy="46" r="8" fill="#ffc49a" opacity=".8"/><path d="M68 36a46 46 0 0 1 36-20" stroke="#ffe0c8" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/><ellipse cx="168" cy="30" rx="9" ry="6" fill="#b58d7e"/><circle cx="30" cy="30" r="3" fill="#fff"/></svg>`;
    }
    return `<svg class="world-planet" viewBox="0 0 200 120" aria-hidden="true"><ellipse cx="100" cy="64" rx="86" ry="20" fill="none" stroke="#ffe0a0" stroke-width="7" opacity=".55" transform="rotate(-10 100 64)"/><circle cx="100" cy="60" r="40" fill="#f3bd6a"/><path d="M62 50q38 10 76 0M61 68q39 10 78 0" stroke="#c98a44" stroke-width="6" fill="none" opacity=".6" stroke-linecap="round"/><path d="M18 80a86 20 -10 0 0 168 -34" stroke="#fff0c8" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="172" cy="22" r="4" fill="#fff"/></svg>`;
  }

  function fmtDiff(d) {
    return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`;
  }

  // ------------------------------------------------------------ round flow

  function startRound(worldIndex, index) {
    const w = Holes.WORLDS[worldIndex];
    const holes = Holes.holesIn(w.id);
    round = { worldIndex, world: w, holes, index, scores: holes.map(() => null), picked: holes.map(() => false) };
    log.event('round.start', { world: w.id, hole: index + 1, holes: holes.length, autoplay: AUTOPLAY });
    audio.unlock();
    startHole();
  }

  function startHole() {
    const def = round.holes[round.index];
    play = Play.createPlay(def, 0);
    attract = null;
    finished = false;
    cardTimer = -1;
    acc = 0;
    idleAim = 0;
    autoShot = null;
    autoTimer = 0;
    drag = null;
    aim.charging = false;
    aim.visible = false;
    aim.band = null;
    aim.power = 0.4;
    aimAtCup();
    mode = 'play';
    show(null);
    setHud(true);
    renderer.setHole(def);
    document.documentElement.style.setProperty('--accent', round.world.palette.accent);
    updateHud(true);
    showBanner(def);
  }

  function aimAtCup() {
    if (!play) return;
    aim.angle = Math.atan2(play.H.cup.y - play.sim.y, play.H.cup.x - play.sim.x);
  }

  function updateHud(reset) {
    const def = play.def;
    $('hud-world').textContent = round.world.name;
    $('hud-num').textContent = `Hole ${round.index + 1}`;
    $('hud-name').textContent = def.name;
    $('hud-par').textContent = def.par;
    const s = $('hud-strokes');
    if (s.textContent !== String(play.strokes)) {
      s.textContent = play.strokes;
      if (!reset) { s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
    }
    s.classList.toggle('over', play.strokes > def.par);
  }

  let bannerTimer = 0;
  function showBanner(def) {
    const b = $('banner');
    $('banner-top').textContent = `${round.world.name} · Hole ${round.index + 1} of ${round.holes.length} · Par ${def.par}`;
    $('banner-name').textContent = def.name;
    $('banner-tip').textContent = def.tip;
    b.classList.remove('hidden', 'out');
    // Keep the ball in view: if it starts in the lower part of the screen,
    // show the intro under the HUD instead of along the bottom.
    const ball = renderer.toScreen(play.sim.x, play.sim.y);
    const low = ball.y > window.innerHeight * 0.5;
    b.classList.toggle('top', low);
    if (low) b.style.setProperty('--banner-top', `${Math.ceil($('hud').getBoundingClientRect().bottom) + 8}px`);
    bannerTimer = 5.5;
  }
  function hideBanner(now) {
    const b = $('banner');
    if (b.classList.contains('hidden')) return;
    bannerTimer = 0;
    if (now || renderer.reduced) { b.classList.add('hidden'); return; }
    b.classList.add('out');
    setTimeout(() => { if (b.classList.contains('out')) b.classList.add('hidden'); }, 400);
  }

  function finishHole() {
    finished = true;
    const def = play.def;
    const name = Rules.scoreName(play.strokes, def.par, play.pickedUp);
    round.scores[round.index] = play.strokes;
    round.picked[round.index] = play.pickedUp;
    const rec = Rules.recordHole(save, def, play.strokes, play.pickedUp);
    persist();
    log.event('hole.complete', {
      world: round.world.id, hole: round.index + 1, 'hole.id': def.id, par: def.par, strokes: play.strokes,
      stars: rec.stars, 'picked.up': !!play.pickedUp, penalties: play.penalties || 0, 'best.new': rec.newBest,
    });
    renderer.celebrate(name.text, name.tier);
    audio.cheer(name.tier);
    play.result = { name, rec };
    cardTimer = name.tier >= 3 ? 2.2 : 1.5;
    hideBanner();
  }

  function showCard() {
    mode = 'card';
    const def = play.def;
    const { name, rec } = play.result;
    $('card-kicker').textContent = `Hole ${round.index + 1} · ${def.name}`;
    $('card-title').textContent = name.text;
    const stars = [...$('card-stars').children];
    stars.forEach((s, i) => s.classList.toggle('on', i < rec.stars));
    for (let i = 0; i < rec.stars; i++) setTimeout(() => audio.star(i), 180 * i + 120);
    const parts = [play.pickedUp ? `Picked up after ${play.strokes} strokes` : `${play.strokes} stroke${play.strokes === 1 ? '' : 's'} on a par ${def.par}`];
    if (play.penalties) parts.push(`${play.penalties} penalty`);
    if (rec.newBest && rec.prev !== undefined) parts.push('New best!');
    $('card-detail').textContent = parts.join(' · ');
    $('card-table').innerHTML = tableHtml(round.index);
    const last = round.index === round.holes.length - 1;
    $('btn-card-next').textContent = last ? 'Finish round →' : 'Next hole →';
    show('screen-card');
  }

  function tableHtml(current, final = false) {
    const hs = round.holes;
    let parTot = 0, youTot = 0;
    const cells = hs.map((h, i) => {
      const s = round.scores[i];
      parTot += h.par;
      if (s !== null) youTot += s;
      let cls = '';
      if (s !== null) cls = s === 1 && !round.picked[i] ? 'ace' : s < h.par ? 'under' : s === h.par ? 'even' : 'over';
      if (i === current) cls += ' cur';
      return { h, s, cls };
    });
    const played = round.scores.filter((s) => s !== null).length;
    const parPlayed = hs.reduce((n, h, i) => n + (round.scores[i] !== null ? h.par : 0), 0);
    return `<tr class="head"><th>Hole</th>${cells.map((c, i) => `<td>${i + 1}</td>`).join('')}<td>Tot</td></tr>
      <tr><th>Par</th>${cells.map((c) => `<td>${c.h.par}</td>`).join('')}<td class="tot">${parTot}</td></tr>
      <tr><th>You</th>${cells.map((c) => `<td class="${c.cls}">${c.s === null ? '·' : c.s}</td>`).join('')}<td class="tot">${played ? `${youTot}` : '·'}</td></tr>
      ${played ? `<tr class="head"><th></th><td colspan="${hs.length}">${fmtDiff(youTot - parPlayed)} ${final ? 'vs par' : 'vs par so far'}</td><td></td></tr>` : ''}`;
  }

  function nextHole() {
    audio.click();
    if (round.index < round.holes.length - 1) {
      round.index += 1;
      startHole();
    } else showResults();
  }

  function retryHole() {
    audio.click();
    log.event('hole.retry', { world: round.world.id, hole: round.index + 1, strokes: play ? play.strokes : 0 });
    round.scores[round.index] = null;
    round.picked[round.index] = false;
    startHole();
  }

  function showResults() {
    mode = 'results';
    const total = round.scores.reduce((a, b) => a + b, 0);
    const par = round.holes.reduce((n, h) => n + h.par, 0);
    const wasUnlocked = round.worldIndex + 1 < Holes.WORLDS.length && Rules.isWorldUnlocked(save, Holes.WORLDS, round.worldIndex + 1);
    const rec = Rules.recordRound(save, round.world.id, total);
    persist();
    const stars = round.holes.reduce((n, h, i) => n + Rules.starsFor(round.scores[i], h.par, round.picked[i]), 0);
    log.event('round.complete', { world: round.world.id, strokes: total, par, stars, 'best.new': rec.newBest });
    $('res-kicker').textContent = 'Round complete';
    $('res-title').textContent = `${round.world.name} cleared!`;
    $('res-score').textContent = `${total} strokes (${fmtDiff(total - par)})`;
    $('res-detail').textContent = `★ ${stars} of ${round.holes.length * 3} stars this round${rec.newBest && rec.prev !== undefined ? ' · New best round!' : rec.prev !== undefined ? ` · Best ${Math.min(rec.prev, total)}` : ''}`;
    $('res-table').innerHTML = tableHtml(-1, true);
    const next = Holes.WORLDS[round.worldIndex + 1];
    const un = $('res-unlock');
    un.classList.toggle('hidden', !(next && !wasUnlocked));
    if (next) un.textContent = `🚀 ${next.name} unlocked!`;
    const row = $('res-buttons');
    row.innerHTML = '';
    const add = (label, primary, fn) => {
      const b = document.createElement('button');
      b.className = `btn${primary ? ' primary' : ''}`;
      b.textContent = label;
      b.addEventListener('click', () => { audio.click(); fn(); });
      row.appendChild(b);
    };
    if (next) add(`Fly to ${next.name} →`, true, () => startRound(round.worldIndex + 1, 0));
    add('Play again', !next, () => startRound(round.worldIndex, 0));
    add('World map', false, toWorlds);
    renderer.throwConfetti(renderer.reduced ? 60 : 160);
    audio.cheer(3);
    show('screen-results');
  }

  function pause() {
    if (mode !== 'play') return;
    mode = 'paused';
    cancelAim();
    $('pause-where').textContent = `${round.world.name} · Hole ${round.index + 1} · ${play.def.name}`;
    $('btn-pause-sound').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
    show('screen-pause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = 'play';
    show(null);
    acc = 0;
  }

  function toggleMute() {
    save.muted = !save.muted;
    audio.setMuted(save.muted);
    persist();
    drawMuteIcon();
    $('btn-pause-sound').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
    if (!save.muted) { audio.unlock(); audio.click(); }
  }
  function drawMuteIcon() {
    const on = !save.muted;
    $('btn-mute').setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
    $('btn-mute').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${on
      ? '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'
      : '<path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'}</svg>`;
  }

  // ------------------------------------------------------------ attract mode

  function startAttract() {
    const pool = Holes.HOLES.filter((h) => unlocked(Holes.WORLDS.findIndex((w) => w.id === h.world)));
    const def = pool[Math.floor(Math.random() * pool.length)];
    attract = { play: Play.createPlay(def, 0), wait: 1.2, done: 0 };
    renderer.setHole(def);
  }

  function stepAttract(dt) {
    const a = attract;
    if (!a) return;
    const p = a.play;
    if (p.status === 'holed') {
      a.done += dt;
      if (a.done > 2) startAttract();
    } else if (p.status === 'ready') {
      a.wait -= dt;
      if (a.wait <= 0) {
        const s = Auto.planShot(p, { angles: 24, powers: [0.15, 0.3, 0.45, 0.6, 0.8, 1], waits: [0] });
        Play.putt(p, s.angle, s.power);
        a.wait = 1.4;
      }
    }
    acc += dt;
    while (acc >= P.STEP) { Play.stepPlay(p); acc -= P.STEP; }
    renderer.handleEvents(p.events, p);
    renderer.popups.length = 0; // no "+1" or "Lipped out!" text over the menus
    p.events.length = 0;
  }

  // ------------------------------------------------------------ input: pointer

  function maxPull() {
    return Math.max(110, Math.min(240, Math.min(window.innerWidth, window.innerHeight) * 0.32));
  }

  function canAim() {
    return mode === 'play' && play && play.status === 'ready' && !AUTOPLAY;
  }

  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    if (!canAim()) return;
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* optional */ }
    aim.source = 'drag';
    aim.charging = false;
    aim.power = 0;
    aim.band = null;
    aim.visible = false;
    if (bannerTimer > 0) hideBanner();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = drag.x - e.clientX, dy = drag.y - e.clientY;
    const len = Math.hypot(dx, dy);
    if (len < 6 && !drag.moved) return;
    drag.moved = true;
    const wv = renderer.vecToWorld(dx, dy);
    aim.angle = Math.atan2(wv.y, wv.x);
    aim.power = Math.min(1, len / maxPull());
    const back = renderer.vecToWorld(-dx, -dy);
    const bl = Math.hypot(back.x, back.y) || 1;
    const blen = Math.min(bl, 40 + aim.power * 90);
    aim.band = { x: (back.x / bl) * blen, y: (back.y / bl) * blen };
    aim.visible = aim.power > 0.03;
  });
  const endDrag = (e, cancel) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    if (!cancel && aim.visible && aim.power >= 0.04 && canAim()) shoot(aim.angle, aim.power);
    aim.visible = false;
    aim.band = null;
  };
  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  function cancelAim() {
    drag = null;
    aim.visible = false;
    aim.charging = false;
    aim.band = null;
  }

  function shoot(angle, power) {
    if (!play || play.status !== 'ready') return;
    Play.putt(play, angle, power);
    idleAim = 0;
    aim.visible = false;
    aim.charging = false;
    aim.band = null;
    if (bannerTimer > 0) hideBanner();
  }

  // ------------------------------------------------------------ input: keyboard

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    const k = e.code;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(k) && mode === 'play') e.preventDefault();
    if (e.repeat) { keys.add(k); return; }
    keys.add(k);
    audio.unlock();
    if (k === 'Escape' || k === 'KeyP') {
      if (mode === 'play') pause();
      else if (mode === 'paused') resume();
      return;
    }
    if (k === 'KeyM') { toggleMute(); return; }
    if (mode !== 'play') return;
    if (k === 'KeyR') { retryHole(); return; }
    if ((k === 'Space' || k === 'Enter') && canAim()) {
      aim.source = 'key';
      aim.visible = true;
      aim.charging = true;
      aim.chargeT = 0;
      aim.power = 0;
      if (bannerTimer > 0) hideBanner();
    }
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(k) && canAim()) {
      if (!aim.visible) { aim.visible = true; aim.source = 'key'; if (!aim.charging) aim.power = aim.keyPower || 0.4; }
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if ((e.code === 'Space' || e.code === 'Enter') && aim.charging && aim.source === 'key') {
      aim.charging = false;
      if (aim.power >= 0.03 && canAim()) {
        aim.keyPower = aim.power;
        shoot(aim.angle, aim.power);
      }
    }
  });
  window.addEventListener('blur', () => { keys.clear(); if (mode === 'play') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pause(); });

  function chargeCurve(t) {
    // Rises to full in 1.3s, then eases back down so holding never maxes forever.
    const x = (t / 1.3) % 2;
    return x < 1 ? x : 2 - x;
  }

  function keyAim(dt) {
    if (!canAim()) return;
    const slow = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const rate = slow ? 0.35 : 1.5;
    let turn = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) turn -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) turn += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) turn -= 0.25;
    if (keys.has('ArrowDown') || keys.has('KeyS')) turn += 0.25;
    if (turn) { aim.angle += turn * rate * dt; aim.visible = true; aim.source = aim.source || 'key'; }
    if (aim.charging) {
      aim.chargeT += dt;
      aim.power = Math.max(0.02, chargeCurve(aim.chargeT));
    }
  }

  // ------------------------------------------------------------ input: gamepad

  const pad = { a: false, b: false, start: false, active: false };
  function pollPad(dt) {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!gp) return;
    const btn = (i) => !!gp.buttons[i]?.pressed;
    const a = btn(0), b = btn(1), start = btn(9);
    if (start && !pad.start) {
      audio.unlock();
      if (mode === 'play') pause();
      else if (mode === 'paused') resume();
    }
    if (mode !== 'play') {
      if (a && !pad.a) {
        const focused = document.activeElement;
        if (focused && focused.matches('.btn, .world')) focused.click();
        else document.querySelector('.screen:not(.hidden) .btn.primary, .screen:not(.hidden) .world:not(.locked)')?.click();
      }
    } else if (canAim()) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.45) {
        const wv = renderer.vecToWorld(ax, ay);
        aim.angle = Math.atan2(wv.y, wv.x);
        aim.visible = true;
        pad.active = true;
        if (!aim.charging) aim.power = aim.keyPower || 0.4;
      }
      if (btn(14)) { aim.angle -= 1.2 * dt; aim.visible = true; }
      if (btn(15)) { aim.angle += 1.2 * dt; aim.visible = true; }
      if (a && !pad.a) { aim.charging = true; aim.chargeT = 0; aim.source = 'pad'; aim.visible = true; audio.unlock(); }
      if (!a && pad.a && aim.charging && aim.source === 'pad') {
        aim.charging = false;
        if (aim.power >= 0.03) { aim.keyPower = aim.power; shoot(aim.angle, aim.power); }
      }
      if (b && !pad.b && aim.charging) { aim.charging = false; aim.power = aim.keyPower || 0.4; }
      if (aim.charging && aim.source === 'pad') { aim.chargeT += dt; aim.power = Math.max(0.02, chargeCurve(aim.chargeT)); }
    }
    pad.a = a;
    pad.b = b;
    pad.start = start;
  }

  // ------------------------------------------------------------ pointer hiding

  let pointerIdle = 0, pointerHidden = false;
  window.addEventListener('mousemove', () => { pointerIdle = 0; });
  function updatePointer(dt) {
    pointerIdle += dt;
    const hide = mode === 'play' && pointerIdle > 2;
    if (hide !== pointerHidden) {
      pointerHidden = hide;
      document.body.classList.toggle('no-cursor', hide);
    }
  }

  // ------------------------------------------------------------ autoplay (debug)

  function stepAutoplay(dt) {
    if (!AUTOPLAY || !play) return;
    if (mode === 'card') {
      autoTimer += dt;
      if (autoTimer > 1.8) { autoTimer = 0; nextHole(); }
      return;
    }
    if (mode !== 'play' || play.status !== 'ready' || autoShot) return;
    autoTimer += dt;
    if (autoTimer < 0.6) return;
    autoTimer = 0;
    // Wait the same number of fixed steps the planner simulated, so the
    // shot replays exactly even with moving scenery.
    autoShot = Auto.planShot(play);
    let steps = 0;
    for (let w = 0; w < autoShot.wait; w += P.STEP) steps++;
    autoShot.steps = steps;
    aim.visible = true;
    aim.angle = autoShot.angle;
    aim.power = autoShot.power;
  }

  function stepGame() {
    if (AUTOPLAY && autoShot && play.status === 'ready') {
      if (autoShot.steps <= 0) {
        Play.putt(play, autoShot.angle, autoShot.power);
        aim.visible = false;
        autoShot = null;
      } else autoShot.steps--;
    }
    Play.stepPlay(play);
  }

  // ------------------------------------------------------------ loop

  // Frame telemetry: slow frames, struggling 10 s windows, and a watchdog
  // outside the loop that notices when frames stop while the page is visible.
  const monitor = window.MoonshotPerf.frameMonitor({
    log,
    snapshot: () => ({
      mode, world: round ? round.world.id : 'none', hole: round ? round.index + 1 : 0,
      status: play ? play.status : 'none', attract: !!attract,
    }),
    visible: () => document.visibilityState === 'visible',
    crashed: () => !!(telemetry && telemetry.crashed),
  });
  setInterval(() => monitor.check(performance.now()), 1000);
  document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

  let last = performance.now();
  function frame(now) {
    monitor.frame(now);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pollPad(dt);
    updatePointer(dt);

    if (mode === 'title' || mode === 'worlds') {
      stepAttract(dt);
      renderer.update(dt);
      renderer.render(attract && attract.play, null);
    } else if (play) {
      if (mode === 'play') {
        keyAim(dt);
        stepAutoplay(dt);
        acc += dt;
        while (acc >= P.STEP) { stepGame(); acc -= P.STEP; }
        if (play.events.length) {
          audio.handle(play.events);
          renderer.handleEvents(play.events, play);
          play.events.length = 0;
          updateHud(false);
        }
        if (play.status !== 'ready' && aim.visible && !AUTOPLAY) cancelAim();
        if (play.status === 'holed' && !finished) finishHole();
        if (finished && cardTimer > 0) {
          cardTimer -= dt;
          if (cardTimer <= 0) showCard();
        }
        if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) hideBanner(); }
        // Friendly first-hole hint after a moment of no aiming.
        if (play.status === 'ready' && play.strokes === 0 && round.worldIndex === 0 && round.index === 0 && !aim.visible && !drag) idleAim += dt;
        else idleAim = 0;
      } else if (mode === 'card' || mode === 'results') {
        stepAutoplay(dt);
        acc += dt;
        while (acc >= P.STEP) { Play.stepPlay(play); acc -= P.STEP; }
        play.events.length = 0;
      }
      renderer.update(mode === 'paused' ? 0 : dt);
      let view = null;
      if (mode === 'play' && aim.visible) view = aim;
      else if (mode === 'play' && idleAim > 2.2) {
        play.hintText = matchMedia('(pointer: coarse)').matches ? 'Drag back, then let go!' : 'Drag back and release, or hold Space';
        view = { hint: true };
      }
      renderer.render(play, view);
    }
    requestAnimationFrame(loop);
  }
  // A crash inside a frame shows the crash screen instead of a frozen picture;
  // after a crash the guard returns early, so the loop stops rescheduling.
  const loop = telemetry ? telemetry.guard(frame, 'moonshot-golf.frame') : frame;

  // ------------------------------------------------------------ wiring

  $('btn-play').addEventListener('click', () => { audio.unlock(); audio.click(); toWorlds(); });
  $('btn-worlds-back').addEventListener('click', () => { audio.click(); toTitle(); });
  $('btn-pause').addEventListener('click', () => { audio.click(); pause(); });
  $('btn-mute').addEventListener('click', toggleMute);
  $('btn-resume').addEventListener('click', () => { audio.click(); resume(); });
  $('btn-retry').addEventListener('click', retryHole);
  $('btn-pause-map').addEventListener('click', () => { audio.click(); toWorlds(); });
  $('btn-pause-sound').addEventListener('click', toggleMute);
  $('btn-card-next').addEventListener('click', nextHole);
  $('btn-card-retry').addEventListener('click', retryHole);

  drawMuteIcon();
  layout();
  log.event('game.ready', {
    'worlds.completed': Object.keys(save.completed).length,
    'holes.played': Object.keys(save.best).length,
  });

  // Debug and testing: ?hole=7 jumps straight to a hole, ?unlock opens every
  // world, ?autoplay lets the autoputter play.
  const jump = Number(params.get('hole'));
  if (jump >= 1 && jump <= Holes.HOLES.length) {
    const def = Holes.HOLES[jump - 1];
    const wi = Holes.WORLDS.findIndex((w) => w.id === def.world);
    startRound(wi, Holes.holesIn(def.world).indexOf(def));
  } else if (params.has('worlds')) {
    toWorlds();
    startAttract();
  } else toTitle();
  requestAnimationFrame(loop);

  window.MG = { get play() { return play; }, get mode() { return mode; }, get round() { return round; }, renderer, save, startRound, shoot, aim };
})();
