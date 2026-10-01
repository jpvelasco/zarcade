// Browser entry: screens, the fixed-step loop, shooting input, HUD, sound
// and saves.
import { STEP } from './physics.js';
import { Round, FIRE_RUN } from './round.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Shooter, DIFFICULTY } from './ai.js';
import { idealShot, applyInput, idealFlick, referenceSpeed } from './shots.js';
import { timedRules, quickRules, trickRules, dailyRules, TRICK_LEVELS, TRICK_TYPES, trickStars, MODE_INFO } from './modes.js';
import { RIVALS, RIVAL_BY_ID, rivalRules, LADDER_COURTS, courtRivals } from './rivals.js';
import { COURTS, COURT_BY_ID } from './courts.js';
import { BALLS, JERSEYS, COURT_ITEMS, LOCKER, itemState } from './cosmetics.js';
import { MISSION_BY_ID } from './missions.js';
import { loadSave, writeSave, recordRound, nextRival, rivalUnlocked, rivalEase, liveStreak, buyItem, adaptFlick } from './save.js';
import { dateKey, hashString } from './rng.js';
import { portrait, ballIcon, heroSprite, scenery, makeCanvas, SCENE_W, SCENE_H } from './sprites.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
const input = new Input(canvas);
const sound = new Sound({ muted: save.muted, music: save.music });
const autoplay = params.has('autopilot');

let mode = 'title'; // title | ladder | quick | trick | locker | help | vs | play | paused | results
let backTo = 'title';
let round = null; // the round being drawn (player or attract)
let rivalRound = null;
let rivalAI = null;
let pilot = null; // autopilot / attract shooter
let run = null; // { type, rules, rival, level, kind, court }
let attract = true;
let accumulator = 0;
let meterT = 0;
let nudge = 0;
let hintT = 0;
let coach = '';
let coachT = 0;
let lastShot = null;
let rivalShots = [];
let endDelay = 0;
let lockerTab = 'balls';
let quickKind = 'timed';
let startedAt = 0;

const SCREENS = ['screen-title', 'screen-ladder', 'screen-quick', 'screen-trick', 'screen-locker', 'screen-vs', 'screen-pause', 'screen-results', 'screen-help'];

function equipped() {
  return {
    ball: BALLS.find((b) => b.id === save.equip.ball) || BALLS[0],
    jersey: JERSEYS.find((j) => j.id === save.equip.jersey) || JERSEYS[0],
    court: COURT_BY_ID[save.equip.court] || COURT_BY_ID.park,
  };
}
function applyCosmetics() {
  const e = equipped();
  renderer.setBall(e.ball);
  renderer.setJersey(e.jersey);
}

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', !(mode === 'play' || mode === 'paused'));
  input.enabled = mode === 'play';
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]), .tile.next, .btn:not([disabled])');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  sound.setMusicLevel(mode === 'play' ? 0.75 : mode === 'paused' ? 0.25 : 0.5);
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 2200);
}

function drawInto(canvasEl, source) {
  const g = canvasEl.getContext('2d');
  g.clearRect(0, 0, canvasEl.width, canvasEl.height);
  g.drawImage(source, 0, 0, canvasEl.width, canvasEl.height);
}

const acePortrait = (size = 192) => portrait('puppy', equipped().jersey.body, '7', size);

// ------------------------------------------------------------ attract

function startAttract() {
  attract = true;
  const court = equipped().court;
  renderer.setCourt(court);
  round = new Round(timedRules(court.id, 0), { countdown: false });
  rivalRound = null;
  pilot = new Shooter('allstar', (Date.now() / 1000) | 0, { cadence: 1.7 });
  renderer.resetCamera();
}

// ------------------------------------------------------------ title & menus

function setSoundLabels() {
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = `Music: ${save.music ? 'on' : 'off'}`;
  $('btn-easy').textContent = `Easy aim: ${save.easy ? 'on' : 'off'}`;
  $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
}

