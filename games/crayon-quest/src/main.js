// Crayon Quest: screens, input, animation and saves. Game rules live in the
// DOM-free modules (run.js, battle.js, map.js); this file only reads their
// state, calls their actions and animates the events they report.
import { CARD, CARDS, EVENT, FLOORS, HERO, HEROES, MONSTER, MONSTERS, STATUS_INFO, STICKER, STICKERS, cardDef, cardLines, needsTarget } from './data.js';
import {
  attackDamage, beginEnemyTurn, canPlay, endEnemyTurn, endPlayerTurn, enemyAct, intentView, living, playCard, resolveTarget, takeEvents,
} from './battle.js';
import {
  available, buyCard, buySticker, cancelPick, chooseEvent, choosePick, dailyHero, deckSorted, endRun, enterNode, eventOptionEnabled, finishBattle,
  leaveNode, newRun, openChest, pickChoices, restColor, restNap, startErase, takeRewardCard, upgradable,
} from './run.js';
import { ROWS, COLS } from './map.js';
import { bestPlay, botStep } from './bot.js';
import { DEFS, crossOutSVG, frameSVG, heroSVG, iconSVG, letterSpans, monsterSVG, crayonShape, ellipsePts } from './art.js';
import { dateKey, dailySeed, hashString, makeRng } from './rng.js';
import { liveStreak, loadProfile, mergeAlbum, noteBossDefeated, noteDailyStart, recordRun, saveProfile, checkUnlocks } from './progress.js';
import { Sound } from './audio.js';
import { Fx } from './fx.js';
import { frameMonitor } from './perf.js';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');
const coarse = matchMedia('(pointer: coarse)').matches;
document.documentElement.classList.toggle('reduced', reduced);
document.documentElement.classList.toggle('coarse', coarse);
const autopilot = params.has('autopilot');
const pace = autopilot ? 0.45 : 1;

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

let storage = null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
let profile = loadProfile(storage);
let run = profile.current;
if (run && run.battle) run.battle.events = [];

const sound = new Sound();
sound.setSound(profile.settings.sound);
sound.setMusic(profile.settings.music);
const fx = new Fx($('#fx'), { reduced });

$('#defs').innerHTML = DEFS;
bakePaperGrain();

// ------------------------------------------------------------ helpers

const wait = (ms) => new Promise((r) => setTimeout(r, ms * pace));
const icon = (name, color) => iconSVG(name, color);
const KIND_COLOR = { attack: '#e53958', skill: '#3d8bfd', magic: '#8e5cf0' };
const KIND_NAME = { attack: 'Attack', skill: 'Skill', magic: 'Magic' };

function persist() {
  if (run && run.phase !== 'over') profile.current = run;
  if (!saveProfile(storage, profile) && !persist.warned) {
    persist.warned = true;
    log.warn('save.failed', { 'storage.available': !!storage });
  }
}

function bakePaperGrain() {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const g = c.getContext('2d');
    const img = g.createImageData(180, 180);
    const rng = makeRng(42);
    for (let i = 0; i < img.data.length; i += 4) {
      rng.s = (rng.s + 0x6d2b79f5) >>> 0;
      const v = (rng.s >>> 24) & 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 128 ? 255 : 90;
      img.data[i + 3] = (v % 23) < 3 ? 26 : 8;
    }
    g.putImageData(img, 0, 0);
    document.documentElement.style.setProperty('--grain', `url(${c.toDataURL()})`);
  } catch {
    // Plain paper is fine.
  }
}

let toastTimer = 0;
function toast(text, ms = 2200) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.remove('hidden');
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

function floatText(el, text, cls = 'dmg', dy = 0) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = `float ${cls}`;
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2 + (Math.random() - 0.5) * 30}px`;
  f.style.top = `${r.top + r.height * 0.35 + dy}px`;
  document.body.appendChild(f);
  f.addEventListener('animationend', () => f.remove());
  setTimeout(() => f.remove(), 1500);
}

function retrigger(el, cls, ms = 450) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

const costCircle = (() => {
  const rng = makeRng(77);
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${crayonShape(rng, ellipsePts(20, 20, 16, 16, 10), { fill: '#ffd23f', w: 2.8, wob: 1 })}</svg>`;
})();
const energyOrb = (() => {
  const rng = makeRng(78);
  return `<svg viewBox="0 0 80 80" aria-hidden="true">${crayonShape(rng, ellipsePts(40, 40, 34, 34, 12), { fill: '#ffd23f', w: 3.6, wob: 1.6 })}</svg>`;
})();
const shieldBadge = icon('shield', '#3d8bfd');

// ------------------------------------------------------------ cards

function cardHTML(inst, { index = -1, hit = null, unknown = false, extraClass = '' } = {}) {
  const def = cardDef(inst);
  const variant = (inst.uid || hashString(inst.id)) % 3;
  const cls = `card k-${def.kind} r-${def.rarity}${inst.up ? ' upgraded' : ''}${unknown ? ' unknown' : ''} ${extraClass}`;
  const frame = frameSVG(KIND_COLOR[def.kind], variant, { fill: '#fffdf5' });
  if (unknown) {
    return `<div class="${cls}"><span class="frame">${frameSVG('#9e9aa6', variant, { fill: '#f1eee6' })}</span>
      <span class="inner"><span class="cname">???</span><span class="art">${icon('question', '#9e9aa6')}</span><span class="ctext"><small>Not found yet</small></span></span></div>`;
  }
  const lines = cardLines(def, hit || ((n) => String(n)));
  const text = lines.map((l) => (l === 'Poof!' || l === 'Stays all battle' ? `<small>${l}</small>` : `<span>${l}</span>`)).join('');
  const key = index >= 0 && index < 10 ? `<span class="key">${(index + 1) % 10}</span>` : '';
  const tag = index >= 0 ? 'button' : 'div';
  const act = index >= 0 ? ` data-act="card" data-i="${index}" aria-label="${def.name}, costs ${def.cost}. ${lines.join('. ')}"` : '';
  return `<${tag} class="${cls}"${act}><span class="frame">${frame}</span>
    <span class="cost">${costCircle}<span>${def.cost}</span></span>${key}
    <span class="inner"><span class="cname">${def.name}</span><span class="art">${icon(def.icon)}</span><span class="ctext">${text}</span>
    <span class="kind">${KIND_NAME[def.kind]}</span></span></${tag}>`;
}

// ------------------------------------------------------------ screens & modals

let screen = 'title';
function show(name) {
  screen = name;
  for (const id of ['title', 'heroes', 'map', 'battle']) $(`#screen-${id}`).classList.toggle('hidden', id !== name);
  if (name === 'title') renderTitle();
  if (name === 'heroes') renderHeroes();
  if (name === 'map') renderMap();
  sound.setScene(run ? run.floor : 0, name === 'battle' ? (run?.fightKind === 'boss' ? 'boss' : 'battle') : 'calm');
}

function openModal(html, cls = '') {
  const sheet = $('#modal-sheet');
  sheet.className = `sheet ${cls}`;
  sheet.innerHTML = html;
  $('#modal').classList.remove('hidden');
  sheet.scrollTop = 0;
  focusFirst(sheet);
}
function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modal-sheet').innerHTML = '';
}
function openModal2(html, cls = '') {
  const sheet = $('#modal2-sheet');
  sheet.className = `sheet ${cls}`;
  sheet.innerHTML = html;
  $('#modal2').classList.remove('hidden');
  sheet.scrollTop = 0;
  focusFirst(sheet);
}
function closeModal2() {
  $('#modal2').classList.add('hidden');
  $('#modal2-sheet').innerHTML = '';
  modal2Kind = null;
}
let modal2Kind = null;
const modalOpen = () => !$('#modal').classList.contains('hidden');
const modal2Open = () => !$('#modal2').classList.contains('hidden');

function focusFirst(root) {
  if (coarse) return;
  const el = root.querySelector('[data-focus]') || root.querySelector('button:not(:disabled), a.btn');
  if (el) el.focus({ preventScroll: true });
}

function activeLayer() {
  if (modal2Open()) return $('#modal2');
  if (modalOpen()) return $('#modal');
  return $(`#screen-${screen}`);
}

// Route the screen to whatever the run is doing now.
function sync() {
  if (!run) {
    closeModal();
    show('title');
    return;
  }
  if (run.phase === 'battle') {
    closeModal();
    if (screen !== 'battle') {
      show('battle');
      buildBattle();
    }
    renderBattle();
  } else if (run.phase === 'over') {
    showResults();
  } else {
    if (screen !== 'map') show('map');
    else renderMap();
    if (run.phase === 'map') closeModal();
    else renderRoom();
  }
  if (run.pick) renderPick();
  else if (modal2Kind === 'pick') closeModal2();
  persist();
}

// ------------------------------------------------------------ title

