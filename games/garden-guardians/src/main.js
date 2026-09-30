// Browser shell: screens, input, HUD and the fixed-step loop.
import { Game, STEP } from './game.js';
import { AutoPlayer } from './autoplay.js';
import { Renderer, renderThumbnail } from './render.js';
import { Sound } from './audio.js';
import { drawDefender, drawBug } from './sprites.js';
import { DEFENDERS, DEFENDER_ORDER, BUGS, TARGETING, TARGETING_LABEL } from './data.js';
import { MAPS, AREAS, COLS, ROWS } from './maps.js';
import { upgradeCost, buildCost } from './combat.js';
import { loadSave, writeSave, isMapUnlocked, unlockedDefenders, recordResult, totalStars } from './progress.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

const save = loadSave(localStorage);
const sound = new Sound({ muted: save.muted, music: save.music });
const renderer = new Renderer($('game'));
renderer.reduced = motionQuery.matches;
motionQuery.addEventListener?.('change', (e) => { renderer.reduced = e.matches; });

const debugUnlock = params.has('unlock');
const debugAutoplay = params.has('autoplay');

let game = null, bot = null;
let mode = 'title'; // title | maps | play | paused | results
let speed = save.fast ? 2 : 1;
let acc = 0, endTimer = 0, attractTimer = 0;
let hudCache = {};
const ui = { placing: null, site: null, selected: null, hover: null, cursor: null, cursorOn: false, shift: false };

function unlockedFor(mapIndex) {
  return debugUnlock ? DEFENDER_ORDER.slice() : unlockedDefenders(save, mapIndex);
}

// ------------------------------------------------------------ layout

function resize() {
  const board = $('board');
  const r = board.getBoundingClientRect();
  renderer.resize(Math.max(1, r.width), Math.max(1, r.height), Math.min(2.5, devicePixelRatio || 1));
}
new ResizeObserver(resize).observe($('board'));
addEventListener('resize', resize);

function iconCanvas(canvas, draw, size) {
  const dpr = Math.min(2.5, devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  draw(ctx, size);
}

function defenderIcon(canvas, type, tier = 0, size = 56) {
  iconCanvas(canvas, (ctx, s) => {
    ctx.translate(s / 2, s * 0.56);
    drawDefender(ctx, s * 0.95, type, { tier, aim: -0.4, t: 0 });
  }, size);
}

// ------------------------------------------------------------ game setup

function load(mapIndex, { attract = false } = {}) {
  game = new Game(mapIndex, { unlocked: attract ? DEFENDER_ORDER : unlockedFor(mapIndex) });
  renderer.setGame(game);
  bot = attract || debugAutoplay ? new AutoPlayer(game, { callEarly: attract }) : null;
  Object.assign(ui, { placing: null, site: null, selected: null, hover: null, cursor: null, cursorOn: false });
  acc = 0;
  endTimer = 0;
  hudCache = {};
  resize();
}

function startMap(mapIndex) {
  sound.unlock();
  load(mapIndex);
  mode = 'play';
  showScreen(null);
  buildPanelButtons();
  renderPanel();
  sound.setMusicLevel(1);
  const m = MAPS[mapIndex];
  if (mapIndex === 0 && !save.stars[m.id]) {
    toast('Tap the grass beside the path to plant a <b>Pea Pod</b>!', 'Then press <b>Start wave</b> when you are ready.', 5);
  } else {
    toast(`<b>${m.name}</b>`, `${m.waves} waves · keep Grandma's snacks safe!`, 3);
  }
}

// ------------------------------------------------------------ screens

const SCREENS = ['screen-title', 'screen-maps', 'screen-pause', 'screen-results'];

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const inGame = mode === 'play' || mode === 'paused' || mode === 'results';
  $('hud').classList.toggle('hidden', !inGame);
  $('panel').classList.toggle('hidden', !inGame);
  if (id) requestAnimationFrame(() => $(id).querySelector('.btn.primary:not(:disabled), .map-card:not(:disabled), .btn')?.focus({ preventScroll: true }));
  else document.activeElement?.blur?.();
}

function toTitle() {
  mode = 'title';
  if (!game || !bot || game.mapIndex !== 0 || game.over) load(0, { attract: true });
  const stars = totalStars(save);
  $('title-progress').textContent = stars ? `★ ${stars} / ${MAPS.length * 3} stars collected` : '';
  showScreen('screen-title');
}

