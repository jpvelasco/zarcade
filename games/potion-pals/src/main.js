// Browser entry: screens, the shelf, drag and drop, the frame loop, sound,
// saves and telemetry.
import { ITEM, ITEMS, PAL, PALS, DISCOVERIES, branchOf, BRANCHES } from './recipes.js';
import { Alchemy, newState, dayKey, ROOMS, requestText, riddleFor, progressText } from './alchemy.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { Renderer } from './render.js';
import { PalSim } from './pals.js';
import { Sound } from './audio.js';
import { UI, itemArt, palArt, el } from './ui.js';
import { Bot, simulate } from './bot.js';
import { cauldronHit, inRect } from './layout.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = params.has('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

// ------------------------------------------------------------------- save

const storage = (() => { try { return localStorage; } catch { return null; } })();
if (params.has('fresh')) clearSave(storage);
const seedParam = parseInt(params.get('seed'), 10);
const loaded = loadSave(storage, Number.isFinite(seedParam) ? seedParam : (Date.now() % 2147483647) >>> 0);
const alchemy = new Alchemy(loaded.state);
if (params.has('found')) simulate(alchemy, Number(params.get('found')) || 0);
if (params.has('scrolls')) alchemy.state.scrolls += Number(params.get('scrolls')) || 0;
alchemy.rollRequests();
alchemy.ensureDaily(dayKey());

