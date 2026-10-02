// Screens, input and the frame loop for Tiny Trains.
import { LEVELS, LEVEL_COUNT, WORLDS, getLevel, worldLevels } from './levels.js';
import { parseLevel, rotateLevel } from './board.js';
import { simulate, wrapTime, starsFor } from './sim.js';
import { Editor, cellsBetween } from './editor.js';
import { View } from './render.js';
import { THEME_ORDER, drawShedThumb, drawPiece, drawScenery, drawDepot, drawStation, drawPaintShed } from './art.js';
import { Audio } from './audio.js';
import {
  loadSave, writeSave, totalStars, recordLevel, isLevelOpen, claimSkins, dateKey, currentStreak, recordDaily, furthestSolved,
} from './save.js';
import { SKINS, skinByKey, isUnlocked, ruleText } from './skins.js';
import { titleScene, sandboxBoard, packSandbox, refreshTrains } from './demo.js';
import { generateDaily } from './daily.js';
import { COLORS, COLOR_HEX, COLOR_LABEL, DX, DY } from './pieces.js';
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
if (params.has('unlock')) for (const l of LEVELS) save.levels[l.id] ||= { stars: 0, best: 99 };
let saveWarned = false;
function persist() {
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const audio = new Audio({ sound: save.sound, music: save.music });
const canvas = $('stage');
const view = new View(canvas, { reduceMotion });
view.setSkin(save.skin);

// --------------------------------------------------------------- state

let mode = 'title'; // title | map | shed | daily | intro | play | pause | results
let play = null;    // the level being played (see startPlay)
let speed = save.fast ? 2 : 1;
let toastTimer = 0;
let forceCrash = false;
const TICK_SECONDS = 0.5;

const SCREENS = {
  title: 'screen-title', map: 'screen-map', shed: 'screen-shed', daily: 'screen-daily',
  intro: 'screen-intro', pause: 'screen-pause', results: 'screen-results',
};
function show(next) {
  mode = next;
  for (const [key, id] of Object.entries(SCREENS)) $(id).classList.toggle('hidden', key !== next);
  const inPlay = ['play', 'pause', 'intro', 'results'].includes(next);
  $('hud').classList.toggle('hidden', !inPlay);
  $('bar').classList.toggle('hidden', !(next === 'play' || next === 'pause'));
  $('screen-fail').classList.toggle('hidden', !(next === 'play' && play && play.phase === 'fail'));
  if (next !== 'play') document.body.classList.remove('no-cursor');
  if (next !== 'play') view.ghost = null;
  layout();
  focusFirst();
}

function focusFirst() {
  const id = SCREENS[mode];
  if (!id) return;
  const el = $(id).querySelector('.btn.primary, .btn, .lvl:not(.locked), .skin');
  if (el && !coarse) el.focus({ preventScroll: true });
}

function setTheme(key) {
  document.body.dataset.theme = key;
  const colors = { meadow: '#bfe9ff', creek: '#bde6ff', farm: '#ffe8bf', peaks: '#cfe3ff', town: '#ffd9e6', night: '#141a3d' };
  document.querySelector('meta[name="theme-color"]').setAttribute('content', colors[key] || '#bfe9ff');
}

const sideways = matchMedia('(orientation: landscape) and (max-height: 500px)');
function insets() {
  if (mode === 'title') {
    const card = document.querySelector('.title-card');
    const cw = card ? card.offsetWidth : 440, ch = card ? card.offsetHeight : 560;
    if (innerWidth > 900) return { top: 20, bottom: 20, left: cw + Math.max(28, innerWidth * 0.04) + 16, right: 16 };
    return { top: 60, bottom: ch + 24, left: 8, right: 8 };
  }
  if (mode === 'map' || mode === 'shed' || mode === 'daily') return { top: 10, bottom: 10, left: 10, right: 10 };
  if (sideways.matches) {
    if (mode === 'results') {
      const card = document.querySelector('.results-card');
      return { top: 8, bottom: 8, left: 200, right: (card ? card.offsetWidth : 320) + 100 };
    }
    return { top: 8, bottom: 8, left: 204, right: 92 + (play && play.colorTool ? 56 : 0) };
  }
  const phone = innerWidth < 560;
  const hud = phone ? 108 : 96;
  const bar = phone ? 82 : 92;
  if (mode === 'results') {
    const card = document.querySelector('.results-card');
    return { top: hud, bottom: (card ? card.offsetHeight : 240) + 30, left: 8, right: 8 };
  }
  return { top: hud, bottom: bar + (play && play.kind === 'sandbox' && play.colorTool ? 56 : 0), left: 8, right: 8 };
}

function layout() {
  view.resize(innerWidth, innerHeight, insets());
}

function toast(text, seconds = 2.2) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  toastTimer = seconds;
}

function syncToggles() {
  for (const el of document.querySelectorAll('[data-sound]')) el.textContent = `Sound: ${save.sound ? 'on' : 'off'}`;
  for (const el of document.querySelectorAll('[data-music]')) el.textContent = `Music: ${save.music ? 'on' : 'off'}`;
  $('btn-sound').textContent = save.sound ? '🔊' : '🔇';
  $('btn-fast').classList.toggle('on', speed > 1);
}

function toggleSound() {
  save.sound = !save.sound;
  audio.unlock();
  audio.setSound(save.sound);
  persist();
  syncToggles();
}
function toggleMusic() {
  save.music = !save.music;
  audio.unlock();
  audio.setMusic(save.music);
  persist();
  syncToggles();
}

// --------------------------------------------------------------- title

let title = null;
function toTitle() {
  leavePlay();
  setTheme('meadow');
  audio.setWorld(0);
  title = titleScene();
  view.setScene({ board: title.board, theme: 'meadow', layout: title.layout });
  view.setRun(simulate(title.board, title.layout));
  view.dim = 0.12;
  show('title');
  queueMicrotask(() => monitor.mark(performance.now()));
  const stars = totalStars(save);
  const solved = Object.keys(save.levels).length;
  const next = nextLevelId();
  const streak = currentStreak(save, dateKey(new Date()));
  $('title-progress').textContent = solved
    ? `★ ${stars} of ${LEVEL_COUNT * 3} · ${solved} of ${LEVEL_COUNT} levels${streak ? ` · 🔥 ${streak}-day streak` : ''}`
    : `${LEVEL_COUNT} puzzles across ${WORLDS.length} worlds, plus a daily delivery`;
  $('btn-play').textContent = solved ? `Continue · level ${next}` : 'Play';
  const doneToday = save.daily.days[dateKey(new Date())] !== undefined;
  $('btn-daily').textContent = doneToday ? '📅 Daily ✓' : '📅 Daily · new!';
}

