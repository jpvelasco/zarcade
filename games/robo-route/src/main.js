// Browser entry: screens, the program panel, running Bolt, the frame loop,
// sound, saves and telemetry.
import { WORLDS, LEVELS, LEVEL } from './levels.js';
import {
  parseLevel, program, programSize, createRun, replay, features, formatProgram, parseProgram, cloneList,
  starsFor, countTiles,
} from './rules.js';
import {
  newState, recordWin, totalStars, worldStars, worldSolved, worldOpen, levelOpen, nextLevel, unlocked, zap,
  liveStreak, needText, PAINTS, TOPPERS, BUGS, BUG, WORLD_UNLOCK,
} from './progress.js';
import { dailyLevel, dayKey } from './daily.js';
import { encodeLevel, decodeLevel } from './code.js';
import { loadSave, writeSave, clearSave, STORAGE_KEY } from './save.js';
import { Renderer, drawBolt, drawTopper, THEMES } from './render.js';
import { Animator } from './animator.js';
import { Panel } from './panel.js';
import { Editor, draftFromDef, blankDraft } from './editor.js';
import { Sound } from './audio.js';
import { ICON, TILE_INFO, PALETTE_ORDER, colourBadge } from './icons.js';
import { drawBug } from './bugs-art.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = params.has('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) document.body.classList.add('reduced');
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

// ------------------------------------------------------------------- save

