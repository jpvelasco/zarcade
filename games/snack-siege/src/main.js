// Browser entry: screens, the fixed-step loop, input, sound, saves and
// telemetry. Game rules live in game.js; drawing in render.js.
import { Game, pullToVelocity } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { candidates, searchShots } from './ai.js';
import { TICK, MAX_PULL, BEANS, WORLDS, BEAN_BONUS } from './config.js';
import { LEVELS, LEVELS_PER_WORLD, dailyLevel, levelLabel } from './levels.js';
import {
  loadSave, writeSave, recordClear, recordFail, canSkip, skipLevel, isUnlocked, nextLevel, totalStars, worldStars,
  SKINS, skinUnlocked, needText, freshSkins, markSkinsSeen, chooseSkin, skinOf, dailyState, recordDaily, LEVEL_COUNT,
} from './progress.js';
import { dateKey } from './rng.js';
import { bakeSling, bakeBean } from './sprites.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const canvas = $('game');
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
let saveWarned = false;
function persist() {
  // ?autopilot is a browser check: its runs must not land in the real save.
  if (params.has('autopilot')) return;
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const renderer = new Renderer(canvas, { reducedMotion: reduced });
let game = null;
const input = new Input(canvas, renderer, () => (game ? game.state : 'none'));
const sound = new Sound({ muted: save.muted, music: save.music });

let mode = 'title'; // title | map | skins | bean | play | paused | win | lose
let current = { index: 0, daily: false };
let isAttract = false;
let attractTimer = 0;
let attractShot = null;
let accumulator = 0;
let shotTicks = 0;
let endTimer = 0;
let endHandled = false;
let sparePopped = 0;
let pendingBeanCards = [];
let restarts = 0;
let mapWorld = 0;
let levelStartAt = 0;
const today = params.get('date') || dateKey();
const autopilot = params.has('autopilot') ? { search: null, best: null, shot: null, wait: 0 } : null;

const SCREENS = ['screen-title', 'screen-map', 'screen-skins', 'screen-bean', 'screen-pause', 'screen-win', 'screen-lose'];

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', !(mode === 'play' || mode === 'paused'));
  input.enabled = mode === 'play';
  if (mode !== 'play') $('power-hint').classList.add('hidden');
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .level-node.next:not([disabled]), .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(mode === 'play' ? 1 : mode === 'paused' ? 0.3 : 0.55);
}

function levelFor(cur) {
  return cur.daily ? dailyLevel(today) : LEVELS[cur.index];
}

function load(level, { intro = true } = {}) {
  game = new Game(level);
  renderer.setLevel(game, skinOf(save), { intro });
  renderer.prebake(game);
  renderer.hideQueue = 0;
  sound.setWorld(level.world);
  accumulator = 0;
  shotTicks = 0;
  queueMicrotask(() => monitor.mark(performance.now(), 'level'));
}

// ------------------------------------------------------------ attract demo

function startAttract() {
  isAttract = true;
  const pool = Math.max(1, Math.min(LEVEL_COUNT, nextLevel(save) + 1));
  const i = Math.floor(Math.random() * pool);
  load(LEVELS[i], { intro: false });
  attractTimer = 0;
  attractShot = null;
}

function stepAttract(dt) {
  if (!game) return;
  attractTimer += dt;
  if (game.state === 'aim' && attractTimer > 2.2) {
    const list = candidates(game);
    if (list.length) {
      attractShot = list[Math.floor(Math.random() * list.length)];
      game.launch(attractShot.vx, attractShot.vy);
      shotTicks = 0;
    }
    attractTimer = 0;
  }
  if ((game.state === 'won' || game.state === 'lost') && attractTimer > 2.5) startAttract();
}

// ------------------------------------------------------------ title