function toTitle() {
  mode = 'title';
  if (!attract || !round) startAttract();
  applyCosmetics();
  drawInto($('title-ace'), acePortrait(264));
  const nr = nextRival(save);
  $('btn-tour').textContent = nr ? (save.beaten.length ? `🏆 Tournament · vs ${nr.name}` : '🏆 Tournament · Start!') : '🏆 Tournament · Champion!';
  const today = dateKey();
  const streak = liveStreak(save, today);
  const done = save.daily.scores[today];
  $('daily-note').textContent = done ? `Today ${done} pts${streak ? ` · 🔥${streak}` : ''}` : streak ? `🔥 ${streak}-day streak` : 'New every day';
  $('ticket-pill').textContent = `🎟️ ${save.tickets}`;
  const list = $('mission-list');
  list.innerHTML = '';
  for (const a of save.missions.active) {
    const m = MISSION_BY_ID[a.id];
    if (!m) continue;
    const li = document.createElement('li');
    const pct = Math.min(100, Math.round((a.progress / m.goal) * 100));
    li.innerHTML = `<span></span><span class="count">${Math.min(a.progress, m.goal)} / ${m.goal}</span><span class="bar"><i style="width:${pct}%"></i></span>`;
    li.firstChild.textContent = m.text;
    list.appendChild(li);
  }
  const bests = [];
  bests.push(`🏆 ${save.trophies.filter((t) => t !== 'gold').length}/4${save.trophies.includes('gold') ? ' + Golden Hoop' : ''}`);
  if (save.best.timed) bests.push(`Hot Shot best ${save.best.timed}`);
  if (save.best.racks) bests.push(`Racks best ${save.best.racks}`);
  $('title-best').textContent = bests.join(' · ');
  setSoundLabels();
  showScreen('screen-title');
}

function courtColors(c) { return [c.sky[0], c.floor]; }

function toLadder() {
  mode = 'ladder';
  backTo = 'title';
  const box = $('ladder');
  box.innerHTML = '';
  const next = nextRival(save);
  $('ladder-trophies').textContent = `🏆 ${save.trophies.filter((t) => t !== 'gold').length} / 4`;
  LADDER_COURTS.forEach((cid, ci) => {
    const court = COURT_BY_ID[cid];
    const open = ci === 0 || save.trophies.includes(LADDER_COURTS[ci - 1]);
    const col = document.createElement('div');
    col.className = `court-col${open ? '' : ' locked'}`;
    const [c1, c2] = courtColors(court);
    col.style.setProperty('--c1', c1);
    col.style.setProperty('--c2', c2);
    const won = save.trophies.includes(cid);
    col.innerHTML = `<h3><span>${court.name}</span><span class="trophy${won ? ' won' : ''}" title="${won ? 'Trophy won!' : 'Beat all three to win the trophy'}">${cid === 'space' && save.trophies.includes('gold') ? '👑' : '🏆'}</span></h3><div class="gravity">${court.g < 9 ? '🪐 Low gravity' : '&nbsp;'}</div>`;
    for (const r of courtRivals(cid)) {
      const b = document.createElement('button');
      const unlocked = rivalUnlocked(save, r);
      const beaten = save.beaten.includes(r.id);
      b.className = `tile${next && next.id === r.id ? ' next' : ''}`;
      b.disabled = !unlocked;
      const cv = document.createElement('canvas');
      cv.width = 112; cv.height = 112;
      drawInto(cv, portrait(r.animal, r.color, '', 192));
      if (!unlocked) cv.style.filter = 'brightness(0) opacity(0.35)';
      const info = document.createElement('div');
      info.innerHTML = `<b>${unlocked ? r.name : '???'}${beaten ? ' <span class="check">✔</span>' : ''}</b><small>${MODE_INFO[r.kind].icon} ${MODE_INFO[r.kind].name} · ${DIFFICULTY[r.diff].name}</small>${save.rivalBest[r.id] ? `<small>Your best ${save.rivalBest[r.id]}</small>` : ''}`;
      b.append(cv, info);
      b.addEventListener('click', () => { sound.ui(); toVersus(r); });
      col.appendChild(b);
    }
    box.appendChild(col);
  });
  showScreen('screen-ladder');
}

function toVersus(rival) {
  mode = 'vs';
  backTo = 'ladder';
  run = { type: 'tour', rival, rules: rivalRules(rival), court: rival.court, kind: rival.kind };
  const court = COURT_BY_ID[rival.court];
  renderer.setCourt(court);
  startAttractOn(court.id);
  drawInto($('vs-ace'), acePortrait(300));
  drawInto($('vs-rival'), portrait(rival.animal, rival.color, '', 300));
  $('vs-name').textContent = rival.name;
  $('vs-diff').textContent = DIFFICULTY[rival.diff].name;
  $('vs-hello').textContent = `“${rival.hello}”`;
  $('vs-court').textContent = `${court.name}${court.g < 9 ? ' · low gravity!' : ''}`;
  const info = MODE_INFO[rival.kind];
  const best = save.rivalBest[rival.id];
  $('vs-rules').textContent = `${info.icon} ${info.name}: ${info.blurb} Highest score after ${run.rules.time} seconds wins.${best ? ` Your best here: ${best}.` : ''}`;
  showScreen('screen-vs');
}

