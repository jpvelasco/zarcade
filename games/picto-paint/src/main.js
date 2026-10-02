// Browser entry: screens, input, the loop, sound, saves and telemetry.
import { Board, UNKNOWN, CROSS } from './board.js';
import { nextHint, applyHint } from './hints.js';
import { Renderer, shade, bakeTile } from './render.js';
import { Sound } from './audio.js';
import { loadSave, writeSave, storeProgress } from './save.js';
import { frameMonitor } from './perf.js';
import { dailyCritter, dateKey, recordDaily, liveStreak, mulberry32 } from './daily.js';
import {
  ALBUMS, PUZZLES, BY_ID, MAX_STARS, PALETTES, PENCILS, totalStars, solvedCount, albumUnlocked, albumStats,
  recordSolve, nextPuzzle, puzzleAfter, unlockedCosmetics, formatTime,
} from './progress.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

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

const unlockAll = params.has('unlock');
const isOpen = (ai) => unlockAll || albumUnlocked(save, ai);

const renderer = new Renderer($('stage'), { reduced });
const sound = new Sound({ sound: save.settings.sound, music: save.settings.music });

let mode = 'title';
let puzzle = null;
let board = null;
let daily = null; // date key when playing the daily critter
let tool = 'fill';
let colour = 0;
let lastAlbum = 0;
let toastTimer = 0;
let hintTimer = 0;
let progressDirty = false;
let correctionsTold = 0;
let autoMode = params.has('autoplay');
let autoWait = 0.6;
let crashNext = false;

const SCREENS = ['screen-title', 'screen-albums', 'screen-album', 'screen-gallery', 'screen-viewer', 'screen-studio', 'screen-intro', 'screen-pause', 'screen-results'];

function show(next, screen) {
  mode = next;
  renderer.backdropAlpha = next === 'title' ? 0.9 : 0.35;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== screen);
  const playing = ['play', 'paused', 'intro', 'reveal'].includes(next);
  $('hud').classList.toggle('hidden', !playing || next === 'reveal');
  $('toolbar').classList.toggle('hidden', next !== 'play' && next !== 'paused' && next !== 'intro');
  if (next !== 'play') {
    document.body.classList.remove('no-cursor');
    hideHint();
    if (next !== 'paused') { $('toast').classList.add('hidden'); toastTimer = 0; }
  }
  if (screen) {
    const el = $(screen).querySelector('.btn.primary:not([disabled]), .tile.next, .album:not([disabled]), .btn:not([disabled])');
    el?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(next === 'play' ? 0.8 : next === 'paused' ? 0.35 : 1);
  requestAnimationFrame(updateInsets);
}

function toast(text, secs = 2.2) {
  $('toast').textContent = text;
  $('toast').classList.remove('hidden');
  toastTimer = secs;
}

// ------------------------------------------------------------ theme

function currentPalette() {
  const open = unlockedCosmetics(save).palettes;
  const id = unlockAll || open.includes(save.settings.palette) ? save.settings.palette : 'paper';
  return PALETTES.find((p) => p.id === id) || PALETTES[0];
}

function currentPencil() {
  const open = unlockedCosmetics(save).pencils;
  return unlockAll || open.includes(save.settings.pencil) ? save.settings.pencil : 'graphite';
}

function applyTheme() {
  const pal = currentPalette();
  document.body.classList.toggle('dark', pal.dark);
  document.body.style.setProperty('--page', pal.page[0]);
  document.body.style.setProperty('--accent', pal.accent);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', pal.page[0]);
  renderer.setTheme(pal, currentPencil());
}

// ------------------------------------------------------------ title

function buildLogo() {
  // A tiny 7×7 heart that pops in pixel by pixel.
  const art = ['.rr.rr.', 'rrrrrro', 'rrrrooo', 'yrrooyy', '.yyoyy.', '..yyy..', '...g...'];
  const cols = { r: '#ef6f6c', o: '#f39a3d', y: '#f7c843', g: '#5cbf5a' };
  let html = '';
  let k = 0;
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    html += `<rect x="${x * 10}" y="${y * 10}" width="9" height="9" rx="2" fill="${cols[ch]}" style="animation-delay:${(k++ * 0.03).toFixed(2)}s"/>`;
  }));
  $('logo-pixels').innerHTML = html;
}

function backdropPics() {
  const pics = [];
  const solved = PUZZLES.filter((p) => save.puzzles[p.id]?.solved);
  const rnd = mulberry32(Math.floor(Math.random() * 1e9));
  for (let k = solved.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [solved[k], solved[j]] = [solved[j], solved[k]];
  }
  for (const p of solved.slice(0, 5)) pics.push(Object.assign({}, renderer.pic(p), { anim: p.anim }));
  // Fill up with random little critters: they never spoil a puzzle.
  let n = 0;
  while (pics.length < 7) {
    const c = dailyCritter(`backdrop-${Math.floor(rnd() * 99999)}-${n++}`).puzzle;
    pics.push(Object.assign({}, renderer.pic(c), { anim: c.anim }));
  }
  return pics;
}

function toTitle() {
  leavePuzzle();
  renderer.setBackdrop(backdropPics());
  const next = nextPuzzle(save);
  const resume = save.progress[next.id];
  $('btn-play').textContent = resume ? `Continue · ${save.puzzles[next.id]?.solved ? next.name : `${ALBUMS[next.album].name} #${next.number}`}` : solvedCount(save) ? `Play · ${ALBUMS[next.album].name}` : 'Play';
  const key = dateKey();
  const streak = liveStreak(save.daily, key);
  $('btn-daily').textContent = save.daily.done[key] != null ? '🐛 Daily Critter ✓' : streak ? `🐛 Daily Critter · 🔥${streak}` : '🐛 Daily Critter';
  const bits = [`★ ${totalStars(save)} / ${MAX_STARS}`, `${solvedCount(save)} pictures`];
  if (streak) bits.push(`🔥 ${streak}-day streak`);
  else if (save.daily.best) bits.push(`best streak ${save.daily.best}`);
  $('title-stats').textContent = bits.join(' · ');
  syncToggles();
  show('title', 'screen-title');
}