function toTitle() {
  mode = 'title';
  if (!isAttract || !game) startAttract();
  const next = nextLevel(save);
  const started = totalStars(save) > 0 || Object.keys(save.skipped).length > 0;
  $('btn-play').textContent = started ? `Play · ${levelLabel(next)} ${LEVELS[next].name}` : 'Play';
  const stars = totalStars(save);
  const ds = dailyState(save, today);
  const bits = [`★ ${stars} / ${LEVEL_COUNT * 3}`];
  if (save.pops) bits.push(`${save.pops.toLocaleString('en-US')} bears popped`);
  if (ds.streak > 0) bits.push(`daily streak ${ds.streak}`);
  $('title-best').textContent = started || save.pops ? bits.join(' · ') : '';
  updateDailyButtons();
  $('skins-badge').classList.toggle('hidden', freshSkins(save).length === 0);
  updateSoundButtons();
  showScreen('screen-title');
}

function updateDailyButtons() {
  const ds = dailyState(save, today);
  const label = `📅 Daily fort${ds.cleared ? ' ✓' : ''}${ds.streak > 1 ? ` · ${ds.streak} days` : ''}`;
  $('btn-daily').textContent = label;
  $('btn-map-daily').textContent = label;
}

// ------------------------------------------------------------ level map

const WIDE_PATH = [[8, 72], [18, 46], [28, 72], [38, 48], [46, 24], [56, 44], [64, 70], [72, 46], [80, 22], [88, 42], [92, 68], [80, 82]];
const TALL_PATH = [[18, 10], [50, 12], [82, 18], [72, 34], [42, 32], [16, 40], [24, 58], [54, 54], [84, 62], [74, 80], [44, 78], [16, 88]];

function toMap(world = null) {
  sound.unlock();
  if (!isAttract || !game) startAttract();
  mode = 'map';
  if (world === null) world = Math.floor(nextLevel(save) / LEVELS_PER_WORLD);
  mapWorld = world;
  renderMap();
  showScreen('screen-map');
  const next = document.querySelector('#map-path .level-node.next:not([disabled])') || document.querySelector('#map-path .level-node:not([disabled])');
  next?.focus({ preventScroll: true });
}

function renderMap() {
  const stars = totalStars(save);
  $('map-stars').textContent = `★ ${stars} / ${LEVEL_COUNT * 3}`;
  const tabs = $('world-tabs');
  tabs.innerHTML = '';
  WORLDS.forEach((w, wi) => {
    const open = isUnlocked(save, wi * LEVELS_PER_WORLD);
    const b = document.createElement('button');
    b.className = 'world-tab';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(wi === mapWorld));
    b.style.setProperty('--accent', w.accent);
    b.style.setProperty('--tint', w.sky[0]);
    b.disabled = !open;
    b.innerHTML = `${w.name}<small>${open ? `★ ${worldStars(save, wi)} / 36` : '🔒 Locked'}</small>`;
    b.addEventListener('click', () => { mapWorld = wi; renderMap(); sound.click(); });
    tabs.appendChild(b);
  });
  const w = WORLDS[mapWorld];
  const box = $('map-path');
  box.style.setProperty('--map-bg', `linear-gradient(180deg, ${w.sky[0]}, ${w.sky[1]})`);
  const tall = box.clientWidth > 0 ? box.clientWidth < 520 : innerWidth < 560;
  const pts = tall ? TALL_PATH : WIDE_PATH;
  let d = '';
  pts.forEach(([x, y], i) => { d += `${i ? 'L' : 'M'}${x} ${y} `; });
  box.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
  const nextIdx = nextLevel(save);
  pts.forEach(([x, y], j) => {
    const idx = mapWorld * LEVELS_PER_WORLD + j;
    const lv = LEVELS[idx];
    const open = isUnlocked(save, idx);
    const st = save.stars[idx] || 0;
    const b = document.createElement('button');
    b.className = `level-node${idx === nextIdx ? ' next' : ''}${j === LEVELS_PER_WORLD - 1 ? ' last' : ''}`;
    b.style.left = `${x}%`;
    b.style.top = `${y}%`;
    b.style.setProperty('--accent', w.accent);
    b.disabled = !open;
    b.innerHTML = `<span>${open ? j + 1 : '🔒'}</span><span class="s">${st ? '★'.repeat(st) + '☆'.repeat(3 - st) : save.skipped[idx] ? '…' : ''}</span>`;
    const best = save.best[idx];
    const info = open ? `${levelLabel(idx)} · ${lv.name}${best ? ` · best ${best.toLocaleString('en-US')}` : ''}` : 'Clear the level before to unlock';
    b.setAttribute('aria-label', `${levelLabel(idx)} ${lv.name}${open ? '' : ' (locked)'}${st ? `, ${st} stars` : ''}`);
    b.addEventListener('click', () => startLevel(idx));
    b.addEventListener('focus', () => { $('map-info').textContent = info; });
    b.addEventListener('mouseenter', () => { $('map-info').textContent = info; });
    box.appendChild(b);
  });
  $('map-info').textContent = `${w.name}: ${w.blurb}`;
}