let saveWarned = false;
const demoOnly = params.has('autopilot'); // the demo alchemist never saves over a real workshop
function persist() {
  if (demoOnly) return;
  if (writeSave(storage, alchemy.state) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

// ------------------------------------------------------------------ parts

const canvas = $('game');
const renderer = new Renderer(canvas, { reducedMotion: reduced });
const sound = new Sound({ muted: alchemy.state.settings.muted, music: alchemy.state.settings.music });
const sim = new PalSim(alchemy.state.seed ^ 0x3c1);
const actions = { afterChange, dayKey: () => dayKey() };
const ui = new UI({ alchemy, actions, sound });

// The title screen shows a lively demo treehouse for newcomers, your own
// workshop once you have pals of your own.
const showDemo = alchemy.discovered === 0;
const demo = new Alchemy(newState(11));
simulate(demo, 90);
demo.rollRequests();
const demoSim = new PalSim(5);
const demoBot = new Bot(demo, 21);

let mode = 'title'; // title | play | paused
let modal = null; // null | sheet | result
let pendingPal = null;
let lastMix = null;
let hintClock = 0;
let saveClock = 0;
let pointerIdle = 0;
let hoverPal = null;
let brewFlash = 0;
const autopilot = params.has('autopilot') ? new Bot(alchemy, 99) : null;

renderer.setRooms(alchemy.state.rooms);

// ---------------------------------------------------------------- screens

const OVERLAYS = ['screen-title', 'screen-pause', 'screen-result'];

function show(id) {
  for (const s of OVERLAYS) $(s).classList.toggle('hidden', s !== id);
  const playing = mode === 'play' || mode === 'paused';
  $('hud').classList.toggle('hidden', !playing);
  $('tray').classList.toggle('hidden', !playing);
  document.body.classList.toggle('titling', !playing);
  sound.setMusicLevel(mode === 'play' ? 1 : 0.55);
  if (id) $(id).querySelector('.btn.primary')?.focus({ preventScroll: true });
}

function world() {
  return mode !== 'title' || !showDemo ? { a: alchemy, s: sim } : { a: demo, s: demoSim };
}

function syncPals(opts = {}) {
  const w = world();
  const list = Object.keys(w.a.state.pals)
    .sort((x, y) => w.a.state.pals[x] - w.a.state.pals[y])
    .map((id) => ({ id, room: w.a.roomOf(id) }));
  renderer.sprites.want([], list.map((p) => p.id));
  w.s.sync(list, renderer.lay.rooms, opts);
}

function relayout() {
  renderer.resize();
  renderer.setRooms(world().a.state.rooms);
  syncPals();
  queueMicrotask(() => monitor.mark(performance.now()));
}

function toTitle() {
  mode = 'title';
  closeModals();
  const s = alchemy.state;
  $('btn-play').textContent = alchemy.discovered ? 'Back to the workshop' : 'Open the workshop';
  const bits = [];
  if (alchemy.discovered) bits.push(`🔮 ${alchemy.discovered}/${DISCOVERIES.length} discoveries`);
  if (alchemy.palCount) bits.push(`🐾 ${alchemy.palCount}/${PALS.length} pals`);
  if (alchemy.state.rooms > 1) bits.push(`🏠 ${alchemy.state.rooms} rooms`);
  if (s.daily.best > 0) bits.push(`⭐ best streak ${s.daily.best}`);
  $('title-best').textContent = bits.join(' · ') || 'Your cauldron is warm and the shelf is waiting.';
  updateSoundButtons();
  show('screen-title');
  relayout();
}

function startPlay() {
  sound.unlock();
  mode = 'play';
  show(null);
  relayout();
  buildShelf();
  refreshHud();
  log.event('workshop.open', { discoveries: alchemy.discovered, pals: alchemy.palCount, rooms: alchemy.state.rooms });
}

function pause() {
  if (mode !== 'play') return;
  closeModals();
  mode = 'paused';
  updateSoundButtons();
  show('screen-pause');
  persist();
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  show(null);
}

function closeModals() {
  if (ui.isOpen) ui.close();
  $('screen-result').classList.add('hidden');
  modal = null;
}

function openSheet(kind, arg) {
  if (mode !== 'play') return;
  modal = 'sheet';
  ui.open(kind, arg);
}

function closeSheet() {
  ui.close();
  modal = null;
  refreshHud();
  buildShelf();
}

function afterChange() {
  refreshHud();
  persist();
}

// ----------------------------------------------------------------- toasts

function toast(text, { kind = '', ms = 2800 } = {}) {
  const wrap = $('toasts');
  while (wrap.children.length > 2) wrap.firstChild.remove();
  const t = el('div', `toast ${kind}`.trim(), text);
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
}

// ------------------------------------------------------------------- HUD

function refreshHud() {
  $('hud-found').textContent = String(alchemy.discovered);
  $('hud-scrolls').textContent = String(alchemy.state.scrolls);
  $('book-count').textContent = `${alchemy.discovered}/${DISCOVERIES.length}`;
  const newThings = Object.keys(alchemy.state.unseen).length;
  badge('badge-quests', alchemy.state.requests.length ? alchemy.state.requests.length : 0);
  const d = alchemy.ensureDaily(dayKey());
  badge('badge-daily', d.done ? 0 : '!');
  $('btn-brew').classList.toggle('ready', alchemy.pot.length >= 2);
  $('brew-hint').textContent = alchemy.pot.length >= 2 ? 'ready!' : `pick ${2 - Math.min(2, alchemy.pot.length)} more`;
  $('tool-book').classList.toggle('shiny', newThings > 0);
}

function badge(id, value) {
  const node = $(id);
  node.classList.toggle('hidden', !value);
  if (value) node.textContent = String(value);
}

function bump(id) {
  const node = $(id);
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

// ----------------------------------------------------------------- shelf

const tiles = new Map();

function tileFor(id) {
  let node = tiles.get(id);
  if (node) return node;
  node = el('button', 'tile');
  node.dataset.id = id;
  node.type = 'button';
  node.appendChild(itemArt(id, 46, true));
  node.appendChild(el('b', null, ITEM[id].name));
  node.appendChild(el('span', 'dot hidden'));
  node.setAttribute('aria-label', `${ITEM[id].name}: add to the cauldron`);
  node.tabIndex = -1;
  wireTile(node, id);
  tiles.set(id, node);
  return node;
}

let cursor = 0;

function buildShelf() {
  const shelf = $('shelf');
  const list = alchemy.shelf();
  const filter = $('find').value.trim().toLowerCase();
  // Re-appending the tiles drops focus; keyboard players keep their place.
  const hadFocus = shelf.contains(document.activeElement);
  const frag = document.createDocumentFragment();
  for (const id of list) {
    const node = tileFor(id);
    const hidden = filter && !ITEM[id].name.toLowerCase().includes(filter);
    node.classList.toggle('gone', !!hidden);
    node.children[2].classList.toggle('hidden', !alchemy.state.unseen[id]);
    frag.appendChild(node);
  }
  shelf.textContent = '';
  shelf.appendChild(frag);
  renderer.sprites.want(list, []);
  setCursor(Math.min(cursor, visibleTiles().length - 1), hadFocus);
}

function visibleTiles() {
  return [...$('shelf').children].filter((n) => !n.classList.contains('gone'));
}

function setCursor(i, focus = false) {
  const list = visibleTiles();
  if (!list.length) return;
  cursor = (i + list.length) % list.length;
  for (const node of list) node.tabIndex = -1;
  list[cursor].tabIndex = 0;
  if (focus) {
    list[cursor].focus({ preventScroll: true });
    list[cursor].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function moveCursor(d) {
  setCursor(cursor + d, true);
  sound.play('click');
}

// How far an arrow key moves the shelf cursor. The shelf fills rows on a
// desktop and columns on touch screens (it scrolls sideways there).
function shelfStep(vertical) {
  const list = visibleTiles();
  if (!list.length) return 1;
  const shelf = $('shelf');
  const columns = getComputedStyle(shelf).flexDirection === 'column';
  const across = columns
    ? Math.floor(shelf.clientHeight / (list[0].offsetHeight + 6))
    : Math.floor(shelf.clientWidth / (list[0].offsetWidth + 6));
  return vertical !== columns ? Math.max(1, across) : 1;
}

// --------------------------------------------------------- drag and drop

let drag = null;

function wireTile(node, id) {
  node.addEventListener('pointerdown', (e) => {
    if (mode !== 'play' || modal) return;
    sound.unlock();
    if (drag) endGhost(); // a second finger takes over; tidy up the first
    // Fingers wobble: a touch has to travel further before a tap becomes a drag.
    const slop = e.pointerType === 'mouse' ? 6 : 14;
    drag = { id, node, x: e.clientX, y: e.clientY, moved: false, pointerId: e.pointerId, slop };
    node.setPointerCapture?.(e.pointerId);
    setCursor(visibleTiles().indexOf(node));
  });
  node.addEventListener('pointermove', (e) => {
    if (!drag || drag.node !== node) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && dx * dx + dy * dy < drag.slop * drag.slop) return;
    if (!drag.moved) startGhost(drag);
    drag.moved = true;
    moveGhost(e.clientX, e.clientY);
  });
  node.addEventListener('pointerup', (e) => {
    if (!drag || drag.node !== node) return;
    const dropped = drag.moved;
    endGhost();
    if (!dropped) addToPot(id);
    else {
      const p = toCanvas(e.clientX, e.clientY);
      if (inRect(cauldronHit(renderer.lay), p.x, p.y)) addToPot(id);
      else sound.play('nope');
    }
    drag = null;
  });
  node.addEventListener('pointercancel', () => { endGhost(); drag = null; });
  node.addEventListener('keydown', (e) => {
    // Handled here, so the window's Space handler must not see it too (it
    // would close the result card this brew just opened).
    if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); brew(); }
  });
  node.addEventListener('click', (e) => {
    // Clicks from the keyboard (Enter) have no pointer behind them.
    if (e.detail === 0) addToPot(id);
  });
  node.addEventListener('dragstart', (e) => e.preventDefault());
}

function startGhost(d) {
  const ghost = $('ghost');
  ghost.textContent = '';
  ghost.appendChild(itemArt(d.id, 62, true));
  ghost.classList.remove('hidden');
  d.node.classList.add('dragging');
}

function moveGhost(cx, cy) {
  const ghost = $('ghost');
  ghost.style.left = `${cx}px`;
  ghost.style.top = `${cy}px`;
  const p = toCanvas(cx, cy);
  renderer.dropHot = inRect(cauldronHit(renderer.lay), p.x, p.y);
}

function endGhost() {
  $('ghost').classList.add('hidden');
  renderer.dropHot = false;
  if (drag?.node) drag.node.classList.remove('dragging');
}

function toCanvas(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return { x: cx - r.left, y: cy - r.top };
}

// ------------------------------------------------------------------- pot

function addToPot(id) {
  if (mode !== 'play' || modal) return;
  if (alchemy.pot.length >= 3) {
    sound.play('nope');
    toast('The cauldron only holds three things. Brew it, or tap one to take it out.');
    return;
  }
  if (!alchemy.add(id)) { sound.play('nope'); return; }
  sound.play('plop', { n: alchemy.pot.length });
  const slot = renderer.slots[alchemy.pot.length - 1];
  renderer.sparkle(slot.x, slot.y, 6, ITEM[id].c2);
  renderer.ring(renderer.lay.cauldron.x, renderer.lay.cauldron.y - renderer.lay.cauldron.r * 0.45, ITEM[id].c1);
  buildShelf();
  refreshHud();
}

function takeFromPot(i) {
  if (!alchemy.remove(i)) return;
  sound.play('pick', { n: i });
  refreshHud();
}

// ------------------------------------------------------------------ brew

function brew() {
  if (mode !== 'play' || modal) return;
  sound.unlock();
  if (alchemy.pot.length < 2) {
    sound.play('nope');
    toast('Put two or three things in first. Anything at all!');
    return;
  }
  const c = renderer.lay.cauldron;
  const mix = alchemy.pot.slice();
  const res = alchemy.brew(dayKey());
  brewFlash = 0.6;
  sound.play('stir');
  if (!res.ok) {
    if (res.reason === 'short') return;
    lastMix = mix;
    const color = ITEM[mix[0]].c2;
    renderer.puff(c.x, c.y - c.r * 0.5, color, 16);
    renderer.rise(c.x, c.y - c.r * 1.6, 'poof!', '#ffeec8');
    sound.play('fizzle');
    toast(`${res.quip} ${res.hint}`, { kind: 'fizz', ms: 4200 });
    log.event('brew.fizzle', { size: mix.length });
    buildShelf();
    refreshHud();
    persist();
    return;
  }
  lastMix = mix;
  renderer.sparkle(c.x, c.y - c.r * 0.5, res.isNew ? 26 : 10, ITEM[res.id].c2);
  renderer.ring(c.x, c.y - c.r * 0.5, '#ffe68a');
  sound.play(res.item.kind === 'potion' ? 'potion' : res.isNew ? 'found' : 'known');
  log.event('brew.hit', { id: res.id, new: res.isNew, kind: res.item.kind, size: mix.length });
  if (res.isNew && res.item.kind === 'potion') log.event('potion.found', { id: res.id, pal: res.pal || 'none' });
  drainEvents(res);
  showResult(res);
  buildShelf();
  refreshHud();
  persist();
}

function drainEvents(res) {
  for (const e of alchemy.events) {
    if (e.type === 'pal') {
      pendingPal = e.id;
      log.event('pal.summon', { pal: e.id, pals: alchemy.palCount });
    } else if (e.type === 'room') {
      log.event('room.unlock', { room: ROOMS[e.room - 1].id, pals: alchemy.palCount });
      log.event('level.start', { level: e.room, name: ROOMS[e.room - 1].id, pals: alchemy.palCount });
      renderer.setRooms(e.room);
      toast(`🏠 The ${ROOMS[e.room - 1].name} is open! ${ROOMS[e.room - 1].blurb}`, { kind: 'gold', ms: 4200 });
      sound.play('room');
    } else if (e.type === 'request') {
      log.event('request.done', { pal: e.pal, target: e.target });
    } else if (e.type === 'daily') {
      log.event('daily.claim', { streak: e.streak });
    }
  }
  alchemy.events.length = 0;
  if (res?.isNew) checkPage(res.id);
  if (res?.isNew && alchemy.discovered === DISCOVERIES.length) {
    toast('🎉 Every single discovery found! The whole treehouse cheers.', { kind: 'gold', ms: 6000 });
    log.event('game.complete', { discoveries: alchemy.discovered, pals: alchemy.palCount });
  }
}

// A full book page is this game's "level complete".
function checkPage(id) {
  const page = branchOf(id);
  const ids = ITEMS.filter((it) => it.kind !== 'base' && branchOf(it.id) === page).map((it) => it.id);
  if (!ids.every((x) => alchemy.knows(x))) return;
  const name = BRANCHES.find((b) => b.id === page)?.name || page;
  toast(`📖 ${name} — every single one found!`, { kind: 'gold', ms: 4200 });
  log.event('level.complete', { level: page, name, score: alchemy.discovered, stars: 3 });
}

function showResult(res) {
  modal = 'result';
  const art = $('result-art');
  art.textContent = '';
  art.appendChild(itemArt(res.id, 112, true));
  const tags = $('result-tags');
  tags.textContent = '';
  if (res.isNew) tags.appendChild(el('span', 'tag new', 'NEW!'));
  else tags.appendChild(el('span', 'tag again', 'Another perfect batch'));
  if (res.item.kind === 'potion') tags.appendChild(el('span', 'tag potion', 'Potion'));
  for (const t of res.item.tags.slice(0, 2)) tags.appendChild(el('span', 'tag', t));
  $('result-name').textContent = res.item.name;
  $('result-blurb').textContent = res.item.blurb;
  const mix = $('result-mix');
  mix.textContent = '';
  res.inputs.forEach((id, i) => {
    if (i) mix.appendChild(el('span', 'plus', '+'));
    const chip = el('span', 'chip');
    chip.appendChild(itemArt(id, 30, true));
    chip.appendChild(el('small', null, ITEM[id].name));
    mix.appendChild(chip);
  });

  const intro = $('pal-intro');
  intro.classList.toggle('hidden', !res.pal);
  if (res.pal) {
    const pal = PAL[res.pal];
    const holder = $('pal-art');
    holder.textContent = '';
    holder.appendChild(palArt(res.pal, 92, true));
    $('pal-name').textContent = `${pal.name} the ${pal.species} moved in!`;
    $('pal-bio').textContent = `${pal.bio} Lives in the ${ROOMS[alchemy.roomOf(res.pal)].name}.`;
    sound.play('pal');
  }

  const extras = [];
  if (res.scrolls) extras.push(`📜 +${res.scrolls} hint scroll${res.scrolls > 1 ? 's' : ''}`);
  for (const r of res.requests) extras.push(`✨ ${PAL[r.pal].name} is delighted!`);
  if (res.daily) extras.push(`⭐ Mystery solved — ${res.streak} day streak!`);
  $('result-extra').textContent = extras.join(' · ');
  const again = $('result-again');
  again.classList.toggle('hidden', !lastMix);
  show('screen-result');
  if (res.scrolls) { bump('pill-scrolls'); sound.play('scroll'); }
  if (res.daily) sound.play('daily');
}

function closeResult() {
  $('screen-result').classList.add('hidden');
  modal = null;
  if (pendingPal) {
    const id = pendingPal;
    pendingPal = null;
    syncPals({ walkIn: true, from: renderer.lay.cauldron });
    renderer.sparkle(renderer.lay.cauldron.x, renderer.lay.cauldron.y - renderer.lay.cauldron.r, 20, PAL[id].c2);
    queueMicrotask(() => monitor.mark(performance.now()));
  }
  bump('pill-found');
  buildShelf();
  refreshHud();
}

function brewAgain() {
  if (!lastMix) return;
  closeResult();
  alchemy.clear();
  for (const id of lastMix) alchemy.add(id);
  refreshHud();
  brew();
}

// --------------------------------------------------------- canvas input

canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (mode === 'title') { startPlay(); return; }
  if (mode !== 'play' || modal) return;
  const p = toCanvas(e.clientX, e.clientY);
  const slot = renderer.slotAt(p.x, p.y);
  if (slot >= 0 && alchemy.pot[slot]) { takeFromPot(slot); return; }
  if (renderer.cauldronAt(p.x, p.y)) { brew(); return; }
  const pal = sim.at(p.x, p.y);
  if (pal) { sayHello(pal.id); return; }
  const room = renderer.roomAt(p.x, p.y);
  if (room >= 0 && room >= alchemy.state.rooms) {
    sound.play('nope');
    toast(`The ${ROOMS[room].name} opens when ${ROOMS[room].at} pals live here. You have ${alchemy.palCount}.`);
  }
});