// ------------------------------------------------------------ albums

function albumCover(ai) {
  const album = ALBUMS[ai];
  const solved = album.built.filter((p) => save.puzzles[p.id]?.solved);
  if (solved.length) return renderer.thumb(solved[solved.length - 1], 84);
  const c = document.createElement('canvas');
  c.width = c.height = 168;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if ((x + y * 3) % 4) g.fillRect(14 + x * 20, 14 + y * 20, 17, 17);
  return c;
}

function openAlbums() {
  leavePuzzle();
  renderer.setBackdrop(backdropPics());
  $('albums-stars').textContent = `★ ${totalStars(save)} / ${MAX_STARS}`;
  const list = $('album-list');
  list.innerHTML = '';
  ALBUMS.forEach((album, ai) => {
    const open = isOpen(ai);
    const st = albumStats(save, ai);
    const b = document.createElement('button');
    b.className = `album${album.colour ? ' colour' : ''}`;
    b.style.background = `linear-gradient(135deg, ${album.tint}, ${shade(album.tint, 0.55)})`;
    b.disabled = !open;
    const need = album.unlock - solvedCount(save);
    b.innerHTML = `<div class="cover"></div><div><h4>${album.name}</h4><p>${album.blurb}</p>${
      open
        ? `<div class="meta">${st.solved}/${st.total} pictures · <span class="gold">★ ${st.stars}/${st.maxStars}</span></div><div class="bar-track"><div class="bar-fill" style="width:${(st.solved / st.total) * 100}%"></div></div>`
        : `<div class="lock">🔒 Finish ${need} more picture${need === 1 ? '' : 's'} to open</div>`
    }</div>`;
    b.querySelector('.cover').appendChild(albumCover(ai));
    b.addEventListener('click', () => { sound.click(); openAlbum(ai); });
    list.appendChild(b);
  });
  show('albums', 'screen-albums');
  log.event('albums.open', { solved: solvedCount(save) });
}

function starString(n) {
  return `${'★'.repeat(n)}<span class="off">${'★'.repeat(3 - n)}</span>`;
}

function openAlbum(ai) {
  leavePuzzle();
  renderer.setBackdrop(backdropPics());
  lastAlbum = ai;
  const album = ALBUMS[ai];
  const st = albumStats(save, ai);
  $('album-name').textContent = album.name;
  $('album-blurb').textContent = album.blurb;
  $('album-stars').textContent = `★ ${st.stars}/${st.maxStars}`;
  const grid = $('puzzle-grid');
  grid.innerHTML = '';
  const nextId = album.built.find((p) => !save.puzzles[p.id]?.solved)?.id;
  for (const p of album.built) {
    const r = save.puzzles[p.id];
    const b = document.createElement('button');
    b.className = `tile${p.id === nextId ? ' next' : ''}`;
    if (r?.solved) b.appendChild(renderer.thumb(p, 84));
    else {
      const q = document.createElement('div');
      q.className = 'q';
      q.textContent = '?';
      b.appendChild(q);
    }
    b.insertAdjacentHTML('beforeend', `<div class="nm">${r?.solved ? p.name : `#${p.number}`}</div><div class="st">${r?.solved ? starString(r.stars) : ''}</div><div class="sz">${p.w}×${p.h}${r?.best != null ? ` · ${formatTime(r.best)}` : ''}</div>`);
    if (save.progress[p.id]) b.insertAdjacentHTML('beforeend', '<span class="badge">in progress</span>');
    b.title = r?.solved ? `${p.name} · best ${formatTime(r.best)}` : `Picture ${p.number} · ${p.w}×${p.h}`;
    b.addEventListener('click', () => startPuzzle(p));
    grid.appendChild(b);
  }
  show('album', 'screen-album');
}

// ------------------------------------------------------------ gallery

let viewerList = [];
let viewerIndex = 0;

function openGallery() {
  leavePuzzle();
  renderer.setBackdrop(backdropPics());
  const body = $('gallery-body');
  body.innerHTML = '';
  viewerList = [];
  const solved = solvedCount(save);
  const count = solved + save.critters.length;
  $('gallery-count').textContent = `${count} picture${count === 1 ? '' : 's'}`;
  const addShelf = (title, items, meta) => {
    const shelf = document.createElement('div');
    shelf.className = 'gallery-shelf';
    shelf.innerHTML = `<h3><span>${title}</span><span class="muted">${meta}</span></h3><div class="gallery-grid"></div>`;
    const grid = shelf.querySelector('.gallery-grid');
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'tile';
      if (it.done) {
        const index = viewerList.length;
        viewerList.push(it);
        b.appendChild(renderer.thumb(it.p, 64));
        b.insertAdjacentHTML('beforeend', `<div class="nm">${it.p.name}</div>`);
        b.addEventListener('click', () => openViewer(index));
      } else {
        b.disabled = true;
        b.innerHTML = `<div class="q">?</div><div class="sz">${it.p.w}×${it.p.h}</div>`;
      }
      grid.appendChild(b);
    }
    body.appendChild(shelf);
  };
  if (save.critters.length) {
    const items = save.critters.slice(0, 60).map((key) => ({ p: dailyCritter(key).puzzle, done: true, sub: `Daily Critter · ${key}` }));
    addShelf('🐛 Daily Critters', items, `🔥 best streak ${save.daily.best}`);
  }
  ALBUMS.forEach((album, ai) => {
    if (!isOpen(ai)) return;
    const st = albumStats(save, ai);
    addShelf(album.name, album.built.map((p) => ({ p, done: !!save.puzzles[p.id]?.solved, sub: `${album.name} · #${p.number}` })), `${st.solved}/${st.total}`);
  });
  if (!viewerList.length) body.insertAdjacentHTML('afterbegin', '<p class="gallery-empty muted">Finish a picture and it will hang here, wiggling and blinking.</p>');
  show('gallery', 'screen-gallery');
}

