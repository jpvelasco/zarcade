// Browser entry: screens, the fixed-step loop, input, sound, HUD and saves.
import { AREAS, UPGRADES, UPGRADE_ORDER } from './areas.js';
import { buildMap, CELL } from './map.js';
import { SPECIES, SPECIES_INDEX } from './creatures.js';
import { World } from './world.js';
import { Autopilot } from './autopilot.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { bakeSub, drawCreatureCard } from './sprites.js';
import {
  PAINTS, TOTALS, loadSave, writeSave, encodeBits, decodeBits, dateKey, ensureDaily, dailyRemaining,
  recordDailyScan, currentStreak, paintUnlocked, newPaints, recordDive, areaCompletion,
} from './progress.js';
import { frameMonitor } from './perf.js';

const STEP = 1 / 60;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const storage = (() => { try { return localStorage; } catch { return null; } })();
const fresh = params.has('fresh');
const save = loadSave(fresh ? null : storage);
let saveWarned = false;
function persist() {
  if (fresh) return;
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const map = buildMap();
const canvas = $('game');
const renderer = new Renderer(canvas, { reducedMotion: reduced });
const input = new Input(canvas, (x, y) => renderer.toWorld(x, y));
const sound = new Sound({ muted: save.muted, music: save.music });

// Debug: ?ups=3 grants the first three parts; ?at=x,y starts at a cell.
const debugUps = parseInt(params.get('ups'), 10);
if (debugUps > 0) save.progress.upgrades = UPGRADE_ORDER.slice(0, Math.min(5, debugUps));

let today = dateKey();
ensureDaily(save, today);

function makeWorld() {
  const p = save.progress;
  const w = new World(map, { ...p, revealed: decodeBits(p.revealed, map.cols * map.rows) });
  const at = (params.get('at') || '').split(',').map(Number);
  if (at.length === 2 && at.every(Number.isFinite)) { w.sub.x = at[0] * CELL + 16; w.sub.y = at[1] * CELL + 16; }
  return w;
}

let world = makeWorld();
let attractWorld = null;
let attractPilot = null;
let autopilot = params.has('autopilot') ? new Autopilot({ mode: 'explore' }) : null;
let mode = 'title'; // title | play | paused | map | book | garage | part | out | ending
let returnMode = 'title';
let overlayFrom = 'title'; // where the map, book or paint shop was opened from
let accumulator = 0;
let saveTimer = 0;
let fogTimer = 0;
let lowWarned = false;
let lowBeep = 0;
let sessionStarted = false;
renderer.setWorld(world);

const paintOf = () => PAINTS.find((p) => p.id === save.paint) || PAINTS[0];

const SCREENS = ['screen-title', 'screen-pause', 'screen-map', 'screen-book', 'screen-garage', 'screen-part', 'screen-out', 'screen-ending'];

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const playing = mode === 'play';
  $('hud').classList.toggle('hidden', !['play', 'part', 'out', 'ending', 'paused'].includes(mode));
  input.enabled = playing;
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .btn:not([disabled]), button:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(playing ? 1 : 0.5);
}

// ------------------------------------------------------------ title

function ensureAttract() {
  if (attractWorld) return;
  attractWorld = new World(map, { upgrades: [] }, { seed: 7 });
  attractWorld.sub.x = 14 * CELL; attractWorld.sub.y = 9 * CELL;
  attractPilot = new Autopilot({ mode: 'explore', cruise: 0.42 });
  renderer.snapCamera(attractWorld);
}

function goalChips(container, withLabel) {
  const done = save.daily.done;
  const html = save.daily.goals.map((id) => {
    const sp = SPECIES[SPECIES_INDEX[id]];
    const known = save.progress.scanned.includes(id);
    return `<span class="goal${done.includes(id) ? ' done' : ''}">${done.includes(id) ? '✓ ' : '★ '}${known || done.includes(id) ? sp.name : `${sp.name}`}</span>`;
  }).join('');
  container.innerHTML = (withLabel ? `<span class="lbl">Daily ${done.length}/${save.daily.goals.length}</span>` : '') + html;
}

