// Browser entry: screens, the fixed-step loop, input, sound, saves and the shop.
import { World } from './world.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Autopilot } from './ai.js';
import { STEP, HIT } from './config.js';
import { biomeAt, BIOMES } from './biomes.js';
import { DINOS, HATS, BOOSTS, BOOST_MAX, dinoById, hatById } from './catalog.js';
import { bakePortrait, bakeHatIcon } from './sprites.js';
import { MissionRun, missionView, multiplierOf } from './missions.js';
import { loadSave, writeSave, buy, equip, owns, upgradeBoost, boostPrice, recordRun, dailyStatus } from './progress.js';
import { dailyInfo, dateKey } from './daily.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const canvas = $('game');
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
let saveWarned = false;
function persist() {
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const renderer = new Renderer(canvas, { reducedMotion: reduced });
renderer.setDino(save.dino, save.hat);
const input = new Input(canvas);
const sound = new Sound({ muted: save.muted, music: save.music });

let mode = 'title'; // title | shop | play | paused | over
let world = null;
let missions = null;
let accumulator = 0;
let runDaily = null; // dailyInfo for a Daily Dash run
let attract = null; // { world, pilot } behind the title and shop
let shopReturn = 'title';
let lastRun = null;
let forceCrash = false;
const autopilot = params.has('autopilot') ? new Autopilot() : null;

const SCREENS = ['screen-title', 'screen-shop', 'screen-pause', 'screen-over'];

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', !(mode === 'play' || mode === 'paused'));
  input.enabled = mode === 'play';
  input.padEdges.clear();
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(mode === 'play' ? 1 : mode === 'paused' ? 0.3 : 0.55);
}

// ------------------------------------------------------------ attract run

function newAttract() {
  const seed = (Math.random() * 1e9) >>> 0;
  attract = { world: new World({ seed, startDistance: Math.floor(Math.random() * 4) * 900 + 100 }), pilot: new Autopilot() };
  queueMicrotask(() => monitor.mark(performance.now(), 'attract'));
}

// ------------------------------------------------------------ runs

function startRun({ daily = false } = {}) {
  sound.unlock();
  runDaily = daily ? dailyInfo(dateKey()) : null;
  const seed = runDaily ? runDaily.seed : params.has('seed') ? Number(params.get('seed')) >>> 0 : (Math.random() * 1e9) >>> 0;
  const startDistance = params.has('dist') ? Math.max(0, Number(params.get('dist')) || 0) : 0;
  world = new World({
    seed,
    theme: runDaily ? runDaily.theme : 'mixed',
    multiplier: multiplierOf(save.missions),
    boosts: save.boosts,
    best: runDaily ? dailyStatus(save, runDaily.key).best : save.best,
    daily: !!runDaily,
    startDistance,
  });
  missions = new MissionRun(save.missions);
  missions.start(world.stats);
  accumulator = 0;
  mode = 'play';
  input.clear();
  renderer.setDino(save.dino, save.hat);
  showScreen(null);
  clearToasts();
  hudCache = {};
  $('hud-daily').classList.toggle('hidden', !runDaily);
  if (runDaily) $('hud-daily').textContent = `Daily: ${fmt(runDaily.goal)} m`;
  updateHud(true);
  sound.play('go');
  if (!save.tutorial) tutorial();
  missionTimer = 0;
  queueMicrotask(() => monitor.mark(performance.now(), 'run'));
  log.event('level.start', { mode: runDaily ? 'daily' : 'run', theme: world.theme, dino: save.dino, hat: save.hat, multiplier: world.multiplier, level: save.missions.level });
}

function tutorial() {
  const touch = input.mode === 'touch' || matchMedia('(pointer: coarse)').matches;
  const tips = touch
    ? ['Swipe ← → to change lanes', 'Swipe ↑ to jump over logs', 'Swipe ↓ to roll under pterodactyls']
    : ['← → to change lanes', '↑ or Space to jump over logs', '↓ to roll under pterodactyls'];
  tips.forEach((t, i) => setTimeout(() => { if (mode === 'play') toast(t, 'hint', 2.6); }, 300 + i * 3200));
  save.tutorial = true;
  persist();
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  renderMissions($('pause-missions'), missions.view(world.stats));
  showScreen('screen-pause');
  log.event('run.pause', { distance: Math.floor(world.stats.distance) });
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  input.clear();
  showScreen(null);
}

