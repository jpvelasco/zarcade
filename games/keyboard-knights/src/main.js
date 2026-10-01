// Browser entry: screens, the frame loop, keyboard and touch input, sound,
// saves and telemetry. The rules live in battle.js and friends.
import { Battle, paceFor } from './battle.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { ScreenKeyboard } from './keyboard.js';
import { Autoplay } from './autoplay.js';
import { STAGES, LESSONS, REGIONS, BESTIARY, makeDaily, stageById, STAGES_PER_REGION } from './stages.js';
import {
  loadSave, writeSave, recordRun, recordPoof, nextStageIndex, isStageUnlocked, totalStars, MAX_STARS,
  currentTier, liveStreak, dailyDoneToday, equip, bestiarySeen, ITEMS, SLOTS, regionsOpen,
} from './progress.js';
import { recordKey, recentWpm, pushHistory } from './stats.js';
import { dateKey } from './rng.js';
import { renderMap, renderLessons, renderWardrobe, renderBestiary, renderStats, knightPreview, spriteCanvas, starsText } from './ui.js';
import { knightSprite, swordSprite, petSprite } from './sprites.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch');

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

const canvas = $('game');
const renderer = new Renderer(canvas, { reducedMotion: reducedQuery.matches });
reducedQuery.addEventListener?.('change', () => renderer.setReducedMotion(reducedQuery.matches));
const sound = new Sound({ muted: !save.settings.sound, music: save.settings.music });
const keyboard = new ScreenKeyboard($('kbd'), { onKey: (ch) => handleChar(ch), onSpecial: () => doSpecial() });
renderer.setLook(save.equipped);

let mode = 'title';
let battle = null;
let stage = null;
let attract = null; // { battle, bot } behind the menus
let bot = params.has('autoplay') ? new Autoplay({ wpm: Number(params.get('autoplay')) || 40, errorRate: 0.03 }) : null;
let endTimer = 0;
let backTo = 'title';
let shiftTipShown = false;
let lastResult = null;
const fails = new Map();
const today = () => params.get('date') || dateKey();

const SCREENS = ['screen-title', 'screen-who', 'screen-map', 'screen-lessons', 'screen-wardrobe', 'screen-bestiary', 'screen-stats', 'screen-settings', 'screen-pause', 'screen-results', 'screen-fail'];

document.body.classList.toggle('touch', coarse);

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('hud-buttons').classList.toggle('hidden', mode !== 'play');
  updateKeyboardDock();
  if (id) {
    const first = $(id).querySelector('.node.next:not([disabled]), .btn.primary:not([disabled]), .btn:not([disabled]):not(.arcade-link)');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(mode === 'play' ? 0.8 : mode === 'paused' ? 0.25 : 0.5);
}

// The keyboard docks under the road while playing: always on touch (unless
// switched off), always in lessons, and on desktop when switched on.
function keyboardWanted() {
  if (mode !== 'play' && mode !== 'paused') return false;
  if (stage?.lesson) return true;
  const pref = save.settings.keyboard;
  return pref === 'on' || (pref === 'auto' && coarse);
}

function updateKeyboardDock() {
  const want = keyboardWanted();
  const el = $('kbd');
  if (el.classList.contains('hidden') === !want) return;
  el.classList.toggle('hidden', !want);
  renderer.resize();
}

const onTouchKeyboard = () => keyboardWanted() && coarse;

// ------------------------------------------------------------ attract

function newAttract() {
  const open = regionsOpen(save);
  const choices = STAGES.filter((s) => !s.boss && s.region < open);
  const st = choices[Math.floor(Math.random() * choices.length)];
  const b = new Battle(st, { seed: (Math.random() * 1e9) | 0, gentle: true, adaptive: false });
  attract = { battle: b, bot: new Autoplay({ wpm: st.targetWpm * 1.6, errorRate: 0.02, seed: 5 }) };
  renderer.setRegion(st.region);
  renderer.reset();
}

// ------------------------------------------------------------ screens

