// Browser entry: screens, the frame loop, input, sound, saves and telemetry.
import { World } from './world.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { FarmerBot } from './bot.js';
import { loadWorld, writeWorld, loadSettings, writeSettings, clearSave } from './save.js';
import { frameMonitor } from './perf.js';
import { FESTIVALS, SEASON_NAMES, CRITTERS, FISH, ITEMS, UPGRADES } from './data.js';
import { SPEEDS } from './time.js';
import { periodOf } from './world.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');
const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch');

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const storage = (() => { try { return localStorage; } catch { return null; } })();
const settings = loadSettings(storage);
if (params.has('fresh')) clearSave(storage);
let saveWarned = false;
function persist() {
  if (!world || isDemo) return false;
  const ok = !!storage && writeWorld(storage, world);
  if (!ok && !saveWarned) { saveWarned = true; log.warn('save.failed', { 'storage.available': !!storage }); }
  return ok;
}
const saveSettings = () => writeSettings(storage, settings);

const canvas = $('game');
const renderer = new Renderer(canvas, { reducedMotion: reduced });
const input = new Input(canvas, (x, y) => renderer.toTile(x, y));
const sound = new Sound({ muted: settings.muted, music: settings.music });
let ui = null;

let mode = 'loading'; // loading | title | play | menu | paused | night | intro
let world = null;
let isDemo = false;
let bot = null;
let autopilot = params.has('autopilot');
document.body.classList.toggle('coarse', coarse);
document.body.classList.toggle('reduced', reduced);

const SCREENS = ['screen-loading', 'screen-title', 'screen-pause', 'screen-night', 'screen-intro', 'screen-confirm'];
function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const playing = mode === 'play' || mode === 'menu';
  $('hud').classList.toggle('hidden', !playing || isDemo);
  $('touch').classList.toggle('hidden', !(coarse && mode === 'play' && !isDemo));
  input.enabled = mode === 'play' && !isDemo;
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  sound.setLevel(mode === 'play' ? 0.6 : mode === 'paused' ? 0.25 : 0.4);
}

// ------------------------------------------------------------ title and demo

function demoWorld() {
  const w = new World({ seed: 20261001 + Math.floor(Math.random() * 5) });
  w.speed = 'brisk';
  w.minute = 8 * 60;
  w.setupDay();
  w.player.x = 15.5; w.player.y = 12.5;
  return w;
}

function toTitle() {
  if (world && !isDemo) persist();
  mode = 'title';
  isDemo = true;
  world = demoWorld();
  bot = new FarmerBot(world);
  renderer.prepare(world);
  renderer.snapCam = true;
  queueMicrotask(() => monitor.mark(performance.now()));
  const saved = loadWorld(storage);
  const cont = $('btn-continue');
  if (saved) {
    const d = saved.date;
    cont.classList.remove('hidden');
    $('continue-sub').textContent = `${SEASON_NAMES[d.season]} ${d.day}, Year ${d.year} · ${saved.money.toLocaleString('en-US')}g`;
  } else cont.classList.add('hidden');
  $('btn-new').classList.toggle('primary', !saved);
  cont.classList.toggle('primary', !!saved);
  updateSettingsButtons();
  showScreen('screen-title');
}

function startGame(fresh) {
  sound.unlock();
  let w = fresh ? null : loadWorld(storage);
  if (!w) {
    const seed = Number(params.get('seed')) || (Date.now() % 1e9);
    w = new World({ seed });
    log.event('farm.new', { seed: w.seed });
  }
  w.speed = settings.speed;
  world = w;
  isDemo = false;
  bot = autopilot ? new FarmerBot(world) : null;
  renderer.prepare(world);
  renderer.snapCam = true;
  if (!ui.beltBuilt) ui.buildBelt(world, pickSlot);
  ui.world = world;
  ui.beltKey = '';
  ui.dayKey = '';
  queueMicrotask(() => monitor.mark(performance.now()));
  log.event('level.start', dayAttrs());
  if (!world.tutorialSeen && !autopilot) { mode = 'intro'; showScreen('screen-intro'); return; }
  play();
}

function play() {
  mode = 'play';
  input.clear();
  showScreen(null);
}

