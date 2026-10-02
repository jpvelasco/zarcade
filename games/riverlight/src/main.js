// Screens, input and the frame loop for Riverlight.
import { LEVEL_COUNT, SEASONS, TWISTS, getLevel, seasonLevels, zenLevel } from './levels.js';
import { Game, autoplay, starTargets } from './game.js';
import { View, THEME_ORDER } from './render.js';
import { Audio } from './audio.js';
import { loadSave, writeSave, totalStars, recordWin, isUnlocked, SAVE_KEY } from './save.js';
import { stepCursor } from './topology.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
let saveWarned = false;
function persist() {
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

// Another tab saved: take its progress, so this tab never writes a stale copy
// over it. A garden in progress keeps going and records into the fresh copy.
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY && e.key !== null) return;
  const fresh = loadSave(storage);
  for (const key of Object.keys(save)) delete save[key];
  Object.assign(save, fresh);
  audio.setSound(save.sound);
  audio.setMusic(save.music);
  syncToggles();
  if (mode === 'title') refreshTitle();
  else if (mode === 'map') renderMap();
});

const audio = new Audio({ sound: save.sound, music: save.music });
const canvas = $('garden');
const view = new View(canvas, { reduceMotion });
const unlockAll = params.has('unlock');
const autoMode = params.has('autoplay');

let mode = 'title'; // title | map | intro | play | pause | won | results | photo
let game = null;
let level = null;
let levelStartedAt = 0;
let resultsTimer = 0;
let resultsShownAt = 0;
let attract = null;
let attractWait = 0;
let attractSeed = 1 + (Date.now() % 9973);
let autoWait = 0;

const themeOf = (lvl) => THEME_ORDER[lvl.season] || 'spring';

// ------------------------------------------------------------------ screens

const SCREENS = ['screen-title', 'screen-map', 'screen-intro', 'screen-pause', 'screen-results'];
function show(next) {
  mode = next;
  const map = { title: 'screen-title', map: 'screen-map', intro: 'screen-intro', pause: 'screen-pause', results: 'screen-results' };
  for (const id of SCREENS) $(id).classList.toggle('hidden', map[next] !== id);
  const inGarden = ['play', 'pause', 'won', 'intro'].includes(next);
  $('hud').classList.toggle('hidden', !inGarden && next !== 'results');
  $('bar').classList.toggle('hidden', !['play', 'won'].includes(next) && next !== 'pause');
  $('photo-bar').classList.toggle('hidden', next !== 'photo');
  view.photo = next === 'photo';
  if (next !== 'play') document.body.classList.remove('no-cursor');
  layout();
}

function setSeason(key) {
  document.body.dataset.season = key;
  const colors = { spring: '#cfe8b8', summer: '#a9dccf', autumn: '#f2c68f', winter: '#d5e2f0', night: '#1b2140', lotus: '#e7cde6' };
  document.querySelector('meta[name="theme-color"]').setAttribute('content', colors[key] || '#cfe8b8');
  audio.setSeason(key);
}

// Short landscape screens (phones on their side) move the bar to the right
// edge so the garden gets the full height. Keep in step with style.css.
const sideways = matchMedia('(orientation: landscape) and (max-height: 500px)');

function insets() {
  if (mode === 'title') return { top: 0, bottom: 0, left: 0, right: 0 };
  if (mode === 'photo') return { top: 20, bottom: 70, left: 10, right: 10 };
  const side = sideways.matches;
  const phone = innerWidth < 560;
  const base = side
    ? { top: 6, bottom: 6, left: 190, right: 120 }
    : { top: phone ? 66 : 70, bottom: phone ? 82 : 86, left: 6, right: 6 };
  if (mode === 'results') {
    // Fit the finished garden into the space the results card leaves free.
    const card = document.querySelector('.results-card');
    if (side) return { ...base, top: 66, left: 6, right: card.offsetWidth + 24 };
    return { ...base, bottom: card.offsetHeight + 36 };
  }
  return base;
}

function layout() {
  view.resize(innerWidth, innerHeight, insets());
}

function syncToggles() {
  for (const el of document.querySelectorAll('[data-sound]')) el.textContent = `Sound: ${save.sound ? 'on' : 'off'}`;
  for (const el of document.querySelectorAll('[data-music]')) el.textContent = `Music: ${save.music ? 'on' : 'off'}`;
  $('btn-sound').textContent = save.sound ? '🔊' : '🔇';
}

