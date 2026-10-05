// Browser entry: screens, the audio-locked clock, input, saves and the loop.
import { SONGS, STYLES, DIFFICULTY_NAMES, songById } from './songs.js';
import { buildChart } from './chart.js';
import { songEvents } from './music.js';
import { secondsPerBeat } from './timeline.js';
import { Session } from './play.js';
import { Autoplayer } from './autoplay.js';
import { Garden } from './garden.js';
import { heardSongTime, judgedTime, displayTime, estimateOffset, clampOffset } from './timing.js';
import { finalScore } from './score.js';
import { loadSave, writeSave, recordResult, checkUnlocks, isSongUnlocked, DECORATIONS, SKINS, SAVE_KEY } from './progress.js';
import { Renderer, laneStyle } from './render.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

// Reading `localStorage` throws when the browser blocks site storage.
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
const lanesParam = params.get('lanes') === '3' || params.get('lanes') === '4' ? Number(params.get('lanes')) : null;
if (lanesParam) save.lanes = lanesParam;
let saveWarned = false;
function persist() {
  // ?autoplay is a browser check: its runs must not land in the real save.
  if (params.has('autoplay')) return;
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const isReduced = () => save.motion === 'reduced' || (save.motion === 'auto' && motionQuery.matches);

const canvas = $('game');
const renderer = new Renderer(canvas, { reduced: isReduced() });
const audio = new Audio({ muted: save.muted });
const input = new Input(canvas, { laneAt: (x) => renderer.laneAt(x), onLane });
input.setLanes(save.lanes);

let mode = 'title'; // title | songs | options | calibrate | garden | play | paused | resuming | results
let run = null;
let resumeAt = 0;
let lastResult = null;
let difficulty = save.last.difficulty;
let tempo = 1;
const autoplayRun = params.has('autoplay');

const SCREENS = ['screen-title', 'screen-songs', 'screen-options', 'screen-calibrate', 'screen-garden', 'screen-pause', 'screen-results'];

function visibleDecor() {
  return save.decor.filter((id) => !save.hiddenDecor.includes(id));
}

function configureRenderer() {
  renderer.configure({ lanes: save.lanes, skin: save.skin, speed: save.speed, decor: visibleDecor(), reduced: isReduced() });
  document.body.classList.toggle('calm', isReduced());
}
configureRenderer();

// The results card ignores clicks for a moment after it appears, so a player
// still mashing Space, A or the lanes doesn't skip straight past it.
const RESULT_GUARD_MS = 800;
let resultsShownAt = -Infinity;
addEventListener('click', (e) => {
  if (mode === 'results' && performance.now() - resultsShownAt < RESULT_GUARD_MS) { e.preventDefault(); e.stopPropagation(); }
}, { capture: true });

function showScreen(id) {
  if (id === 'screen-results') resultsShownAt = performance.now();
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const playing = mode === 'play' || mode === 'resuming';
  $('hud-buttons').classList.toggle('hidden', !playing);
  input.playing = mode === 'play' && !(run && run.attract);
  input.tapAnywhere = mode === 'calibrate' ? calTap : null;
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .song:not([disabled]), .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  audio.setMusicLevel(playing ? 1 : mode === 'results' ? 0.6 : 0.45);
}

// ------------------------------------------------------------ the clock

/** The song time the player is hearing at a performance.now() instant. */
function heardAt(perfMs = performance.now()) {
  if (!run) return 0;
  const c = run.clock;
  if (c.kind === 'audio') return heardSongTime(audio.timeAt(perfMs), c.start, audio.latency);
  return ((c.pausedAt ?? perfMs) - c.start) / 1000;
}

// ------------------------------------------------------------ runs

function startRun(song, diff, { tempoScale = 1, attract = false } = {}) {
  if (!attract) audio.unlock();
  if (run && audio.songBus) audio.stopSong(attract ? 0.6 : 0.15);
  const chart = buildChart(song, diff, { lanes: save.lanes, tempoScale });
  const practice = tempoScale < 1;
  const session = new Session(chart, { noFail: attract || practice || save.noFail });
  const garden = new Garden(song.id, chart.judgements);
  const spb = secondsPerBeat(song, tempoScale);
  const beats = STYLES[song.style].beats;
  const lead = beats * spb + 0.7;
  let clock;
  if (audio.live) {
    const start = audio.ctx.currentTime + lead;
    clock = { kind: 'audio', start };
    audio.startSong(song.style, songEvents(song, { tempoScale }), start);
  } else {
    clock = { kind: 'perf', start: performance.now() + lead * 1000, pausedAt: null };
  }
  run = {
    song, difficulty: diff, tempoScale, practice, attract, chart, session, garden, clock, spb, beats,
    pilot: attract || autoplayRun ? new Autoplayer(chart) : null,
    started: performance.now(), endedAt: null, finished: false, judged: -1,
  };
  run.beatTimes = (from, to, cb) => {
    for (let b = Math.max(-beats, Math.floor(from / spb)); b * spb <= to; b++) cb(b * spb, ((b % beats) + beats) % beats === 0);
  };
  hud.title = `${song.title} · ${DIFFICULTY_NAMES[diff]}${practice ? ` · practice ${Math.round(tempoScale * 100)}%` : ''}`;
  hud.badge = practice ? 'Practice' : '';
  hud.combo = 0;
  hud.health = attract || session.noFail ? null : 1;
  updateHudText();
  renderer.configure({ lanes: save.lanes });
  input.setLanes(save.lanes);
  queueMicrotask(() => monitor.mark(performance.now(), attract ? 'attract' : 'song'));
  if (!attract) {
    save.last = { song: song.id, difficulty: diff };
    persist();
    log.event('level.start', { song: song.id, difficulty: diff, lanes: save.lanes, practice, tempo: tempoScale, clock: clock.kind, 'no_fail': session.noFail });
  }
}

function attract() {
  const pool = SONGS.filter((s) => isSongUnlocked(save, s.id));
  const song = pool[Math.floor(Math.random() * pool.length)];
  startRun(song, 'normal', { attract: true });
}

function playSong(song, diff = difficulty, tempoScale = tempo) {
  audio.blip('start');
  startRun(song, diff, { tempoScale });
  mode = 'play';
  input.clear();
  showScreen(null);
}

// Record a play once. The frame loop calls this as soon as the last note is
// judged, so pausing during the outro and leaving still keeps the song.
function commitRun(r) {
  if (r.record) return r.record;
  const results = r.session.results();
  const seconds = Math.round((performance.now() - r.started) / 1000);
  const rec = recordResult(save, { songId: r.song.id, difficulty: r.difficulty, practice: r.practice, results });
  persist();
  const attrs = { song: r.song.id, difficulty: r.difficulty, grade: results.grade, accuracy: Math.round(results.accuracy * 1000) / 10, score: results.score, 'combo.max': results.maxCombo, perfect: results.counts.perfect, miss: results.counts.miss, practice: r.practice, lanes: save.lanes, time: seconds, 'best.new': rec.newBest };
  if (results.failed) log.event('level.fail', { song: r.song.id, difficulty: r.difficulty, accuracy: attrs.accuracy, time: seconds });
  else log.event('level.complete', attrs);
  for (const u of rec.unlocks) log.event('unlock', { type: u.type, id: u.id });
  if (rec.unlocks.length) configureRenderer();
  r.record = { results, rec };
  return r.record;
}

function finishRun() {
  const r = run;
  r.finished = true;
  if (r.attract) { attract(); return; }
  audio.stopSong(1.5);
  const { results, rec } = commitRun(r);
  if (rec.unlocks.length) audio.blip('unlock');
  lastResult = { results, rec, run: r };
  showResults();
}

const GRADE_TEXT = {
  S: ['Super bloom!', 'Every flower is dancing for you!'],
  A: ['Beautiful garden!', 'So close to a super bloom.'],
  B: ['Lovely growing!', 'Your garden is getting lush.'],
  C: ['Every seed counts!', 'Try Easy or practice mode to grow more.'],
};

function showResults() {
  mode = 'results';
  const { results, rec, run: r } = lastResult;
  const g = $('res-grade');
  $('res-song').textContent = `${r.song.title} · ${DIFFICULTY_NAMES[r.difficulty]}${r.practice ? ` · practice ${Math.round(r.tempoScale * 100)}%` : ''}`;
  if (results.failed) {
    g.textContent = 'Wilted';
    g.className = 'grade wilt';
    $('res-title').textContent = 'The garden needs a rest';
  } else {
    g.textContent = results.grade;
    g.className = `grade ${results.grade}`;
    $('res-title').textContent = GRADE_TEXT[results.grade][0];
  }
  $('res-score').textContent = results.score.toLocaleString('en-US') + (rec.newBest && !r.practice ? '  ★ New best!' : '');
  const c = results.counts;
  const lines = [
    ['Accuracy', `${(results.accuracy * 100).toFixed(1)}%`], ['Max combo', results.maxCombo],
    ['Perfect', c.perfect], ['Great', c.great], ['Good', c.good], ['Miss', c.miss],
  ];
  let tip = results.failed ? 'Turn on No-fail in Options to always reach the end.' : results.fullCombo ? (results.allPerfect ? 'All Perfect! Wow!' : 'Full combo: no misses!') : GRADE_TEXT[results.grade][1];
  if (r.practice) tip = 'Practice round: scores are not saved. Try full speed when ready!';
  $('res-lines').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('') + `<div class="tip">${tip}</div>`;
  $('res-unlocks').innerHTML = rec.unlocks.map((u, i) => `<span class="unlock" style="animation-delay:${0.2 + i * 0.12}s">${u.type === 'song' ? '🎵 Song' : u.type === 'skin' ? '✨ Skin' : '🌼'} ${u.name}</span>`).join('');
  const next = nextSong(r.song);
  $('btn-next').disabled = !next;
  $('btn-next').textContent = next ? `Next: ${next.title} →` : 'Next song →';
  input.clear();
  showScreen('screen-results');
}

function nextSong(song) {
  const i = SONGS.indexOf(song);
  for (let k = 1; k < SONGS.length; k++) {
    const s = SONGS[(i + k) % SONGS.length];
    if (isSongUnlocked(save, s.id)) return s;
  }
  return null;
}

function pause() {
  if (mode === 'resuming') { mode = 'paused'; showScreen('screen-pause'); return; } // clock is still frozen
  if (mode !== 'play' || !run || run.attract) return;
  mode = 'paused';
  log.event('song.pause', { song: run.song.id, at: Math.round(heardAt() * 10) / 10 });
  input.releaseAll(performance.now());
  if (run.clock.kind === 'audio') audio.pause();
  else run.clock.pausedAt = performance.now();
  updateSoundButtons();
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  // A short 3-2-1 while the clock is still frozen, then the music picks up.
  mode = 'resuming';
  log.event('song.resume', { song: run.song.id });
  resumeAt = performance.now() + 1500;
  input.clear();
  showScreen(null);
}

function finishResume() {
  mode = 'play';
  input.clear(); // presses made during the 3-2-1 must not fire in a later menu
  if (run.clock.kind === 'audio') audio.resume();
  else if (run.clock.pausedAt !== null) {
    run.clock.start += performance.now() - run.clock.pausedAt;
    run.clock.pausedAt = null;
  }
  showScreen(null);
}

function leaveRun() {
  if (run && !run.attract) {
    if (run.clock.kind === 'audio') audio.resume();
    if (!run.finished && !run.record) log.event('level.quit', { song: run.song.id, difficulty: run.difficulty, judged: run.session.judged });
    audio.stopSong(0.3);
    run = null;
  }
}

// ------------------------------------------------------------ input

function onLane(lane, down, perfMs) {
  if (!run || run.attract || mode !== 'play') return;
  const t = judgedTime(heardAt(perfMs), save.inputOffsetMs);
  if (down) run.session.press(lane, t);
  else run.session.release(lane, t);
}

// ------------------------------------------------------------ screens

function toTitle() {
  leaveRun();
  mode = 'title';
  if (!run) attract();
  updateTitleInfo();
  updateSoundButtons();
  showScreen('screen-title');
}

function updateTitleInfo() {
  const done = Object.keys(save.best).length;
  $('title-info').textContent = save.stats.clears ? `${save.songs.length} of ${SONGS.length} songs open · ${save.decor.length} decorations · ${done} songs grown` : 'Twelve songs to grow. Start with any of the first four!';
}

function setChecked(groupId, attr, value) {
  for (const b of $(groupId).querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset[attr] === String(value)));
}