function openViewer(index) {
  viewerIndex = (index + viewerList.length) % viewerList.length;
  const it = viewerList[viewerIndex];
  $('viewer-name').textContent = it.p.name;
  const r = save.puzzles[it.p.id];
  $('viewer-sub').textContent = r ? `${it.sub} · ${'★'.repeat(r.stars)} · best ${formatTime(r.best)}` : it.sub;
  renderer.setViewer(renderer.pic(it.p), it.p.anim);
  show('viewer', 'screen-viewer');
  requestAnimationFrame(updateInsets);
}

// ------------------------------------------------------------ studio

function openStudio() {
  leavePuzzle();
  renderer.setBackdrop(backdropPics());
  const stars = totalStars(save);
  $('studio-stars').textContent = `★ ${stars}`;
  for (const b of document.querySelectorAll('.mode-btn')) b.setAttribute('aria-checked', String(b.dataset.mode === save.settings.mode));
  const pl = $('palette-list');
  pl.innerHTML = '';
  for (const p of PALETTES) {
    const open = unlockAll || p.stars <= stars;
    const b = document.createElement('button');
    b.className = 'swatch';
    b.disabled = !open;
    b.setAttribute('aria-checked', String(currentPalette().id === p.id));
    const c = document.createElement('canvas');
    c.width = 220; c.height = 112;
    const g = c.getContext('2d');
    g.fillStyle = p.page[0]; g.fillRect(0, 0, 220, 112);
    g.fillStyle = p.board; g.fillRect(30, 16, 160, 80);
    g.fillStyle = p.grid;
    for (let x = 0; x <= 8; x++) g.fillRect(30 + x * 20, 16, 1.5, 80);
    for (let y = 0; y <= 4; y++) g.fillRect(30, 16 + y * 20, 160, 1.5);
    const tileC = bakeTile('graphite', p.ink, p.dark);
    [[1, 1], [2, 1], [3, 2], [5, 1], [6, 2], [4, 3]].forEach(([x, y]) => g.drawImage(tileC, 30 + x * 20, 16 + y * 20, 20, 20));
    b.appendChild(c);
    b.insertAdjacentHTML('beforeend', `<span>${p.name}</span><small>${open ? (p.stars ? `★ ${p.stars}` : 'Starter') : `🔒 ★ ${p.stars}`}</small>`);
    b.addEventListener('click', () => {
      save.settings.palette = p.id;
      persist();
      applyTheme();
      sound.click();
      openStudio();
      log.event('cosmetic.select', { kind: 'palette', id: p.id });
    });
    pl.appendChild(b);
  }
  const ll = $('pencil-list');
  ll.innerHTML = '';
  const pal = currentPalette();
  for (const p of PENCILS) {
    const open = unlockAll || p.stars <= stars;
    const b = document.createElement('button');
    b.className = 'swatch';
    b.disabled = !open;
    b.setAttribute('aria-checked', String(currentPencil() === p.id));
    const c = document.createElement('canvas');
    c.width = 220; c.height = 112;
    const g = c.getContext('2d');
    g.fillStyle = pal.board; g.fillRect(0, 0, 220, 112);
    ['#ef6f6c', '#f7c843', '#5cbf5a', '#4a8fe0', pal.ink].forEach((hex, k) => g.drawImage(bakeTile(p.id, hex, pal.dark), 8 + k * 42, 34, 42, 42));
    b.appendChild(c);
    b.insertAdjacentHTML('beforeend', `<span>${p.name}</span><small>${open ? (p.stars ? `★ ${p.stars}` : 'Starter') : `🔒 ★ ${p.stars}`}</small>`);
    b.addEventListener('click', () => {
      save.settings.pencil = p.id;
      persist();
      applyTheme();
      sound.click();
      openStudio();
      log.event('cosmetic.select', { kind: 'pencil', id: p.id });
    });
    ll.appendChild(b);
  }
  syncToggles();
  show('studio', 'screen-studio');
}

function setMode(m) {
  save.settings.mode = m;
  if (board) board.mode = m;
  persist();
  syncToggles();
  log.event('mode.change', { mode: m });
}

// ------------------------------------------------------------ play

function renderPaints() {
  const box = $('paints');
  box.innerHTML = '';
  box.classList.toggle('colour', puzzle.colour);
  $('toolbar').classList.toggle('colour', puzzle.colour);
  const paints = puzzle.colour ? puzzle.paints : [currentPalette().ink];
  paints.forEach((hex, k) => {
    const b = document.createElement('button');
    b.className = 'paint';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', puzzle.colour ? `Paint ${k + 1}` : 'Fill');
    b.title = puzzle.colour ? `Paint ${k + 1} (${k + 1})` : 'Fill tool (Space)';
    b.innerHTML = `<span class="chip" style="background:${hex}"></span>${puzzle.colour ? `<kbd>${k + 1}</kbd>` : '<b>Fill</b>'}`;
    b.addEventListener('click', () => { tool = 'fill'; colour = k; syncTools(); sound.click(); });
    box.appendChild(b);
  });
  syncTools();
}

