// Screens, input and the frame loop for Letter Lagoon.
import { getLevel, dailyLevel, dateKeyOf, LEVEL_COUNT, ZONES, LEVELS_PER_ZONE } from './levels.js';
import { Round, HINT_COST } from './game.js';
import { cellsOf } from './crossword.js';
import { Narrator } from './narrator.js';
import { CRITTERS, CRITTER_IDS, aquariumRoster } from './critters.js';
import { SAVE_KEY, loadSave, writeSave, adoptSave, liveStreak, recordLevel, recordDaily, totalStars, totalCritters } from './save.js';
import { nextGuess } from './solver.js';
import { Sea, Fx, drawCritterIcon } from './render.js';
import { Sfx } from './audio.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');
if (reduceMotion) document.body.classList.add('reduced');

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
let saveWarned = false;
function persist() {
  // ?autoplay is a browser check: its stars and coins must not land in the real save.
  if (params.has('autoplay')) return;
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const sfx = new Sfx(save.muted);
const sea = new Sea($('sea'), { reduceMotion });
const fx = new Fx($('fx'), { reduceMotion });
const pinch = new Narrator(Math.floor(Math.random() * 5));

let mode = 'title';
let level = null;
let round = null;
let playSeconds = 0;
let selection = [];       // wheel indices, in order
let gesture = null;       // the pointer gesture on the wheel
let tapMode = false;      // letters added by taps/typing wait for Enter or ✓
let pointer = null;       // last pointer position over the wheel (local px)
let bubbles = [];         // wheel bubble elements
let centers = [];         // wheel bubble centers (local px)
let bubbleRadius = 30;
let tiles = new Map();    // "row,col" -> tile element
let traps = [];
let resultTimer = 0;
let cleared = null;       // the finished round, saved before the results show
let previewTimer = 0;
let glossTimer = 0;
let idleTalk = 0;
let focusIndex = -1;      // gamepad / keyboard focus on the wheel
let autoplay = params.has('autoplay') ? { wait: 1.2, word: null, step: 0, tried: new Set() } : null;

// ------------------------------------------------------------------ screens

const SCREENS = ['title', 'map', 'aquarium', 'play', 'pause', 'results'];
function show(next) {
  mode = next;
  const inPlay = ['play', 'pause', 'results'].includes(next);
  for (const name of SCREENS) {
    const el = $(`screen-${name}`);
    const visible = name === next || (name === 'play' && inPlay);
    el.classList.toggle('hidden', !visible);
  }
  if (next !== 'play') document.body.classList.remove('no-cursor');
  if (next !== 'aquarium' && !inPlay) sea.clearSwimmers();
  if (inPlay) layout();
  queueMicrotask(() => monitor.mark(performance.now(), next));
}

function buildLogo() {
  for (const row of document.querySelectorAll('.logo-row')) {
    if (row.childElementCount) continue;
    [...row.dataset.word].forEach((ch, i) => {
      const span = document.createElement('span');
      span.textContent = ch;
      span.style.setProperty('--i', String(i + (row.classList.contains('small') ? 3 : 0)));
      row.appendChild(span);
    });
  }
}

function todayKey() {
  return params.get('date') || dateKeyOf(new Date());
}

function toTitle() {
  show('title');
  sea.setZone(ZONES[0], 0);
  buildLogo();
  const next = Math.min(save.unlocked, LEVEL_COUNT);
  const cleared = Object.keys(save.best).length;
  $('btn-play').textContent = cleared ? `Play level ${next}` : 'Play';
  const doneToday = save.daily.done.includes(todayKey());
  const streak = liveStreak(save, todayKey());
  $('btn-daily').textContent = doneToday ? `Daily puzzle ✓${streak > 1 ? ` · ${streak} day streak` : ''}` : `Daily puzzle${streak > 0 ? ` · streak ${streak}` : ''}`;
  const critters = totalCritters(save);
  $('title-progress').textContent = cleared
    ? `★ ${totalStars(save)} stars · ${critters} critter${critters === 1 ? '' : 's'} rescued · ${save.coins} coins`
    : `${LEVEL_COUNT} levels across ${ZONES.length} reef zones`;
  syncToggles();
  $('title-speech').textContent = cleared ? pinchTitleLine() : 'Hi, I\'m Pinch! Want to spell words with me?';
}

function pinchTitleLine() {
  const lines = [
    'Welcome back, word explorer!',
    'More critters need your help today!',
    `Your aquarium has ${totalCritters(save)} friends in it!`,
    'Let\'s pop some bubbles!',
  ];
  return lines[save.plays % lines.length];
}

function syncToggles() {
  $('btn-relax').textContent = `Relax mode: ${save.relax ? 'on' : 'off'}`;
  $('btn-relax').setAttribute('aria-pressed', String(save.relax));
  $('btn-title-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
  $('btn-title-mute').setAttribute('aria-pressed', String(!save.muted));
  $('btn-pause-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
  $('btn-mute').textContent = save.muted ? '✕' : '♪';
  $('btn-mute').setAttribute('aria-label', save.muted ? 'Turn sound on' : 'Turn sound off');
}

function toMap(focus = Math.min(save.unlocked, LEVEL_COUNT)) {
  show('map');
  $('map-stars').textContent = `★ ${totalStars(save)}`;
  const list = $('map-list');
  list.innerHTML = '';
  ZONES.forEach((zone, z) => {
    const from = z * LEVELS_PER_ZONE + 1;
    const section = document.createElement('section');
    section.className = 'zone';
    section.style.setProperty('--zone', zone.hue);
    const locked = from > save.unlocked;
    if (locked) section.classList.add('locked');
    let stars = 0;
    for (let id = from; id < from + LEVELS_PER_ZONE; id++) stars += save.stars[id] | 0;
    section.innerHTML = `<h3>${zone.name} <small>${save.relax ? '' : `★ ${stars}/${LEVELS_PER_ZONE * 3}`}</small></h3><p>${locked ? 'Finish the zone above to swim here.' : zone.blurb}</p>`;
    const grid = document.createElement('div');
    grid.className = 'zone-levels';
    for (let id = from; id < from + LEVELS_PER_ZONE; id++) {
      const button = document.createElement('button');
      button.className = 'lvl';
      button.textContent = String(id);
      const got = save.stars[id] | 0;
      if (id in save.best) button.classList.add('done');
      if (id === Math.min(save.unlocked, LEVEL_COUNT)) button.classList.add('current');
      if (id > save.unlocked) button.disabled = true;
      button.setAttribute('aria-label', `Level ${id}${got ? `, ${got} stars` : ''}${id > save.unlocked ? ', locked' : ''}`);
      if (id in save.best && !save.relax) {
        const s = document.createElement('span');
        s.className = 'lvl-stars';
        s.innerHTML = '<b>' + '★'.repeat(got) + '</b>' + '★'.repeat(3 - got);
        button.appendChild(s);
      }
      button.addEventListener('click', () => startLevel(id));
      grid.appendChild(button);
    }
    section.appendChild(grid);
    list.appendChild(section);
  });
  requestAnimationFrame(() => {
    const target = list.querySelector('.lvl.current') || list.querySelector(`.lvl:nth-child(1)`);
    const zoneEl = list.children[Math.floor((focus - 1) / LEVELS_PER_ZONE)];
    if (zoneEl) $('map-scroll').scrollTop = zoneEl.offsetTop - 12;
    target?.focus({ preventScroll: true });
  });
}

function toAquarium() {
  show('aquarium');
  sea.setZone(ZONES[2], 2);
  const roster = aquariumRoster(save.critters, reduceMotion ? 10 : 22);
  sea.setRoster(roster, window.innerWidth < 600 ? 0.9 : 1.25);
  const total = totalCritters(save);
  $('aq-count').textContent = `${total} critter${total === 1 ? '' : 's'}`;
  $('aq-empty').classList.toggle('hidden', total > 0);
  const shelf = $('aq-shelf');
  shelf.innerHTML = '';
  for (const id of CRITTER_IDS) {
    const n = save.critters[id] | 0;
    const tag = document.createElement('div');
    tag.className = `aq-tag${n ? '' : ' locked'}`;
    const c = document.createElement('canvas');
    if (n) drawCritterIcon(c, id, 44);
    else { c.width = 1; c.height = 1; }
    const label = document.createElement('span');
    label.textContent = n ? `${CRITTERS[id].name} × ${n}` : '???';
    tag.append(c, label);
    shelf.appendChild(tag);
  }
  log.event('aquarium.open', { critters: total, species: CRITTER_IDS.filter((id) => save.critters[id]).length });
}

// --------------------------------------------------------------- the level

function startLevel(id) {
  const n = Math.max(1, Math.min(LEVEL_COUNT, id | 0));
  begin(getLevel(n));
}

function startDaily() {
  begin(dailyLevel(todayKey()));
}

function begin(next) {
  sfx.unlock();
  sfx.startMusic();
  if (round && !round.finished && mode !== 'results') {
    log.event('level.abandon', { level: level.id, daily: !!level.daily, found: round.found.size, targets: level.targets.length });
  }
  level = next;
  round = new Round(level, { relax: save.relax, coins: save.coins, seed: Date.now() % 100000 });
  playSeconds = 0;
  resultTimer = 0;
  cleared = null;
  idleTalk = 0;
  selection = [];
  tapMode = false;
  gesture = null;
  focusIndex = -1;
  if (autoplay) Object.assign(autoplay, { wait: 1.2, word: null, step: 0, tried: new Set() });
  sea.setZone(ZONES[level.zone], level.zone);
  sea.clearSwimmers();
  $('hud-level').textContent = level.daily ? 'Daily puzzle' : `Level ${level.id}`;
  $('hud-zone').textContent = level.daily ? level.daily : ZONES[level.zone].name;
  $('gloss').classList.add('hidden');
  buildBoard();
  buildTraps();
  buildWheel();
  show('play');
  updateHud();
  renderPreview();
  say(level.id === 1 && !level.daily ? 'Swipe from bubble to bubble to spell a word. Let go to try it!' : pinch.say('start'));
  log.event('level.start', {
    level: level.id, daily: !!level.daily, letters: level.letters.length, targets: level.targets.length,
    relax: save.relax, autoplay: !!autoplay,
  });
}

function buildBoard() {
  const board = $('board');
  board.innerHTML = '';
  tiles = new Map();
  for (const t of level.targets) {
    for (const c of cellsOf(t)) {
      const k = `${c.row},${c.col}`;
      if (tiles.has(k)) continue;
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.row = c.row;
      tile.dataset.col = c.col;
      tile.textContent = c.letter;
      tile.setAttribute('role', 'gridcell');
      board.appendChild(tile);
      tiles.set(k, tile);
    }
  }
}

function buildTraps() {
  const holder = $('rescue');
  holder.innerHTML = '';
  traps = level.traps.map((id, i) => {
    const el = document.createElement('div');
    el.className = 'trap';
    el.style.setProperty('--i', String(i));
    el.title = CRITTERS[id].name;
    const c = document.createElement('canvas');
    drawCritterIcon(c, id, 36);
    el.appendChild(c);
    holder.appendChild(el);
    return { id, el, free: false };
  });
}

function buildWheel() {
  const wheel = $('wheel');
  for (const b of bubbles) b.remove();
  bubbles = round.wheel.map((letter, i) => {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = letter;
    el.dataset.index = String(i);
    wheel.appendChild(el);
    return el;
  });
  layoutWheel();
}

function layout() {
  if (!level) return;
  const portrait = !window.matchMedia('(min-aspect-ratio: 11/10) and (min-width: 760px)').matches;
  const vw = window.innerWidth, vh = window.innerHeight;
  const side = vw < 480 ? 54 : 64;
  const wheel = portrait
    ? Math.max(160, Math.min(300, vw - side * 2 - 40, vh * 0.33))
    : Math.max(200, Math.min(340, vw * 0.44 - side * 2 - 30, vh - 330));
  $('wheel').style.setProperty('--wheel', `${Math.round(wheel)}px`);
  layoutWheel();
  const wrap = $('board-wrap').getBoundingClientRect();
  const gapK = 0.1;
  const tile = Math.floor(Math.max(20, Math.min(76,
    (wrap.width - 8) / (level.cols + (level.cols - 1) * gapK),
    (wrap.height - 8) / (level.rows + (level.rows - 1) * gapK))));
  const gap = Math.max(2, Math.round(tile * gapK));
  const board = $('board');
  board.style.setProperty('--tile', `${tile}px`);
  board.style.width = `${level.cols * tile + (level.cols - 1) * gap}px`;
  board.style.height = `${level.rows * tile + (level.rows - 1) * gap}px`;
  for (const el of tiles.values()) {
    el.style.left = `${el.dataset.col * (tile + gap)}px`;
    el.style.top = `${el.dataset.row * (tile + gap)}px`;
  }
}

function layoutWheel() {
  if (!round) return;
  const size = parseFloat($('wheel').style.getPropertyValue('--wheel')) || 260;
  const n = round.wheel.length;
  const d = size * (n <= 3 ? 0.34 : n <= 4 ? 0.31 : n <= 5 ? 0.29 : n <= 6 ? 0.27 : 0.25);
  const ring = size / 2 - d / 2 - size * 0.05;
  bubbleRadius = d / 2;
  centers = round.wheel.map((_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: size / 2 + Math.cos(a) * ring, y: size / 2 + Math.sin(a) * ring };
  });
  bubbles.forEach((el, i) => {
    el.style.width = el.style.height = `${d}px`;
    el.style.left = `${centers[i].x - d / 2}px`;
    el.style.top = `${centers[i].y - d / 2}px`;
    el.style.fontSize = `${d * 0.56}px`;
  });
  const trace = $('trace');
  trace.setAttribute('viewBox', `0 0 ${size} ${size}`);
  trace.querySelector('polyline').style.strokeWidth = `${Math.max(8, d * 0.2)}`;
  trace.querySelector('line').style.strokeWidth = `${Math.max(8, d * 0.2)}`;
  renderSelection();
}

// --------------------------------------------------------------- selection

function word() {
  return selection.map((i) => round.wheel[i]).join('');
}

function addLetter(i) {
  if (selection.includes(i) || !round || round.finished) return false;
  selection.push(i);
  sfx.letter(selection.length - 1);
  clearPreviewResult();
  renderSelection();
  return true;
}

function removeLast() {
  if (!selection.length) return;
  selection.pop();
  sfx.unletter(selection.length);
  renderSelection();
}

function clearSelection() {
  selection = [];
  tapMode = false;
  renderSelection();
}

function renderSelection() {
  bubbles.forEach((el, i) => {
    el.classList.toggle('on', selection.includes(i));
    el.classList.toggle('focus', i === focusIndex);
  });
  const pts = selection.map((i) => `${centers[i].x.toFixed(1)},${centers[i].y.toFixed(1)}`).join(' ');
  const trace = $('trace');
  trace.querySelector('polyline').setAttribute('points', pts);
  const line = trace.querySelector('line');
  if (gesture && pointer && selection.length) {
    const last = centers[selection.at(-1)];
    line.setAttribute('x1', last.x); line.setAttribute('y1', last.y);
    line.setAttribute('x2', pointer.x); line.setAttribute('y2', pointer.y);
    line.style.display = '';
  } else {
    line.style.display = 'none';
  }
  if (!previewTimer) renderPreview();
}

function renderPreview() {
  const el = $('preview');
  el.className = 'preview';
  el.textContent = selection.length ? word() : '';
  if (selection.length && (tapMode || !gesture)) {
    const go = document.createElement('button');
    go.className = 'go';
    go.textContent = '✓';
    go.setAttribute('aria-label', 'Try this word');
    go.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); submit(); });
    const clear = document.createElement('button');
    clear.className = 'clear';
    clear.textContent = '✕';
    clear.setAttribute('aria-label', 'Clear the letters');
    clear.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); clearSelection(); sfx.click(); });
    el.append(go, clear);
  }
}

