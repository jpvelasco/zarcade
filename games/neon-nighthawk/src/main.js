import { aiInput } from './ai.js';
import { Audio } from './audio.js';
import { DISTRICTS } from './contracts.js';
import { clamp } from './math.js';
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
import { Renderer } from './render.js';
import { CHAPTERS, SPEAKERS } from './story.js';
import { World } from './world.js';

const STORY_SEED = 9417;
const $ = (selector) => document.querySelector(selector);
const screens = [...document.querySelectorAll('.overlay')];
const scene = $('#scene');
const minimap = $('#minimap');
const renderer = new Renderer(scene);
const query = new URLSearchParams(location.search);

const state = {
  save: loadSave(localStorage),
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
const audio = new Audio(state.save.muted);

const hud = $('#hud');
const touch = $('#touch');
const toast = $('#toast');
const comms = $('#comms');
const scanWarning = $('#scan-warning');
const combo = $('#combo');

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

function makeWorld(seed, chapter, { attract = false } = {}) {
  const paint = paintFor(state.save);
  state.world = new World(seed, { chapter, stats: statsFor(state.save.upgrades), paint: paint.color });
  state.attract = attract;
  renderer.camera.ready = false;
  applyPaint();
  window.NN = {
    get world() { return state.world; },
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

function startChapter(chapter) {
  audio.unlock();
  state.chapter = chapter;
  const seed = seedFromCode($('#shift-code').value || query.get('seed'));
  makeWorld(seed, chapter);
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
  hud.classList.remove('hidden');
  if (matchMedia('(pointer: coarse)').matches) touch.classList.remove('hidden');
  $('#hud-scans').classList.toggle('hidden', !state.world.contract.type.scanLimit);
}

function hidePlayUi() {
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
      writeSave(localStorage, state.save);
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
      writeSave(localStorage, state.save);
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
  writeSave(localStorage, state.save);
  updateTitle();
}

const RESULT_TITLES = ['Delivered!', 'Nice ride!', 'Superstar courier!'];

function showDebrief() {
  const result = state.world.currentResult;
  if (!result) return;
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
  $('#failure-title').textContent = ['So close!', 'Oof! Almost!', 'Shake it off!'][state.world.contractIndex % 3];
  $('#failure-copy').textContent = state.world.failure || 'Mara will find another window.';
  showScreen('screen-failed');
}

function showComplete() {
  hidePlayUi();
  const world = state.world;
  const chapter = world.chapter;
  recordChapter(state.save, chapter);
  writeSave(localStorage, state.save);
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
    $('#btn-mute').textContent = `Sound: ${state.save.muted ? 'off' : 'on'}`;
    showScreen('screen-pause');
  } else {
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
    if (event.type === 'radio') commsMessage(event.speaker, event.text);
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

function updateHud() {
  if (hud.classList.contains('hidden')) return;
  const world = state.world;
  const player = world.player;
  const heat = player.heat;
  const [phase, objective, where] = objectiveText(world);
  $('#hud-district').textContent = `${world.contract.district.name.toUpperCase()} · ${world.contract.title.toUpperCase()}`;
  $('#hud-job').textContent = `JOB ${world.contract.job + 1} / 3`;
  const clock = $('#hud-clock');
  clock.textContent = formatTime(world.contract.timeRemaining);
  clock.classList.toggle('low', world.contract.timeRemaining < 10);
  $('#hud-phase').textContent = phase;
  $('#hud-objective').textContent = objective;
  $('#hud-location').textContent = where;
  $('#hud-sparks').textContent = `✦ ${world.sparksTaken} / ${world.contract.sparks.length}`;
  $('#hud-scans').textContent = `SCANS ${world.scans} / ${world.contract.type.scanLimit}`;
  $('#integrity-label').textContent = player.carrying ? 'CARGO' : 'BIKE';
  $('#integrity-value').textContent = `${Math.max(0, Math.round(player.integrity))}%`;
  $('#charge-value').textContent = Math.round(player.charge);
  $('#heat-value').textContent = heat < 18 ? 'LOW' : heat < 42 ? 'WATCHED' : heat < 70 ? 'HOT' : 'LOCKDOWN';
  $('#hud-integrity').style.width = `${clamp(player.integrity, 0, 100)}%`;
  $('#hud-charge').style.width = `${clamp(player.charge / player.maxCharge * 100, 0, 100)}%`;
  $('#hud-heat').style.width = `${heat}%`;
  $('#ab-dash').classList.toggle('ready', player.charge >= world.stats.dashCost);
  $('#ab-pulse').classList.toggle('ready', player.charge >= 28);
  $('#ab-echo').classList.toggle('ready', player.charge >= 43 && player.echoCooldown <= 0);
  scanWarning.classList.toggle('hidden', player.scan < 0.13);
  scanWarning.style.opacity = String(clamp(player.scan * 1.35, 0.25, 1));
  combo.textContent = player.combo > 1 ? `${player.combo}× STYLE CHAIN` : '';
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
  const start = b(9);
  if (start && !state.padStart) {
    if (state.world.active || state.paused) togglePause();
  }
  state.padStart = start;
  return {
    x,
    y,
    dash: b(0) || b(7),
    pulse: b(1),
    echo: b(2),
    drift: b(5) || b(6) || b(4),
  };
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

function frame(now) {
  const dt = Math.min(0.035, Math.max(0, (now - state.lastFrame) / 1000));
  state.lastFrame = now;
  if (state.attract) {
    if (state.world.active) state.world.step(dt, aiInput(state.world));
  } else if (state.world.active && !state.paused && !state.screen) {
    state.world.step(dt, playerInput());
  } else if (!state.attract) {
    gamepadInput(); // still watch Start so a paused game can resume
  }
  processEvents();
  reconcileWorld();
  updateHud();
  renderer.draw(state.world, { attract: state.attract, now });
  if (now > state.toastUntil) toast.classList.remove('show');
  if (now > state.commsUntil) comms.classList.remove('show');
  requestAnimationFrame(frame);
}

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
$('#btn-mute').addEventListener('click', () => {
  state.save.muted = !state.save.muted;
  audio.setMuted(state.save.muted);
  writeSave(localStorage, state.save);
  $('#btn-mute').textContent = `Sound: ${state.save.muted ? 'off' : 'on'}`;
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
    state.save.muted = !state.save.muted;
    audio.setMuted(state.save.muted);
    writeSave(localStorage, state.save);
    toastMessage(state.save.muted ? 'SOUND OFF' : 'SOUND ON', 900);
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
  stick.setPointerCapture(event.pointerId);
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
    button.setPointerCapture?.(event.pointerId);
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
if (query.has('chapter')) startChapter(clamp(Number(query.get('chapter')) - 1 || 0, 0, CHAPTERS.length - 1));
requestAnimationFrame(frame);
