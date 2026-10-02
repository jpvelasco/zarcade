// Browser entry: screens, input, the frame loop, sound, saves and telemetry.
import { ROOM, ROOM_IDS, MODE, MODE_IDS, parTime } from './rooms.js';
import { buildScene, hitTest, remaining, hintArea } from './scene.js';
import { buildDiff, diffHitTest, diffRemaining, diffHintArea } from './modes.js';
import { Game } from './game.js';
import { loadSave, writeSave, clearSave, STORAGE_KEY } from './save.js';
import { ghostsOf } from './ghosts.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Bot, autoplay, autoplayDiff } from './solver.js';
import { dayKey } from './rng.js';
import { frameMonitor } from './perf.js';
import {
  ItemList, renderMap, renderAlbum, renderCabinet, renderHelp, renderResult, renderParty, toast,
} from './ui.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = params.has('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const LANTERN_SECONDS = 15;
const FOG_SECONDS = 0.55;

// --------------------------------------------------------------------- save

const storage = (() => { try { return localStorage; } catch { return null; } })();
if (params.has('fresh')) clearSave(storage);
const loaded = loadSave(storage, (Date.now() % 2147483647) >>> 0);
const game = new Game(loaded.state);
if (params.has('unlock')) {
  for (const id of ROOM_IDS) game.state.rooms[id].find.cleared = true;
}
game.ensureDaily(dayKey());