function toTitle() {
  mode = 'title';
  world = null;
  if (!attract) newAttract();
  refreshTitle();
  showScreen('screen-title');
}

// The run is over: fold it into the save and show the results.
function endRun() {
  const w = world;
  w.finish();
  const final = missions.check(w.stats);
  announceMissions(final);
  missions.commit(w.stats);
  const result = recordRun(save, { distance: w.stats.distance, score: w.score, coins: w.stats.coins, daily: runDaily });
  persist();
  lastRun = { distance: w.stats.distance, score: w.score, coins: w.stats.coins, result };
  log.event('level.complete', {
    mode: runDaily ? 'daily' : 'run', reason: 'caught', distance: Math.floor(w.stats.distance), score: Math.floor(w.score),
    coins: w.stats.coins, time: Math.round(w.time), hits: w.stats.hits, 'best.new': result.newBest, multiplier: w.multiplier,
  });
  if (result.dailyGoal) log.event('daily.goal', { goal: runDaily.goal, streak: result.streak });
  mode = 'over';
  showResults(w, result);
}

function showResults(w, r) {
  $('over-dist').textContent = `${fmt(w.stats.distance)} m`;
  $('over-score').textContent = fmt(w.score);
  $('over-coins').textContent = `+${fmt(w.stats.coins)}`;
  const newBest = runDaily ? r.dailyBest && w.stats.distance > 0 : r.newBest;
  $('over-badge').classList.toggle('hidden', !newBest);
  $('over-badge').textContent = runDaily ? 'Daily best!' : 'New best!';
  const titles = ['Lavvy caught you!', 'Gotcha! Lava hug!', 'Squish! Warm hug!'];
  $('over-title').textContent = titles[Math.floor(Math.random() * titles.length)];
  $('over-sub').textContent = w.stats.distance > 1500 ? 'What a run! Lavvy is out of breath.' : 'Big warm lava hug. (It tickles.)';
  $('over-best').textContent = runDaily
    ? `Today's best: ${fmt(save.daily.best)} m`
    : `Best: ${fmt(save.best)} m · Top score ${fmt(save.bestScore)}`;
  const daily = $('over-daily');
  if (runDaily) {
    daily.classList.remove('hidden');
    if (r.dailyGoal) daily.textContent = `Daily goal reached! +${r.reward} amber · ${r.streak}-day streak`;
    else if (save.daily.goalDone) daily.textContent = `Daily goal done today. Come back tomorrow for a new valley!`;
    else daily.textContent = `Daily goal: ${fmt(runDaily.goal)} m (${fmt(Math.max(0, runDaily.goal - w.stats.distance))} m to go)`;
  } else daily.classList.add('hidden');
  renderMissions($('over-missions'), missionView(save.missions), multiplierOf(save.missions));
  showScreen('screen-over');
  if (newBest) setTimeout(() => sound.play('best'), 250);
}

// ------------------------------------------------------------ missions & toasts

let missionTimer = 0;
function announceMissions({ completed, levelUp }) {
  for (const m of completed) {
    toast(`✓ ${m.text}`, 'green', 2.4);
    sound.play('mission');
    log.event('mission.complete', { kind: m.kind, target: m.target, level: save.missions.level });
  }
  if (levelUp) {
    save.coins += levelUp.reward;
    if (world) world.multiplier = levelUp.multiplier;
    persist();
    setTimeout(() => {
      toast(`Multiplier ×${levelUp.multiplier}! +${levelUp.reward} amber`, 'gold', 3);
      sound.play('levelUp');
    }, 500);
    log.event('multiplier.up', { level: levelUp.level, multiplier: levelUp.multiplier, reward: levelUp.reward });
  }
}

