// Browser entry: screens, the fixed-step loop, input, sound, saves and
// telemetry. Rules live in world.js; this file only drives them.
import { World, STEP } from './world.js';
import { Renderer, clock, things } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Autoplayer, calibration } from './autoplayer.js';
import { SLOPES, PEAKS, SLOPES_PER_PEAK, dailySlope, endlessLevel } from './levels.js';
import { ITEMS, ITEM_BY_ID, formatSize } from './items.js';
import { localDateKey, hashString } from './rng.js';
import {
  loadSave, writeSave, totalStars, museumCount, slopeUnlocked, recordSlope, recordAttempt, recordEndless,
  recordDaily, currentStreak, SKINS, HATS, unlockedIds,
} from './progress.js';
import { itemSprite, itemSilhouette, warmSprites, skinTexture, ballShade, hatSprite, propellerBlades } from './sprites.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');

const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const canvas = $('game');
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
let saveWarned = false;
function persist() {
  // ?autopilot and ?autoplay are browser checks: their runs must not land in the real save.
  if (params.has('autopilot') || params.has('autoplay')) return;
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const renderer = new Renderer(canvas, { reducedMotion: reduced });
const input = new Input(canvas);
const sound = new Sound({ muted: save.muted, music: save.music });

let mode = 'title'; // title | map | wardrobe | museum | play | paused | results | caught | victory
let world = null;
let current = null; // { kind: 'slope' | 'daily' | 'endless', level, index }
let accumulator = 0;
let endTimer = 0;
let bannerTimer = 0;
let isAttract = false;
let attractPilot = new Autoplayer();
const autopilot = params.has('autoplay') || params.has('autopilot') ? new Autoplayer() : null;
// Today's daily star goals come from an autoplayer run, worked out a little
// at a time while the title is idle (or all at once if Daily is picked first).
const dailyCal = new Map();
function dailyCalibration(key) {
  if (!dailyCal.has(key)) dailyCal.set(key, calibration(dailySlope(key)));
  return dailyCal.get(key);
}

const SCREENS = ['screen-title', 'screen-map', 'screen-wardrobe', 'screen-museum', 'screen-pause', 'screen-results', 'screen-caught', 'screen-victory'];

// End cards ignore menu presses for a moment, so jump mashing at the finish
// line (Space, pad A or B) can't skip them or jump back to the title.
const END_LOCK_MS = 700;
let menuLockUntil = 0;
const menuLocked = () => performance.now() < menuLockUntil;
// Still mashing? Keep the card locked until the presses stop for a moment.
const extendLock = () => { menuLockUntil = Math.max(menuLockUntil, performance.now() + 400); };

function showScreen(id, { lock = false } = {}) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('hud-buttons').classList.toggle('hidden', mode !== 'play');
  input.enabled = mode === 'play';
  menuLockUntil = lock ? performance.now() + END_LOCK_MS : 0;
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]):not(.hidden), .slope-btn.next, .btn:not([disabled]):not(.hidden)');
    if (!lock) first?.focus({ preventScroll: true });
    else {
      document.activeElement?.blur?.();
      const focusLater = () => {
        if ($(id).classList.contains('hidden') || (document.activeElement && document.activeElement !== document.body)) return;
        if (menuLocked()) setTimeout(focusLater, menuLockUntil - performance.now() + 10);
        else first?.focus({ preventScroll: true });
      };
      setTimeout(focusLater, END_LOCK_MS);
    }
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(mode === 'play' ? 1 : mode === 'paused' ? 0.3 : 0.55);
}

