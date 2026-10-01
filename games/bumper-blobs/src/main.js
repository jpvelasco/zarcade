// Browser entry: screens, the join flow, the fixed-step loop, input, sound,
// saves and telemetry. All rules live in the DOM-free modules.
import { Match, cleanSettings } from './match.js';
import { World } from './world.js';
import { Bot } from './ai.js';
import { Renderer, SoftBody } from './render.js';
import { Input, deviceLabel, deviceHelp } from './input.js';
import { Sound } from './audio.js';
import { ARENAS, arenaById } from './arenas.js';
import { STEP, MODE_INFO, MODES, ROUND, BOT_LEVELS } from './config.js';
import { loadSave, writeSave, recordMatch, COLORS, FACES, HATS, TROPHIES, hatUnlocked, nextHat } from './save.js';
import { frameMonitor } from './perf.js';
import { hashSeed } from './rng.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
let saveWarned = false;
function persist() {
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}
if (params.has('mode') && MODES.includes(params.get('mode'))) save.settings.mode = params.get('mode');
if (params.has('arena') && arenaById(params.get('arena'))) save.settings.arena = params.get('arena');
if (params.has('bots')) save.settings.bots = Math.max(0, Math.min(3, parseInt(params.get('bots'), 10) || 0));
if (params.has('skill') && BOT_LEVELS.includes(params.get('skill'))) save.settings.botLevel = params.get('skill');
save.settings = cleanSettings(save.settings);

const canvas = $('game');
const renderer = new Renderer(canvas, { reducedMotion: reduced });
renderer.setCoarse(coarse);
const input = new Input();
const sound = new Sound({ muted: save.muted, music: save.music });
input.bindTouch({ zone: $('stick-zone'), base: $('stick-base'), knob: $('stick-knob'), dash: $('btn-tdash'), pound: $('btn-tpound') });

