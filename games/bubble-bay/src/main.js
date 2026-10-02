// Screens, controls and the game loop for Bubble Bay.
import { Game, BOOSTERS } from './game.js';
import { LEVELS, LEVEL_COUNT, AREAS, GOAL_TEXT, getLevel, dailyLevel, dateKeyOf } from './levels.js';
import { MIN_ANGLE, MAX_ANGLE } from './grid.js';
import { View, WATER_Y } from './render.js';
import { Sfx } from './audio.js';
import { renderMap, scrollToLevel } from './map.js';
import { paintBubbleIcon, paintOtter, drawCrabBody, drawLauncher, Sprites } from './sprites.js';
import { OTTER_COUNT, OTTER_NAMES, otterLook } from './otters.js';
import {
  loadSave, writeSave, totalStars, recordWin, recordDaily, currentStreak, dailyDone, addOtters, useBooster,
} from './save.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;

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

const sfx = new Sfx(save.muted);
const view = new View($('board'), {
  reduceMotion,
  hooks: {
    pop: (k) => sfx.pop(k),
    land: (kind) => sfx.land(kind),
    bounce: () => sfx.bounce(),
    splash: (heavy) => sfx.splash(heavy),
    blast: (kind) => sfx.blast(kind),
    otter: () => sfx.otter(),
    otterName: (id) => `${OTTER_NAMES[id]}!`,
    bigDrop: (n) => sfx.bigDrop(n),
    creep: () => sfx.creep(),
  },
});

let game = null;
let mode = 'title';
let levelId = Math.min(save.unlocked, LEVEL_COUNT);
let isDaily = false;
let attempt = 0;
let endTimer = 0;
let finale = null;
let shownScore = 0;
let pendingResult = null;
let lastGoalHave = 0;
let autoplay = params.has('autoplay') ? { wait: 0.8, ai: null } : null;
let crashNext = false;
const newOtters = new Set(); // otters new to the cove this level

const TIPS = {
  creep: 'Every few shots the plank moves down. <b>Watch the shells</b> on it!',
  otters: 'Pop bubbles <b>next to an otter</b>, or drop it, to set it free!',
  pop: 'Pop and drop <b>enough bubbles</b> to clear the level.',
  rainbow: '<b>Rainbow bubbles</b> match any color!',
  stone: '<b>Stones</b> never pop. Knock away what holds them up!',
  anchor: '<b>Drop the anchor:</b> clear the bubbles holding it up!',
  ice: '<b>Ice</b> cracks open after two pops next to it.',
  bomb: 'Pop next to a <b>bomb bubble</b> to set it off!',
  zap: '<b>Lightning bubbles</b> clear their whole row!',
  boosters: 'Tap a <b>booster</b> below to load it. You earn more by playing!',
};

// ------------------------------------------------------------------ screens

const SCREENS = ['title', 'map', 'cove', 'play', 'pause', 'results'];

function show(next) {
  mode = next;
  const playing = ['play', 'pause', 'results'].includes(next);
  for (const name of SCREENS) {
    const el = $(`screen-${name}`);
    if (name === 'play') el.classList.toggle('hidden', !playing);
    else el.classList.toggle('hidden', name !== next);
  }
  document.body.classList.toggle('playing', playing);
  if (playing) layout();
  if (next !== 'play') document.body.classList.remove('no-cursor');
  if (['title', 'map', 'cove'].includes(next)) sfx.stopMusic();
  focusFirst();
}

function focusFirst() {
  // keep keyboard and gamepad players on a sensible button
  const screen = $(`screen-${mode}`);
  if (!screen || mode === 'play') return;
  const target = screen.querySelector('.btn.primary') || screen.querySelector('.btn, button');
  if (target && !coarse) requestAnimationFrame(() => target.focus({ preventScroll: true }));
}

let titleArtDrawn = false;
function drawTitleArt() {
  if (titleArtDrawn) return;
  titleArtDrawn = true;
  const c = $('title-art');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = 340, h = 160;
  c.width = w * dpr;
  c.height = h * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const sprites = new Sprites();
  sprites.setRadius(17 * dpr);
  const put = (cell, x, y, scale = 1) => {
    const sp = sprites.forCell(cell);
    const size = (sp.canvas.width / dpr) * scale;
    ctx.drawImage(sp.canvas, x - size / 2, y - size / 2, size, size);
  };
  put({ k: 'b', c: 0 }, 40, 50); put({ k: 'b', c: 1 }, 76, 30); put({ k: 'b', c: 3 }, 290, 40);
  put({ k: 'b', c: 2 }, 318, 76, 0.8); put({ k: 'b', c: 4 }, 22, 92, 0.7);
  put({ k: 'otter', o: 0 }, 112, 58, 1.25); put({ k: 'otter', o: 7 }, 246, 70, 1.25);
  put({ k: 'b', c: 5 }, 170, 22, 0.75);
  ctx.save();
  ctx.translate(178, 118);
  drawCrabBody(ctx, 24);
  ctx.restore();
  ctx.save();
  ctx.translate(178, 78);
  ctx.rotate(0.15);
  drawLauncher(ctx, 18);
  ctx.restore();
  put({ k: 'b', c: 3 }, 182, 74, 0.95);
}

