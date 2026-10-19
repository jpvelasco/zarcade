// Browser entry for Shard Storm: screens, the fixed-step loop, swipe input,
// sound and saves. The simulation lives in world.js and is DOM-free.
import { World } from './world.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Autopilot } from './ai.js';
import { STEP, BLADE, DAILY, SURGE } from './config.js';
import { SAVE_KEY, loadSave, writeSave, mergeSave, recordRun, recordDaily } from './progress.js';
import { dateKey, dailySeed, dailyTarget, dailyLabel, nextStreak } from './daily.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Optional ?seed=.. for a reproducible storm (route checks, test rigs).
const seedParam = params.has('seed') ? (Math.floor(Number(params.get('seed'))) % 2 ** 31 + 2 ** 31) % 2 ** 31 : null;

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const canvas = $('game');
const storage = (() => { try { return localStorage; } catch { return null; } })();
let save = loadSave(storage);
let saveWarned = false;
function persist() {
  if (params.has('autopilot')) return; // ?autopilot never writes the real save
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const renderer = new Renderer(canvas, { reducedMotion: reduced });
const sound = new Sound({ muted: save.muted, music: save.music });

let mode = 'title'; // title | play | paused | over | dailyDone
let world = null;
let isDaily = false;
let daily = null; // { seed, target, streak, key }
let accumulator = 0;
let overTimer = 0;
let banked = false; // this run's result is already recorded
let newBest = false;
let attractPilot = new Autopilot();
const autopilot = params.has('autopilot'); // flag: the attract pilot plays for us
let isAttract = false;
let swipePts = []; // pointer points gathered since the last step

const SCREENS = ['screen-title', 'screen-pause', 'screen-over', 'screen-dailydone'];
const RESULT_SCREENS = ['screen-over', 'screen-dailydone'];
const RESULT_GUARD_MS = 700;
let shownAt = 0;
let shownId = null;

// A results card must survive a mash: ignore anything for the first moments.
function resultGuardActive() {
  return RESULT_SCREENS.includes(shownId) && performance.now() - shownAt < RESULT_GUARD_MS;
}

function showScreen(id) {
  shownAt = performance.now();
  shownId = id;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', mode !== 'play');
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(mode === 'play' ? 1 : mode === 'paused' ? 0.3 : 0.45);
}

// ------------------------------------------------------------ run setup

// ?dailyTarget=.. lets test rigs clear the daily path without a real target.
function dailyTargetFor() {
  const t = params.get('dailyTarget');
  return t ? Math.max(0, Number(t) || 0) : dailyTarget();
}

// `dailyRun` is a flag, not the `daily` run record: assigning the record to a
// parameter named `daily` would only write the local and leave the module-level
// `daily` null, so the HUD read `daily.target` against null on the first frame.
function makeWorld(dailyRun = false) {
  if (dailyRun) {
    const streak = save.daily.streak;
    daily = { seed: seedParam ?? Math.floor(dailySeed()), target: dailyTargetFor(), streak, key: dateKey() };
    return new World({ seed: daily.seed, daily: true, target: daily.target, width: renderer.fw, size: renderer.k });
  }
  daily = null;
  return new World({ seed: seedParam ?? Math.floor(Math.random() * 2 ** 31), width: renderer.fw, size: renderer.k });
}

function startRun(dailyRun = false) {
  sound.unlock();
  isDaily = dailyRun;
  world = makeWorld(dailyRun);
  isAttract = false;
  renderer.reset(world, { daily: dailyRun });
  sound.setSong(0, false);
  attractPilot = new Autopilot(); // fresh pilot for the run (?autopilot uses it)
  mode = 'play';
  accumulator = 0;
  overTimer = 0;
  banked = false;
  newBest = false;
  resetInput();
  hudCache = {};
  showScreen(null);
  updateHud();
  log.event('run.start', { daily: dailyRun, seed: world.seed, target: daily ? daily.target : DAILY.target });
}

function attract() {
  const w = new World({ seed: Math.floor(Math.random() * 2 ** 31), width: renderer.fw, size: renderer.k });
  // Skip the countdown: the backdrop must move the moment it appears.
  w.status = 'play';
  w.readyT = 0;
  attractPilot = new Autopilot();
  world = w;
  renderer.reset(w, { daily: false });
}

function toTitle() {
  mode = 'title';
  if (!isAttract) { attract(); isAttract = true; }
  refreshTitle();
  showScreen('screen-title');
}

function refreshTitle() {
  const best = save.best;
  $('title-best').textContent = best ? `Best ${best.toLocaleString('en-US')}` : '';
  const streak = save.daily.streak;
  $('title-daily').textContent = streak > 0
    ? `Daily · ${dailyLabel()} · ${streak} day streak`
    : `Daily · ${dailyLabel()}`;
  updateSoundButtons();
}

// Pausing must never swallow a finished run: once the storm has won, the
// result is already banked and the card is on its way.
function pause() {
  if (mode !== 'play' || !world || world.status === 'over') return;
  mode = 'paused';
  resetInput();
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  resetInput();
  showScreen(null);
}

// ------------------------------------------------------------ results

// Extend the daily streak for today's storm and mirror it onto the run record.
function bankDaily() {
  const streak = nextStreak(save.daily.streak, save.daily.lastKey, daily.key);
  recordDaily(save, true, daily.key, streak);
  daily.streak = streak;
  return streak;
}

// Record the run the moment it is earned, not when its card appears: pausing,
// tabbing away or closing the page during the death beat used to lose it all.
function bankRun() {
  if (banked || !world) return;
  banked = true;
  newBest = recordRun(save, world.score, world.stats.sliced, world.maxCombo, world.stats.breaks);
  const cleared = isDaily && world.dailyCleared;
  if (cleared) bankDaily();
  persist();
  log.event('run.end', {
    score: world.score, 'best.new': newBest, sliced: world.stats.sliced,
    'max.combo': world.maxCombo, 'mines.hit': world.stats.minesHit,
    missed: world.stats.missed, overloads: world.stats.overloads,
    breaks: world.stats.breaks, gold: world.stats.gold,
    seconds: Math.round(world.time), level: world.level,
    reason: world.overReason || (cleared ? 'daily' : 'none'),
    daily: isDaily, cleared, streak: daily ? daily.streak : 0,
  });
}

const OVER_COPY = {
  surge: ['The surge took you.', 'Crystals you let fall feed the surge. Catch more of them.'],
  mine: ['One mine too many.', 'Mines are safe to ignore — let them fall away.'],
};

function onGameOver() {
  mode = 'over';
  bankRun(); // normally already done the frame the storm won
  const [title, why] = OVER_COPY[world.overReason] || ['The storm won… this time.', 'Go again.'];
  $('over-title').textContent = title;
  $('over-why').textContent = why;
  $('over-score').textContent = world.score.toLocaleString('en-US');
  const bestEl = $('over-best');
  bestEl.textContent = newBest ? 'New best!' : `Best ${save.best.toLocaleString('en-US')}`;
  bestEl.classList.toggle('new-best', newBest);
  const lines = [
    ['Shards sliced', world.stats.sliced],
    ['Best combo', `×${world.maxCombo}`],
    ['Storm Breaks', world.stats.breaks],
    ['Mines hit', world.stats.minesHit],
    ['Survived', `${Math.floor(world.time)}s`],
  ];
  if (world.stats.gold) lines.splice(3, 0, ['Golden shards', world.stats.gold]);
  $('over-lines').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  showScreen('screen-over');
}

function onDailyClear() {
  // Reached the daily target mid-run: freeze, celebrate, bank the streak.
  mode = 'dailyDone';
  bankRun();
  log.event('daily.clear', { score: world.score, target: daily.target, streak: daily.streak, sliced: world.stats.sliced });
  $('done-streak').textContent = `Day ${daily.streak} in a row`;
  $('done-score').textContent = world.score.toLocaleString('en-US');
  showScreen('screen-dailydone');
}

// ------------------------------------------------------------ sound

function updateSoundButtons() {
  const label = save.muted ? 'Sound off' : 'Sound on';
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = label;
  $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', save.muted ? 'Unmute' : 'Mute');
  const ml = save.music ? 'Music on' : 'Music off';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = ml;
}

function toggleMute() {
  save.muted = !save.muted;
  sound.unlock();
  sound.setMuted(save.muted);
  persist();
  updateSoundButtons();
}

function toggleMusic() {
  save.music = !save.music;
  sound.unlock();
  sound.setMusic(save.music);
  persist();
  updateSoundButtons();
}

// ------------------------------------------------------------ HUD

// The HUD is touched every frame, so each piece only writes when it changes.
let hudCache = {};

function setMeter(el, value, label) {
  el.style.setProperty('--pct', value.toFixed(3));
  el.setAttribute('aria-label', `${label} ${Math.round(value * 100)}%`);
}

function updateHud() {
  if (!world) return;
  const w = world;
  if (hudCache.score !== w.score) {
    hudCache.score = w.score;
    $('hud-score').textContent = w.score.toLocaleString('en-US');
  }
  const combo = w.combo >= 2 ? w.combo : 0;
  if (hudCache.combo !== combo) {
    hudCache.combo = combo;
    const el = $('hud-combo');
    el.classList.toggle('hidden', !combo);
    if (combo) el.textContent = `×${combo}`;
  }
  // Lives are three elements lit or spent: no count can be out of range.
  const lives = Math.max(0, Math.min(3, Math.floor(w.lives) || 0));
  if (hudCache.lives !== lives) {
    hudCache.lives = lives;
    const dots = $('hud-lives').children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('spent', i >= lives);
    $('hud-lives').setAttribute('aria-label', `${lives} ${lives === 1 ? 'life' : 'lives'} left`);
  }
  const surge = Math.round(w.surge * 100) / 100;
  if (hudCache.surge !== surge) {
    hudCache.surge = surge;
    const el = $('hud-surge');
    setMeter(el, w.surge, 'Storm surge');
    el.classList.toggle('warn', w.surge >= SURGE.warn);
  }
  const bm = Math.round(w.breakMeter * 100) / 100;
  if (hudCache.breakMeter !== bm) {
    hudCache.breakMeter = bm;
    const el = $('btn-break');
    setMeter(el, w.breakMeter, 'Storm Break charge');
    const ready = w.breakReady;
    el.disabled = !ready;
    el.setAttribute('aria-label', ready ? 'Storm Break ready' : `Storm Break charge ${Math.round(w.breakMeter * 100)}%`);
  }
  if (isDaily) {
    const pct = Math.min(1, w.score / daily.target);
    const text = `Daily ${dailyLabel()} · ${w.score}/${daily.target}`;
    if (hudCache.daily !== text) {
      hudCache.daily = text;
      $('hud-daily').textContent = text;
      $('hud-daily').style.setProperty('--pct', `${Math.round(pct * 100)}%`);
    }
    $('hud-daily').classList.remove('hidden');
  } else {
    $('hud-daily').classList.add('hidden');
  }
}

// ------------------------------------------------------------ Storm Break

function tryBreak() {
  if (mode !== 'play' || !world || !world.breakReady) return false;
  sound.unlock();
  return world.stormBreak();
}

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', () => startRun(false));
$('btn-daily').addEventListener('click', () => startRun(true));
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startRun(isDaily));
$('btn-again').addEventListener('click', () => startRun(isDaily));
$('btn-again-daily').addEventListener('click', () => startRun(true));
$('btn-home').addEventListener('click', toTitle);
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', toTitle);

