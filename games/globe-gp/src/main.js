import * as THREE from 'three';
import { LOCATIONS, LOCATION_BY_ID, RACE_KINDS } from './locations.js';
import { CARS, CAR_BY_ID, UPGRADES, statBars } from './cars.js';
import { Race, DT, medalRace, medalsFrom } from './race.js';
import { getTrack } from './track.js';
import { RIVALS, DIFFICULTY } from './ai.js';
import { CUPS, CUP_BY_ID, newCup, applyResult, standings, pointsFor, raceCoins, trophyFor } from './championship.js';
import {
  loadSave, writeSave, totalStars, cupUnlocked, carStatus, buyCar, upgradesFor, upgradeCost, buyUpgrade, liveryFor,
  recordRace, recordTimeTrial, medalFor, loadGhost, saveGhost, DIFFICULTIES, SAVE_KEY, adoptSave, settleCup,
} from './progress.js';
import { buildWorld } from './render/world.js';
import { RaceView } from './render/view.js';
import { MenuScene } from './render/globe.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { frameMonitor } from './perf.js';
import { formatTime, ordinal } from './math.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };
const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || params.has('reduced');

let storage = null;
try { storage = window.localStorage; } catch { storage = null; }
const save = loadSave(storage);
let saveWarned = false;
function persist() {
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', {});
}
// A cup whose last race finished before the trophy screen was seen.
if (settleCup(save)) persist();

const input = new Input();
input.steerMode = save.touchSteer;
input.autoAccel = save.autoAccel;
// Touch shows a gas button only when automatic gas is off.
const showGas = () => document.querySelector('#touch [data-key=gas]')?.classList.toggle('hidden', !!save.autoAccel);
showGas();
document.body.classList.toggle('tilt', save.touchSteer === 'tilt');
const audio = new Audio({ muted: save.muted, music: save.music });
const hud = new Hud();

const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