function toTitle() {
  mode = 'title';
  returnMode = 'title';
  ensureAttract();
  ensureDaily(save, today);
  const started = save.started;
  $('btn-play').textContent = started ? 'Keep exploring' : 'Dive in!';
  const streak = currentStreak(save, today);
  const remaining = dailyRemaining(save).length;
  const td = $('title-daily');
  td.innerHTML = `<div><b>Daily dive</b> · ${save.daily.complete ? 'done today! 🎉' : `scan ${remaining} of these`}${streak ? ` · 🔥 ${streak} day streak` : ''}</div><div class="goals"></div>`;
  goalChips(td.querySelector('.goals'), false);
  const pct = Math.round(world.completion * 100);
  const bests = save.bests;
  const stat = (label, val) => `<div class="stat"><b>${val}</b>${label}</div>`;
  $('title-stats').innerHTML = [
    stat('creatures', `${save.progress.scanned.length}/${TOTALS.species}`),
    stat('map explored', `${pct}%`),
    stat('parts', `${save.progress.upgrades.length}/${TOTALS.parts}`),
    stat('deepest dive', `${bests.depth.toLocaleString('en-US')} m`),
    stat('best dive scans', bests.diveScans),
    stat('fastest daily', bests.dailyTime ? formatTime(bests.dailyTime) : '—'),
  ].join('');
  updateSoundButtons();
  showScreen('screen-title');
}

function formatTime(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ------------------------------------------------------------ play

function startPlay() {
  sound.unlock();
  if (!save.started) { save.started = true; persist(); }
  mode = 'play';
  returnMode = 'play';
  renderer.snapCamera(world);
  renderer.setWorld(world);
  sound.setArea(world.areaIndex);
  input.clear();
  accumulator = 0;
  showScreen(null);
  updateHud(true);
  if (!sessionStarted) {
    sessionStarted = true;
    log.event('level.start', { area: world.area.id, parts: world.ups.size, scanned: world.scanned.size, 'map.pct': Math.round(world.completion * 100) });
    queueMicrotask(() => monitor.mark(performance.now(), 'dive'));
    setTimeout(() => $('keys-hint').classList.add('fade'), 9000);
  }
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  returnMode = 'play';
  syncSave();
  persist();
  updateSoundButtons();
  showScreen('screen-pause');
}

function resume() {
  mode = 'play';
  input.clear();
  showScreen(null);
}

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'map' || mode === 'book' || mode === 'garage') {
    if (overlayFrom === 'play') resume();
    else if (overlayFrom === 'paused') { mode = 'paused'; updateSoundButtons(); showScreen('screen-pause'); }
    else toTitle();
  } else if (mode === 'part') closePart();
  else if (mode === 'out') closeOut();
  else if (mode === 'ending') closeEnding();
}

function syncSave() {
  const snap = world.snapshot();
  const p = save.progress;
  p.upgrades = snap.upgrades;
  p.opened = snap.opened;
  p.scanned = snap.scanned;
  p.treasures = snap.treasures;
  p.shells = snap.shells;
  p.heart = snap.heart;
  p.lastDock = snap.lastDock;
  p.visited = snap.visited;
  p.revealed = encodeBits(snap.revealed);
}

// ------------------------------------------------------------ HUD

const hudCache = {};
function setText(id, text) {
  if (hudCache[id] === text) return;
  hudCache[id] = text;
  $(id).textContent = text;
}

function updateHud(force = false) {
  const w = world;
  const max = w.oxygenMax;
  const f = Math.max(0, w.oxygen / max);
  const pctStr = `${(f * 100).toFixed(1)}%`;
  if (hudCache.o2 !== pctStr) { hudCache.o2 = pctStr; $('o2-fill').style.width = pctStr; $('o2').setAttribute('aria-valuenow', String(Math.round(f * 100))); }
  const tanks = String(max / 25);
  if (hudCache.tanks !== tanks) { hudCache.tanks = tanks; $('o2-tanks').innerHTML = '<i></i>'.repeat(max / 25); }
  const low = f < 0.25;
  if (hudCache.low !== low) { hudCache.low = low; $('o2').classList.toggle('low', low); }
  setText('depth', `${w.depth.toLocaleString('en-US')} m`);
  setText('area-name', w.area.name);
  setText('c-species', `${w.scanned.size}/${TOTALS.species}`);
  setText('c-treasure', `${w.treasures.size}/${TOTALS.treasures}`);
  setText('c-shell', `${w.shells.size}/${TOTALS.shells}`);
  setText('map-pct', `${Math.floor(w.completion * 100)}%`);
  const dailyKey = `${save.daily.date}:${save.daily.done.join(',')}:${save.daily.complete}`;
  if (force || hudCache.daily !== dailyKey) {
    hudCache.daily = dailyKey;
    if (save.daily.complete) $('daily-chip').innerHTML = '<span class="lbl">Daily dive done! 🎉</span>';
    else goalChips($('daily-chip'), true);
  }
  const cool = w.sonarCool > 0;
  if (hudCache.cool !== cool) { hudCache.cool = cool; $('btn-sonar').classList.toggle('cool', cool); }
}

