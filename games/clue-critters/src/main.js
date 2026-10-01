// Browser entry: screens, the scene canvas, input, sound, saves, telemetry.
import { CRITTERS, PLACES, THINGS, MYSTERIES, byId } from './data.js';
import { DIFFICULTY, generateCase, dailyCase, namesFor } from './cases.js';
import { STORY_CASES, STORY, CHAPTERS } from './story.js';
import { Session, autoPlan, autoStep } from './session.js';
import { BLANK, NO, YES } from './logic.js';
import {
  loadSave, writeSave, clearSave, recordSolve, rankFor, totalStars, storyStars, RANKS, HATS, COATS,
  meets, needText, currentStreak, dailyDone, unlockedIds,
} from './progress.js';
import { dayKey } from './rng.js';
import { bakeCritter, bakeIcon, drawPlaceIcon, drawThingIcon, drawMysteryItem, drawClueItem, PIP_CRITTER, makeCanvas, star } from './art.js';
import { bakePlace, bakeTitle, fitCore } from './scenes.js';
import { Sound } from './audio.js';
import { speak, stopSpeaking, speechSupported } from './speech.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = params.has('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) document.body.classList.add('reduced');
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };
const DPR = Math.min(2, window.devicePixelRatio || 1);
const today = params.get('day') || dayKey();

// ------------------------------------------------------------------ save

const storage = (() => { try { return localStorage; } catch { return null; } })();
if (params.has('fresh')) clearSave(storage);
const save = loadSave(storage);
const unlockAll = params.has('unlock');
let saveWarned = false;
function persist() {
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const sound = new Sound({ muted: save.settings.muted, music: save.settings.music });

// --------------------------------------------------------------- sprites

const critterOf = (id) => (id === 'pip' ? PIP_CRITTER : byId(CRITTERS, id));
const spriteCache = new Map();
function sprite(key, make) {
  let s = spriteCache.get(key);
  if (!s) { s = make(); spriteCache.set(key, s); }
  return s;
}
const outfitKey = () => `${save.outfit.hat}/${save.outfit.coat}`;

function critterSprite(id, px, opts = {}) {
  const o = id === 'pip' ? { hat: save.outfit.hat, coat: save.outfit.coat, ...opts } : opts;
  const key = `c:${id}:${px}:${JSON.stringify(o)}`;
  return sprite(key, () => bakeCritter(critterOf(id), px, o));
}

// A DOM copy of a baked canvas, sized in CSS pixels.
function copyCanvas(src, cssW, cssH = cssW) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  c.style.width = `${cssW}px`; c.style.height = `${cssH}px`;
  c.setAttribute('aria-hidden', 'true');
  return c;
}

// A square portrait: the trimmed head fitted inside css×css.
function portrait(id, css, opts = {}) {
  const px = Math.round(css * DPR);
  const key = `p:${id}:${px}:${JSON.stringify(opts)}:${id === 'pip' ? outfitKey() : ''}`;
  const src = sprite(key, () => {
    const head = critterSprite(id, Math.round(px * 1.25), { kind: 'head', ...opts }).canvas;
    const c = makeCanvas(px, px);
    const f = Math.min(px / head.width, px / head.height);
    const w = head.width * f, h = head.height * f;
    c.getContext('2d').drawImage(head, (px - w) / 2, (px - h) / 2, w, h);
    return c;
  });
  return copyCanvas(src, css);
}

function icon(kind, id, css, extra) {
  const fn = { place: drawPlaceIcon, thing: drawThingIcon, mystery: drawMysteryItem, clue: drawClueItem }[kind];
  const px = Math.round(css * DPR);
  const s = sprite(`i:${kind}:${id}:${px}:${extra || ''}`, () => bakeIcon(fn, id, px, extra));
  return copyCanvas(s, css);
}

const CRUMB_COLORS = { pie: '#e9a35a', hat: '#5fc98c', kitten: '#f6a35a', cookies: '#c98a4a', bell: '#ffcf3f', trophy: '#ffcf3f', cake: '#ff86b8', acorn: '#ffcf3f', scarf: '#e8524a', map: '#e9d4a0' };

// What a scene clue looks like: { kind, color } for drawClueItem.
function clueLook(kase, c) {
  if (c.t === 'crime') {
    if (c.kind === 'thing') return { kind: kase.things[c.idx], color: '' };
    return { kind: kase.mystery === 'kitten' ? 'pawprint' : kase.mystery === 'hat' ? 'feather' : 'crumbs', color: CRUMB_COLORS[kase.mystery] };
  }
  if (c.t === 'at') {
    const cr = byId(CRITTERS, kase.suspects[c.s]);
    return { kind: cr.trace, color: cr.trace === 'dirt' ? '#8a6a4a' : cr.fur };
  }
  if (c.t === 'link') return { kind: kase.things[c.k], color: '' };
  return { kind: 'crumbs', color: '#e9a35a' };
}

function clueIconFor(kase, c, css) {
  if (c.src.kind === 'talk') return portrait(kase.suspects[c.src.who], css);
  const look = clueLook(kase, c);
  return icon('clue', look.kind, css, look.color);
}

// --------------------------------------------------------------- canvas

const canvas = $('scene');
const ctx = canvas.getContext('2d');
let view = { w: 0, h: 0 };
let bakes = new Map();
let titleBake = null;
let barH = 76;

function resize() {
  const w = innerWidth, h = innerHeight;
  if (w === view.w && h === view.h && canvas.width === Math.round(w * DPR)) return false;
  view = { w, h };
  canvas.width = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
  bakes = new Map();
  titleBake = null;
  titleBottom = 0;
  return true;
}

function measureBar() {
  const bar = $('bar');
  const h = bar.classList.contains('hidden') ? 0 : bar.offsetHeight;
  if (h) barH = h;
  return barH;
}

function placeBake(placeId, forReveal = false) {
  const area = forReveal ? view.h : view.h - measureBar();
  const key = `${placeId}:${view.w}x${view.h}:${area}`;
  let b = bakes.get(key);
  if (!b) { b = bakePlace(placeId, view.w, view.h, DPR, area); bakes.set(key, b); }
  return b;
}

// ------------------------------------------------------------ particles

const particles = [];
const MAX_PARTICLES = reduced ? 40 : 160;
const CONFETTI = ['#ff86b8', '#ffcf3f', '#6fb7ff', '#5fc98c', '#ff9b2f', '#a97ae0'];

function burst(x, y, n, kind = 'spark') {
  const count = reduced ? Math.ceil(n / 3) : n;
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = kind === 'confetti' ? 120 + Math.random() * 320 : 60 + Math.random() * 180;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'confetti' ? 260 : 60),
      life: 0, max: kind === 'confetti' ? 2.4 : 0.9, kind,
      color: CONFETTI[i % CONFETTI.length], size: kind === 'confetti' ? 6 + Math.random() * 6 : 5 + Math.random() * 6,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life += dt;
    if (q.life >= q.max) { particles.splice(i, 1); continue; }
    q.vy += (q.kind === 'confetti' ? 420 : 160) * dt;
    if (q.kind === 'leaf') { q.vy = Math.min(q.vy, 40); q.vx = Math.sin(q.life * 2 + q.rot) * 30; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
  }
}

