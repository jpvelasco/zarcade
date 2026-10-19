// Browser entry: screens, the fixed-step loop, painting, sound and saves.
import { World, refit, STEP, isNight, MORNING } from './world.js';
import { Renderer, iconUrl, thumbnail, SPARK } from './render.js';
import { Sound } from './audio.js';
import { pickGrid, trayPlacement, toCell } from './layout.js';
import { buildScene } from './scenes.js';
import { GOALS, GOAL_BY_ID, goalOpen, nextGoal, dailyPrompt, findsIn } from './goals.js';
import { Autoplayer } from './autoplay.js';
import { encodeWorld, decodeCells, MAX_SCENE_CHARS } from './codec.js';
import {
  SAVE_KEY, loadSave, writeSave, mergeSave, unlockedElements, brushUnlocked, skyUnlocked, rainbowUnlocked,
  unlockGoal, recordGoal, goalsDone, recordFound, recordDaily, liveStreak, dailyDone, addToGallery,
  removeFromGallery, MAX_GALLERY,
} from './progress.js';
import {
  PALETTE, PALETTE_BY_ID, BRUSH_SIZES, BRUSHES, SKIES, COLLECTION, BASE_ELEMENTS, TYPE_COUNT,
  EMPTY, LAVA, FIRE, TIP, FLOWER, LEAF, STEM,
} from './elements.js';
import { dateKey, keyLabel } from './rng.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const demo = params.has('autoplay');
const unlockAll = params.has('unlock');

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

