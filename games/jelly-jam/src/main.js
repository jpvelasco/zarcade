// Screens, controls and the game loop for Jelly Jam.
import { Game, CONTINUE_MOVES } from './game.js';
import { getLevel, LEVELS, LEVEL_COUNT, AREAS, GOAL_ART } from './levels.js';
import { COLOR_NAMES } from './board.js';
import { BoardView, drawJellyIcon } from './render.js';
import { Sfx } from './audio.js';
import { renderMap, scrollToLevel } from './map.js';
import { loadSave, writeSave, totalStars, recordWin } from './save.js';
import { SPECIAL_LABELS } from './specials.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const save = loadSave(localStorage);
const sfx = new Sfx(save.muted);
const view = new BoardView($('board'), { reduceMotion });

let game = null;
let mode = 'title';
let levelId = Math.min(save.unlocked, LEVEL_COUNT);
let seed = Number(params.get('seed')) || 1;
let idle = 0;
let endTimer = 0;
let shownScore = 0;
let demo = null;
let demoWait = 0;
let lastPhase = null;

const TIPS = [
  'Swap a special jelly with anything to set it off.',
  'Two specials together make a much bigger splash.',
  'Long chains score far more — look for cascades.',
  'A rainbow pearl clears every jelly of one colour.',
  'Stuck? Wait a moment and a hint will glow.',
  'Sand needs a jelly cleared on top of it.',
  'Coral and ice crack when a match goes off beside them.',
];

// ------------------------------------------------------------------ screens

function show(next) {
  mode = next;
  const playing = ['play', 'pause', 'continue', 'results'].includes(next);
  $('screen-title').classList.toggle('hidden', next !== 'title');
  $('screen-map').classList.toggle('hidden', next !== 'map');
  $('screen-play').classList.toggle('hidden', !playing);
  $('screen-pause').classList.toggle('hidden', next !== 'pause');
  $('screen-continue').classList.toggle('hidden', next !== 'continue');
  $('screen-results').classList.toggle('hidden', next !== 'results');
  if (playing) layout();
  if (next !== 'play') document.body.classList.remove('no-cursor');
}

let titleJelliesDrawn = false;
function drawTitleJellies() {
  if (titleJelliesDrawn) return;
  titleJelliesDrawn = true;
  const row = $('jelly-row');
  for (let color = 0; color < COLOR_NAMES.length; color++) {
    const canvas = document.createElement('canvas');
    row.appendChild(canvas);
    drawJellyIcon(canvas, color, 46);
  }
}

function toTitle() {
  show('title');
  drawTitleJellies();
  const stars = totalStars(save);
  const cleared = Object.keys(save.stars).length;
  $('title-progress').textContent = cleared
    ? `★ ${stars} of ${LEVEL_COUNT * 3} · ${cleared} level${cleared === 1 ? '' : 's'} cleared · next up ${Math.min(save.unlocked, LEVEL_COUNT)}`
    : `${LEVEL_COUNT} levels across ${AREAS.length} reefs`;
  $('btn-play').textContent = cleared ? `Play level ${Math.min(save.unlocked, LEVEL_COUNT)}` : 'Play';
}

function toMap(focus = levelId) {
  show('map');
  renderMap($('map-holder'), save, startLevel);
  $('map-stars').textContent = `★ ${totalStars(save)}`;
  renderTabs();
  requestAnimationFrame(() => scrollToLevel($('map-scroll'), $('map-holder'), focus));
}

function renderTabs() {
  const tabs = $('area-tabs');
  tabs.innerHTML = '';
  AREAS.forEach((area, i) => {
    const button = document.createElement('button');
    const done = LEVELS.filter((l) => l.area === i && save.stars[l.id]).length;
    button.textContent = `${area.name} ${done}/${area.to - area.from + 1}`;
    button.className = levelId >= area.from && levelId <= area.to ? 'on' : '';
    button.addEventListener('click', () => scrollToLevel($('map-scroll'), $('map-holder'), area.from));
    tabs.appendChild(button);
  });
}