function showPreviewResult(text, cls) {
  const el = $('preview');
  el.className = `preview ${cls}`;
  el.textContent = text;
  previewTimer = 0.7;
}

function clearPreviewResult() {
  if (previewTimer) {
    previewTimer = 0;
    renderPreview();
  }
}

// ------------------------------------------------------------------ submit

function submit() {
  if (!round || round.finished || !selection.length) { clearSelection(); return; }
  const typed = word();
  const fromCenters = selection.map((i) => bubbleCenterOnPage(i));
  selection = [];
  tapMode = false;
  gesture = null;
  renderSelection();
  idleTalk = 0;
  const res = round.submit(typed);
  if (autoplay) autoplay.tried.add(typed);
  switch (res.kind) {
    case 'target': {
      showPreviewResult(typed, 'good');
      sfx.found(typed.length, res.full);
      fillWord(res.target, fromCenters, false);
      freeTraps(1 + res.alsoFound.length);
      for (const w of res.alsoFound) fillWord(level.targets.find((t) => t.word === w), null, true);
      showGloss(typed, res.gloss);
      say(pinch.say(res.full ? 'full' : 'found'), true);
      if (res.finish) finishSoon(res.finish);
      break;
    }
    case 'bonus':
      showPreviewResult(typed, 'bonus');
      sfx.bonus();
      flyCoins($('preview'), res.coins);
      bump('hud-bonus');
      if (res.gloss) showGloss(typed, res.gloss, 'Bonus word!');
      say(pinch.say('bonus'));
      break;
    case 'repeat': {
      showPreviewResult(typed, 'repeat');
      sfx.repeat();
      for (const c of cellsOf(level.targets[res.index])) flashTile(c, 'flash');
      say(pinch.say('repeat'));
      break;
    }
    case 'repeat-bonus':
      showPreviewResult(typed, 'repeat');
      sfx.repeat();
      say('You found that bonus word already!');
      break;
    case 'short':
      if (typed.length > 1) { showPreviewResult(typed, 'bad'); say(pinch.say('short')); sfx.bad(); }
      break;
    default:
      showPreviewResult(typed, 'bad');
      sfx.bad();
      say(pinch.say(round.misses % 4 === 0 ? 'stuck' : 'unknown'));
  }
  save.coins = round.coins;
  if (res.kind === 'bonus') persist();
  updateHud();
}