const storage = (() => { try { return localStorage; } catch { return null; } })();
if (params.has('fresh')) clearSave(storage);
const loaded = loadSave(storage);
const state = loaded.state;
const unlockAll = params.has('unlock');
if (params.has('speed')) state.settings.speed = [1, 2, 4].includes(Number(params.get('speed'))) ? Number(params.get('speed')) : 1;
let saveWarned = false;
let dirty = false;
function persist() {
  dirty = false;
  if (writeSave(storage, state) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

// ------------------------------------------------------------------ parts

const sound = new Sound({ muted: state.settings.muted, music: state.settings.music });
const renderer = new Renderer($('board'), { reducedMotion: reduced });
const panel = new Panel(
  { palette: $('palette'), brushes: $('brushes'), strips: $('strips'), ghost: $('ghost') },
  { onEdit, onBlocked, sound },
);

const paintOf = () => PAINTS.find((p) => p.id === state.paint) || PAINTS[0];
const view = { bolt: null, lit: [], got: [], paint: paintOf(), topper: state.topper, chevron: true, startMark: null };

let mode = 'title'; // title | map | play | paused | editor
let modal = null; // null | result | sheet
let sheetKind = null;
let current = null;
let anim = null;
let mapWorld = 1;
let pointerIdle = 0;
let bubbleTimer = 0;
let saveClock = 0;
let autopilot = params.has('autopilot');
let crashNext = false;
const today = params.get('daily') || dayKey();
let dailyDef = null;

const runner = { run: null, status: 'idle', trace: [], endTimer: 0, result: null, lastEv: null };

const hooks = {
  sound: (name, opt) => sound.play(name, opt),
  burst: (x, y, h, kind, n) => renderer.burst(x, y, h, kind, n),
  shake: (v) => { if (!reduced) renderer.shake = v; },
  flash: (v) => { if (!reduced) renderer.flash = v; },
  lamp: () => { state.stats.lamps++; },
};

// ----------------------------------------------------------------- demo

// The title and map screens show Bolt looping a solution on a demo board.
const DEMOS = ['2-8', '4-5', '3-9', '5-2'];
const demo = { i: 0, level: null, prog: null, run: null, anim: null, wait: 0 };
function startDemo() {
  const def = LEVEL[DEMOS[demo.i % DEMOS.length]];
  demo.level = parseLevel(def);
  demo.prog = program(def.solution.main, def.solution.p1 || '');
  demo.run = createRun(demo.level, demo.prog);
  demo.anim = new Animator(demo.level, { burst: hooks.burst });
  demo.wait = 0.8;
  renderer.inset = { top: 0, bottom: 0, left: 0, right: 0 };
  renderer.setLevel(demo.level, WORLDS[def.world - 1].theme);
}
function stepDemo(dt) {
  if (!demo.anim) return;
  if (demo.wait > 0) {
    demo.wait -= dt;
    if (demo.wait <= 0 && demo.run.done) { demo.i++; startDemo(); }
  } else if (!demo.anim.busy) {
    if (demo.run.done) {
      demo.anim.setPost(demo.run.result === 'win' ? 'win' : 'shrug');
      if (demo.run.result === 'win') renderer.burst(demo.anim.pose.x, demo.anim.pose.y, demo.anim.pose.h, 'confetti', 30);
      demo.wait = 2.2;
    } else {
      const ev = demo.run.step();
      if (ev) demo.anim.begin(ev, 2);
    }
  }
  demo.anim.update(dt);
}

// --------------------------------------------------------------- screens

const OVERLAYS = ['screen-title', 'screen-map', 'screen-pause', 'screen-result', 'screen-sheet'];

function show(id) {
  for (const s of OVERLAYS) $(s).classList.toggle('hidden', s !== id && !(s === 'screen-sheet' && modal === 'sheet'));
  const playing = mode === 'play' || mode === 'paused';
  $('hud').classList.toggle('hidden', !playing);
  $('panel').classList.toggle('hidden', !playing);
  $('editor').classList.toggle('hidden', mode !== 'editor');
  document.body.classList.toggle('titling', !playing && mode !== 'editor');
  document.body.classList.toggle('playing', playing);
  document.body.classList.toggle('editing', mode === 'editor');
  sound.setMusicLevel(mode === 'play' ? 0.8 : 1);
  if (id) $(id).querySelector('.btn.primary, .node.next, .btn')?.focus({ preventScroll: true });
}

// What the strips need, measured from their contents: the element itself is
// stretched to fill the panel, so its own height is only what it was given.
// A Repeat block is taller than a tile, so leave room for one to grow.
function stripsHeight(el) {
  const cs = getComputedStyle(el);
  const kids = [...el.children];
  let h = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  for (const k of kids) h += k.offsetHeight;
  h += parseFloat(cs.rowGap || cs.gap || 8) * Math.max(0, kids.length - 1);
  if (current?.level.ops.includes('@')) h += 40;
  return h;
}

function relayout() {
  const playing = mode === 'play' || mode === 'paused';
  const narrow = innerWidth < 520;
  renderer.inset = playing ? { top: narrow ? 50 : 58, bottom: 4, left: 0, right: 0 } : mode === 'editor' ? { top: 56, bottom: 0, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 };
  if (playing && matchMedia('(max-width: 860px) and (min-height: 521px), (orientation: portrait)').matches) {
    // Phones: give the board whatever the program panel does not need.
    const pnl = $('panel');
    const cs = getComputedStyle(pnl);
    let need = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const kids = [...pnl.children].filter((k) => !k.classList.contains('hidden'));
    for (const k of kids) need += k === $('strips') ? stripsHeight(k) : k.offsetHeight;
    need += parseFloat(cs.rowGap || cs.gap || 6) * (kids.length - 1) + 3;
    const boardH = Math.max(innerHeight * 0.36, Math.min(innerHeight * 0.6, innerHeight - need));
    document.documentElement.style.setProperty('--board-h', `${Math.round(boardH)}px`);
  }
  if (mode === 'title') {
    // Show the demo board beside (or above) the title card.
    const r = document.querySelector('.title-card').getBoundingClientRect();
    if (innerWidth - r.right > 320) renderer.inset.left = r.right + 10;
    else if (r.top > 220) renderer.inset.bottom = innerHeight - r.top + 6;
  }
  renderer.resize();
  queueMicrotask(() => monitor.mark(performance.now()));
}

function toTitle() {
  stopRun();
  mode = 'title';
  modal = null;
  current = null;
  refreshTitle();
  startDemo();
  show('screen-title');
  relayout();
}

function refreshTitle() {
  const stars = totalStars(state);
  const bits = [];
  if (stars) bits.push(`★ ${stars}/${LEVELS.length * 3} stars`);
  const bugs = Object.keys(state.bugs).length;
  if (bugs) bits.push(`🐞 ${bugs}/${BUGS.length} bugs`);
  const streak = liveStreak(state, today);
  if (streak) bits.push(`☀️ ${streak}-day streak`);
  $('title-best').textContent = bits.join(' · ') || 'Bolt is charged up and ready to roll.';
  $('btn-play').textContent = stars ? 'Keep coding!' : "Let's code!";
  updateSoundButtons();
}

function toMap(world) {
  stopRun();
  if (!demo.level || (mode !== 'title' && mode !== 'map')) startDemo();
  mode = 'map';
  modal = null;
  current = null;
  if (world) mapWorld = world;
  renderMap();
  show('screen-map');
  relayout();
}

function renderMap() {
  const w = WORLDS[mapWorld - 1];
  const open = unlockAll || worldOpen(state, w.id);
  $('map-title').textContent = w.name;
  $('map-sub').textContent = `${w.idea} · ★ ${worldStars(state, w.id)}/${w.levels.length * 3}`;
  $('map-prev').disabled = mapWorld <= 1;
  $('map-next').disabled = mapWorld >= WORLDS.length;
  const t = THEMES[w.theme];
  $('nodes').style.setProperty('--world-bg', `linear-gradient(180deg, ${t.bg[0]}, ${t.bg[1]})`);
  const dots = $('world-dots');
  dots.textContent = '';
  for (const ww of WORLDS) {
    const b = document.createElement('button');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(ww.id === mapWorld));
    b.setAttribute('aria-label', `${ww.name}${unlockAll || worldOpen(state, ww.id) ? '' : ' (locked)'}`);
    b.title = ww.name;
    b.className = `tile ${iconClass(ww.icon)}${unlockAll || worldOpen(state, ww.id) ? '' : ' locked'}`;
    b.innerHTML = ww.icon === 'c' ? colourBadgeIcon() : ICON[ww.icon];
    b.addEventListener('click', () => { mapWorld = ww.id; sound.play('click'); renderMap(); });
    dots.appendChild(b);
  }
  const nodes = $('nodes');
  nodes.textContent = '';
  if (!open) {
    const need = WORLD_UNLOCK - worldSolved(state, w.id - 1);
    const p = document.createElement('p');
    p.className = 'world-lock';
    p.textContent = `🔒 Solve ${need} more level${need === 1 ? '' : 's'} in ${WORLDS[w.id - 2].name} to open ${w.name}.`;
    nodes.appendChild(p);
  } else {
    const suggest = suggestLevel();
    w.levels.forEach((id, i) => {
      const def = LEVEL[id];
      const rec = state.levels[id];
      const ok = unlockAll || levelOpen(state, id);
      const b = document.createElement('button');
      b.className = `node${rec?.stars ? ' done' : ''}${rec?.stars === 3 ? ' three' : ''}${ok ? '' : ' locked'}${id === suggest ? ' next' : ''}`;
      const stars = rec?.stars || 0;
      b.innerHTML = `<span class="n">${ok ? i + 1 : '🔒'}</span><span class="st">${[1, 2, 3].map((k) => `<span class="${k <= stars ? 'on' : ''}">★</span>`).join('')}</span><span class="nm">${def.name}</span>`;
      b.setAttribute('aria-label', `Level ${id}, ${def.name}. ${ok ? `${stars} stars` : 'locked'}`);
      b.disabled = !ok;
      b.addEventListener('click', () => { sound.unlock(); sound.play('click'); startLevel(def, 'campaign'); });
      nodes.appendChild(b);
    });
  }
  const streak = liveStreak(state, today);
  $('map-streak').textContent = state.daily.done[today] ? '✓ done' : streak ? `🔥 ${streak}` : '';
  $('map-bugcount').textContent = `${Object.keys(state.bugs).length}/${BUGS.length}`;
}

function iconClass(op) {
  return `op-${op === '*' ? 'L1' : op === '@' ? 'rep' : op === '1' ? 'p1' : op}`;
}
function colourBadgeIcon() {
  return '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="11" cy="16" r="7" fill="#ff5a6e"/><path d="M22 9l7 7-7 7-7-7z" fill="#3f8cff"/></svg>';
}

function suggestLevel() {
  const last = state.last && LEVEL[state.last];
  if (last && !state.levels[last.id]?.stars && levelOpen(state, last.id)) return last.id;
  return LEVELS.find((l) => levelOpen(state, l.id) && !state.levels[l.id]?.stars)?.id || null;
}

// ----------------------------------------------------------------- play

function themeFor(def, kind) {
  if (kind === 'daily') return 'daily';
  if (kind === 'custom') return 'custom';
  return WORLDS[def.world - 1].theme;
}

function startLevel(def, kind = 'campaign', opts = {}) {
  stopRun();
  const level = parseLevel(def);
  const draftKey = kind === 'campaign' ? def.id : kind === 'daily' ? 'daily' : null;
  let prog = { main: [], p1: [] };
  const draft = draftKey && state.drafts[draftKey];
  if (draft && (kind !== 'daily' || draft.day === today)) {
    try { prog = program(draft.main, draft.p1); } catch { prog = { main: [], p1: [] }; }
  }
  current = {
    def, level, kind, prog, draftKey,
    runs: 0, hints: 0, editedWhilePaused: false, started: performance.now(),
    editorTest: !!opts.editorTest,
  };
  if (kind === 'campaign') state.last = def.id;
  anim = new Animator(level, hooks);
  runner.run = null;
  runner.status = 'idle';
  runner.trace = [];
  mode = 'play';
  modal = null;
  renderer.setLevel(level, themeFor(def, kind));
  panel.setLevel(level, prog);
  $('level-num').textContent = kind === 'daily' ? '☀️' : kind === 'custom' ? '🛠️' : def.id;
  $('level-name').textContent = def.name;
  $('btn-hint').classList.toggle('hidden', !def.solution);
  updateParPill();
  updateRunButtons();
  hideBubble();
  show(null);
  relayout();
  log.event('level.start', { level: kind === 'campaign' ? def.id : kind, kind, par: def.par });
  const teach = def.teach && kind === 'campaign' ? [...new Set(def.teach.match(/@@|[^@]|@/g))] : [];
  const fresh = teach.filter((k) => !state.seenTeach[k]);
  if (fresh.length && !autopilot) setTimeout(() => { if (current && current.def === def) openTeach(fresh); }, 350);
  if (autopilot && def.solution) {
    current.prog.main.length = 0;
    current.prog.p1.length = 0;
    const ref = program(def.solution.main, def.solution.p1 || '');
    current.prog.main.push(...ref.main);
    current.prog.p1.push(...ref.p1);
    panel.setProgram(current.prog);
    const go = () => {
      if (!autopilot || !current || current.def !== def) return;
      if (runner.status === 'idle' && !modal) run(); else if (runner.status === 'idle') setTimeout(go, 400);
    };
    setTimeout(go, 500);
  }
  dirty = true;
}

let goalText = '';
function updateGoal() {
  if (!current) return;
  const lv = current.level;
  const lit = anim.lit.filter(Boolean).length;
  const got = anim.got.filter(Boolean).length;
  const steps = runner.run ? runner.run.steps : 0;
  const text = `${lv.lamps.length}|${lit}|${lv.batteries.length}|${got}|${steps}`;
  if (text === goalText) return;
  goalText = text;
  const el = $('goal');
  el.textContent = '';
  const pill = (txt, done, cls = '', label = '') => {
    const s = document.createElement('span');
    s.className = `${cls}${done ? ' done' : ''}`;
    s.textContent = txt;
    if (label) s.setAttribute('aria-label', label);
    el.appendChild(s);
  };
  if (lv.lamps.length) pill(`💡 ${lit}/${lv.lamps.length}`, lit === lv.lamps.length, '', `${lit} of ${lv.lamps.length} lamps lit`);
  if (lv.batteries.length) pill(`🔋 ${got}/${lv.batteries.length}`, got === lv.batteries.length, '', `${got} of ${lv.batteries.length} batteries`);
  pill(`👣 ${steps}`, false, 'g-steps', `${steps} steps`);
}

function updateParPill() {
  if (!current) return;
  const used = programSize(current.prog);
  $('par-n').textContent = current.def.par < 99 ? current.def.par : '?';
  $('par-pill').classList.toggle('over', current.def.par < 99 && used > current.def.par);
  $('par-pill').title = `Use ${current.def.par} tiles or fewer for 3 stars (you have ${used})`;
}

function updateRunButtons() {
  const s = runner.status;
  const running = s === 'running';
  $('btn-run').innerHTML = running ? `${ICON.pause}<span>Pause</span>` : `${ICON.play}<span>${s === 'paused' ? 'Go on' : 'Run'}</span>`;
  $('btn-run').classList.toggle('pausing', running);
  $('btn-run').setAttribute('aria-label', running ? 'Pause (Space)' : 'Run (Space)');
  $('btn-step').innerHTML = ICON.step;
  $('btn-reset').innerHTML = ICON.reset;
  $('btn-clear').innerHTML = ICON.clear;
  $('btn-speed').textContent = `${state.settings.speed}×`;
  $('btn-hint').innerHTML = ICON.hint;
  $('btn-reset').disabled = s === 'idle';
}

function beginRun() {
  panel.clearHighlight();
  hideBubble();
  anim.reset();
  runner.run = createRun(current.level, current.prog);
  runner.trace = [];
  runner.result = null;
  current.runs++;
  current.editedWhilePaused = false;
  state.stats.runs++;
  sound.unlock();
}

function run() {
  if (!current || modal) return;
  const s = runner.status;
  if (s === 'ending') return;
  if (s === 'running') { runner.status = 'paused'; updateRunButtons(); return; }
  if (s === 'idle') {
    if (!countTiles(current.prog.main)) { bubble('Put some tiles in the ▶ strip first!'); panel.bump('main'); sound.play('shrug'); return; }
    beginRun();
  }
  runner.status = 'running';
  updateRunButtons();
}

function step() {
  if (!current || modal) return;
  const s = runner.status;
  if (s === 'ending') return;
  if (s === 'running') { runner.status = 'paused'; updateRunButtons(); return; }
  if (s === 'idle') {
    if (!countTiles(current.prog.main)) { bubble('Put some tiles in the ▶ strip first!'); sound.play('shrug'); return; }
    beginRun();
  }
  if (anim.busy) anim.complete();
  runner.status = 'stepping';
  state.stats.stepPresses++;
  if (state.stats.stepPresses >= 10) award('step');
  updateRunButtons();
}

function resetRun(quiet = false) {
  if (!current) return;
  const moved = runner.status !== 'idle';
  runner.run = null;
  runner.status = 'idle';
  runner.trace = [];
  anim.reset();
  panel.highlight({ now: null, active: [], skip: null });
  if (moved && !quiet) {
    sound.play('rewind');
    renderer.burst(anim.pose.x, anim.pose.y, anim.pose.h, 'glow', 10);
  }
  updateRunButtons();
}

function stopRun() {
  runner.run = null;
  runner.status = 'idle';
}

function turnCamera() {
  renderer.rotate(1);
  sound.play('turn', { dir: 1 });
}

function cycleSpeed() {
  const s = state.settings.speed;
  state.settings.speed = s === 1 ? 2 : s === 2 ? 4 : 1;
  sound.play('click');
  updateRunButtons();
  dirty = true;
}

// Called by the panel after any program edit.
function onEdit() {
  if (!current) return;
  saveDraft();
  updateParPill();
  panel.lit.bug = null;
  const s = runner.status;
  if (s === 'running' || s === 'stepping' || s === 'paused') {
    if (anim.busy) anim.complete();
    const k = runner.run.steps;
    const r = replay(current.level, current.prog, k);
    const same = !r.run.done && r.trace.length === runner.trace.length && r.trace.every((t, i) => t === runner.trace[i]);
    if (same) {
      runner.run = r.run;
      runner.status = 'paused';
      current.editedWhilePaused = true;
      if (s === 'running') bubble('Paused so you can edit. Press Run to carry on.');
    } else {
      resetRun();
      bubble('⟲ You changed a tile Bolt already used, so he starts again.');
    }
    updateRunButtons();
  } else if (s === 'ending' && runner.result !== 'win') {
    resetRun(true);
  }
  panel.applyHighlight();
}

function onBlocked(kind, strip) {
  sound.play('shrug');
  if (kind === 'full') bubble(strip === 'p1' ? 'The P1 strip is full.' : 'The ▶ strip is full. Can a Repeat or P1 save some tiles?');
  if (kind === 'nest') bubble('Two Repeats deep is the limit.');
  if (kind === 'recursion') bubble('P1 can\'t call itself yet. Soon!');
}

function saveDraft() {
  if (!current?.draftKey) return;
  state.drafts[current.draftKey] = { main: formatProgram(current.prog.main), p1: formatProgram(current.prog.p1), day: current.kind === 'daily' ? today : undefined };
  dirty = true;
}

// One frame of the runner: pull events while running, animate, finish.
function tickRunner(dt) {
  if (!current) return;
  const s = runner.status;
  if ((s === 'running' || s === 'stepping') && !anim.busy && runner.run && !runner.run.done) {
    const ev = runner.run.step();
    if (ev) {
      runner.lastEv = ev;
      runner.trace.push(`${ev.uid ?? 0}:${ev.kind}`);
      state.stats.steps++;
      anim.begin(ev, state.settings.speed);
      panel.highlight({ now: ev.uid ?? null, active: ev.active || [], skip: ev.kind === 'skip' ? ev.uid : null });
    }
  }
  const finished = anim.update(dt);
  if (finished || ((s === 'running' || s === 'stepping') && !anim.busy && runner.run?.done && runner.status !== 'ending')) {
    if (runner.run?.done) finishRun();
    else if (runner.status === 'stepping') { runner.status = 'paused'; updateRunButtons(); }
  }
  if (runner.status === 'ending') {
    runner.endTimer -= dt;
    if (runner.endTimer <= 0) {
      if (runner.result === 'win') showResult();
      else {
        const bug = panel.lit.bug;
        resetRun(true);
        panel.highlight({ bug });
      }
    }
  }
}

const FAIL_TEXT = {
  wall: (lv) => (lv.ops.includes('J') ? 'Bonk! Too tall to roll up. Try a Jump!' : 'Bonk! Something is in the way.'),
  drop: (lv) => (lv.ops.includes('J') ? 'Whoa! Too steep to roll down. Jump instead!' : 'Whoa! That is a big drop.'),
  edge: () => 'Whoa! Nothing to stand on there.',
  high: () => 'Bonk! Too high to jump. One step at a time.',
  unfinished: () => 'Bolt ran out of tiles, but some work is left.',
  steps: () => 'Bolt got tired. Is he going round in circles?',
  depth: () => 'Bolt got dizzy from too many P1 calls.',
  loop: () => 'Bolt got tired. Nothing happens in that loop!',
};

function finishRun() {
  const run = runner.run;
  const result = run.result;
  runner.result = result;
  runner.status = 'ending';
  updateRunButtons();
  const lv = current.level;
  const ev = runner.lastEv;
  if (result === 'win') {
    anim.setPost('win');
    runner.endTimer = reduced ? 0.9 : 1.6;
    renderer.burst(anim.pose.x, anim.pose.y, anim.pose.h, 'confetti', 40);
    sound.play('win');
    panel.highlight({ now: null, active: [] });
    return;
  }
  let reason = ev?.reason || (result === 'end' ? 'unfinished' : 'steps');
  if (result === 'tired' && ev?.tired) reason = 'steps';
  if (result === 'bonk') {
    anim.setPost('bonk');
    state.stats.bonks++;
    award('bonk');
    panel.highlight({ now: null, bug: ev?.uid ?? null });
  } else if (result === 'end') {
    anim.setPost('shrug');
    sound.play('shrug');
    award('shrug');
  } else {
    anim.setPost('sleepy');
    sound.play('tired');
    award('tired');
    for (let i = 0; i < 3; i++) renderer.burst(anim.pose.x, anim.pose.y, anim.pose.h + 1, 'glow', 2);
  }
  bubble((FAIL_TEXT[reason] || FAIL_TEXT.unfinished)(lv), true);
  runner.endTimer = reduced ? 1.0 : 1.4;
  log.event('level.fail', { level: current.kind === 'campaign' ? current.def.id : current.kind, reason, steps: run.steps, tiles: programSize(current.prog) });
}

function award(id) {
  if (!zap(state, id)) return;
  toastBug(id);
  dirty = true;
}

// ---------------------------------------------------------------- result

function showResult() {
  runner.status = 'idle';
  const def = current.def;
  const tiles = programSize(current.prog);
  const par = def.par < 99 ? def.par : tiles;
  const ctx = {
    tiles, par,
    features: features(current.prog),
    firstRun: current.runs === 1 && !current.hints,
    editedWhilePaused: current.editedWhilePaused,
    hinted: current.hints > 0,
    daily: current.kind === 'daily' ? today : null,
    custom: current.kind === 'custom',
    mine: !!def.mine,
  };
  const before = totalStars(state);
  const r = recordWin(state, current.kind === 'campaign' ? def.id : def.id, ctx);
  if (current.editorTest) {
    editor.solved(tiles);
    saveCustomFromEditor(true);
    if (!def.solvedOnce) { state.built++; def.solvedOnce = true; }
  } else if (current.kind === 'custom') {
    const entry = state.custom.find((c) => c.code === def.code);
    if (entry) entry.solved = true;
  }
  const seconds = Math.round((performance.now() - current.started) / 1000);
  log.event('level.complete', { level: current.kind === 'campaign' ? def.id : current.kind, stars: r.stars, tiles, par, runs: current.runs, seconds, hints: current.hints });
  if (current.kind === 'daily') log.event('daily.complete', { day: today, stars: r.stars, streak: state.daily.streak });
  modal = 'result';
  persist();
  const shown = current.editorTest ? 3 : r.stars;
  const starEls = $('result-stars').children;
  for (let i = 0; i < 3; i++) {
    starEls[i].classList.remove('on');
    if (i < shown) setTimeout(() => { starEls[i].classList.add('on'); sound.play('star', { n: i }); }, (reduced ? 120 : 350) * (i + 1));
  }
  const titles = ['Nice coding!', 'Great program!', 'Perfect program!'];
  $('result-title').textContent = current.editorTest ? 'You solved your level!' : current.kind === 'daily' ? 'Daily Circuit done!' : titles[r.stars - 1];
  let line = `${tiles} tile${tiles === 1 ? '' : 's'}`;
  if (current.editorTest) line += ` · that is your level's par now`;
  else if (r.stars < 3) line += ` · ★★★ needs ${par} or fewer`;
  else if (tiles < par) line += ` · under par (${par})! Wow!`;
  else line += ` · par is ${par}`;
  $('result-line').textContent = line;
  const extra = $('result-extra');
  extra.textContent = '';
  if (r.newBest) extra.appendChild(chip('🏅 New best!', 'newbest'));
  if (current.kind === 'daily') extra.appendChild(chip(`☀️ Streak: ${state.daily.streak} day${state.daily.streak === 1 ? '' : 's'}`));
  for (const id of r.bugs) extra.appendChild(bugChip(id));
  for (const u of r.unlocks) {
    const item = u.kind === 'paint' ? PAINTS.find((p) => p.id === u.id) : TOPPERS.find((t) => t.id === u.id);
    extra.appendChild(chip(`🎁 New ${u.kind === 'paint' ? 'paint job' : 'antenna topper'}: ${item.name}! (Garage)`));
    log.event('unlock', { kind: u.kind, id: u.id });
  }
  if (r.unlocks.length) setTimeout(() => sound.play('unlock'), 1300);
  const after = totalStars(state);
  if (after > before && current.kind === 'campaign') {
    const w = WORLDS[def.world - 1];
    if (worldStars(state, w.id) === w.levels.length * 3) extra.appendChild(chip(`🌟 Every star in ${w.name}!`));
  }
  const nextId = current.kind === 'campaign' ? nextLevel(state, def.id) : null;
  const nb = $('result-next');
  if (current.editorTest) { nb.textContent = 'Share it ▶'; }
  else if (nextId) { nb.textContent = 'Next ▶'; }
  else { nb.textContent = 'Map ▶'; }
  $('result-again').textContent = current.editorTest ? 'Back to building' : r.stars < 3 ? 'Try for fewer tiles' : 'Play again';
  $('result-map').classList.toggle('hidden', !nextId);
  show('screen-result');
  if (autopilot) setTimeout(() => { if (modal === 'result') resultNext(); }, 900);
}

function chip(text, cls = '') {
  const d = document.createElement('div');
  d.className = `chip ${cls}`;
  d.textContent = text;
  return d;
}

function bugChip(id) {
  const d = document.createElement('div');
  d.className = 'chip';
  d.appendChild(bugCanvas(id, 40));
  const t = document.createElement('span');
  t.innerHTML = `Bug zapped: <b>${BUG[id].name}</b>`;
  d.appendChild(t);
  return d;
}

function resultNext() {
  modal = null;
  if (current.editorTest) { backToEditor(); openShare(editor.def()); return; }
  const nextId = current.kind === 'campaign' ? nextLevel(state, current.def.id) : null;
  if (nextId) startLevel(LEVEL[nextId], 'campaign');
  else toMap(current.kind === 'campaign' ? current.def.world : mapWorld);
}

function resultAgain() {
  modal = null;
  if (current.editorTest) { backToEditor(); return; }
  show(null);
  resetRun(true);
}

// ---------------------------------------------------------------- pause

function pause() {
  if (mode !== 'play' || modal) return;
  if (runner.status === 'running') runner.status = 'paused';
  mode = 'paused';
  $('btn-pause-map').textContent = current?.editorTest ? 'Back to building' : 'Level map';
  updateSoundButtons();
  updateRunButtons();
  show('screen-pause');
  persist();
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  show(null);
}

// ---------------------------------------------------------------- sheets

function openSheet(kind, title, fill) {
  if (mode === 'play' && runner.status === 'running') { runner.status = 'paused'; updateRunButtons(); }
  modal = 'sheet';
  sheetKind = kind;
  $('sheet-title').textContent = title;
  const body = $('sheet-body');
  body.textContent = '';
  fill(body);
  $('screen-sheet').classList.remove('hidden');
  $('sheet-close').focus({ preventScroll: true });
}

function closeSheet() {
  if (modal !== 'sheet') return;
  modal = null;
  sheetKind = null;
  garagePreview = null;
  $('screen-sheet').classList.add('hidden');
  if (mode === 'map') renderMap();
  if (mode === 'title') refreshTitle();
}

function tileEl(t) {
  const el = document.createElement('span');
  if (t.op === '@') {
    el.className = `rblock${t.c ? ` painted c-${t.c}` : ''}`;
    el.innerHTML = `<span class="tile rhead op-rep">${ICON['@']}${t.c ? colourBadge(t.c) : ''}</span><span class="rcount"><span>×</span>${t.n}</span>`;
    const inner = document.createElement('span');
    inner.className = 'rbody';
    for (const c of t.body) inner.appendChild(tileEl(c));
    el.appendChild(inner);
    return el;
  }
  el.className = `tile ${iconClass(t.op)}${t.c ? ` painted c-${t.c}` : ''}`;
  el.innerHTML = `${ICON[t.op]}${t.c ? colourBadge(t.c) : ''}`;
  return el;
}

const TEACH = {
  F: ['F', 'Forward rolls Bolt one square ahead.'],
  '*': ['*', 'Light turns on the lamp Bolt is standing on. Light every lamp to win!'],
  R: ['R', 'Turn right spins Bolt to face his right. He stays on the same square.'],
  L: ['L', 'Turn left spins Bolt to face his left.'],
  J: ['J', 'Jump hops up one step, or down any number of steps. Forward only rolls on the flat.'],
  G: ['G', 'Grab picks up a battery. Collect every battery too!'],
  '@': ['@', 'Repeat runs the tiles inside it again and again. Drop tiles inside the pink block, then tap ×2 to change the count.'],
  '@@': ['@', 'You can put a Repeat inside a Repeat! Loops in loops.'],
  1: ['1', 'P1 is your own tile! Build a little program in the P1 strip. Every P1 tile in ▶ runs it.'],
  '^': ['1', 'P1 can call P1! Bolt keeps going round and round until every lamp is lit.'],
  c: ['c', 'Pick a colour brush, then tap a tile to paint it. A red tile only runs when Bolt stands on red; a blue tile only on blue.'],
};

function openTeach(keys) {
  for (const k of keys) state.seenTeach[k] = true;
  dirty = true;
  openSheet('teach', keys.includes('@') || keys.includes('@@') ? 'New: Repeat!' : keys.includes('1') ? 'New: P1!' : keys.includes('^') ? 'New: P1 calls P1!' : keys.includes('c') ? 'New: colours!' : 'New tiles!', (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'teach';
    const big = document.createElement('div');
    big.className = 'big-tiles';
    for (const k of keys) {
      const [op, text] = TEACH[k];
      const col = document.createElement('div');
      col.className = 'tt';
      const row = document.createElement('div');
      row.className = 'row';
      if (op === 'c') {
        row.appendChild(tileEl({ op: 'F', c: 'r' }));
        row.appendChild(tileEl({ op: 'L', c: 'b' }));
      } else row.appendChild(tileEl({ op, n: 3, body: [] }));
      const cap = document.createElement('small');
      cap.textContent = text;
      const name = document.createElement('span');
      name.textContent = op === 'c' ? 'Colours' : k === '^' ? 'P1 calls P1' : TILE_INFO[op].name;
      col.append(row, name, cap);
      big.appendChild(col);
    }
    wrap.appendChild(big);
    const demoText = { '@': '3(F) *', '@@': '4(3(* F) R)', 1: '1 1', '^': '1', c: 'F r:R b:L' }[keys.find((k) => ['@', '@@', '1', '^', 'c'].includes(k))];
    if (demoText) {
      const ex = document.createElement('div');
      ex.className = 'demo';
      ex.setAttribute('aria-hidden', 'true');
      for (const t of parseProgram(demoText)) ex.appendChild(tileEl(t));
      if (keys.includes('^') || keys.includes('1')) {
        const p1 = document.createElement('div');
        p1.className = 'demo';
        p1.innerHTML = '<b style="color:#6a40d0">P1 =</b>';
        for (const t of parseProgram(keys.includes('^') ? 'F * 1' : 'J J *')) p1.appendChild(tileEl(t));
        wrap.appendChild(ex);
        wrap.appendChild(p1);
      } else wrap.appendChild(ex);
    }
    const ok = document.createElement('button');
    ok.className = 'btn primary';
    ok.textContent = 'Got it!';
    ok.addEventListener('click', closeSheet);
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginTop = '10px';
    row.appendChild(ok);
    wrap.appendChild(row);
    body.appendChild(wrap);
    setTimeout(() => ok.focus({ preventScroll: true }), 50);
  });
}

function openHint() {
  if (!current?.def.solution) return;
  const sol = program(current.def.solution.main, current.def.solution.p1 || '');
  const flat = [];
  const walk = (list) => list.forEach((t) => { flat.push(t); if (t.op === '@') walk(t.body); });
  walk(sol.main);
  walk(sol.p1);
  openSheet('hint', 'Hint', (body) => {
    const draw = () => {
      body.textContent = '';
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = current.hints ? 'Here is one way to solve it. You still earn stars!' : 'Stuck? Peek at a solution, one tile at a time.';
      body.appendChild(p);
      const shown = new Set(flat.slice(0, current.hints));
      const strip = (list, label) => {
        const s = document.createElement('div');
        s.className = 'hint-strip';
        s.innerHTML = `<span class="label">${label}</span>`;
        const add = (t, into) => {
          if (!shown.has(t)) {
            const q = document.createElement('span');
            q.className = 'hidden-tile';
            q.textContent = '?';
            into.appendChild(q);
            if (t.op === '@') t.body.forEach((c) => add(c, into));
            return;
          }
          if (t.op === '@') {
            const el = tileEl({ ...t, body: [] });
            const inner = el.querySelector('.rbody');
            t.body.forEach((c) => add(c, inner));
            into.appendChild(el);
          } else into.appendChild(tileEl(t));
        };
        list.forEach((t) => add(t, s));
        body.appendChild(s);
      };
      strip(sol.main, '▶');
      if (sol.p1.length) strip(sol.p1, 'P1');
      const row = document.createElement('div');
      row.className = 'row';
      row.style.marginTop = '10px';
      const more = document.createElement('button');
      more.className = 'btn primary';
      more.textContent = current.hints >= flat.length ? 'That is all of it!' : current.hints ? 'Show one more' : 'Show a tile';
      more.disabled = current.hints >= flat.length;
      more.addEventListener('click', () => { current.hints++; state.stats.hints++; sound.play('click'); draw(); });
      const done = document.createElement('button');
      done.className = 'btn';
      done.textContent = 'Back to coding';
      done.addEventListener('click', closeSheet);
      row.append(more, done);
      body.appendChild(row);
      more.focus({ preventScroll: true });
    };
    draw();
  });
}

function openHelp() {
  openSheet('help', 'How to play', (body) => {
    const d = document.createElement('div');
    d.className = 'help';
    d.innerHTML = `<p><b>Goal:</b> light every lamp 💡 and grab every battery 🔋.</p>
      <p>Tap or drag tiles into the <b>▶ strip</b> to build a program, then press <b>Run</b>. Bolt does each tile in order, and the tile he is doing glows.</p>
      <p>Tap a tile in a strip to take it out. Drag tiles to move them. <b>Step</b> runs one tile at a time; you can change the program while paused.</p>
      <p>Use as few tiles as you can: ★★★ means you matched the par.</p>`;
    const grid = document.createElement('div');
    grid.className = 'help-tiles';
    for (const op of PALETTE_ORDER) {
      const row = document.createElement('div');
      row.className = 'help-tile';
      row.appendChild(tileEl({ op, n: 2, body: [] }));
      const s = document.createElement('span');
      s.textContent = `${TILE_INFO[op].name} (${TILE_INFO[op].key})`;
      row.appendChild(s);
      grid.appendChild(row);
    }
    d.appendChild(grid);
    const keys = document.createElement('p');
    keys.className = 'muted keys-only';
    keys.innerHTML = '<b>Keys:</b> letters add tiles · ← → move the caret · ↑ ↓ switch strips · Backspace removes · C colour · + / − repeat count · Space run/pause · S step · X reset · T speed · H hint · Esc pause';
    d.appendChild(keys);
    body.appendChild(d);
  });
}

let garagePreview = null;
function openGarage() {
  openSheet('garage', 'Garage', (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'garage';
    const cv = document.createElement('canvas');
    cv.width = 360;
    cv.height = 400;
    cv.setAttribute('aria-label', 'Bolt wearing your paint job and topper');
    garagePreview = cv;
    wrap.appendChild(cv);
    const right = document.createElement('div');
    const u = unlocked(state);
    const section = (title, items, kind) => {
      const h = document.createElement('h3');
      h.textContent = title;
      right.appendChild(h);
      const g = document.createElement('div');
      g.className = 'swatches';
      for (const it of items) {
        const open = (kind === 'paint' ? u.paints : u.toppers).includes(it.id);
        const b = document.createElement('button');
        b.className = `swatch${open ? '' : ' locked'}`;
        b.setAttribute('aria-pressed', String((kind === 'paint' ? state.paint : state.topper) === it.id));
        if (kind === 'paint') {
          b.innerHTML = `<span class="dot" style="background:${it.body}"></span>`;
        } else {
          const c = document.createElement('canvas');
          c.width = 68;
          c.height = 68;
          const g2 = c.getContext('2d');
          g2.translate(34, 44);
          drawTopper(g2, 0, 0, 260, it.id, 1);
          b.appendChild(c);
        }
        const label = document.createElement('span');
        label.className = open ? '' : 'lk';
        label.textContent = open ? it.name : `🔒 ${needText(it.need)}`;
        b.appendChild(label);
        b.setAttribute('aria-label', `${it.name}${open ? '' : `, locked: ${needText(it.need)}`}`);
        b.addEventListener('click', () => {
          if (!open) { sound.play('shrug'); return; }
          if (kind === 'paint') state.paint = it.id; else state.topper = it.id;
          view.paint = paintOf();
          view.topper = state.topper;
          sound.play('unlock');
          dirty = true;
          for (const s of g.children) s.setAttribute('aria-pressed', 'false');
          b.setAttribute('aria-pressed', 'true');
        });
        g.appendChild(b);
      }
      right.appendChild(g);
    };
    section('Paint jobs', PAINTS, 'paint');
    section('Antenna toppers', TOPPERS, 'topper');
    wrap.appendChild(right);
    body.appendChild(wrap);
  });
}


function bugCanvas(id, size) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = size * dpr;
  c.height = size * dpr;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  drawBug(g, size / 2, size / 2, size * 0.9, BUG[id].look, { silhouette: !state.bugs[id], t: 0.5 });
  return c;
}

