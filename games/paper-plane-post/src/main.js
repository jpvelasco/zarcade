// Screens, the loop, the HUD, the route map, the hangar and the album:
// everything that has to touch the browser lives here.

import { Audio } from './audio.js';
import { createPilot } from './ai.js';
import { FOLDS, PAPERS, STAMPS, foldById, meetsNeed, nextStamp, paperById } from './catalog.js';
import { dailyInfo, dateKey } from './daily.js';
import { makeEndless, themeById } from './endless.js';
import { glideStats, tuningFor } from './flight.js';
import { Input } from './input.js';
import { frameMonitor } from './perf.js';
import {
  currentFold, currentPaper, entryFor, formatDistance, formatTime, freshenDaily, loadSave,
  nextRouteIndex, recordEndless, recordRun, refreshStamps, regionOpen, routeOpen, totals, writeSave,
} from './progress.js';
import { Renderer } from './render.js';
import { REGIONS, ROUTES } from './routes.js';
import { bakePlaneIcon, draw } from './sprites.js';
import { WARN_SOAK, World } from './world.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;
const POINTER_IDLE = 2;

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const screens = [...document.querySelectorAll('.overlay')];

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry
  ? telemetry.log
  : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const canvas = $('game');
const renderer = new Renderer(canvas);
const input = new Input();
// Reading `localStorage` throws when the browser blocks site storage; the save
// helpers treat a null store as "nothing saved".
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = freshenDaily(loadSave(storage));
// A save made before a stamp existed should still have it: catch up on load.
if (refreshStamps(save).length) writeSave(storage, save);
const audio = new Audio(save.muted);

const state = {
  mode: 'title',     // title | map | hangar | album | play | paused | result
  kind: 'route',     // route | endless | daily
  index: 0,
  world: null,
  pilot: null,
  attract: false,
  autopilot: query.has('autopilot'),
  peek: query.has('peek'),
  accumulator: 0,
  last: performance.now(),
  endTimer: 0,
  bannerTimer: 0,
  hintTimer: 0,
  pointerIdle: 0,
  pointerHidden: false,
  daily: dailyInfo(dateKey()),
  lastResult: null,
};

renderer.setPeek(state.peek);

// Browsers only allow audio after a real gesture, so hold off until one lands.
let audioArmed = false;
function armAudio() {
  if (audioArmed) return;
  audioArmed = true;
  audio.unlock();
  if (state.mode === 'play') audio.startMusic(regionOfRun());
}
window.addEventListener('pointerdown', armAudio);
window.addEventListener('keydown', armAudio);

function regionOfRun() {
  if (state.kind === 'route') return ROUTES[state.index].region;
  return 3;
}

function tuning() {
  return tuningFor(currentFold(save), currentPaper(save));
}

// ------------------------------------------------------------------ screens

function showScreen(id) {
  for (const screen of screens) screen.classList.toggle('hidden', screen.id !== id);
}

function setPlayUi(on) {
  $('hud').classList.toggle('hidden', !on);
}

function muteLabel() {
  const label = `Sound: ${save.muted ? 'off' : 'on'}`;
  $('btn-title-mute').textContent = label;
  $('btn-pause-mute').textContent = label;
  $('btn-mute').textContent = save.muted ? '✕' : '♪';
  $('btn-mute').classList.toggle('muted', save.muted);
}

function toggleMute() {
  save.muted = !save.muted;
  audio.setMuted(save.muted);
  writeSave(storage, save);
  muteLabel();
  if (!save.muted) audio.click();
}

function showTitle() {
  state.mode = 'title';
  state.attract = true;
  state.kind = 'route';
  audio.stopMusic();
  audio.setAirspeed(0, false);
  setPlayUi(false);
  showScreen('screen-title');
  startAttract();
  const sums = totals(save);
  const bits = [];
  if (sums.routes) bits.push(`${sums.routes}/${sums.routeCount} round${sums.routes === 1 ? '' : 's'}`);
  if (sums.stars) bits.push(`${sums.stars}/${sums.maxStars} stars`);
  if (sums.letters) bits.push(`${sums.letters} letter${sums.letters === 1 ? '' : 's'}`);
  if (save.endless.best) bits.push(`Endless best ${formatDistance(save.endless.best)}`);
  if (save.daily.streak > 1) bits.push(`${save.daily.streak}-day streak`);
  $('title-bests').textContent = bits.length
    ? bits.join(' · ')
    : 'Forty-five rounds across five regions, plus an endless breeze.';
  $('btn-play').innerHTML = sums.routes ? 'Carry on<span>→</span>' : 'Fly the round<span>→</span>';
  muteLabel();
}

