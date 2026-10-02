// Browser entry: screens, the fixed-step loop, input, sound, saves and
// telemetry. Everything that touches the DOM lives here.

import { Pilot } from './ai.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { STAGE_TRACK } from './music.js';
import { STAGES, buildStage } from './levels.js';
import { frameMonitor } from './perf.js';
import {
  SAVE_KEY, addHighScore, cleanInitials, loadSave, recordStage, tableRank, treasureTotals, writeSave,
} from './progress.js';
import { Renderer } from './render.js';
import { World, createRun, MODES } from './world.js';
import { PHYS } from './physics.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;
const POINTER_IDLE = 2;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

// Reading `localStorage` throws when the browser blocks site storage; the
// save helpers treat a null store as "nothing saved".
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
let saveWarned = false;
function persist() {
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

if (query.has('retro')) save.settings.retro = true;
if (query.has('nocrt')) save.settings.crt = false;

const canvas = $('game');
const renderer = new Renderer(canvas, { reducedMotion: reduced });
const input = new Input();
const sound = new Sound({ muted: save.settings.muted, music: save.settings.music });
const TREASURE_TOTALS = STAGES.map((_, i) => buildStage(i).treasureTotal);

const state = {
  mode: 'title',
  world: null,
  run: null,
  runAtStageStart: null,
  attract: false,
  attractPilot: null,
  autopilot: query.has('autopilot') ? new Pilot(0) : null,
  players: query.get('players') === '2' ? 2 : 1,
  accumulator: 0,
  last: performance.now(),
  pendingClear: -1,
  pendingOver: -1,
  cleared: null,
  overCount: 0,
  pointerIdle: 0,
  pointerHidden: false,
  initials: cleanInitials(save.lastInitials).split(''),
  slot: 0,
  lastRank: -1,
  afterScores: 'title',
  optionsReturn: 'screen-title',
  crash: false,
};

// Browsers only allow audio after a real gesture.
let audioArmed = false;
function armAudio() {
  if (audioArmed) return;
  audioArmed = true;
  sound.unlock();
  sound.playTrack(state.mode === 'play' && state.world ? STAGE_TRACK[state.world.level.id] : 'title');
}
window.addEventListener('pointerdown', armAudio);
window.addEventListener('keydown', armAudio);

// ------------------------------------------------------------- settings

function applySettings() {
  const s = save.settings;
  renderer.setSettings({ crt: s.crt, retro: s.retro, shake: s.shake });
  document.body.classList.toggle('crt-on', s.crt);
  sound.setMuted(s.muted);
  sound.setMusic(s.music);
  for (const button of document.querySelectorAll('[data-setting]')) {
    const key = button.dataset.setting;
    const on = key === 'sound' ? !s.muted : !!s[key];
    button.setAttribute('aria-pressed', String(on));
  }
}

function toggleSetting(key) {
  const s = save.settings;
  if (key === 'sound') s.muted = !s.muted;
  else s[key] = !s[key];
  applySettings();
  persist();
  sound.click();
  log.event('settings.change', { setting: key, value: key === 'sound' ? !s.muted : s[key] });
}

for (const button of document.querySelectorAll('[data-setting]')) {
  button.addEventListener('click', () => toggleSetting(button.dataset.setting));
}

// --------------------------------------------------------------- screens

const SCREENS = [...document.querySelectorAll('.overlay')];

// Result cards ignore presses for a moment after they appear, so a player
// still mashing jump, fire or the screen doesn't skip straight past them.
const RESULT_SCREENS = new Set(['screen-clear', 'screen-over', 'screen-victory', 'screen-name']);
const RESULT_GUARD_MS = 700;
let shownAt = 0;
let shownId = null;
const guarded = () => RESULT_SCREENS.has(shownId) && performance.now() - shownAt < RESULT_GUARD_MS;

function showScreen(id) {
  shownAt = performance.now();
  shownId = id;
  for (const screen of SCREENS) screen.classList.toggle('hidden', screen.id !== id);
  $('arcade-link').classList.toggle('hidden', !(id === 'screen-title' || id === 'screen-stages' || id === 'screen-scores' || id === 'screen-options'));
  input.enabled = state.mode === 'play';
  if (id) {
    const el = $(id);
    const first = el.querySelector('[data-default]:not([disabled])') || el.querySelector('.button.primary:not([disabled])') || el.querySelector('button:not([disabled])');
    if (first) first.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(state.mode === 'play' ? 1 : state.mode === 'paused' ? 0.35 : 0.7);
}

function setPlayUi(on) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  $('touch').classList.toggle('hidden', !(on && coarse));
}

function startAttract() {
  const world = new World(0, { mode: 'adventure', players: 1 });
  world.run.lives[0] = 99;
  state.world = world;
  state.attract = true;
  state.attractPilot = new Pilot(0);
  renderer.setWorld(world);
}

function showTitle() {
  state.mode = 'title';
  if (!state.attract) startAttract();
  setPlayUi(false);
  updateTitle();
  showScreen('screen-title');
  if (audioArmed) sound.playTrack('title');
}

function updateTitle() {
  const t = treasureTotals(save, TREASURE_TOTALS);
  const best = save.table[0];
  $('title-progress').textContent = save.unlocked > 1
    ? `Stages open: ${save.unlocked}/${STAGES.length} · Treasure found: ${t.found}/${t.all} · Top score ${best.score.toLocaleString('en-US')} (${best.name})`
    : `Six wild stages, six giant bosses and a jungle full of treasure. Top score ${best.score.toLocaleString('en-US')} (${best.name}).`;
  $('btn-players').textContent = `Players: ${state.players}`;
  $('btn-players').setAttribute('aria-pressed', String(state.players === 2));
  $('btn-stages').disabled = false;
}

function buildStageList() {
  const host = $('stage-list');
  host.innerHTML = '';
  STAGES.forEach((stage, i) => {
    const open = i < save.unlocked;
    const best = save.best[stage.id];
    const button = document.createElement('button');
    button.className = `stage-card${open ? '' : ' locked'}`;
    button.disabled = !open;
    button.style.setProperty('--accent', ['#3ae04a', '#3ac8ff', '#9a7aff', '#ffd23a', '#ff6a1a', '#ff4cf0'][i]);
    button.innerHTML = `<span>Stage ${i + 1}</span><b>${stage.name}</b><span>${open
      ? (best ? `Best ${best.score.toLocaleString('en-US')} · treasure ${best.treasures}/${TREASURE_TOTALS[i]}` : stage.hint)
      : 'Clear the stage before to unlock'}</span>`;
    button.addEventListener('click', () => {
      sound.click();
      startGame('adventure', i);
    });
    host.appendChild(button);
  });
}

function showStages() {
  state.mode = 'stages';
  buildStageList();
  showScreen('screen-stages');
}

function buildScores(highlight = -1) {
  const host = $('score-table');
  host.innerHTML = '';
  save.table.forEach((row, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.className = 'mine';
    li.innerHTML = `<span>${i + 1}.</span><span>${row.name}</span><span class="score">${row.score.toLocaleString('en-US')}</span><span class="mode">${row.mode === 'arcade' ? 'ARCADE' : 'ADV'} ${row.stage}</span>`;
    host.appendChild(li);
  });
}

function showScores(highlight = -1) {
  state.mode = 'scores';
  buildScores(highlight);
  showScreen('screen-scores');
}

function showOptions(from) {
  state.optionsReturn = from;
  state.mode = 'options';
  applySettings();
  showScreen('screen-options');
}

// ------------------------------------------------------------------ game

function startGame(mode, stageIndex = 0) {
  state.run = createRun({ mode, players: state.players });
  input.setPlayers(state.players);
  log.event('game.start', { mode, players: state.players, stage: stageIndex + 1 });
  startStage(stageIndex);
}

function cloneRun(run) {
  return JSON.parse(JSON.stringify({ ...run, continuesLeft: Number.isFinite(run.continuesLeft) ? run.continuesLeft : 'inf' }));
}
function restoreRun(copy) {
  const run = JSON.parse(JSON.stringify(copy));
  if (run.continuesLeft === 'inf') run.continuesLeft = Infinity;
  return run;
}

function startStage(index) {
  state.runAtStageStart = cloneRun(state.run);
  const world = new World(index, { run: state.run, seed: 1 });
  state.world = world;
  state.attract = false;
  state.pendingClear = -1;
  state.pendingOver = -1;
  state.cleared = null;
  state.accumulator = 0;
  renderer.setWorld(world);
  renderer.showBanner(`STAGE ${index + 1}`, world.level.title.toUpperCase(), 2.8);
  state.mode = 'play';
  showScreen(null);
  setPlayUi(true);
  input.enabled = true;
  if (audioArmed) sound.playTrack(STAGE_TRACK[world.level.id]);
  log.event('level.start', { stage: index + 1, 'stage.id': world.level.id, mode: state.run.mode, players: state.run.players });
  queueMicrotask(() => monitor.mark(performance.now()));
  if (query.has('boss')) jumpToBoss(world);
  revealPointer();
}

function jumpToBoss(world) {
  const a = world.arena;
  if (!a) return;
  world.checkpoint = world.level.checkpoints.length - 1;
  world.players.forEach((p, i) => {
    p.x = a.x0 - 40 - i * 16;
    p.y = a.floor - PHYS.height;
    p.safe = { x: p.x, y: p.y };
  });
  world.updateCamera(1, true);
}

function pause() {
  if (state.mode !== 'play') return;
  // The boss is beaten: bank the clear now, so quitting from the pause menu
  // (or closing a hidden tab) during the celebration keeps the win.
  if (state.world.boss && state.world.boss.hp <= 0) bankStage();
  state.mode = 'paused';
  $('pause-stage').textContent = `Stage ${state.world.stageIndex + 1} · ${state.world.level.name}`;
  applySettings();
  showScreen('screen-pause');
  setPlayUi(false);
  revealPointer();
}

function resume() {
  if (state.mode !== 'paused') return;
  state.mode = 'play';
  state.accumulator = 0;
  showScreen(null);
  setPlayUi(true);
}

function restartStage() {
  state.run = restoreRun(state.runAtStageStart);
  startStage(state.world.stageIndex);
}

function onWorldEvents(world) {
  for (const e of world.events) {
    if (e.type === 'bossIntro') {
      if (audioArmed) sound.playTrack('boss');
      log.event('boss.start', { stage: world.stageIndex + 1, boss: e.boss });
    } else if (e.type === 'bossDown') {
      log.event('boss.defeat', { stage: world.stageIndex + 1, boss: e.boss, 'time.s': Math.round(world.stats.time) });
    } else if (e.type === 'stageClear') {
      bankStage();
      state.pendingClear = 1.6;
    } else if (e.type === 'gameOver') {
      state.pendingOver = 1.4;
    } else if (e.type === 'death') {
      log.event('player.death', { stage: world.stageIndex + 1, cause: e.cause, player: e.player + 1 });
    } else if (e.type === 'bomb') {
      log.event('player.bomb', { stage: world.stageIndex + 1 });
    }
  }
}

/** Bank the clear bonus and save the clear, once per stage. */
function bankStage() {
  if (state.cleared) return state.cleared;
  const world = state.world;
  const res = world.bankClear();
  const record = recordStage(save, world.stageIndex, { treasures: res.treasures, score: state.run.score, time: res.time });
  persist();
  log.event('level.complete', {
    stage: world.stageIndex + 1, score: state.run.score, 'time.s': Math.round(res.time), treasures: res.treasures,
    'treasures.total': res.treasureTotal, hits: res.hits, deaths: res.deaths, mode: state.run.mode, 'best.new': record,
  });
  state.cleared = res;
  return res;
}

function showClear() {
  const world = state.world;
  const res = bankStage();
  state.mode = 'clear';
  const last = world.stageIndex >= STAGES.length - 1;
  $('clear-stage').textContent = `Stage ${world.stageIndex + 1} · ${world.level.name}`;
  $('clear-title').textContent = res.hits === 0 ? 'Flawless!' : 'Stage clear!';
  $('clear-time').textContent = res.timeBonus.toLocaleString('en-US');
  $('clear-treasure').textContent = `${res.treasures}/${res.treasureTotal} · ${res.treasureBonus.toLocaleString('en-US')}`;
  $('clear-flawless').textContent = res.flawless.toLocaleString('en-US');
  $('clear-score').textContent = state.run.score.toLocaleString('en-US');
  $('clear-note').textContent = last ? 'That was the last one...' : `Next: ${STAGES[world.stageIndex + 1].title}`;
  $('btn-next').textContent = last ? 'Finish! →' : 'Next stage →';
  setPlayUi(false);
  showScreen('screen-clear');
}

function nextStage() {
  const world = state.world;
  if (world.stageIndex >= STAGES.length - 1) {
    state.mode = 'victory';
    $('victory-score').textContent = state.run.score.toLocaleString('en-US');
    log.event('game.complete', { score: state.run.score, mode: state.run.mode, players: state.run.players });
    showScreen('screen-victory');
    if (audioArmed) sound.playTrack('title');
    return;
  }
  startStage(world.stageIndex + 1);
}

function showOver() {
  const run = state.run;
  state.mode = 'over';
  setPlayUi(false);
  const left = run.continuesLeft;
  log.event('level.fail', { stage: state.world.stageIndex + 1, score: run.score, mode: run.mode, 'continues.left': Number.isFinite(left) ? left : -1 });
  $('btn-continue').disabled = left <= 0;
  if (left <= 0) {
    state.overCount = 0;
    $('over-note').textContent = 'No continues left. What a run!';
    $('over-count').textContent = run.score.toLocaleString('en-US');
  } else if (Number.isFinite(left)) {
    state.overCount = 10;
    $('over-note').textContent = `Continue from the checkpoint? ${left} left${run.mode === 'arcade' ? ' (score resets)' : ''}.`;
  } else {
    state.overCount = 0;
    $('over-count').textContent = '♥';
    $('over-note').textContent = 'Keep going from the last checkpoint — you keep your score!';
  }
  showScreen('screen-over');
}

function continueGame() {
  if (!state.world.continueGame()) return;
  log.event('game.continue', { stage: state.world.stageIndex + 1, mode: state.run.mode });
  state.mode = 'play';
  state.pendingOver = -1;
  showScreen(null);
  setPlayUi(true);
  if (audioArmed) sound.playTrack(state.world.boss && !state.world.boss.dead ? 'boss' : STAGE_TRACK[state.world.level.id]);
}

function giveUp() {
  log.event('game.end', { stage: state.world.stageIndex + 1, score: state.run.score, mode: state.run.mode });
  maybeName();
}

function maybeName() {
  const score = state.run ? state.run.score : 0;
  const rank = tableRank(save, score);
  if (rank < 0) {
    state.afterScores = 'title';
    showScores();
    return;
  }
  state.mode = 'name';
  state.slot = 0;
  state.initials = cleanInitials(save.lastInitials).split('');
  $('name-rank').textContent = rank === 0 ? 'The new top score!' : `New high score · #${rank + 1}`;
  $('name-score').textContent = score.toLocaleString('en-US');
  drawInitials();
  showScreen('screen-name');
  $('btn-name-ok').focus({ preventScroll: true });
}

function drawInitials() {
  [...$('initials').children].forEach((slot, i) => {
    slot.querySelector('b').textContent = state.initials[i];
    slot.classList.toggle('active', i === state.slot);
  });
}

function nudgeLetter(slot, dir) {
  const i = LETTERS.indexOf(state.initials[slot]);
  state.initials[slot] = LETTERS[(i + dir + LETTERS.length) % LETTERS.length];
  state.slot = slot;
  sound.move();
  drawInitials();
}

function saveName() {
  const run = state.run;
  const rank = addHighScore(save, {
    name: state.initials.join(''), score: run.score, stage: state.world.stageIndex + 1, mode: run.mode,
  });
  persist();
  log.event('highscore.entry', { rank: rank + 1, score: run.score, mode: run.mode });
  state.afterScores = 'title';
  state.run = null;
  showScores(rank);
}

// ---------------------------------------------------------------- pointer

function revealPointer() {
  state.pointerIdle = 0;
  if (state.pointerHidden) {
    state.pointerHidden = false;
    document.body.classList.remove('no-cursor');
  }
}
window.addEventListener('mousemove', revealPointer);
window.addEventListener('pointerdown', revealPointer);

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

// ------------------------------------------------------------- menu keys

function visibleButtons() {
  const screen = SCREENS.find((s) => !s.classList.contains('hidden'));
  if (!screen) return [];
  return [...screen.querySelectorAll('button:not([disabled]), a.button')].filter((el) => el.offsetParent !== null);
}

function moveFocus(dir) {
  const list = visibleButtons();
  if (!list.length) return;
  const i = list.indexOf(document.activeElement);
  const next = i < 0 ? 0 : (i + dir + list.length) % list.length;
  list[next].focus({ preventScroll: false });
  sound.move();
}

function menuBack() {
  if (state.mode === 'stages' || state.mode === 'scores') {
    if (state.mode === 'scores' && state.afterScores === 'title') return showTitle();
    return showTitle();
  }
  if (state.mode === 'options') return closeOptions();
  if (state.mode === 'paused') return resume();
  return undefined;
}

function closeOptions() {
  if (state.optionsReturn === 'screen-pause') {
    state.mode = 'paused';
    showScreen('screen-pause');
  } else showTitle();
}

window.addEventListener('keydown', (event) => {
  if (state.mode === 'play') return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (state.mode === 'name') {
    if (guarded()) { event.preventDefault(); return; }
    if (/^Key[A-Z]$/.test(event.code) || /^Digit\d$/.test(event.code)) {
      state.initials[state.slot] = event.code.slice(-1);
      state.slot = Math.min(2, state.slot + 1);
      drawInitials();
      sound.move();
      event.preventDefault();
      return;
    }
    if (event.code === 'ArrowUp') { nudgeLetter(state.slot, -1); event.preventDefault(); return; }
    if (event.code === 'ArrowDown') { nudgeLetter(state.slot, 1); event.preventDefault(); return; }
    if (event.code === 'ArrowLeft' || event.code === 'Backspace') { state.slot = Math.max(0, state.slot - 1); drawInitials(); event.preventDefault(); return; }
    if (event.code === 'ArrowRight') { state.slot = Math.min(2, state.slot + 1); drawInitials(); event.preventDefault(); return; }
    if (event.code === 'Enter') { saveName(); event.preventDefault(); return; }
    return;
  }
  if (event.code === 'ArrowDown' || event.code === 'ArrowRight') { moveFocus(1); event.preventDefault(); }
  else if (event.code === 'ArrowUp' || event.code === 'ArrowLeft') { moveFocus(-1); event.preventDefault(); }
  else if (event.code === 'Escape' && state.mode !== 'paused') { menuBack(); }
});

function handlePadMenu(command) {
  if (guarded()) return;
  if (state.mode === 'name') {
    if (command === 'navUp') nudgeLetter(state.slot, -1);
    else if (command === 'navDown') nudgeLetter(state.slot, 1);
    else if (command === 'navLeft') { state.slot = Math.max(0, state.slot - 1); drawInitials(); }
    else if (command === 'navRight') { state.slot = Math.min(2, state.slot + 1); drawInitials(); }
    else if (command === 'confirm') saveName();
    return;
  }
  if (command === 'navUp' || command === 'navLeft') moveFocus(-1);
  else if (command === 'navDown' || command === 'navRight') moveFocus(1);
  else if (command === 'confirm') {
    const el = document.activeElement;
    if (el && (el.tagName === 'BUTTON' || el.tagName === 'A')) el.click();
  } else if (command === 'back') menuBack();
}

// ------------------------------------------------------------------ loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode: state.mode, stage: state.world ? state.world.stageIndex + 1 : 0, attract: state.attract }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

function frame(now) {
  monitor.frame(now);
  if (state.crash) {
    state.crash = false;
    throw new Error('Forced crash for testing the crash screen');
  }
  const dt = Math.min(0.05, Math.max(0, (now - state.last) / 1000));
  state.last = now;
  updatePointer(dt);
  input.pollCommands();
  for (const command of input.drain()) {
    if (command === 'pause') {
      if (state.mode === 'play') pause();
      else if (state.mode === 'paused') resume();
    } else if (command === 'mute') toggleSetting('sound');
    else if (state.mode !== 'play') handlePadMenu(command);
  }

  const world = state.world;
  if (world && state.mode === 'play') {
    state.accumulator += dt;
    let steps = 0;
    while (state.accumulator >= STEP && steps < MAX_STEPS) {
      const inputs = [input.read(0), input.read(1)];
      if (state.autopilot) inputs[0] = state.autopilot.controls(world);
      world.step(STEP, inputs);
      state.accumulator -= STEP;
      steps += 1;
      if (world.events.length) {
        renderer.handleEvents(world.events);
        sound.handleEvents(world.events);
        onWorldEvents(world);
        world.events.length = 0;
      }
    }
    if (steps >= MAX_STEPS) state.accumulator = 0;
    if (state.pendingClear > 0) {
      state.pendingClear -= dt;
      if (state.pendingClear <= 0) showClear();
    }
    if (state.pendingOver > 0) {
      state.pendingOver -= dt;
      if (state.pendingOver <= 0) showOver();
    }
  } else if (world && state.attract) {
    state.accumulator += dt;
    let steps = 0;
    while (state.accumulator >= STEP && steps < 3) {
      world.step(STEP, [state.attractPilot.controls(world)]);
      renderer.handleEvents(world.events);
      world.events.length = 0;
      state.accumulator -= STEP;
      steps += 1;
    }
    if (steps >= 3) state.accumulator = 0;
    if (world.status !== 'play' || world.t > 150) {
      state.attract = false;
      startAttract();
    }
  } else if (world && (state.mode === 'clear' || state.mode === 'over')) {
    // Let the explosions finish behind the result card.
    world.step(STEP, []);
    renderer.handleEvents(world.events);
    world.events.length = 0;
  }

  if (state.mode === 'over' && state.overCount > 0) {
    state.overCount -= dt;
    $('over-count').textContent = String(Math.max(0, Math.ceil(state.overCount - 1)));
    if (state.overCount <= 0) giveUp();
  }

  if (state.world) {
    renderer.frame(state.world, dt, { hud: !state.attract, hiScore: save.table[0].score });
  }
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen
// picture; after a crash the guard returns early, so the loop stops.
const loop = telemetry ? telemetry.guard(frame, 'jungle-blaster.frame') : frame;

// ---------------------------------------------------------------- wiring

const on = (id, fn) => $(id).addEventListener('click', () => { sound.click(); fn(); });
on('btn-adventure', () => startGame('adventure', 0));
on('btn-arcade', () => startGame('arcade', 0));
on('btn-players', () => { state.players = state.players === 2 ? 1 : 2; updateTitle(); });
on('btn-stages', showStages);
on('btn-scores', () => { state.afterScores = 'title'; showScores(); });
on('btn-options', () => showOptions('screen-title'));
on('btn-stages-back', showTitle);
on('btn-scores-back', showTitle);
on('btn-options-back', closeOptions);
on('btn-resume', resume);
on('btn-restart', restartStage);
on('btn-quit', () => { log.event('game.quit', { stage: state.world.stageIndex + 1 }); state.run = null; showTitle(); });
on('btn-next', nextStage);
on('btn-continue', continueGame);
on('btn-giveup', giveUp);
on('btn-name-ok', saveName);
on('btn-victory', maybeName);
// pointerdown, not click: browsers send no click for a second finger, and
// the other thumb is usually on the stick.
$('touch-pause').addEventListener('pointerdown', (event) => { event.preventDefault(); pause(); });
$('touch-pause').addEventListener('click', pause);
window.addEventListener('click', (event) => {
  if (guarded()) { event.preventDefault(); event.stopPropagation(); }
}, { capture: true });
for (const nudge of document.querySelectorAll('.nudge')) {
  nudge.addEventListener('click', () => nudgeLetter(Number(nudge.dataset.slot), Number(nudge.dataset.dir)));
}
input.bindTouch($('touch-stick'), $('touch-knob'), [...document.querySelectorAll('#touch [data-hold]')]);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// Another tab saved: take its copy, so this tab never writes a stale save
// over newer unlocks, best scores or high scores.
window.addEventListener('storage', (event) => {
  if (event.key !== SAVE_KEY && event.key !== null) return;
  const fresh = loadSave(storage);
  for (const key of Object.keys(save)) delete save[key];
  Object.assign(save, fresh);
  applySettings();
  if (state.mode === 'title') updateTitle();
  else if (state.mode === 'stages') buildStageList();
  else if (state.mode === 'scores') buildScores();
});

function layout() {
  renderer.resize();
  const stage = $('stage');
  document.documentElement.style.setProperty('--px', `${stage.clientHeight / 180}px`);
}
window.addEventListener('resize', layout);
layout();
applySettings();

log.event('game.ready', { unlocked: save.unlocked, 'table.top': save.table[0].score, reduced, retro: save.settings.retro, crt: save.settings.crt });

const wanted = Number.parseInt(query.get('stage') || '', 10);
if (Number.isFinite(wanted) && wanted >= 1 && wanted <= STAGES.length) {
  showTitle();
  startGame(query.get('mode') === 'arcade' ? 'arcade' : 'adventure', wanted - 1);
} else {
  showTitle();
}

requestAnimationFrame(loop);

window.JungleBlaster = {
  get state() { return state; },
  get world() { return state.world; },
  renderer,
  input,
  sound,
  save,
  MODES,
  startGame,
  startStage,
  pause,
  resume,
  crash: () => { state.crash = true; },
};
