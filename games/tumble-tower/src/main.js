// Browser entry: screens, the fixed-step loop, input, sound and saves.
import { Game, STEP, PLAYER_COLORS, MARGIN } from './game.js';
import { Renderer, paintAnimal } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Autopilot } from './ai.js';
import { LEVELS, ISLANDS, islandLevels, levelLabel } from './levels.js';
import { ANIMALS, ANIMAL_BY_ID } from './animals.js';
import { THEMES, THEME_BY_ID } from './themes.js';
import { dailyLevel, dateKey } from './daily.js';
import {
  SAVE_KEY, loadSave, writeSave, recordLevel, recordEndless, recordDaily, totalStars, levelUnlocked,
  islandUnlocked, islandStars, nextLevel, liveStreak, checkUnlocks,
} from './save.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const canvas = $('game');
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
checkUnlocks(save);
let saveWarned = false;
function persist() {
  // ?autopilot is a browser check: its runs must not land in the real save.
  if (params.has('autopilot')) return;
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const renderer = new Renderer(canvas, { reducedMotion: reduced });
const coarse = matchMedia('(hover: none) and (pointer: coarse)');
const padRoom = () => { renderer.bottomPad = coarse.matches && innerHeight > innerWidth ? 96 : 0; };
padRoom();
coarse.addEventListener?.('change', padRoom);
const input = new Input(canvas, {
  worldX: (cx) => renderer.worldX(cx),
  heldX: () => game?.held?.x ?? null,
  scale: () => renderer.scale,
});
const sound = new Sound({ muted: save.muted, music: save.music });
renderer.setTheme(params.get('theme') && THEME_BY_ID[params.get('theme')] ? params.get('theme') : save.theme);

let mode = 'title'; // title | map | pass | collection | themes | play | paused | win | fail | over
let game = null;
let run = null; // { kind: 'climb'|'daily'|'endless'|'pass', index, players, seed }
let attract = true;
let pilot = new Autopilot({ budget: 2, pause: 0.35 });
const autoplay = params.has('autopilot') ? new Autopilot({ budget: 4, pause: 0.2 }) : null;
let accumulator = 0;
let endDelay = 0;
let passPlayers = 2;
let shownBest = false;

const SCREENS = ['screen-title', 'screen-map', 'screen-pass', 'screen-pause', 'screen-win', 'screen-fail', 'screen-over', 'screen-collection', 'screen-themes'];

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', !(mode === 'play' || mode === 'paused'));
  input.enabled = mode === 'play';
  const side = ['screen-title', 'screen-pass', 'screen-win', 'screen-fail', 'screen-over'].includes(id);
  renderer.side = side;
  document.body.classList.toggle('side', side);
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .lvl.next, .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(mode === 'play' ? 0.8 : mode === 'paused' ? 0.3 : 0.5, run?.index >= 0 ? LEVELS[run.index]?.island * 2 || 0 : 0);
}

// ------------------------------------------------------------ attract mode

function startAttract() {
  attract = true;
  const r = (Date.now() / 1000) | 0;
  const pool = Object.fromEntries(save.animals.map((a) => [a, a === 'hippo' || a === 'elephant' ? 3 : a === 'panda' || a === 'chick' ? 0.5 : 1.5]));
  game = new Game({ mode: 'attract', seed: r, pool });
  renderer.setGame(game);
  pilot = new Autopilot({ budget: 2, pause: 0.35 });
}

// ------------------------------------------------------------ title & menus

function titleBest() {
  const today = dateKey();
  const parts = [];
  parts.push(`★ ${totalStars(save)} / ${LEVELS.length * 3}`);
  if (save.endlessBest > 0) parts.push(`Best tower ${save.endlessBest.toFixed(1)} m`);
  const st = liveStreak(save, today);
  if (st > 0) parts.push(`🔥 ${st}-day streak`);
  return parts.join(' · ');
}

