import { aiInput } from './ai.js';
import { Audio } from './audio.js';
import { DISTRICTS } from './contracts.js';
import { clamp } from './math.js';
import { songFor } from './music.js';
import {
  PAINTS,
  UPGRADES,
  buyUpgrade,
  chapterStars,
  loadSave,
  paintFor,
  recordChapter,
  recordDelivery,
  recordJob,
  statsFor,
  upgradeCost,
  writeSave,
} from './progress.js';
import { FrameStats, LONG_FRAME_MS, STALL_MS, degraded } from './perf.js';
import { Renderer } from './render.js';
import { CHAPTERS, SPEAKERS } from './story.js';
import { World } from './world.js';

const STORY_SEED = 9417;
// Telemetry is loaded by index.html before this module. If it failed to load,
// the game still runs, it just logs nothing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };
const $ = (selector) => document.querySelector(selector);
const screens = [...document.querySelectorAll('.overlay')];
const scene = $('#scene');
const minimap = $('#minimap');
const query = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// `?quality=high|medium|low|lowest` pins the render quality; otherwise it
// adapts to how fast frames arrive.
const renderer = new Renderer(scene, {
  quality: query.get('quality') || 'auto',
  reducedMotion,
  onQuality(change) {
    log.info('render.quality', change);
    document.body.classList.toggle('lite', renderer.levelIndex >= 2);
  },
});

// Reading `localStorage` throws when the browser blocks site storage; the
// save helpers treat a null store as "nothing saved".
const storage = (() => { try { return localStorage; } catch { return null; } })();

const state = {
  save: loadSave(storage),
  world: null,
  attract: false,
  chapter: 0,
  screen: 'screen-title',
  garageReturn: 'title',
  paused: false,
  autopilot: query.has('autopilot'),
  keys: new Set(),
  touch: { x: 0, y: 0, dash: false, pulse: false, echo: false, drift: false },
  padStart: false,
  lastFrame: performance.now(),
  toastUntil: 0,
  commsUntil: 0,
  cursorTimer: 0,
  sparkSound: 0,
};
const audio = new Audio({ muted: state.save.muted, musicMuted: state.save.musicMuted });

const hud = $('#hud');
const touch = $('#touch');
const toast = $('#toast');
const comms = $('#comms');

function seedFromCode(code) {
  const clean = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean || clean === 'story') return STORY_SEED;
  const parsed = Number.parseInt(clean, 36);
  return Number.isFinite(parsed) && parsed > 0 ? parsed >>> 0 : STORY_SEED;
}

function codeFor(seed) {
  return (seed >>> 0).toString(36).toUpperCase();
}

function rgbFor(hex) {
  const value = hex.replace('#', '');
  return `${Number.parseInt(value.slice(0, 2), 16)}, ${Number.parseInt(value.slice(2, 4), 16)}, ${Number.parseInt(value.slice(4, 6), 16)}`;
}

function applyPaint() {
  const paint = paintFor(state.save);
  document.documentElement.style.setProperty('--accent', paint.color);
  document.documentElement.style.setProperty('--accent-rgb', rgbFor(paint.color));
  if (state.world) state.world.paint = paint.color;
}

function makeWorld(seed, chapter, { attract = false, job = 0 } = {}) {
  const paint = paintFor(state.save);
  state.world = new World(seed, { chapter, job, stats: statsFor(state.save.upgrades), paint: paint.color });
  state.attract = attract;
  renderer.camera.ready = false;
  applyPaint();
  window.NN = {
    get world() { return state.world; },
    get quality() { return renderer.qualityName; },
    renderer,
    audio,
    startChapter,
    save: state.save,
  };
  return state.world;
}

// Behind the menus the autopilot rides a random district, lighting it up.
function attractWorld() {
  const chapter = Math.floor(Math.random() * CHAPTERS.length);
  makeWorld((Math.random() * 0xffffffff) >>> 0 || 1, chapter, { attract: true });
  state.world.startContract();
}

function showScreen(id) {
  state.screen = id || null;
  for (const screen of screens) screen.classList.toggle('hidden', screen.id !== id);
  if (id) $(`#${id}`).querySelector('.button.primary, .button, button')?.focus({ preventScroll: true });
}

function showTitle() {
  state.paused = false;
  hidePlayUi();
  if (!state.attract) attractWorld();
  $('#shift-code').value = query.get('seed') ? codeFor(seedFromCode(query.get('seed'))) : '';
  updateTitle();
  showScreen('screen-title');
}

