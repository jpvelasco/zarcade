// Browser entry: screens, the fixed-step loop, input, sound, saves.
import {
  SAVE_KEY, LAYERS, ORES, UPGRADES, UPGRADE_ORDER, MUSEUM, PIECES, PIECE_NAMES, PAINTS, MILESTONES, METERS_PER_TILE,
} from './data.js';
import { Session, upgradeInfo, buyUpgrade, towFee, dailyConfig, paintById, totalPieces } from './game.js';
import { loadSave, writeSave, localDate, currentStreak, newSave } from './progress.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Bot } from './bot.js';
import { frameMonitor } from './perf.js';
import { PIECE_ICONS, BRANCH_ICONS, podIcon, MOLE_LOGO } from './icons.js';

const STEP = 1 / 60;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');
const coarse = matchMedia('(pointer: coarse)').matches;
if (coarse) document.body.classList.add('touch');

const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const storage = (() => { try { return localStorage; } catch { return null; } })();
if (params.has('reset') && storage) { try { storage.removeItem('mole-miner.v1'); } catch { /* blocked */ } }
const save = loadSave(storage);
if (params.has('coins')) save.coins = Math.max(0, parseInt(params.get('coins'), 10) || 0);
for (const k of UPGRADE_ORDER) if (params.has(k)) save.upgrades[k] = Math.max(0, Math.min(UPGRADES[k].tiers.length - 1, parseInt(params.get(k), 10) || 0));
let saveWarned = false;
function persist() {
  if (main) main.store();
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const canvas = $('game');
const renderer = new Renderer(canvas, { reducedMotion: reduced });
const input = new Input(canvas, (x, y) => renderer.toWorld(x, y));
input.bindTouch($('dpad'), $('btn-fly'));
const sound = new Sound({ muted: save.muted, music: save.music });
$('logo-art').innerHTML = MOLE_LOGO;

let mode = 'title'; // title | play | paused | shop | rescue | tow | core | daily | dailyEnd | help
let main = new Session(save);
let active = null;       // the session being played (main or daily)
let demo = null;         // title-screen backdrop
let demoBot = new Bot({ shop: false });
let autopilot = params.has('autopilot') ? new Bot() : null;
let accumulator = 0;
let tow = null;          // worm animation state
let saveTimer = 0;
let lowFuelWarned = false;
let shopTab = 'upgrades';
let resumeTo = 'play';

const SCREENS = ['screen-title', 'screen-pause', 'screen-shop', 'screen-rescue', 'screen-core', 'screen-daily', 'screen-daily-end', 'screen-help'];

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const playing = mode === 'play' || mode === 'tow';
  $('hud').classList.toggle('hidden', !(playing || mode === 'paused' || mode === 'shop' || mode === 'rescue' || mode === 'core' || mode === 'help'));
  $('touch').classList.toggle('hidden', !(coarse && mode === 'play'));
  input.enabled = mode === 'play';
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setLevel(mode === 'play' ? 1 : mode === 'title' || mode === 'daily' ? 0.6 : 0.35);
}

// ------------------------------------------------------------ title & demo

function makeDemo() {
  demo = new Session(newSave(), { kind: 'demo', seed: `title-${Math.floor(Math.random() * 1000)}`, upgrades: { drill: 2, tank: 3, cargo: 3, hull: 3, lamp: 3, prop: 2, fan: 0 } });
  demoBot = new Bot({ shop: false });
  demo.demoTime = 0;
  // The title shows the sunny meadow and the base, with the demo pod digging.
  renderer.camTarget = { x: demo.mine.base.x1 + 4, y: 1.2 };
  renderer.setSession(demo);
}

function toTitle() {
  if (active === main) persist();
  mode = 'title';
  active = null;
  tow = null;
  makeDemo();
  const started = save.stats.trips > 0 || save.bestDepth > 0;
  $('btn-play').textContent = started ? `Continue · ${save.bestDepth} m best` : 'Play';
  const today = localDate();
  const streak = currentStreak(save, today);
  const done = save.daily.results[today]?.done;
  $('daily-streak').textContent = done ? '✓ done today' + (streak > 1 ? ` · 🔥${streak}` : '') : streak ? `🔥 ${streak}` : 'new!';
  const parts = [];
  if (save.bestDepth) parts.push(`Deepest dig: ${save.bestDepth} m`);
  if (save.core) parts.push('🌈 Core reached');
  parts.push(`Museum ${totalPieces(save)}/24`);
  $('title-best').textContent = parts.join(' · ');
  updateSoundButtons();
  showScreen('screen-title');
  queueMicrotask(() => monitor.mark(performance.now(), 'title'));
}