function syncTools() {
  [...$('paints').children].forEach((b, k) => b.setAttribute('aria-checked', String(tool === 'fill' && colour === k)));
  $('btn-cross').setAttribute('aria-pressed', String(tool === 'cross'));
  $('btn-undo').disabled = !board || !board.undoStack.length;
  renderer.tool = tool;
  renderer.colour = colour;
}

function updateInsets() {
  const hud = $('hud').getBoundingClientRect();
  const bar = $('toolbar');
  if (mode !== 'reveal' && mode !== 'results') {
    const top = $('hud').classList.contains('hidden') ? 10 : hud.bottom + 6;
    const box = bar.getBoundingClientRect();
    const side = !bar.classList.contains('hidden') && box.height > box.width;
    const bottom = bar.classList.contains('hidden') || side ? 12 : window.innerHeight - box.top + 8;
    const right = side ? window.innerWidth - box.left + 4 : 0;
    renderer.layout({ top, bottom, right });
  }
  const card = mode === 'results' ? $('screen-results').querySelector('.card') : mode === 'viewer' ? $('screen-viewer').querySelector('.card') : null;
  const rect = card ? card.getBoundingClientRect() : null;
  renderer.cardTop = rect ? rect.top : 0;
  renderer.cardRect = rect ? { top: rect.top, left: rect.left } : null;
  renderer.dirty = true;
}

function saveProgress() {
  if (!board || !puzzle || board.solved) return;
  if (!board.filledCount() && !board.undoStack.length) return;
  // The Daily Critter keeps its board too (its id carries the date).
  storeProgress(save, puzzle.id, { cells: board.serialize(), time: Math.round(board.time), hints: board.hints });
  if (!daily) save.lastPlayed = puzzle.id;
  persist();
  progressDirty = false;
}

function leavePuzzle() {
  if (board && !board.solved && ['play', 'paused', 'intro'].includes(mode)) {
    saveProgress();
    log.event('level.leave', { puzzle: puzzle.id, filled: board.filledCount(), seconds: Math.round(board.time) });
  }
}

function startPuzzle(p, { dailyKey = null, fresh = false } = {}) {
  sound.unlock();
  puzzle = p;
  daily = dailyKey;
  const prog = !fresh ? save.progress[p.id] : null;
  const cells = prog ? Board.parseCells(prog.cells, p.w * p.h) : null;
  board = new Board(p, { mode: save.settings.mode, cells, time: cells ? prog.time : 0, hints: cells ? prog.hints : 0 });
  tool = 'fill';
  colour = 0;
  renderer.warm(p.colour ? p.paints : [currentPalette().ink]);
  renderer.setBoard(board);
  renderer.scene = 'play';
  renderer.showCursor = !coarse && false;
  $('hud-name').textContent = dailyKey ? 'Daily Critter' : `#${p.number} · ${save.puzzles[p.id]?.solved ? p.name : 'Mystery picture'}`;
  $('hud-sub').textContent = `${dailyKey ? dailyKey : ALBUMS[p.album].name} · ${p.w}×${p.h} · ★ under ${formatTime(p.par)}`;
  lastTimeText = '';
  updateTime();
  renderPaints();
  if (!dailyKey) {
    save.lastPlayed = p.id;
    lastAlbum = p.album;
  }
  let intro = null;
  if (!save.seenTutorial) intro = 'tutorial';
  else if (p.colour && !save.seenColour) intro = 'colour';
  if (intro) showIntro(intro);
  else show('play', null);
  queueMicrotask(() => monitor.mark(performance.now()));
  log.event('level.start', {
    puzzle: p.id, album: dailyKey ? 'daily' : ALBUMS[p.album].id, size: `${p.w}x${p.h}`, colour: p.colour,
    mode: save.settings.mode, resumed: !!cells,
  });
}

function startDaily() {
  const key = dateKey();
  const { puzzle: p } = dailyCritter(key);
  p.number = 0;
  p.album = 0;
  startPuzzle(p, { dailyKey: key });
}

function miniRow(clue, cells) {
  const c = document.createElement('canvas');
  c.width = 224; c.height = 144;
  const g = c.getContext('2d');
  const pal = currentPalette();
  g.fillStyle = pal.board; g.fillRect(0, 0, 224, 144);
  const s = 28;
  const x0 = 64, y0 = 58;
  g.font = '800 22px ui-rounded, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = pal.clue;
  clue.forEach((n, k) => g.fillText(String(n), x0 - (clue.length - k) * 22 + 8, y0 + s / 2));
  const tile = bakeTile(currentPencil(), pal.ink, pal.dark);
  [...cells].forEach((ch, k) => {
    if (ch === '#') g.drawImage(tile, x0 + k * s, y0, s, s);
    if (ch === 'x') {
      g.strokeStyle = pal.cross; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0 + k * s + 8, y0 + 8); g.lineTo(x0 + k * s + s - 8, y0 + s - 8);
      g.moveTo(x0 + k * s + s - 8, y0 + 8); g.lineTo(x0 + k * s + 8, y0 + s - 8); g.stroke();
    }
  });
  g.fillStyle = pal.grid;
  for (let k = 0; k <= cells.length; k++) g.fillRect(x0 + k * s, y0, 1.5, s);
  g.fillRect(x0, y0, cells.length * s, 1.5);
  g.fillRect(x0, y0 + s, cells.length * s, 1.5);
  return c;
}