function startAttractOn(courtId) {
  attract = true;
  round = new Round(timedRules(courtId, 0), { countdown: false });
  rivalRound = null;
  pilot = new Shooter('allstar', 5, { cadence: 1.7 });
  renderer.resetCamera();
}

function toQuick() {
  mode = 'quick';
  backTo = 'title';
  const grid = $('quick-modes');
  grid.innerHTML = '';
  for (const kind of ['timed', 'moving', 'racks']) {
    const info = MODE_INFO[kind];
    const b = document.createElement('button');
    b.className = 'tile mode-tile';
    b.innerHTML = `<span class="icon">${info.icon}</span><span><b>${info.name}</b><small>${info.blurb}</small><small>${save.best[kind] ? `Best ${save.best[kind]}` : 'No score yet'}</small></span>`;
    b.addEventListener('click', () => { sound.ui(); quickKind = kind; startRun({ type: 'quick', kind, court: save.equip.court, rules: quickRules(kind, save.equip.court, 'slide') }); });
    grid.appendChild(b);
  }
  renderCourtChips();
  showScreen('screen-quick');
}

function renderCourtChips() {
  const chips = $('quick-courts');
  chips.innerHTML = '';
  for (const c of COURTS) {
    const owned = save.owned.courts.includes(c.id);
    const b = document.createElement('button');
    b.className = `chip${save.equip.court === c.id ? ' on' : ''}`;
    b.textContent = owned ? `${c.name}${c.g < 9 ? ' 🪐' : ''}` : `🔒 ${c.name}`;
    b.disabled = !owned;
    b.title = owned ? c.blurb : 'Unlock in the Tournament or the Locker';
    b.addEventListener('click', () => { save.equip.court = c.id; persist(); sound.ui(); renderCourtChips(); startAttract(); });
    chips.appendChild(b);
  }
}

function toTrick() {
  mode = 'trick';
  backTo = 'title';
  const grid = $('trick-grid');
  grid.innerHTML = '';
  let total = 0;
  for (const [type, info] of Object.entries(TRICK_TYPES)) {
    const col = document.createElement('div');
    col.className = 'trick-col';
    col.innerHTML = `<h3>${info.icon} ${info.name}</h3>`;
    TRICK_LEVELS.filter((l) => l.type === type).forEach((l, i) => {
      const st = save.trick[l.id]?.stars || 0;
      total += st;
      const b = document.createElement('button');
      b.className = 'tile';
      b.innerHTML = `<span class="num">${i + 1}</span><span><b>${l.name}</b><small>${l.balls} balls · ★ at ${l.stars.join(' / ')}</small><span class="stars-sm">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span></span>`;
      b.addEventListener('click', () => { sound.ui(); startRun({ type: 'trick', level: l, court: save.equip.court, rules: trickRules(l, save.equip.court) }); });
      col.appendChild(b);
    });
    grid.appendChild(col);
  }
  $('trick-stars').textContent = `★ ${total} / ${TRICK_LEVELS.length * 3}`;
  showScreen('screen-trick');
}

function itemPreview(kind, item) {
  const c = makeCanvas(168, 168);
  const g = c.getContext('2d');
  if (kind === 'balls') {
    g.drawImage(ballIcon(item, 128), 20, 20);
  } else if (kind === 'jerseys') {
    g.fillStyle = '#eaf6ff'; g.fillRect(0, 0, 168, 168);
    const h = heroSprite(item);
    g.drawImage(h, 0, 60, 360, 360, 4, 4, 160, 160);
  } else {
    const court = COURT_BY_ID[item.id];
    const sc = scenery(court);
    const gr = g.createLinearGradient(0, 0, 0, 168);
    gr.addColorStop(0, court.sky[0]); gr.addColorStop(1, court.sky[2]);
    g.fillStyle = gr; g.fillRect(0, 0, 168, 168);
    g.drawImage(sc, 300, 120, 500, SCENE_H - 120, 0, 30, 168, (168 * (SCENE_H - 120)) / 500);
    g.fillStyle = court.floor; g.fillRect(0, 120, 168, 48);
    g.fillStyle = court.paint; g.beginPath(); g.moveTo(60, 120); g.lineTo(108, 120); g.lineTo(130, 168); g.lineTo(38, 168); g.closePath(); g.fill();
    void SCENE_W;
  }
  return c;
}

const KIND_KEY = { balls: 'ball', jerseys: 'jersey', courts: 'court' };

