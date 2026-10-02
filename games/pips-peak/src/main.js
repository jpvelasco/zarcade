// Screens, the game loop, the HUD and the level map: everything that has to
// touch the browser lives here.

import { Audio } from './audio.js';
import { Input } from './input.js';
import { LEVELS, ZONES, findLevel } from './levels.js';
import {
  SAVE_KEY, adoptSave, entryFor, formatTime, isUnlocked, loadSave, nextLevelIndex, recordRun, totals, writeSave,
} from './progress.js';
import { Renderer } from './render.js';
import { PETALS, World } from './world.js';
import { frameMonitor } from './perf.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;
const POINTER_IDLE = 2;

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const screens = [...document.querySelectorAll('.overlay')];

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const canvas = $('game');
const renderer = new Renderer(canvas);
const input = new Input();
// Reading `localStorage` throws when the browser blocks site storage; the
// save helpers treat a null store as "nothing saved".
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
const audio = new Audio(save.muted);

const state = {
  mode: 'title',       // title | map | play | paused | complete
  index: 0,
  world: null,
  accumulator: 0,
  last: performance.now(),
  endTimer: 0,
  cleared: null,       // the finished run, saved the moment Pip reaches the sunrise
  bannerTimer: 0,
  pointerIdle: 0,
  pointerHidden: false,
  debugLevel: null,
  peek: query.has('peek'),
  wilts: 0,
};

// Browsers only allow audio after a real gesture, so hold off until one lands.
let audioArmed = false;
function armAudio() {
  if (audioArmed) return;
  audioArmed = true;
  audio.unlock();
  if (state.mode === 'play') audio.startMusic(LEVELS[state.index].zone);
}
window.addEventListener('pointerdown', armAudio);
window.addEventListener('keydown', armAudio);

// ------------------------------------------------------------------ screens

function showScreen(id) {
  for (const screen of screens) screen.classList.toggle('hidden', screen.id !== id);
}

function setPlayUi(on) {
  $('hud').classList.toggle('hidden', !on);
  const coarse = matchMedia('(pointer: coarse)').matches;
  $('touch').classList.toggle('hidden', !(on && coarse));
}

function muteLabel() {
  const label = `Sound: ${save.muted ? 'off' : 'on'}`;
  $('btn-title-mute').textContent = label;
  $('btn-pause-mute').textContent = label;
  $('btn-mute').textContent = save.muted ? '✕' : '♪';
  $('btn-mute').classList.toggle('muted', save.muted);
}

function toggleMute() {
  save.muted = !save.muted;
  audio.setMuted(save.muted);
  writeSave(storage, save);
  muteLabel();
  if (!save.muted) audio.click();
}

function showTitle() {
  state.mode = 'title';
  audio.stopMusic();
  setPlayUi(false);
  showScreen('screen-title');
  const backdrop = new World(findLevel(1));
  backdrop.step(STEP, {});
  state.world = backdrop;
  renderer.setWorld(backdrop);
  renderer.setPeek(false);
  refreshTitle();
}

function refreshTitle() {
  const sums = totals(save);
  $('title-progress').textContent = sums.done
    ? `${sums.done}/${sums.levels} levels · ${sums.stars}/${sums.maxStars} stars · ${sums.acorns} golden acorns`
    : 'Twelve levels across four zones. Take your time.';
  $('btn-play').innerHTML = sums.done ? 'Continue<span>→</span>' : 'Climb<span>→</span>';
  muteLabel();
}

function buildMap() {
  const host = $('map-zones');
  host.innerHTML = '';
  ZONES.forEach((zone, zoneIndex) => {
    const block = document.createElement('section');
    block.className = `map-zone zone-${zone.id}`;
    block.innerHTML = `<header><b>${zone.name}</b><span>${zone.subtitle}</span></header>`;
    const list = document.createElement('div');
    list.className = 'map-list';
    LEVELS.forEach((level, index) => {
      if (level.zone !== zoneIndex) return;
      const entry = entryFor(save, level.id);
      const open = isUnlocked(save, index);
      const button = document.createElement('button');
      button.className = `map-level${open ? '' : ' locked'}${entry.done ? ' done' : ''}`;
      button.disabled = !open;
      const stars = [0, 1, 2].map((i) => `<i class="${i < entry.stars ? 'on' : ''}">★</i>`).join('');
      button.innerHTML = `<span class="num">${index + 1}</span>
        <span class="name">${level.name}</span>
        <span class="stars">${stars}</span>
        <span class="meta">${open
          ? (entry.done ? `${formatTime(entry.best)} · ${entry.acorns}/3 acorns` : 'Not climbed yet')
          : `Finish level ${index} first`}</span>`;
      button.addEventListener('click', () => {
        audio.click();
        startLevel(index);
      });
      list.appendChild(button);
    });
    block.appendChild(list);
    host.appendChild(block);
  });
  const sums = totals(save);
  $('map-totals').innerHTML = `<b>${sums.stars}</b>/${sums.maxStars} stars · <b>${sums.acorns}</b>/${sums.levels * 3} acorns`;
}