function showIntro(kind) {
  const body = $('intro-body');
  body.innerHTML = '';
  const step = (canvas, html) => {
    const d = document.createElement('div');
    d.className = 'intro-step';
    if (canvas) d.appendChild(canvas);
    d.insertAdjacentHTML('beforeend', `<p>${html}</p>`);
    body.appendChild(d);
  };
  if (kind === 'tutorial') {
    $('intro-title').textContent = 'How to play';
    step(miniRow([3, 1], '###x#'), 'The numbers count the filled squares in that row or column, in order. <b>3 1</b> means three in a row, a gap, then one more.');
    step(miniRow([2], 'x##xx'), `${coarse ? '<b>Tap or drag</b>' : '<b>Click or drag</b>'} to fill squares. Mark squares you know are empty with <b>✕</b> (${coarse ? 'long-press or the ✕ button' : 'right-click, X, or the ✕ button'}).`);
    step(null, '💡 Stuck? <b>Hint</b> shows one clever step and explains it. Finish the picture and watch it come to life!');
  } else {
    $('intro-title').textContent = 'Colour clues!';
    step(null, 'Now each number has a colour. Pick that paint at the bottom (or press <b>1</b>, <b>2</b>, <b>3</b>…) before you fill.');
    step(null, 'Blocks of the <b>same</b> colour need a gap between them. <b>Different</b> colours can touch with no gap at all.');
  }
  show('intro', 'screen-intro');
  introKind = kind;
}
let introKind = null;

function dismissIntro() {
  if (mode !== 'intro') return;
  if (introKind === 'tutorial') save.seenTutorial = true;
  if (introKind === 'colour') save.seenColour = true;
  persist();
  if (puzzle.colour && !save.seenColour) { showIntro('colour'); return; }
  show('play', null);
}