function toLocker(tab = lockerTab) {
  mode = 'locker';
  backTo = 'title';
  lockerTab = tab;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.tab === tab);
  $('locker-tickets').textContent = `🎟️ ${save.tickets}`;
  const grid = $('locker-grid');
  grid.innerHTML = '';
  for (const item of LOCKER[tab]) {
    const state = itemState(save, tab, item);
    const isOn = save.equip[KIND_KEY[tab]] === item.id;
    const b = document.createElement('button');
    b.className = `item${isOn ? ' equipped' : ''}${state === 'locked' ? ' locked' : ''}`;
    const name = tab === 'courts' ? COURT_BY_ID[item.id].name : item.name;
    let label;
    if (state === 'owned') label = isOn ? '✔ Equipped' : 'Tap to equip';
    else if (state === 'buy') label = `<span class="price">🎟️ ${item.price}</span>`;
    else label = `🔒 Win the ${item.trophy === 'gold' ? 'Golden Hoop' : `${COURT_BY_ID[item.trophy].name} trophy`}`;
    b.append(itemPreview(tab, item));
    const t = document.createElement('div');
    t.innerHTML = `<b></b><div class="state">${label}</div>`;
    t.querySelector('b').textContent = name;
    b.append(t);
    b.addEventListener('click', () => {
      if (state === 'owned') {
        save.equip[KIND_KEY[tab]] = item.id;
        sound.ui();
      } else if (state === 'buy') {
        if (buyItem(save, tab, item)) {
          save.equip[KIND_KEY[tab]] = item.id;
          sound.coin();
          log.event('locker.buy', { kind: tab, item: item.id });
          toast(`Unlocked ${name}!`);
        } else { toast(`You need ${item.price - save.tickets} more 🎟️. Play a round to earn some!`); return; }
      } else { toast(label.replace(/<[^>]+>/g, '')); return; }
      persist();
      applyCosmetics();
      if (tab === 'courts') startAttract();
      toLocker(tab);
    });
    grid.appendChild(b);
  }
  showScreen('screen-locker');
}

function toHelp(from) {
  backTo = from || mode;
  mode = 'help';
  showScreen('screen-help');
}

// ------------------------------------------------------------ runs

function startDaily() {
  const key = dateKey();
  const rules = dailyRules(key);
  startRun({ type: 'daily', kind: rules.kind, court: rules.court, rules, dateKey: key });
}

function startRun(r) {
  run = r;
  attract = false;
  const court = COURT_BY_ID[r.court] || COURT_BY_ID.park;
  renderer.setCourt(court);
  applyCosmetics();
  round = new Round(r.rules);
  rivalRound = null;
  rivalAI = null;
  rivalShots = [];
  if (r.type === 'tour') {
    rivalRound = new Round(r.rules);
    rivalAI = new Shooter(r.rival.diff, hashString(`${r.rival.id}:${save.stats.rounds}`), { ease: rivalEase(save, r.rival) });
    const card = $('rival-card');
    card.classList.remove('hidden');
    drawInto($('rival-face'), portrait(r.rival.animal, r.rival.color, '', 192));
    $('rival-name').textContent = r.rival.name;
  } else {
    $('rival-card').classList.add('hidden');
  }
  pilot = autoplay ? new Shooter('allstar', 11) : null;
  renderer.resetCamera();
  accumulator = 0;
  meterT = 0;
  nudge = 0;
  hintT = save.stats.shots < 6 ? 8 : 0;
  coach = ''; coachT = 0;
  endDelay = 0;
  startedAt = performance.now();
  input.clear();
  mode = 'play';
  showScreen(null);
  sound.unlock();
  sound.beep(false);
  updateHud(true);
  const goal = $('hud-goal');
  if (r.type === 'trick') { goal.textContent = r.level.tip; goal.classList.remove('hidden'); }
  else if (r.type === 'daily') { goal.textContent = `📅 Daily Shootout · ${MODE_INFO[r.kind].name}`; goal.classList.remove('hidden'); }
  else goal.classList.add('hidden');
  log.event('level.start', { mode: r.type, kind: r.kind || 'trick', court: court.id, rival: r.rival?.id || '', level: r.level?.id || '' });
  queueMicrotask(() => monitor.mark(performance.now()));
}

function restartRun() {
  if (!run) return;
  if (run.type === 'daily') startDaily();
  else startRun({ ...run, rules: run.type === 'quick' ? quickRules(run.kind, run.court, 'slide') : run.type === 'trick' ? trickRules(run.level, run.court) : rivalRules(run.rival) });
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  showScreen('screen-pause');
  setSoundLabels();
}
function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  input.clear();
  showScreen(null);
}