function toSongs() {
  audio.unlock();
  leaveRun();
  if (!run) attract();
  mode = 'songs';
  setChecked('seg-difficulty', 'diff', difficulty);
  setChecked('seg-practice', 'tempo', tempo);
  renderSongs();
  showScreen('screen-songs');
  const last = document.querySelector(`#song-grid [data-song="${save.last.song}"]:not([disabled])`);
  last?.focus({ preventScroll: true });
  last?.scrollIntoView({ block: 'nearest' });
}

function fmtTime(s) {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

function renderSongs() {
  const grid = $('song-grid');
  grid.innerHTML = '';
  $('songs-count').textContent = `${save.songs.length} / ${SONGS.length} open`;
  for (const song of SONGS) {
    const open = isSongUnlocked(save, song.id);
    const b = document.createElement('button');
    b.className = 'song';
    b.dataset.song = song.id;
    b.style.setProperty('--c', song.color);
    b.disabled = !open;
    const len = buildChart(song, 'easy').length;
    const best = save.best[song.id] || {};
    const bests = ['easy', 'normal', 'hard'].map((d) => (best[d] ? `<span class="${best[d].grade}">${DIFFICULTY_NAMES[d][0]} ${best[d].grade}</span>` : '')).join('');
    b.innerHTML = `<b>${song.title}</b><span class="meta">${STYLES[song.style].name} · ${song.bpm} bpm · ${fmtTime(len)}</span>` +
      (open ? `<span class="blurb">${song.blurb}</span><span class="bests">${bests}</span>` : '<span class="lock">🔒 Finish a song to open</span>');
    b.setAttribute('aria-label', `${song.title}, ${STYLES[song.style].name}${open ? '' : ', locked'}`);
    b.addEventListener('click', () => playSong(song));
    grid.appendChild(b);
  }
}

function toOptions() {
  mode = 'options';
  syncOptions();
  showScreen('screen-options');
}

function syncOptions() {
  setChecked('seg-lanes', 'lanes', save.lanes);
  setChecked('seg-nofail', 'nofail', save.noFail ? 'on' : 'off');
  setChecked('seg-speed', 'speed', save.speed);
  setChecked('seg-motion', 'motion', save.motion);
  updateSoundButtons();
}

function toGarden() {
  mode = 'garden';
  renderCollection();
  showScreen('screen-garden');
}

function renderCollection() {
  $('garden-count').textContent = `${save.decor.length} / ${DECORATIONS.length} · ${save.skins.length} / ${SKINS.length} skins`;
  const skins = $('skin-grid');
  skins.innerHTML = '';
  for (const s of SKINS) {
    const owned = save.skins.includes(s.id);
    const b = document.createElement('button');
    b.className = `item${save.skin === s.id ? ' on' : ''}${owned ? '' : ' locked'}`;
    b.disabled = !owned;
    const preview = document.createElement('canvas');
    preview.width = 88; preview.height = 88;
    const pctx = preview.getContext('2d');
    const spr = renderer.bakeNote(laneStyle(4, SKINS.indexOf(s) % 4), renderer.noteSize, s.id, false);
    pctx.drawImage(spr, 0, 0, 88, 88);
    b.appendChild(preview);
    const label = document.createElement('span');
    label.innerHTML = `<b>${s.name}</b><small>${owned ? (save.skin === s.id ? 'In use' : 'Tap to use') : `🔒 ${s.how}`}</small>`;
    b.appendChild(label);
    b.addEventListener('click', () => { save.skin = s.id; persist(); configureRenderer(); renderCollection(); audio.blip('pick'); });
    skins.appendChild(b);
  }
  const decor = $('decor-grid');
  decor.innerHTML = '';
  for (const d of DECORATIONS) {
    const owned = save.decor.includes(d.id);
    const shown = owned && !save.hiddenDecor.includes(d.id);
    const b = document.createElement('button');
    b.className = `item${shown ? ' on' : ''}${owned ? '' : ' locked'}`;
    b.disabled = !owned;
    if (owned) {
      const c = renderer.bakeDecor(d.id);
      c.style.width = '44px'; c.style.height = '44px';
      b.appendChild(c);
    }
    const label = document.createElement('span');
    label.innerHTML = `<b>${owned ? d.name : '???'}</b><small>${owned ? (shown ? 'In the garden' : 'Hidden') : `🔒 ${d.how}`}</small>`;
    b.appendChild(label);
    b.addEventListener('click', () => {
      if (shown) save.hiddenDecor.push(d.id);
      else save.hiddenDecor = save.hiddenDecor.filter((x) => x !== d.id);
      persist();
      configureRenderer();
      renderCollection();
      audio.blip('pick');
    });
    decor.appendChild(b);
  }
}

// ------------------------------------------------------------ calibration

const CAL_GAP = 0.6;
const CAL_BEATS = 16;
const cal = { active: false, beats: [], taps: [], kind: 'perf', origin: 0, flash: 0, previewFrom: 0 };

function calNow(perfMs = performance.now()) {
  if (cal.kind === 'audio') return audio.timeAt(perfMs) - audio.latency;
  return perfMs / 1000;
}

function toCalibrate() {
  audio.unlock();
  leaveRun();
  mode = 'calibrate';
  cal.active = false;
  // A test left half-way must not leave Start stuck on "Listening…".
  $('cal-start').disabled = false;
  $('cal-start').textContent = 'Start';
  cal.kind = audio.running ? 'audio' : 'perf';
  cal.origin = calNow();
  cal.previewFrom = cal.origin;
  cal.nextClick = 0;
  updateCalText();
  showScreen('screen-calibrate');
  $('cal-start').focus({ preventScroll: true });
}

function startCalibration() {
  audio.unlock();
  cal.kind = audio.running ? 'audio' : 'perf';
  const t0 = calNow() + 1.2;
  cal.beats = Array.from({ length: CAL_BEATS }, (_, i) => t0 + i * CAL_GAP);
  cal.taps = [];
  cal.active = true;
  cal.origin = t0;
  if (cal.kind === 'audio') audio.clicks(cal.beats.map((t) => t + audio.latency));
  $('cal-start').textContent = 'Listening…';
  $('cal-start').disabled = true;
  $('cal-result').innerHTML = 'Tap on every click!';
  $('cal-tap').focus({ preventScroll: true });
}

function calTap(perfMs) {
  cal.flash = 1;
  $('cal-tap').classList.add('hit');
  setTimeout(() => $('cal-tap').classList.remove('hit'), 90);
  if (cal.active) cal.taps.push(calNow(perfMs));
}

function finishCalibration() {
  cal.active = false;
  $('cal-start').disabled = false;
  $('cal-start').textContent = 'Try again';
  const est = estimateOffset(cal.taps, cal.beats);
  if (!est) {
    $('cal-result').innerHTML = 'Not enough taps on the clicks. Have another go!';
    return;
  }
  save.inputOffsetMs = est.offsetMs;
  save.calibrated = true;
  const fresh = checkUnlocks(save);
  persist();
  configureRenderer();
  log.event('calibration.saved', { 'input.ms': save.inputOffsetMs, 'visual.ms': save.visualOffsetMs, 'spread.ms': est.spreadMs, taps: est.taps, clock: cal.kind });
  const how = Math.abs(est.offsetMs) < 10 ? 'right on the beat' : est.offsetMs > 0 ? `${est.offsetMs} ms after the click` : `${-est.offsetMs} ms before the click`;
  $('cal-result').innerHTML = `You tap ${how}. Saved! <b>${save.inputOffsetMs} ms</b>${fresh.length ? '<br>🌼 New decoration: Wind chimes' : ''}`;
  if (fresh.length) audio.blip('unlock');
  updateCalText(false);
}

function updateCalText(result = true) {
  if (result) $('cal-result').innerHTML = `Tap timing: <b id="cal-input">${save.inputOffsetMs} ms</b>`;
  $('cal-visual').textContent = `${save.visualOffsetMs > 0 ? '+' : ''}${save.visualOffsetMs} ms`;
}

function nudgeVisual(ms) {
  save.visualOffsetMs = clampOffset(save.visualOffsetMs + ms);
  persist();
  updateCalText(false);
  audio.blip('move');
}

const calCanvas = $('cal-canvas');
const calCtx = calCanvas.getContext('2d');
function drawCalibration() {
  const now = calNow();
  // Keep a gentle click going for the picture check when not tap-testing.
  if (!cal.active && audio.running && cal.kind === 'audio') {
    const k = Math.ceil((now - cal.previewFrom) / CAL_GAP);
    const next = cal.previewFrom + k * CAL_GAP;
    if (k > cal.nextClick && next - now < 0.15) {
      cal.nextClick = k;
      audio.clicks([next + audio.latency]);
    }
  }
  if (cal.active && now > cal.beats[cal.beats.length - 1] + 0.6) finishCalibration();
  const vis = displayTime(now, save.visualOffsetMs);
  const from = cal.active ? cal.origin : cal.previewFrom;
  const phase = ((((vis - from) / CAL_GAP) % 1) + 1) % 1;
  const W = calCanvas.width, H = calCanvas.height, lineY = H - 30;
  calCtx.clearRect(0, 0, W, H);
  calCtx.fillStyle = 'rgba(160,255,170,0.7)';
  calCtx.fillRect(20, lineY - 2, W - 40, 4);
  const y = 14 + phase * (lineY - 14);
  calCtx.fillStyle = '#E69F00';
  calCtx.beginPath();
  calCtx.arc(W / 2, y, 14, 0, Math.PI * 2);
  calCtx.fill();
  calCtx.strokeStyle = '#fff';
  calCtx.lineWidth = 3;
  calCtx.stroke();
  if (phase > 0.9 || phase < 0.08) {
    calCtx.strokeStyle = 'rgba(255,255,255,0.7)';
    calCtx.beginPath();
    calCtx.arc(W / 2, lineY, 22, 0, Math.PI * 2);
    calCtx.stroke();
  }
  if (cal.flash > 0) {
    calCtx.globalAlpha = cal.flash;
    calCtx.fillStyle = '#ffd23f';
    calCtx.beginPath();
    calCtx.arc(W / 2, lineY, 26, 0, Math.PI * 2);
    calCtx.fill();
    calCtx.globalAlpha = 1;
    cal.flash = Math.max(0, cal.flash - 0.08);
  }
  if (cal.active) {
    calCtx.fillStyle = '#fff';
    calCtx.font = '800 14px system-ui, sans-serif';
    calCtx.textAlign = 'left';
    calCtx.fillText(`taps ${cal.taps.length}`, 10, 18);
  }
}

// ------------------------------------------------------------ sound buttons

function updateSoundButtons() {
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = save.muted ? '🔇 Sound off' : '🔊 Sound on';
}

function toggleMute() {
  save.muted = !save.muted;
  audio.unlock();
  audio.setMuted(save.muted);
  persist();
  updateSoundButtons();
}

// ------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', toSongs);
$('btn-options').addEventListener('click', toOptions);
$('btn-garden').addEventListener('click', toGarden);
$('btn-calibrate').addEventListener('click', toCalibrate);
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => {
  const r = run;
  if (r.clock.kind === 'audio') audio.resume();
  log.event('level.restart', { song: r.song.id, difficulty: r.difficulty });
  playSong(r.song, r.difficulty, r.tempoScale);
});
$('btn-pause-songs').addEventListener('click', toSongs);
$('btn-again').addEventListener('click', () => { const r = lastResult.run; playSong(r.song, r.difficulty, r.tempoScale); });
$('btn-next').addEventListener('click', () => { const n = nextSong(lastResult.run.song); if (n) playSong(n, lastResult.run.difficulty, lastResult.run.tempoScale); });
$('btn-res-songs').addEventListener('click', () => { run = null; toSongs(); });
$('cal-start').addEventListener('click', startCalibration);
$('cal-tap').addEventListener('pointerdown', (e) => { e.preventDefault(); calTap(e.timeStamp); });
$('cal-earlier').addEventListener('click', () => nudgeVisual(5));
$('cal-later').addEventListener('click', () => nudgeVisual(-5));
$('cal-reset').addEventListener('click', () => { save.inputOffsetMs = 0; save.visualOffsetMs = 0; persist(); updateCalText(); });
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => back());
for (const b of $('seg-difficulty').querySelectorAll('button')) b.addEventListener('click', () => { difficulty = b.dataset.diff; setChecked('seg-difficulty', 'diff', difficulty); audio.blip('move'); });
for (const b of $('seg-practice').querySelectorAll('button')) b.addEventListener('click', () => { tempo = Number(b.dataset.tempo); setChecked('seg-practice', 'tempo', tempo); audio.blip('move'); });
for (const b of $('seg-lanes').querySelectorAll('button')) b.addEventListener('click', () => { save.lanes = Number(b.dataset.lanes); persist(); setChecked('seg-lanes', 'lanes', save.lanes); configureRenderer(); input.setLanes(save.lanes); attract(); audio.blip('move'); });
for (const b of $('seg-nofail').querySelectorAll('button')) b.addEventListener('click', () => { save.noFail = b.dataset.nofail === 'on'; persist(); setChecked('seg-nofail', 'nofail', b.dataset.nofail); audio.blip('move'); });
for (const b of $('seg-speed').querySelectorAll('button')) b.addEventListener('click', () => { save.speed = Number(b.dataset.speed); persist(); setChecked('seg-speed', 'speed', save.speed); configureRenderer(); audio.blip('move'); });
for (const b of $('seg-motion').querySelectorAll('button')) b.addEventListener('click', () => { save.motion = b.dataset.motion; persist(); setChecked('seg-motion', 'motion', save.motion); configureRenderer(); audio.blip('move'); });
motionQuery.addEventListener?.('change', configureRenderer);
// Another tab saved: take its progress, so this tab never writes a stale copy
// over it. A song in progress keeps going and records into the fresh copy.
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY && e.key !== null) return;
  const fresh = loadSave(storage);
  if (lanesParam) fresh.lanes = lanesParam;
  if (run && !run.attract) fresh.lanes = save.lanes; // keep the lanes of the song being played
  for (const key of Object.keys(save)) delete save[key];
  Object.assign(save, fresh);
  audio.setMuted(save.muted);
  updateSoundButtons();
  if (!run || run.attract) { configureRenderer(); input.setLanes(save.lanes); }
  if (mode === 'title') updateTitleInfo();
  else if (mode === 'songs') renderSongs();
  else if (mode === 'garden') renderCollection();
  else if (mode === 'options') syncOptions();
  else if (mode === 'calibrate') updateCalText(!cal.active);
});
addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// The first gesture unlocks sound; the title demo restarts with music.
function firstGesture() {
  removeEventListener('pointerdown', firstGesture, true);
  removeEventListener('keydown', firstGesture, true);
  audio.unlock();
  setTimeout(() => {
    if (run && run.attract && run.clock.kind === 'perf' && audio.running) attract();
  }, 60);
}
addEventListener('pointerdown', firstGesture, true);
addEventListener('keydown', firstGesture, true);