function pause() {
  if (mode !== 'play') return;
  board.cancelStroke();
  saveProgress();
  syncToggles();
  $('pause-sub').textContent = `${formatTime(board.time)} so far · ${board.filledCount()} squares filled`;
  show('paused', 'screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  show('play', null);
}

let lastTimeText = '';
function updateTime() {
  if (!board) return;
  const txt = formatTime(board.time);
  if (txt === lastTimeText) return;
  lastTimeText = txt;
  const el = $('hud-time');
  el.textContent = txt;
  el.classList.toggle('beat', board.time <= puzzle.par);
}

// ------------------------------------------------------------ strokes

let strokePointer = null;
let strokeCount = 0;
let longPress = 0;
let keyStroke = null;

function beginStroke(i, useTool) {
  if (!board || board.solved || mode !== 'play') return;
  hideHint();
  const s = board.beginStroke(i, useTool, colour);
  strokeCount = 0;
  if (s) feedbackStroke();
}

function feedbackStroke() {
  const s = board.stroke;
  if (!s) return;
  const n = s.touched.size;
  if (n > strokeCount) {
    const ids = [...s.touched.keys()].slice(strokeCount);
    renderer.pop(ids);
    if (s.target >= 0) {
      sound.fill(n - 1);
      for (const i of ids) renderer.dust(i, puzzle.colour ? puzzle.paints[s.target] : currentPalette().ink);
    } else if (s.target === CROSS) sound.cross();
    else sound.erase();
  }
  strokeCount = n;
  renderer.dirty = true;
}

function endStroke() {
  clearTimeout(longPress);
  if (!board) return;
  const res = board.endStroke();
  strokePointer = null;
  keyStroke = null;
  handleResult(res);
}

function handleResult(res) {
  if (!res) return;
  renderer.refreshBlocks();
  if (res.corrected?.length) {
    renderer.pop(res.corrected);
    sound.boop();
    if (correctionsTold < 2) {
      correctionsTold++;
      const now = board.cells[res.corrected[0]];
      toast(res.tool === 'cross' ? 'That square belongs in the picture, so the ✕ came off.'
        : now === CROSS ? 'Not quite! That square stays empty, so it got a ✕.' : 'That square needs a different paint. Check the clue colours!', 2.6);
    }
  }
  res.lines?.forEach((l, k) => {
    renderer.flashLine(l.axis, l.index);
    setTimeout(() => sound.line(k), k * 90);
  });
  syncTools();
  progressDirty = true;
  if (res.solved) finishPuzzle();
}

function undo() {
  if (!board || mode !== 'play') return;
  board.cancelStroke();
  const ids = board.undo();
  if (ids) { renderer.pop(ids); renderer.refreshBlocks(); sound.erase(); progressDirty = true; }
  syncTools();
}

function redo() {
  if (!board || mode !== 'play') return;
  const ids = board.redo();
  if (ids) { renderer.pop(ids); renderer.refreshBlocks(); sound.click(); progressDirty = true; }
  syncTools();
  if (board.solved) finishPuzzle();
}

function hint() {
  if (!board || mode !== 'play' || board.solved) return;
  board.cancelStroke();
  const h = nextHint(board);
  if (!h) return;
  const res = applyHint(board, h);
  renderer.pop(h.cells.map((c) => c.i));
  renderer.showHint(h);
  sound.hint();
  $('hint-text').textContent = h.text;
  const bubble = $('hint-bubble');
  bubble.classList.remove('hidden', 'top');
  // Keep the bubble off the line it talks about.
  const span = renderer.cellsSpan(h.cells.map((c) => c.i));
  const r = bubble.getBoundingClientRect();
  if (span && span[1] > r.top - 6 && span[0] < r.bottom + 6) bubble.classList.add('top');
  hintTimer = autoMode ? 0.5 : 12;
  log.event('hint.used', { puzzle: puzzle.id, kind: h.kind, hints: board.hints });
  handleResult(res);
}

function hideHint() {
  $('hint-bubble').classList.add('hidden');
  if (renderer.hintFx) renderer.showHint(null);
  hintTimer = 0;
}

// ------------------------------------------------------------ finishing

let results = null;

function finishPuzzle() {
  if (mode === 'reveal' || mode === 'results') return;
  board.cancelStroke();
  hideHint();
  $('toast').classList.add('hidden');
  toastTimer = 0;
  const seconds = Math.max(1, Math.round(board.time));
  if (daily) {
    const r = recordDaily(save.daily, daily, seconds);
    save.daily = r.daily;
    if (!save.critters.includes(daily)) save.critters.unshift(daily);
    delete save.progress[puzzle.id];
    results = { daily: true, extended: r.extended, streak: save.daily.streak, seconds, stars: 3, unlocks: [] };
  } else {
    results = { ...recordSolve(save, puzzle, seconds, board.hints), seconds };
  }
  persist();
  show('reveal', null);
  renderer.startReveal(showResults);
  sound.reveal();
  log.event('level.complete', {
    puzzle: puzzle.id, daily: !!daily, stars: results.stars, seconds, hints: board.hints,
    corrections: board.corrections, mode: board.mode, best: !!results.newBest,
  });
}

function showResults() {
  const r = results;
  $('res-title').textContent = daily ? `Meet the ${puzzle.name}!` : `It's ${/^[AEIOU]/i.test(puzzle.name) ? 'an' : 'a'} ${puzzle.name}!`;
  const stars = [...$('res-stars').children];
  stars.forEach((el, k) => {
    el.className = k < r.stars ? 'on' : '';
    if (k < r.stars) setTimeout(() => sound.star(k), 300 + k * 180);
  });
  $('res-stars').classList.toggle('hidden', !!r.daily);
  const lines = [];
  if (r.daily) {
    lines.push(`<span>⏱ ${formatTime(r.seconds)}</span>`);
    lines.push(`<span class="best">🔥 ${r.streak}-day streak${r.extended && r.streak > 1 ? '!' : ''}</span>`);
    lines.push('<span class="muted">A new critter hatches tomorrow</span>');
  } else {
    lines.push(`<span>⏱ ${formatTime(r.seconds)}</span>`);
    if (r.newBest && !r.first) lines.push('<span class="best">New best!</span>');
    else if (r.prevBest != null) lines.push(`<span class="muted">Best ${formatTime(Math.min(r.prevBest, r.seconds))}</span>`);
    lines.push(`<span class="${board.hints ? 'no' : 'ok'}">${board.hints ? '☆' : '★'} No hints</span>`);
    lines.push(`<span class="${r.seconds <= puzzle.par ? 'ok' : 'no'}">${r.seconds <= puzzle.par ? '★' : '☆'} Under ${formatTime(puzzle.par)}</span>`);
  }
  $('res-lines').innerHTML = lines.join('');
  const un = $('res-unlocks');
  un.innerHTML = '';
  for (const u of r.unlocks || []) {
    const d = document.createElement('div');
    d.textContent = u.kind === 'album' ? `📒 New album open: ${u.name}!` : u.kind === 'palette' ? `🎨 New paper in the Studio: ${u.name}!` : `✏️ New pencil in the Studio: ${u.name}!`;
    un.appendChild(d);
  }
  if (r.unlocks?.length) setTimeout(() => sound.unlockJingle(), 900);
  const after = daily ? null : puzzleAfter(save, puzzle);
  $('btn-next').textContent = daily ? 'Back to title' : after ? 'Next picture →' : 'Albums';
  $('btn-res-album').textContent = daily ? 'Gallery' : 'Album';
  show('results', 'screen-results');
  requestAnimationFrame(updateInsets);
}

function nextFromResults() {
  if (daily) { toTitle(); return; }
  const after = puzzleAfter(save, puzzle);
  if (after) startPuzzle(after);
  else openAlbums();
}

// ------------------------------------------------------------ input

const canvas = $('stage');
const pointers = new Map();
let pinch = null;
let panDrag = null;

function local(e) {
  return { x: e.clientX, y: e.clientY };
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (mode !== 'play') return;
  canvas.setPointerCapture?.(e.pointerId);
  const pt = local(e);
  pointers.set(e.pointerId, { ...pt, type: e.pointerType });
  renderer.showCursor = false;
  if (pointers.size === 2) {
    // Two fingers: zoom and pan, never paint.
    clearTimeout(longPress);
    board.cancelStroke();
    strokePointer = null;
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    renderer.dirty = true;
    return;
  }
  if (pointers.size > 2) return;
  const i = renderer.cellAt(pt.x, pt.y);
  if (i < 0) {
    if (renderer.view.z > 1) panDrag = { x: pt.x, y: pt.y, id: e.pointerId };
    return;
  }
  const alt = tool === 'fill' ? 'cross' : 'fill';
  const useTool = e.button === 2 ? alt : tool;
  strokePointer = e.pointerId;
  renderer.cursor = i;
  beginStroke(i, useTool);
  if (e.pointerType !== 'mouse') {
    clearTimeout(longPress);
    longPress = setTimeout(() => {
      const s = board?.stroke;
      if (!s || strokePointer !== e.pointerId || s.axis || s.touched.size > 1) return;
      board.cancelStroke();
      beginStroke(i, useTool === 'fill' ? 'cross' : 'fill');
      navigator.vibrate?.(12);
    }, 380);
  }
});

canvas.addEventListener('pointermove', (e) => {
  const pt = local(e);
  if (e.pointerType === 'mouse' && mode === 'play') {
    const h = renderer.cellAt(pt.x, pt.y);
    if (h !== renderer.hover) { renderer.hover = h; renderer.dirty = true; }
  }
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { ...pt, type: e.pointerType });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    renderer.zoomAt(d / Math.max(1, pinch.d), mx, my);
    renderer.panBy(mx - pinch.mx, my - pinch.my);
    pinch = { d, mx, my };
    return;
  }
  if (panDrag && panDrag.id === e.pointerId) {
    renderer.panBy(pt.x - panDrag.x, pt.y - panDrag.y);
    panDrag.x = pt.x; panDrag.y = pt.y;
    return;
  }
  if (strokePointer === e.pointerId && board?.stroke) {
    const i = renderer.cellNear(pt.x, pt.y);
    if (i !== board.stroke.start) clearTimeout(longPress);
    board.extendStroke(i);
    renderer.cursor = i;
    feedbackStroke();
  }
});