function nextLevelId() {
  for (const l of LEVELS) if (!save.levels[l.id] && isLevelOpen(save, l.id)) return l.id;
  return Math.min(LEVEL_COUNT, furthestSolved(save) + 1) || 1;
}

function leavePlay() {
  if (play && play.kind === 'level' && play.phase !== 'won' && mode !== 'title') {
    log.event('level.leave', { level: play.level.id, pieces: play.editor.count, runs: play.runs });
  }
  if (play && play.kind === 'sandbox') storeSandbox();
  play = null;
  view.hint = null;
  view.tutorial = null;
  view.selected = -1;
}

// ----------------------------------------------------------------- map

function toMap() {
  leavePlay();
  if (!title) title = titleScene();
  view.setScene({ board: title.board, theme: 'meadow', layout: title.layout });
  view.setRun(simulate(title.board, title.layout));
  view.dim = 0.3;
  setTheme('meadow');
  renderMap();
  show('map');
  const next = document.querySelector('.lvl.next');
  if (next) next.scrollIntoView({ block: 'center' });
}

function renderMap() {
  $('map-stars').textContent = `★ ${totalStars(save)} / ${LEVEL_COUNT * 3}`;
  const host = $('map-worlds');
  host.textContent = '';
  const nextId = nextLevelId();
  WORLDS.forEach((w, wi) => {
    const box = document.createElement('div');
    box.className = `world theme-${THEME_ORDER[wi]}`;
    const levels = worldLevels(wi);
    const stars = levels.reduce((n, l) => n + (save.levels[l.id] ? save.levels[l.id].stars : 0), 0);
    const h = document.createElement('h3');
    h.innerHTML = `<span>${w.icon} ${w.name}</span><small>★ ${stars} / ${levels.length * 3}</small>`;
    box.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'levels';
    for (const l of levels) {
      const b = document.createElement('button');
      const rec = save.levels[l.id];
      const open = isLevelOpen(save, l.id);
      b.className = `lvl${rec ? ' done' : ''}${open ? '' : ' locked'}${l.id === nextId && !rec ? ' next' : ''}`;
      b.innerHTML = `${open ? l.id : '🔒'}<small>${rec ? '★'.repeat(rec.stars) : ''}</small>`;
      b.title = open ? `${l.id}. ${l.name}` : 'Solve earlier levels to open this one';
      b.setAttribute('aria-label', open ? `Level ${l.id}, ${l.name}${rec ? `, ${rec.stars} stars` : ''}` : `Level ${l.id}, locked`);
      if (open) b.addEventListener('click', () => startLevel(l.id));
      grid.appendChild(b);
    }
    box.appendChild(grid);
    host.appendChild(box);
  });
}

// ---------------------------------------------------------------- shed

function progress() {
  return {
    stars: totalStars(save),
    worldsDone: WORLDS.map((_, wi) => wi).filter((wi) => worldLevels(wi).every((l) => save.levels[l.id])),
    dailies: save.daily.solved || 0,
    bestStreak: save.daily.bestStreak || 0,
    sandboxRuns: save.sandboxRuns || 0,
  };
}

function toShed() {
  leavePlay();
  setTheme('meadow');
  if (!title) title = titleScene();
  view.setScene({ board: title.board, theme: 'meadow', layout: title.layout });
  view.setRun(simulate(title.board, title.layout));
  view.dim = 0.3;
  renderShed();
  show('shed');
}

function renderShed() {
  const p = progress();
  const host = $('shed-grid');
  host.textContent = '';
  let have = 0;
  SKINS.forEach((skin, k) => {
    const open = isUnlocked(skin, p);
    if (open) have++;
    const b = document.createElement('button');
    b.className = `skin${save.skin === skin.key ? ' on' : ''}${open ? '' : ' locked'}`;
    const c = document.createElement('canvas');
    c.width = 300; c.height = 140;
    drawShedThumb(c, skin.key, COLORS[k % COLORS.length], !open);
    b.appendChild(c);
    const name = document.createElement('b');
    name.textContent = open ? skin.name : '???';
    const note = document.createElement('span');
    note.textContent = open ? (save.skin === skin.key ? 'Pulling your trains!' : skin.blurb) : ruleText(skin.rule, WORLDS.map((w) => w.name));
    b.append(name, note);
    b.setAttribute('aria-label', open ? `${skin.name}${save.skin === skin.key ? ', selected' : ''}` : `Locked: ${note.textContent}`);
    if (open) {
      b.addEventListener('click', () => {
        save.skin = skin.key;
        view.setSkin(skin.key);
        persist();
        audio.unlock();
        audio.toot(1.1);
        log.event('skin.equip', { skin: skin.key });
        renderShed();
      });
    }
    host.appendChild(b);
  });
  $('shed-count').textContent = `${have} / ${SKINS.length}`;
}

// --------------------------------------------------------------- daily

let worker = null;
let workerSeq = 0;
const pending = new Map();
function ask(msg) {
  return new Promise((resolve) => {
    const id = ++workerSeq;
    if (!worker) {
      try {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => { const cb = pending.get(e.data.id); pending.delete(e.data.id); if (cb) cb(e.data); };
        worker.onerror = (e) => { log.warn('worker.error', { message: String(e.message || 'worker') }); worker = false; for (const cb of pending.values()) cb(null); pending.clear(); };
      } catch { worker = false; }
    }
    if (worker) {
      pending.set(id, resolve);
      worker.postMessage({ ...msg, id });
    } else resolve(null);
  });
}

function toDaily() {
  leavePlay();
  setTheme('meadow');
  const today = dateKey(new Date());
  const d = new Date();
  $('daily-date').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const streak = currentStreak(save, today);
  $('daily-streak').textContent = streak ? `🔥 ${streak}-day streak` : 'Start a streak today!';
  const best = save.daily.days[today];
  $('daily-best').textContent = best !== undefined
    ? `Solved today with ${best} pieces. Try for fewer!`
    : `Best streak: ${save.daily.bestStreak || 0} · Deliveries made: ${save.daily.solved || 0}`;
  show('daily');
}