function renderTitle() {
  $('#logo').innerHTML = `${letterSpans('Crayon', 3)}<span class="wordbreak"></span>${letterSpans('Quest', 11)}`;
  const heroId = profile.unlocked.includes(profile.lastHero) ? profile.lastHero : 'kid';
  $('#title-hero').innerHTML = heroSVG(heroId);
  const met = profile.album.monsters.length ? profile.album.monsters : ['blob', 'eraser'];
  const pickA = met[Math.floor(Math.random() * met.length)];
  const pickB = met.length > 1 ? met.filter((m) => m !== pickA)[Math.floor(Math.random() * (met.length - 1))] : 'eraser';
  $('#title-monster-a').innerHTML = monsterSVG(pickA);
  $('#title-monster-b').innerHTML = monsterSVG(pickB);
  const hasRun = !!(run && run.phase !== 'over');
  $('#btn-continue').classList.toggle('hidden', !hasRun);
  if (hasRun) $('#btn-continue').textContent = `Continue: ${HERO[run.hero].name}, page ${run.floor + 1}${run.daily ? ' (daily)' : ''}`;
  $('#btn-new').classList.toggle('primary', !hasRun);
  const key = dateKey();
  const streak = liveStreak(profile, key);
  const today = profile.daily.todayKey === key ? profile.daily.todayBest : 0;
  const todayHero = HERO[dailyHero(dailySeed(key))];
  $('#daily-sub').textContent = `${todayHero.name} today${streak ? ` · ${streak}-day streak` : ''}${today ? ` · best ${today}` : ''}`;
  const c = profile.album;
  $('#btn-album').textContent = `Album ${c.cards.length + c.monsters.length + c.stickers.length}/${CARDS.length + MONSTERS.length + STICKERS.length}`;
  $('#title-best').textContent = profile.best ? `Best score: ${profile.best} · Runs: ${profile.runs} · Wins: ${profile.wins}` : 'Your first adventure is waiting!';
  updateSoundLabels();
}

function updateSoundLabels() {
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = `Sound: ${profile.settings.sound ? 'on' : 'off'}`;
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = `Music: ${profile.settings.music ? 'on' : 'off'}`;
}

// ------------------------------------------------------------ heroes

let heroChoice = profile.unlocked.includes(profile.lastHero) ? profile.lastHero : 'kid';
function renderHeroes() {
  $('#hero-list').innerHTML = HEROES.map((h) => {
    const locked = !profile.unlocked.includes(h.id);
    const st = STICKER[h.sticker];
    if (locked) {
      return `<button class="hero-card locked" data-act="hero" data-id="${h.id}" aria-label="${h.name}, locked. ${h.unlockText}">
        <div class="doodle">${heroSVG(h.id, { frames: 1, silhouette: true })}</div>
        <h3>???</h3><div class="lock">${icon('lock')} ${h.unlockText}</div></button>`;
    }
    const best = profile.bestHero[h.id] ? `<div class="best">Best: ${profile.bestHero[h.id]}</div>` : '';
    return `<button class="hero-card${h.id === heroChoice ? ' sel' : ''}" data-act="hero" data-id="${h.id}" aria-pressed="${h.id === heroChoice}">
      <div class="doodle boil">${heroSVG(h.id)}</div>
      <h3 style="color:${h.color}">${h.name}</h3>
      <div class="hp">${icon('hp')} ${h.hp} HP</div>
      <div class="blurb">${h.blurb}</div>
      <div class="stk">${icon(st.icon, st.color)} ${st.name}</div>${best}</button>`;
  }).join('');
  $('#gentle').checked = !!profile.settings.gentle;
  $('#btn-start').textContent = `Start with ${HERO[heroChoice].name}!`;
}

function beginRun(opts) {
  sound.unlock();
  run = newRun(opts);
  profile.current = run;
  if (run.daily) noteDailyStart(profile, run.dateKey);
  else profile.lastHero = run.hero;
  run.startedAt = Date.now();
  log.event('run.start', { hero: run.hero, daily: run.daily, gentle: run.gentle });
  sound.play('page');
  closeModal();
  show('map');
  sync();
}

function confirmReplace(then) {
  if (!run || run.phase === 'over') return then();
  openModal(`<h2>Start a new run?</h2>
    <p class="lead">Your ${HERO[run.hero].name} run on page ${run.floor + 1} will be put away in your run history.</p>
    <div class="row"><button class="btn primary" data-act="replace-yes" data-focus>Yes, new run</button><button class="btn" data-act="close">Keep my run</button></div>`, 'narrow');
  pendingReplace = then;
}
let pendingReplace = null;

function abandonRun() {
  if (!run || run.phase === 'over') return;
  endRun(run, 'quit');
  const minutes = run.stats.ms / 60000;
  recordRun(profile, run, { minutes, date: dateKey() });
  log.event('run.complete', { result: 'quit', score: run.score, floor: run.floor + 1, hero: run.hero, daily: run.daily });
  run = null;
  profile.current = null;
  persist();
}

// ------------------------------------------------------------ topbar

function topbarHTML() {
  const stickers = run.stickers.map((id) => {
    const s = STICKER[id];
    return `<button data-act="sticker" data-id="${id}" title="${s.name}: ${s.text}" aria-label="${s.name}: ${s.text}">${icon(s.icon, s.color)}</button>`;
  }).join('');
  const deckCount = run.deck.length;
  return `<span class="stat" title="Health">${icon('hp')} ${run.hp}/${run.maxHp}</span>
    <span class="stat" title="Gold">${icon('coin')} ${run.gold}</span>
    <span class="floor">Page ${run.floor + 1} · ${FLOORS[run.floor].name}${run.daily ? ' · Daily' : ''}</span>
    <span class="spacer"></span>
    <span class="stickers">${stickers}</span>
    <button class="icon-btn deck-btn" data-act="deck" title="Your deck (V)" aria-label="Your deck, ${deckCount} cards">${icon('cards')}<span>${deckCount}</span></button>
    <button class="icon-btn" data-act="pause" title="Pause (Esc)" aria-label="Pause">❚❚</button>`;
}

// ------------------------------------------------------------ map

const NODE_NAMES = { battle: 'Battle', elite: 'Big Doodle', shop: 'Shop', rest: 'Rest stop', treasure: 'Treasure', mystery: 'Mystery page', boss: 'Boss' };

function nodePos(n) {
  if (n.type === 'boss') return [50, 7];
  const x = ((n.col + 0.5) / COLS) * 100 + n.jx * 0.18;
  const y = 92 - ((n.row + 0.2) / (ROWS + 0.5)) * 80 + n.jy * 0.1;
  return [x, y];
}

function renderMap() {
  if (!run) return;
  $('#map-top').innerHTML = topbarHTML();
  const floor = FLOORS[run.floor];
  $('#map-title').innerHTML = `Page ${run.floor + 1}: <span style="color:${floor.color}">${floor.name}</span>`;
  const open = new Set(available(run));
  $('#map-hint').textContent = run.phase === 'map' ? (run.at ? 'Pick where to go next. Climb to the boss at the top!' : 'Pick a starting page at the bottom.') : '';
  const map = run.map;
  const nodes = Object.values(map.nodes);
  const rng = makeRng(hashString(`mappaths:${run.seed}:${run.floor}`));
  let lines = '';
  const box = $('#map').getBoundingClientRect();
  const W = box.width || 400, H = box.height || 600;
  for (const n of nodes) {
    const [x1, y1] = nodePos(n);
    for (const id of n.next) {
      const [x2, y2] = nodePos(map.nodes[id]);
      const walked = run.visited.includes(n.id) && run.visited.includes(id);
      const color = walked ? '#e53958' : 'rgba(45,42,50,.38)';
      const ax = (x1 / 100) * W, ay = (y1 / 100) * H, bx = (x2 / 100) * W, by = (y2 / 100) * H;
      const mx = (ax + bx) / 2 + (rng.s % 7) - 3, my = (ay + by) / 2;
      rng.s = (rng.s * 1103515245 + 12345) >>> 0;
      lines += `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${walked ? 4 : 3}" stroke-linecap="round" stroke-dasharray="${walked ? '0' : '2 9'}"/>`;
    }
  }
  let html = `<svg class="paths" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`;
  for (const n of nodes) {
    const [x, y] = nodePos(n);
    const isOpen = open.has(n.id);
    const here = run.at === n.id;
    const visited = run.visited.includes(n.id);
    const past = !isOpen && !visited && run.at && n.row <= (map.nodes[run.at]?.row ?? -1);
    const cls = `node ${n.type}${isOpen ? ' open' : ''}${visited ? ' done' : ''}${here ? ' here' : ''}${past ? ' past' : ''}`;
    const label = `${NODE_NAMES[n.type]}${isOpen ? ', you can go here' : visited ? ', visited' : ''}`;
    const me = here ? `<span class="me doodle">${heroSVG(run.hero, { frames: 1 })}</span>` : '';
    const tick = visited && !here ? `<span class="tick">${icon('star', '#ffd23f')}</span>` : '';
    html += `<button class="${cls}" style="left:${x}%;top:${y}%" ${isOpen ? `data-act="node" data-id="${n.id}"` : 'tabindex="-1" aria-disabled="true"'} aria-label="${label}" title="${NODE_NAMES[n.type]}">${icon(n.type === 'boss' ? 'boss' : n.type)}${tick}${me}</button>`;
  }
  $('#map').innerHTML = html;
  if (!modalOpen() && !coarse) {
    const first = $('#map .node.open');
    if (first && (!document.activeElement || !document.activeElement.classList.contains('node'))) first.focus({ preventScroll: true });
  }
}

addEventListener('resize', () => {
  if (screen === 'map') renderMap();
  if (screen === 'battle') layoutHand();
});

// ------------------------------------------------------------ battle view