function toTitle() {
  mode = 'title';
  if (!attract || !game) startAttract();
  const n = nextLevel(save);
  $('btn-climb').textContent = totalStars(save) === 0 ? 'Climb · Start!' : `Climb · ${levelLabel(n)} ${LEVELS[n].name}`;
  $('title-best').textContent = titleBest();
  const today = dateKey();
  const d = save.daily[today] || 0;
  $('daily-note').textContent = d ? `Done today ${'★'.repeat(d)}${'☆'.repeat(3 - d)} · play again?` : `${dailyLevel(today).flavour} · new tower every day`;
  $('new-dot').classList.toggle('hidden', !save.newAnimals.length);
  updateSoundButtons();
  showScreen('screen-title');
}

function toMap() {
  mode = 'map';
  if (!attract || !game) startAttract();
  const grid = $('map-grid');
  grid.innerHTML = '';
  $('map-stars').textContent = `★ ${totalStars(save)} / ${LEVELS.length * 3}`;
  const nxt = nextLevel(save);
  ISLANDS.forEach((isl, i) => {
    const open = islandUnlocked(save, i);
    const card = document.createElement('div');
    card.className = `island${open ? '' : ' locked'}`;
    card.style.setProperty('--c1', isl.colors[0]);
    card.style.setProperty('--c2', isl.colors[1]);
    const lv = islandLevels(i);
    card.innerHTML = `<div class="island-art"></div><div class="island-head"><h3>${i + 1}. ${isl.name}</h3><span class="island-count">★ ${islandStars(save, i)}/${lv.length * 3}</span></div>
      <p class="island-blurb">${open ? isl.blurb : `Locked · finish ${ISLANDS[i - 1].name}`}</p>`;
    const row = document.createElement('div');
    row.className = 'lvls';
    for (const l of lv) {
      const b = document.createElement('button');
      const unlocked = open && levelUnlocked(save, l.index);
      const st = save.stars[l.index] || 0;
      b.className = `lvl${l.index === nxt && unlocked ? ' next' : ''}`;
      b.disabled = !unlocked;
      b.innerHTML = `<span>${l.number}</span><span class="s">${st ? '★'.repeat(st) + '☆'.repeat(3 - st) : ''}</span>`;
      const info = `${levelLabel(l.index)} · ${l.name} · reach ${l.goal} m with ${l.limit} animals`;
      b.title = info;
      b.setAttribute('aria-label', `${levelLabel(l.index)} ${l.name}${unlocked ? '' : ' (locked)'}${st ? `, ${st} stars` : ''}`);
      b.addEventListener('click', () => startClimb(l.index));
      b.addEventListener('focus', () => { $('map-info').textContent = unlocked ? info : 'Locked'; });
      b.addEventListener('mouseenter', () => { $('map-info').textContent = unlocked ? info : 'Locked'; });
      row.appendChild(b);
    }
    card.appendChild(row);
    if (isl.reward.length) {
      const r = document.createElement('p');
      r.className = 'reward';
      r.textContent = `Clear it to meet: ${isl.reward.map((a) => ANIMAL_BY_ID[a].name).join(' & ')}`;
      card.appendChild(r);
    }
    grid.appendChild(card);
  });
  $('map-info').textContent = 'Pick a level';
  showScreen('screen-map');
  const nb = grid.querySelector('.lvl.next') || grid.querySelector('.lvl:not([disabled])');
  nb?.focus({ preventScroll: true });
  nb?.scrollIntoView?.({ block: 'nearest' });
}

function toPass() {
  mode = 'pass';
  for (const b of document.querySelectorAll('[data-players]')) b.classList.toggle('on', +b.dataset.players === passPlayers);
  showScreen('screen-pass');
}

function unlockHint(a) {
  const isl = ISLANDS.findIndex((i) => i.reward.includes(a.id));
  return isl >= 0 ? `Clear ${ISLANDS[isl].name}` : '';
}