let saveWarned = false;
function persist() {
  if (writeSave(storage, game.state) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

// -------------------------------------------------------------------- parts

const canvas = $('game');
const renderer = new Renderer(canvas, { reducedMotion: reduced });
const sound = new Sound({ muted: game.state.settings.muted, music: game.state.settings.music });
const list = new ItemList($('list'));

let mode = 'title';          // title | map | play | paused | result | sheet
let round = null;            // the round in progress
let attract = null;          // the demo room behind the title
let attractBot = null;
let lanternCharge = 1;
let fog = 0;
let lastFrame = 0;
let pointerIdle = 0;
let reticle = null;
let keyboardMode = false;
let sheetBack = 'title';

const monitor = frameMonitor({
  log,
  snapshot: () => ({ screen: mode, room: round?.room || attract?.room || 'none', mode: round?.mode || 'none' }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!document.getElementById('telemetry-crash'),
});

// ------------------------------------------------------------------ screens

const OVERLAYS = ['screen-title', 'screen-map', 'screen-sheet', 'screen-result', 'screen-pause'];

function show(id) {
  for (const s of OVERLAYS) $(s).classList.toggle('hidden', s !== id);
  const playing = mode === 'play' || mode === 'paused';
  $('hud').classList.toggle('hidden', !playing);
  $('tray').classList.toggle('hidden', !playing);
  document.body.classList.toggle('titling', !playing);
  sound.setLevel(playing ? 1 : 0.6);
  if (id) $(id).querySelector('.btn.primary, .close-btn')?.focus({ preventScroll: true });
  // Showing or hiding the list tray changes the size of the canvas without a
  // window resize event, so measure again rather than drawing at a stale size.
  measure();
}

// Match the drawing buffer to the canvas and keep the camera sane. Cheap: safe
// to call whenever the layout might have moved.
function measure() {
  const box = renderer.resize();
  renderer.recomputeCover();
  return box;
}

// A real change of shape rebuilds the room; a nudge of a few pixels (a window
// edge dragged, a mobile toolbar sliding away) only moves the camera.
function relayout() {
  const box = measure();
  if (round && !round.done) {
    const change = Math.abs(box.w - round.box.w) / Math.max(1, round.box.w);
    // Differences have no identity across layouts, so once one is found the
    // pictures stay as they are and only the camera adapts to the new shape.
    const keepDiff = round.diff && round.diff.changes.some((c) => c.found);
    if (change > 0.08 && !keepDiff) rebuildRound();
  } else if (!round && attract) {
    startAttract(attract.room);
  }
  queueMicrotask(() => monitor.mark(performance.now()));
}

let relayoutTimer = 0;
function relayoutSoon() {
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(relayout, 160);
}

function toTitle() {
  mode = 'title';
  round = null;
  const next = game.nextThing();
  $('btn-play').textContent = game.restoredCount() ? 'Back to the manor' : 'Knock on the door';
  $('next-hint').textContent = game.state.party
    ? 'Every room is awake. Play any of them again.'
    : `Next: ${ROOM[next.room].name} · ${MODE[next.mode].name}`;
  const bits = game.summary();
  $('title-best').textContent = bits.length ? bits.join(' · ') : 'Nobody has been inside for a hundred years.';
  updateSoundButtons();
  show('screen-title');
  startAttract();
}

function toMap() {
  mode = 'map';
  round = null;
  game.ensureDaily(dayKey());
  const body = $('map-body');
  body.textContent = '';
  body.append(renderMap(game, {
    onPlay: (room, m) => startRound(room, m, false),
    onDaily: playDaily,
    onParty: () => {
      openSheet('The ghosts throw a party', renderParty(game), 'map');
      sound.fanfare();
    },
    dailyPlan: game.dailyPlan(dayKey()),
  }));
  show('screen-map');
}

function openSheet(title, node, back = mode) {
  sheetBack = back === 'sheet' ? sheetBack : back;
  mode = 'sheet';
  $('sheet-title').textContent = title;
  const body = $('sheet-body');
  body.textContent = '';
  body.append(node);
  body.scrollTop = 0;
  show('screen-sheet');
}

function closeSheet() {
  if (sheetBack === 'map') toMap();
  else if (sheetBack === 'paused' && round) { mode = 'paused'; show('screen-pause'); }
  else if (sheetBack === 'play' && round) resume();
  else toTitle();
}

// ------------------------------------------------------------- attract room

function startAttract(roomId = null) {
  const open = game.unlockedRooms();
  const pick = roomId || open[(Date.now() / 9000 | 0) % open.length] || 'library';
  renderer.setSplit(false);
  renderer.onLanded = null;
  const box = measure();
  const scene = buildScene({ room: pick, mode: 'find', seed: 1234 + (Date.now() / 60000 | 0), box });
  attract = scene;
  attractBot = new Bot({ seed: 7, pace: 1.9 });
  renderer.setScene(scene, { light: Math.max(0.55, game.roomLight(pick)) });
  renderer.setProgress(0.4, 1);
}

// ------------------------------------------------------------------- rounds

function startRound(roomId, modeId, daily, plan = null) {
  // Show the playing layout first: the list tray changes the size of the
  // canvas, and the room is built to fit whatever shape is left.
  mode = 'play';
  show(null);
  renderer.setSplit(modeId === 'diff');
  const box = renderer.resize();
  const seed = plan ? plan.seed : game.seedFor(roomId, modeId);
  round = {
    room: roomId, mode: modeId, daily, seed, box,
    scene: null, diff: null, time: 0, hints: 0, misses: 0, found: 0,
    total: 0, mouse: false, done: false, settled: false, grace: 0,
  };
  buildRound();
  attract = null;
  fog = 0;
  setLanternCharge(1);
  reticle = null;
  keyboardMode = false;
  list.build(round);
  updateHud();
  sound.unlock();
  log.event('level.start', { room: roomId, 'play.mode': modeId, daily, seed });
  queueMicrotask(() => monitor.mark(performance.now(), 'room'));
  if (params.has('solve')) queueMicrotask(solveNow);
}

function buildRound(items = null) {
  // A room that has never been cleared is dusty but still readable; clearing
  // its three modes brings it all the way up.
  const light = 0.26 + game.roomLight(round.room) * 0.74;
  if (round.mode === 'diff') {
    round.diff = buildDiff({ room: round.room, seed: round.seed, box: round.box, avoid: hudAvoid(round.box) });
    round.total = round.diff.changes.length;
    renderer.setDiff(round.diff, { light });
  } else {
    round.scene = buildScene({ room: round.room, mode: round.mode, seed: round.seed, box: round.box, items });
    round.total = round.scene.wanted.length;
    renderer.setScene(round.scene, { light });
    // The thank-you noise waits for the thing to reach its ghost; the album
    // itself is updated the moment you find it, so a quick finish still saves.
    renderer.onLanded = () => sound.delivered();
  }
  renderer.setProgress(round.found, round.total);
}

// The corners of each Difference picture that the HUD buttons cover, in room
// units at the starting zoom, so no change is put where it can't be compared.
function hudAvoid(box) {
  const panels = renderer.panels();
  const crect = canvas.getBoundingClientRect();
  const out = [];
  const pad = 10;
  for (const node of document.querySelectorAll('#hud .pill, #hud .icon-btn, #btn-lantern, #arcade-fullscreen')) {
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    for (const p of panels) {
      const s = Math.max(p.w / box.w, p.h / box.h);
      const x0 = Math.max(r.left - crect.left - pad, p.x);
      const x1 = Math.min(r.right - crect.left + pad, p.x + p.w);
      const y0 = Math.max(r.top - crect.top - pad, p.y);
      const y1 = Math.min(r.bottom - crect.top + pad, p.y + p.h);
      if (x1 <= x0 || y1 <= y0) continue;
      out.push({
        x: box.w / 2 + (x0 - (p.x + p.w / 2)) / s,
        y: box.h / 2 + (y0 - (p.y + p.h / 2)) / s,
        w: (x1 - x0) / s,
        h: (y1 - y0) / s,
      });
    }
  }
  return out;
}

// A real change of shape re-lays the room around the same list of things.
// Whatever was already found stays found, matched by what it was rather than by
// position. Difference rounds only get here before anything is found.
function rebuildRound() {
  const foundIds = new Set(round.scene ? round.scene.targets.filter((t) => t.found).map((t) => t.id) : []);
  renderer.setSplit(round.mode === 'diff');
  round.box = measure();
  buildRound(round.scene ? round.scene.wanted.slice() : null);

  if (round.scene) {
    for (const t of round.scene.targets) if (foundIds.has(t.id)) t.found = true;
    if (round.scene.mouse?.found) round.mouse = true;
    round.found = round.scene.targets.filter((t) => t.found && !t.secret).length;
  }

  list.build(round);
  if (round.scene) {
    for (const t of round.scene.targets) if (t.found && !t.secret) list.markFound(t.id);
  }
  renderer.setProgress(round.found, round.total);
  updateHud();
}

function updateHud() {
  if (!round) return;
  $('hud-room').textContent = ROOM[round.room].name;
  $('hud-mode').textContent = MODE[round.mode].short + (round.daily ? ' · daily' : '');
  $('hud-found').textContent = `${round.found}`;
  $('hud-total').textContent = `of ${round.total}`;
  $('hud-time').textContent = formatTime(round.time);
  const par = parTime(round.room, round.mode);
  $('pill-time').classList.toggle('over', round.time > par);
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return m ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
}

// --------------------------------------------------------------- the picking

function pickAt(screenX, screenY) {
  if (!round || mode !== 'play') return;
  if (round.done && !(round.grace > 0)) return;
  if (fog > 0) return;
  const world = renderer.worldAt(screenX, screenY);
  const tol = renderer.tapTolerance();
  // The list is done but the mouse is still out there: only he answers, and a
  // wrong tap in this moment costs nothing at all.
  if (round.done) {
    const m = round.scene?.mouse;
    if (m && !m.found && distanceToMouse(m, world) <= tol) foundTarget(m);
    return;
  }
  if (round.diff) {
    const change = diffHitTest(round.diff, world.x, world.y, tol + 14);
    if (change) return foundChange(change);
    return missed(world);
  }
  const target = hitTest(round.scene, world.x, world.y, tol);
  if (target) return foundTarget(target);
  return missed(world);
}

function distanceToMouse(m, world) {
  return Math.hypot(m.hit.x - world.x, m.hit.y - world.y) - m.hit.r;
}

function foundTarget(target) {
  target.found = true;
  if (target.secret) {
    round.mouse = true;
    renderer.addFlyer(target, ghostsOf(round.room)[0]?.id);
    renderer.sparkle(target.cx, target.cy, 22, '#ffd0e4');
    sound.curio();
    toast($('toasts'), 'You spotted the manor mouse!', 'good');
    log.event('mouse.found', { room: round.room });
    if (round.done && round.grace > 0) { round.grace = 0; settle(); }
    return;
  }
  round.found++;
  if (target.owner) game.returnItem(target.owner);
  list.markFound(target.id);
  renderer.addFlyer(target, target.owner);
  renderer.setProgress(round.found, round.total);
  sound.found(round.found - 1);
  updateHud();
  if (remaining(round.scene) === 0) finish();
}

function foundChange(change) {
  change.found = true;
  round.found++;
  list.markDiff(change.index, round.total);
  renderer.addDiffMark(change);
  renderer.setProgress(round.found, round.total);
  sound.found(round.found - 1);
  updateHud();
  if (diffRemaining(round.diff) === 0) finish();
}

// A wrong tap costs a beat of fog and nothing else.
function missed(world) {
  round.misses++;
  fog = FOG_SECONDS;
  renderer.addPuff(world.x, world.y);
  sound.fog();
  if (round.misses === 6) toast($('toasts'), 'Take your time. Everything is in there somewhere.');
}

function setLanternCharge(value) {
  lanternCharge = Math.min(1, Math.max(0, value));
  const btn = $('btn-lantern');
  btn.style.setProperty('--charge', `${Math.round(lanternCharge * 100)}%`);
  btn.classList.toggle('ready', lanternCharge >= 1);
}

function useLantern() {
  if (!round || mode !== 'play' || round.done) return;
  if (lanternCharge < 1) {
    toast($('toasts'), 'The lantern is still warming up.');
    return;
  }
  // Work out where to shine it before spending it.
  const area = round.diff ? diffHintArea(round.diff) : hintArea(round.scene, list.selected);
  if (!area) return;
  setLanternCharge(0);
  round.hints++;
  renderer.setLantern(area);
  // Look at the hint, so it is useful when zoomed in.
  renderer.camera.cx += (area.x - renderer.camera.cx) * 0.75;
  renderer.camera.cy += (area.y - renderer.camera.cy) * 0.75;
  renderer.clampCamera();
  sound.lantern();
  log.event('hint.used', { room: round.room, 'play.mode': round.mode, hints: round.hints });
}

function finish() {
  if (!round || round.done) return;
  round.done = true;
  renderer.nudge(0.5);
  for (const spot of renderer.ghostSpots) { spot.mood = 1; spot.swirl = 1; }
  // Everything on the list is back, but if the mouse is still hiding you get a
  // couple of seconds to catch him before the card comes up.
  const mouse = round.scene?.mouse;
  if (mouse && !mouse.found) {
    round.grace = 2.8;
    toast($('toasts'), 'Quick — the manor mouse is still in here!');
    return;
  }
  settle();
}

function settle() {
  if (!round || round.settled) return;
  round.settled = true;
  round.grace = 0;
  // A tenth of a second is the fastest a round can be recorded as: the debug
  // solver finishes instantly and a zero best time would read as no time at all.
  const seconds = Math.max(0.1, Math.round(round.time * 10) / 10);
  const out = game.finishRound({
    room: round.room, mode: round.mode, seconds,
    hints: round.hints, misses: round.misses, found: round.found,
    daily: round.daily, mouse: round.mouse,
  });
  out.seconds = seconds;
  out.hints = round.hints;
  out.found = round.found;
  out.mouse = round.mouse;
  out.daily = round.daily;
  persist();
  log.event('level.complete', {
    room: round.room, 'play.mode': round.mode, stars: out.stars,
    seconds, hints: round.hints, misses: round.misses, daily: round.daily,
  });
  for (let i = 0; i < out.stars; i++) setTimeout(() => sound.star(i), 260 + i * 220);
  if (out.party) setTimeout(() => sound.fanfare(), 900);
  else if (out.curios.length) setTimeout(() => sound.curio(), 700);
  // Hold on to this round: the player can leave during the pause before the
  // card, and a card for a round nobody is playing any more must not appear.
  const mine = round;
  setTimeout(() => { if (round === mine) showResult(out, mine); }, 1100);
}

function showResult(out, forRound = round) {
  if (!forRound) return;
  round = forRound;
  mode = 'result';
  const body = $('result-body');
  body.textContent = '';
  body.append(renderResult(out, round, game));
  const next = game.nextThing();
  $('result-next').textContent = out.party
    ? 'See the party'
    : next.room === round.room
      ? `Next: ${MODE[next.mode].name}`
      : `Next: ${ROOM[next.room].name}`;
  $('result-next').onclick = () => {
    if (out.party && !game.state.seen.party) {
      game.state.seen.party = true;
      persist();
      openSheet('The ghosts throw a party', renderParty(game), 'map');
      sound.fanfare();
      return;
    }
    startRound(next.room, next.mode, false);
  };
  show('screen-result');
}

function quitRound() {
  // Finished but still waiting for the mouse? Record it before leaving.
  if (round?.done && !round.settled) settle();
  else if (round && !round.done) {
    log.event('round.quit', { room: round.room, 'play.mode': round.mode, found: round.found, total: round.total });
  }
  round = null;
  toMap();
}

function playDaily() {
  const key = dayKey();
  game.ensureDaily(key);
  const plan = game.dailyPlan(key);
  startRound(plan.room, plan.mode, true, plan);
}

// ----------------------------------------------------------------- autoplay

function solveNow() {
  if (!round) return;
  if (round.diff) {
    const order = autoplayDiff(round.diff).found;
    for (const c of order) round.diff.changes[c].found = false;
    for (const c of order) foundChange(round.diff.changes[c]);
  } else {
    const order = autoplay(round.scene).found;
    const targets = order.map((id) => round.scene.targets.find((x) => x.id === id)).filter(Boolean);
    for (const t of targets) t.found = false;
    for (const t of targets) foundTarget(t);
  }
}

const autopilot = params.has('autopilot') ? new Bot({ seed: 42, pace: 1.1 }) : null;

// -------------------------------------------------------------------- input

let drag = null;
let pinch = null;

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'play') return;
  canvas.setPointerCapture?.(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, t: performance.now() };
  keyboardMode = false;
  renderer.setReticle(null);
  sound.unlock();
});