let sel = -1;
let aimUid = 0;
let busy = false;
const dealUids = new Set();

function buildBattle() {
  const b = run.battle;
  $('#hero-spot').innerHTML = `<div class="doodle boil pose-idle">${heroSVG(run.hero)}</div><div class="doodle boil pose-attack hidden">${heroSVG(run.hero, { pose: 'attack' })}</div>
    <div class="bar-wrap"><div class="block-badge zero">${shieldBadge}<span>0</span></div><div class="hpbar hero"><i></i><b></b></div></div>
    <div class="fname">${HERO[run.hero].name}</div><div class="statuses"></div>`;
  $('#enemies').innerHTML = '';
  sel = -1;
  aimUid = 0;
  for (const c of b.hand) dealUids.add(c.uid);
  $('#battle-top').innerHTML = topbarHTML();
  queueMicrotask(() => monitor.mark(performance.now()));
}

function enemyEl(uid) {
  return $(`#enemies .enemy[data-uid="${uid}"]`);
}

function statusChips(o, isHero) {
  let out = '';
  const add = (key, n, iconName) => {
    if (n > 0) out += `<span class="chip" title="${STATUS_INFO[key].name}: ${STATUS_INFO[key].text}">${icon(iconName)}${n}</span>`;
  };
  add('power', o.power, 'muscle');
  add('smudge', o.smudge, 'drop');
  add('soggy', o.soggy, 'splash');
  add('dizzy', o.dizzy, 'dizzy');
  if (isHero && o.magic) {
    const m = o.magic;
    const parts = [];
    if (m.armor) parts.push(['armor', `+${m.armor}`, `Crayon Armor: Shield ${m.armor} at the end of each turn`]);
    if (m.glitter) parts.push(['palette', m.glitter, `Masterpiece: hit all monsters for ${m.glitter} at the end of each turn`]);
    if (m.quick) parts.push(['cap', `+${m.quick}`, `Draw ${m.quick} more each turn`]);
    if (m.spark) parts.push(['super', `+${m.spark}`, `+${m.spark} Energy each turn`]);
    if (m.shadow) parts.push(['buddy', m.shadow, `Doodle Buddy: Shield ${m.shadow} for each card you play`]);
    if (m.grow) parts.push(['flag', `+${m.grow}`, `Brave Banner: +${m.grow} Power each turn`]);
    if (m.drip) parts.push(['wand', m.drip, `Magic Marker: Smudge ${m.drip} to all monsters each turn`]);
    for (const [ic, n, t] of parts) out += `<span class="chip" title="${t}">${icon(ic)}${n}</span>`;
  }
  return out;
}

function setBar(root, hp, max, block) {
  const bar = root.querySelector('.hpbar');
  bar.querySelector('i').style.width = `${Math.max(0, (hp / max) * 100)}%`;
  bar.querySelector('b').textContent = `${hp}/${max}`;
  bar.classList.toggle('low', bar.classList.contains('hero') && hp / max < 0.3);
  const badge = root.querySelector('.block-badge');
  badge.classList.toggle('zero', block <= 0);
  badge.querySelector('span').textContent = block;
}

function intentHTML(b, e) {
  const v = intentView(b, e);
  if (!v) return '';
  const t = v.t;
  const cls = t === 'atk' || t === 'atkdef' || t === 'atkdebuff' ? 'atk' : t;
  let inner = '';
  if (v.dmg !== undefined) inner += `${icon('slash')}${v.dmg}${v.hits > 1 ? `<span class="sub">×${v.hits}</span>` : ''}`;
  if (t === 'def' || t === 'atkdef') inner += `${icon('shield')}${t === 'def' ? v.block : ''}`;
  if (t === 'buff') inner += icon('up');
  if (t === 'debuff' || t === 'atkdebuff') inner += icon('trick');
  if (t === 'summon') inner += icon('summon');
  return `<div class="intent ${cls}">${inner}</div>`;
}

function describeIntent(b, e) {
  const v = intentView(b, e);
  if (!v) return '';
  const name = e.name;
  const parts = [];
  if (v.dmg !== undefined) parts.push(`hit you for ${v.dmg}${v.hits > 1 ? `, ${v.hits} times` : ''}`);
  if (v.block && v.t !== 'summon') parts.push(`get ${v.block} Shield`);
  if (v.power) parts.push(`power up (+${v.power} Power)`);
  if (v.soggy) parts.push(`make you Soggy ${v.soggy}`);
  if (v.dizzy) parts.push(`make you Dizzy ${v.dizzy}`);
  if (v.smudge) parts.push(`Smudge you ${v.smudge}`);
  if (v.t === 'summon') parts.unshift(`call a ${MONSTER[v.summon].name}`);
  const last = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `${name} will ${last}.`;
}

function renderBattle() {
  const b = run.battle;
  if (!b) return;
  $('#battle-top').innerHTML = topbarHTML();
  // Hero.
  const hs = $('#hero-spot');
  setBar(hs, run.hp, run.maxHp, b.player.block);
  hs.querySelector('.statuses').innerHTML = statusChips(b.player, true);
  // Monsters, keyed by uid so animations keep running.
  const box = $('#enemies');
  const present = new Set();
  const targeting = sel >= 0 && b.hand[sel] && needsTarget(cardDef(b.hand[sel])) && living(b).length > 0;
  for (const e of b.enemies) {
    present.add(String(e.uid));
    let el = enemyEl(e.uid);
    if (!el) {
      const def = MONSTER[e.id];
      const size = def.role !== 'normal' ? ' big' : (def.art.scale || 1) < 0.9 ? ' small' : '';
      el = document.createElement('button');
      el.className = `enemy${size}${b.turn > 1 || e.uid > b.enemies.length ? ' arrive' : ''}`;
      el.dataset.act = 'enemy';
      el.dataset.uid = e.uid;
      el.innerHTML = `<div class="intent-slot"></div><div class="doodle boil">${monsterSVG(e.id)}</div>
        <div class="bar-wrap"><div class="block-badge zero">${shieldBadge}<span>0</span></div><div class="hpbar"><i></i><b></b></div></div>
        <div class="fname">${e.name}</div><div class="statuses"></div>`;
      box.appendChild(el);
    }
    if (!e.dead) {
      el.querySelector('.intent-slot').innerHTML = intentHTML(b, e);
      el.querySelector('.statuses').innerHTML = statusChips(e, false);
      el.setAttribute('aria-label', `${e.name}, ${e.hp} of ${e.maxHp} HP. ${describeIntent(b, e)}`);
    } else {
      el.querySelector('.intent-slot').innerHTML = '';
      el.querySelector('.statuses').innerHTML = '';
      el.tabIndex = -1;
    }
    setBar(el, e.hp, e.maxHp, e.block);
    el.classList.toggle('targetable', targeting && !e.dead);
    el.classList.toggle('aim', targeting && !e.dead && e.uid === aimUid);
  }
  for (const el of [...box.children]) if (!present.has(el.dataset.uid)) el.remove();
  box.classList.toggle('solo', b.enemies.length === 1);
  // Energy and piles.
  $('#energy').innerHTML = `${energyOrb}<span>${b.player.energy}</span>`;
  $('#energy').classList.toggle('empty', b.player.energy === 0);
  $('#energy').setAttribute('aria-label', `Energy ${b.player.energy}`);
  $('#pile-draw').innerHTML = `${icon('cards')}${b.draw.length}`;
  $('#pile-draw').setAttribute('aria-label', `Draw pile, ${b.draw.length} cards`);
  $('#pile-discard').innerHTML = `${icon('cards', '#9e9aa6')}${b.discard.length}`;
  $('#pile-discard').setAttribute('aria-label', `Discard pile, ${b.discard.length} cards`);
  renderHand();
  const anyPlayable = b.hand.some((_, i) => canPlay(run, i));
  $('#btn-end').classList.toggle('nudge', !anyPlayable && !busy && b.phase === 'player' && !b.over);
  $('#btn-end').disabled = busy || b.phase !== 'player' || !!b.over;
  updateCaption();
}

function hitFormatter(b) {
  const p = b.player;
  const target = aimUid ? b.enemies.find((e) => e.uid === aimUid && !e.dead) : null;
  return (n) => {
    const v = attackDamage(n, p, target);
    if (v > n) return `<b class="up">${v}</b>`;
    if (v < n) return `<b class="down">${v}</b>`;
    return String(n);
  };
}

function renderHand() {
  const b = run.battle;
  const hit = hitFormatter(b);
  const hand = $('#hand');
  hand.innerHTML = b.hand.map((c, i) => {
    let extra = '';
    if (!canPlay(run, i)) extra += ' off';
    if (i === sel) extra += ' sel';
    if (dealUids.has(c.uid)) extra += ' dealt';
    return cardHTML(c, { index: i, hit, extraClass: extra });
  }).join('');
  let d = 0;
  for (const el of hand.querySelectorAll('.card.dealt')) el.style.setProperty('--d', d++);
  dealUids.clear();
  if (sel >= 0 && b.hand[sel]) {
    const def = cardDef(b.hand[sel]);
    const el = hand.children[sel];
    const multi = needsTarget(def) && living(b).length > 1;
    if (el) el.insertAdjacentHTML('beforeend', `<span class="play-hint">${multi ? (coarse ? 'Tap a monster' : 'Pick a monster') : coarse ? 'Tap again to play' : 'Click again to play'}</span>`);
  }
  layoutHand();
}

