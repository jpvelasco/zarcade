// Browser entry: screens, sessions (Grand Prix, Time Trial, Daily Dash and
// the title's attract race), the fixed-step loop, input, sound and saves.
import { addDecorations, buildTrack } from './track.js';
import { CUPS, TRACKS, trackById, tracksOfCup } from './tracks.js';
import { KARTS, RACERS, STATS, STAT_LABELS, kartById, pickRivals, racerById } from './karts.js';
import { Race, STEP, POINTS } from './race.js';
import { CLASSES, Driver, classById } from './ai.js';
import { ITEMS, ITEM_IDS } from './items.js';
import { KART, topSpeed } from './kart.js';
import { MEDALS, medalFor, referenceSteps } from './reference.js';
import { dateKey, dailySeed, generateTrackSteps, recordDaily, streakLabel } from './daily.js';
import { decodeGhost, encodeGhost } from './ghost.js';
import {
  SAVE_KEY, bestTrophy, claimUnlocks, isCupOpen, isKartUnlocked, isRacerUnlocked, loadSave, recordCup,
  recordMedal, recordTrackTimes, totalMedals, unlockHint, writeSave, TROPHY_NAMES,
} from './progress.js';
import { formatTime, mulberry32, ordinal, hashString } from './math.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { drawFace, drawItemIcon, drawPortrait } from './sprites.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const AUTOPLAY = params.has('autoplay') || params.has('autopilot');
const DEBUG_LAPS = Number(params.get('laps')) || null;

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

// ------------------------------------------------------------ save