function toast(text, kind = '', life = 2.2) {
  const box = $('toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  el.style.setProperty('--life', `${life}s`);
  box.append(el);
  setTimeout(() => el.remove(), (life + 0.5) * 1000);
}

function clearToasts() {
  $('toasts').replaceChildren();
}

function renderMissions(el, list, mult = multiplierOf(save.missions)) {
  el.replaceChildren();
  const head = document.createElement('div');
  head.className = 'missions-head';
  head.innerHTML = `<span>Missions</span><span class="mult-badge" title="Score multiplier">×${mult}</span>`;
  el.append(head);
  for (const m of list) {
    const row = document.createElement('div');
    row.className = `mission${m.done ? ' done' : ''}`;
    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.textContent = m.done ? '✓' : '';
    const text = document.createElement('span');
    text.className = 'mtext';
    text.textContent = m.text;
    const val = document.createElement('span');
    val.className = 'mval';
    val.textContent = m.done ? 'done' : `${fmt(m.value)}/${fmt(m.target)}`;
    const bar = document.createElement('span');
    bar.className = 'mbar';
    const fill = document.createElement('i');
    fill.style.width = `${Math.round((100 * m.value) / m.target)}%`;
    bar.append(fill);
    row.append(tick, text, val);
    if (!m.done) row.append(document.createElement('span'), bar);
    el.append(row);
  }
  const foot = document.createElement('div');
  foot.className = 'mval';
  foot.style.marginTop = '2px';
  foot.textContent = `Finish all three to reach ×${Math.min(30, mult + 1)}.`;
  el.append(foot);
}

// ------------------------------------------------------------ HUD

let hudCache = {};
const POWER_ICON = { shield: '🥚', magnet: '🧲', glide: '🍃' };
function updateHud(force = false) {
  if (!world) return;
  const set = (id, key, value, text) => {
    if (!force && hudCache[key] === value) return false;
    hudCache[key] = value;
    $(id).textContent = text ?? value;
    return true;
  };
  set('hud-score', 'score', Math.floor(world.score), fmt(world.score));
  set('hud-dist', 'dist', Math.floor(world.stats.distance), `${fmt(world.stats.distance)} m`);
  set('hud-mult', 'mult', world.multiplier, `×${world.multiplier}`);
  if (set('hud-coins', 'coins', world.stats.coins, fmt(world.stats.coins)) && !force) {
    const chip = $('hud-coins').parentElement;
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  }
  // Power-up timers.
  const pw = world.power;
  const active = ['shield', 'magnet', 'glide'].filter((k) => pw[k] > 0);
  const key = active.map((k) => `${k}${Math.ceil(pw[k] * 4)}`).join(',');
  if (force || hudCache.powers !== key) {
    hudCache.powers = key;
    const box = $('hud-powers');
    box.replaceChildren();
    for (const k of active) {
      const el = document.createElement('div');
      el.className = 'power';
      const total = world.duration(k);
      el.innerHTML = `<span class="picon">${POWER_ICON[k]}</span><span class="pbar"><i style="width:${Math.round((100 * pw[k]) / total)}%"></i></span>`;
      box.append(el);
    }
  }
  const lv = world.lavvy > 0 && world.status === 'running';
  if (force || hudCache.lavvy !== lv) {
    hudCache.lavvy = lv;
    $('hud-lavvy').classList.toggle('hidden', !lv);
  }
}

// ------------------------------------------------------------ title

function refreshTitle() {
  $('title-best').textContent = save.best > 0 ? `Best: ${fmt(save.best)} m` : 'Best: — (go set one!)';
  $('title-coins').textContent = fmt(save.coins);
  renderMissions($('title-missions'), missionView(save.missions));
  const info = dailyInfo(dateKey());
  const st = dailyStatus(save, info.key);
  const streak = st.streak > 0 ? ` · 🔥 ${st.streak}-day streak` : '';
  $('daily-sub').textContent = st.goalDone
    ? `✓ ${info.themeName} done! Best ${fmt(st.best)} m${streak}`
    : `${info.themeName}: reach ${fmt(info.goal)} m for +${info.reward} amber${streak}`;
  drawPortrait($('title-dino'), save.dino, save.hat);
}

function drawPortrait(c, dinoId, hatId, silhouette = false) {
  const sp = bakePortrait(dinoId, hatId, 100);
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const k = Math.min(c.width / sp.img.width, c.height / sp.img.height);
  const w = sp.img.width * k;
  const h = sp.img.height * k;
  g.drawImage(sp.img, (c.width - w) / 2, c.height - h, w, h);
  if (silhouette) {
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#7a6a58';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
  }
}

// ------------------------------------------------------------ shop

let shopTab = 'dino';
function openShop(from = 'title') {
  shopReturn = from;
  mode = 'shop';
  if (!attract) newAttract();
  renderShop();
  showScreen('screen-shop');
}

function renderShop(focusId) {
  $('shop-coins').textContent = fmt(save.coins);
  drawPortrait($('shop-dino'), save.dino, save.hat);
  $('shop-preview-name').textContent = `${dinoById(save.dino).name}${save.hat !== 'none' ? ` + ${hatById(save.hat).name}` : ''}`;
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.tab === shopTab));
  const grid = $('shop-grid');
  grid.replaceChildren();
  if (shopTab === 'boost') {
    for (const b of BOOSTS) {
      const lv = save.boosts[b.id];
      const price = boostPrice(save, b.id);
      const el = document.createElement('div');
      el.className = 'boost';
      const pips = Array.from({ length: BOOST_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      el.innerHTML = `<span class="bicon">${POWER_ICON[b.id]}</span><span><span class="bname">${b.name}</span><br><span class="bdesc">${b.blurb} ${b.id === 'shield' ? 'Lasts' : 'Lasts'} ${b.seconds(lv)} s${price !== null ? ` → ${b.seconds(lv + 1)} s` : ''}</span><span class="pips">${pips}</span></span>`;
      const btn = document.createElement('button');
      btn.className = 'btn small item-btn';
      btn.dataset.id = b.id;
      if (price === null) {
        btn.textContent = 'Max!';
        btn.disabled = true;
      } else {
        btn.innerHTML = `<span class="amber-gem"></span>${fmt(price)}`;
        btn.addEventListener('click', () => {
          const r = upgradeBoost(save, b.id);
          shopResult(r, `${b.name} upgraded!`);
          if (r.ok) log.event('shop.buy', { kind: 'boost', id: b.id, level: r.level, price: r.price });
          renderShop(b.id);
        });
      }
      el.append(btn);
      grid.append(el);
    }
  } else {
    const list = shopTab === 'dino' ? DINOS : HATS;
    for (const item of list) {
      const owned = owns(save, shopTab, item.id);
      const equipped = (shopTab === 'dino' ? save.dino : save.hat) === item.id;
      const el = document.createElement('button');
      el.className = `item ${shopTab}${equipped ? ' equipped' : ''}${owned ? '' : ' locked'}${!owned && save.coins >= item.price ? ' affordable' : ''}`;
      el.dataset.id = item.id;
      const c = document.createElement('canvas');
      if (shopTab === 'dino') {
        c.width = 120;
        c.height = 140;
        drawPortrait(c, item.id, 'none', !owned);
      } else {
        c.width = 120;
        c.height = 90;
        const icon = bakeHatIcon(item.id, 110);
        const g = c.getContext('2d');
        g.drawImage(icon.img, (c.width - icon.img.width) / 2, (c.height - icon.img.height) / 2);
        if (!owned) {
          g.globalCompositeOperation = 'source-in';
          g.fillStyle = '#7a6a58';
          g.fillRect(0, 0, c.width, c.height);
        }
      }
      const name = document.createElement('span');
      name.className = 'iname';
      name.textContent = owned || shopTab === 'hat' ? item.name : `${item.name}?`;
      const tag = document.createElement('span');
      if (equipped) {
        tag.className = 'itag';
        tag.textContent = '✓ Wearing';
      } else if (owned) {
        tag.className = 'itag';
        tag.textContent = 'Tap to wear';
      } else {
        tag.className = `iprice${save.coins < item.price ? ' cant' : ''}`;
        tag.innerHTML = `<span class="amber-gem"></span>${fmt(item.price)}`;
      }
      el.append(c, name, tag);
      el.setAttribute('aria-label', `${item.name}${item.kind ? `, ${item.kind}` : ''}: ${equipped ? 'wearing' : owned ? 'owned' : `${item.price} amber`}`);
      el.addEventListener('click', () => {
        if (owned) {
          equip(save, shopTab, item.id);
          sound.play('click');
          shopMsg(`${item.name} it is!`);
        } else {
          const r = buy(save, shopTab, item.id);
          shopResult(r, `You got ${item.name}!`);
          if (r.ok) log.event('shop.buy', { kind: shopTab, id: item.id, price: r.price });
        }
        persist();
        renderer.setDino(save.dino, save.hat);
        renderShop(item.id);
      });
      grid.append(el);
    }
  }
  if (focusId) grid.querySelector(`[data-id="${focusId}"]`)?.focus({ preventScroll: true });
}

function shopResult(r, okText) {
  if (r.ok) {
    sound.play('buy');
    shopMsg(okText);
    persist();
  } else if (r.reason === 'coins') {
    sound.play('nope');
    shopMsg(`${fmt(r.need)} more amber needed. Keep running!`);
  }
}

function shopMsg(text) {
  $('shop-msg').textContent = text;
}

function closeShop() {
  if (shopReturn === 'over' && lastRun) {
    mode = 'over';
    showScreen('screen-over');
  } else toTitle();
}

// ------------------------------------------------------------ sound buttons

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

$('btn-play').addEventListener('click', () => startRun());
$('btn-daily').addEventListener('click', () => startRun({ daily: true }));
$('btn-shop').addEventListener('click', () => openShop('title'));
$('btn-over-shop').addEventListener('click', () => openShop('over'));
$('btn-again').addEventListener('click', () => startRun({ daily: !!runDaily }));
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startRun({ daily: !!runDaily }));
$('btn-pause-title').addEventListener('click', () => {
  log.event('run.quit', { distance: Math.floor(world?.stats.distance || 0) });
  toTitle();
});
$('btn-pause').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
for (const t of document.querySelectorAll('.tab')) {
  t.addEventListener('click', () => {
    shopTab = t.dataset.tab;
    shopMsg('');
    renderShop();
    t.focus();
  });
}
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', () => (mode === 'shop' ? closeShop() : toTitle()));
addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

