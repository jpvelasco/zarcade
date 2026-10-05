// Browser shell: screens, input (mouse, touch, keyboard, gamepad), HUD,
// saves and the guarded fixed-step loop.
import { World, STEP } from './sim.js';
import { AI } from './ai.js';
import { Commander } from './command.js';
import { hitNode, nearestInDirection } from './view.js';
import { Renderer, THEMES, drawThumbnail, paintIslands } from './render.js';
import { Sound } from './audio.js';
import { drawEmblem, drawHero, INK } from './sprites.js';
import {
  COLORS, RIVAL_ORDER, EMBLEMS, EMBLEM_NAMES, COLOR_UNLOCKS, EMBLEM_UNLOCKS,
  PERSONALITIES, DIFFICULTIES, HEROES, HERO_ORDER, HERO_COOLDOWN,
} from './data.js';
import { CAMPAIGN, REGIONS, INTROS, goalText } from './campaign.js';
import { generateMap, dailySetup, skirmishSetup, dateKey, labelNodes, maxRivals, SIZES } from './mapgen.js';
import { makeRng, hashString } from './rng.js';
import {
  loadSave, writeSave, totalStars, isMapUnlocked, highestUnlocked, unlockedColors, unlockedEmblems, unlockedHeroes,
  unlockText, activeHero, recordCampaign, recordDaily, recordSkirmish, skirmishKey, currentStreak, formatTime, mapsCleared,
} from './progress.js';
import { frameMonitor } from './perf.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

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

const debugUnlock = params.has('unlock');
const debugAutoplay = params.has('autoplay');
const simSpeed = Math.max(0.25, Math.min(16, Number(params.get('speed')) || 1));

const sound = new Sound({ muted: save.muted, music: save.music });
const canvas = $('game');
const renderer = new Renderer(canvas);
renderer.reduced = motionQuery.matches;
motionQuery.addEventListener?.('change', (e) => { renderer.reduced = e.matches; });

const ME = 1;
let mode = 'title'; // title | map | brief | skirmish | kingdom | play | paused | results
let match = null; // the battle on screen (a real one, or the attract match behind menus)
let acc = 0;
let endTimer = -1;
let briefing = null; // what the briefing screen will start
let resultsBack = 'title';
const ui = {
  hover: null, cursor: null, pointer: null, showLetters: !!save.letters, shift: false,
  sendAll: !!save.sendAll, fast: !!save.fast, padCursor: null, padActive: false, tipTimer: 0, tipStage: 0,
};

const heroesUnlocked = () => (debugUnlock ? HERO_ORDER.slice() : unlockedHeroes(save));
const colorsUnlocked = () => (debugUnlock ? COLORS.map((c) => c.id) : unlockedColors(save));
const emblemsUnlocked = () => (debugUnlock ? EMBLEMS.slice() : unlockedEmblems(save));
const mapUnlocked = (i) => debugUnlock || isMapUnlocked(save, i);
const colorById = (id) => COLORS.find((c) => c.id === id) || COLORS[0];
function chosenHero() {
  const list = heroesUnlocked();
  if (save.hero === 'none') return null;
  if (save.hero && list.includes(save.hero)) return save.hero;
  return debugUnlock ? list[0] : activeHero(save);
}

// ------------------------------------------------------------ layout

function insets() {
  const css = getComputedStyle(document.documentElement);
  const top = parseFloat(css.getPropertyValue('--hud-h')) || 58;
  const bottom = parseFloat(css.getPropertyValue('--foot-h')) || 70;
  const playing = mode === 'play' || mode === 'paused' || mode === 'results';
  // Tutorial maps on narrow screens keep room for the tip above the board.
  const tipRoom = playing && match?.tutorial && innerWidth < 560 ? 86 : 0;
  return playing ? { top: top + 4 + tipRoom, bottom: bottom + 4, side: 6 } : { top: 0, bottom: 0, side: 0 };
}

function resize() {
  renderer.resize(Math.max(1, innerWidth), Math.max(1, innerHeight), Math.min(2, devicePixelRatio || 1), insets());
}
addEventListener('resize', () => { resize(); if (mode === 'map') renderMap(true); });

// ------------------------------------------------------------ palettes & names

function palettesFor(kingdoms, attract = false) {
  const mine = attract ? COLORS[0] : colorById(save.color);
  const out = { 1: mine };
  const rest = RIVAL_ORDER.filter((id) => id !== mine.id);
  for (let k = 2; k <= kingdoms; k++) out[k] = colorById(rest[k - 2]);
  return out;
}

function emblemsFor(rivals) {
  const out = { 1: save.emblem || 'crown' };
  rivals.forEach((r, i) => { out[i + 2] = PERSONALITIES[r.personality]?.emblem || 'shield'; });
  return out;
}

function themeForSeed(seed) {
  return ['clover', 'windmill', 'fjords', 'ember'][seed % 4];
}

const ADJ = ['Sunny', 'Breezy', 'Misty', 'Merry', 'Sleepy', 'Golden', 'Mossy', 'Pebble', 'Bramble', 'Honey', 'Puffin', 'Clover'];
const NOUN = ['Isles', 'Bay', 'Atoll', 'Shores', 'Reef', 'Cove', 'Keys', 'Sound', 'Lagoon', 'Strand'];
function islandName(seed) {
  const r = makeRng(seed ^ 0xbeef);
  return `${r.pick(ADJ)} ${r.pick(NOUN)}`;
}

function badge(cnv, pal, emblem, size = 52) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cnv.width = cnv.height = Math.round(size * dpr);
  const g = cnv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  g.fillStyle = pal.fill;
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = INK;
  g.stroke();
  g.save();
  g.translate(size / 2, size / 2);
  g.scale(size * 0.3, size * 0.3);
  drawEmblem(g, emblem, '#fffaf0');
  g.restore();
  return cnv;
}

function heroCanvas(cnv, id, size = 56, silhouette = false) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cnv.width = cnv.height = Math.round(size * dpr);
  const g = cnv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  drawHero(g, id, size, { silhouette });
  return cnv;
}

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

// ------------------------------------------------------------ matches

// spec: { kind, name, map, rivals, theme, index?, setup? }
function startMatch(spec, { attract = false } = {}) {
  const kingdoms = spec.rivals.length + 1;
  const hero = attract ? null : chosenHero();
  const world = new World(spec.map, { heroes: hero ? { [ME]: hero } : {} });
  const ais = spec.rivals.map((r, i) => new AI(i + 2, { ...r, seed: spec.map.seed }));
  if (attract || debugAutoplay) ais.push(new AI(ME, { personality: attract ? 'greedy' : 'reference', difficulty: attract ? 'normal' : 'hard', seed: spec.map.seed + 1 }));
  const labels = labelNodes(world.nodes);
  const byLetter = {};
  labels.forEach((L, id) => { byLetter[L] = id; });
  const letterOrder = world.nodes.map((n) => n.id).sort((a, b) => labels[a].localeCompare(labels[b]));
  match = {
    spec, world, ais, attract, hero, labels, byLetter, letterOrder,
    commander: new Commander(world, ME),
    palettes: palettesFor(kingdoms, attract),
    emblems: emblemsFor(spec.rivals),
    outSeen: new Set(),
    tutorial: spec.kind === 'campaign' && spec.index <= 3,
  };
  acc = 0;
  endTimer = -1;
  ui.hover = null;
  ui.cursor = null;
  ui.padCursor = null;
  ui.tipStage = 0;
  ui.heroReadyShown = true;
  resize();
  renderer.setScene({ world, palettes: match.palettes, emblems: match.emblems, theme: spec.theme });
  queueMicrotask(() => monitor.mark(performance.now()));
  if (!attract) {
    buildHud();
    log.event('level.start', {
      mode: spec.kind, map: spec.index != null ? spec.index + 1 : 0, rivals: spec.rivals.length,
      difficulty: spec.rivals.map((r) => r.difficulty).join(','), hero: hero || 'none', buildings: world.nodes.length,
    });
  }
}

