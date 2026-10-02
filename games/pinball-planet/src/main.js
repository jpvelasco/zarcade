// Browser entry: screens, the fixed-step loop, input, sound, saves and
// telemetry.
import { World, STEP } from './world.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Autoplayer } from './ai.js';
import { DmdShow, fmtScore } from './dmd.js';
import { SAVE_KEY, loadSave, writeSave, qualifies, addScore, best } from './scores.js';
import { BALLS_PER_GAME } from './rules.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const canvas = $('game');
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
let saveWarned = false;
function persist() {
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const renderer = new Renderer(canvas, { reducedMotion: reduced });
const show = new DmdShow({ reducedMotion: reduced });
const sound = new Sound({ muted: save.muted, music: save.music });
let mode = 'loading'; // loading | title | scores | help | play | paused | initials | over
let world = new World({ seed: (Math.random() * 1e9) | 0, attract: true });
let attractAi = new Autoplayer((Math.random() * 1e9) | 0);
const autopilot = params.has('autopilot') ? new Autoplayer(7) : null;
// A ball that is about to auto-launch (ball save, lock) can't be plunged.
const input = new Input(canvas, { canPlunge: () => { const b = mode === 'play' && !autopilot && world.shooterBall(); return !!b && !b.auto; } });
let accumulator = 0;
let overTimer = 0;
let gameStartedAt = 0;
let lastScoreRank = -1;
const debug = { crash: false };

const SCREENS = ['screen-title', 'screen-scores', 'screen-help', 'screen-pause', 'screen-initials', 'screen-over'];

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('hud-buttons').classList.toggle('hidden', mode !== 'play');
  input.enabled = mode === 'play';
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(mode === 'play' ? 1 : mode === 'paused' ? 0.3 : 0.5);
  updateSide(true);
  updateTouchHints();
}

function newAttract() {
  world = new World({ seed: (Math.random() * 1e9) | 0, attract: true });
  attractAi = new Autoplayer((Math.random() * 1e9) | 0);
  show.reset();
}

function toTitle() {
  if (mode === 'play' || mode === 'paused' || mode === 'over' || mode === 'initials' || mode === 'loading') newAttract();
  mode = 'title';
  $('title-best').textContent = save.last ? `Last game ${fmtScore(save.last)} · Best ${fmtScore(best(save))}` : `High score ${fmtScore(best(save))}`;
  updateSoundButtons();
  showScreen('screen-title');
}

function toScores() {
  if (mode !== 'title' && mode !== 'over') newAttract();
  mode = 'scores';
  $('score-list').innerHTML = save.scores
    .map((s, i) => `<li class="${i === lastScoreRank ? 'me' : ''}"><span class="n">${s.name}</span><span class="s">${fmtScore(s.score)}</span></li>`)
    .join('');
  showScreen('screen-scores');
}

function toHelp() {
  mode = 'help';
  showScreen('screen-help');
}

function startGame() {
  sound.unlock();
  const seed = params.has('seed') ? Number(params.get('seed')) || 1 : (Math.random() * 1e9) | 0;
  world = new World({ seed });
  world.startGame();
  show.reset();
  if (autopilot) Object.assign(autopilot, new Autoplayer(seed));
  mode = 'play';
  accumulator = 0;
  overTimer = 0;
  lastScoreRank = -1;
  gameStartedAt = performance.now();
  input.clear();
  showScreen(null);
  hintsShownAt = performance.now();
  queueMicrotask(() => monitor.mark(performance.now()));
  log.event('level.start', { ball: 1, balls: BALLS_PER_GAME, autopilot: !!autopilot });
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  updateSoundButtons();
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  input.clear();
  showScreen(null);
}

// ------------------------------------------------------------ game over

function gameOver() {
  const r = world.rules;
  const score = r.score;
  save.games++;
  save.last = score;
  const high = qualifies(save, score);
  log.event('level.complete', {
    score, stars: r.missionsDone(), 'time.s': Math.round((performance.now() - gameStartedAt) / 1000),
    tours: r.tours, multiballs: r.multiballs, jackpots: r.jackpotsTotal, 'combo.best': r.bestCombo, 'high.score': high,
  });
  persist();
  if (high && !autopilot) return toInitials(score);
  toOver();
}