function layoutHand() {
  const hand = $('#hand');
  const cards = [...hand.children];
  const n = cards.length;
  if (!n) return;
  const cw = cards[0].offsetWidth || 120;
  const avail = hand.clientWidth - 16;
  const overlap = n * cw > avail ? Math.ceil((n * cw - avail) / (2 * Math.max(1, n - 1))) + 1 : -3;
  hand.style.setProperty('--overlap', `${overlap}px`);
  cards.forEach((el, i) => {
    const off = i - (n - 1) / 2;
    el.style.setProperty('--rot', `${(off * (reduced ? 1 : 3)).toFixed(1)}deg`);
    if (i !== sel) el.style.setProperty('--lift', `${(Math.abs(off) * Math.abs(off) * 2.2).toFixed(1)}px`);
    else el.style.removeProperty('--lift');
    el.style.zIndex = i === sel ? 10 : '';
  });
}

let captionOverride = '';
function updateCaption() {
  const b = run?.battle;
  if (!b) return;
  let text = captionOverride;
  if (!text && sel >= 0 && b.hand[sel]) {
    const def = cardDef(b.hand[sel]);
    if (needsTarget(def) && living(b).length > 1) {
      const aim = b.enemies.find((e) => e.uid === aimUid && !e.dead);
      text = aim ? `${def.name} → ${aim.name}. ${coarse ? 'Tap it' : 'Click it or press Enter'} to play!` : `Who gets the ${def.name}? ${coarse ? 'Tap' : 'Click'} a monster.`;
    } else text = `${coarse ? 'Tap' : 'Click'} ${def.name} again${coarse ? '' : ' or press Enter'} to play it.`;
  }
  if (!text && b.turn === 1 && b.phase === 'player' && run.stats.battles === 0 && run.floor === 0) {
    text = 'Bubbles over monsters show what they will do next. Play cards, then End turn!';
  }
  $('#caption').textContent = text;
}

// ------------------------------------------------------------ battle actions

function selectCard(i) {
  const b = run.battle;
  if (busy || !b || b.over || b.phase !== 'player') return;
  if (!b.hand[i]) return;
  if (!canPlay(run, i)) {
    retrigger($('#hand').children[i], 'shake', 400);
    toast(`Not enough energy for ${cardDef(b.hand[i]).name}.`, 1600);
    sound.play('blocked');
    return;
  }
  const def = cardDef(b.hand[i]);
  const multi = needsTarget(def) && living(b).length > 1;
  if (sel === i && (!multi || aimUid)) {
    tryPlay(i, aimUid);
    return;
  }
  sel = i;
  if (multi) {
    const alive = living(b);
    if (!alive.some((e) => e.uid === aimUid)) aimUid = coarse ? 0 : alive[0].uid;
  }
  sound.play('select');
  renderBattle();
}

function tryPlay(i, uid) {
  const b = run.battle;
  if (busy || !b || b.over || !b.hand[i]) return;
  const card = b.hand[i];
  const def = cardDef(card);
  const target = resolveTarget(b, def, uid);
  const handEl = $('#hand').children[i];
  const targetEl = target ? enemyEl(target.uid) : def.kind === 'attack' ? $('#enemies') : $('#hero-spot');
  if (!playCard(run, i, target ? target.uid : 0)) return;
  flyGhost(handEl, targetEl);
  if (def.kind === 'attack') heroPose();
  else if (def.kind === 'magic') fx.burstAt($('#hero-spot'), '#b388ff', { count: 22, kind: 1, speed: 200, size: 7 });
  sound.play(def.kind === 'attack' ? 'scribble' : def.kind === 'magic' ? 'buff' : 'draw');
  sel = -1;
  if (!target || target.dead) aimUid = 0;
  drainEvents();
  renderBattle();
  persist();
  if (b.over) battleOver();
}