/** The title screen flies itself: the autopilot on one of the opened routes. */
function startAttract() {
  const open = ROUTES.filter((_, index) => routeOpen(save, index));
  const route = open[Math.floor(Math.random() * Math.min(open.length, 12))] || ROUTES[0];
  state.index = ROUTES.indexOf(route);
  buildWorld(route.prepare(), REGIONS[route.region]);
  state.pilot = createPilot(state.world);
}

function buildWorld(scene, region) {
  state.world = new World(scene, { tuning: tuning() });
  renderer.setScene(scene, region, currentFold(save), currentPaper(save));
  queueMicrotask(() => monitor.mark(performance.now()));
}

function banner(text, seconds = 3.6) {
  const el = $('banner');
  el.textContent = text;
  el.classList.add('show');
  state.bannerTimer = seconds;
}

let toastTimer = 0;
function toast(text, seconds = 1.6) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), seconds * 1000);
}

// -------------------------------------------------------------------- runs

function startRoute(index) {
  state.kind = 'route';
  state.index = Math.max(0, Math.min(ROUTES.length - 1, index));
  const route = ROUTES[state.index].prepare();
  beginRun(route, REGIONS[route.region]);
  const touch = matchMedia('(pointer: coarse)').matches;
  banner(`${state.index + 1}. ${route.name} — ${route.hint}`);
  if (state.index === 0 && !entryFor(save, route.id).done) {
    $('hold-hint').classList.remove('hidden');
    state.hintTimer = 6;
    if (touch) $('hold-hint').textContent = 'Hold anywhere to dive';
  }
  log.event('level.start', {
    mode: 'route', route: route.id, region: route.region, fold: save.fold, paper: save.paper,
  });
}

function startEndless({ daily = false } = {}) {
  state.kind = daily ? 'daily' : 'endless';
  const seedParam = Number.parseInt(query.get('seed') || '', 10);
  const info = state.daily;
  const scene = daily
    ? makeEndless({ seed: info.seed, theme: info.theme, goal: info.goal })
    : makeEndless({ seed: Number.isFinite(seedParam) ? seedParam : (Date.now() & 0x7fffffff), theme: pickTheme() });
  beginRun(scene, REGIONS[3]);
  banner(daily
    ? `Daily Breeze — ${info.name}. Reach ${info.goal} m.`
    : `Endless Breeze — ${scene.themeName}. ${themeById(scene.theme).blurb}`);
  log.event('level.start', { mode: state.kind, theme: scene.theme, fold: save.fold, paper: save.paper });
}

function pickTheme() {
  const themes = ['soft', 'tail', 'showers', 'thermal', 'brisk', 'clear'];
  return themes[Math.floor(Math.random() * themes.length)];
}

function beginRun(scene, region) {
  buildWorld(scene, region);
  state.pilot = state.autopilot ? createPilot(state.world) : null;
  state.attract = false;
  state.mode = 'play';
  state.accumulator = 0;
  state.endTimer = 0;
  showScreen(null);
  setPlayUi(true);
  hudCache = {};
  updateHud(true);
  if (audioArmed) {
    audio.unlock();
    audio.startMusic(region === REGIONS[3] && state.kind !== 'route' ? 3 : REGIONS.indexOf(region));
    audio.launch();
  }
  revealPointer();
}

function pause() {
  if (state.mode !== 'play') return;
  state.mode = 'paused';
  audio.setAirspeed(0, false);
  showScreen('screen-pause');
  revealPointer();
}

function resume() {
  if (state.mode !== 'paused') return;
  state.mode = 'play';
  state.accumulator = 0;
  showScreen(null);
  setPlayUi(true);
}

function restart() {
  if (state.kind === 'route') startRoute(state.index);
  else startEndless({ daily: state.kind === 'daily' });
}

// ------------------------------------------------------------------ results

const OUTCOME_LINE = {
  landed: 'Post delivered!',
  short: 'Came up short',
  water: 'Splash!',
  stuck: 'Caught!',
  crash: 'Down in the grass',
};