let initials = ['A', 'A', 'A'];
let iniSlot = 0;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function toInitials(score) {
  mode = 'initials';
  initials = (save.initials || 'AAA').padEnd(3, 'A').slice(0, 3).split('');
  iniSlot = 0;
  $('ini-score').textContent = fmtScore(score);
  renderInitials();
  showScreen('screen-initials');
  $('btn-ini-ok').focus({ preventScroll: true });
}

function renderInitials() {
  for (let i = 0; i < 3; i++) {
    $(`ini-${i}`).textContent = initials[i];
    $(`ini-${i}`).parentElement.classList.toggle('cur', i === iniSlot);
  }
}

function cycleLetter(slot, dir) {
  const i = LETTERS.indexOf(initials[slot]);
  initials[slot] = LETTERS[(i + dir + LETTERS.length) % LETTERS.length];
  iniSlot = slot;
  renderInitials();
}

function saveInitials() {
  if (mode !== 'initials') return;
  const rank = addScore(save, initials.join(''), world.rules.score);
  lastScoreRank = rank;
  persist();
  log.event('highscore.saved', { rank: rank + 1, score: world.rules.score });
  toOver();
}

function toOver() {
  mode = 'over';
  const r = world.rules;
  $('over-score').textContent = fmtScore(r.score);
  const rows = [
    ['Planets visited', r.tours * 5 + r.planetsVisited.filter(Boolean).length],
    ['Asteroid frenzies', r.frenzies],
    ['Multiballs', r.multiballs],
    ['Jackpots', r.jackpotsTotal],
    ['Best combo', r.bestCombo ? `${r.bestCombo}-way` : '–'],
  ];
  if (lastScoreRank >= 0) rows.unshift(['High score table', `#${lastScoreRank + 1}`]);
  $('over-lines').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  showScreen('screen-over');
}

// ------------------------------------------------------------ sound