canvas.addEventListener('pointermove', (e) => {
  pointerIdle = 0;
  if (mode !== 'play' || modal) { hoverPal = null; return; }
  const p = toCanvas(e.clientX, e.clientY);
  const pal = sim.at(p.x, p.y);
  hoverPal = pal ? pal.id : null;
  const over = !!pal || renderer.cauldronAt(p.x, p.y) || (renderer.slotAt(p.x, p.y) >= 0 && alchemy.pot.length > 0);
  canvas.classList.toggle('pointing', over);
});

canvas.addEventListener('pointerleave', () => { hoverPal = null; });

function sayHello(id) {
  const res = alchemy.poke(id);
  if (!res) return;
  const actor = sim.poke(id);
  if (actor) {
    renderer.hearts(actor.x, actor.y - 56, 3);
    sound.play('poke', { pitch: 1.3 - actor.size * 0.4 });
  }
  toast(res.line);
  persist();
}

// ------------------------------------------------------------------ keys

addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT';
  if (e.code === 'KeyM' && !typing) { toggleMute(); return; }
  if (modal === 'result') {
    if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); closeResult(); }
    return;
  }
  if (modal === 'sheet') {
    if (e.code === 'Escape') { e.preventDefault(); closeSheet(); }
    return;
  }
  if (mode === 'paused') {
    if (e.code === 'Escape' || e.code === 'KeyP') resume();
    return;
  }
  if (mode === 'title') {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); startPlay(); }
    return;
  }
  if (typing) {
    if (e.code === 'Escape') { $('find').value = ''; toggleFind(false); buildShelf(); }
    return;
  }
  switch (e.code) {
    case 'Escape': case 'KeyP': e.preventDefault(); pause(); break;
    case 'Space': e.preventDefault(); brew(); break;
    case 'Backspace': e.preventDefault(); if (alchemy.pot.length) takeFromPot(alchemy.pot.length - 1); break;
    case 'ArrowLeft': e.preventDefault(); moveCursor(-shelfStep(false)); break;
    case 'ArrowRight': e.preventDefault(); moveCursor(shelfStep(false)); break;
    case 'ArrowUp': e.preventDefault(); moveCursor(-shelfStep(true)); break;
    case 'ArrowDown': e.preventDefault(); moveCursor(shelfStep(true)); break;
    case 'KeyB': openSheet('book'); break;
    case 'KeyQ': openSheet('quests'); break;
    case 'KeyD': openSheet('daily'); break;
    case 'KeyH': openSheet('help'); break;
    case 'KeyF': toggleFind(true); break;
    case 'Digit1': case 'Digit2': case 'Digit3': {
      const i = Number(e.code.slice(-1)) - 1;
      if (alchemy.pot[i]) takeFromPot(i);
      break;
    }
    default: break;
  }
});