function toTitle() {
  if (game && mode !== 'title' && !game.solved && level && !level.zen) {
    log.event('level.leave', { level: level.id, moves: game.moves });
  }
  game = null;
  level = null;
  setSeason('spring');
  show('title');
  newAttract();
  refreshTitle();
}

function refreshTitle() {
  const stars = totalStars(save);
  const cleared = Object.keys(save.stars).length;
  const next = continueId();
  $('title-progress').textContent = cleared
    ? `★ ${stars} of ${LEVEL_COUNT * 3} · ${cleared} garden${cleared === 1 ? '' : 's'} in bloom${save.zen ? ` · ${save.zen} zen` : ''}`
    : `${LEVEL_COUNT} gardens across ${SEASONS.length} seasons`;
  $('btn-play').textContent = cleared || save.current ? `Continue · garden ${next}` : 'Play';
}

// The garden Continue opens: the one in progress, else the newest unlocked.
function continueId() {
  return Math.min(save.current?.id ?? save.unlocked, save.unlocked, LEVEL_COUNT);
}

function newAttract() {
  attractSeed++;
  const lvl = zenLevel(attractSeed);
  attract = new Game(lvl);
  view.setGame(attract, themeOf(lvl));
  view.dim = 0.15;
  attractWait = 1.2;
  queueMicrotask(() => monitor.mark(performance.now()));
}

function toMap() {
  show('map');
  view.dim = 0.35;
  renderMap();
  log.event('map.open', { unlocked: save.unlocked });
}

function renderMap() {
  $('map-stars').textContent = `★ ${totalStars(save)} / ${LEVEL_COUNT * 3}`;
  const holder = $('map-seasons');
  holder.innerHTML = '';
  const next = Math.min(save.unlocked, LEVEL_COUNT);
  SEASONS.forEach((season, s) => {
    const list = seasonLevels(s);
    const stars = list.reduce((a, l) => a + (save.stars[l.id] | 0), 0);
    const open = unlockAll || isUnlocked(save, list[0].id);
    const box = document.createElement('section');
    box.className = `season${open ? '' : ' locked-season'}`;
    box.dataset.season = season.key;
    box.innerHTML = `<header><h3>${season.name}</h3><span class="count">★ ${stars}/${list.length * 3}</span></header>
      <p class="twist">${season.twist} · ${season.blurb}</p>`;
    const grid = document.createElement('div');
    grid.className = 'levels';
    for (const l of list) {
      const b = document.createElement('button');
      const ok = unlockAll || isUnlocked(save, l.id);
      const st = save.stars[l.id] | 0;
      b.className = `lvl${l.showpiece ? ' show' : ''}${l.id === next && !save.stars[l.id] ? ' next' : ''}`;
      b.disabled = !ok;
      b.title = ok ? l.name : 'Finish the garden before to open this one';
      b.innerHTML = ok ? `${l.showpiece ? '✿' : l.id}<small>${'★'.repeat(st)}</small>` : '🔒<small></small>';
      b.setAttribute('aria-label', ok ? `Garden ${l.id}, ${l.name}, ${st} stars` : `Garden ${l.id}, locked`);
      b.addEventListener('click', () => startLevel(l.id));
      grid.appendChild(b);
    }
    box.appendChild(grid);
    holder.appendChild(box);
  });
  requestAnimationFrame(() => {
    const target = holder.querySelector('.lvl.next');
    if (target) target.scrollIntoView({ block: 'center' });
  });
}

// --------------------------------------------------------------- a garden

function startLevel(id) {
  audio.unlock();
  const lvl = getLevel(Math.max(1, Math.min(LEVEL_COUNT, id)));
  const resume = save.current && save.current.id === lvl.id ? save.current : null;
  begin(lvl, resume);
}

function startZen() {
  audio.unlock();
  const seed = 1 + Math.floor(Math.random() * 1e9);
  const lvl = zenLevel(seed);
  log.event('zen.start', { seed, season: SEASONS[lvl.season].key });
  begin(lvl, null);
}