function finishRun() {
  const world = state.world;
  const result = world.result();
  state.lastResult = result;
  state.mode = 'result';
  audio.setAirspeed(0, false);
  audio.stopMusic();
  let record = false;
  let fresh = [];
  if (state.kind === 'route') {
    const folded = recordRun(save, result);
    record = folded.record;
    fresh = folded.newStamps;
    showRouteResult(result, folded.entry, record);
  } else {
    const folded = recordEndless(save, result, { daily: state.kind === 'daily' ? state.daily : null });
    record = folded.record;
    fresh = folded.newStamps;
    showBreezeResult(result, folded);
  }
  writeSave(storage, save);
  renderStamps(fresh);
  log.event(result.outcome === 'landed' || state.kind !== 'route' ? 'level.complete' : 'level.fail', {
    mode: state.kind,
    route: state.kind === 'route' ? ROUTES[state.index].id : state.kind,
    outcome: result.outcome,
    stars: result.stars,
    letters: result.letters,
    rings: result.rings,
    snaps: result.snaps,
    soft: result.soft,
    bullseye: result.bullseye,
    'distance.m': result.distance,
    'time.s': Math.round(result.time * 10) / 10,
    'best.new': !!record,
  });
  setPlayUi(false);
  showScreen('screen-result');
  if (result.outcome === 'landed' || (state.kind !== 'route' && result.distance > 400)) {
    audio.fanfare(result.stars === 3 || record);
  }
}

function badge(text, on, title) {
  return `<span class="badge${on ? ' on' : ''}" title="${title}">${text}</span>`;
}

function showRouteResult(result, entry, record) {
  const route = ROUTES[state.index];
  $('result-eyebrow').textContent = REGIONS[route.region].name.toUpperCase();
  $('result-title').textContent = result.stars === 3
    ? 'A perfect round!'
    : (OUTCOME_LINE[result.outcome] || 'Flight over');
  [...$('result-stars').children].forEach((star, i) => star.classList.toggle('on', i < result.stars));
  $('result-stars').classList.remove('hidden');
  $('result-big').textContent = result.outcome === 'landed'
    ? formatTime(result.time)
    : `${Math.round(result.distance)} m flown`;
  $('result-record').classList.toggle('hidden', !(record && entry.done && result.outcome === 'landed'));
  $('result-record').textContent = 'New best time!';
  $('result-badges').innerHTML = [
    badge('✦ Feather', result.soft, 'Landed gently'),
    badge('◎ Bullseye', result.bullseye, 'Landed right by the box'),
    badge(`✧ ${result.snaps} snap${result.snaps === 1 ? '' : 's'}`, result.snaps > 0, 'Crisp releases out of a dive'),
  ].join('');
  $('result-lines').innerHTML = `
    <div><span>Letters</span><b>${result.letters}/${result.letterTotal}</b></div>
    <div><span>Rings</span><b>${result.rings}/${result.ringTotal}</b></div>
    <div><span>Warm columns</span><b>${result.thermals}</b></div>
    <div><span>Score</span><b>${result.score}</b></div>`;
  const last = state.index >= ROUTES.length - 1;
  const nextOpen = !last && routeOpen(save, state.index + 1);
  const landed = result.outcome === 'landed';
  // The big button is always the obvious next thing: onward, or one more go.
  $('btn-next').innerHTML = landed
    ? (nextOpen ? 'Next round<span>→</span>' : 'Route map')
    : 'Try again';
  $('btn-replay').textContent = 'Fly again';
  $('btn-replay').classList.toggle('hidden', !landed);
}

function showBreezeResult(result, folded) {
  const daily = state.kind === 'daily';
  $('result-eyebrow').textContent = daily ? `DAILY BREEZE · ${state.daily.name}` : 'ENDLESS BREEZE';
  $('result-stars').classList.add('hidden');
  const goal = daily ? state.daily.goal : 0;
  $('result-title').textContent = daily && save.daily.done
    ? 'Goal reached!'
    : (OUTCOME_LINE[result.outcome] || 'Flight over');
  $('result-big').textContent = formatDistance(result.distance);
  $('result-record').classList.toggle('hidden', !folded.record);
  $('result-record').textContent = 'New furthest flight!';
  $('result-badges').innerHTML = [
    badge('✦ Feather', result.soft, 'Landed gently'),
    badge(`✧ ${result.snaps} snap${result.snaps === 1 ? '' : 's'}`, result.snaps > 0, 'Crisp releases out of a dive'),
    badge(`☀ ${result.thermals} column${result.thermals === 1 ? '' : 's'}`, result.thermals > 0, 'Warm columns ridden'),
  ].join('');
  $('result-lines').innerHTML = `
    ${daily ? `<div><span>Goal</span><b>${goal} m</b></div>` : ''}
    <div><span>Letters</span><b>${result.letters}</b></div>
    <div><span>Rings</span><b>${result.rings}</b></div>
    <div><span>Best ever</span><b>${formatDistance(save.endless.best)}</b></div>
    <div><span>Score</span><b>${result.score}</b></div>
    ${daily && save.daily.streak ? `<div><span>Day streak</span><b>${save.daily.streak}</b></div>` : ''}`;
  $('btn-next').innerHTML = 'Fly again<span>→</span>';
  $('btn-replay').textContent = daily ? 'Endless Breeze' : 'Daily Breeze';
  $('btn-replay').classList.remove('hidden');
}