function toast(text, cls = '', ms = 3200) {
  const box = $('toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 600);
}

let bannerTimer = null;
function banner(title, sub) {
  const b = $('banner');
  b.innerHTML = `<h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}`;
  b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), 3400);
}

let factTimer = null;
function showFact(sp, first) {
  $('fact').classList.remove('hidden');
  $('fact').querySelector('.fact-new').textContent = first ? 'New creature!' : 'Daily dive scan!';
  $('fact-name').textContent = sp.name;
  $('fact-text').textContent = sp.fact;
  drawCreatureCard($('fact-art'), sp);
  clearTimeout(factTimer);
  factTimer = setTimeout(() => $('fact').classList.add('hidden'), 7500);
}
$('fact').addEventListener('click', () => $('fact').classList.add('hidden'));

const HINTS = {
  lights: 'Too dark down there! Bubbles needs headlights.',
  hull: 'The water is squeezing too hard! A pressure hull would help.',
  turbo: 'Whoa, strong current! A turbo fin could push through.',
  grabber: 'A rusty hatch! A grabber arm could pull it open.',
  drill: 'An old coral wall. A coral drill could tunnel through.',
};

function nextGoalText() {
  const next = UPGRADES.find((u) => !world.ups.has(u.id));
  if (!next) return world.heart ? 'You found everything important. Keep exploring!' : 'Find the Heart of the Sea, deep in the Volcanic Vent!';
  return `Next part to find: the ${next.name}, somewhere in the ${AREAS[next.area].name}.`;
}

// ------------------------------------------------------------ world events

function handleWorldEvents(events) {
  let dirty = false;
  for (const e of events) {
    switch (e.type) {
      case 'scan': {
        const sp = SPECIES[e.species];
        dirty = true;
        if (e.first) {
          save.progress.scanned = [...world.scanned];
          showFact(sp, true);
          log.event('creature.scan', { species: sp.id, area: AREAS[sp.area].id, total: world.scanned.size });
        }
        const d = recordDailyScan(save, today, sp.id);
        if (d.progressed && !e.first) showFact(sp, false);
        if (d.completed) {
          sound.play('daily');
          toast(`Daily dive complete! 🔥 ${d.streak} day streak`, 'gold', 4500);
          if (d.newBest) toast(`New best daily time: ${formatTime(save.bests.dailyTime)}!`, 'gold', 4500);
          log.event('daily.complete', { streak: d.streak, time: Math.round(save.daily.time) });
        } else if (d.progressed) {
          toast(`Daily dive: ${dailyRemaining(save).length} to go!`, 'gold');
        }
        world.wanted = new Set(dailyRemaining(save));
        break;
      }
      case 'treasure':
        dirty = true;
        toast(`Treasure! ${e.name} (${world.treasures.size}/${TOTALS.treasures})`, 'gold');
        break;
      case 'shell':
        dirty = true;
        toast(e.tank ? 'Golden shell! Bubbles got a bigger air tank!' : `Golden shell! (${world.shells.size}/${TOTALS.shells})`, 'gold', 3800);
        break;
      case 'part': {
        dirty = true;
        const u = UPGRADES[e.index];
        log.event('part.found', { part: u.id, index: e.index + 1, time: Math.round(save.stats.playTime) });
        openPart(u);
        break;
      }
      case 'heart':
        dirty = true;
        log.event('level.complete', { kind: 'heart', scanned: world.scanned.size, treasures: world.treasures.size, shells: world.shells.size, 'map.pct': Math.round(world.completion * 100), time: Math.round(save.stats.playTime) });
        openEnding();
        break;
      case 'gate':
        dirty = true;
        toast(e.kind === 'coral' ? 'Drilled through the coral!' : 'The hatch creaks open!', '');
        log.event('gate.open', { gate: e.id });
        break;
      case 'hint':
        toast(HINTS[e.reason] || 'Hmm, Bubbles can\'t go that way yet.', 'hint', 3400);
        break;
      case 'area':
        if (e.first) banner(AREAS[e.area].name, AREAS[e.area].blurb);
        dirty = dirty || e.first;
        break;
      case 'dock': {
        dirty = true;
        const dock = map.docks.find((d) => d.id === e.dock);
        const beat = recordDive(save, e.dive);
        const bits = [`${dock.name}: air refilled and saved!`];
        toast(bits[0]);
        if (beat.includes('depth')) toast(`New best! Deepest dive ${save.bests.depth.toLocaleString('en-US')} m`, 'gold', 4200);
        if (beat.includes('diveScans')) toast(`New best! ${save.bests.diveScans} new creatures in one dive`, 'gold', 4200);
        lowWarned = false;
        if (e.dive.time > 20) log.event('dive.end', { dock: e.dock, reason: 'dock', scans: e.dive.scans, treasures: e.dive.treasures, depth: e.dive.maxDepth, time: Math.round(e.dive.time) });
        break;
      }
      case 'oxygen.out':
        dirty = true;
        openOut(e);
        break;
      default:
        break;
    }
  }
  if (dirty) {
    syncSave();
    for (const p of newPaints(save)) toast(`New paint job unlocked: ${p.name}! 🎨`, 'gold', 4500);
    persist();
  }
}