let dailyCache = null;
async function startDaily() {
  const today = dateKey(new Date());
  if (!dailyCache || dailyCache.date !== today) {
    $('btn-daily-go').textContent = 'Laying out the track…';
    $('btn-daily-go').disabled = true;
    const reply = await ask({ type: 'daily', date: today });
    dailyCache = reply && reply.level ? reply.level : generateDaily(today);
    $('btn-daily-go').textContent = "Lay today's track";
    $('btn-daily-go').disabled = false;
  }
  if (mode !== 'daily') return;
  startPlay({ kind: 'daily', level: dailyCache });
}

// ---------------------------------------------------------------- play

const TOOLSETS = {
  level: ['track', 'S', 'C', 'X', 'W', 'erase'],
  sandbox: ['track', 'S', 'C', 'X', 'W', 'depot', 'station', 'paint', 'tree', 'erase'],
};
const TOOL_NAMES = {
  track: 'Draw', S: 'Straight', C: 'Curve', X: 'Cross', W: 'Switch', erase: 'Erase',
  depot: 'Depot', station: 'Station', paint: 'Paint', tree: 'Tree',
};

function startLevel(id) {
  const level = getLevel(id);
  if (!level) return toMap();
  startPlay({ kind: 'level', level });
}

function startSandbox() {
  leavePlay();
  startPlay({ kind: 'sandbox' });
}

function startPlay({ kind, level }) {
  leavePlay();
  let board, layout = null, theme, raw = level;
  if (kind === 'sandbox') {
    const sb = sandboxBoard(save.sandbox);
    board = sb.board;
    layout = sb.layout;
    theme = 'meadow';
  } else {
    board = parseLevel(level);
    // Tall phone screens get wide levels turned upright: bigger squares.
    if (innerHeight > innerWidth * 1.15 && board.w > board.h) {
      raw = rotateLevel(level);
      board = parseLevel(raw);
    }
    theme = THEME_ORDER[level.world] || 'meadow';
  }
  const editor = new Editor(board, { layout, unlimited: kind === 'sandbox', undoBoard: kind === 'sandbox' });
  play = {
    kind, level, raw, board, editor, theme,
    phase: 'edit', run: null, runs: 0, tool: 'track', paint: 'red',
    hintOrder: null, hintAsked: false, startedAt: performance.now(), colorTool: false,
  };
  setTheme(theme);
  audio.setWorld(kind === 'level' ? level.world : 0);
  view.setScene({ board, theme, layout: editor.layout, skin: save.skin });
  view.dim = 0;
  view.cursor = firstBuildable();
  view.showCursor = false;
  buildTools();
  updateHud();
  if (kind === 'level' && level.id === 1) view.tutorial = tutorialPath(board);
  const world = kind === 'level' ? WORLDS[level.world] : null;
  const firstOfWorld = world && worldLevels(level.world)[0].id === level.id;
  if (firstOfWorld && !save.intros.includes(world.key)) showIntro(world);
  else show('play');
  if (kind !== 'sandbox') requestHint();
  log.event(kind === 'daily' ? 'daily.start' : kind === 'sandbox' ? 'sandbox.open' : 'level.start',
    kind === 'level' ? { level: level.id, world: level.world } : kind === 'daily' ? { date: level.date, par: level.par } : {});
  queueMicrotask(() => monitor.mark(performance.now()));
}

function showIntro(world) {
  $('intro-icon').textContent = world.icon;
  $('intro-title').textContent = world.intro.title;
  $('intro-text').textContent = world.intro.text;
  show('intro');
}

function dismissIntro() {
  if (mode !== 'intro') return;
  const world = WORLDS[play.level.world];
  if (!save.intros.includes(world.key)) save.intros.push(world.key);
  persist();
  show('play');
}

function tutorialPath(board) {
  const t = board.trains[0];
  const st = board.cells.findIndex((c) => c.k === 'station');
  if (!t || st < 0) return null;
  const cells = [t.depot];
  let i = t.depot;
  let guard = 20;
  while (i !== st && guard--) {
    const x = i % board.w, y = Math.floor(i / board.w);
    const tx = st % board.w, ty = Math.floor(st / board.w);
    i = x !== tx ? i + Math.sign(tx - x) : i + Math.sign(ty - y) * board.w;
    cells.push(i);
  }
  return cells;
}

function firstBuildable() {
  if (!play) return -1;
  const t = play.board.trains[0];
  if (t) {
    const j = t.depot + DX[t.dir] + DY[t.dir] * play.board.w;
    if (play.board.cells[j] && play.board.cells[j].k === 'grass') return j;
  }
  return play.board.cells.findIndex((c) => c.k === 'grass');
}

function toolIcon(tool) {
  const c = document.createElement('canvas');
  c.width = c.height = 80;
  const g = c.getContext('2d');
  const s = 80;
  if (tool === 'track') {
    drawPiece(g, s, { t: 'C', v: 1 });
    g.font = '900 34px ui-rounded, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('✏️', 26, 26);
  } else if (tool === 'S') drawPiece(g, s, { t: 'S', v: 1 });
  else if (tool === 'C') drawPiece(g, s, { t: 'C', v: 1 });
  else if (tool === 'X') drawPiece(g, s, { t: 'X', v: 0 });
  else if (tool === 'W') drawPiece(g, s, { t: 'W', v: 3 });
  else if (tool === 'depot') drawDepot(g, s, 1, [play.paint]);
  else if (tool === 'station') drawStation(g, s, { t: 'S', v: 1, color: play.paint });
  else if (tool === 'paint') drawPaintShed(g, s, { t: 'S', v: 1, color: play.paint });
  else if (tool === 'tree') drawScenery(g, s, 'tree', 3, 'meadow');
  else if (tool === 'erase') {
    g.font = '900 46px ui-rounded, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🧽', s / 2, s / 2 + 2);
  }
  return c;
}