function renderStamps(fresh) {
  const host = $('result-stamps');
  if (!fresh.length) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `<p class="eyebrow">New stamps</p>${fresh.map((id) => {
    const stamp = STAMPS.find((s) => s.id === id);
    return `<span class="stamp earned"><i>${stampGlyph(stamp.art)}</i><b>${stamp.name}</b></span>`;
  }).join('')}`;
  audio.stamp();
}

function stampGlyph(art) {
  return {
    letter: '✉', satchel: '❖', crown: '♛', roof: '⌂', house: '⌂', map: '✥',
    star: '★', ring: '◎', snap: '✧', feather: '✦', thermal: '☀', cloud: '☁',
    mountain: '▲', sun: '☀',
  }[art] || '✦';
}

// ------------------------------------------------------------------ the map

function showMap() {
  state.mode = 'map';
  audio.stopMusic();
  audio.setAirspeed(0, false);
  setPlayUi(false);
  buildMap();
  showScreen('screen-map');
}

function buildMap() {
  const host = $('map-regions');
  host.innerHTML = '';
  const sums = totals(save);
  REGIONS.forEach((region, regionIndex) => {
    const open = regionOpen(save, regionIndex);
    const block = document.createElement('section');
    block.className = `map-region region-${region.id}${open ? '' : ' locked'}`;
    block.innerHTML = `<header><b>${region.name}</b><span>${open ? region.subtitle : `Opens at ${region.needStars} stars`}</span></header>`;
    const list = document.createElement('div');
    list.className = 'map-list';
    ROUTES.forEach((route, index) => {
      if (route.region !== regionIndex) return;
      const entry = entryFor(save, route.id);
      const unlocked = routeOpen(save, index);
      const button = document.createElement('button');
      button.className = `map-route${unlocked ? '' : ' locked'}${entry.done ? ' done' : ''}`;
      button.disabled = !unlocked;
      const stars = [0, 1, 2].map((i) => `<i class="${i < entry.stars ? 'on' : ''}">★</i>`).join('');
      const marks = `${entry.soft ? '<em title="Feather landing">✦</em>' : ''}${entry.bullseye ? '<em title="Bullseye">◎</em>' : ''}`;
      button.innerHTML = `<span class="num">${index + 1}</span>
        <span class="name">${route.name}</span>
        <span class="stars">${stars}${marks}</span>
        <span class="meta">${unlocked
          ? (entry.done
            ? `${formatTime(entry.best)} · ${Math.min(entry.letters, route.letterCount)}/${route.letterCount} letters · ${Math.min(entry.rings, route.ringCount)}/${route.ringCount} rings`
            : `${route.length} m · ${route.letterCount} letters`)
          : 'Finish the round before it'}</span>`;
      button.addEventListener('click', () => {
        audio.click();
        startRoute(index);
      });
      list.appendChild(button);
    });
    block.appendChild(list);
    host.appendChild(block);
  });
  $('map-totals').innerHTML = `<b>${sums.stars}</b>/${sums.maxStars} stars · <b>${sums.letters}</b> letters · <b>${sums.stamps}</b>/${sums.stampCount} stamps`;
}

// --------------------------------------------------------------- the hangar

function statBar(label, value) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `<span class="bar"><i>${label}</i><u><s style="width:${pct}%"></s></u></span>`;
}

function showHangar() {
  state.mode = 'hangar';
  audio.setAirspeed(0, false);
  setPlayUi(false);
  buildHangar();
  showScreen('screen-hangar');
}