function bubbleCenterOnPage(i) {
  const rect = bubbles[i].getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function tileCenter(tile) {
  const r = tile.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
}

// Letters fly from the wheel to their tiles, then the tiles pop.
function fillWord(target, from, revealed) {
  cellsOf(target).forEach((c, i) => {
    const tile = tiles.get(`${c.row},${c.col}`);
    if (!tile || tile.classList.contains('on')) { if (tile) flashTile(c, 'flash'); return; }
    const to = tileCenter(tile);
    const land = () => {
      tile.classList.add('on');
      tile.classList.remove('pop');
      void tile.offsetWidth;
      tile.classList.add('pop');
      if (i === target.word.length - 1) fx.burst(to.x, to.y, { count: 10, kinds: ['gold', 'aqua', 'pink'], speed: 160 });
    };
    if (!from || reduceMotion) { setTimeout(land, revealed ? 120 + i * 50 : i * 40); return; }
    const start = from[i] || from[from.length - 1];
    const fly = document.createElement('div');
    fly.className = 'fly';
    fly.textContent = c.letter;
    fly.style.width = fly.style.height = `${to.w}px`;
    fly.style.fontSize = `${to.w * 0.62}px`;
    fly.style.left = `${to.x - to.w / 2}px`;
    fly.style.top = `${to.y - to.w / 2}px`;
    document.body.appendChild(fly);
    const dx = start.x - to.x, dy = start.y - to.y;
    const anim = fly.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(1.3)` },
      { transform: `translate(${dx * 0.4}px, ${dy * 0.5 - 40}px) scale(1.15)`, offset: 0.5 },
      { transform: 'translate(0, 0) scale(1)' },
    ], { duration: 420, delay: i * 55, easing: 'cubic-bezier(.4,.0,.3,1)', fill: 'backwards' });
    anim.onfinish = () => { fly.remove(); land(); };
  });
}

function flashTile(c, cls) {
  const tile = tiles.get(`${c.row},${c.col}`);
  if (!tile) return;
  tile.classList.remove(cls);
  void tile.offsetWidth;
  tile.classList.add(cls);
}

function freeTraps(count) {
  for (let k = 0; k < count; k++) {
    const trap = traps.find((t) => !t.free);
    if (!trap) return;
    trap.free = true;
    const rect = trap.el.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    setTimeout(() => {
      trap.el.classList.add('free');
      sfx.pop();
      fx.bubbles(x, y, 8);
      fx.burst(x, y, { count: 8, kinds: ['aqua', 'pink'], speed: 120, gravity: 40 });
      sea.addSwimmer(trap.id, x, y, { scale: window.innerWidth < 600 ? 0.8 : 1 });
      setTimeout(() => trap.el.classList.add('gone'), 700);
    }, 380 + k * 220);
  }
}

function showGloss(w, gloss, prefix = '') {
  if (!gloss) return;
  const el = $('gloss');
  el.querySelector('b').textContent = prefix ? `${prefix} ${w}` : w;
  el.querySelector('span').textContent = gloss;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  glossTimer = 4.5;
}

function say(text, cheer = false) {
  const el = $('speech');
  if (el.textContent !== text) el.textContent = text;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  const crab = document.querySelector('.pinch-row .crab');
  if (cheer && crab && !reduceMotion) {
    crab.classList.remove('cheer');
    void crab.getBoundingClientRect();
    crab.classList.add('cheer');
  }
}

function bump(id) {
  const el = $(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function flyCoins(fromEl, count) {
  const a = fromEl.getBoundingClientRect();
  const b = $('hud-coins').getBoundingClientRect();
  fx.coins({ x: a.left + a.width / 2, y: a.top + a.height / 2 }, { x: b.left + 18, y: b.top + b.height / 2 }, count + 2);
  setTimeout(() => bump('hud-coins'), 700);
}

function updateHud() {
  if (!round) return;
  $('hud-coins').querySelector('b').textContent = String(round.coins);
  $('hud-bonus').querySelector('b').textContent = String(round.bonusFound.size);
  const cost = round.hintCost();
  $('hint-cost').textContent = cost ? String(cost) : 'Free';
  $('btn-hint').classList.toggle('free', !cost);
  $('btn-hint').disabled = round.finished;
  $('btn-shuffle').disabled = round.finished;
}

// -------------------------------------------------------------- helpers

function useHint() {
  if (!round || mode !== 'play' || round.finished) return;
  clearSelection();
  const res = round.hint();
  if (!res.ok) {
    if (res.reason === 'coins') { say(pinch.say('nocoins')); sfx.bad(); bump('hud-coins'); }
    return;
  }
  sfx.hint();
  const tile = tiles.get(`${res.cell.row},${res.cell.col}`);
  if (tile) {
    tile.classList.add('on', 'hinted', 'pop');
    const c = tileCenter(tile);
    fx.burst(c.x, c.y, { count: 10, kinds: ['aqua'], speed: 120, gravity: 0 });
  }
  if (res.alsoFound.length) {
    freeTraps(res.alsoFound.length);
    for (const w of res.alsoFound) {
      const target = level.targets.find((t) => t.word === w);
      fillWord(target, null, true);
      showGloss(w, target.gloss);
    }
  }
  say(pinch.say('hint'));
  save.coins = round.coins;
  persist();
  updateHud();
  log.event('hint.used', { level: level.id, daily: !!level.daily, hints: round.hints, coins: round.coins });
  if (res.finish) finishSoon(res.finish);
}

function useShuffle() {
  if (!round || mode !== 'play' || round.finished) return;
  clearSelection();
  round.shuffle();
  sfx.shuffle();
  bubbles.forEach((el, i) => {
    el.classList.remove('swirl');
    void el.offsetWidth;
    el.classList.add('swirl');
    setTimeout(() => { el.textContent = round.wheel[i]; }, reduceMotion ? 0 : 200);
  });
  say(pinch.say('shuffle'));
}

function finishSoon(finish) {
  recordClear();
  resultTimer = 1.9;
  updateHud();
  setTimeout(() => {
    say(pinch.say('win'), true);
    sfx.win(finish.stars || 3);
  }, 700);
  const board = $('board').getBoundingClientRect();
  for (let k = 0; k < (reduceMotion ? 1 : 4); k++) {
    setTimeout(() => fx.burst(board.left + Math.random() * board.width, board.top + Math.random() * board.height, { count: 16, kinds: ['gold', 'pink', 'aqua'], speed: 220 }), 500 + k * 180);
  }
}

// Saves the cleared level the moment the last word lands, so pausing,
// restarting, leaving or reloading during the celebration never loses it.
function recordClear() {
  if (cleared) return cleared;
  const stars = round.stars();
  const rescued = round.rescued();
  let streak = null;
  if (level.daily) {
    const res = recordDaily(save, level, { rescued });
    streak = res.streak;
    log.event('daily.complete', { date: level.daily, streak: res.streak, already: res.already, hints: round.hints });
  } else {
    recordLevel(save, level, { score: round.score, stars, rescued, relax: save.relax });
  }
  save.coins = round.coins;
  save.words += round.typed.size;
  save.bonus += round.bonusFound.size;
  persist();
  log.event('level.complete', {
    level: level.id, daily: !!level.daily, stars, score: round.score, 'time.s': Math.round(playSeconds),
    hints: round.hints, bonus: round.bonusFound.size, misses: round.misses, relax: save.relax, autoplay: !!autoplay,
  });
  cleared = { stars, rescued, streak };
  return cleared;
}

function endLevel() {
  const { stars, rescued, streak } = recordClear();
  let lines = [];
  const buttons = [];

  $('res-title').textContent = level.daily ? 'Daily puzzle done!' : 'All critters rescued!';
  const starEls = $('res-stars').children;
  for (let k = 0; k < 3; k++) starEls[k].classList.toggle('on', k < stars);
  $('res-stars').classList.toggle('hidden', save.relax);
  $('res-relax').classList.toggle('hidden', !save.relax);
  const holder = $('res-critters');
  holder.innerHTML = '';
  level.traps.slice(0, rescued).forEach((id, i) => {
    const c = document.createElement('canvas');
    drawCritterIcon(c, id, 56);
    c.style.animationDelay = `${-i * 0.3}s`;
    c.title = CRITTERS[id].name;
    holder.appendChild(c);
  });
  lines.push(['Score', round.score.toLocaleString()]);
  lines.push(['Coins earned', `+${round.coinsEarned}`]);
  if (round.bonusFound.size) lines.push(['Bonus words', String(round.bonusFound.size)]);
  if (!save.relax && stars < 3) lines.push([`Finish with no hints for ${stars === 1 ? 'more stars' : '3 stars'}`]);
  if (streak) lines.push([`Daily streak: ${streak} day${streak === 1 ? '' : 's'}!`]);
  if (!level.daily && level.id === LEVEL_COUNT) lines.push(['You rescued every critter in the lagoon!']);
  if (!level.daily && level.id < LEVEL_COUNT) {
    const nextZone = level.id % LEVELS_PER_ZONE === 0 ? ZONES[level.zone + 1] : null;
    if (nextZone) lines.push([`New zone: ${nextZone.name}!`]);
    buttons.push([`Level ${level.id + 1} →`, true, () => startLevel(level.id + 1)]);
  }
  if (level.daily) buttons.push(['Back to title', true, toTitle]);
  buttons.push(['See the aquarium', false, toAquarium]);
  if (!level.daily) buttons.push(['Reef map', false, () => toMap(level.id)]);
  $('res-lines').innerHTML = '';
  for (const [a, b] of lines) {
    const div = document.createElement('div');
    if (b === undefined) { div.className = 'highlight'; div.textContent = a; }
    else { const s = document.createElement('span'); s.textContent = a; const v = document.createElement('b'); v.textContent = b; div.append(s, v); }
    $('res-lines').appendChild(div);
  }
  const row = $('res-buttons');
  row.innerHTML = '';
  for (const [label, primary, action] of buttons) {
    const button = document.createElement('button');
    button.className = `btn${primary ? ' primary' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => { sfx.click(); action(); });
    row.appendChild(button);
  }
  show('results');
  requestAnimationFrame(() => row.querySelector('button')?.focus({ preventScroll: true }));
}

function pause() {
  if (mode !== 'play') return;
  clearSelection();
  show('pause');
  syncToggles();
  requestAnimationFrame(() => $('btn-resume').focus({ preventScroll: true }));
}

function resume() {
  if (mode !== 'pause') return;
  show('play');
}

function toggleMute() {
  save.muted = !save.muted;
  sfx.unlock();
  sfx.setMuted(save.muted);
  persist();
  syncToggles();
}

// ------------------------------------------------------------------- input

const wheelEl = $('wheel');

function localPoint(event) {
  const rect = wheelEl.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function hit(p, slack = 1) {
  let best = -1, bestD = Infinity;
  centers.forEach((c, i) => {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bubbleRadius * slack && d < bestD) { bestD = d; best = i; }
  });
  return best;
}

wheelEl.addEventListener('pointerdown', (event) => {
  if (mode !== 'play' || !round || round.finished) return;
  sfx.unlock();
  event.preventDefault();
  // A second finger (or a resting palm) never takes over a swipe in progress.
  if (gesture && gesture.id !== event.pointerId) return;
  const p = localPoint(event);
  const i = hit(p, 1.15);
  if (i < 0) return;
  wheelEl.setPointerCapture?.(event.pointerId);
  focusIndex = -1;
  pointer = p;
  if (tapMode && selection.length) {
    if (i === selection.at(-1)) { removeLast(); if (!selection.length) tapMode = false; gesture = { moved: false, id: event.pointerId, tap: true }; renderSelection(); return; }
    if (selection.includes(i)) return;
    gesture = { moved: false, id: event.pointerId, tap: true };
    addLetter(i);
    return;
  }
  selection = [];
  gesture = { moved: false, id: event.pointerId, tap: false };
  addLetter(i);
});

wheelEl.addEventListener('pointermove', (event) => {
  if (!gesture || event.pointerId !== gesture.id) return;
  pointer = localPoint(event);
  const i = hit(pointer, 0.82);
  if (i >= 0) {
    if (selection.length >= 2 && i === selection.at(-2)) { removeLast(); gesture.moved = true; }
    else if (!selection.includes(i)) { addLetter(i); gesture.moved = true; }
  }
  renderSelection();
});

function endGesture(event) {
  if (!gesture || event.pointerId !== gesture.id) return;
  const moved = gesture.moved;
  gesture = null;
  pointer = null;
  if (moved && selection.length) submit();
  else { tapMode = selection.length > 0; renderSelection(); renderPreview(); }
}
wheelEl.addEventListener('pointerup', endGesture);
wheelEl.addEventListener('pointercancel', (event) => { if (gesture && event.pointerId === gesture.id) { gesture = null; pointer = null; renderSelection(); } });

function typeLetter(ch) {
  const i = round.wheel.findIndex((l, k) => l === ch && !selection.includes(k));
  if (i < 0) {
    const el = $('preview');
    el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad');
    return;
  }
  tapMode = true;
  addLetter(i);
}

addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (mode === 'play') { event.preventDefault(); pause(); }
    else if (mode === 'pause') { event.preventDefault(); resume(); }
    return;
  }
  if (mode !== 'play' || !round || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  if (/^[a-zA-Z]$/.test(key)) { event.preventDefault(); typeLetter(key.toLowerCase()); return; }
  if (key === 'Backspace') { event.preventDefault(); removeLast(); if (!selection.length) tapMode = false; renderPreview(); return; }
  if (key === 'Enter') { event.preventDefault(); submit(); return; }
  if (key === ' ') { event.preventDefault(); useShuffle(); return; }
  if (key === '?' || key === '/') { event.preventDefault(); useHint(); return; }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    event.preventDefault();
    const n = round.wheel.length;
    focusIndex = focusIndex < 0 ? 0 : (focusIndex + (key === 'ArrowRight' ? 1 : n - 1)) % n;
    renderSelection();
  }
});