// --------------------------------------------------------------- the level

function startLevel(id, { keepSeed = false } = {}) {
  sfx.unlock();
  sfx.startMusic();
  levelId = Math.max(1, Math.min(LEVEL_COUNT, id));
  if (!keepSeed) seed = (Date.now() % 100000) + levelId;
  game = new Game(getLevel(levelId), { seed });
  view.setGame(game);
  shownScore = 0;
  idle = 0;
  endTimer = 0;
  lastPhase = null;
  buildGoals();
  show('play');
  layout();
  $('hud-tip').textContent = TIPS[(levelId - 1) % TIPS.length];
  toast(`Level ${levelId} · ${game.level.name}`, 1.6);
  if (demo) demo.reset();
}

function layout() {
  const stage = $('stage');
  const rect = stage.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  view.resize(Math.floor(rect.width), Math.floor(rect.height));
}

function buildGoals() {
  const list = $('hud-goals');
  list.innerHTML = '';
  for (const goal of game.goalStatus()) {
    const li = document.createElement('li');
    li.dataset.type = `${goal.type}${goal.color ?? ''}`;
    const art = document.createElement('span');
    art.className = 'g-art';
    if (goal.type === 'collect') {
      const canvas = document.createElement('canvas');
      art.appendChild(canvas);
      drawJellyIcon(canvas, goal.color);
    } else {
      art.textContent = GOAL_ART[goal.type];
    }
    const text = document.createElement('span');
    text.className = 'g-text';
    text.innerHTML = `<b>${goal.label}</b>`;
    const count = document.createElement('span');
    count.className = 'g-count';
    li.append(art, text, count);
    list.appendChild(li);
  }
  updateHud(true);
}

function updateHud(force = false) {
  if (!game) return;
  const level = game.level;
  $('hud-level').textContent = `Level ${level.id}`;
  $('hud-area').textContent = AREAS[level.area].name;
  $('hud-moves').textContent = game.moves;
  $('hud-moves').parentElement.classList.toggle('low', game.moves <= 3 && game.phase !== 'won');
  const target = game.score;
  shownScore += (target - shownScore) * (force ? 1 : 0.22);
  if (Math.abs(target - shownScore) < 1) shownScore = target;
  $('hud-score').textContent = Math.round(shownScore).toLocaleString();
  const top = level.stars[2];
  $('hud-bar').style.width = `${Math.min(100, (game.score / top) * 100)}%`;
  const stars = game.stars();
  const starEls = $('hud-stars').children;
  for (let k = 0; k < 3; k++) starEls[k].classList.toggle('on', k < stars);
  for (const pip of $('hud-bar').parentElement.querySelectorAll('.pip')) {
    pip.style.left = `${(level.stars[Number(pip.dataset.star) - 1] / top) * 100}%`;
  }
  const items = $('hud-goals').children;
  game.goalStatus().forEach((goal, i) => {
    const li = items[i];
    if (!li) return;
    li.classList.toggle('done', goal.done);
    li.querySelector('.g-count').textContent = goal.type === 'score'
      ? `${Math.round(Math.min(shownScore, goal.need)).toLocaleString()}/${goal.need.toLocaleString()}`
      : `${goal.have}/${goal.need}`;
  });
}

let toastTimer = 0;
function toast(text, seconds = 1.4) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  toastTimer = seconds;
}

function combo(text) {
  const el = $('combo');
  el.textContent = text;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(combo.timer);
  combo.timer = setTimeout(() => el.classList.add('hidden'), 800);
}

// ------------------------------------------------------------------- input

function trySwap(a, b) {
  if (!game || mode !== 'play' || view.busy) return;
  idle = 0;
  view.hint = null;
  const res = game.swap(a, b);
  if (!res.ok) {
    if (res.reason === 'nomatch') {
      view.swapAnim(a, b, { fail: true });
      sfx.wobble();
    }
    return;
  }
  view.selected = -1;
  view.swapAnim(a, b);
  sfx.squelch(true);
  if (res.combo && SPECIAL_LABELS[res.combo]) combo(SPECIAL_LABELS[res.combo]);
}