function buildTools() {
  const host = $('tools');
  host.textContent = '';
  const set = TOOLSETS[play.kind === 'sandbox' ? 'sandbox' : 'level'];
  for (const tool of set) {
    if ((tool === 'X' || tool === 'W') && play.kind !== 'sandbox' && !(play.board.stock[tool] > 0)) continue;
    const b = document.createElement('button');
    b.className = 'tool';
    b.dataset.tool = tool;
    b.title = `${TOOL_NAMES[tool]} (${set.indexOf(tool) + 1})`;
    b.setAttribute('aria-label', TOOL_NAMES[tool]);
    b.appendChild(toolIcon(tool));
    if ((tool === 'X' || tool === 'W') && play.kind !== 'sandbox') {
      const n = document.createElement('span');
      n.className = 'count';
      b.appendChild(n);
    }
    b.addEventListener('click', () => selectTool(tool));
    host.appendChild(b);
  }
  const colors = $('colors');
  colors.textContent = '';
  if (play.kind === 'sandbox') {
    for (const c of COLORS) {
      const s = document.createElement('button');
      s.className = 'swatch';
      s.dataset.color = c;
      s.style.background = COLOR_HEX[c];
      s.setAttribute('aria-label', COLOR_LABEL[c]);
      s.addEventListener('click', () => { play.paint = c; buildTools(); selectTool(play.tool); });
      colors.appendChild(s);
    }
  }
  selectTool(play.tool, true);
}

function selectTool(tool, quiet = false) {
  if (!play) return;
  play.tool = tool;
  for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === tool);
  play.colorTool = play.kind === 'sandbox' && ['depot', 'station', 'paint'].includes(tool);
  $('colors').classList.toggle('hidden', !play.colorTool);
  for (const s of document.querySelectorAll('.swatch')) s.classList.toggle('on', s.dataset.color === play.paint);
  if (!quiet) { audio.unlock(); audio.turn(); layout(); }
  updateGhost();
}

function updateHud() {
  if (!play) return;
  const { kind, level, editor } = play;
  if (kind === 'level') {
    $('hud-world').textContent = `${WORLDS[level.world].icon} Level ${level.id} · ${WORLDS[level.world].name}`;
    $('hud-name').textContent = level.name;
  } else if (kind === 'daily') {
    $('hud-world').textContent = `📅 Daily Delivery · ${level.date}`;
    $('hud-name').textContent = `${currentStreak(save, level.date) ? `🔥 ${currentStreak(save, level.date)} · ` : ''}Today's puzzle`;
  } else {
    $('hud-world').textContent = '🧰 Sandbox';
    $('hud-name').textContent = 'Build anything!';
  }
  const n = editor.count;
  if (kind === 'sandbox') $('hud-pieces').textContent = `${n} piece${n === 1 ? '' : 's'} · ${play.board.trains.length} train${play.board.trains.length === 1 ? '' : 's'}`;
  else {
    $('hud-pieces').innerHTML = `${n} piece${n === 1 ? '' : 's'} · <span class="gold">★★★</span> at ${level.par}`;
  }
  for (const b of document.querySelectorAll('.tool')) {
    const t = b.dataset.tool;
    const count = b.querySelector('.count');
    if (count) {
      const left = editor.left(t);
      count.textContent = String(left);
      b.classList.toggle('out', left <= 0);
    }
  }
  $('btn-undo').disabled = !editor.undoStack.length;
  $('btn-hint').classList.toggle('hidden', kind === 'sandbox');
  const go = $('btn-go');
  const running = play.phase === 'run' || play.phase === 'won';
  go.textContent = running ? 'Stop' : 'Go!';
  go.classList.toggle('stop', running);
  go.classList.toggle('pulse', play.phase === 'edit' && kind !== 'sandbox' && hintComplete());
  $('btn-fast').classList.toggle('hidden', !running);
  $('tools').classList.toggle('hidden', running);
  if (running) $('colors').classList.add('hidden');
  else $('colors').classList.toggle('hidden', !play.colorTool);
}

function hintComplete() {
  if (!play || !play.hintOrder || !play.hintOrder.length) return false;
  return play.hintOrder.every((o) => {
    const p = play.editor.layout.get(o.cell);
    return p && o.options.some((q) => q.t === p.t && q.v === p.v);
  });
}

function changed(kind, cell) {
  view.setLayout(play.editor.layout);
  if (kind === 'place' || kind === 'swap') { audio.place(); if (cell >= 0) view.pop(cell); }
  else if (kind === 'turn') { audio.turn(); if (cell >= 0) view.pop(cell); }
  else if (kind === 'remove') audio.erase();
  if (play.editor.count) view.tutorial = null;
  if (view.hint && view.hint.cell === cell) view.hint = null;
  updateHud();
  if (play.kind === 'sandbox') storeSandboxSoon();
}

// ------------------------------------------------------------- sandbox

let sandboxTimer = 0;
function storeSandboxSoon() { sandboxTimer = 0.8; }
function storeSandbox() {
  if (!play || play.kind !== 'sandbox') return;
  save.sandbox = packSandbox(play.board, play.editor.layout);
  persist();
}

// Sandbox tools that change the board itself.
function sandboxTap(i, tool) {
  const { board, editor } = play;
  const c = board.cells[i];
  editor.push();
  const before = JSON.stringify(c);
  if (tool === 'tree') {
    if (c.k === 'block') board.cells[i] = { k: 'grass', x: c.x, y: c.y };
    else { editor.layout.delete(i); board.cells[i] = { k: 'block', deco: ['tree', 'pine', 'flowers', 'house', 'rock', 'water'][Math.floor(Math.random() * 6)], x: c.x, y: c.y }; }
  } else if (tool === 'depot') {
    if (c.k === 'depot') {
      if (c.color !== play.paint) c.color = play.paint; else c.dir = (c.dir + 1) & 3;
    } else {
      editor.layout.delete(i);
      board.cells[i] = { k: 'depot', dir: bestDir(i), color: play.paint, x: c.x, y: c.y };
    }
  } else if (tool === 'station' || tool === 'paint') {
    if (c.k === tool) {
      if (c.color !== play.paint) c.color = play.paint; else c.v = c.v ? 0 : 1;
    } else {
      editor.layout.delete(i);
      const dir = bestDir(i);
      board.cells[i] = { k: tool, t: 'S', v: dir === 0 || dir === 2 ? 0 : 1, color: play.paint, x: c.x, y: c.y };
    }
  } else if (tool === 'erase') {
    if (c.k !== 'grass') board.cells[i] = { k: 'grass', x: c.x, y: c.y };
    else editor.layout.delete(i);
  }
  if (JSON.stringify(board.cells[i]) === before && tool !== 'erase') { editor.undoStack.pop(); return false; }
  refreshTrains(board);
  view.boardDirty = true;
  audio.place();
  view.pop(i);
  updateHud();
  storeSandboxSoon();
  return true;
}