function begin(lvl, resume) {
  level = lvl;
  game = new Game(lvl, resume);
  const theme = themeOf(lvl);
  setSeason(theme);
  view.dim = 0;
  mode = 'play';
  view.game = null; // resize without re-baking the old garden
  layout();
  view.setGame(game, theme);
  view.showCursor = false;
  audio.setHarmony(harmony());
  levelStartedAt = performance.now();
  resultsTimer = 0;
  $('hud-season').textContent = lvl.zen ? `Zen · ${SEASONS[lvl.season].name}` : `${SEASONS[lvl.season].name} · ${lvl.id}`;
  $('hud-name').textContent = lvl.name;
  updateBar();
  queueMicrotask(() => monitor.mark(performance.now()));
  log.event('level.start', {
    level: lvl.id, season: SEASONS[lvl.season].key, twist: lvl.twist || 'none', zen: !!lvl.zen,
    stones: lvl.puzzle.tiles.filter(Boolean).length, par: lvl.puzzle.par, resumed: !!resume,
  });
  if (lvl.twist && !save.seen.includes(lvl.twist) && !autoMode) {
    const card = TWISTS[lvl.twist];
    $('intro-icon').textContent = card.icon;
    $('intro-title').textContent = card.title;
    $('intro-text').textContent = card.text;
    show('intro');
  } else {
    show('play');
    toast(lvl.zen ? 'A new zen garden' : lvl.name, 1.6);
  }
  if (!lvl.zen && !resume) {
    save.current = { id: lvl.id, rots: game.rots.slice(), moves: 0 };
    persist();
  }
}

function harmony() {
  if (!game) return 0;
  const f = game.flow.flowers.length;
  return f ? game.flow.bloomed / f : 0;
}

function updateBar() {
  if (!game) return;
  $('bar-moves').textContent = `${game.moves} move${game.moves === 1 ? '' : 's'}`;
  if (level.zen) {
    $('bar-stars').textContent = `${game.flow.bloomed}/${game.flow.flowers.length} in bloom`;
  } else {
    const t = starTargets(game.puzzle.par);
    const stars = game.stars();
    const shown = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('bar-stars').innerHTML = `<span class="on">${shown}</span> ${stars === 3 ? `within ${t.three}` : stars === 2 ? `within ${t.two}` : 'always'}`;
  }
  $('btn-undo').disabled = !game.history.length || game.solved;
  $('btn-reset').disabled = game.solved || (game.moves === 0 && !game.history.length);
  $('btn-hint').disabled = game.solved;
}

let progressTimer = 0;
function saveProgress() {
  if (!game || level.zen || game.solved) return;
  clearTimeout(progressTimer);
  progressTimer = setTimeout(flushProgress, 300);
}

// Write a pending turn now (the tab is closing or going to the background).
function flushProgress() {
  if (!progressTimer) return;
  clearTimeout(progressTimer);
  progressTimer = 0;
  if (!game || game.solved || level.zen) return;
  save.current = { id: level.id, ...game.serialize() };
  persist();
}

function afterAction(res, sound = true) {
  if (!res) return;
  view.hint = null;
  view.sync();
  if (sound) {
    if (res.tiles.length) audio.click(res.dir);
    const base = game.flow.bloomed - res.bloomed.length;
    res.bloomed.forEach((i, k) => setTimeout(() => audio.bloom(base + k), 220 + k * 160));
  }
  audio.setHarmony(harmony());
  updateBar();
  saveProgress();
  if (res.justSolved) complete();
}

function rotateAt(i, dir) {
  if (mode !== 'play' || !game || i < 0) return;
  if (!game.puzzle.tiles[i]) return;
  if (!game.canRotate(i)) {
    audio.bump();
    view.pulse[i] = 0.6;
    if (game.puzzle.tiles[i].locked) toast('Mossy stones stay put', 1.1);
    return;
  }
  afterAction(game.rotate(i, dir));
}

function undo() {
  if (mode !== 'play' || !game) return;
  const res = game.undo();
  if (res) afterAction(res);
}

function reset() {
  if (!game || game.solved) return;
  const moves = game.moves;
  const res = game.reset();
  if (!res) return;
  log.event('level.reset', { level: level.id, moves });
  afterAction(res);
  toast('Back to the start · Undo brings it back', 1.6);
}

function hint() {
  if (mode !== 'play' || !game) return;
  const h = game.hint();
  if (!h) return;
  game.hintsUsed++;
  view.hint = h;
  view.cursor = h.i;
  audio.hint();
  log.event('hint.used', { level: level.id, hints: game.hintsUsed });
}