// gamepad
let padPrev = {};
function focusables() {
  const screen = document.querySelector('.screen.overlay:not(.hidden)') || document.querySelector(`#screen-${mode}`);
  return [...(screen || document).querySelectorAll('button:not([disabled]), a[href]')].filter((el) => el.offsetParent !== null);
}
function moveFocus(step) {
  const list = focusables();
  if (!list.length) return;
  const at = list.indexOf(document.activeElement);
  const next = list[(at + step + list.length) % list.length] || list[0];
  next.focus();
}
function pollGamepad() {
  const pads = navigator.getGamepads?.() ?? [];
  const pad = [...pads].find((p) => p && p.connected);
  if (!pad) return;
  const pressed = {
    left: pad.buttons[14]?.pressed || pad.axes[0] < -0.5,
    right: pad.buttons[15]?.pressed || pad.axes[0] > 0.5,
    up: pad.buttons[12]?.pressed || pad.axes[1] < -0.5,
    down: pad.buttons[13]?.pressed || pad.axes[1] > 0.5,
    a: pad.buttons[0]?.pressed, b: pad.buttons[1]?.pressed, x: pad.buttons[2]?.pressed, y: pad.buttons[3]?.pressed,
    rb: pad.buttons[5]?.pressed || pad.buttons[7]?.pressed, start: pad.buttons[9]?.pressed,
  };
  const hitPad = (name) => pressed[name] && !padPrev[name];
  padPrev = pressed;
  if (hitPad('start')) { if (mode === 'play') pause(); else if (mode === 'pause') resume(); return; }
  if (mode === 'play' && round && !round.finished) {
    const n = round.wheel.length;
    if (hitPad('left') || hitPad('up')) { focusIndex = focusIndex < 0 ? 0 : (focusIndex + n - 1) % n; renderSelection(); }
    if (hitPad('right') || hitPad('down')) { focusIndex = focusIndex < 0 ? 0 : (focusIndex + 1) % n; renderSelection(); }
    if (hitPad('a') && focusIndex >= 0) {
      if (selection.at(-1) === focusIndex) removeLast();
      else { tapMode = true; addLetter(focusIndex); }
      renderPreview();
    }
    if (hitPad('b')) { removeLast(); renderPreview(); }
    if (hitPad('rb')) submit();
    if (hitPad('x')) useShuffle();
    if (hitPad('y')) useHint();
    return;
  }
  if (hitPad('up') || hitPad('left')) moveFocus(-1);
  if (hitPad('down') || hitPad('right')) moveFocus(1);
  if (hitPad('a')) document.activeElement?.click?.();
  if (hitPad('b') && mode === 'pause') resume();
}