function bestDir(i) {
  const { board, editor } = play;
  for (let e = 0; e < 4; e++) if (editor.offers(i, e)) return e;
  const x = i % board.w;
  return x < board.w / 2 ? 1 : 3;
}

// ----------------------------------------------------------------- hints

async function requestHint() {
  if (!play || play.hintAsked) return;
  play.hintAsked = true;
  const mine = play;
  const src = mine.raw;
  const level = { map: src.map, queue: src.queue, depart: src.depart, gap: src.gap, stock: src.stock, par: mine.level.par };
  const reply = await ask({ type: 'hint', level });
  if (play !== mine) return;
  mine.hintOrder = reply && reply.solved ? reply.order : [];
  updateHud();
}

function hint() {
  if (!play || play.kind === 'sandbox') return;
  if (play.phase !== 'edit') backToEdit();
  if (!play.hintOrder) { toast('Thinking… 🤔'); return; }
  const next = play.hintOrder.find((o) => {
    const p = play.editor.layout.get(o.cell);
    return !p || !o.options.some((q) => q.t === p.t && q.v === p.v);
  });
  audio.unlock();
  if (!next) {
    toast('That looks right! Press Go 🚂');
    return;
  }
  view.hint = { cell: next.cell, piece: next.piece };
  view.cursor = next.cell;
  toast(play.editor.layout.get(next.cell) ? 'Try a different piece here ✨' : 'Try this piece here ✨');
  audio.star(0);
  log.event('hint.used', { level: play.kind === 'level' ? play.level.id : 0 });
}

// ------------------------------------------------------------ go / stop

function go() {
  if (!play || mode !== 'play') return;
  audio.unlock();
  if (play.phase === 'run' || play.phase === 'won') { backToEdit(); return; }
  if (play.phase === 'fail') { backToEdit(); }
  if (!play.board.trains.length) { toast('Add a depot to start a train!'); audio.nope(); return; }
  view.hint = null;
  view.tutorial = null;
  view.selected = -1;
  const sandbox = play.kind === 'sandbox';
  play.run = simulate(play.board, play.editor.layout, { maxTicks: sandbox ? 900 : 600, requireServed: !sandbox });
  play.phase = 'run';
  play.runs++;
  play.lastTick = -1;
  play.finished = false;
  play.puffClock = 0;
  view.setRun(play.run);
  updateHud();
  if (sandbox) {
    save.sandboxRuns = (save.sandboxRuns || 0) + 1;
    storeSandbox();
    announceSkins();
    log.event('sandbox.run', { trains: play.board.trains.length, pieces: play.editor.count });
  } else log.event('run.go', { level: play.kind === 'level' ? play.level.id : 'daily', pieces: play.editor.count });
}

function backToEdit() {
  if (!play) return;
  play.phase = 'edit';
  play.run = null;
  view.setRun(null);
  $('screen-fail').classList.add('hidden');
  updateHud();
}

function rewatch() {
  if (!play || !play.run) return;
  $('screen-fail').classList.add('hidden');
  play.phase = 'run';
  play.lastTick = -1;
  play.finished = false;
  view.setRun(play.run);
  updateHud();
}

function handleEvent(ev) {
  const c = view.cellCenter(ev.cell);
  switch (ev.type) {
    case 'depart':
      audio.toot(ev.train % 2 ? 1.12 : 1);
      view.burst('puff', c.x, c.y - view.cs * 0.1, 5, { speed: 30, life: 1.2, size: view.cs * 0.16, angle: -Math.PI / 2 });
      break;
    case 'deliver':
      audio.bell();
      view.served.add(ev.cell);
      view.burst('heart', c.x, c.y - view.cs * 0.2, 8, { speed: 70, life: 1.1, size: view.cs * 0.12, colors: ['#ff6b8b', '#ffd43b', COLOR_HEX[ev.color]] });
      view.burst('star', c.x, c.y, 6, { speed: 90, life: 0.8, size: view.cs * 0.1, color: '#fff3a0' });
      break;
    case 'flip':
      audio.clack();
      break;
    case 'paint':
      audio.splash();
      view.burst('dot', c.x, c.y, 14, { speed: 90, life: 0.7, size: view.cs * 0.06, color: COLOR_HEX[ev.color] });
      break;
    case 'tunnel':
      audio.whoosh();
      break;
    default:
  }
}

function stepRun(dt) {
  if (!play || !play.run || (play.phase !== 'run' && play.phase !== 'won')) return;
  const r = play.run;
  view.time += (dt / TICK_SECONDS) * speed;
  const loops = r.outcome === 'loop' && (play.kind === 'sandbox' || mode === 'title');
  if (!loops && view.time > r.endTime) view.time = r.endTime;
  const tick = Math.floor(view.time);
  while (play.lastTick < tick) {
    play.lastTick++;
    const wt = loops ? Math.floor(wrapTime(r, play.lastTick)) : play.lastTick;
    for (const ev of eventsAt(r, wt)) handleEvent(ev);
    audio.chuff();
  }
  play.puffClock += dt * speed;
  if (play.puffClock > (reduceMotion ? 0.5 : 0.16)) { play.puffClock = 0; view.steam(); }
  if (!loops && view.time >= r.endTime && !play.finished) {
    play.finished = true;
    finishRun();
  }
}

function eventsAt(r, t) {
  if (!r.byTick) {
    r.byTick = new Map();
    for (const ev of r.events) {
      if (!r.byTick.has(ev.t)) r.byTick.set(ev.t, []);
      r.byTick.get(ev.t).push(ev);
    }
  }
  return r.byTick.get(t) || [];
}

const FAIL_TEXT = {
  crash: ['Bonk!', 'Two trains bumped into each other. Try a crossing, or send one the long way round so it waits its turn.'],
  derail: ['Oops, end of the line!', 'A train ran out of track. Follow it and join the gap.'],
  loop: ['Round and round!', 'The trains are going in circles. Every train needs a way to its own station.'],
  unserved: ['Someone is still waiting!', 'Every station has passengers. Send a train of the right colour to each one.'],
  empty: ['No trains!', 'Add a depot so a train can start.'],
};

