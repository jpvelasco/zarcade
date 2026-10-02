import * as THREE from 'three';
import { World } from './world.js';
import { JourneyView } from './render/view.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { BIOMES } from './biomes.js';
import { HOME, planet, children, visiblePlanets, isReachable, depthOf, parentOf } from './galaxy.js';
import { loadSave, writeSave, statsFor, UPGRADES, PAINTS, upgradeCost, buyUpgrade, recordArrival, MENU, menuPrice, FREE_ITEM } from './progress.js';
import { frameMonitor } from './perf.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

// Reading localStorage itself throws when site storage is blocked.
const storage = (() => { try { return window.localStorage; } catch { return null; } })();
const save = loadSave(storage);
const input = new Input();
const audio = new Audio(save.muted);
const hud = new Hud();

const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

let world = null, view = null;
let mode = 'menu'; // menu | flight | paused | shop | results
let endTimer = 0, accumulator = 0;
// Saving can fail (private mode, full storage); play on and report it once.
let saveWarned = false;
function persist() {
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { mode });
}

let selected = save.selected && visiblePlanets(save.cleared).includes(save.selected) ? save.selected : children(HOME)[0];

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  if (view) view.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);

function load(planetId, { attract = false } = {}) {
  if (view) view.dispose();
  const pl = planet(planetId);
  world = new World(pl, { stats: statsFor(save.upgrades), autopilot: attract || params.has('autopilot') });
  view = new JourneyView(renderer, world, { paint: save.paint, view: attract ? 'chase' : save.view });
  resize();
  warmUp(view);
}

// Compiling a new scene's shaders on first draw can stall a frame for a
// second or more on a cold GPU cache. Compile them in parallel first, and
// hold drawing and flight until they're ready.
function warmUp(target) {
  target.ready = false;
  const started = performance.now();
  const done = () => {
    target.ready = true;
    log.info('scene.ready', { planet: target.world?.planet?.id, 'compile.ms': Math.round(performance.now() - started) });
  };
  Promise.resolve()
    .then(() => renderer.compileAsync(target.scene, target.camera))
    .then(done, (error) => {
      log.exception(error, { 'error.source': 'compileAsync' });
      done();
    });
  // The monitor is created further down this module; by the time this
  // microtask runs, module setup has finished.
  queueMicrotask(() => monitor.mark(performance.now()));
}

// ------------------------------------------------------------ screens

const SCREENS = ['screen-title', 'screen-galaxy', 'screen-hangar', 'screen-pause', 'screen-shop', 'screen-results'];

// Gamepad menus: the d-pad moves between the visible screen's buttons and A
// presses the focused one.
function padMenus() {
  const screen = document.querySelector('.overlay:not(.hidden)');
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not(:disabled), a[href]')];
  const at = items.indexOf(document.activeElement);
  const step = input.consume('PadDown') || input.consume('PadRight') ? 1 : input.consume('PadUp') || input.consume('PadLeft') ? -1 : 0;
  if (step && items.length) items[(at + step + items.length) % items.length].focus({ preventScroll: true });
  if (input.consume('PadA') && at >= 0) items[at].click();
}

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const flying = mode === 'flight' || mode === 'paused' || mode === 'shop';
  hud.show(flying);
  $('touch').classList.toggle('hidden', !(mode === 'flight' && input.touchMode));
  if (id) $(id).querySelector('.btn.primary, .btn')?.focus({ preventScroll: true });
}

function toMenu(screen = 'screen-title') {
  mode = 'menu';
  if (!world || !world.player.autopilot) load(selected, { attract: true });
  $('title-dust').textContent = save.stardust ? `✨ ${save.stardust} stardust · ${Object.keys(save.cleared).length} planets visited` : '';
  if (screen === 'screen-galaxy') renderGalaxy();
  if (screen === 'screen-hangar') renderHangar();
  showScreen(screen);
}