function campaignSpec(index) {
  const lv = CAMPAIGN[index];
  return { kind: 'campaign', index, name: lv.name, map: lv.map, rivals: lv.rivals, theme: lv.region, level: lv };
}

function dailySpec() {
  const key = dateKey();
  const d = dailySetup(key);
  return { kind: 'daily', key, name: islandName(d.seed), map: d.map, rivals: d.rivals, theme: themeForSeed(d.seed), setup: d };
}

function skirmishSpec() {
  const sk = save.skirmish;
  if (!sk.seed) sk.seed = (Date.now() % 1e9) >>> 0;
  const s = skirmishSetup({ seed: sk.seed, size: sk.size, rivals: sk.rivals, difficulty: sk.difficulty });
  return { kind: 'skirmish', name: islandName(s.seed), map: s.map, rivals: s.rivals, theme: themeForSeed(s.seed), setup: s, key: skirmishKey(sk.size, sk.rivals, sk.difficulty) };
}

let attractSeed = 11;
function startAttract() {
  attractSeed = (attractSeed * 48271) % 2147483647;
  const map = generateMap({ seed: attractSeed, size: 'medium', kingdoms: 4 });
  const pers = ['greedy', 'sneaky', 'cautious'];
  const rivals = pers.map((p) => ({ personality: p, difficulty: 'normal' }));
  startMatch({ kind: 'attract', name: '', map, rivals, theme: themeForSeed(attractSeed) }, { attract: true });
}

function play(spec) {
  sound.unlock();
  mode = 'play';
  showScreen(null);
  startMatch(spec);
  sound.setMusicLevel(1);
  if (spec.kind === 'campaign' && spec.index <= 3) ui.tipStage = 1;
  if (spec.kind === 'campaign' && spec.level.intro && INTROS[spec.level.intro]) {
    save.seen[spec.level.intro] = true;
    persist();
  }
  showTip();
}

function restart() {
  if (!match || match.attract) return;
  play(match.spec);
}

// ------------------------------------------------------------ HUD

function buildHud() {
  const box = $('hud-kingdoms');
  box.innerHTML = '';
  match.chips = {};
  for (const o of match.world.owners) {
    const chip = el('div', 'kchip');
    const c = document.createElement('canvas');
    badge(c, match.palettes[o], match.emblems[o], 26);
    chip.append(c);
    const nm = el('span', 'nm', o === ME ? 'You' : PERSONALITIES[match.spec.rivals[o - 2].personality].name);
    const ct = el('span', 'ct', '0');
    chip.append(nm, ct);
    chip.title = o === ME ? 'Your kingdom' : `${PERSONALITIES[match.spec.rivals[o - 2].personality].name} (${DIFFICULTIES[match.spec.rivals[o - 2].difficulty].name})`;
    box.append(chip);
    match.chips[o] = { chip, ct };
  }
  const bar = $('strength');
  bar.innerHTML = '';
  match.bars = {};
  for (const o of match.world.owners) {
    const i = el('i');
    i.style.background = match.palettes[o].fill;
    bar.append(i);
    match.bars[o] = i;
  }
  $('hud-name').textContent = match.spec.kind === 'campaign' ? `${match.spec.index + 1}. ${match.spec.name}` : match.spec.kind === 'daily' ? `Daily · ${match.spec.name}` : match.spec.name;
  const hb = $('btn-hero');
  hb.classList.toggle('hidden', !match.hero);
  if (match.hero) heroCanvas($('hero-icon'), match.hero, 60);
  $('btn-amount').classList.toggle('all-on', ui.sendAll);
  refreshSpeed();
  hudTimer = 0;
  updateHud(true);
}

let hudTimer = 0;
function updateHud(force = false) {
  if (!match || match.attract) return;
  const w = match.world;
  $('hud-time').textContent = formatTime(w.time);
  const st = w.strength();
  for (const o of w.owners) {
    const n = w.nodes.reduce((k, x) => k + (x.owner === o), 0);
    match.chips[o].ct.textContent = String(n);
    match.chips[o].chip.classList.toggle('out', !w.alive.has(o));
    match.bars[o].style.flexGrow = String(Math.max(0, st[o]));
  }
  const h = w.heroes[ME];
  if (h) {
    const hb = $('btn-hero');
    const state = h.armed ? 'armed' : h.out ? 'out' : h.cd > 0 ? 'cd' : 'ready';
    hb.classList.toggle('armed', state === 'armed');
    hb.classList.toggle('ready', state === 'ready');
    hb.style.setProperty('--cd', state === 'cd' ? (h.cd / HERO_COOLDOWN).toFixed(3) : state === 'out' ? '1' : '0');
    $('hero-state').textContent = state === 'armed' ? 'Next send!' : state === 'out' ? 'Marching' : state === 'cd' ? `${Math.ceil(h.cd)}s` : HEROES[h.id].name;
    if (state === 'ready' && !ui.heroReadyShown) { ui.heroReadyShown = true; toast(`${HEROES[h.id].name} is ready!`); }
    if (state !== 'ready') ui.heroReadyShown = false;
  }
}

function toggleAmount() {
  ui.sendAll = !ui.sendAll;
  save.sendAll = ui.sendAll;
  persist();
  $('btn-amount').classList.toggle('all-on', ui.sendAll);
  sound.click();
}

function toggleSpeed() {
  ui.fast = !ui.fast;
  save.fast = ui.fast;
  persist();
  refreshSpeed();
  sound.click();
}

function refreshSpeed() {
  const b = $('btn-speed');
  b.textContent = ui.fast ? '2×' : '1×';
  b.classList.toggle('fast', ui.fast);
}

function toggleHero() {
  if (!match || match.attract || mode !== 'play') return;
  const h = match.world.heroes[ME];
  if (!h) return;
  if (h.armed) { h.armed = false; sound.click(); }
  else if (match.world.armHero(ME, true)) { sound.hero(); toast(`${HEROES[h.id].name} joins your next send!`); }
  else toast(h.out ? `${HEROES[h.id].name} is still marching` : `${HEROES[h.id].name} is resting: ${Math.ceil(h.cd)}s`);
  updateHud(true);
}