const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
let saveWarned = false;
function persist() {
  // ?autoplay is a browser check; ?laps a quick-finish check: neither may
  // touch the real save.
  if (AUTOPLAY || DEBUG_LAPS) return;
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

// ------------------------------------------------------------ systems

const canvas = $('game');
const renderer = new Renderer(canvas, {
  reducedMotion: reduced,
  onQuality: (info) => log.warn('perf.quality', info),
});
renderer.camera = params.get('camera') === 'fixed' ? 'fixed' : save.settings.camera;
const input = new Input({ canvas, knob: $('steer-knob'), base: $('steer-base'), driftBtn: $('tb-drift'), itemBtn: $('tb-item') });
const sound = new Sound({ muted: save.settings.muted, music: save.settings.music });

let mode = 'title'; // title | menu | loading | play | paused | results | cup | ttresult
let session = null; // the race being played (or the attract race)
let accumulator = 0;
const jobs = []; // chunked work, one at a time: { it, done }
let pendingCup = null; // cup chosen, waiting for the garage
let lastScreen = 'screen-title';
const refs = new Map(); // trackId -> reference lap (medal targets + gold ghost)
let dailyDef = null;
let dailyKey = '';

const SCREENS = ['screen-title', 'screen-gp', 'screen-garage', 'screen-tt', 'screen-daily', 'screen-trophies', 'screen-options', 'screen-loading', 'screen-pause', 'screen-results', 'screen-cup', 'screen-ttresult'];
const RESULT_SCREENS = ['screen-results', 'screen-cup', 'screen-ttresult'];
const RESULT_GUARD_MS = 700;
let shownAt = 0;
let shownId = null;
let heldOnOpen = new Set();

function showScreen(id) {
  shownAt = performance.now();
  shownId = id;
  if (id && RESULT_SCREENS.includes(id)) heldOnOpen = new Set(input.keys);
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const playing = mode === 'play';
  $('hud').classList.toggle('hidden', !(playing || mode === 'paused'));
  $('touch').classList.toggle('hidden', !(playing && input.mode === 'touch'));
  input.enabled = playing;
  input.clear();
  if (id) {
    // Cards replace any race messages still on screen.
    hideBanner();
    $('toast').classList.remove('show');
    $('intro').classList.add('hidden');
    toastTimer = introTimer = 0;
    focusFirst(id);
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(playing ? 0.85 : mode === 'paused' ? 0.3 : 0.55);
}

// The main choice on each screen gets focus, so Enter or pad A picks it.
const FOCUS_ORDER = ['.btn.primary:not([disabled])', '.cup:not(.locked)', '.tt-track:not([disabled])', '.pick.on', '.btn.toggle', '.btn:not([disabled])'];
let returnFocus = null;
function focusFirst(id) {
  const root = $(id);
  if (id === 'screen-title' && returnFocus && root.contains(returnFocus)) {
    returnFocus.focus({ preventScroll: true });
    returnFocus = null;
    return;
  }
  for (const sel of FOCUS_ORDER) {
    const el = root.querySelector(sel);
    if (el && el.offsetParent !== null) { el.focus({ preventScroll: true }); return; }
  }
}

// ------------------------------------------------------------ chunked jobs

function runJob(it, done) {
  jobs.push({ it, done });
}

// Runs queued work for about 5 ms a frame; anything heavier than that is
// split by yields so no single frame takes long.
function stepJob() {
  const t0 = performance.now();
  while (jobs.length && performance.now() - t0 < 5) {
    const j = jobs[0];
    const r = j.it.next();
    if (r.done) {
      jobs.shift();
      j.done(r.value);
    }
  }
}

const busy = () => jobs.some((j) => j.start);

// Builds a track over a few frames: road, then scenery.
function* trackSteps(def) {
  yield;
  const track = buildTrack(def, { decor: false });
  yield;
  addDecorations(track);
  yield;
  return track;
}

// A race start: build the track in the background, then begin. Ignores a
// second press while one is already on its way.
function prepare(def, then) {
  if (busy()) return;
  jobs.push({ it: trackSteps(def), done: then, start: true });
}

function referenceFor(track, done) {
  const hit = refs.get(track.id);
  if (hit) return done(hit);
  runJob(referenceSteps(track, { chunk: 90 }), (r) => {
    refs.set(track.id, r);
    done(r);
  });
}

// ------------------------------------------------------------ sessions

function makeSession(kind, track, race, extra = {}) {
  return {
    kind, track, race, recorded: false, finishedAt: null, resultShown: false,
    ghost: null, ghostLap: 0, ghostLabel: '', targets: null, map: null, lapBest: null,
    tipShown: false, wrongShown: false, ...extra,
  };
}

let attractPending = false;
function startAttract() {
  if (attractPending) return;
  attractPending = true;
  const open = TRACKS.filter((t) => isCupOpen(save, t.cup));
  const rng = mulberry32((Date.now() & 0xffffff) ^ 0x5151);
  const def = open[Math.floor(rng() * open.length)] || TRACKS[0];
  runJob(trackSteps(def), (track) => {
    attractPending = false;
    // A race may have started (or be starting) meanwhile: no demo then.
    if (mode === 'play' || mode === 'paused' || mode === 'loading' || busy()) return;
    beginAttract(track, rng);
  });
}

function beginAttract(track, rng) {
  const racers = [...RACERS].sort(() => rng() - 0.5).slice(0, 6);
  const race = new Race({ track, entrants: racers.map((r) => ({ racer: r, kart: kartById(r.kart) })), mode: 'attract', seed: Math.floor(rng() * 1e9), classId: 'zippy' });
  race.clock = -0.05; // the demo skips the countdown
  session = makeSession('attract', track, race);
  renderer.setTrack(track);
  renderer.focus = Math.floor(rng() * 6);
  renderer.cam.intro = 0;
  sound.setSong('menu');
  queueMicrotask(() => monitor.mark(performance.now(), 'attract'));
}

function playerEntry() {
  return { racer: racerById(save.racer), kart: kartById(save.kart), player: true };
}

function beginRace(kind, track, race, extra = {}) {
  session = makeSession(kind, track, race, extra);
  renderer.setTrack(track);
  renderer.focus = race.playerIndex;
  renderer.cam.intro = 1.6;
  renderer.camera = params.get('camera') === 'fixed' ? 'fixed' : save.settings.camera;
  session.driver = AUTOPLAY ? new Driver('ace', { seed: 99, skill: 1, index: race.playerIndex }) : null;
  mode = 'play';
  accumulator = 0;
  showScreen(null);
  hideBanner();
  updateHud(true);
  showIntro(extra.introSub || '', track.name);
  sound.unlock();
  sound.setSong(track.theme);
  queueMicrotask(() => monitor.mark(performance.now()));
  log.event('level.start', {
    mode: kind, track: track.id, class: race.cls.id, racer: save.racer, kart: save.kart,
    ...(kind === 'gp' ? { cup: CUPS[save.gp.cup].id, race: save.gp.race + 1 } : {}),
  });
}

// ---- Grand Prix

function newGp(cup, classId) {
  const rng = mulberry32((Date.now() ^ (cup * 977)) >>> 0);
  const rivals = pickRivals(save.racer, rng);
  save.gp = {
    cup, classId, race: 0,
    racers: [save.racer, ...rivals.map((r) => r.id)],
    karts: [save.kart, ...rivals.map((r) => r.kart)],
    points: [0, 0, 0, 0, 0, 0],
    places: [],
  };
  persist();
  startGpRace();
}

function gpGrid(gp) {
  const list = gp.racers.map((id, i) => ({ racer: racerById(id), kart: kartById(gp.karts[i]), player: i === 0, idx: i }));
  // First race: the player starts at the back. After that, fewest points
  // at the front, so the leader has to work through the pack.
  if (gp.race === 0) return [...list.slice(1), list[0]];
  return [...list].sort((a, b) => gp.points[a.idx] - gp.points[b.idx] || b.idx - a.idx);
}

function startGpRace() {
  const gp = save.gp;
  if (!gp) return toTitle();
  // Keep the player's current pick for the next race of the cup.
  gp.racers[0] = save.racer;
  gp.karts[0] = save.kart;
  const def = tracksOfCup(gp.cup)[gp.race];
  prepare(def, (track) => {
    if (save.gp !== gp) return;
    const grid = gpGrid(gp);
    const seed = (hashString(`${def.id}:${gp.race}`) ^ (Date.now() & 0xfffff)) >>> 0;
    const race = new Race({ track, entrants: grid, mode: 'gp', classId: gp.classId, seed, laps: DEBUG_LAPS });
    beginRace('gp', track, race, {
      map: grid.map((e) => e.idx),
      introSub: `${CUPS[gp.cup].name} · Race ${gp.race + 1} of 4 · ${classById(gp.classId).name}`,
    });
  });
}

// ---- Time Trial and Daily Dash

function startTimeTrial(trackId) {
  const def = trackById(trackId) || TRACKS[0];
  if (busy()) return;
  showLoading('Measuring the gold lap…', def.name);
  prepare(def, (track) => referenceFor(track, (ref) => {
    const mine = save.ghosts[def.id] ? decodeGhost(save.ghosts[def.id]) : null;
    launchTrial('tt', track, ref, mine, save.best[def.id]?.lap ?? null);
  }));
}

function startDaily() {
  const key = dateKey();
  if (busy()) return;
  const go = (def) => {
    showLoading('Measuring the gold lap…', def.name);
    prepare(def, (track) => referenceFor(track, (ref) => {
      const d = save.daily;
      const mine = d.day === key && d.ghost ? decodeGhost(d.ghost) : null;
      launchTrial('daily', track, ref, mine, d.day === key ? d.best : null, { key });
    }));
  };
  if (dailyDef && dailyKey === key) return go(dailyDef);
  showLoading("Building today's track…", key);
  runJob(generateTrackSteps(dailySeed(key), { id: `daily-${key}` }), (def) => {
    dailyDef = def;
    dailyKey = key;
    go(def);
  });
}

function launchTrial(kind, track, ref, mine, bestLap, extra = {}) {
  const race = new Race({ track, entrants: [playerEntry()], mode: 'tt', items: false, classId: 'zippy', seed: 1, laps: DEBUG_LAPS });
  const ghost = mine || (ref.ghost ? Float32Array.from(ref.ghost.samples) : null);
  beginRace(kind, track, race, {
    ...extra,
    ghost,
    ghostLabel: mine ? 'your best lap' : 'the gold ghost',
    ghostRacer: mine ? racerById(save.racer) : racerById('ollie'),
    ghostKart: mine ? save.kart : 'buggy',
    targets: ref.targets,
    lapBest: bestLap,
    introSub: kind === 'daily' ? `Daily Dash · ${extra.key}` : 'Time Trial · 3 laps',
  });
}

function restartRace() {
  if (!session) return;
  const s = session;
  if (s.kind === 'gp') {
    if (s.recorded) return; // the result is already in the cup
    startGpRace();
  } else if (s.kind === 'tt') startTimeTrial(s.track.id);
  else if (s.kind === 'daily') startDaily();
}

// ------------------------------------------------------------ recording

// Called the moment the player crosses the line (or the race ends without
// them). Everything is saved here, before any celebration plays.
function recordResult() {
  const s = session;
  if (!s || s.recorded) return;
  s.recorded = true;
  const race = s.race;
  const res = race.result || race.freezeResult();
  s.result = res;
  save.stats.races++;
  if (s.kind === 'gp') recordGp(s, res);
  else recordTrial(s, res);
  s.unlocks = claimUnlocks(save);
  for (const u of s.unlocks) log.event('unlock', { id: u });
  persist();
}

function recordGp(s, res) {
  const gp = save.gp;
  if (!gp) return;
  s.gpBefore = gp.points.slice();
  res.order.forEach((kartIndex, place) => { gp.points[s.map[kartIndex]] += POINTS[place] ?? 0; });
  gp.places.push(res.playerPlace);
  if (res.playerPlace === 1) save.stats.wins++;
  s.raceNo = gp.race;
  s.cup = gp.cup;
  s.classId = gp.classId;
  gp.race++;
  log.event('level.complete', { mode: 'gp', track: s.track.id, place: res.playerPlace, time: round2(res.playerTime), 'lap.best': round2(res.bestLap), points: gp.points[0] });
  if (gp.race >= 4) {
    const standings = gp.racers.map((id, i) => ({ id, i, pts: gp.points[i] }))
      .sort((a, b) => b.pts - a.pts || (a.i === 0 ? -1 : b.i === 0 ? 1 : a.i - b.i));
    const place = standings.findIndex((x) => x.i === 0) + 1;
    s.cupResult = { place, standings, ...recordCup(save, gp.cup, gp.classId, place) };
    s.finalGp = gp;
    save.gp = null;
    log.event('cup.complete', { cup: CUPS[gp.cup].id, class: gp.classId, place, trophy: TROPHY_NAMES[s.cupResult.trophy] || 'none' });
  }
}

function recordTrial(s, res) {
  const lap = res.bestLap;
  const medal = medalFor(lap, s.targets);
  const ghost = res.ghost ? encodeGhost(res.ghost.samples) : null;
  if (s.kind === 'tt') {
    s.improved = recordTrackTimes(save, s.track.id, { lap, race: res.playerTime, ghost });
    s.newMedal = recordMedal(save, s.track.id, medal);
  } else {
    const d = recordDaily(save, s.key, lap);
    s.improved = { lapBest: d.newBest, raceBest: false, firstTime: d.firstToday };
    if (d.newBest) save.daily.ghost = ghost;
    s.newMedal = medal > save.daily.medal;
    save.daily.medal = Math.max(save.daily.medal, medal);
    s.streak = d.streak;
    log.event('daily.complete', { day: s.key, 'lap.best': round2(lap), medal, streak: d.streak });
  }
  s.medal = medal;
  log.event('level.complete', { mode: s.kind, track: s.track.id, time: round2(res.playerTime), 'lap.best': round2(lap), medal, 'best.new': !!s.improved?.lapBest });
}

const round2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

// ------------------------------------------------------------ result cards

function showResults() {
  const s = session;
  if (!s || s.resultShown) return;
  s.resultShown = true;
  if (s.kind === 'gp') return s.cupResult ? showCupResult(s) : showRaceResult(s);
  showTrialResult(s);
}

function showRaceResult(s) {
  mode = 'results';
  const res = s.result;
  const gp = save.gp;
  const place = res.playerPlace;
  $('res-title').textContent = place === 1 ? 'You won! 🎉' : place <= 3 ? `${ordinal(place)} place!` : `${ordinal(place)} place`;
  $('res-sub').textContent = `${s.track.name} · Race ${s.raceNo + 1} of 4`;
  const rows = gp.racers.map((id, i) => ({ id, i, pts: gp.points[i], gain: gp.points[i] - s.gpBefore[i] }))
    .sort((a, b) => b.pts - a.pts || b.gain - a.gain);
  $('res-table').innerHTML = rows.map((r, n) => {
    const racer = racerById(r.id);
    return `<tr class="${r.i === 0 ? 'me' : ''}"><td>${n + 1}</td><td><span class="dot" style="background:${racer.color}"></span>${racer.name}${r.i === 0 ? ' (you)' : ''}</td><td><span class="plus">+${r.gain}</span>${r.pts}</td></tr>`;
  }).join('');
  $('res-extra').textContent = place > 3 ? 'Tip: grab item boxes and drift through bends for turbos!' : res.bestLap ? `Best lap ${formatTime(res.bestLap)}` : '';
  $('btn-res-next').textContent = `Next: ${tracksOfCup(gp.cup)[gp.race].name} →`;
  showScreen('screen-results');
}

function showCupResult(s) {
  mode = 'cup';
  const cr = s.cupResult;
  const t = cr.trophy;
  const cup = CUPS[s.cup];
  $('cup-trophy').textContent = t ? '🏆' : '🎀';
  $('cup-trophy').className = `big-trophy ${['', 'bronze', 'silver', 'gold'][t]}`;
  $('cup-title').textContent = t === 3 ? 'Gold trophy!' : t === 2 ? 'Silver trophy!' : t === 1 ? 'Bronze trophy!' : 'Cup complete!';
  $('cup-sub').textContent = `${cup.name} · ${classById(s.classId).name} · you finished ${ordinal(cr.place)}${t ? '' : '. Top three wins a trophy: you can do it!'}`;
  const top = cr.standings.slice(0, 3);
  $('cup-podium').innerHTML = [top[1], top[0], top[2]].map((x, k) => {
    if (!x) return '';
    const r = racerById(x.id);
    const cls = ['p2', 'p1', 'p3'][k];
    return `<div class="${cls}"><span class="dot" style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${r.color}"></span><br>${r.name}${x.i === 0 ? '<br>(you)' : ''}<br><small>${x.pts} pts</small></div>`;
  }).join('');
  $('cup-unlocks').innerHTML = unlockLines(s.unlocks);
  sound.play('trophy');
  showScreen('screen-cup');
}

function showTrialResult(s) {
  mode = 'ttresult';
  const res = s.result;
  const imp = s.improved || {};
  $('ttr-title').textContent = s.kind === 'daily' ? 'Daily Dash done!' : 'Time trial done!';
  $('ttr-sub').textContent = s.kind === 'daily' ? `${s.track.name} · ${s.streak > 1 ? `${s.streak}-day streak!` : 'see you tomorrow for a new track'}` : s.track.name;
  $('ttr-time').innerHTML = `${formatTime(res.bestLap)} <small class="muted">best lap</small>`;
  const medal = s.medal;
  const next = medal < 3 ? `${MEDALS[medal].name} at ${formatTime(s.targets[medal])}` : '';
  $('ttr-medal').innerHTML = (medal ? `${['', '🥉', '🥈', '🥇'][medal]} ${MEDALS[medal - 1].name}!` : 'No medal yet') +
    (imp.lapBest && !imp.firstTime ? ' <span class="new-best">New best!</span>' : '') +
    (next ? `<br><small class="muted">Next: ${next}</small>` : '');
  const best = Math.min(...res.lapTimes);
  $('ttr-laps').innerHTML = res.lapTimes.map((t, i) => `<div class="${t === best ? 'best' : ''}"><span>Lap ${i + 1}</span><b>${formatTime(t)}</b></div>`).join('') +
    `<div><span>Total</span><b>${formatTime(res.playerTime)}</b></div>`;
  $('ttr-unlocks').innerHTML = unlockLines(s.unlocks);
  $('btn-ttr-tracks').textContent = s.kind === 'daily' ? 'Daily Dash' : 'Pick a track';
  if (medal || imp.lapBest) sound.play('trophy');
  showScreen('screen-ttresult');
}

function unlockLines(list = []) {
  return list.map((u) => {
    const [kind, id] = u.split(':');
    if (kind === 'kart') return `<div>🔓 New kart: ${kartById(id).name}!</div>`;
    if (kind === 'racer') return `<div>🔓 New racer: ${racerById(id).name}!</div>`;
    if (kind === 'cup') return `<div>🔓 The ${CUPS.find((c) => c.id === id).name} is open!</div>`;
    return '';
  }).join('');
}

// ------------------------------------------------------------ menus

function toTitle() {
  mode = 'title';
  if (!session || session.kind !== 'attract') startAttract();
  const cups = CUPS.map((_, c) => bestTrophy(save, c)).filter(Boolean).length;
  const bits = [];
  if (cups) bits.push(`🏆 ${cups}/3 cups`);
  const medals = totalMedals(save);
  if (medals) bits.push(`🏅 ${medals} medal${medals === 1 ? '' : 's'}`);
  if (save.daily.bestStreak > 1) bits.push(`📅 best streak ${save.daily.bestStreak}`);
  $('title-best').textContent = bits.join(' · ') || 'Pick Grand Prix to start your first cup!';
  $('daily-badge').textContent = save.daily.day === dateKey() ? '✓' : 'NEW';
  lastScreen = 'screen-title';
  showScreen('screen-title');
}

function openMenu(id, render) {
  if (mode === 'title' && document.activeElement?.closest?.('#screen-title')) returnFocus = document.activeElement;
  if (!session || session.kind !== 'attract') startAttract();
  mode = 'menu';
  lastScreen = id;
  render?.();
  showScreen(id);
}

function renderGp() {
  const cls = save.classId;
  for (const b of document.querySelectorAll('[data-class]')) {
    const on = b.dataset.class === cls;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  }
  $('class-blurb').textContent = classById(cls).blurb;
  const got = CUPS.reduce((n, c) => n + CLASSES.filter((cl) => save.trophies[`${c.id}:${cl.id}`]).length, 0);
  $('gp-trophies').textContent = `🏆 ${got}/9`;
  const gp = save.gp;
  const cont = $('gp-continue');
  cont.classList.toggle('hidden', !gp);
  if (gp) {
    cont.innerHTML = `<span><b>${CUPS[gp.cup].name}</b> · ${classById(gp.classId).name} · next: race ${gp.race + 1} of 4</span><button class="btn primary small" id="btn-continue">Continue cup →</button>`;
    $('btn-continue').addEventListener('click', () => { sound.play('ui'); startGpRace(); });
  }
  const list = $('cup-list');
  list.innerHTML = '';
  const colours = [['#ff8a3d', '#ff5fa2'], ['#ff6fae', '#b47cff'], ['#3d5bd9', '#1a2a6c']];
  CUPS.forEach((c, i) => {
    const open = isCupOpen(save, i);
    const b = document.createElement('button');
    b.className = `cup${open ? '' : ' locked'}`;
    b.style.setProperty('--c1', colours[i][0]);
    b.style.setProperty('--c2', colours[i][1]);
    const trophies = CLASSES.map((cl) => {
      const t = save.trophies[`${c.id}:${cl.id}`] || 0;
      return `<span class="${t ? 'got' : ''}" title="${cl.name}: ${t ? TROPHY_NAMES[t] : 'no trophy yet'}">${['🏆', '🥉', '🥈', '🥇'][t]}</span>`;
    }).join('');
    b.innerHTML = `<span class="cup-icon">${c.icon}</span><span class="cup-text"><span class="cup-name">${c.name}</span><br><span class="cup-blurb">${open ? c.blurb : `Finish the ${CUPS[i - 1].name} to open`}</span><br><span class="cup-tracks">${tracksOfCup(i).map((t) => t.name).join(' · ')}</span></span><span class="cup-trophies" aria-label="Trophies">${trophies}</span>`;
    b.disabled = !open;
    b.setAttribute('aria-label', `${c.name}${open ? '' : ' (locked)'}`);
    b.addEventListener('click', () => {
      if (!open) return;
      sound.play('ui');
      pendingCup = i;
      openMenu('screen-garage', renderGarage);
    });
    list.appendChild(b);
  });
}

function portraitCanvas(racer, kartId, locked, face = false) {
  const c = document.createElement('canvas');
  const d = Math.min(2, devicePixelRatio || 1);
  c.width = 88 * d;
  c.height = 88 * d;
  if (face) drawFace(c, racer, locked);
  else drawPortrait(c, racer, kartId, locked);
  return c;
}

function renderGarage() {
  const rg = $('racer-grid');
  rg.innerHTML = '';
  for (const r of RACERS) {
    const open = isRacerUnlocked(save, r);
    const b = document.createElement('button');
    b.className = `pick${save.racer === r.id ? ' on' : ''}${open ? '' : ' locked'}`;
    b.appendChild(portraitCanvas(r, r.kart, !open, true));
    b.insertAdjacentHTML('beforeend', open ? `<span>${r.name}</span>` : `<span>???</span><span class="lock">${unlockHint(r)}</span>`);
    b.setAttribute('aria-label', open ? `${r.name}: ${r.blurb}` : `Locked racer. ${unlockHint(r)}`);
    b.addEventListener('click', () => {
      if (!open) { $('racer-info').textContent = `🔒 ${unlockHint(r)}`; sound.play('ui-back'); return; }
      save.racer = r.id;
      persist();
      sound.play('ui');
      renderGarage();
      $('racer-grid').querySelector('.pick.on')?.focus();
    });
    b.addEventListener('focus', () => { $('racer-info').textContent = open ? `${r.name} the ${r.animal}: ${r.blurb}` : `🔒 ${unlockHint(r)}`; });
    rg.appendChild(b);
  }
  const me = racerById(save.racer);
  $('racer-info').textContent = `${me.name} the ${me.animal}: ${me.blurb}`;
  const kg = $('kart-grid');
  kg.innerHTML = '';
  for (const k of KARTS) {
    const open = isKartUnlocked(save, k);
    const b = document.createElement('button');
    b.className = `pick${save.kart === k.id ? ' on' : ''}${open ? '' : ' locked'}`;
    b.appendChild(portraitCanvas(me, k.id, !open));
    const stats = STATS.map((st) => `<div class="stat"><span>${STAT_LABELS[st]}</span><span class="bar">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= k.stats[st] ? 'on' : ''}"></i>`).join('')}</span></div>`).join('');
    b.insertAdjacentHTML('beforeend', `<span class="kart-info"><b>${open ? k.name : '???'}</b><small class="${open ? 'blurb' : 'lockhint'}">${open ? k.blurb : `🔒 ${unlockHint(k)}`}</small>${open ? stats : ''}</span>`);
    b.setAttribute('aria-label', open ? `${k.name}: ${k.blurb}` : `Locked kart. ${unlockHint(k)}`);
    b.addEventListener('click', () => {
      if (!open) { sound.play('ui-back'); return; }
      save.kart = k.id;
      persist();
      sound.play('ui');
      renderGarage();
      $('kart-grid').querySelector('.pick.on')?.focus();
    });
    kg.appendChild(b);
  }
  const racers = RACERS.filter((r) => isRacerUnlocked(save, r)).length;
  const karts = KARTS.filter((k) => isKartUnlocked(save, k)).length;
  $('garage-count').textContent = `${racers}/${RACERS.length} racers · ${karts}/${KARTS.length} karts`;
  $('btn-garage-go').textContent = pendingCup !== null ? `Start the ${CUPS[pendingCup].name} →` : 'Done';
}

function renderTT() {
  const list = $('tt-list');
  list.innerHTML = '';
  $('tt-medals').textContent = `🏅 ${totalMedals(save)}/${TRACKS.length}`;
  CUPS.forEach((c, ci) => {
    const open = isCupOpen(save, ci);
    const col = document.createElement('div');
    col.className = 'tt-cup';
    col.innerHTML = `<h3>${c.icon} ${c.name}</h3>`;
    const inner = document.createElement('div');
    inner.className = 'col';
    for (const t of tracksOfCup(ci)) {
      const b = document.createElement('button');
      b.className = 'btn tt-track';
      const best = save.best[t.id]?.lap;
      const m = save.medals[t.id] || 0;
      const medals = ['🥉', '🥈', '🥇'].map((e, i) => `<span class="${i < m ? '' : 'off'}">${e}</span>`).join('');
      b.innerHTML = `<span>${t.name}<small>${open ? (best ? `Best lap ${formatTime(best)}` : 'No time yet') : `Finish the ${CUPS[ci - 1].name} first`}</small></span><span class="medals">${medals}</span>`;
      b.disabled = !open;
      b.addEventListener('click', () => { sound.play('ui'); startTimeTrial(t.id); });
      inner.appendChild(b);
    }
    col.appendChild(inner);
    list.appendChild(col);
  });
}

function renderDaily() {
  const key = dateKey();
  $('daily-date').textContent = key.slice(5).replace('-', '/');
  $('daily-streak').textContent = streakLabel(save, key);
  const d = save.daily;
  $('daily-best').textContent = d.day === key && d.best ? `Today's best lap ${formatTime(d.best)} ${['', '🥉', '🥈', '🥇'][d.medal]}` : `Dashes raced: ${d.plays}${d.bestStreak > 1 ? ` · best streak ${d.bestStreak} days` : ''}`;
  const draw = (def) => {
    $('daily-name').textContent = def.name;
    drawMiniMap($('daily-map'), buildTrack(def, { decor: false }));
    $('btn-daily-go').disabled = false;
    const f = document.activeElement;
    if (!f || f === document.body || f.matches('[data-back]')) $('btn-daily-go').focus({ preventScroll: true });
  };
  if (dailyDef && dailyKey === key) return draw(dailyDef);
  $('daily-name').textContent = 'Building today’s track…';
  $('btn-daily-go').disabled = true;
  const ctx = $('daily-map').getContext('2d');
  ctx.clearRect(0, 0, 240, 160);
  runJob(generateTrackSteps(dailySeed(key), { id: `daily-${key}` }), (def) => {
    dailyDef = def;
    dailyKey = key;
    if (mode === 'menu' && lastScreen === 'screen-daily') draw(def);
  });
}

function drawMiniMap(c, track) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const b = track.bounds;
  const sc = Math.min((W - 24) / b.w, (H - 24) / b.h);
  g.save();
  g.translate((W - b.w * sc) / 2 - b.minX * sc, (H - b.h * sc) / 2 - b.minY * sc);
  g.scale(sc, sc);
  const m = track.main;
  g.beginPath();
  for (let i = 0; i < m.n; i++) (i ? g.lineTo(m.x[i], m.y[i]) : g.moveTo(m.x[i], m.y[i]));
  g.closePath();
  g.lineJoin = 'round';
  g.strokeStyle = '#2a1d3a';
  g.lineWidth = 9 / sc;
  g.stroke();
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 5 / sc;
  g.stroke();
  g.fillStyle = '#ff5fa2';
  g.beginPath();
  g.arc(m.x[0], m.y[0], 6 / sc, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function renderTrophies() {
  const shelf = $('shelf');
  shelf.innerHTML = '';
  let got = 0;
  CUPS.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'shelf-cup';
    const slots = CLASSES.map((cl) => {
      const t = save.trophies[`${c.id}:${cl.id}`] || 0;
      if (t) got++;
      return `<div class="slot"><span class="t ${t ? '' : 'none'}">${t ? ['', '🥉', '🥈', '🥇'][t] : '🏆'}</span>${cl.name}</div>`;
    }).join('');
    div.innerHTML = `<b>${c.icon} ${c.name}</b><div class="row">${slots}</div>`;
    shelf.appendChild(div);
  });
  $('shelf-count').textContent = `🏆 ${got}/9`;
  $('medal-grid').innerHTML = TRACKS.map((t) => {
    const m = save.medals[t.id] || 0;
    return `<div class="medal-cell"><div class="m ${m ? '' : 'none'}">${m ? ['', '🥉', '🥈', '🥇'][m] : '🥇'}</div>${t.name}</div>`;
  }).join('');
  const racers = RACERS.filter((r) => isRacerUnlocked(save, r)).length;
  const karts = KARTS.filter((k) => isKartUnlocked(save, k)).length;
  $('shelf-stats').textContent = `Races ${save.stats.races} · wins ${save.stats.wins} · Daily Dashes ${save.daily.plays} · racers ${racers}/${RACERS.length} · karts ${karts}/${KARTS.length}`;
}

function renderOptions() {
  const s = save.settings;
  const labels = {
    sound: `<span>Sound</span><b>${s.muted ? '🔇 Off' : '🔊 On'}</b>`,
    music: `<span>Music</span><b>${s.music ? '🎵 On' : '🎵 Off'}</b>`,
    camera: `<span>Camera</span><b>${s.camera === 'follow' ? '🔄 Turns with kart' : '🧭 Map view'}</b>`,
    autoGo: `<span>Auto-go</span><b>${s.autoGo ? 'On' : 'Off'}</b>`,
    easyDrift: `<span>Easy drift (touch)</span><b>${s.easyDrift ? 'On' : 'Off'}</b>`,
  };
  for (const b of document.querySelectorAll('[data-opt]')) b.innerHTML = labels[b.dataset.opt];
  updateMuteButton();
}

function toggleOption(opt) {
  const s = save.settings;
  if (opt === 'sound') return toggleMute();
  if (opt === 'music') { s.music = !s.music; sound.unlock(); sound.setMusic(s.music); }
  if (opt === 'camera') { s.camera = s.camera === 'follow' ? 'fixed' : 'follow'; renderer.camera = s.camera; }
  if (opt === 'autoGo') s.autoGo = !s.autoGo;
  if (opt === 'easyDrift') s.easyDrift = !s.easyDrift;
  persist();
  renderOptions();
  sound.play('ui');
}

function toggleMute() {
  save.settings.muted = !save.settings.muted;
  sound.unlock();
  sound.setMuted(save.settings.muted);
  persist();
  renderOptions();
}

function updateMuteButton() {
  const b = $('btn-mute');
  b.textContent = save.settings.muted ? '🔇' : '🔊';
  b.setAttribute('aria-label', save.settings.muted ? 'Unmute' : 'Mute');
}

function showLoading(title, sub) {
  mode = 'loading';
  $('loading-title').textContent = title;
  $('loading-sub').textContent = sub || '';
  showScreen('screen-loading');
}

function back() {
  sound.play('ui-back');
  if (mode === 'paused') return resume();
  if (mode === 'menu') {
    if (lastScreen === 'screen-garage' && pendingCup !== null) { pendingCup = null; return openMenu('screen-gp', renderGp); }
    return toTitle();
  }
  if (mode === 'results' || mode === 'cup' || mode === 'ttresult') return toTitle();
}

// ------------------------------------------------------------ pause

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  input.release();
  renderOptions();
  $('btn-restart').classList.toggle('hidden', !!session?.recorded && session.kind === 'gp');
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  showScreen(null);
}