function dayAttrs() {
  const d = world.date;
  return { day: world.day + 1, season: d.season, year: d.year, money: world.money, weather: world.weather };
}

function pickSlot(i) {
  if (!world || isDemo) return;
  world.sel = i;
  sound.play('select');
  ui.updateBelt(world);
}

// ------------------------------------------------------------ pause and menus

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  updateSettingsButtons();
  $('pause-sub').textContent = `${SEASON_NAMES[world.season]} ${world.date.day}, Year ${world.date.year}`;
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  play();
}

function openMenu(menu, data) {
  if (isDemo) return;
  mode = 'menu';
  input.enabled = false;
  $('touch').classList.add('hidden');
  ui.world = world;
  switch (menu) {
    case 'shop': ui.openShop(world); break;
    case 'bin': ui.openSell(world, false); break;
    case 'market': ui.openSell(world, true); break;
    case 'home': ui.openHome(world); break;
    case 'board': ui.openBoard(world); break;
    case 'fair': ui.openFair(world); break;
    case 'bag': ui.openBag(world, () => ui.updateBelt(world)); break;
    case 'journal': ui.openJournal(world); break;
    case 'dialogue': ui.openDialogue(data); break;
    default: mode = 'play'; break;
  }
}

function onMenuClosed() {
  if (mode === 'menu') { mode = 'play'; showScreen(null); }
  ui.updateHud(world);
}

function sleep(passedOut = false) {
  if (!world || isDemo) return;
  const income = world.binValue();
  const summary = world.sleep(passedOut);
  const saved = persist();
  log.event('level.complete', { ...dayAttrs(), income, passedOut, goals: Object.keys(world.goalsDone).length });
  if (summary.newSeason) log.event('season.start', { season: world.season, year: world.date.year, money: world.money });
  renderer.prepare(world) && queueMicrotask(() => monitor.mark(performance.now(), 'season'));
  renderer.snapCam = true;
  renderer.particles.length = 0;
  sound.play('sleep');
  mode = 'night';
  showScreen('screen-night');
  ui.showNight(summary, world, saved);
}

function morning() {
  if (mode !== 'night') return;
  sound.play('morning');
  log.event('level.start', dayAttrs());
  play();
}

// ------------------------------------------------------------ events

function handleWorldEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'menu':
        if (!bot) openMenu(e.menu, e.data);
        break;
      case 'passout':
        if (!bot) { sleep(true); return; }
        break;
      case 'toast': if (!isDemo) ui.toast(e.text, e.tone); break;
      case 'goal':
        if (isDemo) break;
        ui.toast(`⭐ Goal complete: ${e.text}${e.reward ? ` (+${e.reward}g)` : ''}`, 'goal');
        log.event('goal.complete', { goal: e.id, day: world.day + 1 });
        break;
      case 'collect':
        if (isDemo) break;
        log.event('collection.new', { book: e.book, item: e.id });
        if (e.book === 'crops' || e.book === 'goods') ui.toast(`📖 New in your collection: ${ITEMS[e.id].name}!`, 'good');
        break;
      case 'festivalStart': if (!isDemo) log.event('festival.start', { festival: e.id, day: world.day + 1 }); break;
      case 'festivalWon':
        if (isDemo) break;
        ui.toast(`🏆 You won the ${FESTIVALS[e.id].name}!${e.gold ? ` +${e.gold}g` : ''}${e.decor ? ` and a ${ITEMS[e.decor].name} for your farm!` : ''}`, 'goal');
        log.event('festival.won', { festival: e.id, gold: e.gold });
        break;
      case 'upgrade': if (!isDemo) log.event('upgrade.bought', { upgrade: e.id, name: UPGRADES[e.id].name, day: world.day + 1, money: world.money }); break;
      case 'animal': if (!isDemo) log.event('animal.bought', { animal: e.animal, count: world.animals.length }); break;
      case 'request': if (!isDemo) log.event('request.complete', { item: world.requests[e.i].item, villager: world.requests[e.i].villager }); break;
      case 'catch': if (!isDemo && e.first) log.event('fish.new', { fish: e.id, name: FISH[e.id].name }); break;
      case 'critter': if (!isDemo && e.first) log.event('critter.new', { critter: e.id, name: CRITTERS[e.id].name }); break;
      default: break;
    }
  }
}