function updateTitle() {
  const { credits, story } = state.save;
  const stars = story.stars.flat().reduce((a, b) => a + b, 0);
  const pilot = state.autopilot ? ' · AUTOPILOT' : '';
  $('#title-stats').textContent = `${stars} / 45 ★ · ${credits.toLocaleString()} credits${story.finished ? ' · Vanta is lit!' : ''}${pilot}`;
}

// ------------------------------------------------------------------ map

function showMap() {
  audio.unlock();
  state.paused = false;
  hidePlayUi();
  if (!state.attract) attractWorld();
  const list = $('#district-list');
  list.replaceChildren();
  CHAPTERS.forEach((chapter, index) => {
    const locked = index > state.save.story.unlocked;
    const stars = chapterStars(state.save, index);
    const lit = state.save.story.stars[index].every((value) => value > 0);
    const district = DISTRICTS[index];
    const button = document.createElement('button');
    button.className = `district${locked ? ' locked' : ''}${lit ? ' lit' : ''}`;
    button.disabled = locked;
    button.style.setProperty('--district', district.accent);
    const number = document.createElement('span');
    number.className = 'district-number';
    number.textContent = locked ? '🔒' : String(index + 1);
    const text = document.createElement('span');
    text.className = 'district-text';
    const name = document.createElement('b');
    name.textContent = district.name;
    const title = document.createElement('small');
    title.textContent = locked ? 'Light the district before it' : chapter.title;
    text.append(name, title);
    const score = document.createElement('span');
    score.className = 'district-stars';
    score.textContent = locked ? '' : `${'★'.repeat(stars)}${'☆'.repeat(9 - stars)}`;
    button.append(number, text, score);
    button.addEventListener('click', () => startChapter(index));
    list.append(button);
  });
  const total = state.save.story.stars.flat().reduce((a, b) => a + b, 0);
  $('#map-stars').textContent = `${total} / 45 ★`;
  showScreen('screen-map');
}

// --------------------------------------------------------------- story

function speakerLine([who, text]) {
  const speaker = SPEAKERS[who] || { name: who.toUpperCase(), color: '#e9f8ff' };
  const line = document.createElement('div');
  line.className = 'line';
  line.style.setProperty('--speaker', speaker.color);
  const face = document.createElement('span');
  face.className = 'face';
  face.textContent = speaker.name[0];
  const body = document.createElement('p');
  const name = document.createElement('b');
  name.textContent = speaker.name;
  body.append(name, document.createTextNode(text));
  line.append(face, body);
  return line;
}

function fillDialogue(parent, lines) {
  parent.replaceChildren(...lines.map(speakerLine));
}