function quitToMenu() {
  if (session && session.kind !== 'attract' && !session.recorded) log.event('race.quit', { mode: session.kind, track: session.track.id, time: round2(session.race.time) });
  session = null;
  if (save.gp) openMenu('screen-gp', renderGp);
  else toTitle();
}

// ------------------------------------------------------------ HUD

const hud = { place: 0, lap: '', time: '', item: '', uses: '', rolling: false, touchItem: '' };
const itemCanvas = $('hud-item').querySelector('canvas');
const touchItemCanvas = $('tb-item').querySelector('canvas');

function updateHud(force = false) {
  const s = session;
  if (!s || s.kind === 'attract') return;
  const race = s.race;
  const k = race.player;
  if (!k) return;
  const solo = race.karts.length === 1;
  const place = k.place;
  if (force || hud.place !== place) {
    const el = $('hud-place');
    el.classList.toggle('hidden', solo);
    el.innerHTML = `<b>${place}</b><sup>${ordinal(place).slice(-2)}</sup>`;
    el.classList.toggle('p1', place === 1);
    if (hud.place && !force) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    hud.place = place;
  }
  const lapNo = Math.min(race.laps, k.laps + 1);
  const lap = `Lap ${lapNo}/${race.laps}`;
  if (force || hud.lap !== lap) {
    $('hud-lap').textContent = lap;
    $('hud-lap').classList.toggle('final', lapNo === race.laps && race.laps > 1);
    hud.lap = lap;
  }
  const tt = race.state === 'countdown' ? 0 : k.finished ? k.finishTime : race.time;
  const time = formatTime(tt);
  if (force || hud.time !== time) { $('hud-time').textContent = time; hud.time = time; }
  // Item slot: a little roulette while it rolls.
  let item = k.item || '';
  const rolling = k.rollT > 0;
  if (rolling) {
    item = ITEM_IDS[Math.floor(performance.now() / 90) % ITEM_IDS.length];
  }
  const uses = k.item === 'triple' && k.itemUses > 1 ? `×${k.itemUses}` : '';
  if (force || hud.item !== item || hud.rolling !== rolling || hud.uses !== uses) {
    drawItemIcon(itemCanvas, item);
    const slot = $('hud-item');
    slot.classList.toggle('empty', !item);
    slot.classList.toggle('rolling', rolling);
    const ready = !!k.item && !rolling;
    if (ready && !slot.classList.contains('ready')) { slot.classList.remove('ready'); void slot.offsetWidth; }
    slot.classList.toggle('ready', ready);
    slot.querySelector('.uses').textContent = uses;
    slot.setAttribute('aria-label', k.item ? ITEMS[k.item].name : 'No item');
    slot.classList.toggle('hidden', !race.itemsOn && race.mode !== 'tt');
    const tb = $('tb-item');
    drawItemIcon(touchItemCanvas, item);
    tb.classList.toggle('empty', !item);
    hud.item = item;
    hud.rolling = rolling;
    hud.uses = uses;
  }
}