// Any movement shows the pointer again, over the list and buttons too.
addEventListener('pointermove', () => {
  pointerIdle = 0;
  document.body.classList.remove('no-cursor');
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.moved > 8) renderer.panBy(dx, dy);
  drag.x = e.clientX;
  drag.y = e.clientY;
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const quick = performance.now() - drag.t < 700;
  if (drag.moved <= 10 && quick) {
    const rect = canvas.getBoundingClientRect();
    pickAt(e.clientX - rect.left, e.clientY - rect.top);
  }
  drag = null;
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { drag = null; });

canvas.addEventListener('wheel', (e) => {
  if (mode !== 'play' || !e.deltaY) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  renderer.zoomBy(e.deltaY < 0 ? 1.14 : 1 / 1.14, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });

// Pinch to lean in, on touch screens.
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    drag = null;
    const [a, b] = e.touches;
    pinch = { d: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)), zoom: renderer.camera.zoom };
  }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  if (pinch && e.touches.length === 2) {
    e.preventDefault();
    const [a, b] = e.touches;
    const d = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
    const rect = canvas.getBoundingClientRect();
    renderer.setZoom(pinch.zoom * (d / pinch.d), (a.clientX + b.clientX) / 2 - rect.left, (a.clientY + b.clientY) / 2 - rect.top);
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });

// --- keyboard

function moveReticle(dx, dy, dt) {
  if (!round) return;
  const box = round.box;
  if (!reticle) {
    const c = renderer.camera;
    reticle = { x: c.cx, y: c.cy };
  }
  const speed = 620 * dt;
  reticle.x = Math.min(box.w - 8, Math.max(8, reticle.x + dx * speed));
  reticle.y = Math.min(box.h - 8, Math.max(8, reticle.y + dy * speed));
  keyboardMode = true;
  renderer.setReticle(reticle);
  // Keep the ring in view.
  const p = renderer.panels()[0];
  const s = renderer.scale;
  const halfW = p.w / (2 * s) - 40;
  const halfH = p.h / (2 * s) - 40;
  renderer.camera.cx = Math.min(Math.max(renderer.camera.cx, reticle.x - halfW), reticle.x + halfW);
  renderer.camera.cy = Math.min(Math.max(renderer.camera.cy, reticle.y - halfH), reticle.y + halfH);
  renderer.clampCamera();
}

const held = new Set();

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  const lower = k.toLowerCase();
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(k)) {
    // Steering wins while playing. If the player had tabbed into the list, let
    // go of that focus so the ring keeps moving.
    if (mode === 'play' && (document.activeElement === document.body || $('tray').contains(document.activeElement))) {
      if (document.activeElement !== document.body) document.activeElement.blur();
      held.add(lower);
      e.preventDefault();
      return;
    }
  }
  if (lower === 'm') { toggleSound(); return; }
  if (k === 'Escape' || lower === 'p') {
    e.preventDefault();
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
    else if (mode === 'sheet') closeSheet();
    else if (mode === 'map') toTitle();
    return;
  }
  if (mode !== 'play') {
    // Only when nothing else has focus, so Tab and Enter still work the buttons.
    if (mode === 'title' && (k === 'Enter' || k === ' ') && document.activeElement === document.body) {
      e.preventDefault();
      toMap();
    }
    return;
  }
  if (lower === 'h') { e.preventDefault(); useLantern(); return; }
  if (k === '+' || k === '=') { renderer.zoomBy(1.2); return; }
  if (k === '-' || k === '_') { renderer.zoomBy(1 / 1.2); return; }
  if (k === '0') { renderer.setZoom(1); return; }
  if (k === '[' || k === ']') {
    e.preventDefault();
    list.step(k === '[' ? -1 : 1);
    return;
  }
  // Enter on a focused button belongs to that button; with nothing focused it
  // picks up whatever the spotting ring is over.
  if ((k === 'Enter' || k === ' ') && document.activeElement === document.body) {
    e.preventDefault();
    if (!reticle) { moveReticle(0, 0, 0); return; }
    const p = renderer.screenAt(reticle.x, reticle.y, 0);
    pickAt(p.x, p.y);
  }
});

addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
addEventListener('blur', () => held.clear());

// ---------------------------------------------------------------- the chrome

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  $('pause-stats').textContent = `${ROOM[round.room].name} · ${MODE[round.mode].name} · ${round.found} of ${round.total} found`;
  updateSoundButtons();
  show('screen-pause');
}

function resume() {
  if (!round) { toMap(); return; }
  mode = 'play';
  show(null);
}

function toggleSound() {
  const on = game.state.settings.muted;
  game.state.settings.muted = !on;
  sound.setMuted(!on);
  updateSoundButtons();
  persist();
}

function toggleMusic() {
  game.state.settings.music = !game.state.settings.music;
  sound.setMusic(game.state.settings.music);
  updateSoundButtons();
  persist();
}

function updateSoundButtons() {
  const muted = game.state.settings.muted;
  const music = game.state.settings.music;
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = music ? '🎵 Music on' : '🎵 Music off';
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
}

$('btn-play').onclick = () => { sound.unlock(); toMap(); };
$('btn-title-album').onclick = () => openSheet('Ghost friends', renderAlbum(game), 'title');
$('btn-title-cabinet').onclick = () => openSheet('Curio cabinet', renderCabinet(game), 'title');
$('btn-title-help').onclick = () => openSheet('How to play', renderHelp(), 'title');
$('btn-map-album').onclick = () => openSheet('Ghost friends', renderAlbum(game), 'map');
$('btn-map-cabinet').onclick = () => openSheet('Curio cabinet', renderCabinet(game), 'map');
$('btn-map-help').onclick = () => openSheet('How to play', renderHelp(), 'map');
$('btn-map-title').onclick = toTitle;
$('sheet-close').onclick = closeSheet;
$('btn-pause').onclick = pause;
$('btn-mute').onclick = toggleSound;
$('btn-resume').onclick = resume;
$('btn-pause-map').onclick = quitRound;
$('btn-pause-help').onclick = () => openSheet('How to play', renderHelp(), 'paused');
$('btn-lantern').onclick = useLantern;
$('btn-zoom-in').onclick = () => renderer.zoomBy(1.25);
$('btn-zoom-out').onclick = () => renderer.zoomBy(1 / 1.25);
$('result-again').onclick = () => {
  // Again on today's room plays today's room again, not a normal round of a
  // room that may still be locked.
  if (round.daily) playDaily();
  else startRound(round.room, round.mode, false);
};
$('result-map').onclick = toMap;
for (const b of document.querySelectorAll('[data-sound]')) b.onclick = toggleSound;
for (const b of document.querySelectorAll('[data-music]')) b.onclick = toggleMusic;