let toastTimer = null;
function toast(html, ms = 2600) {
  const t = $('toast');
  t.innerHTML = html;
  t.classList.remove('hidden');
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
function hideToast() { clearTimeout(toastTimer); $('toast').classList.add('hidden'); }

const nextSlopeIndex = () => {
  for (let i = 0; i < SLOPES.length; i++) if (!save.slopes[SLOPES[i].id]?.done) return i;
  return SLOPES.length - 1;
};

// ------------------------------------------------------------ attract

function attract() {
  const open = Math.max(1, Math.min(SLOPES.length, nextSlopeIndex() + 1));
  const i = Math.floor(Math.random() * Math.min(open, 6));
  world = new World(SLOPES[i], { avalanche: false });
  attractPilot = new Autoplayer({ skill: 0.8 });
  renderer.reset(world);
  sound.setSong(SLOPES[i].peak);
  isAttract = true;
}

// ------------------------------------------------------------ title

function toTitle() {
  bankUnfinished();
  mode = 'title';
  if (!isAttract) attract();
  hideToast();
  const next = nextSlopeIndex();
  const anyDone = Object.keys(save.slopes).length > 0;
  $('btn-play').textContent = anyDone ? `Continue · ${SLOPES[next].id} ${SLOPES[next].name}` : 'Play';
  const today = localDateKey();
  const streak = currentStreak(save, today);
  const badge = $('daily-badge');
  const playedToday = !!save.daily.days[today];
  badge.textContent = playedToday ? `✓ ${streak}🔥` : streak ? `${streak}🔥` : 'New!';
  badge.classList.remove('hidden');
  const bits = [`★ ${totalStars(save)} / ${SLOPES.length * 3}`, `Museum ${museumCount(save)} / ${ITEMS.length}`];
  if (save.endless.dist) bits.push(`Endless best ${save.endless.dist} m`);
  $('title-best').textContent = bits.join(' · ');
  updateSoundButtons();
  showScreen('screen-title');
}

// ------------------------------------------------------------ starting runs

// A run left mid-way (restart, slopes, back to title) still fills the museum.
function bankUnfinished() {
  if (!world || isAttract || world.status !== 'play' || !world.collected) return;
  const out = recordAttempt(save, { byType: world.byType });
  world.byType = {};
  persist();
  if (out.newTypes.length) log.event('museum.new', { count: out.newTypes.length, from: 'unfinished' });
}

function begin(kind, level, index = -1) {
  bankUnfinished();
  sound.unlock();
  hideToast();
  isAttract = false;
  current = { kind, level, index };
  world = new World(level);
  renderer.reset(world);
  sound.setSong(level.peak);
  mode = 'play';
  accumulator = 0;
  endTimer = 0;
  bannerTimer = 1.4;
  input.clear();
  showScreen(null);
  queueMicrotask(() => monitor.mark(performance.now()));
  const tip = level.tip ? `<b>${level.id && kind === 'slope' ? `${level.id} · ` : ''}${level.name}</b>${level.tip}` : `<b>${level.name}</b>`;
  toast(tip, 3200);
  log.event('level.start', { mode: kind, slope: kind === 'slope' ? level.id : kind, peak: level.peak + 1, avalanche: !!level.avalanche });
}

function startSlope(i) {
  const lv = SLOPES[i];
  begin('slope', lv, i);
}

function startDaily() {
  const key = localDateKey();
  const lv = dailySlope(key);
  lv.goals = dailyCalibration(key).finish();
  begin('daily', lv);
}

function startEndless() {
  const seed = params.has('seed') ? hashString(params.get('seed')) : hashString(`endless/${localDateKey()}/${save.endless.runs}`);
  begin('endless', endlessLevel(seed));
}

function restart() {
  if (!current) return;
  if (current.kind === 'slope') startSlope(current.index);
  else if (current.kind === 'daily') startDaily();
  else startEndless();
}

function pause() {
  // Not during the finish or hug wrap-up: its results must not be thrown away.
  if (mode !== 'play' || world?.status !== 'play') return;
  mode = 'paused';
  hideToast();
  $('pause-sub').textContent = current ? (current.kind === 'slope' ? `${current.level.id} · ${current.level.name}` : current.level.name) : '';
  updateSoundButtons();
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  input.clear();
  showScreen(null);
}

// ------------------------------------------------------------ results

function starRow(checks, goals) {
  const labels = [`Size ${formatSize(goals.size)}`, things(goals.items), `Under ${clock(goals.time)}`];
  return checks.map((on, i) => `<div class="st"><span class="s${on ? ' on' : ''}">★</span>${labels[i]}</div>`).join('');
}

function extras(out) {
  const bits = [];
  if (out.newTypes?.length) bits.push(`<p>New in the museum: ${out.newTypes.map((id) => ITEM_BY_ID[id].name).join(', ')}!</p>`);
  for (const u of out.unlocks || []) bits.push(`<p>Unlocked ${u.kind === 'skin' ? 'skin' : 'hat'}: ${u.name}! Try it in the Wardrobe.</p>`);
  return bits.join('');
}

function runSummary(w) {
  return { size: Math.round(w.ball.D), items: w.collected, time: Math.round((w.finishTime ?? w.time) * 10) / 10, byType: w.byType };
}

function onFinished() {
  const w = world;
  const checks = w.starChecks();
  const stars = checks.filter(Boolean).length;
  const sum = runSummary(w);
  let out;
  if (current.kind === 'daily') out = recordDaily(save, current.level.daily, { ...sum, stars });
  else out = recordSlope(save, current.level.id, { ...sum, stars });
  persist();
  log.event('level.complete', {
    mode: current.kind, slope: current.kind === 'slope' ? current.level.id : 'daily', stars, size: sum.size, items: sum.items,
    time: sum.time, bumps: w.bumps, 'gates.blocked': w.gateBlocks, 'bridges.broken': w.bridgesBroken, 'museum.new': out.newTypes.length,
  });
  for (const u of out.unlocks) log.event('unlock', { kind: u.kind, id: u.id });
  if (current.kind === 'slope' && current.index === SLOPES.length - 1 && out.firstClear) return showVictory(out);
  mode = 'results';
  hideToast();
  const lv = current.level;
  $('res-title').textContent = stars === 3 ? 'Perfect roll!' : stars ? 'Slope clear!' : 'Made it down!';
  $('res-sub').textContent = current.kind === 'daily' ? `Daily Slope · ${lv.daily} · streak ${out.streak} day${out.streak === 1 ? '' : 's'}` : `${lv.id} · ${lv.name}`;
  $('res-stars').innerHTML = starRow(checks, lv.goals);
  $('res-stars').setAttribute('aria-label', `${stars} of 3 stars`);
  const nb = out.newBest || {};
  const best = current.kind === 'slope' ? save.slopes[lv.id].best : null;
  const tag = (on) => (on ? '<span class="new">New best!</span>' : '');
  $('res-lines').innerHTML = [
    ['Snowball size', `${formatSize(sum.size)}${tag(nb.size)}`],
    ['Things collected', `${sum.items}${tag(nb.items)}`],
    ['Time', `${clock(sum.time)}${tag(nb.time)}`],
    best ? ['Best', `${formatSize(best.size)} · ${best.items} · ${clock(best.time)}`] : null,
  ].filter(Boolean).map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  $('res-extra').innerHTML = extras(out);
  const hasNext = current.kind === 'slope' && current.index < SLOPES.length - 1;
  $('btn-next').classList.toggle('hidden', !hasNext);
  if (hasNext) {
    const n = SLOPES[current.index + 1];
    $('btn-next').textContent = `Next · ${n.id} ${n.name} →`;
  }
  showScreen('screen-results', { lock: true });
  checks.forEach((on, i) => { if (on) setTimeout(() => sound.star(i), 250 + i * 250); });
}

function onCaught() {
  const w = world;
  const sum = runSummary(w);
  if (current.kind === 'endless') return onEndlessOver();
  // A hug on the Daily Slope still counts as playing it today (streak, Party Hat).
  const out = current.kind === 'daily' ? recordDaily(save, current.level.daily, { ...sum, stars: 0 }) : recordAttempt(save, sum);
  persist();
  log.event('level.fail', { mode: current.kind, slope: current.kind === 'slope' ? current.level.id : 'daily', reason: 'caught', progress: Math.round(w.progress() * 100), size: sum.size });
  mode = 'caught';
  hideToast();
  $('btn-caught-map').textContent = 'Slopes';
  $('caught-lines').innerHTML = [['Snowball size', formatSize(sum.size)], ['Things collected', sum.items], ['Rolled', `${Math.round(w.progress() * 100)}% of the slope`]]
    .map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  $('caught-extra').innerHTML = extras(out);
  showScreen('screen-caught', { lock: true });
}

function onEndlessOver() {
  const w = world;
  const dist = w.distance / 100;
  const out = recordEndless(save, { dist, size: Math.round(w.ball.D), byType: w.byType });
  persist();
  $('btn-caught-map').textContent = 'Title screen';
  log.event('endless.end', { distance: Math.round(dist), size: Math.round(w.ball.D), items: w.collected, 'best.new': out.newBest, time: Math.round(w.time) });
  mode = 'caught';
  $('caught-lines').innerHTML = [
    ['Distance', `${Math.round(dist)} m${out.newBest ? '<span class="new">New best!</span>' : ''}`],
    ['Snowball size', formatSize(w.ball.D)], ['Things collected', w.collected], ['Best distance', `${save.endless.dist} m`],
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  $('caught-extra').innerHTML = extras(out);
  showScreen('screen-caught', { lock: true });
}

function showVictory(out) {
  mode = 'victory';
  log.event('game.complete', { stars: totalStars(save) });
  $('victory-lines').innerHTML = `<div><span>Stars</span><b>★ ${totalStars(save)} / ${SLOPES.length * 3}</b></div><div><span>Museum</span><b>${museumCount(save)} / ${ITEMS.length}</b></div>` + extras(out);
  showScreen('screen-victory', { lock: true });
}

// ------------------------------------------------------------ map

function renderMap() {
  const grid = $('peak-grid');
  grid.innerHTML = '';
  $('map-stars').textContent = `★ ${totalStars(save)} / ${SLOPES.length * 3}`;
  const next = nextSlopeIndex();
  const skies = [['#5fb8ff', '#a8dcff'], ['#7b5bc8', '#f29ab8'], ['#1b2366', '#4c3f99']];
  PEAKS.forEach((p, pi) => {
    const first = pi * SLOPES_PER_PEAK;
    const open = slopeUnlocked(save, SLOPES, first);
    const card = document.createElement('div');
    card.className = `peak${open ? '' : ' locked'}`;
    card.style.setProperty('--sky1', skies[pi][0]);
    card.style.setProperty('--sky2', skies[pi][1]);
    const got = SLOPES.slice(first, first + SLOPES_PER_PEAK).reduce((n, s) => n + (save.slopes[s.id]?.stars || 0), 0);
    card.innerHTML = `<h3>${p.name} <small>★ ${got}/${SLOPES_PER_PEAK * 3}</small></h3><p class="blurb">${open ? p.blurb : `Finish ${PEAKS[pi - 1].name} to open it`}</p>`;
    const list = document.createElement('div');
    list.className = 'slopes';
    for (let j = 0; j < SLOPES_PER_PEAK; j++) {
      const i = first + j;
      const lv = SLOPES[i];
      const rec = save.slopes[lv.id];
      const unlocked = slopeUnlocked(save, SLOPES, i);
      const b = document.createElement('button');
      b.className = `slope-btn${i === next ? ' next' : ''}`;
      b.disabled = !unlocked;
      const st = rec?.stars || 0;
      b.innerHTML = `<span class="num">${unlocked ? j + 1 : '🔒'}</span><span class="nm">${lv.name}<small>${rec?.best ? `Best ${formatSize(rec.best.size)} · ${things(rec.best.items)}` : lv.avalanche ? 'Snow Cloud chase!' : unlocked ? 'Not rolled yet' : 'Locked'}</small></span><span class="st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>`;
      b.setAttribute('aria-label', `${lv.id} ${lv.name}${unlocked ? '' : ', locked'}, ${st} stars`);
      b.addEventListener('click', () => startSlope(i));
      const info = () => { $('map-info').textContent = unlocked ? `${lv.id} · ${lv.name} — ${lv.tip}` : 'Finish the slope before this one to open it.'; };
      b.addEventListener('focus', info);
      b.addEventListener('mouseenter', info);
      list.appendChild(b);
    }
    card.appendChild(list);
    grid.appendChild(card);
  });
}

function toMap() {
  bankUnfinished();
  sound.unlock();
  if (!isAttract) attract();
  mode = 'map';
  renderMap();
  $('map-info').textContent = 'Finish a slope to open the next one.';
  showScreen('screen-map');
}

// ------------------------------------------------------------ wardrobe

function drawPreview(c, skin, hat, t = 0) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const R = c.width * 0.24, cx = c.width / 2, cy = c.height * 0.68;
  g.save(); g.translate(cx, cy); g.rotate(t * 0.6);
  g.drawImage(skinTexture(skin), -R, -R, R * 2, R * 2);
  g.restore();
  const sh = ballShade(); const k = R / 128;
  g.drawImage(sh, cx - R - 4 * k, cy - R - 4 * k, sh.width * k, sh.height * k);
  const hs = hatSprite(hat);
  if (hs) {
    const k2 = R / hs.unit;
    g.drawImage(hs.img, cx - hs.ax * k2, cy - R * 0.9 - hs.ay * k2, hs.img.width * k2, hs.img.height * k2);
    if (hat === 'propeller') propellerBlades(g, cx, cy - R * 0.9 - 112 * k2, k2, t);
  }
}

function renderWardrobe() {
  const un = unlockedIds(save);
  const build = (gridId, list, kind) => {
    const grid = $(gridId);
    grid.innerHTML = '';
    for (const it of list) {
      const open = (kind === 'skin' ? un.skins : un.hats).includes(it.id);
      const on = save[kind] === it.id;
      const b = document.createElement('button');
      b.className = `pick${on ? ' on' : ''}`;
      b.disabled = !open;
      const c = document.createElement('canvas');
      c.width = 120; c.height = 120; c.className = 'ball-preview';
      drawPreview(c, kind === 'skin' ? it.id : save.skin, kind === 'hat' ? it.id : 'none');
      if (!open) { const g = c.getContext('2d'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(90,106,142,0.85)'; g.fillRect(0, 0, 120, 120); }
      b.appendChild(c);
      const label = document.createElement('span');
      label.innerHTML = `${it.name}<br><small>${open ? (on ? 'Wearing' : 'Tap to wear') : it.need}</small>`;
      b.appendChild(label);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', () => {
        save[kind] = it.id;
        persist();
        sound.click();
        log.event('wardrobe.pick', { kind, id: it.id });
        renderWardrobe();
        $(gridId).querySelectorAll('.pick')[list.indexOf(it)]?.focus({ preventScroll: true });
      });
      grid.appendChild(b);
    }
  };
  build('skin-grid', SKINS, 'skin');
  build('hat-grid', HATS, 'hat');
}

function toWardrobe() {
  sound.unlock();
  mode = 'wardrobe';
  renderWardrobe();
  showScreen('screen-wardrobe');
}

// ------------------------------------------------------------ museum

function renderMuseum() {
  const grid = $('museum-grid');
  grid.innerHTML = '';
  $('museum-count').textContent = `${museumCount(save)} / ${ITEMS.length}`;
  for (const it of ITEMS) {
    const n = save.museum[it.id] || 0;
    const cell = document.createElement('button');
    cell.className = `museum-cell${n ? '' : ' missing'}`;
    const c = document.createElement('canvas');
    c.width = 144; c.height = 144;
    const g = c.getContext('2d');
    const sp = itemSprite(it.id);
    const img = n ? sp.img : itemSilhouette(it.id);
    const k = Math.min(132 / img.width, 132 / img.height);
    g.drawImage(img, (144 - img.width * k) / 2, (144 - img.height * k) / 2, img.width * k, img.height * k);
    cell.appendChild(c);
    const label = document.createElement('span');
    label.innerHTML = n ? `${it.name}<br><small>×${n} · ${formatSize(it.size)}</small>` : `???<br><small>${formatSize(it.size)}</small>`;
    cell.appendChild(label);
    const info = () => { $('museum-info').textContent = n ? `${it.name}: ${it.blurb}` : `Not found yet. Look on ${PEAKS[it.peak].name}${it.rare ? ' (it is rare!)' : ''}.`; };
    cell.addEventListener('focus', info);
    cell.addEventListener('mouseenter', info);
    cell.addEventListener('click', info);
    grid.appendChild(cell);
  }
}

function toMuseum() {
  sound.unlock();
  mode = 'museum';
  renderMuseum();
  $('museum-info').textContent = 'Roll over things to add them to the museum.';
  showScreen('screen-museum');
}

// ------------------------------------------------------------ sound buttons

function updateSoundButtons() {
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = save.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = save.music ? '🎵 Music on' : '🎵 Music off';
  $('btn-mute').classList.toggle('muted-on', save.muted);
  $('btn-mute').setAttribute('aria-label', save.muted ? 'Unmute' : 'Mute');
}
function toggleMute() { save.muted = !save.muted; sound.unlock(); sound.setMuted(save.muted); persist(); updateSoundButtons(); }
function toggleMusic() { save.music = !save.music; sound.unlock(); sound.setMusic(save.music); persist(); updateSoundButtons(); }

// ------------------------------------------------------------ wiring

for (const id of ['screen-results', 'screen-caught', 'screen-victory']) {
  $(id).addEventListener('click', (e) => { if (menuLocked()) { e.preventDefault(); e.stopPropagation(); extendLock(); } }, true);
}
$('btn-play').addEventListener('click', () => startSlope(nextSlopeIndex()));
$('btn-map').addEventListener('click', toMap);
$('btn-daily').addEventListener('click', startDaily);
$('btn-endless').addEventListener('click', startEndless);
$('btn-museum').addEventListener('click', toMuseum);
$('btn-wardrobe').addEventListener('click', toWardrobe);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', restart);
$('btn-pause-map').addEventListener('click', toMap);
$('btn-pause').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-next').addEventListener('click', () => startSlope(current.index + 1));
$('btn-again').addEventListener('click', restart);
$('btn-res-map').addEventListener('click', toMap);
$('btn-caught-again').addEventListener('click', restart);
$('btn-caught-map').addEventListener('click', () => (current?.kind === 'endless' ? toTitle() : toMap()));
$('btn-victory-endless').addEventListener('click', startEndless);
$('btn-victory-map').addEventListener('click', toMap);
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', toTitle);
addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

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
  if (menuLocked() && (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); extendLock(); return; }
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
  if (e.code === 'KeyR' && (mode === 'results' || mode === 'caught')) restart();
});

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'map' || mode === 'wardrobe' || mode === 'museum' || mode === 'results' || mode === 'caught' || mode === 'victory') toTitle();
}