function finishRun() {
  const r = play.run;
  if (r.outcome === 'win') return win();
  if (play.kind === 'sandbox' && r.outcome === 'loop') return;
  play.phase = 'fail';
  view.addFailMarks(r);
  if (r.outcome === 'crash') { audio.bonk(); view.shake = reduceMotion ? 0 : 1; }
  else audio.uhoh();
  const [titleText, body] = FAIL_TEXT[r.outcome] || FAIL_TEXT.derail;
  let detail = body;
  const f = r.failures[0];
  if (r.outcome === 'derail' && f) detail = `The ${f.color} train ran out of track. Follow it and join the gap.`;
  if (r.outcome === 'unserved' && f) detail = `The ${f.color} station is still waiting for a ${f.color} train.`;
  $('fail-title').textContent = titleText;
  $('fail-text').textContent = detail;
  $('screen-fail').classList.remove('hidden');
  if (!coarse) $('btn-fix').focus({ preventScroll: true });
  updateHud();
  if (play.kind !== 'sandbox') {
    log.event('level.fail', { level: play.kind === 'level' ? play.level.id : 'daily', reason: r.outcome, pieces: play.editor.count, runs: play.runs });
  }
}

function win() {
  play.phase = 'won';
  audio.win();
  view.confetti();
  updateHud();
  if (play.kind === 'sandbox') { toast('Everyone got home! 🎉'); return; }
  const pieces = play.editor.count;
  const seconds = Math.round((performance.now() - play.startedAt) / 1000);
  let info;
  if (play.kind === 'level') {
    info = recordLevel(save, play.level, pieces);
    log.event('level.complete', { level: play.level.id, stars: info.stars, pieces, par: play.level.par, time: seconds, runs: play.runs });
  } else {
    const stars = starsFor(play.level.par, pieces);
    const d = recordDaily(save, play.level.date, pieces);
    info = { stars, first: d.first, newBest: d.newBest, underPar: pieces < play.level.par, best: save.daily.days[play.level.date], streak: d.streak };
    log.event('daily.complete', { stars, pieces, par: play.level.par, streak: d.streak, time: seconds });
  }
  const fresh = claimSkins(save, LEVELS);
  persist();
  setTimeout(() => { if (play && play.phase === 'won') showResults(info, pieces, fresh); }, reduceMotion ? 500 : 1300);
}

function showResults(info, pieces, fresh) {
  const lv = play.level;
  const titles = ['All aboard!', 'Toot toot!', 'Right on time!', 'Choo-choo hooray!'];
  $('res-title').textContent = info.underPar ? 'Super-duper track!' : titles[(play.runs + pieces) % titles.length];
  const spans = $('res-stars').querySelectorAll('span');
  spans.forEach((s) => s.classList.remove('lit'));
  spans.forEach((s, k) => {
    if (k < info.stars) setTimeout(() => { s.classList.add('lit'); audio.star(k); }, (reduceMotion ? 0 : 250) + k * 260);
  });
  const next = info.stars < 3 ? `${lv.par} pieces gets ★★★` : info.underPar ? `Fewer than par (${lv.par})! Brilliant!` : 'Perfect!';
  $('res-sub').textContent = `${pieces} piece${pieces === 1 ? '' : 's'} · ${next}`;
  const best = $('res-best');
  const bestText = info.newBest ? `New best: ${pieces} pieces!` : play.kind === 'daily' && info.first ? `🔥 ${info.streak}-day streak!` : '';
  best.textContent = bestText;
  best.classList.toggle('hidden', !bestText);
  const un = $('res-unlock');
  if (fresh.length) {
    const skin = skinByKey(fresh[0]);
    drawShedThumb($('res-unlock-art'), skin.key, 'red', false);
    $('res-unlock-name').textContent = `${skin.name}${fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ''} is in the Train Shed`;
    un.classList.remove('hidden');
    setTimeout(() => audio.unlockJingle(), 1100);
    for (const k of fresh) log.event('skin.unlock', { skin: k });
  } else un.classList.add('hidden');
  const isLast = play.kind === 'daily' || lv.id >= LEVEL_COUNT;
  $('btn-replay').textContent = info.stars >= 3 ? 'Play again' : 'Try fewer pieces';
  $('btn-next').textContent = play.kind === 'daily' ? 'Back to title' : isLast ? 'Visit the Train Shed' : 'Next level →';
  show('results');
}

function nextFromResults() {
  if (!play) return toTitle();
  if (play.kind === 'daily') return toTitle();
  if (play.level.id >= LEVEL_COUNT) return toShed();
  startLevel(play.level.id + 1);
}

function replay() {
  if (!play) return;
  show('play');
  backToEdit();
}

function announceSkins() {
  const fresh = claimSkins(save, LEVELS);
  if (fresh.length) {
    toast(`New engine in the Train Shed: ${skinByKey(fresh[0]).name}! 🚂`, 3);
    audio.unlockJingle();
    for (const k of fresh) log.event('skin.unlock', { skin: k });
    persist();
  }
}

// ---------------------------------------------------------------- pause

function pause() {
  if (mode !== 'play') return;
  show('pause');
}
function resume() {
  if (mode !== 'pause') return;
  show('play');
  if (play && play.phase === 'fail') $('screen-fail').classList.remove('hidden');
}

// ---------------------------------------------------------------- input

let down = null;
let longTimer = 0;

function editable() {
  return mode === 'play' && play && play.phase === 'edit';
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (mode !== 'play' || !play) return;
  if (play.phase === 'fail') { backToEdit(); return; }
  if (play.phase !== 'edit') return;
  const cell = view.cellAt(e.clientX, e.clientY);
  view.showCursor = false;
  if (cell < 0) return;
  canvas.setPointerCapture(e.pointerId);
  if (e.button === 2) {
    removeAt(cell);
    return;
  }
  down = { id: e.pointerId, cell, last: cell, path: [cell], moved: false, type: e.pointerType };
  const tool = play.tool;
  if (tool === 'track' || tool === 'erase') play.editor.beginStroke();
  clearTimeout(longTimer);
  if (e.pointerType !== 'mouse') {
    longTimer = setTimeout(() => {
      if (!down || down.moved) return;
      play.editor.cancelStroke();
      removeAt(down.cell);
      if (navigator.vibrate) navigator.vibrate(15);
      down = null;
    }, 480);
  }
});

