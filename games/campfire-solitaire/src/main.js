// Browser entry: screens, the frame loop, input, sound, saves and telemetry.
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Pad } from './input.js';
import { frameMonitor } from './perf.js';
import {
  levelDeal, levelCached, dailyDeal, dailyLayout, quickDeal, roundFor, LEVELS, LEVEL_COUNT, SECTIONS, LEVELS_PER_SECTION, parseDateKey,
} from './deals.js';
import { hintFor, DRAW } from './solver.js';
import { starGoals, starCount } from './game.js';
import { layoutById } from './layouts.js';
import { slotAt, inRect } from './table.js';
import { stepFocus, nearestKey } from './focus.js';
import { cardName } from './cards.js';
import { bakeBack, bakeDecor } from './sprites.js';
import * as P from './progress.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const AUTOPLAY = params.has('autoplay');
// ?date=YYYY-MM-DD previews another day's Daily Deal (a debug aid).
const debugDate = parseDateKey(params.get('date'));
const today = () => debugDate || new Date();

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

// Reading localStorage throws when the browser blocks site storage; the save
// helpers treat that as "nothing saved".
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = P.loadSave(storage);
let saveWarned = false;
function persist() {
  // ?autoplay is a browser check and attract mode: never the real save.
  if (AUTOPLAY) return;
  if (debugDate) return;
  if (P.writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const canvas = $('table');
const renderer = new Renderer(canvas, { reducedMotion: reduced });
const sound = new Sound({ muted: save.muted, music: save.music });
const pad = new Pad();

let mode = 'title'; // title | map | gear | play | paused | won | stuck
let current = null; // { deal, round, started, result }
let attract = null; // the solver playing a deal behind the menus
let hint = null; // { kind: 'slot' | 'stock', slot, until }
let focus = null; // { kind: 'slot', slot } | { kind: 'stock' }
let focusVisible = false;
let resultTimer = 0;
let stuckTimer = 0;
let autoTimer = 0;
let toastTimer = 0;

const SCREENS = ['screen-title', 'screen-map', 'screen-gear', 'screen-pause', 'screen-won', 'screen-stuck'];
const RESULT_SCREENS = ['screen-won', 'screen-stuck'];
const RESULT_GUARD_MS = 700;
let shownAt = 0;
let shownId = null;
const held = new Set();
let ignoreKeys = new Set();

function showScreen(id) {
  shownAt = performance.now();
  shownId = id;
  if (RESULT_SCREENS.includes(id)) ignoreKeys = new Set(held);
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const playing = mode === 'play';
  $('hud').classList.toggle('off', !(playing || mode === 'paused' || mode === 'won' || mode === 'stuck'));
  $('btn-undo').classList.toggle('off', !playing);
  $('btn-hint').classList.toggle('off', !playing);
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .stop.next:not([disabled]), .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(playing ? 1 : mode === 'paused' ? 0.35 : 0.6);
}

// ------------------------------------------------------------ helpers

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const decorIds = () => P.DECOR.filter((d) => d.test(save)).map((d) => d.id);
const isRound = () => mode === 'play' && current && current.round.status === 'play';

function themeFor(deal) {
  if (deal.kind === 'level') return SECTIONS[LEVELS[deal.index].section].id;
  const id = deal.layout.id;
  if (['dipper', 'orion', 'cassiopeia'].includes(id)) return 'ridge';
  if (['canoe', 'lantern', 'twin'].includes(id)) return 'lake';
  return 'hollow';
}

function dealLabel(deal) {
  if (deal.kind === 'level') return `Level ${deal.index + 1}`;
  if (deal.kind === 'daily') return 'Daily Deal';
  return 'Quick Deal';
}

function toast(text, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function announce(text) {
  $('sr-status').textContent = text;
}

function applyGear() {
  renderer.setBack(P.activeBack(save));
  renderer.setDecor(decorIds());
}

// ------------------------------------------------------------ rounds

function startDeal(deal, { again = false } = {}) {
  sound.unlock();
  clearTimeout(autoTimer);
  clearTimeout(resultTimer);
  clearTimeout(stuckTimer);
  finishRound('restart');
  const round = roundFor(deal);
  current = { deal, round, started: performance.now(), result: null };
  attract = null;
  hint = null;
  focus = null;
  renderer.setTheme(themeFor(deal));
  applyGear();
  renderer.setRound(round, { intro: true });
  mode = 'play';
  showScreen(null);
  positionTools();
  updateHud();
  showBanner(deal);
  queueMicrotask(() => monitor.mark(performance.now(), 'deal'));
  announce(`${dealLabel(deal)}, ${deal.layout.name}. Fire pile: ${cardName(round.top)}.`);
  prefetch();
  log.event('level.start', {
    mode: deal.kind, level: deal.kind === 'level' ? deal.index + 1 : 0, layout: deal.layout.id,
    stock: round.stockSize, again, verified: deal.verified,
  });
}

// A round being left (deal again, menus) still counts toward the longest chain.
function finishRound(reason) {
  if (!current || current.result || current.round.moves === 0) return;
  if (P.noteStreak(save, current.round.maxStreak)) persist();
  if (reason !== 'stuck') log.event('level.leave', { mode: current.deal.kind, reason, cleared: current.round.cleared, moves: current.round.moves });
}

function showBanner(deal) {
  // A fresh element restarts the CSS animation without forcing a layout.
  const old = $('banner');
  const el = old.cloneNode(false);
  el.innerHTML = `<h3>${dealLabel(deal)} · ${deal.layout.name}</h3><p>${deal.layout.blurb}</p><p>★ Clear the camp · ★ Streak of ${deal.streakGoal} · ★ No undo or hints</p>`;
  el.classList.remove('hidden');
  old.replaceWith(el);
  clearTimeout(showBanner.t);
  showBanner.t = setTimeout(() => el.classList.add('hidden'), reduced ? 1800 : 2400);
}

function act(kind, slot) {
  if (!isRound()) return false;
  const r = current.round;
  let ok = false;
  if (kind === 'play') ok = r.play(slot);
  else if (kind === 'draw') ok = r.draw();
  flush();
  return ok;
}

function undo() {
  if (!current || mode === 'won' || !current.round.canUndo()) return;
  if (mode === 'stuck') {
    mode = 'play';
    showScreen(null);
  }
  if (mode !== 'play') return;
  current.round.undo();
  flush();
}

function flush() {
  const r = current.round;
  const events = r.events.splice(0);
  if (!events.length) return;
  renderer.handle(events, r);
  if (!attractActive()) sound.handle(events);
  let said = '';
  for (const e of events) {
    if (e.type === 'play') said = `${cardName(e.card)}${e.streak > 1 ? `, streak ${e.streak}` : ''}.`;
    else if (e.type === 'draw') said = `Drew ${cardName(e.card)}.`;
    else if (e.type === 'undo') said = `Undid. Fire pile: ${cardName(r.top)}.`;
    else if (e.type === 'nope') said = 'That card is not one up or one down.';
    if (e.type !== 'nope') hint = null;
    if (e.type === 'win') onWin();
    if (e.type === 'stuck') {
      clearTimeout(stuckTimer);
      stuckTimer = setTimeout(() => {
        if (mode === 'play' && current && current.round.status === 'stuck') showStuck();
      }, reduced ? 500 : 950);
    }
  }
  if (r.status === 'play' && said) said += ` ${r.playable().length} can play.`;
  if (said) announce(said);
  fixFocus();
  updateHud();
}

function onWin() {
  const { round: r, deal: d } = current;
  const goals = starGoals(r, d.streakGoal);
  const stars = starCount(goals);
  let rec;
  // Record the result the moment it is earned, not when the card appears.
  if (d.kind === 'level') rec = P.recordLevel(save, d.index, { score: r.score, stars, maxStreak: r.maxStreak });
  else if (d.kind === 'daily') rec = P.recordDaily(save, d.key, { score: r.score, maxStreak: r.maxStreak }, today());
  else rec = P.recordQuick(save, { score: r.score, maxStreak: r.maxStreak });
  persist();
  current.result = { goals, stars, rec };
  applyGear();
  const secs = Math.round((performance.now() - current.started) / 1000);
  log.event('level.complete', {
    mode: d.kind, level: d.kind === 'level' ? d.index + 1 : 0, layout: d.layout.id, stars, score: r.score, time: secs,
    undos: r.undos, hints: r.hints, 'streak.max': r.maxStreak, 'best.new': !!rec.newBest, unlocks: rec.unlocks.length,
  });
  if (d.kind === 'daily') log.event('daily.complete', { score: r.score, streak: rec.streak, first: rec.first });
  for (const u of rec.unlocks) log.event('unlock.earned', { id: u });
  announce(`Camp cleared! ${stars} star${stars === 1 ? '' : 's'}. Score ${fmt(r.score)}.`);
  clearTimeout(resultTimer);
  resultTimer = setTimeout(showWon, reduced ? 500 : 1500);
}

function starsHtml(goals) {
  return goals.map((on) => `<span class="${on ? 'on' : ''}">★</span>`).join('');
}

function showWon() {
  if (!current?.result || mode !== 'play') return;
  const { round: r, deal: d, result } = current;
  mode = 'won';
  const last = d.kind === 'level' && d.index === LEVEL_COUNT - 1;
  $('won-title').textContent = last ? 'The whole trail is glowing!' : d.kind === 'daily' ? 'Daily Deal cleared!' : 'Camp cleared!';
  $('won-sub').textContent = d.kind === 'level' ? `${dealLabel(d)} · ${d.layout.name}` : d.kind === 'daily' ? `${d.key} · ${d.layout.name}` : d.layout.name;
  const starsEl = $('won-stars');
  starsEl.innerHTML = starsHtml(result.goals);
  [...starsEl.children].forEach((s, i) => setTimeout(() => s.classList.add('show'), reduced ? 0 : 200 + i * 260));
  $('won-score').textContent = fmt(r.score);
  const rec = result.rec;
  let best = '';
  if (rec.newBest) best = 'New best!';
  else if (rec.streakBest) best = `New longest streak: ${r.maxStreak}!`;
  else if (d.kind === 'daily' && rec.first) best = `Daily streak: ${rec.streak} day${rec.streak === 1 ? '' : 's'} 🔥`;
  $('won-best').textContent = best;
  $('won-best').classList.toggle('hidden', !best);
  const goalLine = (ok, text) => `<div class="goal-line${ok ? ' done' : ''}"><span>${ok ? '★' : '☆'} ${text}</span><b>${ok ? '✓' : '—'}</b></div>`;
  const b = r.bonus;
  const lines = [
    ['Cards & streaks', fmt(r.base)],
    ['Clear bonus', `+${fmt(b.clear)}`],
    [`Stock left (${r.stockLeft})`, `+${fmt(b.stock)}`],
  ];
  if (b.solo) lines.push(['Solo bonus', `+${fmt(b.solo)}`]);
  if (r.undos) lines.push([`Undos (${r.undos})`, `−${fmt(r.undoCost)}`]);
  if (d.kind === 'level') lines.push(['Best here', fmt(save.best[d.index] || r.score)]);
  else if (d.kind === 'daily') {
    lines.push(['Best today', fmt(save.daily[d.key] || r.score)]);
    lines.push(['Daily streak', `${rec.streak} day${rec.streak === 1 ? '' : 's'} 🔥`]);
  }
  else lines.push(['Quick Deal best', fmt(save.quickBest)]);
  $('won-lines').innerHTML = lines.map(([a, v]) => `<div><span>${a}</span><b>${v}</b></div>`).join('') +
    goalLine(result.goals[1], `Streak of ${d.streakGoal} (best ${r.maxStreak})`) + goalLine(result.goals[2], 'No undo or hints');
  $('won-unlocks').innerHTML = rec.unlocks.map((u) => `<div>🎁 New camp gear: ${P.gearName(u)}!</div>`).join('');
  const next = $('btn-next');
  if (d.kind === 'level') next.textContent = last ? 'Trail map →' : `Next · Level ${d.index + 2} →`;
  else next.textContent = d.kind === 'daily' ? 'Quick Deal →' : 'New deal →';
  $('btn-won-again').textContent = d.kind === 'quick' ? `Another ${d.layout.name}` : d.kind === 'daily' ? 'Play again' : 'Deal again';
  // After the last level the primary button already goes to the map.
  $('btn-won-map').textContent = d.kind === 'level' && !last ? 'Trail map' : 'Title';
  showScreen('screen-won');
  if (AUTOPLAY) autoTimer = setTimeout(() => $('btn-next').click(), 1600);
}

function showStuck() {
  const r = current.round;
  mode = 'stuck';
  $('stuck-sub').textContent = `${r.remaining} card${r.remaining === 1 ? '' : 's'} left. Undo a few moves: there's always a way through!`;
  $('btn-stuck-map').textContent = current.deal.kind === 'level' ? 'Trail map' : 'Title';
  finishRound('stuck');
  log.event('level.fail', { mode: current.deal.kind, level: current.deal.kind === 'level' ? current.deal.index + 1 : 0, reason: 'stuck', remaining: r.remaining, moves: r.moves });
  showScreen('screen-stuck');
}

function dealAgain() {
  if (!current) return;
  const d = current.deal;
  log.event('deal.again', { mode: d.kind });
  if (d.kind === 'quick') startDeal(newQuick(), { again: true });
  else startDeal(d, { again: true });
}

// Quick Deal keeps the next deal solved in advance, so "deal again" is instant.
let nextQuick = null;
function newQuick() {
  const deal = nextQuick && nextQuick.unlocked === save.unlocked ? nextQuick.deal : quickDeal((Math.random() * 0xffffffff) >>> 0, save.unlocked);
  nextQuick = null;
  prefetch();
  return deal;
}

// Solve the deals the player is likely to want next in idle moments, one per
// task, so starting them never stalls a frame.
let prefetchTimer = 0;
function prefetch({ allOpen = false } = {}) {
  clearTimeout(prefetchTimer);
  const jobs = [];
  const want = [Math.min(save.unlocked, LEVEL_COUNT - 1)];
  if (current?.deal.kind === 'level' && current.deal.index + 1 < LEVEL_COUNT) want.push(current.deal.index + 1);
  // On the trail map any open stop may be picked: solve them all, nearest first.
  if (allOpen) for (let i = Math.min(save.unlocked, LEVEL_COUNT - 1); i >= 0; i--) want.push(i);
  for (const i of want) if (!levelCached(i)) jobs.push(() => levelDeal(i));
  jobs.push(() => dailyDeal(today()));
  if (!nextQuick || nextQuick.unlocked !== save.unlocked) {
    jobs.push(() => {
      const unlocked = save.unlocked;
      nextQuick = { unlocked, deal: quickDeal((Math.random() * 0xffffffff) >>> 0, unlocked) };
    });
  }
  const run = () => {
    const job = jobs.shift();
    if (!job) return;
    job();
    prefetchTimer = setTimeout(run, 120);
  };
  prefetchTimer = setTimeout(run, 400);
}

function nextFromWon() {
  const d = current.deal;
  if (d.kind === 'level') {
    if (d.index + 1 < LEVEL_COUNT) startDeal(levelDeal(d.index + 1));
    else toMap();
  } else startDeal(newQuick());
}

function pause() {
  if (mode !== 'play' || !current || current.round.status === 'won') return;
  mode = 'paused';
  const d = current.deal;
  $('pause-sub').textContent = `${dealLabel(d)} · ${d.layout.name}`;
  const r = current.round;
  const items = [
    [r.status === 'won', false, 'Clear the camp'],
    [r.maxStreak >= d.streakGoal, false, `Streak of ${d.streakGoal} (best so far ${r.maxStreak})`],
    [false, !r.solo, 'No undo or hints'],
  ];
  $('pause-goals').innerHTML = items.map(([done, lost, text]) => `<li class="${done ? 'done' : lost ? 'lost' : ''}">${done ? '★' : '☆'} ${text}</li>`).join('');
  $('btn-pause-map').textContent = d.kind === 'level' ? 'Trail map' : 'Title';
  updateSoundButtons();
  showScreen('screen-pause');
  log.event('game.pause', { mode: d.kind });
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  showScreen(null);
}

// ------------------------------------------------------------ hints & focus

function doHint() {
  if (!isRound()) return;
  const r = current.round;
  const h = hintFor(r);
  r.noteHint();
  sound.hint();
  log.event('hint.used', { kind: h.kind, nodes: h.nodes || 0 });
  updateHud();
  if (h.kind === 'lost') {
    hint = null;
    toast('No way to clear the camp from here. Try ↶ Undo!');
    nudge($('btn-undo'));
    announce('No way to clear from here. Try undo.');
    return;
  }
  if (h.move === DRAW) hint = { kind: 'stock' };
  else if (h.move !== null && h.move !== undefined) hint = { kind: 'slot', slot: h.move };
  else return;
  hint.until = performance.now() + 4500;
  focus = hint.kind === 'stock' ? { kind: 'stock' } : { kind: 'slot', slot: hint.slot };
  announce(hint.kind === 'stock' ? 'Hint: draw from the stock.' : `Hint: play the ${cardName(r.cards[hint.slot])}.`);
}

function nudge(el) {
  el.classList.remove('nudge');
  void el.offsetWidth;
  el.classList.add('nudge');
  setTimeout(() => el.classList.remove('nudge'), 1600);
}

function focusItems() {
  const t = renderer.table;
  if (!t || !current) return [];
  const r = current.round;
  const items = r.playable().map((i) => ({ key: i, x: t.slots[i].x + t.W / 2, y: t.slots[i].y + t.H / 2 }));
  if (r.canDraw()) items.push({ key: 'stock', x: t.stock.x + t.stock.w / 2, y: t.stock.y + t.stock.h / 2 });
  return items;
}

const keyOf = (f) => (!f ? null : f.kind === 'stock' ? 'stock' : f.slot);
const fromKey = (k) => (k === null || k === undefined ? null : k === 'stock' ? { kind: 'stock' } : { kind: 'slot', slot: k });

function moveFocus(dir) {
  if (!isRound()) return;
  focusVisible = true;
  const items = focusItems();
  focus = fromKey(stepFocus(items, keyOf(focus), dir));
  describeFocus();
}

function describeFocus() {
  if (!focus) return;
  const r = current.round;
  announce(focus.kind === 'stock' ? `Stock, ${r.stockLeft} cards.` : cardName(r.cards[focus.slot]));
}

// After a move, keep focus on something you can act on, near where it was.
function fixFocus() {
  if (!current || !focus) return;
  const items = focusItems();
  const k = keyOf(focus);
  if (items.some((it) => it.key === k)) return;
  const t = renderer.table;
  const at = focus.kind === 'stock' ? t.stock : t.slots[focus.slot];
  focus = fromKey(nearestKey(items, at.x + at.w / 2, at.y + at.h / 2));
}

function activateFocus() {
  if (!isRound()) return;
  if (!focus) {
    focusVisible = true;
    focus = fromKey(stepFocus(focusItems(), null, 'next'));
    describeFocus();
    return;
  }
  if (focus.kind === 'stock') act('draw');
  else act('play', focus.slot);
}

// ------------------------------------------------------------ HUD

function positionTools() {
  const t = renderer.table;
  if (!t) return;
  for (const [id, r] of [['btn-undo', t.undo], ['btn-hint', t.hint]]) {
    const el = $(id);
    el.style.left = `${r.x}px`;
    el.style.top = `${r.y}px`;
    el.style.width = `${r.w}px`;
    el.style.height = `${r.h}px`;
  }
}

function updateHud() {
  if (!current) return;
  const { round: r, deal: d } = current;
  $('hud-name').textContent = dealLabel(d);
  $('hud-layout').textContent = ` · ${d.layout.name}`;
  $('hud-score').textContent = fmt(r.score);
  const st = $('hud-streak');
  st.querySelector('b').textContent = String(r.streak);
  st.querySelector('i').textContent = String(d.streakGoal);
  st.classList.toggle('met', r.maxStreak >= d.streakGoal);
  st.title = `Streak goal ${d.streakGoal} (best this round ${r.maxStreak})`;
  const solo = $('hud-solo');
  solo.classList.toggle('on', r.solo);
  solo.classList.toggle('off', !r.solo);
  $('btn-undo').disabled = !r.canUndo();
  $('btn-hint').disabled = r.status !== 'play';
  sound.setFire(0.3 + Math.min(1, r.streak / 10) * 0.7);
}

function updateSoundButtons() {
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = save.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = save.music ? '🎵 Music on' : '🎵 Music off';
  const m = $('btn-mute');
  m.textContent = save.muted ? '🔇' : '🔊';
  m.setAttribute('aria-label', save.muted ? 'Unmute' : 'Mute');
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

// ------------------------------------------------------------ menus

function toTitle() {
  clearTimeout(resultTimer);
  clearTimeout(autoTimer);
  if (mode === 'play' || mode === 'paused') finishRound('menu');
  mode = 'title';
  current = null;
  startAttract();
  const next = Math.min(save.unlocked, LEVEL_COUNT - 1);
  const stars = P.totalStars(save);
  $('btn-play').innerHTML = stars ? `Play · Level ${next + 1}<small>${layoutById(LEVELS[next].layoutId).name}</small>` : 'Play';
  const ds = P.dailyStreak(save, today());
  const daily = $('btn-daily');
  daily.classList.toggle('done', ds.doneToday);
  daily.innerHTML = `🌙 Daily Deal<small>${ds.doneToday ? `Done today ✓ · ${ds.streak} day${ds.streak === 1 ? '' : 's'}` : ds.streak ? `${ds.streak} day streak 🔥` : dailyLayout(today()).name}</small>`;
  $('btn-quick').innerHTML = `🃏 Quick Deal<small>${save.quickBest ? `best ${fmt(save.quickBest)}` : 'a fresh deal'}</small>`;
  const bits = [`<b>★ ${stars}</b> / ${LEVEL_COUNT * 3}`];
  if (save.bestStreak) bits.push(`longest streak <b>${save.bestStreak}</b>`);
  const bestDaily = P.bestDailyStreak(save);
  if (bestDaily > 1) bits.push(`best daily run <b>${bestDaily}</b>`);
  $('title-stats').innerHTML = bits.join(' · ');
  $('btn-gear').innerHTML = `🎒 Camp Gear<small>${P.unlockedIds(save).size} / ${P.BACKS.length + P.DECOR.length}</small>`;
  updateSoundButtons();
  showScreen('screen-title');
  prefetch();
}

function toMap() {
  clearTimeout(resultTimer);
  if (mode === 'play' || mode === 'paused') finishRound('menu');
  mode = 'map';
  current = null;
  startAttract();
  showScreen('screen-map');
  renderMap();
  prefetch({ allOpen: true });
  const next = document.querySelector('#map-body .stop.next') || document.querySelector('#map-body .stop:not([disabled])');
  next?.focus({ preventScroll: true });
  next?.scrollIntoView({ block: 'center' });
}

function miniLayout(layout) {
  const sx = 54 / 16;
  const sy = 30 / 10;
  const ox = (16 - layout.width) / 2;
  const oy = (10 - layout.height) / 2;
  const rects = layout.slots.map((s) => `<rect x="${((s.x + ox) * sx).toFixed(1)}" y="${((s.y + oy) * sy).toFixed(1)}" width="${(2 * sx - 0.6).toFixed(1)}" height="${(2 * sy - 0.6).toFixed(1)}" rx="0.8"/>`).join('');
  return `<svg class="mini" viewBox="0 0 54 30" aria-hidden="true"><g fill="rgba(255,236,200,0.75)" stroke="rgba(40,30,70,0.8)" stroke-width="0.4">${rects}</g></svg>`;
}

function renderMap() {
  const body = $('map-body');
  body.innerHTML = '';
  $('map-stars').textContent = `★ ${P.totalStars(save)} / ${LEVEL_COUNT * 3}`;
  SECTIONS.forEach((sec, s) => {
    const wrap = document.createElement('div');
    wrap.className = 'section';
    const got = LEVELS.slice(s * LEVELS_PER_SECTION, (s + 1) * LEVELS_PER_SECTION).reduce((n, l) => n + (save.stars[l.index] || 0), 0);
    wrap.innerHTML = `<h3>${sec.name} <small class="muted">★ ${got}/${LEVELS_PER_SECTION * 3}</small></h3><p>${sec.blurb}</p>`;
    const trail = document.createElement('div');
    trail.className = 'trail';
    for (let j = 0; j < LEVELS_PER_SECTION; j++) {
      const lv = LEVELS[s * LEVELS_PER_SECTION + j];
      const layout = layoutById(lv.layoutId);
      const open = P.isUnlocked(save, lv.index);
      const st = save.stars[lv.index] || 0;
      const b = document.createElement('button');
      b.className = `stop${lv.index === save.unlocked && open ? ' next' : ''}`;
      b.disabled = !open;
      b.innerHTML = `<span class="n">${lv.index + 1}</span>${miniLayout(layout)}<span class="nm">${layout.name}</span><span class="st">${[0, 1, 2].map((k) => `<span class="${k < st ? '' : 'off'}">★</span>`).join('')}</span>`;
      const best = save.best[lv.index];
      b.setAttribute('aria-label', `Level ${lv.index + 1}, ${layout.name}${open ? '' : ', locked'}${st ? `, ${st} stars` : ''}${best ? `, best ${fmt(best)}` : ''}`);
      b.title = best ? `Best ${fmt(best)}` : open ? layout.blurb : 'Clear the level before to open this one';
      b.addEventListener('click', () => startDeal(levelDeal(lv.index)));
      trail.appendChild(b);
    }
    wrap.appendChild(trail);
    body.appendChild(wrap);
  });
  windTrails();
}

// Lay each section's stops out as a winding trail (left to right, then back),
// with a dashed path between them.
function windTrails() {
  if ($('screen-map').classList.contains('hidden')) return;
  for (const trail of document.querySelectorAll('#map-body .trail')) {
    const stops = [...trail.querySelectorAll('.stop')];
    const cols = getComputedStyle(trail).gridTemplateColumns.split(' ').filter(Boolean).length || 4;
    stops.forEach((b, j) => {
      const row = Math.floor(j / cols);
      b.style.gridRow = String(row + 1);
      b.style.gridColumn = String((row % 2 ? cols - 1 - (j % cols) : j % cols) + 1);
    });
    trail.querySelector('svg.path')?.remove();
    const box = trail.getBoundingClientRect();
    const pts = stops.map((b) => {
      const r = b.getBoundingClientRect();
      return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2];
    });
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const bend = y1 !== y0 ? (x1 > box.width / 2 ? 40 : -40) : 0;
      d += ` Q${((x0 + x1) / 2 + bend).toFixed(1)} ${((y0 + y1) / 2 + (y1 === y0 ? -14 : 0)).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    const done = stops.filter((b) => !b.disabled).length;
    trail.insertAdjacentHTML('afterbegin', `<svg class="path" viewBox="0 0 ${box.width.toFixed(0)} ${box.height.toFixed(0)}" aria-hidden="true"><path d="${d}" class="${done > 1 ? 'walked' : ''}"/></svg>`);
  }
}

function toGear() {
  mode = 'gear';
  startAttract();
  renderGear();
  showScreen('screen-gear');
}

function thumb(draw, w, h) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = w * dpr;
  c.height = h * dpr;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  draw(c.getContext('2d'), dpr);
  return c;
}

function renderGear() {
  const backs = $('gear-backs');
  backs.innerHTML = '';
  const active = P.activeBack(save);
  for (const b of P.BACKS) {
    const have = b.test(save);
    const el = document.createElement('button');
    el.className = `gear${have ? '' : ' locked'}`;
    el.setAttribute('aria-pressed', String(have && b.id === active));
    el.setAttribute('aria-label', `${b.name} card back${have ? '' : `, locked: ${b.rule}`}`);
    const sp = bakeBack(b.id, 46, 64, Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(thumb((ctx) => {
      ctx.drawImage(sp.img, 0, 0, ctx.canvas.width, ctx.canvas.height);
      if (!have) silhouette(ctx);
    }, 46 + sp.pad * 2, 64 + sp.pad * 2));
    el.insertAdjacentHTML('beforeend', `<span class="gn">${have ? b.name : '???'}</span><span class="gr">${have ? (b.id === active ? 'In use' : 'Tap to use') : b.rule}</span>`);
    if (have) el.addEventListener('click', () => {
      save.back = b.id;
      persist();
      applyGear();
      sound.click();
      renderGear();
      backs.querySelectorAll('.gear')[P.BACKS.indexOf(b)]?.focus();
    });
    backs.appendChild(el);
  }
  const decor = $('gear-decor');
  decor.innerHTML = '';
  for (const d of P.DECOR) {
    const have = d.test(save);
    const el = document.createElement('div');
    el.className = `gear${have ? '' : ' locked'}`;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `${d.name}${have ? '' : `, locked: ${d.rule}`}`);
    el.appendChild(thumb((ctx, dpr) => drawDecorThumb(ctx, dpr, d.id, have), 72, 58));
    el.insertAdjacentHTML('beforeend', `<span class="gn">${have ? d.name : '???'}</span><span class="gr">${have ? 'At your camp' : d.rule}</span>`);
    decor.appendChild(el);
  }
  $('gear-count').textContent = `${P.unlockedIds(save).size} / ${P.BACKS.length + P.DECOR.length}`;
}

function silhouette(ctx) {
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(14, 14, 36, 0.92)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalCompositeOperation = 'source-over';
}

function drawDecorThumb(ctx, dpr, id, have) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (id === 'lanterns' || id === 'fireflies' || id === 'shooting') {
    ctx.save();
    ctx.scale(dpr, dpr);
    if (id === 'lanterns') {
      ctx.strokeStyle = '#3a3346';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(4, 14);
      ctx.quadraticCurveTo(36, 40, 68, 14);
      ctx.stroke();
      ['#ffcf6b', '#ff8f6b', '#9fe6ff', '#c6ff8f', '#ffb3e6'].forEach((c, i) => {
        const k = (i + 1) / 6;
        const x = 4 + 64 * k;
        const y = 14 + 52 * k * (1 - k) + 5;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(x, y, 4, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (id === 'fireflies') {
      for (const [x, y] of [[14, 20], [34, 34], [52, 16], [60, 40], [24, 44]]) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 7);
        g.addColorStop(0, 'rgba(220,255,150,1)');
        g.addColorStop(1, 'rgba(220,255,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 7, y - 7, 14, 14);
      }
    } else {
      ctx.strokeStyle = '#fff6d8';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(12, 12);
      ctx.lineTo(54, 34);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(56, 35, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    const sp = bakeDecor(id, 44, dpr);
    const k = Math.min(w / sp.img.width, h / sp.img.height);
    ctx.drawImage(sp.img, (w - sp.img.width * k) / 2, h - sp.img.height * k, sp.img.width * k, sp.img.height * k);
  }
  if (!have) silhouette(ctx);
}

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'map' || mode === 'gear') toTitle();
}

// ------------------------------------------------------------ attract

const attractActive = () => !!attract && (mode === 'title' || mode === 'map' || mode === 'gear');

function startAttract() {
  if (attract) return;
  const pool = [0, 1, 2, 3, 4, 7, 9, 13];
  const lv = pool[Math.floor(Math.random() * pool.length)];
  const deal = quickDeal((Math.random() * 0xffffffff) >>> 0, lv);
  const round = roundFor(deal);
  attract = { deal, round, line: deal.line || [], i: 0, t: -1.2, done: 0 };
  renderer.setTheme(themeFor(deal));
  applyGear();
  renderer.setRound(round, { intro: true });
  queueMicrotask(() => monitor.mark(performance.now(), 'attract'));
}

function stepAttract(dt) {
  const a = attract;
  if (!a) return;
  if (a.round.status !== 'play') {
    a.done += dt;
    if (a.done > 3) {
      attract = null;
      startAttract();
    }
    return;
  }
  a.t += dt;
  if (a.t < 0.55) return;
  a.t = 0;
  const m = a.line[a.i++];
  if (m === undefined) {
    a.round.status = 'stuck';
    return;
  }
  if (m === DRAW) a.round.draw();
  else a.round.play(m);
  const events = a.round.events.splice(0);
  renderer.handle(events, a.round);
}

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', () => startDeal(levelDeal(Math.min(save.unlocked, LEVEL_COUNT - 1))));
$('btn-daily').addEventListener('click', () => startDeal(dailyDeal(today())));
$('btn-quick').addEventListener('click', () => startDeal(newQuick()));
$('btn-map').addEventListener('click', toMap);
$('btn-gear').addEventListener('click', toGear);
$('btn-resume').addEventListener('click', resume);
$('btn-pause-again').addEventListener('click', dealAgain);
$('btn-pause-map').addEventListener('click', () => (current?.deal.kind === 'level' ? toMap() : toTitle()));
$('btn-next').addEventListener('click', nextFromWon);
$('btn-won-again').addEventListener('click', () => {
  const d = current.deal;
  if (d.kind === 'quick') {
    // A fresh deal on the same layout.
    log.event('deal.again', { mode: d.kind });
    startDeal(quickDeal((Math.random() * 0xffffffff) >>> 0, save.unlocked, d.layout.id), { again: true });
  } else dealAgain();
});
$('btn-won-map').addEventListener('click', () => {
  const d = current?.deal;
  if (d?.kind === 'level' && d.index < LEVEL_COUNT - 1) toMap();
  else toTitle();
});
$('btn-stuck-undo').addEventListener('click', undo);
$('btn-stuck-again').addEventListener('click', dealAgain);
$('btn-stuck-map').addEventListener('click', () => (current?.deal.kind === 'level' ? toMap() : toTitle()));
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', back);

// HUD buttons answer pointerdown, so a second finger already on a card still
// works them, and they blur after a press so Space never re-presses them.
// They sit above the canvas, so a press never counts as a card tap.
function hudButton(id, fn) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (el.disabled) return;
    fn();
    el.blur();
  });
  el.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' && e.code !== 'Space') return;
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
  el.addEventListener('click', (e) => e.preventDefault());
}
hudButton('btn-mute', toggleMute);
hudButton('btn-pause', pause);
hudButton('btn-undo', undo);
hudButton('btn-hint', doHint);

canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  focusVisible = false;
  if (!isRound()) return;
  const t = renderer.table;
  const r = current.round;
  const x = e.clientX;
  const y = e.clientY;
  if (inRect(t.stock, x, y)) {
    if (r.canDraw()) act('draw');
    return;
  }
  const slot = slotAt(t, (i) => r.isCleared(i), x, y);
  if (slot >= 0 && r.isFaceUp(slot)) act('play', slot);
});

// Result cards ignore clicks for a moment after they appear, and keys that
// were already held when they opened, so mashing never skips them.
addEventListener('click', (e) => {
  if (RESULT_SCREENS.includes(shownId) && performance.now() - shownAt < RESULT_GUARD_MS) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, { capture: true });
addEventListener('keydown', (e) => {
  const fresh = !held.has(e.code);
  held.add(e.code);
  if (!RESULT_SCREENS.includes(shownId) || e.code === 'KeyM') return;
  if (e.repeat || ignoreKeys.has(e.code) || (fresh && performance.now() - shownAt < RESULT_GUARD_MS)) {
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') e.preventDefault();
    e.stopImmediatePropagation();
  }
}, { capture: true });
addEventListener('keyup', (e) => {
  held.delete(e.code);
  if (ignoreKeys.has(e.code)) {
    ignoreKeys.delete(e.code);
    if (e.code === 'Space') e.preventDefault();
  }
}, { capture: true });
addEventListener('blur', () => held.clear());

function moveDomFocus(dir) {
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
  sound.unlock();
  if (e.code === 'KeyM' && !e.repeat) {
    toggleMute();
    return;
  }
  if (mode === 'play') {
    const r = current?.round;
    if (!r) return;
    const code = e.code;
    if (code === 'Escape' || code === 'KeyP') {
      e.preventDefault();
      pause();
    } else if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown') {
      e.preventDefault();
      moveFocus(code.slice(5).toLowerCase());
    } else if (code === 'Tab') {
      e.preventDefault();
      moveFocus(e.shiftKey ? 'prev' : 'next');
    } else if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
      e.preventDefault();
      if (!e.repeat) {
        focusVisible = true;
        activateFocus();
      }
    } else if (code === 'KeyD' && !e.repeat) {
      act('draw');
    } else if ((code === 'KeyU' || (code === 'KeyZ' && (e.ctrlKey || e.metaKey))) && !e.repeat) {
      e.preventDefault();
      undo();
    } else if (code === 'KeyH' && !e.repeat) {
      focusVisible = true;
      doHint();
    }
    return;
  }
  if (mode === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) {
    e.preventDefault();
    resume();
    return;
  }
  if (mode === 'stuck' && (e.code === 'KeyU' || (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)))) {
    e.preventDefault();
    undo();
    return;
  }
  if (e.code === 'Escape') back();
  if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
    e.preventDefault();
    moveDomFocus(1);
  } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
    e.preventDefault();
    moveDomFocus(-1);
  }
});

addEventListener('resize', () => {
  renderer.resize();
  positionTools();
  if (mode === 'map') windTrails();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isRound()) pause();
});
addEventListener('pointerdown', () => sound.unlock(), { once: true });

// A second tab saved: adopt its progress instead of overwriting it the next
// time this tab saves.
addEventListener('storage', (e) => {
  if (e.key !== P.SAVE_KEY && e.key !== null) return;
  const fresh = P.loadSave(storage);
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, fresh);
  sound.setMuted(save.muted);
  sound.setMusic(save.music);
  updateSoundButtons();
  applyGear();
  if (mode === 'title') toTitle();
  else if (mode === 'map') renderMap();
  else if (mode === 'gear') renderGear();
});

// ------------------------------------------------------------ loop

// The pointer hides after ~2 s without movement during play, and comes back
// the moment the mouse moves.
let pointerIdle = 0;
const wake = () => { pointerIdle = 0; };
addEventListener('mousemove', wake);
addEventListener('pointerdown', wake);

function padInput() {
  if (mode === 'play') {
    if (pad.take('start')) pause();
    else if (pad.take('up')) moveFocus('up');
    else if (pad.take('down')) moveFocus('down');
    else if (pad.take('left')) moveFocus('left');
    else if (pad.take('right')) moveFocus('right');
    else if (pad.take('a')) { focusVisible = true; activateFocus(); }
    else if (pad.take('x')) act('draw');
    else if (pad.take('b')) undo();
    else if (pad.take('y')) { focusVisible = true; doHint(); }
  } else if (mode === 'paused' && (pad.take('start') || pad.take('b'))) {
    resume();
  } else if (mode === 'stuck' && pad.take('b')) {
    undo();
  } else {
    if (pad.take('up') || pad.take('left')) moveDomFocus(-1);
    else if (pad.take('down') || pad.take('right')) moveDomFocus(1);
    else if (pad.take('a')) document.activeElement?.click?.();
    else if (pad.take('b')) back();
  }
  pad.clear();
}

let autoT = 0;
function stepAutoplay(dt) {
  if (!AUTOPLAY || !isRound()) return;
  autoT += dt;
  if (autoT < 0.36) return;
  autoT = 0;
  const h = hintFor(current.round);
  if (h.kind === 'lost' || h.move === null || h.move === undefined) {
    undo();
    return;
  }
  if (h.move === DRAW) act('draw');
  else act('play', h.move);
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, layout: current?.deal.layout.id || attract?.deal.layout.id || 'none', particles: renderer.particles.length }),
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
  pad.poll(now);
  padInput();
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
  if (attractActive()) stepAttract(dt);
  stepAutoplay(dt);
  if (hint && now > hint.until) hint = null;
  if (mode !== 'paused') renderer.update(dt);
  renderer.draw(now, {
    focus: mode === 'play' ? focus : null,
    focusVisible,
    hint: mode === 'play' ? hint : null,
    highlight: mode === 'play' || attractActive(),
  });
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture;
// after a crash the guard returns early, so the loop stops rescheduling.
const loop = telemetry ? telemetry.guard(frame, 'campfire-solitaire.frame') : frame;

if (location.protocol !== 'file:') {
  applyGear();
  log.event('game.ready', {
    unlocked: save.unlocked + 1, stars: P.totalStars(save), 'streak.best': save.bestStreak,
    'daily.streak': P.dailyStreak(save, today()).streak, autoplay: AUTOPLAY,
  });
  const lv = parseInt(params.get('level'), 10);
  if (lv >= 1 && lv <= LEVEL_COUNT) startDeal(levelDeal(lv - 1));
  else if (params.has('daily')) startDeal(dailyDeal(today()));
  else if (params.has('quick')) startDeal(newQuick());
  else toTitle();
  requestAnimationFrame(loop);
}

// Console handle for debugging and browser checks.
window.CS = {
  get mode() { return mode; },
  get round() { return current?.round || null; },
  get deal() { return current?.deal || null; },
  get table() { return renderer.table; },
  get attract() { return attract; },
  save, renderer, sound, startDeal, levelDeal, dailyDeal, hintFor, act, undo, doHint, pause, resume,
};