// pointer hiding during play
let pointerIdle = 0;
let pointerHidden = false;
addEventListener('mousemove', () => { pointerIdle = 0; if (pointerHidden) { pointerHidden = false; document.body.classList.remove('no-cursor'); } });
function updatePointer(dt) {
  pointerIdle += dt;
  const hide = mode === 'play' && pointerIdle > 2 && !gesture;
  if (hide !== pointerHidden) {
    pointerHidden = hide;
    document.body.classList.toggle('no-cursor', hide);
  }
}

// ?autoplay: the solver spells words on the wheel, one letter at a time.
function autoplayStep(dt) {
  if (!autoplay || mode !== 'play' || !round || round.finished) return;
  autoplay.wait -= dt;
  if (autoplay.wait > 0) return;
  if (!autoplay.word) {
    autoplay.word = nextGuess(round, autoplay.tried);
    autoplay.step = 0;
    selection = [];
    if (!autoplay.word) return;
  }
  if (autoplay.step < autoplay.word.length) {
    const ch = autoplay.word[autoplay.step++];
    const i = round.wheel.findIndex((l, k) => l === ch && !selection.includes(k));
    if (i >= 0) { gesture = { moved: true, id: -1 }; pointer = centers[i]; addLetter(i); }
    autoplay.wait = 0.16;
    return;
  }
  autoplay.word = null;
  submit();
  autoplay.wait = 1.1;
}