// ------------------------------------------------------------ cards

function openPart(u) {
  mode = 'part';
  $('part-icon').textContent = u.icon;
  $('part-name').textContent = u.name;
  $('part-blurb').textContent = u.blurb;
  $('part-next').textContent = nextGoalText();
  showScreen('screen-part');
}
function closePart() { mode = 'play'; input.clear(); showScreen(null); }

function openOut(e) {
  mode = 'out';
  const dock = map.docks.find((d) => d.id === e.dock) || map.docks[0];
  recordDive(save, e.dive);
  save.stats.returns++;
  $('out-text').textContent = `Bubbles floated safely back to ${dock.name}. Nothing was lost!`;
  $('out-lines').innerHTML = [
    ['Dive time', formatTime(e.dive.time)],
    ['New creatures', e.dive.scans],
    ['Treasures', e.dive.treasures],
    ['Deepest', `${e.dive.maxDepth.toLocaleString('en-US')} m`],
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  log.event('level.fail', { reason: 'oxygen', dock: dock.id, area: world.area.id, scans: e.dive.scans, time: Math.round(e.dive.time) });
  showScreen('screen-out');
}
function closeOut() {
  world.returnToDock();
  renderer.handleEvents(world.events, world);
  world.events.length = 0;
  syncSave();
  persist();
  closePart();
}

function openEnding() {
  mode = 'ending';
  $('ending-lines').innerHTML = [
    ['Creatures', `${world.scanned.size}/${TOTALS.species}`],
    ['Treasures', `${world.treasures.size}/${TOTALS.treasures}`],
    ['Golden shells', `${world.shells.size}/${TOTALS.shells}`],
    ['Map explored', `${Math.floor(world.completion * 100)}%`],
    ['Time', formatTime(save.stats.playTime)],
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  sound.play('heart');
  showScreen('screen-ending');
}
function closeEnding() { closePart(); }

// ------------------------------------------------------------ map screen

function openMap() {
  sound.unlock();
  if (mode === 'play') returnMode = 'play';
  if (mode === 'play' || mode === 'paused' || mode === 'title') overlayFrom = mode;
  mode = 'map';
  renderer.updateFog(world);
  const c = $('bigmap');
  renderer.drawMap(c, world, { full: true });
  $('map-total').textContent = `${Math.floor(world.completion * 100)}% explored`;
  $('map-lines').innerHTML = [
    `💰 ${world.treasures.size}/${TOTALS.treasures} treasures`,
    `🐚 ${world.shells.size}/${TOTALS.shells} golden shells`,
    `🔧 ${world.ups.size}/${TOTALS.parts} parts`,
    `🐠 ${world.scanned.size}/${TOTALS.species} creatures`,
  ].map((t) => `<span class="pill">${t}</span>`).join('') + `<span class="pill area">${nextGoalText()}</span>`;
  showScreen('screen-map');
}

// ------------------------------------------------------------ sea book

let bookArea = 0;
function openBook() {
  sound.unlock();
  if (mode === 'play') returnMode = 'play';
  if (mode === 'play' || mode === 'paused' || mode === 'title') overlayFrom = mode;
  mode = 'book';
  if (returnMode === 'play') bookArea = world.areaIndex;
  syncSave();
  renderBook();
  showScreen('screen-book');
  $('book-tabs').querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
}

function renderBook() {
  const comp = areaCompletion(save);
  const total = save.progress.scanned.length;
  $('book-total').textContent = `${total}/${TOTALS.species}`;
  const tabs = $('book-tabs');
  tabs.innerHTML = '';
  comp.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(i === bookArea));
    const seen = world.visited.has(i);
    if (!seen) b.classList.add('locked');
    b.innerHTML = `${seen ? c.name : '???'}<span class="n">${c.got}/${c.total}</span>`;
    b.addEventListener('click', () => { bookArea = i; renderBook(); $('book-tabs').children[i].focus(); });
    tabs.appendChild(b);
  });
  const grid = $('book-grid');
  grid.innerHTML = '';
  $('book-detail').classList.add('hidden');
  SPECIES.forEach((sp) => {
    if (sp.area !== bookArea) return;
    const got = save.progress.scanned.includes(sp.id);
    const daily = dailyRemaining(save).includes(sp.id);
    const b = document.createElement('button');
    b.className = `cr${got ? '' : ' missing'}${daily ? ' daily' : ''}`;
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 110;
    b.appendChild(cv);
    const label = document.createElement('span');
    label.textContent = got ? sp.name : (daily ? `★ ${sp.name}` : '???');
    b.appendChild(label);
    b.setAttribute('aria-label', got ? sp.name : daily ? `${sp.name}, not scanned yet, daily goal` : 'Not scanned yet');
    b.addEventListener('click', () => showDetail(sp, b));
    grid.appendChild(b);
    drawCreatureCard(cv, sp, { silhouette: !got });
  });
}

