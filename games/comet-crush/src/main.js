// Browser entry: screens, the fixed-step loop, input, sound and saves.
import { World } from './world.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Autopilot } from './ai.js';
import { TIMING } from './config.js';
import { LEVELS, CONSTELLATIONS, LEVELS_PER_CONSTELLATION, levelLabel } from './levels.js';
import { loadSave, writeSave, recordClear, recordScore, constellationsReached, isUnlocked, totalStars } from './progress.js';
import { frameMonitor } from './perf.js';

const STEP = TIMING.step;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const canvas = $('game');
// Reading `localStorage` throws when the browser blocks site storage; the
// save helpers treat a null store as "nothing saved".
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
// Saving can fail (private mode, full or blocked storage); play on and
// report it once.
let saveWarned = false;
function persist() {
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}
const renderer = new Renderer(canvas, { reducedMotion: reduced });
const input = new Input(canvas, (x, y) => renderer.toField(x, y));
const sound = new Sound({ muted: save.muted, music: save.music });

let mode = 'title'; // title | levels | play | paused | clear | over | victory
let world = null;
let run = { score: 0, lives: 3 };
let accumulator = 0;
let overTimer = 0;
let attractPilot = new Autopilot();
let autopilot = params.has('autopilot') ? new Autopilot() : null;
let isAttract = false; // the title/level-select backdrop is an autopilot demo

const SCREENS = ['screen-title', 'screen-levels', 'screen-pause', 'screen-clear', 'screen-over', 'screen-victory'];

// Result cards ignore clicks for a moment after they appear, so a player
// still mashing Space or tapping to launch doesn't skip straight past them.
const RESULT_SCREENS = ['screen-clear', 'screen-over', 'screen-victory'];
const RESULT_GUARD_MS = 700;
let shownAt = 0;
let shownId = null;

function showScreen(id) {
  shownAt = performance.now();
  shownId = id;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('hud-buttons').classList.toggle('hidden', mode !== 'play');
  input.enabled = mode === 'play';
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .star-btn.next, .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(mode === 'play' ? 1 : mode === 'paused' ? 0.3 : 0.45);
}

const cleared = (ci) => Array.from({ length: LEVELS_PER_CONSTELLATION }, (_, j) => !!save.stars[ci * LEVELS_PER_CONSTELLATION + j]);

function attract() {
  const pool = Math.min(LEVELS.length, (save.unlocked + 1));
  const i = Math.floor(Math.random() * pool);
  world = new World(i, { lives: 9 });
  attractPilot = new Autopilot();
  renderer.reset(world, { cleared: cleared(world.level.c), intro: false });
  sound.setSong(world.level.c, false);
}

function toTitle() {
  mode = 'title';
  if (!isAttract) { attract(); isAttract = true; }
  const next = save.unlocked;
  $('btn-play').textContent = next === 0 ? 'Play' : `Continue · ${levelLabel(next)}`;
  $('title-best').textContent = save.best ? `High score ${save.best.toLocaleString('en-US')} · ★ ${totalStars(save)} / ${LEVELS.length * 3}` : '';
  updateSoundButtons();
  showScreen('screen-title');
}