function drawParticles() {
  for (const q of particles) {
    const a = 1 - q.life / q.max;
    ctx.globalAlpha = Math.min(1, a * 1.6);
    ctx.fillStyle = q.color;
    if (q.kind === 'spark') { star(ctx, q.x, q.y, q.size); ctx.fill(); }
    else {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
      if (q.kind === 'leaf') { ctx.beginPath(); ctx.ellipse(0, 0, q.size, q.size * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ state

let mode = 'title';      // title | menu | intro | play | paused | reveal | result
let menuBack = 'screen-title';
let session = null;
let meta = null;         // { kind, index, difficulty, seed, day }
let place = 0;
let startedAt = 0;
let searchAnim = null;   // { x, y, t }
let glint = null;        // { place, spot, t }
let lastFind = 0;
let revealT = 0;
let autoplay = null;
let pointerIdle = 0;
let bob = 0;

const OVERLAYS = ['screen-title', 'screen-story', 'screen-endless', 'screen-book', 'screen-friends', 'screen-wardrobe', 'screen-settings', 'screen-pause', 'screen-intro', 'screen-result', 'reveal', 'dlg', 'board', 'accuse'];
const PANELS = new Set(['dlg', 'board', 'accuse']);

function show(id, keepPanels = false) {
  for (const s of OVERLAYS) {
    if (keepPanels && PANELS.has(s)) continue;
    $(s).classList.toggle('hidden', s !== id);
  }
  const playing = mode === 'play' || mode === 'paused';
  $('hud').classList.toggle('hidden', !playing);
  $('bar').classList.toggle('hidden', !playing);
  $('spots').classList.toggle('hidden', mode !== 'play');
  $('place-note').classList.toggle('hidden', mode !== 'play');
  document.body.classList.toggle('menu', !playing && mode !== 'reveal');
  sound.setLevel(playing ? 0.8 : 1);
  if (id) focusFirst($(id));
}

function focusFirst(root) {
  if (!root) return;
  const el = root.querySelector('[autofocus], .btn.primary:not([disabled]), button:not([disabled]), a');
  if (el) setTimeout(() => el.focus({ preventScroll: true }), 30);
}

function panelOpen() {
  return [...PANELS].find((p) => !$(p).classList.contains('hidden')) || null;
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 2700);
}

function say(text, pitch = 1) {
  if (!speechSupported) return;
  speak(text, { pitch });
}

// ------------------------------------------------------------ title & menus

function rankBox(el, extra = '') {
  const stars = totalStars(save);
  const r = rankFor(stars);
  el.innerHTML = '';
  const line = document.createElement('div');
  line.className = 'rank-line';
  line.innerHTML = `<span class="rank-name">🔍 ${r.name}</span><span class="rank-stars">★ ${stars}</span>`;
  const bar = document.createElement('div');
  bar.className = 'rank-bar';
  bar.innerHTML = `<i style="width:${Math.round(r.progress * 100)}%"></i>`;
  const next = document.createElement('div');
  next.className = 'rank-next';
  next.textContent = r.next ? `${r.next.stars - stars} more ★ to ${r.next.name}${extra}` : `Top detective of Whiskerton!${extra}`;
  el.append(line, bar, next);
}

function toTitle() {
  mode = 'title';
  titleBottom = 0;
  session = null;
  stopSpeaking();
  const streak = currentStreak(save, today);
  rankBox($('title-rank'), streak ? ` · 📅 streak ${streak}` : '');
  const done = dailyDone(save, today);
  $('daily-badge').textContent = done ? '✓ done' : streak ? `🔥 ${streak}` : 'new!';
  $('daily-badge').style.background = done ? '#8fd06b' : '';
  show('screen-title');
}

function openMenu(id, build) {
  menuBack = mode === 'paused' ? 'screen-pause' : 'screen-title';
  mode = 'menu';
  build();
  show(id);
  sound.play('page');
}

function back() {
  if (mode === 'paused') { resume(); return; }
  if (mode === 'menu' && menuBack === 'screen-pause' && session) { mode = 'paused'; show('screen-pause'); return; }
  toTitle();
}

function storyUnlocked(i) {
  if (unlockAll || i === 0) return true;
  return (save.story[STORY_CASES[i - 1].id]?.stars || 0) > 0;
}

function buildStory() {
  const list = $('story-list');
  list.innerHTML = '';
  $('story-stars').textContent = `★ ${storyStars(save)} / ${STORY_CASES.length * 3}`;
  const nextIdx = STORY_CASES.findIndex((k, i) => storyUnlocked(i) && !save.story[k.id]);
  for (const ch of CHAPTERS) {
    const sec = document.createElement('div');
    sec.className = 'chapter';
    sec.innerHTML = `<h3>Chapter ${ch.id}: ${ch.title} <span class="muted">· ${DIFFICULTY[ch.difficulty].name}, ${DIFFICULTY[ch.difficulty].n} suspects</span></h3>`;
    const grid = document.createElement('div');
    grid.className = 'chapter-cases';
    STORY_CASES.forEach((k, i) => {
      if (STORY[i].chapter !== ch.id) return;
      const open = storyUnlocked(i);
      const stars = save.story[k.id]?.stars || 0;
      const b = document.createElement('button');
      b.className = `case-card${open ? '' : ' locked'}${i === nextIdx ? ' next' : ''}`;
      b.appendChild(open ? icon('mystery', k.mystery, 54) : document.createTextNode('🔒'));
      const t = document.createElement('div');
      t.innerHTML = `${k.title}<span class="case-stars">${open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : 'Solve the last case'}</span>`;
      b.appendChild(t);
      const num = document.createElement('span');
      num.className = 'num'; num.textContent = `#${i + 1}`;
      b.appendChild(num);
      b.setAttribute('aria-label', `Case ${i + 1}: ${k.title}. ${open ? `${stars} stars` : 'Locked'}`);
      if (open) b.addEventListener('click', () => startStory(i));
      else b.disabled = true;
      grid.appendChild(b);
    });
    sec.appendChild(grid);
    list.appendChild(sec);
  }
}

function buildEndless() {
  const list = $('endless-list');
  list.innerHTML = '';
  for (const d of [1, 2, 3]) {
    const cfg = DIFFICULTY[d];
    const b = document.createElement('button');
    b.className = 'endless-card';
    const faces = document.createElement('div');
    faces.className = 'faces';
    const preview = generateCase(save.endlessNext[d], d);
    for (const id of preview.suspects) faces.appendChild(portrait(id, 46));
    b.innerHTML = `<b>${cfg.name}</b><span>${cfg.n} suspects${d === 2 ? ' · “not” clues' : d === 3 ? ' · either/or clues' : ''}</span>`;
    b.appendChild(faces);
    const s = document.createElement('span');
    s.textContent = `Solved: ${save.endless[d]} · Next: case #${save.endlessNext[d]}`;
    b.appendChild(s);
    b.addEventListener('click', () => startEndless(d));
    list.appendChild(b);
  }
}

function buildBook() {
  const list = $('book-list');
  list.innerHTML = '';
  $('book-count').textContent = `${save.book.length} solved`;
  if (!save.book.length) {
    list.innerHTML = '<p class="muted center">No cases yet. Your solved cases will live here!</p>';
    return;
  }
  for (const e of save.book.slice().reverse()) {
    const row = document.createElement('div');
    row.className = 'book-entry';
    row.appendChild(portrait(e.culprit, 56, { mood: 'sheepish' }));
    const who = byId(CRITTERS, e.culprit)?.name || '?';
    const kind = e.kind === 'story' ? 'Story' : e.kind === 'daily' ? `Daily ${e.day}` : 'Endless';
    const body = document.createElement('div');
    body.innerHTML = `<b></b><div>It was <b></b>!</div><div class="quote"></div>`;
    body.children[0].textContent = e.title;
    body.children[1].children[0].textContent = who;
    body.children[2].textContent = `“${e.reason}”`;
    row.appendChild(body);
    const when = document.createElement('div');
    when.className = 'when';
    when.innerHTML = `${'★'.repeat(e.stars)}${'☆'.repeat(3 - e.stars)}<br><span class="muted">${kind}</span>`;
    row.appendChild(when);
    list.appendChild(row);
  }
}

function buildFriends() {
  const list = $('friends-list');
  list.innerHTML = '';
  const met = CRITTERS.filter((c) => save.friends[c.id]).length;
  $('friends-count').textContent = `${met} / ${CRITTERS.length}`;
  for (const c of CRITTERS) {
    const known = !!save.friends[c.id];
    const card = document.createElement('div');
    card.className = `friend${known ? '' : ' unknown'}`;
    card.appendChild(portrait(c.id, 84, known ? { mood: 'joy' } : { silhouette: '#8a7a70' }));
    const name = document.createElement('b');
    name.textContent = known ? c.name : '???';
    card.appendChild(name);
    const fact = document.createElement('span');
    fact.textContent = known ? c.fact : 'Solve more cases to meet this friend!';
    card.appendChild(fact);
    list.appendChild(card);
  }
}

function buildWardrobe() {
  const pip = $('wardrobe-pip');
  pip.innerHTML = '';
  const s = critterSprite('pip', Math.round(245 * DPR), { kind: 'body' });
  pip.appendChild(copyCanvas(s.canvas, 245 * s.canvas.width / s.canvas.height, 245));
  const have = new Set(unlockAll ? [...HATS, ...COATS].map((x) => x.id) : unlockedIds(save));
  const fill = (el, items, slot) => {
    el.innerHTML = '';
    for (const it of items) {
      const open = have.has(it.id);
      const b = document.createElement('button');
      b.className = `outfit${save.outfit[slot] === it.id ? ' on' : ''}${open ? '' : ' locked'}`;
      const opts = slot === 'hat' ? { kind: 'head', hat: it.id } : { kind: 'body', coat: it.id, hat: save.outfit.hat };
      const sp = critterSprite('pip', Math.round(64 * DPR), opts);
      b.appendChild(copyCanvas(sp.canvas, 64 * sp.canvas.width / sp.canvas.height, 64));
      const name = document.createElement('span');
      name.textContent = it.name;
      b.appendChild(name);
      if (!open) { const need = document.createElement('span'); need.className = 'need'; need.textContent = `🔒 ${needText(it.need)}`; b.appendChild(need); }
      b.setAttribute('aria-pressed', String(save.outfit[slot] === it.id));
      b.addEventListener('click', () => {
        if (!open) { sound.play('no'); toast(`🔒 ${needText(it.need)}`); return; }
        save.outfit[slot] = it.id;
        persist();
        sound.play('yes');
        log.event('outfit.change', { slot, item: it.id });
        buildWardrobe();
        $(slot === 'hat' ? 'hat-list' : 'coat-list').querySelector('.on')?.focus();
      });
      el.appendChild(b);
    }
  };
  fill($('hat-list'), HATS, 'hat');
  fill($('coat-list'), COATS, 'coat');
}

function syncToggles() {
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = `Sound: ${save.settings.muted ? 'off' : 'on'}`;
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = `Music: ${save.settings.music ? 'on' : 'off'}`;
  for (const b of document.querySelectorAll('[data-speech]')) {
    b.textContent = speechSupported ? `Read aloud: ${save.settings.speech ? 'on' : 'off'}` : 'Read aloud: not here';
    b.disabled = !speechSupported;
  }
  $('btn-mute').textContent = save.settings.muted ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', save.settings.muted ? 'Sound off' : 'Sound on');
}

function toggleMute() {
  save.settings.muted = !save.settings.muted;
  sound.setMuted(save.settings.muted);
  persist(); syncToggles();
}

// ----------------------------------------------------------- case flow

function caseKey(m) {
  return m.kind === 'story' ? `story:${m.index}` : m.kind === 'daily' ? `daily:${m.day}` : `gen:${m.difficulty}:${m.seed}`;
}

function startStory(i) { beginCase(STORY_CASES[i], { kind: 'story', index: i, difficulty: STORY_CASES[i].difficulty }); }
function startEndless(d, seed = save.endlessNext[d]) { beginCase(generateCase(seed, d), { kind: 'gen', difficulty: d, seed }); }
function startDaily() {
  if (dailyDone(save, today)) { toast('You solved today’s mystery! A new one comes tomorrow.'); sound.play('no'); return; }
  beginCase(dailyCase(today), { kind: 'daily', difficulty: 2, day: today });
}

function beginCase(kase, m) {
  meta = { ...m, key: caseKey(m) };
  const resume = save.active && save.active.key === meta.key ? save.active.session : null;
  session = new Session(kase, resume);
  place = 0;
  startedAt = performance.now();
  lastFind = performance.now();
  log.event('level.start', { kind: m.kind, difficulty: kase.difficulty, suspects: kase.n, story: m.index ?? -1, resumed: !!resume });
  if (resume && session.foundCount > 0) { enterPlay(); toast('Welcome back, detective!'); return; }
  showIntro();
}

function showIntro() {
  const k = session.kase;
  mode = 'intro';
  $('intro-art').innerHTML = '';
  $('intro-art').appendChild(icon('mystery', k.mystery, 120));
  $('intro-title').textContent = k.title;
  $('intro-text').textContent = k.intro;
  $('intro-ask').textContent = `${k.ask} Where were they? What did they have?`;
  const cast = $('intro-cast');
  cast.innerHTML = '';
  k.suspects.forEach((id) => {
    const f = document.createElement('figure');
    f.appendChild(portrait(id, 56));
    const cap = document.createElement('figcaption');
    cap.textContent = byId(CRITTERS, id).name;
    f.appendChild(cap);
    cast.appendChild(f);
  });
  $('intro-say').classList.toggle('hidden', !speechSupported);
  show('screen-intro');
  sound.play('page');
  if (save.settings.speech) say(`${k.title}. ${k.intro} ${k.ask}`);
}

function enterPlay() {
  mode = 'play';
  show(null);
  buildTabs();
  setPlace(place, true);
  updateHud();
  queueMicrotask(() => monitor.mark(performance.now()));
  prebake();
}

// Bake the other places in spare frames so switching is instant.
let prebakeQueue = [];
function prebake() {
  if (!session) return;
  prebakeQueue = session.kase.places.filter((_, i) => i !== place);
}

function persistSession() {
  if (!session) return;
  save.active = { key: meta.key, session: session.toJSON() };
  persist();
}

function updateHud() {
  const k = session.kase;
  $('hud-case').textContent = k.title;
  $('hud-clues').textContent = `Clues ${session.foundCount}/${session.total}`;
  const badge = $('board-badge');
  badge.textContent = String(session.foundCount);
  badge.classList.toggle('hidden', session.foundCount === 0);
  for (const tab of document.querySelectorAll('.place-tab')) {
    const p = Number(tab.dataset.place);
    const left = session.remainingAt(p);
    const dots = tab.querySelector('.dots');
    dots.innerHTML = left ? `<span class="badge">${left}</span>` : (session.visited.has(p) ? '<span class="badge done">✓</span>' : '');
    tab.setAttribute('aria-label', `${byId(PLACES, k.places[p]).name}${left ? `, ${left} clue${left > 1 ? 's' : ''} left` : session.visited.has(p) ? ', all found' : ''}`);
  }
}

function buildTabs() {
  const k = session.kase;
  const tabs = $('place-tabs');
  tabs.innerHTML = '';
  k.places.forEach((id, p) => {
    const b = document.createElement('button');
    b.className = 'place-tab';
    b.dataset.place = String(p);
    b.setAttribute('role', 'tab');
    b.appendChild(icon('place', id, 34));
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = byId(PLACES, id).name;
    b.appendChild(nm);
    const dots = document.createElement('span');
    dots.className = 'dots';
    b.appendChild(dots);
    b.title = `${byId(PLACES, id).name} (${p + 1})`;
    b.addEventListener('click', () => { sound.play('tap'); setPlace(p); });
    tabs.appendChild(b);
  });
}

function setPlace(p, quiet = false) {
  place = p;
  session.visit(p);
  for (const tab of document.querySelectorAll('.place-tab')) {
    const on = Number(tab.dataset.place) === p;
    tab.classList.toggle('on', on);
    tab.setAttribute('aria-selected', String(on));
  }
  const k = session.kase;
  const s = session.suspectAt(p);
  const name = byId(PLACES, k.places[p]).name;
  $('place-note').textContent = s >= 0 && !session.talked.has(s) ? `${name}: tap things to search · talk to ${byId(CRITTERS, k.suspects[s]).name}!` : `${name}: tap things to search them`;
  buildSpots();
  updateHud();
  if (!quiet) { sound.play('page'); persistSession(); }
  queueMicrotask(() => monitor.mark(performance.now(), 'place'));
}

// Transparent buttons over the props and the suspect, so mouse, touch and
// keyboard all use the same targets.
let spotEls = [];
function buildSpots() {
  const layer = $('spots');
  layer.innerHTML = '';
  spotEls = [];
  if (!session) return;
  const k = session.kase;
  const b = placeBake(k.places[place]);
  const { s: sc, ox, oy } = b.fit;
  const MIN = 48;
  b.layout.slots.forEach((slot, i) => {
    const el = document.createElement('button');
    el.className = 'spot';
    let w = slot.w * sc, h = slot.h * sc;
    let x = ox + (slot.x - slot.w / 2) * sc, y = oy + (slot.y - slot.h) * sc;
    if (w < MIN) { x -= (MIN - w) / 2; w = MIN; }
    if (h < MIN) { y -= (MIN - h) / 2; h = MIN; }
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    const searched = session.searched[place].has(i);
    const ci = session.clueAt(place, i);
    el.classList.toggle('searched', searched);
    el.classList.toggle('found', searched && ci >= 0);
    el.innerHTML = `<span class="tick">${ci >= 0 && searched ? '★' : '✓'}</span>`;
    el.setAttribute('aria-label', `Search the ${slot.type === 'books' ? 'books' : slot.type}${searched ? ' (searched)' : ''}`);
    el.dataset.spot = String(i);
    el.addEventListener('click', () => searchSpot(i));
    layer.appendChild(el);
    spotEls.push(el);
  });
  const s = session.suspectAt(place);
  if (s >= 0) {
    const st = b.layout.stand;
    const el = document.createElement('button');
    el.className = `spot critter${session.talked.has(s) ? ' talked' : ''}`;
    const w = 190 * sc, h = 330 * sc;
    Object.assign(el.style, { left: `${ox + st.x * sc - w / 2}px`, top: `${oy + st.y * sc - h}px`, width: `${w}px`, height: `${h}px` });
    const name = byId(CRITTERS, k.suspects[s]).name;
    el.innerHTML = `<span class="talk">${session.talked.has(s) ? '💬' : `💬 ${name}`}</span>`;
    el.setAttribute('aria-label', `Talk to ${name}`);
    el.addEventListener('click', () => talkTo(s));
    layer.appendChild(el);
    spotEls.push(el);
  }
}

function spotCenter(i) {
  const b = placeBake(session.kase.places[place]);
  const slot = b.layout.slots[i];
  return { x: b.fit.ox + slot.x * b.fit.s, y: b.fit.oy + (slot.y - slot.h * 0.5) * b.fit.s };
}

let busy = false;
function searchSpot(i) {
  if (busy || mode !== 'play' || panelOpen()) return;
  sound.unlock();
  busy = true;
  const c = spotCenter(i);
  searchAnim = { x: c.x, y: c.y, t: 0 };
  sound.play('search');
  setTimeout(() => {
    busy = false;
    searchAnim = null;
    if (!session || mode !== 'play') return;
    const r = session.search(place, i);
    if (r.kind === 'clue') {
      burst(c.x, c.y, 26);
      sound.play('find');
      lastFind = performance.now();
      if (glint && glint.spot === i && glint.place === place) glint = null;
      const clue = session.kase.clues[r.clue];
      if (r.isNew) log.event('clue.found', { source: 'scene', type: clue.t, found: session.foundCount, total: session.total });
      openDialog({ art: clueIconFor(session.kase, clue, 110), name: r.isNew ? 'You found a clue!' : 'A clue you found', lines: [{ text: clue.text, cls: 'clue' }] });
    } else {
      sound.play('joke');
      jokeBubble(c.x, c.y, r.text);
    }
    buildSpots();
    updateHud();
    persistSession();
  }, reduced ? 120 : 380);
}

function jokeBubble(x, y, text) {
  const el = document.createElement('div');
  el.className = 'toast';
  Object.assign(el.style, { position: 'fixed', left: `${Math.max(90, Math.min(view.w - 90, x))}px`, top: `${Math.max(70, y - 40)}px`, transform: 'translate(-50%, -100%)', background: '#fff', color: 'var(--ink)', zIndex: 15, maxWidth: '260px', whiteSpace: 'normal' });
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function talkTo(s) {
  if (mode !== 'play' || panelOpen()) return;
  sound.unlock();
  const k = session.kase;
  const r = session.talk(s);
  const id = k.suspects[s];
  sound.play('talk', CRITTERS.findIndex((c) => c.id === id));
  const lines = [{ text: r.flavor, cls: 'flavor' }, ...r.clues.map((i) => ({ text: k.clues[i].text, cls: 'clue' }))];
  if (!r.clues.length) lines.push({ text: 'I don’t know anything else. Sorry, Pip!', cls: '' });
  for (const i of r.fresh) log.event('clue.found', { source: 'talk', type: k.clues[i].t, found: session.foundCount, total: session.total });
  if (r.fresh.length) { sound.play('find'); lastFind = performance.now(); }
  openDialog({ art: portrait(id, 120, { mood: s === k.culprit && r.fresh.length ? 'sheepish' : 'happy' }), name: byId(CRITTERS, id).name, lines, pitch: 0.9 + (CRITTERS.findIndex((c) => c.id === id) % 5) * 0.12 });
  buildSpots();
  updateHud();
  persistSession();
}

// ----------------------------------------------------------------- dialog

let dlgText = '';
let dlgPitch = 1;
let dlgReturn = null;
function openDialog({ art, name, lines, pitch = 1 }) {
  dlgReturn = document.activeElement;
  $('dlg-art').innerHTML = '';
  $('dlg-art').appendChild(art);
  $('dlg-name').textContent = name;
  const box = $('dlg-lines');
  box.innerHTML = '';
  for (const l of lines) {
    const p = document.createElement('p');
    p.className = l.cls || '';
    p.textContent = l.text;
    box.appendChild(p);
  }
  dlgText = lines.map((l) => l.text).join(' ');
  dlgPitch = pitch;
  $('dlg-say').classList.toggle('hidden', !speechSupported);
  $('dlg').classList.remove('hidden');
  $('spots').classList.add('hidden');
  $('dlg-ok').focus({ preventScroll: true });
  if (save.settings.speech) say(dlgText, pitch);
}

function closeDialog() {
  if ($('dlg').classList.contains('hidden')) return;
  $('dlg').classList.add('hidden');
  stopSpeaking();
  if (mode === 'play') $('spots').classList.remove('hidden');
  sound.play('tap');
  if (autoplay) return;
  const target = dlgReturn && document.contains(dlgReturn) ? dlgReturn : null;
  (target || spotEls[0])?.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ board

let gridCat = 'place';
let gridFocus = { cat: 'place', s: 0, v: 0 };
let highlighted = null;

function openBoard(tip = null) {
  if (!session) return;
  if (mode === 'paused') { mode = 'play'; show(null); }
  $('dlg').classList.add('hidden');
  $('accuse').classList.add('hidden');
  $('board').classList.remove('hidden');
  $('spots').classList.add('hidden');
  sound.play('page');
  renderBoard(tip);
  const cell = $('grid').querySelector('.cell[tabindex="0"]');
  (cell || $('board-close')).focus({ preventScroll: true });
}

function closeBoard() {
  $('board').classList.add('hidden');
  highlighted = null;
  if (mode === 'play') $('spots').classList.remove('hidden');
  $('btn-board').focus({ preventScroll: true });
}

function gridLayout() {
  const n = session.n;
  const card = Math.min(1040, view.w - 28) - (view.w <= 760 ? 32 : 48);
  const narrow = view.w <= 760;
  const rh = narrow ? 46 : 112;
  const both = (card - rh - 8 - (2 * n + 1) * 3) / (2 * n);
  const side = !narrow && view.w >= 980;
  const avail = side ? card * 0.62 : card;
  const bothSide = (avail - rh - 8 - (2 * n + 1) * 3) / (2 * n);
  const cellBoth = side ? bothSide : both;
  if (cellBoth >= 40) return { tabs: false, cell: Math.min(56, Math.floor(cellBoth)), rh, narrow };
  const one = (card - rh - (n + 1) * 3) / n;
  return { tabs: true, cell: Math.max(38, Math.min(60, Math.floor(one))), rh, narrow };
}

function renderBoard(tip) {
  const k = session.kase;
  const N = namesFor(k);
  const n = k.n;
  const L = gridLayout();
  $('grid-tabs').classList.toggle('hidden', !L.tabs);
  for (const b of $('grid-tabs').querySelectorAll('.seg-btn')) b.classList.toggle('on', b.dataset.cat === gridCat);
  const cats = L.tabs ? [gridCat] : ['place', 'thing'];
  const grid = $('grid');
  grid.style.setProperty('--cell', `${L.cell}px`);
  const cols = [`${L.rh}px`];
  cats.forEach((c, i) => { if (i) cols.push('8px'); for (let v = 0; v < n; v++) cols.push('var(--cell)'); });
  grid.style.gridTemplateColumns = cols.join(' ');
  grid.innerHTML = '';
  const add = (el) => { grid.appendChild(el); return el; };
  // category titles
  add(document.createElement('div'));
  cats.forEach((c, i) => {
    if (i) add(document.createElement('div'));
    const h = add(document.createElement('div'));
    h.className = 'gh cat';
    h.style.gridColumn = `span ${n}`;
    h.textContent = c === 'place' ? 'Where were they?' : 'What did they have?';
  });
  // icons
  add(document.createElement('div'));
  cats.forEach((c, i) => {
    if (i) add(document.createElement('div'));
    for (let v = 0; v < n; v++) {
      const h = add(document.createElement('div'));
      h.className = 'gh';
      h.appendChild(icon(c, c === 'place' ? k.places[v] : k.things[v], Math.round(L.cell * 0.78)));
      const t = document.createElement('span');
      t.textContent = c === 'place' ? N.where[v].replace(/^(Duck|Flower|Town|Train|Ice Cream) /, '') : N.what[v].replace('watering ', '');
      if (L.cell >= 46) h.appendChild(t);
      h.title = c === 'place' ? N.where[v] : N.what[v];
    }
  });
  const hl = highlighted || [];
  const isHl = (cat, s, v) => hl.some((h) => h.cat === cat && (h.s == null || h.s === s) && (h.v == null || h.v === v));
  for (let s = 0; s < n; s++) {
    const rh = add(document.createElement('div'));
    rh.className = 'rh';
    rh.appendChild(portrait(k.suspects[s], 38));
    if (!L.narrow) { const nm = document.createElement('span'); nm.textContent = N.who[s]; rh.appendChild(nm); }
    rh.title = N.who[s];
    cats.forEach((cat, i) => {
      if (i) add(document.createElement('div')).className = 'gap';
      for (let v = 0; v < n; v++) {
        const val = session.grid[cat][s][v];
        const b = add(document.createElement('button'));
        b.className = `cell${val === NO ? ' no' : val === YES ? ' yes' : ''}${isHl(cat, s, v) ? ' hl' : ''}`;
        b.textContent = val === NO ? '✗' : val === YES ? '✓' : '';
        b.dataset.cat = cat; b.dataset.s = String(s); b.dataset.v = String(v);
        const V = cat === 'place' ? `at the ${N.where[v]}` : `had the ${N.what[v]}`;
        b.setAttribute('aria-label', `${N.who[s]} ${V}: ${val === NO ? 'no' : val === YES ? 'yes' : 'blank'}`);
        const focused = gridFocus.cat === cat && gridFocus.s === s && gridFocus.v === v;
        b.tabIndex = focused || (!cats.includes(gridFocus.cat) && s === 0 && v === 0 && i === 0) ? 0 : -1;
        b.addEventListener('click', () => tapCell(cat, s, v));
      }
    });
  }
  renderNotes();
  const tipEl = $('board-tip');
  tipEl.innerHTML = '';
  const t = tip || defaultTip();
  if (t) {
    const b = document.createElement('b');
    b.textContent = t[0];
    tipEl.appendChild(b);
    if (t[1]) { const w = document.createElement('span'); w.className = 'tip-why'; w.textContent = t[1]; tipEl.appendChild(w); }
  }
}

function defaultTip() {
  if (!session.foundCount) return ['No clues yet!', 'Search the places and talk to everyone first.'];
  const helper = session.helper;
  if (helper >= 2) return ['Tap a box once for ✗ (no), twice for ✓ (yes).', 'Pip fills in the easy boxes for you.'];
  if (helper === 1) return ['Tap once for ✗, twice for ✓.', 'A ✓ crosses out its row and column.'];
  return ['Tap once for ✗, twice for ✓.', 'Tough case! You fill in every box yourself.'];
}

function renderNotes() {
  const k = session.kase;
  const list = $('notes');
  list.innerHTML = '';
  for (const i of session.found) {
    const c = k.clues[i];
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = `note${c.t === 'crime' ? ' crime' : ''}`;
    b.appendChild(clueIconFor(k, c, 40));
    const t = document.createElement('span');
    t.textContent = c.src.kind === 'talk' ? `${byId(CRITTERS, k.suspects[c.src.who]).name}: “${c.text}”` : c.text;
    b.appendChild(t);
    b.addEventListener('click', () => highlightClue(i));
    li.appendChild(b);
    if (speechSupported) {
      const sb = document.createElement('button');
      sb.className = 'say';
      sb.textContent = '🔈';
      sb.setAttribute('aria-label', 'Read this clue aloud');
      sb.addEventListener('click', (e) => { e.stopPropagation(); say(c.text); });
      b.appendChild(sb);
    }
    list.appendChild(li);
  }
  const left = session.total - session.foundCount;
  $('notes-more').textContent = left ? `${left} more clue${left > 1 ? 's' : ''} to find!` : 'You found every clue! ⭐';
}

function cellsForClue(c) {
  const P = 'place', T = 'thing';
  switch (c.t) {
    case 'at': case 'notAt': return [{ cat: P, s: c.s, v: c.p }];
    case 'atEither': return [{ cat: P, s: c.s, v: c.p }, { cat: P, s: c.s, v: c.q }];
    case 'whoAt': return [{ cat: P, s: c.s, v: c.p }, { cat: P, s: c.r, v: c.p }];
    case 'has': case 'notHas': return [{ cat: T, s: c.s, v: c.k }];
    case 'hasEither': return [{ cat: T, s: c.s, v: c.k }, { cat: T, s: c.s, v: c.j }];
    case 'whoHas': return [{ cat: T, s: c.s, v: c.k }, { cat: T, s: c.r, v: c.k }];
    case 'link': case 'notLink': return [{ cat: T, v: c.k }, { cat: P, v: c.p }];
    case 'crime': return [{ cat: c.kind, v: c.idx }];
    default: return [];
  }
}

function highlightClue(i) {
  const c = session.kase.clues[i];
  highlighted = cellsForClue(c);
  if (highlighted.length && gridLayout().tabs) gridCat = highlighted[0].cat;
  sound.play('tap');
  renderBoard();
  [...$('notes').querySelectorAll('.note')][[...session.found].indexOf(i)]?.classList.add('on');
  if (save.settings.speech) say(c.text);
}

function tapCell(cat, s, v) {
  sound.unlock();
  gridFocus = { cat, s, v };
  const r = session.cycle(cat, s, v);
  sound.play(r.value === YES ? 'yes' : r.value === NO ? 'no' : 'clear');
  renderBoard();
  for (const a of r.auto) cellEl(a.cat, a.s, a.v)?.classList.add('auto');
  cellEl(cat, s, v)?.focus({ preventScroll: true });
  persistSession();
  if (session.gridDone && r.value === YES) {
    toast('Grid complete! Time to solve it! 🔎');
    sound.play('hint');
  }
}

function cellEl(cat, s, v) {
  return $('grid').querySelector(`.cell[data-cat="${cat}"][data-s="${s}"][data-v="${v}"]`);
}

function gridKey(e) {
  const t = e.target.closest?.('.cell');
  if (!t) return false;
  const n = session.n;
  let { cat, s, v } = { cat: t.dataset.cat, s: Number(t.dataset.s), v: Number(t.dataset.v) };
  const tabs = gridLayout().tabs;
  const move = (ds, dv) => {
    s = Math.max(0, Math.min(n - 1, s + ds));
    v += dv;
    if (v < 0) { if (!tabs && cat === 'thing') { cat = 'place'; v = n - 1; } else v = 0; }
    if (v >= n) { if (!tabs && cat === 'place') { cat = 'thing'; v = 0; } else v = n - 1; }
    gridFocus = { cat, s, v };
    for (const c of $('grid').querySelectorAll('.cell')) c.tabIndex = -1;
    const el = cellEl(cat, s, v);
    if (el) { el.tabIndex = 0; el.focus({ preventScroll: false }); }
  };
  const setVal = (val) => {
    gridFocus = { cat, s, v };
    const r = session.set(cat, s, v, val);
    sound.play(val === YES ? 'yes' : val === NO ? 'no' : 'clear');
    renderBoard();
    for (const a of r.auto) cellEl(a.cat, a.s, a.v)?.classList.add('auto');
    cellEl(cat, s, v)?.focus();
    persistSession();
  };
  switch (e.key) {
    case 'ArrowLeft': move(0, -1); break;
    case 'ArrowRight': move(0, 1); break;
    case 'ArrowUp': move(-1, 0); break;
    case 'ArrowDown': move(1, 0); break;
    case ' ': tapCell(cat, s, v); break;
    case 'x': case 'X': setVal(NO); break;
    case 'o': case 'O': case 'Enter': setVal(YES); break;
    case 'Backspace': case 'Delete': setVal(BLANK); break;
    default: return false;
  }
  e.preventDefault();
  return true;
}

function boardHint() {
  sound.unlock();
  const h = session.hint();
  if (h.counted) log.event('hint.used', { kind: h.kind, hints: session.hints });
  sound.play('hint');
  if (h.kind === 'more') { closeBoard(); pointAt(h); return; }
  highlighted = null;
  if (h.cells.length && gridLayout().tabs) gridCat = h.cells[0].cat;
  renderBoard(h.lines);
  for (const c of h.cells) cellEl(c.cat, c.s, c.v)?.classList.add(h.kind === 'wrong' ? 'wrong' : 'flash');
  persistSession();
  if (save.settings.speech) say(h.lines.join(' '));
}

// Free nudge toward a clue nobody has found yet.
function pointAt(h) {
  if (h.target.place !== place) setPlace(h.target.place);
  if (h.target.spot != null) glint = { place: h.target.place, spot: h.target.spot, t: 0 };
  const el = h.target.suspect != null ? spotEls[spotEls.length - 1] : spotEls[h.target.spot];
  el?.focus({ preventScroll: true });
  toast(`💡 ${h.lines[0]} ${h.lines[1]}`);
  if (save.settings.speech) say(h.lines.join(' '));
}

function hudHint() {
  if (!session) return;
  sound.unlock();
  const h = session.findHint();
  if (h) { sound.play('hint'); pointAt(h); return; }
  openBoard();
  boardHint();
}

// ----------------------------------------------------------------- accuse

const picks = { who: -1, where: -1, what: -1 };

function openAccuse() {
  if (!session) return;
  if (mode === 'paused') { mode = 'play'; show(null); }
  const k = session.kase;
  const N = namesFor(k);
  $('dlg').classList.add('hidden');
  $('board').classList.add('hidden');
  $('accuse').classList.remove('hidden');
  $('spots').classList.add('hidden');
  $('accuse-title').textContent = k.ask;
  $('accuse-ask').textContent = session.foundCount < session.total ? `You found ${session.foundCount} of ${session.total} clues. You can guess now, or look for more!` : 'You found every clue. Use your clue board!';
  $('accuse-msg').textContent = '';
  const fill = (el, key, items) => {
    el.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'pick';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(picks[key] === i));
      b.appendChild(it.art);
      const t = document.createElement('span');
      t.textContent = it.name;
      b.appendChild(t);
      b.addEventListener('click', () => {
        picks[key] = i;
        sound.play('tap');
        for (const x of el.children) x.setAttribute('aria-checked', String(x === b));
        $('accuse-go').disabled = picks.who < 0 || picks.where < 0 || picks.what < 0;
      });
      el.appendChild(b);
    });
  };
  for (const key of Object.keys(picks)) if (picks[key] >= k.n) picks[key] = -1;
  fill($('pick-who'), 'who', k.suspects.map((id, i) => ({ art: portrait(id, 54), name: N.who[i] })));
  fill($('pick-where'), 'where', k.places.map((id, i) => ({ art: icon('place', id, 54), name: N.where[i] })));
  fill($('pick-what'), 'what', k.things.map((id, i) => ({ art: icon('thing', id, 54), name: N.what[i] })));
  $('accuse-go').disabled = picks.who < 0 || picks.where < 0 || picks.what < 0;
  sound.play('page');
  $('pick-who').firstChild?.focus({ preventScroll: true });
}

function closeAccuse() {
  $('accuse').classList.add('hidden');
  if (mode === 'play') $('spots').classList.remove('hidden');
  $('btn-accuse').focus({ preventScroll: true });
}

function doAccuse() {
  const r = session.accuse(picks.who, picks.where, picks.what);
  if (r.ok) { $('accuse').classList.add('hidden'); startReveal(); return; }
  sound.play('wrong');
  log.event('level.fail', { reason: 'wrong_guess', wrong: session.wrong, kind: meta.kind, difficulty: session.kase.difficulty });
  const msg = $('accuse-msg');
  let text = 'Hmm, check your clues!';
  if (session.kase.difficulty === 1) {
    const parts = [['Who', r.right.who], ['Where', r.right.where], ['What', r.right.what]];
    const good = parts.filter((x) => x[1]).map((x) => x[0]);
    text += good.length ? ` ${good.join(' and ')} ${good.length > 1 ? 'are' : 'is'} right!` : ' Try the clue board.';
  } else {
    text += ' Try the clue board.';
  }
  msg.textContent = text;
  msg.classList.remove('bad'); void msg.offsetWidth; msg.classList.add('bad');
  persistSession();
  if (save.settings.speech) say(text);
}

// ----------------------------------------------------------------- reveal

let revealResult = null;
function startReveal() {
  const k = session.kase;
  mode = 'reveal';
  revealT = 0;
  stopSpeaking();
  const m = byId(MYSTERIES, k.mystery);
  const name = byId(CRITTERS, k.suspects[k.culprit]).name;
  $('reveal-name').textContent = `${name}:`;
  $('reveal-line').textContent = `It was me! I ${m.did}. ${k.reason}`;
  $('reveal-stamp').classList.remove('on');
  show('reveal');
  sound.play('drum');
  const elapsed = Math.round((performance.now() - startedAt) / 1000);
  revealResult = recordSolve(save, k, { wrong: session.wrong, hints: session.hints, day: today, storyIndex: meta.index ?? -1 });
  persist();
  log.event('level.complete', { kind: meta.kind, difficulty: k.difficulty, stars: revealResult.stars, wrong: session.wrong, hints: session.hints, time: elapsed, rank: revealResult.rank.name });
  if (meta.kind === 'daily') log.event('daily.solved', { streak: save.daily.streak });
  setTimeout(() => { if (mode === 'reveal') { $('reveal-stamp').classList.add('on'); sound.play('stamp'); burst(view.w / 2, view.h * 0.45, 60, 'confetti'); } }, reduced ? 300 : 1500);
  setTimeout(() => { if (mode === 'reveal') sound.play('solve'); }, reduced ? 400 : 1800);
  if (save.settings.speech) setTimeout(() => say($('reveal-line').textContent), 700);
  queueMicrotask(() => monitor.mark(performance.now(), 'reveal'));
  setTimeout(() => $('reveal-next').focus({ preventScroll: true }), 1700);
}

function showResult() {
  const r = revealResult;
  const k = session.kase;
  mode = 'result';
  stopSpeaking();
  $('result-title').textContent = r.stars === 3 ? 'Perfect detective work!' : 'Case solved!';
  const stars = $('result-stars');
  stars.innerHTML = '<span>★</span><span>★</span><span>★</span>';
  [...stars.children].forEach((el, i) => {
    if (i < r.stars) setTimeout(() => { el.classList.add('on'); sound.play('star', i); }, 300 + i * 350);
  });
  stars.setAttribute('aria-label', `${r.stars} of 3 stars`);
  const slips = [];
  slips.push(session.wrong ? `${session.wrong} wrong guess${session.wrong > 1 ? 'es' : ''}` : 'No wrong guesses!');
  slips.push(session.hints ? `${session.hints} hint${session.hints > 1 ? 's' : ''}` : 'no hints');
  $('result-sub').textContent = `${slips.join(' · ')}${r.newBest ? ' · New best!' : ''}`;
  rankBox($('result-rank'));
  const un = $('result-unlocks');
  un.innerHTML = '';
  const addUnlock = (art, text) => {
    const d = document.createElement('div');
    d.className = 'unlock';
    d.appendChild(art);
    const t = document.createElement('span');
    t.textContent = text;
    d.appendChild(t);
    un.appendChild(d);
  };
  if (r.rankUp) addUnlock(portrait('pip', 46, { mood: 'joy' }), `New rank: ${r.rank.name}!`);
  for (const id of r.unlocked) {
    const hat = HATS.find((h) => h.id === id);
    const coat = COATS.find((c) => c.id === id);
    const sp = critterSprite('pip', Math.round(46 * DPR), hat ? { kind: 'head', hat: id } : { kind: 'body', coat: id, hat: save.outfit.hat });
    addUnlock(copyCanvas(sp.canvas, 46 * sp.canvas.width / sp.canvas.height, 46), `New ${hat ? 'hat' : 'coat'}: ${(hat || coat).name}! Try it in the wardrobe.`);
  }
  for (const id of r.newFriends) addUnlock(portrait(id, 46, { mood: 'joy' }), `New friend: ${byId(CRITTERS, id).name}!`);
  if (r.unlocked.length || r.rankUp) setTimeout(() => sound.play('unlock'), 1400);
  const next = $('result-next');
  if (meta.kind === 'story') next.textContent = meta.index + 1 < STORY_CASES.length ? 'Next case →' : 'Story list →';
  else if (meta.kind === 'daily') next.textContent = 'See you tomorrow! →';
  else next.textContent = 'Another case →';
  show('screen-result');
}

function resultNext() {
  if (meta.kind === 'story') {
    if (meta.index + 1 < STORY_CASES.length) startStory(meta.index + 1);
    else openMenu('screen-story', buildStory);
  } else if (meta.kind === 'daily') toTitle();
  else startEndless(meta.difficulty);
}

// ------------------------------------------------------------------ pause

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  for (const p of PANELS) $(p).classList.add('hidden');
  stopSpeaking();
  syncToggles();
  show('screen-pause');
  persistSession();
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  show(null);
  buildSpots();
  spotEls[0]?.focus({ preventScroll: true });
}

function quitToTitle() {
  persistSession();
  toTitle();
}

// ------------------------------------------------------------------ input

function wire() {
  $('btn-story').addEventListener('click', () => openMenu('screen-story', buildStory));
  $('btn-daily').addEventListener('click', startDaily);
  $('btn-endless').addEventListener('click', () => openMenu('screen-endless', buildEndless));
  $('btn-book').addEventListener('click', () => openMenu('screen-book', buildBook));
  $('btn-friends').addEventListener('click', () => openMenu('screen-friends', buildFriends));
  $('btn-wardrobe').addEventListener('click', () => openMenu('screen-wardrobe', buildWardrobe));
  $('btn-settings').addEventListener('click', () => openMenu('screen-settings', syncToggles));
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => { sound.play('tap'); back(); });
  for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
  for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', () => { save.settings.music = !save.settings.music; sound.setMusic(save.settings.music); persist(); syncToggles(); });
  for (const b of document.querySelectorAll('[data-speech]')) b.addEventListener('click', () => {
    save.settings.speech = !save.settings.speech; persist(); syncToggles();
    if (save.settings.speech) say('I will read things out loud for you!');
    else stopSpeaking();
  });
  $('intro-go').addEventListener('click', () => { sound.play('tap'); enterPlay(); });
  $('intro-say').addEventListener('click', () => { const k = session.kase; say(`${k.title}. ${k.intro} ${k.ask}`); });
  $('btn-pause').addEventListener('click', pause);
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-board').addEventListener('click', () => { resume(); openBoard(); });
  $('btn-quit').addEventListener('click', quitToTitle);
  $('btn-mute').addEventListener('click', toggleMute);
  $('btn-hint').addEventListener('click', hudHint);
  $('btn-board').addEventListener('click', () => openBoard());
  $('btn-accuse').addEventListener('click', openAccuse);
  $('board-close').addEventListener('click', closeBoard);
  $('board-hint').addEventListener('click', boardHint);
  $('accuse-close').addEventListener('click', closeAccuse);
  $('accuse-go').addEventListener('click', doAccuse);
  $('dlg-ok').addEventListener('click', closeDialog);
  $('dlg-say').addEventListener('click', () => say(dlgText, dlgPitch));
  $('reveal-next').addEventListener('click', () => { sound.play('tap'); showResult(); });
  $('result-next').addEventListener('click', resultNext);
  $('result-book').addEventListener('click', () => openMenu('screen-book', buildBook));
  $('result-title-btn').addEventListener('click', toTitle);
  for (const b of $('grid-tabs').querySelectorAll('.seg-btn')) b.addEventListener('click', () => { gridCat = b.dataset.cat; sound.play('tap'); renderBoard(); });
  $('dlg').addEventListener('click', (e) => { if (e.target === $('dlg')) closeDialog(); });
  $('board').addEventListener('click', (e) => { if (e.target === $('board')) closeBoard(); });
  $('accuse').addEventListener('click', (e) => { if (e.target === $('accuse')) closeAccuse(); });

  addEventListener('pointerdown', () => sound.unlock(), { passive: true });
  addEventListener('keydown', onKey);
  addEventListener('mousemove', () => { pointerIdle = 0; document.body.classList.remove('no-cursor'); }, { passive: true });
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!resize()) return;
      if (mode === 'play') buildSpots();
      if (!$('board').classList.contains('hidden')) renderBoard();
    }, 120);
  });
}