function pick(index) {
  if (!game || view.busy) return;
  idle = 0;
  view.hint = null;
  if (view.selected === index) { view.selected = -1; return; }
  if (view.selected >= 0) {
    const board = game.board;
    const near = Math.abs(board.col(view.selected) - board.col(index)) + Math.abs(board.row(view.selected) - board.row(index));
    if (near === 1) {
      const from = view.selected;
      view.selected = -1;
      trySwap(from, index);
      return;
    }
  }
  const cell = game.board.at(index);
  if (!cell || cell.kind !== 'jelly' || cell.ice > 0) {
    sfx.wobble();
    view.selected = -1;
    return;
  }
  view.selected = index;
  sfx.squelch(false);
}

// pointer: click-click or drag/swipe
let drag = null;
const canvas = $('board');

canvas.addEventListener('pointerdown', (event) => {
  if (mode !== 'play' || !game) return;
  canvas.setPointerCapture?.(event.pointerId);
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left, y = event.clientY - rect.top;
  const index = view.cellAt(x, y);
  if (index < 0) { view.selected = -1; return; }
  drag = { index, x, y, moved: false };
  pick(index);
});

canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left, y = event.clientY - rect.top;
  view.pointer = { x, y };
  view.hover = view.cellAt(x, y);
  if (!drag || !game || view.busy) return;
  const dx = x - drag.x, dy = y - drag.y;
  const need = view.tile * 0.38;
  if (Math.hypot(dx, dy) < need) return;
  const board = game.board;
  const c = board.col(drag.index), r = board.row(drag.index);
  const [sc, sr] = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  drag.moved = true;
  const from = drag.index;
  drag = null;
  view.selected = -1;
  if (!board.inside(c + sc, r + sr)) return;
  trySwap(from, board.idx(c + sc, r + sr));
});

for (const type of ['pointerup', 'pointercancel']) {
  canvas.addEventListener(type, () => { drag = null; });
}

canvas.addEventListener('pointerleave', () => { view.pointer = null; view.hover = -1; });

// keyboard
const keyDirs = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1],
};

addEventListener('keydown', (event) => {
  if (event.code === 'Escape' || event.code === 'KeyP') {
    event.preventDefault();
    if (mode === 'play') pause();
    else if (mode === 'pause') resume();
    return;
  }
  if (event.code === 'KeyM') { toggleMute(); return; }
  if (mode !== 'play' || !game) return;
  if (event.code === 'KeyH') { showHint(true); return; }
  const dir = keyDirs[event.code];
  if (dir) {
    event.preventDefault();
    moveCursor(dir[0], dir[1]);
    return;
  }
  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault();
    if (view.cursor < 0) view.cursor = firstPlayable();
    else pick(view.cursor);
  }
});

function firstPlayable() {
  const board = game.board;
  return board.playableIndices().find((i) => board.at(i)?.kind === 'jelly') ?? board.playableIndices()[0];
}

function moveCursor(dc, dr) {
  const board = game.board;
  if (view.cursor < 0) { view.cursor = firstPlayable(); return; }
  const c = board.col(view.cursor), r = board.row(view.cursor);
  if (!board.inside(c + dc, r + dr)) return;
  const next = board.idx(c + dc, r + dr);
  if (!board.playable(next)) return;
  if (view.selected === view.cursor) {
    const from = view.selected;
    view.selected = -1;
    view.cursor = next;
    trySwap(from, next);
    return;
  }
  view.cursor = next;
  idle = 0;
  view.hint = null;
}