// ------------------------------------------------------------ play

function startMain() {
  sound.unlock();
  renderer.camTarget = null;
  active = main;
  renderer.setSession(main);
  mode = 'play';
  accumulator = 0;
  input.clear();
  lowFuelWarned = false;
  showScreen(null);
  queueMicrotask(() => monitor.mark(performance.now(), 'mine'));
  log.event('level.start', { mode: 'main', mine: save.mineNo, drill: save.upgrades.drill, best: save.bestDepth, coins: save.coins });
  if (!save.seen.help) { mode = 'help'; showScreen('screen-help'); }
}

function openDaily() {
  sound.unlock();
  mode = 'daily';
  const today = localDate();
  const cfg = dailyConfig(today);
  const res = save.daily.results[today];
  $('daily-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('daily-goal').textContent = `🎯 ${cfg.label}`;
  const streak = currentStreak(save, today);
  $('daily-stats').innerHTML = [
    ['Streak', streak ? `🔥 ${streak} day${streak > 1 ? 's' : ''}` : 'Start one today!'],
    ['Today', res?.done ? `✓ Cleared · best ${res.best} 🪙` : res ? `${res.tries} tr${res.tries > 1 ? 'ies' : 'y'} so far` : 'Not dug yet'],
    ['Reward', res?.done ? 'Already collected' : `+${100 + 25 * Math.min(Math.max(streak + 1, 1), 8)} 🪙 for your mine`],
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  showScreen('screen-daily');
}

function startDaily() {
  const cfg = dailyConfig(localDate());
  renderer.camTarget = null;
  active = new Session(save, { kind: 'daily', daily: cfg });
  renderer.setSession(active);
  mode = 'play';
  accumulator = 0;
  input.clear();
  lowFuelWarned = false;
  showScreen(null);
  queueMicrotask(() => monitor.mark(performance.now(), 'daily'));
  log.event('level.start', { mode: 'daily', goal: cfg.goal.type, target: cfg.goal.target });
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  const daily = active.kind === 'daily';
  const p = active.pod;
  $('btn-pause-shop').classList.toggle('hidden', daily || !p.docked);
  $('btn-call').classList.toggle('hidden', daily || p.docked || p.y < 0);
  $('btn-daily-restart').classList.toggle('hidden', !daily);
  $('pause-info').textContent = daily ? `Daily Dig · ${active.daily.label}` : `${LAYERS[layerOfPod()].name} · ${depthM()} m`;
  updateSoundButtons();
  if (active === main) persist();
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  input.clear();
  showScreen(null);
}

function layerOfPod() {
  const s = active || main;
  const row = Math.max(0, Math.min(s.world.h - 1, Math.floor(s.pod.y + 0.4)));
  return s.pod.y < 0 ? 0 : s.world.layerOf[row];
}
const depthM = () => Math.floor((active || main).pod.depth * METERS_PER_TILE);

// ------------------------------------------------------------ toasts

function toast(html, cls = '', ms = 2600) {
  const box = $('toasts');
  while (box.children.length > 3) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.innerHTML = html;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 450);
}

// ------------------------------------------------------------ events

function handleEvents(session) {
  const evs = session.events;
  renderer.handleEvents(evs);
  for (const e of evs) {
    switch (e.type) {
      case 'gem': sound.play('gem', e.value); bump('s-cargo'); break;
      case 'dug': sound.play('dug'); break;
      case 'full': sound.play('full'); toast('🎒 Cargo hold is full! Fly home to sell.', 'pink'); break;
      case 'blocked':
        sound.play('blocked');
        if (e.reason === 'hard') {
          const need = UPGRADES.drill.names[Math.min(UPGRADES.drill.names.length - 1, e.hard - 1)];
          hint(`Too hard! You need the ${need}.`);
        } else if (e.reason === 'hot') hint('Too hot! The Frost Fan cools lava.');
        break;
      case 'gas': sound.play('gas'); break;
      case 'wobble': sound.play('wobble'); break;
      case 'thud': sound.play('thud'); break;
      case 'bonk': sound.play('bonk'); break;
      case 'hot': sound.play('hot'); break;
      case 'cool': case 'hiss': sound.play('cool'); break;
      case 'boing': sound.play('boing'); break;
      case 'thump': sound.play('thump'); break;
      case 'fuel': sound.play('fuel'); toast('⛽ Found a fuel can!', 'mint', 1800); break;
      case 'relic': sound.play('relic'); toast(`🦴 Museum find: <b>${PIECES[e.piece].name}</b>! Bring it home.`, 'gold'); break;
      case 'acorn': sound.play('relic'); toast('🌰 The Golden Acorn! Fly it home!', 'gold'); break;
      case 'milestone':
        sound.play('milestone');
        toast(`🏁 ${e.m} m${e.label ? ` · ${e.label}` : ''}! +${e.coins} 🪙${e.paint ? ` · new paint: ${paintById(e.paint).name}` : ''}`, 'gold', 3200);
        log.event('milestone', { m: e.m });
        break;
      case 'record': toast(`⭐ New deepest dig: ${e.m} m!`, 'gold'); break;
      case 'docked': onDocked(session, e); break;
      case 'stranded': onStranded(session, e); break;
      case 'coreReached': onCore(e); break;
      case 'dailyEnd': onDailyEnd(e); break;
      default: break;
    }
  }
  evs.length = 0;
}

function bump(id) {
  const el = $(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

let hintTimer = 0;
function hint(text) {
  if (hintTimer > 0) return;
  hintTimer = 2.5;
  toast(text, 'pink', 2200);
}

function onDocked(session, e) {
  if (session.kind !== 'main') return;
  if (e.count) {
    sound.play('sell', e.count);
    toast(`💰 Sold ${e.count} gem${e.count > 1 ? 's' : ''} for <b>${e.value} 🪙</b>`, 'gold');
    bump('s-coins');
  }
  for (const p of e.pieces) toast(`🏛️ ${p.dupe ? 'Spare' : 'New in the museum'}: <b>${p.name}</b> · +${p.reward} 🪙`, 'gold', 3200);
  for (const id of e.paints) toast(`🎨 Set complete! New paint: <b>${paintById(id).name}</b>`, 'mint', 3600);
  if (e.trip) log.event('trip.end', { value: e.value, gems: e.count, pieces: e.pieces.length, coins: save.coins });
  lowFuelWarned = false;
  persist();
  if (autopilot) {
    const b = autopilot.shopAt(save);
    if (b.length) main.refreshStats();
    main.pod.fuel = main.stats.tank;
    main.pod.hull = main.stats.hull;
    autopilot.reset();
    return;
  }
  // First visit with coins to spend: show the Workshop.
  if (!save.seen.workshop && e.trip && UPGRADE_ORDER.some((k) => upgradeInfo(save, k).affordable)) {
    save.seen.workshop = true;
    setTimeout(() => { if (mode === 'play' && main.pod.docked) openShop('upgrades'); }, 700);
  }
}

function onStranded(session, e) {
  sound.play('stranded');
  if (session.kind === 'daily') {
    tow = null;
    session.tow();
    return;
  }
  log.event('level.fail', { reason: e.reason, depth: depthM(), coins: save.coins });
  if (autopilot) { startTow(); return; }
  openRescue(e.reason);
}

function openRescue(reason) {
  mode = 'rescue';
  const fee = Math.min(save.coins, towFee(main.pod.depth));
  const title = reason === 'fuel' ? 'Out of fuel!' : reason === 'hull' ? 'Bumped and bruised!' : 'Call Wiggles?';
  $('rescue-title').textContent = title;
  const why = reason === 'fuel' ? 'Your tank is empty.' : reason === 'hull' ? 'Your hull needs patching.' : 'Wiggles can tow you straight home.';
  $('rescue-text').innerHTML = `${why} Wiggles the worm will tow you home ${fee ? `for <b>${fee} 🪙</b>` : '<b>for free</b>'}. You keep everything in your cargo hold.`;
  $('btn-tow').textContent = reason === 'call' ? 'Tow me home' : 'Thanks, Wiggles!';
  $('btn-tow-cancel').classList.toggle('hidden', reason !== 'call');
  showScreen('screen-rescue');
}

function startTow() {
  mode = 'tow';
  const p = main.pod;
  tow = { t: 0, phase: 0, x: p.x + (p.facing > 0 ? -0.9 : 0.9), y: Math.floor(p.y + 0.4) + 1, emerge: 0, showPod: true, fee: 0, done: false };
  sound.play('worm');
  showScreen(null);
}

function updateTow(dt) {
  tow.t += dt;
  const t = tow.t;
  if (t < 0.7) tow.emerge = t / 0.7;
  else if (t < 1.2) { tow.emerge = 1; tow.fade = (t - 0.7) / 0.5; }
  else if (!tow.done) {
    tow.done = true;
    const reason = main.pod.stranded || 'call';
    tow.fee = main.tow();
    handleEvents(main);
    renderer.setSession(main);
    const p = main.pod;
    tow.x = p.x - 1.3; tow.y = 0; tow.emerge = 1;
    toast(`🪱 Wiggles towed you home${tow.fee ? ` · fee ${tow.fee} 🪙` : ''}. Wave goodbye!`, 'pink', 3000);
    log.event('tow', { reason, fee: tow.fee });
    sound.play('worm');
    persist();
  }
  if (t >= 1.2) {
    tow.fade = Math.max(0, 1 - (t - 1.2) / 0.5);
    if (t > 2.2) tow.emerge = Math.max(0, 1 - (t - 2.2) / 0.6);
    if (t > 2.9) { tow = null; mode = 'play'; input.clear(); showScreen(null); }
  }
}

function onCore(e) {
  sound.play('core');
  log.event('level.complete', { mode: 'main', kind: 'core', first: e.first, trips: save.stats.trips, coins: save.coins });
  persist();
  if (autopilot) return;
  mode = 'core';
  $('core-text').innerHTML = `${e.first ? 'Momo dug all the way down through soil, clay, stone, crystal, glowcaps, lava and the ancient ruins!' : 'The core shines for you again!'}<br><b>+${e.coins} 🪙</b>${e.paint ? ` · new paint: <b>Rainbow Core</b>` : ''}<br><span class="muted">Keep exploring, fill the museum, or start a fresh mine from the Workshop's Records tab.</span>`;
  showScreen('screen-core');
}

function onDailyEnd(r) {
  sound.play(r.success ? 'win' : 'stranded');
  log.event(r.success ? 'level.complete' : 'level.fail', { mode: 'daily', success: r.success, score: r.score, streak: r.streak, reason: r.failReason || 'home' });
  persist();
  setTimeout(() => {
    mode = 'dailyEnd';
    $('de-title').textContent = r.success ? 'Goal complete! 🎉' : r.failReason ? 'Out of fuel!' : 'So close!';
    $('de-sub').textContent = r.success ? (r.firstClear ? `Streak: 🔥 ${r.streak} day${r.streak > 1 ? 's' : ''}` : 'Already cleared today. Nice extra run!') : 'Have another go! Same mine, fresh tank.';
    const lines = [['Gems sold', `${r.score} 🪙`], ['Deepest', `${r.depth} m`]];
    if (r.reward) lines.push(['Reward for your mine', `+${r.reward} 🪙`]);
    for (const id of r.paints) lines.push(['New paint', paintById(id).name]);
    if (r.newBest && !r.firstClear) lines.push(['Today', 'New best haul!']);
    $('de-lines').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    showScreen('screen-daily-end');
  }, r.failReason ? 900 : 500);
}

// ------------------------------------------------------------ workshop

function openShop(tab = shopTab) {
  if (mode === 'play' || mode === 'paused') resumeTo = 'play';
  else resumeTo = 'title';
  mode = 'shop';
  shopTab = tab;
  renderShop();
  showScreen('screen-shop');
  sound.play('ui');
}

function closeShop() {
  if (mode !== 'shop') return;
  persist();
  if (resumeTo === 'play') { mode = 'play'; input.clear(); showScreen(null); } else toTitle();
}

function canShop() { return main.pod.docked; }

function renderShop() {
  $('shop-coins').textContent = `🪙 ${save.coins.toLocaleString('en-US')}`;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.tab === shopTab);
  const body = $('shop-body');
  const titles = { upgrades: 'Workshop', museum: 'Museum', paints: 'Paint Shed', records: 'Records' };
  $('shop-title').textContent = titles[shopTab];
  $('btn-shop-close').textContent = resumeTo === 'play' ? 'Back to digging' : '← Back';
  if (shopTab === 'upgrades') body.innerHTML = upgradesHtml();
  else if (shopTab === 'museum') body.innerHTML = museumHtml();
  else if (shopTab === 'paints') body.innerHTML = paintsHtml();
  else body.innerHTML = recordsHtml();
}

function statText(key, tier) {
  const v = UPGRADES[key].tiers[tier];
  switch (key) {
    case 'drill': return UPGRADES.drill.blurbs[tier];
    case 'tank': return `${v} fuel`;
    case 'cargo': return `${v} gems`;
    case 'hull': return `${v} toughness`;
    case 'lamp': return `${v} tiles of light`;
    case 'prop': return `${v} speed`;
    case 'fan': return tier ? 'Cools lava so you can dig it' : 'Lava is too hot to dig';
    default: return '';
  }
}

function upgradesHtml() {
  const shop = canShop();
  let html = shop ? '' : '<p class="muted center">Land on the base pad to buy upgrades.</p>';
  for (const key of UPGRADE_ORDER) {
    const U = UPGRADES[key];
    const info = upgradeInfo(save, key);
    const pips = U.tiers.slice(1).map((_, i) => `<i class="${i < info.tier ? 'on' : ''}"></i>`).join('');
    let right;
    if (info.maxed) right = '<span class="done">★ Max</span>';
    else if (info.locked) right = `<button class="btn buy" disabled>🔒 Needs<small>${UPGRADES.drill.names[info.locked]}</small></button>`;
    else {
      const short = info.cost - save.coins;
      right = `<button class="btn buy ${info.affordable && shop ? 'primary' : ''}" data-buy="${key}" ${info.affordable && shop ? '' : 'disabled'}>${info.cost.toLocaleString('en-US')} 🪙<small>${short > 0 ? `${short.toLocaleString('en-US')} more` : shop ? 'Buy' : 'At base'}</small></button>`;
    }
    const next = info.maxed ? 'The very best!' : `Next: <b>${U.names[info.next]}</b> · ${statText(key, info.next)}`;
    html += `<div class="branch ${!info.maxed && info.affordable && shop ? 'can' : ''}">
      <div class="ico">${BRANCH_ICONS[key]}</div>
      <div><h3>${U.name}</h3><div class="now">${key === 'fan' && !info.tier ? 'Not installed' : `${U.names[info.tier]} · ${statText(key, info.tier)}`}</div>${key === 'fan' ? '' : `<div class="pips">${pips}</div>`}<div class="next">${next}</div></div>
      ${right}</div>`;
  }
  return html;
}

function museumHtml() {
  let html = `<p class="muted center">Found ${totalPieces(save)} of 24. Finish a set to unlock a pod paint!</p>`;
  for (const set of MUSEUM) {
    const got = set.pieces.filter((id) => save.museum[id]).length;
    const where = set.layers.map((l) => LAYERS[l].name).join(' & ');
    html += `<div class="set"><h3>${set.name} <span class="pill">${got}/4 · ${got === 4 ? '🎨 ' + paintById(set.paint).name : where}</span></h3><div class="pieces">`;
    for (const id of set.pieces) {
      const have = !!save.museum[id];
      html += `<div class="piece ${have ? 'got' : 'missing'}">${PIECE_ICONS[id]}${have ? PIECE_NAMES[id] : '???'}</div>`;
    }
    html += '</div></div>';
  }
  return html;
}

function paintsHtml() {
  let html = '<p class="muted center">Tap a paint to use it on your pod.</p><div class="swatches">';
  for (const p of PAINTS) {
    const own = save.paints.includes(p.id);
    html += `<button class="swatch ${save.paint === p.id ? 'on' : ''} ${own ? '' : 'locked'}" ${own ? `data-paint="${p.id}"` : 'disabled'}>${podIcon(p)}${p.name}<small>${own ? (save.paint === p.id ? 'Wearing it' : 'Owned') : '🔒 ' + p.how}</small></button>`;
  }
  return html + '</div>';
}

function recordsHtml() {
  const s = save.stats;
  const streak = currentStreak(save, localDate());
  let html = '<div class="records"><div class="res-lines">';
  html += [
    ['Deepest dig', `${save.bestDepth} m`], ['Ancient Core', save.core ? '🌈 Reached!' : 'Not yet'], ['Trips', s.trips], ['Gems sold', s.gems],
    ['Coins earned', s.earned.toLocaleString('en-US')], ['Tiles dug', s.dug.toLocaleString('en-US')], ['Wiggles tows', s.tows],
    ['Daily streak', streak ? `🔥 ${streak}` : '-'], ['Best streak', save.daily.bestStreak || 0], ['Mine', `#${save.mineNo}`],
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  html += '</div><h3>Depth milestones</h3>';
  for (const m of MILESTONES) {
    const got = save.milestones.includes(m.m);
    html += `<div class="ms ${got ? 'got' : ''}"><span>${got ? '✓' : '○'} ${m.m} m${m.label ? ` · ${m.label}` : ''}</span><span>+${m.coins} 🪙${m.paint ? ` · 🎨 ${paintById(m.paint).name}` : ''}</span></div>`;
  }
  if (save.core && canShop()) html += '<div class="col"><button class="btn" data-fresh>⛏️ Dig a fresh mine (keep upgrades & museum)</button></div>';
  return html + '</div>';
}

$('shop-body').addEventListener('click', (e) => {
  const buy = e.target.closest('[data-buy]');
  const paint = e.target.closest('[data-paint]');
  const fresh = e.target.closest('[data-fresh]');
  if (buy) {
    const key = buy.dataset.buy;
    if (canShop() && buyUpgrade(save, key)) {
      main.refreshStats();
      main.pod.fuel = main.stats.tank;
      main.pod.hull = main.stats.hull;
      sound.play('buy');
      log.event('upgrade.buy', { key, tier: save.upgrades[key], coins: save.coins });
      persist();
    } else sound.play('no');
    renderShop();
    $('shop-body').querySelector(`[data-buy="${key}"]`)?.focus({ preventScroll: true });
  } else if (paint) {
    save.paint = paint.dataset.paint;
    sound.play('ui');
    persist();
    renderShop();
    $('shop-body').querySelector(`[data-paint="${save.paint}"]`)?.focus({ preventScroll: true });
  } else if (fresh) {
    Session.freshMine(save);
    main = new Session(save);
    log.event('mine.fresh', { mine: save.mineNo });
    persist();
    toast('⛏️ A fresh mine is ready. Happy digging!', 'gold');
    renderer.setSession(main);
    if (resumeTo === 'play') active = main;
    renderShop();
  }
});
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => { shopTab = t.dataset.tab; sound.play('ui'); renderShop(); });

// ------------------------------------------------------------ HUD

const hudCache = {};
function setText(id, text) {
  if (hudCache[id] === text) return;
  hudCache[id] = text;
  $(id).querySelector('b').textContent = text;
}

function setupDepthbar() {
  const H = 300;
  const stops = LAYERS.map((L, i) => {
    const a = (L.top / H) * 100, b = ((LAYERS[i + 1]?.top ?? H) / H) * 100;
    return `${L.colors.light} ${a}%, ${L.colors.light} ${b}%`;
  });
  $('depthbar').style.background = `linear-gradient(180deg, ${stops.join(', ')})`;
}
setupDepthbar();

function updateHud(dt) {
  const s = active;
  if (!s) return;
  const p = s.pod, st = s.stats;
  const fuelK = p.fuel / st.tank, hullK = Math.max(0, p.hull) / st.hull;
  const fb = $('g-fuel'), hb = $('g-hull');
  const fw = `${Math.round(fuelK * 100)}%`, hw = `${Math.round(hullK * 100)}%`;
  if (hudCache.fw !== fw) { hudCache.fw = fw; fb.querySelector('i').style.width = fw; fb.querySelector('.g-num').textContent = Math.ceil(p.fuel); }
  if (hudCache.hw !== hw) { hudCache.hw = hw; hb.querySelector('i').style.width = hw; hb.querySelector('.g-num').textContent = Math.ceil(Math.max(0, p.hull)); }
  hb.classList.toggle('low', hullK < 0.3);
  setText('s-coins', s.kind === 'daily' ? `${s.haul}` : save.coins.toLocaleString('en-US'));
  setText('s-cargo', `${p.cargo.length}/${st.cargo}`);
  $('s-cargo').classList.toggle('full', p.cargo.length >= st.cargo);
  setText('s-depth', `${Math.floor(p.depth * METERS_PER_TILE)} m`);
  // Depth bar (main mine only).
  const db = $('depthbar');
  db.classList.toggle('hidden', s.kind !== 'main');
  if (s.kind === 'main') {
    const k = Math.max(0, Math.min(1, p.depth / s.world.h));
    const pk = `${(k * 100).toFixed(1)}%`;
    if (hudCache.db !== pk) { hudCache.db = pk; db.querySelector('.db-pod').style.top = pk; }
    const bk = `${Math.min(100, (save.bestDepth / METERS_PER_TILE / s.world.h) * 100).toFixed(1)}%`;
    if (hudCache.dbb !== bk) { hudCache.dbb = bk; db.querySelector('.db-best').style.top = bk; }
  }
  // Daily goal chip.
  const goal = $('goal');
  goal.classList.toggle('hidden', s.kind !== 'daily');
  if (s.kind === 'daily') {
    const pr = s.dailyProgress();
    const txt = pr.unit === 'acorn' ? `🎯 Golden Acorn: ${pr.now ? 'got it! Fly home' : 'not found yet'}` : `🎯 ${Math.min(pr.now, pr.target)}/${pr.target} ${pr.unit === 'coins' ? '🪙' : 'm'}${pr.now >= pr.target ? ' · fly home!' : ''}`;
    if (hudCache.goal !== txt) { hudCache.goal = txt; goal.textContent = txt; }
  }
  // Fuel check: enough to fly home?
  const home = (p.depth + 1) / st.fly * st.flyBurn * 1.15 + 2.5;
  const low = p.y > 0.5 && !p.stranded && p.fuel < home * 1.35 + 3;
  fb.classList.toggle('low', low || fuelK < 0.15);
  const warn = $('warn');
  if (low) {
    warn.classList.remove('hidden');
    const t = p.fuel < home ? '⛽ Nearly empty! Fly up now!' : '⛽ Fuel low · time to fly home!';
    if (warn.textContent !== t) warn.textContent = t;
    if (!lowFuelWarned) { lowFuelWarned = true; sound.play('lowfuel'); }
  } else {
    warn.classList.add('hidden');
    if (p.fuel > home * 1.8 + 6) lowFuelWarned = false;
  }
  $('btn-base').classList.toggle('hidden', !(s.kind === 'main' && p.docked && mode === 'play'));
  hintTimer = Math.max(0, hintTimer - dt);
}

// ------------------------------------------------------------ sound buttons

function updateSoundButtons() {
  const label = save.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = label;
  $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', save.muted ? 'Unmute' : 'Mute');
  const ml = save.music ? '🎵 Music on' : '🎵 Music off';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = ml;
}
function toggleMute() { save.muted = !save.muted; sound.unlock(); sound.setMuted(save.muted); persist(); updateSoundButtons(); }
function toggleMusic() { save.music = !save.music; sound.unlock(); sound.setMusic(save.music); persist(); updateSoundButtons(); }

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', startMain);
$('btn-daily').addEventListener('click', openDaily);
$('btn-daily-go').addEventListener('click', startDaily);
$('btn-de-retry').addEventListener('click', startDaily);
$('btn-daily-restart').addEventListener('click', startDaily);
$('btn-title-museum').addEventListener('click', () => { sound.unlock(); openShop('museum'); });
$('btn-title-paints').addEventListener('click', () => { sound.unlock(); openShop('paints'); });
$('btn-resume').addEventListener('click', resume);
$('btn-pause').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-pause-shop').addEventListener('click', () => openShop('upgrades'));
$('btn-base').addEventListener('click', () => openShop('upgrades'));
$('btn-shop-close').addEventListener('click', closeShop);
$('btn-call').addEventListener('click', () => openRescue('call'));
$('btn-tow').addEventListener('click', startTow);
$('btn-tow-cancel').addEventListener('click', () => { mode = 'play'; showScreen(null); });
$('btn-core-ok').addEventListener('click', () => { mode = 'play'; input.clear(); showScreen(null); });
$('btn-help-ok').addEventListener('click', () => { save.seen.help = true; persist(); mode = 'play'; input.clear(); showScreen(null); });
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', toTitle);
addEventListener('resize', () => { renderer.resize(); if (renderer.session) renderer.setSession(renderer.session); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); if (active === main) persist(); } });
addEventListener('pagehide', () => { if (active === main) persist(); });