// ------------------------------------------------------------ settings

function updateSettingsButtons() {
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = settings.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = settings.music ? '🎵 Music on' : '🎵 Music off';
  const names = { relaxed: '🐢 Days: relaxed', normal: '🕰️ Days: normal', brisk: '🐇 Days: brisk' };
  for (const b of document.querySelectorAll('[data-speed]')) b.textContent = names[settings.speed];
  $('btn-mute').textContent = settings.muted ? '🔇' : '🔊';
}
function toggleMute() { settings.muted = !settings.muted; sound.unlock(); sound.setMuted(settings.muted); saveSettings(); updateSettingsButtons(); }
function toggleMusic() { settings.music = !settings.music; sound.unlock(); sound.setMusic(settings.music); saveSettings(); updateSettingsButtons(); }
function cycleSpeed() {
  const order = Object.keys(SPEEDS);
  settings.speed = order[(order.indexOf(settings.speed) + 1) % order.length];
  if (world && !isDemo) world.speed = settings.speed;
  saveSettings();
  updateSettingsButtons();
}

// ------------------------------------------------------------ wiring

$('btn-continue').addEventListener('click', () => startGame(false));
$('btn-new').addEventListener('click', () => {
  if (loadWorld(storage)) { mode = 'confirm'; showScreen('screen-confirm'); }
  else startGame(true);
});
$('btn-confirm-new').addEventListener('click', () => { clearSave(storage); startGame(true); });
$('btn-confirm-cancel').addEventListener('click', toTitle);
$('btn-howto').addEventListener('click', () => { mode = 'intro'; showScreen('screen-intro'); $('btn-intro-go').textContent = world && !isDemo ? 'Let\'s farm!' : 'Back'; });
$('btn-intro-go').addEventListener('click', () => {
  if (world && !isDemo) { world.tutorialSeen = true; persist(); play(); } else toTitle();
});
$('btn-resume').addEventListener('click', resume);
$('btn-pause-journal').addEventListener('click', () => { mode = 'play'; openMenu('journal'); });
$('btn-quit').addEventListener('click', () => { persist(); log.event('farm.quit', dayAttrs()); toTitle(); });
$('btn-pause').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-bag').addEventListener('click', () => { if (mode === 'play') openMenu('bag'); });
$('btn-journal').addEventListener('click', () => { if (mode === 'play') openMenu('journal'); });
$('btn-morning').addEventListener('click', morning);
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-speed]')) b.addEventListener('click', cycleSpeed);
input.bindTouch({ stick: $('stick'), knob: $('knob'), use: $('t-use'), talk: $('t-talk') });
$('t-bag').addEventListener('pointerdown', (e) => { e.preventDefault(); if (mode === 'play') openMenu('bag'); });
addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => {
  monitor.reset(performance.now());
  if (document.hidden) { if (mode === 'play') pause(); persist(); }
});
addEventListener('pagehide', () => persist());
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

// Arrow keys / d-pad move focus between buttons in menus.
function visibleRoot() {
  if (ui?.open === 'dialogue') return $('dialogue');
  if (ui?.open) return $('panel');
  return SCREENS.map($).find((s) => !s.classList.contains('hidden'));
}
function moveFocus(dir) {
  const root = visibleRoot();
  if (!root) return;
  const items = [...root.querySelectorAll('button:not([disabled]), a[href]')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
}
addEventListener('keydown', (e) => {
  if (mode === 'play' || mode === 'loading') return;
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
});

function back() {
  if (ui?.open) ui.close();
  else if (mode === 'paused') resume();
  else if (mode === 'intro' || mode === 'confirm') { if (world && !isDemo) play(); else toTitle(); }
  else if (mode === 'night') morning();
}

// ------------------------------------------------------------ loop

// Hide the pointer after ~2 s without movement during play.
let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, day: world ? world.day + 1 : 0, season: world?.season || 'none', demo: isDemo, critters: world?.critters.length ?? 0, particles: renderer.particles.length }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);