function toggleFind(on) {
  $('tray').classList.toggle('searching', on);
  if (on) $('find').focus({ preventScroll: true });
}

// ----------------------------------------------------------------- sound

function updateSoundButtons() {
  const s = alchemy.state.settings;
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = s.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = s.music ? '🎵 Music on' : '🎵 Music off';
  $('btn-mute').textContent = s.muted ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', s.muted ? 'Unmute' : 'Mute');
}

function toggleMute() {
  alchemy.state.settings.muted = !alchemy.state.settings.muted;
  sound.unlock();
  sound.setMuted(alchemy.state.settings.muted);
  updateSoundButtons();
  persist();
}

function toggleMusic() {
  alchemy.state.settings.music = !alchemy.state.settings.music;
  sound.unlock();
  sound.setMusic(alchemy.state.settings.music);
  updateSoundButtons();
  persist();
}

// ----------------------------------------------------------------- hints

function hintText() {
  const a = alchemy;
  if (a.pot.length >= 2) return 'Press Brew, or tap the cauldron!';
  if (!a.discovered) return 'Drag two things into the cauldron, then press Brew. Any two work!';
  if (a.discovered < 4) return 'Keep mixing — mixing a thing with itself works too.';
  if (!a.palCount && a.discovered < 14) return 'Somewhere out there is a potion. Potions bring pals to live here.';
  const d = a.ensureDaily(dayKey());
  if (!d.done && a.discovered >= 8) return 'Tonight’s mystery potion has a riddle waiting under 🌙.';
  if (a.state.scrolls >= 2 && !Object.keys(a.state.reveals).length) return 'Spend a 📜 scroll in the Book to peek at a recipe.';
  if (a.palCount && a.state.requests.length) return requestText(a.state.requests[0]);
  return '';
}