// ------------------------------------------------------------ banners

let bannerTimer = 0;
let toastTimer = 0;
let introTimer = 0;
function banner(text, cls = '') {
  const b = $('banner');
  b.className = 'banner';
  void b.offsetWidth;
  b.textContent = text;
  b.className = `banner show ${cls}`;
  bannerTimer = 1.2;
}
function holdBanner(text, cls) {
  const b = $('banner');
  b.textContent = text;
  b.className = `banner hold ${cls}`;
  bannerTimer = 0;
}
function hideBanner() {
  $('banner').className = 'banner';
}
function toast(text, seconds = 1.8) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  toastTimer = seconds;
}
function showIntro(sub, name) {
  $('intro-sub').textContent = sub;
  $('intro-name').textContent = name;
  $('intro').classList.remove('hidden');
  introTimer = 2.6;
}

function controlHint(kind) {
  const m = input.mode;
  if (kind === 'drift') {
    if (m === 'touch') return save.settings.easyDrift ? 'Turn hard to drift · straighten up for a turbo!' : 'Hold DRIFT while you steer, let go for a turbo!';
    if (m === 'pad') return 'Hold RT while you turn, let go for a turbo!';
    return 'Hold Space while you turn, let go for a turbo!';
  }
  return '';
}

// Race events the page cares about (sound and particles get theirs too).
function onRaceEvents(events) {
  const s = session;
  const race = s.race;
  const me = race.playerIndex;
  for (const e of events) {
    switch (e.type) {
      case 'count': banner(String(e.n)); break;
      case 'go':
        banner('GO!', 'go');
        if (!save.tips.drift && !s.tipShown && s.kind !== 'attract') { s.tipShown = true; setTimeout(() => { if (mode === 'play') toast(controlHint('drift'), 4); }, 1600); }
        break;
      case 'lap':
        if (e.kart !== me || race.karts[me].finished) break;
        if (s.kind !== 'gp') {
          const better = s.lapBest === null || e.time < s.lapBest;
          toast(`Lap ${e.lap} · ${formatTime(e.time)}${better ? ' · best!' : ''}`, 2.4);
          if (better) s.lapBest = e.time;
        }
        if (e.final) banner('Final lap!', 'small');
        break;
      case 'finish':
        if (e.kart !== me) break;
        recordResult();
        s.finishedAt = performance.now();
        banner(s.kind === 'gp' ? (e.place === 1 ? '1st! 🎉' : `${ordinal(e.place)}!`) : 'Finish!', 'go');
        break;
      case 'race-done':
        if (!s.recorded) { recordResult(); s.finishedAt = performance.now() - 1500; }
        break;
      case 'item': if (e.kart === me) toast(ITEMS[e.item].name, 1.4); break;
      case 'rocket': if (e.kart === me) toast('Rocket start! 🚀'); break;
      case 'tailwind': if (e.kart === me) toast('Tail wind! 🍃 Catch them up!'); break;
      case 'miniturbo':
        if (e.kart !== me) break;
        if (!save.tips.drift) { save.tips.drift = true; persist(); toast('Turbo! 🔥 Drift longer for pink sparks!', 2.6); }
        else if (e.tier === 3) toast('Super turbo! 💖', 1.2);
        save.stats.turbos++;
        break;
      case 'jelly-hit': if (e.kart === me) toast('Wobble! 🪼'); else if (e.by === me) toast('Jelly hit!'); break;
      case 'star-hit': if (e.kart === me) toast('Boing! ⭐'); break;
      default: break;
    }
  }
}