function buildHangar() {
  const sums = totals(save);
  const folds = $('hangar-folds');
  folds.innerHTML = '';
  for (const fold of FOLDS) {
    const open = meetsNeed(fold.need, sums);
    const stats = glideStats(tuningFor(fold, currentPaper(save)));
    const card = document.createElement('button');
    card.className = `fold-card${open ? '' : ' locked'}${save.fold === fold.id ? ' chosen' : ''}`;
    card.disabled = !open;
    const holder = document.createElement('div');
    holder.className = 'fold-art';
    if (open) {
      const icon = bakePlaneIcon(fold, currentPaper(save));
      const c = document.createElement('canvas');
      c.width = icon.img.width;
      c.height = icon.img.height;
      c.getContext('2d').drawImage(icon.img, 0, 0);
      c.className = 'fold-canvas';
      holder.appendChild(c);
    } else {
      holder.innerHTML = '<span class="silhouette">✈</span>';
    }
    card.appendChild(holder);
    const text = document.createElement('div');
    text.className = 'fold-text';
    text.innerHTML = `<b>${open ? fold.name : '???'}</b>
      <span>${open ? fold.blurb : `Unlocks with ${fold.need.label}`}</span>
      ${open ? `<span class="bars">
        ${statBar('glide', (stats.ratio - 10.5) / 3.6)}
        ${statBar('speed', (stats.speed - 10) / 2.4)}
        ${statBar('dry', (fold.soakResist - 0.9) / 1.1)}
        ${statBar('snap', (fold.snapScale - 0.9) / 0.4)}
      </span>` : ''}`;
    card.appendChild(text);
    card.addEventListener('click', () => {
      save.fold = fold.id;
      writeSave(storage, save);
      audio.click();
      buildHangar();
      refreshPlaneArt();
    });
    folds.appendChild(card);
  }
  const papers = $('hangar-papers');
  papers.innerHTML = '';
  for (const paper of PAPERS) {
    const open = meetsNeed(paper.need, sums);
    const card = document.createElement('button');
    card.className = `paper-card${open ? '' : ' locked'}${save.paper === paper.id ? ' chosen' : ''}`;
    card.disabled = !open;
    card.innerHTML = `<i style="background:linear-gradient(145deg, ${paper.ink}, ${paper.trim} 60%, ${paper.accent})"></i>
      <b>${open ? paper.name : '???'}</b>
      <span>${open ? '' : paper.need.label}</span>`;
    card.addEventListener('click', () => {
      save.paper = paper.id;
      writeSave(storage, save);
      audio.click();
      buildHangar();
      refreshPlaneArt();
    });
    papers.appendChild(card);
  }
  $('hangar-note').textContent = `${foldById(save.fold).name} on ${paperById(save.paper).name}`;
}

function refreshPlaneArt() {
  if (!state.world) return;
  renderer.planeKey = null;
  renderer.setScene(state.world.scene, REGIONS[regionOfRun()], currentFold(save), currentPaper(save));
  state.world.tuning = tuning();
}

// ---------------------------------------------------------------- the album

function showAlbum() {
  state.mode = 'album';
  audio.setAirspeed(0, false);
  setPlayUi(false);
  const sums = totals(save);
  const host = $('album-grid');
  host.innerHTML = STAMPS.map((stamp) => {
    const earned = save.stamps.includes(stamp.id);
    const have = sums[stamp.kind] || 0;
    return `<div class="stamp ${earned ? 'earned' : 'missing'}" title="${stamp.blurb}">
      <i>${earned ? stampGlyph(stamp.art) : '?'}</i>
      <b>${earned ? stamp.name : '• • •'}</b>
      <span>${earned ? stamp.blurb : `${Math.min(have, stamp.need)}/${stamp.need}`}</span>
    </div>`;
  }).join('');
  $('album-totals').innerHTML = `<b>${save.stamps.length}</b>/${STAMPS.length} stamps`;
  const next = nextStamp(sums);
  $('album-next').textContent = next
    ? `Next up: ${next.stamp.name} — ${next.left} to go.`
    : 'Every stamp in the album. Beautiful work.';
  showScreen('screen-album');
}

// ---------------------------------------------------------------------- HUD