// Another tab saved: take its progress (and its mine), so this tab never
// writes a stale copy over it (whichever tab saved last used to win).
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY && e.key !== null) return;
  const fresh = loadSave(storage);
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, fresh);
  sound.setMuted(save.muted);
  sound.setMusic(save.music);
  updateSoundButtons();
  const wasMain = active === main;
  main = new Session(save);
  if (wasMain) {
    active = main;
    tow = null;
    if (renderer.session !== demo) renderer.setSession(main);
    if (mode === 'paused') $('pause-info').textContent = `${LAYERS[layerOfPod()].name} · ${depthM()} m`;
    else if (mode !== 'shop') { mode = 'play'; pause(); }
  }
  if (mode === 'title') toTitle();
  else if (mode === 'daily') openDaily();
  else if (mode === 'shop') renderShop();
});
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

function visibleScreen() { return SCREENS.map($).find((s) => !s.classList.contains('hidden')); }
function moveFocus(dir) {
  const screen = visibleScreen();
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not([disabled]), a[href]')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
}
addEventListener('keydown', (e) => {
  if (mode === 'play' || mode === 'tow') return;
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
});

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'shop') closeShop();
  else if (mode === 'rescue' && !main.pod.stranded) { mode = 'play'; showScreen(null); }
  else if (mode === 'core' || mode === 'help') $(mode === 'core' ? 'btn-core-ok' : 'btn-help-ok').click();
  else if (mode === 'daily' || mode === 'dailyEnd') toTitle();
}

