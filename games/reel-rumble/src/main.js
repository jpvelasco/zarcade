// Browser entry: screens, the loop, input, sound, saves and telemetry.
import { WATERS, WATER, FISH, FISH_BY_ID, fishOfWater, PERIOD_INFO, WEATHER_INFO, RARITY_INFO, BEHAVIORS, SPECIALS } from './data.js';
import { SLOTS, BAITS, find, buy, buyBlock, equip, owns, speciesCaught, fishForBait } from './gear.js';
import { periodOf, weatherFor, advanceClock, nextPeriodHour } from './spawn.js';
import { Trip } from './trip.js';
import { Bot } from './bot.js';
import { readout } from './fight.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { drawFish, bakeFish } from './fishart.js';
import { loadSave, writeSave, recordCatch, markSeen } from './progress.js';
import { QUESTS, openQuests, questProgress, settleQuests, TOURNAMENTS, TOURNAMENT_BY_ID, TOURNAMENT_FISH, tournamentOpen, newTournament, tournamentCount, tournamentResult, awardMedal } from './quests.js';
import { frameMonitor } from './perf.js';
import { hashSeed } from './rng.js';

const STEP = 1 / 60;
const COIN = '<i class="coin" aria-label="coins"></i>';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const canvas = $('game');
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
if (!WATER[save.water]) save.water = 'pond';
let saveWarned = false;
function persist() {
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const renderer = new Renderer(canvas, { reducedMotion: reduced });
const input = new Input(canvas);
if (coarse) input.mode = 'touch'; // touch wording before the first touch
const sound = new Sound({ muted: save.muted, music: save.music });

let mode = 'title'; // title | fish | paused | menu | catch | tourney
let menuFrom = 'title';
let trip = null; // the player's spot
let demo = null; // title-screen attract spot
let demoBot = new Bot({ skill: 0.9 });
const autopilot = params.has('autopilot') ? new Bot({ skill: 1 }) : null;
let accumulator = 0;
let pendingScene = false;
let pendingEquip = false;
let lostTimer = 0;
let landTimer = 0;
let tourney = null;
let lastHint = '';
let steerTouch = 0;

const SCREENS = ['screen-title', 'screen-map', 'screen-shop', 'screen-book', 'screen-gill', 'screen-bait', 'screen-pause', 'screen-catch', 'screen-tourney'];

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const fishing = mode === 'fish';
  $('hud').classList.toggle('hidden', !(fishing || mode === 'catch'));
  input.enabled = fishing;
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .fish-cell, .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(fishing ? 0.8 : 0.5);
  updateHint(true);
}