// Arrow keys / d-pad move focus between buttons in menus.
function moveFocus(dir) {
  const screen = SCREENS.map($).find((s) => !s.classList.contains('hidden'));
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not([disabled]), a[href]')].filter((el) => el.offsetParent !== null);
  const outside = document.querySelector('.arcade-link');
  if (screen.id === 'screen-title' && outside) items.unshift(outside);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
  audio.blip('move');
}
addEventListener('keydown', (e) => {
  if (mode === 'play' || mode === 'resuming' || mode === 'calibrate') return;
  if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
});

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'options' || mode === 'garden' || mode === 'calibrate' || mode === 'songs') toTitle();
  else if (mode === 'results') { run = null; toSongs(); }
}

// ------------------------------------------------------------ HUD

const hud = { title: '', scoreText: '0', accText: '100.0%', badge: '', combo: 0, health: null, progress: 0, countdown: '', hint: '' };
const COUNT = ['', '1', '2', '3', '4'];

function updateHudText() {
  const s = run.session;
  hud.scoreText = finalScore(s.counts, s.maxCombo, s.total).toLocaleString('en-US');
  hud.accText = `${(s.accuracy * 100).toFixed(1)}%`;
}

function controlsHint() {
  if (input.pointerType === 'touch' || input.pointerType === 'pen') return 'Tap the lanes as the shapes reach the vine';
  if (input.hasPad) return save.lanes === 3 ? 'D-pad ← ↓ →  or  X A B' : 'D-pad ← ↓ ↑ →  or  X A Y B';
  return save.lanes === 3 ? 'Keys  D  F/J  K   or   ←  ↓  →' : 'Keys  D  F  J  K   or   ←  ↓  ↑  →';
}