function startChapter(chapter, job = 0) {
  audio.unlock();
  log.event('chapter.start', { chapter: chapter + 1, job: job + 1 });
  state.chapter = chapter;
  const seed = seedFromCode($('#shift-code').value || query.get('seed'));
  makeWorld(seed, chapter, { job });
  const def = CHAPTERS[chapter];
  $('#story-eyebrow').textContent = `CHAPTER ${chapter + 1} · ${state.world.contract.district.name.toUpperCase()}`;
  $('#story-title').textContent = def.title;
  fillDialogue($('#story-lines'), def.intro);
  $('#btn-story-next').innerHTML = 'Let’s ride <span>→</span>';
  $('#btn-story-next').onclick = showBriefing;
  showScreen('screen-story');
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function goalsFor(contract) {
  const sparkGoal = Math.ceil(contract.sparks.length * 0.7);
  return [
    contract.kind === 'chase' ? `Catch ${contract.def.runnerName} and bring it home` : 'Finish the job',
    `Grab ${sparkGoal} of ${contract.sparks.length} sparks ✦`,
    'Keep the bike above 70%',
  ];
}

function showBriefing() {
  const { contract } = state.world;
  hidePlayUi();
  $('#briefing-job').textContent = `JOB ${contract.job + 1} / 3 · ${contract.district.name.toUpperCase()}`;
  $('#briefing-title').textContent = contract.title;
  $('#briefing-kind').textContent = contract.type.label;
  $('#briefing-condition').textContent = contract.type.condition;
  $('#briefing-time').textContent = `${formatTime(contract.timeLimit)} WINDOW`;
  fillDialogue($('#briefing-lines'), contract.def.brief);
  const best = state.save.story.stars[contract.chapter][contract.job];
  $('#briefing-goals').replaceChildren(...goalsFor(contract).map((goal, index) => {
    const item = document.createElement('li');
    item.className = index < best ? 'earned' : '';
    item.textContent = goal;
    return item;
  }));
  showScreen('screen-briefing');
}

function launchContract() {
  audio.unlock();
  const contract = state.world.contract;
  log.event('job.start', { chapter: contract.chapter + 1, job: contract.job + 1, kind: contract.kind, 'time.limit': contract.timeLimit });
  state.padLatch = true;
  state.world.startContract();
  state.paused = false;
  showScreen(null);
  showPlayUi();
  revealCursor();
  const first = state.world.contract.legs[0][0];
  const verb = { cell: 'Find the spark cells', piece: 'Find the invitation pieces', runner: `Catch ${first.name}` }[first.kind];
  toastMessage(verb ? verb.toUpperCase() : `HEAD TO ${first.name.toUpperCase()}`, 2400);
}

function showPlayUi() {
  document.body.classList.add('playing');
  hud.classList.remove('hidden');
  if (matchMedia('(pointer: coarse)').matches) touch.classList.remove('hidden');
  $('#hud-scans').classList.toggle('hidden', !state.world.contract.type.scanLimit);
}

function hidePlayUi() {
  document.body.classList.remove('playing');
  hud.classList.add('hidden');
  touch.classList.add('hidden');
  comms.classList.remove('show');
  document.body.classList.remove('cursor-hidden');
}

// -------------------------------------------------------------- garage

function showGarage(from) {
  state.garageReturn = from;
  hidePlayUi();
  updateGarage();
  showScreen('screen-garage');
}

function closeGarage() {
  if (state.garageReturn === 'briefing') showBriefing();
  else if (state.garageReturn === 'debrief') showDebrief();
  else if (state.garageReturn === 'map') showMap();
  else showTitle();
}

function updateGarage() {
  $('#garage-credits').textContent = state.save.credits.toLocaleString();
  const list = $('#upgrade-list');
  list.replaceChildren();
  for (const [key, upgrade] of Object.entries(UPGRADES)) {
    const level = state.save.upgrades[key] || 0;
    const cost = upgradeCost(state.save, key);
    const row = document.createElement('div');
    row.className = 'upgrade';
    const details = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = upgrade.label;
    const blurb = document.createElement('p');
    blurb.textContent = upgrade.blurb;
    const levelText = document.createElement('span');
    levelText.className = 'level';
    levelText.textContent = `LEVEL ${level} / ${upgrade.costs.length}`;
    details.append(title, blurb, levelText);
    const button = document.createElement('button');
    button.className = 'button';
    button.disabled = cost === null || state.save.credits < cost;
    button.textContent = cost === null ? 'MAXED' : `${cost} CR`;
    button.addEventListener('click', () => {
      if (!buyUpgrade(state.save, key)) return;
      log.event('garage.upgrade', { upgrade: key, level: state.save.upgrades[key] });
      writeSave(storage, state.save);
      state.world.setStats(statsFor(state.save.upgrades));
      updateGarage();
      updateTitle();
      toastMessage(`${upgrade.label} fitted.`, 1800);
    });
    row.append(details, button);
    list.append(row);
  }

  const paintList = $('#paint-list');
  paintList.replaceChildren();
  for (const paint of PAINTS) {
    const button = document.createElement('button');
    button.className = `button paint${state.save.paint === paint.id ? ' selected' : ''}`;
    const swatch = document.createElement('i');
    swatch.style.background = paint.color;
    swatch.style.color = paint.color;
    button.append(swatch, document.createTextNode(paint.label));
    button.addEventListener('click', () => {
      state.save.paint = paint.id;
      writeSave(storage, state.save);
      applyPaint();
      updateGarage();
    });
    paintList.append(button);
  }
}

// ------------------------------------------------------------- results

function recordResult() {
  const result = state.world.currentResult;
  if (!result || result.recorded) return;
  recordDelivery(state.save, result);
  recordJob(state.save, result.chapter, result.job, result.stars);
  result.recorded = true;
  writeSave(storage, state.save);
  updateTitle();
}

const RESULT_TITLES = ['Delivered!', 'Nice ride!', 'Superstar courier!'];

function showDebrief() {
  const result = state.world.currentResult;
  if (!result) return;
  if (!result.recorded) {
    log.event('job.complete', {
      chapter: result.chapter + 1, job: result.job + 1, stars: result.stars, sparks: result.sparks,
      'sparks.total': result.sparksTotal, integrity: result.integrity, 'time.left': Math.round(result.contract.timeRemaining),
    });
  }
  recordResult();
  hidePlayUi();
  $('#result-title').textContent = RESULT_TITLES[result.stars - 1];
  const stars = [...$('#result-stars').children];
  stars.forEach((star, index) => {
    star.classList.toggle('on', index < result.stars);
    star.style.animationDelay = `${0.15 + index * 0.18}s`;
  });
  $('#result-earned').textContent = `+ ${result.earned.toLocaleString()} credits`;
  const lines = [
    ['Job', result.contract.title],
    ['Sparks', `${result.sparks} / ${result.sparksTotal}${result.sparks >= result.sparkGoal ? ' ★' : ''}`],
    ['Bike condition', `${result.integrity}%${result.integrity >= 70 ? ' ★' : ''}`],
    ['Time bonus', `+${result.timeBonus}`],
    ['Style bonus', `+${result.styleBonus}`],
  ];
  const parent = $('#result-lines');
  parent.replaceChildren(...lines.map(([label, value]) => {
    const line = document.createElement('div');
    line.className = 'result-line';
    const name = document.createElement('span');
    const amount = document.createElement('b');
    name.textContent = label;
    amount.textContent = value;
    line.append(name, amount);
    return line;
  }));
  $('#btn-next').innerHTML = result.final ? 'Light the district <span>→</span>' : 'Next job <span>→</span>';
  showScreen('screen-debrief');
}

function showFailure() {
  hidePlayUi();
  log.event('job.fail', { chapter: state.world.chapter + 1, job: state.world.contractIndex + 1, reason: state.world.failure });
  $('#failure-title').textContent = ['So close!', 'Oof! Almost!', 'Shake it off!'][state.world.contractIndex % 3];
  $('#failure-copy').textContent = state.world.failure || 'Mara will find another window.';
  showScreen('screen-failed');
}

function showComplete() {
  hidePlayUi();
  const world = state.world;
  log.event('chapter.complete', { chapter: world.chapter + 1, credits: world.totalCredits });
  const chapter = world.chapter;
  recordChapter(state.save, chapter);
  writeSave(storage, state.save);
  const def = CHAPTERS[chapter];
  const last = chapter === CHAPTERS.length - 1;
  $('#complete-eyebrow').textContent = last ? 'THE END · HAPPY LANTERN FESTIVAL' : `CHAPTER ${chapter + 1} COMPLETE`;
  $('#complete-title').textContent = last ? 'Vanta is lit!' : `${world.contract.district.name} is glowing!`;
  const stars = chapterStars(state.save, chapter);
  $('#complete-total').textContent = `${'★'.repeat(stars)}${'☆'.repeat(9 - stars)}`;
  fillDialogue($('#complete-lines'), def.outro);
  $('#btn-new-shift').innerHTML = last ? 'Play again <span>↻</span>' : 'Next district <span>→</span>';
  $('#btn-new-shift').onclick = () => (last ? showMap() : startChapter(chapter + 1));
  updateTitle();
  showScreen('screen-complete');
}

function togglePause(force) {
  if (state.attract || (!state.world.active && !state.paused)) return;
  const next = typeof force === 'boolean' ? force : !state.paused;
  state.paused = next;
  if (next) {
    hidePlayUi();
    updateSoundButtons();
    showScreen('screen-pause');
  } else {
    state.padLatch = true;
    showScreen(null);
    showPlayUi();
    revealCursor();
  }
}

function toastMessage(message, duration = 1600) {
  toast.textContent = message;
  state.toastUntil = performance.now() + duration;
  toast.classList.add('show');
}

function commsMessage(speakerId, text, duration = 4200) {
  const speaker = SPEAKERS[speakerId] || SPEAKERS.mara;
  comms.style.setProperty('--speaker', speaker.color);
  $('#comms-face').textContent = speaker.name[0];
  $('#comms-name').textContent = speaker.name;
  $('#comms-text').textContent = text;
  comms.classList.add('show');
  state.commsUntil = performance.now() + duration;
}

// -------------------------------------------------------------- events

function processEvents() {
  const { world } = state;
  const events = world.events.splice(0);
  if (events.length) renderer.effects(events, world, { attract: state.attract });
  if (state.attract) return;
  for (const event of events) {
    if (event.type === 'spark') {
      // Many sparks in a row would stack into a buzz; keep a gentle ping.
      const now = performance.now();
      if (now - state.sparkSound > 55) {
        audio.event({ ...event, pitch: event.taken });
        state.sparkSound = now;
      }
    } else {
      audio.event(event);
    }
    if (event.type === 'radio') {
      commsMessage(event.speaker, event.text);
      audio.duck(4);
    }
    if (event.type === 'pickup') toastMessage(world.finalLeg ? `GOT IT! NOW TO ${world.target?.name.toUpperCase() || 'THE DROP'}` : 'NEXT STOP', 2300);
    if (event.type === 'stop' && event.left > 0) {
      const noun = { cell: 'SPARK CELL', piece: 'PIECE', drop: 'DROP' }[event.stop.kind] || 'STOP';
      toastMessage(`${noun} ✓ · ${event.left} TO GO`, 1500);
    }
    if (event.type === 'caught') toastMessage(`CAUGHT ${event.name.toUpperCase()}!`, 1800);
    if (event.type === 'dash') toastMessage('DASH', 450);
    if (event.type === 'pulse') toastMessage(event.jammed ? `PULSE · ${event.jammed} DRONE${event.jammed === 1 ? '' : 'S'} JAMMED` : 'PULSE', 1100);
    if (event.type === 'echo') toastMessage('ECHO OUT · DRONES CHASE THE DECOY', 1500);
    if (event.type === 'near-miss') toastMessage(`${event.combo}× CLOSE CALL`, 900);
    if (event.type === 'alert') toastMessage('SENTRY SPOTTED YOU', 1100);
    if (event.type === 'scan') {
      toastMessage(event.limit ? `SCANNED ${event.count} / ${event.limit}` : 'SCANNED · HEAT RISING', 1500);
      commsMessage('halo', event.line, 3000);
      audio.duck(3);
    }
    if (event.type === 'flux') toastMessage('FLUX SHIELD ABSORBED THE HIT', 1350);
    if (event.type === 'notice') toastMessage(event.text, 1350);
  }
}

function reconcileWorld() {
  const { world } = state;
  if (state.attract) {
    // Keep the menu city busy: roll on to the next job when one finishes.
    if (world.status === 'debrief') {
      world.nextContract();
      if (world.status === 'briefing') world.startContract();
    }
    if (world.status === 'failed') world.retryContract() && world.startContract();
    if (world.status === 'chapter-complete') attractWorld();
    return;
  }
  if (world.status === 'debrief' && state.screen !== 'screen-debrief' && state.screen !== 'screen-garage') showDebrief();
  if (world.status === 'failed' && state.screen !== 'screen-failed') showFailure();
  if (world.status === 'chapter-complete' && state.screen !== 'screen-complete') showComplete();
}

function objectiveText(world) {
  const stop = world.target;
  if (!stop) return ['', '', ''];
  const left = world.stopsLeft;
  const total = world.leg.length;
  switch (stop.kind) {
    case 'cell': return ['COLLECT', `Find the spark cells (${total - left} / ${total})`, 'Follow the dotted line'];
    case 'piece': return ['COLLECT', `Find the invitation pieces (${total - left} / ${total})`, 'Follow the dotted line'];
    case 'runner': return ['CHASE', `Catch ${stop.name}`, 'Dash to close the gap'];
    case 'pickup': return ['PICKUP', `Pick up ${world.contract.def.cargo}`, stop.name];
    default:
      if (total > 1) return ['DELIVER', `Drop off ${world.contract.def.cargo} (${total - left} / ${total})`, stop.name];
      return ['DELIVER', `Bring ${world.contract.def.cargo}`, stop.name];
  }
}

// The HUD is updated every frame, so writes only touch the DOM when a value
// actually changes.
const hudNodes = new Map();
function node(id) {
  let element = hudNodes.get(id);
  if (!element) {
    element = document.getElementById(id);
    hudNodes.set(id, element);
  }
  return element;
}
function setText(id, value) {
  const element = node(id);
  if (element.$text !== value) {
    element.$text = value;
    element.textContent = value;
  }
}
function setStyle(id, property, value) {
  const element = node(id);
  const key = `$${property}`;
  if (element[key] !== value) {
    element[key] = value;
    element.style[property] = value;
  }
}
function setClass(id, name, on) {
  const element = node(id);
  const key = `$class-${name}`;
  if (element[key] !== on) {
    element[key] = on;
    element.classList.toggle(name, on);
  }
}

function updateHud() {
  if (hud.classList.contains('hidden')) return;
  const world = state.world;
  const player = world.player;
  const heat = player.heat;
  const [phase, objective, where] = objectiveText(world);
  setText('hud-district', `${world.contract.district.name.toUpperCase()} · ${world.contract.title.toUpperCase()}`);
  setText('hud-job', `JOB ${world.contract.job + 1} / 3`);
  setText('hud-clock', formatTime(world.contract.timeRemaining));
  setClass('hud-clock', 'low', world.contract.timeRemaining < 10);
  setText('hud-phase', phase);
  setText('hud-objective', objective);
  setText('hud-location', where);
  setText('hud-sparks', `✦ ${world.sparksTaken} / ${world.contract.sparks.length}`);
  setText('hud-scans', `SCANS ${world.scans} / ${world.contract.type.scanLimit}`);
  setText('integrity-label', player.carrying ? 'CARGO' : 'BIKE');
  setText('integrity-value', `${Math.max(0, Math.round(player.integrity))}%`);
  setText('charge-value', String(Math.round(player.charge)));
  setText('heat-value', heat < 18 ? 'LOW' : heat < 42 ? 'WATCHED' : heat < 70 ? 'HOT' : 'LOCKDOWN');
  setStyle('hud-integrity', 'width', `${Math.round(clamp(player.integrity, 0, 100))}%`);
  setStyle('hud-charge', 'width', `${Math.round(clamp(player.charge / player.maxCharge * 100, 0, 100))}%`);
  setStyle('hud-heat', 'width', `${Math.round(heat)}%`);
  setClass('ab-dash', 'ready', player.charge >= world.stats.dashCost);
  setClass('ab-pulse', 'ready', player.charge >= 28);
  setClass('ab-echo', 'ready', player.charge >= 43 && player.echoCooldown <= 0);
  setClass('scan-warning', 'hidden', player.scan < 0.13);
  setStyle('scan-warning', 'opacity', clamp(player.scan * 1.35, 0.25, 1).toFixed(2));
  setText('combo', player.combo > 1 ? `${player.combo}× STYLE CHAIN` : '');
  renderer.drawMiniMap(minimap, world);
}

// --------------------------------------------------------------- input

function gamepadInput() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = [...pads].find(Boolean);
  if (!pad) return {};
  const b = (i) => !!pad.buttons[i]?.pressed;
  let x = Math.abs(pad.axes[0] || 0) > 0.2 ? pad.axes[0] : 0;
  let y = Math.abs(pad.axes[1] || 0) > 0.2 ? pad.axes[1] : 0;
  if (b(14)) x = -1;
  if (b(15)) x = 1;
  if (b(12)) y = -1;
  if (b(13)) y = 1;
  // The A press that closed a menu should not also dash as play begins.
  if (state.padLatch && !b(0)) state.padLatch = false;
  const start = b(9);
  if (start && !state.padStart) {
    if (state.world.active || state.paused) togglePause();
  }
  state.padStart = start;
  return {
    x,
    y,
    dash: (b(0) && !state.padLatch) || b(7),
    pulse: b(1),
    echo: b(2),
    drift: b(5) || b(6) || b(4),
  };
}