// Another tab saved: take its progress, so this tab never writes a stale copy
// over it. A level in progress records into the fresh copy when it is done.
addEventListener('storage', (event) => {
  if (event.key !== SAVE_KEY && event.key !== null) return;
  const coinsBefore = save.coins;
  adoptSave(save, loadSave(storage));
  // Coins the other tab earned or spent carry into a round in progress here.
  if (round && !cleared) {
    round.coins = Math.max(0, round.coins + save.coins - coinsBefore);
    updateHud();
  }
  sfx.setMuted(save.muted);
  syncToggles();
  if (mode === 'title') toTitle();
  else if (mode === 'map') toMap();
});

// Frame telemetry.
const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, level: level ? level.id : 0, daily: !!level?.daily, swimmers: sea.swimmers.length }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => {
  monitor.reset(performance.now());
  if (document.hidden && mode === 'play') pause();
});

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  updatePointer(dt);
  pollGamepad();
  if (mode === 'play') {
    playSeconds += dt;
    autoplayStep(dt);
    if (previewTimer > 0) { previewTimer -= dt; if (previewTimer <= 0) { previewTimer = 0; renderPreview(); } }
    if (glossTimer > 0) { glossTimer -= dt; if (glossTimer <= 0) $('gloss').classList.add('hidden'); }
    if (resultTimer > 0) { resultTimer -= dt; if (resultTimer <= 0) endLevel(); }
    if (round && !round.finished && !selection.length) {
      idleTalk += dt;
      if (idleTalk > 22) { idleTalk = 0; say(pinch.say('stuck')); }
    }
  }
  if (mode !== 'pause') {
    sea.update(dt);
    fx.update(dt);
  }
  sea.draw();
  fx.draw();
  requestAnimationFrame(loop);
}
const loop = telemetry ? telemetry.guard(frame, 'letter-lagoon.frame') : frame;