let hudCache = {};
function updateHud(force = false) {
  const world = state.world;
  if (!world) return;
  if (force) {
    if (state.kind === 'route') {
      const route = ROUTES[state.index];
      $('hud-region').textContent = REGIONS[route.region].name.toUpperCase();
      $('hud-route').textContent = `${state.index + 1}. ${route.name}`;
    } else {
      $('hud-region').textContent = state.kind === 'daily' ? 'DAILY BREEZE' : 'ENDLESS BREEZE';
      $('hud-route').textContent = state.kind === 'daily' ? state.daily.name : world.scene.themeName;
    }
    $('chip-letters').classList.toggle('hidden', world.letterTotal === 0 && state.kind === 'route');
    $('chip-rings').classList.toggle('hidden', world.ringTotal === 0 && state.kind === 'route');
  }
  const letters = world.letterTotal ? `${world.letters}/${world.letterTotal}` : String(world.letters);
  if (force || hudCache.letters !== letters) {
    $('chip-letters').lastElementChild.textContent = letters;
    hudCache.letters = letters;
  }
  const rings = world.ringTotal && state.kind === 'route' ? `${world.ringsHit}/${world.ringTotal}` : String(world.ringsHit);
  if (force || hudCache.rings !== rings) {
    $('chip-rings').lastElementChild.textContent = rings;
    hudCache.rings = rings;
  }
  const main = state.kind === 'route'
    ? formatTime(world.time)
    : `${Math.round(world.best)} m`;
  if (force || hudCache.main !== main) {
    $('chip-main').firstElementChild.textContent = main;
    hudCache.main = main;
  }
  const wet = Math.round(world.plane.soak * 100);
  if (force || hudCache.wet !== wet) {
    $('wet-fill').style.width = `${wet}%`;
    $('wet').classList.toggle('show', world.plane.soak > 0.04);
    $('wet').classList.toggle('warn', world.plane.soak >= WARN_SOAK);
    hudCache.wet = wet;
  }
  const clear = Math.max(0, world.altitude());
  const gauge = Math.round(Math.min(1, clear / 90) * 100);
  if (force || hudCache.gauge !== gauge) {
    $('gauge-fill').style.height = `${gauge}%`;
    hudCache.gauge = gauge;
  }
}

// ------------------------------------------------------------------ pointer

function revealPointer() {
  state.pointerIdle = 0;
  if (state.pointerHidden) {
    state.pointerHidden = false;
    document.body.classList.remove('no-cursor');
  }
}
window.addEventListener('mousemove', revealPointer);
window.addEventListener('pointerdown', revealPointer);

function updatePointer(dt) {
  if (state.mode !== 'play') {
    revealPointer();
    return;
  }
  state.pointerIdle += dt;
  const hide = state.pointerIdle > POINTER_IDLE;
  if (hide !== state.pointerHidden) {
    state.pointerHidden = hide;
    document.body.classList.toggle('no-cursor', hide);
  }
}

// --------------------------------------------------------------------- loop