// Menus with a gamepad: d-pad or stick moves between buttons, A presses the
// focused one. The first reading only latches what is already held, so a
// button still down from the last screen does not press anything.
let menuPrev = null;
let menuRepeat = 0;
function menuPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = [...pads].find(Boolean);
  const overlay = state.screen && $(`#${state.screen}`);
  if (!pad || !overlay) {
    menuPrev = null;
    return;
  }
  const b = (i) => !!pad.buttons[i]?.pressed;
  const ax = pad.axes[0] || 0;
  const ay = pad.axes[1] || 0;
  const held = {
    back: b(12) || b(14) || ay < -0.5 || ax < -0.5,
    next: b(13) || b(15) || ay > 0.5 || ax > 0.5,
    press: b(0),
  };
  if (!menuPrev) {
    menuPrev = held;
    return;
  }
  const now = performance.now();
  const controls = [...overlay.querySelectorAll('button:not(:disabled), a[href], input, summary')]
    .filter((el) => el.offsetParent !== null);
  const index = controls.indexOf(document.activeElement);
  for (const dir of ['back', 'next']) {
    if (held[dir] && (!menuPrev[dir] || now > menuRepeat)) {
      const step = dir === 'next' ? 1 : -1;
      const target = controls[(index + step + controls.length) % controls.length] || controls[0];
      target?.focus();
      menuRepeat = now + (menuPrev[dir] ? 150 : 400);
    }
  }
  if (held.press && !menuPrev.press) {
    const focused = controls.includes(document.activeElement) ? document.activeElement : overlay.querySelector('.button.primary');
    focused?.click();
  }
  menuPrev = held;
}