// ------------------------------------------------------------ wiring

const click = (id, fn) => $(id).addEventListener('click', () => { sound.unlock(); fn(); });
click('btn-gp', () => { sound.play('ui'); openMenu('screen-gp', renderGp); });
click('btn-tt', () => { sound.play('ui'); openMenu('screen-tt', renderTT); });
click('btn-daily', () => { sound.play('ui'); openMenu('screen-daily', renderDaily); });
click('btn-garage', () => { sound.play('ui'); pendingCup = null; openMenu('screen-garage', renderGarage); });
click('btn-trophies', () => { sound.play('ui'); openMenu('screen-trophies', renderTrophies); });
click('btn-options', () => { sound.play('ui'); openMenu('screen-options', renderOptions); });
click('btn-garage-go', () => {
  sound.play('ui');
  if (pendingCup !== null) { const c = pendingCup; pendingCup = null; newGp(c, save.classId); }
  else toTitle();
});
click('btn-daily-go', () => { sound.play('ui'); startDaily(); });
click('btn-resume', resume);
click('btn-restart', restartRace);
click('btn-quit', quitToMenu);
click('btn-res-next', () => startGpRace());
click('btn-res-quit', () => { session = null; toTitle(); });
click('btn-cup-again', () => { const c = session?.cup ?? 0; const cl = session?.classId ?? save.classId; newGp(c, cl); });
click('btn-cup-cups', () => openMenu('screen-gp', renderGp));
click('btn-ttr-retry', restartRace);
click('btn-ttr-tracks', () => (session?.kind === 'daily' ? openMenu('screen-daily', renderDaily) : openMenu('screen-tt', renderTT)));
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', back);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', () => { session = null; toTitle(); });
for (const b of document.querySelectorAll('[data-opt]')) b.addEventListener('click', () => toggleOption(b.dataset.opt));
for (const b of document.querySelectorAll('[data-class]')) b.addEventListener('click', () => { save.classId = b.dataset.class; persist(); sound.play('ui'); renderGp(); b.focus(); });