function flyGhost(fromEl, toEl) {
  if (!fromEl) return;
  const r = fromEl.getBoundingClientRect();
  const ghost = fromEl.cloneNode(true);
  ghost.classList.add('card-ghost');
  ghost.classList.remove('sel', 'dealt');
  ghost.querySelector('.play-hint')?.remove();
  ghost.removeAttribute('data-act');
  Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', transform: 'none' });
  document.body.appendChild(ghost);
  const t = toEl ? toEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
  const dx = t.left + t.width / 2 - (r.left + r.width / 2);
  const dy = t.top + t.height / 2 - (r.top + r.height / 2);
  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(0.35) rotate(${dx > 0 ? 25 : -25}deg)`;
    ghost.style.opacity = '0';
  });
  setTimeout(() => ghost.remove(), 420);
}

let poseTimer = 0;
function heroPose() {
  const hs = $('#hero-spot');
  hs.querySelector('.pose-idle').classList.add('hidden');
  hs.querySelector('.pose-attack').classList.remove('hidden');
  retrigger(hs, 'lunge-right', 360);
  clearTimeout(poseTimer);
  poseTimer = setTimeout(() => {
    hs.querySelector('.pose-idle').classList.remove('hidden');
    hs.querySelector('.pose-attack').classList.add('hidden');
  }, 380);
}

function drainEvents() {
  const b = run.battle;
  if (!b) return;
  const evs = takeEvents(b);
  const hero = $('#hero-spot');
  let n = 0;
  for (const ev of evs) {
    const el = ev.uid ? enemyEl(ev.uid) : null;
    const stagger = Math.min(n++, 6) * 70;
    switch (ev.type) {
      case 'hit': {
        const target = ev.who === 'hero' ? hero : el;
        setTimeout(() => {
          if (ev.amount > 0) {
            floatText(target, `-${ev.amount}`, 'dmg');
            retrigger(target, 'shake', 380);
            const color = ev.who === 'hero' ? '#e53958' : MONSTER[b.enemies.find((e) => e.uid === ev.uid)?.id]?.art.color || '#e53958';
            fx.burstAt(target, color, { count: 14, speed: 280 });
            sound.play(ev.who === 'hero' ? 'hurt' : 'hit');
          } else if (ev.blocked > 0) {
            floatText(target, 'Blocked!', 'blk');
            sound.play('blocked');
          }
          if (ev.blocked > 0 && ev.amount > 0) floatText(target, `(${ev.blocked} blocked)`, 'blk', 34);
        }, stagger);
        break;
      }
      case 'block': {
        const target = ev.who === 'hero' ? hero : el;
        floatText(target, `+${ev.amount}`, 'blk', 20);
        retrigger(target?.querySelector('.block-badge'), 'pop', 320);
        if (ev.who === 'hero') {
          sound.play('block');
          fx.burstAt(target, '#6fb6ff', { count: 8, kind: 1, speed: 150, size: 6 });
        }
        break;
      }
      case 'defeat': {
        if (!el) break;
        el.classList.add('dying');
        el.classList.remove('targetable', 'aim');
        el.insertAdjacentHTML('beforeend', `<div class="xout-wrap">${crossOutSVG(ev.uid * 13)}</div>`);
        setTimeout(() => {
          fx.burstAt(el, '#ffd23f', { count: 26, kind: 1, speed: 320, size: 8 });
          sound.play('defeat');
        }, 120);
        break;
      }
      case 'power':
        floatText(ev.who === 'hero' ? hero : el, `+${ev.amount} Power`, 'info');
        if (ev.who !== 'hero') sound.play('buff');
        break;
      case 'heal':
        if (ev.amount > 0) {
          floatText(hero, `+${ev.amount}`, 'heal');
          sound.play('heal');
          fx.burstAt(hero, '#74d67a', { count: 12, kind: 1, speed: 180 });
        }
        break;
      case 'smudge':
        floatText(ev.who === 'hero' ? hero : el, `-${ev.amount}`, 'dmg');
        fx.burstAt(ev.who === 'hero' ? hero : el, '#7c4dff', { count: 10, speed: 160 });
        sound.play('smudge');
        break;
      case 'status':
        if (ev.who === 'hero') {
          floatText(hero, 'Uh oh!', 'info');
          sound.play('debuff');
        } else if (ev.who === 'enemy') {
          fx.burstAt(el, '#b388ff', { count: 8, kind: 1, speed: 140 });
        } else {
          for (const e of living(b)) fx.burstAt(enemyEl(e.uid), '#b388ff', { count: 6, kind: 1, speed: 140 });
        }
        break;
      case 'act':
        retrigger(el, 'lunge-left', 380);
        break;
      case 'summon':
        sound.play('enemy');
        break;
      case 'draw':
        dealUids.add(ev.uid);
        break;
      case 'shuffle':
        floatText($('#pile-draw'), 'Shuffle!', 'info');
        sound.play('draw');
        break;
      case 'turn':
        if (ev.turn > 1) banner('Your turn!');
        break;
      default:
        break;
    }
  }
}

function banner(text, enemy = false) {
  const el = $('#turn-banner');
  el.textContent = text;
  el.className = `turn-banner${enemy ? ' enemy-turn' : ''}`;
  void el.offsetWidth;
  sound.play(enemy ? 'enemy' : 'turn');
  clearTimeout(banner.t);
  banner.t = setTimeout(() => el.classList.add('hidden'), 1100);
}

async function doEndTurn() {
  const b = run?.battle;
  if (!b || busy || b.over || b.phase !== 'player') return;
  busy = true;
  sel = -1;
  aimUid = 0;
  try {
    endPlayerTurn(run);
    drainEvents();
    renderBattle();
    if (b.over) return;
    banner("Monsters' turn", true);
    await wait(650);
    beginEnemyTurn(run);
    drainEvents();
    renderBattle();
    if (b.over) return;
    for (const e of b.enemies.slice()) {
      if (b.over) break;
      if (e.dead || !e.intent) continue;
      await wait(180);
      captionOverride = describeIntent(b, e);
      enemyAct(run, e.uid);
      drainEvents();
      renderBattle();
      await wait(560);
    }
    captionOverride = '';
    if (!b.over) {
      endEnemyTurn(run);
      drainEvents();
    }
  } finally {
    busy = false;
    captionOverride = '';
    if (run && run.battle === b) {
      renderBattle();
      persist();
      if (b.over) battleOver();
    }
  }
}

let overPending = false;
async function battleOver() {
  if (overPending) return;
  overPending = true;
  const b = run.battle;
  const kind = run.fightKind;
  const floor = run.floor + 1;
  if (b.over === 'won') {
    log.event('level.complete', { floor, kind, turns: b.turn, hp: run.hp, 'hp.max': run.maxHp, cards: b.cardsPlayed, hero: run.hero });
    await wait(1200);
    banner(kind === 'boss' ? 'Boss scribbled out!' : 'You win!');
    sound.play('win');
    await wait(900);
  } else {
    log.event('level.fail', { floor, kind, turns: b.turn, hero: run.hero, enemies: b.enemies.map((e) => e.id).join(',') });
    await wait(900);
    sound.play('lose');
  }
  overPending = false;
  if (!run || run.battle !== b) return;
  finishBattle(run);
  if (b.over === 'won' && kind === 'boss') {
    const fresh = noteBossDefeated(profile);
    announceUnlocks(fresh);
  }
  sync();
}

function announceUnlocks(ids) {
  for (const id of ids) {
    log.event('hero.unlock', { hero: id });
    sound.play('unlock');
    toast(`New hero unlocked: ${HERO[id].name}!`, 3600);
  }
}

// ------------------------------------------------------------ rooms

function renderRoom() {
  if (!run) return;
  switch (run.phase) {
    case 'reward': return renderReward();
    case 'shop': return renderShop();
    case 'rest': return renderRest();
    case 'event': return renderEvent();
    case 'treasure': return renderTreasure();
    default: return closeModal();
  }
}

function renderReward() {
  const r = run.reward;
  const kindTitle = { boss: 'Boss beaten!', elite: 'Big Doodle beaten!', battle: 'Battle won!', event: 'A sparkly find!' }[r.kind] || 'Nice!';
  let loot = '';
  if (r.gold) loot += `<div class="loot-row">${icon('coin')} +${r.gold} gold</div>`;
  if (r.healed) loot += `<div class="loot-row">${icon(STICKER.smiley.icon, STICKER.smiley.color)} Smiley Sticker healed ${r.healed}</div>`;
  if (r.sticker) {
    const s = STICKER[r.sticker];
    loot += `<div class="loot-row">${icon(s.icon, s.color)}<span>New sticker: ${s.name}<small>${s.text}</small></span></div>`;
  }
  const choices = r.cards.map((id, i) => {
    const cls = r.picked === null ? '' : r.picked === i ? ' taken' : ' faded';
    return `<button class="pick${cls}" data-act="reward-card" data-i="${i}" ${r.picked !== null ? 'disabled' : ''} aria-label="Take ${CARD[id].name}: ${cardLines(CARD[id]).join('. ')}">${cardHTML({ id, up: false, uid: i + 1 })}</button>`;
  }).join('');
  const next = r.kind === 'boss' ? (run.floor >= 2 ? 'Finish the climb!' : 'Turn the page →') : 'Back to the map →';
  openModal(`<h2>${kindTitle}</h2><div class="loot">${loot}</div>
    ${r.cards.length ? `<p class="lead">${r.picked === null ? 'Pick a new crayon card for your deck:' : `${CARD[r.cards[r.picked]].name} added to your deck!`}</p><div class="choices">${choices}</div>` : ''}
    <div class="foot"><button class="btn ${r.picked !== null || !r.cards.length ? 'primary' : ''}" data-act="leave" ${r.picked !== null ? 'data-focus' : ''}>${r.picked === null && r.cards.length ? 'Skip card' : next}</button></div>`, 'wide');
}

function renderShop() {
  const s = run.shop;
  const priceTag = (p, sold) => (sold ? '<span class="sold">Sold!</span>' : `<span class="price${run.gold < p ? ' cant' : ''}">${icon('coin')}${p}</span>`);
  const cards = s.cards.map((c, i) => `<button class="pick${c.sold ? ' faded' : ''}" data-act="buy-card" data-i="${i}" ${c.sold ? 'disabled' : ''} aria-label="Buy ${CARD[c.id].name} for ${c.price} gold">
    ${cardHTML({ id: c.id, up: false, uid: i + 1 })}${priceTag(c.price, c.sold)}</button>`).join('');
  const stickers = s.stickers.map((x, i) => {
    const st = STICKER[x.id];
    return `<button class="pick sticker-item${x.sold ? ' faded' : ''}" data-act="buy-sticker" data-i="${i}" ${x.sold ? 'disabled' : ''} aria-label="Buy ${st.name} for ${x.price} gold: ${st.text}">
      <span class="stk-art">${icon(st.icon, st.color)}</span><b>${st.name}</b><span>${st.text}</span>${priceTag(x.price, x.sold)}</button>`;
  }).join('');
  const erase = `<button class="pick sticker-item${s.erased ? ' faded' : ''}" data-act="erase" ${s.erased ? 'disabled' : ''} aria-label="Erase a card for ${s.erasePrice} gold">
    <span class="stk-art">${icon('eraser')}</span><b>Eraser</b><span>Rub out one card from your deck.</span>${priceTag(s.erasePrice, s.erased)}</button>`;
  openModal(`<h2>${icon('shop')} Crayon Shop</h2><p class="lead">You have ${icon('coin')}<b>${run.gold}</b> gold. "Everything is hand-drawn!"</p>
    <div class="shop-section"><h3>Cards</h3><div class="shop-grid">${cards}</div></div>
    <div class="shop-section"><h3>Stickers & tricks</h3><div class="shop-grid">${stickers}${erase}</div></div>
    <div class="foot"><button class="btn primary" data-act="leave">Leave the shop →</button></div>`, 'wide');
}

function renderRest() {
  const r = run.rest;
  const healAmt = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * (0.3 + (run.stickers.includes('banana') ? 0.15 : 0))));
  if (r.done) {
    const msg = r.healed !== undefined ? `Zzz... You healed ${r.healed} HP.` : `You colored in ${CARD[r.upgraded].name}. It looks great!`;
    openModal(`<h2>Rest stop</h2><div class="big-icon">${icon(r.healed !== undefined ? 'rest' : 'crayon')}</div><p class="lead">${msg}</p>
      <div class="foot"><button class="btn primary" data-act="leave" data-focus>Back to the map →</button></div>`, 'narrow');
    return;
  }
  const canColor = upgradable(run).length > 0;
  openModal(`<h2>Rest stop</h2><div class="big-icon wiggle">${icon('rest')}</div><p class="lead">A cozy little tent on the page. What would you like to do?</p>
    <div class="row"><button class="btn big opt" data-act="nap" data-focus>Take a nap<small>Heal ${healAmt} HP</small></button>
    <button class="btn big opt" data-act="color" ${canColor ? '' : 'disabled'}>Color in a card<small>Make one card stronger</small></button></div>`, 'narrow');
}

function renderEvent() {
  const e = run.event;
  const ev = EVENT[e.id];
  if (e.result) {
    const extra = e.sticker ? `<div class="loot"><div class="loot-row">${icon(STICKER[e.sticker].icon, STICKER[e.sticker].color)}<span>${STICKER[e.sticker].name}<small>${STICKER[e.sticker].text}</small></span></div></div>` :
      e.card ? `<div class="choices">${cardHTML({ id: e.card, up: false, uid: 5 })}</div>` : '';
    openModal(`<h2>${ev.title}</h2><div class="big-icon">${icon(ev.art)}</div><p class="event-text">${e.result}</p>${extra}
      <div class="foot"><button class="btn primary" data-act="leave" data-focus>Back to the map →</button></div>`, 'narrow');
    return;
  }
  const opts = ev.options.map((o, i) => `<button class="btn opt" data-act="event" data-i="${i}" ${eventOptionEnabled(run, o) ? '' : 'disabled'}>${o.label}<small>${o.note}</small></button>`).join('');
  openModal(`<h2>${ev.title}</h2><div class="big-icon wiggle">${icon(ev.art)}</div><p class="event-text">${ev.text}</p><div class="col">${opts}</div>`, 'narrow');
}

function renderTreasure() {
  const t = run.treasure;
  if (!t.opened) {
    openModal(`<h2>Treasure page!</h2><div class="big-icon wiggle">${icon('treasure')}</div><p class="lead">A doodled treasure chest. What's inside?</p>
      <div class="foot"><button class="btn primary big" data-act="chest" data-focus>Open it!</button></div>`, 'narrow');
    return;
  }
  const s = t.sticker ? STICKER[t.sticker] : null;
  openModal(`<h2>Treasure page!</h2><div class="loot"><div class="loot-row">${icon('coin')} +${t.gold} gold</div>
    ${s ? `<div class="loot-row">${icon(s.icon, s.color)}<span>New sticker: ${s.name}<small>${s.text}</small></span></div>` : ''}</div>
    <div class="foot"><button class="btn primary" data-act="leave" data-focus>Back to the map →</button></div>`, 'narrow');
}

function renderPick() {
  const p = run.pick;
  const title = { upgrade: 'Color in a card', remove: 'Erase a card', copy: 'Copy a card' }[p.mode];
  const lead = { upgrade: 'Pick a card to make stronger. Here is how it will look:', remove: `Pick a card to rub out of your deck${p.cost ? ` (${p.cost} gold)` : ''}.`, copy: 'Pick a card to copy.' }[p.mode];
  const cards = deckSortedList(pickChoices(run)).map((c) => `<button class="pick" data-act="pick" data-uid="${c.uid}" aria-label="${cardDef(c).name}">${cardHTML(p.mode === 'upgrade' ? { ...c, up: true } : c)}</button>`).join('');
  modal2Kind = 'pick';
  openModal2(`<h2>${title}</h2><p class="lead">${lead}</p><div class="deck-grid">${cards}</div>
    <div class="foot"><button class="btn" data-act="pick-cancel">Never mind</button></div>`, 'wide');
}

function deckSortedList(list) {
  const order = { attack: 0, skill: 1, magic: 2 };
  return list.slice().sort((a, b) => {
    const da = cardDef(a), db = cardDef(b);
    return order[da.kind] - order[db.kind] || da.cost - db.cost || da.name.localeCompare(db.name);
  });
}

function showDeck() {
  if (!run) return;
  const b = run.battle;
  let html = '';
  if (b && run.phase === 'battle') {
    const sec = (title, list) => (list.length ? `<div class="deck-section"><h3>${title} (${list.length})</h3><div class="deck-grid">${deckSortedList(list).map((c) => cardHTML(c)).join('')}</div></div>` : '');
    html = `<h2>Your cards</h2>${sec('Draw pile', b.draw)}${sec('Discard pile', b.discard)}${sec('Poofed & Magic', b.poofed)}${!b.draw.length && !b.discard.length && !b.poofed.length ? '<p class="lead">Your piles are empty.</p>' : ''}`;
  } else {
    html = `<h2>Your deck (${run.deck.length})</h2><div class="deck-grid">${deckSorted(run).map((c) => cardHTML(c)).join('')}</div>`;
  }
  const st = run.stickers.map((id) => {
    const s = STICKER[id];
    return `<div class="sticker-item"><span class="stk-art">${icon(s.icon, s.color)}</span><b>${s.name}</b><span>${s.text}</span></div>`;
  }).join('');
  modal2Kind = 'deck';
  openModal2(`${html}<div class="deck-section"><h3>Stickers</h3><div class="shop-grid">${st}</div></div>
    <div class="foot"><button class="btn primary" data-act="close2" data-focus>Close</button></div>`, 'wide');
}

// ------------------------------------------------------------ pause

let paused = false;
function pause() {
  if (!run || paused || (screen !== 'map' && screen !== 'battle')) return;
  paused = true;
  modal2Kind = 'pause';
  openModal2(`<h2>Paused</h2><div class="col">
    <button class="btn primary" data-act="resume" data-focus>Resume</button>
    <button class="btn" data-act="deck">Look at my deck</button>
    <button class="btn" data-act="help">How to play</button>
    <div class="row"><button class="btn small" data-act="sound" data-sound>Sound</button><button class="btn small" data-act="music" data-music>Music</button></div>
    <button class="btn" data-act="to-title">Title screen (run is saved)</button>
    <button class="btn" data-act="giveup">End this run</button>
    <a class="btn" href="../../index.html">Back to arcade</a></div>`, 'narrow');
  updateSoundLabels();
  persist();
}
function resume() {
  paused = false;
  closeModal2();
  if (run?.pick) renderPick();
}

// ------------------------------------------------------------ results

function showResults() {
  if (!run) return;
  if (!run.recorded) {
    const minutes = run.stats.ms / 60000;
    run.celebrate = recordRun(profile, run, { minutes, date: dateKey() });
    run.recorded = true;
    log.event('run.complete', { result: run.result, score: run.score, floor: run.floor + 1, hero: run.hero, daily: run.daily, minutes: Math.round(minutes), battles: run.stats.battles });
    announceUnlocks(run.celebrate.unlocks);
    persist();
  }
  const c = run.celebrate;
  const won = run.result === 'won';
  const newEntries = c.album.cards.length + c.album.monsters.length + c.album.stickers.length;
  const unlocks = c.unlocks.map((id) => `<div class="unlock"><div class="doodle boil">${heroSVG(id)}</div>New hero: ${HERO[id].name}!</div>`).join('');
  const s = run.stats;
  const best = c.newBest ? '<span class="newbest">New best!</span>' : c.newDailyBest && run.daily ? '<span class="newbest">Daily best!</span>' : c.newHeroBest ? `<span class="newbest">${HERO[run.hero].name} best!</span>` : '';
  closeModal2();
  openModal(`<h2>${won ? 'You reached the top of the tower!' : 'Your page got crumpled!'}</h2>
    <div class="result-hero doodle boil ${won ? '' : 'lost'}">${heroSVG(run.hero, { pose: won ? 'attack' : 'idle' })}</div>
    <p class="lead">${won ? 'You scribbled out the Grand Smudge. What a masterpiece!' : `You made it to page ${run.floor + 1}: ${FLOORS[run.floor].name}. Every run makes you a better artist!`}</p>
    ${best}<div class="score">${run.score}</div>
    <div class="stats"><div><b>${s.battles}</b>battles won</div><div><b>${s.bosses}</b>bosses</div><div><b>${run.deck.length}</b>cards in deck</div><div><b>${run.stickers.length}</b>stickers</div><div><b>${Math.max(1, Math.round(s.ms / 60000))}</b>minutes</div></div>
    ${unlocks}${newEntries ? `<p class="center muted">${newEntries} new album ${newEntries === 1 ? 'entry' : 'entries'}!</p>` : ''}
    <div class="foot"><button class="btn primary big" data-act="again" data-focus>Play again</button><button class="btn" data-act="album">Album</button><button class="btn" data-act="to-title">Title</button></div>`, 'narrow');
}

// ------------------------------------------------------------ album, history, help

let albumTab = 'cards';
function showAlbum() {
  const a = profile.album;
  const tabs = ['cards', 'monsters', 'stickers'].map((t) => `<button class="btn small${t === albumTab ? ' on' : ''}" data-act="tab" data-id="${t}">${t[0].toUpperCase() + t.slice(1)} ${a[t].length}/${t === 'cards' ? CARDS.length : t === 'monsters' ? MONSTERS.length : STICKERS.length}</button>`).join('');
  let grid = '';
  if (albumTab === 'cards') grid = CARDS.map((c, i) => cardHTML({ id: c.id, up: false, uid: i }, { unknown: !a.cards.includes(c.id) })).join('');
  if (albumTab === 'monsters') {
    grid = MONSTERS.map((m) => {
      const known = a.monsters.includes(m.id);
      const role = m.role === 'boss' ? 'Boss' : m.role === 'elite' ? 'Big Doodle' : FLOORS[m.floor].name;
      return `<div class="album-mon"><div class="doodle${known ? ' boil' : ''}">${monsterSVG(m.id, { frames: known ? 3 : 1, silhouette: !known })}</div>${known ? m.name : '???'}<small>${known ? role : 'Not met yet'}</small></div>`;
    }).join('');
  }
  if (albumTab === 'stickers') {
    grid = STICKERS.map((s) => {
      const known = a.stickers.includes(s.id);
      return `<div class="sticker-item"><span class="stk-art${known ? '' : ' silhouette'}">${icon(s.icon, s.color)}</span><b>${known ? s.name : '???'}</b><span>${known ? s.text : 'Not found yet'}</span></div>`;
    }).join('');
  }
  const html = `<h2>Sketchbook Album</h2><div class="tabs">${tabs}</div><div class="album-grid">${grid}</div>
    <div class="foot"><button class="btn primary" data-act="close-album" data-focus>Close</button></div>`;
  if (modalOpen() && run?.phase === 'over') {
    modal2Kind = 'album';
    openModal2(html, 'wide');
  } else openModal(html, 'wide');
}

function showHistory() {
  const rows = profile.history.map((h) => `<tr><td><span class="doodle still">${heroSVG(h.hero, { frames: 1 })}</span> ${HERO[h.hero].name}${h.daily ? ' · daily' : ''}${h.gentle ? ' · gentle' : ''}</td>
    <td class="${h.result === 'won' ? 'won' : ''}">${h.result === 'won' ? 'Won!' : h.result === 'quit' ? 'Put away' : `Page ${h.floor}`}</td><td><b>${h.score}</b></td><td>${h.minutes} min</td><td>${h.date || ''}</td></tr>`).join('');
  const d = profile.daily;
  openModal(`<h2>Your runs</h2>
    <div class="stats"><div><b>${profile.runs}</b>runs</div><div><b>${profile.wins}</b>wins</div><div><b>${profile.best}</b>best score</div><div><b>${d.bestStreak}</b>best daily streak</div><div><b>${profile.bosses}</b>bosses beaten</div></div>
    ${rows ? `<table class="hist"><tr><th>Hero</th><th>Result</th><th>Score</th><th>Time</th><th>Date</th></tr>${rows}</table>` : '<p class="lead">No runs yet. Go draw some adventures!</p>'}
    <div class="foot"><button class="btn primary" data-act="close" data-focus>Close</button></div>`, 'wide');
}

function showHelp() {
  const chip = (ic, name, text) => `<li><span class="chip">${icon(ic)}</span> <b>${name}</b>: ${text}</li>`;
  const html = `<h2>How to play</h2><div class="help">
    <p>Climb three pages of the sketchbook tower. Pick a path on the map, beat the doodle monsters, and scribble out the boss at the top of each page!</p>
    <h3>Battles</h3>
    <ul><li>Each turn you get <b>3 energy</b> and <b>5 cards</b>. The yellow circle on a card is its cost.</li>
    <li>${coarse ? 'Tap a card, then tap a monster.' : 'Click a card, then click a monster. Or press 1–9, ←/→ to aim and Enter.'} Cards with no target: tap them twice.</li>
    <li>The bubble over each monster shows what it will do next. A sword means it will hit you!</li>
    <li>When you're done, press <b>End turn</b>${coarse ? '' : ' (E)'}.</li></ul>
    <h3>Words to know</h3><ul class="chips">
    ${chip('shield', 'Shield', STATUS_INFO.block.text)}${chip('muscle', 'Power', STATUS_INFO.power.text)}${chip('drop', 'Smudge', STATUS_INFO.smudge.text)}
    ${chip('splash', 'Soggy', STATUS_INFO.soggy.text)}${chip('dizzy', 'Dizzy', STATUS_INFO.dizzy.text)}
    <li><b>Magic</b> cards stay for the whole battle. <b>Poof!</b> cards can be used once per battle.</li></ul>
    <h3>The map</h3><div class="map-legend">${Object.entries(NODE_NAMES).map(([k, v]) => `<span>${icon(k)} ${v}</span>`).join('')}</div>
    </div><div class="foot"><button class="btn primary" data-act="${modal2Kind === 'pause' ? 'help-back' : 'close'}" data-focus>Got it!</button></div>`;
  if (modal2Kind === 'pause') {
    modal2Kind = 'help';
    openModal2(html, 'wide');
  } else openModal(html, 'wide');
}

// ------------------------------------------------------------ actions

const actions = {
  continue() {
    if (!run) return;
    sound.unlock();
    show(run.phase === 'battle' ? 'battle' : 'map');
    if (run.phase === 'battle') buildBattle();
    sync();
  },
  heroes() {
    sound.unlock();
    show('heroes');
  },
  daily() {
    const key = dateKey();
    if (run && run.daily && run.dateKey === key && run.phase !== 'over') return actions.continue();
    confirmReplace(() => {
      abandonRun();
      beginRun({ seed: dailySeed(key), daily: true, dateKey: key });
    });
  },
  album() { showAlbum(); },
  history() { showHistory(); },
  help() { showHelp(); },
  'help-back'() {
    modal2Kind = null;
    paused = false;
    pause();
  },
  sound() {
    profile.settings.sound = !profile.settings.sound;
    sound.setSound(profile.settings.sound);
    sound.unlock();
    updateSoundLabels();
    persist();
  },
  music() {
    profile.settings.music = !profile.settings.music;
    sound.setMusic(profile.settings.music);
    sound.unlock();
    updateSoundLabels();
    persist();
  },
  title() { show('title'); },
  'to-title'() {
    paused = false;
    closeModal2();
    closeModal();
    if (run && run.phase === 'over') {
      run = null;
      profile.current = null;
    }
    persist();
    show('title');
  },
  hero(el) {
    const id = el.dataset.id;
    if (!profile.unlocked.includes(id)) {
      toast(`${HERO[id].unlockText} to unlock this hero!`);
      return;
    }
    heroChoice = id;
    sound.play('select');
    renderHeroes();
    $(`.hero-card[data-id="${id}"]`)?.focus({ preventScroll: true });
  },
  start() {
    profile.settings.gentle = $('#gentle').checked;
    const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    confirmReplace(() => {
      abandonRun();
      beginRun({ seed, hero: heroChoice, gentle: profile.settings.gentle });
    });
  },
  'replace-yes'() {
    const f = pendingReplace;
    pendingReplace = null;
    closeModal();
    if (f) f();
  },
  node(el) {
    if (!run || run.phase !== 'map') return;
    const id = el.dataset.id;
    if (!enterNode(run, id)) return;
    sound.play('map');
    const type = run.map.nodes[id].type;
    if (run.phase === 'battle') {
      log.event('level.start', { floor: run.floor + 1, kind: run.fightKind, node: type, enemies: run.battle.enemies.length, hero: run.hero });
      show('battle');
      buildBattle();
      if (run.fightKind === 'boss') banner(`${run.battle.enemies[0].name}!`, true);
      else if (run.fightKind === 'elite') banner('A Big Doodle!', true);
    }
    sync();
  },
  card(el) { selectCard(Number(el.dataset.i)); },
  enemy(el) {
    const b = run?.battle;
    if (!b) return;
    const uid = Number(el.dataset.uid);
    const e = b.enemies.find((x) => x.uid === uid);
    if (!e || e.dead) return;
    if (sel >= 0 && b.hand[sel] && needsTarget(cardDef(b.hand[sel]))) {
      tryPlay(sel, uid);
      return;
    }
    if (sel >= 0 && b.hand[sel]) {
      tryPlay(sel, 0);
      return;
    }
    captionOverride = describeIntent(b, e);
    updateCaption();
    clearTimeout(actions.enemy.t);
    actions.enemy.t = setTimeout(() => { captionOverride = ''; updateCaption(); }, 3000);
  },
  endturn() { doEndTurn(); },
  piles() { showDeck(); },
  deck() { showDeck(); },
  close2() {
    if (modal2Kind === 'deck' && paused) {
      paused = false;
      modal2Kind = null;
      pause();
      return;
    }
    closeModal2();
    if (run?.pick) renderPick();
  },
  pause() { pause(); },
  resume() { resume(); },
  giveup() {
    paused = false;
    closeModal2();
    if (!run) return;
    if (run.battle) run.battle = null;
    endRun(run, 'quit');
    sync();
  },
  sticker(el) {
    const s = STICKER[el.dataset.id];
    toast(`${s.name}: ${s.text}`, 2600);
  },
  'reward-card'(el) {
    const i = Number(el.dataset.i);
    if (takeRewardCard(run, i)) {
      log.event('card.draft', { card: run.reward.cards[i], floor: run.floor + 1 });
      sound.play('draw');
      fx.burstAt(el, '#ffd23f', { count: 18, kind: 1 });
      sync();
    }
  },
  leave() {
    const wasBoss = run.nodeKind === 'boss';
    leaveNode(run);
    if (wasBoss && run.phase === 'map') {
      sound.play('page');
      toast(`Page ${run.floor + 1}: ${FLOORS[run.floor].name}! You rested a bit on the way up.`, 3000);
    }
    sync();
  },
  nap() {
    const healed = restNap(run);
    log.event('rest.choice', { choice: 'nap', healed });
    sound.play('heal');
    sync();
  },
  color() {
    if (restColor(run)) sync();
  },
  'buy-card'(el) {
    const i = Number(el.dataset.i);
    const item = run.shop.cards[i];
    if (buyCard(run, i)) {
      log.event('shop.buy', { item: item.id, price: item.price });
      sound.play('coin');
      sync();
    } else toast('Not enough gold for that one.');
  },
  'buy-sticker'(el) {
    const i = Number(el.dataset.i);
    const item = run.shop.stickers[i];
    if (buySticker(run, i)) {
      log.event('shop.buy', { item: item.id, price: item.price });
      sound.play('coin');
      sync();
    } else toast('Not enough gold for that one.');
  },
  erase() {
    if (startErase(run)) sync();
    else toast(run.deck.length <= 5 ? 'Your deck is already tiny!' : 'Not enough gold for the eraser.');
  },
  chest() {
    openChest(run);
    sound.play('coin');
    fx.burstAt($('#modal-sheet .big-icon') || $('#modal-sheet'), '#ffd23f', { count: 30, kind: 1, speed: 320 });
    sync();
  },
  event(el) {
    const i = Number(el.dataset.i);
    const id = run.event.id;
    if (chooseEvent(run, i)) {
      log.event('event.choice', { event: id, option: i });
      sound.play('select');
      if (run.phase === 'battle') {
        log.event('level.start', { floor: run.floor + 1, kind: 'battle', node: 'mystery', enemies: run.battle.enemies.length, hero: run.hero });
        show('battle');
        buildBattle();
        banner('Surprise!', true);
      }
      sync();
    }
  },
  pick(el) {
    const mode = run.pick?.mode;
    if (choosePick(run, Number(el.dataset.uid))) {
      sound.play(mode === 'upgrade' ? 'buff' : 'scribble');
      if (mode === 'upgrade') log.event('rest.choice', { choice: 'upgrade' });
      closeModal2();
      sync();
    }
  },
  'pick-cancel'() {
    cancelPick(run);
    closeModal2();
    sync();
  },
  again() {
    const hero = run && profile.unlocked.includes(run.hero) ? run.hero : profile.lastHero;
    const gentle = profile.settings.gentle;
    run = null;
    profile.current = null;
    closeModal();
    beginRun({ seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0, hero, gentle });
  },
  tab(el) {
    albumTab = el.dataset.id;
    showAlbum();
  },
  'close-album'() {
    if (modal2Kind === 'album') closeModal2();
    else if (run?.phase === 'over') showResults();
    else closeModal();
  },
  close() {
    closeModal();
    pendingReplace = null;
    if (modal2Kind === 'help') closeModal2();
    if (screen === 'title') renderTitle();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  sound.unlock();
  if (!el) {
    // Tapping empty arena space plays a selected no-target card.
    const b = run?.battle;
    if (screen === 'battle' && b && sel >= 0 && e.target.closest('#arena')) {
      const def = cardDef(b.hand[sel]);
      if (!needsTarget(def) || living(b).length === 1) tryPlay(sel, 0);
      else {
        sel = -1;
        renderBattle();
      }
    } else if (screen === 'battle' && sel >= 0 && !e.target.closest('#hand')) {
      sel = -1;
      renderBattle();
    }
    return;
  }
  if (el.disabled) return;
  const act = actions[el.dataset.act];
  if (act) {
    if (!['card', 'enemy', 'node'].includes(el.dataset.act)) sound.play('click');
    act(el);
  }
});

for (const id of ['#modal', '#modal2']) {
  $(id).addEventListener('click', (e) => {
    if (e.target === $(id) && id === '#modal2' && ['deck', 'help', 'album'].includes(modal2Kind)) actions.close2();
  });
}

$('#enemies').addEventListener('mouseover', (e) => {
  const el = e.target.closest('.enemy');
  const b = run?.battle;
  if (!el || !b || busy) return;
  const en = b.enemies.find((x) => x.uid === Number(el.dataset.uid));
  if (!en || en.dead) return;
  if (sel >= 0 && b.hand[sel] && needsTarget(cardDef(b.hand[sel])) && aimUid !== en.uid) {
    aimUid = en.uid;
    renderBattle();
  } else if (sel < 0) {
    captionOverride = describeIntent(b, en);
    updateCaption();
  }
});
$('#enemies').addEventListener('mouseleave', () => {
  captionOverride = '';
  updateCaption();
});

// ------------------------------------------------------------ keyboard

function spatialMove(dx, dy) {
  const layer = activeLayer();
  const items = [...layer.querySelectorAll('button:not(:disabled):not([tabindex="-1"]), a.btn, a.arcade-link, input')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const cur = document.activeElement;
  if (!items.includes(cur)) {
    items[0].focus();
    return;
  }
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const q = el.getBoundingClientRect();
    const x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
    const along = x * dx + y * dy;
    if (along <= 4) continue;
    const across = Math.abs(x * dy - y * dx);
    const score = along + across * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    best.focus();
    best.scrollIntoView({ block: 'nearest' });
  }
}

addEventListener('keydown', (e) => {
  sound.unlock();
  pointerIdle = 3;
  const k = e.code;
  if (k === 'Escape' || k === 'KeyP') {
    if (modal2Open()) {
      if (modal2Kind === 'pause') resume();
      else if (modal2Kind === 'pick') actions['pick-cancel']();
      else actions.close2();
    } else if (screen === 'battle' && sel >= 0 && k === 'Escape') {
      sel = -1;
      renderBattle();
    } else if (screen === 'battle' || screen === 'map') pause();
    else if (modalOpen() && k === 'Escape') actions.close();
    else if (screen === 'heroes' && k === 'Escape') show('title');
    e.preventDefault();
    return;
  }
  if (k === 'KeyM') {
    actions.sound();
    return;
  }
  const battleKeys = screen === 'battle' && !modalOpen() && !modal2Open() && run?.battle;
  if (battleKeys) {
    const b = run.battle;
    const digit = /^Digit(\d)$/.exec(k) || /^Numpad(\d)$/.exec(k);
    if (digit) {
      const n = Number(digit[1]);
      selectCard(n === 0 ? 9 : n - 1);
      e.preventDefault();
      return;
    }
    if (k === 'KeyE') { doEndTurn(); return; }
    if (k === 'KeyV') { showDeck(); return; }
    const left = k === 'ArrowLeft' || k === 'KeyA';
    const right = k === 'ArrowRight' || k === 'KeyD';
    if (left || right) {
      e.preventDefault();
      if (sel >= 0 && b.hand[sel] && needsTarget(cardDef(b.hand[sel])) && living(b).length > 1) {
        const alive = living(b);
        const idx = alive.findIndex((x) => x.uid === aimUid);
        aimUid = alive[(idx + (right ? 1 : -1) + alive.length) % alive.length].uid;
        sound.play('click');
        renderBattle();
      } else if (b.hand.length) {
        const n = b.hand.length;
        const start = sel < 0 ? (right ? -1 : n) : sel;
        sel = (start + (right ? 1 : -1) + n) % n;
        if (needsTarget(cardDef(b.hand[sel])) && !living(b).some((x) => x.uid === aimUid)) aimUid = living(b)[0]?.uid || 0;
        sound.play('select');
        renderBattle();
      }
      return;
    }
    if ((k === 'Enter' || k === 'Space' || k === 'ArrowUp') && sel >= 0) {
      e.preventDefault();
      tryPlay(sel, aimUid);
      return;
    }
    if (k === 'ArrowDown' && sel >= 0) {
      sel = -1;
      renderBattle();
      return;
    }
    if (k === 'Enter' || k === 'Space') {
      // With nothing selected, Enter/Space work on whatever is focused.
      return;
    }
  }
  if (screen === 'map' && !modalOpen() && !modal2Open() && k === 'KeyV') {
    showDeck();
    return;
  }
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
  if (dir && !battleKeys) {
    e.preventDefault();
    spatialMove(dir[0], dir[1]);
  }
});

// ------------------------------------------------------------ loop

// Hide the pointer after ~2 s without movement during play.
let pointerIdle = 0;
addEventListener('pointermove', () => { pointerIdle = 0; });
addEventListener('pointerdown', () => { pointerIdle = 0; });

const monitor = frameMonitor({
  log,
  snapshot: () => ({ screen, phase: run ? run.phase : 'none', floor: run ? run.floor + 1 : 0, particles: fx.alive }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => {
  monitor.reset(performance.now());
  if (document.hidden) persist();
});

let crashOnce = params.has('crash');
let last = performance.now();
let autoTimer = 0;
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (crashOnce) {
    crashOnce = false;
    throw new Error('Debug crash from ?crash');
  }
  pointerIdle += dt;
  const playing = (screen === 'battle' || screen === 'map') && !paused;
  document.body.classList.toggle('no-cursor', playing && pointerIdle > 2 && !coarse);
  if (run && playing && run.phase !== 'over' && document.visibilityState === 'visible') run.stats.ms += dt * 1000;
  fx.update(dt);
  fx.draw();
  if (autopilot && run) {
    autoTimer += dt;
    if (autoTimer > 0.35 * pace * 2) {
      autoTimer = 0;
      autoStep();
    }
  }
  requestAnimationFrame(loop);
}

function autoStep() {
  if (busy || overPending || paused || modal2Kind === 'pause') return;
  if (run.phase === 'over') return;
  if (run.phase === 'battle') {
    const b = run.battle;
    if (!b || b.over || b.phase !== 'player') return;
    const play = bestPlay(run);
    if (play) tryPlay(play.i, play.uid);
    else doEndTurn();
    return;
  }
  const before = run.phase;
  botStep(run);
  if (run.phase === 'battle' && before !== 'battle') {
    log.event('level.start', { floor: run.floor + 1, kind: run.fightKind, node: 'auto', enemies: run.battle.enemies.length, hero: run.hero });
    show('battle');
    buildBattle();
  }
  if (!run.pick && modal2Kind === 'pick') closeModal2();
  sync();
}

// A crash inside a frame shows the crash screen instead of a frozen picture;
// after a crash the guard returns early, so the loop stops rescheduling.
const loop = telemetry ? telemetry.guard(frame, 'crayon-quest.frame') : frame;

if (location.protocol !== 'file:') {
  checkUnlocks(profile);
  if (run) mergeAlbum(profile, run);
  log.event('game.ready', { runs: profile.runs, wins: profile.wins, heroes: profile.unlocked.length, resume: !!run, best: profile.best });
  if (autopilot) {
    sound.setSound(false);
    sound.setMusic(false);
    if (!run || run.phase === 'over') {
      run = newRun({ seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : 12345, hero: params.get('hero') && HERO[params.get('hero')] ? params.get('hero') : 'kid' });
      profile.current = run;
    }
    show(run.phase === 'battle' ? 'battle' : 'map');
    if (run.phase === 'battle') buildBattle();
    sync();
  } else show('title');
  requestAnimationFrame(loop);
}

window.CQ = {
  get run() { return run; },
  get profile() { return profile; },
  get screen() { return screen; },
  sync, show, sound, fx, persist,
};