function playerInput() {
  if (state.autopilot) return aiInput(state.world);
  const keys = state.keys;
  const pad = gamepadInput();
  const kx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  const ky = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
  return {
    moveX: clamp(kx + state.touch.x + (pad.x || 0), -1, 1),
    moveY: clamp(ky + state.touch.y + (pad.y || 0), -1, 1),
    dash: keys.has('Space') || state.touch.dash || pad.dash,
    drift: keys.has('ShiftLeft') || keys.has('ShiftRight') || state.touch.drift || pad.drift,
    pulse: keys.has('KeyE') || state.touch.pulse || pad.pulse,
    echo: keys.has('KeyQ') || state.touch.echo || pad.echo,
  };
}

function revealCursor() {
  document.body.classList.remove('cursor-hidden');
  window.clearTimeout(state.cursorTimer);
  if (state.world.active && !state.attract && !state.paused && !state.screen) {
    state.cursorTimer = window.setTimeout(() => document.body.classList.add('cursor-hidden'), 1800);
  }
}

// Frame timing for telemetry: a summary every 10 seconds when play is
// struggling, and a warning for any single frame long enough to feel stuck.
const frameStats = new FrameStats();
let statsAt = performance.now();
let lastLongFrameLog = 0;

function worldSnapshot() {
  const world = state.world;
  return {
    screen: state.screen || 'play',
    status: world.status,
    chapter: world.chapter + 1,
    job: world.contractIndex + 1,
    'lit.blocks': world.lit.size,
    patrols: world.patrols.length,
    sparks: world.contract.sparks.length,
    attract: state.attract,
    quality: renderer.qualityName,
  };
}