function complete() {
  mode = 'won';
  view.celebrate();
  audio.solved();
  const seconds = Math.round((performance.now() - levelStartedAt) / 1000);
  const stars = game.stars();
  let lines = '';
  if (level.zen) {
    save.zen++;
    lines = `${game.moves} moves · ${save.zen} zen garden${save.zen === 1 ? '' : 's'} grown`;
  } else {
    const before = save.stars[level.id] | 0;
    const res = recordWin(save, level.id, { stars, moves: game.moves });
    lines = `${game.moves} moves · best ${res.bestMoves}${stars < 3 ? ` · ★★★ within ${starTargets(game.puzzle.par).three}` : ''}`;
    if (stars > before && before) lines += ' · new best!';
  }
  persist();
  log.event('level.complete', {
    level: level.id, stars: level.zen ? 0 : stars, moves: game.moves, par: game.puzzle.par,
    'time.s': seconds, hints: game.hintsUsed, zen: !!level.zen,
  });
  $('res-sub').textContent = lines;
  updateBar();
  resultsTimer = reduceMotion ? 1.2 : 2.6;
}

function showResults() {
  const zen = level.zen;
  const last = !zen && level.id === LEVEL_COUNT;
  const seasonEnd = !zen && seasonLevels(level.season).at(-1).id === level.id;
  $('res-title').textContent = zen
    ? 'A lovely garden'
    : last ? 'Every garden is glowing!' : seasonEnd ? `${SEASONS[level.season].name} is in bloom!` : 'The garden is in bloom!';
  const stars = zen ? 0 : game.stars();
  $('res-stars').classList.toggle('hidden', !!zen);
  [...$('res-stars').children].forEach((el, k) => el.classList.toggle('on', k < stars));
  $('btn-next').textContent = zen ? 'Another garden →' : last ? 'Garden map' : seasonEnd ? `On to ${SEASONS[level.season + 1].name} →` : 'Next garden →';
  $('btn-res-map').textContent = zen ? 'Title' : 'Map';
  show('results');
  resultsShownAt = performance.now();
}

function next() {
  if (!level) return;
  if (level.zen) startZen();
  else if (level.id >= LEVEL_COUNT) toMap();
  else startLevel(level.id + 1);
}

function pause() {
  if (mode !== 'play') return;
  show('pause');
  syncToggles();
}

function resume() {
  if (mode !== 'pause') return;
  show('play');
}

function enterPhoto() {
  if (!level) return;
  $('photo-caption').textContent = `${SEASONS[level.season].name} · ${level.name}`;
  show('photo');
  log.event('photo.open', { level: level.id });
}

function savePicture() {
  try {
    const a = document.createElement('a');
    a.href = view.snapshot();
    a.download = `riverlight-${level.zen ? 'zen' : level.id}.png`;
    a.click();
  } catch (error) {
    log.warn('photo.save_failed', { 'error.type': error.name });
  }
}

let toastTimer = 0;
function toast(text, seconds = 1.4) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  toastTimer = seconds;
}

function toggleSound() {
  save.sound = !save.sound;
  audio.setSound(save.sound);
  persist();
  syncToggles();
}
function toggleMusic() {
  save.music = !save.music;
  audio.unlock();
  audio.setMusic(save.music);
  persist();
  syncToggles();
}

// ------------------------------------------------------------------- input