let toastTimer = 0;
function toast(text, seconds = 2.2) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  toastTimer = seconds;
}

function showTip() {
  const tip = $('tip');
  if (!match || match.attract || mode !== 'play' || !ui.tipStage) { tip.classList.add('hidden'); return; }
  const lv = match.spec.index;
  const touch = matchMedia('(pointer: coarse)').matches;
  const texts = {
    0: [
      null,
      touch ? 'Drag from your castle to a grey cottage to send soldiers!' : 'Drag from your castle to a grey cottage to send soldiers!',
      'They march over! More soldiers than the number on the cottage wins it.',
      'Grab more buildings, then capture the red castle to win!',
    ],
    1: [null, 'Take a cottage first. Then drag through both of your buildings onto a target: they all march together!'],
    2: [null, 'Windmills grow soldiers super fast. Capture them first!'],
    3: [null, match.hero ? 'Tap the hero button, then send: Sir Pip hits extra hard!' : 'Gather your buildings and attack together!'],
  }[lv];
  const text = texts?.[ui.tipStage];
  if (!text) { tip.classList.add('hidden'); ui.tipStage = 0; return; }
  tip.textContent = text;
  tip.classList.remove('hidden');
  ui.tipTimer = 9;
}

function advanceTip(events) {
  if (!ui.tipStage || match.spec.index !== 0) return;
  for (const e of events) {
    if (ui.tipStage === 1 && e.type === 'send' && e.owner === ME) { ui.tipStage = 2; showTip(); }
    else if (ui.tipStage === 2 && e.type === 'capture' && e.owner === ME) { ui.tipStage = 3; showTip(); }
  }
}

// ------------------------------------------------------------ sending

function fraction() {
  return ui.sendAll || ui.shift ? 1 : 0.5;
}

function doSend(act) {
  if (!act || !match || match.attract || mode !== 'play') return;
  const w = match.world;
  const sent = w.send(ME, act.from, act.to, fraction());
  if (!sent) {
    toast('Not enough soldiers there yet!');
    return;
  }
  if (match.hero && w.heroes[ME] && w.heroes[ME].out && !match.heroLogged) {
    match.heroLogged = true;
    log.event('hero.used', { hero: match.hero, map: match.spec.index != null ? match.spec.index + 1 : 0 });
  }
}

// ------------------------------------------------------------ results

function finish(won) {
  const w = match.world;
  const st = w.stats[ME];
  const result = { won, time: w.time, sends: st.sends, lost: st.lost };
  const spec = match.spec;
  // ?autoplay is the bot playing: show its results, but keep them out of the save.
  const book = debugAutoplay ? structuredClone(save) : save;
  let rec = null;
  if (spec.kind === 'campaign') rec = recordCampaign(book, spec.index, result);
  else if (spec.kind === 'daily') rec = recordDaily(book, spec.key, result);
  else rec = recordSkirmish(book, spec.key, result);
  if (!debugAutoplay) persist();
  const attrs = { mode: spec.kind, map: spec.index != null ? spec.index + 1 : 0, time: Math.round(w.time), sends: st.sends, lost: st.lost };
  if (won) log.event('level.complete', { ...attrs, stars: rec.stars ?? 0, 'best.new': !!rec.newBest, streak: rec.streak ?? 0 });
  else log.event('level.fail', { ...attrs, reason: 'conquered' });
  for (const u of rec.unlocks || []) log.event('unlock', { kind: u.kind, id: u.id });
  if (won) sound.win(); else sound.lose();
  if (won) {
    for (const n of w.buildingsOf(ME)) {
      const p = renderer.view.toScreen(n.x, n.y);
      renderer.burst(p.x, p.y - 10, match.palettes[ME].fill, 10, 200);
      renderer.burst(p.x, p.y - 10, '#ffe066', 6, 160);
    }
  }
  const done = match;
  setTimeout(() => { if (match === done && mode === 'play') showResults(won, result, rec); }, won ? 1300 : 900);
}

function showResults(won, result, rec) {
  if (!match || match.attract) return;
  mode = 'results';
  const spec = match.spec;
  $('res-title').textContent = won ? 'Victory!' : 'Oh no, defeated!';
  const starsEl = $('res-stars');
  starsEl.classList.toggle('hide', spec.kind !== 'campaign' || !won);
  const spans = [...starsEl.children];
  spans.forEach((s) => s.classList.remove('on'));
  if (spec.kind === 'campaign' && won) {
    spans.forEach((s, i) => {
      if (i < rec.stars) setTimeout(() => { s.classList.add('on'); sound.star(i); }, 250 + i * 280);
    });
  }
  let sub = '';
  if (spec.kind === 'campaign') sub = won ? `${spec.name} is yours!` : 'Every king loses a battle. Try a new plan!';
  else if (spec.kind === 'daily') sub = won ? `Daily won! Streak: ${rec.streak} day${rec.streak === 1 ? '' : 's'}` : 'So close! The daily island waits for you.';
  else sub = won ? `${spec.name} is yours!` : 'The island fell. Try again?';
  $('res-sub').innerHTML = sub + (rec.newBest ? '<br><span class="newbest">New best!</span>' : '');
  const goals = $('res-goals');
  goals.innerHTML = '';
  if (spec.kind === 'campaign') {
    const lv = spec.level;
    const ever = save.goals[lv.id] || [];
    const items = [{ text: 'Win the battle', on: won || (save.stars[lv.id] || 0) > 0 }, ...lv.goals.map((g, k) => ({ text: goalText(g), on: !!ever[k], now: rec.met?.[k] && won }))];
    for (const it of items) goals.append(el('li', it.on ? 'on' : '', `<span class="s">★</span>${it.text}${it.now ? ' <b style="color:#2f8a46">✓</b>' : ''}`));
  }
  const lines = $('res-lines');
  const best = rec.best != null ? formatTime(rec.best) : '—';
  lines.innerHTML = `<div><b>${formatTime(result.time)}</b>Time</div><div><b>${result.sends}</b>Sends</div><div><b>${won ? best : result.lost}</b>${won ? 'Best time' : 'Buildings lost'}</div>`;
  const ul = $('res-unlocks');
  ul.innerHTML = '';
  for (const u of rec.unlocks || []) {
    const row = el('div', 'unlock');
    const c = document.createElement('canvas');
    if (u.kind === 'hero') { heroCanvas(c, u.id, 40); row.append(c, el('span', '', `New hero: ${HEROES[u.id].name} the ${HEROES[u.id].role}!`)); }
    else if (u.kind === 'color') { badge(c, colorById(u.id), save.emblem, 40); row.append(c, el('span', '', `New colour: ${colorById(u.id).name}`)); }
    else { badge(c, colorById(save.color), u.id, 40); row.append(c, el('span', '', `New emblem: ${EMBLEM_NAMES[u.id]}`)); }
    ul.append(row);
  }
  const btns = $('res-buttons');
  btns.innerHTML = '';
  const add = (label, fn, primary) => {
    const b = el('button', `btn${primary ? ' primary big' : ''}`, label);
    b.addEventListener('click', () => { sound.click(); fn(); });
    btns.append(b);
    return b;
  };
  if (spec.kind === 'campaign') {
    const next = spec.index + 1;
    if (won && next < CAMPAIGN.length) add('Next map', () => openBrief(campaignSpec(next)), true);
    add(won ? 'Replay' : 'Try again', restart, !won);
    add('World map', toMap);
  } else if (spec.kind === 'daily') {
    add(won ? 'Beat my time' : 'Try again', restart, !won);
    add('Menu', toTitle, won);
  } else {
    add(won ? 'Play again' : 'Try again', restart, !won);
    add('New island', () => { save.skirmish.seed = (Date.now() % 1e9) >>> 0; persist(); play(skirmishSpec()); });
    add('Menu', toTitle, won);
  }
  showScreen('screen-results');
}