// gamepad
let padPrev = {};
function pollGamepad() {
  const pads = navigator.getGamepads?.() ?? [];
  const pad = [...pads].find((p) => p && p.connected);
  if (!pad) return;
  const pressed = {
    left: pad.buttons[14]?.pressed || pad.axes[0] < -0.5,
    right: pad.buttons[15]?.pressed || pad.axes[0] > 0.5,
    up: pad.buttons[12]?.pressed || pad.axes[1] < -0.5,
    down: pad.buttons[13]?.pressed || pad.axes[1] > 0.5,
    action: pad.buttons[0]?.pressed,
    start: pad.buttons[9]?.pressed,
  };
  const hit = (name) => pressed[name] && !padPrev[name];
  if (hit('start')) { if (mode === 'play') pause(); else if (mode === 'pause') resume(); }
  if (mode === 'play' && game) {
    if (hit('left')) moveCursor(-1, 0);
    if (hit('right')) moveCursor(1, 0);
    if (hit('up')) moveCursor(0, -1);
    if (hit('down')) moveCursor(0, 1);
    if (hit('action')) { if (view.cursor < 0) view.cursor = firstPlayable(); else pick(view.cursor); }
  }
  padPrev = pressed;
}

// ------------------------------------------------------------------ states

function pause() {
  if (mode !== 'play') return;
  show('pause');
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
  writeSave(localStorage, save);
  $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
  $('btn-pause-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
}

function showHint(force = false) {
  if (!game || game.phase !== 'input') return;
  const move = game.bestMove();
  if (move) view.hint = move;
  if (force && !move) toast('No moves left — shuffling!');
}

function showContinue() {
  show('continue');
  const left = game.goalStatus().filter((g) => !g.done);
  $('continue-detail').textContent = left.length
    ? `Still to do: ${left.map((g) => `${g.label} (${g.have}/${g.need})`).join(', ')}.`
    : 'So close!';
  sfx.sad();
}

function endLevel() {
  const won = game.phase === 'won';
  const stars = won ? Math.max(1, game.stars()) : 0;
  const lines = [];
  const buttons = [];
  $('res-title').textContent = won ? 'Level cleared!' : 'Out of moves';
  $('res-score').textContent = Math.round(game.score).toLocaleString();
  const starEls = $('res-stars').children;
  for (let k = 0; k < 3; k++) starEls[k].classList.toggle('on', k < stars);
  if (won) {
    const before = save.best[levelId] | 0;
    const result = recordWin(save, levelId, { score: game.score, stars });
    writeSave(localStorage, save);
    lines.push(['Best score', result.best.toLocaleString()]);
    if (game.score > before) lines.push(['New personal best!']);
    if (game.bestChain > 1) lines.push(['Longest chain', `×${game.bestChain}`]);
    if (game.counts.eggs) lines.push(['Turtles freed', game.counts.eggs]);
    if (stars < 3) lines.push([`Score ${game.level.stars[stars].toLocaleString()} for ${stars + 1} stars`]);
    if (levelId < LEVEL_COUNT) buttons.push([`Level ${levelId + 1} →`, true, () => startLevel(levelId + 1)]);
    else lines.push(['You freed every turtle in the reef!']);
    buttons.push(['Replay', false, () => startLevel(levelId)]);
    sfx.fanfare(stars);
    for (let k = 0; k < stars; k++) setTimeout(() => sfx.star(k), 500 + k * 280);
  } else {
    lines.push(['Score', Math.round(game.score).toLocaleString()]);
    for (const goal of game.goalStatus()) lines.push([goal.label, `${goal.have}/${goal.need}`]);
    buttons.push(['Try again', true, () => startLevel(levelId)]);
  }
  buttons.push(['Reef map', false, () => toMap(levelId)]);
  $('res-lines').innerHTML = lines
    .map(([a, b]) => (b === undefined ? `<div class="highlight">${a}</div>` : `<div><span>${a}</span><b>${b}</b></div>`))
    .join('');
  const row = $('res-buttons');
  row.innerHTML = '';
  for (const [label, primary, action] of buttons) {
    const button = document.createElement('button');
    button.className = `btn${primary ? ' primary' : ''}`;
    button.textContent = label;
    button.addEventListener('click', action);
    row.appendChild(button);
  }
  show('results');
}

// -------------------------------------------------------------- the loop

function pumpGame(dt) {
  if (!game) return;
  if (game.phase !== lastPhase) {
    if (game.phase === 'finale') combo('Reef party! 🎉');
    lastPhase = game.phase;
  }
  if (view.busy) return;
  if (game.phase === 'resolving' || game.phase === 'finale') {
    const step = game.step();
    if (step) {
      view.playStep(step);
      view.reconcile();
      sfx.handleStep(step);
      if (step.type === 'clear' && step.chain >= 3) combo(`${step.chain}× chain!`);
      updateHud(false);
    }
    return;
  }
  if (game.pendingShuffle) {
    toast('No moves — shuffling the reef!', 1.6);
    const step = game.doShuffle();
    view.playStep(step);
    sfx.handleStep(step);
    return;
  }
  if (game.phase === 'won' || game.phase === 'lost') {
    endTimer += dt;
    if (endTimer > 0.6) endLevel();
    return;
  }
  if (game.phase === 'outOfMoves') {
    showContinue();
    return;
  }
  // waiting for a move
  idle += dt;
  if (idle > 5 && !view.hint) showHint();
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

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePointer(dt);
  pollGamepad();
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $('toast').classList.add('hidden');
  }
  if (mode === 'play') {
    pumpGame(dt);
    if (demo) demoStep(dt);
  }
  if (game) {
    if (mode !== 'pause') view.update(dt);
    view.draw();
    updateHud(false);
  }
  requestAnimationFrame(frame);
}