function openBugs() {
  openSheet('bugs', 'Bug Zapper', (body) => {
    const n = Object.keys(state.bugs).length;
    const p = document.createElement('p');
    p.className = 'bug-count';
    p.textContent = `Every coder meets bugs! You have zapped ${n} of ${BUGS.length}.`;
    body.appendChild(p);
    const grid = document.createElement('div');
    grid.className = 'bugs';
    for (const b of BUGS) {
      const card = document.createElement('div');
      const got = !!state.bugs[b.id];
      card.className = `bug-card${got ? '' : ' missing'}`;
      card.appendChild(bugCanvas(b.id, 64));
      const name = document.createElement('b');
      name.textContent = got ? b.name : '???';
      const hint = document.createElement('small');
      hint.textContent = b.hint;
      card.append(name, hint);
      grid.appendChild(card);
    }
    body.appendChild(grid);
  });
}

function toastBug(id) {
  sound.play('zap');
  const t = document.createElement('div');
  t.className = 'toast';
  t.appendChild(bugCanvas(id, 40));
  const s = document.createElement('span');
  s.innerHTML = `Bug zapped! <b>${BUG[id].name}</b><small>${BUG[id].hint}</small>`;
  t.appendChild(s);
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3500);
  log.event('bug.zap', { id });
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