function toast(text, gold = false) {
  const el = document.createElement('div');
  el.className = `toast${gold ? ' gold' : ''}`;
  el.textContent = text;
  const box = $('toasts');
  while (box.children.length > 2) box.firstChild.remove();
  box.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ------------------------------------------------------------ clock and scenes

function hourLabel(h) {
  const hh = Math.floor(h) % 24, mm = Math.round((h % 1) * 60) % 60;
  const ap = hh < 12 ? 'am' : 'pm';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

function conditions(waterId) {
  const period = periodOf(save.clock.hour, waterId);
  const weather = weatherFor(waterId, save.clock.day, save.clock.hour);
  return { period, weather };
}

function buildTrip() {
  const water = save.water;
  const { period, weather } = conditions(water);
  trip = new Trip({ water, period, weather, equip: save.equip, seed: hashSeed(save.clock.day, Math.floor(save.clock.hour * 2), save.stats.casts), castIndex: save.stats.casts });
  renderer.setScene(trip);
  sound.setScene(water, period);
  pendingScene = false;
  pendingEquip = false;
  queueMicrotask(() => monitor.mark(performance.now()));
  updateHud();
  log.event('level.start', { water, period, weather, bait: save.equip.bait, species: speciesCaught(save) });
}

function buildDemo() {
  const options = WATERS.filter((w) => !w.boat || owns(save, 'boat', w.boat));
  const w = options.find((o) => o.id === save.water) || options[0];
  const { period, weather } = conditions(w.id);
  const equipDemo = { ...save.equip };
  const likes = BAITS.filter((b) => owns(save, 'bait', b.id) && FISH.some((f) => f.water === w.id && f.baits.includes(b.id) && f.rarity !== 'legendary'));
  if (likes.length) equipDemo.bait = likes[Math.floor(Math.random() * likes.length)].id;
  demo = new Trip({ water: w.id, period, weather, equip: equipDemo, seed: (Math.random() * 1e9) | 0 });
  demoBot = new Bot({ skill: 0.9 });
  renderer.setScene(demo);
  sound.setScene(w.id, period);
  queueMicrotask(() => monitor.mark(performance.now()));
}

function sceneChanged() {
  if (!trip) return false;
  const { period, weather } = conditions(trip.water.id);
  return period !== trip.period || weather !== trip.weather;
}

function announceScene() {
  const { period, weather } = conditions(save.water);
  const p = PERIOD_INFO[period], w = WEATHER_INFO[weather];
  toast(`${p.icon} ${p.name} at ${WATER[save.water].name} · ${w.icon} ${w.name}`);
}

// ------------------------------------------------------------ fishing flow

function startFishing(waterId = save.water, { force = false } = {}) {
  sound.unlock();
  let w = WATER[waterId];
  // A water without its boat (left over from a ?water= visit) falls back to
  // the pond instead of leaving the Go fishing button dead.
  if (w.boat && !owns(save, 'boat', w.boat) && !force) { waterId = 'pond'; w = WATER.pond; }
  if (w.nightOnly && periodOf(save.clock.hour) !== 'night') {
    const h = save.clock.hour;
    save.clock = advanceClock(save.clock, h < 20 ? 20 - h : 0);
    toast('🌙 The Star Ferry sails at nightfall…');
  }
  save.water = waterId;
  persist();
  buildTrip();
  mode = 'fish';
  menuFrom = 'fish';
  accumulator = 0;
  input.clear();
  showScreen(null);
  if (!save.intro) {
    save.intro = true;
    persist();
    setTimeout(() => toast('👴 Gill: Hold to charge your cast, let go to throw. Tap when the bobber dives!', true), 400);
  }
}

function resumeFishing() {
  if (!trip) return startFishing();
  if (WATER[save.water] !== trip.water) return startFishing(save.water);
  mode = 'fish';
  menuFrom = 'fish';
  renderer.setScene(trip);
  if (trip.state === 'ready' && (pendingScene || sceneChanged())) { buildTrip(); announceScene(); }
  if (trip.state === 'ready' && pendingEquip) { trip.setEquip(save.equip); pendingEquip = false; }
  input.clear();
  showScreen(null);
  updateHud();
}

function pause() {
  if (mode !== 'fish') return;
  mode = 'paused';
  menuFrom = 'fish';
  updateSoundButtons();
  showScreen('screen-pause');
}

function onEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'cast':
        save.stats.casts++;
        save.clock = advanceClock(save.clock, 0.5);
        if (sceneChanged()) pendingScene = true;
        updateHud();
        break;
      case 'approach': case 'arrive': case 'sniff':
        if (markSeen(save, e.fish.id)) persist();
        if (e.type === 'sniff' && save.book[e.fish.id]?.n) toast(`A ${e.fish.name} sniffed your ${find('bait', trip.bait).name}… it wants something else.`);
        break;
      case 'hooked':
        if (trip.fight?.fish.rarity === 'legendary') toast(`✨ It's ${trip.fight.fish.name}! A legend!`, true);
        log.event('fish.hooked', { fish: trip.fight?.fish.id, quality: e.quality });
        break;
      case 'special': toast(`✨ ${SPECIALS[e.special].tip}`, true); break;
      case 'landed': landTimer = 1.0; break;
      case 'lost': {
        save.stats.lost++;
        persist();
        lostTimer = 1.8;
        log.event('level.fail', { water: save.water, fish: e.fish.id, reason: e.reason });
        if (e.fish.rarity === 'legendary') setTimeout(() => toast(`${e.fish.name} got away… legends are tricky! Try again.`), 600);
        if (tourney) countTourney(null);
        break;
      }
      case 'reeledIn':
        if (pendingScene || sceneChanged()) { buildTrip(); announceScene(); }
        else if (pendingEquip) { trip.setEquip(save.equip); pendingEquip = false; }
        break;
      default: break;
    }
  }
}

function showCatch() {
  const r = trip.result;
  const { period, weather } = trip;
  const rec = recordCatch(save, r);
  const done = settleQuests(save, { result: r, water: save.water, period, weather });
  persist();
  mode = 'catch';
  log.event('level.complete', {
    water: save.water, fish: r.fish.id, rarity: r.fish.rarity, kg: r.kg, cm: r.cm, coins: r.coins,
    'fight.s': Math.round(r.time), quality: r.quality, 'species.new': rec.newSpecies, species: speciesCaught(save),
  });
  const badges = [];
  if (rec.newSpecies) badges.push('<span class="badge gold">NEW FISH!</span>');
  if (rec.newRecord) badges.push('<span class="badge teal">NEW RECORD!</span>');
  if (r.quality === 'perfect') badges.push('<span class="badge">PERFECT HOOK</span>');
  $('catch-badges').innerHTML = badges.join('');
  const art = $('catch-art');
  const g = art.getContext('2d');
  g.clearRect(0, 0, art.width, art.height);
  g.save();
  g.translate(art.width / 2, art.height / 2);
  const L = r.fish.look.shape === 'eel' || r.fish.look.shape === 'marlin' ? 420 : r.fish.look.shape === 'angel' || r.fish.look.shape === 'puffer' || r.fish.look.shape === 'round' ? 250 : 340;
  drawFish(g, r.fish.look, L);
  g.restore();
  $('catch-name').textContent = r.fish.name;
  const ri = RARITY_INFO[r.fish.rarity];
  $('catch-rarity').textContent = ri.name;
  $('catch-rarity').style.color = shadeText(ri.color);
  const lines = [['Length', `${r.cm} cm`], ['Weight', `${r.kg} kg`], ['Coins', `+${r.coins} ${COIN}`]];
  if (!rec.newSpecies) lines.push(['Your record', `${save.book[r.fish.id].kg} kg`]);
  $('catch-lines').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  $('catch-fact').textContent = r.fish.fact;
  showScreen('screen-catch');
  if (rec.newSpecies) sound.newSpecies(); else sound.coin();
  bumpCoins();
  for (const q of done) questDone(q);
  if (tourney) countTourney(r);
}