// ------------------------------------------------------------ skins

let skinsBack = 'title';

function toSkins(from) {
  sound.unlock();
  skinsBack = from || mode;
  if (!isAttract || !game) startAttract();
  mode = 'skins';
  renderSkins();
  showScreen('screen-skins');
}

function renderSkins() {
  const grid = $('skin-grid');
  grid.innerHTML = '';
  const fresh = new Set(freshSkins(save).map((s) => s.id));
  let have = 0;
  for (const skin of SKINS) {
    const open = skinUnlocked(save, skin);
    if (open) have++;
    const card = document.createElement('button');
    card.className = `skin-card${open ? '' : ' locked'}${save.skin === skin.id ? ' chosen' : ''}`;
    const cv = document.createElement('canvas');
    cv.width = 180; cv.height = 130;
    drawSkinPreview(cv, skin);
    card.appendChild(cv);
    const name = document.createElement('span');
    name.textContent = open ? skin.name : '???';
    card.appendChild(name);
    const need = document.createElement('span');
    need.className = 'need';
    need.textContent = open ? (save.skin === skin.id ? 'Equipped' : 'Tap to use') : needText(skin);
    card.appendChild(need);
    if (save.skin === skin.id) card.insertAdjacentHTML('beforeend', '<span class="tick">✓</span>');
    if (fresh.has(skin.id)) card.insertAdjacentHTML('beforeend', '<span class="badge new">new</span>');
    card.disabled = false;
    card.setAttribute('aria-label', open ? `${skin.name}${save.skin === skin.id ? ', equipped' : ''}` : `Locked slingshot: ${needText(skin)}`);
    card.addEventListener('click', () => {
      if (!open) return;
      chooseSkin(save, skin.id);
      persist();
      renderer.setSkin(skinOf(save));
      renderer.bake();
      log.event('skin.select', { skin: skin.id });
      sound.click();
      renderSkins();
    });
    grid.appendChild(card);
  }
  $('skins-count').textContent = `${have} / ${SKINS.length}`;
  markSkinsSeen(save);
  persist();
}

function drawSkinPreview(cv, skin) {
  const ctx = cv.getContext('2d');
  const s = 30;
  const sl = bakeSling(skin, s);
  const ox = cv.width / 2, oy = 32;
  ctx.drawImage(sl.back, ox - sl.ox, oy - sl.oy);
  ctx.strokeStyle = skin.band;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ox - 0.62 * s, oy - 0.13 * s); ctx.lineTo(ox - 0.5 * s, oy + 0.1 * s); ctx.lineTo(ox + 0.5 * s, oy - 0.06 * s); ctx.stroke();
  const bean = bakeBean('cherry', 0.45, 'happy', s);
  ctx.drawImage(bean, ox - bean.width / 2 - 2, oy - bean.height / 2 + 2);
  ctx.drawImage(sl.front, ox - sl.ox, oy - sl.oy);
}

// ------------------------------------------------------------ play