let bubbleEl = $('bubble');
function bubble(text, bad = false) {
  bubbleEl.textContent = text;
  bubbleEl.classList.toggle('bad', bad);
  bubbleEl.classList.remove('hidden');
  bubbleTimer = 2.8;
}
function hideBubble() { bubbleEl.classList.add('hidden'); bubbleTimer = 0; }

// ----------------------------------------------------------------- daily

function startDaily() {
  sound.unlock();
  if (!dailyDef || dailyDef.id !== `daily-${today}`) {
    const t = performance.now();
    dailyDef = dailyLevel(today);
    log.info('daily.generated', { day: today, kind: dailyDef.kind, ms: Math.round(performance.now() - t) });
  }
  startLevel(dailyDef, 'daily');
}

// ---------------------------------------------------------------- editor

const editor = new Editor({
  root: $('editor'),
  renderer,
  sound,
  onTest: (def) => {
    saveCustomFromEditor(false);
    log.event('editor.test', { cells: def.map.join('').length });
    startLevel({ ...def, solvedOnce: editor.draft.par != null }, 'custom', { editorTest: true });
  },
  onShare: (def) => openShare(def),
  onBack: () => { saveCustomFromEditor(false); toMap(); },
  onMine: () => openMine(),
  onChange: () => { dirty = true; },
});