function toCollection() {
  mode = 'collection';
  const grid = $('col-grid');
  grid.innerHTML = '';
  $('col-count').textContent = `${save.animals.length} / ${ANIMALS.length}`;
  for (const a of ANIMALS) {
    const have = save.animals.includes(a.id);
    const t = document.createElement('div');
    t.className = `tile${have ? '' : ' locked'}`;
    t.innerHTML = `${have && save.newAnimals.includes(a.id) ? '<span class="badge">NEW</span>' : ''}<canvas></canvas><h3>${have ? a.name : '???'}</h3><p>${have ? a.blurb : unlockHint(a)}</p>`;
    grid.appendChild(t);
    requestAnimationFrame(() => paintAnimal(t.querySelector('canvas'), a.id, { locked: !have, expr: 'grin' }));
  }
  save.newAnimals = [];
  persist();
  showScreen('screen-collection');
}

function toThemes() {
  mode = 'themes';
  const grid = $('theme-grid');
  grid.innerHTML = '';
  $('theme-stars').textContent = `★ ${totalStars(save)}`;
  for (const t of THEMES) {
    const have = save.themes.includes(t.id);
    const b = document.createElement('button');
    b.className = `tile theme${save.theme === t.id ? ' on' : ''}`;
    b.disabled = !have;
    b.innerHTML = `<div class="swatch" style="background:linear-gradient(180deg, ${t.high[1]}, ${t.sky[0]} 60%, ${t.sky[2]})"><i style="background:${t.ground.top};box-shadow:0 8px 0 ${t.ground.rock}"></i></div>
      <div class="body"><h3>${t.name}</h3><p>${save.theme === t.id ? 'In use' : have ? 'Tap to use' : `🔒 ${t.hint}`}</p></div>`;
    b.addEventListener('click', () => {
      save.theme = t.id;
      persist();
      renderer.setTheme(t.id);
      log.event('theme.change', { theme: t.id });
      toThemes();
    });
    grid.appendChild(b);
  }
  showScreen('screen-themes');
  grid.querySelector('.theme.on')?.focus({ preventScroll: true });
}

// ------------------------------------------------------------ starting play

function begin(newGame, newRun) {
  sound.unlock();
  attract = false;
  run = newRun;
  game = newGame;
  renderer.setGame(game);
  renderer.setTheme(params.get('theme') && THEME_BY_ID[params.get('theme')] ? params.get('theme') : save.theme);
  queueMicrotask(() => monitor.mark(performance.now()));
  mode = 'play';
  accumulator = 0;
  endDelay = 0;
  shownBest = false;
  input.clear();
  if (autoplay) autoplay.forHeld = null;
  showScreen(null);
  setupHud();
  log.event('level.start', {
    mode: run.kind, level: run.index >= 0 ? run.index + 1 : 0, goal: game.goal ?? 0,
    limit: Number.isFinite(game.limit) ? game.limit : 0, players: game.players,
  });
}

function startClimb(index) {
  const l = LEVELS[index];
  begin(new Game({ mode: 'climb', level: l }), { kind: 'climb', index });
  renderer.banner(`${levelLabel(index)} ${l.name}`, `Reach ${l.goal} m and hold it!`, '#ffffff', 2.2);
}

function startDaily() {
  const key = dateKey();
  const l = dailyLevel(key);
  begin(new Game({ mode: 'daily', level: l }), { kind: 'daily', index: -1, key });
  renderer.banner('Daily Tower', `${l.flavour} · reach ${l.goal} m`, '#ffd23f', 2.2);
}

function poolFromSave() {
  const pool = {};
  for (const a of save.animals) pool[a] = a === 'hippo' || a === 'elephant' ? 3 : a === 'turtle' || a === 'giraffe' ? 2 : a === 'panda' || a === 'chick' ? 0.8 : 1.4;
  return pool;
}

function startEndless() {
  const seed = (Date.now() & 0x7fffffff) >>> 0;
  begin(new Game({ mode: 'endless', seed, pool: poolFromSave() }), { kind: 'endless', index: -1, seed });
  renderer.banner('Endless Tower', save.endlessBest ? `Beat ${save.endlessBest.toFixed(1)} m!` : 'How high can you go?', '#ffffff', 2);
}

