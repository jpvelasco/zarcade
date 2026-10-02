// Browser entry: screens, turns, input, the AI worker, sound and saves.
// Game rules live in the DOM-free modules (chess.js, game.js, puzzle-run.js);
// this file only reads them to draw and asks them to play moves.
import { Game, makeSetup, fogVisible, buildPosition } from './game.js';
import { WHITE, BLACK, QUEEN, KNIGHT, ROOK, BISHOP, POWER_SHIELD, POWER_SWAP, POWER_LEAP, mFrom, mTo, mPromo, mFlag, makePiece, sqName } from './chess.js';
import { BoardRenderer, Confetti } from './render.js';
import { Sound } from './audio.js';
import { Brain } from './brain.js';
import { BOTS, FRIEND, pickLine, avatarSvg } from './bots.js';
import { LEVELS } from './ai.js';
import { PUZZLES, CHAPTERS, goalText } from './puzzles.js';
import { PuzzleRun } from './puzzle-run.js';
import { explainMove } from './explain.js';
import { POWERS } from './powers.js';
import { THEMES } from './pieces.js';
import { loadSave, writeSave, recordResult, recordPuzzle, puzzleUnlocked, nextPuzzle, puzzleStarsTotal, botsBeaten, THEMES as THEME_IDS } from './progress.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

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

const renderer = new BoardRenderer($('board'), { reducedMotion: reduced });
const confetti = new Confetti($('fx'), { reducedMotion: reduced });
const sound = new Sound({ muted: !save.settings.sound });
const brain = new Brain({ onError: (kind, msg) => log.error('ai.error', { kind, message: String(msg).slice(0, 200) }) });

const MODE_INFO = {
  classic: { name: 'Classic', desc: 'Good old chess.' },
  fog: { name: 'Fog of War', desc: 'You only see where your pieces can reach.' },
  powers: { name: 'Power Squares', desc: 'Grab glowing squares for one-time powers.' },
  960: { name: 'Chess960', desc: 'The back row is shuffled. Castling still works!' },
};
const MODE_ICONS = {
  classic: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#ffcf5a"/><path d="M38 52 C38 62 32 68 30 74 L70 74 C68 68 62 62 62 52 Z M34 49 Q50 43 66 49 Q66 55 50 55 Q34 55 34 49 Z M37 32 A13 13 0 1 1 63 32 A13 13 0 1 1 37 32 Z M24 84 Q24 76 32 76 L68 76 Q76 76 76 84 Z" fill="#fff8ee" stroke="#3a2614" stroke-width="3.5" stroke-linejoin="round"/></svg>',
  fog: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#5b6bc8"/><path d="M26 64 a12 12 0 0 1 4-23 a16 16 0 0 1 30-6 a13 13 0 0 1 15 12 a10 10 0 0 1-2 17 Z" fill="#e8ecff" stroke="#2a2f70" stroke-width="3.5" stroke-linejoin="round"/><circle cx="42" cy="54" r="4" fill="#2a2f70"/><circle cx="58" cy="54" r="4" fill="#2a2f70"/></svg>',
  powers: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#b77bff"/><path d="M55 14 L30 54 L48 54 L42 86 L70 42 L52 42 Z" fill="#ffe36e" stroke="#3b2266" stroke-width="3.5" stroke-linejoin="round"/></svg>',
  960: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#ff8a5c"/><rect x="24" y="24" width="52" height="52" rx="10" fill="#fff" stroke="#5a1a10" stroke-width="3.5" transform="rotate(-10 50 50)"/><g fill="#5a1a10" transform="rotate(-10 50 50)"><circle cx="37" cy="37" r="5"/><circle cx="63" cy="37" r="5"/><circle cx="50" cy="50" r="5"/><circle cx="37" cy="63" r="5"/><circle cx="63" cy="63" r="5"/></g></svg>',
};
const POWER_TYPES = [POWER_SHIELD, POWER_SWAP, POWER_LEAP];
const POWER_HELP = {
  [POWER_SHIELD]: 'Tap one of your pieces to shield it.',
  [POWER_SWAP]: 'Tap two of your pieces to swap them.',
  [POWER_LEAP]: 'Tap a piece, then where it should jump.',
};
const DRAW_REASONS = {
  stalemate: 'Stalemate: no legal moves, but no check.',
  repetition: 'The same position came up three times.',
  fifty: 'Fifty moves in a row without a capture or a pawn move.',
  material: 'Neither side has enough pieces left to checkmate.',
};

let screen = 'title'; // title | setup | trail | play | paused | result | pass
let match = null;
let botToken = 0;
let pausedFrom = 'play';
let cursorShown = false;

// ------------------------------------------------------------ helpers

const isBotGame = () => match && match.kind === 'game' && match.opponent !== 'friend';
const bot = () => (isBotGame() ? BOTS[match.opponent] : null);
const game = () => (match ? (match.kind === 'puzzle' ? match.run.game : match.game) : null);

function viewColor() {
  if (!match) return WHITE;
  if (match.kind === 'puzzle') return match.run.color;
  if (match.kind === 'attract') return WHITE;
  if (match.opponent === 'friend') return match.mode === 'fog' ? game().turn : WHITE;
  return match.human;
}

function humanTurn() {
  if (!match || match.over || screen !== 'play') return false;
  const g = game();
  if (match.kind === 'puzzle') return !match.waiting && !match.run.solved && g.turn === match.run.color;
  if (match.kind !== 'game') return false;
  if (match.opponent === 'friend') return true;
  return g.turn === match.human && !match.thinking;
}

function seedNow() {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) & 0x7fffffff;
}

function showToast(text, kind = '') {
  const t = $('toast');
  t.className = `toast ${kind}`;
  t.textContent = text;
  // Restart the animation.
  void t.offsetWidth;
  t.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.add('hidden'), 1400);
}

function say(text) {
  if (!text) return;
  const b = $('bubble');
  b.textContent = text;
  b.classList.remove('hidden');
  clearTimeout(say.timer);
  say.timer = setTimeout(() => b.classList.add('hidden'), 2800);
}