// ------------------------------------------------------------ shooting

function playerSetup() {
  const setup = round.shotSetup();
  const ideal = idealShot(setup);
  return { setup, ideal };
}

function shootWith(aimErr, powerErr, flickSpeed) {
  const { setup, ideal } = playerSetup();
  if (!ideal) return;
  const launch = applyInput(ideal, aimErr, powerErr, save.easy);
  const ball = round.shoot(launch);
  if (!ball) return;
  lastShot = { id: ball.id, aimErr, powerErr };
  if (flickSpeed) adaptFlick(save, (flickSpeed * referenceSpeed(setup.g)) / ideal.speed);
  hintT = 0;
}

function aimPointScreen(ideal) {
  const B = renderer.heroBall || renderer.screenOf(round.releasePoint());
  const A = renderer.screenOf(ideal.aim);
  return { A, B };
}

function shootFromFlick(f) {
  if (!round.canShoot()) return;
  const { setup, ideal } = playerSetup();
  if (!ideal) return;
  const { A, B } = aimPointScreen(ideal);
  const thetaI = Math.atan2(A.x - B.x, -(A.y - B.y));
  const thetaF = Math.atan2(f.dirX, -f.dirY);
  const aimErr = thetaF - thetaI;
  const powerErr = Math.log2(f.speed / idealFlick(ideal, setup.g, save.flickRef));
  shootWith(aimErr, powerErr, f.speed);
}

const METER_PERIOD = 1.5;
const METER_ZONE = 0.07;
function meterValue() { return 0.5 - 0.5 * Math.cos((meterT / METER_PERIOD) * Math.PI * 2); }

function shootFromMeter() {
  if (!round.canShoot()) return;
  const v = meterValue();
  shootWith(nudge, (v - 0.5) * 3, 0);
}

function coachFor(shot) {
  if (!shot) return '';
  if (Math.abs(shot.powerErr) >= Math.abs(shot.aimErr) * 1.6 && Math.abs(shot.powerErr) > 0.3) return shot.powerErr > 0 ? 'A bit softer!' : 'A bit harder!';
  if (Math.abs(shot.aimErr) > 0.18) return shot.aimErr > 0 ? 'Aim a little left' : 'Aim a little right';
  return Math.abs(shot.powerErr) > 0.3 ? (shot.powerErr > 0 ? 'A bit softer!' : 'A bit harder!') : 'So close!';
}

// ------------------------------------------------------------ HUD

let hudCache = {};
function setText(id, text) {
  if (hudCache[id] === text) return;
  hudCache[id] = text;
  $(id).textContent = text;
}
function updateHud(force = false) {
  if (force) hudCache = {};
  if (!round || attract) return;
  setText('hud-score', String(round.score));
  const rules = round.rules;
  if (rules.time) {
    setText('hud-clock-label', 'Time');
    setText('hud-clock', String(Math.ceil(round.status === 'countdown' ? rules.time : round.timeLeft)));
  } else {
    setText('hud-clock-label', 'Balls');
    setText('hud-clock', String(Math.max(0, round.ballsLeft)));
  }
  $('hud-clock').parentElement.classList.toggle('hurry', !!rules.time && round.status === 'play' && round.timeLeft <= 5);
  let sub = '';
  if (run.type === 'trick') sub = `${round.stats.valid} made · ★ at ${run.level.stars.join('/')}`;
  else if (run.type === 'quick') sub = save.best[run.kind] ? `Best ${save.best[run.kind]}` : '';
  else if (run.type === 'daily') sub = save.daily.scores[run.dateKey] ? `Today’s best ${save.daily.scores[run.dateKey]}` : '';
  else if (run.type === 'tour') sub = save.rivalBest[run.rival.id] ? `Best ${save.rivalBest[run.rival.id]}` : '';
  if (rules.racks) sub = `Rack ${round.rack + 1}/5${sub ? ` · ${sub}` : ''}`;
  if (round.swishRun > 0 && !round.fire) sub = `Swish streak ${round.swishRun}/${FIRE_RUN}`;
  setText('hud-sub', sub);
  $('fire-badge').classList.toggle('hidden', !round.fire);
  if (rivalRound) {
    setText('rival-score', String(rivalRound.score));
    const dots = rivalShots.slice(-5).map((m) => `<i class="${m ? 'in' : ''}"></i>`).join('');
    if (hudCache.dots !== dots) { hudCache.dots = dots; $('rival-dots').innerHTML = dots; }
  }
}

