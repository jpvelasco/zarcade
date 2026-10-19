// Browser entry: screens, the frame loop, input, sound, saves and telemetry.
import { BIOMES, ANIMALS, RARITIES, RANKS, PLOTS_PER_BIOME, DECOS, DECO_INDEX, MAX_LEVEL } from './data.js';
import { Zoo, newState } from './zoo.js';
import { Actors } from './actors.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Hatch } from './hatch.js';
import { UI } from './ui.js';
import { Bot, simulate } from './bot.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { hitTest, plotRect, zoneRect, decoSpot } from './map.js';
import { dayKey } from './eggs.js';
import { fmt, fmtDuration, fmtRate } from './economy.js';
import { taskText } from './tasks.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = params.has('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

// ------------------------------------------------------------------ save

const storage = (() => { try { return localStorage; } catch { return null; } })();
if (params.has('fresh')) clearSave(storage);
const seedParam = parseInt(params.get('seed'), 10);
const loaded = loadSave(storage, Number.isFinite(seedParam) ? seedParam : (Date.now() % 2147483647) >>> 0);
let zoo = new Zoo(loaded.state);
const state = () => zoo.state;
if (params.has('coins')) zoo.state.coins += Number(params.get('coins')) || 0;
let saveWarned = false;
function persist() {
  // ?autopilot is a browser check: the bot's zoo must not land in the real save.
  if (params.has('autopilot')) return;
  if (writeSave(storage, zoo.state) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

// ------------------------------------------------------------------ parts

const canvas = $('game');
const renderer = new Renderer(canvas, { reducedMotion: reduced });
const sound = new Sound({ muted: zoo.state.settings.muted, music: zoo.state.settings.music });
let actors = new Actors(zoo.state.seed ^ 0x51);
const hatch = new Hatch($('hatch-canvas'), renderer.sprites, { reduced });
const fresh = Object.keys(zoo.state.animals).length === 0;

// The title shows a demo zoo for brand-new keepers, their own zoo otherwise.
let showZoo = zoo;
if (fresh) {
  showZoo = new Zoo(newState(7));
  simulate(showZoo, 1500);
  showZoo.events.length = 0;
}
let showActors = fresh ? new Actors(9) : actors;

let mode = 'title'; // title | play | paused
let modal = null; // null | sheet | hatch | welcome
let placing = null;
let selected = -1;
let pendingWelcome = null;
let hatchState = null;
let saveClock = 0;
let hudClock = 0;
let costClock = 0;
let attractT = 0;
let pointerIdle = 0;
const autopilot = params.has('autopilot') ? new Bot(zoo) : null;

const actions = {
  closeSheet, build, upgrade, feed, petHabitat, unlock, buyEgg, useGift, claimDaily, claimTask, buyDeco, startPlacing, storeDeco,
  dayKey: () => dayKey(),
  cant(cost) {
    sound.play('nope');
    toast(`You need ${fmt(Math.max(0, cost - zoo.coins))} more coins. Visitors are bringing them!`);
  },
};
const ui = new UI({ zoo, sprites: renderer.sprites, actions, sound });

const input = new Input(canvas, {
  onTap: (x, y, type) => onTap(x, y, type),
  onPan: (dx, dy) => { renderer.pan(dx, dy); canvas.classList.add('dragging'); },
  onZoom: (f, x, y) => renderer.zoomAt(f, x, y),
  onHover: (x, y) => onHover(x, y),
});

// ------------------------------------------------------------------ screens

const OVERLAYS = ['screen-title', 'screen-pause'];

function show(id) {
  for (const s of OVERLAYS) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', mode !== 'play' && mode !== 'paused');
  input.enabled = mode === 'play' && !modal;
  sound.setMusicLevel(mode === 'play' ? 1 : 0.5);
  if (id) $(id).querySelector('.btn.primary')?.focus({ preventScroll: true });
}

function useWorld(z, a) {
  showZoo = z;
  showActors = a;
  renderer.ground.queueAll(z);
  a.sync(z, { pop: false });
  queueMicrotask(() => monitor.mark(performance.now()));
}

function toTitle() {
  mode = 'title';
  closeAllModals();
  const s = zoo.state;
  const owned = zoo.ownedCount();
  $('btn-play').textContent = owned ? 'Open the zoo' : 'Start your zoo';
  const best = s.stats.bestRate;
  const parts = [];
  if (owned) parts.push(`🐾 ${owned}/${ANIMALS.length} animals`);
  if (best > 0) parts.push(`Best income ${fmtRate(best)} coins/s`);
  if (owned) parts.push(`🏆 ${RANKS[s.rank].name}`);
  if (s.daily.streak > 1) parts.push(`⭐ ${s.daily.streak}-day streak`);
  $('title-best').innerHTML = parts.join(' · ') || 'Your very first egg is waiting!';
  updateSoundButtons();
  show('screen-title');
  attractT = 0;
}

function startPlay() {
  sound.unlock();
  if (showZoo !== zoo) useWorld(zoo, actors);
  mode = 'play';
  show(null);
  renderer.focusZone(lastZone(), { instant: true });
  log.event('zoo.open', { animals: zoo.ownedCount(), biomes: zoo.state.unlocked, rate: Math.round(zoo.rate), rank: zoo.state.rank });
  if (pendingWelcome) openWelcome(pendingWelcome);
  pendingWelcome = null;
}

function lastZone() {
  // the newest biome that has animals, or the newest one
  for (let b = zoo.state.unlocked - 1; b >= 0; b--) if (zoo.ownedCount(b) > 0) return b;
  return 0;
}

function pause() {
  if (mode !== 'play') return;
  closeAllModals();
  mode = 'paused';
  updateSoundButtons();
  show('screen-pause');
  persist();
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  input.clear();
  show(null);
}

function closeAllModals() {
  if (ui.isOpen) ui.close();
  $('screen-hatch').classList.add('hidden');
  $('screen-welcome').classList.add('hidden');
  hatch.stop();
  hatchState = null;
  modal = null;
  stopPlacing();
  input.enabled = mode === 'play';
}

function openSheet(kind, arg) {
  if (mode !== 'play') return;
  stopPlacing();
  modal = 'sheet';
  input.enabled = false;
  ui.open(kind, arg);
}

function closeSheet() {
  ui.close();
  modal = null;
  input.enabled = mode === 'play';
  input.clear();
}

// ------------------------------------------------------------------ toasts

function toast(text, { gold = false, ms = 2600 } = {}) {
  const wrap = $('toasts');
  while (wrap.children.length > 2) wrap.firstChild.remove();
  const t = document.createElement('div');
  t.className = `toast${gold ? ' gold' : ''}`;
  t.textContent = text;
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
}

// ------------------------------------------------------------------ actions

function afterChange(rerender = true) {
  if (rerender && ui.isOpen) ui.render();
  persist();
}

function plotCenter(i) {
  const r = plotRect(i);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function build(i) {
  const res = zoo.build(i);
  if (!res.ok) return actions.cant(zoo.buildCost(i));
  log.event('habitat.build', { biome: BIOMES[zoo.biomeOf(i)].id, plot: zoo.plotOf(i) });
  afterChange();
}

function upgrade(i) {
  if (zoo.habitat(i).level >= MAX_LEVEL) return;
  const res = zoo.upgrade(i);
  if (!res.ok) return actions.cant(zoo.upgradeCost(i));
  log.event('habitat.upgrade', { biome: BIOMES[zoo.biomeOf(i)].id, level: res.level });
  afterChange();
}

function feed(i) {
  const res = zoo.feed(i);
  if (res.reason === 'coins') return actions.cant(zoo.snackCost(i));
  if (res.reason === 'full') { toast('They are as happy as can be! 💗'); return; }
  afterChange();
}

function petHabitat(i) {
  const h = zoo.habitat(i);
  if (!h.animals.length) return;
  const id = h.animals[Math.floor(Math.random() * h.animals.length)];
  petAnimal(id);
  if (ui.isOpen) ui.render();
}

function petAnimal(id) {
  const a = actors.animals.get(id);
  if (!a) return;
  const counts = actors.pet(id);
  if (counts) zoo.pet(a.habitat, id);
  renderer.hearts(a.x, a.y - 50 * a.size, counts ? 4 : 1);
  sound.play('pet', { pitch: 1.25 - a.size * 0.4 });
}

function unlock() {
  const res = zoo.unlockNext();
  if (!res.ok) return actions.cant(zoo.unlockCost());
  closeSheet();
  afterChange(false);
}

function hatchFrom(res, eggKind) {
  if (!res.ok) return;
  modal = 'hatch';
  input.enabled = false;
  if (ui.isOpen) ui.close();
  hatchState = { res, eggKind, revealed: false };
  $('screen-hatch').classList.remove('hidden');
  $('hatch-result').classList.add('hidden');
  $('hatch-prompt').classList.remove('hidden');
  $('hatch-prompt').textContent = input.mode === 'touch' ? 'Tap the egg 3 times!' : 'Click the egg (or press Space) 3 times!';
  hatch.start(res, eggKind);
  sound.play('wobble');
  log.event('egg.hatch', { biome: BIOMES[res.biome].id, rarity: res.animal.rarity, new: res.isNew, stars: res.stars, source: res.source });
  persist();
}

function buyEgg(b) {
  const price = zoo.eggPrice(b);
  const res = zoo.buyEgg(b);
  if (res.reason === 'coins') return actions.cant(price);
  hatchFrom(res, BIOMES[b].id);
}

function useGift(b) {
  hatchFrom(zoo.useGiftEgg(b), 'gift');
}

function claimDaily() {
  const key = dayKey();
  const res = zoo.claimDaily(key);
  if (!res.ok) return;
  log.event('daily.claim', { streak: res.streak, biome: BIOMES[res.biome].id });
  hatchFrom(res, 'daily');
  toast(`⭐ Day ${res.streak} streak! +${fmt(res.gift)} coins`, { gold: true });
}

function claimTask(k) {
  const res = zoo.claimTask(k);
  if (!res.ok) return;
  sound.play('claim');
  log.event('task.claim', { type: res.task.type, reward: res.reward.egg ? 'egg' : 'coins' });
  toast(res.reward.egg ? '🎁 You got a gift egg! Open 🥚 Eggs to hatch it.' : `+${fmt(res.reward.coins)} coins!`, { gold: true });
  bumpCoins();
  afterChange();
}

function buyDeco(id) {
  const d = DECOS[DECO_INDEX[id]];
  const res = zoo.buyDeco(id);
  if (!res.ok) return actions.cant(d.price);
  sound.play('deco');
  startPlacing(id);
  persist();
}

function startPlacing(id) {
  if (ui.isOpen) closeSheet();
  placing = id;
  renderer.placing = id;
  renderer.spotSel = firstFreeSpot();
  $('placing').classList.remove('hidden');
  $('placing-text').textContent = input.mode === 'touch' ? `Tap a glowing spot for the ${DECOS[DECO_INDEX[id]].name}` : `Click a glowing spot (or Q / E then Enter) for the ${DECOS[DECO_INDEX[id]].name}`;
  const s = renderer.spotSel >= 0 ? decoSpot(renderer.spotSel) : null;
  if (s) renderer.focusPoint(s.x, s.y);
}

function firstFreeSpot() {
  let first = -1;
  for (let s = 0; s < BIOMES.length * 3; s++) {
    if (!zoo.spotOpen(s)) continue;
    if (first < 0) first = s;
    if (!zoo.decoAt(s)) return s;
  }
  return first;
}

function stopPlacing() {
  placing = null;
  renderer.placing = null;
  $('placing').classList.add('hidden');
}

function placeAt(spot) {
  const id = placing;
  const res = zoo.placeDeco(id, spot);
  if (!res.ok) return;
  stopPlacing();
  const p = decoSpot(spot);
  renderer.sparkle(p.x, p.y - 30, 16, '#ffe27a');
  sound.play('deco');
  log.event('deco.place', { deco: id });
  if (res.replaced) toast(`The ${DECOS[DECO_INDEX[res.replaced]].name} went back to storage.`);
  persist();
}

function storeDeco(id) {
  zoo.storeDeco(id);
  afterChange();
}

function greet(v) {
  v.greeted = true;
  v.golden = false;
  v.balloon = 5;
  const tip = Math.max(15, Math.round(zoo.rate * 30));
  zoo.state.coins += tip;
  zoo.state.earned += tip;
  renderer.coinPop(v.x, v.y - 70, tip);
  renderer.sparkle(v.x, v.y - 60, 18, '#ffe27a');
  sound.play('golden');
  toast(`🎈 A balloon visitor loved your zoo! +${fmt(tip)} coins`, { gold: true });
  log.event('visitor.golden', { tip });
  bumpCoins();
}

function bumpCoins() {
  const pill = $('coin-pill');
  pill.classList.remove('bump');
  void pill.offsetWidth;
  pill.classList.add('bump');
}

// ------------------------------------------------------------------ welcome

function openWelcome(res) {
  modal = 'welcome';
  input.enabled = false;
  $('welcome-text').textContent = `You were away for ${fmtDuration(res.away ?? res.seconds)}. ${res.capped ? 'Your keepers filled their piggy bank while you were gone!' : 'Your keepers kept the zoo running, and visitors kept coming!'}`;
  $('welcome-coins').innerHTML = `<span class="coin" aria-hidden="true"></span> +${fmt(res.coins)}`;
  const art = $('welcome-art');
  art.innerHTML = '';
  const ids = Object.keys(zoo.state.animals);
  if (ids.length) art.appendChild(ui.portrait(ids[Math.floor(Math.random() * ids.length)], 110));
  $('screen-welcome').classList.remove('hidden');
  $('welcome-ok').focus({ preventScroll: true });
}

$('welcome-ok').addEventListener('click', () => {
  $('screen-welcome').classList.add('hidden');
  modal = null;
  input.enabled = mode === 'play';
  sound.play('claim');
  bumpCoins();
});

// ------------------------------------------------------------------ hatch

function hatchTap() {
  if (!hatchState) return;
  const r = hatch.tap();
  if (r === 'crack') sound.play('crack', { n: hatch.taps });
  if (r === 'open') {
    const res = hatchState.res;
    sound.play('hatch', { rarity: RARITIES.indexOf(res.animal.rarity) });
    hatchState.revealed = true;
    $('hatch-prompt').classList.add('hidden');
    const a = res.animal;
    const tags = [`<span class="tag" style="background:${rarityColor(a.rarity)}">${cap(a.rarity)}</span>`];
    if (res.isNew) tags.push('<span class="tag new">NEW!</span>');
    else tags.push(`<span class="tag up">★ ${res.stars} · +20% coins</span>`);
    $('hatch-tags').innerHTML = tags.join('');
    $('hatch-name').textContent = a.name;
    $('hatch-fact').textContent = a.fact;
    const home = res.home >= 0 ? BIOMES[zoo.biomeOf(res.home)].habitats[res.home % PLOTS_PER_BIOME] : null;
    $('hatch-home').textContent = res.isNew ? (home ? `🏠 Moved into ${home}!` : '🏠 Waiting for a home. Build or upgrade a habitat!') : `Your ${a.name} got a star!`;
    const again = $('hatch-again');
    const b = res.biome;
    if (res.source === 'shop' || res.source === 'gift') {
      const gift = zoo.state.giftEggs > 0 && res.source === 'gift';
      const price = zoo.eggPrice(b);
      again.classList.remove('hidden');
      again.dataset.biome = b;
      again.dataset.gift = gift ? '1' : '';
      again.innerHTML = gift ? '🎁 Another gift egg' : `Another · <span class="coin" aria-hidden="true"></span>${fmt(price)}`;
      again.classList.toggle('cant', !gift && zoo.coins < price);
    } else again.classList.add('hidden');
    setTimeout(() => {
      if (!hatchState) return;
      $('hatch-result').classList.remove('hidden');
      $('hatch-ok').focus({ preventScroll: true });
    }, reduced ? 50 : 450);
  }
}

const rarityColor = (r) => ({ common: '#6ab84a', uncommon: '#3a98e8', rare: '#a85ae8', legendary: '#f09a1a' }[r]);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function endHatch() {
  if (!hatchState) return;
  const res = hatchState.res;
  hatch.stop();
  hatchState = null;
  $('screen-hatch').classList.add('hidden');
  modal = null;
  input.enabled = mode === 'play';
  input.clear();
  actors.sync(zoo);
  if (res.home >= 0) {
    renderer.focusPoint(plotCenter(res.home).x, plotCenter(res.home).y, renderer.zoneZoom());
    const a = actors.animals.get(res.id);
    if (a) renderer.sparkle(a.x, a.y - 30, 14, rarityColor(res.animal.rarity));
  } else {
    const b = res.biome;
    renderer.focusZone(b);
  }
}

$('hatch-canvas').addEventListener('pointerdown', (e) => { e.preventDefault(); sound.unlock(); hatchTap(); });
$('hatch-ok').addEventListener('click', endHatch);
$('hatch-again').addEventListener('click', () => {
  const again = $('hatch-again');
  const b = +again.dataset.biome;
  if (again.dataset.gift) {
    endHatchQuiet();
    useGift(b);
    return;
  }
  const price = zoo.eggPrice(b);
  if (zoo.coins < price) return actions.cant(price);
  endHatchQuiet();
  buyEgg(b);
});

function endHatchQuiet() {
  hatch.stop();
  hatchState = null;
  modal = null;
  actors.sync(zoo);
}

// ------------------------------------------------------------------ map input

function onTap(sx, sy) {
  sound.unlock();
  if (mode !== 'play' || modal) return;
  const w = renderer.toWorld(sx, sy);
  if (placing) {
    const hit = hitTest(w.x, w.y, zoo.state.unlocked, { spots: true });
    if (hit?.kind === 'spot') placeAt(hit.spot);
    return;
  }
  const g = actors.goldenAt(w.x, w.y);
  if (g) return greet(g);
  const a = actors.animalAt(w.x, w.y);
  if (a) {
    selected = a.habitat;
    renderer.selected = selected;
    return petAnimal(a.id);
  }
  const hit = hitTest(w.x, w.y, zoo.state.unlocked);
  if (!hit) return;
  if (hit.kind === 'habitat') {
    selected = hit.habitat;
    renderer.selected = selected;
    sound.play('click');
    openSheet('habitat', hit.habitat);
  } else if (hit.kind === 'lot') {
    sound.play('click');
    openSheet('lot', hit.biome);
  } else if (hit.kind === 'deco' && zoo.decoAt(hit.spot)) {
    sound.play('click');
    openSheet('decor', zoo.decoAt(hit.spot));
  }
}

function onHover(sx, sy) {
  pointerIdle = 0;
  if (mode !== 'play' || modal || input.dragging) return;
  const w = renderer.toWorld(sx, sy);
  const hit = hitTest(w.x, w.y, zoo.state.unlocked, { spots: !!placing });
  renderer.hover = hit;
  const pointing = !!(actors.animalAt(w.x, w.y) || actors.goldenAt(w.x, w.y) || (hit && hit.kind !== 'zone' && (hit.kind !== 'deco' || zoo.decoAt(hit.spot))));
  canvas.classList.toggle('pointing', pointing);
}

addEventListener('pointerup', () => canvas.classList.remove('dragging'));

// Selectable map items for keyboard play: plots in open biomes, then the next lot.
function selectables() {
  const list = [];
  for (let b = 0; b < zoo.state.unlocked; b++) for (let p = 0; p < PLOTS_PER_BIOME; p++) list.push(b * PLOTS_PER_BIOME + p);
  return list;
}

function cycle(dir) {
  if (placing) {
    const spots = [];
    for (let s = 0; s < BIOMES.length * 3; s++) if (zoo.spotOpen(s)) spots.push(s);
    const k = spots.indexOf(renderer.spotSel);
    renderer.spotSel = spots[(k + dir + spots.length) % spots.length];
    const p = decoSpot(renderer.spotSel);
    renderer.focusPoint(p.x, p.y);
    return;
  }
  const list = selectables();
  const k = list.indexOf(selected);
  selected = list[(k + dir + list.length) % list.length];
  renderer.selected = selected;
  const c = plotCenter(selected);
  renderer.focusPoint(c.x, c.y, Math.max(renderer.target.z, renderer.zoneZoom() * 0.9));
  sound.play('click');
}

function handleKeys(dt) {
  for (const e of input.takePresses()) {
    const code = e.code;
    if (code === 'KeyM') { toggleMute(); continue; }
    if (modal === 'hatch') {
      if ((code === 'Space' || code === 'Enter') && !hatchState?.revealed) { e.preventDefault?.(); hatchTap(); }
      else if (code === 'Escape' && hatchState?.revealed) endHatch();
      continue;
    }
    if (modal === 'welcome') {
      if (code === 'Escape') $('welcome-ok').click();
      continue;
    }
    if (modal === 'sheet') {
      if (code === 'Escape') closeSheet();
      else if (['ArrowRight', 'ArrowDown'].includes(code)) { moveFocus(1); }
      else if (['ArrowLeft', 'ArrowUp'].includes(code)) { moveFocus(-1); }
      continue;
    }
    if (mode === 'paused') {
      if (code === 'Escape' || code === 'KeyP') resume();
      else if (['ArrowRight', 'ArrowDown'].includes(code)) moveFocus(1);
      else if (['ArrowLeft', 'ArrowUp'].includes(code)) moveFocus(-1);
      continue;
    }
    if (mode === 'title') {
      if (['ArrowRight', 'ArrowDown'].includes(code)) moveFocus(1);
      else if (['ArrowLeft', 'ArrowUp'].includes(code)) moveFocus(-1);
      continue;
    }
    if (mode !== 'play') continue;
    if (placing) {
      if (code === 'Escape') { stopPlacing(); continue; }
      if (code === 'Enter' || code === 'Space') { if (renderer.spotSel >= 0) placeAt(renderer.spotSel); continue; }
    }
    switch (code) {
      case 'Escape': case 'KeyP': pause(); break;
      case 'KeyQ': cycle(-1); break;
      case 'KeyE': cycle(1); break;
      case 'Tab': cycle(e.shiftKey ? -1 : 1); break;
      case 'Enter': case 'Space':
        if (selected >= 0) openSheet('habitat', selected);
        else if (zoo.nextBiome() >= 0 && zoo.coins >= zoo.unlockCost()) openSheet('lot', zoo.nextBiome());
        else cycle(1);
        break;
      case 'KeyX': if (selected >= 0) petHabitat(selected); break;
      case 'KeyF': if (selected >= 0) feed(selected); break;
      case 'KeyU': if (selected >= 0) upgrade(selected); break;
      case 'KeyG': openSheet('eggs'); break;
      case 'KeyT': openSheet('tasks'); break;
      case 'KeyB': openSheet('book'); break;
      case 'KeyC': openSheet('decor'); break;
      case 'KeyO': if (zoo.nextBiome() >= 0) { renderer.focusZone(zoo.nextBiome()); openSheet('lot', zoo.nextBiome()); } break;
      case 'Equal': case 'NumpadAdd': renderer.zoomAt(1.2); break;
      case 'Minus': case 'NumpadSubtract': renderer.zoomAt(1 / 1.2); break;
      default: break;
    }
  }
  if (mode === 'play' && !modal) {
    const ax = input.panAxis();
    if (ax.x || ax.y) {
      const speed = 520 * dt * renderer.cam.z;
      renderer.pan(-ax.x * speed, -ax.y * speed);
      pointerIdle = 0;
    }
  }
}

// Tab must not move DOM focus away from the map while playing.
addEventListener('keydown', (e) => {
  if (e.code === 'Tab' && mode === 'play' && !modal) e.preventDefault();
  if ((e.code === 'Space' || e.code.startsWith('Arrow')) && mode === 'play' && !modal) e.preventDefault();
  if (e.code === 'Space' && modal === 'hatch' && !hatchState?.revealed) e.preventDefault();
});

function moveFocus(dir) {
  const root = modal === 'sheet' ? $('screen-sheet') : mode === 'paused' ? $('screen-pause') : $('screen-title');
  const items = [...root.querySelectorAll('button, a[href]')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
}

// ------------------------------------------------------------------ sound

function updateSoundButtons() {
  const s = zoo.state.settings;
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = s.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = s.music ? '🎵 Music on' : '🎵 Music off';
  $('btn-mute').textContent = s.muted ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', s.muted ? 'Unmute' : 'Mute');
}

function toggleMute() {
  zoo.state.settings.muted = !zoo.state.settings.muted;
  sound.unlock();
  sound.setMuted(zoo.state.settings.muted);
  updateSoundButtons();
  persist();
}

function toggleMusic() {
  zoo.state.settings.music = !zoo.state.settings.music;
  sound.unlock();
  sound.setMusic(zoo.state.settings.music);
  updateSoundButtons();
  persist();
}

// ------------------------------------------------------------------ zoo events

function handleZooEvents() {
  for (const e of zoo.events) {
    switch (e.type) {
      case 'build': {
        renderer.ground.queueZone(zoo, zoo.biomeOf(e.habitat));
        const c = plotCenter(e.habitat);
        renderer.sparkle(c.x, c.y, 24, '#ffe27a');
        sound.play('build');
        toast(`🏗️ ${BIOMES[zoo.biomeOf(e.habitat)].habitats[e.habitat % PLOTS_PER_BIOME]} is open!`);
        actors.sync(zoo);
        break;
      }
      case 'upgrade': {
        renderer.ground.queueZone(zoo, zoo.biomeOf(e.habitat));
        const c = plotCenter(e.habitat);
        renderer.sparkle(c.x, c.y - 20, 20, '#ffd23f');
        renderer.text(c.x, c.y - 60, `Level ${e.level}!`, '#ffe27a');
        sound.play('upgrade');
        actors.sync(zoo);
        break;
      }
      case 'moveIn': {
        actors.sync(zoo);
        const a = actors.animals.get(e.id);
        if (a) renderer.hearts(a.x, a.y - 40, 3);
        toast(`🏠 ${ANIMALS.find((x) => x.id === e.id).name} moved in!`);
        break;
      }
      case 'unlock': {
        renderer.ground.queueZone(zoo, e.biome);
        renderer.focusZone(e.biome);
        const z = zoneRect(e.biome);
        renderer.confetti(z.x + z.w / 2, z.y + z.h / 2, 60);
        sound.play('unlock');
        toast(`🎉 The ${BIOMES[e.biome].name} is open! Hatch its eggs to find new friends.`, { gold: true, ms: 3600 });
        log.event('level.start', { level: e.biome + 1, biome: BIOMES[e.biome].id, rate: Math.round(zoo.rate) });
        actors.sync(zoo);
        break;
      }
      case 'snack': {
        const c = plotCenter(e.habitat);
        renderer.hearts(c.x, c.y - 10, 7);
        sound.play('snack');
        break;
      }
      case 'taskDone':
        toast(`📋 Task done: ${taskText(e.task, fmt)}! Claim it in Tasks.`);
        sound.play('claim');
        break;
      case 'rank':
        toast(`🏆 You're now a ${RANKS[e.rank].name}! Here's a gift egg.`, { gold: true, ms: 3600 });
        sound.play('rank');
        renderer.confetti(renderer.cam.x, renderer.cam.y - 100, 50);
        log.event('rank.up', { rank: e.rank, name: RANKS[e.rank].name });
        break;
      case 'biomeComplete':
        toast(`📖 You found every animal in the ${BIOMES[e.biome].name}!`, { gold: true, ms: 3600 });
        log.event('level.complete', { level: e.biome + 1, biome: BIOMES[e.biome].id, stars: biomeStars(e.biome), score: Math.round(zoo.rate), time: Math.round(zoo.session) });
        break;
      case 'best':
        if (zoo.session > 20) toast(`✨ New best income: ${fmtRate(e.rate)} coins/s!`);
        break;
      default:
        break;
    }
  }
  zoo.events.length = 0;
}

function biomeStars(b) {
  let n = 0;
  for (let p = 0; p < PLOTS_PER_BIOME; p++) n += zoo.habitat(b * PLOTS_PER_BIOME + p).level;
  return n;
}

// ------------------------------------------------------------------ hints

function hintText() {
  const s = zoo.state;
  if (placing) return '';
  const owned = zoo.ownedCount();
  if (!owned && s.giftEggs > 0) return 'Tap 🥚 Eggs to hatch your very first animal!';
  if (owned && s.stats.pets === 0) return 'Tap an animal to pet it. Happy animals earn more coins!';
  for (let b = 0; b < s.unlocked; b++) if (zoo.waitingIn(b).length) return `A new friend is waiting for a home in the ${BIOMES[b].short}. Build or upgrade a habitat!`;
  if (s.stats.hatched < 3 && zoo.coins >= zoo.eggPrice(0)) return 'You have enough coins for another egg! 🥚';
  const nb = zoo.nextBiome();
  if (nb >= 0 && zoo.coins >= zoo.unlockCost() && s.unlocked < 3) return `You can open the ${BIOMES[nb].name}! Tap its sign on the map.`;
  if (s.stats.hatched < 6 && s.tasks.list.some((t) => t.progress >= t.goal)) return 'A keeper task is done. Open 📋 Tasks to claim it!';
  return '';
}

// ------------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', startPlay);
$('btn-title-book').addEventListener('click', () => { startPlay(); openSheet('book'); });
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-title').addEventListener('click', () => { persist(); toTitle(); });
$('btn-help').addEventListener('click', () => { resume(); openSheet('help'); });
$('btn-mute').addEventListener('click', toggleMute);
$('hud-rank').addEventListener('click', () => openSheet('tasks'));
$('tool-eggs').addEventListener('click', () => { sound.play('click'); openSheet('eggs'); });
$('tool-tasks').addEventListener('click', () => { sound.play('click'); openSheet('tasks'); });
$('tool-book').addEventListener('click', () => { sound.play('click'); openSheet('book'); });
$('tool-decor').addEventListener('click', () => { sound.play('click'); openSheet('decor'); });
$('placing-cancel').addEventListener('click', stopPlacing);
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
addEventListener('resize', () => { renderer.resize(); if (hatch.active) hatch.resize(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('mousemove', () => { pointerIdle = 0; });
addEventListener('pagehide', () => persist());

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  monitor.reset(performance.now());
  if (document.hidden) {
    hiddenAt = Date.now();
    persist();
    return;
  }
  if (!hiddenAt) return;
  hiddenAt = 0;
  // time away earns like being offline; pausing in a visible tab does not
  if (mode === 'paused') { zoo.state.lastSeen = Date.now(); return; }
  const res = zoo.applyOffline(Date.now());
  if (res.coins > 0) {
    log.event('offline.earn', { seconds: Math.round(res.seconds), coins: res.coins, capped: res.capped });
    if (mode === 'play') { closeAllModals(); openWelcome(res); } else pendingWelcome = res;
  }
});

// ------------------------------------------------------------------ loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, modal: modal || 'none', animals: actors.animals.size, visitors: actors.visitors.length, particles: renderer.particles.length }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);

function updatePointer(dt) {
  pointerIdle += dt;
  const playing = mode === 'play' && !modal;
  document.body.classList.toggle('no-cursor', playing && pointerIdle > 2 && input.mode === 'mouse');
}

let last = performance.now();
let ready = false;
function frame(now) {
  monitor.frame(now);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  // Spread baking over the first frames so none of them stalls.
  if (!renderer.sprites.bakeSome(6)) { /* keep baking */ }
  renderer.ground.work(10);
  handleKeys(dt);
  updatePointer(dt);

  if (mode === 'play') {
    if (autopilot && !modal) {
      autopilot.step(dt, Date.now());
      if (zoo.events.some((e) => e.type === 'hatch')) actors.sync(zoo);
    } else zoo.tick(dt);
    actors.update(dt, zoo, { reduced });
    for (const e of actors.events) {
      if (e.type === 'view' && e.amount >= 0.5) {
        renderer.coinPop(e.x, e.y, e.amount);
        const s = renderer.toScreen(e.x, e.y);
        if (s.x > 0 && s.y > 0 && s.x < renderer.W && s.y < renderer.H && !modal) sound.play('coin');
      }
    }
    handleZooEvents();
    saveClock += dt;
    if (saveClock > 5) { saveClock = 0; persist(); }
    hudClock -= dt;
    if (hudClock <= 0) {
      hudClock = 0.1;
      ui.hud(zoo, dayKey());
      $('hint').textContent = modal ? '' : hintText();
    }
    costClock -= dt;
    if (costClock <= 0) { costClock = 0.4; ui.refreshCosts(); }
  } else if (mode === 'title') {
    showZoo.tick(dt);
    showZoo.events.length = 0;
    showActors.update(dt, showZoo, { reduced });
    attractT += dt;
    if (!reduced) {
      const z = zoneRect(Math.floor(attractT / 9) % showZoo.state.unlocked);
      renderer.focusPoint(z.x + z.w / 2 + Math.sin(attractT * 0.3) * 80, z.y + z.h / 2, renderer.zoneZoom() * 0.9);
    }
    for (const e of showActors.events) if (e.type === 'view' && e.amount >= 0.5) renderer.coinPop(e.x, e.y, e.amount);
  }
  if (mode !== 'paused') renderer.update(dt);
  renderer.draw(showZoo, showActors, { hideSigns: mode === 'title' });
  if (hatch.active) { hatch.update(dt); hatch.draw(); }
  if (!ready && renderer.ground.jobs.length === 0) {
    ready = true;
    queueMicrotask(() => monitor.mark(performance.now(), 'play'));
  }
  requestAnimationFrame(loop);
}

const loop = telemetry ? telemetry.guard(frame, 'pocket-zoo.frame') : frame;

function logoPets() {
  const wrap = $('logo-pets');
  for (const id of ['bunny', 'panda', 'penguin']) wrap.appendChild(ui.portrait(id, 100));
}

if (location.protocol !== 'file:') {
  // Offline earnings are worked out at load and shown when the zoo opens.
  const res = zoo.applyOffline(Date.now());
  if (res.coins > 0) {
    pendingWelcome = res;
    log.event('offline.earn', { seconds: Math.round(res.seconds), coins: res.coins, capped: res.capped });
  }
  useWorld(showZoo, showActors);
  actors.sync(zoo, { pop: false });
  logoPets();
  log.event('game.ready', { animals: zoo.ownedCount(), biomes: zoo.state.unlocked, fresh: loaded.fresh, rank: zoo.state.rank });
  if (params.has('play') || autopilot) { toTitle(); startPlay(); } else toTitle();
  persist();
  requestAnimationFrame(loop);
}

window.PZ = {
  get zoo() { return zoo; }, get actors() { return actors; }, get mode() { return mode; }, get modal() { return modal; },
  renderer, ui, sound, hatch, input, persist, openSheet, state,
};