function startPass(players = passPlayers, firstTurn = 0) {
  const seed = (Date.now() & 0x7fffffff) >>> 0;
  begin(new Game({ mode: 'pass', seed, players, pool: poolFromSave(), firstTurn }), { kind: 'pass', index: -1, seed, players });
  renderer.banner(`Player ${firstTurn + 1}`, 'Your turn!', PLAYER_COLORS[firstTurn], 1.6);
}

function restart() {
  if (!run) return toTitle();
  if (run.kind === 'climb') startClimb(run.index);
  else if (run.kind === 'daily') startDaily();
  else if (run.kind === 'endless') startEndless();
  else startPass(run.players);
}

function pause() {
  if (mode !== 'play') return;
  // Already won or lost: skip to the results so the run is recorded.
  if (game.phase === 'won' || game.phase === 'lost') { finished(); return; }
  mode = 'paused';
  updateSoundButtons();
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  input.clear();
  showScreen(null);
}

// ------------------------------------------------------------ HUD

const hudCache = {};
function setText(id, text) {
  if (hudCache[id] === text) return;
  hudCache[id] = text;
  $(id).textContent = text;
}

function setupHud() {
  for (const k of Object.keys(hudCache)) delete hudCache[k];
  const g = game;
  const label = run.kind === 'climb' ? `${levelLabel(run.index)} ${LEVELS[run.index].name}` : run.kind === 'daily' ? g.level.name : run.kind === 'endless' ? 'Endless Tower' : 'Pass & Play';
  setText('hud-level', label);
  $('hud-count').classList.toggle('hidden', !g.goalMode);
  $('hud-hearts').classList.toggle('hidden', run.kind !== 'endless');
  $('hud-turn').classList.toggle('hidden', run.kind !== 'pass');
  $('hud-goal').textContent = g.goal != null ? ` / ${g.goal} m` : run.kind === 'endless' && save.endlessBest ? ` · best ${save.endlessBest.toFixed(1)} m` : ' m';
  lastNext = null;
}

let lastNext = null;
function updateHud() {
  const g = game;
  setText('hud-h', g.top.toFixed(1));
  $('hud-height').classList.toggle('reached', g.goal != null && g.top >= g.goal);
  if (g.goalMode) {
    const left = g.remaining() - (g.held ? 1 : 0);
    setText('hud-left', String(Math.max(0, left + (g.held ? 1 : 0))));
    setText('hud-left-label', left + (g.held ? 1 : 0) === 1 ? 'animal left' : 'animals left');
  }
  if (run.kind === 'endless') setText('hud-hearts', '❤'.repeat(g.hearts) + '♡'.repeat(Math.max(0, 3 - g.hearts)));
  if (run.kind === 'pass') {
    setText('hud-turn', `Player ${g.turn + 1}'s turn`);
    $('hud-turn').style.background = PLAYER_COLORS[g.turn];
  }
  const nx = g.peekNext();
  const key = nx ? `${nx.animal}${nx.ice ? '*' : ''}` : '-';
  if (key !== lastNext) {
    lastNext = key;
    const c = $('hud-next');
    if (nx) paintAnimal(c, nx.animal, { ice: nx.ice });
    else c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }
}

// ------------------------------------------------------------ results

function starsHtml(n) {
  return [0, 1, 2].map((i) => `<span class="${i < n ? 'on' : ''}">★</span>`).join('');
}

function unlockHtml(target, unlocks) {
  const box = $(target);
  box.innerHTML = '';
  for (const id of unlocks.animals || []) {
    const d = document.createElement('div');
    d.className = 'unlock';
    d.innerHTML = `<canvas></canvas><span>New friend: ${ANIMAL_BY_ID[id].name}!</span>`;
    box.appendChild(d);
    requestAnimationFrame(() => paintAnimal(d.querySelector('canvas'), id, { expr: 'grin' }));
    log.event('animal.unlock', { animal: id });
  }
  for (const id of unlocks.themes || []) {
    const d = document.createElement('div');
    d.className = 'unlock';
    d.innerHTML = `<span>🎨 New theme: ${THEME_BY_ID[id].name}!</span>`;
    box.appendChild(d);
    log.event('theme.unlock', { theme: id });
  }
}

