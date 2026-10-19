// Browser entry: screens, the fixed-step loop, input, sound and saves.
// The simulation (sim.js) is the single source of truth: this file feeds it
// a launch on player input and reads the settled outcome. The attract mode
// and ?autopilot replay the solver's verified line instead.
import { LEVELS_PER_WORLD, WORLDS } from './config.js';
import { LEVELS, worldOf, levelLabel } from './levels.js';
import { makeShot, step, FLYING, SETTLED, STAR_OUT, launchVector, letterCount } from './sim.js';
import { SAVE_KEY, loadSave, writeSave, recordClear, isUnlocked, totalStars, SKINS, isSkinUnlocked, isStampEarned, rotateMissions, creditMission, missionsFromSave, lettersIn, lettersGot, totalLetters, letterTotal, starsFor, scoreFor } from './progress.js';
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
  earned = null;
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
  $('levels-stars').textContent = `★ ${totalStars(save)}/${LEVELS.length * 3} · ✉ ${totalLetters(save)}/${letterTotal()}`;
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
      const mail = lettersIn(idx);
      const mine = lettersGot(save, idx);
      const b = document.createElement('button');
      b.className = `route${st ? ' done' : ''}${idx === save.unlocked ? ' next' : ''}`;
      b.disabled = !unlocked;
      b.innerHTML = `<span class="r-num">${levelLabel(idx)}</span><span class="r-par">par ${par} · <i class="${mine >= mail ? 'full' : ''}">✉ ${mine}/${mail}</i></span><span class="r-stars">${st ? '★'.repeat(st) + '☆'.repeat(3 - st) : '· · ·'}</span>`;
      b.title = unlocked ? `${levelLabel(idx)} · par ${par} · ${mail} letters` : 'Locked';
      b.setAttribute('aria-label', `Level ${levelLabel(idx)}, par ${par}, ${mail} letters${unlocked ? '' : ' (locked)'}`);
      b.addEventListener('click', () => startLevel(idx));
      const describe = () => { $('levels-info').textContent = unlocked ? `${levelLabel(idx)} · par ${par} · ${LEVELS[idx].note}` : 'Locked'; };
      b.addEventListener('focus', describe);
      b.addEventListener('mouseenter', describe);
      list.appendChild(b);
    }
  });
  // The daily delivery panel, on top of tonight's missions.
  const daily = dailyLevel();
  const dDone = !!save.daily[dateKey()];
  const dHead = document.createElement('div');
  dHead.className = 'world-head daily' + (dDone ? ' done' : '');
  dHead.innerHTML = `<h3>Daily · ${dateKey().slice(5)}</h3><span class="pill">par ${daily.par} · ✉ ${daily.letters.length}</span>`;
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
  $('stamps-count').textContent = `${Object.keys(save.stamps).length} stamps · ✉ ${totalLetters(save)}/${letterTotal()}`;
  const row = $('skin-row');
  row.innerHTML = '';
  for (const skin of SKINS) {
    const owned = isSkinUnlocked(save, skin.id);
    const d = document.createElement('button');
    d.className = `skin${owned ? '' : ' locked'}${save.skin === skin.id ? ' sel' : ''}`;
    d.disabled = !owned;
    d.innerHTML = `<span class="skin-dot" style="background:${skin.color}"></span><span class="skin-name">${owned ? skin.name : '???'}</span><span class="skin-rule">${skin.rule}</span>`;
    d.addEventListener('click', () => { save.skin = skin.id; renderer.setSkin(save); persist(); renderStamps(); });
    row.appendChild(d);
  }
  const grid = $('stamp-grid');
  grid.innerHTML = '';
  const items = [];
  for (let w = 0; w < WORLDS.length; w++) items.push({ id: `world-${w}`, name: `${WORLDS[w].name} cleared`, icon: '🛰' });
  for (let w = 0; w < WORLDS.length; w++) items.push({ id: `letters-${w}`, name: `${WORLDS[w].name}: every letter`, icon: '✉' });
  items.push({ id: 'champion', name: 'All routes delivered', icon: '🏆' });
  for (let i = 0; i < LEVELS.length; i++) items.push({ id: `par-${i}`, name: `${levelLabel(i)} perfect round`, icon: '★' });
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

function starsHtml(n) {
  return [0, 1, 2].map((i) => `<span class="${i < n ? 'on' : ''}">★</span>`).join('');
}

// Banking the result and showing the card are two separate moments. The result
// is written to the save the instant the comet reaches the star, so pausing,
// hiding the tab or closing the page during the celebration cannot lose it;
// the card is built from that banked result 0.6 s later.
let earned = null;

