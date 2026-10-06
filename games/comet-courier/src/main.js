// Browser entry: screens, the fixed-step loop, input, sound and saves.
// The simulation (sim.js) is the single source of truth: this file feeds it
// a launch on player input and reads the settled outcome. The attract mode
// and ?autopilot replay the solver's verified line instead.
import { FIELD, COMET, LEVELS_PER_WORLD, WORLDS } from './config.js';
import { LEVELS, worldOf, levelLabel } from './levels.js';
import { makeShot, step, FLYING, SETTLED, STAR_OUT, launchVector } from './sim.js';
import { loadSave, writeSave, recordClear, isUnlocked, totalStars, SKINS, isSkinUnlocked, isStampEarned, rotateMissions, creditMission, missionsFromSave } from './progress.js';
import { dailyLevel, dateKey, streakOf, recordDaily } from './daily.js';
import { mulberry32 } from './math.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { frameMonitor } from './perf.js';

const STEP = 1 / 120;
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
let saveWarned = false;
function persist() {
  // ?autopilot is a browser check: its stars must not land in the real save.
  if (params.has('autopilot')) return;
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const renderer = new Renderer(canvas, { reducedMotion: reduced });
const sound = new Sound({ muted: save.muted, music: save.music });

let mode = 'title'; // title | levels | stamps | play | paused | win | victory
let levelIndex = 0;
let level = null;
let shot = null;
let shotsTaken = 0;
let accumulator = 0;
let winTimer = 0;
let ghost = null; // attract-mode replay state { line, i, t }
let isAttract = false;
let touchMode = false; // the last pointer was a touch: show the drag hint

const SCREENS = ['screen-title', 'screen-levels', 'screen-stamps', 'screen-pause', 'screen-win', 'screen-victory'];
const RESULT_SCREENS = ['screen-win', 'screen-victory'];
const RESULT_GUARD_MS = 700;
let shownAt = 0;
let shownId = null;

function showScreen(id) {
  shownAt = performance.now();
  shownId = id;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', mode !== 'play' && mode !== 'paused');
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
}

// ------------------------------------------------------------ daily + missions

function rotateDailyMissions() {
  const day = dateKey();
  rotateMissions(save, day, mulberry32(day.split('-').reduce((a, p) => a + Number(p), 0)));
}
function missionCredit(kind, amount = 1) {
  if (params.has('autopilot')) return [];
  return creditMission(save, kind, amount, dateKey());
}

// ------------------------------------------------------------ level loading

// Reset the comet's flight state for a freshly loaded panel.
function resetShotForLevel() {
  shotsTaken = 0;
  shot = makeShot(level.spawn.x, level.spawn.y, 0, 0);
  shot.result = SETTLED;
  ghost = null;
  winTimer = 0;
  renderer.reset(level, save);
  updateHud();
}

// Enter active play for the current level.
function enterPlay(world) {
  mode = 'play';
  accumulator = 0;
  sound.setSong(world);
  showScreen(null);
}

function loadLevel(i) {
  levelIndex = i;
  level = LEVELS[i];
  resetShotForLevel();
}

function startLevel(i, { fromAttract = false } = {}) {
  sound.unlock();
  if (!fromAttract) isAttract = false;
  loadLevel(i);
  enterPlay(worldOf(i));
  log.event('level.start', { level: i + 1, world: worldOf(i) + 1, par: level.par });
}

function toTitle() {
  mode = 'title';
  if (!isAttract) { attract(); isAttract = true; }
  const next = save.unlocked;
  $('btn-play').textContent = next === 0 ? 'Deliver mail' : `Continue · ${levelLabel(next)}`;
  const total = LEVELS.length * 3;
  const bits = [];
  bits.push(`★ ${totalStars(save)} / ${total}`);
  const st = streakOf(save.daily);
  if (st.streak > 1) bits.push(`${st.streak}-day streak`);
  $('title-stats').textContent = bits.join(' · ');
  updateSoundButtons();
  showScreen('screen-title');
}

function attract() {
  // A random unlocked level with the solver's line replayed as the ghost.
  const pool = Math.min(LEVELS.length, save.unlocked + 1);
  const i = Math.floor(Math.random() * Math.max(1, pool));
  loadLevel(i);
  ghost = { line: level.line, i: 0, t: -0.3 }; // brief pause before the first ghost launch
}

// ------------------------------------------------------------ level select

function renderLevels() {
  const list = $('level-list');
  list.innerHTML = '';
  $('levels-stars').textContent = `★ ${totalStars(save)} / ${LEVELS.length * 3}`;
  WORLDS.forEach((w, wi) => {
    const wOpen = wi === 0 || save.unlocked >= wi * LEVELS_PER_WORLD;
    const got = Array.from({ length: LEVELS_PER_WORLD }, (_, j) => save.stars[wi * LEVELS_PER_WORLD + j] || 0);
    const sum = got.reduce((a, b) => a + b, 0);
    const head = document.createElement('div');
    head.className = 'world-head' + (wOpen ? '' : ' locked');
    head.innerHTML = `<h3>${wi + 1}. ${w.name}</h3><span class="pill">★ ${sum}/${LEVELS_PER_WORLD * 3}</span>`;
    head.title = w.blurb;
    list.appendChild(head);
    for (let j = 0; j < LEVELS_PER_WORLD; j++) {
      const idx = wi * LEVELS_PER_WORLD + j;
      const unlocked = wOpen && isUnlocked(save, idx);
      const st = got[j];
      const par = LEVELS[idx].par;
      const b = document.createElement('button');
      b.className = `route${st ? ' done' : ''}${idx === save.unlocked ? ' next' : ''}`;
      b.disabled = !unlocked;
      b.innerHTML = `<span class="r-num">${levelLabel(idx)}</span><span class="r-par">par ${par}</span><span class="r-stars">${st ? '★'.repeat(st) + '☆'.repeat(3 - st) : '· · ·'}</span>`;
      b.title = unlocked ? `${levelLabel(idx)} · par ${par}` : 'Locked';
      b.setAttribute('aria-label', `Level ${levelLabel(idx)}, par ${par}${unlocked ? '' : ' (locked)'}`);
      b.addEventListener('click', () => startLevel(idx));
      b.addEventListener('focus', () => { $('levels-info').textContent = unlocked ? `${levelLabel(idx)} · par ${par} · ${w.name}` : 'Locked'; });
      b.addEventListener('mouseenter', () => { $('levels-info').textContent = unlocked ? `${levelLabel(idx)} · par ${par} · ${w.name}` : 'Locked'; });
      list.appendChild(b);
    }
  });
  // The daily delivery panel, on top of tonight's missions.
  const daily = dailyLevel();
  const dDone = !!save.daily[dateKey()];
  const dHead = document.createElement('div');
  dHead.className = 'world-head daily' + (dDone ? ' done' : '');
  dHead.innerHTML = `<h3>Daily · ${dateKey().slice(5)}</h3><span class="pill">par ${daily.par}</span>`;
  list.appendChild(dHead);
  const db = document.createElement('button');
  db.className = `route daily${dDone ? ' done' : ''}`;
  db.innerHTML = `<span class="r-num">${dDone ? '✓' : '★'} delivery</span><span class="r-par">${WORLDS[daily.world].name}</span><span class="r-stars">${streakOf(save.daily).streak > 1 ? `streak ${streakOf(save.daily).streak}` : 'today'}</span>`;
  db.title = `Daily ${dateKey()} · ${WORLDS[daily.world].name}`;
  db.addEventListener('click', () => startDaily());
  list.appendChild(db);
  // Missions.
  const ml = $('mission-list');
  ml.innerHTML = '';
  for (const g of missionsFromSave(save)) {
    const done = save.missions.done[g.id] || 0;
    const p = Math.min(1, done / g.target);
    const row = document.createElement('div');
    row.className = 'mission' + (done >= g.target ? ' done' : '');
    row.innerHTML = `<span class="m-name">${g.name}</span><span class="m-prog"><i style="width:${p * 100}%"></i></span><span class="m-count">${Math.min(done, g.target)}/${g.target}</span>`;
    ml.appendChild(row);
  }
}

function toLevels() {
  sound.unlock();
  if (!isAttract) { attract(); isAttract = true; }
  mode = 'levels';
  renderLevels();
  $('levels-info').textContent = 'Pick a route to deliver';
  showScreen('screen-levels');
}

function startDaily() {
  sound.unlock();
  isAttract = false;
  const d = dailyLevel();
  levelIndex = -1; // daily: outside the 0..29 route range
  level = { ...d, index: -1 };
  resetShotForLevel();
  enterPlay(level.world);
  log.event('daily.start', { world: level.world + 1, par: level.par });
}

// ------------------------------------------------------------ stamps / skins

function renderStamps() {
  $('stamps-count').textContent = `${Object.keys(save.stamps).length} stamps · ${Object.keys(save.skins).length} skins`;
  const row = $('skin-row');
  row.innerHTML = '';
  for (const skin of SKINS) {
    const owned = isSkinUnlocked(save, skin.id);
    const d = document.createElement('button');
    d.className = `skin${owned ? '' : ' locked'}${save.skin === skin.id ? ' sel' : ''}`;
    d.disabled = !owned;
    d.innerHTML = `<span class="skin-dot" style="background:${skin.color}"></span><span class="skin-name">${owned ? skin.name : '???'}</span><span class="skin-rule">${skin.rule}</span>`;
    d.addEventListener('click', () => { save.skin = skin.id; persist(); renderStamps(); });
    row.appendChild(d);
  }
  const grid = $('stamp-grid');
  grid.innerHTML = '';
  const items = [];
  for (let w = 0; w < WORLDS.length; w++) items.push({ id: `world-${w}`, name: `${WORLDS[w].name} cleared`, icon: '✉' });
  items.push({ id: 'champion', name: 'All routes delivered', icon: '🏆' });
  for (let i = 0; i < LEVELS.length; i++) items.push({ id: `par-${i}`, name: `Par ${levelLabel(i)} · ${WORLDS[worldOf(i)].name}`, icon: '★' });
  for (const it of items) {
    const got = isStampEarned(save, it.id);
    const d = document.createElement('div');
    d.className = `stamp${got ? '' : ' locked'}`;
    d.innerHTML = `<span class="st-icon">${got ? it.icon : '·'}</span><span class="st-name">${it.name}</span>`;
    d.title = got ? 'Earned' : `Locked: ${it.name}`;
    grid.appendChild(d);
  }
}

function toStamps() {
  sound.unlock();
  mode = 'stamps';
  renderStamps();
  showScreen('screen-stamps');
}

// ------------------------------------------------------------ results

function starsFor(shots, par) {
  if (shots <= par) return 3;
  if (shots <= par + 2) return 2;
  return 1;
}
function scoreFor(shots, par) {
  return Math.max(0, (par + 3 - shots) * 250 + 150);
}
function starsHtml(n) {
  return [0, 1, 2].map((i) => `<span class="${i < n ? 'on' : ''}">★</span>`).join('');
}

function onWin() {
  const stars = starsFor(shotsTaken, level.par);
  const score = scoreFor(shotsTaken, level.par);
  const missionsDone = [];
  if (levelIndex === -1) {
    // Daily delivery: record the date, no route stars.
    const rec = recordDaily(save, new Date());
    missionsDone.push(...missionCredit('delivery'));
    $('win-title').textContent = 'Delivered!';
    $('win-sub').textContent = `Daily · ${dateKey()} · ${shotsTaken} shot${shotsTaken === 1 ? '' : 's'} (par ${level.par}) · streak ${rec.streak}`;
  } else {
    const rec = recordClear(save, levelIndex, stars, score);
    missionsDone.push(...missionCredit('delivery'));
    if (shotsTaken === 1) missionCredit('oneShot');
    if (stars === 3) missionCredit('threeStar');
    if (shotsTaken === 2) missionCredit('twoShot');
    $('win-title').textContent = stars === 3 ? 'Par delivery!' : 'Delivered!';
    $('win-sub').textContent = `${levelLabel(levelIndex)} · ${WORLDS[level.world].name}`;
    if (rec.newBest) $('win-celebrate').textContent = 'New best!';
    if (rec.stamp && !params.has('autopilot')) $('win-celebrate').textContent = 'New postmark earned!';
  }
  persist();
  log.event('level.complete', { level: levelIndex + 1, daily: levelIndex === -1, shots: shotsTaken, par: level.par, stars, score });
  if (levelIndex === LEVELS.length - 1 && save.unlocked >= LEVELS.length - 1) {
    return showVictory();
  }
  mode = 'win';
  $('win-stars').innerHTML = starsHtml(stars);
  $('win-score').textContent = score.toLocaleString('en-US');
  const lines = [];
  lines.push(['Shots', `${shotsTaken} (par ${level.par})`]);
  if (levelIndex === -1) {
    const st = streakOf(save.daily);
    lines.push(['Streak', `${st.streak} day${st.streak === 1 ? '' : 's'}`]);
    if (st.best > st.streak) lines.push(['Best streak', `${st.best}`]);
  } else {
    lines.push(['Total stars', `★ ${totalStars(save)} / ${LEVELS.length * 3}`]);
    lines.push(['Score', score.toLocaleString('en-US')]);
  }
  $('win-lines').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  const next = levelIndex === -1 ? save.unlocked : levelIndex + 1;
  $('btn-next').textContent = levelIndex === -1 ? `Route ${levelLabel(Math.min(next, LEVELS.length - 1))} →` : (next < LEVELS.length ? `Next · ${levelLabel(next)} →` : 'Routes');
  $('win-celebrate').classList.toggle('hidden', !$('win-celebrate').textContent);
  showScreen('screen-win');
  sound.win();
}

function showVictory() {
  mode = 'victory';
  log.event('game.complete', { stars: totalStars(save) });
  $('victory-score').textContent = `★ ${totalStars(save)} / ${LEVELS.length * 3}`;
  $('victory-lines').innerHTML = `<div><span>High score</span><b>${save.best.toLocaleString('en-US')}</b></div>`;
  showScreen('screen-victory');
  sound.win();
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

// ------------------------------------------------------------ input

// Aim: angle in radians + power in [0, 1]. Pointer drag aims from the comet;
// the pull-back vector sets both (slingshot: pull opposite to the launch).
let aim = { angle: -Math.PI / 2, power: 0.3, charging: false, charging0: 0.3, chargeT: 0, dragging: null };

function launchAimed(angle, power) {
  if (!level || mode !== 'play' || shot.result !== SETTLED) return;
  const v = launchVector(angle, power);
  shot = makeShot(shot.x, shot.y, v.vx, v.vy);
  shotsTaken++;
  ghost = null;
  sound.launch(power);
  updateHud();
  renderer.burst(shot.x, shot.y, SKINS[save.skin]?.color ?? '#ffe27a', 14, 160);
}

function fieldFromClient(cx, cy) {
  return renderer.toField(cx, cy);
}

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'play' || shot.result !== SETTLED) return;
  if (e.pointerType === 'touch' || e.pointerType === 'pen') touchMode = true;
  const f = fieldFromClient(e.clientX, e.clientY);
  aim.dragging = { id: e.pointerId, x0: f.x, y0: f.y };
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!aim.dragging || e.pointerId !== aim.dragging.id) return;
  const f = fieldFromClient(e.clientX, e.clientY);
  const dx = f.x - aim.dragging.x0;
  const dy = f.y - aim.dragging.y0;
  const d = Math.hypot(dx, dy);
  if (d < 8) return;
  // Slingshot: launch opposite the drag.
  aim.angle = Math.atan2(-dy, -dx);
  aim.power = Math.min(1, d / 140);
  aim.charging = true;
});
canvas.addEventListener('pointerup', (e) => {
  if (!aim.dragging || e.pointerId !== aim.dragging.id) return;
  aim.dragging = null;
  if (aim.charging) {
    aim.charging = false;
    launchAimed(aim.angle, aim.power);
  }
});
canvas.addEventListener('pointercancel', () => { aim.dragging = null; aim.charging = false; });

