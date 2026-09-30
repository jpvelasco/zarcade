import * as THREE from 'three';
import { World } from './world.js';
import { TRACKS } from './tracks.js';
import { RaceView } from './render/view.js';
import { Hud, formatTime } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { loadSave, writeSave, statsFor, UPGRADES, PAINTS, upgradeCost, buyUpgrade, recordFinish } from './progress.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const save = loadSave(localStorage);
const input = new Input();
const audio = new Audio(save.muted);
const hud = new Hud();

const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

let world = null;
let view = null;
let trackIndex = Math.min(save.unlocked, TRACKS.length) - 1;
let mode = 'menu'; // menu | race | paused | results
let endTimer = 0;
let accumulator = 0;

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (view) view.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

function loadTrack(index, forRace) {
  if (view) view.dispose();
  trackIndex = index;
  world = new World(TRACKS[index], { stats: statsFor(save.upgrades), autopilot: params.has('autopilot') });
  view = new RaceView(renderer, world, { paint: save.paint });
  view.cam.mode = forRace ? 'chase' : 'orbit';
  resize();
}

// ------------------------------------------------------------ screens

const SCREENS = ['screen-title', 'screen-tracks', 'screen-garage', 'screen-pause', 'screen-results'];
let backTo = 'screen-title';

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const racing = mode === 'race' || mode === 'paused';
  hud.show(racing);
  $('touch').classList.toggle('hidden', !(racing && input.touchMode));
  if (id) $(id).querySelector('.btn.primary, .btn, .track-card')?.focus({ preventScroll: true });
}

function toMenu(screen = 'screen-title') {
  mode = 'menu';
  if (!view || view.cam.mode !== 'orbit' || world.status !== 'countdown') loadTrack(trackIndex, false);
  $('title-coins').textContent = save.coins ? `🪙 ${save.coins} coins in the bank` : '';
  if (screen === 'screen-tracks') renderTracks();
  if (screen === 'screen-garage') renderGarage();
  showScreen(screen);
}

function renderTracks() {
  const list = $('track-list');
  list.innerHTML = '';
  TRACKS.forEach((t, i) => {
    const locked = i >= save.unlocked;
    const stars = save.stars[t.id] || 0;
    const best = save.best[t.id];
    const btn = document.createElement('button');
    btn.className = 'track-card';
    btn.disabled = locked;
    btn.style.background = `linear-gradient(180deg, ${t.palette.skyTop}, ${t.palette.skyHorizon} 70%, ${t.palette.sand})`;
    btn.innerHTML = `
      <span class="num">TRACK ${i + 1}</span>
      <span class="name">${locked ? '🔒 ' : ''}${t.name}</span>
      <span class="meta card-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>
      <span class="meta">${locked ? 'Finish the previous track' : best ? `Best ${formatTime(best)}` : 'Not raced yet'}</span>`;
    btn.addEventListener('click', () => startRace(i));
    list.appendChild(btn);
  });
}

function renderGarage() {
  $('garage-coins').textContent = save.coins;
  const list = $('upgrade-list');
  list.innerHTML = '';
  for (const [key, u] of Object.entries(UPGRADES)) {
    const level = save.upgrades[key];
    const cost = upgradeCost(save, key);
    const row = document.createElement('div');
    row.className = 'upgrade';
    row.innerHTML = `
      <span class="u-name">${u.label} <span class="pips">${'●'.repeat(level)}${'○'.repeat(u.costs.length - level)}</span></span>
      <span class="u-blurb">${u.blurb}</span>`;
    const buy = document.createElement('button');
    buy.className = 'btn';
    buy.textContent = cost === null ? 'Maxed' : `🪙 ${cost}`;
    buy.disabled = cost === null || save.coins < cost;
    buy.addEventListener('click', () => {
      if (buyUpgrade(save, key)) {
        writeSave(localStorage, save);
        audio.unlock();
        audio.handleEvents([{ type: 'pickup', kind: 'repair' }], 0);
        renderGarage();
      }
    });
    row.appendChild(buy);
    list.appendChild(row);
  }
  const paints = $('paint-list');
  paints.innerHTML = '';
  for (const color of PAINTS) {
    const sw = document.createElement('button');
    sw.className = `swatch${color === save.paint ? ' on' : ''}`;
    sw.style.background = color;
    sw.setAttribute('aria-label', `Paint ${color}`);
    sw.addEventListener('click', () => {
      save.paint = color;
      writeSave(localStorage, save);
      view.jeeps[0].userData.paint.color.set(color);
      renderGarage();
    });
    paints.appendChild(sw);
  }
}

function startRace(index) {
  audio.unlock();
  loadTrack(index, true);
  mode = 'race';
  endTimer = 0;
  accumulator = 0;
  hud.reset(world);
  input.clearPressed();
  showScreen(null);
}