function bankWin() {
  if (earned) return; // one delivery, one result
  const total = level.letters.length;
  const collected = letterCount(shot.letters);
  const stars = starsFor(shotsTaken, level.par, collected, total);
  const score = scoreFor(shotsTaken, level.par, collected);
  const res = { stars, score, shots: shotsTaken, par: level.par, collected, total, daily: levelIndex === -1, index: levelIndex, world: level.world, celebrate: '' };
  missionCredit('delivery');
  if (collected) missionCredit('letters', collected);
  if (total && collected >= total) missionCredit('fullSatchel');
  if (shotsTaken <= level.par) missionCredit('underPar');
  if (stars === 3) missionCredit('threeStar');
  if (res.daily) {
    res.streak = recordDaily(save, new Date()).streak;
  } else {
    const rec = recordClear(save, levelIndex, stars, score, collected);
    if (rec.newBest) res.celebrate = 'New best!';
    if (rec.skin !== null && !params.has('autopilot')) res.celebrate = `New comet: ${SKINS[rec.skin].name}!`;
    if (rec.stamp && !params.has('autopilot')) res.celebrate = 'New postmark earned!';
  }
  earned = res;
  persist();
  log.event('level.complete', { level: res.index + 1, daily: res.daily, shots: res.shots, par: res.par, letters: collected, stars, score });
}

function showWin() {
  const res = earned;
  if (!res) return;
  if (!res.daily && res.index === LEVELS.length - 1 && save.unlocked >= LEVELS.length - 1) {
    return showVictory();
  }
  mode = 'win';
  const perfect = res.stars === 3;
  const missed = res.total - res.collected;
  $('win-title').textContent = perfect ? 'Perfect round!' : 'Delivered!';
  $('win-sub').textContent = res.daily
    ? `Daily · ${dateKey()} · streak ${res.streak}`
    : `${levelLabel(res.index)} · ${WORLDS[res.world].name}`;
  $('win-stars').innerHTML = starsHtml(res.stars);
  $('win-score').textContent = res.score.toLocaleString('en-US');
  const lines = [];
  lines.push(['Launches', `${res.shots} · par ${res.par}${res.shots <= res.par ? ' ✓' : ''}`]);
  lines.push(['Letters', `${res.collected} / ${res.total}${missed ? '' : ' ✓'}`]);
  if (res.daily) {
    const st = streakOf(save.daily);
    lines.push(['Streak', `${st.streak} day${st.streak === 1 ? '' : 's'}`]);
    if (st.best > st.streak) lines.push(['Best streak', `${st.best}`]);
  } else {
    lines.push(['Total stars', `★ ${totalStars(save)} / ${LEVELS.length * 3}`]);
  }
  $('win-lines').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  // Say plainly what the missing star was for; retry is one tap away.
  const hint = missed > 0
    ? `${missed} letter${missed === 1 ? '' : 's'} left behind — retry for all three stars.`
    : res.shots > res.par
      ? `Deliver in ${res.par} launch${res.par === 1 ? '' : 'es'} for all three stars.`
      : '';
  $('win-hint').textContent = hint;
  $('win-hint').classList.toggle('hidden', !hint);
  const next = res.daily ? save.unlocked : res.index + 1;
  $('btn-next').textContent = res.daily ? `Route ${levelLabel(Math.min(next, LEVELS.length - 1))} →` : (next < LEVELS.length ? `Next · ${levelLabel(next)} →` : 'Routes');
  $('win-celebrate').textContent = res.celebrate;
  $('win-celebrate').classList.toggle('hidden', !res.celebrate);
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
// `charging` means "the player is setting up a launch" (it brightens the guide);
// `ramp` is only for the Space hold, where power climbs on its own. A drag or a
// gamepad trigger sets power directly and must not be ramped over.
let aim = { angle: -Math.PI / 2, power: 0.3, charging: false, ramp: false, charging0: 0.3, chargeT: 0, dragging: null };

function launchAimed(angle, power) {
  if (!level || mode !== 'play' || shot.result !== SETTLED) return;
  const v = launchVector(angle, power);
  shot = makeShot(shot.x, shot.y, v.vx, v.vy, shot.letters);
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
  if (aim.dragging) return; // a second finger must not steal the aim mid-drag
  if (e.pointerType === 'touch' || e.pointerType === 'pen') touchMode = true;
  const f = fieldFromClient(e.clientX, e.clientY);
  aim.dragging = { id: e.pointerId, x0: f.x, y0: f.y };
  // Capture keeps the drag alive if the finger leaves the canvas. It throws
  // when the pointer is already gone, which must not take the game down.
  try { canvas.setPointerCapture?.(e.pointerId); } catch { /* drag still works */ }
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
canvas.addEventListener('pointercancel', () => { aim.dragging = null; aim.charging = false; aim.ramp = false; });

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
    if (!aim.charging) { aim.charging = true; aim.ramp = true; aim.charging0 = aim.power; aim.chargeT = 0; }
  }
  if (e.code === 'KeyR') restartLevel();
});
addEventListener('keyup', (e) => {
  if (mode !== 'play') return;
  if (e.code === 'Space' && aim.charging) {
    aim.charging = false;
    aim.ramp = false;
    launchAimed(aim.angle, aim.power);
  }
});
addEventListener('blur', () => { aim.dragging = null; aim.charging = false; aim.ramp = false; });