function titleBestLine() {
  const parts = [];
  parts.push(save.bestWpm ? `🏅 Best speed <b>${save.bestWpm} WPM</b>` : '🏅 Best speed: let\'s find out!');
  parts.push(`★ ${totalStars(save)} / ${MAX_STARS}`);
  const streak = liveStreak(save, today());
  if (streak) parts.push(`🔥 ${streak}-day streak`);
  return parts.join(' · ');
}

function toTitle() {
  mode = 'title';
  battle = null;
  stage = null;
  if (!attract) newAttract();
  const next = STAGES[nextStageIndex(save)];
  const started = Object.keys(save.stars).length > 0;
  $('btn-play').textContent = started ? `Continue · ${next.name}` : 'Play';
  $('title-best').innerHTML = titleBestLine();
  const done = dailyDoneToday(save, today());
  $('btn-daily').innerHTML = `☀️ Daily quest · ${done ? 'done ✓' : REGIONS[currentTier(save)].name}`;
  $('btn-daily').classList.toggle('done', done);
  $('title-knight').innerHTML = '';
  $('title-knight').appendChild(knightPreview(save.equipped, 84));
  updateSoundButtons();
  showScreen('screen-title');
}

function openMenu(name, from = 'title') {
  backTo = from;
  mode = name;
  battle = null;
  if (!attract) newAttract();
  if (name === 'map') {
    $('map-stars').textContent = `★ ${totalStars(save)} / ${MAX_STARS}`;
    renderMap($('map-regions'), save, { onStage: (i) => startStage(STAGES[i]) });
    showScreen('screen-map');
    const next = document.querySelector('#map-regions .node.next') || document.querySelector('#map-regions .node:not([disabled])');
    next?.focus({ preventScroll: true });
    next?.scrollIntoView({ block: 'center' });
  } else if (name === 'lessons') {
    renderLessons($('lesson-grid'), save, { onLesson: (i) => startStage(LESSONS[i]) });
    showScreen('screen-lessons');
  } else if (name === 'wardrobe') {
    drawWardrobe();
    showScreen('screen-wardrobe');
  } else if (name === 'bestiary') {
    $('beast-count').textContent = `${bestiarySeen(save)} / ${BESTIARY.length} met`;
    renderBestiary($('beast-grid'), save);
    showScreen('screen-bestiary');
  } else if (name === 'stats') {
    renderStats($('stats-body'), save);
    showScreen('screen-stats');
  } else if (name === 'settings') {
    updateSoundButtons();
    showScreen('screen-settings');
  } else if (name === 'who') {
    showScreen('screen-who');
  }
}

function drawWardrobe() {
  const owned = save.owned.length;
  const total = SLOTS.reduce((n, s) => n + ITEMS[s].length, 0);
  $('ward-count').textContent = `${owned} / ${total}`;
  renderWardrobe($('ward-slots'), $('ward-preview'), save, {
    onEquip: (slot, id) => {
      if (equip(save, slot, id)) {
        sound.click();
        persist();
        renderer.setLook(save.equipped);
        log.event('wardrobe.equip', { slot, item: id });
        drawWardrobe();
        document.querySelector(`#ward-slots .ward-item.on`)?.focus({ preventScroll: true });
      }
    },
  });
}

function goBack() {
  if (mode === 'paused') return resume();
  if (mode === 'results' || mode === 'fail') return openMenu(stage?.lesson ? 'lessons' : 'map');
  if (mode === 'settings' && backTo === 'paused') { mode = 'paused'; return showScreen('screen-pause'); }
  if (mode !== 'title' && mode !== 'play') toTitle();
}

// ------------------------------------------------------------ play