function onKey(e) {
  sound.unlock();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const panel = panelOpen();
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (e.key === 'Escape' && panel) {
      e.preventDefault();
      if (panel === 'dlg') closeDialog(); else if (panel === 'board') closeBoard(); else closeAccuse();
      return;
    }
    if (mode === 'play') { e.preventDefault(); pause(); return; }
    if (mode === 'paused') { e.preventDefault(); resume(); return; }
    if (e.key === 'Escape' && mode === 'menu') { e.preventDefault(); back(); return; }
    if (e.key === 'Escape' && mode === 'intro') { e.preventDefault(); toTitle(); return; }
    return;
  }
  if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
  if (panel === 'board' && gridKey(e)) return;
  if (mode !== 'play' || panel) return;
  if (e.key >= '1' && e.key <= '9') {
    const p = Number(e.key) - 1;
    if (p < session.n) { sound.play('tap'); setPlace(p); spotEls[0]?.focus({ preventScroll: true }); }
    return;
  }
  if (e.key === 'b' || e.key === 'B' || e.key === 'g' || e.key === 'G') { openBoard(); return; }
  if (e.key === 's' || e.key === 'S' || e.key === 'a' || e.key === 'A') { openAccuse(); return; }
  if (e.key === 'h' || e.key === 'H') { hudHint(); return; }
  if (e.key.startsWith('Arrow')) {
    const i = spotEls.indexOf(document.activeElement);
    if (i < 0) { spotEls[0]?.focus(); e.preventDefault(); return; }
    const from = spotEls[i].getBoundingClientRect();
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    let best = null, bestD = Infinity;
    for (const el of spotEls) {
      if (el === spotEls[i]) continue;
      const r = el.getBoundingClientRect();
      const dx = r.x + r.width / 2 - (from.x + from.width / 2), dy = r.y + r.height / 2 - (from.y + from.height / 2);
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 4) continue;
      const d = along + Math.abs(dx * dir[1] + dy * dir[0]) * 2;
      if (d < bestD) { bestD = d; best = el; }
    }
    if (best) best.focus();
    e.preventDefault();
  }
}