function openEditor(draft) {
  stopRun();
  mode = 'editor';
  modal = null;
  current = null;
  $('screen-sheet').classList.add('hidden');
  editor.open(draft || editor.draft);
  show(null);
  relayout();
  editor.refresh();
}

function backToEditor() {
  current = null;
  openEditor(editor.draft);
}

function saveCustomFromEditor(solved) {
  const d = editor.draft;
  if (!d.cells.some((c) => c && c.item)) return;
  const def = editor.def();
  const code = encodeLevel(def);
  const entry = { code, name: def.name, solved: solved || !!d.par, mine: true };
  if (d.slot >= 0 && state.custom[d.slot] && state.custom[d.slot].mine) state.custom[d.slot] = entry;
  else {
    state.custom.unshift(entry);
    if (state.custom.length > 24) state.custom.length = 24;
    d.slot = 0;
  }
  dirty = true;
}

function openShare(def) {
  const code = encodeLevel(def);
  saveCustomFromEditor(true);
  const link = `${location.origin}${location.pathname}?code=${encodeURIComponent(code)}`;
  openSheet('share', 'Share your level', (body) => {
    const d = document.createElement('div');
    d.className = 'codes';
    d.innerHTML = `<p>Send this code to a friend. They paste it into <b>My levels</b> to play <b>${escapeHtml(def.name)}</b> (par ${def.par}).</p>`;
    const ta = document.createElement('textarea');
    ta.rows = 3;
    ta.readOnly = true;
    ta.value = code;
    ta.setAttribute('aria-label', 'Share code');
    d.appendChild(ta);
    const row = document.createElement('div');
    row.className = 'row';
    const copy = document.createElement('button');
    copy.className = 'btn primary';
    copy.textContent = '📋 Copy code';
    copy.addEventListener('click', () => copyText(code, copy));
    const copyLink = document.createElement('button');
    copyLink.className = 'btn';
    copyLink.textContent = '🔗 Copy link';
    copyLink.addEventListener('click', () => copyText(link, copyLink));
    row.append(copy, copyLink);
    d.appendChild(row);
    body.appendChild(d);
    log.event('editor.share', { par: def.par });
  });
}