function pause() {
  if (mode !== 'race') return;
  mode = 'paused';
  $('btn-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'race';
  input.clearPressed();
  showScreen(null);
}

function showResults() {
  mode = 'results';
  const p = world.player;
  const track = TRACKS[trackIndex];
  const lines = [];
  const buttons = [];
  const starEls = $('res-stars').querySelectorAll('span');
  if (world.status === 'finished') {
    const res = recordFinish(save, trackIndex, { time: p.finishTime, coins: p.coins, kills: p.kills });
    const last = trackIndex === TRACKS.length - 1;
    $('res-title').textContent = last ? 'Desert conquered! 🏆' : `${track.name} complete!`;
    starEls.forEach((s, i) => s.classList.toggle('on', i < res.stars));
    $('res-stars').classList.remove('hidden');
    $('res-time').textContent = formatTime(p.finishTime);
    lines.push(['3-star time', formatTime(track.par)], ['Zombies', p.kills], ['Coins collected', p.coins]);
    if (p.bestAir > 0.5) lines.push(['Best air', `${p.bestAir.toFixed(1)}s`]);
    lines.push(['Coins earned', `🪙 ${res.earned}`]);
    if (res.newBest) lines.push(['New best time!']);
    if (res.unlockedNext) lines.push([`Unlocked: ${TRACKS[trackIndex + 1].name}!`]);
    if (!last) buttons.push(['Next track →', true, () => startRace(trackIndex + 1)]);
    buttons.push(['Retry', last, () => startRace(trackIndex)]);
  } else {
    save.coins += p.coins; // keep what you picked up
    $('res-title').textContent = 'Wrecked!';
    $('res-stars').classList.add('hidden');
    $('res-time').textContent = `${Math.round(((p.along - world.track.startDist) / (world.track.finishDist - world.track.startDist)) * 100)}% of the way`;
    lines.push(['Zombies', p.kills], ['Coins kept', `🪙 ${p.coins}`], ['Tip: grab 🔧 repairs, or upgrade Armor']);
    buttons.push(['Retry', true, () => startRace(trackIndex)]);
  }
  writeSave(localStorage, save);
  buttons.push(['Garage', false, () => toMenu('screen-garage')], ['Tracks', false, () => toMenu('screen-tracks')]);

  $('res-lines').innerHTML = lines.map(([a, b]) => (b === undefined ? `<div class="highlight">${a}</div>` : `<div><span>${a}</span><b>${b}</b></div>`)).join('');
  const row = $('res-buttons');
  row.innerHTML = '';
  for (const [label, primary, fn] of buttons) {
    const b = document.createElement('button');
    b.className = `btn${primary ? ' primary' : ''}`;
    b.textContent = label;
    b.addEventListener('click', fn);
    row.appendChild(b);
  }
  showScreen('screen-results');
}

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', () => { audio.unlock(); backTo = 'screen-title'; toMenu('screen-tracks'); });
$('btn-garage').addEventListener('click', () => { audio.unlock(); backTo = 'screen-title'; toMenu('screen-garage'); });
$('garage-race').addEventListener('click', () => startRace(trackIndex));
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => toMenu(backTo));
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startRace(trackIndex));
$('btn-quit').addEventListener('click', () => toMenu('screen-title'));
$('btn-mute').addEventListener('click', () => {
  save.muted = !save.muted;
  audio.setMuted(save.muted);
  writeSave(localStorage, save);
  $('btn-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ------------------------------------------------------------ loop

// Hide the mouse pointer while playing, like a video player: it vanishes
// after a moment without movement and comes back as soon as the mouse moves.
let pointerIdle = 0, pointerHidden = false;
window.addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt, playing) {
  pointerIdle += dt;
  const hide = playing && pointerIdle > 1.5;
  if (hide !== pointerHidden) {
    pointerHidden = hide;
    document.body.classList.toggle('no-cursor', hide);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  updatePointer(dt, mode === 'race');

  if (mode === 'race') {
    if (input.consume('Escape') || input.consume('KeyP')) pause();
  } else if (mode === 'paused') {
    if (input.consume('Escape') || input.consume('KeyP')) resume();
  }
  if (input.consume('KeyM')) $('btn-mute').click();

  if (mode === 'race') {
    const controls = input.read();
    accumulator += dt;
    while (accumulator >= STEP) {
      world.step(STEP, controls);
      accumulator -= STEP;
    }
    const tick = hud.countdownTick(world);
    if (tick) audio.beep(false);
    view.handleEvents(world.events);
    audio.handleEvents(world.events, world.player.id);
    hud.handleEvents(world.events, world);
    world.events.length = 0;
    const running = world.status === 'racing' || world.status === 'countdown';
    audio.updateEngine(world.player.vehicle, controls.throttle, running);
    hud.update(world, dt);
    if (world.status === 'finished' || world.status === 'wrecked') {
      endTimer += dt;
      if (endTimer > 1.6) showResults();
    }
  } else if (world) {
    audio.updateEngine(world.player.vehicle, 0, false);
  }

  if (view && mode !== 'paused') view.update(dt);
  if (view) view.render();
  requestAnimationFrame(frame);
}

if (location.protocol !== 'file:') {
  loadTrack(trackIndex, false);
  if (params.has('track')) startRace(Math.min(TRACKS.length - 1, Number(params.get('track')) || 0));
  else toMenu('screen-title');
  requestAnimationFrame(frame);
}

// Handy for poking at the game from the console.
window.SR = { get world() { return world; }, get view() { return view; }, save, startRace, input };