// ------------------------------------------------------------------ drawing

let titleBottom = 0;
function drawTitle(t) {
  if (!titleBottom) titleBottom = document.querySelector('.title-wrap')?.getBoundingClientRect().bottom || 0;
  if (!titleBake) titleBake = bakeTitle(view.w, view.h, DPR);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(titleBake.canvas, 0, 0);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // Pip, big, on the right (or bottom centre on phones)
  const narrow = view.w <= 760;
  let ph = narrow ? Math.min(250, view.h * 0.3) : Math.min(520, view.h * 0.66);
  if (narrow) ph = Math.min(ph, view.h - titleBottom - 8);
  if (ph < 90) return;
  const sp = critterSprite('pip', Math.round(ph * DPR), { kind: 'body', blink: blinkNow(t, 0) });
  const w = ph * sp.canvas.width / sp.canvas.height;
  const x = narrow ? view.w - w * 0.92 : view.w * 0.72 - w / 2;
  const y = view.h - ph - (narrow ? 4 : view.h * 0.06) + (reduced ? 0 : Math.sin(t * 2) * 4);
  ctx.drawImage(sp.canvas, x, y, w, ph);
  // a friend peeking in
  if (!narrow) {
    const fh = ph * 0.62;
    const f = critterSprite(CRITTERS[Math.floor(t / 6) % CRITTERS.length].id, Math.round(fh * DPR), { kind: 'body', blink: blinkNow(t, 3) });
    const fw = fh * f.canvas.width / f.canvas.height;
    ctx.drawImage(f.canvas, view.w * 0.9 - fw / 2, view.h - fh - view.h * 0.04 + (reduced ? 0 : Math.abs(Math.sin(t * 3)) * -6), fw, fh);
  }
  if (!reduced && Math.random() < 0.02 && particles.length < 20) {
    particles.push({ x: Math.random() * view.w, y: -10, vx: 0, vy: 20, life: 0, max: 12, kind: 'leaf', color: ['#ff9b2f', '#ffcf3f', '#e8524a'][Math.floor(Math.random() * 3)], size: 7, rot: Math.random() * 6, vr: 1.2 });
  }
}