function startStage(st, { retry = false } = {}) {
  sound.unlock();
  if (!retry && stage?.id !== st.id) shiftTipShown = false;
  stage = st;
  attract = null;
  const settings = save.settings;
  const capitals = st.tier === 4 || !!st.words.capitals;
  mode = 'play';
  const touchKb = (st.lesson || settings.keyboard === 'on' || (settings.keyboard === 'auto' && coarse)) && coarse;
  battle = new Battle(st, {
    seed: st.daily ? st.seed : (Math.random() * 1e9) | 0,
    keyStats: save.keyStats,
    caseless: touchKb || settings.forgiving || !capitals,
    gentle: st.gentle || settings.relaxed,
    speedScale: paceFor(st, { recentWpm: recentWpm(save.history), fails: fails.get(st.id) || 0 }),
  });
  if (bot) bot = new Autoplay({ wpm: Number(params.get('autoplay')) || 40, errorRate: 0.03 });
  endTimer = 0;
  renderer.setRegion(st.region);
  renderer.setLook(save.equipped);
  renderer.reset();
  sound.setRegion(st.region);
  keyboard.configure({
    punct: st.tier === 4,
    semicolon: !!st.keys?.includes(';'),
    guide: !!st.lesson,
  });
  keyboard.setSpecialReady(false);
  showScreen(null);
  const sub = st.lesson ? st.tip : st.boss ? 'A boss is on the way!' : st.daily ? 'Same quest for everyone today' : 'Type the words to poof the monsters!';
  renderer.showBanner(st.lesson ? `Lesson: ${st.name}` : st.name, sub, 2.6);
  log.event('level.start', {
    stage: st.id, kind: st.lesson ? 'lesson' : st.daily ? 'daily' : st.boss ? 'boss' : 'stage',
    region: st.region + 1, pace: battle.speedScale, gentle: battle.gentle, attempt: (fails.get(st.id) || 0) + 1,
  });
  queueMicrotask(() => monitor.mark(performance.now()));
}

function handleChar(ch) {
  if (mode !== 'play' || !battle) return;
  sound.unlock();
  battle.type(ch);
}

function doSpecial() {
  if (mode !== 'play' || !battle) return;
  if (!battle.special()) keyboard.flash(' ', false);
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  $('pause-sub').textContent = stage ? (stage.lesson ? `Lesson: ${stage.name}` : stage.name) : '';
  updateSoundButtons();
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  showScreen(null);
}

function processEvents(events) {
  const b = battle;
  for (const e of events) {
    switch (e.type) {
      case 'key':
        recordKey(save.keyStats, e.ch, e.ok, e.ms);
        if (e.ok) {
          const m = b.monsters.find((x) => x.id === e.id);
          sound.key(m ? m.typed / m.word.length : 1);
        }
        keyboard.flash(e.ch, e.ok);
        break;
      case 'typo':
        sound.typo();
        if (!e.expected) keyboard.flash(e.ch, false);
        if (e.expected && !b.caseless && !shiftTipShown && e.ch.toLowerCase() === e.expected.toLowerCase()) {
          shiftTipShown = true;
          renderer.toast(e.expected === e.expected.toUpperCase() ? 'Hold Shift for capitals!' : 'Is Caps Lock on?', '#ffffff');
        }
        break;
      case 'poof':
      case 'bossDefeated': {
        if (e.type === 'poof') sound.poof(e.combo || 0); else sound.bossHit();
        if (recordPoof(save, e.monster)) {
          const entry = BESTIARY.find((x) => x.id === e.monster);
          if (entry) renderer.toast(`New friend: ${entry.name}!`, '#9ff0b0');
        }
        break;
      }
      case 'bossHit':
        sound.bossHit();
        break;
      case 'boss': {
        const entry = BESTIARY.find((x) => x.id === e.monster);
        renderer.showBanner(entry ? entry.name : 'Boss!', 'Type each phrase, spaces too!', 2.4);
        break;
      }
      case 'bonk':
        sound.bonk();
        break;
      case 'special':
        sound.special();
        keyboard.setSpecialReady(false);
        log.event('special.used', { stage: stage.id, cleared: e.count });
        break;
      case 'meterFull':
        sound.ready();
        keyboard.setSpecialReady(true);
        break;
      case 'combo':
        if (e.combo % 10 === 0) log.event('combo.reached', { stage: stage.id, combo: e.combo });
        break;
      default:
        break;
    }
  }
}