function handleRivalEvents() {
  for (const e of rivalRound.events) {
    if (e.type === 'score') {
      rivalShots.push(true);
      const card = $('rival-card');
      card.classList.remove('bump');
      void card.offsetWidth;
      card.classList.add('bump');
    } else if (e.type === 'miss') rivalShots.push(false);
  }
  if (rivalShots.length > 8) rivalShots.splice(0, rivalShots.length - 8);
  rivalRound.events.length = 0;
}

// ------------------------------------------------------------ results

function finishRun() {
  const st = round.stats;
  const summary = { mode: run.type, kind: run.kind, score: round.score, ...st, stars: 0, won: false, rival: run.rival?.id, level: run.level?.id, dateKey: run.dateKey };
  let title = 'Time!', sub = '';
  if (run.type === 'tour') {
    const them = rivalRound.score;
    summary.won = round.score > them;
    title = summary.won ? 'You win!' : round.score === them ? 'A tie!' : 'So close!';
    sub = summary.won ? `“${run.rival.win}”` : `“${run.rival.lose}”`;
  } else if (run.type === 'trick') {
    summary.stars = trickStars(run.level, st.valid);
    summary.makes = st.valid;
    title = summary.stars ? 'Trick shot!' : 'Keep trying!';
    sub = `${run.level.name}: ${st.valid} of ${run.level.balls}`;
  } else if (run.type === 'daily') {
    title = 'Daily done!';
    sub = `${MODE_INFO[run.kind].name} on ${COURT_BY_ID[run.court].name}`;
  } else {
    sub = `${MODE_INFO[run.kind].name} on ${COURT_BY_ID[run.court].name}`;
  }
  const out = recordRound(save, summary);
  persist();
  const timeS = Math.round((performance.now() - startedAt) / 1000);
  if (run.type === 'tour' && !summary.won) log.event('level.fail', { mode: 'tour', rival: run.rival.id, score: round.score, rivalScore: rivalRound.score });
  else if (run.type === 'trick' && !summary.stars) log.event('level.fail', { mode: 'trick', level: run.level.id, makes: st.valid });
  else log.event('level.complete', { mode: run.type, kind: run.kind || 'trick', score: round.score, stars: summary.stars, won: summary.won, time: timeS });
  for (const t of out.trophies) log.event('trophy.won', { trophy: t });
  for (const m of out.missions) log.event('mission.complete', { mission: m.id });

  mode = 'results';
  $('res-title').textContent = title;
  $('res-sub').textContent = sub;
  const vs = $('res-versus');
  if (run.type === 'tour') {
    vs.classList.remove('hidden');
    drawInto($('res-ace'), acePortrait(160));
    drawInto($('res-rival'), portrait(run.rival.animal, run.rival.color, '', 160));
    $('res-me').textContent = String(round.score);
    $('res-them').textContent = String(rivalRound.score);
    vs.children[0].classList.toggle('winner', summary.won);
    vs.children[2].classList.toggle('winner', rivalRound.score > round.score);
    $('res-score').classList.add('hidden');
  } else {
    vs.classList.add('hidden');
    $('res-score').classList.remove('hidden');
    $('res-score').textContent = run.type === 'trick' ? `${st.valid} / ${run.level.balls}` : String(round.score);
  }
  const stars = $('res-stars');
  if (run.type === 'trick') {
    stars.classList.remove('hidden');
    stars.innerHTML = [0, 1, 2].map((i) => `<span class="${i < summary.stars ? '' : 'off'}" style="animation-delay:${0.15 + i * 0.15}s">★</span>`).join('');
  } else stars.classList.add('hidden');
  $('res-best').classList.toggle('hidden', !out.newBest);
  const lines = [];
  lines.push(`${st.makes} of ${st.shots} in · ${st.swishes} swish${st.swishes === 1 ? '' : 'es'}${st.fires ? ` · 🔥 ×${st.fires}` : ''}${st.buzzer ? ' · buzzer beater!' : ''}`);
  if (!out.newBest && out.prevBest) lines.push(`Best: ${out.prevBest}`);
  if (run.type === 'daily') { const s = liveStreak(save, run.dateKey); lines.push(`📅 Streak: ${s} day${s === 1 ? '' : 's'} · come back tomorrow for a new one!`); }
  lines.push(`<span class="gain">+🎟️ ${out.tickets} tickets (you have ${save.tickets})</span>`);
  for (const m of out.missions) lines.push(`<span class="gain">✔ Challenge done: ${m.text}</span>`);
  for (const t of out.trophies) lines.push(`<span class="unlock">${t === 'gold' ? '👑 The Golden Hoop is yours! Golden ball and Champion jersey unlocked!' : `🏆 ${COURT_BY_ID[t].name} trophy!${t !== 'space' ? ` ${COURT_BY_ID[LADDER_COURTS[LADDER_COURTS.indexOf(t) + 1]].name} is open.` : ''}`}</span>`);
  if (out.trophies.includes('beach')) lines.push('<span class="unlock">🌈 Rainbow ball unlocked in the Locker!</span>');
  if (out.trophies.includes('roof')) lines.push('<span class="unlock">🦓 Zebra jersey unlocked in the Locker!</span>');
  $('res-lines').innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  const nr = nextRival(save);
  const showNext = run.type === 'tour' && summary.won && nr;
  $('btn-next').classList.toggle('hidden', !showNext);
  $('btn-again').textContent = run.type === 'tour' && !summary.won ? 'Rematch!' : 'Again!';
  if (summary.won || out.newBest || summary.stars === 3) sound.fanfare(); else sound.cheer(false);
  showScreen('screen-results');
  if (showNext) $('btn-next').focus({ preventScroll: true });
}