function showDetail(sp, btn) {
  for (const el of document.querySelectorAll('.cr.sel')) el.classList.remove('sel');
  btn.classList.add('sel');
  const got = save.progress.scanned.includes(sp.id);
  $('book-detail').classList.remove('hidden');
  drawCreatureCard($('detail-art'), sp, { silhouette: !got });
  const daily = dailyRemaining(save).includes(sp.id);
  $('detail-name').textContent = got || daily ? sp.name : 'Not scanned yet';
  $('detail-area').textContent = `Lives in the ${AREAS[sp.area].name}`;
  $('detail-fact').textContent = got ? sp.fact : 'Swim close to scan this creature and learn its secret.';
  const tips = { hide: 'Tip: it hides! Ping sonar nearby to spot it.', shy: 'Tip: it is shy. Swim up slowly.', curious: 'Tip: it is curious and may swim right up to you.', school: 'Tip: look for a big group swimming together.', still: 'Tip: look along the sea floor and walls.', drift: 'Tip: it drifts gently in open water.', wander: 'Tip: it cruises around its home.' };
  $('detail-tip').textContent = got ? '' : tips[sp.beh] || '';
}

// ------------------------------------------------------------ paint shop

function openGarage() {
  sound.unlock();
  if (mode === 'play') returnMode = 'play';
  if (mode === 'play' || mode === 'paused' || mode === 'title') overlayFrom = mode;
  mode = 'garage';
  syncSave();
  renderGarage();
  showScreen('screen-garage');
}