const powerIconCache = new Map();
function powerIcon(type) {
  if (powerIconCache.has(type)) return powerIconCache.get(type);
  const color = POWERS[type].color;
  const svg = {
    [POWER_SHIELD]: '<path d="M50 22 L70 30 Q70 58 50 74 Q30 58 30 30 Z" fill="#fff" stroke="#1a1030" stroke-width="6" stroke-linejoin="round"/><path d="M50 34 V62" stroke="COLOR" stroke-width="6" stroke-linecap="round"/>',
    [POWER_SWAP]: '<path d="M28 40 H68 M58 30 L70 40 L58 50 M72 62 H32 M42 52 L30 62 L42 72" fill="none" stroke="#1a1030" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 40 H68 M58 30 L70 40 L58 50 M72 62 H32 M42 52 L30 62 L42 72" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
    [POWER_LEAP]: '<path d="M26 68 Q44 14 70 54 M58 56 L72 58 L73 44" fill="none" stroke="#1a1030" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 68 Q44 14 70 54 M58 56 L72 58 L73 44" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  }[type].replaceAll('COLOR', color);
  const html = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="${color}"/>${svg}</svg>`;
  powerIconCache.set(type, html);
  return html;
}

// ------------------------------------------------------------ screens

const SCREENS = ['screen-title', 'screen-setup', 'screen-trail', 'screen-pause', 'screen-result', 'screen-pass'];

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]):not(.hidden), .node.next, .choice.on, .btn:not([disabled]):not(.hidden)');
    first?.focus({ preventScroll: true });
  } else {
    $('board').focus({ preventScroll: true });
  }
}

function toTitle() {
  screen = 'title';
  closePopups();
  if (!match || match.kind !== 'attract') startAttract();
  $('btn-continue').classList.toggle('hidden', !save.current);
  const stars = puzzleStarsTotal(save), beaten = botsBeaten(save);
  $('title-stats').textContent = stars || beaten ? `Puzzle stars ★ ${stars} / ${PUZZLES.length * 3} · Bots beaten ${beaten} / ${BOTS.length}` : 'New here? Try Pip the Pawn first!';
  updateSettingButtons();
  showScreen('screen-title');
}

function pause() {
  if (screen !== 'play') return;
  screen = 'paused';
  pausedFrom = 'play';
  updateSettingButtons();
  showScreen('screen-pause');
}

function resume() {
  if (screen !== 'paused') return;
  screen = 'play';
  showScreen(null);
  if (match && match.pendingBot) {
    const res = match.pendingBot;
    match.pendingBot = null;
    applyBotMove(res);
  }
  renderer.dirty = true;
}

// ------------------------------------------------------------ setup screen

const setupChoice = { ...save.lastSetup };

function renderSetup() {
  const modes = $('mode-grid');
  modes.innerHTML = '';
  for (const id of ['classic', 'fog', 'powers', '960']) {
    const b = document.createElement('button');
    b.className = `choice${setupChoice.mode === id ? ' on' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(setupChoice.mode === id));
    b.innerHTML = `<span class="mode-icon">${MODE_ICONS[id]}</span><b>${MODE_INFO[id].name}</b><span class="desc">${MODE_INFO[id].desc}</span>`;
    b.addEventListener('click', () => { setupChoice.mode = id; sound.play('ui'); renderSetup(); modes.children[['classic', 'fog', 'powers', '960'].indexOf(id)].focus(); });
    modes.appendChild(b);
  }
  const bots = $('bot-grid');
  bots.innerHTML = '';
  [...BOTS, FRIEND].forEach((bt, i) => {
    const value = bt === FRIEND ? 'friend' : i;
    const on = setupChoice.opponent === value;
    const b = document.createElement('button');
    b.className = `choice${on ? ' on' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(on));
    const rec = bt === FRIEND ? null : save.stats[bt.id];
    const skill = bt === FRIEND ? '' : `<span class="skill" aria-label="Skill ${bt.skill} of 5">${'●'.repeat(bt.skill)}${'○'.repeat(5 - bt.skill)}</span>`;
    b.innerHTML = `${rec && rec.w ? '<span class="medal" title="Beaten!">★</span>' : ''}<span class="bot-face">${avatarSvg(bt.id)}</span><b>${bt.short}</b>${skill}<span class="record">${rec ? `W ${rec.w} · L ${rec.l}` : 'Pass & play'}</span>`;
    b.title = `${bt.name}: ${bt.blurb}`;
    b.addEventListener('click', () => { setupChoice.opponent = value; sound.play('ui'); renderSetup(); $('bot-grid').children[i].focus(); });
    bots.appendChild(b);
  });
  $('color-block').classList.toggle('hidden', setupChoice.opponent === 'friend');
  for (const c of document.querySelectorAll('[data-color]')) c.classList.toggle('on', c.dataset.color === setupChoice.color);
  const chosen = setupChoice.opponent === 'friend' ? FRIEND : BOTS[setupChoice.opponent];
  $('setup-desc').textContent = `${MODE_INFO[setupChoice.mode].desc} ${chosen.blurb}`;
  $('btn-start').textContent = setupChoice.opponent === 'friend' ? `Start ${MODE_INFO[setupChoice.mode].name} with a friend!` : `Play ${MODE_INFO[setupChoice.mode].name} vs ${chosen.short}!`;
}

function toSetup() {
  sound.unlock();
  screen = 'setup';
  closePopups();
  if (!match || match.kind !== 'attract') startAttract();
  renderSetup();
  showScreen('screen-setup');
}

// ------------------------------------------------------------ puzzle trail

function renderTrail() {
  const trail = $('trail');
  trail.innerHTML = '';
  $('trail-stars').textContent = `★ ${puzzleStarsTotal(save)} / ${PUZZLES.length * 3}`;
  const STEP = 78, LABEL = 64;
  let y = 10;
  const pts = [];
  let chapter = null;
  const bands = [];
  const next = nextPuzzle(save);
  PUZZLES.forEach((p, i) => {
    const ch = CHAPTERS.find((c) => c.id === p.chapter);
    if (ch !== chapter) {
      chapter = ch;
      if (bands.length) bands[bands.length - 1].end = y;
      bands.push({ ch, start: y, end: y });
      const label = document.createElement('div');
      label.className = 'chapter-label';
      label.style.top = `${y}px`;
      label.style.setProperty('--chap', ch.color);
      label.innerHTML = `<span>${ch.name}<small>${ch.blurb}</small></span>`;
      trail.appendChild(label);
      y += LABEL;
    }
    y += STEP / 2;
    const x = 50 + Math.sin(i * 0.8) * 34;
    pts.push([x, y]);
    const open = puzzleUnlocked(save, i);
    const stars = save.puzzles[p.id] || 0;
    const b = document.createElement('button');
    b.className = `node${stars ? ' done' : ''}${i === next && open ? ' next' : ''}`;
    b.style.left = `${x}%`;
    b.style.top = `${y}px`;
    b.style.setProperty('--chap', ch.color);
    b.disabled = !open;
    b.innerHTML = `${open ? i + 1 : '<span class="lock">🔒</span>'}<span class="st">${stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : ''}</span>`;
    b.setAttribute('aria-label', `Puzzle ${i + 1}: ${p.title}${open ? '' : ' (locked)'}${stars ? `, ${stars} stars` : ''}`);
    b.title = `${i + 1}. ${p.title}`;
    b.addEventListener('click', () => startPuzzle(i));
    trail.appendChild(b);
    y += STEP / 2;
  });
  trail.style.height = `${y + 30}px`;
  if (bands.length) bands[bands.length - 1].end = y + 30;
  for (const b of bands) {
    const el = document.createElement('div');
    el.className = 'band';
    el.style.top = `${b.start - 6}px`;
    el.style.height = `${b.end - b.start + 6}px`;
    el.style.setProperty('--chap', b.ch.color);
    trail.prepend(el);
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'path');
  svg.setAttribute('viewBox', `0 0 100 ${y + 30}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  let d = '';
  pts.forEach(([x, py], i) => {
    if (!i) { d = `M${x} ${py}`; return; }
    const [px, ppy] = pts[i - 1];
    d += ` C${px} ${ppy + 30} ${x} ${py - 30} ${x} ${py}`;
  });
  svg.innerHTML = `<path d="${d}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 16" vector-effect="non-scaling-stroke"/>`;
  trail.prepend(svg);
}

function toTrail() {
  sound.unlock();
  screen = 'trail';
  closePopups();
  if (!match || match.kind !== 'attract') startAttract();
  renderTrail();
  showScreen('screen-trail');
  const node = document.querySelector('#trail .node.next') || document.querySelector('#trail .node:not([disabled])');
  node?.focus({ preventScroll: true });
  node?.scrollIntoView({ block: 'center' });
}

// ------------------------------------------------------------ starting play

function newMatch(fields) {
  botToken++;
  brain.cancel();
  closePopups();
  match = {
    selected: -1, targets: null, targetMoves: null, powerMode: null, hint: null, hintPiece: -1, drag: null,
    thinking: false, over: null, review: false, hints: 0, undos: 0, startedAt: performance.now(), pendingBot: null,
    waiting: false, cursor: -1, ...fields,
  };
  renderer.anims.length = 0;
  renderer.setFlipped(viewColor() === BLACK);
  queueMicrotask(() => monitor.mark(performance.now()));
}

function startGame({ mode, opponent, color }) {
  sound.unlock();
  const seed = seedNow();
  const human = opponent === 'friend' ? WHITE : color === 'b' ? BLACK : color === 'w' ? WHITE : (seed & 1 ? BLACK : WHITE);
  const g = new Game(makeSetup(mode, seed));
  save.lastSetup = { mode, opponent, color };
  newMatch({ kind: 'game', mode, opponent, human, game: g, seed });
  cursorShown = false;
  match.cursor = defaultCursor();
  persistGame();
  log.event('level.start', { mode, opponent: opponent === 'friend' ? 'friend' : BOTS[opponent].id, color: human === WHITE ? 'w' : 'b', ...(mode === '960' ? { 'chess960.index': g.setup.index } : {}) });
  enterPlay();
  if (isBotGame()) say(pickLine(bot(), 'hello'));
  if (match.opponent === 'friend' && mode === 'fog') showPass();
  else afterTurn();
}

function resumeSaved() {
  const cur = save.current;
  if (!cur) return;
  let g;
  try {
    g = Game.fromSave(cur);
  } catch (err) {
    log.warn('save.replay_failed', { message: String(err.message).slice(0, 120) });
    save.current = null;
    persist();
    toTitle();
    return;
  }
  sound.unlock();
  const opponent = cur.opponent === 'friend' ? 'friend' : Math.max(0, Math.min(BOTS.length - 1, cur.opponent | 0));
  newMatch({ kind: 'game', mode: g.setup.mode || 'classic', opponent, human: cur.human === BLACK ? BLACK : WHITE, game: g, seed: cur.seed | 0, hints: cur.hints | 0 });
  match.cursor = defaultCursor();
  log.event('game.resume', { mode: match.mode, moves: g.history.length });
  enterPlay();
  if (isBotGame()) say('Welcome back! Your move.');
  if (match.opponent === 'friend' && match.mode === 'fog') showPass();
  else afterTurn();
}

function startPuzzle(i) {
  sound.unlock();
  const p = PUZZLES[i];
  const run = new PuzzleRun(p);
  newMatch({ kind: 'puzzle', mode: 'puzzle', run, puzzle: p, puzzleIndex: i });
  match.cursor = defaultCursor();
  log.event('level.start', { mode: 'puzzle', puzzle: p.id, index: i + 1, chapter: p.chapter });
  enterPlay();
}

function startAttract() {
  newMatch({ kind: 'attract', mode: 'classic', opponent: -1, game: new Game(makeSetup('classic')), seed: seedNow() });
  renderer.setFlipped(false);
  updateHud();
  scheduleAttract();
}

function scheduleAttract() {
  const token = ++botToken;
  setTimeout(() => {
    if (token !== botToken || !match || match.kind !== 'attract') return;
    const g = match.game;
    if (g.status().over || g.history.length > 120) { startAttract(); return; }
    brain.ask({ type: 'move', setup: g.setup, moves: g.uciMoves(), level: g.turn === WHITE ? 1 : 2, seed: match.seed + g.history.length }).then((res) => {
      if (token !== botToken || !match || match.kind !== 'attract') return;
      const m = res.move && g.pos.moveFromUci(res.move);
      if (!m) { startAttract(); return; }
      const rec = g.play(m);
      renderer.animateMove(rec);
      updateHud();
      scheduleAttract();
    });
  }, 1300);
}

function enterPlay() {
  screen = 'play';
  showScreen(null);
  $('app').classList.remove('attract');
  updateHud();
}

function defaultCursor() {
  const c = viewColor();
  return c === WHITE ? 0x14 : 0x64; // e2 / e7
}

// ------------------------------------------------------------ turns

function persistGame() {
  if (!match || match.kind !== 'game') return;
  if (match.over) save.current = null;
  else save.current = { ...match.game.toSave(), opponent: match.opponent, human: match.human, seed: match.seed, hints: match.hints };
  persist();
}

function afterTurn() {
  updateHud();
  if (!match || match.kind !== 'game') return;
  const st = match.game.status();
  if (st.over) { finishGame(st); return; }
  if (isBotGame() && match.game.turn !== match.human) requestBotMove();
}

function requestBotMove() {
  const g = match.game;
  const level = match.opponent;
  const token = ++botToken;
  match.thinking = true;
  updateHud();
  const t0 = performance.now();
  const last = g.lastMove;
  const coach = save.settings.coach && level <= 2 && last && last.color === match.human;
  brain.ask({ type: 'move', setup: g.setup, moves: g.uciMoves(), level, seed: (match.seed + g.history.length * 7919) | 0, coach }).then((res) => {
    if (token !== botToken || !match) return;
    const wait = Math.max(0, LEVELS[level].minMs - (performance.now() - t0));
    setTimeout(() => {
      if (token !== botToken || !match) return;
      log.event('ai.think', { bot: BOTS[level].id, 'think.ms': res.ms ?? -1, 'wall.ms': Math.round(performance.now() - t0), depth: res.depth ?? 0, nodes: res.nodes ?? 0, mode: match.mode });
      if (screen === 'paused') { match.pendingBot = res; return; }
      applyBotMove(res);
    }, wait);
  });
}

function applyBotMove(res) {
  const g = match.game;
  match.thinking = false;
  let m = res.move ? g.pos.moveFromUci(res.move) : 0;
  if (!m) {
    log.error('ai.bad_move', { move: String(res.move), fen: g.fen });
    m = g.legal[0];
    if (!m) { afterTurn(); return; }
  }
  let note = null;
  if (res.coach && res.coach.best) {
    try {
      const moves = g.uciMoves();
      const before = buildPosition(g.setup, moves.slice(0, -1));
      const after = buildPosition(g.setup, moves);
      const played = before.moveFromUci(res.coach.played);
      note = explainMove(before, played, {
        best: before.moveFromUci(res.coach.best), bestScore: res.coach.bestScore, playedScore: res.coach.playedScore,
        reply: res.coach.reply ? after.moveFromUci(res.coach.reply) : 0,
      }, BOTS[match.opponent].short);
    } catch (err) {
      log.warn('coach.failed', { message: String(err.message).slice(0, 120) });
    }
  }
  const rec = g.play(m);
  onMoveApplied(rec, 'bot');
  persistGame();
  if (note && !g.status().over) {
    $('coach-text').textContent = note.text;
    $('coach').classList.remove('hidden');
    match.coachNote = note;
    log.event('coach.tip', { severity: note.severity, loss: Math.round(note.loss) });
  }
  afterTurn();
}

function playHuman(m) {
  if (!humanTurn()) return;
  clearSelection();
  $('coach').classList.add('hidden');
  if (match.kind === 'puzzle') { puzzleMove(m); return; }
  const rec = match.game.play(m);
  onMoveApplied(rec, 'human');
  if (rec.power) log.event('power.used', { power: POWERS[rec.power].id, by: 'player' });
  persistGame();
  if (match.opponent === 'friend' && match.mode === 'fog' && !match.game.status().over) {
    updateHud();
    setTimeout(() => { if (match && !match.over && screen === 'play') showPass(); }, reduced ? 100 : 450);
    return;
  }
  afterTurn();
}

function onMoveApplied(rec, who) {
  renderer.animateMove(rec);
  match.hint = null;
  match.hintPiece = -1;
  // Sounds.
  if (rec.power === POWER_SHIELD) sound.play('shield');
  else if (rec.power === POWER_SWAP) sound.play('swap');
  else if (rec.power === POWER_LEAP) sound.play('leap');
  else if (rec.check) sound.play('check');
  else if (rec.captured) sound.play('capture');
  else if (rec.flag === 3 || rec.flag === 4) sound.play('castle');
  else sound.play('move');
  if (rec.promo) setTimeout(() => sound.play('promote'), 120);
  if (rec.collected) {
    setTimeout(() => sound.play('power'), 160);
    const mine = who === 'human' || (match.opponent === 'friend');
    showToast(`${mine && match.opponent !== 'friend' ? 'You got' : who === 'bot' ? `${bot().short} got` : `${rec.color === WHITE ? 'White' : 'Black'} got`} ${POWERS[rec.collected].name}!`, 'power');
  } else if (rec.power && who === 'bot') {
    showToast(`${bot().short} used ${POWERS[rec.power].name}!`, 'power');
  }
  // Bot chatter.
  if (isBotGame()) {
    const b = bot();
    if (who === 'bot') {
      if (rec.check) say(pickLine(b, 'check'));
      else if (rec.captured && Math.random() < 0.6) say(pickLine(b, 'capture'));
    } else if (rec.check && Math.random() < 0.7) say(pickLine(b, 'checked'));
    else if (rec.captured && (rec.captured & 7) >= 2 && Math.random() < 0.6) say(pickLine(b, 'captured'));
  }
  updateHud();
}

// ------------------------------------------------------------ puzzles

function puzzleMove(m) {
  const run = match.run;
  const res = run.try(m);
  if (!res.ok) {
    sound.play('wrong');
    showToast(run.mistakes >= 2 ? 'Not quite. Read the tip!' : 'Not quite, try again!', 'bad');
    log.event('puzzle.mistake', { puzzle: match.puzzle.id, mistakes: run.mistakes });
    renderer.burst(mTo(m), 4);
    updateHud();
    return;
  }
  onMoveApplied(res.rec, 'human');
  if (res.solved) {
    sound.play('right');
    match.over = { reason: 'solved' };
    setTimeout(() => finishPuzzle(run), reduced ? 200 : 650);
    return;
  }
  sound.play('right');
  showToast(['Nice!', 'Great move!', 'Yes!'][run.step % 3], 'good');
  match.waiting = true;
  updateHud();
  setTimeout(() => {
    if (!match || match.kind !== 'puzzle' || match.run !== run) return;
    const rec = run.playReply();
    match.waiting = false;
    if (rec) onMoveApplied(rec, 'bot');
    updateHud();
  }, reduced ? 250 : 700);
}

function finishPuzzle(run) {
  // A Retry or a new puzzle since the solve: that attempt is not this one.
  if (!match || match.kind !== 'puzzle' || match.run !== run) return;
  const p = match.puzzle;
  const stars = run.stars();
  const rec = recordPuzzle(save, p.id, stars);
  persist();
  const ms = Math.round(performance.now() - match.startedAt);
  log.event('level.complete', { mode: 'puzzle', puzzle: p.id, index: match.puzzleIndex + 1, stars, mistakes: run.mistakes, hints: run.hints, 'time.ms': ms, first: rec.first });
  confetti.burst(THEMES[save.settings.theme].particles.concat(['#ffd84f']));
  sound.play('win');
  screen = 'result';
  const last = match.puzzleIndex === PUZZLES.length - 1;
  $('result-avatar').innerHTML = avatarSvg('owl');
  $('result-title').textContent = last ? 'You finished the trail!' : 'Puzzle solved!';
  $('result-sub').textContent = `${match.puzzleIndex + 1}. ${p.title}`;
  $('result-stars').classList.remove('hidden');
  $('result-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('');
  $('result-line').textContent = stars === 3 ? 'Hoo! Perfect, no slips!' : stars === 2 ? 'Well done! Try again for three stars.' : 'Solved! Practice makes perfect.';
  $('result-lines').innerHTML = `<div><span>Slips</span><b>${run.mistakes}</b></div><div><span>Hints</span><b>${run.hints}</b></div><div><span>Trail stars</span><b>★ ${puzzleStarsTotal(save)} / ${PUZZLES.length * 3}</b></div>`;
  $('btn-result-next').textContent = last ? 'Back to the trail' : 'Next puzzle →';
  $('btn-result-board').classList.add('hidden');
  $('btn-result-setup').textContent = 'Puzzle Trail';
  setTimeout(() => sound.play('star'), 300);
  showScreen('screen-result');
}

// ------------------------------------------------------------ game over

function finishGame(st) {
  match.over = st;
  match.thinking = false;
  botToken++;
  clearSelection();
  $('coach').classList.add('hidden');
  const g = match.game;
  const moves = Math.ceil(g.history.length / 2);
  const ms = Math.round(performance.now() - match.startedAt);
  let outcome = 'd';
  if (isBotGame()) {
    outcome = st.winner === -1 ? 'd' : st.winner === match.human ? 'w' : 'l';
    const first = recordResult(save, BOTS[match.opponent].id, outcome);
    match.firstWin = first;
  } else save.friendGames++;
  persistGame();
  const attrs = { mode: match.mode, opponent: isBotGame() ? BOTS[match.opponent].id : 'friend', result: outcome, reason: st.reason, moves, 'time.ms': ms, hints: match.hints, undos: match.undos };
  if (outcome === 'l') log.event('level.fail', attrs);
  else log.event('level.complete', attrs);
  updateHud();
  const celebrate = st.reason === 'checkmate' && (outcome === 'w' || !isBotGame());
  setTimeout(() => {
    if (!match || match.over !== st) return;
    if (celebrate) { confetti.burst(THEMES[save.settings.theme].particles.concat(['#ffd84f', '#7bd36a'])); sound.play('win'); }
    else if (outcome === 'l') sound.play('lose');
    else sound.play('draw');
    showResult(st, outcome);
  }, reduced ? 300 : 900);
}

function showResult(st, outcome) {
  screen = 'result';
  const g = match.game;
  const moves = Math.ceil(g.history.length / 2);
  const b = bot();
  $('result-stars').classList.add('hidden');
  $('btn-result-board').classList.remove('hidden');
  $('btn-result-next').textContent = 'Play again';
  $('btn-result-setup').textContent = 'New game';
  let title, sub, line = '';
  if (b) {
    $('result-avatar').innerHTML = avatarSvg(b.id);
    if (outcome === 'w') { title = 'Checkmate! You win!'; sub = `You beat ${b.name} in ${moves} moves.${match.firstWin ? ' First win against them!' : ''}`; line = pickLine(b, 'lose'); }
    else if (outcome === 'l') { title = `${b.short} wins this time`; sub = `Checkmate after ${moves} moves. Rematch?`; line = pickLine(b, 'win'); }
    else { title = "It's a draw!"; sub = DRAW_REASONS[st.reason] || ''; line = pickLine(b, 'draw'); }
  } else {
    $('result-avatar').innerHTML = avatarSvg('friend');
    if (st.winner === -1) { title = "It's a draw!"; sub = DRAW_REASONS[st.reason] || ''; }
    else { title = `Checkmate! ${st.winner === WHITE ? 'White' : 'Black'} wins!`; sub = `After ${moves} moves. Great game, both of you!`; }
  }
  $('result-title').textContent = title;
  $('result-sub').textContent = sub;
  $('result-line').textContent = line;
  const lines = [['Game', MODE_INFO[match.mode].name], ['Moves', moves]];
  if (b) { const r = save.stats[b.id]; lines.push([`Record vs ${b.short}`, `${r.w} W · ${r.l} L · ${r.d} D`]); }
  if (match.hints) lines.push(['Hints used', match.hints]);
  $('result-lines').innerHTML = lines.map(([a, v]) => `<div><span>${a}</span><b>${v}</b></div>`).join('');
  showScreen('screen-result');
}

function lookAtBoard() {
  screen = 'play';
  match.review = true;
  showScreen(null);
  updateHud();
}

function playAgain() {
  if (!match) return;
  if (match.kind === 'puzzle') {
    const i = match.puzzleIndex;
    if (i >= PUZZLES.length - 1) toTrail(); else startPuzzle(i + 1);
    return;
  }
  startGame({ mode: match.mode, opponent: match.opponent, color: save.lastSetup.color });
}

// ------------------------------------------------------------ undo and hints

function undo() {
  if (!match) return;
  if (match.kind === 'puzzle') {
    if (match.run.solved) return; // the result card is on its way
    startPuzzle(match.puzzleIndex);
    return;
  }
  if (match.kind !== 'game') return;
  const g = match.game;
  if (!humanMovesMade()) { sound.play('illegal'); return; }
  botToken++;
  brain.cancel();
  match.thinking = false;
  match.pendingBot = null;
  if (match.opponent === 'friend') g.undo();
  else {
    let n = 0;
    while (g.history.length && (g.turn !== match.human || n === 0)) { g.undo(); n++; }
  }
  match.over = null;
  match.review = false;
  match.undos++;
  $('coach').classList.add('hidden');
  clearSelection();
  renderer.anims.length = 0;
  renderer.dirty = true;
  sound.play('select');
  log.event('undo.used', { mode: match.mode, moves: g.history.length });
  persistGame();
  afterTurn();
}

function humanMovesMade() {
  const g = match.game;
  if (match.opponent === 'friend') return g.history.length > 0;
  return g.history.some((h) => h.color === match.human);
}

function hint() {
  if (!humanTurn() || !save.settings.hints) return;
  if (match.kind === 'puzzle') {
    const h = match.run.hint();
    if (!h) return;
    if (h.level === 1) { match.hintPiece = h.from; showToast('This piece!', 'good'); }
    else { match.hint = [mFrom(h.move), hintTarget(h.move)]; match.hintPiece = -1; }
    sound.play('hint');
    log.event('hint.used', { mode: 'puzzle', puzzle: match.puzzle.id, level: h.level });
    updateHud();
    return;
  }
  const g = match.game;
  const token = ++botToken;
  match.thinking = true;
  match.hints++;
  updateHud();
  brain.ask({ type: 'hint', setup: g.setup, moves: g.uciMoves(), timeMs: 700 }).then((res) => {
    if (token !== botToken || !match) return;
    match.thinking = false;
    const m = res.move && g.pos.moveFromUci(res.move);
    if (m) {
      match.hint = [mFrom(m), hintTarget(m)];
      sound.play('hint');
    }
    log.event('hint.used', { mode: match.mode, 'think.ms': res.ms ?? -1 });
    updateHud();
  });
}

function hintTarget(m) {
  const f = mFlag(m);
  if (f === 3 || f === 4) { const base = mFrom(m) & 0x70; const k = base + (f === 3 ? 6 : 2); return k === mFrom(m) ? mTo(m) : k; }
  return mTo(m);
}

// ------------------------------------------------------------ selection and input

function clearSelection() {
  if (!match) return;
  match.selected = -1;
  match.targets = null;
  match.targetMoves = null;
  match.powerMode = null;
  match.drag = null;
  $('promo').classList.add('hidden');
  renderer.dirty = true;
}

function closePopups() {
  $('promo').classList.add('hidden');
  $('coach').classList.add('hidden');
  $('bubble').classList.add('hidden');
}

function select(sq) {
  const g = game();
  match.selected = sq;
  match.targetMoves = g.movesFrom(sq);
  match.targets = new Map();
  for (const [t, ms] of match.targetMoves) {
    const f = mFlag(ms[0]);
    match.targets.set(t, (g.pos.board[t] && f !== 3 && f !== 4) || f === 2);
  }
  if (!save.settings.showMoves) match.targets = new Map();
  sound.play('select');
  renderer.dirty = true;
  updateHud();
}

// The fog mask for the current position and viewer, cached per move.
function fogMask() {
  if (!match || match.mode !== 'fog' || match.over || match.kind !== 'game') return null;
  const g = game(), color = viewColor();
  const c = match.fogCache;
  if (c && c.plies === g.history.length && c.color === color && c.hash === g.pos.h1) return c.mask;
  match.fogCache = { plies: g.history.length, color, hash: g.pos.h1, mask: fogVisible(g.pos, color) };
  return match.fogCache.mask;
}

function visibleToPlayer(sq) {
  const mask = fogMask();
  return !mask || !!mask[sq];
}

function onSquare(sq) {
  if (!humanTurn() || sq < 0) return;
  const g = game();
  if (match.powerMode) { powerClick(sq); return; }
  if (match.selected >= 0 && match.targetMoves) {
    const moves = match.targetMoves.get(sq);
    if (moves) { chooseMove(moves, sq); return; }
    if (sq === match.selected) { clearSelection(); updateHud(); return; }
  }
  const p = g.pos.board[sq];
  if (p && (p >> 3) === g.turn) { select(sq); return; }
  if (match.selected >= 0) sound.play('illegal');
  clearSelection();
  updateHud();
}

function chooseMove(moves, sq) {
  if (moves.length === 1) { playHuman(moves[0]); return; }
  // Promotion: pick a piece.
  const g = game();
  const color = g.turn;
  const box = $('promo');
  box.innerHTML = '';
  for (const type of [QUEEN, KNIGHT, ROOK, BISHOP]) {
    const m = moves.find((x) => mPromo(x) === type);
    if (!m) continue;
    const b = document.createElement('button');
    b.innerHTML = `<img alt="" src="${renderer.pieceImage(makePiece(color, type))}">`;
    b.setAttribute('aria-label', ['', '', 'Knight', 'Bishop', 'Rook', 'Queen'][type]);
    b.addEventListener('click', () => { box.classList.add('hidden'); playHuman(m); });
    box.appendChild(b);
  }
  const [cx, cy] = renderer.centerCss(sq);
  const css = renderer.css;
  box.style.left = `${Math.max(140, Math.min(css - 120, cx)) + 10}px`;
  box.style.top = `${Math.max(50, Math.min(css - 30, cy)) + 10}px`;
  box.classList.remove('hidden');
  box.querySelector('button')?.focus();
}

// Power Squares: pick a power, then the pieces.
function togglePower(type) {
  if (!humanTurn() || match.mode !== 'powers') return;
  const g = game();
  if (g.powerCount(g.turn, type) <= 0) return;
  if (match.powerMode && match.powerMode.type === type) { clearSelection(); updateHud(); return; }
  clearSelection();
  const moves = g.powerMoves(type);
  if (!moves.length) { showToast(`No ${POWERS[type].name} move right now`, 'bad'); sound.play('illegal'); return; }
  match.powerMode = { type, first: -1, moves };
  sound.play('select');
  updatePowerTargets();
  updateHud();
}

function updatePowerTargets() {
  const pm = match.powerMode;
  match.targets = null;
  match.eligible = new Set();
  if (!pm) return;
  if (pm.first < 0) {
    for (const m of pm.moves) { match.eligible.add(mFrom(m)); if (pm.type === POWER_SWAP) match.eligible.add(mTo(m)); }
  } else if (pm.type === POWER_LEAP) {
    match.targets = new Map();
    for (const m of pm.moves) if (mFrom(m) === pm.first) match.targets.set(mTo(m), !!game().pos.board[mTo(m)]);
  } else if (pm.type === POWER_SWAP) {
    for (const m of pm.moves) {
      if (mFrom(m) === pm.first) match.eligible.add(mTo(m));
      if (mTo(m) === pm.first) match.eligible.add(mFrom(m));
    }
  }
  renderer.dirty = true;
}

function powerClick(sq) {
  const pm = match.powerMode;
  if (pm.type === POWER_SHIELD) {
    const m = pm.moves.find((x) => mFrom(x) === sq);
    if (m) playHuman(m); else { clearSelection(); updateHud(); }
    return;
  }
  if (pm.first < 0) {
    const ok = pm.moves.some((x) => mFrom(x) === sq || (pm.type === POWER_SWAP && mTo(x) === sq));
    if (!ok) { clearSelection(); updateHud(); return; }
    pm.first = sq;
    match.selected = sq;
    sound.play('select');
    updatePowerTargets();
    updateHud();
    return;
  }
  if (pm.type === POWER_LEAP) {
    const moves = pm.moves.filter((x) => mFrom(x) === pm.first && mTo(x) === sq);
    if (moves.length) { chooseMove(moves, sq); return; }
  } else {
    const m = pm.moves.find((x) => (mFrom(x) === pm.first && mTo(x) === sq) || (mTo(x) === pm.first && mFrom(x) === sq));
    if (m) { playHuman(m); return; }
  }
  if (sq === pm.first) { pm.first = -1; match.selected = -1; updatePowerTargets(); updateHud(); return; }
  clearSelection();
  updateHud();
}

// Pointer: click-click or drag-and-drop.
const boardEl = $('board');
let press = null;
boardEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  e.preventDefault();
  sound.unlock();
  cursorShown = false;
  if (!humanTurn()) return;
  const sq = renderer.squareAt(e.clientX, e.clientY);
  if (sq < 0) return;
  const g = game();
  const wasSelected = match.selected === sq;
  if (match.powerMode && match.powerMode.type !== POWER_LEAP) { powerClick(sq); return; }
  if (match.powerMode) {
    if (match.powerMode.first >= 0 && match.targets && match.targets.has(sq)) { powerClick(sq); return; }
    powerClick(sq);
    if (match.powerMode && match.powerMode.first === sq) press = { sq, x: e.clientX, y: e.clientY, drag: false, wasSelected: false, power: true };
    return;
  }
  if (match.selected >= 0 && match.targetMoves && match.targetMoves.has(sq)) { onSquare(sq); return; }
  const p = g.pos.board[sq];
  if (p && (p >> 3) === g.turn && visibleToPlayer(sq)) {
    if (!wasSelected) select(sq);
    press = { sq, x: e.clientX, y: e.clientY, drag: false, wasSelected };
    try { boardEl.setPointerCapture(e.pointerId); } catch { /* optional */ }
  } else onSquare(sq);
});
boardEl.addEventListener('pointermove', (e) => {
  if (!press || !match) return;
  if (!press.drag && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
    press.drag = true;
    match.drag = { piece: game().pos.board[press.sq], from: press.sq, x: e.clientX, y: e.clientY };
  }
  if (press.drag && match.drag) { match.drag.x = e.clientX; match.drag.y = e.clientY; renderer.dirty = true; }
});
function endPress(e) {
  if (!press || !match) { press = null; return; }
  const p = press;
  press = null;
  if (p.drag) {
    match.drag = null;
    renderer.dirty = true;
    const sq = renderer.squareAt(e.clientX, e.clientY);
    if (sq >= 0 && match.targets && match.targets.has(sq)) {
      if (match.powerMode) powerClick(sq); else onSquare(sq);
    }
    return;
  }
  if (p.wasSelected && !p.power) { clearSelection(); updateHud(); }
}
boardEl.addEventListener('pointerup', endPress);
boardEl.addEventListener('pointercancel', (e) => { if (match) match.drag = null; press = null; renderer.dirty = true; void e; });
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

function moveCursor(df, dr) {
  if (!match) return;
  if (!cursorShown) { cursorShown = true; renderer.dirty = true; return; }
  const flip = renderer.flipped ? -1 : 1;
  let f = (match.cursor & 7) + df * flip, r = (match.cursor >> 4) + dr * flip;
  f = Math.max(0, Math.min(7, f));
  r = Math.max(0, Math.min(7, r));
  match.cursor = r * 16 + f;
  renderer.dirty = true;
}

function cursorPick() {
  if (!match) return;
  if (!cursorShown) { cursorShown = true; renderer.dirty = true; return; }
  onSquare(match.cursor);
}

// ------------------------------------------------------------ pass and play

function showPass() {
  screen = 'pass';
  const color = game().turn;
  $('pass-title').textContent = `Pass to ${color === WHITE ? 'White' : 'Black'}`;
  $('pass-icon').innerHTML = `<img alt="" src="${renderer.pieceImage(makePiece(color, KNIGHT), 192)}">`;
  showScreen('screen-pass');
}

function passReady() {
  if (screen !== 'pass') return;
  screen = 'play';
  renderer.setFlipped(viewColor() === BLACK);
  showScreen(null);
  afterTurn();
}

// ------------------------------------------------------------ HUD

function trayHtml(pieces, adv) {
  const order = (p) => -(p & 7);
  const imgs = pieces.slice().sort((a, b) => order(a) - order(b)).map((p) => `<img alt="" src="${renderer.pieceImage(p)}">`).join('');
  return imgs + (adv > 0 ? `<span class="adv">+${adv}</span>` : '');
}

function powersHtml(g, color, interactive) {
  if (!g.pos.inv) return '';
  let html = '';
  for (const type of POWER_TYPES) {
    const n = g.powerCount(color, type);
    if (!n) continue;
    const pw = POWERS[type];
    if (interactive) {
      const active = match.powerMode && match.powerMode.type === type;
      html += `<button class="power-btn${active ? ' active' : ''}" data-power="${type}" style="--pc:${pw.color}" title="${pw.name} (${POWER_TYPES.indexOf(type) + 1}): ${pw.blurb}" aria-pressed="${active}">${powerIcon(type)}<span class="lbl">${pw.name}</span>${n > 1 ? `<span class="n">×${n}</span>` : ''}</button>`;
    } else {
      html += `<span class="power-chip" style="--pc:${pw.color}" title="${pw.name}: ${pw.blurb}">${powerIcon(type)}${n > 1 ? `×${n}` : ''}</span>`;
    }
  }
  return html;
}

let lastHud = '';
function updateHud() {
  if (!match) return;
  const g = game();
  const bottom = viewColor(), top = bottom ^ 1;
  const friend = match.opponent === 'friend';
  const b = bot();
  const names = {};
  const avatars = {};
  if (match.kind === 'attract') {
    names[WHITE] = BOTS[1].name; avatars[WHITE] = 'bella';
    names[BLACK] = BOTS[2].name; avatars[BLACK] = 'captain';
  } else if (match.kind === 'puzzle') {
    names[bottom] = 'You'; avatars[bottom] = 'you';
    names[top] = 'Puzzle'; avatars[top] = 'owl';
  } else if (friend) {
    names[WHITE] = 'White'; avatars[WHITE] = 'you';
    names[BLACK] = 'Black'; avatars[BLACK] = 'friend';
  } else {
    names[match.human] = 'You'; avatars[match.human] = 'you';
    names[match.human ^ 1] = b.name; avatars[match.human ^ 1] = b.id;
  }
  const balance = g.materialBalance();
  const adv = (c) => (c === WHITE ? balance : -balance);
  const fog = match.mode === 'fog' && !match.over && match.kind === 'game';

  const status = g.status();
  const humanPlays = humanTurn();
  let statusText = '', sub = '', checkCls = false;
  const turnName = g.turn === WHITE ? 'White' : 'Black';
  if (match.kind === 'attract') { statusText = 'Bots at play'; }
  else if (match.kind === 'puzzle') {
    const p = match.puzzle;
    statusText = match.run.solved ? 'Solved!' : match.waiting ? 'Reply…' : goalText(p, match.run.color);
    sub = match.run.mistakes >= 1 || match.run.hints ? `Tip: ${p.tip}` : `${match.puzzleIndex + 1}. ${p.title}`;
  } else if (match.over) {
    statusText = status.reason === 'checkmate' ? 'Checkmate!' : 'Draw';
    sub = status.reason === 'checkmate' ? `${status.winner === WHITE ? 'White' : 'Black'} wins.` : DRAW_REASONS[status.reason] || '';
  } else if (match.thinking && isBotGame() && g.turn !== match.human) {
    statusText = `${b.short} is thinking…`;
  } else if (match.thinking) {
    statusText = 'Finding a hint…';
  } else {
    statusText = friend ? `${turnName} to move` : 'Your move';
    if (status.check) { statusText = friend ? `${turnName}: check!` : 'Check! Save your king'; checkCls = true; }
  }
  if (match.powerMode) sub = POWER_HELP[match.powerMode.type];
  else if (match.kind === 'game' && !match.over && !sub) {
    if (match.mode === 'fog') sub = 'You only see squares your pieces can reach.';
    else if (match.mode === 'powers') sub = g.pos.inv && POWER_TYPES.some((t) => g.powerCount(g.turn, t)) && humanPlays ? 'Tap a power to use it, or just move.' : 'Step on a glowing square to grab a power.';
    else if (match.mode === '960') sub = `Starting position #${g.setup.index}`;
  }
  const modeName = match.kind === 'puzzle' ? `Puzzle Trail · ${CHAPTERS.find((c) => c.id === match.puzzle.chapter).name}` : MODE_INFO[match.mode]?.name || '';

  // Rebuild DOM only when something visible changed.
  const key = JSON.stringify([bottom, names, g.history.length, statusText, sub, checkCls, humanPlays, match.thinking, match.powerMode && [match.powerMode.type, match.powerMode.first], save.settings.theme, match.over && match.over.reason, match.review, modeName, save.settings.hints]);
  if (key === lastHud) { renderer.dirty = true; return; }
  lastHud = key;

  $('top-name').textContent = names[top];
  $('bottom-name').textContent = names[bottom];
  $('top-avatar').innerHTML = avatarSvg(avatars[top]);
  $('bottom-avatar').innerHTML = avatarSvg(avatars[bottom]);
  $('top-tray').innerHTML = trayHtml(g.capturedBy(top), adv(top));
  $('bottom-tray').innerHTML = trayHtml(g.capturedBy(bottom), adv(bottom));
  $('top-powers').innerHTML = powersHtml(g, top, false);
  $('bottom-powers').innerHTML = powersHtml(g, bottom, humanPlays && match.kind === 'game');
  $('bar-top').classList.toggle('turn', !match.over && g.turn === top);
  $('bar-bottom').classList.toggle('turn', !match.over && g.turn === bottom);
  $('top-thinking').classList.toggle('hidden', !(match.thinking && g.turn === top && isBotGame()));
  $('info-mode').textContent = modeName;
  $('info-status').textContent = statusText;
  $('info-status').classList.toggle('check', checkCls);
  $('info-sub').textContent = sub;

  // Move list.
  const list = $('moves');
  const h = g.history;
  const startBlack = h.length && h[0].color === BLACK;
  let html = '';
  const items = startBlack ? [null, ...h] : h;
  const hideFor = fog ? viewColor() ^ 1 : -1;
  for (let i = 0; i < items.length; i += 2) {
    const n = Math.floor(i / 2) + 1;
    const cell = (rec, idx) => {
      if (!rec) return '<span class="mv">…</span>';
      const hidden = rec.color === hideFor;
      return `<span class="mv${idx === items.length - 1 ? ' last' : ''}${rec.power ? ' power' : ''}">${hidden ? '???' : rec.san}</span>`;
    };
    html += `<li><span class="num">${n}.</span>${cell(items[i], i)}${items[i + 1] !== undefined ? cell(items[i + 1], i + 1) : '<span></span>'}</li>`;
  }
  if (!h.length) html = `<li><span class="empty">${match.kind === 'puzzle' ? 'Find the best move!' : 'No moves yet. White starts.'}</span></li>`;
  list.innerHTML = html;
  list.scrollTop = list.scrollHeight;

  const puzzle = match.kind === 'puzzle';
  $('btn-undo').innerHTML = puzzle ? '<span aria-hidden="true">↻</span> Retry' : '<span aria-hidden="true">↶</span> Undo';
  $('btn-undo').disabled = match.kind === 'attract' || (!puzzle && (match.kind !== 'game' || !humanMovesMade()));
  $('btn-hint').disabled = !humanPlays || !save.settings.hints || !!match.over;
  $('btn-hint').classList.toggle('hidden', !!(match.over && match.review));
  $('btn-again').classList.toggle('hidden', !(match.over && match.review));
  renderer.dirty = true;
}

function boardView() {
  const g = game();
  const pos = g.pos;
  const last = g.lastMove;
  const fog = fogMask();
  let lastSq = null;
  if (last) {
    if (last.slides.length) lastSq = [last.slides[0].from, last.slides[0].to];
    else lastSq = [mFrom(last.move)];
  }
  const st = pos.inCheck() ? pos.kings[pos.turn] : -1;
  return {
    board: pos.board,
    selected: match.selected,
    targets: match.targets,
    last: lastSq,
    check: st,
    cursor: cursorShown && screen === 'play' && match.kind !== 'attract' ? match.cursor : -1,
    hint: match.hint,
    focus: match.hintPiece,
    fog,
    powerSq: pos.powerSq,
    shield: pos.shield,
    eligible: match.powerMode ? match.eligible : null,
    drag: match.drag,
  };
}

// ------------------------------------------------------------ settings

function updateSettingButtons() {
  const s = save.settings;
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = s.sound ? 'Sound: on' : 'Sound: off';
  for (const b of document.querySelectorAll('[data-theme-btn]')) b.textContent = `Board: ${THEMES[s.theme].name}`;
  $('btn-toggle-moves').textContent = `Show moves: ${s.showMoves ? 'on' : 'off'}`;
  $('btn-toggle-coach').textContent = `Coach: ${s.coach ? 'on' : 'off'}`;
}

function applyTheme() {
  const t = save.settings.theme;
  document.body.classList.remove(...THEME_IDS.map((x) => `theme-${x}`));
  document.body.classList.add(`theme-${t}`);
  renderer.setTheme(t);
  $('logo-knight').innerHTML = `<img alt="" src="${renderer.pieceImage(makePiece(WHITE, KNIGHT), 192)}">`;
  document.querySelector('.coach-owl').innerHTML = avatarSvg('owl');
  lastHud = '';
  updateHud();
}

function cycleTheme() {
  const i = THEME_IDS.indexOf(save.settings.theme);
  save.settings.theme = THEME_IDS[(i + 1) % THEME_IDS.length];
  persist();
  applyTheme();
  updateSettingButtons();
  sound.play('ui');
}

function toggleSound() {
  save.settings.sound = !save.settings.sound;
  sound.unlock();
  sound.setMuted(!save.settings.sound);
  persist();
  updateSettingButtons();
  sound.play('ui');
}

// ------------------------------------------------------------ wiring

$('btn-new').addEventListener('click', toSetup);
$('btn-continue').addEventListener('click', resumeSaved);
$('btn-trail').addEventListener('click', toTrail);
$('btn-start').addEventListener('click', () => startGame(setupChoice));
for (const c of document.querySelectorAll('[data-color]')) c.addEventListener('click', () => { setupChoice.color = c.dataset.color; sound.play('ui'); renderSetup(); c.focus(); });
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', toTitle);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', toTitle);
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleSound);
for (const b of document.querySelectorAll('[data-theme-btn]')) b.addEventListener('click', cycleTheme);
$('btn-resume').addEventListener('click', resume);
$('btn-pause-new').addEventListener('click', toSetup);
$('btn-pause-trail').addEventListener('click', toTrail);
$('btn-toggle-moves').addEventListener('click', () => { save.settings.showMoves = !save.settings.showMoves; persist(); updateSettingButtons(); });
$('btn-toggle-coach').addEventListener('click', () => { save.settings.coach = !save.settings.coach; persist(); updateSettingButtons(); });
$('btn-flip').addEventListener('click', () => { renderer.setFlipped(!renderer.flipped); resume(); });
$('btn-menu').addEventListener('click', () => (screen === 'play' ? pause() : null));
$('btn-undo').addEventListener('click', undo);
$('btn-hint').addEventListener('click', hint);
$('btn-again').addEventListener('click', playAgain);
$('btn-result-next').addEventListener('click', playAgain);
$('btn-result-board').addEventListener('click', lookAtBoard);
$('btn-result-setup').addEventListener('click', () => (match && match.kind === 'puzzle' ? toTrail() : toSetup()));
$('btn-pass').addEventListener('click', passReady);
$('btn-coach-ok').addEventListener('click', () => $('coach').classList.add('hidden'));
$('btn-coach-undo').addEventListener('click', () => { $('coach').classList.add('hidden'); undo(); });
$('bottom-powers').addEventListener('click', (e) => {
  const b = e.target.closest('[data-power]');
  if (b) togglePower(Number(b.dataset.power));
});
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function back() {
  if (screen === 'paused') resume();
  else if (screen === 'setup' || screen === 'trail') toTitle();
  else if (screen === 'result') toTitle();
}