// ------------------------------------------------------------ loop

// Hide the pointer after ~2 s without movement during play.
let pointerIdle = 0;
addEventListener('pointermove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', (mode === 'play' || mode === 'resuming') && pointerIdle > 2);
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, song: run ? run.song.id : 'none', attract: !!run?.attract, clock: run ? run.clock.kind : 'none', notes: run ? run.chart.notes.length : 0 }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

const frameState = { session: null, chart: null, garden: null, visT: 0, beat: 0, beatTimes: null, down: (l) => input.isDown(l), showHighway: true, hud };
let last = performance.now();

function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.pollPad();
  updatePointer(dt);
  audio.pump();

  const esc = input.consume('Escape');
  if (esc || input.consume('KeyP') || input.consumePad('start')) {
    if (mode === 'play') pause();
    else if (mode === 'paused') resume();
    else if (esc) back();
  }
  if (input.consume('KeyM')) toggleMute();
  if (mode !== 'play' && mode !== 'resuming') {
    if (input.consumePad('up') || input.consumePad('left')) moveFocus(-1);
    if (input.consumePad('down') || input.consumePad('right')) moveFocus(1);
    if (input.consumePad('a')) document.activeElement?.click?.();
    if (input.consumePad('b')) back();
  }
  if (mode === 'resuming' && now >= resumeAt) finishResume();
  if (mode === 'calibrate') drawCalibration();

  hud.countdown = '';
  hud.hint = '';
  if (run) {
    const s = run.session;
    const heard = heardAt(now);
    const visT = displayTime(heard, save.visualOffsetMs);
    const live = !run.finished && (mode === 'play' || run.attract);
    if (live) {
      if (run.pilot) run.pilot.drive(s, run.attract ? visT : judgedTime(heard, save.inputOffsetMs));
      s.update(run.attract ? visT : judgedTime(heard, save.inputOffsetMs));
      const events = s.events;
      if (events.length) {
        renderer.handle(events);
        run.garden.handle(events, s);
        if (!run.attract) {
          for (const ev of events) if (ev.type === 'combo') audio.blip('combo');
        }
        events.length = 0;
      }
      if (s.judged !== run.judged) { run.judged = s.judged; updateHudText(); }
      if (!run.attract && !run.record && !s.failed && s.judged >= s.total) commitRun(run);
      hud.combo = s.combo;
      if (hud.health !== null) hud.health = s.health;
      const done = (s.finished && heard > run.chart.length + 0.4) || heard > run.chart.length + 3 || (s.failed && (run.endedAt ??= now) && now - run.endedAt > 1200);
      if (done) finishRun();
    }
    if (run) {
      for (const plant of run.garden.update(dt)) renderer.bloomBurst(plant);
      hud.progress = Math.max(0, heard / run.chart.length);
      if (mode === 'resuming') hud.countdown = String(Math.ceil((resumeAt - now) / 500));
      else if (!run.attract && visT < 0 && mode === 'play') {
        const n = Math.ceil(-visT / run.spb);
        hud.countdown = n <= run.beats ? COUNT[n] : '';
      }
      if (!run.attract && mode === 'play' && visT < 2.5 && (save.stats.plays < 3 || run.practice)) hud.hint = controlsHint();
      frameState.session = s;
      frameState.chart = run.chart;
      frameState.garden = run.garden;
      frameState.visT = visT;
      frameState.beat = visT / run.spb;
      frameState.beatTimes = run.beatTimes;
      frameState.showHighway = mode !== 'results' && mode !== 'garden';
      frameState.hud = mode === 'play' || mode === 'paused' || mode === 'resuming' ? hud : null;
    }
  }
  if (mode !== 'paused') renderer.update(dt);
  renderer.draw(frameState);
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture.
const loop = telemetry ? telemetry.guard(frame, 'groove-garden.frame') : frame;

if (location.protocol !== 'file:') {
  log.event('game.ready', { songs: save.songs.length, decor: save.decor.length, lanes: save.lanes, calibrated: save.calibrated, audio: audio.available });
  const direct = songById(params.get('song') || '');
  if (direct && isSongUnlocked(save, direct.id)) {
    const d = ['easy', 'normal', 'hard'].includes(params.get('difficulty')) ? params.get('difficulty') : difficulty;
    const tp = Number(params.get('tempo'));
    playSong(direct, d, tp === 0.5 || tp === 0.75 ? tp : 1);
  } else toTitle();
  requestAnimationFrame(loop);
}

window.GG = {
  get run() { return run; }, get mode() { return mode; }, save, audio, renderer, input,
  playSong: (id, d = 'easy', t = 1) => playSong(songById(id), d, t),
  finish: () => run && finishRun(),
  get heard() { return heardAt(); },
  get cal() { return cal; },
  calNow: () => calNow(),
};