// ------------------------------------------------------------ results

function onCleared() {
  const sum = battle.summary();
  const st = stage;
  const out = recordRun(save, st, sum, today());
  fails.delete(st.id);
  persist();
  lastResult = { sum, out };
  log.event('level.complete', {
    stage: st.id, stars: sum.stars, score: sum.score, wpm: sum.wpm, acc: Math.round(sum.acc * 100), time: sum.time,
    'combo.max': sum.maxCombo, bonks: sum.bonks, 'best.new': out.newBestWpm,
  });
  if (st.daily && !out.dailyRepeat) log.event('daily.complete', { streak: out.streak, tier: st.tier });
  for (const u of out.unlocked) log.event('unlock.earned', { slot: u.slot, item: u.id });
  mode = 'results';
  const title = st.boss && !st.daily ? `${BESTIARY.find((x) => x.id === st.boss).name} is poofed!` : st.lesson ? 'Lesson complete!' : st.daily ? 'Daily quest done!' : 'Stage clear!';
  $('res-title').textContent = title;
  $('res-sub').textContent = st.daily ? (out.dailyRepeat ? 'Come back tomorrow for a new quest.' : `🔥 ${out.streak}-day streak! New quest tomorrow.`)
    : st.boss ? `${REGIONS[st.region].name} is cheering for you!` : st.lesson ? `Lesson ${st.index + 1}: ${st.name}` : st.name;
  $('res-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < sum.stars ? 'on' : ''}" style="animation-delay:${0.15 + i * 0.25}s">★</span>`).join('');
  for (let i = 0; i < sum.stars; i++) setTimeout(() => sound.star(i), 150 + i * 250);
  const best = $('res-best');
  best.classList.toggle('hidden', !out.newBestWpm);
  best.textContent = out.newBestWpm ? `New best speed! ${sum.wpm} WPM (was ${out.prevBestWpm})` : '';
  const lines = [
    ['Speed', `${sum.wpm} WPM`],
    ['Accuracy', `${Math.round(sum.acc * 100)}%`],
    ['Best combo', sum.maxCombo],
    ['Score', sum.score.toLocaleString('en-US')],
  ];
  let tip = '';
  if (sum.stars < 3) tip = sum.acc < 0.85 ? 'Tip: slow and steady! 85% accuracy earns ★★' : sum.acc < 0.95 ? 'Tip: 95% accuracy earns ★★★' : 'Tip: no more than one bonk for ★★★';
  $('res-lines').innerHTML = lines.map(([a, v]) => `<div><span>${a}</span><b>${v}</b></div>`).join('') + (tip ? `<div class="tip">${tip}</div>` : '');
  const un = $('res-unlocks');
  un.innerHTML = '';
  for (const u of out.unlocked) {
    const item = document.createElement('div');
    item.className = 'unlock';
    const img = u.slot === 'armour' ? knightSprite(u.id, 0, 128) : u.slot === 'sword' ? swordSprite(u.id, 128) : petSprite(u.id, 128);
    item.appendChild(spriteCanvas(img, 44));
    const t = document.createElement('span');
    t.innerHTML = `<b>Unlocked!</b> ${u.name}`;
    item.appendChild(t);
    un.appendChild(item);
  }
  if (out.unlocked.length) setTimeout(() => sound.unlockJingle(), 900);
  const next = nextFor(st);
  $('btn-next').textContent = next ? `Next · ${next.name} →` : st.daily ? 'Quest map' : 'Quest map';
  sound.win(sum.stars);
  showScreen('screen-results');
}

function nextFor(st) {
  if (st.lesson) return LESSONS[st.index + 1] || null;
  if (st.daily) return null;
  const i = STAGES.indexOf(st);
  return i >= 0 && i + 1 < STAGES.length && isStageUnlocked(save, i + 1) ? STAGES[i + 1] : null;
}

function onFailed() {
  const sum = battle.summary();
  const n = (fails.get(stage.id) || 0) + 1;
  fails.set(stage.id, n);
  if (sum.correct >= 10) pushHistory(save.history, { d: today(), wpm: sum.wpm, acc: sum.acc, stage: stage.id });
  persist();
  log.event('level.fail', { stage: stage.id, attempt: n, wpm: sum.wpm, acc: Math.round(sum.acc * 100), words: sum.words });
  mode = 'fail';
  $('fail-sub').textContent = n >= 2 && !save.settings.relaxed
    ? 'The monsters will walk slower now. You can also switch on Relaxed pace in Settings.'
    : 'No worries! The monsters will walk a little slower next time.';
  $('fail-lines').innerHTML = `<div><span>Words poofed</span><b>${sum.words}</b></div>` +
    (sum.correct ? `<div><span>Accuracy</span><b>${Math.round(sum.acc * 100)}%</b></div>` : `<div><span>Best combo</span><b>${sum.maxCombo}</b></div>`);
  sound.fail();
  showScreen('screen-fail');
}

// ------------------------------------------------------------ sound + settings

function updateSoundButtons() {
  const s = save.settings;
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = s.sound ? '🔊 Sound on' : '🔇 Sound off';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = s.music ? '🎵 Music on' : '🎵 Music off';
  $('btn-mute').textContent = s.sound ? '🔊' : '🔇';
  $('btn-mute').setAttribute('aria-label', s.sound ? 'Mute' : 'Unmute');
  $('set-relaxed').textContent = `🐢 Relaxed pace: ${s.relaxed ? 'on (monsters wait for you)' : 'off'}`;
  $('set-keyboard').textContent = `⌨️ On-screen keyboard: ${{ auto: coarse ? 'auto (on)' : 'auto (lessons only)', on: 'always', off: 'off' }[s.keyboard]}`;
  $('set-forgiving').textContent = `🔠 Forgiving capitals: ${s.forgiving ? 'on' : 'off'}`;
}

function toggleSound() {
  save.settings.sound = !save.settings.sound;
  sound.unlock();
  sound.setMuted(!save.settings.sound);
  persist();
  updateSoundButtons();
}

function toggleMusic() {
  save.settings.music = !save.settings.music;
  sound.unlock();
  sound.setMusic(save.settings.music);
  persist();
  updateSoundButtons();
}

// ------------------------------------------------------------ wiring

function play() {
  if (save.who === null || save.who === undefined) return openMenu('who');
  startStage(STAGES[nextStageIndex(save)]);
}

$('btn-play').addEventListener('click', play);
$('btn-map').addEventListener('click', () => openMenu('map'));
$('btn-lessons').addEventListener('click', () => openMenu('lessons'));
$('btn-daily').addEventListener('click', () => startStage(makeDaily(today(), currentTier(save))));
$('btn-wardrobe').addEventListener('click', () => openMenu('wardrobe'));
$('btn-bestiary').addEventListener('click', () => openMenu('bestiary'));
$('btn-stats').addEventListener('click', () => openMenu('stats'));
$('btn-settings').addEventListener('click', () => openMenu('settings'));
for (const b of document.querySelectorAll('.who')) {
  b.addEventListener('click', () => {
    const first = save.who === null || save.who === undefined;
    save.who = Number(b.dataset.who);
    persist();
    log.event('who.chosen', { who: save.who });
    attract = null;
    if (first) startStage(STAGES[nextStageIndex(save)]);
    else toTitle();
  });
}
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', goBack);
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleSound);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
$('set-relaxed').addEventListener('click', () => { save.settings.relaxed = !save.settings.relaxed; persist(); updateSoundButtons(); });
$('set-keyboard').addEventListener('click', () => {
  const order = ['auto', 'on', 'off'];
  save.settings.keyboard = order[(order.indexOf(save.settings.keyboard) + 1) % 3];
  persist();
  updateSoundButtons();
});
$('set-forgiving').addEventListener('click', () => { save.settings.forgiving = !save.settings.forgiving; persist(); updateSoundButtons(); });
$('set-who').addEventListener('click', () => openMenu('who'));
$('btn-mute').addEventListener('click', toggleSound);
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startStage(stage, { retry: true }));
$('btn-pause-map').addEventListener('click', () => openMenu(stage?.lesson ? 'lessons' : 'map'));
$('btn-next').addEventListener('click', () => {
  const next = nextFor(stage);
  if (next) startStage(next);
  else openMenu(stage?.lesson ? 'lessons' : 'map');
});
$('btn-again').addEventListener('click', () => startStage(stage, { retry: true }));
$('btn-res-map').addEventListener('click', () => openMenu(stage?.lesson ? 'lessons' : 'map'));
$('btn-retry').addEventListener('click', () => startStage(stage, { retry: true }));
$('btn-fail-map').addEventListener('click', () => openMenu(stage?.lesson ? 'lessons' : 'map'));