function lines(target, rows, tip) {
  $(target).innerHTML = rows.map(([a, b, cls]) => `<div class="${cls || ''}"><span>${a}</span><b>${b}</b></div>`).join('') + (tip ? `<div class="tip">${tip}</div>` : '');
}

function onWin() {
  const g = game, r = g.result;
  mode = 'win';
  let unlocks = { animals: [], themes: [] };
  if (run.kind === 'climb') {
    const rec = recordLevel(save, run.index, r.stars);
    unlocks = rec;
    persist();
    log.event('level.complete', { mode: 'climb', level: run.index + 1, stars: r.stars, height: +g.top.toFixed(2), used: g.used, time: +g.time.toFixed(1) });
    const last = run.index === LEVELS.length - 1;
    $('win-title').textContent = last ? 'You reached the Summit!' : 'Tower complete!';
    $('win-sub').textContent = `${levelLabel(run.index)} · ${LEVELS[run.index].name}`;
    $('btn-next').classList.toggle('hidden', last);
    if (!last) $('btn-next').textContent = `Next · ${levelLabel(run.index + 1)} →`;
  } else {
    const rec = recordDaily(save, run.key, r.stars);
    unlocks = rec;
    persist();
    log.event('level.complete', { mode: 'daily', stars: r.stars, height: +g.top.toFixed(2), used: g.used, time: +g.time.toFixed(1), streak: rec.streak });
    $('win-title').textContent = 'Daily Tower done!';
    $('win-sub').textContent = `${g.level.name} · 🔥 ${rec.streak}-day streak`;
    $('btn-next').classList.add('hidden');
  }
  $('win-stars').innerHTML = starsHtml(r.stars);
  const tips = [];
  if (!r.margin) tips.push(`build ${MARGIN} m over the line`);
  if (!r.par) tips.push(`use ${g.level.par} animals or fewer`);
  lines('win-lines', [
    ['Height', `${g.top.toFixed(1)} m`, r.margin ? 'ok' : ''],
    ['Animals used', `${g.used} (par ${g.level.par})`, r.par ? 'ok' : ''],
  ], tips.length ? `For more ★: ${tips.join(' and ')}` : 'Perfect tower! ★★★');
  unlockHtml('win-unlocks', unlocks);
  showScreen('screen-win');
}

function onFail() {
  const g = game;
  mode = 'fail';
  log.event('level.fail', { mode: run.kind, level: run.index + 1, reason: g.result.reason, height: +g.bestTop.toFixed(2), used: g.used, splashes: g.splashes });
  $('fail-title').textContent = g.result.reason === 'out' ? 'Out of animals!' : 'Tumble!';
  const close = g.top >= g.goal * 0.7;
  $('fail-sub').textContent = close ? `So close! The tower reached ${g.top.toFixed(1)} of ${g.goal} m.` : 'Splash! The animals went for a swim. Try again?';
  const tip = g.splashes > 1 ? 'Tip: put wide, flat animals near the bottom.' : g.level.wind ? 'Tip: lean into the wind a little.' : 'Tip: drop gently, right over the middle.';
  lines('fail-lines', [['Best height', `${g.bestTop.toFixed(1)} m`], ['Splashes', String(g.splashes)]], tip);
  showScreen('screen-fail');
}