function updateSoundButtons() {
  const label = save.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = label;
  $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', save.muted ? 'Unmute' : 'Mute');
  const ml = save.music ? '🎵 Music on' : '🎵 Music off';
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

// ------------------------------------------------------------ side panel

let sideKey = '';
function updateSide(force = false) {
  const side = $('side');
  const visible = document.body.classList.contains('side-panel') && (mode === 'play' || mode === 'paused');
  side.classList.toggle('hidden', !visible);
  if (!visible) return;
  const r = world.rules;
  const visited = r.planetsVisited.filter(Boolean).length;
  const key = [r.ball, visited, r.tours, r.targetsDown.join(), r.frenzy > 0, r.locked, r.lockLit, r.multiball, r.extraBallLit, r.kickbackLit, world.state].join('|');
  if (key === sideKey && !force) return;
  sideKey = key;
  $('sd-ball').textContent = `${Math.min(r.ball, BALLS_PER_GAME)} / ${BALLS_PER_GAME}${r.extraBalls ? ' +1' : ''}`;
  $('sd-best').textContent = fmtScore(best(save));
  $('p-tour').textContent = '●'.repeat(visited) + '○'.repeat(5 - visited) + (r.tours ? `  ×${r.tours}` : '');
  const down = r.targetsDown.filter(Boolean).length;
  $('p-frenzy').textContent = r.frenzy > 0 ? 'FRENZY!' : '◆'.repeat(down) + '◇'.repeat(3 - down) + (r.frenzies ? `  ×${r.frenzies}` : '');
  $('p-hole').textContent = r.multiball ? 'MULTIBALL!' : `${'●'.repeat(r.locked)}${'○'.repeat(2 - r.locked)}${r.lockLit ? '  lock lit' : ''}`;
  $('m-tour').classList.toggle('done', r.missions.tour);
  $('m-frenzy').classList.toggle('done', r.missions.frenzy);
  $('m-hole').classList.toggle('done', r.missions.multiball);
  $('m-frenzy').classList.toggle('active', r.frenzy > 0);
  $('m-hole').classList.toggle('active', r.multiball || r.lockLit);
  $('m-tour').classList.toggle('active', r.planetsLit.some(Boolean));
  let tip = '';
  if (world.shooterBall()) tip = input.mode === 'touch' ? 'Swipe down and let go to launch.' : 'Hold Space, then let go to launch. A soft launch is a skill shot!';
  else if (r.multiball) tip = 'Multiball! Jackpots on the ramp and the orbits.';
  else if (r.lockLit) tip = 'Lock is lit: sink the ball in the Black Hole.';
  else if (r.extraBallLit) tip = 'Extra Ball is lit at the Black Hole!';
  else if (!r.kickbackLit) tip = 'Spin the spinner to relight the kickback.';
  $('sd-tip').textContent = tip;
}

// ------------------------------------------------------------ touch hints

let hintsShownAt = 0;
function updateTouchHints() {
  const el = $('touch-hints');
  const on = coarse && mode === 'play';
  el.classList.toggle('hidden', !on);
  if (!on) return;
  const fresh = performance.now() - hintsShownAt < 6000;
  const plunge = !!world.shooterBall();
  $('th-plunge').classList.toggle('hidden', !plunge);
  el.classList.toggle('fade', !fresh && !plunge);
}

// ------------------------------------------------------------ layout

function applyLayout() {
  const L = renderer.layout;
  const root = document.documentElement.style;
  root.setProperty('--pf-left', `${Math.round(L.tx)}px`);
  root.setProperty('--pf-right', `${Math.round(L.tx + 640 * L.s)}px`);
  root.setProperty('--pf-top', `${Math.round(L.ty)}px`);
  document.body.classList.toggle('layout-landscape', L.mode === 'landscape');
  document.body.classList.toggle('layout-portrait', L.mode !== 'landscape');
  const room = innerWidth - (L.tx + 640 * L.s);
  document.body.classList.toggle('side-panel', L.mode === 'landscape' && room >= 330);
  updateSide(true);
}

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', startGame);
$('btn-again').addEventListener('click', startGame);
$('btn-scores').addEventListener('click', toScores);
$('btn-over-scores').addEventListener('click', toScores);
$('btn-help').addEventListener('click', toHelp);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => { log.event('game.restart', { score: world.rules.score, ball: world.rules.ball }); startGame(); });
$('btn-pause').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-ini-ok').addEventListener('click', saveInitials);
for (const b of document.querySelectorAll('#initials .arrow')) {
  b.addEventListener('click', () => cycleLetter(Number(b.dataset.slot), Number(b.dataset.dir)));
}
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', toTitle);
addEventListener('resize', () => {
  renderer.resize();
  renderer.ensureBaked();
  applyLayout();
  queueMicrotask(() => monitor.mark(performance.now(), 'resize'));
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// Another tab saved: take its copy, so this tab never writes a stale high-score
// table over it (whichever tab saved last used to win).
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY && e.key !== null) return;
  const fresh = loadSave(storage);
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, fresh);
  sound.setMuted(save.muted);
  sound.setMusic(save.music);
  updateSoundButtons();
  updateSide(true);
  if (mode === 'title') toTitle();
  else if (mode === 'scores') { lastScoreRank = -1; toScores(); }
});
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

function moveFocus(dir) {
  const screen = SCREENS.map($).find((s) => !s.classList.contains('hidden'));
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not([disabled]), a[href]')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
}

addEventListener('keydown', (e) => {
  if (mode === 'initials') {
    if (/^Key[A-Z]$/.test(e.code) || /^Digit[0-9]$/.test(e.code)) {
      initials[iniSlot] = e.code.slice(-1);
      iniSlot = Math.min(2, iniSlot + 1);
      renderInitials();
      e.preventDefault();
    } else if (e.code === 'Backspace') { iniSlot = Math.max(0, iniSlot - 1); renderInitials(); e.preventDefault(); }
    else if (e.code === 'ArrowUp') { cycleLetter(iniSlot, -1); e.preventDefault(); }
    else if (e.code === 'ArrowDown') { cycleLetter(iniSlot, 1); e.preventDefault(); }
    else if (e.code === 'ArrowLeft' || e.code === 'ShiftLeft') { iniSlot = Math.max(0, iniSlot - 1); renderInitials(); e.preventDefault(); }
    else if (e.code === 'ArrowRight' || e.code === 'ShiftRight') { iniSlot = Math.min(2, iniSlot + 1); renderInitials(); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') { saveInitials(); e.preventDefault(); }
    return;
  }
  if (mode === 'play') return;
  if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space') && document.activeElement === document.body) { startGame(); e.preventDefault(); return; }
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
});

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'scores' || mode === 'help' || mode === 'over') toTitle();
}

// ------------------------------------------------------------ loop

let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, state: world.state, balls: world.balls.length, ball: world.rules.ball, attract: world.state === 'attract' }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