function copyText(text, btn) {
  const done = () => { btn.textContent = '✓ Copied!'; sound.play('unlock'); };
  try {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  } catch { fallbackCopy(text, done); }
}

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch { /* the code is visible to copy by hand */ }
  ta.remove();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function playCode(code) {
  const r = decodeLevel(code);
  if (r.error) return r.error;
  const def = { ...r.def, code: code.trim() };
  if (!state.custom.some((c) => c.code === def.code)) {
    state.custom.unshift({ code: def.code, name: def.name, solved: false, mine: false });
    if (state.custom.length > 24) state.custom.length = 24;
    dirty = true;
  }
  modal = null;
  $('screen-sheet').classList.add('hidden');
  startLevel(def, 'custom');
  return null;
}

function openMine() {
  openSheet('mine', 'My levels', (body) => {
    const d = document.createElement('div');
    d.className = 'codes';
    d.innerHTML = '<p>Got a code from a friend? Paste it here.</p>';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'RR1.…';
    input.setAttribute('aria-label', 'Level code');
    const err = document.createElement('p');
    err.className = 'err';
    const row = document.createElement('div');
    row.className = 'row';
    const go = document.createElement('button');
    go.className = 'btn primary';
    go.textContent = '▶ Play code';
    const tryCode = () => { const e = playCode(input.value); if (e) { err.textContent = e; sound.play('shrug'); } };
    go.addEventListener('click', tryCode);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryCode(); });
    row.appendChild(go);
    d.append(input, row, err);
    const list = document.createElement('div');
    list.className = 'my-levels';
    if (!state.custom.length) list.innerHTML = '<p class="muted">No levels yet. Build one with 🛠️!</p>';
    state.custom.forEach((c, i) => {
      const item = document.createElement('div');
      item.className = 'my-level';
      const name = document.createElement('b');
      name.textContent = `${c.mine ? '🛠️' : '📨'} ${c.name}${c.solved ? ' ✓' : ''}`;
      const play = document.createElement('button');
      play.className = 'btn small primary';
      play.textContent = 'Play';
      play.addEventListener('click', () => { const e = playCode(c.code); if (e) err.textContent = e; });
      item.append(name, play);
      if (c.mine) {
        const edit = document.createElement('button');
        edit.className = 'btn small';
        edit.textContent = 'Edit';
        edit.addEventListener('click', () => {
          const r = decodeLevel(c.code);
          if (r.def) { modal = null; openEditor(draftFromDef(r.def, i)); }
        });
        item.appendChild(edit);
      }
      const del = document.createElement('button');
      del.className = 'btn small';
      del.textContent = '✕';
      del.setAttribute('aria-label', `Delete ${c.name}`);
      del.addEventListener('click', () => {
        state.custom.splice(i, 1);
        if (editor.draft.slot === i) editor.draft.slot = -1;
        else if (editor.draft.slot > i) editor.draft.slot--;
        dirty = true;
        closeSheet();
        openMine();
      });
      item.appendChild(del);
      list.appendChild(item);
    });
    d.appendChild(list);
    body.appendChild(d);
  });
}