// Keyboard aim: arrows/A/D steer, Space charges (hold) and launches (release).
addEventListener('keydown', (e) => {
  if (e.repeat || mode !== 'play') return;
  if (e.code === 'Escape') { pause(); return; }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { aim.angle = (aim.angle + Math.PI * 0.5 - 2 * Math.PI) % (Math.PI * 2); if (aim.angle > 0) aim.angle -= Math.PI * 2; }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { aim.angle = (aim.angle + Math.PI * 0.5) % (Math.PI * 2); if (aim.angle < 0) aim.angle += Math.PI * 2; }
  if (e.code === 'ArrowUp' || e.code === 'KeyW') { aim.power = Math.min(1, aim.power + 0.1); }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') { aim.power = Math.max(0, aim.power - 0.1); }
  if (e.code === 'Space' && shot.result === SETTLED) {
    e.preventDefault();
    if (!aim.charging) { aim.charging = true; aim.charging0 = aim.power; aim.chargeT = 0; }
  }
  if (e.code === 'KeyR') restartLevel();
});
addEventListener('keyup', (e) => {
  if (mode !== 'play') return;
  if (e.code === 'Space' && aim.charging) {
    aim.charging = false;
    launchAimed(aim.angle, aim.power);
  }
});
addEventListener('blur', () => { aim.dragging = null; aim.charging = false; });