function todayKey() {
  return dateKeyOf(new Date());
}

function toTitle() {
  show('title');
  drawTitleArt();
  const stars = totalStars(save);
  const cleared = Object.keys(save.stars).length;
  const next = Math.min(save.unlocked, LEVEL_COUNT);
  $('btn-play').innerHTML = cleared ? `Play level ${next}` : 'Play';
  const streak = currentStreak(save, todayKey());
  const done = dailyDone(save, todayKey());
  $('btn-daily').innerHTML = `🌊 Daily Tide<small>${done ? `Done today ✓ · ${streak} day streak` : streak ? `${streak} day streak, keep it going!` : 'A new puzzle every day'}</small>`;
  $('btn-cove').innerHTML = `Otter Cove <small>${save.otters.length} of ${OTTER_COUNT} otters rescued</small>`;
  const bits = [];
  if (cleared) bits.push(`★ ${stars} of ${LEVEL_COUNT * 3}`);
  else bits.push(`${LEVEL_COUNT} levels across ${AREAS.length} seaside spots`);
  if (save.daily.bestStreak) bits.push(`best streak ${save.daily.bestStreak}`);
  $('title-progress').textContent = bits.join(' · ');
  startDailyTuning();
}

function toMap(focus = levelId) {
  show('map');
  renderMap($('map-holder'), save, (id) => startLevel(id));
  $('map-stars').textContent = `★ ${totalStars(save)}`;
  const tabs = $('area-tabs');
  tabs.innerHTML = '';
  AREAS.forEach((area) => {
    const button = document.createElement('button');
    const done = LEVELS.filter((l) => l.area === area.index && save.stars[l.id]).length;
    button.textContent = `${area.name} ${done}/${area.to - area.from + 1}`;
    if (focus >= area.from && focus <= area.to) button.className = 'on';
    button.addEventListener('click', () => scrollToLevel($('map-scroll'), $('map-holder'), area.from));
    tabs.appendChild(button);
  });
  requestAnimationFrame(() => scrollToLevel($('map-scroll'), $('map-holder'), focus));
}

function toCove() {
  show('cove');
  const grid = $('cove-grid');
  grid.innerHTML = '';
  for (let id = 0; id < OTTER_COUNT; id++) {
    const found = save.otters.includes(id);
    const card = document.createElement('div');
    card.className = `otter-card${found ? '' : ' missing'}`;
    const art = document.createElement('canvas');
    paintOtter(art, id, 64, { found });
    const name = document.createElement('b');
    name.textContent = found ? OTTER_NAMES[id] : '???';
    const note = document.createElement('small');
    note.textContent = found ? otterLook(id).accessory.replace('sailor', 'sailor hat') : 'still in the bay';
    card.append(art, name, note);
    grid.appendChild(card);
  }
  $('cove-count').textContent = `${save.otters.length}/${OTTER_COUNT}`;
}

// --------------------------------------------------------------- the level

// The daily tide's supply comes from the autoplayer, worked out a few
// shots per frame while the title is showing.
let dailyTune = null;
function startDailyTuning() {
  const key = todayKey();
  if (dailyTune && dailyTune.key === key) return;
  if (save.dailyTune && save.dailyTune.key === key) { dailyTune = { key, done: true, value: save.dailyTune }; return; }
  import('./ai.js').then((ai) => {
    const level = dailyLevel(key);
    dailyTune = { key, done: false, gen: ai.calibrateSteps(level, { seeds: [1, 2, 3], steps: 64 }), value: null };
  });
}

function pumpDailyTuning(budgetMs) {
  if (!dailyTune || dailyTune.done) return;
  const until = performance.now() + budgetMs;
  while (performance.now() < until) {
    const step = dailyTune.gen.next();
    if (step.done) {
      dailyTune.done = true;
      dailyTune.value = { key: dailyTune.key, supply: step.value.supply, stars: step.value.stars };
      save.dailyTune = dailyTune.value;
      persist();
      return;
    }
  }
}