canvas.addEventListener('pointermove', (e) => {
  pointerIdle = 0;
  if (!editable()) return;
  const cell = view.cellAt(e.clientX, e.clientY);
  if (!down) {
    if (e.pointerType === 'mouse') { view.hover = cell; updateGhost(); }
    return;
  }
  if (e.pointerId !== down.id || cell < 0 || cell === down.last) return;
  const steps = cellsBetween(play.board.w, down.last, cell);
  down.path.push(...steps);
  down.last = cell;
  down.moved = true;
  clearTimeout(longTimer);
  view.ghost = null;
  const tool = play.tool;
  if (tool === 'track' || tool === 'erase') {
    if (play.editor.drawStroke(down.path, tool === 'erase')) {
      view.setLayout(play.editor.layout);
      if (tool === 'erase') audio.erase(); else audio.place();
      view.tutorial = null;
      updateHud();
    }
  } else if (play.kind === 'sandbox' && tool === 'tree') {
    // Paint scenery by dragging.
    for (const i of steps) if (play.board.cells[i].k === 'grass') sandboxTap(i, 'tree');
  }
});

function endPointer(e) {
  clearTimeout(longTimer);
  if (!down || e.pointerId !== down.id) return;
  const d = down;
  down = null;
  if (!editable()) return;
  if (d.moved) {
    const tool = play.tool;
    if (tool === 'track' || tool === 'erase') {
      if (play.editor.endStroke()) changed(tool === 'erase' ? 'remove' : 'stroke', -1);
    }
    return;
  }
  play.editor.cancelStroke();
  tapCell(d.cell);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', (e) => {
  clearTimeout(longTimer);
  if (down && e.pointerId === down.id && play) {
    if (down.moved) { play.editor.endStroke(); changed('stroke', -1); } else play.editor.cancelStroke();
  }
  down = null;
});
canvas.addEventListener('pointerleave', () => { view.hover = -1; updateGhost(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function tapCell(cell) {
  if (!editable() || cell < 0) return;
  const { board, editor } = play;
  const c = board.cells[cell];
  const tool = play.tool;
  view.cursor = cell;
  if (play.kind === 'sandbox' && ['depot', 'station', 'paint', 'tree'].includes(tool)) { sandboxTap(cell, tool); return; }
  if (play.kind === 'sandbox' && tool === 'erase' && c.k !== 'grass') { sandboxTap(cell, 'erase'); return; }
  if (c.k === 'depot') { audio.toot(1.2, false); view.burst('puff', view.cellCenter(cell).x, view.cellCenter(cell).y, 3, { speed: 20, size: view.cs * 0.12, life: 1 }); return; }
  if (c.k === 'station') { audio.bell(); return; }
  if (c.k !== 'grass') { audio.nope(); return; }
  const result = editor.tap(cell, tool, lastAxis);
  if (result === 'empty') {
    toast(`No ${tool === 'X' ? 'crossings' : 'switches'} left. Move one you've placed!`);
    audio.nope();
    return;
  }
  if (result) changed(result, cell);
  updateGhost();
}

function removeAt(cell) {
  if (!editable()) return;
  if (play.kind === 'sandbox' && play.board.cells[cell].k !== 'grass') { sandboxTap(cell, 'erase'); return; }
  if (play.editor.remove(cell)) changed('remove', cell);
}

function updateGhost() {
  view.ghost = null;
  if (!editable() || view.hover < 0 || coarse) return;
  const i = view.hover;
  const { editor, tool } = play;
  if (!editor.canBuild(i) || editor.layout.has(i)) return;
  let piece = null;
  if (tool === 'track') piece = editor.bestTrack(i);
  else if (['S', 'C', 'X', 'W'].includes(tool) && editor.left(tool) > 0) piece = { t: tool, v: editor.bestVariant(i, tool) };
  if (piece) view.ghost = { cell: i, piece };
}

let lastAxis = 1;
function moveCursor(dx, dy) {
  if (!play) return;
  if (dx || dy) lastAxis = dx ? 1 : 0;
  const { w, h } = play.board;
  let i = view.cursor < 0 ? firstBuildable() : view.cursor;
  const x = Math.max(0, Math.min(w - 1, (i % w) + dx));
  const y = Math.max(0, Math.min(h - 1, Math.floor(i / w) + dy));
  i = y * w + x;
  view.cursor = i;
  view.showCursor = true;
  view.hover = -1;
  view.ghost = null;
  if (play.editor.canBuild(i) && !play.editor.layout.has(i)) {
    const tool = play.tool;
    if (tool === 'track') view.ghost = { cell: i, piece: play.editor.bestTrack(i, lastAxis) };
    else if (['S', 'C', 'X', 'W'].includes(tool) && play.editor.left(tool) > 0) view.ghost = { cell: i, piece: { t: tool, v: play.editor.bestVariant(i, tool) } };
  }
}

function cycleTool(dir) {
  const tools = [...document.querySelectorAll('.tool')].map((b) => b.dataset.tool);
  const k = tools.indexOf(play.tool);
  selectTool(tools[(k + dir + tools.length) % tools.length]);
}

addEventListener('keydown', (e) => {
  if (e.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) return;
  audio.unlock();
  const k = e.code;
  // A focused button handles its own Enter/Space.
  if ((k === 'Enter' || k === 'Space') && e.target && e.target.closest && e.target.closest('button, a')) return;
  if (k === 'KeyM') { toggleSound(); return; }
  if (mode === 'play') {
    if (k === 'Escape' || k === 'KeyP') { e.preventDefault(); pause(); return; }
    if (play.phase === 'fail' && ['Enter', 'Space', 'KeyG', 'KeyR'].includes(k)) { e.preventDefault(); backToEdit(); return; }
    if (k === 'KeyG' || k === 'Enter') { e.preventDefault(); go(); return; }
    if (k === 'KeyF') { toggleSpeed(); return; }
    if (k === 'KeyH') { hint(); return; }
    if (k === 'KeyZ' || k === 'KeyU') { e.preventDefault(); undo(); return; }
    if (!editable()) return;
    const moves = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
    if (moves[k]) { e.preventDefault(); moveCursor(...moves[k]); return; }
    if (k === 'Space' || k === 'KeyE') {
      e.preventDefault();
      if (view.cursor < 0) view.cursor = firstBuildable();
      view.showCursor = true;
      tapCell(view.cursor);
      moveCursor(0, 0);
      return;
    }
    if (k === 'KeyQ') {
      if (play.editor.turnAt(view.cursor, -1)) changed('turn', view.cursor);
      moveCursor(0, 0);
      return;
    }
    if (k === 'KeyX' || k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeAt(view.cursor); moveCursor(0, 0); return; }
    if (k === 'KeyC') { if (play.editor.clear()) changed('remove', -1); return; }
    if (k === 'Tab') { e.preventDefault(); cycleTool(e.shiftKey ? -1 : 1); return; }
    const digit = /^Digit([1-9])$/.exec(k);
    if (digit) {
      const tools = [...document.querySelectorAll('.tool')];
      const b = tools[Number(digit[1]) - 1];
      if (b) selectTool(b.dataset.tool);
    }
    return;
  }
  if (k === 'Escape' || k === 'KeyP') {
    if (mode === 'pause') { e.preventDefault(); resume(); }
    else if (mode === 'map' || mode === 'shed' || mode === 'daily') toTitle();
    else if (mode === 'intro') dismissIntro();
    return;
  }
  if (mode === 'results' && (k === 'KeyN')) nextFromResults();
});

function undo() {
  if (!play) return;
  if (play.phase !== 'edit') backToEdit();
  if (play.editor.undo()) {
    if (play.kind === 'sandbox') refreshTrains(play.board);
    view.boardDirty = true;
    changed('turn', -1);
  }
}

function toggleSpeed() {
  speed = speed > 1 ? 1 : 2;
  save.fast = speed > 1;
  persist();
  syncToggles();
}

let pointerIdle = 0;
let pointerHidden = false;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  const hide = mode === 'play' && pointerIdle > 2;
  if (hide !== pointerHidden) {
    pointerHidden = hide;
    document.body.classList.toggle('no-cursor', hide);
  }
}

// --------------------------------------------------------------- loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, level: play && play.level ? play.level.id || 'daily' : 0, phase: play ? play.phase : 'none' }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => {
  monitor.reset(performance.now());
  if (document.hidden && mode === 'play' && play && play.phase === 'run') pause();
});