// Pause and mute answer pointerdown so a second finger always works; they
// drop focus after a mouse or touch press (so Space keeps meaning drift) and
// never count as a game input.
for (const [id, fn] of [['btn-pause', pause], ['btn-mute', toggleMute]]) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); sound.unlock(); fn(); el.blur(); });
  el.addEventListener('click', (e) => { if (e.detail !== 0) e.preventDefault(); });
  el.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' && e.code !== 'Space') return;
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
}

// Result cards ignore clicks for a moment, and any key that was already
// held when they opened, so mashing never skips them.
addEventListener('click', (e) => {
  if (RESULT_SCREENS.includes(shownId) && performance.now() - shownAt < RESULT_GUARD_MS) { e.preventDefault(); e.stopPropagation(); }
}, { capture: true });
for (const type of ['keydown', 'keyup']) {
  addEventListener(type, (e) => {
    if (!RESULT_SCREENS.includes(shownId) || !heldOnOpen.has(e.code)) return;
    if (type === 'keyup') heldOnOpen.delete(e.code);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, { capture: true });
}

// A second tab saved: adopt its progress instead of overwriting it later.
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY && e.key !== null) return;
  const fresh = loadSave(storage);
  for (const key of Object.keys(save)) delete save[key];
  Object.assign(save, fresh);
  sound.setMuted(save.settings.muted);
  sound.setMusic(save.settings.music);
  renderer.camera = save.settings.camera;
  updateMuteButton();
  if (mode === 'title') toTitle();
  else if (mode === 'menu') {
    const renders = { 'screen-gp': renderGp, 'screen-garage': renderGarage, 'screen-tt': renderTT, 'screen-daily': renderDaily, 'screen-trophies': renderTrophies, 'screen-options': renderOptions };
    renders[lastScreen]?.();
  }
});