function toMaps() {
  mode = 'maps';
  if (!bot || debugAutoplay) load(0, { attract: true });
  renderMaps();
  showScreen('screen-maps');
}

function renderMaps() {
  const list = $('map-list');
  list.innerHTML = '';
  $('maps-stars').textContent = `★ ${totalStars(save)} / ${MAPS.length * 3}`;
  const thumbs = [];
  for (const area of AREAS) {
    const sec = document.createElement('section');
    sec.className = 'area';
    sec.innerHTML = `<h4>${area.name}<small>${area.blurb}</small></h4>`;
    const row = document.createElement('div');
    row.className = 'area-row';
    MAPS.forEach((m, i) => {
      if (m.area !== area.id) return;
      const open = debugUnlock || isMapUnlocked(save, i);
      const stars = save.stars[m.id] || 0;
      const card = document.createElement('button');
      card.className = 'map-card';
      card.disabled = !open;
      const bossNames = m.boss.map((b) => BUGS[b].name).join(' + ');
      card.innerHTML = `<canvas></canvas>
        <div class="meta"><span class="mname">${i + 1}. ${m.name}</span><span class="mstars">${open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : ''}</span></div>
        <div class="msub">${open ? `${m.waves} waves · Boss: ${bossNames}` : `<span class="lock">🔒 Save the picnic at ${MAPS[i - 1].name}</span>`}</div>`;
      card.addEventListener('click', () => { sound.play('click'); startMap(i); });
      row.appendChild(card);
      thumbs.push([card.querySelector('canvas'), i]);
    });
    sec.appendChild(row);
    list.appendChild(sec);
  }
  requestAnimationFrame(() => thumbs.forEach(([c, i]) => renderThumbnail(c, i)));
  const roster = $('roster');
  roster.innerHTML = '<span>Your defenders:</span>';
  const owned = unlockedFor(0);
  for (const t of DEFENDER_ORDER) {
    const c = document.createElement('canvas');
    c.title = owned.includes(t) ? `${DEFENDERS[t].name} — ${DEFENDERS[t].role}` : `${DEFENDERS[t].name} — unlocks at map ${DEFENDERS[t].unlock + 1}`;
    if (!owned.includes(t)) c.className = 'off';
    roster.appendChild(c);
    defenderIcon(c, t, 0, 40);
  }
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  $('pause-info').textContent = `${game.map.name} · wave ${game.wave}/${game.waves.length}`;
  updateSoundButtons();
  sound.setMusicLevel(0.4);
  showScreen('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  sound.setMusicLevel(1);
  showScreen(null);
}

function updateSoundButtons() {
  $('btn-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
  $('btn-music').textContent = `Music: ${save.music ? 'on' : 'off'}`;
  $('btn-sound').textContent = save.muted ? '🔇' : '♪';
  $('btn-sound').classList.toggle('on', !save.muted);
}

function toggleMute() {
  save.muted = !save.muted;
  sound.unlock();
  sound.setMuted(save.muted);
  writeSave(localStorage, save);
  updateSoundButtons();
}

function toggleMusic() {
  save.music = !save.music;
  sound.unlock();
  sound.setMusic(save.music);
  writeSave(localStorage, save);
  updateSoundButtons();
}

function toggleSpeed() {
  speed = speed === 1 ? 2 : 1;
  save.fast = speed === 2;
  writeSave(localStorage, save);
  sound.play('click');
  hudCache.speed = null;
}

// ------------------------------------------------------------ results

function showResults() {
  mode = 'results';
  const won = game.status === 'won';
  const stars = game.stars;
  const lines = [];
  const buttons = [];
  const starEls = $('res-stars').querySelectorAll('span');
  $('res-stars').classList.toggle('hidden', !won);
  if (won) {
    const res = recordResult(save, game.mapIndex, stars);
    writeSave(localStorage, save);
    starEls.forEach((s, i) => s.classList.toggle('on', i < stars));
    $('res-title').textContent = stars === 3 ? 'Perfect picnic!' : 'Picnic saved!';
    $('res-sub').textContent = `${game.map.name} · ${game.baskets} of ${game.maxBaskets} baskets left`;
    lines.push(['Bugs shooed', game.stats.shooed]);
    if (game.stats.bonus) lines.push(['Early-wave bonus', `+${game.stats.bonus}`]);
    if (game.stats.earned) lines.push(['Sun Daisy coins', `+${game.stats.earned}`]);
    for (const t of res.newDefenders) lines.push([`New defender: ${DEFENDERS[t].name} (${DEFENDERS[t].role})`]);
    if (res.newMap !== null) lines.push([`New garden unlocked: ${MAPS[res.newMap].name}`]);
    if (stars < 3) lines.push([stars === 2 ? 'Tip: lose 1 basket or fewer for ★★★' : 'Tip: keep 5 baskets for ★★']);
    const next = game.mapIndex + 1;
    if (next < MAPS.length && (debugUnlock || isMapUnlocked(save, next))) buttons.push(['Next garden →', true, () => startMap(next)]);
    buttons.push(['Play again', !buttons.length, () => startMap(game.mapIndex)]);
    sound.play('win');
  } else {
    $('res-title').textContent = 'The bugs got the snacks!';
    $('res-sub').textContent = `${game.map.name} · reached wave ${game.wave} of ${game.waves.length}`;
    lines.push(['Bugs shooed', game.stats.shooed]);
    lines.push(['Tip: honey slows bugs, and Sunflower Cannons shoo crowds.']);
    buttons.push(['Try again', true, () => startMap(game.mapIndex)]);
    sound.play('lose');
  }
  buttons.push(['Choose garden', false, toMaps]);
  $('res-lines').innerHTML = lines.map(([a, b]) => (b === undefined ? `<div class="highlight">${a}</div>` : `<div><span>${a}</span><b>${b}</b></div>`)).join('');
  const row = $('res-buttons');
  row.innerHTML = '';
  for (const [label, primary, fn] of buttons) {
    const b = document.createElement('button');
    b.className = `btn${primary ? ' primary' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => { sound.play('click'); fn(); });
    row.appendChild(b);
  }
  Object.assign(ui, { placing: null, site: null, selected: null });
  renderPanel();
  showScreen('screen-results');
}

// ------------------------------------------------------------ HUD & toasts

let toastTimer = null;
function toast(html, sub = '', secs = 2.6) {
  const el = $('toast');
  el.innerHTML = sub ? `${html}<small>${sub}</small>` : html;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), secs * 1000);
}

let bannerTimer = null;
function banner(text, boss = false) {
  const el = $('banner');
  el.textContent = text;
  el.classList.remove('show', 'boss');
  void el.offsetWidth;
  el.classList.add('show');
  el.classList.toggle('boss', boss);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1700);
}

function bump(id, cls = 'bump') {
  const el = $(id).parentElement;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function setText(id, value) {
  if (hudCache[id] === value) return;
  hudCache[id] = value;
  $(id).textContent = value;
}

function updateHud() {
  setText('hud-coins', String(game.coins));
  setText('hud-baskets', String(game.baskets));
  setText('hud-baskets-max', String(game.maxBaskets));
  setText('hud-wave', `${game.wave}/${game.waves.length}`);
  const next = game.nextWave;
  setText('hud-next-text', next ? game.preview() : 'Final wave — shoo them all!');
  const boss = !!next?.boss;
  if (hudCache.boss !== boss) { hudCache.boss = boss; $('hud-next').classList.toggle('boss', boss); }
  let label, enabled, pulse = false;
  if (game.over) { label = 'Done'; enabled = false; }
  else if (game.status === 'ready') { label = 'Start wave ▶'; enabled = true; pulse = game.defenders.length > 0; }
  else if (game.canCallWave()) { label = `Next wave +${game.earlyBonus()}`; enabled = true; pulse = !game.bugs.length; }
  else if (game.wave >= game.waves.length) { label = 'Final wave'; enabled = false; }
  else { label = 'Wave marching…'; enabled = false; }
  const key = `${label}|${enabled}|${pulse}`;
  if (hudCache.wave !== key) {
    hudCache.wave = key;
    const b = $('btn-wave');
    b.textContent = label;
    b.disabled = !enabled;
    b.classList.toggle('primary', enabled);
    b.classList.toggle('pulse', pulse && !renderer.reduced);
  }
  if (hudCache.speed !== speed) {
    hudCache.speed = speed;
    $('btn-speed').textContent = `${speed}×`;
    $('btn-speed').classList.toggle('on', speed === 2);
  }
  if (hudCache.coinsForPanel !== game.coins) {
    hudCache.coinsForPanel = game.coins;
    refreshBuildButtons();
    if (ui.selected) renderInfo();
  }
}

function handleUiEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'waveStart':
        banner(e.boss ? 'Boss wave!' : `Wave ${e.number}`, e.boss);
        if (e.bonus > 0) toast(`Early bird bonus <b>+${e.bonus}</b> coins!`);
        break;
      case 'newBug': {
        const b = BUGS[e.bug];
        if (e.bug !== 'ant' || game.mapIndex === 0) toast(`New bug: <b>${b.name}</b>`, b.blurb, 3.5);
        break;
      }
      case 'boss': toast(`Boss: <b>${BUGS[e.bug].name}</b>`, BUGS[e.bug].blurb, 4); break;
      case 'bossSpawn': banner(BUGS[e.bug].name, true); break;
      case 'leak': bump('hud-baskets', 'hurt'); break;
      case 'shoo': case 'coin': bump('hud-coins'); break;
      case 'waveClear': if (game.wave < game.waves.length) toast(`Wave cleared! <b>+${e.bonus}</b> coins`); break;
      default:
    }
  }
}

// ------------------------------------------------------------ build / info panel

let buildButtons = {};

function buildPanelButtons() {
  const list = $('build-list');
  list.innerHTML = '';
  buildButtons = {};
  for (const t of DEFENDER_ORDER) {
    const d = DEFENDERS[t];
    const b = document.createElement('button');
    b.className = 'build-btn';
    b.dataset.type = t;
    b.innerHTML = `<kbd>${d.key}</kbd><canvas></canvas><span class="name">${d.name}</span><span class="cost"></span>`;
    b.addEventListener('click', () => chooseDefender(t));
    b.addEventListener('pointerenter', () => hint(t));
    b.addEventListener('focus', () => hint(t));
    b.addEventListener('pointerleave', () => hint(null));
    list.appendChild(b);
    buildButtons[t] = b;
    defenderIcon(b.querySelector('canvas'), t, 0, 56);
  }
  refreshBuildButtons();
}

function refreshBuildButtons() {
  if (!game) return;
  for (const t of DEFENDER_ORDER) {
    const b = buildButtons[t];
    if (!b) continue;
    const locked = !game.unlocked.has(t);
    const cost = buildCost(t);
    b.classList.toggle('locked', locked);
    b.classList.toggle('poor', !locked && game.coins < cost);
    b.classList.toggle('active', ui.placing === t);
    b.classList.toggle('fresh', !locked && DEFENDERS[t].unlock === game.mapIndex && game.mapIndex > 0 && !save.stars[game.map.id]);
    const html = locked ? `🔒 Map ${DEFENDERS[t].unlock + 1}` : `<i class="ico coin"></i>${cost}`;
    if (b.dataset.html !== html) { b.dataset.html = html; b.querySelector('.cost').innerHTML = html; }
    b.setAttribute('aria-label', `${DEFENDERS[t].name}, ${locked ? 'locked' : `${cost} coins`}`);
  }
}

function hint(type) {
  const el = $('build-hint');
  if (type) {
    const d = DEFENDERS[type];
    el.innerHTML = game.unlocked.has(type) ? `<b>${d.name}</b> · ${d.role}. ${d.blurb}` : `<b>${d.name}</b> unlocks when you reach map ${d.unlock + 1}.`;
    return;
  }
  if (ui.site) el.textContent = 'Pick a plant for the glowing tile.';
  else if (ui.placing) el.textContent = `Tap grass to plant a ${DEFENDERS[ui.placing].name}. Esc to cancel.`;
  else el.textContent = 'Tap grass beside the path, then pick a plant. Tap a plant to upgrade it.';
}

function renderPanel() {
  const showInfo = !!ui.selected;
  $('info-panel').classList.toggle('hidden', !showInfo);
  $('build-panel').classList.toggle('hidden', showInfo);
  $('build-title').textContent = ui.site ? 'Plant here' : ui.placing ? `Planting: ${DEFENDERS[ui.placing].name}` : 'Plant a defender';
  refreshBuildButtons();
  hint(null);
  if (showInfo) renderInfo(true);
}

function statLine(type, tier, st) {
  const d = DEFENDERS[type];
  const parts = [];
  if (st.damage) parts.push(`Damage ${Math.round(st.damage)}${st.shots > 1 ? ` ×${st.shots}` : ''}`);
  if (st.range) parts.push(`Range ${st.range.toFixed(1)}`);
  if (st.cooldown) parts.push(`${(1 / st.cooldown).toFixed(1)} shots/s`);
  if (st.splash) parts.push(`Splash ${st.splash.toFixed(1)}`);
  if (st.slow) parts.push(`Slow ${Math.round(st.slow * 100)}% for ${st.puddle}s`);
  if (st.chain) parts.push(`Chains to ${st.chain} more`);
  if (st.income) parts.push(`+${st.income} coins every ${st.period}s of marching`);
  if (st.aura) parts.push(`+${Math.round(st.dmgBuff * 100)}% damage${st.rangeBuff ? `, +${Math.round(st.rangeBuff * 100)}% range` : ''}${st.rateBuff ? `, +${Math.round(st.rateBuff * 100)}% speed` : ''} nearby`);
  if (d.projectile) parts.push(d.air && d.ground ? 'Hits ground + air' : d.air ? 'Air only' : 'Ground only');
  return parts.map((p) => `<span>${p}</span>`).join('');
}

let infoKey = '';
function renderInfo(force = false) {
  const d = ui.selected;
  if (!d) return;
  const kind = DEFENDERS[d.type];
  const cost = upgradeCost(d.type, d.tier);
  const key = `${d.id}|${d.tier}|${d.targeting}|${game.coins >= (cost ?? Infinity)}|${game.sellValueOf(d)}|${d.aura.dmg}`;
  if (!force && key === infoKey) return;
  infoKey = key;
  defenderIcon($('info-icon'), d.type, d.tier, 64);
  const tierLabel = d.tier ? kind.tiers[d.tier].label : kind.name;
  $('info-name').textContent = tierLabel;
  $('info-role').textContent = `${kind.role} · ${'★'.repeat(d.tier)}${'☆'.repeat(2 - d.tier)}${d.aura.dmg ? ' · lantern-lit' : ''}`;
  $('info-stats').innerHTML = statLine(d.type, d.tier, game.statsOf(d));
  const seg = $('info-targeting');
  seg.classList.toggle('hidden', !kind.targeting);
  seg.innerHTML = '';
  for (const m of TARGETING) {
    const b = document.createElement('button');
    b.textContent = TARGETING_LABEL[m];
    b.className = d.targeting === m ? 'on' : '';
    b.setAttribute('aria-pressed', d.targeting === m);
    b.addEventListener('click', () => { game.setTargeting(d, m); sound.play('click'); renderInfo(true); });
    seg.appendChild(b);
  }
  const up = $('btn-upgrade');
  if (cost === null) { up.textContent = 'Fully grown ★★'; up.disabled = true; }
  else {
    up.innerHTML = `Upgrade <i class="ico coin"></i>${cost}`;
    up.disabled = game.coins < cost;
  }
  const value = game.sellValueOf(d);
  $('btn-sell').innerHTML = `Sell <i class="ico coin"></i>+${value}${d.fresh ? ' (full)' : ''}`;
  const next = kind.tiers[d.tier + 1];
  $('info-next').innerHTML = next ? `<b>Next: ${next.label}</b><br>${statLine(d.type, d.tier + 1, next).replace(/<\/?span>/g, ' ')}` : 'This plant is as mighty as it gets!';
}

function select(d) {
  ui.selected = d;
  ui.site = null;
  ui.placing = null;
  renderPanel();
}

function clearSelection() {
  ui.selected = null;
  ui.site = null;
  ui.placing = null;
  renderPanel();
}

function chooseDefender(type) {
  sound.unlock();
  if (!game || game.over) return;
  if (!game.unlocked.has(type)) {
    sound.play('nope');
    toast(`<b>${DEFENDERS[type].name}</b> unlocks at map ${DEFENDERS[type].unlock + 1}.`);
    return;
  }
  const site = ui.site || (ui.cursorOn && ui.cursor && game.canBuildAt(ui.cursor.x, ui.cursor.y) && !ui.placing ? ui.cursor : null);
  if (site) {
    plant(type, site);
    return;
  }
  ui.selected = null;
  ui.placing = ui.placing === type ? null : type;
  sound.play('click');
  renderPanel();
}

function plant(type, cell) {
  const cost = buildCost(type);
  if (game.coins < cost) {
    sound.play('nope');
    toast(`Need <b>${cost - game.coins}</b> more coins for a ${DEFENDERS[type].name}.`);
    return false;
  }
  const d = game.build(type, cell.x, cell.y);
  if (!d) { sound.play('nope'); return false; }
  ui.site = null;
  if (!(ui.shift && game.coins >= cost)) ui.placing = null;
  if (game.status === 'ready' && game.defenders.length === 1 && game.mapIndex === 0) toast('Nice! Press <b>Start wave</b> (Space) when ready.', 'Plant more while you wait: coins come from shooed bugs.', 4);
  renderPanel();
  return true;
}

function tap(cell) {
  sound.unlock();
  if (!game || mode !== 'play' || game.over) return;
  if (!cell) { clearSelection(); return; }
  if (ui.placing) {
    if (game.canBuildAt(cell.x, cell.y)) { plant(ui.placing, cell); return; }
    const d = game.defenderAt(cell.x, cell.y);
    if (d) { select(d); sound.play('click'); return; }
    sound.play('nope');
    return;
  }
  const d = game.defenderAt(cell.x, cell.y);
  if (d) {
    if (ui.selected === d) clearSelection(); else { select(d); sound.play('click'); }
    return;
  }
  if (game.canBuildAt(cell.x, cell.y)) {
    const same = ui.site && ui.site.x === cell.x && ui.site.y === cell.y;
    ui.selected = null;
    ui.site = same ? null : { x: cell.x, y: cell.y };
    sound.play('click');
    renderPanel();
    return;
  }
  clearSelection();
}

function doUpgrade() {
  const d = ui.selected;
  if (!d) return;
  if (!game.upgrade(d)) { sound.play('nope'); return; }
  renderInfo(true);
}

function doSell() {
  const d = ui.selected;
  if (!d) return;
  game.sell(d);
  clearSelection();
}

function callWave() {
  sound.unlock();
  if (!game || mode !== 'play') return;
  if (!game.startWave()) sound.play('nope');
}

// ------------------------------------------------------------ input

const canvas = $('game');
let down = null;
function eventCell(e) {
  const r = canvas.getBoundingClientRect();
  return renderer.cellAt(e.clientX - r.left, e.clientY - r.top);
}
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { ui.hover = eventCell(e); ui.cursorOn = false; }
});
canvas.addEventListener('pointerleave', () => { ui.hover = null; });
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  ui.shift = e.shiftKey;
  if (e.pointerType !== 'mouse') ui.hover = eventCell(e);
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || down.id !== e.pointerId) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved < 16) { ui.cursorOn = false; tap(eventCell(e)); }
  if (e.pointerType !== 'mouse') ui.hover = null;
});
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (mode === 'play') clearSelection(); });

function moveCursor(dxs, dys) {
  if (!ui.cursor) ui.cursor = ui.hover ? { ...ui.hover } : ui.selected ? { x: ui.selected.cx, y: ui.selected.cy } : { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
  else if (ui.cursorOn) {
    const t = renderer.view.transposed;
    const dx = t ? dys : dxs, dy = t ? dxs : dys;
    ui.cursor = { x: Math.max(0, Math.min(COLS - 1, ui.cursor.x + dx)), y: Math.max(0, Math.min(ROWS - 1, ui.cursor.y + dy)) };
  }
  ui.cursorOn = true;
  ui.hover = null;
}

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

addEventListener('keydown', (e) => {
  ui.shift = e.shiftKey;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (mode === 'play') {
    let handled = true;
    const typeByKey = DEFENDER_ORDER.find((t) => DEFENDERS[t].key === k);
    if (k === 'Escape') { if (ui.placing || ui.site || ui.selected) clearSelection(); else pause(); }
    else if (k === 'p' || k === 'P') pause();
    else if (typeByKey) chooseDefender(typeByKey);
    else if (ARROWS[k]) moveCursor(...ARROWS[k]);
    else if (k === 'Enter') { if (ui.cursorOn && ui.cursor) tap(ui.cursor); else if (!ui.cursor) moveCursor(0, 0); }
    else if (k === 'u' || k === 'U') doUpgrade();
    else if (k === 's' || k === 'S') doSell();
    else if (k === 't' || k === 'T') { if (ui.selected) { game.cycleTargeting(ui.selected); sound.play('click'); renderInfo(true); } }
    else if (k === ' ') callWave();
    else if (k === 'f' || k === 'F') toggleSpeed();
    else if (k === 'm' || k === 'M') toggleMute();
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  } else if (mode === 'paused') {
    if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); resume(); }
    else if (k === 'm' || k === 'M') toggleMute();
  } else if (mode === 'maps' && k === 'Escape') {
    toTitle();
  } else if (mode === 'title' && (k === 'Enter' || k === ' ') && document.activeElement === document.body) {
    e.preventDefault();
    $('btn-play').click();
  }
}, true);

addEventListener('keyup', (e) => { ui.shift = e.shiftKey; });

// Buttons act on pointer; keep keyboard focus off HUD buttons during play so
// Space and Enter drive the game instead of re-clicking the last button.
for (const el of document.querySelectorAll('#hud button, #panel')) {
  el.addEventListener('pointerup', () => requestAnimationFrame(() => document.activeElement?.blur?.()));
}

$('btn-play').addEventListener('click', () => { sound.unlock(); sound.play('click'); toMaps(); });
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => { sound.play('click'); toTitle(); });
$('btn-wave').addEventListener('click', callWave);
$('btn-speed').addEventListener('click', toggleSpeed);
$('btn-sound').addEventListener('click', toggleMute);
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startMap(game.mapIndex));
$('btn-quit').addEventListener('click', toMaps);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-music').addEventListener('click', toggleMusic);
$('btn-upgrade').addEventListener('click', doUpgrade);
$('btn-sell').addEventListener('click', doSell);
$('btn-close-info').addEventListener('click', clearSelection);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// Hide the pointer after 2 s without movement while playing; any movement
// brings it straight back.
let pointerIdle = 0, pointerHidden = false;
addEventListener('pointermove', () => { pointerIdle = 0; if (pointerHidden) setPointerHidden(false); });
function setPointerHidden(h) { pointerHidden = h; document.body.classList.toggle('no-cursor', h); }
function updatePointer(dt) {
  pointerIdle += dt;
  const hide = mode === 'play' && pointerIdle > 2;
  if (hide !== pointerHidden) setPointerHidden(hide);
}

// ------------------------------------------------------------ loop

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  updatePointer(dt);
  if (game) {
    const running = mode === 'play' || mode === 'title' || mode === 'maps';
    const sp = mode === 'play' ? speed : 1;
    if (running) {
      acc += dt * sp;
      let n = 0;
      while (acc >= STEP && n < 16) {
        if (bot) bot.update();
        game.step(STEP);
        acc -= STEP;
        n++;
      }
      if (n === 16) acc = 0;
    }
    const events = game.events;
    game.events = [];
    renderer.handleEvents(events);
    if (mode === 'play') {
      sound.handleEvents(events);
      handleUiEvents(events);
      if (ui.selected && !game.defenders.includes(ui.selected)) clearSelection();
      updateHud();
      if (game.over) {
        endTimer += dt;
        if (endTimer > (game.status === 'won' ? 1.2 : 1.6)) showResults();
      }
    } else if (running && game.over) {
      attractTimer += dt;
      if (attractTimer > 3) { attractTimer = 0; load(0, { attract: true }); }
    }
    renderer.update(mode === 'paused' ? 0 : dt * sp);
    const showCursor = mode === 'play' && ui.cursorOn && ui.cursor;
    const at = showCursor ? ui.cursor : ui.hover;
    renderer.draw({
      hover: mode === 'play' ? ui.hover : null,
      placing: mode === 'play' ? ui.placing : null,
      site: mode === 'play' ? ui.site : null,
      selected: mode === 'play' || mode === 'paused' ? ui.selected : null,
      cursor: showCursor ? ui.cursor : null,
      ghost: mode === 'play' && ui.placing && at ? { type: ui.placing, x: at.x, y: at.y } : null,
    });
  }
  requestAnimationFrame(frame);
}

updateSoundButtons();
if (location.protocol !== 'file:') {
  const mapParam = Number(params.get('map'));
  if (mapParam >= 1 && mapParam <= MAPS.length) startMap(mapParam - 1);
  else toTitle();
  requestAnimationFrame(frame);
}

// Handy for debugging and browser checks.
window.GG = { get game() { return game; }, get bot() { return bot; }, get mode() { return mode; }, get ui() { return ui; }, renderer, save, startMap, drawBug };
