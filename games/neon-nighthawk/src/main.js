import { aiInput } from './ai.js';
import { Audio } from './audio.js';
import { formatClock, clamp } from './math.js';
import {
  PAINTS,
  UPGRADES,
  buyUpgrade,
  loadSave,
  paintFor,
  recordDelivery,
  statsFor,
  upgradeCost,
  writeSave,
} from './progress.js';
import { Renderer } from './render.js';
import { World } from './world.js';

const $ = (selector) => document.querySelector(selector);
const screens = [...document.querySelectorAll('.overlay')];
const scene = $('#scene');
const minimap = $('#minimap');
const renderer = new Renderer(scene);
const query = new URLSearchParams(location.search);

const state = {
  save: loadSave(localStorage),
  world: null,
  screen: 'screen-title',
  garageReturn: 'title',
  paused: false,
  autopilot: query.has('autopilot'),
  keys: new Set(),
  touch: { turn: 0, brake: false, dash: false, pulse: false, echo: false },
  lastFrame: performance.now(),
  toastUntil: 0,
  cursorTimer: 0,
};
const audio = new Audio(state.save.muted);

const hud = $('#hud');
const touch = $('#touch');
const toast = $('#toast');
const scanWarning = $('#scan-warning');
const combo = $('#combo');

function randomSeed() {
  const value = new Uint32Array(1);
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(value);
    return value[0] || 1;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function seedFromCode(code) {
  const clean = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean) return randomSeed();
  const parsed = Number.parseInt(clean, 36);
  return Number.isFinite(parsed) && parsed > 0 ? parsed >>> 0 : randomSeed();
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

function makeWorld(seed) {
  const paint = paintFor(state.save);
  state.world = new World(seed, { stats: statsFor(state.save.upgrades), paint: paint.color });
  renderer.camera.ready = false;
  applyPaint();
  window.NN = {
    get world() { return state.world; },
    newShift: startShift,
    save: state.save,
  };
  return state.world;
}

function showScreen(id) {
  state.screen = id || null;
  for (const screen of screens) screen.classList.toggle('hidden', screen.id !== id);
}

function showTitle() {
  state.paused = false;
  hidePlayUi();
  makeWorld(randomSeed());
  $('#shift-code').value = query.get('seed') ? codeFor(seedFromCode(query.get('seed'))) : '';
  updateTitle();
  showScreen('screen-title');
}

function startShift() {
  audio.unlock();
  const seed = seedFromCode($('#shift-code').value || query.get('seed'));
  makeWorld(seed);
  showBriefing();
}

function showBriefing() {
  const { contract } = state.world;
  hidePlayUi();
  $('#briefing-job').textContent = `JOB ${String(contract.index + 1).padStart(2, '0')} / 05 · ${contract.district.name}`;
  $('#briefing-title').textContent = `${contract.type.label}: ${contract.type.name}`;
  $('#briefing-client').textContent = contract.type.client;
  $('#briefing-blurb').textContent = contract.type.blurb;
  $('#briefing-pickup').textContent = contract.pickupName;
  $('#briefing-drop').textContent = contract.deliveryName;
  $('#briefing-condition').textContent = contract.type.condition;
  const minutes = Math.floor(contract.timeLimit / 60);
  const seconds = String(contract.timeLimit % 60).padStart(2, '0');
  $('#briefing-time').textContent = `${minutes}:${seconds} WINDOW`;
  showScreen('screen-briefing');
}

function launchContract() {
  audio.unlock();
  state.world.startContract();
  state.paused = false;
  showScreen(null);
  hud.classList.remove('hidden');
  if (matchMedia('(pointer: coarse)').matches) touch.classList.remove('hidden');
  revealCursor();
  toastMessage('MARA: Channel is open. Make it look easy.', 2800);
}

function hidePlayUi() {
  hud.classList.add('hidden');
  touch.classList.add('hidden');
  document.body.classList.remove('cursor-hidden');
}

function showGarage(from) {
  state.garageReturn = from;
  hidePlayUi();
  updateGarage();
  showScreen('screen-garage');
}

function closeGarage() {
  if (state.garageReturn === 'briefing') showBriefing();
  else if (state.garageReturn === 'debrief') showDebrief();
  else showTitle();
}

function updateTitle() {
  const { credits, bestScore, bestContracts } = state.save;
  const pilot = state.autopilot ? ' · AUTOPILOT READY' : '';
  $('#title-stats').textContent = `${credits.toLocaleString()} credits · best shift ${bestScore.toLocaleString()} · ${bestContracts}/5 contracts${pilot}`;
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

function recordResult() {
  const result = state.world.currentResult;
  if (!result || result.recorded) return;
  recordDelivery(state.save, result);
  result.recorded = true;
  writeSave(localStorage, state.save);
  updateTitle();
}

function showDebrief() {
  const result = state.world.currentResult;
  if (!result) return;
  recordResult();
  hidePlayUi();
  $('#result-title').textContent = result.integrity >= 86 ? 'Clean handoff.' : 'The handoff held.';
  $('#result-earned').textContent = `+ ${result.earned.toLocaleString()} credits`;
  const lines = [
    ['Contract', result.contract.type.label],
    ['Time bonus', `+${result.timeBonus}`],
    ['Style bonus', `+${result.styleBonus}`],
    ['Heat multiplier', `×${result.heatMultiplier.toFixed(2)}`],
    ['Cargo condition', `${result.integrity}%`],
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
  $('#result-total').textContent = `Shift total: ${result.shiftTotal.toLocaleString()} credits`;
  $('#btn-next').innerHTML = result.final ? 'Bring in dawn <span>→</span>' : 'Next contract <span>→</span>';
  showScreen('screen-debrief');
}

function showFailure() {
  hidePlayUi();
  $('#failure-title').textContent = state.world.player.carrying ? 'The handoff failed.' : 'The city caught up.';
  $('#failure-copy').textContent = state.world.failure || 'Mara will find another window.';
  showScreen('screen-failed');
}

function showComplete() {
  hidePlayUi();
  const world = state.world;
  $('#complete-total').textContent = `${world.totalCredits.toLocaleString()} credits moved`;
  $('#complete-copy').textContent = `Five contracts through a city that learned your name. Best shift: ${state.save.bestScore.toLocaleString()} credits.`;
  showScreen('screen-complete');
}

function togglePause(force) {
  if (!state.world.active && !state.paused) return;
  const next = typeof force === 'boolean' ? force : !state.paused;
  state.paused = next;
  if (next) {
    hidePlayUi();
    $('#btn-mute').textContent = `Sound: ${state.save.muted ? 'off' : 'on'}`;
    showScreen('screen-pause');
  } else {
    showScreen(null);
    hud.classList.remove('hidden');
    if (matchMedia('(pointer: coarse)').matches) touch.classList.remove('hidden');
    revealCursor();
  }
}

function toastMessage(message, duration = 1600) {
  toast.textContent = message;
  state.toastUntil = performance.now() + duration;
  toast.classList.add('show');
}

function processEvents() {
  const { world } = state;
  for (const event of world.events.splice(0)) {
    audio.event(event);
    if (event.type === 'pickup') toastMessage('CARGO SECURED — DROP BEACON UPDATED', 2100);
    if (event.type === 'dash') toastMessage('DASH', 550);
    if (event.type === 'pulse') toastMessage(event.jammed ? `PULSE — ${event.jammed} PATROL${event.jammed === 1 ? '' : 'S'} JAMMED` : 'PULSE SENT', 1200);
    if (event.type === 'echo') toastMessage('ECHO OUT — LET THEM CHASE THE LIGHT', 1500);
    if (event.type === 'near-miss') toastMessage(`${event.combo}× CLOSE CALL`, 900);
    if (event.type === 'scan') toastMessage(event.harm ? 'SCANNED — CARGO CORRUPTED' : 'SCANNED — HEAT RISING', 1550);
    if (event.type === 'flux') toastMessage('FLUX SHIELD ABSORBED THE HIT', 1350);
    if (event.type === 'notice') toastMessage(event.text, 1350);
  }
}

function reconcileWorld() {
  if (state.world.status === 'debrief' && state.screen !== 'screen-debrief' && state.screen !== 'screen-garage') showDebrief();
  if (state.world.status === 'failed' && state.screen !== 'screen-failed') showFailure();
  if (state.world.status === 'shift-complete' && state.screen !== 'screen-complete') showComplete();
}

function updateHud() {
  if (hud.classList.contains('hidden')) return;
  const world = state.world;
  const player = world.player;
  const pickup = world.status === 'pickup';
  const heat = player.heat;
  $('#hud-job').textContent = `JOB ${String(world.contract.index + 1).padStart(2, '0')} / 05`;
  $('#hud-clock').textContent = formatClock(world.nightTime);
  $('#hud-phase').textContent = pickup ? 'PICKUP WINDOW OPEN' : 'CARGO IN TRANSIT';
  $('#hud-objective').textContent = pickup ? 'Reach the pickup beacon' : 'Deliver the package';
  $('#hud-location').textContent = pickup ? world.contract.pickupName : world.contract.deliveryName;
  $('#integrity-label').textContent = pickup ? 'BIKE' : 'CARGO';
  $('#integrity-value').textContent = `${Math.max(0, Math.round(player.integrity))}%`;
  $('#charge-value').textContent = Math.round(player.charge);
  $('#heat-value').textContent = heat < 18 ? 'LOW' : heat < 42 ? 'WATCHED' : heat < 70 ? 'HOT' : 'LOCKDOWN';
  $('#hud-integrity').style.width = `${clamp(player.integrity, 0, 100)}%`;
  $('#hud-charge').style.width = `${clamp(player.charge / player.maxCharge * 100, 0, 100)}%`;
  $('#hud-heat').style.width = `${heat}%`;
  scanWarning.classList.toggle('hidden', player.scan < 0.13);
  scanWarning.style.opacity = String(clamp(player.scan * 1.35, 0.25, 1));
  combo.textContent = player.combo > 1 ? `${player.combo}× STYLE CHAIN` : '';
  renderer.drawMiniMap(minimap, world);
}

function gamepadInput() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = [...pads].find(Boolean);
  if (!pad) return {};
  return {
    turn: Math.abs(pad.axes[0] || 0) > 0.16 ? pad.axes[0] : 0,
    brake: (pad.buttons[6]?.value || 0) > 0.25 || (pad.buttons[7]?.value || 0) > 0.25,
    dash: !!pad.buttons[0]?.pressed,
    pulse: !!pad.buttons[1]?.pressed,
    echo: !!pad.buttons[2]?.pressed,
  };
}

function playerInput() {
  if (state.autopilot) return aiInput(state.world);
  const left = state.keys.has('ArrowLeft') || state.keys.has('KeyA');
  const right = state.keys.has('ArrowRight') || state.keys.has('KeyD');
  const pad = gamepadInput();
  return {
    turn: clamp((right ? 1 : 0) - (left ? 1 : 0) + state.touch.turn + (pad.turn || 0), -1, 1),
    brake: state.keys.has('ArrowDown') || state.keys.has('KeyS') || state.touch.brake || pad.brake,
    dash: state.keys.has('Space') || state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || state.touch.dash || pad.dash,
    pulse: state.keys.has('KeyE') || state.touch.pulse || pad.pulse,
    echo: state.keys.has('KeyQ') || state.touch.echo || pad.echo,
  };
}

function revealCursor() {
  document.body.classList.remove('cursor-hidden');
  window.clearTimeout(state.cursorTimer);
  if (state.world.active && !state.paused && !state.screen) {
    state.cursorTimer = window.setTimeout(() => document.body.classList.add('cursor-hidden'), 1800);
  }
}

function frame(now) {
  const dt = Math.min(0.035, Math.max(0, (now - state.lastFrame) / 1000));
  state.lastFrame = now;
  if (state.world.active && !state.paused && !state.screen) state.world.step(dt, playerInput());
  processEvents();
  reconcileWorld();
  updateHud();
  renderer.draw(state.world);
  if (now > state.toastUntil) toast.classList.remove('show');
  requestAnimationFrame(frame);
}

$('#btn-start').addEventListener('click', startShift);
$('#btn-garage').addEventListener('click', () => showGarage('title'));
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
$('#btn-quit').addEventListener('click', showTitle);
$('#btn-next').addEventListener('click', () => {
  state.world.nextContract();
  if (state.world.status === 'shift-complete') showComplete();
  else showBriefing();
});
$('#btn-retry').addEventListener('click', () => {
  state.world.retryContract();
  showBriefing();
});
$('#btn-fail-title').addEventListener('click', showTitle);
$('#btn-new-shift').addEventListener('click', startShift);
$('#btn-complete-title').addEventListener('click', showTitle);

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.code === 'Escape') {
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
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyA', 'KeyD', 'KeyS', 'KeyE', 'KeyQ'].includes(event.code)) {
    event.preventDefault();
  }
  state.keys.add(event.code);
});

document.addEventListener('keyup', (event) => state.keys.delete(event.code));
window.addEventListener('blur', () => {
  state.keys.clear();
  if (state.world.active && !state.paused) togglePause(true);
});
window.addEventListener('pointermove', revealCursor, { passive: true });

const steer = $('#touch-steer');
const steerKnob = $('#touch-steer i');
let steeringPointer = null;
function updateTouchSteer(event) {
  const rect = steer.getBoundingClientRect();
  const raw = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.32), -1, 1);
  state.touch.turn = raw;
  steerKnob.style.transform = `translateX(${raw * 32}px)`;
}
steer.addEventListener('pointerdown', (event) => {
  steeringPointer = event.pointerId;
  steer.setPointerCapture(event.pointerId);
  updateTouchSteer(event);
  event.preventDefault();
});
steer.addEventListener('pointermove', (event) => {
  if (event.pointerId === steeringPointer) updateTouchSteer(event);
});
function releaseSteer(event) {
  if (event.pointerId !== steeringPointer) return;
  steeringPointer = null;
  state.touch.turn = 0;
  steerKnob.style.transform = '';
}
steer.addEventListener('pointerup', releaseSteer);
steer.addEventListener('pointercancel', releaseSteer);
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
requestAnimationFrame(frame);