addEventListener('resize', () => renderer.resize());
addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 100));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('blur', () => pause());
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

// Arrow keys and the d-pad move focus between buttons in menus.
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

// ------------------------------------------------------------ pointer

let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

// ------------------------------------------------------------ loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({
    mode, session: session?.kind ?? 'none', track: session?.track?.id ?? 'none',
    karts: session?.race?.karts.length ?? 0, particles: renderer.particles.n, dpr: renderer.dpr,
  }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const frameMs = now - last;
  const dt = Math.min(0.05, frameMs / 1000);
  last = now;
  input.pollPad();
  updatePointer(dt);
  stepJob();

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
  } else {
    // In play the pad drives the kart; menu edges must not queue up.
    input.padEdges.clear();
  }
  $('touch').classList.toggle('hidden', !(mode === 'play' && input.mode === 'touch'));

  const s = session;
  if (s) {
    const race = s.race;
    const playing = mode === 'play' && s.kind !== 'attract';
    const stepping = playing || (s.kind === 'attract' && (mode === 'title' || mode === 'menu' || mode === 'loading'));
    if (stepping) {
      const me = race.player;
      let controls = null;
      if (playing && me) {
        controls = s.driver
          ? s.driver.controls(race, me, dt)
          : input.read({ autoGo: save.settings.autoGo, easyDrift: save.settings.easyDrift, speed: me.v, driftMin: KART.driftMin, dt });
      }
      accumulator += dt;
      let first = true;
      while (accumulator >= STEP) {
        race.step(STEP, controls && !first ? { ...controls, item: false } : controls);
        first = false;
        accumulator -= STEP;
      }
      renderer.handleEvents(race.events, race);
      if (playing) {
        sound.handle(race.events, race, race.playerIndex);
        onRaceEvents(race.events);
      }
      race.events.length = 0;
      if (s.kind === 'attract' && race.state === 'done') startAttract();
    }
    if (playing) {
      updateHud();
      const me = race.player;
      if (me && me.wrongWay && !me.finished) { holdBanner('↺ Wrong way!', 'warn small'); s.wrongShown = true; }
      else if (s.wrongShown) { hideBanner(); s.wrongShown = false; }
      sound.engine(me, topSpeed(me));
      // Results follow the celebration; the result itself is already saved.
      if (s.recorded && !s.resultShown && performance.now() - s.finishedAt > 2600) showResults();
    } else sound.engine(null);
    renderer.frame(mode === 'paused' ? 0 : dt, race, {
      attract: s.kind === 'attract',
      paused: mode === 'paused',
      frameMs,
      ghost: s.ghost,
      ghostTime: s.ghost && race.player && race.state === 'racing' && !race.player.finished ? race.time - race.player.lapStart : -1,
      ghostRacer: s.ghostRacer,
      ghostKart: s.ghostKart,
      minimap: s.kind !== 'attract',
    });
  }
  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) hideBanner();
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.remove('show');
  if (introTimer > 0 && (introTimer -= dt) <= 0) $('intro').classList.add('hidden');
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture;
// after a crash the guard returns early, so the loop stops rescheduling.
const loop = telemetry ? telemetry.guard(frame, 'pocket-kart.frame') : frame;

updateMuteButton();
if (location.protocol !== 'file:') {
  log.event('game.ready', {
    cups: CUPS.filter((_, c) => bestTrophy(save, c)).length, medals: totalMedals(save),
    racer: save.racer, kart: save.kart, autoplay: AUTOPLAY, touch: matchMedia('(pointer: coarse)').matches,
  });
  const cupParam = params.get('gp');
  const trackParam = params.get('track');
  if (params.has('daily')) startDaily();
  else if (trackParam && trackById(trackParam)) startTimeTrial(trackParam);
  else if (cupParam !== null && CUPS[Number(cupParam)]) { startAttract(); newGp(Number(cupParam), classById(params.get('class') || save.classId).id); }
  else toTitle();
  requestAnimationFrame(loop);
}

window.PK = { get session() { return session; }, get mode() { return mode; }, save, renderer, input, sound, startTimeTrial, startDaily, newGp, toTitle };