// A hands-off demo, handy for screenshots: ?demo plays itself.
function demoStep(dt) {
  if (!game || view.busy || game.phase !== 'input') return;
  demoWait -= dt;
  if (demoWait > 0) return;
  demoWait = 0.35;
  const move = demo.pick(game);
  if (move) trySwap(move.a, move.b);
}

// ------------------------------------------------------------------- wiring

$('btn-play').addEventListener('click', () => startLevel(Math.min(save.unlocked, LEVEL_COUNT)));
$('btn-map').addEventListener('click', () => toMap());
for (const el of document.querySelectorAll('[data-to-title]')) el.addEventListener('click', toTitle);
$('btn-back').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-hint').addEventListener('click', () => showHint(true));
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startLevel(levelId));
$('btn-pause-mute').addEventListener('click', toggleMute);
$('btn-pause-map').addEventListener('click', () => toMap(levelId));
$('btn-continue').addEventListener('click', () => {
  if (game.useContinue()) {
    show('play');
    toast(`+${CONTINUE_MOVES} moves!`, 1.4);
    sfx.chime('stripe');
  }
});
$('btn-giveup').addEventListener('click', () => {
  game.giveUp();
  show('play');
  endTimer = 0.5;
});
addEventListener('resize', layout);
addEventListener('orientationchange', () => setTimeout(layout, 120));
new ResizeObserver(layout).observe($('stage'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') pause();
});
for (const el of document.querySelectorAll('button, .btn')) {
  el.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
}

// bubbles in the backdrop are decorative; nothing to wire.
$('btn-mute').textContent = save.muted ? '🔇' : '🔊';

if (params.has('demo')) {
  import('./ai.js').then((ai) => {
    demo = { pick: (g) => ai.pickMove(g, { depth: 5 }), reset: () => { demoWait = 0.5; } };
  });
}

if (params.has('level')) startLevel(Number(params.get('level')), { keepSeed: Boolean(params.get('seed')) });
else if (params.has('map')) toMap();
else toTitle();

requestAnimationFrame(frame);

// Handy for poking at the game from the console.
window.JJ = { get game() { return game; }, view, save, startLevel, toMap, sfx, LEVELS, COLOR_NAMES };