// ------------------------------------------------------------------- wiring

const click = (id, fn) => $(id).addEventListener('click', () => { sfx.unlock(); sfx.click(); fn(); });
click('btn-play', () => startLevel(Math.min(save.unlocked, LEVEL_COUNT)));
click('btn-daily', startDaily);
click('btn-map', () => toMap());
click('btn-aquarium', toAquarium);
click('btn-relax', () => {
  save.relax = !save.relax;
  persist();
  syncToggles();
  log.event('relax.toggle', { relax: save.relax });
});
click('btn-title-mute', toggleMute);
for (const el of document.querySelectorAll('[data-to-title]')) el.addEventListener('click', () => { sfx.click(); toTitle(); });
click('btn-pause', pause);
click('btn-mute', toggleMute);
$('btn-hint').addEventListener('click', () => { sfx.unlock(); useHint(); $('btn-hint').blur(); });
$('btn-shuffle').addEventListener('click', () => { sfx.unlock(); useShuffle(); $('btn-shuffle').blur(); });
click('btn-resume', resume);
click('btn-restart', () => begin(level.daily ? dailyLevel(level.daily) : getLevel(level.id)));
click('btn-pause-mute', toggleMute);
click('btn-pause-map', () => toMap(level ? level.id : 1));

function onResize() {
  sea.resize();
  fx.resize();
  if (mode === 'aquarium') toAquarium();
  layout();
}
addEventListener('resize', onResize);
new ResizeObserver(() => layout()).observe($('board-wrap'));

$('hint-cost').textContent = String(HINT_COST);
syncToggles();

log.event('game.ready', { unlocked: save.unlocked, stars: totalStars(save), critters: totalCritters(save), relax: save.relax });
if (params.has('level')) startLevel(Number(params.get('level')));
else if (params.has('daily')) startDaily();
else if (params.has('map')) toMap();
else if (params.has('aquarium')) toAquarium();
else toTitle();

requestAnimationFrame(loop);

// Handy for poking at the game from the console and browser checks.
window.LL = { get round() { return round; }, get level() { return level; }, get mode() { return mode; }, save, startLevel, startDaily, toMap, toAquarium, sea, fx, sfx };