// Arrow keys / d-pad move focus between buttons in menus.
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
  else if (mode === 'shop') closeShop();
  else if (mode === 'over') toTitle();
}

// ------------------------------------------------------------ loop

// Hide the pointer after 2 s without movement during play.
let pointerIdle = 0;
addEventListener('pointermove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

// Quality: step the canvas resolution down when frames stay slow.
let qualityT = 0;
let qualityFrames = 0;
let qualityMs = 0;
function adaptQuality(ms) {
  if (mode !== 'play') return;
  qualityFrames++;
  qualityMs += ms;
  qualityT += ms;
  if (qualityT < 2000) return;
  const avg = qualityMs / qualityFrames;
  qualityT = qualityMs = qualityFrames = 0;
  if (avg > 24 && renderer.quality > 0.5) {
    renderer.setQuality(renderer.quality - 0.25);
    log.warn('quality.drop', { 'frame.ms': Math.round(avg), quality: renderer.quality });
  }
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, distance: world ? Math.floor(world.stats.distance) : 0, speed: world ? Math.round(world.speed) : 0, quality: renderer.quality }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

let last = performance.now();
let biomeShown = -1;
function frame(now) {
  monitor.frame(now);
  if (forceCrash) throw new Error('Forced crash for testing');
  const ms = now - last;
  const dt = Math.min(0.05, ms / 1000);
  last = now;
  if (!renderer.ready) renderer.pump(mode === 'play' ? 4 : 10);
  input.pollPad();
  updatePointer(dt);
  adaptQuality(ms);

  const esc = input.consume('Escape');
  if (esc || input.consume('KeyP') || input.consumePad('start')) {
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
    else if (esc) back();
  }
  if (input.consume('KeyM')) toggleMute();
  if (mode !== 'play') {
    if (input.consumePad('up') || input.consumePad('left')) moveFocus(-1);
    if (input.consumePad('down') || input.consumePad('right')) moveFocus(1);
    if (input.consumePad('a')) document.activeElement?.click?.();
    if (input.consumePad('b')) back();
    input.queue.length = 0;
  } else input.padEdges.clear(); // in play, pad presses went into the action queue

  let view = world;
  if (mode === 'play' && world && renderer.ready) {
    const controls = autopilot ? autopilot.controls(world, dt) : input.take();
    accumulator += dt;
    let first = true;
    while (accumulator >= STEP) {
      world.step(STEP, first ? controls : {});
      first = false;
      accumulator -= STEP;
    }
    renderer.handleEvents(world.events, world);
    sound.handle(world.events);
    for (const e of world.events) {
      if (e.type === 'milestone') toast(`${fmt(e.distance - world.startDistance)} m!`, '', 1.4);
      else if (e.type === 'best' && world.best > 0) toast(runDaily ? 'Daily best!' : 'New best distance!', 'gold', 2);
      else if (e.type === 'power') toast({ shield: 'Egg shield!', magnet: 'Amber magnet!', glide: 'Glide leaf! Wheee!' }[e.kind], '', 1.4);
      else if (e.type === 'hit' && !e.shield && world.status === 'running') log.event('run.hit', { kind: e.kind, distance: Math.floor(world.stats.distance) });
    }
    world.events.length = 0;
    missionTimer += dt;
    if (missionTimer > 0.25) {
      missionTimer = 0;
      announceMissions(missions.check(world.stats));
    }
    if (runDaily && !world.dailyToasted && world.stats.distance >= runDaily.goal) {
      world.dailyToasted = true;
      toast('Daily goal reached!', 'gold', 2.4);
      sound.play('levelUp');
    }
    const b = biomeAt(world.d);
    if (b.index !== biomeShown) {
      if (biomeShown >= 0 && b.index > 0) toast(BIOMES[b.from].name, '', 1.8);
      biomeShown = b.index;
    }
    sound.follow(world, b.from);
    updateHud();
    if (world.status === 'caught' && world.caughtTime > HIT.caughtDelay) endRun();
  } else if (mode === 'title' || mode === 'shop' || mode === 'over') {
    if (mode !== 'over') {
      if (!attract) newAttract();
      const a = attract.world;
      if (renderer.ready) {
        accumulator += dt;
        while (accumulator >= STEP) {
          a.step(STEP, attract.pilot.controls(a, STEP));
          accumulator -= STEP;
        }
        renderer.handleEvents(a.events, a);
      }
      a.events.length = 0;
      if (a.status !== 'running' || a.d > a.startDistance + 3000) newAttract();
      view = a;
      sound.follow(a, biomeAt(a.d).from);
    }
  }
  if (mode !== 'paused') renderer.update(dt, view);
  const bestAt = view && view === world && world.best > 0 ? world.startDistance + world.best : 0;
  // On wide screens the title card sits left, so frame the attract run right.
  const wide = innerWidth >= 980 && innerWidth / innerHeight >= 4 / 3;
  renderer.setShift(mode === 'title' && wide ? Math.min(280, innerWidth * 0.17) : 0, dt);
  renderer.draw(view, { bestAt });
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture.
const loop = telemetry ? telemetry.guard(frame, 'dino-dash.frame') : frame;

if (location.protocol !== 'file:') {
  updateSoundButtons();
  log.event('game.ready', { best: save.best, coins: save.coins, level: save.missions.level, dinos: save.dinos.length, hats: save.hats.length });
  if (params.has('autopilot') || params.has('play')) {
    renderer.pump(1000);
    startRun({ daily: params.has('daily') });
  } else toTitle();
  requestAnimationFrame(loop);
}

window.DD = {
  get world() { return world; }, get mode() { return mode; }, save, renderer, input, sound, startRun, toTitle, openShop, pause,
  forceCrash() { forceCrash = true; },
};