function renderGarage() {
  const grid = $('garage-grid');
  grid.innerHTML = '';
  const unlocked = PAINTS.filter((p) => paintUnlocked(save, p)).length;
  $('garage-total').textContent = `${unlocked}/${PAINTS.length}`;
  for (const p of PAINTS) {
    const open = paintUnlocked(save, p);
    const b = document.createElement('button');
    b.className = `paint${open ? '' : ' locked'}${save.paint === p.id ? ' on' : ''}`;
    const cv = document.createElement('canvas');
    cv.width = 240; cv.height = 180;
    const sub = bakeSub(p, world.ups, 0);
    cv.getContext('2d').drawImage(sub.canvas, 0, 0, 240, 180);
    b.appendChild(cv);
    b.insertAdjacentHTML('beforeend', `<b>${p.name}</b><small>${save.paint === p.id ? 'On Bubbles now' : open ? 'Tap to paint' : `🔒 ${p.how}`}</small>`);
    b.setAttribute('aria-label', `${p.name}${open ? '' : `, locked: ${p.how}`}`);
    if (open) b.addEventListener('click', () => {
      save.paint = p.id;
      persist();
      sound.play('click');
      log.event('paint.equip', { paint: p.id });
      renderGarage();
      grid.querySelector('.paint.on')?.focus({ preventScroll: true });
    });
    grid.appendChild(b);
  }
}

// ------------------------------------------------------------ sound buttons

function updateSoundButtons() {
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = save.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = save.music ? '🎵 Music on' : '🎵 Music off';
  $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', save.muted ? 'Unmute' : 'Mute');
}
function toggleMute() { save.muted = !save.muted; sound.unlock(); sound.setMuted(save.muted); persist(); updateSoundButtons(); }
function toggleMusic() { save.music = !save.music; sound.unlock(); sound.setMusic(save.music); persist(); updateSoundButtons(); }

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', startPlay);
$('btn-resume').addEventListener('click', resume);
$('btn-pause').addEventListener('click', (e) => { e.currentTarget.blur(); pause(); });
$('btn-mute').addEventListener('click', (e) => { e.currentTarget.blur(); toggleMute(); });
$('btn-map').addEventListener('click', (e) => { e.currentTarget.blur(); openMap(); });
$('btn-book').addEventListener('click', (e) => { e.currentTarget.blur(); openBook(); });
$('minimap').parentElement.addEventListener('click', () => { if (mode === 'play') openMap(); });
$('btn-part-ok').addEventListener('click', closePart);
$('btn-out-ok').addEventListener('click', closeOut);
$('btn-ending-ok').addEventListener('click', closeEnding);
const sonarBtn = $('btn-sonar');
sonarBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); input.queueSonar(); });
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', () => { syncSave(); persist(); toTitle(); });
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', back);
for (const b of document.querySelectorAll('[data-open]')) {
  b.addEventListener('click', () => {
    const what = b.dataset.open;
    if (what === 'map') openMap(); else if (what === 'book') openBook(); else openGarage();
  });
}
addEventListener('resize', () => { renderer.resize(); if (mode === 'map') renderer.drawMap($('bigmap'), world, { full: true }); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); syncSave(); persist(); } });
addEventListener('pagehide', () => { syncSave(); persist(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });
addEventListener('pointerdown', (e) => { document.body.classList.toggle('touch', e.pointerType === 'touch' || e.pointerType === 'pen'); }, { capture: true, passive: true });
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

function moveFocus(dir) {
  const screen = SCREENS.map($).find((s) => !s.classList.contains('hidden'));
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not([disabled]), a[href]')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
}
addEventListener('keydown', (e) => {
  if (mode === 'play') return;
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
});

// ------------------------------------------------------------ loop

let pointerIdle = 0;
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, area: world.area.id, particles: renderer.particles.length, quality: renderer.quality }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