// ------------------------------------------------------------ screens

const SCREENS = ['screen-title', 'screen-map', 'screen-brief', 'screen-skirmish', 'screen-kingdom', 'screen-pause', 'screen-results'];

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const inGame = mode === 'play' || mode === 'paused' || mode === 'results';
  $('hud').classList.toggle('hidden', !inGame);
  $('hud-bottom').classList.toggle('hidden', !inGame);
  if (!inGame || mode !== 'play') $('tip').classList.add('hidden');
  resize();
  if (id) {
    requestAnimationFrame(() => {
      const scr = $(id);
      const target = scr.querySelector('.map-node.next') || scr.querySelector('.btn.primary:not(:disabled)') || scr.querySelector('.btn');
      target?.focus({ preventScroll: id !== 'screen-map' });
      if (id === 'screen-map') target?.scrollIntoView?.({ block: 'center' });
    });
  } else document.activeElement?.blur?.();
}

function ensureAttract() {
  if (!match || !match.attract) startAttract();
}

function toTitle() {
  mode = 'title';
  ensureAttract();
  sound.setMusicLevel(0.8);
  const key = dateKey();
  const d = dailySetup(key);
  const streak = currentStreak(save, key);
  const wonToday = save.daily.lastWin === key;
  const bits = [`${SIZES[d.size].name} island`, `${d.rivals.length} rival${d.rivals.length > 1 ? 's' : ''}`];
  if (wonToday) bits.push(`best ${formatTime(save.daily.best[key])}`);
  if (streak) bits.push(`streak ${streak}`);
  $('daily-sub').textContent = bits.join(' · ');
  const stars = totalStars(save);
  const parts = [`★ ${stars} / ${CAMPAIGN.length * 3}`];
  if (save.wins) parts.push(`${save.wins} win${save.wins === 1 ? '' : 's'}`);
  if (save.daily.bestStreak) parts.push(`best streak ${save.daily.bestStreak}`);
  $('title-progress').textContent = parts.join(' · ');
  showScreen('screen-title');
}

function toMap() {
  mode = 'map';
  ensureAttract();
  renderMap();
  showScreen('screen-map');
}

// Map-node positions in each region picture (fractions of its box).
const PATH = Array.from({ length: 8 }, (_, k) => [0.075 + k * 0.121, k % 2 ? 0.42 : 0.72]);
const regionArt = new Map();
const LOCK = '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><rect x="3" y="7" width="10" height="8" rx="2" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="2" fill="none"/></svg>';

function renderMap(force = false) {
  const box = $('regions');
  if (!box.children.length || force) {
    box.innerHTML = '';
    REGIONS.forEach((r, ri) => {
      const reg = el('div', 'region');
      reg.dataset.region = r.id;
      const art = el('canvas', 'art');
      reg.append(art, el('div', 'region-label', `<b>${r.name}</b><span>${r.blurb}</span>`));
      for (let k = 0; k < 8; k++) {
        const i = ri * 8 + k;
        const b = el('button', 'map-node');
        b.dataset.index = i;
        b.style.left = `${PATH[k][0] * 100}%`;
        b.style.top = `${PATH[k][1] * 100}%`;
        b.addEventListener('click', () => {
          if (!mapUnlocked(i)) { toast('Win the map before to open this one'); return; }
          sound.click();
          openBrief(campaignSpec(i));
        });
        reg.append(b);
      }
      box.append(reg);
    });
    regionArt.clear();
  }
  $('map-stars').textContent = `★ ${totalStars(save)} / ${CAMPAIGN.length * 3}`;
  const next = Math.min(CAMPAIGN.length - 1, highestUnlocked(save));
  for (const b of box.querySelectorAll('.map-node')) {
    const i = Number(b.dataset.index);
    const lv = CAMPAIGN[i];
    const st = save.stars[lv.id] || 0;
    const open = mapUnlocked(i);
    b.className = `map-node${!open ? ' locked' : st ? ' done' : ''}${open && !st && i === next ? ' next' : ''}`;
    b.innerHTML = `${open ? i + 1 : LOCK}<span class="st">${open ? '★'.repeat(st) + `<span class="off">${'★'.repeat(3 - st)}</span>` : ''}</span>`;
    b.setAttribute('aria-label', `Map ${i + 1}: ${lv.name}${open ? `, ${st} stars` : ', locked'}`);
    b.title = lv.name;
  }
  for (const reg of box.querySelectorAll('.region')) {
    const ri = REGIONS.findIndex((r) => r.id === reg.dataset.region);
    reg.classList.toggle('locked', !mapUnlocked(ri * 8));
  }
  // Paint region pictures one per frame so no single frame stalls.
  const regs = [...box.querySelectorAll('.region')];
  const paintNext = () => {
    const reg = regs.find((r) => !regionArt.has(r.dataset.region));
    if (!reg || mode !== 'map') return;
    paintRegion(reg);
    requestAnimationFrame(paintNext);
  };
  requestAnimationFrame(paintNext);
}

function paintRegion(reg) {
  const id = reg.dataset.region;
  const art = reg.querySelector('canvas.art');
  const w = reg.clientWidth, h = reg.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  art.width = Math.round(w * dpr);
  art.height = Math.round(h * dpr);
  const g = art.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Treat the box as a world: map nodes become little islands.
  const view = {
    s: Math.min(w / 1600, h / 1000) * 1.0, rotate: false,
    toScreen: (x, y) => ({ x: (x / 1600) * w, y: (y / 1000) * h }),
    toWorld: (x, y) => ({ x: (x / w) * 1600, y: (y / h) * 1000 }),
  };
  const nodes = PATH.map(([x, y], i) => ({ id: i, x: x * 1600, y: y * 1000, r: 22, type: 'cottage' }));
  const shapes = regionShapes(nodes, hashString(id));
  paintIslands(g, w, h, view, shapes, THEMES[id], hashString(id), { nodes, detail: 1.4 });
  // Dotted path between maps.
  g.setLineDash([3, 7]);
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,250,235,0.9)';
  g.beginPath();
  PATH.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)));
  g.stroke();
  g.setLineDash([]);
  regionArt.set(id, true);
}