function startLevel(i, { fresh = false } = {}) {
  sound.unlock();
  if (fresh) run = { score: 0, lives: 3 };
  isAttract = false;
  world = new World(i, { lives: run.lives, score: run.score });
  renderer.reset(world, { cleared: cleared(world.level.c) });
  sound.setSong(world.level.c, !!world.level.boss);
  if (autopilot) autopilot = new Autopilot();
  mode = 'play';
  accumulator = 0;
  overTimer = 0;
  input.clear();
  showScreen(null);
  log.event('level.start', { level: i + 1, constellation: world.level.c + 1, boss: !!world.level.boss, lives: world.lives, score: world.score });
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

// ------------------------------------------------------------ level select

function renderLevels() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  const reached = constellationsReached(save);
  $('levels-stars').textContent = `★ ${totalStars(save)} / ${LEVELS.length * 3}`;
  CONSTELLATIONS.forEach((c, ci) => {
    const open = ci < reached;
    const card = document.createElement('div');
    card.className = `constellation${open ? '' : ' locked'}`;
    card.style.setProperty('--accent', c.palette[0]);
    card.style.setProperty('--accent2', c.palette[1]);
    const got = cleared(ci);
    const starCount = got.reduce((n, _, j) => n + (save.stars[ci * LEVELS_PER_CONSTELLATION + j] || 0), 0);
    card.innerHTML = `<div class="c-head"><h3>${c.name}</h3><span class="c-count">★ ${starCount}/${LEVELS_PER_CONSTELLATION * 3}</span></div>
      <p class="c-figure">${open ? `${c.figure} · ${c.blurb}` : `Locked · beat the ${CONSTELLATIONS[ci - 1].name} boss`}</p>`;
    const map = document.createElement('div');
    map.className = 'c-map';
    let svg = '<svg viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">';
    for (const [a, b] of c.lines) {
      const lit = got[a] && got[b];
      svg += `<line x1="${c.stars[a][0]}" y1="${c.stars[a][1]}" x2="${c.stars[b][0]}" y2="${c.stars[b][1]}" class="${lit ? 'lit' : ''}"/>`;
    }
    svg += '</svg>';
    map.innerHTML = svg;
    c.stars.forEach(([x, y], j) => {
      const idx = ci * LEVELS_PER_CONSTELLATION + j;
      const lv = LEVELS[idx];
      const b = document.createElement('button');
      const unlocked = open && isUnlocked(save, idx);
      const st = save.stars[idx] || 0;
      b.className = `star-btn${st ? ' done' : ''}${lv.boss ? ' boss' : ''}${idx === save.unlocked ? ' next' : ''}`;
      b.style.left = `${x}%`;
      b.style.top = `${(y / 70) * 100}%`;
      b.disabled = !unlocked;
      b.innerHTML = `<span class="n">${lv.boss ? '★' : j + 1}</span><span class="s">${st ? '★'.repeat(st) + '☆'.repeat(3 - st) : ''}</span>`;
      b.title = `${levelLabel(idx)} ${lv.name}`;
      b.setAttribute('aria-label', `${levelLabel(idx)} ${lv.name}${unlocked ? '' : ' (locked)'}${st ? `, ${st} stars` : ''}`);
      b.addEventListener('click', () => startLevel(idx, { fresh: true }));
      b.addEventListener('focus', () => { $('levels-info').textContent = unlocked ? `${levelLabel(idx)} · ${lv.name}${lv.boss ? ' (boss)' : ''}` : 'Locked'; });
      b.addEventListener('mouseenter', () => { $('levels-info').textContent = unlocked ? `${levelLabel(idx)} · ${lv.name}${lv.boss ? ' (boss)' : ''}` : 'Locked'; });
      map.appendChild(b);
    });
    card.appendChild(map);
    grid.appendChild(card);
  });
}

function toLevels() {
  sound.unlock();
  if (!isAttract) { attract(); isAttract = true; }
  mode = 'levels';
  renderLevels();
  $('levels-info').textContent = 'Pick a star to play';
  showScreen('screen-levels');
  const next = document.querySelector('#level-grid .star-btn.next:not([disabled])') || document.querySelector('#level-grid .star-btn:not([disabled])');
  next?.focus({ preventScroll: true });
  next?.scrollIntoView({ block: 'nearest' });
}

// ------------------------------------------------------------ results

function starsHtml(n) {
  return [0, 1, 2].map((i) => `<span class="${i < n ? 'on' : ''}">★</span>`).join('');
}

function onCleared() {
  const w = world;
  const stars = w.rating();
  run = { score: w.score, lives: w.lives };
  const rec = recordClear(save, w.levelIndex, stars, w.score);
  persist();
  log.event('level.complete', {
    level: w.levelIndex + 1, boss: !!w.boss, stars, score: w.score, lives: w.lives,
    'combo.max': w.maxCombo, 'best.new': rec.newBest,
  });
  const last = w.levelIndex === LEVELS.length - 1;
  if (last) return showVictory();
  mode = 'clear';
  const c = CONSTELLATIONS[w.level.c];
  $('clear-title').textContent = w.boss ? 'Constellation restored!' : 'Level clear!';
  $('clear-sub').textContent = w.boss ? `${c.figure} shines again. Next up: ${CONSTELLATIONS[w.level.c + 1].name}!` : `${levelLabel(w.levelIndex)} · ${w.level.name}`;
  $('clear-stars').innerHTML = starsHtml(stars);
  $('clear-score').textContent = w.score.toLocaleString('en-US');
  const lines = [['Bricks smashed', w.bricksBroken], ['Best combo', w.maxCombo], ['Stars caught', w.starsCaught], ['Clear bonus', `+${w.clearBonus.toLocaleString('en-US')}`]];
  $('clear-lines').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('') +
    (stars < 3 ? `<div class="tip">${stars < 2 ? 'Tip: lose at most one ship for ★★' : 'Tip: lose no ships for ★★★'}</div>` : '');
  $('btn-next').textContent = `Next · ${levelLabel(w.levelIndex + 1)} ${LEVELS[w.levelIndex + 1].name} →`;
  showScreen('screen-clear');
}

function showVictory() {
  mode = 'victory';
  log.event('game.complete', { score: world.score, stars: totalStars(save) });
  $('victory-score').textContent = world.score.toLocaleString('en-US');
  $('victory-lines').innerHTML = `<div><span>High score</span><b>${save.best.toLocaleString('en-US')}</b></div><div><span>Stars</span><b>★ ${totalStars(save)} / ${LEVELS.length * 3}</b></div>`;
  showScreen('screen-victory');
}