function showMap() {
  state.mode = 'map';
  audio.stopMusic();
  setPlayUi(false);
  buildMap();
  showScreen('screen-map');
}

function banner(text, seconds = 3.4) {
  const el = $('banner');
  el.textContent = text;
  el.classList.add('show');
  state.bannerTimer = seconds;
}

function toast(text, seconds = 1.6) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), seconds * 1000);
}

function startLevel(index) {
  state.index = Math.max(0, Math.min(LEVELS.length - 1, index));
  const level = LEVELS[state.index];
  state.world = new World(level);
  renderer.setWorld(state.world);
  renderer.setPeek(state.peek);
  state.mode = 'play';
  state.accumulator = 0;
  state.endTimer = 0;
  state.cleared = null;
  state.wilts = 0;
  showScreen(null);
  setPlayUi(true);
  log.event('level.start', { level: state.index + 1, 'level.id': level.id, zone: level.zone });
  updateHud(true);
  const touchUi = matchMedia('(pointer: coarse)').matches;
  banner(`${state.index + 1}. ${level.name} — ${(touchUi && level.touchHint) || level.hint}`);
  if (audioArmed) {
    audio.unlock();
    audio.startMusic(level.zone);
  }
  revealPointer();
}

function pause() {
  if (state.mode !== 'play') return;
  state.mode = 'paused';
  showScreen('screen-pause');
  $('touch').classList.add('hidden');
  revealPointer();
}

function resume() {
  if (state.mode !== 'paused') return;
  state.mode = 'play';
  state.accumulator = 0;
  showScreen(null);
  setPlayUi(true);
}

// Save the clear as soon as Pip reaches the sunrise, so pausing, restarting
// or leaving during the celebration never loses it.
function recordClear() {
  const result = state.world.result();
  const { entry, record } = recordRun(save, result);
  writeSave(storage, save);
  state.cleared = { result, entry, record };
  log.event('level.complete', {
    level: state.index + 1, 'level.id': result.levelId, stars: result.stars, 'time.s': Math.round(result.time * 10) / 10,
    seeds: result.seeds, 'seeds.total': result.seedTotal, acorns: result.acorns, wilts: state.wilts, 'best.new': !!record,
  });
}

function finishLevel() {
  if (!state.cleared) recordClear();
  const { result, entry, record } = state.cleared;
  state.mode = 'complete';
  const level = LEVELS[state.index];
  $('result-zone').textContent = ZONES[level.zone].name.toUpperCase();
  $('result-title').textContent = result.stars === 3 ? 'Perfect climb!' : 'Made it!';
  $('result-time').textContent = formatTime(result.time);
  $('result-record').classList.toggle('hidden', !record || !entry.done);
  $('result-seeds').textContent = `${result.seeds}/${result.seedTotal}`;
  $('result-acorns').textContent = `${result.acorns}/${result.acornTotal}`;
  [...$('result-stars').children].forEach((star, i) => star.classList.toggle('on', i < result.stars));
  const last = state.index >= LEVELS.length - 1;
  $('btn-next').innerHTML = last ? 'Level map' : 'Next climb<span>→</span>';
  setPlayUi(false);
  showScreen('screen-complete');
  audio.stopMusic();
  audio.fanfare();
}

// ------------------------------------------------------------------ HUD