function trackFrame(now, elapsed) {
  // Hidden tabs pause animation frames; that gap is not a stall.
  if (document.visibilityState !== 'visible') return;
  frameStats.add(elapsed);
  if (elapsed >= LONG_FRAME_MS && now - lastLongFrameLog > 5000) {
    lastLongFrameLog = now;
    log.warn('frame.long', { 'frame.ms': Math.round(elapsed), ...worldSnapshot() });
  }
  if (now - statsAt >= 10000) {
    statsAt = now;
    const summary = frameStats.take();
    if (degraded(summary)) log.warn('perf.degraded', { ...summary, ...worldSnapshot() });
  }
}

// A watchdog outside the frame loop. If frames stop arriving while the page
// is visible (an endless loop, a stuck GPU), it records how long the freeze
// lasted as soon as the main thread is free again.
let lastFrameAt = performance.now();
let stallReported = false;
setInterval(() => {
  const gap = performance.now() - lastFrameAt;
  if (document.visibilityState === 'visible' && gap > STALL_MS && !stallReported && !telemetry?.crashed) {
    stallReported = true;
    log.error('frame.stall', { 'stall.ms': Math.round(gap), ...worldSnapshot() });
  }
}, 1000);
document.addEventListener('visibilitychange', () => {
  lastFrameAt = performance.now();
  audio.setHidden(document.visibilityState !== 'visible');
});