const SCREENS = ['screen-title', 'screen-setup', 'screen-join', 'screen-howto', 'screen-collection', 'screen-pause', 'screen-round', 'screen-podium'];
const MENU_MODES = ['title', 'setup', 'join', 'howto', 'collection'];
const autopilot = params.has('autopilot');
// Debug: ?speed=4 fast-forwards the simulation (handy for checking results screens).
const simSpeed = Math.max(0.25, Math.min(8, Number(params.get('speed')) || 1));
let seedBase = params.has('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : (Date.now() >>> 0);

let mode = 'title';
let backTo = 'title';
let attract = null; // { world, bots }
let game = null; // { match, world, devices, bots, humans, players, labels, outro, roundTimer }
let accumulator = 0;
const humanControls = [];

// ------------------------------------------------------------ screens

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const playing = mode === 'play' || mode === 'round';
  $('hud').classList.toggle('hidden', !playing && mode !== 'paused');
  input.captureKeys = mode === 'play' || mode === 'join';
  input.clear();
  updateTouch();
  if (id && mode !== 'join') {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .btn:not([disabled])');
    if (first && !coarse) first.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(mode === 'play' ? 1 : mode === 'paused' ? 0.3 : 0.6);
  sound.setCrowd(mode === 'play' ? 1 : mode === 'podium' ? 1.4 : 0.35);
}

function updateTouch() {
  const touchPlayer = !!game && game.devices.some((d) => d === 'touch' || (d === 'solo' && coarse));
  $('touch').classList.toggle('hidden', !(mode === 'play' && touchPlayer && coarse));
  if (mode !== 'play') input.resetTouch();
}

function ensureAttract() {
  if (attract && attract.world.phase !== 'done') return;
  const arena = ARENAS[Math.floor(Math.random() * ARENAS.length)];
  const players = [0, 1, 2, 3].map((i) => ({ name: COLORS[i * 2 % 8].name, look: { color: (i * 2 + (i > 1 ? 1 : 0)) % 8, face: (i * 3) % FACES.length, hat: [1, 4, 6, 10][i] }, bot: 'normal' }));
  const seed = (Math.random() * 1e9) >>> 0;
  const world = new World({ arena: arena.id, mode: 'lbs', players, seed });
  attract = { world, bots: players.map((p, i) => new Bot(i, i === 0 ? 'hard' : 'normal', seed + i)) };
  renderer.reset(world);
}

function toMenu(next) {
  mode = next;
  if (!game) ensureAttract();
  showScreen(`screen-${next}`);
}

function toTitle() {
  game = null;
  mode = 'title';
  ensureAttract();
  const nh = nextHat(save);
  $('title-stars').textContent = `★ ${save.stars} stars · ${HATS.filter((h) => h.stars <= save.stars).length}/${HATS.length} hats${nh ? ` · next hat at ★ ${nh.stars}` : ''}`;
  updateSoundButtons();
  showScreen('screen-title');
}

// ------------------------------------------------------------ setup

function chip(label, on, onClick, extra = '') {
  const b = document.createElement('button');
  b.className = `chip${on ? ' on' : ''} ${extra}`;
  b.textContent = label;
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.addEventListener('click', () => { sound.click(); onClick(); renderSetup(b.textContent); });
  return b;
}

function renderSetup(focusLabel) {
  const s = save.settings;
  const modeBox = $('opt-mode');
  modeBox.innerHTML = '';
  const icons = { lbs: '🏆', koth: '👑', coins: '🪙' };
  for (const m of MODES) {
    const b = document.createElement('button');
    b.className = `mode-card${s.mode === m ? ' on' : ''}`;
    b.setAttribute('aria-pressed', s.mode === m ? 'true' : 'false');
    b.innerHTML = `<i aria-hidden="true">${icons[m]}</i><b>${MODE_INFO[m].name}</b>${MODE_INFO[m].blurb}`;
    b.addEventListener('click', () => { sound.click(); s.mode = m; persist(); renderSetup(); b.focus(); focusMode(m); });
    modeBox.appendChild(b);
  }
  $('goal-label').textContent = `First to (${MODE_INFO[s.mode].unit})`;
  const t = $('opt-target'); t.innerHTML = '';
  for (const v of MODE_INFO[s.mode].targets) t.appendChild(chip(String(v), s.target[s.mode] === v, () => { s.target[s.mode] = v; persist(); }));
  const bots = $('opt-bots'); bots.innerHTML = '';
  for (const v of [0, 1, 2, 3]) bots.appendChild(chip(v === 0 ? 'None' : String(v), s.bots === v, () => { s.bots = v; persist(); }));
  const sk = $('opt-skill'); sk.innerHTML = '';
  for (const v of BOT_LEVELS) sk.appendChild(chip(v[0].toUpperCase() + v.slice(1), s.botLevel === v, () => { s.botLevel = v; persist(); }));
  const ex = $('opt-extras'); ex.innerHTML = '';
  ex.appendChild(chip(`Power-ups ${s.powerups ? 'on' : 'off'}`, s.powerups, () => { s.powerups = !s.powerups; persist(); }));
  ex.appendChild(chip(`Bombs ${s.hazards ? 'on' : 'off'}`, s.hazards, () => { s.hazards = !s.hazards; persist(); }));
  const ar = $('opt-arena'); ar.innerHTML = '';
  ar.appendChild(chip('Mix them up', s.arena === 'cycle', () => { s.arena = 'cycle'; persist(); }));
  ar.appendChild(chip('Random', s.arena === 'random', () => { s.arena = 'random'; persist(); }));
  for (const a of ARENAS) ar.appendChild(chip(a.name, s.arena === a.id, () => { s.arena = a.id; persist(); }));
  const sel = arenaById(s.arena);
  $('arena-blurb').textContent = sel ? `${sel.name}: ${sel.blurb}` : s.arena === 'cycle' ? 'A different arena every round.' : 'Any arena, any time!';
  if (focusLabel) {
    const again = [...$('screen-setup').querySelectorAll('.chip')].find((c) => c.textContent === focusLabel || c.textContent.split(' ')[0] === focusLabel.split(' ')[0]);
    again?.focus({ preventScroll: true });
  }
}

function focusMode(m) {
  const cards = $('opt-mode').querySelectorAll('.mode-card');
  cards[MODES.indexOf(m)]?.focus({ preventScroll: true });
}

// ------------------------------------------------------------ join

const join = { slots: [], startT: -1 };
const JOIN_DEVICES = ['k0', 'k1', 'k2', 'k3', 'p0', 'p1', 'p2', 'p3'];
let slotsDirty = true;

function toJoin() {
  join.slots = [];
  join.startT = -1;
  slotsDirty = true;
  toMenu('join');
  const keys = 'Keys: <b>WASD</b>+Space · <b>Arrows</b>+Enter · <b>IJKL</b>+U · <b>Numpad</b>+0 · or a gamepad <b>A</b>';
  $('join-keys').innerHTML = coarse ? 'Tap <b>Join</b> to play with touch, or press a gamepad button.' : `${keys}<br>In your card: ◀ ▶ colour · ▲ ▼ hat · pound key face · press your dash key again when ready`;
  updateJoinStatus();
}

function takenColors(except) {
  return new Set(join.slots.filter((s) => s !== except).map((s) => s.look.color));
}

function joinDevice(device) {
  if (join.slots.length >= 4 || join.slots.some((s) => s.device === device)) return;
  const idx = join.slots.length;
  const saved = save.looks[idx] || { color: idx, face: 0, hat: 0 };
  const look = { ...saved };
  if (!hatUnlocked(save, look.hat)) look.hat = 0;
  const taken = takenColors(null);
  while (taken.has(look.color)) look.color = (look.color + 1) % COLORS.length;
  join.slots.push({ device, look, ready: false, soft: new SoftBody() });
  join.slots[join.slots.length - 1].soft.squash(6);
  slotsDirty = true;
  sound.unlock();
  sound.join();
  log.event('player.join', { device: device === 'touch' ? 'touch' : device[0] === 'p' ? 'gamepad' : 'keyboard', slot: idx + 1 });
  updateJoinStatus();
}

function leaveSlot(slot) {
  join.slots.splice(join.slots.indexOf(slot), 1);
  slotsDirty = true;
  updateJoinStatus();
}

function cycleColor(slot, d) {
  const taken = takenColors(slot);
  let c = slot.look.color;
  for (let k = 0; k < COLORS.length; k++) { c = (c + d + COLORS.length) % COLORS.length; if (!taken.has(c)) break; }
  slot.look.color = c;
  slot.soft.squash(4);
  slotsDirty = true;
}

function cycleHat(slot, d) {
  let h = slot.look.hat;
  for (let k = 0; k < HATS.length; k++) { h = (h + d + HATS.length) % HATS.length; if (hatUnlocked(save, h)) break; }
  slot.look.hat = h;
  slot.soft.squash(4);
  slotsDirty = true;
}

function cycleFace(slot, d) {
  slot.look.face = (slot.look.face + d + FACES.length) % FACES.length;
  slot.soft.wobble(0.5);
  slotsDirty = true;
}

function toggleReady(slot) {
  slot.ready = !slot.ready;
  if (slot.ready) { slot.soft.squash(7); sound.join(); } else sound.click();
  slotsDirty = true;
  updateJoinStatus();
}

function botCount() {
  const humans = join.slots.length;
  let bots = Math.min(save.settings.bots, 4 - humans);
  if (humans + bots < 2) bots = 2 - humans;
  return bots;
}

function botLook(i, used) {
  let color = 0;
  while (used.has(color)) color++;
  used.add(color);
  return { color, face: (i * 3 + 1) % FACES.length, hat: [4, 6, 8, 1][i % 4] };
}

function renderSlots() {
  const box = $('slots');
  box.innerHTML = '';
  const used = new Set(join.slots.map((s) => s.look.color));
  const nBots = botCount();
  for (let i = 0; i < 4; i++) {
    const slot = join.slots[i];
    const el = document.createElement('div');
    if (slot) {
      const col = COLORS[slot.look.color];
      el.className = `slot joined${slot.ready ? ' ready' : ''}`;
      el.style.setProperty('--slot', col.body);
      const help = deviceHelp(slot.device);
      el.innerHTML = `<span class="badge">P${i + 1}</span><span class="who">${col.name}</span><span class="dev">${deviceLabel(slot.device)} · dash ${help.dash}</span>`;
      const cv = document.createElement('canvas');
      cv.width = 200; cv.height = 200;
      slot.canvas = cv;
      el.appendChild(cv);
      const row = (label, value, fn) => {
        const r = document.createElement('div');
        r.className = 'pick';
        const a = document.createElement('button'); a.className = 'arrow'; a.textContent = '◀'; a.tabIndex = -1; a.setAttribute('aria-label', `Previous ${label}`);
        const b = document.createElement('button'); b.className = 'arrow'; b.textContent = '▶'; b.tabIndex = -1; b.setAttribute('aria-label', `Next ${label}`);
        const s = document.createElement('span'); s.textContent = value;
        a.addEventListener('click', () => { fn(-1); sound.click(); });
        b.addEventListener('click', () => { fn(1); sound.click(); });
        r.append(a, s, b);
        el.appendChild(r);
      };
      row('colour', col.name, (d) => cycleColor(slot, d));
      row('face', FACES[slot.look.face], (d) => cycleFace(slot, d));
      row('hat', HATS[slot.look.hat].name, (d) => cycleHat(slot, d));
      const rb = document.createElement('button');
      rb.className = `btn small ready-btn${slot.ready ? ' primary' : ''}`;
      rb.tabIndex = -1;
      rb.textContent = slot.ready ? 'Ready! ✓' : `Ready? (${help.dash})`;
      rb.addEventListener('click', () => toggleReady(slot));
      el.appendChild(rb);
    } else if (i < join.slots.length + nBots) {
      const look = botLook(i, used);
      el.className = 'slot bot';
      el.innerHTML = `<span class="badge" style="background:#a08cc0">BOT</span><span class="who">${COLORS[look.color].name}</span><span class="dev">${save.settings.botLevel} bot</span>`;
      const cv = document.createElement('canvas');
      cv.width = 200; cv.height = 200;
      el.appendChild(cv);
      el.botCanvas = cv;
      el.botLook = look;
      el.insertAdjacentHTML('beforeend', '<span class="empty-text"><small>Press a button to take this seat</small></span>');
    } else {
      el.className = 'slot';
      el.innerHTML = `<span class="empty-text">Press a button<br>to join!<small>${coarse ? '' : 'Space · Enter · U · Numpad 0 · gamepad A'}</small></span>`;
    }
    if (!slot && coarse && !join.slots.some((s) => s.device === 'touch') && i === join.slots.length) {
      const tb = document.createElement('button');
      tb.className = 'btn primary';
      tb.textContent = 'Tap to join';
      tb.addEventListener('click', () => joinDevice('touch'));
      el.appendChild(tb);
    }
    box.appendChild(el);
  }
  // Bot previews are static; draw them once.
  for (const el of box.querySelectorAll('.slot.bot')) renderer.drawPreview(el.botCanvas, el.botLook, new SoftBody(), 0, { bob: false });
  slotsDirty = false;
}

function updateJoinStatus() {
  const humans = join.slots.length;
  const ready = join.slots.filter((s) => s.ready).length;
  let text;
  if (!humans) text = coarse ? 'Tap Join to play!' : 'Waiting for players…';
  else if (ready < humans) text = `${ready}/${humans} ready · ${coarse ? 'tap Ready or Start' : "press your dash button when you're ready"}`;
  else text = 'Everyone is ready!';
  $('join-status').textContent = text;
  $('btn-start').disabled = humans === 0;
}

function updateJoin(dt) {
  for (const d of JOIN_DEVICES) {
    const slot = join.slots.find((s) => s.device === d);
    const pad = d[0] === 'p';
    if (input.take(d, 'dash')) { if (!slot) joinDevice(d); else toggleReady(slot); }
    if (!slot) { input.take(d, 'pound'); continue; }
    if (input.take(d, 'left')) cycleColor(slot, -1);
    if (input.take(d, 'right')) cycleColor(slot, 1);
    if (input.take(d, 'up')) cycleHat(slot, 1);
    if (input.take(d, 'down')) cycleHat(slot, -1);
    if (pad) {
      if (input.take(d, 'face')) cycleFace(slot, 1);
      if (input.take(d, 'hat')) cycleHat(slot, 1);
      if (input.take(d, 'back')) { input.take(d, 'pound'); leaveSlot(slot); continue; }
      input.take(d, 'pound');
      if (input.take(d, 'start')) startFromJoin();
    } else if (input.take(d, 'pound')) cycleFace(slot, 1);
  }
  if (slotsDirty) renderSlots();
  for (const s of join.slots) {
    s.soft.update(dt, 0);
    if (s.canvas) renderer.drawPreview(s.canvas, s.look, s.soft, renderer.time + s.look.color, { mood: s.ready ? '' : '' });
  }
  const all = join.slots.length > 0 && join.slots.every((s) => s.ready);
  if (all) {
    if (join.startT < 0) join.startT = 1.2;
    join.startT -= dt;
    $('join-status').textContent = `Get ready… ${Math.max(1, Math.ceil(join.startT))}`;
    if (join.startT <= 0) startFromJoin();
  } else if (join.startT >= 0) { join.startT = -1; updateJoinStatus(); }
}

function startFromJoin() {
  if (!join.slots.length) { $('join-status').textContent = coarse ? 'Tap Join first!' : 'Press a button to join first!'; return; }
  const used = new Set(join.slots.map((s) => s.look.color));
  const players = join.slots.map((s, i) => {
    save.looks[i] = { ...s.look };
    return { device: s.device, look: { ...s.look }, bot: null };
  });
  const nBots = botCount();
  for (let i = 0; i < nBots; i++) players.push({ device: null, look: botLook(players.length, used), bot: save.settings.botLevel });
  persist();
  beginMatch(players);
}

// ------------------------------------------------------------ match flow

function startQuick() {
  sound.unlock();
  const look = { ...save.looks[0] };
  if (!hatUnlocked(save, look.hat)) look.hat = 0;
  const used = new Set([look.color]);
  const players = [{ device: 'solo', look, bot: null }];
  for (let i = 1; i < 4; i++) players.push({ device: null, look: botLook(i, used), bot: save.settings.botLevel });
  beginMatch(players);
}

function beginMatch(players) {
  sound.unlock();
  const humans = players.map((p, i) => (p.device ? i : -1)).filter((i) => i >= 0);
  let n = 0;
  const labels = players.map((p) => (p.device ? `P${++n}` : 'BOT'));
  const mplayers = players.map((p) => ({ name: COLORS[p.look.color].name, look: p.look, bot: p.bot }));
  seedBase = hashSeed(seedBase, 77);
  const match = new Match(save.settings, mplayers, seedBase);
  game = {
    match, players, humans, labels,
    devices: players.map((p) => p.device),
    world: null, bots: [], outro: 0, roundTimer: 0, roundStart: 0,
  };
  attract = null;
  log.event('match.start', { mode: match.mode, humans: humans.length, bots: players.length - humans.length, 'bot.level': save.settings.botLevel, target: match.target, arena: save.settings.arena });
  startRound();
}

function startRound() {
  const g = game;
  g.world = g.match.nextRound();
  g.bots = g.players.map((p, i) => (p.bot || (autopilot && p.device) ? new Bot(i, p.bot || 'hard', hashSeed(g.match.seed, g.match.round, i)) : null));
  g.outro = 0;
  g.roundStart = performance.now();
  renderer.reset(g.world);
  sound.setSong(ARENAS.indexOf(g.world.arenaDef));
  accumulator = 0;
  mode = 'play';
  buildHud();
  showScreen(null);
  queueMicrotask(() => monitor.mark(performance.now()));
  log.event('level.start', { round: g.match.round, arena: g.world.arenaDef.id, mode: g.match.mode, players: g.players.length, humans: g.humans.length });
}

function nameOf(i) {
  const g = game;
  return `${g.labels[i] === 'BOT' ? '' : `${g.labels[i]} `}${COLORS[g.players[i].look.color].name}`;
}

function onRoundDone() {
  const g = game, w = g.world;
  const res = w.result;
  if (res.winner >= 0) {
    const col = COLORS[w.blobs[res.winner].look.color];
    renderer.announce(`${col.name.toUpperCase()} WINS!`, col.light, { size: 1.1, life: ROUND.outro });
    w.blobs[res.winner] && renderer.softs[res.winner]?.squash(8);
  } else renderer.announce('DRAW!', '#ffffff', { size: 1.2, life: ROUND.outro });
  g.outro = ROUND.outro;
}

function finishRound() {
  const g = game, w = g.world, m = g.match;
  const out = m.endRound(w);
  const winnerKind = out.roundWinner < 0 ? 'draw' : g.humans.includes(out.roundWinner) ? 'human' : 'bot';
  const seconds = Math.round(w.t);
  log.event('level.complete', { round: m.round, arena: w.arenaDef.id, mode: m.mode, winner: winnerKind, seconds, bonks: w.blobs.reduce((n, b) => n + b.stats.bonks, 0) });
  if (g.humans.length && winnerKind !== 'human') log.event('level.fail', { round: m.round, arena: w.arenaDef.id, mode: m.mode, reason: winnerKind });
  if (m.over) return toPodium();
  mode = 'round';
  const r = out.roundWinner;
  $('round-title').textContent = r >= 0 ? `${nameOf(r)} wins round ${m.round}!` : `Round ${m.round} is a draw!`;
  renderBoard($('round-board'), m.rankWins(), (i) => `${m.wins[i]}/${m.target}`, (i) => `${m.totals[i].ringouts} KOs`, r);
  g.roundTimer = 4;
  $('round-next').textContent = '';
  showScreen('screen-round');
  $('btn-next-round').focus({ preventScroll: true });
}

function renderBoard(box, order, score, sub, highlight) {
  box.innerHTML = '';
  order.forEach((i, k) => {
    const p = game.players[i];
    const line = document.createElement('div');
    line.className = `line${i === highlight ? ' win' : ''}`;
    const cv = document.createElement('canvas');
    cv.width = 72; cv.height = 72;
    renderer.drawPreview(cv, p.look, new SoftBody(), 0, { bob: false });
    line.innerHTML = `<span class="place">${k + 1}</span>`;
    line.appendChild(cv);
    line.insertAdjacentHTML('beforeend', `<span class="nm">${nameOf(i)}</span><span class="st">${sub(i)}</span><span class="sc">${score(i)}</span>`);
    box.appendChild(line);
  });
}

function toPodium() {
  const g = game, m = g.match;
  mode = 'podium';
  const looks = g.players.map((p) => p.look);
  renderer.startPodium(m.ranking, looks, g.world.arenaDef);
  sound.fanfare(true);
  const reward = recordMatch(save, m, g.humans);
  persist();
  const w = m.winner;
  $('podium-title').textContent = `${nameOf(w)} is the Blob Champion!`;
  const score = m.mode === 'lbs' ? (i) => `${m.wins[i]} ${m.wins[i] === 1 ? 'win' : 'wins'}` : (i) => `${m.scores[i]} ${MODE_INFO[m.mode].unit}`;
  renderBoard($('podium-board'), m.ranking, score, (i) => `${m.totals[i].bonks} bonks · ${m.totals[i].ringouts} KOs`, w);
  const bits = [];
  if (reward.stars) bits.push(`+${reward.stars} ★`);
  for (const t of reward.newTrophies) bits.push(`🏆 ${t.name}`);
  for (const h of reward.newHats) bits.push(`New hat: ${h.name}!`);
  $('podium-reward').textContent = bits.join(' · ');
  const winnerKind = g.humans.includes(w) ? 'human' : 'bot';
  log.event('match.complete', { mode: m.mode, winner: winnerKind, rounds: m.round, stars: reward.stars, trophies: reward.newTrophies.length, humans: g.humans.length });
  for (const t of reward.newTrophies) log.event('trophy.unlocked', { trophy: t.id });
  showScreen('screen-podium');
  queueMicrotask(() => monitor.mark(performance.now(), 'podium'));
}

// ------------------------------------------------------------ HUD

let hudCache = [];
function buildHud() {
  const g = game;
  const left = $('chips-left'), right = $('chips-right');
  left.innerHTML = ''; right.innerHTML = '';
  hudCache = [];
  g.players.forEach((p, i) => {
    const col = COLORS[p.look.color];
    const el = document.createElement('div');
    el.className = 'chip-p';
    el.style.setProperty('--c', col.body);
    const cv = document.createElement('canvas');
    cv.width = 80; cv.height = 80;
    renderer.drawPreview(cv, p.look, new SoftBody(), 0, { bob: false });
    const info = document.createElement('div');
    info.innerHTML = `<div class="nm">${g.labels[i]} · ${col.name}</div><div class="sc">0</div>`;
    if (g.match.mode === 'lbs') {
      const pips = document.createElement('div');
      pips.className = 'pips';
      for (let k = 0; k < g.match.target; k++) pips.appendChild(document.createElement('i'));
      info.appendChild(pips);
    }
    el.append(cv, info);
    (i < 2 ? left : right).appendChild(el);
    hudCache.push({ el, sc: info.querySelector('.sc'), pips: info.querySelector('.pips'), last: null, out: null, lead: null });
  });
  const info = MODE_INFO[g.match.mode];
  $('hud-goal').textContent = g.match.mode === 'lbs' ? `Round ${g.match.round} · first to ${g.match.target}` : `${info.short} · first to ${g.match.target}`;
  hudTimerLast = null;
}

let hudTimerLast = null;
function updateHud() {
  const g = game, w = g.world, m = g.match;
  let best = -1;
  for (let i = 0; i < w.blobs.length; i++) best = Math.max(best, m.score(i, w));
  for (let i = 0; i < w.blobs.length; i++) {
    const h = hudCache[i], b = w.blobs[i];
    const s = m.score(i, w);
    if (s !== h.last) {
      h.last = s;
      h.sc.textContent = m.mode === 'lbs' ? (b.eliminated ? 'OUT' : `${s} ${s === 1 ? 'win' : 'wins'}`) : String(s);
      if (h.pips) [...h.pips.children].forEach((pip, k) => pip.classList.toggle('on', k < s));
    }
    const out = b.out || b.falling;
    if (out !== h.out) {
      h.out = out;
      h.el.classList.toggle('out', out);
      if (m.mode === 'lbs') h.sc.textContent = out ? 'OUT' : `${s} ${s === 1 ? 'win' : 'wins'}`;
    }
    const lead = m.mode !== 'lbs' && s > 0 && s === best;
    if (lead !== h.lead) { h.lead = lead; h.el.classList.toggle('lead', lead); }
  }
  let text;
  const left = w.timeLeft();
  if (w.phase === 'countdown') text = 'Get ready!';
  else if (m.mode === 'lbs' && w.sudden) text = 'SUDDEN DEATH';
  else if (w.overtime) text = 'OVERTIME';
  else text = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  if (text !== hudTimerLast) {
    hudTimerLast = text;
    $('hud-timer').textContent = text;
    $('hud-info').classList.toggle('urgent', (left < 10 && w.phase === 'play') || w.sudden || w.overtime);
  }
}

// ------------------------------------------------------------ collection

function toCollection() {
  backTo = mode === 'collection' ? backTo : mode;
  toMenu('collection');
  $('coll-stars').textContent = `★ ${save.stars}`;
  const grid = $('hat-grid');
  grid.innerHTML = '';
  HATS.forEach((h, i) => {
    const el = document.createElement('div');
    const open = hatUnlocked(save, i);
    el.className = `hat${open ? '' : ' locked'}`;
    const cv = document.createElement('canvas');
    cv.width = 180; cv.height = 180;
    renderer.drawPreview(cv, { color: save.looks[0].color, face: 0, hat: i }, new SoftBody(), 0, { bob: false });
    el.appendChild(cv);
    el.insertAdjacentHTML('beforeend', `${h.name}<small>${open ? 'Unlocked' : `🔒 ★ ${h.stars}`}</small>`);
    grid.appendChild(el);
  });
  const tg = $('trophy-grid');
  tg.innerHTML = '';
  for (const t of TROPHIES) {
    const got = save.trophies.includes(t.id);
    tg.insertAdjacentHTML('beforeend', `<div class="trophy${got ? ' got' : ''}"><i>🏆</i><div><b>${t.name}</b><span>${t.text}</span></div></div>`);
  }
  const s = save.stats;
  const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
  $('stat-line').textContent = [n(s.matches, 'match', 'matches'), n(s.wins, 'win', 'wins'), n(s.roundWins, 'round won', 'rounds won'), n(s.bonks, 'bonk', 'bonks'), n(s.ringouts, 'knock-off', 'knock-offs'), n(s.pounds, 'pound', 'pounds'), n(s.coins, 'coin', 'coins')].join(' · ');
}

// ------------------------------------------------------------ pause & sound

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  updateSoundButtons();
  showScreen('screen-pause');
  $('hud').classList.remove('hidden');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  showScreen(null);
}