// --------------------------------------------------------------- wiring

$('btn-play').addEventListener('click', startPlay);
$('btn-title-book').addEventListener('click', () => { startPlay(); openSheet('book'); });
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-title').addEventListener('click', () => { persist(); toTitle(); });
$('btn-help').addEventListener('click', () => { resume(); openSheet('help'); });
$('btn-mute').addEventListener('click', toggleMute);
$('btn-brew').addEventListener('click', brew);
$('tool-book').addEventListener('click', () => { sound.play('click'); openSheet('book'); });
$('tool-quests').addEventListener('click', () => { sound.play('click'); openSheet('quests'); });
$('tool-daily').addEventListener('click', () => { sound.play('click'); openSheet('daily'); });
$('tool-find').addEventListener('click', () => toggleFind(true));
$('find').addEventListener('input', () => buildShelf());
$('sheet-close').addEventListener('click', closeSheet);
$('result-ok').addEventListener('click', closeResult);
$('result-again').addEventListener('click', brewAgain);
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
addEventListener('resize', relayout);
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('mousemove', () => { pointerIdle = 0; });
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  monitor.reset(performance.now());
  if (document.hidden) persist();
});

// ------------------------------------------------------------------ loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, modal: modal || 'none', pals: sim.actors.length, particles: renderer.particles.length }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  renderer.sprites.work(5);
  brewFlash = Math.max(0, brewFlash - dt);

  const w = world();
  if (mode === 'play') {
    if (autopilot && !modal) {
      const action = autopilot.step(dt, dayKey());
      if (action?.kind === 'add') sound.play('plop', { n: alchemy.pot.length });
      if (action?.kind === 'brew') {
        brewFlash = 0.6;
        const res = action.result;
        if (res.ok) {
          renderer.sparkle(renderer.lay.cauldron.x, renderer.lay.cauldron.y - 20, 18, ITEM[res.id].c2);
          drainEvents(res);
          if (pendingPal) { pendingPal = null; syncPals({ walkIn: true, from: renderer.lay.cauldron }); }
        } else renderer.puff(renderer.lay.cauldron.x, renderer.lay.cauldron.y - 20, '#cfc0e0', 12);
        buildShelf();
        refreshHud();
      }
    }
    sim.update(dt, renderer.lay.rooms, { reduced });
    hintClock -= dt;
    if (hintClock <= 0) {
      hintClock = 0.4;
      if (dayKey() !== alchemy.state.daily.key) refreshHud(); // midnight: a new mystery
      $('hint').textContent = modal ? '' : hintText();
    }
    saveClock += dt;
    if (saveClock > 8) { saveClock = 0; persist(); }
  } else if (mode === 'title') {
    const action = showDemo ? demoBot.step(dt, '1970-01-01') : null;
    if (action?.kind === 'brew' && action.result.ok) {
      renderer.sparkle(renderer.lay.cauldron.x, renderer.lay.cauldron.y - 20, 14, ITEM[action.result.id].c2);
      if (demo.events.some((e) => e.type === 'pal' || e.type === 'room')) {
        renderer.setRooms(demo.state.rooms);
        syncPals({ walkIn: true, from: renderer.lay.cauldron });
      }
      demo.events.length = 0;
    } else if (action?.kind === 'brew') {
      renderer.puff(renderer.lay.cauldron.x, renderer.lay.cauldron.y - 20, '#cfc0e0', 10);
    }
    w.s.update(dt, renderer.lay.rooms, { reduced });
  }

  updatePointer(dt);
  renderer.update(dt, { pot: w.a.pot, heat: brewFlash });
  renderer.draw(w.s, { pot: w.a.pot, hoverPal, dim: mode === 'paused' });
  requestAnimationFrame(loop);
}