function startLevel(index, { daily = false, quick = false } = {}) {
  sound.unlock();
  const same = current.index === index && current.daily === daily;
  restarts = same && quick ? restarts + 1 : 0;
  current = { index, daily };
  isAttract = false;
  load(levelFor(current), { intro: !quick && !autopilot });
  mode = 'play';
  endTimer = 0;
  endHandled = false;
  winResult = null;
  sparePopped = 0;
  levelStartAt = performance.now();
  input.clear();
  if (autopilot) Object.assign(autopilot, { search: null, best: null, shot: null, wait: 0 });
  const lv = game.level;
  $('hud-level').textContent = daily ? `Daily · ${lv.name}` : `${levelLabel(index)} ${lv.name}`;
  updateHud(true);
  showScreen(null);
  log.event('level.start', { level: daily ? 0 : index + 1, world: lv.world + 1, daily, beans: lv.beans.length, bears: lv.bears.length, restart: restarts > 0 });
  pendingBeanCards = [...new Set(lv.beans)].filter((b) => !save.seenBeans.includes(b) && BEANS[b].power);
  if (!save.seenBeans.includes('cherry')) { save.seenBeans.push('cherry'); persist(); }
  if (pendingBeanCards.length && !autopilot) showBeanCard();
  else if (lv.tip && !save.stars[index] && !daily && !quick) toast(lv.tip, 4.5);
}

function showBeanCard() {
  const type = pendingBeanCards.shift();
  const spec = BEANS[type];
  mode = 'bean';
  $('bean-name').textContent = spec.name;
  $('bean-blurb').textContent = spec.blurb;
  const cv = $('bean-preview');
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const spr = bakeBean(type, 0.45, 'go', 110);
  ctx.drawImage(spr, (cv.width - spr.width) / 2, (cv.height - spr.height) / 2, spr.width, spr.height);
  save.seenBeans.push(type);
  persist();
  showScreen('screen-bean');
}

function closeBeanCard() {
  if (pendingBeanCards.length) return showBeanCard();
  mode = 'play';
  input.clear();
  showScreen(null);
  const lv = game.level;
  if (lv.tip && !save.stars[current.index] && !current.daily) toast(lv.tip, 4.5);
}

let toastTimer = 0;
function toast(text, seconds = 3) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  toastTimer = seconds;
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  input.cancel();
  updateSoundButtons();
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  input.clear();
  showScreen(null);
}

function restart() {
  if (current.daily) startLevel(0, { daily: true, quick: true });
  else startLevel(current.index, { quick: true });
}

let hudCache = '';
function updateHud(force) {
  if (!game) return;
  const key = `${game.score}|${game.bearsLeft}|${save.muted}`;
  if (!force && key === hudCache) return;
  hudCache = key;
  $('hud-score').textContent = game.score.toLocaleString('en-US');
  const stars = $('hud-stars').children;
  const t = game.thresholds;
  stars[0].classList.toggle('on', game.bearsLeft === 0);
  stars[1].classList.toggle('on', game.score >= t[0]);
  stars[2].classList.toggle('on', game.score >= t[1]);
  $('hud-bears').textContent = game.bearsLeft ? `🐻 ×${game.bearsLeft}` : '🐻 all popped!';
  $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
}