// ----------------------------------------------------------------- sound

function updateSoundButtons() {
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = state.settings.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = state.settings.music ? '🎵 Music on' : '🎵 Music off';
  $('btn-mute').textContent = state.settings.muted ? '🔇' : '🔊';
}
function toggleMute() {
  state.settings.muted = !state.settings.muted;
  sound.unlock();
  sound.setMuted(state.settings.muted);
  updateSoundButtons();
  dirty = true;
}
function toggleMusic() {
  state.settings.music = !state.settings.music;
  sound.unlock();
  sound.setMusic(state.settings.music);
  updateSoundButtons();
  dirty = true;
}

// ----------------------------------------------------------------- input

$('btn-play').addEventListener('click', () => { sound.unlock(); sound.play('click'); toMap(WORLDS.find((w) => w.levels.includes(suggestLevel()))?.id || 1); });
$('btn-title-daily').addEventListener('click', startDaily);
$('btn-title-garage').addEventListener('click', () => { sound.unlock(); openGarage(); });
$('btn-title-bugs').addEventListener('click', () => { sound.unlock(); openBugs(); });
$('btn-title-editor').addEventListener('click', () => { sound.unlock(); openEditor(); });
$('map-prev').addEventListener('click', () => { if (mapWorld > 1) { mapWorld--; sound.play('click'); renderMap(); } });
$('map-next').addEventListener('click', () => { if (mapWorld < WORLDS.length) { mapWorld++; sound.play('click'); renderMap(); } });
$('map-daily').addEventListener('click', startDaily);
$('map-garage').addEventListener('click', openGarage);
$('map-bugs').addEventListener('click', openBugs);
$('map-editor').addEventListener('click', () => openEditor());
$('map-title-btn').addEventListener('click', toTitle);
// Leaving a test of your own level goes back to building it.
function leaveLevel() {
  if (current?.editorTest) backToEditor();
  else toMap(current?.def.world || mapWorld);
}
$('btn-map').addEventListener('click', () => { sound.play('click'); leaveLevel(); });
$('btn-hint').addEventListener('click', openHint);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-view').addEventListener('click', turnCamera);
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-help').addEventListener('click', openHelp);
$('btn-pause-map').addEventListener('click', () => { mode = 'play'; leaveLevel(); });
$('btn-pause-title').addEventListener('click', toTitle);
$('btn-run').addEventListener('click', run);
$('btn-step').addEventListener('click', step);
$('btn-reset').addEventListener('click', () => resetRun());
$('btn-speed').addEventListener('click', cycleSpeed);
$('btn-clear').addEventListener('click', () => { if (runner.status !== 'idle') resetRun(true); panel.clear(); });
$('result-next').addEventListener('click', resultNext);
$('result-again').addEventListener('click', resultAgain);
$('result-map').addEventListener('click', () => { modal = null; toMap(current?.def.world || mapWorld); });
$('sheet-close').addEventListener('click', closeSheet);
$('screen-sheet').addEventListener('pointerdown', (e) => { if (e.target === $('screen-sheet')) closeSheet(); });
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);

const boardEl = $('board');
boardEl.addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (mode !== 'editor' || modal) return;
  const r = boardEl.getBoundingClientRect();
  boardEl.setPointerCapture?.(e.pointerId);
  editor.pointerDown(e.clientX - r.left, e.clientY - r.top);
});
boardEl.addEventListener('pointermove', (e) => {
  if (mode !== 'editor') return;
  const r = boardEl.getBoundingClientRect();
  editor.pointerMove(e.clientX - r.left, e.clientY - r.top);
});
addEventListener('pointerup', () => { if (mode === 'editor') editor.pointerUp(); });

const OP_KEYS = { f: 'F', l: 'L', r: 'R', j: 'J', e: '*', g: 'G', o: '@', 1: '1' };

addEventListener('keydown', (e) => {
  const tag = e.target?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA';
  if (e.key === 'Escape') {
    if (modal === 'sheet') { closeSheet(); e.preventDefault(); return; }
    if (typing) { e.target.blur(); return; }
    if (mode === 'play' && !modal) { pause(); e.preventDefault(); return; }
    if (mode === 'paused') { resume(); e.preventDefault(); return; }
    if (mode === 'editor') { saveCustomFromEditor(false); toMap(); return; }
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'm') { toggleMute(); return; }
  if (modal === 'sheet') return;
  if (modal === 'result') {
    if (k === 'Enter' && !e.target.closest?.('button')) { resultNext(); e.preventDefault(); }
    return;
  }
  if (mode === 'editor') {
    if (editor.key(e)) e.preventDefault();
    return;
  }
  if (mode === 'paused') { if (k === 'p') resume(); return; }
  if (mode === 'title') {
    if (k === 'Enter' && !e.target.closest?.('button, a')) $('btn-play').click();
    return;
  }
  if (mode === 'map') {
    if (k === '[' || k === 'PageUp') $('map-prev').click();
    if (k === ']' || k === 'PageDown') $('map-next').click();
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      const nodes = [...document.querySelectorAll('#nodes .node:not([disabled])')];
      const i = nodes.indexOf(document.activeElement);
      const cols = getComputedStyle($('nodes')).gridTemplateColumns.split(' ').length;
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[k];
      const next = nodes[Math.max(0, Math.min(nodes.length - 1, (i < 0 ? 0 : i + d)))];
      next?.focus();
      e.preventDefault();
    }
    return;
  }
  if (mode !== 'play') return;
  const onButton = e.target?.closest?.('button');
  if (k === 'p') { pause(); return; }
  if (OP_KEYS[k] && current.level.ops.includes(OP_KEYS[k])) { panel.insert(OP_KEYS[k]); e.preventDefault(); return; }
  switch (k) {
    case ' ':
    case 'Enter':
      if (onButton) return;
      run();
      e.preventDefault();
      break;
    case 's':
    case '.':
      step();
      break;
    case 'x':
      resetRun();
      break;
    case 't':
      cycleSpeed();
      break;
    case 'v':
      turnCamera();
      break;
    case 'h':
      openHint();
      break;
    case 'q':
      leaveLevel();
      break;
    case 'c':
      panel.cycleColour();
      break;
    case '+':
    case '=':
      panel.repeatAtCaret(1);
      break;
    case '-':
    case '_':
      panel.repeatAtCaret(-1);
      break;
    case 'ArrowLeft':
      panel.moveCaret(-1);
      e.preventDefault();
      break;
    case 'ArrowRight':
      panel.moveCaret(1);
      e.preventDefault();
      break;
    case 'ArrowUp':
    case 'ArrowDown':
      panel.switchStrip(k === 'ArrowUp' ? -1 : 1);
      e.preventDefault();
      break;
    case 'Backspace':
      if (onButton?.closest('.strip')) return;
      panel.backspace();
      e.preventDefault();
      break;
    case 'Delete':
      panel.deleteForward();
      break;
    default:
      break;
  }
});