let press = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (mode === 'photo') return;
  if (mode !== 'play' || !game) return;
  // One finger at a time: a second finger can't take over the first one's press.
  if (press && e.pointerType !== 'mouse') return;
  view.showCursor = false;
  const i = view.cellAtClient(e.clientX, e.clientY);
  if (i < 0) return;
  view.cursor = i;
  if (e.pointerType === 'mouse') {
    rotateAt(i, e.button === 2 ? -1 : 1);
    return;
  }
  canvas.setPointerCapture?.(e.pointerId);
  press = {
    i, id: e.pointerId, x: e.clientX, y: e.clientY, long: false,
    timer: setTimeout(() => {
      if (!press) return;
      press.long = true;
      // Vibrating before the first completed tap is blocked (and logged).
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(12);
      rotateAt(press.i, -1);
    }, 450),
  };
});
canvas.addEventListener('pointermove', (e) => {
  pointerIdle = 0;
  if (e.pointerType === 'mouse') view.hover = mode === 'play' ? view.cellAtClient(e.clientX, e.clientY) : -1;
  if (press && press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 18) {
    clearTimeout(press.timer);
    press = null;
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (!press || press.id !== e.pointerId) return;
  clearTimeout(press.timer);
  if (!press.long) rotateAt(press.i, 1);
  press = null;
});
canvas.addEventListener('pointercancel', (e) => {
  if (!press || press.id !== e.pointerId) return;
  clearTimeout(press.timer);
  press = null;
});
canvas.addEventListener('pointerleave', () => { view.hover = -1; });

function firstStone() {
  const order = game.order;
  return order.find((i) => game.canRotate(i)) ?? order[0];
}

function moveCursor(dx, dy) {
  if (!game) return;
  view.showCursor = true;
  if (view.cursor < 0 || !game.puzzle.tiles[view.cursor]) {
    view.cursor = firstStone();
    return;
  }
  const j = stepCursor(game.topo, view.cursor, dx, dy, (i) => !!game.puzzle.tiles[i]);
  if (j >= 0) view.cursor = j;
}

function cursorRotate(dir) {
  if (!game) return;
  if (view.cursor < 0 || !view.showCursor) {
    view.showCursor = true;
    if (view.cursor < 0) {
      view.cursor = firstStone();
      return;
    }
  }
  rotateAt(view.cursor, dir);
}

const DIRS = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1],
};

addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') { e.preventDefault(); pause(); }
    else if (mode === 'pause') { e.preventDefault(); resume(); }
    else if (mode === 'photo') { e.preventDefault(); showResults(); }
    else if (mode === 'intro') { e.preventDefault(); dismissIntro(); }
    return;
  }
  if (e.code === 'KeyM') { toggleSound(); return; }
  if (mode === 'intro' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); dismissIntro(); return; }
  // Results: Enter / Space mean "Next garden", unless a button has focus (then
  // the browser presses that one). A short guard stops mashing from skipping it.
  if (mode === 'results' && (e.code === 'Enter' || e.code === 'Space')) {
    if (document.activeElement?.closest?.('button, a')) return;
    e.preventDefault();
    if (!e.repeat && performance.now() - resultsShownAt > 700) next();
    return;
  }
  if (mode !== 'play' || !game) return;
  const dir = DIRS[e.code];
  if (dir) { e.preventDefault(); moveCursor(dir[0], dir[1]); return; }
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); cursorRotate(1); return; }
  if (e.code === 'KeyQ') { e.preventDefault(); cursorRotate(-1); return; }
  if (e.code === 'KeyZ' || e.code === 'KeyU' || e.code === 'Backspace') { e.preventDefault(); undo(); return; }
  if (e.code === 'KeyR') { reset(); return; }
  if (e.code === 'KeyH') { hint(); }
});

let padPrev = {};
function pollGamepad() {
  const pads = navigator.getGamepads?.() ?? [];
  const pad = [...pads].find((p) => p && p.connected);
  if (!pad) return;
  const b = (k) => !!pad.buttons[k]?.pressed;
  const now = {
    left: b(14) || pad.axes[0] < -0.5, right: b(15) || pad.axes[0] > 0.5,
    up: b(12) || pad.axes[1] < -0.5, down: b(13) || pad.axes[1] > 0.5,
    a: b(0), back: b(1) || b(2), y: b(3), lb: b(4), rb: b(5), start: b(9),
  };
  const hit = (k) => now[k] && !padPrev[k];
  if (hit('start')) {
    if (mode === 'play') pause();
    else if (mode === 'pause') resume();
    else if (mode === 'intro') dismissIntro();
  }
  if (mode === 'play') {
    if (hit('left')) moveCursor(-1, 0);
    if (hit('right')) moveCursor(1, 0);
    if (hit('up')) moveCursor(0, -1);
    if (hit('down')) moveCursor(0, 1);
    if (hit('a') || hit('rb')) cursorRotate(1);
    if (hit('back')) cursorRotate(-1);
    if (hit('y')) hint();
    if (hit('lb')) undo();
  } else if (mode === 'results' && hit('a')) {
    next();
  } else if (mode === 'intro' && hit('a')) {
    dismissIntro();
  }
  padPrev = now;
}

function dismissIntro() {
  if (mode !== 'intro') return;
  if (level.twist && !save.seen.includes(level.twist)) {
    save.seen.push(level.twist);
    persist();
  }
  show('play');
}