// The HUD buttons answer to pointerdown: a `click` can be dropped when a
// second finger lands while the first one is already swiping.
function hudButton(id, fn) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
  // Keyboard activation still arrives as a click.
  el.addEventListener('click', (e) => { if (e.detail === 0) fn(); });
}
hudButton('btn-pause', pause);
hudButton('btn-mute', toggleMute);
hudButton('btn-break', tryBreak);

addEventListener('click', (e) => {
  if (resultGuardActive()) { e.preventDefault(); e.stopPropagation(); }
}, { capture: true });
// The field takes the window's shape, so a resize or a phone turning sideways
// reshapes the world too; points gathered in the old coordinates are dropped.
addEventListener('resize', () => {
  renderer.resize();
  if (world) world.setWidth(renderer.fw, renderer.k);
  swipePts = [];
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

// Another tab wrote the save: fold it in instead of letting the last tab win.
addEventListener('storage', (e) => {
  if (params.has('autopilot')) return;
  if (e.key !== SAVE_KEY && e.key !== null) return;
  let theirs = null;
  try { theirs = JSON.parse(e.newValue || 'null'); } catch { /* damaged: ignore */ }
  const before = save.best;
  save = mergeSave(save, theirs);
  if (mode === 'title') refreshTitle();
  log.event('save.adopted', { best: save.best, 'best.changed': save.best !== before, streak: save.daily.streak });
});

// ------------------------------------------------------------ swipe input

// Only one pointer drives the blade. A second finger is the touch shortcut
// for Storm Break, and a mouse slices on movement alone (no button needed).
const activePointers = new Set();
let bladePointer = null;

function resetInput() {
  swipePts = [];
  activePointers.clear();
  bladePointer = null;
  world?.endSwipe();
}

function onPointerDown(e) {
  sound.unlock();
  if (mode === 'paused' || mode === 'over' || mode === 'dailyDone') return;
  if (e.pointerType !== 'mouse') {
    activePointers.add(e.pointerId);
    if (activePointers.size >= 2) { tryBreak(); return; }
  }
  bladePointer = e.pointerId;
  world?.endSwipe(); // a new press is always a new gesture
  swipePts = [renderer.toField(e.clientX, e.clientY)];
  if (e.pointerType !== 'mouse') {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* optional */ }
  }
}

function onPointerMove(e) {
  if (mode !== 'play') return;
  if (e.pointerType !== 'mouse' && e.pointerId !== bladePointer) return;
  const f = renderer.toField(e.clientX, e.clientY);
  const prev = swipePts[swipePts.length - 1];
  if (!prev || Math.hypot(f.x - prev.x, f.y - prev.y) * 60 > BLADE.minSpeed) {
    swipePts.push(f);
    if (swipePts.length > 40) swipePts.shift();
  }
}

function onPointerUp(e) {
  activePointers.delete(e.pointerId);
  if (e.pointerId === bladePointer) {
    bladePointer = null;
    swipePts = [];
    world?.endSwipe();
  }
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// A lost focus must not leave a finger "down" or a half-drawn swipe behind.
addEventListener('blur', resetInput);

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (resultGuardActive()) { e.preventDefault(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') { e.preventDefault(); pause(); }
    else if (mode === 'paused') resume();
    else if (mode === 'over' || mode === 'dailyDone' || e.code === 'Escape') toTitle();
  }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Space' && mode === 'play') { e.preventDefault(); tryBreak(); return; }
  if ((e.code === 'Space' || e.code === 'Enter') && mode !== 'play' && mode !== 'paused') {
    e.preventDefault();
    if (mode === 'over' || mode === 'dailyDone') startRun(isDaily);
    else if (mode === 'title') startRun(false);
  }
});

// Hide the pointer while playing; the swipe IS the pointer.
let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  const playing = mode === 'play';
  canvas.classList.toggle('playing', playing);
  document.body.classList.toggle('no-cursor', playing && pointerIdle > 1.2);
}