// Simple quality scaler: drop resolution a notch if frames stay slow.
let perfWindow = 0, perfFrames = 0, perfSlow = 0;
function scaleQuality(dtMs) {
  perfWindow += dtMs; perfFrames++;
  if (perfWindow < 2500) return;
  const avg = perfWindow / perfFrames;
  perfWindow = 0; perfFrames = 0;
  if (avg > 24 && renderer.quality > 0.6) {
    perfSlow++;
    if (perfSlow >= 2) {
      perfSlow = 0;
      renderer.setQuality(Math.round((renderer.quality - 0.2) * 10) / 10);
      log.info('perf.quality', { quality: renderer.quality, 'frame.ms': Math.round(avg) });
    }
  } else perfSlow = 0;
}

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dtMs = now - last;
  const dt = Math.max(0, Math.min(0.05, dtMs / 1000));
  last = now;
  if (document.visibilityState === 'visible') scaleQuality(dtMs);
  input.pollPad();
  updatePointer(dt);

  const esc = input.consume('Escape');
  if (esc || input.consume('KeyP') || input.consumePad('start')) {
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
    else if (esc) back();
  }
  if (input.consume('KeyN')) toggleMute();
  if (mode === 'play') {
    if (input.consume('KeyM') || input.consumePad('y')) openMap();
    else if (input.consume('KeyB') || input.consumePad('x')) openBook();
  } else {
    if ((mode === 'map' && input.consume('KeyM')) || (mode === 'book' && input.consume('KeyB'))) back();
    if (input.consumePad('up') || input.consumePad('left')) moveFocus(-1);
    if (input.consumePad('down') || input.consumePad('right')) moveFocus(1);
    if (input.consumePad('a')) document.activeElement?.click?.();
    if (input.consumePad('b')) back();
  }

  // Date rollover while playing: a new daily dive appears.
  const key = dateKey();
  if (key !== today) { today = key; if (ensureDaily(save, today)) { persist(); toast('A new daily dive is ready!', 'gold'); } }
  world.wanted = save.daily.complete ? new Set() : new Set(dailyRemaining(save));

  if (mode === 'play') {
    const controls = autopilot ? autopilot.controls(world, dt) : input.read();
    accumulator += dt;
    let first = true;
    while (accumulator >= STEP) {
      world.step(STEP, first ? controls : { ...controls, sonar: false });
      first = false;
      accumulator -= STEP;
      if (world.events.length) {
        const evs = world.events.slice();
        world.events.length = 0;
        renderer.handleEvents(evs, world);
        sound.handle(evs);
        handleWorldEvents(evs);
        if (mode !== 'play') { accumulator = 0; break; }
      }
    }
    save.stats.playTime += dt;
    if (!save.daily.complete) save.daily.time += dt;
    // Low air: a gentle warning, never a scare.
    if (world.oxygen / world.oxygenMax < 0.25) {
      if (!lowWarned) { lowWarned = true; toast('Air is getting low! Head to a dock or the surface.', 'hint', 4000); }
      lowBeep -= dt;
      if (lowBeep <= 0) { lowBeep = 6; sound.play('low'); }
    } else if (world.oxygen / world.oxygenMax > 0.4) lowWarned = false;
    saveTimer += dt;
    if (saveTimer > 10) { saveTimer = 0; syncSave(); persist(); }
    fogTimer -= dt;
    if (fogTimer <= 0) { fogTimer = 0.5; renderer.updateFog(world); }
    renderer.drawMap($('minimap'), world);
    updateHud();
    renderer.update(dt, world);
    renderer.draw(world, { paint: paintOf() });
  } else if (mode === 'title' && attractWorld) {
    const c = attractPilot.controls(attractWorld, dt);
    attractWorld.step(dt, c);
    renderer.handleEvents(attractWorld.events, attractWorld);
    attractWorld.events.length = 0;
    if (attractWorld.status === 'out') attractWorld.returnToDock();
    renderer.warm(5);
    renderer.update(dt, attractWorld);
    renderer.draw(attractWorld, { paint: paintOf() });
  } else {
    // Menus over the paused world: keep drawing so the sea still sways.
    renderer.update(mode === 'paused' ? 0 : dt * 0.3, world);
    renderer.draw(world, { paint: paintOf() });
  }
  requestAnimationFrame(loop);
}

const loop = telemetry ? telemetry.guard(frame, 'deep-dive.frame') : frame;

if (location.protocol !== 'file:') {
  log.event('game.ready', { parts: save.progress.upgrades.length, scanned: save.progress.scanned.length, streak: currentStreak(save, today), 'daily.done': save.daily.complete });
  persist();
  if (params.has('play') || autopilot) startPlay();
  else toTitle();
  requestAnimationFrame(loop);
}

window.DD = { get world() { return world; }, get mode() { return mode; }, save, renderer, input, sound, map, startPlay, openMap, openBook, openGarage, toTitle };