function buildDaily() {
  const key = todayKey();
  const level = dailyLevel(key);
  if (dailyTune && dailyTune.key === key && !dailyTune.done) pumpDailyTuning(2000);
  const tune = dailyTune && dailyTune.key === key && dailyTune.done ? dailyTune.value : null;
  if (tune) {
    level.supply = tune.supply;
    level.stars = [0, tune.stars[1], tune.stars[2]];
  }
  return level;
}

function startLevel(id, { daily = false, retry = false } = {}) {
  sfx.unlock();
  sfx.startMusic();
  isDaily = daily;
  let level;
  if (daily) {
    level = buildDaily();
    levelId = 0;
  } else {
    levelId = Math.max(1, Math.min(LEVEL_COUNT, id | 0));
    level = getLevel(levelId);
  }
  attempt = retry ? attempt + 1 : 0;
  newOtters.clear();
  const seed = daily ? 1 + attempt : Number(params.get('seed')) || (Date.now() % 100000) + attempt;
  game = new Game(level, { seed });
  view.setGame(game);
  view.aim = Math.PI / 2;
  updateGuide();
  endTimer = 0;
  finale = null;
  pendingResult = null;
  shownScore = 0;
  lastGoalHave = 0;
  aimKeys.left = aimKeys.right = false;
  show('play');
  layout();
  buildHud();
  showBanner(retry);
  showTip(level);
  if (autoplay) autoplay.wait = 0.9;
  queueMicrotask(() => monitor.mark(performance.now(), 'level'));
  log.event('level.start', {
    level: levelId, daily, area: level.area, goal: level.goal.type, supply: level.supply, retry, 'stars.best': save.stars[levelId] | 0,
  });
}

function retry() {
  if (!game) return;
  sfx.click();
  startLevel(levelId, { daily: isDaily, retry: true });
}

function layout() {
  const stage = $('screen-play');
  const rect = stage.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  const top = $('hud').getBoundingClientRect().height + 4;
  const bottom = $('dock').getBoundingClientRect().height + 4;
  view.resize(Math.floor(rect.width), Math.floor(rect.height), { top, bottom, side: 290 });
  // tips sit just above the tide line, where the board is usually empty
  $('tip').style.bottom = `${Math.max(70, rect.height - view.Y(WATER_Y) + 10)}px`;
}

function goalIconCell(level) {
  if (level.goal.type === 'otters') return { k: 'otter', o: level.cells.find((c) => c?.k === 'otter')?.o ?? 0 };
  if (level.goal.type === 'anchor') return { k: 'anchor' };
  return { k: 'b', c: 3 };
}

function buildHud() {
  const level = game.level;
  $('hud-level').textContent = isDaily ? 'Daily Tide' : `Level ${level.id}`;
  $('hud-name').textContent = isDaily ? level.dateKey : level.name;
  paintBubbleIcon($('goal-icon'), goalIconCell(level), coarse || innerWidth < 520 ? 28 : 34);
  for (const button of document.querySelectorAll('.booster')) {
    const kind = button.dataset.booster;
    paintBubbleIcon(button.querySelector('canvas'), { k: kind }, innerWidth < 520 ? 34 : 40);
  }
  updateHud(true);
}

function updateHud(force = false) {
  if (!game) return;
  const goal = game.goalProgress();
  const text = game.level.goal.type === 'anchor' ? (goal.have ? 'Dropped!' : 'Drop it!') : `${goal.have}/${goal.need}`;
  const chip = $('hud-goal');
  if ($('goal-text').textContent !== text) $('goal-text').textContent = text;
  chip.classList.toggle('done', goal.have >= goal.need);
  if (goal.have !== lastGoalHave) {
    lastGoalHave = goal.have;
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  }
  shownScore += (game.score - shownScore) * (force ? 1 : 0.2);
  if (Math.abs(game.score - shownScore) < 1) shownScore = game.score;
  const scoreText = Math.round(shownScore).toLocaleString();
  if ($('hud-score').textContent !== scoreText) $('hud-score').textContent = scoreText;
  const left = game.shotsLeft;
  const stars = game.goalMet() ? (left >= game.level.stars[2] ? 3 : left >= game.level.stars[1] ? 2 : 1) : 0;
  const starEls = $('hud-stars').children;
  for (let k = 0; k < 3; k++) starEls[k].classList.toggle('on', k < stars);
  for (const button of document.querySelectorAll('.booster')) {
    const kind = button.dataset.booster;
    // a loaded booster is shown as taken, though it is only spent on firing
    const n = (save.boosters[kind] | 0) - (game.current?.booster && game.current.kind === kind ? 1 : 0);
    const b = button.querySelector('b');
    if (b.textContent !== String(n)) b.textContent = n;
    button.classList.toggle('empty', n === 0 && game.current?.kind !== kind);
    button.classList.toggle('loaded', game.current?.kind === kind);
  }
}