let hudCache = {};
function updateHud(force = false) {
  const world = state.world;
  if (!world) return;
  const level = LEVELS[state.index];
  const time = formatTime(world.time);
  if (force || hudCache.time !== time) {
    $('hud-time').textContent = time;
    hudCache.time = time;
  }
  const seeds = `${world.seedsTaken}/${world.seedTotal}`;
  if (force || hudCache.seeds !== seeds) {
    $('hud-seeds').textContent = seeds;
    hudCache.seeds = seeds;
  }
  if (force || hudCache.acorns !== world.acornsTaken) {
    $('hud-acorns').innerHTML = world.acorns
      .map((acorn) => `<i class="ico-acorn${acorn.taken ? ' on' : ''}"></i>`)
      .join('');
    hudCache.acorns = world.acornsTaken;
  }
  if (force || hudCache.petals !== world.petals) {
    $('petals').innerHTML = Array.from({ length: PETALS }, (_, i) =>
      `<i class="petal${i < world.petals ? ' on' : ''}"></i>`).join('');
    hudCache.petals = world.petals;
  }
  if (force) {
    $('hud-zone').textContent = ZONES[level.zone].name.toUpperCase();
    $('hud-name').textContent = `${state.index + 1}. ${level.name}`;
    hudCache = { ...hudCache, level: level.id };
  }
}

// ------------------------------------------------------------------ pointer

function revealPointer() {
  state.pointerIdle = 0;
  if (state.pointerHidden) {
    state.pointerHidden = false;
    document.body.classList.remove('no-cursor');
  }
}
window.addEventListener('mousemove', revealPointer);
window.addEventListener('pointerdown', revealPointer);
window.addEventListener('pointerdown', () => document.body.classList.remove('pad-nav'));

function updatePointer(dt) {
  if (state.mode !== 'play') {
    revealPointer();
    return;
  }
  state.pointerIdle += dt;
  const hide = state.pointerIdle > POINTER_IDLE;
  if (hide !== state.pointerHidden) {
    state.pointerHidden = hide;
    document.body.classList.toggle('no-cursor', hide);
  }
}

// ------------------------------------------------------------------ loop

// Frame telemetry: slow frames, struggling 10 s windows, and a watchdog
// outside the loop that notices when frames stop while the page is visible.
const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode: state.mode, level: state.index + 1, status: state.world ? state.world.status : 'none' }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - state.last) / 1000);
  state.last = now;
  updatePointer(dt);

  if (input.take('pause')) {
    if (state.mode === 'play') pause();
    else if (state.mode === 'paused') resume();
  }
  if (input.take('mute')) toggleMute();
  if (input.take('restart') && (state.mode === 'play' || state.mode === 'paused')) {
    startLevel(state.index);
  }

  if (state.bannerTimer > 0) {
    state.bannerTimer -= dt;
    if (state.bannerTimer <= 0) $('banner').classList.remove('show');
  }

  const world = state.world;
  if (world && state.mode === 'play') {
    state.accumulator += dt;
    let steps = 0;
    while (state.accumulator >= STEP && steps < MAX_STEPS) {
      const controls = input.read();
      world.step(STEP, controls);
      state.accumulator -= STEP;
      steps += 1;
      if (world.events.length) {
        renderer.handleEvents(world.events);
        audio.handleEvents(world.events, world.time);
        for (const event of world.events) {
          if (event.type === 'acorn') toast('Golden acorn!');
          else if (event.type === 'gate') toast('The gates roll open');
          else if (event.type === 'wilt') {
            state.wilts += 1;
            toast('Pip wilts — back to the last flower');
          }
        }
        world.events.length = 0;
      }
    }
    if (steps >= MAX_STEPS) state.accumulator = 0;
    updateHud();
    if (world.status === 'complete') {
      if (!state.cleared) recordClear();
      state.endTimer += dt;
      if (state.endTimer > 1) finishLevel();
    }
  } else if (world && state.mode === 'title') {
    // Slow drift across the meadow behind the title card.
    const cam = renderer.camera;
    cam.ready = true;
    // Drift around the sunrise at the end of the first meadow.
    cam.x = world.pixelWidth * 0.74 + Math.sin(performance.now() / 11000) * world.pixelWidth * 0.16;
    cam.y = Math.min(world.pixelHeight * 0.58, world.pixelHeight - renderer.viewH / cam.zoom / 2);
  }

  padMenus();
  if (world) renderer.frame(world, dt, { follow: state.mode === 'play' || state.mode === 'paused' });
  requestAnimationFrame(loop);
}