function updatePowerHint() {
  const el = $('power-hint');
  let text = '';
  if (mode === 'play' && game.state === 'flying' && !game.powerUsed) {
    const b = game.phys.byId(game.active[0]);
    const power = b && BEANS[b.data.bean].power;
    if (power && (b.data.hits === 0 || power === 'hop' || power === 'sticky')) {
      const verb = { split: 'split!', hop: 'jump!', heavy: 'SLAM!', sticky: 'pop!', boost: 'rocket!' }[power];
      const how = input.mode === 'touch' ? 'Tap' : input.mode === 'keys' ? 'Space' : 'Click';
      text = `${how} to ${verb}`;
    }
  } else if (mode === 'play' && game.state === 'aim' && game.shots === 0 && !input.pull && !game.level.daily && current.index < 2) {
    text = input.mode === 'touch' ? 'Drag back, then let go!' : input.mode === 'keys' ? 'Arrows to aim, Space to fling' : 'Drag the bean back, then let go!';
  }
  if (text) { if (el.textContent !== text) el.textContent = text; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

// ------------------------------------------------------------ results

function starsHtml(n) {
  return [0, 1, 2].map((i) => `<span class="${i < n ? 'on' : ''}">★</span>`).join('');
}

// Save a win the moment the last bear pops, so restarting or leaving during
// the celebration never throws the stars away.
let winResult = null;
function recordWin() {
  const g = game;
  const before = new Set(SKINS.filter((s) => skinUnlocked(save, s)).map((s) => s.id));
  let newBest = false;
  let streakLine = '';
  if (current.daily) {
    const r = recordDaily(save, today, true, g.score, g.stars);
    newBest = r.newBest;
    if (r.streakUp) streakLine = r.streak > 1 ? `Daily streak: ${r.streak} days in a row!` : 'Daily fort done! Come back tomorrow for a new one.';
    log.event('daily.complete', { stars: g.stars, score: g.score, streak: r.streak, 'best.new': newBest });
  } else {
    const r = recordClear(save, current.index, g.stars, g.score);
    newBest = r.newBest;
  }
  save.pops += g.bearsTotal;
  const unlocked = SKINS.filter((s) => skinUnlocked(save, s) && !before.has(s.id));
  persist();
  log.event('level.complete', {
    level: current.daily ? 0 : current.index + 1, daily: current.daily, stars: g.stars, score: g.score,
    shots: g.shots, spare: g.queue.length, 'combo.max': g.maxCombo, time: Math.round((performance.now() - levelStartAt) / 1000), 'best.new': newBest,
  });
  winResult = { newBest, streakLine, unlocked };
}

function onWon() {
  const g = game;
  const lv = g.level;
  if (!winResult) recordWin();
  const { newBest, streakLine, unlocked } = winResult;
  mode = 'win';
  const last = !current.daily && current.index === LEVEL_COUNT - 1;
  $('win-title').textContent = current.daily ? 'Daily fort smashed!' : last ? 'You beat the Bear King!' : g.stars === 3 ? 'Sweet victory!' : 'Fort smashed!';
  $('win-sub').textContent = current.daily ? `${lv.name} · ${today}` : `${levelLabel(current.index)} · ${lv.name}`;
  $('win-stars').innerHTML = starsHtml(g.stars);
  $('win-score').textContent = g.score.toLocaleString('en-US');
  const prevBest = current.daily ? dailyState(save, today).best : save.best[current.index] || 0;
  const best = $('win-best');
  best.className = `best-line${newBest ? ' new' : ''}`;
  best.textContent = newBest ? 'New best!' : `Best ${prevBest.toLocaleString('en-US')}`;
  const lines = [
    ['Bears popped', `${g.bearsTotal}`],
    ['Treats smashed', `${g.broken}`],
    ['Best combo', `×${g.maxCombo}`],
    ['Spare beans', g.queue.length ? `${g.queue.length} · +${g.bonus.toLocaleString('en-US')}` : '0'],
  ];
  let tip = '';
  if (g.stars < 3) {
    const need = g.thresholds[g.stars - 1];
    tip = `<div class="tip">${(need - g.score).toLocaleString('en-US')} more points for ${'★'.repeat(g.stars + 1)}. Save a bean (+${BEAN_BONUS.toLocaleString('en-US')}) or smash more!</div>`;
  }
  $('win-lines').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('') + tip;
  const unlockEl = $('win-unlock');
  const notes = [];
  if (streakLine) notes.push(streakLine);
  if (unlocked.length) notes.push(`New slingshot${unlocked.length > 1 ? 's' : ''}: ${unlocked.map((s) => s.name).join(', ')}!`);
  if (!current.daily && current.index % LEVELS_PER_WORLD === LEVELS_PER_WORLD - 1 && !last) notes.push(`${WORLDS[Math.floor(current.index / LEVELS_PER_WORLD) + 1].name} is open!`);
  unlockEl.textContent = notes.join(' ');
  unlockEl.classList.toggle('hidden', notes.length === 0);
  $('btn-win-map').classList.toggle('hidden', current.daily);
  const next = $('btn-next');
  if (current.daily || last) {
    next.textContent = current.daily ? '🗺️ Level map' : '🎯 Slingshots';
  } else {
    next.textContent = `Next · ${levelLabel(current.index + 1)} ${LEVELS[current.index + 1].name} →`;
  }
  showScreen('screen-win');
}

function onLost() {
  const g = game;
  let fails = 0;
  if (!current.daily) fails = recordFail(save, current.index);
  persist();
  log.event('level.fail', { level: current.daily ? 0 : current.index + 1, daily: current.daily, bearsLeft: g.bearsLeft, score: g.score, fails });
  mode = 'lose';
  $('lose-sub').textContent = `${g.bearsLeft} gummy bear${g.bearsLeft === 1 ? ' is' : 's are'} still grumbling.`;
  const tips = [
    'Hit the pieces holding bears up, and let the fort fall on them!',
    'Use each bean\'s power while it flies. Tap, click or press Space.',
    'Sugar glass and fizz crates break the easiest.',
    'A high lob can drop a bean right on top of a tower.',
    'Bears that tumble down or fall in a pit pop too!',
  ];
  $('lose-tip').textContent = tips[(fails + current.index) % tips.length];
  $('btn-skip').classList.toggle('hidden', current.daily || !canSkip(save, current.index));
  showScreen('screen-lose');
}

// ------------------------------------------------------------ sound

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

$('btn-play').addEventListener('click', () => startLevel(nextLevel(save)));
$('btn-map').addEventListener('click', () => toMap());
$('btn-daily').addEventListener('click', () => startLevel(0, { daily: true }));
$('btn-map-daily').addEventListener('click', () => startLevel(0, { daily: true }));
$('btn-skins').addEventListener('click', () => toSkins('title'));
$('btn-map-skins').addEventListener('click', () => toSkins('map'));
$('btn-skins-back').addEventListener('click', () => (skinsBack === 'map' ? toMap(mapWorld) : toTitle()));
$('btn-bean-ok').addEventListener('click', closeBeanCard);
$('btn-pause').addEventListener('click', pause);
$('btn-restart').addEventListener('click', restart);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-resume').addEventListener('click', resume);
$('btn-pause-restart').addEventListener('click', restart);
$('btn-pause-map').addEventListener('click', () => toMap(current.daily ? null : Math.floor(current.index / LEVELS_PER_WORLD)));
$('btn-next').addEventListener('click', () => {
  if (current.daily) return toMap();
  if (current.index === LEVEL_COUNT - 1) return toSkins('map');
  startLevel(current.index + 1);
});
$('btn-replay').addEventListener('click', restart);
$('btn-win-map').addEventListener('click', () => toMap(current.daily ? null : Math.floor(Math.min(LEVEL_COUNT - 1, current.index + 1) / LEVELS_PER_WORLD)));
$('btn-retry').addEventListener('click', restart);
$('btn-skip').addEventListener('click', () => {
  skipLevel(save, current.index);
  persist();
  log.event('level.skip', { level: current.index + 1 });
  startLevel(current.index + 1);
});
$('btn-lose-map').addEventListener('click', () => toMap(current.daily ? null : Math.floor(current.index / LEVELS_PER_WORLD)));
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', toTitle);
addEventListener('resize', () => { renderer.resize(); if (mode === 'map') renderMap(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

// Arrow keys move focus between buttons in menus.
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

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'skins') (skinsBack === 'map' ? toMap(mapWorld) : toTitle());
  else if (mode === 'bean') closeBeanCard();
  else if (mode === 'map' || mode === 'lose' || mode === 'win') toTitle();
}

// ------------------------------------------------------------ autopilot

function stepAutopilot() {
  const g = game;
  const ap = autopilot;
  if (g.state === 'aim') {
    if (!ap.search) { ap.search = searchShots(g); ap.best = null; }
    const until = performance.now() + 7;
    while (performance.now() < until) {
      const r = ap.search.next();
      if (r.value) ap.best = r.value;
      if (r.done) {
        ap.search = null;
        if (ap.best) { ap.shot = ap.best.shot; g.launch(ap.shot.vx, ap.shot.vy); shotTicks = 0; }
        break;
      }
    }
  }
}

// ------------------------------------------------------------ loop

let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
addEventListener('pointerdown', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({
    mode, level: current.daily ? 0 : current.index + 1, state: game ? game.state : 'none',
    bodies: game ? game.bodies.length : 0, awake: game ? game.phys.awakeCount() : 0, attract: isAttract,
  }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

let last = performance.now();
let lastPullLen = 0;
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePointer(dt);
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.add('hidden'); }

  const esc = input.consume('Escape');
  if (esc || input.consume('KeyP')) {
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
    else if (esc) back();
  }
  if (input.consume('KeyM')) toggleMute();
  if (input.consume('KeyR') && (mode === 'play' || mode === 'paused' || mode === 'lose' || mode === 'win')) restart();

  const playing = mode === 'play';
  if (game && playing) {
    input.update(dt, game.state);
    for (const a of input.take()) {
      if (a.type === 'grab') { sound.unlock(); renderer.intro = 0; }
      else if (a.type === 'launch' && game.state === 'aim') {
        const v = pullToVelocity(a.pull.x, a.pull.y, MAX_PULL);
        game.launch(v.vx, v.vy);
        shotTicks = 0;
        $('toast').classList.add('hidden');
      } else if (a.type === 'power') {
        if (game.usePower()) log.event('power.used', { bean: game.events.at(-1)?.bean || '', level: current.daily ? 0 : current.index + 1 });
      }
    }
    if (input.pull) {
      const len = Math.hypot(input.pull.x, input.pull.y);
      if (Math.abs(len - lastPullLen) > 0.25) { sound.stretch(len / MAX_PULL); lastPullLen = len; }
    } else lastPullLen = 0;
    if (autopilot) stepAutopilot();
  } else {
    input.update(dt, 'none');
    input.take();
  }

  const stepping = playing || (isAttract && (mode === 'title' || mode === 'map' || mode === 'skins'));
  if (game && stepping) {
    if (isAttract) stepAttract(dt);
    accumulator += dt;
    let n = 0;
    while (accumulator >= TICK && n < 4) {
      const shot = isAttract ? attractShot : autopilot && autopilot.shot;
      if (game.state === 'flying' && shot && shotTicks === shot.powerTick) game.usePower();
      game.update();
      shotTicks++;
      accumulator -= TICK;
      n++;
    }
    if (n === 4) accumulator = 0;
    renderer.handleEvents(game.events);
    if (playing) sound.handle(game.events);
    game.events.length = 0;
    if (playing) {
      updateHud(false);
      if (game.state === 'won' || game.state === 'lost') {
        endTimer += dt;
        if (game.state === 'won') {
          if (!winResult) recordWin();
          const spare = game.queue.length;
          const due = Math.floor((endTimer - 0.6) / 0.38);
          while (sparePopped < spare && sparePopped <= due) {
            renderer.spareBeanPop(sparePopped, spare);
            sound.bonus(sparePopped);
            sparePopped++;
            renderer.hideQueue = sparePopped;
          }
          if (!endHandled && endTimer > 1.1 + spare * 0.38) { endHandled = true; onWon(); }
        } else if (!endHandled && endTimer > 1.0) { endHandled = true; onLost(); }
      }
    }
  }
  if (mode !== 'paused' && mode !== 'bean') {
    renderer.update(dt, game, { aiming: playing && game.state === 'aim' });
  }
  renderer.draw(game, { pull: playing ? input.pull : null });
  updatePowerHint();
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture.
const loop = telemetry ? telemetry.guard(frame, 'snack-siege.frame') : frame;

if (location.protocol !== 'file:') {
  log.event('game.ready', { stars: totalStars(save), next: nextLevel(save) + 1, skin: save.skin, streak: dailyState(save, today).streak });
  const lv = parseInt(params.get('level'), 10);
  if (params.has('daily')) startLevel(0, { daily: true });
  else if (lv >= 1 && lv <= LEVEL_COUNT) startLevel(lv - 1);
  else toTitle();
  requestAnimationFrame(loop);
}

window.SS = {
  get game() { return game; }, get mode() { return mode; }, save, startLevel, renderer, input, sound, toTitle, toMap,
};