let bannerTimer = 0;
function showBanner(quick) {
  const level = game.level;
  $('banner-title').textContent = isDaily ? `Daily Tide · ${level.dateKey}` : `Level ${level.id} · ${level.name}`;
  $('banner-goal').textContent = `${GOAL_TEXT[level.goal.type](level.goal.need)}!`;
  const el = $('banner');
  el.classList.remove('hidden', 'out');
  bannerTimer = quick ? 1.1 : 2.2;
}

let tipTimer = 0;
function showTip(level) {
  const kinds = new Set(level.cells.filter(Boolean).map((c) => c.k));
  const order = [];
  if (!save.tips.creep) order.push('creep');
  if (level.goal.type === 'otters') order.push('otters');
  if (level.goal.type === 'anchor') order.push('anchor');
  if (level.goal.type === 'pop') order.push('pop');
  for (const k of ['rainbow', 'stone', 'ice', 'bomb', 'zap']) if (kinds.has(k)) order.push(k);
  if (level.id >= 3 || isDaily) order.push('boosters');
  const key = order.find((k) => !save.tips[k]);
  if (!key) { $('tip').classList.add('hidden'); return; }
  save.tips[key] = 1;
  persist();
  $('tip').innerHTML = TIPS[key];
  $('tip').classList.remove('hidden');
  tipTimer = 7;
}

let toastTimer = 0;
function toast(text, seconds = 1.6) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  toastTimer = seconds;
}

// ------------------------------------------------------------------- aiming

function updateGuide() {
  if (!game || game.phase !== 'aim' || !game.current) { view.setGuide(null); return; }
  view.setGuide(game.preview(view.aim));
}

function setAim(angle) {
  const a = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle));
  if (a === view.aim && view.guide) return;
  view.aim = a;
  updateGuide();
}

function canShoot() {
  return mode === 'play' && game && game.phase === 'aim' && !view.busy && !finale && game.current;
}

function fire() {
  if (!canShoot()) return;
  const before = game.board.clone();
  const shot = game.current;
  const result = game.fire(view.aim);
  if (!result) return;
  sfx.shoot();
  if (shot.booster) {
    // A booster is only spent when it is fired, so retry, leaving the level
    // or a reload with one loaded keeps it.
    useBooster(save, shot.kind);
    persist();
    log.event('booster.used', { level: levelId, kind: shot.kind });
  }
  view.playShot(result, before);
  $('tip').classList.add('hidden');
  if (result.creep && !save.tips.creepSeen) {
    save.tips.creepSeen = 1;
    toast('The plank moved down a row!', 1.8);
  }
  if (game.phase === 'aim' && game.creepIn === 2 && !game.goalMet()) setTimeout(() => sfx.creepWarn(), 450);
  const fresh = result.events.freed.map((f) => f.cell.o);
  if (fresh.length) {
    const added = addOtters(save, fresh);
    for (const id of added) newOtters.add(id);
    for (const id of added) log.event('otter.found', { otter: id, level: levelId });
    persist();
  }
  if (game.phase !== 'aim') {
    endTimer = 0;
    pendingResult = game.phase;
  }
  updateGuide();
  updateHud();
}

function swap() {
  if (!game || mode !== 'play' || game.phase !== 'aim' || finale) return;
  if (game.swap()) {
    sfx.swap();
    view.loadPop = 0.4;
    updateGuide();
  }
}

function toggleBooster(kind) {
  if (!game || mode !== 'play' || game.phase !== 'aim' || finale || view.busy) return;
  const button = document.querySelector(`.booster[data-booster="${kind}"]`);
  if (game.current?.booster) {
    const had = game.unloadBooster();
    if (had === kind) { updateHud(); updateGuide(); return; }
  }
  if ((save.boosters[kind] | 0) <= 0) {
    button.classList.remove('shake');
    void button.offsetWidth;
    button.classList.add('shake');
    toast('Earn boosters by clearing levels!');
    return;
  }
  if (game.loadBooster(kind)) {
    sfx.booster();
    view.loadPop = 0;
    toast({ rainbow: 'Rainbow: pops every color it touches!', bomb: 'Bomb: a big splash where it lands!', zap: 'Lightning: zaps straight through!' }[kind], 1.6);
  }
  updateHud();
  updateGuide();
}