// One winding island chain per region, with the maps along it.
function regionShapes(nodes, seed) {
  const rng = makeRng(seed);
  const circles = [];
  nodes.forEach((n, i) => {
    circles.push({ x: n.x, y: n.y, r: 105 + rng() * 20 });
    const b = nodes[i + 1];
    if (b && (i % 4 !== 3)) {
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        circles.push({ x: n.x + (b.x - n.x) * t + (rng() - 0.5) * 40, y: n.y + (b.y - n.y) * t + (rng() - 0.5) * 40, r: 62 + rng() * 26 });
      }
    }
    for (let k = 0; k < 3; k++) {
      const a = rng() * Math.PI * 2, d = 70 + rng() * 60;
      circles.push({ x: n.x + Math.cos(a) * d, y: n.y + Math.sin(a) * d, r: 45 + rng() * 35 });
    }
  });
  const landAt = (x, y) => circles.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 <= (c.r - 6) ** 2);
  return { circles, landAt };
}

function rivalRow(r, pal) {
  const row = el('div', 'rival');
  const c = document.createElement('canvas');
  badge(c, pal, PERSONALITIES[r.personality].emblem, 38);
  const P = PERSONALITIES[r.personality];
  row.append(c, el('div', 'who', `<b>${P.name}</b> <span>${P.title}</span><br><span>${P.blurb}</span>`), el('span', `pill ${r.difficulty}`, DIFFICULTIES[r.difficulty].name));
  return row;
}

function heroPicker(box) {
  box.innerHTML = '';
  const list = heroesUnlocked();
  if (!list.length) return;
  const cur = chosenHero();
  for (const id of [...list, 'none']) {
    const b = el('button', (id === 'none' ? !cur : cur === id) ? 'on' : '');
    if (id === 'none') { b.classList.add('none'); b.textContent = 'No hero'; }
    else {
      const c = document.createElement('canvas');
      heroCanvas(c, id, 46);
      b.append(c, el('span', '', HEROES[id].name));
      b.title = `${HEROES[id].name} the ${HEROES[id].role}: ${HEROES[id].blurb}`;
    }
    b.addEventListener('click', () => {
      save.hero = id;
      persist();
      sound.click();
      heroPicker(box);
      box.querySelector('button.on')?.focus();
    });
    box.append(b);
  }
}

