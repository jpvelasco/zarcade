// Browser entry for Shard Storm: screens, the fixed-step loop, swipe input,
// sound and saves. The simulation lives in world.js and is DOM-free.
import { World } from './world.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Autopilot } from './ai.js';
import { STEP, FIELD, BLADE, DAILY } from './config.js';
import { loadSave, writeSave, recordRun, recordDaily } from './progress.js';
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
let attractPilot = new Autopilot();
const autopilot = params.has('autopilot'); // flag: the attract pilot plays for us
let isAttract = false;
let swipePts = []; // pointer points gathered since the last step

const SCREENS = ['screen-title', 'screen-pause', 'screen-over', 'screen-dailydone'];
const RESULT_SCREENS = ['screen-over', 'screen-dailydone'];
const RESULT_GUARD_MS = 700;
let shownAt = 0;
let shownId = null;

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
    return new World({ seed: daily.seed, daily: true, target: daily.target });
  }
  daily = null;
  return new World({ seed: seedParam ?? Math.floor(Math.random() * 2 ** 31) });
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
  swipePts = [];
  showScreen(null);
  log.event('run.start', { daily: dailyRun, seed: world.seed, target: daily ? daily.target : DAILY.target });
}

function attract() {
  const w = new World({ seed: Math.floor(Math.random() * 2 ** 31) });
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
  const best = save.best;
  $('title-best').textContent = best ? `Best ${best.toLocaleString('en-US')}` : '';
  $('title-daily').textContent = `Daily · ${dailyLabel()}`;
  updateSoundButtons();
  showScreen('screen-title');
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  swipePts = [];
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

function onGameOver() {
  mode = 'over';
  const best = recordRun(save, world.score, world.stats.sliced);
  if (isDaily && world.dailyCleared) bankDaily();
  persist();
  log.event('run.end', { score: world.score, 'best.new': best, sliced: world.stats.sliced, 'max.combo': world.maxCombo, 'mines.hit': world.stats.minesHit, daily: isDaily, cleared: isDaily ? world.dailyCleared : false, streak: daily ? daily.streak : 0 });
  $('over-score').textContent = world.score.toLocaleString('en-US');
  $('over-best').textContent = best ? 'New best!' : `Best ${save.best.toLocaleString('en-US')}`;
  $('over-lines').innerHTML = [
    ['Shards sliced', world.stats.sliced],
    ['Best combo', `×${world.maxCombo}`],
    ['Mines hit', world.stats.minesHit],
    ['Survived', `${Math.floor(world.time)}s`],
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  showScreen('screen-over');
}

function onDailyClear() {
  // Reached the daily target mid-run: freeze, celebrate, bank the streak.
  mode = 'dailyDone';
  const streak = bankDaily();
  recordRun(save, world.score, world.stats.sliced);
  persist();
  log.event('daily.clear', { score: world.score, target: daily.target, streak, sliced: world.stats.sliced });
  $('done-streak').textContent = `Day ${streak} in a row`;
  $('done-score').textContent = world.score.toLocaleString('en-US');
  showScreen('screen-dailydone');
}

// ------------------------------------------------------------ sound

function updateSoundButtons() {
  const label = save.muted ? 'Sound off' : 'Sound on';
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = label;
  $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
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

function updateHud() {
  $('hud-score').textContent = world.score.toLocaleString('en-US');
  const hearts = '●'.repeat(world.lives) + '○'.repeat(3 - world.lives);
  $('hud-lives').textContent = hearts;
  $('hud-combo').textContent = world.combo >= 2 ? `×${world.combo}` : '';
  if (isDaily) {
    const pct = Math.min(1, world.score / daily.target);
    $('hud-daily').textContent = `Daily ${dailyLabel()} · ${world.score}/${daily.target}`;
    $('hud-daily').style.setProperty('--pct', `${Math.round(pct * 100)}%`);
    $('hud-daily').classList.remove('hidden');
  } else {
    $('hud-daily').classList.add('hidden');
  }
}

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', () => startRun(false));
$('btn-daily').addEventListener('click', () => startRun(true));
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startRun(isDaily));
$('btn-pause').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-again').addEventListener('click', () => startRun(isDaily));
$('btn-again-daily').addEventListener('click', () => startRun(true));
$('btn-home').addEventListener('click', toTitle);
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', toTitle);
addEventListener('click', (e) => {
  if (RESULT_SCREENS.includes(shownId) && performance.now() - shownAt < RESULT_GUARD_MS) { e.preventDefault(); e.stopPropagation(); }
}, { capture: true });
addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

// Swipe input: pointer moves while playing are gathered as swipe points.
function onPointerDown(e) {
  sound.unlock();
  if (mode === 'paused' || mode === 'over' || mode === 'dailyDone') return;
  const f = renderer.toField(e.clientX, e.clientY);
  swipePts = [f];
  if (e.pointerType !== 'mouse') {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* optional */ }
  }
}
function onPointerMove(e) {
  if (mode !== 'play') return;
  const f = renderer.toField(e.clientX, e.clientY);
  const prev = swipePts[swipePts.length - 1];
  if (!prev || Math.hypot(f.x - prev.x, f.y - prev.y) * 60 > BLADE.minSpeed) {
    swipePts.push(f);
    if (swipePts.length > 40) swipePts.shift();
  }
}
function onPointerUp() {
  swipePts = [];
}
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') { e.preventDefault(); pause(); }
    else if (mode === 'paused') resume();
    else if (mode === 'over' || mode === 'dailyDone' || e.code === 'Escape') toTitle();
  }
  if (e.code === 'KeyM') toggleMute();
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
      if (playing) sound.handle(world.events);
      world.events.length = 0;
      if (playing) {
        updateHud();
        if (isDaily && world.dailyCleared) {
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
    } else if (world.status === 'ready' && mode === 'play') {
      // The 3-2-1 countdown still steps so the world's "GO!" registers.
      accumulator += dt;
      while (accumulator >= STEP) { world.step(STEP, swipePts.length ? { points: swipePts } : null); swipePts = []; accumulator -= STEP; }
      renderer.handleEvents(world.events, world);
      sound.handle(world.events);
      world.events.length = 0;
      updateHud();
    } else if (world.status === 'over' && mode === 'play') {
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
  save,
  startRun,
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