// The title and menus keep the demo trains chugging round.
function stepDemo(dt) {
  if (play || !view.run) return;
  view.time += dt / TICK_SECONDS;
  demoPuff += dt;
  if (demoPuff > (reduceMotion ? 0.6 : 0.2)) { demoPuff = 0; view.steam(); }
}
let demoPuff = 0;

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  if (forceCrash) { forceCrash = false; throw new Error('Forced crash for testing'); }
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  updatePointer(dt);
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $('toast').classList.add('hidden');
  }
  if (sandboxTimer > 0) {
    sandboxTimer -= dt;
    if (sandboxTimer <= 0) storeSandbox();
  }
  if (mode !== 'pause') {
    stepRun(dt);
    stepDemo(dt);
    stepAuto(dt);
    view.update(dt);
  }
  audio.tick();
  view.draw();
  requestAnimationFrame(loop);
}
const loop = telemetry ? telemetry.guard(frame, 'tiny-trains.frame') : frame;

// ?autoplay solves each level with the hint solver: a quick browser check.
const autoMode = params.has('autoplay');
let autoWait = 0;
function stepAuto(dt) {
  if (!autoMode) return;
  autoWait -= dt;
  if (autoWait > 0) return;
  autoWait = 0.15;
  if (mode === 'intro') { dismissIntro(); return; }
  if (mode === 'results') { autoWait = 1.2; nextFromResults(); return; }
  if (mode !== 'play' || !play || !play.hintOrder) return;
  if (play.phase === 'edit') {
    const next = play.hintOrder.find((o) => {
      const p = play.editor.layout.get(o.cell);
      return !p || !o.options.some((q) => q.t === p.t && q.v === p.v);
    });
    if (next) {
      play.editor.push();
      play.editor.layout.set(next.cell, next.piece);
      changed('place', next.cell);
    } else go();
  }
}

// --------------------------------------------------------------- wiring

$('btn-play').addEventListener('click', () => startLevel(nextLevelId()));
$('btn-map').addEventListener('click', toMap);
$('btn-daily').addEventListener('click', toDaily);
$('btn-shed').addEventListener('click', toShed);
$('btn-sandbox').addEventListener('click', startSandbox);
$('btn-daily-go').addEventListener('click', startDaily);
for (const el of document.querySelectorAll('[data-title]')) el.addEventListener('click', toTitle);
for (const el of document.querySelectorAll('[data-sound]')) el.addEventListener('click', toggleSound);
for (const el of document.querySelectorAll('[data-music]')) el.addEventListener('click', toggleMusic);
$('btn-sound').addEventListener('click', toggleSound);
$('btn-pause').addEventListener('click', pause);
$('btn-undo').addEventListener('click', undo);
$('btn-hint').addEventListener('click', hint);
$('btn-go').addEventListener('click', go);
$('btn-fast').addEventListener('click', toggleSpeed);
$('btn-intro').addEventListener('click', dismissIntro);
$('btn-resume').addEventListener('click', resume);
$('btn-clear').addEventListener('click', () => {
  show('play');
  backToEdit();
  if (play.editor.clear()) changed('remove', -1);
});
$('btn-pause-map').addEventListener('click', toMap);
$('btn-fix').addEventListener('click', backToEdit);
$('btn-rewatch').addEventListener('click', rewatch);
$('btn-next').addEventListener('click', nextFromResults);
$('btn-replay').addEventListener('click', replay);
$('btn-res-map').addEventListener('click', toMap);
addEventListener('resize', layout);
addEventListener('orientationchange', () => setTimeout(layout, 150));
for (const el of document.querySelectorAll('button, .btn')) el.addEventListener('pointerdown', () => audio.unlock());
// Tray and HUD buttons let go of focus after a tap or click, so keyboard
// shortcuts (Space, Enter) keep working on the board.
for (const host of [$('bar'), $('hud')]) {
  host.addEventListener('click', (e) => {
    if (e.detail > 0 && e.target.closest('button')) e.target.closest('button').blur();
  });
}

syncToggles();
claimSkins(save, LEVELS);
log.event('game.ready', { levels: LEVEL_COUNT, stars: totalStars(save), solved: Object.keys(save.levels).length, skin: save.skin });
if (params.has('level')) startLevel(Number(params.get('level')) || 1);
else if (params.has('daily')) { toDaily(); startDaily(); }
else if (params.has('sandbox')) startSandbox();
else if (params.has('map')) toMap();
else if (params.has('shed')) toShed();
else toTitle();
requestAnimationFrame(loop);

// Handy for poking at the game from the console and browser checks.
window.TT = {
  get mode() { return mode; }, get play() { return play; }, view, save, audio,
  startLevel, startSandbox, toMap, toTitle, toShed, go, hint,
  crashTest() { forceCrash = true; },
};