function openBrief(spec) {
  briefing = spec;
  mode = 'brief';
  ensureAttract();
  const pals = palettesFor(spec.rivals.length + 1);
  $('brief-title').textContent = spec.name;
  const goals = $('brief-goals');
  goals.innerHTML = '';
  const intro = $('brief-intro');
  intro.classList.add('hidden');
  if (spec.kind === 'campaign') {
    const lv = spec.level;
    const region = REGIONS.find((r) => r.id === lv.region);
    $('brief-kicker').textContent = `Map ${spec.index + 1} · ${region.name}`;
    const ever = save.goals[lv.id] || [];
    const won = (save.stars[lv.id] || 0) > 0;
    goals.append(el('li', won ? 'on' : '', '<span class="s">★</span>Win the battle'));
    lv.goals.forEach((g, k) => goals.append(el('li', ever[k] ? 'on' : '', `<span class="s">★</span>${goalText(g)}`)));
    $('brief-best').textContent = save.best[lv.id] != null ? `Best time ${formatTime(save.best[lv.id])}` : 'Goals add up: win again to collect the stars you missed.';
    if (lv.intro && INTROS[lv.intro]) {
      intro.innerHTML = `<b>${INTROS[lv.intro].title}</b>${INTROS[lv.intro].text}`;
      intro.classList.remove('hidden');
    }
    resultsBack = 'map';
  } else {
    const key = spec.key;
    $('brief-kicker').textContent = `Daily skirmish · ${new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
    const streak = currentStreak(save, key);
    goals.append(el('li', save.daily.lastWin === key ? 'on' : '', '<span class="s">★</span>Win today\'s island'));
    $('brief-best').textContent = [
      save.daily.best[key] != null ? `Today's best ${formatTime(save.daily.best[key])}` : 'Same island for everyone today. New one tomorrow!',
      streak ? `Streak: ${streak} day${streak === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' · ');
    resultsBack = 'title';
  }
  const rv = $('brief-rivals');
  rv.innerHTML = '';
  spec.rivals.forEach((r, i) => rv.append(rivalRow(r, pals[i + 2])));
  heroPicker($('brief-heroes'));
  showScreen('screen-brief');
  requestAnimationFrame(() => drawThumbnail($('brief-thumb'), spec.map, spec.theme, pals));
}

function buildSeg(box, options, current, onPick, disabled = () => false) {
  box.innerHTML = '';
  for (const [value, label] of options) {
    const b = el('button', value === current ? 'on' : '', label);
    b.disabled = disabled(value);
    b.addEventListener('click', () => { sound.click(); onPick(value); });
    box.append(b);
  }
}

function openSkirmish() {
  mode = 'skirmish';
  ensureAttract();
  const sk = save.skirmish;
  const refresh = () => {
    const most = maxRivals(sk.size);
    buildSeg($('sk-size'), [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], sk.size, (v) => { sk.size = v; sk.rivals = Math.min(sk.rivals, maxRivals(v)); persist(); refresh(); });
    buildSeg($('sk-rivals'), [[1, '1'], [2, '2'], [3, '3']], sk.rivals, (v) => { sk.rivals = v; persist(); refresh(); }, (v) => v > most);
    $('sk-fit').textContent = most < 3 ? `A ${SIZES[sk.size].name.toLowerCase()} island fits up to ${most} rivals.` : '';
    buildSeg($('sk-diff'), [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], sk.difficulty, (v) => { sk.difficulty = v; persist(); refresh(); });
    const spec = skirmishSpec();
    const pals = palettesFor(spec.rivals.length + 1);
    const who = $('sk-who');
    who.innerHTML = '';
    spec.rivals.forEach((r, i) => who.append(rivalRow(r, pals[i + 2])));
    const best = sk.best[spec.key];
    $('sk-best').textContent = `${spec.name}${best != null ? ` · best ${SIZES[sk.size].name.toLowerCase()} win vs ${sk.rivals} ${DIFFICULTIES[sk.difficulty].name.toLowerCase()}: ${formatTime(best)}` : ''}`;
    heroPicker($('sk-heroes'));
    requestAnimationFrame(() => drawThumbnail($('sk-thumb'), spec.map, spec.theme, pals));
  };
  refresh();
  $('btn-reroll').onclick = () => { sk.seed = makeRng(sk.seed + 17).int(1e9) + 1; persist(); sound.click(); refresh(); };
  resultsBack = 'title';
  showScreen('screen-skirmish');
}

function openKingdom() {
  mode = 'kingdom';
  ensureAttract();
  const draw = () => {
    const pal = colorById(save.color);
    const c = $('kd-banner');
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(14, 18); g.lineTo(146, 18); g.lineTo(146, 160); g.lineTo(80, 190); g.lineTo(14, 160); g.closePath();
    g.fillStyle = pal.fill; g.fill();
    g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(24, 26, 26, 128);
    g.fillStyle = '#9a6a43'; g.fillRect(4, 8, 152, 12); g.strokeRect(4, 8, 152, 12);
    g.save(); g.translate(80, 92); g.scale(44, 44); drawEmblem(g, save.emblem, '#fffaf0'); g.restore();
    const colors = colorsUnlocked();
    const cbox = $('kd-colors');
    cbox.innerHTML = '';
    for (const col of Object.keys(COLOR_UNLOCKS).map(colorById)) {
      const open = colors.includes(col.id);
      const b = el('button', `swatch${save.color === col.id ? ' on' : ''}${open ? '' : ' locked'}`);
      b.style.background = open ? col.fill : `linear-gradient(rgba(221,214,200,0.7), rgba(221,214,200,0.7)), ${col.fill}`;
      b.title = open ? col.name : `${col.name}: unlock with ${unlockText(COLOR_UNLOCKS[col.id])}`;
      b.setAttribute('aria-label', b.title);
      if (!open) b.append(el('span', 'req', unlockText(COLOR_UNLOCKS[col.id])));
      b.addEventListener('click', () => { if (!open) { toast(`Unlock with ${unlockText(COLOR_UNLOCKS[col.id])}`); return; } save.color = col.id; persist(); sound.click(); draw(); $('kd-colors').querySelector('.on')?.focus(); });
      cbox.append(b);
    }
    const ems = emblemsUnlocked();
    const ebox = $('kd-emblems');
    ebox.innerHTML = '';
    for (const em of EMBLEMS) {
      const open = ems.includes(em);
      const b = el('button', `swatch${save.emblem === em ? ' on' : ''}${open ? '' : ' locked'}`);
      const cv = document.createElement('canvas');
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = cv.height = 34 * dpr;
      const gg = cv.getContext('2d');
      gg.translate(17 * dpr, 17 * dpr);
      gg.scale(13 * dpr, 13 * dpr);
      drawEmblem(gg, em, open ? pal.fill : '#9a927f');
      b.append(cv);
      b.title = open ? EMBLEM_NAMES[em] : `${EMBLEM_NAMES[em]}: unlock with ${unlockText(EMBLEM_UNLOCKS[em])}`;
      b.setAttribute('aria-label', b.title);
      if (!open) b.append(el('span', 'req', unlockText(EMBLEM_UNLOCKS[em])));
      b.addEventListener('click', () => { if (!open) { toast(`Unlock with ${unlockText(EMBLEM_UNLOCKS[em])}`); return; } save.emblem = em; persist(); sound.click(); draw(); $('kd-emblems').querySelector('.on')?.focus(); });
      ebox.append(b);
    }
    const hbox = $('kd-heroes');
    hbox.innerHTML = '';
    const heroes = heroesUnlocked();
    for (const id of HERO_ORDER) {
      const open = heroes.includes(id);
      const card = el('div', 'hero-card');
      const cv = document.createElement('canvas');
      heroCanvas(cv, id, 50, !open);
      const H = HEROES[id];
      card.append(cv, el('div', '', open ? `<b>${H.name}</b> the ${H.role}<br>${H.blurb}` : `<b>???</b><br>Win ${H.unlock} campaign map${H.unlock === 1 ? '' : 's'} to meet this hero.`));
      hbox.append(card);
    }
    $('kd-stats').textContent = `★ ${totalStars(save)} stars · ${save.wins} wins · ${mapsCleared(save)} maps won · best daily streak ${save.daily.bestStreak}`;
  };
  draw();
  showScreen('screen-kingdom');
}

function pause() {
  if (mode !== 'play' || endTimer >= 0) return; // the battle is already over
  mode = 'paused';
  sound.setMusicLevel(0.4);
  const w = match.world;
  const n = w.stats[ME].sends;
  $('pause-info').textContent = `${match.spec.name} · ${formatTime(w.time)} · ${n} send${n === 1 ? '' : 's'}`;
  refreshPauseButtons();
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  sound.setMusicLevel(1);
  showScreen(null);
}

function refreshPauseButtons() {
  $('btn-sound').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
  $('btn-music').textContent = `Music: ${save.music ? 'on' : 'off'}`;
  $('btn-letters').textContent = `Building letters: ${ui.showLetters ? 'on' : 'off'}`;
}

function toggleMute() {
  save.muted = !save.muted;
  sound.setMuted(save.muted);
  persist();
  refreshPauseButtons();
  toast(save.muted ? 'Sound off' : 'Sound on', 1.2);
}

function leave() {
  const kind = match?.spec?.kind;
  if (match && !match.attract) log.event('level.quit', { mode: kind, map: match.spec.index != null ? match.spec.index + 1 : 0, time: Math.round(match.world.time) });
  match = null;
  if (kind === 'campaign') toMap();
  else if (kind === 'skirmish') openSkirmish();
  else toTitle();
}

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'brief') (briefing?.kind === 'campaign' ? toMap() : toTitle());
  else if (mode === 'map' || mode === 'skirmish' || mode === 'kingdom') toTitle();
  else if (mode === 'results') (resultsBack === 'map' ? toMap() : toTitle());
}

// ------------------------------------------------------------ buttons

$('btn-campaign').addEventListener('click', () => { sound.unlock(); sound.click(); toMap(); });
$('btn-daily').addEventListener('click', () => { sound.unlock(); sound.click(); openBrief(dailySpec()); });
$('btn-skirmish').addEventListener('click', () => { sound.unlock(); sound.click(); openSkirmish(); });
$('btn-kingdom').addEventListener('click', () => { sound.unlock(); sound.click(); openKingdom(); });
$('btn-start').addEventListener('click', () => briefing && play(briefing));
$('btn-sk-start').addEventListener('click', () => play(skirmishSpec()));
$('btn-pause').addEventListener('click', () => (mode === 'play' ? pause() : resume()));
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', restart);
$('btn-leave').addEventListener('click', leave);
$('btn-sound').addEventListener('click', toggleMute);
$('btn-music').addEventListener('click', () => { save.music = !save.music; sound.setMusic(save.music); persist(); refreshPauseButtons(); });
$('btn-letters').addEventListener('click', () => { ui.showLetters = !ui.showLetters; save.letters = ui.showLetters; persist(); refreshPauseButtons(); });
$('btn-amount').addEventListener('click', toggleAmount);
$('btn-speed').addEventListener('click', toggleSpeed);
$('btn-hero').addEventListener('click', toggleHero);
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => { sound.click(); back(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });

// ------------------------------------------------------------ pointer input

function hitAt(sx, sy, pointerType) {
  if (!match) return null;
  const v = renderer.view;
  const p = v.toWorld(sx, sy);
  const slopPx = pointerType === 'touch' ? 26 : 12;
  // Buildings are drawn a little above their footprint; aim there too.
  const id = hitNode(match.world.nodes, p.x, p.y, slopPx / v.s);
  if (id != null) return id;
  const q = v.toWorld(sx, sy + 14);
  return hitNode(match.world.nodes, q.x, q.y, slopPx / v.s);
}

let ptr = null;
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'play' || !match || match.attract) return;
  sound.unlock();
  if (ptr) return; // one finger at a time
  canvas.setPointerCapture?.(e.pointerId);
  ui.padActive = false;
  ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, type: e.pointerType };
  const id = hitAt(e.clientX, e.clientY, e.pointerType);
  const before = match.commander.selected.size;
  match.commander.down(id);
  ui.pointer = { x: e.clientX, y: e.clientY };
  if (match.commander.own(id) && match.commander.selected.size !== before) sound.select();
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  pointerIdle = 0;
  if (!match || match.attract || mode !== 'play') return;
  ui.pointer = { x: e.clientX, y: e.clientY };
  const id = hitAt(e.clientX, e.clientY, e.pointerType);
  if (ptr && ptr.id === e.pointerId) {
    if (!ptr.moved && Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0) > 10) ptr.moved = true;
    const before = match.commander.selected.size;
    match.commander.move(id, ptr.moved);
    if (match.commander.selected.size > before) sound.select();
  }
  ui.hover = e.pointerType === 'mouse' || ptr ? id : null;
});
function pointerEnd(e, cancel) {
  if (!ptr || ptr.id !== e.pointerId) return;
  ptr = null;
  if (!match || match.attract) return;
  if (cancel) { match.commander.drag = null; return; }
  const id = hitAt(e.clientX, e.clientY, e.pointerType);
  const act = match.commander.up(id);
  if (act) doSend(act);
  else if (match.commander.own(id) && match.commander.selected.has(id)) sound.select();
  if (e.pointerType !== 'mouse') { ui.hover = null; ui.pointer = null; }
}
canvas.addEventListener('pointerup', (e) => pointerEnd(e, false));
canvas.addEventListener('pointercancel', (e) => pointerEnd(e, true));
canvas.addEventListener('pointerleave', (e) => { if (!ptr && e.pointerType === 'mouse') { ui.hover = null; ui.pointer = null; } });

// ------------------------------------------------------------ keyboard

function screenDirToWorld(dx, dy) {
  return renderer.view.rotate ? { x: -dy, y: dx } : { x: dx, y: dy };
}

function moveCursor(dx, dy) {
  const w = match.world;
  if (ui.cursor == null) {
    ui.cursor = w.buildingsOf(ME)[0]?.id ?? 0;
    return;
  }
  const d = screenDirToWorld(dx, dy);
  const next = nearestInDirection(w.nodes, w.nodes[ui.cursor], d.x, d.y);
  if (next != null) ui.cursor = next;
}

function moveFocus(dir) {
  const screen = SCREENS.map($).find((s) => !s.classList.contains('hidden'));
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not([disabled]), a[href]')].filter((x) => x.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
}

addEventListener('keydown', (e) => {
  sound.unlock();
  if (e.key === 'Shift') ui.shift = true;
  // A held key is one press: only the arrow keys keep moving the cursor.
  if (e.repeat && !e.code.startsWith('Arrow')) { e.preventDefault(); return; }
  if (mode === 'play' && match && !match.attract) {
    const c = match.commander;
    let handled = true;
    const code = e.code;
    if (code === 'Escape' || code === 'KeyP') pause();
    else if (code === 'KeyM') toggleMute();
    else if (code === 'KeyH') toggleHero();
    else if (code === 'Space') toggleAmount();
    else if (code === 'KeyF') toggleSpeed();
    else if (code === 'Backspace' || code === 'Delete') c.clear();
    else if (/^Digit[0-9]$/.test(code) || /^Numpad[0-9]$/.test(code)) {
      const n = Number(code.slice(-1));
      if (n === 0) c.selectAll(); else c.number(n, match.letterOrder);
      ui.showLetters = true;
      sound.select();
    } else if (/^Key[A-Z]$/.test(code)) {
      const id = match.byLetter[code.slice(3)];
      if (id != null) {
        const act = c.letter(id, e.shiftKey);
        if (act) doSend(act); else sound.select();
        ui.cursor = id;
      }
      ui.showLetters = true;
    } else if (code.startsWith('Arrow')) {
      const dx = code === 'ArrowLeft' ? -1 : code === 'ArrowRight' ? 1 : 0;
      const dy = code === 'ArrowUp' ? -1 : code === 'ArrowDown' ? 1 : 0;
      moveCursor(dx, dy);
      ui.showLetters = true;
    } else if (code === 'Enter' || code === 'NumpadEnter') {
      if (ui.cursor != null) {
        const act = c.tap(ui.cursor);
        if (act) doSend(act); else sound.select();
      }
    } else handled = false;
    if (handled) e.preventDefault();
    return;
  }
  if (mode === 'paused') {
    if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); resume(); return; }
  }
  if (mode === 'results' && e.code === 'Escape') { back(); return; }
  if (e.code === 'Escape') { e.preventDefault(); back(); return; }
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
});
addEventListener('keyup', (e) => { if (e.key === 'Shift') ui.shift = false; });
addEventListener('blur', () => { ui.shift = false; });

// ------------------------------------------------------------ gamepad

const pad = { prev: {}, aDown: null };
const PAD_BUTTONS = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, start: 9, up: 12, down: 13, left: 14, right: 15 };
let padAxisLatch = false;

function pollPad(dt) {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (!gp) return;
  const now = {};
  for (const [k, i] of Object.entries(PAD_BUTTONS)) now[k] = !!gp.buttons[i]?.pressed;
  const edge = (k) => now[k] && !pad.prev[k];
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const mag = Math.hypot(ax, ay);
  if (mode === 'play' && match && !match.attract) {
    const c = match.commander;
    if (!ui.padCursor) {
      const home = match.world.buildingsOf(ME)[0] || match.world.nodes[0];
      ui.padCursor = renderer.view.toScreen(home.x, home.y);
    }
    const cur = ui.padCursor;
    if (mag > 0.2 || Object.values(now).some(Boolean)) ui.padActive = true;
    if (mag > 0.2) {
      const sp = 760 * Math.min(1, (mag - 0.2) / 0.8);
      cur.x = Math.max(0, Math.min(innerWidth, cur.x + (ax / mag) * sp * dt));
      cur.y = Math.max(0, Math.min(innerHeight, cur.y + (ay / mag) * sp * dt));
    } else {
      // Ease onto the nearest building so A lands where you meant.
      const id = hitAt(cur.x, cur.y, 'touch');
      if (id != null) {
        const n = match.world.nodes[id];
        const p = renderer.view.toScreen(n.x, n.y);
        cur.x += (p.x - cur.x) * Math.min(1, dt * 10);
        cur.y += (p.y - cur.y) * Math.min(1, dt * 10);
      }
    }
    for (const [k, dx, dy] of [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]) {
      if (!edge(k)) continue;
      const from = hitAt(cur.x, cur.y, 'touch') ?? nearestTo(cur);
      const d = screenDirToWorld(dx, dy);
      const next = from == null ? null : nearestInDirection(match.world.nodes, match.world.nodes[from], d.x, d.y);
      const target = next ?? from;
      if (target != null) {
        const n = match.world.nodes[target];
        Object.assign(cur, renderer.view.toScreen(n.x, n.y));
      }
    }
    const id = hitAt(cur.x, cur.y, 'touch');
    if (ui.padActive) ui.hover = id;
    if (edge('a')) { pad.aDown = { x: cur.x, y: cur.y }; c.down(id); ui.pointer = { ...cur }; if (c.own(id)) sound.select(); }
    if (now.a && pad.aDown) {
      ui.pointer = { ...cur };
      c.move(id, Math.hypot(cur.x - pad.aDown.x, cur.y - pad.aDown.y) > 14 || !!c.drag?.moved);
    }
    if (!now.a && pad.prev.a && pad.aDown) {
      pad.aDown = null;
      const act = c.up(id);
      if (act) doSend(act);
    }
    if (edge('b')) c.clear();
    if (edge('x')) toggleAmount();
    if (edge('y')) toggleHero();
    if (edge('lb')) { c.selectAll(); sound.select(); }
    if (edge('start')) pause();
  } else {
    const up = edge('up') || (ay < -0.6 && !padAxisLatch) || edge('left') || (ax < -0.6 && !padAxisLatch);
    const down = edge('down') || (ay > 0.6 && !padAxisLatch) || edge('right') || (ax > 0.6 && !padAxisLatch);
    padAxisLatch = mag > 0.6;
    if (up) moveFocus(-1);
    if (down) moveFocus(1);
    if (edge('a')) { sound.unlock(); document.activeElement?.click?.(); }
    if (edge('b')) back();
    if (edge('start') && mode === 'paused') resume();
  }
  pad.prev = now;
}

function nearestTo(p) {
  let best = null, bd = Infinity;
  for (const n of match.world.nodes) {
    const s = renderer.view.toScreen(n.x, n.y);
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}

// ------------------------------------------------------------ loop

let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });

function previewState() {
  const c = match?.commander;
  if (!c || match.attract || mode !== 'play') return null;
  if (c.drag && c.drag.moved && c.drag.origin != null && c.selected.size) {
    let target = c.drag.over;
    if (target != null && target === c.drag.origin && c.selected.size <= 1) target = null;
    return { from: [...c.selected], target, point: ui.pointer, fraction: fraction() };
  }
  const aim = ui.cursor ?? ui.hover;
  if (c.selected.size && aim != null && !c.selected.has(aim) && !c.drag) {
    return { from: [...c.selected], target: aim, point: null, fraction: fraction() };
  }
  return null;
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({
    mode, kind: match?.spec?.kind || 'none', map: match?.spec?.index != null ? match.spec.index + 1 : 0,
    squads: match?.world?.marches?.length ?? 0, particles: renderer.particles.length,
  }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (window.TK.crashNext) { window.TK.crashNext = false; throw new Error('Forced crash for testing'); }
  pollPad(dt);
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2 && !ptr);
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
  if (ui.tipTimer > 0 && mode === 'play') { ui.tipTimer -= dt; if (ui.tipTimer <= 0) $('tip').classList.add('hidden'); }

  const running = match && (mode === 'play' || (match.attract && mode !== 'paused'));
  if (running) {
    const w = match.world;
    acc += dt * (match.attract ? 1 : simSpeed * (ui.fast ? 2 : 1));
    let steps = 0;
    while (acc >= STEP && steps < 80) {
      for (const ai of match.ais) ai.update(w, STEP);
      w.step(STEP);
      acc -= STEP;
      steps++;
    }
    if (w.events.length) {
      renderer.handleEvents(w.events, match.attract ? -1 : ME);
      if (!match.attract) {
        sound.handle(w.events, ME);
        advanceTip(w.events);
        for (const e of w.events) {
          if (e.type === 'out' && e.owner !== ME && !match.outSeen.has(e.owner)) {
            match.outSeen.add(e.owner);
            toast(`${PERSONALITIES[match.spec.rivals[e.owner - 2].personality].name} is out!`);
          }
        }
      }
      w.events.length = 0;
    }
    match.commander.prune();
    if (match.attract) {
      if (w.over || w.time > 240) { endTimer = endTimer < 0 ? 2.5 : endTimer - dt; if (endTimer <= 0) startAttract(); }
    } else if (endTimer < 0 && (w.over || !w.alive.has(ME))) {
      endTimer = 1;
      finish(w.winner === ME);
    }
    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.2; updateHud(); }
  }
  if (mode !== 'paused') renderer.update(dt);
  const kbCursor = ui.cursor != null && match && !match.attract ? match.world.nodes[ui.cursor] : null;
  renderer.draw({
    commander: match && !match.attract && mode !== 'results' ? match.commander : null,
    me: ME,
    hover: mode === 'play' ? ui.hover : null,
    cursor: mode === 'play' ? ui.cursor : null,
    cursorPos: mode === 'play' && ui.padActive && ui.padCursor ? ui.padCursor
      : mode === 'play' && kbCursor ? (() => { const p = renderer.view.toScreen(kbCursor.x, kbCursor.y); return { x: p.x + 8, y: p.y - renderer.spriteW(kbCursor.type) * 0.55 }; })() : null,
    preview: previewState(),
    showLetters: mode === 'play' && ui.showLetters,
    labels: match?.labels,
  });
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture;
// after a crash the guard returns early, so the loop stops rescheduling.
const loop = telemetry ? telemetry.guard(frame, 'tiny-kingdoms.frame') : frame;

function drawTitleCrown() {
  const c = $('title-crown');
  const g = c.getContext('2d');
  g.clearRect(0, 0, 120, 120);
  g.save();
  g.translate(60, 64);
  g.scale(46, 46);
  g.lineWidth = 0.12;
  drawEmblem(g, 'crown', '#ffc93d');
  g.restore();
  g.save();
  g.translate(60, 64);
  g.scale(46, 46);
  g.beginPath();
  g.moveTo(-0.9, 0.6); g.lineTo(-0.9, -0.4); g.lineTo(-0.45, 0.05); g.lineTo(0, -0.7);
  g.lineTo(0.45, 0.05); g.lineTo(0.9, -0.4); g.lineTo(0.9, 0.6); g.closePath();
  g.lineWidth = 0.09;
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.stroke();
  for (const [x, y, col] of [[-0.9, -0.48, '#e2589f'], [0, -0.8, '#3d7fe0'], [0.9, -0.48, '#2fa85a']]) {
    g.beginPath(); g.arc(x, y, 0.14, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.stroke();
  }
  g.restore();
}

window.TK = {
  get match() { return match; }, get mode() { return mode; }, save, renderer, sound, ui,
  play: (spec) => play(spec), campaignSpec, dailySpec, skirmishSpec, toTitle, toMap, openBrief, openSkirmish, openKingdom, pause, resume,
  crashNext: false,
};

if (location.protocol !== 'file:') {
  drawTitleCrown();
  resize();
  log.event('game.ready', { stars: totalStars(save), wins: save.wins, cleared: mapsCleared(save), streak: save.daily.bestStreak });
  const mapParam = parseInt(params.get('map'), 10);
  if (mapParam >= 1 && mapParam <= CAMPAIGN.length) play(campaignSpec(mapParam - 1));
  else if (params.has('daily')) play(dailySpec());
  else if (params.has('skirmish')) play(skirmishSpec());
  else toTitle();
  requestAnimationFrame(loop);
}