function moveFocus(dir) {
  const el = SCREENS.map($).find((s) => !s.classList.contains('hidden'));
  if (!el) return;
  const items = [...el.querySelectorAll('button:not([disabled]), a[href]')].filter((x) => x.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
}

addEventListener('keydown', (e) => {
  const k = e.code;
  if (k === 'Escape' || k === 'KeyP') {
    if (screen === 'play') {
      if (k === 'Escape' && match && (match.selected >= 0 || match.powerMode || !$('promo').classList.contains('hidden'))) { clearSelection(); updateHud(); }
      else pause();
    } else if (screen === 'paused') resume();
    else if (k === 'Escape') back();
    e.preventDefault();
    return;
  }
  if (k === 'KeyM') { toggleSound(); return; }
  if (screen !== 'play') {
    if (['ArrowRight', 'ArrowDown'].includes(k)) { e.preventDefault(); moveFocus(1); }
    if (['ArrowLeft', 'ArrowUp'].includes(k)) { e.preventDefault(); moveFocus(-1); }
    return;
  }
  if (!$('promo').classList.contains('hidden')) {
    if (['ArrowRight', 'ArrowDown'].includes(k)) { e.preventDefault(); const bs = [...$('promo').children]; bs[(bs.indexOf(document.activeElement) + 1) % bs.length].focus(); }
    if (['ArrowLeft', 'ArrowUp'].includes(k)) { e.preventDefault(); const bs = [...$('promo').children]; bs[(bs.indexOf(document.activeElement) + bs.length - 1) % bs.length].focus(); }
    return;
  }
  const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
  switch (k) {
    case 'ArrowLeft': e.preventDefault(); moveCursor(-1, 0); break;
    case 'ArrowRight': e.preventDefault(); moveCursor(1, 0); break;
    case 'ArrowUp': e.preventDefault(); moveCursor(0, 1); break;
    case 'ArrowDown': e.preventDefault(); moveCursor(0, -1); break;
    case 'Enter': case 'Space': if (!onButton) { e.preventDefault(); cursorPick(); } break;
    case 'KeyH': hint(); break;
    case 'KeyU': case 'Backspace': undo(); break;
    case 'Digit1': togglePower(POWER_SHIELD); break;
    case 'Digit2': togglePower(POWER_SWAP); break;
    case 'Digit3': togglePower(POWER_LEAP); break;
    default: break;
  }
});

// Gamepad: d-pad moves the cursor, A picks, B cancels, X hint, Y undo, Start pauses.
const padPrev = {};
function pollPad() {
  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (!pad) return;
  const b = (i) => !!pad.buttons[i]?.pressed;
  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  const now = { a: b(0), b: b(1), x: b(2), y: b(3), start: b(9), up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6 };
  const edge = (k) => now[k] && !padPrev[k];
  if (edge('start')) { if (screen === 'play') pause(); else if (screen === 'paused') resume(); }
  if (screen === 'play') {
    if (edge('left')) moveCursor(-1, 0);
    if (edge('right')) moveCursor(1, 0);
    if (edge('up')) moveCursor(0, 1);
    if (edge('down')) moveCursor(0, -1);
    if (edge('a')) { if (!$('promo').classList.contains('hidden')) document.activeElement?.click?.(); else cursorPick(); }
    if (edge('b')) { clearSelection(); updateHud(); }
    if (edge('x')) hint();
    if (edge('y')) undo();
  } else {
    if (edge('up') || edge('left')) moveFocus(-1);
    if (edge('down') || edge('right')) moveFocus(1);
    if (edge('a')) document.activeElement?.click?.();
    if (edge('b')) back();
  }
  Object.assign(padPrev, now);
}

// ------------------------------------------------------------ layout

function layout() {
  const w = innerWidth, h = innerHeight;
  // Phones on their side put the player bars beside the board (style.css,
  // "short landscape") so the board can use the full height.
  const sideways = w > h && h <= 560;
  const portrait = !sideways && (w / h <= 1 || w <= 760);
  let size;
  if (sideways) size = Math.min(h - 28 - 12, w - 28 - 12 - 12 - 240);
  else if (portrait) size = Math.min(w - 28 - 12, h - 52 - 2 * 52 - 12 - 46 - 52 - 26);
  else size = Math.min(h - 58 - 14 - 2 * 62 - 20, w - 300 - 22 - 28 - 20);
  size = Math.max(184, Math.floor(size / 8) * 8);
  document.documentElement.style.setProperty('--board', `${size}px`);
  renderer.resize(size);
  confetti.resize();
  renderer.dirty = true;
}
addEventListener('resize', layout);

// ------------------------------------------------------------ loop

// Hide the pointer after ~2 s without movement during play.
let pointerIdle = 0;
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', screen === 'play' && pointerIdle > 2);
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ screen, kind: match ? match.kind : 'none', mode: match ? match.mode : 'none', plies: match && game() ? game().history.length : 0 }),
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
  pollPad();
  updatePointer(dt);
  const moving = renderer.update(dt);
  const view = match ? boardView() : null;
  // Glowing power squares and hint arrows keep the board alive; otherwise
  // it only redraws when something changed.
  const pulsing = view && (view.powerSq || view.hint);
  if (view && (renderer.dirty || moving || pulsing)) renderer.draw(view);
  if (confetti.active) { confetti.update(dt); confetti.draw(); }
  else if (confetti.drawn) { confetti.draw(); }
  confetti.drawn = confetti.active;
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture.
const loop = telemetry ? telemetry.guard(frame, 'knight-shift.frame') : frame;

if (location.protocol !== 'file:') {
  layout();
  applyTheme();
  updateSettingButtons();
  log.event('game.ready', { 'puzzle.stars': puzzleStarsTotal(save), 'bots.beaten': botsBeaten(save), saved: !!save.current, theme: save.settings.theme });
  const pz = parseInt(params.get('puzzle'), 10);
  if (pz >= 1 && pz <= PUZZLES.length) startPuzzle(pz - 1);
  else if (params.has('mode') || params.has('bot')) {
    const mode = ['classic', 'fog', 'powers', '960'].includes(params.get('mode')) ? params.get('mode') : 'classic';
    const bp = params.get('bot');
    const opponent = bp === 'friend' ? 'friend' : Math.max(0, Math.min(BOTS.length - 1, parseInt(bp, 10) || 0));
    startGame({ mode, opponent, color: params.get('color') === 'b' ? 'b' : 'w' });
  } else toTitle();
  requestAnimationFrame(loop);
}

// Debugging and browser checks.
window.KS = {
  get match() { return match; }, get screen() { return screen; }, save, renderer, brain, sound,
  game, startGame, startPuzzle, onSquare, playHuman, undo, hint, sqName, PUZZLES,
};