// Gamepad. In play the stick aims, the right trigger charges, A launches, B
// restarts and Start pauses. In menus the d-pad and stick move focus, A presses
// the focused button and B steps back.
//
// Button edges are tracked every frame whatever the mode, so a press made during
// play cannot fire again the moment a menu opens — and a button still held when
// the screen changed is never read as a fresh press.
const PAD_BUTTONS = [0, 1, 9, 12, 13, 14, 15];
let padPrev = {};
let padAxisHeld = 0;
function pollPad() {
  if (!navigator.getGamepads) return;
  const pad = [...navigator.getGamepads()].find(Boolean);
  if (!pad) { padPrev = {}; return; }
  const down = {};
  for (const i of PAD_BUTTONS) down[i] = !!pad.buttons[i]?.pressed;
  const fresh = (i) => down[i] && !padPrev[i];
  const ax = pad.axes[0] || 0;
  const ay = pad.axes[1] || 0;

  if (mode === 'play') {
    if (Math.hypot(ax, ay) > 0.25) aim.angle = Math.atan2(ay, ax);
    const trigger = pad.buttons[7]?.value ?? 0;
    if (trigger > 0.1) { aim.power = Math.max(0.05, trigger); aim.charging = true; }
    if (fresh(0) && shot.result === SETTLED) { aim.charging = false; aim.ramp = false; launchAimed(aim.angle, aim.power); }
    if (fresh(1)) restartLevel();
    if (fresh(9)) pause();
    padAxisHeld = 0;
  } else {
    // Menus: one step of focus per push of the stick, and the d-pad as well.
    const step = (fresh(13) || fresh(15) ? 1 : 0) + (fresh(12) || fresh(14) ? -1 : 0);
    const axis = Math.abs(ay) > 0.5 ? Math.sign(ay) : Math.abs(ax) > 0.5 ? Math.sign(ax) : 0;
    const axisStep = axis && !padAxisHeld ? axis : 0;
    padAxisHeld = axis;
    if (step || axisStep) moveFocus(step || axisStep);
    if (fresh(0)) document.activeElement?.click?.();
    if (fresh(1)) back();
    if (fresh(9) && mode === 'paused') resume();
  }
  padPrev = down;
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
  $('hud-title').textContent = levelIndex === -1 ? `Daily · ${dateKey().slice(5)}` : levelLabel(levelIndex);
  const total = level.letters.length;
  const got = letterCount(shot?.letters || 0);
  $('hud-shots').textContent = `launch ${shotsTaken} / par ${level.par}`;
  $('hud-shots').classList.toggle('over', shotsTaken > level.par);
  $('hud-letters').textContent = `✉ ${got}/${total}`;
  $('hud-letters').classList.toggle('full', total > 0 && got >= total);
}

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', () => startLevel(Math.min(save.unlocked, LEVELS.length - 1)));
$('btn-levels').addEventListener('click', toLevels);
$('btn-stamps').addEventListener('click', toStamps);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', restartLevel);
$('btn-pause-levels').addEventListener('click', toLevels);
// Pause and mute answer pointerdown, not click: a second finger already on the
// canvas would otherwise swallow the tap.
$('btn-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); pause(); });
$('btn-mute').addEventListener('pointerdown', (e) => { e.preventDefault(); toggleMute(); });
// Keyboard activation of those two still has to work.
for (const id of ['btn-pause', 'btn-mute']) {
  $(id).addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' && e.code !== 'Space') return;
    e.preventDefault();
    if (id === 'btn-pause') pause(); else toggleMute();
  });
}
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
// A second tab just saved: adopt its progress instead of overwriting it the next
// time this tab persists.
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY && e.key !== null) return;
  const fresh = loadSave(storage);
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, fresh);
  sound.setMuted(save.muted);
  sound.setMusic(save.music);
  renderer.setSkin(save);
  updateSoundButtons();
  if (mode === 'title') toTitle();
  else if (mode === 'levels') renderLevels();
  else if (mode === 'stamps') renderStamps();
});
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