// Reading localStorage throws when the browser blocks site storage; the save
// helpers treat that as "nothing saved".
const storage = (() => { try { return localStorage; } catch { return null; } })();
let save = loadSave(storage);
let saveWarned = false;
function persist() {
  // ?autoplay is a demo: nothing it does may land in the real save.
  if (demo) return;
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const today = (() => {
  const k = parseInt(params.get('date'), 10);
  return k >= 20000101 && k <= 29991231 ? k : dateKey();
})();

const app = $('app');
const stage = $('stage');
const canvas = $('garden');
const renderer = new Renderer(canvas, { reduced });
const sound = new Sound({ muted: save.muted });

const OVER = Object.fromEntries(PALETTE.map((p) => {
  const mask = new Uint8Array(TYPE_COUNT);
  for (const t of p.over || []) mask[t] = 1;
  return [p.id, mask];
}));

let grid = null;
let world = null;
let session = { kind: 'title' }; // title | goal | daily | free
let screen = null; // the overlay on show, or null while playing
let menuBack = 'title'; // where Back leads from the goal, gallery and finds lists
let confirmBack = null;
let accumulator = 0;
let undo = [];
let stroke = null;
let crashNext = false;
const brush = {
  element: save.brush.element === 'eraser' ? 'sand' : save.brush.element,
  erasing: save.brush.element === 'eraser',
  size: save.brush.size,
  shape: save.brush.shape,
};
const pointer = { x: 0, y: 0, inside: false, mode: 'mouse', idle: 0 };
const kbd = { x: 0, y: 0, active: false };

const SCREENS = ['screen-title', 'screen-goals', 'screen-collection', 'screen-gallery', 'screen-intro', 'screen-pause', 'screen-complete', 'screen-confirm'];
const isPlay = () => session.kind !== 'title';

// ------------------------------------------------------------ unlocks

const lent = () => (session.goal && session.goal.lend) || [];
function available() {
  if (unlockAll) return new Set(PALETTE.map((p) => p.id));
  return unlockedElements(save, isPlay() ? lent() : []);
}
const canBrush = (id) => unlockAll || brushUnlocked(save, id);
const canSky = (id) => unlockAll || skyUnlocked(save, id);
const canRainbow = () => unlockAll || rainbowUnlocked(save);
const firefliesVisit = () => unlockAll || unlockedElements(save).has('firefly');
const theme = () => (canSky(save.sky) ? save.sky : 'meadow');

// ------------------------------------------------------------ screens

let shownAt = 0;
function show(id) {
  screen = id;
  shownAt = performance.now();
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const playing = id === null && isPlay();
  $('hud').classList.toggle('hidden', !(isPlay() && (id === null || id === 'screen-complete')));
  canvas.classList.toggle('playing', playing);
  if (!playing) { endStroke(); document.body.classList.remove('no-cursor'); }
  sound.setActive(id === null || id === 'screen-title' || id === 'screen-complete');
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .tile:not([disabled]), .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
}

function showTray(on) {
  $('tray').classList.toggle('hidden', !on);
}

let toastTimer = 0;
const toasts = [];
function toast(text, icon = null) {
  toasts.push({ text, icon });
  if (toasts.length > 4) toasts.splice(1, toasts.length - 4);
  if (!toastTimer) nextToast();
}
function nextToast() {
  const t = toasts.shift();
  const el = $('toast');
  if (!t) { el.classList.add('hidden'); toastTimer = 0; return; }
  el.innerHTML = '';
  if (t.icon) {
    const i = document.createElement('span');
    i.className = 'ico-px';
    i.style.backgroundImage = `url(${iconUrl(t.icon)})`;
    el.appendChild(i);
  }
  el.appendChild(document.createTextNode(t.text));
  el.classList.remove('hidden');
  if (!reduced && el.animate) el.animate([{ opacity: 0, translate: '0 -10px' }, { opacity: 1, translate: '0 0' }], { duration: 250, easing: 'ease-out' });
  toastTimer = setTimeout(nextToast, 2400);
}

// ------------------------------------------------------------ layout

function layout() {
  app.classList.toggle('side', trayPlacement(innerWidth, innerHeight) === 'side');
  const r = stage.getBoundingClientRect();
  const g = pickGrid(r.width, r.height, devicePixelRatio || 1);
  if (grid && g.w === grid.w && g.h === grid.h && g.cell === grid.cell) return false;
  grid = g;
  renderer.setGrid(g);
  return true;
}

// A resize or rotation: fit the garden to the new grid without losing it.
function onResize() {
  if (isPlay()) requestAnimationFrame(paletteFade);
  if (!layout() || !world) return;
  if (world.w === grid.w && world.h === grid.h) return;
  if (isPlay()) {
    const fit = refit(world, grid.w, grid.h);
    world = fit.world;
    // Anchors (where the demo paints) move with the garden, like markers.
    if (session.info) {
      const moved = {};
      for (const [k, a] of Object.entries(session.info.anchors || {})) {
        moved[k] = { ...a };
        for (const key of ['x', 'x0', 'x1']) if (a[key] !== undefined) moved[k][key] = Math.max(0, Math.min(grid.w - 1, Math.round(fit.toX(a[key]))));
        for (const key of ['y', 'y0', 'y1']) if (a[key] !== undefined) moved[k][key] = Math.max(0, Math.min(grid.h - 1, Math.round(fit.toY(a[key]))));
      }
      session.info.anchors = moved;
      if (session.pilot) session.pilot = new Autoplayer(pilotId(), moved, world);
    }
    undo = [];
    updateUndo();
    kbd.x = Math.min(kbd.x, grid.w - 1);
    kbd.y = Math.min(kbd.y, grid.h - 1);
  } else {
    startAttract();
  }
}

// ------------------------------------------------------------ sessions

let fastForward = 0;
function startAttract() {
  world = new World(grid.w, grid.h, 20261009);
  const info = buildScene(world, 'showcase', 7);
  world.autoFireflies = true;
  session = { kind: 'title', pilot: new Autoplayer('showcase', info.anchors, world), info };
  fastForward = reduced ? 0 : 240; // the title garden grows in quickly
}

function leaveSession(reason = 'leave') {
  if (!isPlay()) return;
  autosaveGarden();
  if (!session.done && session.kind !== 'free') {
    log.event('level.quit', { mode: session.kind, goal: session.goal?.id || session.prompt?.template, steps: session.steps, reason });
  }
}

const pilotId = () => (session.goal ? session.goal.id : session.prompt ? session.prompt.template : 'meadow');

function begin(kind, { goal = null, prompt = null, cells = null } = {}) {
  leaveSession('switch');
  session = { kind, goal, prompt, done: false, steps: 0, startedAt: performance.now(), cardAt: 0, pilot: null, progress: null };
  // Fill the tray before measuring, so the garden is built at its final size.
  showTray(true);
  if (!available().has(brush.element)) brush.element = 'sand';
  buildPalette();
  layout();
  const seed = (Math.random() * 4294967296) >>> 0;
  world = new World(grid.w, grid.h, seed || 1);
  let info = { anchors: {} };
  if (cells) {
    const src = new World(cells.w, cells.h, seed || 1);
    src.type.set(cells.type);
    src.a.set(cells.a);
    src.b.set(cells.b);
    src.tone.set(cells.tone);
    world = refit(src, grid.w, grid.h).world;
  } else if (goal) {
    info = buildScene(world, goal.scene, 1000 + GOALS.indexOf(goal));
  } else if (prompt) {
    info = buildScene(world, prompt.scene, prompt.seed, { flip: prompt.flip, params: prompt.params });
  } else {
    info = buildScene(world, 'meadow', seed);
  }
  world.autoFireflies = world.autoFireflies || firefliesVisit();
  session.info = info;
  if (demo) session.pilot = new Autoplayer(pilotId(), info.anchors, world);
  undo = [];
  kbd.x = grid.w >> 1;
  kbd.y = grid.h >> 2;
  kbd.active = false;
  accumulator = 0;
  updateTray();
  updateUndo();
  updateChip();
  updateSkyButton();
  queueMicrotask(() => monitor.mark(performance.now()));
  log.event('level.start', { mode: kind, goal: goal?.id || prompt?.template || 'free', cells: world.n, w: world.w, h: world.h });
}

function startGoal(goal) {
  begin('goal', { goal });
  showIntro();
}

function startDaily() {
  begin('daily', { prompt: dailyPrompt(today) });
  showIntro();
}

function savedGarden() {
  const g = save.garden;
  const cells = g && decodeCells(g.data, g.w, g.h);
  return cells ? { ...cells, w: g.w, h: g.h } : null;
}

function startFree(cells = null) {
  const saved = cells || savedGarden();
  begin('free', { cells: saved });
  show(null);
  toast(saved && !cells ? 'Welcome back to your garden!' : 'Free play: paint anything you like!', 'flower');
}

function play() {
  sound.unlock();
  const g = nextGoal(save.goals);
  if (g) startGoal(g);
  else startFree();
}

function toTitle() {
  leaveSession('title');
  session = { kind: 'title' };
  showTray(false);
  layout();
  startAttract();
  refreshTitle();
  show('screen-title');
}

function pause() {
  if (screen !== null || !isPlay()) return;
  autosaveGarden();
  refreshPause();
  show('screen-pause');
}

function resume() {
  show(null);
}

// ------------------------------------------------------------ title and menus

function refreshTitle() {
  const g = nextGoal(save.goals);
  $('btn-play').textContent = g ? `Play · ${g.title}` : 'Play';
  const streak = liveStreak(save, today);
  $('daily-label').textContent = dailyDone(save, today) ? 'Today ✓' : 'Today';
  const bits = [`🎯 ${goalsDone(save)}/${GOALS.length} goals`, `📖 ${save.found.length}/${COLLECTION.length} finds`];
  if (streak > 0) bits.push(`🌱 ${streak}-day streak`);
  else if (save.daily.best > 1) bits.push(`best streak ${save.daily.best}`);
  $('title-stats').textContent = bits.join(' · ');
  updateSoundButtons();
}

function openMenu(id, from) {
  menuBack = from;
  if (id === 'screen-goals') renderGoals();
  if (id === 'screen-collection') renderFinds();
  if (id === 'screen-gallery') renderGallery();
  show(id);
}

function goBack() {
  if (screen === 'screen-intro') {
    // The daily card came from the title; a goal card from the goal list.
    if (session.kind === 'daily') toTitle(); else openMenu('screen-goals', isPlayBack());
    return;
  }
  if (screen === 'screen-confirm') { answerConfirm(false); return; }
  if (screen === 'screen-pause') { resume(); return; }
  if (screen === 'screen-complete') { keepPlaying(); return; }
  if (['screen-goals', 'screen-collection', 'screen-gallery'].includes(screen)) {
    if (menuBack === 'pause' && isPlay()) { refreshPause(); show('screen-pause'); } else toTitle();
  }
}
const isPlayBack = () => (menuBack === 'pause' && isPlay() ? 'pause' : 'title');

function rewardLine(r) {
  return r.type === 'element' ? `New element: ${r.name}` : r.type === 'brush' ? `New brush: ${r.name}` : r.type === 'sky' ? `New sky: ${r.name}` : r.name;
}

function renderGoals() {
  const gridEl = $('goal-grid');
  gridEl.innerHTML = '';
  $('goals-count').textContent = `${goalsDone(save)} / ${GOALS.length}`;
  GOALS.forEach((g, i) => {
    const open = goalOpen(save.goals, i);
    const done = !!save.goals[g.id];
    const b = document.createElement('button');
    b.className = `tile${done ? ' done' : ''}`;
    b.disabled = !open;
    b.innerHTML = `<span class="num">${i + 1}</span><span class="ico-px" style="background-image:url(${iconUrl(g.icon, !open)})"></span>
      <h3></h3><p class="text"></p><p class="state"></p>`;
    b.querySelector('h3').textContent = g.title;
    b.querySelector('.text').textContent = open ? g.text : 'Finish an earlier goal to open this one.';
    b.querySelector('.state').textContent = done ? `✓ Done · ${g.reward.name}` : open ? `🎁 ${rewardLine(g.reward)}` : '🔒 Locked';
    b.addEventListener('click', () => startGoal(g));
    gridEl.appendChild(b);
  });
}

function renderFinds() {
  const gridEl = $('find-grid');
  gridEl.innerHTML = '';
  $('finds-count').textContent = `${save.found.length} / ${COLLECTION.length}`;
  for (const c of COLLECTION) {
    const found = save.found.includes(c.id);
    const d = document.createElement('div');
    d.className = `find${found ? '' : ' missing'}`;
    d.innerHTML = `<span class="ico-px" style="background-image:url(${iconUrl(c.id, !found)})"></span><b></b><p></p>`;
    d.querySelector('b').textContent = found ? c.name : '???';
    d.querySelector('p').textContent = found ? c.fact : `Hint: ${c.hint}`;
    gridEl.appendChild(d);
  }
}

function renderGallery() {
  const gridEl = $('gallery-grid');
  gridEl.innerHTML = '';
  $('gallery-count').textContent = `${save.gallery.length} / ${MAX_GALLERY}`;
  $('gallery-empty').classList.toggle('hidden', save.gallery.length > 0);
  for (const e of save.gallery) {
    const cells = decodeCells(e.data, e.w, e.h);
    if (!cells) continue;
    const card = document.createElement('div');
    card.className = 'shot';
    const pic = thumbnail({ ...cells, w: e.w, h: e.h }, theme());
    pic.style.setProperty('--ratio', String(e.w / e.h));
    pic.setAttribute('role', 'img');
    pic.setAttribute('aria-label', e.name);
    card.appendChild(pic);
    const name = document.createElement('b');
    name.textContent = e.name;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = e.at ? new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    const row = document.createElement('div');
    row.className = 'row';
    const open = document.createElement('button');
    open.className = 'btn small primary';
    open.textContent = '▶ Play in it';
    open.addEventListener('click', () => {
      log.event('scene.loaded', { cells: e.w * e.h });
      startFree({ ...cells, w: e.w, h: e.h });
    });
    const del = document.createElement('button');
    del.className = 'btn small';
    del.textContent = '🗑 Delete';
    del.addEventListener('click', () => ask('Delete this garden?', `“${e.name}” will be gone for good.`, 'Delete', () => {
      removeFromGallery(save, e.id);
      persist();
      renderGallery();
      show('screen-gallery');
    }, 'screen-gallery'));
    row.append(open, del);
    card.append(name, meta, row);
    gridEl.appendChild(card);
  }
}

function showIntro() {
  const { goal, prompt } = session;
  if (goal) {
    $('intro-icon').style.backgroundImage = `url(${iconUrl(goal.icon)})`;
    $('intro-kicker').textContent = `Goal ${GOALS.indexOf(goal) + 1} of ${GOALS.length}`;
    $('intro-title').textContent = goal.title;
    $('intro-text').textContent = goal.text;
    $('intro-tip').textContent = `Tip: ${goal.tip}`;
    $('intro-reward').textContent = save.goals[goal.id] ? `✓ Done before · ${goal.reward.name}` : `🎁 ${rewardLine(goal.reward)}`;
  } else {
    $('intro-icon').style.backgroundImage = `url(${iconUrl('sprout')})`;
    $('intro-kicker').textContent = `Today's prompt · ${keyLabel(today)}`;
    $('intro-title').textContent = prompt.title;
    $('intro-text').textContent = prompt.text;
    const streak = liveStreak(save, today);
    $('intro-tip').textContent = dailyDone(save, today) ? 'Done today! Play again just for fun.' : streak > 0 ? `🌱 ${streak}-day streak. Keep it growing!` : 'A new prompt every day.';
    $('intro-reward').textContent = save.daily.best > 0 ? `Best streak: ${save.daily.best}` : '';
  }
  show('screen-intro');
}

function refreshPause() {
  const sky = SKIES.find((s) => s.id === theme());
  const skies = SKIES.filter((s) => canSky(s.id));
  $('btn-theme').textContent = `🌅 Sky: ${sky.name}`;
  $('btn-theme').classList.toggle('hidden', skies.length < 2);
  $('btn-rainbow').classList.toggle('hidden', !canRainbow());
  $('btn-rainbow').textContent = `🌈 Rainbow: ${save.rainbow ? 'on' : 'off'}`;
  updateSoundButtons();
}

function cycleTheme() {
  const skies = SKIES.filter((s) => canSky(s.id));
  const i = skies.findIndex((s) => s.id === theme());
  save.sky = skies[(i + 1) % skies.length].id;
  persist();
  refreshPause();
}

// ------------------------------------------------------------ confirm

let confirmYes = null;
function ask(text, sub, yesLabel, onYes, back = null) {
  confirmBack = back;
  confirmYes = onYes;
  $('confirm-text').textContent = text;
  $('confirm-sub').textContent = sub;
  $('btn-confirm-yes').textContent = yesLabel;
  show('screen-confirm');
}
function answerConfirm(yes) {
  const back = confirmBack;
  const fn = confirmYes;
  confirmYes = null;
  show(back);
  if (yes && fn) fn();
}

// ------------------------------------------------------------ the tray

// Elements unlocked this visit wear a NEW badge until they are first picked.
const fresh = new Set();

function buildPalette() {
  const pal = $('palette');
  pal.innerHTML = '';
  const have = available();
  const own = unlockedElements(save);
  for (const p of PALETTE) {
    const open = have.has(p.id);
    const b = document.createElement('button');
    b.className = `swatch${open ? '' : ' locked'}${open && !own.has(p.id) ? ' lent' : ''}${fresh.has(p.id) ? ' fresh' : ''}`;
    b.setAttribute('role', 'radio');
    b.dataset.id = p.id;
    b.title = open ? `${p.name} (${p.key.toUpperCase()})` : `${p.name}: locked`;
    b.setAttribute('aria-label', open ? p.name : `${p.name}, locked`);
    b.innerHTML = `<span class="key">${p.key.toUpperCase()}</span><span class="px" style="background-image:url(${iconUrl(p.id, !open)})"></span><b>${open ? p.name : '???'}</b>`;
    b.addEventListener('click', (e) => {
      if (e.detail > 0) b.blur();
      pickElement(p.id);
    });
    pal.appendChild(b);
  }
  updateTray();
  requestAnimationFrame(paletteFade);
}

function paletteFade() {
  const pal = $('palette');
  const side = app.classList.contains('side');
  const pos = side ? pal.scrollTop : pal.scrollLeft;
  const size = side ? pal.clientHeight : pal.clientWidth;
  const full = side ? pal.scrollHeight : pal.scrollWidth;
  pal.classList.toggle('more-start', pos > 2);
  pal.classList.toggle('more-end', pos + size < full - 2);
}
$('palette').addEventListener('scroll', paletteFade, { passive: true });

function pickElement(id) {
  const p = PALETTE_BY_ID[id];
  if (!p) return;
  if (!available().has(id)) {
    const g = unlockGoal('element', id);
    toast(g ? `Finish “${g.title}” to unlock ${p.name}` : `${p.name} is locked`, id);
    sound.nope();
    return;
  }
  brush.element = id;
  brush.erasing = false;
  if (fresh.delete(id)) $('palette').querySelector(`[data-id="${id}"]`)?.classList.remove('fresh');
  rememberBrush();
  sound.tap();
  updateTray();
  $('palette').querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function rememberBrush() {
  save.brush = { size: brush.size, shape: brush.shape, element: brush.erasing ? 'eraser' : brush.element };
  persist();
}

function updateTray() {
  for (const b of $('palette').children) {
    const on = !brush.erasing && b.dataset.id === brush.element;
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
  $('tool-eraser').setAttribute('aria-pressed', brush.erasing ? 'true' : 'false');
  const d = 6 + brush.size * 3.6;
  $('tool-size').querySelector('i').style.setProperty('--d', `${d}px`);
  $('size-label').textContent = `Size ${brush.size + 1}`;
  const shape = BRUSHES.find((x) => x.id === brush.shape) || BRUSHES[0];
  $('brush-label').textContent = shape.name;
  $('brush-ico').textContent = shape.id === 'spray' ? '💦' : shape.id === 'line' ? '📏' : '🖌️';
  $('tool-eraser').querySelector('.ico-px').style.backgroundImage = `url(${iconUrl('eraser')})`;
}

function changeSize(dir) {
  brush.size = Math.max(0, Math.min(BRUSH_SIZES.length - 1, brush.size + dir));
  rememberBrush();
  updateTray();
}

function cycleSize() {
  brush.size = (brush.size + 1) % BRUSH_SIZES.length;
  rememberBrush();
  updateTray();
  sound.tap();
}

function cycleBrush() {
  const open = BRUSHES.filter((b) => canBrush(b.id));
  if (open.length < 2) {
    const g = unlockGoal('brush', 'spray');
    toast(`Finish “${g.title}” to unlock the Spray brush`, 'rain');
    sound.nope();
    return;
  }
  const i = open.findIndex((b) => b.id === brush.shape);
  brush.shape = open[(i + 1) % open.length].id;
  rememberBrush();
  updateTray();
  sound.tap();
  toast(`${open[(i + 1) % open.length].name} brush`);
}

function toggleEraser() {
  brush.erasing = !brush.erasing;
  rememberBrush();
  updateTray();
  sound.tap();
}

function updateUndo() {
  $('tool-undo').disabled = undo.length === 0;
}

function pushUndo() {
  undo.push(world.snapshot());
  if (undo.length > 10) undo.shift();
  updateUndo();
}

function undoOnce() {
  const snap = undo.pop();
  updateUndo();
  if (!snap) return;
  world.restore(snap);
  sound.undo();
  log.event('undo.used', { left: undo.length });
}

function clearGarden() {
  ask('Clear the whole garden?', 'Everything goes. You can bring it back with ↶ Undo.', 'Clear it', () => {
    pushUndo();
    world.clear();
    sound.clear();
    log.event('garden.cleared', { mode: session.kind });
  }, null);
}

function saveToGallery() {
  const enc = encodeWorld(world);
  const name = session.goal ? session.goal.title : session.prompt ? session.prompt.title : 'My garden';
  const id = `g${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const res = enc.data.length > MAX_SCENE_CHARS ? 'big' : addToGallery(save, { id, name, ...enc, at: Date.now() });
  if (res === 'ok') {
    persist();
    sound.save();
    renderer.sparkle(world.w / 2, world.h / 2, '#ffffff', 10);
    toast('Saved to your gallery!', 'flower');
    log.event('scene.saved', { chars: enc.data.length, cells: world.n, count: save.gallery.length });
  } else if (res === 'full') {
    sound.nope();
    toast(`Your gallery is full (${MAX_GALLERY}). Delete one to save another.`);
    log.event('gallery.full', {});
  } else {
    sound.nope();
    toast('This garden is too detailed to save. Clear a little and try again.');
  }
}

function autosaveGarden() {
  if (session.kind !== 'free' || !world || demo) return;
  const enc = encodeWorld(world);
  if (enc.data.length > MAX_SCENE_CHARS) return;
  save.garden = { ...enc, at: Date.now() };
  persist();
}

// ------------------------------------------------------------ painting

function cellAt(e) {
  const r = canvas.getBoundingClientRect();
  return toCell(e.clientX - r.left, e.clientY - r.top, grid);
}

const radius = () => BRUSH_SIZES[brush.size];

// Paint from one cell to another with the current tool.
function stamp(x0, y0, x1, y1, pour = false) {
  if (!world) return;
  const r = radius();
  if (brush.erasing) {
    world.line(x0, y0, x1, y1, r, EMPTY);
    if (!pour) sound.paint('eraser');
    return;
  }
  const p = PALETTE_BY_ID[brush.element];
  if (p.id === 'fish') {
    if (world.tick - (stroke?.fishAt ?? -99) >= 14 && world.addFish(x1, y1)) {
      if (stroke) stroke.fishAt = world.tick;
      sound.paint('fish');
    }
    return;
  }
  const over = OVER[p.id];
  if (brush.shape === 'spray') {
    const sr = r * 2 + 3;
    const count = Math.max(1, Math.round((r + 2) * (p.density < 0.1 ? 0.4 : 1.2)));
    world.spray(x1, y1, sr, p.el, count, over);
  } else {
    world.line(x0, y0, x1, y1, r, p.el, p.density, over);
  }
  sound.paint(p.id);
}

canvas.addEventListener('pointerdown', (e) => {
  if (screen !== null || !isPlay() || !world || stroke) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  sound.unlock();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
  const [x, y] = cellAt(e);
  pointer.mode = e.pointerType;
  pointer.x = x;
  pointer.y = y;
  pointer.inside = true;
  kbd.active = false;
  pushUndo();
  stroke = { id: e.pointerId, x, y, sx: x, sy: y, fishAt: -99, type: e.pointerType };
  if (brush.shape !== 'line' || brush.erasing) stamp(x, y, x, y);
});

canvas.addEventListener('pointermove', (e) => {
  if (!grid) return;
  const [x, y] = cellAt(e);
  if (e.pointerType === 'mouse') { pointer.idle = 0; pointer.mode = 'mouse'; }
  pointer.x = x;
  pointer.y = y;
  pointer.inside = true;
  if (!stroke || e.pointerId !== stroke.id) return;
  if (brush.shape !== 'line' || brush.erasing) stamp(stroke.x, stroke.y, x, y);
  stroke.x = x;
  stroke.y = y;
});

function endStroke(e) {
  if (!stroke || (e && e.pointerId !== stroke.id)) return;
  if (brush.shape === 'line' && !brush.erasing && world) {
    const p = PALETTE_BY_ID[brush.element];
    if (p.id !== 'fish') world.line(stroke.sx, stroke.sy, stroke.x, stroke.y, radius(), p.el, 1, OVER[p.id]);
    sound.paint(p.id);
  }
  stroke = null;
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('lostpointercapture', endStroke);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') pointer.inside = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// Painting must never scroll or zoom the page.
for (const type of ['touchstart', 'touchmove', 'gesturestart', 'dblclick']) {
  stage.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// Holding still keeps pouring.
function pour() {
  if (!stroke) return;
  if (brush.shape === 'line' && !brush.erasing) return;
  stamp(stroke.x, stroke.y, stroke.x, stroke.y, true);
}

// ------------------------------------------------------------ goals and finds

function progressText(p) {
  if (session.done) return '✓ Done!';
  if (!p) return '';
  if (p.label === 'Waiting for night') return '🌙 Waiting for night';
  return `${p.label} ${p.have}/${p.need}`;
}

function updateChip() {
  const chip = $('goal-chip');
  const show2 = session.kind === 'goal' || session.kind === 'daily';
  chip.classList.toggle('hidden', !show2);
  if (!show2) return;
  const icon = session.goal ? session.goal.icon : 'sprout';
  $('goal-icon').style.backgroundImage = `url(${iconUrl(icon)})`;
  $('goal-title').textContent = session.goal ? session.goal.title : `Today: ${session.prompt.title}`;
  $('goal-progress').textContent = progressText(session.progress);
  chip.classList.toggle('done', !!session.done);
}

function checkGoal() {
  if (session.done || (session.kind !== 'goal' && session.kind !== 'daily')) return;
  const p = session.goal ? session.goal.check(world) : session.prompt.check(world);
  const changed = !session.progress || session.progress.have !== p.have || session.progress.label !== p.label;
  session.progress = p;
  if (p.done) completeSession();
  else if (changed) updateChip();
}

function completeSession() {
  session.done = true;
  const secs = Math.round((performance.now() - session.startedAt) / 1000);
  if (session.goal) {
    const first = recordGoal(save, session.goal.id);
    persist();
    session.firstClear = first;
    log.event('level.complete', { mode: 'goal', goal: session.goal.id, first, seconds: secs, steps: session.steps });
    if (first && session.goal.reward.type === 'element') fresh.add(session.goal.reward.id);
    if (first) buildPalette();
  } else {
    const streak = recordDaily(save, today);
    persist();
    session.streak = streak;
    log.event('level.complete', { mode: 'daily', template: session.prompt.template, seconds: secs, steps: session.steps });
    if (streak !== null) log.event('daily.complete', { streak, best: save.daily.best });
  }
  updateChip();
  sound.fanfare();
  renderer.confetti();
  session.cardAt = performance.now() + (reduced ? 600 : 1500);
}

function showComplete() {
  const s = session;
  const reward = $('complete-reward');
  if (s.goal) {
    $('complete-kicker').textContent = 'Goal complete!';
    $('complete-title').textContent = s.goal.title;
    const r = s.goal.reward;
    reward.classList.toggle('hidden', false);
    $('reward-icon').style.backgroundImage = `url(${iconUrl(r.icon)})`;
    $('reward-name').textContent = s.firstClear ? rewardLine(r) : `${r.name} (yours already)`;
    $('reward-text').textContent = r.text;
    const next = nextGoal(save.goals);
    $('btn-next').classList.toggle('hidden', !next);
    $('complete-text').textContent = next ? `Up next: ${next.title}` : 'Every goal done! Your garden is all yours.';
  } else {
    $('complete-kicker').textContent = "Today's prompt done!";
    $('complete-title').textContent = s.prompt.title;
    reward.classList.add('hidden');
    $('btn-next').classList.add('hidden');
    const streak = liveStreak(save, today);
    $('complete-text').textContent = streak > 1 ? `🌱 ${streak} days in a row! See you tomorrow.` : '🌱 Come back tomorrow for a new one.';
  }
  // Mashing should not skip the card: its buttons wake after a moment.
  const buttons = $('screen-complete').querySelectorAll('button');
  for (const b of buttons) b.disabled = true;
  show('screen-complete');
  setTimeout(() => {
    for (const b of buttons) b.disabled = false;
    if (screen === 'screen-complete') $('btn-keep').focus({ preventScroll: true });
  }, 700);
  if (demo) setTimeout(() => { if (screen === 'screen-complete') nextFromComplete(); }, 2600);
}

function keepPlaying() {
  if (performance.now() - shownAt < 700) return;
  show(null);
}

function nextFromComplete() {
  const next = nextGoal(save.goals) || (demo ? GOALS[(GOALS.indexOf(session.goal) + 1) % GOALS.length] : null);
  if (next) startGoal(next);
  if (demo) setTimeout(() => { if (screen === 'screen-intro') show(null); }, 1200);
}

function checkFinds() {
  if (!isPlay()) return;
  for (const id of findsIn(world)) {
    if (!recordFound(save, id)) continue;
    persist();
    log.event('discovery.found', { id });
    if (!BASE_ELEMENTS.includes(id)) {
      const c = COLLECTION.find((x) => x.id === id);
      toast(`New find: ${c.name}!`, id);
      sound.discover();
    }
  }
}

// ------------------------------------------------------------ sound

function updateSoundButtons() {
  const label = save.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = label;
  const m = $('btn-mute');
  m.textContent = save.muted ? '🔇' : '🔊';
  m.setAttribute('aria-label', save.muted ? 'Unmute' : 'Mute');
}

function toggleMute() {
  save.muted = !save.muted;
  sound.unlock();
  sound.setMuted(save.muted);
  persist();
  updateSoundButtons();
}

function updateSkyButton() {
  if (!world) return;
  const night = world.warp ? isNight(world.warp.to) : isNight(world.time);
  const b = $('btn-sky');
  b.textContent = night ? '☀️' : '🌙';
  b.setAttribute('aria-label', night ? 'Make it day' : 'Make it night');
}

function toggleSky() {
  if (!world) return;
  const night = world.warp ? isNight(world.warp.to) : isNight(world.time);
  world.skipTo(night ? MORNING : 0.66);
  sound.tap();
  updateSkyButton();
}

// HUD buttons answer touch on pointerdown, so a second finger works while
// the first is painting; the click that follows is ignored. Mouse and
// keyboard use click, and a mouse click hands focus back to the garden.
function hudButton(el, fn) {
  let touchAt = -Infinity;
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    touchAt = performance.now();
    sound.unlock();
    fn();
  });
  el.addEventListener('click', (e) => {
    if (performance.now() - touchAt < 800) return;
    sound.unlock();
    fn();
    if (e.detail) el.blur();
  });
  el.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') el.blur(); });
}

// ------------------------------------------------------------ wiring

hudButton($('btn-mute'), toggleMute);
hudButton($('btn-pause'), pause);
hudButton($('btn-sky'), toggleSky);
const trayButton = (id, fn) => $(id).addEventListener('click', (e) => { fn(); if (e.detail > 0) e.currentTarget.blur(); });
trayButton('tool-eraser', toggleEraser);
trayButton('tool-size', cycleSize);
trayButton('tool-brush', cycleBrush);
trayButton('tool-undo', undoOnce);
trayButton('tool-save', saveToGallery);
trayButton('tool-clear', clearGarden);

$('btn-play').addEventListener('click', play);
$('btn-free').addEventListener('click', () => { sound.unlock(); startFree(); });
$('btn-daily').addEventListener('click', () => { sound.unlock(); startDaily(); });
$('btn-goals').addEventListener('click', () => openMenu('screen-goals', 'title'));
$('btn-gallery').addEventListener('click', () => openMenu('screen-gallery', 'title'));
$('btn-collection').addEventListener('click', () => openMenu('screen-collection', 'title'));
$('btn-go').addEventListener('click', () => { sound.unlock(); show(null); });
$('btn-resume').addEventListener('click', resume);
$('btn-pause-goals').addEventListener('click', () => openMenu('screen-goals', 'pause'));
$('btn-pause-gallery').addEventListener('click', () => openMenu('screen-gallery', 'pause'));
$('btn-pause-finds').addEventListener('click', () => openMenu('screen-collection', 'pause'));
$('btn-pause-title').addEventListener('click', toTitle);
$('btn-theme').addEventListener('click', cycleTheme);
$('btn-rainbow').addEventListener('click', () => { save.rainbow = !save.rainbow; persist(); refreshPause(); });
$('btn-keep').addEventListener('click', keepPlaying);
$('btn-next').addEventListener('click', nextFromComplete);
$('btn-complete-goals').addEventListener('click', () => openMenu('screen-goals', 'pause'));
$('btn-confirm-yes').addEventListener('click', () => answerConfirm(true));
$('btn-confirm-no').addEventListener('click', () => answerConfirm(false));
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', goBack);
for (const el of document.querySelectorAll('button')) el.addEventListener('pointerdown', () => sound.unlock(), { passive: true });

// Arrow keys move focus between buttons in menus.
function moveFocus(dir) {
  const el = screen && $(screen);
  if (!el) return;
  const items = [...el.querySelectorAll('button:not([disabled]), a[href]')].filter((x) => x.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
}

const KEY_TO_ELEMENT = Object.fromEntries(PALETTE.map((p) => [p.key, p.id]));

addEventListener('keydown', (e) => {
  sound.unlock();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screen === null && isPlay()) pause();
    else if (screen === 'screen-pause') resume();
    else if (e.code === 'Escape' && screen && screen !== 'screen-title') goBack();
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (screen !== null) {
    if (['ArrowRight', 'ArrowDown'].includes(e.code)) { e.preventDefault(); moveFocus(1); }
    if (['ArrowLeft', 'ArrowUp'].includes(e.code)) { e.preventDefault(); moveFocus(-1); }
    return;
  }
  if (!isPlay() || (e.metaKey && e.code !== 'KeyZ') || e.altKey) return;
  const focusedButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
  const key = e.key.toLowerCase();
  if (KEY_TO_ELEMENT[key] && !e.ctrlKey && !e.metaKey) { pickElement(KEY_TO_ELEMENT[key]); return; }
  switch (e.code) {
    case 'KeyE': toggleEraser(); return;
    case 'BracketLeft': changeSize(-1); return;
    case 'BracketRight': changeSize(1); return;
    case 'KeyB': cycleBrush(); return;
    case 'KeyZ': e.preventDefault(); undoOnce(); return;
    case 'KeyT': toggleSky(); return;
    default: break;
  }
  const moves = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
  if (moves[e.code] && !(focusedButton && e.code.startsWith('Arrow'))) {
    e.preventDefault();
    const step = Math.max(1, radius());
    const [dx, dy] = moves[e.code];
    const nx = Math.max(0, Math.min(grid.w - 1, kbd.x + dx * step));
    const ny = Math.max(0, Math.min(grid.h - 1, kbd.y + dy * step));
    kbd.active = true;
    pointer.mode = 'keyboard';
    if (stroke && stroke.id === 'kbd') {
      if (brush.shape !== 'line' || brush.erasing) stamp(kbd.x, kbd.y, nx, ny);
      stroke.x = nx;
      stroke.y = ny;
    }
    kbd.x = nx;
    kbd.y = ny;
    return;
  }
  if ((e.code === 'Space' || e.code === 'Enter') && !focusedButton) {
    e.preventDefault();
    if (e.repeat || stroke) return;
    kbd.active = true;
    pointer.mode = 'keyboard';
    pushUndo();
    stroke = { id: 'kbd', x: kbd.x, y: kbd.y, sx: kbd.x, sy: kbd.y, fishAt: -99, type: 'keyboard' };
    if (brush.shape !== 'line' || brush.erasing) stamp(kbd.x, kbd.y, kbd.x, kbd.y);
  }
});
addEventListener('keyup', (e) => {
  if ((e.code === 'Space' || e.code === 'Enter') && stroke && stroke.id === 'kbd') endStroke({ pointerId: 'kbd' });
});

addEventListener('mousemove', () => { pointer.idle = 0; });
addEventListener('blur', () => endStroke());
addEventListener('resize', onResize);
addEventListener('orientationchange', () => setTimeout(onResize, 150));
new ResizeObserver(() => onResize()).observe(stage);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    endStroke();
    if (screen === null && isPlay()) pause();
    autosaveGarden();
  }
  sound.setActive(!document.hidden && (screen === null || screen === 'screen-title' || screen === 'screen-complete'));
  monitor.reset(performance.now());
});
addEventListener('pagehide', autosaveGarden);

// Another tab saved: fold its progress in, so this tab never writes a stale
// copy over it.
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY || !e.newValue) return;
  let theirs;
  try { theirs = JSON.parse(e.newValue); } catch { return; }
  save = mergeSave(save, theirs);
  sound.setMuted(save.muted);
  updateSoundButtons();
  if (isPlay()) { buildPalette(); updateChip(); }
  if (screen === 'screen-title') refreshTitle();
  if (screen === 'screen-gallery') renderGallery();
  if (screen === 'screen-goals') renderGoals();
  if (screen === 'screen-collection') renderFinds();
});

// ------------------------------------------------------------ loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ screen: screen || 'play', mode: session.kind, goal: session.goal?.id || session.prompt?.template || '', cells: world ? world.n : 0 }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);

// Bake the tray and collection icons a few per frame while the title is up,
// so opening a garden or a menu never stalls on them.
const iconQueue = [...new Set([...PALETTE.map((p) => p.id), ...COLLECTION.map((c) => c.id), 'eraser', 'rain'])].flatMap((id) => [[id, false], [id, true]]);
function warmIcons() {
  for (let k = 0; k < 3 && iconQueue.length; k++) iconUrl(...iconQueue.shift());
}

let lastSkyTop = '';
let autosaveAt = 0;
let effectAt = 0;

// Sound and sparkles from what happened in the garden since last frame.
function handleFx(now) {
  const fx = world.fx;
  const playing = isPlay();
  if (playing && now > effectAt) {
    if (fx.bloom) { sound.bloom(); effectAt = now + 120; } else if (fx.sprout) { sound.sprout(); effectAt = now + 90; } else if (fx.hiss) { sound.hiss(); effectAt = now + 260; } else if (fx.splash) { sound.splash(); effectAt = now + 200; } else if (fx.rain && Math.random() < 0.3) { sound.drip(); effectAt = now + 80; }
  }
  const c = world.counts;
  sound.update({
    water: Math.min(1, fx.flow / 250),
    lava: Math.min(1, (c[LAVA] + c[FIRE] * 4) / 600),
    night: world.time > 0.6 && world.time < 0.96 ? 1 : 0,
    life: c[TIP] + c[FLOWER] + c[LEAF] + c[STEM] > 0 ? 1 : 0,
  });
  for (const p of world.pops) renderer.sparkle(p.x, p.y, SPARK[p.kind] || '#ffffff', playing ? 6 : 3);
  world.pops.length = 0;
  for (const k of Object.keys(fx)) fx[k] = 0;
}

function view() {
  const playing = screen === null && isPlay();
  let cursor = null;
  const pal = PALETTE_BY_ID[brush.element];
  if (playing) {
    const r = radius();
    const useKbd = kbd.active && pointer.mode === 'keyboard';
    const x = useKbd ? kbd.x : (stroke ? stroke.x : pointer.x);
    const y = useKbd ? kbd.y : (stroke ? stroke.y : pointer.y);
    const visible = useKbd || (pointer.mode === 'mouse' && pointer.inside && pointer.idle < 2) || (stroke && stroke.type !== 'mouse');
    cursor = {
      x, y, r: brush.shape === 'spray' && !brush.erasing ? r * 2 + 3 : r, visible, erase: brush.erasing, spray: brush.shape === 'spray' && !brush.erasing,
      line: stroke && brush.shape === 'line' && !brush.erasing && pal.id !== 'fish' ? [stroke.sx, stroke.sy] : null,
    };
  }
  return { theme: theme(), rainbow: save.rainbow && canRainbow(), cursor };
}

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (crashNext) { crashNext = false; throw new Error('Pixel Pond test crash'); }

  // Hide the pointer after a moment without mouse movement during play.
  pointer.idle += dt;
  document.body.classList.toggle('no-cursor', screen === null && isPlay() && pointer.idle > 2);

  const running = world && (session.kind === 'title' ? !document.hidden : screen === null || screen === 'screen-complete');
  if (running) {
    accumulator += dt;
    let steps = 0;
    const budget = session.kind === 'title' && fastForward > 0 ? 4 : 2;
    if (budget > 2) { fastForward--; accumulator = Math.max(accumulator, STEP * 4); }
    while (accumulator >= STEP && steps < budget) {
      if (session.pilot) session.pilot.act(world);
      if (stroke && screen === null) pour();
      world.step();
      steps++;
      if (isPlay()) {
        session.steps++;
        if (world.tick % 15 === 0) checkGoal();
        if (world.tick % 30 === 0) checkFinds();
      }
      accumulator -= STEP;
    }
    if (accumulator > STEP * 2) accumulator = 0; // a slow device runs the garden slower, never in bursts
    handleFx(now);
    if (world.tick % 20 === 0) updateSkyButton();
  } else {
    accumulator = 0;
  }
  if (isPlay() && session.cardAt && now > session.cardAt && screen === null) {
    session.cardAt = 0;
    showComplete();
  }
  if (session.kind === 'free' && screen === null && now > autosaveAt) {
    if (autosaveAt) autosaveGarden();
    autosaveAt = now + 20000;
  }
  if (iconQueue.length) warmIcons();
  renderer.update(dt);
  if (world) {
    renderer.draw(world, view());
    const [top] = renderer.skyColours(world.time, theme());
    const css = `rgb(${top.map(Math.round).join(',')})`;
    if (css !== lastSkyTop) { lastSkyTop = css; stage.style.setProperty('--sky-top', css); }
  }
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture;
// after a crash the guard returns early, so the loop stops rescheduling.
const loop = telemetry ? telemetry.guard(frame, 'pixel-pond.frame') : frame;

if (location.protocol !== 'file:') {
  showTray(false);
  layout();
  startAttract();
  updateSoundButtons();
  log.event('game.ready', { goals: goalsDone(save), found: save.found.length, streak: liveStreak(save, today), gallery: save.gallery.length, cells: world.n });
  const goalParam = params.get('goal');
  if (goalParam && GOAL_BY_ID[goalParam]) startGoal(GOAL_BY_ID[goalParam]);
  else if (params.has('daily')) startDaily();
  else if (params.has('free')) startFree();
  else if (demo) startGoal(GOALS[0]);
  else { refreshTitle(); show('screen-title'); }
  if (demo && screen === 'screen-intro') setTimeout(() => { if (screen === 'screen-intro') show(null); }, 1200);
  requestAnimationFrame(loop);
}

// A handle for browser checks and debugging.
window.PixelPond = {
  get world() { return world; },
  get screen() { return screen; },
  get session() { return session; },
  get grid() { return grid; },
  get save() { return save; },
  get brush() { return brush; },
  startGoal: (id) => startGoal(GOAL_BY_ID[id]),
  startFree,
  startDaily,
  toTitle,
  crash() { crashNext = true; },
};