function updateSoundButtons() {
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = save.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = save.music ? '🎵 Music on' : '🎵 Music off';
  $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', save.muted ? 'Unmute' : 'Mute');
}

function toggleMute() {
  save.muted = !save.muted;
  sound.unlock();
  sound.setMuted(save.muted);
  persist();
  updateSoundButtons();
}

function toggleMusic() {
  save.music = !save.music;
  sound.unlock();
  sound.setMusic(save.music);
  persist();
  updateSoundButtons();
}

// ------------------------------------------------------------ wiring

$('btn-party').addEventListener('click', () => { sound.unlock(); backTo = 'title'; mode = 'setup'; renderSetup(); toMenu('setup'); });
$('btn-quick').addEventListener('click', startQuick);
$('btn-collection').addEventListener('click', () => { backTo = 'title'; toCollection(); });
$('btn-howto').addEventListener('click', () => { backTo = 'title'; toMenu('howto'); });
$('btn-to-join').addEventListener('click', () => { sound.click(); toJoin(); });
$('btn-start').addEventListener('click', () => { for (const s of join.slots) s.ready = true; startFromJoin(); });
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => { if (game) beginMatch(game.players); });
$('btn-quit').addEventListener('click', toTitle);
$('btn-pause').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-next-round').addEventListener('click', () => { if (mode === 'round') startRound(); });
$('btn-rematch').addEventListener('click', () => { if (game) beginMatch(game.players); });
$('btn-newmatch').addEventListener('click', () => { game = null; mode = 'setup'; renderSetup(); toMenu('setup'); });
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', toTitle);
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', back);
addEventListener('resize', () => { renderer.resize(); if (game) buildHud(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

function back() {
  sound.click();
  if (mode === 'paused') resume();
  else if (mode === 'join') { mode = 'setup'; renderSetup(); toMenu('setup'); }
  else if (mode === 'setup' || mode === 'howto') toTitle();
  else if (mode === 'collection') toTitle();
  else if (mode === 'podium') toTitle();
}

// Arrow keys / d-pad move focus between buttons in menus.
function moveFocus(dir) {
  const screen = SCREENS.map($).find((s) => !s.classList.contains('hidden'));
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not([disabled]), a[href]')].filter((el) => el.offsetParent !== null && el.tabIndex >= 0);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
}
addEventListener('keydown', (e) => {
  if (mode === 'play' || mode === 'join') return;
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
});

// Hide the pointer after ~2 s without movement during play.
let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

// ------------------------------------------------------------ loop

const monitor = frameMonitor({
  log,
  snapshot: () => {
    const w = game ? game.world : attract?.world;
    return { mode, arena: w ? w.arenaDef.id : 'none', round: game ? game.match.round : 0, blobs: w ? w.blobs.length : 0, particles: renderer.particles.filter((p) => p.on).length };
  },
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

const logoSoft = new SoftBody();
let logoT = 0;

function stepWorld(world, dt, controlsFor) {
  accumulator += dt * simSpeed;
  let first = true;
  while (accumulator >= STEP) {
    const c = controlsFor(first);
    world.step(STEP, c);
    first = false;
    accumulator -= STEP;
  }
}

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.pollPads();
  updatePointer(dt);

  const esc = input.takeKey('Escape');
  const pPressed = input.takeKey('KeyP');
  const padStart = JOIN_DEVICES.some((d) => d[0] === 'p' && mode !== 'join' && input.take(d, 'start'));
  if (esc || pPressed || padStart) {
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
    else if (esc) back();
  }
  if (input.takeKey('KeyM')) toggleMute();
  if (mode !== 'play' && mode !== 'join') {
    // Gamepad menu navigation.
    for (const d of ['p0', 'p1', 'p2', 'p3']) {
      if (input.take(d, 'up') || input.take(d, 'left')) moveFocus(-1);
      if (input.take(d, 'down') || input.take(d, 'right')) moveFocus(1);
      if (input.take(d, 'dash')) document.activeElement?.click?.();
      if (input.take(d, 'back')) back();
    }
  }

  if (mode === 'join') updateJoin(dt);

  if (game && (mode === 'play' || mode === 'round')) {
    const g = game, w = g.world;
    if (mode === 'play') {
      for (let i = 0; i < g.players.length; i++) {
        if (g.bots[i] || !g.devices[i]) continue;
        humanControls[i] = input.read(g.devices[i], humanControls[i]);
      }
      stepWorld(w, dt, (first) => {
        const out = [];
        for (let i = 0; i < g.players.length; i++) {
          if (g.bots[i]) out[i] = g.bots[i].controls(w, STEP);
          else {
            const c = humanControls[i];
            out[i] = first ? c : { mx: c.mx, my: c.my, dash: c.dash, pound: false };
          }
        }
        return out;
      });
      // Phones in portrait: follow the touch player a little closer.
      const solo = g.humans.length === 1 && coarse && innerHeight > innerWidth ? w.blobs[g.humans[0]] : null;
      renderer.setFocus(solo && !solo.out ? solo : null);
      renderer.handleEvents(w.events, w);
      sound.handle(w.events, w);
      w.events.length = 0;
      if (w.phase === 'done') {
        if (g.outro === 0) onRoundDone();
        g.outro -= dt * simSpeed;
        if (g.outro <= 0) finishRound();
      }
    } else {
      g.roundTimer -= dt;
      $('round-next').textContent = `Next round in ${Math.max(1, Math.ceil(g.roundTimer))}…`;
      if (input.takeAny('dash')) g.roundTimer = 0;
      if (g.roundTimer <= 0) startRound();
    }
    if (game && game.world) updateHud();
  } else if (MENU_MODES.includes(mode) && attract) {
    renderer.setFocus(null);
    const a = attract;
    stepWorld(a.world, dt, () => a.bots.map((b) => b.controls(a.world, STEP)));
    renderer.handleEvents(a.world.events, a.world);
    a.world.events.length = 0;
    // Let the winner bounce for a few seconds, then start another demo round.
    if (a.world.phase === 'done' && a.world.clock > a.world.t + ROUND.countdown + 3) ensureAttract();
  }

  if (mode === 'podium') renderer.drawPodium(dt);
  else {
    const w = game ? game.world : attract?.world;
    if (w) {
      if (mode !== 'paused') renderer.update(dt, w);
      renderer.draw(w, { tags: !!game, labels: game ? game.labels : null });
    }
  }
  if (mode === 'title') {
    logoT += dt;
    logoSoft.update(dt, 0);
    if (Math.floor(logoT * 0.7) !== Math.floor((logoT - dt) * 0.7)) logoSoft.squash(-6);
    renderer.drawPreview($('logo-blob'), { color: 6, face: 0, hat: 1 }, logoSoft, logoT);
  }
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture.
const loop = telemetry ? telemetry.guard(frame, 'bumper-blobs.frame') : frame;

if (location.protocol !== 'file:') {
  log.event('game.ready', { stars: save.stars, matches: save.stats.matches, trophies: save.trophies.length, touch: coarse });
  updateSoundButtons();
  if (params.has('quick')) startQuick();
  else if (params.has('demo')) {
    const used = new Set();
    beginMatch([0, 1, 2, 3].map((i) => ({ device: null, look: botLook(i, used), bot: ['easy', 'normal', 'normal', 'hard'][i] })));
  } else if (params.has('setup')) { mode = 'setup'; renderSetup(); toMenu('setup'); }
  else if (params.has('join')) { mode = 'setup'; toJoin(); }
  else toTitle();
  requestAnimationFrame(loop);
}

window.BB = {
  get world() { return game ? game.world : attract?.world; },
  get game() { return game; },
  get mode() { return mode; },
  save, renderer, input, sound, startQuick, beginMatch, toTitle,
};