function shadeText(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = 0.55;
  return `rgb(${((n >> 16) & 255) * f | 0},${((n >> 8) & 255) * f | 0},${(n & 255) * f | 0})`;
}

function questDone(q) {
  setTimeout(() => {
    toast(`👴 Quest complete: ${q.title}! +${q.reward} coins`, true);
    sound.quest();
    bumpCoins();
  }, 500);
  log.event('quest.complete', { quest: q.id, reward: q.reward });
}

function keepFishing() {
  if (tourneyFinished) return showTourneyResult();
  trip.next();
  resumeFishing();
}

// ------------------------------------------------------------ tournaments

let tourneyFinished = false;
function startTourney(t) {
  tourney = { t, run: newTournament(t) };
  tourneyFinished = false;
  log.event('tournament.start', { tournament: t.id });
  startFishing(t.water);
  toast(`🏆 ${t.name}: hook ${TOURNAMENT_FISH} fish. The heaviest total wins!`, true);
  updateHud();
}

function countTourney(result) {
  if (!tourney) return;
  const over = tournamentCount(tourney.run, result);
  updateHud();
  if (over) {
    tourneyFinished = true;
    if (!result) setTimeout(() => { if (mode === 'fish' && trip.state === 'lost') showTourneyResult(); }, 1500);
  }
}

function showTourneyResult() {
  const { t, run } = tourney;
  const res = tournamentResult(t, run.kg);
  const gain = awardMedal(save, t, res);
  persist();
  log.event('tournament.end', { tournament: t.id, kg: run.kg, medal: res.medal || 'none', place: res.place + 1 });
  tourney = null;
  tourneyFinished = false;
  mode = 'tourney';
  $('tourney-title').textContent = res.medal ? `${{ gold: '🥇 Gold', silver: '🥈 Silver', bronze: '🥉 Bronze' }[res.medal]}!` : 'So close!';
  $('tourney-sub').textContent = `${t.name} · your total ${run.kg} kg`;
  $('tourney-table').innerHTML = res.table.map((r, i) => `<div class="${r.you ? 'you' : ''}"><span>${i + 1}. ${r.name}</span><b>${r.kg} kg</b></div>`).join('');
  $('tourney-prize').innerHTML = gain ? `+${gain} ${COIN}` : res.medal ? 'Medal kept!' : 'Try again any time!';
  if (res.medal) sound.quest();
  showScreen('screen-tourney');
  updateHud();
}

// ------------------------------------------------------------ HUD

function updateHud() {
  const w = WATER[save.water];
  $('chip-place').textContent = w.name;
  const { period, weather } = trip ? { period: trip.period, weather: trip.weather } : conditions(save.water);
  $('chip-time').textContent = `${PERIOD_INFO[period].icon} ${hourLabel(save.clock.hour)} · ${WEATHER_INFO[weather].icon} ${WEATHER_INFO[weather].name}`;
  $('chip-coins').innerHTML = `${COIN} ${save.coins.toLocaleString('en-US')}`;
  const b = find('bait', save.equip.bait);
  $('btn-bait').innerHTML = `<span class="swatch" style="background:${b.color}"></span>${b.name}`;
  $('chip-tourney').classList.toggle('hidden', !tourney);
  if (tourney) $('chip-tourney').textContent = `🏆 Fish ${Math.min(TOURNAMENT_FISH, tourney.run.fish + (tourneyFinished ? 0 : 1))}/${TOURNAMENT_FISH} · ${tourney.run.kg} kg`;
}

function bumpCoins() {
  updateHud();
  const c = $('chip-coins');
  c.classList.remove('bump');
  void c.offsetWidth;
  c.classList.add('bump');
}