function pointerEnd(e) {
  pointers.delete(e.pointerId);
  if (panDrag?.id === e.pointerId) panDrag = null;
  if (pointers.size < 2) pinch = null;
  if (strokePointer === e.pointerId) endStroke();
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', (e) => {
  if (strokePointer === e.pointerId) { board?.cancelStroke(); strokePointer = null; renderer.dirty = true; }
  pointers.delete(e.pointerId);
  pinch = null;
});
canvas.addEventListener('pointerleave', () => { if (renderer.hover >= 0) { renderer.hover = -1; renderer.dirty = true; } });

canvas.addEventListener('wheel', (e) => {
  if (mode !== 'play') return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) renderer.zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
  else if (renderer.view.z > 1) renderer.panBy(-e.deltaX, -e.deltaY);
}, { passive: false });

const KEY_DIR = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };

addEventListener('keydown', (e) => {
  sound.unlock();
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'm') { toggleSound(); return; }
  if (mode === 'intro' && (k === 'Enter' || k === ' ')) { e.preventDefault(); dismissIntro(); return; }
  if (mode === 'paused' && (k === 'Escape' || k === 'p')) { resume(); return; }
  if (mode === 'results' && k === 'Enter' && document.activeElement === document.body) { nextFromResults(); return; }
  if (mode === 'viewer') {
    if (k === 'ArrowLeft') openViewer(viewerIndex - 1);
    if (k === 'ArrowRight') openViewer(viewerIndex + 1);
    if (k === 'Escape') openGallery();
    return;
  }
  if (mode !== 'play') {
    if (k === 'Escape') {
      if (mode === 'album') openAlbums();
      else if (['albums', 'gallery', 'studio'].includes(mode)) toTitle();
    }
    return;
  }
  if (k === 'Escape' || k === 'p') { pause(); return; }
  if (e.ctrlKey || e.metaKey) {
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    if (k === 'y') { e.preventDefault(); redo(); }
    return;
  }
  const dir = KEY_DIR[k];
  if (dir) {
    e.preventDefault();
    const b = board;
    const x = Math.max(0, Math.min(b.w - 1, (renderer.cursor % b.w) + dir[0]));
    const y = Math.max(0, Math.min(b.h - 1, ((renderer.cursor / b.w) | 0) + dir[1]));
    renderer.cursor = y * b.w + x;
    renderer.showCursor = true;
    renderer.follow(renderer.cursor);
    if (keyStroke && b.stroke) { b.extendStroke(renderer.cursor); feedbackStroke(); }
    renderer.dirty = true;
    return;
  }
  if (e.repeat) return;
  if (k === ' ' || k === 'Enter' || k === 'x') {
    e.preventDefault();
    renderer.showCursor = true;
    keyStroke = k;
    beginStroke(renderer.cursor, k === 'x' ? 'cross' : tool);
    return;
  }
  if (k === 'z' || k === 'u' || k === 'Backspace') { undo(); return; }
  if (k === 'y') { redo(); return; }
  if (k === 'h') { hint(); return; }
  if (k === 't') { tool = tool === 'fill' ? 'cross' : 'fill'; syncTools(); return; }
  if (k === 'c' && puzzle.colour) { tool = 'fill'; colour = (colour + 1) % puzzle.colours; syncTools(); return; }
  if (/^[1-9]$/.test(k) && Number(k) <= puzzle.colours) { tool = 'fill'; colour = Number(k) - 1; syncTools(); return; }
  if (k === '+' || k === '=') { renderer.zoomAt(1.25, innerWidth / 2, innerHeight / 2); renderer.follow(renderer.cursor); return; }
  if (k === '-') { renderer.zoomAt(0.8, innerWidth / 2, innerHeight / 2); return; }
  if (k === '0') { renderer.resetView(); }
});

addEventListener('keyup', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (keyStroke && (k === keyStroke || (keyStroke === ' ' && k === ' '))) endStroke();
});

// Hide the pointer during play after a moment without movement.
let pointerIdle = 0;
let pointerHidden = false;
addEventListener('mousemove', () => { pointerIdle = 0; if (pointerHidden) updatePointer(0); });
function updatePointer(dt) {
  pointerIdle += dt;
  const hide = mode === 'play' && pointerIdle > 2 && !coarse;
  if (hide !== pointerHidden) {
    pointerHidden = hide;
    document.body.classList.toggle('no-cursor', hide);
  }
}

// ------------------------------------------------------------ toggles

function syncToggles() {
  for (const el of document.querySelectorAll('[data-sound]')) el.textContent = `Sound: ${save.settings.sound ? 'on' : 'off'}`;
  for (const el of document.querySelectorAll('[data-music]')) el.textContent = `Music: ${save.settings.music ? 'on' : 'off'}`;
  $('btn-sound').textContent = save.settings.sound ? '🔊' : '🔈';
  $('btn-mode').textContent = save.settings.mode === 'helper' ? 'Helper: on' : 'Expert mode';
  for (const b of document.querySelectorAll('.mode-btn')) b.setAttribute('aria-checked', String(b.dataset.mode === save.settings.mode));
}

function toggleSound() {
  save.settings.sound = !save.settings.sound;
  sound.setSound(save.settings.sound);
  persist();
  syncToggles();
}

function toggleMusic() {
  save.settings.music = !save.settings.music;
  sound.unlock();
  sound.setMusic(save.settings.music);
  persist();
  syncToggles();
}

// ------------------------------------------------------------ autoplay