// pointer: drag to aim, release to fire
const canvas = $('board');
let dragging = null;

function localPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

canvas.addEventListener('pointerdown', (event) => {
  if (mode !== 'play' || !game) return;
  sfx.unlock();
  const p = localPoint(event);
  if (view.onSwapSpot(p.x, p.y)) { swap(); return; }
  const angle = view.angleTo(p.x, p.y);
  if (angle === null) return;
  canvas.setPointerCapture?.(event.pointerId);
  dragging = { id: event.pointerId };
  view.showGuide = true;
  setAim(angle);
});

canvas.addEventListener('pointermove', (event) => {
  if (mode !== 'play' || !game) return;
  const p = localPoint(event);
  if (dragging && dragging.id === event.pointerId) {
    const angle = view.angleTo(p.x, p.y);
    view.showGuide = angle !== null;
    if (angle !== null) setAim(angle);
  } else if (event.pointerType === 'mouse') {
    const angle = view.angleTo(p.x, p.y);
    if (angle !== null) setAim(angle);
  }
});

function endDrag(event, cancel) {
  if (!dragging || dragging.id !== event.pointerId) return;
  dragging = null;
  const p = localPoint(event);
  const angle = view.angleTo(p.x, p.y);
  view.showGuide = true;
  if (cancel || angle === null) return;
  setAim(angle);
  fire();
}
canvas.addEventListener('pointerup', (event) => endDrag(event, false));
canvas.addEventListener('pointercancel', (event) => endDrag(event, true));

// keyboard
const aimKeys = { left: false, right: false, fine: false };

addEventListener('keydown', (event) => {
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (mode === 'play') { event.preventDefault(); pause(); }
    else if (mode === 'pause') { event.preventDefault(); resume(); }
    return;
  }
  if (event.code === 'KeyM') { toggleMute(); return; }
  if (mode === 'results' && event.code === 'KeyR') { event.preventDefault(); retryFromResults(); return; }
  if (mode !== 'play' || !game) return;
  sfx.unlock();
  aimKeys.fine = event.shiftKey;
  switch (event.code) {
    case 'ArrowLeft': case 'KeyA': aimKeys.left = true; event.preventDefault(); break;
    case 'ArrowRight': case 'KeyD': aimKeys.right = true; event.preventDefault(); break;
    case 'Space': case 'ArrowUp': case 'KeyW': case 'Enter': event.preventDefault(); if (!event.repeat) fire(); break;
    case 'ArrowDown': case 'KeyS': case 'KeyX': case 'KeyC': event.preventDefault(); if (!event.repeat) swap(); break;
    case 'Digit1': toggleBooster('rainbow'); break;
    case 'Digit2': toggleBooster('bomb'); break;
    case 'Digit3': toggleBooster('zap'); break;
    case 'KeyR': if (!event.repeat) retry(); break;
    default:
  }
});

addEventListener('keyup', (event) => {
  aimKeys.fine = event.shiftKey;
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') aimKeys.left = false;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') aimKeys.right = false;
});
addEventListener('blur', () => { aimKeys.left = aimKeys.right = false; });

function keyAim(dt) {
  if (!game || mode !== 'play') return;
  const dir = (aimKeys.left ? 1 : 0) - (aimKeys.right ? 1 : 0);
  if (dir) setAim(view.aim + dir * dt * (aimKeys.fine ? 0.35 : 1.3));
}