function hintFor(t) {
  const touch = input.mode === 'touch';
  const pad = input.mode === 'pad';
  const hold = touch ? 'Touch the water and hold' : pad ? 'Hold A' : input.mode === 'mouse' ? 'Hold the mouse button' : 'Hold Space';
  switch (t.state) {
    case 'ready': return `${hold} to charge your cast${touch ? '' : pad ? ' · stick aims' : input.mode === 'mouse' ? ' · point to aim' : ' · ← → aim'}`;
    case 'charging': return 'Let go when the meter reaches the white mark!';
    case 'flying': return '';
    case 'sinking': case 'waiting': return `Wait for a bite… ${touch ? 'tap' : pad ? 'A' : 'click / Space'} to twitch · hold to reel in`;
    case 'reeling': return 'Reeling in… let go to stop';
    case 'nibble': return 'A nibble! Wait for it…';
    case 'bite': return touch ? 'TAP NOW!' : pad ? 'PRESS A NOW!' : 'CLICK / SPACE NOW!';
    case 'fight': return save.stats.caught > 3 ? '' : `Hold to reel · let go when it's too tight${touch ? '' : pad ? ' · stick steers' : input.mode === 'mouse' ? ' · move the mouse ← → to steer' : ' · ← → steer'}`;
    default: return '';
  }
}

function updateHint(force = false) {
  const el = $('hint');
  const text = mode === 'fish' && trip ? hintFor(trip) : '';
  if (text === lastHint && !force) return;
  lastHint = text;
  el.textContent = text;
  el.classList.toggle('hidden', !text);
  const fighting = mode === 'fish' && trip?.state === 'fight';
  el.classList.toggle('raise', fighting);
  el.classList.toggle('touch', coarse);
  el.classList.toggle('urgent', mode === 'fish' && trip?.state === 'bite');
  $('touch-steer').classList.toggle('hidden', !(coarse && fighting));
}

// ------------------------------------------------------------ menus

function openMenu(which) {
  sound.unlock();
  if (mode === 'fish' || mode === 'paused') menuFrom = 'fish';
  else if (mode === 'title') menuFrom = 'title';
  mode = 'menu';
  if (which === 'map') renderMap();
  if (which === 'shop') renderShop();
  if (which === 'book') renderBook();
  if (which === 'gill') renderGill();
  if (which === 'bait') renderBait();
  showScreen(`screen-${which}`);
}

function back() {
  sound.click();
  if (mode === 'paused') return resumeFishing();
  if (mode === 'menu' || mode === 'tourney') {
    if (menuFrom === 'fish' && trip) {
      if (mode === 'tourney') trip.next();
      return resumeFishing();
    }
    return toTitle();
  }
}

function toTitle() {
  mode = 'title';
  menuFrom = 'title';
  tourney = null;
  tourneyFinished = false;
  buildDemo();
  const n = speciesCaught(save);
  const homeWater = WATER[save.water].boat && !owns(save, 'boat', WATER[save.water].boat) ? WATER.pond : WATER[save.water];
  $('btn-play').textContent = save.stats.caught ? `Go fishing · ${homeWater.name}` : 'Go fishing';
  $('title-stats').innerHTML = n ? `📖 ${n} / ${FISH.length} fish · ${COIN} ${save.coins.toLocaleString('en-US')}` : '';
  updateSoundButtons();
  showScreen('screen-title');
}

// Map
function renderMap() {
  $('map-clock').textContent = `Day ${save.clock.day} · ${hourLabel(save.clock.hour)}`;
  const grid = $('map-grid');
  grid.innerHTML = '';
  for (const w of WATERS) {
    const open = !w.boat || owns(save, 'boat', w.boat);
    const got = fishOfWater(w.id).filter((f) => save.book[f.id]?.n).length;
    const { period, weather } = conditions(w.id);
    const card = document.createElement('div');
    card.className = `water-card${open ? '' : ' locked'}${trip && trip.water.id === w.id && menuFrom === 'fish' ? ' here' : ''}`;
    card.style.setProperty('--accent', w.accent);
    const boat = w.boat ? find('boat', w.boat) : null;
    card.innerHTML = `<h3>${w.name}</h3><p class="muted" style="margin:0">${w.blurb}</p>
      <div class="meta"><span>📖 ${got}/${fishOfWater(w.id).length}</span><span>${PERIOD_INFO[period].icon} ${PERIOD_INFO[period].name}</span><span>${WEATHER_INFO[weather].icon} ${WEATHER_INFO[weather].name}</span></div>`;
    const btn = document.createElement('button');
    btn.className = `btn ${open ? 'teal' : ''}`;
    btn.innerHTML = open ? (trip && trip.water.id === w.id && menuFrom === 'fish' ? 'Back to fishing' : 'Fish here') : `<span>Needs the ${boat.name} <span class="nowrap">(${boat.price} ${COIN})</span></span>`;
    btn.addEventListener('click', () => {
      sound.click();
      if (!open) { shopTab = 'boat'; return openMenu('shop'); }
      if (trip && trip.water.id === w.id && menuFrom === 'fish') return resumeFishing();
      log.event('travel', { water: w.id });
      startFishing(w.id);
      announceScene();
    });
    card.appendChild(btn);
    grid.appendChild(card);
  }
}