addEventListener('resize', relayoutSoon);
addEventListener('orientationchange', () => setTimeout(relayout, 160));
// The tray and the overlays resize the canvas through CSS, with no resize
// event: watch the element itself.
if (typeof ResizeObserver === 'function') {
  let first = true;
  new ResizeObserver(() => {
    if (first) { first = false; return; }
    relayoutSoon();
  }).observe(canvas);
}
document.addEventListener('visibilitychange', () => {
  monitor.reset(performance.now());
  if (document.visibilityState === 'hidden' && mode === 'play') pause();
});
setInterval(() => monitor.check(performance.now()), 1000);

// Another tab saved: take its progress, so this tab never writes a stale copy
// over it (whichever tab saved last used to win). A round in progress carries
// on and records into the fresh copy when it ends.
addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY && e.key !== null) return;
  game.state = loadSave(storage, game.state.seed).state;
  game.ensureDaily(dayKey());
  sound.setMuted(game.state.settings.muted);
  sound.setMusic(game.state.settings.music);
  updateSoundButtons();
  if (mode === 'title') toTitle();
  else if (mode === 'map') toMap();
});

// ----------------------------------------------------------------- the loop

function frame(now) {
  const dt = Math.min(0.05, lastFrame ? (now - lastFrame) / 1000 : 0.016);
  lastFrame = now;
  monitor.frame(now);
  sound.tick();

  if (renderer.baking) renderer.stepBake(9);

  // keyboard steering
  if (mode === 'play' && held.size) {
    const dx = (held.has('arrowright') || held.has('d') ? 1 : 0) - (held.has('arrowleft') || held.has('a') ? 1 : 0);
    const dy = (held.has('arrowdown') || held.has('s') ? 1 : 0) - (held.has('arrowup') || held.has('w') ? 1 : 0);
    if (dx || dy) moveReticle(dx, dy, dt);
  }

  if (mode === 'play' && round && round.done && round.grace > 0) {
    round.grace -= dt;
    if (round.grace <= 0) settle();
  }

  if (mode === 'play' && round && !round.done) {
    round.time += dt;
    if (fog > 0) fog = Math.max(0, fog - dt);
    if (lanternCharge < 1) setLanternCharge(lanternCharge + dt / LANTERN_SECONDS);
    if ((round.time | 0) !== (lastShownTime | 0)) {
      lastShownTime = round.time;
      updateHud();
    }
    if (autopilot) {
      const open = round.scene ? round.scene.targets.filter((t) => !t.found) : [];
      const click = autopilot.step(dt, open);
      if (click) {
        const p = renderer.screenAt(click.x, click.y, 0);
        pickAt(p.x, p.y);
      } else if (round.diff) {
        const ch = round.diff.changes.find((c) => !c.found);
        if (ch && Math.random() < dt * 0.9) foundChange(ch);
      }
    }
    pointerIdle += dt;
    if (pointerIdle > 2 && !document.body.classList.contains('no-cursor')) document.body.classList.add('no-cursor');
  } else if (pointerIdle > 0) {
    pointerIdle = 0;
    document.body.classList.remove('no-cursor');
  }

  // the title screen's demo room keeps searching itself
  if ((mode === 'title' || mode === 'map' || mode === 'sheet') && attract) {
    const open = attract.targets.filter((t) => !t.found);
    const click = attractBot.step(dt, open);
    if (click) {
      const t = open.find((o) => Math.hypot(o.hit.x - click.x, o.hit.y - click.y) < 2);
      if (t) {
        t.found = true;
        renderer.addFlyer(t, t.owner);
        renderer.setProgress(attract.targets.filter((x) => x.found && !x.secret).length, attract.wanted.length);
      }
    }
    if (!open.length) startAttract();
  }

  renderer.update(dt);
  renderer.draw();
  requestAnimationFrame(loop);
}