let bakeIter = null;
let prepIter = null;
let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'loading') {
    // Spread sprite baking over frames so the page never freezes.
    const t0 = performance.now();
    let done = false;
    if (prepIter) done = true;
    else while (performance.now() - t0 < 12) { if (bakeIter.next().done) { done = true; break; } }
    $('loading-bar').style.width = `${Math.min(100, (++loadingTicks / 6) * 100)}%`;
    if (done) {
      if (!prepIter) prepIter = renderer.prepareSteps(demoWorld());
      else if (prepIter.next().done) finishLoading();
    }
    requestAnimationFrame(loop);
    return;
  }
  input.pollPad();
  updatePointer(dt);

  const esc = input.consume('Escape');
  if (esc || input.consume('KeyP') || input.consumePad('start')) {
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
    else if (esc) back();
  }
  if (input.consume('KeyM')) toggleMute();
  if (mode === 'play' && !isDemo) {
    if (input.consume('KeyI') || input.consumePad('y')) openMenu('bag');
    else if (input.consume('KeyJ') || input.consumePad('back')) openMenu('journal');
  } else if (mode === 'menu' && (input.consume('KeyI') || input.consume('KeyJ'))) ui.close();
  if (mode !== 'play') {
    if (input.consumePad('up') || input.consumePad('left') || input.consumePad('sup') || input.consumePad('sleft')) moveFocus(-1);
    if (input.consumePad('down') || input.consumePad('right') || input.consumePad('sdown') || input.consumePad('sright')) moveFocus(1);
    if (input.consumePad('a')) document.activeElement?.click?.();
    if (input.consumePad('b')) back();
  }

  const stepping = world && (mode === 'play' || ((mode === 'title' || mode === 'confirm' || mode === 'intro') && isDemo));
  if (stepping) {
    const controls = bot ? bot.controls(dt) : input.read();
    world.step(dt, controls);
    const events = world.events.slice();
    world.events.length = 0;
    renderer.handleEvents(events, world);
    if (!isDemo) sound.handle(events);
    // The bot answers its own menus and goes to bed by itself.
    if (bot) bot.handleEvents(events);
    if (isDemo) {
      if (bot.lastSummary) { world = demoWorld(); bot = new FarmerBot(world); renderer.prepare(world); renderer.snapCam = true; }
    } else {
      handleWorldEvents(events);
      if (bot?.lastSummary) { bot.lastSummary = null; afterBotSleep(); }
    }
    if (world && !isDemo) {
      const period = periodOf(world.minute);
      sound.setScene({ season: world.season, festival: world.festivalRunning() ? world.festival : null, night: world.minute >= 20 * 60, rain: world.weather === 'rain', crickets: period === 'night' && (world.season === 'summer' || world.season === 'autumn') });
    }
  }
  if (world) {
    if (mode !== 'paused') renderer.update(dt, world);
    renderer.hover = input.hover;
    renderer.draw(world, { mouse: input.mode === 'mouse', hideCursor: isDemo || mode !== 'play' });
    if (!isDemo && (mode === 'play' || mode === 'menu')) ui.updateHud(world);
  }
  requestAnimationFrame(loop);
}

// The autopilot slept: autosave and keep going without the bedtime card.
function afterBotSleep() {
  persist();
  log.event('level.complete', { ...dayAttrs(), autopilot: true });
  renderer.prepare(world);
  renderer.snapCam = true;
}

let loadingTicks = 0;
function finishLoading() {
  ui = new UI({ sound, onClose: onMenuClosed, onSleep: () => sleep(false), icons: renderer.icons, portraits: renderer.portraits });
  log.event('game.ready', { hasSave: !!loadWorld(storage), reduced, coarse });
  if (params.has('autopilot') || params.has('play')) startGame(false);
  else toTitle();
}

// A crash inside a frame shows the crash screen instead of a frozen picture.
const loop = telemetry ? telemetry.guard(frame, 'sprout-valley.frame') : frame;

if (location.protocol !== 'file:') {
  bakeIter = renderer.bakeSteps();
  showScreen('screen-loading');
  requestAnimationFrame(loop);
}

window.SV = {
  get world() { return world; }, get mode() { return mode; }, get ui() { return ui; }, renderer, input, sound, settings,
  sleep, startGame, toTitle, persist, set autopilot(v) { autopilot = v; bot = v && world && !isDemo ? new FarmerBot(world) : null; },
};