// Shop
let shopTab = 'rod';
const TAB_NAMES = { rod: '🎣 Rods', reel: '⚙️ Reels', line: '🧵 Lines', bait: '🪱 Bait', boat: '⛵ Boats' };
function statsLine(slot, it) {
  if (slot === 'rod') return `Cast ${it.cast} m · Flex ${Math.round((1 - it.flex) * 100 + 10)}`;
  if (slot === 'reel') return `Reel ${it.reelSpeed} m/s · Power ${it.reelPower}`;
  if (slot === 'line') return `Holds ${it.strength} kg of tug`;
  if (slot === 'bait') {
    const known = fishForBait(it.id).filter((f) => save.book[f.id]?.n).map((f) => f.name);
    return known.length ? `Caught with it: ${known.slice(0, 3).join(', ')}${known.length > 3 ? '…' : ''}` : 'Who will bite?';
  }
  return `Opens ${WATER[it.water].name}`;
}
function renderShop() {
  $('shop-coins').innerHTML = `${COIN} ${save.coins.toLocaleString('en-US')}`;
  const tabs = $('shop-tabs');
  tabs.innerHTML = '';
  for (const slot of Object.keys(SLOTS)) {
    const b = document.createElement('button');
    b.className = `tab${slot === shopTab ? ' on' : ''}`;
    b.textContent = TAB_NAMES[slot];
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { shopTab = slot; sound.click(); renderShop(); tabs.querySelector('.on')?.focus(); });
    tabs.appendChild(b);
  }
  const grid = $('shop-grid');
  grid.innerHTML = '';
  for (const it of SLOTS[shopTab]) {
    const have = owns(save, shopTab, it.id);
    const on = shopTab !== 'boat' && save.equip[shopTab] === it.id;
    const el = document.createElement('div');
    el.className = `item${on ? ' equipped' : ''}`;
    el.innerHTML = `<h4>${shopTab === 'bait' ? `<span class="swatch" style="background:${it.color}"></span>` : ''}${it.name}</h4><div class="stats">${statsLine(shopTab, it)}</div><p class="blurb">${it.blurb}</p>`;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    const block = buyBlock(save, shopTab, it.id);
    if (have) {
      btn.textContent = shopTab === 'boat' ? 'Owned ✓' : on ? 'Using ✓' : 'Use this';
      btn.disabled = shopTab === 'boat' || on;
      btn.addEventListener('click', () => { equip(save, shopTab, it.id); onEquipChanged(); renderShop(); });
    } else {
      btn.innerHTML = block && block !== 'Not enough coins' ? block : `Buy · ${it.price} ${COIN}`;
      btn.disabled = !!block;
      if (!block) btn.classList.add('primary');
      btn.addEventListener('click', () => {
        if (!buy(save, shopTab, it.id)) return;
        sound.coin();
        log.event('shop.buy', { item: `${shopTab}:${it.id}`, price: it.price, coins: save.coins });
        toast(shopTab === 'boat' ? `⛵ ${it.name}! You can now visit ${WATER[it.water].name}.` : `🎣 New ${it.name}!`, true);
        onEquipChanged();
        renderShop();
      });
    }
    el.appendChild(btn);
    grid.appendChild(el);
  }
}

function onEquipChanged() {
  persist();
  if (trip) {
    if (trip.state === 'ready') trip.setEquip(save.equip);
    else pendingEquip = true;
  }
  updateHud();
}

// Bait picker
function renderBait() {
  const grid = $('bait-grid');
  grid.innerHTML = '';
  for (const b of BAITS) {
    if (!owns(save, 'bait', b.id)) continue;
    const el = document.createElement('button');
    el.className = `item${save.equip.bait === b.id ? ' equipped' : ''}`;
    el.innerHTML = `<h4><span class="swatch" style="background:${b.color}"></span>${b.name}</h4><div class="stats">${statsLine('bait', b)}</div>`;
    el.addEventListener('click', () => {
      equip(save, 'bait', b.id);
      sound.click();
      onEquipChanged();
      if (trip && trip.state !== 'ready' && trip.state !== 'fight') toast('New bait goes on after this cast. Hold to reel in!');
      back();
    });
    grid.appendChild(el);
  }
}