// ------------------------------------------------------------ loop

let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

const safeBottom = () => $('safe-probe').offsetHeight || 0;

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, slope: current?.level?.id ?? 'none', size: world ? Math.round(world.ball.D) : 0, attract: isAttract }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

let spritesReady = false;
let skiesReady = false;
let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.pollPad();
  updatePointer(dt);
  if (!spritesReady) spritesReady = warmSprites(5);
  else if (!skiesReady && mode !== 'play') skiesReady = renderer.warmSkies();
  else if (mode !== 'play' && mode !== 'paused') dailyCalibration(localDateKey()).step(2.5);

  const esc = input.consume('Escape');
  if (esc || input.consume('KeyP') || input.consumePad('start')) {
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
    else if (esc) back();
  }
  if (input.consume('KeyM')) toggleMute();
  if (mode === 'play' && world?.status === 'play' && (input.consume('KeyR') || input.consumePad('select'))) restart();
  if (mode !== 'play') {
    input.consume('KeyR');
    if (menuLocked()) { if (input.padEdges.size) extendLock(); input.padEdges.clear(); }
    if (input.consumePad('up') || input.consumePad('left')) moveFocus(-1);
    if (input.consumePad('down') || input.consumePad('right')) moveFocus(1);
    if (input.consumePad('a')) document.activeElement?.click?.();
    if (input.consumePad('b')) back();
    if (input.consumePad('select') && (mode === 'results' || mode === 'caught')) restart();
  }

  const playing = mode === 'play';
  const stepping = playing || (isAttract && (mode === 'title' || mode === 'map' || mode === 'wardrobe' || mode === 'museum'));
  if (world && stepping) {
    const controls = playing ? (autopilot ? autopilot.controls(world) : input.read()) : attractPilot.controls(world);
    if (playing && bannerTimer > 0) { bannerTimer -= dt; }
    accumulator += dt;
    let first = true;
    while (accumulator >= STEP) {
      world.step(STEP, first ? controls : { ...controls, jump: false });
      first = false;
      accumulator -= STEP;
    }
    renderer.handleEvents(world.events, world);
    if (playing) sound.handle(world.events);
    world.events.length = 0;
    if (playing) {
      if (world.status === 'finished') { endTimer += dt; if (endTimer > 1.3) onFinished(); }
      else if (world.status === 'caught') { endTimer += dt; if (endTimer > 1.1) onCaught(); }
    } else if (world.status !== 'play') {
      endTimer += dt;
      if (endTimer > 1.5) { endTimer = 0; attract(); }
    }
  }
  sound.frame(world, dt, playing);
  renderer.attract = isAttract && mode !== 'play';
  if (mode !== 'paused') renderer.update(dt, world);
  renderer.draw(world, {
    attract: isAttract && mode !== 'play',
    skin: save.skin, hat: save.hat,
    touch: input.touchUsed,
    safeBottom: safeBottom(),
    banner: playing && bannerTimer > 0 && world.time < 1.4 ? 'Roll!' : null,
    best: current?.kind === 'endless' ? save.endless.dist : 0,
  });
  if (mode === 'wardrobe') drawPreview($('wardrobe-preview'), save.skin, save.hat, now / 1000);
  requestAnimationFrame(loop);
}

const loop = telemetry ? telemetry.guard(frame, 'snowball-summit.frame') : frame;

if (location.protocol !== 'file:') {
  // Pay the first-canvas cost while loading, before the title paints.
  itemSprite('pinecone'); skinTexture(save.skin); ballShade(); hatSprite(save.hat);
  log.event('game.ready', { stars: totalStars(save), museum: museumCount(save), 'endless.best': save.endless.dist, reduced });
  const sl = params.get('slope');
  const idx = SLOPES.findIndex((s) => s.id === sl);
  if (idx >= 0) startSlope(idx);
  else if (params.has('daily')) startDaily();
  else if (params.has('endless')) startEndless();
  else toTitle();
  requestAnimationFrame(loop);
}

window.SS = { get world() { return world; }, get mode() { return mode; }, save, startSlope, startDaily, startEndless, renderer, input, sound, restart };