// ------------------------------------------------------------ loop

let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, kind: active ? active.kind : 'demo', depth: active ? depthM() : 0, chunks: renderer.chunks.size }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.pollPad();
  updatePointer(dt);

  const esc = input.consume('Escape');
  if (esc || input.consume('KeyP') || input.consumePad('start')) {
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
    else if (esc) back();
  }
  if (input.consume('KeyM')) toggleMute();
  const shopKey = input.consume('KeyE') || input.consume('Enter') || input.consumePad('x') || input.consumePad('y');
  if (mode === 'play' && shopKey && active === main && main.pod.docked) openShop('upgrades');
  if (mode !== 'play' && mode !== 'tow') {
    if (input.consumePad('up') || input.consumePad('left')) moveFocus(-1);
    if (input.consumePad('down') || input.consumePad('right')) moveFocus(1);
    if (input.consumePad('a')) document.activeElement?.click?.();
    if (input.consumePad('b')) back();
  } else {
    input.padEdges.clear();
  }

  let session = active;
  if (mode === 'title' || mode === 'daily' || (mode === 'shop' && !active)) {
    session = demo;
    accumulator += dt;
    let n = 0;
    while (accumulator >= STEP && n++ < 4) {
      demo.step(STEP, demoBot.controls(demo, STEP));
      if (demo.pod.stranded) { demo.tow(); demoBot.reset(); }
      for (const e of demo.events) if (e.type === 'docked') demoBot.reset();
      accumulator -= STEP;
    }
    demo.demoTime += dt;
    renderer.handleEvents(demo.events);
    demo.events.length = 0;
    if (demo.demoTime > 240) makeDemo();
    renderer.update(dt, demo);
  } else if (mode === 'play' && session) {
    const ps = renderer.TS;
    const podScreen = { x: renderer.sx(session.pod.x), y: renderer.sy(session.pod.y) };
    const ctl = autopilot && session === main ? autopilot.controls(session, dt) : input.read(podScreen, ps);
    accumulator += dt;
    let n = 0;
    while (accumulator >= STEP && n++ < 4) {
      session.step(STEP, ctl);
      accumulator -= STEP;
      if (session.events.length) handleEvents(session);
      if (mode !== 'play') break;
    }
    if (accumulator > STEP * 4) accumulator = 0;
    renderer.update(dt, session);
    const p = session.pod;
    sound.hum({ drilling: !!p.drill, hard: p.drill ? (session.mine.digInfo(p.drill.tx, p.drill.ty).hard || 1) : 1, flying: p.flying });
    sound.setLayer(layerOfPod());
    if (session === main) {
      saveTimer += dt;
      if (saveTimer > 5) { saveTimer = 0; persist(); }
    }
  } else if (mode === 'tow' && tow) {
    updateTow(dt);
    renderer.update(dt, main);
    sound.hum({});
  } else {
    sound.hum({});
  }
  if (mode === 'play' || mode === 'tow' || mode === 'paused' || mode === 'shop' || mode === 'rescue' || mode === 'core' || mode === 'help') updateHud(dt);

  const drawn = session || main;
  renderer.draw(drawn, {
    paint: drawn === demo ? 'sunflower' : save.paint,
    tow: mode === 'tow' && tow ? tow : null,
    fade: mode === 'tow' && tow ? tow.fade || 0 : 0,
  });
  requestAnimationFrame(loop);
}

const loop = telemetry ? telemetry.guard(frame, 'mole-miner.frame') : frame;

if (location.protocol !== 'file:') {
  log.event('game.ready', { best: save.bestDepth, drill: save.upgrades.drill, museum: totalPieces(save), core: save.core, trips: save.stats.trips });
  if (params.has('daily')) { toTitle(); openDaily(); }
  else if (params.has('play') || autopilot) { toTitle(); startMain(); if (autopilot) { save.seen.help = true; mode = 'play'; showScreen(null); } }
  else toTitle();
  requestAnimationFrame(loop);
}

window.MM = {
  get main() { return main; }, get active() { return active; }, get mode() { return mode; }, get demo() { return demo; },
  save, renderer, input, sound, startMain, startDaily, openShop, toTitle, persist, ORES,
};