// Book
let bookWater = 'pond';
let bookFish = null;
const thumbs = new Map();
function thumb(f, known) {
  const key = `${f.id}:${known ? 1 : 0}`;
  let t = thumbs.get(key);
  if (!t) {
    t = bakeFish(f.look, 64, { silhouette: known ? null : '#2a4a5a', scale: 2 });
    thumbs.set(key, t);
  }
  return t;
}
function renderBook() {
  const total = speciesCaught(save);
  $('book-count').textContent = `${total} / ${FISH.length}`;
  const tabs = $('book-tabs');
  tabs.innerHTML = '';
  for (const w of WATERS) {
    const b = document.createElement('button');
    b.className = `tab${w.id === bookWater ? ' on' : ''}`;
    const got = fishOfWater(w.id).filter((f) => save.book[f.id]?.n).length;
    b.textContent = `${innerWidth < 700 ? w.short : w.name} ${got}/${fishOfWater(w.id).length}`;
    b.addEventListener('click', () => { bookWater = w.id; bookFish = null; sound.click(); renderBook(); });
    tabs.appendChild(b);
  }
  const grid = $('book-grid');
  grid.innerHTML = '';
  const list = fishOfWater(bookWater);
  if (!bookFish || bookFish.water !== bookWater) bookFish = list[0];
  for (const f of list) {
    const caught = save.book[f.id]?.n > 0;
    const seen = caught || save.seen.includes(f.id);
    const cell = document.createElement('button');
    cell.className = `fish-cell${f === bookFish ? ' on' : ''}`;
    const c = document.createElement('canvas');
    c.width = 192; c.height = 112;
    const t = thumb(f, caught);
    const g = c.getContext('2d');
    const sc = Math.min(192 / (t.w * 2), 112 / (t.h * 2)) * 2;
    g.drawImage(t.canvas, (192 - t.w * sc) / 2, (112 - t.h * sc) / 2, t.w * sc, t.h * sc);
    cell.appendChild(c);
    const name = document.createElement('span');
    name.textContent = caught || f.rarity === 'legendary' || seen ? f.name : '???';
    cell.appendChild(name);
    const r = document.createElement('i');
    r.className = 'r';
    r.style.background = caught ? RARITY_INFO[f.rarity].color : '#e8dcc0';
    cell.appendChild(r);
    cell.addEventListener('click', () => { bookFish = f; sound.click(); renderBookDetail(); for (const x of grid.children) x.classList.toggle('on', x === cell); });
    cell.addEventListener('focus', () => { bookFish = f; renderBookDetail(); for (const x of grid.children) x.classList.toggle('on', x === cell); });
    grid.appendChild(cell);
  }
  renderBookDetail();
}

const BAND_NAME = { shallow: 'shallow water', mid: 'middle depths', deep: 'deep water' };
function renderBookDetail() {
  const f = bookFish;
  const el = $('book-detail');
  const e = save.book[f.id];
  const caught = e?.n > 0;
  const seen = caught || save.seen.includes(f.id);
  const legend = f.rarity === 'legendary';
  const when = f.periods ? f.periods.map((p) => `${PERIOD_INFO[p].icon} ${PERIOD_INFO[p].name}`).join(', ') : WATER[f.water].nightOnly ? '🌙 Night' : 'Any time';
  const weather = f.weathers ? f.weathers.map((w) => `${WEATHER_INFO[w].icon} ${WEATHER_INFO[w].name}`).join(', ') : 'Any weather';
  const rows = [];
  if (seen || legend) {
    rows.push(`<div><b>Where:</b> ${WATER[f.water].name}, ${f.bands.map((b) => BAND_NAME[b]).join(' or ')}</div>`);
    rows.push(`<div><b>When:</b> ${when}</div>`);
    rows.push(`<div><b>Weather:</b> ${weather}</div>`);
  }
  if (caught || legend) rows.push(`<div><b>Bait:</b> ${f.baits.map((b) => find('bait', b).name).join(', ')}</div>`);
  if (caught) {
    rows.push(`<div><b>Fights like:</b> ${BEHAVIORS[f.behavior].name}${f.special ? ` · ${SPECIALS[f.special].name}` : ''}</div>`);
    rows.push(`<div><b>Caught:</b> ${e.n} · <b>Best:</b> ${e.kg} kg, ${e.cm} cm</div>`);
  }
  el.innerHTML = `<canvas width="560" height="300"></canvas>
    <h3>${caught || seen || legend ? f.name : '???'}</h3>
    <p class="rarity" style="color:${shadeText(RARITY_INFO[f.rarity].color)}">${RARITY_INFO[f.rarity].name}</p>
    <div class="facts">${rows.join('') || '<div>Not spotted yet. Try other places, times, weather and bait!</div>'}</div>
    ${caught ? `<p class="fact">${f.fact}</p>` : legend ? '<p class="fact">Gill: "Only the Starlight Lure tempts a legend. Bring your strongest line!"</p>' : seen ? '<p class="fact">You spotted this one. Catch it to learn more!</p>' : ''}`;
  const c = el.querySelector('canvas');
  const g = c.getContext('2d');
  g.translate(280, 150);
  const L = f.look.shape === 'eel' || f.look.shape === 'marlin' ? 400 : f.look.shape === 'angel' || f.look.shape === 'puffer' || f.look.shape === 'round' ? 240 : 320;
  drawFish(g, f.look, L, { silhouette: caught ? null : '#2a4a5a' });
}