function updatePointer(dt) {
  pointerIdle += dt;
  const playing = mode === 'play' && !modal;
  document.body.classList.toggle('no-cursor', playing && pointerIdle > 2);
}

const loop = telemetry ? telemetry.guard(frame, 'potion-pals.frame') : frame;

// ----------------------------------------------------------------- start

function logoPals() {
  const wrap = $('logo-pals');
  for (const id of ['mossy', 'cinder', 'nimbus']) wrap.appendChild(palArt(id, id === 'cinder' ? 88 : 76, true));
}

if (location.protocol !== 'file:') {
  renderer.sprites.want(alchemy.shelf(), Object.keys(alchemy.state.pals));
  demoSim.sync(
    Object.keys(demo.state.pals).sort((x, y) => demo.state.pals[x] - demo.state.pals[y]).map((id) => ({ id, room: demo.roomOf(id) })),
    renderer.lay.rooms,
  );
  renderer.sprites.want([], Object.keys(demo.state.pals));
  logoPals();
  buildShelf();
  refreshHud();
  log.event('game.ready', {
    discoveries: alchemy.discovered,
    pals: alchemy.palCount,
    rooms: alchemy.state.rooms,
    fresh: loaded.fresh,
    demo: showDemo,
    reduced,
  });
  if (params.has('play') || autopilot) { toTitle(); startPlay(); } else toTitle();
  persist();
  requestAnimationFrame(loop);
}

window.PP = {
  get alchemy() { return alchemy; },
  get mode() { return mode; },
  get modal() { return modal; },
  renderer, sim, ui, sound, demo, demoSim, brew, addToPot, openSheet, closeSheet, persist, progressText,
  riddleFor, syncPals,
};