// You aim this game by dragging, so the cursor stays visible while playing and
// only hides after ~2 s without pointer movement; any movement brings it back.
let pointerIdle = 0;
const wakePointer = () => { pointerIdle = 0; };
addEventListener('mousemove', wakePointer);
addEventListener('pointermove', wakePointer);
addEventListener('pointerdown', wakePointer);
function updatePointer(dt) {
  pointerIdle += dt;
  const active = mode === 'play';
  document.body.classList.toggle('no-cursor', active && !aim.dragging && pointerIdle > 2);
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
  shot = makeShot(shot.x, shot.y, v.vx, v.vy, shot.letters);
  ghost.i++;
  if (ghost.i >= ghost.line.length) ghost = null; // last shot sunk; attract picks a new level
}

// ?autopilot plays the route itself, launch by launch, from the verified line in
// the level data — the same shots the tests replay. It is a browser check, so it
// never writes the save, and it walks on to the next route by itself.
const autopilot = params.has('autopilot');
let botT = 0;
function autopilotStep(dt) {
  if (!autopilot) return;
  if (mode === 'win' || mode === 'victory') {
    botT += dt;
    if (botT > 1.4) { botT = 0; $('btn-next').click(); }
    return;
  }
  if (mode !== 'play' || earned) return;
  if (shot.result !== SETTLED) { botT = -0.35; return; }
  botT += dt;
  const act = level.line[Math.min(shotsTaken, level.line.length - 1)];
  if (!act) return;
  aim.angle = act.angle;
  aim.power = act.power;
  if (botT < 0.8) return;
  botT = -0.35;
  launchAimed(act.angle, act.power);
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
  autopilotStep(dt);

  if (mode === 'play' && aim.ramp && !aim.dragging) {
    // Space hold only: the charge climbs while the key is down. A drag or a
    // gamepad trigger sets power itself and is left alone.
    aim.chargeT += dt;
    aim.power = Math.min(1, aim.charging0 + aim.chargeT * 0.9);
  }

  const stepping = mode === 'play' || (isAttract && (mode === 'title' || mode === 'levels'));
  let bouncesThisFrame = 0;
  if (shot && stepping) {
    const playing = mode === 'play';
    if (!playing) ghostStep(dt);
    accumulator += dt;
    while (accumulator >= STEP) {
      const before = shot.result;
      step(shot, level, STEP);
      // A bounce: thock and spark where the comet struck. Capped per frame so a
      // comet rattling in a corner cannot flood the mixer.
      if (shot.hit && playing && bouncesThisFrame < 3) {
        bouncesThisFrame++;
        const strength = Math.min(1, shot.hit.speed / 650);
        if (strength > 0.06) {
          sound.bounce(shot.hit.speed);
          renderer.spark(shot.hit.x, shot.hit.y, shot.hit.nx, shot.hit.ny, strength);
        }
      }
      // Through a portal: whoosh, and a puff at each mouth.
      if (shot.warp) {
        if (playing) sound.warp();
        renderer.burst(shot.warp.fromX, shot.warp.fromY, '#c79bff', 10, 140);
        renderer.burst(shot.warp.x, shot.warp.y, '#c79bff', 10, 140);
      }
      // A letter picked up: chime, sparkle, and update the satchel pill.
      if (shot.got >= 0) {
        const l = level.letters[shot.got];
        if (playing) {
          sound.letter(letterCount(shot.letters), level.letters.length);
          updateHud();
        }
        renderer.burst(l.x, l.y, '#8affc1', 14, 150);
        renderer.setFlash('#d8fff0', 0.25);
      }
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
          if (before !== STAR_OUT) bankWin(); // earned now, shown in a moment
          winTimer += dt;
          if (winTimer > 0.6) { winTimer = 0; showWin(); }
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
  sound.setMusicLevel(mode === 'play' ? 1 : 0.4);
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

window.CC = { get mode() { return mode; }, get levelIndex() { return levelIndex; }, get level() { return level; }, get shot() { return shot; }, aim, save, startLevel, startDaily, renderer };