function onOver() {
  const g = game;
  mode = 'over';
  if (run.kind === 'endless') {
    const h = g.bestTop;
    const rec = recordEndless(save, h);
    persist();
    log.event('endless.over', { height: +h.toFixed(2), used: g.used, 'best.new': rec.newBest });
    $('over-title').textContent = 'What a tower!';
    $('over-new').classList.toggle('hidden', !rec.newBest);
    $('over-height').textContent = `${h.toFixed(1)} m`;
    lines('over-lines', [['Animals stacked', String(g.used)], ['Best ever', `${save.endlessBest.toFixed(1)} m`]], rec.newBest ? '' : `Your best is ${save.endlessBest.toFixed(1)} m. One more go?`);
    unlockHtml('over-unlocks', rec);
    $('btn-again').textContent = 'Play again';
  } else {
    save.passGames++;
    persist();
    const loser = g.loser;
    log.event('pass.over', { players: g.players, loser: loser + 1, height: +g.bestTop.toFixed(2), used: g.used });
    $('over-title').textContent = `Player ${loser + 1} toppled it!`;
    $('over-title').style.color = PLAYER_COLORS[loser];
    const winners = Array.from({ length: g.players }, (_, i) => i).filter((i) => i !== loser).map((i) => `Player ${i + 1}`);
    $('over-new').classList.remove('hidden');
    $('over-new').textContent = `${winners.join(' & ')} win${winners.length === 1 ? 's' : ''}!`;
    $('over-height').textContent = `${g.bestTop.toFixed(1)} m`;
    lines('over-lines', [['Animals stacked', String(g.used)], ['Rounds', String(Math.ceil(g.used / g.players))]], `Rematch? Player ${loser + 1} goes first!`);
    $('over-unlocks').innerHTML = '';
    $('btn-again').textContent = 'Rematch';
  }
  showScreen('screen-over');
}

function finished() {
  if (game.phase === 'won') onWin();
  else if (run.kind === 'endless' || run.kind === 'pass') onOver();
  else onFail();
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

// ------------------------------------------------------------ wiring

const click = (id, fn) => $(id).addEventListener('click', () => { sound.unlock(); sound.ui(); fn(); });
click('btn-climb', () => {
  const n = nextLevel(save);
  if (totalStars(save) === 0) startClimb(0); else if (save.stars[n]) toMap(); else startClimb(n);
});
click('btn-endless', startEndless);
click('btn-pass', toPass);
click('btn-daily', startDaily);
click('btn-collection', toCollection);
click('btn-themes', toThemes);
click('btn-pass-start', () => startPass(passPlayers));
for (const b of document.querySelectorAll('[data-players]')) b.addEventListener('click', () => { passPlayers = +b.dataset.players; toPass(); });
click('btn-resume', resume);
click('btn-restart', restart);
click('btn-pause-menu', () => (run?.kind === 'climb' ? toMap() : toTitle()));
click('btn-pause', pause);
click('btn-mute', toggleMute);
// A mouse or touch click leaves focus on the button, where Space (drop) would
// press it again; hand focus back to the game.
$('btn-mute').addEventListener('click', (e) => { if (e.detail) e.currentTarget.blur(); });
click('btn-next', () => startClimb(run.index + 1));
click('btn-replay', restart);
click('btn-win-map', () => (run.kind === 'climb' ? toMap() : toTitle()));
click('btn-retry', restart);
click('btn-fail-map', () => (run.kind === 'climb' ? toMap() : toTitle()));
click('btn-again', () => {
  if (run.kind === 'pass') {
    // the loser goes first in the rematch
    startPass(run.players, Math.max(0, game.loser));
  } else restart();
});
const turnBtn = $('btn-turn'), dropBtn = $('btn-drop');
turnBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); input.turn(-1); });
dropBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); input.dropNow(); });
turnBtn.addEventListener('click', (e) => { if (e.detail === 0) input.turn(-1); });
dropBtn.addEventListener('click', (e) => { if (e.detail === 0) input.dropNow(); });
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', () => { sound.ui(); toTitle(); });
addEventListener('resize', () => { padRoom(); renderer.resize(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// Another tab saved: take its progress, so this tab never writes a stale
// copy over it (whichever tab saved last used to win).
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY && e.key !== null) return;
  const fresh = loadSave(storage);
  checkUnlocks(fresh);
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, fresh);
  sound.setMuted(save.muted);
  sound.setMusic(save.music);
  if (!params.get('theme')) renderer.setTheme(save.theme);
  updateSoundButtons();
  if (mode === 'title') toTitle();
  else if (mode === 'map') toMap();
  else if (mode === 'collection') toCollection();
  else if (mode === 'themes') toThemes();
});
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