// Gamepad: stick aims, trigger charges, A launches, B restarts, Start pauses.
let padPrevA = false, padPrevB = false, padPrevStart = false;
function pollPad() {
  if (!navigator.getGamepads) return;
  const pad = [...navigator.getGamepads()].find(Boolean);
  if (!pad || mode !== 'play') return;
  const stickMag = Math.hypot(pad.axes[0] || 0, pad.axes[1] || 0);
  if (stickMag > 0.25) {
    aim.angle = Math.atan2(pad.axes[1] || 0, pad.axes[0] || 0);
  }
  const trigger = pad.buttons[7]?.value ?? 0; // right trigger
  if (trigger > 0.1) { aim.power = Math.max(0.05, trigger); aim.charging = true; }
  const aDown = !!pad.buttons[0]?.pressed;
  const bDown = !!pad.buttons[1]?.pressed;
  const startDown = !!pad.buttons[9]?.pressed;
  if (aDown && !padPrevA && shot.result === SETTLED) { aim.charging = false; launchAimed(aim.angle, aim.power); }
  if (bDown && !padPrevB) restartLevel();
  if (startDown && !padPrevStart) { if (mode === 'play') pause(); else if (mode === 'paused') resume(); }
  padPrevA = aDown; padPrevB = bDown; padPrevStart = startDown;
}