// Galaxy map: a tree of planets growing to the right from Home Port.
function renderGalaxy() {
  const ids = visiblePlanets(save.cleared);
  const set = new Set(ids);
  const pos = new Map();
  let slot = 0;
  const layout = (id) => {
    const kids = children(id).filter((c) => set.has(c));
    const x = 90 + depthOf(id) * 200;
    if (!kids.length) { pos.set(id, { x, y: 70 + slot++ * 96 }); return; }
    kids.forEach(layout);
    const ys = kids.map((k) => pos.get(k).y);
    pos.set(id, { x, y: (Math.min(...ys) + Math.max(...ys)) / 2 });
  };
  layout(HOME);
  const width = Math.max(...[...pos.values()].map((p) => p.x)) + 140;
  const height = slot * 96 + 60;
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><defs>`;
  for (const [key, b] of Object.entries(BIOMES)) {
    svg += `<radialGradient id="g-${key}" cx="35%" cy="35%"><stop offset="0%" stop-color="${b.palette.planet.c}"/><stop offset="45%" stop-color="${b.palette.planet.b}"/><stop offset="100%" stop-color="${b.palette.planet.a}"/></radialGradient>`;
  }
  svg += '</defs>';
  for (const id of ids) {
    const par = parentOf(id);
    if (!par || !pos.has(par)) continue;
    const a = pos.get(par), b = pos.get(id);
    const done = id in save.cleared;
    svg += `<path d="M${a.x},${a.y} C${a.x + 100},${a.y} ${b.x - 100},${b.y} ${b.x},${b.y}" class="route${done ? ' done' : ''}"/>`;
  }
  for (const id of ids) {
    const p = planet(id), { x, y } = pos.get(id);
    const done = id === HOME || id in save.cleared;
    const reach = isReachable(id, save.cleared);
    const r = id === HOME ? 26 : 20;
    const stars = save.cleared[id] || 0;
    svg += `<g class="node${id === selected ? ' sel' : ''}${reach && !done ? ' frontier' : ''}${reach ? ' reach' : ''}" data-id="${id}" transform="translate(${x},${y})">`;
    if (reach && !done) svg += `<circle r="${r + 7}" class="pulse"/>`;
    if (BIOMES[p.biome].palette.planet.rings) svg += `<ellipse rx="${r * 1.7}" ry="${r * 0.45}" class="ring"/>`;
    svg += `<circle r="${r}" fill="url(#g-${p.biome})" class="planet"/>`;
    svg += `<text y="${r + 18}" class="label">${p.name}</text>`;
    if (id !== HOME) svg += `<text y="${r + 34}" class="sub">${done ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : BIOMES[p.biome].label}</text>`;
    svg += '</g>';
  }
  svg += '</svg>';
  $('galaxy-map').innerHTML = svg;
  for (const g of $('galaxy-map').querySelectorAll('.node')) {
    g.addEventListener('click', () => selectPlanet(g.dataset.id));
  }
  selectPlanet(selected, false);
}

function selectPlanet(id, rerender = true) {
  const p = planet(id);
  const reach = isReachable(id, save.cleared);
  if (id !== selected && reach) {
    selected = id;
    save.selected = id;
    persist();
    load(selected, { attract: true });
    if (rerender) return renderGalaxy();
  }
  const b = BIOMES[p.biome];
  const stars = save.cleared[id];
  $('planet-info').innerHTML = `
    <h3>${p.name}</h3>
    <p class="muted">${b.label}${id === HOME ? '' : ` · Sector ${p.depth}`}</p>
    <p>${id === HOME ? 'Your home base. Pick a glowing planet to fly to!' : stars ? `Visited ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}` : reach ? 'Unexplored. Who knows what’s out there?' : 'Clear the planet before it to reach this one.'}</p>`;
  $('btn-launch').disabled = !isReachable(selected, save.cleared);
  $('btn-launch').textContent = `Launch to ${planet(selected).name} →`;
}

function renderHangar() {
  $('hangar-dust').textContent = save.stardust;
  const list = $('upgrade-list');
  list.innerHTML = '';
  for (const [key, u] of Object.entries(UPGRADES)) {
    const level = save.upgrades[key], cost = upgradeCost(save, key);
    const row = document.createElement('div');
    row.className = 'upgrade';
    row.innerHTML = `<span class="u-name">${u.label} <span class="pips">${'●'.repeat(level)}${'○'.repeat(u.costs.length - level)}</span></span><span class="u-blurb">${u.blurb}</span>`;
    const buy = document.createElement('button');
    buy.className = 'btn';
    buy.textContent = cost === null ? 'Maxed' : `✨ ${cost}`;
    buy.disabled = cost === null || save.stardust < cost;
    buy.addEventListener('click', () => {
      if (!buyUpgrade(save, key)) return;
      persist();
      log.event('hangar.upgrade', { upgrade: key, level: save.upgrades[key], stardust: save.stardust });
      audio.unlock();
      audio.handleEvents([{ type: 'pickup', kind: 'power' }]);
      renderHangar();
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
      persist();
      view.jet.userData.paint.color.set(color);
      renderHangar();
    });
    paints.appendChild(sw);
  }
}

function launch(id = selected) {
  audio.unlock();
  load(id);
  mode = 'flight';
  endTimer = 0;
  accumulator = 0;
  hud.reset(world);
  input.clearPressed();
  showScreen(null);
  log.event('planet.start', { planet: world.planet.id, biome: world.planet.biome, depth: world.planet.depth });
}

function pause() {
  // Once the boss is down (or the ship is lost) the result is recorded on the
  // results card, so let that show instead of a pause menu that could skip it.
  if (mode !== 'flight' || ['arriving', 'finished', 'destroyed'].includes(world.status)) return;
  mode = 'paused';
  input.clearPressed();
  $('btn-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'flight';
  input.clearPressed();
  showScreen(null);
}

// ------------------------------------------------------------ Space Burger

let shopFreebie = false; // the visit's free Comet Cola is still unclaimed

function openShop() {
  mode = 'shop';
  input.clearPressed(); // a fire press on A mid-flight mustn't pick an item
  shopFreebie = true;
  renderShop();
  showScreen('screen-shop');
}

function renderShop() {
  const p = world.player;
  $('shop-dust').textContent = save.stardust + p.dust;
  $('shop-status').textContent = `Hull ${Math.round(p.hull)}/${p.maxHull} · Cannons ${p.cannon}/4 · Missiles ${p.missiles}`;
  const list = $('menu-list');
  list.innerHTML = '';
  MENU.forEach((item, index) => {
    const free = shopFreebie && item.id === FREE_ITEM;
    const price = menuPrice(item, world.planet.depth, { freebie: shopFreebie });
    const b = document.createElement('button');
    b.className = free ? 'menu-item free' : 'menu-item';
    b.disabled = save.stardust + p.dust < price;
    b.innerHTML = `<span class="icon">${item.icon}</span><span class="name">${item.name}</span><span class="blurb">${item.blurb}</span><span class="price">${free ? 'FREE today!' : `✨ ${price}`}</span>`;
    b.addEventListener('click', () => {
      if (save.stardust + p.dust < price) return;
      if (free) shopFreebie = false;
      const fromRun = Math.min(p.dust, price);
      p.dust -= fromRun;
      save.stardust -= price - fromRun;
      persist();
      world.applyMenuItem(item.id);
      log.event('shop.purchase', { item: item.id, price, planet: world.planet.id });
      audio.handleEvents([{ type: 'pickup', kind: 'power' }]);
      renderShop();
      // Keep keyboard and gamepad focus where it was.
      (list.children[index]?.disabled ? $('btn-leave-shop') : list.children[index])?.focus({ preventScroll: true });
    });
    list.appendChild(b);
  });
}

function leaveShop() {
  world.leaveShop();
  mode = 'flight';
  input.clearPressed();
  showScreen(null);
}

// ------------------------------------------------------------ results

function showResults() {
  mode = 'results';
  input.clearPressed();
  const p = world.player, pl = world.planet;
  const lines = [], buttons = [];
  const starEls = $('res-stars').querySelectorAll('span');
  if (world.status === 'finished') {
    const res = recordArrival(save, pl, world.result());
    $('res-title').textContent = `Arrived at ${pl.name}!`;
    log.event('planet.complete', {
      planet: pl.id, depth: pl.depth, stars: res.stars, score: p.score, kills: p.kills,
      hull: Math.round((p.hull / p.maxHull) * 100), stardust: res.earned, revealed: res.revealed.length,
    });
    $('res-stars').classList.remove('hidden');
    starEls.forEach((s, i) => s.classList.toggle('on', i < res.stars));
    $('res-score').textContent = `${p.score.toLocaleString()} points`;
    lines.push(['Enemies destroyed', `${p.kills} / ${p.spawned}`], ['Hull', `${Math.round((p.hull / p.maxHull) * 100)}%`], ['Stardust earned', `✨ ${res.earned}`]);
    if (res.revealed.length) lines.push([`New planets: ${res.revealed.map((id) => planet(id).name).join(', ')}`]);
    if (res.stars < 3) lines.push([res.stars < 2 ? 'Tip: destroy half the enemies for ★★' : 'Tip: arrive with 60% hull for ★★★']);
    if (res.revealed.length) selected = res.revealed[0];
    buttons.push(['Galaxy map →', true, () => toMenu('screen-galaxy')], ['Fly again', false, () => launch(pl.id)]);
  } else {
    save.stardust += p.dust;
    $('res-title').textContent = 'Ship destroyed!';
    log.event('planet.fail', {
      planet: pl.id, depth: pl.depth, reason: 'destroyed', score: p.score,
      progress: Math.round(Math.min(1, p.s / world.journey.length) * 100),
    });
    $('res-stars').classList.add('hidden');
    $('res-score').textContent = `${Math.round(Math.min(1, p.s / world.journey.length) * 100)}% of the way to ${pl.name}`;
    lines.push(['Stardust kept', `✨ ${p.dust}`], [`Tip: roll with ${input.touchMode ? '🌀' : 'Q / E'} to deflect shots, and upgrade in the hangar`]);
    buttons.push(['Try again', true, () => launch(pl.id)], ['Galaxy map', false, () => toMenu('screen-galaxy')]);
  }
  buttons.push(['Hangar', false, () => toMenu('screen-hangar')]);
  save.selected = selected;
  persist();
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

$('btn-play').addEventListener('click', () => { audio.unlock(); toMenu('screen-galaxy'); });
$('btn-hangar').addEventListener('click', () => { audio.unlock(); toMenu('screen-hangar'); });
$('btn-launch').addEventListener('click', () => launch());
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => toMenu('screen-title'));
$('btn-hangar-launch').addEventListener('click', () => toMenu('screen-galaxy'));
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => launch(world.planet.id));
$('btn-quit').addEventListener('click', () => toMenu('screen-galaxy'));
$('btn-leave-shop').addEventListener('click', leaveShop);
$('btn-view').addEventListener('click', toggleView);
$('btn-mute').addEventListener('click', () => {
  save.muted = !save.muted;
  audio.setMuted(save.muted);
  persist();
  $('btn-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
// Nothing is drawn while the GPU context is gone, so don't fly blind.
// Three.js restores the scene when the context comes back.
renderer.domElement.addEventListener('webglcontextlost', () => pause());

function toggleView() {
  save.view = save.view === 'cockpit' ? 'chase' : 'cockpit';
  persist();
  if (view && !world.player.autopilot) view.viewMode = save.view;
}

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

// Frame telemetry: slow frames, struggling 10 s windows, and a watchdog
// outside the loop that notices when frames stop while the page is visible.
const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, planet: world ? world.planet.id : 'none', status: world ? world.status : 'none' }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  updatePointer(dt, mode === 'flight');
  input.pollPad();

  if (input.consume('Escape') || input.consume('KeyP')) {
    if (mode === 'flight') pause();
    else if (mode === 'paused') resume();
    else if (mode === 'shop') leaveShop();
  }
  if (mode !== 'flight') padMenus();
  if (input.consume('KeyM')) $('btn-mute').click();
  if (input.consume('KeyC') && mode === 'flight') toggleView();

  if (world && view && view.ready && (mode === 'flight' || mode === 'menu')) {
    const flying = mode === 'flight';
    const controls = flying ? input.read() : {};
    accumulator += dt;
    while (accumulator >= STEP) {
      world.step(STEP, controls);
      accumulator -= STEP;
      if (world.status === 'shop') break;
    }
    view.handleEvents(world.events);
    if (flying) {
      audio.handleEvents(world.events);
      hud.handleEvents(world.events, world);
    }
    world.events.length = 0;
    if (flying) {
      const p = world.player;
      audio.updateEngine(p.speed, p.boosting, world.status === 'hyper', !['finished', 'destroyed'].includes(world.status));
      hud.update(world, view, dt);
      if (world.status === 'shop') openShop();
      if (world.status === 'finished' || world.status === 'destroyed') {
        endTimer += dt;
        if (endTimer > (world.status === 'finished' ? 0.5 : 2)) showResults();
      }
    } else {
      audio.updateEngine(0, false, false, false);
      if (world.status === 'shop') world.leaveShop();
      if (world.status === 'finished' || world.status === 'destroyed') load(selected, { attract: true });
    }
  }
  if (view && mode !== 'paused' && mode !== 'shop') view.update(dt);
  if (view && view.ready) view.render();
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture;
// after a crash the guard returns early, so the loop stops rescheduling.
const loop = telemetry ? telemetry.guard(frame, 'starhopper.frame') : frame;

if (location.protocol !== 'file:') {
  log.event('game.ready', { visited: Object.keys(save.cleared).length, stars: Object.values(save.cleared).reduce((a, b) => a + b, 0), stardust: save.stardust });
  if (params.has('planet')) launch(params.get('planet'));
  else toMenu('screen-title');
  requestAnimationFrame(loop);
}

window.SH = { get world() { return world; }, get view() { return view; }, save, launch, input, planet };