function moveFocus(dir) {
  const screen = SCREENS.map($).find((s) => !s.classList.contains('hidden'));
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not([disabled]), a[href]'), ...(mode === 'title' ? [document.querySelector('#screen-title .arcade-link')] : [])]
    .filter((el, i, arr) => el && el.offsetParent !== null && arr.indexOf(el) === i);
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
  else if (mode === 'map' || mode === 'pass' || mode === 'collection' || mode === 'themes' || mode === 'over') toTitle();
  else if (mode === 'win' || mode === 'fail') (run?.kind === 'climb' ? toMap() : toTitle());
}

// ------------------------------------------------------------ pointer hiding

let pointerIdle = 0;
addEventListener('pointermove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

// ------------------------------------------------------------ loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, kind: run?.kind || 'attract', level: run?.index >= 0 ? run.index + 1 : 0, blocks: game?.blocks.length ?? 0, attract }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  if (window.__ttCrash) { window.__ttCrash = false; throw new Error('Test crash in the frame loop'); }
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
  if (mode !== 'play') {
    if (input.consumePad('up') || input.consumePad('left')) moveFocus(-1);
    if (input.consumePad('down') || input.consumePad('right')) moveFocus(1);
    if (input.consumePad('a')) document.activeElement?.click?.();
    if (input.consumePad('b')) back();
  }

  const playing = mode === 'play';
  const stepping = playing || (attract && mode !== 'paused') || mode === 'win' || mode === 'fail' || mode === 'over';
  if (game && stepping) {
    accumulator += dt;
    let n = 0;
    while (accumulator >= STEP && n < 4) {
      let c = {};
      if (playing) c = autoplay ? autoplay.controls(game, STEP) : (n === 0 ? input.read() : {});
      else if (attract) c = pilot.controls(game, STEP);
      game.step(STEP, c);
      accumulator -= STEP;
      n++;
    }
    if (n === 4) accumulator = 0;
    renderer.handleEvents(game.events, game);
    if (playing) {
      sound.handle(game.events);
      for (const e of game.events) {
        if (e.type === 'turn') renderer.banner(`Player ${e.turn + 1}`, 'Your turn!', PLAYER_COLORS[e.turn], 1.3);
      }
      if (run.kind === 'endless' && !shownBest && save.endlessBest > 0 && game.bestTop > save.endlessBest + 0.05) {
        shownBest = true;
        renderer.banner('New best!', `${game.bestTop.toFixed(1)} m`, '#ffd23f', 1.8);
        sound.handle([{ type: 'milestone' }]);
      }
    }
    game.events.length = 0;
    sound.setWind(playing ? game.windNow : 0);
    if (playing) {
      updateHud();
      if (game.phase === 'won' || game.phase === 'lost') {
        endDelay += dt;
        if (endDelay > (game.phase === 'won' ? 1.6 : 1.3)) finished();
      }
    } else if (attract && (game.phase === 'lost' || game.bestTop > 9 || game.used > 14)) {
      if (game.endTimer > 1.5 || game.phase !== 'lost') startAttract();
    }
  }
  renderer.update(mode === 'paused' ? 0 : dt, game);
  renderer.draw(game, { canDrop: game?.canDrop(), hud: mode === 'play' || mode === 'paused' });
  requestAnimationFrame(loop);
}

const loop = telemetry ? telemetry.guard(frame, 'tumble-tower.frame') : frame;

if (location.protocol !== 'file:') {
  log.event('game.ready', { stars: totalStars(save), animals: save.animals.length, best: save.endlessBest, theme: save.theme });
  const lv = parseInt(params.get('level'), 10);
  const m = params.get('mode');
  if (lv >= 1 && lv <= LEVELS.length) startClimb(lv - 1);
  else if (m === 'endless') startEndless();
  else if (m === 'daily') startDaily();
  else if (m === 'pass') startPass(2);
  else toTitle();
  requestAnimationFrame(loop);
}

window.TT = {
  get game() { return game; }, get mode() { return mode; }, get run() { return run; },
  save, startClimb, startEndless, startDaily, startPass, toTitle, toMap, renderer, input, sound, persist,
};