function blinkNow(t, offset) {
  return ((t + offset) % 4.2) < 0.13;
}

function drawScene(t, dt) {
  const k = session.kase;
  const b = placeBake(k.places[place]);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(b.back, 0, 0);
  const { s, ox, oy } = b.fit;
  ctx.setTransform(DPR * s, 0, 0, DPR * s, DPR * ox, DPR * oy);
  if (b.dynamic) b.dynamic(ctx, reduced ? 0 : t);
  // Clues peeking out from behind their props.
  for (const ci of session.sceneClues(place)) {
    if (session.found.has(ci)) continue;
    const c = k.clues[ci];
    const slot = b.layout.slots[c.src.spot];
    const look = clueLook(k, c);
    const px = Math.round(84 * s * DPR);
    const spr = sprite(`peek:${look.kind}:${look.color}:${px}`, () => bakeIcon(drawClueItem, look.kind, px, look.color));
    ctx.save();
    ctx.translate(slot.x + slot.w * 0.42, slot.y - 26);
    ctx.rotate(0.25);
    ctx.drawImage(spr, -42, -42, 84, 84);
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(b.front, 0, 0);
  ctx.setTransform(DPR * s, 0, 0, DPR * s, DPR * ox, DPR * oy);
  // The suspect standing here.
  const who = session.suspectAt(place);
  if (who >= 0) {
    const st = b.layout.stand;
    const H = 330;
    const px = Math.round(H * s * DPR);
    const spr = critterSprite(k.suspects[who], px, { kind: 'body', blink: blinkNow(t, who * 1.3), wave: !session.talked.has(who) && Math.floor(t * 1.2) % 4 === 0 });
    const w = H * spr.canvas.width / spr.canvas.height;
    const hop = reduced ? 0 : Math.abs(Math.sin(t * 2.2 + who)) * 6;
    ctx.fillStyle = 'rgba(40,60,30,0.22)';
    ctx.beginPath(); ctx.ellipse(st.x, st.y - 4, 70, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(spr.canvas, st.x - w / 2, st.y - H - hop, w, H);
  }
  // Glints: easy cases sparkle hidden clues now and then; any case does
  // after a long while without finding anything.
  const quiet = (performance.now() - lastFind) / 1000;
  const unfound = session.sceneClues(place).filter((ci) => !session.found.has(ci));
  const showGlint = (spot, strength) => {
    const slot = b.layout.slots[spot];
    const a = strength * (0.5 + 0.5 * Math.sin(t * 6));
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = '#fff8b0';
    star(ctx, slot.x + slot.w * 0.4, slot.y - 40, 26 + 8 * Math.sin(t * 6));
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  for (const ci of unfound) {
    const spot = k.clues[ci].src.spot;
    if (k.difficulty === 1 && (t % 3.2) < 0.9) showGlint(spot, 0.9);
    else if (quiet > 25 && (t % 2.4) < 0.9) showGlint(spot, 0.8);
  }
  if (glint && glint.place === place) {
    glint.t += dt;
    showGlint(glint.spot, 1);
    if (glint.t > 6) glint = null;
  }
  // Pip in the left wing, when there is room for him.
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (ox > 170) {
    const ph = Math.min(300, view.h * 0.42);
    const pip = critterSprite('pip', Math.round(ph * DPR), { kind: 'body', blink: blinkNow(t, 2) });
    const pw = ph * pip.canvas.width / pip.canvas.height;
    ctx.drawImage(pip.canvas, ox * 0.5 - pw / 2, view.h - barH - ph - 6 + (reduced ? 0 : Math.sin(t * 1.8) * 3), pw, ph);
  }
  if (searchAnim) {
    searchAnim.t += dt;
    const r = 34 + searchAnim.t * 40;
    ctx.save();
    ctx.translate(searchAnim.x + Math.sin(searchAnim.t * 26) * 6, searchAnim.y);
    ctx.lineWidth = 7; ctx.strokeStyle = '#c99a3a'; ctx.fillStyle = 'rgba(190,230,255,0.35)';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 10; ctx.strokeStyle = '#7a4a28';
    ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.7); ctx.lineTo(r * 1.5, r * 1.5); ctx.stroke();
    ctx.restore();
  }
}

function drawReveal(t, dt) {
  const k = session.kase;
  revealT += dt;
  const where = k.places[k.solution.place[k.culprit]];
  const b = placeBake(where, true);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(b.back, 0, 0);
  ctx.drawImage(b.front, 0, 0);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const spot = sprite(`spot:${view.w}x${view.h}`, () => {
    const c = makeCanvas(view.w, view.h);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(view.w / 2, view.h * 0.72, 40, view.w / 2, view.h * 0.72, Math.max(view.w, view.h) * 0.6);
    grad.addColorStop(0, 'rgba(255,240,180,0)');
    grad.addColorStop(0.35, 'rgba(30,20,50,0.25)');
    grad.addColorStop(1, 'rgba(30,20,50,0.78)');
    g.fillStyle = grad;
    g.fillRect(0, 0, view.w, view.h);
    return c;
  });
  ctx.drawImage(spot, 0, 0, view.w, view.h);
  const H = Math.min(view.h * 0.5, view.w * 0.62, 420);
  const enter = Math.min(1, revealT / 0.7);
  const ease = 1 - Math.pow(1 - enter, 3);
  const spr = critterSprite(k.suspects[k.culprit], Math.round(H * DPR), { kind: 'body', mood: revealT > 0.6 ? 'sheepish' : 'surprised', wave: revealT > 1.6 && Math.floor(revealT * 2) % 2 === 0 });
  const w = H * spr.canvas.width / spr.canvas.height;
  const hop = reduced ? 0 : Math.abs(Math.sin(revealT * 4)) * (revealT > 1.5 ? 10 : 2);
  const y = view.h * 0.95 - H + (1 - ease) * H - hop;
  ctx.drawImage(spr.canvas, view.w / 2 - w / 2, y, w, H);
  const ph = H * 0.72;
  const pip = critterSprite('pip', Math.round(ph * DPR), { kind: 'body', mood: revealT > 1.5 ? 'joy' : 'happy' });
  const pw = ph * pip.canvas.width / pip.canvas.height;
  ctx.drawImage(pip.canvas, view.w / 2 - w / 2 - pw * 0.95, view.h * 0.95 - ph, pw, ph);
  // the missing thing comes back
  if (revealT > 1.5) {
    const ic = sprite(`mys:${k.mystery}:${Math.round(110 * DPR)}`, () => bakeIcon(drawMysteryItem, k.mystery, Math.round(110 * DPR)));
    const a = Math.min(1, (revealT - 1.5) * 3);
    ctx.globalAlpha = a;
    ctx.drawImage(ic, view.w / 2 + w * 0.42, view.h * 0.95 - H * 0.55 + (reduced ? 0 : Math.sin(revealT * 3) * 6), 110, 110);
    ctx.globalAlpha = 1;
  }
  if (!reduced && revealT > 1.6 && revealT < 5 && Math.random() < 0.15) burst(Math.random() * view.w, -10, 3, 'confetti');
}

// ------------------------------------------------------------- frame loop

const monitor = frameMonitor({
  log,
  snapshot: () => ({ screen: mode, place, case: session?.kase.id || 'none' }),
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
  const t = now / 1000;
  bob += dt;
  if (resize() && mode === 'play') buildSpots();
  sound.tick();
  // pointer hiding during play
  if (mode === 'play' && !panelOpen()) {
    pointerIdle += dt;
    if (pointerIdle > 2) document.body.classList.add('no-cursor');
  } else if (document.body.classList.contains('no-cursor')) document.body.classList.remove('no-cursor');
  // spread baking: one queued place per frame at most
  if (prebakeQueue.length && mode === 'play' && now - startedAt > 400) placeBake(prebakeQueue.shift());
  updateParticles(dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if ((mode === 'play' || mode === 'paused') && session) drawScene(t, dt);
  else if (mode === 'reveal' && session) drawReveal(t, dt);
  else if ((mode === 'result') && session) drawReveal(t, dt);
  else drawTitle(t);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawParticles();
  if (autoplay) autoplay.tick(dt);
  if (params.has('crash') && now - startedAt > 1500 && mode === 'play') throw new Error('forced crash test');
  requestAnimationFrame(loop);
}
const loop = telemetry ? telemetry.guard(frame, 'clue-critters.frame') : frame;

// --------------------------------------------------------------- autoplay

// ?autoplay plays the current case like a (fast) child: visit, search,
// talk, fill the grid from the clues, then accuse.
function makeAutoplay() {
  let plan = autoPlan(session);
  let wait = 0.6;
  return {
    tick(dt) {
      if (mode === 'result') { autoplay = null; return; }
      if (mode === 'intro') { enterPlay(); return; }
      wait -= dt;
      if (wait > 0 || busy) return;
      if (!$('dlg').classList.contains('hidden')) { closeDialog(); wait = 0.25; return; }
      if (mode === 'reveal') { if (revealT > 4) showResult(); return; }
      const a = plan.shift();
      if (!a) return;
      if (a.do === 'visit') { setPlace(a.place); wait = 0.35; return; }
      if (a.do === 'search') { if (session.searched[a.place].has(a.spot)) return; searchSpot(a.spot); wait = 0.55; return; }
      if (a.do === 'talk') { talkTo(a.s); wait = 0.5; return; }
      if (a.do === 'reason') { openBoard(); autoStep(session, a); renderBoard(); wait = 1.0; return; }
      if (a.do === 'accuse') {
        closeBoard();
        const k = session.kase;
        picks.who = k.culprit; picks.where = k.solution.place[k.culprit]; picks.what = k.solution.thing[k.culprit];
        openAccuse();
        setTimeout(() => doAccuse(), 600);
        wait = 1;
      }
    },
  };
}

// -------------------------------------------------------------------- boot

wire();
syncToggles();
resize();
if (location.protocol !== 'file:') {
  log.event('game.ready', { stars: totalStars(save), rank: rankFor(totalStars(save)).name, cases: save.cases, speech: speechSupported });
  const caseParam = parseInt(params.get('case'), 10);
  const seedParam = params.get('seed');
  if (caseParam >= 1 && caseParam <= STORY_CASES.length) startStory(caseParam - 1);
  else if (seedParam != null) beginCase(generateCase(Number(seedParam) >>> 0, Math.max(1, Math.min(3, parseInt(params.get('diff'), 10) || 1))), { kind: 'gen', difficulty: Math.max(1, Math.min(3, parseInt(params.get('diff'), 10) || 1)), seed: Number(seedParam) >>> 0 });
  else if (params.has('daily')) startDaily();
  else toTitle();
  if (params.has('autoplay') && session) autoplay = makeAutoplay();
  requestAnimationFrame(loop);
}

window.CC = {
  get mode() { return mode; }, get session() { return session; }, get place() { return place; }, save, setPlace,
  startStory, startEndless, startDaily, openBoard, openAccuse, showResult, toTitle,
  autoplay() { if (session) autoplay = makeAutoplay(); }, ranks: RANKS, meets,
};