let resizeQueued = false;
addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => { resizeQueued = false; renderer.resize(); });
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });

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
  sound.unlock();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (mode === 'play') {
    if (e.key === 'Escape') { e.preventDefault(); pause(); return; }
    if (e.key === 'Enter') { e.preventDefault(); doSpecial(); return; }
    if (e.key.length === 1) {
      e.preventDefault();
      if (!e.repeat) handleChar(e.key);
    }
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); goBack(); return; }
  if (mode === 'results' && e.key === ' ') { e.preventDefault(); startStage(stage, { retry: true }); return; }
  if (mode === 'results' && e.key === 'Enter' && document.activeElement === document.body) { e.preventDefault(); $('btn-next').click(); return; }
  if (mode === 'fail' && e.key === 'Enter' && document.activeElement === document.body) { e.preventDefault(); $('btn-retry').click(); return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
});

// Hide the pointer after 2 s without movement while playing.
let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

// ------------------------------------------------------------ loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, stage: stage ? stage.id : 'none', monsters: (battle || attract?.battle)?.monsters.length ?? 0 }),
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
  updatePointer(dt);

  if (mode === 'play' && battle) {
    if (bot) bot.update(battle, dt);
    battle.step(dt);
    processEvents(battle.events);
    renderer.handleEvents(battle.events);
    battle.events.length = 0;
    if (stage.lesson) keyboard.hint(battle.nextChar());
    if (battle.status !== 'play') {
      endTimer += dt;
      if (endTimer > (battle.status === 'cleared' ? 0.9 : 0.8)) {
        if (battle.status === 'cleared') onCleared(); else onFailed();
      }
    }
  } else if (!battle && attract) {
    const a = attract;
    a.bot.update(a.battle, dt);
    a.battle.step(dt);
    renderer.handleEvents(a.battle.events);
    a.battle.events.length = 0;
    if (a.battle.status !== 'play') newAttract();
  }
  if (mode !== 'paused') renderer.update(dt);
  const shown = battle || attract?.battle || null;
  renderer.draw(shown, {
    attract: !battle,
    stageName: stage ? (stage.lesson ? `Lesson ${stage.index + 1}: ${stage.name}` : stage.name) : '',
    touch: onTouchKeyboard(),
    showMeter: true,
  });
  requestAnimationFrame(loop);
}

const loop = telemetry ? telemetry.guard(frame, 'keyboard-knights.frame') : frame;

if (location.protocol !== 'file:') {
  log.event('game.ready', { stars: totalStars(save), 'wpm.best': save.bestWpm, who: save.who ?? -1, touch: coarse });
  const jump = params.get('stage');
  const st = jump === 'daily' ? makeDaily(today(), currentTier(save)) : jump ? stageById(jump) : null;
  if (st) startStage(st);
  else if (params.get('screen')) openMenu(params.get('screen'));
  else toTitle();
  requestAnimationFrame(loop);
}

window.KK = {
  get battle() { return battle; }, get mode() { return mode; }, get stage() { return stage; },
  save, startStage, stageById, renderer, sound, keyboard, STAGES_PER_REGION,
};