// Frame telemetry: slow frames, struggling 10 s windows, and a watchdog outside
// the loop that notices when frames stop while the page is visible.
const monitor = frameMonitor({
  log,
  snapshot: () => ({
    mode: state.mode,
    kind: state.kind,
    route: state.kind === 'route' ? ROUTES[state.index].id : state.kind,
    status: state.world ? state.world.status : 'none',
  }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

function handleEvents(world) {
  if (!world.events.length) return;
  renderer.handleEvents(world.events);
  audio.handleEvents(world.events, world.time);
  if (!state.attract) {
    for (const event of world.events) {
      if (event.type === 'letter') toast(`Letter ${event.index} delivered!`);
      else if (event.type === 'snap') toast('Crisp fold!', 0.9);
      else if (event.type === 'soaking') toast('Your wings are getting wet');
      else if (event.type === 'thermal') toast('Warm air!', 0.9);
      else if (event.type === 'milestone' && event.metres % 200 === 0) toast(`${event.metres} m`, 1);
    }
  }
  world.events.length = 0;
}

function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - state.last) / 1000);
  state.last = now;
  updatePointer(dt);

  if (input.take('pause')) {
    if (state.mode === 'play') pause();
    else if (state.mode === 'paused') resume();
    else if (state.mode === 'map' || state.mode === 'hangar' || state.mode === 'album') showTitle();
  }
  if (input.take('mute')) toggleMute();
  if (input.take('restart') && (state.mode === 'play' || state.mode === 'paused')) restart();
  if (input.take('confirm')) {
    if (state.mode === 'title') $('btn-play').click();
    else if (state.mode === 'result') $('btn-next').click();
    else if (state.mode === 'paused') resume();
  }

  if (state.bannerTimer > 0) {
    state.bannerTimer -= dt;
    if (state.bannerTimer <= 0) $('banner').classList.remove('show');
  }
  if (state.hintTimer > 0) {
    state.hintTimer -= dt;
    if (state.hintTimer <= 0) $('hold-hint').classList.add('hidden');
  }

  const world = state.world;
  let dive = false;
  if (world && (state.mode === 'play' || state.attract)) {
    state.accumulator += dt;
    let steps = 0;
    while (state.accumulator >= STEP && steps < MAX_STEPS) {
      const controls = state.pilot ? state.pilot.control(STEP) : input.read();
      dive = !!controls.dive;
      if (world.status === 'flying') {
        world.step(STEP, controls);
        handleEvents(world);
      }
      state.accumulator -= STEP;
      steps += 1;
    }
    if (steps >= MAX_STEPS) state.accumulator = 0;
    if (state.mode === 'play') {
      updateHud();
      audio.setAirspeed(world.plane.airspeed, world.status === 'flying');
      if (world.status !== 'flying') {
        state.endTimer += dt;
        if (state.endTimer > (world.status === 'done' ? 1.1 : 1.4)) finishRun();
      }
    } else if (world.status !== 'flying') {
      // The attract flight simply starts another round.
      state.endTimer += dt;
      if (state.endTimer > 1.6) {
        state.endTimer = 0;
        startAttract();
      }
    }
  }

  if (world) {
    renderer.frame(world, dt, { follow: true, dive: dive && state.mode === 'play' });
  }
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture;
// after a crash the guard returns early, so the loop stops rescheduling.
const loop = telemetry ? telemetry.guard(frame, 'paper-plane-post.frame') : frame;

// ------------------------------------------------------------------- wiring

$('btn-play').addEventListener('click', () => startRoute(nextRouteIndex(save)));
$('btn-map').addEventListener('click', showMap);
$('btn-endless').addEventListener('click', () => startEndless());
$('btn-daily').addEventListener('click', () => startEndless({ daily: true }));
$('btn-hangar').addEventListener('click', showHangar);
$('btn-album').addEventListener('click', showAlbum);
$('btn-map-back').addEventListener('click', showTitle);
$('btn-map-top').addEventListener('click', showTitle);
$('btn-hangar-top').addEventListener('click', showTitle);
$('btn-album-top').addEventListener('click', showTitle);
$('btn-hangar-back').addEventListener('click', showTitle);
$('btn-album-back').addEventListener('click', showTitle);
$('btn-title-mute').addEventListener('click', toggleMute);
$('btn-pause-mute').addEventListener('click', toggleMute);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', restart);
$('btn-pause-map').addEventListener('click', showMap);
$('btn-result-map').addEventListener('click', showMap);
$('btn-replay').addEventListener('click', () => {
  if (state.kind === 'route') startRoute(state.index);
  else startEndless({ daily: state.kind !== 'daily' });
});
$('btn-next').addEventListener('click', () => {
  if (state.kind !== 'route') {
    startEndless({ daily: state.kind === 'daily' });
    return;
  }
  const done = state.lastResult && state.lastResult.outcome === 'landed';
  if (!done) startRoute(state.index);
  else if (state.index < ROUTES.length - 1 && routeOpen(save, state.index + 1)) startRoute(state.index + 1);
  else showMap();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('resize', () => renderer.resize());
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (event) => {
  renderer.setReduced(event.matches);
});
input.bindHold($('stage'));

{
  const sums = totals(save);
  log.event('game.ready', { stars: sums.stars, rounds: sums.routes, stamps: sums.stamps, letters: sums.letters });
}

// A round can be opened straight from the address bar: ?route=7
const wanted = Number.parseInt(query.get('route') || '', 10);
showTitle();
if (query.has('endless')) startEndless();
else if (query.has('daily')) startEndless({ daily: true });
else if (Number.isFinite(wanted) && wanted >= 1 && wanted <= ROUTES.length) startRoute(wanted - 1);
else if (state.autopilot) startRoute(nextRouteIndex(save));

requestAnimationFrame(loop);

window.PPP = {
  get world() { return state.world; },
  get state() { return state; },
  renderer,
  input,
  save,
  startRoute,
  startEndless,
  draw,
  peek: (on) => {
    state.peek = !!on;
    renderer.setPeek(!!on);
  },
  forceCrash() {
    state.world = { get plane() { throw new Error('forced crash'); } };
  },
};