// Mouse and touch clicks should not leave focus on a button, or Space (Run)
// would press that button again. Keyboard focus is untouched.
document.addEventListener('click', (e) => {
  if (e.detail > 0) e.target.closest?.('button')?.blur();
});
addEventListener('resize', relayout);
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('pointermove', () => { pointerIdle = 0; });
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  monitor.reset(performance.now());
  if (document.hidden) persist();
});

// Another tab saved: take its progress, so this tab never writes a stale copy
// over it (whichever tab saved last used to win). A level in progress keeps
// going and records into the fresh copy when it is solved.
addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY && e.key !== null) return;
  const fresh = loadSave(storage).state;
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, fresh);
  dirty = false;
  sound.setMuted(state.settings.muted);
  sound.setMusic(state.settings.music);
  updateSoundButtons();
  updateRunButtons();
  if (mode === 'title') refreshTitle();
  else if (mode === 'map' && !modal) toMap(mapWorld);
});

// ------------------------------------------------------------------ loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, level: current ? (current.kind === 'campaign' ? current.def.id : current.kind) : 'none', status: runner.status, particles: renderer.particles.length }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);

const titleBolt = $('title-bolt').getContext('2d');
let last = performance.now();
let time = 0;

const frameCost = [];
function frame(now) {
  const t0 = performance.now();
  monitor.frame(now);
  if (crashNext) { crashNext = false; throw new Error('Robo Route test crash'); }
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  time += dt;
  if (mode === 'play' || mode === 'paused') {
    if (mode === 'play' && (!modal || runner.status === 'ending')) tickRunner(dt);
    else if (modal === 'result') anim.update(dt);
    else anim.update(0);
    view.bolt = anim.pose;
    view.lit = anim.lit;
    view.got = anim.got;
    view.chevron = runner.status === 'idle' || runner.status === 'paused';
    view.startMark = null;
    updateGoal();
  } else if (mode === 'editor') {
    const lv = renderer.level;
    view.bolt = lv ? { x: lv.start.x, y: lv.start.y, h: lv.cells[lv.start.y * lv.w + lv.start.x]?.h ?? 0, d: lv.start.d, squash: Math.sin(time * 2.4) * 0.03 } : null;
    view.lit = [];
    view.got = [];
    view.chevron = true;
  } else {
    stepDemo(dt);
    if (demo.anim) {
      view.bolt = demo.anim.pose;
      view.lit = demo.anim.lit;
      view.got = demo.anim.got;
      view.chevron = false;
    }
  }
  renderer.draw(dt, view);
  if (mode === 'editor') renderer.drawGrid(0.3);
  if (mode === 'title' && !modal) drawTitleBolt();
  if (garagePreview) drawGarage();
  if (bubbleTimer > 0) { bubbleTimer -= dt; if (bubbleTimer <= 0) hideBubble(); }
  updatePointer(dt);
  saveClock += dt;
  if (saveClock > 4) { saveClock = 0; if (dirty) persist(); }
  frameCost.push(performance.now() - t0);
  if (frameCost.length > 300) frameCost.shift();
  requestAnimationFrame(loop);
}

function drawTitleBolt() {
  const g = titleBolt;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, 200, 170);
  const wave = (Math.sin(time * 5) + 1) / 2;
  drawBolt(g, 100, 162 - Math.abs(Math.sin(time * 2)) * 6, 210, {
    d: 2, paint: view.paint, topper: state.topper, t: time, arm: 0.6 + wave * 0.4, mood: Math.sin(time * 0.8) > 0.6 ? 'happy' : '', squash: Math.sin(time * 4) * 0.04,
  });
}

function drawGarage() {
  if (!garagePreview.isConnected) { garagePreview = null; return; }
  const g = garagePreview.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, garagePreview.width, garagePreview.height);
  const d = Math.floor(time * 0.7) % 4;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(180, 340, 90, 26, 0, 0, Math.PI * 2);
  g.fill();
  drawBolt(g, 180, 335, 330, { d: [2, 1, 0, 3][d], paint: view.paint, topper: state.topper, t: time, mood: 'happy', arm: (Math.sin(time * 3) + 1) / 4 });
}

function updatePointer(dt) {
  pointerIdle += dt;
  const playing = mode === 'play' && !modal && runner.status === 'running';
  document.body.classList.toggle('no-cursor', playing && pointerIdle > 2);
}

const loop = telemetry ? telemetry.guard(frame, 'robo-route.frame') : frame;

// ----------------------------------------------------------------- start

if (location.protocol !== 'file:') {
  updateSoundButtons();
  updateRunButtons();
  log.event('game.ready', {
    stars: totalStars(state),
    bugs: Object.keys(state.bugs).length,
    fresh: loaded.fresh,
    reduced,
    custom: state.custom.length,
  });
  const lvParam = params.get('level');
  const codeParam = params.get('code');
  if (codeParam) {
    toTitle();
    const err = playCode(codeParam);
    if (err) { toast(err); toTitle(); }
  } else if (lvParam && LEVEL[lvParam]) startLevel(LEVEL[lvParam], 'campaign');
  else if (params.has('dailyplay')) startDaily();
  else if (params.has('editor')) openEditor(blankDraft());
  else if (autopilot) startLevel(LEVEL['1-1'], 'campaign');
  else toTitle();
  persist();
  requestAnimationFrame(loop);
}

window.RR = {
  get state() { return state; },
  get mode() { return mode; },
  get modal() { return modal; },
  get current() { return current; },
  get runner() { return runner; },
  renderer, panel, editor, sound,
  startLevel: (id) => startLevel(LEVEL[id], 'campaign'),
  startDaily, toMap, toTitle, openEditor, openGarage, openBugs, openHelp, openHint, openMine, playCode,
  run, step, resetRun, persist, encodeLevel,
  solve(id) {
    const def = current?.def || LEVEL[id];
    const ref = program(def.solution.main, def.solution.p1 || '');
    current.prog.main.splice(0, current.prog.main.length, ...cloneList(ref.main, true));
    current.prog.p1.splice(0, current.prog.p1.length, ...cloneList(ref.p1, true));
    panel.setProgram(current.prog);
    onEdit();
  },
  crashNextFrame() { crashNext = true; },
  frameStats() {
    const d = frameCost.slice().sort((a, b) => a - b);
    const q = (p) => +(d[Math.min(d.length - 1, Math.floor(d.length * p))] || 0).toFixed(2);
    return { n: d.length, p50: q(0.5), p95: q(0.95), max: q(1) };
  },
  setAutopilot(v) { autopilot = v; },
  starsFor,
};