function onGameOver() {
  mode = 'over';
  const best = recordScore(save, world.score);
  persist();
  log.event('level.fail', { level: world.levelIndex + 1, reason: 'gameover', score: world.score, 'best.new': best });
  $('over-score').textContent = world.score.toLocaleString('en-US');
  $('over-best').textContent = best ? 'New high score!' : `High score ${save.best.toLocaleString('en-US')}`;
  $('btn-continue').textContent = `Continue at ${levelLabel(world.levelIndex)} →`;
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

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', () => startLevel(save.unlocked, { fresh: true }));
$('btn-levels').addEventListener('click', toLevels);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startLevel(world.levelIndex));
$('btn-pause-levels').addEventListener('click', toLevels);
$('btn-pause').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-next').addEventListener('click', () => startLevel(world.levelIndex + 1));
$('btn-clear-levels').addEventListener('click', toLevels);
$('btn-continue').addEventListener('click', () => {
  log.event('continue.used', { level: world.levelIndex + 1, score: world.score });
  run = { score: world.score, lives: 3 };
  startLevel(world.levelIndex);
});
$('btn-over-levels').addEventListener('click', toLevels);
$('btn-victory-levels').addEventListener('click', toLevels);
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', () => { isAttract = false; toTitle(); });
addEventListener('click', (e) => {
  if (RESULT_SCREENS.includes(shownId) && performance.now() - shownAt < RESULT_GUARD_MS) { e.preventDefault(); e.stopPropagation(); }
}, { capture: true });
addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

// Arrow keys / d-pad move focus between buttons in menus.
function moveFocus(dir) {
  const screen = SCREENS.map($).find((s) => !s.classList.contains('hidden'));
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not([disabled]), a[href]')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
}
addEventListener('keydown', (e) => {
  if (mode === 'play') return;
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
});

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'levels' || mode === 'over' || mode === 'clear' || mode === 'victory') toTitle();
}

// ------------------------------------------------------------ loop

// Hide the pointer while playing: the ship follows the mouse, so over the
// canvas the cursor is hidden; elsewhere (HUD buttons) it hides after ~2 s
// without movement and comes back as soon as the mouse moves.
let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  const playing = mode === 'play';
  canvas.classList.toggle('playing', playing);
  document.body.classList.toggle('no-cursor', playing && pointerIdle > 2);
}

function launchHint() {
  if (input.mode === 'touch') return 'Tap to launch';
  if (input.mode === 'mouse') return 'Click to launch';
  return navigator.getGamepads && [...navigator.getGamepads()].some(Boolean) ? 'Press A to launch' : 'Press Space to launch';
}

// Frame telemetry: slow frames, struggling 10 s windows, and a watchdog
// outside the loop that notices when frames stop while the page is visible.
const monitor = frameMonitor({
  log,
  snapshot: () => ({
    mode, level: world ? world.levelIndex + 1 : 0, status: world ? world.status : 'none',
    balls: world?.balls?.length ?? 0, attract: isAttract,
  }),
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
  input.pollPad();
  updatePointer(dt);

  const esc = input.consume('Escape');
  if (esc || input.consume('KeyP') || input.consumePad('start')) {
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
    else if (esc) back();
  }
  if (input.consume('KeyM')) toggleMute();
  if (mode !== 'play') {
    if (input.consumePad('up') || input.consumePad('left')) moveFocus(-1);
    if (input.consumePad('down') || input.consumePad('right')) moveFocus(1);
    if (input.consumePad('a')) document.activeElement?.click?.();
    if (input.consumePad('b')) back();
  }

  const stepping = mode === 'play' || (isAttract && (mode === 'title' || mode === 'levels'));
  if (world && stepping) {
    const playing = mode === 'play';
    const controls = playing ? (autopilot ? autopilot.controls(world, dt) : input.read(world.paddle.x, world.paddle.w)) : attractPilot.controls(world, dt);
    accumulator += dt;
    let first = true;
    while (accumulator >= STEP) {
      world.step(STEP, first ? controls : { ...controls, launch: false });
      first = false;
      accumulator -= STEP;
    }
    renderer.handleEvents(world.events, world);
    if (playing) sound.handle(world.events);
    world.events.length = 0;
    if (playing) {
      if (world.status === 'cleared') onCleared();
      else if (world.status === 'gameover') {
        overTimer += dt;
        if (overTimer > 1.2) onGameOver();
      }
    } else if (world.status === 'cleared' || world.status === 'gameover') attract();
  }
  if (mode !== 'paused') renderer.update(dt, world);
  renderer.draw(world, { attract: isAttract && mode !== 'play', launchHint: launchHint(), touch: input.mode === 'touch' });
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture;
// after a crash the guard returns early, so the loop stops rescheduling.
const loop = telemetry ? telemetry.guard(frame, 'comet-crush.frame') : frame;

if (location.protocol !== 'file:') {
  log.event('game.ready', { unlocked: save.unlocked + 1, stars: totalStars(save), best: save.best });
  const lv = parseInt(params.get('level'), 10);
  if (lv >= 1 && lv <= LEVELS.length) startLevel(lv - 1, { fresh: true });
  else toTitle();
  requestAnimationFrame(loop);
}

window.CC = { get world() { return world; }, get mode() { return mode; }, save, startLevel, renderer, input, sound };