function frame(now) {
  const elapsed = now - state.lastFrame;
  if (stallReported) {
    log.warn('frame.resumed', { 'stall.ms': Math.round(now - lastFrameAt) });
    stallReported = false;
  }
  lastFrameAt = now;
  trackFrame(now, elapsed);
  const dt = Math.min(0.035, Math.max(0, elapsed / 1000));
  state.lastFrame = now;
  if (state.attract) {
    if (state.world.active) state.world.step(dt, aiInput(state.world));
    menuPad();
  } else if (state.world.active && !state.paused && !state.screen) {
    state.world.step(dt, playerInput());
  } else {
    gamepadInput(); // still watch Start so a paused game can resume
    menuPad();
  }
  processEvents();
  reconcileWorld();
  updateHud();
  audio.setSong(state.attract ? 'menu' : songFor(state.world.chapter));
  audio.setPaused(state.paused);
  // Hidden tabs pause frames; that gap should not count against quality.
  const visible = document.visibilityState === 'visible';
  renderer.draw(state.world, { attract: state.attract, now, elapsed: visible ? elapsed : 0 });
  if (now > state.toastUntil) toast.classList.remove('show');
  if (now > state.commsUntil) comms.classList.remove('show');
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen (with a report to copy)
// instead of leaving a frozen picture.
const loop = telemetry ? telemetry.guard(frame, 'neon-nighthawk.frame') : frame;

// ------------------------------------------------------------- buttons

$('#btn-start').addEventListener('click', showMap);
$('#btn-garage').addEventListener('click', () => showGarage('title'));
$('#btn-map-back').addEventListener('click', showTitle);
$('#btn-map-garage').addEventListener('click', () => showGarage('map'));
$('#btn-launch').addEventListener('click', launchContract);
$('#btn-briefing-garage').addEventListener('click', () => showGarage('briefing'));
$('#btn-result-garage').addEventListener('click', () => showGarage('debrief'));
$('#btn-garage-back').addEventListener('click', closeGarage);
$('#btn-pause').addEventListener('click', () => togglePause(true));
$('#btn-resume').addEventListener('click', () => togglePause(false));
$('#btn-restart').addEventListener('click', () => {
  state.world.restartContract();
  state.paused = false;
  showBriefing();
});
function updateSoundButtons() {
  $('#btn-mute').textContent = `Sound: ${state.save.muted ? 'off' : 'on'}`;
  $('#btn-music').textContent = `Music: ${state.save.musicMuted ? 'off' : 'on'}`;
}
function setSound({ muted = state.save.muted, musicMuted = state.save.musicMuted }) {
  state.save.muted = muted;
  state.save.musicMuted = musicMuted;
  audio.setMuted(muted);
  audio.setMusicMuted(musicMuted);
  writeSave(storage, state.save);
  updateSoundButtons();
}
$('#btn-mute').addEventListener('click', () => {
  audio.unlock();
  setSound({ muted: !state.save.muted });
});
$('#btn-music').addEventListener('click', () => {
  audio.unlock();
  setSound({ musicMuted: !state.save.musicMuted });
});
$('#btn-quit').addEventListener('click', showMap);
$('#btn-next').addEventListener('click', () => {
  state.world.nextContract();
  if (state.world.status === 'chapter-complete') showComplete();
  else showBriefing();
});
$('#btn-retry').addEventListener('click', () => {
  state.world.retryContract();
  showBriefing();
});
$('#btn-fail-title').addEventListener('click', showMap);
$('#btn-complete-title').addEventListener('click', showMap);

const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE', 'KeyQ'];

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.code === 'Escape' || event.code === 'KeyP') {
    event.preventDefault();
    togglePause();
    return;
  }
  if (event.code === 'KeyM') {
    // M silences everything, or brings it all back.
    const quiet = !(state.save.muted && state.save.musicMuted);
    audio.unlock();
    setSound({ muted: quiet, musicMuted: quiet });
    toastMessage(quiet ? 'SOUND OFF' : 'SOUND ON', 900);
    return;
  }
  const playing = state.world.active && !state.paused && !state.screen && !state.attract;
  if (playing && MOVE_KEYS.includes(event.code)) event.preventDefault();
  state.keys.add(event.code);
});