let lastShownTime = 0;
const loop = telemetry ? telemetry.guard(frame, 'spooky-spotter.frame') : frame;

// --------------------------------------------------------------------- boot

if (params.has('crash')) {
  let once = true;
  const orig = renderer.draw.bind(renderer);
  renderer.draw = (...args) => {
    if (once) { once = false; throw new Error('spooky-spotter: forced crash'); }
    return orig(...args);
  };
}

measure();
if (params.has('room')) {
  const roomId = ROOM[params.get('room')] ? params.get('room') : 'library';
  const modeId = MODE_IDS.includes(params.get('mode')) ? params.get('mode') : 'find';
  const seed = parseInt(params.get('seed'), 10);
  const plan = Number.isFinite(seed) ? { seed: seed >>> 0 } : null;
  show(null);
  startRound(roomId, modeId, false, plan);
} else {
  toTitle();
}

// A small hook for the browser checks, only when a debug parameter is present:
// it lets a test script ask where things are instead of guessing.
if (['room', 'autopilot', 'solve', 'probe', 'unlock'].some((k) => params.has(k))) {
  window.spookyDebug = {
    get round() { return round; },
    get screen() { return mode; },
    game,
    renderer,
    // Screen coordinates of a thing still to find, relative to the canvas.
    spot(index = 0) {
      const t = round?.scene?.targets.filter((x) => !x.found)[index];
      if (!t) return null;
      const p = renderer.screenAt(t.hit.x, t.hit.y, 0);
      const rect = canvas.getBoundingClientRect();
      return { id: t.id, x: rect.left + p.x, y: rect.top + p.y, secret: !!t.secret };
    },
    change(index = 0, panel = 0) {
      const c = round?.diff?.changes.filter((x) => !x.found)[index];
      if (!c) return null;
      const p = renderer.screenAt(c.cx, c.cy, panel);
      const rect = canvas.getBoundingClientRect();
      return { index: c.index, type: c.type, x: rect.left + p.x, y: rect.top + p.y };
    },
    emptySpot() {
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.97 };
    },
    state: () => ({
      screen: mode, found: round?.found, total: round?.total, misses: round?.misses,
      hints: round?.hints, time: round?.time, lantern: lanternCharge, fog,
      zoom: renderer.camera.zoom, cam: { ...renderer.camera }, box: round?.box,
      baking: renderer.baking, particles: renderer.particles.length,
    }),
    fill(charge = 1) { lanternCharge = charge; },
  };
}

log.event('game.ready', {
  rooms: game.restoredCount(),
  stars: game.totalStars(),
  curios: game.curioCount(),
  reduced,
  fresh: loaded.fresh,
});
if (loaded.broken) log.warn('save.unreadable', {});

requestAnimationFrame(loop);