// gamepad
let padPrev = {};
function pollGamepad(dt) {
  const pads = navigator.getGamepads?.() ?? [];
  const pad = [...pads].find((p) => p && p.connected);
  if (!pad) return;
  const ax = pad.axes[0] || 0;
  const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
  const pressed = {
    left: pad.buttons[14]?.pressed || ax < -0.5,
    right: pad.buttons[15]?.pressed || ax > 0.5,
    up: pad.buttons[12]?.pressed || (pad.axes[1] || 0) < -0.5,
    down: pad.buttons[13]?.pressed || (pad.axes[1] || 0) > 0.5,
    a: pad.buttons[0]?.pressed,
    b: pad.buttons[1]?.pressed,
    x: pad.buttons[2]?.pressed,
    y: pad.buttons[3]?.pressed,
    rb: pad.buttons[5]?.pressed,
    start: pad.buttons[9]?.pressed,
  };
  const hit = (name) => pressed[name] && !padPrev[name];
  if (hit('start')) { if (mode === 'play') pause(); else if (mode === 'pause') resume(); }
  if (mode === 'play' && game) {
    const stick = Math.abs(ax) > 0.18 ? ax : 0;
    const dpad = (pad.buttons[14]?.pressed ? -1 : 0) + (pad.buttons[15]?.pressed ? 1 : 0);
    const turn = stick || dpad;
    if (turn) setAim(view.aim - turn * dt * 1.5);
    if (Math.hypot(rx, ry) > 0.6 && ry < 0.2) setAim(Math.atan2(-ry, rx));
    if (hit('a')) fire();
    if (hit('b')) swap();
    if (hit('x')) toggleBooster('rainbow');
    if (hit('y')) toggleBooster('bomb');
    if (hit('rb')) toggleBooster('zap');
  } else if (['title', 'map', 'cove', 'pause', 'results'].includes(mode)) {
    // simple menu navigation
    const screen = $(`screen-${mode}`);
    const buttons = [...screen.querySelectorAll('.btn, button, .node.open')].filter((el) => el.offsetParent !== null);
    const index = buttons.indexOf(document.activeElement);
    if (hit('down') || hit('right')) buttons[(index + 1) % buttons.length]?.focus();
    if (hit('up') || hit('left')) buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    if (hit('a')) {
      const target = index >= 0 ? buttons[index] : buttons[0];
      target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    if (hit('b') && mode === 'pause') resume();
  }
  padPrev = pressed;
}

// ------------------------------------------------------------------ states

function pause() {
  if (mode !== 'play') return;
  dragging = null;
  aimKeys.left = aimKeys.right = false;
  show('pause');
  const level = game.level;
  const goal = game.goalProgress();
  $('pause-goal').textContent = `${GOAL_TEXT[level.goal.type](level.goal.need)} · ${level.goal.type === 'anchor' ? (goal.have ? 'done' : 'not yet') : `${goal.have}/${goal.need}`} · ${game.shotsLeft} bubbles left`;
  $('btn-pause-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
}

function resume() {
  if (mode !== 'pause') return;
  show('play');
  layout();
}

function toggleMute() {
  save.muted = !save.muted;
  sfx.setMuted(save.muted);
  persist();
  $('btn-pause-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
}

function button(label, primary, action) {
  const el = document.createElement('button');
  el.className = `btn${primary ? ' primary' : ''}`;
  el.innerHTML = label;
  el.addEventListener('click', () => { sfx.click(); action(); });
  return el;
}

function retryFromResults() {
  if (game?.canContinue()) return;
  retry();
}

function showResults() {
  const won = game.phase === 'won';
  const level = game.level;
  const lines = [];
  const buttons = [];
  const stars = won ? game.stars() : 0;
  const starEls = $('res-stars').children;
  for (let k = 0; k < 3; k++) starEls[k].classList.toggle('on', k < stars);
  $('res-stars').classList.toggle('hidden', !won);
  $('res-score').textContent = Math.round(game.score).toLocaleString();
  const best = $('res-best');
  best.className = 'best';
  best.textContent = '';
  const otterBox = $('res-otters');
  otterBox.innerHTML = '';

  if (won) {
    sfx.win();
    for (let k = 0; k < stars; k++) setTimeout(() => sfx.star(k), 450 + k * 250);
    $('res-title').textContent = isDaily ? 'Daily Tide done!' : ['Level cleared!', 'Splendid!', 'Shell-tastic!'][stars - 1] || 'Level cleared!';
    let rewards = [];
    if (isDaily) {
      const res = recordDaily(save, level.dateKey, { score: game.score, won: true });
      rewards = res.rewards;
      if (res.newBest) { best.textContent = 'New best for today!'; best.classList.add('new'); }
      else best.textContent = `Today's best ${save.daily.best.toLocaleString()}`;
      lines.push(['Daily streak', `${res.streak} day${res.streak === 1 ? '' : 's'} 🐚`]);
      log.event('daily.complete', { score: game.score, streak: res.streak, first: res.firstToday });
    } else {
      const res = recordWin(save, level.id, { score: game.score, stars });
      rewards = res.rewards;
      if (res.newBest && res.prevBest > 0) { best.textContent = 'New best!'; best.classList.add('new'); }
      else if (res.newBest) best.textContent = 'First clear!';
      else best.textContent = `Best ${res.best.toLocaleString()}`;
      log.event('level.complete', {
        level: level.id, stars, score: game.score, shots: game.shots, 'bubbles.left': game.leftover,
        otters: game.freed.length, continued: game.continued, 'best.new': res.newBest,
      });
    }
    persist();
    lines.push(['Bubbles left', `${game.leftover} × 100`]);
    if (game.bestChain >= 6) lines.push(['Biggest splash', `${game.bestChain} bubbles`]);
    if (!isDaily && stars < 3) lines.push([`Keep ${level.stars[stars]} bubbles for ${stars + 1} stars`]);
    for (const kind of rewards) lines.push([`Booster earned: ${{ rainbow: '🌈 Rainbow', bomb: '💣 Bomb', zap: '⚡ Lightning' }[kind]}!`]);
    if (isDaily) {
      buttons.push(button('Play again', false, () => startLevel(0, { daily: true, retry: true })));
      buttons.push(button('Seaside map', true, () => toMap(Math.min(save.unlocked, LEVEL_COUNT))));
    } else if (level.id < LEVEL_COUNT) {
      buttons.push(button(`Next: level ${level.id + 1} →`, true, () => startLevel(level.id + 1)));
      buttons.push(button('Replay', false, () => startLevel(level.id)));
      buttons.push(button('Seaside map', false, () => toMap(level.id + 1)));
    } else {
      lines.push(['You rescued the whole bay! 🎉']);
      buttons.push(button('Otter Cove', true, toCove));
      buttons.push(button('Replay', false, () => startLevel(level.id)));
    }
  } else {
    sfx.lose();
    const canContinue = game.canContinue();
    $('res-title').textContent = game.lostReason === 'line' ? 'The bubbles reached the water!' : 'Out of bubbles!';
    const goal = game.goalProgress();
    lines.push([GOAL_TEXT[level.goal.type](level.goal.need), level.goal.type === 'anchor' ? 'not yet' : `${goal.have}/${goal.need}`]);
    if (canContinue) {
      buttons.push(button('+5 bubbles and a wave 🌊', true, useContinue));
      buttons.push(button('Try again', false, retry));
    } else {
      buttons.push(button('Try again <small>R</small>', true, retry));
      log.event('level.fail', {
        level: levelId, daily: isDaily, reason: game.lostReason, shots: game.shots, score: game.score,
        'goal.have': goal.have, 'goal.need': goal.need,
      });
      if (isDaily) recordDaily(save, level.dateKey, { score: game.score, won: false });
      persist();
    }
    buttons.push(button('Seaside map', false, () => toMap(levelId || save.unlocked)));
  }
  // rescued otters from this level
  const seen = new Set();
  for (const id of game.freed) {
    if (seen.has(id)) continue;
    seen.add(id);
    const fig = document.createElement('figure');
    const art = document.createElement('canvas');
    paintOtter(art, id, 46);
    const name = document.createElement('span');
    name.textContent = OTTER_NAMES[id];
    fig.append(art, name);
    if (newOtters.has(id)) {
      const tag = document.createElement('em');
      tag.textContent = 'New!';
      fig.append(tag);
    }
    otterBox.appendChild(fig);
  }
  $('res-lines').innerHTML = lines
    .map(([a, b]) => (b === undefined ? `<div class="highlight">${a}</div>` : `<div><span>${a}</span><b>${b}</b></div>`))
    .join('');
  const row = $('res-buttons');
  row.innerHTML = '';
  for (const el of buttons) row.appendChild(el);
  show('results');
  updateHud(true);
}

function useContinue() {
  const events = game.useContinue();
  if (!events) return;
  log.event('continue.used', { level: levelId, daily: isDaily });
  sfx.wave();
  // the wave: show what it washed away
  view.washed(events, game.board);
  for (const id of addOtters(save, events.freed.map((f) => f.cell.o))) newOtters.add(id);
  persist();
  pendingResult = null;
  show('play');
  toast('Whoosh! A friendly wave. +5 bubbles!', 2);
  updateGuide();
  updateHud(true);
}

// -------------------------------------------------------------- the loop

function pumpGame(dt) {
  if (!game) return;
  if (finale) {
    finale.t -= dt;
    if (finale.t <= 0 && finale.left > 0) {
      view.finaleBubble(finale.left);
      sfx.pop(Math.min(12, finale.n - finale.left));
      finale.left--;
      finale.t = 0.07;
    }
    if (finale.left <= 0) {
      finale.wait -= dt;
      if (finale.wait <= 0) { finale = null; showResults(); }
    }
    return;
  }
  if (pendingResult) {
    if (view.settling) return;
    endTimer += dt;
    if (endTimer < (pendingResult === 'won' ? 0.5 : 0.7)) return;
    if (pendingResult === 'won') {
      const n = Math.min(24, game.leftover);
      finale = { left: n, n, t: 0.1, wait: 0.7 };
      if (n) view.floater(`${game.leftover} bubbles left!`, 10, 14, '#ffe14d', 1.2);
    } else {
      showResults();
    }
    pendingResult = null;
  }
}

let pointerIdle = 0;
let pointerHidden = false;
addEventListener('pointermove', (event) => { if (event.pointerType === 'mouse') pointerIdle = 0; });

function updatePointer(dt) {
  pointerIdle += dt;
  const hide = mode === 'play' && pointerIdle > 2 && !coarse;
  if (hide !== pointerHidden) {
    pointerHidden = hide;
    document.body.classList.toggle('no-cursor', hide);
  }
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, level: levelId, phase: game ? game.phase : 'none', busy: view.busy }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  if (crashNext) { crashNext = false; throw new Error('Bubble Bay test crash'); }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePointer(dt);
  pollGamepad(dt);
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.add('hidden'); }
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) {
      $('banner').classList.add('out');
      setTimeout(() => $('banner').classList.add('hidden'), 360);
    }
  }
  if (tipTimer > 0) { tipTimer -= dt; if (tipTimer <= 0) $('tip').classList.add('hidden'); }
  if (mode === 'title') pumpDailyTuning(5);
  if (mode === 'play') {
    keyAim(dt);
    pumpGame(dt);
    if (autoplay) autoStep(dt);
  }
  if (game && (mode === 'play' || mode === 'results')) {
    view.update(dt);
    view.draw();
    updateHud(false);
  } else if (game && mode === 'pause') {
    view.draw();
  }
  requestAnimationFrame(loop);
}