// Gamepad on the menus. During play `input` reads the pad; everywhere else
// the d-pad moves between buttons, A presses one (the main one if none has
// focus), B or Start resumes from pause and Start presses the main button.
const padPrev = {};
function padMenus() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
  const pad = pads.find(Boolean);
  if (!pad) return;
  const held = (i) => !!pad.buttons[i]?.pressed;
  const now = {
    up: held(12) || pad.axes[1] < -0.5,
    down: held(13) || pad.axes[1] > 0.5,
    left: held(14) || pad.axes[0] < -0.5,
    right: held(15) || pad.axes[0] > 0.5,
    a: held(0),
    b: held(1),
    start: held(9),
  };
  const edges = {};
  for (const key of Object.keys(now)) edges[key] = now[key] && !padPrev[key];
  const hit = (key) => edges[key];
  Object.assign(padPrev, now);
  if (state.mode === 'play') return;
  const screen = screens.find((el) => !el.classList.contains('hidden'));
  if (!screen) return;
  if (state.mode === 'paused' && (hit('b') || hit('start'))) {
    resume();
  } else if (hit('up') || hit('left') || hit('down') || hit('right')) {
    const list = [...screen.querySelectorAll('button:not(:disabled), a[href]')];
    const at = list.indexOf(document.activeElement);
    const step = hit('up') || hit('left') ? -1 : 1;
    document.body.classList.add('pad-nav');
    list[at < 0 ? 0 : (at + step + list.length) % list.length]?.focus({ focusVisible: true });
  } else if (hit('a') || hit('start')) {
    const focused = screen.contains(document.activeElement) && hit('a') ? document.activeElement : null;
    (focused || screen.querySelector('.button.primary'))?.click();
  }
  // A held over into play is not a jump.
  input.padJump = now.a || now.b;
  input.padStart = now.start;
}

// A crash inside a frame shows the crash screen instead of a frozen picture;
// after a crash the guard returns early, so the loop stops rescheduling.
const loop = telemetry ? telemetry.guard(frame, 'pips-peak.frame') : frame;

// ------------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', () => {
  const target = state.debugLevel ?? nextLevelIndex(save);
  startLevel(target);
});
$('btn-map').addEventListener('click', () => showMap());
$('btn-map-back').addEventListener('click', () => showTitle());
$('btn-title-mute').addEventListener('click', toggleMute);
$('btn-pause-mute').addEventListener('click', toggleMute);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startLevel(state.index));
$('btn-pause-map').addEventListener('click', () => showMap());
$('btn-replay').addEventListener('click', () => startLevel(state.index));
$('btn-result-map').addEventListener('click', () => showMap());
$('btn-next').addEventListener('click', () => {
  if (state.index >= LEVELS.length - 1) showMap();
  else startLevel(state.index + 1);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// Another tab saved: take its progress, so this tab never writes a stale copy
// over it. A level in progress records into the fresh copy when it is done.
window.addEventListener('storage', (event) => {
  if (event.key !== SAVE_KEY && event.key !== null) return;
  adoptSave(save, loadSave(storage));
  audio.setMuted(save.muted);
  muteLabel();
  if (state.mode === 'title') refreshTitle();
  else if (state.mode === 'map') buildMap();
});
window.addEventListener('resize', () => {
  renderer.resize();
  if (state.peek) renderer.setPeek(true);
});

input.bindMovePad(document.querySelector('#touch .touch-move'));
for (const button of document.querySelectorAll('#touch .touch-act [data-hold]')) {
  input.bindTouch(button, button.dataset.hold);
}

{
  const sum = totals(save);
  log.event('game.ready', { stars: sum.stars, done: sum.done });
}

// A level can be opened straight from the address bar: ?level=7
const wanted = Number.parseInt(query.get('level') || '', 10);
if (Number.isFinite(wanted) && wanted >= 1 && wanted <= LEVELS.length) {
  state.debugLevel = wanted - 1;
  showTitle();
  startLevel(wanted - 1);
} else {
  showTitle();
}

requestAnimationFrame(loop);
window.PipsPeak = {
  get world() { return state.world; },
  renderer,
  input,
  get state() { return state; },
  start: startLevel,
  save,
  peek: (on) => {
    state.peek = !!on;
    renderer.setPeek(!!on);
  },
};