// ------------------------------------------------------------ buttons

function on(id, fn) { $(id).addEventListener('click', () => { sound.unlock(); fn(); }); }
on('btn-tour', () => { sound.ui(); toLadder(); });
on('btn-quick', () => { sound.ui(); toQuick(); });
on('btn-trick', () => { sound.ui(); toTrick(); });
on('btn-daily', () => { sound.ui(); startDaily(); });
on('btn-locker', () => { sound.ui(); toLocker('balls'); });
on('btn-help', () => { sound.ui(); toHelp('title'); });
on('btn-vs-go', () => { if (run?.rival) startRun({ ...run, rules: rivalRules(run.rival) }); });
on('btn-resume', resume);
on('btn-restart', restartRun);
on('btn-quit', () => { toTitle(); });
on('btn-pause', pause);
on('btn-mute', toggleMute);
on('btn-again', restartRun);
on('btn-next', () => { const nr = nextRival(save); if (nr) toVersus(nr); });
on('btn-res-menu', () => { if (run?.type === 'tour') { startAttract(); toLadder(); } else if (run?.type === 'trick') { startAttract(); toTrick(); } else toTitle(); });
on('btn-easy', () => { save.easy = !save.easy; persist(); setSoundLabels(); });
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => { sound.ui(); toLocker(t.dataset.tab); });
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', () => { sound.unlock(); toggleMute(); });
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', () => { sound.unlock(); save.music = !save.music; sound.setMusic(save.music); persist(); setSoundLabels(); });
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => { sound.ui(); back(); });
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });

function toggleMute() {
  save.muted = !save.muted;
  sound.setMuted(save.muted);
  persist();
  setSoundLabels();
}

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'help') { if (backTo === 'title') toTitle(); else { mode = backTo; showScreen(`screen-${backTo}`); } }
  else if (mode === 'vs') { startAttract(); toLadder(); }
  else if (mode === 'results') { if (run?.type === 'tour') { startAttract(); toLadder(); } else toTitle(); }
  else if (mode !== 'title' && mode !== 'play') toTitle();
}

// Menu focus with arrow keys / d-pad.
function moveFocus(dir) {
  const screen = SCREENS.map($).find((s) => !s.classList.contains('hidden'));
  if (!screen) return;
  const items = [...screen.querySelectorAll('button:not([disabled]), a.btn, a.arcade-link')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  items[(i + dir + items.length) % items.length].focus();
}
addEventListener('keydown', (e) => {
  if (mode === 'play') return;
  if (e.code === 'ArrowDown' || e.code === 'ArrowRight') { e.preventDefault(); moveFocus(1); }
  if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') { e.preventDefault(); moveFocus(-1); }
  if (mode === 'results' && (e.code === 'Space' || e.code === 'Enter') && document.activeElement === document.body) { e.preventDefault(); restartRun(); }
});

// ------------------------------------------------------------ loop

let pointerIdle = 0;
addEventListener('pointermove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, run: run?.type || 'none', balls: round?.balls?.length ?? 0, attract }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => {
  monitor.reset(performance.now());
  if (document.visibilityState === 'hidden' && mode === 'play') pause();
});