// Quality levels: [pixel ratio cap, shadow map size]. Drops when frames run long.
const QUALITY = [[0.7, 512], [1, 1024], [1.5, 1024]];
let quality = params.has('quality') ? Math.max(0, Math.min(2, Number(params.get('quality')))) : 2;
function applyQuality() {
  const [cap, shadow] = QUALITY[quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  resize();
  if (view) view.setShadowQuality(shadow);
}

const menu = new MenuScene(renderer, { reduced });
let race = null, view = null, loader = null;
let mode = 'menu'; // menu | loading | race | paused | results
let setup = null;  // { loc, kind, cupId }
let accumulator = 0, endTimer = 0;
let medals = null;
let menuReady = false;
let lastTimings = [];

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  menu.resize(w, h);
  if (view) view.resize(w, h);
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------ screens

const SCREENS = ['screen-title', 'screen-cups', 'screen-cup', 'screen-pick', 'screen-garage', 'screen-options', 'screen-loading', 'screen-pause', 'screen-results'];
let current = null;
const backStack = [];

function showScreen(id, { push = true } = {}) {
  if (push && current && current !== id && !['screen-loading', 'screen-pause', 'screen-results'].includes(current)) backStack.push(current);
  current = id;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const racing = mode === 'race' || mode === 'paused';
  hud.show(racing && id !== 'screen-results');
  $('touch').classList.toggle('hidden', !(racing && input.touchMode && id === null));
  $('pin-labels').classList.toggle('hidden', !(mode === 'menu' && ['screen-title', 'screen-cups', 'screen-cup', 'screen-pick'].includes(id)));
  menu.showGarage(id === 'screen-garage');
  if (id) $(id).querySelector('.btn.primary:not(:disabled), .btn:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true });
}

function back() {
  audio.click();
  const prev = backStack.pop() || 'screen-title';
  openScreen(prev, false);
}

function openScreen(id, push = true) {
  mode = 'menu';
  if (id === 'screen-title') renderTitle();
  if (id === 'screen-cups') renderCups();
  if (id === 'screen-cup') renderCup(setup?.cupId || save.cup?.cupId || 'sunrise');
  if (id === 'screen-pick') renderPick(pickMode);
  if (id === 'screen-garage') renderGarage();
  if (id === 'screen-options') renderOptions();
  if (id === 'screen-title') { menu.focusOn(null); menu.route.visible = false; }
  audio.playMusic(null);
  showScreen(id, { push });
}

function toTitle() {
  backStack.length = 0;
  disposeRace();
  openScreen('screen-title', false);
}

function renderTitle() {
  $('title-stars').textContent = totalStars(save);
  $('title-coins').textContent = save.coins;
}

// ------------------------------------------------------------ cups

function renderCups() {
  const list = $('cup-list');
  list.innerHTML = '';
  for (const cup of CUPS) {
    const open = cupUnlocked(save, cup);
    const stars = save.cupStars[cup.id] || 0;
    const b = document.createElement('button');
    b.className = 'cup';
    b.style.setProperty('--c', cup.color);
    b.disabled = !open;
    const inProgress = save.cup?.cupId === cup.id ? ` · race ${save.cup.round + 1}/${cup.races.length}` : '';
    b.innerHTML = `<span class="emoji">${open ? cup.emoji : '🔒'}</span><span class="name">${cup.name}</span>
      <span class="meta">${open ? `${cup.races.length} races${inProgress}` : `Needs ${cup.needStars} ⭐`}</span>
      <span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
    b.addEventListener('click', () => { audio.click(); setup = { cupId: cup.id }; openScreen('screen-cup'); });
    b.addEventListener('focus', () => { menu.focusOn(cup.races[0].loc); menu.showRoute(cup.races.map((r) => r.loc)); });
    list.appendChild(b);
  }
}

function renderCup(cupId) {
  const cup = CUP_BY_ID[cupId];
  const state = save.cup?.cupId === cupId ? save.cup : null;
  $('cup-title').textContent = `${cup.emoji} ${cup.name}`;
  $('cup-blurb').textContent = cup.blurb;
  const ol = $('cup-races');
  ol.innerHTML = '';
  cup.races.forEach((r, i) => {
    const loc = LOCATION_BY_ID[r.loc];
    const li = document.createElement('li');
    const round = state ? state.round : 0;
    li.className = i < round ? 'done' : i === round ? 'next' : '';
    const place = state && state.places.player[i];
    li.innerHTML = `<span class="flag">${loc.flag}</span><span><b>${loc.name}</b><br><span class="muted small">${loc.time} · ${loc.weather === 'none' ? 'clear' : loc.weather}</span></span>
      <span class="kind">${RACE_KINDS[r.kind].icon} ${RACE_KINDS[r.kind].label}${place ? ` · ${ordinal(place)}` : ''}</span>`;
    ol.appendChild(li);
  });
  const table = $('cup-standings');
  table.innerHTML = state && state.round > 0 ? standingsTable(state) : '';
  $('cup-go').textContent = state ? `Race ${state.round + 1} →` : 'Start cup →';
  $('cup-reset').classList.toggle('hidden', !state);
  const next = cup.races[state ? state.round : 0];
  menu.focusOn(next.loc);
  menu.showRoute(cup.races.map((r) => r.loc));
}

function standingsTable(state) {
  const rows = standings(state);
  const head = '<div class="tr head"><span>#</span><span>Driver</span><span class="num">Points</span><span></span></div>';
  return head + rows.map((s, i) => {
    const who = s.key === 'player' ? { name: 'You', flag: '⭐' } : RIVALS.find((r) => r.id === s.key);
    return `<div class="tr${s.key === 'player' ? ' me' : ''}"><span>${i + 1}</span><span>${who.flag} ${who.name}</span><span class="num">${s.points}</span><span></span></div>`;
  }).join('');
}

$('cup-go').addEventListener('click', () => {
  const cupId = setup.cupId;
  if (save.cup?.cupId !== cupId) {
    save.cup = newCup(cupId, ['player', ...RIVALS.map((r) => r.id)]);
    persist();
    log.event('cup.start', { cup: cupId });
  }
  const r = CUP_BY_ID[cupId].races[save.cup.round];
  startRace({ loc: r.loc, kind: r.kind, cupId });
});
$('cup-reset').addEventListener('click', () => {
  save.cup = null;
  persist();
  renderCup(setup.cupId);
});

// ------------------------------------------------------------ quick race / time attack

let pickMode = 'quick';
let pickKind = 'circuit';

function renderPick(which) {
  pickMode = which;
  $('pick-title').textContent = which === 'quick' ? '🏁 Quick Race' : '👻 Time Attack';
  const kinds = $('pick-kinds');
  kinds.innerHTML = '';
  if (which === 'quick') {
    for (const k of ['circuit', 'sprint', 'elimination']) {
      const b = document.createElement('button');
      b.textContent = `${RACE_KINDS[k].icon} ${RACE_KINDS[k].label}`;
      b.className = k === pickKind ? 'on' : '';
      b.title = RACE_KINDS[k].blurb;
      b.addEventListener('click', () => { pickKind = k; audio.click(); renderPick(which); $('pick-kinds').querySelector('.on')?.focus(); });
      kinds.appendChild(b);
    }
  }
  const list = $('pick-list');
  list.innerHTML = '';
  for (const loc of LOCATIONS) {
    const P = loc.palette;
    const b = document.createElement('button');
    b.className = 'loc';
    b.style.background = `linear-gradient(180deg, ${P.skyTop}, ${P.skyHorizon} 60%, ${P.ground})`;
    const trackId = `${loc.id}-${which === 'quick' && pickKind === 'sprint' ? 'sprint' : 'circuit'}`;
    let meta = `${loc.time}`;
    if (which === 'attack') {
      const m = save.medals[trackId];
      meta = `${m ? { gold: '🥇', silver: '🥈', bronze: '🥉' }[m] + ' ' : ''}${save.bestLap[trackId] ? `Best ${formatTime(save.bestLap[trackId])}` : 'No lap yet'}`;
    } else {
      const best = save.best[`${trackId}:${pickKind}`];
      if (best) meta = `Best ${formatTime(best)}`;
    }
    b.innerHTML = `<span class="flag">${loc.flag}</span><span class="name">${loc.city}</span><span class="meta">${meta}</span>`;
    b.addEventListener('click', () => startRace({ loc: loc.id, kind: which === 'quick' ? pickKind : 'timetrial' }));
    b.addEventListener('focus', () => menu.focusOn(loc.id));
    b.addEventListener('mouseenter', () => menu.focusOn(loc.id));
    list.appendChild(b);
  }
  menu.route.visible = false;
}

// ------------------------------------------------------------ garage

let garageCar = save.car;

function renderGarage() {
  $('garage-stars').textContent = totalStars(save);
  $('garage-coins').textContent = save.coins;
  const list = $('car-list');
  list.innerHTML = '';
  for (const car of CARS) {
    const st = carStatus(save, car.id);
    const b = document.createElement('button');
    b.className = `car-tile${car.id === garageCar ? ' on' : ''}${st.owned ? '' : ' locked'}`;
    const col = car.colors[save.liveries[car.id] || 0];
    b.innerHTML = `<span class="dot" style="background:${col}"></span><span>${st.owned ? '' : '🔒'}${car.kind}</span>`;
    b.addEventListener('click', () => { garageCar = car.id; audio.click(); renderGarage(); list.querySelector('.on')?.focus(); });
    list.appendChild(b);
  }
  const car = CAR_BY_ID[garageCar];
  const st = carStatus(save, car.id);
  $('car-name').textContent = `${car.name}${car.id === save.car ? ' ✓' : ''}`;
  $('car-blurb').textContent = car.blurb;
  const bars = statBars(car);
  $('car-stats').innerHTML = Object.entries({ Speed: bars.speed, Accel: bars.accel, Grip: bars.grip, Drift: bars.drift, Weight: bars.weight })
    .map(([k, v]) => `<div class="stat"><span>${k}</span><span class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</span></div>`).join('');
  const sw = $('car-colors');
  sw.innerHTML = '';
  car.colors.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = `swatch${(save.liveries[car.id] || 0) === i ? ' on' : ''}`;
    b.style.background = c;
    b.setAttribute('aria-label', `Paint ${i + 1}`);
    b.addEventListener('click', () => { save.liveries[car.id] = i; persist(); audio.click(); renderGarage(); });
    sw.appendChild(b);
  });
  const ups = $('car-upgrades');
  ups.innerHTML = '';
  if (st.owned) {
    const lv = upgradesFor(save, car.id);
    for (const [key, u] of Object.entries(UPGRADES)) {
      const cost = upgradeCost(save, car.id, key);
      const row = document.createElement('div');
      row.className = 'upgrade';
      row.innerHTML = `<div><b>${u.label} ${'●'.repeat(lv[key])}${'○'.repeat(u.costs.length - lv[key])}</b><br><span>${u.blurb}</span></div>`;
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = cost === null ? 'Maxed' : `🪙 ${cost}`;
      b.disabled = cost === null || save.coins < cost;
      b.addEventListener('click', () => {
        if (!buyUpgrade(save, car.id, key)) return;
        persist();
        log.event('upgrade.buy', { car: car.id, upgrade: key, level: upgradesFor(save, car.id)[key] });
        audio.tone(880, 0.15, { type: 'triangle' });
        renderGarage();
      });
      row.appendChild(b);
      ups.appendChild(row);
    }
  }
  const action = $('car-action');
  if (st.owned) {
    action.textContent = car.id === save.car ? 'Selected ✓' : 'Drive this car';
    action.disabled = car.id === save.car;
    action.onclick = () => { save.car = car.id; persist(); audio.click(); renderGarage(); };
  } else if (!st.starsOk) {
    action.textContent = `🔒 Needs ${car.stars} ⭐`;
    action.disabled = true;
  } else {
    action.textContent = `Buy for 🪙 ${car.price}`;
    action.disabled = !st.canBuy;
    action.onclick = () => {
      if (!buyCar(save, car.id)) return;
      persist();
      log.event('car.buy', { car: car.id, coins: save.coins });
      audio.tone(660, 0.2, { type: 'square' }); audio.tone(990, 0.3, { type: 'square', delay: 0.12 });
      renderGarage();
    };
  }
  const liv = liveryFor(save, car.id);
  menu.setCar(car.id, liv.color, liv.accent);
}

// ------------------------------------------------------------ options

function seg(el, options, value, onPick) {
  el.innerHTML = '';
  for (const [v, label] of options) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = v === value ? 'on' : '';
    b.addEventListener('click', () => { onPick(v); audio.click(); renderOptions(); el.querySelector('.on')?.focus(); });
    el.appendChild(b);
  }
}

function renderOptions() {
  seg($('opt-diff'), DIFFICULTIES.map((d) => [d, DIFFICULTY[d].label]), save.difficulty, (v) => { save.difficulty = v; persist(); });
  seg($('opt-steer'), [['buttons', 'Buttons'], ['tilt', 'Tilt']], save.touchSteer, async (v) => {
    if (v === 'tilt' && !(await input.enableTilt())) v = 'buttons';
    save.touchSteer = v; input.steerMode = v; document.body.classList.toggle('tilt', v === 'tilt'); persist(); renderOptions();
  });
  $('opt-sound').textContent = save.muted ? 'Off' : 'On';
  $('opt-music').textContent = save.music ? 'On' : 'Off';
  $('opt-auto').textContent = save.autoAccel ? 'On' : 'Off';
}
$('opt-sound').addEventListener('click', () => { toggleSound(); renderOptions(); });
$('opt-music').addEventListener('click', () => { toggleMusic(); renderOptions(); });
$('opt-auto').addEventListener('click', () => { save.autoAccel = !save.autoAccel; input.autoAccel = save.autoAccel; showGas(); persist(); renderOptions(); });

function toggleSound() {
  save.muted = !save.muted;
  audio.setMuted(save.muted);
  persist();
  $('btn-sound').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
}
function toggleMusic() {
  save.music = !save.music;
  audio.setMusic(save.music);
  persist();
  $('btn-music').textContent = `Music: ${save.music ? 'on' : 'off'}`;
}

// ------------------------------------------------------------ races

const TIPS = [
  'Hold Space or Shift while turning to drift. Let go for a mini-turbo!',
  'Drift longer for a hotter spark: blue, then orange, then purple.',
  'Tuck in behind a rival to slipstream and fill your boost meter.',
  'Jumps and drifts fill the boost meter. Press X or Enter to burn it.',
  'Snow, sand and wet roads are slippery. Rally cars and pickups cope best.',
  'Look for gaps in the wall: shortcuts save time on loose ground.',
  'Hold the gas just as the countdown ends for a perfect start.',
  'Press R if you get stuck, and you will be put back on the road.',
];

function disposeRace() {
  if (view) view.dispose();
  view = null;
  race = null;
  loader = null;
}

function startRace(s) {
  audio.unlock();
  disposeRace();
  setup = s;
  const loc = LOCATION_BY_ID[s.loc];
  const car = CAR_BY_ID[save.car];
  mode = 'loading';
  $('load-flag').textContent = loc.flag;
  $('load-name').textContent = loc.name;
  $('load-blurb').textContent = loc.blurb;
  const kind = RACE_KINDS[s.kind];
  $('load-meta').textContent = `${kind.icon} ${kind.label} · ${loc.time}${s.cupId ? ` · ${CUP_BY_ID[s.cupId].name} race ${save.cup.round + 1}` : ''}`;
  $('load-tip').textContent = `Tip: ${TIPS[Math.floor(Math.random() * TIPS.length)]}`;
  $('load-bar').style.width = '0%';
  showScreen('screen-loading', { push: false });
  menu.focusOn(loc.id);
  const ghost = s.kind === 'timetrial' ? loadGhost(storage, getTrack(loc, 'circuit').id) : null;
  loader = { step: 0, s, loc, car, ghost, gen: null, built: null, started: performance.now(), timings: [] };
  lastTimings = loader.timings;
  log.event('level.start', { location: loc.id, kind: s.kind, car: car.id, difficulty: save.difficulty, cup: s.cupId || '' });
}

// Runs loading work for at most ~10 ms per frame.
function advanceLoader() {
  const L = loader;
  const t0 = performance.now();
  while (performance.now() - t0 < 10 && loader === L) {
    const s0 = performance.now(), stepWas = L.step;
    advanceStep(L);
    L.timings.push([stepWas, Math.round(performance.now() - s0), L.lastPhase]);
    if (L.step === 4 || L.step === 6) break;
  }
  if (L.step === 6) { beginRace(); return; }
  const pct = L.step === 1 ? 10 + (L.phases || 0) * 9 : [0, 10, 80, 88, 94, 100][L.step];
  $('load-bar').style.width = `${Math.min(100, pct)}%`;
}

function advanceStep(L) {
  if (L.step === 0) {
    race = new Race({
      location: L.loc, kind: L.s.kind, car: L.car, upgrades: upgradesFor(save, L.car.id), livery: liveryFor(save, L.car.id),
      difficulty: save.difficulty, autopilot: params.has('autopilot'), ghost: L.ghost,
      laps: params.has('laps') && L.s.kind !== 'sprint' ? Math.max(1, Number(params.get('laps')) || 1) : undefined,
    });
    L.gen = buildWorld(race.track, L.loc, { quality: quality === 0 ? 0.6 : 1, reduced });
    L.step = 1;
  } else if (L.step === 1) {
    const r = L.gen.next();
    if (r.done) { L.built = r.value; L.step = 2; }
    else { L.phases = (L.phases || 0) + 1; L.lastPhase = r.value; }
  } else if (L.step === 2) {
    // Time trials: run the autopilot's flying lap a slice at a time.
    if (L.s.kind !== 'timetrial') { medals = null; L.step = 3; return; }
    if (!L.medal) L.medal = medalRace(L.loc, L.car);
    for (let i = 0; i < 120 && L.medal.status !== 'finished' && L.medal.time < 300; i++) { L.medal.step(DT); L.medal.events.length = 0; }
    if (L.medal.status === 'finished' || L.medal.time >= 300) { medals = medalsFrom(L.medal); L.medal = null; L.step = 3; }
  } else if (L.step === 3) {
    view = new RaceView(renderer, race, L.built, { reduced });
    view.setShadowQuality(QUALITY[quality][1]);
    resize();
    view.update(0);
    L.step = 4;
    const started = performance.now();
    Promise.resolve()
      .then(() => renderer.compileAsync(view.scene, view.camera))
      .catch((error) => log.exception(error, { 'error.source': 'compileAsync' }))
      .then(() => {
        if (loader !== L) return;
        log.info('scene.ready', { location: L.loc.id, 'compile.ms': Math.round(performance.now() - started), 'load.ms': Math.round(performance.now() - L.started) });
        L.step = 5;
      });
    queueMicrotask(() => monitor.mark(performance.now()));
  } else if (L.step === 5) {
    L.step = 6;
  }
}

function beginRace() {
  loader = null;
  mode = 'race';
  accumulator = 0;
  endTimer = 0;
  hud.reset(race, view);
  input.clearPressed();
  audio.setCar(CAR_BY_ID[save.car]);
  audio.playMusic(race.location.music);
  view.cam.mode = 'intro';
  showScreen(null, { push: false });
  queueMicrotask(() => monitor.mark(performance.now(), 'race'));
  perfWindow.length = 0;
}

function pause() {
  if (mode !== 'race') return;
  // Over the line already: go straight to the results, which save the race.
  if (race?.status === 'finished') { showResults(); return; }
  mode = 'paused';
  input.clearPressed();
  $('btn-sound').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
  $('btn-music').textContent = `Music: ${save.music ? 'on' : 'off'}`;
  audio.silence();
  showScreen('screen-pause', { push: false });
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'race';
  input.clearPressed();
  showScreen(null, { push: false });
}

// ------------------------------------------------------------ results

function showResults() {
  mode = 'results';
  resultsAt = performance.now();
  input.clearPressed();
  const p = race.player;
  const s = setup;
  const loc = race.location;
  const results = race.results();
  const me = results.find((r) => r.isPlayer);
  const place = me.place;
  const lines = [];
  const buttons = [];
  let cupEnd = null;
  view.cam.mode = 'orbit';
  view.cam.t = 0;

  if (race.kind === 'timetrial') {
    const medal = medalFor(p.bestLap, medals);
    const res = recordTimeTrial(save, race.track.id, p.bestLap, medal);
    if (race.newGhost && (!race.ghost || race.newGhost.lap < race.ghost.lap)) saveGhost(storage, race.track.id, race.newGhost);
    $('res-title').textContent = medal ? `${{ gold: '🥇 Gold', silver: '🥈 Silver', bronze: '🥉 Bronze' }[medal]} medal!` : 'Time trial done!';
    $('res-podium').innerHTML = '';
    $('res-table').innerHTML = p.lapTimes.map((t, i) => `<div class="tr${t === p.bestLap ? ' me' : ''}"><span>${i + 1}</span><span>Lap ${i + 1}</span><span class="num">${formatTime(t)}</span><span></span></div>`).join('');
    lines.push(['🥇 Gold', formatTime(medals.gold)], ['🥈 Silver', formatTime(medals.silver)], ['🥉 Bronze', formatTime(medals.bronze)]);
    if (res.newBest) lines.push(['New best lap! Your ghost will race you next time 👻']);
    lines.push(['Coins earned', `🪙 ${res.earned}`]);
    log.event('level.complete', { location: loc.id, kind: 'timetrial', medal: medal || 'none', 'lap.s': Math.round(p.bestLap * 100) / 100, stars: medal === 'gold' ? 1 : 0 });
    buttons.push(['Try again', true, () => startRace(s)]);
  } else {
    const earned = raceCoins(place, race.kind);
    const res = recordRace(save, { trackId: race.track.id, kind: race.kind, place, time: p.finishTime, coins: p.coins, earned });
    const won = place === 1;
    $('res-title').textContent = won ? '🏆 You win!' : place <= 3 ? `${ordinal(place)} place! On the podium!` : `${ordinal(place)} place`;
    const podium = results.slice(0, 3);
    $('res-podium').innerHTML = [1, 0, 2].map((i) => podium[i] ? `<div class="step p${i + 1}${podium[i].isPlayer ? ' me' : ''}"><span class="who">${podium[i].flag} ${podium[i].name}</span><span class="car" style="background:${podium[i].color}"></span><div class="block">${i + 1}</div></div>` : '').join('');
    let cupState = null;
    if (s.cupId && save.cup?.cupId === s.cupId) {
      cupState = save.cup;
      applyResult(cupState, results.map((r) => r.key));
      // The trophy is saved now, not when its screen is opened.
      cupEnd = settleCup(save);
      if (cupEnd) log.event('cup.complete', { cup: cupEnd.state.cupId, place: cupEnd.place, stars: cupEnd.stars });
    }
    const head = `<div class="tr head"><span>#</span><span>Driver</span><span class="num">${race.kind === 'elimination' ? 'Out' : 'Time'}</span><span class="num">${cupState ? 'Pts' : ''}</span></div>`;
    const winner = results[0].time;
    $('res-table').innerHTML = head + results.map((r) => {
      const t = race.kind === 'elimination' ? (r.eliminated ? `${ordinal(r.place)}` : '🏆') : r.place === 1 ? formatTime(r.time) : `+${(r.time - winner).toFixed(2)}`;
      return `<div class="tr${r.isPlayer ? ' me' : ''}"><span>${r.place}</span><span>${r.flag} ${r.name}</span><span class="num">${t}</span><span class="num">${cupState ? `+${pointsFor(r.place)}` : ''}</span></div>`;
    }).join('');
    if (p.coins) lines.push(['Coins picked up', `🪙 ${p.coins}`]);
    lines.push(['Prize money', `🪙 ${earned}`]);
    if (res.newBest && race.kind !== 'elimination') lines.push(['New best time!']);
    log.event(place <= 3 ? 'level.complete' : 'level.fail', {
      location: loc.id, kind: race.kind, place, 'time.s': Math.round((p.finishTime || 0) * 10) / 10, coins: res.coins, stars: place <= 3 ? 4 - place : 0, cup: s.cupId || '',
    });
    if (cupState) {
      if (cupEnd) buttons.push(['See the trophy →', true, () => showCupEnd(cupEnd)]);
      else {
        const nxt = CUP_BY_ID[s.cupId].races[cupState.round];
        buttons.push([`Next: ${LOCATION_BY_ID[nxt.loc].city} →`, true, () => startRace({ loc: nxt.loc, kind: nxt.kind, cupId: s.cupId })]);
      }
    } else {
      buttons.push(['Race again', true, () => startRace(s)]);
    }
  }
  persist();
  if (!s.cupId) buttons.push(['Menu', false, () => toTitle()]);
  else if (!cupEnd) buttons.push(['Standings', false, () => { disposeRace(); setup = { cupId: s.cupId }; backStack.length = 0; backStack.push('screen-title', 'screen-cups'); openScreen('screen-cup', false); }]);
  $('res-lines').innerHTML = lines.map(([a, b]) => (b === undefined ? `<div class="highlight">${a}</div>` : `<div><span>${a}</span><b>${b}</b></div>`)).join('');
  setButtons(buttons);
  showScreen('screen-results', { push: false });
}

// Presses in the first moments of the results card are the race's gas and
// boost, not a choice.
const RESULTS_GRACE = 700;
let resultsAt = -Infinity;

function setButtons(buttons) {
  const row = $('res-buttons');
  row.innerHTML = '';
  for (const [label, primary, fn] of buttons) {
    const b = document.createElement('button');
    b.className = `btn${primary ? ' primary' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => {
      if (performance.now() - resultsAt < RESULTS_GRACE) return;
      audio.click();
      fn();
    });
    row.appendChild(b);
  }
}

// `res` is the cup `settleCup` already saved when its last race finished.
function showCupEnd(res) {
  const { state, place } = res;
  const cup = CUP_BY_ID[state.cupId];
  const trophy = trophyFor(place);
  $('res-title').textContent = trophy ? `${cup.name}: ${trophy[0].toUpperCase()}${trophy.slice(1)} trophy!` : `${cup.name} complete`;
  $('res-podium').innerHTML = `<div><div class="trophy">${{ gold: '🏆', silver: '🥈', bronze: '🥉' }[trophy] || '🎗️'}</div><div class="big-stars">${'★'.repeat(res.stars)}${'☆'.repeat(3 - res.stars)}</div></div>`;
  $('res-table').innerHTML = standingsTable(state);
  const lines = [['Cup bonus', `🪙 ${res.bonus}`]];
  if (res.newStars) lines.push([`+${res.newStars} ⭐ — you now have ${totalStars(save)}`]);
  const nextCup = CUPS.find((c) => c.needStars > totalStars(save) - res.newStars && c.needStars <= totalStars(save));
  if (nextCup) lines.push([`Unlocked: ${nextCup.emoji} ${nextCup.name}!`]);
  const newCar = CARS.find((c) => c.stars > totalStars(save) - res.newStars && c.stars <= totalStars(save));
  if (newCar) lines.push([`New car in the garage: ${newCar.name}`]);
  if (place > 3) lines.push(['Finish in the top 3 to win a trophy. You can do it!']);
  $('res-lines').innerHTML = lines.map(([a, b]) => (b === undefined ? `<div class="highlight">${a}</div>` : `<div><span>${a}</span><b>${b}</b></div>`)).join('');
  setButtons([['World Tour →', true, () => { disposeRace(); backStack.length = 0; backStack.push('screen-title'); openScreen('screen-cups', false); }], ['Garage', false, () => { disposeRace(); backStack.length = 0; backStack.push('screen-title'); openScreen('screen-garage', false); }]]);
  if (trophy) audio.cheer(1.5);
}

// ------------------------------------------------------------ wiring

$('btn-champ').addEventListener('click', () => { audio.unlock(); audio.click(); openScreen('screen-cups'); });
$('btn-quick').addEventListener('click', () => { audio.unlock(); audio.click(); pickMode = 'quick'; openScreen('screen-pick'); });
$('btn-attack').addEventListener('click', () => { audio.unlock(); audio.click(); pickMode = 'attack'; openScreen('screen-pick'); });
$('btn-garage').addEventListener('click', () => { audio.unlock(); audio.click(); garageCar = save.car; openScreen('screen-garage'); });
$('btn-options').addEventListener('click', () => { audio.unlock(); audio.click(); openScreen('screen-options'); });
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', back);
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startRace(setup));
$('btn-quit').addEventListener('click', () => { if (setup?.cupId) log.event('cup.quit', { cup: setup.cupId }); toTitle(); });
$('btn-sound').addEventListener('click', toggleSound);
$('btn-music').addEventListener('click', toggleMusic);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
// No picture while the WebGL context is gone, so don't race blind.
$('scene').addEventListener('webglcontextlost', () => { log.warn('webgl.lost', { mode }); pause(); });

// Another tab saved: take its progress, so this tab never writes a stale copy
// over it. A race in progress records into the fresh copy when it ends.
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY && e.key !== null) return;
  adoptSave(save, loadSave(storage));
  input.steerMode = save.touchSteer;
  input.autoAccel = save.autoAccel;
  showGas();
  document.body.classList.toggle('tilt', save.touchSteer === 'tilt');
  audio.setMuted(save.muted);
  audio.setMusic(save.music);
  if (!save.owned.includes(garageCar)) garageCar = save.car;
  if (mode === 'menu' && current && current !== 'screen-loading') openScreen(current, false);
});
// The first click or key press starts audio (and whichever tune is due).
const firstGesture = () => { audio.unlock(); if (audio.ctx) { audio.setCar(CAR_BY_ID[save.car]); removeEventListener('pointerdown', firstGesture); removeEventListener('keydown', firstGesture); } };
addEventListener('pointerdown', firstGesture);
addEventListener('keydown', firstGesture);

// Arrow keys and the d-pad move focus between buttons on menu screens.
function menuNav() {
  if (!current || mode === 'race') return;
  const screen = $(current);
  const items = [...screen.querySelectorAll('button:not(:disabled), a.btn')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const dir = (input.consume('ArrowDown') || input.consume('ArrowRight')) ? 1 : (input.consume('ArrowUp') || input.consume('ArrowLeft')) ? -1 : 0;
  if (dir) items[(i + dir + items.length) % items.length].focus();
  if (input.consume('PadA') && document.activeElement?.click) document.activeElement.click();
  if (current === 'screen-pause') { if (input.consume('PadB')) resume(); return; }
  if ((input.consume('PadB') || input.consume('Escape')) && !['screen-title', 'screen-loading', 'screen-results'].includes(current)) back();
}

// A held Enter or Space auto-repeats; only a fresh press works a button.
window.addEventListener('keydown', (e) => {
  if (e.repeat && (e.key === 'Enter' || e.key === ' ') && e.target.closest?.('button, a')) e.preventDefault();
}, true);

// ------------------------------------------------------------ loop

let pointerIdle = 0, pointerHidden = false;
window.addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt, playing) {
  pointerIdle += dt;
  const hide = playing && pointerIdle > 2;
  if (hide !== pointerHidden) {
    pointerHidden = hide;
    document.body.classList.toggle('no-cursor', hide);
  }
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, location: setup?.loc || 'none', quality }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

// Drops quality when the race runs slowly (after the warm-up seconds).
const perfWindow = [];
function adaptQuality(ms) {
  if (mode !== 'race' || !race || race.time < 1.5) return;
  perfWindow.push(ms);
  if (perfWindow.length < 120) return;
  const sorted = perfWindow.slice().sort((a, b) => a - b);
  const p50 = sorted[60];
  perfWindow.length = 0;
  if (p50 > 21 && quality > 0) {
    quality--;
    applyQuality();
    log.warn('quality.drop', { quality, 'p50.ms': Math.round(p50) });
  }
}

const pinEls = new Map();
const pinPts = [];
function updatePins() {
  const box = $('pin-labels');
  if (box.classList.contains('hidden')) return;
  const w = window.innerWidth, h = window.innerHeight;
  for (const p of menu.pinScreen(pinPts)) {
    let el = pinEls.get(p.id);
    if (!el) {
      const loc = LOCATION_BY_ID[p.id];
      el = document.createElement('div');
      el.className = 'pin';
      el.textContent = `${loc.flag} ${loc.city}`;
      box.appendChild(el);
      pinEls.set(p.id, el);
    }
    el.style.opacity = p.visible ? 1 : 0;
    el.classList.toggle('on', menu.focus?.loc.id === p.id);
    el.style.transform = `translate(${((p.x * 0.5 + 0.5) * w).toFixed(0)}px, ${((-p.y * 0.5 + 0.5) * h - 14).toFixed(0)}px) translate(-50%, -100%)`;
  }
}

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const ms = now - last;
  const dt = Math.min(0.1, ms / 1000);
  last = now;
  input.pollPad();
  updatePointer(dt, mode === 'race');

  if (mode === 'race') {
    if (input.consume('Escape') || input.consume('KeyP')) pause();
  } else if (mode === 'paused') {
    if (input.consume('Escape') || input.consume('KeyP')) resume();
    else menuNav();
  } else menuNav();
  if (input.consume('KeyM')) toggleSound();

  if (mode === 'loading' && loader) advanceLoader();

  if ((mode === 'race' || mode === 'results') && race && view) {
    const controls = mode === 'race' ? input.read(race.time) : { throttle: 0, brake: 0, steer: 0 };
    if (mode === 'race') {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= DT && steps < 5) {
        race.step(DT, controls);
        controls.reset = false;
        accumulator -= DT;
        steps++;
      }
      if (steps === 5) accumulator = 0;
      const tick = hud.countdown(race);
      if (tick) audio.beep(false);
      view.handleEvents(race.events);
      audio.handleEvents(race.events, race.player.id);
      hud.handleEvents(race.events, race);
      race.events.length = 0;
      audio.updateDriving(race, race.player, controls.throttle, race.status !== 'countdown' || race.time > -3);
      hud.update(race, dt);
      if (race.status === 'finished') {
        endTimer += dt;
        if (endTimer > 2.2) showResults();
      }
      adaptQuality(ms);
    } else {
      // Keep the field driving behind the results screen.
      accumulator += dt;
      while (accumulator >= DT) { race.step(DT, controls); accumulator -= DT; }
      race.events.length = 0;
      audio.updateDriving(race, race.player, 0.3, true);
    }
    view.update(dt, { paused: false });
    view.render();
  } else if (mode === 'paused' && view) {
    view.update(dt, { paused: true });
    view.render();
  } else if (menuReady) {
    menu.update(dt);
    menu.render();
    updatePins();
  }
  requestAnimationFrame(loop);
}

const loop = telemetry ? telemetry.guard(frame, 'globe-gp.frame') : frame;

if (location.protocol !== 'file:') {
  applyQuality();
  log.event('game.ready', { stars: totalStars(save), coins: save.coins, car: save.car, difficulty: save.difficulty, reduced });
  const quick = params.get('race');
  if (quick) {
    const [loc, kind] = quick.split(':');
    if (params.get('car') && CAR_BY_ID[params.get('car')]) save.car = params.get('car');
    startRace({ loc: LOCATION_BY_ID[loc] ? loc : 'paris', kind: RACE_KINDS[kind] ? kind : 'circuit' });
  } else openScreen('screen-title', false);
  // Compile the menu scene before its first draw.
  renderer.compileAsync(menu.scene, menu.camera)
    .catch((error) => log.exception(error, { 'error.source': 'compileAsync' }))
    .then(() => { menuReady = true; });
  requestAnimationFrame(loop);
}

// Handy for poking at the game from the console and from browser checks.
window.GP = {
  get race() { return race; }, get view() { return view; }, get mode() { return mode; }, get quality() { return quality; },
  get lastLoad() { return lastTimings; },
  save, startRace, input, menu, showResults, toTitle,
};