// ------------------------------------------------------------ loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, score: world?.score ?? 0, shards: world?.shards?.length ?? 0, attract: isAttract }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

// The music leans harder as the storm climbs.
function trackEvents(events) {
  for (const e of events) if (e.type === 'wave') sound.setSong(e.level, e.level >= 4);
}

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePointer(dt);

  if (mode === 'play' || (isAttract && mode === 'title')) {
    if (world && world.status === 'play') {
      const playing = mode === 'play';
      let blade = playing && swipePts.length ? { points: swipePts } : null;
      // The pilot swings when idle: the title backdrop and ?autopilot runs.
      if (!blade && (!playing || autopilot)) {
        const a = attractPilot.controls(world, dt);
        if (a.breakNow) world.stormBreak();
        if (a.points) blade = a;
      }
      swipePts = [];
      accumulator += dt;
      while (accumulator >= STEP) {
        world.step(STEP, blade);
        blade = null;
        accumulator -= STEP;
      }
      renderer.handleEvents(world.events, world);
      if (playing) { sound.handle(world.events); trackEvents(world.events); }
      world.events.length = 0;
      if (playing) {
        updateHud();
        if (world.status === 'over') bankRun(); // earned now, shown in a beat
        if (isDaily && world.dailyCleared) {
          bankRun();
          onDailyClear();
          return drawAndSchedule();
        }
        if (world.status === 'over') {
          overTimer += dt;
          if (overTimer > 0.9) onGameOver();
        }
      } else if (world.status === 'over') {
        attract();
      }
    } else if (world && world.status === 'ready' && mode === 'play') {
      // The 3-2-1 countdown still steps so the world's "GO!" registers.
      accumulator += dt;
      while (accumulator >= STEP) { world.step(STEP, swipePts.length ? { points: swipePts } : null); swipePts = []; accumulator -= STEP; }
      renderer.handleEvents(world.events, world);
      sound.handle(world.events);
      world.events.length = 0;
      updateHud();
    } else if (world && world.status === 'over' && mode === 'play') {
      bankRun();
      overTimer += dt;
      if (overTimer > 0.9) onGameOver();
    }
  }
  return drawAndSchedule();

  // Shared tail: render + reschedule, so no early exit can drop a frame.
  function drawAndSchedule() {
    if (mode !== 'paused') renderer.update(dt, world);
    renderer.draw(world, { attract: isAttract && mode === 'title', daily: isDaily });
    requestAnimationFrame(loop);
  }
}

// A crash inside a frame shows the crash screen instead of a frozen picture.
const loop = telemetry ? telemetry.guard(frame, 'shard-storm.frame') : frame;

// E2E hook: mirror telemetry events into the page for the test harness.
if (location.protocol !== 'file:') {
  window.__telemetry = [];
  const baseEvent = log.event;
  log.event = (name, data) => { window.__telemetry.push({ name, data }); baseEvent(name, data); };
  log.event('game.ready', { best: save.best, streak: save.daily.streak });
  toTitle();
  requestAnimationFrame(loop);
}

window.SS = {
  get mode() { return mode; },
  get world() { return world; },
  get isDaily() { return isDaily; },
  get autopilot() { return autopilot; },
  get save() { return save; },
  get banked() { return banked; },
  startRun,
  tryBreak,
  renderer,
  sound,
  // Test rig: clear the field and blade ribbon so the next swipe is fresh.
  resetForTest() {
    if (!world) return;
    world.shards.length = 0;
    world.blade.pts.length = 0;
    world.swiping = false;
    world.hit = new Set();
  },
};