// ------------------------------------------------------------ pause / restart

function pause() {
  if (mode !== 'play' || shot.result === STAR_OUT) return;
  mode = 'paused';
  updateSoundButtons();
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  showScreen(null);
}

function restartLevel() {
  if (mode !== 'play' && mode !== 'paused') return;
  if (levelIndex === -1) { startDaily(); return; }
  loadLevel(levelIndex);
  enterPlay(worldOf(levelIndex));
  log.event('level.restart', { level: levelIndex + 1 });
}

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'levels' || mode === 'stamps' || mode === 'win' || mode === 'victory') toTitle();
}

// ------------------------------------------------------------ hud

function updateHud() {
  const name = levelIndex === -1 ? `Daily · ${dateKey().slice(5)}` : levelLabel(levelIndex);
  $('hud-title').textContent = name;
  const par = level.par;
  const proj = shotsTaken + 1;
  $('hud-shots').textContent = `shots ${shotsTaken} · par ${par} · ${proj <= par ? '★★★' : proj <= par + 2 ? '★★☆' : '★☆☆'}`;
}

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', () => startLevel(Math.min(save.unlocked, LEVELS.length - 1)));
$('btn-levels').addEventListener('click', toLevels);
$('btn-stamps').addEventListener('click', toStamps);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', restartLevel);
$('btn-pause-levels').addEventListener('click', toLevels);
$('btn-pause').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-next').addEventListener('click', () => {
  if (levelIndex === -1) startLevel(Math.min(save.unlocked, LEVELS.length - 1));
  else if (levelIndex + 1 < LEVELS.length) startLevel(levelIndex + 1);
  else toLevels();
});
$('btn-win-retry').addEventListener('click', () => (levelIndex === -1 ? startDaily() : startLevel(levelIndex)));
$('btn-win-levels').addEventListener('click', toLevels);
$('btn-victory-levels').addEventListener('click', toLevels);
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', () => { isAttract = false; toTitle(); });
addEventListener('click', (e) => {
  if (RESULT_SCREENS.includes(shownId) && performance.now() - shownAt < RESULT_GUARD_MS) { e.preventDefault(); e.stopPropagation(); }
}, { capture: true });
addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pause(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

// Arrow keys move focus between buttons in menus.
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
  if (mode === 'play' || mode === 'paused') return;
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
});