// World events that matter outside the table: telemetry and screens.
function onWorldEvents(events) {
  const r = world.rules;
  for (const e of events) {
    switch (e.type) {
      case 'ballStart':
        if (r.ball > 1 || e.ball > 1) log.event('level.start', { ball: e.ball, score: r.score });
        break;
      case 'endBall':
        log.event('level.fail', { ball: e.ball, score: r.score, reason: e.bonus.tilted ? 'tilt' : 'drain', bonus: e.bonus.total, next: e.bonus.next });
        break;
      case 'callout':
        if (e.kind === 'tour' || e.kind === 'frenzy' || e.kind === 'multiball') log.event('mission.complete', { mission: e.kind, score: r.score, ball: r.ball });
        if (e.kind === 'tilt') log.event('tilt', { ball: r.ball, score: r.score });
        break;
      default: break;
    }
  }
}

let last = performance.now();
function frame(now) {
  if (debug.crash) { debug.crash = false; throw new Error('Forced crash (debug)'); }
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'loading') {
    if (renderer.bakeStep()) {
      $('loading').classList.add('hidden');
      applyLayout();
      log.event('game.ready', { games: save.games, best: best(save), layout: renderer.layout.mode });
      queueMicrotask(() => monitor.mark(performance.now()));
      toTitle();
    }
    requestAnimationFrame(loop);
    return;
  }
  input.pollPad();
  updatePointer(dt);

  const esc = input.consume('Escape');
  if (esc || input.consume('KeyP') || input.consumePad('start')) {
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
    else if (esc) back();
  }
  // N is a letter on the initials screen, not the mute key.
  if (input.consume('KeyN') && mode !== 'initials') toggleMute();
  if (mode !== 'play') {
    if (mode === 'initials') {
      if (input.consumePad('up')) cycleLetter(iniSlot, -1);
      if (input.consumePad('down')) cycleLetter(iniSlot, 1);
      if (input.consumePad('left')) { iniSlot = Math.max(0, iniSlot - 1); renderInitials(); }
      if (input.consumePad('right')) { iniSlot = Math.min(2, iniSlot + 1); renderInitials(); }
      if (input.consumePad('a')) saveInitials();
    } else {
      if (input.consumePad('up') || input.consumePad('left')) moveFocus(-1);
      if (input.consumePad('down') || input.consumePad('right')) moveFocus(1);
      if (input.consumePad('a')) document.activeElement?.click?.();
      if (input.consumePad('b')) back();
    }
  }

  const stepping = mode !== 'paused' && mode !== 'initials';
  if (stepping) {
    const playing = mode === 'play';
    let ctl;
    if (world.state === 'attract') ctl = attractAi.controls(world, dt);
    else if (playing && autopilot) ctl = autopilot.controls(world, dt);
    else if (playing) ctl = input.read();
    else ctl = {};
    accumulator += dt;
    let first = true;
    while (accumulator >= STEP) {
      world.step(STEP, first ? ctl : { ...ctl, nudge: 0 });
      first = false;
      accumulator -= STEP;
    }
    renderer.handleEvents(world.events, world);
    show.handle(world.events);
    if (playing || mode === 'over') sound.handle(world.events);
    if (playing) onWorldEvents(world.events);
    world.events.length = 0;
    sound.setHype(playing && world.rules.multiball);
    if (playing && world.state === 'over') {
      overTimer += dt;
      if (overTimer > 2.2) gameOver();
    }
  }
  if (mode !== 'paused') {
    renderer.update(dt, world);
    show.update(dt);
  }
  updateSide();
  updateTouchHints();
  const dmdMode = mode === 'play' || mode === 'paused' ? 'play' : mode === 'initials' ? 'initials' : mode === 'over' ? 'over' : 'attract';
  show.draw({ mode: dmdMode, rules: world.rules, scores: save.scores, lastScore: save.last });
  renderer.draw(world, show.dmd);
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture.
const loop = telemetry ? telemetry.guard(frame, 'pinball-planet.frame') : frame;

if (location.protocol !== 'file:') {
  $('loading').classList.remove('hidden');
  updateSoundButtons();
  requestAnimationFrame(loop);
} else {
  $('loading').classList.add('hidden');
}

// Debug handle for browser checks.
window.PP = { get world() { return world; }, get mode() { return mode; }, save, renderer, show, input, sound, debug, startGame, toTitle };