let pointerIdle = 0;
let pointerHidden = false;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  const hide = mode === 'play' && pointerIdle > 2;
  if (hide !== pointerHidden) {
    pointerHidden = hide;
    document.body.classList.toggle('no-cursor', hide);
  }
}

// -------------------------------------------------------------- the loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, level: level ? level.id : 0, moves: game ? game.moves : 0 }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => {
  monitor.reset(performance.now());
  if (document.hidden) flushProgress();
  if (document.hidden && mode === 'play') pause();
});
addEventListener('pagehide', flushProgress);

function stepAttract(dt) {
  if (!attract) return;
  attractWait -= dt;
  if (attractWait > 0) return;
  if (attract.solved) {
    newAttract();
    return;
  }
  const h = attract.hint();
  if (h) {
    attract.rotate(h.i, h.dir);
    view.sync();
  }
  if (attract.solved) {
    view.celebrate();
    attractWait = 7;
  } else {
    attractWait = reduceMotion ? 0.9 : 0.42;
  }
}

function stepAuto(dt) {
  if (!autoMode || !game) return;
  autoWait -= dt;
  if (autoWait > 0) return;
  autoWait = 0.12;
  if (mode === 'intro') dismissIntro();
  else if (mode === 'play') {
    const h = game.hint();
    if (h) rotateAt(h.i, h.dir);
  } else if (mode === 'results') {
    autoWait = 1;
    next();
  }
}

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePointer(dt);
  pollGamepad();
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $('toast').classList.add('hidden');
  }
  if (mode === 'title') stepAttract(dt);
  stepAuto(dt);
  if (mode === 'won' && resultsTimer > 0) {
    resultsTimer -= dt;
    if (resultsTimer <= 0) showResults();
  }
  view.update(dt);
  view.draw();
  requestAnimationFrame(loop);
}
const loop = telemetry ? telemetry.guard(frame, 'riverlight.frame') : frame;

// ------------------------------------------------------------------- wiring

$('btn-play').addEventListener('click', () => startLevel(continueId()));
$('btn-map').addEventListener('click', toMap);
$('btn-zen').addEventListener('click', startZen);
for (const el of document.querySelectorAll('[data-title]')) el.addEventListener('click', toTitle);
for (const el of document.querySelectorAll('[data-sound]')) el.addEventListener('click', toggleSound);
for (const el of document.querySelectorAll('[data-music]')) el.addEventListener('click', toggleMusic);
$('btn-sound').addEventListener('click', toggleSound);
$('btn-pause').addEventListener('click', pause);
$('btn-undo').addEventListener('click', undo);
$('btn-reset').addEventListener('click', reset);
$('btn-hint').addEventListener('click', hint);
$('btn-intro').addEventListener('click', dismissIntro);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => { show('play'); reset(); });
$('btn-pause-map').addEventListener('click', () => {
  if (game && !game.solved && level && !level.zen) log.event('level.leave', { level: level.id, moves: game.moves });
  toMap();
});
$('btn-next').addEventListener('click', next);
$('btn-admire').addEventListener('click', enterPhoto);
$('btn-replay').addEventListener('click', () => {
  if (level.zen) begin(level, null);
  else {
    save.current = null;
    startLevel(level.id);
  }
});
$('btn-res-map').addEventListener('click', () => (level && level.zen ? toTitle() : toMap()));
$('btn-photo-back').addEventListener('click', showResults);
$('btn-photo-save').addEventListener('click', savePicture);
addEventListener('resize', layout);
addEventListener('orientationchange', () => setTimeout(layout, 150));
for (const el of document.querySelectorAll('button, .btn')) {
  el.addEventListener('pointerdown', () => audio.unlock());
}

syncToggles();
log.event('game.ready', { unlocked: save.unlocked, stars: totalStars(save), levels: LEVEL_COUNT });
if (params.has('level')) startLevel(Number(params.get('level')) || 1);
else if (params.has('zen')) startZen();
else if (params.has('map')) { toTitle(); toMap(); }
else toTitle();
requestAnimationFrame(loop);

// Handy for poking at the game from the console and browser checks.
window.RL = {
  get game() { return game; }, get mode() { return mode; }, get level() { return level; },
  view, save, audio, startLevel, startZen, toMap, toTitle, autoplay: () => game && autoplay(game),
};