// ------------------------------------------------------------ loop

// Hide the pointer while playing: the comet follows the aim, so over the
// canvas the cursor is hidden; elsewhere it hides after ~2 s without
// movement and comes back as soon as the mouse moves.
let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  const active = mode === 'play' || mode === 'paused';
  canvas.classList.toggle('playing', active);
  document.body.classList.toggle('no-cursor', active && pointerIdle > 2);
}

// Attract/autopilot: replay the solver line. Each ghost shot runs the real
// simulation, so what the player watches is a verified solution.
function ghostStep(dt) {
  if (!ghost || !level) return;
  if (shot.result !== SETTLED) return; // mid-flight: wait for the real sim
  ghost.t += dt;
  const act = ghost.line[ghost.i];
  if (!act) return;
  if (ghost.t < 0.9) return; // beat between shots
  ghost.t = -0.3;
  const v = launchVector(act.angle, act.power);
  shot = makeShot(shot.x, shot.y, v.vx, v.vy);
  ghost.i++;
  if (ghost.i >= ghost.line.length) ghost = null; // last shot sunk; attract picks a new level
}

// Frame telemetry: slow frames, struggling 10 s windows, and a watchdog
// outside the loop that notices when frames stop while the page is visible.
const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, level: levelIndex + 1, shots: shotsTaken, attract: isAttract }),
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
  pollPad();
  updatePointer(dt);

  if (mode === 'play' && aim.charging && !aim.dragging) {
    // Space hold: charge ramps gently while held (pointer/pad set power directly).
    aim.chargeT += dt;
    aim.power = Math.min(1, aim.charging0 + aim.chargeT * 0.9);
  }

  const stepping = mode === 'play' || (isAttract && (mode === 'title' || mode === 'levels'));
  if (shot && stepping) {
    const playing = mode === 'play';
    if (!playing) ghostStep(dt);
    accumulator += dt;
    while (accumulator >= STEP) {
      const before = shot.result;
      step(shot, level, STEP);
      if (shot.result === STAR_OUT) {
        // Fires once per sink: the effects are transition-gated, but the
        // follow-up (win delay / new attract level) must run every frame the
        // star holds, or winTimer never reaches its threshold.
        if (before !== STAR_OUT) {
          sound.star();
          renderer.setFlash('#fff3c4', 0.9);
          renderer.burst(shot.x, shot.y, '#ffd98a', 30, 260);
        }
        if (playing) {
          winTimer += dt;
          if (winTimer > 0.6) { winTimer = 0; onWin(); }
        } else if (before !== STAR_OUT) {
          attract(); // the ghost line finished; a new level takes over
        }
        break;
      }
      if (before === FLYING && shot.result === SETTLED) {
        sound.settle();
        updateHud();
        if (playing && shotsTaken <= level.line.length) sound.parTick(shotsTaken);
      }
      accumulator -= STEP;
    }
  }
  if (mode !== 'paused') renderer.update(dt, { shot });
  renderer.draw({ shot, level, aim, shotsTaken, mode, isAttract, touch: touchMode, time: renderer.time });
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture;
// after a crash the guard returns early, so the loop stops rescheduling.
const loop = telemetry ? telemetry.guard(frame, 'comet-courier.frame') : frame;

if (location.protocol !== 'file:') {
  rotateDailyMissions();
  log.event('game.ready', { unlocked: save.unlocked + 1, stars: totalStars(save), best: save.best });
  const lv = parseInt(params.get('level'), 10);
  if (lv >= 1 && lv <= LEVELS.length) startLevel(lv - 1);
  else toTitle();
  requestAnimationFrame(loop);
}

window.CC = { get mode() { return mode; }, get levelIndex() { return levelIndex; }, get level() { return level; }, get shot() { return shot; }, save, startLevel, startDaily, renderer };