function stepWorld(dt) {
  accumulator += dt;
  let n = 0;
  while (accumulator >= STEP && n < 40) {
    if (attract) pilot?.update(round, STEP);
    else {
      if (pilot) pilot.update(round, STEP);
      if (rivalAI) rivalAI.update(rivalRound, STEP);
    }
    round.step(STEP);
    rivalRound?.step(STEP);
    accumulator -= STEP;
    n++;
  }
  if (n >= 40) accumulator = 0;
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
  const showMeter = playing && !pilot && (input.mode === 'keys' || input.mode === 'pad');
  if (playing && round) {
    meterT += dt;
    nudge = Math.max(-0.6, Math.min(0.6, nudge + input.nudgeAxis() * dt * 0.9));
    if (!pilot) {
      const f = input.takeFlick();
      if (f) shootFromFlick(f);
      if (input.takeShoot()) shootFromMeter();
    } else { input.takeFlick(); input.takeShoot(); }
  }
  if (round && (playing || attract)) {
    stepWorld(dt);
    renderer.handleEvents(round.events, round);
    if (playing) {
      sound.handle(round.events);
      for (const e of round.events) {
        if (e.type === 'miss' && lastShot && e.ball.id === lastShot.id) { coach = coachFor(lastShot); coachT = 1.4; }
        if (e.type === 'fire') log.event('fire.on', { mode: run.type });
        if (e.type === 'hurry') sound.beep(false);
      }
      if (rivalRound) handleRivalEvents();
      updateHud();
      const done = round.status === 'done' && (!rivalRound || rivalRound.status === 'done');
      if (done) {
        endDelay += dt;
        if (endDelay > 0.9) finishRun();
      }
    }
    round.events.length = 0;
  }
  if (coachT > 0) coachT -= dt;
  if (hintT > 0 && playing && round?.status === 'play') hintT -= dt * 0.25;
  if (mode !== 'paused') renderer.update(dt, round);

  let hint = '';
  if (playing && round) {
    if (round.status === 'countdown') hint = '';
    else if (coachT > 0 && coach) hint = coach;
    else if (hintT > 0 && round.stats.shots === 0) hint = showMeter ? 'Press Space when the marker is in the green!' : 'Flick up toward the hoop!';
  }
  let bankStar = null;
  let aimTo = null;
  if (round && round.rules.trick?.need === 'bank' && !attract) {
    const { ideal } = cachedIdeal();
    if (ideal) bankStar = ideal.aim;
  }
  if (showMeter && round.canShoot()) {
    const { ideal } = cachedIdeal();
    if (ideal) aimTo = renderer.screenOf(ideal.aim);
  }
  renderer.draw(round, {
    attract: attract && !playing,
    trail: playing ? input.trail : null,
    meter: showMeter && round.held() ? { value: meterValue(), zone: METER_ZONE, nudge, aimTo } : null,
    hint,
    bankStar,
    hideHero: false,
  });
  requestAnimationFrame(loop);
}

// The keyboard aim arrow needs the ideal every frame; cache it per spot/time slice.
let idealCache = { key: '', ideal: null };
function cachedIdeal() {
  const key = `${round.spotIndex}|${round.hoop.motion ? Math.round(round.time * 20) : 0}|${round.rules.kind}|${round.rules.level || ''}`;
  if (idealCache.key !== key) idealCache = { key, ideal: idealShot(round.shotSetup()) };
  return idealCache;
}

const loop = telemetry ? telemetry.guard(frame, 'hoop-heroes.frame') : frame;

if (location.protocol !== 'file:') {
  log.event('game.ready', { beaten: save.beaten.length, trophies: save.trophies.length, tickets: save.tickets, streak: liveStreak(save, dateKey()) });
  applyCosmetics();
  toTitle();
  const p = params.get('mode');
  if (p === 'daily') startDaily();
  else if (p === 'quick' || p === 'timed' || p === 'moving' || p === 'racks') {
    const kind = p === 'quick' ? 'timed' : p;
    startRun({ type: 'quick', kind, court: params.get('court') || save.equip.court, rules: quickRules(kind, params.get('court') || save.equip.court) });
  } else if (params.get('rival') && RIVAL_BY_ID[params.get('rival')]) toVersus(RIVAL_BY_ID[params.get('rival')]);
  else if (params.get('trick')) {
    const l = TRICK_LEVELS.find((t) => t.id === params.get('trick')) || TRICK_LEVELS[(parseInt(params.get('trick'), 10) || 1) - 1];
    if (l) startRun({ type: 'trick', level: l, court: params.get('court') || save.equip.court, rules: trickRules(l, params.get('court') || save.equip.court) });
  }
  requestAnimationFrame(loop);
}

window.HH = { get round() { return round; }, get rivalRound() { return rivalRound; }, get mode() { return mode; }, save, renderer, input, sound, startRun, startDaily, toTitle };