function stepAuto(dt) {
  if (!autoMode) return;
  autoWait -= dt;
  if (autoWait > 0) return;
  autoWait = 0.15;
  if (mode === 'intro') dismissIntro();
  else if (mode === 'play') hint();
  else if (mode === 'results') { autoWait = 1.2; nextFromResults(); }
  else if (mode === 'title') { autoWait = 0.5; startPuzzle(nextPuzzle(save)); }
}

// ------------------------------------------------------------ the loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, puzzle: puzzle ? puzzle.id : '', filled: board ? board.filledCount() : 0 }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => {
  monitor.reset(performance.now());
  if (document.hidden) {
    if (mode === 'play') pause();
    else saveProgress();
  }
});

let last = performance.now();
let saveClock = 0;
function frame(now) {
  if (crashNext) { crashNext = false; throw new Error('picto-paint forced crash'); }
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePointer(dt);
  if (mode === 'play' && board && !board.solved) {
    board.time += dt;
    updateTime();
  }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $('toast').classList.add('hidden');
  }
  if (hintTimer > 0) {
    hintTimer -= dt;
    if (hintTimer <= 0) hideHint();
  }
  saveClock += dt;
  if (progressDirty && saveClock > 3) { saveClock = 0; saveProgress(); }
  stepAuto(dt);
  renderer.update(dt);
  renderer.draw();
  requestAnimationFrame(loop);
}
const loop = telemetry ? telemetry.guard(frame, 'picto-paint.frame') : frame;

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', () => startPuzzle(nextPuzzle(save)));
$('btn-albums').addEventListener('click', openAlbums);
$('btn-daily').addEventListener('click', startDaily);
$('btn-gallery').addEventListener('click', openGallery);
$('btn-studio').addEventListener('click', openStudio);
for (const el of document.querySelectorAll('[data-title]')) el.addEventListener('click', toTitle);
for (const el of document.querySelectorAll('[data-albums]')) el.addEventListener('click', openAlbums);
for (const el of document.querySelectorAll('[data-sound]')) el.addEventListener('click', toggleSound);
for (const el of document.querySelectorAll('[data-music]')) el.addEventListener('click', toggleMusic);
for (const el of document.querySelectorAll('.mode-btn')) el.addEventListener('click', () => { setMode(el.dataset.mode); sound.click(); });
$('btn-mode').addEventListener('click', () => setMode(save.settings.mode === 'helper' ? 'expert' : 'helper'));
$('btn-sound').addEventListener('click', toggleSound);
$('btn-pause').addEventListener('click', pause);
$('btn-undo').addEventListener('click', undo);
$('btn-cross').addEventListener('click', () => { tool = tool === 'cross' ? 'fill' : 'cross'; syncTools(); sound.click(); });
$('btn-hint').addEventListener('click', hint);
$('btn-hint-ok').addEventListener('click', hideHint);
$('btn-intro').addEventListener('click', dismissIntro);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => {
  delete save.progress[puzzle.id];
  persist();
  log.event('level.restart', { puzzle: puzzle.id });
  startPuzzle(puzzle, { dailyKey: daily, fresh: true });
});
$('btn-pause-album').addEventListener('click', () => (daily ? (leavePuzzle(), toTitle()) : openAlbum(puzzle.album)));
$('btn-next').addEventListener('click', nextFromResults);
$('btn-replay').addEventListener('click', () => startPuzzle(puzzle, { dailyKey: daily, fresh: true }));
$('btn-res-album').addEventListener('click', () => (daily ? openGallery() : openAlbum(puzzle.album)));
$('btn-viewer-back').addEventListener('click', openGallery);
$('btn-viewer-prev').addEventListener('click', () => openViewer(viewerIndex - 1));
$('btn-viewer-next').addEventListener('click', () => openViewer(viewerIndex + 1));
addEventListener('resize', () => { renderer.resize(); updateInsets(); });
addEventListener('orientationchange', () => setTimeout(() => { renderer.resize(); updateInsets(); }, 150));
addEventListener('pagehide', () => saveProgress());
for (const el of document.querySelectorAll('button, .btn')) el.addEventListener('pointerdown', () => sound.unlock());
// Tool buttons tapped with a pointer give focus back to the board, so Space
// paints instead of pressing the last button again.
$('toolbar').addEventListener('click', (e) => { if (e.detail > 0) e.target.closest('button')?.blur(); });
$('hint-bubble').addEventListener('click', (e) => { if (e.detail > 0) e.target.closest('button')?.blur(); });

buildLogo();
applyTheme();
renderer.resize();
syncToggles();
log.event('game.ready', { solved: solvedCount(save), stars: totalStars(save), puzzles: PUZZLES.length, mode: save.settings.mode });
if (params.has('puzzle') && BY_ID.has(params.get('puzzle'))) startPuzzle(BY_ID.get(params.get('puzzle')));
else if (params.has('album')) openAlbum(Math.max(0, Math.min(ALBUMS.length - 1, Number(params.get('album')) || 0)));
else if (params.has('daily')) startDaily();
else if (params.has('gallery')) openGallery();
else if (params.has('studio')) openStudio();
else toTitle();
requestAnimationFrame(loop);

// Handy for the console and browser checks.
window.PP = {
  get board() { return board; }, get mode() { return mode; }, get puzzle() { return puzzle; },
  renderer, save, sound, startPuzzle, startDaily, openAlbums, openAlbum, openGallery, openStudio, toTitle, hint, pause,
  byId: (id) => BY_ID.get(id),
  autoplay: (on = true) => { autoMode = on; },
  crash: () => { crashNext = true; },
  solveNow: () => { if (!board) return; for (let i = 0; i < puzzle.solution.length; i++) board.cells[i] = puzzle.solution[i] >= 0 ? puzzle.solution[i] : UNKNOWN; board.solved = true; finishPuzzle(); },
};