const loop = telemetry ? telemetry.guard(frame, 'bubble-bay.frame') : frame;

// Attract mode / balance check in the browser: ?autoplay
function autoStep(dt) {
  if (!autoplay.ai || !game) return;
  if (game.phase !== 'aim' || view.busy || finale || pendingResult) return;
  autoplay.wait -= dt;
  if (autoplay.wait > 0) return;
  const move = autoplay.ai.pickShot(game, { steps: 64 });
  if (move.swap) swap();
  const target = move.angle;
  const diff = target - view.aim;
  if (Math.abs(diff) > 0.02) { setAim(view.aim + Math.sign(diff) * Math.min(Math.abs(diff), dt * 3)); autoplay.wait = 0; return; }
  setAim(target);
  fire();
  autoplay.wait = 0.45;
}

function autoResults() {
  if (!autoplay || mode !== 'results') return;
  if (game.phase === 'won') {
    if (levelId && levelId < LEVEL_COUNT) startLevel(levelId + 1);
    else startLevel(1);
  } else if (game.canContinue()) useContinue();
  else retry();
}
setInterval(autoResults, 1800);

// ------------------------------------------------------------------- wiring

$('btn-play').addEventListener('click', () => { sfx.unlock(); startLevel(Math.min(save.unlocked, LEVEL_COUNT)); });
$('btn-map').addEventListener('click', () => { sfx.unlock(); sfx.click(); toMap(Math.min(save.unlocked, LEVEL_COUNT)); });
$('btn-daily').addEventListener('click', () => { sfx.unlock(); startLevel(0, { daily: true }); });
$('btn-cove').addEventListener('click', () => { sfx.unlock(); sfx.click(); toCove(); });
for (const el of document.querySelectorAll('[data-to-title]')) el.addEventListener('click', () => { sfx.click(); toTitle(); });
$('btn-pause').addEventListener('click', pause);
$('btn-retry').addEventListener('click', retry);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startLevel(levelId, { daily: isDaily, retry: true }));
$('btn-pause-mute').addEventListener('click', toggleMute);
$('btn-pause-map').addEventListener('click', () => toMap(levelId || save.unlocked));
for (const el of document.querySelectorAll('.booster')) {
  el.addEventListener('click', () => toggleBooster(el.dataset.booster));
}
addEventListener('resize', layout);
addEventListener('orientationchange', () => setTimeout(layout, 120));
new ResizeObserver(layout).observe($('screen-play'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') pause();
});

if (params.has('autoplay')) {
  import('./ai.js').then((ai) => { autoplay.ai = ai; });
}

log.event('game.ready', { unlocked: save.unlocked, stars: totalStars(save), otters: save.otters.length, streak: currentStreak(save, todayKey()) });
if (params.has('level')) startLevel(Number(params.get('level')));
else if (params.has('daily')) startLevel(0, { daily: true });
else if (params.has('map')) toMap();
else if (params.has('cove')) toCove();
else toTitle();

requestAnimationFrame(loop);

// Handy for poking at the game from the console and from browser tests.
window.BB = {
  get game() { return game; }, get mode() { return mode; }, view, save, startLevel, toMap, toTitle, toCove, sfx, LEVELS,
  fire, swap, setAim, crash() { crashNext = true; },
};