// Gill
const GILL_LINES = [
  'Ahoy, young angler! Hold to cast, let go to throw. When the bobber dives, tap quick!',
  'Keep the needle in the green when you reel. Too tight and SNAP! Too loose and it wriggles free.',
  'Different fish like different bait. Peek in your fish book for clues.',
  'Fish change with the time of day and the weather. Use ⏳ to wait a while.',
  'Steer against a running fish with the arrow keys. It tires them out faster!',
  'Legends only bite the Starlight Lure. Bring your strongest line and your best rod!',
];
function renderGill() {
  $('gill-coins').innerHTML = `${COIN} ${save.coins.toLocaleString('en-US')}`;
  const tip = save.stats.caught === 0 ? GILL_LINES[0] : GILL_LINES[(save.stats.casts + save.quests.length) % GILL_LINES.length];
  $('gill-says').textContent = tip;
  const ql = $('quest-list');
  ql.innerHTML = '';
  const shown = [...openQuests(save), ...QUESTS.filter((q) => save.quests.includes(q.id)).slice(-2)];
  for (const q of shown) {
    const [h, n] = questProgress(save, q);
    const done = save.quests.includes(q.id);
    const el = document.createElement('div');
    el.className = `quest${done ? ' done' : ''}`;
    const pct = Math.round(Math.min(1, h / n) * 100);
    el.innerHTML = `<h4>${done ? '✅ ' : ''}${q.title}<span>${q.reward} ${COIN}</span></h4><p>${q.text}</p><div class="bar"><i style="width:${pct}%"></i></div>`;
    ql.appendChild(el);
  }
  const lockedCount = QUESTS.filter((q) => !save.quests.includes(q.id) && !openQuests(save).includes(q)).length;
  if (lockedCount) {
    const el = document.createElement('p');
    el.className = 'muted';
    el.textContent = `${lockedCount} more quests to unlock…`;
    ql.appendChild(el);
  }
  const tl = $('tourney-list');
  tl.innerHTML = '';
  for (const t of TOURNAMENTS) {
    const open = tournamentOpen(save, t);
    const w = WATER[t.water];
    const canGo = !w.boat || owns(save, 'boat', w.boat);
    const medal = save.medals[t.id];
    const el = document.createElement('div');
    el.className = 'quest';
    el.innerHTML = `<h4>${medal ? { gold: '🥇', silver: '🥈', bronze: '🥉' }[medal] + ' ' : '🏆 '}${t.name}<span>up to ${t.prizes.gold} ${COIN}</span></h4>
      <p>${open ? `Hook ${TOURNAMENT_FISH} fish at ${w.name}. Beat ${t.rivals.map(([n, kg]) => `${n} (${kg} kg)`).join(', ')}.` : `Unlocks after the "${QUESTS.find((q) => q.id === t.needs).title}" quest.`}</p>`;
    if (open) {
      const b = document.createElement('button');
      b.className = 'btn small teal';
      b.textContent = canGo ? (medal === 'gold' ? 'Play again' : 'Enter!') : `Needs the ${find('boat', w.boat).name}`;
      b.disabled = !canGo;
      b.addEventListener('click', () => { sound.click(); startTourney(t); });
      el.appendChild(b);
    }
    tl.appendChild(el);
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

function waitAWhile() {
  if (!trip || mode !== 'fish') return;
  if (trip.state !== 'ready' && trip.state !== 'waiting' && trip.state !== 'sinking') return toast('Finish this cast first!');
  const target = nextPeriodHour(save.clock.hour, save.water);
  save.clock = advanceClock(save.clock, target - save.clock.hour);
  persist();
  buildTrip();
  announceScene();
  log.event('clock.wait', { hour: Math.floor(save.clock.hour), water: save.water });
}

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', () => { sound.click(); startFishing(); announceScene(); });
$('btn-resume').addEventListener('click', resumeFishing);
$('btn-title').addEventListener('click', toTitle);
$('btn-pause').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-wait').addEventListener('click', waitAWhile);
$('btn-bait').addEventListener('click', () => openMenu('bait'));
$('btn-hud-book').addEventListener('click', () => { bookWater = save.water; bookFish = null; openMenu('book'); });
$('btn-hud-map').addEventListener('click', () => openMenu('map'));
$('btn-keep').addEventListener('click', keepFishing);
$('btn-tourney-done').addEventListener('click', () => { sound.click(); if (trip) trip.next(); resumeFishing(); });
for (const b of document.querySelectorAll('[data-open]')) b.addEventListener('click', () => { sound.click(); openMenu(b.dataset.open); });
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', back);
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const [id, d] of [['steer-left', -1], ['steer-right', 1]]) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); steerTouch = d; input.touchSteer = d; el.classList.add('on'); };
  const off = () => { if (steerTouch === d) { steerTouch = 0; input.touchSteer = 0; } el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
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
  if (mode === 'fish') return;
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
});