document.addEventListener('keyup', (event) => state.keys.delete(event.code));
window.addEventListener('blur', () => {
  state.keys.clear();
  if (state.world.active && !state.attract && !state.paused && !state.screen) togglePause(true);
});
window.addEventListener('pointermove', revealCursor, { passive: true });

// Pointer capture can throw for a pointer the browser has already released;
// the control should still respond.
function capture(element, pointerId) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Without capture the control still works while the finger stays on it.
  }
}

// A floating thumbstick: touch anywhere in the pad and drag.
const stick = $('#touch-stick');
const stickKnob = $('#touch-stick i');
let stickPointer = null;
let stickOrigin = null;
function updateStick(event) {
  const dx = event.clientX - stickOrigin.x;
  const dy = event.clientY - stickOrigin.y;
  const span = Math.hypot(dx, dy);
  const limit = 46;
  const scale = span > limit ? limit / span : 1;
  state.touch.x = span > 8 ? clamp(dx / limit, -1, 1) : 0;
  state.touch.y = span > 8 ? clamp(dy / limit, -1, 1) : 0;
  stickKnob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
}
stick.addEventListener('pointerdown', (event) => {
  stickPointer = event.pointerId;
  capture(stick, event.pointerId);
  const rect = stick.getBoundingClientRect();
  stickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  updateStick(event);
  event.preventDefault();
});
stick.addEventListener('pointermove', (event) => {
  if (event.pointerId === stickPointer) updateStick(event);
});
function releaseStick(event) {
  if (event.pointerId !== stickPointer) return;
  stickPointer = null;
  state.touch.x = 0;
  state.touch.y = 0;
  stickKnob.style.transform = '';
}
stick.addEventListener('pointerup', releaseStick);
stick.addEventListener('pointercancel', releaseStick);
for (const button of document.querySelectorAll('[data-hold]')) {
  const key = button.dataset.hold;
  const press = (event) => {
    state.touch[key] = true;
    capture(button, event.pointerId);
    event.preventDefault();
  };
  const release = () => { state.touch[key] = false; };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}

applyPaint();
showTitle();
if (query.has('chapter')) {
  startChapter(clamp(Number(query.get('chapter')) - 1 || 0, 0, CHAPTERS.length - 1), clamp(Number(query.get('job')) - 1 || 0, 0, 2));
}
log.event('game.ready', { stars: state.save.story.stars.flat().reduce((a, b) => a + b, 0), unlocked: state.save.story.unlocked + 1 });
requestAnimationFrame(loop);