// ------------------------------------------------------------ loop

let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'fish' && pointerIdle > 2);
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, water: (trip || demo)?.water.id || 'none', state: (mode === 'fish' ? trip : demo)?.state || 'none', fish: (trip || demo)?.fishes.length ?? 0 }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

function aimAt(clientX) {
  if (!trip) return null;
  const x = renderer.worldX(clientX);
  if (trip.ice) return null;
  if (x < 1) return null;
  return Math.max(0, Math.min(1, (x - 3) / (trip.reach - 3)));
}

function stepDemo(dt) {
  if (!demo) return;
  accumulator += dt;
  while (accumulator >= STEP) {
    demo.step(STEP, demoBot.controls(demo, STEP));
    accumulator -= STEP;
  }
  renderer.handleEvents(demo.events, demo);
  demo.events.length = 0;
  if (demo.state === 'landed' || demo.state === 'lost') {
    demo.doneT = (demo.doneT || 0) + dt;
    if (demo.doneT > 1.6) { demo.doneT = 0; demo.next(); demoBot.reset(); }
  }
}

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.pollPad();
  updatePointer(dt);

  const esc = input.consume('Escape');
  if (esc || input.consume('KeyP') || input.consumePad('start')) {
    if (mode === 'fish') pause();
    else if (mode === 'paused') resumeFishing();
    else if (esc && mode !== 'title') back();
  }
  if (input.consume('KeyM')) toggleMute();
  if (mode === 'fish') {
    if (input.consume('KeyB') || input.consumePad('y')) openMenu('bait');
    else if (input.consume('KeyT')) waitAWhile();
  }
  if (mode !== 'fish') {
    if (input.consumePad('up') || input.consumePad('left')) moveFocus(-1);
    if (input.consumePad('down') || input.consumePad('right')) moveFocus(1);
    if (input.consumePad('a')) document.activeElement?.click?.();
    if (input.consumePad('b')) back();
  }

  let view = demo;
  if (mode === 'fish' && trip) {
    view = trip;
    const ctl = autopilot ? autopilot.controls(trip, dt) : input.read(dt, trip.state, trip.cast.aim, aimAt);
    accumulator += dt;
    let first = true;
    while (accumulator >= STEP) {
      trip.step(STEP, first ? ctl : { ...ctl, press: false });
      first = false;
      accumulator -= STEP;
    }
    renderer.handleEvents(trip.events, trip);
    sound.handle(trip.events);
    onEvents(trip.events);
    trip.events.length = 0;
    if (trip.state === 'fight') sound.creak(readout(trip.fight).frac);
    if (landTimer > 0) { landTimer -= dt; if (landTimer <= 0 && trip.state === 'landed') showCatch(); }
    if (lostTimer > 0) {
      lostTimer -= dt;
      if (lostTimer <= 0 && trip.state === 'lost') {
        if (tourneyFinished) showTourneyResult();
        else { trip.next(); if (pendingScene || sceneChanged()) { buildTrip(); announceScene(); } else if (pendingEquip) { trip.setEquip(save.equip); pendingEquip = false; } }
      }
    }
    updateHint();
  } else if (mode === 'title' || (mode === 'menu' && menuFrom === 'title')) {
    stepDemo(dt);
  } else if (trip) {
    view = trip;
  }
  if (mode !== 'paused') renderer.update(dt, view);
  const ui = { attract: view === demo, touch: coarse };
  if (view === trip && trip?.fight) {
    const f = trip.fight;
    ui.fishLabel = save.book[f.fish.id]?.n || f.fish.rarity === 'legendary' ? f.fish.name : 'Mystery fish!';
    ui.distLabel = `${Math.max(0, f.dist - 1.5).toFixed(0)} m`;
  }
  renderer.draw(view, ui);
  requestAnimationFrame(loop);
}

const loop = telemetry ? telemetry.guard(frame, 'reel-rumble.frame') : frame;

if (location.protocol !== 'file:') {
  log.event('game.ready', { species: speciesCaught(save), coins: save.coins, caught: save.stats.caught });
  updateSoundButtons();
  const hour = parseFloat(params.get('hour'));
  if (hour >= 0 && hour < 24) save.clock.hour = hour;
  const day = parseInt(params.get('day'), 10);
  if (day >= 1) save.clock.day = day;
  const w = params.get('water');
  if (w && WATER[w]) startFishing(w, { force: true }); else toTitle();
  requestAnimationFrame(loop);
}

window.RR = {
  get trip() { return trip; }, get demo() { return demo; }, get mode() { return mode; }, save, renderer, input, sound,
  FISH_BY_ID, startFishing, startTourney: (id) => startTourney(TOURNAMENT_BY_ID[id]), persist,
};
